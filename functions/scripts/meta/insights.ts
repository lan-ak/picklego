/**
 * Insights.
 *
 * Two commands, on purpose:
 *   `insights` — the original human-readable dump. Unchanged.
 *   `report`   — NORMALIZED rows for a machine. Meta returns conversions as an untyped
 *                `actions` array whose action_type strings differ by objective and
 *                attribution setting; picking the wrong key silently reports zero
 *                purchases forever. `report` does that extraction once, here, so the
 *                decision-making never has to.
 */
import { int, str } from './args';
import { Ctx } from './context';
import { ValidationError } from './errors';
import { line, money, ok, table } from './output';

/** Meta's action_type strings for the events PickleGo fires. */
const ACTION_KEYS = {
  installs: ['mobile_app_install'],
  signups: ['app_custom_event.fb_mobile_complete_registration'],
  purchases: ['app_custom_event.fb_mobile_purchase', 'omni_purchase'],
  addToCart: ['app_custom_event.fb_mobile_add_to_cart'],
} as const;

function datePreset(days: number): string {
  if (days <= 1) return 'today';
  if (days <= 7) return 'last_7d';
  if (days <= 14) return 'last_14d';
  if (days <= 30) return 'last_30d';
  return 'last_90d';
}

const sumActions = (actions: any[] | undefined, keys: readonly string[]): number =>
  (actions ?? [])
    .filter((a) => keys.includes(a.action_type))
    .reduce((sum, a) => sum + Number(a.value ?? 0), 0);

export interface ReportRow {
  id: string;
  name: string;
  status?: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  frequency: number;
  installs: number;
  cpi: number | null;
  signups: number;
  purchases: number;
  cpa: number | null;
  revenue: number;
  roas: number | null;
}

/** Pure. No network. Exercised by `selftest`. */
export function normalizeRow(raw: Record<string, any>, level: string): ReportRow {
  const spend = Number(raw.spend ?? 0);
  const installs = sumActions(raw.actions, ACTION_KEYS.installs);
  const purchases = sumActions(raw.actions, ACTION_KEYS.purchases);
  const signups = sumActions(raw.actions, ACTION_KEYS.signups);
  const revenue = sumActions(raw.action_values, ACTION_KEYS.purchases);
  const impressions = Number(raw.impressions ?? 0);
  const clicks = Number(raw.clicks ?? 0);

  return {
    id: String(raw[`${level}_id`] ?? raw.id ?? ''),
    name: String(raw[`${level}_name`] ?? ''),
    spend,
    impressions,
    clicks,
    ctr: impressions ? clicks / impressions : 0,
    frequency: Number(raw.frequency ?? 0),
    installs,
    cpi: installs ? spend / installs : null,
    signups,
    purchases,
    cpa: purchases ? spend / purchases : null,
    revenue,
    roas: spend ? Number(raw.purchase_roas?.[0]?.value ?? (revenue ? revenue / spend : 0)) : null,
  };
}

const INSIGHT_FIELDS =
  'spend,impressions,clicks,frequency,actions,action_values,purchase_roas';

/**
 * The command Claude reads before deciding what to pause or scale.
 *
 * Note what it does NOT do: it does not rank, score, or recommend. An auto-kill heuristic
 * baked in here would be a black box that one day pauses the wrong ad set. The numbers
 * come out; the reasoning happens in the open where a human can veto it.
 */
export async function report(ctx: Ctx): Promise<void> {
  const { client, config, args } = ctx;
  const days = int(args, 'days') ?? 7;
  const level = str(args, 'level') ?? 'adset';

  if (!['campaign', 'adset', 'ad'].includes(level)) {
    throw new ValidationError(`--level must be campaign, adset or ad. Got: ${level}`);
  }

  const { currency } = await client.loadAccountMeta();
  const rows = (await client.getAll(`${config.adAccountId}/insights`, {
    fields: `${level}_id,${level}_name,${INSIGHT_FIELDS}`,
    level,
    date_preset: datePreset(days),
  })) as Array<Record<string, any>>;

  const normalized = rows.map((r) => normalizeRow(r, level));
  const totals = normalized.reduce(
    (acc, r) => ({
      spend: acc.spend + r.spend,
      installs: acc.installs + r.installs,
      purchases: acc.purchases + r.purchases,
      revenue: acc.revenue + r.revenue,
    }),
    { spend: 0, installs: 0, purchases: 0, revenue: 0 },
  );

  ok({ level, days, currency, rows: normalized, totals }, () => {
    if (!normalized.length) {
      return line(`No delivery in the last ${days}d. Nothing has spent — is anything ACTIVE?`);
    }
    table(
      ['SPEND', 'IMPR', 'CTR', 'INST', 'CPI', 'SIGNUP', 'PURCH', 'ROAS', 'NAME'],
      normalized.map((r) => [
        money(r.spend * 100, currency),
        String(r.impressions),
        `${(r.ctr * 100).toFixed(2)}%`,
        String(r.installs),
        r.cpi === null ? '—' : money(r.cpi * 100, currency),
        String(r.signups),
        String(r.purchases),
        r.roas ? `${r.roas.toFixed(2)}x` : '—',
        r.name,
      ]),
    );
    line(
      `\nLast ${days}d: ${money(totals.spend * 100, currency)} spent · ${totals.installs} installs · ` +
        `${totals.purchases} purchases · ${money(totals.revenue * 100, currency)} revenue`,
    );
    if (totals.installs) {
      line(`Blended CPI ${money((totals.spend / totals.installs) * 100, currency)}`);
    }
  });
}

/** The original human-facing insights view. Preserved as-is. */
export async function insights(ctx: Ctx): Promise<void> {
  const { client, config, args } = ctx;
  const days = int(args, 'days') ?? 7;

  const res = await client.get(`${config.adAccountId}/insights`, {
    fields: `campaign_name,${INSIGHT_FIELDS}`,
    level: 'campaign',
    date_preset: datePreset(days),
    limit: '100',
  });

  const rows = (res.data ?? []) as Array<Record<string, any>>;
  ok(rows, () => {
    if (!rows.length) return line('No insights for that window (no spend yet?).');

    let total = 0;
    for (const r of rows) {
      const n = normalizeRow(r, 'campaign');
      total += n.spend;
      line(`\n${r.campaign_name}`);
      line(`  spend        $${n.spend.toFixed(2)}`);
      line(`  impressions  ${n.impressions}  clicks ${n.clicks}`);
      line(`  installs     ${n.installs}${n.cpi ? `  (CPI $${n.cpi.toFixed(2)})` : ''}`);
      line(`  signups      ${n.signups}`);
      line(`  purchases    ${n.purchases}`);
      line(`  ROAS         ${n.roas ? `${n.roas.toFixed(2)}x` : '—'}`);
    }
    line(`\nTotal spend (last ${days}d): $${total.toFixed(2)}`);
  });
}
