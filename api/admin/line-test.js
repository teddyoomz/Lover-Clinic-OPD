// ─── /api/admin/line-test — V32-tris-ter-fix (2026-04-26) ──────────────
// Admin-only proxy for LINE Messaging API connection test. The browser
// CANNOT call api.line.me directly because LINE doesn't send
// Access-Control-Allow-Origin headers — every browser request fails CORS
// preflight with "Failed to fetch". This endpoint runs server-side
// (Vercel serverless) where CORS doesn't apply.
//
// Body:
//   { action: 'test' }   // currently the only action
//
// Returns 200:
//   { ok: true, displayName, basicId, userId, premiumId, pictureUrl, chatMode }
//
// Returns 503 with code:
//   { error: '...', code: 'CONFIG_MISSING' }   // no token in chat_config
//   { error: '...', code: 'TOKEN_INVALID' }    // LINE responded 401
//
// Returns 500 with bare error message for unexpected failures.

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { verifyAdminToken } from './_lib/adminAuth.js';
import { resolveLineConfigForAdmin } from './_lib/lineConfigAdmin.js';

const APP_ID = process.env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b';

let cachedDb = null;
function getAdminFirestore() {
  if (cachedDb) return cachedDb;
  let app;
  if (getApps().length > 0) {
    app = getApp();
  } else {
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

async function getLineConfigResolved(db, branchId) {
  // Phase BS V3 (2026-05-04) — prefer be_line_configs/{branchId} when caller
  // supplies branchId; fall back to legacy clinic_settings/chat_config.
  return resolveLineConfigForAdmin(db, { branchId });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const caller = await verifyAdminToken(req, res);
  if (!caller) return; // 401/403 written

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const { action, branchId } = body;
  if (action !== 'test') {
    return res.status(400).json({ error: 'action must be "test"' });
  }

  try {
    const db = getAdminFirestore();
    const resolved = await getLineConfigResolved(db, branchId);
    const token = resolved?.config?.channelAccessToken;
    if (!token) {
      return res.status(503).json({
        error: 'LINE Channel Access Token ยังไม่ได้ตั้งค่า — โปรดเพิ่มที่ ตั้งค่า LINE OA',
        code: 'CONFIG_MISSING',
      });
    }

    const lineRes = await fetch('https://api.line.me/v2/bot/info', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (lineRes.status === 401 || lineRes.status === 403) {
      const errText = await lineRes.text().catch(() => '');
      return res.status(503).json({
        error: `Token ไม่ถูกต้องหรือหมดอายุ (LINE ${lineRes.status}): ${errText.slice(0, 200)}`,
        code: 'TOKEN_INVALID',
      });
    }
    if (!lineRes.ok) {
      const errText = await lineRes.text().catch(() => '');
      return res.status(502).json({
        error: `LINE API ${lineRes.status}: ${errText.slice(0, 200)}`,
        code: 'LINE_API_ERROR',
      });
    }
    const info = await lineRes.json();

    // Phase BS V3 — when test succeeds against be_line_configs/{branchId},
    // persist the bot's userId as the destination field. The webhook needs
    // this to route incoming events back to the correct branch.
    if (resolved?.source === 'be_line_configs' && resolved.branchId && info.userId) {
      try {
        await db
          .doc(`artifacts/${APP_ID}/public/data/be_line_configs/${resolved.branchId}`)
          .set({ destination: info.userId, destinationUpdatedAt: new Date().toISOString() }, { merge: true });
      } catch (err) {
        console.warn('[line-test] failed to persist destination:', err?.message || err);
      }
    }

    return res.status(200).json({
      ok: true,
      displayName: info.displayName || '',
      basicId: info.basicId || '',
      userId: info.userId || '',
      premiumId: info.premiumId || '',
      pictureUrl: info.pictureUrl || '',
      chatMode: info.chatMode || '',
      branchId: resolved?.branchId || null,
      source: resolved?.source || null,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'test failed' });
  }
}
