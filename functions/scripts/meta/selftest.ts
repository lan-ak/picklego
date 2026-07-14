/**
 * Offline self-test. No token, no network, no money.
 *
 * Runs every pure request-builder against fixtures and asserts the resulting body. This
 * is what catches "we JSON-stringified targeting wrong" or "budget silently became a
 * float" without touching Meta at all.
 *
 * It also asserts the guardrails in `client.ts` directly — that a $30-as-`30` budget is
 * rejected, that a create is forced to PAUSED, and that a raw `POST <id> status=ACTIVE`
 * is recognised as an activation. Those are the promises the CLI makes to the human, so
 * they are the ones most worth a test.
 *
 * functions/ has no test framework, and adding one for this would be a heavier
 * dependency than the thing it verifies. A golden-output command a human reads once, and
 * an agent can run any time, is the right weight.
 */
import { buildAd } from './ads';
import { buildAdSet, buildTargeting } from './adsets';
import { buildAppAudience, buildLookalike } from './audiences';
import { buildCampaign } from './campaigns';
import { MetaClient, isActivation } from './client';
import { Ctx } from './context';
import { buildCreative } from './creatives';
import { Config } from './env';
import { CliError } from './errors';
import { normalizeRow } from './insights';
import { line, ok } from './output';
import { parseSpec } from './spec';

const FIXTURE: Config = {
  accessToken: 'FIXTURE',
  adAccountId: 'act_1234567890',
  appId: '9876543210',
  pageId: '111222333',
  datasetId: '444555666',
  objectStoreUrl: 'https://apps.apple.com/app/id6743630735',
  maxDailyBudgetCents: 5000,
  maxLifetimeBudgetCents: 50000,
  maxBidCents: 1000,
  maxAccountDailyCents: 10000,
};

/**
 * A MetaClient with nothing plugged into it.
 *
 * `enforceBudgets` and `enforcePaused` never touch the network, so the guardrails — the
 * load-bearing promise of this whole CLI — can be asserted offline like everything else
 * here. They previously had no coverage at all.
 *
 * `accountMeta` is normally populated by `loadAccountMeta()` over the network; seeding it
 * directly is what makes the account-minimum floor (and therefore the 100x-budget bug)
 * testable without a token.
 */
function guardClient(seed?: { minDailyBudgetCents: number }): MetaClient {
  const client = new MetaClient(FIXTURE, { dryRun: true, validateOnly: false });
  if (seed) {
    (client as unknown as { accountMeta: unknown }).accountMeta = {
      currency: 'CAD',
      minDailyBudgetCents: seed.minDailyBudgetCents,
    };
  }
  return client;
}

interface Case {
  name: string;
  run: () => unknown;
  /** Assertions against the built body. Return an error string, or undefined if fine. */
  expect?: (result: any) => string | undefined;
  /** For cases that must be rejected: a substring the error message has to contain. */
  throws?: string;
}

const CASES: Case[] = [
  {
    name: 'campaign: app-install, campaign-level budget',
    run: () => buildCampaign({ name: 'Test', dailyBudgetCents: 3000 }, FIXTURE),
    expect: (r) =>
      r.objective !== 'OUTCOME_APP_PROMOTION'
        ? `objective should be OUTCOME_APP_PROMOTION, got ${r.objective}`
        : r.buying_type !== 'AUCTION'
          ? 'buying_type must be AUCTION for SKAN'
          : r.is_skadnetwork_attribution !== true
            ? 'is_skadnetwork_attribution must be true'
            : !Array.isArray(r.special_ad_categories)
              ? 'special_ad_categories must be present (even empty)'
              : !r.promoted_object?.application_id
                ? 'promoted_object must be set at the campaign level for iOS 14+'
                : undefined,
  },
  {
    name: 'campaign: rejects APP_INSTALLS as an objective',
    run: () => buildCampaign({ name: 'X', objective: 'APP_INSTALLS' }, FIXTURE),
    throws: 'not a campaign objective',
  },
  {
    name: 'adset: SKAN defaults',
    run: () =>
      buildAdSet({ name: 'AS', campaignId: '1', dailyBudgetCents: 3000 }, FIXTURE),
    expect: (r) =>
      r.billing_event !== 'IMPRESSIONS'
        ? 'billing_event must be IMPRESSIONS (CPA billing is blocked on SKAN)'
        : r.optimization_goal !== 'APP_INSTALLS'
          ? 'optimization_goal should default to APP_INSTALLS'
          : r.destination_type !== 'APP'
            ? 'destination_type must be APP'
            : !r.targeting?.user_os?.includes('iOS_ver_14.0_and_above')
              ? 'SKAN targeting must specify iOS 14+'
              : r.targeting?.publisher_platforms
                ? 'publisher_platforms must be ABSENT by default (naming it opts out of Advantage+ placements)'
                : r.targeting?.targeting_automation?.advantage_audience !== 1
                  ? 'advantage_audience should be on by default'
                  : undefined,
  },
  {
    name: 'adset: rejects both billing_event and goal = APP_INSTALLS',
    run: () =>
      buildAdSet(
        { name: 'AS', campaignId: '1', dailyBudgetCents: 3000, billingEvent: 'APP_INSTALLS' },
        FIXTURE,
      ),
    throws: 'cannot both be APP_INSTALLS',
  },
  {
    name: 'adset: rejects a bid amount with LOWEST_COST_WITHOUT_CAP',
    run: () =>
      buildAdSet(
        { name: 'AS', campaignId: '1', dailyBudgetCents: 3000, bidStrategy: 'LOWEST_COST_WITHOUT_CAP', bidAmountCents: 400 },
        FIXTURE,
      ),
    throws: 'must be absent',
  },
  {
    name: 'adset: rejects an app-event goal with no event',
    run: () =>
      buildAdSet(
        { name: 'AS', campaignId: '1', dailyBudgetCents: 3000, optimizationGoal: 'OFFSITE_CONVERSIONS' },
        FIXTURE,
      ),
    throws: 'needs the app event',
  },
  {
    name: 'targeting: rejects an inclusion audience on a SKAN ad set',
    run: () => buildTargeting({ includeAudienceIds: ['123'] }, true),
    throws: '1870125',
  },
  {
    name: 'targeting: allows an inclusion audience when SKAN is off',
    run: () => buildTargeting({ includeAudienceIds: ['123'] }, false),
    expect: (r) => (r.custom_audiences?.[0]?.id === '123' ? undefined : 'custom_audiences not set'),
  },
  {
    name: 'creative: image, app-install CTA',
    run: () =>
      buildCreative(
        { name: 'C', primaryText: 'body', headline: 'head', imageHash: 'abc123' },
        FIXTURE,
      ),
    expect: (r) => {
      const link = r.object_story_spec?.link_data;
      if (!r.object_story_spec?.page_id) return 'page_id is required on every creative';
      if (link?.call_to_action?.type !== 'INSTALL_MOBILE_APP') return 'CTA should be INSTALL_MOBILE_APP';
      if (link?.call_to_action?.value?.app_link) {
        return 'app_link (deferred deep link) must NOT be set — unavailable on SKAN (3285008)';
      }
      if (link?.image_hash !== 'abc123') return 'image_hash not carried through';
      return undefined;
    },
  },
  {
    name: 'creative: video carries a thumbnail hash',
    run: () =>
      buildCreative(
        { name: 'C', primaryText: 'b', headline: 'h', videoId: '999', thumbnailHash: 'thumb1' },
        FIXTURE,
      ),
    expect: (r) =>
      r.object_story_spec?.video_data?.image_hash !== 'thumb1'
        ? 'video_data.image_hash (thumbnail) missing — Meta requires a thumbnail on video creatives'
        : undefined,
  },
  {
    name: 'creative: rejects media-less',
    run: () => buildCreative({ name: 'C', primaryText: 'b', headline: 'h' }, FIXTURE),
    throws: 'needs media',
  },
  {
    name: 'ad: joins adset + creative',
    run: () => buildAd({ name: 'A', adsetId: '1', creativeId: '2' }),
    expect: (r) => (r.creative?.creative_id === '2' ? undefined : 'creative_id not nested correctly'),
  },
  {
    name: 'audience: installed-but-never-purchased',
    run: () =>
      buildAppAudience({
        name: 'A',
        appId: FIXTURE.appId!,
        event: 'fb_mobile_activate_app',
        excludeEvent: 'fb_mobile_purchase',
        retentionDays: 30,
      }),
    expect: (r) => {
      const rule = r.rule as any;
      if (rule?.inclusions?.rules?.[0]?.event_sources?.[0]?.type !== 'app') return 'event_sources type must be app';
      if (rule?.inclusions?.rules?.[0]?.retention_seconds !== 30 * 86400) return 'retention_seconds wrong';
      if (!rule?.exclusions) return 'exclusions missing';
      return undefined;
    },
  },
  {
    name: 'lookalike: 1% US',
    run: () => buildLookalike({ name: 'L', seedAudienceId: '5', country: 'US', ratio: 0.01 }),
    expect: (r) => (r.subtype === 'LOOKALIKE' ? undefined : 'subtype must be LOOKALIKE'),
  },
  {
    name: 'spec: rejects a status field (the paused-by-default contract)',
    run: () =>
      parseSpec(
        {
          runKey: 'x',
          campaign: { name: 'C', dailyBudgetCents: 3000, status: 'ACTIVE' },
          adsets: [],
        },
        '/tmp',
      ),
    throws: 'not allowed',
  },
  {
    // `30` is a valid integer, so it passes the spec's cents validation — the spec layer
    // cannot tell $30 from 30¢. What actually catches it is the client's account-minimum
    // floor, which is why this case has to go through the client, not parseSpec.
    name: 'guardrail: rejects dollars-as-a-number (the 100x bug)',
    run: () => guardClient({ minDailyBudgetCents: 143 }).enforceBudgets({ daily_budget: 30 }),
    throws: 'below this ad account',
  },
  {
    name: 'guardrail: rejects a budget over the ceiling',
    run: () => guardClient().enforceBudgets({ daily_budget: 500000 }),
    throws: 'exceeds the ceiling',
  },
  {
    name: 'guardrail: rejects a float budget',
    run: () => guardClient().enforceBudgets({ daily_budget: 30.5 }),
    throws: 'whole number',
  },
  {
    name: 'guardrail: rejects a bid over the ceiling',
    run: () => guardClient().enforceBudgets({ bid_amount: 999999 }),
    throws: 'exceeds the ceiling',
  },
  {
    name: 'guardrail: forces a created ad set to PAUSED',
    run: () => {
      const params: Record<string, unknown> = { name: 'A' };
      guardClient().enforcePaused('act_1234567890/adsets', params);
      return params;
    },
    expect: (r) => (r.status === 'PAUSED' ? undefined : `status should be PAUSED, got ${r.status}`),
  },
  {
    name: 'guardrail: refuses to create an ACTIVE campaign outright',
    run: () => guardClient().enforcePaused('act_1234567890/campaigns', { status: 'ACTIVE' }),
    throws: 'created PAUSED',
  },
  {
    // adset duplicate hits POST <id>/copies, which matches no create edge — its safety used
    // to rest on adsets.ts passing status_option itself, i.e. on convention.
    name: 'guardrail: forces an ad set COPY to PAUSED',
    run: () => {
      const params: Record<string, unknown> = { deep_copy: true };
      guardClient().enforcePaused('123456/copies', params);
      return params;
    },
    expect: (r) =>
      r.status_option === 'PAUSED' ? undefined : `status_option should be PAUSED, got ${r.status_option}`,
  },
  {
    // The bypass: a bare object id matches no create edge, so enforcePaused ignores it.
    // isActivation is what routes it into the account-wide headroom check instead.
    name: 'guardrail: a raw POST <id> status=ACTIVE counts as an activation',
    run: () => isActivation('123456', { status: 'ACTIVE' }),
    expect: (r) => (r === true ? undefined : 'a raw status=ACTIVE POST must be treated as an activation'),
  },
  {
    name: 'guardrail: creating a PAUSED object is not an activation',
    run: () => isActivation('act_1234567890/adsets', { status: 'PAUSED' }),
    expect: (r) => (r === false ? undefined : 'a create must not be treated as an activation'),
  },
  {
    name: 'spec: rejects a float budget',
    run: () =>
      parseSpec(
        { runKey: 'x', campaign: { name: 'C', dailyBudgetCents: 30.5 }, adsets: [] },
        '/tmp',
      ),
    throws: 'whole number of cents',
  },
  {
    name: 'spec: rejects budgets at both campaign and ad set level',
    run: () =>
      parseSpec(
        {
          runKey: 'x',
          campaign: { name: 'C', dailyBudgetCents: 3000 },
          adsets: [
            {
              name: 'A',
              dailyBudgetCents: 3000,
              ads: [
                {
                  name: 'ad',
                  creative: { primaryText: 'p', headline: 'h', media: { type: 'image', hash: 'x' } },
                },
              ],
            },
          ],
        },
        '/tmp',
      ),
    throws: 'both the campaign',
  },
  {
    name: 'spec: catches a typo instead of silently defaulting',
    run: () =>
      parseSpec(
        {
          runKey: 'x',
          campaign: { name: 'C', dailyBudgetCents: 3000 },
          adsets: [{ name: 'A', optimisationGoal: 'APP_INSTALLS', ads: [] }],
        },
        '/tmp',
      ),
    throws: 'Unknown key',
  },
  {
    name: 'insights: normalizes Meta actions into typed metrics',
    run: () =>
      normalizeRow(
        {
          adset_id: '1',
          adset_name: 'AS',
          spend: '20.00',
          impressions: '1000',
          clicks: '50',
          actions: [
            { action_type: 'mobile_app_install', value: '10' },
            { action_type: 'app_custom_event.fb_mobile_purchase', value: '2' },
          ],
          action_values: [{ action_type: 'app_custom_event.fb_mobile_purchase', value: '30.00' }],
        },
        'adset',
      ),
    expect: (r) =>
      r.installs !== 10
        ? `installs should be 10, got ${r.installs}`
        : r.cpi !== 2
          ? `CPI should be 2.00, got ${r.cpi}`
          : r.purchases !== 2
            ? `purchases should be 2, got ${r.purchases}`
            : Math.abs(r.roas - 1.5) > 1e-9
              ? `ROAS should be 1.5, got ${r.roas}`
              : undefined,
  },
];

export async function selftest(ctx: Ctx): Promise<void> {
  void ctx;
  const results: Array<{ name: string; pass: boolean; detail?: string }> = [];

  for (const c of CASES) {
    try {
      const result = c.run();
      if (c.throws) {
        results.push({ name: c.name, pass: false, detail: `expected it to reject with "${c.throws}", but it was accepted` });
        continue;
      }
      const problem = c.expect?.(result);
      results.push(problem ? { name: c.name, pass: false, detail: problem } : { name: c.name, pass: true });
    } catch (err) {
      const message = err instanceof CliError ? err.payload.message : (err as Error).message;
      if (c.throws) {
        results.push(
          message.includes(c.throws)
            ? { name: c.name, pass: true }
            : { name: c.name, pass: false, detail: `rejected, but for the wrong reason: ${message}` },
        );
      } else {
        results.push({ name: c.name, pass: false, detail: `unexpected error: ${message}` });
      }
    }
  }

  const failed = results.filter((r) => !r.pass);

  ok({ total: results.length, failed: failed.length, results }, () => {
    line('\nMeta Ads CLI self-test — offline, no token, no network\n');
    for (const r of results) {
      line(`  ${r.pass ? '✓' : '✗'} ${r.name}`);
      if (r.detail) line(`      ${r.detail}`);
    }
    line(`\n${results.length - failed.length}/${results.length} passed\n`);
  });

  if (failed.length) process.exitCode = 1;
}
