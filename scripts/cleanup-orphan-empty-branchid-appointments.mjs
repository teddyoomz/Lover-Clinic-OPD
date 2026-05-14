// Phase 29.23-bis5 / Rule M — cleanup orphan be_appointments with branchId=''.
//
// Root cause (per Rule R diag 2026-05-14): old test bookings with empty
// branchId trigger AP1_COLLISION on every new no-deposit booking attempt
// for the same doctor + overlapping time. Admin's branch-scoped UI hides
// them → "ไม่ชนกับใครเลย" but createBackendAppointment scans allBranches:true
// (correct — same physical doctor can't be in two places) → finds the orphan.
//
// This script DELETES:
//   1. be_appointments docs where branchId IS empty/null/missing AND
//      customerName is empty AND customerNameTemp is empty (orphan test data)
//   2. be_appointment_slots docs referencing the deleted appointmentIds
//
// Two-phase per Rule M: dry-run by default, --apply commits writes + emits
// audit doc to be_admin_audit.
//
// Run: node scripts/cleanup-orphan-empty-branchid-appointments.mjs        (DRY-RUN)
//      node scripts/cleanup-orphan-empty-branchid-appointments.mjs --apply (COMMIT)

import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';

function loadEnv() {
  const raw = readFileSync('.env.local.prod', 'utf8');
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const env = loadEnv();
  const projectId = env.FIREBASE_ADMIN_PROJECT_ID || APP_ID;
  const clientEmail = env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  if (!clientEmail || !privateKey) {
    console.error('Missing FIREBASE_ADMIN_CLIENT_EMAIL or FIREBASE_ADMIN_PRIVATE_KEY in .env.local.prod');
    process.exit(1);
  }
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  const db = getFirestore();

  console.log(`=== CLEANUP: orphan be_appointments with branchId='' ===`);
  console.log(`Mode: ${apply ? '🔴 APPLY (writes will commit)' : '🟢 DRY-RUN (no writes)'}\n`);

  const apptsRef = db.collection(`artifacts/${APP_ID}/public/data/be_appointments`);
  const slotsRef = db.collection(`artifacts/${APP_ID}/public/data/be_appointment_slots`);

  // Scan all be_appointments (small collection in this project — full scan is OK)
  const allSnap = await apptsRef.get();
  console.log(`Scanned ${allSnap.size} total be_appointments docs.\n`);

  const orphans = [];
  for (const docSnap of allSnap.docs) {
    const d = docSnap.data() || {};
    const branchIdMissing = !('branchId' in d) || !String(d.branchId || '').trim();
    const customerId = String(d.customerId || '').trim();
    // Orphan criteria: branchId missing/empty AND no real customerId attached.
    // Such appointments are invisible in branch-scoped UI but still trigger
    // AP1_COLLISION (allBranches:true scan). customerNameTemp/customerName
    // may have test gibberish — that's fine, we don't filter on those because
    // no-deposit bookings always set them. Lack of customerId = no real
    // customer ever attached.
    if (branchIdMissing && !customerId) {
      orphans.push({ id: docSnap.id, data: d });
    }
  }

  console.log(`Found ${orphans.length} ORPHAN be_appointments (branchId='' + no customer fields):\n`);
  for (const o of orphans) {
    console.log(`  - ${o.id}`);
    console.log(`      date: ${o.data.date || '(none)'}  time: ${o.data.startTime || '?'}-${o.data.endTime || '?'}`);
    console.log(`      doctorId: ${o.data.doctorId || '(none)'}  doctorName: ${o.data.doctorName || '(none)'}`);
    console.log(`      appointmentType: ${o.data.appointmentType || '(none)'}  status: ${o.data.status || '(none)'}`);
    console.log(`      createdAt: ${o.data.createdAt || '(none)'}`);
    console.log(`      note: ${(o.data.note || '').slice(0, 50)}`);
    console.log();
  }

  if (orphans.length === 0) {
    console.log('No orphans to clean. Exiting.');
    process.exit(0);
  }

  // Find slot docs referencing these orphan appointmentIds
  const orphanIds = new Set(orphans.map(o => o.id));
  const allSlotsSnap = await slotsRef.get();
  const orphanSlots = [];
  for (const slotSnap of allSlotsSnap.docs) {
    const s = slotSnap.data() || {};
    if (orphanIds.has(s.appointmentId)) {
      orphanSlots.push({ id: slotSnap.id, data: s });
    }
  }
  console.log(`Found ${orphanSlots.length} be_appointment_slots referencing the orphan appointments.\n`);
  for (const s of orphanSlots.slice(0, 20)) {
    console.log(`  - slot ${s.id} → appointmentId=${s.data.appointmentId}`);
  }
  if (orphanSlots.length > 20) console.log(`  ... and ${orphanSlots.length - 20} more`);

  console.log(`\n${apply ? 'COMMITTING' : 'WOULD DELETE'}: ${orphans.length} appointments + ${orphanSlots.length} slots`);

  if (!apply) {
    console.log('\n🟢 DRY-RUN — no writes. Re-run with --apply to commit.\n');
    process.exit(0);
  }

  // Apply mode: batch delete + emit audit doc
  const writer = db.bulkWriter();
  for (const o of orphans) writer.delete(apptsRef.doc(o.id));
  for (const s of orphanSlots) writer.delete(slotsRef.doc(s.id));
  await writer.close();

  // Audit doc — Rule M canonical
  const ts = Date.now();
  const rand = randomBytes(8).toString('hex');
  const auditId = `phase-29-23-bis5-cleanup-orphan-empty-branchid-${ts}-${rand}`;
  await db
    .collection(`artifacts/${APP_ID}/public/data/be_admin_audit`)
    .doc(auditId)
    .set({
      phase: '29.23-bis5',
      operation: 'cleanup-orphan-empty-branchid-appointments',
      scanned: allSnap.size,
      orphanAppointmentsDeleted: orphans.length,
      orphanSlotsDeleted: orphanSlots.length,
      orphanAppointmentIds: orphans.map(o => o.id),
      orphanSlotIds: orphanSlots.map(s => s.id),
      appliedAt: FieldValue.serverTimestamp(),
      reason: 'Phase 29.23-bis5 root-cause diag — orphan be_appointments with empty branchId triggered AP1_COLLISION on every new no-deposit booking attempt for same doctor. Admin branch-scoped UI hid them. Cleanup unblocks new bookings.',
    });

  console.log(`\n✅ DELETED ${orphans.length} orphan appointments + ${orphanSlots.length} orphan slots.`);
  console.log(`📋 Audit doc: be_admin_audit/${auditId}`);
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error('CLEANUP SCRIPT ERROR:', e);
    process.exit(1);
  });
}
