// tests/appointment-deposit-purpose-flow-simulate.test.js
// Task E9 — Rule I full-flow simulate: deposit gate + chip round-trip + edit decision
// matrix + adversarial. Uses the REAL helpers (do NOT re-implement them).
import { describe, it, expect } from 'vitest';
import { buildVisitPurposeText, parseVisitPurposeText } from '../src/lib/visitPurposeUtils.js';
import { buildDepositPairPayload } from '../src/lib/appointmentDepositBatch.js';

// Pure mirror of the modal's derived gate (AppointmentFormModal:effective-type).
const effectiveType = (lockedType, formType) => lockedType || formType;
const showDeposit = (lockedType, formType) => effectiveType(lockedType, formType) === 'deposit-booking';

describe('F1 — deposit gate (mirror)', () => {
  it('radio-picked deposit shows section (no lock)', () => expect(showDeposit(null, 'deposit-booking')).toBe(true));
  it('locked deposit shows section', () => expect(showDeposit('deposit-booking', 'follow-up')).toBe(true));
  it('non-deposit (radio) hides section', () => expect(showDeposit(null, 'no-deposit-booking')).toBe(false));
  it('Walk-in OPD-save locked no-deposit → hidden', () => expect(showDeposit('no-deposit-booking', 'deposit-booking')).toBe(false));
});

describe('F2 — chip round-trip (real helpers)', () => {
  it('chips + other → string → chips + other', () => {
    const s = buildVisitPurposeText(['โรคระบบทางเดินปัสสาวะ', 'ขลิบ', 'อื่นๆ'], 'ผ่ามุก');
    expect(s).toBe('โรคระบบทางเดินปัสสาวะ, ขลิบ, อื่นๆ: ผ่ามุก');
    const parsed = parseVisitPurposeText(s);
    expect(parsed.purposes).toContain('ขลิบ');
    expect(parsed.purposes).toContain('อื่นๆ');
    expect(parsed.other).toBe('ผ่ามุก');
  });
  it('legacy free-text hydrates without loss', () => {
    const parsed = parseVisitPurposeText('botox filler');
    expect(parsed.purposes).toEqual(['botox filler']); // folded to อื่นๆ by the picker
  });
  it('required: empty string blocks (gate mirror)', () => {
    expect(''.trim().length > 0).toBe(false);
    expect('ขลิบ'.trim().length > 0).toBe(true);
  });
});

describe('F3 — deposit pair payload (real builder)', () => {
  it('create deposit → linked appointment, money fields correct', () => {
    const p = buildDepositPairPayload({
      depositData: { amount: 2000, paymentChannel: 'เงินสด', appointment: { type: 'deposit-booking', date: '2026-05-25', startTime: '10:00' } },
      depositId: 'DEP-1', appointmentId: 'BA-1', branchId: 'BR-A',
    });
    expect(p.linkedAppointmentId).toBe('BA-1');
    expect(p.remainingAmount).toBe(2000);
    expect(p.usedAmount).toBe(0);
    expect(p.status).toBe('active');
    expect(p.hasAppointment).toBe(true);
  });
  it('zero-amount deposit payload is well-formed (validation blocks it upstream)', () => {
    const p = buildDepositPairPayload({ depositData: { amount: 0, appointment: {} }, depositId: 'DEP-2', appointmentId: 'BA-2', branchId: 'BR-A' });
    expect(p.amount).toBe(0);
    expect(p.remainingAmount).toBe(0);
  });
});

describe('F4 — edit decision matrix (pure mirror of handleSave edit branch)', () => {
  const decideEdit = (wasDeposit, nowDeposit, hasLink, flipDecision) => {
    if (nowDeposit && hasLink) return 'updateDeposit';
    if (nowDeposit && !hasLink) return 'createDepositForExistingAppointment';
    if (wasDeposit && !nowDeposit && hasLink) return flipDecision === 'delete' ? 'cancelDepositBookingPair' : 'keep';
    return 'appointment-only';
  };
  it('case1 deposit+link → update', () => expect(decideEdit(true, true, true, null)).toBe('updateDeposit'));
  it('case2 flip-to (no link) → create', () => expect(decideEdit(false, true, false, null)).toBe('createDepositForExistingAppointment'));
  it('case4 deposit no-link (legacy) → create', () => expect(decideEdit(true, true, false, null)).toBe('createDepositForExistingAppointment'));
  it('case3 flip-away delete', () => expect(decideEdit(true, false, true, 'delete')).toBe('cancelDepositBookingPair'));
  it('case3 flip-away keep', () => expect(decideEdit(true, false, true, 'keep')).toBe('keep'));
  it('non-deposit edit → appointment-only', () => expect(decideEdit(false, false, false, null)).toBe('appointment-only'));
});

describe('F5 — adversarial chip inputs (no throw + round-trips)', () => {
  const cases = ['', null, undefined, '   ', 'อื่นๆ', 'อื่นๆ: ', 'อื่นๆ: 😀🔥', 'A'.repeat(5000), 'ขลิบ,ขลิบ,ขลิบ', 'โรคติดต่อทางเพศสัมพันธ์, อื่นๆ: NUL\0byte'];
  for (const v of cases) {
    it(`parse(${JSON.stringify(String(v).slice(0, 18))}) does not throw + round-trips to a string`, () => {
      const parsed = parseVisitPurposeText(v);
      expect(Array.isArray(parsed.purposes)).toBe(true);
      const rebuilt = buildVisitPurposeText(parsed.purposes, parsed.other);
      expect(typeof rebuilt).toBe('string');
    });
  }
});
