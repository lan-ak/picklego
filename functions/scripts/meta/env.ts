/**
 * Config resolution for the Meta Ads CLI.
 *
 * Precedence: functions/.env.local → process.env.
 *
 * We deliberately do NOT read functions/.env. The Firebase CLI turns every value in
 * that file into a runtime environment variable on every deployed Cloud Function, and
 * a System User token with ads_management can spend money. Credentials belong in
 * .env.local, which Firebase never deploys.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

// One version for every Meta integration in the repo — the CLI here and the Conversions
// API in src/meta. They were on different versions (v25.0 vs v21.0) until this was shared.
export { GRAPH_HOST, GRAPH_VERSION } from '../../src/meta/graph';

const FUNCTIONS_DIR = join(__dirname, '..', '..');

function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return out;
  }
  for (const line of raw.split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match) out[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const fileEnv = parseEnvFile(join(FUNCTIONS_DIR, '.env.local'));

function read(key: string): string | undefined {
  const value = fileEnv[key] ?? process.env[key];
  return value && value.length > 0 ? value : undefined;
}

function int(key: string, fallback: number): number {
  const raw = read(key);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`${key} must be a non-negative integer (minor units). Got: ${raw}`);
  }
  return n;
}

export interface Config {
  accessToken: string;
  appSecret?: string;
  adAccountId: string;
  appId?: string;
  pageId?: string;
  instagramActorId?: string;
  datasetId?: string;
  objectStoreUrl?: string;
  maxDailyBudgetCents: number;
  maxLifetimeBudgetCents: number;
  maxBidCents: number;
  maxAccountDailyCents: number;
}

/**
 * Every ad account id the CLI acts on passes through here — the configured one and the
 * `--account` override alike. Without the act_ prefix every request 404s with a Graph
 * error that names no cause, so catching it here is worth the two lines.
 */
export function assertAdAccountId(id: string): string {
  if (!id.startsWith('act_') || id === 'act_') {
    throw new Error(`Ad account id must include the act_ prefix and an id. Got: ${id}`);
  }
  return id;
}

/** Values every command needs. Throws with the exact missing key and where to put it. */
export function loadConfig(): Config {
  const accessToken = read('META_ACCESS_TOKEN');
  const adAccountId = read('META_AD_ACCOUNT_ID');

  const missing: string[] = [];
  if (!accessToken) missing.push('META_ACCESS_TOKEN');
  if (!adAccountId || adAccountId === 'act_') missing.push('META_AD_ACCOUNT_ID');
  if (missing.length) {
    throw new Error(
      `Missing ${missing.join(', ')} in functions/.env.local.\n` +
        `Copy functions/.env.local.example and fill it in, then run: npm run meta -- doctor`,
    );
  }

  assertAdAccountId(adAccountId!);

  return {
    accessToken: accessToken!,
    appSecret: read('META_APP_SECRET'),
    adAccountId: adAccountId!,
    appId: read('META_APP_ID'),
    pageId: read('META_PAGE_ID'),
    instagramActorId: read('META_INSTAGRAM_ACTOR_ID'),
    datasetId: read('META_DATASET_ID'),
    objectStoreUrl: read('META_OBJECT_STORE_URL'),
    maxDailyBudgetCents: int('META_MAX_DAILY_BUDGET_CENTS', 5000),
    maxLifetimeBudgetCents: int('META_MAX_LIFETIME_BUDGET_CENTS', 50000),
    maxBidCents: int('META_MAX_BID_CENTS', 1000),
    maxAccountDailyCents: int('META_MAX_ACCOUNT_DAILY_CENTS', 10000),
  };
}

/** Config keys that commands require individually, with a fix-it message each. */
export function require_(config: Config, key: 'appId' | 'pageId' | 'datasetId' | 'objectStoreUrl'): string {
  const value = config[key];
  if (value) return value;
  const envKey = {
    appId: 'META_APP_ID',
    pageId: 'META_PAGE_ID',
    datasetId: 'META_DATASET_ID',
    objectStoreUrl: 'META_OBJECT_STORE_URL',
  }[key];
  const hint = {
    appId: 'Your Meta app ID (App Dashboard → Settings → Basic).',
    pageId:
      'Every ad creative needs a Facebook Page: object_story_spec.page_id has no default. ' +
      'Find yours with: npm run meta -- graph me/accounts',
    datasetId: 'Find it with: npm run meta -- datasets',
    objectStoreUrl: 'The App Store URL, e.g. https://apps.apple.com/app/id6743630735',
  }[key];
  throw new Error(`Missing ${envKey} in functions/.env.local. ${hint}`);
}
