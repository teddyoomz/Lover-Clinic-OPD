#!/usr/bin/env node
// Rule R diagnostic — verify ACTUAL production data field names for central
// stock collections. Read-only; no writes. Reveals the exact field names
// each collection uses so CENTRAL_BUCKETS spec can be corrected.

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

function dataCol(db, name) {
  return db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(name);
}

const COLLECTIONS = [
  'be_central_stock_warehouses',
  'be_central_stock_orders',
  'be_central_stock_movements',
  'be_stock_batches',
  'be_stock_movements',
  'be_stock_transfers',
  'be_stock_withdrawals',
  'be_stock_adjustments',
];

async function main() {
  console.log('▶ Rule R diag — central stock production field names\n');
  const db = getAdmin();

  for (const col of COLLECTIONS) {
    const snap = await dataCol(db, col).limit(2).get();
    if (snap.empty) {
      console.log(`\n[${col}] EMPTY — no docs in prod`);
      continue;
    }
    console.log(`\n[${col}] (${snap.size} sample docs)`);
    const fieldUniverse = new Set();
    for (const d of snap.docs) {
      for (const k of Object.keys(d.data())) fieldUniverse.add(k);
    }
    // Look for warehouse/location/branch identifier fields specifically
    const idFields = [...fieldUniverse].filter(f =>
      /warehouse|location|branch|stock(?:Id|Type)/i.test(f) && !/created|updated|cost/i.test(f),
    );
    console.log(`  ID-related fields: ${idFields.join(', ') || '(none)'}`);

    // Show actual sample values for each ID field
    for (const f of idFields) {
      const vals = snap.docs.map(d => d.data()[f]).filter(v => v !== undefined);
      console.log(`    ${f}: ${JSON.stringify(vals)}`);
    }
    // Show locationType if present
    for (const d of snap.docs) {
      if (d.data().locationType) {
        console.log(`    (doc ${d.id.slice(0, 20)}: locationType=${d.data().locationType})`);
      }
    }
  }
  console.log('\n✓ Diag complete');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e); process.exit(1); });
}
