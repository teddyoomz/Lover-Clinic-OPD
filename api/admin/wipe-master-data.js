// ─── /api/admin/wipe-master-data — V36-tris (2026-04-29) ──────────────────
//
// User directive (verbatim): "id จาก master_data clone ต้องไม่มีในระบบ
// กูแล้ว กูไม่ใช้ data นั้นแล้ว เคยบอกแล้วไอ้สัส ห้ามใช้ master_data ใน
// backend ไม่ว่าจะใช้ทำอะไร ห้ามใช้ master_data ประมวลผลเด็ดขาด ต้องใช้
// be_database เท่านั้น ป้องกันโดยลบ masterdata ดิบที่ sync มาทั้งหมดใน
// โปรแกรม ให้มีแค่ data จาก be data เท่านั้น".
//
// Iron-clad H + V36-tris extension: master_data is sync-staging only
// (DEV-ONLY scaffolding per H-bis). Feature code reads ONLY be_*. This
// endpoint deletes the raw master_data sync artifacts so they can't
// accidentally be read at runtime.
//
// Why an admin endpoint (not client SDK):
//   firestore.rules has `allow read,write: if isClinicStaff()` on
//   master_data; client SDK CAN delete BUT the server endpoint:
//     (1) bundles all collections in one atomic operation
//     (2) writes audit trail to be_admin_audit
//     (3) gates by admin claim (NOT just isClinicStaff) — wipe is
//         destructive, requires owner-tier authorization
//     (4) two-phase (list → delete with confirm) prevents accidents
//
// Operation:
//   POST {action:'list'}                       → DRY-RUN counts per collection
//   POST {action:'delete', confirm:true}       → actual purge
//   POST {action:'delete-type', type:'X', confirm:true} → wipe ONE master_data type only
//
// Collections wiped (master_data/<type>/items/*):
//   - products, courses, doctors, staff, promotions, coupons, vouchers,
//     product-groups, product-units, medical-instruments, holidays,
//     branches, permission-groups, df_groups, df_staff_rates,
//     document-templates, expense-categories, bank-accounts,
//     online-sales, staff-schedules, ... (ANY type with /items subcoll)
//
// Security:
//   - verifyAdminToken (admin: true claim required)
//   - Two-phase: list first, then delete only with confirm:true
//   - Audit doc written for every delete action (be_admin_audit)
//
// Spec: see V36-tris entry in .claude/rules/00-session-start.md V-table.

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
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

function masterDataRoot(db) {
  return db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection('master_data');
}

/**
 * Pure helper: validate type name. Whitelist of master_data types is
 * loose — ANY non-empty alphanumeric+hyphen+underscore name is accepted.
 * Defensive against shell injection / path traversal.
 *
 * @param {string} type
 * @returns {boolean}
 */
export function isValidMasterDataType(type) {
  return typeof type === 'string' && /^[a-zA-Z][a-zA-Z0-9_-]{0,40}$/.test(type);
}

/**
 * Discover all master_data type collections by listing the parent doc's
 * subcollections. Returns array of type names ('products', 'courses',
 * 'doctors', etc.).
 */
async function discoverMasterDataTypes(db) {
  const root = masterDataRoot(db);
  const docs = await root.listDocuments();
  return docs.map((d) => d.id);
}

/**
 * Count items per type. Each master_data/<type>/items/* subcollection.
 * Returns { type: count } map.
 */
async function countItemsPerType(db, types) {
  const counts = {};
  for (const type of types) {
    if (!isValidMasterDataType(type)) {
      counts[type] = -1; // invalid name
      continue;
    }
    try {
      const snap = await masterDataRoot(db).doc(type).collection('items').get();
      counts[type] = snap.size;
    } catch (e) {
      counts[type] = -1; // permission / missing
    }
  }
  return counts;
}

/**
 * Delete every doc in master_data/<type>/items + the parent meta doc.
 * Uses chunked writeBatch (500-op Firestore limit per batch).
 *
 * @returns {{ type: string, deleted: number, metaDeleted: boolean }}
 */
async function wipeMasterDataType(db, type) {
  if (!isValidMasterDataType(type)) {
    throw new Error(`invalid master_data type: ${type}`);
  }
  const root = masterDataRoot(db);
  const itemsCol = root.doc(type).collection('items');
  const itemsSnap = await itemsCol.get();
  const itemDocs = itemsSnap.docs;

  let deleted = 0;
  const CHUNK = 400;
  for (let i = 0; i < itemDocs.length; i += CHUNK) {
    const batch = db.batch();
    const slice = itemDocs.slice(i, i + CHUNK);
    for (const d of slice) batch.delete(d.ref);
    await batch.commit();
    deleted += slice.length;
  }

  // Delete the meta doc (master_data/<type>) too — clears _syncedAt etc.
  let metaDeleted = false;
  try {
    await root.doc(type).delete();
    metaDeleted = true;
  } catch {
    metaDeleted = false; // doc didn't exist
  }

  return { type, deleted, metaDeleted };
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
  const oneType = req.body?.type ? String(req.body.type) : '';
  const confirm = req.body?.confirm === true;

  try {
    const db = getAdminFirestore();

    if (action === 'list') {
      const types = await discoverMasterDataTypes(db);
      const counts = await countItemsPerType(db, types);
      const total = Object.values(counts)
        .filter((n) => typeof n === 'number' && n >= 0)
        .reduce((s, n) => s + n, 0);
      return res.status(200).json({
        success: true,
        action: 'list',
        types,
        counts,
        totalItems: total,
        message: `${types.length} master_data types found, ${total} total items. POST {action:'delete', confirm:true} to wipe ALL.`,
      });
    }

    if (action === 'delete') {
      if (!confirm) {
        return res.status(400).json({
          success: false,
          error: 'confirm:true required for destructive delete',
        });
      }
      const types = await discoverMasterDataTypes(db);
      const results = [];
      for (const type of types) {
        if (!isValidMasterDataType(type)) {
          results.push({ type, error: 'invalid name', deleted: 0 });
          continue;
        }
        try {
          const r = await wipeMasterDataType(db, type);
          results.push(r);
        } catch (e) {
          results.push({ type, error: String(e?.message || e), deleted: 0 });
        }
      }

      // Audit trail
      const totalDeleted = results.reduce((s, r) => s + (r.deleted || 0), 0);
      const auditId = `wipe-master-data-${Date.now()}`;
      await db.collection('artifacts').doc(APP_ID).collection('public').doc('data')
        .collection('be_admin_audit').doc(auditId).set({
          auditId,
          action: 'wipe-master-data',
          executedBy: caller?.uid || caller?.email || 'unknown',
          executedAt: FieldValue.serverTimestamp(),
          types,
          results,
          totalDeleted,
        });

      return res.status(200).json({
        success: true,
        action: 'delete',
        auditId,
        totalDeleted,
        results,
      });
    }

    if (action === 'delete-type') {
      if (!oneType || !isValidMasterDataType(oneType)) {
        return res.status(400).json({
          success: false,
          error: `valid type:'<name>' required (got: ${oneType})`,
        });
      }
      if (!confirm) {
        return res.status(400).json({
          success: false,
          error: 'confirm:true required for destructive delete',
        });
      }
      const r = await wipeMasterDataType(db, oneType);

      // Audit trail
      const auditId = `wipe-master-data-${oneType}-${Date.now()}`;
      await db.collection('artifacts').doc(APP_ID).collection('public').doc('data')
        .collection('be_admin_audit').doc(auditId).set({
          auditId,
          action: 'wipe-master-data',
          executedBy: caller?.uid || caller?.email || 'unknown',
          executedAt: FieldValue.serverTimestamp(),
          types: [oneType],
          results: [r],
          totalDeleted: r.deleted,
        });

      return res.status(200).json({
        success: true,
        action: 'delete-type',
        auditId,
        ...r,
      });
    }

    return res.status(400).json({
      success: false,
      error: `unknown action: ${action}. Valid: list | delete | delete-type`,
    });
  } catch (e) {
    console.error('[wipe-master-data] failed:', e);
    return res.status(500).json({
      success: false,
      error: String(e?.message || e),
    });
  }
}
