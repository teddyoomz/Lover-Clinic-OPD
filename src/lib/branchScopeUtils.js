// ─── Branch scope utilities (Phase BS, 2026-05-06) ───────────────────────
// Pure helpers for filtering staff / doctors by their per-staff branch
// access (`branchIds[]` field on be_staff + be_doctors).
//
// Backward-compat contract: empty/missing `branchIds[]` on a staff record
// means "accessible in every branch" — preserves pre-Phase-BS behavior for
// staff records imported from ProClinic that don't carry per-branch
// access metadata. Explicit non-empty `branchIds[]` is the only path that
// scopes the staff to a subset of branches.
//
// V36 lock: do NOT assume `branchIds.includes(x)` without the empty-fallback.
// Every consumer of these helpers must respect the all-branches semantic
// when branchIds is missing.
//
// Usage in pickers:
//   import { filterStaffByBranch } from '../../lib/branchScopeUtils.js';
//   const visibleStaff = filterStaffByBranch(allStaff, selectedBranchId);
//
// Tests in tests/branch-selector/BS-E-staff-picker-filter.test.js lock
// the contract.

/**
 * Check if a single staff/doctor doc is accessible in a given branch.
 *
 * @param {{branchIds?: string[]} | null | undefined} staffDoc
 * @param {string | null | undefined} branchId — current selected branch id
 * @returns {boolean}
 */
export function isStaffAccessibleInBranch(staffDoc, branchId) {
  if (!staffDoc) return false;
  // Empty/missing branchIds = accessible everywhere (backward compat).
  if (!Array.isArray(staffDoc.branchIds) || staffDoc.branchIds.length === 0) {
    return true;
  }
  // Explicit non-empty list — defensive: if no branchId argument passed,
  // treat as "any branch" (accessible). This covers callers that haven't
  // been wired to BranchContext yet — they keep working unchanged.
  if (!branchId) return true;
  const targetId = String(branchId);
  return staffDoc.branchIds.some((id) => String(id) === targetId);
}

/**
 * Filter a list of staff docs to those accessible in `branchId`.
 *
 * @param {Array<{branchIds?: string[]}>} staffList
 * @param {string | null | undefined} branchId
 * @returns {Array}
 */
export function filterStaffByBranch(staffList, branchId) {
  if (!Array.isArray(staffList)) return [];
  return staffList.filter((s) => isStaffAccessibleInBranch(s, branchId));
}

/**
 * Filter a list of doctor docs by branch access — alias for
 * `filterStaffByBranch` so consumers get a semantic name and the
 * implementation stays a single code path. Doctors and staff share the
 * branchIds[] schema (V20).
 *
 * @param {Array<{branchIds?: string[]}>} doctorList
 * @param {string | null | undefined} branchId
 * @returns {Array}
 */
export function filterDoctorsByBranch(doctorList, branchId) {
  return filterStaffByBranch(doctorList, branchId);
}
