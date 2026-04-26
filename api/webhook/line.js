// ─── LINE Webhook Receiver ──────────────────────────────────────────────────
// Receives messages from LINE Messaging API → stores in Firestore
// No Firebase auth — uses LINE signature verification instead.
//
// V32-tris-ter (2026-04-26) — extended with bot Q&A + customer LINK
// consumer. ProClinic-style flow:
//   1. Customer scans QR on customer detail page → opens LINE chat with
//      bot → sends "LINK-<token>" → webhook consumes token + writes
//      lineUserId onto be_customers/{cid} → bot replies success.
//   2. Customer types "คอร์ส" / "นัด" → bot looks up by lineUserId →
//      replies with active courses or upcoming appointments.

import crypto from 'crypto';
import {
  interpretCustomerMessage,
  formatCoursesReply,
  formatAppointmentsReply,
  formatHelpReply,
  formatLinkSuccessReply,
  formatLinkFailureReply,
  formatNotLinkedReply,
} from '../../src/lib/lineBotResponder.js';

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

async function firestoreDelete(path) {
  await fetch(`${FIRESTORE_BASE}/${path}`, { method: 'DELETE' });
}

// runQuery via Firestore REST runQuery (used to find a customer by
// lineUserId field — no need for an index since `where` against a
// keyword field is auto-indexed). Returns array of plain customer docs.
async function runQuery(structuredQuery) {
  const url = `${FIRESTORE_BASE}:runQuery`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery }),
  });
  if (!res.ok) return [];
  const arr = await res.json();
  return Array.isArray(arr)
    ? arr.filter(r => r?.document).map(r => unwrapDoc(r.document))
    : [];
}

// Convert Firestore REST doc → plain JS object (depth-1 unwrap; tolerates
// nested mapValue/arrayValue for the 2 fields we read here: courses[]
// and appointmentDate). Sufficient for V32-tris-ter bot replies; a full
// recursive unwrap would belong in a shared lib.
function unwrapDoc(doc) {
  if (!doc?.fields) return { id: doc?.name?.split('/').pop() };
  const out = { id: doc.name?.split('/').pop() };
  for (const [k, v] of Object.entries(doc.fields)) out[k] = unwrapValue(v);
  return out;
}

function unwrapValue(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return !!v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('mapValue' in v) {
    const o = {};
    for (const [k, vv] of Object.entries(v.mapValue?.fields || {})) o[k] = unwrapValue(vv);
    return o;
  }
  if ('arrayValue' in v) {
    return (v.arrayValue?.values || []).map(unwrapValue);
  }
  return null;
}

async function pushLineMessage(userId, text, accessToken) {
  if (!userId || !text || !accessToken) return false;
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ to: userId, messages: [{ type: 'text', text }] }),
  });
  return res.ok;
}

async function replyLineMessage(replyToken, text, accessToken) {
  if (!replyToken || !text || !accessToken) return false;
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] }),
  });
  return res.ok;
}

// V32-tris-ter — consume a LINK-<token> message: validate token, ensure
// not expired, ensure no other customer already linked to this lineUserId,
// then write be_customers.lineUserId + delete the token.
async function consumeLinkToken(token, lineUserId) {
  if (!token || !lineUserId) return { ok: false, reason: 'invalid' };
  const tokenPath = `artifacts/${APP_ID}/public/data/be_customer_link_tokens/${encodeURIComponent(token)}`;
  const tokenDoc = await firestoreGet(tokenPath);
  if (!tokenDoc?.fields) return { ok: false, reason: 'invalid' };
  const customerId = tokenDoc.fields.customerId?.stringValue || '';
  const expiresAt = tokenDoc.fields.expiresAt?.stringValue || '';
  if (!customerId) return { ok: false, reason: 'invalid' };
  if (expiresAt && expiresAt < new Date().toISOString()) {
    // Best-effort cleanup of expired token (don't await — webhook timing)
    firestoreDelete(tokenPath).catch(() => {});
    return { ok: false, reason: 'expired' };
  }

  // Check no other customer is already linked to this lineUserId
  const collisions = await runQuery({
    from: [{ collectionId: 'be_customers' }],
    where: {
      compositeFilter: {
        op: 'AND',
        filters: [{
          fieldFilter: {
            field: { fieldPath: 'lineUserId' },
            op: 'EQUAL',
            value: { stringValue: lineUserId },
          },
        }],
      },
    },
    limit: 1,
  }).catch(() => []);
  const otherCustomer = collisions.find(c => c.id !== customerId);
  if (otherCustomer) {
    firestoreDelete(tokenPath).catch(() => {});
    return { ok: false, reason: 'already-linked' };
  }

  // Write lineUserId onto the customer
  const customerPath = `artifacts/${APP_ID}/public/data/be_customers/${encodeURIComponent(customerId)}`;
  await firestorePatch(customerPath, {
    lineUserId: { stringValue: lineUserId },
    lineLinkedAt: { stringValue: new Date().toISOString() },
  });

  // Read the customer name for the success reply
  const cDoc = await firestoreGet(customerPath);
  const customerName = cDoc?.fields?.customerName?.stringValue
    || cDoc?.fields?.name?.stringValue
    || '';

  // Delete the token (one-time use)
  firestoreDelete(tokenPath).catch(() => {});

  return { ok: true, customerId, customerName };
}

async function findCustomerByLineUserId(lineUserId) {
  if (!lineUserId) return null;
  const customers = await runQuery({
    from: [{ collectionId: 'be_customers' }],
    where: {
      fieldFilter: {
        field: { fieldPath: 'lineUserId' },
        op: 'EQUAL',
        value: { stringValue: lineUserId },
      },
    },
    limit: 1,
  }).catch(() => []);
  return customers[0] || null;
}

async function findUpcomingAppointmentsForCustomer(customerId) {
  if (!customerId) return [];
  const appts = await runQuery({
    from: [{ collectionId: 'be_appointments' }],
    where: {
      fieldFilter: {
        field: { fieldPath: 'customerId' },
        op: 'EQUAL',
        value: { stringValue: String(customerId) },
      },
    },
    limit: 50,
  }).catch(() => []);
  return appts;
}

// Decide + emit the bot reply for an incoming customer text message.
// Side-effects: may push 1 reply via LINE Reply API, may update Firestore.
// Returns true when a reply was sent (caller can suppress the chat-storage
// "unread" bump if desired — we keep both so admin sees the conversation).
async function maybeEmitBotReply(event, config) {
  if (event.message?.type !== 'text') return false;
  const userId = event.source?.userId;
  const text = event.message?.text || '';
  if (!userId) return false;

  const intent = interpretCustomerMessage(text);

  if (intent.intent === 'link') {
    const result = await consumeLinkToken(intent.payload?.token || '', userId);
    const replyText = result.ok
      ? formatLinkSuccessReply(result.customerName || '')
      : formatLinkFailureReply(result.reason);
    await replyLineMessage(event.replyToken, replyText, config.channelAccessToken);
    return true;
  }

  if (intent.intent === 'courses' || intent.intent === 'appointments') {
    const customer = await findCustomerByLineUserId(userId);
    if (!customer) {
      await replyLineMessage(event.replyToken, formatNotLinkedReply(), config.channelAccessToken);
      return true;
    }
    if (intent.intent === 'courses') {
      const replyText = formatCoursesReply(customer.courses || []);
      await replyLineMessage(event.replyToken, replyText, config.channelAccessToken);
      return true;
    }
    if (intent.intent === 'appointments') {
      const appts = await findUpcomingAppointmentsForCustomer(customer.id);
      const replyText = formatAppointmentsReply(appts);
      await replyLineMessage(event.replyToken, replyText, config.channelAccessToken);
      return true;
    }
  }

  // help fallback — don't spam (only emit help when message was non-empty
  // AND wasn't recognized at all). This keeps random "ครับ" / emojis from
  // triggering an auto-reply.
  if (intent.intent === 'help' && text.trim().length >= 2) {
    await replyLineMessage(event.replyToken, formatHelpReply(), config.channelAccessToken);
    return true;
  }
  return false;
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

  // V32-tris-ter — bot Q&A + LINK consumer. Runs AFTER chat-message
  // storage so admin still sees every incoming message in the chat panel
  // even if the bot also auto-replied. Best-effort: bot reply errors
  // never block the webhook.
  try {
    await maybeEmitBotReply(event, config);
  } catch (err) {
    console.warn('[line-webhook] bot reply failed:', err?.message || err);
  }
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
