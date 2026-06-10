// ─── diag-staff-branch-count.mjs — Rule R READ-ONLY diagnostic ────────────────
// User report (2026-06-10): system has 3 branches but StaffTab shows
// "สาขา: 4 สาขา" for มายด์ + OoMz. StaffTab.jsx:198 renders raw
// s.branchIds.length — this diag compares each staff's branchIds against the
// LIVE be_branches set to find stale/orphan branch references.
//
// READ-ONLY. No writes. Usage: node scripts/diag-staff-branch-count.mjs

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';

function loadEnvLocal() { const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8'); const out = {}; for (const line of txt.split(/\r?\n/)) { if (!line || line.startsWith('#')) continue; const eq = line.indexOf('='); if (eq < 0) continue; const k = line.slice(0, eq).trim(); let v = line.slice(eq + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); out[k] = v; } return out; }
function initAdmin() { if (adminApps().length) return adminFirestore(); const env = loadEnvLocal(); adminInit({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n') }) }); return adminFirestore(); }
const base = (db) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');

async function main() {
  const db = initAdmin();
  const data = base(db);
  console.log('═══ diag: staff branchIds vs live be_branches (READ-ONLY) ═══\n');

  const brSnap = await data.collection('be_branches').get();
  const liveBranches = new Map();
  console.log(`be_branches: ${brSnap.size} docs`);
  for (const d of brSnap.docs) {
    const x = d.data();
    liveBranches.set(d.id, x);
    console.log(`  - ${d.id}  name="${x.name || x.branchName || '?'}"  status=${x.status ?? '-'}  isDefault=${x.isDefault ?? '-'}`);
  }

  console.log('\nbe_staff branchIds audit:');
  const stSnap = await data.collection('be_staff').get();
  let flagged = 0;
  for (const d of stSnap.docs) {
    const x = d.data();
    const ids = Array.isArray(x.branchIds) ? x.branchIds : [];
    const orphans = ids.filter((b) => !liveBranches.has(b));
    const dups = ids.filter((b, i) => ids.indexOf(b) !== i);
    const mark = (orphans.length || dups.length) ? '⚠' : ' ';
    if (orphans.length || dups.length) flagged++;
    console.log(`${mark} ${d.id}  name="${x.nickname || x.name || x.firstname || '?'}"  branchIds.length=${ids.length}`);
    for (const b of ids) {
      const live = liveBranches.get(b);
      console.log(`     ${live ? '✓' : '✗ ORPHAN'} ${b}${live ? `  (${live.name || live.branchName})` : '  (NOT in be_branches)'}`);
    }
    if (dups.length) console.log(`     ✗ DUPLICATES: ${JSON.stringify(dups)}`);
  }

  // Same class check: be_doctors (sibling collection with branchIds)
  console.log('\nbe_doctors branchIds audit (class-of-bug sibling):');
  const docSnap = await data.collection('be_doctors').get();
  for (const d of docSnap.docs) {
    const x = d.data();
    const ids = Array.isArray(x.branchIds) ? x.branchIds : [];
    if (!ids.length) continue;
    const orphans = ids.filter((b) => !liveBranches.has(b));
    if (orphans.length) {
      flagged++;
      console.log(`⚠ ${d.id}  name="${x.name || x.nickname || '?'}"  branchIds.length=${ids.length}  orphans=${JSON.stringify(orphans)}`);
    }
  }

  console.log(`\n═══ summary: ${flagged} doc(s) flagged with orphan/duplicate branchIds ═══`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
