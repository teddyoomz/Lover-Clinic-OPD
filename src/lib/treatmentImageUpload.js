// 2026-05-25 — Treatment-blob Storage-ref upload helpers.
//
// Class-of-bug fix (Rule P): be_treatments.detail stored Before/After/Other
// photos, lab images, lab PDFs + treatment-file PDFs as INLINE base64 in the
// Firestore doc. A single 1920px JPEG ≈ 0.3-0.5 MB base64; a PDF up to ~13 MB.
// The 1 MiB Firestore doc cap was hit at ~2 photos (prod docs at 95%/86%/80%)
// → the WHOLE treatment save was intermittently rejected ("บันทึกได้บ้างไม่ได้บ้าง")
// + the per-file decode/resize burst janked the main thread ("ไม่ลื่น/ติด").
// Charts were migrated to Firebase Storage on 2026-05-22; these helpers expand
// the SAME pattern (uploadTreatmentBlob) to every remaining treatment blob.
//
// Readers (<img src> / pdf truthiness) accept both legacy `data:` and new
// `http` Storage URLs — so loaded legacy treatments still display unchanged.

import { uploadTreatmentBlob } from './chartImageStorage.js';

/**
 * Pure: resized dimensions preserving aspect ratio, capping the longer side at
 * maxDim. Returns integers. Images already within maxDim are returned as-is.
 */
export function computeResizeDims(w, h, maxDim = 1920) {
  if (!(w > 0) || !(h > 0)) return { w: 0, h: 0 };
  if (w <= maxDim && h <= maxDim) return { w: Math.round(w), h: Math.round(h) };
  // clamp the scaled side to ≥1 — an extreme aspect ratio (e.g. 8000×15) would
  // otherwise round the short side to 0 → a 0-dimension canvas → empty image.
  if (w >= h) return { w: maxDim, h: Math.max(1, Math.round((h * maxDim) / w)) };
  return { w: Math.max(1, Math.round((w * maxDim) / h)), h: maxDim };
}

/** FileReader → data URL (Promise). */
export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = (ev) => resolve(ev.target?.result);
    r.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
    r.readAsDataURL(file);
  });
}

/** Decode a data URL → resize (canvas) → re-encode (default JPEG 0.8). Promise. */
export function resizeImageDataUrl(dataUrl, { maxDim = 1920, mime = 'image/jpeg', quality = 0.8 } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const { w, h } = computeResizeDims(img.width, img.height, maxDim);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL(mime, quality));
      } catch (e) { reject(e); }
    };
    img.onerror = () => reject(new Error('โหลดรูปไม่สำเร็จ'));
    img.src = dataUrl;
  });
}

/**
 * Read → resize → upload an image to Firebase Storage. Returns the gallery
 * entry shape { dataUrl: <Storage URL>, storagePath, id } — NEVER inline base64,
 * so the persisted be_treatments doc stays small + the save can't blow the cap.
 */
export async function processAndUploadTreatmentImage({ file, customerId, kind = 'photo', maxDim = 1920, quality = 0.8 }) {
  const local = await readFileAsDataURL(file);
  const resized = await resizeImageDataUrl(local, { maxDim, quality });
  const { url, storagePath } = await uploadTreatmentBlob({ customerId, dataUrl: resized, kind });
  return { dataUrl: url, storagePath, id: '' };
}

/**
 * Read (no resize) → upload a PDF to Firebase Storage. Returns {url, storagePath}.
 * The caller stores `url` in the existing `pdfBase64` field (now holds a URL, not
 * base64) + `pdfStoragePath` for the delete cascade.
 */
export async function uploadTreatmentPdf({ file, customerId, kind = 'pdf' }) {
  const dataUrl = await readFileAsDataURL(file);
  return uploadTreatmentBlob({ customerId, dataUrl, kind });
}
