// ─── Backend Client — Firestore CRUD for be_* collections ───────────────────
// One-way data store: cloned from ProClinic, never writes back.
// Schema matches frontend patientData format for future migration.

import { db, appId } from '../firebase.js';
import { doc, setDoc, getDoc, getDocs, collection, query, where, updateDoc, deleteDoc, orderBy, writeBatch, runTransaction, onSnapshot } from 'firebase/firestore';

// ─── Base path ──────────────────────────────────────────────────────────────
const basePath = () => ['artifacts', appId, 'public', 'data'];

const customersCol = () => collection(db, ...basePath(), 'be_customers');
const customerDoc = (id) => doc(db, ...basePath(), 'be_customers', String(id));
const treatmentsCol = () => collection(db, ...basePath(), 'be_treatments');
const treatmentDoc = (id) => doc(db, ...basePath(), 'be_treatments', String(id));

// ─── Customer CRUD ──────────────────────────────────────────────────────────

/** Check if customer already exists in be_customers */
export async function customerExists(proClinicId) {
  const snap = await getDoc(customerDoc(proClinicId));
  return snap.exists();
}

/** Get single customer from be_customers */
export async function getCustomer(proClinicId) {
  const snap = await getDoc(customerDoc(proClinicId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/** Get all customers from be_customers (sorted by clonedAt desc) */
export async function getAllCustomers() {
  const snap = await getDocs(customersCol());
  const customers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  // Sort by clonedAt descending (newest first)
  customers.sort((a, b) => {
    const tA = a.clonedAt || '';
    const tB = b.clonedAt || '';
    return tB.localeCompare(tA);
  });
  return customers;
}

/**
 * Save/overwrite customer to be_customers.
 *
 * PV1-PV2 (Thai PDPA 2562): every customer doc carries a `consent` block.
 * Defaults both flags to `false` — Phase 9 marketing MUST set `marketing:
 * true` via an explicit UI opt-in before sending any promotional message.
 * `healthData: true` is required by PDPA §26 before processing sensitive
 * data (vitals, diagnosis). Existing customers imported from ProClinic get
 * the defaults; the admin needs to re-confirm via a one-time consent prompt.
 */
export async function saveCustomer(proClinicId, data, opts = {}) {
  const safe = data && typeof data === 'object' ? data : {};
  const withConsent = {
    ...safe,
    // PV1/PV2 consent block last so it can't be stomped by `...safe` above.
    consent: { marketing: false, healthData: false, ...(safe.consent || {}) },
  };

  // Phase 12.3: normalize shape on every save; strict-validate only when
  // caller opts in (UI edit path). CloneTab imports opt out to avoid
  // blocking recovery when ProClinic returned partial rows.
  const { normalizeCustomer, validateCustomer } = await import('./customerValidation.js');
  const normalized = normalizeCustomer(withConsent);
  if (opts.strict) {
    const fail = validateCustomer(normalized, { strict: true });
    if (fail) {
      const [, msg] = fail;
      throw new Error(msg);
    }
  }
  await setDoc(customerDoc(proClinicId), normalized, { merge: false });
}

/** Update specific fields on be_customers doc */
export async function updateCustomer(proClinicId, fields) {
  await updateDoc(customerDoc(proClinicId), fields);
}

/**
 * CL1: find customers whose doc has `field == value`, optionally excluding
 * a specific proClinicId (used by cloneOrchestrator to detect duplicate HN
 * /phone/national-ID on a NEW clone — the customer being cloned is
 * excluded so we don't flag the doc against itself on re-sync).
 * Returns the matching docs (id + proClinicId only) or [] on failure.
 */
export async function findCustomersByField(field, value, excludeProClinicId = null) {
  if (!field || !value) return [];
  try {
    const snap = await getDocs(query(customersCol(), where(field, '==', value)));
    return snap.docs
      .map(d => ({ id: d.id, proClinicId: d.data().proClinicId }))
      .filter(r => !excludeProClinicId || String(r.proClinicId) !== String(excludeProClinicId));
  } catch (e) {
    // Missing Firestore index will throw — safe fallback returns empty so
    // the clone proceeds; the duplicate check is advisory, not blocking.
    return [];
  }
}

/**
 * R11: delete a customer and ALL of their linked records in a single
 * batched write. Firestore has no FK enforcement, so deleting the
 * customer doc alone orphans treatments / sales / deposits / wallets /
 * memberships / appointments / wallet-tx / point-tx. This function is
 * gated on explicit caller intent: no UI path invokes it today (hard
 * delete is intentionally not exposed), so behaviour for existing flows
 * is unchanged. Added now so any future admin / PDPA-erasure caller
 * can't accidentally half-delete.
 *
 * Stock movements (be_stock_movements) and wallet-tx/point-tx logs ARE
 * deleted here as part of the erasure. That's intentional for PDPA
 * right-to-erasure; do NOT use this function for normal "cancel" or
 * "soft delete" operations.
 */
export async function deleteCustomerCascade(proClinicId, opts = {}) {
  const cid = String(proClinicId);
  if (!cid) throw new Error('proClinicId required');
  if (!opts.confirm) {
    throw new Error('deleteCustomerCascade requires opts.confirm=true (destructive)');
  }
  const cols = [
    treatmentsCol(), salesCol(), depositsCol(), walletsCol(),
    walletTxCol(), membershipsCol(), pointTxCol(), appointmentsCol(),
  ];
  const docs = [];
  for (const col of cols) {
    try {
      const snap = await getDocs(query(col, where('customerId', '==', cid)));
      for (const d of snap.docs) docs.push(d.ref);
    } catch (e) {
      console.error('[deleteCustomerCascade] query failed for', col.path, e);
      throw e;
    }
  }
  // Firestore batch is capped at 500 writes — chunk just in case.
  for (let i = 0; i < docs.length; i += 450) {
    const batch = writeBatch(db);
    const chunk = docs.slice(i, i + 450);
    for (const ref of chunk) batch.delete(ref);
    if (i + 450 >= docs.length) batch.delete(customerDoc(cid));
    await batch.commit();
  }
  if (docs.length === 0) {
    // Nothing linked — just delete the customer doc.
    await deleteDoc(customerDoc(cid));
  }
  return { success: true, deletedLinked: docs.length };
}

// ─── Treatment CRUD ─────────────────────────────────────────────────────────

/** Save single treatment to be_treatments */
export async function saveTreatment(treatmentId, data) {
  await setDoc(treatmentDoc(treatmentId), data, { merge: false });
}

/** Get all treatments for a customer (by customerId field) */
export async function getCustomerTreatments(customerId) {
  const q = query(treatmentsCol(), where('customerId', '==', String(customerId)));
  const snap = await getDocs(q);
  const treatments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  // Sort by treatment date descending
  treatments.sort((a, b) => {
    const dA = a.detail?.treatmentDate || '';
    const dB = b.detail?.treatmentDate || '';
    return dB.localeCompare(dA);
  });
  return treatments;
}

/**
 * Real-time listener variant of `getCustomerTreatments`. Returns an
 * unsubscribe function. Fires `onChange(treatments)` immediately with the
 * current state, then again every time any matching doc is written.
 *
 * Phase 14.7.G (2026-04-26) — added after user reported timeline modal
 * showing stale images: "ปุ่ม ดูไทม์ไลน์ ไม่ real time refresh รูปที่เพิ่ง
 * edit … ต้องกด f5 refresh ก่อนถึงแสดงผล". The one-shot getCustomer-
 * Treatments only refetched when `customer.treatmentCount` changed — image-
 * only edits don't bump the count, so the dep array missed the update.
 * Switching to onSnapshot makes `treatments[]` live; both the inline card
 * and the timeline modal see new images within ~1s of save.
 *
 * @param {string} customerId
 * @param {(treatments: Array) => void} onChange
 * @param {(err: Error) => void} [onError]
 * @returns {() => void} unsubscribe
 */
export function listenToCustomerTreatments(customerId, onChange, onError) {
  const q = query(treatmentsCol(), where('customerId', '==', String(customerId)));
  return onSnapshot(q, (snap) => {
    const treatments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    treatments.sort((a, b) => {
      const dA = a.detail?.treatmentDate || '';
      const dB = b.detail?.treatmentDate || '';
      return dB.localeCompare(dA);
    });
    onChange(treatments);
  }, onError);
}

/** Get single treatment from be_treatments */
export async function getTreatment(treatmentId) {
  const snap = await getDoc(treatmentDoc(treatmentId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/** Create a new backend-native treatment (not cloned from ProClinic) */
export async function createBackendTreatment(customerId, detail) {
  const treatmentId = `BT-${Date.now()}`;
  const now = new Date().toISOString();
  await setDoc(treatmentDoc(treatmentId), {
    treatmentId,
    customerId: String(customerId),
    detail: { ...detail, createdBy: 'backend', createdAt: now },
    createdBy: 'backend',
    createdAt: now,
  });
  return { treatmentId, success: true };
}

/** Update an existing backend treatment */
export async function updateBackendTreatment(treatmentId, detail) {
  await updateDoc(treatmentDoc(treatmentId), {
    detail,
    updatedAt: new Date().toISOString(),
  });
  return { success: true };
}

/**
 * Phase 12.2b follow-up (2026-04-25): link a freshly-created auto-sale
 * back to its originating treatment. Writes BOTH top-level
 * `linkedSaleId` (where `_clearLinkedTreatmentsHasSale` queries) AND
 * `detail.linkedSaleId` (where `dfPayoutAggregator` reads). Without
 * this helper, TreatmentFormPage's auto-sale flow never stamped the
 * linkage → DF report couldn't match treatments to sales → the
 * treatment's dfEntries never contributed and the report showed ฿0
 * (user-reported bug "ค่ามือหมอที่คิด ไม่ได้เชื่อมกับหน้ารายงาน DF").
 *
 * Pass `saleId=null` to clear the linkage (called by
 * `_clearLinkedTreatmentsHasSale` + delete/cancel cascade).
 *
 * @param {string} treatmentId
 * @param {string|null} saleId
 */
export async function setTreatmentLinkedSaleId(treatmentId, saleId) {
  const id = saleId == null ? null : String(saleId);
  await updateDoc(treatmentDoc(treatmentId), {
    linkedSaleId: id,
    'detail.linkedSaleId': id,
    'detail.hasSale': id != null,
    updatedAt: new Date().toISOString(),
  });
  return { success: true };
}

/**
 * Delete a backend treatment.
 *
 * Business rule (2026-04-19, user directive): treatment delete is
 * INTENTIONALLY a partial-rollback, not a full undo:
 *   - Course-credit USAGES are refunded by the caller (BackendDashboard
 *     onDeleteTreatment wraps this via reverseCourseDeduction)
 *   - Physical stock (consumables / treatmentItems / take-home meds)
 *     IS NOT REVERSED — the items were used; treating "delete treatment"
 *     as "stuff is back on the shelf" lies about reality. The user must
 *     go to "การขาย" → cancel/delete the linked sale to put product
 *     stock back. That's where the full reversal cascade lives.
 *   - Linked sale doc + its money flows (deposit, wallet, points) are
 *     untouched here. See BackendDashboard.onDeleteTreatment for the
 *     business-rule comment.
 *
 * Edit-treatment is different: TreatmentFormPage.handleSubmit explicitly
 * calls reverseStockForTreatment BEFORE re-deducting the new state. That
 * path stays correct because edit replaces the treatment in-place.
 */
export async function deleteBackendTreatment(treatmentId) {
  await deleteDoc(treatmentDoc(treatmentId));
  return { success: true };
}

/** Rebuild treatmentSummary on customer doc after create/update/delete */
export async function rebuildTreatmentSummary(customerId) {
  const treatments = await getCustomerTreatments(customerId);
  const summary = treatments.map(t => ({
    id: t.treatmentId || t.id,
    date: t.detail?.treatmentDate || '',
    doctor: t.detail?.doctorName || '',
    assistants: (t.detail?.assistants || t.detail?.assistantIds || []).map(a => typeof a === 'string' ? a : a.name || ''),
    branch: t.detail?.branch || '',
    cc: t.detail?.symptoms || '',
    dx: t.detail?.diagnosis || '',
    createdBy: t.createdBy || 'cloned',
  }));
  await updateCustomer(customerId, {
    treatmentSummary: summary,
    treatmentCount: summary.length,
  });
}

// ─── Course Deduction ─────────────────────────────────────────────────────

import { deductQty, reverseQty, addRemaining as addRemainingQty, buildQtyString, formatQtyString } from './courseUtils.js';

/**
 * Deduct course items after treatment save.
 *
 * Resolution order per deduction:
 *   1. If `courseIndex` is a valid number AND the entry at that index still matches
 *      name+product (safety check against stale data), deduct from it first. This is
 *      the "exact targeting" path — the UI lets users pick a specific purchase row,
 *      so the save should hit THAT row, not a FIFO match among duplicates.
 *   2. Any leftover amount (entry missing/insufficient) falls back to iterating by
 *      name+product — oldest-first by default, newest-first when `preferNewest`.
 *
 * @param {string} customerId - proClinicId
 * @param {Array<{courseIndex?: number, deductQty: number, courseName?: string, productName?: string}>} deductions
 * @param {{preferNewest?: boolean}} [opts] — when `preferNewest: true`, the FALLBACK
 *        iteration goes last→first. Useful for purchased-in-session rows where the
 *        newly-assigned entry sits at the end of the array.
 */
export async function deductCourseItems(customerId, deductions, opts = {}) {
  if (!deductions?.length) return [];
  const snap = await getDoc(customerDoc(customerId));
  if (!snap.exists()) throw new Error('Customer not found');
  const courses = [...(snap.data().courses || [])];
  const { parseQtyString, formatQtyString } = await import('./courseUtils.js');
  const preferNewest = !!opts?.preferNewest;

  const matchesDed = (c, d) => {
    const nameMatch = d.courseName ? c.name === d.courseName : true;
    const productMatch = d.productName ? (c.product || c.name) === d.productName : true;
    return nameMatch && productMatch;
  };

  // Phase 12.2b follow-up (2026-04-24): for "เหมาตามจริง" courses the
  // notion of "remaining" doesn't apply — one treatment = course fully
  // consumed, regardless of what qty the doctor entered for the actual
  // stock deduction. Zero out the course entry so it moves to history
  // (customer's คอร์สคงเหลือ filters remaining>0 only). Skip the
  // "คอร์สคงเหลือไม่พอ" throw that would otherwise fire because
  // deductQty (driven by real product usage, e.g. 100 U) is much larger
  // than the sentinel "1/1 คอร์ส" qty we assigned.
  const consumeRealQty = (i) => {
    const c = courses[i];
    const parsed = parseQtyString(c.qty);
    const total = parsed.total > 0 ? parsed.total : 1;
    const unit = parsed.unit || 'ครั้ง';
    courses[i] = { ...c, qty: formatQtyString(0, total, unit) };
  };

  for (const d of deductions) {
    let remaining = d.deductQty || 1;

    // Step 1: exact-index targeting
    if (typeof d.courseIndex === 'number' && d.courseIndex >= 0 && d.courseIndex < courses.length) {
      const c = courses[d.courseIndex];
      if (matchesDed(c, d)) {
        // Fill-later short-circuit: zero the entry + skip normal loop.
        if (c.courseType === 'เหมาตามจริง') {
          consumeRealQty(d.courseIndex);
          continue;
        }
        // Phase 12.2b follow-up (2026-04-25): buffet = unlimited use
        // until date-expiry. Stock still decrements in deductStockForTreatment
        // via the separate stock path; HERE we skip the qty decrement so
        // the course stays in "กำลังใช้งาน" forever.
        if (c.courseType === 'บุฟเฟต์') {
          continue;
        }
        const parsed = parseQtyString(c.qty);
        if (parsed.remaining > 0) {
          const toDeduct = Math.min(remaining, parsed.remaining);
          courses[d.courseIndex] = { ...c, qty: deductQty(c.qty, toDeduct) };
          remaining -= toDeduct;
        }
      }
    }

    // Step 2: fallback iteration (name+product match) for any leftover amount
    if (remaining > 0) {
      const order = preferNewest
        ? Array.from({ length: courses.length }, (_, i) => courses.length - 1 - i)
        : Array.from({ length: courses.length }, (_, i) => i);
      // Fill-later / buffet fallback: look for a matching special-type
      // entry FIRST in the preferred order; if found, handle it (consume
      // for fill-later, no-op for buffet) and skip the normal deduction.
      for (const i of order) {
        if (i === d.courseIndex) continue;
        const c = courses[i];
        if (!matchesDed(c, d)) continue;
        if (c.courseType === 'เหมาตามจริง') {
          consumeRealQty(i);
          remaining = 0;
          break;
        }
        if (c.courseType === 'บุฟเฟต์') {
          remaining = 0;
          break;
        }
      }
    }
    if (remaining > 0) {
      const order = preferNewest
        ? Array.from({ length: courses.length }, (_, i) => courses.length - 1 - i)
        : Array.from({ length: courses.length }, (_, i) => i);
      for (const i of order) {
        if (remaining <= 0) break;
        if (i === d.courseIndex) continue; // already handled in Step 1
        const c = courses[i];
        if (!matchesDed(c, d)) continue;
        if (c.courseType === 'เหมาตามจริง') continue; // already handled above
        if (c.courseType === 'บุฟเฟต์') continue; // already handled above
        const parsed = parseQtyString(c.qty);
        if (parsed.remaining <= 0) continue;
        const toDeduct = Math.min(remaining, parsed.remaining);
        courses[i] = { ...c, qty: deductQty(c.qty, toDeduct) };
        remaining -= toDeduct;
      }
    }

    if (remaining > 0) {
      throw new Error(`คอร์สคงเหลือไม่พอ: ${d.productName || d.courseName} ต้องการตัด ${d.deductQty} เหลือตัดไม่ได้อีก ${remaining}`);
    }
  }

  await updateCustomer(customerId, { courses });
  return courses;
}

/**
 * Reverse course deduction (on edit/delete treatment).
 *
 * Resolution order per entry:
 *   1. `courseIndex` — if provided and the entry at that index still matches
 *      name+product, restore there (exact targeting, mirrors `deductCourseItems`).
 *   2. Otherwise name+product lookup — oldest-first by default,
 *      newest-first when `preferNewest` (for purchased-in-session reversals).
 *
 * @param {string} customerId
 * @param {Array<{courseIndex?: number, deductQty: number, courseName?: string, productName?: string}>} deductions
 * @param {{preferNewest?: boolean}} [opts]
 */
export async function reverseCourseDeduction(customerId, deductions, opts = {}) {
  if (!deductions?.length) return [];
  const snap = await getDoc(customerDoc(customerId));
  if (!snap.exists()) throw new Error('Customer not found');
  const courses = [...(snap.data().courses || [])];
  const preferNewest = !!opts?.preferNewest;

  const matchesDed = (c, d) => {
    const nameMatch = d.courseName ? c.name === d.courseName : true;
    const productMatch = d.productName ? (c.product || c.name) === d.productName : true;
    return nameMatch && productMatch;
  };

  for (const d of deductions) {
    let idx = -1;

    // Step 1: exact-index targeting (preferred — survives name collisions)
    if (typeof d.courseIndex === 'number' && d.courseIndex >= 0 && d.courseIndex < courses.length) {
      if (matchesDed(courses[d.courseIndex], d)) idx = d.courseIndex;
    }

    // Step 2: name+product fallback
    if (idx < 0 && d.courseName) {
      if (preferNewest) {
        for (let i = courses.length - 1; i >= 0; i--) {
          if (matchesDed(courses[i], d)) { idx = i; break; }
        }
      } else {
        idx = courses.findIndex(c => matchesDed(c, d));
      }
    }

    if (idx < 0 || idx >= courses.length) continue;
    courses[idx] = { ...courses[idx], qty: reverseQty(courses[idx].qty, d.deductQty || 1) };
  }

  await updateCustomer(customerId, { courses });
  return courses;
}

/**
 * Admin: add remaining qty to a course (increases both remaining AND total).
 * @param {string} customerId
 * @param {number} courseIndex
 * @param {number} addQty
 */
export async function addCourseRemainingQty(customerId, courseIndex, addQty) {
  const snap = await getDoc(customerDoc(customerId));
  if (!snap.exists()) throw new Error('Customer not found');
  const courses = [...(snap.data().courses || [])];
  if (courseIndex < 0 || courseIndex >= courses.length) throw new Error('Invalid course index');
  courses[courseIndex] = { ...courses[courseIndex], qty: addRemainingQty(courses[courseIndex].qty, addQty) };
  await updateCustomer(customerId, { courses });
  return courses[courseIndex];
}

// ─── Master Course CRUD (Phase 6.3) ──────────────────────────────────────

/** Create a new master course template */
export async function createMasterCourse(data) {
  const courseId = `MC-${Date.now()}`;
  const now = new Date().toISOString();
  const ref = doc(db, ...basePath(), 'master_data', 'courses', 'items', courseId);
  await setDoc(ref, {
    ...data,
    id: courseId,
    _createdBy: 'backend',
    _createdAt: now,
    _syncedAt: now,
  });
  return { courseId, success: true };
}

/** Update an existing master course */
export async function updateMasterCourse(courseId, data) {
  const ref = doc(db, ...basePath(), 'master_data', 'courses', 'items', String(courseId));
  await updateDoc(ref, { ...data, _updatedAt: new Date().toISOString() });
  return { success: true };
}

/** Delete a master course */
export async function deleteMasterCourse(courseId) {
  const ref = doc(db, ...basePath(), 'master_data', 'courses', 'items', String(courseId));
  await deleteDoc(ref);
  return { success: true };
}

/** Assign a master course to a customer — creates entries in customer.courses[] */
export async function assignCourseToCustomer(customerId, masterCourse) {
  const snap = await getDoc(customerDoc(customerId));
  if (!snap.exists()) throw new Error('Customer not found');
  const courses = [...(snap.data().courses || [])];

  const products = masterCourse.products || [];
  // Phase 12.2b follow-up (2026-04-25): be_courses schema uses
  // `daysBeforeExpire` (camelCase, set by CourseFormModal +
  // migrateMasterCoursesToBe). Earlier `validityDays` kept as legacy
  // alias for any caller still passing that shape. Without this mapping
  // buffet courses (and every other course type) stored empty `expiry`
  // on customer.courses → UI countdown showed no date → user-reported
  // "เหมือนไม่มีวันหมดอายุ".
  const validityDays = masterCourse.daysBeforeExpire != null
    ? Number(masterCourse.daysBeforeExpire)
    : (masterCourse.validityDays != null ? Number(masterCourse.validityDays) : null);
  const expiry = validityDays > 0
    ? new Date(Date.now() + validityDays * 86400000).toISOString().split('T')[0]
    : '';
  // Track where this course came from (parent course/promotion name)
  const parentName = masterCourse.parentName || '';
  const source = masterCourse.source || ''; // 'sale', 'treatment', 'exchange', 'share'

  const linkedSaleId = masterCourse.linkedSaleId || null;
  const linkedTreatmentId = masterCourse.linkedTreatmentId || null;

  // Phase 12.2b Step 7 follow-up (2026-04-24): when a ProClinic-style
  // "เหมาตามจริง" course is assigned, mark each sub-product as a one-
  // shot credit (qty "1/1 <unit>") so a single treatment's
  // deductCourseItems call consumes it to 0 remaining → course auto-
  // moves into the customer's "ประวัติ" (ใช้หมดแล้ว) instead of staying
  // in the active list forever. ProClinic contract: "คอร์สเหมาคือซื้อ
  // ครั้งเดียวแล้วใช้หมดเลยทีเดียว".
  const isRealQty = masterCourse.courseType === 'เหมาตามจริง'
    || masterCourse.isRealQty === true;
  const courseTypeTag = masterCourse.courseType ? String(masterCourse.courseType) : '';

  // Phase 12.2b follow-up (2026-04-24): pick-at-treatment = two-step
  // pick-at-purchase. Don't split the options into per-product
  // customer.courses entries (that'd treat options as purchased
  // products). Instead write ONE placeholder carrying the full option
  // list on `availableProducts` + `needsPickSelection: true`. The
  // treatment form reads this and renders a "เลือกสินค้า" button;
  // after the doctor picks, `resolvePickedCourseInCustomer` rewrites
  // the entry with the resolved products[] (standard course flow from
  // that point). Without this special-case the user saw either
  // duplicate rows (N options as N "1/1 ครั้ง" courses) or nothing at
  // all (when options carried qty=0 and the allZero filter dropped them).
  // `alreadyResolved: true` is passed by TreatmentFormPage.handleSubmit
  // when the doctor already picked products in-visit (via PickProductsModal)
  // → we must SKIP the placeholder branch and write standard per-product
  // entries. Without this guard, the picks would be overwritten with the
  // master options list (user bug 2026-04-24: "คอร์สคงเหลือไม่พอ" after
  // buying + picking + using in the same treatment).
  const isPickAtTreatment = masterCourse.courseType === 'เลือกสินค้าตามจริง'
    && !masterCourse.alreadyResolved;
  if (isPickAtTreatment && products.length > 0) {
    // Persistent courseId survives splice-replace at resolve time so
    // multiple pick-at-treatment placeholders can be resolved
    // independently even as array indices shift.
    const pickCourseId = `pick-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    courses.push({
      courseId: pickCourseId,
      name: masterCourse.name,
      product: '',
      qty: '',
      status: 'กำลังใช้งาน',
      expiry,
      value: masterCourse.price ? `${masterCourse.price} บาท` : '',
      parentName,
      source,
      linkedSaleId,
      linkedTreatmentId,
      courseType: courseTypeTag,
      needsPickSelection: true,
      availableProducts: products.map(p => ({
        productId: p.id != null ? String(p.id) : (p.productId != null ? String(p.productId) : ''),
        name: p.name || '',
        qty: Number(p.qty) || 0,
        unit: p.unit || 'ครั้ง',
        minQty: p.minQty != null && p.minQty !== '' ? Number(p.minQty) : null,
        maxQty: p.maxQty != null && p.maxQty !== '' ? Number(p.maxQty) : null,
      })),
      assignedAt: new Date().toISOString(),
    });
    await updateCustomer(customerId, { courses });
    return { success: true, courses };
  }

  for (const p of products) {
    const qty = isRealQty
      ? buildQtyString(1, p.unit || 'ครั้ง')
      : buildQtyString(Number(p.qty) || 1, p.unit || 'ครั้ง');
    courses.push({
      name: masterCourse.name,
      product: p.name,
      // Phase 12.2b follow-up (2026-04-24): capture the master product
      // id so a later-visit "tick + fill qty" flow on this customer
      // course can resolve a real be_products doc → deductStockForTreatment
      // actually decrements a batch. Without this, a fill-later course
      // bought now and used 3 weeks from today would skip stock silently.
      productId: p.id != null ? String(p.id) : (p.productId != null ? String(p.productId) : ''),
      qty,
      status: 'กำลังใช้งาน',
      expiry,
      value: masterCourse.price ? `${masterCourse.price} บาท` : '',
      parentName,
      source,
      linkedSaleId,
      linkedTreatmentId,
      courseType: courseTypeTag,
      assignedAt: new Date().toISOString(),
    });
  }

  // If no products, create one entry with course name
  if (products.length === 0) {
    courses.push({
      name: masterCourse.name,
      product: masterCourse.name,
      qty: buildQtyString(1, 'ครั้ง'),
      status: 'กำลังใช้งาน',
      expiry,
      value: masterCourse.price ? `${masterCourse.price} บาท` : '',
      parentName,
      source,
      linkedSaleId,
      linkedTreatmentId,
      courseType: courseTypeTag,
      assignedAt: new Date().toISOString(),
    });
  }

  await updateCustomer(customerId, { courses });
  return { success: true, courses };
}

/**
 * Phase 12.2b follow-up (2026-04-24): resolve a pick-at-treatment
 * placeholder entry on customer.courses[] by replacing it with N
 * per-product entries (standard-course shape) built from the
 * doctor's picks. Runs ONLY on a placeholder — throws if the target
 * entry lacks `needsPickSelection: true`.
 *
 * Why this function exists: the in-memory `resolvePickedCourseEntry`
 * helper updates Treatment form state, but the be_customers document
 * still carries the placeholder. On a subsequent visit (or page
 * reload) the doctor would see the "เลือกสินค้า" button again. This
 * function persists the resolution so courses become first-class
 * standard courses after pick.
 *
 * `courseKey` is either the persistent `courseId` stamped by
 * assignCourseToCustomer (preferred, survives index-shift when other
 * placeholders are resolved in the same session) OR a numeric index
 * (legacy fallback — caller must ensure no intervening mutation).
 *
 * @param {string} customerId
 * @param {string|number} courseKey — persistent courseId OR array index
 * @param {Array<{productId, name, qty, unit}>} picks — user's selections
 * @returns {Promise<{success:boolean, courses:object[]}>}
 */
export async function resolvePickedCourseInCustomer(customerId, courseKey, picks) {
  const snap = await getDoc(customerDoc(customerId));
  if (!snap.exists()) throw new Error('Customer not found');
  const courses = [...(snap.data().courses || [])];

  let idx = -1;
  if (typeof courseKey === 'string') {
    idx = courses.findIndex(c => c && c.courseId === courseKey && c.needsPickSelection === true);
  } else if (typeof courseKey === 'number') {
    if (courseKey >= 0 && courseKey < courses.length) idx = courseKey;
  }
  if (idx < 0) throw new Error('Pick-at-treatment placeholder not found');

  const placeholder = courses[idx];
  if (!placeholder || !placeholder.needsPickSelection) {
    throw new Error('Course entry is not a pick-at-treatment placeholder');
  }
  const valid = (Array.isArray(picks) ? picks : [])
    .filter(p => p && Number(p.qty) > 0 && (p.name || p.productId));
  if (valid.length === 0) throw new Error('No valid picks provided');

  const {
    availableProducts: _discardOptions,
    needsPickSelection: _discardFlag,
    product: _discardProduct,
    qty: _discardQty,
    courseId: _discardPickId,
    ...basePlaceholder
  } = placeholder;

  const now = new Date().toISOString();
  const resolvedEntries = valid.map(p => ({
    ...basePlaceholder,
    product: p.name || '',
    productId: p.productId != null ? String(p.productId) : '',
    qty: buildQtyString(Number(p.qty) || 1, p.unit || 'ครั้ง'),
    status: 'กำลังใช้งาน',
    assignedAt: basePlaceholder.assignedAt || now,
  }));

  courses.splice(idx, 1, ...resolvedEntries);
  await updateCustomer(customerId, { courses });
  return { success: true, courses };
}

/** Exchange a product within a customer's course */
export async function exchangeCourseProduct(customerId, courseIndex, newProduct, reason = '') {
  const snap = await getDoc(customerDoc(customerId));
  if (!snap.exists()) throw new Error('Customer not found');
  const courses = [...(snap.data().courses || [])];
  if (courseIndex < 0 || courseIndex >= courses.length) throw new Error('Invalid course index');

  const oldCourse = courses[courseIndex];
  const exchangeEntry = {
    timestamp: new Date().toISOString(),
    oldProduct: oldCourse.product,
    oldQty: oldCourse.qty,
    newProduct: newProduct.name,
    newQty: buildQtyString(Number(newProduct.qty) || 1, newProduct.unit || ''),
    reason,
  };

  courses[courseIndex] = {
    ...oldCourse,
    product: newProduct.name,
    qty: buildQtyString(Number(newProduct.qty) || 1, newProduct.unit || ''),
  };

  const existingLog = snap.data().courseExchangeLog || [];
  await updateCustomer(customerId, {
    courses,
    courseExchangeLog: [...existingLog, exchangeEntry],
  });
  return { success: true, courses, exchangeLog: exchangeEntry };
}

// ─── Appointment CRUD ───────────────────────────────────────────────────────

const appointmentsCol = () => collection(db, ...basePath(), 'be_appointments');
const appointmentDoc = (id) => doc(db, ...basePath(), 'be_appointments', String(id));

/** Create a new backend appointment */
export async function createBackendAppointment(data) {
  const appointmentId = `BA-${Date.now()}`;
  const now = new Date().toISOString();
  await setDoc(appointmentDoc(appointmentId), {
    appointmentId,
    ...data,
    createdAt: now,
    updatedAt: now,
  });
  return { appointmentId, success: true };
}

/** Update an existing appointment */
export async function updateBackendAppointment(appointmentId, data) {
  await updateDoc(appointmentDoc(appointmentId), {
    ...data,
    updatedAt: new Date().toISOString(),
  });
  return { success: true };
}

/** Delete an appointment */
export async function deleteBackendAppointment(appointmentId) {
  await deleteDoc(appointmentDoc(appointmentId));
  return { success: true };
}

/**
 * Normalise an appointment `date` field to YYYY-MM-DD, tolerating legacy/
 * drifted formats ("2026-04-30T00:00:00.000Z", "2026-04-30 ", Firestore
 * Timestamp fallback via toDate()).
 * Returns '' if unrecognisable.
 */
function normalizeApptDate(rawDate) {
  if (!rawDate) return '';
  if (typeof rawDate === 'string') {
    return rawDate.trim().slice(0, 10);
  }
  if (rawDate && typeof rawDate.toDate === 'function') {
    const d = rawDate.toDate();
    if (d instanceof Date && !isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
    return rawDate.toISOString().slice(0, 10);
  }
  return '';
}

/** Get all appointments for a month (YYYY-MM) */
export async function getAppointmentsByMonth(yearMonth) {
  const snap = await getDocs(appointmentsCol());
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  // Normalize `date` on every row so the month-level bubble count matches
  // the day-level list (bug 2026-04-20: drifted dates like
  // "2026-04-30T00:00:00" passed month .startsWith() but failed day
  // where('date','==','2026-04-30'), so bubble showed count but day was empty).
  const grouped = {};
  for (const a of all) {
    const iso = normalizeApptDate(a.date);
    if (!iso || iso.slice(0, 7) !== yearMonth) continue;
    // Store with normalized date so UI keys match getAppointmentsByDate output
    const normalized = { ...a, date: iso };
    if (!grouped[iso]) grouped[iso] = [];
    grouped[iso].push(normalized);
  }
  Object.values(grouped).forEach(arr => arr.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || '')));
  return grouped;
}

/** Get all appointments for a customer */
export async function getCustomerAppointments(customerId) {
  const q = query(appointmentsCol(), where('customerId', '==', String(customerId)));
  const snap = await getDocs(q);
  const appts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  appts.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return appts;
}

/**
 * Real-time listener variant of `getCustomerAppointments`. Returns
 * unsubscribe. Mirrors `listenToCustomerTreatments` shape (Phase 14.7.G).
 * Phase 14.7.H follow-up B (2026-04-26).
 */
export function listenToCustomerAppointments(customerId, onChange, onError) {
  const q = query(appointmentsCol(), where('customerId', '==', String(customerId)));
  return onSnapshot(q, (snap) => {
    const appts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    appts.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    onChange(appts);
  }, onError);
}

/** Get all appointments for a specific date (YYYY-MM-DD).
 *
 * Client-side filter via normalizeApptDate to tolerate drifted date formats
 * (timestamps, trailing whitespace, Firestore Timestamp values). Without
 * this, Firestore where('date','==',x) misses docs that the month-level
 * bubble counts include — producing "bubble says 1 but day is empty". */
export async function getAppointmentsByDate(dateStr) {
  const target = normalizeApptDate(dateStr);
  if (!target) return [];
  const snap = await getDocs(appointmentsCol());
  const appts = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(a => normalizeApptDate(a.date) === target)
    .map(a => ({ ...a, date: target })); // normalize outbound shape too
  appts.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  return appts;
}

/**
 * Real-time listener variant of `getAppointmentsByDate`. Returns
 * unsubscribe. Phase 14.7.H follow-up B (2026-04-26) — closes the
 * multi-admin calendar collision risk where two admins viewing the
 * same day couldn't see each other's bookings without nav-and-back.
 *
 * Listens on the WHOLE collection (Firestore can't index by client-
 * normalized date), then filters client-side by `normalizeApptDate(a.date)
 * === target`. Cost: every appointment write fires the snapshot — for a
 * clinic with thousands of appts this is non-trivial. Mitigation: the
 * AppointmentTab caller subscribes per-day so this only runs when the
 * tab is open and only one date is being watched.
 */
export function listenToAppointmentsByDate(dateStr, onChange, onError) {
  const target = normalizeApptDate(dateStr);
  if (!target) {
    onChange?.([]);
    return () => {};
  }
  return onSnapshot(appointmentsCol(), (snap) => {
    const appts = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(a => normalizeApptDate(a.date) === target)
      .map(a => ({ ...a, date: target }));
    appts.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
    onChange(appts);
  }, onError);
}

/**
 * Real-time listener for customer's finance summary — bundles 4 listeners
 * into one unsubscribe. Mirrors the {depositBalance, walletBalance, wallets,
 * points, membership} shape that CustomerDetailView already consumes.
 *
 * Phase 14.7.H follow-up F (2026-04-26). Replaces the Promise.all one-shot
 * load so:
 *   - depositing/refunding in another tab → balance card updates without F5
 *   - wallet top-up / spend in TreatmentFormPage → wallet card auto-refreshes
 *   - earning loyalty points on a sale → points card auto-updates
 *   - upgrading membership → card swaps live
 *
 * Subscribes to:
 *   - be_deposits where customerId == cid (filtered to active|partial in emit)
 *   - be_customer_wallets where customerId == cid (sorted by walletTypeName)
 *   - be_customers/{cid} (single-doc; reads finance.loyaltyPoints)
 *   - be_memberships where customerId == cid (picks first active+not-expired)
 *
 * NOTE: Unlike `getCustomerMembership`, this listener does NOT lazy-write
 * status='expired' to expired memberships. The UI treats expiry client-side
 * (filter membership.expiresAt < now). Downstream queries that filter by
 * status alone may see stale 'active' on expired memberships — they should
 * also check expiresAt. (Existing one-shot getCustomerMembership preserved
 * for those callsites.)
 *
 * @param {string} customerId
 * @param {(summary: {depositBalance:number, walletBalance:number, wallets:Array, points:number, membership:object|null}) => void} onChange
 * @param {(err: Error) => void} [onError]
 * @returns {() => void} unsubscribe (tears down all 4 inner listeners)
 */
export function listenToCustomerFinance(customerId, onChange, onError) {
  const cid = String(customerId || '');
  if (!cid) {
    onChange?.({ depositBalance: 0, walletBalance: 0, wallets: [], points: 0, membership: null });
    return () => {};
  }

  let deposits = [];
  let wallets = [];
  let points = 0;
  let membership = null;
  let depositsReady = false;
  let walletsReady = false;
  let pointsReady = false;
  let membershipReady = false;

  const emit = () => {
    // Coalesce: only emit once all 4 inner listeners have produced their
    // first snapshot. Avoids 4 partial-state callbacks during initial mount.
    if (!depositsReady || !walletsReady || !pointsReady || !membershipReady) return;
    const depositBalance = deposits
      .filter(d => d.status === 'active' || d.status === 'partial')
      .reduce((s, d) => s + (Number(d.remainingAmount) || 0), 0);
    const walletBalance = wallets.reduce((s, w) => s + (Number(w.balance) || 0), 0);
    onChange({ depositBalance, walletBalance, wallets, points, membership });
  };

  const unsubDeposits = onSnapshot(
    query(depositsCol(), where('customerId', '==', cid)),
    (snap) => {
      deposits = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      depositsReady = true;
      emit();
    },
    onError,
  );
  const unsubWallets = onSnapshot(
    query(walletsCol(), where('customerId', '==', cid)),
    (snap) => {
      wallets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      wallets.sort((a, b) => (a.walletTypeName || '').localeCompare(b.walletTypeName || ''));
      walletsReady = true;
      emit();
    },
    onError,
  );
  const unsubPoints = onSnapshot(
    customerDoc(cid),
    (snap) => {
      points = Number(snap.data()?.finance?.loyaltyPoints) || 0;
      pointsReady = true;
      emit();
    },
    onError,
  );
  const unsubMembership = onSnapshot(
    query(membershipsCol(), where('customerId', '==', cid)),
    (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const now = Date.now();
      // Pick first active + not-expired (matches getCustomerMembership semantics
      // minus the lazy-write).
      membership = list.find(m =>
        m.status === 'active'
        && (!m.expiresAt || new Date(m.expiresAt).getTime() >= now)
      ) || null;
      membershipReady = true;
      emit();
    },
    onError,
  );

  return () => {
    unsubDeposits();
    unsubWallets();
    unsubPoints();
    unsubMembership();
  };
}

// ─── Sale CRUD ──────────────────────────────────────────────────────────────

const salesCol = () => collection(db, ...basePath(), 'be_sales');
const saleDoc = (id) => doc(db, ...basePath(), 'be_sales', String(id));
const saleCounterDoc = () => doc(db, ...basePath(), 'be_sales_counter', 'counter');

/** Generate invoice number: INV-YYYYMMDD-XXXX (atomic counter) */
export async function generateInvoiceNumber() {
  const { runTransaction } = await import('firebase/firestore');
  const today = new Date();
  const dateStr = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;

  const seq = await runTransaction(db, async (transaction) => {
    const counterRef = saleCounterDoc();
    const snap = await transaction.get(counterRef);
    let nextSeq = 1;
    if (snap.exists()) {
      const data = snap.data();
      if (data.date === dateStr) nextSeq = (data.seq || 0) + 1;
    }
    transaction.set(counterRef, { date: dateStr, seq: nextSeq, updatedAt: new Date().toISOString() });
    return nextSeq;
  });

  return `INV-${dateStr}-${String(seq).padStart(4, '0')}`;
}

/**
 * M12 ext: writes to `payment.channels` bypass `updateSalePayment` when they
 * happen through createBackendSale/updateBackendSale, so THB rounding has to
 * apply at the write site too. Coerce each channel.amount to 2 decimals so a
 * raw `0.1 + 0.2`-style drift never reaches Firestore.
 */
function _normalizeSaleData(data) {
  if (!data || typeof data !== 'object') return data;
  const payment = data.payment;
  if (!payment || !Array.isArray(payment.channels)) return data;
  const cleaned = payment.channels.map(c => ({
    ...c,
    amount: Math.round((parseFloat(c.amount) || 0) * 100) / 100,
  }));
  return { ...data, payment: { ...payment, channels: cleaned } };
}

/** Create a new sale — uses unique saleId, never overwrites existing.
 *  Returns the ACTUAL saleId used (may include a `-<ts>` suffix when the
 *  primary invoice number collides — the doc is stored under `finalId`, so
 *  callers must use this return value when referencing the sale elsewhere
 *  (applyDepositToSale, deductWallet, earnPoints, etc.). */
export async function createBackendSale(data) {
  const saleId = await generateInvoiceNumber();
  const now = new Date().toISOString();
  // Check if doc already exists (safety net against race conditions)
  const existing = await getDoc(saleDoc(saleId));
  const finalId = existing.exists() ? `${saleId}-${Date.now().toString(36)}` : saleId;
  await setDoc(saleDoc(finalId), {
    saleId: finalId,
    ..._normalizeSaleData(data),
    status: data.status || 'active',
    createdAt: now,
    updatedAt: now,
  });
  return { saleId: finalId, success: true };
}

/** Update an existing sale */
export async function updateBackendSale(saleId, data) {
  await updateDoc(saleDoc(saleId), { ..._normalizeSaleData(data), updatedAt: new Date().toISOString() });
  return { success: true };
}

/** Delete a sale */
export async function deleteBackendSale(saleId) {
  await _clearLinkedTreatmentsHasSale(saleId);
  await deleteDoc(saleDoc(saleId));
  return { success: true };
}

/**
 * C5: when a sale is cancelled or deleted, any treatment whose linkedSaleId
 * points to it must be detached — otherwise TreatmentFormPage's hasSale
 * split logic stays skewed and medication deduction can be lost on the next
 * edit. Idempotent: if no treatments link, no writes happen.
 */
async function _clearLinkedTreatmentsHasSale(saleId) {
  try {
    const sid = String(saleId);
    const q = query(treatmentsCol(), where('linkedSaleId', '==', sid));
    const snap = await getDocs(q);
    if (snap.empty) return;
    const now = new Date().toISOString();
    await Promise.all(snap.docs.map(d => updateDoc(d.ref, {
      hasSale: false,
      linkedSaleId: null,
      // Phase 12.2b follow-up (2026-04-25): also clear detail.linkedSaleId
      // so the DF payout aggregator (which reads `t.detail.linkedSaleId`)
      // stops attributing this treatment's dfEntries to the cancelled
      // sale. Without this, cancelling a sale left stale DF in the report.
      'detail.linkedSaleId': null,
      'detail.hasSale': false,
      updatedAt: now,
    })));
  } catch (e) {
    console.warn('[backendClient] clearLinkedTreatmentsHasSale failed:', e);
  }
}

/** Get a single sale by id. Returns null when missing. (Phase 13.1.4 convert flow needs this for print-after-convert UX.) */
export async function getBackendSale(saleId) {
  const id = String(saleId || '');
  if (!id) return null;
  const snap = await getDoc(saleDoc(id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Record a payment on a sale and update status. Writes to all three shapes
 * the read-side might inspect (top-level `payments[]` + `totalPaidAmount`,
 * plus `payment.channels[]` + `payment.status` for legacy SaleTab readers).
 * Idempotency via append semantics — each call adds another channel row.
 * Used by the Phase 13.1.4 "บันทึกชำระ" button on converted quotations.
 *
 * @param {string} saleId
 * @param {{ method: string, amount: number|string, refNo?: string, paidAt?: string }} payment
 * @returns {Promise<{ success: boolean, totalPaid: number, saleStatus: string, paymentStatus: string }>}
 */
export async function markSalePaid(saleId, { method, amount, refNo = '', paidAt = '' } = {}) {
  const id = String(saleId || '');
  if (!id) throw new Error('saleId required');
  if (!method) throw new Error('method required');
  const amt = Math.round((parseFloat(amount) || 0) * 100) / 100;
  if (!Number.isFinite(amt) || amt <= 0) throw new Error('amount ต้องเป็นจำนวนบวก');

  const snap = await getDoc(saleDoc(id));
  if (!snap.exists()) throw new Error('Sale not found');
  const sale = snap.data();
  const netTotal = Number(sale.billing?.netTotal ?? sale.netTotal) || 0;

  const now = new Date().toISOString();
  const when = paidAt || now.slice(0, 10);
  const entry = { method, amount: amt, refNo, paidAt: when };
  const channelEntry = { ...entry, enabled: true };

  const existingPayments = Array.isArray(sale.payments) ? sale.payments : [];
  const existingChannels = Array.isArray(sale.payment?.channels) ? sale.payment.channels : [];
  const newPayments = [...existingPayments, entry];
  const newChannels = [...existingChannels, channelEntry];
  const totalPaid = Math.round(
    newChannels.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0) * 100
  ) / 100;

  const paymentStatus = totalPaid + 0.01 >= netTotal ? 'paid' : 'split';
  // Top-level status uses M12 convention (active = fully paid, draft = not).
  const saleStatus = totalPaid + 0.01 >= netTotal ? 'active' : sale.status || 'draft';

  await updateDoc(saleDoc(id), {
    payments: newPayments,
    'payment.channels': newChannels,
    'payment.status': paymentStatus,
    totalPaidAmount: totalPaid,
    status: saleStatus,
    updatedAt: now,
  });

  // Denormalize paid state back to the linked quotation so QuotationTab can
  // disable the 'บันทึกชำระ' button without loading the sale per row.
  if (sale.linkedQuotationId) {
    try {
      await updateDoc(quotationDocRef(sale.linkedQuotationId), {
        salePaymentStatus: paymentStatus,
        salePaidAmount: totalPaid,
        salePaidAt: paymentStatus === 'paid' ? now : null,
        updatedAt: now,
      });
    } catch (e) {
      // Non-fatal — sale is already updated correctly. Log + continue.
      console.warn('[markSalePaid] quotation back-ref update failed:', e);
    }
  }

  return { success: true, totalPaid, saleStatus, paymentStatus };
}

/** Get all sales (sorted by date desc) */
export async function getAllSales() {
  const snap = await getDocs(salesCol());
  const sales = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  // Sort by createdAt (has time) desc — latest first
  sales.sort((a, b) => (b.createdAt || b.saleDate || '').localeCompare(a.createdAt || a.saleDate || ''));
  return sales;
}

/** Get all sales for a customer */
export async function getCustomerSales(customerId) {
  const q = query(salesCol(), where('customerId', '==', String(customerId)));
  const snap = await getDocs(q);
  const sales = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  sales.sort((a, b) => (b.createdAt || b.saleDate || '').localeCompare(a.createdAt || a.saleDate || ''));
  return sales;
}

/**
 * Real-time listener variant of `getCustomerSales`. Returns unsubscribe.
 * Phase 14.7.H follow-up B (2026-04-26) — closes the staleness gap where
 * a sale created in SaleTab in another tab didn't surface in CustomerDetailView's
 * "ประวัติการซื้อ" without F5. Mirrors `listenToCustomerTreatments` shape.
 */
export function listenToCustomerSales(customerId, onChange, onError) {
  const q = query(salesCol(), where('customerId', '==', String(customerId)));
  return onSnapshot(q, (snap) => {
    const sales = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    sales.sort((a, b) => (b.createdAt || b.saleDate || '').localeCompare(a.createdAt || a.saleDate || ''));
    onChange(sales);
  }, onError);
}

/** Get the sale auto-created from a treatment (by linkedTreatmentId). */
export async function getSaleByTreatmentId(treatmentId) {
  const q = query(salesCol(), where('linkedTreatmentId', '==', String(treatmentId)));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

/**
 * Analyze what cancelling/deleting a sale will affect — returns a report
 * (courses grouped by usage state + physical-goods counts) so the UI can
 * warn the user before they confirm.
 *
 * @returns {Promise<{
 *   unused: Array,         // customer.courses entries with remaining === total (safe to remove)
 *   partiallyUsed: Array,  // 0 < remaining < total
 *   fullyUsed: Array,      // remaining === 0
 *   productsCount: number, // items.products length (physical front-shop goods)
 *   productsList: Array,   // names of products (for warning display)
 *   medsCount: number,
 *   medsList: Array,
 *   depositApplied: number,
 *   walletApplied: number,
 *   pointsEarned: number,  // from be_point_transactions matching saleId
 * }>}
 */
export async function analyzeSaleCancel(saleId) {
  const saleSnap = await getDoc(saleDoc(saleId));
  if (!saleSnap.exists()) throw new Error('Sale not found');
  const sale = saleSnap.data();
  const customerId = String(sale.customerId || '');
  let courses = [];
  try {
    const custSnap = await getDoc(customerDoc(customerId));
    if (custSnap.exists()) courses = custSnap.data().courses || [];
  } catch {}
  const { parseQtyString } = await import('./courseUtils.js');
  const linked = courses.filter(c => String(c.linkedSaleId || '') === String(saleId));
  const unused = [];
  const partiallyUsed = [];
  const fullyUsed = [];
  for (const c of linked) {
    const p = parseQtyString(c.qty);
    if (p.total <= 0) { unused.push(c); continue; } // treat degenerate as unused
    if (p.remaining >= p.total) unused.push(c);
    else if (p.remaining <= 0) fullyUsed.push(c);
    else partiallyUsed.push(c);
  }
  const productsList = (sale.items?.products || []).map(p => p.name || '').filter(Boolean);
  const medsList = (sale.items?.medications || []).map(m => m.name || '').filter(Boolean);
  // Points earned: sum earn-type tx matching referenceId
  let pointsEarned = 0;
  try {
    const q = query(pointTxCol(),
      where('customerId', '==', customerId),
      where('referenceId', '==', String(saleId)),
    );
    const snap = await getDocs(q);
    snap.docs.forEach(d => {
      const tx = d.data();
      if (tx.type === 'earn') pointsEarned += Number(tx.amount) || 0;
    });
  } catch {}
  return {
    unused,
    partiallyUsed,
    fullyUsed,
    productsCount: productsList.length,
    productsList,
    medsCount: medsList.length,
    medsList,
    depositApplied: Number(sale.billing?.depositApplied) || 0,
    walletApplied: Number(sale.billing?.walletApplied) || 0,
    pointsEarned,
  };
}

/**
 * Remove courses linked to a cancelled/deleted sale from customer.courses.
 * Default: only remove entries where `remaining === total` (fully unused).
 * Pass `removeUsed: true` to also remove partially/fully-used entries
 * (loses usage history — the UI should only enable this with explicit opt-in).
 *
 * @param {string} saleId
 * @param {{removeUsed?: boolean}} [opts]
 * @returns {Promise<{removedCount: number, keptUsedCount: number}>}
 */
export async function removeLinkedSaleCourses(saleId, { removeUsed = false } = {}) {
  const saleSnap = await getDoc(saleDoc(saleId));
  if (!saleSnap.exists()) throw new Error('Sale not found');
  const customerId = String(saleSnap.data().customerId || '');
  if (!customerId) return { removedCount: 0, keptUsedCount: 0 };
  const custSnap = await getDoc(customerDoc(customerId));
  if (!custSnap.exists()) return { removedCount: 0, keptUsedCount: 0 };
  const current = custSnap.data().courses || [];
  const { parseQtyString } = await import('./courseUtils.js');
  let removedCount = 0;
  let keptUsedCount = 0;
  const next = current.filter(c => {
    if (String(c.linkedSaleId || '') !== String(saleId)) return true;
    const p = parseQtyString(c.qty);
    const isUnused = p.total > 0 && p.remaining >= p.total;
    if (isUnused) { removedCount++; return false; }
    if (removeUsed) { removedCount++; return false; }
    keptUsedCount++;
    return true;
  });
  if (removedCount > 0) {
    await updateCustomer(customerId, { courses: next });
  }
  return { removedCount, keptUsedCount };
}

/** Cancel a sale with reason + refund tracking */
export async function cancelBackendSale(saleId, reason, refundMethod, refundAmount, evidenceUrl) {
  await updateDoc(saleDoc(saleId), {
    status: 'cancelled',
    cancelled: { at: new Date().toISOString(), reason: reason || '', refundMethod: refundMethod || '', refundAmount: refundAmount || 0, evidenceUrl: evidenceUrl || null },
    'payment.status': 'cancelled',
    updatedAt: new Date().toISOString(),
  });
  // C5: detach any treatments that linked to this sale so their hasSale split
  // logic doesn't become stale (would cause silent double-deduct on re-edit).
  await _clearLinkedTreatmentsHasSale(saleId);
  return { success: true };
}

/** Add a payment channel to an existing sale + auto-update payment status */
export async function updateSalePayment(saleId, newChannel) {
  const snap = await getDoc(saleDoc(saleId));
  if (!snap.exists()) return { success: false, error: 'Sale not found' };
  const sale = snap.data();
  const existingChannels = sale.payment?.channels || [];
  const updatedChannels = [...existingChannels, { ...newChannel, enabled: true }];
  // M12: float accumulation (`0.1 + 0.1 + 0.1` !== 0.3) can flip the `>=`
  // comparison below on edge cases. Round to 2 decimals (THB convention)
  // before comparing so split-to-paid transitions are deterministic.
  const totalPaid = Math.round(
    updatedChannels.reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0) * 100
  ) / 100;
  const netTotal = sale.billing?.netTotal || 0;
  const newStatus = totalPaid >= netTotal ? 'paid' : 'split';
  await updateDoc(saleDoc(saleId), {
    'payment.channels': updatedChannels,
    'payment.status': newStatus,
    updatedAt: new Date().toISOString(),
  });
  return { success: true, newStatus, totalPaid };
}

// ─── Manual Master Data (wallet_types + membership_types) ──────────────────
// These collections have NO ProClinic sync — CRUD only in Backend.
// Same shape as master_data/{type}/items/{id} used by courses.

/** Create a manual master data item (wallet_types or membership_types). */
export async function createMasterItem(type, data) {
  const prefix = type === 'wallet_types' ? 'WT' : type === 'membership_types' ? 'MCT' : 'MI';
  const id = `${prefix}-${Date.now()}`;
  const now = new Date().toISOString();
  const ref = doc(db, ...basePath(), 'master_data', type, 'items', id);
  await setDoc(ref, {
    ...data,
    id,
    _createdBy: 'backend',
    _createdAt: now,
    _syncedAt: now,
    _source: 'backend',
  });
  return { id, success: true };
}

/** Update a manual master data item. */
export async function updateMasterItem(type, id, data) {
  const ref = doc(db, ...basePath(), 'master_data', type, 'items', String(id));
  await updateDoc(ref, { ...data, _updatedAt: new Date().toISOString() });
  return { success: true };
}

/**
 * Delete a manual master data item.
 *
 * R5: products specifically must not be hard-deleted while any active
 * batch in be_stock_batches still references them — that would orphan
 * the batch + its movement log. For `type='products'` we check for
 * active batches first; if found, soft-delete by flipping `isActive=false`
 * so historical sales/movements remain readable and the product doesn't
 * show in new-order dropdowns. Other master types (doctors, staff, etc.)
 * keep the original hard-delete behaviour.
 */
export async function deleteMasterItem(type, id) {
  const ref = doc(db, ...basePath(), 'master_data', type, 'items', String(id));
  if (type === 'products') {
    try {
      const batchesQ = query(
        collection(db, ...basePath(), 'be_stock_batches'),
        where('productId', '==', String(id)),
        where('status', '==', 'active'),
      );
      const snap = await getDocs(batchesQ);
      if (!snap.empty) {
        await updateDoc(ref, { isActive: false, deactivatedAt: new Date().toISOString() });
        return { success: true, softDeleted: true, linkedActiveBatches: snap.size };
      }
    } catch (e) {
      // If the query itself fails (index missing etc.), fall through to the
      // hard-delete so callers don't silently hang — but log the reason.
      console.error('[deleteMasterItem] product batch-check failed, falling back to hard delete:', e?.message);
    }
  }
  await deleteDoc(ref);
  return { success: true };
}

// ─── Master Data Read + Sync ────────────────────────────────────────────────

const masterDataDoc = (type) => doc(db, ...basePath(), 'master_data', type);
const masterDataItemsCol = (type) => collection(db, ...basePath(), 'master_data', type, 'items');

/** Read master data metadata (count, syncedAt) */
export async function getMasterDataMeta(type) {
  const snap = await getDoc(masterDataDoc(type));
  if (!snap.exists()) return null;
  return snap.data();
}

// ─── Phase 12.11: be_* shape adapters ──────────────────────────────────────
// For types that now have a be_* canonical collection, map the be_* doc shape
// back to the legacy master_data shape callers expect (p.id / p.name / p.price
// / p.unit / p.type / p.category / p.category_name / p.status 1|0).
// Phase 16 will do the inverse refactor — rewire every caller to read be_*
// directly and drop these adapters.

function beProductToMasterShape(p) {
  // Phase 11.9: also reconstruct nested `label` + surface full medication
  // labeling fields so TreatmentFormPage med modal + SaleTab see correct
  // data straight from be_products (no separate lookup needed).
  const hasLabel = p.genericName || p.dosageAmount || p.dosageUnit
    || p.timesPerDay != null || p.administrationMethod
    || (Array.isArray(p.administrationTimes) && p.administrationTimes.length)
    || p.instructions || p.indications;
  return {
    ...p,
    id: p.productId || p.id,
    name: p.productName || '',
    price: p.price ?? null,
    price_incl_vat: p.priceInclVat ?? null,
    is_vat_included: p.isVatIncluded ? 1 : 0,
    unit: p.mainUnitName || '',
    unit_name: p.mainUnitName || '',
    type: p.productType || '',
    product_type: p.productType || '',
    service_type: p.serviceType || '',
    category: p.categoryName || '',
    category_name: p.categoryName || '',
    sub_category_name: p.subCategoryName || '',
    code: p.productCode || '',
    product_code: p.productCode || '',
    generic_name: p.genericName || '',
    is_takeaway_product: p.isTakeawayProduct ? 1 : 0,
    is_claim_drug_discount: p.isClaimDrugDiscount ? 1 : 0,
    stock_location: p.stockLocation || '',
    alert_day_before_expire: p.alertDayBeforeExpire,
    alert_qty_before_out_of_stock: p.alertQtyBeforeOutOfStock,
    alert_qty_before_max_stock: p.alertQtyBeforeMaxStock,
    label: hasLabel ? {
      genericName: p.genericName || '',
      indications: p.indications || '',
      dosageAmount: p.dosageAmount || '',
      dosageUnit: p.dosageUnit || '',
      timesPerDay: p.timesPerDay != null ? String(p.timesPerDay) : '',
      administrationMethod: p.administrationMethod || '',
      administrationMethodHour: p.administrationMethodHour || '',
      administrationTimes: Array.isArray(p.administrationTimes)
        ? p.administrationTimes.join(', ')
        : (p.administrationTimes || ''),
      instructions: p.instructions || '',
      storageInstructions: p.storageInstructions || '',
    } : null,
    status: p.status === 'พักใช้งาน' ? 0 : 1,
  };
}

export function beCourseToMasterShape(c, opts = {}) {
  // Phase 12.11 bug fix (2026-04-20): be_courses stores nested items as
  // `courseProducts: [{productId, productName, qty}]` but master_data shape
  // (consumed by TreatmentFormPage buy modal + SaleTab + PromotionFormModal)
  // expects `products: [{id, name, qty, unit}]`. Without this mapping, a
  // course created via our CoursesTab shows its NAME in the treatment-form
  // course column but NO checkboxes for the sub-items to deduct. Unit is
  // enriched via opts.productLookup (preloaded be_products Map).
  //
  // Phase 12.2b follow-up (2026-04-24): be_courses stores the MAIN product
  // at top level (`mainProductId` + `mainProductName` + `mainQty`), SEPARATE
  // from courseProducts[] which holds ONLY secondary products. Previously
  // this mapper ignored the main product → buy modal's item.products had
  // only secondaries → buildPurchasedCourseEntry created a customerCourses
  // entry without the main product → user saw "ไส้ในของคอร์สเหมามาไม่หมด".
  // Fix: prepend the main product to products[] so downstream consumers
  // see ONE flat list with the main product first.
  const productLookup = opts.productLookup instanceof Map ? opts.productLookup : null;
  const products = [];
  const mainId = String(c.mainProductId || '').trim();
  if (mainId) {
    const enriched = productLookup?.get(mainId) || {};
    products.push({
      id: mainId,
      name: String(c.mainProductName || enriched.name || '').trim() || mainId,
      // For fill-later courses mainQty is 0/null — leave as 0 so downstream
      // fillLater branch can handle the "no pre-set qty" semantics. For
      // standard courses mainQty is the per-purchase qty.
      qty: Number(c.mainQty) || 0,
      unit: enriched.unit || enriched.mainUnitName || 'ครั้ง',
      isMainProduct: true,
    });
  }
  if (Array.isArray(c.courseProducts)) {
    for (const cp of c.courseProducts) {
      const pid = String(cp.productId || cp.id || '');
      // Dedup: skip if courseProducts somehow also carries the main product
      // (ProClinic sync can include it in both places for some courses).
      if (pid && pid === mainId) continue;
      const enriched = productLookup?.get(pid) || {};
      products.push({
        id: pid,
        name: cp.productName || enriched.name || '',
        qty: Number(cp.qty) || 0,
        unit: cp.unit || enriched.unit || 'ครั้ง',
      });
    }
  }
  return {
    ...c,
    id: c.courseId || c.id,
    name: c.courseName || '',
    course_name: c.courseName || '',
    receipt_course_name: c.receiptCourseName || '',
    sale_price: c.salePrice ?? null,
    price: c.salePrice ?? null,
    sale_price_incl_vat: c.salePriceInclVat ?? null,
    code: c.courseCode || '',
    course_code: c.courseCode || '',
    time: c.time ?? null,
    course_category: c.courseCategory || '',
    category: c.courseCategory || '',
    products,
    status: c.status === 'พักใช้งาน' ? 0 : 1,
  };
}

function beStaffToMasterShape(s) {
  const fullName = [s.firstname || '', s.lastname || ''].map(x => String(x).trim()).filter(Boolean).join(' ');
  return {
    ...s,
    id: s.staffId || s.id,
    name: fullName || s.nickname || '',
    firstname: s.firstname || '',
    lastname: s.lastname || '',
    email: s.email || '',
    color: s.color || '',
    position: s.position || '',
    branches: Array.isArray(s.branchIds) ? s.branchIds : [],
    status: s.status === 'พักใช้งาน' ? 0 : 1,
  };
}

function beDoctorToMasterShape(d) {
  const fullName = [d.firstname || '', d.lastname || ''].map(x => String(x).trim()).filter(Boolean).join(' ');
  return {
    ...d,
    id: d.doctorId || d.id,
    name: fullName || d.nickname || '',
    firstname: d.firstname || '',
    lastname: d.lastname || '',
    firstname_en: d.firstnameEn || '',
    lastname_en: d.lastnameEn || '',
    email: d.email || '',
    color: d.color || '',
    position: d.position || '',
    branches: Array.isArray(d.branchIds) ? d.branchIds : [],
    hourlyRate: d.hourlyIncome ?? null,
    status: d.status === 'พักใช้งาน' ? 0 : 1,
  };
}

// ── Identity / minimal shape mappers for Phase 9 + Phase 11 be_* types ──
// For types where consumers use direct CRUD (listPromotions, listProductGroups,
// etc.) rather than getAllMasterDataItems, the mapper mostly only needs to
// expose `id`. But we also spread the be_ doc so any legacy master_data-shape
// consumer that DOES call getAllMasterDataItems(type) gets real data, not
// stale master_data. All 13 listed here are "user-visible green badge" in
// MasterDataTab debug panel.

function bePromotionToMasterShape(p) {
  return { ...p, id: p.promotionId || p.id, name: p.promotion_name || p.name || '' };
}
function beCouponToMasterShape(c) {
  return { ...c, id: c.couponId || c.id, name: c.coupon_name || c.name || '' };
}
function beVoucherToMasterShape(v) {
  return { ...v, id: v.voucherId || v.id, name: v.voucher_name || v.name || '' };
}
function beProductGroupToMasterShape(g) {
  return { ...g, id: g.groupId || g.id, name: g.name || g.group_name || '' };
}
function beProductUnitToMasterShape(u) {
  return { ...u, id: u.unitGroupId || u.id, name: u.groupName || u.name || '' };
}
function beMedicalInstrumentToMasterShape(m) {
  return { ...m, id: m.instrumentId || m.id, name: m.name || '' };
}
function beHolidayToMasterShape(h) {
  return { ...h, id: h.holidayId || h.id, name: h.holiday_note || h.note || '' };
}
function beBranchToMasterShape(b) {
  return { ...b, id: b.branchId || b.id, name: b.branch_name || b.name || '' };
}
function bePermissionGroupToMasterShape(g) {
  return { ...g, id: g.permissionGroupId || g.id, name: g.name || g.group_name || '' };
}
// Phase 14.x: wallet + membership TYPES migrate to be_* (gap audit
// 2026-04-24). Each be_wallet_types doc mirrors the ProClinic scrape
// shape with `id` = ProClinic numeric id.
function beWalletTypeToMasterShape(w) {
  return { ...w, id: w.walletTypeId || w.id, name: w.name || w.wallet_name || '' };
}
function beMembershipTypeToMasterShape(m) {
  return { ...m, id: m.membershipTypeId || m.id, name: m.name || m.membership_name || '' };
}
function beMedicineLabelToMasterShape(l) {
  return { ...l, id: l.labelId || l.id, name: l.name || '' };
}

// Types that have be_* canonical backing as of Phase 11.9 (2026-04-20).
// Every type listed here SHOULD show green "be_*" badge in MasterDataTab
// debug panel + getAllMasterDataItems reads be_ first.
const BE_BACKED_MASTER_TYPES = Object.freeze({
  // Phase 12.x — primary adapter-routed consumers (TreatmentFormPage etc)
  products: { col: 'be_products',  map: beProductToMasterShape },
  courses:  { col: 'be_courses',   map: beCourseToMasterShape  },
  staff:    { col: 'be_staff',     map: beStaffToMasterShape   },
  doctors:  { col: 'be_doctors',   map: beDoctorToMasterShape  },
  // Phase 9 — marketing entities (consumers use direct CRUD)
  promotions: { col: 'be_promotions', map: bePromotionToMasterShape },
  coupons:    { col: 'be_coupons',    map: beCouponToMasterShape    },
  vouchers:   { col: 'be_vouchers',   map: beVoucherToMasterShape   },
  // Phase 11 — master data suite (consumers use direct CRUD)
  product_groups:      { col: 'be_product_groups',      map: beProductGroupToMasterShape      },
  product_units:       { col: 'be_product_units',       map: beProductUnitToMasterShape       },
  medical_instruments: { col: 'be_medical_instruments', map: beMedicalInstrumentToMasterShape },
  holidays:            { col: 'be_holidays',            map: beHolidayToMasterShape           },
  branches:            { col: 'be_branches',            map: beBranchToMasterShape            },
  permission_groups:   { col: 'be_permission_groups',   map: bePermissionGroupToMasterShape   },
  // Phase 14.x — wallet + membership types migrate (gap audit 2026-04-24).
  // Readers now hit be_* transparently once the migration button runs.
  wallet_types:        { col: 'be_wallet_types',        map: beWalletTypeToMasterShape        },
  membership_types:    { col: 'be_membership_types',    map: beMembershipTypeToMasterShape    },
  medicine_labels:     { col: 'be_medicine_labels',     map: beMedicineLabelToMasterShape     },
});

async function readBeForMasterType(type) {
  const conf = BE_BACKED_MASTER_TYPES[type];
  if (!conf) return null;
  // Phase 12.11 bug fix (2026-04-20): courses reference products by id only —
  // preload be_products into a Map so beCourseToMasterShape can enrich each
  // nested courseProduct with its real unit (and fall back to stored name).
  // Single extra getDocs per getAllMasterDataItems('courses') call.
  let opts = {};
  if (type === 'courses') {
    try {
      const productSnap = await getDocs(collection(db, ...basePath(), 'be_products'));
      const productLookup = new Map();
      productSnap.docs.forEach(d => {
        const p = d.data();
        const pid = String(p.productId || d.id || '');
        if (!pid) return;
        productLookup.set(pid, {
          name: p.productName || '',
          unit: p.mainUnitName || '',
        });
      });
      opts = { productLookup };
    } catch {
      // be_products may not exist yet (pre-seed) — fall through with empty lookup
    }
  }
  const snap = await getDocs(collection(db, ...basePath(), conf.col));
  return snap.docs.map(d => conf.map({ id: d.id, ...d.data() }, opts));
}

/**
 * Read all items from master_data/{type}/items.
 *
 * Phase 12.11 (2026-04-20): for types in BE_BACKED_MASTER_TYPES (products/
 * courses/staff/doctors), prefer the canonical be_* collection mapped back
 * to master_data shape. Falls back to master_data when be_* is empty (seed
 * phase) or unsupported type.
 *
 * This lets the user delete master_data/{type}/items after migrate and have
 * UI consumers still work — empirical proof that Phase 12 migration is
 * wired for the 4 types we covered. Other types (wallet_types,
 * membership_types, medication_groups, consumable_groups) still read
 * master_data until Phase 16 Polish.
 */
export async function getAllMasterDataItems(type) {
  if (BE_BACKED_MASTER_TYPES[type]) {
    try {
      const beItems = await readBeForMasterType(type);
      if (Array.isArray(beItems) && beItems.length > 0) return beItems;
    } catch {
      // fall through to master_data
    }
  }
  const snap = await getDocs(masterDataItemsCol(type));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Test hook — expose adapter list so tests + /audit-master-data-ownership
// can enumerate what's wired without duplicating the constant.
export function getBeBackedMasterTypes() {
  return Object.keys(BE_BACKED_MASTER_TYPES);
}

/**
 * Phase 12.11 debug helper: delete every doc in master_data/{type}/items.
 * Used to verify that UI consumers for `type` have migrated off master_data
 * and onto be_*. Batched in chunks of 400 ops (under Firestore's 500-op
 * writeBatch limit). Preserves the master_data/{type} root meta doc so the
 * sync UI still shows the type as "ever-synced".
 */
export async function clearMasterDataItems(type) {
  const t = String(type || '').trim();
  if (!t) throw new Error('type required');
  const colRef = masterDataItemsCol(t);
  let totalDeleted = 0;
  while (true) {
    const snap = await getDocs(colRef);
    if (snap.empty) break;
    const docs = snap.docs.slice(0, 400);
    const batch = writeBatch(db);
    for (const d of docs) batch.delete(d.ref);
    await batch.commit();
    totalDeleted += docs.length;
    if (snap.docs.length <= 400) break;
  }
  return { type: t, deleted: totalDeleted };
}

// ─── Deposit CRUD (Phase 7) ────────────────────────────────────────────────

const depositsCol = () => collection(db, ...basePath(), 'be_deposits');
const depositDoc = (id) => doc(db, ...basePath(), 'be_deposits', String(id));

/** Recalc customer's deposit balance from active/partial deposits and write to finance.depositBalance.
 *  Safe to call after any deposit mutation. */
export async function recalcCustomerDepositBalance(customerId) {
  const cid = String(customerId || '');
  if (!cid) return 0;
  const q = query(depositsCol(), where('customerId', '==', cid));
  const snap = await getDocs(q);
  let total = 0;
  snap.docs.forEach(d => {
    const x = d.data();
    if (x.status === 'active' || x.status === 'partial') {
      total += Number(x.remainingAmount) || 0;
    }
  });
  try {
    await updateDoc(customerDoc(cid), { 'finance.depositBalance': total });
  } catch {
    // customer doc may not exist in tests — don't fail caller
  }
  return total;
}

/**
 * Create a new deposit. Sets remainingAmount = amount, usedAmount = 0, status = 'active'.
 * Returns { depositId, success }.
 */
export async function createDeposit(data, opts = {}) {
  // Phase 12.4: strict=true runs validateDeposit before write. Default stays
  // false to preserve existing DepositPanel behavior (legacy flows rely on
  // lenient create). New UI paths should pass strict: true.
  if (opts.strict) {
    const { normalizeDeposit, validateDeposit } = await import('./depositValidation.js');
    const normalized = normalizeDeposit(data);
    const fail = validateDeposit(normalized, { strict: true });
    if (fail) {
      const [, msg] = fail;
      throw new Error(msg);
    }
    data = normalized;
  }
  const depositId = `DEP-${Date.now()}`;
  const now = new Date().toISOString();
  const amount = Number(data.amount) || 0;
  const payload = {
    depositId,
    customerId: String(data.customerId || ''),
    customerName: data.customerName || '',
    customerHN: data.customerHN || '',
    amount,
    usedAmount: 0,
    remainingAmount: amount,
    paymentChannel: data.paymentChannel || '',
    paymentDate: data.paymentDate || now.slice(0, 10),
    paymentTime: data.paymentTime || '',
    refNo: data.refNo || '',
    sellers: Array.isArray(data.sellers) ? data.sellers : [],
    customerSource: data.customerSource || '',
    sourceDetail: data.sourceDetail || '',
    hasAppointment: !!data.hasAppointment,
    appointment: data.hasAppointment ? (data.appointment || null) : null,
    note: data.note || '',
    status: 'active',
    cancelNote: '',
    cancelEvidenceUrl: data.cancelEvidenceUrl || '',
    cancelledAt: null,
    refundAmount: 0,
    refundChannel: '',
    refundDate: null,
    paymentEvidenceUrl: data.paymentEvidenceUrl || '',
    paymentEvidencePath: data.paymentEvidencePath || '',
    proClinicDepositId: data.proClinicDepositId || null,
    usageHistory: [],
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(depositDoc(depositId), payload);
  await recalcCustomerDepositBalance(payload.customerId);
  return { depositId, success: true };
}

/**
 * Update deposit. Recalculates remainingAmount if `amount` changes.
 * Caller should NOT pass usedAmount directly (use apply/reverse instead).
 */
export async function updateDeposit(depositId, data) {
  const ref = depositDoc(depositId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Deposit not found');
  const current = snap.data();
  const updates = { ...data, updatedAt: new Date().toISOString() };
  // If amount changes, recalc remainingAmount (preserve usedAmount)
  if (data.amount != null && Number(data.amount) !== current.amount) {
    const newAmount = Number(data.amount) || 0;
    const used = Number(current.usedAmount) || 0;
    updates.amount = newAmount;
    updates.remainingAmount = Math.max(0, newAmount - used);
    // Keep status consistent with new amount/used
    if (current.status === 'active' || current.status === 'partial' || current.status === 'used') {
      updates.status = used >= newAmount && newAmount > 0 ? 'used' : used > 0 ? 'partial' : 'active';
    }
  }
  // Never allow direct override of usedAmount / usageHistory via this function
  delete updates.usedAmount;
  delete updates.usageHistory;
  await updateDoc(ref, updates);
  await recalcCustomerDepositBalance(current.customerId);
  return { success: true };
}

/** Cancel a deposit. Only allowed when no usage exists (usedAmount === 0). */
export async function cancelDeposit(depositId, { cancelNote = '', cancelEvidenceUrl = '' } = {}) {
  const ref = depositDoc(depositId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Deposit not found');
  const cur = snap.data();
  if ((Number(cur.usedAmount) || 0) > 0) {
    throw new Error('มัดจำถูกใช้ไปบางส่วนแล้ว ไม่สามารถยกเลิกได้ กรุณายกเลิกใบเสร็จที่ใช้มัดจำก่อน');
  }
  await updateDoc(ref, {
    status: 'cancelled',
    cancelNote,
    cancelEvidenceUrl,
    cancelledAt: new Date().toISOString(),
    remainingAmount: 0,
    updatedAt: new Date().toISOString(),
  });
  await recalcCustomerDepositBalance(cur.customerId);
  return { success: true };
}

/** Refund a deposit (partial or full). */
export async function refundDeposit(depositId, { refundAmount, refundChannel = '', refundDate = null, note = '' } = {}) {
  const ref = depositDoc(depositId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Deposit not found');
  const cur = snap.data();
  const amt = Number(refundAmount) || 0;
  if (amt <= 0) throw new Error('จำนวนคืนต้องมากกว่า 0');
  const remaining = Number(cur.remainingAmount) || 0;
  if (amt > remaining) throw new Error(`จำนวนคืนต้องไม่เกินยอดคงเหลือ (${remaining})`);
  const newRemaining = Math.max(0, remaining - amt);
  const fullRefund = newRemaining === 0;
  await updateDoc(ref, {
    status: fullRefund ? 'refunded' : cur.status === 'partial' ? 'partial' : 'active',
    refundAmount: (Number(cur.refundAmount) || 0) + amt,
    refundChannel,
    refundDate: refundDate || new Date().toISOString(),
    refundNote: note,
    remainingAmount: newRemaining,
    updatedAt: new Date().toISOString(),
  });
  await recalcCustomerDepositBalance(cur.customerId);
  return { success: true };
}

/** Delete a deposit (hard delete). Only when active and unused. */
export async function deleteDeposit(depositId) {
  const ref = depositDoc(depositId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const cur = snap.data();
    if ((Number(cur.usedAmount) || 0) > 0) {
      throw new Error('ลบไม่ได้ — มัดจำถูกใช้ไปบางส่วนแล้ว');
    }
    await deleteDoc(ref);
    await recalcCustomerDepositBalance(cur.customerId);
  }
  return { success: true };
}

/** Get all deposits (sorted by createdAt desc). */
export async function getAllDeposits() {
  const snap = await getDocs(depositsCol());
  const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return list;
}

/** Get single deposit. */
export async function getDeposit(depositId) {
  const snap = await getDoc(depositDoc(depositId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/** Get all deposits for a specific customer (sorted by createdAt desc). */
export async function getCustomerDeposits(customerId) {
  const q = query(depositsCol(), where('customerId', '==', String(customerId)));
  const snap = await getDocs(q);
  const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return list;
}

/** Get only active/partial deposits (available for use) — for SaleTab. */
export async function getActiveDeposits(customerId) {
  const all = await getCustomerDeposits(customerId);
  return all.filter(d => d.status === 'active' || d.status === 'partial');
}

/**
 * Apply a deposit to a sale atomically.
 * Reads deposit → validates remainingAmount >= amount → updates usedAmount/remainingAmount/status
 * → appends to usageHistory. Throws if insufficient.
 */
export async function applyDepositToSale(depositId, saleId, amount) {
  const amt = Number(amount) || 0;
  if (amt <= 0) throw new Error('จำนวนต้องมากกว่า 0');
  const ref = depositDoc(depositId);

  const result = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Deposit not found');
    const cur = snap.data();
    if (cur.status === 'cancelled' || cur.status === 'refunded' || cur.status === 'expired') {
      throw new Error(`มัดจำสถานะ ${cur.status} ไม่สามารถใช้ได้`);
    }
    // M1: idempotency guard — a deposit must never be applied to the same sale
    // more than once. Without this, concurrent UI clicks or retry-after-partial-
    // failure can create phantom usageHistory entries (money duplication).
    if ((cur.usageHistory || []).some(u => String(u.saleId) === String(saleId))) {
      throw new Error(`มัดจำนี้ถูกใช้กับบิล ${saleId} อยู่แล้ว`);
    }
    const remaining = Number(cur.remainingAmount) || 0;
    if (remaining < amt) {
      throw new Error(`ยอดมัดจำคงเหลือไม่พอ (มี ${remaining} บาท ต้องการ ${amt} บาท)`);
    }
    const newUsed = (Number(cur.usedAmount) || 0) + amt;
    const newRemaining = Math.max(0, remaining - amt);
    const newStatus = newRemaining === 0 ? 'used' : 'partial';
    const usage = {
      saleId: String(saleId),
      amount: amt,
      date: new Date().toISOString(),
    };
    tx.update(ref, {
      usedAmount: newUsed,
      remainingAmount: newRemaining,
      status: newStatus,
      usageHistory: [...(cur.usageHistory || []), usage],
      updatedAt: new Date().toISOString(),
    });
    return { customerId: cur.customerId, newUsed, newRemaining, newStatus };
  });

  await recalcCustomerDepositBalance(result.customerId);
  return { success: true, ...result };
}

/**
 * Reverse a deposit's usage for a specific sale (called on sale edit / cancel).
 * Finds all usage entries matching saleId and restores them.
 */
export async function reverseDepositUsage(depositId, saleId) {
  const ref = depositDoc(depositId);
  const sid = String(saleId);

  const result = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Deposit not found');
    const cur = snap.data();
    const history = Array.isArray(cur.usageHistory) ? cur.usageHistory : [];
    const matching = history.filter(u => String(u.saleId) === sid);
    if (matching.length === 0) return { customerId: cur.customerId, restored: 0 };
    const restoreAmt = matching.reduce((s, u) => s + (Number(u.amount) || 0), 0);
    const newUsed = Math.max(0, (Number(cur.usedAmount) || 0) - restoreAmt);
    const newRemaining = (Number(cur.amount) || 0) - newUsed;
    const remainingHistory = history.filter(u => String(u.saleId) !== sid);
    // Re-derive status (don't override cancelled/refunded)
    let newStatus = cur.status;
    if (cur.status === 'used' || cur.status === 'partial' || cur.status === 'active') {
      newStatus = newUsed >= cur.amount && cur.amount > 0 ? 'used' : newUsed > 0 ? 'partial' : 'active';
    }
    tx.update(ref, {
      usedAmount: newUsed,
      remainingAmount: Math.max(0, newRemaining),
      status: newStatus,
      usageHistory: remainingHistory,
      updatedAt: new Date().toISOString(),
    });
    return { customerId: cur.customerId, restored: restoreAmt };
  });

  await recalcCustomerDepositBalance(result.customerId);
  return { success: true, ...result };
}

// ─── Wallet CRUD (Phase 7) ─────────────────────────────────────────────────

const walletsCol = () => collection(db, ...basePath(), 'be_customer_wallets');
const walletDoc = (id) => doc(db, ...basePath(), 'be_customer_wallets', String(id));
const walletTxCol = () => collection(db, ...basePath(), 'be_wallet_transactions');
const walletTxDoc = (id) => doc(db, ...basePath(), 'be_wallet_transactions', String(id));

/** Composite doc id: `${customerId}__${walletTypeId}` so a customer can have one wallet per type. */
function walletKey(customerId, walletTypeId) {
  return `${String(customerId)}__${String(walletTypeId)}`;
}

/** Get or create a customer's wallet for a specific type. Returns the wallet doc. */
export async function ensureCustomerWallet(customerId, walletTypeId, walletTypeName = '') {
  const key = walletKey(customerId, walletTypeId);
  const ref = walletDoc(key);
  const snap = await getDoc(ref);
  if (snap.exists()) return { id: snap.id, ...snap.data() };
  const now = new Date().toISOString();
  const payload = {
    walletDocId: key,
    customerId: String(customerId),
    walletTypeId: String(walletTypeId),
    walletTypeName: walletTypeName || '',
    balance: 0,
    totalTopUp: 0,
    totalUsed: 0,
    lastTransactionAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(ref, payload);
  return payload;
}

/** Recalculate denormalized wallet fields on the customer doc.  */
export async function recalcCustomerWalletBalances(customerId) {
  const cid = String(customerId || '');
  if (!cid) return 0;
  const q = query(walletsCol(), where('customerId', '==', cid));
  const snap = await getDocs(q);
  const balances = {};
  let total = 0;
  snap.docs.forEach(d => {
    const w = d.data();
    balances[w.walletTypeId] = Number(w.balance) || 0;
    total += Number(w.balance) || 0;
  });
  try {
    await updateDoc(customerDoc(cid), {
      'finance.walletBalances': balances,
      'finance.totalWalletBalance': total,
    });
  } catch (e) {
    // RP5: wallet-tx log is already authoritative. If the summary field
    // update fails (customer doc missing etc.), log enough context to
    // reconcile later — do NOT surface the error (callers depend on
    // recalcCustomerWalletBalances returning the numeric total).
    console.error('[backendClient] recalcCustomerWalletBalances: finance summary update failed', {
      customerId: cid, total, error: e?.message,
    });
  }
  return total;
}

/** Get all wallets for a customer (sorted by walletTypeName). */
export async function getCustomerWallets(customerId) {
  const q = query(walletsCol(), where('customerId', '==', String(customerId)));
  const snap = await getDocs(q);
  const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  list.sort((a, b) => (a.walletTypeName || '').localeCompare(b.walletTypeName || ''));
  return list;
}

/** Get balance for a specific wallet (0 if wallet missing). */
export async function getWalletBalance(customerId, walletTypeId) {
  const snap = await getDoc(walletDoc(walletKey(customerId, walletTypeId)));
  if (!snap.exists()) return 0;
  return Number(snap.data().balance) || 0;
}

function txId() { return `WTX-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`; }

/** Top up a customer's wallet (adds to balance, creates WTX record). */
export async function topUpWallet(customerId, walletTypeId, {
  amount, walletTypeName = '', paymentChannel = '', refNo = '', note = '',
  staffId = '', staffName = '', referenceType = 'manual', referenceId = '',
} = {}) {
  const amt = Number(amount) || 0;
  if (amt <= 0) throw new Error('ยอดเติมต้องมากกว่า 0');
  await ensureCustomerWallet(customerId, walletTypeId, walletTypeName);
  const key = walletKey(customerId, walletTypeId);
  const ref = walletDoc(key);

  // M5: generate tx id outside so it's available inside the tx callback.
  // Moving the walletTx setDoc INTO runTransaction makes balance + audit log
  // atomic — a crash between them can no longer leave an orphaned balance or
  // orphaned log entry.
  const newTxId = txId();
  const result = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.data() || {};
    const before = Number(cur.balance) || 0;
    const after = before + amt;
    const now = new Date().toISOString();
    tx.update(ref, {
      balance: after,
      totalTopUp: (Number(cur.totalTopUp) || 0) + amt,
      lastTransactionAt: now,
      updatedAt: now,
    });
    tx.set(walletTxDoc(newTxId), {
      txId: newTxId,
      customerId: String(customerId),
      walletTypeId: String(walletTypeId),
      walletTypeName,
      type: 'topup',
      amount: amt,
      balanceBefore: before,
      balanceAfter: after,
      referenceType, referenceId: String(referenceId || ''),
      paymentChannel, refNo,
      note, staffId, staffName,
      createdAt: now,
    });
    return { before, after };
  });

  await recalcCustomerWalletBalances(customerId);
  return { success: true, txId: newTxId, ...result };
}

/** Deduct from wallet (for sale/treatment apply). Throws if insufficient balance. */
export async function deductWallet(customerId, walletTypeId, {
  amount, walletTypeName = '', note = '', staffId = '', staffName = '',
  referenceType = 'sale', referenceId = '',
} = {}) {
  const amt = Number(amount) || 0;
  if (amt <= 0) throw new Error('ยอดหักต้องมากกว่า 0');
  const key = walletKey(customerId, walletTypeId);
  const ref = walletDoc(key);

  // M5: atomic balance + tx-log write.
  const newTxId = txId();
  const result = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('ไม่พบกระเป๋าเงินของลูกค้า');
    const cur = snap.data();
    const before = Number(cur.balance) || 0;
    if (before < amt) throw new Error(`ยอดกระเป๋าไม่พอ (มี ${before} ต้องการ ${amt})`);
    const after = before - amt;
    const now = new Date().toISOString();
    tx.update(ref, {
      balance: after,
      totalUsed: (Number(cur.totalUsed) || 0) + amt,
      lastTransactionAt: now,
      updatedAt: now,
    });
    tx.set(walletTxDoc(newTxId), {
      txId: newTxId,
      customerId: String(customerId),
      walletTypeId: String(walletTypeId),
      walletTypeName,
      type: 'deduct',
      amount: amt,
      balanceBefore: before,
      balanceAfter: after,
      referenceType, referenceId: String(referenceId || ''),
      paymentChannel: '', refNo: '',
      note, staffId, staffName,
      createdAt: now,
    });
    return { before, after };
  });

  await recalcCustomerWalletBalances(customerId);
  return { success: true, txId: newTxId, ...result };
}

/** Refund amount back to wallet (on sale cancel/edit). */
export async function refundToWallet(customerId, walletTypeId, {
  amount, walletTypeName = '', note = '', staffId = '', staffName = '',
  referenceType = 'sale', referenceId = '',
} = {}) {
  const amt = Number(amount) || 0;
  if (amt <= 0) throw new Error('ยอดคืนต้องมากกว่า 0');
  await ensureCustomerWallet(customerId, walletTypeId, walletTypeName);
  const key = walletKey(customerId, walletTypeId);
  const ref = walletDoc(key);

  // M5: atomic balance + tx-log write.
  const newTxId = txId();
  const result = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.data() || {};
    const before = Number(cur.balance) || 0;
    const after = before + amt;
    const now = new Date().toISOString();
    tx.update(ref, {
      balance: after,
      // totalUsed is NOT decremented so lifetime usage metrics stay accurate
      lastTransactionAt: now,
      updatedAt: now,
    });
    tx.set(walletTxDoc(newTxId), {
      txId: newTxId,
      customerId: String(customerId),
      walletTypeId: String(walletTypeId),
      walletTypeName,
      type: 'refund',
      amount: amt,
      balanceBefore: before,
      balanceAfter: after,
      referenceType, referenceId: String(referenceId || ''),
      paymentChannel: '', refNo: '',
      note, staffId, staffName,
      createdAt: now,
    });
    return { before, after };
  });

  await recalcCustomerWalletBalances(customerId);
  return { success: true, txId: newTxId, ...result };
}

/** Manual ± adjust. `isIncrease = true` adds, false subtracts. */
export async function adjustWallet(customerId, walletTypeId, {
  amount, isIncrease = true, walletTypeName = '', note = '',
  staffId = '', staffName = '',
} = {}) {
  const amt = Number(amount) || 0;
  if (amt <= 0) throw new Error('ยอดปรับต้องมากกว่า 0');
  await ensureCustomerWallet(customerId, walletTypeId, walletTypeName);
  const key = walletKey(customerId, walletTypeId);
  const ref = walletDoc(key);

  // M5: atomic balance + tx-log write.
  const newTxId = txId();
  const result = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.data() || {};
    const before = Number(cur.balance) || 0;
    const after = isIncrease ? before + amt : Math.max(0, before - amt);
    const delta = after - before;
    const now = new Date().toISOString();
    tx.update(ref, {
      balance: after,
      ...(delta > 0 ? { totalTopUp: (Number(cur.totalTopUp) || 0) + delta } : {}),
      ...(delta < 0 ? { totalUsed: (Number(cur.totalUsed) || 0) + Math.abs(delta) } : {}),
      lastTransactionAt: now,
      updatedAt: now,
    });
    tx.set(walletTxDoc(newTxId), {
      txId: newTxId,
      customerId: String(customerId),
      walletTypeId: String(walletTypeId),
      walletTypeName,
      type: 'adjust',
      amount: Math.abs(delta),
      balanceBefore: before,
      balanceAfter: after,
      referenceType: 'manual', referenceId: '',
      paymentChannel: '', refNo: '',
      note, staffId, staffName,
      createdAt: now,
    });
    return { before, after, delta };
  });

  await recalcCustomerWalletBalances(customerId);
  return { success: true, txId: newTxId, ...result };
}

/** Get wallet transactions — optionally filter by walletTypeId. Sorted desc. */
export async function getWalletTransactions(customerId, walletTypeId = null) {
  const q = query(walletTxCol(), where('customerId', '==', String(customerId)));
  const snap = await getDocs(q);
  let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (walletTypeId) list = list.filter(tx => String(tx.walletTypeId) === String(walletTypeId));
  list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return list;
}

// ─── Membership CRUD (Phase 7) ─────────────────────────────────────────────

const membershipsCol = () => collection(db, ...basePath(), 'be_memberships');
const membershipDoc = (id) => doc(db, ...basePath(), 'be_memberships', String(id));

/** Create a membership card for a customer + side-effects (credit wallet, grant initial points).
 *  Saves wallet/point tx references back onto the membership doc for traceability. */
export async function createMembership(data) {
  const membershipId = `MBR-${Date.now()}`;
  const now = new Date().toISOString();
  const activatedAt = data.activatedAt || now;
  const expiredInDays = Number(data.expiredInDays) || 365;
  const expiresAt = new Date(new Date(activatedAt).getTime() + expiredInDays * 86400000).toISOString();

  const payload = {
    membershipId,
    customerId: String(data.customerId),
    customerName: data.customerName || '',
    customerHN: data.customerHN || '',
    cardTypeId: String(data.cardTypeId || ''),
    cardTypeName: data.cardTypeName || '',
    cardColor: data.cardColor || '',
    colorName: data.colorName || '',
    purchasePrice: Number(data.purchasePrice) || 0,
    initialCredit: Number(data.initialCredit) || 0,
    discountPercent: Number(data.discountPercent) || 0,
    initialPoints: Number(data.initialPoints) || 0,
    bahtPerPoint: Number(data.bahtPerPoint) || 0,
    walletTypeId: data.walletTypeId ? String(data.walletTypeId) : '',
    walletTypeName: data.walletTypeName || '',
    status: 'active',
    activatedAt,
    expiresAt,
    cancelledAt: null,
    cancelNote: '',
    cancelEvidenceUrl: '',
    paymentChannel: data.paymentChannel || '',
    paymentDate: data.paymentDate || activatedAt.slice(0, 10),
    paymentTime: data.paymentTime || '',
    refNo: data.refNo || '',
    paymentEvidenceUrl: data.paymentEvidenceUrl || '',
    sellers: Array.isArray(data.sellers) ? data.sellers : [],
    note: data.note || '',
    renewals: [],
    walletCredited: false,
    pointsCredited: false,
    walletTxId: null,
    pointTxId: null,
    linkedSaleId: data.linkedSaleId || null,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(membershipDoc(membershipId), payload);

  // ─── Side-effects: wallet credit + initial points ─────────────────────
  let walletTxId = null;
  if (payload.initialCredit > 0 && payload.walletTypeId) {
    try {
      const res = await topUpWallet(payload.customerId, payload.walletTypeId, {
        amount: payload.initialCredit,
        walletTypeName: payload.walletTypeName,
        note: `เครดิตจากบัตร ${payload.cardTypeName}`,
        referenceType: 'membership',
        referenceId: membershipId,
        staffId: (payload.sellers[0] && payload.sellers[0].id) || '',
        staffName: (payload.sellers[0] && payload.sellers[0].name) || '',
      });
      walletTxId = res.txId;
    } catch (e) { console.warn('[createMembership] wallet credit failed:', e); }
  }
  let pointTxId = null;
  if (payload.initialPoints > 0) {
    try {
      const res = await _earnPointsInternal(payload.customerId, payload.initialPoints, {
        type: 'membership_initial',
        note: `คะแนนเริ่มต้นจากบัตร ${payload.cardTypeName}`,
        referenceType: 'membership',
        referenceId: membershipId,
        staffId: (payload.sellers[0] && payload.sellers[0].id) || '',
        staffName: (payload.sellers[0] && payload.sellers[0].name) || '',
      });
      pointTxId = res.txId;
    } catch (e) { console.warn('[createMembership] points credit failed:', e); }
  }

  await updateDoc(membershipDoc(membershipId), {
    walletCredited: !!walletTxId,
    pointsCredited: !!pointTxId,
    walletTxId, pointTxId,
    updatedAt: new Date().toISOString(),
  });

  // Denormalise membership summary onto customer doc
  try {
    await updateDoc(customerDoc(payload.customerId), {
      'finance.membershipId': membershipId,
      'finance.membershipType': payload.cardTypeName,
      'finance.membershipExpiry': expiresAt,
      'finance.membershipDiscountPercent': payload.discountPercent,
    });
  } catch (e) {
    // RP5: membership doc is authoritative; summary on customer may drift.
    console.error('[backendClient] createMembership: customer finance summary update failed', {
      customerId: String(payload.customerId), membershipId, error: e?.message,
    });
  }

  return { membershipId, walletTxId, pointTxId, success: true };
}

/** Update a membership doc (manual tweaks: note, sellers, refNo). Does NOT run side-effects. */
export async function updateMembership(membershipId, data) {
  const ref = membershipDoc(membershipId);
  const { walletCredited, pointsCredited, walletTxId, pointTxId, membershipId: _id, customerId: _cid, ...clean } = data; // avoid clobbering refs
  await updateDoc(ref, { ...clean, updatedAt: new Date().toISOString() });
  return { success: true };
}

/** Renew a membership — extend expiresAt + push to renewals[]. No wallet/points credit by default. */
export async function renewMembership(membershipId, {
  extendDays = 365, price = 0, paymentChannel = '', refNo = '',
  note = '', grantCredit = 0, grantPoints = 0,
} = {}) {
  const ref = membershipDoc(membershipId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Membership not found');
  const cur = snap.data();
  const now = new Date().toISOString();
  const baseTime = Math.max(
    Date.now(),
    cur.expiresAt ? new Date(cur.expiresAt).getTime() : Date.now()
  );
  const newExpiry = new Date(baseTime + Number(extendDays) * 86400000).toISOString();

  const renewals = Array.isArray(cur.renewals) ? [...cur.renewals] : [];
  renewals.push({
    renewedAt: now,
    expiresAt: newExpiry,
    price: Number(price) || 0,
    paymentChannel, refNo, note,
    grantCredit: Number(grantCredit) || 0,
    grantPoints: Number(grantPoints) || 0,
  });

  await updateDoc(ref, {
    expiresAt: newExpiry,
    renewals,
    status: 'active',
    updatedAt: now,
  });

  if (grantCredit > 0 && cur.walletTypeId) {
    try {
      await topUpWallet(cur.customerId, cur.walletTypeId, {
        amount: grantCredit,
        walletTypeName: cur.walletTypeName,
        note: `ต่ออายุบัตร ${cur.cardTypeName}`,
        referenceType: 'membership',
        referenceId: membershipId,
      });
    } catch (e) { console.warn('[renewMembership] grant credit failed:', e); }
  }
  if (grantPoints > 0) {
    try {
      await _earnPointsInternal(cur.customerId, grantPoints, {
        type: 'earn',
        note: `ต่ออายุบัตร ${cur.cardTypeName}`,
        referenceType: 'membership',
        referenceId: membershipId,
      });
    } catch (e) { console.warn('[renewMembership] grant points failed:', e); }
  }

  try {
    await updateDoc(customerDoc(cur.customerId), {
      'finance.membershipExpiry': newExpiry,
    });
  } catch (e) {
    // RP5: membership doc carries the authoritative expiry.
    console.error('[backendClient] renewMembership: customer finance summary update failed', {
      customerId: String(cur.customerId), newExpiry, error: e?.message,
    });
  }
  return { success: true, expiresAt: newExpiry };
}

/** Cancel a membership. ProClinic policy: DO NOT refund credit/points. */
export async function cancelMembership(membershipId, { cancelNote = '', cancelEvidenceUrl = '' } = {}) {
  const ref = membershipDoc(membershipId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Membership not found');
  const cur = snap.data();
  const now = new Date().toISOString();
  await updateDoc(ref, {
    status: 'cancelled',
    cancelNote,
    cancelEvidenceUrl,
    cancelledAt: now,
    updatedAt: now,
  });
  try {
    await updateDoc(customerDoc(cur.customerId), {
      'finance.membershipId': null,
      'finance.membershipType': null,
      'finance.membershipExpiry': null,
      'finance.membershipDiscountPercent': 0,
    });
  } catch (e) {
    // RP5: membership cancel already wrote the membership doc.
    console.error('[backendClient] cancelMembership: customer finance summary clear failed', {
      customerId: String(cur.customerId), error: e?.message,
    });
  }
  return { success: true };
}

/** Get active membership for a customer (or null). Also marks expired ones as 'expired'. */
export async function getCustomerMembership(customerId) {
  const q = query(membershipsCol(), where('customerId', '==', String(customerId)));
  const snap = await getDocs(q);
  const now = Date.now();
  const active = [];
  for (const d of snap.docs) {
    const m = { id: d.id, ...d.data() };
    if (m.status === 'active') {
      if (m.expiresAt && new Date(m.expiresAt).getTime() < now) {
        // Lazy expire
        try {
          await updateDoc(d.ref, { status: 'expired', updatedAt: new Date().toISOString() });
        } catch (e) {
          // RP5: membership doc stays 'active' but read logic treats it as expired below.
          console.error('[backendClient] getCustomerMembership: lazy-expire write failed', {
            membershipId: m.id, error: e?.message,
          });
        }
        try {
          await updateDoc(customerDoc(customerId), {
            'finance.membershipId': null,
            'finance.membershipType': null,
            'finance.membershipExpiry': null,
            'finance.membershipDiscountPercent': 0,
          });
        } catch (e) {
          console.error('[backendClient] getCustomerMembership: finance summary clear failed', {
            customerId: String(customerId), error: e?.message,
          });
        }
        m.status = 'expired';
      } else {
        active.push(m);
      }
    }
  }
  active.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return active[0] || null;
}

/** Get all memberships (sorted desc). */
export async function getAllMemberships() {
  const snap = await getDocs(membershipsCol());
  const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return list;
}

/** Get discount % for a customer's active membership (0 if none). */
export async function getCustomerMembershipDiscount(customerId) {
  const m = await getCustomerMembership(customerId);
  return m ? (Number(m.discountPercent) || 0) : 0;
}

/** Return bahtPerPoint rate for the customer (from active membership; 0 = no points). */
export async function getCustomerBahtPerPoint(customerId) {
  const m = await getCustomerMembership(customerId);
  return m ? (Number(m.bahtPerPoint) || 0) : 0;
}

/** Delete a membership (hard delete). For corrections only — does NOT reverse side-effects. */
export async function deleteMembership(membershipId) {
  const ref = membershipDoc(membershipId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const cur = snap.data();
    await deleteDoc(ref);
    try {
      await updateDoc(customerDoc(cur.customerId), {
        'finance.membershipId': null,
        'finance.membershipType': null,
        'finance.membershipExpiry': null,
        'finance.membershipDiscountPercent': 0,
      });
    } catch {}
  }
  return { success: true };
}

// ─── Points CRUD (Phase 7) ─────────────────────────────────────────────────

const pointTxCol = () => collection(db, ...basePath(), 'be_point_transactions');
const pointTxDoc = (id) => doc(db, ...basePath(), 'be_point_transactions', String(id));

function ptxId() { return `PTX-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`; }

/** Read customer's current point balance (from customer doc). */
export async function getPointBalance(customerId) {
  try {
    const snap = await getDoc(customerDoc(customerId));
    if (!snap.exists()) return 0;
    return Number(snap.data().finance?.loyaltyPoints) || 0;
  } catch { return 0; }
}

/** Internal: create a point transaction record + update customer balance. */
async function _earnPointsInternal(customerId, points, meta = {}) {
  const amt = Number(points) || 0;
  if (amt <= 0) return { success: true, txId: null, pointsAfter: await getPointBalance(customerId) };
  const before = await getPointBalance(customerId);
  const after = before + amt;
  const newTxId = ptxId();
  await setDoc(pointTxDoc(newTxId), {
    ptxId: newTxId,
    customerId: String(customerId),
    type: meta.type || 'earn',
    amount: amt,
    pointsBefore: before,
    pointsAfter: after,
    referenceType: meta.referenceType || 'manual',
    referenceId: String(meta.referenceId || ''),
    purchaseAmount: Number(meta.purchaseAmount) || 0,
    bahtPerPoint: Number(meta.bahtPerPoint) || 0,
    note: meta.note || '',
    staffId: meta.staffId || '',
    staffName: meta.staffName || '',
    createdAt: new Date().toISOString(),
  });
  try {
    await updateDoc(customerDoc(customerId), { 'finance.loyaltyPoints': after });
  } catch (e) {
    // M9: the point tx log above was already written, so the audit trail is
    // complete. Only the customer summary field failed to update (likely
    // customer doc missing or permission error). Flag with structured data
    // so a nightly reconciler can detect and repair the drift.
    console.error('[backendClient] _earnPointsInternal: finance.loyaltyPoints update failed — tx log is authoritative, summary stale', {
      customerId: String(customerId), txId: newTxId, pointsBefore: before, expectedAfter: after, error: e?.message,
    });
  }
  return { success: true, txId: newTxId, pointsBefore: before, pointsAfter: after };
}

/** Earn points from a sale based on bahtPerPoint rate. */
export async function earnPoints(customerId, {
  purchaseAmount, bahtPerPoint, referenceType = 'sale', referenceId = '',
  note = '', staffId = '', staffName = '',
} = {}) {
  const p = Number(purchaseAmount) || 0;
  const b = Number(bahtPerPoint) || 0;
  if (b <= 0 || p <= 0) return { success: true, txId: null, earned: 0 };
  const earned = Math.floor(p / b);
  if (earned <= 0) return { success: true, txId: null, earned: 0 };
  const res = await _earnPointsInternal(customerId, earned, {
    type: 'earn',
    referenceType, referenceId,
    purchaseAmount: p, bahtPerPoint: b,
    note: note || `สะสมจากการซื้อ ${p} บาท`,
    staffId, staffName,
  });
  return { ...res, earned };
}

/** Manually adjust points (±). */
export async function adjustPoints(customerId, {
  amount, isIncrease = true, note = '', staffId = '', staffName = '',
} = {}) {
  const amt = Number(amount) || 0;
  if (amt <= 0) throw new Error('จำนวนต้องมากกว่า 0');
  if (isIncrease) {
    return await _earnPointsInternal(customerId, amt, {
      type: 'adjust', note, staffId, staffName,
      referenceType: 'manual',
    });
  }
  // Deduct
  const before = await getPointBalance(customerId);
  if (before < amt) throw new Error(`คะแนนไม่พอ (มี ${before} ต้องการ ${amt})`);
  const after = before - amt;
  const newTxId = ptxId();
  await setDoc(pointTxDoc(newTxId), {
    ptxId: newTxId,
    customerId: String(customerId),
    type: 'adjust',
    amount: amt,
    pointsBefore: before,
    pointsAfter: after,
    referenceType: 'manual', referenceId: '',
    purchaseAmount: 0, bahtPerPoint: 0,
    note, staffId, staffName,
    createdAt: new Date().toISOString(),
  });
  try {
    await updateDoc(customerDoc(customerId), { 'finance.loyaltyPoints': after });
  } catch (e) {
    // M9: see _earnPointsInternal for rationale. Tx log authoritative; summary drift flagged.
    console.error('[backendClient] adjustPoints: finance.loyaltyPoints update failed — tx log is authoritative, summary stale', {
      customerId: String(customerId), txId: newTxId, pointsBefore: before, expectedAfter: after, error: e?.message,
    });
  }
  return { success: true, txId: newTxId, pointsBefore: before, pointsAfter: after };
}

/** Reverse points earned from a sale (for cancel/delete). */
export async function reversePointsEarned(customerId, referenceId) {
  const q = query(pointTxCol(),
    where('customerId', '==', String(customerId)),
    where('referenceId', '==', String(referenceId)),
  );
  const snap = await getDocs(q);
  let totalReversed = 0;
  for (const d of snap.docs) {
    const tx = d.data();
    if (tx.type !== 'earn') continue;
    totalReversed += Number(tx.amount) || 0;
  }
  if (totalReversed > 0) {
    const before = await getPointBalance(customerId);
    const after = Math.max(0, before - totalReversed);
    const newTxId = ptxId();
    await setDoc(pointTxDoc(newTxId), {
      ptxId: newTxId,
      customerId: String(customerId),
      type: 'reverse',
      amount: totalReversed,
      pointsBefore: before,
      pointsAfter: after,
      referenceType: 'sale', referenceId: String(referenceId),
      note: `คืนคะแนนจากการยกเลิก/ลบ ${referenceId}`,
      staffId: '', staffName: '',
      createdAt: new Date().toISOString(),
    });
    try {
      await updateDoc(customerDoc(customerId), { 'finance.loyaltyPoints': after });
    } catch (e) {
      // M9: see _earnPointsInternal for rationale.
      console.error('[backendClient] reversePointsEarned: finance.loyaltyPoints update failed — tx log is authoritative, summary stale', {
        customerId: String(customerId), txId: newTxId, pointsBefore: before, expectedAfter: after, error: e?.message,
      });
    }
  }
  return { success: true, reversed: totalReversed };
}

/** Get all point transactions for a customer (desc). */
export async function getPointTransactions(customerId) {
  const q = query(pointTxCol(), where('customerId', '==', String(customerId)));
  const snap = await getDocs(q);
  const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return list;
}

/** Run sync: call broker function → write metadata + items to Firestore.
 *  Same logic as ClinicSettingsPanel.jsx lines 621-644. */
export async function runMasterDataSync(type, syncFn) {
  const data = await syncFn();
  if (!data?.success) return { success: false, error: data?.error || 'Sync failed' };
  if (!data.items?.length) return { success: true, count: 0, totalPages: 0 };

  // Write metadata
  await setDoc(masterDataDoc(type), {
    type,
    count: data.items.length,
    totalPages: data.totalPages || 1,
    syncedAt: new Date().toISOString(),
  });

  // Write items in batches of 400 (Firestore limit = 500 ops per batch)
  const BATCH_LIMIT = 400;
  for (let start = 0; start < data.items.length; start += BATCH_LIMIT) {
    const chunk = data.items.slice(start, start + BATCH_LIMIT);
    const batch = writeBatch(db);
    chunk.forEach((item, i) => {
      const ref = doc(db, ...basePath(), 'master_data', type, 'items', String(item.id || (start + i)));
      batch.set(ref, { ...item, _syncedAt: new Date().toISOString() });
    });
    await batch.commit();
  }

  return { success: true, count: data.items.length, totalPages: data.totalPages || 1 };
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 8 — Stock System Primitives
// ═══════════════════════════════════════════════════════════════════════════
// Core CRUD for stock orders, batches, adjustments, movements. Sale/treatment
// hooks and transfer/withdrawal state machines come in later sub-phases.
//
// Rule: every batch mutation must be append-only to the movement log. Never
// update or delete a movement — only write a reverse entry that points back
// via `reversedByMovementId`. MOPH audit relies on this invariant.
// ═══════════════════════════════════════════════════════════════════════════

const stockBatchesCol = () => collection(db, ...basePath(), 'be_stock_batches');
const stockBatchDoc = (id) => doc(db, ...basePath(), 'be_stock_batches', String(id));
const stockOrdersCol = () => collection(db, ...basePath(), 'be_stock_orders');
const stockOrderDoc = (id) => doc(db, ...basePath(), 'be_stock_orders', String(id));
const stockMovementsCol = () => collection(db, ...basePath(), 'be_stock_movements');
const stockMovementDoc = (id) => doc(db, ...basePath(), 'be_stock_movements', String(id));
const stockAdjustmentsCol = () => collection(db, ...basePath(), 'be_stock_adjustments');
const stockAdjustmentDoc = (id) => doc(db, ...basePath(), 'be_stock_adjustments', String(id));

// ─── ID generators ──────────────────────────────────────────────────────────
// batches + movements + adjustments get a 4-char random suffix because multiple
// can be written in the same millisecond (a single order creates many).
function _rand4() {
  return Math.random().toString(36).slice(2, 6);
}
function _genBatchId() { return `BATCH-${Date.now()}-${_rand4()}`; }
function _genOrderId() { return `ORD-${Date.now()}-${_rand4()}`; }
function _genMovementId() { return `MVT-${Date.now()}-${_rand4()}`; }
function _genAdjustmentId() { return `ADJ-${Date.now()}-${_rand4()}`; }

/**
 * S12: every stock movement must have a non-empty actor for MOPH audit.
 * UI callers sometimes pass `{ userId: '', userName: '' }` when no seller is
 * selected — that bypasses trivial truthy checks and pollutes the log with
 * anonymous entries. This normalizer coerces blanks to the synthetic
 * `system`/`ระบบ` user and logs a warning so we can hunt down UI callers
 * that should be passing a real auth.currentUser.
 */
function _normalizeAuditUser(user) {
  const u = user || {};
  const userId = String(u.userId || '').trim();
  const userName = String(u.userName || '').trim();
  if (!userId || !userName) {
    try { console.warn('[backendClient] audit user missing — falling back to system user'); } catch {}
    return { userId: userId || 'system', userName: userName || 'ระบบ' };
  }
  return { userId, userName };
}

// ─── Stock read helpers ────────────────────────────────────────────────────

/** Fetch one batch by id. */
export async function getStockBatch(batchId) {
  const snap = await getDoc(stockBatchDoc(batchId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * List batches for a product at a branch. Caller filters by status as needed.
 * Returns sorted by receivedAt ASC (so batchFifoAllocate can consume).
 */
export async function listStockBatches({ productId, branchId, status } = {}) {
  const clauses = [];
  if (productId) clauses.push(where('productId', '==', String(productId)));
  if (branchId) clauses.push(where('branchId', '==', String(branchId)));
  if (status) clauses.push(where('status', '==', String(status)));
  const q = clauses.length
    ? query(stockBatchesCol(), ...clauses)
    : stockBatchesCol();
  const snap = await getDocs(q);
  const batches = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  batches.sort((a, b) => (a.receivedAt || '').localeCompare(b.receivedAt || ''));
  return batches;
}

/** Fetch one order by id (includes items). */
export async function getStockOrder(orderId) {
  const snap = await getDoc(stockOrderDoc(orderId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** List orders with optional filters. Sorted by importedDate DESC (newest first). */
export async function listStockOrders({ branchId, status } = {}) {
  const clauses = [];
  if (branchId) clauses.push(where('branchId', '==', String(branchId)));
  if (status) clauses.push(where('status', '==', String(status)));
  const q = clauses.length
    ? query(stockOrdersCol(), ...clauses)
    : stockOrdersCol();
  const snap = await getDocs(q);
  const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  orders.sort((a, b) => (b.importedDate || '').localeCompare(a.importedDate || ''));
  return orders;
}

/**
 * Query movements by arbitrary link IDs — used by reverseStockForSale /
 * analyzeStockImpact in later sub-phases.
 *
 * Filters: linkedSaleId, linkedTreatmentId, linkedOrderId, linkedAdjustId,
 *          linkedTransferId, linkedWithdrawalId, batchId, productId, branchId,
 *          type, includeReversed (default false — hide already-reversed entries)
 */
export async function listStockMovements(filters = {}) {
  const clauses = [];
  const mapFields = [
    'linkedSaleId', 'linkedTreatmentId', 'linkedOrderId', 'linkedAdjustId',
    'linkedTransferId', 'linkedWithdrawalId', 'batchId', 'productId', 'branchId',
  ];
  for (const f of mapFields) {
    if (filters[f] != null) clauses.push(where(f, '==', String(filters[f])));
  }
  if (filters.type != null) clauses.push(where('type', '==', Number(filters.type)));
  const q = clauses.length ? query(stockMovementsCol(), ...clauses) : stockMovementsCol();
  const snap = await getDocs(q);
  let mvts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (!filters.includeReversed) {
    // Hide both sides of a reversed pair: the original (reversedByMovementId set)
    // AND the compensating reverse entry (reverseOf set). Default view = live, un-reversed activity only.
    mvts = mvts.filter(m => !m.reversedByMovementId && !m.reverseOf);
  }
  mvts.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  return mvts;
}

// ─── Stock Order CRUD ───────────────────────────────────────────────────────

/**
 * Create a vendor order: one order doc + N batch docs + N IMPORT movements.
 *
 * NOT wrapped in runTransaction because these are all new documents (no
 * contention). If a write fails mid-way we leave orphan batches — acceptable
 * trade-off for Phase 8a (Phase 8d UI will add journalling).
 *
 * @param {object} data
 *   - vendorName, importedDate (ISO or yyyy-mm-dd), note, branchId
 *   - discount, discountType ('amount' | 'percent')
 *   - items: [{ productId, productName, qty, cost, expiresAt?, isPremium?, unit? }]
 * @param {object} [opts]
 *   - user: { userId, userName }
 * @returns { orderId, batchIds[] }
 */
export async function createStockOrder(data, opts = {}) {
  const { stockUtils } = await _stockLib();
  const { MOVEMENT_TYPES, BATCH_STATUS, buildQtyNumeric, DEFAULT_BRANCH_ID } = stockUtils;

  const items = Array.isArray(data?.items) ? data.items : [];
  if (items.length === 0) throw new Error('Order must have at least one item');

  const orderId = _genOrderId();
  const branchId = String(data.branchId || DEFAULT_BRANCH_ID);
  const importedDate = data.importedDate || new Date().toISOString();
  const now = new Date().toISOString();
  const user = _normalizeAuditUser(opts.user);

  const batchIds = [];
  const resolvedItems = [];

  for (const [idx, item] of items.entries()) {
    const qtyNum = Number(item.qty);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      throw new Error(`Item #${idx + 1} invalid qty: ${item.qty}`);
    }
    const batchId = _genBatchId();
    const orderProductId = item.orderProductId || `${orderId}-${idx}`;
    const cost = Number(item.cost) || 0;
    const isPremium = !!item.isPremium;

    // First time we see this productId via an order → opt it in to stock tracking.
    // If stockConfig already exists (user set trackStock=false deliberately, or it's
    // already true), leave it alone. Missing stockConfig only.
    //
    // Phase 12.2b follow-up (2026-04-24): write to be_products (Rule H-tris
    // — single source of truth). Legacy master_data fallback kept ONLY for
    // docs that haven't been migrated yet; if the be_products doc doesn't
    // exist either, silently skip the opt-in (product likely deleted).
    if (item.productId) {
      try {
        const existing = await _getProductStockConfig(item.productId);
        if (!existing) {
          const beRef = doc(db, ...basePath(), 'be_products', String(item.productId));
          const beSnap = await getDoc(beRef);
          if (beSnap.exists()) {
            await updateDoc(beRef, {
              stockConfig: {
                trackStock: true,
                minAlert: 0,
                unit: String(item.unit || ''),
                isControlled: false,
              },
              _stockConfigSetBy: 'createStockOrder',
              _stockConfigSetAt: now,
            });
          } else {
            // Last-chance legacy fallback — should be rare post-Phase 11.9.
            const legacyRef = doc(db, ...basePath(), 'master_data', 'products', 'items', String(item.productId));
            const legacySnap = await getDoc(legacyRef);
            if (legacySnap.exists()) {
              await updateDoc(legacyRef, {
                stockConfig: {
                  trackStock: true,
                  minAlert: 0,
                  unit: String(item.unit || ''),
                  isControlled: false,
                },
                _stockConfigSetBy: 'createStockOrder',
                _stockConfigSetAt: now,
              });
            }
          }
        }
      } catch (e) {
        console.warn('[createStockOrder] failed to auto-set stockConfig for', item.productId, e);
      }
    }

    // 1. Create batch doc
    await setDoc(stockBatchDoc(batchId), {
      batchId,
      productId: String(item.productId || ''),
      productName: String(item.productName || ''),
      branchId,
      orderProductId,
      sourceOrderId: orderId,
      receivedAt: now,
      expiresAt: item.expiresAt || null,
      unit: String(item.unit || ''),
      qty: buildQtyNumeric(qtyNum),
      originalCost: cost,
      isPremium,
      status: BATCH_STATUS.ACTIVE,
      createdAt: now,
      updatedAt: now,
    });

    // 2. Append IMPORT movement (type=1) — immutable log entry
    const movementId = _genMovementId();
    await setDoc(stockMovementDoc(movementId), {
      movementId,
      type: MOVEMENT_TYPES.IMPORT,
      batchId,
      productId: String(item.productId || ''),
      productName: String(item.productName || ''),
      qty: qtyNum,
      before: 0,
      after: qtyNum,
      branchId,
      sourceDocPath: `artifacts/${appId}/public/data/be_stock_orders/${orderId}`,
      linkedOrderId: orderId,
      revenueImpact: 0,
      costBasis: cost * qtyNum,
      isPremium,
      user,
      note: data.note || '',
      createdAt: now,
    });

    batchIds.push(batchId);
    resolvedItems.push({
      orderProductId, batchId,
      productId: String(item.productId || ''),
      productName: String(item.productName || ''),
      qty: qtyNum,
      cost,
      expiresAt: item.expiresAt || null,
      isPremium,
      unit: String(item.unit || ''),
    });
  }

  // 3. Finally: create the order doc (with resolved batchIds baked in)
  await setDoc(stockOrderDoc(orderId), {
    orderId,
    vendorName: String(data.vendorName || ''),
    importedDate,
    branchId,
    note: String(data.note || ''),
    discount: Number(data.discount) || 0,
    discountType: data.discountType === 'percent' ? 'percent' : 'amount',
    items: resolvedItems,
    status: 'active',
    createdBy: user,
    createdAt: now,
    updatedAt: now,
  });

  return { orderId, batchIds, success: true };
}

/**
 * Cancel an order: blocked if any batch has had activity beyond the initial
 * IMPORT movement (ProClinic parity — once units have been sold/used, you
 * can't rewind the whole order).
 *
 * On success: marks order cancelled + each batch cancelled + emits CANCEL_IMPORT
 * (type=14) movement per batch.
 *
 * @returns { cancelledBatchIds[], movementIds[] }
 */
export async function cancelStockOrder(orderId, opts = {}) {
  const { stockUtils } = await _stockLib();
  const { MOVEMENT_TYPES, BATCH_STATUS } = stockUtils;

  const order = await getStockOrder(orderId);
  if (!order) throw new Error(`Order ${orderId} not found`);
  if (order.status === 'cancelled') {
    return { orderId, cancelledBatchIds: [], movementIds: [], alreadyCancelled: true };
  }

  // Check every batch: must have IMPORT movement only (nothing else).
  const batchIds = (order.items || []).map(it => it.batchId).filter(Boolean);
  for (const batchId of batchIds) {
    const allMvts = await listStockMovements({ batchId, includeReversed: true });
    const nonImport = allMvts.filter(m => m.type !== MOVEMENT_TYPES.IMPORT);
    if (nonImport.length > 0) {
      throw new Error(
        `Cannot cancel order ${orderId}: batch ${batchId} has ${nonImport.length} non-import movement(s). ` +
        `ยกเลิกคำสั่งซื้อไม่ได้เพราะสินค้าบางส่วนถูกใช้แล้ว`
      );
    }
  }

  const now = new Date().toISOString();
  const user = _normalizeAuditUser(opts.user);
  const reason = String(opts.reason || '');
  const movementIds = [];

  for (const batchId of batchIds) {
    const batch = await getStockBatch(batchId);
    if (!batch) continue;
    const total = Number(batch.qty?.total) || 0;

    // Flip batch → cancelled
    await updateDoc(stockBatchDoc(batchId), {
      status: BATCH_STATUS.CANCELLED,
      qty: { remaining: 0, total },
      updatedAt: now,
      cancelReason: reason,
    });

    // Append CANCEL_IMPORT movement
    const movementId = _genMovementId();
    await setDoc(stockMovementDoc(movementId), {
      movementId,
      type: MOVEMENT_TYPES.CANCEL_IMPORT,
      batchId,
      productId: batch.productId,
      productName: batch.productName,
      qty: -total,
      before: total,
      after: 0,
      branchId: batch.branchId,
      sourceDocPath: `artifacts/${appId}/public/data/be_stock_orders/${orderId}`,
      linkedOrderId: orderId,
      revenueImpact: 0,
      costBasis: (Number(batch.originalCost) || 0) * total,
      isPremium: !!batch.isPremium,
      user,
      note: reason,
      createdAt: now,
    });
    movementIds.push(movementId);
  }

  await updateDoc(stockOrderDoc(orderId), {
    status: 'cancelled',
    cancelReason: reason,
    cancelledAt: now,
    cancelledBy: user,
    updatedAt: now,
  });

  return { orderId, cancelledBatchIds: batchIds, movementIds, success: true };
}

/**
 * Update an order's mutable fields — note, vendor, and per-item cost/expiresAt.
 * Qty edits are BLOCKED (throws) because the batch qty is the source of truth
 * and changing it here would desync the movement log.
 *
 * Cost updates cascade to the batch's originalCost (affects future movement
 * costBasis calculations). Past movements' costBasis remain frozen (audit trail).
 *
 * @param {string} orderId
 * @param {object} patch
 *   - note?, vendorName?, discount?, discountType?
 *   - items?: [{ orderProductId, cost?, expiresAt? }]  // qty NOT allowed
 */
export async function updateStockOrder(orderId, patch) {
  const order = await getStockOrder(orderId);
  if (!order) throw new Error(`Order ${orderId} not found`);
  if (order.status === 'cancelled') throw new Error('Cannot edit a cancelled order');

  const now = new Date().toISOString();
  const docPatch = { updatedAt: now };

  if (patch.note != null) docPatch.note = String(patch.note);
  if (patch.vendorName != null) docPatch.vendorName = String(patch.vendorName);
  if (patch.discount != null) docPatch.discount = Number(patch.discount) || 0;
  if (patch.discountType != null) {
    docPatch.discountType = patch.discountType === 'percent' ? 'percent' : 'amount';
  }

  if (Array.isArray(patch.items)) {
    const existingItems = Array.isArray(order.items) ? [...order.items] : [];
    for (const pi of patch.items) {
      const key = pi.orderProductId;
      if (!key) continue;
      const idx = existingItems.findIndex(it => it.orderProductId === key);
      if (idx < 0) throw new Error(`Item ${key} not found in order ${orderId}`);
      if (pi.qty != null) throw new Error('Qty edits are blocked post-import');

      const before = existingItems[idx];
      const updatedItem = { ...before };
      if (pi.cost != null) updatedItem.cost = Number(pi.cost) || 0;
      if (pi.expiresAt !== undefined) updatedItem.expiresAt = pi.expiresAt || null;
      existingItems[idx] = updatedItem;

      // Cascade cost/expiresAt to the batch doc (future movements use it)
      if (before.batchId) {
        const bp = {};
        if (pi.cost != null) bp.originalCost = Number(pi.cost) || 0;
        if (pi.expiresAt !== undefined) bp.expiresAt = pi.expiresAt || null;
        if (Object.keys(bp).length > 0) {
          bp.updatedAt = now;
          await updateDoc(stockBatchDoc(before.batchId), bp);
        }
      }
    }
    docPatch.items = existingItems;
  }

  await updateDoc(stockOrderDoc(orderId), docPatch);
  return { orderId, success: true };
}

// ─── Stock Adjustment ───────────────────────────────────────────────────────

/**
 * Manual stock adjustment — requires batch selection (ProClinic parity).
 *
 * Transactional: read batch → verify → mutate qty → write movement + adjustment
 * in a single runTransaction so a mid-flight failure leaves no partial state.
 *
 * @param {object} p
 *   - batchId (required), type: 'add' | 'reduce', qty (required > 0)
 *   - note, branchId (defaults to batch's branchId)
 * @param {object} [opts]
 *   - user: { userId, userName }
 * @returns { adjustmentId, movementId }
 */
export async function createStockAdjustment(p, opts = {}) {
  const { stockUtils } = await _stockLib();
  const { MOVEMENT_TYPES, BATCH_STATUS, deductQtyNumeric, reverseQtyNumeric } = stockUtils;

  const batchId = p?.batchId;
  const type = p?.type;
  const qty = Number(p?.qty);
  if (!batchId) throw new Error('batchId required');
  if (type !== 'add' && type !== 'reduce') {
    throw new Error(`Invalid adjustment type: ${type} (expected 'add' or 'reduce')`);
  }
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error(`Invalid qty: ${p?.qty} (must be > 0)`);
  }

  const adjustmentId = _genAdjustmentId();
  const movementId = _genMovementId();
  const now = new Date().toISOString();
  const user = _normalizeAuditUser(opts.user);
  const note = String(p.note || '');

  const result = await runTransaction(db, async (tx) => {
    const batchRef = stockBatchDoc(batchId);
    const snap = await tx.get(batchRef);
    if (!snap.exists()) throw new Error(`Batch ${batchId} not found`);
    const batch = snap.data();
    if (batch.status === BATCH_STATUS.CANCELLED) {
      throw new Error(`Cannot adjust cancelled batch ${batchId}`);
    }

    const beforeRemaining = Number(batch.qty?.remaining) || 0;
    const newQty = type === 'add'
      ? reverseQtyNumeric(batch.qty, qty)
      : deductQtyNumeric(batch.qty, qty);
    const afterRemaining = newQty.remaining;
    const newStatus = afterRemaining <= 0 ? BATCH_STATUS.DEPLETED : BATCH_STATUS.ACTIVE;
    const branchId = p.branchId || batch.branchId;

    // Mutate batch
    tx.update(batchRef, {
      qty: newQty,
      status: newStatus,
      updatedAt: now,
    });

    // Append movement (immutable)
    const movementType = type === 'add' ? MOVEMENT_TYPES.ADJUST_ADD : MOVEMENT_TYPES.ADJUST_REDUCE;
    const signedQty = type === 'add' ? qty : -qty;
    tx.set(stockMovementDoc(movementId), {
      movementId,
      type: movementType,
      batchId,
      productId: batch.productId,
      productName: batch.productName,
      qty: signedQty,
      before: beforeRemaining,
      after: afterRemaining,
      branchId,
      sourceDocPath: `artifacts/${appId}/public/data/be_stock_adjustments/${adjustmentId}`,
      linkedAdjustId: adjustmentId,
      revenueImpact: 0,
      costBasis: (Number(batch.originalCost) || 0) * qty,
      isPremium: !!batch.isPremium,
      user,
      note,
      createdAt: now,
    });

    // Record adjustment doc
    tx.set(stockAdjustmentDoc(adjustmentId), {
      adjustmentId,
      batchId,
      productId: batch.productId,
      productName: batch.productName,
      type,
      qty,
      note,
      branchId,
      user,
      movementId,
      createdAt: now,
    });

    return { adjustmentId, movementId, before: beforeRemaining, after: afterRemaining };
  });

  return { ...result, success: true };
}

// ─── Internal: stockUtils bridge (avoids top-of-file circular-like import cost) ─
let __stockLibCache = null;
async function _stockLib() {
  if (__stockLibCache) return __stockLibCache;
  const mod = await import('./stockUtils.js');
  __stockLibCache = { stockUtils: mod };
  return __stockLibCache;
}

// ─── Product stockConfig lookup ─────────────────────────────────────────────
// Returns { trackStock: bool, unit: string, ... } or null if product not found.
// Phase 12.2b follow-up (2026-04-24): switched from `master_data/products/
// items/{id}` → `be_products/{id}` per Rule H-tris (backend reads ONLY from
// be_*). Previously every sale/treatment stock deduction was being silently
// skipped: the lookup read master_data which is no longer kept in sync after
// Phase 11.9 migrated products to be_products. skipped movements were
// written but no batch ever mutated → user sees "ไม่เห็น stock movement"
// because batch qty didn't change. master_data fallback retained ONLY as a
// read-through safety for docs that never migrated.
async function _getProductStockConfig(productId) {
  if (!productId) return null;
  try {
    const beRef = doc(db, ...basePath(), 'be_products', String(productId));
    const beSnap = await getDoc(beRef);
    if (beSnap.exists()) {
      const data = beSnap.data();
      if (data.stockConfig) return data.stockConfig;
      // be_products doc exists but no stockConfig yet — fall through to
      // legacy master_data fallback before giving up, in case the
      // auto-opt-in write landed there under the old code path.
    }
    const legacyRef = doc(db, ...basePath(), 'master_data', 'products', 'items', String(productId));
    const legacySnap = await getDoc(legacyRef);
    if (!legacySnap.exists()) return null;
    return legacySnap.data().stockConfig || null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 8b — Sale/Treatment stock integration
// ═══════════════════════════════════════════════════════════════════════════
// deductStockForSale / reverseStockForSale / analyzeStockImpact —
// the bridge between retail sales and the batch FIFO ledger.
// Treatment equivalents (deductStockForTreatment / reverseStockForTreatment)
// are thin wrappers that reuse the same core logic with different movementType.
//
// Contract (non-negotiable):
//   1. Stock failures are HARD ERRORS — caller must be prepared to roll back.
//   2. Reverse is idempotent — movements already reversed are skipped.
//   3. Every movement carries sourceDocPath + linkedSaleId/linkedTreatmentId
//      so analyzeStockImpact can reconstruct impact from audit log alone.
//   4. Per-batch runTransaction (never wrap a full sale in one tx — 500-op limit).
//   5. Products flagged stockConfig.trackStock === false are silently skipped
//      but still emit a movement with skipped:true for audit continuity.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalize mixed items (products + medications + consumables + treatmentItems)
 * into a flat list with a canonical key set.
 *
 * Accepts either:
 *   - { products: [...], medications: [...] }   (SaleTab items)
 *   - [{ productId?, productName, qty, unit?, itemType? }, ...]  (already flat)
 *
 * Returns: [{ productId, productName, qty, unit, itemType, isPremium }]
 * Items without productId are returned with productId=null — caller decides
 * whether to skip (manual sale item, no stock) or error.
 */
function _normalizeStockItems(items) {
  if (!items) return [];
  if (Array.isArray(items)) {
    return items.map(it => ({
      productId: it.productId ? String(it.productId) : (it.id != null ? String(it.id) : null),
      productName: String(it.productName || it.name || ''),
      qty: Number(it.qty) || 0,
      unit: String(it.unit || ''),
      itemType: it.itemType || 'product',
      isPremium: !!it.isPremium,
    }));
  }
  if (typeof items === 'object') {
    const out = [];
    for (const p of items.products || []) {
      out.push({
        productId: p.productId ? String(p.productId) : (p.id != null ? String(p.id) : null),
        productName: String(p.productName || p.name || ''),
        qty: Number(p.qty) || 0,
        unit: String(p.unit || ''),
        itemType: 'product',
        isPremium: !!p.isPremium,
      });
    }
    for (const m of items.medications || []) {
      out.push({
        productId: m.productId ? String(m.productId) : (m.id != null ? String(m.id) : null),
        productName: String(m.productName || m.name || ''),
        qty: Number(m.qty) || 0,
        unit: String(m.unit || ''),
        itemType: 'medication',
        isPremium: !!m.isPremium,
      });
    }
    for (const c of items.consumables || []) {
      out.push({
        productId: c.productId ? String(c.productId) : (c.id != null ? String(c.id) : null),
        productName: String(c.productName || c.name || ''),
        qty: Number(c.qty) || 0,
        unit: String(c.unit || ''),
        itemType: 'consumable',
        isPremium: !!c.isPremium,
      });
    }
    for (const t of items.treatmentItems || []) {
      out.push({
        productId: t.productId ? String(t.productId) : (t.id != null ? String(t.id) : null),
        productName: String(t.productName || t.name || ''),
        qty: Number(t.qty) || 0,
        unit: String(t.unit || ''),
        itemType: 'treatmentItem',
        isPremium: !!t.isPremium,
      });
    }
    return out;
  }
  return [];
}

/**
 * Internal: deduct one item across its FIFO batches. Each batch consumed
 * runs in its own runTransaction (read → verify → mutate → write movement).
 * On mid-flight failure, compensating reversals are emitted for any batches
 * already committed before re-throwing.
 */
async function _deductOneItem({
  item, saleId, treatmentId, branchId, movementType, customerId, user, preferNewest, extraLink,
}) {
  const { stockUtils } = await _stockLib();
  const { MOVEMENT_TYPES, BATCH_STATUS, batchFifoAllocate, deductQtyNumeric } = stockUtils;

  if (!item.productId) {
    // Manual/one-off item — emit a skipped movement for audit continuity.
    return { productId: null, skipped: true, reason: 'no-productId', movements: [] };
  }
  if (item.qty <= 0) {
    return { productId: item.productId, skipped: true, reason: 'zero-qty', movements: [] };
  }

  // Stock tracking is OPT-IN: only products with explicit stockConfig.trackStock===true
  // are tracked. Missing stockConfig (cfg===null) OR trackStock===false → skip silently
  // with an audit movement (batchId=null). This prevents existing cloned products from
  // breaking sale/treatment flows before their first vendor order is placed.
  const cfg = await _getProductStockConfig(item.productId);
  const tracked = cfg && cfg.trackStock === true;
  if (!tracked) {
    const reason = cfg && cfg.trackStock === false ? 'trackStock-false' : 'not-tracked';
    const movementId = _genMovementId();
    const now = new Date().toISOString();
    const baseDocPath = saleId
      ? `artifacts/${appId}/public/data/be_sales/${saleId}`
      : treatmentId
        ? `artifacts/${appId}/public/data/be_treatments/${treatmentId}`
        : '';
    await setDoc(stockMovementDoc(movementId), {
      movementId,
      type: movementType,
      batchId: null,
      productId: item.productId,
      productName: item.productName,
      qty: -item.qty,
      before: null,
      after: null,
      branchId,
      sourceDocPath: baseDocPath,
      linkedSaleId: saleId || null,
      linkedTreatmentId: treatmentId || null,
      ...(extraLink || {}),
      revenueImpact: 0,
      costBasis: 0,
      isPremium: item.isPremium,
      skipped: true,
      user,
      note: reason === 'trackStock-false' ? 'trackStock=false — no batch mutation' : 'product not yet configured for stock tracking',
      customerId: customerId || null,
      createdAt: now,
    });
    return { productId: item.productId, skipped: true, reason, movements: [{ movementId }] };
  }

  // Fetch candidate batches
  const batches = await listStockBatches({ productId: item.productId, branchId, status: BATCH_STATUS.ACTIVE });
  const plan = batchFifoAllocate(batches, item.qty, { productId: item.productId, branchId, preferNewest });

  if (plan.shortfall > 0) {
    throw new Error(
      `Stock insufficient for ${item.productName} (${item.productId}): need ${item.qty}, allocated ${item.qty - plan.shortfall}, shortfall ${plan.shortfall}`
    );
  }

  const committedMovements = [];
  const baseDocPath = saleId
    ? `artifacts/${appId}/public/data/be_sales/${saleId}`
    : treatmentId
      ? `artifacts/${appId}/public/data/be_treatments/${treatmentId}`
      : '';

  try {
    for (const a of plan.allocations) {
      const batchRef = stockBatchDoc(a.batchId);
      const movementId = _genMovementId();

      const txResult = await runTransaction(db, async (tx) => {
        const snap = await tx.get(batchRef);
        if (!snap.exists()) throw new Error(`Batch ${a.batchId} vanished mid-deduct`);
        const b = snap.data();
        if (b.status === BATCH_STATUS.CANCELLED || b.status === BATCH_STATUS.EXPIRED) {
          throw new Error(`Batch ${a.batchId} became ${b.status} mid-deduct`);
        }
        const beforeRemaining = Number(b.qty?.remaining) || 0;
        if (beforeRemaining < a.takeQty) {
          throw new Error(
            `Batch ${a.batchId} raced: available ${beforeRemaining}, need ${a.takeQty}`
          );
        }
        const newQty = deductQtyNumeric(b.qty, a.takeQty);
        const afterRemaining = newQty.remaining;
        const newStatus = afterRemaining <= 0 ? BATCH_STATUS.DEPLETED : BATCH_STATUS.ACTIVE;
        const now = new Date().toISOString();

        tx.update(batchRef, {
          qty: newQty,
          status: newStatus,
          updatedAt: now,
        });

        tx.set(stockMovementDoc(movementId), {
          movementId,
          type: movementType,
          batchId: a.batchId,
          productId: b.productId,
          productName: b.productName,
          qty: -a.takeQty,
          before: beforeRemaining,
          after: afterRemaining,
          branchId: b.branchId,
          sourceDocPath: baseDocPath,
          linkedSaleId: saleId || null,
          linkedTreatmentId: treatmentId || null,
          ...(extraLink || {}),
          // isPremium → revenueImpact=0; otherwise null (sale billing owns revenue for reports)
          revenueImpact: item.isPremium ? 0 : null,
          costBasis: (Number(b.originalCost) || 0) * a.takeQty,
          isPremium: !!item.isPremium,
          skipped: false,
          user,
          note: '',
          customerId: customerId || null,
          createdAt: now,
        });

        return { batchId: a.batchId, qty: a.takeQty, movementId, before: beforeRemaining, after: afterRemaining };
      });

      committedMovements.push(txResult);
    }
  } catch (err) {
    // Compensate: reverse everything committed so far for THIS item
    for (const m of committedMovements) {
      try {
        await _reverseOneMovement(m.movementId);
      } catch (rollbackErr) {
        console.error('[deductStockForSale] compensation failed for movement', m.movementId, rollbackErr);
      }
    }
    throw err;
  }

  return { productId: item.productId, skipped: false, movements: committedMovements };
}

/**
 * Internal: reverse ONE movement. Adds qty back to batch + writes a compensating
 * movement entry + flags the original as reversedByMovementId.
 * Idempotent — no-op if already reversed.
 */
async function _reverseOneMovement(movementId, { user } = {}) {
  const { stockUtils } = await _stockLib();
  const { BATCH_STATUS, reverseQtyNumeric } = stockUtils;
  // S12: normalize the incoming user; if none supplied, the original
  // movement's user (m.user) is reused when writing the reverse entry.
  const reverseUser = user ? _normalizeAuditUser(user) : null;

  const movRef = stockMovementDoc(movementId);
  const movSnap = await getDoc(movRef);
  if (!movSnap.exists()) throw new Error(`Movement ${movementId} not found`);
  const m = movSnap.data();
  if (m.reversedByMovementId) {
    return { skipped: true, reason: 'already-reversed', reverseMovementId: m.reversedByMovementId };
  }
  if (m.skipped) {
    // trackStock=false movement has no batch to restore — just flag it.
    const now = new Date().toISOString();
    const reverseMovementId = _genMovementId();
    await setDoc(stockMovementDoc(reverseMovementId), {
      ...m,
      movementId: reverseMovementId,
      qty: -Number(m.qty) || 0,
      before: null,
      after: null,
      note: `reversal of ${m.movementId} (skipped original)`,
      reversedByMovementId: null,
      reverseOf: m.movementId,
      createdAt: now,
      user: reverseUser || m.user,
    });
    await updateDoc(movRef, { reversedByMovementId: reverseMovementId });
    return { skipped: true, reverseMovementId };
  }
  if (!m.batchId) {
    throw new Error(`Movement ${movementId} has no batchId — cannot reverse`);
  }

  const reverseMovementId = _genMovementId();
  const result = await runTransaction(db, async (tx) => {
    // S5: re-verify reversedByMovementId INSIDE the transaction. Two concurrent
    // _reverseOneMovement calls on the same movement would otherwise both pass
    // the outer check at line 2500 and both tx.update(movRef, ...) at the end
    // — last write wins, first reverse orphaned, audit chain broken. By
    // reading movRef inside the tx, Firestore OCC serializes us: the second
    // tx sees reversedByMovementId already set and returns early.
    const mSnap2 = await tx.get(movRef);
    if (mSnap2.data()?.reversedByMovementId) {
      return { alreadyReversed: true, reverseMovementId: mSnap2.data().reversedByMovementId };
    }

    const batchRef = stockBatchDoc(m.batchId);
    const bSnap = await tx.get(batchRef);
    if (!bSnap.exists()) throw new Error(`Batch ${m.batchId} vanished before reverse`);
    const b = bSnap.data();
    const qtyReturn = Math.abs(Number(m.qty) || 0);
    const beforeRemaining = Number(b.qty?.remaining) || 0;
    const newQty = reverseQtyNumeric(b.qty, qtyReturn);
    const afterRemaining = newQty.remaining;
    const newStatus = b.status === BATCH_STATUS.DEPLETED && afterRemaining > 0
      ? BATCH_STATUS.ACTIVE
      : b.status;
    const now = new Date().toISOString();

    tx.update(batchRef, { qty: newQty, status: newStatus, updatedAt: now });

    tx.set(stockMovementDoc(reverseMovementId), {
      ...m,
      movementId: reverseMovementId,
      qty: qtyReturn, // positive = returning to stock
      before: beforeRemaining,
      after: afterRemaining,
      note: `reversal of ${m.movementId}`,
      reversedByMovementId: null,
      reverseOf: m.movementId,
      createdAt: now,
      user: reverseUser || m.user,
    });

    tx.update(movRef, { reversedByMovementId: reverseMovementId });

    return { reverseMovementId, before: beforeRemaining, after: afterRemaining, alreadyReversed: false };
  });

  if (result.alreadyReversed) {
    return { skipped: true, reason: 'concurrent-reverse', reverseMovementId: result.reverseMovementId };
  }
  return { skipped: false, ...result };
}

/**
 * Deduct stock for a retail sale. One movement per batch per item.
 * Products flagged stockConfig.trackStock=false emit a skipped movement
 * (no batch mutation).
 *
 * C10: DO NOT wrap this function (or its caller's loop) in a single
 * runTransaction. Internally every batch allocation is its own small tx
 * (~3 ops: read batch, update batch, write movement). A 150-item sale
 * across 3 batches each = ~450 ops — already close to Firestore's 500-op
 * per-tx hard limit. Wrapping outside would blow the limit and abort the
 * whole sale. The saga-per-batch pattern is intentional.
 *
 * @param {string} saleId
 * @param {object|Array} items — SaleTab `items` object or flat array
 * @param {{
 *   customerId?: string,
 *   branchId?: string,
 *   user?: {userId, userName},
 *   movementType?: number, // defaults to MOVEMENT_TYPES.SALE (2)
 *   preferNewest?: boolean,
 * }} [opts]
 * @returns {{ allocations: Array, skippedItems: Array }}
 * @throws when any item has insufficient stock (after emitting compensations for prior items)
 */
export async function deductStockForSale(saleId, items, opts = {}) {
  if (!saleId) throw new Error('saleId required');
  const { stockUtils } = await _stockLib();
  const { MOVEMENT_TYPES, DEFAULT_BRANCH_ID } = stockUtils;

  const branchId = opts.branchId || DEFAULT_BRANCH_ID;
  const user = _normalizeAuditUser(opts.user);
  const movementType = Number(opts.movementType) || MOVEMENT_TYPES.SALE;
  const preferNewest = !!opts.preferNewest;
  const customerId = opts.customerId ? String(opts.customerId) : null;

  const flat = _normalizeStockItems(items);
  const allocations = [];
  const skipped = [];

  for (const item of flat) {
    try {
      const r = await _deductOneItem({
        item, saleId,
        branchId, movementType, customerId, user, preferNewest,
      });
      if (r.skipped) skipped.push(r);
      else allocations.push(r);
    } catch (err) {
      // Roll back everything we've committed for prior items — whole sale-deduct atomic from caller POV
      try { await reverseStockForSale(saleId, { user }); } catch (rbErr) {
        console.error('[deductStockForSale] rollback failed:', rbErr);
      }
      throw err;
    }
  }

  return { allocations, skippedItems: skipped };
}

/**
 * Deduct stock for a treatment (consumables/meds used during treatment).
 * Equivalent to deductStockForSale but links via treatmentId + uses
 * MOVEMENT_TYPES.TREATMENT (6) by default. Pass opts.movementType=7 for
 * take-home medications.
 *
 * @param {string} treatmentId
 * @param {object|Array} items
 * @param {object} [opts]
 */
export async function deductStockForTreatment(treatmentId, items, opts = {}) {
  if (!treatmentId) throw new Error('treatmentId required');
  const { stockUtils } = await _stockLib();
  const { MOVEMENT_TYPES, DEFAULT_BRANCH_ID } = stockUtils;

  const branchId = opts.branchId || DEFAULT_BRANCH_ID;
  const user = _normalizeAuditUser(opts.user);
  const movementType = Number(opts.movementType) || MOVEMENT_TYPES.TREATMENT;
  const preferNewest = !!opts.preferNewest;
  const customerId = opts.customerId ? String(opts.customerId) : null;

  const flat = _normalizeStockItems(items);
  const allocations = [];
  const skipped = [];

  for (const item of flat) {
    try {
      const r = await _deductOneItem({
        item, treatmentId,
        branchId, movementType, customerId, user, preferNewest,
      });
      if (r.skipped) skipped.push(r);
      else allocations.push(r);
    } catch (err) {
      try { await reverseStockForTreatment(treatmentId, { user }); } catch (rbErr) {
        console.error('[deductStockForTreatment] rollback failed:', rbErr);
      }
      throw err;
    }
  }

  return { allocations, skippedItems: skipped };
}

/**
 * Reverse every non-reversed movement linked to a sale. Idempotent — second
 * call is a no-op. Used by sale cancel / edit / delete + failure compensation.
 *
 * @param {string} saleId
 * @param {{ user?: object }} [opts]
 * @returns { reversedCount, skippedCount }
 */
export async function reverseStockForSale(saleId, opts = {}) {
  if (!saleId) throw new Error('saleId required');
  const mvts = await listStockMovements({ linkedSaleId: String(saleId), includeReversed: false });
  let reversedCount = 0;
  let skippedCount = 0;
  for (const m of mvts) {
    const r = await _reverseOneMovement(m.movementId, opts);
    if (r.skipped) skippedCount++;
    else reversedCount++;
  }
  return { reversedCount, skippedCount, success: true };
}

/**
 * Reverse every non-reversed movement linked to a treatment. Idempotent.
 */
export async function reverseStockForTreatment(treatmentId, opts = {}) {
  if (!treatmentId) throw new Error('treatmentId required');
  const mvts = await listStockMovements({ linkedTreatmentId: String(treatmentId), includeReversed: false });
  let reversedCount = 0;
  let skippedCount = 0;
  for (const m of mvts) {
    const r = await _reverseOneMovement(m.movementId, opts);
    if (r.skipped) skippedCount++;
    else reversedCount++;
  }
  return { reversedCount, skippedCount, success: true };
}

/**
 * Inspect what reversing a sale/treatment would do. Shows movements,
 * batch states, warnings — feeds the cancel/delete confirmation modal.
 *
 * @param {{saleId?: string, treatmentId?: string}} params
 * @returns {{
 *   movements: Array,
 *   batchesAffected: Array<{batchId, productName, currentRemaining, willRestore}>,
 *   warnings: string[],
 *   canReverseFully: boolean,
 *   totalQtyToRestore: number,
 * }}
 */
export async function analyzeStockImpact({ saleId, treatmentId } = {}) {
  if (!saleId && !treatmentId) throw new Error('saleId or treatmentId required');

  const filters = {};
  if (saleId) filters.linkedSaleId = String(saleId);
  if (treatmentId) filters.linkedTreatmentId = String(treatmentId);

  const movements = await listStockMovements({ ...filters, includeReversed: false });
  const batchesSeen = new Map();
  const warnings = [];
  let canReverseFully = true;
  let totalQtyToRestore = 0;

  for (const m of movements) {
    if (m.skipped) {
      warnings.push(`${m.productName} skipped (trackStock=false) — no batch to restore`);
      continue;
    }
    if (!m.batchId) {
      warnings.push(`Movement ${m.movementId} has no batchId — cannot restore`);
      canReverseFully = false;
      continue;
    }

    let info = batchesSeen.get(m.batchId);
    if (!info) {
      const b = await getStockBatch(m.batchId);
      info = {
        batchId: m.batchId,
        productName: m.productName,
        currentRemaining: b ? Number(b.qty?.remaining) || 0 : 0,
        currentStatus: b ? b.status : 'missing',
        willRestore: 0,
      };
      batchesSeen.set(m.batchId, info);
      if (!b) {
        warnings.push(`Batch ${m.batchId} not found — cannot restore ${m.productName}`);
        canReverseFully = false;
      } else if (b.status === 'cancelled') {
        warnings.push(`Batch ${m.batchId} cancelled — restoration will mutate cancelled batch`);
      }
    }
    const qtyReturn = Math.abs(Number(m.qty) || 0);
    info.willRestore += qtyReturn;
    totalQtyToRestore += qtyReturn;
  }

  return {
    movements,
    batchesAffected: Array.from(batchesSeen.values()),
    warnings,
    canReverseFully,
    totalQtyToRestore,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 8h — Central Warehouses + Stock Locations (master data)
// ═══════════════════════════════════════════════════════════════════════════
// Branches are implicit (single-branch='main' for now). Central warehouses are
// explicit docs under be_central_stock_warehouses/{stockId}. The combined
// stock_locations master is computed on-read (branches + centrals) — UI picks
// source/destination from this list for transfers + withdrawals.
// ═══════════════════════════════════════════════════════════════════════════

const centralWarehousesCol = () => collection(db, ...basePath(), 'be_central_stock_warehouses');
const centralWarehouseDoc = (id) => doc(db, ...basePath(), 'be_central_stock_warehouses', String(id));

function _genWarehouseId() { return `WH-${Date.now()}-${_rand4()}`; }

/** Create a central warehouse. */
export async function createCentralWarehouse(data) {
  const stockId = data.stockId || _genWarehouseId();
  const now = new Date().toISOString();
  const name = String(data.stockName || data.name || '').trim();
  if (!name) throw new Error('stockName required');
  await setDoc(centralWarehouseDoc(stockId), {
    stockId,
    stockName: name,
    telephoneNumber: String(data.telephoneNumber || data.phone || ''),
    address: String(data.address || ''),
    isActive: data.isActive !== false,
    createdAt: now,
    updatedAt: now,
  });
  return { stockId, success: true };
}

/** Update mutable fields on a central warehouse. */
export async function updateCentralWarehouse(stockId, patch) {
  const existing = await getDoc(centralWarehouseDoc(stockId));
  if (!existing.exists()) throw new Error(`Warehouse ${stockId} not found`);
  const up = { updatedAt: new Date().toISOString() };
  if (patch.stockName != null) up.stockName = String(patch.stockName).trim();
  if (patch.telephoneNumber != null) up.telephoneNumber = String(patch.telephoneNumber);
  if (patch.address != null) up.address = String(patch.address);
  if (patch.isActive != null) up.isActive = !!patch.isActive;
  await updateDoc(centralWarehouseDoc(stockId), up);
  return { success: true };
}

/** Soft-delete: sets isActive=false (preserves history). Hard-delete blocked if any active batch references this location. */
export async function deleteCentralWarehouse(stockId) {
  const q = query(stockBatchesCol(), where('branchId', '==', String(stockId)), where('status', '==', 'active'));
  const s = await getDocs(q);
  if (s.size > 0) {
    throw new Error(`ลบคลังไม่ได้: มีสต็อก ${s.size} batch ค้างอยู่ (เบิก/ย้ายออกก่อน หรือสามารถปิดใช้งานแทนได้)`);
  }
  await updateDoc(centralWarehouseDoc(stockId), { isActive: false, updatedAt: new Date().toISOString() });
  return { success: true };
}

/** List all warehouses (active + inactive). */
export async function listCentralWarehouses({ includeInactive = false } = {}) {
  const snap = await getDocs(centralWarehousesCol());
  let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (!includeInactive) list = list.filter(w => w.isActive !== false);
  list.sort((a, b) => (a.stockName || '').localeCompare(b.stockName || ''));
  return list;
}

/**
 * Combined branch + warehouse list for Transfer/Withdrawal UI selectors.
 * Returns: [{id, name, kind: 'branch'|'central'}] — 'main' branch always first.
 */
export async function listStockLocations() {
  const warehouses = await listCentralWarehouses();
  return [
    { id: 'main', name: 'สาขาหลัก (main)', kind: 'branch' },
    ...warehouses.map(w => ({ id: w.stockId, name: w.stockName, kind: 'central', phone: w.telephoneNumber, address: w.address })),
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 8f — Stock Transfers (inter-location movement)
// ═══════════════════════════════════════════════════════════════════════════
// Status machine (ProClinic parity):
//   0 = รอส่ง        (created, nothing moved yet — just intent)
//   1 = รอรับ         (sent — source batches deducted + type=8 movements)
//   2 = สำเร็จ        (received — destination batches created + type=9)
//   3 = ยกเลิก         (cancelled — reverse whatever was done so far, idempotent)
//   4 = ปฏิเสธ         (rejected at destination — reverse source deductions)
//
// Transfers create NEW batches at destination (sourceBatchId back-ref) — never
// re-parent an existing batch. Audit trail stays clean per-location.
// ═══════════════════════════════════════════════════════════════════════════

const stockTransfersCol = () => collection(db, ...basePath(), 'be_stock_transfers');
const stockTransferDoc = (id) => doc(db, ...basePath(), 'be_stock_transfers', String(id));

function _genTransferId() { return `TRF-${Date.now()}-${_rand4()}`; }

/**
 * Create a transfer in status=0 (pending-dispatch). NO stock mutation yet —
 * source batches remain untouched. User must call updateStockTransferStatus
 * to move the state forward.
 *
 * @param {object} data
 *   - sourceLocationId: string ('main' or 'WH-...')
 *   - destinationLocationId: string
 *   - items: [{ sourceBatchId, productId, productName, qty, unit? }]
 *   - note?
 * @param {object} [opts]  { user: {userId, userName} }
 * @returns { transferId, success }
 */
export async function createStockTransfer(data, opts = {}) {
  const src = String(data.sourceLocationId || '');
  const dst = String(data.destinationLocationId || '');
  if (!src || !dst) throw new Error('sourceLocationId + destinationLocationId required');
  if (src === dst) throw new Error('ต้นทางและปลายทางต้องไม่ใช่ที่เดียวกัน');
  const items = Array.isArray(data.items) ? data.items : [];
  if (items.length === 0) throw new Error('Transfer must have at least one item');

  // Validate each item's sourceBatchId exists + has enough remaining
  for (const [i, it] of items.entries()) {
    if (!it.sourceBatchId) throw new Error(`Item #${i + 1}: sourceBatchId required`);
    const qty = Number(it.qty);
    if (!Number.isFinite(qty) || qty <= 0) throw new Error(`Item #${i + 1}: invalid qty`);
    const snap = await getDoc(stockBatchDoc(it.sourceBatchId));
    if (!snap.exists()) throw new Error(`Item #${i + 1}: batch ${it.sourceBatchId} not found`);
    const b = snap.data();
    if (b.status !== 'active') throw new Error(`Item #${i + 1}: batch ${it.sourceBatchId} is ${b.status}`);
    if (b.branchId !== src) throw new Error(`Item #${i + 1}: batch belongs to ${b.branchId}, not ${src}`);
    if (Number(b.qty?.remaining || 0) < qty) {
      throw new Error(`Item #${i + 1}: insufficient remaining (${b.qty?.remaining}) for transfer qty ${qty}`);
    }
  }

  const transferId = _genTransferId();
  const now = new Date().toISOString();
  const user = _normalizeAuditUser(opts.user);

  // Resolve item metadata from source batches (cost/expiry inherited on receive)
  const resolvedItems = [];
  for (const it of items) {
    const snap = await getDoc(stockBatchDoc(it.sourceBatchId));
    const b = snap.data();
    resolvedItems.push({
      sourceBatchId: it.sourceBatchId,
      productId: b.productId,
      productName: b.productName,
      qty: Number(it.qty),
      unit: b.unit || '',
      cost: Number(b.originalCost || 0),
      expiresAt: b.expiresAt || null,
      isPremium: !!b.isPremium,
      destinationBatchId: null, // filled on receive
    });
  }

  await setDoc(stockTransferDoc(transferId), {
    transferId,
    sourceLocationId: src,
    destinationLocationId: dst,
    items: resolvedItems,
    status: 0, // PENDING_DISPATCH
    note: String(data.note || ''),
    deliveredTrackingNumber: '', deliveredNote: '', deliveredImageUrl: '',
    canceledNote: '', rejectedNote: '',
    user, createdAt: now, updatedAt: now,
  });
  return { transferId, success: true };
}

/**
 * Advance a transfer's status. Valid transitions:
 *   0 → 1 (send): deduct source batches + emit type=8 EXPORT_TRANSFER movements.
 *   1 → 2 (receive): create destination batches + emit type=9 RECEIVE movements.
 *   0 → 3 (cancel before send): clean cancel (no stock mutation).
 *   1 → 3 (cancel in transit): reverse source deductions.
 *   1 → 4 (reject): reverse source deductions (same as 1→3 logically).
 *
 * Any other transition throws.
 *
 * @param {string} transferId
 * @param {number} newStatus  0..4 per TRANSFER_STATUS enum
 * @param {object} [opts]
 *   - user, canceledNote, rejectedNote, deliveredTrackingNumber, deliveredNote, deliveredImageUrl
 */
export async function updateStockTransferStatus(transferId, newStatus, opts = {}) {
  const { stockUtils } = await _stockLib();
  const { MOVEMENT_TYPES, BATCH_STATUS, deductQtyNumeric, buildQtyNumeric } = stockUtils;
  const TS_ENUM = stockUtils.TRANSFER_STATUS;

  const ref = stockTransferDoc(transferId);
  const next = Number(newStatus);
  const now = new Date().toISOString();

  // Transition guards
  const allowed = {
    0: [1, 3],          // from pending-dispatch: send or cancel
    1: [2, 3, 4],       // from pending-receive: receive, cancel, reject
    2: [],              // completed — terminal
    3: [],              // cancelled — terminal
    4: [],              // rejected — terminal
  };

  // Scenario-I / S12: atomic CAS on the transfer doc. Two concurrent "รับ"
  // clicks would otherwise both read status=1 here, both walk the loop
  // creating destination batches, and both updateDoc status=2 — leaving
  // duplicate orphaned batches. Reading + advancing status in a single
  // runTransaction makes the second caller's tx retry, see status=2, and
  // throw invalid-transition.
  const claim = await runTransaction(db, async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists()) throw new Error(`Transfer ${transferId} not found`);
    const c = s.data();
    const curStat = Number(c.status);
    if (!(allowed[curStat] || []).includes(next)) {
      throw new Error(`Invalid transfer status transition ${curStat} → ${next}`);
    }
    const patch = { status: next, updatedAt: now };
    if (next === 1) {
      patch.deliveredTrackingNumber = String(opts.deliveredTrackingNumber || '');
      patch.deliveredNote = String(opts.deliveredNote || '');
      patch.deliveredImageUrl = String(opts.deliveredImageUrl || '');
    }
    if (next === 3) patch.canceledNote = String(opts.canceledNote || '');
    if (next === 4) patch.rejectedNote = String(opts.rejectedNote || '');
    tx.update(ref, patch);
    return { ...c, _prevStatus: curStat };
  });
  const cur = claim;
  const curStatus = claim._prevStatus;
  const user = opts.user || cur.user || { userId: null, userName: null };

  const docPath = `artifacts/${appId}/public/data/be_stock_transfers/${transferId}`;

  // Helper: deduct from source batch + emit EXPORT_TRANSFER movement
  async function _exportFromSource(item) {
    return runTransaction(db, async (tx) => {
      const bRef = stockBatchDoc(item.sourceBatchId);
      const bSnap = await tx.get(bRef);
      if (!bSnap.exists()) throw new Error(`Batch ${item.sourceBatchId} vanished`);
      const b = bSnap.data();
      if (b.status !== BATCH_STATUS.ACTIVE) throw new Error(`Batch ${item.sourceBatchId} became ${b.status}`);
      const before = Number(b.qty?.remaining || 0);
      if (before < item.qty) throw new Error(`Batch ${item.sourceBatchId} short: have ${before}, need ${item.qty}`);
      const newQty = deductQtyNumeric(b.qty, item.qty);
      const newStat = newQty.remaining <= 0 ? BATCH_STATUS.DEPLETED : BATCH_STATUS.ACTIVE;
      tx.update(bRef, { qty: newQty, status: newStat, updatedAt: now });
      const mvtId = _genMovementId();
      tx.set(stockMovementDoc(mvtId), {
        movementId: mvtId,
        type: MOVEMENT_TYPES.EXPORT_TRANSFER,
        batchId: item.sourceBatchId,
        productId: b.productId,
        productName: b.productName,
        qty: -item.qty,
        before,
        after: newQty.remaining,
        branchId: b.branchId,
        sourceDocPath: docPath,
        linkedTransferId: transferId,
        revenueImpact: null,
        costBasis: (Number(b.originalCost) || 0) * item.qty,
        isPremium: !!item.isPremium,
        skipped: false,
        user,
        note: '',
        createdAt: now,
      });
      return mvtId;
    });
  }

  // Helper: create destination batch + emit RECEIVE movement
  async function _receiveAtDestination(item) {
    const newBatchId = _genBatchId();
    await setDoc(stockBatchDoc(newBatchId), {
      batchId: newBatchId,
      productId: item.productId,
      productName: item.productName,
      branchId: cur.destinationLocationId,
      orderProductId: `${transferId}-${item.sourceBatchId}`,
      sourceOrderId: null,
      sourceBatchId: item.sourceBatchId,
      receivedAt: now,
      expiresAt: item.expiresAt,
      unit: item.unit,
      qty: buildQtyNumeric(item.qty),
      originalCost: item.cost,
      isPremium: item.isPremium,
      status: BATCH_STATUS.ACTIVE,
      createdAt: now,
      updatedAt: now,
    });
    const mvtId = _genMovementId();
    await setDoc(stockMovementDoc(mvtId), {
      movementId: mvtId,
      type: MOVEMENT_TYPES.RECEIVE,
      batchId: newBatchId,
      productId: item.productId,
      productName: item.productName,
      qty: item.qty,
      before: 0,
      after: item.qty,
      branchId: cur.destinationLocationId,
      sourceDocPath: docPath,
      linkedTransferId: transferId,
      revenueImpact: null,
      costBasis: item.cost * item.qty,
      isPremium: item.isPremium,
      skipped: false,
      user,
      note: '',
      createdAt: now,
    });
    return newBatchId;
  }

  // Helper: reverse an export movement (for cancel/reject)
  async function _reverseExport(sourceBatchId) {
    const q = query(stockMovementsCol(),
      where('linkedTransferId', '==', transferId),
      where('batchId', '==', sourceBatchId),
      where('type', '==', MOVEMENT_TYPES.EXPORT_TRANSFER));
    const s = await getDocs(q);
    for (const d of s.docs) {
      const m = d.data();
      if (m.reversedByMovementId || m.reverseOf) continue;
      await _reverseOneMovement(m.movementId, { user });
    }
  }

  // Execute the transition — status is already advanced atomically above.
  // Heavy work (batch mutations + movement writes) happens after the CAS so
  // the transfer doc isn't locked for the full duration.
  if (curStatus === 0 && next === 1) {
    for (const it of cur.items) await _exportFromSource(it);
  }
  else if (curStatus === 1 && next === 2) {
    const updatedItems = [];
    for (const it of cur.items) {
      const destBatchId = await _receiveAtDestination(it);
      updatedItems.push({ ...it, destinationBatchId: destBatchId });
    }
    await updateDoc(ref, { items: updatedItems, updatedAt: new Date().toISOString() });
  }
  else if (curStatus === 1 && (next === 3 || next === 4)) {
    for (const it of cur.items) await _reverseExport(it.sourceBatchId);
  }
  return { transferId, status: next, success: true };
}

export async function listStockTransfers({ locationId, status, includeAll } = {}) {
  const clauses = [];
  const snap = await getDocs(stockTransfersCol());
  let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (locationId) {
    list = list.filter(t => t.sourceLocationId === locationId || t.destinationLocationId === locationId);
  }
  if (status != null) list = list.filter(t => Number(t.status) === Number(status));
  list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return list;
}

export async function getStockTransfer(transferId) {
  const snap = await getDoc(stockTransferDoc(transferId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 8g — Stock Withdrawals (branch↔central requisitions)
// ═══════════════════════════════════════════════════════════════════════════
// Direction determines source→destination mapping:
//   'branch_to_central'  (สาขา → เบิกจากคลังกลาง: branch requests from central)
//     Source = central warehouse (provides), Destination = branch (receives)
//   'central_to_branch'  (คลังกลาง → ส่งให้สาขา: central ships to branch)
//     Source = central warehouse, Destination = branch
//
// Status: 0=รอยืนยัน | 1=รอส่ง | 2=สำเร็จ | 3=ยกเลิก
// ═══════════════════════════════════════════════════════════════════════════

const stockWithdrawalsCol = () => collection(db, ...basePath(), 'be_stock_withdrawals');
const stockWithdrawalDoc = (id) => doc(db, ...basePath(), 'be_stock_withdrawals', String(id));

function _genWithdrawalId() { return `WDR-${Date.now()}-${_rand4()}`; }

export async function createStockWithdrawal(data, opts = {}) {
  const direction = data.direction;
  if (direction !== 'branch_to_central' && direction !== 'central_to_branch') {
    throw new Error('direction must be "branch_to_central" or "central_to_branch"');
  }
  const src = String(data.sourceLocationId || '');
  const dst = String(data.destinationLocationId || '');
  if (!src || !dst) throw new Error('source + destination location required');
  if (src === dst) throw new Error('ต้นทางและปลายทางต้องไม่ใช่ที่เดียวกัน');
  const items = Array.isArray(data.items) ? data.items : [];
  if (items.length === 0) throw new Error('Withdrawal must have at least one item');

  // Validate each item's source batch
  for (const [i, it] of items.entries()) {
    if (!it.sourceBatchId) throw new Error(`Item #${i + 1}: sourceBatchId required`);
    const qty = Number(it.qty);
    if (!Number.isFinite(qty) || qty <= 0) throw new Error(`Item #${i + 1}: invalid qty`);
    const snap = await getDoc(stockBatchDoc(it.sourceBatchId));
    if (!snap.exists()) throw new Error(`Item #${i + 1}: batch ${it.sourceBatchId} not found`);
    const b = snap.data();
    if (b.status !== 'active') throw new Error(`Item #${i + 1}: batch is ${b.status}`);
    if (b.branchId !== src) throw new Error(`Item #${i + 1}: batch belongs to ${b.branchId}, not ${src}`);
    if (Number(b.qty?.remaining || 0) < qty) {
      throw new Error(`Item #${i + 1}: insufficient remaining for withdrawal`);
    }
  }

  const withdrawalId = _genWithdrawalId();
  const now = new Date().toISOString();
  const user = _normalizeAuditUser(opts.user);
  const resolvedItems = [];
  for (const it of items) {
    const snap = await getDoc(stockBatchDoc(it.sourceBatchId));
    const b = snap.data();
    resolvedItems.push({
      sourceBatchId: it.sourceBatchId,
      productId: b.productId,
      productName: b.productName,
      qty: Number(it.qty),
      unit: b.unit || '',
      cost: Number(b.originalCost || 0),
      expiresAt: b.expiresAt || null,
      isPremium: !!b.isPremium,
      destinationBatchId: null,
    });
  }

  await setDoc(stockWithdrawalDoc(withdrawalId), {
    withdrawalId,
    direction,
    sourceLocationId: src,
    destinationLocationId: dst,
    items: resolvedItems,
    status: 0,
    note: String(data.note || ''),
    user, createdAt: now, updatedAt: now,
  });
  return { withdrawalId, success: true };
}

/** Transition: 0→1 (send/approve) | 1→2 (receive) | 0→3 or 1→3 (cancel). */
export async function updateStockWithdrawalStatus(withdrawalId, newStatus, opts = {}) {
  const { stockUtils } = await _stockLib();
  const { MOVEMENT_TYPES, BATCH_STATUS, deductQtyNumeric, buildQtyNumeric } = stockUtils;

  const ref = stockWithdrawalDoc(withdrawalId);
  const next = Number(newStatus);
  const now = new Date().toISOString();

  const allowed = { 0: [1, 3], 1: [2, 3], 2: [], 3: [] };

  // Scenario-I / S12: atomic CAS (same pattern as updateStockTransferStatus).
  // Prevents two concurrent "รับ"/"อนุมัติ" clicks from both creating
  // destination batches and racing the final updateDoc.
  const claim = await runTransaction(db, async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists()) throw new Error(`Withdrawal ${withdrawalId} not found`);
    const c = s.data();
    const curStat = Number(c.status);
    if (!(allowed[curStat] || []).includes(next)) {
      throw new Error(`Invalid withdrawal status transition ${curStat} → ${next}`);
    }
    const patch = { status: next, updatedAt: now };
    if (next === 3) patch.canceledNote = String(opts.canceledNote || '');
    tx.update(ref, patch);
    return { ...c, _prevStatus: curStat };
  });
  const cur = claim;
  const curStatus = claim._prevStatus;
  const user = opts.user || cur.user || { userId: null, userName: null };

  const docPath = `artifacts/${appId}/public/data/be_stock_withdrawals/${withdrawalId}`;

  async function _exportFromSource(item) {
    return runTransaction(db, async (tx) => {
      const bRef = stockBatchDoc(item.sourceBatchId);
      const bSnap = await tx.get(bRef);
      if (!bSnap.exists()) throw new Error(`Batch ${item.sourceBatchId} vanished`);
      const b = bSnap.data();
      if (b.status !== BATCH_STATUS.ACTIVE) throw new Error(`Batch ${item.sourceBatchId} became ${b.status}`);
      const before = Number(b.qty?.remaining || 0);
      if (before < item.qty) throw new Error(`Batch short`);
      const newQty = deductQtyNumeric(b.qty, item.qty);
      const newStat = newQty.remaining <= 0 ? BATCH_STATUS.DEPLETED : BATCH_STATUS.ACTIVE;
      tx.update(bRef, { qty: newQty, status: newStat, updatedAt: now });
      const mvtId = _genMovementId();
      tx.set(stockMovementDoc(mvtId), {
        movementId: mvtId,
        type: MOVEMENT_TYPES.EXPORT_WITHDRAWAL,
        batchId: item.sourceBatchId,
        productId: b.productId,
        productName: b.productName,
        qty: -item.qty,
        before,
        after: newQty.remaining,
        branchId: b.branchId,
        sourceDocPath: docPath,
        linkedWithdrawalId: withdrawalId,
        revenueImpact: null,
        costBasis: (Number(b.originalCost) || 0) * item.qty,
        isPremium: !!item.isPremium,
        skipped: false,
        user, note: '', createdAt: now,
      });
      return mvtId;
    });
  }

  async function _receiveAtDestination(item) {
    const newBatchId = _genBatchId();
    await setDoc(stockBatchDoc(newBatchId), {
      batchId: newBatchId,
      productId: item.productId,
      productName: item.productName,
      branchId: cur.destinationLocationId,
      orderProductId: `${withdrawalId}-${item.sourceBatchId}`,
      sourceOrderId: null,
      sourceBatchId: item.sourceBatchId,
      receivedAt: now,
      expiresAt: item.expiresAt,
      unit: item.unit,
      qty: buildQtyNumeric(item.qty),
      originalCost: item.cost,
      isPremium: item.isPremium,
      status: BATCH_STATUS.ACTIVE,
      createdAt: now, updatedAt: now,
    });
    const mvtId = _genMovementId();
    await setDoc(stockMovementDoc(mvtId), {
      movementId: mvtId,
      type: MOVEMENT_TYPES.WITHDRAWAL_CONFIRM,
      batchId: newBatchId,
      productId: item.productId,
      productName: item.productName,
      qty: item.qty,
      before: 0,
      after: item.qty,
      branchId: cur.destinationLocationId,
      sourceDocPath: docPath,
      linkedWithdrawalId: withdrawalId,
      revenueImpact: null,
      costBasis: item.cost * item.qty,
      isPremium: item.isPremium,
      skipped: false,
      user, note: '', createdAt: now,
    });
    return newBatchId;
  }

  async function _reverseExport(sourceBatchId) {
    const q = query(stockMovementsCol(),
      where('linkedWithdrawalId', '==', withdrawalId),
      where('batchId', '==', sourceBatchId),
      where('type', '==', MOVEMENT_TYPES.EXPORT_WITHDRAWAL));
    const s = await getDocs(q);
    for (const d of s.docs) {
      const m = d.data();
      if (m.reversedByMovementId || m.reverseOf) continue;
      await _reverseOneMovement(m.movementId, { user });
    }
  }

  // Heavy work — status is already advanced atomically in the claim tx above.
  if (curStatus === 0 && next === 1) {
    for (const it of cur.items) await _exportFromSource(it);
  }
  else if (curStatus === 1 && next === 2) {
    const updatedItems = [];
    for (const it of cur.items) {
      const destBatchId = await _receiveAtDestination(it);
      updatedItems.push({ ...it, destinationBatchId: destBatchId });
    }
    await updateDoc(ref, { items: updatedItems, updatedAt: new Date().toISOString() });
  }
  else if (curStatus === 1 && next === 3) {
    for (const it of cur.items) await _reverseExport(it.sourceBatchId);
  }
  return { withdrawalId, status: next, success: true };
}

export async function listStockWithdrawals({ locationId, status } = {}) {
  const snap = await getDocs(stockWithdrawalsCol());
  let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (locationId) list = list.filter(t => t.sourceLocationId === locationId || t.destinationLocationId === locationId);
  if (status != null) list = list.filter(t => Number(t.status) === Number(status));
  list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return list;
}

export async function getStockWithdrawal(withdrawalId) {
  const snap = await getDoc(stockWithdrawalDoc(withdrawalId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// ─── Promotion CRUD (Phase 9 Marketing) ────────────────────────────────────
// ProClinic `/admin/promotion` mirror. Full 27-field record lives in
// be_promotions; a denormalized 5-field copy is mirrored to
// master_data/promotions/items so the existing SaleTab buy modal can
// pick it up without waiting for the next ProClinic sync.

const promotionsCol = () => collection(db, ...basePath(), 'be_promotions');
const promotionDoc = (id) => doc(db, ...basePath(), 'be_promotions', String(id));

export async function getPromotion(proClinicId) {
  const snap = await getDoc(promotionDoc(proClinicId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listPromotions() {
  const snap = await getDocs(promotionsCol());
  const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  items.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return items;
}

export async function savePromotion(promotionId, data) {
  const id = String(promotionId || '');
  if (!id) throw new Error('promotionId required');
  if (!data || typeof data !== 'object') throw new Error('data object required');
  if (!String(data.promotion_name || '').trim()) throw new Error('promotion_name required');
  if (!(Number(data.sale_price) >= 0)) throw new Error('sale_price must be >= 0');

  const now = new Date().toISOString();
  await setDoc(promotionDoc(id), {
    ...data,
    promotionId: id,
    createdAt: data.createdAt || now,
    updatedAt: now,
  }, { merge: false });
}

export async function deletePromotion(promotionId) {
  const id = String(promotionId || '');
  if (!id) throw new Error('promotionId required');
  await deleteDoc(promotionDoc(id));
}

/**
 * Bulk-import promotions from master_data/promotions/items/* into
 * be_promotions/*. Preserves the source ProClinic id, copies name/price/
 * category/courses/products into our full 27-field schema with sensible
 * defaults for fields master_data doesn't carry (usage_type=clinic,
 * status=active, promotion_type=fixed, etc). Idempotent — re-running
 * overwrites the same doc ids. Returns { imported, skipped }.
 *
 * This is a one-way, one-time (or on-demand) migration. After running,
 * be_promotions/* becomes the source of truth for OUR CRUD UI.
 */
export async function migrateMasterPromotionsToBe() {
  const { buildBePromotionFromMaster } = await import('./phase9Mappers.js');
  const masterSnap = await getDocs(masterDataItemsCol('promotions'));
  if (masterSnap.empty) return { imported: 0, skipped: 0, total: 0 };

  const now = new Date().toISOString();
  let imported = 0;
  let skipped = 0;

  for (const d of masterSnap.docs) {
    const src = d.data();
    const id = String(d.id || src.id || '');
    if (!id) { skipped++; continue; }

    let existingCreatedAt = null;
    try {
      const existing = await getDoc(promotionDoc(id));
      if (existing.exists()) existingCreatedAt = existing.data().createdAt || null;
    } catch {}

    const doc_ = buildBePromotionFromMaster(src, id, now, existingCreatedAt);
    if (!doc_) { skipped++; continue; }
    await setDoc(promotionDoc(id), doc_, { merge: false });
    imported++;
  }

  return { imported, skipped, total: masterSnap.size };
}

// ─── Coupon CRUD (Phase 9 Marketing) ───────────────────────────────────────

const couponsCol = () => collection(db, ...basePath(), 'be_coupons');
const couponDoc = (id) => doc(db, ...basePath(), 'be_coupons', String(id));

export async function getCoupon(proClinicId) {
  const snap = await getDoc(couponDoc(proClinicId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listCoupons() {
  const snap = await getDocs(couponsCol());
  const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  items.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return items;
}

export async function saveCoupon(couponId, data) {
  const id = String(couponId || '');
  if (!id) throw new Error('couponId required');
  if (!data || typeof data !== 'object') throw new Error('data object required');
  if (!String(data.coupon_name || '').trim()) throw new Error('coupon_name required');
  if (!String(data.coupon_code || '').trim()) throw new Error('coupon_code required');

  const now = new Date().toISOString();
  await setDoc(couponDoc(id), {
    ...data,
    couponId: id,
    createdAt: data.createdAt || now,
    updatedAt: now,
  }, { merge: false });
}

export async function deleteCoupon(couponId) {
  const id = String(couponId || '');
  if (!id) throw new Error('couponId required');
  await deleteDoc(couponDoc(id));
}

/** Bulk-import from master_data/coupons → be_coupons. Uses pure mapper. */
export async function migrateMasterCouponsToBe() {
  const { buildBeCouponFromMaster } = await import('./phase9Mappers.js');
  const masterSnap = await getDocs(masterDataItemsCol('coupons'));
  if (masterSnap.empty) return { imported: 0, skipped: 0, total: 0 };
  const now = new Date().toISOString();
  let imported = 0, skipped = 0;
  for (const d of masterSnap.docs) {
    const src = d.data();
    const id = String(d.id || src.id || '');
    if (!id) { skipped++; continue; }
    let createdAt = null;
    try { const ex = await getDoc(couponDoc(id)); if (ex.exists()) createdAt = ex.data().createdAt; } catch {}
    const doc_ = buildBeCouponFromMaster(src, id, now, createdAt);
    if (!doc_) { skipped++; continue; }
    await setDoc(couponDoc(id), doc_, { merge: false });
    imported++;
  }
  return { imported, skipped, total: masterSnap.size };
}

/** Look up a coupon by code (for SaleTab apply flow). Returns null if not found/expired.
 *  Uses Bangkok-local date for expiry compare — UTC drift at 00:00-06:59 GMT+7
 *  would mark yesterday's coupons as still-valid. */
export async function findCouponByCode(code, { today } = {}) {
  if (!code) return null;
  const q = query(couponsCol(), where('coupon_code', '==', String(code).trim()));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const coupon = { id: snap.docs[0].id, ...snap.docs[0].data() };
  let todayStr = today;
  if (!todayStr) {
    const { thaiTodayISO } = await import('../utils.js');
    todayStr = thaiTodayISO();
  }
  if (coupon.start_date && coupon.start_date > todayStr) return null;
  if (coupon.end_date && coupon.end_date < todayStr) return null;
  return coupon;
}

// ─── Voucher CRUD (Phase 9 Marketing) ──────────────────────────────────────

const vouchersCol = () => collection(db, ...basePath(), 'be_vouchers');
const voucherDoc = (id) => doc(db, ...basePath(), 'be_vouchers', String(id));

export async function getVoucher(proClinicId) {
  const snap = await getDoc(voucherDoc(proClinicId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listVouchers() {
  const snap = await getDocs(vouchersCol());
  const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  items.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return items;
}

export async function saveVoucher(voucherId, data) {
  const id = String(voucherId || '');
  if (!id) throw new Error('voucherId required');
  if (!data || typeof data !== 'object') throw new Error('data object required');
  if (!String(data.voucher_name || '').trim()) throw new Error('voucher_name required');
  if (!(Number(data.sale_price) >= 0)) throw new Error('sale_price must be >= 0');

  const now = new Date().toISOString();
  await setDoc(voucherDoc(id), {
    ...data, voucherId: id,
    createdAt: data.createdAt || now, updatedAt: now,
  }, { merge: false });
}

export async function deleteVoucher(voucherId) {
  const id = String(voucherId || '');
  if (!id) throw new Error('voucherId required');
  await deleteDoc(voucherDoc(id));
}

/** Bulk-import from master_data/vouchers → be_vouchers. Uses pure mapper. */
export async function migrateMasterVouchersToBe() {
  const { buildBeVoucherFromMaster } = await import('./phase9Mappers.js');
  const masterSnap = await getDocs(masterDataItemsCol('vouchers'));
  if (masterSnap.empty) return { imported: 0, skipped: 0, total: 0 };
  const now = new Date().toISOString();
  let imported = 0, skipped = 0;
  for (const d of masterSnap.docs) {
    const src = d.data();
    const id = String(d.id || src.id || '');
    if (!id) { skipped++; continue; }
    let createdAt = null;
    try { const ex = await getDoc(voucherDoc(id)); if (ex.exists()) createdAt = ex.data().createdAt; } catch {}
    const doc_ = buildBeVoucherFromMaster(src, id, now, createdAt);
    if (!doc_) { skipped++; continue; }
    await setDoc(voucherDoc(id), doc_, { merge: false });
    imported++;
  }
  return { imported, skipped, total: masterSnap.size };
}

// ─── Product Group CRUD (Phase 11.2 Master Data Suite) ─────────────────────
// OUR collection per Rule H — no ProClinic write-back, sync-seed-only relation
// to master_data/products. Shape validated upstream by productGroupValidation.

const productGroupsCol = () => collection(db, ...basePath(), 'be_product_groups');
const productGroupDoc = (id) => doc(db, ...basePath(), 'be_product_groups', String(id));

export async function getProductGroup(groupId) {
  const id = String(groupId || '');
  if (!id) return null;
  const snap = await getDoc(productGroupDoc(id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listProductGroups() {
  const snap = await getDocs(productGroupsCol());
  const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  // Sort newest-first (by updatedAt); ties broken by createdAt so deterministic.
  items.sort((a, b) => {
    const ua = a.updatedAt || '';
    const ub = b.updatedAt || '';
    if (ua !== ub) return ub.localeCompare(ua);
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });
  return items;
}

export async function saveProductGroup(groupId, data) {
  const id = String(groupId || '');
  if (!id) throw new Error('groupId required');
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('data object required');
  if (!String(data.name || '').trim()) throw new Error('name required');
  if (!data.productType) throw new Error('productType required');

  // Phase 11.9: canonical field is `products: [{productId, qty}]`.
  // Legacy callers may still pass productIds[] — lift into products[{qty:1}].
  let products = Array.isArray(data.products)
    ? data.products
        .filter(p => p && typeof p === 'object')
        .map(p => ({ productId: String(p.productId || ''), qty: Number(p.qty) || 1 }))
        .filter(p => p.productId)
    : [];
  if (products.length === 0 && Array.isArray(data.productIds)) {
    products = data.productIds
      .filter(pid => typeof pid === 'string' && pid.trim())
      .map(pid => ({ productId: String(pid), qty: 1 }));
  }

  const now = new Date().toISOString();
  await setDoc(productGroupDoc(id), {
    ...data,
    groupId: id,
    name: String(data.name).trim(),
    status: data.status || 'ใช้งาน',
    products,
    // Derived convenience index for legacy readers / audits that still grep productIds[]
    productIds: products.map(p => p.productId),
    note: String(data.note || '').trim(),
    createdAt: data.createdAt || now,
    updatedAt: now,
  }, { merge: false });
}

export async function deleteProductGroup(groupId) {
  const id = String(groupId || '');
  if (!id) throw new Error('groupId required');
  await deleteDoc(productGroupDoc(id));
}

/**
 * Phase 11.9: read be_product_groups filtered by productType, enrich each
 * group's products[{productId, qty}] with be_products detail (name/unit/
 * price/label). Returns shape that TreatmentFormPage medication / consumable
 * group modals expect:
 *   [{ id, name, productType, products: [{id, name, qty, unit, price, label?}] }]
 *
 * Replaces the master_data/medication_groups + master_data/consumable_groups
 * cached paths. Single collection (be_product_groups) is canonical.
 *
 * @param {'ยากลับบ้าน' | 'สินค้าสิ้นเปลือง'} productType
 */
export async function listProductGroupsForTreatment(productType) {
  const targetType = String(productType || '').trim();
  if (!targetType) return [];
  const [groupsSnap, productsSnap] = await Promise.all([
    getDocs(productGroupsCol()),
    getDocs(productsCol()),
  ]);
  const productLookup = new Map();
  productsSnap.docs.forEach(d => {
    const p = d.data();
    const pid = String(p.productId || d.id || '');
    if (!pid) return;
    // Phase 11.9: be_products stores label fields flat (genericName,
    // dosageAmount, dosageUnit, ...) — reconstruct nested label object
    // for TreatmentFormPage med-group modal consumer.
    const hasLabel = p.genericName || p.dosageAmount || p.dosageUnit
      || p.timesPerDay != null || p.administrationMethod
      || (Array.isArray(p.administrationTimes) && p.administrationTimes.length)
      || p.instructions || p.indications;
    productLookup.set(pid, {
      id: pid,
      name: p.productName || '',
      unit: p.mainUnitName || '',
      price: p.price ?? 0,
      isVatIncluded: p.isVatIncluded ? 1 : 0,
      category: p.categoryName || '',
      label: hasLabel ? {
        genericName: p.genericName || '',
        indications: p.indications || '',
        dosageAmount: p.dosageAmount || '',
        dosageUnit: p.dosageUnit || '',
        timesPerDay: p.timesPerDay != null ? String(p.timesPerDay) : '',
        administrationMethod: p.administrationMethod || '',
        administrationMethodHour: p.administrationMethodHour || '',
        administrationTimes: Array.isArray(p.administrationTimes)
          ? p.administrationTimes.join(', ')
          : (p.administrationTimes || ''),
        instructions: p.instructions || '',
        storageInstructions: p.storageInstructions || '',
      } : null,
    });
  });

  const filtered = groupsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(g => {
      if ((g.status || 'ใช้งาน') !== 'ใช้งาน') return false;
      const gt = String(g.productType || '');
      // Match direct or via legacy 4-option normalization
      if (gt === targetType) return true;
      if (targetType === 'ยากลับบ้าน' && gt === 'ยา') return true;
      if (targetType === 'สินค้าสิ้นเปลือง' && (gt === 'สินค้าหน้าร้าน' || gt === 'บริการ')) return true;
      return false;
    });

  return filtered.map(g => {
    const entries = Array.isArray(g.products) && g.products.length > 0
      ? g.products
      : Array.isArray(g.productIds)
        ? g.productIds.map(pid => ({ productId: pid, qty: 1 }))
        : [];
    const products = entries.map(entry => {
      const pid = String(entry.productId);
      const lookup = productLookup.get(pid);
      if (lookup) {
        return { ...lookup, qty: Number(entry.qty) || 1 };
      }
      return {
        id: pid,
        name: `(สินค้า ${pid})`,
        unit: '',
        price: 0,
        qty: Number(entry.qty) || 1,
        isVatIncluded: 0,
        category: '',
        label: null,
      };
    });
    return {
      id: g.groupId || g.id,
      name: g.name || '',
      productType: g.productType || targetType,
      products,
    };
  });
}

/**
 * Lookup by (case-insensitive trimmed) name. Used by the form's "already
 * exists" check before create. Returns the matching doc or null.
 */
export async function findProductGroupByName(name) {
  const q = String(name || '').trim().toLowerCase();
  if (!q) return null;
  const snap = await getDocs(productGroupsCol());
  for (const d of snap.docs) {
    const data = d.data();
    if (String(data.name || '').trim().toLowerCase() === q) {
      return { id: d.id, ...data };
    }
  }
  return null;
}

// ─── Product Unit Group CRUD (Phase 11.3 Master Data Suite) ─────────────────
// Conversion-group model — each doc is a group of units where row 0 is the
// base (smallest) at amount=1 and rows 1..N declare multiples. Normalization
// is enforced via normalizeProductUnitGroup so Firestore never stores an
// inconsistent base flag / amount.

const productUnitsCol = () => collection(db, ...basePath(), 'be_product_units');
const productUnitDoc = (id) => doc(db, ...basePath(), 'be_product_units', String(id));

export async function getProductUnitGroup(unitGroupId) {
  const id = String(unitGroupId || '');
  if (!id) return null;
  const snap = await getDoc(productUnitDoc(id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listProductUnitGroups() {
  const snap = await getDocs(productUnitsCol());
  const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  items.sort((a, b) => {
    const ua = a.updatedAt || '';
    const ub = b.updatedAt || '';
    if (ua !== ub) return ub.localeCompare(ua);
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });
  return items;
}

export async function saveProductUnitGroup(unitGroupId, data) {
  const id = String(unitGroupId || '');
  if (!id) throw new Error('unitGroupId required');
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('data object required');
  const { normalizeProductUnitGroup, validateProductUnitGroup } = await import('./productUnitValidation.js');

  // Normalize before validate so shape issues (e.g. amount=0 on row 0) get
  // corrected into 1 instead of rejected — the client form already constrains
  // this, but guard defensively.
  const normalized = normalizeProductUnitGroup(data);
  const fail = validateProductUnitGroup(normalized);
  if (fail) {
    const [, msg] = fail;
    throw new Error(msg);
  }

  const now = new Date().toISOString();
  await setDoc(productUnitDoc(id), {
    ...normalized,
    unitGroupId: id,
    createdAt: data.createdAt || now,
    updatedAt: now,
  }, { merge: false });
}

export async function deleteProductUnitGroup(unitGroupId) {
  const id = String(unitGroupId || '');
  if (!id) throw new Error('unitGroupId required');
  await deleteDoc(productUnitDoc(id));
}

/**
 * Lookup by trimmed + case-insensitive groupName. Used by the form's
 * duplicate-name guard.
 */
export async function findProductUnitGroupByName(groupName) {
  const q = String(groupName || '').trim().toLowerCase();
  if (!q) return null;
  const snap = await getDocs(productUnitsCol());
  for (const d of snap.docs) {
    const data = d.data();
    if (String(data.groupName || '').trim().toLowerCase() === q) {
      return { id: d.id, ...data };
    }
  }
  return null;
}

// ─── Medical Instrument CRUD (Phase 11.4 Master Data Suite) ────────────────
// Equipment registry with maintenance scheduling. `maintenanceLog` entries
// accumulate forever (user trims manually); validator caps at MAX_LOG_ENTRIES
// to keep doc < 1MB.

const medicalInstrumentsCol = () => collection(db, ...basePath(), 'be_medical_instruments');
const medicalInstrumentDoc = (id) => doc(db, ...basePath(), 'be_medical_instruments', String(id));

export async function getMedicalInstrument(instrumentId) {
  const id = String(instrumentId || '');
  if (!id) return null;
  const snap = await getDoc(medicalInstrumentDoc(id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listMedicalInstruments() {
  const snap = await getDocs(medicalInstrumentsCol());
  const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  items.sort((a, b) => {
    const ua = a.updatedAt || '';
    const ub = b.updatedAt || '';
    if (ua !== ub) return ub.localeCompare(ua);
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });
  return items;
}

export async function saveMedicalInstrument(instrumentId, data) {
  const id = String(instrumentId || '');
  if (!id) throw new Error('instrumentId required');
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('data object required');
  const { normalizeMedicalInstrument, validateMedicalInstrument } = await import('./medicalInstrumentValidation.js');

  const normalized = normalizeMedicalInstrument(data);
  const fail = validateMedicalInstrument(normalized);
  if (fail) {
    const [, msg] = fail;
    throw new Error(msg);
  }

  const now = new Date().toISOString();
  await setDoc(medicalInstrumentDoc(id), {
    ...normalized,
    instrumentId: id,
    createdAt: data.createdAt || now,
    updatedAt: now,
  }, { merge: false });
}

export async function deleteMedicalInstrument(instrumentId) {
  const id = String(instrumentId || '');
  if (!id) throw new Error('instrumentId required');
  await deleteDoc(medicalInstrumentDoc(id));
}

// ─── Holiday CRUD (Phase 11.5 Master Data Suite) ────────────────────────────
// Two-type collection (specific-date vs weekly-day-of-week); AppointmentTab
// consumes via isDateHoliday() helper in holidayValidation.js. Wiring to the
// calendar slot-block lands in Phase 11.8.

const holidaysCol = () => collection(db, ...basePath(), 'be_holidays');
const holidayDoc = (id) => doc(db, ...basePath(), 'be_holidays', String(id));

export async function getHoliday(holidayId) {
  const id = String(holidayId || '');
  if (!id) return null;
  const snap = await getDoc(holidayDoc(id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listHolidays() {
  const snap = await getDocs(holidaysCol());
  const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  items.sort((a, b) => {
    const ua = a.updatedAt || '';
    const ub = b.updatedAt || '';
    if (ua !== ub) return ub.localeCompare(ua);
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });
  return items;
}

export async function saveHoliday(holidayId, data) {
  const id = String(holidayId || '');
  if (!id) throw new Error('holidayId required');
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('data object required');
  const { normalizeHoliday, validateHoliday } = await import('./holidayValidation.js');

  const normalized = normalizeHoliday(data);
  const fail = validateHoliday(normalized);
  if (fail) {
    const [, msg] = fail;
    throw new Error(msg);
  }

  const now = new Date().toISOString();
  await setDoc(holidayDoc(id), {
    ...normalized,
    holidayId: id,
    createdAt: data.createdAt || now,
    updatedAt: now,
  }, { merge: false });
}

export async function deleteHoliday(holidayId) {
  const id = String(holidayId || '');
  if (!id) throw new Error('holidayId required');
  await deleteDoc(holidayDoc(id));
}

// ─── Branch CRUD (Phase 11.6 Master Data Suite) ────────────────────────────
// Core branch record (identification/contact/address/map + isDefault + status).
// 7-day opening-hours deferred to Phase 13.

const branchesCol = () => collection(db, ...basePath(), 'be_branches');
const branchDoc = (id) => doc(db, ...basePath(), 'be_branches', String(id));

export async function getBranch(branchId) {
  const id = String(branchId || '');
  if (!id) return null;
  const snap = await getDoc(branchDoc(id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listBranches() {
  const snap = await getDocs(branchesCol());
  const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  // Default branch first, then newest-first.
  items.sort((a, b) => {
    if (!!a.isDefault !== !!b.isDefault) return a.isDefault ? -1 : 1;
    const ua = a.updatedAt || '';
    const ub = b.updatedAt || '';
    if (ua !== ub) return ub.localeCompare(ua);
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });
  return items;
}

export async function saveBranch(branchId, data) {
  const id = String(branchId || '');
  if (!id) throw new Error('branchId required');
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('data object required');
  const { normalizeBranch, validateBranch } = await import('./branchValidation.js');

  const normalized = normalizeBranch(data);
  const fail = validateBranch(normalized);
  if (fail) {
    const [, msg] = fail;
    throw new Error(msg);
  }

  // If this branch is being set as default, clear isDefault on all others so
  // only ONE default exists at a time.
  if (normalized.isDefault) {
    const all = await getDocs(branchesCol());
    const batch = writeBatch(db);
    for (const d of all.docs) {
      if (d.id !== id && d.data().isDefault === true) {
        batch.update(branchDoc(d.id), { isDefault: false, updatedAt: new Date().toISOString() });
      }
    }
    await batch.commit();
  }

  const now = new Date().toISOString();
  await setDoc(branchDoc(id), {
    ...normalized,
    branchId: id,
    createdAt: data.createdAt || now,
    updatedAt: now,
  }, { merge: false });
}

export async function deleteBranch(branchId) {
  const id = String(branchId || '');
  if (!id) throw new Error('branchId required');
  await deleteDoc(branchDoc(id));
}

// ─── Permission Group CRUD (Phase 11.7 Master Data Suite) ──────────────────
// Flat per-action permission map (Record<string, true>). Falsy values aren't
// persisted — absence = not granted. Enforcement via `hasPermission(group, key)`
// helper in permissionGroupValidation.js (11.8 wiring).

const permissionGroupsCol = () => collection(db, ...basePath(), 'be_permission_groups');
const permissionGroupDoc = (id) => doc(db, ...basePath(), 'be_permission_groups', String(id));

export async function getPermissionGroup(permissionGroupId) {
  const id = String(permissionGroupId || '');
  if (!id) return null;
  const snap = await getDoc(permissionGroupDoc(id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listPermissionGroups() {
  const snap = await getDocs(permissionGroupsCol());
  const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  items.sort((a, b) => {
    const ua = a.updatedAt || '';
    const ub = b.updatedAt || '';
    if (ua !== ub) return ub.localeCompare(ua);
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });
  return items;
}

export async function savePermissionGroup(permissionGroupId, data) {
  const id = String(permissionGroupId || '');
  if (!id) throw new Error('permissionGroupId required');
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('data object required');
  const { normalizePermissionGroup, validatePermissionGroup } = await import('./permissionGroupValidation.js');

  const normalized = normalizePermissionGroup(data);
  const fail = validatePermissionGroup(normalized);
  if (fail) {
    const [, msg] = fail;
    throw new Error(msg);
  }

  const now = new Date().toISOString();
  await setDoc(permissionGroupDoc(id), {
    ...normalized,
    permissionGroupId: id,
    createdAt: data.createdAt || now,
    updatedAt: now,
  }, { merge: false });
}

export async function deletePermissionGroup(permissionGroupId) {
  const id = String(permissionGroupId || '');
  if (!id) throw new Error('permissionGroupId required');
  await deleteDoc(permissionGroupDoc(id));
}

// ─── Phase 11.8b: Bulk-import master_data/* → be_* (DEV scaffolding) ─────────
// Each migrator reads `master_data/{type}/items/*` and writes to the
// corresponding `be_*` collection. Called from MasterDataTab's "นำเข้า" button
// AFTER ProClinic sync has populated master_data. Idempotent — re-running
// overwrites the same doc ids while preserving `createdAt`.
// @dev-only — removed with MasterDataTab per rule H-bis.

function mapMasterToProductGroup(src, id, now, existingCreatedAt) {
  if (!id) return null;
  // Phase 11.9: normalize 4-option legacy type → 2-option via validator helper.
  // ProClinic API returns 'ยากลับบ้าน' / 'สินค้าสิ้นเปลือง' directly (verified
  // via GET /admin/api/product-group).
  const rawType = src.productType || src.product_type || src.type || 'ยากลับบ้าน';
  const LEGACY = { 'ยา': 'ยากลับบ้าน', 'สินค้าหน้าร้าน': 'สินค้าสิ้นเปลือง', 'บริการ': 'สินค้าสิ้นเปลือง' };
  const productType = ['ยากลับบ้าน', 'สินค้าสิ้นเปลือง'].includes(rawType)
    ? rawType
    : (LEGACY[rawType] || 'ยากลับบ้าน');

  // Phase 11.9: ProClinic API response has products[] with pivot.qty per
  // group-product. Scraper passes through as src.products with
  // { productId, qty } shape. Legacy master_data may still have productIds[]
  // → lift into products[{productId, qty:1}].
  let products = [];
  if (Array.isArray(src.products) && src.products.length > 0) {
    products = src.products
      .map(p => ({
        productId: String(p.productId ?? p.id ?? ''),
        qty: Number(p.qty) || 1,
      }))
      .filter(p => p.productId);
  } else if (Array.isArray(src.productIds)) {
    products = src.productIds
      .filter(pid => typeof pid === 'string' && pid.trim())
      .map(pid => ({ productId: String(pid), qty: 1 }));
  }

  return {
    groupId: id,
    name: String(src.groupName || src.group_name || src.name || '').trim() || '(imported)',
    productType,
    products,
    status: src.status === 'พักใช้งาน' ? 'พักใช้งาน' : 'ใช้งาน',
    note: String(src.note || '').trim(),
    createdAt: existingCreatedAt || now,
    updatedAt: now,
  };
}

function mapMasterToProductUnit(src, id, now, existingCreatedAt) {
  if (!id) return null;
  // Expected shape: { groupName|name, units: [{name, amount}] }
  // ProClinic may ship as flat { unit_name: 'amp', unit_amount: 10 } array —
  // the scraper (11.8c) normalizes before writing master_data.
  let units = Array.isArray(src.units) ? src.units : [];
  if (units.length === 0) units = [{ name: src.baseUnitName || src.name || 'ชิ้น', amount: 1, isBase: true }];
  return {
    unitGroupId: id,
    groupName: String(src.groupName || src.group_name || src.name || '').trim() || '(imported)',
    units: units.map((u, i) => ({
      name: String(u.name || '').trim(),
      amount: i === 0 ? 1 : (Number(u.amount) || 1),
      isBase: i === 0,
    })),
    status: src.status === 'พักใช้งาน' ? 'พักใช้งาน' : 'ใช้งาน',
    note: String(src.note || '').trim(),
    createdAt: existingCreatedAt || now,
    updatedAt: now,
  };
}

function mapMasterToMedicalInstrument(src, id, now, existingCreatedAt) {
  if (!id) return null;
  return {
    instrumentId: id,
    name: String(src.name || src.medical_instrument_name || '').trim() || '(imported)',
    code: String(src.code || src.medical_instrument_code || '').trim(),
    costPrice: src.costPrice != null ? Number(src.costPrice) : (src.cost_price != null ? Number(src.cost_price) : null),
    purchaseDate: src.purchaseDate || src.purchase_date || '',
    maintenanceIntervalMonths: src.maintenanceIntervalMonths != null ? Number(src.maintenanceIntervalMonths) : (src.maintenance_interval_months != null ? Number(src.maintenance_interval_months) : null),
    nextMaintenanceDate: src.nextMaintenanceDate || src.next_maintenance_date || '',
    maintenanceLog: Array.isArray(src.maintenanceLog) ? src.maintenanceLog : [],
    status: ['ใช้งาน', 'พักใช้งาน', 'ซ่อมบำรุง'].includes(src.status) ? src.status : 'ใช้งาน',
    note: String(src.note || '').trim(),
    createdAt: existingCreatedAt || now,
    updatedAt: now,
  };
}

function mapMasterToHoliday(src, id, now, existingCreatedAt) {
  if (!id) return null;
  const type = src.type === 'weekly' ? 'weekly' : 'specific';
  const base = {
    holidayId: id,
    type,
    note: String(src.note || src.holiday_note || '').trim(),
    status: src.status === 'พักใช้งาน' ? 'พักใช้งาน' : 'ใช้งาน',
    createdAt: existingCreatedAt || now,
    updatedAt: now,
  };
  if (type === 'specific') {
    const dates = Array.isArray(src.dates) ? src.dates : (src.holiday_date ? [src.holiday_date] : []);
    base.dates = Array.from(new Set(dates.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(String(d))))).sort();
  } else {
    base.dayOfWeek = Math.max(0, Math.min(6, Number(src.dayOfWeek) || 0));
  }
  return base;
}

function mapMasterToBranch(src, id, now, existingCreatedAt) {
  if (!id) return null;
  const coerceNum = (v) => (v === '' || v == null) ? null : Number(v);
  return {
    branchId: id,
    name: String(src.name || src.branch_name || '').trim() || '(imported)',
    nameEn: String(src.nameEn || src.branch_name_en || '').trim(),
    phone: String(src.phone || src.telephone_number || '').replace(/[\s-]/g, ''),
    website: String(src.website || src.website_url || '').trim(),
    licenseNo: String(src.licenseNo || src.license_no || '').trim(),
    taxId: String(src.taxId || src.tax_id || '').trim(),
    address: String(src.address || '').trim(),
    addressEn: String(src.addressEn || src.address_en || '').trim(),
    googleMapUrl: String(src.googleMapUrl || src.google_map_url || '').trim(),
    latitude: coerceNum(src.latitude),
    longitude: coerceNum(src.longitude),
    isDefault: !!src.isDefault,
    status: src.status === 'พักใช้งาน' ? 'พักใช้งาน' : 'ใช้งาน',
    note: String(src.note || '').trim(),
    createdAt: existingCreatedAt || now,
    updatedAt: now,
  };
}

function mapMasterToPermissionGroup(src, id, now, existingCreatedAt) {
  if (!id) return null;
  const incoming = (src.permissions && typeof src.permissions === 'object' && !Array.isArray(src.permissions)) ? src.permissions : {};
  const perms = {};
  for (const [k, v] of Object.entries(incoming)) {
    if (v === true) perms[k] = true;
  }
  return {
    permissionGroupId: id,
    name: String(src.name || src.permission_group_name || '').trim() || '(imported)',
    description: String(src.description || '').trim(),
    permissions: perms,
    status: src.status === 'พักใช้งาน' ? 'พักใช้งาน' : 'ใช้งาน',
    createdAt: existingCreatedAt || now,
    updatedAt: now,
  };
}

async function runMasterToBeMigration({ sourceType, targetCol, targetDocFn, mapper }) {
  const masterSnap = await getDocs(masterDataItemsCol(sourceType));
  if (masterSnap.empty) return { imported: 0, skipped: 0, total: 0 };
  const now = new Date().toISOString();
  let imported = 0;
  let skipped = 0;
  for (const d of masterSnap.docs) {
    const src = d.data();
    const id = String(d.id || src.id || '');
    if (!id) { skipped++; continue; }
    let existingCreatedAt = null;
    try {
      const existing = await getDoc(targetDocFn(id));
      if (existing.exists()) existingCreatedAt = existing.data().createdAt || null;
    } catch {}
    const doc_ = mapper(src, id, now, existingCreatedAt);
    if (!doc_) { skipped++; continue; }
    await setDoc(targetDocFn(id), doc_, { merge: false });
    imported++;
  }
  return { imported, skipped, total: masterSnap.size };
}

export async function migrateMasterProductGroupsToBe() {
  return runMasterToBeMigration({ sourceType: 'product_groups', targetCol: productGroupsCol, targetDocFn: productGroupDoc, mapper: mapMasterToProductGroup });
}
export async function migrateMasterProductUnitsToBe() {
  return runMasterToBeMigration({ sourceType: 'product_units', targetCol: productUnitsCol, targetDocFn: productUnitDoc, mapper: mapMasterToProductUnit });
}
export async function migrateMasterMedicalInstrumentsToBe() {
  return runMasterToBeMigration({ sourceType: 'medical_instruments', targetCol: medicalInstrumentsCol, targetDocFn: medicalInstrumentDoc, mapper: mapMasterToMedicalInstrument });
}
export async function migrateMasterHolidaysToBe() {
  return runMasterToBeMigration({ sourceType: 'holidays', targetCol: holidaysCol, targetDocFn: holidayDoc, mapper: mapMasterToHoliday });
}
export async function migrateMasterBranchesToBe() {
  return runMasterToBeMigration({ sourceType: 'branches', targetCol: branchesCol, targetDocFn: branchDoc, mapper: mapMasterToBranch });
}
export async function migrateMasterPermissionGroupsToBe() {
  return runMasterToBeMigration({ sourceType: 'permission_groups', targetCol: permissionGroupsCol, targetDocFn: permissionGroupDoc, mapper: mapMasterToPermissionGroup });
}

// ─── Phase 14.x: master_data/df_groups → be_df_groups mapper + migrator ────
// Scraped shape (api/proclinic/master.js handleSyncDfGroups):
//   { id: 'ProClinic numeric id', name, rates: [{ courseId, value, type }],
//     status, _source }
// Target be_df_groups shape (Phase 13.3.1 saveDfGroup):
//   { id, groupId, name, note, status: 'active'|'disabled', rates: [...],
//     branchId, createdBy, createdAt, updatedAt }
// Doc id = ProClinic numeric id (validator relaxed in Phase 14.x to accept).

function mapMasterToDfGroup(src, id, now, existingCreatedAt) {
  if (!id) return null;
  // ProClinic status label is ใช้งาน/พักใช้งาน; be_df_groups uses active/disabled.
  const rawStatus = String(src.status || src.df_status || '').trim();
  const status = (rawStatus === 'พักใช้งาน' || rawStatus === 'disabled') ? 'disabled' : 'active';
  const rates = Array.isArray(src.rates) ? src.rates.map((r) => {
    const t = String(r?.type || '').toLowerCase();
    return {
      courseId: String(r?.courseId ?? r?.course_id ?? '').trim(),
      courseName: String(r?.courseName ?? r?.course_name ?? '').trim(),
      value: Math.max(0, Number(r?.value) || 0),
      type: (t === 'percent' || t === '%') ? 'percent' : 'baht',
    };
  }).filter((r) => r.courseId) : [];
  return {
    id,
    groupId: id,
    name: String(src.name || src.group_name || '').trim() || '(imported)',
    note: String(src.note || '').trim(),
    status,
    rates,
    branchId: '',
    createdBy: '',
    createdAt: existingCreatedAt || now,
    updatedAt: now,
  };
}

export async function migrateMasterDfGroupsToBe() {
  return runMasterToBeMigration({
    sourceType: 'df_groups',
    targetCol: dfGroupsCol,
    targetDocFn: dfGroupDocRef,
    mapper: mapMasterToDfGroup,
  });
}

// ─── Phase 14.x: master_data/df_staff_rates → be_df_staff_rates ───────────
// Scraped shape: { id, staffId, staffName, position, rates: [...], status }
// Target be_df_staff_rates shape (Phase 13.3.1 emptyDfStaffRatesForm):
//   { staffId, staffName, rates: [...] }
// Doc id = staffId (ProClinic numeric id).

function mapMasterToDfStaffRates(src, id, now, existingCreatedAt) {
  if (!id) return null;
  const rates = Array.isArray(src.rates) ? src.rates.map((r) => {
    const t = String(r?.type || '').toLowerCase();
    return {
      courseId: String(r?.courseId ?? r?.course_id ?? '').trim(),
      courseName: String(r?.courseName ?? r?.course_name ?? '').trim(),
      value: Math.max(0, Number(r?.value) || 0),
      type: (t === 'percent' || t === '%') ? 'percent' : 'baht',
    };
  }).filter((r) => r.courseId) : [];
  return {
    staffId: String(src.staffId || id),
    staffName: String(src.staffName || src.name || '').trim() || '(imported)',
    position: String(src.position || '').trim(),
    rates,
    createdAt: existingCreatedAt || now,
    updatedAt: now,
  };
}

export async function migrateMasterDfStaffRatesToBe() {
  return runMasterToBeMigration({
    sourceType: 'df_staff_rates',
    targetCol: dfStaffRatesCol,
    targetDocFn: dfStaffRatesDocRef,
    mapper: mapMasterToDfStaffRates,
  });
}

// ─── Phase 14.x: wallet_types + membership_types migrate to be_* ───────────
// Gap audit 2026-04-24. These entities had sync (/admin/api/wallet +
// /admin/api/membership) landing in master_data/* but no corresponding
// be_* collection. Per Rule H (OUR data in OUR Firestore) + H-tris
// (backend reads from be_*), migrate them so consumers (MembershipPanel,
// SaleTab wallet picker) transparently flip via BE_BACKED_MASTER_TYPES.

const walletTypesCol = () => collection(db, ...basePath(), 'be_wallet_types');
const walletTypeDoc = (id) => doc(db, ...basePath(), 'be_wallet_types', String(id));
const membershipTypesCol = () => collection(db, ...basePath(), 'be_membership_types');
const membershipTypeDoc = (id) => doc(db, ...basePath(), 'be_membership_types', String(id));

function mapMasterToWalletType(src, id, now, existingCreatedAt) {
  if (!id) return null;
  return {
    walletTypeId: String(id),
    name: String(src.name || src.wallet_name || '').trim() || '(imported)',
    description: String(src.description || '').trim(),
    status: String(src.status || '').trim() === 'พักใช้งาน' ? 'พักใช้งาน' : 'ใช้งาน',
    createdAt: existingCreatedAt || now,
    updatedAt: now,
  };
}

export async function migrateMasterWalletTypesToBe() {
  return runMasterToBeMigration({
    sourceType: 'wallet_types',
    targetCol: walletTypesCol,
    targetDocFn: walletTypeDoc,
    mapper: mapMasterToWalletType,
  });
}

function mapMasterToMembershipType(src, id, now, existingCreatedAt) {
  if (!id) return null;
  return {
    membershipTypeId: String(id),
    name: String(src.name || src.membership_name || '').trim() || '(imported)',
    colorName: String(src.colorName || src.color || '').trim(),
    credit: Math.max(0, Number(src.credit) || 0),
    price: Math.max(0, Number(src.price) || 0),
    point: Math.max(0, Number(src.point) || 0),
    bahtPerPoint: Math.max(0, Number(src.bahtPerPoint ?? src.baht_per_point) || 0),
    discountPercent: Math.max(0, Number(src.discountPercent ?? src.discount_percent) || 0),
    expiredInDays: Number(src.expiredInDays ?? src.expired_in) || 365,
    // Wallet link — preserved from master_data if already set by manual
    // edit, else blank. MembershipPanel can attach in a follow-up CRUD.
    walletTypeId: String(src.walletTypeId || '').trim(),
    walletTypeName: String(src.walletTypeName || '').trim(),
    status: String(src.status || '').trim() === 'พักใช้งาน' ? 'พักใช้งาน' : 'ใช้งาน',
    createdAt: existingCreatedAt || now,
    updatedAt: now,
  };
}

export async function migrateMasterMembershipTypesToBe() {
  return runMasterToBeMigration({
    sourceType: 'membership_types',
    targetCol: membershipTypesCol,
    targetDocFn: membershipTypeDoc,
    mapper: mapMasterToMembershipType,
  });
}

// ─── Phase 14.x gap audit: medicine label presets ─────────────────────────
const medicineLabelsCol = () => collection(db, ...basePath(), 'be_medicine_labels');
const medicineLabelDoc = (id) => doc(db, ...basePath(), 'be_medicine_labels', String(id));

function mapMasterToMedicineLabel(src, id, now, existingCreatedAt) {
  if (!id) return null;
  return {
    labelId: String(id),
    name: String(src.name || '').trim() || '(imported)',
    type: String(src.type || '').trim(),
    status: 'ใช้งาน',
    createdAt: existingCreatedAt || now,
    updatedAt: now,
  };
}

export async function migrateMasterMedicineLabelsToBe() {
  return runMasterToBeMigration({
    sourceType: 'medicine_labels',
    targetCol: medicineLabelsCol,
    targetDocFn: medicineLabelDoc,
    mapper: mapMasterToMedicineLabel,
  });
}

// ─── Staff CRUD (Phase 12.1) ────────────────────────────────────────────────
// Entity lives fully in Firestore. Firebase Auth account creation (when email +
// password supplied) is delegated to /api/admin/users via src/lib/adminUsersClient.js
// — this module intentionally stays Admin-SDK-free.

const staffCol = () => collection(db, ...basePath(), 'be_staff');
const staffDoc = (id) => doc(db, ...basePath(), 'be_staff', String(id));

export async function getStaff(staffId) {
  const id = String(staffId || '');
  if (!id) return null;
  const snap = await getDoc(staffDoc(id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listStaff() {
  const snap = await getDocs(staffCol());
  const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  items.sort((a, b) => {
    const ua = a.updatedAt || '';
    const ub = b.updatedAt || '';
    if (ua !== ub) return ub.localeCompare(ua);
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });
  return items;
}

export async function saveStaff(staffId, data) {
  const id = String(staffId || '');
  if (!id) throw new Error('staffId required');
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('data object required');
  const { normalizeStaff, validateStaff } = await import('./staffValidation.js');

  const normalized = normalizeStaff(data);
  const fail = validateStaff(normalized);
  if (fail) {
    const [, msg] = fail;
    throw new Error(msg);
  }

  // Don't persist the raw password to Firestore — it's consumed by /api/admin/users
  // at the caller before saveStaff is invoked.
  const { password: _drop, ...safe } = normalized;

  const now = new Date().toISOString();
  await setDoc(staffDoc(id), {
    ...safe,
    staffId: id,
    createdAt: data.createdAt || now,
    updatedAt: now,
  }, { merge: false });
}

export async function deleteStaff(staffId) {
  const id = String(staffId || '');
  if (!id) throw new Error('staffId required');
  await deleteDoc(staffDoc(id));
}

// ─── Doctors CRUD (Phase 12.1) ──────────────────────────────────────────────

const doctorsCol = () => collection(db, ...basePath(), 'be_doctors');
const doctorDoc = (id) => doc(db, ...basePath(), 'be_doctors', String(id));

export async function getDoctor(doctorId) {
  const id = String(doctorId || '');
  if (!id) return null;
  const snap = await getDoc(doctorDoc(id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listDoctors() {
  const snap = await getDocs(doctorsCol());
  const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  items.sort((a, b) => {
    // Doctors first, assistants second, then newest-first by updatedAt.
    const pa = a.position === 'แพทย์' ? 0 : 1;
    const pb = b.position === 'แพทย์' ? 0 : 1;
    if (pa !== pb) return pa - pb;
    const ua = a.updatedAt || '';
    const ub = b.updatedAt || '';
    if (ua !== ub) return ub.localeCompare(ua);
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });
  return items;
}

export async function saveDoctor(doctorId, data) {
  const id = String(doctorId || '');
  if (!id) throw new Error('doctorId required');
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('data object required');
  const { normalizeDoctor, validateDoctor } = await import('./doctorValidation.js');

  const normalized = normalizeDoctor(data);
  const fail = validateDoctor(normalized);
  if (fail) {
    const [, msg] = fail;
    throw new Error(msg);
  }

  const { password: _drop, ...safe } = normalized;

  const now = new Date().toISOString();
  await setDoc(doctorDoc(id), {
    ...safe,
    doctorId: id,
    createdAt: data.createdAt || now,
    updatedAt: now,
  }, { merge: false });
}

export async function deleteDoctor(doctorId) {
  const id = String(doctorId || '');
  if (!id) throw new Error('doctorId required');
  await deleteDoc(doctorDoc(id));
}

// ─── Phase 12.1: master_data → be_* mappers + migrators (staff + doctors) ───
// Masters come from the existing syncStaff/syncDoctors scrapers (list pages
// only — name/email/color/position/branches). Details like password + per-
// permission toggles land in be_* only when a human fills the CRUD form.
// @dev-only — part of Rule H-bis strip list.

function mapMasterToStaff(src, id, now, existingCreatedAt) {
  if (!id) return null;
  // Split scraped "name" into first + last if possible.
  const rawName = String(src.name || src.firstname || '').trim();
  const parts = rawName.split(/\s+/);
  const firstname = parts[0] || '(imported)';
  const lastname = parts.slice(1).join(' ');
  const position = typeof src.position === 'string' && src.position.trim() ? src.position.trim() : '';
  return {
    staffId: id,
    firstname,
    lastname,
    nickname: String(src.nickname || '').trim(),
    employeeCode: String(src.employeeCode || src.employee_code || '').trim(),
    email: String(src.email || '').trim(),
    position,
    permissionGroupId: '',
    branchIds: [],
    color: String(src.color || '').trim(),
    backgroundColor: '',
    hasSales: false,
    disabled: String(src.status || '').trim() === 'พักใช้งาน',
    firebaseUid: '',
    note: '',
    status: String(src.status || '').trim() === 'พักใช้งาน' ? 'พักใช้งาน' : 'ใช้งาน',
    createdAt: existingCreatedAt || now,
    updatedAt: now,
  };
}

function mapMasterToDoctor(src, id, now, existingCreatedAt) {
  if (!id) return null;
  const rawName = String(src.name || src.firstname || '').trim();
  const parts = rawName.split(/\s+/);
  const firstname = parts[0] || '(imported)';
  const lastname = parts.slice(1).join(' ');
  const rawPosition = typeof src.position === 'string' ? src.position.trim() : '';
  const position = rawPosition === 'ผู้ช่วยแพทย์' ? 'ผู้ช่วยแพทย์' : 'แพทย์';
  const hourly = src.hourlyRate != null ? Number(src.hourlyRate) : (src.hourlyIncome != null ? Number(src.hourlyIncome) : null);
  return {
    doctorId: id,
    firstname,
    lastname,
    firstnameEn: '',
    lastnameEn: '',
    nickname: String(src.nickname || '').trim(),
    email: String(src.email || '').trim(),
    position,
    professionalLicense: '',
    permissionGroupId: '',
    branchIds: [],
    color: String(src.color || '').trim(),
    backgroundColor: '',
    hourlyIncome: Number.isFinite(hourly) ? hourly : null,
    // Phase 14.x ask-C (2026-04-24): preserve defaultDfGroupId from sync
    // if provided. handleSyncDoctors now enriches doctor rows with the
    // ProClinic df_group_id assignment (via the treatment-create options
    // embedded JSON — same source our extractTreatmentCreateOptions uses).
    // Empty string when enrichment fetch failed or the doctor has no
    // default group set in ProClinic.
    defaultDfGroupId: String(src.defaultDfGroupId || src.df_group_id || '').trim(),
    dfPaidType: '',
    minimumDfType: '',
    hasSales: false,
    disabled: String(src.status || '').trim() === 'พักใช้งาน',
    firebaseUid: '',
    note: '',
    status: String(src.status || '').trim() === 'พักใช้งาน' ? 'พักใช้งาน' : 'ใช้งาน',
    createdAt: existingCreatedAt || now,
    updatedAt: now,
  };
}

export async function migrateMasterStaffToBe() {
  return runMasterToBeMigration({ sourceType: 'staff', targetCol: staffCol, targetDocFn: staffDoc, mapper: mapMasterToStaff });
}

export async function migrateMasterDoctorsToBe() {
  return runMasterToBeMigration({ sourceType: 'doctors', targetCol: doctorsCol, targetDocFn: doctorDoc, mapper: mapMasterToDoctor });
}

// ─── Products CRUD (Phase 12.2) ─────────────────────────────────────────────

const productsCol = () => collection(db, ...basePath(), 'be_products');
const productDoc = (id) => doc(db, ...basePath(), 'be_products', String(id));

export async function getProduct(productId) {
  const id = String(productId || '');
  if (!id) return null;
  const snap = await getDoc(productDoc(id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listProducts() {
  const snap = await getDocs(productsCol());
  const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  items.sort((a, b) => {
    const oa = a.orderBy ?? null;
    const ob = b.orderBy ?? null;
    if (oa !== ob) {
      if (oa == null) return 1;
      if (ob == null) return -1;
      return oa - ob;
    }
    const na = (a.productName || '').toLowerCase();
    const nb = (b.productName || '').toLowerCase();
    return na.localeCompare(nb, 'th');
  });
  return items;
}

export async function saveProduct(productId, data) {
  const id = String(productId || '');
  if (!id) throw new Error('productId required');
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('data object required');
  const { normalizeProduct, validateProduct } = await import('./productValidation.js');
  const normalized = normalizeProduct(data);
  const fail = validateProduct(normalized);
  if (fail) {
    const [, msg] = fail;
    throw new Error(msg);
  }
  const now = new Date().toISOString();
  await setDoc(productDoc(id), {
    ...normalized,
    productId: id,
    createdAt: data.createdAt || now,
    updatedAt: now,
  }, { merge: false });
}

export async function deleteProduct(productId) {
  const id = String(productId || '');
  if (!id) throw new Error('productId required');
  await deleteDoc(productDoc(id));
}

// ─── Courses CRUD (Phase 12.2) ──────────────────────────────────────────────

const coursesCol = () => collection(db, ...basePath(), 'be_courses');
const courseDoc = (id) => doc(db, ...basePath(), 'be_courses', String(id));

export async function getCourse(courseId) {
  const id = String(courseId || '');
  if (!id) return null;
  const snap = await getDoc(courseDoc(id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listCourses() {
  const snap = await getDocs(coursesCol());
  const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  items.sort((a, b) => {
    const oa = a.orderBy ?? null;
    const ob = b.orderBy ?? null;
    if (oa !== ob) {
      if (oa == null) return 1;
      if (ob == null) return -1;
      return oa - ob;
    }
    const na = (a.courseName || '').toLowerCase();
    const nb = (b.courseName || '').toLowerCase();
    return na.localeCompare(nb, 'th');
  });
  return items;
}

export async function saveCourse(courseId, data) {
  const id = String(courseId || '');
  if (!id) throw new Error('courseId required');
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('data object required');
  const { normalizeCourse, validateCourse } = await import('./courseValidation.js');
  const normalized = normalizeCourse(data);
  const fail = validateCourse(normalized);
  if (fail) {
    const [, msg] = fail;
    throw new Error(msg);
  }
  const now = new Date().toISOString();
  await setDoc(courseDoc(id), {
    ...normalized,
    courseId: id,
    createdAt: data.createdAt || now,
    updatedAt: now,
  }, { merge: false });
}

export async function deleteCourse(courseId) {
  const id = String(courseId || '');
  if (!id) throw new Error('courseId required');
  await deleteDoc(courseDoc(id));
}

// ─── Phase 12.2: master_data → be_* (products + courses) ───────────────────
// @dev-only scaffolding per rule H-bis.

function mapMasterToProduct(src, id, now, existingCreatedAt) {
  if (!id) return null;
  // ProClinic master_data may store productType as 'ยากลับบ้าน' when coming
  // from the product-group enriched sync (Phase 11.9 switched to JSON API
  // which exposes 'ยากลับบ้าน' as a product-group type). Normalize back to
  // the 4-option product enum used by ProductFormModal.
  const ptRaw = src.productType || src.product_type || 'ยา';
  const ptNormalized = ptRaw === 'ยากลับบ้าน' ? 'ยา' : ptRaw;
  return {
    productId: id,
    productName: String(src.productName || src.product_name || src.name || '').trim() || '(imported)',
    productCode: String(src.productCode || src.product_code || '').trim(),
    productType: ['ยา', 'สินค้าหน้าร้าน', 'สินค้าสิ้นเปลือง', 'บริการ'].includes(ptNormalized) ? ptNormalized : 'ยา',
    serviceType: String(src.serviceType || src.service_type || '').trim(),
    genericName: String(src.genericName || src.generic_name || '').trim(),
    categoryName: String(src.categoryName || src.category_name || src.category || '').trim(),
    subCategoryName: String(src.subCategoryName || src.sub_category_name || '').trim(),
    mainUnitName: String(src.mainUnitName || src.unit_name || src.unit || '').trim(),
    // ProClinic 'price' may arrive as string ("10.00") — coerce to Number.
    // Accept sale_price + selling_price as legacy fallbacks.
    price: src.price != null ? Number(src.price) : (src.sale_price != null ? Number(src.sale_price) : (src.selling_price != null ? Number(src.selling_price) : null)),
    priceInclVat: src.priceInclVat != null ? Number(src.priceInclVat) : (src.price_incl_vat != null ? Number(src.price_incl_vat) : null),
    isVatIncluded: !!(src.isVatIncluded || src.is_vat_included),
    isClaimDrugDiscount: !!(src.isClaimDrugDiscount || src.is_claim_drug_discount),
    isTakeawayProduct: !!(src.isTakeawayProduct || src.is_takeaway_product),
    defaultProductUnitGroupId: '',
    stockLocation: String(src.stockLocation || src.stock_location || '').trim(),
    alertDayBeforeExpire: src.alertDayBeforeExpire != null ? Number(src.alertDayBeforeExpire) : (src.alert_day_before_expire != null ? Number(src.alert_day_before_expire) : null),
    alertQtyBeforeOutOfStock: src.alertQtyBeforeOutOfStock != null ? Number(src.alertQtyBeforeOutOfStock) : (src.alert_qty_before_out_of_stock != null ? Number(src.alert_qty_before_out_of_stock) : null),
    alertQtyBeforeMaxStock: src.alertQtyBeforeMaxStock != null ? Number(src.alertQtyBeforeMaxStock) : (src.alert_qty_before_max_stock != null ? Number(src.alert_qty_before_max_stock) : null),
    dosageAmount: String(src.dosageAmount || src.dosage_amount || '').trim(),
    dosageUnit: String(src.dosageUnit || src.dosage_unit || '').trim(),
    indications: String(src.indications || '').trim(),
    instructions: String(src.instructions || '').trim(),
    storageInstructions: String(src.storageInstructions || src.storage_instructions || '').trim(),
    administrationMethod: String(src.administrationMethod || src.administration_method || '').trim(),
    administrationMethodHour: String(src.administrationMethodHour || src.administration_method_hour || '').trim(),
    administrationTimes: Array.isArray(src.administrationTimes) ? src.administrationTimes.slice() : [],
    timesPerDay: src.timesPerDay != null ? Number(src.timesPerDay) : null,
    orderBy: src.orderBy != null ? Number(src.orderBy) : null,
    status: src.status === 'พักใช้งาน' || src.status === 0 ? 'พักใช้งาน' : 'ใช้งาน',
    createdAt: existingCreatedAt || now,
    updatedAt: now,
  };
}

// Phase 12.2b Step 3 (2026-04-24): extended from 13 → 26 fields to match
// the ProClinic course edit page 1:1. Accepts both camelCase (OUR shape)
// and snake_case (ProClinic JSON shape) for every new field so the mapper
// can run against fresh sync output OR legacy master_data docs written
// before Phase 12.2b. Default values align with emptyCourseForm() +
// courseValidation normalizeCourse() — isDf defaults true, booleans default
// false, numbers default null. Exported so tests/courseMigrate.test.js can
// exercise the mapper without Firestore.
export function mapMasterToCourse(src, id, now, existingCreatedAt) {
  if (!id || !src) return null;
  const products = Array.isArray(src.courseProducts) ? src.courseProducts
                 : Array.isArray(src.products) ? src.products : [];
  // ProClinic master_data sync writes plain `price` / `price_incl_vat`, not
  // `salePrice`. Previous migrate left salePrice=null → buy modal showed
  // NaN. Accept all 3 names (Phase 11.9 fix 2026-04-20).
  const resolvePrice = () => {
    if (src.salePrice != null) return Number(src.salePrice);
    if (src.sale_price != null) return Number(src.sale_price);
    if (src.price != null) return Number(src.price);
    return null;
  };
  const resolvePriceInclVat = () => {
    if (src.salePriceInclVat != null) return Number(src.salePriceInclVat);
    if (src.sale_price_incl_vat != null) return Number(src.sale_price_incl_vat);
    if (src.price_incl_vat != null) return Number(src.price_incl_vat);
    return null;
  };
  const numOrNull = (v) => {
    if (v === '' || v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  // Main product fallback — when top-level main_product_id is missing (older
  // master_data docs) infer from courseProducts entry with is_main_product.
  let mainId = String(src.mainProductId ?? src.main_product_id ?? '').trim();
  let mainName = String(src.mainProductName ?? src.main_product_name ?? '').trim();
  if (!mainId) {
    const mainItem = products.find(p => p && (p.isMainProduct || p.is_main_product));
    if (mainItem) {
      mainId = String(mainItem.productId || mainItem.product_id || mainItem.id || '').trim();
      mainName = String(mainItem.productName || mainItem.product_name || mainItem.name || '').trim();
    }
  }
  return {
    courseId: id,
    courseName: String(src.courseName || src.course_name || src.name || '').trim() || '(imported)',
    courseCode: String(src.courseCode || src.course_code || '').trim(),
    receiptCourseName: String(src.receiptCourseName || src.receipt_course_name || '').trim(),
    courseCategory: String(src.courseCategory || src.course_category || src.category || '').trim(),
    procedureType: String(src.procedureType || src.procedure_type || src.procedure_type_name || '').trim(),
    courseType: String(src.courseType || src.course_type || '').trim(),
    usageType: String(src.usageType || src.usage_type || '').trim(),
    time: numOrNull(src.time),
    period: numOrNull(src.period),
    salePrice: resolvePrice(),
    salePriceInclVat: resolvePriceInclVat(),
    isVatIncluded: !!(src.isVatIncluded || src.is_vat_included),
    deductCost: numOrNull(src.deductCost != null ? src.deductCost : src.deduct_cost),
    mainProductId: mainId,
    mainProductName: mainName,
    mainQty: numOrNull(src.mainQty != null ? src.mainQty : src.main_product_qty),
    qtyPerTime: numOrNull(src.qtyPerTime != null ? src.qtyPerTime : src.qty_per_time),
    minQty: numOrNull(src.minQty != null ? src.minQty : src.min_qty),
    maxQty: numOrNull(src.maxQty != null ? src.maxQty : src.max_qty),
    daysBeforeExpire: numOrNull(src.daysBeforeExpire != null ? src.daysBeforeExpire : src.days_before_expire),
    // isDf defaults true when BOTH camelCase and snake_case are unset —
    // matches emptyCourseForm() "มีค่ามือ default on".
    isDf: (src.isDf == null && src.is_df == null) ? true : !!(src.isDf != null ? src.isDf : src.is_df),
    dfEditableGlobal: !!(src.dfEditableGlobal || src.df_editable_global),
    isHidden: !!(src.isHidden || src.is_hidden || src.is_hidden_for_sale),
    courseProducts: products.map(p => ({
      productId: String(p.productId || p.product_id || p.id || '').trim(),
      productName: String(p.productName || p.product_name || p.name || '').trim(),
      qty: Number(p.qty) || 0,
      qtyPerTime: numOrNull(p.qtyPerTime != null ? p.qtyPerTime : p.qty_per_time),
      minQty: numOrNull(p.minQty != null ? p.minQty : p.min_qty),
      maxQty: numOrNull(p.maxQty != null ? p.maxQty : p.max_qty),
      isRequired: !!(p.isRequired || p.is_required),
      // Same default-true rule as top-level isDf.
      isDf: (p.isDf == null && p.is_df == null) ? true : !!(p.isDf != null ? p.isDf : p.is_df),
      isHidden: !!(p.isHidden || p.is_hidden),
    })).filter(p => p.productId && p.qty > 0),
    orderBy: src.orderBy != null ? Number(src.orderBy) : null,
    status: src.status === 'พักใช้งาน' || src.status === 0 ? 'พักใช้งาน' : 'ใช้งาน',
    createdAt: existingCreatedAt || now,
    updatedAt: now,
  };
}

export async function migrateMasterProductsToBe() {
  return runMasterToBeMigration({ sourceType: 'products', targetCol: productsCol, targetDocFn: productDoc, mapper: mapMasterToProduct });
}

export async function migrateMasterCoursesToBeV2() {
  return runMasterToBeMigration({ sourceType: 'courses', targetCol: coursesCol, targetDocFn: courseDoc, mapper: mapMasterToCourse });
}

// ─── Bank Accounts CRUD (Phase 12.5) ────────────────────────────────────────

const bankAccountsCol = () => collection(db, ...basePath(), 'be_bank_accounts');
const bankAccountDoc = (id) => doc(db, ...basePath(), 'be_bank_accounts', String(id));

export async function getBankAccount(bankAccountId) {
  const id = String(bankAccountId || '');
  if (!id) return null;
  const snap = await getDoc(bankAccountDoc(id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listBankAccounts() {
  const snap = await getDocs(bankAccountsCol());
  const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  items.sort((a, b) => {
    if (!!a.isDefault !== !!b.isDefault) return a.isDefault ? -1 : 1;
    return (a.bankName || '').localeCompare(b.bankName || '', 'th');
  });
  return items;
}

export async function saveBankAccount(bankAccountId, data) {
  const id = String(bankAccountId || '');
  if (!id) throw new Error('bankAccountId required');
  const { normalizeBankAccount, validateBankAccount } = await import('./bankAccountValidation.js');
  const normalized = normalizeBankAccount(data);
  const fail = validateBankAccount(normalized);
  if (fail) throw new Error(fail[1]);

  if (normalized.isDefault) {
    const all = await getDocs(bankAccountsCol());
    const batch = writeBatch(db);
    for (const d of all.docs) {
      if (d.id !== id && d.data().isDefault === true) {
        batch.update(bankAccountDoc(d.id), { isDefault: false, updatedAt: new Date().toISOString() });
      }
    }
    await batch.commit();
  }

  const now = new Date().toISOString();
  await setDoc(bankAccountDoc(id), {
    ...normalized,
    bankAccountId: id,
    createdAt: data.createdAt || now,
    updatedAt: now,
  }, { merge: false });
}

export async function deleteBankAccount(bankAccountId) {
  const id = String(bankAccountId || '');
  if (!id) throw new Error('bankAccountId required');
  await deleteDoc(bankAccountDoc(id));
}

// ─── Expense Categories CRUD (Phase 12.5) ───────────────────────────────────

const expenseCategoriesCol = () => collection(db, ...basePath(), 'be_expense_categories');
const expenseCategoryDoc = (id) => doc(db, ...basePath(), 'be_expense_categories', String(id));

export async function listExpenseCategories() {
  const snap = await getDocs(expenseCategoriesCol());
  const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  items.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'th'));
  return items;
}

export async function saveExpenseCategory(categoryId, data) {
  const id = String(categoryId || '');
  if (!id) throw new Error('categoryId required');
  const { normalizeExpenseCategory, validateExpenseCategory } = await import('./expenseCategoryValidation.js');
  const normalized = normalizeExpenseCategory(data);
  const fail = validateExpenseCategory(normalized);
  if (fail) throw new Error(fail[1]);
  const now = new Date().toISOString();
  await setDoc(expenseCategoryDoc(id), {
    ...normalized,
    categoryId: id,
    createdAt: data.createdAt || now,
    updatedAt: now,
  }, { merge: false });
}

export async function deleteExpenseCategory(categoryId) {
  const id = String(categoryId || '');
  if (!id) throw new Error('categoryId required');
  await deleteDoc(expenseCategoryDoc(id));
}

// ─── Expenses CRUD (Phase 12.5) ─────────────────────────────────────────────

const expensesCol = () => collection(db, ...basePath(), 'be_expenses');
const expenseDoc = (id) => doc(db, ...basePath(), 'be_expenses', String(id));

export async function getExpense(expenseId) {
  const id = String(expenseId || '');
  if (!id) return null;
  const snap = await getDoc(expenseDoc(id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listExpenses({ startDate, endDate, categoryId, branchId } = {}) {
  const snap = await getDocs(expensesCol());
  let items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (startDate) items = items.filter(e => (e.date || '') >= startDate);
  if (endDate) items = items.filter(e => (e.date || '') <= endDate);
  if (categoryId) items = items.filter(e => e.categoryId === categoryId);
  if (branchId) items = items.filter(e => e.branchId === branchId);
  items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return items;
}

export async function saveExpense(expenseId, data, opts = {}) {
  const id = String(expenseId || '');
  if (!id) throw new Error('expenseId required');
  const { normalizeExpense, validateExpense } = await import('./expenseValidation.js');
  const normalized = normalizeExpense(data);
  const fail = validateExpense(normalized, { strict: !!opts.strict });
  if (fail) throw new Error(fail[1]);
  const now = new Date().toISOString();
  await setDoc(expenseDoc(id), {
    ...normalized,
    expenseId: id,
    createdAt: data.createdAt || now,
    updatedAt: now,
  }, { merge: false });
}

export async function deleteExpense(expenseId) {
  const id = String(expenseId || '');
  if (!id) throw new Error('expenseId required');
  await deleteDoc(expenseDoc(id));
}

// ─── Online Sales CRUD + state machine (Phase 12.6) ────────────────────────

const onlineSalesCol = () => collection(db, ...basePath(), 'be_online_sales');
const onlineSaleDoc = (id) => doc(db, ...basePath(), 'be_online_sales', String(id));

export async function getOnlineSale(onlineSaleId) {
  const id = String(onlineSaleId || '');
  if (!id) return null;
  const snap = await getDoc(onlineSaleDoc(id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listOnlineSales({ status, startDate, endDate } = {}) {
  const snap = await getDocs(onlineSalesCol());
  let items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (status) items = items.filter(o => o.status === status);
  if (startDate) items = items.filter(o => (o.transferDate || '') >= startDate);
  if (endDate) items = items.filter(o => (o.transferDate || '') <= endDate);
  items.sort((a, b) => (b.transferDate || '').localeCompare(a.transferDate || ''));
  return items;
}

export async function saveOnlineSale(onlineSaleId, data, opts = {}) {
  const id = String(onlineSaleId || '');
  if (!id) throw new Error('onlineSaleId required');
  const { normalizeOnlineSale, validateOnlineSale } = await import('./onlineSaleValidation.js');
  const normalized = normalizeOnlineSale(data);
  const fail = validateOnlineSale(normalized, { strict: !!opts.strict });
  if (fail) throw new Error(fail[1]);
  const now = new Date().toISOString();
  await setDoc(onlineSaleDoc(id), {
    ...normalized,
    onlineSaleId: id,
    createdAt: data.createdAt || now,
    updatedAt: now,
  }, { merge: false });
}

export async function deleteOnlineSale(onlineSaleId) {
  const id = String(onlineSaleId || '');
  if (!id) throw new Error('onlineSaleId required');
  await deleteDoc(onlineSaleDoc(id));
}

// Transition an online-sale through its status machine. Persists timestamp
// fields (paidAt / completedAt / cancelledAt) on transition.
export async function transitionOnlineSale(onlineSaleId, nextStatus, extra = {}) {
  const id = String(onlineSaleId || '');
  if (!id) throw new Error('onlineSaleId required');
  const { applyStatusTransition } = await import('./onlineSaleValidation.js');
  const ref = onlineSaleDoc(id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('online sale not found');
  const cur = snap.data();
  const resolved = applyStatusTransition(cur.status || 'pending', nextStatus);
  const now = new Date().toISOString();
  const updates = { status: resolved, updatedAt: now };
  if (resolved === 'paid' && !cur.paidAt) updates.paidAt = now;
  if (resolved === 'completed' && !cur.completedAt) updates.completedAt = now;
  if (resolved === 'cancelled' && !cur.cancelledAt) updates.cancelledAt = now;
  if (extra.linkedSaleId) updates.linkedSaleId = String(extra.linkedSaleId);
  if (extra.cancelReason != null) updates.cancelReason = String(extra.cancelReason);
  await updateDoc(ref, updates);
  return { success: true, status: resolved };
}

// ─── Sale Insurance Claims CRUD (Phase 12.7) ───────────────────────────────
// Multiple claim rows per sale permitted (partial reimbursements). Aggregator
// in saleReportAggregator.js reads via listSaleInsuranceClaims.

const saleInsuranceClaimsCol = () => collection(db, ...basePath(), 'be_sale_insurance_claims');
const saleInsuranceClaimDoc = (id) => doc(db, ...basePath(), 'be_sale_insurance_claims', String(id));

export async function getSaleInsuranceClaim(claimId) {
  const id = String(claimId || '');
  if (!id) return null;
  const snap = await getDoc(saleInsuranceClaimDoc(id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listSaleInsuranceClaims({ saleId, status, startDate, endDate } = {}) {
  const snap = await getDocs(saleInsuranceClaimsCol());
  let items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (saleId) items = items.filter(c => c.saleId === saleId);
  if (status) items = items.filter(c => c.status === status);
  if (startDate) items = items.filter(c => (c.claimDate || '') >= startDate);
  if (endDate) items = items.filter(c => (c.claimDate || '') <= endDate);
  items.sort((a, b) => (b.claimDate || '').localeCompare(a.claimDate || ''));
  return items;
}

export async function saveSaleInsuranceClaim(claimId, data, opts = {}) {
  const id = String(claimId || '');
  if (!id) throw new Error('claimId required');
  const { normalizeSaleInsuranceClaim, validateSaleInsuranceClaim } = await import('./saleInsuranceClaimValidation.js');
  const normalized = normalizeSaleInsuranceClaim(data);
  const fail = validateSaleInsuranceClaim(normalized, { strict: !!opts.strict });
  if (fail) throw new Error(fail[1]);
  const now = new Date().toISOString();
  await setDoc(saleInsuranceClaimDoc(id), {
    ...normalized,
    claimId: id,
    createdAt: data.createdAt || now,
    updatedAt: now,
  }, { merge: false });
}

export async function deleteSaleInsuranceClaim(claimId) {
  const id = String(claimId || '');
  if (!id) throw new Error('claimId required');
  await deleteDoc(saleInsuranceClaimDoc(id));
}

export async function transitionSaleInsuranceClaim(claimId, nextStatus, extra = {}) {
  const id = String(claimId || '');
  if (!id) throw new Error('claimId required');
  const { applyClaimStatusTransition } = await import('./saleInsuranceClaimValidation.js');
  const ref = saleInsuranceClaimDoc(id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('claim not found');
  const cur = snap.data();
  const resolved = applyClaimStatusTransition(cur.status || 'pending', nextStatus);
  const now = new Date().toISOString();
  const updates = { status: resolved, updatedAt: now };
  if (resolved === 'approved' && !cur.approvedAt) updates.approvedAt = now;
  if (resolved === 'paid' && !cur.paidAt) updates.paidAt = now;
  if (resolved === 'rejected' && !cur.rejectedAt) updates.rejectedAt = now;
  if (extra.paidAmount != null) updates.paidAmount = Number(extra.paidAmount) || 0;
  if (extra.rejectReason != null) updates.rejectReason = String(extra.rejectReason);
  await updateDoc(ref, updates);
  return { success: true, status: resolved };
}

// ─── Document Templates CRUD (Phase 14.1) ──────────────────────────────────
// 13 ProClinic document variants (6 medical certs + fit-to-fly +
// medicine-label + 4 system templates + patient-referral) share ONE
// collection via the `docType` discriminator. Seeded on first load if the
// collection is empty (isSystemDefault: true so users can edit but not
// delete the originals).

const documentTemplatesCol = () => collection(db, ...basePath(), 'be_document_templates');
const documentTemplateDoc = (id) => doc(db, ...basePath(), 'be_document_templates', String(id));

export async function getDocumentTemplate(templateId) {
  const id = String(templateId || '');
  if (!id) return null;
  const snap = await getDoc(documentTemplateDoc(id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listDocumentTemplates({ docType, activeOnly = false } = {}) {
  const snap = await getDocs(documentTemplatesCol());
  let items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (docType) items = items.filter(t => t.docType === docType);
  if (activeOnly) items = items.filter(t => t.isActive !== false);
  items.sort((a, b) => {
    // docType alphabetical, then system-defaults first within each type
    const c = (a.docType || '').localeCompare(b.docType || '');
    if (c !== 0) return c;
    if (a.isSystemDefault && !b.isSystemDefault) return -1;
    if (!a.isSystemDefault && b.isSystemDefault) return 1;
    return (a.name || '').localeCompare(b.name || '');
  });
  return items;
}

export async function saveDocumentTemplate(templateId, data, opts = {}) {
  const id = String(templateId || '');
  if (!id) throw new Error('templateId required');
  const { normalizeDocumentTemplate, validateDocumentTemplate } = await import('./documentTemplateValidation.js');
  const normalized = normalizeDocumentTemplate(data);
  const fail = validateDocumentTemplate(normalized, { strict: !!opts.strict });
  if (fail) throw new Error(fail[1]);
  const now = new Date().toISOString();
  await setDoc(documentTemplateDoc(id), {
    ...normalized,
    templateId: id,
    createdAt: data.createdAt || now,
    updatedAt: now,
  }, { merge: false });
}

export async function deleteDocumentTemplate(templateId) {
  const id = String(templateId || '');
  if (!id) throw new Error('templateId required');
  const existing = await getDocumentTemplate(id);
  if (existing?.isSystemDefault) {
    throw new Error('ไม่สามารถลบเทมเพลตระบบได้ (แก้ไขได้แต่ห้ามลบ)');
  }
  await deleteDoc(documentTemplateDoc(id));
}

/**
 * Seed the 13 default templates from `SEED_TEMPLATES` on first-load.
 * Idempotent: does nothing if any templates already exist. Safe to call
 * from component mount.
 */
export async function seedDocumentTemplatesIfEmpty() {
  const { SEED_TEMPLATES, generateDocumentTemplateId, normalizeDocumentTemplate } = await import('./documentTemplateValidation.js');
  const existing = await getDocs(documentTemplatesCol());
  if (!existing.empty) return { seeded: false, count: 0 };
  const now = new Date().toISOString();
  let count = 0;
  for (const seed of SEED_TEMPLATES) {
    const id = generateDocumentTemplateId(seed.docType);
    const normalized = normalizeDocumentTemplate({ ...seed, isSystemDefault: true, isActive: true });
    await setDoc(documentTemplateDoc(id), {
      ...normalized,
      templateId: id,
      createdAt: now,
      updatedAt: now,
    }, { merge: false });
    count++;
  }
  return { seeded: true, count };
}

/**
 * Phase 14.2.B — auto-generate the next certificate number for a docType.
 * Format: `{prefix}-{YYYYMM}-{seq}` where seq is per-(docType,month) and
 * starts at 0001. Counters live in `clinic_settings/cert_counters`:
 *
 *   clinic_settings/cert_counters: {
 *     'MC:202604': 12,    // 12 medical-cert issued in 2026-04
 *     'MO:202604': 3,
 *     'TR:202605': 0,
 *     ...
 *   }
 *
 * Uses runTransaction so two simultaneous prints don't collide on the
 * same number (race-safe per Rule C2 / iron-clad invoice-race lesson).
 */
export async function getNextCertNumber(docType) {
  const { CERT_NUMBER_PREFIX } = await import('./documentTemplateValidation.js');
  const prefix = CERT_NUMBER_PREFIX[docType] || 'GEN';
  const now = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const counterKey = `${prefix}:${yyyymm}`;

  const ref = doc(db, ...basePath(), 'clinic_settings', 'cert_counters');
  const next = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists() ? snap.data() : {};
    const current = Number(data[counterKey]) || 0;
    const nextSeq = current + 1;
    tx.set(ref, { [counterKey]: nextSeq }, { merge: true });
    return nextSeq;
  });
  const seq = String(next).padStart(4, '0');
  return `${prefix}-${yyyymm}-${seq}`;
}

/**
 * Phase 14.2 — schema upgrade. Detects existing system-default templates
 * with an outdated schemaVersion and rewrites them with the latest seed
 * HTML + fields + toggles. User-edited templates (isSystemDefault=false)
 * are NEVER touched.
 *
 * Strategy:
 *  - Load all existing templates
 *  - For each docType in SEED_TEMPLATES: find the system-default with
 *    matching docType. If schemaVersion < current OR doesn't exist, rewrite.
 *  - User-customized templates (isSystemDefault=false) are preserved entirely.
 *  - Idempotent: running twice has no effect after the first.
 */
export async function upgradeSystemDocumentTemplates() {
  const {
    SEED_TEMPLATES,
    generateDocumentTemplateId,
    normalizeDocumentTemplate,
    SCHEMA_VERSION,
  } = await import('./documentTemplateValidation.js');
  const snap = await getDocs(documentTemplatesCol());
  const existing = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const systemByType = new Map();
  for (const t of existing) {
    if (t.isSystemDefault && t.docType) systemByType.set(t.docType, t);
  }

  const now = new Date().toISOString();
  let upgraded = 0;
  let added = 0;

  for (const seed of SEED_TEMPLATES) {
    const current = systemByType.get(seed.docType);
    const currentVersion = Number(current?.schemaVersion) || 1;
    if (current && currentVersion >= SCHEMA_VERSION) continue; // already up to date

    const normalized = normalizeDocumentTemplate({
      ...seed,
      isSystemDefault: true,
      isActive: current?.isActive !== false,
    });

    if (current) {
      // In-place upgrade: keep ID + createdAt, rewrite body + bump version.
      await setDoc(documentTemplateDoc(current.templateId || current.id), {
        ...normalized,
        templateId: current.templateId || current.id,
        createdAt: current.createdAt || now,
        updatedAt: now,
      }, { merge: false });
      upgraded++;
    } else {
      // New docType in seed list (shouldn't normally happen unless we add a
      // new type). Insert with a fresh ID.
      const id = generateDocumentTemplateId(seed.docType);
      await setDoc(documentTemplateDoc(id), {
        ...normalized,
        templateId: id,
        createdAt: now,
        updatedAt: now,
      }, { merge: false });
      added++;
    }
  }
  return { upgraded, added };
}

// ─── Vendors + Vendor Sales CRUD (Phase 14.3 / G6, 2026-04-25) ─────────────

const vendorsCol = () => collection(db, ...basePath(), 'be_vendors');
const vendorDoc = (id) => doc(db, ...basePath(), 'be_vendors', String(id));
const vendorSalesCol = () => collection(db, ...basePath(), 'be_vendor_sales');
const vendorSaleDoc = (id) => doc(db, ...basePath(), 'be_vendor_sales', String(id));

export async function listVendors({ activeOnly = false } = {}) {
  const snap = await getDocs(vendorsCol());
  let items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (activeOnly) items = items.filter(v => v.isActive !== false);
  items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return items;
}

export async function saveVendor(vendorId, data, opts = {}) {
  const id = String(vendorId || '');
  if (!id) throw new Error('vendorId required');
  const { normalizeVendor, validateVendor } = await import('./vendorValidation.js');
  const normalized = normalizeVendor(data);
  const fail = validateVendor(normalized, { strict: !!opts.strict });
  if (fail) throw new Error(fail[1]);
  const now = new Date().toISOString();
  await setDoc(vendorDoc(id), {
    ...normalized,
    vendorId: id,
    createdAt: data.createdAt || now,
    updatedAt: now,
  }, { merge: false });
}

export async function deleteVendor(vendorId) {
  const id = String(vendorId || '');
  if (!id) throw new Error('vendorId required');
  await deleteDoc(vendorDoc(id));
}

export async function listVendorSales({ vendorId, status, startDate, endDate } = {}) {
  const snap = await getDocs(vendorSalesCol());
  let items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (vendorId) items = items.filter(s => s.vendorId === vendorId);
  if (status) items = items.filter(s => s.status === status);
  if (startDate) items = items.filter(s => (s.saleDate || '') >= startDate);
  if (endDate) items = items.filter(s => (s.saleDate || '') <= endDate);
  items.sort((a, b) => (b.saleDate || '').localeCompare(a.saleDate || ''));
  return items;
}

export async function saveVendorSale(saleId, data, opts = {}) {
  const id = String(saleId || '');
  if (!id) throw new Error('saleId required');
  const { normalizeVendorSale, validateVendorSale } = await import('./vendorSaleValidation.js');
  const normalized = normalizeVendorSale(data);
  const fail = validateVendorSale(normalized, { strict: !!opts.strict });
  if (fail) throw new Error(fail[1]);
  const now = new Date().toISOString();
  await setDoc(vendorSaleDoc(id), {
    ...normalized,
    vendorSaleId: id,
    createdAt: data.createdAt || now,
    updatedAt: now,
  }, { merge: false });
}

export async function deleteVendorSale(saleId) {
  const id = String(saleId || '');
  if (!id) throw new Error('saleId required');
  await deleteDoc(vendorSaleDoc(id));
}

export async function transitionVendorSale(saleId, nextStatus, extra = {}) {
  const id = String(saleId || '');
  if (!id) throw new Error('saleId required');
  const { applyVendorSaleStatusTransition } = await import('./vendorSaleValidation.js');
  const ref = vendorSaleDoc(id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('vendor sale not found');
  const cur = snap.data();
  const resolved = applyVendorSaleStatusTransition(cur.status || 'draft', nextStatus);
  const now = new Date().toISOString();
  const updates = { status: resolved, updatedAt: now };
  if (resolved === 'confirmed' && !cur.confirmedAt) updates.confirmedAt = now;
  if (resolved === 'cancelled' && !cur.cancelledAt) updates.cancelledAt = now;
  if (extra.cancelReason != null) updates.cancelReason = String(extra.cancelReason);
  await updateDoc(ref, updates);
  return { success: true, status: resolved };
}

// ─── Quotations CRUD (Phase 13.1.2) ─────────────────────────────────────────

const quotationsCol = () => collection(db, ...basePath(), 'be_quotations');
const quotationDocRef = (id) => doc(db, ...basePath(), 'be_quotations', String(id));

export async function getQuotation(quotationId) {
  const id = String(quotationId || '');
  if (!id) return null;
  const snap = await getDoc(quotationDocRef(id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listQuotations() {
  const snap = await getDocs(quotationsCol());
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  // Newest first by quotationDate, then createdAt.
  items.sort((a, b) => {
    const da = (b.quotationDate || '').localeCompare(a.quotationDate || '');
    if (da !== 0) return da;
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });
  return items;
}

export async function saveQuotation(quotationId, data) {
  const id = String(quotationId || '');
  if (!id) throw new Error('quotationId required');
  const { normalizeQuotation, validateQuotationStrict } = await import('./quotationValidation.js');
  const normalized = normalizeQuotation(data);
  const fail = validateQuotationStrict(normalized);
  if (fail) throw new Error(fail[1]);
  const now = new Date().toISOString();
  await setDoc(quotationDocRef(id), {
    ...normalized,
    id,
    quotationId: id,
    createdAt: data.createdAt || now,
    updatedAt: now,
  }, { merge: false });
  return { success: true, quotationId: id };
}

export async function deleteQuotation(quotationId) {
  const id = String(quotationId || '');
  if (!id) throw new Error('quotationId required');
  // Rule: locked after convert. If status='converted' + convertedToSaleId exists, block delete.
  const existing = await getDoc(quotationDocRef(id));
  if (existing.exists()) {
    const cur = existing.data();
    if (cur.status === 'converted' && cur.convertedToSaleId) {
      throw new Error('ใบเสนอราคาที่แปลงเป็นใบขายแล้ว ลบไม่ได้');
    }
  }
  await deleteDoc(quotationDocRef(id));
  return { success: true };
}

// ─── DF Groups + DF Staff Rates CRUD (Phase 13.3.2) ────────────────────────

const dfGroupsCol = () => collection(db, ...basePath(), 'be_df_groups');
const dfGroupDocRef = (id) => doc(db, ...basePath(), 'be_df_groups', String(id));
const dfStaffRatesCol = () => collection(db, ...basePath(), 'be_df_staff_rates');
const dfStaffRatesDocRef = (staffId) => doc(db, ...basePath(), 'be_df_staff_rates', String(staffId));

export async function getDfGroup(groupId) {
  const id = String(groupId || '');
  if (!id) return null;
  const snap = await getDoc(dfGroupDocRef(id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listDfGroups() {
  const snap = await getDocs(dfGroupsCol());
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  items.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'th'));
  return items;
}

export async function saveDfGroup(groupId, data) {
  const id = String(groupId || '');
  if (!id) throw new Error('groupId required');
  const { normalizeDfGroup, validateDfGroupStrict } = await import('./dfGroupValidation.js');
  const normalized = normalizeDfGroup(data);
  const fail = validateDfGroupStrict(normalized);
  if (fail) throw new Error(fail[1]);
  const now = new Date().toISOString();
  await setDoc(dfGroupDocRef(id), {
    ...normalized,
    id,
    groupId: id,
    createdAt: data.createdAt || now,
    updatedAt: now,
  }, { merge: false });
  return { success: true, groupId: id };
}

export async function deleteDfGroup(groupId) {
  const id = String(groupId || '');
  if (!id) throw new Error('groupId required');
  await deleteDoc(dfGroupDocRef(id));
  return { success: true };
}

export async function getDfStaffRates(staffId) {
  const id = String(staffId || '');
  if (!id) return null;
  const snap = await getDoc(dfStaffRatesDocRef(id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listDfStaffRates() {
  const snap = await getDocs(dfStaffRatesCol());
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function saveDfStaffRates(staffId, data) {
  const id = String(staffId || '');
  if (!id) throw new Error('staffId required');
  const { normalizeDfStaffRates, validateDfStaffRatesStrict } = await import('./dfGroupValidation.js');
  const normalized = normalizeDfStaffRates({ ...data, staffId: id });
  const fail = validateDfStaffRatesStrict(normalized);
  if (fail) throw new Error(fail[1]);
  const now = new Date().toISOString();
  await setDoc(dfStaffRatesDocRef(id), {
    ...normalized,
    createdAt: data.createdAt || now,
    updatedAt: now,
  }, { merge: false });
  return { success: true, staffId: id };
}

export async function deleteDfStaffRates(staffId) {
  const id = String(staffId || '');
  if (!id) throw new Error('staffId required');
  await deleteDoc(dfStaffRatesDocRef(id));
  return { success: true };
}

// ─── Staff Schedules CRUD (Phase 13.2.2) ────────────────────────────────────

const staffSchedulesCol = () => collection(db, ...basePath(), 'be_staff_schedules');
const staffScheduleDocRef = (id) => doc(db, ...basePath(), 'be_staff_schedules', String(id));

export async function getStaffSchedule(scheduleId) {
  const id = String(scheduleId || '');
  if (!id) return null;
  const snap = await getDoc(staffScheduleDocRef(id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * List be_staff_schedules. Optional filter by staffId and/or date range
 * (inclusive ISO strings). No indexes required — client-side filter on
 * the full collection. Realistic volume: <1000 entries.
 */
export async function listStaffSchedules(filters = {}) {
  const { staffId, startDate, endDate } = filters || {};
  const snap = await getDocs(staffSchedulesCol());
  let items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (staffId) items = items.filter((e) => String(e.staffId) === String(staffId));
  if (startDate) items = items.filter((e) => (e.date || '') >= startDate);
  if (endDate) items = items.filter((e) => (e.date || '') <= endDate);
  items.sort((a, b) => {
    const d = (a.date || '').localeCompare(b.date || '');
    if (d !== 0) return d;
    return (a.startTime || '').localeCompare(b.startTime || '');
  });
  return items;
}

export async function saveStaffSchedule(scheduleId, data) {
  const id = String(scheduleId || '');
  if (!id) throw new Error('scheduleId required');
  const { normalizeStaffSchedule, validateStaffScheduleStrict } = await import('./staffScheduleValidation.js');
  const normalized = normalizeStaffSchedule(data);
  const fail = validateStaffScheduleStrict(normalized);
  if (fail) throw new Error(fail[1]);
  const now = new Date().toISOString();
  await setDoc(staffScheduleDocRef(id), {
    ...normalized,
    id,
    scheduleId: id,
    createdAt: data.createdAt || now,
    updatedAt: now,
  }, { merge: false });
  return { success: true, scheduleId: id };
}

export async function deleteStaffSchedule(scheduleId) {
  const id = String(scheduleId || '');
  if (!id) throw new Error('scheduleId required');
  await deleteDoc(staffScheduleDocRef(id));
  return { success: true };
}

/**
 * Phase 13.1.4 — Convert a quotation into a be_sales draft.
 * OUR feature (not in ProClinic). Copies customer + line items + seller
 * into a new draft sale, then marks the quotation as 'converted' with
 * `convertedToSaleId` + `convertedAt` set. Idempotent: a second call
 * returns the existing saleId instead of creating a duplicate.
 *
 * @param {string} quotationId
 * @returns {Promise<{ saleId: string, alreadyConverted: boolean }>}
 */
export async function convertQuotationToSale(quotationId) {
  const qid = String(quotationId || '');
  if (!qid) throw new Error('quotationId required');

  const qSnap = await getDoc(quotationDocRef(qid));
  if (!qSnap.exists()) throw new Error('ไม่พบใบเสนอราคา');
  const q = qSnap.data();

  // Idempotency — if already converted, return the linked saleId.
  if (q.convertedToSaleId) {
    return { saleId: q.convertedToSaleId, alreadyConverted: true };
  }

  // Status gate — only draft/sent/accepted convertible.
  const CONVERTIBLE_STATES = new Set(['draft', 'sent', 'accepted']);
  const curStatus = q.status || 'draft';
  if (!CONVERTIBLE_STATES.has(curStatus)) {
    throw new Error(`สถานะ "${curStatus}" ไม่สามารถแปลงเป็นใบขายได้`);
  }

  // Phase 14.x bug fix round 2 (2026-04-24): sale.items is a GROUPED object
  // ({promotions, courses, products, medications}) — that's the shape SaleTab
  // writes + SaleDetailModal + aggregators read. Phase 13.1.4's original
  // flat-array writer silently hid items from SaleTab's grouped reader.
  //
  // Round-1 fix (commit 6bda5d2) changed only the converter and crashed
  // SalePrintView's flat reader on print-after-convert — reverted to d56b5cf.
  // This round fixes converter + SalePrintView + dfPayoutAggregator together
  // so both readers survive both shapes.
  //
  // User-reported 2026-04-24:
  //   round 1 → "promotion หายไปจาก list ในใบขาย"
  //   round 2 → "แปลงเป็นใบขายล่าสุดแล้วเปิดใบขายไม่ได้เลย" (SalePrintView
  //             called .map on an object)
  const toItem = (src, kind, nameField, idField) => ({
    [idField]: src[idField] || '',
    name: src[nameField] || '',
    unitPrice: Number(src.price) || 0,
    qty: Number(src.qty) || 0,
    itemDiscount: Number(src.itemDiscount) || 0,
    itemDiscountType: src.itemDiscountType || '',
    isVatIncluded: !!src.isVatIncluded,
    itemType: kind,
  });

  const items = {
    promotions: (q.promotions || []).map((p) => ({
      ...toItem(p, 'promotion', 'promotionName', 'promotionId'),
    })),
    courses: (q.courses || []).map((c) => ({
      ...toItem(c, 'course', 'courseName', 'courseId'),
    })),
    products: [
      ...(q.products || []).map((p) => ({
        ...toItem(p, 'product', 'productName', 'productId'),
        isPremium: !!p.isPremium,
      })),
      // Takeaway meds ride in products[] with isTakeaway + medication subobject
      // (matches SaleTab's intent: in-clinic meds → items.medications[],
      // take-home meds → items.products[] flagged).
      ...(q.takeawayMeds || []).map((m) => ({
        ...toItem(m, 'product', 'productName', 'productId'),
        isPremium: !!m.isPremium,
        isTakeaway: true,
        medication: {
          genericName: m.genericName || '',
          indications: m.indications || '',
          dosageAmount: m.dosageAmount || '',
          dosageUnit: m.dosageUnit || '',
          timesPerDay: m.timesPerDay || '',
          administrationMethod: m.administrationMethod || '',
          administrationMethodHour: Number(m.administrationMethodHour) || 0,
          administrationTimes: Array.isArray(m.administrationTimes) ? [...m.administrationTimes] : [],
        },
      })),
    ],
    medications: [], // no separate in-clinic-consumed meds from a quotation
  };

  // Sellers — quotation has single sellerId; sale model uses 5-seller array.
  // Put the one seller at 100% / full-total so SA-4 invariants hold downstream.
  const netTotal = Number(q.netTotal) || 0;
  const sellers = [];
  if (q.sellerId) {
    sellers.push({
      sellerId: q.sellerId,
      sellerName: q.sellerName || '',
      percent: 100,
      total: netTotal,
    });
  }

  // Phase 14.x: promotions now ride in items.promotions[] (above) — no
  // need for the fallback "โปรโมชันจากใบเสนอราคา: ..." note that used to
  // carry them. saleNote keeps only q.note (the quotation's text note).

  const saleData = {
    customerId: q.customerId,
    customerHN: q.customerHN || '',
    customerName: q.customerName || '',
    saleDate: q.quotationDate,
    items,
    sellers,
    payments: [],
    totalPaidAmount: 0,
    billing: {
      subtotal: Number(q.subtotal) || 0,
      discount: Number(q.discount) || 0,
      discountType: q.discountType || '',
      netTotal,
    },
    status: 'draft',
    source: 'quotation',
    sourceDetail: qid,
    saleType: 'course',
    saleNote: q.note || '',
    linkedQuotationId: qid,
  };

  const { saleId } = await createBackendSale(saleData);

  // User bug 2026-04-24: "พอกดแปลงใบขายแล้ว และบันทึกชำระครบแล้ว ไม่ยอมไป
  // ตัดสต็อคเอง". convertQuotationToSale previously created the sale but
  // never called deductStockForSale — leaving stock untouched even after
  // markSalePaid. SaleTab's equivalent flow (line 499, 535) deducts on
  // create, so quotation-convert must do the same to stay consistent.
  // Non-fatal: log + continue if deduction fails so the sale stays
  // created (user can manually reconcile).
  try {
    const { flattenPromotionsForStockDeduction } = await import('./treatmentBuyHelpers.js');
    await deductStockForSale(saleId, flattenPromotionsForStockDeduction(items), {
      saleDate: saleData.saleDate,
      sellerId: sellers[0]?.sellerId || '',
      sellerName: sellers[0]?.sellerName || '',
      source: 'quotation',
    });
  } catch (err) {
    console.warn('[convertQuotationToSale] deductStockForSale failed:', err.message);
  }

  const now = new Date().toISOString();
  await updateDoc(quotationDocRef(qid), {
    status: 'converted',
    convertedToSaleId: saleId,
    convertedAt: now,
    updatedAt: now,
  });

  return { saleId, alreadyConverted: false };
}
