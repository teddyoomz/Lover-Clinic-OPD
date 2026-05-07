// ─── V46 — Rule O: live-resolve productName at movement-write time ────────
//
// User report (post V45 deploy, 4th-round skip-stock-deduction class):
//   "ทำไมมึงมาตัดแบบนี้ไอ้สัส มึงเอาชื่อคอร์สมาตัดสต็อคอีกแล้ว ... กูเคย
//    อธิบายไปแล้วว่าเอาชื่อมาตัดไม่ได้"
//
// Diag (scripts/v46-diag-treatment-trace.mjs) on user's treatment
// BT-1778169734111 found:
//   detail.treatmentItems[1] = { productId: 38699, name: "Stapple no 22" }   ✓
//   stock_movement[1] = { productId: 38699, productName: "ขลิบไร้เลือด (เบอร์22) 1 ครั้ง" }  ← BUG
//
// Root cause (Phase 4.5 architecture review): _deductOneItem read
// `productName: b.productName` from BATCH's denormalized cache. The
// AUTO-NEG batch at productId=38699 was POISONED during a V44-era buggy
// buy that stamped batch.productName = course-name. New deducts inherit
// the poisoned name despite item.productName being correct.
//
// Iron-clad Rule O (V46 lock): productId is the ONLY identity for stock;
// productName on stock_movement records MUST be live-resolved from
// be_products[productId] at write time. batch.productName is denormalized
// display cache only.
//
// V46 fix surfaces:
//  1. NEW _resolveProductNameLive(productId) helper — reads be_products
//     live, caches per-call to avoid N+1 reads in batch loops
//  2. Positive FIFO movement emit (line ~6889): productName from live
//     read, NOT b.productName
//  3. Negative-overage movement emit (line ~6952): same
//  4. AUTO-NEG batch CREATION (line ~6826): productName from live read
//     (prevents batch poisoning at source)
//
// Companion: scripts/v46-backfill-stock-batch-product-name.mjs migration
// to backfill existing poisoned batches.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const backendSrc = read('src/lib/backendClient.js');

// ════════════════════════════════════════════════════════════════════════════
describe('V46.A — _resolveProductNameLive helper exists', () => {
  it('A.1 helper function defined', () => {
    expect(backendSrc).toMatch(/async function _resolveProductNameLive\(productId\)/);
  });

  it('A.2 reads be_products via doc()/getDoc() pattern (canonical)', () => {
    const fnStart = backendSrc.indexOf('async function _resolveProductNameLive(');
    const slice = backendSrc.slice(fnStart, fnStart + 1500);
    expect(slice).toMatch(/be_products/);
    expect(slice).toMatch(/getDoc\(/);
  });

  it('A.3 returns productName via canonical fields (productName||name)', () => {
    const fnStart = backendSrc.indexOf('async function _resolveProductNameLive(');
    const slice = backendSrc.slice(fnStart, fnStart + 1500);
    expect(slice).toMatch(/data\.productName \|\| data\.name/);
  });

  it('A.4 caches result per-call to avoid N+1 reads in batch loop', () => {
    expect(backendSrc).toMatch(/__productNameCache\s*=\s*new Map\(\)/);
    const fnStart = backendSrc.indexOf('async function _resolveProductNameLive(');
    const slice = backendSrc.slice(fnStart, fnStart + 1500);
    expect(slice).toMatch(/__productNameCache\.has\(/);
    expect(slice).toMatch(/__productNameCache\.set\(/);
  });

  it('A.5 returns empty string on missing/error (V14 — no undefined leaves)', () => {
    const fnStart = backendSrc.indexOf('async function _resolveProductNameLive(');
    const slice = backendSrc.slice(fnStart, fnStart + 1500);
    // Empty-string default is the failure mode (NEVER undefined, NEVER
    // course-name, NEVER batch.productName)
    expect(slice).toMatch(/return ''/);
  });

  it('A.6 V46 + Rule O markers present', () => {
    expect(backendSrc).toMatch(/V46.*Rule O|RULE O.*V46|IRON-CLAD RULE O/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('V46.B — Positive FIFO movement uses live-resolved productName', () => {
  it('B.1 _resolveProductNameLive called inside positive FIFO transaction', () => {
    const fnStart = backendSrc.indexOf('async function _deductOneItem(');
    const slice = backendSrc.slice(fnStart, fnStart + 25000);
    // Within the FIFO loop — live-resolve before tx.set
    expect(slice).toMatch(/_resolveProductNameLive\(b\.productId\)/);
  });

  it('B.2 movement productName field uses liveName as primary source (NOT b.productName)', () => {
    const fnStart = backendSrc.indexOf('async function _deductOneItem(');
    const slice = backendSrc.slice(fnStart, fnStart + 25000);
    // Pattern: productName: liveName || item.productName || b.productName || ''
    expect(slice).toMatch(/productName:\s*liveName\s*\|\|\s*item\.productName/);
  });

  it('B.3 BATCH-FROZEN-NAME anti-pattern is GONE in positive FIFO emit', () => {
    // Pre-V46 was: productName: b.productName (single-source from batch)
    // Post-V46 must be: productName: liveName || item.productName || b.productName || ''
    // The bare `productName: b.productName,` line MUST NOT appear in the
    // positive-FIFO movement emit block.
    const fnStart = backendSrc.indexOf('async function _deductOneItem(');
    const fnEnd = backendSrc.indexOf('\n}', fnStart + 30000) + 2;
    const fnBody = backendSrc.slice(fnStart, fnEnd);
    // Find positive FIFO block (within `for (const a of plan.allocations)`)
    const fifoStart = fnBody.indexOf('for (const a of plan.allocations)');
    const fifoEnd = fnBody.indexOf('// Phase 15.7 — negative-stock push', fifoStart);
    const fifoBlock = fnBody.slice(fifoStart, fifoEnd);
    expect(fifoBlock).not.toMatch(/productName:\s*b\.productName,\s*\n/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('V46.C — Negative-overage movement uses live-resolved productName', () => {
  it('C.1 _resolveProductNameLive called for negative-overage path (liveNameNeg variant)', () => {
    const fnStart = backendSrc.indexOf('async function _deductOneItem(');
    const slice = backendSrc.slice(fnStart, fnStart + 25000);
    expect(slice).toMatch(/_resolveProductNameLive\(b\.productId \|\| item\.productId\)/);
  });

  it('C.2 negative-overage productName uses liveNameNeg primary (NOT b.productName || item.productName direct)', () => {
    const fnStart = backendSrc.indexOf('async function _deductOneItem(');
    const slice = backendSrc.slice(fnStart, fnStart + 25000);
    expect(slice).toMatch(/productName:\s*liveNameNeg\s*\|\|\s*item\.productName/);
  });

  it('C.3 BATCH-FROZEN-NAME anti-pattern is GONE from negative-overage emit', () => {
    const fnStart = backendSrc.indexOf('async function _deductOneItem(');
    const slice = backendSrc.slice(fnStart, fnStart + 30000);
    // Find negative-overage block
    const negStart = slice.indexOf('Phase 15.7 — negative-stock push');
    const negEnd = slice.indexOf('} else if (plan.shortfall > 0', negStart);
    const negBlock = negEnd > 0 ? slice.slice(negStart, negEnd) : slice.slice(negStart);
    // Pre-V46 anti-pattern: productName: b.productName || item.productName
    expect(negBlock).not.toMatch(/productName:\s*b\.productName \|\| item\.productName,/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('V46.D — AUTO-NEG batch creation uses live-resolved productName', () => {
  it('D.1 liveProductName resolved before AUTO-NEG batch setDoc', () => {
    const fnStart = backendSrc.indexOf('async function _deductOneItem(');
    const slice = backendSrc.slice(fnStart, fnStart + 25000);
    // The const liveProductName = await _resolveProductNameLive(...) appears
    // before the AUTO-NEG batch literal
    const liveIdx = slice.indexOf('const liveProductName = await _resolveProductNameLive');
    const autoNegIdx = slice.indexOf("`AUTO-NEG-${Date.now()}`");
    expect(liveIdx).toBeGreaterThan(0);
    expect(autoNegIdx).toBeGreaterThan(liveIdx);
  });

  it('D.2 AUTO-NEG batch productName uses liveProductName fallback (prevents poisoning at source)', () => {
    const fnStart = backendSrc.indexOf('async function _deductOneItem(');
    const slice = backendSrc.slice(fnStart, fnStart + 25000);
    expect(slice).toMatch(/productName:\s*liveProductName\s*\|\|\s*item\.productName/);
  });

  it('D.3 PRE-V46 anti-pattern (raw item.productName as sole source) is GONE from AUTO-NEG creation', () => {
    const fnStart = backendSrc.indexOf('async function _deductOneItem(');
    const slice = backendSrc.slice(fnStart, fnStart + 25000);
    // Find AUTO-NEG block
    const autoNegStart = slice.indexOf("`AUTO-NEG-${Date.now()}`");
    const autoNegEnd = slice.indexOf('await setDoc(stockBatchDoc(newId)', autoNegStart);
    const autoNegBlock = slice.slice(autoNegStart, autoNegEnd);
    // The bare `productName: item.productName,` must NOT appear (must have
    // liveProductName fallback chain)
    expect(autoNegBlock).not.toMatch(/productName:\s*item\.productName,\s*\n\s*unit:/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('V46.E — Rule I full-flow simulation: poisoned batch → live-resolved movement', () => {
  it('E.1 USER REPORT REPRO: simulating the chain that produced movement productName=courseName PRE-V46', () => {
    // Simulate the data state from diag of BT-1778169734111
    const treatmentItem = {
      productId: '38699',
      productName: 'Stapple no 22',  // ← TFP correctly captures product name
      qty: 1,
      skipStockDeduction: false,
    };
    const poisonedBatch = {
      batchId: 'AUTO-NEG-OLD',
      productId: '38699',
      productName: 'ขลิบไร้เลือด (เบอร์22) 1 ครั้ง',  // ← POISONED from V44-era bug
      qty: { remaining: -1, total: 0 },
      autoNegative: true,
    };
    const beProductsDoc = {
      // ← Live read returns canonical name
      '38699': { productId: '38699', productName: 'Stapple no 22' },
    };

    // PRE-V46 simulation — old code: productName: b.productName || item.productName
    const preV46MovementName = poisonedBatch.productName || treatmentItem.productName;
    expect(preV46MovementName).toBe('ขลิบไร้เลือด (เบอร์22) 1 ครั้ง'); // BUG: course name

    // POST-V46 simulation — live-read first
    const liveResolvedName = beProductsDoc[treatmentItem.productId]?.productName || '';
    const postV46MovementName = liveResolvedName || treatmentItem.productName || poisonedBatch.productName || '';
    expect(postV46MovementName).toBe('Stapple no 22'); // V46 fix: canonical product name
  });

  it('E.2 POISONED-BATCH-WITHOUT-MASTER fallback: live read empty → item.productName wins (not batch.productName)', () => {
    // Edge case: be_products doc deleted; live read returns ''.
    // V46 chain: liveName('') || item.productName || b.productName || ''
    // Result: item.productName wins (which is canonical post-V44).
    const liveName = '';
    const itemProductName = 'Stapple no 22';
    const batchProductName = 'ขลิบไร้เลือด (เบอร์22) 1 ครั้ง';
    const finalName = liveName || itemProductName || batchProductName || '';
    expect(finalName).toBe('Stapple no 22');
  });

  it('E.3 ALL-FALLBACKS-EMPTY safety: empty string (V14 — never undefined, never course-name)', () => {
    const liveName = '';
    const itemProductName = '';
    const batchProductName = '';
    const finalName = liveName || itemProductName || batchProductName || '';
    expect(finalName).toBe('');
    expect(typeof finalName).toBe('string');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('V46.F — V12 multi-writer-sweep: every stock_movement productName goes through live-resolve', () => {
  it('F.1 SWEEP: every tx.set(stockMovementDoc productName uses live-resolved variable', () => {
    const fnStart = backendSrc.indexOf('async function _deductOneItem(');
    const slice = backendSrc.slice(fnStart, fnStart + 30000);
    // Count all stockMovementDoc productName lines, across positive FIFO +
    // negative overage + course-skip + product-skip + tracking-skip branches.
    // Ones that ALSO need live-resolution: positive FIFO + negative overage.
    // The course-skip / product-skip / trackStock-false silent-skip emits use
    // item.productName directly (they're documenting user intent / state, not
    // the actual stock outcome — V14 chain through V44 keeps item.productName
    // canonical).
    const liveResolvedHits = (slice.match(/productName:\s*(liveName|liveNameNeg|liveProductName)/g) || []).length;
    // Expect both positive FIFO + negative-overage to use live-resolve.
    expect(liveResolvedHits).toBeGreaterThanOrEqual(2);
    // No remaining `productName: b.productName,` (frozen-batch as sole source) in this fn
    expect(slice).not.toMatch(/productName:\s*b\.productName,\s*\n\s*qty:\s*-/);
  });

  it('F.2 V46 institutional marker present in source comments + Rule O reference', () => {
    expect(backendSrc).toMatch(/V46/);
    expect(backendSrc).toMatch(/Rule O/);
  });
});
