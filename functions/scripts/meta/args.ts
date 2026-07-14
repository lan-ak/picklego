/** Zero-dependency flag parser. */

export interface Args {
  /** Positional words before the first flag, e.g. ['adset', 'pause', '123']. */
  positional: string[];
  flags: Record<string, string | boolean | string[]>;
}

const KNOWN_BOOLEANS = new Set([
  'json',
  'dry-run',
  'validate',
  'verbose',
  'resume',
  'force',
  'wait',
  'rollback-on-failure',
  'adopt-existing',
  'help',
]);

export function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const flags: Record<string, string | boolean | string[]> = {};

  let i = 0;
  for (; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }

    const eq = token.indexOf('=');
    const name = (eq > -1 ? token.slice(2, eq) : token.slice(2)).trim();
    let value: string | boolean;

    if (eq > -1) {
      value = token.slice(eq + 1);
    } else if (KNOWN_BOOLEANS.has(name)) {
      value = true;
    } else {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        value = true;
      } else {
        value = next;
        i++;
      }
    }

    // A repeated flag accumulates, so `--include 1 --include 2` works.
    const existing = flags[name];
    if (existing === undefined) {
      flags[name] = value;
    } else if (Array.isArray(existing)) {
      existing.push(String(value));
    } else {
      flags[name] = [String(existing), String(value)];
    }
  }

  return { positional, flags };
}

export function str(args: Args, name: string): string | undefined {
  const v = args.flags[name];
  if (v === undefined || v === true) return undefined;
  return Array.isArray(v) ? v[v.length - 1] : String(v);
}

export function bool(args: Args, name: string): boolean {
  return args.flags[name] === true || args.flags[name] === 'true';
}

/** Integer flag. Rejects floats and junk loudly — budgets are integer minor units. */
export function int(args: Args, name: string): number | undefined {
  const raw = str(args, name);
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`--${name} must be a number. Got: ${raw}`);
  if (!Number.isInteger(n)) {
    throw new Error(
      `--${name} must be a whole number. Got: ${raw}\n` +
        `Money in the Meta API is integer minor units (cents): $30.00 is 3000, not 30 or 30.00.`,
    );
  }
  return n;
}

/** Comma-or-repeat list: `--countries US,CA` or `--countries US --countries CA`. */
export function list(args: Args, name: string): string[] | undefined {
  const v = args.flags[name];
  if (v === undefined || v === true) return undefined;
  const parts = Array.isArray(v) ? v : [String(v)];
  const out = parts
    .flatMap((p) => p.split(','))
    .map((s) => s.trim())
    .filter(Boolean);
  return out.length ? out : undefined;
}

export function requireStr(args: Args, name: string): string {
  const v = str(args, name);
  if (v === undefined) throw new Error(`Missing required flag --${name}`);
  return v;
}
