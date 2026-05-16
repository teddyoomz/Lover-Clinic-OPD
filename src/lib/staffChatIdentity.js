// src/lib/staffChatIdentity.js
// V73 (2026-05-16) — Cookie-stored chat identity (decoupled from Firebase Auth).
// Display name + deviceId + mute preference, all in localStorage per-device.

const KEY_NAME = 'staffChatName';
const KEY_DEVICE = 'staffChatDeviceId';
const KEY_MUTED = 'staffChatMuted';
// V73 color-picker (2026-05-18) — per-device sender color.
const KEY_COLOR = 'staffChatColor';
const DEFAULT_COLOR = '#E11D48';  // rose-600; matches DEFAULT_OWN_COLOR in staffChatColor.js
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function getDisplayName() {
  const v = localStorage.getItem(KEY_NAME);
  return v && v.trim() ? v.trim() : null;
}

export function setDisplayName(name) {
  const trimmed = String(name || '').trim();
  if (trimmed.length < 2 || trimmed.length > 50) {
    throw new Error('STAFF_CHAT_NAME_INVALID');
  }
  localStorage.setItem(KEY_NAME, trimmed);
}

export function getDeviceId() {
  let v = localStorage.getItem(KEY_DEVICE);
  if (v) return v;
  // Mint new device id via crypto.getRandomValues (Rule C2)
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  v = `dev-${hex}`;
  localStorage.setItem(KEY_DEVICE, v);
  return v;
}

export function getMuted() {
  return localStorage.getItem(KEY_MUTED) === '1';
}

export function setMuted(value) {
  localStorage.setItem(KEY_MUTED, value ? '1' : '0');
}

// V73 color-picker (2026-05-18) — per-device sender color.
// User picks free hex via native <input type="color"> in NamePicker.
// Each outgoing message embeds this color so cross-device viewers render
// the sender's chosen color.
export function getColor() {
  const v = localStorage.getItem(KEY_COLOR);
  if (typeof v === 'string' && HEX_RE.test(v)) return v;
  return DEFAULT_COLOR;
}

export function setColor(hex) {
  if (typeof hex !== 'string' || !HEX_RE.test(hex)) {
    throw new Error('STAFF_CHAT_COLOR_INVALID');
  }
  localStorage.setItem(KEY_COLOR, hex);
}
