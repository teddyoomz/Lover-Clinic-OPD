// src/lib/staffChatPanelSize.js
// (2026-05-31) Desktop staff-chat panel resize — per-device size persistence.
// Mirrors staffChatReadCursor.js localStorage pattern (globalThis guard,
// graceful degrade). DEVICE-WIDE single key (NOT per-branch) so the size the
// user drags applies everywhere the widget mounts. Pure clampSize for tests.
//
// Consumed by useStaffChatPanelResize.js (the desktop-only resize hook) which
// is consumed by StaffChatPanel.jsx. Mobile (<768px) never reads this — the
// panel keeps its fullscreen overlay there.

export const PANEL_SIZE_STORAGE_KEY = 'staffChat:panelSize';
export const DEFAULT_PANEL_SIZE = Object.freeze({ width: 360, height: 480 });
export const MIN_PANEL_SIZE = Object.freeze({ width: 360, height: 480 });
export const VIEWPORT_MARGIN = 32; // px gap from each screen edge at max

function _getLocalStorage() {
  try {
    if (typeof globalThis === 'undefined') return null;
    const ls = globalThis.localStorage;
    if (!ls || typeof ls.getItem !== 'function' || typeof ls.setItem !== 'function') return null;
    return ls;
  } catch (_e) {
    return null;
  }
}

/**
 * Pure: clamp a requested size to [MIN, viewport-margin]. If the viewport is
 * smaller than MIN, the viewport ceiling wins so the box always fits on screen.
 * Unknown/invalid viewport dims → Infinity ceiling (floor at MIN only).
 *
 * @param {{width?:number,height?:number}} size
 * @param {{vw?:number,vh?:number}} viewport
 * @returns {{width:number,height:number}}
 */
export function clampSize(size, viewport) {
  const reqW = Number(size && size.width);
  const reqH = Number(size && size.height);
  const vw = Number(viewport && viewport.vw);
  const vh = Number(viewport && viewport.vh);
  const ceilW = Number.isFinite(vw) && vw > 0 ? Math.max(0, vw - VIEWPORT_MARGIN) : Infinity;
  const ceilH = Number.isFinite(vh) && vh > 0 ? Math.max(0, vh - VIEWPORT_MARGIN) : Infinity;
  const baseW = Number.isFinite(reqW) ? reqW : DEFAULT_PANEL_SIZE.width;
  const baseH = Number.isFinite(reqH) ? reqH : DEFAULT_PANEL_SIZE.height;
  const width = Math.min(ceilW, Math.max(MIN_PANEL_SIZE.width, baseW));
  const height = Math.min(ceilH, Math.max(MIN_PANEL_SIZE.height, baseH));
  return { width: Math.round(width), height: Math.round(height) };
}

/**
 * Read the saved per-device panel size.
 * @returns {{width:number,height:number}|null} null when unset / unavailable /
 *          invalid (caller falls back to DEFAULT_PANEL_SIZE).
 */
export function getPanelSize() {
  const ls = _getLocalStorage();
  if (!ls) return null;
  let raw;
  try { raw = ls.getItem(PANEL_SIZE_STORAGE_KEY); } catch (_e) { return null; }
  if (!raw) return null;
  let parsed;
  try { parsed = JSON.parse(raw); } catch (_e) { return null; }
  if (!parsed || typeof parsed !== 'object') return null;
  const width = Number(parsed.width);
  const height = Number(parsed.height);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

/**
 * Persist a panel size. Ignores invalid (non-finite / non-positive) input.
 * Graceful degrade on quota / private-browsing / SSR (catch + warn).
 * @param {{width:number,height:number}} size
 */
export function setPanelSize(size) {
  const ls = _getLocalStorage();
  if (!ls) return;
  const width = Number(size && size.width);
  const height = Number(size && size.height);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return;
  if (width <= 0 || height <= 0) return;
  try {
    ls.setItem(PANEL_SIZE_STORAGE_KEY, JSON.stringify({ width: Math.round(width), height: Math.round(height) }));
  } catch (e) {
    try {
      // eslint-disable-next-line no-console
      console.warn('[staffChatPanelSize] setPanelSize localStorage write failed:', e);
    } catch (_e2) { /* noop */ }
  }
}

/** Remove the saved size (used by double-click-to-reset). */
export function clearPanelSize() {
  const ls = _getLocalStorage();
  if (!ls) return;
  try { ls.removeItem(PANEL_SIZE_STORAGE_KEY); } catch (_e) { /* non-fatal */ }
}
