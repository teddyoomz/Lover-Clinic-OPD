#!/usr/bin/env node
// Rule Q L2 — V145 product-edit corruption-prevention + whitelist-completeness,
// against REAL prod be_products. Two proofs:
//   (1) ROUND-TRIP a TEST-V145- fixture through the stock-edit save path
//       (modal form + leaked stock-row junk) → assert legit fields NOT wiped,
//       junk NOT written, stockConfig/createdBy/forensic preserved. Cleanup.
//   (2) COMPLETENESS — run EVERY one of the ~610 real docs through
//       normalizeProduct and assert ZERO legit field is dropped (the whitelist
//       covers the full real schema; only the 8 stock-junk keys disappear).
// Admin SDK is the supplement (write/read); the behavior under test is the
// PURE normalizeProduct whitelist applied to REAL doc shapes. No compound
// query/index here, so admin SDK is a valid L2 for this change.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { normalizeProduct, emptyProductForm } from '../src/lib/productValidation.js';

function loadDotEnv(p) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (!m) continue;
    let [, k, v] = m; if (process.env[k] !== undefined) continue;
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
  return getFirestore(initializeApp({ credential: cert({ projectId: APP_ID, clientEmail, privateKey: rawKey.split('\\n').join('\n') }) }));
}
const col = (db) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection('be_products');

const JUNK = ['batches', 'expired', 'nextExpiry', 'totalCapacity', 'totalRemaining', 'unit', 'valueCost', 'id'];
const SAVE_ADDED = new Set(['productId', 'branchId', 'createdAt', 'updatedAt']);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };

async function main() {
  console.log('▶ Rule Q L2 — V145 product-edit round-trip + whitelist completeness\n');
  const db = getAdmin();

  // ── PROOF 1 — corruption-prevention round-trip on a TEST fixture ──
  const id = 'TEST-V145-' + Date.now();
  const ref = col(db).doc(id);
  try {
    // seed a realistic full product (incl. stockConfig + createdBy + forensic)
    const seed = {
      ...normalizeProduct({
        ...emptyProductForm(), productName: 'TEST V145 ถุงมือ', productType: 'สินค้าสิ้นเปลือง',
        categoryName: 'อุปกรณ์', mainUnitName: 'กล่อง', price: 1200, productCode: 'TST-V145',
        stockConfig: { trackStock: true, unit: 'กล่อง', minAlert: 0, isControlled: false },
        createdBy: 'test-creator', _v145TestStamp: 'keepme',
      }),
      productId: id, branchId: 'TEST-BR-V145', createdAt: 't0', updatedAt: 't0',
    };
    await ref.set(seed);
    const stored = (await ref.get()).data();

    // simulate the stock-edit modal: form = {...emptyProductForm(), ...storedDoc}
    // + user changes unit + (the bug) stock-row junk leaks in
    const modalForm = {
      ...emptyProductForm(), ...stored, mainUnitName: 'ชิ้น',
      batches: [{ batchId: 'X' }], totalRemaining: 5, totalCapacity: 0, nextExpiry: null,
      expired: 0, unit: 'ครั้ง', valueCost: 99, id: 'STRAY-ID',
    };
    // mirror saveProduct's EXACT composition incl. _resolveBranchIdForWrite(data)
    // (data.branchId wins; normalizeProduct itself drops branchId — saveProduct re-adds it)
    const resolveBranchIdForWrite = (d) => (d && typeof d.branchId === 'string' && d.branchId.trim()) ? d.branchId : 'CTX-FALLBACK';
    const saved = { ...normalizeProduct(modalForm), branchId: resolveBranchIdForWrite(modalForm), productId: id, createdAt: stored.createdAt, updatedAt: 't1' };
    await ref.set(saved); // admin set() with no merge = full replace (mirrors saveProduct merge:false)
    const after = (await ref.get()).data();

    console.log('PROOF 1 — corruption-prevention round-trip:');
    ok(after.mainUnitName === 'ชิ้น', `edit applied: mainUnitName=${after.mainUnitName} (want ชิ้น)`);
    ok(after.branchId === 'TEST-BR-V145', `branchId preserved through whitelist: ${after.branchId} (want TEST-BR-V145, NOT wiped/jumped)`);
    ok(after.categoryName === 'อุปกรณ์', `category NOT wiped: ${after.categoryName}`);
    ok(after.productType === 'สินค้าสิ้นเปลือง', `type NOT wiped to ยา: ${after.productType}`);
    ok(Number(after.price) === 1200, `price NOT wiped: ${after.price}`);
    ok(after.stockConfig && after.stockConfig.trackStock === true, `stockConfig preserved: ${JSON.stringify(after.stockConfig)}`);
    ok(after.createdBy === 'test-creator', `createdBy preserved: ${after.createdBy}`);
    ok(after._v145TestStamp === 'keepme', `forensic _v145TestStamp preserved: ${after._v145TestStamp}`);
    for (const k of JUNK) ok(!(k in after), `junk "${k}" NOT written to doc`);
  } finally {
    await ref.delete().catch(() => {});
    const gone = !(await ref.get()).exists;
    ok(gone, 'TEST fixture cleaned up (no orphan)');
  }

  // ── PROOF 2 — whitelist completeness across ALL real docs ──
  console.log('\nPROOF 2 — whitelist completeness (every real doc, zero legit-field loss):');
  const snap = await col(db).get();
  let droppedLegit = 0; const offenders = [];
  for (const d of snap.docs) {
    const data = d.data();
    // mirror the modal save input shape
    const out = normalizeProduct({ ...emptyProductForm(), ...data });
    for (const k of Object.keys(data)) {
      if (JUNK.includes(k) || SAVE_ADDED.has(k)) continue; // junk/save-added are expected to differ
      if (!(k in out)) { droppedLegit++; if (offenders.length < 10) offenders.push(`${d.id}:${k}`); }
    }
    // junk must always be dropped
    for (const k of JUNK) if (k in out) { droppedLegit++; offenders.push(`${d.id}:JUNK-LEAKED:${k}`); }
  }
  ok(droppedLegit === 0, `legit-field loss across ${snap.size} docs = ${droppedLegit} (offenders: ${offenders.join(', ') || 'none'})`);
  console.log(`  scanned ${snap.size} real be_products docs`);

  console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAIL'} — pass=${pass} fail=${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e); process.exit(1); });
}
