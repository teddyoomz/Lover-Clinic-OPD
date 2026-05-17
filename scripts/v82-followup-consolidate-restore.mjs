#!/usr/bin/env node
// scripts/v82-followup-consolidate-restore.mjs
// V82-followup consolidate: for ALL docs with _v82FollowupOpdResetAt stamp,
// ensure they end up in queue + Save-to-OPD button visible:
//   - status = 'completed' (queue card needs this to render the button)
//   - isArchived = false (queue card excludes archived)
//   - _v82FollowupConsolidatedAt: serverTimestamp (forensic + signals "do not auto-archive again")
//
// Also inspect specific doc PRM-V02YAW (user's screenshot).
//
// USAGE: node scripts/v82-followup-consolidate-restore.mjs --apply

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const BASE = ['artifacts', APP_ID, 'public', 'data'];

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync('.env.local.prod', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}
function col(db, name) {
  let r = db;
  for (const s of BASE) r = r.collection ? r.collection(s) : r.doc(s);
  return r.collection(name);
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

  console.log('=== V82-followup consolidate: ensure all reset docs queue+button visible ===');
  console.log('Mode:', apply ? 'APPLY' : 'DRY-RUN', '\n');

  // Inspect PRM-V02YAW specifically (user's screenshot)
  console.log('--- PRM-V02YAW (user screenshot doc) ---');
  const prmSnap = await col(db, 'opd_sessions').doc('PRM-V02YAW').get();
  if (prmSnap.exists) {
    const d = prmSnap.data();
    console.log(`  status: ${JSON.stringify(d.status)}`);
    console.log(`  isArchived: ${JSON.stringify(d.isArchived)}`);
    console.log(`  formType: ${JSON.stringify(d.formType)}`);
    console.log(`  patientData: ${!!d.patientData}`);
    console.log(`  createdAt: ${d.createdAt ? new Date(d.createdAt.toMillis()).toISOString() : 'absent'}`);
    console.log(`  _v82FollowupOpdResetAt: ${d._v82FollowupOpdResetAt ? 'set' : 'absent'}`);
    console.log(`  opdRecordedAt: ${d.opdRecordedAt ? 'set (saved to OPD)' : 'absent'}`);
    console.log(`  brokerStatus: ${JSON.stringify(d.brokerStatus)}`);
    const buttonShould = d.status === 'completed' && d.patientData;
    console.log(`  >>> Save-to-OPD button SHOULD ${buttonShould ? 'SHOW' : 'NOT SHOW'} (status==='completed' AND patientData)`);
  } else {
    console.log('  PRM-V02YAW: NOT FOUND in opd_sessions');
  }
  console.log();

  // Consolidate all _v82-stamped docs
  const snap = await col(db, 'opd_sessions').get();
  const targets = [];
  for (const d of snap.docs) {
    const data = d.data();
    if (!data._v82FollowupOpdResetAt) continue; // not part of my reset
    if (!data.patientData) continue; // patient never finished; leave alone
    const needsStatus = data.status !== 'completed';
    const needsUnarchive = data.isArchived === true;
    if (needsStatus || needsUnarchive) {
      targets.push({ id: d.id, status: data.status, isArchived: data.isArchived });
    }
  }
  console.log(`Reset-stamped docs needing consolidation: ${targets.length}`);
  if (targets.length === 0) {
    console.log('Nothing to do.');
    return;
  }
  console.log('Sample first 5:');
  for (const t of targets.slice(0, 5)) {
    console.log(`  ${t.id}: status=${JSON.stringify(t.status)} isArchived=${JSON.stringify(t.isArchived)}`);
  }

  if (!apply) {
    console.log('\n[DRY-RUN] No writes. Pass --apply to commit.');
    return;
  }

  let updated = 0;
  for (let i = 0; i < targets.length; i += 400) {
    const chunk = targets.slice(i, i + 400);
    const batch = db.batch();
    for (const t of chunk) {
      batch.update(col(db, 'opd_sessions').doc(t.id), {
        status: 'completed',
        isArchived: false,
        archivedAt: FieldValue.delete(),
        _v82FollowupConsolidatedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    updated += chunk.length;
    console.log(`  Progress: ${updated}/${targets.length}`);
  }

  // Audit
  const ts = Date.now();
  const rand = crypto.randomBytes(4).toString('hex');
  const auditId = `v82-followup-consolidate-${ts}-${rand}`;
  await col(db, 'be_admin_audit').doc(auditId).set({
    type: 'v82-followup-consolidate-restore',
    performedAt: new Date().toISOString(),
    reason: 'Re-ensure status=completed + isArchived=false on all reset-stamped docs (admin browser old-bundle was re-archiving).',
    targetsCount: updated,
  });

  console.log(`\n✓ ${updated} docs consolidated`);
  console.log(`✓ Audit: be_admin_audit/${auditId}`);
  console.log('\n⚠ ADMIN MUST HARD-REFRESH BROWSER (Ctrl+F5) to pick up new bundle.');
  console.log('  Old bundle keeps auto-archiving these docs via the pre-V82-followup AdminDashboard.');
  console.log('  New bundle has the _v82FollowupOpdResetAt opt-out guard.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(err => { console.error('FATAL:', err.message || err); process.exit(1); });
}
