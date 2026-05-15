// scripts/diag-staff-chat-l2-verify-v73.mjs
// V73 Rule Q L2 — real CLIENT SDK against real prod (NOT admin SDK).
// Mock-free verification: writes TEST-V73-* messages via real Firestore client
// SDK + verifies receive via compound query. Cleanup is admin-only at the rule
// layer (rules block client delete) — TEST docs auto-cleanup at 7d via the
// Cloud Function from T18.

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore, collection, query, where, orderBy, limit, onSnapshot,
  setDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { readFileSync } from 'fs';

const envText = readFileSync('.env.local.prod', 'utf-8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=("?)(.*)\2$/);
  if (m) process.env[m[1]] = m[3];
}

const APP_ID = 'loverclinic-opd-4c39b';
const FIREBASE_API_KEY = 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20';
const TEST_BRANCH_ID = 'BR-1778136097138-98199ef5';  // ทดลอง 1

const app = initializeApp({
  apiKey: FIREBASE_API_KEY,
  authDomain: `${APP_ID}.firebaseapp.com`,
  projectId: APP_ID,
  storageBucket: `${APP_ID}.firebasestorage.app`,
});
const auth = getAuth(app);
const db = getFirestore(app);

const PASS = (m) => console.log(`  ✓ ${m}`);
const FAIL = (m) => { console.log(`  ✗ FAIL: ${m}`); process.exitCode = 1; };
const INFO = (m) => console.log(`  · ${m}`);

const COL = `artifacts/${APP_ID}/public/data/be_staff_chat_messages`;

async function main() {
  console.log('================================================');
  console.log('=== V73 Staff Chat Rule Q L2 verify ===');
  console.log('================================================');

  await signInWithEmailAndPassword(auth, 'loverclinic@loverclinic.com', 'Lover2024');
  PASS('signed in as loverclinic@loverclinic.com');

  const ts = Date.now();
  const testIds = [];

  // F1: base text message
  {
    const id = `TEST-V73-BASE-${ts}`;
    testIds.push(id);
    await setDoc(doc(db, COL, id), {
      id, branchId: TEST_BRANCH_ID, displayName: 'L2-VERIFY', deviceId: 'l2-script',
      text: 'V73 L2 base test', createdAt: serverTimestamp(),
    });
    PASS(`F1 base message written: ${id}`);
  }

  // F2: mention
  {
    const id = `TEST-V73-MENTION-${ts}`;
    testIds.push(id);
    await setDoc(doc(db, COL, id), {
      id, branchId: TEST_BRANCH_ID, displayName: 'L2-VERIFY', deviceId: 'l2-script',
      text: '@target hello', mentions: ['target'],
      createdAt: serverTimestamp(),
    });
    PASS(`F2 mention message written: ${id}`);
  }

  // F3: reply
  {
    const id = `TEST-V73-REPLY-${ts}`;
    testIds.push(id);
    await setDoc(doc(db, COL, id), {
      id, branchId: TEST_BRANCH_ID, displayName: 'L2-VERIFY', deviceId: 'l2-script',
      text: 'ok got it',
      replyTo: { msgId: `TEST-V73-BASE-${ts}`, snippet: 'V73 L2 base test', displayName: 'L2-VERIFY', deviceId: 'l2-script' },
      createdAt: serverTimestamp(),
    });
    PASS(`F3 reply message written: ${id}`);
  }

  // F4: auto-link (LC-/BA- in text)
  {
    const id = `TEST-V73-AUTOLINK-${ts}`;
    testIds.push(id);
    await setDoc(doc(db, COL, id), {
      id, branchId: TEST_BRANCH_ID, displayName: 'L2-VERIFY', deviceId: 'l2-script',
      text: 'see LC-26000022 about BA-1778', createdAt: serverTimestamp(),
    });
    PASS(`F4 auto-link message written: ${id}`);
  }

  // Compound query — same as listener uses
  await new Promise((resolve) => {
    const q = query(collection(db, COL), where('branchId', '==', TEST_BRANCH_ID), orderBy('createdAt', 'desc'), limit(50));
    const unsub = onSnapshot(q, (snap) => {
      const ids = snap.docs.map(d => d.id);
      const allFound = testIds.every(t => ids.includes(t));
      if (allFound) {
        PASS('compound query returned ALL test docs');
        unsub();
        resolve();
      }
    }, (err) => { FAIL(`onSnapshot error: ${err.message}`); resolve(); });
    setTimeout(() => { unsub(); FAIL('timeout waiting for snapshot (10s)'); resolve(); }, 10000);
  });

  console.log('');
  console.log('================================================');
  console.log('NOTE: client-side delete blocked by rules.');
  console.log('TEST docs will auto-cleanup in 7 days via T18 Cloud Function.');
  console.log('================================================');

  if (process.exitCode !== 1) {
    console.log('\n✅ V73 L2 verify: ALL FEATURES PASS on real prod');
  } else {
    console.log('\n⚠️  V73 L2 verify: at least one FAIL above');
  }
  process.exit(process.exitCode || 0);
}

main().catch(e => { console.error(e); process.exit(1); });
