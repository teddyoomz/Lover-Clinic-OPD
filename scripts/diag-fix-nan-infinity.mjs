#!/usr/bin/env node
// Rule M one-shot: replace NaN / Infinity values in branch-scoped data with
// null (matches JSON's representation of these values). Two-phase: default
// dry-run, --apply commits.
//
// Identifies and fixes data quality issues that prevent 100% backup round-trip.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { randomBytes } from 'node:crypto';
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

const APP_ID = 'loverclinic-opd-4c39b';
if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n'),
    }),
  });
}
const db = getFirestore();
const dataCol = (name) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(name);

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true];
}));
const APPLY = args.apply === true || args.apply === 'true';

const findings = []; // { col, docId, path, value, ref }

function walk(obj, pathPrefix) {
  if (typeof obj === 'number') {
    if (Number.isNaN(obj)) findings.push({ ...pathPrefix, value: 'NaN' });
    else if (!Number.isFinite(obj)) findings.push({ ...pathPrefix, value: String(obj) });
    return;
  }
  if (obj === null || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => walk(v, { ...pathPrefix, path: `${pathPrefix.path}[${i}]` }));
    return;
  }
  if (typeof obj.toDate === 'function') return; // Timestamp
  for (const [k, v] of Object.entries(obj)) {
    walk(v, { ...pathPrefix, path: `${pathPrefix.path}.${k}` });
  }
}

async function scan() {
  const allCols = [...TIER_MAP[BACKUP_TIER_T1], ...TIER_MAP[BACKUP_TIER_T2], ...TIER_MAP[BACKUP_TIER_T3]];
  for (const colName of allCols) {
    const docs = await dataCol(colName).get();
    for (const d of docs.docs) {
      walk(d.data(), { col: colName, docId: d.id, path: '', ref: d.ref });
    }
  }
  // T4
  const customersSnap = await dataCol('be_customers').get();
  for (const cust of customersSnap.docs) {
    for (const sub of T4_SUBCOLLECTIONS) {
      const subSnap = await cust.ref.collection(sub).get();
      for (const d of subSnap.docs) {
        walk(d.data(), { col: `be_customers/${cust.id}/${sub}`, docId: d.id, path: '', ref: d.ref });
      }
    }
  }
}

// Set field at dotted path to null using Firestore's update with field path.
// Path examples:
//   ".costPrice"          → top-level field "costPrice"
//   ".items[0].qty"        → array index 0's qty field
async function patchToNull(ref, path) {
  // Strip leading dot
  const p = path.replace(/^\./, '');
  // Simple top-level field with no array indexing
  if (!p.includes('[') && !p.includes(']')) {
    await ref.update({ [p]: null });
    return;
  }
  // Has array index — read full doc, mutate copy, rewrite
  const snap = await ref.get();
  const data = snap.data();
  // Walk path components, mutating
  const parts = p.match(/[^.\[\]]+|\[\d+\]/g) || [];
  let cur = data;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i].startsWith('[') ? parseInt(parts[i].slice(1, -1), 10) : parts[i];
    cur = cur?.[key];
    if (!cur) return; // path no longer exists
  }
  const lastKey = parts[parts.length - 1].startsWith('[') ? parseInt(parts[parts.length - 1].slice(1, -1), 10) : parts[parts.length - 1];
  cur[lastKey] = null;
  await ref.set(data, { merge: false });
}

async function main() {
  console.log(`═══ NaN/Infinity fixer (mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}) ═══\n`);
  await scan();

  if (findings.length === 0) {
    console.log('✅ No NaN/Infinity values found — nothing to fix.');
    return;
  }

  console.log(`Found ${findings.length} field(s) to fix:\n`);
  for (const f of findings) {
    console.log(`  ${f.col}/${f.docId}${f.path} = ${f.value} → null`);
  }

  if (!APPLY) {
    console.log('\n(Dry-run only. Re-run with --apply to commit changes.)');
    return;
  }

  console.log('\nApplying fixes...');
  const auditRecord = [];
  for (const f of findings) {
    await patchToNull(f.ref, f.path);
    auditRecord.push({ col: f.col, docId: f.docId, path: f.path, oldValue: f.value, newValue: null });
    console.log(`  ✓ ${f.col}/${f.docId}${f.path}`);
  }

  // Audit doc
  const ts = Date.now();
  const auditId = `nan-infinity-fix-${ts}-${randomBytes(4).toString('hex')}`;
  await dataCol('be_admin_audit').doc(auditId).set({
    action: 'nan-infinity-fix',
    fixCount: findings.length,
    fixes: auditRecord,
    appliedBy: 'diag-script',
    appliedAt: new Date().toISOString(),
  });
  console.log(`\n✓ ${findings.length} fixes applied`);
  console.log(`✓ Audit: be_admin_audit/${auditId}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
}
