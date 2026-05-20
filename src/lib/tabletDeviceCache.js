// Per-device persistence so the tablet never re-enters name/branch (user directive).
const K_ID = 'chartTablet:deviceId', K_NAME = 'chartTablet:deviceName', K_BRANCH = 'chartTablet:branchId';
function ls() { try { return window.localStorage; } catch { return null; } }
function randId() {
  const a = new Uint8Array(8);
  (window.crypto || window.msCrypto).getRandomValues(a);            // crypto, per Rule C2 (no Math.random ids)
  return 'TBL-' + Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
}
export function getOrCreateDeviceId() {
  const s = ls(); if (!s) return randId();
  let id = s.getItem(K_ID); if (!id) { id = randId(); s.setItem(K_ID, id); } return id;
}
export function getCachedDeviceName() { return ls()?.getItem(K_NAME) || ''; }
export function setCachedDeviceName(v) { ls()?.setItem(K_NAME, v || ''); }
export function getCachedBranchId() { return ls()?.getItem(K_BRANCH) || ''; }
export function setCachedBranchId(v) { ls()?.setItem(K_BRANCH, v || ''); }
