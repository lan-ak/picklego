/**
 * The Graph API client. THE CHOKE POINT.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * INVARIANT: no other module in this CLI may call fetch(). Every request goes
 * through here. That is what makes the guardrails below impossible to bypass by
 * accident, rather than a convention someone forgets on a Friday.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Cross-cutting concerns, applied in order:
 *   1. build   — form-encode; JSON.stringify nested objects (the API requires it)
 *   2. policy  — force status:PAUSED on creates; enforce budget ceilings
 *   3. gate    — --dry-run prints and stops; --validate appends validate_only
 *   4. send    — retry GETs freely, retry writes only on explicit rate limits
 *   5. unwrap  — surface error_user_msg + subcode + fbtrace_id, attach a fix-it hint
 */
import { createHmac } from 'crypto';
import { readFile } from 'fs/promises';
import { basename } from 'path';

import { Config, GRAPH_HOST, GRAPH_VERSION } from './env';
import { GraphError, GuardrailError, UnknownStateError, hintFor, isRetryable } from './errors';
import { debug, money, setCurrency, warn } from './output';

export type Params = Record<string, unknown>;

export interface ClientOptions {
  dryRun: boolean;
  validateOnly: boolean;
  /** Per-invocation ceiling override. Only ever set when the human asked for it. */
  maxDailyBudgetCents?: number;
}

/** Endpoints where a POST creates a spending object and must be forced to PAUSED. */
const PAUSABLE_EDGE = /\/(campaigns|adsets|ads)$/;

/** `POST <id>/copies` clones an object. Same danger, different parameter name. */
const COPY_EDGE = /\/copies$/;

const BUDGET_FIELDS = ['daily_budget', 'lifetime_budget'] as const;

/**
 * True when a POST would turn an *existing* object ACTIVE.
 *
 * Creation is not the dangerous verb — `enforcePaused` already pins every create to
 * PAUSED. Activation is. And activation is reachable from any POST to a bare object id,
 * including `graph --method POST <id> --field status=ACTIVE`, which matches no create
 * edge and so used to walk straight past the guardrails.
 *
 * Exported pure so `selftest` can assert it offline.
 */
export function isActivation(path: string, params: Params): boolean {
  if (PAUSABLE_EDGE.test(path) || COPY_EDGE.test(path)) return false;
  return params.status === 'ACTIVE' || params.effective_status === 'ACTIVE';
}

export class MetaClient {
  private accountMeta?: { currency: string; minDailyBudgetCents: number };

  constructor(
    readonly config: Config,
    readonly options: ClientOptions,
  ) {}

  // ── Guardrails ────────────────────────────────────────────────────────────

  private get maxDaily(): number {
    return this.options.maxDailyBudgetCents ?? this.config.maxDailyBudgetCents;
  }

  /**
   * Rejects budgets that are too big, and warns on ones that are suspiciously small.
   * Runs before the request is even printed, so --dry-run shows post-guardrail state.
   */
  enforceBudgets(params: Params): void {
    for (const field of BUDGET_FIELDS) {
      const raw = params[field];
      if (raw === undefined || raw === null) continue;

      const cents = Number(raw);
      if (!Number.isInteger(cents) || cents <= 0) {
        throw new GuardrailError(
          `${field} must be a positive whole number of minor units (cents). Got: ${String(raw)}`,
          'Money in the Meta API is integer cents. $30.00/day is 3000, not 30 and not 30.00.',
        );
      }

      const ceiling = field === 'daily_budget' ? this.maxDaily : this.config.maxLifetimeBudgetCents;
      const envKey =
        field === 'daily_budget' ? 'META_MAX_DAILY_BUDGET_CENTS' : 'META_MAX_LIFETIME_BUDGET_CENTS';
      if (cents > ceiling) {
        throw new GuardrailError(
          `${field} of ${fmt(cents)} exceeds the ceiling of ${fmt(ceiling)}.`,
          `If that budget is genuinely intended, the human must say so — then either raise ${envKey} in ` +
            `functions/.env.local, or pass --max-daily-budget ${cents}. Do not raise it on your own initiative.`,
        );
      }

      // A budget below the account minimum is the single most common create failure,
      // and Meta's error for it is unreadable. Catch it here with a better message.
      const floor = this.accountMeta?.minDailyBudgetCents;
      if (field === 'daily_budget' && floor && cents < floor) {
        throw new GuardrailError(
          `daily_budget of ${fmt(cents)} is below this ad account's minimum of ${fmt(floor)}.`,
          `Meta will reject it. Raise the budget to at least ${floor} cents.`,
        );
      }
      if (cents < 100) {
        warn(`${field} is ${fmt(cents)} — remember budgets are in CENTS, so this may be a 100x error.`);
      }
    }

    const bid = params.bid_amount;
    if (bid !== undefined && bid !== null) {
      const cents = Number(bid);
      if (!Number.isInteger(cents) || cents <= 0) {
        throw new GuardrailError(`bid_amount must be a positive whole number of cents. Got: ${String(bid)}`);
      }
      if (cents > this.config.maxBidCents) {
        throw new GuardrailError(
          `bid_amount of ${fmt(cents)} exceeds the ceiling of ${fmt(this.config.maxBidCents)}.`,
          'Raise META_MAX_BID_CENTS in functions/.env.local only if the human asked for this bid.',
        );
      }
    }
  }

  /**
   * Forces every newly created campaign / ad set / ad to PAUSED.
   *
   * This is the load-bearing guarantee of the whole CLI: nothing Claude creates can
   * deliver an impression or spend a cent until a human turns it on. Asking for ACTIVE
   * at create time is an error, not a silent downgrade — activation is only reachable
   * through the explicit `resume` verb on an object that already exists.
   */
  enforcePaused(path: string, params: Params): void {
    // `POST <id>/copies` takes status_option, not status. It clones a live ad set into a
    // new one, so it is a create in everything but URL shape — and it matched no edge
    // here, leaving its safety to a `status_option: 'PAUSED'` argument in adsets.ts, i.e.
    // to convention. Convention is exactly what this choke point exists to replace.
    if (COPY_EDGE.test(path)) {
      if (params.status_option && params.status_option !== 'PAUSED') {
        throw new GuardrailError(
          `Refusing to copy an object into ${String(params.status_option)}. Copies are created PAUSED.`,
          'Copy it, then let the human activate the copy.',
        );
      }
      params.status_option = 'PAUSED';
      return;
    }

    if (!PAUSABLE_EDGE.test(path)) return;

    if (params.status && params.status !== 'PAUSED') {
      throw new GuardrailError(
        `Refusing to create a ${String(params.status)} object. Everything is created PAUSED.`,
        'Create it, show the human the id and what it will cost per day, and let them activate it — ' +
          'or run `<noun> resume <id>` if they explicitly ask you to.',
      );
    }
    params.status = 'PAUSED';
  }

  /**
   * Called by `resume`. A per-entity ceiling does not bound spend — ten ad sets at the
   * $50 cap is $500/day. This sums what is already live and refuses to cross the total.
   */
  async assertAccountSpendHeadroom(addingCents: number): Promise<void> {
    // Budget lives at exactly ONE level: on the campaign (CBO / Advantage+) or on its ad
    // sets (ABO) — never both. Meta enforces that, and so does spec.ts. So summing both
    // levels double-counts nothing, and summing only ONE of them misses entire campaigns.
    //
    // Ad sets alone — which is what this used to do — is blind to every CBO campaign,
    // where the ad sets carry no daily_budget at all and this sum came out to zero. CBO is
    // the shape EXAMPLE_SPEC produces, so the account-wide cap did not bind for the exact
    // campaign the CLI steers you toward.
    const liveOnly = JSON.stringify([
      // Children can be paused *by* a paused parent, so filter on effective status.
      { field: 'effective_status', operator: 'IN', value: ['ACTIVE'] },
    ]);

    const [campaigns, adsets] = await Promise.all([
      this.getAll(`${this.config.adAccountId}/campaigns`, {
        fields: 'daily_budget',
        filtering: liveOnly,
      }),
      this.getAll(`${this.config.adAccountId}/adsets`, {
        fields: 'daily_budget',
        filtering: liveOnly,
      }),
    ]);

    const sum = (rows: unknown[]) =>
      rows.reduce<number>((acc, r) => acc + Number((r as { daily_budget?: string }).daily_budget ?? 0), 0);

    const live = sum(campaigns) + sum(adsets);
    const total = live + addingCents;
    const cap = this.config.maxAccountDailyCents;

    debug(`account headroom: ${fmt(live)} live + ${fmt(addingCents)} = ${fmt(total)} vs cap ${fmt(cap)}`);

    if (total > cap) {
      throw new GuardrailError(
        `Activating this would put total daily spend at ${fmt(total)} across the account, ` +
          `over the ${fmt(cap)} cap (${fmt(live)} is already live).`,
        `Pause something else first, or have the human raise META_MAX_ACCOUNT_DAILY_CENTS in functions/.env.local.`,
      );
    }
  }

  /**
   * What activating this object would newly commit per day.
   *
   * An object carries a budget at one level only, so if it has none of its own it is
   * either an ad (whose ad set's budget is already counted as live) or an ad set under a
   * CBO campaign — in which case the campaign's budget is what starts spending. Campaigns
   * have no `campaign` field, so that lookup failing simply means "no parent budget".
   */
  private async activationBudget(objectId: string): Promise<number> {
    const own = Number(
      ((await this.get(objectId, { fields: 'daily_budget' })) as Record<string, unknown>)
        .daily_budget ?? 0,
    );
    if (own > 0) return own;

    try {
      const withParent = (await this.get(objectId, { fields: 'campaign{daily_budget}' })) as {
        campaign?: { daily_budget?: string };
      };
      return Number(withParent.campaign?.daily_budget ?? 0);
    } catch {
      return 0;
    }
  }

  /** Currency + minimum daily budget, read once and cached. Never assume USD. */
  async loadAccountMeta(): Promise<{ currency: string; minDailyBudgetCents: number }> {
    if (this.accountMeta) return this.accountMeta;
    const res = (await this.get(this.config.adAccountId, {
      fields: 'currency,min_daily_budget,name,account_status',
    })) as Record<string, unknown>;
    this.accountMeta = {
      currency: String(res.currency ?? 'USD'),
      minDailyBudgetCents: Number(res.min_daily_budget ?? 0),
    };
    setCurrency(this.accountMeta.currency);
    return this.accountMeta;
  }

  // ── Requests ──────────────────────────────────────────────────────────────

  async get(path: string, params: Params = {}): Promise<GraphResponse> {
    const url = this.url(path);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, encode(value));
    }
    for (const [key, value] of Object.entries(this.auth())) url.searchParams.set(key, value);

    debug(`GET ${redactUrl(url)}`);
    return this.send(path, () => fetch(url, { method: 'GET' }), { retryable: true });
  }

  /** Follows `paging.next` and concatenates. Bounded so a bad filter can't loop forever. */
  async getAll(path: string, params: Params = {}, maxPages = 10): Promise<unknown[]> {
    const out: unknown[] = [];
    let res = await this.get(path, { ...params, limit: params.limit ?? '200' });
    for (let page = 0; page < maxPages; page++) {
      out.push(...((res.data ?? []) as unknown[]));
      const next = res.paging?.next;
      if (!next) return out;
      debug(`paging → page ${page + 2}`);
      res = await this.send(path, () => fetch(next), { retryable: true });
    }

    // We ran out of pages with more still to come. Truncating in silence is how a partial
    // list gets mistaken for the whole account: launch's findByName reconciliation reads
    // through here, and a name it fails to find is a name it will happily create a SECOND
    // copy of — the exact duplicate the ledger exists to prevent. Same for the spend
    // headroom check, which would under-count what is already live.
    warn(
      `${path}: stopped after ${maxPages} pages (${out.length} rows) and there is more. ` +
        `Results are INCOMPLETE — narrow the query with a filter.`,
    );
    return out;
  }

  async post(path: string, params: Params = {}): Promise<GraphResponse> {
    // Order matters: policy runs before the dry-run print, so what you see printed is
    // exactly what would be sent, guardrails already applied.
    this.enforcePaused(path, params);
    this.enforceBudgets(params);

    // Activation is the only operation that spends money, and it is reachable from any
    // POST to a bare object id — including `graph --method POST <id> --field status=ACTIVE`,
    // which matches no create edge. Checking it here, rather than in the resume commands,
    // is what makes the account-wide cap non-bypassable instead of merely conventional.
    if (isActivation(path, params) && !this.options.dryRun) {
      await this.assertAccountSpendHeadroom(await this.activationBudget(path));
    }

    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) body.set(key, encode(value));
    }
    if (this.options.validateOnly) {
      body.set('execution_options', JSON.stringify(['validate_only']));
    }
    for (const [key, value] of Object.entries(this.auth())) body.set(key, value);

    if (this.options.dryRun) return this.printDryRun('POST', path, params);

    const url = this.url(path);
    debug(`POST ${redactUrl(url)}${this.options.validateOnly ? ' (validate_only)' : ''}`);
    return this.send(
      path,
      () =>
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        }),
      { retryable: false },
    );
  }

  async delete(path: string): Promise<GraphResponse> {
    if (this.options.dryRun) return this.printDryRun('DELETE', path, {});
    const url = this.url(path);
    for (const [key, value] of Object.entries(this.auth())) url.searchParams.set(key, value);
    debug(`DELETE ${redactUrl(url)}`);
    return this.send(path, () => fetch(url, { method: 'DELETE' }), { retryable: false });
  }

  /**
   * Multipart upload for /adimages and /advideos. Node 22 has FormData/Blob natively,
   * so no form-data package. Do NOT set Content-Type — fetch must set the boundary.
   */
  async upload(
    path: string,
    files: Array<{ field: string; path: string; contentType?: string }>,
    fields: Params = {},
  ): Promise<GraphResponse> {
    if (this.options.dryRun) {
      return this.printDryRun('POST (multipart)', path, {
        ...fields,
        _files: files.map((f) => f.path),
      });
    }

    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined && value !== null) form.set(key, encode(value));
    }
    for (const file of files) {
      const bytes = await readFile(file.path);
      const blob = new Blob([new Uint8Array(bytes)], {
        type: file.contentType ?? 'application/octet-stream',
      });
      form.set(file.field, blob, basename(file.path));
    }
    for (const [key, value] of Object.entries(this.auth())) form.set(key, value);

    const url = this.url(path);
    debug(`POST ${redactUrl(url)} (multipart, ${files.length} file(s))`);
    return this.send(path, () => fetch(url, { method: 'POST', body: form }), { retryable: false });
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private url(path: string): URL {
    const clean = path.replace(/^\/+/, '');
    return new URL(`${GRAPH_HOST}/${GRAPH_VERSION}/${clean}`);
  }

  /**
   * appsecret_proof binds the token to the app secret, so a leaked token alone is not
   * enough to call the API. Sent whenever META_APP_SECRET is configured.
   */
  private auth(): Record<string, string> {
    const auth: Record<string, string> = { access_token: this.config.accessToken };
    if (this.config.appSecret) {
      auth.appsecret_proof = createHmac('sha256', this.config.appSecret)
        .update(this.config.accessToken)
        .digest('hex');
    }
    return auth;
  }

  private printDryRun(method: string, path: string, params: Params): GraphResponse {
    const body: Record<string, string> = {};
    for (const [key, value] of Object.entries(params)) body[key] = encode(value);
    console.error(`\n[dry-run] ${method} ${GRAPH_HOST}/${GRAPH_VERSION}/${path}`);
    console.error(JSON.stringify(body, null, 2));
    console.error('[dry-run] nothing was sent\n');
    return { id: 'dry-run', _dryRun: true };
  }

  private async send(
    path: string,
    request: () => Promise<Response>,
    opts: { retryable: boolean },
  ): Promise<GraphResponse> {
    const MAX_ATTEMPTS = 4;

    for (let attempt = 1; ; attempt++) {
      let response: Response;
      try {
        response = await request();
      } catch (cause) {
        // The network died mid-flight. For a GET, just retry. For a write we cannot
        // know whether Meta processed it, so we must not retry — an auto-retry here is
        // how you end up with two campaigns and only one id.
        if (opts.retryable && attempt < MAX_ATTEMPTS) {
          await sleep(backoffMs(attempt));
          continue;
        }
        if (!opts.retryable) {
          throw new UnknownStateError(
            `Network failure during a write to ${path}: ${(cause as Error).message}`,
            'The write may or may not have landed. Do NOT blindly retry — it could create a duplicate. ' +
              'Re-run `launch` with --resume (it reconciles by name), or list the objects and check.',
          );
        }
        throw cause;
      }

      this.trackUsage(response);

      const body = (await response.json().catch(() => ({}))) as GraphResponse & {
        error?: GraphErrorBody;
      };

      if (response.ok && !body.error) return body;

      const err = body.error ?? {};
      const code = err.code;
      const retryable = isRetryable(code) && attempt < MAX_ATTEMPTS;

      if (retryable) {
        const delay = backoffMs(attempt);
        debug(`retryable Graph error ${code} — attempt ${attempt}/${MAX_ATTEMPTS}, waiting ${delay}ms`);
        await sleep(delay);
        continue;
      }

      // error_user_msg is the human-readable one and is often the ONLY useful field.
      // The top-level code is usually a meaningless 100; the subcode carries the meaning.
      const message = err.error_user_msg ?? err.message ?? `Graph API returned ${response.status}`;
      throw new GraphError({
        message,
        code,
        subcode: err.error_subcode,
        fbtraceId: err.fbtrace_id,
        // Both message and subcode: some subcodes are reused for unrelated errors.
        hint: hintFor(code, err.error_subcode, `${err.message ?? ''} ${err.error_user_msg ?? ''}`),
        path,
      });
    }
  }

  /** Warn before Meta starts rejecting us, not after. Values are percentages of quota. */
  private trackUsage(response: Response): void {
    const header = response.headers.get('x-business-use-case-usage');
    if (!header) return;
    try {
      const parsed = JSON.parse(header) as Record<
        string,
        Array<{ type: string; call_count: number; total_cputime: number; total_time: number; estimated_time_to_regain_access?: number }>
      >;
      for (const entries of Object.values(parsed)) {
        for (const entry of entries) {
          const peak = Math.max(entry.call_count, entry.total_cputime, entry.total_time);
          if (entry.estimated_time_to_regain_access) {
            warn(
              `Rate limited on ${entry.type}. Meta estimates ${entry.estimated_time_to_regain_access} minute(s) until access returns.`,
            );
          } else if (peak >= 90) {
            warn(`Rate limit for ${entry.type} is at ${peak}% of quota. Slow down.`);
          } else if (peak >= 75) {
            debug(`rate limit ${entry.type} at ${peak}%`);
          }
        }
      }
    } catch {
      // A malformed usage header must never take down a working request.
    }
  }
}

interface GraphErrorBody {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  error_user_title?: string;
  error_user_msg?: string;
  fbtrace_id?: string;
}

export interface GraphResponse {
  id?: string;
  data?: unknown[];
  paging?: { next?: string };
  [key: string]: unknown;
}

/** The API takes form fields; nested objects and arrays must arrive JSON-stringified. */
function encode(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/** Guardrail messages quote money in the account's real currency, not an assumed USD. */
const fmt = (cents: number): string => money(cents);
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const backoffMs = (attempt: number): number => Math.min(1000 * 2 ** (attempt - 1), 8000);

function redactUrl(url: URL): string {
  const copy = new URL(url.toString());
  if (copy.searchParams.has('access_token')) copy.searchParams.set('access_token', 'REDACTED');
  if (copy.searchParams.has('appsecret_proof')) copy.searchParams.set('appsecret_proof', 'REDACTED');
  return copy.toString();
}
