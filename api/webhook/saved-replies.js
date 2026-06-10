// ─── Saved Replies API (proxy FB saved_message_responses) ────────────────────
// V78 (2026-05-16 NIGHT — BUG-CHAT-2 / XR-13 fix):
// Authenticated GET endpoint — returns saved replies from Facebook Page.
//
// Class-of-bug: V12 multi-reader-sweep at API-layer boundary. Pre-V78 this
// endpoint read single-tenant `clinic_settings/chat_config.facebook` →
// admin in พระราม 3 saw นครราชสีมา's FB saved replies.
//
// V78 fix:
//   1. Accept `?branchId=...` query param (UI: ChatPanel passes selectedBranchId).
//   2. Resolve per-branch `be_fb_configs/{branchId}` via admin SDK; fall back
//      to legacy `clinic_settings/chat_config.facebook` for V75-transition.
//   3. Return 503 BRANCH_CONFIG_MISSING when no per-branch + no legacy.

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
// WS3 (2026-06-10) — restored auth gate (was the V50-deleted ../proclinic/_lib/
// auth.js → broken import → 500 since 2026-05-08). verifyClinicStaffToken adds
// the isClinicStaff/admin claim check the old verifyAuth lacked.
import { verifyClinicStaffToken } from '../admin/_lib/adminAuth.js';
import { resolveFbConfigForAdmin } from '../admin/_lib/fbConfigAdmin.js';
// A7 (2026-05-18 audit-fix) — fetch timeout via shared helper.
import { apiFetch } from '../_lib/apiFetch.js';

const APP_ID = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_APP_ID || 'loverclinic-opd-4c39b';

let cachedDb = null;
function getAdminDb() {
  if (cachedDb) return cachedDb;
  let app;
  if (getApps().length > 0) app = getApp();
  else {
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
    if (!clientEmail || !rawKey) throw new Error('firebase-admin not configured');
    app = initializeApp({
      credential: cert({
        projectId: APP_ID,
        clientEmail,
        privateKey: rawKey.replace(/\\n/g, '\n'),
      }),
    });
  }
  cachedDb = getFirestore(app);
  return cachedDb;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyClinicStaffToken(req, res);
  if (!user) return;

  try {
    const db = getAdminDb();
    // V78: caller passes ?branchId=... — ChatPanel reads conv.branchId.
    const branchId = String(req.query?.branchId || '').trim();

    const resolved = await resolveFbConfigForAdmin(db, { branchId });
    if (!resolved || !resolved.config) {
      return res.status(503).json({
        success: false,
        error: 'BRANCH_CONFIG_MISSING',
        detail: branchId
          ? `สาขา ${branchId} ยังไม่ได้ตั้งค่า FB Page — ไปที่ Backend → ตั้งค่า FB Page เพื่อตั้งค่า.`
          : 'ยังไม่ได้ตั้งค่า FB Page — ระบุ branchId.',
      });
    }

    const token = resolved.config.pageAccessToken;
    const pageId = resolved.config.pageId;
    if (!token || !pageId) {
      return res.status(503).json({ success: false, error: 'BRANCH_CONFIG_MISSING', detail: 'pageAccessToken/pageId missing on resolved config' });
    }

    const fbRes = await apiFetch(`https://graph.facebook.com/v25.0/${pageId}/saved_message_responses?access_token=${token}`);
    const data = await fbRes.json();

    if (data.error) {
      console.error('[saved-replies] FB API error:', data.error);
      return res.status(200).json({ success: false, error: data.error.message });
    }

    const replies = (data.data || [])
      .filter(r => r.is_enabled !== false)
      .map(r => ({ id: r.id, title: r.title || '', message: r.message || '' }));

    return res.status(200).json({
      success: true,
      replies,
      resolved: { branchId: resolved.branchId || null, source: resolved.source },
    });
  } catch (err) {
    console.error('[saved-replies] Error:', err);
    return res.status(200).json({ success: false, error: err.message });
  }
}
