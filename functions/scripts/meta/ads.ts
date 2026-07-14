/** Ads — the join between an ad set and a creative. */
import { requireStr, str } from './args';
import { Params } from './client';
import { requireId } from './campaigns';
import { Ctx } from './context';
import { ValidationError } from './errors';
import { line, ok, table } from './output';

export const AD_FIELDS = 'name,status,effective_status,adset_id,creative{id,name},created_time';

/** Pure. No network. Exercised by `selftest`. */
export function buildAd(input: { name: string; adsetId: string; creativeId: string }): Params {
  return {
    name: input.name,
    adset_id: input.adsetId,
    creative: { creative_id: input.creativeId },
    // status is forced to PAUSED by the client.
  };
}

export async function listAds(ctx: Ctx): Promise<void> {
  const { client, config, args } = ctx;
  const adset = str(args, 'adset');
  const campaign = str(args, 'campaign');
  const path = adset ? `${adset}/ads` : campaign ? `${campaign}/ads` : `${config.adAccountId}/ads`;

  const rows = (await client.getAll(path, { fields: AD_FIELDS })) as Array<Record<string, any>>;
  ok(rows, () => {
    if (!rows.length) return line('No ads.');
    table(
      ['ID', 'STATUS', 'CREATIVE', 'NAME'],
      rows.map((a) => [
        String(a.id),
        String(a.effective_status ?? a.status),
        String(a.creative?.id ?? '—'),
        String(a.name),
      ]),
    );
    line(`\n${rows.length} ad(s)`);
  });
}

export async function createAd(ctx: Ctx): Promise<void> {
  const { client, config, args } = ctx;
  const params = buildAd({
    name: requireStr(args, 'name'),
    adsetId: requireStr(args, 'adset'),
    creativeId: requireStr(args, 'creative'),
  });

  const res = await client.post(`${config.adAccountId}/ads`, params);
  ok({ id: res.id, status: 'PAUSED', ...params }, () => {
    line(`✓ ad ${res.id} created — PAUSED`);
    line(`  Preview it before activating: npm run meta -- ad preview ${res.id}`);
  });
}

export async function updateAd(ctx: Ctx): Promise<void> {
  const { client, args, rest } = ctx;
  const id = requireId(rest, 'ad update <id>');

  const params: Params = {};
  const name = str(args, 'name');
  const creative = str(args, 'creative');
  if (name) params.name = name;
  if (creative) params.creative = { creative_id: creative };
  if (!Object.keys(params).length) {
    throw new ValidationError('Nothing to update. Pass --name or --creative.');
  }

  await client.post(id, params);
  ok({ id, updated: params }, () => line(`✓ ad ${id} updated`));
}

export async function pauseAd(ctx: Ctx): Promise<void> {
  const id = requireId(ctx.rest, 'ad pause <id>');
  await ctx.client.post(id, { status: 'PAUSED' });
  ok({ id, status: 'PAUSED' }, () => line(`✓ ad ${id} paused`));
}

export async function resumeAd(ctx: Ctx): Promise<void> {
  const id = requireId(ctx.rest, 'ad resume <id>');
  await ctx.client.post(id, { status: 'ACTIVE' });
  ok({ id, status: 'ACTIVE' }, () => {
    line(`✓ ad ${id} is now ACTIVE`);
    line('  It only delivers if its ad set and campaign are ACTIVE too.');
  });
}

export async function deleteAd(ctx: Ctx): Promise<void> {
  const id = requireId(ctx.rest, 'ad delete <id>');
  await ctx.client.delete(id);
  ok({ id, deleted: true }, () => line(`✓ ad ${id} deleted`));
}
