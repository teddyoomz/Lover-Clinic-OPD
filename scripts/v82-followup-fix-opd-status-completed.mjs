#!/usr/bin/env node
// scripts/v82-followup-fix-opd-status-completed.mjs
// V82-followup ERRATUM: my reset script set status='pending' on the 81 opd_sessions
// reset for re-sync. WRONG. The queue card render gates the "Save to OPD" button
// on `session.status === 'completed'` (AdminDashboard.jsx:7983). 'pending' in the
// schema means "form not yet submitted by patient"; 'completed' means "patient
// submitted + waiting for admin to save to OPD".
//
// Fix: for all docs with _v82FollowupOpdResetAt stamp, set status='completed'.
// (My earlier reset preserved patientData → form WAS submitted; 'completed' is
// the correct semantic state.)
//
// Original docs' status was 'completed' (most) or 'pending' (a couple genuinely
// unfinished). The reset script INVERTED the semantic. This script corrects.
//
// USAGE: node scripts/v82-followup-fix-opd-status-completed.mjs --apply

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
  for (const line of fs.readFileSync(path.resolve('.env.local.prod'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function col(db, name) {
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

  console.log('=== V82-followup ERRATUM: set status="completed" on reset docs ===');
  console.log('Mode:', apply ? 'APPLY' : 'DRY-RUN');
  console.log();

  // Find docs with _v82FollowupOpdResetAt stamp (i.e. previously reset by me)
  const snap = await col(db, 'opd_sessions').get();
  const targets = [];
  for (const d of snap.docs) {
    const data = d.data();
    if (data._v82FollowupOpdResetAt && data.status !== 'completed') {
      targets.push({ id: d.id, currentStatus: data.status, hasPatientData: !!data.patientData });
    }
  }

  console.log(`Total opd_sessions: ${snap.size}`);
  console.log(`Targets (_v82 stamp + status != 'completed'): ${targets.length}`);
  if (targets.length === 0) {
    console.log('Nothing to do.');
    return;
  }
  console.log('\nSample first 5:');
  for (const t of targets.slice(0, 5)) {
    console.log(`  ${t.id}: status=${JSON.stringify(t.currentStatus)} hasPatientData=${t.hasPatientData}`);
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
        _v82FollowupStatusFixedAt: FieldValue.serverTimestamp(),
        _v82FollowupStatusFixedFrom: t.currentStatus ?? null,
      });
    }
    await batch.commit();
    updated += chunk.length;
    console.log(`  Progress: ${updated}/${targets.length}`);
  }

  // Audit
  const ts = Date.now();
  const rand = crypto.randomBytes(4).toString('hex');
  const auditId = `v82-followup-opd-status-completed-fix-${ts}-${rand}`;
  await col(db, 'be_admin_audit').doc(auditId).set({
    type: 'v82-followup-opd-status-completed-fix',
    performedAt: new Date().toISOString(),
    reason: 'Erratum: reset script set status=pending but queue card needs status=completed to show Save-to-OPD button.',
    targetsCount: updated,
  });

  console.log(`\n✓ ${updated} docs → status='completed'`);
  console.log(`✓ Audit: be_admin_audit/${auditId}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(err => { console.error('FATAL:', err.message || err); process.exit(1); });
}
