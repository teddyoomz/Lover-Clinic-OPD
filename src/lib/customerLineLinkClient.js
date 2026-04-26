// ─── Customer LINE Link Client — V33.4 (2026-04-27) ───────────────────
// Thin wrapper for /api/admin/customer-line-link. Used by:
//   - LinkLineInstructionsModal (suspend/resume/unlink action buttons)
//   - LinkRequestsTab "ผูกแล้ว" tab (list + same per-row actions)

import { auth } from '../firebase.js';

const ENDPOINT = '/api/admin/customer-line-link';

async function getIdToken() {
  const u = auth?.currentUser;
  if (!u || typeof u.getIdToken !== 'function') {
    throw new Error('ต้องเข้าสู่ระบบก่อนเรียกใช้ /api/admin/customer-line-link');
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
    const err = new Error(body?.error || `customer-line-link ${payload.action} ล้มเหลว (HTTP ${res.status})`);
    err.code = body?.code;
    err.status = res.status;
    throw err;
  }
  return body;
}

/** List every customer with a non-null lineUserId — for the "ผูกแล้ว" tab. */
export function listLinkedCustomers() {
  return call({ action: 'list-linked' });
}

/** Suspend bot Q&A for this linked customer (lineLinkStatus → 'suspended'). */
export function suspendLineLink(customerId) {
  if (!customerId) throw new Error('customerId required');
  return call({ action: 'suspend', customerId });
}

/** Resume bot Q&A (lineLinkStatus → 'active'). */
export function resumeLineLink(customerId) {
  if (!customerId) throw new Error('customerId required');
  return call({ action: 'resume', customerId });
}

/**
 * Fully unlink — clears lineUserId + lineLinkedAt + lineLinkStatus.
 * Customer can re-link by DM'ing their nationalId/passport again.
 * NO LINE push to customer (silent per V33.4 user choice "ตัดเงียบ").
 */
export function unlinkLineAccount(customerId) {
  if (!customerId) throw new Error('customerId required');
  return call({ action: 'unlink', customerId });
}

/**
 * V33.7 — Toggle bot reply language for this customer between 'th' and 'en'.
 * Bot picks up the new value on the customer's NEXT DM (no cache).
 *
 * @param {string} customerId
 * @param {'th'|'en'} language
 */
export function updateLineLinkLanguage(customerId, language) {
  if (!customerId) throw new Error('customerId required');
  if (language !== 'th' && language !== 'en') {
    throw new Error('language must be "th" or "en"');
  }
  return call({ action: 'update-language', customerId, language });
}
