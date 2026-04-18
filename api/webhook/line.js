// ─── LINE Webhook Receiver ──────────────────────────────────────────────────
// Receives messages from LINE Messaging API → stores in Firestore
// No Firebase auth — uses LINE signature verification instead

import crypto from 'crypto';

const APP_ID = process.env.FIREBASE_APP_ID || 'loverclinic-opd-4c39b';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${APP_ID}/databases/(default)/documents`;
const CHAT_CONFIG_PATH = `artifacts/${APP_ID}/public/data/clinic_settings/chat_config`;

// ─── Helpers ────────────────────────────────────────────────────────────────

function verifySignature(body, signature, channelSecret) {
  const hmac = crypto.createHmac('SHA256', channelSecret).update(body).digest('base64');
  return hmac === signature;
}

async function getChatConfig() {
  const res = await fetch(`${FIRESTORE_BASE}/${CHAT_CONFIG_PATH}`);
  if (!res.ok) return null;
  const doc = await res.json();
  if (!doc.fields?.line?.mapValue?.fields) return null;
  const f = doc.fields.line.mapValue.fields;
  return {
    channelAccessToken: f.channelAccessToken?.stringValue || '',
    channelSecret: f.channelSecret?.stringValue || '',
    enabled: f.enabled?.booleanValue === true,
  };
}

async function getLineProfile(userId, accessToken) {
  try {
    const res = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return { displayName: userId, pictureUrl: '' };
    return await res.json();
  } catch {
    return { displayName: userId, pictureUrl: '' };
  }
}

async function firestorePatch(path, fields) {
  // CLAUDE.md rule 7 / audit-api-layer A1: Firestore REST PATCH without
  // updateMask.fieldPaths REPLACES the entire document — silently wipes
  // every field not included in `fields`. The mask restricts the PATCH to
  // the named fields only. Match the pattern used by facebook.js / send.js.
  const mask = Object.keys(fields || {}).map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
  const url = mask ? `${FIRESTORE_BASE}/${path}?${mask}` : `${FIRESTORE_BASE}/${path}`;
  await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
}

async function firestoreGet(path) {
  const res = await fetch(`${FIRESTORE_BASE}/${path}`);
  if (!res.ok) return null;
  return await res.json();
}

// ─── Process LINE events ────────────────────────────────────────────────────

async function processEvent(event, config) {
  if (event.type !== 'message') return;

  const userId = event.source?.userId;
  if (!userId) return;

  const convPath = `artifacts/${APP_ID}/public/data/chat_conversations/line_${userId}`;
  const msgPath = `${convPath}/messages/${event.message.id}`;
  const now = new Date().toISOString();

  // Get or create conversation
  const existingConv = await firestoreGet(convPath);
  let displayName = userId;
  let pictureUrl = '';

  if (!existingConv?.fields?.displayName) {
    const profile = await getLineProfile(userId, config.channelAccessToken);
    displayName = profile.displayName || userId;
    pictureUrl = profile.pictureUrl || '';
  } else {
    displayName = existingConv.fields.displayName.stringValue || userId;
    pictureUrl = existingConv.fields.pictureUrl?.stringValue || '';
  }

  // Build message text
  let text = '';
  let messageType = event.message.type || 'text';
  let imageUrl = '';

  if (event.message.type === 'text') {
    text = event.message.text || '';
  } else if (event.message.type === 'image') {
    text = '[รูปภาพ]';
    imageUrl = `https://api-data.line.me/v2/bot/message/${event.message.id}/content`;
  } else if (event.message.type === 'sticker') {
    text = '[สติกเกอร์]';
  } else if (event.message.type === 'video') {
    text = '[วิดีโอ]';
  } else if (event.message.type === 'audio') {
    text = '[เสียง]';
  } else if (event.message.type === 'location') {
    text = `[ตำแหน่ง: ${event.message.title || event.message.address || ''}]`;
  } else {
    text = `[${event.message.type}]`;
  }

  // Calculate unread count
  const currentUnread = existingConv?.fields?.unreadCount?.integerValue
    ? parseInt(existingConv.fields.unreadCount.integerValue)
    : 0;

  // Save message
  await firestorePatch(msgPath, {
    text: { stringValue: text },
    messageType: { stringValue: messageType },
    imageUrl: { stringValue: imageUrl },
    timestamp: { stringValue: now },
    isFromCustomer: { booleanValue: true },
    lineReplyToken: { stringValue: event.replyToken || '' },
  });

  // Update conversation
  const convFields = {
    platform: { stringValue: 'line' },
    odriverId: { stringValue: userId },
    displayName: { stringValue: displayName },
    pictureUrl: { stringValue: pictureUrl },
    lastMessage: { stringValue: text },
    lastMessageAt: { stringValue: now },
    unreadCount: { integerValue: String(currentUnread + 1) },
  };
  // Only set createdAt on brand-new conversations
  if (!existingConv?.fields) {
    convFields.createdAt = { stringValue: now };
  }
  await firestorePatch(convPath, convFields);
}

// ─── Handler ────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // LINE sends GET for webhook URL verification
  if (req.method === 'GET') return res.status(200).json({ status: 'ok' });

  if (req.method !== 'POST') return res.status(405).end();

  const config = await getChatConfig();
  if (!config || !config.enabled || !config.channelSecret) {
    return res.status(200).json({ message: 'LINE chat not configured' });
  }

  // Verify signature
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  const signature = req.headers['x-line-signature'];
  if (!signature || !verifySignature(rawBody, signature, config.channelSecret)) {
    console.warn('[line-webhook] Invalid signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const events = body.events || [];

  // Process events in parallel
  await Promise.allSettled(events.map(e => processEvent(e, config)));

  return res.status(200).json({ received: events.length });
}
