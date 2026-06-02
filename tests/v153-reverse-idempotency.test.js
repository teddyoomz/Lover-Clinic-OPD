// V153 — reverse/refund idempotency (money-leak class; sibling of M1/S5).
//
// Bug (confirmed real-prod, scripts/e2e-reverse-idempotency.mjs):
//   reversePointsEarned summed type==='earn' ONLY (ignored prior 'reverse'
//     txns) → re-reversed loyalty points on every call.
//   refundToWallet had no referenceId dedup → credited the wallet again.
//   Trigger: cancel a sale (reverses wallet+points) then DELETE the cancelled
//   sale (handleDelete reverses AGAIN); or a cancel retry after cancelBackendSale
//   threw. → wallet over-credited (real baht) + points over-reversed.
//
// Fix (backendClient.js): reversePointsEarned nets earn − already-reversed;
//   refundToWallet skips when a refund txn for the same (customer,walletType,
//   referenceId) already exists. Behavioural proof = the real-prod e2e; this
//   bank locks the source contract + the net-reverse math (V21 drift guard).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SRC = readFileSync(path.resolve(process.cwd(), 'src/lib/backendClient.js'), 'utf8');
function fnBody(name) {
  const start = SRC.indexOf(`export async function ${name}`);
  if (start < 0) throw new Error(`fn ${name} not found`);
  return SRC.slice(start, start + 4400); // V158 grew refundToWallet/reversePointsEarned (legacy seed + in-tx marker)
}

describe('V153.A — reversePointsEarned nets earn − already-reversed (idempotent)', () => {
  const body = fnBody('reversePointsEarned');
  it('A1 sums earn into earnedSum', () => {
    expect(body).toMatch(/if\s*\(\s*tx\.type\s*===\s*'earn'\s*\)\s*earnedSum\s*\+=/);
  });
  it('A2 sums prior reverse txns into alreadyReversed', () => {
    expect(body).toMatch(/else if\s*\(\s*tx\.type\s*===\s*'reverse'\s*\)\s*alreadyReversed\s*\+=/);
  });
  it('A3 totalReversed = max(0, earnedSum - alreadyReversed)', () => {
    expect(body).toMatch(/Math\.max\(\s*0\s*,\s*earnedSum\s*-\s*alreadyReversed\s*\)/);
  });
  it('A4 anti-regression: old earn-only continue pattern is gone', () => {
    expect(body).not.toMatch(/if\s*\(\s*tx\.type\s*!==\s*'earn'\s*\)\s*continue/);
  });
  it('A5 carries the V153 marker', () => {
    expect(body).toMatch(/V153/);
  });
});

describe('V153.B — refundToWallet refunds only up to NET outstanding (idempotent + edit-safe)', () => {
  const body = fnBody('refundToWallet');
  it('B1 queries the sale-ref txns and sums deduct vs refund', () => {
    expect(body).toMatch(/where\(\s*'referenceId'\s*,\s*'=='\s*,\s*refId\s*\)/);
    expect(body).toMatch(/if\s*\(\s*t\.type === 'deduct'\s*\)\s*deducted/);
    expect(body).toMatch(/else if\s*\(\s*t\.type === 'refund'\s*\)\s*refunded/);
  });
  it('B2 short-circuits IN-tx when nothing is outstanding (V158 marker / legacy seed)', () => {
    // V158: the short-circuit moved INSIDE the tx and reads the saleNet marker
    // (or the legacyOutstanding seed for pre-V158 wallets) — was the pre-tx
    // `if (deducted - refunded < amt)` query guard (not concurrency-safe, R16).
    expect(body).toMatch(/legacyOutstanding = deducted - refunded;/);
    expect(body).toMatch(/if \(refId && outstanding < amt\) return \{ before, after: before, skipped: true \}/);
  });
  it('B3 only guards when referenceId is present (generic refunds still allowed)', () => {
    expect(body).toMatch(/const refId = String\(referenceId \|\| ''\);/);
    expect(body).toMatch(/if\s*\(\s*refId\s*\)\s*\{/);
  });
  it('B4 anti-regression: NOT the old "skip if any refund txn exists" shape', () => {
    expect(body).not.toMatch(/!dupSnap\.empty/);
  });
  it('B5 still writes the atomic balance+txlog (M5) for a valid refund', () => {
    expect(body).toMatch(/runTransaction/);
    expect(body).toMatch(/type:\s*'refund'/);
  });
  it('B6 carries the V153 marker', () => { expect(body).toMatch(/V153/); });
});

// Pure-logic mirrors of the two guards — exhaustive on the repeat/partial cases.
function netToReverse(earnAmts, reverseAmts) {
  const earned = earnAmts.reduce((s, a) => s + a, 0);
  const already = reverseAmts.reduce((s, a) => s + a, 0);
  return Math.max(0, earned - already);
}
// wallet refund is allowed only up to the net still-deducted for the sale.
function refundAllowed(deducted, refunded, amt) {
  return deducted - refunded >= amt;
}

describe('V153.C — net-reverse math is idempotent + correct', () => {
  it('C1 first reverse subtracts the full earned amount', () => {
    expect(netToReverse([50], [])).toBe(50);
  });
  it('C2 second reverse is a no-op (already fully reversed)', () => {
    expect(netToReverse([50], [50])).toBe(0);
  });
  it('C3 third+ reverse stays a no-op', () => {
    expect(netToReverse([50], [50, 0])).toBe(0);
  });
  it('C4 multi-earn for one sale reverses the sum, once', () => {
    expect(netToReverse([30, 20], [])).toBe(50);
    expect(netToReverse([30, 20], [50])).toBe(0);
  });
  it('C5 a partial prior reverse leaves the remainder (never negative)', () => {
    expect(netToReverse([50], [20])).toBe(30);
    expect(netToReverse([50], [80])).toBe(0); // over-reversed history → clamp 0
  });
  it('C6 nothing earned → nothing to reverse', () => {
    expect(netToReverse([], [])).toBe(0);
  });
});

describe('V153.D — wallet refund is net-outstanding (idempotent + edit-safe)', () => {
  it('D1 first refund (outstanding 100) is allowed', () => {
    expect(refundAllowed(100, 0, 100)).toBe(true);
  });
  it('D2 duplicate refund (cancel→delete, outstanding 0) is a no-op', () => {
    expect(refundAllowed(100, 100, 100)).toBe(false);
  });
  it('D3 EDIT case: a re-deduct restores outstanding → next refund allowed', () => {
    expect(refundAllowed(200, 100, 100)).toBe(true);
  });
  it('D4 cannot refund more than outstanding', () => {
    expect(refundAllowed(100, 50, 100)).toBe(false);
  });
});

describe('V153.E — real-prod e2e proof exists', () => {
  it('E1 e2e-reverse-idempotency.mjs is present', () => {
    const e2e = readFileSync(path.resolve(process.cwd(), 'scripts/e2e-reverse-idempotency.mjs'), 'utf8');
    expect(e2e).toMatch(/refundToWallet/);
    expect(e2e).toMatch(/reversePointsEarned/);
    expect(e2e).toMatch(/idempoten/i);
  });
});
