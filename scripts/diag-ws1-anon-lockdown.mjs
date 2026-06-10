// ─── WS1 anon-surface lockdown — Rule Q L2 adversarial verification ──────────
// REAL @firebase/firestore CLIENT SDK + signInAnonymously against REAL prod.
// (NOT firebase-admin — admin bypasses rules. This issues the EXACT anon
//  queries an attacker would, so it actually exercises the security rules.)
//
// Run BEFORE the rules deploy → the "should be DENIED" assertions FAIL (proves
// the vuln is real on old rules). Run AFTER → they PASS (proves lockdown holds).
// Patient "should be ALLOWED" assertions must pass in BOTH (V23 no-regression).
//
// Usage: node scripts/diag-ws1-anon-lockdown.mjs
// Exit 0 = all post-deploy expectations met; 1 = a regression/leak.

import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, deleteDoc, query, limit,
} from 'firebase/firestore';

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

const isDenied = (e) => {
  const c = e?.code || '';
  const m = String(e?.message || '');
  return c === 'permission-denied' || /permission|insufficient|Missing or insufficient/i.test(m);
};

const results = [];
function record(name, expect, ok, detail) {
  results.push({ name, expect, ok, detail });
  console.log(`${ok ? '✓ PASS' : '✗ FAIL'}  [${expect}] ${name}${detail ? ' — ' + detail : ''}`);
}

// Run an op; classify as 'allowed' (resolved) or 'denied' (permission-denied throw).
async function probe(name, expect /* 'DENIED' | 'ALLOWED' */, fn) {
  try {
    await fn();
    record(name, expect, expect === 'ALLOWED', 'op resolved (allowed)');
  } catch (e) {
    if (isDenied(e)) record(name, expect, expect === 'DENIED', 'permission-denied');
    else record(name, expect, false, `unexpected error: ${e?.code || e?.message}`);
  }
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  await signInAnonymously(auth);
  console.log(`\n[ws1-l2] anon uid=${auth.currentUser?.uid?.slice(0, 8)}… (NO claims — exactly an internet attacker)\n`);

  // ── C1: opd_sessions — LIST must be denied, GET-by-id must be allowed ──────
  await probe('C1 opd_sessions LIST (mass-PII dump)', 'DENIED', () =>
    getDocs(query(dataCol(db, 'opd_sessions'), limit(1))));
  await probe('C1 opd_sessions GET-by-crypto-id (patient submit/dashboard)', 'ALLOWED', () =>
    getDoc(dataDoc(db, 'opd_sessions', 'DEP-nonexistent-ws1-probe')));
  // anon CREATE (patient kiosk) must still work — use a test-probe-anon- id so
  // anon can also self-delete it (firestore.rules delete branch), no litter.
  const probeId = `test-probe-anon-ws1-${auth.currentUser.uid.slice(0, 10)}`;
  await probe('C1 opd_sessions anon CREATE (patient kiosk)', 'ALLOWED', () =>
    setDoc(dataDoc(db, 'opd_sessions', probeId), {
      status: 'completed', isArchived: true, patientData: {},
    }));
  await probe('C1 opd_sessions anon UPDATE whitelisted field', 'ALLOWED', () =>
    setDoc(dataDoc(db, 'opd_sessions', probeId), { isUnread: true }, { merge: true }));
  // cleanup the probe doc (anon allowed only for test-probe-anon- ids)
  try { await deleteDoc(dataDoc(db, 'opd_sessions', probeId)); console.log('   (cleaned probe doc)'); } catch { /* age-out via cron */ }

  // ── H2: clinic_schedules — GET allowed, LIST + WRITE denied ───────────────
  await probe('H2 clinic_schedules GET-by-token (patient booking)', 'ALLOWED', () =>
    getDoc(dataDoc(db, 'clinic_schedules', 'SCH-nonexistent-ws1-probe')));
  await probe('H2 clinic_schedules LIST (enumeration)', 'DENIED', () =>
    getDocs(query(dataCol(db, 'clinic_schedules'), limit(1))));
  await probe('H2 clinic_schedules anon WRITE (vandalism)', 'DENIED', () =>
    setDoc(dataDoc(db, 'clinic_schedules', 'ws1-probe-vandal'), { hacked: true }));

  // ── H1: chat_conversations — anon create/update denied ────────────────────
  await probe('H1 chat_conversations anon CREATE (spam/forge)', 'DENIED', () =>
    setDoc(dataDoc(db, 'chat_conversations', 'ws1-probe-forge'), { lastMessage: 'x' }));
  await probe('H1 chat_conversations/messages anon CREATE', 'DENIED', () =>
    setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'chat_conversations', 'ws1-probe-forge', 'messages', 'm1'), { text: 'x' }));

  // ── M2: form_templates LIST denied ────────────────────────────────────────
  await probe('M2 form_templates LIST (enumeration)', 'DENIED', () =>
    getDocs(query(dataCol(db, 'form_templates'), limit(1))));

  // ── Control: a PII collection must remain fully staff-only (anon get DENIED) ─
  await probe('CTRL be_customers GET (must stay staff-only)', 'DENIED', () =>
    getDoc(dataDoc(db, 'be_customers', 'ws1-probe')));

  // ── Summary ───────────────────────────────────────────────────────────────
  const fails = results.filter((r) => !r.ok);
  console.log(`\n[ws1-l2] ${results.length - fails.length}/${results.length} expectations met.`);
  if (fails.length) {
    console.log('FAILED:');
    fails.forEach((f) => console.log(`  ✗ [${f.expect}] ${f.name} — ${f.detail}`));
    console.log('\n(If run BEFORE the rules deploy, the DENIED ones failing is EXPECTED — old rules still permissive.)');
    process.exit(1);
  }
  console.log('✓ WS1 lockdown verified: anon cannot enumerate/forge; patient get/create paths intact.');
  process.exit(0);
}

main().catch((e) => { console.error('[ws1-l2] fatal', e); process.exit(2); });
