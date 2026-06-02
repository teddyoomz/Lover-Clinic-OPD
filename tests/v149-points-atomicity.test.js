// V149 (2026-06-02) — loyalty-points read-modify-write atomicity.
// SOURCE-GREP regression lock (shape). BEHAVIOR proven by the real-prod L2 e2e
// scripts/e2e-points-concurrency.mjs (concurrent earn×2 → 110 / deduct×2 → 90
// BEFORE = lost-update/over-credit; → 120 / 80 AFTER). Per Rule Q, mocks are
// shape-coverage only; the e2e is the behavior proof.
//
// Bug: getPointBalance reads the SUMMARY finance.loyaltyPoints (NOT a ledger
// sum), and the 3 points-mutators (_earnPointsInternal [fires on every sale],
// adjustPoints deduct, reversePointsEarned) did getPointBalance → setDoc(ledger)
// → updateDoc({finance.loyaltyPoints}) with NO transaction → two concurrent
// point ops both read the same `before`, both write `after` → last write wins
// → points earned/spent LOST (loyalty currency wrong). The Rule-T concurrency-
// RMW class (V147 stock, V148 courses, V149 points). Wallet was already atomic
// (M5); points was missed.
// Fix: each of the 3 mutators reads finance.loyaltyPoints INSIDE a
// runTransaction (tx.get(customerDoc) → tx.update + tx.set(pointTxDoc)), with
// the deduct over-spend guard re-checked in-tx.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SRC = readFileSync(path.resolve(process.cwd(), 'src/lib/backendClient.js'), 'utf8');

function fnBody(name) {
  const start = SRC.indexOf(`function ${name}(`);
  expect(start, `${name} not found`).toBeGreaterThan(-1);
  const next = SRC.indexOf('\nexport ', start + 30);
  const next2 = SRC.indexOf('\nasync function ', start + 30);
  const end = Math.min(...[next, next2].filter(n => n > start));
  return SRC.slice(start, Number.isFinite(end) ? end : start + 4000);
}

describe('V149 — loyalty-points atomic RMW (source-grep lock)', () => {
  for (const fn of ['_earnPointsInternal', 'adjustPoints', 'reversePointsEarned']) {
    it(`V149 — ${fn} reads finance.loyaltyPoints INSIDE a runTransaction`, () => {
      const body = fnBody(fn);
      expect(body).toContain('runTransaction(db, async (tx) =>');
      expect(body).toMatch(/await tx\.get\(cRef\)/);
      expect(body).toMatch(/finance\.loyaltyPoints/);
      // V158: earn/reverse build the update object separately (_upd) or add the
      // finance.pointsSaleNet marker key, so the summary write is no longer a
      // single inline literal — assert the in-tx tx.update + the computed summary
      // key instead (the V149 atomic-RMW invariant still holds).
      expect(body).toMatch(/tx\.update\(cRef,/);
      expect(body).toMatch(/'finance\.loyaltyPoints': a/);
      expect(body).toMatch(/tx\.set\(pointTxDoc\(newTxId\)/);
    });
  }

  it('V149 — adjustPoints over-spend guard is re-checked INSIDE the tx', () => {
    const body = fnBody('adjustPoints');
    // The `if (b < amt) throw คะแนนไม่พอ` must be inside the runTransaction block
    // (after tx.get), not against a pre-tx getPointBalance.
    const txStart = body.indexOf('runTransaction(db, async (tx) =>');
    const guardIdx = body.indexOf('คะแนนไม่พอ');
    expect(txStart).toBeGreaterThan(-1);
    expect(guardIdx).toBeGreaterThan(txStart);
  });

  it('V149 — anti-regression: NO points-mutator does updateDoc(customerDoc,{finance.loyaltyPoints}) outside a tx', () => {
    // The pre-V149 racy summary write must be gone everywhere.
    expect(SRC).not.toMatch(/await updateDoc\(customerDoc\(customerId\), \{ 'finance\.loyaltyPoints'/);
  });

  it('V149 — getPointBalance still reads the summary (the spend-guard source the tx now protects)', () => {
    const body = fnBody('getPointBalance');
    expect(body).toMatch(/finance\?\.loyaltyPoints/);
  });
});
