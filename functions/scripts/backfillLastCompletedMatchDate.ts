/**
 * One-shot backfill script: sets `lastCompletedMatchDate` on all player docs
 * that don't have the field yet. Computes the actual value from each player's
 * completed matches (max of lastModifiedAt) so the weekly nudge correctly
 * targets only inactive users.
 *
 * Idempotent: skips players that already have the field set.
 *
 * Usage:
 *   1. cd functions
 *   2. Authenticate: gcloud auth application-default login
 *      (OR set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON path)
 *   3. npx ts-node scripts/backfillLastCompletedMatchDate.ts
 *
 * Optional flags:
 *   --dry-run   Print what would change without writing
 *   --force     Recompute and overwrite even if the field already exists
 */

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'picklego-1c5c7';
const BATCH_SIZE = 500;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');

initializeApp({
  credential: applicationDefault(),
  projectId: PROJECT_ID,
});

const db = getFirestore();

async function main() {
  console.log(`Backfill starting (project=${PROJECT_ID}, dryRun=${dryRun}, force=${force})`);

  const playersSnap = await db.collection('players').get();
  console.log(`Found ${playersSnap.size} player documents`);

  let processed = 0;
  let skipped = 0;
  let updated = 0;
  let batch = db.batch();
  let batchCount = 0;

  for (const playerDoc of playersSnap.docs) {
    processed++;
    const player = playerDoc.data();

    if (!force && player.lastCompletedMatchDate !== undefined) {
      skipped++;
      continue;
    }

    // Compute lastCompletedMatchDate from completed matches
    const matchesSnap = await db.collection('matches')
      .where('allPlayerIds', 'array-contains', playerDoc.id)
      .where('status', '==', 'completed')
      .get();

    let lastCompletedMatchDate = 0;
    if (!matchesSnap.empty) {
      lastCompletedMatchDate = Math.max(
        ...matchesSnap.docs.map((d) => {
          const m = d.data();
          return m.lastModifiedAt || m.createdAt || 0;
        })
      );
    }

    if (dryRun) {
      console.log(`  [dry-run] ${playerDoc.id} (${player.name}) → lastCompletedMatchDate=${lastCompletedMatchDate}`);
      updated++;
      continue;
    }

    batch.update(playerDoc.ref, { lastCompletedMatchDate });
    batchCount++;
    updated++;

    if (batchCount >= BATCH_SIZE) {
      await batch.commit();
      console.log(`  Committed batch of ${batchCount}`);
      batch = db.batch();
      batchCount = 0;
    }

    if (processed % 100 === 0) {
      console.log(`  Progress: ${processed}/${playersSnap.size}`);
    }
  }

  if (batchCount > 0 && !dryRun) {
    await batch.commit();
    console.log(`  Committed final batch of ${batchCount}`);
  }

  console.log(`\nDone:`);
  console.log(`  Processed: ${processed}`);
  console.log(`  Skipped (already set): ${skipped}`);
  console.log(`  Updated: ${updated}`);
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
