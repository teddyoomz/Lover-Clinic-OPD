#!/usr/bin/env node
// ─── Diag follow-up: cross-reference flagged productIds against be_sales/treatments
//
// Resolves the V43 follow-on question: are the 4 flagged products
// (skipStockDeduction:true) actually being used in real sales/treatments?
//
// If yes → bug (movement should have been emitted with reason='product-skip')
// If no → hypothesis (a) wins: flag works in code but never exercised yet
//
// READ-ONLY. No writes.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local.prod');
  const txt = readFileSync(envPath, 'utf8');
  const out = {};
  for (const line of txt.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}
function initFirestore() {
  if (getApps().length > 0) return getFirestore();
  const env = loadEnvLocal();
  const projectId = env.FIREBASE_ADMIN_PROJECT_ID || APP_ID;
  const clientEmail = env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const rawKey = env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!clientEmail || !rawKey) throw new Error('FIREBASE_ADMIN_* missing');
  const privateKey = rawKey.split('\\n').join('\n');
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  return getFirestore();
}
function dataPath(db) {
  return db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
}

const FLAGGED_PRODUCT_IDS = [
  'PRODUCTS_1778150429849_0F53501E', // ผ่าตัดทำหมันชาย
  'PRODUCTS_1778150429849_3D0F5DAE', // Shock wave
  'PRODUCTS_1778150429849_4D073E0A', // ติดตามอาการกับแพทย์
  'PRODUCTS_1778150429849_C39C05D7', // เพิ่ม ตัดเส้นสองสลึง
];
const PRODUCT_NAMES = {
  'PRODUCTS_1778150429849_0F53501E': 'ผ่าตัดทำหมันชาย',
  'PRODUCTS_1778150429849_3D0F5DAE': 'Shock wave',
  'PRODUCTS_1778150429849_4D073E0A': 'ติดตามอาการกับแพทย์',
  'PRODUCTS_1778150429849_C39C05D7': 'เพิ่ม ตัดเส้นสองสลึง',
};

function deepFindProductId(obj, targetId, path = '') {
  if (obj == null) return [];
  if (typeof obj !== 'object') return [];
  const hits = [];
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => {
      hits.push(...deepFindProductId(item, targetId, `${path}[${i}]`));
    });
  } else {
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'productId' && String(v) === targetId) {
        hits.push(`${path}.productId=${v}`);
      }
      if (v && typeof v === 'object') {
        hits.push(...deepFindProductId(v, targetId, `${path}.${k}`));
      }
    }
  }
  return hits;
}

async function main() {
  const db = initFirestore();
  const data = dataPath(db);
  console.log('[diag] Cross-reference flagged productIds vs be_sales / be_treatments');
  console.log(`[diag] Run timestamp: ${new Date().toISOString()}\n`);

  // Fetch all sales + treatments
  const [salesSnap, treatmentsSnap] = await Promise.all([
    data.collection('be_sales').get(),
    data.collection('be_treatments').get(),
  ]);
  const sales = salesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const treatments = treatmentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`  be_sales total: ${sales.length}`);
  console.log(`  be_treatments total: ${treatments.length}\n`);

  // Cross-reference each flagged productId
  for (const pid of FLAGGED_PRODUCT_IDS) {
    const name = PRODUCT_NAMES[pid];
    console.log(`──────────────────────────────────────────────────────────────────`);
    console.log(`Product: ${pid}`);
    console.log(`Name:    "${name}"`);

    // Find in sales
    const saleHits = [];
    for (const s of sales) {
      const hits = deepFindProductId(s, pid);
      if (hits.length > 0) {
        saleHits.push({ id: s.id, paths: hits, createdAt: s.createdAt, customerName: s.customerName });
      }
    }
    // Find in treatments
    const treatHits = [];
    for (const t of treatments) {
      const hits = deepFindProductId(t, pid);
      if (hits.length > 0) {
        treatHits.push({ id: t.id, paths: hits, createdAt: t.createdAt, customerName: t.customerName });
      }
    }

    console.log(`  be_sales references: ${saleHits.length}`);
    if (saleHits.length > 0) {
      for (const h of saleHits.slice(0, 5)) {
        console.log(`    - sale ${h.id} | ${h.customerName || '(no name)'} | ${(h.createdAt || '').slice(0, 19)}`);
        for (const p of h.paths.slice(0, 3)) console.log(`        ${p}`);
      }
      if (saleHits.length > 5) console.log(`    ... and ${saleHits.length - 5} more`);
    }
    console.log(`  be_treatments references: ${treatHits.length}`);
    if (treatHits.length > 0) {
      for (const h of treatHits.slice(0, 5)) {
        console.log(`    - treatment ${h.id} | ${h.customerName || '(no name)'} | ${(h.createdAt || '').slice(0, 19)}`);
        for (const p of h.paths.slice(0, 3)) console.log(`        ${p}`);
      }
      if (treatHits.length > 5) console.log(`    ... and ${treatHits.length - 5} more`);
    }
    console.log();
  }

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  CONCLUSION');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`  If ALL flagged products have ZERO references in sales/treatments`);
  console.log(`  → Hypothesis (a) confirmed: flag set but never exercised yet.`);
  console.log(`     The "ไม่ตัดสต็อค" toggle SAVES correctly; runtime decision`);
  console.log(`     unverified-in-prod simply because admin never used these`);
  console.log(`     products in a real treatment/sale after flipping the flag.`);
  console.log();
  console.log(`  If ANY flagged product HAS references but no product-skip movement`);
  console.log(`  → Hypothesis (c) — runtime bug. Investigate _deductOneItem branch 2.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch(e => {
    console.error('[diag] ERROR:', e);
    process.exit(1);
  });
}
