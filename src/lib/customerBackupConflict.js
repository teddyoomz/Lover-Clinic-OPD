// src/lib/customerBackupConflict.js
// V74 — Pure conflict-resolution helpers for customer restore (Q3=B SAFE).

/**
 * Scan a backup customer doc against live system state. Returns a conflict
 * report — does NOT mutate anything.
 *
 * Conflict policy (Q3=B SAFE):
 *   - customerId already exists  → BLOCK at endpoint
 *   - HN collision (other customer has same HN) → BLOCK at endpoint
 *   - lineUserId_byBranch[X] taken by another customer at branch X → STRIP
 *     that entry at restore time + log to audit doc
 *   - stale FKs (deleted/hidden staff/doctor refs) → caller populates
 *     `staleFKs[]` separately from cross-doc FK scan; reported as-is, not
 *     auto-resolved (Phase 24.0 + V41 lookup-map handles missing-FK display)
 *
 * @param {object} args
 * @param {object} args.backupCustomer  Customer doc from backup file
 * @param {Array<object>} args.liveCustomers  Current be_customers docs
 * @returns {{customerIdExists: boolean, hnCollision: {takenBy, hn}|null, lineConflicts: Array, staleFKs: Array}}
 */
export function scanRestoreConflicts({ backupCustomer, liveCustomers }) {
  const backupCid = String(backupCustomer?.id || '');
  const backupHn = String(backupCustomer?.hn_no || '');
  const backupLineByBranch = backupCustomer?.lineUserId_byBranch || {};

  const live = Array.isArray(liveCustomers) ? liveCustomers : [];
  let customerIdExists = false;
  let hnCollision = null;
  const lineConflicts = [];

  for (const lc of live) {
    const lcId = String(lc?.id || '');
    const lcHn = String(lc?.hn_no || '');
    if (lcId === backupCid) customerIdExists = true;
    if (lcId !== backupCid && lcHn === backupHn && backupHn) {
      hnCollision = { takenBy: lcId, hn: backupHn };
    }
    const lcLineByBranch = lc?.lineUserId_byBranch || {};
    for (const [branchId, backupLineId] of Object.entries(backupLineByBranch)) {
      if (lcId === backupCid) continue;
      if (lcLineByBranch[branchId] === backupLineId && backupLineId) {
        lineConflicts.push({
          branchId,
          originalLineUserId: backupLineId,
          takenBy: lcId,
        });
      }
    }
  }

  return {
    customerIdExists,
    hnCollision,
    lineConflicts,
    staleFKs: [], // populated by caller from cross-doc FK scan if needed
  };
}

/**
 * Return a new customer doc with conflicting lineUserId_byBranch entries
 * removed. Original NOT mutated.
 *
 * @param {object} customer Customer doc to strip
 * @param {Array<{branchId: string}>} conflicts From scanRestoreConflicts.lineConflicts
 * @returns {object} New customer doc (or same object if no work needed)
 */
export function stripLineConflicts(customer, conflicts) {
  if (!customer || !Array.isArray(conflicts) || conflicts.length === 0) {
    return customer;
  }
  const original = customer.lineUserId_byBranch || {};
  if (Object.keys(original).length === 0) return customer;
  const conflictBranches = new Set(conflicts.map(c => c.branchId));
  const filtered = {};
  for (const [branchId, lineId] of Object.entries(original)) {
    if (!conflictBranches.has(branchId)) filtered[branchId] = lineId;
  }
  return { ...customer, lineUserId_byBranch: filtered };
}
