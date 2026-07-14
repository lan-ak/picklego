/** Read commands that don't warrant a module of their own. */
import { str } from './args';
import { Ctx } from './context';
import { require_ } from './env';
import { ValidationError } from './errors';
import { line, ok } from './output';

/**
 * App-event types Meta has actually seen. Empty means the SDK isn't reporting.
 *
 * This is the ground truth for the attribution half: it is the only way to tell whether an
 * event you *think* you're sending is landing, and whether the client SDK and the
 * Conversions API are filing purchases under the same event name (fb_mobile_purchase vs
 * Purchase) or two different ones.
 *
 * Reading it needs the System User to hold a role on the APP, which is a different grant
 * from ads_management on the ad account — see the code-3000 hint in errors.ts.
 */
export async function events(ctx: Ctx): Promise<void> {
  const appId = require_(ctx.config, 'appId');
  const rows = (await ctx.client.getAll(`${appId}/app_event_types`)) as Array<Record<string, any>>;

  ok(rows, () => {
    if (!rows.length) {
      return line('Meta has recorded no app events yet. Ship a build and fire one.');
    }
    for (const e of rows) line(String(e.name ?? JSON.stringify(e)));
    line(`\n${rows.length} event type(s) known to Meta`);
  });
}

/**
 * Where to get META_DATASET_ID.
 *
 * This used to call `GET {appId}/dataset`, which is not a Graph edge and has never
 * returned anything but `(#100) nonexisting field` — so the one command CLAUDE.md and
 * .env.local.example both point at for finding the dataset id could not work, and the
 * Conversions API was left unconfigured behind it.
 *
 * There is no reliable Graph edge from an app to its Events Manager dataset, so this now
 * reports what it CAN see and tells you where to click. Guessing an edge is what got us
 * here.
 */
export async function datasets(ctx: Ctx): Promise<void> {
  const appId = require_(ctx.config, 'appId');
  const configured = ctx.config.datasetId;

  // Pixels are web datasets. Not what app events go to, but if one exists it is worth
  // seeing, because sending app events to a pixel id is a classic silent misconfiguration.
  const pixels = (await ctx.client.getAll(`${ctx.config.adAccountId}/adspixels`, {
    fields: 'id,name',
  })) as Array<Record<string, any>>;

  ok({ appId, configuredDatasetId: configured ?? null, pixels }, () => {
    line(`\nApp: ${appId}`);
    line(`META_DATASET_ID currently: ${configured ? configured : 'NOT SET'}\n`);

    line('The app-events dataset is not reachable from the Graph API. Find it by hand:');
    line('  Events Manager → Data Sources → PickleGo (the app) → Settings → Dataset ID');
    line('  https://business.facebook.com/events_manager2\n');
    line('Then put it in META_DATASET_ID (functions/.env.local, for the CLI) AND in Secret');
    line('Manager (for the deployed webhook):');
    line('  firebase functions:secrets:set META_DATASET_ID\n');
    line('It is NOT the app id. CAPI app events are rejected without it.\n');

    if (pixels.length) {
      line('Web pixels on this ad account (NOT for app events — do not use these):');
      for (const p of pixels) line(`  ${p.id}  ${p.name ?? ''}`);
      line('');
    }
  });
}

/** Read any node by id. */
export async function get(ctx: Ctx): Promise<void> {
  const id = ctx.rest[0];
  if (!id) throw new ValidationError('Usage: get <id> [--fields a,b,c]');
  const fields = str(ctx.args, 'fields');
  const res = await ctx.client.get(id, fields ? { fields } : {});
  ok(res, () => line(JSON.stringify(res, null, 2)));
}

/**
 * Raw Graph passthrough — the escape hatch for anything this CLI doesn't model.
 *
 * Writes still go through the client, so they are still guardrailed: a POST to
 * /campaigns here is forced PAUSED and budget-checked exactly as `campaign create` is.
 */
export async function graph(ctx: Ctx): Promise<void> {
  const path = ctx.rest[0];
  if (!path) {
    throw new ValidationError('Usage: graph <path> [--fields ...] [--method POST --field k=v]');
  }

  const method = (str(ctx.args, 'method') ?? 'GET').toUpperCase();

  if (method === 'GET') {
    const fields = str(ctx.args, 'fields');
    const res = await ctx.client.get(path, fields ? { fields } : {});
    return ok(res, () => line(JSON.stringify(res, null, 2)));
  }

  if (method === 'DELETE') {
    const res = await ctx.client.delete(path);
    return ok(res, () => line(JSON.stringify(res, null, 2)));
  }

  if (method !== 'POST') throw new ValidationError(`Unsupported --method ${method}. Use GET, POST or DELETE.`);

  const raw = ctx.args.flags.field;
  const fields = raw === undefined ? [] : Array.isArray(raw) ? raw : [String(raw)];
  const params: Record<string, unknown> = {};
  for (const pair of fields) {
    const eq = String(pair).indexOf('=');
    if (eq < 0) throw new ValidationError(`--field must be key=value. Got: ${pair}`);
    const key = String(pair).slice(0, eq);
    const value = String(pair).slice(eq + 1);
    // Let callers pass nested JSON, e.g. --field targeting='{"geo_locations":...}'
    try {
      params[key] = JSON.parse(value);
    } catch {
      params[key] = value;
    }
  }

  const res = await ctx.client.post(path, params);
  ok(res, () => line(JSON.stringify(res, null, 2)));
}
