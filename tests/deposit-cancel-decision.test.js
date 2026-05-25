import { describe, it, expect } from 'vitest';
import { resolveDepositCancelState } from '../src/lib/depositCancelDecision.js';

describe('resolveDepositCancelState', () => {
  it('D1 no deposit → hasDeposit:false', () => {
    expect(resolveDepositCancelState(null).hasDeposit).toBe(false);
    expect(resolveDepositCancelState(undefined).hasDeposit).toBe(false);
    expect(resolveDepositCancelState('not-an-object').hasDeposit).toBe(false);
  });

  it('D2 active deposit, unused → hasDeposit, not blocked', () => {
    const s = resolveDepositCancelState({ id: 'DEP-1', amount: 2000, usedAmount: 0, status: 'active' });
    expect(s).toMatchObject({ hasDeposit: true, depositId: 'DEP-1', amount: 2000, usedAmount: 0, blocked: false });
  });

  it('D3 partially used → blocked:true', () => {
    expect(resolveDepositCancelState({ id: 'DEP-2', amount: 2000, usedAmount: 500, status: 'active' }).blocked).toBe(true);
  });

  it('D4 already cancelled → hasDeposit:false (nothing to ask)', () => {
    expect(resolveDepositCancelState({ id: 'DEP-3', amount: 2000, usedAmount: 0, status: 'cancelled' }).hasDeposit).toBe(false);
  });

  it('D5 remainingAmount derived when absent', () => {
    expect(resolveDepositCancelState({ id: 'D', amount: 1000, usedAmount: 300 }).remainingAmount).toBe(700);
    // explicit remainingAmount wins when present
    expect(resolveDepositCancelState({ id: 'D', amount: 1000, usedAmount: 300, remainingAmount: 650 }).remainingAmount).toBe(650);
  });

  it('D6 depositId falls back to .depositId', () => {
    expect(resolveDepositCancelState({ depositId: 'X', amount: 0 }).depositId).toBe('X');
  });

  it('D7 adversarial — string/NaN amounts coerce safely', () => {
    const s = resolveDepositCancelState({ id: 'D', amount: '1,500', usedAmount: 'abc' });
    expect(s.amount).toBe(0); // Number('1,500') is NaN → 0 (deposit amounts are stored numeric; comma-string is not expected)
    expect(s.usedAmount).toBe(0);
    expect(s.blocked).toBe(false);
    expect(s.remainingAmount).toBe(0);
  });

  it('D8 negative remaining clamps to 0', () => {
    expect(resolveDepositCancelState({ id: 'D', amount: 100, usedAmount: 300 }).remainingAmount).toBe(0);
  });
});
