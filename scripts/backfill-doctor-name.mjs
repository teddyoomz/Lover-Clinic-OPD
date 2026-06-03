#!/usr/bin/env node
// ═══ Rule M — backfill be_doctors.name (+ snapshotted appt.doctorName) (two-phase) ═══
// be_doctors.name is read RAW by the appointment form (แพทย์ dropdown + assistant
// checkbox) + stored on each appt as doctorName. The form has no `name` input and
// saveDoctor (pre-2026-06-04) never recomputed it → it went stale. Real prod:
//   DOC-mpwmsm1i  name="บริบูรณ์ วังแก้ว"  → should be "หมอมุก" (firstname/nickname)
//   ASST-mowphsbf name=""                 → should be "ยาหยี"
// This heals existing data; the saveDoctor chokepoint fix prevents recurrence.
// Composition MIRRORS src/lib/doctorValidation.js composeDoctorName (full || nickname).
//   DRY-RUN (default): list what WOULD change. --apply: write + audit + forensic.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore, FieldValue } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const APPLY = process.argv.includes('--apply');
function loadEnvLocal() { const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8'); const out = {}; for (const line of txt.split(/\r?\n/)) { if (!line || line.startsWith('#')) continue; const eq = line.indexOf('='); if (eq < 0) continue; const k = line.slice(0, eq).trim(); let v = line.slice(eq + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); out[k] = v; } return out; }
function initAdmin() { if (adminApps().length) return adminFirestore(); const env = loadEnvLocal(); adminInit({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n') }) }); return adminFirestore(); }
const base = (db) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');

const t = (v) => (typeof v === 'string' ? v.trim() : '');
const composeDoctorName = (f) => (`${t(f?.firstname)} ${t(f?.lastname)}`.trim() || t(f?.nickname));

async function main() {
  const db = initAdmin();
  const data = base(db);
  console.log(`═══ Doctor name backfill — ${APPLY ? 'APPLY (will write)' : 'DRY-RUN (no writes)'} ═══\n`);

  // 1. be_doctors.name recompute
  const docSnap = await data.collection('be_doctors').get();
  const fixes = []; // { id, from, to }
  for (const d of docSnap.docs) {
    const x = d.data();
    const cur = t(x.name);
    const next = composeDoctorName(x);
    if (next && cur !== next) fixes.push({ id: d.id, from: cur, to: next });
  }
  console.log(`be_doctors to fix: ${fixes.length}`);
  for (const f of fixes) console.log(`  [${f.id}] name "${f.from}" → "${f.to}"`);

  // 2. snapshotted appt.doctorName for any doctor we're renaming (scope: exact doctorId)
  const apptFixes = []; // { id, doctorId, from, to }
  for (const f of fixes) {
    let snap;
    try { snap = await data.collection('be_appointments').where('doctorId', '==', f.id).get(); } catch { snap = { docs: [] }; }
    for (const a of snap.docs) {
      const cur = t(a.data().doctorName);
      if (cur && cur !== f.to) apptFixes.push({ id: a.id, doctorId: f.id, from: cur, to: f.to });
    }
  }
  console.log(`\nbe_appointments doctorName snapshots to fix: ${apptFixes.length}`);
  const sample = apptFixes.slice(0, 12);
  for (const a of sample) console.log(`  appt ${a.id}: doctorName "${a.from}" → "${a.to}"`);
  if (apptFixes.length > sample.length) console.log(`  … +${apptFixes.length - sample.length} more`);

  if (!APPLY) { console.log('\n  DRY-RUN — re-run with --apply to write.'); return; }

  // apply be_doctors
  for (const f of fixes) {
    await data.collection('be_doctors').doc(f.id).update({
      name: f.to,
      _nameRecomputedAt: FieldValue.serverTimestamp(),
      _nameLegacyValue: f.from,
      updatedAt: new Date().toISOString(),
    });
  }
  // apply appts in batches
  for (let i = 0; i < apptFixes.length; i += 400) {
    const batch = db.batch();
    for (const a of apptFixes.slice(i, i + 400)) {
      batch.update(data.collection('be_appointments').doc(a.id), {
        doctorName: a.to, _doctorNameRecomputedAt: FieldValue.serverTimestamp(), _doctorNameLegacyValue: a.from,
      });
    }
    await batch.commit();
  }
  const auditId = `backfill-doctor-name-${Date.now()}-${randomBytes(4).toString('hex')}`;
  await data.collection('be_admin_audit').doc(auditId).set({
    op: 'backfill-doctor-name', doctorsFixed: fixes.length, apptsFixed: apptFixes.length,
    doctorFixes: fixes, apptFixes, appliedAt: FieldValue.serverTimestamp(),
  });
  console.log(`\n  ✓ Fixed ${fixes.length} doctors + ${apptFixes.length} appt snapshots. Audit: be_admin_audit/${auditId}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error('ERROR:', e); process.exit(1); });
}
