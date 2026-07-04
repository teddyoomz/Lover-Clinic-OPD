// scripts/diag-vip-l2.mjs — VIP (2026-07-04, spec ②) Rule Q L2 verify.
// REAL CLIENT SDK against REAL prod (not admin): exercises the EXACT
// where('vip','==',true) listener the VipProvider uses + the EXACT
// updateCustomer toggle shape the CDV button writes.
//
// Flow: staff sign-in → create TEST-VIP- customer → subscribe the VipProvider
// query → toggle vip ON → listener must fire WITH the id (real-time proof) →
// toggle OFF → listener must fire WITHOUT it → cleanup (client delete —
// be_customers rules allow staff write).
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore, collection, query, where, onSnapshot,
  setDoc, updateDoc, deleteDoc, doc,
} from 'firebase/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const envText = readFileSync('.env.local.prod', 'utf-8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=("?)(.*)\2$/);
  if (m) process.env[m[1]] = m[3];
}

const APP_ID = 'loverclinic-opd-4c39b';
const FIREBASE_API_KEY = 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20';

const app = initializeApp({
  apiKey: FIREBASE_API_KEY,
  authDomain: `${APP_ID}.firebaseapp.com`,
  projectId: APP_ID,
});
const auth = getAuth(app);
const db = getFirestore(app);

const PASS = (m) => console.log(`  ✓ ${m}`);
const FAIL = (m) => { console.log(`  ✗ FAIL: ${m}`); process.exitCode = 1; };

const CUSTOMERS = `artifacts/${APP_ID}/public/data/be_customers`;

function waitForVipState(testId, wantPresent, label, timeoutMs = 12000) {
  return new Promise((resolve) => {
    const q = query(collection(db, CUSTOMERS), where('vip', '==', true));
    const t = setTimeout(() => { unsub(); FAIL(`${label}: timeout (${timeoutMs}ms)`); resolve(false); }, timeoutMs);
    const unsub = onSnapshot(q, (snap) => {
      const present = snap.docs.some((d) => d.id === testId);
      if (present === wantPresent) {
        clearTimeout(t); unsub();
        PASS(`${label} (vip set size=${snap.size})`);
        resolve(true);
      }
    }, (err) => { clearTimeout(t); FAIL(`${label}: listener error ${err.code || err.message}`); resolve(false); });
  });
}

async function main() {
  console.log('=== VIP Rule Q L2 verify (real client SDK, real prod) ===');
  await signInWithEmailAndPassword(auth, 'loverclinic@loverclinic.com', 'Lover2024');
  PASS('signed in as staff');

  const testId = `TEST-VIP-${Date.now()}`;
  const ref = doc(db, CUSTOMERS, testId);

  // fixture — minimal customer (TEST- prefix per V33.10)
  await setDoc(ref, {
    id: testId,
    patientData: { prefix: 'นาย', firstName: 'ทดสอบ', lastName: 'VIP-L2' },
    createdAt: new Date().toISOString(),
  });
  PASS(`fixture created: ${testId}`);

  try {
    // baseline: not in the vip set
    await waitForVipState(testId, false, 'baseline — fixture NOT in vip set');

    // toggle ON — EXACT CDV shape {vip, vipAt, vipBy}
    await updateDoc(ref, { vip: true, vipAt: new Date().toISOString(), vipBy: 'admin-uid-l2-script' });
    await waitForVipState(testId, true, 'toggle ON → VipProvider listener fires WITH the id (real-time)');

    // toggle OFF
    await updateDoc(ref, { vip: false, vipAt: new Date().toISOString(), vipBy: 'admin-uid-l2-script' });
    await waitForVipState(testId, false, 'toggle OFF → listener fires WITHOUT the id');

    // form-save survival probe: an updateDoc patch WITHOUT vip keys must not strip the flag
    await updateDoc(ref, { vip: true, vipAt: new Date().toISOString(), vipBy: 'admin-uid-l2-script' });
    await updateDoc(ref, { firstname: 'ทดสอบแก้ฟอร์ม', lastUpdatedAt: new Date().toISOString() }); // mirror of updateCustomerFromForm patch (no vip key)
    await waitForVipState(testId, true, 'form-style patch (no vip key) → vip SURVIVES (V145-class guard)');
  } finally {
    await deleteDoc(ref).then(() => PASS('cleanup: fixture deleted (zero orphans)'))
      .catch((e) => FAIL(`cleanup failed: ${e.message}`));
  }

  console.log(process.exitCode === 1 ? '\n⚠️  VIP L2: at least one FAIL' : '\n✅ VIP L2: ALL PASS on real prod');
  process.exit(process.exitCode || 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
