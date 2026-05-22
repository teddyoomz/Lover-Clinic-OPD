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

/**
 * Upload a chart PNG (data URL → Storage object). Returns {url, storagePath}.
 * The storagePath is stored alongside the URL so a future delete (treatment-
 * delete cascade) can locate the object without parsing the URL.
 *
 * @param {object} opts
 * @param {string} opts.customerId — used as the "docId" segment of the path.
 *   For new treatments we don't have a treatmentId yet (createBackendTreatment
 *   mints it server-side); customerId keeps the path predictable + lets cleanup
 *   scan by customer if ever needed.
 * @param {string} opts.dataUrl — full `data:image/png;base64,...` blob.
 * @returns {Promise<{url: string, storagePath: string}>}
 */
export async function uploadChartImage({ customerId, dataUrl }) {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) {
    throw new Error('uploadChartImage: dataUrl missing or not a data:image/* URL');
  }
  const docId = String(customerId || 'unknown').replace(/[^A-Za-z0-9_-]/g, '_');
  const ts = Date.now();
  const rand = mintShortRand();
  // Match the file-name to the actual MIME in the dataUrl (png most common).
  const mime = dataUrl.slice(5, dataUrl.indexOf(';')); // "image/png" etc
  const ext = mime.split('/')[1]?.toLowerCase().replace(/[^a-z]/g, '') || 'png';
  const storagePath = `uploads/be_treatments/${docId}/chart-${ts}-${rand}.${ext}`;
  const sref = ref(storage, storagePath);
  // uploadString accepts data URLs directly with format 'data_url'.
  await uploadString(sref, dataUrl, 'data_url');
  const url = await getDownloadURL(sref);
  return { url, storagePath };
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
