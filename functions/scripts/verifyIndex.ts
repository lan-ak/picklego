/**
 * Verify the lastCompletedMatchDate + createdAt composite index is built
 * by running the same query the weekly nudge uses. Fails with a clear error
 * if the index is missing/still building.
 */

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({
  credential: applicationDefault(),
  projectId: 'picklego-1c5c7',
});

const db = getFirestore();

async function main() {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  console.log('Running weekly-nudge query against production...');
  console.log(`  WHERE lastCompletedMatchDate <= ${sevenDaysAgo}`);
  console.log(`  AND   createdAt <= ${sevenDaysAgo}`);

  const snap = await db.collection('players')
    .where('lastCompletedMatchDate', '<=', sevenDaysAgo)
    .where('createdAt', '<=', sevenDaysAgo)
    .get();

  console.log(`\nQuery succeeded — index is built and ready.`);
  console.log(`  Eligible (inactive + signup > 7 days ago): ${snap.size} players`);

  // Sample a few for sanity
  let withTokens = 0;
  let neverPlayed = 0;
  for (const doc of snap.docs) {
    const p = doc.data();
    if ((p.pushTokens?.length ?? 0) > 0) withTokens++;
    if (p.lastCompletedMatchDate === 0) neverPlayed++;
  }
  console.log(`  - With push tokens: ${withTokens}`);
  console.log(`  - Never completed a match: ${neverPlayed}`);
}

main().catch((err) => {
  console.error('Query failed:', err.message || err);
  process.exit(1);
});
