// V154 — reverseDepositUsage must honor prior manual refundAmount (M17, M3-family).
//
// Bug (confirmed real-prod, scripts/e2e-deposit-refund-reverse.mjs):
//   reverseDepositUsage recomputed newRemaining = amount − newUsed, OMITTING
//   the refundAmount term. Deposit invariant is remaining = amount − used −
//   refundAmount. A deposit partially APPLIED to a sale AND partially manual-
//   REFUNDED, then the sale cancelled → reverse restored the full amount and
//   FORGOT the refund → phantom deposit balance (re-spendable money).
// Fix: newRemaining = amount − newUsed − refundAmount.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SRC = readFileSync(path.resolve(process.cwd(), 'src/lib/backendClient.js'), 'utf8');
function fnBody(name) {
  const s = SRC.indexOf(`export async function ${name}`);
  if (s < 0) throw new Error(`fn ${name} not found`);
  return SRC.slice(s, s + 2200);
}

describe('V154.A — reverseDepositUsage honors refundAmount (M17)', () => {
  const body = fnBody('reverseDepositUsage');
  it('A1 newRemaining subtracts refundAmount', () => {
    expect(body).toMatch(/newRemaining\s*=\s*\(Number\(cur\.amount\)\s*\|\|\s*0\)\s*-\s*newUsed\s*-\s*\(Number\(cur\.refundAmount\)\s*\|\|\s*0\)/);
  });
  it('A2 anti-regression: old `amount - newUsed;` (no refund term) is gone', () => {
    expect(body).not.toMatch(/newRemaining\s*=\s*\(Number\(cur\.amount\)\s*\|\|\s*0\)\s*-\s*newUsed\s*;/);
  });
  it('A3 carries the V154 marker', () => { expect(body).toMatch(/V154/); });
});

// Pure-logic mirror of the corrected balance recomputation.
function remainingAfterReverse({ amount, usedAmount, refundAmount, restoreAmt }) {
  const newUsed = Math.max(0, usedAmount - restoreAmt);
  return Math.max(0, amount - newUsed - refundAmount);
}

describe('V154.B — deposit conservation (remaining = amount − used − refund)', () => {
  it('B1 apply 500 + refund 200 then reverse the 500 → 800 (NOT 1000)', () => {
    expect(remainingAfterReverse({ amount: 1000, usedAmount: 500, refundAmount: 200, restoreAmt: 500 })).toBe(800);
  });
  it('B2 no refund → reverse restores full balance', () => {
    expect(remainingAfterReverse({ amount: 1000, usedAmount: 400, refundAmount: 0, restoreAmt: 400 })).toBe(1000);
  });
  it('B3 a refund with no matching usage to reverse leaves remaining = amount − refund', () => {
    expect(remainingAfterReverse({ amount: 1000, usedAmount: 0, refundAmount: 300, restoreAmt: 0 })).toBe(700);
  });
  it('B4 clamps at 0, never negative', () => {
    expect(remainingAfterReverse({ amount: 500, usedAmount: 500, refundAmount: 600, restoreAmt: 500 })).toBe(0);
  });
});

describe('V154.C — real-prod e2e proof exists', () => {
  it('C1 e2e-deposit-refund-reverse.mjs is present', () => {
    const e2e = readFileSync(path.resolve(process.cwd(), 'scripts/e2e-deposit-refund-reverse.mjs'), 'utf8');
    expect(e2e).toMatch(/reverseDepositUsage/);
    expect(e2e).toMatch(/refundDeposit/);
  });
});
