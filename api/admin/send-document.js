// ─── /api/admin/send-document — Phase 14.9 (T3.e) ────────────────────────
// V32-tris-bis (2026-04-26) — admin-only endpoint that delivers a generated
// PDF to a customer via email (SMTP via nodemailer) or LINE (Messaging API
// push). Implements the deferred T3.e from session 9 (was BLOCKED on user
// providing SMTP / LINE config — now ships with config-missing 503 so the
// UI can detect + prompt the admin to configure later).
//
// Body:
//   { type: 'email' | 'line',
//     recipient: <email-address> | <line-userId>,
//     pdfBase64: <base64 PDF content (no data: prefix)>, // email only
//     pdfUrl: <public download URL>,                     // line only
//     filename: <suggested filename>,                    // email only
//     subject: <optional, email only>,
//     message: <optional message body / LINE caption> }
//
// Config sources (Firestore clinic_settings):
//   - email_config.host / port / user / pass / from / secure
//   - chat_config.line.channelAccessToken (existing — already used by
//     api/webhook/send.js; mirrors chat reply token)
//
// Errors:
//   - 400 invalid body
//   - 401/403 not admin (handled by verifyAdminToken)
//   - 503 SMTP/LINE not configured (with actionable Thai message + code:'CONFIG_MISSING')
//   - 500 send error (with masked error message)
//
// Security:
//   - Standard verifyAdminToken gate (admin: true claim or bootstrap UID)
//   - PDF size capped at 10MB (Vercel body limit + reasonable for PDFs)

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { verifyAdminToken } from './_lib/adminAuth.js';

const APP_ID = process.env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b';
const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10MB

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

async function getEmailConfig(db) {
  try {
    const snap = await db.doc(`artifacts/${APP_ID}/public/data/clinic_settings/email_config`).get();
    return snap.exists ? snap.data() : null;
  } catch {
    return null;
  }
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

async function sendEmail({ config, recipient, subject, message, pdfBase64, filename }) {
  if (!config?.host || !config?.user || !config?.pass) {
    const err = new Error('SMTP ยังไม่ได้ตั้งค่า — โปรดเพิ่ม host/user/pass ใน clinic_settings/email_config');
    err.code = 'CONFIG_MISSING';
    throw err;
  }
  const nodemailer = (await import('nodemailer')).default;
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: Number(config.port) || 587,
    secure: !!config.secure,
    auth: { user: config.user, pass: config.pass },
  });
  const buffer = Buffer.from(pdfBase64, 'base64');
  if (buffer.byteLength > MAX_PDF_BYTES) {
    const err = new Error(`PDF เกิน ${MAX_PDF_BYTES / 1024 / 1024} MB`);
    err.code = 'PDF_TOO_LARGE';
    throw err;
  }
  await transporter.sendMail({
    from: config.from || config.user,
    to: recipient,
    subject: subject || 'เอกสารจากคลินิก',
    text: message || 'เอกสารแนบมาในไฟล์',
    attachments: [{
      filename: filename || 'document.pdf',
      content: buffer,
      contentType: 'application/pdf',
    }],
  });
  return { delivered: true, channel: 'email' };
}

async function sendLine({ token, recipient, message, pdfUrl }) {
  if (!token) {
    const err = new Error('LINE Channel Access Token ยังไม่ได้ตั้งค่า — โปรดเพิ่มที่ ตั้งค่าคลินิก → Chat → LINE');
    err.code = 'CONFIG_MISSING';
    throw err;
  }
  // LINE Push API doesn't support direct PDF attachments — we send a
  // text caption + a download URL (must host the PDF separately, e.g.
  // Firebase Storage with a signed URL).
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
  const { type, recipient, pdfBase64, pdfUrl, filename, subject, message } = body;

  if (!type || !['email', 'line'].includes(type)) {
    return res.status(400).json({ error: 'type must be "email" or "line"' });
  }
  if (!recipient || typeof recipient !== 'string') {
    return res.status(400).json({ error: 'recipient required' });
  }
  if (type === 'email' && !pdfBase64) {
    return res.status(400).json({ error: 'pdfBase64 required for email' });
  }
  if (type === 'email' && pdfBase64.length > MAX_PDF_BYTES * 1.4) {
    // base64 inflation factor ~1.37
    return res.status(413).json({ error: `PDF too large (max ${MAX_PDF_BYTES / 1024 / 1024} MB)` });
  }

  const db = getAdminFirestore();

  try {
    if (type === 'email') {
      const config = await getEmailConfig(db);
      const result = await sendEmail({ config, recipient, subject, message, pdfBase64, filename });
      return res.status(200).json(result);
    } else {
      const token = await getLineToken(db);
      const result = await sendLine({ token, recipient, message, pdfUrl });
      return res.status(200).json(result);
    }
  } catch (err) {
    if (err.code === 'CONFIG_MISSING') {
      return res.status(503).json({ error: err.message, code: 'CONFIG_MISSING' });
    }
    if (err.code === 'PDF_TOO_LARGE') {
      return res.status(413).json({ error: err.message });
    }
    return res.status(500).json({ error: err.message || 'Send failed' });
  }
}
