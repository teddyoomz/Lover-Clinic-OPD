// ─── Facebook Messenger Webhook Receiver ────────────────────────────────────
// Receives messages from FB Page Messenger → stores in Firestore
// No Firebase auth — uses FB signature verification instead
//
// V75 Item 3 (2026-05-16) — chat_conversations now stamped with branchId
// resolved via be_fb_configs/{branchId} lookup by FB Page ID. Falls back to
// LOVER_DEFAULT_BRANCH_ID (typically นครราชสีมา) for unmatched pages
// (preserves legacy clinic_settings/chat_config era flow). AV57 enforces.

import crypto from 'crypto';
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolveChatBranchIdFromFbEvent } from './_lib/fbChatBranchResolver.js';
import { getFbConfigByPageId } from './_lib/fbConfig.js';
import { resolveChatFallbackBranchId } from './_lib/chatBranchDefaults.js';
// WS1 H1 (2026-06-10) — chat writes via admin SDK (removes unauth REST dependency).
import { adminChatGet, adminChatSet } from './_lib/adminChatStore.js';
// A7 (2026-05-18 audit-fix) — fetch timeout via shared helper.
// Bare fetch() hangs forever if upstream stalls; default 5s timeout
// prevents webhook from blocking Vercel return queue.
import { apiFetch } from '../_lib/apiFetch.js';

const APP_ID = process.env.FIREBASE_APP_ID || 'loverclinic-opd-4c39b';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${APP_ID}/databases/(default)/documents`;
const CHAT_CONFIG_PATH = `artifacts/${APP_ID}/public/data/clinic_settings/chat_config`;
// V78 (2026-05-16 NIGHT — BUG-XR-24 fix): wire FALLBACK_BRANCH_ID through
// resolveChatFallbackBranchId() so hardcoded NAKHON constant kicks in when
// env unset. Same bug class as V77-bis (LINE webhook) — same fix.
const FALLBACK_BRANCH_ID = resolveChatFallbackBranchId(process.env.LOVER_DEFAULT_BRANCH_ID);
const USED_ENV_FALLBACK = !!process.env.LOVER_DEFAULT_BRANCH_ID;

// V75 Item 3 — admin-SDK init for be_fb_configs lookup (rules deny anon read).
let cachedAdminDb = null;
function getAdminFirestore() {
  if (cachedAdminDb) return cachedAdminDb;
  let app;
  if (getApps().length > 0) {
    app = getApp();
  } else {
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
    if (!clientEmail || !rawKey) throw new Error('firebase-admin not configured');
    app = initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
        clientEmail,
        privateKey: rawKey.replace(/\\n/g, '\n'),
      }),
    });
  }
  cachedAdminDb = getFirestore(app);
  return cachedAdminDb;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function verifySignature(rawBody, signature, appSecret) {
  // V78 (2026-05-16 NIGHT — BUG-XR-16 fix): constant-time HMAC comparison.
  // Same class as XR-15 LINE webhook fix.
  const hmac = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const expected = `sha256=${hmac}`;
  if (!signature || typeof signature !== 'string') return false;
  if (signature.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

async function getChatConfig() {
  try {
    const res = await apiFetch(`${FIRESTORE_BASE}/${CHAT_CONFIG_PATH}`);
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
  // First: check if token is valid at all
  const tokenSnippet = accessToken ? `${accessToken.slice(0, 10)}...${accessToken.slice(-5)}` : 'EMPTY';
  console.log(`[fb-webhook] getFBProfile: psid=${psid}, token=${tokenSnippet}`);

  try {
    const url = `https://graph.facebook.com/v25.0/${psid}?fields=name,first_name,last_name,profile_pic&access_token=${accessToken}`;
    const res = await apiFetch(url);
    const raw = await res.text();
    console.log(`[fb-webhook] getFBProfile response: status=${res.status} body=${raw.slice(0, 500)}`);

    if (!res.ok) {
      // Parse error to give clear diagnosis
      try {
        const err = JSON.parse(raw);
        const code = err.error?.code;
        const msg = err.error?.message || '';
        if (code === 190) {
          console.error(`[fb-webhook] TOKEN EXPIRED OR INVALID — need new Page Access Token! Error: ${msg}`);
        } else if (code === 100) {
          console.error(`[fb-webhook] PSID not found or no permission — Error: ${msg}`);
        } else {
          console.error(`[fb-webhook] API error code=${code}: ${msg}`);
        }
      } catch (_) {}
      return null;
    }

    const data = JSON.parse(raw);
    const name = data.name || `${data.first_name || ''} ${data.last_name || ''}`.trim();

    if (!name || /^\d+$/.test(name)) {
      console.warn(`[fb-webhook] getFBProfile: API returned numeric/empty name "${name}" for ${psid} — possible permission issue or Dev mode`);
      return null;
    }

    console.log(`[fb-webhook] getFBProfile success: "${name}", pic=${data.profile_pic ? 'yes' : 'no'}`);
    return { name, profile_pic: data.profile_pic || '' };
  } catch (e) {
    console.error(`[fb-webhook] getFBProfile network error: ${e.message}`);
    return null;
  }
}

// WS1 H1 (2026-06-10): chat_conversations + messages writes migrated from unauthenticated
// Firestore REST (firestorePatch/firestoreGet) to the firebase-admin SDK via
// adminChatGet/adminChatSet (./_lib/adminChatStore.js), so the `chat_conversations
// create/update: if true` rule can be tightened to isClinicStaff(). (FIRESTORE_BASE is
// still used by getChatConfig's legacy config read above.)

// ─── Process FB messaging event ─────────────────────────────────────────────

async function processMessage(senderId, message, config, branchInfo = {}) {
  const convPath = `artifacts/${APP_ID}/public/data/chat_conversations/fb_${senderId}`;
  const msgId = message.mid || `fb_${Date.now()}`;
  const msgPath = `${convPath}/messages/${msgId}`;
  const now = new Date().toISOString();

  // Get or create conversation — always retry profile if name is missing/numeric
  const existingConv = await adminChatGet(getAdminFirestore(), convPath);
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
  await adminChatSet(getAdminFirestore(), msgPath, {
    text: { stringValue: text },
    messageType: { stringValue: messageType },
    imageUrl: { stringValue: imageUrl },
    timestamp: { stringValue: now },
    isFromCustomer: { booleanValue: true },
  });

  // V75 Item 3 — chat_conversations.branchId + branchIdSource for per-branch UI filter (AV57).
  // V78 BUG-XR-24: USED_ENV_FALLBACK distinguishes env-driven vs hardcoded
  // fallback so the branchIdSource label is accurate.
  const chatBranchId = branchInfo.branchId || FALLBACK_BRANCH_ID;
  const chatBranchIdSource = branchInfo.branchIdSource
    || (USED_ENV_FALLBACK
        ? 'webhook-fb-fallback-legacy'
        : 'webhook-fb-fallback-hardcoded-nakhonratchasima');

  // Update conversation
  const convFields = {
    platform: { stringValue: 'facebook' },
    odriverId: { stringValue: senderId },
    displayName: { stringValue: displayName },
    pictureUrl: { stringValue: pictureUrl },
    lastMessage: { stringValue: text },
    lastMessageAt: { stringValue: now },
    unreadCount: { integerValue: String(currentUnread + 1) },
    // V75 Item 3 — branchId + branchIdSource (AV57)
    branchId: { stringValue: chatBranchId },
    branchIdSource: { stringValue: chatBranchIdSource },
  };
  // Only set createdAt on brand-new conversations
  if (!existingConv?.fields) {
    convFields.createdAt = { stringValue: now };
  }
  await adminChatSet(getAdminFirestore(), convPath, convFields);
}

// ─── Process echo message (admin/AI reply from FB) ─────────────────────────

const OUR_APP_ID = '959596076718659';

async function processEchoMessage(recipientId, message) {
  const convPath = `artifacts/${APP_ID}/public/data/chat_conversations/fb_${recipientId}`;
  const msgId = message.mid || `echo_${Date.now()}`;
  const msgPath = `${convPath}/messages/${msgId}`;
  const now = new Date().toISOString();

  // Skip echoes from our own app (already saved by send.js)
  if (String(message.app_id) === OUR_APP_ID) return;

  // Check conversation exists
  const existingConv = await adminChatGet(getAdminFirestore(), convPath);
  if (!existingConv?.fields) return; // No conversation = ignore

  // Parse message content
  let text = '';
  let messageType = 'text';
  let imageUrl = '';

  if (message.text) {
    text = message.text;
  } else if (message.attachments?.length) {
    const att = message.attachments[0];
    if (att.type === 'image') { text = '[รูปภาพ]'; messageType = 'image'; imageUrl = att.payload?.url || ''; }
    else if (att.type === 'video') { text = '[วิดีโอ]'; messageType = 'video'; }
    else if (att.type === 'audio') { text = '[เสียง]'; messageType = 'audio'; }
    else { text = `[${att.type}]`; messageType = att.type; }
  } else {
    text = '[ข้อความที่ไม่รองรับ]';
  }

  // Save message as admin reply (isFromCustomer: false)
  await adminChatSet(getAdminFirestore(), msgPath, {
    text: { stringValue: text },
    messageType: { stringValue: messageType },
    imageUrl: { stringValue: imageUrl },
    timestamp: { stringValue: now },
    isFromCustomer: { booleanValue: false },
  });

  // V75 Item 3 — re-stamp branchId + branchIdSource from existing doc to
  // satisfy AV57 strict (every chat_conversations write stamps branchId).
  // updateMask preserves untouched fields, but explicit re-stamp is defensive.
  const existingBranchId = existingConv?.fields?.branchId?.stringValue
    || FALLBACK_BRANCH_ID;
  const existingBranchIdSource = existingConv?.fields?.branchIdSource?.stringValue
    || 'webhook-fb-fallback-legacy';

  // Update lastMessage but NOT displayName/pictureUrl — keep customer profile
  await adminChatSet(getAdminFirestore(), convPath, {
    lastMessage: { stringValue: text },
    lastMessageAt: { stringValue: now },
    branchId: { stringValue: existingBranchId },
    branchIdSource: { stringValue: existingBranchIdSource },
  });

  console.log(`[fb-webhook] Echo saved for fb_${recipientId}: "${text.slice(0, 50)}"`);
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

  // V75 Item 3 — resolve branchId for chat_conversations stamp (AV57).
  // be_fb_configs/{branchId} where pageId == entry[0].id. Falls back to
  // LOVER_DEFAULT_BRANCH_ID (typically นครราชสีมา) when no match —
  // preserves legacy clinic_settings/chat_config era flow.
  let branchInfo = {
    branchId: FALLBACK_BRANCH_ID,
    branchIdSource: USED_ENV_FALLBACK
      ? 'webhook-fb-fallback-legacy'
      : 'webhook-fb-fallback-hardcoded-nakhonratchasima',
  };
  try {
    const db = getAdminFirestore();
    branchInfo = await resolveChatBranchIdFromFbEvent(body, {
      getFbConfigByPageId: (pid) => getFbConfigByPageId(db, APP_ID, pid),
      fallbackBranchId: FALLBACK_BRANCH_ID,
      onError: (e) => console.warn('[fb-webhook] branchId resolve fell back:', e?.message || e),
    });
  } catch (err) {
    console.warn('[fb-webhook] branchId resolution failed; using fallback:', err?.message || err);
  }

  // Process messaging entries
  const entries = body.entry || [];
  const promises = [];

  for (const entry of entries) {
    const messaging = entry.messaging || [];
    for (const event of messaging) {
      // Echo messages = admin/AI replied from FB — save as admin message
      if (event.message?.is_echo) {
        const recipientId = event.recipient?.id;
        if (recipientId) promises.push(processEchoMessage(recipientId, event.message));
        continue;
      }
      // Only handle messages (not postbacks, etc.)
      if (event.message && event.sender?.id && event.sender.id !== fbConfig.pageId) {
        promises.push(processMessage(event.sender.id, event.message, fbConfig, branchInfo));
      }
    }
  }

  await Promise.allSettled(promises);
  return res.status(200).send('EVENT_RECEIVED');
}
