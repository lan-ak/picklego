import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({
  credential: applicationDefault(),
  projectId: 'picklego-1c5c7',
});

const db = getFirestore();

async function main() {
  const search = process.argv[2]?.toLowerCase() || 'lanre';
  const snap = await db.collection('players').get();
  let found = 0;
  for (const doc of snap.docs) {
    const p = doc.data();
    const name = (p.name || '').toLowerCase();
    const email = (p.email || '').toLowerCase();
    if (name.includes(search) || email.includes(search)) {
      console.log(`${doc.id} | name="${p.name}" | email="${p.email}" | pushTokens=${p.pushTokens?.length ?? 0} | pendingClaim=${p.pendingClaim === true} | authProvider=${p.authProvider}`);
      found++;
    }
  }
  console.log(`\n${found} match(es) of ${snap.size} total players`);
}
main().catch(console.error);
