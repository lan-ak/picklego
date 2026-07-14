/**
 * Ad sets. This is where the SKAdNetwork rules bite.
 *
 * Hard constraints on an iOS 14+ (SKAN) app-install ad set, all enforced below because
 * the API's errors for them are cryptic:
 *   · billing_event must be IMPRESSIONS — CPA billing is blocked (subcode 2490217), so
 *     billing_event and optimization_goal can never BOTH be APP_INSTALLS
 *   · optimization_goal LINK_CLICKS is unsupported (2490256)
 *   · bid_strategy TARGET_COST is unavailable (2490216)
 *   · user_os must specify iOS 14+ (2490249)
 *   · at most 5 ad sets per campaign, and they must all share one optimization goal
 *   · app-activity Custom Audiences cannot be used for INCLUSION targeting (1870125)
 *
 * Advantage+ is not a flag you set; it is derived. You get it when campaign-level budget
 * + advantage_audience + unrestricted placements are all true at once. So `targeting`
 * omits publisher_platforms by default — naming placements silently opts you OUT.
 */
import { int, list, requireStr, str } from './args';
import { Params } from './client';
import { requireId } from './campaigns';
import { Ctx } from './context';
import { Config } from './env';
import { ValidationError } from './errors';
import { line, money, ok, table, warn } from './output';
import { promotedObject } from './promoted';

export const ADSET_FIELDS =
  'name,status,effective_status,daily_budget,lifetime_budget,optimization_goal,billing_event,' +
  'bid_strategy,bid_amount,is_skadnetwork_attribution,promoted_object,targeting,campaign_id,campaign{name}';

const APP_OPTIMIZATION_GOALS = new Set([
  'APP_INSTALLS',
  'OFFSITE_CONVERSIONS',
  'VALUE',
  'APP_INSTALLS_AND_OFFSITE_CONVERSIONS',
]);

export interface TargetingInput {
  countries?: string[];
  ageMin?: number;
  ageMax?: number;
  genders?: 'all' | 'male' | 'female';
  interestIds?: string[];
  includeAudienceIds?: string[];
  excludeAudienceIds?: string[];
  /** Naming these opts OUT of Advantage+ placements. Leave undefined for Advantage+. */
  publisherPlatforms?: string[];
  advantageAudience?: boolean;
  /** Deep-merged last. Escape hatch for anything this builder doesn't model. */
  raw?: Record<string, unknown>;
}

export interface AdSetInput {
  name: string;
  campaignId: string;
  dailyBudgetCents?: number;
  lifetimeBudgetCents?: number;
  optimizationGoal?: string;
  billingEvent?: string;
  bidStrategy?: string;
  bidAmountCents?: number;
  customEventType?: string;
  customEventStr?: string;
  skadnetwork?: boolean;
  startTime?: string;
  endTime?: string;
  targeting?: TargetingInput;
}

/** Pure. No network. Exercised by `selftest`. */
export function buildTargeting(input: TargetingInput = {}, skadnetwork = true): Record<string, unknown> {
  const targeting: Record<string, unknown> = {
    geo_locations: { countries: input.countries ?? ['US'] },
    device_platforms: ['mobile'],
  };

  // SKAN demands iOS 14+ explicitly (subcode 2490249). This exact string is the format
  // Meta expects — not "iOS", not "14.0".
  if (skadnetwork) {
    targeting.user_os = ['iOS_ver_14.0_and_above'];
  }

  const advantageAudience = input.advantageAudience !== false;

  if (input.ageMin !== undefined) targeting.age_min = input.ageMin;

  // Advantage+ audience treats your demographics as *suggestions* and will go beyond
  // them. An upper age bound is the one thing it refuses outright (subcode 1870189),
  // because "don't show this to anyone over 55" is a hard constraint, not a hint.
  if (input.ageMax !== undefined) {
    if (advantageAudience) {
      warn(
        `Dropping ageMax ${input.ageMax}: Advantage+ audience does not accept an upper age limit — it treats ` +
          `demographics as suggestions and expands past them. To enforce a hard age ceiling, set ` +
          `targeting.advantageAudience: false (which forfeits Advantage+ status).`,
      );
    } else {
      targeting.age_max = input.ageMax;
    }
  }

  if (input.genders && input.genders !== 'all') {
    targeting.genders = [input.genders === 'male' ? 1 : 2];
  }
  if (input.interestIds?.length) {
    targeting.flexible_spec = [{ interests: input.interestIds.map((id) => ({ id })) }];
  }

  if (input.includeAudienceIds?.length) {
    if (skadnetwork) {
      throw new ValidationError(
        'App-activity Custom Audiences cannot be used for inclusion targeting on a SKAdNetwork campaign (subcode 1870125).',
        'Either target broadly (recommended for iOS installs), seed a Lookalike from this audience and target ' +
          'that instead, or build a non-SKAN campaign with --no-skan.',
      );
    }
    targeting.custom_audiences = input.includeAudienceIds.map((id) => ({ id }));
  }
  if (input.excludeAudienceIds?.length) {
    targeting.excluded_custom_audiences = input.excludeAudienceIds.map((id) => ({ id }));
  }

  // Omitting publisher_platforms IS Advantage+ placements. Setting it opts out.
  if (input.publisherPlatforms?.length) {
    targeting.publisher_platforms = input.publisherPlatforms;
  }

  if (advantageAudience) {
    targeting.targeting_automation = { advantage_audience: 1 };
  }

  return input.raw ? deepMerge(targeting, input.raw) : targeting;
}

/** Pure. No network. Exercised by `selftest`. */
export function buildAdSet(input: AdSetInput, config: Config): Params {
  const skan = input.skadnetwork !== false;
  const goal = input.optimizationGoal ?? 'APP_INSTALLS';
  const billing = input.billingEvent ?? 'IMPRESSIONS';

  if (!APP_OPTIMIZATION_GOALS.has(goal)) {
    throw new ValidationError(
      `optimization_goal "${goal}" is not valid for an app-install ad set.`,
      `Valid: ${[...APP_OPTIMIZATION_GOALS].join(', ')}. Note LINK_CLICKS is rejected on iOS 14+ (subcode 2490256).`,
    );
  }
  if (skan && goal === 'APP_INSTALLS' && billing === 'APP_INSTALLS') {
    throw new ValidationError(
      'billing_event and optimization_goal cannot both be APP_INSTALLS — CPA billing is blocked on SKAdNetwork (subcode 2490217).',
      'Use billingEvent IMPRESSIONS.',
    );
  }
  if (skan && input.bidStrategy === 'TARGET_COST') {
    throw new ValidationError(
      'bid_strategy TARGET_COST is unavailable on SKAdNetwork campaigns (subcode 2490216).',
      'Use LOWEST_COST_WITHOUT_CAP.',
    );
  }

  const capped = input.bidStrategy && input.bidStrategy !== 'LOWEST_COST_WITHOUT_CAP';
  if (capped && input.bidAmountCents === undefined) {
    throw new ValidationError(
      `bid_strategy ${input.bidStrategy} requires a bid amount.`,
      'Pass --bid-amount <cents>, or use LOWEST_COST_WITHOUT_CAP (which must have no bid amount).',
    );
  }
  if (!capped && input.bidAmountCents !== undefined) {
    throw new ValidationError(
      'bid_amount must be absent when bid_strategy is LOWEST_COST_WITHOUT_CAP.',
      'Drop --bid-amount, or choose a capped strategy such as COST_CAP.',
    );
  }

  const params: Params = {
    name: input.name,
    campaign_id: input.campaignId,
    optimization_goal: goal,
    billing_event: billing,
    destination_type: 'APP',
    promoted_object: promotedObject(config, input.customEventType, input.customEventStr),
    targeting: buildTargeting(input.targeting, skan),
    // status is forced to PAUSED by the client.
  };

  if (skan) params.is_skadnetwork_attribution = true;
  if (input.dailyBudgetCents !== undefined) params.daily_budget = input.dailyBudgetCents;
  if (input.lifetimeBudgetCents !== undefined) params.lifetime_budget = input.lifetimeBudgetCents;
  if (input.bidStrategy) params.bid_strategy = input.bidStrategy;
  if (input.bidAmountCents !== undefined) params.bid_amount = input.bidAmountCents;
  if (input.startTime) params.start_time = input.startTime;
  if (input.endTime) params.end_time = input.endTime;

  // An in-app-event goal without an event to optimize for silently optimizes for nothing.
  if (goal === 'OFFSITE_CONVERSIONS' && !input.customEventType) {
    throw new ValidationError(
      'optimization_goal OFFSITE_CONVERSIONS needs the app event to optimize for.',
      'Pass --custom-event-type PURCHASE (or COMPLETE_REGISTRATION, etc). Without it Meta has no conversion to target.',
    );
  }

  return params;
}

export async function listAdSets(ctx: Ctx): Promise<void> {
  const { client, config, args } = ctx;
  const campaign = str(args, 'campaign');
  const path = campaign ? `${campaign}/adsets` : `${config.adAccountId}/adsets`;
  const rows = (await client.getAll(path, { fields: ADSET_FIELDS })) as Array<Record<string, any>>;

  ok(rows, () => {
    if (!rows.length) return line('No ad sets.');
    table(
      ['ID', 'STATUS', 'BUDGET', 'GOAL', 'NAME'],
      rows.map((a) => [
        String(a.id),
        String(a.effective_status ?? a.status),
        a.daily_budget ? `${money(a.daily_budget)}/day` : '—',
        String(a.optimization_goal ?? ''),
        String(a.name),
      ]),
    );
    line(`\n${rows.length} ad set(s)`);
  });
}

export async function createAdSet(ctx: Ctx): Promise<void> {
  const { client, config, args } = ctx;
  await client.loadAccountMeta();

  const campaignId = requireStr(args, 'campaign');
  await assertSkanAdSetRoom(ctx, campaignId);

  const params = buildAdSet(
    {
      name: requireStr(args, 'name'),
      campaignId,
      dailyBudgetCents: int(args, 'daily-budget'),
      lifetimeBudgetCents: int(args, 'lifetime-budget'),
      optimizationGoal: str(args, 'optimization-goal'),
      billingEvent: str(args, 'billing-event'),
      bidStrategy: str(args, 'bid-strategy'),
      bidAmountCents: int(args, 'bid-amount'),
      customEventType: str(args, 'custom-event-type'),
      customEventStr: str(args, 'custom-event-str'),
      skadnetwork: !(args.flags['no-skan'] === true),
      startTime: str(args, 'start-time'),
      endTime: str(args, 'end-time'),
      targeting: {
        countries: list(args, 'countries'),
        ageMin: int(args, 'age-min'),
        ageMax: int(args, 'age-max'),
        interestIds: list(args, 'interests'),
        includeAudienceIds: list(args, 'include-audience'),
        excludeAudienceIds: list(args, 'exclude-audience'),
        publisherPlatforms: list(args, 'placements'),
      },
    },
    config,
  );

  const res = await client.post(`${config.adAccountId}/adsets`, params);
  ok({ id: res.id, status: 'PAUSED', ...params }, () => {
    line(`✓ ad set ${res.id} created — PAUSED`);
    line(`  ${params.name}`);
    if (params.daily_budget) line(`  budget: ${money(params.daily_budget)}/day when activated`);
  });
}

/**
 * SKAN allows at most 5 ad sets per campaign, and every ad set in a SKAN campaign must
 * share the same optimization goal. Both produce opaque errors; check first.
 */
async function assertSkanAdSetRoom(ctx: Ctx, campaignId: string): Promise<void> {
  const existing = (await ctx.client.getAll(`${campaignId}/adsets`, {
    fields: 'name,optimization_goal',
  })) as Array<Record<string, any>>;

  if (existing.length >= 5) {
    throw new ValidationError(
      `Campaign ${campaignId} already has ${existing.length} ad sets. SKAdNetwork allows at most 5 (subcode 2490238).`,
      'Delete an unused ad set, or create a new campaign.',
    );
  }

  const goal = str(ctx.args, 'optimization-goal') ?? 'APP_INSTALLS';
  const mismatch = existing.find((a) => a.optimization_goal && a.optimization_goal !== goal);
  if (mismatch) {
    throw new ValidationError(
      `Every ad set in a SKAdNetwork campaign must share one optimization goal (subcode 2490208). ` +
        `Campaign ${campaignId} already uses ${mismatch.optimization_goal}, but this one is ${goal}.`,
      `Either use --optimization-goal ${mismatch.optimization_goal}, or put this ad set in a new campaign.`,
    );
  }
}

export async function updateAdSet(ctx: Ctx): Promise<void> {
  const { client, args, rest } = ctx;
  const id = requireId(rest, 'adset update <id>');
  await client.loadAccountMeta();

  const params: Params = {};
  const name = str(args, 'name');
  const daily = int(args, 'daily-budget');
  const bidAmount = int(args, 'bid-amount');
  if (name) params.name = name;
  if (daily !== undefined) params.daily_budget = daily;
  if (bidAmount !== undefined) params.bid_amount = bidAmount;

  if (!Object.keys(params).length) {
    throw new ValidationError('Nothing to update. Pass --name, --daily-budget or --bid-amount.');
  }

  // A big budget swing on a live ad set throws it back into the learning phase and
  // wastes the spend that got it out. Warn rather than block — sometimes it's intended.
  if (daily !== undefined) {
    const current = (await client.get(id, { fields: 'daily_budget,effective_status' })) as Record<string, any>;
    const before = Number(current.daily_budget ?? 0);
    if (before > 0 && current.effective_status === 'ACTIVE') {
      const swing = Math.abs(daily - before) / before;
      if (swing > 0.2) {
        warn(
          `This changes a LIVE ad set's budget by ${(swing * 100).toFixed(0)}% ` +
            `(${money(before)} → ${money(daily)}). Changes over ~20% reset the learning phase. ` +
            `Consider stepping it, or duplicating the ad set instead.`,
        );
      }
    }
  }

  await client.post(id, params);
  ok({ id, updated: params }, () => line(`✓ ad set ${id} updated`));
}

export async function pauseAdSet(ctx: Ctx): Promise<void> {
  const id = requireId(ctx.rest, 'adset pause <id>');
  await ctx.client.post(id, { status: 'PAUSED' });
  ok({ id, status: 'PAUSED' }, () => line(`✓ ad set ${id} paused — it will stop spending`));
}

export async function resumeAdSet(ctx: Ctx): Promise<void> {
  const { client } = ctx;
  const id = requireId(ctx.rest, 'adset resume <id>');

  // Account-wide headroom is asserted inside client.post, which also covers a CBO ad set
  // (no budget of its own — the campaign's is what starts spending) and a raw graph POST.
  const adset = (await client.get(id, { fields: 'name,daily_budget' })) as Record<string, any>;
  const daily = Number(adset.daily_budget ?? 0);

  await client.post(id, { status: 'ACTIVE' });
  ok({ id, status: 'ACTIVE', dailyBudget: daily }, () => {
    line(`✓ ad set ${id} is now ACTIVE — "${adset.name}"`);
    if (daily > 0) line(`  Now spending up to ${money(daily)}/day.`);
    line('  Note: it only delivers if its parent campaign is also ACTIVE.');
  });
}

/** Meta's /copies endpoint. Forced to land PAUSED. The right way to test a budget change. */
export async function duplicateAdSet(ctx: Ctx): Promise<void> {
  const { client, args, rest } = ctx;
  const id = requireId(rest, 'adset duplicate <id>');
  await client.loadAccountMeta();

  const params: Params = { status_option: 'PAUSED', deep_copy: true };
  const campaign = str(args, 'campaign');
  if (campaign) params.campaign_id = campaign;

  const res = await client.post(`${id}/copies`, params);
  const newId = (res.copied_adset_id as string) ?? res.id;

  // /copies takes no name or budget, so apply those as a follow-up edit.
  const name = str(args, 'name');
  const daily = int(args, 'daily-budget');
  const patch: Params = {};
  if (name) patch.name = name;
  if (daily !== undefined) patch.daily_budget = daily;
  if (Object.keys(patch).length && newId && newId !== 'dry-run') {
    await client.post(String(newId), patch);
  }

  ok({ id: newId, copiedFrom: id, ...patch }, () => {
    line(`✓ ad set ${id} duplicated → ${newId} — PAUSED`);
    if (patch.daily_budget) line(`  budget: ${money(patch.daily_budget)}/day when activated`);
  });
}

export async function deleteAdSet(ctx: Ctx): Promise<void> {
  const id = requireId(ctx.rest, 'adset delete <id>');
  await ctx.client.delete(id);
  ok({ id, deleted: true }, () => line(`✓ ad set ${id} deleted`));
}

/** Print current targeting so it can be edited and re-applied, rather than guessed at. */
export async function showTargeting(ctx: Ctx): Promise<void> {
  const id = requireId(ctx.rest, 'adset targeting <id>');
  const res = (await ctx.client.get(id, { fields: 'name,targeting' })) as Record<string, any>;
  ok(res.targeting, () => {
    line(`targeting for ad set ${id} — "${res.name}"`);
    line(JSON.stringify(res.targeting, null, 2));
  });
}

/** Real interest ids, so nobody invents one that happens to parse. */
export async function searchInterests(ctx: Ctx): Promise<void> {
  const query = ctx.rest.join(' ');
  if (!query) throw new ValidationError('Usage: interests search <query>');

  const res = await ctx.client.get('search', {
    type: 'adinterest',
    q: query,
    limit: '25',
  });
  const rows = (res.data ?? []) as Array<Record<string, any>>;

  ok(rows, () => {
    if (!rows.length) return line(`No interests matching "${query}".`);
    table(
      ['ID', 'AUDIENCE', 'NAME'],
      rows.map((r) => [String(r.id), formatAudience(r.audience_size_lower_bound), String(r.name)]),
    );
  });
}

const formatAudience = (n?: number): string => {
  if (!n) return '—';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
};

function deepMerge(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    const existing = out[key];
    out[key] =
      isPlainObject(existing) && isPlainObject(value)
        ? deepMerge(existing, value)
        : value;
  }
  return out;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
