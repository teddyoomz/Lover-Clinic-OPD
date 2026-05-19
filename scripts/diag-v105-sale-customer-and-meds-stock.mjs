#!/usr/bin/env node
/**
 * V105 diag — investigate INV-20260519-0008 + BT-1779195907349:
 *   A. sale row shows "-" for customer name (should be LC-26000079)
 *   B. 7 medication/consumable items in treatment had ZERO stock movements
 *
 * Read-only Rule R. No mutations.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const env = readFileSync('.env.local.prod', 'utf8').split('\n').reduce((acc, l) => {
  const m = l.match(/^([^#=]+)=(.*)$/);
  if (m) acc[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
  return acc;
}, {});
if (getApps().length === 0) {
  initializeApp({ credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b',
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY?.split('\\n').join('\n'),
  }), ignoreUndefinedProperties: true });
}
const db = getFirestore();
const BASE = 'artifacts/loverclinic-opd-4c39b/public/data';

const SALE_ID = 'INV-20260519-0008';
const TREATMENT_ID = 'BT-1779195907349';
const CUSTOMER_ID = 'LC-26000079';

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  V105 diag — sale + treatment + customer + stock movements`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  // 1. Sale doc
  const saleSnap = await db.doc(`${BASE}/be_sales/${SALE_ID}`).get();
  if (!saleSnap.exists) {
    console.log(`✗ Sale ${SALE_ID} NOT FOUND`);
    return;
  }
  const sale = saleSnap.data();
  console.log(`━━━ SALE ${SALE_ID} ━━━`);
  console.log(`  customerId: "${sale.customerId || ''}"`);
  console.log(`  customerName: "${sale.customerName || ''}"`);
  console.log(`  customerHN: "${sale.customerHN || ''}"`);
  console.log(`  branchId: "${sale.branchId || ''}"`);
  console.log(`  hasSale: ${sale.hasSale || sale?.detail?.hasSale}`);
  console.log(`  linkedTreatmentId: "${sale.linkedTreatmentId || sale?.detail?.linkedTreatmentId || ''}"`);
  console.log(`  source: "${sale.source || sale?.detail?.source || ''}"`);
  const det = sale.detail || sale;
  console.log(`  detail.customerName: "${det.customerName || ''}"`);
  const items = det.items || {};
  console.log(`\n  detail.items shape: ${typeof items} keys=${Object.keys(items).join(',')}`);
  console.log(`  detail.items.courses (${(items.courses || []).length}):`);
  for (const c of (items.courses || [])) {
    console.log(`    "${c.name || c.itemName || ''}" qty=${c.qty} unitPrice=${c.unitPrice}`);
  }
  console.log(`  detail.items.products (${(items.products || []).length}):`);
  for (const p of (items.products || [])) {
    console.log(`    "${p.name}" qty=${p.qty} unitPrice=${p.unitPrice} productId=${p.productId || ''}`);
  }
  console.log(`  detail.items.medications (${(items.medications || []).length}):`);
  for (const m of (items.medications || [])) {
    console.log(`    "${m.name}" qty=${m.qty} unitPrice=${m.unitPrice} productId=${m.productId || ''}`);
  }
  console.log(`  detail.items.promotions (${(items.promotions || []).length})`);

  // 2. Treatment doc
  const tSnap = await db.doc(`${BASE}/be_treatments/${TREATMENT_ID}`).get();
  if (!tSnap.exists) {
    console.log(`\n✗ Treatment ${TREATMENT_ID} NOT FOUND`);
    return;
  }
  const t = tSnap.data();
  const td = t.detail || {};
  console.log(`\n━━━ TREATMENT ${TREATMENT_ID} ━━━`);
  console.log(`  customerId: "${t.customerId}"  customerName: "${t.customerName || td.customerName || ''}"`);
  console.log(`  branchId: "${t.branchId || td.branchId}"`);
  console.log(`  hasSale: ${td.hasSale}  linkedSaleId: "${t.linkedSaleId || td.linkedSaleId || ''}"`);
  console.log(`  detail.medications (${(td.medications || []).length}):`);
  for (const m of (td.medications || [])) {
    console.log(`    "${m.name}" qty=${m.qty} unit="${m.unit || ''}" productId="${m.productId || ''}" skipStockDeduction=${!!m.skipStockDeduction}`);
  }
  console.log(`  detail.consumables (${(td.consumables || []).length}):`);
  for (const c of (td.consumables || [])) {
    console.log(`    "${c.name}" qty=${c.qty} unit="${c.unit || ''}" productId="${c.productId || ''}" skipStockDeduction=${!!c.skipStockDeduction}`);
  }
  console.log(`  detail.treatmentItems (${(td.treatmentItems || []).length})`);

  // 3. Customer doc
  const cSnap = await db.doc(`${BASE}/be_customers/${CUSTOMER_ID}`).get();
  if (!cSnap.exists) {
    console.log(`\n✗ Customer ${CUSTOMER_ID} NOT FOUND`);
  } else {
    const c = cSnap.data();
    const pd = c.patientData || {};
    console.log(`\n━━━ CUSTOMER ${CUSTOMER_ID} ━━━`);
    console.log(`  firstname: "${pd.firstname || ''}"  lastname: "${pd.lastname || ''}"`);
    console.log(`  firstNameTh: "${pd.firstNameTh || ''}"  lastNameTh: "${pd.lastNameTh || ''}"`);
    console.log(`  HN: "${pd.hn || pd.HN || pd.proClinicHN || ''}"`);
    console.log(`  Has courses: ${(c.courses || []).length}`);
  }

  // 4. Stock movements for this treatment + sale
  const movByTx = await db.collection(`${BASE}/be_stock_movements`)
    .where('linkedTreatmentId', '==', TREATMENT_ID).get();
  console.log(`\n━━━ STOCK MOVEMENTS (linkedTreatmentId=${TREATMENT_ID}): ${movByTx.size} ━━━`);
  for (const doc of movByTx.docs) {
    const m = doc.data();
    console.log(`  ${doc.id}: type=${m.type} productId="${m.productId}" productName="${m.productName}" qty=${m.qty} branchId="${m.branchId}"`);
  }

  const movBySale = await db.collection(`${BASE}/be_stock_movements`)
    .where('linkedSaleId', '==', SALE_ID).get();
  console.log(`\n━━━ STOCK MOVEMENTS (linkedSaleId=${SALE_ID}): ${movBySale.size} ━━━`);
  for (const doc of movBySale.docs) {
    const m = doc.data();
    console.log(`  ${doc.id}: type=${m.type} productId="${m.productId}" productName="${m.productName}" qty=${m.qty} branchId="${m.branchId}"`);
  }

  // 5. Check stockConfig for the medications + consumables
  console.log(`\n━━━ stockConfig for medication/consumable items ━━━`);
  const itemNames = ['Augmentin 1 gm', 'Paracetamol (500mg)', 'Ibuprofen', 'ชุดทำผล', 'ไม้พันสำลี', 'Betadine 15 ml', 'NSS ล้างแผล 100 ml'];
  for (const name of itemNames) {
    const q = await db.collection(`${BASE}/be_products`).where('productName', '==', name).limit(3).get();
    if (q.empty) {
      console.log(`  "${name}": NOT FOUND in be_products`);
      continue;
    }
    for (const doc of q.docs) {
      const p = doc.data();
      console.log(`  "${p.productName}" id=${doc.id}: trackStock=${p.stockConfig?.trackStock} skipStockDeduction=${!!p.skipStockDeduction}`);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e); process.exit(1); });
}
