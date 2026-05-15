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
