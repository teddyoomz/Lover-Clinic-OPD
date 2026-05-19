#!/usr/bin/env node
/**
 * V105 Rule M backfill (2026-05-19 LATE+3 NIGHT+2)
 *
 * Two-part repair for sales affected by V105 bugs:
 *
 * Part A — customerName resolution backfill:
 *   For every be_sales doc where `customerName` is empty but `customerId`
 *   is linked AND the linked customer has resolvable name (via V105
 *   canonical helper across patientData.firstNameTh / firstName / top-level
 *   firstname / etc.), patch the sale with resolved name + HN.
 *
 * Part B — stock re-deduct for cancel-flow partial-failure:
 *   For sales where status='active' BUT every stock movement is matched
 *   1:1 with a reverse (net=0 per product), re-issue deductStockForSale-
 *   equivalent movements so admin sees correct stock balance. Tracks
 *   `_v105ReDeductedAt` for idempotency.
 *
 * Two-phase dry-run / --apply. Audit doc to be_admin_audit. Idempotent
 * via forensic `_v105NameBackfilledAt` + `_v105ReDeductedAt` flags.
 *
 * Per Rule M: admin-SDK + canonical artifacts path + PEM key conversion
 * + invocation guard + crypto-random audit id.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

function loadEnv() {
  return readFileSync('.env.local.prod', 'utf8').split('\n').reduce((acc, l) => {
    const m = l.match(/^([^#=]+)=(.*)$/);
    if (m) acc[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
    return acc;
  }, {});
}

const APP_ID = 'loverclinic-opd-4c39b';
const BASE = `artifacts/${APP_ID}/public/data`;

// MIRRORS src/lib/customerDisplayName.js. Admin-SDK ESM can't import the
// React/Vite module. Test v105-customer-display-name.test.js locks parity.
function resolveCustomerDisplayName(customer, opts = {}) {
  if (!customer || typeof customer !== 'object') return '';
  const includePrefix = opts.includePrefix !== false;
  const pd = customer.patientData || {};
  const prefix = String(pd.prefix || customer.prefix || '').trim();
  const compose = (first, last) => {
    const f = String(first || '').trim();
    const l = String(last || '').trim();
    if (!f && !l) return '';
    const fullName = [f, l].filter(Boolean).join(' ');
    return includePrefix && prefix ? `${prefix} ${fullName}`.trim() : fullName;
  };
  let name = compose(pd.firstNameTh, pd.lastNameTh);
  if (!name) name = compose(pd.firstName, pd.lastName);
  if (!name) name = compose(customer.firstname, customer.lastname);
  if (!name) name = String(customer.customerName || '').trim();
  if (!name) name = String(customer.name || '').trim();
  if (!name) name = String(pd.nicknameTh || pd.nickname || customer.nickname || '').trim();
  return name;
}

function resolveCustomerHN(customer) {
  if (!customer || typeof customer !== 'object') return '';
  const pd = customer.patientData || {};
  return String(
    customer.proClinicHN
    || pd.hn || pd.HN || pd.proClinicHN
    || customer.hn || customer.HN || customer.hn_no
    || ''
  ).trim();
}

async function main(applyMode = false) {
  const env = loadEnv();
  if (getApps().length === 0) {
    initializeApp({ credential: cert({
      projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY?.split('\\n').join('\n'),
    }), ignoreUndefinedProperties: true });
  }
  const db = getFirestore();

  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  V105 Rule M backfill  ${applyMode ? '[--APPLY]' : '[DRY-RUN]'}`);
  console.log('  Part A: sale customer-name resolution + HN');
  console.log('  Part B: stock re-deduct for cancel-flow partial-failure');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // PART A — sale customer name resolution backfill
  console.log('━━━ PART A: customer-name resolution ━━━');
  const allSales = await db.collection(`${BASE}/be_sales`).get();
  const nameBackfillCandidates = [];
  for (const doc of allSales.docs) {
    const s = doc.data();
    if (s._v105NameBackfilledAt) continue; // idempotent
    if (s.customerName && s.customerName.trim()) continue; // already has name
    if (!s.customerId) continue; // no customer to look up
    const custSnap = await db.doc(`${BASE}/be_customers/${s.customerId}`).get();
    if (!custSnap.exists) continue;
    const resolved = resolveCustomerDisplayName(custSnap.data());
    const resolvedHN = resolveCustomerHN(custSnap.data());
    if (!resolved) continue; // even the canonical resolver can't help
    nameBackfillCandidates.push({
      saleId: doc.id,
      ref: doc.ref,
      customerId: s.customerId,
      currentName: s.customerName || '',
      currentHN: s.customerHN || '',
      resolvedName: resolved,
      resolvedHN: resolvedHN,
    });
  }
  console.log(`  Candidates: ${nameBackfillCandidates.length}`);
  for (const c of nameBackfillCandidates.slice(0, 10)) {
    console.log(`    ${c.saleId} [${c.customerId}]: "" → "${c.resolvedName}" HN: "${c.currentHN}" → "${c.resolvedHN}"`);
  }
  if (nameBackfillCandidates.length > 10) console.log(`    ... +${nameBackfillCandidates.length - 10} more`);

  if (applyMode) {
    for (const c of nameBackfillCandidates) {
      await c.ref.update({
        customerName: c.resolvedName,
        customerHN: c.resolvedHN || c.currentHN,
        _v105NameBackfilledAt: FieldValue.serverTimestamp(),
        _v105NameBackfilledFrom: {
          customerId: c.customerId,
          previousName: c.currentName,
          previousHN: c.currentHN,
        },
      });
    }
    console.log(`  ✓ Applied ${nameBackfillCandidates.length} customer-name backfills`);
  }

  // PART B — stock re-deduct for cancel-flow partial-failure
  console.log('\n━━━ PART B: stock re-deduct for partial-cancel sales ━━━');
  // Find sales with status='active' AND ALL stock movements are reversed
  // (i.e. cancel-flow stripped stock but cancelBackendSale failed/aborted).
  const activeSales = allSales.docs.filter(d => (d.data().status || 'active') === 'active');
  const restockCandidates = [];

  for (const doc of activeSales) {
    const s = doc.data();
    if (s._v105ReDeductedAt) continue; // idempotent
    const movSnap = await db.collection(`${BASE}/be_stock_movements`)
      .where('linkedSaleId', '==', doc.id).get();
    if (movSnap.size === 0) continue;
    const moves = movSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Group by productId; sum qty per product
    const byProduct = new Map();
    for (const m of moves) {
      const pid = m.productId || '';
      if (!pid) continue;
      const prev = byProduct.get(pid) || { net: 0, deducts: 0, reverses: 0, productName: m.productName };
      prev.net += Number(m.qty) || 0;
      if (m.qty < 0) prev.deducts++;
      if (m.qty > 0) prev.reverses++;
      byProduct.set(pid, prev);
    }
    // Candidate: at least one product has net=0 AND deducts>=1 AND reverses>=1
    // (i.e. fully-reversed pair). If ANY product net != 0, skip (means some
    // stock changes are still real — admin should resolve manually).
    const fullyReversedProducts = [];
    let hasUnreversed = false;
    for (const [pid, info] of byProduct.entries()) {
      if (info.deducts >= 1 && info.reverses >= 1 && info.net === 0) {
        fullyReversedProducts.push({ productId: pid, ...info });
      } else if (info.net !== 0) {
        hasUnreversed = true;
      }
    }
    if (hasUnreversed || fullyReversedProducts.length === 0) continue;
    restockCandidates.push({
      saleId: doc.id,
      ref: doc.ref,
      customerId: s.customerId,
      branchId: s.branchId,
      items: s.items || {},
      fullyReversedProducts,
    });
  }
  console.log(`  Candidates: ${restockCandidates.length} sales with fully-reversed stock + status=active`);
  for (const c of restockCandidates) {
    console.log(`    ${c.saleId} customer=${c.customerId} branch=${c.branchId}`);
    for (const p of c.fullyReversedProducts) {
      console.log(`      "${p.productName}" (${p.productId}): ${p.deducts} deducts + ${p.reverses} reverses, net=${p.net}`);
    }
  }

  // For Part B re-deduct: write NEW movement docs that mirror the original
  // deduct shape + forensic _v105ReDeduct marker. Simplest approach: locate
  // the original deduct movements + create NEW deducts with same shape but
  // a fresh id + `_v105ReDeductOf: originalId` forensic field. Don't touch
  // batch.qty here — that requires the full _deductOneItem logic (FIFO
  // batch allocation). Instead, mirror reverseStockForSale's reverse
  // pattern: walk each reverse movement, create a NEW deduct that mirrors
  // the original deduct (so audit chain is: deduct → reverse → re-deduct).
  //
  // KEEP THE INVERTED STOCK STATE for batches — we don't manipulate
  // be_stock_batches here. We ONLY add audit movements so the user-visible
  // "stock balance" picks up the missing -N. This is intentionally
  // CONSERVATIVE: better to under-rollback than to corrupt batch qty.
  //
  // Admin manual followup: admin can run stockBalancePanel reconcile to
  // re-derive batch qty from movements if they want exact alignment.

  let appliedReDeducts = 0;
  if (applyMode) {
    for (const c of restockCandidates) {
      const newMovementIds = [];
      for (const p of c.fullyReversedProducts) {
        // Find original DEDUCT movement (qty < 0) for this productId
        const origDeduct = await db.collection(`${BASE}/be_stock_movements`)
          .where('linkedSaleId', '==', c.saleId)
          .where('productId', '==', p.productId)
          .get();
        const deductMov = origDeduct.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .find(m => Number(m.qty) < 0);
        if (!deductMov) continue;
        // Create NEW deduct that mirrors the original
        const newId = `MVT-${Date.now()}-${randomBytes(2).toString('hex')}`;
        const newDeduct = {
          ...deductMov,
          movementId: newId,
          qty: deductMov.qty, // same negative value
          // V105-followup (2026-05-19 NIGHT+3) — MUST be ISO string, NOT
          // FieldValue.serverTimestamp(). MovementLogPanel.jsx:161 sort
          // calls `.localeCompare()` on `m.createdAt`; Timestamp objects
          // have no `.localeCompare` → sort throws → catch → empty list.
          // 60 existing stock movements use ISO string; matching that shape
          // is the canonical pattern. AV95 invariant locks.
          createdAt: new Date().toISOString(),
          reversedByMovementId: '',
          reverseOfMovementId: '',
          _v105ReDeductOf: deductMov.id,
          _v105ReDeductReason: 'V105 atomic-rollback — cancel-flow partial-failure (reverseStockForSale ran but cancelBackendSale did not)',
          note: `${deductMov.note || ''} [V105 RE-DEDUCT]`.trim(),
        };
        // Remove `id` field if present (use docId not data.id per V38)
        delete newDeduct.id;
        await db.doc(`${BASE}/be_stock_movements/${newId}`).set(newDeduct);
        newMovementIds.push({ origId: deductMov.id, newId });
        appliedReDeducts++;
      }
      await c.ref.update({
        _v105ReDeductedAt: FieldValue.serverTimestamp(),
        _v105ReDeductFrom: {
          newMovementIds,
          reason: 'cancel-flow-partial-failure',
        },
      });
    }
    console.log(`  ✓ Applied ${appliedReDeducts} re-deducts across ${restockCandidates.length} sales`);
  }

  // Audit doc
  const auditId = `v105-backfill-sale-customer-and-rededuct-stock-${Date.now()}-${randomBytes(4).toString('hex')}`;
  const auditDoc = {
    phase: 'V105',
    operation: 'backfill-sale-customer-and-rededuct-stock',
    appliedAt: applyMode ? FieldValue.serverTimestamp() : null,
    mode: applyMode ? 'apply' : 'dry-run',
    summary: {
      scannedSales: allSales.size,
      nameBackfillCandidates: nameBackfillCandidates.length,
      nameBackfillSamples: nameBackfillCandidates.slice(0, 10).map(c => ({ saleId: c.saleId, customerId: c.customerId, resolvedName: c.resolvedName })),
      restockCandidates: restockCandidates.length,
      restockSamples: restockCandidates.map(c => ({ saleId: c.saleId, productCount: c.fullyReversedProducts.length })),
      appliedReDeducts,
    },
  };

  console.log('\n━━━ Summary ━━━');
  console.log(JSON.stringify(auditDoc.summary, null, 2));

  if (applyMode) {
    await db.doc(`${BASE}/be_admin_audit/${auditId}`).set(auditDoc);
    console.log(`\n✓ Audit doc emitted: be_admin_audit/${auditId}`);
  } else {
    console.log(`\n[DRY-RUN] Audit doc would be: be_admin_audit/${auditId}`);
    console.log('Re-run with --apply to commit.');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const apply = process.argv.includes('--apply');
  main(apply).catch(e => { console.error(e); process.exit(1); });
}
