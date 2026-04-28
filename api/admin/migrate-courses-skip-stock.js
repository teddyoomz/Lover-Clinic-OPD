// ─── /api/admin/migrate-courses-skip-stock — 2026-04-28 ────────────────────
//
// Background: "ไม่ตัดสต็อค" (skipStockDeduction) flag added to be_courses
// schema (main + courseProducts[i]). User directive (verbatim):
// "ทำให้ database คอร์สทั้งหมดของเรามีสถานะไม่ติ๊กตัดสต็อค (แปลว่าตัดสต็อค)
// ทุกชิ้นที่มีอยู่ตอนนี้".
//
// Migration: backfill `skipStockDeduction: false` on every be_courses doc
// + every courseProducts[i] entry that doesn't already carry the field.
// Default unchecked = ตัดสต็อคปกติ (semantic mirror of UI default).
//
// Operation:
//   POST {action:'list'}  → DRY-RUN: returns count + sample of docs missing flag
//   POST {action:'commit'} → batch-update missing-flag docs; writes audit doc
//
// Idempotent: re-runs after commit return 0 changes (same shape regardless).
//
// Security:
//   - verifyAdminToken (admin: true claim required)
//   - Two-phase (list first → confirm → commit) by convention; commit
//     branch does its own scan (fresh count) so the dry-run output isn't
//     a contract — admin sees the live number at commit time too.
//   - Audit doc written for every successful commit.

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
 * Pure helper: classify a course doc as "needs-migration" + compute the
 * patch object that would normalize it.
 *
 * A course needs migration if:
 *  - top-level `skipStockDeduction` is undefined (legacy data pre-flag), OR
 *  - any courseProducts[i] is missing `skipStockDeduction`.
 *
 * Returns { needsMigration: boolean, patch: object|null } where patch is the
 * minimal Firestore update doc (top-level field + full courseProducts array
 * if any sub-item needs touching). Returns patch=null when no migration
 * needed.
 *
 * Exported for unit testing without touching Firestore.
 *
 * @param {object} courseData — be_courses doc data
 * @returns {{needsMigration: boolean, patch: object|null}}
 */
export function planCourseSkipStockMigration(courseData) {
  if (!courseData || typeof courseData !== 'object' || Array.isArray(courseData)) {
    return { needsMigration: false, patch: null };
  }

  const topMissing = courseData.skipStockDeduction === undefined;
  const products = Array.isArray(courseData.courseProducts) ? courseData.courseProducts : null;
  const subMissing = products
    ? products.some(p => p && typeof p === 'object' && p.skipStockDeduction === undefined)
    : false;

  if (!topMissing && !subMissing) {
    return { needsMigration: false, patch: null };
  }

  const patch = {};
  if (topMissing) {
    patch.skipStockDeduction = false;
  }
  if (subMissing && products) {
    // Firestore requires the entire array to be re-set to update sub-items.
    // Preserve every existing field; just add the flag with default false
    // when missing. Keeps un-migrated docs forwards-compatible.
    patch.courseProducts = products.map(p => {
      if (!p || typeof p !== 'object') return p;
      if (p.skipStockDeduction !== undefined) return p;
      return { ...p, skipStockDeduction: false };
    });
  }
  return { needsMigration: true, patch };
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

  try {
    const db = getAdminFirestore();
    const data = dataPath(db);

    if (action === 'list') {
      const courseSnap = await data.collection('be_courses').get();
      const candidates = [];
      let topMissingCount = 0;
      let subMissingCount = 0;
      for (const d of courseSnap.docs) {
        const plan = planCourseSkipStockMigration(d.data());
        if (plan.needsMigration) {
          candidates.push({
            courseId: d.id,
            courseName: d.data()?.courseName || '',
            topMissing: 'skipStockDeduction' in plan.patch,
            subMissing: 'courseProducts' in plan.patch,
            subItemCount: Array.isArray(d.data()?.courseProducts) ? d.data().courseProducts.length : 0,
          });
          if ('skipStockDeduction' in plan.patch) topMissingCount += 1;
          if ('courseProducts' in plan.patch) subMissingCount += 1;
        }
      }
      return res.status(200).json({
        success: true,
        data: {
          dryRun: true,
          totalCourses: courseSnap.size,
          needsMigrationCount: candidates.length,
          topMissingCount,
          subMissingCount,
          sample: candidates.slice(0, 20),
          callerEmail: caller.email,
        },
      });
    }

    if (action === 'commit') {
      const courseSnap = await data.collection('be_courses').get();
      const updates = []; // { id, patch }
      for (const d of courseSnap.docs) {
        const plan = planCourseSkipStockMigration(d.data());
        if (plan.needsMigration) {
          updates.push({ id: d.id, patch: plan.patch });
        }
      }

      let batchOp = db.batch();
      let inBatch = 0;
      const updatedIds = [];
      for (const u of updates) {
        const ref = data.collection('be_courses').doc(u.id);
        batchOp.update(ref, u.patch);
        updatedIds.push(u.id);
        inBatch += 1;
        if (inBatch >= 500) {
          await batchOp.commit();
          batchOp = db.batch();
          inBatch = 0;
        }
      }
      if (inBatch > 0) await batchOp.commit();

      const auditId = `migrate-courses-skip-stock-${Date.now()}`;
      await data.collection('be_admin_audit').doc(auditId).set({
        type: 'migrate-courses-skip-stock',
        totalCourses: courseSnap.size,
        updatedCount: updatedIds.length,
        updatedIds,
        callerEmail: caller.email,
        callerUid: caller.uid,
        createdAt: new Date().toISOString(),
      });

      return res.status(200).json({
        success: true,
        data: {
          dryRun: false,
          totalCourses: courseSnap.size,
          updatedCount: updatedIds.length,
          updatedIds: updatedIds.slice(0, 50), // sample only — full list in audit
          auditId,
          callerEmail: caller.email,
        },
      });
    }

    return res.status(400).json({
      success: false,
      error: `unknown action: ${action} (expected 'list' or 'commit')`,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'migration failed',
    });
  }
}
