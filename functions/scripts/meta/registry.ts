/** The command table. Also generates `help`. */
import * as ads from './ads';
import * as adsets from './adsets';
import * as audiences from './audiences';
import * as campaigns from './campaigns';
import { Handler } from './context';
import * as creatives from './creatives';
import { doctor } from './doctor';
import * as insights from './insights';
import * as launch from './launch';
import * as misc from './misc';
import { selftest } from './selftest';
import * as uploads from './uploads';

export interface Command {
  /** Space-separated, e.g. "adset pause". Matched longest-first. */
  name: string;
  group: string;
  summary: string;
  usage?: string;
  handler: Handler;
  /** Commands that never touch the network, so they run without a token. */
  offline?: boolean;
  /**
   * Commands that diagnose a broken setup and so must not be gated on it working.
   *
   * The bootstrap reads the ad account up front to learn its currency and budget floor. If
   * the token is dead that read throws — which would take down `doctor`, the one command
   * whose entire job is to tell you the token is dead. It reads and reports the account
   * itself anyway, and creates nothing, so it needs no budget floor.
   */
  selfDiagnosing?: boolean;
}

export const COMMANDS: Command[] = [
  // Preflight
  { name: 'doctor', group: 'Preflight', summary: 'Check every prerequisite. Run this first.', handler: doctor, selfDiagnosing: true },
  { name: 'selftest', group: 'Preflight', summary: 'Offline check of every request builder. No token needed.', handler: selftest, offline: true },

  // Decide
  {
    name: 'report',
    group: 'Decide',
    summary: 'Normalized performance: spend, CPI, signups, purchases, ROAS.',
    usage: 'report [--days 7] [--level campaign|adset|ad] [--json]',
    handler: insights.report,
  },
  { name: 'insights', group: 'Decide', summary: 'Human-readable spend breakdown by campaign.', usage: 'insights [--days 7]', handler: insights.insights },

  // Campaign
  { name: 'campaigns', group: 'Campaign', summary: 'List campaigns.', handler: campaigns.listCampaigns },
  { name: 'campaign list', group: 'Campaign', summary: 'List campaigns.', handler: campaigns.listCampaigns },
  {
    name: 'campaign create',
    group: 'Campaign',
    summary: 'Create a campaign (PAUSED).',
    usage: 'campaign create --name <n> [--daily-budget <cents>] [--bid-strategy <s>] [--no-skan]',
    handler: campaigns.createCampaign,
  },
  { name: 'campaign update', group: 'Campaign', summary: 'Rename or rebudget.', usage: 'campaign update <id> [--name] [--daily-budget <cents>]', handler: campaigns.updateCampaign },
  { name: 'campaign pause', group: 'Campaign', summary: 'Stop it spending.', usage: 'campaign pause <id>', handler: campaigns.pauseCampaign },
  {
    name: 'campaign archive',
    group: 'Campaign',
    summary: 'Archive it — frees a SKAN slot and KEEPS its reporting history. Prefer over delete.',
    usage: 'campaign archive <id>',
    handler: campaigns.archiveCampaign,
  },
  { name: 'campaign resume', group: 'Campaign', summary: 'ACTIVATE it. This starts spending money.', usage: 'campaign resume <id>', handler: campaigns.resumeCampaign },
  { name: 'campaign delete', group: 'Campaign', summary: 'Delete. Refuses if it has spend history unless --force.', usage: 'campaign delete <id> [--force]', handler: campaigns.deleteCampaign },

  // Ad set
  { name: 'adsets', group: 'Ad set', summary: 'List ad sets.', usage: 'adsets [--campaign <id>]', handler: adsets.listAdSets },
  { name: 'adset list', group: 'Ad set', summary: 'List ad sets.', usage: 'adset list [--campaign <id>]', handler: adsets.listAdSets },
  {
    name: 'adset create',
    group: 'Ad set',
    summary: 'Create an ad set (PAUSED).',
    usage:
      'adset create --campaign <id> --name <n> [--daily-budget <cents>] [--optimization-goal APP_INSTALLS]\n' +
      '                     [--countries US,CA] [--age-min 25] [--age-max 55] [--interests <ids>] [--exclude-audience <ids>]',
    handler: adsets.createAdSet,
  },
  { name: 'adset update', group: 'Ad set', summary: 'Rename, rebudget, rebid.', usage: 'adset update <id> [--name] [--daily-budget <cents>]', handler: adsets.updateAdSet },
  { name: 'adset pause', group: 'Ad set', summary: 'Stop it spending.', usage: 'adset pause <id>', handler: adsets.pauseAdSet },
  { name: 'adset resume', group: 'Ad set', summary: 'ACTIVATE it. This starts spending money.', usage: 'adset resume <id>', handler: adsets.resumeAdSet },
  { name: 'adset duplicate', group: 'Ad set', summary: 'Copy it (PAUSED). The safe way to test a budget change.', usage: 'adset duplicate <id> [--name] [--daily-budget <cents>]', handler: adsets.duplicateAdSet },
  { name: 'adset delete', group: 'Ad set', summary: 'Delete an ad set.', usage: 'adset delete <id>', handler: adsets.deleteAdSet },
  { name: 'adset targeting', group: 'Ad set', summary: 'Print its targeting JSON.', usage: 'adset targeting <id>', handler: adsets.showTargeting },
  { name: 'interests search', group: 'Ad set', summary: 'Look up real interest ids. Never invent one.', usage: 'interests search <query>', handler: adsets.searchInterests },

  // Creative
  { name: 'image upload', group: 'Creative', summary: 'Upload image(s), get hash(es).', usage: 'image upload <path> [<path>...]', handler: uploads.uploadImages },
  { name: 'video upload', group: 'Creative', summary: 'Upload a video; --wait blocks until transcoded.', usage: 'video upload <path> [--thumbnail <path>] [--wait]', handler: uploads.uploadVideo },
  {
    name: 'creative create',
    group: 'Creative',
    summary: 'Build an ad creative.',
    usage: 'creative create --name <n> --primary-text <t> --headline <t> (--image-hash <h> | --video-id <id>)',
    handler: creatives.createCreative,
  },
  { name: 'creative list', group: 'Creative', summary: 'List creatives.', handler: creatives.listCreatives },
  { name: 'ad preview', group: 'Creative', summary: 'Render the ad. Free. Do this before activating.', usage: 'ad preview <id> [--format MOBILE_FEED_STANDARD]', handler: creatives.previewAd },

  // Ad
  { name: 'ad list', group: 'Ad', summary: 'List ads.', usage: 'ad list [--adset <id>] [--campaign <id>]', handler: ads.listAds },
  { name: 'ad create', group: 'Ad', summary: 'Create an ad (PAUSED).', usage: 'ad create --adset <id> --creative <id> --name <n>', handler: ads.createAd },
  { name: 'ad update', group: 'Ad', summary: 'Rename or swap its creative.', usage: 'ad update <id> [--name] [--creative <id>]', handler: ads.updateAd },
  { name: 'ad pause', group: 'Ad', summary: 'Stop it spending.', usage: 'ad pause <id>', handler: ads.pauseAd },
  { name: 'ad resume', group: 'Ad', summary: 'ACTIVATE it.', usage: 'ad resume <id>', handler: ads.resumeAd },
  { name: 'ad delete', group: 'Ad', summary: 'Delete an ad.', usage: 'ad delete <id>', handler: ads.deleteAd },

  // Audience
  {
    name: 'audience create-app',
    group: 'Audience',
    summary: 'Custom audience from app events.',
    usage: 'audience create-app --name <n> --event fb_mobile_purchase [--exclude-event <e>] [--retention-days 90]',
    handler: audiences.createAppAudience,
  },
  {
    name: 'audience create-lookalike',
    group: 'Audience',
    summary: 'Lookalike from a seed audience.',
    usage: 'audience create-lookalike --name <n> --seed <audienceId> --country US [--ratio 0.01]',
    handler: audiences.createLookalike,
  },
  { name: 'audience list', group: 'Audience', summary: 'List custom audiences.', handler: audiences.listAudiences },
  { name: 'audience attach', group: 'Audience', summary: 'Attach audiences to an ad set (read-modify-write).', usage: 'audience attach <adsetId> [--include <ids>] [--exclude <ids>]', handler: audiences.attachAudience },

  // Launch
  {
    name: 'launch',
    group: 'Launch',
    summary: 'Build a whole campaign tree from a spec. Everything PAUSED.',
    usage: 'launch --spec <file.json> [--dry-run | --validate] [--resume] [--adopt-existing]',
    handler: launch.launch,
  },
  { name: 'spec example', group: 'Launch', summary: 'Print a valid example spec.', handler: launch.specExample, offline: true },
  { name: 'spec validate', group: 'Launch', summary: 'Validate a spec offline. No network.', usage: 'spec validate --spec <file>', handler: launch.specValidate, offline: true },
  { name: 'runs', group: 'Launch', summary: 'List launch runs and their state.', handler: launch.runs, offline: true },
  { name: 'rollback', group: 'Launch', summary: 'Delete everything a run created.', usage: 'rollback --run-key <k>', handler: launch.rollback },

  // Raw
  { name: 'events', group: 'Raw', summary: 'App-event types Meta has seen.', handler: misc.events },
  { name: 'datasets', group: 'Raw', summary: 'Find META_DATASET_ID.', handler: misc.datasets },
  { name: 'get', group: 'Raw', summary: 'Read any node by id.', usage: 'get <id> [--fields a,b]', handler: misc.get },
  {
    name: 'graph',
    group: 'Raw',
    summary: 'Raw Graph call. Writes are still guardrailed.',
    usage: 'graph <path> [--fields ...] [--method POST --field k=v]',
    handler: misc.graph,
  },
];

/** Longest match wins, so `adset pause` beats a hypothetical `adset`. */
export function resolve(positional: string[]): { command: Command; rest: string[] } | undefined {
  for (const width of [2, 1]) {
    const candidate = positional.slice(0, width).join(' ');
    const command = COMMANDS.find((c) => c.name === candidate);
    if (command) return { command, rest: positional.slice(width) };
  }
  return undefined;
}

export function help(): string {
  const groups = new Map<string, Command[]>();
  const seen = new Set<string>();
  for (const c of COMMANDS) {
    // `campaigns` and `campaign list` are the same thing; list it once.
    if (seen.has(c.summary + c.group)) continue;
    seen.add(c.summary + c.group);
    if (!groups.has(c.group)) groups.set(c.group, []);
    groups.get(c.group)!.push(c);
  }

  const out: string[] = [
    '',
    'Meta Ads CLI — PickleGo',
    '',
    '  Usage:  npm run meta -- <command> [flags]',
    '          (the -- is required; without it npm eats the flags)',
    '',
    '  Everything this CLI creates is PAUSED and cannot spend money until you activate it.',
    '',
    '  Global flags:',
    '    --json                 machine-readable output',
    '    --dry-run              print the request, send nothing',
    '    --validate             have Meta validate it server-side, create nothing',
    '    --verbose              show each request',
    '    --max-daily-budget <c> raise the budget ceiling for this call only',
    '',
  ];

  for (const [group, commands] of groups) {
    out.push(`  ${group}`);
    for (const c of commands) {
      out.push(`    ${c.name.padEnd(26)} ${c.summary}`);
      if (c.usage && c.usage !== c.name) out.push(`    ${''.padEnd(26)} ${c.usage}`);
    }
    out.push('');
  }

  out.push('  Start with:  npm run meta -- doctor');
  out.push('');
  return out.join('\n');
}
