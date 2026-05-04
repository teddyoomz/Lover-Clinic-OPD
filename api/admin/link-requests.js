// ─── /api/admin/link-requests — V32-tris-quater (2026-04-26) ──────────
// Admin-mediated approval queue for LINE link requests. Customer DM'd
// "ผูก <ID>" to LINE OA → webhook created a pending entry in
// be_link_requests (Option 2 — admin-mediated, no SMS/OTP cost).
// Admin reviews + approves/rejects via the LinkRequestsTab.
//
// Body:
//   { action: 'list', status?: 'pending'|'approved'|'rejected'|'expired' }
//   { action: 'approve', requestId: '<lr-...>' }
//   { action: 'reject', requestId: '<lr-...>', reason?: '<text>' }
//
// Approve flow:
//   1. Read request → must be 'pending'
//   2. Verify customer still exists in be_customers
//   3. Check no other customer already linked to this lineUserId
//   4. Write be_customers/{cid}.lineUserId + lineLinkedAt via admin SDK
//   5. Update request → status='approved', resolvedAt, resolvedBy
//   6. Push LINE message: "🎉 อนุมัติการผูกบัญชี" via LINE Push API
//
// Reject flow:
//   1. Read request → must be 'pending'
//   2. Update request → status='rejected', resolvedAt, resolvedBy, rejectReason
//   3. Push LINE message: "ไม่อนุมัติ" via LINE Push API
//
// Security: verifyAdminToken gate (admin: true claim or bootstrap UID).
// Rule lockdown: be_link_requests + be_link_attempts are
// `read,write: if false` for client SDK; admin SDK only (this endpoint).

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { verifyAdminToken } from './_lib/adminAuth.js';
import {
  formatLinkRequestApprovedReply,
  formatLinkRequestRejectedReply,
} from '../../src/lib/lineBotResponder.js';

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

async function getLineToken(db) {
  try {
    const snap = await db.doc(`artifacts/${APP_ID}/public/data/clinic_settings/chat_config`).get();
    if (!snap.exists) return null;
    return snap.data()?.line?.channelAccessToken || null;
  } catch {
    return null;
  }
}

async function pushLineMessage(token, lineUserId, text) {
  if (!token || !lineUserId || !text) return false;
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to: lineUserId, messages: [{ type: 'text', text }] }),
  });
  return res.ok;
}

async function handleList({ db, status, branchId, allBranches }) {
  let query = db.collection(`artifacts/${APP_ID}/public/data/be_link_requests`);
  if (status && ['pending', 'approved', 'rejected', 'expired'].includes(status)) {
    query = query.where('status', '==', status);
  }
  // Phase BS V2 — branch-scoped link request list. When branchId given AND
  // !allBranches, server-side where prunes to that branch's pending queue.
  // Legacy callers (no branchId) keep getting cross-branch behavior.
  if (branchId && !allBranches) {
    query = query.where('branchId', '==', String(branchId));
  }
  const snap = await query.get();
  let items = snap.docs.map(d => d.data() || {});
  // Phase BS V2 — also include legacy untagged requests in the default
  // branch's view (those created pre-Phase-BS without branchId field).
  // Without this, they'd be invisible to admins after the Phase BS deploy.
  // Skip when allBranches is requested (cross-branch view already gets all).
  if (branchId && !allBranches) {
    const legacySnap = await db.collection(`artifacts/${APP_ID}/public/data/be_link_requests`)
      .where('status', '==', status || 'pending').get();
    const tagged = new Set(items.map(i => String(i.requestId || '')));
    for (const d of legacySnap.docs) {
      const it = d.data() || {};
      const bid = typeof it.branchId === 'string' ? it.branchId.trim() : '';
      if (!bid && !tagged.has(String(it.requestId || ''))) {
        items.push(it);
      }
    }
  }
  // Sort: pending first, then by requestedAt desc
  items.sort((a, b) => {
    const aPending = a.status === 'pending' ? 0 : 1;
    const bPending = b.status === 'pending' ? 0 : 1;
    if (aPending !== bPending) return aPending - bPending;
    return String(b.requestedAt || '').localeCompare(String(a.requestedAt || ''));
  });
  return { items };
}

async function handleApprove({ db, requestId, callerUid }) {
  const reqRef = db.doc(`artifacts/${APP_ID}/public/data/be_link_requests/${requestId}`);
  const reqSnap = await reqRef.get();
  if (!reqSnap.exists) throw new Error('คำขอไม่พบในระบบ');
  const req = reqSnap.data() || {};
  if (req.status !== 'pending') throw new Error(`คำขออยู่ในสถานะ ${req.status} แล้ว`);

  const customerId = String(req.customerId || '');
  const lineUserId = String(req.lineUserId || '');
  if (!customerId || !lineUserId) throw new Error('คำขอข้อมูลไม่ครบ');

  // Re-check customer + collision
  const cRef = db.doc(`artifacts/${APP_ID}/public/data/be_customers/${customerId}`);
  const cSnap = await cRef.get();
  if (!cSnap.exists) throw new Error('ลูกค้าถูกลบจากระบบ');

  const collisionSnap = await db
    .collection(`artifacts/${APP_ID}/public/data/be_customers`)
    .where('lineUserId', '==', lineUserId)
    .limit(2)
    .get();
  const otherDoc = collisionSnap.docs.find(d => d.id !== customerId);
  if (otherDoc) throw new Error('LINE บัญชีนี้ถูกผูกกับลูกค้าอื่นแล้ว');

  const now = new Date().toISOString();
  // Atomic: update customer + request together via batch
  const batch = db.batch();
  batch.update(cRef, { lineUserId, lineLinkedAt: now });
  batch.update(reqRef, {
    status: 'approved',
    resolvedAt: now,
    resolvedBy: callerUid,
    resolveAction: 'approved',
  });
  await batch.commit();

  // Push LINE notification (non-fatal)
  const token = await getLineToken(db);
  const customerName = cSnap.data()?.customerName || cSnap.data()?.name || '';
  pushLineMessage(token, lineUserId, formatLinkRequestApprovedReply(customerName)).catch(() => {});

  return { requestId, status: 'approved' };
}

async function handleReject({ db, requestId, reason, callerUid }) {
  const reqRef = db.doc(`artifacts/${APP_ID}/public/data/be_link_requests/${requestId}`);
  const reqSnap = await reqRef.get();
  if (!reqSnap.exists) throw new Error('คำขอไม่พบในระบบ');
  const req = reqSnap.data() || {};
  if (req.status !== 'pending') throw new Error(`คำขออยู่ในสถานะ ${req.status} แล้ว`);

  const lineUserId = String(req.lineUserId || '');
  const now = new Date().toISOString();
  await reqRef.update({
    status: 'rejected',
    resolvedAt: now,
    resolvedBy: callerUid,
    resolveAction: 'rejected',
    rejectReason: String(reason || '').slice(0, 200),
  });

  // Push LINE notification (non-fatal)
  const token = await getLineToken(db);
  pushLineMessage(token, lineUserId, formatLinkRequestRejectedReply()).catch(() => {});

  return { requestId, status: 'rejected' };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const caller = await verifyAdminToken(req, res);
  if (!caller) return; // 401/403 written

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const { action, requestId, status, reason, branchId, allBranches } = body;
  const db = getAdminFirestore();

  try {
    if (action === 'list') {
      // Phase BS V2 — branchId opt threaded through to handleList.
      const result = await handleList({ db, status, branchId, allBranches });
      return res.status(200).json(result);
    }
    if (action === 'approve') {
      if (!requestId) return res.status(400).json({ error: 'requestId required' });
      const result = await handleApprove({ db, requestId, callerUid: caller.uid });
      return res.status(200).json(result);
    }
    if (action === 'reject') {
      if (!requestId) return res.status(400).json({ error: 'requestId required' });
      const result = await handleReject({ db, requestId, reason, callerUid: caller.uid });
      return res.status(200).json(result);
    }
    return res.status(400).json({ error: 'action must be list | approve | reject' });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'request failed' });
  }
}
