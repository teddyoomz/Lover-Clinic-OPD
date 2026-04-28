// ─── stockWithdrawalApprovalClient — Phase 15.5B (2026-04-28) ──────────────
// Firebase ID-token wrapper for /api/admin/stock-withdrawal-approve.
// Mirrors the pattern from customerLineLinkClient.js (Phase 12.0).

import { auth } from '../firebase.js';

/**
 * Approve a pending stock withdrawal (status=0).
 * Records audit movement type=15 + sets approvalNote/approvedByUser/approvedAt
 * on the withdrawal doc. Status STAYS at 0 — warehouse staff still has to
 * click "ส่งสินค้า" to dispatch (separate approval ↔ dispatch as per SOP).
 *
 * @param {object} args
 * @param {string} args.withdrawalId
 * @param {string} [args.note]  — optional approval note (max 500 chars)
 * @returns {Promise<{ withdrawalId, status, approvedAt, movementId, alreadyApproved? }>}
 */
export async function approveStockWithdrawal({ withdrawalId, note } = {}) {
  return submit({ action: 'approve', withdrawalId, note });
}

/**
 * Reject a pending stock withdrawal (status=0).
 * Flips status to 3 (CANCELLED) + records audit movement type=16 +
 * sets rejectionReason/rejectedByUser/rejectedAt on the withdrawal doc.
 *
 * @param {object} args
 * @param {string} args.withdrawalId
 * @param {string} [args.reason]  — optional rejection reason (max 500 chars)
 * @returns {Promise<{ withdrawalId, status, rejectedAt, movementId }>}
 */
export async function rejectStockWithdrawal({ withdrawalId, reason } = {}) {
  return submit({ action: 'reject', withdrawalId, reason });
}

async function submit(body) {
  if (!auth?.currentUser) {
    throw new Error('ต้อง login ก่อนใช้งาน');
  }
  const token = await auth.currentUser.getIdToken();
  const res = await fetch('/api/admin/stock-withdrawal-approve', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `ขออนุมัติ/ปฏิเสธไม่สำเร็จ (HTTP ${res.status})`;
    try {
      const err = await res.json();
      if (err?.error) msg = err.error;
    } catch { /* keep default */ }
    throw new Error(msg);
  }
  return res.json();
}
