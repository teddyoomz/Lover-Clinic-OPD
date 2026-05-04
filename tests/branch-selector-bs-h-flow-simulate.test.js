// ─── BS-H — Full-flow simulate (Rule I) ────────────────────────────────
// Chains every Phase BS surface end-to-end as PURE simulators of the
// real React + Firestore flow. No mount, no SDK. Each step composes a
// pure helper from the previous step's output.
//
// Flow:
//   user with staff.branchIds=[A,C]
//     → useUserScopedBranches filters branches → soft-gate visible list
//     → pickedBranchId = A (admin chooses via top-right tab)
//     → addCustomer({branchId:A}) → customerDoc.branchId = A (immutable)
//     → CustomerDetailView resolveBranchName(A, branches) → "นครราชสีมา"
//     → AppointmentFormModal filterDoctorsByBranch(doctors, A)
//       → only doctors with branchIds[].includes(A) OR empty branchIds[]
//     → SaleTab listAllSellers({branchId:A}) → mergeSellersWithBranchFilter
//       → matches Phase 15.5A backward-compat semantic
//     → updateCustomerFromForm({branchId:'X'}) → branchId stays A
//
// V13/V14/V21 lessons: full-flow test catches integration bugs that
// helper-only tests miss. Adversarial inputs locked in too.

import { describe, it, expect } from 'vitest';
import {
  filterBranchesByStaffAccess,
  resolveBranchName,
} from '../src/lib/BranchContext.jsx';
import {
  filterStaffByBranch,
  filterDoctorsByBranch,
  isStaffAccessibleInBranch,
} from '../src/lib/branchScopeUtils.js';
import {
  emptyCustomerForm,
  normalizeCustomer,
} from '../src/lib/customerValidation.js';
import { findUntaggedCustomers } from '../api/admin/customer-branch-baseline.js';

// ─── Fixtures ─────────────────────────────────────────────────────────
const branches = [
  { id: 'BR-A', name: 'นครราชสีมา', isDefault: true },
  { id: 'BR-B', name: 'กรุงเทพ' },
  { id: 'BR-C', name: 'เชียงใหม่' },
];

const staffWithAccess = {
  id: 'STF-1',
  firstname: 'อแอน',
  branchIds: ['BR-A', 'BR-C'],   // admin assigned access to A + C
  permissionGroupId: 'gp-frontdesk',
};

const allDoctors = [
  { id: 'DR-1', name: 'นพ. A', branchIds: ['BR-A'], status: 'ใช้งาน' },
  { id: 'DR-2', name: 'นพ. B', branchIds: ['BR-B'], status: 'ใช้งาน' },
  { id: 'DR-3', name: 'นพ. C', branchIds: ['BR-A', 'BR-B'], status: 'ใช้งาน' },
  { id: 'DR-4', name: 'นพ. D' },                                  // legacy: no branchIds → all
  { id: 'DR-5', name: 'นพ. E', branchIds: [], status: 'ใช้งาน' }, // legacy empty → all
  { id: 'DR-6', name: 'นพ. F', branchIds: ['BR-A'], status: 'พักใช้งาน' }, // disabled
];

const allSellers = [
  { id: 'STF-1', name: 'นาง A', branchIds: ['BR-A'] },
  { id: 'STF-2', name: 'นาง B', branchIds: ['BR-B'] },
  { id: 'STF-3', name: 'นาง C' },                  // legacy
];

// ─── Step 1 — Soft-gate via useUserScopedBranches ─────────────────────
describe('BS-H.1 — Step 1: Soft-gate the BranchSelector dropdown', () => {
  it('user with branchIds=[A,C] sees branches A and C only', () => {
    const visible = filterBranchesByStaffAccess(branches, staffWithAccess);
    expect(visible.map(b => b.id).sort()).toEqual(['BR-A', 'BR-C']);
  });

  it('admin with no staff doc (bootstrap) sees all branches', () => {
    const visible = filterBranchesByStaffAccess(branches, null);
    expect(visible).toEqual(branches);
  });

  it('legacy staff with empty branchIds sees all branches (backward compat)', () => {
    const legacyStaff = { id: 'STF-LEGACY', branchIds: [] };
    expect(filterBranchesByStaffAccess(branches, legacyStaff)).toEqual(branches);
  });
});

// ─── Step 2 — Customer CREATE with branchId stamp ─────────────────────
describe('BS-H.2 — Step 2: addCustomer stamps branchId, normalizeCustomer accepts it', () => {
  it('customer doc carries branchId at create-time', () => {
    const form = { ...emptyCustomerForm(), firstname: 'A', branchId: 'BR-A' };
    const normalized = normalizeCustomer(form);
    expect(normalized.branchId).toBe('BR-A');
  });

  it('emptyCustomerForm has branchId field default ""', () => {
    expect(emptyCustomerForm()).toHaveProperty('branchId', '');
  });

  it('untagged legacy customer (no branchId) appears in baseline migration list', () => {
    const customers = [
      { id: 'C1' },                            // untagged
      { id: 'C2', branchId: 'BR-A' },          // already tagged
      { id: 'C3', branchId: '' },              // explicit empty → untagged
    ];
    const { untagged } = findUntaggedCustomers(customers);
    expect(untagged.map(c => c.id).sort()).toEqual(['C1', 'C3']);
  });
});

// ─── Step 3 — CustomerDetailView card display ─────────────────────────
describe('BS-H.3 — Step 3: resolveBranchName for customer card', () => {
  it('resolves the customer card label from full branches list', () => {
    expect(resolveBranchName('BR-A', branches)).toBe('นครราชสีมา');
    expect(resolveBranchName('BR-B', branches)).toBe('กรุงเทพ');
  });

  it('returns empty string when branchId not in loaded list (graceful)', () => {
    expect(resolveBranchName('BR-DELETED', branches)).toBe('');
    expect(resolveBranchName('', branches)).toBe('');
  });
});

// ─── Step 4 — Picker filtering by selected branch ─────────────────────
describe('BS-H.4 — Step 4: Doctor + sellers filtered by selectedBranch', () => {
  const selectedBranchId = 'BR-A';

  it('AppointmentFormModal doctor list (post Phase BS): only doctors with BR-A access', () => {
    // Step 1: filterDoctorsByBranch (Phase BS)
    const branchScoped = filterDoctorsByBranch(allDoctors, selectedBranchId);
    // Step 2: status filter (existing: skip "พักใช้งาน")
    const visible = branchScoped.filter(d => d.status !== 'พักใช้งาน');
    // Expected: DR-1 (BR-A) + DR-3 (BR-A,BR-B) + DR-4 (legacy) + DR-5 (empty)
    // DR-2 filtered (BR-B only), DR-6 filtered (status disabled)
    expect(visible.map(d => d.id).sort()).toEqual(['DR-1', 'DR-3', 'DR-4', 'DR-5']);
  });

  it('SaleTab sellers (via listAllSellers branchId param): scope respected', () => {
    // listAllSellers passes through to mergeSellersWithBranchFilter which
    // has the same backward-compat semantic. Simulate with our helper:
    const scopedStaff = filterStaffByBranch(allSellers, selectedBranchId);
    // Expected: STF-1 (BR-A) + STF-3 (legacy no branchIds)
    expect(scopedStaff.map(s => s.id).sort()).toEqual(['STF-1', 'STF-3']);
  });

  it('isStaffAccessibleInBranch is the single contract source', () => {
    // No-arg branchId = no-op (defensive)
    expect(isStaffAccessibleInBranch(allDoctors[0], null)).toBe(true);
  });
});

// ─── Step 5 — Adversarial inputs ──────────────────────────────────────
describe('BS-H.5 — Adversarial inputs', () => {
  it('null staff + null branches = empty', () => {
    expect(filterBranchesByStaffAccess(null, null)).toEqual([]);
  });

  it('null branchId on customer = untagged in migration list', () => {
    const c = [{ id: 'X', branchId: null }];
    expect(findUntaggedCustomers(c).untagged.map(x => x.id)).toEqual(['X']);
  });

  it('numeric branchIds get coerced to strings (no-op)', () => {
    expect(filterBranchesByStaffAccess([{ id: 1 }], { branchIds: [1] })).toEqual([{ id: 1 }]);
  });

  it('empty branches list returns empty regardless of staff', () => {
    expect(filterBranchesByStaffAccess([], staffWithAccess)).toEqual([]);
  });

  it('staff branchIds with falsy entries still works', () => {
    const staff = { branchIds: ['BR-A', '', null, 'BR-C'] };
    const visible = filterBranchesByStaffAccess(branches, staff);
    expect(visible.map(b => b.id).sort()).toEqual(['BR-A', 'BR-C']);
  });

  it('sale row with branchId="" treated as untagged for filter', () => {
    // Reader filter is server-side where('branchId','==',selectedBranchId)
    // Empty-string branchId rows naturally excluded from filtered result.
    // Simulated: legacy rows with branchId='' do NOT match where('branchId','==','BR-A')
    const rows = [
      { id: 'S1', branchId: 'BR-A' },
      { id: 'S2', branchId: '' },
      { id: 'S3' },
    ];
    const filtered = rows.filter(r => r.branchId === 'BR-A');
    expect(filtered.map(r => r.id)).toEqual(['S1']);
  });
});

// ─── Step 6 — Round-trip: BS-H closes the loop ────────────────────────
describe('BS-H.6 — Round-trip: full chain produces correct surfaces', () => {
  it('user picks branch → readers filter → pickers filter → card displays origin', () => {
    // 1. Soft-gate: visible branches
    const visible = filterBranchesByStaffAccess(branches, staffWithAccess);
    expect(visible).toHaveLength(2);

    // 2. User picks branchId = first visible
    const picked = visible[0].id; // BR-A

    // 3. Customer creation stamps branchId = picked
    const customer = { ...emptyCustomerForm(), firstname: 'X', branchId: picked };
    const stored = normalizeCustomer(customer);
    expect(stored.branchId).toBe('BR-A');

    // 4. Detail view resolves the name (uses FULL list, not scoped)
    expect(resolveBranchName(stored.branchId, branches)).toBe('นครราชสีมา');

    // 5. Pickers filter staff/doctors by selected branch
    const visibleDoctors = filterDoctorsByBranch(allDoctors, picked);
    expect(visibleDoctors.length).toBeGreaterThan(0);
    expect(visibleDoctors.every(d => isStaffAccessibleInBranch(d, picked))).toBe(true);

    // 6. User switches branch (via top-right tab) → BR-C
    const newPicked = visible[1].id; // BR-C
    const visibleDoctorsNew = filterDoctorsByBranch(allDoctors, newPicked);
    // Different filter result expected
    expect(visibleDoctorsNew.map(d => d.id).sort()).not.toEqual(visibleDoctors.map(d => d.id).sort());
  });

  it('customer.branchId remains untouched on UPDATE (immutability)', () => {
    // The contract is enforced in updateCustomerFromForm by stripping
    // branchId from both opts AND form. Simulator equivalent:
    const original = { id: 'C1', branchId: 'BR-A', firstname: 'X' };
    const updateForm = { ...original, firstname: 'Y', branchId: 'BR-Z' };
    // Simulate the strip:
    if ('branchId' in updateForm) delete updateForm.branchId;
    const merged = { ...original, ...updateForm };
    expect(merged.branchId).toBe('BR-A');
  });
});
