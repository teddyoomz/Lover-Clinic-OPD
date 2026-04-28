// ─── Phase 15.6 — FK validation in batch creators (Issue 3 prevention) ──────
// User report (verbatim, 2026-04-28):
//   "make sure ว่าจะไม่มีสินค้าที่ไม่มีตัวตนในระบบไปเข้าระบบคลังได้
//    ทั้งคลังสาขาและคลังกลาง"
//
// Pre-fix: be_stock_batches accepted any {productId, productName} pair —
// no FK enforcement at write. Historical seed + Phase 8 tests left orphans
// like "Acetin 6", "Aloe gel 010" with productIds that don't resolve to
// any be_products doc. StockBalancePanel rendered them as ghosts.
//
// Fix: NEW shared `_assertProductExists(productId, contextLabel)` helper
// in backendClient.js. Throws PRODUCT_NOT_FOUND on missing/empty.
// Called BEFORE setDoc(stockBatchDoc, ...) in 3 batch-creating sites:
//   1. _buildBatchFromOrderItem (purchase order receive — both branch + central)
//   2. createStockTransfer._receiveAtDestination (transfer destination)
//   3. createStockWithdrawal._receiveAtDestination (withdrawal destination)
//
// Coverage:
//   FK.A — _assertProductExists declaration shape (function declaration, not const)
//   FK.B — pure simulate: empty / missing / existing inputs
//   FK.C — source-grep: 3 batch-creating sites all call _assertProductExists
//   FK.D — V14 lock: error message references PRODUCT_NOT_FOUND constant
//   FK.E — adversarial inputs

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const backendSrc = read('src/lib/backendClient.js');

// =============================================================================
describe('Phase 15.6 FK.A — _assertProductExists helper declaration', () => {
  it('FK.A.1 — helper declared as `async function` (hoisted, not const)', () => {
    expect(backendSrc).toMatch(/async function _assertProductExists\s*\(/);
    // V11 lock: must NOT be `const _assertProductExists = async (...)` (TDZ trap)
    expect(backendSrc).not.toMatch(/const _assertProductExists\s*=\s*async/);
  });

  it('FK.A.2 — helper takes (productId, contextLabel) signature', () => {
    expect(backendSrc).toMatch(/async function _assertProductExists\s*\(\s*productId\s*,\s*contextLabel\s*\)/);
  });

  it('FK.A.3 — helper throws on empty productId', () => {
    const fnStart = backendSrc.indexOf('async function _assertProductExists');
    const fnSlice = backendSrc.slice(fnStart, fnStart + 1500);
    expect(fnSlice).toMatch(/empty productId/);
    expect(fnSlice).toMatch(/throw new Error/);
  });

  it('FK.A.4 — helper uses getProduct (already-exported lookup)', () => {
    const fnStart = backendSrc.indexOf('async function _assertProductExists');
    const fnSlice = backendSrc.slice(fnStart, fnStart + 1500);
    expect(fnSlice).toMatch(/await getProduct\(/);
  });

  it('FK.A.5 — error message contains PRODUCT_NOT_FOUND token (greppable)', () => {
    const fnStart = backendSrc.indexOf('async function _assertProductExists');
    const fnSlice = backendSrc.slice(fnStart, fnStart + 1500);
    expect(fnSlice).toMatch(/PRODUCT_NOT_FOUND/);
  });

  it('FK.A.6 — error mentions cleanup runbook for admin recovery', () => {
    const fnStart = backendSrc.indexOf('async function _assertProductExists');
    const fnSlice = backendSrc.slice(fnStart, fnStart + 1500);
    expect(fnSlice).toMatch(/cleanup-orphan-stock/);
  });
});

// =============================================================================
describe('Phase 15.6 FK.B — pure simulate of helper logic', () => {
  // Mirror of the inline helper (matches _assertProductExists shape).
  async function simulateAssertProductExists(productId, contextLabel, getProductMock) {
    const id = String(productId || '');
    if (!id) {
      throw new Error(`PRODUCT_NOT_FOUND (${contextLabel || 'batch'}): empty productId`);
    }
    const product = await getProductMock(id);
    if (!product) {
      throw new Error(
        `PRODUCT_NOT_FOUND (${contextLabel || 'batch'}): productId="${id}" not in be_products`
      );
    }
  }

  it('FK.B.1 — passes when product exists', async () => {
    const getProduct = async (id) => ({ id, name: 'Allergan' });
    await expect(simulateAssertProductExists('ALG-100', 'test', getProduct)).resolves.toBeUndefined();
  });

  it('FK.B.2 — throws PRODUCT_NOT_FOUND on missing', async () => {
    const getProduct = async () => null;
    await expect(simulateAssertProductExists('NONEXISTENT-1', 'test', getProduct))
      .rejects.toThrow(/PRODUCT_NOT_FOUND/);
  });

  it('FK.B.3 — throws on empty productId', async () => {
    const getProduct = async () => null;
    await expect(simulateAssertProductExists('', 'test', getProduct))
      .rejects.toThrow(/PRODUCT_NOT_FOUND.*empty productId/);
  });

  it('FK.B.4 — throws on null productId', async () => {
    const getProduct = async () => null;
    await expect(simulateAssertProductExists(null, 'test', getProduct))
      .rejects.toThrow(/empty productId/);
  });

  it('FK.B.5 — throws on undefined productId', async () => {
    const getProduct = async () => null;
    await expect(simulateAssertProductExists(undefined, 'test', getProduct))
      .rejects.toThrow(/empty productId/);
  });

  it('FK.B.6 — error message includes the contextLabel for forensics', async () => {
    const getProduct = async () => null;
    await expect(simulateAssertProductExists('X', '_buildBatchFromOrderItem item#3', getProduct))
      .rejects.toThrow(/_buildBatchFromOrderItem item#3/);
  });

  it('FK.B.7 — error message includes the productId for debugging', async () => {
    const getProduct = async () => null;
    await expect(simulateAssertProductExists('NONEXISTENT-XYZ', 'test', getProduct))
      .rejects.toThrow(/NONEXISTENT-XYZ/);
  });

  it('FK.B.8 — coerces numeric productId to string', async () => {
    const getProduct = async (id) => id === '123' ? { id: '123' } : null;
    await expect(simulateAssertProductExists(123, 'numeric', getProduct)).resolves.toBeUndefined();
  });

  it('FK.B.9 — adversarial: getProduct throws → propagates', async () => {
    const getProduct = async () => { throw new Error('Firestore offline'); };
    await expect(simulateAssertProductExists('X', 'test', getProduct))
      .rejects.toThrow(/Firestore offline/);
  });
});

// =============================================================================
describe('Phase 15.6 FK.C — 3 batch-creating sites call _assertProductExists', () => {
  it('FK.C.1 — _buildBatchFromOrderItem calls _assertProductExists BEFORE setDoc', () => {
    const fnStart = backendSrc.indexOf('async function _buildBatchFromOrderItem');
    expect(fnStart, '_buildBatchFromOrderItem not found').toBeGreaterThan(0);
    const setDocPos = backendSrc.indexOf('setDoc(stockBatchDoc', fnStart);
    expect(setDocPos).toBeGreaterThan(fnStart);
    const slice = backendSrc.slice(fnStart, setDocPos);
    expect(slice).toMatch(/await _assertProductExists\(/);
  });

  it('FK.C.2 — updateStockTransferStatus._receiveAtDestination calls _assertProductExists', () => {
    // The _receiveAtDestination helper for transfers lives inside
    // updateStockTransferStatus (not createStockTransfer — that just creates
    // the transfer doc; the destination batch is materialized when status
    // advances to RECEIVE).
    const start = backendSrc.indexOf('export async function updateStockTransferStatus');
    const end = backendSrc.indexOf('export async function listStockTransfers', start);
    expect(start, 'updateStockTransferStatus not found').toBeGreaterThan(0);
    expect(end, 'function end marker not found').toBeGreaterThan(start);
    const slice = backendSrc.slice(start, end);
    expect(slice).toMatch(/_receiveAtDestination/);
    const inner = slice.match(/async function _receiveAtDestination[\s\S]{0,2500}/);
    expect(inner, 'transfer _receiveAtDestination block not found').not.toBeNull();
    const setDocIdx = inner[0].indexOf('setDoc(stockBatchDoc');
    expect(setDocIdx).toBeGreaterThan(0);
    const before = inner[0].slice(0, setDocIdx);
    expect(before).toMatch(/await _assertProductExists\(/);
  });

  it('FK.C.3 — updateStockWithdrawalStatus._receiveAtDestination calls _assertProductExists', () => {
    // Same shape as transfer — withdrawal destination batch materialized
    // when status advances to WITHDRAWAL_CONFIRM (inside updateStockWithdrawalStatus).
    const start = backendSrc.indexOf('export async function updateStockWithdrawalStatus');
    const end = backendSrc.indexOf('export async function listStockWithdrawals', start);
    expect(start, 'updateStockWithdrawalStatus not found').toBeGreaterThan(0);
    expect(end, 'function end marker not found').toBeGreaterThan(start);
    const slice = backendSrc.slice(start, end);
    expect(slice).toMatch(/_receiveAtDestination/);
    const inner = slice.match(/async function _receiveAtDestination[\s\S]{0,2500}/);
    expect(inner, 'withdrawal _receiveAtDestination block not found').not.toBeNull();
    const setDocIdx = inner[0].indexOf('setDoc(stockBatchDoc');
    expect(setDocIdx).toBeGreaterThan(0);
    const before = inner[0].slice(0, setDocIdx);
    expect(before).toMatch(/await _assertProductExists\(/);
  });

  it('FK.C.4 — every setDoc(stockBatchDoc, ...) is preceded by _assertProductExists in source order', () => {
    // Belt-and-suspenders: walk every batch-write site and verify FK is upstream.
    // Look-back window 4000 chars — _buildBatchFromOrderItem has a long
    // optInStockConfig block between the FK check and the setDoc.
    const allBatchWrites = [...backendSrc.matchAll(/setDoc\(stockBatchDoc\(/g)];
    expect(allBatchWrites.length).toBeGreaterThanOrEqual(3);
    for (const m of allBatchWrites) {
      const start = Math.max(0, m.index - 4000);
      const before = backendSrc.slice(start, m.index);
      expect(before, `batch write at index ${m.index} missing FK guard above it`)
        .toMatch(/await _assertProductExists\(/);
    }
  });
});

// =============================================================================
describe('Phase 15.6 FK.D — V14 lock + institutional memory', () => {
  it('FK.D.1 — Phase 15.6 / Issue 3 markers present', () => {
    expect(backendSrc).toMatch(/Phase 15\.6[^\n]*Issue 3/);
  });

  it('FK.D.2 — User report quote retained in source comment (institutional memory)', () => {
    expect(backendSrc).toMatch(/ไม่มีตัวตนในระบบ|Acetin 6|Aloe gel 010/);
  });

  it('FK.D.3 — V14 anti-pattern check: no `if (!product) {}` silent swallow', () => {
    // Must throw, not silently continue
    const fnStart = backendSrc.indexOf('async function _assertProductExists');
    const fnSlice = backendSrc.slice(fnStart, fnStart + 1500);
    // Must have throw clauses for both empty + missing
    const throwCount = (fnSlice.match(/throw new Error/g) || []).length;
    expect(throwCount).toBeGreaterThanOrEqual(2);
  });
});

// =============================================================================
describe('Phase 15.6 FK.E — defensive: orphan source batch transfer/withdrawal blocked', () => {
  it('FK.E.1 — transfer destination FK refuses orphan materialization', () => {
    const start = backendSrc.indexOf('export async function updateStockTransferStatus');
    const end = backendSrc.indexOf('export async function listStockTransfers', start);
    const slice = backendSrc.slice(start, end);
    // Comment must explain the rationale (institutional memory)
    expect(slice).toMatch(/orphan/i);
    expect(slice).toMatch(/Phase 15\.6[\s\S]{0,80}Issue 3/);
  });

  it('FK.E.2 — withdrawal destination FK comment present', () => {
    const start = backendSrc.indexOf('export async function updateStockWithdrawalStatus');
    const end = backendSrc.indexOf('export async function listStockWithdrawals', start);
    const slice = backendSrc.slice(start, end);
    expect(slice).toMatch(/Phase 15\.6[\s\S]{0,80}Issue 3/);
  });

  it('FK.E.3 — _buildBatchFromOrderItem comment cites Acetin 6 / orphan pattern', () => {
    const fnStart = backendSrc.indexOf('async function _buildBatchFromOrderItem');
    const fnSlice = backendSrc.slice(fnStart, fnStart + 4000);
    expect(fnSlice).toMatch(/Phase 15\.6/);
    expect(fnSlice).toMatch(/orphan/i);
  });
});
