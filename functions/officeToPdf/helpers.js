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
