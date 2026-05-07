#!/usr/bin/env node
// V46 — Phase 1 trace — find WHERE productName=courseName injects into movement
// Reads the user's reported treatment + linked sale + movements + customer

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

function init() {
  if (getApps().length > 0) return getFirestore();
  const env = loadEnvLocal();
  initializeApp({ credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n'),
  }) });
  return getFirestore();
}

async function main() {
  const db = init();
  const data = db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
  const TREATMENT_IDS = ['BT-1778169734111', 'BT-1778168857186'];

  for (const tid of TREATMENT_IDS) {
    console.log(`\n═══ Treatment: ${tid} ═══`);
    const tDoc = await data.collection('be_treatments').doc(tid).get();
    if (!tDoc.exists) { console.log('  NOT FOUND'); continue; }
    const t = tDoc.data();
    console.log(`  customerId: ${t.customerId}`);
    console.log(`  branchId: ${t.branchId}`);
    console.log(`  linkedSaleId: ${t.linkedSaleId || '-'}`);
    const detail = t.detail || {};
    console.log(`  detail.treatmentItems (${(detail.treatmentItems || []).length}):`);
    for (const it of (detail.treatmentItems || [])) {
      console.log(`    - id=${it.id}  productId=${it.productId || '-'}  name="${it.name || it.productName}"  qty=${it.qty}  skip=${!!it.skipStockDeduction}`);
    }
    console.log(`  detail.consumables (${(detail.consumables || []).length}):`);
    for (const it of (detail.consumables || [])) {
      console.log(`    - name="${it.name || it.productName}"  qty=${it.qty}`);
    }
    if (t.linkedSaleId) {
      const sDoc = await data.collection('be_sales').doc(t.linkedSaleId).get();
      if (sDoc.exists) {
        const s = sDoc.data();
        const items = s.items || {};
        console.log(`  → SALE: ${t.linkedSaleId}`);
        for (const k of ['products', 'medications', 'consumables', 'treatmentItems', 'courses', 'promotions']) {
          const arr = items[k] || [];
          if (!arr.length) continue;
          console.log(`    sale.items.${k} (${arr.length}):`);
          for (const it of arr) {
            console.log(`      - id=${it.id || '-'}  productId=${it.productId || '-'}  name="${it.name || it.productName || it.courseName || '-'}"  itemType=${it.itemType || '-'}`);
          }
        }
      }
    }
    // Movements for this treatment
    const mvSnap = await data.collection('be_stock_movements')
      .where('linkedTreatmentId', '==', tid).get();
    console.log(`  → MOVEMENTS (${mvSnap.size}):`);
    for (const m of mvSnap.docs) {
      const d = m.data();
      console.log(`    - mov=${d.movementId}  type=${d.type}  productId=${d.productId || '-'}  productName="${d.productName}"  qty=${d.qty}  before=${d.before ?? '-'}  after=${d.after ?? '-'}  reason=${d.reason || (d.note?.slice(0, 30)) || '-'}`);
    }
    // Sale-linked movements
    if (t.linkedSaleId) {
      const mvSale = await data.collection('be_stock_movements')
        .where('linkedSaleId', '==', t.linkedSaleId).get();
      console.log(`  → SALE-LINKED MOVEMENTS (${mvSale.size}):`);
      for (const m of mvSale.docs) {
        const d = m.data();
        console.log(`    - mov=${d.movementId}  type=${d.type}  productId=${d.productId || '-'}  productName="${d.productName}"  qty=${d.qty}  before=${d.before ?? '-'}  after=${d.after ?? '-'}  reason=${d.reason || (d.note?.slice(0, 30)) || '-'}`);
      }
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error('FATAL:', err); process.exit(1); });
}
