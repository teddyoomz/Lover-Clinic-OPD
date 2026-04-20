// ─── Phase 12.1 · doctor validation adversarial tests ──────────────────────
import { describe, it, expect } from 'vitest';
import {
  validateDoctor, emptyDoctorForm, normalizeDoctor, generateDoctorId,
  STATUS_OPTIONS, POSITION_OPTIONS, DF_PAID_TYPE_OPTIONS,
} from '../src/lib/doctorValidation.js';

const base = () => ({ ...emptyDoctorForm(), firstname: 'สมชาย', position: 'แพทย์' });

describe('validateDoctor — required + length', () => {
  it('DV1: rejects non-object form', () => {
    expect(validateDoctor(null)?.[0]).toBe('form');
    expect(validateDoctor([])?.[0]).toBe('form');
  });
  it('DV2: rejects empty firstname', () => {
    expect(validateDoctor({ ...base(), firstname: '' })?.[0]).toBe('firstname');
  });
  it('DV3: rejects missing position', () => {
    expect(validateDoctor({ ...base(), position: '' })?.[0]).toBe('position');
  });
  it('DV4: rejects unknown position', () => {
    expect(validateDoctor({ ...base(), position: 'แพทย์เฉพาะทาง' })?.[0]).toBe('position');
  });
  it('DV5: accepts both enumerated positions', () => {
    for (const p of POSITION_OPTIONS) {
      expect(validateDoctor({ ...base(), position: p })).toBeNull();
    }
  });
  it('DV6: rejects over-long firstnameEn', () => {
    expect(validateDoctor({ ...base(), firstnameEn: 'x'.repeat(101) })?.[0]).toBe('firstnameEn');
  });
  it('DV7: rejects over-long lastnameEn', () => {
    expect(validateDoctor({ ...base(), lastnameEn: 'x'.repeat(101) })?.[0]).toBe('lastnameEn');
  });
  it('DV8: allows bilingual name pair', () => {
    expect(validateDoctor({ ...base(), firstnameEn: 'John', lastnameEn: 'Smith' })).toBeNull();
  });
});

describe('validateDoctor — credentials', () => {
  it('DV9: rejects malformed email', () => {
    expect(validateDoctor({ ...base(), email: 'bad-email' })?.[0]).toBe('email');
  });
  it('DV10: allows valid email', () => {
    expect(validateDoctor({ ...base(), email: 'dr@clinic.com' })).toBeNull();
  });
  it('DV11: rejects weak password', () => {
    expect(validateDoctor({ ...base(), password: 'short1A' })?.[0]).toBe('password');
  });
  it('DV12: accepts strong password', () => {
    expect(validateDoctor({ ...base(), password: 'Strong1pw' })).toBeNull();
  });
  it('DV13: allows empty password', () => {
    expect(validateDoctor({ ...base(), password: '' })).toBeNull();
  });
  it('DV14: rejects over-long professionalLicense', () => {
    expect(validateDoctor({ ...base(), professionalLicense: 'x'.repeat(51) })?.[0]).toBe('professionalLicense');
  });
});

describe('validateDoctor — DF fields', () => {
  it('DV15: rejects negative hourlyIncome', () => {
    expect(validateDoctor({ ...base(), hourlyIncome: -100 })?.[0]).toBe('hourlyIncome');
  });
  it('DV16: allows zero hourlyIncome', () => {
    expect(validateDoctor({ ...base(), hourlyIncome: 0 })).toBeNull();
  });
  it('DV17: rejects non-numeric hourlyIncome', () => {
    expect(validateDoctor({ ...base(), hourlyIncome: 'abc' })?.[0]).toBe('hourlyIncome');
  });
  it('DV18: allows empty-string hourlyIncome', () => {
    expect(validateDoctor({ ...base(), hourlyIncome: '' })).toBeNull();
  });
  it('DV19: rejects unknown dfPaidType', () => {
    expect(validateDoctor({ ...base(), dfPaidType: 'bitcoin' })?.[0]).toBe('dfPaidType');
  });
  it('DV20: accepts each enumerated dfPaidType', () => {
    for (const t of DF_PAID_TYPE_OPTIONS) {
      expect(validateDoctor({ ...base(), dfPaidType: t })).toBeNull();
    }
  });
});

describe('validateDoctor — enums + branchIds', () => {
  it('DV21: rejects non-array branchIds', () => {
    expect(validateDoctor({ ...base(), branchIds: 'BR1' })?.[0]).toBe('branchIds');
  });
  it('DV22: allows empty branchIds', () => {
    expect(validateDoctor({ ...base(), branchIds: [] })).toBeNull();
  });
  it('DV23: rejects unknown status', () => {
    expect(validateDoctor({ ...base(), status: 'retired' })?.[0]).toBe('status');
  });
  it('DV24: accepts enumerated status', () => {
    for (const s of STATUS_OPTIONS) {
      expect(validateDoctor({ ...base(), status: s })).toBeNull();
    }
  });
  it('DV25: rejects invalid hex color', () => {
    expect(validateDoctor({ ...base(), color: 'xyz' })?.[0]).toBe('color');
  });
});

describe('normalizeDoctor', () => {
  it('DN1: coerces hourlyIncome to number', () => {
    const n = normalizeDoctor({ ...base(), hourlyIncome: '1500' });
    expect(n.hourlyIncome).toBe(1500);
  });
  it('DN2: empty hourlyIncome becomes null', () => {
    const n = normalizeDoctor({ ...base(), hourlyIncome: '' });
    expect(n.hourlyIncome).toBeNull();
  });
  it('DN3: defaults position to แพทย์ when missing', () => {
    const n = normalizeDoctor({ firstname: 'x' });
    expect(n.position).toBe('แพทย์');
  });
  it('DN4: trims string fields', () => {
    const n = normalizeDoctor({ ...base(), firstnameEn: '  John  ' });
    expect(n.firstnameEn).toBe('John');
  });
});

describe('generateDoctorId', () => {
  it('DG1: uses DOC- prefix for แพทย์', () => {
    expect(generateDoctorId('แพทย์')).toMatch(/^DOC-/);
  });
  it('DG2: uses ASST- prefix for ผู้ช่วยแพทย์', () => {
    expect(generateDoctorId('ผู้ช่วยแพทย์')).toMatch(/^ASST-/);
  });
  it('DG3: distinct on consecutive calls', () => {
    const set = new Set();
    for (let i = 0; i < 50; i++) set.add(generateDoctorId('แพทย์'));
    expect(set.size).toBe(50);
  });
});
