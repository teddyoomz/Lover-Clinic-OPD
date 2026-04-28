// Phase 15.7-bis (2026-04-28) — negative-balance auto-repay full-flow simulate
//
// User report (after Phase 15.7 ship): "ตอนตัดตัดได้ แต่ตอนนำเข้าไปใหม่
// ทำไมนำเข้าไปแล้วไม่รวมกับอันเดิม และไม่สร้างใหม่ด้วย" + "ต้องทำให้รองรับ
// การเบิก ย้าย โอน ด้วยนะ มันต้องเพิ่มลดจริงนะ".
//
// Pre-Phase-15.7-bis: import / transfer-receive / withdrawal-receive
// always created a NEW batch with full incoming qty. Existing negative
// batches at the same product+branch were never cleared.
//
// Post-fix: NEW pure helper `applyNegativeRepay` + NEW async helper
// `_repayNegativeBalances` (in backendClient — not directly tested here;
// the lifecycle preview_eval covers it). All 3 batch creators now call
// `_repayNegativeBalances` BEFORE creating a new batch — incoming qty
// repays existing negatives FIFO; only the leftover becomes a fresh batch.
//
// User callout (2026-04-28): "เขียน test ฉลาดและครอบคลุมกว่านี้". This bank
// covers:
//   R1 applyNegativeRepay — pure helper, all flow shapes
//   R2 applyNegativeRepay — adversarial inputs
//   R3 source-grep: 3 batch creators call _repayNegativeBalances
//   R4 source-grep: createStockOrder + receiveCentralStockOrder return repays
//   R5 source-grep: updateStockTransferStatus + updateStockWithdrawalStatus
//                   return repays on receive (status 1→2)
//   R6 banner formatter: formatNegativeRepayBanner + hasNegativeRepay
//   R7 source-grep: 4 panels surface the repay banner
//   R8 leftover === 0 case: no new batch created (skip setDoc)

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

import { applyNegativeRepay, batchFifoAllocate, reverseQtyNumeric, adjustAddQtyNumeric } from '../src/lib/stockUtils.js';
import { formatNegativeRepayBanner, hasNegativeRepay } from '../src/lib/negativeRepayBanner.js';

const REPO_ROOT = path.resolve(import.meta.dirname || __dirname, '..');
const StockUtilsSrc = readFileSync(path.join(REPO_ROOT, 'src/lib/stockUtils.js'), 'utf-8');
const BackendSrc = readFileSync(path.join(REPO_ROOT, 'src/lib/backendClient.js'), 'utf-8');
const OrderPanelSrc = readFileSync(path.join(REPO_ROOT, 'src/components/backend/OrderPanel.jsx'), 'utf-8');
const TransferPanelSrc = readFileSync(path.join(REPO_ROOT, 'src/components/backend/StockTransferPanel.jsx'), 'utf-8');
const WithdrawalPanelSrc = readFileSync(path.join(REPO_ROOT, 'src/components/backend/StockWithdrawalPanel.jsx'), 'utf-8');
const CentralPanelSrc = readFileSync(path.join(REPO_ROOT, 'src/components/backend/CentralStockOrderPanel.jsx'), 'utf-8');

describe('Phase 15.7-bis — Negative repay flow simulate', () => {
  describe('R1 — applyNegativeRepay pure helper', () => {
    it('R1.1 single negative batch absorbs full incoming qty', () => {
      const batches = [
        { batchId: 'B1', qty: { remaining: -76, total: 0 }, createdAt: '2026-04-28T20:00Z' },
      ];
      const result = applyNegativeRepay(batches, 50);
      expect(result.repayPlan).toHaveLength(1);
      expect(result.repayPlan[0].batchId).toBe('B1');
      expect(result.repayPlan[0].repayAmt).toBe(50);
      expect(result.repayPlan[0].before).toBe(-76);
      expect(result.repayPlan[0].after).toBe(-26);
      expect(result.leftover).toBe(0);
    });

    it('R1.2 incoming qty exceeds debt → repay all + leftover positive', () => {
      const batches = [
        { batchId: 'B1', qty: { remaining: -76, total: 0 }, createdAt: '2026-04-28T20:00Z' },
      ];
      const result = applyNegativeRepay(batches, 500);
      expect(result.repayPlan[0].repayAmt).toBe(76);
      expect(result.repayPlan[0].after).toBe(0);
      expect(result.leftover).toBe(424);
    });

    it('R1.3 multiple negative batches — FIFO oldest first', () => {
      const batches = [
        { batchId: 'NEW', qty: { remaining: -10, total: 0 }, createdAt: '2026-04-28T20:00Z' },
        { batchId: 'OLD', qty: { remaining: -20, total: 0 }, createdAt: '2026-04-28T08:00Z' },
        { batchId: 'MID', qty: { remaining: -5, total: 0 }, createdAt: '2026-04-28T14:00Z' },
      ];
      const result = applyNegativeRepay(batches, 100);
      expect(result.repayPlan.map(p => p.batchId)).toEqual(['OLD', 'MID', 'NEW']);
      expect(result.repayPlan.map(p => p.repayAmt)).toEqual([20, 5, 10]);
      expect(result.leftover).toBe(65);
    });

    it('R1.4 partial repay — incoming runs out before all debts settled', () => {
      const batches = [
        { batchId: 'A', qty: { remaining: -50, total: 0 }, createdAt: '2026-04-28T08:00Z' },
        { batchId: 'B', qty: { remaining: -30, total: 0 }, createdAt: '2026-04-28T14:00Z' },
      ];
      const result = applyNegativeRepay(batches, 60);
      expect(result.repayPlan).toHaveLength(2);
      expect(result.repayPlan[0]).toMatchObject({ batchId: 'A', repayAmt: 50, after: 0 });
      expect(result.repayPlan[1]).toMatchObject({ batchId: 'B', repayAmt: 10, after: -20 });
      expect(result.leftover).toBe(0);
    });

    it('R1.5 no negative batches → empty plan, full leftover', () => {
      const batches = [
        { batchId: 'POS', qty: { remaining: 10, total: 10 }, createdAt: '2026-04-28T08:00Z' },
        { batchId: 'ZERO', qty: { remaining: 0, total: 0 }, createdAt: '2026-04-28T14:00Z' },
      ];
      const result = applyNegativeRepay(batches, 50);
      expect(result.repayPlan).toEqual([]);
      expect(result.leftover).toBe(50);
    });

    it('R1.6 incoming qty 0 → empty plan, leftover 0', () => {
      const batches = [{ batchId: 'B1', qty: { remaining: -50, total: 0 } }];
      const result = applyNegativeRepay(batches, 0);
      expect(result.repayPlan).toEqual([]);
      expect(result.leftover).toBe(0);
    });

    it('R1.7 mixed positive + negative batches — only negatives in plan', () => {
      const batches = [
        { batchId: 'POS', qty: { remaining: 10, total: 10 }, createdAt: '2026-04-28T08:00Z' },
        { batchId: 'NEG', qty: { remaining: -5, total: 0 }, createdAt: '2026-04-28T14:00Z' },
      ];
      const result = applyNegativeRepay(batches, 20);
      expect(result.repayPlan).toHaveLength(1);
      expect(result.repayPlan[0].batchId).toBe('NEG');
      expect(result.leftover).toBe(15);
    });
  });

  describe('R2 — applyNegativeRepay adversarial', () => {
    it('R2.1 null/undefined batches → empty plan', () => {
      expect(applyNegativeRepay(null, 50)).toEqual({ repayPlan: [], leftover: 50 });
      expect(applyNegativeRepay(undefined, 50)).toEqual({ repayPlan: [], leftover: 50 });
    });

    it('R2.2 non-array batches → empty plan', () => {
      expect(applyNegativeRepay('foo', 50)).toEqual({ repayPlan: [], leftover: 50 });
      expect(applyNegativeRepay({}, 50)).toEqual({ repayPlan: [], leftover: 50 });
    });

    it('R2.3 negative incoming qty → empty plan, leftover 0', () => {
      expect(applyNegativeRepay([{ batchId: 'B', qty: { remaining: -10 } }], -5).leftover).toBe(0);
    });

    it('R2.4 batches with missing qty → skipped (treated as non-negative)', () => {
      const batches = [{ batchId: 'B' }, { batchId: 'C', qty: null }];
      expect(applyNegativeRepay(batches, 50)).toEqual({ repayPlan: [], leftover: 50 });
    });

    it('R2.5 NaN remaining → skipped', () => {
      const batches = [{ batchId: 'B', qty: { remaining: NaN } }];
      expect(applyNegativeRepay(batches, 50)).toEqual({ repayPlan: [], leftover: 50 });
    });

    it('R2.6 missing createdAt → sorts to start (empty string < any ISO)', () => {
      const batches = [
        { batchId: 'WITH_CT', qty: { remaining: -5 }, createdAt: '2026-04-28T08:00Z' },
        { batchId: 'NO_CT', qty: { remaining: -10 } },
      ];
      const result = applyNegativeRepay(batches, 100);
      // NO_CT createdAt='' sorts before any valid ISO → repaid first
      expect(result.repayPlan[0].batchId).toBe('NO_CT');
      expect(result.repayPlan[1].batchId).toBe('WITH_CT');
    });
  });

  describe('R3 — _buildBatchFromOrderItem calls _repayNegativeBalances', () => {
    it('R3.1 _buildBatchFromOrderItem invokes _repayNegativeBalances', () => {
      const fn = BackendSrc.split('async function _buildBatchFromOrderItem')[1] || '';
      const nextFn = fn.indexOf('\nasync function ');
      const body = nextFn > 0 ? fn.slice(0, nextFn) : fn;
      expect(body).toMatch(/_repayNegativeBalances\(\s*\{/);
    });

    it('R3.2 _buildBatchFromOrderItem only creates new batch when leftover > 0', () => {
      const fn = BackendSrc.split('async function _buildBatchFromOrderItem')[1] || '';
      const nextFn = fn.indexOf('\nasync function ');
      const body = nextFn > 0 ? fn.slice(0, nextFn) : fn;
      // Look for the leftover gate
      expect(body).toMatch(/if\s*\(\s*leftover\s*>\s*0\s*\)/);
    });

    it('R3.3 _buildBatchFromOrderItem returns repayResult on the result object', () => {
      const fn = BackendSrc.split('async function _buildBatchFromOrderItem')[1] || '';
      const nextFn = fn.indexOf('\nasync function ');
      const body = nextFn > 0 ? fn.slice(0, nextFn) : fn;
      // The return object has `repayResult,` somewhere (followed by , and possibly a line comment)
      expect(body).toMatch(/repayResult,/);
    });

    it('R3.4 transfer _receiveAtDestination calls _repayNegativeBalances', () => {
      // Anchor on the EXPORT, not the comment reference.
      const idx = BackendSrc.indexOf('export async function createStockTransfer');
      expect(idx).toBeGreaterThan(0);
      const slice = BackendSrc.slice(idx, idx + 50000);
      const recIdx = slice.indexOf('async function _receiveAtDestination');
      expect(recIdx).toBeGreaterThan(0);
      const recBody = slice.slice(recIdx, recIdx + 5000);
      expect(recBody).toMatch(/_repayNegativeBalances\(/);
      expect(recBody).toMatch(/MOVEMENT_TYPES\.RECEIVE/);
    });

    it('R3.5 withdrawal _receiveAtDestination calls _repayNegativeBalances', () => {
      const idx = BackendSrc.indexOf('export async function createStockWithdrawal');
      expect(idx).toBeGreaterThan(0);
      const slice = BackendSrc.slice(idx, idx + 50000);
      const recIdx = slice.indexOf('async function _receiveAtDestination');
      expect(recIdx).toBeGreaterThan(0);
      const recBody = slice.slice(recIdx, recIdx + 5000);
      expect(recBody).toMatch(/_repayNegativeBalances\(/);
      expect(recBody).toMatch(/MOVEMENT_TYPES\.WITHDRAWAL_CONFIRM/);
    });
  });

  describe('R4 — return value carries repays summary', () => {
    it('R4.1 createStockOrder returns repays array', () => {
      const fn = BackendSrc.split('export async function createStockOrder')[1] || '';
      const nextExport = fn.indexOf('\nexport ');
      const body = nextExport > 0 ? fn.slice(0, nextExport) : fn;
      expect(body).toMatch(/return\s*\{[^}]*repays[^}]*\}/);
    });

    it('R4.2 receiveCentralStockOrder returns repays array', () => {
      const fn = BackendSrc.split('export async function receiveCentralStockOrder')[1] || '';
      const nextExport = fn.indexOf('\nexport ');
      const body = nextExport > 0 ? fn.slice(0, nextExport) : fn;
      expect(body).toMatch(/repays/);
    });
  });

  describe('R5 — transfer + withdrawal status update returns repays on receive', () => {
    it('R5.1 updateStockTransferStatus returns repays on status 1→2', () => {
      const idx = BackendSrc.indexOf('updateStockTransferStatus');
      const slice = BackendSrc.slice(idx, idx + 30000);
      // Find the curStatus===1 && next===2 branch
      expect(slice).toMatch(/curStatus\s*===\s*1\s*&&\s*next\s*===\s*2[\s\S]{0,2000}repays/);
    });

    it('R5.2 updateStockWithdrawalStatus returns repays on status 1→2', () => {
      const idx = BackendSrc.indexOf('updateStockWithdrawalStatus');
      const slice = BackendSrc.slice(idx, idx + 30000);
      expect(slice).toMatch(/curStatus\s*===\s*1\s*&&\s*next\s*===\s*2[\s\S]{0,2000}repays/);
    });
  });

  describe('R6 — formatNegativeRepayBanner + hasNegativeRepay', () => {
    it('R6.1 hasNegativeRepay returns false for empty', () => {
      expect(hasNegativeRepay([])).toBe(false);
      expect(hasNegativeRepay(null)).toBe(false);
      expect(hasNegativeRepay(undefined)).toBe(false);
    });

    it('R6.2 hasNegativeRepay returns false when totalRepaid is 0', () => {
      expect(hasNegativeRepay([{ totalRepaid: 0 }])).toBe(false);
    });

    it('R6.3 hasNegativeRepay returns true when at least one totalRepaid > 0', () => {
      expect(hasNegativeRepay([{ totalRepaid: 0 }, { totalRepaid: 5 }])).toBe(true);
    });

    it('R6.4 formatNegativeRepayBanner empty input → empty string', () => {
      expect(formatNegativeRepayBanner([])).toBe('');
      expect(formatNegativeRepayBanner(null)).toBe('');
    });

    it('R6.5 formatNegativeRepayBanner single product with leftover', () => {
      const banner = formatNegativeRepayBanner([
        { productName: 'Allergan 100 U', totalRepaid: 76, leftover: 424 },
      ]);
      expect(banner).toContain('Allergan 100 U');
      expect(banner).toContain('76');
      expect(banner).toContain('424');
      expect(banner).toContain('1 สินค้า');
    });

    it('R6.6 formatNegativeRepayBanner — leftover=0 says "ไม่มีสต็อคใหม่เพิ่ม"', () => {
      const banner = formatNegativeRepayBanner([
        { productName: 'Botox', totalRepaid: 100, leftover: 0 },
      ]);
      expect(banner).toContain('ไม่มีสต็อคใหม่เพิ่ม');
    });

    it('R6.7 formatNegativeRepayBanner multiple products — sums total + lists each', () => {
      const banner = formatNegativeRepayBanner([
        { productName: 'A', totalRepaid: 10, leftover: 5 },
        { productName: 'B', totalRepaid: 20, leftover: 0 },
      ]);
      expect(banner).toContain('2 สินค้า');
      expect(banner).toContain('30 หน่วย'); // 10+20
      expect(banner).toContain('A');
      expect(banner).toContain('B');
    });

    it('R6.8 formatNegativeRepayBanner falls back to productId when productName missing', () => {
      const banner = formatNegativeRepayBanner([
        { productId: 'P-XYZ', totalRepaid: 5, leftover: 0 },
      ]);
      expect(banner).toContain('P-XYZ');
    });
  });

  describe('R7 — 4 panel surfaces import + render the banner', () => {
    it('R7.1 OrderPanel imports + renders banner', () => {
      expect(OrderPanelSrc).toMatch(/formatNegativeRepayBanner/);
      expect(OrderPanelSrc).toMatch(/hasNegativeRepay/);
      expect(OrderPanelSrc).toMatch(/data-testid="negative-repay-banner"/);
    });
    it('R7.2 StockTransferPanel imports + renders banner', () => {
      expect(TransferPanelSrc).toMatch(/formatNegativeRepayBanner/);
      expect(TransferPanelSrc).toMatch(/hasNegativeRepay/);
      expect(TransferPanelSrc).toMatch(/data-testid="negative-repay-banner"/);
    });
    it('R7.3 StockWithdrawalPanel imports + renders banner', () => {
      expect(WithdrawalPanelSrc).toMatch(/formatNegativeRepayBanner/);
      expect(WithdrawalPanelSrc).toMatch(/hasNegativeRepay/);
      expect(WithdrawalPanelSrc).toMatch(/data-testid="negative-repay-banner"/);
    });
    it('R7.4 CentralStockOrderPanel imports + renders banner', () => {
      expect(CentralPanelSrc).toMatch(/formatNegativeRepayBanner/);
      expect(CentralPanelSrc).toMatch(/hasNegativeRepay/);
      expect(CentralPanelSrc).toMatch(/data-testid="negative-repay-banner"/);
    });
  });

  describe('R8 — leftover === 0 case correctly skips new batch creation', () => {
    it('R8.1 _buildBatchFromOrderItem batchId=null when leftover===0', () => {
      const fn = BackendSrc.split('async function _buildBatchFromOrderItem')[1] || '';
      const nextFn = fn.indexOf('\nasync function ');
      const body = nextFn > 0 ? fn.slice(0, nextFn) : fn;
      // Two declarations: let batchId = null + assigns inside `if (leftover > 0)`
      expect(body).toMatch(/let\s+batchId\s*=\s*null/);
      expect(body).toMatch(/let\s+movementId\s*=\s*null/);
    });
  });

  describe('R9 — applyNegativeRepay output never has undefined leaves (V14 lock)', () => {
    function walkForUndefined(obj, path = '') {
      if (obj === undefined) return [path];
      if (obj === null || typeof obj !== 'object') return [];
      if (Array.isArray(obj)) {
        return obj.flatMap((v, i) => walkForUndefined(v, `${path}[${i}]`));
      }
      return Object.entries(obj).flatMap(([k, v]) => walkForUndefined(v, `${path}.${k}`));
    }
    it('R9.1 plan steps have no undefined leaves', () => {
      const result = applyNegativeRepay(
        [{ batchId: 'B', qty: { remaining: -10, total: 0 }, createdAt: '2026-04-28' }],
        20,
      );
      // Each step has batchId, repayAmt, before, after, batch — batch may
      // have whatever raw shape was passed in. Walk should find no undefined.
      const undefs = walkForUndefined(result.repayPlan);
      expect(undefs).toEqual([]);
    });
  });

  describe('R10 — math invariants survive Phase 15.7-bis', () => {
    it('R10.1 reverseQtyNumeric still caps at total', () => {
      expect(reverseQtyNumeric({ total: 10, remaining: -5 }, 100)).toEqual({ total: 10, remaining: 10 });
    });

    it('R10.2 adjustAddQtyNumeric still bumps total when needed', () => {
      expect(adjustAddQtyNumeric({ total: 10, remaining: 10 }, 20)).toEqual({ total: 30, remaining: 30 });
    });

    it('R10.3 batchFifoAllocate still skips negative batches (no auto-feed)', () => {
      const batches = [
        { batchId: 'NEG', productId: 'P', status: 'active', qty: { remaining: -5, total: 0 } },
        { batchId: 'POS', productId: 'P', status: 'active', qty: { remaining: 10, total: 10 } },
      ];
      const plan = batchFifoAllocate(batches, 5, { productId: 'P' });
      expect(plan.allocations[0]?.batchId).toBe('POS');
      expect(plan.shortfall).toBe(0);
    });
  });
});
