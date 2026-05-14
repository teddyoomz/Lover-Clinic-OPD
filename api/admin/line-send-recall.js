// ─── /api/admin/line-send-recall — Phase 29 (2026-05-14) ───────────────
// Admin-only proxy for LINE Push API to send a recall message to a
// customer with a linked lineUserId. The browser CANNOT call api.line.me
// directly (no CORS); this endpoint runs server-side.
//
// Per V32-tris-ter pattern:
//   - Admin token verified via verifyAdminToken
//   - chat_config / be_line_configs/{branchId} read via firebase-admin
//   - POST to LINE Push API with channel access token
//   - On success: append system message to chat_conversations/line_{userId}/
//     messages/{messageId} so the audit trail surfaces in the chat panel
//
// Body:
//   {
//     recallId: 'RECALL-...',           // required (for audit logging)
//     customerLineUserId: 'U_...',      // required
//     templateId: 'recall-default',     // required (informational only)
//     messageText: 'พร้อมส่ง LINE',     // required (already rendered)
//     branchId: 'BR-xxx',               // optional (BS V3 per-branch config)
//   }
//
// Returns 200:
//   { ok: true, messageId, sentAt }
//
// Returns 503 with code:
//   { error: '...', code: 'CONFIG_MISSING' }      // no token
//   { error: '...', code: 'TOKEN_INVALID' }       // LINE 401/403
//   { error: '...', code: 'CUSTOMER_NOT_LINKED' } // missing lineUserId
//
// Returns 502/500 for upstream / unexpected errors.

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

function _newOutboundMessageId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `recall-${ts}-${rand}`;
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
  const { recallId, customerLineUserId, templateId, messageText, branchId } = body;

  // Input validation
  if (!recallId || typeof recallId !== 'string') {
    return res.status(400).json({ error: 'recallId is required' });
  }
  if (!customerLineUserId || typeof customerLineUserId !== 'string') {
    return res.status(503).json({
      error: 'ลูกค้ายังไม่ได้ผูก LINE',
      code: 'CUSTOMER_NOT_LINKED',
    });
  }
  if (!messageText || typeof messageText !== 'string' || messageText.trim() === '') {
    return res.status(400).json({ error: 'messageText is required' });
  }
  if (messageText.length > 5000) {
    return res.status(400).json({ error: 'messageText > 5000 chars (LINE limit)' });
  }

  try {
    const db = getAdminFirestore();

    // Resolve LINE config (per-branch via BS V3, fallback to legacy chat_config)
    const resolved = await resolveLineConfigForAdmin(db, { branchId });
    const token = resolved?.config?.channelAccessToken;
    if (!token) {
      return res.status(503).json({
        error: 'LINE Channel Access Token ยังไม่ได้ตั้งค่า — โปรดเพิ่มที่ ตั้งค่า LINE OA',
        code: 'CONFIG_MISSING',
      });
    }

    // Call LINE Push API
    const lineRes = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: customerLineUserId,
        messages: [{ type: 'text', text: messageText }],
      }),
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

    // Generate our own messageId (LINE Push API doesn't return one)
    const messageId = _newOutboundMessageId();
    const sentAt = new Date().toISOString();

    // Append system message to chat_conversations/line_{userId}/messages for audit
    // (Mirror webhook's structure — but mark isFromCustomer=false + isFromRecall=true)
    try {
      const convPath = `artifacts/${APP_ID}/public/data/chat_conversations/line_${customerLineUserId}`;
      const msgPath = `${convPath}/messages/${messageId}`;
      await db.doc(msgPath).set({
        text: messageText,
        messageType: 'text',
        imageUrl: '',
        timestamp: sentAt,
        isFromCustomer: false,
        isFromRecall: true,
        recallId,
        recallTemplateId: templateId || null,
        sentByUid: caller.uid || null,
        sentByName: caller.email || caller.name || '',
      });
      // Update conversation lastMessage (best-effort; non-fatal)
      await db.doc(convPath).set({
        lastMessage: messageText.slice(0, 200),
        lastMessageAt: sentAt,
      }, { merge: true });
    } catch (logErr) {
      // Non-fatal — recall message was sent successfully even if audit log fails.
      console.warn('[line-send-recall] audit log failed (continuing):', logErr?.message || logErr);
    }

    return res.status(200).json({
      ok: true,
      messageId,
      sentAt,
      recallId,
    });
  } catch (err) {
    console.error('[line-send-recall] failed:', err);
    return res.status(500).json({ error: err.message || 'send failed' });
  }
}
