// V158 (2026-06-03) — concurrency-safe reverse via per-reference net markers
// (finance.pointsSaleNet / wallet saleNet). R16 found that V153's idempotency
// guards (Σdeduct−Σrefund / Σearn−Σreverse QUERIES) are NOT concurrency locks:
// two CONCURRENT cancel cascades on the SAME sale (double-click / two admins)
// both read the same sums and double-reverse → wallet over-refunded (real money
// LEAK) + loyalty points over-reversed. Fix: the authoritative dedup now reads a
// per-reference net marker stored ON the doc, maintained IN-tx by the deduct/earn
// side, so Firestore OCC serializes the two reverses (the 2nd re-reads the
// decremented marker → reverses 0). The legacy Σ query is kept ONLY as a SEED for
// pre-V158 references that carry no marker. iron-clad Rule T (concurrency-RMW).
//
// Layers: source-grep locks (both halves) + a pure in-tx-marker simulation that
// reproduces the concurrent double-reverse → exactly-once invariant.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SRC = readFileSync(path.resolve(process.cwd(), 'src/lib/backendClient.js'), 'utf8');

// ── pure mirrors of the in-tx marker logic (must match backendClient.js) ──────
// Semantics-neutral: track ONLY the per-reference net marker `sn` + how much each
// reverse APPLIED. Wallet (refund adds) and points (reverse subtracts) maintain
// the marker identically — the balance direction is irrelevant to the dedup, so
// it is intentionally omitted. `applied` is the net actually reversed.
function reverseOnce(sn, refId, legacySeed) {
  const hasMarker = Object.prototype.hasOwnProperty.call(sn, refId);
  const markerVal = hasMarker ? (Number(sn[refId]) || 0) : legacySeed;
  const outstanding = Math.max(0, markerVal);
  if (outstanding <= 0) return { sn, applied: 0 };
  return { sn: { ...sn, [refId]: markerVal - outstanding }, applied: outstanding };
}
function applyOnce(sn, refId, amt) {
  return { ...sn, [refId]: (Number(sn[refId]) || 0) + amt };
}
// SERIALIZED concurrency: Firestore OCC makes two concurrent same-doc txns run
// one-after-another (the loser retries on the winner's committed state). So a
// concurrent double-reverse == reverseOnce applied twice in sequence.
function concurrentDoubleReverse(sn, refId, legacySeed) {
  const r1 = reverseOnce(sn, refId, legacySeed);
  const r2 = reverseOnce(r1.sn, refId, legacySeed);
  return { sn: r2.sn, totalApplied: r1.applied + r2.applied, txns: (r1.applied > 0 ? 1 : 0) + (r2.applied > 0 ? 1 : 0) };
}

describe('V158.A — source-grep: deductWallet maintains the saleNet marker in-tx', () => {
  it('A1 — deductWallet increments saleNet[refId] inside the tx', () => {
    expect(SRC).toMatch(/if \(dRef\) patch\[`saleNet\.\$\{dRef\}`\] = \(Number\(cur\.saleNet\?\.\[dRef\]\) \|\| 0\) \+ amt;/);
  });
});

describe('V158.B — source-grep: refundToWallet dedups on the saleNet marker (seed = legacy Σ)', () => {
  it('B1 — keeps the legacyOutstanding seed for pre-V158 wallets (no marker)', () => {
    expect(SRC).toMatch(/let legacyOutstanding = Infinity;/);
    expect(SRC).toMatch(/legacyOutstanding = deducted - refunded;/);
  });
  it('B2 — reads the saleNet marker IN-tx (hasMarker) — not the query', () => {
    expect(SRC).toMatch(/const hasMarker = !!\(refId && cur\.saleNet && Object\.prototype\.hasOwnProperty\.call\(cur\.saleNet, refId\)\);/);
    expect(SRC).toMatch(/const outstanding = refId \? \(hasMarker \? \(Number\(cur\.saleNet\[refId\]\) \|\| 0\) : legacyOutstanding\) : Infinity;/);
  });
  it('B3 — decrements the marker by the amount refunded', () => {
    expect(SRC).toMatch(/if \(refId\) patch\[`saleNet\.\$\{refId\}`\] = outstanding - amt;/);
  });
});

describe('V158.C — source-grep: _earnPointsInternal maintains finance.pointsSaleNet in-tx', () => {
  it('C1 — referenced earns increment finance.pointsSaleNet[refId] in-tx', () => {
    expect(SRC).toMatch(/if \(_pRef\) _upd\[`finance\.pointsSaleNet\.\$\{_pRef\}`\] = \(Number\(fin\.pointsSaleNet\?\.\[_pRef\]\) \|\| 0\) \+ amt;/);
  });
  it('C2 — carries the V158 rationale comment (institutional memory)', () => {
    expect(SRC).toMatch(/V158[\s\S]{0,160}pointsSaleNet/);
  });
});

describe('V158.D — source-grep: reversePointsEarned dedups on the marker (seed = legacy Σ)', () => {
  it('D1 — legacyOutstanding seed kept for pre-V158 sales (no marker)', () => {
    expect(SRC).toMatch(/const legacyOutstanding = Math\.max\(0, earnedSum - alreadyReversed\);/);
  });
  it('D2 — reads finance.pointsSaleNet marker IN-tx', () => {
    expect(SRC).toMatch(/const hasMarker = !!\(fin\.pointsSaleNet && Object\.prototype\.hasOwnProperty\.call\(fin\.pointsSaleNet, refId\)\);/);
    expect(SRC).toMatch(/const markerVal = hasMarker \? \(Number\(fin\.pointsSaleNet\[refId\]\) \|\| 0\) : legacyOutstanding;/);
  });
  it('D3 — decrements the marker by the amount reversed', () => {
    expect(SRC).toMatch(/\[`finance\.pointsSaleNet\.\$\{refId\}`\]: markerVal - outstanding,/);
  });
  it('D4 — anti-regression: NOT solely the pre-V153 Σearn query (must read the marker)', () => {
    // pre-V153 used totalReversed from the query directly; V158 must read the marker.
    expect(SRC).toMatch(/pointsSaleNet\[refId\]/);
  });
});

describe('V158.E — pure logic: marker dedup makes a CONCURRENT double-reverse exactly-once', () => {
  it('E1 — marker present (post-V158 sale): concurrent double-reverse reverses ONCE', () => {
    // sale's net for S1 = 200 (marker). Two cancel cascades fire at once.
    const r = concurrentDoubleReverse({ S1: 200 }, 'S1', /* seed */ 999);
    expect(r.totalApplied).toBe(200);   // exactly once — NOT 400 (no double-refund/over-reverse)
    expect(r.txns).toBe(1);             // exactly one reverse txn
    expect(r.sn.S1).toBe(0);            // marker drained
  });
  it('E2 — legacy ref (no marker): seed reverses once, then marker=0 blocks the 2nd', () => {
    // pre-V158 sale: no marker; legacy seed = Σdeduct−Σrefund (or Σearn−Σreverse) = 200.
    const r = concurrentDoubleReverse({}, 'LEGACY', 200);
    expect(r.totalApplied).toBe(200);   // 1st uses the seed + writes marker=0; 2nd sees marker → 0
    expect(r.txns).toBe(1);
    expect(r.sn.LEGACY).toBe(0);
  });
  it('E3 — edit (reverse→re-earn) then concurrent cancel: only the LIVE amount reverses', () => {
    let sn = { S1: 50 };                  // earned 50 (marker 50)
    sn = reverseOnce(sn, 'S1', 999).sn;   // edit reverse → marker 0
    sn = applyOnce(sn, 'S1', 30);         // re-earn 30 → marker 30
    const r = concurrentDoubleReverse(sn, 'S1', 999); // concurrent cancel ×2
    expect(r.totalApplied).toBe(30);      // only the live 30 reverses, once (not 50, not 60)
    expect(r.txns).toBe(1);
    expect(r.sn.S1).toBe(0);
  });
  it('E4 — already-cancelled (marker 0): both concurrent reverses are NO-OP', () => {
    const r = concurrentDoubleReverse({ S1: 0 }, 'S1', 999);
    expect(r.totalApplied).toBe(0);
    expect(r.txns).toBe(0);
    expect(r.sn.S1).toBe(0);
  });
});
