#!/usr/bin/env node
// ─── appointment loop R8 — orphan-slot auto-heal (Rule Q V66 L2 on REAL prod) ──
//
//   CONF-1 (P1, silent permanent over-block): the AP1-bis reserve guard keyed only
//   on slotData.cancelled, NOT the parent appointment's status. A concurrent
//   cancel racing a time-change edit leaves a LIVE (cancelled:false) slot doc
//   pointing at a now-CANCELLED appt → that doctor's time was blocked FOREVER
//   (a later booking threw AP1_COLLISION with NO visible conflicting appt).
//   FIX (a): the reserve scan reads the slot's PARENT appt; a slot whose parent is
//   cancelled/missing is a STALE ORPHAN → treated as FREE (auto-heals on the next
//   booking). A slot held by a LIVE appt still collides (no double-book).
//
// Deterministic L2: admin-SDK seeds an orphan slot (parent cancelled / parent
// missing) + a live-held slot, then the SHIPPED createBackendAppointment proves
// the orphan heals + the live holder still blocks.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { signInWithCustomToken, signOut } from 'firebase/auth';

import { auth as clientAuth } from '../src/firebase.js';
import { createBackendAppointment, buildAppointmentSlotKeys } from '../src/lib/backendClient.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-APPTR8-${Date.now()}-${randomBytes(3).toString('hex')}`;
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
const appt = (start, end) => ({ date: DATE, startTime: start, endTime: end, doctorId: DOC, doctorName: 'TEST DOC', customerId: CUST, customerName: 'TEST R8', customerHN: '', roomId: '', branchId: BR, status: 'confirmed' });
const isCollision = (r) => r?.status === 'rejected' && /AP1_COLLISION/i.test(r?.reason?.message || String(r?.reason || ''));

async function main() {
  const adb = initAdmin(); const data = base(adb);
  // seed an orphan slot doc for a slot-window, owned by ownerApptId (cancelled:false)
  const seedSlot = async (start, end, ownerApptId) => {
    const keys = buildAppointmentSlotKeys({ date: DATE, doctorId: DOC, startTime: start, endTime: end });
    for (const k of keys) await data.collection('be_appointment_slots').doc(k).set({ slotId: k, appointmentId: ownerApptId, date: DATE, doctorId: DOC, startTime: start, endTime: end, cancelled: false, takenAt: new Date().toISOString() });
  };
  const slotOwner = async (start, end) => {
    const keys = buildAppointmentSlotKeys({ date: DATE, doctorId: DOC, startTime: start, endTime: end });
    const s = await data.collection('be_appointment_slots').doc(keys[0]).get();
    return s.exists ? (s.data()?.appointmentId || '') : '';
  };

  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    console.log(`signed in ${STAFF_UID} — SHIPPED client fns on REAL prod\nNS=${NS} date=${DATE}\n`);
    await data.collection('be_branches').doc(BR).set({ branchId: BR, branchName: 'APPTR8', isDefault: false });

    // ── A — orphan slot whose parent is CANCELLED → heals (booking succeeds) ──
    console.log('A — slot @10:00 owned by a CANCELLED appt → must auto-heal (new booking succeeds)');
    const cancelledId = `BA-${NS}-cancelled`;
    await data.collection('be_appointments').doc(cancelledId).set({ appointmentId: cancelledId, doctorId: DOC, date: DATE, startTime: '10:00', endTime: '11:00', status: 'cancelled', branchId: BR });
    await seedSlot('10:00', '11:00', cancelledId);   // orphan: cancelled:false slot pointing at a cancelled appt
    let aOk = false, aErr = '';
    try { const r = await createBackendAppointment(appt('10:00', '11:00')); aOk = !!r?.appointmentId; var aNewId = r?.appointmentId; } catch (e) { aErr = e?.message || String(e); }
    check('A.1 booking SUCCEEDED over a cancelled-parent orphan slot (no silent over-block)', aOk, `err: ${aErr}`);
    check('A.2 the slot is now owned by the NEW live appt (orphan overwritten)', (await slotOwner('10:00', '11:00')) === aNewId, `owner=${await slotOwner('10:00', '11:00')}`);

    // ── B — orphan slot whose parent is MISSING → heals too ──────────────────
    console.log('\nB — slot @12:00 owned by a NON-EXISTENT appt → must auto-heal');
    await seedSlot('12:00', '13:00', `BA-${NS}-ghost-never-existed`);
    let bOk = false;
    try { const r = await createBackendAppointment(appt('12:00', '13:00')); bOk = !!r?.appointmentId; } catch { bOk = false; }
    check('B.1 booking SUCCEEDED over a missing-parent orphan slot', bOk, 'still blocked');

    // ── C — control: a slot held by a LIVE appt still COLLIDES (no double-book) ─
    console.log('\nC — slot @14:00 owned by a LIVE (confirmed) appt → must still COLLIDE');
    const liveId = `BA-${NS}-live`;
    await data.collection('be_appointments').doc(liveId).set({ appointmentId: liveId, doctorId: DOC, date: DATE, startTime: '14:00', endTime: '15:00', status: 'confirmed', branchId: BR });
    await seedSlot('14:00', '15:00', liveId);
    const cRes = await Promise.allSettled([createBackendAppointment(appt('14:00', '15:00'))]);
    check('C.1 booking over a LIVE-held slot was REJECTED (double-book guard intact)', isCollision(cRes[0]),
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
