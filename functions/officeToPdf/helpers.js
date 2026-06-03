// functions/officeToPdf/helpers.js
//
// (2026-05-22 EOD+2 — T4) Pure JS helpers for the officeToPdf Cloud Function.
// No firebase-admin / fs / network deps — unit-testable in isolation.
//
// 🔒 Rule-of-3 NOTE: this file DUPLICATES OFFICE_CONVERTIBLE_MIMES + OfficePreviewStatus
// from `src/lib/staffChatOfficePreviewCore.js` because the Cloud Function deploys
// as a self-contained npm package and CANNOT reach `../../src/lib/...` at deploy
// time. The duplication is a SANCTIONED Rule-of-3 exception at the deploy
// boundary. Both files MUST stay in lock-step — any change to the MIME whitelist
// or status constants requires updating BOTH locations. Source-grep regression
// test in tests/staff-chat-office-preview-source-grep.test.js (T8) verifies the
// two stay aligned.

export const OFFICE_CONVERTIBLE_MIMES = new Set([
  'application/msword',                                                                  // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',             // .docx
  'application/vnd.ms-excel',                                                            // .xls
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',                   // .xlsx
  'application/vnd.ms-powerpoint',                                                       // .ppt
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',           // .pptx
  'text/csv',                                                                            // .csv
]);

export function isOfficeConvertible(mime) {
  if (typeof mime !== 'string') return false;
  return OFFICE_CONVERTIBLE_MIMES.has(mime.toLowerCase().trim());
}

export const OfficePreviewStatus = Object.freeze({
  PENDING: 'pending',
  READY: 'ready',
  FAILED: 'failed',
  UNSUPPORTED: 'unsupported',
});

const MIME_TO_EXT = Object.freeze({
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/csv': 'csv',
});

export function extensionForMime(mime) {
  if (typeof mime !== 'string') return 'bin';
  return MIME_TO_EXT[mime.toLowerCase().trim()] || 'bin';
}

export function deriveOutputPath(originalPath) {
  if (typeof originalPath !== 'string') {
    throw new Error('originalPath must be a string');
  }
  return originalPath + '.pdf';
}

export function deriveFailureReason({ kind } = {}) {
  switch (kind) {
    case 'password-protected':
      return 'แปลงไฟล์ไม่ได้ — ไฟล์มีรหัสผ่าน';
    case 'corrupt':
      return 'แปลงไฟล์ไม่ได้ — ไฟล์อาจเสียหาย';
    case 'timeout':
      return 'แปลงไฟล์ไม่ได้ — ใช้เวลานานเกินไป';
    case 'unsupported-format':
      return 'แปลงไฟล์ไม่ได้ — รูปแบบไฟล์ไม่รองรับ';
    default:
      return 'แปลงไฟล์ไม่ได้';
  }
}

// Classify a Gotenberg / LibreOffice error message into one of the
// deriveFailureReason() input kinds. Order matters — more-specific matches
// (password) take precedence over more-generic ones (corrupt).
export function classifyGotenbergError(message) {
  if (typeof message !== 'string' || !message) return 'unknown';
  const lower = message.toLowerCase();
  if (/password|encrypt/.test(lower)) return 'password-protected';
  if (/timeout|timed[\s-]?out/.test(lower)) return 'timeout';
  if (/corrupt|invalid file|malformed/.test(lower)) return 'corrupt';
  if (/unsupported|format not supported/.test(lower)) return 'unsupported-format';
  return 'unknown';
}

// (2026-06-03 EOD+4 — S2 race fix) Patch the matching attachments[i] entry of a
// staff-chat message doc in a runTransaction, WITH a bounded retry when the doc
// doesn't exist YET. Why the retry: the composer creates the message doc only
// AFTER every upload in the batch finishes (it awaits onPrepareAndUpload, then
// onSend→setDoc). A fast Office conversion (download + Gotenberg + upload +
// patch ≈ 1-2s) sent ALONGSIDE a large file (still uploading for many seconds)
// can run BEFORE the doc is created → the pre-fix code saw !snap.exists, warned,
// and returned → the status patch was LOST → the attachment stayed 'pending' →
// ⚠. Retrying re-checks until the doc appears (or gives up after the window).
//
// Firebase-admin-free (db + messageRef are injected) so it unit-tests in
// isolation. `sleep` + `now` are injectable for deterministic tests.
//
// Returns: 'ok' | 'no-attachment' (doc exists but this attachment isn't in it —
// don't retry) | 'no-doc-timeout' (doc never appeared within the window).
export async function patchOfficeAttachment({
  db, messageRef, filePath, patch,
  maxAttempts = 6, delayMs = 2000, sleep, now,
} = {}) {
  const doSleep = typeof sleep === 'function' ? sleep : (ms) => new Promise((r) => setTimeout(r, ms));
  const stamp = typeof now === 'function' ? now : () => new Date();
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // eslint-disable-next-line no-await-in-loop
    const outcome = await db.runTransaction(async (tx) => {
      const snap = await tx.get(messageRef);
      if (!snap.exists) return 'no-doc';
      const data = snap.data() || {};
      const atts = Array.isArray(data.attachments) ? data.attachments.slice() : [];
      const idx = atts.findIndex((a) => a && a.fullPath === filePath);
      if (idx === -1) return 'no-attachment';
      atts[idx] = { ...atts[idx], ...patch, pdfPreviewedAt: stamp() };
      tx.update(messageRef, { attachments: atts });
      return 'ok';
    });
    if (outcome === 'ok' || outcome === 'no-attachment') return outcome;
    // outcome === 'no-doc' → wait for the late setDoc, then retry.
    // eslint-disable-next-line no-await-in-loop
    if (attempt < maxAttempts - 1) await doSleep(delayMs);
  }
  return 'no-doc-timeout';
}
