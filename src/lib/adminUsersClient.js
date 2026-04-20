// ─── Admin Users Client — Phase 12.0 endpoint wrapper ──────────────────────
// Thin client for /api/admin/users. Pulls Firebase ID token from the currently
// signed-in auth and posts to the privileged endpoint. Used by StaffFormModal
// and DoctorFormModal to create/update/delete Firebase Auth accounts backing
// be_staff / be_doctors docs.
//
// NOT a brokerClient replacement — this stays Firestore-side only. /api/admin/*
// is an allowed exception to rule E (see .claude/rules/03-stack.md #7).
//
// Error convention: thrown Errors bubble up to callers; success returns data.

import { auth } from '../firebase.js';

const ENDPOINT = '/api/admin/users';

async function getIdToken() {
  const u = auth?.currentUser;
  if (!u || typeof u.getIdToken !== 'function') {
    throw new Error('ต้องเข้าสู่ระบบก่อนเรียกใช้ api/admin/users');
  }
  return u.getIdToken();
}

async function callAdminUsers(action, params = {}) {
  const token = await getIdToken();
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action, ...params }),
  });
  let payload = null;
  try { payload = await res.json(); } catch { /* non-JSON response */ }
  if (!res.ok || !payload?.success) {
    const msg = payload?.error || `api/admin/users ${action} ล้มเหลว (HTTP ${res.status})`;
    throw new Error(msg);
  }
  return payload.data;
}

export function listAdminUsers({ maxResults, pageToken } = {}) {
  return callAdminUsers('list', { maxResults, pageToken });
}

export function getAdminUser(uid) {
  return callAdminUsers('get', { uid });
}

export function createAdminUser({ email, password, displayName, disabled, makeAdmin } = {}) {
  return callAdminUsers('create', { email, password, displayName, disabled, makeAdmin });
}

export function updateAdminUser({ uid, email, password, displayName, disabled } = {}) {
  return callAdminUsers('update', { uid, email, password, displayName, disabled });
}

export function deleteAdminUser(uid) {
  return callAdminUsers('delete', { uid });
}

export function grantAdmin(uid) {
  return callAdminUsers('grantAdmin', { uid });
}

export function revokeAdmin(uid) {
  return callAdminUsers('revokeAdmin', { uid });
}
