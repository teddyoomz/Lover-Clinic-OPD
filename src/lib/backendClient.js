// ─── Backend Client — Firestore CRUD for be_* collections ───────────────────
// One-way data store: cloned from ProClinic, never writes back.
// Schema matches frontend patientData format for future migration.

import { db, appId } from '../firebase.js';
import { doc, setDoc, getDoc, getDocs, collection, query, where, updateDoc, deleteDoc, orderBy, writeBatch } from 'firebase/firestore';

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
 * @param {string} customerId - proClinicId
 * @param {Array<{courseIndex: number, deductQty: number, courseName?: string}>} deductions
 */
export async function deductCourseItems(customerId, deductions) {
  if (!deductions?.length) return [];
  const snap = await getDoc(customerDoc(customerId));
  if (!snap.exists()) throw new Error('Customer not found');
  const courses = [...(snap.data().courses || [])];

  for (const d of deductions) {
    // Find by index first, verify by name for safety
    let idx = d.courseIndex;
    if (idx >= 0 && idx < courses.length) {
      if (d.courseName && courses[idx].name !== d.courseName) {
        // Index mismatch — search by name
        idx = courses.findIndex(c => c.name === d.courseName);
      }
    } else if (d.courseName) {
      idx = courses.findIndex(c => c.name === d.courseName);
    }
    if (idx < 0 || idx >= courses.length) continue;
    courses[idx] = { ...courses[idx], qty: deductQty(courses[idx].qty, d.deductQty || 1) };
  }

  await updateCustomer(customerId, { courses });
  return courses;
}

/**
 * Reverse course deduction (on edit/delete treatment).
 * @param {string} customerId
 * @param {Array<{courseIndex: number, deductQty: number, courseName?: string}>} deductions
 */
export async function reverseCourseDeduction(customerId, deductions) {
  if (!deductions?.length) return [];
  const snap = await getDoc(customerDoc(customerId));
  if (!snap.exists()) throw new Error('Customer not found');
  const courses = [...(snap.data().courses || [])];

  for (const d of deductions) {
    let idx = d.courseIndex;
    if (idx >= 0 && idx < courses.length) {
      if (d.courseName && courses[idx].name !== d.courseName) {
        idx = courses.findIndex(c => c.name === d.courseName);
      }
    } else if (d.courseName) {
      idx = courses.findIndex(c => c.name === d.courseName);
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

  for (const p of products) {
    courses.push({
      name: masterCourse.name,
      product: p.name,
      qty: buildQtyString(Number(p.qty) || 1, p.unit || 'ครั้ง'),
      status: 'กำลังใช้งาน',
      expiry,
      value: masterCourse.price ? `${masterCourse.price} บาท` : '',
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

/** Generate invoice number: INV-YYYYMMDD-XXXX */
export async function generateInvoiceNumber() {
  const today = new Date();
  const dateStr = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;
  let seq = 1;
  try {
    const snap = await getDoc(saleCounterDoc());
    if (snap.exists()) {
      const data = snap.data();
      if (data.date === dateStr) seq = (data.seq || 0) + 1;
    }
  } catch {}
  await setDoc(saleCounterDoc(), { date: dateStr, seq, updatedAt: new Date().toISOString() });
  return `INV-${dateStr}-${String(seq).padStart(4, '0')}`;
}

/** Create a new sale */
export async function createBackendSale(data) {
  const saleId = await generateInvoiceNumber();
  const now = new Date().toISOString();
  await setDoc(saleDoc(saleId), {
    saleId,
    ...data,
    status: data.status || 'active',
    createdAt: now,
    updatedAt: now,
  });
  return { saleId, success: true };
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

/** Cancel a sale with reason + refund tracking */
export async function cancelBackendSale(saleId, reason, refundMethod, refundAmount) {
  await updateDoc(saleDoc(saleId), {
    status: 'cancelled',
    cancelled: { at: new Date().toISOString(), reason: reason || '', refundMethod: refundMethod || '', refundAmount: refundAmount || 0 },
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
