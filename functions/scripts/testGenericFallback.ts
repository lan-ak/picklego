/**
 * Verify the generic fallback path in sendPushOnNotificationWrite by
 * writing a notification doc with an unknown type (nudge_test) to the
 * authenticated user's player record. They should receive a push titled
 * "PickleGo" with the message body.
 *
 * Run with: npx ts-node scripts/testGenericFallback.ts <email>
 *
 * The notification doc is left in place so the user can also see how it
 * renders in-app. Delete from the Notifications screen or via Firestore
 * Console afterwards if desired.
 */

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({
  credential: applicationDefault(),
  projectId: 'picklego-1c5c7',
});

const db = getFirestore();

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npx ts-node scripts/testGenericFallback.ts <email>');
    process.exit(1);
  }

  console.log(`Looking up player by email=${email}...`);
  const playersSnap = await db.collection('players')
    .where('emailLowercase', '==', email.toLowerCase())
    .limit(1)
    .get();

  if (playersSnap.empty) {
    console.error(`No player found with email=${email}`);
    process.exit(1);
  }

  const playerDoc = playersSnap.docs[0];
  const player = playerDoc.data();
  const playerId = playerDoc.id;

  console.log(`Found: ${player.name} (id=${playerId})`);
  console.log(`  pushTokens: ${player.pushTokens?.length ?? 0}`);
  console.log(`  notificationPreferences.reminders: ${player.notificationPreferences?.reminders ?? '(unset → defaults to allowed)'}`);

  if (!player.pushTokens || player.pushTokens.length === 0) {
    console.warn(`\n⚠  This player has no push tokens — push will be skipped silently. Continuing anyway to verify the function logic.`);
  }

  const now = Date.now();
  const notifId = `test_generic_fallback_${now}`;
  const ref = db.collection('notifications').doc(notifId);

  await ref.set({
    id: notifId,
    type: 'nudge_test',
    status: 'sent',
    recipientId: playerId,
    senderId: 'picklego',
    senderName: 'PickleGo',
    message: 'Generic fallback test — please ignore. Tap to confirm AddMatch routing.',
    createdAt: now,
  });

  console.log(`\n✅ Notification doc written: notifications/${notifId}`);
  console.log(`\nExpected behavior:`);
  console.log(`  - sendPushOnNotificationWrite fires within ~5 seconds`);
  console.log(`  - Push arrives on your device with title "PickleGo"`);
  console.log(`  - Body: "Generic fallback test — please ignore. Tap to confirm AddMatch routing."`);
  console.log(`  - Tapping (after client release) routes to AddMatch`);
  console.log(`\nCheck Cloud Logging for: [Push] SENT: type=nudge_test`);
  console.log(`To delete the test doc later:`);
  console.log(`  db.collection('notifications').doc('${notifId}').delete()`);
}

main().catch((err) => {
  console.error('Test failed:', err.message || err);
  process.exit(1);
});
