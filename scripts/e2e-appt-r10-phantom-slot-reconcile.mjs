#!/usr/bin/env node
// ─── appointment loop R10 — concurrent-edit PHANTOM slot reconcile (Rule Q L2) ─
//
//   C1 (ghost collision / silent over-block): updateBackendAppointment's slot
//   maintenance is best-effort, post-commit, keyed on a pre-read snapshot. Two
//   admins editing the SAME appt to DIFFERENT times at once each reserve their own
//   (stale) new slot → a PHANTOM slot lingers at a time the appt no longer
//   occupies, STAMPED to the live appt. R8's orphan-heal can't free it (owner is
//   LIVE at the winning time) + the soft scan can't see it → that 15-min slot is
//   blocked FOREVER, invisibly. FIX: after a slot-affecting edit, reconcile the
//   appt's slot docs to its CURRENT authoritative keys — release any slot stamped
//   to this appt that is no longer a current key.
//
// Deterministic L2: seed a phantom (a 14:00 slot stamped to appt X while X is at
// 10:00), then a real edit (X → 16:00) → the reconcile must RELEASE the 14:00
// phantom so 14:00 is bookable again; 16:00 (where X now is) still collides.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { signInWithCustomToken, signOut } from 'firebase/auth';

import { auth as clientAuth } from '../src/firebase.js';
import { createBackendAppointment, updateBackendAppointment, buildAppointmentSlotKeys } from '../src/lib/backendClient.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-APPTR10-${Date.now()}-${randomBytes(3).toString('hex')}`;
const STAFF_UID = `${NS}-staff`, BR = `${NS}-BR`, DOC = `${NS}-DOC`, CUST = `${NS}-CUST`;
const DATE = new Date(Date.now() + 7 * 3600 * 1000 + 400 * 86400 * 1000).toISOString().slice(0, 10);

let pass = 0, fail = 0; const fails = [];
const check = (n, c, x = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; fails.push(n); console.log(`  ✗ ${n}  ${x}`); } };
function loadEnvLocal() {
  const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8'); const out = {};
  for (const line of txt.split(/\r?\n/)) { if (!line || line.startsWith('#')) continue; const eq = line.indexOf('='); if (eq < 0) continue; let v = line.slice(eq + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); out[line.slice(0, eq).trim()] = v; }
  return out;
}
function initAdmin() {
  if (adminApps().length) return adminFirestore();
  const env = loadEnvLocal();
  adminInit({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n') }) });
  return adminFirestore();
}
const base = (db) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
const appt = (start, end) => ({ date: DATE, startTime: start, endTime: end, doctorId: DOC, doctorName: 'TEST DOC', customerId: CUST, customerName: 'TEST R10', customerHN: '', roomId: '', branchId: BR, status: 'confirmed' });
const isCollision = (r) => r?.status === 'rejected' && /AP1_COLLISION/i.test(r?.reason?.message || String(r?.reason || ''));
const bookOk = async (start, end) => { try { const r = await createBackendAppointment(appt(start, end)); return r?.appointmentId || ''; } catch { return ''; } };

async function main() {
  const adb = initAdmin(); const data = base(adb);
  const slotExists = async (start, end) => {
    const keys = buildAppointmentSlotKeys({ date: DATE, doctorId: DOC, startTime: start, endTime: end });
    for (const k of keys) if ((await data.collection('be_appointment_slots').doc(k).get()).exists) return true;
    return false;
  };
  // seed a phantom: write slot docs for [start,end] STAMPED to ownerApptId.
  const seedPhantom = async (start, end, ownerApptId) => {
    const keys = buildAppointmentSlotKeys({ date: DATE, doctorId: DOC, startTime: start, endTime: end });
    for (const k of keys) await data.collection('be_appointment_slots').doc(k).set({ slotId: k, appointmentId: ownerApptId, date: DATE, doctorId: DOC, startTime: start, endTime: end, cancelled: false, takenAt: new Date().toISOString() });
  };

  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    console.log(`signed in ${STAFF_UID} — SHIPPED client fns on REAL prod\nNS=${NS} date=${DATE}\n`);
    await data.collection('be_branches').doc(BR).set({ branchId: BR, branchName: 'APPTR10', isDefault: false });

    // create X @10:00 (reserves the 10:00 slot)
    console.log('setup — X booked @10:00; a PHANTOM 14:00 slot seeded stamped to X (simulates a concurrent stale-reserve)');
    const x = await createBackendAppointment(appt('10:00', '11:00'));
    await seedPhantom('14:00', '15:00', x.appointmentId);   // phantom: X no longer occupies 14:00
    check('S.1 the phantom 14:00 slot exists (stamped to X, blocks 14:00 invisibly)', await slotExists('14:00', '15:00'), 'no phantom seeded');

    // ── FIX — a slot-affecting edit (X → 16:00) reconciles → phantom released ──
    console.log('\nFIX — edit X to 16:00 → the reconcile must RELEASE the 14:00 phantom');
    await updateBackendAppointment(x.appointmentId, { startTime: '16:00', endTime: '17:00' });
    check('F.1 the 14:00 phantom was RELEASED (no more invisible over-block)', !(await slotExists('14:00', '15:00')),
      'phantom 14:00 slot still present → 14:00 blocked forever');
    const bId = await bookOk('14:00', '15:00');
    check('F.2 14:00 is BOOKABLE again (a real booking succeeds)', !!bId, 'booking at 14:00 still rejected');

    // ── control — X is now at 16:00, so 16:00 still COLLIDES ─────────────────
    console.log('\nC — X now occupies 16:00 → a booking at 16:00 still COLLIDES (guard intact)');
    const cRes = await Promise.allSettled([createBackendAppointment(appt('16:00', '17:00'))]);
    check('C.1 booking at X’s new time 16:00 was REJECTED (X’s real slot guards it)', isCollision(cRes[0]),
      `result=${cRes[0]?.status} ${cRes[0]?.value?.appointmentId || cRes[0]?.reason?.message || ''}`);

  } finally {
    console.log('\nCleanup'); let deleted = 0;
    const sweep = async (c, f, v) => { const s = await data.collection(c).where(f, '==', v).get(); for (const d of s.docs) { await d.ref.delete(); deleted++; } };
    await sweep('be_appointments', 'branchId', BR);
    const allSlots = await data.collection('be_appointment_slots').get();
    for (const d of allSlots.docs) if (d.id.includes(DOC)) { await d.ref.delete(); deleted++; }
    await data.collection('be_branches').doc(BR).delete().then(() => deleted++).catch(() => {});
    check('CLEANUP swept TEST namespace', true, `${deleted} docs`);
    const left = (await data.collection('be_appointments').where('branchId', '==', BR).get()).size;
    check('CLEANUP zero orphans', left === 0, `${left} left`);
    await signOut(clientAuth).catch(() => {});
  }
  console.log(`\n${'═'.repeat(50)}\nRESULT: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.log('FAILED:'); fails.forEach(f => console.log('  - ' + f)); process.exit(1); }
  process.exit(0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
