// ─── Send Document Client — Phase 14.9 (T3.e) ───────────────────────────
// V32-tris-bis (2026-04-26) — thin client for /api/admin/send-document.
// Wraps email + LINE delivery with Firebase ID token auth + friendly error
// classification (CONFIG_MISSING vs runtime error).
//
// Usage:
//   await sendDocumentEmail({ recipient: 'a@b.com', pdfBlob, filename, subject, message })
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

/**
 * Convert a Blob to base64 (no `data:` prefix).
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
export async function blobToBase64(blob) {
  if (!(blob instanceof Blob)) throw new Error('blobToBase64: input must be Blob');
  // FileReader.readAsDataURL → strip 'data:application/pdf;base64,' prefix
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = String(reader.result || '');
      const idx = dataUrl.indexOf(',');
      resolve(idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl);
    };
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
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
 * Send a PDF document via email.
 * @param {Object} opts
 * @param {string} opts.recipient — email address
 * @param {Blob} opts.pdfBlob
 * @param {string} [opts.filename]
 * @param {string} [opts.subject]
 * @param {string} [opts.message]
 * @returns {Promise<{ delivered: true, channel: 'email' }>}
 */
export async function sendDocumentEmail({ recipient, pdfBlob, filename, subject, message }) {
  if (!recipient) throw new Error('recipient (email) required');
  if (!(pdfBlob instanceof Blob)) throw new Error('pdfBlob (Blob) required');
  const pdfBase64 = await blobToBase64(pdfBlob);
  return callSendDocument({
    type: 'email',
    recipient,
    pdfBase64,
    filename: filename || 'document.pdf',
    subject,
    message,
  });
}

/**
 * Send a LINE message with a download link to the PDF (LINE Push API
 * doesn't support direct PDF attachments — admin must upload PDF
 * separately, e.g. to Firebase Storage with a signed URL).
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
