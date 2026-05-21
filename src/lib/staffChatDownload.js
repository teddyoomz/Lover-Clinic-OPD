// src/lib/staffChatDownload.js
// (2026-05-22) Shared download helper for staff-chat attachments — Rule of 3:
// used by the image lightbox + the file card + the PDF overlay.
//
// Why the blob route: Firebase Storage download URLs are cross-origin
// (firebasestorage.googleapis.com), so the <a download="name"> attribute is
// IGNORED — a plain anchor would just open/navigate, losing the filename. So
// for small files we fetch → blob → a[download] to force a download that keeps
// the original filename. For large files (>100MB) we open in a new tab so the
// browser streams/downloads without loading the whole blob into memory (a 1GB
// blob would crash low-end devices).

export const STAFF_CHAT_DOWNLOAD_BLOB_MAX = 100 * 1024 * 1024; // 100MB

export async function downloadUrlAsFile(url, name, size) {
  if (!url) return;
  if ((Number(size) || 0) > STAFF_CHAT_DOWNLOAD_BLOB_MAX) {
    try { window.open(url, '_blank', 'noopener'); } catch { /* swallow */ }
    return;
  }
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name || `staff-chat-${Date.now()}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  } catch {
    // network / CORS — fall back to opening the URL (user can long-press to save)
    try { window.open(url, '_blank', 'noopener'); } catch { /* swallow */ }
  }
}
