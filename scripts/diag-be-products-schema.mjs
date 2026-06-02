#!/usr/bin/env node
// Rule R diagnostic (READ-ONLY) — enumerate the REAL be_products field universe
// across all prod docs so the V145 normalizeProduct whitelist preserves EVERY
// legit field (stockConfig / mainProductId / forensic _* / isHidden / ...) and
// only drops stock-aggregation junk. No writes.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { emptyProductForm } from '../src/lib/productValidation.js';

function loadDotEnv(envPath) {
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    let [, k, v] = m;
    if (process.env[k] !== undefined) continue;
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
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
  const app = initializeApp({ credential: cert({ projectId: APP_ID, clientEmail, privateKey: rawKey.split('\\n').join('\n') }) });
  return getFirestore(app);
}

function dataCol(db, name) {
  return db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(name);
}

async function main() {
  console.log('▶ Rule R diag — be_products REAL field universe\n');
  const db = getAdmin();
  const snap = await dataCol(db, 'be_products').get();
  console.log(`be_products total docs: ${snap.size}`);

  const formKeys = new Set(Object.keys(emptyProductForm()));
  // keys saveProduct adds itself (not from the form) — expected on every doc
  const SAVE_ADDED = new Set(['productId', 'branchId', 'createdAt', 'updatedAt']);

  const universe = new Map(); // key -> count
  const sampleValue = {};     // key -> a sample non-null value (truncated)
  for (const d of snap.docs) {
    const data = d.data();
    for (const k of Object.keys(data)) {
      universe.set(k, (universe.get(k) || 0) + 1);
      if (sampleValue[k] === undefined && data[k] != null) {
        let v = data[k];
        if (typeof v === 'object') v = '[' + (Array.isArray(v) ? 'array' : 'object') + ' ' + JSON.stringify(v).slice(0, 80) + ']';
        else v = String(v).slice(0, 40);
        sampleValue[k] = v;
      }
    }
  }

  const allKeys = [...universe.keys()].sort();
  const extras = allKeys.filter(k => !formKeys.has(k) && !SAVE_ADDED.has(k) && !k.startsWith('_'));
  const forensic = allKeys.filter(k => k.startsWith('_'));
  const formButMissingOnSomeDocs = [...formKeys].filter(k => (universe.get(k) || 0) < snap.size).sort();

  console.log(`\n── ALL ${allKeys.length} top-level keys (count / sample) ──`);
  for (const k of allKeys) {
    const tag = formKeys.has(k) ? 'FORM' : SAVE_ADDED.has(k) ? 'save' : k.startsWith('_') ? 'forensic' : '⚠EXTRA';
    console.log(`  [${tag}] ${k}  (${universe.get(k)})  e.g. ${sampleValue[k] ?? '(null)'}`);
  }

  console.log(`\n── ⚠ EXTRA keys (NOT in emptyProductForm, NOT save-added, NOT _forensic) — MUST be in whitelist or they get dropped ──`);
  console.log(extras.length ? extras.map(k => `  ${k}  e.g. ${sampleValue[k]}`).join('\n') : '  (none)');

  console.log(`\n── forensic _* keys (preserve via _-prefix rule) ──`);
  console.log(forensic.length ? '  ' + forensic.join(', ') : '  (none)');

  console.log(`\n── emptyProductForm keys absent on some docs (informational) ──`);
  console.log(formButMissingOnSomeDocs.length ? '  ' + formButMissingOnSomeDocs.join(', ') : '  (none)');

  // Spotlight the user's reported products
  console.log('\n── spotlight: ถุงมือ / Matigen ──');
  for (const d of snap.docs) {
    const n = String(d.data().productName || '');
    if (/ถุงมือ|Matigen|เนื้อเยื่อ/i.test(n)) {
      const { productName, productType, categoryName, mainUnitName, price, stockConfig } = d.data();
      console.log(`  ${d.id}: name="${productName}" type=${productType} cat=${categoryName} unit=${mainUnitName} price=${price} stockConfig=${JSON.stringify(stockConfig) || '-'}`);
    }
  }

  console.log('\n✓ Diag complete (read-only)');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e); process.exit(1); });
}
