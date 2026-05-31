// V138 (2026-05-31) — Negative-batch status invariant + anti-negative direction matrix.
//
// BUG: createStockAdjustment + sibling stock writers used
//   `remaining <= 0 ? BATCH_STATUS.DEPLETED : BATCH_STATUS.ACTIVE`
// → an ADJUST_ADD that bumped a NEGATIVE batch up but not yet to ≥0 (e.g. the
// user's E.P.T.Q S500: -13 + 1 = -12) flipped status to DEPLETED → the product
// VANISHED from "ยอดคงเหลือ" (StockBalancePanel queries status:'active' only) AND
// became invisible to _repayNegativeBalances (filters status:ACTIVE) → debt stuck.
//
// INVARIANT (locked here + AV158): a be_stock_batches doc with qty.remaining < 0
// MUST be status='active' (visible active DEBT). Only remaining === 0 → depleted.
// Centralized in stockUtils.resolveBatchStatusForRemaining (single source of truth).
//
// ANTI-NEGATIVE RULE (user directive, verified — NOT a code change, structural):
// stock may go NEGATIVE ONLY via _deductOneItem context 'treatment' (TFP) OR 'sale'.
// Every other stock-out path BLOCKS on insufficient: ADJUST_REDUCE + transfer-export
// + withdrawal-export throw; non-treatment/sale shortfall throws. Imports only ADD.
//
// This file covers EVERY direction stock flows (per user "ครบทุกประเภท") at the
// pure-logic + source-grep layer. Real-Firestore behavior of the shipped functions
// is proven by scripts/e2e-negative-batch-directions.mjs (Rule Q L2 / Rule I item b).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  resolveBatchStatusForRemaining,
  adjustAddQtyNumeric,
  deductQtyNumeric,
  applyNegativeRepay,
  buildQtyNumeric,
  reverseQtyNumeric,
  BATCH_STATUS,
} from '../src/lib/stockUtils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendSrc = readFileSync(join(__dirname, '../src/lib/backendClient.js'), 'utf8');
const stockUtilsSrc = readFileSync(join(__dirname, '../src/lib/stockUtils.js'), 'utf8');
const balancePanelSrc = readFileSync(join(__dirname, '../src/components/backend/StockBalancePanel.jsx'), 'utf8');
const ACTIVE = BATCH_STATUS.ACTIVE;     // 'active'
const DEPLETED = BATCH_STATUS.DEPLETED; // 'depleted'

// ─── N1 — helper unit (the single source of truth) ───────────────────────────
describe('V138.N1 — resolveBatchStatusForRemaining (single-source status)', () => {
  it('N1.1 negative → active (visible debt) — the user-reported E.P.T.Q S500 case', () => {
    expect(resolveBatchStatusForRemaining(-13)).toBe(ACTIVE);
    expect(resolveBatchStatusForRemaining(-12)).toBe(ACTIVE); // after +1
    expect(resolveBatchStatusForRemaining(-1)).toBe(ACTIVE);
    expect(resolveBatchStatusForRemaining(-91)).toBe(ACTIVE);
  });
  it('N1.2 exactly zero → depleted (no stock, no debt)', () => {
    expect(resolveBatchStatusForRemaining(0)).toBe(DEPLETED);
  });
  it('N1.3 positive → active', () => {
    expect(resolveBatchStatusForRemaining(1)).toBe(ACTIVE);
    expect(resolveBatchStatusForRemaining(10000)).toBe(ACTIVE);
  });
  it('N1.4 non-finite → depleted (safe default; never phantom-active)', () => {
    expect(resolveBatchStatusForRemaining(NaN)).toBe(DEPLETED);
    expect(resolveBatchStatusForRemaining(undefined)).toBe(DEPLETED);
    expect(resolveBatchStatusForRemaining(null)).toBe(DEPLETED);
    expect(resolveBatchStatusForRemaining('x')).toBe(DEPLETED);
  });
  it('N1.5 NEVER returns "depleted" for any negative value (the core invariant)', () => {
    for (let r = -1; r >= -500; r--) {
      expect(resolveBatchStatusForRemaining(r)).toBe(ACTIVE);
    }
  });
});

// ─── N2 — ADJUST_ADD on a negative batch (the bug + "บวกติดลบทีละนิด") ─────────
describe('V138.N2 — ปรับเพิ่ม (ADJUST_ADD) on a negative batch stays visible + partial', () => {
  it('N2.1 -13 + 1 = -12 and status STAYS active (was wrongly depleted → vanished)', () => {
    const q = adjustAddQtyNumeric({ remaining: -13, total: 0 }, 1);
    expect(q.remaining).toBe(-12);
    expect(resolveBatchStatusForRemaining(q.remaining)).toBe(ACTIVE);
  });
  it('N2.2 บวกทีละนิด chain -13 → 0: every intermediate step stays active until exactly 0', () => {
    let qty = { remaining: -13, total: 0 };
    const statuses = [];
    for (let i = 0; i < 13; i++) {
      qty = adjustAddQtyNumeric(qty, 1);
      statuses.push(resolveBatchStatusForRemaining(qty.remaining));
    }
    // -12..-1 (12 steps) → active ; final 0 → depleted
    expect(statuses.slice(0, 12).every((s) => s === ACTIVE)).toBe(true);
    expect(qty.remaining).toBe(0);
    expect(statuses[12]).toBe(DEPLETED);
  });
  it('N2.3 -13 + 20 = +7, total bumped to 7, status active (over-repay → positive)', () => {
    const q = adjustAddQtyNumeric({ remaining: -13, total: 0 }, 20);
    expect(q.remaining).toBe(7);
    expect(q.total).toBe(7);
    expect(resolveBatchStatusForRemaining(q.remaining)).toBe(ACTIVE);
  });
  it('N2.4 -91 + 1 = -90 active (Augmentin — big debt, partial add)', () => {
    const q = adjustAddQtyNumeric({ remaining: -91, total: 0 }, 1);
    expect(q.remaining).toBe(-90);
    expect(resolveBatchStatusForRemaining(q.remaining)).toBe(ACTIVE);
  });
});

// ─── N3 — ADJUST_REDUCE blocks negative (anti-negative) ──────────────────────
describe('V138.N3 — ปรับลด (ADJUST_REDUCE) cannot drive a batch negative', () => {
  it('N3.1 reduce more than remaining → throws (cannot go negative)', () => {
    expect(() => deductQtyNumeric({ remaining: 3, total: 10 }, 5)).toThrow(/insufficient/i);
  });
  it('N3.2 reduce a positive batch to exactly 0 → depleted', () => {
    const q = deductQtyNumeric({ remaining: 5, total: 10 }, 5);
    expect(q.remaining).toBe(0);
    expect(resolveBatchStatusForRemaining(q.remaining)).toBe(DEPLETED);
  });
  it('N3.3 reduce on an already-negative batch → throws (cannot deepen debt via adjust)', () => {
    expect(() => deductQtyNumeric({ remaining: -5, total: 0 }, 1)).toThrow(/insufficient/i);
  });
});

// ─── N4/N5 — TFP treatment + sale deduct CAN go negative ─────────────────────
describe('V138.N4 — TFP treatment deduct may push negative (negative target stays active)', () => {
  it('N4.1 deduct 5 from a 3-remaining batch → shortfall 2 → push → -2 active', () => {
    // models the negative-push: newRemaining = beforeRemaining(0 after drain) - shortfall
    const afterDrain = deductQtyNumeric({ remaining: 3, total: 3 }, 3).remaining; // 0
    const shortfall = 2;
    const newRemaining = afterDrain - shortfall; // -2
    expect(newRemaining).toBe(-2);
    expect(resolveBatchStatusForRemaining(newRemaining)).toBe(ACTIVE);
  });
});
describe('V138.N5 — sale deduct may push negative (การขาย — second allowed context)', () => {
  it('N5.1 sale shortfall pushes negative, batch stays active', () => {
    const newRemaining = 0 - 4;
    expect(resolveBatchStatusForRemaining(newRemaining)).toBe(ACTIVE);
  });
});

// ─── N6/N7 — transfer + withdrawal export BLOCK negative ─────────────────────
describe('V138.N6 — transfer export cannot drive source negative', () => {
  it('N6.1 export more than source remaining → deductQtyNumeric throws', () => {
    expect(() => deductQtyNumeric({ remaining: 2, total: 10 }, 5)).toThrow(/insufficient/i);
  });
  it('N6.2 export draining source to exactly 0 → depleted', () => {
    expect(resolveBatchStatusForRemaining(deductQtyNumeric({ remaining: 5, total: 10 }, 5).remaining)).toBe(DEPLETED);
  });
});
describe('V138.N7 — withdrawal export cannot drive source negative', () => {
  it('N7.1 export > remaining → throws', () => {
    expect(() => deductQtyNumeric({ remaining: 1, total: 4 }, 4)).toThrow(/insufficient/i);
  });
});

// ─── N8 — IN-flows repay negatives FIFO (import / transfer-in / withdrawal-in / central) ──
describe('V138.N8 — incoming positives repay negatives FIFO (partial / full / over)', () => {
  const negBatches = [
    { batchId: 'B-old', qty: { remaining: -10, total: 0 }, createdAt: '2026-01-01' },
    { batchId: 'B-new', qty: { remaining: -5, total: 0 }, createdAt: '2026-02-01' },
  ];
  it('N8.1 partial repay (incoming < debt): oldest repaid first, batch STAYS negative+active', () => {
    const { repayPlan, leftover } = applyNegativeRepay(negBatches, 4);
    expect(repayPlan).toHaveLength(1);
    expect(repayPlan[0].batchId).toBe('B-old'); // FIFO oldest
    expect(repayPlan[0].after).toBe(-6);         // -10 + 4
    expect(leftover).toBe(0);                    // all incoming consumed
    expect(resolveBatchStatusForRemaining(repayPlan[0].after)).toBe(ACTIVE); // still debt → visible
  });
  it('N8.2 exact repay of one debt → that batch reaches 0 → depleted', () => {
    const { repayPlan, leftover } = applyNegativeRepay(negBatches, 10);
    expect(repayPlan[0].batchId).toBe('B-old');
    expect(repayPlan[0].after).toBe(0);
    expect(resolveBatchStatusForRemaining(repayPlan[0].after)).toBe(DEPLETED);
    expect(leftover).toBe(0);
  });
  it('N8.3 over-repay all debts → leftover becomes a NEW positive batch', () => {
    const { repayPlan, leftover } = applyNegativeRepay(negBatches, 20); // debt total 15
    expect(repayPlan).toHaveLength(2);
    expect(leftover).toBe(5); // 20 - 15 → new batch
    expect(resolveBatchStatusForRemaining(buildQtyNumeric(leftover).remaining)).toBe(ACTIVE);
  });
  it('N8.4 no negatives present → no repay, full incoming is leftover (fresh batch)', () => {
    const { repayPlan, leftover } = applyNegativeRepay(
      [{ batchId: 'P', qty: { remaining: 5, total: 5 }, createdAt: '2026-01-01' }], 8);
    expect(repayPlan).toHaveLength(0);
    expect(leftover).toBe(8);
  });
});

// ─── N9 — reverse (revive-only; never newly-depletes a negative) ─────────────
describe('V138.N9 — reverse adds qty back; reverseQtyNumeric caps at total', () => {
  it('N9.1 reverse a deduct restores remaining (cap at total)', () => {
    const q = reverseQtyNumeric({ remaining: 0, total: 10 }, 5);
    expect(q.remaining).toBe(5);
    expect(resolveBatchStatusForRemaining(q.remaining)).toBe(ACTIVE);
  });
});

// ─── N10 — source-grep regression (the fix is wired everywhere; no <= 0 left) ─
describe('V138.N10 — source-grep regression locks the fix', () => {
  it('N10.1 backendClient.js has ZERO `<= 0 ? BATCH_STATUS.DEPLETED` (the bug pattern)', () => {
    expect(backendSrc).not.toMatch(/<=\s*0\s*\?\s*BATCH_STATUS\.DEPLETED/);
  });
  it('N10.2 stockUtils exports resolveBatchStatusForRemaining with the === 0 invariant', () => {
    expect(stockUtilsSrc).toMatch(/export function resolveBatchStatusForRemaining/);
    expect(stockUtilsSrc).toMatch(/===\s*0\s*\?\s*BATCH_STATUS\.DEPLETED\s*:\s*BATCH_STATUS\.ACTIVE/);
  });
  it('N10.3 resolveBatchStatusForRemaining is CALLED at all 6 wired writer sites', () => {
    const calls = (backendSrc.match(/resolveBatchStatusForRemaining\(/g) || []).length;
    expect(calls).toBeGreaterThanOrEqual(6); // 6935 + 7662 + 7730 + transfer + withdrawal + repay
  });
  it('N10.4 anti-negative: negative push gated to treatment|sale (2 occurrences)', () => {
    const gates = (backendSrc.match(/context === 'treatment' \|\| context === 'sale'/g) || []).length;
    expect(gates).toBeGreaterThanOrEqual(2);
  });
  it('N10.5 anti-negative: non-treatment/sale shortfall THROWS (fail-loud)', () => {
    expect(backendSrc).toMatch(/context !== 'treatment' && context !== 'sale'/);
    expect(backendSrc).toMatch(/Stock insufficient for/);
  });
  it('N10.6 anti-negative: transfer + withdrawal export GUARD before-vs-qty (block negative)', () => {
    const guards = (backendSrc.match(/if \(before < item\.qty\) throw/g) || []).length;
    expect(guards).toBeGreaterThanOrEqual(2); // transfer export + withdrawal export
  });
  it('N10.7 balance reader INCLUDES active batches (so negative MUST stay active to show) — V143/V143-ter', () => {
    // V143 broadened the reader to status ∈ {active, depleted} (show drained-to-0 products);
    // V143-ter moved it to the LIVE listenToStockBatchesByBranch. Negatives are 'active'
    // (remaining<0 stays active per resolveBatchStatusForRemaining) → still shown. The
    // negative-stays-active invariant is exactly what keeps them in the balance.
    expect(balancePanelSrc).toMatch(/listenToStockBatchesByBranch\(\{ branchId: locationId \}/);
    expect(balancePanelSrc).toMatch(/b\.status === 'active' \|\| b\.status === 'depleted'/);
    // anti-regression: the old active-only one-shot query must NOT come back
    expect(balancePanelSrc).not.toMatch(/listStockBatches\(\{\s*branchId:\s*locationId,\s*status:\s*'active'\s*\}\)/);
  });
  it('N10.8 _repayNegativeBalances filters status:ACTIVE (so negative MUST stay active to be repayable)', () => {
    // the repay sweep reads active batches then applyNegativeRepay picks remaining<0
    expect(backendSrc).toMatch(/applyNegativeRepay/);
    expect(backendSrc).toMatch(/status:\s*BATCH_STATUS\.ACTIVE,/);
  });
});

// ─── N11 — anti-negative direction matrix (the user's "ทุกทิศทาง") ───────────
describe('V138.N11 — anti-negative direction matrix: ONLY TFP-treatment + sale may go negative', () => {
  // Declarative truth table verified against the source patterns above.
  const DIRECTIONS = [
    { name: 'TFP treatment deduct', canGoNegative: true,  enforcedBy: "context === 'treatment' negative push" },
    { name: 'sale deduct',          canGoNegative: true,  enforcedBy: "context === 'sale' negative push" },
    { name: 'adjust REDUCE',        canGoNegative: false, enforcedBy: 'deductQtyNumeric throws' },
    { name: 'transfer export',      canGoNegative: false, enforcedBy: 'before < qty guard + deductQtyNumeric' },
    { name: 'withdrawal export',    canGoNegative: false, enforcedBy: 'before < qty guard + deductQtyNumeric' },
    { name: 'import / receive',     canGoNegative: false, enforcedBy: 'add-only (repays negatives, never subtracts)' },
    { name: 'manual / other context', canGoNegative: false, enforcedBy: 'shortfall throws (fail-loud)' },
  ];
  it('N11.1 only 2 directions allow negative (treatment + sale)', () => {
    expect(DIRECTIONS.filter((d) => d.canGoNegative).map((d) => d.name).sort())
      .toEqual(['TFP treatment deduct', 'sale deduct']);
  });
  it('N11.2 every block-negative direction has a structural enforcer in source', () => {
    // adjust-reduce + transfer + withdrawal all rely on deductQtyNumeric / guard
    expect(backendSrc).toMatch(/deductQtyNumeric\(batch\.qty, qty\)/);      // adjust reduce
    expect(backendSrc).toMatch(/deductQtyNumeric\(b\.qty, item\.qty\)/);    // transfer + withdrawal export
  });
});

// ─── N12 — Tier-2 artifacts present (AV158 + heal script) ────────────────────
describe('V138.N12 — Tier-2 artifacts', () => {
  it('N12.1 AV158 invariant documented in audit-anti-vibe-code', () => {
    const av = readFileSync(join(__dirname, '../.agents/skills/audit-anti-vibe-code/SKILL.md'), 'utf8');
    expect(av).toMatch(/AV158/);
    expect(av).toMatch(/resolveBatchStatusForRemaining/);
  });
  it('N12.2 heal migration script exists (Rule M two-phase)', () => {
    const heal = readFileSync(join(__dirname, '../scripts/heal-negative-batch-wrongly-depleted.mjs'), 'utf8');
    expect(heal).toMatch(/status === 'depleted' && Number\.isFinite\(remaining\) && remaining < 0/);
    expect(heal).toMatch(/--apply/);
  });
});
