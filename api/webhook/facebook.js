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
  try {
    const res = await fetch(`${FIRESTORE_BASE}/${CHAT_CONFIG_PATH}`);
    if (!res.ok) { console.log('[fb-webhook] getChatConfig: Firestore fetch failed', res.status); return null; }
    const doc = await res.json();
    // Try mapValue format (saved via Firebase SDK from client)
    const fbMap = doc.fields?.facebook?.mapValue?.fields;
    if (fbMap) {
      return {
        pageAccessToken: fbMap.pageAccessToken?.stringValue || '',
        appSecret: fbMap.appSecret?.stringValue || '',
        verifyToken: fbMap.verifyToken?.stringValue || '',
        pageId: fbMap.pageId?.stringValue || '',
        enabled: fbMap.enabled?.booleanValue === true,
      };
    }
    console.log('[fb-webhook] getChatConfig: no facebook mapValue found, fields:', JSON.stringify(doc.fields).slice(0, 200));
    return null;
  } catch (e) {
    console.error('[fb-webhook] getChatConfig error:', e.message);
    return null;
  }
}

async function getFBProfile(psid, accessToken) {
  // Try up to 3 times with different strategies
  const attempts = [
    { fields: 'name,first_name,last_name,profile_pic', version: 'v21.0' },
    { fields: 'name,first_name,last_name,profile_pic', version: 'v19.0' },
    { fields: 'name', version: 'v21.0' },
  ];

  for (let i = 0; i < attempts.length; i++) {
    try {
      const { fields, version } = attempts[i];
      const url = `https://graph.facebook.com/${version}/${psid}?fields=${fields}&access_token=${accessToken}`;
      const res = await fetch(url);

      if (!res.ok) {
        const errText = await res.text();
        console.warn(`[fb-webhook] getFBProfile attempt ${i + 1} failed for ${psid}: ${res.status} ${errText.slice(0, 300)}`);
        // Wait before retry
        if (i < attempts.length - 1) await new Promise(r => setTimeout(r, 500));
        continue;
      }

      const data = await res.json();
      const name = data.name || `${data.first_name || ''} ${data.last_name || ''}`.trim();

      // If name is empty or still just digits, treat as failure
      if (!name || /^\d+$/.test(name)) {
        console.warn(`[fb-webhook] getFBProfile attempt ${i + 1}: got numeric/empty name "${name}" for ${psid}`);
        if (i < attempts.length - 1) await new Promise(r => setTimeout(r, 500));
        continue;
      }

      console.log(`[fb-webhook] getFBProfile success for ${psid}: "${name}" (attempt ${i + 1})`);
      return { name, profile_pic: data.profile_pic || '' };
    } catch (e) {
      console.warn(`[fb-webhook] getFBProfile attempt ${i + 1} error for ${psid}:`, e.message);
      if (i < attempts.length - 1) await new Promise(r => setTimeout(r, 500));
    }
  }

  // All attempts failed — return null to signal "don't overwrite with garbage"
  console.warn(`[fb-webhook] getFBProfile: all attempts failed for ${psid}`);
  return null;
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

  // Get or create conversation — always retry profile if name is missing/numeric
  const existingConv = await firestoreGet(convPath);
  const existingName = existingConv?.fields?.displayName?.stringValue || '';
  const existingPic = existingConv?.fields?.pictureUrl?.stringValue || '';
  const nameIsGood = existingName && !/^\d+$/.test(existingName) && existingName !== 'ลูกค้า FB';

  let displayName;
  let pictureUrl;

  if (nameIsGood) {
    // Already have a real name — keep it, but try to get pic if missing
    displayName = existingName;
    pictureUrl = existingPic;
    if (!pictureUrl) {
      const profile = await getFBProfile(senderId, config.pageAccessToken);
      if (profile) pictureUrl = profile.profile_pic || '';
    }
  } else {
    // No name or still numeric/placeholder → fetch profile
    const profile = await getFBProfile(senderId, config.pageAccessToken);
    if (profile) {
      displayName = profile.name;
      pictureUrl = profile.profile_pic || existingPic;
    } else {
      // All fetch attempts failed — use placeholder, never save raw numeric ID
      displayName = existingName && existingName !== senderId ? existingName : 'ลูกค้า FB';
      pictureUrl = existingPic;
    }
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
  const convFields = {
    platform: { stringValue: 'facebook' },
    odriverId: { stringValue: senderId },
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

// Tell Vercel not to parse body — we need raw body for signature verification
export const config = { api: { bodyParser: false } };

// Read raw body from request stream
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();

  console.log(`[fb-webhook] ${req.method} received`);

  // Facebook webhook verification (GET)
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    console.log(`[fb-webhook] Verify: mode=${mode} token=${token}`);

    const fbConfig = await getChatConfig();
    if (mode === 'subscribe' && fbConfig?.verifyToken && token === fbConfig.verifyToken) {
      console.log('[fb-webhook] Verification successful');
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'Verification failed' });
  }

  if (req.method !== 'POST') return res.status(405).end();

  const fbConfig = await getChatConfig();
  if (!fbConfig || !fbConfig.appSecret) {
    console.log('[fb-webhook] Not configured');
    return res.status(200).json({ message: 'Facebook chat not configured' });
  }

  // Read raw body for signature verification
  const rawBodyBuf = await getRawBody(req);
  const rawBody = rawBodyBuf.toString('utf8');

  // Verify signature
  const signature = req.headers['x-hub-signature-256'];
  if (signature) {
    if (!verifySignature(rawBody, signature, fbConfig.appSecret)) {
      console.warn('[fb-webhook] Invalid signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }
    console.log('[fb-webhook] Signature verified ✓');
  }

  const body = JSON.parse(rawBody);
  console.log(`[fb-webhook] POST entries=${body.entry?.length || 0}`);

  // Process messaging entries
  const entries = body.entry || [];
  const promises = [];

  for (const entry of entries) {
    const messaging = entry.messaging || [];
    for (const event of messaging) {
      // Skip echo messages (sent by page itself)
      if (event.message?.is_echo) continue;
      // Only handle messages (not postbacks, etc.)
      if (event.message && event.sender?.id && event.sender.id !== fbConfig.pageId) {
        promises.push(processMessage(event.sender.id, event.message, fbConfig));
      }
    }
  }

  await Promise.allSettled(promises);
  return res.status(200).send('EVENT_RECEIVED');
}
