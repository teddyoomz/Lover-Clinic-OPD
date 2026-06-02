// scripts/export-opd-customers-csv.mjs
// ─── Export OPD customers → CSV for FB Custom Audience targeting ────────────────
//
// READ-ONLY (Rule R) export of the clinic's OWN first-party customer list. Pulls
// EVERY be_customers doc (excludes TEST-/E2E- fixtures), takes the customer's OWN
// phone (patientData.phone — NEVER the emergency-contact phone), plus name / email
// / dob (→ YYYYMMDD, CE) / gender (→ m|f), dedups by phone, and writes
//   F:\FB\targeting\opd-customers.csv
// (OUTSIDE this repo, on the user's git-locked F:\FB). Raw phones go ONLY to that
// local file — the user normalizes + SHA-256 hashes before anything reaches Meta.
// Console prints COUNTS + masked samples only (no PII dump).
//
//   node scripts/export-opd-customers-csv.mjs
//
// Needs .env.local.prod (FIREBASE_ADMIN_*).

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function loadEnvFile(path) {
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const mm = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
      if (!mm) continue;
      let v = mm[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!(mm[1] in process.env)) process.env[mm[1]] = v;
    }
  } catch { /* optional */ }
}
loadEnvFile('.env.local.prod');

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;
const OUT = 'F:/FB/targeting/opd-customers.csv';

function initAdmin() {
  if (getApps().length) return;
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  initializeApp({ credential: cert({
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey }) });
}

const S = (v) => (v == null ? '' : String(v)).trim();
const isTestId = (id) => /^(TEST-|E2E-)/i.test(id);
const digits = (s) => S(s).replace(/\D/g, '');

// customer's OWN phone (NEVER emergencyPhone). patientData first, then top-level.
function pickPhone(pd, c) {
  return S(pd.phone) || S(pd.telephone) || S(c.telephone) || S(c.phone) || '';
}
function pickFirst(pd, c) { return S(pd.firstNameTh) || S(pd.firstName) || S(c.firstname) || S(pd.firstname) || ''; }
function pickLast(pd, c) { return S(pd.lastNameTh) || S(pd.lastName) || S(c.lastname) || S(pd.lastname) || ''; }
function pickEmail(pd, c) { return S(pd.email) || S(c.email) || ''; }
function pickGender(pd, c) {
  const g = (S(pd.gender) || S(c.gender)).toUpperCase();
  if (g === 'M' || g === 'MALE' || g === 'ชาย') return 'm';
  if (g === 'F' || g === 'FEMALE' || g === 'หญิง') return 'f';
  return ''; // LGBTQ / unknown → Meta accepts only m|f
}
// → YYYYMMDD (CE). Prefer ISO birthdate; else reconstruct from dobDay/Month/Year(BE).
function pickDob(pd) {
  const iso = S(pd.birthdate || pd.dob || pd.birthDate);
  let m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    let y = parseInt(m[1], 10); if (y > 2400) y -= 543; // defensive BE→CE
    if (y >= 1900 && y <= 2100) return `${y}${m[2]}${m[3]}`;
  }
  const dd = parseInt(pd.dobDay, 10), mm = parseInt(pd.dobMonth, 10);
  let yy = parseInt(pd.dobYear, 10);
  if (yy > 2400) yy -= 543; // BE → CE
  if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12 && yy >= 1900 && yy <= 2100) {
    return `${yy}${String(mm).padStart(2, '0')}${String(dd).padStart(2, '0')}`;
  }
  return '';
}

const csvCell = (v) => {
  const s = S(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const maskPhone = (p) => { const d = digits(p); return d.length >= 4 ? `${'*'.repeat(Math.max(0, d.length - 4))}${d.slice(-4)}` : '****'; };

async function main() {
  initAdmin();
  const db = getFirestore();
  console.log('Reading be_customers …');
  const snap = await db.collection(`${PREFIX}/be_customers`).get();
  console.log(`total be_customers docs: ${snap.size}`);

  let testSkipped = 0, noPhone = 0, shortPhone = 0;
  const byPhone = new Map(); // dedup key (last 9 digits) → row (richest wins)

  for (const doc of snap.docs) {
    if (isTestId(doc.id)) { testSkipped++; continue; }
    const c = doc.data() || {};
    const pd = c.patientData || {};
    const phoneRaw = pickPhone(pd, c);
    if (!phoneRaw) { noPhone++; continue; }
    const d = digits(phoneRaw);
    if (d.length < 9) { shortPhone++; continue; } // junk / partial
    const key = d.slice(-9); // 08x.. / 66.. / +66.. collapse to same person
    const row = {
      phone: phoneRaw,
      first_name: pickFirst(pd, c),
      last_name: pickLast(pd, c),
      email: pickEmail(pd, c),
      dob: pickDob(pd),
      gender: pickGender(pd, c),
    };
    const filled = (r) => Object.values(r).filter(Boolean).length;
    const prev = byPhone.get(key);
    if (!prev || filled(row) > filled(prev)) byPhone.set(key, row);
  }

  const rows = [...byPhone.values()];
  // richer rows first (nicer file; Meta dedups anyway)
  rows.sort((a, b) => Object.values(b).filter(Boolean).length - Object.values(a).filter(Boolean).length);

  const header = ['phone', 'first_name', 'last_name', 'email', 'dob', 'gender'];
  const csv = [header.join(',')]
    .concat(rows.map(r => header.map(h => csvCell(r[h])).join(',')))
    .join('\r\n') + '\r\n';

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, csv, 'utf8'); // UTF-8 (no BOM) — Meta-friendly

  // ── report (counts + masked samples only) ───────────────────────────────
  const withName = rows.filter(r => r.first_name || r.last_name).length;
  const withEmail = rows.filter(r => r.email).length;
  const withDob = rows.filter(r => r.dob).length;
  const withGender = rows.filter(r => r.gender).length;
  console.log('\n── EXPORT SUMMARY ──');
  console.log(`written file       : ${OUT}`);
  console.log(`unique phones (rows): ${rows.length}`);
  console.log(`  with name         : ${withName}`);
  console.log(`  with email        : ${withEmail}`);
  console.log(`  with dob          : ${withDob}`);
  console.log(`  with gender       : ${withGender}`);
  console.log('skipped:');
  console.log(`  TEST/E2E fixtures : ${testSkipped}`);
  console.log(`  no phone          : ${noPhone}`);
  console.log(`  phone <9 digits   : ${shortPhone}`);
  console.log('\nsample (phone masked):');
  for (const r of rows.slice(0, 5)) {
    console.log(`  ${maskPhone(r.phone)} | ${r.first_name} ${r.last_name} | ${r.email || '-'} | ${r.dob || '-'} | ${r.gender || '-'}`);
  }
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error('EXPORT ERROR:', e); process.exit(1); });
}
