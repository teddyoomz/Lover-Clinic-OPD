#!/usr/bin/env node
// ─── Rule M one-shot: delete the clinic_schedules/ws1-probe-vandal litter doc ─
//
// Origin: a WS1 lockdown probe (2026-06-10) left a vandal-test doc in the
// world-readable clinic_schedules collection. Flagged in the perf punchlist
// (2026-07-06) as litter needing a Rule M delete; user authorized the sweep
// 2026-07-19 ("ไล่ทำทั้งหมดอย่าให้เหลือ").
//
// Two-phase: dry-run prints the doc; --apply deletes + audit doc. Idempotent.
// Run: node scripts/v209-delete-ws1-probe-vandal.mjs [--apply]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const APPLY = process.argv.includes('--apply');

function loadEnvLocal() {
  const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8');
  const out = {};
  for (const line of txt.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('='); if (eq < 0) continue;
    let v = line.slice(eq + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    out[line.slice(0, eq).trim()] = v;
  }
  return out;
}

async function main() {
  if (!getApps().length) {
    const env = loadEnvLocal();
    initializeApp({ credential: cert({
      projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n'),
    }) });
  }
  const db = getFirestore();
  const data = db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
  const ref = data.collection('clinic_schedules').doc('ws1-probe-vandal');
  const snap = await ref.get();

  if (!snap.exists) {
    console.log('ws1-probe-vandal: already gone (idempotent no-op).');
    return;
  }
  const doc = snap.data();
  console.log('── DRY-RUN VIEW ─────────────────────────────');
  console.log(JSON.stringify(doc, null, 2).slice(0, 2000));
  console.log('─────────────────────────────────────────────');
  const looksLikeProbe = JSON.stringify(doc).toLowerCase().includes('probe')
    || JSON.stringify(doc).toLowerCase().includes('vandal')
    || !doc.months; // real schedule-links carry months[]
  console.log(`classification: ${looksLikeProbe ? 'PROBE LITTER (safe to delete)' : '⚠ does NOT look like probe litter — ABORTING'}`);
  if (!looksLikeProbe) { process.exitCode = 1; return; }

  if (!APPLY) {
    console.log('\nDRY-RUN only. Re-run with --apply to delete.');
    return;
  }
  await ref.delete();
  const auditId = `v209-delete-ws1-probe-vandal-${Date.now()}-${randomBytes(4).toString('hex')}`;
  await data.collection('be_admin_audit').doc(auditId).set({
    op: 'delete-litter-doc',
    target: 'clinic_schedules/ws1-probe-vandal',
    deletedDocSnapshot: doc,
    reason: 'WS1 probe litter (perf punchlist 2026-07-06); user-authorized sweep 2026-07-19',
    appliedAt: FieldValue.serverTimestamp(),
  });
  const verify = await ref.get();
  console.log(`\nDELETED ✓ (verify exists=${verify.exists}) · audit ${auditId}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(process.exitCode || 0)).catch((e) => { console.error('FATAL', e); process.exit(1); });
}
