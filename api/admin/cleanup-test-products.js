// ─── /api/admin/cleanup-test-products — Phase 15.6 (Issue 5, 2026-04-28) ────
//
// Background: User reported (verbatim) "ตามภาพที่ 2 นายทำอะไรไว้เยอะแยะ
// ทำให้ตอนเลือกสินค้า มีสินค้ามั่วๆนี้ปรากฎขึ้นมา ทำไมทำแล้วไม่ลบ"
//
// Phase 8 adversarial test suites (tests/extended/phase8-adv-sales.test.js +
// phase8-adv-treatments.test.js) created products with prefixes:
//   - ADVS-PA-, ADVS-PB-, ADVS-POPT-, ADVS-PUNT-, ADVS-PFR-
//   - ADVT-CON-, ADVT-MED-, ADVT-BR-, ADVT-ITEM-, ADVT-PRD-, ADVT-UNT-
// Their afterAll nuke() helper deletes from `master_data/products/items/` but
// the `be_products` mirror was not cleaned → admin sees pollution in pickers.
//
// This endpoint cleans `be_products` test pollution. Cascade gate refuses
// delete if any be_stock_batches still references the product → forces
// orphan cleanup first via /api/admin/cleanup-orphan-stock.
//
// Operation:
//   POST {action:'list'} → returns DRY-RUN list of test products (matching prefix regex)
//   POST {action:'delete', confirmProductIds:[...]} → batch-deletes confirmed
//        subset; refuses if any productId has surviving be_stock_batches
//
// Run via curl from bash (no UI — per V29).

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { verifyAdminToken } from './_lib/adminAuth.js';

const APP_ID = 'loverclinic-opd-4c39b';

// Test/E2E product prefix patterns. Extend cautiously — every entry here
// is permanently scannable for cleanup. Do NOT add real-product prefixes
// (e.g. 'ALG-', 'BTX-') — those represent real clinic SKUs.
//
// V35.2 (2026-04-28) — extended to cover Phase 8 adversarial variants
// ADVX-/ADVO-/ADVW- (sales/orders/withdrawals adversarial test scaffolds).
// User's first cleanup found 40 ADVS-/ADVT-* products + their batches; the
// 14 ADVX-/ADVO-/ADVW-* leftovers slipped past the original regex.
const TEST_PRODUCT_ID_PATTERN = /^(ADVS-|ADVT-|ADVX-|ADVO-|ADVW-|TEST-PROD-|E2E-PROD-|TEST-|E2E-)/;

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

/** Pure helper: classify a productId as test-prefix or production. Exported for tests. */
export function isTestProductId(id) {
  return TEST_PRODUCT_ID_PATTERN.test(String(id || ''));
}

/** Pure helper: list test products from a be_products snapshot. */
export function findTestProducts(productDocs) {
  const result = [];
  for (const d of productDocs || []) {
    const id = String(d?.id ?? '');
    if (!id) continue;
    if (isTestProductId(id)) {
      result.push({
        productId: id,
        name: String(d?.name || d?.productName || ''),
        category: String(d?.category || d?.itemType || ''),
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
  const confirmProductIds = Array.isArray(req.body?.confirmProductIds) ? req.body.confirmProductIds.map(String) : [];

  try {
    const db = getAdminFirestore();
    const data = dataPath(db);

    if (action === 'list') {
      const snap = await data.collection('be_products').get();
      const productDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const testProducts = findTestProducts(productDocs);
      return res.status(200).json({
        success: true,
        data: {
          dryRun: true,
          candidates: testProducts,
          total: testProducts.length,
          totalProducts: snap.size,
          callerEmail: caller.email,
        },
      });
    }

    if (action === 'delete') {
      if (confirmProductIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'confirmProductIds[] required for delete action',
        });
      }

      // Cascade gate: refuse if any productId still has be_stock_batches.
      // Forces orphan cleanup first → stable order, no FK dangles.
      const blockedByBatches = [];
      for (const pid of confirmProductIds) {
        if (!isTestProductId(pid)) {
          // Defensive: refuse to delete production-looking IDs even if admin asks.
          return res.status(400).json({
            success: false,
            error: `productId "${pid}" does not match test-prefix pattern — refused`,
          });
        }
        const batchSnap = await data.collection('be_stock_batches')
          .where('productId', '==', pid)
          .limit(1)
          .get();
        if (!batchSnap.empty) {
          blockedByBatches.push(pid);
        }
      }
      if (blockedByBatches.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'cascade-gate: some products still have be_stock_batches references. Run /api/admin/cleanup-orphan-stock first.',
          blockedByBatches,
        });
      }

      const deleted = [];
      let batchOp = db.batch();
      let inBatch = 0;
      for (const id of confirmProductIds) {
        batchOp.delete(data.collection('be_products').doc(id));
        deleted.push(id);
        inBatch += 1;
        if (inBatch >= 500) {
          await batchOp.commit();
          batchOp = db.batch();
          inBatch = 0;
        }
      }
      if (inBatch > 0) await batchOp.commit();

      const auditId = `cleanup-test-products-${Date.now()}`;
      await data.collection('be_admin_audit').doc(auditId).set({
        type: 'cleanup-test-products',
        deletedCount: deleted.length,
        deletedProductIds: deleted,
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
