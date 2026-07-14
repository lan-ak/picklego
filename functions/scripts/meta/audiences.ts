/**
 * Custom audiences and lookalikes, built from PickleGo's app events.
 *
 * READ THIS BEFORE USING THEM FOR TARGETING: an app-activity Custom Audience cannot be
 * used for INCLUSION targeting on an iOS 14 / SKAdNetwork campaign (subcode 1870125) —
 * which is every iOS install campaign this repo creates. So audiences are useful here for
 * two things:
 *   1. Seeding a Lookalike, which CAN be targeted.
 *   2. Exclusions (e.g. don't advertise to existing subscribers). Meta's error text names
 *      inclusion specifically and is silent on exclusion; the docs do not settle it, so
 *      `adset create --exclude-audience` is allowed but should be confirmed with --validate.
 *
 * Prerequisite: the ad account must have accepted the Custom Audience Terms of Service in
 * Business Settings. Until a human clicks it, every call here 400s with subcode 1885183.
 */
import { int, list, requireStr, str } from './args';
import { Params } from './client';
import { requireId } from './campaigns';
import { Ctx } from './context';
import { require_ } from './env';
import { ValidationError } from './errors';
import { line, ok, table, warn } from './output';

export const AUDIENCE_FIELDS =
  'name,subtype,approximate_count_lower_bound,retention_days,delivery_status,operation_status,time_created';

/** App events PickleGo actually fires (see src/services/meta.ts MetaEvents). */
const KNOWN_EVENTS = [
  'fb_mobile_activate_app',
  'fb_mobile_complete_registration',
  'fb_mobile_purchase',
  'fb_mobile_add_to_cart',
  'fb_mobile_achievement_unlocked',
  'fb_mobile_level_achieved',
  'fb_mobile_tutorial_completion',
];

export interface AppAudienceInput {
  name: string;
  appId: string;
  /** Include users who fired this event. */
  event: string;
  retentionDays: number;
  /** Exclude users who fired this one. The "installed but never converted" shape. */
  excludeEvent?: string;
}

/** Pure. No network. Exercised by `selftest`. */
export function buildAppAudience(input: AppAudienceInput): Params {
  if (input.retentionDays < 1 || input.retentionDays > 180) {
    throw new ValidationError(
      `retention_days must be between 1 and 180. Got: ${input.retentionDays}`,
    );
  }

  const seconds = input.retentionDays * 86_400;
  const source = { id: input.appId, type: 'app' };
  const clause = (event: string) => ({
    event_sources: [source],
    retention_seconds: seconds,
    filter: {
      operator: 'and',
      filters: [{ field: 'event', operator: 'eq', value: event }],
    },
  });

  const rule: Record<string, unknown> = {
    inclusions: { operator: 'or', rules: [clause(input.event)] },
  };
  if (input.excludeEvent) {
    rule.exclusions = { operator: 'or', rules: [clause(input.excludeEvent)] };
  }

  return {
    name: input.name,
    retention_days: input.retentionDays,
    prefill: true,
    rule,
  };
}

/** Pure. No network. Exercised by `selftest`. */
export function buildLookalike(input: {
  name: string;
  seedAudienceId: string;
  country: string;
  ratio?: number;
}): Params {
  const ratio = input.ratio ?? 0.01;
  if (ratio < 0.01 || ratio > 0.2) {
    throw new ValidationError(
      `Lookalike ratio must be between 0.01 (1%, most similar) and 0.20 (20%, broadest). Got: ${ratio}`,
    );
  }
  return {
    name: input.name,
    subtype: 'LOOKALIKE',
    origin_audience_id: input.seedAudienceId,
    lookalike_spec: { ratio, country: input.country },
  };
}

export async function createAppAudience(ctx: Ctx): Promise<void> {
  const { client, config, args } = ctx;
  const event = requireStr(args, 'event');

  if (!KNOWN_EVENTS.includes(event)) {
    throw new ValidationError(
      `"${event}" is not an app event PickleGo sends.`,
      `Known events: ${KNOWN_EVENTS.join(', ')}. See src/services/meta.ts (MetaEvents) for what the app actually fires — ` +
        `an audience built on an event nobody sends stays empty forever.`,
    );
  }

  const params = buildAppAudience({
    name: requireStr(args, 'name'),
    appId: require_(config, 'appId'),
    event,
    retentionDays: int(args, 'retention-days') ?? 90,
    excludeEvent: str(args, 'exclude-event'),
  });

  const res = await client.post(`${config.adAccountId}/customaudiences`, params);
  ok({ id: res.id, ...params }, () => {
    line(`✓ custom audience ${res.id} created — "${params.name}"`);
    line('  It takes a few hours to populate.');
    line('');
    line('  Remember: this cannot be used for INCLUSION targeting on an iOS SKAdNetwork');
    line('  campaign (subcode 1870125). Seed a lookalike from it instead:');
    line(`    npm run meta -- audience create-lookalike --seed ${res.id} --name "..." --country US`);
  });
}

export async function createLookalike(ctx: Ctx): Promise<void> {
  const { client, config, args } = ctx;
  const seed = requireStr(args, 'seed');

  // A lookalike from a seed that's too small silently produces a bad audience.
  const seedInfo = (await client.get(seed, {
    fields: 'name,approximate_count_lower_bound',
  })) as Record<string, any>;
  const size = Number(seedInfo.approximate_count_lower_bound ?? 0);
  if (size > 0 && size < 100) {
    throw new ValidationError(
      `Seed audience "${seedInfo.name}" has only ~${size} people. Meta's minimum is 100.`,
      'Broaden the seed: a longer retention window, or a more common event.',
    );
  }
  if (size > 0 && size < 1000) {
    warn(
      `Seed audience has only ~${size} people. Meta recommends 1,000–50,000 for a lookalike to be any good.`,
    );
  }

  const ratioFlag = str(args, 'ratio');
  const params = buildLookalike({
    name: requireStr(args, 'name'),
    seedAudienceId: seed,
    country: requireStr(args, 'country'),
    ratio: ratioFlag ? Number(ratioFlag) : undefined,
  });

  const res = await client.post(`${config.adAccountId}/customaudiences`, params);
  ok({ id: res.id, ...params }, () => {
    line(`✓ lookalike ${res.id} created — "${params.name}"`);
    line('  Populating takes 1–6 hours. It can be targeted once ready:');
    line(`    npm run meta -- adset create --include-audience ${res.id} ...`);
  });
}

export async function listAudiences(ctx: Ctx): Promise<void> {
  const rows = (await ctx.client.getAll(`${ctx.config.adAccountId}/customaudiences`, {
    fields: AUDIENCE_FIELDS,
  })) as Array<Record<string, any>>;

  ok(rows, () => {
    if (!rows.length) return line('No custom audiences.');
    table(
      ['ID', 'SIZE', 'TYPE', 'READY', 'NAME'],
      rows.map((a) => [
        String(a.id),
        a.approximate_count_lower_bound ? `~${a.approximate_count_lower_bound}` : '—',
        String(a.subtype ?? ''),
        a.delivery_status?.code === 200 ? 'yes' : 'no',
        String(a.name),
      ]),
    );
    line(`\n${rows.length} audience(s) — max 200 per ad account`);
  });
}

/**
 * Attach audiences to an ad set's targeting. Read-modify-write: a blind overwrite of the
 * targeting object would silently drop geo, age and interests.
 */
export async function attachAudience(ctx: Ctx): Promise<void> {
  const { client, args, rest } = ctx;
  const id = requireId(rest, 'audience attach <adsetId> --include <ids> | --exclude <ids>');

  const include = list(args, 'include');
  const exclude = list(args, 'exclude');
  if (!include && !exclude) {
    throw new ValidationError('Pass --include <audienceIds> and/or --exclude <audienceIds>.');
  }

  const current = (await client.get(id, {
    fields: 'name,targeting,is_skadnetwork_attribution',
  })) as Record<string, any>;

  if (include && current.is_skadnetwork_attribution) {
    throw new ValidationError(
      `Ad set ${id} is a SKAdNetwork ad set, which cannot use custom audiences for inclusion targeting (subcode 1870125).`,
      'Seed a lookalike from the audience and include that instead, or use --exclude.',
    );
  }

  const targeting = { ...(current.targeting ?? {}) };
  if (include) targeting.custom_audiences = include.map((a) => ({ id: a }));
  if (exclude) targeting.excluded_custom_audiences = exclude.map((a) => ({ id: a }));

  await client.post(id, { targeting });
  ok({ id, targeting }, () => {
    line(`✓ ad set ${id} targeting updated — "${current.name}"`);
    if (include) line(`  including: ${include.join(', ')}`);
    if (exclude) line(`  excluding: ${exclude.join(', ')}`);
  });
}
