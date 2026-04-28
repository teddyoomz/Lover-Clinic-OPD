// ─── /api/admin/cleanup-phantom-branch — Phase 15.7-novies (2026-04-29) ────
//
// Background: User reported (verbatim) "เราไม่มีสาขา BR-1777095572005-
// ae97f911 อยู่แล้ว มันมาจากไหน ลบทิ้งไปเลยได้ไหม ถ้าไม่มีประโยชน์กับเรา
// กันการสับสนเรื่องข้อมูล เพราะตอนนี้เรามีแค่สาขาเดียวกับคลังกลาง ยังไม่ได้
// สร้าง database ใดๆกับสาขาใหม่".
//
// Why an admin endpoint (not client SDK):
//   firestore.rules has `allow delete: if false` on be_stock_batches /
//   be_stock_movements / be_stock_orders / be_stock_transfers — the V19 +
//   S3 audit-immutability invariant. Client SDK CAN'T delete those even
//   with admin auth. firebase-admin SDK bypasses rules entirely (server
//   privilege) which is the correct way to perform one-shot ops cleanup.
//
// Operation:
//   POST {action:'list', phantomId:'BR-...'}             → DRY-RUN counts
//   POST {action:'delete', phantomId:'BR-...', confirm:true} → actual purge
//
// Defensive `phantomId` regex (PHANTOM_ID_PATTERN) refuses production-
// shaped IDs ('main', '', null, etc.) — only accepts `BR-<digits>-<hex>`
// shape (V20 multi-branch auto-create format).
//
// Run via curl from bash (no UI — per V29 directive). See
// docs/superpowers/specs/2026-04-29-br-phantom-cleanup-design.md for the
// design + discovery results.
//
// Security:
//   - verifyAdminToken (admin: true claim required)
//   - Two-phase: list first, then delete only with `confirm:true`
//   - phantomId regex gate (refuses shapes not matching V20 auto-create)
//   - Audit doc written for every delete action (be_admin_audit)
//
// Spec: docs/superpowers/specs/2026-04-29-br-phantom-cleanup-design.md

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { verifyAdminToken } from './_lib/adminAuth.js';

const APP_ID = 'loverclinic-opd-4c39b';

// V20 multi-branch auto-creates branch IDs in the shape
// `BR-<13-digit-timestamp>-<8-hex-chars>` (e.g. BR-1777095572005-ae97f911).
// Defensive: only this shape is eligible for purge — refuse 'main',
// empty, arbitrary strings.
const PHANTOM_ID_PATTERN = /^BR-\d{10,}-[a-f0-9]{6,}$/;

/** Pure helper — exported for tests. */
export function isValidPhantomId(id) {
  return typeof id === 'string' && PHANTOM_ID_PATTERN.test(id);
}

let cachedDb = null;
function getAdminFirestore() {
  if (cachedDb) return cachedDb;
  let app;
  if (getApps().length > 0) {
    app = getApp();
  } else {
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
    if (!clientEmail || !rawKey) {
      throw new Error('firebase-admin not configured');
    }
    app = initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
        clientEmail,
        privateKey: rawKey.replace(/\\n/g, '\n'),
      }),
    });
  }
  cachedDb = getFirestore(app);
  return cachedDb;
}

function dataPath(db) {
  return db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
}

/**
 * Pure helper: classify which docs in a fetched snapshot reference the
 * phantom branch. Exported for unit testing without touching Firestore.
 *
 * @param {string} phantomId
 * @param {Object} snaps  raw doc arrays (id + fields)
 * @param {Array} snaps.batches      be_stock_batches docs
 * @param {Array} snaps.movements    be_stock_movements docs
 * @param {Array} snaps.orders       be_stock_orders docs
 * @param {Array} snaps.transfers    be_stock_transfers docs
 * @param {Array} snaps.appointments be_appointments docs
 * @param {Array} snaps.staff        be_staff docs
 * @param {Array} snaps.doctors      be_doctors docs
 * @returns {Object} per-collection arrays of matching IDs/refs
 */
export function findPhantomReferences(phantomId, snaps) {
  const id = String(phantomId || '');
  const s = snaps || {};

  const matchBranchId = arr =>
    (arr || []).filter(d => String(d?.branchId || '') === id);

  const batches = matchBranchId(s.batches).map(d => String(d.id));
  const movements = matchBranchId(s.movements).map(d => String(d.id));
  const orders = matchBranchId(s.orders).map(d => String(d.id));
  const appointments = matchBranchId(s.appointments).map(d => String(d.id));

  const transfersSource = (s.transfers || [])
    .filter(d => String(d?.sourceLocationId || '') === id)
    .map(d => String(d.id));
  const transfersDest = (s.transfers || [])
    .filter(d => String(d?.destinationLocationId || '') === id)
    .map(d => String(d.id));

  const staffWithPhantom = (s.staff || [])
    .filter(d => Array.isArray(d?.branchIds) && d.branchIds.includes(id))
    .map(d => String(d.id));
  const doctorsWithPhantom = (s.doctors || [])
    .filter(d => Array.isArray(d?.branchIds) && d.branchIds.includes(id))
    .map(d => String(d.id));

  return {
    batches,
    movements,
    orders,
    transfersSource,
    transfersDest,
    appointments,
    staffWithPhantom,
    doctorsWithPhantom,
  };
}

async function loadAllSnapshots(data) {
  const [
    batchSnap,
    movementSnap,
    orderSnap,
    transferSnap,
    apptSnap,
    staffSnap,
    doctorSnap,
    branchSnap,
  ] = await Promise.all([
    data.collection('be_stock_batches').get(),
    data.collection('be_stock_movements').get(),
    data.collection('be_stock_orders').get(),
    data.collection('be_stock_transfers').get(),
    data.collection('be_appointments').get(),
    data.collection('be_staff').get(),
    data.collection('be_doctors').get(),
    data.collection('be_branches').get(),
  ]);

  const toArr = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }));

  return {
    batches: toArr(batchSnap),
    movements: toArr(movementSnap),
    orders: toArr(orderSnap),
    transfers: toArr(transferSnap),
    appointments: toArr(apptSnap),
    staff: toArr(staffSnap),
    doctors: toArr(doctorSnap),
    branches: toArr(branchSnap),
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'method not allowed' });
    return;
  }

  const caller = await verifyAdminToken(req, res);
  if (!caller) return;

  const action = String(req.body?.action || 'list');
  const phantomId = String(req.body?.phantomId || '');
  const confirm = req.body?.confirm === true;

  // Defensive: phantomId must match V20 auto-create shape. Refuses 'main',
  // empty, arbitrary strings, anything that could nuke production data.
  if (!isValidPhantomId(phantomId)) {
    return res.status(400).json({
      success: false,
      error: `phantomId "${phantomId}" does not match V20 auto-create pattern (BR-<digits>-<hex>) — refused`,
    });
  }

  try {
    const db = getAdminFirestore();
    const data = dataPath(db);

    const snaps = await loadAllSnapshots(data);
    const refs = findPhantomReferences(phantomId, snaps);
    const branchDocExists = snaps.branches.some(b => b.id === phantomId);

    const summary = {
      batches: refs.batches.length,
      movements: refs.movements.length,
      orders: refs.orders.length,
      transfersSource: refs.transfersSource.length,
      transfersDest: refs.transfersDest.length,
      appointments: refs.appointments.length,
      staffWithPhantomInBranchIds: refs.staffWithPhantom.length,
      doctorsWithPhantomInBranchIds: refs.doctorsWithPhantom.length,
      branchDocExists,
    };

    if (action === 'list') {
      return res.status(200).json({
        success: true,
        data: {
          dryRun: true,
          phantomId,
          summary,
          refs, // includes the actual IDs for traceability
          callerEmail: caller.email,
        },
      });
    }

    if (action === 'delete') {
      if (!confirm) {
        return res.status(400).json({
          success: false,
          error: 'confirm:true required for delete action — run action:list first',
        });
      }

      // Chunked batch commits (Firestore caps at 500 ops per batch).
      // For our 49+2+1=52 ops one batch suffices but loop for safety
      // when phantom ref counts grow (other clinics, future runs).
      const allOps = [
        // DELETE in dependency order
        ...refs.movements.map(id => ({
          kind: 'delete',
          ref: data.collection('be_stock_movements').doc(id),
        })),
        ...refs.batches.map(id => ({
          kind: 'delete',
          ref: data.collection('be_stock_batches').doc(id),
        })),
        ...refs.orders.map(id => ({
          kind: 'delete',
          ref: data.collection('be_stock_orders').doc(id),
        })),
        ...refs.transfersSource.map(id => ({
          kind: 'delete',
          ref: data.collection('be_stock_transfers').doc(id),
        })),
        // transfersDest may overlap with transfersSource if same doc has
        // both; dedup via Set on the doc ref path (not strictly necessary
        // — Firestore tolerates double-delete of same doc in a batch
        // gracefully — but it keeps the audit count clean).
        ...refs.transfersDest
          .filter(id => !refs.transfersSource.includes(id))
          .map(id => ({
            kind: 'delete',
            ref: data.collection('be_stock_transfers').doc(id),
          })),
        ...refs.appointments.map(id => ({
          kind: 'delete',
          ref: data.collection('be_appointments').doc(id),
        })),
        // UPDATE staff + doctors (arrayRemove)
        ...refs.staffWithPhantom.map(id => ({
          kind: 'update',
          ref: data.collection('be_staff').doc(id),
          payload: { branchIds: FieldValue.arrayRemove(phantomId) },
        })),
        ...refs.doctorsWithPhantom.map(id => ({
          kind: 'update',
          ref: data.collection('be_doctors').doc(id),
          payload: { branchIds: FieldValue.arrayRemove(phantomId) },
        })),
      ];

      // DELETE the be_branches doc itself LAST (after all references gone).
      if (branchDocExists) {
        allOps.push({
          kind: 'delete',
          ref: data.collection('be_branches').doc(phantomId),
        });
      }

      let batchOp = db.batch();
      let inBatch = 0;
      for (const op of allOps) {
        if (op.kind === 'delete') batchOp.delete(op.ref);
        else if (op.kind === 'update') batchOp.update(op.ref, op.payload);
        inBatch += 1;
        if (inBatch >= 500) {
          await batchOp.commit();
          batchOp = db.batch();
          inBatch = 0;
        }
      }
      if (inBatch > 0) await batchOp.commit();

      const auditId = `cleanup-phantom-branch-${Date.now()}`;
      await data.collection('be_admin_audit').doc(auditId).set({
        type: 'cleanup-phantom-branch',
        phantomId,
        summary,
        refs,
        callerEmail: caller.email,
        callerUid: caller.uid,
        createdAt: new Date().toISOString(),
      });

      return res.status(200).json({
        success: true,
        data: {
          dryRun: false,
          phantomId,
          summary,
          opsCount: allOps.length,
          auditId,
          callerEmail: caller.email,
        },
      });
    }

    return res.status(400).json({
      success: false,
      error: `unknown action: ${action} (expected 'list' or 'delete')`,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'cleanup failed',
    });
  }
}
