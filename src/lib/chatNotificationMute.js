// src/lib/chatNotificationMute.js
// V75 Item 4 — Per-device chat-tab (Frontend chat tab) notification mute.
// localStorage key per deviceId so doctor's machine can mute without
// affecting other staff devices.
//
// NOT to be confused with V73 staffChatIdentity.getMuted/setMuted — those
// mute the V73 staff-chat widget overlay (src/components/staffchat/),
// a separate surface with its own storage key. AV58 enforces no
// cross-import between the two helpers.

import { getDeviceId } from './staffChatIdentity.js';

const KEY_PREFIX = 'loverclinic.chatTabMuted.';

function lsGet(key) {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key, value) {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, value);
  } catch {
    /* swallow quota errors */
  }
}
function lsRemove(key) {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(key);
  } catch {
    /* swallow */
  }
}

export function isChatTabMuted(deviceId = getDeviceId()) {
  return lsGet(KEY_PREFIX + String(deviceId || '')) === '1';
}

export function setChatTabMuted(muted, deviceId = getDeviceId()) {
  const key = KEY_PREFIX + String(deviceId || '');
  if (muted) lsSet(key, '1');
  else lsRemove(key);
}

export function toggleChatTabMute(deviceId = getDeviceId()) {
  const next = !isChatTabMuted(deviceId);
  setChatTabMuted(next, deviceId);
  return next;
}
