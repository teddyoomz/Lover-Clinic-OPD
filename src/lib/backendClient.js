// ─── Backend Client — Firestore CRUD for be_* collections ───────────────────
// One-way data store: cloned from ProClinic, never writes back.
// Schema matches frontend patientData format for future migration.

import { db, appId } from '../firebase.js';
import { doc, setDoc, getDoc, getDocs, collection, query, where, updateDoc, deleteDoc, orderBy, writeBatch, runTransaction } from 'firebase/firestore';

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

/** Save/overwrite customer to be_customers */
export async function saveCustomer(proClinicId, data) {
  await setDoc(customerDoc(proClinicId), data, { merge: false });
}

/** Update specific fields on be_customers doc */
export async function updateCustomer(proClinicId, fields) {
  await updateDoc(customerDoc(proClinicId), fields);
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

/** Delete a backend treatment */
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
  const { parseQtyString } = await import('./courseUtils.js');
  const preferNewest = !!opts?.preferNewest;

  const matchesDed = (c, d) => {
    const nameMatch = d.courseName ? c.name === d.courseName : true;
    const productMatch = d.productName ? (c.product || c.name) === d.productName : true;
    return nameMatch && productMatch;
  };

  for (const d of deductions) {
    let remaining = d.deductQty || 1;

    // Step 1: exact-index targeting
    if (typeof d.courseIndex === 'number' && d.courseIndex >= 0 && d.courseIndex < courses.length) {
      const c = courses[d.courseIndex];
      if (matchesDed(c, d)) {
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
      for (const i of order) {
        if (remaining <= 0) break;
        if (i === d.courseIndex) continue; // already handled in Step 1
        const c = courses[i];
        if (!matchesDed(c, d)) continue;
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
  const expiry = masterCourse.validityDays
    ? new Date(Date.now() + masterCourse.validityDays * 86400000).toISOString().split('T')[0]
    : '';
  // Track where this course came from (parent course/promotion name)
  const parentName = masterCourse.parentName || '';
  const source = masterCourse.source || ''; // 'sale', 'treatment', 'exchange', 'share'

  const linkedSaleId = masterCourse.linkedSaleId || null;
  const linkedTreatmentId = masterCourse.linkedTreatmentId || null;

  for (const p of products) {
    courses.push({
      name: masterCourse.name,
      product: p.name,
      qty: buildQtyString(Number(p.qty) || 1, p.unit || 'ครั้ง'),
      status: 'กำลังใช้งาน',
      expiry,
      value: masterCourse.price ? `${masterCourse.price} บาท` : '',
      parentName,
      source,
      linkedSaleId,
      linkedTreatmentId,
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
      assignedAt: new Date().toISOString(),
    });
  }

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

/** Get all appointments for a month (YYYY-MM) */
export async function getAppointmentsByMonth(yearMonth) {
  const snap = await getDocs(appointmentsCol());
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  // Filter by month prefix (date field is "YYYY-MM-DD")
  const filtered = all.filter(a => a.date && a.date.startsWith(yearMonth));
  // Group by date
  const grouped = {};
  filtered.forEach(a => {
    if (!grouped[a.date]) grouped[a.date] = [];
    grouped[a.date].push(a);
  });
  // Sort each day by startTime
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

/** Get all appointments for a specific date (YYYY-MM-DD) */
export async function getAppointmentsByDate(dateStr) {
  const q = query(appointmentsCol(), where('date', '==', dateStr));
  const snap = await getDocs(q);
  const appts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  appts.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  return appts;
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
    ...data,
    status: data.status || 'active',
    createdAt: now,
    updatedAt: now,
  });
  return { saleId: finalId, success: true };
}

/** Update an existing sale */
export async function updateBackendSale(saleId, data) {
  await updateDoc(saleDoc(saleId), { ...data, updatedAt: new Date().toISOString() });
  return { success: true };
}

/** Delete a sale */
export async function deleteBackendSale(saleId) {
  await deleteDoc(saleDoc(saleId));
  return { success: true };
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
  return { success: true };
}

/** Add a payment channel to an existing sale + auto-update payment status */
export async function updateSalePayment(saleId, newChannel) {
  const snap = await getDoc(saleDoc(saleId));
  if (!snap.exists()) return { success: false, error: 'Sale not found' };
  const sale = snap.data();
  const existingChannels = sale.payment?.channels || [];
  const updatedChannels = [...existingChannels, { ...newChannel, enabled: true }];
  const totalPaid = updatedChannels.reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0);
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

/** Delete a manual master data item. */
export async function deleteMasterItem(type, id) {
  const ref = doc(db, ...basePath(), 'master_data', type, 'items', String(id));
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

/** Read all items from master_data/{type}/items */
export async function getAllMasterDataItems(type) {
  const snap = await getDocs(masterDataItemsCol(type));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
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
export async function createDeposit(data) {
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
  } catch {}
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

  const result = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.data() || {};
    const before = Number(cur.balance) || 0;
    const after = before + amt;
    tx.update(ref, {
      balance: after,
      totalTopUp: (Number(cur.totalTopUp) || 0) + amt,
      lastTransactionAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return { before, after };
  });

  const newTxId = txId();
  await setDoc(walletTxDoc(newTxId), {
    txId: newTxId,
    customerId: String(customerId),
    walletTypeId: String(walletTypeId),
    walletTypeName,
    type: 'topup',
    amount: amt,
    balanceBefore: result.before,
    balanceAfter: result.after,
    referenceType, referenceId: String(referenceId || ''),
    paymentChannel, refNo,
    note, staffId, staffName,
    createdAt: new Date().toISOString(),
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

  const result = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('ไม่พบกระเป๋าเงินของลูกค้า');
    const cur = snap.data();
    const before = Number(cur.balance) || 0;
    if (before < amt) throw new Error(`ยอดกระเป๋าไม่พอ (มี ${before} ต้องการ ${amt})`);
    const after = before - amt;
    tx.update(ref, {
      balance: after,
      totalUsed: (Number(cur.totalUsed) || 0) + amt,
      lastTransactionAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return { before, after };
  });

  const newTxId = txId();
  await setDoc(walletTxDoc(newTxId), {
    txId: newTxId,
    customerId: String(customerId),
    walletTypeId: String(walletTypeId),
    walletTypeName,
    type: 'deduct',
    amount: amt,
    balanceBefore: result.before,
    balanceAfter: result.after,
    referenceType, referenceId: String(referenceId || ''),
    paymentChannel: '', refNo: '',
    note, staffId, staffName,
    createdAt: new Date().toISOString(),
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

  const result = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.data() || {};
    const before = Number(cur.balance) || 0;
    const after = before + amt;
    tx.update(ref, {
      balance: after,
      // totalUsed is NOT decremented so lifetime usage metrics stay accurate
      lastTransactionAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return { before, after };
  });

  const newTxId = txId();
  await setDoc(walletTxDoc(newTxId), {
    txId: newTxId,
    customerId: String(customerId),
    walletTypeId: String(walletTypeId),
    walletTypeName,
    type: 'refund',
    amount: amt,
    balanceBefore: result.before,
    balanceAfter: result.after,
    referenceType, referenceId: String(referenceId || ''),
    paymentChannel: '', refNo: '',
    note, staffId, staffName,
    createdAt: new Date().toISOString(),
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

  const result = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.data() || {};
    const before = Number(cur.balance) || 0;
    const after = isIncrease ? before + amt : Math.max(0, before - amt);
    const delta = after - before;
    tx.update(ref, {
      balance: after,
      ...(delta > 0 ? { totalTopUp: (Number(cur.totalTopUp) || 0) + delta } : {}),
      ...(delta < 0 ? { totalUsed: (Number(cur.totalUsed) || 0) + Math.abs(delta) } : {}),
      lastTransactionAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return { before, after, delta };
  });

  const newTxId = txId();
  await setDoc(walletTxDoc(newTxId), {
    txId: newTxId,
    customerId: String(customerId),
    walletTypeId: String(walletTypeId),
    walletTypeName,
    type: 'adjust',
    amount: Math.abs(result.delta),
    balanceBefore: result.before,
    balanceAfter: result.after,
    referenceType: 'manual', referenceId: '',
    paymentChannel: '', refNo: '',
    note, staffId, staffName,
    createdAt: new Date().toISOString(),
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
  } catch {}

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
  } catch {}
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
  } catch {}
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
        } catch {}
        try {
          await updateDoc(customerDoc(customerId), {
            'finance.membershipId': null,
            'finance.membershipType': null,
            'finance.membershipExpiry': null,
            'finance.membershipDiscountPercent': 0,
          });
        } catch {}
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
  } catch {}
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
  } catch {}
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
    } catch {}
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
function _genOrderId() { return `ORD-${Date.now()}`; }
function _genMovementId() { return `MVT-${Date.now()}-${_rand4()}`; }
function _genAdjustmentId() { return `ADJ-${Date.now()}-${_rand4()}`; }

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
    mvts = mvts.filter(m => !m.reversedByMovementId);
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
  const user = opts.user || { userId: null, userName: null };

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
  const user = opts.user || { userId: null, userName: null };
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
  const user = opts.user || { userId: null, userName: null };
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
