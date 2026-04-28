// ─── /api/admin/cleanup-test-sales — Phase 15.6 (Issue 5, 2026-04-28) ──────
//
// Background: User reported (verbatim) "ในหน้า tab=sales ก็ยังเหลือ
// TEST-SALE-DEFAULT-1777123845203 และ TEST-SALE-1777123823846 แถมกดปุ่มลบ
// แล้ว error เด้งจอดำอีก".
//
// V20 multi-branch isolation tests + Phase 15.5A actor-filter preview_eval
// wrote test sale docs prefixed TEST-SALE-DEFAULT-* / TEST-SALE-* without
// automated cleanup. Their malformed shape (no customerId, no real
// treatments) makes manual delete via the UI throw on the linked-treatments
// cascade. Phase A.2 patched the UI swallow; this endpoint nukes the test
// docs server-side.
//
// Operation:
//   POST {action:'list'} → returns DRY-RUN list of test sales (matching prefix regex)
//   POST {action:'delete', confirmSaleIds:[...]} → batch-deletes confirmed
//        subset; SKIPS the linked-treatments cascade (test sales have none)
//
// Run via curl from bash (no UI — per V29).

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { verifyAdminToken } from './_lib/adminAuth.js';

const APP_ID = 'loverclinic-opd-4c39b';

// V20 multi-branch tests created TEST-SALE-DEFAULT-* / TEST-SALE-* IDs.
// V33.12 (this phase) codifies the prefix discipline for sales going forward.
const TEST_SALE_ID_PATTERN = /^(TEST-SALE-|E2E-SALE-)/;

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

/** Pure helper: classify a saleId as test-prefix. Exported for tests. */
export function isTestSaleId(id) {
  return TEST_SALE_ID_PATTERN.test(String(id || ''));
}

/** Pure helper: list test sales from a be_sales snapshot. */
export function findTestSales(saleDocs) {
  const result = [];
  for (const d of saleDocs || []) {
    const id = String(d?.id ?? '');
    if (!id) continue;
    if (isTestSaleId(id)) {
      result.push({
        saleId: id,
        customerId: String(d?.customerId || ''),
        netTotal: Number(d?.billing?.netTotal ?? d?.netTotal ?? 0),
        createdAt: String(d?.createdAt || ''),
      });
    }
  }
  return result;
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
  const confirmSaleIds = Array.isArray(req.body?.confirmSaleIds) ? req.body.confirmSaleIds.map(String) : [];

  try {
    const db = getAdminFirestore();
    const data = dataPath(db);

    if (action === 'list') {
      const snap = await data.collection('be_sales').get();
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const candidates = findTestSales(docs);
      return res.status(200).json({
        success: true,
        data: {
          dryRun: true,
          candidates,
          total: candidates.length,
          totalSales: snap.size,
          callerEmail: caller.email,
        },
      });
    }

    if (action === 'delete') {
      if (confirmSaleIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'confirmSaleIds[] required for delete action',
        });
      }

      // Defensive: refuse to delete production-looking sale IDs.
      for (const sid of confirmSaleIds) {
        if (!isTestSaleId(sid)) {
          return res.status(400).json({
            success: false,
            error: `saleId "${sid}" does not match test-prefix pattern — refused`,
          });
        }
      }

      const deleted = [];
      let batchOp = db.batch();
      let inBatch = 0;
      for (const id of confirmSaleIds) {
        batchOp.delete(data.collection('be_sales').doc(id));
        deleted.push(id);
        inBatch += 1;
        if (inBatch >= 500) {
          await batchOp.commit();
          batchOp = db.batch();
          inBatch = 0;
        }
      }
      if (inBatch > 0) await batchOp.commit();

      const auditId = `cleanup-test-sales-${Date.now()}`;
      await data.collection('be_admin_audit').doc(auditId).set({
        type: 'cleanup-test-sales',
        deletedCount: deleted.length,
        deletedSaleIds: deleted,
        callerEmail: caller.email,
        callerUid: caller.uid,
        createdAt: new Date().toISOString(),
      });

      return res.status(200).json({
        success: true,
        data: {
          dryRun: false,
          deletedCount: deleted.length,
          deleted,
          auditId,
          callerEmail: caller.email,
        },
      });
    }

    return res.status(400).json({
      success: false,
      error: `unknown action: ${action}`,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'cleanup failed',
    });
  }
}
