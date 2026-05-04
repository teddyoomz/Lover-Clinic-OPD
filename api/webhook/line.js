// ─── LINE Webhook Receiver ──────────────────────────────────────────────────
// Receives messages from LINE Messaging API → stores in Firestore
// No Firebase auth — uses LINE signature verification instead.
//
// V32-tris-ter (2026-04-26) → V33.4 redesign → V33.9 cleanup (2026-04-27):
//   1. Customer DMs national-ID/passport → bot creates pending
//      be_link_requests entry → admin approves in LinkRequestsTab → push
//      success reply + write lineUserId on be_customers.
//   2. Customer types "คอร์ส" / "นัด" → bot looks up by lineUserId →
//      replies with active courses or upcoming appointments.
// V33.9 stripped the obsolete pre-V33.4 QR-token consumption path entirely.

import crypto from 'crypto';
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  interpretCustomerMessage,
  formatCoursesReply,
  formatAppointmentsReply,
  formatHelpReply,
  formatNotLinkedReply,
  formatIdRequestAck,
  formatIdRequestRateLimitedReply,
  formatIdRequestInvalidFormat,
  // V33.5 — Flex message builders for richer course/appointment replies
  buildCoursesFlex,
  buildAppointmentsFlex,
  // V33.7 — i18n: derive customer's preferred language (lineLanguage field
  // OR customer_type:'foreigner' fallback → 'en'; else 'th').
  getLanguageForCustomer,
  // V33.9 — formatLinkSuccessReply + formatLinkFailureReply removed
  // (pre-V33.4 QR-token flow stripped; admin-mediated approval uses
  // formatLinkRequestApprovedReply via linkRequestsClient).
} from '../../src/lib/lineBotResponder.js';
// Phase BS V3 (2026-05-04) — per-branch LINE OA config. Webhook routes
// incoming events by event.destination → resolves branchId from
// be_line_configs/{branchId}. Falls back to clinic_settings/chat_config.line
// during transition.
import { resolveLineConfigForWebhook } from '../admin/_lib/lineConfigAdmin.js';

const APP_ID = process.env.FIREBASE_APP_ID || 'loverclinic-opd-4c39b';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${APP_ID}/databases/(default)/documents`;
const CHAT_CONFIG_PATH = `artifacts/${APP_ID}/public/data/clinic_settings/chat_config`;

// V32-tris-ter-fix (2026-04-26) — be_* collections (be_customers,
// be_appointments, be_link_requests, be_link_attempts) have firestore.rules
// that DENY unauth REST reads. The webhook is anon-auth-less by design
// (LINE signature is the gate) so we can't authenticate as a clinic-staff
// user. Solution: use firebase-admin SDK which bypasses rules. Requires
// FIREBASE_ADMIN_* env vars in Vercel (already set for api/admin/* endpoints).
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

function verifySignature(body, signature, channelSecret) {
  const hmac = crypto.createHmac('SHA256', channelSecret).update(body).digest('base64');
  return hmac === signature;
}

async function getChatConfig() {
  // Phase BS V3 (2026-05-04) — used as a fallback for top-of-handler signature
  // verification only. Per-event branch routing happens later via
  // resolveLineConfigForWebhook(event). Once all branches have configs in
  // be_line_configs/* this top-of-handler check becomes redundant + can be
  // simplified to "webhook is enabled?" without touching any tokens.
  const res = await fetch(`${FIRESTORE_BASE}/${CHAT_CONFIG_PATH}`);
  if (!res.ok) return null;
  const doc = await res.json();
  if (!doc.fields?.line?.mapValue?.fields) return null;
  const f = doc.fields.line.mapValue.fields;
  // V33.5 — also surface clinicName + accentColor for Flex bubble theming.
  // These read from the parent doc (clinic_settings/chat_config) and are
  // optional. Webhook falls back to defaults inside the Flex builders.
  return {
    channelAccessToken: f.channelAccessToken?.stringValue || '',
    channelSecret: f.channelSecret?.stringValue || '',
    enabled: f.enabled?.booleanValue === true,
    clinicName: doc.fields?.clinicName?.stringValue || '',
    accentColor: doc.fields?.accentColor?.stringValue || '',
  };
}

/**
 * Phase BS V3 (2026-05-04) — read enable-flags across ALL be_line_configs
 * docs to decide whether to accept the webhook at all. Returns true if
 * ANY config is enabled with a channelSecret. This is intentionally
 * permissive — we still verify the signature per-event using the matched
 * config. If all branches are disabled, the webhook short-circuits.
 */
async function isAnyLineEnabled(db) {
  try {
    const snap = await db
      .collection(`artifacts/${APP_ID}/public/data/be_line_configs`)
      .where('enabled', '==', true)
      .limit(1)
      .get();
    if (!snap.empty) return true;
  } catch { /* fall through */ }
  return false;
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

// V32-tris-ter-fix (2026-04-26): firestoreDelete + runQuery + unwrapDoc/
// unwrapValue helpers were used only for be_* paths which now go through
// firebase-admin SDK (see findCustomerByLineUserId /
// findUpcomingAppointmentsForCustomer). Removed; firestoreGet stays for
// chat_conversations existence check (public read rule).

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

/**
 * Send a LINE reply.
 * @param {string} replyToken
 * @param {string|Array<object>} payload — string text OR array of LINE message
 *   objects (e.g. [{ type: 'flex', altText, contents }, { type: 'text', text }]).
 *   String is wrapped into [{type:'text', text}] for backward compatibility.
 *   Array is passed through (max 5 per LINE API limit).
 * @param {string} accessToken
 */
async function replyLineMessage(replyToken, payload, accessToken) {
  if (!replyToken || !payload || !accessToken) return false;
  // V33.5 — accept either string (legacy) or array of message objects (Flex).
  const messages = Array.isArray(payload)
    ? payload.slice(0, 5)
    : [{ type: 'text', text: String(payload) }];
  if (messages.length === 0) return false;
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ replyToken, messages }),
  });
  return res.ok;
}

// V33.9 — consumeLinkToken REMOVED. Pre-V33.4 QR-token consumption path
// stripped along with be_customer_link_tokens collection. Customer messages
// matching "LINK-<token>" now fall through interpretCustomerMessage →
// 'unknown' intent → no bot reply (silent ignore). Admin-mediated id-link-
// request flow (V33.4) is the sole linking mechanism.

// V32-tris-quater (2026-04-26) — id-link-request flow. Customer DMs
// "ผูก 1234567890123" (or passport) → bot looks up customer by ID via
// admin SDK → if found, creates pending be_link_requests entry for
// admin to approve/reject. Same-reply anti-enumeration: bot replies
// IDENTICALLY whether the ID matched or not, so attacker DMing random
// IDs can't confirm which exist in our DB.
//
// Rate limit: 5 requests per lineUserId per 24h to prevent enumeration
// + brute force on IDs. Tracked in be_link_attempts/{lineUserId}.

const RATE_LIMIT_MAX = 5;       // requests per window
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h

async function checkRateLimit(lineUserId) {
  const db = getAdminFirestore();
  const ref = db.doc(`artifacts/${APP_ID}/public/data/be_link_attempts/${lineUserId}`);
  const snap = await ref.get();
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  let attempts = [];
  if (snap.exists) {
    const data = snap.data() || {};
    attempts = (Array.isArray(data.timestamps) ? data.timestamps : [])
      .filter(t => Number(t) > cutoff);
  }
  if (attempts.length >= RATE_LIMIT_MAX) {
    return { allowed: false, count: attempts.length };
  }
  attempts.push(now);
  await ref.set({ timestamps: attempts, lastAttemptAt: new Date(now).toISOString() }, { merge: true });
  return { allowed: true, count: attempts.length };
}

async function findCustomerByNationalId(idValue) {
  const db = getAdminFirestore();
  const snap = await db
    .collection(`artifacts/${APP_ID}/public/data/be_customers`)
    .where('patientData.nationalId', '==', idValue)
    .limit(1)
    .get()
    .catch(() => null);
  if (!snap || snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...(d.data() || {}) };
}

async function findCustomerByPassport(idValue) {
  const db = getAdminFirestore();
  // Try uppercased + as-is
  for (const v of [idValue, idValue.toUpperCase(), idValue.toLowerCase()]) {
    const snap = await db
      .collection(`artifacts/${APP_ID}/public/data/be_customers`)
      .where('patientData.passport', '==', v)
      .limit(1)
      .get()
      .catch(() => null);
    if (snap && !snap.empty) {
      const d = snap.docs[0];
      return { id: d.id, ...(d.data() || {}) };
    }
  }
  return null;
}

// Create a pending link-request entry. Returns true if created, false on
// failure. Always returns regardless of match — the bot replies the same
// ack message either way (anti-enumeration).
async function createLinkRequest({ customer, lineUserId, lineProfile, idType, idValue, branchId }) {
  if (!customer) return false;
  try {
    const db = getAdminFirestore();
    const requestId = `lr-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const last4 = String(idValue || '').slice(-4);
    // Phase BS V3 (2026-05-04) — stamp branchId resolved from the matched
    // LINE OA config. customer.branchId wins if present (the link is *for*
    // that customer's branch); otherwise fall back to the LINE config's
    // branch. Either is acceptable so the LinkRequestsTab branch filter +
    // legacy-untagged include catches it.
    const stampedBranchId =
      String(customer.branchId || '').trim() || String(branchId || '').trim() || null;
    await db.doc(`artifacts/${APP_ID}/public/data/be_link_requests/${requestId}`).set({
      requestId,
      customerId: String(customer.id || customer.customerId || ''),
      customerName: String(customer.customerName || customer.name || ''),
      customerHN: String(customer.proClinicHN || customer.hn || ''),
      branchId: stampedBranchId,
      lineUserId,
      lineDisplayName: String(lineProfile?.displayName || ''),
      linePictureUrl: String(lineProfile?.pictureUrl || ''),
      idType,
      idValueLast4: last4,
      status: 'pending',
      requestedAt: new Date().toISOString(),
      resolvedAt: null,
      resolvedBy: null,
      resolveAction: null,
    });
    return true;
  } catch (e) {
    console.warn('[line-webhook] createLinkRequest failed:', e?.message || e);
    return false;
  }
}

async function findCustomerByLineUserId(lineUserId) {
  if (!lineUserId) return null;
  try {
    const db = getAdminFirestore();
    const snap = await db
      .collection(`artifacts/${APP_ID}/public/data/be_customers`)
      .where('lineUserId', '==', lineUserId)
      .limit(1)
      .get();
    if (snap.empty) return null;
    const d = snap.docs[0];
    const data = d.data() || {};
    // V33.4 (D4) — suspended links are invisible to the bot. Chat message
    // still gets stored upstream (per V32-tris-ter ordering); we just skip
    // the bot reply by returning null here.
    if (data.lineLinkStatus === 'suspended') return null;
    return { id: d.id, ...data };
  } catch {
    return null;
  }
}

async function findUpcomingAppointmentsForCustomer(customerId) {
  if (!customerId) return [];
  try {
    const db = getAdminFirestore();
    const snap = await db
      .collection(`artifacts/${APP_ID}/public/data/be_appointments`)
      .where('customerId', '==', String(customerId))
      .limit(50)
      .get();
    return snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
  } catch {
    return [];
  }
}

// Decide + emit the bot reply for an incoming customer text message.
// Side-effects: may push 1 reply via LINE Reply API, may update Firestore.
// Returns true when a reply was sent (caller can suppress the chat-storage
// "unread" bump if desired — we keep both so admin sees the conversation).
async function maybeEmitBotReply(event, config, branchId) {
  if (event.message?.type !== 'text') return false;
  const userId = event.source?.userId;
  const text = event.message?.text || '';
  if (!userId) return false;

  const intent = interpretCustomerMessage(text);

  // V33.9 — intent === 'link' branch REMOVED (pre-V33.4 QR-token flow
  // stripped). LINK-<token> messages now hit 'unknown' → no reply.

  // V32-tris-quater (2026-04-26) — id-link-request: customer DM'd
  // "ผูก <ID>" (legacy) OR a bare 13-digit/passport (V33.4 D3).
  // Format-invalid → reply with format hint (only legacy "ผูก" path).
  // Format-valid → check rate limit + look up customer + create
  // pending request when match.
  //
  // V33.4 (D3) divergence on no-match:
  //   - wasBarePrefix=false (legacy "ผูก" path): same-reply anti-enumeration ack
  //     regardless of match (preserves V32-tris-quater contract).
  //   - wasBarePrefix=true (bare-ID path): on no-match, DROP silently into
  //     Q&A help fallback. No admin queue entry, no rate-limit consumption.
  //     Per user choice: "Ignore เงียบ" — accepts minor info leak in
  //     exchange for less queue spam from misdialed numbers.
  if (intent.intent === 'id-link-request') {
    const wasBarePrefix = !!intent.payload?.wasBarePrefix;
    if (intent.payload?.idType === 'invalid') {
      // 'invalid' only emitted from the legacy "ผูก" path → keep replying.
      await replyLineMessage(event.replyToken, formatIdRequestInvalidFormat(), config.channelAccessToken);
      return true;
    }
    const rate = await checkRateLimit(userId).catch(() => ({ allowed: true }));
    if (!rate.allowed) {
      await replyLineMessage(event.replyToken, formatIdRequestRateLimitedReply(), config.channelAccessToken);
      return true;
    }
    // Look up customer by national-id or passport (admin SDK bypasses rules)
    const idType = intent.payload?.idType;
    const idValue = intent.payload?.idValue;
    let customer = null;
    if (idType === 'national-id') {
      customer = await findCustomerByNationalId(idValue);
    } else if (idType === 'passport') {
      customer = await findCustomerByPassport(idValue);
    }
    if (customer) {
      // Get LINE profile for the snapshot
      const profile = await getLineProfile(userId, config.channelAccessToken);
      // Phase BS V3 — stamp branchId on the link request (resolved from
      // the matched LINE OA config; falls back to customer.branchId inside
      // createLinkRequest).
      await createLinkRequest({ customer, lineUserId: userId, lineProfile: profile, idType, idValue, branchId });
      // V33.7 — derive customer's preferred language for the ack reply
      const lang = getLanguageForCustomer(customer);
      await replyLineMessage(event.replyToken, formatIdRequestAck(lang), config.channelAccessToken);
      return true;
    }
    // No match.
    if (wasBarePrefix) {
      // V33.4 (D3) — silent drop. Customer DM'd a bare number that didn't
      // match any patient ID; treat as random message → no reply, no queue
      // entry. Falls THROUGH to the help-fallback below (which itself only
      // emits a reply when intent === 'help').
      // Intentionally NOT returning here; the function continues.
    } else {
      // Legacy "ผูก" path: keep V32-tris-quater anti-enumeration contract.
      await replyLineMessage(event.replyToken, formatIdRequestAck(), config.channelAccessToken);
      return true;
    }
  }

  if (intent.intent === 'courses' || intent.intent === 'appointments') {
    const customer = await findCustomerByLineUserId(userId);
    if (!customer) {
      await replyLineMessage(event.replyToken, formatNotLinkedReply(), config.channelAccessToken);
      return true;
    }
    // V33.5 — read clinic name + accent color from chat_config (best-effort).
    // Fall back to defaults if missing.
    const clinicName = config.clinicName || 'Lover Clinic';
    const accentColor = config.accentColor || '#dc2626';
    // V33.7 — derive customer's preferred language. Stored `lineLanguage`
    // wins; otherwise customer_type:'foreigner' → 'en'; else 'th'.
    const lang = getLanguageForCustomer(customer);
    if (intent.intent === 'courses') {
      // V33.5 — send Flex bubble. altText embedded for graceful fallback on
      // older LINE clients (<8.11) that can't render Flex.
      const flex = buildCoursesFlex(customer.courses || [], { accentColor, clinicName, language: lang });
      await replyLineMessage(event.replyToken, [flex], config.channelAccessToken);
      return true;
    }
    if (intent.intent === 'appointments') {
      const appts = await findUpcomingAppointmentsForCustomer(customer.id);
      const flex = buildAppointmentsFlex(appts, { accentColor, clinicName, language: lang });
      await replyLineMessage(event.replyToken, [flex], config.channelAccessToken);
      return true;
    }
  }

  // V33.4 (D9) — 'unknown' intent: chat message stored upstream but no bot
  // reply. This is the new default for any message that doesn't EXACTLY
  // match a trigger phrase — replaces the old substring-match auto-reply.
  if (intent.intent === 'unknown') {
    return false;
  }

  // help fallback — only emit help when explicitly requested via a
  // HELP_TRIGGERS phrase. Random "ครับ" / emojis no longer trigger help.
  if (intent.intent === 'help' && text.trim().length >= 2) {
    await replyLineMessage(event.replyToken, formatHelpReply(), config.channelAccessToken);
    return true;
  }
  return false;
}

// ─── Process LINE events ────────────────────────────────────────────────────

async function processEvent(event, fallbackConfig) {
  if (event.type !== 'message') return;

  const userId = event.source?.userId;
  if (!userId) return;

  // Phase BS V3 (2026-05-04) — resolve per-event branch config. event.destination
  // is the LINE bot's userId; we look it up in be_line_configs to find which
  // branch owns this channel. Falls back to the legacy clinic_settings/chat_config
  // config (passed in as fallbackConfig) during transition so existing single-
  // branch deployments keep working.
  let config = fallbackConfig;
  let branchId = null;
  try {
    const db = getAdminFirestore();
    const resolved = await resolveLineConfigForWebhook(db, event);
    if (resolved && resolved.config?.channelAccessToken) {
      config = {
        channelAccessToken: resolved.config.channelAccessToken,
        channelSecret: resolved.config.channelSecret,
        enabled: resolved.config.enabled !== false,
        clinicName: resolved.config.clinicName || fallbackConfig?.clinicName || '',
        accentColor: resolved.config.accentColor || fallbackConfig?.accentColor || '',
      };
      branchId = resolved.branchId || null;
    }
  } catch (err) {
    console.warn('[line-webhook] config resolution fell back:', err?.message || err);
  }
  if (!config?.channelAccessToken) return;

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
    await maybeEmitBotReply(event, config, branchId);
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

  // Phase BS V3 (2026-05-04) — multi-channel support. Webhook can receive
  // events from any branch's LINE OA. Strategy:
  //   1. Parse body to read events[].destination — same destination across
  //      events in a single payload (LINE guarantees one channel per delivery).
  //   2. Resolve config via destination → be_line_configs OR legacy chat_config.
  //   3. Verify signature against THAT config's channelSecret.
  //   4. Pass legacy config as fallback for processEvent (per-event resolution
  //      runs again inside processEvent for defensive double-check).
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  const signature = req.headers['x-line-signature'];

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'invalid JSON' });
  }
  const events = body?.events || [];

  // Resolve which config to verify against. Prefer first event's destination.
  let verifyConfig = null;
  let fallbackConfig = null;
  try {
    const db = getAdminFirestore();
    const dest = events[0]?.destination;
    if (dest) {
      const resolved = await resolveLineConfigForWebhook(db, events[0]);
      if (resolved && resolved.config?.channelSecret) {
        verifyConfig = resolved.config;
      }
    }
  } catch (err) {
    console.warn('[line-webhook] resolve at top-of-handler failed:', err?.message || err);
  }
  // Always read legacy chat_config as a safety net (single-channel existing
  // deployments). When verifyConfig wasn't resolved via destination, use
  // legacy as the verifier.
  fallbackConfig = await getChatConfig();
  if (!verifyConfig) verifyConfig = fallbackConfig;

  if (!verifyConfig || !verifyConfig.enabled || !verifyConfig.channelSecret) {
    return res.status(200).json({ message: 'LINE chat not configured' });
  }

  // Verify signature against the resolved config.
  if (!signature || !verifySignature(rawBody, signature, verifyConfig.channelSecret)) {
    console.warn('[line-webhook] Invalid signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Process events in parallel. processEvent re-resolves per-event for
  // defensive correctness — same channel ⇒ same config, but cheap.
  await Promise.allSettled(events.map(e => processEvent(e, verifyConfig)));

  return res.status(200).json({ received: events.length });
}
