// ─── /api/admin/line-friends — LINE Friend Picker (2026-07-20) ──────────────
// Two actions (POST, verifyAdminToken gate — byte-for-byte parity with
// /api/admin/link-requests):
//
//   { action: 'list', branchId }
//     Followers-API BACKFILL (verified/premium OA only): fetch follower ids
//     (paginated, cap 5×1000), diff against ids already known (be_line_friends
//     docs + line_ chat_conversations for the branch), profile-resolve ONLY the
//     unknown ids (bounded-parallel 10, cap 300/call) and write them into
//     be_line_friends (source: 'followers-api'). The client picker renders from
//     its real-time listeners ONLY — this endpoint feeds that single data path.
//     403 from LINE (unverified OA) → { followersApi: 'unavailable' } — NOT an
//     error. Module-cache 60s per branch protects LINE rate limits.
//
//   { action: 'bind', customerId, lineUserId, branchId, displayName? }
//     Admin picked a person in the picker → link to a customer. Mirrors
//     link-requests handleApprove exactly: collision check (userId already on
//     ANOTHER customer → Thai error, zero writes) → atomic batch(customer
//     update incl. lineUserId_byBranch dotted-path + be_admin_audit doc) →
//     best-effort LINE push to the customer.
//
// Rule lockdown: be_line_friends is `read: isClinicStaff / write: false` for
// the client SDK — this endpoint + the webhook follow handler are the ONLY
// writers (admin SDK bypasses rules). Rule B probe #20.

import crypto from 'crypto';
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { verifyAdminToken } from './_lib/adminAuth.js';
import { resolveLineConfigForAdmin } from './_lib/lineConfigAdmin.js';
import { apiFetch } from '../_lib/apiFetch.js';
import { formatLinkRequestApprovedReply } from '../../src/lib/lineBotResponder.js';
import { mapWithConcurrency } from '../../src/lib/wholeSystemBackupCore.js';

const APP_ID = process.env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b';

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

async function pushLineMessage(token, lineUserId, text) {
  if (!token || !lineUserId || !text) return false;
  const res = await apiFetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to: lineUserId, messages: [{ type: 'text', text }] }),
  });
  return res.ok;
}

async function getLineProfile(userId, accessToken) {
  try {
    const res = await apiFetch(`https://api.line.me/v2/bot/profile/${userId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return { displayName: userId, pictureUrl: '' };
    return await res.json();
  } catch {
    return { displayName: userId, pictureUrl: '' };
  }
}

// Followers-API pagination — verified/premium OA only. 403 (or any !ok) →
// { available: false } which the caller reports as followersApi:'unavailable'.
const FOLLOWER_PAGE_CAP = 5; // 5 × 1000 ids
async function fetchFollowerIds(token) {
  const ids = [];
  let next = '';
  for (let page = 0; page < FOLLOWER_PAGE_CAP; page++) {
    const url = `https://api.line.me/v2/bot/followers/ids?limit=1000${next ? `&start=${encodeURIComponent(next)}` : ''}`;
    let res;
    try {
      res = await apiFetch(url, { headers: { Authorization: `Bearer ${token}` } });
    } catch {
      return { available: false, ids: [] };
    }
    if (!res.ok) return { available: false, ids: [] };
    const body = await res.json().catch(() => ({}));
    ids.push(...(Array.isArray(body.userIds) ? body.userIds : []));
    if (!body.next) break;
    next = body.next;
  }
  return { available: true, ids };
}

// Module cache — serverless instances amortize repeated modal opens; also the
// LINE-rate-limit guard (pattern: /api/tfp-options 30s module cache).
const LIST_CACHE_MS = 60_000;
const RESOLVE_CAP = 300;
const _listCache = new Map(); // branchId → { at, result }

async function handleListBackfill({ db, branchId }) {
  const cached = _listCache.get(branchId);
  if (cached && Date.now() - cached.at < LIST_CACHE_MS) {
    return { ...cached.result, cached: true };
  }
  const finish = (result) => {
    _listCache.set(branchId, { at: Date.now(), result });
    return result;
  };

  const resolved = await resolveLineConfigForAdmin(db, { branchId });
  const token = resolved?.config?.channelAccessToken || null;
  if (!token) return finish({ followersApi: 'unavailable', totalFollowers: 0, backfilled: 0, reason: 'no-token' });

  const { available, ids } = await fetchFollowerIds(token);
  if (!available) return finish({ followersApi: 'unavailable', totalFollowers: 0, backfilled: 0 });

  // Known ids = existing be_line_friends docs + line_ chat conversations
  const known = new Set();
  const friendsSnap = await db
    .collection(`artifacts/${APP_ID}/public/data/be_line_friends`)
    .where('branchId', '==', String(branchId)).get();
  for (const d of friendsSnap.docs) {
    const uid = d.data()?.lineUserId;
    if (uid) known.add(String(uid));
  }
  const convSnap = await db
    .collection(`artifacts/${APP_ID}/public/data/chat_conversations`)
    .where('branchId', '==', String(branchId)).get();
  for (const d of convSnap.docs) {
    if (String(d.id).startsWith('line_')) known.add(String(d.id).slice('line_'.length));
  }

  const unknown = ids.filter(id => !known.has(String(id)));
  const toResolve = unknown.slice(0, RESOLVE_CAP);
  const nowIso = new Date().toISOString();
  let backfilled = 0;
  await mapWithConcurrency(toResolve, 10, async (uid) => {
    const profile = await getLineProfile(uid, token);
    await db.doc(`artifacts/${APP_ID}/public/data/be_line_friends/${branchId}_${uid}`).set({
      lineUserId: String(uid),
      displayName: String(profile?.displayName || uid),
      pictureUrl: String(profile?.pictureUrl || ''),
      branchId: String(branchId),
      branchIdSource: 'followers-api-backfill',
      source: 'followers-api',
      followedAt: null, // real follow date unknown for backfilled followers
      unfollowedAt: null,
      updatedAt: nowIso,
    }, { merge: true });
    backfilled++;
  });

  return finish({
    followersApi: 'ok',
    totalFollowers: ids.length,
    unknown: unknown.length,
    backfilled,
    skipped: Math.max(0, unknown.length - toResolve.length),
  });
}

async function handleBind({ db, customerId, lineUserId, branchId, displayName, callerUid }) {
  const cid = String(customerId || '').trim();
  const uid = String(lineUserId || '').trim();
  const bid = String(branchId || '').trim();
  const lineDisplayName = String(displayName || '');
  if (!cid || !uid) throw new Error('ข้อมูลไม่ครบ (customerId + lineUserId)');

  const cRef = db.doc(`artifacts/${APP_ID}/public/data/be_customers/${cid}`);
  const cSnap = await cRef.get();
  if (!cSnap.exists) throw new Error('ลูกค้าถูกลบจากระบบ');

  // Collision guard — mirror link-requests handleApprove (zero writes on hit)
  const collisionSnap = await db
    .collection(`artifacts/${APP_ID}/public/data/be_customers`)
    .where('lineUserId', '==', uid)
    .limit(2)
    .get();
  const otherDoc = collisionSnap.docs.find(d => d.id !== cid);
  if (otherDoc) throw new Error('LINE บัญชีนี้ถูกผูกกับลูกค้าอื่นแล้ว');

  const now = new Date().toISOString();
  const batch = db.batch();
  const customerUpdate = {
    // Legacy fields (backward-compat — cron Step 4 fallback):
    lineUserId: uid,
    lineLinkedAt: now,
  };
  if (lineDisplayName) customerUpdate.lineDisplayName = lineDisplayName;
  // Per-branch linkage — dotted-path nested-map update (same shape as
  // link-requests handleApprove; only when a branchId is known).
  if (bid) {
    customerUpdate[`lineUserId_byBranch.${bid}`] = {
      lineUserId: uid,
      lineDisplayName,
      linkedAt: now,
      _lineStale: false,
      _lineStaleAt: null,
    };
  }
  batch.update(cRef, customerUpdate);

  // Audit doc — picker binds have no be_link_requests row, so the audit ledger
  // carries the forensic trail instead (Rule M style crypto-random id).
  const auditId = `line-friend-bind-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  batch.set(db.doc(`artifacts/${APP_ID}/public/data/be_admin_audit/${auditId}`), {
    action: 'line-friend-bind',
    customerId: cid,
    lineUserId: uid,
    branchId: bid,
    lineDisplayName,
    source: 'friend-picker',
    performedBy: String(callerUid || ''),
    performedAt: now,
  });
  await batch.commit();

  // Best-effort LINE push (never fails the bind)
  try {
    const bindBranchId = bid || cSnap.data()?.branchId || null;
    const resolved = await resolveLineConfigForAdmin(db, { branchId: bindBranchId });
    const token = resolved?.config?.channelAccessToken || null;
    const customerName = cSnap.data()?.customerName || cSnap.data()?.name || '';
    await pushLineMessage(token, uid, formatLinkRequestApprovedReply(customerName));
  } catch { /* best-effort */ }

  return { customerId: cid, lineUserId: uid, branchId: bid, status: 'bound' };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const caller = await verifyAdminToken(req, res);
  if (!caller) return; // verifyAdminToken already wrote 401/403

  const { action } = req.body || {};
  try {
    const db = getAdminFirestore();
    if (action === 'list') {
      const branchId = String(req.body?.branchId || '').trim();
      if (!branchId) throw new Error('ต้องระบุ branchId');
      const result = await handleListBackfill({ db, branchId });
      return res.status(200).json(result);
    }
    if (action === 'bind') {
      const result = await handleBind({
        db,
        customerId: req.body?.customerId,
        lineUserId: req.body?.lineUserId,
        branchId: req.body?.branchId,
        displayName: req.body?.displayName,
        callerUid: caller.uid,
      });
      return res.status(200).json(result);
    }
    return res.status(400).json({ error: `unknown action: ${String(action || '')}` });
  } catch (err) {
    return res.status(400).json({ error: err?.message || String(err) });
  }
}
