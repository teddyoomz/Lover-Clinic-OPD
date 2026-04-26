// ─── Phase 12.6 · online-sale validator + state machine tests ─────────────
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import {
  validateOnlineSale, normalizeOnlineSale, emptyOnlineSaleForm,
  generateOnlineSaleId, applyStatusTransition,
  STATUS_OPTIONS, TRANSITIONS,
} from '../src/lib/onlineSaleValidation.js';

const base = (over = {}) => ({
  ...emptyOnlineSaleForm(),
  customerId: 'CUST-1',
  amount: 1500,
  bankAccountId: 'BANK-1',
  transferDate: '2026-04-20',
  ...over,
});

describe('validateOnlineSale — required + shape', () => {
  it('OS1: null/array rejected', () => {
    expect(validateOnlineSale(null)?.[0]).toBe('form');
    expect(validateOnlineSale([])?.[0]).toBe('form');
  });
  it('OS2: missing customerId rejected', () => {
    expect(validateOnlineSale({ ...base(), customerId: '' })?.[0]).toBe('customerId');
  });
  it('OS3: non-numeric amount rejected', () => {
    expect(validateOnlineSale({ ...base(), amount: 'abc' })?.[0]).toBe('amount');
  });
  it('OS4: negative amount rejected', () => {
    expect(validateOnlineSale({ ...base(), amount: -100 })?.[0]).toBe('amount');
  });
  it('OS5: strict requires amount > 0', () => {
    expect(validateOnlineSale({ ...base(), amount: 0 }, { strict: true })?.[0]).toBe('amount');
  });
  it('OS6: non-strict allows zero amount', () => {
    expect(validateOnlineSale({ ...base(), amount: 0 })).toBeNull();
  });
  it('OS7: strict requires bankAccountId', () => {
    expect(validateOnlineSale({ ...base(), bankAccountId: '' }, { strict: true })?.[0]).toBe('bankAccountId');
  });
  it('OS8: non-strict allows missing bankAccountId', () => {
    expect(validateOnlineSale({ ...base(), bankAccountId: '' })).toBeNull();
  });
  it('OS9: malformed transferDate rejected', () => {
    expect(validateOnlineSale({ ...base(), transferDate: '20/04/2026' })?.[0]).toBe('transferDate');
  });
  it('OS10: valid transferDate accepted', () => {
    expect(validateOnlineSale({ ...base(), transferDate: '2026-04-20' })).toBeNull();
  });
  it('OS11: HH:mm transferTime accepted', () => {
    expect(validateOnlineSale({ ...base(), transferTime: '14:30' })).toBeNull();
  });
  it('OS12: full ISO transferTime accepted', () => {
    expect(validateOnlineSale({ ...base(), transferTime: '2026-04-20T14:30:00Z' })).toBeNull();
  });
  it('OS13: gibberish transferTime rejected', () => {
    expect(validateOnlineSale({ ...base(), transferTime: 'afternoon' })?.[0]).toBe('transferTime');
  });
  it('OS14: status enum', () => {
    for (const s of STATUS_OPTIONS) {
      const f = s === 'completed' ? { ...base(), status: s, linkedSaleId: 'SALE-1' } : { ...base(), status: s };
      expect(validateOnlineSale(f)).toBeNull();
    }
    expect(validateOnlineSale({ ...base(), status: 'weird' })?.[0]).toBe('status');
  });
  it('OS15: completed without linkedSaleId rejected', () => {
    expect(validateOnlineSale({ ...base(), status: 'completed' })?.[0]).toBe('linkedSaleId');
  });
  it('OS16: completed with linkedSaleId accepted', () => {
    expect(validateOnlineSale({ ...base(), status: 'completed', linkedSaleId: 'SALE-1' })).toBeNull();
  });
  it('OS17: minimal non-strict valid', () => {
    expect(validateOnlineSale(base())).toBeNull();
  });
  it('OS18: strict valid requires amount + bankAccountId', () => {
    expect(validateOnlineSale(base(), { strict: true })).toBeNull();
  });
});

describe('applyStatusTransition', () => {
  it('ST1: pending → paid OK', () => {
    expect(applyStatusTransition('pending', 'paid')).toBe('paid');
  });
  it('ST2: paid → completed OK', () => {
    expect(applyStatusTransition('paid', 'completed')).toBe('completed');
  });
  it('ST3: pending → cancelled OK', () => {
    expect(applyStatusTransition('pending', 'cancelled')).toBe('cancelled');
  });
  it('ST4: paid → cancelled OK', () => {
    expect(applyStatusTransition('paid', 'cancelled')).toBe('cancelled');
  });
  it('ST5: pending → completed BLOCKED (must pay first)', () => {
    expect(() => applyStatusTransition('pending', 'completed')).toThrow();
  });
  it('ST6: completed → paid BLOCKED (terminal)', () => {
    expect(() => applyStatusTransition('completed', 'paid')).toThrow();
  });
  it('ST7: cancelled → pending BLOCKED (terminal)', () => {
    expect(() => applyStatusTransition('cancelled', 'pending')).toThrow();
  });
  it('ST8: completed → cancelled BLOCKED', () => {
    expect(() => applyStatusTransition('completed', 'cancelled')).toThrow();
  });
  it('ST9: unknown current throws', () => {
    expect(() => applyStatusTransition('weird', 'paid')).toThrow();
  });
  it('ST10: unknown next throws', () => {
    expect(() => applyStatusTransition('pending', 'weird')).toThrow();
  });
  it('ST11: idempotent same-state returns same', () => {
    expect(applyStatusTransition('paid', 'paid')).toBe('paid');
    expect(applyStatusTransition('completed', 'completed')).toBe('completed');
  });
  it('ST12: TRANSITIONS map is frozen', () => {
    expect(() => { TRANSITIONS.pending.push('completed'); }).toThrow();
  });
});

describe('normalizeOnlineSale', () => {
  it('ON1: coerces amount string', () => {
    expect(normalizeOnlineSale({ ...base(), amount: '2500' }).amount).toBe(2500);
  });
  it('ON2: trims strings', () => {
    const n = normalizeOnlineSale({ ...base(), customerId: '  CUST-1  ', note: '  x  ' });
    expect(n.customerId).toBe('CUST-1');
    expect(n.note).toBe('x');
  });
  it('ON3: invalid status → pending', () => {
    expect(normalizeOnlineSale({ ...base(), status: 'weird' }).status).toBe('pending');
  });
  it('ON4: generateOnlineSaleId has OSALE- prefix', () => {
    expect(generateOnlineSaleId()).toMatch(/^OSALE-/);
  });
});

describe('Phase 12.6 — Rule E', () => {
  const IMPORT_BROKER = /(?:from\s+['"][^'"]*brokerClient|require\(\s*['"][^'"]*brokerClient)/;
  const FETCH_PROCLINIC = /(?:from\s+['"][^'"]*\/api\/proclinic\/|fetch\s*\(\s*['"`][^'"`]*\/api\/proclinic\/)/;
  it('RE1: validator clean', () => {
    const src = fs.readFileSync('src/lib/onlineSaleValidation.js', 'utf-8');
    expect(src).not.toMatch(IMPORT_BROKER);
    expect(src).not.toMatch(FETCH_PROCLINIC);
  });
  it('RE2: OnlineSalesTab clean', () => {
    const src = fs.readFileSync('src/components/backend/OnlineSalesTab.jsx', 'utf-8');
    expect(src).not.toMatch(IMPORT_BROKER);
    expect(src).not.toMatch(FETCH_PROCLINIC);
  });
});
