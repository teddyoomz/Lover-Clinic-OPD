// Task A1 — deriveClaimKey + DuplicateIdentityError (pure unit + adversarial).
import { describe, it, expect } from 'vitest';
import { deriveClaimKey, DuplicateIdentityError, resolveClaimAction } from '../src/lib/customerIdentity.js';

describe('A1 deriveClaimKey — citizen', () => {
  it('exactly 13 digits → CITIZEN:', () => {
    expect(deriveClaimKey('1234567890123', '')).toBe('CITIZEN:1234567890123');
  });
  it('strips Thai-style dashes', () => {
    expect(deriveClaimKey('1-2345-67890-12-3', '')).toBe('CITIZEN:1234567890123');
  });
  it('strips spaces', () => {
    expect(deriveClaimKey('1 2345 67890 12 3', '')).toBe('CITIZEN:1234567890123');
  });
  it('13 digits with leading zero is still a valid key (exactly-13 invariant)', () => {
    expect(deriveClaimKey('0123456789012', '')).toBe('CITIZEN:0123456789012');
  });
  it('12 digits → NOT a citizen key (no silent re-pad)', () => {
    expect(deriveClaimKey('123456789012', '')).toBeNull();
  });
  it('14 digits → NOT a citizen key', () => {
    expect(deriveClaimKey('12345678901234', '')).toBeNull();
  });
  it('non-numeric in citizen field → null (no passport given)', () => {
    expect(deriveClaimKey('12345abc90123', '')).toBeNull();
  });
});

describe('A1 deriveClaimKey — passport', () => {
  it('trims + uppercases', () => {
    expect(deriveClaimKey('', '  ab1234567 ')).toBe('PASSPORT:AB1234567');
  });
  it('removes internal spaces (aa 000 123 ≡ AA000123)', () => {
    expect(deriveClaimKey('', 'aa 000 123')).toBe('PASSPORT:AA000123');
    expect(deriveClaimKey('', 'AA000123')).toBe('PASSPORT:AA000123');
  });
  it('removes dashes', () => {
    expect(deriveClaimKey('', 'AB-123-4567')).toBe('PASSPORT:AB1234567');
  });
  it('rejects > 30 chars', () => {
    expect(deriveClaimKey('', 'A'.repeat(31))).toBeNull();
  });
  it('rejects non-alphanumeric (e.g. slash) → null (safe degrade, no guard)', () => {
    expect(deriveClaimKey('', 'AB/123')).toBeNull();
  });
});

describe('A1 deriveClaimKey — priority + walk-in', () => {
  it('both present → CITIZEN wins', () => {
    expect(deriveClaimKey('1234567890123', 'AB1234567')).toBe('CITIZEN:1234567890123');
  });
  it('invalid citizen + valid passport → passport', () => {
    expect(deriveClaimKey('123', 'AB1234567')).toBe('PASSPORT:AB1234567');
  });
  it('both empty → null (walk-in)', () => {
    expect(deriveClaimKey('', '')).toBeNull();
    expect(deriveClaimKey(null, null)).toBeNull();
    expect(deriveClaimKey(undefined, undefined)).toBeNull();
  });
});

describe('A1 resolveClaimAction', () => {
  it('free claim → set', () => {
    expect(resolveClaimAction({ claimExists: false, owner: null, customerId: 'LC-1' })).toEqual({ action: 'set' });
  });
  it('owned by another, no override → throw with existing id', () => {
    expect(resolveClaimAction({ claimExists: true, owner: 'LC-1', customerId: 'LC-2' }))
      .toEqual({ action: 'throw', existingCustomerId: 'LC-1' });
  });
  it('owned by another, override → append', () => {
    expect(resolveClaimAction({ claimExists: true, owner: 'LC-1', customerId: 'LC-2', overrideDuplicate: true }))
      .toEqual({ action: 'append' });
  });
  it('already owned by self → noop (re-entrant safe)', () => {
    expect(resolveClaimAction({ claimExists: true, owner: 'LC-2', customerId: 'LC-2' })).toEqual({ action: 'noop' });
  });
  it('claim exists but owner empty → noop (reclaimable, not a dup)', () => {
    expect(resolveClaimAction({ claimExists: true, owner: '', customerId: 'LC-2' })).toEqual({ action: 'noop' });
  });
});

describe('A1 DuplicateIdentityError', () => {
  it('carries code + existing id + key', () => {
    const e = new DuplicateIdentityError('LC-26000074', 'CITIZEN:1234567890123');
    expect(e.code).toBe('DUPLICATE_IDENTITY');
    expect(e.existingCustomerId).toBe('LC-26000074');
    expect(e.claimKey).toBe('CITIZEN:1234567890123');
    expect(e instanceof Error).toBe(true);
  });
});
