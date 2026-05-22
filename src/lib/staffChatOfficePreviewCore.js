// src/lib/staffChatOfficePreviewCore.js
//
// (2026-05-22 EOD+2) Pure JS — no React, no Firebase. Shared by:
//   - client UI (StaffChatAttachmentCard) for state derivation
//   - client send path (staffChatClient.buildMessageDoc) for pending-stamp
//   - source-grep test contracts (T8)
// The Cloud Function at functions/officeToPdf/ keeps its own canonical
// copy of the MIME whitelist + status constants so it can deploy as a
// self-contained Cloud Run image without a relative import escape (see T4).
//
// Rule of 3 alignment in src/ — single source of truth for "what counts as
// Office" inside the client bundle.
//
// Scope (Q3=C from spec 2026-05-22): Word + Excel + PowerPoint + CSV.

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

// Pure UI derivation — takes an attachment record (from a Firestore message
// doc) and returns one of:
//   'na'          — not an Office attachment → no preview affordance
//   'pending'     — Office MIME, conversion in flight (or status missing on legacy)
//   'ready'       — Office MIME, PDF cached, has pdfPreviewUrl
//   'failed'      — Office MIME, conversion failed (read pdfPreviewError for tooltip)
//   'unsupported' — Office MIME the server rejected (reserved; not produced by
//                   the current Cloud Function because the MIME gate already
//                   rejects non-whitelist files at the trigger boundary)
export function pdfPreviewStateOf(att) {
  if (!att || typeof att !== 'object') return 'na';
  if (!isOfficeConvertible(att.mimeType)) return 'na';
  const status = att.pdfPreviewStatus;
  if (status === OfficePreviewStatus.READY) {
    // Defensive: ready requires a URL. Without one, fall back to pending so
    // the user sees the spinner (correct UX) rather than a 👁 button that
    // would no-op or open an empty overlay.
    return (typeof att.pdfPreviewUrl === 'string' && att.pdfPreviewUrl.length > 0)
      ? OfficePreviewStatus.READY
      : OfficePreviewStatus.PENDING;
  }
  if (status === OfficePreviewStatus.FAILED) return OfficePreviewStatus.FAILED;
  if (status === OfficePreviewStatus.UNSUPPORTED) return OfficePreviewStatus.UNSUPPORTED;
  // Any other value (missing, undefined, garbage type) → pending (legacy/inflight)
  return OfficePreviewStatus.PENDING;
}
