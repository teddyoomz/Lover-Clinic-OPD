// ─── /api/admin/send-document — Phase 14.9 (T3.e LINE-only) ─────────────
// V32-tris-bis (2026-04-26) — admin-only endpoint that notifies a customer
// via LINE official account that a printed document is ready.
//
// LINE-ONLY by user directive (session 11): "SMTP ไม่ต้องทำ ไม่ต้องมีระบบ
// รับส่งเมล มีแค่ระบบ line official". Email path removed; nodemailer
// dependency dropped.
//
// Body:
//   { type: 'line',
//     recipient: <line-userId>,
//     pdfUrl: <optional public download URL>,
//     message: <optional caption text> }
//
// Config source (Firestore clinic_settings):
//   - chat_config.line.channelAccessToken (existing — already used by
//     api/webhook/send.js for chat replies; single source of truth)
//
// Errors:
//   - 400 invalid body
//   - 401/403 not admin (handled by verifyAdminToken)
//   - 503 LINE not configured (with actionable Thai message + code:'CONFIG_MISSING')
//   - 500 send error (with masked error message)
//
// Security:
//   - Standard verifyAdminToken gate (admin: true claim or bootstrap UID)

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { verifyAdminToken } from './_lib/adminAuth.js';

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
    if (!clientEmail || !rawKey) {
      throw new Error('firebase-admin not configured');
    }
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

async function getLineToken(db) {
  try {
    const snap = await db.doc(`artifacts/${APP_ID}/public/data/clinic_settings/chat_config`).get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    return data?.line?.channelAccessToken || null;
  } catch {
    return null;
  }
}

async function sendLine({ token, recipient, message, pdfUrl }) {
  if (!token) {
    const err = new Error('LINE Channel Access Token ยังไม่ได้ตั้งค่า — โปรดเพิ่มที่ ตั้งค่าคลินิก → Chat → LINE');
    err.code = 'CONFIG_MISSING';
    throw err;
  }
  // LINE Push API doesn't support direct PDF attachments — we send a
  // text caption + a download URL (must host the PDF separately, e.g.
  // Firebase Storage with a signed URL). Text-only message is the
  // baseline; future enhancement could use Flex Messages with rich card.
  const messages = [{ type: 'text', text: message || 'เอกสารพร้อมแล้ว' }];
  if (pdfUrl) {
    messages.push({ type: 'text', text: `ดาวน์โหลด: ${pdfUrl}` });
  }
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ to: recipient, messages }),
  });
  if (!res.ok) {
    const errText = await res.text();
    const err = new Error(`LINE API error: ${res.status} ${errText.slice(0, 200)}`);
    err.code = 'LINE_API_ERROR';
    throw err;
  }
  return { delivered: true, channel: 'line' };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const caller = await verifyAdminToken(req, res);
  if (!caller) return; // verifyAdminToken wrote 401/403 already

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const { type, recipient, pdfUrl, message } = body;

  // LINE-only: reject any other channel type explicitly.
  if (type !== 'line') {
    return res.status(400).json({ error: 'type must be "line" — SMTP/email is intentionally not supported' });
  }
  if (!recipient || typeof recipient !== 'string') {
    return res.status(400).json({ error: 'recipient (LINE userId) required' });
  }

  const db = getAdminFirestore();

  try {
    const token = await getLineToken(db);
    const result = await sendLine({ token, recipient, message, pdfUrl });
    return res.status(200).json(result);
  } catch (err) {
    if (err.code === 'CONFIG_MISSING') {
      return res.status(503).json({ error: err.message, code: 'CONFIG_MISSING' });
    }
    return res.status(500).json({ error: err.message || 'Send failed' });
  }
}
