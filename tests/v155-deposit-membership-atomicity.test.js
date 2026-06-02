// V155 — deposit refund/cancel + membership renew must be ATOMIC RMW (Rule T).
//
// Bug (confirmed real-prod, scripts/e2e-deposit-refund-atomicity.mjs R1):
//   refundDeposit / cancelDeposit / renewMembership were getDoc→updateDoc
//   (non-atomic read-modify-write on a money/state field). Two concurrent
//   refunds (or a double-click) both read the same remaining/refundAmount, both
//   wrote from the stale base → last-write-wins → one refund's record LOST →
//   refundAmount understated the cash paid out → deposit over-stated → leak.
// Fix: each wraps its read+guard+write in a single runTransaction (Firestore
//   OCC serializes; the loser auto-retries against the re-read state). Same
//   Rule-T family as V148 (courses) / V149 (points) / M5 (wallet) / V147 (stock).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SRC = readFileSync(path.resolve(process.cwd(), 'src/lib/backendClient.js'), 'utf8');
function fnBody(name, span = 1600) {
  const s = SRC.indexOf(`export async function ${name}`);
  if (s < 0) throw new Error(`fn ${name} not found`);
  return SRC.slice(s, s + span);
}

describe('V155.A — refundDeposit atomic RMW', () => {
  const body = fnBody('refundDeposit');
  it('A1 wraps the RMW in runTransaction', () => { expect(body).toMatch(/runTransaction\(db/); });
  it('A2 reads the deposit INSIDE the tx (tx.get) + writes via tx.update', () => {
    expect(body).toMatch(/await tx\.get\(ref\)/);
    expect(body).toMatch(/tx\.update\(ref/);
  });
  it('A3 anti-regression: no getDoc→updateDoc pair on the deposit ref', () => {
    expect(body).not.toMatch(/await getDoc\(ref\)/);
    expect(body).not.toMatch(/await updateDoc\(ref/);
  });
  it('A4 over-refund guard re-checked in-tx (amt > remaining → throw)', () => {
    expect(body).toMatch(/if\s*\(\s*amt > remaining\s*\)\s*throw/);
  });
  it('A5 carries the V155 marker', () => { expect(body).toMatch(/V155/); });
});

describe('V155.B — cancelDeposit atomic RMW', () => {
  const body = fnBody('cancelDeposit');
  it('B1 wraps in runTransaction with tx.get + tx.update', () => {
    expect(body).toMatch(/runTransaction\(db/);
    expect(body).toMatch(/await tx\.get\(ref\)/);
    expect(body).toMatch(/tx\.update\(ref/);
  });
  it('B2 re-checks usedAmount>0 guard in-tx', () => {
    expect(body).toMatch(/Number\(cur\.usedAmount\)\s*\|\|\s*0\)\s*>\s*0/);
  });
  it('B3 anti-regression: no getDoc→updateDoc on the ref', () => {
    expect(body).not.toMatch(/await getDoc\(ref\)/);
    expect(body).not.toMatch(/await updateDoc\(ref/);
  });
  it('B4 carries the V155 marker', () => { expect(body).toMatch(/V155/); });
});

describe('V155.C — renewMembership renewals[] atomic RMW', () => {
  const body = fnBody('renewMembership', 2000);
  it('C1 wraps the renewals[] read+push+write in runTransaction', () => {
    expect(body).toMatch(/runTransaction\(db/);
    expect(body).toMatch(/await tx\.get\(ref\)/);
    expect(body).toMatch(/tx\.update\(ref/);
  });
  it('C2 anti-regression: no getDoc→updateDoc on the membership ref for renewals', () => {
    expect(body).not.toMatch(/const snap = await getDoc\(ref\)/);
  });
  it('C3 carries the V155 marker', () => { expect(body).toMatch(/V155/); });
});

describe('V155.D — real-prod e2e proof exists', () => {
  it('D1 e2e-deposit-refund-atomicity.mjs present', () => {
    const e2e = readFileSync(path.resolve(process.cwd(), 'scripts/e2e-deposit-refund-atomicity.mjs'), 'utf8');
    expect(e2e).toMatch(/refundDeposit/);
    expect(e2e).toMatch(/cancelDeposit/);
    expect(e2e).toMatch(/Promise\.allSettled/);
  });
});

// V156 — defensive money rounding at the write boundary. Closes the M12 caveat
// ("acceptable IF inputs are always rounded") by guaranteeing it AT the boundary.
describe('V156.E — THB money-write fns round the amount (M12 caveat closed)', () => {
  const ROUNDED = ['refundDeposit', 'applyDepositToSale', 'topUpWallet', 'deductWallet', 'refundToWallet', 'adjustWallet'];
  for (const fn of ROUNDED) {
    it(`E:${fn} rounds amount via roundTHB`, () => {
      expect(fnBody(fn)).toMatch(/const amt = roundTHB\(Number\(/);
    });
  }
  it('E: backendClient imports roundTHB', () => {
    expect(SRC).toMatch(/import \{ roundTHB \} from '\.\/financeUtils\.js'/);
  });
  it('E: adjustPoints does NOT THB-round (points are whole, not baht)', () => {
    expect(fnBody('adjustPoints')).not.toMatch(/const amt = roundTHB/);
  });
});
