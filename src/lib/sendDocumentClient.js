// ─── Send Document Client — Phase 14.9 (T3.e LINE-only) ─────────────────
// V32-tris-bis (2026-04-26) — thin client for /api/admin/send-document.
//
// LINE-ONLY by user directive (session 11): "SMTP ไม่ต้องทำ ไม่ต้องมีระบบ
// รับส่งเมล มีแค่ระบบ line official". Email path + blobToBase64 helper
// removed.
//
// Usage:
//   await sendDocumentLine({ recipient: '<lineUserId>', pdfUrl, message })

import { auth } from '../firebase.js';

const ENDPOINT = '/api/admin/send-document';

async function getIdToken() {
  const u = auth?.currentUser;
  if (!u || typeof u.getIdToken !== 'function') {
    throw new Error('ต้องเข้าสู่ระบบก่อนเรียกใช้ /api/admin/send-document');
  }
  return u.getIdToken();
}

async function callSendDocument(payload) {
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
  try { body = await res.json(); } catch { /* non-JSON response */ }
  if (!res.ok) {
    const err = new Error(body?.error || `send-document ${payload.type} ล้มเหลว (HTTP ${res.status})`);
    err.code = body?.code;
    err.status = res.status;
    throw err;
  }
  return body;
}

/**
 * Send a LINE message with an optional download link to a PDF.
 * (LINE Push API doesn't support direct PDF attachments — admin must
 * upload PDF separately, e.g. to Firebase Storage with a signed URL.)
 *
 * @param {Object} opts
 * @param {string} opts.recipient — LINE userId (NOT display name)
 * @param {string} [opts.pdfUrl] — public download URL
 * @param {string} [opts.message]
 * @returns {Promise<{ delivered: true, channel: 'line' }>}
 */
export async function sendDocumentLine({ recipient, pdfUrl, message }) {
  if (!recipient) throw new Error('recipient (LINE userId) required');
  return callSendDocument({
    type: 'line',
    recipient,
    pdfUrl,
    message,
  });
}
