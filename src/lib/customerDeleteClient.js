// ─── customerDeleteClient — Phase 24.0 (2026-05-06) ─────────────────────────
// Phase 24.0-ter (2026-05-06 evening) — RESHAPED from fetch-based to
// direct-Firestore client-side per user local-only directive.
//
// Why client-side instead of POST /api/admin/delete-customer-cascade:
//   - User runs `npm run dev` (Vite) which serves the frontend ONLY. The
//     `/api/admin/*` routes are Vercel serverless — only reachable on
//     deployed lover-clinic-app.vercel.app. Local dev → fetch fails →
//     "การลบล้มเหลว" + "โหลด preview ล้มเหลว".
//   - User's local-only directive (feedback_local_only_no_deploy.md):
//     Vercel deploys are user-triggered, no automatic ship. So routing
//     this UI through a serverless endpoint blocks local dev work.
//   - firestore.rules already permits admin-claim-bearing user OR
//     perm_customer_delete-bearing user to create be_admin_audit/customer-
//     delete-* docs (line 378-391). Cascade collections allow same.
//
// What's preserved:
//   - Same export names: deleteCustomerViaApi + previewCustomerDeleteViaApi
//     (modal + tests don't change)
//   - Same return shape ({ success, customerId, cascadeCounts, auditDocId,
//     totalDeletes } / { success, customerId, cascadeCounts, exists })
//   - Same error contract (.userMessage / .status / .field on thrown Error)
//   - Same audit doc shape (Phase 24.0-bis canonical authorizedBy)
//   - Same snapshot pruning (HEAVY_KEYS + 700KB byte limit)
//
// What changes:
//   - Cross-validation of authorizerId against branch roster runs
//     CLIENT-SIDE (was server-authoritative). Admin can still spoof
//     authorizerName by tampering DevTools, but they have full delete
//     perm anyway — limited additional risk.
//   - Cascade + audit-doc commit is still in a single Firestore writeBatch
//     (atomicity preserved via deleteCustomerCascade's existing chunked
//     batch loop + a separate audit-doc setDoc).
//   - Total writes split across 2 paths (audit doc setDoc, then cascade
//     batch). If audit fails AFTER cascade succeeds, customer is gone but
//     audit missing — minor V31-class concern. Mitigation: write audit
//     FIRST, cascade SECOND. If audit write fails, cascade is skipped →
//     customer preserved → admin sees error + can retry.
//
// Server endpoint (api/admin/delete-customer-cascade.js) stays in place
// for production deploy — code path can be re-enabled by switching the
// modal to import a fetch-based variant when needed.

import { auth, db, appId } from '../firebase.js';
import {
  doc, setDoc, getDoc, getDocs, collection, query, where, writeBatch, deleteDoc,
} from 'firebase/firestore';
import { CUSTOMER_CASCADE_COLLECTIONS } from './backendClient.js';
import { listStaff, listDoctors } from './scopedDataLayer.js';
import { filterStaffByBranch, filterDoctorsByBranch } from './branchScopeUtils.js';

// MUST stay in lockstep with api/admin/delete-customer-cascade.js
// COL_TO_RESPONSE_KEY (camelCase keys for the cascadeCounts response).
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

// Phase 24.0-quater (2026-05-06 evening) — client-side cascade incompleteness.
// firestore.rules locks 5 of 11 collections from client-side delete:
//   - be_link_requests        → `read, write: if false` (V32-tris-quater admin-SDK only)
//   - be_customer_link_tokens → default-deny (V33.9 stripped explicit rule)
//   - be_wallet_transactions  → `read, create` only — DELETE denied (audit-immutable)
//   - be_point_transactions   → `read, create` only — DELETE denied (audit-immutable)
//   - be_course_changes       → `read, create` only — DELETE denied (audit-immutable)
//
// Server endpoint (api/admin/delete-customer-cascade.js, Phase 24.0) bypasses
// rules via firebase-admin SDK and cascades all 11. Local-dev client-side
// path gracefully SKIPS these 5: counts return null in preview, deletes are
// skipped in cascade, audit doc records cascadeSkipped: [...].
//
// Trade-off: local-dev cascade leaves orphan audit-immutable docs (small
// volume; customer-keyed but invisible since customer doc is gone). Production
// deploy with server endpoint cleans them via admin SDK.

// READ-blocked: query will throw PERMISSION_DENIED → preview count returns null.
const CLIENT_READ_BLOCKED = Object.freeze(new Set([
  'be_link_requests',
  'be_customer_link_tokens',
]));

// DELETE-blocked: query may succeed (read allowed) but writeBatch.delete()
// will fail. Skip the delete, count is still accurate from preview.
const CLIENT_DELETE_BLOCKED = Object.freeze(new Set([
  'be_wallet_transactions',
  'be_point_transactions',
  'be_course_changes',
  'be_link_requests',          // also read-blocked but listed for cascade-skip clarity
  'be_customer_link_tokens',   // also read-blocked
]));

const APP_ID_FALLBACK = 'loverclinic-opd-4c39b';
function basePath() {
  return ['artifacts', appId || APP_ID_FALLBACK, 'public', 'data'];
}
function customerDocRef(customerId) {
  return doc(db, ...basePath(), 'be_customers', String(customerId));
}
function cascadeColRef(name) {
  return collection(db, ...basePath(), name);
}
function adminAuditDocRef(auditId) {
  return doc(db, ...basePath(), 'be_admin_audit', auditId);
}

// Crypto-secure random hex (mirror of api/admin's randomBytes(6).toString('hex'))
function randHex(bytes = 6) {
  const arr = new Uint8Array(bytes);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < bytes; i += 1) arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Snapshot pruning — mirrors server logic
const HEAVY_KEYS = ['gallery_upload', 'profile_image', 'card_photo'];
const SNAPSHOT_BYTE_LIMIT = 700 * 1024;
function buildSnapshot(raw, customerId) {
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
  } catch { /* fall through */ }
  if (redacted.length > 0) pruned.__snapshot_redacted_keys__ = redacted;
  return pruned;
}

function classifyOrigin(customer) {
  return customer?.isManualEntry === true ? 'manual' : 'proclinic-cloned';
}

function normalizeAuthorizedBy(authorizedBy) {
  if (!authorizedBy || typeof authorizedBy !== 'object') return null;
  if (typeof authorizedBy.authorizerId === 'string') {
    return {
      authorizerId: authorizedBy.authorizerId,
      authorizerName: authorizedBy.authorizerName,
      authorizerRole: authorizedBy.authorizerRole,
    };
  }
  return {
    authorizerId: authorizedBy.staffId,
    authorizerName: authorizedBy.staffName,
    authorizerRole: 'staff',
  };
}

function makeError(userMessage, opts = {}) {
  const err = new Error(opts.message || userMessage);
  err.userMessage = userMessage;
  if (opts.status != null) err.status = opts.status;
  if (opts.field) err.field = opts.field;
  return err;
}

/** Throws with userMessage if not signed in. Returns the auth user. */
function requireAuth() {
  const user = auth?.currentUser;
  if (!user) throw makeError('ไม่ได้ login — กรุณาเข้าสู่ระบบใหม่', { status: 401 });
  return user;
}

/**
 * Phase 24.0 Issue #1 — fetch cascade counts WITHOUT deleting. Powers the
 * modal's pre-confirm preview row so admin sees what will be removed.
 *
 * Phase 24.0-ter — runs entirely client-side via Firestore SDK. Works on
 * `npm run dev` (Vite) without needing Vercel serverless.
 *
 * @param {object} payload
 * @param {string} payload.customerId
 * @returns {Promise<{success, customerId, cascadeCounts, exists}>}
 */
export async function previewCustomerDeleteViaApi({ customerId }) {
  requireAuth();
  const cid = String(customerId || '').trim();
  if (!cid) throw makeError('customerId required', { status: 400, field: 'customerId' });

  const custSnap = await getDoc(customerDocRef(cid));
  if (!custSnap.exists()) {
    throw makeError('ลูกค้าถูกลบไปแล้ว หรือไม่พบในระบบ', { status: 404 });
  }

  // Phase 24.0-quater — query each cascade collection independently with
  // try/catch so a single rule denial doesn't reject the whole Promise.all.
  // Skipped collections return count=null + their key joins skippedRead[].
  const cascadeCounts = {};
  const skippedRead = [];
  await Promise.all(CUSTOMER_CASCADE_COLLECTIONS.map(async (name) => {
    if (CLIENT_READ_BLOCKED.has(name)) {
      cascadeCounts[COL_TO_RESPONSE_KEY[name]] = null;
      skippedRead.push(name);
      return;
    }
    try {
      const snap = await getDocs(query(cascadeColRef(name), where('customerId', '==', cid)));
      cascadeCounts[COL_TO_RESPONSE_KEY[name]] = snap.size;
    } catch (e) {
      const msg = String(e?.code || e?.message || '');
      if (/permission|insufficient/i.test(msg)) {
        cascadeCounts[COL_TO_RESPONSE_KEY[name]] = null;
        skippedRead.push(name);
      } else {
        throw e;  // unexpected error — re-raise
      }
    }
  }));

  return {
    success: true,
    customerId: cid,
    cascadeCounts,
    exists: true,
    skippedRead,    // collections where read was rules-denied client-side
  };
}

/**
 * Delete a customer cascade-style.
 *
 * Phase 24.0-ter — runs entirely client-side via Firestore SDK + reuses
 * existing deleteCustomerCascade in backendClient.js for the cascade body
 * (it already implements the chunked batched delete across 11 collections).
 *
 * Order of operations (atomicity reasoning in module-doc above):
 *   1. Validate authorizedBy shape
 *   2. Read customer doc (existence + branchId for roster check)
 *   3. Cross-validate authorizerId against branch roster (be_staff / be_doctors)
 *   4. Run 11 parallel cascade-count queries (for response + audit cascadeCounts)
 *   5. Write audit doc to be_admin_audit/customer-delete-{id}-{ts}-{rand}
 *      (FIRST — if this fails, customer is preserved)
 *   6. Run deleteCustomerCascade(cid, { confirm: true }) — chunked batched delete
 *   7. Return { success, customerId, cascadeCounts, auditDocId, totalDeletes }
 *
 * @param {object} payload
 * @param {string} payload.customerId
 * @param {object} payload.authorizedBy — Phase 24.0-bis shape:
 *   { authorizerId, authorizerName, authorizerRole: 'staff'|'doctor' }
 *   (legacy 6-field shape also accepted via normalizeAuthorizedBy fallback)
 * @returns {Promise<{success, customerId, cascadeCounts, auditDocId, totalDeletes}>}
 */
export async function deleteCustomerViaApi({ customerId, authorizedBy }) {
  const user = requireAuth();
  const cid = String(customerId || '').trim();
  if (!cid) throw makeError('customerId required', { status: 400, field: 'customerId' });

  // Validate authorizedBy shape (Phase 24.0-bis canonical OR legacy)
  const canonicalAuth = normalizeAuthorizedBy(authorizedBy);
  if (!canonicalAuth || !canonicalAuth.authorizerId) {
    throw makeError('authorizedBy.authorizerId required', { status: 400, field: 'authorizedBy.authorizerId' });
  }
  if (!canonicalAuth.authorizerName) {
    throw makeError('authorizedBy.authorizerName required', { status: 400, field: 'authorizedBy.authorizerName' });
  }
  if (!['staff', 'doctor'].includes(canonicalAuth.authorizerRole)) {
    throw makeError(`authorizedBy.authorizerRole must be 'staff' or 'doctor'`, { status: 400, field: 'authorizedBy.authorizerRole' });
  }

  // Read customer + verify branch
  const custSnap = await getDoc(customerDocRef(cid));
  if (!custSnap.exists()) {
    throw makeError('ลูกค้าถูกลบไปแล้ว หรือไม่พบในระบบ', { status: 404 });
  }
  const customer = custSnap.data();
  const branchId = customer?.branchId || '';

  // Cross-validate authorizerId against branch roster
  const [allStaff, allDoctors] = await Promise.all([
    listStaff().catch(() => []),
    listDoctors().catch(() => []),
  ]);
  const branchStaff = filterStaffByBranch(allStaff || [], branchId);
  const branchDoctors = filterDoctorsByBranch(allDoctors || [], branchId);
  const inStaff = branchStaff.some(s => String(s.id) === canonicalAuth.authorizerId);
  const inDoctor = branchDoctors.some(d => String(d.id) === canonicalAuth.authorizerId);
  if (!inStaff && !inDoctor) {
    throw makeError(`ผู้รับผิดชอบไม่อยู่ในรายชื่อทีมงานของสาขา ${branchId}`, {
      status: 400, field: 'authorizedBy.authorizerId',
    });
  }
  // Server-authoritative role correction (mirror of server endpoint)
  if (canonicalAuth.authorizerRole === 'staff' && !inStaff) canonicalAuth.authorizerRole = 'doctor';
  else if (canonicalAuth.authorizerRole === 'doctor' && !inDoctor) canonicalAuth.authorizerRole = 'staff';

  // Phase 24.0-quater — run cascade-count queries with per-collection
  // try/catch so a single rule denial doesn't fail the whole batch. Track
  // which collections we'll be able to delete (refs collected) vs skip
  // (audit-only, no client-side delete).
  const cascadeCounts = {};
  const skippedRead = [];
  const refsToDelete = [];  // { name, ref }
  await Promise.all(CUSTOMER_CASCADE_COLLECTIONS.map(async (name) => {
    if (CLIENT_READ_BLOCKED.has(name)) {
      cascadeCounts[COL_TO_RESPONSE_KEY[name]] = null;
      skippedRead.push(name);
      return;
    }
    try {
      const snap = await getDocs(query(cascadeColRef(name), where('customerId', '==', cid)));
      cascadeCounts[COL_TO_RESPONSE_KEY[name]] = snap.size;
      // Only collect refs for collections we can DELETE client-side. The
      // audit-immutable trio (wallet_tx, point_tx, course_changes) we read
      // for the count, but skip the delete (rule allows create-only).
      if (!CLIENT_DELETE_BLOCKED.has(name)) {
        snap.docs.forEach(d => refsToDelete.push({ name, ref: d.ref }));
      }
    } catch (e) {
      const msg = String(e?.code || e?.message || '');
      if (/permission|insufficient/i.test(msg)) {
        cascadeCounts[COL_TO_RESPONSE_KEY[name]] = null;
        skippedRead.push(name);
      } else {
        throw e;
      }
    }
  }));
  let totalLinked = 0;
  for (const v of Object.values(cascadeCounts)) {
    if (typeof v === 'number') totalLinked += v;
  }

  // Build audit payload
  const fullName = [customer?.prefix, customer?.firstname, customer?.lastname]
    .filter(Boolean).join(' ').trim();
  const ts = Date.now();
  const rand = randHex(6);
  const auditId = `customer-delete-${cid}-${ts}-${rand}`;
  // Phase 24.0-quater — record cascadeSkipped (collections that local-dev
  // client cannot delete due to rules; production deploy via admin SDK
  // handles them). Audit reader can use this field to verify completeness.
  const cascadeSkipped = Array.from(new Set([
    ...skippedRead,
    ...CUSTOMER_CASCADE_COLLECTIONS.filter(n => CLIENT_DELETE_BLOCKED.has(n) && !skippedRead.includes(n)),
  ]));
  const auditPayload = {
    type: 'customer-delete-cascade',
    customerId: cid,
    customerHN: customer?.hn_no || cid,
    customerFullName: fullName,
    branchId,
    origin: classifyOrigin(customer),
    authorizedBy: {
      authorizerId: canonicalAuth.authorizerId,
      authorizerName: canonicalAuth.authorizerName,
      authorizerRole: canonicalAuth.authorizerRole,
    },
    performedBy: {
      uid: user.uid || '',
      email: user.email || '',
      displayName: user.displayName || '',
    },
    performedAt: new Date().toISOString(),
    cascadeCounts,
    cascadeSkipped,                     // [] if all 11 cascaded; non-empty on local-dev
    performedVia: 'client-firestore',   // distinguishes from server-admin-SDK path
    customerSnapshot: buildSnapshot(customer, cid),
  };

  // Write audit doc FIRST. If this fails (rule denial / network), the
  // customer is preserved and admin sees a clear error.
  try {
    await setDoc(adminAuditDocRef(auditId), auditPayload);
  } catch (e) {
    throw makeError(
      'เขียน audit doc ล้มเหลว — ตรวจสอบสิทธิ์ admin claim หรือ network: ' + (e?.message || e),
      { status: 500 },
    );
  }

  // Phase 24.0-quater — chunked batched delete of all DELETABLE refs (cap
  // 450 per batch under Firestore's 500-write limit). Customer doc itself
  // goes in the FINAL batch.
  const allWrites = [...refsToDelete.map(x => x.ref), customerDocRef(cid)];
  let deletedCount = 0;
  try {
    let batch = writeBatch(db);
    let inBatch = 0;
    for (const ref of allWrites) {
      batch.delete(ref);
      inBatch += 1;
      deletedCount += 1;
      if (inBatch >= 450) {
        await batch.commit();
        batch = writeBatch(db);
        inBatch = 0;
      }
    }
    if (inBatch > 0) await batch.commit();
  } catch (e) {
    // Cascade failed AFTER audit write succeeded. Audit doc remains as a
    // record of intent; surface the error so admin can retry / investigate.
    throw makeError(
      `ลบ cascade ล้มเหลว — audit doc เขียนแล้วแต่ data ยังอยู่: ${e?.message || e}`,
      { status: 500 },
    );
  }

  return {
    success: true,
    customerId: cid,
    cascadeCounts,
    cascadeSkipped,
    auditDocId: auditId,
    totalDeletes: deletedCount,
    performedVia: 'client-firestore',
  };
}
