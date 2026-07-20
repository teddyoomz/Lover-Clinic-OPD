// src/lib/stickerLibrary.js
// (2026-05-26) Feature 4 — per-device CUSTOM sticker library in IndexedDB.
// NEVER written to Firebase as a catalog (AV134) — only the SENT instance is
// uploaded to Storage by the send path (useStaffChat.sendSticker). Stores the raw
// Blob + meta. Crypto-secure local id (Rule C2 project-wide, even for an IDB key).
const DB_NAME = 'lover-staff-chat-stickers';
const STORE = 'stickers';
export const MAX_STICKERS = 60;
export const MAX_STICKER_BYTES = 1.5 * 1024 * 1024;

function localId() {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return 'LST-' + Date.now() + '-' + Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
}

function openDb() {
  return new Promise((res, rej) => {
    // M7-class guard (2026-07-20): absent/sync-throwing IndexedDB must reject
    // cleanly (picker shows empty library), never throw into the caller.
    if (typeof indexedDB === 'undefined') { rej(new Error('IndexedDB unavailable')); return; }
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function store(mode) {
  return openDb().then((db) => db.transaction(STORE, mode).objectStore(STORE));
}

export async function listStickers() {
  const s = await store('readonly');
  return new Promise((res, rej) => {
    const r = s.getAll();
    r.onsuccess = () => res((r.result || []).sort((a, b) => b.addedAt - a.addedAt));
    r.onerror = () => rej(r.error);
  });
}

export async function removeSticker(id) {
  const s = await store('readwrite');
  return new Promise((res, rej) => {
    const r = s.delete(id);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

export async function addSticker(blob) {
  if (!(blob instanceof Blob)) throw new Error('STICKER_NOT_BLOB');
  if (!/^image\//.test(blob.type || '')) throw new Error('STICKER_NOT_IMAGE');
  if (blob.size > MAX_STICKER_BYTES) throw new Error('STICKER_TOO_LARGE');
  // Evict oldest beyond the cap (quota guard — per-device library).
  const all = await listStickers();
  while (all.length >= MAX_STICKERS) {
    const oldest = all.pop();
    if (!oldest) break;
    await removeSticker(oldest.id);
  }
  const rec = { id: localId(), blob, type: blob.type || 'image/png', addedAt: Date.now() };
  const s = await store('readwrite');
  return new Promise((res, rej) => {
    const r = s.put(rec);
    r.onsuccess = () => res(rec);
    r.onerror = () => rej(r.error);
  });
}

// Fetch-from-URL (best-effort; cross-origin reads may be CORS-blocked → caller
// shows a fallback "download then upload" hint).
export async function addStickerFromUrl(url) {
  const resp = await fetch(url, { mode: 'cors' });
  if (!resp.ok) throw new Error('STICKER_FETCH_FAILED');
  return addSticker(await resp.blob());
}

export function stickerObjectUrl(rec) {
  return rec && rec.blob ? URL.createObjectURL(rec.blob) : '';
}
