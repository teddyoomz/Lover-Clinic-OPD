// ─── Send Message API (LINE + Facebook) ─────────────────────────────────────
// V78 (2026-05-16 NIGHT — BUG-CHAT-1, BUG-CHAT-5 fix):
// Authenticated endpoint for admin to reply to customers.
//
// Class-of-bug: V12 multi-reader-sweep at API-layer boundary. Pre-V78 this
// endpoint hardcoded `clinic_settings/chat_config` as the single-tenant
// source for LINE channel access token / FB page access token. Admin in
// พระราม 3 / ทดลอง 1 sent FROM นครราชสีมา's tokens → customer saw replies
// originating from wrong clinic. Critical cross-branch identity leak.
//
// V78 fix:
//   1. Client (ChatPanel) MUST pass `branchId` (from conv.branchId).
//   2. Server resolves per-branch be_line_configs / be_fb_configs first;
//      falls back to legacy chat_config for V75-transition compat.
//   3. Outbound firestorePatch on convPath now restamps `branchId` so the
//      conv doc retains its branch identity post-reply (BUG-CHAT-5).
//   4. Block send with 503 BRANCH_CONFIG_MISSING when neither per-branch
//      nor legacy config has a token (Thai friendly copy).

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
// WS3 (2026-06-10) — restored auth gate. Was importing verifyAuth from the
// V50-deleted ../proclinic/_lib/auth.js (broken import → endpoint 500'd since
// 2026-05-08). Now uses verifyClinicStaffToken (admin SDK verifyIdToken + the
// isClinicStaff/admin claim check) — fixes the broken endpoint AND the latent
// weak-auth (old verifyAuth checked token-validity only, not any claim).
import { verifyClinicStaffToken } from '../admin/_lib/adminAuth.js';
import { resolveLineConfigForAdmin } from '../admin/_lib/lineConfigAdmin.js';
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

function convDoc(db, convId) {
  return db.doc(`artifacts/${APP_ID}/public/data/chat_conversations/${convId}`);
}

function msgDoc(db, convId, msgId) {
  return db.doc(`artifacts/${APP_ID}/public/data/chat_conversations/${convId}/messages/${msgId}`);
}

// ─── Send LINE message ──────────────────────────────────────────────────────

async function sendLineMessage(userId, text, config) {
  const token = config.channelAccessToken;
  if (!token) throw new Error('LINE Channel Access Token ไม่ได้ตั้งค่า');

  const res = await apiFetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      to: userId,
      messages: [{ type: 'text', text }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LINE API error: ${res.status} ${err}`);
  }
  return true;
}

// ─── Send Facebook message ──────────────────────────────────────────────────

async function sendFBMessage(psid, text, config) {
  const token = config.pageAccessToken;
  if (!token) throw new Error('Facebook Page Access Token ไม่ได้ตั้งค่า');

  const res = await apiFetch(`https://graph.facebook.com/v25.0/me/messages?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: psid },
      message: { text },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Facebook API error: ${res.status} ${err}`);
  }
  return true;
}

// ─── Handler ────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyClinicStaffToken(req, res);
  if (!user) return;

  try {
    const { platform, odriverId, text, conversationId, branchId } = req.body || {};
    if (!platform || !odriverId || !text) {
      return res.status(400).json({ success: false, error: 'Missing platform, odriverId, or text' });
    }

    const db = getAdminDb();

    // V78 BUG-CHAT-1 fix: resolve per-branch config first; fall back to legacy.
    let resolved = null;
    let resolverSource = '';
    if (platform === 'line') {
      resolved = await resolveLineConfigForAdmin(db, { branchId });
      resolverSource = resolved?.source || '';
    } else if (platform === 'facebook') {
      resolved = await resolveFbConfigForAdmin(db, { branchId });
      resolverSource = resolved?.source || '';
    } else {
      return res.status(400).json({ success: false, error: `Unknown platform: ${platform}` });
    }

    if (!resolved || !resolved.config) {
      // V78: distinguish "branch has no per-branch config + no legacy fallback"
      // (block) from "config exists but token empty" (block with platform hint).
      return res.status(503).json({
        success: false,
        error: 'BRANCH_CONFIG_MISSING',
        detail: branchId
          ? `สาขา ${branchId} ยังไม่ได้ตั้งค่า ${platform === 'line' ? 'LINE OA' : 'FB Page'} — ` +
            `ไปที่ Backend → ตั้งค่า ${platform === 'line' ? 'LINE OA' : 'FB Page'} เพื่อตั้งค่า.`
          : `ยังไม่ได้ตั้งค่า ${platform === 'line' ? 'LINE OA' : 'FB Page'} — ระบุ branchId.`,
      });
    }

    // Send via platform API using the RESOLVED per-branch token.
    if (platform === 'line') {
      await sendLineMessage(odriverId, text, resolved.config);
    } else {
      await sendFBMessage(odriverId, text, resolved.config);
    }

    // Save sent message to Firestore via admin SDK (bypasses rules cleanly).
    const convId = conversationId || `${platform === 'line' ? 'line' : 'fb'}_${odriverId}`;
    const msgId = `sent_${Date.now()}`;
    const now = new Date().toISOString();

    await msgDoc(db, convId, msgId).set({
      text,
      messageType: 'text',
      imageUrl: '',
      timestamp: now,
      isFromCustomer: false,
    });

    // Update lastMessage + branchId + zeroing unreadCount. V78 BUG-CHAT-5:
    // restamp branchId so the conv doc retains identity even when admin
    // replies via app. resolved.branchId is null only when falling back to
    // legacy chat_config — in that case keep whatever the conv had (no
    // overwrite with null).
    const convPatch = {
      lastMessage: text,
      lastMessageAt: now,
      unreadCount: 0,
    };
    if (resolved.branchId) {
      convPatch.branchId = String(resolved.branchId);
      convPatch.branchIdSource = `send-${platform}-${resolverSource}`;
    }
    await convDoc(db, convId).set(convPatch, { merge: true });

    return res.status(200).json({
      success: true,
      // V78: surface resolution metadata so client can verify wiring.
      resolved: { branchId: resolved.branchId || null, source: resolverSource },
    });
  } catch (err) {
    console.error('[send] Error:', err);
    return res.status(200).json({ success: false, error: err.message });
  }
}
