// src/lib/staffChatColor.js
// V73 color-picker (2026-05-18) — pure hex helpers for staff chat sender color.
// Each device picks a free hex via native <input type="color"> in NamePicker.
// Color stored per-device in localStorage + embedded in each outgoing message
// doc so receivers render the sender's chosen color regardless of own pick.

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** Returns true if `value` is a valid 6-digit hex string like "#A1B2C3". */
export function isValidHex(value) {
  return typeof value === 'string' && HEX_RE.test(value);
}

/**
 * Converts "#RRGGBB" + alpha (0-1) → "rgba(R, G, B, a)" string.
 * Returns transparent black `'rgba(0,0,0,0)'` on invalid input — defensive
 * fallback so rendering never crashes on legacy/corrupt data.
 *
 * @param {string} hex — like "#FF5544"
 * @param {number} alpha — 0..1, clamped
 * @returns {string} rgba string
 */
export function hexToRgba(hex, alpha) {
  if (!isValidHex(hex)) return 'rgba(0,0,0,0)';
  const a = Math.max(0, Math.min(1, Number(alpha)));
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// Default sender colors used when a message lacks senderColor field
// (legacy pre-V73-color-picker docs or sender that never set a color).
export const DEFAULT_OWN_COLOR = '#E11D48';   // rose-600 — matches prior own-bubble palette
export const DEFAULT_OTHER_COLOR = '#0EA5E9'; // sky-500 — matches prior other-bubble palette

/**
 * Resolves the effective color for a message bubble.
 *   - If message.senderColor is a valid hex → use it
 *   - Else if isOwn → DEFAULT_OWN_COLOR
 *   - Else → DEFAULT_OTHER_COLOR
 *
 * @param {{senderColor?: string}} message
 * @param {boolean} isOwn
 * @returns {string} valid hex
 */
export function resolveSenderColor(message, isOwn) {
  if (message && isValidHex(message.senderColor)) return message.senderColor;
  return isOwn ? DEFAULT_OWN_COLOR : DEFAULT_OTHER_COLOR;
}
