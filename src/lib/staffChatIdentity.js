// src/lib/staffChatIdentity.js
// V73 (2026-05-16) — Cookie-stored chat identity (decoupled from Firebase Auth).
// Display name + deviceId + mute preference, all in localStorage per-device.

const KEY_NAME = 'staffChatName';
const KEY_DEVICE = 'staffChatDeviceId';
const KEY_MUTED = 'staffChatMuted';

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
