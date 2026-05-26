import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// V-deposit-noappt (2026-05-27) — createDeposit must stamp the new optional
// fields (purpose / customerNameTemp / customerPhoneTemp) and must NOT recalc
// a customer balance when customerId is empty (temp-customer deposit).
//
// Convention: this mirrors the repo's existing createDeposit test
// (phase-24-0-vicies-septies) — source-grep on the function body + a pure
// mirror of the guard. The REAL payload/round-trip behavior is verified by the
// Rule Q L2 prod e2e (scripts/e2e-deposit-no-appointment.mjs).
const SRC = fs.readFileSync(path.join(__dirname, '..', 'src/lib/backendClient.js'), 'utf8');

function createDepositBody() {
  const start = SRC.indexOf('export async function createDeposit(');
  const end = SRC.indexOf('export async function updateDeposit(', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return SRC.slice(start, end);
}

describe('V-deposit-noappt — createDeposit stamps new fields', () => {
  const body = createDepositBody();
  it('payload stamps purpose', () => {
    expect(body).toMatch(/purpose:\s*data\.purpose\s*\|\|\s*''/);
  });
  it('payload stamps customerNameTemp + customerPhoneTemp', () => {
    expect(body).toMatch(/customerNameTemp:\s*data\.customerNameTemp\s*\|\|\s*''/);
    expect(body).toMatch(/customerPhoneTemp:\s*data\.customerPhoneTemp\s*\|\|\s*''/);
  });
});

describe('V-deposit-noappt — createDeposit guards recalc on empty customerId', () => {
  const body = createDepositBody();
  it('recalc is guarded by a customerId check', () => {
    expect(body).toMatch(/if\s*\(\s*payload\.customerId\s*\)\s*await\s+recalcCustomerDepositBalance/);
  });
  it('anti-regression: no unguarded recalc call remains', () => {
    // Pre-fix line was `\n  await recalcCustomerDepositBalance(payload.customerId)`
    // (await at statement start). The guarded form has `if (...)` before await.
    expect(body).not.toMatch(/\n\s*await\s+recalcCustomerDepositBalance\(payload\.customerId\)/);
  });
});

describe('V-deposit-noappt — recalc-guard logic (pure mirror)', () => {
  const recalcCalledFor = (customerId) => {
    let called = false;
    const recalc = () => { called = true; };
    if (customerId) recalc(); // mirrors the createDeposit guard
    return called;
  };
  it('skips recalc for empty customerId (temp-customer deposit)', () => {
    expect(recalcCalledFor('')).toBe(false);
  });
  it('runs recalc for a real customerId (regression)', () => {
    expect(recalcCalledFor('C-1')).toBe(true);
  });
});
