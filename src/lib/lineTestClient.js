// ─── LINE Test Connection Client — V32-tris-ter-fix (2026-04-26) ───────
// Thin wrapper for /api/admin/line-test. Browser-side wrapper that adds
// Firebase ID-token auth + parses the {ok, displayName, code, error}
// response shape.
//
// Replaces the broken direct-browser call to api.line.me which fails
// CORS preflight (LINE Messaging API doesn't send
// Access-Control-Allow-Origin).

import { auth } from '../firebase.js';

const ENDPOINT = '/api/admin/line-test';

async function getIdToken() {
  const u = auth?.currentUser;
  if (!u || typeof u.getIdToken !== 'function') {
    throw new Error('ต้องเข้าสู่ระบบก่อนเรียกใช้ /api/admin/line-test');
  }
  return u.getIdToken();
}

/**
 * Test the LINE Channel Access Token by hitting the bot/info endpoint
 * server-side. Returns a normalized result that LineSettingsTab can
 * surface as ok/fail in the UI.
 *
 * Phase BS V3 (2026-05-04): accepts {branchId} so the server reads the
 * saved token from be_line_configs/{branchId} (per-branch). Legacy
 * callers without branchId continue to read from clinic_settings/chat_config.
 *
 * @param {{ branchId?: string }} [opts]
 * @returns {Promise<{ ok: true, message: string } | { ok: false, message: string, code?: string }>}
 */
export async function testLineConnection({ branchId } = {}) {
  const token = await getIdToken();
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action: 'test', branchId: branchId || null }),
  });
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  if (res.ok && body?.ok) {
    const display = body.displayName || body.basicId || 'OK';
    return { ok: true, message: `เชื่อมต่อสำเร็จ — ${display}` };
  }
  const code = body?.code;
  const message = body?.error || `LINE test ล้มเหลว (HTTP ${res.status})`;
  return { ok: false, message, code };
}
