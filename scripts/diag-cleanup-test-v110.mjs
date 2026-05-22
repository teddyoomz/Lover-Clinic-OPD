// scripts/diag-cleanup-test-v110.mjs
// Cleanup helper for V110 verify fixtures.
//
// Usage:
//   node scripts/diag-cleanup-test-v110.mjs              # cleanup ALL TEST-V110-* fixtures
//   node scripts/diag-cleanup-test-v110.mjs TEST-V110-1779478516778  # specific one

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const APP_ID = 'loverclinic-opd-4c39b';
const BUCKET = `${APP_ID}.firebasestorage.app`;
const PREFIX_BASE = 'staff-chat-attachments/TEST-V110-FONT-FIDELITY/';

async function main() {
  const target = process.argv[2] || null;
  const envText = readFileSync('.env.local.prod', 'utf-8');
  for (const line of envText.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=("?)(.*)\2$/);
    if (m) process.env[m[1]] = m[3];
  }
  if (getApps().length === 0) {
    const key = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
    initializeApp({
      credential: cert({
        projectId: APP_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: key,
      }),
      storageBucket: BUCKET,
    });
  }
  const db = getFirestore();
  const bucket = getStorage().bucket();

  const prefix = target ? `${PREFIX_BASE}${target}/` : PREFIX_BASE;
  console.log(`Cleaning up Storage prefix: ${prefix}`);
  const [files] = await bucket.getFiles({ prefix });
  for (const f of files) await f.delete().catch(() => {});
  console.log(`  Deleted ${files.length} Storage objects`);

  // Cleanup Firestore docs (msgIds starting with TEST-V110-)
  const col = db.collection(`artifacts/${APP_ID}/public/data/be_staff_chat_messages`);
  if (target) {
    await col.doc(target).delete().catch(() => {});
    console.log(`  Deleted Firestore doc ${target}`);
  } else {
    const snap = await col.where('branchId', '==', 'TEST-V110-FONT-FIDELITY').get();
    for (const d of snap.docs) await d.ref.delete();
    console.log(`  Deleted ${snap.size} Firestore docs with branchId=TEST-V110-FONT-FIDELITY`);
  }

  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e); process.exit(1); });
}
