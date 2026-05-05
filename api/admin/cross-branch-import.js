// ─── /api/admin/cross-branch-import — Phase 17.1 ──────────────────────────
// Server-side cross-branch master-data import. Atomic firebase-admin batch
// writes N entity docs + 1 audit doc in a single commit.
//
// Spec: docs/superpowers/specs/2026-05-05-phase-17-1-cross-branch-master-data-import-design.md
// Plan: docs/superpowers/plans/2026-05-05-phase-17-1-cross-branch-master-data-import.md (Task 9)
//
// Auth: Bearer ID token w/ admin:true claim (verifyAdminToken from _lib/adminAuth.js).
// Request: { entityType, sourceBranchId, targetBranchId, itemIds: string[] }
// Response: { imported, skippedDup, skippedFK, auditId }
//
// Env vars: FIREBASE_ADMIN_CLIENT_EMAIL + FIREBASE_ADMIN_PRIVATE_KEY (matches
// the rest of api/admin/*). APP_ID is hardcoded — same constant the other
// endpoints use. Plan's example showed FIREBASE_PROJECT_ID/CLIENT_EMAIL/
// PRIVATE_KEY/APP_ID; this project uses the FIREBASE_ADMIN_* prefix instead
// per cleanup-orphan-stock.js + cleanup-test-products.js convention.

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import crypto from 'crypto';
import { verifyAdminToken } from './_lib/adminAuth.js';
import { isKnownEntityType, getAdapter } from '../../src/lib/crossBranchImportAdapters/index.js';

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

// Resolve Firestore collection ref under artifacts/{appId}/public/data/
// (matches src/lib/backendClient.js + every other admin endpoint).
function dataCol(db, collection) {
  return db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(collection);
}

// Truncate audit ID arrays for Firestore 1MB doc-size guard.
function maybeTruncate(arr) {
  const max = 500;
  if (!Array.isArray(arr) || arr.length <= max) return { value: arr, truncated: false };
  return { value: arr.slice(0, 10), truncated: true, totalCount: arr.length };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'METHOD_NOT_ALLOWED' });
  }

  // verifyAdminToken handles Bearer parse + verifyIdToken + admin:true gate;
  // writes 401/403 to res and returns null on failure.
  const caller = await verifyAdminToken(req, res);
  if (!caller) return;
  const decoded = caller.decoded;

  const { entityType, sourceBranchId, targetBranchId, itemIds } = req.body || {};

  // Validation
  if (!isKnownEntityType(entityType)) {
    return res.status(400).json({ success: false, error: 'INVALID_ENTITY_TYPE', entityType: String(entityType || '') });
  }
  if (!sourceBranchId || !targetBranchId) {
    return res.status(400).json({ success: false, error: 'MISSING_BRANCH_ID' });
  }
  if (sourceBranchId === targetBranchId) {
    return res.status(400).json({ success: false, error: 'SOURCE_EQUALS_TARGET' });
  }
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return res.status(400).json({ success: false, error: 'EMPTY_ITEM_IDS' });
  }

  try {
    const adapter = getAdapter(entityType);
    const db = getAdminFirestore();
    const colRef = dataCol(db, adapter.collection);

    // 1. Read source items (branchId=source, doc-id IN itemIds).
    // Use batched-id reads (Firestore in-clause max 30) to handle big lists.
    const sourceItems = [];
    for (let i = 0; i < itemIds.length; i += 30) {
      const chunk = itemIds.slice(i, i + 30).map(String);
      const snap = await colRef
        .where('branchId', '==', String(sourceBranchId))
        .where('__name__', 'in', chunk)
        .get();
      snap.docs.forEach(d => sourceItems.push({ id: d.id, ...d.data() }));
    }

    // 2. Read target items (full set for dedup).
    const targetSnap = await colRef.where('branchId', '==', String(targetBranchId)).get();
    const targetItems = targetSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const targetDedupSet = new Set(targetItems.map(t => adapter.dedupKey(t)));

    // 3. Read FK collections for target branch (and source for ID→dedupKey lookup).
    const fkRefs = sourceItems.flatMap(item => adapter.fkRefs(item));
    const fkCollections = [...new Set(fkRefs.map(r => r.collection))];

    // Map FK collection → adapter for dedupKey computation.
    const FK_COLLECTION_TO_ENTITY = {
      'be_products': 'products',
      'be_product_groups': 'product-groups',
      'be_product_unit_groups': 'product-units',
    };
    const resolveFkAdapter = (col) => {
      const ent = FK_COLLECTION_TO_ENTITY[col];
      return ent ? getAdapter(ent) : null;
    };

    // FK target sets keyed by dedupKey: { 'be_products': Set('productType:name', ...) }.
    const fkTargetIdSets = {};
    // Source FK lookup: { 'be_products': { 'PROD-1': 'productType:name', ... } }.
    const sourceFkLookup = {};
    for (const col of fkCollections) {
      const fkAdapter = resolveFkAdapter(col);
      const tSnap = await dataCol(db, col).where('branchId', '==', String(targetBranchId)).get();
      fkTargetIdSets[col] = new Set(
        fkAdapter
          ? tSnap.docs.map(d => fkAdapter.dedupKey({ id: d.id, ...d.data() }))
          : tSnap.docs.map(d => d.id)
      );

      if (fkAdapter) {
        const sSnap = await dataCol(db, col).where('branchId', '==', String(sourceBranchId)).get();
        const lookup = {};
        sSnap.docs.forEach(d => {
          lookup[d.id] = fkAdapter.dedupKey({ id: d.id, ...d.data() });
        });
        sourceFkLookup[col] = lookup;
      }
    }

    // 4. Classify each requested item.
    const imported = [];
    const skippedDup = [];
    const skippedFK = [];
    const itemsToImport = [];

    for (const item of sourceItems) {
      const dedupKey = adapter.dedupKey(item);
      if (targetDedupSet.has(dedupKey)) {
        skippedDup.push({ sourceId: item.id, reason: 'duplicate', dedupKey });
        continue;
      }
      // FK check — every ref in adapter.fkRefs(item) must have a name-match
      // in target.
      const refs = adapter.fkRefs(item);
      const missingFKs = [];
      for (const ref of refs) {
        for (const refId of ref.ids) {
          const sourceFkKey = sourceFkLookup[ref.collection]?.[refId];
          if (!sourceFkKey || !fkTargetIdSets[ref.collection]?.has(sourceFkKey)) {
            missingFKs.push({ collection: ref.collection, sourceId: refId, dedupKey: sourceFkKey || null });
          }
        }
      }
      if (missingFKs.length > 0) {
        skippedFK.push({ sourceId: item.id, reason: 'missing-fk', missingRefs: missingFKs });
        continue;
      }
      itemsToImport.push(item);
    }

    // 5. Atomic batch write — N entity docs + 1 audit doc in one commit.
    const batch = db.batch();
    const ts = Date.now();
    for (const item of itemsToImport) {
      const newId = `${entityType.replace(/-/g, '_')}_${ts}_${crypto.randomBytes(4).toString('hex')}`.toUpperCase();
      const cloned = adapter.clone(item, targetBranchId, decoded.uid);
      // Phase 17.1 — Batch 1 reviewer note: existing saveDfGroup stamps both
      // `id: newId` and `groupId: newId` into the doc body. Mirror that here
      // so legacy readers (e.g. doc.data().groupId) work for imported docs.
      // The df-groups adapter strips `id` / `groupId` / `dfGroupId` defensively
      // so they need to be re-stamped server-side with the freshly-minted ID.
      if (entityType === 'df-groups') {
        cloned.id = newId;
        cloned.groupId = newId;
      }
      batch.set(colRef.doc(newId), cloned);
      imported.push({ sourceId: item.id, newId });
    }

    // Audit doc — admin SDK bypasses rules; rules block client SDK writes to
    // be_admin_audit.
    const auditId = `cross-branch-import-${ts}-${crypto.randomUUID()}`;
    const importedTrunc = maybeTruncate(imported);
    const skippedDupTrunc = maybeTruncate(skippedDup);
    const skippedFKTrunc = maybeTruncate(skippedFK);
    const auditDoc = {
      action: 'cross-branch-import',
      entityType,
      sourceBranchId: String(sourceBranchId),
      targetBranchId: String(targetBranchId),
      requestedItemCount: itemIds.length,
      importedCount: imported.length,
      skippedDuplicateCount: skippedDup.length,
      skippedFKCount: skippedFK.length,
      imported: importedTrunc.value,
      importedTruncated: !!importedTrunc.truncated,
      skippedDuplicates: skippedDupTrunc.value,
      skippedDuplicatesTruncated: !!skippedDupTrunc.truncated,
      skippedMissingFKs: skippedFKTrunc.value,
      skippedMissingFKsTruncated: !!skippedFKTrunc.truncated,
      adminUid: decoded.uid,
      adminEmail: decoded.email || null,
      ts: new Date(ts).toISOString(),
    };
    batch.set(dataCol(db, 'be_admin_audit').doc(auditId), auditDoc);

    await batch.commit();

    return res.status(200).json({
      success: true,
      imported,
      skippedDup,
      skippedFK,
      auditId,
    });
  } catch (e) {
    console.error('[cross-branch-import]', e);
    return res.status(500).json({ success: false, error: 'BATCH_COMMIT_FAILED', message: String(e?.message || e) });
  }
}
