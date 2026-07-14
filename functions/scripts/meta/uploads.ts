/**
 * Creative asset upload: /adimages and /advideos.
 *
 * Images are content-deduped by Meta, so re-uploading the same file is free and returns
 * the same hash — uploads are naturally idempotent.
 *
 * Videos are NOT: /advideos returns an id immediately, but the video is unusable until
 * Meta finishes transcoding. Building a creative against a still-processing video fails
 * intermittently, which presents as a flaky CLI. Hence --wait, which `launch` always uses.
 */
import { statSync } from 'fs';
import { basename, extname, resolve } from 'path';

import { bool, str } from './args';
import { GraphResponse } from './client';
import { Ctx } from './context';
import { ValidationError } from './errors';
import { debug, line, ok, table } from './output';

const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

const VIDEO_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
};

function contentType(path: string, table_: Record<string, string>, kind: string): string {
  const ext = extname(path).toLowerCase();
  const type = table_[ext];
  if (!type) {
    throw new ValidationError(
      `Unsupported ${kind} format "${ext || '(none)'}" for ${path}.`,
      `Supported: ${Object.keys(table_).join(', ')}`,
    );
  }
  return type;
}

function assertReadable(path: string): string {
  const full = resolve(path);
  try {
    const stat = statSync(full);
    if (!stat.isFile()) throw new Error('not a file');
    if (stat.size === 0) throw new Error('file is empty');
  } catch (err) {
    throw new ValidationError(`Cannot read ${full}: ${(err as Error).message}`);
  }
  return full;
}

/** Upload one or more images. Returns [{ path, hash }]. */
export async function uploadImages(ctx: Ctx): Promise<void> {
  const paths = ctx.rest;
  if (!paths.length) throw new ValidationError('Usage: image upload <path> [<path>...]');

  const results: Array<{ path: string; hash: string }> = [];
  for (const p of paths) {
    const full = assertReadable(p);
    const res = await ctx.client.upload(`${ctx.config.adAccountId}/adimages`, [
      { field: basename(full), path: full, contentType: contentType(full, IMAGE_TYPES, 'image') },
    ]);
    results.push({ path: p, hash: extractImageHash(res, p) });
  }

  ok(results, () => {
    table(['HASH', 'FILE'], results.map((r) => [r.hash, r.path]));
    line('\nPass a hash to: creative create --image-hash <hash>');
  });
}

/**
 * The response is keyed by how the file was sent (filename for multipart, "bytes" for
 * base64), so indexing by a hardcoded key breaks. Take the first value instead.
 */
export function extractImageHash(res: GraphResponse, label: string): string {
  if (res._dryRun) return 'dry-run-hash';
  const images = res.images as Record<string, { hash?: string }> | undefined;
  const first = images && Object.values(images)[0];
  if (!first?.hash) {
    throw new ValidationError(`Upload of ${label} returned no image hash: ${JSON.stringify(res)}`);
  }
  return first.hash;
}

/** Upload a video; with --wait, block until Meta has finished transcoding it. */
export async function uploadVideo(ctx: Ctx): Promise<void> {
  const path = ctx.rest[0];
  if (!path) throw new ValidationError('Usage: video upload <path> [--thumbnail <path>] [--wait]');

  const full = assertReadable(path);
  const res = await ctx.client.upload(
    `${ctx.config.adAccountId}/advideos`,
    [{ field: 'source', path: full, contentType: contentType(full, VIDEO_TYPES, 'video') }],
    { title: str(ctx.args, 'title') ?? basename(full), name: basename(full) },
  );

  const videoId = String(res.id ?? '');
  let ready: boolean | undefined;
  if (bool(ctx.args, 'wait') && videoId && videoId !== 'dry-run') {
    ready = await waitForVideo(ctx, videoId);
  }

  // video_data requires a thumbnail; omitting it is a common creative-create failure.
  let thumbnailHash: string | undefined;
  const thumb = str(ctx.args, 'thumbnail');
  if (thumb) {
    const thumbFull = assertReadable(thumb);
    const thumbRes = await ctx.client.upload(`${ctx.config.adAccountId}/adimages`, [
      {
        field: basename(thumbFull),
        path: thumbFull,
        contentType: contentType(thumbFull, IMAGE_TYPES, 'image'),
      },
    ]);
    thumbnailHash = extractImageHash(thumbRes, thumb);
  }

  ok({ videoId, ready, thumbnailHash }, () => {
    line(`✓ video ${videoId} uploaded${ready ? ' and processed' : ''}`);
    if (thumbnailHash) line(`  thumbnail hash: ${thumbnailHash}`);
    if (!thumbnailHash) {
      line('\n  No thumbnail. A video creative needs one — either pass --thumbnail <path>,');
      line('  or `creative create` will pull an auto-generated frame from the video.');
    }
    line(`\n  creative create --video-id ${videoId}${thumbnailHash ? ` --thumbnail-hash ${thumbnailHash}` : ''} ...`);
  });
}

/**
 * Poll until the video is usable.
 *
 * Meta documents `status.processing_phase.status === 'complete'`, while the older and
 * widely-observed shape is `status.video_status === 'ready'`. Which one a given account
 * returns is not something the docs settle, so accept either and log the raw object once
 * under --verbose rather than guessing.
 */
export async function waitForVideo(ctx: Ctx, videoId: string, timeoutMs = 300_000): Promise<boolean> {
  const started = Date.now();
  let delay = 2000;
  let logged = false;

  while (Date.now() - started < timeoutMs) {
    const res = (await ctx.client.get(videoId, { fields: 'status' })) as Record<string, any>;
    const status = res.status ?? {};
    if (!logged) {
      debug(`video status shape: ${JSON.stringify(status)}`);
      logged = true;
    }

    const phase = status.processing_phase?.status;
    const legacy = status.video_status;

    if (phase === 'complete' || legacy === 'ready') return true;
    if (phase === 'error' || legacy === 'error') {
      throw new ValidationError(
        `Meta failed to process video ${videoId}: ${JSON.stringify(status)}`,
        'Re-encode the video (H.264/MP4 is safest) and upload again.',
      );
    }

    debug(`video ${videoId} still processing (${phase ?? legacy ?? 'unknown'}), waiting ${delay}ms`);
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.5, 30_000);
  }

  throw new ValidationError(
    `Video ${videoId} was still processing after ${timeoutMs / 1000}s.`,
    'It may still finish. Check with: npm run meta -- get <videoId> --fields status',
  );
}
