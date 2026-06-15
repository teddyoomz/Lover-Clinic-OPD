// ─── /api/admin/delete-customer-cascade — Phase 24.0 + V74 EXTENSION ────────
//
// Atomic customer-delete + cascade + audit doc, gated on admin claim OR
// customer_delete perm claim. Mirrors V35 cleanup-test-* admin-SDK pattern.
//
// Spec:
//   Phase 24.0 (2026-05-06): docs/superpowers/specs/2026-05-06-customer-delete-button-design.md §6
//   V74 (2026-05-16): docs/superpowers/specs/2026-05-16-customer-backup-restore-design.md §4.2
//
// V74 extension (autoBackupRef MODE; backward-compat preserved):
//   - If request.autoBackupRef provided + action='delete', AV19 ELEVATED gate fires:
//     * Verifies Storage backup file exists
//     * Recomputes bodyHash + storageManifestHash + per-object SHA-256
//     * BLOCKs delete on any mismatch (BACKUP_INTEGRITY_FAIL)
//   - Cascade extended from 11 → 16 collections (CG: be_quotations, be_vendor_sales,
//     be_online_sales, be_sale_insurance_claims, be_recalls)
//   - Recursive deletion of 8 customer-attached subcollections (CS)
//   - Storage object deletion under be_customers/{customerId}/ (CF)
//   - chat_conversations matching customer via matchCustomerChatPredicate (CH)
//   - Audit doc payload extended with subcollectionCounts, storageObjectCount,
//     chatConversationCount, autoBackupRef, bodyHash, storageManifestHash
//
// Backward-compat: WITHOUT autoBackupRef, V74 still extends cascade to 16 +
// subcoll + storage + chat but does NOT integrity-verify. UI MUST pass
// autoBackupRef for strict mode; CLI scripts may bypass.
//
// Rule M compliance: writes audit doc to be_admin_audit/customer-delete-{id}-{ts}-{rand}.

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { randomBytes, createHash } from 'node:crypto';
import { verifyAdminOrPermissionToken } from './_lib/adminAuth.js';
import {
  CUSTOMER_CASCADE_COLLECTIONS_FULL,
  T4_SUBCOLLECTIONS,
  matchCustomerChatPredicate,
} from '../../src/lib/customerBackupCore.js';
import { validateCustomerBackupFile, computeStorageManifestHash } from '../../src/lib/customerBackupSchema.js';
import { computeBodyHash, jsonReviverForNonFinite } from '../../src/lib/branchBackupSchema.js';
import { deriveClaimKey } from '../../src/lib/customerIdentity.js'; // 2026-06-16 Part A — free the identity claim on delete

const APP_ID = 'loverclinic-opd-4c39b';
const BUCKET = `${APP_ID}.firebasestorage.app`;
const STORAGE_PREFIX_CUSTOMER = 'be_customers';

// V74: canonical 16-collection cascade list (extends Phase 24.0's 11).
// Single source of truth lives in src/lib/customerBackupCore.js
// (CUSTOMER_CASCADE_COLLECTIONS_FULL).
const CUSTOMER_CASCADE_COLLECTIONS = CUSTOMER_CASCADE_COLLECTIONS_FULL;

// Map collection name → cascadeCounts JSON key (camelCase for response).
// Extended in V74 for CG (5 new entries).
const COL_TO_RESPONSE_KEY = Object.freeze({
  be_treatments: 'treatments',
  be_sales: 'sales',
  be_deposits: 'deposits',
  be_wallets: 'wallets',
  be_wallet_transactions: 'walletTransactions',
  be_memberships: 'memberships',
  be_point_transactions: 'pointTransactions',
  be_appointments: 'appointments',
  be_course_changes: 'courseChanges',
  be_link_requests: 'linkRequests',
  be_customer_link_tokens: 'customerLinkTokens',
  // V74 CG additions
  be_quotations: 'quotations',
  be_vendor_sales: 'vendorSales',
  be_online_sales: 'onlineSales',
  be_sale_insurance_claims: 'saleInsuranceClaims',
  be_recalls: 'recalls',
});

let cachedDb = null, cachedBucket = null;
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
      storageBucket: BUCKET,
    });
  }
  cachedDb = getFirestore(app);
  return cachedDb;
}

// V74 — lazy Storage bucket accessor (needed for autoBackupRef verify + CF wipe)
function getAdminBucket() {
  if (cachedBucket) return cachedBucket;
  getAdminFirestore(); // ensures app initialized
  cachedBucket = getStorage(getApp()).bucket(BUCKET);
  return cachedBucket;
}

function dataPath(db) {
  return db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
}

/** Pure helper: assert caller has admin OR customer_delete claim. */
export function assertHasDeletePermission(claims) {
  if (!claims || typeof claims !== 'object') return false;
  return claims.admin === true || claims.customer_delete === true;
}

/** Pure helper: validate authorizedBy payload shape.
 *
 * Phase 24.0-bis (2026-05-06 evening) — collapsed 3-authorizer (staff +
 * assistant + doctor) shape to single-authorizer ({authorizerId,
 * authorizerName, authorizerRole}) per user UX directive. Backward-compat:
 * legacy 6-field shape still accepted (silent translation to authorizerId
 * = staffId fallback). New callers should send the 3-field shape.
 */
export function validateAuthorizedBy(authorizedBy) {
  if (!authorizedBy || typeof authorizedBy !== 'object') return 'authorizedBy required';
  // Phase 24.0-bis canonical shape
  if (typeof authorizedBy.authorizerId === 'string') {
    if (!authorizedBy.authorizerId.trim()) return 'authorizedBy.authorizerId required (non-empty string)';
    if (typeof authorizedBy.authorizerName !== 'string' || !authorizedBy.authorizerName.trim()) {
      return 'authorizedBy.authorizerName required (non-empty string)';
    }
    if (typeof authorizedBy.authorizerRole !== 'string' || !authorizedBy.authorizerRole.trim()) {
      return 'authorizedBy.authorizerRole required (non-empty string)';
    }
    if (!['staff', 'doctor'].includes(authorizedBy.authorizerRole)) {
      return `authorizedBy.authorizerRole must be 'staff' or 'doctor' (got '${authorizedBy.authorizerRole}')`;
    }
    return null;
  }
  // Legacy 6-field shape (Phase 24.0 original spec) — accepted for
  // backward-compat. Will be normalized at use-site to canonical shape.
  const required = ['staffId', 'staffName', 'assistantId', 'assistantName', 'doctorId', 'doctorName'];
  for (const key of required) {
    if (typeof authorizedBy[key] !== 'string' || !authorizedBy[key].trim()) {
      return `authorizedBy.${key} required (non-empty string)`;
    }
  }
  return null;
}

/** Pure helper: normalize legacy 6-field authorizedBy → canonical 3-field
 * shape. Returns the same object if already canonical. Used at the audit
 * payload assembly site so legacy callers + new callers both produce the
 * same audit doc shape.
 */
export function normalizeAuthorizedBy(authorizedBy) {
  if (!authorizedBy || typeof authorizedBy !== 'object') return null;
  if (typeof authorizedBy.authorizerId === 'string') {
    return {
      authorizerId: authorizedBy.authorizerId,
      authorizerName: authorizedBy.authorizerName,
      authorizerRole: authorizedBy.authorizerRole,
    };
  }
  // Legacy: collapse to staff (admin previously chose 1 person per role; we
  // pick staff as the primary authorizer in the audit since that was the
  // first dropdown in the original spec).
  return {
    authorizerId: authorizedBy.staffId,
    authorizerName: authorizedBy.staffName,
    authorizerRole: 'staff',
  };
}

/** Pure helper: classify origin from customer doc's isManualEntry flag. */
export function classifyOrigin(customer) {
  return customer?.isManualEntry === true ? 'manual' : 'proclinic-cloned';
}

/**
 * 2026-06-16 Part A — free the customer's identity claim on delete (admin SDK
 * mirror of client _freeCustomerIdentityClaim). Promote a linked dup if any,
 * else delete; if the deleted customer was an override-dup, remove it from the
 * canonical's linkedCustomerIds. Best-effort.
 */
export async function freeIdentityClaimAdmin(db, data, customerId, customer) {
  const claimKey = customer?._identityClaimKey
    || deriveClaimKey(customer?.citizen_id, customer?.passport_id)
    || null;
  if (!claimKey) return { freed: false };
  const ref = data.collection('be_customer_identity').doc(claimKey);
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const d = snap.data();
      const linked = Array.isArray(d.linkedCustomerIds) ? d.linkedCustomerIds : [];
      if (d.customerId === customerId) {
        if (linked.length > 0) tx.update(ref, { customerId: linked[0], linkedCustomerIds: linked.slice(1) });
        else tx.delete(ref);
      } else if (linked.includes(customerId)) {
        tx.update(ref, { linkedCustomerIds: linked.filter(id => id !== customerId) });
      }
    });
    return { freed: true, claimKey };
  } catch (e) {
    console.error('[freeIdentityClaimAdmin]', e);
    return { freed: false, claimKey, error: e.message };
  }
}

/**
 * V74 — AV19 elevated integrity verification for autoBackupRef.
 * Verifies:
 *   1. Storage file exists at backupRef
 *   2. JSON body parses
 *   3. Recomputed bodyHash matches meta.bodyHash
 *   4. Recomputed storageManifestHash matches meta.storageManifestHash
 *   5. Every Storage object in manifest exists at backup path + per-object SHA-256 matches
 *
 * @returns {Promise<{ok: true, meta: object, file: object} | {ok: false, error: string, detail?: any}>}
 */
export async function verifyAutoBackupIntegrity({ bucket, backupRef }) {
  if (!backupRef || typeof backupRef !== 'string') {
    return { ok: false, error: 'AUTO_BACKUP_REF_MISSING' };
  }
  // 1. Existence
  const [exists] = await bucket.file(backupRef).exists();
  if (!exists) return { ok: false, error: 'AUTO_BACKUP_NOT_FOUND', detail: { backupRef } };

  // 2. Download + parse
  let file;
  try {
    const [buf] = await bucket.file(backupRef).download();
    file = JSON.parse(buf.toString('utf8'), jsonReviverForNonFinite);
  } catch (e) {
    return { ok: false, error: 'BACKUP_JSON_PARSE_FAILED', detail: { message: e.message } };
  }

  // 3. Schema validate
  try {
    validateCustomerBackupFile(file);
  } catch (e) {
    return { ok: false, error: 'BACKUP_SCHEMA_INVALID', detail: { message: e.message } };
  }

  // 4. bodyHash recompute
  const hashedBody = { ...(file.collections || {}) };
  for (const [subName, docs] of Object.entries(file.subcollections || {})) {
    hashedBody[`__sub__${subName}`] = Array.isArray(docs) ? docs : [];
  }
  hashedBody.__chat__ = Array.isArray(file.chatConversations) ? file.chatConversations : [];
  const recomputedBodyHash = computeBodyHash(hashedBody);
  if (file.meta.bodyHash && recomputedBodyHash !== file.meta.bodyHash) {
    return {
      ok: false,
      error: 'BACKUP_BODY_HASH_MISMATCH',
      detail: { expected: file.meta.bodyHash, recomputed: recomputedBodyHash },
    };
  }

  // 5. storageManifestHash recompute
  const manifest = file.meta.storageManifest || [];
  const recomputedManifestHash = computeStorageManifestHash(manifest);
  if (file.meta.storageManifestHash && recomputedManifestHash !== file.meta.storageManifestHash) {
    return {
      ok: false,
      error: 'BACKUP_STORAGE_MANIFEST_HASH_MISMATCH',
      detail: { expected: file.meta.storageManifestHash, recomputed: recomputedManifestHash },
    };
  }

  // 6. Per-Storage-object SHA-256 verify (parallel)
  // backup tree path = `${backupRefPrefix}/storage/${entry.path}`
  const backupPrefix = backupRef.replace(/\/backup\.json$/, '');
  const objectErrors = [];
  await Promise.all(manifest.map(async (entry) => {
    const objPath = `${backupPrefix}/storage/${entry.path}`;
    try {
      const [objExists] = await bucket.file(objPath).exists();
      if (!objExists) {
        objectErrors.push({ path: entry.path, error: 'STORAGE_OBJECT_MISSING' });
        return;
      }
      const [objBuf] = await bucket.file(objPath).download();
      const sha256 = createHash('sha256').update(objBuf).digest('hex');
      if (sha256 !== entry.sha256) {
        objectErrors.push({ path: entry.path, error: 'STORAGE_OBJECT_SHA256_MISMATCH', expected: entry.sha256, actual: sha256 });
      }
    } catch (e) {
      objectErrors.push({ path: entry.path, error: e.message });
    }
  }));
  if (objectErrors.length > 0) {
    return { ok: false, error: 'BACKUP_STORAGE_INTEGRITY_FAIL', detail: { objectErrors } };
  }

  return { ok: true, meta: file.meta, file };
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

  // Auth gate — verifyAdminOrPermissionToken returns null + writes 401/403 on
  // failure. Phase 24.0: accept admin claim OR customer_delete perm claim
  // (admin can delegate via /api/admin/users setPermission).
  const caller = await verifyAdminOrPermissionToken(req, res, 'customer_delete');
  if (!caller) return;

  // Defense in depth — re-check via the pure helper. Redundant in the happy
  // path now that verifyAdminOrPermissionToken accepts the perm claim, but
  // keeps the audit invariant explicit (any future evolution of the auth
  // helper still has to satisfy this gate).
  const claims = caller.decoded || caller.token || caller.claims || {};
  if (!assertHasDeletePermission(claims) && claims.admin !== true) {
    return res.status(403).json({ success: false, error: 'ไม่มีสิทธิ์ลบลูกค้า' });
  }

  const customerId = String(req.body?.customerId || '').trim();
  if (!customerId) {
    return res.status(400).json({ success: false, error: 'customerId required', field: 'customerId' });
  }

  // Phase 24.0 Issue #1 — action discriminator. action='preview' returns the
  // cascade counts WITHOUT deleting anything (no audit doc, no batch
  // commit). Default ('delete' or absent) preserves existing behavior.
  const action = String(req.body?.action || 'delete').trim();

  // V74 — Optional autoBackupRef (AV19 elevated mode). When provided on
  // action='delete', server verifies integrity BEFORE wipe. Pass-through
  // additive — Phase 24.0 callers without autoBackupRef still work but
  // skip the integrity gate.
  const autoBackupRef = req.body?.autoBackupRef ? String(req.body.autoBackupRef).trim() : '';

  if (action === 'preview') {
    try {
      const db = getAdminFirestore();
      const data = dataPath(db);
      const custRef = data.collection('be_customers').doc(customerId);
      const custSnap = await custRef.get();
      if (!custSnap.exists) {
        return res.status(404).json({ success: false, error: 'ลูกค้าถูกลบไปแล้ว หรือไม่พบในระบบ' });
      }
      const queryResults = await Promise.all(
        CUSTOMER_CASCADE_COLLECTIONS.map(name =>
          data.collection(name).where('customerId', '==', customerId).get(),
        ),
      );
      const cascadeCounts = {};
      CUSTOMER_CASCADE_COLLECTIONS.forEach((name, idx) => {
        cascadeCounts[COL_TO_RESPONSE_KEY[name]] = queryResults[idx].size;
      });
      // NOTE: preview branch is read-only (no batched writes, no audit doc).
      return res.status(200).json({
        success: true,
        customerId,
        cascadeCounts,
        exists: true,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err?.message || 'preview failed',
      });
    }
  }

  const authorizedBy = req.body?.authorizedBy;
  const authError = validateAuthorizedBy(authorizedBy);
  if (authError) {
    return res.status(400).json({ success: false, error: authError, field: 'authorizedBy' });
  }

  try {
    const db = getAdminFirestore();
    const data = dataPath(db);

    // Read customer doc (404 if missing).
    const custRef = data.collection('be_customers').doc(customerId);
    const custSnap = await custRef.get();
    if (!custSnap.exists) {
      return res.status(404).json({ success: false, error: 'ลูกค้าถูกลบไปแล้ว หรือไม่พบในระบบ' });
    }
    const customer = custSnap.data();
    const branchId = customer?.branchId || '';

    // Cross-validate authorizedBy IDs against be_staff/be_doctors at this
    // customer's branchId. Server-side check prevents client-side spoofing.
    const [staffSnap, doctorsSnap] = await Promise.all([
      data.collection('be_staff').get(),
      data.collection('be_doctors').get(),
    ]);
    const staffMap = new Map(staffSnap.docs.map(d => [String(d.id), d.data()]));
    const doctorMap = new Map(doctorsSnap.docs.map(d => [String(d.id), d.data()]));

    function inBranchRoster(map, id) {
      const rec = map.get(String(id));
      if (!rec) return false;
      // Universal-roster fallback: if the record has no branchIds[] (legacy
      // pre-Phase-BS), accept it. Branch-scoped records require this customer's
      // branchId in their branchIds[] array.
      const branches = Array.isArray(rec.branchIds) ? rec.branchIds : null;
      if (!branches) return true;
      return branches.includes(branchId);
    }

    // Phase 24.0-bis — single-authorizer validation. Cross-check ID against
    // BOTH staff + doctor rosters at customer.branchId; ID must exist in at
    // least one. Role-claim from client must match the source map (server
    // authority — admin can't fake "staff" if the ID belongs to a doctor).
    // Legacy 6-field shape is normalized to single-authorizer below before
    // validation; the legacy path checks staff (the primary authorizer).
    const canonicalAuth = normalizeAuthorizedBy(authorizedBy);
    if (!canonicalAuth) {
      return res.status(400).json({ success: false, error: 'authorizedBy required', field: 'authorizedBy' });
    }
    const authStaffMatch = inBranchRoster(staffMap, canonicalAuth.authorizerId);
    const authDoctorMatch = inBranchRoster(doctorMap, canonicalAuth.authorizerId);
    if (!authStaffMatch && !authDoctorMatch) {
      return res.status(400).json({
        success: false,
        error: `authorizerId "${canonicalAuth.authorizerId}" not in branch ${branchId} roster`,
        field: 'authorizedBy.authorizerId',
      });
    }
    // Server-authoritative role correction: if claim says 'staff' but ID is
    // a doctor (or vice-versa), correct silently to the actual source map.
    if (canonicalAuth.authorizerRole === 'staff' && !authStaffMatch) {
      canonicalAuth.authorizerRole = 'doctor';
    } else if (canonicalAuth.authorizerRole === 'doctor' && !authDoctorMatch) {
      canonicalAuth.authorizerRole = 'staff';
    }

    // V74 — AV19 elevated integrity gate. If autoBackupRef provided, verify
    // the backup file BEFORE any wipe. BLOCKs on any mismatch.
    let v74BackupMeta = null;
    if (autoBackupRef) {
      const bucket = getAdminBucket();
      const verifyResult = await verifyAutoBackupIntegrity({ bucket, backupRef: autoBackupRef });
      if (!verifyResult.ok) {
        return res.status(400).json({
          success: false,
          error: verifyResult.error,
          detail: verifyResult.detail,
          autoBackupRef,
        });
      }
      v74BackupMeta = verifyResult.meta;
    }

    // V74 — Query 16 cascade collections in parallel (Phase 24.0's 11 + CG's 5).
    const queryResults = await Promise.all(
      CUSTOMER_CASCADE_COLLECTIONS.map(name =>
        data.collection(name).where('customerId', '==', customerId).get(),
      ),
    );
    const cascadeCounts = {};
    const refsToDelete = [];
    CUSTOMER_CASCADE_COLLECTIONS.forEach((name, idx) => {
      const snap = queryResults[idx];
      cascadeCounts[COL_TO_RESPONSE_KEY[name]] = snap.size;
      snap.docs.forEach(d => refsToDelete.push(d.ref));
    });

    // V74 — Query 8 customer-attached subcollections (parallel) + collect refs.
    const subQueryResults = await Promise.all(
      T4_SUBCOLLECTIONS.map(subName =>
        data.collection('be_customers').doc(customerId).collection(subName).get(),
      ),
    );
    const subcollectionCounts = {};
    T4_SUBCOLLECTIONS.forEach((subName, idx) => {
      const snap = subQueryResults[idx];
      subcollectionCounts[subName] = snap.size;
      snap.docs.forEach(d => refsToDelete.push(d.ref));
    });

    // V74 — Query chat_conversations matching this customer (via Phase BS chat-link predicate).
    const chatSnap = await data.collection('chat_conversations').get();
    const chatMatching = chatSnap.docs.filter(d => matchCustomerChatPredicate({ ...d.data(), id: d.id }, customer));
    const chatConversationCount = chatMatching.length;
    chatMatching.forEach(d => refsToDelete.push(d.ref));

    // V74 — List Storage objects under be_customers/{customerId}/ for post-batch deletion.
    const v74Bucket = getAdminBucket();
    const [v74StorageFiles] = await v74Bucket.getFiles({ prefix: `${STORAGE_PREFIX_CUSTOMER}/${customerId}/` });
    const storageObjectCount = v74StorageFiles.length;

    // Build audit doc payload.
    const fullName = [
      customer?.prefix || '',
      customer?.firstname || '',
      customer?.lastname || '',
    ].filter(Boolean).join(' ').trim();
    const ts = Date.now();
    const rand = randomBytes(6).toString('hex');
    const auditId = `customer-delete-${customerId}-${ts}-${rand}`;
    const auditRef = data.collection('be_admin_audit').doc(auditId);

    // Phase 24.0 (post-review hardening) — bound the customerSnapshot size to
    // protect against hitting Firestore's 1MB doc cap, which would fail the
    // FINAL batch commit and roll back the entire cascade. Customers with
    // large gallery_upload[]/notes[]/medicalHistory blobs can produce raw
    // docs > 1MB. We retain the structural skeleton + safe-to-archive
    // identity + audit-relevant fields; the heavy fields are pruned with a
    // marker so the audit reader knows what was redacted.
    const HEAVY_KEYS = ['gallery_upload', 'profile_image', 'card_photo'];
    const SNAPSHOT_BYTE_LIMIT = 700 * 1024; // 700KB — leave headroom under 1MB cap
    function buildSnapshot(raw) {
      if (!raw || typeof raw !== 'object') return raw;
      const pruned = { ...raw };
      const redacted = [];
      for (const k of HEAVY_KEYS) {
        if (k in pruned) {
          const v = pruned[k];
          const len = Array.isArray(v) ? v.length : (typeof v === 'string' ? v.length : 0);
          if (len > 0) {
            pruned[k] = Array.isArray(v) ? `[REDACTED ${v.length} entries]` : '[REDACTED]';
            redacted.push(k);
          }
        }
      }
      // Defensive size check — if STILL > limit (e.g. very long notes / patientData),
      // wholesale-fallback to identity fields only + reason marker.
      try {
        const json = JSON.stringify(pruned);
        if (json.length > SNAPSHOT_BYTE_LIMIT) {
          return {
            __snapshot_pruned__: true,
            __snapshot_reason__: `oversize (${json.length} bytes, limit ${SNAPSHOT_BYTE_LIMIT})`,
            __snapshot_redacted_keys__: redacted,
            id: raw.id || customerId,
            hn_no: raw.hn_no,
            firstname: raw.firstname,
            lastname: raw.lastname,
            prefix: raw.prefix,
            branchId: raw.branchId,
            createdAt: raw.createdAt,
            createdBy: raw.createdBy,
            isManualEntry: raw.isManualEntry,
            citizen_id: raw.citizen_id,
            passport_id: raw.passport_id,
            telephone_number: raw.telephone_number,
          };
        }
      } catch { /* circular ref or non-serializable — fall through to pruned */ }
      if (redacted.length > 0) {
        pruned.__snapshot_redacted_keys__ = redacted;
      }
      return pruned;
    }

    const auditPayload = {
      type: 'customer-delete-cascade',
      customerId,
      customerHN: customer?.hn_no || customerId,
      customerFullName: fullName,
      branchId,
      origin: classifyOrigin(customer),
      // Phase 24.0-bis canonical shape — single authorizer + role.
      authorizedBy: {
        authorizerId: canonicalAuth.authorizerId,
        authorizerName: canonicalAuth.authorizerName,
        authorizerRole: canonicalAuth.authorizerRole,
      },
      performedBy: {
        uid: caller.uid || '',
        email: caller.email || '',
        displayName: caller.name || caller.displayName || '',
      },
      performedAt: new Date().toISOString(),
      cascadeCounts,
      // V74 — extended counts + integrity refs
      subcollectionCounts,
      chatConversationCount,
      storageObjectCount,
      autoBackupRef: autoBackupRef || null,
      autoBackupBodyHash: v74BackupMeta?.bodyHash || null,
      autoBackupStorageManifestHash: v74BackupMeta?.storageManifestHash || null,
      customerSnapshot: buildSnapshot(customer),
    };

    // Atomic delete + audit. Firestore batch is capped at 500 writes — chunk
    // to be safe (audit doc + customer doc + N cascade docs).
    const allWrites = [...refsToDelete, custRef];
    const totalDeletes = allWrites.length;
    let batchOp = db.batch();
    let inBatch = 0;
    for (const ref of allWrites) {
      batchOp.delete(ref);
      inBatch += 1;
      if (inBatch >= 450) {
        await batchOp.commit();
        batchOp = db.batch();
        inBatch = 0;
      }
    }
    // Audit doc goes in the FINAL batch with the customer-doc delete to
    // guarantee atomicity (if the audit fails, rollback the customer too).
    batchOp.set(auditRef, auditPayload);
    inBatch += 1;
    await batchOp.commit();

    // 2026-06-16 Part A — free the identity claim (customer doc now deleted; use
    // the in-memory snapshot's _identityClaimKey). Best-effort; does not fail the
    // delete on a claim hiccup.
    await freeIdentityClaimAdmin(db, data, customerId, customer);

    // V74 — Storage object deletion (separate from Firestore batch). Best-effort
    // parallel deletion. If any object fails, log + continue (the Firestore-side
    // cascade is committed; we don't want to roll back over Storage hiccup).
    const storageDeleteErrors = [];
    await Promise.all(v74StorageFiles.map(async (file) => {
      try {
        await file.delete();
      } catch (e) {
        storageDeleteErrors.push({ path: file.name, error: e.message });
      }
    }));

    return res.status(200).json({
      success: true,
      customerId,
      cascadeCounts,
      // V74 — extended response
      subcollectionCounts,
      chatConversationCount,
      storageObjectCount,
      storageDeleteErrors: storageDeleteErrors.length > 0 ? storageDeleteErrors : null,
      autoBackupRef: autoBackupRef || null,
      auditDocId: auditId,
      totalDeletes,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'delete-customer-cascade failed',
    });
  }
}
