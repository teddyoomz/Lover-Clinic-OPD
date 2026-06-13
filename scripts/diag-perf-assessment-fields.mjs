// ─── diag-perf-assessment-fields.mjs — Rule R READ-ONLY diagnostic ───────────
// User report (2026-06-13): customer filled สมรรถภาพทางเพศ assessment
// (Part1 symp_pe / ADAM adam_1..10 / IIEF-5 iief_1..5) via PatientForm QR, but
// the intake view (บันทึกข้อมูลรับเข้า) shows everything 0 / ไม่มี.
//
// Reader (AdminDashboard.jsx:4804) = viewingSession.patientData. Writer
// (PatientForm.jsx:397-401) = patientData: {...formData}. Shapes match — so
// this dumps the ACTUAL stored patientData for the customer to find whether
// the perf-assessment fields are present, and with what values/types.
//
// READ-ONLY. Usage: node scripts/diag-perf-assessment-fields.mjs [phoneOrName]

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const NEEDLE = (process.argv[2] || '0910157999').trim(); // phone OR name fragment

function loadEnvLocal() { const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8'); const out = {}; for (const line of txt.split(/\r?\n/)) { if (!line || line.startsWith('#')) continue; const eq = line.indexOf('='); if (eq < 0) continue; const k = line.slice(0, eq).trim(); let v = line.slice(eq + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); out[k] = v; } return out; }
function initAdmin() { if (adminApps().length) return adminFirestore(); const env = loadEnvLocal(); adminInit({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n') }) }); return adminFirestore(); }
const base = (db) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');

const PERF_KEYS = [
  'symp_pe',
  ...Array.from({ length: 10 }, (_, i) => `adam_${i + 1}`),
  ...Array.from({ length: 5 }, (_, i) => `iief_${i + 1}`),
];

function describe(v) { return `${JSON.stringify(v)} (${v === undefined ? 'undefined' : typeof v})`; }

async function main() {
  const db = initAdmin();
  const data = base(db);
  console.log(`═══ diag: perf-assessment fields — search "${NEEDLE}" (READ-ONLY) ═══\n`);

  // Scan opd_sessions (the reader's source) — match phone OR name fragment.
  const snap = await data.collection('opd_sessions').get();
  const matches = [];
  for (const d of snap.docs) {
    const s = d.data();
    const pd = s.patientData || {};
    const phone = String(pd.phone || s.phone || '');
    const name = `${pd.firstName || ''} ${pd.lastName || ''}`.trim();
    if (phone.includes(NEEDLE) || name.includes(NEEDLE)) {
      matches.push({ id: d.id, s, pd, name, phone });
    }
  }
  console.log(`opd_sessions scanned: ${snap.size}; matches: ${matches.length}\n`);

  for (const m of matches) {
    const { s, pd } = m;
    console.log(`──────────────────────────────────────────────────────────────`);
    console.log(`opd_sessions/${m.id}`);
    console.log(`  name="${m.name}"  phone="${m.phone}"  status=${s.status}  formType=${s.formType ?? '(none)'}  sessionType=${s.sessionType ?? '(none)'}`);
    console.log(`  submittedAt=${s.submittedAt?.toDate?.()?.toISOString?.() || s.submittedAt || '-'}  updatedAt=${s.updatedAt?.toDate?.()?.toISOString?.() || s.updatedAt || '-'}`);
    console.log(`  visitReasons=${JSON.stringify(pd.visitReasons)}  hrtGoals=${JSON.stringify(pd.hrtGoals)}`);
    console.log(`  gender=${JSON.stringify(pd.gender)}`);
    console.log(`  PERF-ASSESSMENT FIELDS:`);
    let present = 0, truthy = 0;
    for (const k of PERF_KEYS) {
      const has = Object.prototype.hasOwnProperty.call(pd, k);
      if (has) present++;
      if (pd[k]) truthy++;
      console.log(`     ${has ? (pd[k] ? '✓' : '·') : '✗'} ${k.padEnd(9)} = ${describe(pd[k])}${has ? '' : '   ← KEY ABSENT'}`);
    }
    console.log(`  → ${present}/${PERF_KEYS.length} keys present, ${truthy} truthy`);
    // All patientData keys, to see what IS stored (catch shape drift).
    console.log(`  ALL patientData keys (${Object.keys(pd).length}): ${Object.keys(pd).sort().join(', ')}`);
    // Are perf keys maybe nested somewhere else on the session (top-level)?
    const topLevelPerf = PERF_KEYS.filter((k) => Object.prototype.hasOwnProperty.call(s, k));
    if (topLevelPerf.length) console.log(`  ⚠ perf keys found at SESSION TOP-LEVEL (not patientData): ${topLevelPerf.join(', ')}`);
  }

  if (matches.length === 0) console.log('No opd_sessions matched — widen the needle (pass a name fragment as argv).');
  console.log(`\n═══ done ═══`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
