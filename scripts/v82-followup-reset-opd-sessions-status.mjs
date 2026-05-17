#!/usr/bin/env node
// scripts/v82-followup-reset-opd-sessions-status.mjs
// V82-followup — release "saved to OPD" status on frontend kiosk submissions.
//
// Context: after V82-followup wipe + rollback restore, opd_sessions are back
// but 80/82 docs still carry status='completed' + isArchived=true from the
// PREVIOUS round of admin processing (which created be_customers that are
// now wiped). The admin needs them back in the queue so a fresh sync can
// re-attach them to NEW be_customers with HN starting at LC-26000001.
//
// What this script DOES:
// - For each opd_session with status='completed' OR isArchived=true:
//   - status → 'pending'    (re-enters admin queue)
//   - isArchived → false    (visible again)
//   - clears: opdRecordedAt, brokerStatus, brokerProClinicHN, brokerProClinicId,
//     brokerJob, brokerFilledAt, brokerLastAutoSyncAt, brokerError, archivedAt,
//     linkedAppointmentId, linkedDepositId, depositSyncStatus, depositSyncAt,
//     depositSyncError, depositProClinicId, cancelledAppointmentId,
//     cancelledDepositId, serviceCompleted, serviceCompletedAt, serviceCompletedBy
//   - stamps: _v82FollowupOpdResetAt + _v82FollowupOpdResetFrom (forensic trail)
//
// What this script DOES NOT TOUCH:
// - patientData, sessionName, branchId, formType, createdAt, submittedAt,
//   patientLinkEnabled, patientLinkToken, isPermanent, isUnread
//   (intake data + public-link tokens preserved)
//
// USAGE:
//   node scripts/v82-followup-reset-opd-sessions-status.mjs           # dry-run
//   node scripts/v82-followup-reset-opd-sessions-status.mjs --apply   # commit

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const BASE = ['artifacts', APP_ID, 'public', 'data'];

const FIELDS_TO_CLEAR = [
  'opdRecordedAt',
  'brokerStatus', 'brokerProClinicHN', 'brokerProClinicId', 'brokerJob',
  'brokerFilledAt', 'brokerLastAutoSyncAt', 'brokerError',
  'archivedAt',
  'linkedAppointmentId', 'linkedDepositId',
  'depositSyncStatus', 'depositSyncAt', 'depositSyncError', 'depositProClinicId',
  'cancelledAppointmentId', 'cancelledDepositId',
  'serviceCompleted', 'serviceCompletedAt', 'serviceCompletedBy',
];

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.resolve('.env.local.prod'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function dataCol(db, name) {
  let ref = db;
  for (const seg of BASE) ref = ref.collection ? ref.collection(seg) : ref.doc(seg);
  return ref.collection(name);
}

async function main() {
  const apply = process.argv.includes('--apply');
  const env = loadEnv();
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: APP_ID,
        clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n'),
      }),
    });
  }
  const db = getFirestore();
  const col = dataCol(db, 'opd_sessions');

  console.log('=== V82-followup: reset opd_sessions saved-to-OPD status ===');
  console.log('Mode:', apply ? 'APPLY' : 'DRY-RUN');
  console.log();

  const snap = await col.get();
  const targets = [];
  for (const d of snap.docs) {
    const data = d.data();
    const isCompleted = data.status === 'completed';
    const isArchived = data.isArchived === true;
    if (isCompleted || isArchived) {
      targets.push({ id: d.id, status: data.status, isArchived: data.isArchived,
                     opdRecordedAt: data.opdRecordedAt ? 'set' : 'absent',
                     brokerStatus: data.brokerStatus });
    }
  }

  console.log(`Total opd_sessions: ${snap.size}`);
  console.log(`Targets to reset (status=completed OR isArchived=true): ${targets.length}`);
  console.log(`Already pending + visible: ${snap.size - targets.length}\n`);

  if (targets.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  // Show first 5 sample targets
  console.log('Sample (first 5 targets):');
  for (const t of targets.slice(0, 5)) {
    console.log(`  ${t.id}: status=${t.status} isArchived=${t.isArchived} opdRecordedAt=${t.opdRecordedAt} brokerStatus=${t.brokerStatus}`);
  }
  console.log(`\nWill clear ${FIELDS_TO_CLEAR.length} fields on each + set status='pending' + isArchived=false + add forensic stamps.`);

  if (!apply) {
    console.log('\n[DRY-RUN] No writes. Pass --apply to commit.');
    return;
  }

  console.log('\n=== APPLY ===');
  let updated = 0;
  for (let i = 0; i < targets.length; i += 400) {
    const chunk = targets.slice(i, i + 400);
    const batch = db.batch();
    for (const t of chunk) {
      const ref = col.doc(t.id);
      const update = {
        status: 'pending',
        isArchived: false,
        _v82FollowupOpdResetAt: FieldValue.serverTimestamp(),
        _v82FollowupOpdResetFrom: {
          status: t.status ?? null,
          isArchived: t.isArchived ?? null,
          opdRecordedAtWasSet: t.opdRecordedAt === 'set',
        },
      };
      for (const f of FIELDS_TO_CLEAR) update[f] = FieldValue.delete();
      batch.update(ref, update);
    }
    await batch.commit();
    updated += chunk.length;
    console.log(`  Progress: ${updated}/${targets.length}`);
  }

  // Audit
  const ts = Date.now();
  const rand = crypto.randomBytes(4).toString('hex');
  const auditId = `v82-followup-opd-status-reset-${ts}-${rand}`;
  await dataCol(db, 'be_admin_audit').doc(auditId).set({
    type: 'v82-followup-opd-status-reset',
    performedAt: new Date().toISOString(),
    reason: 'Release saved-to-OPD status on opd_sessions so admin can re-sync into fresh be_customers (LC-26000001+).',
    resetCount: updated,
    totalScanned: snap.size,
    fieldsCleared: FIELDS_TO_CLEAR,
  });

  console.log(`\n✓ ${updated} docs reset to pending + visible`);
  console.log(`✓ Audit: be_admin_audit/${auditId}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(err => { console.error('FATAL:', err.message || err); process.exit(1); });
}
