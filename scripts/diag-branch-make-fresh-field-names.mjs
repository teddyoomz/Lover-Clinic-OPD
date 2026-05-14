#!/usr/bin/env node
// ─── Rule R diag — branch make-fresh V66 field-name verification ────────────
//
// Purpose: verify the EOD hypothesis that branch-make-fresh.js fails to
// delete be_stock_transfers + be_stock_withdrawals because they don't have
// a `branchId` field — they have `sourceLocationId` + `destinationLocationId`.
//
// Also investigate why Image 1 (Movement Log) + Image 4 (Orders) screenshots
// show residue when those collections DO have `branchId`.
//
// Read-only — does NOT mutate prod data.
//
// Usage: node scripts/diag-branch-make-fresh-field-names.mjs

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function loadDotEnv(envPath) {
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    let [, k, v] = m;
    if (process.env[k] !== undefined) continue;
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[k] = v;
  }
}
loadDotEnv(path.resolve(process.cwd(), '.env.local.prod'));
if (!process.env.FIREBASE_ADMIN_CLIENT_EMAIL) loadDotEnv(path.resolve(process.cwd(), '.env.local'));

const APP_ID = process.env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b';
const BASE_PATH = `artifacts/${APP_ID}/public/data`;

function getAdmin() {
  if (getApps().length > 0) return getFirestore(getApp());
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!clientEmail || !rawKey) throw new Error('FIREBASE_ADMIN_* env missing');
  const app = initializeApp({
    credential: cert({ projectId: APP_ID, clientEmail, privateKey: rawKey.split('\\n').join('\n') }),
  });
  return getFirestore(app);
}

const STOCK_COLLECTIONS = [
  'be_stock_batches',
  'be_stock_movements',
  'be_stock_orders',
  'be_stock_transfers',
  'be_stock_withdrawals',
  'be_stock_adjustments',
];

const CANDIDATE_FIELDS = [
  'branchId',
  'locationId',
  'sourceLocationId',
  'destinationLocationId',
  'destLocationId', // V66 invented anti-pattern check
  'warehouseId',
  'centralWarehouseId',
];

function dataCol(db, name) {
  return db.collection(BASE_PATH + '/' + name);
}

async function listBranches(db) {
  const snap = await dataCol(db, 'be_branches').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function countByField(db, colName, field, value) {
  try {
    const snap = await dataCol(db, colName).where(field, '==', value).count().get();
    return snap.data().count;
  } catch (e) {
    return `ERROR: ${e.code || e.message}`;
  }
}

async function sampleDocFields(db, colName, limit = 3) {
  const snap = await dataCol(db, colName).limit(limit).get();
  return snap.docs.map(d => {
    const data = d.data();
    const fieldsPresent = {};
    for (const f of CANDIDATE_FIELDS) {
      if (data[f] !== undefined) fieldsPresent[f] = data[f];
    }
    return { id: d.id, fields: fieldsPresent };
  });
}

async function totalCount(db, colName) {
  const snap = await dataCol(db, colName).count().get();
  return snap.data().count;
}

async function latestAuditFor(db, branchId) {
  try {
    const snap = await dataCol(db, 'be_admin_audit')
      .where('action', '==', 'branch-make-fresh')
      .where('branchId', '==', branchId)
      .orderBy('executedAt', 'desc')
      .limit(3)
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    // Composite index might not exist — fallback to action-only query
    try {
      const snap = await dataCol(db, 'be_admin_audit')
        .where('action', '==', 'branch-make-fresh')
        .limit(20)
        .get();
      return snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(a => a.branchId === branchId)
        .sort((a, b) => String(b.executedAt || '').localeCompare(String(a.executedAt || '')))
        .slice(0, 3);
    } catch (e2) {
      return [{ id: 'ERROR', error: e2.message }];
    }
  }
}

async function main() {
  const db = getAdmin();

  console.log('─── Rule R diag: branch make-fresh V66 field-name verification ───\n');

  // Step 1 — list branches
  const branches = await listBranches(db);
  console.log(`📍 Found ${branches.length} branches:`);
  for (const b of branches) {
    console.log(`   - ${b.id} ${b.branchName ? `(${b.branchName})` : ''}${b.isDefault ? ' [DEFAULT]' : ''}`);
  }
  console.log();

  // Find นครราชสีมา
  const nakhon = branches.find(b =>
    (b.branchName || '').includes('นครราชสีมา') ||
    (b.branchName || '').toLowerCase().includes('nakhon') ||
    b.id.toLowerCase().includes('nakhon')
  );
  if (!nakhon) {
    console.log('⚠️  Could not auto-identify นครราชสีมา branch — listing all to inspect manually.');
  } else {
    console.log(`🎯 นครราชสีมา branch: ${nakhon.id} (${nakhon.branchName || ''})\n`);
  }

  const TARGET = nakhon ? nakhon.id : null;

  // Step 2 — totals per collection
  console.log('─── Total doc counts per stock collection ───');
  for (const col of STOCK_COLLECTIONS) {
    const total = await totalCount(db, col);
    console.log(`   ${col}: ${total}`);
  }
  console.log();

  // Step 3 — counts by candidate field for นครราชสีมา
  if (TARGET) {
    console.log(`─── Field-name MATCH COUNTS for ${TARGET} (นครราชสีมา) ───`);
    console.log('   Only non-zero results shown:\n');
    for (const col of STOCK_COLLECTIONS) {
      const lines = [];
      for (const f of CANDIDATE_FIELDS) {
        const c = await countByField(db, col, f, TARGET);
        if (typeof c === 'number' && c > 0) {
          lines.push(`     ${f}: ${c}`);
        } else if (typeof c === 'string' && c.startsWith('ERROR')) {
          lines.push(`     ${f}: ${c}`);
        }
      }
      console.log(`   ${col}:`);
      if (lines.length === 0) console.log('     (no matches on any candidate field)');
      else for (const l of lines) console.log(l);
    }
    console.log();
  }

  // Step 4 — sample docs from each collection to see field shape
  console.log('─── SAMPLE docs (first 3 per collection) showing field presence ───\n');
  for (const col of STOCK_COLLECTIONS) {
    console.log(`   ${col}:`);
    const samples = await sampleDocFields(db, col, 3);
    if (samples.length === 0) {
      console.log('     (empty)');
      continue;
    }
    for (const s of samples) {
      console.log(`     ${s.id}: ${JSON.stringify(s.fields)}`);
    }
  }
  console.log();

  // Step 5 — recent branch-make-fresh audit docs
  if (TARGET) {
    console.log(`─── Recent branch-make-fresh audit docs for ${TARGET} ───\n`);
    const audits = await latestAuditFor(db, TARGET);
    if (audits.length === 0) {
      console.log('   (no audit docs found — make-fresh may not have run, or audit doc never written)');
    } else {
      for (const a of audits) {
        if (a.error) { console.log(`   ERROR: ${a.error}`); continue; }
        console.log(`   ${a.id}:`);
        console.log(`     executedAt: ${a.executedAt}`);
        console.log(`     bucketIds: ${JSON.stringify(a.bucketIds)}`);
        console.log(`     deletedCounts:`);
        for (const [k, v] of Object.entries(a.deletedCounts || {})) {
          console.log(`       ${k}: ${v}`);
        }
      }
    }
    console.log();
  }

  // Step 6 — Movement Log specific check: is "Treatment: BT-1777968742959" present?
  console.log('─── Image 1 Movement Log evidence: Treatment BT-1777968742959 ───\n');
  try {
    const movCol = dataCol(db, 'be_stock_movements');
    const treatmentMvts = await movCol
      .where('linkedTreatmentId', '==', 'BT-1777968742959')
      .limit(10)
      .get();
    console.log(`   linkedTreatmentId=BT-1777968742959 → ${treatmentMvts.size} docs`);
    for (const d of treatmentMvts.docs) {
      const data = d.data();
      const fields = {};
      for (const f of CANDIDATE_FIELDS) {
        if (data[f] !== undefined) fields[f] = data[f];
      }
      console.log(`     ${d.id}: ${JSON.stringify(fields)} (type=${data.type}, productName=${data.productName})`);
    }
  } catch (e) {
    console.log(`   ERROR querying linkedTreatmentId: ${e.message}`);
  }
  console.log();

  // Step 7 — Image 4 Orders + Image 3 Transfer specific docs
  console.log('─── Image 3+4 evidence: specific docs from screenshots ───\n');

  const orderRef = dataCol(db, 'be_stock_orders').doc('ORD-1777886635449-424x');
  const orderSnap = await orderRef.get();
  if (orderSnap.exists) {
    const od = orderSnap.data();
    const fields = {};
    for (const f of CANDIDATE_FIELDS) {
      if (od[f] !== undefined) fields[f] = od[f];
    }
    console.log(`   ORD-1777886635449-424x: ${JSON.stringify(fields)} (vendorName=${od.vendorName})`);
  } else {
    console.log('   ORD-1777886635449-424x: NOT FOUND');
  }

  const trfRef = dataCol(db, 'be_stock_transfers').doc('TRF-1778172786209-qbpp');
  const trfSnap = await trfRef.get();
  if (trfSnap.exists) {
    const td = trfSnap.data();
    const fields = {};
    for (const f of CANDIDATE_FIELDS) {
      if (td[f] !== undefined) fields[f] = td[f];
    }
    console.log(`   TRF-1778172786209-qbpp: ${JSON.stringify(fields)} (status=${td.status})`);
  } else {
    console.log('   TRF-1778172786209-qbpp: NOT FOUND');
  }
  console.log();

  console.log('─── End of diag ───');
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => {
    console.error('FATAL:', e);
    process.exit(1);
  });
}
