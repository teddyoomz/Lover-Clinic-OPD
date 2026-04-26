// ─── Customer LINE Link Client — V32-tris-ter (2026-04-26) ──────────────
// Thin wrapper for /api/admin/customer-link. Used by the
// CustomerDetailView "ผูก LINE" button to mint a one-time token + QR
// for the customer to scan.

import { auth } from '../firebase.js';

const ENDPOINT = '/api/admin/customer-link';

async function getIdToken() {
  const u = auth?.currentUser;
  if (!u || typeof u.getIdToken !== 'function') {
    throw new Error('ต้องเข้าสู่ระบบก่อนเรียกใช้ /api/admin/customer-link');
  }
  return u.getIdToken();
}

/**
 * Mint a one-time LINE-link token for a customer.
 *
 * @param {Object} opts
 * @param {string} opts.customerId — be_customers doc id
 * @param {number} [opts.ttlMinutes] — token lifespan, default 1440 (24h),
 *                                      max 10080 (7d)
 * @returns {Promise<{ token, expiresAt, deepLink }>}
 */
export async function createCustomerLinkToken({ customerId, ttlMinutes } = {}) {
  if (!customerId) throw new Error('customerId required');
  const token = await getIdToken();
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action: 'create', customerId, ttlMinutes }),
  });
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    const err = new Error(body?.error || `customer-link create ล้มเหลว (HTTP ${res.status})`);
    err.code = body?.code;
    err.status = res.status;
    throw err;
  }
  return body;
}
