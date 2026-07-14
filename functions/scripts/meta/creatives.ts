/**
 * Ad creatives.
 *
 * Every creative needs object_story_spec.page_id — a Facebook Page the System User can
 * publish as. There is no default and no way around it, so a missing META_PAGE_ID is
 * the single most likely reason a first launch fails.
 *
 * CTA is INSTALL_MOBILE_APP. Meta publishes an 80-value global CTA enum but no
 * per-objective mapping; INSTALL_MOBILE_APP is the value used in Meta's own app-install
 * sample, so it is the one we trust.
 *
 * We deliberately do NOT set call_to_action.value.app_link (deferred deep linking) —
 * it is unavailable on SKAdNetwork campaigns (subcode 3285008).
 */
import { requireStr, str } from './args';
import { Params } from './client';
import { requireId } from './campaigns';
import { Ctx } from './context';
import { Config, require_ } from './env';
import { ValidationError } from './errors';
import { line, ok, table } from './output';

export const CREATIVE_FIELDS = 'name,object_story_spec,thumbnail_url,effective_object_story_id';

export interface CreativeInput {
  name: string;
  primaryText: string;
  headline: string;
  description?: string;
  cta?: string;
  imageHash?: string;
  videoId?: string;
  thumbnailHash?: string;
  pageId?: string;
  instagramActorId?: string;
}

/** Pure. No network. Exercised by `selftest`. */
export function buildCreative(input: CreativeInput, config: Config): Params {
  const pageId = input.pageId ?? require_(config, 'pageId');
  const storeUrl = require_(config, 'objectStoreUrl');
  const appId = require_(config, 'appId');

  if (!input.imageHash && !input.videoId) {
    throw new ValidationError(
      'A creative needs media: either an image hash or a video id.',
      'Upload one first: `image upload <path>` or `video upload <path> --wait`.',
    );
  }
  if (input.imageHash && input.videoId) {
    throw new ValidationError('A creative takes an image OR a video, not both.');
  }

  // call_to_action.value carries ONLY the link and the app. `link_title` (and
  // link_description) are deprecated here and Meta rejects them outright (subcode
  // 1815589) — the title lives in link_data.name / video_data.title instead.
  const callToAction = {
    type: input.cta ?? 'INSTALL_MOBILE_APP',
    value: {
      link: storeUrl,
      application: appId,
    },
  };

  const storySpec: Record<string, unknown> = { page_id: pageId };

  const instagram = input.instagramActorId ?? config.instagramActorId;
  if (instagram) storySpec.instagram_user_id = instagram;

  if (input.videoId) {
    const videoData: Record<string, unknown> = {
      video_id: input.videoId,
      message: input.primaryText,
      title: input.headline,
      call_to_action: callToAction,
    };
    if (input.description) videoData.link_description = input.description;
    // Meta requires a thumbnail on video_data. If we weren't given one it will fall back
    // to an auto-generated frame, but an explicit hash is far more reliable.
    if (input.thumbnailHash) videoData.image_hash = input.thumbnailHash;
    storySpec.video_data = videoData;
  } else {
    const linkData: Record<string, unknown> = {
      image_hash: input.imageHash,
      link: storeUrl,
      message: input.primaryText,
      name: input.headline,
      call_to_action: callToAction,
    };
    if (input.description) linkData.description = input.description;
    storySpec.link_data = linkData;
  }

  // Advantage+ creative enhancements used to be enabled with a single
  // degrees_of_freedom_spec.creative_features_spec.standard_enhancements block. Meta
  // deprecated that catch-all (subcode 3858504) — you must now opt into individual
  // features instead. We send nothing: Meta applies its own defaults, and enumerating
  // the current feature names here would be a guess that breaks again on the next change.
  return {
    name: input.name,
    object_story_spec: storySpec,
  };
}

export async function createCreative(ctx: Ctx): Promise<void> {
  const { client, config, args } = ctx;

  const params = buildCreative(
    {
      name: requireStr(args, 'name'),
      primaryText: requireStr(args, 'primary-text'),
      headline: requireStr(args, 'headline'),
      description: str(args, 'description'),
      cta: str(args, 'cta'),
      imageHash: str(args, 'image-hash'),
      videoId: str(args, 'video-id'),
      thumbnailHash: str(args, 'thumbnail-hash'),
      pageId: str(args, 'page'),
      instagramActorId: str(args, 'instagram-actor'),
    },
    config,
  );

  const res = await client.post(`${config.adAccountId}/adcreatives`, params);
  ok({ id: res.id, ...params }, () => {
    line(`✓ creative ${res.id} created`);
    line(`  npm run meta -- ad create --adset <id> --creative ${res.id} --name "..."`);
  });
}

export async function listCreatives(ctx: Ctx): Promise<void> {
  const rows = (await ctx.client.getAll(`${ctx.config.adAccountId}/adcreatives`, {
    fields: CREATIVE_FIELDS,
  })) as Array<Record<string, any>>;

  ok(rows, () => {
    if (!rows.length) return line('No creatives.');
    table(['ID', 'NAME'], rows.map((c) => [String(c.id), String(c.name ?? '')]));
    line(`\n${rows.length} creative(s)`);
  });
}

/**
 * Renders the ad as it will actually appear. Free, and the only way to catch a truncated
 * headline or a bad crop before spending anything.
 */
export async function previewAd(ctx: Ctx): Promise<void> {
  const id = requireId(ctx.rest, 'ad preview <id>');
  const format = str(ctx.args, 'format') ?? 'MOBILE_FEED_STANDARD';

  const res = await ctx.client.get(`${id}/previews`, { ad_format: format });
  const rows = (res.data ?? []) as Array<{ body?: string }>;
  const iframe = rows[0]?.body ?? '';
  const url = iframe.match(/src="([^"]+)"/)?.[1]?.replace(/&amp;/g, '&');

  ok({ id, format, previewUrl: url }, () => {
    if (!url) return line('No preview returned.');
    line(`Preview (${format}) — open in a browser:\n`);
    line(url);
  });
}
