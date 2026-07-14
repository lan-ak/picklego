/**
 * Error types + the hint table.
 *
 * Graph API errors are famously unhelpful: `code` is almost always 100, and the real
 * meaning lives in `error_subcode`. The hint table maps the ~20 subcodes that actually
 * bite this project to an actionable fix, so a failure tells you what to do rather than
 * just what went wrong. Keep it in sync with the skill's references/troubleshooting.md.
 */

export type ErrorType = 'graph' | 'validation' | 'guardrail' | 'unknown_state';

export interface ErrorPayload {
  type: ErrorType;
  message: string;
  code?: number;
  subcode?: number;
  fbtraceId?: string;
  hint?: string;
  path?: string;
}

export class CliError extends Error {
  constructor(readonly payload: ErrorPayload) {
    super(payload.message);
    this.name = 'CliError';
  }
}

/** A guardrail refused the request. Nothing was sent. Exit code 3. */
export class GuardrailError extends CliError {
  constructor(message: string, hint?: string) {
    super({ type: 'guardrail', message, hint });
    this.name = 'GuardrailError';
  }
}

/** Bad input, caught before the network. Exit code 2. */
export class ValidationError extends CliError {
  constructor(message: string, hint?: string) {
    super({ type: 'validation', message, hint });
    this.name = 'ValidationError';
  }
}

/** Meta rejected the request. Exit code 1. */
export class GraphError extends CliError {
  constructor(payload: Omit<ErrorPayload, 'type'>) {
    super({ ...payload, type: 'graph' });
    this.name = 'GraphError';
  }
}

/**
 * A write may or may not have landed — a POST that timed out could have created an
 * object whose id we never saw. Never auto-retry this. Exit code 4.
 */
export class UnknownStateError extends CliError {
  constructor(message: string, hint?: string) {
    super({ type: 'unknown_state', message, hint });
    this.name = 'UnknownStateError';
  }
}

/**
 * Some subcodes are overloaded — Meta reuses 1885183 for at least two unrelated errors
 * (app in development mode, and Custom Audience TOS not accepted). A subcode-only lookup
 * confidently emits the wrong fix, which is worse than no fix at all. These are matched
 * on a keyword in the message first, and only then by subcode.
 */
const MESSAGE_HINTS: Array<{ match: RegExp; hint: string }> = [
  {
    match: /development mode/i,
    hint:
      'The Meta app is in Development Mode, which cannot create live ad creatives. A human must switch it to ' +
      'Live: App Dashboard → top bar toggle (App Mode: Development → Live). This may first require a Privacy ' +
      'Policy URL on the app. Claude cannot do this.',
  },
  {
    match: /custom audience.*(terms|tos)|terms of service/i,
    hint:
      'The ad account has not accepted the Custom Audience Terms of Service. A human must accept them at ' +
      'business.facebook.com → Business Settings → Ad Accounts → Custom Audience Terms. Claude cannot do this.',
  },
  {
    match: /link title and link description are deprecated/i,
    hint:
      'call_to_action.value may not carry link_title/link_description. The title belongs in link_data.name ' +
      '(image ads) or video_data.title (video ads). The CLI already does this — you only see it if you hand-built ' +
      'a creative via `graph --method POST`.',
  },
];

/** subcode → what to actually do about it. */
const SUBCODE_HINTS: Record<number, string> = {
  2446685:
    'This ad account is not authorised to advertise this app. Add it in App Dashboard → Settings → Advanced → ' +
    'Advertising Accounts, then wait for approval.',
  2490247:
    'The ad account is not linked to the app. App Dashboard → Settings → Advanced → Advertising Accounts.',
  3285010:
    'App ownership is not verified. Verify the app in Business Settings before creating campaigns.',
  2446686:
    'Another ad account already promotes this app under SKAdNetwork. Only ONE ad account per app is allowed. ' +
    'Use that account, or remove the app from the other one.',
  2446697: 'Only one ad account may promote a given app under SKAdNetwork.',

  // --- SKAdNetwork constraints. These are hard limits, not warnings.
  2446692:
    'SKAdNetwork limit: an app may have at most 9 campaigns across all ad accounts. Free a slot with: ' +
    'npm run meta -- campaign archive <id>  (archiving keeps the campaign\'s reporting history; deleting ' +
    'destroys it). Run: npm run meta -- doctor  (it counts your slots).',
  2490238: 'SKAdNetwork limit: at most 5 ad sets per campaign.',
  2490208:
    'All ad sets in a SKAdNetwork campaign must share the same optimization_goal. Match the existing ad sets, ' +
    'or put this ad set in a new campaign.',
  3285009: 'All ad sets in a SKAdNetwork campaign must optimize for the same event.',
  2490239: 'All ad sets in a SKAdNetwork campaign must promote the same app.',
  2490249: 'targeting.user_os must specify iOS 14 or above for a SKAdNetwork campaign.',
  2490250: 'object_store_url must be an iTunes/App Store URL for a SKAdNetwork campaign.',
  2446699: 'An iTunes URL is required. Set META_OBJECT_STORE_URL in functions/.env.local.',
  2446700: 'The iTunes app ID could not be read from object_store_url. Check the URL.',
  2446632: 'SKAdNetwork campaigns are iOS-only. Check targeting.user_os and the store URL.',
  1885093:
    "The Meta app has no iOS platform configured, so Meta cannot match it to the App Store URL. A human must fix " +
    'this in the App Dashboard → Settings → Basic → Add Platform → iOS: set Bundle ID (com.picklego.picklego) and ' +
    'iPhone Store ID (6743630735). Note the campaign will still be accepted without it — only the AD SET fails, ' +
    'so this surfaces late. Run: npm run meta -- doctor',
  2446698:
    'promoted_object and is_skadnetwork_attribution are IMMUTABLE once a campaign is live. There is no edit ' +
    'path — you must delete and recreate, which burns one of your 9 SKAN campaign slots. Do not retry this update.',
  2490255: 'buying_type must be AUCTION for SKAdNetwork campaigns.',
  2490216: 'bid_strategy TARGET_COST is not available on SKAdNetwork campaigns. Use LOWEST_COST_WITHOUT_CAP.',
  2490217:
    'billing_event and optimization_goal cannot both be APP_INSTALLS — CPA billing is blocked on SKAdNetwork. ' +
    'Use billing_event: IMPRESSIONS.',
  2490256: 'optimization_goal LINK_CLICKS is not supported on iOS 14+ app campaigns. Use APP_INSTALLS.',
  2490252: 'COST_CAP and LOWEST_COST_WITH_MIN_ROAS require a minimum campaign duration. Set an end_time further out.',
  2446693: 'The app must ship Meta Business SDK v8.0 or later. Check react-native-fbsdk-next is current.',

  // --- Audiences under SKAN.
  1870125:
    'App-activity Custom Audiences cannot be used for INCLUSION targeting on an iOS 14 (SKAdNetwork) campaign. ' +
    'Use broad targeting, or seed a Lookalike from this audience instead.',
  1870141: 'App-connection targeting is unavailable on iOS 14 (SKAdNetwork) campaigns.',
  3285008: 'Deferred deep links are unavailable on SKAdNetwork campaigns. Drop app_link from the creative CTA.',
};

/** code → hint, for the errors where the top-level code is the meaningful part. */
const CODE_HINTS: Record<number, string> = {
  190: 'The access token is invalid or expired. Generate a new System User token and update META_ACCESS_TOKEN in functions/.env.local. Do not retry.',
  200: 'The token lacks permission for this call. It needs ads_management (write), and pages_show_list + pages_read_engagement to use a Page in a creative.',
  3000:
    'Reading app INSIGHTS (app_event_types, and anything else about what Meta has recorded for the app) ' +
    'needs the System User to hold a role on the APP itself. That is a separate grant from ads_management ' +
    'on the ad account — a token can create campaigns for an app it cannot read. Fix: Business Settings → ' +
    'Accounts → Apps → PickleGo → Add People → your System User → Full control (Develop app).',
  294: 'Managing ads requires the ads_management permission and an approved app.',
  4: 'Application rate limit reached. Wait and retry.',
  17: 'User rate limit reached. Wait and retry.',
  80000: 'Business use case rate limit (ads management). Wait for X-Business-Use-Case-Usage to drain.',
  80004: 'Business use case rate limit (ads management). Wait and retry.',
};

export function hintFor(code?: number, subcode?: number, message?: string): string | undefined {
  // Message first: it disambiguates the overloaded subcodes. Guessing from a reused
  // subcode sends people to fix something that was never broken.
  if (message) {
    const matched = MESSAGE_HINTS.find((h) => h.match.test(message));
    if (matched) return matched.hint;
  }
  if (subcode !== undefined && SUBCODE_HINTS[subcode]) return SUBCODE_HINTS[subcode];
  if (code !== undefined && CODE_HINTS[code]) return CODE_HINTS[code];
  return undefined;
}

/** Rate-limit and transient-downtime codes. Only these are safe to retry on a write. */
const RETRYABLE_CODES = new Set([1, 2, 4, 17, 32, 341, 368, 613, 80000, 80001, 80002, 80003, 80004]);

export function isRetryable(code?: number): boolean {
  return code !== undefined && RETRYABLE_CODES.has(code);
}

export function exitCodeFor(err: unknown): number {
  if (err instanceof CliError) {
    switch (err.payload.type) {
      case 'graph':
        return 1;
      case 'validation':
        return 2;
      case 'guardrail':
        return 3;
      case 'unknown_state':
        return 4;
    }
  }
  return 1;
}
