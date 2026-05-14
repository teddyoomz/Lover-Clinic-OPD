import { describe, it, expect } from 'vitest';
import {
  emptyRecallCaseForm,
  normalizeRecallCase,
  validateRecallCase,
  findRecallCaseByName,
} from '../src/lib/recallCaseValidation.js';

describe('Phase 29.22 · L1 — recallCaseValidation', () => {
  describe('emptyRecallCaseForm', () => {
    it('L1.1 returns blank form shape', () => {
      const f = emptyRecallCaseForm();
      expect(f).toEqual({ caseName: '', defaultDays: 7, isHidden: false });
    });
  });

  describe('normalizeRecallCase', () => {
    it('L1.2 trims caseName + coerces defaultDays to integer', () => {
      const out = normalizeRecallCase({ caseName: '  PRP 7d  ', defaultDays: '7.4', isHidden: false });
      expect(out.caseName).toBe('PRP 7d');
      expect(out.defaultDays).toBe(7);
      expect(out.isHidden).toBe(false);
    });

    it('L1.3 null/undefined input → safe default', () => {
      expect(normalizeRecallCase(null)).toEqual({ caseName: '', defaultDays: 0, isHidden: false });
      expect(normalizeRecallCase(undefined)).toEqual({ caseName: '', defaultDays: 0, isHidden: false });
    });

    it('L1.4 preserves isHidden booleanish', () => {
      expect(normalizeRecallCase({ isHidden: true }).isHidden).toBe(true);
      expect(normalizeRecallCase({ isHidden: 'true' }).isHidden).toBe(true);
      expect(normalizeRecallCase({ isHidden: 0 }).isHidden).toBe(false);
    });
  });

  describe('validateRecallCase', () => {
    it('L1.5 valid input → null (no error)', () => {
      expect(validateRecallCase({ caseName: 'PRP 7d', defaultDays: 7 })).toBeNull();
    });

    it('L1.6 empty caseName → error', () => {
      expect(validateRecallCase({ caseName: '', defaultDays: 7 })).toMatch(/ชื่อเคส/);
      expect(validateRecallCase({ caseName: '   ', defaultDays: 7 })).toMatch(/ชื่อเคส/);
    });

    it('L1.7 caseName > 100 chars → error', () => {
      expect(validateRecallCase({ caseName: 'X'.repeat(101), defaultDays: 7 })).toMatch(/100/);
    });

    it('L1.8 defaultDays out of range → error', () => {
      expect(validateRecallCase({ caseName: 'X', defaultDays: 0 })).toMatch(/วัน|ระยะเวลา/);
      expect(validateRecallCase({ caseName: 'X', defaultDays: 366 })).toMatch(/วัน|ระยะเวลา/);
      expect(validateRecallCase({ caseName: 'X', defaultDays: -1 })).toMatch(/วัน|ระยะเวลา/);
    });
  });

  describe('findRecallCaseByName', () => {
    const cases = [
      { caseId: 'C1', caseName: 'PRP 7-day', defaultDays: 7, isHidden: false },
      { caseId: 'C2', caseName: 'Botox 14-day', defaultDays: 14, isHidden: false },
      { caseId: 'C3', caseName: 'Old Hidden Case', defaultDays: 30, isHidden: true },
    ];

    it('L1.9 case-insensitive trim match', () => {
      expect(findRecallCaseByName(cases, '  prp 7-day  ').caseId).toBe('C1');
      expect(findRecallCaseByName(cases, 'BOTOX 14-DAY').caseId).toBe('C2');
    });

    it('L1.10 hidden cases excluded from lookup', () => {
      expect(findRecallCaseByName(cases, 'Old Hidden Case')).toBeNull();
    });

    it('L1.11 missing name → null', () => {
      expect(findRecallCaseByName(cases, '')).toBeNull();
      expect(findRecallCaseByName(cases, '   ')).toBeNull();
      expect(findRecallCaseByName([], 'X')).toBeNull();
    });
  });
});
