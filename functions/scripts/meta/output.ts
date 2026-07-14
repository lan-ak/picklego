/** Output envelopes. Every command prints through here so --json is uniform. */
import { CliError, ErrorPayload } from './errors';

let jsonMode = false;
let verboseMode = false;
let currentCommand = '';
let dryRun = false;
let validateOnly = false;

export function configureOutput(opts: {
  json: boolean;
  verbose: boolean;
  command: string;
  dryRun: boolean;
  validateOnly: boolean;
}): void {
  jsonMode = opts.json;
  verboseMode = opts.verbose;
  currentCommand = opts.command;
  dryRun = opts.dryRun;
  validateOnly = opts.validateOnly;
}

export const isJson = (): boolean => jsonMode;
export const isVerbose = (): boolean => verboseMode;

const warnings: string[] = [];

/** A non-fatal thing the human should know. Surfaced in both modes. */
export function warn(message: string): void {
  warnings.push(message);
  if (!jsonMode) console.warn(`warning: ${message}`);
}

/** Human-only line. Suppressed under --json so stdout stays parseable. */
export function line(message = ''): void {
  if (!jsonMode) console.log(message);
}

/** Diagnostic line, only under --verbose. Goes to stderr so it never pollutes --json. */
export function debug(message: string): void {
  if (verboseMode) console.error(`  · ${message}`);
}

/**
 * Terminal success. Under --json, prints the envelope; otherwise runs the human renderer.
 * `data` is what Claude parses, so it should be structured, not prose.
 */
export function ok(data: unknown, human?: () => void): void {
  if (jsonMode) {
    console.log(
      JSON.stringify(
        { ok: true, command: currentCommand, dryRun, validateOnly, data, warnings },
        null,
        2,
      ),
    );
    return;
  }

  // Under --validate, Meta checked the request and created NOTHING — so there is no id
  // and no object. Running the normal success renderer here would print "✓ created" and
  // an undefined id, which is a lie. Say what actually happened instead.
  if (validateOnly) {
    console.log(`\n✓ valid — Meta accepted this request. Nothing was created.`);
    console.log(`  Re-run without --validate to actually create it (it will be PAUSED).\n`);
    return;
  }

  if (human) human();
}

/** Terminal failure. Returns the exit code; the entrypoint owns process.exit. */
export function fail(err: unknown, partial?: unknown): ErrorPayload {
  const payload: ErrorPayload =
    err instanceof CliError
      ? err.payload
      : { type: 'graph', message: err instanceof Error ? err.message : String(err) };

  if (jsonMode) {
    console.log(
      JSON.stringify(
        { ok: false, command: currentCommand, dryRun, error: payload, partial, warnings },
        null,
        2,
      ),
    );
    return payload;
  }

  console.error(`\n✗ ${payload.message}`);
  const meta: string[] = [];
  if (payload.code !== undefined) meta.push(`code ${payload.code}`);
  if (payload.subcode !== undefined) meta.push(`subcode ${payload.subcode}`);
  if (payload.fbtraceId) meta.push(`fbtrace_id ${payload.fbtraceId}`);
  if (meta.length) console.error(`  (${meta.join('  ')})`);
  if (payload.path) console.error(`  request: ${payload.path}`);
  if (payload.hint) console.error(`\n  → ${payload.hint}`);
  console.error('');
  return payload;
}

/**
 * The ad account's billing currency, learned from the account itself. Never assumed —
 * printing "$50/day" at a CAD account is how a budget gets misread.
 */
let accountCurrency = 'USD';
export function setCurrency(currency: string): void {
  accountCurrency = currency;
}

/** Money: integer minor units → display. Never used for input parsing. */
export const money = (cents: unknown, currency = accountCurrency): string => {
  const n = Number(cents ?? 0);
  if (!Number.isFinite(n)) return '—';
  const symbol = currency === 'USD' ? '$' : `${currency} `;
  return `${symbol}${(n / 100).toFixed(2)}`;
};

/** Fixed-width table. Columns size to content; no dependency. */
export function table(headers: string[], rows: string[][]): void {
  if (jsonMode) return;
  if (!rows.length) return;
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)),
  );
  const render = (cells: string[]) =>
    cells.map((c, i) => (c ?? '').padEnd(widths[i])).join('  ').trimEnd();
  console.log(render(headers));
  console.log(widths.map((w) => '─'.repeat(w)).join('  '));
  for (const row of rows) console.log(render(row));
}
