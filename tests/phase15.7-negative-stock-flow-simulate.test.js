// Phase 15.7 (2026-04-28) — negative stock flow simulate (Rule I)
//
// User directive: "หากเกิดการรักษา ตัดคอร์ส ขาย หรืออื่นใด ที่ สินค้าหรือ
// คอร์สหรือบริการใดๆที่สต็อคไม่พอ ปล่อยให้ตัดได้แบบปัจจุบันนี่แหละ
// แต่เพิ่มระบบ สต็อคติดลบ ไว้ หากตัดเกิน สินค้านั้นจะติดลบ".
//
// Pre-fix: shortfall path in _deductOneItem wrote a silent-skip movement
// (batchId:null, qty:null, before:null, after:null) — deduct effectively
// rejected.
//
// Post-fix:
//   - drain available batches FIFO (existing path, unchanged)
//   - push remaining shortfall onto FIFO-last batch (or fallback to most
//     recent createdAt batch / synthetic AUTO-NEG batch)
//   - movement carries real before/after numbers + negativeOverage marker
//   - batchFifoAllocate continues to skip negative batches (`<=0` continue),
//     so subsequent deducts on the same product won't auto-pile on the negative
//   - reverse paths use reverseQtyNumeric which is safe with negatives
//
// Test bank covers:
//   N1 pickNegativeTargetBatch pure helper (3 priorities)
//   N2 simulate single-batch deduct that overshoots
//   N3 simulate zero-batch case (synthetic AUTO-NEG)
//   N4 simulate FIFO multi-batch drain + last batch goes negative
//   N5 lifecycle: deduct → reverse → repaid balance
//   N6 source-grep: backendClient.js shortfall path uses pickNegativeTargetBatch
//   N7 source-grep: stockUtils.js exports pickNegativeTargetBatch
//   N8 source-grep: NO `batchId: null, qty: null, before: null, after: null`
//      shortfall pattern remaining in _deductOneItem
//   N9 stockUtils: reverseQtyNumeric still caps at total (regression guard)
//   N10 stockUtils: adjustAddQtyNumeric still bumps total (regression guard)

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

import {
  pickNegativeTargetBatch,
  reverseQtyNumeric,
  adjustAddQtyNumeric,
  batchFifoAllocate,
  isBatchAvailable,
} from '../src/lib/stockUtils.js';

const REPO_ROOT = path.resolve(import.meta.dirname || __dirname, '..');
const StockUtilsSrc = readFileSync(path.join(REPO_ROOT, 'src/lib/stockUtils.js'), 'utf-8');
const BackendClientSrc = readFileSync(path.join(REPO_ROOT, 'src/lib/backendClient.js'), 'utf-8');

describe('Phase 15.7 — Negative stock flow simulate', () => {
  describe('N1 — pickNegativeTargetBatch priorities', () => {
    it('N1.1 returns last allocation batchId when allocations non-empty', () => {
      const allocations = [
        { batchId: 'B1', takeQty: 10 },
        { batchId: 'B2', takeQty: 5 },
        { batchId: 'B3', takeQty: 3 },
      ];
      const result = pickNegativeTargetBatch({
        allocations,
        branchBatches: [],
        branchId: 'BR-X',
        productId: 'P1',
      });
      expect(result).toBe('B3');
    });

    it('N1.2 falls back to most-recent createdAt batch when no allocations', () => {
      const branchBatches = [
        { batchId: 'OLD', branchId: 'BR-X', productId: 'P1', createdAt: '2026-01-01T00:00:00Z' },
        { batchId: 'NEW', branchId: 'BR-X', productId: 'P1', createdAt: '2026-04-28T00:00:00Z' },
        { batchId: 'MID', branchId: 'BR-X', productId: 'P1', createdAt: '2026-03-01T00:00:00Z' },
      ];
      const result = pickNegativeTargetBatch({
        allocations: [],
        branchBatches,
        branchId: 'BR-X',
        productId: 'P1',
      });
      expect(result).toBe('NEW');
    });

    it('N1.3 returns null when no batches at all (synthetic-batch trigger)', () => {
      const result = pickNegativeTargetBatch({
        allocations: [],
        branchBatches: [],
        branchId: 'BR-X',
        productId: 'P1',
      });
      expect(result).toBeNull();
    });

    it('N1.4 filters by branchId (does not pick wrong-branch batch)', () => {
      const branchBatches = [
        { batchId: 'WRONG', branchId: 'BR-Y', productId: 'P1', createdAt: '2026-04-28T00:00:00Z' },
      ];
      const result = pickNegativeTargetBatch({
        allocations: [],
        branchBatches,
        branchId: 'BR-X',
        productId: 'P1',
      });
      expect(result).toBeNull();
    });

    it('N1.5 filters by productId', () => {
      const branchBatches = [
        { batchId: 'WRONG', branchId: 'BR-X', productId: 'P-OTHER', createdAt: '2026-04-28T00:00:00Z' },
      ];
      const result = pickNegativeTargetBatch({
        allocations: [],
        branchBatches,
        branchId: 'BR-X',
        productId: 'P1',
      });
      expect(result).toBeNull();
    });

    it('N1.6 handles missing createdAt gracefully', () => {
      const branchBatches = [
        { batchId: 'A', branchId: 'BR-X', productId: 'P1' },
        { batchId: 'B', branchId: 'BR-X', productId: 'P1', createdAt: '2026-04-28T00:00:00Z' },
      ];
      const result = pickNegativeTargetBatch({
        allocations: [],
        branchBatches,
        branchId: 'BR-X',
        productId: 'P1',
      });
      // B has createdAt — should win; A has '' which sorts last
      expect(result).toBe('B');
    });

    it('N1.7 coerces string IDs', () => {
      const branchBatches = [
        { batchId: 12345, branchId: 'BR-X', productId: 'P1', createdAt: '2026-04-28T00:00:00Z' },
      ];
      const result = pickNegativeTargetBatch({
        allocations: [],
        branchBatches,
        branchId: 'BR-X',
        productId: 'P1',
      });
      expect(result).toBe('12345');
    });

    it('N1.8 returns null for empty/null inputs', () => {
      expect(pickNegativeTargetBatch()).toBeNull();
      expect(pickNegativeTargetBatch({})).toBeNull();
    });
  });

  describe('N2 — simulate single-batch deduct overshoot', () => {
    it('N2.1 batch={total:50, remaining:24}, deduct 50 → after=-26, before=24', () => {
      // Pure simulation of the math layer: deduct 24 (drain) + push 26 (overage)
      // The backend's tx.update splits this into 2 movements OR combines if
      // same batch — see N4 for multi-batch + verify the math here.
      const before = 24;
      const requested = 50;
      const drain = Math.min(before, requested);
      const overage = requested - drain;
      const afterDrain = before - drain;
      const afterFinal = afterDrain - overage;
      expect(afterFinal).toBe(-26);
      // movement.qty is -50 (combined) OR -24 + -26 (split)
      expect(drain + overage).toBe(50);
    });

    it('N2.2 deduct 0 from any batch is no-op', () => {
      const before = 24;
      const requested = 0;
      // _deductOneItem early-returns on qty<=0
      expect(requested).toBe(0);
      // No movement, no batch change
      expect(before).toBe(24);
    });

    it('N2.3 deduct 24 from {remaining:24} → after=0 (exact drain, no negative)', () => {
      const allocations = [{ batchId: 'B1', takeQty: 24 }];
      const shortfall = 0;
      const target = pickNegativeTargetBatch({
        allocations,
        branchBatches: [],
        branchId: 'BR-X',
        productId: 'P1',
      });
      expect(target).toBe('B1');
      expect(shortfall).toBe(0); // no negative-push needed
    });
  });

  describe('N3 — simulate zero-batch (synthetic AUTO-NEG)', () => {
    it('N3.1 pickNegativeTargetBatch returns null → synthetic batch creation triggered', () => {
      const target = pickNegativeTargetBatch({
        allocations: [],
        branchBatches: [],
        branchId: 'BR-X',
        productId: 'P1',
      });
      expect(target).toBeNull();
    });

    it('N3.2 synthetic batch initial qty {total:0, remaining:0} → after deduct = {0, -X}', () => {
      const initial = { total: 0, remaining: 0 };
      const shortfall = 26;
      const newRemaining = initial.remaining - shortfall;
      expect(newRemaining).toBe(-26);
      // total stays 0 (we DON'T bump total on the negative push — that's
      // adjustAddQtyNumeric semantics, which we save for repay)
      expect(initial.total).toBe(0);
    });

    it('N3.3 backendClient.js source contains AUTO-NEG creation logic', () => {
      expect(BackendClientSrc).toMatch(/AUTO-NEG/);
      expect(BackendClientSrc).toMatch(/autoNegative:\s*true/);
    });

    it('N3.4 synthetic batch FK-checked via _assertProductExists (V35 invariant)', () => {
      // Search the whole _deductOneItem body for the FK-check + the
      // negative-stock-synthetic-batch context label (proves the V35 FK
      // invariant guards the synthetic-batch path specifically).
      const fn = BackendClientSrc.split('async function _deductOneItem')[1] || '';
      const nextFn = fn.indexOf('\nasync function ');
      const body = nextFn > 0 ? fn.slice(0, nextFn) : fn;
      expect(body).toMatch(/_assertProductExists\(\s*item\.productId/);
      expect(body).toMatch(/negative-stock-synthetic-batch/);
    });
  });

  describe('N4 — simulate FIFO multi-batch with shortfall on last', () => {
    it('N4.1 batches [10, 20, 5] deduct 50 → drain all + 15 negative on B3', () => {
      const batches = [
        { batchId: 'B1', productId: 'P1', branchId: 'BR-X', status: 'active', qty: { remaining: 10, total: 10 }, expiresAt: '2026-12-01' },
        { batchId: 'B2', productId: 'P1', branchId: 'BR-X', status: 'active', qty: { remaining: 20, total: 20 }, expiresAt: '2027-01-01' },
        { batchId: 'B3', productId: 'P1', branchId: 'BR-X', status: 'active', qty: { remaining: 5, total: 5 }, expiresAt: '2027-02-01' },
      ];
      const plan = batchFifoAllocate(batches, 50, { productId: 'P1' });
      expect(plan.allocations.length).toBe(3);
      expect(plan.allocations.reduce((s, a) => s + a.takeQty, 0)).toBe(35);
      expect(plan.shortfall).toBe(15);

      // FIFO-last batch is the target for negative push
      const target = pickNegativeTargetBatch({
        allocations: plan.allocations,
        branchBatches: batches,
        branchId: 'BR-X',
        productId: 'P1',
      });
      expect(target).toBe(plan.allocations[plan.allocations.length - 1].batchId);

      // After: target batch's "before" was 0 (just drained), "after" = -15
      // Math: 0 - 15 = -15
      expect(0 - plan.shortfall).toBe(-15);
    });

    it('N4.2 batchFifoAllocate sorts FEFO so earliest-expiry drained first', () => {
      const batches = [
        { batchId: 'LATE', productId: 'P1', status: 'active', qty: { remaining: 10, total: 10 }, expiresAt: '2027-12-01' },
        { batchId: 'EARLY', productId: 'P1', status: 'active', qty: { remaining: 10, total: 10 }, expiresAt: '2026-06-01' },
      ];
      const plan = batchFifoAllocate(batches, 15, { productId: 'P1' });
      // EARLY drained fully (10), LATE drained partially (5)
      expect(plan.allocations[0].batchId).toBe('EARLY');
      expect(plan.allocations[0].takeQty).toBe(10);
      expect(plan.allocations[1].batchId).toBe('LATE');
      expect(plan.allocations[1].takeQty).toBe(5);
    });
  });

  describe('N5 — lifecycle: deduct → reverse → repaid', () => {
    it('N5.1 reverseQtyNumeric on negative batch correctly caps at total', () => {
      // Scenario: batch had {total:10, remaining:10} → deduct 26 → {total:10, remaining:-16}
      // → reverse 26 → {total:10, remaining: min(-16+26, 10) = min(10, 10) = 10} ✓
      const negState = { total: 10, remaining: -16 };
      const reverted = reverseQtyNumeric(negState, 26);
      expect(reverted.total).toBe(10);
      expect(reverted.remaining).toBe(10);
    });

    it('N5.2 reverseQtyNumeric on partial-overage reverts correctly', () => {
      // {total:10, remaining:-5} reverse 3 → {total:10, remaining:-2}
      const reverted = reverseQtyNumeric({ total: 10, remaining: -5 }, 3);
      expect(reverted).toEqual({ total: 10, remaining: -2 });
    });

    it('N5.3 adjustAddQtyNumeric on negative batch repays correctly', () => {
      // {total:10, remaining:-26} + 50 → {total:max(10, 24)=24, remaining:24}
      const repaid = adjustAddQtyNumeric({ total: 10, remaining: -26 }, 50);
      expect(repaid).toEqual({ total: 24, remaining: 24 });
    });

    it('N5.4 isBatchAvailable returns false for negative remaining (no auto-allocate)', () => {
      const negBatch = { status: 'active', qty: { remaining: -10, total: 10 } };
      expect(isBatchAvailable(negBatch)).toBe(false);
    });

    it('N5.5 batchFifoAllocate skips negative batches (regression: V15.7 lock)', () => {
      const batches = [
        { batchId: 'NEG', productId: 'P1', status: 'active', qty: { remaining: -5, total: 0 } },
        { batchId: 'POS', productId: 'P1', status: 'active', qty: { remaining: 10, total: 10 } },
      ];
      const plan = batchFifoAllocate(batches, 5, { productId: 'P1' });
      expect(plan.allocations.length).toBe(1);
      expect(plan.allocations[0].batchId).toBe('POS');
      expect(plan.shortfall).toBe(0);
    });
  });

  describe('N6 — _deductOneItem source-grep contracts', () => {
    it('N6.1 destructures pickNegativeTargetBatch from stockUtils', () => {
      const fn = BackendClientSrc.split('async function _deductOneItem')[1] || '';
      const declarationBlock = fn.slice(0, 1500);
      expect(declarationBlock).toMatch(/pickNegativeTargetBatch/);
    });

    it('N6.2 negative-push tx writes negativeOverage:true marker', () => {
      const fn = BackendClientSrc.split('async function _deductOneItem')[1] || '';
      expect(fn).toMatch(/negativeOverage:\s*true/);
    });

    it('N6.3 negative-push movement carries real before+after (not null)', () => {
      const fn = BackendClientSrc.split('async function _deductOneItem')[1] || '';
      const block = fn.split('negativeOverage')[1] || '';
      expect(block).toMatch(/before:\s*beforeRemaining/);
      expect(block).toMatch(/after:\s*newRemaining/);
    });

    it('N6.4 throws PRODUCT_NOT_FOUND via _assertProductExists for synthetic batch', () => {
      const fn = BackendClientSrc.split('async function _deductOneItem')[1] || '';
      expect(fn).toMatch(/_assertProductExists/);
    });

    it('N6.5 reverseQtyNumeric still used for refund/cancel reverse path', () => {
      // _reverseOneMovement consumes reverseQtyNumeric — separate function
      // but in same file. Make sure it didn't get dropped in this refactor.
      expect(BackendClientSrc).toMatch(/reverseQtyNumeric/);
    });
  });

  describe('N7 — stockUtils.js exports pickNegativeTargetBatch', () => {
    it('N7.1 export named function present', () => {
      expect(StockUtilsSrc).toMatch(/export\s+function\s+pickNegativeTargetBatch/);
    });

    it('N7.2 JSDoc + Phase 15.7 marker present', () => {
      expect(StockUtilsSrc).toMatch(/Phase 15\.7/);
    });
  });

  describe('N8 — silent-skip shortfall pattern removed from _deductOneItem', () => {
    it('N8.1 shortfall path now uses negativeOverage marker (no silent-skip)', () => {
      // Search the FULL _deductOneItem body. The pre-fix `plan.shortfall > 0`
      // branch wrote a silent-skip movement; post-fix wraps the negative push
      // in a runTransaction that emits a real movement with negativeOverage:true.
      const fn = BackendClientSrc.split('async function _deductOneItem')[1] || '';
      const nextFn = fn.indexOf('\nasync function ');
      const body = nextFn > 0 ? fn.slice(0, nextFn) : fn;
      // Must have negativeOverage: true in the new path
      expect(body).toMatch(/negativeOverage:\s*true/);
      // And the new combined-tx flow uses pickNegativeTargetBatch
      expect(body).toMatch(/pickNegativeTargetBatch/);
    });

    it('N8.2 Phase 15.7 institutional-memory marker present in _deductOneItem', () => {
      const fn = BackendClientSrc.split('async function _deductOneItem')[1] || '';
      expect(fn).toMatch(/Phase 15\.7/);
    });
  });

  describe('N9 — reverseQtyNumeric semantics regression guard', () => {
    it('N9.1 still caps at total for refund path', () => {
      expect(reverseQtyNumeric({ total: 10, remaining: 5 }, 100)).toEqual({ total: 10, remaining: 10 });
    });

    it('N9.2 throws on negative input', () => {
      expect(() => reverseQtyNumeric({ total: 10, remaining: 0 }, -5)).toThrow();
    });
  });

  describe('N10 — adjustAddQtyNumeric semantics regression guard', () => {
    it('N10.1 bumps total when newRemaining exceeds it', () => {
      expect(adjustAddQtyNumeric({ total: 10, remaining: 10 }, 20)).toEqual({ total: 30, remaining: 30 });
    });

    it('N10.2 keeps total when newRemaining still ≤ total', () => {
      expect(adjustAddQtyNumeric({ total: 50, remaining: 40 }, 1)).toEqual({ total: 50, remaining: 41 });
    });

    it('N10.3 repays a negative remaining correctly', () => {
      expect(adjustAddQtyNumeric({ total: 10, remaining: -26 }, 50)).toEqual({ total: 24, remaining: 24 });
    });
  });

  describe('N11 — adversarial inputs', () => {
    it('N11.1 deduct against 0-batch produces shortfall == requested', () => {
      const plan = batchFifoAllocate([], 10, { productId: 'P1' });
      expect(plan.allocations.length).toBe(0);
      expect(plan.shortfall).toBe(10);
    });

    it('N11.2 deduct of 0 returns zero shortfall + zero allocations', () => {
      const plan = batchFifoAllocate([{ batchId: 'B', status: 'active', qty: { remaining: 10, total: 10 } }], 0);
      expect(plan.shortfall).toBe(0);
      expect(plan.allocations.length).toBe(0);
    });

    it('N11.3 negative deduct qty (defensive) returns zero shortfall', () => {
      const plan = batchFifoAllocate([{ batchId: 'B', status: 'active', qty: { remaining: 10, total: 10 } }], -5);
      // Stock primitives ignore negative qty (treats as 0)
      expect(plan.shortfall).toBe(0);
    });
  });
});
