#!/usr/bin/env node
// Scanner: find all NaN/Infinity values in branch-scoped collections.
// These cannot survive JSON round-trip (JSON.stringify NaN/Infinity → null,
// JSON.parse null → null). Backup→Restore drops these values to null.
//
// Pure read-only diagnostic. Reports list + path. User can decide to clean.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { TIER_MAP, BACKUP_TIER_T1, BACKUP_TIER_T2, BACKUP_TIER_T3, T4_SUBCOLLECTIONS } from '../src/lib/branchBackupCore.js';

const envFile = '.env.local.prod';
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2]; if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: 'loverclinic-opd-4c39b',
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n'),
    }),
  });
}
const db = getFirestore();
const dataCol = (name) => db.collection('artifacts').doc('loverclinic-opd-4c39b').collection('public').doc('data').collection(name);

const findings = []; // { col, docId, path, value, kind }

function walk(obj, pathPrefix) {
  if (typeof obj === 'number') {
    if (Number.isNaN(obj)) findings.push({ ...pathPrefix, value: 'NaN', kind: 'NaN' });
    else if (!Number.isFinite(obj)) findings.push({ ...pathPrefix, value: String(obj), kind: 'Infinity' });
    return;
  }
  if (obj === null || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => walk(v, { ...pathPrefix, path: `${pathPrefix.path}[${i}]` }));
    return;
  }
  // Skip Firestore special types (Timestamp, GeoPoint, DocumentReference)
  if (typeof obj.toDate === 'function' || typeof obj.path === 'string' && obj.id) return;
  for (const [k, v] of Object.entries(obj)) {
    walk(v, { ...pathPrefix, path: `${pathPrefix.path}.${k}` });
  }
}

async function scanCollection(colName, isT4 = false, parentInfo = null) {
  if (isT4) {
    // T4 — per-customer subcollection
    const customersSnap = await dataCol('be_customers').get();
    for (const cust of customersSnap.docs) {
      for (const sub of T4_SUBCOLLECTIONS) {
        const subSnap = await cust.ref.collection(sub).get();
        for (const d of subSnap.docs) {
          const data = d.data();
          walk(data, { col: `be_customers/${cust.id}/${sub}`, docId: d.id, path: '' });
        }
      }
    }
  } else {
    const docs = await dataCol(colName).get();
    for (const d of docs.docs) {
      const data = d.data();
      walk(data, { col: colName, docId: d.id, path: '' });
    }
  }
}

async function main() {
  console.log('═══ Scan branch-scoped collections for NaN / Infinity ═══\n');

  const allCols = [
    ...TIER_MAP[BACKUP_TIER_T1],
    ...TIER_MAP[BACKUP_TIER_T2],
    ...TIER_MAP[BACKUP_TIER_T3],
  ];

  for (const colName of allCols) {
    process.stdout.write(`Scanning ${colName}... `);
    const before = findings.length;
    await scanCollection(colName);
    const added = findings.length - before;
    console.log(`${added > 0 ? '⚠️  ' + added + ' bad' : 'clean'}`);
  }

  console.log('Scanning T4 customer subcollections... ');
  const beforeT4 = findings.length;
  await scanCollection(null, true);
  console.log(`${findings.length - beforeT4 > 0 ? '⚠️  ' + (findings.length - beforeT4) + ' bad' : 'clean'}`);

  console.log(`\n═══ TOTAL: ${findings.length} field(s) with NaN/Infinity ═══`);

  if (findings.length === 0) {
    console.log('✅ All branch-scoped data is JSON-safe — backup round-trip will be 100% faithful.');
    return;
  }

  // Group + report
  console.log('\nDetail:');
  for (const f of findings) {
    console.log(`  ${f.kind.padEnd(8)} ${f.col}/${f.docId}${f.path}`);
  }

  console.log('\nNote: NaN/Infinity cannot survive JSON serialization. Backup → restore');
  console.log('would convert these to null. To get 100% round-trip integrity, replace');
  console.log('these values with `null` directly (same JSON representation):');
  console.log('  node scripts/diag-fix-nan-infinity.mjs --apply\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
}
