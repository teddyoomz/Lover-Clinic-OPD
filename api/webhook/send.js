// ─── Send Message API (LINE + Facebook) ─────────────────────────────────────
// Authenticated endpoint for admin to reply to customers

import { verifyAuth } from '../proclinic/_lib/auth.js';

const APP_ID = process.env.FIREBASE_APP_ID || 'loverclinic-opd-4c39b';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${APP_ID}/databases/(default)/documents`;
const CHAT_CONFIG_PATH = `artifacts/${APP_ID}/public/data/clinic_settings/chat_config`;

async function getChatConfig() {
  const res = await fetch(`${FIRESTORE_BASE}/${CHAT_CONFIG_PATH}`);
  if (!res.ok) return null;
  const doc = await res.json();
  return doc.fields || null;
}

async function firestorePatch(path, fields) {
  await fetch(`${FIRESTORE_BASE}/${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
}

// ─── Send LINE message ──────────────────────────────────────────────────────

async function sendLineMessage(userId, text, config) {
  const f = config.line?.mapValue?.fields;
  const token = f?.channelAccessToken?.stringValue;
  if (!token) throw new Error('LINE Channel Access Token ไม่ได้ตั้งค่า');

  const res = await fetch('https://api.line.me/v2/bot/message/push', {
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
  const f = config.facebook?.mapValue?.fields;
  const token = f?.pageAccessToken?.stringValue;
  if (!token) throw new Error('Facebook Page Access Token ไม่ได้ตั้งค่า');

  const res = await fetch(`https://graph.facebook.com/v25.0/me/messages?access_token=${token}`, {
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

  const user = await verifyAuth(req, res);
  if (!user) return;

  try {
    const { platform, odriverId, text, conversationId } = req.body || {};
    if (!platform || !odriverId || !text) {
      return res.status(400).json({ success: false, error: 'Missing platform, odriverId, or text' });
    }

    const config = await getChatConfig();
    if (!config) {
      return res.status(200).json({ success: false, error: 'Chat ยังไม่ได้ตั้งค่า' });
    }

    // Send via platform API
    if (platform === 'line') {
      await sendLineMessage(odriverId, text, config);
    } else if (platform === 'facebook') {
      await sendFBMessage(odriverId, text, config);
    } else {
      return res.status(400).json({ success: false, error: `Unknown platform: ${platform}` });
    }

    // Save sent message to Firestore
    const convId = conversationId || `${platform === 'line' ? 'line' : 'fb'}_${odriverId}`;
    const msgId = `sent_${Date.now()}`;
    const msgPath = `artifacts/${APP_ID}/public/data/chat_conversations/${convId}/messages/${msgId}`;
    const now = new Date().toISOString();

    await firestorePatch(msgPath, {
      text: { stringValue: text },
      messageType: { stringValue: 'text' },
      imageUrl: { stringValue: '' },
      timestamp: { stringValue: now },
      isFromCustomer: { booleanValue: false },
    });

    // Do NOT update lastMessage — keep showing customer's last message in the list

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[send] Error:', err);
    return res.status(200).json({ success: false, error: err.message });
  }
}
