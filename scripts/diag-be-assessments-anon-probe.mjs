// ─── be_assessments anon-lockdown — Rule B Probe-Deploy-Probe #17 ────────────
// REAL @firebase/firestore CLIENT SDK + signInAnonymously against REAL prod.
// be_assessments (ED Score follow-up rounds) is staff-only (isClinicStaff()).
// Anon must NOT read/list/create/delete. Run AFTER the rules deploy → all DENIED.
// Usage: node scripts/diag-be-assessments-anon-probe.mjs   (exit 0 = locked down)

import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, doc, getDocs, setDoc, deleteDoc, query, limit } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20',
  authDomain: 'loverclinic-opd-4c39b.firebaseapp.com',
  projectId: 'loverclinic-opd-4c39b',
  storageBucket: 'loverclinic-opd-4c39b.firebasestorage.app',
  messagingSenderId: '653911776503',
  appId: '1:653911776503:web:9e23f723d3ed877962c7f2',
};
const APP_ID = 'loverclinic-opd-4c39b';
const dataCol = (db, c) => collection(db, 'artifacts', APP_ID, 'public', 'data', c);
const dataDoc = (db, c, id) => doc(db, 'artifacts', APP_ID, 'public', 'data', c, id);
const isDenied = (e) => /permission|insufficient/i.test(String(e?.code || '') + String(e?.message || ''));

let pass = 0, fail = 0;
async function probe(name, fn) {
  try { await fn(); console.log(`✗ FAIL  [should be DENIED] ${name} — op RESOLVED (leak!)`); fail++; }
  catch (e) { if (isDenied(e)) { console.log(`✓ PASS  [DENIED] ${name} — permission-denied`); pass++; } else { console.log(`✗ FAIL  ${name} — unexpected: ${e?.code || e?.message}`); fail++; } }
}

const app = initializeApp(firebaseConfig);
await signInAnonymously(getAuth(app));
const db = getFirestore(app);

await probe('be_assessments LIST (enumerate patients\' ED scores)', () => getDocs(query(dataCol(db, 'be_assessments'), limit(1))));
await probe('be_assessments anon CREATE (forge a round)', () => setDoc(dataDoc(db, 'be_assessments', `ANON-PROBE-${Date.now()}`), { customerId: 'x', status: 'completed' }));
await probe('be_assessments anon DELETE', () => deleteDoc(dataDoc(db, 'be_assessments', 'any')));

console.log(`\n[probe #17] ${pass}/${pass + fail} DENIED. ${fail === 0 ? '✓ be_assessments locked down (staff-only).' : '✗ LEAK — revert rules!'}`);
process.exit(fail ? 1 : 0);
