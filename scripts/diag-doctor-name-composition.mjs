#!/usr/bin/env node
// ═══ Rule R READ-ONLY — doctor/staff `name` composition + stale-name sweep ═══
// be_doctors.name is read RAW by AppointmentFormModal (แพทย์ dropdown + assistant
// checkboxes + stored appt.doctorName). DoctorFormModal has NO `name` input and
// saveDoctor never recomputes it → `name` carried verbatim → goes stale on rename.
// Dump firstname/lastname/nickname/name for all be_doctors + be_staff, compute
// candidate compositions, flag mismatches (Rule P class-of-bug scope). NO WRITES.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
function loadEnvLocal() { const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8'); const out = {}; for (const line of txt.split(/\r?\n/)) { if (!line || line.startsWith('#')) continue; const eq = line.indexOf('='); if (eq < 0) continue; const k = line.slice(0, eq).trim(); let v = line.slice(eq + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); out[k] = v; } return out; }
function initAdmin() { if (adminApps().length) return adminFirestore(); const env = loadEnvLocal(); adminInit({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n') }) }); return adminFirestore(); }
const base = (db) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');

const trim = (v) => typeof v === 'string' ? v.trim() : '';
// candidate compositions
const C1 = (d) => `${trim(d.firstname)} ${trim(d.lastname)}`.trim();                       // firstname+lastname
const C2 = (d) => trim(d.nickname) || C1(d);                                                // nickname || full
const C3 = (d) => C1(d) || trim(d.nickname);                                                // full || nickname

async function dump(db, col) {
  const snap = await base(db).collection(col).get();
  console.log(`\n── ${col}: ${snap.size} docs ──`);
  let stale = 0;
  for (const doc of snap.docs) {
    const d = doc.data();
    const name = trim(d.name);
    const c1 = C1(d), c2 = C2(d), c3 = C3(d);
    const matchC1 = name === c1, matchC2 = name === c2, matchC3 = name === c3;
    const flag = (!name || (!matchC1 && !matchC2 && !matchC3)) ? '  <<< STALE/EMPTY' : '';
    if (flag) stale++;
    console.log(`  [${doc.id}]`);
    console.log(`     name="${name}"  firstname="${trim(d.firstname)}" lastname="${trim(d.lastname)}" nickname="${trim(d.nickname)}" position="${d.position || ''}"${flag}`);
    console.log(`     C1(fn+ln)="${c1}" C2(nick||full)="${c2}" C3(full||nick)="${c3}"  | matches: C1=${matchC1} C2=${matchC2} C3=${matchC3}`);
  }
  console.log(`  → STALE/EMPTY name in ${col}: ${stale}`);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function main() {
  const db = initAdmin();
  console.log('═══ DOCTOR/STAFF NAME COMPOSITION + STALE SWEEP (read-only) ═══');
  await dump(db, 'be_doctors');
  await dump(db, 'be_staff');
  console.log('\n═══ DONE (no writes) ═══');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error('DIAG ERROR:', e); process.exit(1); });
}
