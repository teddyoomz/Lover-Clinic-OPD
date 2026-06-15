// Task 2 — pure helpers for ED follow-up v2 (R1 confirm card, R4 round date, R3 predicate)
import { describe, it, expect } from 'vitest';
import { maskPhone, buildConfirmInfo, formatRoundDate } from '../src/lib/edScoreDisplay.js';
import { shouldSupersedeSession } from '../src/lib/backendClient.js';

describe('maskPhone', () => {
  it('masks middle of a Thai 10-digit', () => expect(maskPhone('0812345678')).toBe('081-•••-5678'));
  it('strips dashes/spaces first', () => expect(maskPhone('081-234 5678')).toBe('081-•••-5678'));
  it('real prod number 0872587289 → 087-•••-7289', () => expect(maskPhone('0872587289')).toBe('087-•••-7289'));
  it('empty → ""', () => expect(maskPhone('')).toBe(''));
  it('null → ""', () => expect(maskPhone(null)).toBe(''));
  it('undefined → ""', () => expect(maskPhone(undefined)).toBe(''));
  it('too short → returned as-is', () => expect(maskPhone('1234')).toBe('1234'));
});

describe('buildConfirmInfo', () => {
  it('composes name/age/phoneMasked from patientData', () => {
    const c = { id: 'LC-1', patientData: { prefix: 'นาย', firstName: 'สมชาย', lastName: 'ใจดี', age: '45', phone: '0812345678' } };
    const r = buildConfirmInfo(c);
    expect(r.name).toContain('สมชาย');
    expect(r.age).toBe('45');
    expect(r.phoneMasked).toBe('081-•••-5678');
  });
  it('real prod shape (LC-26000082) → masked phone + name', () => {
    const c = { id: 'LC-26000082', patientData: { prefix: 'นาย', firstName: 'ณรงศักดิ์', lastName: 'เอี่ยมรอด', age: '49', phone: '0872587289' } };
    const r = buildConfirmInfo(c);
    expect(r.name).toContain('ณรงศักดิ์');
    expect(r.age).toBe('49');
    expect(r.phoneMasked).toBe('087-•••-7289');
  });
  it('missing fields → empty strings, never throws', () => {
    expect(buildConfirmInfo({})).toEqual({ name: '', age: '', phoneMasked: '' });
  });
  it('null customer → empty shape', () => {
    expect(buildConfirmInfo(null)).toEqual({ name: '', age: '', phoneMasked: '' });
  });
  it('phone never shows full middle (privacy)', () => {
    const r = buildConfirmInfo({ patientData: { phone: '0812345678' } });
    expect(r.phoneMasked).not.toContain('2345');
    expect(r.phoneMasked).toContain('•••');
  });
});

describe('formatRoundDate', () => {
  it('ISO date → dd/mm/yyyy พ.ศ.', () => expect(formatRoundDate('2026-06-12', '2026-06-15')).toEqual({ text: '12/06/2569', isToday: false }));
  it('today → isToday true', () => expect(formatRoundDate('2026-06-15', '2026-06-15')).toEqual({ text: '15/06/2569', isToday: true }));
  it('createdAt-style date (intake fallback) formats', () => expect(formatRoundDate('2026-05-20', '2026-06-15')).toEqual({ text: '20/05/2569', isToday: false }));
  it('full ISO timestamp compares the date-part', () => expect(formatRoundDate('2026-06-15T08:30:00Z', '2026-06-15').isToday).toBe(true));
  it('empty → blank', () => expect(formatRoundDate('', '2026-06-15')).toEqual({ text: '', isToday: false }));
  it('null → blank', () => expect(formatRoundDate(null, '2026-06-15')).toEqual({ text: '', isToday: false }));
  it('non-ISO garbage → returned as text, not crashed', () => expect(formatRoundDate('today', '2026-06-15')).toEqual({ text: 'today', isToday: false }));
});

describe('shouldSupersedeSession (R3 predicate)', () => {
  const base = { linkedCustomerId: 'LC-1', branchId: 'BR-A', formType: 'followup_assessment', status: 'pending' };
  it('matches same customer+branch pending followup', () => expect(shouldSupersedeSession(base, 'LC-1', 'BR-A')).toBe(true));
  it('skips completed (already materialized)', () => expect(shouldSupersedeSession({ ...base, status: 'completed' }, 'LC-1', 'BR-A')).toBe(false));
  it('skips other branch', () => expect(shouldSupersedeSession(base, 'LC-1', 'BR-B')).toBe(false));
  it('skips non-followup (intake)', () => expect(shouldSupersedeSession({ ...base, formType: 'intake' }, 'LC-1', 'BR-A')).toBe(false));
  it('skips other customer', () => expect(shouldSupersedeSession(base, 'LC-2', 'BR-A')).toBe(false));
  it('null session → false', () => expect(shouldSupersedeSession(null, 'LC-1', 'BR-A')).toBe(false));
  it('empty branch on both sides still matches (branchId "" === "")', () => expect(shouldSupersedeSession({ ...base, branchId: '' }, 'LC-1', '')).toBe(true));
});
