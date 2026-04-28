// ─── /api/admin/cleanup-orphan-stock — Phase 15.6 (Issue 3, 2026-04-28) ────
//
// Background: User reported (verbatim) "ตามภาพ Acetin 6 คืออะไร Aloe gel 010
// คืออะไร ในข้อมูลหน้า tab=products ไม่มีสินค้านี้ด้วยซ้ำ make sure ว่าจะ
// ไม่มีสินค้าที่ไม่มีตัวตนในระบบไปเข้าระบบคลังได้ ทั้งคลังสาขาและคลังกลาง"
//
// Diagnosis: be_stock_batches stores denormalized productName + productId.
// Historical ProClinic seed + Phase 8 adversarial tests left batches whose
// productId no longer resolves to a be_products doc. StockBalancePanel
// renders these orphan rows with stale productName.
//
// Fix path:
//   - Phase C adds FK validation at write (prevents future orphans)
//   - This endpoint cleans the existing orphan accumulation
//
// Operation:
//   POST {action:'list'} → returns DRY-RUN list of orphan batches
//   POST {action:'delete', confirmBatchIds:[...]} → batch-deletes the
//        confirmed subset; writes audit doc to be_admin_audit
//
// Run via curl from bash (no UI — per V29 directive). See
// docs/admin-cleanup-runbook.md for invocation examples.
//
// Security:
//   - verifyAdminToken (admin: true claim required)
//   - Two-phase: list first, then delete only confirmed IDs (no surprise mass-delete)
//   - Audit doc written for every successful delete

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { verifyAdminToken } from './_lib/adminAuth.js';

const APP_ID = 'loverclinic-opd-4c39b';

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
 * Pure helper: identify orphan batches given fetched batch + product snapshots.
 * Exported for unit testing without touching Firestore.
 *
 * @param {Array<{id, productId, productName, branchId, qty, locationType, status, createdAt}>} batches
 * @param {Set<string>} productIdSet — productIds present in be_products
 * @returns {Array} orphan list (subset of batches with productId not in product set)
 */
export function findOrphanBatches(batches, productIdSet) {
  const orphans = [];
  for (const b of batches) {
    const pid = String(b?.productId ?? '');
    if (!pid) continue; // bare batches w/ no productId — separate concern
    if (!productIdSet.has(pid)) {
      orphans.push({
        batchId: String(b.id || b.batchId || ''),
        productId: pid,
        productName: String(b.productName || ''),
        branchId: String(b.branchId || ''),
        qty: b.qty || null,
        locationType: String(b.locationType || ''),
        status: String(b.status || ''),
        createdAt: String(b.createdAt || ''),
      });
    }
  }
  return orphans;
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
  const confirmBatchIds = Array.isArray(req.body?.confirmBatchIds) ? req.body.confirmBatchIds.map(String) : [];

  try {
    const db = getAdminFirestore();
    const data = dataPath(db);

    if (action === 'list') {
      // Fetch all be_products into a Set, then scan be_stock_batches for orphans.
      // Two scans — fine for clinic scale (~hundreds of products, ~thousands of batches).
      const productSnap = await data.collection('be_products').get();
      const productIdSet = new Set();
      for (const d of productSnap.docs) {
        productIdSet.add(d.id);
        // Also accept productId field if doc id differs
        const pid = d.data()?.productId;
        if (pid) productIdSet.add(String(pid));
      }

      const batchSnap = await data.collection('be_stock_batches').get();
      const batches = batchSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const orphans = findOrphanBatches(batches, productIdSet);

      return res.status(200).json({
        success: true,
        data: {
          dryRun: true,
          orphans,
          total: orphans.length,
          totalBatches: batches.length,
          totalProducts: productSnap.size,
          callerEmail: caller.email,
        },
      });
    }

    if (action === 'delete') {
      if (confirmBatchIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'confirmBatchIds[] required for delete action — run action:list first to discover orphans',
        });
      }

      const deleted = [];
      let batchOp = db.batch();
      let inBatch = 0;
      for (const id of confirmBatchIds) {
        const ref = data.collection('be_stock_batches').doc(id);
        batchOp.delete(ref);
        deleted.push(id);
        inBatch += 1;
        if (inBatch >= 500) {
          await batchOp.commit();
          batchOp = db.batch();
          inBatch = 0;
        }
      }
      if (inBatch > 0) await batchOp.commit();

      // Audit doc — admin SDK bypasses rules, but only this endpoint writes it.
      const auditId = `cleanup-orphan-${Date.now()}`;
      await data.collection('be_admin_audit').doc(auditId).set({
        type: 'cleanup-orphan-stock',
        deletedCount: deleted.length,
        deletedBatchIds: deleted,
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
      error: `unknown action: ${action} (expected 'list' or 'delete')`,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'cleanup failed',
    });
  }
}
