// ─── Customer Branch Baseline Client — Phase BS (2026-05-06) ─────────────
// Thin client for /api/admin/customer-branch-baseline. Two-phase flow:
//   1. listUntaggedCustomers() → DRY-RUN; returns the list of customers
//      missing branchId so admin can review before mutation.
//   2. applyCustomerBranchBaseline({ targetBranchId, confirmCustomerIds })
//      → writes branchId on each confirmed customer doc + audit row.
//
// Endpoint guards admin claim (V25/V26). Non-admin tokens get 401 from
// verifyAdminToken; thrown Error bubbles up to the MasterDataTab UI.
//
// /api/admin/* is an allowed exception to rule E (see 03-stack.md #7).

import { auth } from '../firebase.js';

const ENDPOINT = '/api/admin/customer-branch-baseline';

async function getIdToken() {
  const u = auth?.currentUser;
  if (!u || typeof u.getIdToken !== 'function') {
    throw new Error('ต้องเข้าสู่ระบบก่อนเรียกใช้ api/admin/customer-branch-baseline');
  }
  return u.getIdToken();
}

async function callBaseline(action, params = {}) {
  const token = await getIdToken();
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action, ...params }),
  });
  let payload = null;
  try { payload = await res.json(); } catch { /* non-JSON response */ }
  if (!res.ok || !payload?.success) {
    const msg = payload?.error || `customer-branch-baseline ${action} ล้มเหลว (HTTP ${res.status})`;
    throw new Error(msg);
  }
  return payload.data;
}

/**
 * DRY-RUN — list customers without a branchId tag.
 *
 * @returns {Promise<{ untagged: Array<{customerId, hn, name, branchId}>, total: number, totalCustomers: number }>}
 */
export function listUntaggedCustomers() {
  return callBaseline('list');
}

/**
 * Apply baseline branchId to a confirmed subset of untagged customers.
 *
 * @param {{ targetBranchId: string, confirmCustomerIds: string[] }} params
 * @returns {Promise<{ updatedCount: number, updated: string[], auditId: string }>}
 */
export function applyCustomerBranchBaseline({ targetBranchId, confirmCustomerIds }) {
  return callBaseline('apply', { targetBranchId, confirmCustomerIds });
}
