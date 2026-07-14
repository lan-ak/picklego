/**
 * The launch spec: one JSON file describing a whole campaign tree.
 *
 * Validated by hand rather than with a schema library, because the errors are the point.
 * A generic "expected number at adsets[0].dailyBudgetCents" costs an agent a turn of
 * guessing; "APP_INSTALLS is an optimization goal, not an objective — you've put it in
 * the wrong field" fixes it immediately. That difference is worth 150 lines.
 *
 * Note what the schema does NOT contain: any `status` field, anywhere. You cannot express
 * "launch this live". Everything is created PAUSED. That is the whole contract.
 */
import { readFileSync } from 'fs';
import { dirname, isAbsolute, resolve } from 'path';

import { ValidationError } from './errors';

export interface MediaSpec {
  type: 'image' | 'video';
  path?: string;
  hash?: string;
  id?: string;
  thumbnailPath?: string;
  thumbnailHash?: string;
}

export interface CreativeSpec {
  name?: string;
  pageId?: string;
  instagramActorId?: string;
  primaryText: string;
  headline: string;
  description?: string;
  cta?: string;
  media: MediaSpec;
}

export interface AdSpec {
  name: string;
  creative: CreativeSpec;
}

export interface TargetingSpec {
  countries?: string[];
  ageMin?: number;
  ageMax?: number;
  genders?: 'all' | 'male' | 'female';
  interestIds?: string[];
  includeAudienceIds?: string[];
  excludeAudienceIds?: string[];
  publisherPlatforms?: string[];
  advantageAudience?: boolean;
  raw?: Record<string, unknown>;
}

export interface AdSetSpec {
  name: string;
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
  targeting?: TargetingSpec;
  ads: AdSpec[];
}

export interface CampaignSpec {
  name: string;
  objective?: string;
  dailyBudgetCents?: number;
  lifetimeBudgetCents?: number;
  bidStrategy?: string;
  specialAdCategories?: string[];
  skadnetwork?: boolean;
}

export interface LaunchSpec {
  runKey: string;
  campaign: CampaignSpec;
  adsets: AdSetSpec[];
  /** Directory the spec was loaded from. Media paths resolve against it, not cwd. */
  _baseDir: string;
}

const CAMPAIGN_KEYS = new Set([
  'name', 'objective', 'dailyBudgetCents', 'lifetimeBudgetCents', 'bidStrategy',
  'specialAdCategories', 'skadnetwork',
]);
const ADSET_KEYS = new Set([
  'name', 'dailyBudgetCents', 'lifetimeBudgetCents', 'optimizationGoal', 'billingEvent',
  'bidStrategy', 'bidAmountCents', 'customEventType', 'customEventStr', 'skadnetwork',
  'startTime', 'endTime', 'targeting', 'ads',
]);
const AD_KEYS = new Set(['name', 'creative']);
const CREATIVE_KEYS = new Set([
  'name', 'pageId', 'instagramActorId', 'primaryText', 'headline', 'description', 'cta', 'media',
]);
const TARGETING_KEYS = new Set([
  'countries', 'ageMin', 'ageMax', 'genders', 'interestIds', 'includeAudienceIds',
  'excludeAudienceIds', 'publisherPlatforms', 'advantageAudience', 'raw',
]);
const MEDIA_KEYS = new Set(['type', 'path', 'hash', 'id', 'thumbnailPath', 'thumbnailHash']);

function rejectUnknown(obj: Record<string, unknown>, allowed: Set<string>, path: string): void {
  for (const key of Object.keys(obj)) {
    if (allowed.has(key)) continue;
    // A silently-ignored typo produces an ad set with default targeting and a real budget.
    if (key === 'status') {
      throw new ValidationError(
        `${path}.status is not allowed.`,
        'Everything a launch creates is PAUSED — that is the guarantee this CLI makes, and it is not overridable. ' +
          'Launch it, then activate it with `campaign resume <id>` once a human has looked at it.',
      );
    }
    const near = [...allowed].find((a) => a.toLowerCase() === key.toLowerCase());
    throw new ValidationError(
      `Unknown key ${path}.${key}`,
      near
        ? `Did you mean "${near}"? (Case matters.)`
        : `Allowed here: ${[...allowed].join(', ')}`,
    );
  }
}

/** Money is always integer minor units. A float or a "$30" here is a 100x bug waiting. */
function cents(value: unknown, path: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string') {
    throw new ValidationError(
      `${path} must be a number, not a string. Got: ${JSON.stringify(value)}`,
      'Money in the Meta API is integer minor units (cents). $30.00/day is 3000.',
    );
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new ValidationError(
      `${path} must be a positive whole number of cents. Got: ${JSON.stringify(value)}`,
      'Integer cents: $30.00/day is 3000, not 30 and not 30.00.',
    );
  }
  return value;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ValidationError(`${path} is required and must be a non-empty string.`);
  }
  return value;
}

export function parseSpec(raw: unknown, baseDir: string): LaunchSpec {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ValidationError('The spec must be a JSON object.');
  }
  const root = raw as Record<string, unknown>;
  rejectUnknown(root, new Set(['runKey', 'campaign', 'adsets']), 'spec');

  const runKey = requireString(root.runKey, 'spec.runKey');
  if (!/^[a-z0-9][a-z0-9-_]*$/i.test(runKey)) {
    throw new ValidationError(
      `spec.runKey must be a simple slug (letters, digits, - and _). Got: ${runKey}`,
      'It becomes a filename in functions/.meta-runs/ and is the idempotency key for the whole launch.',
    );
  }

  if (typeof root.campaign !== 'object' || root.campaign === null) {
    throw new ValidationError('spec.campaign is required.');
  }
  const c = root.campaign as Record<string, unknown>;
  rejectUnknown(c, CAMPAIGN_KEYS, 'spec.campaign');

  if (c.objective === 'APP_INSTALLS') {
    throw new ValidationError(
      'spec.campaign.objective is APP_INSTALLS, which is not a campaign objective.',
      'APP_INSTALLS is an ad set optimization goal. The campaign objective is OUTCOME_APP_PROMOTION ' +
        '(and it is the default — you can simply omit it). Did you mean adsets[].optimizationGoal?',
    );
  }

  const campaign: CampaignSpec = {
    name: requireString(c.name, 'spec.campaign.name'),
    objective: c.objective as string | undefined,
    dailyBudgetCents: cents(c.dailyBudgetCents, 'spec.campaign.dailyBudgetCents'),
    lifetimeBudgetCents: cents(c.lifetimeBudgetCents, 'spec.campaign.lifetimeBudgetCents'),
    bidStrategy: c.bidStrategy as string | undefined,
    specialAdCategories: c.specialAdCategories as string[] | undefined,
    skadnetwork: c.skadnetwork as boolean | undefined,
  };

  if (!Array.isArray(root.adsets) || !root.adsets.length) {
    throw new ValidationError('spec.adsets must be a non-empty array.');
  }
  if (root.adsets.length > 5) {
    throw new ValidationError(
      `spec.adsets has ${root.adsets.length} ad sets. SKAdNetwork allows at most 5 per campaign (subcode 2490238).`,
    );
  }

  const campaignBudget = campaign.dailyBudgetCents ?? campaign.lifetimeBudgetCents;

  const adsets = (root.adsets as unknown[]).map((rawAdset, i) => {
    const path = `spec.adsets[${i}]`;
    if (typeof rawAdset !== 'object' || rawAdset === null) {
      throw new ValidationError(`${path} must be an object.`);
    }
    const a = rawAdset as Record<string, unknown>;
    rejectUnknown(a, ADSET_KEYS, path);

    const adsetBudget = cents(a.dailyBudgetCents, `${path}.dailyBudgetCents`);
    const adsetLifetime = cents(a.lifetimeBudgetCents, `${path}.lifetimeBudgetCents`);

    // Meta rejects budgets at both levels, with an error that explains nothing.
    if (campaignBudget && (adsetBudget || adsetLifetime)) {
      throw new ValidationError(
        `Budget is set on both the campaign and ${path}. Meta allows one or the other, not both.`,
        'A campaign-level budget (Advantage+ / CBO) is the recommendation for a small budget — Meta shifts spend ' +
          'between ad sets for you. Remove the ad set budgets, or remove the campaign budget.',
      );
    }
    if (!campaignBudget && !adsetBudget && !adsetLifetime) {
      throw new ValidationError(
        `${path} has no budget, and neither does the campaign.`,
        'Set spec.campaign.dailyBudgetCents (recommended — this is Advantage+ budget), or give every ad set its own.',
      );
    }

    if (a.targeting !== undefined) {
      if (typeof a.targeting !== 'object' || a.targeting === null) {
        throw new ValidationError(`${path}.targeting must be an object.`);
      }
      rejectUnknown(a.targeting as Record<string, unknown>, TARGETING_KEYS, `${path}.targeting`);
    }

    if (!Array.isArray(a.ads) || !a.ads.length) {
      throw new ValidationError(`${path}.ads must be a non-empty array — an ad set with no ads cannot deliver.`);
    }

    const ads = (a.ads as unknown[]).map((rawAd, j) => parseAd(rawAd, `${path}.ads[${j}]`, baseDir));

    return {
      name: requireString(a.name, `${path}.name`),
      dailyBudgetCents: adsetBudget,
      lifetimeBudgetCents: adsetLifetime,
      optimizationGoal: a.optimizationGoal as string | undefined,
      billingEvent: a.billingEvent as string | undefined,
      bidStrategy: a.bidStrategy as string | undefined,
      bidAmountCents: cents(a.bidAmountCents, `${path}.bidAmountCents`),
      customEventType: a.customEventType as string | undefined,
      customEventStr: a.customEventStr as string | undefined,
      skadnetwork: a.skadnetwork as boolean | undefined,
      startTime: a.startTime as string | undefined,
      endTime: a.endTime as string | undefined,
      targeting: a.targeting as TargetingSpec | undefined,
      ads,
    } satisfies AdSetSpec;
  });

  return { runKey, campaign, adsets, _baseDir: baseDir };
}

function parseAd(raw: unknown, path: string, baseDir: string): AdSpec {
  if (typeof raw !== 'object' || raw === null) throw new ValidationError(`${path} must be an object.`);
  const a = raw as Record<string, unknown>;
  rejectUnknown(a, AD_KEYS, path);

  if (typeof a.creative !== 'object' || a.creative === null) {
    throw new ValidationError(`${path}.creative is required.`);
  }
  const c = a.creative as Record<string, unknown>;
  rejectUnknown(c, CREATIVE_KEYS, `${path}.creative`);

  if (typeof c.media !== 'object' || c.media === null) {
    throw new ValidationError(`${path}.creative.media is required — an ad needs an image or a video.`);
  }
  const m = c.media as Record<string, unknown>;
  rejectUnknown(m, MEDIA_KEYS, `${path}.creative.media`);

  if (m.type !== 'image' && m.type !== 'video') {
    throw new ValidationError(`${path}.creative.media.type must be "image" or "video".`);
  }
  if (m.type === 'image' && !m.path && !m.hash) {
    throw new ValidationError(`${path}.creative.media needs a "path" (to upload) or a "hash" (already uploaded).`);
  }
  if (m.type === 'video' && !m.path && !m.id) {
    throw new ValidationError(`${path}.creative.media needs a "path" (to upload) or an "id" (already uploaded).`);
  }

  // Media paths resolve against the spec file, not the shell's cwd — otherwise the same
  // spec works or fails depending on which directory you happen to run it from.
  const media: MediaSpec = { type: m.type };
  if (m.path) media.path = resolveMedia(m.path as string, baseDir, `${path}.creative.media.path`);
  if (m.thumbnailPath) {
    media.thumbnailPath = resolveMedia(m.thumbnailPath as string, baseDir, `${path}.creative.media.thumbnailPath`);
  }
  if (m.hash) media.hash = m.hash as string;
  if (m.id) media.id = m.id as string;
  if (m.thumbnailHash) media.thumbnailHash = m.thumbnailHash as string;

  return {
    name: requireString(a.name, `${path}.name`),
    creative: {
      name: (c.name as string) ?? `${requireString(a.name, `${path}.name`)} — creative`,
      pageId: c.pageId as string | undefined,
      instagramActorId: c.instagramActorId as string | undefined,
      primaryText: requireString(c.primaryText, `${path}.creative.primaryText`),
      headline: requireString(c.headline, `${path}.creative.headline`),
      description: c.description as string | undefined,
      cta: c.cta as string | undefined,
      media,
    },
  };
}

function resolveMedia(p: string, baseDir: string, path: string): string {
  const full = isAbsolute(p) ? p : resolve(baseDir, p);
  try {
    readFileSync(full);
  } catch {
    throw new ValidationError(`${path}: cannot read ${full}`, 'Paths are resolved relative to the spec file.');
  }
  return full;
}

export function loadSpec(file: string): LaunchSpec {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (err) {
    throw new ValidationError(`Cannot read spec file ${file}: ${(err as Error).message}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new ValidationError(`${file} is not valid JSON: ${(err as Error).message}`);
  }
  return parseSpec(json, dirname(resolve(file)));
}

export const EXAMPLE_SPEC = {
  runKey: 'us-installs-2026-07',
  campaign: {
    name: 'PickleGo | iOS Installs | US | Jul 2026',
    // Budget at the campaign level is Advantage+ budget (CBO). With advantageAudience and
    // unrestricted placements, this is what earns the campaign Advantage+ status.
    dailyBudgetCents: 3000,
    bidStrategy: 'LOWEST_COST_WITHOUT_CAP',
  },
  adsets: [
    {
      name: 'Broad | US | 25-55',
      optimizationGoal: 'APP_INSTALLS',
      billingEvent: 'IMPRESSIONS',
      targeting: {
        countries: ['US'],
        ageMin: 25,
        ageMax: 55,
        advantageAudience: true,
      },
      ads: [
        {
          name: 'Ad | Static | Rally',
          creative: {
            primaryText: 'Find a pickleball game near you tonight. Free to join.',
            headline: 'Play more pickleball',
            description: 'Track matches, find players',
            cta: 'INSTALL_MOBILE_APP',
            media: { type: 'image', path: './creative/rally.png' },
          },
        },
      ],
    },
  ],
};
