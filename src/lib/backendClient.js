// ─── Backend Data Access Layer ─────────────────────────────────────────────
// Firestore CRUD for backend-owned collections (be_* prefix).
// All data stored in: artifacts/{appId}/public/data/be_*
// Schema matches frontend data model exactly → easy migration from ProClinic.

import { doc, setDoc, getDoc, getDocs, addDoc, collection, query, where, orderBy, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db, appId } from '../firebase.js';

const BASE = `artifacts/${appId}/public/data`;

// ── Helpers ────────────────────────────────────────────────────────────────

function colRef(colName) {
  return collection(db, BASE.split('/')[0], BASE.split('/')[1], BASE.split('/')[2], BASE.split('/')[3], colName);
}

function docRef(colName, docId) {
  return doc(db, BASE.split('/')[0], BASE.split('/')[1], BASE.split('/')[2], BASE.split('/')[3], colName, docId);
}

// ── Master Data Sync ───────────────────────────────────────────────────────

/**
 * Batch write master data items to Firestore.
 * Splits into batches of 400 (Firestore limit = 500 per batch).
 * @param {'products'|'courses'|'doctors'|'staff'} type
 * @param {Array} items - items from broker.syncX() response
 */
export async function saveMasterData(type, items) {
  const colName = `be_master_${type}`;
  const BATCH_SIZE = 400;
  const now = new Date().toISOString();

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    const chunk = items.slice(i, i + BATCH_SIZE);
    for (const item of chunk) {
      const id = String(item.id || item.code || `item-${i}`);
      const ref = docRef(colName, id);
      batch.set(ref, { ...item, syncedAt: now });
    }
    await batch.commit();
  }
}

/**
 * Update sync metadata for a master data type.
 */
export async function updateSyncStatus(type, count) {
  const ref = docRef('be_sync_status', 'master');
  const now = new Date().toISOString();
  const snap = await getDoc(ref);
  const existing = snap.exists() ? snap.data() : {};
  await setDoc(ref, {
    ...existing,
    [type]: { lastSyncedAt: now, count },
    updatedAt: now,
  });
}

/**
 * Read sync metadata for all master data types.
 * @returns {{ products, courses, doctors, staff }} each with { lastSyncedAt, count }
 */
export async function getSyncStatus() {
  const ref = docRef('be_sync_status', 'master');
  const snap = await getDoc(ref);
  if (!snap.exists()) return { products: null, courses: null, doctors: null, staff: null };
  return snap.data();
}

// ── Customer Data ──────────────────────────────────────────────────────────

/**
 * Save a customer cloned from ProClinic to backend database.
 * Patient object uses the same shape as reverseMapPatient() output.
 */
export async function saveCustomer(proClinicId, proClinicHN, patient, courses = [], appointments = []) {
  const ref = docRef('be_customers', String(proClinicId));
  const now = new Date().toISOString();
  await setDoc(ref, {
    proClinicId: String(proClinicId),
    proClinicHN: proClinicHN || '',
    patient: patient || {},
    courses: courses || [],
    appointments: appointments || [],
    importedAt: now,
    lastUpdatedAt: now,
  }, { merge: true });
}

/**
 * Read a customer from backend database.
 */
export async function getCustomer(proClinicId) {
  const ref = docRef('be_customers', String(proClinicId));
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

/**
 * Search customers in backend database by HN.
 * For Phase 1, this does a simple doc lookup by proClinicId or scans all docs.
 * @returns {Array} matching customer docs
 */
export async function searchLocalCustomers(queryText) {
  if (!queryText) return [];
  const q = queryText.trim();

  // Try direct lookup by proClinicId
  const directSnap = await getDoc(docRef('be_customers', q));
  if (directSnap.exists()) return [directSnap.data()];

  // Scan all customers and filter client-side (sufficient for clinic-scale data)
  const col = colRef('be_customers');
  const allSnap = await getDocs(col);
  const results = [];
  allSnap.forEach(docSnap => {
    const data = docSnap.data();
    const p = data.patient || {};
    const hn = (data.proClinicHN || '').toLowerCase();
    const name = `${p.firstName || ''} ${p.lastName || ''}`.toLowerCase();
    const phone = (p.phone || '').replace(/\D/g, '');
    const searchLower = q.toLowerCase();
    const searchDigits = q.replace(/\D/g, '');

    if (hn.includes(searchLower) || name.includes(searchLower) || (searchDigits && phone.includes(searchDigits))) {
      results.push(data);
    }
  });
  return results;
}

// ── Treatment Records ──────────────────────────────────────────────────────

/**
 * Save a treatment record to backend database.
 * Uses auto-ID. Returns the generated document ID.
 */
export async function saveBackendTreatment(treatmentData) {
  const col = colRef('be_treatments');
  const now = new Date().toISOString();
  const docRefResult = await addDoc(col, {
    ...treatmentData,
    syncedToProClinic: false,
    savedAt: serverTimestamp(),
    savedAtISO: now,
  });
  return docRefResult.id;
}

/**
 * List treatment records for a customer from backend database.
 */
export async function listBackendTreatments(customerId) {
  const col = colRef('be_treatments');
  const q = query(col, where('customerId', '==', String(customerId)), orderBy('savedAt', 'desc'));
  const snap = await getDocs(q);
  const results = [];
  snap.forEach(docSnap => {
    results.push({ id: docSnap.id, ...docSnap.data() });
  });
  return results;
}

/**
 * Get a single treatment record.
 */
export async function getBackendTreatment(docId) {
  const ref = docRef('be_treatments', docId);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// ── Master Data Read ───────────────────────────────────────────────────────

/**
 * Get all items from a master data collection.
 */
export async function getMasterData(type) {
  const col = colRef(`be_master_${type}`);
  const snap = await getDocs(col);
  const items = [];
  snap.forEach(docSnap => items.push({ id: docSnap.id, ...docSnap.data() }));
  return items;
}
