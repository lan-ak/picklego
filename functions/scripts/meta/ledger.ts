/**
 * The run ledger — functions/.meta-runs/<runKey>.json
 *
 * Meta's ads endpoints have no idempotency key. A retried `launch` would happily create a
 * second campaign. The ledger is how a launch stays resumable: every created node is
 * recorded the moment it exists, so a re-run with the same runKey skips what already
 * landed instead of duplicating it.
 *
 * Written after every single create, not batched at the end — a crash mid-run must still
 * leave a truthful record of what exists in the account.
 */
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

import { ValidationError } from './errors';

const RUNS_DIR = join(__dirname, '..', '..', '.meta-runs');

export type StepType = 'campaign' | 'adset' | 'image' | 'video' | 'creative' | 'ad';

export interface LedgerStep {
  type: StepType;
  /** Stable identity for the step within the run, so a resume can match it up. */
  key: string;
  id: string;
  name?: string;
  at: string;
}

export interface Ledger {
  runKey: string;
  specHash: string;
  startedAt: string;
  status: 'running' | 'complete' | 'failed' | 'rolled_back';
  steps: LedgerStep[];
  failure?: { step: string; error: unknown };
}

const ledgerPath = (runKey: string): string => join(RUNS_DIR, `${runKey}.json`);

export function hashSpec(spec: unknown): string {
  const stable = JSON.stringify(spec, (key, value) => (key === '_baseDir' ? undefined : value));
  return createHash('sha256').update(stable).digest('hex').slice(0, 16);
}

export function loadLedger(runKey: string): Ledger | undefined {
  const path = ledgerPath(runKey);
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, 'utf8')) as Ledger;
}

export function createLedger(runKey: string, specHash: string): Ledger {
  return { runKey, specHash, startedAt: new Date().toISOString(), status: 'running', steps: [] };
}

/**
 * A dry run must not leave a trace.
 *
 * Under --dry-run every create returns the sentinel id "dry-run" without sending anything,
 * and those were being written into the ledger and the run marked `complete`. The damage
 * came afterwards: the next REAL launch of the same runKey was refused as "already exists",
 * `--resume` would treat "dry-run" as a live campaign id, and `rollback` would issue a
 * DELETE against it. The mode that is supposed to be free of consequences had the worst
 * one available.
 */
let persistence = true;

export function setLedgerPersistence(enabled: boolean): void {
  persistence = enabled;
}

export function saveLedger(ledger: Ledger): void {
  if (!persistence) return;
  mkdirSync(RUNS_DIR, { recursive: true });
  writeFileSync(ledgerPath(ledger.runKey), JSON.stringify(ledger, null, 2));
}

export function listLedgers(): Ledger[] {
  if (!existsSync(RUNS_DIR)) return [];
  return readdirSync(RUNS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(RUNS_DIR, f), 'utf8')) as Ledger);
}

export function findStep(ledger: Ledger, type: StepType, key: string): LedgerStep | undefined {
  return ledger.steps.find((s) => s.type === type && s.key === key);
}

export function recordStep(ledger: Ledger, step: Omit<LedgerStep, 'at'>): LedgerStep {
  const full: LedgerStep = { ...step, at: new Date().toISOString() };
  ledger.steps.push(full);
  saveLedger(ledger);
  return full;
}

/**
 * Resuming a run whose spec has changed underneath it would apply half the old plan and
 * half the new one. That is not a resume, it is corruption — so refuse it.
 */
export function assertResumable(ledger: Ledger, specHash: string): void {
  if (ledger.specHash === specHash) return;
  throw new ValidationError(
    `The spec has changed since run "${ledger.runKey}" started.`,
    `Resuming would mix the old plan with the new one. Either revert the spec, or use a new runKey ` +
      `(and clean up the old objects with: npm run meta -- rollback --run-key ${ledger.runKey}).`,
  );
}
