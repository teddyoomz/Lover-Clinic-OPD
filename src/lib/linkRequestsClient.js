// ─── Link Requests Client — V32-tris-quater (2026-04-26) ───────────────
// Thin wrapper for /api/admin/link-requests. Used by LinkRequestsTab to
// list pending requests + approve/reject.

import { auth } from '../firebase.js';

const ENDPOINT = '/api/admin/link-requests';

async function getIdToken() {
  const u = auth?.currentUser;
  if (!u || typeof u.getIdToken !== 'function') {
    throw new Error('ต้องเข้าสู่ระบบก่อนเรียกใช้ /api/admin/link-requests');
  }
  return u.getIdToken();
}

async function call(payload) {
  const token = await getIdToken();
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    const err = new Error(body?.error || `link-requests ${payload.action} ล้มเหลว (HTTP ${res.status})`);
    err.code = body?.code;
    err.status = res.status;
    throw err;
  }
  return body;
}

/**
 * List link requests (default: pending). Returns { items: [...] }.
 *
 * Phase BS V2 (2026-05-06) — opts now accept {branchId, allBranches}. When
 * branchId given AND !allBranches, the server filters the pending queue to
 * that branch (plus legacy untagged requests so admins don't lose them).
 */
export function listLinkRequests({ status = 'pending', branchId, allBranches } = {}) {
  return call({ action: 'list', status, branchId, allBranches });
}

/** Approve a pending request. Writes lineUserId onto customer + pushes LINE notif. */
export function approveLinkRequest(requestId) {
  if (!requestId) throw new Error('requestId required');
  return call({ action: 'approve', requestId });
}

/** Reject a pending request. Pushes LINE notif. */
export function rejectLinkRequest(requestId, reason = '') {
  if (!requestId) throw new Error('requestId required');
  return call({ action: 'reject', requestId, reason });
}
