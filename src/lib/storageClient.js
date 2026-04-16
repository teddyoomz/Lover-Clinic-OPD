// ─── Storage Client — Firebase Storage upload/delete/compress ────────────────
// Reusable utility for file uploads across all backend forms.
// Pattern: upload on file select → return URL → parent saves URL to Firestore.

import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../firebase.js';

/**
 * Build a deterministic storage path.
 * Format: uploads/{collection}/{docId}/{fieldName}_{timestamp}.{ext}
 */
export function buildStoragePath(collection, docId, fieldName, fileName) {
  const sanitize = s => String(s || '').replace(/[\/\\#?%]/g, '_').slice(0, 100);
  const ext = (fileName || '').split('.').pop()?.toLowerCase() || 'bin';
  return `uploads/${sanitize(collection)}/${sanitize(docId)}/${sanitize(fieldName)}_${Date.now()}.${ext}`;
}

/**
 * Compress an image file using Canvas.
 * Replicates TreatmentFormPage.jsx pattern: max 1920px, JPEG 0.8.
 * PDFs pass through unchanged.
 * Returns a Blob ready for uploadBytes.
 */
export function compressImage(file, { maxDimension = 1920, quality = 0.8 } = {}) {
  // Non-image files pass through
  if (!file.type.startsWith('image/')) return Promise.resolve(file);

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image'));
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > h) { if (w > maxDimension) { h *= maxDimension / w; w = maxDimension; } }
        else { if (h > maxDimension) { w *= maxDimension / h; h = maxDimension; } }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          blob => blob ? resolve(blob) : reject(new Error('Canvas toBlob failed')),
          'image/jpeg', quality
        );
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

const DEFAULT_ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

/**
 * Upload a file to Firebase Storage.
 * Validates size + type → compresses images → uploads → returns { url, storagePath }.
 */
export async function uploadFile(file, storagePath, { maxSizeMB = 10, allowedTypes = DEFAULT_ALLOWED } = {}) {
  if (!file) throw new Error('No file provided');
  if (file.size > maxSizeMB * 1024 * 1024) throw new Error(`ไฟล์ขนาดเกิน ${maxSizeMB}MB`);
  if (!allowedTypes.some(t => file.type === t || (t.endsWith('/*') && file.type.startsWith(t.replace('/*', '/'))))) {
    throw new Error('ไฟล์ประเภทนี้ไม่รองรับ');
  }

  const blob = file.type.startsWith('image/') ? await compressImage(file) : file;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, blob, { contentType: blob.type || file.type });
  const url = await getDownloadURL(storageRef);
  return { url, storagePath };
}

/**
 * Delete a file from Firebase Storage.
 * Silently succeeds if file doesn't exist.
 */
export async function deleteFile(storagePath) {
  if (!storagePath) return;
  try {
    await deleteObject(ref(storage, storagePath));
  } catch (e) {
    if (e.code !== 'storage/object-not-found') throw e;
  }
}
