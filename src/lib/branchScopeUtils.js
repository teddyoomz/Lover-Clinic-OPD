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

/**
 * Count a staff/doctor's branch memberships that resolve against the LIVE
 * branch list (AV193, 2026-06-10).
 *
 * Branch deletion does NOT cascade-clean `branchIds[]` on be_staff /
 * be_doctors (Rule H soft-keep), so stored arrays can carry orphan ids —
 * e.g. the V81 test-fixture branch `TEST-V81-TS-BR-…` that left OoMz + Mild
 * showing "สาขา: 4 สาขา" while only 3 branches existed. Any UI that renders
 * a branch-membership COUNT must use this instead of raw `branchIds.length`.
 *
 * - ids are deduped (a duplicate id is one membership)
 * - branch docs match on `branchId` OR `id` (same chain BranchContext uses)
 * - empty/not-loaded `branches` → raw unique-count fallback, so
 *   provider-absent mounts (tests, early render) keep today's behavior
 *   instead of flashing a misleading 0
 *
 * @param {string[] | null | undefined} branchIds — stored membership array
 * @param {Array<{branchId?: string, id?: string}> | null | undefined} branches — live be_branches list
 * @returns {number}
 */
export function countLiveBranchMemberships(branchIds, branches) {
  if (!Array.isArray(branchIds)) return 0;
  const ids = new Set(
    branchIds.filter((x) => x !== null && x !== undefined && String(x) !== '').map((x) => String(x)),
  );
  if (ids.size === 0) return 0;
  const live = Array.isArray(branches) ? branches : [];
  const liveSet = new Set(
    live.map((b) => String(b?.branchId || b?.id || '')).filter(Boolean),
  );
  if (liveSet.size === 0) return ids.size; // branch list not loaded — defensive raw fallback
  let n = 0;
  for (const id of ids) if (liveSet.has(id)) n++;
  return n;
}
