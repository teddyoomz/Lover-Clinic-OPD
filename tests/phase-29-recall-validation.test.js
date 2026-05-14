// tests/phase-29-recall-validation.test.js
//
// Phase 29.1 (2026-05-14) — TDD test bank for recallValidation.js
// V1 validateRecallSlot · V2 validateRecallCreate · V3 normalizeRecallSlot
// V4 adversarial inputs

import { describe, it, expect } from 'vitest';
import {
  validateRecallSlot,
  validateRecallCreate,
  normalizeRecallSlot,
} from '../src/lib/recallValidation.js';

describe('Phase 29 · V1 validateRecallSlot', () => {
  it('V1.1 valid slot passes', () => {
    const out = validateRecallSlot({ enabled: true, recallDate: '2026-05-15', reason: 'ติดตามอาการ' });
    expect(out.ok).toBe(true);
    expect(out.errors).toEqual([]);
  });
  it('V1.2 missing date fails', () => {
    const out = validateRecallSlot({ enabled: true, recallDate: '', reason: 'x' });
    expect(out.ok).toBe(false);
    expect(out.errors).toContain('date-required');
  });
  it('V1.3 missing reason fails', () => {
    const out = validateRecallSlot({ enabled: true, recallDate: '2026-05-15', reason: '' });
    expect(out.ok).toBe(false);
    expect(out.errors).toContain('reason-required');
  });
  it('V1.4 whitespace-only reason fails', () => {
    const out = validateRecallSlot({ enabled: true, recallDate: '2026-05-15', reason: '   ' });
    expect(out.ok).toBe(false);
    expect(out.errors).toContain('reason-required');
  });
  it('V1.5 disabled slot ignored (always ok)', () => {
    const out = validateRecallSlot({ enabled: false, recallDate: '', reason: '' });
    expect(out.ok).toBe(true);
    expect(out.errors).toEqual([]);
  });
  it('V1.6 null slot returns ok', () => {
    expect(validateRecallSlot(null).ok).toBe(true);
  });
  it('V1.7 both missing → both errors listed', () => {
    const out = validateRecallSlot({ enabled: true, recallDate: '', reason: '' });
    expect(out.ok).toBe(false);
    expect(out.errors).toContain('date-required');
    expect(out.errors).toContain('reason-required');
    expect(out.errors).toHaveLength(2);
  });
});

describe('Phase 29 · V2 validateRecallCreate', () => {
  it('V2.1 both slots off → fails (must enable ≥1)', () => {
    const out = validateRecallCreate({
      customerId: 'LC-1',
      slot1: { enabled: false },
      slot2: { enabled: false },
    });
    expect(out.ok).toBe(false);
    expect(out.errors).toContain('at-least-one-slot-required');
  });
  it('V2.2 only slot 1 enabled → ok if slot 1 valid', () => {
    const out = validateRecallCreate({
      customerId: 'LC-1',
      slot1: { enabled: true, recallDate: '2026-05-15', reason: 'x' },
      slot2: { enabled: false },
    });
    expect(out.ok).toBe(true);
  });
  it('V2.3 only slot 2 enabled → ok if slot 2 valid', () => {
    const out = validateRecallCreate({
      customerId: 'LC-1',
      slot1: { enabled: false },
      slot2: { enabled: true, recallDate: '2026-11-14', reason: 'x' },
    });
    expect(out.ok).toBe(true);
  });
  it('V2.4 both enabled but customerId missing → fails', () => {
    const out = validateRecallCreate({
      customerId: '',
      slot1: { enabled: true, recallDate: '2026-05-15', reason: 'x' },
      slot2: { enabled: true, recallDate: '2026-11-14', reason: 'y' },
    });
    expect(out.ok).toBe(false);
    expect(out.errors).toContain('customer-required');
  });
  it('V2.5 slot error prefixed with slot1- / slot2-', () => {
    const out = validateRecallCreate({
      customerId: 'LC-1',
      slot1: { enabled: true, recallDate: '', reason: 'x' },
      slot2: { enabled: true, recallDate: '2026-11-14', reason: '' },
    });
    expect(out.ok).toBe(false);
    expect(out.errors).toContain('slot1-date-required');
    expect(out.errors).toContain('slot2-reason-required');
  });
  it('V2.6 both valid → ok', () => {
    const out = validateRecallCreate({
      customerId: 'LC-1',
      slot1: { enabled: true, recallDate: '2026-05-15', reason: 'a' },
      slot2: { enabled: true, recallDate: '2026-11-14', reason: 'b' },
    });
    expect(out.ok).toBe(true);
    expect(out.errors).toEqual([]);
  });
});

describe('Phase 29 · V3 normalizeRecallSlot', () => {
  it('V3.1 strips whitespace on reason', () => {
    expect(normalizeRecallSlot({ enabled: true, recallDate: '2026-05-15', reason: '  ติดตาม  ' }).reason).toBe('ติดตาม');
  });
  it('V3.2 coerces enabled to boolean', () => {
    expect(normalizeRecallSlot({ enabled: 'truthy' }).enabled).toBe(true);
    expect(normalizeRecallSlot({ enabled: 0 }).enabled).toBe(false);
  });
  it('V3.3 missing recallDate → empty string', () => {
    expect(normalizeRecallSlot({ enabled: true }).recallDate).toBe('');
  });
  it('V3.4 saveToMaster preserved as boolean', () => {
    expect(normalizeRecallSlot({ enabled: true, saveToMaster: true }).saveToMaster).toBe(true);
    expect(normalizeRecallSlot({ enabled: true, saveToMaster: undefined }).saveToMaster).toBe(false);
  });
  it('V3.5 null slot returns minimal disabled shape', () => {
    expect(normalizeRecallSlot(null)).toEqual({ enabled: false });
  });
});

describe('Phase 29 · V4 adversarial inputs', () => {
  it('V4.1 numeric reason coerced via non-string check', () => {
    const out = validateRecallSlot({ enabled: true, recallDate: '2026-05-15', reason: 12345 });
    // Numeric is not string → treated as empty → reason-required
    expect(out.errors).toContain('reason-required');
  });
  it('V4.2 numeric recallDate fails', () => {
    const out = validateRecallSlot({ enabled: true, recallDate: 20260515, reason: 'x' });
    expect(out.errors).toContain('date-required');
  });
  it('V4.3 empty payload returns appropriate errors', () => {
    const out = validateRecallCreate({});
    expect(out.errors).toContain('customer-required');
    expect(out.errors).toContain('at-least-one-slot-required');
  });
  it('V4.4 null payload safe', () => {
    expect(() => validateRecallCreate(null)).not.toThrow();
  });
});
