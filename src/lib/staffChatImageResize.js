// src/lib/staffChatImageResize.js
// V73 Feature F (2026-05-16) — Client-side image resize + upload helpers.
//
// Pipeline:
//   File (paste/drag/file-input) → isImageFile gate → resizeImageToBlob
//   (load to <img>, draw to canvas at maxDim=1024, toBlob as JPEG q=0.85) →
//   uploadAttachment (Firebase Storage path = staff-chat-attachments/{branchId}/{ts}-{hex}.jpg).
//
// Storage rule (V73 T14) caps writes at 1 MB; resized JPEGs typically land
// ≤200 KB so the cap is for abuse protection, not for the common path.
//
// Crypto-secure filename token (Rule C2): crypto.getRandomValues + hex encode.
// No Math.random.
//
// (2026-05-22) Multi-image extension: validateStaffChatImage / makeStaffChatThumbnail /
// uploadStaffChatImage (hybrid thumb + original ≤50MB, resumable for progress).
// Images for ONE message live under staff-chat-attachments/{branchId}/{messageId}/.
import { STAFF_CHAT_STORAGE_ROOT, STAFF_CHAT_MAX_IMAGES } from './staffChatRetentionCore.js';

export function isImageFile(file) {
  return !!file && typeof file.type === 'string' && file.type.startsWith('image/');
}

export const MAX_FILE_SIZE_BEFORE_RESIZE = 10 * 1024 * 1024;
export const RESIZE_MAX_DIM = 1024;
export const RESIZE_QUALITY = 0.85;

export async function resizeImageToBlob(file, maxDim = RESIZE_MAX_DIM, quality = RESIZE_QUALITY) {
  if (!isImageFile(file)) throw new Error('STAFF_CHAT_NOT_AN_IMAGE');
  if (file.size > MAX_FILE_SIZE_BEFORE_RESIZE) throw new Error('STAFF_CHAT_FILE_TOO_LARGE');
  const img = await loadImageFromFile(file);
  const ratio = Math.min(maxDim / img.naturalWidth, maxDim / img.naturalHeight, 1);
  const w = Math.round(img.naturalWidth * ratio);
  const h = Math.round(img.naturalHeight * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => b ? resolve(b) : reject(new Error('STAFF_CHAT_CANVAS_BLOB_FAILED')), 'image/jpeg', quality);
  });
  return { blob, width: w, height: h };
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('STAFF_CHAT_IMAGE_LOAD_FAILED'));
    img.src = URL.createObjectURL(file);
  });
}

export async function uploadAttachment(blob, branchId) {
  const { getStorage, ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const filename = `${Date.now()}-${hex}.jpg`;
  const path = `staff-chat-attachments/${branchId}/${filename}`;
  const storage = getStorage();
  const r = ref(storage, path);
  await uploadBytes(r, blob, { contentType: 'image/jpeg' });
  const url = await getDownloadURL(r);
  return { url, size: blob.size };
}

// ─── (2026-05-22) Multi-image hybrid pipeline ───────────────────────────────

export const STAFF_CHAT_MAX_BYTES = 50 * 1024 * 1024;        // ≤50MB per image (input gate)
export const STAFF_CHAT_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const STAFF_CHAT_THUMB_MAX = 512;                     // thumbnail max edge (px)
export { STAFF_CHAT_MAX_IMAGES };                            // re-export for composer/client

// Validate one selected file. HEIC (iPhone) is rejected so the lightbox never
// shows a broken image — staff convert to JPEG first.
export function validateStaffChatImage(file) {
  if (!file || typeof file.type !== 'string' || !STAFF_CHAT_ALLOWED_TYPES.includes(file.type)) {
    return { ok: false, reason: 'type', message: 'รองรับเฉพาะ JPEG / PNG / WebP / GIF (iPhone: แปลง HEIC เป็น JPEG ก่อน)' };
  }
  if (file.size > STAFF_CHAT_MAX_BYTES) {
    return { ok: false, reason: 'size', message: 'ไฟล์ใหญ่เกิน 50MB' };
  }
  return { ok: true };
}

export function extForMime(mime) {
  return ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' })[mime] || 'jpg';
}

function shortHex(n = 4) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
}

// Storage paths for one image of one message (per-message folder → prefix-sweep
// deletion). thumb is always .jpg; original keeps its real extension.
export function staffChatImagePaths(branchId, messageId, imgId, ext) {
  const base = `${STAFF_CHAT_STORAGE_ROOT}/${branchId}/${messageId}/${imgId}`;
  return { thumbPath: `${base}-t.jpg`, fullPath: `${base}-o.${ext}` };
}

// Thumbnail: downscale to ≤512px JPEG q0.7 (small, for the in-chat grid). Also
// returns the ORIGINAL natural dimensions (srcW/srcH) for grid aspect + lightbox.
// Revokes the object URL + releases the canvas to bound memory on huge inputs.
export async function makeStaffChatThumbnail(file, max = STAFF_CHAT_THUMB_MAX) {
  if (!isImageFile(file)) throw new Error('STAFF_CHAT_NOT_AN_IMAGE');
  const objUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('STAFF_CHAT_IMAGE_LOAD_FAILED'));
      im.src = objUrl;
    });
    const srcW = img.naturalWidth, srcH = img.naturalHeight;
    const ratio = Math.min(max / srcW, max / srcH, 1);
    const w = Math.max(1, Math.round(srcW * ratio));
    const h = Math.max(1, Math.round(srcH * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('STAFF_CHAT_CANVAS_BLOB_FAILED')), 'image/jpeg', 0.7);
    });
    canvas.width = canvas.height = 0; // release canvas memory
    return { blob, srcW, srcH };
  } finally {
    URL.revokeObjectURL(objUrl);
  }
}

// Upload one image (thumbnail + original) under the message's folder. Original
// uses uploadBytesResumable so the composer can show per-image progress.
// Returns the attachment record stored in message.attachments[].
export async function uploadStaffChatImage({ file, branchId, messageId, onProgress }) {
  const v = validateStaffChatImage(file);
  if (!v.ok) throw new Error(v.message);
  if (!branchId || !messageId) throw new Error('STAFF_CHAT_UPLOAD_CONTEXT_MISSING');
  const { getStorage, ref, uploadBytes, uploadBytesResumable, getDownloadURL } = await import('firebase/storage');
  const storage = getStorage();
  const imgId = shortHex(4);
  const ext = extForMime(file.type);
  const { thumbPath, fullPath } = staffChatImagePaths(branchId, messageId, imgId, ext);

  const thumb = await makeStaffChatThumbnail(file);
  await uploadBytes(ref(storage, thumbPath), thumb.blob, { contentType: 'image/jpeg' });
  const thumbUrl = await getDownloadURL(ref(storage, thumbPath));

  const oRef = ref(storage, fullPath);
  await new Promise((resolve, reject) => {
    const task = uploadBytesResumable(oRef, file, { contentType: file.type });
    task.on('state_changed',
      s => { if (onProgress && s.totalBytes) onProgress(s.bytesTransferred / s.totalBytes); },
      reject,
      resolve);
  });
  const fullUrl = await getDownloadURL(oRef);

  return {
    thumbUrl, fullUrl, thumbPath, fullPath,
    size: file.size, mimeType: file.type,
    w: thumb.srcW, h: thumb.srcH,
  };
}
