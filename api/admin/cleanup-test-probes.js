// ─── /api/admin/cleanup-test-probes — One-shot cleanup (V27) ──────────────
//
// Background (V27, 2026-04-26): Rule B Probe-Deploy-Probe protocol creates
// `opd_sessions/test-probe-anon-{TS}` docs to test the V23 anon-update
// path. The probe pattern uses `allow create: if true` (anon allowed) BUT
// `allow delete: if isClinicStaff()` blocks anon cleanup. After 5 deploys
// (V23 + 13.5.4 D1 + V25 + V25-bis + V26) we accumulated ~10 visible
// probe docs as "ไม่ระบุชื่อ" entries with INTAKE tag in the patient queue.
//
// User report (verbatim): "มึงมาเทสสร้างเหี้ยไรหน้านี้แล้วทำไมไม่ลบ
// ากปรกเกะกะ เลอะเทะ" (translation: you came in and created shit on
// this page and didn't delete it, messy and dirty).
//
// This endpoint is the ADMIN-side cleanup. Combined with refactored probe
// pattern (CREATE with `isArchived: true + status: 'completed'`) so future
// probes never appear in the queue.
//
// Security:
//   - Standard verifyAdminToken gate (admin: true claim required)
//   - Only deletes docs with prefix `test-probe-anon-` in opd_sessions
//   - Returns count + IDs deleted for audit

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { verifyAdminToken } from './_lib/adminAuth.js';

const APP_ID = 'loverclinic-opd-4c39b';
const PROBE_PREFIX = 'test-probe-anon-';

let cachedDb = null;
function getAdminFirestore() {
  if (cachedDb) return cachedDb;
  // Reuse the app initialized by adminAuth.js (or initialize fresh)
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
  if (!caller) return;  // verifyAdminToken already wrote the 401/403 response

  try {
    const db = getAdminFirestore();
    const collRef = db
      .collection('artifacts')
      .doc(APP_ID)
      .collection('public')
      .doc('data')
      .collection('opd_sessions');

    // Firestore Admin SDK supports startAt/endAt prefix filtering via the
    // documentId() field. Using > prefix and < prefix + '' is the
    // canonical way to "starts-with" filter on doc IDs.
    const snap = await collRef
      .where('__name__', '>=', collRef.doc(PROBE_PREFIX).path)
      .where('__name__', '<', collRef.doc(PROBE_PREFIX + '').path)
      .get();

    const deleted = [];
    // Batched delete (batches of 500 — Firestore limit). Realistically
    // we'll never hit this in test cleanup, but defensive.
    let batch = db.batch();
    let inBatch = 0;
    for (const doc of snap.docs) {
      batch.delete(doc.ref);
      deleted.push(doc.id);
      inBatch += 1;
      if (inBatch >= 500) {
        await batch.commit();
        batch = db.batch();
        inBatch = 0;
      }
    }
    if (inBatch > 0) await batch.commit();

    return res.status(200).json({
      success: true,
      data: {
        deletedCount: deleted.length,
        deleted,
        callerEmail: caller.email,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'cleanup failed',
    });
  }
}
