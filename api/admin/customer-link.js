// ─── /api/admin/customer-link — Phase 14.9 (V32-tris-ter, 2026-04-26) ───
// Admin-only endpoint to mint a one-time LINE-link token for a customer.
//
// Body:
//   { action: 'create', customerId: '<be_customers id>',
//     ttlMinutes: <optional, default 1440 = 24h> }
//
// Returns:
//   { token: <24-char base32>, expiresAt: <ISO>, deepLink: <line.me URL> }
//
// The token is stored in be_customer_link_tokens/{token} with:
//   { customerId, expiresAt, createdBy, createdAt }
//
// Customer scans the QR (deep link) → opens LINE chat with bot →
// "LINK-<token>" auto-pasted → customer sends → /api/webhook/line
// consumes the token + writes lineUserId onto be_customers/{id}.
//
// Security:
//   - verifyAdminToken gate (admin: true claim or bootstrap UID)
//   - Token shape is base32 (24 chars, ~120 bits of entropy)
//   - Token doc carries createdBy (admin uid) for audit
//   - 24h default expiry — admin can override with ttlMinutes for kiosk flows

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { verifyAdminToken } from './_lib/adminAuth.js';
import { generateLinkToken } from '../../src/lib/lineBotResponder.js';

const APP_ID = process.env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b';
const TOKEN_TTL_DEFAULT_MINUTES = 60 * 24; // 24h

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

async function getLineBotBasicId(db) {
  try {
    const snap = await db.doc(`artifacts/${APP_ID}/public/data/clinic_settings/chat_config`).get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    return data?.line?.botBasicId || null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const caller = await verifyAdminToken(req, res);
  if (!caller) return; // 401/403 already written

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const { action, customerId, ttlMinutes } = body;

  if (action !== 'create') {
    return res.status(400).json({ error: 'action must be "create"' });
  }
  if (!customerId || typeof customerId !== 'string') {
    return res.status(400).json({ error: 'customerId required' });
  }

  const db = getAdminFirestore();

  // Verify the customer exists
  const cSnap = await db.doc(`artifacts/${APP_ID}/public/data/be_customers/${customerId}`).get();
  if (!cSnap.exists) return res.status(404).json({ error: 'customer not found' });

  // Mint token
  const token = generateLinkToken();
  const ttl = Math.max(1, Math.min(60 * 24 * 7, Number(ttlMinutes) || TOKEN_TTL_DEFAULT_MINUTES));
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttl * 60 * 1000).toISOString();

  await db.doc(`artifacts/${APP_ID}/public/data/be_customer_link_tokens/${token}`).set({
    customerId: String(customerId),
    expiresAt,
    createdBy: caller.uid,
    createdAt: now.toISOString(),
  });

  // Build LINE deep link. botBasicId is the @-handle (e.g. "@123abcde").
  // If admin hasn't set it, return a generic message-prefill URL pattern;
  // admin can update chat_config.line.botBasicId later for nicer UX.
  const botBasicId = await getLineBotBasicId(db);
  const deepLink = botBasicId
    ? `https://line.me/R/oaMessage/${encodeURIComponent(botBasicId)}/?LINK-${token}`
    : `LINK-${token}`;

  return res.status(200).json({ token, expiresAt, deepLink });
}
