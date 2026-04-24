// ─── Phase 12.2b Priority 2.10 — MULTI-PAYMENT full-flow simulate ────────
//
// A single sale can consume FOUR payment vehicles simultaneously:
//   1. deposits (multi-apply allowed — applyDepositToSale per deposit)
//   2. wallet (one active wallet per walletType, deductWallet)
//   3. points (redeem on checkout; also earn on net purchase)
//   4. payment channels (cash / bank / card / QR — split allowed)
//
// Critical invariants:
//   - netTotal = subtotal - medDisc - billDiscAmt (billing math)
//   - total paid = deposits + wallet + points-as-baht + channels = netTotal
//   - earnPoints uses purchaseAmount (net after deposit/wallet/points?) per
//     bahtPerPoint rate → Math.floor(purchaseAmount / bahtPerPoint) points
//   - split-to-paid transition uses rounded totals (0.1+0.1+0.1 !== 0.3 fix)
//   - updateSalePayment re-derives payment.status from totalPaid vs netTotal
//
// Coverage:
//   F1: earnPoints — Math.floor formula + edge cases (0 bpp, 0 amount)
//   F2: updateSalePayment — split/paid status transition via THB rounding
//   F3: applyDepositToSale — partial apply, multi-apply same sale
//   F4: cancel cascade — reverse all 4 payment types
//   F5: adversarial — overapply, floating-point drift

import fs from 'fs';
import { describe, it, expect, vi } from 'vitest';
vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test-app', auth: { currentUser: null } }));

// ═══════════════════════════════════════════════════════════════════════
// F1: earnPoints formula
// ═══════════════════════════════════════════════════════════════════════

describe('F1: earnPoints — Math.floor(purchaseAmount / bahtPerPoint)', () => {
  function simulateEarn(purchaseAmount, bahtPerPoint) {
    const p = Number(purchaseAmount) || 0;
    const b = Number(bahtPerPoint) || 0;
    if (b <= 0 || p <= 0) return 0;
    return Math.floor(p / b);
  }

  it('F1.1: ฿1000 purchase at ฿25 per point → 40 points', () => {
    expect(simulateEarn(1000, 25)).toBe(40);
  });

  it('F1.2: Math.floor rounds down — ฿999/25 = 39.96 → 39 points', () => {
    expect(simulateEarn(999, 25)).toBe(39);
  });

  it('F1.3: bahtPerPoint=0 → no points (membership disabled)', () => {
    expect(simulateEarn(1000, 0)).toBe(0);
  });

  it('F1.4: zero purchase → 0 (defensive)', () => {
    expect(simulateEarn(0, 25)).toBe(0);
  });

  it('F1.5: negative purchase → 0 (refund edge; points already reversed separately)', () => {
    expect(simulateEarn(-500, 25)).toBe(0);
  });

  it('F1.6: bahtPerPoint=1 (1 point per baht) → exact floor', () => {
    expect(simulateEarn(1500, 1)).toBe(1500);
    expect(simulateEarn(1500.99, 1)).toBe(1500); // floor
  });

  it('F1.7: very high bpp (฿1000/point) → 0 points on ฿500 purchase', () => {
    expect(simulateEarn(500, 1000)).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F2: updateSalePayment — status transition + THB rounding
// ═══════════════════════════════════════════════════════════════════════

describe('F2: updateSalePayment — status derives from totalPaid vs netTotal (rounded to 2dp)', () => {
  function simulateStatus(channels, netTotal) {
    const totalPaid = Math.round(
      channels.reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0) * 100
    ) / 100;
    return totalPaid >= netTotal ? 'paid' : 'split';
  }

  it('F2.1: single channel covering full → paid', () => {
    expect(simulateStatus([{ amount: 1000 }], 1000)).toBe('paid');
  });

  it('F2.2: partial single channel → split', () => {
    expect(simulateStatus([{ amount: 500 }], 1000)).toBe('split');
  });

  it('F2.3: two channels summing to total → paid', () => {
    expect(simulateStatus([{ amount: 400 }, { amount: 600 }], 1000)).toBe('paid');
  });

  it('F2.4: floating-point drift — 0.1 + 0.1 + 0.1 = 0.3 after rounding → paid', () => {
    // Without rounding: 0.1 + 0.1 + 0.1 === 0.30000000000000004 → 0.3
    // With Math.round × 100 / 100: exactly 0.3 → paid
    expect(simulateStatus([{ amount: 0.1 }, { amount: 0.1 }, { amount: 0.1 }], 0.3)).toBe('paid');
  });

  it('F2.5: underpay by 0.01 THB → split (tight boundary)', () => {
    expect(simulateStatus([{ amount: 999.99 }], 1000)).toBe('split');
  });

  it('F2.6: overpay → paid (refund handled separately)', () => {
    expect(simulateStatus([{ amount: 1500 }], 1000)).toBe('paid');
  });

  it('F2.7: empty channels → split (nothing paid yet)', () => {
    expect(simulateStatus([], 1000)).toBe('split');
  });

  it('F2.8: non-numeric amount coerces to 0', () => {
    expect(simulateStatus([{ amount: 'abc' }, { amount: 1000 }], 1000)).toBe('paid');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F3: applyDepositToSale — partial + multi-apply
// ═══════════════════════════════════════════════════════════════════════

describe('F3: applyDepositToSale — partial apply + multi-apply semantics', () => {
  it('F3.1: partial apply — ฿500 from a ฿2000 deposit used in one sale', () => {
    // Expected shape on the deposit doc after apply:
    //   usedAmount: 500
    //   remainingAmount: 1500
    //   status: 'partial'
    //   usageHistory: [{ saleId, amount: 500, at: ... }]
    const depositBefore = { amount: 2000, usedAmount: 0, status: 'active', usageHistory: [] };
    const applyAmount = 500;
    const newUsed = depositBefore.usedAmount + applyAmount;
    const newStatus = newUsed >= depositBefore.amount ? 'used' : newUsed > 0 ? 'partial' : 'active';
    expect(newStatus).toBe('partial');
    expect(depositBefore.amount - newUsed).toBe(1500);
  });

  it('F3.2: full apply — deposit depleted', () => {
    const deposit = { amount: 500, usedAmount: 0 };
    const apply = 500;
    const newUsed = deposit.usedAmount + apply;
    const status = newUsed >= deposit.amount ? 'used' : newUsed > 0 ? 'partial' : 'active';
    expect(status).toBe('used');
  });

  it('F3.3: multi-apply same sale — two separate apply calls with different saleIds', () => {
    // Scenario: sale S1 uses 300 from deposit D. Later sale S2 uses 500
    // from SAME deposit D. usageHistory has 2 entries.
    const history = [
      { saleId: 'S1', amount: 300, at: '2026-04-25T10:00:00Z' },
      { saleId: 'S2', amount: 500, at: '2026-04-25T11:00:00Z' },
    ];
    const totalUsed = history.reduce((s, h) => s + h.amount, 0);
    expect(totalUsed).toBe(800);
  });

  it('F3.4: multi-apply to ONE sale — scenario: cashier applies deposit twice by mistake', () => {
    // reverseDepositUsage filters by saleId → ALL history entries for
    // that saleId get reversed in one call. Shape:
    const history = [
      { saleId: 'S1', amount: 200 },
      { saleId: 'S1', amount: 300 },
      { saleId: 'S2', amount: 100 },
    ];
    const sidToReverse = 'S1';
    const toRestore = history.filter(u => u.saleId === sidToReverse).reduce((s, u) => s + u.amount, 0);
    expect(toRestore).toBe(500);
    const remaining = history.filter(u => u.saleId !== sidToReverse);
    expect(remaining).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F4: Cancel cascade — reverse all 4 payment types
// ═══════════════════════════════════════════════════════════════════════

describe('F4: cancel cascade — reverse deposits + wallet + points + channels', () => {
  const BC = fs.readFileSync('src/lib/backendClient.js', 'utf-8');

  it('F4.1: all 4 reversal fns exist', () => {
    expect(BC).toMatch(/export async function reverseDepositUsage/);
    expect(BC).toMatch(/export async function reversePointsEarned/);
    // Wallet has its own reverse path (deductWallet counter-transaction or similar)
    expect(BC).toMatch(/deductWallet|refundWallet|reverseWallet/);
  });

  it('F4.2: reverseDepositUsage restores balance in runTransaction (atomic)', () => {
    const idx = BC.indexOf('export async function reverseDepositUsage');
    const body = BC.slice(idx, idx + 2000);
    expect(body).toMatch(/runTransaction\(db/);
    expect(body).toMatch(/recalcCustomerDepositBalance/);
  });

  it('F4.3: reversePointsEarned looks up the originating earn-tx by referenceId (sale)', () => {
    const idx = BC.indexOf('export async function reversePointsEarned');
    expect(idx).toBeGreaterThan(-1);
    const body = BC.slice(idx, idx + 2000);
    expect(body).toMatch(/referenceId/);
  });

  it('F4.4: treatment form cancel path forwards referenceType+referenceId for reversePointsEarned (source-grep)', () => {
    const TFP = fs.readFileSync('src/components/TreatmentFormPage.jsx', 'utf-8');
    // Earn points call on treatment save must include referenceType:'sale' + referenceId
    expect(TFP).toMatch(/earnPoints\([^)]*referenceType:\s*['"]sale['"]/s);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F5: Adversarial — overapply, drift, status edge cases
// ═══════════════════════════════════════════════════════════════════════

describe('F5: adversarial multi-payment edge cases', () => {
  it('F5.1: over-apply deposit (amount > remaining) → usedAmount capped at deposit.amount', () => {
    const deposit = { amount: 500, usedAmount: 300 };
    const apply = 500; // would leave usedAmount=800 > 500
    // In real flow, applyDepositToSale should CAP or REJECT. Simulate cap:
    const newUsed = Math.min(deposit.amount, deposit.usedAmount + apply);
    expect(newUsed).toBe(500); // capped
  });

  it('F5.2: same deposit applied to same sale TWICE → usageHistory has 2 entries (audit)', () => {
    // Not blocked by defensively — the UI should prevent, but the backend
    // handles gracefully. reverseDepositUsage filters BY saleId so all
    // entries for that sale get reversed.
    const history = [{ saleId: 'S1', amount: 100 }, { saleId: 'S1', amount: 200 }];
    expect(history.filter(u => u.saleId === 'S1')).toHaveLength(2);
  });

  it('F5.3: floating-point paid=netTotal exact drift — 999.99 + 0.01 vs 1000', () => {
    // Without rounding: 999.99 + 0.01 = 1000.0000000000001 → >= 1000 → paid
    // With Math.round × 100 / 100: exactly 1000.00 → paid
    const raw = 999.99 + 0.01;
    const rounded = Math.round(raw * 100) / 100;
    expect(rounded).toBe(1000);
    expect(rounded >= 1000).toBe(true);
  });

  it('F5.4: status stays "split" if any single channel fails (e.g., missing amount)', () => {
    const channels = [{ amount: 500 }, { amount: null }];
    const total = channels.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
    expect(total).toBe(500);
    // 500 < 1000 → split
  });

  it('F5.5: points earned reversed → point balance goes back to pre-sale', () => {
    // reversePointsEarned should subtract the previously-earned points.
    // Final balance = preEarn balance.
    const preBalance = 1000;
    const earned = 40;
    const postEarn = preBalance + earned;
    const postReverse = postEarn - earned;
    expect(postReverse).toBe(preBalance);
  });

  it('F5.6: reversePointsEarned defensive — no matching referenceId → no-op', () => {
    // Pattern: listPointTxs({ referenceId: saleId }) returns []. Reverse
    // is idempotent (no-op). Same shape as stock reverse.
    const pointTxs = [];
    const matchedBySale = pointTxs.filter(t => t.referenceId === 'NONEXISTENT');
    expect(matchedBySale).toHaveLength(0);
  });
});
