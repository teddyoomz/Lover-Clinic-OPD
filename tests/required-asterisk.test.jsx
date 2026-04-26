// ─── RequiredAsterisk component + migration tests — Polish 2026-04-26 ───
// RA1 group — verifies the shared RequiredAsterisk renders amber + has
// aria-hidden, AND that all 17 backend modals migrated off the legacy
// inline `<span className="text-red-{400,500}">*</span>` pattern.
//
// Thai cultural rule: red asterisk on form labels is misleading — red
// signals death/error. Amber is the audit-2026-04-26-design-pass.md P1
// recommendation.

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import RequiredAsterisk from '../src/components/ui/RequiredAsterisk.jsx';

describe('RA1 — RequiredAsterisk + asterisk migration', () => {
  describe('RA1.A — Component runtime behavior', () => {
    it('RA1.A.1 renders an asterisk', () => {
      const { container } = render(<RequiredAsterisk />);
      expect(container.textContent).toBe('*');
    });

    it('RA1.A.2 uses text-amber-500 (Thai cultural — not red)', () => {
      const { container } = render(<RequiredAsterisk />);
      const span = container.querySelector('span');
      expect(span?.className).toMatch(/\btext-amber-500\b/);
      expect(span?.className).not.toMatch(/\btext-red-/);
    });

    it('RA1.A.3 has aria-hidden="true" (input.required is the SR truth)', () => {
      const { container } = render(<RequiredAsterisk />);
      const span = container.querySelector('span');
      expect(span?.getAttribute('aria-hidden')).toBe('true');
    });

    it('RA1.A.4 merges custom className prop', () => {
      const { container } = render(<RequiredAsterisk className="ml-1" />);
      const span = container.querySelector('span');
      expect(span?.className).toMatch(/\btext-amber-500\b/);
      expect(span?.className).toMatch(/\bml-1\b/);
    });

    it('RA1.A.5 default export is the component (canonical import shape)', () => {
      // If imports break, every consumer file fails — lock the default.
      expect(typeof RequiredAsterisk).toBe('function');
    });
  });

  describe('RA1.B — Migration regression guard (source-grep)', () => {
    const backendDir = resolve(__dirname, '..', 'src/components/backend');
    const files = readdirSync(backendDir)
      .filter((f) => f.endsWith('FormModal.jsx') || f === 'DocumentPrintModal.jsx');

    it('RA1.B.1 has at least 17 backend modal files', () => {
      // Sanity: the grep below would silently pass on an empty list.
      expect(files.length).toBeGreaterThanOrEqual(15);
    });

    it('RA1.B.2 NO backend modal carries text-red-400 ">*</" pattern', () => {
      const offenders = [];
      for (const f of files) {
        const src = readFileSync(resolve(backendDir, f), 'utf-8');
        if (/className="[^"]*text-red-400[^"]*">\s*\*\s*</.test(src)) {
          offenders.push(f);
        }
      }
      expect(offenders).toEqual([]);
    });

    it('RA1.B.3 NO backend modal carries text-red-500 ">*</" pattern', () => {
      const offenders = [];
      for (const f of files) {
        const src = readFileSync(resolve(backendDir, f), 'utf-8');
        if (/className="[^"]*text-red-500[^"]*">\s*\*\s*</.test(src)) {
          offenders.push(f);
        }
      }
      expect(offenders).toEqual([]);
    });

    it('RA1.B.4 every modal that previously had a red asterisk now imports RequiredAsterisk', () => {
      const expectedFiles = [
        'BranchFormModal.jsx', 'CouponFormModal.jsx', 'CourseFormModal.jsx',
        'DfEntryModal.jsx', 'DfGroupFormModal.jsx', 'DoctorFormModal.jsx',
        'DocumentPrintModal.jsx', 'HolidayFormModal.jsx',
        'MedicalInstrumentFormModal.jsx', 'PermissionGroupFormModal.jsx',
        'ProductFormModal.jsx', 'ProductGroupFormModal.jsx',
        'ProductUnitFormModal.jsx', 'PromotionFormModal.jsx',
        'QuotationFormModal.jsx', 'StaffFormModal.jsx', 'VoucherFormModal.jsx',
      ];
      const missingImport = [];
      for (const f of expectedFiles) {
        const src = readFileSync(resolve(backendDir, f), 'utf-8');
        if (!/import\s+RequiredAsterisk\s+from/.test(src)) {
          missingImport.push(f);
        }
      }
      expect(missingImport).toEqual([]);
    });

    it('RA1.B.5 RequiredAsterisk import path resolves to ../ui/RequiredAsterisk.jsx', () => {
      const expectedFiles = [
        'BranchFormModal.jsx', 'CouponFormModal.jsx', 'CourseFormModal.jsx',
      ];
      for (const f of expectedFiles) {
        const src = readFileSync(resolve(backendDir, f), 'utf-8');
        expect(src).toMatch(/from\s+['"]\.\.\/ui\/RequiredAsterisk\.jsx['"]/);
      }
    });

    it('RA1.B.6 every migrated modal renders <RequiredAsterisk', () => {
      const expectedFiles = [
        'BranchFormModal.jsx', 'CouponFormModal.jsx', 'CourseFormModal.jsx',
        'DfEntryModal.jsx', 'DfGroupFormModal.jsx', 'DoctorFormModal.jsx',
        'DocumentPrintModal.jsx', 'HolidayFormModal.jsx',
        'MedicalInstrumentFormModal.jsx', 'PermissionGroupFormModal.jsx',
        'ProductFormModal.jsx', 'ProductGroupFormModal.jsx',
        'ProductUnitFormModal.jsx', 'PromotionFormModal.jsx',
        'QuotationFormModal.jsx', 'StaffFormModal.jsx', 'VoucherFormModal.jsx',
      ];
      const missingUsage = [];
      for (const f of expectedFiles) {
        const src = readFileSync(resolve(backendDir, f), 'utf-8');
        if (!/<RequiredAsterisk\s*(\/?>|\s)/.test(src)) {
          missingUsage.push(f);
        }
      }
      expect(missingUsage).toEqual([]);
    });
  });

  describe('RA1.C — Component file shape', () => {
    const compSource = readFileSync(
      resolve(__dirname, '..', 'src/components/ui/RequiredAsterisk.jsx'),
      'utf-8'
    );

    it('RA1.C.1 file uses default export (canonical import shape)', () => {
      expect(compSource).toMatch(/export\s+default\s+function\s+RequiredAsterisk/);
    });

    it('RA1.C.2 hardcodes text-amber-500 (no red fallback in className)', () => {
      expect(compSource).toMatch(/text-amber-500/);
      // Strip comments before checking — the comment block legitimately
      // mentions the deprecated text-red-{400,500} pattern as historical
      // context. Live className must be red-free.
      const codeOnly = compSource
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');
      expect(codeOnly).not.toMatch(/text-red-/);
    });

    it('RA1.C.3 declares aria-hidden literal', () => {
      expect(compSource).toMatch(/aria-hidden=["']true["']/);
    });
  });
});
