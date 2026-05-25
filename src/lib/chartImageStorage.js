// 2026-05-22 EOD+2 — Treatment chart Storage-ref (architectural).
//
// Why: be_treatments.detail.charts[].dataUrl was inlined base64 PNG. With
// multiplier:2 + user-uploaded high-res templates, a single chart's dataUrl
// reached 2+ MiB → Firestore rejected the WHOLE treatment save with "Property
// detail contains an invalid nested entity" (per-field-value size limit /
// 1 MiB doc cap). Compressing was rejected by the user ("ข้อมูลสำคัญ" —
// chart images = clinical evidence). Architectural fix: upload the PNG to
// Firebase Storage, store only a small URL in the doc.
//
// Path: uploads/be_treatments/{customerOrTreatmentId}/chart-{ts}-{rand}.png
// Rule: existing storage.rules `match /uploads/{collection}/{docId}/{fileName}`
//       at line 122 — image/* MIME + 10MB cap + clinic-staff write — covers
//       this path. NO new rule deploy needed.
//
// Display: <img src={c.dataUrl}> works for both URL and legacy data: URL.
// Re-edit (ChartCanvas existingData): new Image() + img.crossOrigin='anonymous'
//   + img.src=URL → CORS-headers from Storage allow taintless canvas use.

import { storage } from '../firebase.js';
import { ref, uploadString, getDownloadURL, deleteObject } from 'firebase/storage';

// Mint a short crypto-random suffix (collision-safe for the path).
function mintShortRand() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    return Array.from(crypto.getRandomValues(new Uint8Array(6)))
      .map(b => b.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(16).slice(2, 14);
}

// Accepted MIME for a treatment blob: any image OR a PDF. The Firestore-doc-cap
// class-of-bug (charts 2026-05-22) is fixed for EVERY blob by uploading to
// Storage; storage.rules `uploads/{collection}/{docId}/{fileName}` already allows
// image/* + application/pdf (≤10MB, clinic-staff) so no rules change is needed.
const ALLOWED_BLOB_RE = /^data:(image\/[a-z0-9.+-]+|application\/pdf);/i;

/**
 * Upload ANY treatment blob (image OR pdf data URL) → Storage object.
 * Returns {url, storagePath}. The storagePath is stored alongside the URL so a
 * future delete (treatment-delete cascade / per-row remove) can locate the
 * object without parsing the URL.
 *
 * @param {object} opts
 * @param {string} opts.customerId — the "docId" path segment. New treatments
 *   don't have a treatmentId yet (createBackendTreatment mints it server-side);
 *   customerId keeps the path predictable + lets cleanup scan by customer.
 * @param {string} opts.dataUrl — full `data:image/*;base64,...` OR
 *   `data:application/pdf;base64,...` blob.
 * @param {string} [opts.kind='blob'] — filename prefix (e.g. 'photo', 'labimg',
 *   'labpdf', 'tfile', 'chart') — cosmetic; the stored contentType comes from
 *   the data-URL MIME, not the extension.
 * @returns {Promise<{url: string, storagePath: string}>}
 */
export async function uploadTreatmentBlob({ customerId, dataUrl, kind = 'blob' }) {
  if (!dataUrl || !ALLOWED_BLOB_RE.test(dataUrl)) {
    throw new Error('uploadTreatmentBlob: dataUrl missing or not an image/* | application/pdf data URL');
  }
  const docId = String(customerId || 'unknown').replace(/[^A-Za-z0-9_-]/g, '_');
  const ts = Date.now();
  const rand = mintShortRand();
  const mime = dataUrl.slice(5, dataUrl.indexOf(';')); // "image/png" / "application/pdf"
  let ext = mime.split('/')[1]?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  if (ext === 'jpeg') ext = 'jpg';
  else if (ext.startsWith('svg')) ext = 'svg';
  const safeKind = String(kind || 'blob').replace(/[^a-z0-9-]/gi, '') || 'blob';
  const storagePath = `uploads/be_treatments/${docId}/${safeKind}-${ts}-${rand}.${ext}`;
  const sref = ref(storage, storagePath);
  // uploadString accepts data URLs directly with format 'data_url'.
  await uploadString(sref, dataUrl, 'data_url');
  const url = await getDownloadURL(sref);
  return { url, storagePath };
}

/**
 * Upload a chart PNG (data URL → Storage object). Returns {url, storagePath}.
 * Thin wrapper over uploadTreatmentBlob (kind='chart') keeping the image-only
 * guard since charts are always canvas PNGs.
 * @param {object} opts
 * @param {string} opts.customerId
 * @param {string} opts.dataUrl — full `data:image/png;base64,...` blob.
 * @returns {Promise<{url: string, storagePath: string}>}
 */
export async function uploadChartImage({ customerId, dataUrl }) {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) {
    throw new Error('uploadChartImage: dataUrl missing or not a data:image/* URL');
  }
  return uploadTreatmentBlob({ customerId, dataUrl, kind: 'chart' });
}

/**
 * Best-effort delete of a chart Storage object. Used by treatment-delete
 * cascade + chart-row delete in ChartSection. Failure is non-fatal (the
 * Firestore doc is the source of truth; orphaned Storage objects cost ~0).
 *
 * @param {string} storagePath — the exact path returned by uploadChartImage.
 *   May also accept a parsed Firebase Storage URL (we extract the path).
 * @returns {Promise<boolean>} true on success, false on any error.
 */
export async function deleteChartImage(storagePath) {
  if (!storagePath || typeof storagePath !== 'string') return false;
  try {
    const path = storagePath.startsWith('http')
      ? extractStoragePathFromUrl(storagePath)
      : storagePath;
    if (!path) return false;
    await deleteObject(ref(storage, path));
    return true;
  } catch {
    return false;
  }
}

// Semantic alias for non-chart treatment blobs (photos / lab images / PDFs).
// Same logic — accepts a storagePath OR a Storage download URL.
export const deleteTreatmentBlob = deleteChartImage;

/**
 * Parse a Firebase Storage download URL → the Storage object path.
 * Format: https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{ENCODED_PATH}?alt=media&token=...
 * Returns the decoded path, or null on a non-matching URL.
 */
export function extractStoragePathFromUrl(url) {
  if (typeof url !== 'string') return null;
  const m = url.match(/\/o\/([^?]+)/);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return null; }
}

/**
 * True if the value is a legacy inline base64 dataUrl (NOT a Storage URL).
 * Used by chartEntryForPersist to decide whether to keep size-cap behavior.
 */
export function isInlineDataUrl(s) {
  return typeof s === 'string' && s.startsWith('data:');
}
