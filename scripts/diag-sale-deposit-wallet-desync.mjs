#!/usr/bin/env node
// SYSTEM-WIDE end-state verification: sale + deposit + wallet desync
// Per user directive 2026-05-19 LATE+2: "ใบเสร็จในหน้าใบขายก็ไม่ไปสร้าง ...
// ตัดมัดจำด้วยไหม ... wallet ... ดู data ที่อื่นด้วย ไม่ใช่เอาแต่ Flow".
//
// Audits 3 desync classes:
//   1. SALE  — treatment.hasSale === true OR purchasedItems > 0 BUT
//              no be_sales doc with linkedTreatmentId matches
//   2. SALE BRANCHID — be_sales doc exists but branchId missing or
//                       does NOT match treatment.branchId (per-branch
//                       sales page would hide it)
//   3. DEPOSIT — sale.billing.depositIds[] declared but the matching
//                be_deposits docs do NOT have appliedToSale[] entries
//                that decrement the deposit
//   4. WALLET — sale.billing.walletApplied > 0 but customer wallet
//                balance NOT decremented (wallet ledger missing entry)
//
// READ-ONLY (Rule R). Pull env + admin SDK.

import { readFileSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function loadEnv() {
  return readFileSync('.env.local.prod', 'utf8').split('\n').reduce((acc, l) => {
    const m = l.match(/^([^#=]+)=(.*)$/);
    if (m) acc[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
    return acc;
  }, {});
}
const env = loadEnv();
const APP_ID = 'loverclinic-opd-4c39b';
const BASE = `artifacts/${APP_ID}/public/data`;
if (getApps().length === 0) {
  initializeApp({ credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY?.split('\\n').join('\n'),
  }), ignoreUndefinedProperties: true });
}
const db = getFirestore();

const ts = (v) => {
  if (!v) return '(none)';
  if (typeof v === 'string') return v;
  if (v._seconds) return new Date(v._seconds * 1000).toISOString();
  if (v.toDate) return v.toDate().toISOString();
  return '?';
};

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  SALE + DEPOSIT + WALLET end-state desync audit (Rule R)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const [tSnap, sSnap, dSnap, walletSnap] = await Promise.all([
    db.collection(`${BASE}/be_treatments`).get(),
    db.collection(`${BASE}/be_sales`).get(),
    db.collection(`${BASE}/be_deposits`).get(),
    db.collection(`${BASE}/be_wallet_transactions`).get().catch(() => ({ docs: [] })),
  ]);
  const treatments = tSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const sales = sSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const deposits = dSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const walletTxns = walletSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  console.log(`Loaded: ${treatments.length} treatments  ${sales.length} sales  ${deposits.length} deposits  ${walletTxns.length} wallet txns\n`);

  // Customer wallet types may be a customer subcollection — let's also check
  // be_customers/{id}/wallets if present (V98 wiring)
  // For now, walletTxns covers the ledger; we'll join later.

  // ──────────────────────────────────────────────────────────────────
  // CLASS 1+2: SALE creation + branchId stamping
  // ──────────────────────────────────────────────────────────────────
  console.log('━━━ Class 1: SALE creation desync ━━━');
  let saleMissing = 0;
  let saleBranchIdMissing = 0;
  let saleBranchIdMismatch = 0;
  const saleSamples = [];
  for (const t of treatments) {
    const d = t.detail || {};
    const expectsSale = d.hasSale === true || (Array.isArray(d.purchasedItems) && d.purchasedItems.length > 0);
    if (!expectsSale) continue;
    const linkedSaleId = t.linkedSaleId || d.linkedSaleId || '';
    if (!linkedSaleId) {
      saleMissing++;
      if (saleSamples.length < 10) {
        saleSamples.push({ kind: 'no-linkedSaleId', treatmentId: t.treatmentId || t.id, customerId: t.customerId, createdAt: ts(t.createdAt), hasSale: d.hasSale, purchasedItemsCount: (d.purchasedItems || []).length });
      }
      continue;
    }
    const sale = sales.find(s => (s.saleId || s.id) === linkedSaleId);
    if (!sale) {
      saleMissing++;
      if (saleSamples.length < 10) {
        saleSamples.push({ kind: 'sale-doc-missing', treatmentId: t.treatmentId || t.id, customerId: t.customerId, linkedSaleId, createdAt: ts(t.createdAt) });
      }
      continue;
    }
    // Branch ID checks
    const saleBranch = sale.branchId || sale.detail?.branchId || '';
    const treatBranch = t.branchId || d.branchId || '';
    if (!saleBranch) {
      saleBranchIdMissing++;
      if (saleSamples.length < 15) {
        saleSamples.push({ kind: 'sale-branchId-missing', treatmentId: t.treatmentId || t.id, linkedSaleId, treatmentBranchId: treatBranch });
      }
    } else if (treatBranch && saleBranch !== treatBranch) {
      saleBranchIdMismatch++;
      if (saleSamples.length < 15) {
        saleSamples.push({ kind: 'sale-branchId-mismatch', treatmentId: t.treatmentId || t.id, linkedSaleId, treatmentBranchId: treatBranch, saleBranchId: saleBranch });
      }
    }
  }
  console.log(`  expectedSale missing OR doc not found:           ${saleMissing}`);
  console.log(`  sale.branchId missing:                           ${saleBranchIdMissing}`);
  console.log(`  sale.branchId mismatches treatment.branchId:     ${saleBranchIdMismatch}`);
  saleSamples.forEach((s, i) => console.log(`    [${i}] ${s.kind}:`, JSON.stringify(s)));
  console.log();

  // ──────────────────────────────────────────────────────────────────
  // CLASS 3: DEPOSIT usage desync
  // ──────────────────────────────────────────────────────────────────
  console.log('━━━ Class 3: DEPOSIT usage desync ━━━');
  // Build index of deposits by id
  const depositById = new Map();
  for (const d of deposits) {
    depositById.set(d.depositId || d.id, d);
  }
  let depositDeclaredButNotApplied = 0;
  let depositOverApplied = 0;
  const depositSamples = [];
  for (const sale of sales) {
    const depIds = Array.isArray(sale.billing?.depositIds) ? sale.billing.depositIds : [];
    if (depIds.length === 0) continue;
    for (const dRef of depIds) {
      const dep = depositById.get(dRef.depositId);
      if (!dep) {
        depositDeclaredButNotApplied++;
        if (depositSamples.length < 10) depositSamples.push({ kind: 'deposit-doc-missing', saleId: sale.saleId || sale.id, depositId: dRef.depositId, declaredAmount: dRef.amount });
        continue;
      }
      const applied = Array.isArray(dep.appliedToSale) ? dep.appliedToSale : [];
      const matchingApplied = applied.find(a => (a.saleId || a.linkedSaleId) === (sale.saleId || sale.id));
      if (!matchingApplied) {
        depositDeclaredButNotApplied++;
        if (depositSamples.length < 10) depositSamples.push({ kind: 'deposit-not-debited', saleId: sale.saleId || sale.id, depositId: dRef.depositId, declaredAmount: dRef.amount, appliedCount: applied.length });
      } else if (Number(matchingApplied.amount) !== Number(dRef.amount)) {
        depositOverApplied++;
        if (depositSamples.length < 10) depositSamples.push({ kind: 'deposit-amount-mismatch', saleId: sale.saleId || sale.id, depositId: dRef.depositId, saleDeclaredAmount: dRef.amount, depositAppliedAmount: matchingApplied.amount });
      }
    }
  }
  console.log(`  sale declared deposit but be_deposits NOT debited: ${depositDeclaredButNotApplied}`);
  console.log(`  deposit applied amount mismatch:                   ${depositOverApplied}`);
  depositSamples.forEach((s, i) => console.log(`    [${i}] ${s.kind}:`, JSON.stringify(s)));
  console.log();

  // ──────────────────────────────────────────────────────────────────
  // CLASS 4: WALLET usage desync
  // ──────────────────────────────────────────────────────────────────
  console.log('━━━ Class 4: WALLET usage desync ━━━');
  let walletDeclaredButNoTxn = 0;
  const walletSamples = [];
  for (const sale of sales) {
    const walletApplied = Number(sale.billing?.walletApplied || 0);
    if (walletApplied <= 0) continue;
    const walletTypeId = sale.billing?.walletTypeId || '';
    const customerId = sale.customerId;
    if (!customerId) continue;
    // Search wallet transactions for matching debit
    const debit = walletTxns.find(w =>
      (w.customerId === customerId)
      && (w.referenceType === 'sale' || w.referenceType === 'wallet-deduct')
      && (w.referenceId === (sale.saleId || sale.id) || w.note?.includes(sale.saleId || sale.id))
    );
    if (!debit) {
      walletDeclaredButNoTxn++;
      if (walletSamples.length < 10) walletSamples.push({ kind: 'wallet-no-txn', saleId: sale.saleId || sale.id, customerId, walletTypeId, declaredAmount: walletApplied });
    }
  }
  console.log(`  sale declared walletApplied>0 but no be_wallet_transactions debit: ${walletDeclaredButNoTxn}`);
  walletSamples.forEach((s, i) => console.log(`    [${i}] ${s.kind}:`, JSON.stringify(s)));
  console.log();

  // ──────────────────────────────────────────────────────────────────
  // EXTRA: List per-treatment sale linkage for วันเพ็ญ (LC-26000078)
  // ──────────────────────────────────────────────────────────────────
  console.log('━━━ Wanphen (LC-26000078) per-treatment sale audit ━━━');
  const wanphenTreatments = treatments.filter(t => t.customerId === 'LC-26000078').sort((a, b) => (a.createdAt?._seconds || 0) - (b.createdAt?._seconds || 0));
  for (const t of wanphenTreatments) {
    const d = t.detail || {};
    const linkedSaleId = t.linkedSaleId || d.linkedSaleId || '';
    const sale = sales.find(s => (s.saleId || s.id) === linkedSaleId);
    const purchasedCount = (d.purchasedItems || []).length;
    console.log(`  ${t.treatmentId || t.id} createdAt=${ts(t.createdAt)} hasSale=${d.hasSale} purchases=${purchasedCount} linkedSaleId=${linkedSaleId || '(none)'}`);
    if (sale) {
      console.log(`    sale doc: branchId=${sale.branchId || '(none)'} saleDate=${sale.saleDate} netTotal=${sale.billing?.netTotal} items: products=${(sale.items?.products || []).length} courses=${(sale.items?.courses || []).length} promotions=${(sale.items?.promotions || []).length}`);
      console.log(`    billing: depositIds=${JSON.stringify(sale.billing?.depositIds || [])} walletApplied=${sale.billing?.walletApplied || 0}`);
    } else if (linkedSaleId) {
      console.log(`    ⚠ linkedSaleId="${linkedSaleId}" but be_sales doc NOT FOUND`);
    }
  }
  console.log();

  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  SUMMARY: sale-missing=${saleMissing}  sale-branchId-missing=${saleBranchIdMissing}  sale-branchId-mismatch=${saleBranchIdMismatch}  deposit-desync=${depositDeclaredButNotApplied}  wallet-desync=${walletDeclaredButNoTxn}`);
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(e => { console.error(e); process.exit(1); });
