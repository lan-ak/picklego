/**
 * Campaigns.
 *
 * PickleGo runs iOS app-install campaigns, which pins several fields hard:
 *   objective            OUTCOME_APP_PROMOTION   (the legacy APP_INSTALLS *objective* is
 *                                                 dead; APP_INSTALLS survives only as an
 *                                                 optimization_goal on the ad set)
 *   buying_type          AUCTION                 (mandatory under SKAdNetwork)
 *   special_ad_categories []                     (required even when empty)
 *   promoted_object      required at the CAMPAIGN level too for iOS 14+, not just the ad set
 *
 * promoted_object and is_skadnetwork_attribution are IMMUTABLE once the campaign is live.
 * Getting them wrong means delete-and-recreate, which burns one of the 9 SKAN slots the
 * app gets. That is why they are built from env here and never taken from a flag.
 */
import { bool, int, requireStr, str } from './args';
import { Params } from './client';
import { Ctx } from './context';
import { Config, require_ } from './env';
import { ValidationError } from './errors';
import { line, money, ok, table } from './output';
import { promotedObject } from './promoted';

export const CAMPAIGN_FIELDS =
  'name,status,effective_status,objective,daily_budget,lifetime_budget,bid_strategy,' +
  'buying_type,is_skadnetwork_attribution,advantage_state_info,created_time';

export interface CampaignInput {
  name: string;
  dailyBudgetCents?: number;
  lifetimeBudgetCents?: number;
  bidStrategy?: string;
  objective?: string;
  specialAdCategories?: string[];
  skadnetwork?: boolean;
}

/** Pure. No network. Exercised by `selftest`. */
export function buildCampaign(input: CampaignInput, config: Config): Params {
  if (input.objective && input.objective !== 'OUTCOME_APP_PROMOTION') {
    if (input.objective === 'APP_INSTALLS') {
      throw new ValidationError(
        'APP_INSTALLS is not a campaign objective — it is an ad set optimization_goal.',
        'Use objective OUTCOME_APP_PROMOTION on the campaign, and optimizationGoal APP_INSTALLS on the ad set.',
      );
    }
    throw new ValidationError(
      `Unsupported objective "${input.objective}" for an app-install campaign.`,
      'This CLI builds iOS app-promotion campaigns. The objective is OUTCOME_APP_PROMOTION.',
    );
  }

  const skan = input.skadnetwork !== false;
  const params: Params = {
    name: input.name,
    objective: 'OUTCOME_APP_PROMOTION',
    buying_type: 'AUCTION',
    special_ad_categories: input.specialAdCategories ?? [],
    // status is forced to PAUSED by the client. Not settable here, by design.
  };

  if (skan) {
    params.is_skadnetwork_attribution = true;
    params.promoted_object = promotedObject(config);
  }

  if (input.dailyBudgetCents !== undefined) params.daily_budget = input.dailyBudgetCents;
  if (input.lifetimeBudgetCents !== undefined) params.lifetime_budget = input.lifetimeBudgetCents;
  // A campaign-level budget is Advantage+ budget (CBO). It is mutually exclusive with
  // ad-set budgets, and it is one of the three preconditions for Advantage+ status.
  if (input.dailyBudgetCents !== undefined || input.lifetimeBudgetCents !== undefined) {
    params.bid_strategy = input.bidStrategy ?? 'LOWEST_COST_WITHOUT_CAP';
  }

  return params;
}

export async function listCampaigns(ctx: Ctx): Promise<void> {
  const { client, config } = ctx;
  const rows = (await client.getAll(`${config.adAccountId}/campaigns`, {
    fields: CAMPAIGN_FIELDS,
  })) as Array<Record<string, any>>;

  ok(rows, () => {
    if (!rows.length) return line('No campaigns.');
    table(
      ['ID', 'STATUS', 'BUDGET', 'ADVANTAGE+', 'NAME'],
      rows.map((c) => [
        String(c.id),
        String(c.effective_status ?? c.status),
        c.daily_budget
          ? `${money(c.daily_budget)}/day`
          : c.lifetime_budget
            ? `${money(c.lifetime_budget)} total`
            : '—',
        c.advantage_state_info?.advantage_state === 'ADVANTAGE_PLUS_APP' ? 'yes' : 'no',
        String(c.name),
      ]),
    );
    line(`\n${rows.length} campaign(s)`);
  });
}

export async function createCampaign(ctx: Ctx): Promise<void> {
  const { client, config, args } = ctx;

  await client.loadAccountMeta();
  require_(config, 'appId');
  require_(config, 'objectStoreUrl');

  const params = buildCampaign(
    {
      name: requireStr(args, 'name'),
      dailyBudgetCents: int(args, 'daily-budget'),
      lifetimeBudgetCents: int(args, 'lifetime-budget'),
      bidStrategy: str(args, 'bid-strategy'),
      skadnetwork: !bool(args, 'no-skan'),
    },
    config,
  );

  const res = await client.post(`${config.adAccountId}/campaigns`, params);
  const created = { id: res.id, status: 'PAUSED', ...params };

  ok(created, () => {
    line(`✓ campaign ${res.id} created — PAUSED`);
    line(`  ${params.name}`);
    if (params.daily_budget) line(`  budget: ${money(params.daily_budget)}/day when activated`);
    line('');
    line('It is not spending. Activate it yourself in Ads Manager, or:');
    line(`  npm run meta -- campaign resume ${res.id}`);
  });
}

export async function updateCampaign(ctx: Ctx): Promise<void> {
  const { client, args, rest } = ctx;
  const id = requireId(rest, 'campaign update <id>');

  const params: Params = {};
  const name = str(args, 'name');
  const daily = int(args, 'daily-budget');
  const lifetime = int(args, 'lifetime-budget');
  const bid = str(args, 'bid-strategy');
  if (name) params.name = name;
  if (daily !== undefined) params.daily_budget = daily;
  if (lifetime !== undefined) params.lifetime_budget = lifetime;
  if (bid) params.bid_strategy = bid;

  if (!Object.keys(params).length) {
    throw new ValidationError('Nothing to update. Pass --name, --daily-budget, --lifetime-budget or --bid-strategy.');
  }

  const res = await client.post(id, params);
  ok({ id, updated: params, result: res }, () => line(`✓ campaign ${id} updated`));
}

export async function pauseCampaign(ctx: Ctx): Promise<void> {
  const id = requireId(ctx.rest, 'campaign pause <id>');
  await ctx.client.post(id, { status: 'PAUSED' });
  ok({ id, status: 'PAUSED' }, () => line(`✓ campaign ${id} paused — it will stop spending`));
}

/**
 * Archive a campaign — the right way to free one of the app's 9 SKAdNetwork slots.
 *
 * Both the SKAN-slot check in doctor and the error hint for a full slot list told you to
 * "delete or archive", and there was no archive command — so the only route was a raw
 * `graph --method POST`. Deleting is the destructive alternative: it takes the campaign's
 * reporting history with it, and that history is the only record of what the money bought.
 */
export async function archiveCampaign(ctx: Ctx): Promise<void> {
  const id = requireId(ctx.rest, 'campaign archive <id>');
  await ctx.client.post(id, { status: 'ARCHIVED' });
  ok({ id, status: 'ARCHIVED' }, () => {
    line(`✓ campaign ${id} archived — it keeps its reporting history and frees its SKAN slot`);
    line('  Archived campaigns are read-only. To run it again, create a new one.');
  });
}

/**
 * The only path to spending money — the typed one, at least. The account-wide headroom
 * check lives in `client.post`, so it also covers a raw `graph --method POST`. We read the
 * campaign here purely to tell the human what they just switched on.
 */
export async function resumeCampaign(ctx: Ctx): Promise<void> {
  const { client } = ctx;
  const id = requireId(ctx.rest, 'campaign resume <id>');

  const campaign = (await client.get(id, { fields: 'name,daily_budget,lifetime_budget' })) as Record<string, any>;
  const daily = Number(campaign.daily_budget ?? 0);

  await client.post(id, { status: 'ACTIVE' });

  ok({ id, status: 'ACTIVE', dailyBudget: daily }, () => {
    line(`✓ campaign ${id} is now ACTIVE — "${campaign.name}"`);
    if (daily > 0) line(`  This will now spend up to ${money(daily)}/day (Meta may exceed by up to 25% on a given day).`);
  });
}

export async function deleteCampaign(ctx: Ctx): Promise<void> {
  const { client, args } = ctx;
  const id = requireId(ctx.rest, 'campaign delete <id>');

  // Deleting an object with spend history destroys its reporting. Almost always the
  // right move is to pause it instead.
  const insights = (await client.get(`${id}/insights`, { fields: 'spend' })) as any;
  const spend = Number(insights?.data?.[0]?.spend ?? 0);
  if (spend > 0 && !bool(args, 'force')) {
    throw new ValidationError(
      `Campaign ${id} has spent $${spend.toFixed(2)}. Deleting it destroys its reporting history.`,
      'Pause it instead: `campaign pause <id>`. If deletion is truly what the human asked for, pass --force.',
    );
  }

  await client.delete(id);
  ok({ id, deleted: true }, () => line(`✓ campaign ${id} deleted`));
}

export function requireId(rest: string[], usage: string): string {
  const id = rest[0];
  if (!id) throw new ValidationError(`Missing id. Usage: ${usage}`);
  if (!/^\d+$/.test(id)) {
    throw new ValidationError(`"${id}" is not a numeric Meta object id. Usage: ${usage}`);
  }
  return id;
}
