// ─── /api/admin/branch-restore — V40 ───────────────────────────────────────
// Mode: 'overwrite' (same-branch, preserve docIds) or 'clone' (T1 only,
// re-mint docIds). See spec §5.

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import crypto from 'crypto';
import { verifyAdminToken } from './_lib/adminAuth.js';
import { TIER_MAP, BACKUP_TIER_T1, T1_FK_SPEC, buildFkRemapTable, applyFkRemap, isUniversalCollection } from '../../src/lib/branchBackupCore.js';
import { validateBackupFile, jsonReviverForNonFinite } from '../../src/lib/branchBackupSchema.js';
import { computeAppointmentSlotDocs } from '../../src/lib/appointmentSlotKeys.js';

// appointment-loop R9 (2026-06-03) — rebuild be_appointment_slots for restored
// live appointments. The AP1-bis slot docs are keyed date_doctor_time (+ ROOM__),
// NOT by branch/customer, so they're absent from every backup tier → a restore
// brought back live appts with NO atomic double-booking guard → their times were
// silently bookable (the guard degraded to the dismissible soft scan). Rebuild
// from the restored appts so the AP1-bis guard is consistent again. Idempotent
// (overwrites); chunked under the Firestore 500-writes/batch cap.
async function rebuildAppointmentSlots(db, dataCol, restoredAppts) {
  let slotsRebuilt = 0;
  let batch = db.batch(); let n = 0;
  const flush = async () => { if (n > 0) { await batch.commit(); batch = db.batch(); n = 0; } };
  const takenAt = new Date().toISOString();
  for (const a of restoredAppts || []) {
    for (const { key, doc } of computeAppointmentSlotDocs(a, { takenAt })) {
      batch.set(dataCol(db, 'be_appointment_slots').doc(key), doc, { merge: false });
      n++; slotsRebuilt++;
      if (n >= 400) await flush();
    }
  }
  await flush();
  return slotsRebuilt;
}

const APP_ID = 'loverclinic-opd-4c39b';
const BUCKET = `${APP_ID}.firebasestorage.app`;
const BATCH_LIMIT = 400;

let cachedDb = null;
let cachedBucket = null;
function getAdmin() {
  if (cachedDb && cachedBucket) return { db: cachedDb, bucket: cachedBucket };
  let app;
  if (getApps().length > 0) {
    app = getApp();
  } else {
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
    if (!clientEmail || !rawKey) throw new Error('firebase-admin not configured');
    app = initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
        clientEmail,
        privateKey: rawKey.replace(/\\n/g, '\n'),
      }),
      storageBucket: BUCKET,
    });
  }
  cachedDb = getFirestore(app);
  // V40-prod-fix (2026-05-08) — pass BUCKET explicitly (mirror branch-backup-export
  // fix). Reused-app via getApps().length > 0 may lack storageBucket → bucket()
  // no-arg throws "Bucket name not specified or invalid".
  cachedBucket = getStorage(app).bucket(BUCKET);
  return { db: cachedDb, bucket: cachedBucket };
}
function dataCol(db, collection) {
  return db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(collection);
}
function randHex(n = 8) { return crypto.randomBytes(Math.ceil(n / 2)).toString('hex').slice(0, n); }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });

  const caller = await verifyAdminToken(req, res);
  if (!caller) return;

  const { mode, sourceStoragePath, uploadedFileBase64, targetBranchId, scopeOverride = null } = req.body || {};
  if (!['overwrite', 'clone'].includes(mode)) {
    return res.status(400).json({ ok: false, error: 'INVALID_MODE' });
  }
  if (!targetBranchId) return res.status(400).json({ ok: false, error: 'MISSING_TARGET_BRANCH_ID' });

  try {
    const { db, bucket } = getAdmin();

    // Load file (Storage path or base64)
    let json;
    if (sourceStoragePath) {
      const [data] = await bucket.file(sourceStoragePath).download();
      json = data.toString('utf8');
    } else if (uploadedFileBase64) {
      json = Buffer.from(uploadedFileBase64, 'base64').toString('utf8');
    } else {
      return res.status(400).json({ ok: false, error: 'NO_SOURCE_PROVIDED' });
    }

    // V40-prod-fix-5 (2026-05-08) — reviver decodes NaN/Infinity sentinels
    // back to actual non-finite numbers. No-op on schemaVersion=1 files
    // (no sentinels present) — backwards compatible.
    let file;
    try { file = JSON.parse(json, jsonReviverForNonFinite); } catch { return res.status(400).json({ ok: false, error: 'JSON_PARSE_FAILED' }); }
    try { validateBackupFile(file); } catch (e) { return res.status(400).json({ ok: false, error: e.message }); }

    if (mode === 'overwrite' && file.meta.sourceBranchId !== targetBranchId) {
      return res.status(400).json({ ok: false, error: 'MODE_MISMATCH', detail: 'overwrite requires source === target' });
    }
    if (mode === 'clone' && file.meta.sourceBranchId === targetBranchId) {
      return res.status(400).json({ ok: false, error: 'CLONE_TO_SAME_BRANCH' });
    }

    const writtenCollections = scopeOverride && Array.isArray(scopeOverride)
      ? scopeOverride
      : Object.keys(file.collections);

    // Clone mode: enforce T1-only (T4 customer-subcollection paths are blocked too;
    // clone is master/setup data only — transactions don't make sense to clone).
    if (mode === 'clone') {
      const t1set = new Set(TIER_MAP[BACKUP_TIER_T1]);
      for (const col of writtenCollections) {
        if (!t1set.has(col)) {
          return res.status(400).json({ ok: false, error: 'CLONE_NON_T1_COLLECTION', collection: col });
        }
      }
    }

    const result = { mode, perCollection: {}, fkRemap: { tables: {}, unmapped: [] } };

    if (mode === 'overwrite') {
      for (const col of writtenCollections) {
        const docs = file.collections[col] || [];
        if (col.startsWith('be_customers/')) {
          // T4 customer subcollection — path: be_customers/{customerId}/{sub}
          const parts = col.split('/');
          const customerId = parts[1];
          const sub = parts[2];
          let written = 0;
          for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
            const slice = docs.slice(i, i + BATCH_LIMIT);
            const batch = db.batch();
            for (const d of slice) {
              const id = String(d.id || d.docId || randHex(12));
              const { id: _omit, ...rest } = d;
              batch.set(dataCol(db, 'be_customers').doc(customerId).collection(sub).doc(id), { ...rest, branchId: targetBranchId }, { merge: false });
            }
            await batch.commit();
            written += slice.length;
          }
          result.perCollection[col] = { written };
        } else {
          let written = 0;
          for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
            const slice = docs.slice(i, i + BATCH_LIMIT);
            const batch = db.batch();
            for (const d of slice) {
              const id = String(d.id || d.docId);
              const { id: _omit, ...rest } = d;
              batch.set(dataCol(db, col).doc(id), { ...rest, branchId: targetBranchId }, { merge: false });
            }
            await batch.commit();
            written += slice.length;
          }
          result.perCollection[col] = { written };
        }
      }
      // R9 — restore the AP1-bis slot guard for restored live appointments.
      if (Array.isArray(file.collections?.be_appointments)) {
        result.slotsRebuilt = await rebuildAppointmentSlots(db, dataCol, file.collections.be_appointments);
      }
    } else {
      // CLONE — T1 only — re-mint IDs + FK remap
      const ts = Date.now();
      // Pre-mint newIds per source doc for FK remap tables
      const remapTables = {};
      const sourcesPerCol = {};
      for (const col of writtenCollections) {
        const docs = file.collections[col] || [];
        sourcesPerCol[col] = docs;
        const newIds = docs.map((_, i) => `${col.replace(/^be_/, '').toUpperCase()}_${ts}_${randHex(4).toUpperCase()}_${i}`);
        remapTables[col] = buildFkRemapTable(docs, newIds);
      }
      result.fkRemap.tables = Object.fromEntries(Object.entries(remapTables).map(([k, m]) => [k, [...m.entries()]]));

      const auditCtx = { unmapped: [] };
      for (const col of writtenCollections) {
        const docs = sourcesPerCol[col];
        const fkSpec = T1_FK_SPEC[col] || {};
        const newIdsArr = [...remapTables[col].values()];
        let written = 0;
        for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
          const slice = docs.slice(i, i + BATCH_LIMIT);
          const batch = db.batch();
          for (let j = 0; j < slice.length; j++) {
            const newId = newIdsArr[i + j];
            const { id: _omit, ...rest } = slice[j];
            const remapped = applyFkRemap(rest, fkSpec, remapTables, auditCtx);
            // Stamp canonical id field per BSA spec
            const canonicalIdField = ({
              be_products: 'productId',
              be_courses: 'courseId',
              be_product_groups: 'groupId',
              be_product_units: 'unitId',          // V40 review I2 — rules-canonical unit collection
              be_product_unit_groups: 'unitGroupId',
              be_medical_instruments: 'instrumentId',
              be_holidays: 'holidayId',
              be_df_groups: 'groupId',
              be_promotions: 'promotionId',
              be_coupons: 'couponId',
              be_vouchers: 'voucherId',
            })[col] || null;
            const finalDoc = { ...remapped, branchId: targetBranchId };
            if (canonicalIdField) finalDoc[canonicalIdField] = newId;
            batch.set(dataCol(db, col).doc(newId), finalDoc, { merge: false });
          }
          await batch.commit();
          written += slice.length;
        }
        result.perCollection[col] = { written };
      }
      result.fkRemap.unmapped = auditCtx.unmapped;
    }

    const auditId = `branch-restore-${mode}-${Date.now()}-${randHex()}`;
    await dataCol(db, 'be_admin_audit').doc(auditId).set({
      action: `branch-restore-${mode}`,
      sourceStoragePath: sourceStoragePath || '(uploaded file)',
      sourceBranchId: file.meta.sourceBranchId,
      targetBranchId,
      perCollection: result.perCollection,
      unmappedFKs: mode === 'clone' ? result.fkRemap.unmapped : [],
      executedBy: caller.decoded.uid,
      executedAt: new Date().toISOString(),
    });

    return res.status(200).json({ ok: true, mode, perCollection: result.perCollection, unmapped: result.fkRemap.unmapped, auditId });
  } catch (e) {
    console.error('branch-restore error:', e);
    return res.status(500).json({ ok: false, error: 'RESTORE_FAILED', detail: e.message });
  }
}
