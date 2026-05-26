// src/lib/staffChatStickers.js
// (2026-05-26) Feature 4 — bundled-pack accessors + sticker-field builders.
// Bundled stickers ship in /public/stickers/fluent/ (Microsoft Fluent Emoji, MIT
// — see /public/stickers/LICENSE). Sent by ID reference (0 Firebase / 0 Storage):
// every device renders from its own bundled asset. The manifest lives in src/ for
// a clean Vite build-time import.
import manifest from './staffChatStickerManifest.json';

export const BUNDLED_STICKERS = Array.isArray(manifest.stickers) ? manifest.stickers : [];
const BASE_PATH = manifest.basePath || '/stickers/fluent/';

export function bundledStickerById(id) {
  return BUNDLED_STICKERS.find((s) => s.id === id) || null;
}
export function bundledStickerSrc(id) {
  const s = bundledStickerById(id);
  return s ? `${BASE_PATH}${s.file}` : '';
}
export function buildBundledStickerField(id) {
  return { kind: 'bundled', id: String(id) };
}
export function buildCustomStickerField({ url, storagePath, w, h } = {}) {
  const f = { kind: 'custom', url: String(url || ''), storagePath: String(storagePath || '') };
  if (Number.isFinite(w) && w > 0) f.w = Math.round(w);
  if (Number.isFinite(h) && h > 0) f.h = Math.round(h);
  return f;
}
