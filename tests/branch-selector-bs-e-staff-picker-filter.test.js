// ─── BS-E — Staff/doctor picker branch filter ──────────────────────────
// Pure helper tests for branchScopeUtils + source-grep wiring at the 5
// picker sites: AppointmentFormModal (doctor list) + SaleTab (sellers
// eager-load) + QuotationFormModal (sellers) + TreatmentFormPage
// (allStaff + allDoctors). ActorPicker is the SHARED dropdown
// component — no filter logic of its own; it just renders pre-filtered
// `sellers` prop.
//
// Backward-compat semantic locked: empty/missing branchIds[] = visible
// everywhere. Explicit non-empty branchIds[] = scoped subset.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  isStaffAccessibleInBranch,
  filterStaffByBranch,
  filterDoctorsByBranch,
} from '../src/lib/branchScopeUtils.js';

describe('BS-E.1 — isStaffAccessibleInBranch (single-doc check)', () => {
  it('returns true when staffDoc has empty branchIds (backward compat)', () => {
    expect(isStaffAccessibleInBranch({ id: 'STF-1', branchIds: [] }, 'BR-A')).toBe(true);
  });

  it('returns true when staffDoc has missing branchIds field', () => {
    expect(isStaffAccessibleInBranch({ id: 'STF-1' }, 'BR-A')).toBe(true);
  });

  it('returns true when staffDoc.branchIds includes the target branch', () => {
    expect(isStaffAccessibleInBranch({ branchIds: ['BR-A', 'BR-B'] }, 'BR-A')).toBe(true);
  });

  it('returns false when staffDoc.branchIds does NOT include target branch', () => {
    expect(isStaffAccessibleInBranch({ branchIds: ['BR-B'] }, 'BR-A')).toBe(false);
  });

  it('returns false when staffDoc is null', () => {
    expect(isStaffAccessibleInBranch(null, 'BR-A')).toBe(false);
  });

  it('returns true when no branchId argument passed (caller not wired yet)', () => {
    // Defensive: pickers that haven't been wired to BranchContext should
    // not silently break — without a target branchId the filter is a no-op.
    expect(isStaffAccessibleInBranch({ branchIds: ['BR-A'] }, null)).toBe(true);
    expect(isStaffAccessibleInBranch({ branchIds: ['BR-A'] }, '')).toBe(true);
  });

  it('coerces non-string branchIds to strings', () => {
    expect(isStaffAccessibleInBranch({ branchIds: [1, 2, 3] }, '2')).toBe(true);
    expect(isStaffAccessibleInBranch({ branchIds: ['1'] }, 1)).toBe(true);
  });
});

describe('BS-E.2 — filterStaffByBranch + filterDoctorsByBranch', () => {
  const mixed = [
    { id: 'A', branchIds: ['BR-A'] },          // scoped to BR-A
    { id: 'B', branchIds: [] },                 // visible everywhere
    { id: 'C', branchIds: ['BR-A', 'BR-B'] },   // scoped to A+B
    { id: 'D', branchIds: ['BR-B'] },           // scoped to BR-B
    { id: 'E' },                                // missing field → everywhere
  ];

  it('filters staff by branchId', () => {
    const a = filterStaffByBranch(mixed, 'BR-A').map(s => s.id).sort();
    expect(a).toEqual(['A', 'B', 'C', 'E']);
  });

  it('filters staff by different branchId', () => {
    const b = filterStaffByBranch(mixed, 'BR-B').map(s => s.id).sort();
    expect(b).toEqual(['B', 'C', 'D', 'E']);
  });

  it('returns all when branchId missing (legacy fallback)', () => {
    expect(filterStaffByBranch(mixed, null)).toEqual(mixed);
  });

  it('returns [] when input is non-array', () => {
    expect(filterStaffByBranch(null, 'BR-A')).toEqual([]);
    expect(filterStaffByBranch(undefined, 'BR-A')).toEqual([]);
  });

  it('filterDoctorsByBranch is a Rule-of-3 alias for filterStaffByBranch', () => {
    expect(filterDoctorsByBranch(mixed, 'BR-A')).toEqual(filterStaffByBranch(mixed, 'BR-A'));
  });
});

describe('BS-E.3 — Source-grep wiring: 5 picker sites use the helper / branch param', () => {
  const pickerFiles = {
    AppointmentFormModal: '../src/components/backend/AppointmentFormModal.jsx',
    TreatmentFormPage:    '../src/components/TreatmentFormPage.jsx',
    SaleTab:              '../src/components/backend/SaleTab.jsx',
    QuotationFormModal:   '../src/components/backend/QuotationFormModal.jsx',
  };

  it('AppointmentFormModal imports filterDoctorsByBranch + applies to listDoctors() output', () => {
    const src = readFileSync(resolve(__dirname, pickerFiles.AppointmentFormModal), 'utf-8');
    expect(src).toMatch(/import\s+\{\s*filterDoctorsByBranch\s*\}\s+from\s+['"][^'"]*branchScopeUtils/);
    expect(src).toMatch(/filterDoctorsByBranch\([^,)]+,\s*selectedBranchId\)/);
  });

  it('TreatmentFormPage imports filterStaffByBranch + filterDoctorsByBranch', () => {
    const src = readFileSync(resolve(__dirname, pickerFiles.TreatmentFormPage), 'utf-8');
    expect(src).toMatch(
      /import\s+\{[^}]*filterStaffByBranch[^}]*filterDoctorsByBranch[^}]*\}\s+from\s+['"][^'"]*branchScopeUtils/,
    );
    expect(src).toMatch(/filterStaffByBranch\(staffItems,\s*SELECTED_BRANCH_ID\)/);
    expect(src).toMatch(/filterDoctorsByBranch\(doctorItems,\s*SELECTED_BRANCH_ID\)/);
  });

  it('SaleTab passes branchId to listAllSellers (uses existing branch-aware helper)', () => {
    const src = readFileSync(resolve(__dirname, pickerFiles.SaleTab), 'utf-8');
    expect(src).toMatch(/listAllSellers\(\{\s*branchId:\s*BRANCH_ID\s*\}\)/);
  });

  it('QuotationFormModal passes branchId to listAllSellers', () => {
    const src = readFileSync(resolve(__dirname, pickerFiles.QuotationFormModal), 'utf-8');
    expect(src).toMatch(/listAllSellers\(\{\s*branchId:\s*selectedBranchId\s*\}\)/);
  });
});

describe('BS-E.4 — branchScopeUtils export contract', () => {
  const utilsSrc = readFileSync(
    resolve(__dirname, '../src/lib/branchScopeUtils.js'),
    'utf-8',
  );

  it('exports all 3 named functions', () => {
    expect(utilsSrc).toMatch(/export\s+function\s+isStaffAccessibleInBranch/);
    expect(utilsSrc).toMatch(/export\s+function\s+filterStaffByBranch/);
    expect(utilsSrc).toMatch(/export\s+function\s+filterDoctorsByBranch/);
  });

  it('documents the V36 backward-compat semantic', () => {
    expect(utilsSrc).toMatch(/V36/);
  });
});
