/**
 * Meta Marketing API CLI.
 *
 *   cd functions
 *   npm run meta -- doctor          ← run this first
 *   npm run meta -- help
 *
 * Credentials live in functions/.env.local (gitignored, never deployed).
 * See functions/.env.local.example.
 *
 * THE CONTRACT: every campaign, ad set and ad this CLI creates is created PAUSED. It
 * cannot deliver an impression or spend a cent until a human activates it. The only path
 * to spending money is an explicit `... resume <id>`.
 *
 * Guardrails are enforced in scripts/meta/client.ts, which is the single choke point
 * every request passes through. See the header there.
 */
import { bool, int, parseArgs } from './meta/args';
import { MetaClient } from './meta/client';
import { Ctx } from './meta/context';
import { assertAdAccountId, loadConfig } from './meta/env';
import { CliError, exitCodeFor } from './meta/errors';
import { configureOutput, fail } from './meta/output';
import { help, resolve } from './meta/registry';

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  // `npm run meta campaigns` (no --) hands npm the word, not us. Catch the empty case and
  // show the right form rather than a bare help dump.
  if (!argv.length || argv[0] === 'help' || argv[0] === '--help') {
    console.log(help());
    return;
  }

  const args = parseArgs(argv);
  const resolved = resolve(args.positional);

  if (!resolved) {
    console.error(`\nUnknown command: ${args.positional.join(' ') || '(none)'}`);
    console.error(`\nRun:  npm run meta -- help\n`);
    process.exitCode = 2;
    return;
  }

  const { command, rest } = resolved;

  configureOutput({
    json: bool(args, 'json'),
    verbose: bool(args, 'verbose'),
    command: command.name,
    dryRun: bool(args, 'dry-run'),
    validateOnly: bool(args, 'validate'),
  });

  // selftest, spec validate and runs are pure — they must work with no token at all,
  // which is what makes them usable as a first check on a fresh clone.
  if (command.offline) {
    await command.handler({ client: undefined as never, config: undefined as never, args, rest });
    return;
  }

  const config = loadConfig();
  const accountOverride = args.flags.account;
  if (typeof accountOverride === 'string') config.adAccountId = assertAdAccountId(accountOverride);

  const client = new MetaClient(config, {
    dryRun: bool(args, 'dry-run'),
    validateOnly: bool(args, 'validate'),
    maxDailyBudgetCents: int(args, 'max-daily-budget'),
  });

  // Learn the account's currency and budget floor once, up front, so every money figure
  // renders in the real currency (this account bills in CAD, not USD) and budget checks
  // have a floor to compare against.
  //
  // This runs under --dry-run too. It is a read, and the floor is half of what dry-run is
  // FOR: without it, `--daily-budget 30` (meaning $30, actually 30¢) sails through the one
  // mode whose whole job is to catch that before it reaches Meta. Dry-run suppresses
  // writes, not reads — and the launch/create handlers already called this unconditionally,
  // so the old skip bought no network silence anyway, it just blinded the guardrail.
  //
  // `doctor` is exempt: this read is exactly what fails when the setup is broken, and
  // doctor exists to explain that failure rather than be killed by it.
  if (!command.selfDiagnosing) await client.loadAccountMeta();

  const ctx: Ctx = { client, config, args, rest };
  await command.handler(ctx);
}

main().catch((error: unknown) => {
  // `launch` attaches what it managed to create before dying, so a partial failure is
  // actionable rather than a dead end.
  const partial = (error as { partial?: unknown }).partial;
  fail(error, partial);

  if (!(error instanceof CliError) && !(error as Error).message) {
    console.error(error);
  }
  process.exit(exitCodeFor(error));
});
