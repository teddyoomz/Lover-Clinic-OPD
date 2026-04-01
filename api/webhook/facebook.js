// ─── Facebook Messenger Webhook Receiver ────────────────────────────────────
// Receives messages from FB Page Messenger → stores in Firestore
// No Firebase auth — uses FB signature verification instead

import crypto from 'crypto';

const APP_ID = process.env.FIREBASE_APP_ID || 'loverclinic-opd-4c39b';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${APP_ID}/databases/(default)/documents`;
const CHAT_CONFIG_PATH = `artifacts/${APP_ID}/public/data/clinic_settings/chat_config`;

// ─── Helpers ────────────────────────────────────────────────────────────────

function verifySignature(rawBody, signature, appSecret) {
  const hmac = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  return signature === `sha256=${hmac}`;
}

async function getChatConfig() {
  const res = await fetch(`${FIRESTORE_BASE}/${CHAT_CONFIG_PATH}`);
  if (!res.ok) return null;
  const doc = await res.json();
  if (!doc.fields?.facebook?.mapValue?.fields) return null;
  const f = doc.fields.facebook.mapValue.fields;
  return {
    pageAccessToken: f.pageAccessToken?.stringValue || '',
    appSecret: f.appSecret?.stringValue || '',
    verifyToken: f.verifyToken?.stringValue || '',
    pageId: f.pageId?.stringValue || '',
    enabled: f.enabled?.booleanValue === true,
  };
}

async function getFBProfile(psid, accessToken) {
  try {
    const res = await fetch(`https://graph.facebook.com/${psid}?fields=name,profile_pic&access_token=${accessToken}`);
    if (!res.ok) return { name: psid, profile_pic: '' };
    return await res.json();
  } catch {
    return { name: psid, profile_pic: '' };
  }
}

async function firestorePatch(path, fields) {
  await fetch(`${FIRESTORE_BASE}/${path}`, {
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

// ─── Process FB messaging event ─────────────────────────────────────────────

async function processMessage(senderId, message, config) {
  const convPath = `artifacts/${APP_ID}/public/data/chat_conversations/fb_${senderId}`;
  const msgId = message.mid || `fb_${Date.now()}`;
  const msgPath = `${convPath}/messages/${msgId}`;
  const now = new Date().toISOString();

  // Get or create conversation
  const existingConv = await firestoreGet(convPath);
  let displayName = senderId;
  let pictureUrl = '';

  if (!existingConv?.fields?.displayName) {
    const profile = await getFBProfile(senderId, config.pageAccessToken);
    displayName = profile.name || senderId;
    pictureUrl = profile.profile_pic || '';
  } else {
    displayName = existingConv.fields.displayName.stringValue || senderId;
    pictureUrl = existingConv.fields.pictureUrl?.stringValue || '';
  }

  // Build message
  let text = '';
  let messageType = 'text';
  let imageUrl = '';

  if (message.text) {
    text = message.text;
  } else if (message.attachments?.length) {
    const att = message.attachments[0];
    if (att.type === 'image') {
      text = '[รูปภาพ]';
      messageType = 'image';
      imageUrl = att.payload?.url || '';
    } else if (att.type === 'video') {
      text = '[วิดีโอ]';
      messageType = 'video';
    } else if (att.type === 'audio') {
      text = '[เสียง]';
      messageType = 'audio';
    } else if (att.type === 'location') {
      text = `[ตำแหน่ง]`;
      messageType = 'location';
    } else if (att.type === 'file') {
      text = '[ไฟล์]';
      messageType = 'file';
    } else {
      text = `[${att.type}]`;
      messageType = att.type;
    }
  } else {
    text = '[ข้อความที่ไม่รองรับ]';
  }

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
  });

  // Update conversation
  await firestorePatch(convPath, {
    platform: { stringValue: 'facebook' },
    odriverId: { stringValue: senderId },
    displayName: { stringValue: displayName },
    pictureUrl: { stringValue: pictureUrl },
    lastMessage: { stringValue: text },
    lastMessageAt: { stringValue: now },
    unreadCount: { integerValue: String(currentUnread + 1) },
  });
}

// ─── Handler ────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // Facebook webhook verification (GET)
  if (req.method === 'GET') {
    const config = await getChatConfig();
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === config?.verifyToken) {
      console.log('[fb-webhook] Verification successful');
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'Verification failed' });
  }

  if (req.method !== 'POST') return res.status(405).end();

  const config = await getChatConfig();
  if (!config || !config.enabled || !config.appSecret) {
    return res.status(200).json({ message: 'Facebook chat not configured' });
  }

  // Verify signature
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  const signature = req.headers['x-hub-signature-256'];
  if (signature && !verifySignature(rawBody, signature, config.appSecret)) {
    console.warn('[fb-webhook] Invalid signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

  // Process messaging entries
  const entries = body.entry || [];
  const promises = [];

  for (const entry of entries) {
    const messaging = entry.messaging || [];
    for (const event of messaging) {
      // Skip echo messages (sent by page itself)
      if (event.message?.is_echo) continue;
      // Only handle messages (not postbacks, etc.)
      if (event.message && event.sender?.id && event.sender.id !== config.pageId) {
        promises.push(processMessage(event.sender.id, event.message, config));
      }
    }
  }

  await Promise.allSettled(promises);
  return res.status(200).send('EVENT_RECEIVED');
}
