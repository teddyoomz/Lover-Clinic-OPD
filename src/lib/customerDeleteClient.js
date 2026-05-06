// ─── customerDeleteClient — Phase 24.0 (2026-05-06) ─────────────────────────
// Thin client wrapper around POST /api/admin/delete-customer-cascade.
// Mirrors customerLineLink / customerBranchBaseline client wrappers.
//
// Why a wrapper module (not inline fetch in the modal):
//   - Token retrieval centralized (auth.currentUser.getIdToken)
//   - Error mapping (HTTP code → Thai message) lives in one place
//   - Easy to swap fetch impl in tests via vi.mock

import { auth } from '../firebase.js';

/**
 * Delete a customer cascade-style.
 *
 * @param {object} payload
 * @param {string} payload.customerId — be_customers/{id}
 * @param {object} payload.authorizedBy — { staffId, staffName, assistantId,
 *   assistantName, doctorId, doctorName } — all required non-empty strings
 * @returns {Promise<{success, customerId, cascadeCounts, auditDocId, totalDeletes}>}
 * @throws Error with .field / .status / .userMessage on validation/auth/server errors
 */
export async function deleteCustomerViaApi({ customerId, authorizedBy }) {
  const user = auth?.currentUser;
  if (!user) {
    const err = new Error('กรุณาเข้าสู่ระบบใหม่');
    err.userMessage = 'ไม่ได้ login';
    err.status = 401;
    throw err;
  }
  const idToken = await user.getIdToken();

  const res = await fetch('/api/admin/delete-customer-cascade', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify({ customerId, authorizedBy }),
  });

  let body = null;
  try { body = await res.json(); } catch { /* ignore */ }

  if (!res.ok) {
    const err = new Error(body?.error || `delete failed (HTTP ${res.status})`);
    err.userMessage = body?.error || 'การลบล้มเหลว';
    err.status = res.status;
    if (body?.field) err.field = body.field;
    throw err;
  }
  if (!body?.success) {
    const err = new Error(body?.error || 'unexpected server response');
    err.userMessage = body?.error || 'การลบล้มเหลว';
    err.status = 500;
    throw err;
  }
  return body;
}

/**
 * Phase 24.0 Issue #1 — fetch cascade counts WITHOUT deleting. Powers the
 * modal's pre-confirm preview row so admin sees what will be removed.
 *
 * Calls the same endpoint with `action: 'preview'`. Server returns
 * { success, customerId, cascadeCounts, exists } with NO audit doc and NO
 * mutation. Cheap.
 *
 * @param {object} payload
 * @param {string} payload.customerId — be_customers/{id}
 * @returns {Promise<{success, customerId, cascadeCounts, exists}>}
 * @throws Error with .userMessage / .status on auth/HTTP errors
 */
export async function previewCustomerDeleteViaApi({ customerId }) {
  const user = auth?.currentUser;
  if (!user) {
    const err = new Error('กรุณาเข้าสู่ระบบใหม่');
    err.userMessage = 'ไม่ได้ login';
    err.status = 401;
    throw err;
  }
  const idToken = await user.getIdToken();

  const res = await fetch('/api/admin/delete-customer-cascade', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify({ customerId, action: 'preview' }),
  });

  let body = null;
  try { body = await res.json(); } catch { /* ignore */ }

  if (!res.ok) {
    const err = new Error(body?.error || `preview failed (HTTP ${res.status})`);
    err.userMessage = body?.error || 'โหลด preview ล้มเหลว';
    err.status = res.status;
    throw err;
  }
  if (!body?.success) {
    const err = new Error(body?.error || 'unexpected preview response');
    err.userMessage = body?.error || 'โหลด preview ล้มเหลว';
    err.status = 500;
    throw err;
  }
  return body;
}
