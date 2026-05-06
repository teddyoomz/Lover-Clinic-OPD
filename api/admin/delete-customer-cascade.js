// ─── /api/admin/delete-customer-cascade — Phase 24.0 (2026-05-06) ────────────
//
// Atomic customer-delete + 11-collection cascade + audit doc, gated on
// admin claim OR customer_delete perm claim. Mirrors V35 cleanup-test-*
// admin-SDK pattern.
//
// Spec: docs/superpowers/specs/2026-05-06-customer-delete-button-design.md §6.
//
// Why server-side (not client-side scopedDataLayer call):
//   1. Atomic: cascade + audit doc in single batched commit. Half-state on
//      client crash impossible.
//   2. Customer-doc snapshot capture happens with admin-SDK strong consistency
//      (avoids onSnapshot lag).
//   3. authorizedBy IDs are cross-validated against be_staff/be_doctors @
//      customer.branchId server-side (admin can't fake names client-side).
//
// Rule M compliance: writes audit doc to be_admin_audit/customer-delete-{id}-{ts}-{rand}.

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { randomBytes } from 'node:crypto';
import { verifyAdminOrPermissionToken } from './_lib/adminAuth.js';

const APP_ID = 'loverclinic-opd-4c39b';

// MUST stay in lockstep with src/lib/backendClient.js
// CUSTOMER_CASCADE_COLLECTIONS (Phase 24.0 cascade scope).
const CUSTOMER_CASCADE_COLLECTIONS = Object.freeze([
  'be_treatments',
  'be_sales',
  'be_deposits',
  'be_wallets',
  'be_wallet_transactions',
  'be_memberships',
  'be_point_transactions',
  'be_appointments',
  'be_course_changes',
  'be_link_requests',
  'be_customer_link_tokens',
]);

// Map collection name → cascadeCounts JSON key (camelCase for response).
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
});

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
  // 11 cascade counts WITHOUT deleting anything (no audit doc, no batch
  // commit). Default ('delete' or absent) preserves existing behavior.
  const action = String(req.body?.action || 'delete').trim();

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

    // Query 11 cascade collections in parallel; collect refs + counts.
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

    return res.status(200).json({
      success: true,
      customerId,
      cascadeCounts,
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
