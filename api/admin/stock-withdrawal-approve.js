// ─── /api/admin/stock-withdrawal-approve — Phase 15.5B (2026-04-28) ────────
// Admin-mediated approval queue for stock withdrawals. After warehouse staff
// requests a withdrawal (status=0 PENDING_APPROVAL), an admin reviews + either
// approves (records audit + approval metadata; status STAYS at 0 so dispatch
// flow remains the warehouse's hands-on action) or rejects (status 0→3
// CANCELLED with audit + reason).
//
// Why soft approval (no auto-dispatch)?
// 1. APPROVAL is a managerial decision; DISPATCH is a warehouse physical
//    action. Same person can do both, but separating them mirrors real
//    clinic SOP + lets the export happen via existing UI button.
// 2. Auto-flipping 0→1 from this endpoint would skip _exportFromSource,
//    leaving status=SENT but stock still in source = corruption.
// 3. Reject flips 0→3 directly (no stock work needed).
//
// Body:
//   { action: 'approve', withdrawalId: 'WDR-...', note?: '<text>' }
//   { action: 'reject', withdrawalId: 'WDR-...', reason?: '<text>' }
//
// Approve flow:
//   1. verifyAdminToken (V31 + audit-firebase-admin-security FA1-FA12)
//   2. Read withdrawal → must exist + status=0
//   3. Idempotent: if `approvedAt` already set, return alreadyApproved=true
//   4. Atomic batch:
//      a. Update withdrawal: approvedByUser + approvedAt + approvalNote
//      b. Emit be_stock_movements type=15 (WITHDRAWAL_APPROVE qty=0 audit-only)
//   5. Status STAYS at 0 — warehouse still has to click "ส่งสินค้า" to dispatch
//
// Reject flow:
//   1. verifyAdminToken
//   2. Read withdrawal → must exist + status=0
//   3. Idempotent: if status !== 0, return error (can't reject already-cancelled)
//   4. Atomic batch:
//      a. Update withdrawal: rejectedByUser + rejectedAt + rejectionReason + status=3 (CANCELLED)
//      b. Emit be_stock_movements type=16 (WITHDRAWAL_REJECT qty=0 audit-only)
//
// Iron-clad mapping:
//   E    no brokerClient (admin SDK is the sanctioned exception per Rule E,
//        existing /api/admin/* pattern from Phase 12.0)
//   FA1-12 audit-firebase-admin-security: verifyAdminToken + admin gate +
//        input validation + CORS + method gate + no credential leak
//   V14  every set/update field guards against undefined leaves
//   V19  type=15/16 audit-only movements ride existing rule (qty=0,
//        hasOnly(['reversedByMovementId'])) — no rules change needed
//   V31  no silent-swallow: errors surface; admin gate non-bypassable

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { verifyAdminToken } from './_lib/adminAuth.js';

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

// V14 lock: never write undefined fields. Mirror of _normalizeAuditUser
// from src/lib/backendClient.js but inline here for the admin endpoint.
function normalizeAuditUser(user) {
  return {
    userId: String(user?.userId || user?.uid || ''),
    userName: String(user?.userName || user?.displayName || user?.email?.split('@')?.[0] || ''),
  };
}

function genMovementId() {
  return `MVT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

async function handleApprove({ db, withdrawalId, note, callerUid, callerName }) {
  const withdrawalRef = db.doc(`artifacts/${APP_ID}/public/data/be_stock_withdrawals/${withdrawalId}`);
  const snap = await withdrawalRef.get();
  if (!snap.exists) throw new Error(`Withdrawal ${withdrawalId} not found`);
  const data = snap.data() || {};
  if (Number(data.status) !== 0) {
    throw new Error(`Cannot approve withdrawal in status=${data.status} (must be 0 PENDING_APPROVAL)`);
  }
  // Idempotent: already-approved returns success (no-op)
  if (data.approvedAt && data.approvedByUser?.userId === callerUid) {
    return { withdrawalId, status: 0, alreadyApproved: true };
  }

  const now = new Date().toISOString();
  const user = normalizeAuditUser({ userId: callerUid, userName: callerName });
  const movementId = genMovementId();
  const approvalNote = String(note || '').slice(0, 500); // bound to 500 chars

  // Atomic batch: withdrawal metadata + audit movement
  const batch = db.batch();
  batch.update(withdrawalRef, {
    approvedByUser: user,
    approvedAt: now,
    approvalNote,
    updatedAt: now,
  });
  // type=15 WITHDRAWAL_APPROVE: audit-only qty=0 movement.
  // V19 rule: be_stock_movements `update: hasOnly(['reversedByMovementId'])` —
  // no update needed here, just create.
  const movementRef = db.doc(`artifacts/${APP_ID}/public/data/be_stock_movements/${movementId}`);
  batch.set(movementRef, {
    movementId,
    type: 15,
    qty: 0,
    before: 0,
    after: 0,
    branchId: String(data.sourceLocationId || ''),
    branchIds: [data.sourceLocationId, data.destinationLocationId].filter(Boolean).map(String),
    productId: '',
    productName: '',
    batchId: '',
    sourceDocPath: `artifacts/${APP_ID}/public/data/be_stock_withdrawals/${withdrawalId}`,
    linkedWithdrawalId: withdrawalId,
    revenueImpact: 0,
    costBasis: 0,
    isPremium: false,
    skipped: true, // qty=0 audit-only — does NOT contribute to conservation
    user,
    note: `WITHDRAWAL_APPROVE: ${approvalNote || '(no note)'}`,
    createdAt: now,
  });
  await batch.commit();

  return { withdrawalId, status: 0, approvedAt: now, movementId };
}

async function handleReject({ db, withdrawalId, reason, callerUid, callerName }) {
  const withdrawalRef = db.doc(`artifacts/${APP_ID}/public/data/be_stock_withdrawals/${withdrawalId}`);
  const snap = await withdrawalRef.get();
  if (!snap.exists) throw new Error(`Withdrawal ${withdrawalId} not found`);
  const data = snap.data() || {};
  if (Number(data.status) !== 0) {
    throw new Error(`Cannot reject withdrawal in status=${data.status} (must be 0 PENDING_APPROVAL)`);
  }
  // Idempotent: already cancelled? Should be caught by status check above
  // since reject flips 0→3.

  const now = new Date().toISOString();
  const user = normalizeAuditUser({ userId: callerUid, userName: callerName });
  const movementId = genMovementId();
  const rejectionReason = String(reason || '').slice(0, 500); // bound

  const batch = db.batch();
  batch.update(withdrawalRef, {
    rejectedByUser: user,
    rejectedAt: now,
    rejectionReason,
    status: 3, // CANCELLED
    updatedAt: now,
  });
  const movementRef = db.doc(`artifacts/${APP_ID}/public/data/be_stock_movements/${movementId}`);
  batch.set(movementRef, {
    movementId,
    type: 16,
    qty: 0,
    before: 0,
    after: 0,
    branchId: String(data.sourceLocationId || ''),
    branchIds: [data.sourceLocationId, data.destinationLocationId].filter(Boolean).map(String),
    productId: '',
    productName: '',
    batchId: '',
    sourceDocPath: `artifacts/${APP_ID}/public/data/be_stock_withdrawals/${withdrawalId}`,
    linkedWithdrawalId: withdrawalId,
    revenueImpact: 0,
    costBasis: 0,
    isPremium: false,
    skipped: true,
    user,
    note: `WITHDRAWAL_REJECT: ${rejectionReason || '(no reason)'}`,
    createdAt: now,
  });
  await batch.commit();

  return { withdrawalId, status: 3, rejectedAt: now, movementId };
}

export default async function handler(req, res) {
  // CORS / method gates (FA per audit-firebase-admin-security)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // Admin gate (FA1-FA5)
  const caller = await verifyAdminToken(req, res);
  if (!caller) return; // 401/403 already written

  // Input validation (FA6)
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const { action, withdrawalId, note, reason } = body;
  if (!withdrawalId || typeof withdrawalId !== 'string') {
    return res.status(400).json({ error: 'withdrawalId (string) required' });
  }
  if (action !== 'approve' && action !== 'reject') {
    return res.status(400).json({ error: 'action must be approve | reject' });
  }
  // Defensive size cap (V14-class — bound writes)
  if (note && typeof note !== 'string') {
    return res.status(400).json({ error: 'note must be a string' });
  }
  if (reason && typeof reason !== 'string') {
    return res.status(400).json({ error: 'reason must be a string' });
  }

  const db = getAdminFirestore();
  const callerUid = caller.uid;
  const callerName = caller.email?.split('@')[0] || caller.name || 'admin';

  try {
    if (action === 'approve') {
      const result = await handleApprove({ db, withdrawalId, note, callerUid, callerName });
      return res.status(200).json(result);
    }
    if (action === 'reject') {
      const result = await handleReject({ db, withdrawalId, reason, callerUid, callerName });
      return res.status(200).json(result);
    }
    // unreachable — action validated above
    return res.status(400).json({ error: 'unknown action' });
  } catch (err) {
    // V31: don't silent-swallow — surface error
    return res.status(500).json({ error: err.message || 'request failed' });
  }
}
