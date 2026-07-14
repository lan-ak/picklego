/**
 * `launch` — build a whole campaign tree from one JSON spec.
 *
 * Order: campaign → ad set → upload media → creative → ad. Everything lands PAUSED, so a
 * half-built tree is harmless: it cannot deliver an impression or spend a cent.
 *
 * Failure handling is deliberately "report, don't roll back". Auto-rollback feels safer
 * but is strictly worse here — paused objects are already inert, while a reflexive
 * rollback would delete a video that took five minutes to upload and transcode. So on
 * failure we print exactly what exists and how to resume, and rollback stays opt-in.
 *
 * Idempotency has two layers, because Meta's ads endpoints have no idempotency key:
 *   1. the run ledger — what this runKey already created
 *   2. name reconciliation — what the *account* already contains under that name, which
 *      is the only way back from a write whose response we never saw
 */
import { basename, extname } from 'path';

import { bool, requireStr } from './args';
import { AD_FIELDS, buildAd } from './ads';
import { ADSET_FIELDS, buildAdSet } from './adsets';
import { buildCampaign, CAMPAIGN_FIELDS } from './campaigns';
import { Ctx } from './context';
import { buildCreative } from './creatives';
import { require_ } from './env';
import { CliError, ValidationError } from './errors';
import {
  assertResumable,
  createLedger,
  findStep,
  hashSpec,
  Ledger,
  listLedgers,
  loadLedger,
  recordStep,
  saveLedger,
  setLedgerPersistence,
  StepType,
} from './ledger';
import { debug, isJson, line, money, ok, table, warn } from './output';
import { AdSetSpec, AdSpec, EXAMPLE_SPEC, LaunchSpec, loadSpec } from './spec';
import { extractImageHash, waitForVideo } from './uploads';

export async function launch(ctx: Ctx): Promise<void> {
  const { client, config, args } = ctx;
  const spec = loadSpec(requireStr(args, 'spec'));
  const resuming = bool(args, 'resume');
  const adoptExisting = bool(args, 'adopt-existing');
  const specHash = hashSpec(spec);

  // Fail on missing config before creating anything, rather than three calls in.
  require_(config, 'appId');
  require_(config, 'objectStoreUrl');
  require_(config, 'pageId');
  await client.loadAccountMeta();

  // --validate cannot walk the whole tree: validate_only creates nothing and returns no
  // id, so there is no campaign for the ad set to reference. Rather than fake it, validate
  // what CAN be validated server-side (the campaign), build every other body locally to
  // catch shape errors, and say exactly what was and wasn't checked.
  if (client.options.validateOnly) return validateSpec(ctx, spec);

  // A dry run creates nothing, so it must record nothing — and it must not be blocked by a
  // ledger from a previous real run, because previewing an existing run is a legitimate
  // thing to want.
  const dryRun = client.options.dryRun;
  setLedgerPersistence(!dryRun);

  const existing = dryRun ? undefined : loadLedger(spec.runKey);
  let ledger: Ledger;

  if (existing && !resuming) {
    const done = existing.steps.length;
    throw new ValidationError(
      `Run "${spec.runKey}" already exists (${done} object(s) created, status: ${existing.status}).`,
      `Re-running it as-is would create duplicates. To continue it: --resume. ` +
        `To throw it away: npm run meta -- rollback --run-key ${spec.runKey}. ` +
        `To start something genuinely new: change runKey in the spec.`,
    );
  }

  if (existing) {
    assertResumable(existing, specHash);
    ledger = existing;
    ledger.status = 'running';
    delete ledger.failure;
    saveLedger(ledger);
    line(`Resuming "${spec.runKey}" — ${ledger.steps.length} object(s) already created.\n`);
  } else {
    ledger = createLedger(spec.runKey, specHash);
    saveLedger(ledger);
  }

  try {
    const campaignId = await ensureCampaign(ctx, spec, ledger, adoptExisting);
    for (const [i, adset] of spec.adsets.entries()) {
      const adsetId = await ensureAdSet(ctx, spec, adset, i, campaignId, ledger, adoptExisting);
      for (const [j, ad] of adset.ads.entries()) {
        await ensureAd(ctx, ad, `${i}.${j}`, adsetId, ledger, adoptExisting);
      }
    }

    ledger.status = 'complete';
    saveLedger(ledger);
    await reportSuccess(ctx, spec, ledger, campaignId);
  } catch (error) {
    ledger.status = 'failed';
    ledger.failure = {
      step: `${ledger.steps.length + 1}`,
      error: error instanceof CliError ? error.payload : String(error),
    };
    saveLedger(ledger);

    if (bool(args, 'rollback-on-failure')) {
      line('\nRolling back (--rollback-on-failure)...');
      await rollbackLedger(ctx, ledger);
    }
    // Attach what DID get created, so the failure is actionable rather than a dead end.
    throw Object.assign(error as Error, { partial: partialSummary(ledger, spec) });
  }
}

/**
 * The --validate path.
 *
 * Meta's validate_only genuinely checks the campaign (objective, SKAN flags,
 * promoted_object, budget floor) against the real account and creates nothing. Its
 * children cannot be checked the same way, because each references its parent's id and
 * no parent exists. So: server-validate the campaign, locally build the rest, and be
 * explicit about which is which. Overstating what was verified is worse than not checking.
 */
async function validateSpec(ctx: Ctx, spec: LaunchSpec): Promise<void> {
  const campaignParams = buildCampaign(spec.campaign, ctx.config);
  await ctx.client.post(`${ctx.config.adAccountId}/campaigns`, campaignParams);

  // Pure builders — these catch a bad optimization goal, a missing thumbnail, an
  // inclusion audience on a SKAN ad set, and so on, without any network at all.
  const built: Array<{ type: string; name: string }> = [];
  for (const adset of spec.adsets) {
    buildAdSet(
      {
        name: adset.name,
        campaignId: '0',
        dailyBudgetCents: adset.dailyBudgetCents,
        lifetimeBudgetCents: adset.lifetimeBudgetCents,
        optimizationGoal: adset.optimizationGoal,
        billingEvent: adset.billingEvent,
        bidStrategy: adset.bidStrategy,
        bidAmountCents: adset.bidAmountCents,
        customEventType: adset.customEventType,
        customEventStr: adset.customEventStr,
        skadnetwork: adset.skadnetwork,
        startTime: adset.startTime,
        endTime: adset.endTime,
        targeting: adset.targeting,
      },
      ctx.config,
    );
    built.push({ type: 'adset', name: adset.name });

    for (const ad of adset.ads) {
      buildCreative(
        {
          name: ad.creative.name ?? ad.name,
          primaryText: ad.creative.primaryText,
          headline: ad.creative.headline,
          description: ad.creative.description,
          cta: ad.creative.cta,
          // Media is not uploaded during a validate, so stand in a placeholder of the
          // right shape — we are checking the creative body, not the asset.
          imageHash: ad.creative.media.type === 'image' ? (ad.creative.media.hash ?? 'validate') : undefined,
          videoId: ad.creative.media.type === 'video' ? (ad.creative.media.id ?? 'validate') : undefined,
          thumbnailHash: ad.creative.media.thumbnailHash,
          pageId: ad.creative.pageId,
        },
        ctx.config,
      );
      built.push({ type: 'ad', name: ad.name });
    }
  }

  ok(
    {
      valid: true,
      campaignValidatedByMeta: true,
      builtLocally: built,
      note: 'Nothing was created.',
    },
    () => {
      line('');
      line(`✓ campaign body validated by Meta against ${ctx.config.adAccountId} — accepted.`);
      line(`✓ ${built.filter((b) => b.type === 'adset').length} ad set + ${built.filter((b) => b.type === 'ad').length} creative body/bodies built and checked locally.`);
      line('');
      line('  Note: ad sets, creatives and ads cannot be server-validated in isolation —');
      line('  each references its parent\'s id, and --validate creates no parent. They were');
      line('  checked against the SKAdNetwork rules locally, not by Meta.');
      line('');
      line('  Nothing was created. To build it for real (everything lands PAUSED):');
      line(`    npm run meta -- launch --spec <file>`);
      line('');
    },
  );
}

// ── Steps ───────────────────────────────────────────────────────────────────

async function ensureCampaign(
  ctx: Ctx,
  spec: LaunchSpec,
  ledger: Ledger,
  adopt: boolean,
): Promise<string> {
  const cached = findStep(ledger, 'campaign', 'campaign');
  if (cached) {
    debug(`campaign already created: ${cached.id}`);
    return cached.id;
  }

  const existing = await findByName(ctx, `${ctx.config.adAccountId}/campaigns`, CAMPAIGN_FIELDS, spec.campaign.name);
  if (existing) {
    return adoptOrFail(ctx, ledger, 'campaign', 'campaign', existing, adopt, 'campaign');
  }

  const params = buildCampaign(spec.campaign, ctx.config);
  const res = await ctx.client.post(`${ctx.config.adAccountId}/campaigns`, params);
  const id = String(res.id);
  recordStep(ledger, { type: 'campaign', key: 'campaign', id, name: spec.campaign.name });
  line(`✓ campaign  ${id}  "${spec.campaign.name}"  PAUSED`);

  await assertAdvantagePlus(ctx, id, spec);
  return id;
}

/**
 * Advantage+ is derived, not declared: you only get it when campaign budget, advantage
 * audience and unrestricted placements are ALL on. Silently falling back to a manual
 * campaign is easy to do and invisible, so read the state back and say which we got.
 */
async function assertAdvantagePlus(ctx: Ctx, campaignId: string, spec: LaunchSpec): Promise<void> {
  if (ctx.client.options.dryRun || ctx.client.options.validateOnly) return;
  const wanted =
    (spec.campaign.dailyBudgetCents ?? spec.campaign.lifetimeBudgetCents) !== undefined &&
    spec.adsets.every(
      (a) => a.targeting?.advantageAudience !== false && !a.targeting?.publisherPlatforms?.length,
    );
  if (!wanted) return;

  const res = (await ctx.client.get(campaignId, { fields: 'advantage_state_info' })) as Record<string, any>;

  // The field is not returned at all on this API version. Absence is NOT evidence that
  // the campaign failed to qualify — warning on it would fire every single launch, and a
  // warning that always cries wolf teaches people to ignore warnings. Only speak up when
  // Meta actually tells us the state, and it is a bad one.
  if (res.advantage_state_info === undefined) {
    debug('advantage_state_info not returned by the API — cannot confirm Advantage+ status either way');
    return;
  }

  const state = res.advantage_state_info?.advantage_state;
  if (state === 'ADVANTAGE_PLUS_APP') {
    debug('campaign qualifies as Advantage+ (ADVANTAGE_PLUS_APP)');
  } else {
    warn(
      `This campaign did NOT qualify as Advantage+ (advantage_state: ${state}). It will run as a manual ` +
        `campaign. Check that the budget is at the campaign level, advantageAudience is on, and no ` +
        `publisherPlatforms are named.`,
    );
  }
}

async function ensureAdSet(
  ctx: Ctx,
  spec: LaunchSpec,
  adset: AdSetSpec,
  index: number,
  campaignId: string,
  ledger: Ledger,
  adopt: boolean,
): Promise<string> {
  const key = `adset.${index}`;
  const cached = findStep(ledger, 'adset', key);
  if (cached) {
    debug(`ad set already created: ${cached.id}`);
    return cached.id;
  }

  const existing = await findByName(ctx, `${campaignId}/adsets`, ADSET_FIELDS, adset.name);
  if (existing) return adoptOrFail(ctx, ledger, 'adset', key, existing, adopt, 'ad set');

  const params = buildAdSet(
    {
      name: adset.name,
      campaignId,
      dailyBudgetCents: adset.dailyBudgetCents,
      lifetimeBudgetCents: adset.lifetimeBudgetCents,
      optimizationGoal: adset.optimizationGoal,
      billingEvent: adset.billingEvent,
      bidStrategy: adset.bidStrategy,
      bidAmountCents: adset.bidAmountCents,
      customEventType: adset.customEventType,
      customEventStr: adset.customEventStr,
      skadnetwork: adset.skadnetwork,
      startTime: adset.startTime,
      endTime: adset.endTime,
      targeting: adset.targeting,
    },
    ctx.config,
  );

  const res = await ctx.client.post(`${ctx.config.adAccountId}/adsets`, params);
  const id = String(res.id);
  recordStep(ledger, { type: 'adset', key, id, name: adset.name });
  line(`✓ ad set    ${id}  "${adset.name}"  PAUSED`);
  return id;
}

async function ensureAd(
  ctx: Ctx,
  ad: AdSpec,
  key: string,
  adsetId: string,
  ledger: Ledger,
  adopt: boolean,
): Promise<string> {
  const creativeId = await ensureCreative(ctx, ad, key, ledger);

  const adKey = `ad.${key}`;
  const cached = findStep(ledger, 'ad', adKey);
  if (cached) return cached.id;

  const existing = await findByName(ctx, `${adsetId}/ads`, AD_FIELDS, ad.name);
  if (existing) return adoptOrFail(ctx, ledger, 'ad', adKey, existing, adopt, 'ad');

  const res = await ctx.client.post(
    `${ctx.config.adAccountId}/ads`,
    buildAd({ name: ad.name, adsetId, creativeId }),
  );
  const id = String(res.id);
  recordStep(ledger, { type: 'ad', key: adKey, id, name: ad.name });
  line(`✓ ad        ${id}  "${ad.name}"  PAUSED`);
  return id;
}

async function ensureCreative(ctx: Ctx, ad: AdSpec, key: string, ledger: Ledger): Promise<string> {
  const creativeKey = `creative.${key}`;
  const cached = findStep(ledger, 'creative', creativeKey);
  if (cached) return cached.id;

  const media = ad.creative.media;
  let imageHash = media.hash;
  let videoId = media.id;
  let thumbnailHash = media.thumbnailHash;

  // Media upload is recorded in the ledger too — re-uploading a transcoded video on every
  // resume would be minutes of wasted wall-clock.
  if (media.type === 'image' && !imageHash && media.path) {
    imageHash = await uploadImageStep(ctx, media.path, `image.${key}`, ledger);
  }
  if (media.type === 'video') {
    if (!videoId && media.path) {
      videoId = await uploadVideoStep(ctx, media.path, `video.${key}`, ledger);
    }
    if (!thumbnailHash && media.thumbnailPath) {
      thumbnailHash = await uploadImageStep(ctx, media.thumbnailPath, `thumb.${key}`, ledger);
    }
  }

  const params = buildCreative(
    {
      name: ad.creative.name ?? `${ad.name} — creative`,
      primaryText: ad.creative.primaryText,
      headline: ad.creative.headline,
      description: ad.creative.description,
      cta: ad.creative.cta,
      imageHash,
      videoId,
      thumbnailHash,
      pageId: ad.creative.pageId,
      instagramActorId: ad.creative.instagramActorId,
    },
    ctx.config,
  );

  const res = await ctx.client.post(`${ctx.config.adAccountId}/adcreatives`, params);
  const id = String(res.id);
  recordStep(ledger, { type: 'creative', key: creativeKey, id, name: String(params.name) });
  line(`✓ creative  ${id}  "${params.name}"`);
  return id;
}

async function uploadImageStep(ctx: Ctx, path: string, key: string, ledger: Ledger): Promise<string> {
  const cached = findStep(ledger, 'image', key);
  if (cached) return cached.id;

  const ext = extname(path).toLowerCase();
  const type =
    ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : 'image/jpeg';

  const res = await ctx.client.upload(`${ctx.config.adAccountId}/adimages`, [
    { field: basename(path), path, contentType: type },
  ]);
  const hash = extractImageHash(res, path);
  // The ledger keys media by hash, not id — it is what the creative actually references.
  recordStep(ledger, { type: 'image', key, id: hash, name: basename(path) });
  line(`✓ image     ${hash}  ${basename(path)}`);
  return hash;
}

async function uploadVideoStep(ctx: Ctx, path: string, key: string, ledger: Ledger): Promise<string> {
  const cached = findStep(ledger, 'video', key);
  if (cached) return cached.id;

  const ext = extname(path).toLowerCase();
  const type = ext === '.mov' ? 'video/quicktime' : 'video/mp4';

  const res = await ctx.client.upload(
    `${ctx.config.adAccountId}/advideos`,
    [{ field: 'source', path, contentType: type }],
    { title: basename(path), name: basename(path) },
  );
  const id = String(res.id);
  recordStep(ledger, { type: 'video', key, id, name: basename(path) });
  line(`✓ video     ${id}  ${basename(path)}  (transcoding…)`);

  // A creative built against a still-processing video fails intermittently. Always wait.
  if (id !== 'dry-run') await waitForVideo(ctx, id);
  return id;
}

// ── Reconciliation ──────────────────────────────────────────────────────────

/**
 * The recovery path for a write whose response we never saw: the object exists in the
 * account, but not in our ledger. Names are treated as unique within their parent.
 */
async function findByName(
  ctx: Ctx,
  path: string,
  fields: string,
  name: string,
): Promise<{ id: string; name: string } | undefined> {
  if (ctx.client.options.dryRun) return undefined;
  const rows = (await ctx.client.getAll(path, { fields })) as Array<Record<string, any>>;
  const match = rows.find((r) => r.name === name);
  return match ? { id: String(match.id), name: String(match.name) } : undefined;
}

function adoptOrFail(
  ctx: Ctx,
  ledger: Ledger,
  type: StepType,
  key: string,
  existing: { id: string; name: string },
  adopt: boolean,
  label: string,
): string {
  if (!adopt) {
    throw new ValidationError(
      `A ${label} named "${existing.name}" already exists (${existing.id}), but this run did not create it.`,
      `Either it is left over from an interrupted run — in which case re-run with --adopt-existing to take it ` +
        `over — or the name collides with something unrelated, in which case rename it in the spec. ` +
        `Creating a second ${label} with the same name would be a silent duplicate.`,
    );
  }
  recordStep(ledger, { type, key, id: existing.id, name: existing.name });
  line(`↳ adopted ${label} ${existing.id} "${existing.name}" (already existed)`);
  return existing.id;
}

// ── Reporting ───────────────────────────────────────────────────────────────

function partialSummary(ledger: Ledger, spec: LaunchSpec): unknown {
  return {
    runKey: spec.runKey,
    created: ledger.steps.map((s) => ({ type: s.type, id: s.id, name: s.name })),
    resume: `npm run meta -- launch --spec <file> --resume`,
    rollback: `npm run meta -- rollback --run-key ${spec.runKey}`,
    note: 'Everything created is PAUSED. Nothing is spending.',
  };
}

async function reportSuccess(ctx: Ctx, spec: LaunchSpec, ledger: Ledger, campaignId: string): Promise<void> {
  const dailyCents =
    spec.campaign.dailyBudgetCents ??
    spec.adsets.reduce((sum, a) => sum + (a.dailyBudgetCents ?? 0), 0);

  ok(
    {
      runKey: spec.runKey,
      campaignId,
      created: ledger.steps.map((s) => ({ type: s.type, id: s.id, name: s.name })),
      status: 'PAUSED',
      dailyBudgetCents: dailyCents,
      activate: `npm run meta -- campaign resume ${campaignId}`,
    },
    () => {
      line('');
      line(`Launched "${spec.campaign.name}" — everything is PAUSED.`);
      line('');
      line(`  Nothing is spending. When you have reviewed it, activate with:`);
      line(`    npm run meta -- campaign resume ${campaignId}`);
      if (dailyCents) line(`\n  Once active it will spend up to ${money(dailyCents)}/day.`);
      const ads = ledger.steps.filter((s) => s.type === 'ad');
      if (ads.length) line(`\n  Preview an ad first:  npm run meta -- ad preview ${ads[0].id}`);
      line('');
    },
  );
}

// ── Sibling commands ────────────────────────────────────────────────────────

export async function rollback(ctx: Ctx): Promise<void> {
  const runKey = requireStr(ctx.args, 'run-key');
  const ledger = loadLedger(runKey);
  if (!ledger) throw new ValidationError(`No run named "${runKey}". List them with: npm run meta -- runs`);

  const deleted = await rollbackLedger(ctx, ledger);
  ok({ runKey, deleted }, () => line(`\n✓ rolled back "${runKey}" — ${deleted.length} object(s) deleted`));
}

/** Reverse order: ads before ad sets before the campaign, or the deletes conflict. */
async function rollbackLedger(ctx: Ctx, ledger: Ledger): Promise<string[]> {
  const order: StepType[] = ['ad', 'creative', 'adset', 'campaign'];
  const deleted: string[] = [];

  for (const type of order) {
    for (const step of ledger.steps.filter((s) => s.type === type)) {
      try {
        await ctx.client.delete(step.id);
        deleted.push(step.id);
        line(`  deleted ${type} ${step.id}`);
      } catch (err) {
        // A already-deleted object must not abort the rest of the cleanup.
        warn(`could not delete ${type} ${step.id}: ${(err as Error).message}`);
      }
    }
  }

  // Uploaded images/videos are intentionally left alone — they are account-level assets,
  // cost nothing to keep, and Meta content-dedupes them anyway.
  ledger.steps = ledger.steps.filter((s) => s.type === 'image' || s.type === 'video');
  ledger.status = 'rolled_back';
  saveLedger(ledger);
  return deleted;
}

export async function runs(ctx: Ctx): Promise<void> {
  void ctx;
  const all = listLedgers();
  ok(all, () => {
    if (!all.length) return line('No launch runs yet.');
    table(
      ['RUN KEY', 'STATUS', 'OBJECTS', 'STARTED'],
      all.map((l) => [l.runKey, l.status, String(l.steps.length), l.startedAt.slice(0, 16)]),
    );
  });
}

export async function specExample(ctx: Ctx): Promise<void> {
  void ctx;
  if (isJson()) return ok(EXAMPLE_SPEC);
  console.log(JSON.stringify(EXAMPLE_SPEC, null, 2));
}

export async function specValidate(ctx: Ctx): Promise<void> {
  const file = requireStr(ctx.args, 'spec');
  const spec = loadSpec(file);
  const adCount = spec.adsets.reduce((n, a) => n + a.ads.length, 0);
  ok({ valid: true, runKey: spec.runKey, adsets: spec.adsets.length, ads: adCount }, () => {
    line(`✓ ${file} is valid`);
    line(`  runKey "${spec.runKey}" · ${spec.adsets.length} ad set(s) · ${adCount} ad(s)`);
    line(`\n  Next: npm run meta -- launch --spec ${file} --validate   (server-side check, creates nothing)`);
  });
}
