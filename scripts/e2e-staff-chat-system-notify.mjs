#!/usr/bin/env node
// Rule Q L2 — real-prod e2e for AV198 staff-chat System notification cards.
// Uses the REAL builder + REAL writer (functions/staffChatNotify.js, admin SDK)
// against real Firestore, then verifies: (1) the card lands at the canonical
// path, (2) a per-branch client-style query finds it, (3) intake is PENDING
// before registration, (4) it FLIPS to the customer once the session is stamped
// brokerProClinicId + the customer exists, (5) follow-up resolves immediately.
// All fixtures are TEST-prefixed + cleaned up; an audit doc is written.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const require = createRequire(import.meta.url);
const { buildStaffChatNotification, writeStaffChatNotification } = require('../functions/staffChatNotify.js');
const { resolveCustomerName, resolveCustomerHN } = require('../functions/customerDisplay.js');

const APP_ID = 'loverclinic-opd-4c39b';
const BASE = `artifacts/${APP_ID}/public/data`;
const BR = 'TEST-BR-AV198';
const CUST = 'TEST-CUST-AV198';
const SESS = `TEST-SESS-AV198-${Date.now()}`;

// the client-side picker contract (unit-tested in tests/staff-chat-system-notify-resolve.test.js)
function pick(card, sessionData) {
  const sys = card && card.system; if (!sys) return null;
  if (sys.customerId) return String(sys.customerId);
  if (sessionData && sessionData.brokerProClinicId) return String(sessionData.brokerProClinicId);
  return null;
}

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.resolve('.env.local.prod'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/); if (m) env[m[1]] = m[2];
  }
  return env;
}

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.log(`  ✗ ${m}`); } };

async function main() {
  const env = loadEnv();
  const privateKey = (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  if (!getApps().length) initializeApp({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey }) });
  const db = getFirestore();
  const writtenIds = [];

  console.log('Phase 1 — build + write an INTAKE card (real builder + writer)');
  const intakeCard = buildStaffChatNotification({
    kind: 'intake', sessionId: SESS, branchId: BR,
    session: { patientData: { prefix: 'นาย', firstName: 'อีทูอี', lastName: 'ทดสอบ' } }, customer: null,
  });
  const wrote = await writeStaffChatNotification(db, BASE, FieldValue, intakeCard);
  writtenIds.push(intakeCard.id);
  ok(wrote === true, 'writer returned true');
  const cardSnap = await db.doc(`${BASE}/be_staff_chat_messages/${intakeCard.id}`).get();
  ok(cardSnap.exists, 'card exists at canonical be_staff_chat_messages path');
  ok(cardSnap.data().deviceId === 'system' && cardSnap.data().displayName === 'ระบบ', 'system identity stamped');

  console.log('Phase 2 — per-branch client-style query finds the card');
  const q = await db.collection(`${BASE}/be_staff_chat_messages`).where('branchId', '==', BR).get();
  const found = q.docs.map(d => d.data()).find(d => d.id === intakeCard.id);
  ok(!!found, 'card found by branchId query');
  ok(found && found.system && found.system.kind === 'intake' && found.system.customerId === null && found.system.sessionId === SESS, 'intake system payload correct (kind/customerId null/sessionId)');

  console.log('Phase 3 — intake PENDING before registration');
  await db.doc(`${BASE}/opd_sessions/${SESS}`).set({ id: SESS, formType: 'intake', branchId: BR, status: 'completed', _av198_test: true });
  let sessSnap = await db.doc(`${BASE}/opd_sessions/${SESS}`).get();
  ok(pick(found, sessSnap.data()) === null, 'pick → null (no brokerProClinicId yet)');

  console.log('Phase 4 — register the walk-in → card FLIPS to the customer');
  await db.doc(`${BASE}/be_customers/${CUST}`).set({ id: CUST, firstname: 'อีทูอี', lastname: 'ทดสอบ', hn_no: 'LC-AV198', branchId: BR, _av198_test: true });
  await db.doc(`${BASE}/opd_sessions/${SESS}`).update({ brokerProClinicId: CUST });
  sessSnap = await db.doc(`${BASE}/opd_sessions/${SESS}`).get();
  const flippedId = pick(found, sessSnap.data());
  ok(flippedId === CUST, 'pick → TEST-CUST after registration (the FLIP)');
  const custSnap = await db.doc(`${BASE}/be_customers/${flippedId}`).get();
  ok(custSnap.exists, 'flipped customer doc readable');
  ok(resolveCustomerName(custSnap.data()).includes('อีทูอี'), 'live name resolves from be_customers');
  ok(resolveCustomerHN(custSnap.data()) === 'LC-AV198', 'live HN resolves from be_customers');

  console.log('Phase 5 — FOLLOWUP card resolves immediately');
  const followCard = buildStaffChatNotification({
    kind: 'followup', sessionId: `${SESS}-fu`, branchId: BR,
    session: { linkedCustomerId: CUST }, customer: custSnap.data(),
  });
  await writeStaffChatNotification(db, BASE, FieldValue, followCard);
  writtenIds.push(followCard.id);
  ok(pick(followCard, null) === CUST, 'followup pick → customerId immediately (no session needed)');
  ok(followCard.system.hnSnapshot === 'LC-AV198', 'followup snapshot carries HN');

  console.log('Phase 6 — cleanup + audit + zero-orphan check');
  for (const id of writtenIds) await db.doc(`${BASE}/be_staff_chat_messages/${id}`).delete();
  await db.doc(`${BASE}/opd_sessions/${SESS}`).delete();
  await db.doc(`${BASE}/be_customers/${CUST}`).delete();
  const auditId = `av198-e2e-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  await db.doc(`${BASE}/be_admin_audit/${auditId}`).set({ kind: 'av198-staff-chat-system-notify-e2e', pass, fail, writtenIds, appliedAt: FieldValue.serverTimestamp() });
  const leftover = await db.collection(`${BASE}/be_staff_chat_messages`).where('branchId', '==', BR).get();
  ok(leftover.empty, `zero leftover TEST cards (found ${leftover.size})`);
  const sLeft = await db.doc(`${BASE}/opd_sessions/${SESS}`).get();
  const cLeft = await db.doc(`${BASE}/be_customers/${CUST}`).get();
  ok(!sLeft.exists && !cLeft.exists, 'TEST session + customer cleaned up');

  console.log(`\nRESULT: PASS ${pass} · FAIL ${fail} · audit ${auditId}`);
  process.exit(fail === 0 ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error('FATAL:', err); process.exit(1); });
}
