// ─── Migrate-Courses-Skip-Stock Client — 2026-04-28 ────────────────────────
// Thin client for /api/admin/migrate-courses-skip-stock. Pulls Firebase
// ID token from the currently signed-in auth and posts to the privileged
// endpoint. Used by PermissionGroupsTab admin button to backfill the
// `skipStockDeduction: false` flag on every existing be_courses doc.
//
// /api/admin/* is an allowed exception to rule E (see .claude/rules/03-stack.md #7).

import { auth } from '../firebase.js';

const ENDPOINT = '/api/admin/migrate-courses-skip-stock';

async function getIdToken() {
  const u = auth?.currentUser;
  if (!u || typeof u.getIdToken !== 'function') {
    throw new Error('ต้องเข้าสู่ระบบก่อนเรียก migrate-courses-skip-stock');
  }
  return u.getIdToken();
}

async function call(action) {
  const token = await getIdToken();
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action }),
  });
  let payload = null;
  try { payload = await res.json(); } catch { /* non-JSON response */ }
  if (!res.ok || !payload?.success) {
    const msg = payload?.error || `migrate-courses-skip-stock ${action} ล้มเหลว (HTTP ${res.status})`;
    throw new Error(msg);
  }
  return payload.data;
}

export function listCoursesNeedingMigration() {
  return call('list');
}

export function commitCoursesSkipStockMigration() {
  return call('commit');
}
