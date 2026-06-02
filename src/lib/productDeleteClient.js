// ─── productDeleteClient — Guard + cascade product delete (2026-06-02) ──────
//
// Client-side Firestore cascade (mirrors customerDeleteClient — works on
// `npm run dev` Vite without /api/admin/* serverless). Fixes the orphan-stock
// bug: bare `deleteProduct` left orphan be_stock_batches (→ lingered in the
// stock-balance view) + be_courses refs. User decision = Guard + cascade.
//
// GUARDS (block, throw 409): product has stock remaining>0 OR is a course
// mainProductId. CASCADE: delete be_products doc + clear its batches
// (remaining==0 → delete per V144; remaining<0 → status='cancelled' UPDATE,
// since V144 keeps negatives client-undeletable) + pull from courseProducts[].
// NEVER touches be_treatments / be_sales / be_stock_movements (Rule O history).
// Best-effort audit (be_admin_audit has no product-delete rule exception →
// rule-deny is logged + skipped, like customerDeleteClient). AV176.

import { auth, db, appId } from '../firebase.js';
import {
  doc, getDoc, getDocs, collection, query, where, writeBatch, setDoc, serverTimestamp,
} from 'firebase/firestore';
import { evaluateProductDeleteGuards, planProductCascade, batchDeleteAction } from './productDeleteCascade.js';

const APP_ID_FALLBACK = 'loverclinic-opd-4c39b';
function basePath() { return ['artifacts', appId || APP_ID_FALLBACK, 'public', 'data']; }
const colRef = (name) => collection(db, ...basePath(), name);
const productRef = (id) => doc(db, ...basePath(), 'be_products', String(id));
const batchRef = (id) => doc(db, ...basePath(), 'be_stock_batches', String(id));
const courseRef = (id) => doc(db, ...basePath(), 'be_courses', String(id));
const groupRef = (id) => doc(db, ...basePath(), 'be_product_groups', String(id));
const auditRef = (id) => doc(db, ...basePath(), 'be_admin_audit', String(id));

function randHex(bytes = 5) {
  const arr = new Uint8Array(bytes);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(arr);
  else for (let i = 0; i < bytes; i += 1) arr[i] = Math.floor(Math.random() * 256);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

function makeError(userMessage, opts = {}) {
  const err = new Error(opts.message || userMessage);
  err.userMessage = userMessage;
  if (opts.status != null) err.status = opts.status;
  if (opts.blocked) err.blocked = true;
  if (opts.reasons) err.reasons = opts.reasons;
  return err;
}

async function requireAuth() {
  const user = auth?.currentUser;
  if (!user) throw makeError('ไม่ได้ login — กรุณาเข้าสู่ระบบใหม่', { status: 401 });
  try { await user.getIdToken(true); } catch (e) {
    throw makeError('ไม่สามารถ refresh token ได้ — ลอง re-login: ' + (e?.message || e), { status: 401 });
  }
  return user;
}

/** Resolve a be_products doc by id (preferred) or productId field. Returns
 * { id, data } or null. */
async function resolveProduct(productId) {
  const snap = await getDoc(productRef(productId));
  if (snap.exists()) return { id: snap.id, data: snap.data() };
  const byField = await getDocs(query(colRef('be_products'), where('productId', '==', productId)));
  if (!byField.empty) return { id: byField.docs[0].id, data: byField.docs[0].data() };
  return null;
}

// Inbound stock-op collections whose RECEIVE path calls _assertProductExists —
// a non-terminal op referencing the product would break if the product is gone.
// ⚠ Only be_stock_orders carries `branchId`. be_stock_transfers/_withdrawals key
// on sourceLocationId/destinationLocationId, be_central_stock_orders on
// centralWarehouseId — NONE has branchId. So those 3 are loaded UNFILTERED and
// filtered by product-reference + pending status in the guard (the prior
// `where branchId` query silently returned EMPTY → MISSED them — fixed 2026-06-02).
const BRANCH_KEYED_OP_COLLECTIONS = ['be_stock_orders'];
const UNFILTERED_OP_COLLECTIONS = ['be_stock_transfers', 'be_stock_withdrawals', 'be_central_stock_orders'];

/** Read the product's batches (branch+central — `where productId` is location-
 * agnostic) + its branch's courses + product groups (membership) + the inbound
 * stock ops (for the pending-op guard). Shared by preview + delete. */
async function loadCascadeInputs(effectivePid, branchId) {
  const byBranch = (name) => branchId
    ? getDocs(query(colRef(name), where('branchId', '==', branchId)))
    : getDocs(colRef(name));
  const [batchSnap, courseSnap, groupSnap, ...opSnaps] = await Promise.all([
    getDocs(query(colRef('be_stock_batches'), where('productId', '==', effectivePid))),
    byBranch('be_courses'),
    byBranch('be_product_groups'),
    ...BRANCH_KEYED_OP_COLLECTIONS.map(byBranch),
    ...UNFILTERED_OP_COLLECTIONS.map(name => getDocs(colRef(name))),
  ]);
  // V38/AV17 spread order — docId WINS over any stray `id` data field.
  const batches = batchSnap.docs.map(d => ({ ...d.data(), id: d.id }));
  const courses = courseSnap.docs.map(d => ({ ...d.data(), id: d.id }));
  const groups = groupSnap.docs.map(d => ({ ...d.data(), id: d.id }));
  const stockOps = opSnaps.flatMap(snap => snap.docs.map(d => ({ ...d.data(), id: d.id })));
  return { batches, courses, groups, stockOps };
}

/**
 * Preview — returns guard verdict + cascade counts WITHOUT writing.
 * @returns {Promise<{success, productId, productName, blocked, reasons, plan}>}
 */
export async function previewProductDelete({ productId }) {
  await requireAuth();
  const pid = String(productId || '').trim();
  if (!pid) throw makeError('productId required', { status: 400 });
  const prod = await resolveProduct(pid);
  if (!prod) throw makeError('ไม่พบสินค้า หรือถูกลบไปแล้ว', { status: 404 });
  const { batches, courses, groups, stockOps } = await loadCascadeInputs(prod.id, prod.data?.branchId || '');
  const guards = evaluateProductDeleteGuards({ productId: prod.id, batches, courses, stockOps });
  const plan = planProductCascade({ productId: prod.id, batches, courses, groups });
  return {
    success: true,
    productId: prod.id,
    productName: prod.data?.productName || prod.data?.name || '',
    blocked: guards.blocked,
    reasons: guards.reasons,
    plan: {
      batchesToDelete: plan.batches.filter(b => batchDeleteAction(b.remaining) === 'delete').length,
      batchesToCancel: plan.batches.filter(b => batchDeleteAction(b.remaining) === 'cancel').length,
      coursesToUpdate: plan.courseUpdates.length,
      groupsToUpdate: plan.groupUpdates.length,
    },
  };
}

/**
 * Guard + cascade delete. Throws makeError(blocked:true, status:409) when a
 * guard fails. On success returns the cascade counts.
 * @returns {Promise<{success, productId, batchesDeleted, batchesCancelled, coursesUpdated, auditDocId}>}
 */
export async function deleteProductWithCascade({ productId }) {
  const user = await requireAuth();
  const pid = String(productId || '').trim();
  if (!pid) throw makeError('productId required', { status: 400 });

  const prod = await resolveProduct(pid);
  if (!prod) throw makeError('ไม่พบสินค้า หรือถูกลบไปแล้ว', { status: 404 });
  const effectivePid = prod.id;
  const branchId = prod.data?.branchId || '';
  const productName = prod.data?.productName || prod.data?.name || '';

  const { batches, courses, groups, stockOps } = await loadCascadeInputs(effectivePid, branchId);

  const guards = evaluateProductDeleteGuards({ productId: effectivePid, batches, courses, stockOps });
  if (guards.blocked) {
    throw makeError(guards.reasons.map(r => r.message).join(' • '), {
      status: 409, blocked: true, reasons: guards.reasons,
    });
  }

  const plan = planProductCascade({ productId: effectivePid, batches, courses, groups });

  // Atomic cascade — chunk at 450 under the 500-write Firestore cap.
  let batch = writeBatch(db);
  let inBatch = 0;
  let batchesDeleted = 0, batchesCancelled = 0, coursesUpdated = 0, groupsUpdated = 0;
  const flush = async () => {
    if (inBatch >= 450) { await batch.commit(); batch = writeBatch(db); inBatch = 0; }
  };
  for (const b of plan.batches) {
    const action = batchDeleteAction(b.remaining);
    if (action === 'delete') { batch.delete(batchRef(b.batchId)); batchesDeleted += 1; }
    else { // 'cancel' — V144 keeps negative lots client-undeletable; cancel removes from view
      batch.update(batchRef(b.batchId), {
        status: 'cancelled',
        _cancelledByProductDeleteAt: serverTimestamp(),
        _cancelledByProductDeleteReason: 'product-deleted',
      });
      batchesCancelled += 1;
    }
    inBatch += 1; await flush();
  }
  for (const u of plan.courseUpdates) {
    batch.update(courseRef(u.courseId), { courseProducts: u.courseProducts });
    coursesUpdated += 1; inBatch += 1; await flush();
  }
  for (const u of plan.groupUpdates) {
    const patch = {};
    if (u.productIds !== undefined) patch.productIds = u.productIds;
    if (u.products !== undefined) patch.products = u.products;
    batch.update(groupRef(u.groupId), patch);
    groupsUpdated += 1; inBatch += 1; await flush();
  }
  batch.delete(productRef(effectivePid)); inBatch += 1;
  await batch.commit();

  // Best-effort audit (be_admin_audit has no product-delete-* rule exception →
  // rule-deny is expected client-side; log + continue, like customerDeleteClient).
  const auditId = `product-delete-cascade-${effectivePid}-${Date.now()}-${randHex(5)}`;
  let auditWritten = false;
  try {
    await setDoc(auditRef(auditId), {
      type: 'product-delete-cascade',
      productId: effectivePid,
      productName,
      branchId,
      batchesDeleted,
      batchesCancelled,
      coursesUpdated,
      groupsUpdated,
      removedCourseRefs: plan.courseUpdates.reduce((s, u) => s + u.removedCount, 0),
      removedGroupRefs: plan.groupUpdates.reduce((s, u) => s + u.removedCount, 0),
      performedBy: { uid: user.uid || '', email: user.email || '' },
      performedAt: new Date().toISOString(),
      performedVia: 'client-firestore',
    });
    auditWritten = true;
  } catch (e) {
    const msg = String(e?.code || e?.message || '');
    if (!/permission|insufficient/i.test(msg)) throw e; // unexpected — surface
    // eslint-disable-next-line no-console
    console.warn('[productDeleteClient] audit-doc write denied by rules — cascade succeeded, forensic trail skipped.');
  }

  return {
    success: true,
    productId: effectivePid,
    productName,
    batchesDeleted,
    batchesCancelled,
    coursesUpdated,
    groupsUpdated,
    auditDocId: auditWritten ? auditId : null,
  };
}
