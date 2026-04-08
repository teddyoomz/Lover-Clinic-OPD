// ─── Backend Client — Firestore CRUD for be_* collections ───────────────────
// One-way data store: cloned from ProClinic, never writes back.
// Schema matches frontend patientData format for future migration.

import { db, appId } from '../firebase.js';
import { doc, setDoc, getDoc, getDocs, collection, query, where, updateDoc, orderBy, writeBatch } from 'firebase/firestore';

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
