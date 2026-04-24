// ─── Phase 12.1 · staff validation adversarial tests ───────────────────────
import { describe, it, expect } from 'vitest';
import {
  validateStaff, emptyStaffForm, normalizeStaff, generateStaffId,
  STATUS_OPTIONS, POSITION_OPTIONS,
} from '../src/lib/staffValidation.js';

const base = () => ({ ...emptyStaffForm(), firstname: 'สมชาย' });

describe('validateStaff — required + length', () => {
  it('SV1: rejects non-object form', () => {
    expect(validateStaff(null)?.[0]).toBe('form');
    expect(validateStaff([])?.[0]).toBe('form');
    expect(validateStaff('str')?.[0]).toBe('form');
  });
  it('SV2: rejects empty firstname', () => {
    expect(validateStaff({ ...base(), firstname: '' })?.[0]).toBe('firstname');
    expect(validateStaff({ ...base(), firstname: '   ' })?.[0]).toBe('firstname');
  });
  it('SV3: rejects non-string firstname', () => {
    expect(validateStaff({ ...base(), firstname: 123 })?.[0]).toBe('firstname');
  });
  it('SV4: rejects over-long firstname', () => {
    expect(validateStaff({ ...base(), firstname: 'x'.repeat(101) })?.[0]).toBe('firstname');
  });
  it('SV5: allows valid minimal form', () => {
    expect(validateStaff(base())).toBeNull();
  });
  it('SV6: allows edge length 100', () => {
    expect(validateStaff({ ...base(), firstname: 'x'.repeat(100) })).toBeNull();
  });
});

describe('validateStaff — email + password', () => {
  it('SV7: rejects malformed email', () => {
    expect(validateStaff({ ...base(), email: 'no-at-sign' })?.[0]).toBe('email');
    expect(validateStaff({ ...base(), email: 'missing@tld' })?.[0]).toBe('email');
  });
  it('SV8: allows empty email (optional)', () => {
    expect(validateStaff({ ...base(), email: '' })).toBeNull();
  });
  it('SV9: allows valid email', () => {
    expect(validateStaff({ ...base(), email: 'staff@clinic.co.th' })).toBeNull();
  });
  it('SV10: rejects weak password (<8 chars)', () => {
    expect(validateStaff({ ...base(), password: 'Ab1' })?.[0]).toBe('password');
  });
  it('SV11: rejects password missing uppercase', () => {
    expect(validateStaff({ ...base(), password: 'all lower 123' })?.[0]).toBe('password');
  });
  it('SV12: rejects password missing digit', () => {
    expect(validateStaff({ ...base(), password: 'OnlyLetters' })?.[0]).toBe('password');
  });
  it('SV13: allows strong password (≥8 + upper + lower + digit)', () => {
    expect(validateStaff({ ...base(), password: 'Strong1pw' })).toBeNull();
  });
  it('SV14: allows empty password (not rotating)', () => {
    expect(validateStaff({ ...base(), password: '' })).toBeNull();
  });
});

describe('validateStaff — enums + refs', () => {
  it('SV15: rejects unknown position', () => {
    expect(validateStaff({ ...base(), position: 'CEO' })?.[0]).toBe('position');
  });
  it('SV16: accepts each enumerated position', () => {
    for (const p of POSITION_OPTIONS) {
      expect(validateStaff({ ...base(), position: p })).toBeNull();
    }
  });
  it('SV17: rejects non-array branchIds', () => {
    expect(validateStaff({ ...base(), branchIds: 'BR1' })?.[0]).toBe('branchIds');
  });
  it('SV18: rejects branchIds containing non-string', () => {
    expect(validateStaff({ ...base(), branchIds: ['BR1', 42] })?.[0]).toBe('branchIds');
  });
  it('SV19: rejects branchIds containing empty string', () => {
    expect(validateStaff({ ...base(), branchIds: ['BR1', '   '] })?.[0]).toBe('branchIds');
  });
  it('SV20: allows empty branchIds array', () => {
    expect(validateStaff({ ...base(), branchIds: [] })).toBeNull();
  });
  it('SV21: accepts each enumerated status', () => {
    for (const s of STATUS_OPTIONS) {
      expect(validateStaff({ ...base(), status: s })).toBeNull();
    }
  });
  it('SV22: rejects unknown status', () => {
    expect(validateStaff({ ...base(), status: 'suspended' })?.[0]).toBe('status');
  });
});

describe('validateStaff — defaultDfGroupId (Phase 14.1)', () => {
  // Staff defaultDfGroupId is OPTIONAL (unlike doctors, where it's required).
  // Supports future non-doctor roles that may participate in DF lists.
  it('SV26: allows empty defaultDfGroupId', () => {
    expect(validateStaff({ ...base(), defaultDfGroupId: '' })).toBeNull();
  });
  it('SV27: allows undefined defaultDfGroupId', () => {
    expect(validateStaff({ ...base() })).toBeNull();
  });
  it('SV28: allows non-empty string defaultDfGroupId', () => {
    expect(validateStaff({ ...base(), defaultDfGroupId: 'DFG-A' })).toBeNull();
  });
  it('SV29: rejects non-string defaultDfGroupId', () => {
    expect(validateStaff({ ...base(), defaultDfGroupId: 42 })?.[0]).toBe('defaultDfGroupId');
    expect(validateStaff({ ...base(), defaultDfGroupId: ['x'] })?.[0]).toBe('defaultDfGroupId');
  });
});

describe('normalizeStaff — defaultDfGroupId (Phase 14.1)', () => {
  it('SN5: trims defaultDfGroupId', () => {
    const n = normalizeStaff({ ...base(), defaultDfGroupId: '  DFG-A  ' });
    expect(n.defaultDfGroupId).toBe('DFG-A');
  });
  it('SN6: emptyStaffForm exposes defaultDfGroupId', () => {
    const f = emptyStaffForm();
    expect('defaultDfGroupId' in f).toBe(true);
    expect(f.defaultDfGroupId).toBe('');
  });
});

describe('validateStaff — colors + booleans', () => {
  it('SV23: rejects invalid hex color', () => {
    expect(validateStaff({ ...base(), color: 'red' })?.[0]).toBe('color');
  });
  it('SV24: accepts hex color (with or without #)', () => {
    expect(validateStaff({ ...base(), color: '#aabbcc' })).toBeNull();
    expect(validateStaff({ ...base(), color: 'aabbcc' })).toBeNull();
  });
  it('SV25: rejects non-boolean hasSales/disabled', () => {
    expect(validateStaff({ ...base(), hasSales: 'yes' })?.[0]).toBe('hasSales');
    expect(validateStaff({ ...base(), disabled: 1 })?.[0]).toBe('disabled');
  });
});

describe('normalizeStaff', () => {
  it('SN1: trims string fields', () => {
    const n = normalizeStaff({ ...base(), firstname: '  สม  ', email: ' x@y.z ' });
    expect(n.firstname).toBe('สม');
    expect(n.email).toBe('x@y.z');
  });
  it('SN2: coerces hasSales/disabled to boolean', () => {
    const n = normalizeStaff({ ...base(), hasSales: 1, disabled: '' });
    expect(n.hasSales).toBe(true);
    expect(n.disabled).toBe(false);
  });
  it('SN3: dedupes blanks from branchIds', () => {
    const n = normalizeStaff({ ...base(), branchIds: [' BR1 ', '', 'BR2'] });
    expect(n.branchIds).toEqual(['BR1', 'BR2']);
  });
  it('SN4: non-array branchIds becomes []', () => {
    const n = normalizeStaff({ ...base(), branchIds: null });
    expect(n.branchIds).toEqual([]);
  });
});

describe('generateStaffId', () => {
  it('SG1: returns STAFF-<b36ts>-<16-hex>', () => {
    const id = generateStaffId();
    expect(id).toMatch(/^STAFF-[0-9a-z]+-[0-9a-f]{16}$/);
  });
  it('SG2: distinct on consecutive calls', () => {
    const set = new Set();
    for (let i = 0; i < 50; i++) set.add(generateStaffId());
    expect(set.size).toBe(50);
  });
});
