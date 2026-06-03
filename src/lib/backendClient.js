// ─── Backend Client — Firestore CRUD for be_* collections ───────────────────
// One-way data store: cloned from ProClinic, never writes back.
// Schema matches frontend patientData format for future migration.

import { db, auth, appId } from '../firebase.js';
import { doc, setDoc, getDoc, getDocs, collection, query, where, limit, updateDoc, deleteDoc, orderBy, writeBatch, runTransaction, onSnapshot, serverTimestamp, documentId } from 'firebase/firestore';
// (2026-05-26) Feature 3 Unsend — Storage folder sweep for staff-chat message delete.
import { getStorage, ref as storageRef, listAll, deleteObject } from 'firebase/storage';
import { storagePrefixForMessage } from './staffChatRetentionCore.js';
// Phase BS (2026-05-06): pure JS module — V36 audit G.51 forbids
// importing BranchContext.jsx into the data layer (React leak risk).
import { resolveSelectedBranchId } from './branchSelection.js';
import { buildPresenceUpsert, buildSessionCreate, isPresenceReady, toMillis } from './chartEditSessionCore.js';
// V144 (2026-06-02) — pure lot-cleanup plan (no firebase dep) reused for the
// real-time redundant-0-lot auto-clear. Same plan the 03:45 cron runs.
import { planLotCleanup } from './stockLotCleanupCore.js';
import { resolveCustomerDisplayName, resolveCustomerHN, resolveCustomerPhone } from './customerDisplayName.js';
import { roundTHB } from './financeUtils.js'; // V156 — defensive money rounding at the write boundary (closes M12 caveat)
import { decideApptStatusServiceSync } from './appointmentDisplay.js';
// AP1/AP1-bis slot-key builders extracted (2026-06-03, appointment-loop R1) so
// appointmentDepositBatch.js can reserve the SAME atomic double-booking slots
// without importing this module. Re-exported below for backward-compat.
import { SLOT_INTERVAL_MIN, buildAppointmentSlotKey, buildAppointmentSlotKeys, buildAppointmentRoomSlotKeys, buildAppointmentGuardKeys } from './appointmentSlotKeys.js';
// TZ1 (2026-05-18 audit-fix) — Thai timezone helpers.
// Raw `new Date().toISOString().slice(0,10)` drifts to UTC = previous-day
// in Bangkok 00:00-07:00 window (Vercel prod 2026-04-19 lesson). Same
// applies to `.split('T')[0]` for future-date arithmetic (TZ1 family
// expansion at iter-2 — course/membership validity end calc).
import { thaiTodayISO, thaiDateNDaysFromNow } from '../utils.js';

/**
 * Phase BS V2 (2026-05-06) — branchId stamp helper for master-data writes.
 * If `data.branchId` is a non-empty string, preserves it (immutable on edit).
 * Otherwise returns the current selected branch from BranchContext via
 * resolveSelectedBranchId(). Falls back to FALLBACK_ID 'main' in pre-V20
 * single-branch deployments where the script context has no localStorage.
 */
function _resolveBranchIdForWrite(data) {
  if (data && typeof data.branchId === 'string' && data.branchId.trim()) {
    return data.branchId;
  }
  return resolveSelectedBranchId() || null;
}

/**
 * Phase BSA — branch-scoped read helper for marketing-style collections that
 * support an `allBranches: true` doc-level field (visible from every branch
 * even when caller filters by a specific branchId). Firestore can't OR
 * across fields → 2 queries + Set-dedup.
 *
 * Used by listPromotions / listCoupons / listVouchers. Sort fixed to
 * `updatedAt` desc with `id` tiebreaker for determinism (V14 lock — output
 * order matters when consumer renders without re-sort).
 *
 * Legacy callers (no opts) skip the filter entirely and return the full
 * collection — preserves pre-Phase-BSA shape.
 *
 * NOTE: Pre-Phase-BSA docs that have neither `branchId` nor `allBranches`
 * field will be EXCLUDED from filtered reads (Firestore where('field','==',v)
 * skips docs missing the field). Backfill via writer-stamp on next save OR
 * a one-shot migration before consumers start passing {branchId}. This is
 * dormant until a consumer wires {branchId} — no runtime impact today.
 */
async function _listWithBranchOrMerge(colRef, { branchId, allBranches = false } = {}) {
  const useFilter = branchId && !allBranches;
  if (!useFilter) {
    const snap = await getDocs(colRef);
    const items = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    items.sort((a, b) => {
      const cmp = (b.updatedAt || '').localeCompare(a.updatedAt || '');
      return cmp !== 0 ? cmp : (a.id || '').localeCompare(b.id || '');
    });
    return items;
  }
  const [byBranch, byAllBranches] = await Promise.all([
    getDocs(query(colRef, where('branchId', '==', String(branchId)))),
    getDocs(query(colRef, where('allBranches', '==', true))),
  ]);
  const seen = new Set();
  const items = [];
  for (const snap of [byBranch, byAllBranches]) {
    for (const d of snap.docs) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      items.push({ ...d.data(), id: d.id });
    }
  }
  items.sort((a, b) => {
    const cmp = (b.updatedAt || '').localeCompare(a.updatedAt || '');
    return cmp !== 0 ? cmp : (a.id || '').localeCompare(b.id || '');
  });
  return items;
}

/**
 * Phase BSA Task 2 — branch-scoped read helper for collections WITHOUT the
 * `allBranches: true` doc-level field. Single where('branchId','==',X) query
 * when the filter is active; full-collection read otherwise. Returns raw docs
 * with NO sort — callers apply their own additional filters (status, date
 * range, saleId, vendorId) and sort, because each financial lister has a
 * different secondary-filter signature.
 *
 * Used by listOnlineSales / listSaleInsuranceClaims / listVendorSales
 * (Phase BSA Task 2). For collections WITH the allBranches doc field
 * (promotions / coupons / vouchers), use `_listWithBranchOrMerge` instead
 * (Task 1).
 *
 * Legacy callers (no opts) skip the filter entirely and return the full
 * collection — preserves pre-Phase-BSA shape.
 *
 * NOTE: Pre-Phase-BSA docs that lack the `branchId` field will be EXCLUDED
 * from filtered reads (Firestore where('field','==',v) skips docs missing
 * the field). Unlike _listWithBranchOrMerge there is NO `allBranches` doc-
 * field fallback — these collections are pure branch-scoped. Backfill
 * options:
 *   1. Writer-stamp on next save (covers gradual migration — every
 *      saveOnlineSale / saveSaleInsuranceClaim / saveVendorSale already
 *      writes branchId via _resolveBranchIdForWrite)
 *   2. One-shot admin migrator (covers all legacy docs at once)
 *   3. Caller passes {allBranches:true} when wanting to see legacy docs
 *      (forces full-collection read, no filter)
 * This is dormant until a consumer wires {branchId} — no runtime impact today.
 */
async function _listWithBranch(colRef, { branchId, allBranches = false } = {}) {
  const useFilter = branchId && !allBranches;
  const ref = useFilter
    ? query(colRef, where('branchId', '==', String(branchId)))
    : colRef;
  const snap = await getDocs(ref);
  return snap.docs.map(d => ({ ...d.data(), id: d.id }));
}

// ─── Base path ──────────────────────────────────────────────────────────────
const basePath = () => ['artifacts', appId, 'public', 'data'];

const customersCol = () => collection(db, ...basePath(), 'be_customers');
// V35.2-sexies (2026-04-28) — hard-guard against null/undefined/empty/string-"null"
// customerId. Pre-fix: `String(null)` = "null" → silently routed writes to
// `be_customers/null` doc. User reported "หน้าสร้างการรักษาใหม่ ขึ้นว่า
// No document to update: ... be_customers/null". Now throws loudly so
// callers get a clear stack instead of mystery-doc data corruption.
const customerDoc = (id) => {
  const sid = String(id ?? '').trim();
  if (!sid || sid === 'null' || sid === 'undefined') {
    throw new Error(
      `customerDoc requires a valid customerId, got: ${JSON.stringify(id)}. ` +
      `Caller likely lost the id during a navigation transition or read it ` +
      `from a stale closure. Pass the resolved customerId explicitly.`
    );
  }
  return doc(db, ...basePath(), 'be_customers', sid);
};
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

// ─── Customer patient-link (2026-05-25) ──────────────────────────────────────
// Token lives on the be_customers doc. Generated/revoked by clinic-staff (client
// SDK — be_customers write is isClinicStaff). The ANON patient view reads via the
// /api/patient-view endpoint (admin SDK), NEVER direct Firestore (be_* are
// clinic-staff-only). crypto.getRandomValues = Rule C2 (no Math.random for tokens).

/** Generate a crypto patient-link token + enable it. Returns the token. */
export async function generateCustomerPatientLink(customerId) {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  await updateDoc(customerDoc(customerId), { patientLinkToken: token, patientLinkEnabled: true });
  return token;
}

/** Toggle the patient link on/off without discarding the token. */
export async function setCustomerPatientLinkEnabled(customerId, enabled) {
  await updateDoc(customerDoc(customerId), { patientLinkEnabled: !!enabled });
}

/** Revoke — clear token + disable (link stops resolving via the endpoint). */
export async function revokeCustomerPatientLink(customerId) {
  await updateDoc(customerDoc(customerId), { patientLinkToken: null, patientLinkEnabled: false });
}

/** Get all customers from be_customers (sorted by clonedAt desc) */
export async function getAllCustomers() {
  const snap = await getDocs(customersCol());
  const customers = snap.docs.map(d => ({ ...d.data(), id: d.id }));
  // Sort by clonedAt descending (newest first)
  customers.sort((a, b) => {
    const tA = a.clonedAt || '';
    const tB = b.clonedAt || '';
    return tB.localeCompare(tA);
  });
  return customers;
}

/**
 * Phase 20.0 Task 5a (2026-05-06) — search be_customers by query string.
 * Replaces broker.searchCustomers (which scraped ProClinic). Matches against
 * HN / phone / nationalId / firstname / lastname (case-insensitive substring).
 *
 * Returns shape compatible with AdminDashboard's apptSearchResults consumer:
 *   [{ id, name, hn, phone }]
 *
 * Universal — not branch-scoped (admin may need to find customers across
 * branches; customer entities are universal per Rule L Layer 2 contract).
 */
export async function searchBackendCustomers(queryStr) {
  const q = String(queryStr || '').trim().toLowerCase();
  if (!q) return [];
  const all = await getAllCustomers();
  return all
    .filter(c => {
      const fn = String(c.firstname || c.firstName || c.patientData?.firstName || '').toLowerCase();
      const ln = String(c.lastname || c.lastName || c.patientData?.lastName || '').toLowerCase();
      const hn = String(c.hn_no || c.hn || c.patientData?.hn || '').toLowerCase();
      const phone = String(c.phone || c.patientData?.phone || '').toLowerCase();
      const natId = String(c.nationalId || c.patientData?.nationalId || '').toLowerCase();
      return (
        fn.includes(q) || ln.includes(q) || hn.includes(q) ||
        phone.includes(q) || natId.includes(q)
      );
    })
    .slice(0, 50) // cap at 50 results
    .map(c => {
      const fn = c.firstname || c.firstName || c.patientData?.firstName || '';
      const ln = c.lastname || c.lastName || c.patientData?.lastName || '';
      const composed = [fn, ln].filter(Boolean).join(' ').trim();
      return {
        id: c.id,
        name: composed || c.patientData?.fullName || c.id,
        hn: c.hn_no || c.hn || c.patientData?.hn || '',
        phone: c.phone || c.patientData?.phone || '',
      };
    });
}

/**
 * Save/overwrite customer to be_customers.
 *
 * Every customer doc carries a `consent` block. Defaults both flags to
 * `false` — marketing flows MUST set `marketing: true` via explicit UI
 * opt-in before sending promotional messages. `healthData: true` is
 * required before processing sensitive data (vitals, diagnosis). Existing
 * customers imported from ProClinic get the defaults; the admin re-confirms
 * via a one-time consent prompt when needed.
 */
export async function saveCustomer(proClinicId, data, opts = {}) {
  const safe = data && typeof data === 'object' ? data : {};
  const withConsent = {
    ...safe,
    // Consent block last so it can't be stomped by `...safe` above.
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
 * V33-customer-create cleanup helper — delete ONLY the be_customers doc,
 * no cascade. Use when audit-immutable collections (be_wallet_transactions,
 * be_point_transactions, etc.) block the full deleteCustomerCascade due to
 * their `delete: if false` rules. Linked records become orphaned but
 * acceptable for test-data cleanup.
 *
 * Audit trail: caller must pass `opts.confirm = true` to acknowledge that
 * orphaned linked records are intentional.
 */
export async function deleteCustomerDocOnly(proClinicId, opts = {}) {
  if (!opts.confirm) {
    throw new Error('deleteCustomerDocOnly requires opts.confirm=true (orphans linked records)');
  }
  await deleteDoc(customerDoc(proClinicId));
}

// ─── V33-customer-create — patientData camelCase mapper ─────────────────────
//
// Why: emptyCustomerForm() uses LOWERCASE ProClinic-shape keys (firstname,
// lastname, telephone_number, sub_district, postal_code, citizen_id) but
// downstream readers (CustomerListTab, CustomerCard, AppointmentFormModal,
// SaleTab, TreatmentTimelineModal, EditCustomerIdsModal, etc.) all read
// CAMELCASE keys from patientData (firstName, lastName, phone, subDistrict,
// postalCode, nationalId).
//
// The cloneOrchestrator path goes through `reverseMapPatient` (api/proclinic
// /_lib/fields.js) which transforms ProClinic raw → camelCase. Manually-
// created customers must produce the SAME shape so they're indistinguishable
// from cloned ones to every reader. This mapper mirrors the field-name
// translation reverseMapPatient does.
//
// Stored shape: { ...flatLowercase, patientData: {camelCaseNested} } —
// readers access patientData; legacy code that scans root flat fields still
// works.
function buildPatientDataFromForm(form) {
  if (!form || typeof form !== 'object') return {};
  const pd = {};

  // Direct same-name passthrough
  if (form.prefix) pd.prefix = form.prefix;
  if (form.gender) pd.gender = form.gender;
  if (form.address) pd.address = form.address;
  if (form.province) pd.province = form.province;
  if (form.district) pd.district = form.district;
  if (form.email) pd.email = form.email;

  // Renamed (lowercase → camelCase)
  if (form.firstname) pd.firstName = form.firstname;
  if (form.lastname) pd.lastName = form.lastname;
  if (form.telephone_number) pd.phone = form.telephone_number;
  if (form.sub_district) pd.subDistrict = form.sub_district;
  if (form.postal_code) pd.postalCode = form.postal_code;

  // Identity — readers use nationalId/passport (V32-tris-quater contract)
  if (form.citizen_id) pd.nationalId = form.citizen_id;
  if (form.passport_id) pd.passport = form.passport_id;
  if (form.country) pd.nationalityCountry = form.country;

  // Demographics — birthdate stored as both ISO + dobYear/Month/Day for legacy readers
  if (form.birthdate) {
    pd.birthdate = form.birthdate;
    const parts = String(form.birthdate).split('-');
    if (parts.length === 3) {
      const yr = parseInt(parts[0], 10);
      const mo = parseInt(parts[1], 10);
      const dy = parseInt(parts[2], 10);
      if (!Number.isNaN(yr) && !Number.isNaN(mo) && !Number.isNaN(dy)) {
        pd.dobYear = String(yr + 543);   // CE → BE for legacy frontend
        pd.dobMonth = String(mo);
        pd.dobDay = String(dy);
        const today = new Date();
        let age = today.getFullYear() - yr;
        if (today.getMonth() + 1 < mo || (today.getMonth() + 1 === mo && today.getDate() < dy)) age--;
        pd.age = String(age);
      }
    }
  }
  if (form.blood_type) pd.bloodType = form.blood_type;
  if (form.height != null && form.height !== '') pd.height = form.height;
  if (form.weight != null && form.weight !== '') pd.weight = form.weight;
  if (form.nickname) pd.nickname = form.nickname;
  if (form.occupation) pd.occupation = form.occupation;
  if (form.income != null && form.income !== '') pd.income = form.income;

  // Customer-type radios
  if (form.customer_type) pd.customerType = form.customer_type;
  if (form.customer_type_2) pd.customerType2 = form.customer_type_2;

  // Social
  if (form.line_id) pd.lineId = form.line_id;
  if (form.facebook_link) pd.facebookLink = form.facebook_link;

  // Source / referral
  if (form.source) pd.source = form.source;
  if (form.source_detail) pd.sourceDetail = form.source_detail;
  if (form.ad_description) pd.adDescription = form.ad_description;

  // Preferences
  if (form.like_note) pd.likeNote = form.like_note;
  if (form.dislike_note) pd.dislikeNote = form.dislike_note;
  if (form.note) pd.note = form.note;
  if (form.doctor_id) pd.doctorId = form.doctor_id;

  // Health
  if (form.symptoms) pd.symptoms = form.symptoms;
  if (form.before_treatment) pd.beforeTreatment = form.before_treatment;
  if (form.congenital_disease) pd.congenitalDisease = form.congenital_disease;
  if (form.history_of_drug_allergy) pd.drugAllergy = form.history_of_drug_allergy;
  if (form.history_of_food_allergy) pd.foodAllergy = form.history_of_food_allergy;
  if (typeof form.pregnanted === 'boolean') pd.pregnanted = form.pregnanted;

  // V141 (2026-05-31) — structured visit-reason / chief-complaint dataset carried
  // from the kiosk conversion. The intake view + generateClinicalSummary read
  // these by these names; pre-V141 they were dropped from patientData → blank
  // "สาเหตุที่มาพบแพทย์" even though the customer filled them. AV162.
  if (Array.isArray(form.visit_reasons) && form.visit_reasons.length) pd.visitReasons = form.visit_reasons;
  if (form.visit_reason_other) pd.visitReasonOther = form.visit_reason_other;
  if (Array.isArray(form.hrt_goals) && form.hrt_goals.length) pd.hrtGoals = form.hrt_goals;
  if (form.hrt_trans_type) pd.hrtTransType = form.hrt_trans_type;
  if (form.hrt_other_detail) pd.hrtOtherDetail = form.hrt_other_detail;

  // Emergency contacts (camelCase aliases)
  if (form.contact_1_firstname) pd.emergencyName = form.contact_1_firstname + (form.contact_1_lastname ? ` ${form.contact_1_lastname}` : '');
  if (form.contact_1_telephone_number) pd.emergencyPhone = form.contact_1_telephone_number;
  // Phase 24.0-nonies — canonical contact_1_relation → camelCase emergencyRelation
  // mirror so CustomerDetailView ("ผู้ติดต่อฉุกเฉิน X (relation)") + legacy
  // readers stay backward-compat.
  if (form.contact_1_relation) pd.emergencyRelation = form.contact_1_relation;
  if (form.contact_2_firstname) pd.emergencyName2 = form.contact_2_firstname + (form.contact_2_lastname ? ` ${form.contact_2_lastname}` : '');
  if (form.contact_2_telephone_number) pd.emergencyPhone2 = form.contact_2_telephone_number;
  if (form.contact_2_relation) pd.emergencyRelation2 = form.contact_2_relation;

  // Receipt
  if (form.receipt_type) pd.receiptType = form.receipt_type;

  // Profile + gallery URLs (after upload)
  if (form.profile_image) pd.profileImage = form.profile_image;
  if (Array.isArray(form.gallery_upload) && form.gallery_upload.length > 0) {
    pd.gallery = form.gallery_upload;
  }

  return pd;
}

export { buildPatientDataFromForm };

// V33.3 (2026-04-27) — REVERSE mapper: customer doc → form (lowercase ProClinic
// shape). Used by CustomerEditPage to prefill the form from an existing
// customer doc. Reads BOTH root flat fields (post-V33 docs) AND
// patientData camelCase (cloned customers via reverseMapPatient).
//
// Critical: this MUST mirror buildPatientDataFromForm's mapping in reverse,
// so a save → load → save round-trip preserves all fields.
function buildFormFromCustomer(customer) {
  if (!customer || typeof customer !== 'object') return null;
  const pd = customer.patientData && typeof customer.patientData === 'object' ? customer.patientData : {};

  const pick = (rootKey, pdKey) => {
    const r = customer[rootKey];
    const p = pdKey ? pd[pdKey] : null;
    if (r != null && r !== '') return r;
    if (p != null && p !== '') return p;
    return '';
  };

  // Birthdate: prefer root ISO; fall back to patientData.birthdate; fall back to
  // dobYear/Month/Day → reconstruct ISO (handles legacy cloned shape).
  let birthdate = pick('birthdate', 'birthdate');
  if (!birthdate && pd.dobYear) {
    const yrBE = parseInt(pd.dobYear, 10);
    const mo = parseInt(pd.dobMonth || '1', 10);
    const dy = parseInt(pd.dobDay || '1', 10);
    if (!Number.isNaN(yrBE) && !Number.isNaN(mo) && !Number.isNaN(dy)) {
      // Heuristic: years > 2400 are BE (พ.ศ.); convert to CE.
      const yrCE = yrBE > 2400 ? yrBE - 543 : yrBE;
      birthdate = `${String(yrCE).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(dy).padStart(2, '0')}`;
    }
  }

  return {
    hn_no: customer.hn_no || customer.proClinicHN || '',
    old_hn_id: pick('old_hn_id'),
    prefix: pick('prefix', 'prefix'),
    prefix_en: pick('prefix_en'),
    firstname: pick('firstname', 'firstName'),
    lastname: pick('lastname', 'lastName'),
    firstname_en: pick('firstname_en'),
    lastname_en: pick('lastname_en'),
    nickname: pick('nickname', 'nickname'),
    gender: pick('gender', 'gender'),
    birthdate,
    blood_type: pick('blood_type', 'bloodType'),
    height: pick('height', 'height'),
    weight: pick('weight', 'weight'),
    citizen_id: pick('citizen_id', 'nationalId'),
    passport_id: pick('passport_id', 'passport'),
    country: pick('country', 'nationalityCountry'),
    pregnanted: typeof customer.pregnanted === 'boolean'
      ? customer.pregnanted
      : (typeof pd.pregnanted === 'boolean' ? pd.pregnanted : false),
    customer_type: pick('customer_type', 'customerType'),
    customer_type_2: pick('customer_type_2', 'customerType2'),
    telephone_number: pick('telephone_number', 'phone'),
    email: pick('email', 'email'),
    line_id: pick('line_id', 'lineId'),
    facebook_link: pick('facebook_link', 'facebookLink'),
    address: pick('address', 'address'),
    full_address_en: pick('full_address_en'),
    postal_code: pick('postal_code', 'postalCode'),
    district: pick('district', 'district'),
    sub_district: pick('sub_district', 'subDistrict'),
    province: pick('province', 'province'),
    occupation: pick('occupation', 'occupation'),
    income: pick('income', 'income'),
    source: pick('source', 'source'),
    source_detail: pick('source_detail', 'sourceDetail'),
    ad_description: pick('ad_description', 'adDescription'),
    is_image_marketing_allowed: !!customer.is_image_marketing_allowed,
    profile_image: pick('profile_image', 'profileImage'),
    card_photo: pick('card_photo'),
    doctor_id: pick('doctor_id', 'doctorId'),
    symptoms: pick('symptoms', 'symptoms'),
    symptoms_en: pick('symptoms_en'),
    before_treatment: pick('before_treatment', 'beforeTreatment'),
    before_treatment_en: pick('before_treatment_en'),
    congenital_disease: pick('congenital_disease', 'congenitalDisease'),
    congenital_disease_en: pick('congenital_disease_en'),
    history_of_drug_allergy: pick('history_of_drug_allergy', 'drugAllergy'),
    history_of_drug_allergy_en: pick('history_of_drug_allergy_en'),
    history_of_food_allergy: pick('history_of_food_allergy', 'foodAllergy'),
    history_of_food_allergy_en: pick('history_of_food_allergy_en'),
    note: pick('note', 'note'),
    // V141 — round-trip the visit-reason dataset (snake_case form keys ← camelCase
    // patientData) so a backend edit re-save does NOT clobber it. AV162.
    visit_reasons: Array.isArray(pd.visitReasons) ? pd.visitReasons : [],
    visit_reason_other: pick('visit_reason_other', 'visitReasonOther'),
    hrt_goals: Array.isArray(pd.hrtGoals) ? pd.hrtGoals : [],
    hrt_trans_type: pick('hrt_trans_type', 'hrtTransType'),
    hrt_other_detail: pick('hrt_other_detail', 'hrtOtherDetail'),
    like_note: pick('like_note', 'likeNote'),
    dislike_note: pick('dislike_note', 'dislikeNote'),
    receipt_type: pick('receipt_type', 'receiptType'),
    personal_receipt_name: pick('personal_receipt_name'),
    personal_receipt_address: pick('personal_receipt_address'),
    personal_receipt_phonenumber: pick('personal_receipt_phonenumber'),
    personal_receipt_tax_id: pick('personal_receipt_tax_id'),
    company_receipt_name: pick('company_receipt_name'),
    company_receipt_address: pick('company_receipt_address'),
    company_receipt_phonenumber: pick('company_receipt_phonenumber'),
    company_receipt_tax_id: pick('company_receipt_tax_id'),
    contact_1_firstname: pick('contact_1_firstname'),
    contact_1_firstname_en: pick('contact_1_firstname_en'),
    contact_1_lastname: pick('contact_1_lastname'),
    contact_1_lastname_en: pick('contact_1_lastname_en'),
    contact_1_telephone_number: pick('contact_1_telephone_number'),
    // Phase 24.0-nonies — relation field (canonical) + camelCase mirror.
    contact_1_relation: pick('contact_1_relation', 'emergencyRelation'),
    contact_2_firstname: pick('contact_2_firstname'),
    contact_2_firstname_en: pick('contact_2_firstname_en'),
    contact_2_lastname: pick('contact_2_lastname'),
    contact_2_lastname_en: pick('contact_2_lastname_en'),
    contact_2_telephone_number: pick('contact_2_telephone_number'),
    contact_2_relation: pick('contact_2_relation', 'emergencyRelation2'),
    gallery_upload: Array.isArray(customer.gallery_upload)
      ? customer.gallery_upload
      : (Array.isArray(pd.gallery) ? pd.gallery : []),
    created_year: customer.created_year ?? null,
    consent: {
      marketing: !!(customer.consent?.marketing),
      healthData: !!(customer.consent?.healthData),
      imageMarketing: !!(customer.consent?.imageMarketing ?? customer.is_image_marketing_allowed),
    },
  };
}

export { buildFormFromCustomer };

// V33.3 — Update existing customer doc from form. Mirrors addCustomer flow
// but with no HN counter (preserves existing) + uses existing customerId.
// Re-uploads files only if NEW File objects passed; existing URLs preserved.
//
// Phase BS (2026-05-06) — IMMUTABILITY CONTRACT for branchId: the
// "สาขาที่สร้างรายการลูกค้า" tag is set ONCE on CREATE (addCustomer or
// cloneOrchestrator first import) and NEVER overwritten on subsequent
// edits. This function deliberately ignores any branchId in `opts` or in
// `form`. Backfill of legacy untagged customers happens via the dedicated
// /api/admin/customer-branch-baseline endpoint, NOT through edit. Tests in
// BS7 lock this contract.
export async function updateCustomerFromForm(customerId, form, opts = {}) {
  if (!customerId) throw new Error('customerId required');
  const { updatedBy = null, files = null } = opts;
  const safe = form && typeof form === 'object' ? { ...form } : {};
  // Phase BS — strip branchId from form before normalization so even if the
  // form has it (legacy data from buildFormFromCustomer), we don't write it
  // back through the patch and accidentally overwrite the canonical doc.
  if ('branchId' in safe) delete safe.branchId;

  const { normalizeCustomer, validateCustomer } = await import('./customerValidation.js');

  const preNormalized = normalizeCustomer(safe);

  // Strict-validate: firstname required + bounds + regexes.
  const firstname = typeof preNormalized.firstname === 'string' ? preNormalized.firstname.trim() : '';
  if (!firstname) {
    const err = new Error('กรุณากรอกชื่อ');
    err.field = 'firstname';
    throw err;
  }
  // Inject the existing hn_no for the bounds check (since edit preserves it).
  const softFail = validateCustomer({ ...preNormalized, hn_no: preNormalized.hn_no || customerId });
  if (softFail) {
    const [field, msg] = softFail;
    const err = new Error(msg);
    err.field = field;
    throw err;
  }

  // Upload new files; preserve URLs already in form.profile_image / gallery_upload.
  let profileUrl = preNormalized.profile_image || '';
  let galleryUrls = Array.isArray(preNormalized.gallery_upload) ? [...preNormalized.gallery_upload] : [];

  if (files && (files.profile || (Array.isArray(files.gallery) && files.gallery.length > 0))) {
    const { uploadFile, buildStoragePath } = await import('./storageClient.js');

    if (files.profile) {
      const path = buildStoragePath('be_customers', customerId, 'profile', files.profile.name);
      const { url } = await uploadFile(files.profile, path, { maxSizeMB: 1 });
      profileUrl = url;
    }

    if (Array.isArray(files.gallery) && files.gallery.length > 0) {
      const uploadedUrls = await Promise.all(
        files.gallery.map(async (file) => {
          const uniqueId = (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
          const path = buildStoragePath('be_customers', customerId, `gallery_${uniqueId}`, file.name);
          const { url } = await uploadFile(file, path, { maxSizeMB: 5 });
          return url;
        }),
      );
      galleryUrls = [...galleryUrls, ...uploadedUrls];
    }
  }

  const finalForm = normalizeCustomer({
    ...preNormalized,
    profile_image: profileUrl,
    gallery_upload: galleryUrls,
  });

  // Compute updates — flat root fields + dotted-path patientData merge.
  // We use updateDoc with the FULL re-merged doc to preserve consent +
  // nested object structure that downstream readers depend on.
  // Phase BS: branchId deliberately NOT in patch — immutability contract
  // (see function-level comment). Existing branchId on doc preserved.
  const patch = {
    ...finalForm,
    // Re-build patientData (camelCase mirror) since the form may have changed.
    patientData: buildPatientDataFromForm(finalForm),
    lastUpdatedAt: new Date().toISOString(),
    lastUpdatedBy: updatedBy || null,
  };
  // Defensive: if a stray branchId snuck through finalForm (shouldn't
  // happen given the strip above + normalizeCustomer doesn't add it),
  // remove it from the patch before writing.
  if ('branchId' in patch) delete patch.branchId;

  await updateDoc(customerDoc(customerId), patch);
  return { id: customerId };
}

// ─── V33-customer-create — HN counter + addCustomer orchestrator ─────────────
//
// Why a counter (Option B in plan):
// - ProClinic-cloned customers reuse ProClinic's HN as doc-id (numeric string).
// - Manually-created customers need their OWN HN namespace that can never
//   collide with cloned ones. Format `LC-YY{0000NNN}` (e.g. LC-26000001):
//   the `LC-` prefix guarantees no namespace overlap with numeric ProClinic
//   ids. Year-prefixed sequence lets us reset internal seq each year if
//   needed without changing format.
// - Counter doc at `be_customer_counter/counter` (parallel to be_sales_counter).
// - Atomic via runTransaction: 50 concurrent calls → 50 unique sequences.

const customerCounterDoc = () => doc(db, ...basePath(), 'be_customer_counter', 'counter');

/** Generate next customer HN: `LC-YY{0000NNN}` (atomic counter, year-prefixed). */
export async function generateCustomerHN() {
  const yearStr = String(new Date().getFullYear() % 100).padStart(2, '0');
  const seq = await runTransaction(db, async (tx) => {
    const ref = customerCounterDoc();
    const snap = await tx.get(ref);
    let nextSeq = 1;
    if (snap.exists()) {
      const data = snap.data();
      if (data.year === yearStr) nextSeq = (data.seq || 0) + 1;
    }
    tx.set(ref, { year: yearStr, seq: nextSeq, updatedAt: new Date().toISOString() });
    return nextSeq;
  });
  return `LC-${yearStr}${String(seq).padStart(6, '0')}`;
}

/**
 * V33-customer-create — manually create a new customer doc.
 *
 * Orchestration:
 *   1. validateCustomer (strict allows missing hn_no — counter fills it)
 *   2. normalizeCustomer (coerce types, migrate consent.imageMarketing)
 *   3. generateCustomerHN — atomic counter
 *   4. (optional) upload profile_image + gallery_upload via storageClient
 *   5. setDoc to `be_customers/{LC-YY#######}` with merge:false (NEW doc)
 *   6. return { id, hn }
 *
 * `branchId` defaults to caller-provided value (BranchContext) or null.
 * `createdBy` is the firebaseUid of the logged-in admin (for audit).
 * `files = { profile?: File, gallery?: File[] }` — uploaded BEFORE setDoc so
 * URLs land in the same write. If upload fails, throws and no doc is written.
 */
export async function addCustomer(form, opts = {}) {
  // Phase BS (2026-05-06) — branchId fallback chain: explicit opt > current
  // user's selected branch (BranchContext) > null. The hook fallback covers
  // the legacy CustomerCreatePage callers that don't yet pass branchId
  // explicitly. resolveSelectedBranchId() returns the FALLBACK_ID 'main' in
  // pre-V20 single-branch deployments — preserves backward compat.
  const { branchId, createdBy = null, files = null, strict = true } = opts;
  const resolvedBranchId = (typeof branchId === 'string' && branchId)
    ? branchId
    : (resolveSelectedBranchId() || null);
  const safe = form && typeof form === 'object' ? { ...form } : {};

  // Steps 1+2 — normalize FIRST (coerce types e.g. gender 'm'→'M', upper
  // passport, etc.) so validation sees the canonical shape. Mirrors the
  // saveCustomer pattern (lines 66-68): normalize → strict validate.
  const { normalizeCustomer, validateCustomer } = await import('./customerValidation.js');

  // Strip any caller-provided hn_no (counter is authoritative on create).
  delete safe.hn_no;

  const preNormalized = normalizeCustomer(safe);

  if (strict) {
    // Pre-counter validation: only firstname is truly required from the user.
    const firstname = typeof preNormalized.firstname === 'string' ? preNormalized.firstname.trim() : '';
    if (!firstname) {
      const err = new Error('กรุณากรอกชื่อ');
      err.field = 'firstname';
      throw err;
    }
  }

  // Soft-validate the normalized shape (bounds + regexes + enum) to catch
  // malformed input. We inject a placeholder hn_no so the bounds check on
  // hn_no doesn't fire (counter fills it later).
  const softFail = validateCustomer({ ...preNormalized, hn_no: 'placeholder' });
  if (softFail) {
    const [field, msg] = softFail;
    const err = new Error(msg);
    err.field = field;
    throw err;
  }

  // Step 3 — HN counter (atomic).
  const hn = await generateCustomerHN();
  const customerId = hn;  // doc-id == HN (LC-prefixed; collision-free with ProClinic numeric ids)

  // Step 4 — uploads (if any). Done BEFORE the Firestore write so a partial
  // failure doesn't leave a doc with broken image refs.
  let profileUrl = safe.profile_image || '';
  let galleryUrls = Array.isArray(safe.gallery_upload) ? [...safe.gallery_upload] : [];

  if (files && (files.profile || (Array.isArray(files.gallery) && files.gallery.length > 0))) {
    const { uploadFile, buildStoragePath } = await import('./storageClient.js');

    if (files.profile) {
      const path = buildStoragePath('be_customers', customerId, 'profile', files.profile.name);
      const { url } = await uploadFile(files.profile, path, { maxSizeMB: 1 });
      profileUrl = url;
    }

    if (Array.isArray(files.gallery) && files.gallery.length > 0) {
      const uploadedUrls = await Promise.all(
        files.gallery.map(async (file) => {
          const uniqueId = (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
          const path = buildStoragePath('be_customers', customerId, `gallery_${uniqueId}`, file.name);
          const { url } = await uploadFile(file, path, { maxSizeMB: 5 });
          return url;
        }),
      );
      galleryUrls = [...galleryUrls, ...uploadedUrls];
    }
  }

  // Step 5 — assemble + write. Re-normalize after merging upload URLs so
  // the gallery_upload dedupe runs on the final concatenated array.
  const nowIso = new Date().toISOString();
  const finalForm = normalizeCustomer({
    ...preNormalized,
    hn_no: hn,
    profile_image: profileUrl,
    gallery_upload: galleryUrls,
    created_year: new Date().getFullYear(),
  });

  const docPayload = {
    ...finalForm,
    // V33-customer-create — patientData mirror in camelCase for downstream
    // readers (CustomerListTab, AppointmentFormModal, SaleTab, etc.).
    // Mirrors the cloneOrchestrator output shape produced by reverseMapPatient.
    patientData: buildPatientDataFromForm(finalForm),
    proClinicId: null,
    proClinicHN: null,
    // Phase BS — stamp on CREATE only. Immutable thereafter.
    branchId: resolvedBranchId,
    createdAt: nowIso,
    createdBy: createdBy || null,
    lastUpdatedAt: nowIso,
    clonedAt: nowIso,        // sort key compat with CustomerListTab (sorts by clonedAt desc)
    isManualEntry: true,     // distinguish from ProClinic-cloned customers
    courses: [],
    appointments: [],
    treatmentSummary: [],
    treatmentCount: 0,
  };

  await setDoc(customerDoc(customerId), docPayload, { merge: false });
  return { id: customerId, hn };
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
 * is unchanged. Added now so any future admin erasure caller can't
 * accidentally half-delete.
 *
 * Stock movements (be_stock_movements) and wallet-tx/point-tx logs ARE
 * deleted here as part of the erasure. That's intentional for full
 * customer-data removal; do NOT use this function for normal "cancel"
 * or "soft delete" operations.
 */
/**
 * Phase 24.0 (2026-05-06) — single source of truth for customer cascade-delete
 * scope. Both `deleteCustomerCascade` (this file) and the server-side
 * `/api/admin/delete-customer-cascade` endpoint reference this list (server
 * has its own copy because firebase-admin uses a different collection-ref
 * helper, but the COUNT and ORDER of entries MUST stay in lockstep — locked
 * by tests/phase-24-0-customer-delete-server.test.js).
 *
 * Order matches the cascadeCounts response shape in the audit doc.
 *
 * Out-of-scope (intentional): opd_sessions (kiosk session docs reference
 * customers via brokerProClinicId; policy-pending — leave in place);
 * Firebase Storage objects (separate cleanup-orphan cron).
 */
export const CUSTOMER_CASCADE_COLLECTIONS = Object.freeze([
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

export async function deleteCustomerCascade(proClinicId, opts = {}) {
  const cid = String(proClinicId);
  if (!cid) throw new Error('proClinicId required');
  if (!opts.confirm) {
    throw new Error('deleteCustomerCascade requires opts.confirm=true (destructive)');
  }
  // Phase 24.0 (2026-05-06) — cascade extended to 11 collections (was 8).
  // Order MUST match CUSTOMER_CASCADE_COLLECTIONS string list above so the
  // shared constant test can lock parity between client + server.
  const cols = [
    treatmentsCol(), salesCol(), depositsCol(), walletsCol(),
    walletTxCol(), membershipsCol(), pointTxCol(), appointmentsCol(),
    courseChangesCol(), linkRequestsCol(), customerLinkTokensCol(),
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
  const treatments = snap.docs.map(d => ({ ...d.data(), id: d.id }));
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
    const treatments = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    treatments.sort((a, b) => {
      const dA = a.detail?.treatmentDate || '';
      const dB = b.detail?.treatmentDate || '';
      return dB.localeCompare(dA);
    });
    onChange(treatments);
  }, onError);
}

/**
 * V36-quinquies (2026-04-29) — real-time listener for the customer doc itself.
 * Powers `CustomerDetailView` so courses[] / expiredCourses / patientData /
 * finance / treatmentSummary refresh live without F5. Replaces stale-prop
 * pattern where parent BackendDashboard's `viewingCustomer` only updated
 * after explicit reload (e.g. post-edit).
 *
 * Use case: user does treatment that deducts a course → customer.courses[i].qty
 * mutates → listener fires → CustomerDetailView re-renders active/used tabs +
 * remaining-qty display. Same for expired-course lifecycle, patientData
 * edits from another admin, etc.
 *
 * @param {string} customerId
 * @param {(customer: object|null) => void} onChange
 * @param {(err: Error) => void} [onError]
 * @returns {() => void} unsubscribe
 */
export function listenToCustomer(customerId, onChange, onError) {
  if (!customerId) {
    onChange?.(null);
    return () => {};
  }
  return onSnapshot(customerDoc(String(customerId)), (snap) => {
    if (!snap.exists()) {
      onChange(null);
      return;
    }
    onChange({ id: snap.id, ...snap.data() });
  }, onError || (() => {}));
}

/**
 * V36-quinquies (2026-04-29) — real-time listener for be_course_changes
 * filtered to one customer. Powers `CourseHistoryTab` ("ประวัติการใช้คอร์ส")
 * so newly-emitted course audit entries (kind='use' from treatment-deduct,
 * kind='cancel' from cancellation, etc.) appear immediately without F5.
 *
 * User report 2026-04-29: "ประวัติการใช้คอร์สไม่รีเฟรชแบบ real time ต้อง
 * กด f5 ก่อนในหน้าข้อมูลลูกค้า แก้ให้ทุกอย่างในหน้าข้อมูลลูกค้า refresh
 * real time เลย".
 *
 * Sort: createdAt desc client-side (Firestore where + orderBy on different
 * fields would require composite index; sort post-fetch is cheap given
 * per-customer cardinality is bounded).
 *
 * @param {string} customerId
 * @param {(entries: Array) => void} onChange
 * @param {(err: Error) => void} [onError]
 * @returns {() => void} unsubscribe
 */
export function listenToCourseChanges(customerId, onChange, onError) {
  if (!customerId) {
    onChange?.([]);
    return () => {};
  }
  const q = query(courseChangesCol(), where('customerId', '==', String(customerId)));
  return onSnapshot(q, (snap) => {
    const entries = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    entries.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    onChange(entries);
  }, onError || (() => {}));
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
  // V26.0 Phase 26.0b — extract top-level status routing fields out of `detail`
  // so they live on the treatment doc root (where `getBackendTreatment` exposes
  // them + spec § 3 mandates). status='doctor-recorded' means a doctor saved the
  // OPD-only sub-form; admin must finalize courses/consumables/billing later.
  // recordedBy + recordedAt = forensic trail preserved across admin finalize.
  // V26.1 Phase 26.1c (2026-05-13) — also extract editor attribution fields
  // (editedBy + editedByName + editedByRole + editedAt) for CDV row meta display.
  const {
    status, recordedBy, recordedAt,
    editedBy, editedByName, editedByRole, editedAt,
    // Phase 27.2 (2026-05-14) — discrete per-stage lifecycle timestamps
    vitalsignsRecordedAt, vitalsignsRecordedBy,
    doctorRecordedAt, doctorRecordedBy,
    completedAt, completedBy,
    ...detailRest
  } = detail || {};
  const topLevelPatch = {};
  if (status !== undefined) topLevelPatch.status = status;
  if (recordedBy !== undefined) topLevelPatch.recordedBy = recordedBy;
  if (recordedAt !== undefined) topLevelPatch.recordedAt = recordedAt;
  // V26.1 Phase 26.1c (2026-05-13) — editor attribution top-level fields
  if (editedBy !== undefined) topLevelPatch.editedBy = editedBy;
  if (editedByName !== undefined) topLevelPatch.editedByName = editedByName;
  if (editedByRole !== undefined) topLevelPatch.editedByRole = editedByRole;
  if (editedAt !== undefined) topLevelPatch.editedAt = editedAt;
  // Phase 27.2 (2026-05-14) — per-stage lifecycle timestamps for stacked-badge display in CDV
  if (vitalsignsRecordedAt !== undefined) topLevelPatch.vitalsignsRecordedAt = vitalsignsRecordedAt;
  if (vitalsignsRecordedBy !== undefined) topLevelPatch.vitalsignsRecordedBy = vitalsignsRecordedBy;
  if (doctorRecordedAt !== undefined) topLevelPatch.doctorRecordedAt = doctorRecordedAt;
  if (doctorRecordedBy !== undefined) topLevelPatch.doctorRecordedBy = doctorRecordedBy;
  if (completedAt !== undefined) topLevelPatch.completedAt = completedAt;
  if (completedBy !== undefined) topLevelPatch.completedBy = completedBy;
  // V102 (2026-05-19 LATE+2) — stamp TOP-LEVEL branchId per BSA Rule L.
  // Pre-V102: only detail.branchId was set (TFP backendDetail had branchId
  // inside the spread); top-level doc had NO branchId field → per-branch
  // be_treatments queries via `where('branchId', '==', X)` returned 0
  // results → treatments invisible in per-branch report tabs.
  // Mirror of V102.A createBackendSale fix; same class-of-bug. See AV89.
  // Diag (scripts/diag-system-wide-branchid-stamp-audit.mjs):
  // 5/5 prod treatments missing top-level branchId pre-fix.
  topLevelPatch.branchId = _resolveBranchIdForWrite(detail);
  // V96 (2026-05-19) — defense-in-depth: pass {merge:true} so any future caller
  // that smuggles a Firestore sentinel (deleteField(), arrayUnion(), etc.)
  // through the `detail` payload doesn't crash the create path. TFP v26
  // status patch was the surfaced instance; this layer ensures no future
  // class-of-bug at the same boundary. For a fresh BT-${Date.now()} id,
  // merge:true is functionally identical to non-merge (no existing fields
  // to preserve — collision probability is effectively zero).
  await setDoc(treatmentDoc(treatmentId), {
    treatmentId,
    customerId: String(customerId),
    detail: { ...detailRest, createdBy: 'backend', createdAt: now },
    createdBy: 'backend',
    createdAt: now,
    ...topLevelPatch,
  }, { merge: true });
  return { treatmentId, success: true };
}

/** Update an existing backend treatment */
export async function updateBackendTreatment(treatmentId, detail) {
  // V26.0 Phase 26.0b — same top-level extraction as createBackendTreatment.
  // On admin finalize (saveMode='staff'), `status: deleteField()` clears the
  // doctor-recorded flag; recordedBy + recordedAt are OMITTED from the patch
  // so prior values are preserved (forensic trail per spec § 3).
  // V26.1 Phase 26.1c (2026-05-13) — also extract editor attribution fields.
  const {
    status, recordedBy, recordedAt,
    editedBy, editedByName, editedByRole, editedAt,
    // Phase 27.2 (2026-05-14) — discrete per-stage lifecycle timestamps
    vitalsignsRecordedAt, vitalsignsRecordedBy,
    doctorRecordedAt, doctorRecordedBy,
    completedAt, completedBy,
    ...detailRest
  } = detail || {};
  const topLevelPatch = {};
  if (status !== undefined) topLevelPatch.status = status;
  if (recordedBy !== undefined) topLevelPatch.recordedBy = recordedBy;
  if (recordedAt !== undefined) topLevelPatch.recordedAt = recordedAt;
  // V26.1 Phase 26.1c (2026-05-13) — editor attribution top-level fields
  if (editedBy !== undefined) topLevelPatch.editedBy = editedBy;
  if (editedByName !== undefined) topLevelPatch.editedByName = editedByName;
  if (editedByRole !== undefined) topLevelPatch.editedByRole = editedByRole;
  if (editedAt !== undefined) topLevelPatch.editedAt = editedAt;
  // Phase 27.2 (2026-05-14) — per-stage lifecycle timestamps for stacked-badge display in CDV
  if (vitalsignsRecordedAt !== undefined) topLevelPatch.vitalsignsRecordedAt = vitalsignsRecordedAt;
  if (vitalsignsRecordedBy !== undefined) topLevelPatch.vitalsignsRecordedBy = vitalsignsRecordedBy;
  if (doctorRecordedAt !== undefined) topLevelPatch.doctorRecordedAt = doctorRecordedAt;
  if (doctorRecordedBy !== undefined) topLevelPatch.doctorRecordedBy = doctorRecordedBy;
  if (completedAt !== undefined) topLevelPatch.completedAt = completedAt;
  if (completedBy !== undefined) topLevelPatch.completedBy = completedBy;
  // V102 (2026-05-19 LATE+2) — preserve branchId on update when caller
  // explicitly passes it (mirrors updateBackendSale semantics). Don't
  // auto-fill from selected branch — admin cross-branch edits would
  // corrupt original stamping. New writes flow through
  // createBackendTreatment which stamps unconditionally.
  // Defensive: empty-string detail.branchId would clobber existing via
  // detailRest spread → strip from detailRest when not valid.
  const safeDetailRest = { ...detailRest };
  if (detail && typeof detail.branchId === 'string' && detail.branchId.trim()) {
    topLevelPatch.branchId = detail.branchId;
    // keep detail.branchId in detailRest too (caller-explicit override)
  } else {
    delete safeDetailRest.branchId;
  }
  await updateDoc(treatmentDoc(treatmentId), {
    detail: safeDetailRest,
    updatedAt: new Date().toISOString(),
    ...topLevelPatch,
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
  // 2026-05-22 EOD+2 → 2026-05-25 — Storage-ref cleanup. Every treatment blob now
  // lives in Firebase Storage (charts + Before/After/Other photos + lab images +
  // lab PDFs + treatment-file PDFs); each carries a storagePath. Best-effort delete
  // BEFORE removing the doc (so we don't lose the path reference). Failure is non-fatal
  // — orphans cost ~0 + a cleanup cron can sweep later. Legacy inline blobs (base64
  // dataUrl / pdfBase64, no storagePath) skip naturally.
  try {
    const snap = await getDoc(treatmentDoc(treatmentId));
    if (snap.exists()) {
      const detail = snap.data()?.detail || {};
      const paths = [];
      const pushImgPaths = (arr) => (arr || []).forEach(x => { if (x?.storagePath) paths.push(x.storagePath); });
      pushImgPaths(detail.charts);
      pushImgPaths(detail.beforeImages);
      pushImgPaths(detail.afterImages);
      pushImgPaths(detail.otherImages);
      (detail.labItems || []).forEach(l => {
        pushImgPaths(l?.images);
        if (l?.pdfStoragePath) paths.push(l.pdfStoragePath);
      });
      (detail.treatmentFiles || []).forEach(f => { if (f?.pdfStoragePath) paths.push(f.pdfStoragePath); });
      if (paths.length > 0) {
        const { deleteTreatmentBlob } = await import('./chartImageStorage.js');
        await Promise.all(paths.map(p => deleteTreatmentBlob(p).catch(() => false)));
      }
    }
  } catch (e) {
    console.warn('[deleteBackendTreatment] Storage cleanup skipped:', e?.message || e);
  }
  await deleteDoc(treatmentDoc(treatmentId));
  // appointment-loop R6 (2026-06-03) — clear any appointment's persistent
  // linkedTreatmentId that pointed at THIS treatment. The R4 fix stamps
  // appt.linkedTreatmentId when a treatment is created from an appointment (to
  // backstop the date-match gate against double-charge); but NOTHING cleared it
  // on delete → the appointment stayed permanently "treated" with a dead pointer
  // → its "สร้างบันทึกการรักษา" button hid forever (the visit could never be
  // re-recorded), it could never flag "ไม่มาตามนัด" (missed), and clicking edit
  // opened an empty, unsaveable form. Clearing it at this single shared delete
  // chokepoint covers EVERY delete surface (TFP create-rollback, TreatmentTimeline
  // cancel, CustomerDetailView delete). Best-effort — never block the delete.
  try {
    const linkSnap = await getDocs(query(appointmentsCol(), where('linkedTreatmentId', '==', treatmentId)));
    await Promise.all(linkSnap.docs.map((d) => updateDoc(d.ref, {
      linkedTreatmentId: '', updatedAt: new Date().toISOString(),
    })));
  } catch (e) {
    console.warn('[deleteBackendTreatment] linkedTreatmentId clear skipped:', e?.message || e);
  }
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
    // V26.0 Phase 26.0e (2026-05-13) — preserve `status` in summary so
    // CustomerDetailView treatment cards + TreatmentTimelineModal rows
    // can render the amber "แพทย์ลงบันทึก" chip when status === 'doctor-recorded'.
    // Top-level `status` is set by createBackendTreatment / updateBackendTreatment
    // (Phase 26.0b extension); null fallback keeps legacy summaries unaffected.
    status: t.status || null,
    // V26.1 Phase 26.1c (2026-05-13) — preserve editor attribution for
    // CDV row meta display "· แก้ไขโดย: X (role)". Top-level fields written
    // by createBackendTreatment + updateBackendTreatment via top-level extraction.
    editedBy: t.editedBy || null,
    editedByName: t.editedByName || '',
    editedByRole: t.editedByRole || '',
    // Phase 27.2 (2026-05-14) — per-stage lifecycle timestamps for CDV
    // stacked-badge display. User directive "ทำให้ Badge แต่ละสถานะไม่หายไป
    // คือแสดงซ้อนกันได้ในลิสต์เลย ... แต่แสดงเวลากำกับของแต่ละอย่างไว้ด้วย
    // แล้วเรียง badge ตามเวลาด้วย".
    // Each stage has its own discrete timestamp so the lifecycle journey
    // is preserved across admin finalize (which used to overwrite recordedAt).
    // Legacy treatments without these fields fall back at display time:
    //   - status='vitalsigns-recorded' + recordedAt → infer vitalsignsRecordedAt
    //   - status='doctor-recorded' + recordedAt → infer doctorRecordedAt
    //   - editedAt present (any save) → use as "บันทึกแล้ว" fallback time
    vitalsignsRecordedAt: t.vitalsignsRecordedAt || null,
    vitalsignsRecordedBy: t.vitalsignsRecordedBy || null,
    doctorRecordedAt: t.doctorRecordedAt || null,
    doctorRecordedBy: t.doctorRecordedBy || null,
    completedAt: t.completedAt || null,
    completedBy: t.completedBy || null,
    recordedAt: t.recordedAt || null, // legacy fallback
    editedAt: t.editedAt || null,
    createdAt: t.createdAt || null,
  }));
  await updateCustomer(customerId, {
    treatmentSummary: summary,
    treatmentCount: summary.length,
  });
}

// ─── Course Deduction ─────────────────────────────────────────────────────

import { deductQty, reverseQty, addRemaining as addRemainingQty, buildQtyString, formatQtyString } from './courseUtils.js';

// V148 (2026-06-02) — atomic customer.courses[] read-modify-write.
// Every course mutator (deduct/reverse/add/assign/resolve/exchange) used to do
// getDoc(customerDoc) → mutate courses[] → updateCustomer({courses}) with NO
// transaction. Two concurrent mutators both read the SAME courses[], both
// updateCustomer → LAST WRITE WINS → a use/buy/reverse is LOST → the course is
// silently OVER-CREDITED (money-adjacent — the customer paid for N sessions).
// Confirmed Rule Q L2: scripts/e2e-course-deduct-concurrency.mjs — 5 concurrent
// uses on a 5/5 course left remaining=4 (only 1 of 5 applied) BEFORE this fix.
// The course analog of the V147 stock race. This helper serializes course
// mutations via Firestore OCC (read + write in one runTransaction). The mutator
// MUST mutate `courses` IN PLACE (push/splice/index-assign — never reassign the
// binding). On contention Firestore aborts + auto-retries the callback with the
// re-read courses, so each concurrent mutation applies on top of the prior.
// Returns the mutator's return value when defined, else the final courses array.
async function _mutateCustomerCoursesAtomic(customerId, mutate) {
  return runTransaction(db, async (tx) => {
    const ref = customerDoc(customerId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Customer not found');
    const courses = [...(snap.data().courses || [])];
    const ret = await mutate(courses, snap.data());
    tx.update(ref, { courses });
    return ret !== undefined ? ret : courses;
  });
}

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
  const { parseQtyString, formatQtyString } = await import('./courseUtils.js');
  const preferNewest = !!opts?.preferNewest;
  // V148 — atomic (was getDoc→updateCustomer, no tx → concurrent uses lost-
  // updated → course over-credited). beforeSnapshot captured inside the mutator
  // so it stays consistent with the committed courses across tx retries.
  let beforeSnapshot = [];
  const courses = await _mutateCustomerCoursesAtomic(customerId, (courses) => {
  // Phase 16.5-quater (2026-04-29) — snapshot before mutation so we can diff
  // and emit per-changed-course audit entries (kind='use') after commit.
  // Only fires when caller passes opts.treatmentId (treatment-deduction
  // context). Other callers (sale/exchange/share) emit their own audit
  // entries with the appropriate kind.
  beforeSnapshot = courses.map((c) => ({ ...c }));

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
  }); // V148 — end atomic course mutation (tx.update writes the deducted courses)

  // Phase 16.5-quater — emit kind='use' audit per changed course when called
  // from treatment-deduction context (opts.treatmentId set).
  if (opts.treatmentId) {
    try {
      const { buildChangeAuditEntry } = await import('./courseExchange.js');
      // Phase 16.7-quinquies-ter (2026-04-29) — build a per-courseIndex map
      // of the deduction's product info so the audit can record the actual
      // PRODUCT consumed (e.g. "Allergan 100 U  -75 U") alongside the
      // wrapper course name. Mirrors the matchesDed logic the deduction
      // loop already uses, but applied here as one-pass best-effort: when
      // one deduction row touches multiple course indexes, we attribute
      // the deduction's product info to ALL touched indexes for that
      // deduction. User-visible result: each per-index audit entry shows
      // which product line drove the consumption.
      const productByIndex = new Map(); // courseIndex → { productName, productQty, productUnit }
      for (const d of (deductions || [])) {
        if (!d) continue;
        const productName = String(d.productName || '').trim();
        if (!productName) continue;
        const productQty = Number(d.deductQty) || 0;
        const productUnit = String(d.unit || '').trim();
        // Match deductions against beforeSnapshot using the same
        // name+product predicate as the deduction loop. We DON'T track
        // per-deduction qty consumed (the dedup loop is complex), so when
        // a deduction matches multiple indexes we attach its productName
        // to all of them. Edge cases: rare.
        for (let i = 0; i < beforeSnapshot.length; i++) {
          if (productByIndex.has(i)) continue; // first-deduction-wins per index
          const c = beforeSnapshot[i];
          if (!c) continue;
          const nameMatch = d.courseName ? c.name === d.courseName : true;
          const productMatch = d.productName ? (c.product || c.name) === d.productName : true;
          if (nameMatch && productMatch) {
            productByIndex.set(i, { productName, productQty, productUnit });
          }
        }
      }

      for (let i = 0; i < beforeSnapshot.length; i++) {
        const beforeC = beforeSnapshot[i];
        const afterC = courses[i];
        if (!beforeC || !afterC) continue;
        // Phase 16.7-quinquies-ter (2026-04-29) — buffet courses keep qty
        // unchanged on use (consumeRealQty skips them per user contract).
        // Without an explicit gate, the qtyChanged check would skip the
        // audit entirely → buffet usage invisible in ประวัติการใช้คอร์ส.
        // Emit audit if EITHER qty changed OR a deduction was attributed
        // to this course index (i.e. caller targeted this course).
        const qtyChanged = String(beforeC.qty || '') !== String(afterC.qty || '');
        const productInfo = productByIndex.get(i) || {};
        const hadAttributedDeduction = productByIndex.has(i);
        if (!qtyChanged && !hadAttributedDeduction) continue;
        const beforeP = parseQtyString(beforeC.qty || '');
        const afterP = parseQtyString(afterC.qty || '');
        const delta = (Number(beforeP.remaining) || 0) - (Number(afterP.remaining) || 0);
        const audit = buildChangeAuditEntry({
          customerId,
          kind: 'use',
          fromCourse: beforeC,
          toCourse: null,
          refundAmount: null,
          reason: opts.reason || `ตัดคอร์สจากการรักษา`,
          actor: opts.actor || '',
          staffId: opts.staffId || '',
          staffName: opts.staffName || '',
          qtyDelta: delta > 0 ? -delta : null, // negative = consumed
          qtyBefore: String(beforeC.qty || ''),
          qtyAfter: String(afterC.qty || ''),
          linkedTreatmentId: String(opts.treatmentId || ''),
          productName: productInfo.productName || '',
          productQty: productInfo.productQty || 0,
          productUnit: productInfo.productUnit || '',
        });
        await setDoc(courseChangeDoc(audit.changeId), audit);
      }
    } catch (e) {
      console.warn('[deductCourseItems] audit emit failed:', e);
    }
  }

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
  const preferNewest = !!opts?.preferNewest;
  // V148 — atomic customer.courses[] mutation (concurrent reverse↔deduct
  // lost-update guard). See _mutateCustomerCoursesAtomic.
  return _mutateCustomerCoursesAtomic(customerId, (courses) => {

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
  }); // V148 — end atomic course mutation
}

/**
 * Admin: add remaining qty to a course (increment REMAINING only, capped at TOTAL).
 *
 * Phase 16.5-quater fix (2026-04-29) — pre-fix used `addRemainingQty`
 * (= `addRemaining` from courseUtils.js, which incremented BOTH remaining
 * AND total). User report: "ปุ่มเพิ่มคงเหลือ … ไปเพิ่มจำนวนครั้งสูงสุดแทน
 * เช่น 98/100 + 1 → 98/101". Switched to `reverseQty` which has the right
 * math: `Math.min(remaining + amount, total)` → 98/100 + 1 → 99/100 ✓.
 *
 * Plus Phase 16.5-quater audit unification: writes a `be_course_changes`
 * entry (kind='add') with qtyDelta + qtyBefore + qtyAfter + staff so the
 * new ประวัติการใช้คอร์ส tab can show this action.
 *
 * @param {string} customerId
 * @param {number} courseIndex
 * @param {number} addQty
 * @param {object} [opts] — { actor, staffId, staffName, reason }
 */
export async function addCourseRemainingQty(customerId, courseIndex, addQty, opts = {}) {
  // V148 — atomic (concurrent add↔use lost-update guard).
  let before; let beforeQty = ''; let afterQtyStr = '';
  const courses = await _mutateCustomerCoursesAtomic(customerId, (courses) => {
    if (courseIndex < 0 || courseIndex >= courses.length) throw new Error('Invalid course index');
    before = courses[courseIndex];
    beforeQty = String(before.qty || '');
    afterQtyStr = reverseQty(beforeQty, addQty);
    courses[courseIndex] = { ...before, qty: afterQtyStr };
  });

  // Phase 16.5-quater — emit be_course_changes audit entry (kind='add')
  try {
    const { buildChangeAuditEntry } = await import('./courseExchange.js');
    const audit = buildChangeAuditEntry({
      customerId,
      kind: 'add',
      fromCourse: before,
      toCourse: null,
      refundAmount: null,
      reason: opts.reason || `เพิ่มคงเหลือ +${addQty}`,
      actor: opts.actor || '',
      staffId: opts.staffId || '',
      staffName: opts.staffName || '',
      qtyDelta: Number(addQty) || 0,
      qtyBefore: beforeQty,
      qtyAfter: afterQtyStr,
    });
    await setDoc(courseChangeDoc(audit.changeId), audit);
  } catch (e) {
    // Non-fatal: log but don't block the qty mutation
    console.warn('[addCourseRemainingQty] audit emit failed:', e);
  }

  return courses[courseIndex];
}

// V50 (2026-05-08) — Master Course CRUD (createMasterCourse / update / delete)
// REMOVED. Per Rule H-bis, ProClinic dev-only sync infrastructure deleted.
// Use saveCourse / deleteCourse on be_courses (canonical) instead.

/** Assign a master course to a customer — creates entries in customer.courses[] */
export async function assignCourseToCustomer(customerId, masterCourse) {
  // V148 — atomic (concurrent buy↔use / buy↔buy lost-update guard).
  return _mutateCustomerCoursesAtomic(customerId, (courses) => {

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
    ? thaiDateNDaysFromNow(validityDays)
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
        // V44 (2026-05-08) — dual-read name field. Same multi-reader-sweep
        // discipline as the standard branch above. Empty-string final fallback
        // (NOT course-name) preserves the V44 invariant: "name=courseName"
        // is the bug signature; we never write that.
        name: p.name || p.productName || '',
        qty: Number(p.qty) || 0,
        unit: p.unit || 'ครั้ง',
        minQty: p.minQty != null && p.minQty !== '' ? Number(p.minQty) : null,
        maxQty: p.maxQty != null && p.maxQty !== '' ? Number(p.maxQty) : null,
        // 2026-04-28: per-option skipStockDeduction flag carried into the
        // pick-at-treatment placeholder; persists when doctor picks.
        skipStockDeduction: !!p.skipStockDeduction,
      })),
      assignedAt: new Date().toISOString(),
    });
    return { success: true, courses };
  }

  for (const p of products) {
    const qty = isRealQty
      ? buildQtyString(1, p.unit || 'ครั้ง')
      : buildQtyString(Number(p.qty) || 1, p.unit || 'ครั้ง');
    // V44 (2026-05-08) — defensive dual-read: accept both canonical `name`
    // (post-beCourseToMasterShape) AND legacy `productName` (raw shape).
    // The mainProductName fallback covers the case where buildPurchasedCourseEntry
    // already wrote name via legacy fallback (course name) — last resort
    // reaches into the master in case the upstream chain dropped it.
    // Empty-string final fallback is preferable to course name (the V44 bug
    // signature) — a blank product is recoverable via UI; a course-name
    // product silently masquerades as a real product.
    const productName = p.name || p.productName
      || (p.isMainProduct ? masterCourse.mainProductName : '')
      || '';
    courses.push({
      name: masterCourse.name,
      product: productName,
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
      // 2026-04-28: per-row "ไม่ตัดสต็อค" flag — fall back to course-level
      // mainSkipStockDeduction (carried via masterCourse.skipStockDeduction
      // at top level) when sub-product doesn't have its own override. This
      // enables the deduct path to honor the flag at treatment time.
      skipStockDeduction: !!(p.skipStockDeduction || masterCourse.skipStockDeduction),
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
      // No-products fallback row inherits course-level flag.
      skipStockDeduction: !!masterCourse.skipStockDeduction,
    });
  }

  return { success: true, courses };
  }); // V148 — end atomic course mutation
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
  // V148 — atomic (concurrent resolve↔use lost-update guard).
  return _mutateCustomerCoursesAtomic(customerId, (courses) => {

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
    availableProducts: discardedOptions,
    needsPickSelection: _discardFlag,
    product: _discardProduct,
    qty: _discardQty,
    courseId: discardedPickId,
    ...basePlaceholder
  } = placeholder;

  // Phase 14.7.H follow-up I (2026-04-26) — reopen-add capability.
  // Stamp `pickedFromCourseId` (= placeholder's stable id) on every
  // resolved entry so siblings can be discovered later. The FIRST sibling
  // additionally carries `_pickGroupOptions` — a snapshot of the original
  // availableProducts list — so a later visit can revive the pick modal
  // without re-fetching the master course (whose options may have been
  // edited by an admin). Other siblings omit `_pickGroupOptions` to avoid
  // bloating the customer doc with redundant copies.
  const pickGroupOptions = Array.isArray(discardedOptions)
    ? discardedOptions.map(p => ({ ...p }))
    : null;

  const now = new Date().toISOString();
  const resolvedEntries = valid.map((p, i) => ({
    ...basePlaceholder,
    product: p.name || '',
    productId: p.productId != null ? String(p.productId) : '',
    qty: buildQtyString(Number(p.qty) || 1, p.unit || 'ครั้ง'),
    status: 'กำลังใช้งาน',
    assignedAt: basePlaceholder.assignedAt || now,
    pickedFromCourseId: discardedPickId || null,
    ...(i === 0 && pickGroupOptions ? { _pickGroupOptions: pickGroupOptions } : {}),
  }));

  courses.splice(idx, 1, ...resolvedEntries);
  return { success: true, courses };
  }); // V148 — end atomic course mutation
}

/**
 * Phase 14.7.H follow-up I (2026-04-26) — reopen-add for pick-at-treatment.
 *
 * After an initial pick has been resolved (placeholder spliced into N
 * standard entries), the customer may want to use MORE products from the
 * same original course at a later visit. This helper appends new resolved
 * entries beside the existing siblings without disturbing prior usage.
 *
 * Trade-off chosen (NOT supporting in-place qty edit): once an entry has
 * deductions against it, retroactively changing its `total` would corrupt
 * the deduction-history math. Adding new entries is additive and clean.
 *
 * @param {string} customerId
 * @param {string} pickedFromCourseId — the placeholder's original courseId
 *   (carried on every sibling as `pickedFromCourseId`).
 * @param {Array<{productId, name, qty, unit}>} additionalPicks
 * @returns {Promise<{success:boolean, courses:object[], appended:number}>}
 */
export async function addPicksToResolvedGroup(customerId, pickedFromCourseId, additionalPicks) {
  if (!pickedFromCourseId) throw new Error('pickedFromCourseId required');
  // V148 — atomic (concurrent add-picks↔use lost-update guard).
  return _mutateCustomerCoursesAtomic(customerId, (courses) => {

  const siblings = courses.filter(c => c && c.pickedFromCourseId === pickedFromCourseId);
  if (siblings.length === 0) {
    throw new Error('No existing picked entries for group ' + pickedFromCourseId);
  }
  const valid = (Array.isArray(additionalPicks) ? additionalPicks : [])
    .filter(p => p && Number(p.qty) > 0 && (p.name || p.productId));
  if (valid.length === 0) throw new Error('No valid picks provided');

  // Use first sibling as template — carries the inherited base meta from
  // the original placeholder (parentName, source, linkedSaleId, expiry,
  // courseType, isAddon, etc). Strip per-entry-mutating fields + the
  // 1st-sibling-only `_pickGroupOptions` since new entries are NOT the
  // first sibling.
  const template = siblings[0];
  const {
    product: _stripProduct,
    productId: _stripProductId,
    qty: _stripQty,
    status: _stripStatus,
    assignedAt: _stripAssigned,
    _pickGroupOptions: _stripOptions,
    ...baseTpl
  } = template;

  const now = new Date().toISOString();
  const newEntries = valid.map(p => ({
    ...baseTpl,
    product: p.name || '',
    productId: p.productId != null ? String(p.productId) : '',
    qty: buildQtyString(Number(p.qty) || 1, p.unit || 'ครั้ง'),
    status: 'กำลังใช้งาน',
    assignedAt: now,
    pickedFromCourseId,
  }));

  // Append at end — keeps existing siblings in place + their indexes stable
  // (so any in-flight references to siblings[i] still resolve correctly).
  courses.push(...newEntries);
  return { success: true, courses, appended: newEntries.length };
  }); // V148 — end atomic course mutation
}

/** Exchange a product within a customer's course */
export async function exchangeCourseProduct(customerId, courseIndex, newProduct, reason = '', opts = {}) {
  // V148 — atomic 2-field write (courses + courseExchangeLog) via runTransaction
  // (concurrent exchange↔use/exchange lost-update guard).
  return runTransaction(db, async (tx) => {
  const _ref = customerDoc(customerId);
  const snap = await tx.get(_ref);
  if (!snap.exists()) throw new Error('Customer not found');
  const courses = [...(snap.data().courses || [])];
  if (courseIndex < 0 || courseIndex >= courses.length) throw new Error('Invalid course index');

  const oldCourse = courses[courseIndex];
  // Phase 16.5-ter (2026-04-29) — capture staff identification on exchange.
  // Coerced for V14 lock (no undefined leaves).
  const exchangeEntry = {
    timestamp: new Date().toISOString(),
    oldProduct: String(oldCourse.product || ''),
    oldQty: String(oldCourse.qty || ''),
    newProduct: String(newProduct.name || ''),
    newQty: buildQtyString(Number(newProduct.qty) || 1, newProduct.unit || ''),
    reason: String(reason || ''),
    staffId: String(opts.staffId || ''),
    staffName: String(opts.staffName || ''),
  };

  courses[courseIndex] = {
    ...oldCourse,
    product: newProduct.name,
    qty: buildQtyString(Number(newProduct.qty) || 1, newProduct.unit || ''),
  };

  const existingLog = snap.data().courseExchangeLog || [];
  tx.update(_ref, {
    courses,
    courseExchangeLog: [...existingLog, exchangeEntry],
  });
  return { success: true, courses, exchangeLog: exchangeEntry };
  }); // V148 — end atomic exchange
}

// ─── Appointment CRUD ───────────────────────────────────────────────────────

const appointmentsCol = () => collection(db, ...basePath(), 'be_appointments');
const appointmentDoc = (id) => doc(db, ...basePath(), 'be_appointments', String(id));

// AP1 schema fix (2026-05-04, V15 #13 candidate): atomic slot reservation
// to eliminate the read-then-write race in createBackendAppointment. Slot
// doc ID encodes the deterministic key — runTransaction tx.get throws on
// existence, otherwise tx.set both slot + appointment atomically.
const appointmentSlotsCol = () => collection(db, ...basePath(), 'be_appointment_slots');
const appointmentSlotDoc = (slotId) => doc(db, ...basePath(), 'be_appointment_slots', String(slotId));

// AP1/AP1-bis slot-key builders moved to ./appointmentSlotKeys.js (2026-06-03,
// appointment-loop R1) so appointmentDepositBatch.js can reserve the SAME slots.
// Imported at top; re-exported here for backward-compat with existing importers
// (tests, scripts, internal callers below).
export { SLOT_INTERVAL_MIN, buildAppointmentSlotKey, buildAppointmentSlotKeys, buildAppointmentRoomSlotKeys, buildAppointmentGuardKeys };

/** V128 — resolve a LINKED customer's phone for denorm on the appointment doc.
 *  AppointmentFormModal sends customerName/HN + customerPhoneTemp (pick-later)
 *  but NEVER customerPhone → linked appts showed blank phone in the hover card
 *  (apptPhoneValue) + search + print. Mirror of V108 _resolveSaleCustomerIdentity:
 *  trust a non-empty caller value; resolve from be_customers ONLY when empty +
 *  customerId set; missing/unreadable customer → '' (apptPhoneValue then falls
 *  back to customerPhoneTemp). Idempotent + non-fatal. AV145 locks this. */
async function _resolveAppointmentCustomerPhone(data) {
  let phone = (data && typeof data.customerPhone === 'string') ? data.customerPhone.trim() : '';
  const cid = data && data.customerId;
  if (cid && !phone) {
    try {
      const snap = await getDoc(customerDoc(cid));
      if (snap.exists()) phone = resolveCustomerPhone(snap.data());
    } catch { /* non-fatal — leave blank, customerPhoneTemp fallback */ }
  }
  return phone || '';
}

/** Create a new backend appointment.
 *
 * Audit P1 (2026-04-26 AP1): server-side last-mile collision check before
 * writing. Client-side `checkAppointmentCollision` runs in
 * AppointmentFormModal but two admins racing can both pass client check
 * before either writes. This pre-write read+filter catches the race window
 * down to ~50ms (read+write latency). Not perfectly atomic — Firestore SDK
 * doesn't allow queries inside transactions — but combined with the
 * client-side check + 1s listener freshness (Phase 14.7.H-B
 * `listenToAppointmentsByDate`) covers the realistic clinic-pace gap.
 *
 * Throws Error with `code='AP1_COLLISION'` + `collision` property when a
 * non-cancelled appointment for the same doctor on the same date overlaps
 * the new time range. Caller can `catch (e) { if (e.code === 'AP1_COLLISION')`
 * to surface a friendly UI message.
 *
 * Pass `data.skipServerCollisionCheck = true` to bypass — used for legacy
 * imports or scripted bulk creates where pre-validated collisions are
 * already resolved upstream.
 */
export async function createBackendAppointment(data) {
  const targetDate = normalizeApptDate(data?.date);
  const targetDoctorId = String(data?.doctorId || data?.doctor?.id || '').trim();
  const targetStart = String(data?.startTime || '').trim();
  const targetEnd = String(data?.endTime || data?.startTime || '').trim();

  // AP1 schema fix (2026-05-04, V15 #13): atomic slot reservation eliminates
  // the read-then-write race. The slot doc encodes the exact slot key; two
  // concurrent createBackendAppointment calls for the same doctor+date+time
  // will collide on `tx.get(slotDocRef)` and Firestore's optimistic-lock
  // semantics retry until one succeeds.
  //
  // RANGE-OVERLAP (different startTimes, overlapping ranges, e.g. 09:00-10:00
  // vs 09:30-10:30) — the exact-key tx doesn't catch this; the pre-write
  // overlap scan below + post-write verification still apply. Future fix:
  // mint multiple slot docs per 15-min interval. Tracked as AP1-bis.
  //
  // Pre-write OVERLAP scan (caller-friendly soft check) — runs OUTSIDE the
  // transaction. Catches range overlaps the slot-doc can't. Same logic as
  // before; complements the atomic exact-key guard.
  if (!data?.skipServerCollisionCheck && targetDate && targetDoctorId && targetStart) {
    // Phase BS — doctor collision check spans ALL branches because the same
    // physical doctor can't be in two places at once, even if they're
    // assigned to multiple branches. Explicit allBranches:true so the check
    // doesn't silently scope after Phase BS reader refactor.
    const existing = await getAppointmentsByDate(targetDate, { allBranches: true });
    const collision = existing.find(a => {
      const otherDoctorId = String(a.doctorId || a.doctor?.id || '').trim();
      if (otherDoctorId !== targetDoctorId) return false;
      if (a.status === 'cancelled') return false;
      const otherStart = String(a.startTime || '').trim();
      const otherEnd = String(a.endTime || a.startTime || '').trim();
      return targetStart < otherEnd && targetEnd > otherStart;
    });
    if (collision) {
      const err = new Error(`AP1_COLLISION: doctor ${targetDoctorId} already booked ${collision.startTime}-${collision.endTime} on ${targetDate}`);
      err.code = 'AP1_COLLISION';
      err.collision = collision;
      throw err;
    }
  }

  // appointment-loop R3 (2026-06-03) — crypto-random suffix (mirror the deposit
  // path's mintPairIds) so two DIFFERENT appointments created in the SAME
  // millisecond (two admins) can't mint the SAME id → the 2nd would overwrite
  // the 1st's doc + orphan its slots (silent appointment loss). Bare `BA-${ts}`
  // was the lone unsuffixed be_appointments id writer.
  const _baTs = Date.now();
  const _baBuf = new Uint8Array(4);
  globalThis.crypto.getRandomValues(_baBuf);
  const appointmentId = `BA-${_baTs}-${Array.from(_baBuf, (b) => b.toString(16).padStart(2, '0')).join('')}`;
  const now = new Date().toISOString();
  // Strip the gate flag so it never leaks into the persisted doc.
  const { skipServerCollisionCheck: _stripGate, ...persistData } = data || {};
  // Phase 29.23-bis5 (2026-05-14) — auto-stamp branchId via the canonical
  // _resolveBranchIdForWrite helper. PRE-bis5 BUG: confirmCreateNoDeposit /
  // confirmCreateDeposit passed `branchId: selectedBranchId || ''` from the
  // form; when selectedBranchId was unresolved at write time (e.g. early
  // mount, race with BranchContext), the be_appointments doc was written
  // with `branchId: ''` (or missing entirely after spread quirks). Result:
  // ORPHAN appointments invisible in branch-scoped UI but still triggering
  // AP1_COLLISION via the allBranches:true collision scan — admin saw
  // "sync ล้มเหลว" with no visible conflicting appointment. Diagnosed via
  // Rule R admin-SDK probe 2026-05-14 (BA-1778770705076 incident).
  // Fix: force-resolve via _resolveBranchIdForWrite before write. Same
  // helper used by all branch-scoped writers (BSA writers Task 1-2).
  const resolvedBranchId = _resolveBranchIdForWrite(persistData);
  if (resolvedBranchId && persistData.branchId !== resolvedBranchId) {
    // Log when we had to backfill — helps identify callers that aren't
    // stamping branchId explicitly. Non-blocking.
    if (!persistData.branchId) {
      console.warn(`[createBackendAppointment] auto-stamping branchId=${resolvedBranchId} (caller did not provide). appointmentId=${appointmentId}`);
    }
  }
  // V128 — write-chokepoint: denorm the linked customer's phone (mirror V108).
  const _v128CustomerPhone = await _resolveAppointmentCustomerPhone(persistData);
  const apptPayload = {
    appointmentId,
    ...persistData,
    // V128 — linked customer's phone (apptPhoneValue reads customerPhone first).
    // Writers historically sent only customerPhoneTemp (pick-later) → linked appts
    // blank in the hover card + search + print. Resolved from be_customers when
    // caller-empty ('' for pick-later w/o customerId → customerPhoneTemp fallback).
    customerPhone: _v128CustomerPhone,
    // OVERWRITE branchId (after spread) so any caller-passed empty string
    // gets replaced with the resolved value. Falls back to null only if
    // resolveSelectedBranchId() also returns falsy — that case fails the
    // explicit-branchId invariant added below.
    branchId: resolvedBranchId || persistData.branchId || '',
    // Task 10 (LINE OA Appointment Reminder, 2026-05-15) — write
    // notifyChannel + notifyMeta on the appointment doc so the cron
    // pipeline (line-reminder-fire) can pick up reminder-eligible appts
    // by reading these fields. notifyChannel is the array of channels
    // the user confirmed at modal-submit time (auto-ticked when LINE is
    // linked at this branch + not opted-out + not stale). notifyMeta is
    // the per-appt cron bookkeeping shape (sentDayBefore / sentDayOf /
    // lastPostbackAction / lastPostbackAt). LR-4 / LR-5 invariants.
    notifyChannel: Array.isArray(persistData.notifyChannel)
      ? persistData.notifyChannel
      : [],
    notifyMeta: persistData.notifyMeta || {
      sentDayBefore: null,
      sentDayOf: null,
      lastPostbackAction: null,
      lastPostbackAt: null,
    },
    createdAt: now,
    updatedAt: now,
  };

  // AP1-bis (2026-05-04): atomic MULTI-slot guard via runTransaction. Each
  // appointment reserves one slot doc per 15-min interval it covers — so
  // 09:00-10:00 reserves [09:00, 09:15, 09:30, 09:45]. Range-overlap
  // collisions (different startTimes, overlapping ranges) collide on the
  // shared interval slot and Firestore's optimistic-lock semantics retry
  // until one wins.
  //
  // Falls back to plain setDoc when slot keys cannot be built (legacy
  // imports / open-ended appointments without time fields).
  // appointment-loop R2 (2026-06-03) — guard BOTH the doctor AND the room slot
  // namespaces (was doctor-only → two different doctors could double-book the
  // same physical room; reproduced on real prod).
  const slotKeys = data?.skipServerCollisionCheck
    ? []
    : buildAppointmentGuardKeys({
        date: targetDate,
        doctorId: targetDoctorId,
        roomId: data?.roomId || '',
        startTime: targetStart,
        endTime: targetEnd,
      });

  if (slotKeys.length > 0) {
    const slotRefs = slotKeys.map((k) => appointmentSlotDoc(k));
    try {
      await runTransaction(db, async (tx) => {
        // Read all slot docs first (Firestore tx requires reads before writes).
        const snaps = await Promise.all(slotRefs.map((ref) => tx.get(ref)));
        // appointment-loop R8 (2026-06-03) — an occupied slot only COLLIDES if its
        // parent appointment is actually LIVE. A slot whose parent is cancelled or
        // deleted is a STALE ORPHAN (a concurrent cancel racing a time-change edit
        // leaves the new-time slot behind, CONF-1) → treat it as FREE so the
        // booking succeeds + the orphan is overwritten (auto-heal). Pre-R8 the
        // guard keyed only on slotData.cancelled, so an orphan blocked that
        // doctor's time FOREVER with NO visible conflicting appointment.
        const occupied = [];
        for (let i = 0; i < snaps.length; i++) {
          if (!snaps[i].exists()) continue;
          const slotData = snaps[i].data() || {};
          if (slotData.cancelled) continue;
          occupied.push({ i, ownerId: String(slotData.appointmentId || '') });
        }
        const ownerSnaps = await Promise.all(occupied.map((o) =>
          o.ownerId ? tx.get(appointmentDoc(o.ownerId)) : Promise.resolve(null)));
        for (let j = 0; j < occupied.length; j++) {
          const os = ownerSnaps[j];
          const live = os && os.exists() && (os.data()?.status !== 'cancelled');
          if (!live) continue;   // orphan slot (parent cancelled/missing) → free
          const err = new Error(
            `AP1_COLLISION: slot ${slotKeys[occupied[j].i]} already taken by ${occupied[j].ownerId || '(unknown)'}`,
          );
          err.code = 'AP1_COLLISION';
          err.slotKey = slotKeys[occupied[j].i];
          err.atomic = true;
          throw err;
        }
        // No collision — reserve every interval slot + write the appointment.
        for (let i = 0; i < slotRefs.length; i++) {
          tx.set(slotRefs[i], {
            slotId: slotKeys[i],
            appointmentId,
            date: targetDate,
            doctorId: targetDoctorId,
            startTime: targetStart,
            endTime: targetEnd,
            cancelled: false,
            takenAt: now,
          });
        }
        tx.set(appointmentDoc(appointmentId), apptPayload);
      });
    } catch (e) {
      if (e?.code === 'AP1_COLLISION') throw e;
      throw e;
    }
  } else {
    // Legacy path: no slot keys (missing time fields) — plain setDoc.
    await setDoc(appointmentDoc(appointmentId), apptPayload);
  }

  return { appointmentId, success: true };
}

/**
 * AP1 helper — clear the slot reservation(s) when an appointment is deleted
 * or status='cancelled'. Best-effort: failures don't roll back the parent
 * mutation (the slot doc is a guard, not a financial record).
 *
 * AP1-bis (2026-05-04): releases the FULL ARRAY of 15-min interval slot docs
 * an appointment occupied (e.g. 09:00-10:00 → [09:00, 09:15, 09:30, 09:45]).
 * Falls back to the legacy single-key delete when the multi-slot key array
 * is empty (defensive — covers legacy data created before V15 #14).
 *
 * Caller passes the appointment payload (date/doctorId/startTime/endTime
 * needed to rebuild the deterministic keys).
 */
async function _releaseAppointmentSlot(apptData) {
  const date = normalizeApptDate(apptData?.date);
  const doctorId = String(apptData?.doctorId || apptData?.doctor?.id || '').trim();
  const roomId = String(apptData?.roomId || '').trim();
  const startTime = String(apptData?.startTime || '').trim();
  const endTime = String(apptData?.endTime || apptData?.startTime || '').trim();

  // AP1-bis: prefer multi-slot release (V15 #14+ data). appointment-loop R2 —
  // release the ROOM slots too (createBackendAppointment now reserves them).
  const slotKeys = buildAppointmentGuardKeys({ date, doctorId, roomId, startTime, endTime });

  if (slotKeys.length > 0) {
    try {
      const batch = writeBatch(db);
      for (const key of slotKeys) {
        batch.delete(appointmentSlotDoc(key));
      }
      await batch.commit();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[AP1] multi-slot release failed:', slotKeys.join(','), e?.message || e);
    }
  }

  // Legacy single-key release (V15 #12/#13 data) — safe even when slotKeys
  // already covered the floor key, because deleteDoc is idempotent.
  const legacyKey = buildAppointmentSlotKey({ date, doctorId, startTime, endTime });
  if (legacyKey && !slotKeys.includes(legacyKey)) {
    try {
      await deleteDoc(appointmentSlotDoc(legacyKey));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[AP1] legacy slot release failed:', legacyKey, e?.message || e);
    }
  }
}

/**
 * Update an existing appointment.
 *
 * AP1 slot reservation maintenance:
 *   - When the time fields (date / doctorId / startTime / endTime) change,
 *     the OLD slot docs are released so the slots become available again, and
 *     NEW slot docs are reserved (best-effort; the read-then-update in this
 *     path doesn't run inside a transaction — caller relies on the same
 *     pre-write soft check via UI for range overlaps).
 *   - When status flips to 'cancelled', the slots are released so the time
 *     becomes bookable again.
 *
 * AP1-bis (2026-05-04): operates on the ARRAY of 15-min interval slot keys
 * via buildAppointmentSlotKeys. Slot rotation uses writeBatch for atomicity
 * within the slot collection (still NOT a single transaction with the
 * appointment doc — see AP1 module comment for trade-off rationale).
 */
export async function updateBackendAppointment(appointmentId, data) {
  // Pre-read the current appointment to detect time-field changes + capture
  // the OLD slot keys for cleanup. Defensive: if the read fails (network),
  // skip slot maintenance and fall through to the bare update — slot
  // staleness is preferable to losing the appointment update.
  let oldData = null;
  try {
    const snap = await getDoc(appointmentDoc(appointmentId));
    if (snap.exists()) oldData = snap.data();
  } catch { /* best-effort */ }

  // V128 — write-chokepoint (mirror V108/V112): denorm the linked customer's
  // phone when the doc has none. Writers never sent customerPhone (only
  // customerPhoneTemp for pick-later) → linked appts blank in the hover card.
  // Resolve from be_customers ONLY when BOTH the caller patch AND the existing
  // doc lack a phone + customerId is resolvable. Resolved '' → field untouched
  // (never clobber). Non-fatal.
  let _v128UpdPhone = '';
  try {
    const cid = (data && data.customerId) || (oldData && oldData.customerId) || '';
    const callerPhone = (data && typeof data.customerPhone === 'string') ? data.customerPhone.trim() : '';
    const existingPhone = (oldData && typeof oldData.customerPhone === 'string') ? oldData.customerPhone.trim() : '';
    if (cid && !callerPhone && !existingPhone) {
      _v128UpdPhone = await _resolveAppointmentCustomerPhone({ customerId: cid });
    }
  } catch { /* non-fatal */ }

  // V139 (2026-05-31) — couple status ↔ serviceCompletedAt so the today sub-tab
  // follows the status dropdown from ANY surface (Frontend modal, Backend appt
  // tab). The tab filter is unchanged (serviceCompletedAt is the SSOT); we only
  // reconcile serviceCompletedAt when an explicit status crosses the done
  // boundary. Non-fatal — never block the appointment update.
  let _v139Sync = {};
  try {
    const _v139Decision = decideApptStatusServiceSync(data && data.status, oldData && oldData.serviceCompletedAt);
    if (_v139Decision === 'stamp') _v139Sync = { serviceCompletedAt: serverTimestamp(), wasServiceCompleted: true };
    else if (_v139Decision === 'clear') _v139Sync = { serviceCompletedAt: null, serviceCompletedBy: '' };
  } catch { /* non-fatal */ }

  await updateDoc(appointmentDoc(appointmentId), {
    ...data,
    ...(_v128UpdPhone ? { customerPhone: _v128UpdPhone } : {}),
    ..._v139Sync,
    updatedAt: new Date().toISOString(),
  });

  // Slot maintenance — fire-and-forget after the write commits.
  if (oldData) {
    const merged = { ...oldData, ...data };
    const oldDate = normalizeApptDate(oldData.date);
    const oldDoctorId = String(oldData.doctorId || oldData.doctor?.id || '').trim();
    const oldRoomId = String(oldData.roomId || '').trim();
    const oldStart = String(oldData.startTime || '').trim();
    const oldEnd = String(oldData.endTime || oldData.startTime || '').trim();
    const newDate = normalizeApptDate(merged.date);
    const newDoctorId = String(merged.doctorId || merged.doctor?.id || '').trim();
    const newRoomId = String(merged.roomId || '').trim();
    const newStart = String(merged.startTime || '').trim();
    const newEnd = String(merged.endTime || merged.startTime || '').trim();

    // appointment-loop R2 — guard keys span BOTH doctor + room namespaces.
    const oldKeys = buildAppointmentGuardKeys({
      date: oldDate, doctorId: oldDoctorId, roomId: oldRoomId, startTime: oldStart, endTime: oldEnd,
    });
    const newKeys = buildAppointmentGuardKeys({
      date: newDate, doctorId: newDoctorId, roomId: newRoomId, startTime: newStart, endTime: newEnd,
    });

    const becameCancelled = data?.status === 'cancelled' && oldData.status !== 'cancelled';
    // appointment-loop R2 (C) — un-cancel (cancelled → any non-cancelled status)
    // must RE-RESERVE the slots the cancel released, else the reactivated appt
    // holds NO slot doc → its time is unguarded → double-bookable (reproduced on
    // real prod: scripts/diag-appointment-room-uncancel-probe.mjs C.2).
    const becameUncancelled = oldData.status === 'cancelled'
      && typeof data?.status === 'string' && data.status && data.status !== 'cancelled';
    // Compare arrays as sorted JSON to detect ANY change (covers different
    // length OR same length different values OR same values different order).
    const oldKeySig = [...oldKeys].sort().join('|');
    const newKeySig = [...newKeys].sort().join('|');
    // appointment-loop R7 (2026-06-03) — the guard key-set changed. Pre-R7 this
    // ALSO required newKeys.length>0, so clearing the doctor (→ ไม่ระบุ) on a
    // roomless appt (newKeys empty) SKIPPED the release → the old doctor's slot
    // docs ORPHANED → that doctor's date+time was falsely blocked forever
    // ("ghost collision": a later booking throws AP1_COLLISION with no visible
    // conflicting appt). Now release on ANY key-set change, even to empty.
    const keysChanged = oldKeySig !== newKeySig;

    const now = new Date().toISOString();

    // appointment-loop R5 (2026-06-03) — re-reserve slots best-effort but NEVER
    // HIJACK a slot held by a DIFFERENT live appointment. The pre-R5 blind
    // writeBatch.set (timeChanged + becameUncancelled) overwrote whatever was
    // there → if another booking took the slot during the cancelled window
    // (un-cancel) OR an edit moved onto a taken slot (timeChanged), the OTHER
    // appointment's slot doc was silently overwritten = slot-doc corruption +
    // a re-created double-booking (found by the R5 convergence sweep). A
    // runTransaction reads each slot first + sets ONLY when it is free / already
    // ours / cancelled. Best-effort (runs AFTER the appointment doc already
    // committed; a skipped slot is surfaced by the soft collision scan on the
    // next booking, but the other appt's reservation is NEVER corrupted).
    const _reserveSlotsConditional = async (keys, meta) => {
      if (!keys || keys.length === 0) return;
      try {
        await runTransaction(db, async (tx) => {
          const refs = keys.map((k) => appointmentSlotDoc(k));
          const snaps = await Promise.all(refs.map((r) => tx.get(r)));
          // appointment-loop R8 — a slot held by a DIFFERENT appt is a real
          // conflict (don't hijack, R5) ONLY if that appt is LIVE. If the holder
          // is cancelled/deleted (a stale orphan), overwrite it (auto-heal).
          const otherHeld = [];
          for (let i = 0; i < refs.length; i++) {
            const sd = snaps[i].exists() ? (snaps[i].data() || {}) : null;
            if (sd && !sd.cancelled && sd.appointmentId && sd.appointmentId !== meta.appointmentId) {
              otherHeld.push({ i, ownerId: String(sd.appointmentId) });
            }
          }
          const ownerSnaps = await Promise.all(otherHeld.map((o) => tx.get(appointmentDoc(o.ownerId))));
          const liveBlocked = new Set();
          for (let j = 0; j < otherHeld.length; j++) {
            const os = ownerSnaps[j];
            if (os && os.exists() && os.data()?.status !== 'cancelled') liveBlocked.add(otherHeld[j].i);
          }
          for (let i = 0; i < refs.length; i++) {
            if (liveBlocked.has(i)) continue;   // held by a different LIVE appt → never hijack
            tx.set(refs[i], { slotId: keys[i], ...meta });
          }
        });
      } catch { /* best-effort — slots heal on next create at this slot */ }
    };

    if (becameCancelled && oldKeys.length > 0) {
      try {
        const batch = writeBatch(db);
        for (const key of oldKeys) batch.delete(appointmentSlotDoc(key));
        await batch.commit();
      } catch { /* best-effort */ }
    } else if (keysChanged) {
      // Release old slots, reserve new. NOT atomic with the appointment doc
      // update above (same trade-off as create's pre-write scan). R7: the
      // release runs even when newKeys is empty (doctor/room cleared) so the
      // old slots are never orphaned; the conditional reserve no-ops on [].
      try {
        if (oldKeys.length > 0) {
          const releaseBatch = writeBatch(db);
          for (const key of oldKeys) releaseBatch.delete(appointmentSlotDoc(key));
          await releaseBatch.commit();
        }
      } catch { /* noop */ }
      // appointment-loop R5 — conditional reserve (no hijack); see helper above.
      await _reserveSlotsConditional(newKeys, {
        appointmentId, date: newDate, doctorId: newDoctorId,
        startTime: newStart, endTime: newEnd, cancelled: false, takenAt: now,
      });
    } else if (becameUncancelled && newKeys.length > 0) {
      // appointment-loop R2 (C) — RE-RESERVE the slots the cancel released so the
      // reactivated appointment is guarded again. appointment-loop R5 — conditional
      // (no hijack): if another booking took the slot during the cancelled window,
      // do NOT overwrite it (would corrupt that appt + re-create a double-booking).
      await _reserveSlotsConditional(newKeys, {
        appointmentId, date: newDate, doctorId: newDoctorId,
        startTime: newStart, endTime: newEnd, cancelled: false, takenAt: now,
      });
    }

    // appointment-loop R10 (2026-06-03) — reconcile THIS appt's slot docs to its
    // CURRENT authoritative keys, closing the concurrent-same-appt-edit GHOST
    // COLLISION (C1). The slot maintenance above is best-effort, post-commit, and
    // computes keys from a pre-read snapshot — so two admins editing the SAME appt
    // to DIFFERENT times at once each reserve their own (stale) new slot, leaving a
    // PHANTOM slot at a time the appt no longer occupies. R8's orphan-heal can't
    // free it (the owner appt is LIVE at the winning time) and the soft scan can't
    // see it → a permanent INVISIBLE over-block of that 15-min slot. Re-read the
    // appt for its authoritative keys, then release any slot STAMPED to this appt
    // that is NOT a current key. Gated to slot-affecting edits (note-only edits
    // stay cheap). Best-effort (a leftover phantom is the next reconcile's job).
    if (keysChanged || becameCancelled || becameUncancelled) {
      try {
        const fresh = await getDoc(appointmentDoc(appointmentId));
        if (fresh.exists()) {
          const fa = fresh.data() || {};
          const freshKeys = (fa.status === 'cancelled') ? [] : buildAppointmentGuardKeys({
            date: normalizeApptDate(fa.date), doctorId: fa.doctorId, roomId: fa.roomId,
            startTime: fa.startTime, endTime: fa.endTime,
          });
          const curSet = new Set(freshKeys);
          const stamped = await getDocs(query(appointmentSlotsCol(), where('appointmentId', '==', appointmentId)));
          const stale = stamped.docs.filter((d) => !curSet.has(d.id));
          if (stale.length > 0) {
            await runTransaction(db, async (tx) => {
              const reads = await Promise.all(stale.map((d) => tx.get(d.ref)));
              for (let i = 0; i < reads.length; i++) {
                const sd = reads[i].exists() ? (reads[i].data() || {}) : null;
                // release ONLY if still stamped to us AND still not a current key
                if (sd && String(sd.appointmentId) === String(appointmentId) && !curSet.has(stale[i].id)) {
                  tx.delete(stale[i].ref);
                }
              }
            });
          }
        }
      } catch { /* best-effort — a leftover phantom is the next reconcile's job */ }
    }
  }

  return { success: true };
}

// V71 (2026-05-15) — Mark appointment as service-completed on today's tab.
// Writes ONE forensic-stamped field pair + serverTimestamp. No branch-scope
// (doc id is the key). Caller passes Firebase Auth uid for serviceCompletedBy
// (empty string allowed for admin-SDK paths).
export async function markAppointmentServiceCompleted(apptId, uid) {
  if (!apptId || typeof apptId !== 'string') {
    throw new Error('V71_MARK_SERVICE_COMPLETED_REQUIRES_APPT_ID');
  }
  await updateDoc(appointmentDoc(apptId), {
    // V139 (2026-05-31) — couple status to the service-completed stamp so the
    // badge shows "เสร็จแล้ว" and a modal/Backend reader sees status==='done'.
    status: 'done',
    serviceCompletedAt: serverTimestamp(),
    serviceCompletedBy: typeof uid === 'string' ? uid : '',
    // V71.B-bis (2026-05-18) — persistent flag survives unmark cycles. Lets
    // admin toggle mark-complete ↔ un-mark unlimited times even when the
    // treatment-link reader (`apptDateTreatments[0]`) becomes stale or empty
    // (date-mismatch between appt.date and treatment.detail.treatmentDate is
    // a known fragility). Cleared NEVER once true — once an appt was service-
    // completed, the toggle button stays available forever.
    wasServiceCompleted: true,
  });
}

// V71.A (2026-05-15) — symmetric un-mark for the "↩ กลับไปคิวรอ" button.
// Clears the serviceCompletedAt/By stamps so the row moves back into the
// "กำลังรอ" sub-pill. Used when admin pressed mark-complete by mistake.
// Truthy filter treats null as falsy = waiting, so null is the correct
// clear-value (not deleteField — keeps the field readable for downstream
// listeners that may inspect the absence vs explicit-null distinction).
export async function unmarkAppointmentServiceCompleted(apptId) {
  if (!apptId || typeof apptId !== 'string') {
    throw new Error('V71_UNMARK_SERVICE_COMPLETED_REQUIRES_APPT_ID');
  }
  await updateDoc(appointmentDoc(apptId), {
    // V139 (2026-05-31) — couple status back to "ยืนยันแล้ว" so the card returns
    // to "กำลังรอ" AND the mark-complete button (gated on status==='confirmed')
    // reappears (pre-V139 it could stay 'done' → button vanished).
    status: 'confirmed',
    serviceCompletedAt: null,
    serviceCompletedBy: '',
  });
}

/**
 * Delete an appointment + release its AP1 slot reservation.
 * Slot release is best-effort; appointment deletion is the source of truth.
 */
export async function deleteBackendAppointment(appointmentId) {
  // Capture the appointment payload BEFORE deletion so we can rebuild the
  // deterministic slot key for cleanup.
  let apptData = null;
  try {
    const snap = await getDoc(appointmentDoc(appointmentId));
    if (snap.exists()) apptData = snap.data();
  } catch { /* best-effort */ }

  await deleteDoc(appointmentDoc(appointmentId));

  if (apptData) {
    await _releaseAppointmentSlot(apptData);
  }
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

/**
 * Get all appointments for a month (YYYY-MM).
 *
 * Phase BS (2026-05-06) — branch-scoped read.
 * Same `{branchId, allBranches}` opts contract as `getAllSales` —
 * see that function's JSDoc for filter semantics. Legacy callers
 * (no opts) get unfiltered global behavior.
 */
export async function getAppointmentsByMonth(yearMonth, opts = {}) {
  const { branchId, allBranches = false } = opts || {};
  // V54 (BS-13, 2026-05-08) — safe-by-default: when caller-supplied branchId
  // is falsy AND allBranches !== true, resolve via resolveSelectedBranchId();
  // if STILL falsy → return empty (NEVER fall back to whole-collection).
  // Mirrors listenToScheduleByDay safe template. Closes V54 AdminDashboard
  // cross-branch leak (admin's Frontend queue calendar pre-V54 saw all
  // branches because empty {} opts → useFilter=false → whole collection).
  const effectiveBranchId = (typeof branchId === 'string' && branchId)
    ? branchId
    : (allBranches ? null : resolveSelectedBranchId());
  if (!effectiveBranchId && !allBranches) return {};
  const useFilter = !allBranches && effectiveBranchId;
  const ref = useFilter
    ? query(appointmentsCol(), where('branchId', '==', String(effectiveBranchId)))
    : appointmentsCol();
  const snap = await getDocs(ref);
  const all = snap.docs.map(d => ({ ...d.data(), id: d.id }));
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

/**
 * V64 (2026-05-08) — Get appointments by inclusive date range.
 *
 * Mirrors V54 (BS-13) safe-by-default pattern used by
 * `getAppointmentsByMonth`: when caller-supplied `branchId` is falsy AND
 * `allBranches !== true`, resolve via `resolveSelectedBranchId()`; if STILL
 * falsy → return [] (NEVER fall back to whole-collection). This closes the
 * cross-branch leak class that V54 documented for the AdminDashboard
 * Frontend queue calendar pre-V54.
 *
 * Returns: array of `{ id, ...data }` ordered by Firestore (caller may sort).
 *
 * @param {Object} opts
 * @param {string} opts.from         — inclusive YYYY-MM-DD lower bound
 * @param {string} opts.to           — inclusive YYYY-MM-DD upper bound
 * @param {string} [opts.branchId]   — explicit branch override
 * @param {boolean} [opts.allBranches] — opt-out of branch filter (cross-branch read)
 */
export async function getAppointmentsByDateRange({ from, to, branchId = '', allBranches = false } = {}) {
  if (!from || !to) {
    throw new Error('getAppointmentsByDateRange: from and to are required (YYYY-MM-DD).');
  }
  // V54 (BS-13) — safe-by-default: see getAppointmentsByMonth comment.
  const effectiveBranchId = (typeof branchId === 'string' && branchId)
    ? branchId
    : (allBranches ? null : resolveSelectedBranchId());
  if (!effectiveBranchId && !allBranches) return [];
  const useFilter = !allBranches && effectiveBranchId;

  // V64-fix (2026-05-09 — root-cause): mirror getAppointmentsByMonth pattern.
  // Server-side filter ONLY by branchId (single-field equality — uses
  // existing single-field index). Date range applied CLIENT-SIDE via
  // normalizeApptDate so heterogeneous stored shapes (string YYYY-MM-DD,
  // ISO with time, Timestamp) all resolve correctly.
  //
  // Pre-fix bug: composite query (where(branchId,==) + where(date,>=) +
  // where(date,<=)) requires a Firestore composite index that wasn't
  // deployed. Query errored silently → View catch handler set appts=[]
  // → user saw all-zero counts despite real prod data existing.
  const ref = useFilter
    ? query(appointmentsCol(), where('branchId', '==', String(effectiveBranchId)))
    : appointmentsCol();
  const snap = await getDocs(ref);
  return snap.docs
    .map(d => ({ ...d.data(), id: d.id }))
    .filter(a => {
      const iso = normalizeApptDate(a.date);
      if (!iso) return false;
      return iso >= String(from) && iso <= String(to);
    })
    .map(a => ({ ...a, date: normalizeApptDate(a.date) })); // normalize outbound shape
}

/** Get all appointments for a customer */
export async function getCustomerAppointments(customerId) {
  const q = query(appointmentsCol(), where('customerId', '==', String(customerId)));
  const snap = await getDocs(q);
  const appts = snap.docs.map(d => ({ ...d.data(), id: d.id }));
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
    const appts = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    appts.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    onChange(appts);
  }, onError);
}

/** Get all appointments for a specific date (YYYY-MM-DD).
 *
 * Client-side filter via normalizeApptDate to tolerate drifted date formats
 * (timestamps, trailing whitespace, Firestore Timestamp values). Without
 * this, Firestore where('date','==',x) misses docs that the month-level
 * bubble counts include — producing "bubble says 1 but day is empty".
 *
 * Phase BS (2026-05-06) — branch-scoped read. Same `{branchId, allBranches}`
 * opts contract as `getAllSales`. Branch filter is composed with the
 * existing client-side date-normalization (server-side filter on
 * branchId stays compatible because branchId is a top-level string field).
 */
export async function getAppointmentsByDate(dateStr, opts = {}) {
  const target = normalizeApptDate(dateStr);
  if (!target) return [];
  const { branchId, allBranches = false } = opts || {};
  // V54 (BS-13) — safe-by-default; see getAppointmentsByMonth comment.
  const effectiveBranchId = (typeof branchId === 'string' && branchId)
    ? branchId
    : (allBranches ? null : resolveSelectedBranchId());
  if (!effectiveBranchId && !allBranches) return [];
  const useFilter = !allBranches && effectiveBranchId;
  const ref = useFilter
    ? query(appointmentsCol(), where('branchId', '==', String(effectiveBranchId)))
    : appointmentsCol();
  const snap = await getDocs(ref);
  const appts = snap.docs
    .map(d => ({ ...d.data(), id: d.id }))
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
export function listenToAppointmentsByDate(dateStr, optsOrCallback, onChangeOrError, maybeOnError) {
  // Phase BS regression-fix (2026-05-06) — third positional arg promoted
  // to opts {branchId, allBranches}. Backward-compat: legacy callers pass
  // (dateStr, onChange, onError) and get unfiltered behavior. New callers
  // pass (dateStr, {branchId, allBranches}, onChange, onError) for
  // branch-scoped real-time updates.
  let opts = {};
  let onChange;
  let onError;
  if (typeof optsOrCallback === 'function') {
    onChange = optsOrCallback;
    onError = onChangeOrError;
  } else {
    opts = optsOrCallback || {};
    onChange = onChangeOrError;
    onError = maybeOnError;
  }
  const target = normalizeApptDate(dateStr);
  if (!target) {
    onChange?.([]);
    return () => {};
  }
  const { branchId, allBranches = false } = opts || {};
  // V54 (BS-13) — safe-by-default; mirrors listenToScheduleByDay pattern.
  const effectiveBranchId = (typeof branchId === 'string' && branchId)
    ? branchId
    : (allBranches ? null : resolveSelectedBranchId());
  if (!effectiveBranchId && !allBranches) {
    onChange?.([]);
    return () => {};
  }
  const useFilter = !allBranches && effectiveBranchId;
  const q = useFilter
    ? query(appointmentsCol(), where('branchId', '==', String(effectiveBranchId)))
    : appointmentsCol();
  return onSnapshot(q, (snap) => {
    const appts = snap.docs
      .map(d => ({ ...d.data(), id: d.id }))
      .filter(a => normalizeApptDate(a.date) === target)
      .map(a => ({ ...a, date: target }));
    appts.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
    onChange(appts);
  }, onError);
}

/**
 * Real-time listener variant of `getAppointmentsByMonth`. Returns a flat
 * array of all appointments in the given YYYY-MM month, sorted by
 * (date, startTime). Mirrors getAppointmentsByMonth's filtering but emits
 * an array instead of the grouped {[date]: appts[]} shape — flat array is
 * what AdminDashboard's queue calendar consumes (replaces pc_appointments
 * onSnapshot per Phase 20.0 Flow A).
 *
 * Phase 20.0 Task 1 (2026-05-06) — closes the AdminDashboard ProClinic
 * dependency on `pc_appointments/{YYYY-MM}` getDoc + brokerClient sync.
 * be_appointments is the canonical source after Phase 19.0 + Phase 20.0
 * migration.
 *
 * Branch-scope (per Layer 1 + Layer 2): caller can pass
 * `{branchId, allBranches}` opts. scopedDataLayer wrapper auto-injects
 * the resolved selectedBranchId. Default-deny shape: opts={}, allBranches
 * absent → cross-branch read (preserves existing AdminDashboard semantics
 * which never had a branch concept; future Phase 20.0 Task 6 BranchSelector
 * will switch to branch-scoped via the scopedDataLayer wrapper).
 *
 * @param {string} yearMonth — 'YYYY-MM'
 * @param {object|function} [optsOrCallback] — opts {branchId, allBranches}
 *   OR onChange callback (legacy positional)
 * @param {function} [onChangeOrError]
 * @param {function} [maybeOnError]
 * @returns {() => void} unsubscribe
 */
export function listenToAppointmentsByMonth(yearMonth, optsOrCallback, onChangeOrError, maybeOnError) {
  // Mirror listenToAppointmentsByDate signature handling.
  let opts = {};
  let onChange;
  let onError;
  if (typeof optsOrCallback === 'function') {
    onChange = optsOrCallback;
    onError = onChangeOrError;
  } else {
    opts = optsOrCallback || {};
    onChange = onChangeOrError;
    onError = maybeOnError;
  }
  const target = String(yearMonth || '').slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(target)) {
    onChange?.([]);
    return () => {};
  }
  const { branchId, allBranches = false } = opts || {};
  // V54 (BS-13) — safe-by-default; AdminDashboard pre-V54 leak fix.
  const effectiveBranchId = (typeof branchId === 'string' && branchId)
    ? branchId
    : (allBranches ? null : resolveSelectedBranchId());
  if (!effectiveBranchId && !allBranches) {
    onChange?.([]);
    return () => {};
  }
  const useFilter = !allBranches && effectiveBranchId;
  const q = useFilter
    ? query(appointmentsCol(), where('branchId', '==', String(effectiveBranchId)))
    : appointmentsCol();
  return onSnapshot(q, (snap) => {
    const all = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    const filtered = all
      .map(a => {
        const iso = normalizeApptDate(a.date);
        if (!iso || iso.slice(0, 7) !== target) return null;
        return { ...a, date: iso };
      })
      .filter(Boolean);
    filtered.sort((a, b) => {
      const byDate = (a.date || '').localeCompare(b.date || '');
      if (byDate !== 0) return byDate;
      return (a.startTime || '').localeCompare(b.startTime || '');
    });
    onChange(filtered);
  }, onError);
}

// ───────────────────────────────────────────────────────────────────────
// V73 Task 2 (2026-05-16) — Staff Chat raw wrappers. Branch-scoped per BSA.
// safe-by-default pattern (mirror V54 BS-13).
// ───────────────────────────────────────────────────────────────────────
function staffChatCol() {
  return collection(db, `artifacts/${appId}/public/data/be_staff_chat_messages`);
}
function staffChatMessageDoc(messageId) {
  return doc(db, `artifacts/${appId}/public/data/be_staff_chat_messages/${messageId}`);
}

export function listenToStaffChatMessages({ branchId, allBranches = false, limitCount = 50 } = {}, onChange, onError) {
  const effectiveBranchId = (typeof branchId === 'string' && branchId)
    ? branchId
    : (allBranches ? null : resolveSelectedBranchId());
  if (!effectiveBranchId && !allBranches) {
    onChange?.([]);
    return () => {};
  }
  const baseQuery = effectiveBranchId
    ? query(staffChatCol(), where('branchId', '==', String(effectiveBranchId)), orderBy('createdAt', 'desc'), limit(limitCount))
    : query(staffChatCol(), orderBy('createdAt', 'desc'), limit(limitCount));
  return onSnapshot(baseQuery, (snap) => {
    const docs = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    onChange?.(docs.reverse());  // chronological for display
  }, (err) => onError?.(err));
}

export async function addStaffChatMessage(messageDoc) {
  if (!messageDoc.id || !messageDoc.branchId) throw new Error('STAFF_CHAT_MISSING_REQUIRED_FIELDS');
  await setDoc(staffChatMessageDoc(messageDoc.id), messageDoc);
  // V73 BSA Rule L lock: messageDoc.branchId is stamped by useStaffChat hook
  // bound to selectedBranchId — verified by branch-collection-coverage BC2.direct.
  return messageDoc.id;
}

// (2026-06-03 EOD+4 — D, AV188) Sweep ONLY the per-message Storage folder (no doc
// delete). Extracted from deleteStaffChatMessage (Rule of 3) so the SEND path can
// clean orphans at the source: the pipeline mints messageId → uploads to
// staff-chat-attachments/{branchId}/{messageId}/ → THEN creates the doc; a partial
// upload failure (message never sent) OR a doc-create failure AFTER the upload
// leaves blobs under {messageId}/ with no message doc → orphan until the 30-day
// retention sweep. Best-effort (no folder = text-only / bundled sticker → fine).
export async function deleteStaffChatAttachmentFolder(branchId, messageId) {
  if (!branchId || !messageId) return;
  try {
    const prefix = storagePrefixForMessage(branchId, messageId).replace(/\/$/, '');
    const listing = await listAll(storageRef(getStorage(), prefix));
    await Promise.all(listing.items.map((it) => deleteObject(it).catch(() => {})));
  } catch { /* no folder (text-only / bundled sticker) — fine */ }
}

// (2026-05-26) Feature 3 Unsend — hard-delete a staff-chat message: sweep its
// Storage folder (attachments / custom sticker) THEN delete the Firestore doc.
// Own-only is enforced UI-side (deviceId); the rule permits clinic-staff.
export async function deleteStaffChatMessage(branchId, messageId) {
  if (!branchId || !messageId) throw new Error('STAFF_CHAT_DELETE_ARGS');
  await deleteStaffChatAttachmentFolder(branchId, messageId);
  await deleteDoc(staffChatMessageDoc(messageId));
}

// V76 (2026-05-16 EOD+1) — listenToChatHistoryByBranch (BSA Layer 1 safe-by-default).
// Sibling of listenToChatConversationsByBranch — V75 missed this READER causing
// chat_history view to leak across branches (3,281 legacy docs unstamped). Class-
// of-bug V12 multi-reader-sweep — V75 fixed live conversations only.
// AV59 enforces chat_history writer-side branchId stamp; BS-17 extended to include
// chat_history reader path via Layer 2 scopedDataLayer wrapper.
export function listenToChatHistoryByBranch({ branchId, allBranches = false, limitN = 200 } = {}, onChange, onError) {
  const effectiveBranchId = (typeof branchId === 'string' && branchId)
    ? branchId
    : (allBranches ? null : '');
  if (!effectiveBranchId && !allBranches) {
    if (typeof onChange === 'function') onChange([]);
    return () => {};
  }
  const col = collection(db, `artifacts/${appId}/public/data/chat_history`);
  const constraints = [];
  if (!allBranches && effectiveBranchId) {
    constraints.push(where('branchId', '==', String(effectiveBranchId)));
  }
  constraints.push(orderBy('resolvedAt', 'desc'));
  if (typeof limitN === 'number' && limitN > 0) {
    constraints.push(limit(limitN));
  }
  const q = query(col, ...constraints);
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map(d => ({ ...d.data(), id: d.id }));
      if (typeof onChange === 'function') onChange(list);
    },
    (err) => { if (typeof onError === 'function') onError(err); }
  );
}

// V75 Item 3 — listenToChatConversationsByBranch (BSA Layer 1 safe-by-default).
// Branch-scoped chat_conversations listener; empty branchId + !allBranches →
// onChange([]) + noop unsub (never falls back to whole-collection query unless
// allBranches:true explicit). Mirrors listenToStaffChatMessages safe template.
// AV57 enforces webhook write-side branchId stamp; BS-16 enforces UI readers
// go through scopedDataLayer wrapper (Layer 2 — auto-injects resolveSelectedBranchId).
export function listenToChatConversationsByBranch({ branchId, allBranches = false } = {}, onChange, onError) {
  const effectiveBranchId = (typeof branchId === 'string' && branchId)
    ? branchId
    : (allBranches ? null : '');
  if (!effectiveBranchId && !allBranches) {
    if (typeof onChange === 'function') onChange([]);
    return () => {};
  }
  const col = collection(db, `artifacts/${appId}/public/data/chat_conversations`);
  const constraints = [];
  if (!allBranches && effectiveBranchId) {
    constraints.push(where('branchId', '==', String(effectiveBranchId)));
  }
  constraints.push(orderBy('lastMessageAt', 'desc'));
  const q = query(col, ...constraints);
  return onSnapshot(
    q,
    (snap) => {
      // V38 spread-order safe: doc.id wins over any stray data.id field.
      const list = snap.docs.map(d => ({ ...d.data(), id: d.id }));
      if (typeof onChange === 'function') onChange(list);
    },
    (err) => { if (typeof onError === 'function') onError(err); }
  );
}

// ─── Tablet Chart Editor (2026-05-20) — pairing presence + session relay ───
// Branch-scoped, BS-13 safe-by-default (mirror listenToChatConversationsByBranch).
// Both PC + tablet are clinic staff (Q2) → collections gated by isClinicStaff
// (firestore.rules, Task 9). The final chart is NEVER written here — the tablet's
// result flows back into the TFP charts[] via the PC merge (Q1); images travel
// through Storage, not the doc (Q5). Heartbeats use client Date.now() (consistent
// with the session-hook heartbeats + no serverTimestamp null-blip flickering the
// PC ready-list every 10s). Doc/Col accessors follow the file convention (xDoc/xCol).
const chartTabletPresenceCol = () => collection(db, `artifacts/${appId}/public/data/be_chart_tablet_presence`);
const chartTabletPresenceDoc = (deviceId) => doc(db, `artifacts/${appId}/public/data/be_chart_tablet_presence`, deviceId);
const chartEditSessionCol = () => collection(db, `artifacts/${appId}/public/data/be_chart_edit_sessions`);
const chartEditSessionDoc = (sessionId) => doc(db, `artifacts/${appId}/public/data/be_chart_edit_sessions`, sessionId);

export function listenToChartTabletPresenceByBranch({ branchId, allBranches = false } = {}, onChange, onError) {
  const effectiveBranchId = (typeof branchId === 'string' && branchId)
    ? branchId
    : (allBranches ? null : '');
  if (!effectiveBranchId && !allBranches) {
    if (typeof onChange === 'function') onChange([]);
    return () => {};
  }
  const constraints = [];
  if (!allBranches && effectiveBranchId) constraints.push(where('branchId', '==', String(effectiveBranchId)));
  const q = query(chartTabletPresenceCol(), ...constraints);
  return onSnapshot(
    q,
    (snap) => { if (typeof onChange === 'function') onChange(snap.docs.map(d => ({ ...d.data(), id: d.id }))); },
    (err) => { if (typeof onError === 'function') onError(err); }
  );
}

// Instant-pop trigger: the single 'requested' session aimed at THIS tablet.
// Composite index (branchId + tabletDeviceId + status) declared in firestore.indexes.json (Task 9).
export function listenToRequestedSessionForTablet({ branchId, tabletDeviceId } = {}, onChange, onError) {
  const effectiveBranchId = (typeof branchId === 'string' && branchId) ? branchId : '';
  if (!effectiveBranchId || !tabletDeviceId) {
    if (typeof onChange === 'function') onChange(null);
    return () => {};
  }
  const q = query(chartEditSessionCol(),
    where('branchId', '==', String(effectiveBranchId)),
    where('tabletDeviceId', '==', String(tabletDeviceId)),
    where('status', '==', 'requested'));
  return onSnapshot(
    q,
    (snap) => {
      if (typeof onChange !== 'function') return;
      if (!snap.docs.length) { onChange(null); return; }
      // No orderBy on the query (composite index is branchId+tabletDeviceId+status only),
      // so pick the NEWEST 'requested' client-side. Guards against a stale 'requested'
      // session (rare, but the TX guard isn't the only path) being opened instead of the
      // PC's just-created one — which would leave the PC waiting on a session the tablet
      // never touches.
      const newest = snap.docs.map(d => ({ ...d.data(), id: d.id }))
        .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))[0];
      onChange(newest);
    },
    (err) => { if (typeof onError === 'function') onError(err); }
  );
}

export function listenToChartEditSession(sessionId, onChange, onError) {
  return onSnapshot(
    chartEditSessionDoc(sessionId),
    (snap) => { if (typeof onChange === 'function') onChange(snap.exists() ? { ...snap.data(), id: snap.id } : null); },
    (err) => { if (typeof onError === 'function') onError(err); }
  );
}

export async function upsertChartTabletPresence(deviceId, { deviceName, branchId, uid, byName, status } = {}) {
  const bid = (typeof branchId === 'string' && branchId) ? branchId : resolveSelectedBranchId();
  await setDoc(chartTabletPresenceDoc(deviceId), { ...buildPresenceUpsert({ deviceId, deviceName, branchId: bid, uid, byName, status }), updatedAt: serverTimestamp() }, { merge: true });
}

// TX guard: only create when the target tablet is genuinely idle+fresh → prevents 2 PCs driving one tablet.
export async function createChartEditSession(payload) {
  const bid = (typeof payload.branchId === 'string' && payload.branchId) ? payload.branchId : resolveSelectedBranchId();
  const presRef = chartTabletPresenceDoc(payload.tabletDeviceId);
  await runTransaction(db, async (tx) => {
    const pres = await tx.get(presRef);
    const data = pres.exists() ? pres.data() : null;
    // Distinguish genuinely-busy (in a session) from offline/stale (tab backgrounded,
    // screen asleep, disconnected) so the PC shows an accurate reason.
    if (data && data.status === 'busy') { const e = new Error('TABLET_BUSY'); e.code = 'TABLET_BUSY'; throw e; }
    if (!isPresenceReady(data, Date.now())) { const e = new Error('TABLET_OFFLINE'); e.code = 'TABLET_OFFLINE'; throw e; }
    tx.set(presRef, { status: 'busy', updatedAt: serverTimestamp() }, { merge: true });
    tx.set(chartEditSessionDoc(payload.sessionId), { ...buildSessionCreate({ ...payload, branchId: bid }), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  });
}

export async function updateChartEditSession(sessionId, patch) {
  await updateDoc(chartEditSessionDoc(sessionId), { ...patch, updatedAt: serverTimestamp() });
}

export async function freeChartTablet(deviceId) {
  await setDoc(chartTabletPresenceDoc(deviceId), { status: 'idle', updatedAt: serverTimestamp() }, { merge: true });
}

export async function deleteChartEditSession(sessionId) {
  await deleteDoc(chartEditSessionDoc(sessionId));
}

// V43-followup (2026-05-19 NIGHT+5 EOD+1) — BS-18 listener safe-by-default
// for be_products. Mirror of V54/BS-13 + V75/BS-16 pattern. Powers live
// hide-from-balance behavior when admin toggles skipStockDeduction.
//
// Caller passes {} → resolveSelectedBranchId() injected at Layer 2 (scopedDataLayer).
// Caller passes {allBranches:true} → cross-branch read for reports.
// Caller passes {branchId:'BR-X'} → explicit branch override.
// No branch resolvable AND !allBranches → emit [] + noop unsub (safe).
export function listenToProducts({ branchId, allBranches = false } = {}, onChange, onError) {
  const effectiveBranchId = (typeof branchId === 'string' && branchId)
    ? branchId
    : (allBranches ? null : '');
  if (!effectiveBranchId && !allBranches) {
    if (typeof onChange === 'function') onChange([]);
    return () => {};
  }
  const col = collection(db, `artifacts/${appId}/public/data/be_products`);
  const constraints = [];
  if (!allBranches && effectiveBranchId) {
    constraints.push(where('branchId', '==', String(effectiveBranchId)));
  }
  const q = query(col, ...constraints);
  return onSnapshot(
    q,
    (snap) => {
      // V38 spread-order safe: doc.id wins over any stray data.id field.
      const list = snap.docs.map(d => ({ ...d.data(), id: d.id }));
      if (typeof onChange === 'function') onChange(list);
    },
    (err) => { if (typeof onError === 'function') onError(err); }
  );
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
      deposits = snap.docs.map(d => ({ ...d.data(), id: d.id }));
      depositsReady = true;
      emit();
    },
    onError,
  );
  const unsubWallets = onSnapshot(
    query(walletsCol(), where('customerId', '==', cid)),
    (snap) => {
      wallets = snap.docs.map(d => ({ ...d.data(), id: d.id }));
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
      const list = snap.docs.map(d => ({ ...d.data(), id: d.id }));
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
 *  (applyDepositToSale, deductWallet, earnPoints, etc.).
 *
 *  V102 (2026-05-19 LATE+2) — branchId STAMPED via `_resolveBranchIdForWrite`
 *  to bring createBackendSale in line with the 24 sibling writers
 *  (saveProduct, saveCourse, savePromotion, createDeposit,
 *  createBackendAppointment, createRecall, etc. — graphify EXTRACTED edges
 *  confirm). Pre-V102: createBackendSale was the ONLY primary writer
 *  that never adopted Phase BS V2/V3 branchId stamping. Result: every
 *  auto-sale created from TFP handleSubmit produced `branchId=(none)` →
 *  invisible in per-branch SaleTab (BSA `where('branchId','==', selectedBranchId)`
 *  query). User-reported (วันเพ็ญ LC-26000078, real prod, 2026-05-19 LATE+2):
 *  "ใบเสร็จในหน้าใบขายก็ไม่ไปสร้าง". Diag found 3 of 3 audited sales
 *  linked to current treatments had `branchId=(none)`. */
/** V108 (followup to V105; Rule O / V102 resolve-at-writer lineage) — resolve
 *  sale customerName/HN from the AUTHORITATIVE be_customers doc when the caller
 *  passes empty. Root cause: every createBackendSale caller (TFP auto-sale ×2,
 *  CustomerDetailView ×3, SaleTab form, online-sale) derives customerName from
 *  props/state that can be empty even when the customer doc resolves fine —
 *  V105's TFP fix read `{patientData}` PROP, not the doc, so customers whose
 *  prop was empty (e.g. LC-26000074 → INV-20260520-0010) wrote empty name → "-".
 *  One write-chokepoint guard protects ALL callers. Idempotent + non-fatal:
 *  a missing/unreadable customer leaves values as-is. AV100 locks this. */
async function _resolveSaleCustomerIdentity(data) {
  let customerName = (data && typeof data.customerName === 'string') ? data.customerName.trim() : '';
  let customerHN = (data && typeof data.customerHN === 'string') ? data.customerHN.trim() : '';
  const cid = data && data.customerId;
  if (cid && (!customerName || !customerHN)) {
    try {
      const snap = await getDoc(customerDoc(cid));
      if (snap.exists()) {
        const c = snap.data();
        if (!customerName) customerName = resolveCustomerDisplayName(c);
        if (!customerHN) customerHN = resolveCustomerHN(c);
      }
    } catch { /* non-fatal — leave as-is */ }
  }
  return { customerName: customerName || '', customerHN: customerHN || '' };
}

/** V130 (2026-05-28) — capture the TRUE acting user at sale-write (ผู้ทำรายการ).
 *  Mirror of _resolveSaleCustomerIdentity (V108) at the createBackendSale
 *  chokepoint so ALL callers (TFP auto-sale ×2, CustomerDetailView ×3,
 *  SaleTab form, online-sale) get it from one guard. Resolves the logged-in
 *  staff via `be_staff WHERE firebaseUid == uid` (the listenToUserPermissions
 *  pattern) — be_staff doc IDs are staffId (STF-XXX); the auth uid lives in
 *  the `firebaseUid` field. createdBySource is an honesty tag so a real
 *  capture is distinguishable from a backfilled guess (V129-followup / V113
 *  spirit). Non-fatal: any failure → empty → the report falls back to the
 *  first seller at read time. AV149 locks this. */
async function _resolveSaleCreatedBy(data) {
  // 1) explicit caller override wins verbatim (e.g. attribute to a specific actor).
  const explicitId   = data && typeof data.createdById   === 'string' ? data.createdById.trim()   : '';
  const explicitName = data && typeof data.createdByName === 'string' ? data.createdByName.trim() : '';
  if (explicitId || explicitName) {
    return { createdById: explicitId, createdByName: explicitName, createdBySource: data.createdBySource || 'caller' };
  }
  try {
    const u = auth?.currentUser;
    if (!u || !u.uid) return { createdById: '', createdByName: '', createdBySource: 'none' };
    // 2) staff doc by firebaseUid (NOT by doc id — V30 lesson).
    const snap = await getDocs(query(staffCol(), where('firebaseUid', '==', u.uid), limit(1)));
    const d = snap.docs[0];
    if (d) {
      const s = d.data() || {};
      return { createdById: d.id, createdByName: (s.name || '').trim(), createdBySource: 'staff' };
    }
    // 3) signed-in but not a be_staff member (owner gmail / non-staff admin).
    return { createdById: '', createdByName: (u.displayName || u.email || '').trim(), createdBySource: 'auth' };
  } catch {
    // 4) no user / unreadable → empty; report falls back to first seller.
    return { createdById: '', createdByName: '', createdBySource: 'none' };
  }
}

export async function createBackendSale(data) {
  const saleId = await generateInvoiceNumber();
  const now = new Date().toISOString();
  // Check if doc already exists (safety net against race conditions)
  const existing = await getDoc(saleDoc(saleId));
  const finalId = existing.exists() ? `${saleId}-${Date.now().toString(36)}` : saleId;
  // V108: resolve customer name/HN from be_customers when caller passes empty.
  // Set AFTER the _normalizeSaleData spread so resolved values win.
  const _ident = await _resolveSaleCustomerIdentity(data);
  const _creator = await _resolveSaleCreatedBy(data); // V130
  await setDoc(saleDoc(finalId), {
    saleId: finalId,
    branchId: _resolveBranchIdForWrite(data), // V102
    ..._normalizeSaleData(data),
    customerName: _ident.customerName, // V108
    customerHN: _ident.customerHN,     // V108
    createdById: _creator.createdById,         // V130 — true creator (staffId)
    createdByName: _creator.createdByName,     // V130 — resolved name snapshot
    createdBySource: _creator.createdBySource, // V130 — 'staff'|'auth'|'none'|'caller'
    status: data.status || 'active',
    createdAt: now,
    updatedAt: now,
  });
  return { saleId: finalId, success: true };
}

/** Update an existing sale.
 *  V102 — branchId preserved on update: when caller explicitly passes
 *  `data.branchId`, that takes precedence; otherwise leaves existing
 *  branchId intact (no resolveSelectedBranchId fallback here because
 *  update flows can legitimately run from cross-branch admin actions
 *  like report-side reconciliation). New writes flow through
 *  createBackendSale which stamps unconditionally. */
export async function updateBackendSale(saleId, data) {
  const patch = { ..._normalizeSaleData(data), updatedAt: new Date().toISOString() };
  // V102 — defensive branchId handling: only patch when explicit non-empty
  // string; otherwise REMOVE from patch so existing top-level branchId
  // stays intact. Without this delete, empty/undefined `data.branchId`
  // smuggled through the _normalizeSaleData spread would clobber a
  // correctly-stamped sale. Test V102.F6 locks this contract.
  if (data && typeof data.branchId === 'string' && data.branchId.trim()) {
    patch.branchId = data.branchId;
  } else {
    delete patch.branchId;
  }
  // V112 (2026-05-23 EOD+1 LATE+1) — chokepoint extension of V108
  // _resolveSaleCustomerIdentity to the update path. User report (INV-
  // 20260520-0010): receipt printed "—" under ลูกค้า even though the
  // sale's customerId resolves cleanly to a real customer doc. V108
  // closed the CREATE chokepoint but updateBackendSale was the missing
  // V12 multi-writer-sweep instance — SaleTab edit form passes
  // {customerName, customerHN} verbatim from React state, JSON-roundtrip
  // `clean()` preserves empty strings (does NOT drop them), and updateDoc
  // overwrites with empty. Fix: when the patch carries empty
  // customerName/HN AND a customerId is available (in patch OR in
  // existing doc), resolve from be_customers and stamp the resolved
  // value on the patch (resolved wins over empty). Symmetric with V108
  // create chokepoint. Defensive (try/catch swallow) — a missing or
  // unreadable customer leaves values as-is (V108 contract preserved).
  // AV112 locks this. Note: we resolve only when the caller-side value
  // is empty — non-empty caller values are PRESERVED verbatim (admin
  // explicit rename of receipt-side display name still works).
  await _resolveSaleCustomerForUpdate(saleId, data, patch);
  await updateDoc(saleDoc(saleId), patch);
  return { success: true };
}

/** V112 helper — defensive resolver for updateBackendSale.
 *
 * Decides whether to STAMP customerName/HN onto the update patch:
 *   1. If `data.customerName` is non-empty → trust caller, no resolution.
 *   2. If `data.customerName` is empty AND a customerId is available
 *      (either in `data.customerId` OR on the existing sale doc) AND
 *      the be_customers doc resolves → stamp resolved name on patch.
 *   3. If `data.customerName` is empty AND no customerId is resolvable
 *      → REMOVE customerName from patch entirely (preserve existing
 *      doc value via updateDoc no-op semantic; matches V102 branchId
 *      pattern). Without this, an empty string in patch would CLOBBER
 *      the existing name on disk.
 * Same logic for customerHN.
 *
 * Idempotent + non-fatal: if anything fails, the patch is left as-is
 * and updateDoc proceeds. V108's contract preserved.
 */
async function _resolveSaleCustomerForUpdate(saleId, data, patch) {
  try {
    const callerName = (data && typeof data.customerName === 'string') ? data.customerName.trim() : '';
    const callerHN = (data && typeof data.customerHN === 'string') ? data.customerHN.trim() : '';
    // Fast path: both non-empty → trust caller verbatim.
    if (callerName && callerHN) return;
    // Resolve customerId: caller's patch OR existing doc.
    let cid = data && data.customerId;
    if (!cid) {
      try {
        const existingSnap = await getDoc(saleDoc(saleId));
        if (existingSnap.exists()) cid = existingSnap.data().customerId;
      } catch { /* non-fatal */ }
    }
    if (cid) {
      try {
        const custSnap = await getDoc(customerDoc(cid));
        if (custSnap.exists()) {
          const c = custSnap.data();
          if (!callerName) {
            const resolved = resolveCustomerDisplayName(c);
            if (resolved) patch.customerName = resolved;
            else delete patch.customerName; // leave existing intact
          }
          if (!callerHN) {
            const resolved = resolveCustomerHN(c);
            if (resolved) patch.customerHN = resolved;
            else delete patch.customerHN;
          }
          return;
        }
      } catch { /* non-fatal */ }
    }
    // No customerId resolvable OR customer doc missing: don't clobber
    // existing values with empties — DELETE empty fields from patch so
    // updateDoc preserves on-disk state.
    if (!callerName) delete patch.customerName;
    if (!callerHN) delete patch.customerHN;
  } catch { /* non-fatal — leave patch as caller submitted */ }
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

/**
 * Get all sales (sorted by date desc).
 *
 * Phase BS (2026-05-06) — branch-scoped read.
 *   - `branchId` (opt): when provided AND `allBranches !== true`, applies
 *     server-side `where('branchId', '==', branchId)` so only the current
 *     branch's sales transit the wire.
 *   - `allBranches` (opt, default false): explicit override for cross-branch
 *     reports / aggregators that intentionally span branches. When true,
 *     branchId is ignored and all docs returned.
 *   - No opts (legacy callers) → no filter applied; preserves pre-Phase-BS
 *     behavior so aggregators that haven't been updated still receive
 *     global rows.
 */
export async function getAllSales(opts = {}) {
  const { branchId, allBranches = false } = opts || {};
  const useFilter = branchId && !allBranches;
  const ref = useFilter
    ? query(salesCol(), where('branchId', '==', String(branchId)))
    : salesCol();
  const snap = await getDocs(ref);
  const sales = snap.docs.map(d => ({ ...d.data(), id: d.id }));
  // Sort by createdAt (has time) desc — latest first
  sales.sort((a, b) => (b.createdAt || b.saleDate || '').localeCompare(a.createdAt || a.saleDate || ''));
  return sales;
}

/** Get all sales for a customer */
export async function getCustomerSales(customerId) {
  const q = query(salesCol(), where('customerId', '==', String(customerId)));
  const snap = await getDocs(q);
  const sales = snap.docs.map(d => ({ ...d.data(), id: d.id }));
  sales.sort((a, b) => (b.createdAt || b.saleDate || '').localeCompare(a.createdAt || a.saleDate || ''));
  return sales;
}

/**
 * Real-time listener variant of `getAllSales`, **bounded by date floor** to
 * keep payload + listener cost reasonable. Returns unsubscribe.
 * Phase 14.7.H follow-up H (2026-04-26).
 *
 * Why bounded: the entire `be_sales` collection grows unboundedly (clinics ship
 * 1k-10k+ sales/year). An unfiltered onSnapshot would attach a listener over
 * every doc and re-emit on every write. The `since` filter caps the working
 * set to a date window the consumer actually renders.
 *
 * SaleTab + SaleInsuranceClaimsTab DELIBERATELY keep one-shot `getAllSales()`
 * for now because their UX shows full history with manual reload. This listener
 * is the canonical pattern for **future** real-time dashboards (today's sales
 * widget, live revenue counter, etc.).
 *
 * @param {{since?: string}} [opts] — `since`: ISO date string (YYYY-MM-DD).
 *   Defaults to ~365 days ago in Bangkok TZ. Filters `saleDate >= since`.
 * @param {(sales: Array) => void} onChange
 * @param {(err: Error) => void} [onError]
 * @returns {() => void} unsubscribe
 */
export function listenToAllSales(opts, onChange, onError) {
  // Phase BS regression-fix (2026-05-06) — opts now also accepts
  // {branchId, allBranches} for branch-scoped real-time updates.
  // Backward-compat: legacy callers pass {since} only and get unfiltered
  // behavior across branches. New callers pass branchId for soft-gate.
  // 365 days ago (Bangkok TZ via thaiTodayISO arithmetic at call time)
  const defaultSince = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 365);
    return d.toISOString().slice(0, 10);
  })();
  const since = (opts && typeof opts.since === 'string' && opts.since) || defaultSince;
  const branchId = opts && opts.branchId;
  const allBranches = !!(opts && opts.allBranches);
  const useFilter = branchId && !allBranches;
  // Compose where clauses: saleDate range always; branchId only if scoped.
  const q = useFilter
    ? query(salesCol(), where('saleDate', '>=', since), where('branchId', '==', String(branchId)))
    : query(salesCol(), where('saleDate', '>=', since));
  return onSnapshot(q, (snap) => {
    const sales = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    sales.sort((a, b) => (b.createdAt || b.saleDate || '').localeCompare(a.createdAt || a.saleDate || ''));
    onChange(sales);
  }, onError);
}

/**
 * Live trigger listener over be_treatments (2026-05-27 — appointment-page live
 * cross-device). Mirrors loadTreatmentsByDateRange (reportsLoaders.js) —
 * whole-collection read + client-filter (there's no server range index on
 * detail.treatmentDate; same cost as the existing one-shot getter). Used by the
 * appointment page as a CHANGE SIGNAL: any treatment create/edit/delete fires
 * this → caller bumps a refresh tick → loadAll re-fetches. allBranches:true
 * mirrors the appointment page's loadAll (V64-fix6 cross-branch auto-confirm).
 * Returns unsubscribe.
 *
 * audit-branch-scope: report — supports {allBranches:true}; safe-by-default
 * (BS-13) for the branch-scoped path.
 */
export function listenToTreatmentsByDateRange(opts, onChange, onError) {
  const { from = '', to = '', includeCancelled = false } = opts || {};
  const allBranches = !!(opts && opts.allBranches);
  const explicitBranch = (opts && typeof opts.branchId === 'string' && opts.branchId) ? opts.branchId : '';
  const effectiveBranchId = explicitBranch || (allBranches ? '' : resolveSelectedBranchId());
  // Safe-by-default (BS-13): branch-scoped intent but no resolvable branch → no-op empty.
  if (!allBranches && !effectiveBranchId) { onChange?.([]); return () => {}; }
  return onSnapshot(treatmentsCol(), (snap) => {
    let items = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    if (from) items = items.filter((t) => (t?.detail?.treatmentDate || '') >= from);
    if (to) items = items.filter((t) => (t?.detail?.treatmentDate || '') <= to);
    if (!allBranches && effectiveBranchId) items = items.filter((t) => t.branchId === effectiveBranchId);
    if (!includeCancelled) items = items.filter((t) => t?.detail?.status !== 'cancelled');
    onChange?.(items);
  }, onError);
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
    const sales = snap.docs.map(d => ({ ...d.data(), id: d.id }));
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
  return { ...d.data(), id: d.id };
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
  const { parseQtyString } = await import('./courseUtils.js');
  // V148 — atomic (concurrent course-remove↔use lost-update guard). Sale doc
  // read above stays outside the tx (reference data); the customer read+write
  // is serialized via runTransaction.
  return runTransaction(db, async (tx) => {
  const _ref = customerDoc(customerId);
  const custSnap = await tx.get(_ref);
  if (!custSnap.exists()) return { removedCount: 0, keptUsedCount: 0 };
  const current = custSnap.data().courses || [];
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
    tx.update(_ref, { courses: next });
  }
  return { removedCount, keptUsedCount };
  }); // V148 — end atomic course removal
}

/**
 * Phase 16.5-ter (2026-04-29) — flip course status on every course linked
 * to a cancelled sale (NOT remove). Replaces `removeLinkedSaleCourses` for
 * the new sale-cancel cascade.
 *
 * - kind='refund' (refundMethod ≠ 'ไม่คืนเงิน') → status='คืนเงิน'
 * - kind='cancel' (refundMethod = 'ไม่คืนเงิน')   → status='ยกเลิก'
 *
 * Used + unused courses BOTH flip (per user directive: "Flip status ทั้งหมด").
 * Writes one `be_course_changes` audit entry per affected course.
 *
 * Idempotent: courses already in terminal state (refunded/cancelled) are
 * skipped — re-running is safe.
 *
 * @param {string} saleId
 * @param {'refund'|'cancel'} kind
 * @param {object} [opts] — { reason, actor, staffId, staffName }
 * @returns {Promise<{flippedCount, customerId, targetStatus}>}
 */
export async function applySaleCancelToCourses(saleId, kind, opts = {}) {
  if (!['refund', 'cancel'].includes(kind)) throw new Error('kind must be refund|cancel');
  const targetStatus = kind === 'refund' ? 'คืนเงิน' : 'ยกเลิก';
  const saleSnap = await getDoc(saleDoc(saleId));
  if (!saleSnap.exists()) throw new Error('Sale not found');
  const customerId = String(saleSnap.data().customerId || '');
  if (!customerId) return { flippedCount: 0, customerId: '', targetStatus };
  const { buildChangeAuditEntry } = await import('./courseExchange.js');
  const stamp = new Date().toISOString();
  // V148 — atomic (concurrent sale-cancel cascade ↔ course-use lost-update guard).
  // Customer read+write + audit sets all in one runTransaction (was getDoc +
  // writeBatch = read-modify-write without re-check). Sale doc read stays above.
  return runTransaction(db, async (tx) => {
  const _cref = customerDoc(customerId);
  const custSnap = await tx.get(_cref);
  if (!custSnap.exists()) return { flippedCount: 0, customerId, targetStatus };
  const current = custSnap.data().courses || [];
  const flippedIndices = [];
  const next = current.map((c, i) => {
    if (String(c.linkedSaleId || '') !== String(saleId)) return c;
    if (c.status === 'คืนเงิน' || c.status === 'ยกเลิก') return c; // idempotent skip
    flippedIndices.push(i);
    // Phase 16.5-quater — also persist staff on the course (cascade source)
    return {
      ...c,
      status: targetStatus,
      staffId: String(opts.staffId || ''),
      staffName: String(opts.staffName || ''),
      ...(kind === 'refund'
        ? { refundedAt: stamp, refundReason: String(opts.reason || '') }
        : { cancelledAt: stamp, cancelReason: String(opts.reason || '') }),
    };
  });

  if (flippedIndices.length === 0) return { flippedCount: 0, customerId, targetStatus };

  tx.update(_cref, { courses: next, updatedAt: stamp });
  for (const i of flippedIndices) {
    const audit = buildChangeAuditEntry({
      customerId,
      kind,
      fromCourse: current[i],
      toCourse: null,
      refundAmount: null,
      reason: opts.reason || `${kind === 'refund' ? 'คืนเงินจาก' : 'ยกเลิกจาก'}บิล ${saleId}`,
      actor: opts.actor || '',
      staffId: opts.staffId || '',
      staffName: opts.staffName || '',
    });
    tx.set(courseChangeDoc(audit.changeId), audit);
  }
  return { flippedCount: flippedIndices.length, customerId, targetStatus };
  }); // V148 — end atomic sale-cancel cascade
}

/** Cancel a sale with reason + refund tracking + staff identification */
export async function cancelBackendSale(saleId, reason, refundMethod, refundAmount, evidenceUrl, opts = {}) {
  await updateDoc(saleDoc(saleId), {
    status: 'cancelled',
    cancelled: {
      at: new Date().toISOString(),
      reason: reason || '',
      refundMethod: refundMethod || '',
      refundAmount: refundAmount || 0,
      evidenceUrl: evidenceUrl || null,
      // Phase 16.5-ter (2026-04-29) — staff identification (NAME, not raw id)
      // per user directive "ระวังเรื่องพนังงานเป็นตัวเลขไม่ใช่ text".
      staffId: String(opts.staffId || ''),
      staffName: String(opts.staffName || ''),
    },
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

// V50-followup (2026-05-08) — All master_data CRUD/read/sync/migrator/mapper
// helpers REMOVED. Per Rule H-bis, ProClinic dev-only sync infrastructure
// fully deleted. Use saveProduct / saveCourse / saveStaff / saveDoctor /
// saveDfGroup / saveBranch / etc. on be_* (canonical) directly.

// ─── Phase 12.11: be_* shape adapters ──────────────────────────────────────
// For types that now have a be_* canonical collection, map the be_* doc shape
// back to the legacy master_data shape callers expect (p.id / p.name / p.price
// / p.unit / p.type / p.category / p.category_name / p.status 1|0).
// Phase 16 will do the inverse refactor — rewire every caller to read be_*
// directly and drop these adapters.

// V49 (2026-05-08) — exported so scopedDataLayer.listProductsForPicker can
// auto-apply this canonical→legacy adapter for UI pickers that read legacy
// `{name, price, category, unit}` shape. Was private (V36 lesson — broken
// dynamic import resolved to undefined → silent identity pass-through). The
// V49 fix: export + ForPicker variant + AV27 audit invariant.
export function beProductToMasterShape(p) {
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
      // 2026-04-28: per-row "ไม่ตัดสต็อค" flag — propagated into every
      // downstream consumer (buildPurchasedCourseEntry → customerCourses
      // → selectedCourseItems → _normalizeStockItems → _deductOneItem).
      // Default false (= deduct stock normally).
      skipStockDeduction: !!c.skipStockDeduction,
    });
  }
  if (Array.isArray(c.courseProducts)) {
    for (const cp of c.courseProducts) {
      const pid = String(cp.productId || cp.id || '');
      // V45 (2026-05-08) — DEDUP-SHADOW FIX. When a sub-row has the same
      // productId as main, OR-merge the sub-row's per-row flags into the
      // already-pushed main entry BEFORE skipping. Pre-V45 the sub-row's
      // skipStockDeduction (or other per-row flags) was silently dropped
      // because main was inserted first with `skipStockDeduction: !!c.skipStockDeduction`
      // (top-level flag only). User-reported repro on "ขลิบไร้เลือด (เบอร์26)
      // 1 ครั้ง" — admin set top=false + sub-row=true; dedup dropped the
      // true → no skip movement → -1 + negative-overage. V45 OR-merge
      // preserves user intent.
      //
      // Pattern affects ALL courses where admin includes main as a sub-row
      // to set per-product overrides (14 courses on prod per V45 diag,
      // mostly the "ขลิบ" + "PRP" + "ปรึกษา" cluster). 3 consumers benefit
      // (TFP buy + SaleTab buy + QuotationFormModal) — single-source fix.
      if (pid && pid === mainId) {
        const mainEntry = products.find(p => p.isMainProduct && String(p.id) === mainId);
        if (mainEntry) {
          // OR-merge — any TRUE wins. skipStockDeduction is the user-reported
          // case; defensive on isHidden too (if admin marked sub.hidden=true,
          // main row should also be hidden from sale despite top-level being
          // visible — same intent semantic).
          if (cp.skipStockDeduction === true) mainEntry.skipStockDeduction = true;
          if (cp.isHidden === true) mainEntry.isHidden = true;
        }
        continue;
      }
      const enriched = productLookup?.get(pid) || {};
      products.push({
        id: pid,
        name: cp.productName || enriched.name || '',
        qty: Number(cp.qty) || 0,
        unit: cp.unit || enriched.unit || 'ครั้ง',
        skipStockDeduction: !!cp.skipStockDeduction,
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

// V49 (2026-05-08) — exported for scopedDataLayer.listPromotionsForPicker.
// Adds `price` field (legacy promotion picker readers expect `p.price` —
// e.g. QuotationFormModal pickPrice helper) — sourced from sale_price.
export function bePromotionToMasterShape(p) {
  return {
    ...p,
    id: p.promotionId || p.id,
    name: p.promotion_name || p.name || '',
    price: p.sale_price ?? p.price ?? null,
    sale_price_incl_vat: p.sale_price_incl_vat ?? null,
    category: p.category_name || p.category || '',
  };
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

// V50 (2026-05-08) — BE_BACKED_MASTER_TYPES + readBeForMasterType +
// getAllMasterDataItems + getBeBackedMasterTypes + clearMasterDataItems
// REMOVED. The dual-read shim (be_* first, master_data fallback) was the
// Phase 12.11 transition path; post-V50 strip every UI consumer reads be_*
// directly via scopedDataLayer.list*() (or *ForPicker variants per V49).
// The bePromotionToMasterShape / beCourseToMasterShape / etc. adapter
// functions above are still exported for *ForPicker variants — they
// translate canonical be_* shape to legacy {name, price, category, ...}
// shape that UI pickers expect (V49 lock).

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

// ─── Phase M9 (2026-04-26) — Customer Summary Reconciler ────────────────
// User directive (P3): "M9 customer doc summary drift — mitigated by tx-log;
// nightly reconciler implicit". This is the explicit reconciler.
//
// Recomputes denormalized summary fields on each customer doc from source
// ledgers (be_sales, be_treatments, be_deposits, be_customer_wallets).
// Fields recomputed:
//   - finance.depositBalance      — sum(active + partial deposits remainingAmount)
//   - finance.walletBalance       — sum(active wallets remainingAmount)
//   - stats.totalSpent            — sum(non-cancelled sales billing.netTotal)
//   - stats.lifetimeSales         — sum(non-cancelled sales billing.netTotal — same as totalSpent;
//                                       kept as separate field for backwards compat)
//   - stats.visitCount            — count(non-cancelled treatments)
//   - stats.lastVisitAt           — max(treatment.treatmentDate)
//   - stats.lastSaleAt            — max(sale.saleDate)
//   - stats.totalSales            — count(non-cancelled sales)
//   - stats.totalTreatments       — count(non-cancelled treatments)
//
// Pure, no side effects beyond the customer doc write. Safe to call any
// time. Idempotent (running twice produces the same result).

/**
 * Recompute all denormalized customer-summary fields from source ledgers.
 * Returns the computed summary object — caller can verify before writing
 * (pass `{ dryRun: true }` to skip the doc write).
 */
export async function recomputeCustomerSummary(customerId, opts = {}) {
  const cid = String(customerId || '').trim();
  if (!cid) throw new Error('customerId required');
  const dryRun = !!opts.dryRun;

  // Pull source ledgers in parallel (each is one query)
  const [salesSnap, treatmentsSnap, depositsSnap, walletsSnap] = await Promise.all([
    getDocs(query(salesCol(), where('customerId', '==', cid))),
    getDocs(query(treatmentsCol(), where('customerId', '==', cid))),
    getDocs(query(depositsCol(), where('customerId', '==', cid))),
    getDocs(query(walletsCol(), where('customerId', '==', cid))),
  ]);

  // Sales aggregates (skip cancelled per spec)
  let totalSpent = 0;
  let totalSales = 0;
  let lastSaleAt = '';
  salesSnap.docs.forEach((d) => {
    const s = d.data();
    if (s.status === 'cancelled') return;
    totalSales += 1;
    totalSpent += Number(s.billing?.netTotal) || 0;
    const dt = String(s.saleDate || '');
    if (dt > lastSaleAt) lastSaleAt = dt;
  });

  // Treatments aggregates (skip cancelled)
  let visitCount = 0;
  let totalTreatments = 0;
  let lastVisitAt = '';
  treatmentsSnap.docs.forEach((d) => {
    const t = d.data();
    if (t.status === 'cancelled') return;
    visitCount += 1;
    totalTreatments += 1;
    const dt = String(t.treatmentDate || '');
    if (dt > lastVisitAt) lastVisitAt = dt;
  });

  // Deposit balance (active + partial only)
  let depositBalance = 0;
  depositsSnap.docs.forEach((d) => {
    const x = d.data();
    if (x.status === 'active' || x.status === 'partial') {
      depositBalance += Number(x.remainingAmount) || 0;
    }
  });

  // Wallet balance (active only)
  let walletBalance = 0;
  walletsSnap.docs.forEach((d) => {
    const w = d.data();
    if (w.status === 'active') {
      walletBalance += Number(w.remainingAmount) || 0;
    }
  });

  const summary = {
    finance: {
      depositBalance,
      walletBalance,
    },
    stats: {
      totalSpent,
      lifetimeSales: totalSpent,
      totalSales,
      lastSaleAt,
      visitCount,
      totalTreatments,
      lastVisitAt,
    },
    reconciledAt: new Date().toISOString(),
  };

  if (!dryRun) {
    try {
      await updateDoc(customerDoc(cid), {
        'finance.depositBalance': summary.finance.depositBalance,
        'finance.walletBalance':  summary.finance.walletBalance,
        'stats.totalSpent':       summary.stats.totalSpent,
        'stats.lifetimeSales':    summary.stats.lifetimeSales,
        'stats.totalSales':       summary.stats.totalSales,
        'stats.lastSaleAt':       summary.stats.lastSaleAt,
        'stats.visitCount':       summary.stats.visitCount,
        'stats.totalTreatments':  summary.stats.totalTreatments,
        'stats.lastVisitAt':      summary.stats.lastVisitAt,
        'reconciledAt':           summary.reconciledAt,
      });
    } catch (err) {
      // Customer doc may not exist (test fixture, deleted, etc.) — surface
      // to caller for visibility but don't crash batch operations.
      throw new Error(`reconcile failed for ${cid}: ${err.message || err}`);
    }
  }

  return { customerId: cid, summary };
}

/**
 * Batch-reconcile every active customer. Yields progress via callback.
 * Returns { total, succeeded, failed: [{customerId, message}] }.
 *
 * Use case: nightly cron OR admin "recompute all summaries" button after
 * a bulk-import, manual Firestore edit, or schema migration where summary
 * drift is suspected.
 */
export async function reconcileAllCustomerSummaries({ onProgress } = {}) {
  const customers = await getAllCustomers();
  const total = customers.length;
  let succeeded = 0;
  const failed = [];
  for (let i = 0; i < customers.length; i += 1) {
    const c = customers[i];
    const cid = c.customerId || c.id;
    if (!cid) continue;
    try {
      await recomputeCustomerSummary(cid);
      succeeded += 1;
    } catch (err) {
      failed.push({ customerId: cid, message: err.message || String(err) });
    }
    if (typeof onProgress === 'function') {
      try { onProgress({ done: i + 1, total, customerId: cid, name: c.customerName || '' }); }
      catch { /* non-fatal */ }
    }
  }
  return { total, succeeded, failed };
}

// ─── Course Exchange + Refund (T4 / Phase 14.4 G5, 2026-04-26) ─────────────
// Atomic helpers that swap or refund a customer's course AND write the
// be_course_changes audit log entry in the same Firestore transaction.
// Pure shape transformations live in src/lib/courseExchange.js — these
// functions wire those into Firestore + audit log.

const courseChangesCol = () => collection(db, ...basePath(), 'be_course_changes');
// Phase 24.0 (2026-05-06) — collection accessors used by deleteCustomerCascade.
// be_link_requests: admin-mediated LINE-ID-link queue. Carries customerId on
//   approved-row docs.
// be_customer_link_tokens: one-time LINE link tokens (24h TTL) — V32-tris-quater
//   doc shape carries customerId at mint time. Client-blocked rule
//   (`read,write: if false`); admin SDK only at delete time.
const linkRequestsCol = () => collection(db, ...basePath(), 'be_link_requests');
const customerLinkTokensCol = () => collection(db, ...basePath(), 'be_customer_link_tokens');
const courseChangeDoc = (id) => doc(db, ...basePath(), 'be_course_changes', String(id));

/**
 * Execute a course exchange atomically.
 *
 *   1. Read customer doc inside transaction
 *   2. Compute next courses[] via applyCourseExchange
 *   3. Write next courses[] back
 *   4. Append be_course_changes audit entry
 *
 * @param {string} customerId
 * @param {string} fromCourseId - existing course in customer.courses[]
 * @param {object} newMasterCourse - master course shape from be_courses
 * @param {object} opts - { reason: string, actor: string }
 * @returns {Promise<{ changeId, fromCourse, newCourse }>}
 */
export async function exchangeCustomerCourse(customerId, fromCourseId, newMasterCourse, opts = {}) {
  const { applyCourseExchange, buildChangeAuditEntry } = await import('./courseExchange.js');

  return runTransaction(db, async (tx) => {
    const cRef = customerDoc(customerId);
    const cSnap = await tx.get(cRef);
    if (!cSnap.exists()) throw new Error('Customer not found');
    const customer = { id: cSnap.id, ...cSnap.data() };

    const { nextCourses, fromCourse, newCourse } = applyCourseExchange(
      customer, fromCourseId, newMasterCourse,
    );

    tx.update(cRef, { courses: nextCourses, updatedAt: new Date().toISOString() });

    const audit = buildChangeAuditEntry({
      customerId,
      kind: 'exchange',
      fromCourse,
      toCourse: newCourse,
      reason: opts.reason || '',
      actor: opts.actor || '',
    });
    tx.set(courseChangeDoc(audit.changeId), audit);

    return { changeId: audit.changeId, fromCourse, newCourse };
  });
}

/**
 * Refund a customer's course atomically.
 *
 *   1. Read customer doc
 *   2. Mark course as refunded (status: 'คืนเงิน', refundedAt, refundAmount)
 *   3. Write next courses[] back
 *   4. Append be_course_changes audit entry
 *
 * Does NOT auto-deduct customer.totalSpent — caller decides whether the
 * refund affects lifetime spend (refunds for canceled-but-not-used courses
 * may not reduce totalSpent depending on accounting policy).
 *
 * @param {string} customerId
 * @param {string} courseId
 * @param {number} refundAmount - non-negative
 * @param {object} opts - { reason: string, actor: string }
 * @returns {Promise<{ changeId, fromCourse, refundAmount }>}
 */
export async function refundCustomerCourse(customerId, courseId, refundAmount, opts = {}) {
  const { applyCourseRefund, buildChangeAuditEntry } = await import('./courseExchange.js');

  return runTransaction(db, async (tx) => {
    const cRef = customerDoc(customerId);
    const cSnap = await tx.get(cRef);
    if (!cSnap.exists()) throw new Error('Customer not found');
    const customer = { id: cSnap.id, ...cSnap.data() };

    const { nextCourses, fromCourse, refundAmount: refundedAmount } = applyCourseRefund(
      customer, courseId, refundAmount, {
        reason: opts.reason || '',
        courseIndex: opts.courseIndex,
        // Phase 16.5-quater — also persist staff on the course
        staffId: opts.staffId || '',
        staffName: opts.staffName || '',
      },
    );

    tx.update(cRef, { courses: nextCourses, updatedAt: new Date().toISOString() });

    const audit = buildChangeAuditEntry({
      customerId,
      kind: 'refund',
      fromCourse,
      toCourse: null,
      refundAmount: refundedAmount,
      reason: opts.reason || '',
      actor: opts.actor || '',
      staffId: opts.staffId || '',
      staffName: opts.staffName || '',
    });
    tx.set(courseChangeDoc(audit.changeId), audit);

    return { changeId: audit.changeId, fromCourse, refundAmount: refundedAmount };
  });
}

/**
 * Soft-cancel a customer's course (no money refund). Phase 16.5 (2026-04-29).
 *
 * Mirrors refundCustomerCourse architecture but uses applyCourseCancel +
 * kind='cancel'. Course stays in customer.courses[] with terminal status
 * 'ยกเลิก' (audit trail integrity — same rationale as refund).
 *
 * @param {string} customerId
 * @param {string} courseId
 * @param {string} reason - non-empty (UI requires it)
 * @param {object} opts - { actor: string }
 * @returns {Promise<{ changeId, fromCourse, cancelledAt }>}
 */
export async function cancelCustomerCourse(customerId, courseId, reason, opts = {}) {
  const { applyCourseCancel, buildChangeAuditEntry } = await import('./courseExchange.js');

  return runTransaction(db, async (tx) => {
    const cRef = customerDoc(customerId);
    const cSnap = await tx.get(cRef);
    if (!cSnap.exists()) throw new Error('Customer not found');
    const customer = { id: cSnap.id, ...cSnap.data() };

    const { nextCourses, fromCourse, cancelledAt } = applyCourseCancel(
      customer, courseId, {
        reason: reason || '',
        courseIndex: opts.courseIndex,
        // Phase 16.5-quater — also persist staff on the course
        staffId: opts.staffId || '',
        staffName: opts.staffName || '',
      },
    );

    tx.update(cRef, { courses: nextCourses, updatedAt: new Date().toISOString() });

    const audit = buildChangeAuditEntry({
      customerId,
      kind: 'cancel',
      fromCourse,
      toCourse: null,
      refundAmount: null,
      reason: reason || '',
      actor: opts.actor || '',
      staffId: opts.staffId || '',
      staffName: opts.staffName || '',
    });
    tx.set(courseChangeDoc(audit.changeId), audit);

    return { changeId: audit.changeId, fromCourse, cancelledAt };
  });
}

/** List be_course_changes audit entries for a customer (most recent first). */
export async function listCourseChanges(customerId) {
  const q = query(courseChangesCol(), where('customerId', '==', String(customerId)));
  const snap = await getDocs(q);
  const entries = snap.docs.map(d => d.data());
  entries.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return entries;
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
    customerNameTemp: data.customerNameTemp || '',
    customerPhoneTemp: data.customerPhoneTemp || '',
    purpose: data.purpose || '',
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
    // Phase BSA leak-sweep-2 (2026-05-04) — deposits are now branch-scoped
    // per user directive "ทำให้แถบมัดจำ แยกสาขากัน". Stamps current branch
    // at create time; immutable after (updateDeposit preserves it).
    branchId: _resolveBranchIdForWrite(data),
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(depositDoc(depositId), payload);
  // V-deposit-noappt (2026-05-27) — temp-customer (เลือกลูกค้าภายหลัง / no-appt)
  // deposits have customerId:''. Skip the meaningless balance recalc for an
  // empty customer (the pair path already creates customerId:'' deposits).
  if (payload.customerId) await recalcCustomerDepositBalance(payload.customerId);
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
  // Phase BSA leak-sweep-2 (2026-05-04) — branchId is immutable after create.
  // Deposit belongs to the branch that created it; admin can't reassign via
  // edit. (Same pattern as customer/sale/treatment branchId.)
  delete updates.branchId;
  await updateDoc(ref, updates);
  await recalcCustomerDepositBalance(current.customerId);
  return { success: true };
}

/** Cancel a deposit. Only allowed when no usage exists (usedAmount === 0). */
export async function cancelDeposit(depositId, { cancelNote = '', cancelEvidenceUrl = '' } = {}) {
  const ref = depositDoc(depositId);
  // V155 (Rule T): atomic — re-check usedAmount IN-tx so a cancel can't race an
  // applyDepositToSale (itself atomic) and wipe remaining on an in-flight apply.
  // Was getDoc→updateDoc.
  const customerId = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Deposit not found');
    const cur = snap.data();
    if ((Number(cur.usedAmount) || 0) > 0) {
      throw new Error('มัดจำถูกใช้ไปบางส่วนแล้ว ไม่สามารถยกเลิกได้ กรุณายกเลิกใบเสร็จที่ใช้มัดจำก่อน');
    }
    tx.update(ref, {
      status: 'cancelled',
      cancelNote,
      cancelEvidenceUrl,
      cancelledAt: new Date().toISOString(),
      remainingAmount: 0,
      updatedAt: new Date().toISOString(),
    });
    return cur.customerId;
  });
  await recalcCustomerDepositBalance(customerId);
  return { success: true };
}

/** Refund a deposit (partial or full). */
export async function refundDeposit(depositId, { refundAmount, refundChannel = '', refundDate = null, note = '' } = {}) {
  const amt = roundTHB(Number(refundAmount) || 0); // V156 (M12): round at money-write boundary
  if (amt <= 0) throw new Error('จำนวนคืนต้องมากกว่า 0');
  const ref = depositDoc(depositId);
  // V155 (Rule T): atomic RMW — re-read remaining/refundAmount IN-tx. Was
  // getDoc→updateDoc: two concurrent refunds (or a double-click) both read the
  // same `remaining`, both wrote from the stale base → last-write-wins → one
  // refund's record LOST → refundAmount understated the cash actually paid out
  // → deposit over-stated → re-spendable money (e2e-deposit-refund-atomicity R1).
  const out = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Deposit not found');
    const cur = snap.data();
    const remaining = Number(cur.remainingAmount) || 0;
    if (amt > remaining) throw new Error(`จำนวนคืนต้องไม่เกินยอดคงเหลือ (${remaining})`);
    const newRemaining = Math.max(0, remaining - amt);
    const fullRefund = newRemaining === 0;
    tx.update(ref, {
      status: fullRefund ? 'refunded' : cur.status === 'partial' ? 'partial' : 'active',
      refundAmount: (Number(cur.refundAmount) || 0) + amt,
      refundChannel,
      refundDate: refundDate || new Date().toISOString(),
      refundNote: note,
      remainingAmount: newRemaining,
      updatedAt: new Date().toISOString(),
    });
    return {
      customerId: cur.customerId,
      // Release the linked appointment ONLY on a FULL refund of an UNUSED
      // deposit-booking (customer isn't coming). A used deposit (usedAmount>0)
      // means the customer already came → never cancel their visit.
      releaseAppt: fullRefund && (Number(cur.usedAmount) || 0) === 0,
      linkedAppointmentId: cur.linkedAppointmentId || '',
    };
  });
  await recalcCustomerDepositBalance(out.customerId);
  // appointment-loop R7 (2026-06-03) — a fully-refunded UNUSED deposit-booking
  // means the customer isn't coming → cancel the linked appointment so its
  // AP1-bis slot is RELEASED. Pre-R7 refundDeposit touched ONLY the deposit doc
  // → the 'pending' appt held its doctor+room+time forever (un-rebookable
  // revenue-bearing slot) + still rendered as a live booking on the calendar,
  // with NOTHING linking the refund to the appointment. becameCancelled in
  // updateBackendAppointment releases the slots. Best-effort (refund committed).
  if (out.releaseAppt && out.linkedAppointmentId) {
    try { await updateBackendAppointment(out.linkedAppointmentId, { status: 'cancelled' }); }
    catch (e) { console.warn('[refundDeposit] linked-appt release skipped:', e?.message || e); }
  }
  return { success: true, releaseAppt: out.releaseAppt, linkedAppointmentId: out.linkedAppointmentId };
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

/**
 * Get all deposits (sorted by createdAt desc).
 *
 * Phase BSA leak-sweep-2 (2026-05-04) — branch-scoped via `_listWithBranch`
 * per user directive "ทำให้แถบมัดจำ แยกสาขากัน". When `branchId` is passed
 * (typical UI path via scopedDataLayer auto-inject), filters
 * `where('branchId','==',X)`. Cross-branch reports/aggregators pass
 * `{allBranches:true}` to skip the filter.
 *
 * Customer-attached lookups (`getCustomerDeposits` / `getActiveDeposits`)
 * remain UNIVERSAL — a customer can have deposits at any branch and the
 * customer-detail view aggregates across all branches.
 */
export async function getAllDeposits(opts = {}) {
  const list = await _listWithBranch(depositsCol(), opts);
  list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return list;
}

/**
 * Live trigger listener over be_deposits (2026-05-27 — appointment-page live
 * cross-device). Branch-scoped (BS-13 safe-by-default); used as a CHANGE SIGNAL
 * by the appointment page (any deposit create/edit/cancel → caller bumps a
 * refresh tick → loadAll re-fetches the authoritative getAllDeposits). Returns
 * unsubscribe.
 */
export function listenToAllDeposits(opts, onChange, onError) {
  const allBranches = !!(opts && opts.allBranches);
  const explicitBranch = (opts && typeof opts.branchId === 'string' && opts.branchId) ? opts.branchId : '';
  const effectiveBranchId = explicitBranch || (allBranches ? '' : resolveSelectedBranchId());
  if (!allBranches && !effectiveBranchId) { onChange?.([]); return () => {}; }
  const useFilter = !allBranches && effectiveBranchId;
  const q = useFilter
    ? query(depositsCol(), where('branchId', '==', String(effectiveBranchId)))
    : query(depositsCol());
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    onChange?.(list);
  }, onError);
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
  const list = snap.docs.map(d => ({ ...d.data(), id: d.id }));
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
  const amt = roundTHB(Number(amount) || 0); // V156 (M12): round at money-write boundary
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
    // V154 (money-leak, M17): remaining = amount − used − refundAmount. Pre-V154
    // dropped the refundAmount term, so reversing a sale's usage on a deposit
    // that had been partially manual-refunded (refundDeposit) RESTORED the
    // already-paid-out amount → phantom deposit balance (e2e-deposit-refund-reverse
    // D3/D4). The no-refund path is unaffected (refundAmount 0 → identical).
    const newRemaining = (Number(cur.amount) || 0) - newUsed - (Number(cur.refundAmount) || 0);
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
  const list = snap.docs.map(d => ({ ...d.data(), id: d.id }));
  list.sort((a, b) => (a.walletTypeName || '').localeCompare(b.walletTypeName || ''));
  return list;
}

/**
 * V64 (2026-05-08) — bulk fetch wallets for many customerIds. Chunks input
 * into groups of 30 (Firestore 'in' query cap) and Promise.all's the chunks.
 * Deduplicates input. Universal (no branchId — wallets are customer-attached).
 *
 * Used by Appointment Coming-Hub view to bulk-load wallet balances for the
 * day's appointment customers without N+1 round-trips.
 *
 * IMPORTANT (V64 schema fix 2026-05-08): be_customer_wallets uses composite
 * doc IDs `${customerId}__${walletTypeId}` (one doc per wallet TYPE per
 * customer). To fetch by customerId we query the `customerId` FIELD, NOT
 * documentId(). This mirrors getCustomerWallets:4051. A customer with N
 * wallet types yields N docs in the result; the aggregator (V64 Task 4)
 * sums balance per customerId.
 */
export async function getWalletsForCustomerIds(customerIds = []) {
  const ids = [...new Set((Array.isArray(customerIds) ? customerIds : []).filter(Boolean).map(String))];
  if (ids.length === 0) return [];
  const CHUNK = 30;
  const chunks = [];
  for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
  const snaps = await Promise.all(
    chunks.map(chunk =>
      getDocs(query(walletsCol(), where('customerId', 'in', chunk)))
    )
  );
  // V77-fix3 (S-4): docId wins spread order (V38 lesson)
  return snaps.flatMap(s => s.docs.map(d => ({ ...d.data(), id: d.id })));
}

/** Get balance for a specific wallet (0 if wallet missing). */
export async function getWalletBalance(customerId, walletTypeId) {
  const snap = await getDoc(walletDoc(walletKey(customerId, walletTypeId)));
  if (!snap.exists()) return 0;
  return Number(snap.data().balance) || 0;
}

// Audit P2 (2026-04-26 AV3): wallet-transaction IDs are part of the audit
// chain. Date.now() prefix gives ms-precision uniqueness; the suffix uses
// crypto.getRandomValues so the per-ms entropy is 128 bits (collision
// probability negligible at any clinic scale). Falls back to Math.random
// in environments without crypto (legacy node tests).
function txId() {
  let suffix = '';
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    suffix = Array.from(bytes).map(b => b.toString(36).padStart(2, '0')).join('').slice(0, 4);
  } else {
    suffix = Math.random().toString(36).slice(2, 6);
  }
  return `WTX-${Date.now()}-${suffix}`;
}

/** Top up a customer's wallet (adds to balance, creates WTX record). */
export async function topUpWallet(customerId, walletTypeId, {
  amount, walletTypeName = '', paymentChannel = '', refNo = '', note = '',
  staffId = '', staffName = '', referenceType = 'manual', referenceId = '',
} = {}) {
  const amt = roundTHB(Number(amount) || 0); // V156 (M12): round at money-write boundary
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
  const amt = roundTHB(Number(amount) || 0); // V156 (M12): round at money-write boundary
  if (amt <= 0) throw new Error('ยอดหักต้องมากกว่า 0');
  const dRef = String(referenceId || ''); // V158
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
    const patch = {
      balance: after,
      totalUsed: (Number(cur.totalUsed) || 0) + amt,
      lastTransactionAt: now,
      updatedAt: now,
    };
    // V158: maintain per-sale net (Σdeduct−Σrefund) on the wallet doc IN-tx so
    // refundToWallet's dedup can be CONCURRENCY-safe (was a non-tx query → R16
    // concurrent double-cancel double-refunded). A deduct increments the net.
    if (dRef) patch[`saleNet.${dRef}`] = (Number(cur.saleNet?.[dRef]) || 0) + amt;
    tx.update(ref, patch);
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
  const amt = roundTHB(Number(amount) || 0); // V156 (M12): round at money-write boundary
  if (amt <= 0) throw new Error('ยอดคืนต้องมากกว่า 0');
  await ensureCustomerWallet(customerId, walletTypeId, walletTypeName);
  const key = walletKey(customerId, walletTypeId);
  const ref = walletDoc(key);

  // V153 idempotency (money-leak class — sibling of M1 deposit + S5 stock CAS).
  // A sale-referenced wallet refund is valid only up to the NET still-deducted
  // amount for that sale (Σ deduct − Σ refund). This makes a DUPLICATE cancel→
  // delete refund (or a cancel retry after cancelBackendSale threw) a NO-OP —
  // outstanding is already 0 → pre-V153 it credited the SAME sale twice = real
  // spendable money created (e2e-reverse-idempotency W) — WITHOUT breaking the
  // EDIT path, which legitimately refunds→re-deducts the SAME saleId on every
  // edit (so each refund offsets a prior deduct; outstanding stays ≥ amt). Query
  // (not in-tx) → idempotent for the SEQUENTIAL trigger, not a concurrency lock.
  // Same 2-equality query shape as reversePointsEarned (proven indexed); the
  // walletType + type split is done client-side. Skipped when referenceId empty.
  const refId = String(referenceId || '');
  // V158 — legacy SEED for the in-tx dedup: for wallets WITHOUT a saleNet marker
  // (sales deducted before V158) compute Σdeduct−Σrefund ONCE to seed the marker.
  // New sales carry saleNet (maintained in-tx by deductWallet) → the in-tx read in
  // the transaction below is the CONCURRENCY-safe source. R16 proved the V153
  // non-tx query double-refunded on a CONCURRENT double-cancel; the in-tx marker
  // + OCC retry (the 2nd tx re-reads the seeded/decremented marker) fixes it while
  // staying edit-safe (deduct increments the net, refund decrements it).
  let legacyOutstanding = Infinity;
  if (refId) {
    const refTxSnap = await getDocs(query(walletTxCol(),
      where('customerId', '==', String(customerId)),
      where('referenceId', '==', refId),
    ));
    let deducted = 0, refunded = 0;
    for (const d of refTxSnap.docs) {
      const t = d.data();
      if (String(t.walletTypeId) !== String(walletTypeId)) continue;
      const a = Number(t.amount) || 0;
      if (t.type === 'deduct') deducted += a;
      else if (t.type === 'refund') refunded += a;
    }
    legacyOutstanding = deducted - refunded;
  }

  // M5: atomic balance + tx-log write.
  const newTxId = txId();
  const result = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.data() || {};
    const before = Number(cur.balance) || 0;
    const now = new Date().toISOString();
    // V158 — in-tx dedup (concurrency-safe). outstanding = the saleNet marker if
    // present (new sales), else the legacy seed. Refund only up to outstanding.
    const hasMarker = !!(refId && cur.saleNet && Object.prototype.hasOwnProperty.call(cur.saleNet, refId));
    const outstanding = refId ? (hasMarker ? (Number(cur.saleNet[refId]) || 0) : legacyOutstanding) : Infinity;
    if (refId && outstanding < amt) return { before, after: before, skipped: true };
    const after = before + amt;
    const patch = {
      balance: after,
      // totalUsed is NOT decremented so lifetime usage metrics stay accurate
      lastTransactionAt: now,
      updatedAt: now,
    };
    if (refId) patch[`saleNet.${refId}`] = outstanding - amt;
    tx.update(ref, patch);
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

  if (result.skipped) return { success: true, alreadyRefunded: true, skipped: true }; // V158 — nothing outstanding for this sale
  await recalcCustomerWalletBalances(customerId);
  return { success: true, txId: newTxId, ...result };
}

/** Manual ± adjust. `isIncrease = true` adds, false subtracts. */
export async function adjustWallet(customerId, walletTypeId, {
  amount, isIncrease = true, walletTypeName = '', note = '',
  staffId = '', staffName = '',
} = {}) {
  const amt = roundTHB(Number(amount) || 0); // V156 (M12): round at money-write boundary
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
  let list = snap.docs.map(d => ({ ...d.data(), id: d.id }));
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
  const now = new Date().toISOString();
  // V155 (Rule T): atomic renewals[] RMW — re-read inside the tx so two
  // concurrent renews can't both read the same renewals[] and lose one entry
  // (last-write-wins). Was getDoc→updateDoc. The wallet/points GRANTS stay
  // AFTER the tx (separate collections; their idempotency is the cross-
  // collection torn-write concern, not this atomicity fix).
  const { cur, newExpiry } = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Membership not found');
    const c = snap.data();
    const baseTime = Math.max(
      Date.now(),
      c.expiresAt ? new Date(c.expiresAt).getTime() : Date.now()
    );
    const exp = new Date(baseTime + Number(extendDays) * 86400000).toISOString();
    const renewals = Array.isArray(c.renewals) ? [...c.renewals] : [];
    renewals.push({
      renewedAt: now,
      expiresAt: exp,
      price: Number(price) || 0,
      paymentChannel, refNo, note,
      grantCredit: Number(grantCredit) || 0,
      grantPoints: Number(grantPoints) || 0,
    });
    tx.update(ref, { expiresAt: exp, renewals, status: 'active', updatedAt: now });
    return { cur: c, newExpiry: exp };
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
    const m = { ...d.data(), id: d.id };
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
  const list = snap.docs.map(d => ({ ...d.data(), id: d.id }));
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

// Audit P2 (2026-04-26 AV3): point-transaction IDs share txId's audit-chain
// concern. Same crypto.getRandomValues hardening with Math.random fallback.
function ptxId() {
  let suffix = '';
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    suffix = Array.from(bytes).map(b => b.toString(36).padStart(2, '0')).join('').slice(0, 4);
  } else {
    suffix = Math.random().toString(36).slice(2, 6);
  }
  return `PTX-${Date.now()}-${suffix}`;
}

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
  const newTxId = ptxId();
  const now = new Date().toISOString();
  // V149 (2026-06-02) — atomic points RMW (was getPointBalance→setDoc→updateDoc
  // with NO tx → concurrent earn/deduct lost-updated finance.loyaltyPoints;
  // confirmed Rule Q L2 scripts/e2e-points-concurrency.mjs 6/6). runTransaction
  // reads the summary INSIDE the tx so Firestore OCC serializes (mirrors wallet
  // M5). iron-clad Rule T (concurrency-RMW class). Ledger + summary now atomic.
  const { before, after, exists } = await runTransaction(db, async (tx) => {
    const cRef = customerDoc(customerId);
    const cSnap = await tx.get(cRef);
    const ex = cSnap.exists();
    const fin = cSnap.data()?.finance || {};
    const b = Number(fin.loyaltyPoints) || 0;
    const a = b + amt;
    // V158 (2026-06-03) — maintain per-reference net earned (finance.pointsSaleNet
    // [refId]) IN-tx so reversePointsEarned's dedup is concurrency-safe (R16 found a
    // concurrent double-cancel over-reverses loyalty points — V153's Σearn−Σreverse
    // query was explicitly "not a concurrency lock"). Referenced earns only (sale).
    const _pRef = String(meta.referenceId || '');
    if (ex) {
      const _upd = { 'finance.loyaltyPoints': a };
      if (_pRef) _upd[`finance.pointsSaleNet.${_pRef}`] = (Number(fin.pointsSaleNet?.[_pRef]) || 0) + amt;
      tx.update(cRef, _upd);
    }
    tx.set(pointTxDoc(newTxId), {
      ptxId: newTxId,
      customerId: String(customerId),
      type: meta.type || 'earn',
      amount: amt,
      pointsBefore: b,
      pointsAfter: a,
      referenceType: meta.referenceType || 'manual',
      referenceId: String(meta.referenceId || ''),
      purchaseAmount: Number(meta.purchaseAmount) || 0,
      bahtPerPoint: Number(meta.bahtPerPoint) || 0,
      note: meta.note || '',
      staffId: meta.staffId || '',
      staffName: meta.staffName || '',
      createdAt: now,
    });
    return { before: b, after: a, exists: ex };
  });
  if (!exists) {
    // M9: customer doc missing — the point tx log IS written (audit authoritative);
    // only the summary was skipped (can't update a non-existent doc).
    console.error('[backendClient] _earnPointsInternal: customer doc missing — point tx log written, finance.loyaltyPoints summary skipped', {
      customerId: String(customerId), txId: newTxId, pointsBefore: before, expectedAfter: after,
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
  // Deduct — V149 (2026-06-02) atomic RMW (Rule T). Over-spend guard re-checked
  // INSIDE the tx so two concurrent deducts can't both pass on a stale balance
  // AND can't lost-update the summary (mirrors deductWallet M5).
  const newTxId = ptxId();
  const now = new Date().toISOString();
  const { before, after, exists } = await runTransaction(db, async (tx) => {
    const cRef = customerDoc(customerId);
    const cSnap = await tx.get(cRef);
    const ex = cSnap.exists();
    const b = Number(cSnap.data()?.finance?.loyaltyPoints) || 0;
    if (b < amt) throw new Error(`คะแนนไม่พอ (มี ${b} ต้องการ ${amt})`);
    const a = b - amt;
    if (ex) tx.update(cRef, { 'finance.loyaltyPoints': a });
    tx.set(pointTxDoc(newTxId), {
      ptxId: newTxId,
      customerId: String(customerId),
      type: 'adjust',
      amount: amt,
      pointsBefore: b,
      pointsAfter: a,
      referenceType: 'manual', referenceId: '',
      purchaseAmount: 0, bahtPerPoint: 0,
      note, staffId, staffName,
      createdAt: now,
    });
    return { before: b, after: a, exists: ex };
  });
  if (!exists) {
    console.error('[backendClient] adjustPoints: customer doc missing — point tx log written, summary skipped', {
      customerId: String(customerId), txId: newTxId, pointsBefore: before, expectedAfter: after,
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
  const refId = String(referenceId);
  const snap = await getDocs(q);
  // V153 idempotency (money-leak class — sibling of M1 deposit + S5 stock CAS):
  // NET points earned for this reference against points ALREADY reversed for it,
  // so a repeated reverse (cancel→delete the same sale, or a retry after
  // cancelBackendSale threw) is a NO-OP instead of re-subtracting (pre-V153 summed
  // 'earn' ONLY → over-reversed the loyalty balance every extra call).
  // V158 (2026-06-03): the Σearn−Σreverse query is NOT a concurrency lock — two
  // CONCURRENT cancels both read the same sums and double-reverse (R16 confirmed
  // loyalty points over-reversed on a double-click / two admins). So the query is
  // now only a LEGACY SEED (sales earned before V158 carry no marker); the
  // authoritative dedup reads finance.pointsSaleNet[refId] (maintained in-tx by
  // _earnPointsInternal) INSIDE the tx → Firestore OCC serializes, the 2nd reverse
  // re-reads the decremented marker → reverses 0 (mirror of the wallet saleNet fix).
  let earnedSum = 0, alreadyReversed = 0;
  for (const d of snap.docs) {
    const tx = d.data();
    const amt = Number(tx.amount) || 0;
    if (tx.type === 'earn') earnedSum += amt;
    else if (tx.type === 'reverse') alreadyReversed += amt;
  }
  const legacyOutstanding = Math.max(0, earnedSum - alreadyReversed);
  const newTxId = ptxId();
  const now = new Date().toISOString();
  const { reversed, before, after, exists } = await runTransaction(db, async (tx) => {
    const cRef = customerDoc(customerId);
    const cSnap = await tx.get(cRef);
    const ex = cSnap.exists();
    const fin = cSnap.data()?.finance || {};
    const b = Number(fin.loyaltyPoints) || 0;
    const hasMarker = !!(fin.pointsSaleNet && Object.prototype.hasOwnProperty.call(fin.pointsSaleNet, refId));
    const markerVal = hasMarker ? (Number(fin.pointsSaleNet[refId]) || 0) : legacyOutstanding;
    const outstanding = Math.max(0, markerVal);
    if (outstanding <= 0) return { reversed: 0, before: b, after: b, exists: ex };
    const a = Math.max(0, b - outstanding);
    if (ex) tx.update(cRef, {
      'finance.loyaltyPoints': a,
      [`finance.pointsSaleNet.${refId}`]: markerVal - outstanding,
    });
    tx.set(pointTxDoc(newTxId), {
      ptxId: newTxId,
      customerId: String(customerId),
      type: 'reverse',
      amount: outstanding,
      pointsBefore: b,
      pointsAfter: a,
      referenceType: 'sale', referenceId: refId,
      note: `คืนคะแนนจากการยกเลิก/ลบ ${refId}`,
      staffId: '', staffName: '',
      createdAt: now,
    });
    return { reversed: outstanding, before: b, after: a, exists: ex };
  });
  if (reversed > 0 && !exists) {
    console.error('[backendClient] reversePointsEarned: customer doc missing — point tx log written, summary skipped', {
      customerId: String(customerId), txId: newTxId, pointsBefore: before, expectedAfter: after,
    });
  }
  return { success: true, reversed };
}

/** Get all point transactions for a customer (desc). */
export async function getPointTransactions(customerId) {
  const q = query(pointTxCol(), where('customerId', '==', String(customerId)));
  const snap = await getDocs(q);
  const list = snap.docs.map(d => ({ ...d.data(), id: d.id }));
  list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return list;
}

// V50 (2026-05-08) — runMasterDataSync REMOVED. Wrote master_data/{type} +
// master_data/{type}/items/* via brokerClient (deleted Phase 2.2). Caller
// was MasterDataTab.jsx (also deleted). Inert post-V50.

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
 *
 * Phase 17.2 (2026-05-05): `includeLegacyMain` opt removed — Phase 17.2
 * migration script rewrites all legacy `branchId='main'` batches to real
 * branch IDs, and Phase 17.2 outlaws synthetic 'main' branches. Strict
 * branchId filtering only.
 */
export async function listStockBatches({ productId, branchId, status } = {}) {
  const clauses = [];
  if (productId) clauses.push(where('productId', '==', String(productId)));
  if (branchId) clauses.push(where('branchId', '==', String(branchId)));
  if (status) clauses.push(where('status', '==', String(status)));
  const q = clauses.length ? query(stockBatchesCol(), ...clauses) : stockBatchesCol();
  const snap = await getDocs(q);
  const batches = snap.docs.map(d => ({ ...d.data(), id: d.id }));
  batches.sort((a, b) => (a.receivedAt || '').localeCompare(b.receivedAt || ''));
  return batches;
}

// V144 (2026-06-02) — real-time redundant-0-lot auto-clear. User rule (verbatim
// clarification): "มันเป็น 0 ได้ ถ้ามี lot เดียว แต่ถ้ามี lot อื่นเข้ามา lot ที่เป็น 0
// จะต้องหายไป" — a 0-lot is OK only as the LAST lot (placeholder so the product
// still shows at "0 / หมด" per V143/AV166); the moment a LIVE lot exists for that
// product (a new lot came in, OR a sibling still holds stock/debt) every 0-lot
// must vanish. That is EXACTLY planLotCleanup (V143-quater). This runs that pure
// plan in REAL TIME (post-commit) per (productId × location) a stock mutation
// touched — instead of waiting for the 03:45 cron (which stays as the system-wide
// backstop). DELETE-ONLY on remaining===0; idempotent; NEVER touches a live lot
// (positive stock OR negative debt) → cannot corrupt stock. Non-critical
// side-effect: callers wrap in try/catch so a cleanup failure never blocks the
// mutation (cron catches the leftovers). AV172 locks every stock-mutation entry
// point to call this (or carry an AV172-exempt annotation). Extends AV168
// (V143-quater planLotCleanup) from nightly-cron-only → also real-time.
export async function _clearRedundantZeroLotsForProducts(affectedKeys) {
  const seen = new Set();
  const uniq = [];
  for (const k of (Array.isArray(affectedKeys) ? affectedKeys : [])) {
    const pid = String(k?.productId ?? '');
    const loc = String(k?.locationId ?? k?.branchId ?? '');
    if (!pid || !loc) continue;
    const key = `${pid}|${loc}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push({ productId: pid, branchId: loc });
  }
  if (uniq.length === 0) return { deleted: 0, groups: 0 };
  let deleted = 0;
  let groups = 0;
  for (const { productId, branchId } of uniq) {
    const lots = await listStockBatches({ productId, branchId });
    const { deleteIds } = planLotCleanup(lots);
    if (!deleteIds || deleteIds.length === 0) continue;
    groups += 1;
    let wb = writeBatch(db);
    let n = 0;
    for (const id of deleteIds) {
      wb.delete(stockBatchDoc(id));
      deleted += 1; n += 1;
      if (n >= 450) { await wb.commit(); wb = writeBatch(db); n = 0; }
    }
    if (n > 0) await wb.commit();
  }
  return { deleted, groups };
}

// V143-ter (2026-05-31) — LIVE stock-balance listener. StockBalancePanel used a
// one-shot listStockBatches getDocs → a deduction from ANY surface (treatment /
// sale / adjust / import) on ANY device did NOT update the open ยอดคงเหลือ page
// until manual reload. User: "หน้ายอดคงเหลือไม่แสดง real time ... ทุกคนที่เปิดหน้านี้
// ต้องเห็นเหมือนกันแบบ real time ทันที". This onSnapshot pushes every batch change
// to all viewers instantly. BS-13 safe-by-default (no whole-collection fallback
// unless allBranches:true). Same query as listStockBatches (branchId only — the
// caller client-filters status ∈ {active,depleted} per V143/AV166). AV167.
export function listenToStockBatchesByBranch({ branchId, allBranches = false } = {}, onChange, onError) {
  const effectiveBranchId = (typeof branchId === 'string' && branchId)
    ? branchId
    : (allBranches ? null : '');
  if (!effectiveBranchId && !allBranches) {
    if (typeof onChange === 'function') onChange([]);
    return () => {};
  }
  const constraints = [];
  if (!allBranches && effectiveBranchId) constraints.push(where('branchId', '==', String(effectiveBranchId)));
  const q = constraints.length ? query(stockBatchesCol(), ...constraints) : stockBatchesCol();
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map(d => ({ ...d.data(), id: d.id }));
      list.sort((a, b) => (a.receivedAt || '').localeCompare(b.receivedAt || ''));
      if (typeof onChange === 'function') onChange(list);
    },
    (err) => { if (typeof onError === 'function') onError(err); }
  );
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
  const orders = snap.docs.map(d => ({ ...d.data(), id: d.id }));
  // V35.2-quater (2026-04-28) — sort newest-first per user directive
  // "ทุกหน้าที่มีตารางของระบบสต็อค ... รายการที่ทำล่าสุดต้องอยู่บนสุด".
  // createdAt is the auto-set ISO timestamp (always present; unique to ms);
  // importedDate is admin-entered YYYY-MM-DD (ties on same day). Use
  // createdAt as primary so same-day orders stay in entry order.
  orders.sort((a, b) =>
    (b.createdAt || '').localeCompare(a.createdAt || '') ||
    (b.importedDate || '').localeCompare(a.importedDate || '')
  );
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
  // Phase 15.4 (s19 items 3+4) — multi-branch visibility.
  //
  // Transfer/withdrawal movements span TWO branches (source + destination):
  //   - EXPORT_TRANSFER (type 8): branchId = source
  //   - RECEIVE (type 9): branchId = destination
  //   - EXPORT_WITHDRAWAL (type 10): branchId = source
  //   - WITHDRAWAL_CONFIRM (type 13): branchId = destination
  //
  // Old behaviour: filter `where('branchId', '==', X)` returned ONLY the side
  // whose branchId matched. User saw transfers in central tab but not in
  // stock tab (or vice versa).
  //
  // Fix: writer also sets `branchIds: [src, dst]` on those 4 movement types.
  // Reader fetches with non-branch server-filters (productId/type/etc.),
  // then filters branchId CLIENT-SIDE: match if `m.branchId === X` OR
  // `m.branchIds.includes(X)`. This avoids composite-index dependencies +
  // dual-query silent-fail traps that the dual-query approach (deployed
  // briefly post-s19) had. For clinic-scale data (<50k movements per
  // collection) the extra fetch is acceptable; trade reliability for a
  // small bandwidth tax.
  //
  // Old movements (no branchIds[]) still surface via the `branchId === X`
  // arm — backward compat preserved without schema migration.

  const mapFields = [
    'linkedSaleId', 'linkedTreatmentId', 'linkedOrderId', 'linkedCentralOrderId',
    'linkedAdjustId', 'linkedTransferId', 'linkedWithdrawalId',
    'batchId', 'productId',
  ];

  const clauses = [];
  for (const f of mapFields) {
    if (filters[f] != null) clauses.push(where(f, '==', String(filters[f])));
  }
  if (filters.type != null) clauses.push(where('type', '==', Number(filters.type)));

  const q = clauses.length ? query(stockMovementsCol(), ...clauses) : stockMovementsCol();
  const snap = await getDocs(q);
  let mvts = snap.docs.map(d => ({ ...d.data(), id: d.id }));

  if (filters.branchId != null) {
    const branchIdStr = String(filters.branchId);
    // Phase 15.4 post-deploy bug 2 v4 (2026-04-28): SINGLE-TIER filter.
    //
    // User correction (after v2/v3): each cross-tier movement must show on
    // its OWN tier only. Korat → Central transfer: Korat sees EXPORT only
    // ("ส่งออกไปคลังกลาง"), Central sees RECEIVE only ("รับเข้าจากสาขาโคราช").
    // NOT both rows on both pages. The cross-branch alias in v2/v3 caused
    // 2× duplication.
    //
    // Branch-tier isolation:
    //   EXPORT_TRANSFER (8): branchId=source       → only at source view
    //   RECEIVE (9):          branchId=destination  → only at destination view
    //   EXPORT_WITHDRAWAL (10): branchId=source     → only at source view
    //   WITHDRAWAL_CONFIRM (13): branchId=destination → only at destination view
    //
    // Phase 17.2 (2026-05-05): legacy-'main' alias removed — Phase 17.2
    // migration script rewrites all legacy `branchId='main'` movements to
    // real branch IDs.
    //
    // The branchIds[] field is STILL written (Phase E) but used by the UI
    // to compute the counterparty NAME for labels (not for branch matching).
    mvts = mvts.filter((m) => String(m.branchId || '') === branchIdStr);
  }

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
 * Phase 15.2 (2026-04-27) — shared helper extracted per Rule C1 (Rule of 3).
 *
 * Creates one batch doc + one IMPORT movement from a single order-line item.
 * Used by:
 *   - createStockOrder (branch tier, linkedField='linkedOrderId')
 *   - receiveCentralStockOrder (central tier, linkedField='linkedCentralOrderId')
 *
 * V12-safe: every shipped field is also written to legacy paths (branchId
 * stays the canonical filter; locationType + locationId are additive).
 * V14-safe: never returns undefined fields — every optional path resolves
 * to '' / null / 0 / false explicitly.
 * V19-safe: movement is append-only; only `reversedByMovementId` will ever
 * mutate via firestore.rules narrowing.
 *
 * @param {object} args
 *   - item: order-line input (productId, productName, qty, cost, expiresAt?, unit?, isPremium?)
 *   - idx: index in items[] for orderProductId fallback
 *   - locationId: branchId for branch tier OR centralWarehouseId for central tier
 *   - locationType: 'branch' | 'central'
 *   - orderId: parent order doc id
 *   - sourceDocPath: full firestore path (movement.sourceDocPath)
 *   - linkedField: 'linkedOrderId' (branch) or 'linkedCentralOrderId' (central)
 *   - user: normalized audit user
 *   - now: ISO timestamp shared by batch + movement (so both line up in audit)
 *   - note: optional movement note (propagated from order.note or receive note)
 *   - optInStockConfig: default true — auto-set stockConfig.trackStock=true on the product doc
 * @returns {{ batchId, movementId, resolvedItem }}
 */
// Phase 15.6 (Issue 3, 2026-04-28) — FK validation for batch creators.
// User report: "ตามภาพ Acetin 6 คืออะไร Aloe gel 010 คืออะไร ในข้อมูลหน้า
// tab=products ไม่มีสินค้านี้ด้วยซ้ำ make sure ว่าจะไม่มีสินค้าที่ไม่มี
// ตัวตนในระบบไปเข้าระบบคลังได้ ทั้งคลังสาขาและคลังกลาง"
//
// Throws PRODUCT_NOT_FOUND if the productId doesn't resolve to a be_products
// doc — prevents orphan accumulation at write time. Used by all 3 batch-
// creating sites: _buildBatchFromOrderItem (purchase order receive), and
// the two _receiveAtDestination helpers in createStockTransfer +
// createStockWithdrawal. Function declaration so it's hoisted to top of
// module scope (callable from earlier line numbers).
//
// V14 lock: helper throws Error objects (no undefined fields, no setDoc).
async function _assertProductExists(productId, contextLabel) {
  const id = String(productId || '');
  if (!id) {
    throw new Error(`PRODUCT_NOT_FOUND (${contextLabel || 'batch'}): empty productId`);
  }
  const product = await getProduct(id);
  if (!product) {
    throw new Error(
      `PRODUCT_NOT_FOUND (${contextLabel || 'batch'}): productId="${id}" not in be_products. ` +
      `Either the product was deleted, the ProClinic seed is stale, or this is a typo. ` +
      `Run /api/admin/cleanup-orphan-stock to inspect orphan batches.`
    );
  }
}

/**
 * Phase 15.7-bis (2026-04-28) — Auto-repay negative balances when incoming
 * positive qty arrives at a product+branch. Used by every batch-creator
 * (import / transfer-receive / withdrawal-receive) BEFORE creating a new
 * batch with `qty.remaining = qtyNum`.
 *
 * Flow:
 *   1. Query active batches at productId+branchId (legacy-main fallback for
 *      default-branch view per V35.3).
 *   2. Plan repay via stockUtils.applyNegativeRepay (FIFO oldest first).
 *   3. For each repay step: runTransaction — read-verify-update batch.qty +
 *      write a +repay movement with `negativeRepay: true` marker.
 *   4. Return totalRepaid + leftover so caller can size the new batch.
 *
 * User directive: "นำเข้าไปแล้วไม่รวมกับอันเดิม" — incoming positives MUST
 * repay existing negatives at the same product+branch first. Auto-repay
 * is silent (no admin click required) but the return value carries
 * `repaidBatches[]` so callers can surface a banner/toast (Phase 15.7-bis UX).
 *
 * @param {object} args
 * @param {string} args.productId
 * @param {string} args.branchId — branch OR central warehouse ID
 * @param {number} args.incomingQty
 * @param {number} args.movementType — MOVEMENT_TYPES.IMPORT / RECEIVE / WITHDRAWAL_CONFIRM
 * @param {string} args.sourceDocPath — for audit trail
 * @param {string} [args.linkedField] — e.g. 'linkedOrderId' or 'linkedTransferId'
 * @param {string} [args.linkedFieldValue]
 * @param {number} [args.cost] — per-unit cost (used to compute repay costBasis)
 * @param {boolean} [args.isPremium]
 * @param {object} [args.user] — actor record
 * @param {string} args.now — ISO timestamp
 * @param {string} [args.note]
 * @returns {Promise<{
 *   repaidBatches: Array<{batchId:string, productName:string, repayAmt:number, before:number, after:number, movementId:string}>,
 *   totalRepaid: number,
 *   leftover: number,
 * }>}
 */
async function _repayNegativeBalances({
  productId, branchId, incomingQty,
  movementType, sourceDocPath,
  linkedField, linkedFieldValue,
  cost = 0, isPremium = false,
  user, now, note,
}) {
  const need = Number(incomingQty);
  if (!Number.isFinite(need) || need <= 0) {
    return { repaidBatches: [], totalRepaid: 0, leftover: 0 };
  }
  if (!productId || !branchId) {
    return { repaidBatches: [], totalRepaid: 0, leftover: need };
  }

  const { stockUtils } = await _stockLib();
  const { BATCH_STATUS, applyNegativeRepay, resolveBatchStatusForRemaining } = stockUtils;

  // Phase 17.2 (2026-05-05): legacy-'main' fallback removed — strict
  // branchId filter (migration rewrites legacy batches to real branch IDs).
  const batches = await listStockBatches({
    productId,
    branchId,
    status: BATCH_STATUS.ACTIVE,
  });

  const { repayPlan, leftover } = applyNegativeRepay(batches, need);
  if (repayPlan.length === 0) {
    return { repaidBatches: [], totalRepaid: 0, leftover: need };
  }

  // Execute each repay step — own transaction so concurrent writers see
  // consistent qty. Mirror `_deductOneItem` negative-push tx shape but in
  // reverse (qty goes UP not DOWN, status flips back to ACTIVE if was
  // depleted, never set to depleted on positive movement).
  // V48 (2026-05-08) — Rule O extension: prefetch live product name BEFORE
  // each tx so the movement record uses canonical product name (NOT poisoned
  // batch.productName). Same V46 invariant as _deductOneItem extended here.
  const liveProductName = await _resolveProductNameLive(productId);
  const repaidBatches = [];
  let totalRepaid = 0;
  for (const step of repayPlan) {
    const batchRef = stockBatchDoc(step.batchId);
    const movementId = _genMovementId();
    const txResult = await runTransaction(db, async (tx) => {
      const snap = await tx.get(batchRef);
      if (!snap.exists()) {
        // Mid-flight delete — skip (caller writes a normal new batch with
        // the leftover instead).
        return null;
      }
      const b = snap.data();
      if (b.status === BATCH_STATUS.CANCELLED || b.status === BATCH_STATUS.EXPIRED) {
        return null; // skip cancelled/expired (caller absorbs into new batch)
      }
      const beforeRemaining = Number(b.qty?.remaining) || 0;
      // Re-check: if the batch was repaid concurrently to ≥0 we skip
      // (no debt left). The plan was based on a stale read.
      if (beforeRemaining >= 0) return null;
      // Recompute repay amount to handle concurrent partial repay
      const debt = Math.abs(beforeRemaining);
      const repayAmt = Math.min(debt, step.repayAmt);
      if (repayAmt <= 0) return null;

      const newRemaining = beforeRemaining + repayAmt;
      const newQty = { remaining: newRemaining, total: Number(b.qty?.total) || 0 };
      // 2026-05-31: single-source status. Identical to the prior tri-state
      // (>0 active / ===0 depleted / <0 active — partial repay leaves the
      // batch negative+active so admin keeps seeing the remaining debt).
      const newStatus = resolveBatchStatusForRemaining(newRemaining);

      tx.update(batchRef, {
        qty: newQty,
        status: newStatus,
        updatedAt: now,
      });

      // Inline movement object literal — the audit-stock-flow source-grep
      // (INV.7.4) checks each `tx.set(stockMovementDoc(...)` block carries
      // a `sourceDocPath` field. Spread the optional linkedField LAST so
      // V14 (no undefined leaves) holds: when linkedField/value is missing,
      // the spread is `{}`.
      const linkedSpread = (linkedField && linkedFieldValue)
        ? { [linkedField]: String(linkedFieldValue) }
        : {};
      tx.set(stockMovementDoc(movementId), {
        movementId,
        type: movementType,
        batchId: step.batchId,
        productId: b.productId || productId,
        // V48 (Rule O extension) — live-resolved name overrides poisoned batch.productName
        productName: liveProductName || b.productName || '',
        qty: repayAmt, // positive — incoming qty applied to repay
        before: beforeRemaining,
        after: newRemaining,
        branchId: b.branchId || branchId,
        sourceDocPath: String(sourceDocPath || ''),
        ...linkedSpread,
        revenueImpact: 0,
        costBasis: Number(cost || 0) * repayAmt,
        isPremium: !!isPremium,
        // Phase 15.7-bis marker — distinguishes from regular IMPORT/RECEIVE
        // movement on a fresh batch. Audit log + admin banner key off this.
        negativeRepay: true,
        user: user || null,
        note: String(note || `Repay negative balance (incoming +${repayAmt} ${b.unit || ''})`).trim(),
        createdAt: now,
      });

      return {
        batchId: step.batchId,
        productName: liveProductName || b.productName || '',
        repayAmt,
        before: beforeRemaining,
        after: newRemaining,
        movementId,
      };
    });

    if (txResult) {
      repaidBatches.push(txResult);
      totalRepaid += txResult.repayAmt;
    }
  }

  return {
    repaidBatches,
    totalRepaid,
    leftover: Math.max(0, need - totalRepaid),
  };
}

/**
 * V35.2-quinquies (2026-04-28) — ATOMIC FK pre-validation for batch creators.
 *
 * Bug fix: prior pattern was per-item _assertProductExists inside the create
 * loop. If item N failed FK, items 0..N-1 already had batches+movements
 * written but no order doc → partial commit → user reports "ยอดคงเหลือ
 * ไม่เปลี่ยน" (no balance change because StockBalancePanel V35.2 read-side
 * gate hid the orphans, since reverted) but "มีปรากฏใน movement log" (the
 * partial movements survived).
 *
 * Fix: validate ALL items' productIds BEFORE any setDoc. Throws on first
 * missing → no batches/movements/order written. All-or-nothing.
 *
 * V14 lock: throws Error objects (no undefined leaves to setDoc).
 *
 * Used by: createStockOrder (branch tier) + receiveCentralStockOrder.
 *
 * @param {Array<{productId: string|number}>} items
 * @param {string} contextLabel — for forensic error messages
 */
async function _assertAllProductsExist(items, contextLabel) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return;
  // Sequential to keep error messages clean (parallel would mask the first
  // failure). For typical orders (1-10 items) latency is negligible.
  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    await _assertProductExists(it?.productId, `${contextLabel} item#${i + 1}`);
  }
}

async function _buildBatchFromOrderItem({
  item, idx, locationId, locationType, orderId,
  sourceDocPath, linkedField, user, now, note,
  optInStockConfig = true,
}) {
  const { stockUtils } = await _stockLib();
  const { MOVEMENT_TYPES, BATCH_STATUS, buildQtyNumeric } = stockUtils;

  const qtyNum = Number(item.qty);
  if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
    throw new Error(`Item #${idx + 1} invalid qty: ${item.qty}`);
  }
  // Phase 15.6 (Issue 3) — FK validation: refuse to create a batch for a
  // product that isn't in be_products. Prevents the orphan pattern that
  // surfaced as "Acetin 6" / "Aloe gel 010" in the user's screenshot.
  await _assertProductExists(item.productId, `_buildBatchFromOrderItem item#${idx + 1}`);
  const orderProductId = String(
    item.orderProductId || item.centralOrderProductId || `${orderId}-${idx}`
  );
  const cost = Number(item.cost) || 0;
  const isPremium = !!item.isPremium;

  // Auto opt-in stockConfig — preserved from the legacy createStockOrder
  // flow. 2026-04-28 refactor: now delegates to shared helper
  // `_ensureProductTracked` (V12 single-writer contract). Same behavior:
  // best-effort opt-in on first receive; errors logged + swallowed
  // because failing to opt-in is non-fatal for this receive operation
  // (the batch still lands; admin can manually set trackStock later).
  if (optInStockConfig && item.productId) {
    await _ensureProductTracked(item.productId, {
      setBy: '_buildBatchFromOrderItem',
      unit: item.unit,
    });
  }

  // Phase 15.7-bis (2026-04-28) — auto-repay negative balances before
  // creating new batch. User report: "นำเข้าไปแล้วไม่รวมกับอันเดิม". The
  // incoming qty first repays existing negative batches at this
  // product+location FIFO (oldest debt first); only the leftover becomes
  // a new batch. This mirrors physical reality: imported stock that
  // settles a prior overdraw shouldn't double-count as fresh inventory.
  const repayResult = await _repayNegativeBalances({
    productId: String(item.productId || ''),
    branchId: String(locationId),
    incomingQty: qtyNum,
    movementType: MOVEMENT_TYPES.IMPORT,
    sourceDocPath: String(sourceDocPath),
    linkedField,
    linkedFieldValue: orderId,
    cost,
    isPremium,
    user,
    now,
    note: String(note || `Import repay (Order ${orderId})`),
  });
  const leftover = repayResult.leftover;

  let batchId = null;
  let movementId = null;
  if (leftover > 0) {
    batchId = _genBatchId();
    // 1) Create the batch doc with leftover qty (Phase 15.2: locationType + locationId added).
    await setDoc(stockBatchDoc(batchId), {
      batchId,
      productId: String(item.productId || ''),
      productName: String(item.productName || ''),
      branchId: String(locationId),
      locationType: locationType || 'branch',
      locationId: String(locationId),
      orderProductId,
      sourceOrderId: String(orderId),
      receivedAt: now,
      expiresAt: item.expiresAt || null,
      unit: String(item.unit || ''),
      qty: buildQtyNumeric(leftover),
      originalCost: cost,
      isPremium,
      status: BATCH_STATUS.ACTIVE,
      createdAt: now,
      updatedAt: now,
    });

    // 2) Append IMPORT movement (V14: no undefined leaves).
    movementId = _genMovementId();
    const movementDoc = {
      movementId,
      type: MOVEMENT_TYPES.IMPORT,
      batchId,
      productId: String(item.productId || ''),
      productName: String(item.productName || ''),
      qty: leftover,
      before: 0,
      after: leftover,
      branchId: String(locationId),
      sourceDocPath: String(sourceDocPath),
      revenueImpact: 0,
      costBasis: cost * leftover,
      isPremium,
      user,
      note: String(note || ''),
      createdAt: now,
    };
    // Branch order writes linkedOrderId; central PO writes linkedCentralOrderId.
    movementDoc[linkedField] = String(orderId);
    await setDoc(stockMovementDoc(movementId), movementDoc);
  }
  // If leftover === 0, the entire incoming qty was absorbed by negative
  // repay. No new batch needed. The repay movements (with negativeRepay:true)
  // ARE the audit trail for this item.

  return {
    batchId,        // null when leftover===0
    movementId,     // null when leftover===0
    repayResult,    // Phase 15.7-bis: surfaced for caller-side banner UX
    resolvedItem: {
      orderProductId,
      batchId,      // null OK — caller stores order line metadata regardless
      productId: String(item.productId || ''),
      productName: String(item.productName || ''),
      qty: qtyNum,  // FULL incoming qty for the order line (not leftover)
      cost,
      expiresAt: item.expiresAt || null,
      isPremium,
      unit: String(item.unit || ''),
      // Phase 15.7-bis — line-level repay summary for callers that surface UX
      negativeRepayApplied: repayResult.totalRepaid,
      negativeRepayBatchIds: repayResult.repaidBatches.map(r => r.batchId),
    },
  };
}

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
  const { DEFAULT_BRANCH_ID } = stockUtils;

  const items = Array.isArray(data?.items) ? data.items : [];
  if (items.length === 0) throw new Error('Order must have at least one item');

  // V35.2-quinquies (2026-04-28) — pre-validate ALL productIds atomically
  // BEFORE any setDoc. Prevents partial commits where items 0..N-1 wrote
  // batches+movements but item N's FK throw left no order doc.
  await _assertAllProductsExist(items, 'createStockOrder');

  const orderId = _genOrderId();
  const branchId = String(data.branchId || DEFAULT_BRANCH_ID);
  const importedDate = data.importedDate || new Date().toISOString();
  const now = new Date().toISOString();
  const user = _normalizeAuditUser(opts.user);

  const batchIds = [];
  const resolvedItems = [];
  // Phase 15.7-bis — collect repay summary across items for caller UX banner.
  const repays = [];

  // Phase 15.2 — delegate per-line batch+movement creation to shared helper.
  // Branch tier: linkedField='linkedOrderId', locationType='branch'.
  for (const [idx, item] of items.entries()) {
    const { batchId, resolvedItem, repayResult } = await _buildBatchFromOrderItem({
      item, idx,
      locationId: branchId,
      locationType: 'branch',
      orderId,
      sourceDocPath: `artifacts/${appId}/public/data/be_stock_orders/${orderId}`,
      linkedField: 'linkedOrderId',
      user,
      now,
      note: data.note,
    });
    batchIds.push(batchId);
    resolvedItems.push(resolvedItem);
    if (repayResult && repayResult.totalRepaid > 0) {
      repays.push({
        productId: String(item.productId || ''),
        productName: String(item.productName || ''),
        totalRepaid: repayResult.totalRepaid,
        leftover: repayResult.leftover,
        repaidBatches: repayResult.repaidBatches,
      });
    }
  }

  // Finally: create the order doc (with resolved batchIds baked in).
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

  // V144 — new lots just arrived for these products → clear any redundant
  // 0-lots ("lot อื่นเข้ามา → 0-lot หายไป"). Post-commit, non-critical.
  try {
    await _clearRedundantZeroLotsForProducts(items.map(i => ({ productId: i.productId, locationId: branchId })));
  } catch (e) { console.warn('[createStockOrder] V144 lot-clear skipped:', e?.message); }

  return { orderId, batchIds, success: true, repays };
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

  // V34 AUDIT FIX (2026-04-28) — atomic writeBatch.
  // Previous implementation called updateDoc + setDoc per batch in a sequential
  // loop with NO transaction wrapper. Crash mid-loop left some batches
  // cancelled with no CANCEL_IMPORT movement (audit gap) OR order doc still
  // 'pending' while batches were already 'cancelled' (status divergence).
  // writeBatch makes the whole cancel atomic — all-or-nothing.
  const wb = writeBatch(db);

  for (const batchId of batchIds) {
    const batch = await getStockBatch(batchId);
    if (!batch) continue;
    const total = Number(batch.qty?.total) || 0;

    // Flip batch → cancelled
    wb.update(stockBatchDoc(batchId), {
      status: BATCH_STATUS.CANCELLED,
      qty: { remaining: 0, total },
      updatedAt: now,
      cancelReason: reason,
    });

    // Append CANCEL_IMPORT movement
    const movementId = _genMovementId();
    // V48 (2026-05-08) — Rule O extension: live-resolve productName from
    // be_products[batch.productId] instead of trusting poisoned batch field.
    const liveCancelName = await _resolveProductNameLive(batch.productId);
    wb.set(stockMovementDoc(movementId), {
      movementId,
      type: MOVEMENT_TYPES.CANCEL_IMPORT,
      batchId,
      productId: batch.productId,
      productName: liveCancelName || batch.productName || '',
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

  wb.update(stockOrderDoc(orderId), {
    status: 'cancelled',
    cancelReason: reason,
    cancelledAt: now,
    cancelledBy: user,
    updatedAt: now,
  });

  await wb.commit();

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

  // V34 AUDIT FIX (2026-04-28) — atomic writeBatch for cost cascade.
  // Previous implementation looped items and called updateDoc per batch
  // sequentially. Crash mid-loop left some batches with new cost, others
  // with old → costBasis math diverges across the order. writeBatch
  // ensures the whole cost cascade lands atomically with the order doc.
  if (Array.isArray(patch.items)) {
    const wb = writeBatch(db);
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
          wb.update(stockBatchDoc(before.batchId), bp);
        }
      }
    }
    docPatch.items = existingItems;
    wb.update(stockOrderDoc(orderId), docPatch);
    await wb.commit();
    return { orderId, success: true };
  }

  await updateDoc(stockOrderDoc(orderId), docPatch);
  return { orderId, success: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 15.2 — Central Stock Orders (vendor → central warehouse PO)
// ═══════════════════════════════════════════════════════════════════════════
// Lifecycle:
//   pending  ─receiveCentralStockOrder(allLines)→  received  (terminal)
//   pending  ─receiveCentralStockOrder(someLines)→ partial   ─receiveCentralStockOrder(rest)→ received
//   pending  ─cancelCentralStockOrder→             cancelled (terminal, no batches were created)
//   partial/received ─cancelCentralStockOrder→     cancelled_post_receive (V19-style:
//     blocked if any batch had movements beyond IMPORT; emits CANCEL_IMPORT compensations)
//
// Schema:
//   be_central_stock_orders/{PO-CST-YYYYMM-NNNN}
//   be_central_stock_orders_counter/counter  { yearMonth, seq, updatedAt }
//
// Movements: type=1 IMPORT (with linkedCentralOrderId), type=14 CANCEL_IMPORT
// for cancel-post-receive compensations. branchId on movement = central
// warehouse id (locationType derived via deriveLocationType).
//
// Iron-clad:
//   E    no brokerClient, no /api/proclinic — 100% Firestore writes
//   H    no ProClinic sync — central stock is OURS
//   I    full-flow simulate covers create→partial→full receive→cancel
//   C1   _buildBatchFromOrderItem shared with createStockOrder (Rule of 3)
//   C3   ONE new collection + ONE new counter doc — both justified
//   V14  every setDoc input traverses validator → no undefined leaves
//   V19  movements rule unchanged (hasOnly(['reversedByMovementId']))
// ═══════════════════════════════════════════════════════════════════════════

const centralStockOrdersCol = () => collection(db, ...basePath(), 'be_central_stock_orders');
const centralStockOrderDoc = (id) => doc(db, ...basePath(), 'be_central_stock_orders', String(id));
const centralStockOrderCounterDoc = () => doc(db, ...basePath(), 'be_central_stock_orders_counter', 'counter');

/**
 * Generate the next central PO id: PO-CST-YYYYMM-NNNN.
 * Atomic via runTransaction (mirrors generateInvoiceNumber pattern).
 * Counter resets each month so the 4-digit suffix has comfortable headroom.
 */
export async function generateCentralOrderId() {
  const { runTransaction } = await import('firebase/firestore');
  const today = new Date();
  const ym = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}`;

  const seq = await runTransaction(db, async (tx) => {
    const ref = centralStockOrderCounterDoc();
    const snap = await tx.get(ref);
    let nextSeq = 1;
    if (snap.exists()) {
      const d = snap.data();
      if (d.yearMonth === ym) nextSeq = (d.seq || 0) + 1;
    }
    tx.set(ref, { yearMonth: ym, seq: nextSeq, updatedAt: new Date().toISOString() });
    return nextSeq;
  });

  return `PO-CST-${ym}-${String(seq).padStart(4, '0')}`;
}

/**
 * Create a central PO header. NO batches written yet — those land on
 * receiveCentralStockOrder. This shape mirrors the validator's normalized
 * output exactly so no extra coercion is required at write time.
 *
 * @param {object} data — output of normalizeCentralStockOrder (centralStockOrderValidation.js)
 * @param {object} [opts] — { user: { userId, userName } }
 * @returns {{ orderId, success: true }}
 */
export async function createCentralStockOrder(data, opts = {}) {
  const wh = String(data?.centralWarehouseId || '').trim();
  if (!wh) throw new Error('centralWarehouseId required');
  const items = Array.isArray(data?.items) ? data.items : [];
  if (items.length === 0) throw new Error('Central PO must have at least one item');
  for (const [idx, it] of items.entries()) {
    const qty = Number(it?.qty);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new Error(`Item #${idx + 1} invalid qty: ${it?.qty}`);
    }
  }

  const orderId = await generateCentralOrderId();
  const now = new Date().toISOString();
  const user = _normalizeAuditUser(opts.user);

  // Items get stable centralOrderProductId per line (V14: never undefined).
  const persistedItems = items.map((it, idx) => ({
    centralOrderProductId: String(it.centralOrderProductId || `${orderId}-${idx}`),
    productId: String(it.productId || ''),
    productName: String(it.productName || ''),
    qty: Number(it.qty) || 0,
    cost: Number(it.cost) || 0,
    expiresAt: it.expiresAt || null,
    unit: String(it.unit || ''),
    isPremium: !!it.isPremium,
    receivedBatchId: null,
    receivedQty: 0,
  }));

  await setDoc(centralStockOrderDoc(orderId), {
    orderId,
    centralWarehouseId: wh,
    vendorId: String(data.vendorId || ''),
    vendorName: String(data.vendorName || ''),
    importedDate: data.importedDate || thaiTodayISO(),
    note: String(data.note || ''),
    discount: Number(data.discount) || 0,
    discountType: data.discountType === 'percent' ? 'percent' : 'amount',
    items: persistedItems,
    status: 'pending',
    receivedLineIds: [],   // idempotent partial-receive checkpoint (V31-safe retry)
    createdBy: user,
    createdAt: now,
    updatedAt: now,
  });

  return { orderId, success: true };
}

/**
 * Receive (partially or fully) a central PO.
 *
 * Each receipt: { centralOrderProductId, qty? }. qty defaults to the line's
 * total qty (full-line receive). Phase 15.2 ships full-line only; partial-
 * line is a Phase 15.7+ enhancement.
 *
 * Idempotent: rerunning with the same lineIds is safe — already-received
 * lines (in `receivedLineIds`) skip silently. Caller can retry on partial
 * failure without double-creating batches.
 *
 * Order status flips:
 *   pending → partial  (some lines received; others not)
 *   pending → received (all lines received in one call)
 *   partial → received (residual receive completes the order)
 *
 * @param {string} orderId
 * @param {{centralOrderProductId:string, qty?:number}[]} receipts
 * @param {object} [opts] — { user: { userId, userName } }
 * @returns {{ orderId, status, batchIds, movementIds, alreadyReceived }}
 */
export async function receiveCentralStockOrder(orderId, receipts, opts = {}) {
  if (!orderId) throw new Error('orderId required');
  if (!Array.isArray(receipts) || receipts.length === 0) {
    throw new Error('receipts[] required');
  }

  const order = await getCentralStockOrder(orderId);
  if (!order) throw new Error(`Central order ${orderId} not found`);
  if (order.status === 'cancelled' || order.status === 'cancelled_post_receive') {
    throw new Error(`Cannot receive a cancelled order (${orderId})`);
  }
  if (order.status === 'received') {
    return { orderId, status: 'received', batchIds: [], movementIds: [], alreadyReceived: true };
  }

  // V35.2-quinquies — pre-validate FK for all to-be-received lines BEFORE
  // any setDoc. Avoids partial commits (some lines materialize as batches
  // while others throw mid-loop). Only validate lines we're about to receive.
  const existingReceivedSet = new Set(order.receivedLineIds || []);
  const itemsByLineIdMap = new Map((order.items || []).map(it => [it.centralOrderProductId, it]));
  const linesToReceive = (Array.isArray(receipts) ? receipts : [])
    .map(r => itemsByLineIdMap.get(String(r?.centralOrderProductId || '').trim()))
    .filter(line => line && !existingReceivedSet.has(line.centralOrderProductId) && !line.receivedBatchId);
  await _assertAllProductsExist(linesToReceive, `receiveCentralStockOrder ${orderId}`);

  const now = new Date().toISOString();
  const user = _normalizeAuditUser(opts.user);
  const sourceDocPath = `artifacts/${appId}/public/data/be_central_stock_orders/${orderId}`;

  // V152 (2026-06-02) — CAS CLAIM closes the AUDIT-V34 concurrent-receive gap.
  // Pre-V152 the idempotency checkpoint read `order.receivedLineIds` from the
  // getDoc above (OUTSIDE any tx), then created batches, then updated
  // receivedLineIds only at the END → two concurrent receives (admin double-
  // clicks "รับสินค้า" / two admins) both saw receivedLineIds=[], both created
  // batches → DOUBLE stock (R15 e2e: 16 units for an 8-unit PO). Fix: atomically
  // CLAIM the to-receive lineIds into receivedLineIds in a runTransaction BEFORE
  // creating any batch. The loser's CAS sees them already claimed → claims
  // nothing → returns early without creating batches (transfer/withdrawal use the
  // same CAS-in-tx pattern, which is why they were never vulnerable — R8/R13/R14).
  const claimedSet = await runTransaction(db, async (tx) => {
    const oRef = centralStockOrderDoc(orderId);
    const oSnap = await tx.get(oRef);
    if (!oSnap.exists()) throw new Error(`Central order ${orderId} not found`);
    const o = oSnap.data();
    if (o.status === 'received') return new Set();
    if (o.status === 'cancelled' || o.status === 'cancelled_post_receive') {
      throw new Error(`Cannot receive a cancelled order (${orderId})`);
    }
    const already = new Set(o.receivedLineIds || []);
    const lineMap = new Map((o.items || []).map(it => [it.centralOrderProductId, it]));
    const toClaim = [];
    for (const r of receipts) {
      const lineId = String(r?.centralOrderProductId || '').trim();
      if (!lineId || already.has(lineId)) continue;
      const ln = lineMap.get(lineId);
      if (!ln) throw new Error(`Line ${lineId} not found in order ${orderId}`);
      if (ln.receivedBatchId) continue; // defensive: already-received (drift) → don't re-create
      toClaim.push(lineId);
    }
    if (toClaim.length === 0) return new Set();
    tx.update(oRef, { receivedLineIds: [...(o.receivedLineIds || []), ...toClaim], updatedAt: now });
    return new Set(toClaim);
  });
  // Loser (another concurrent receive already claimed everything) — no-op return.
  if (claimedSet.size === 0) {
    const fresh = await getCentralStockOrder(orderId);
    const st = fresh?.status || order.status;
    return { orderId, status: st, batchIds: [], movementIds: [], alreadyReceived: st === 'received', repays: [] };
  }

  const itemsByLineId = new Map((order.items || []).map(it => [it.centralOrderProductId, it]));
  const updatedItems = [...(order.items || [])]; // read-only here (final write is a CAS re-read)
  const batchIds = [];
  const movementIds = [];
  const newlyReceivedLineIds = [];
  const receivedResults = []; // V152 — {lineId, batchId, receiveQty} applied in the finalize CAS
  const repays = []; // Phase 15.7-bis — accumulate repay summary for caller UX

  for (const r of receipts) {
    const lineId = String(r.centralOrderProductId || '').trim();
    if (!lineId) continue;
    if (!claimedSet.has(lineId)) {
      // V152 — only process the lines THIS call atomically claimed in the CAS
      // above. Lines a concurrent receive claimed (or already-received lines)
      // are skipped here → no double-batch.
      continue;
    }
    const line = itemsByLineId.get(lineId);
    if (!line) {
      throw new Error(`Line ${lineId} not found in order ${orderId}`);
    }
    if (line.receivedBatchId) {
      // Defensive: doc says line received but receivedLineIds didn't.
      // Treat as already-received + repair receivedLineIds at end.
      newlyReceivedLineIds.push(lineId);
      continue;
    }

    const orderIdx = updatedItems.findIndex(it => it.centralOrderProductId === lineId);
    const itemQty = Number(line.qty) || 0;
    const receiveQty = r.qty != null ? Number(r.qty) : itemQty;
    if (!Number.isFinite(receiveQty) || receiveQty <= 0) {
      throw new Error(`Line ${lineId} invalid receive qty: ${r.qty}`);
    }
    if (receiveQty !== itemQty) {
      throw new Error(`Line ${lineId} partial-line receive not supported in Phase 15.2 (got ${receiveQty}, expected ${itemQty})`);
    }

    // Delegate to shared helper — central tier writes locationType:'central'
    // + linkedCentralOrderId. Branch order writes linkedOrderId via the
    // same helper (Rule C1). Phase 15.7-bis: helper now auto-repays
    // negative balances at central warehouse before creating new batch.
    const { batchId, movementId, repayResult } = await _buildBatchFromOrderItem({
      item: line,
      idx: orderIdx >= 0 ? orderIdx : 0,
      locationId: order.centralWarehouseId,
      locationType: 'central',
      orderId,
      sourceDocPath,
      linkedField: 'linkedCentralOrderId',
      user,
      now,
      note: order.note || '',
    });

    batchIds.push(batchId);
    if (movementId) movementIds.push(movementId);
    receivedResults.push({ lineId, batchId, receiveQty }); // V152 — applied in the finalize CAS
    newlyReceivedLineIds.push(lineId);
    if (repayResult && repayResult.totalRepaid > 0) {
      repays.push({
        productId: String(line.productId || ''),
        productName: String(line.productName || ''),
        totalRepaid: repayResult.totalRepaid,
        leftover: repayResult.leftover,
        repaidBatches: repayResult.repaidBatches,
      });
    }
  }

  // V152 — finalize in a CAS so concurrent multi-line receives MERGE (re-read +
  // union receivedLineIds) instead of overwrite (which would drop a sibling
  // call's just-received line). Applies this call's receivedBatchId/receivedQty
  // to the matching items + recomputes status from the FRESH receivedLineIds.
  const newStatus = await runTransaction(db, async (tx) => {
    const oRef = centralStockOrderDoc(orderId);
    const oSnap = await tx.get(oRef);
    const o = oSnap.data() || {};
    const items = [...(o.items || [])];
    for (const { lineId, batchId, receiveQty } of receivedResults) {
      const i = items.findIndex(it => it.centralOrderProductId === lineId);
      if (i >= 0) items[i] = { ...items[i], receivedBatchId: batchId, receivedQty };
    }
    const merged = new Set([...(o.receivedLineIds || []), ...newlyReceivedLineIds]);
    const allIds = items.map(it => it.centralOrderProductId);
    const allRcv = allIds.length > 0 && allIds.every(id => merged.has(id));
    const status = allRcv ? 'received' : 'partial';
    tx.update(oRef, {
      items,
      receivedLineIds: Array.from(merged),
      status,
      receivedAt: allRcv ? now : (o.receivedAt || null),
      updatedAt: now,
    });
    return status;
  });

  // V144 — new central-warehouse lots just arrived → clear redundant 0-lots
  // for those products at the central location. Post-commit, non-critical.
  try {
    await _clearRedundantZeroLotsForProducts(linesToReceive.map(l => ({ productId: l.productId, locationId: order.centralWarehouseId })));
  } catch (e) { console.warn('[receiveCentralStockOrder] V144 lot-clear skipped:', e?.message); }

  return { orderId, status: newStatus, batchIds, movementIds, alreadyReceived: false, repays };
}

/**
 * Cancel a central PO.
 *
 * Two paths:
 *   1) status=='pending' (no batches yet) → flip to 'cancelled', no movements.
 *   2) status in {'partial','received'} → V19-style movement-trail check:
 *      every received batch must have IMPORT movement ONLY. If any batch
 *      saw further activity (sale/transfer/withdrawal/etc.), throw —
 *      we will NOT silently overwrite stock that's been used.
 *      Otherwise: flip each batch to cancelled qty=0, emit CANCEL_IMPORT
 *      with linkedCentralOrderId, and order status → 'cancelled_post_receive'.
 *
 * @param {string} orderId
 * @param {object} [opts] — { user, reason }
 * @returns {{ orderId, status, cancelledBatchIds, movementIds }}
 */
export async function cancelCentralStockOrder(orderId, opts = {}) {
  const { stockUtils } = await _stockLib();
  const { MOVEMENT_TYPES, BATCH_STATUS } = stockUtils;

  const order = await getCentralStockOrder(orderId);
  if (!order) throw new Error(`Central order ${orderId} not found`);
  if (order.status === 'cancelled' || order.status === 'cancelled_post_receive') {
    return {
      orderId,
      status: order.status,
      cancelledBatchIds: [],
      movementIds: [],
      alreadyCancelled: true,
    };
  }

  const now = new Date().toISOString();
  const user = _normalizeAuditUser(opts.user);
  const reason = String(opts.reason || '');

  // Pre-receive cancel — no batches exist, just flip the doc.
  if (order.status === 'pending') {
    await updateDoc(centralStockOrderDoc(orderId), {
      status: 'cancelled',
      cancelReason: reason,
      cancelledAt: now,
      cancelledBy: user,
      updatedAt: now,
    });
    return { orderId, status: 'cancelled', cancelledBatchIds: [], movementIds: [] };
  }

  // Post-receive cancel — V19-style movement-trail check.
  const receivedBatchIds = (order.items || [])
    .map(it => it.receivedBatchId)
    .filter(Boolean);

  for (const batchId of receivedBatchIds) {
    const allMvts = await listStockMovements({ batchId, includeReversed: true });
    const nonImport = allMvts.filter(m => m.type !== MOVEMENT_TYPES.IMPORT);
    if (nonImport.length > 0) {
      throw new Error(
        `Cannot cancel central order ${orderId}: batch ${batchId} has ${nonImport.length} non-import movement(s). ` +
        `ยกเลิกไม่ได้เพราะสต็อกบางส่วนถูกใช้แล้ว`
      );
    }
  }

  const movementIds = [];
  const cancelledBatchIds = [];

  // S18 (2026-05-18 audit-fix) — writeBatch atomicity for the cancel cascade.
  // Pre-fix shipped sequential updateDoc → setDoc → updateDoc, so any failure
  // mid-loop produced a partial cancellation (some batches flipped, some not,
  // order status still 'partial'). Mirror of V34 cancelStockOrder atomicity
  // pattern. Reads (getStockBatch, _resolveProductNameLive) stay outside the
  // writeBatch; queued writes commit as ONE transaction.
  const wb = writeBatch(db);

  for (const batchId of receivedBatchIds) {
    const batch = await getStockBatch(batchId);
    if (!batch) continue;
    const total = Number(batch.qty?.total) || 0;

    // Flip batch → cancelled.
    wb.update(stockBatchDoc(batchId), {
      status: BATCH_STATUS.CANCELLED,
      qty: { remaining: 0, total },
      updatedAt: now,
      cancelReason: reason,
    });

    // Append CANCEL_IMPORT movement (V14: explicit non-undefined fields).
    const movementId = _genMovementId();
    // V48 (2026-05-08) — Rule O extension at central-stock-order cancel path.
    // Mirror of cancelStockOrder fix.
    const liveCentralCancelName = await _resolveProductNameLive(batch.productId);
    wb.set(stockMovementDoc(movementId), {
      movementId,
      type: MOVEMENT_TYPES.CANCEL_IMPORT,
      batchId,
      productId: String(batch.productId || ''),
      productName: String(liveCentralCancelName || batch.productName || ''),
      qty: -total,
      before: total,
      after: 0,
      branchId: String(batch.branchId || order.centralWarehouseId),
      sourceDocPath: `artifacts/${appId}/public/data/be_central_stock_orders/${orderId}`,
      linkedCentralOrderId: orderId,
      revenueImpact: 0,
      costBasis: (Number(batch.originalCost) || 0) * total,
      isPremium: !!batch.isPremium,
      user,
      note: reason,
      createdAt: now,
    });
    movementIds.push(movementId);
    cancelledBatchIds.push(batchId);
  }

  wb.update(centralStockOrderDoc(orderId), {
    status: 'cancelled_post_receive',
    cancelReason: reason,
    cancelledAt: now,
    cancelledBy: user,
    updatedAt: now,
  });

  await wb.commit();

  return {
    orderId,
    status: 'cancelled_post_receive',
    cancelledBatchIds,
    movementIds,
  };
}

/** Fetch one central order by id. */
export async function getCentralStockOrder(orderId) {
  const snap = await getDoc(centralStockOrderDoc(orderId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** List central orders with optional filters. Sorted by importedDate DESC. */
export async function listCentralStockOrders({ centralWarehouseId, vendorId, status } = {}) {
  const clauses = [];
  if (centralWarehouseId) clauses.push(where('centralWarehouseId', '==', String(centralWarehouseId)));
  if (vendorId) clauses.push(where('vendorId', '==', String(vendorId)));
  if (status) clauses.push(where('status', '==', String(status)));
  const q = clauses.length ? query(centralStockOrdersCol(), ...clauses) : centralStockOrdersCol();
  const snap = await getDocs(q);
  const orders = snap.docs.map(d => ({ ...d.data(), id: d.id }));
  // V35.2-quater (2026-04-28) — newest-first per user directive (mirror listStockOrders).
  orders.sort((a, b) =>
    (b.createdAt || '').localeCompare(a.createdAt || '') ||
    (b.importedDate || '').localeCompare(a.importedDate || '')
  );
  return orders;
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
  // V32 (2026-04-28) — type='add' now uses adjustAddQtyNumeric (bumps both
  // total + remaining) instead of reverseQtyNumeric (caps at total). The
  // old code silently capped admin-discovered extra inventory when the
  // batch was at full capacity → audit doc + movement written but qty
  // unchanged. Long-standing production bug; surfaced when user did
  // ปรับเพิ่ม +20 +20 +10 on a 10/10 chanel batch and saw no change.
  const { MOVEMENT_TYPES, BATCH_STATUS, deductQtyNumeric, adjustAddQtyNumeric, resolveBatchStatusForRemaining } = stockUtils;

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

  // V48 (2026-05-08) — Rule O extension. Prefetch batch's productId via
  // pre-tx getDoc, then live-resolve productName from be_products. The
  // tx body uses `liveAdjustName` instead of poisoned `batch.productName`.
  let liveAdjustName = '';
  try {
    const preBatchSnap = await getDoc(stockBatchDoc(batchId));
    if (preBatchSnap.exists()) {
      liveAdjustName = await _resolveProductNameLive(preBatchSnap.data()?.productId);
    }
  } catch { /* non-fatal — falls through to batch.productName fallback in tx */ }

  // V144 — capture the adjusted product+location (closure) for the post-commit
  // redundant-0-lot clear (return shape stays unchanged).
  let adjProductId = '';
  let adjBranchId = '';

  const result = await runTransaction(db, async (tx) => {
    const batchRef = stockBatchDoc(batchId);
    const snap = await tx.get(batchRef);
    if (!snap.exists()) throw new Error(`Batch ${batchId} not found`);
    const batch = snap.data();
    if (batch.status === BATCH_STATUS.CANCELLED) {
      throw new Error(`Cannot adjust cancelled batch ${batchId}`);
    }

    const beforeRemaining = Number(batch.qty?.remaining) || 0;
    // V32 fix: adjustAddQtyNumeric bumps total+remaining (extra inventory
    // discovered → expand capacity); deductQtyNumeric for type='reduce'.
    const newQty = type === 'add'
      ? adjustAddQtyNumeric(batch.qty, qty)
      : deductQtyNumeric(batch.qty, qty);
    const afterRemaining = newQty.remaining;
    // 2026-05-31 fix: negative remaining = active DEBT (must stay visible).
    // resolveBatchStatusForRemaining: === 0 → depleted; < 0 OR > 0 → active.
    // PRIMARY BUG: ADJUST_ADD on a -13 batch → -12 was flipped to DEPLETED by
    // the old `<= 0` check → vanished from "ยอดคงเหลือ" (active-only filter) +
    // became unrepayable. This is the "บวกสต็อคติดลบทีละนิด" path the user wants.
    const newStatus = resolveBatchStatusForRemaining(afterRemaining);
    const branchId = p.branchId || batch.branchId;
    adjProductId = batch.productId; // V144 — capture for post-commit lot-clear
    adjBranchId = branchId;

    // Mutate batch
    tx.update(batchRef, {
      qty: newQty,
      status: newStatus,
      updatedAt: now,
    });

    // Append movement (immutable)
    const movementType = type === 'add' ? MOVEMENT_TYPES.ADJUST_ADD : MOVEMENT_TYPES.ADJUST_REDUCE;
    const signedQty = type === 'add' ? qty : -qty;
    // V48 (2026-05-08) — Rule O extension: live-resolve productName for
    // adjustment movement + adjustment doc (was using poisoned batch field).
    tx.set(stockMovementDoc(movementId), {
      movementId,
      type: movementType,
      batchId,
      productId: batch.productId,
      productName: liveAdjustName || batch.productName || '',
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
      productName: liveAdjustName || batch.productName || '',
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

  // V144 — an adjustment may drain a lot to 0 (or repay a negative toward 0);
  // clear redundant 0-lots for this product at its location. Post-commit.
  try {
    await _clearRedundantZeroLotsForProducts([{ productId: adjProductId, locationId: adjBranchId }]);
  } catch (e) { console.warn('[createStockAdjustment] V144 lot-clear skipped:', e?.message); }

  return { ...result, success: true };
}

// V159 (2026-06-03) — edit a batch/lot's expiry date directly. Admins key
// expiry wrong easily; this lets them fix it from the existing adjust form
// without re-opening the import order, anytime, even after partial use.
//
// ONE runTransaction (reads before writes): batch.expiresAt + forensic trail
// + a be_stock_adjustments type:'expiry' audit doc (NO movement → stock
// conservation untouched) + sync the source order line (Q4=B) by locationType.
//
// batch.status is NOT touched: the EXPIRED state is derived live via
// hasExpired() (stockUtils) and never persisted, so fixing expiresAt is
// immediately effective in FEFO with zero status change.
export async function updateStockBatchExpiry(p, opts = {}) {
  const batchId = p?.batchId;
  if (!batchId) throw new Error('batchId required');
  const newExpiresAt = (p?.newExpiresAt === '' || p?.newExpiresAt == null) ? null : String(p.newExpiresAt);

  const adjustmentId = _genAdjustmentId();
  const now = new Date().toISOString();
  const user = _normalizeAuditUser(opts.user);
  const note = String(p.note || '');

  // Rule O — live-resolve productName for the audit doc (pre-tx, non-fatal).
  let liveName = '';
  try {
    const pre = await getDoc(stockBatchDoc(batchId));
    if (pre.exists()) liveName = await _resolveProductNameLive(pre.data()?.productId);
  } catch { /* falls back to batch.productName in tx */ }

  const result = await runTransaction(db, async (tx) => {
    // ── READS FIRST (Firestore tx rule: all reads before any write) ──
    const batchRef = stockBatchDoc(batchId);
    const snap = await tx.get(batchRef);
    if (!snap.exists()) throw new Error(`Batch ${batchId} not found`);
    const batch = snap.data();
    if (batch.status === 'cancelled') throw new Error(`Cannot edit expiry of cancelled batch ${batchId}`);

    const oldExpiresAt = batch.expiresAt ?? null;
    // V159-fix (B1): idempotency — an unchanged expiry is a no-op (no batch
    // write, no adjustment doc, no order sync). Makes a retry-after-partial-
    // failure safe to re-run + avoids spurious "edit" audit docs that changed
    // nothing. newExpiresAt is pre-normalized ('' / null → null) so the compare
    // is apples-to-apples for the null/date cases.
    if (newExpiresAt === oldExpiresAt) {
      return { adjustmentId: null, batchId, oldExpiresAt, newExpiresAt, orderSynced: false, noChange: true };
    }
    const branchId = p.branchId || batch.branchId;
    const sourceOrderId = batch.sourceOrderId || '';
    const orderProductId = batch.orderProductId || '';
    const orderRef = sourceOrderId
      ? (batch.locationType === 'central' ? centralStockOrderDoc(sourceOrderId) : stockOrderDoc(sourceOrderId))
      : null;
    let orderSnap = null;
    if (orderRef && orderProductId) orderSnap = await tx.get(orderRef);

    // ── WRITES ──
    tx.update(batchRef, {
      expiresAt: newExpiresAt,
      expiresAtLegacyValue: oldExpiresAt,
      expiresAtEditedAt: now,
      expiresAtEditedBy: user?.userId || '',
      updatedAt: now,
    });

    tx.set(stockAdjustmentDoc(adjustmentId), {
      adjustmentId,
      batchId,
      productId: batch.productId,
      productName: liveName || batch.productName || '',
      type: 'expiry',
      oldExpiresAt,
      newExpiresAt,
      note,
      branchId,
      user,
      movementId: null,
      createdAt: now,
    });

    // Q4=B — sync the source order line's expiresAt (1:1 via orderProductId).
    let orderSynced = false;
    if (orderSnap && orderSnap.exists()) {
      const order = orderSnap.data();
      const items = Array.isArray(order.items) ? order.items : [];
      let touched = false;
      const newItems = items.map((it) => {
        // V159-fix (B2): match the tier-appropriate line key. Branch order items
        // carry `orderProductId`; CENTRAL order items carry `centralOrderProductId`
        // (and the central batch.orderProductId === that value). The old
        // branch-only `it.orderProductId === orderProductId` check made the
        // central tier's order-line sync a silent no-op.
        if (it && (it.orderProductId === orderProductId || it.centralOrderProductId === orderProductId)) {
          touched = true; return { ...it, expiresAt: newExpiresAt };
        }
        return it;
      });
      if (touched) { tx.update(orderRef, { items: newItems, updatedAt: now }); orderSynced = true; }
    }

    return { adjustmentId, batchId, oldExpiresAt, newExpiresAt, orderSynced };
  });

  return { ...result, success: true };
}

/**
 * Phase 15.4 post-deploy bug 3 (2026-04-28) — fetch single adjustment by id.
 * Used by AdjustDetailModal to render the row-click detail view (mirrors
 * Transfer/Withdrawal detail modal pattern).
 */
export async function getStockAdjustment(adjustmentId) {
  const snap = await getDoc(stockAdjustmentDoc(adjustmentId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// ─── V46 (2026-05-08) — Live productName resolver (Rule O) ────────────────
//
// IRON-CLAD RULE O (added 2026-05-08 after the user's 4th-round skip-stock-
// deduction class bug): productId is the ONLY identity for stock; productName
// on stock_movement records MUST be live-resolved from be_products[productId]
// at write time. batch.productName is denormalized display cache — frozen at
// batch-create time + may be POISONED by older bug rounds. Movements MUST
// NOT inherit batch.productName as authoritative.
//
// User-reported repro (post V45 deploy): treatment BT-1778169734111 deducted
// productId=38699 (Stapple no 22) but movement recorded productName=
// "ขลิบไร้เลือด (เบอร์22) 1 ครั้ง" (course name) — because the AUTO-NEG batch
// at that productId was poisoned during a V44-era buggy buy. New movement
// inherited poisoned name. To the user it APPEARS like "เอาชื่อมาตัดสต็อค".
//
// V46 fix: every stock_movement write MUST resolve productName from
// be_products live (cached per-call to avoid N+1 reads). batch.productName
// is NEVER used at movement write — only as a display fallback for batch
// listings. Same goes for AUTO-NEG batch CREATION: use the resolved live
// name to prevent batch poisoning at the source.

const __productNameCache = new Map();
async function _resolveProductNameLive(productId) {
  if (!productId) return '';
  const key = String(productId);
  if (__productNameCache.has(key)) return __productNameCache.get(key);
  try {
    const ref = doc(db, ...basePath(), 'be_products', key);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data() || {};
      const name = String(data.productName || data.name || '').trim();
      __productNameCache.set(key, name);
      return name;
    }
  } catch (e) {
    console.warn('[_resolveProductNameLive] failed for', key, e?.message);
  }
  __productNameCache.set(key, '');
  return '';
}
function _clearProductNameCache() { __productNameCache.clear(); }

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
  // V36-tris (2026-04-29) — user directive: legacy sync-staging fallback
  // REMOVED. be_products is the single source of truth at runtime per
  // iron-clad H. Feature code reads ONLY be_* collections.
  // Wipe endpoint /api/admin/wipe-master-data prevents accidental
  // cross-pollination from sync-staging artifacts.
  try {
    const beRef = doc(db, ...basePath(), 'be_products', String(productId));
    const beSnap = await getDoc(beRef);
    if (!beSnap.exists()) return null;
    const data = beSnap.data() || {};
    const cfg = data.stockConfig || null;
    // V43 (2026-05-08) — surface doc-level `skipStockDeduction` alongside
    // stockConfig sub-object fields. Lets `_deductOneItem` gate the
    // direct-product master-skip path WITHOUT a second Firestore read.
    // Existing callers (`_ensureProductTracked`, `_deductOneItem` tracked
    // check) only inspect `cfg.trackStock` so the extra field is harmless.
    // Return null only when product doc has neither stockConfig nor
    // skipStockDeduction (true-empty doc — preserves prior shape contract).
    if (!cfg && !data.skipStockDeduction) return null;
    return {
      ...(cfg || {}),
      skipStockDeduction: !!data.skipStockDeduction,
    };
  } catch {
    return null;
  }
}

// V36-bis (2026-04-29) — productName fallback resolver. Many submission
// paths set item.productId to a synthetic value:
//   - Course/promotion buy modal → rowId like "purchased-{ts}-{idx}"
//   - Cross-collection clone IDs (be_products id != legacy sync id)
//   - Manual-entry forms → empty productId, falls to row.id
//   - Pre-V20 multi-branch test data → mismatched productIds
// Pre-V36-bis: those paths silent-SKIPped (V31 anti-pattern) or with
// V36 throw fail-loud → user-visible "ตัดสต็อกการรักษาไม่สำเร็จ" alert
// for products that GENUINELY exist (just under a different doc id).
//
// V36-bis fix: when productId can't resolve, try EXACT-NAME match in
// be_products. If found, rewire item.productId to the resolved doc id
// and continue normal FIFO deduct. User directive 2026-04-29:
//   "ห้ามพลาดแบบนี้อีก ไม่ว่าจะเป็นการ submit จากไหน"
//
// Phase 17.2-sexies (2026-05-05) — internal-leak fix: previously called
// `listProducts()` with no opts so the lookup ranged across ALL branches.
// On a multi-branch clinic with shared product names ("Acetin", "Aloe gel"
// etc.) the name match could resolve to a sibling-branch be_products doc
// → wrong stockConfig + wrong FIFO batch + cross-branch movement noise.
// The caller `_deductOneItem` already receives `branchId` from
// deductStockForSale / deductStockForTreatment; thread it through.
//
// Returns matched be_products doc ID (string) or null. Case-insensitive,
// trimmed exact match. Defensive: catches all errors.
async function _resolveProductIdByName(productName, branchId) {
  if (!productName || typeof productName !== 'string') return null;
  const target = productName.trim().toLowerCase();
  if (!target) return null;
  try {
    const all = await listProducts(branchId ? { branchId } : {});
    const match = (all || []).find((p) => {
      if (!p) return false;
      const n = String(p.productName || p.name || '').trim().toLowerCase();
      return n === target;
    });
    return match ? String(match.id || match.productId || '') : null;
  } catch (e) {
    console.warn('[_resolveProductIdByName] lookup failed for', productName, e);
    return null;
  }
}

// ─── Shared opt-in helper (V12 single-writer contract) ─────────────────────
// 2026-04-28: course-mediated treatments need products to be opted-in to
// stock tracking the moment the doctor uses them. Previously this only
// happened on first vendor-order receive (4145–4190 — _buildBatchFromOrderItem).
// Treatments that consumed products which never went through a vendor order
// silently SKIPped with note "product not yet configured for stock tracking"
// — the V31 silent-swallow bug user reported in Image 1.
//
// This helper is the SINGLE writer for stockConfig.trackStock=true.
// _buildBatchFromOrderItem now calls this. _deductOneItem now calls this
// for context==='treatment'. Two callers, ONE writer — V12 multi-reader
// sweep contract preserved.
//
// Idempotent: re-runs are no-op when already tracked. Returns the
// post-upsert config (always trackStock:true on success) or null when the
// product doc doesn't exist anywhere (rare post-migration; caller decides).
async function _ensureProductTracked(productId, opts = {}) {
  if (!productId) return null;
  const setBy = String(opts.setBy || '_ensureProductTracked');
  const unit = String(opts.unit || '');
  const now = new Date().toISOString();

  const existing = await _getProductStockConfig(productId);
  if (existing && existing.trackStock === true) {
    return existing; // Already tracked — no-op (idempotent)
  }

  const baseConfig = {
    trackStock: true,
    minAlert: existing?.minAlert ?? 0,
    unit: existing?.unit || unit,
    isControlled: !!existing?.isControlled,
  };

  // V36-tris (2026-04-29) — REMOVED legacy sync-staging fallback per user
  // directive. be_products is the single source of truth.
  // setDoc({merge:true}) upserts stockConfig without clobbering siblings;
  // if be_products doc is missing entirely, returns null. The V36-bis
  // name-fallback in `_deductOneItem` resolves the common case where
  // item.productId is a synthetic value but item.productName matches a
  // real be_products doc → caller rewires to the resolved id BEFORE this
  // helper is called.
  try {
    const beRef = doc(db, ...basePath(), 'be_products', String(productId));
    const beSnap = await getDoc(beRef);
    if (!beSnap.exists()) return null;
    await setDoc(beRef, {
      stockConfig: baseConfig,
      _stockConfigSetBy: setBy,
      _stockConfigSetAt: now,
    }, { merge: true });
    return baseConfig;
  } catch (e) {
    // Non-fatal — log + return null. V36-bis: callers no longer throw
    // (silent-skip with diagnostic note in Movement Log instead).
    console.warn('[_ensureProductTracked] failed for', productId, e);
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
      // 2026-04-28: per-item "ไม่ตัดสต็อค" flag — propagated from course
      // schema → mapper → customerCourses → treatmentItems. _deductOneItem
      // honors this for context==='course' (intentional skip with audit note).
      skipStockDeduction: !!it.skipStockDeduction,
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
        skipStockDeduction: !!p.skipStockDeduction,
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
        skipStockDeduction: !!m.skipStockDeduction,
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
        skipStockDeduction: !!c.skipStockDeduction,
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
        skipStockDeduction: !!t.skipStockDeduction,
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
  item, saleId, treatmentId, branchId, movementType, customerId, user, preferNewest, extraLink, context,
}) {
  const { stockUtils } = await _stockLib();
  // Phase 15.7 (2026-04-28) — pickNegativeTargetBatch added for negative-stock
  // overage push (FIFO-last batch goes negative). MOVEMENT_TYPES retained for
  // existing audit-log integration. BATCH_STATUS unchanged.
  const { MOVEMENT_TYPES, BATCH_STATUS, batchFifoAllocate, deductQtyNumeric, pickNegativeTargetBatch, resolveBatchStatusForRemaining } = stockUtils;

  if (!item.productId) {
    // Manual/one-off item — emit a skipped movement for audit continuity.
    return { productId: null, skipped: true, reason: 'no-productId', movements: [] };
  }
  if (item.qty <= 0) {
    return { productId: item.productId, skipped: true, reason: 'zero-qty', movements: [] };
  }

  const baseDocPath = saleId
    ? `artifacts/${appId}/public/data/be_sales/${saleId}`
    : treatmentId
      ? `artifacts/${appId}/public/data/be_treatments/${treatmentId}`
      : '';

  // ─── Decision tree (2026-04-28 — V31 silent-swallow fix) ─────────────
  //
  // 1. item.skipStockDeduction === true (user explicitly set "ไม่ตัดสต็อค"
  //    on the course row) → emit a clearly-labeled SKIP movement with
  //    reason 'course-skip' + Thai note. Distinct from the legacy
  //    silent-skip "not-tracked" path so admin can tell intent apart in
  //    the movement log.
  //
  // 2. context==='treatment' AND product not tracked → call shared
  //    _ensureProductTracked helper to upsert stockConfig.trackStock=true,
  //    re-fetch config, fall through to FIFO. If FIFO finds no batch at
  //    branch, batchFifoAllocate throws → caller surfaces friendly Thai
  //    error to admin (V31 fail-loud, NOT silent skip).
  //
  // 3. cfg && cfg.trackStock === true → real FIFO deduct (existing path).
  //
  // 4. Else (sale/manual context, untracked) → preserve legacy silent-skip
  //    movement. Phase 12.x sale flows depend on this; widening here = too
  //    big a blast radius for the V35.x stock fix. Sales that need to
  //    block on un-tracked products should explicitly opt-in via the
  //    item-level skipStockDeduction flag (or the user can configure the
  //    product's trackStock manually).
  if (item.skipStockDeduction === true) {
    const movementId = _genMovementId();
    const now = new Date().toISOString();
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
      note: 'ผู้ใช้ตั้งค่าให้ไม่ตัดสต็อคในคอร์ส',
      customerId: customerId || null,
      createdAt: now,
    });
    return { productId: item.productId, skipped: true, reason: 'course-skip', movements: [{ movementId }] };
  }

  let cfg = await _getProductStockConfig(item.productId);

  // V43 (2026-05-08) — direct-product master flag. After fetching
  // be_products config, gate on its top-level `skipStockDeduction` field.
  // Distinct from branch 1 (item.skipStockDeduction came from a course
  // row) so the audit trail records WHICH source decided to skip — admin
  // can audit "course-skip" vs "product-skip" in Movement Log notes.
  // Branch 1 still gets the course-row gating; this branch handles direct
  // product / sale / medication / consumable purchases of products whose
  // master `be_products.skipStockDeduction === true`.
  if (cfg && cfg.skipStockDeduction === true) {
    const movementId = _genMovementId();
    const now = new Date().toISOString();
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
      note: 'ผู้ใช้ตั้งค่าให้ไม่ตัดสต็อคที่สินค้า',
      customerId: customerId || null,
      createdAt: now,
    });
    return { productId: item.productId, skipped: true, reason: 'product-skip', movements: [{ movementId }] };
  }

  let tracked = cfg && cfg.trackStock === true;

  // V36-bis (2026-04-29) — productName fallback. User report: "ตัดรักษา
  // Allergan 100u แล้วขึ้นว่าไม่มีในระบบ ทั้งๆที่ก็มี ไม่งั้น dropdown จะมา
  // จากไหน". Many submission paths pass a synthetic productId (purchase
  // rowId, master_data clone id, empty falls to row.id) that doesn't
  // match the canonical be_products doc id even though the product
  // genuinely exists by NAME. Try the name-fallback BEFORE auto-init so
  // we can rewire to the right doc.
  let lookupProductId = item.productId;
  if (!tracked && item.productName && (context === 'treatment' || context === 'sale')) {
    // Phase 17.2-sexies — pass branchId so the name lookup stays scoped to
    // the current branch (avoids cross-branch product-name collision).
    const resolvedId = await _resolveProductIdByName(item.productName, branchId);
    if (resolvedId && resolvedId !== String(item.productId || '')) {
      const reCfg = await _getProductStockConfig(resolvedId);
      if (reCfg && reCfg.trackStock === true) {
        cfg = reCfg;
        tracked = true;
        lookupProductId = resolvedId;
        console.info(
          `[_deductOneItem] productId resolved by name fallback: "${item.productName}" → ${resolvedId} (was ${item.productId})`
        );
      } else {
        // Name match exists but stockConfig not set yet — auto-init below
        // will run on the resolved id (not the original).
        lookupProductId = resolvedId;
      }
    }
  }

  // V35.3-ter (2026-04-28 — user-confirmed): auto-init for BOTH treatment
  // AND sale context. Pre-fix sale-side silent-skipped untracked products
  // → user reported "ขายของจาก tab=sales แล้ว...สุดท้ายก็ไม่มีการตัดสต็อคจริง".
  // Lazy upsert of stockConfig.trackStock=true so course/product/medication
  // deductions actually decrement stock. Single-writer via
  // _ensureProductTracked = V12 safe. Service products (no batches by
  // design) → admin sets `stockConfig.trackStock=false` explicitly via
  // ProductFormModal to opt out.
  if (!tracked && (context === 'treatment' || context === 'sale')) {
    const upserted = await _ensureProductTracked(lookupProductId, {
      setBy: `_deductOneItem(${context})`,
      unit: item.unit,
    });
    if (upserted && upserted.trackStock === true) {
      cfg = upserted;
      tracked = true;
    }
    // V36-bis (2026-04-29) — REVERTED V36 fail-loud throw per user
    // directive: "ห้ามพลาดแบบนี้อีก ไม่ว่าจะเป็นการ submit จากไหน".
    // The V36 throw fired for products that genuinely existed but with
    // mismatched productIds (synthetic rowIds, master_data clone ids,
    // etc.) — see V36-bis name fallback above. With name-fallback in
    // place, the residual "no doc by id AND no doc by name" case is
    // genuinely rare (manual one-off entries, deleted master products
    // referenced by old treatments). Fall through to silent-skip with
    // a clear diagnostic note in the SKIP movement so admin can spot
    // the case in Movement Log without blocking the save.
  }

  if (!tracked) {
    const reason = cfg && cfg.trackStock === false ? 'trackStock-false' : 'not-tracked';
    const movementId = _genMovementId();
    const now = new Date().toISOString();
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

  // Fetch candidate batches.
  // Phase 17.2 (2026-05-05): legacy-'main' fallback removed — Phase 17.2
  // migration rewrites legacy `branchId='main'` batches to real branch IDs
  // before this path runs. Strict branchId filter only.
  // V36-bis (2026-04-29) — use `lookupProductId` (resolved by name fallback
  // above when the original item.productId didn't match a be_products doc).
  // Falls back to item.productId for the common case where it already
  // matches. Movement records still carry item.productId (the original)
  // so audit trails stay consistent with the form-submitted shape.
  // V147 (2026-06-02) — CONCURRENCY-RACE RETRY (Rule O / Phase 15.7 purpose lock).
  // The candidate-batch read below is OUTSIDE the per-batch runTransaction, so the
  // FIFO plan is computed from a snapshot a CONCURRENT deduction can invalidate
  // before our tx commits. The in-tx guard then throws STOCK_RACE_RETRY. Phase
  // 15.7's purpose is "ตัดได้เสมอ (ติดลบได้)" — a treatment/sale deduction must
  // NEVER fail because a sibling deduction drained the batch first (that race-time
  // shortfall is NOT covered by the plan-time negative-stock fallback because
  // plan.shortfall===0 when the stale snapshot still showed enough). So on a race
  // we RE-FETCH + RE-PLAN against fresh `remaining`; the negative-stock path then
  // absorbs any real shortfall. Bounded (converges in 1-2 retries — each retry
  // routes more to the no-floor negative push). Verified by
  // scripts/e2e-stock-concurrency-race.mjs (was 6/6 rounds raced before this fix).
  const _DEDUCT_MAX_ATTEMPTS = 6;
  for (let _deductAttempt = 1; ; _deductAttempt++) {
  const batches = await listStockBatches({ productId: lookupProductId, branchId, status: BATCH_STATUS.ACTIVE });
  // batchFifoAllocate consumes the already-filtered list. Do NOT pass
  // branchId here — listStockBatches is the single source of truth for
  // branch filtering at this layer.
  const plan = batchFifoAllocate(batches, item.qty, { productId: lookupProductId, preferNewest });

  // Phase 15.7 (2026-04-28) — negative-stock allowance for tracked products.
  // User directive post V15 #4: "หากเกิดการรักษา ตัดคอร์ส ขาย หรืออื่นใด ที่
  // สินค้าหรือคอร์สหรือบริการใดๆที่สต็อคไม่พอ ปล่อยให้ตัดได้แบบปัจจุบันนี่แหละ
  // แต่เพิ่มระบบ สต็อคติดลบ ไว้". When `plan.shortfall > 0` we now PUSH the
  // overage onto a target batch instead of writing a silent-skip audit.
  // Target selection (pickNegativeTargetBatch in stockUtils): FIFO-last
  // allocation → most-recent batch at branch+product → synthetic AUTO-NEG
  // batch on-the-fly. Allocations still drain positive batches FIFO first;
  // only the remaining shortfall lands on the negative batch.
  //
  // Repay flow: admin uses adjust ADD / transfer-in / receive-import /
  // withdrawal-receive to bring qty.remaining back ≥ 0. batchFifoAllocate
  // continues to skip negative batches (`if (available <= 0) continue`),
  // so future deducts won't auto-pile on the negative — they go to fresh
  // positive lots first, repay can be deliberate via Adjust panel.
  //
  // Why FIFO-last (not synthetic-per-shortfall)? User-confirmed via
  // AskUserQuestion 2026-04-28 — "FIFO-last batch goes negative". Single
  // batch carries the negative, real before/after numbers in movement log,
  // no schema noise from per-shortfall synthetic batches. Synthetic batch
  // ONLY created in the genuinely-zero-batches case (Fallback C).

  // Resolve negative-target batch BEFORE tx loops so we can create the
  // synthetic in its own setDoc (no nested transactions). Only matters
  // when shortfall > 0 AND context is treatment|sale (non-supported
  // contexts retain the legacy throw fallback below).
  let negativeTargetBatchId = null;
  let negativeTargetBatch = null;
  if (plan.shortfall > 0 && (context === 'treatment' || context === 'sale')) {
    // Phase 16.3 (2026-04-29) — feature flag gate. Q4-C: when admin sets
    // `clinic_settings/system_config.featureFlags.allowNegativeStock=false`,
    // block NEW negatives but PRESERVE the existing-negative repay path
    // (which lives in `_repayNegativeBalances` upstream of `_buildBatchFromOrderItem`
    // / `_receiveAtDestination` — NOT here). Admin can transition off the
    // negative-stock allowance without orphaning batches that already went
    // negative.
    //
    // Default: true (Phase 15.7 contract). Cached read per call — system_config
    // is a single doc + listener-keyed in the UI; calling getSystemConfig()
    // here is one Firestore read per stock-deduct, acceptable given
    // treatment-save runs at most a few items.
    try {
      const { getSystemConfig } = await import('./systemConfigClient.js');
      const sysCfg = await getSystemConfig();
      if (sysCfg && sysCfg.featureFlags && sysCfg.featureFlags.allowNegativeStock === false) {
        const err = new Error(
          `สต็อคของ "${item.productName || item.productId}" ไม่พอ — ` +
          `admin ปิดการใช้สต็อคติดลบในระบบ กรุณานำเข้าสต็อคก่อน หรือเปิด toggle ` +
          `"อนุญาตการตัดสต็อคติดลบ" ใน "ตั้งค่าระบบ"`
        );
        err.code = 'STOCK_INSUFFICIENT_NEGATIVE_DISABLED';
        err.productId = item.productId;
        err.productName = item.productName;
        err.shortfall = plan.shortfall;
        throw err;
      }
    } catch (e) {
      // Re-throw STOCK_INSUFFICIENT_NEGATIVE_DISABLED; swallow other errors
      // (config-read failures degrade gracefully to default-allow per
      // Phase 15.7 contract — never block treatment save on a transient
      // config-read failure).
      if (e?.code === 'STOCK_INSUFFICIENT_NEGATIVE_DISABLED') throw e;
      console.warn('[_deductOneItem] system_config read failed; defaulting allowNegativeStock=true:', e?.message);
    }

    negativeTargetBatchId = pickNegativeTargetBatch({
      allocations: plan.allocations,
      branchBatches: batches,
      branchId,
      productId: lookupProductId, // V36-bis: use resolved id for cross-branch lookup
    });
    if (!negativeTargetBatchId) {
      // Fallback C: no batches whatsoever at branch+product. Create a
      // synthetic AUTO-NEG batch. qty starts at {total:0, remaining:0};
      // the negative-push tx below will drive remaining negative. Status
      // stays 'active' so StockBalancePanel surfaces the negative row.
      // V35 FK invariant: product must exist in be_products before any
      // batch is written. Throws PRODUCT_NOT_FOUND if missing — admin
      // sees the friendly error instead of a phantom synthetic batch.
      // V36-bis: use lookupProductId so the synthetic batch references
      // the canonical be_products doc (resolved by name fallback).
      // V46 (2026-05-08) — Rule O: live-resolve productName from
      // be_products[lookupProductId] for the new batch. Prevents batch
      // poisoning at source: if item.productName was course-name (older
      // bug round), the live read overrides it with canonical product name.
      await _assertProductExists(lookupProductId, 'negative-stock-synthetic-batch');
      const newId = _genBatchId();
      const now = new Date().toISOString();
      const liveProductName = await _resolveProductNameLive(lookupProductId);
      negativeTargetBatch = {
        batchId: newId,
        lot: `AUTO-NEG-${Date.now()}`,
        productId: lookupProductId, // V36-bis canonical id
        // V46: prefer live-resolved name; fallback to item.productName if
        // be_products doc lacks productName text (rare).
        productName: liveProductName || item.productName,
        unit: item.unit || '',
        branchId,
        // Phase 15.2 location-type discriminator — synthetic batches at
        // branch tier carry locationType:'branch' so MovementLogPanel +
        // StockBalancePanel filters work without legacy-main hacks.
        locationType: 'branch',
        qty: { total: 0, remaining: 0 },
        originalCost: 0,
        cost: 0,
        receivedAt: now,
        expiresAt: null,
        status: BATCH_STATUS.ACTIVE,
        notes: 'AUTO synthetic batch — created to absorb negative-stock overage (no prior batch existed at branch)',
        createdAt: now,
        updatedAt: now,
        // Phase 15.7 marker so admin / audits can identify auto-created
        // negative batches separately from real lots.
        autoNegative: true,
      };
      await setDoc(stockBatchDoc(newId), negativeTargetBatch);
      negativeTargetBatchId = newId;
    }
  }

  const committedMovements = [];
  // baseDocPath already declared at the top of _deductOneItem (2026-04-28
  // refactor — moved up so the skipStockDeduction + auto-init paths can
  // share the same value without re-computing).

  try {
    for (const a of plan.allocations) {
      const batchRef = stockBatchDoc(a.batchId);
      const movementId = _genMovementId();

      const txResult = await runTransaction(db, async (tx) => {
        const snap = await tx.get(batchRef);
        // V147 — vanished/cancelled/expired mid-deduct are concurrency-transient
        // (e.g. a sibling deduct drained it to 0 → V144 0-lot clear deleted it, or
        // admin cancelled it). Tag STOCK_RACE_RETRY so the outer loop re-plans
        // against the fresh active-batch set instead of failing the save.
        if (!snap.exists()) { const e = new Error(`Batch ${a.batchId} vanished mid-deduct`); e.code = 'STOCK_RACE_RETRY'; throw e; }
        const b = snap.data();
        if (b.status === BATCH_STATUS.CANCELLED || b.status === BATCH_STATUS.EXPIRED) {
          const e = new Error(`Batch ${a.batchId} became ${b.status} mid-deduct`); e.code = 'STOCK_RACE_RETRY'; throw e;
        }
        const beforeRemaining = Number(b.qty?.remaining) || 0;
        if (beforeRemaining < a.takeQty) {
          // V147 — race: a concurrent deduction drained this batch below the
          // stale-plan takeQty. Tag for retry (re-plan → negative-stock absorbs).
          const e = new Error(
            `Batch ${a.batchId} raced: available ${beforeRemaining}, need ${a.takeQty}`
          );
          e.code = 'STOCK_RACE_RETRY';
          throw e;
        }
        const newQty = deductQtyNumeric(b.qty, a.takeQty);
        const afterRemaining = newQty.remaining;
        // 2026-05-31: single-source status (=== 0 → depleted; else active).
        // Positive FIFO loop is guarded (line ~7655 throws if before < takeQty)
        // so afterRemaining is always ≥ 0 here — this only ever resolves to
        // active-or-depleted-at-0; the helper keeps it consistent + lets the
        // source-grep regression lock "no `<= 0 ? DEPLETED`" project-wide.
        const newStatus = resolveBatchStatusForRemaining(afterRemaining);
        const now = new Date().toISOString();

        tx.update(batchRef, {
          qty: newQty,
          status: newStatus,
          updatedAt: now,
        });

        // V46 (2026-05-08) — Rule O: live-resolve productName from
        // be_products[productId] at write time. Batch's denormalized
        // productName may be poisoned (frozen from older bug rounds);
        // never use it as authoritative on the movement record.
        const liveName = await _resolveProductNameLive(b.productId);
        tx.set(stockMovementDoc(movementId), {
          movementId,
          type: movementType,
          batchId: a.batchId,
          productId: b.productId,
          productName: liveName || item.productName || b.productName || '',
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

    // Phase 15.7 — negative-stock push for the remaining shortfall. Runs
    // AFTER positive allocations so the FIFO-last batch (if it was just
    // drained to 0) is the natural carrier. tx-isolated so concurrent
    // writers see consistent qty.
    if (plan.shortfall > 0 && (context === 'treatment' || context === 'sale') && negativeTargetBatchId) {
      const batchRef = stockBatchDoc(negativeTargetBatchId);
      const movementId = _genMovementId();
      const txResult = await runTransaction(db, async (tx) => {
        const snap = await tx.get(batchRef);
        // V147 — transient (negative-target batch deleted/cleared by a sibling op
        // between plan + push). Tag for retry → re-plan resolves the new target.
        if (!snap.exists()) { const e = new Error(`Batch ${negativeTargetBatchId} vanished pre-negative-push`); e.code = 'STOCK_RACE_RETRY'; throw e; }
        const b = snap.data();
        // Allow status='depleted' (we may have just drained it ourselves
        // in the loop above). Reject only cancelled/expired (real
        // structural issues). On negative push we lift status back to
        // 'active' so StockBalancePanel + listStockBatches({status:'active'})
        // pick up the row — admin must SEE the debt to repay it.
        if (b.status === BATCH_STATUS.CANCELLED || b.status === BATCH_STATUS.EXPIRED) {
          const e = new Error(`Batch ${negativeTargetBatchId} became ${b.status} pre-negative-push`); e.code = 'STOCK_RACE_RETRY'; throw e;
        }
        const beforeRemaining = Number(b.qty?.remaining) || 0;
        const newRemaining = beforeRemaining - plan.shortfall;
        const newQty = { remaining: newRemaining, total: Number(b.qty?.total) || 0 };
        // Negative remaining = active debt; only flip to DEPLETED on exact 0.
        // 2026-05-31: routed through resolveBatchStatusForRemaining (was already
        // `=== 0` — kept identical; single-source for the source-grep lock).
        const newStatus = resolveBatchStatusForRemaining(newRemaining);
        const now = new Date().toISOString();

        tx.update(batchRef, {
          qty: newQty,
          status: newStatus,
          updatedAt: now,
        });

        // V46 (2026-05-08) — Rule O: live-resolve productName for negative-
        // overage movement. b.productName may be the POISONED stamp from an
        // older AUTO-NEG batch creation (the user-reported repro path —
        // course-name leaked into batch metadata via V44-era bug, then new
        // movements inherited the wrong name). Live read sidesteps batch
        // pollution entirely.
        const liveNameNeg = await _resolveProductNameLive(b.productId || item.productId);
        tx.set(stockMovementDoc(movementId), {
          movementId,
          type: movementType,
          batchId: negativeTargetBatchId,
          productId: b.productId || item.productId,
          productName: liveNameNeg || item.productName || b.productName || '',
          qty: -plan.shortfall,
          before: beforeRemaining,
          after: newRemaining,
          branchId: b.branchId || branchId,
          sourceDocPath: baseDocPath,
          linkedSaleId: saleId || null,
          linkedTreatmentId: treatmentId || null,
          ...(extraLink || {}),
          revenueImpact: item.isPremium ? 0 : null,
          costBasis: (Number(b.originalCost) || 0) * plan.shortfall,
          isPremium: !!item.isPremium,
          skipped: false,
          // Phase 15.7 marker so admin / audits / movement log can flag
          // negative-overage entries (vs normal positive deducts).
          negativeOverage: true,
          user,
          note: `สต็อคติดลบ — ตัดเกินคงเหลืออีก ${plan.shortfall} ${item.unit || ''}`.trim(),
          customerId: customerId || null,
          createdAt: now,
        });

        return {
          batchId: negativeTargetBatchId,
          qty: plan.shortfall,
          movementId,
          before: beforeRemaining,
          after: newRemaining,
          negativeOverage: true,
        };
      });
      committedMovements.push(txResult);
    } else if (plan.shortfall > 0 && context !== 'treatment' && context !== 'sale') {
      // Non-supported context (manual/etc) — preserve legacy throw fallback.
      throw new Error(
        `Stock insufficient for ${item.productName} (${item.productId}): need ${item.qty}, allocated ${item.qty - plan.shortfall}, shortfall ${plan.shortfall}`
      );
    }
  } catch (err) {
    // Compensate: reverse everything committed so far for THIS item (this attempt).
    for (const m of committedMovements) {
      try {
        await _reverseOneMovement(m.movementId);
      } catch (rollbackErr) {
        console.error('[_deductOneItem] compensation failed for movement', m.movementId, rollbackErr);
      }
    }
    // V147 — retry the WHOLE allocation on a concurrency race (re-fetch + re-plan
    // at the top of the for-loop). Non-race errors (STOCK_INSUFFICIENT_NEGATIVE_DISABLED,
    // PRODUCT_NOT_FOUND, etc.) propagate immediately. Bounded so pathological
    // contention can't spin forever; converges as each retry routes more of the
    // shortfall to the no-floor negative-stock push.
    if (err?.code === 'STOCK_RACE_RETRY' && _deductAttempt < _DEDUCT_MAX_ATTEMPTS) {
      console.warn(`[_deductOneItem] stock race on attempt ${_deductAttempt}/${_DEDUCT_MAX_ATTEMPTS} — re-planning:`, err?.message);
      continue;
    }
    throw err;
  }

  return { productId: item.productId, skipped: false, movements: committedMovements };
  } // end V147 concurrency-race retry loop
}

/**
 * Internal: reverse ONE movement. Adds qty back to batch + writes a compensating
 * movement entry + flags the original as reversedByMovementId.
 * Idempotent — no-op if already reversed.
 */
async function _reverseOneMovement(movementId, { user } = {}) {
  const { stockUtils } = await _stockLib();
  const { BATCH_STATUS, reverseQtyNumeric, resolveBatchStatusForRemaining } = stockUtils;
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
    const qtyReturn = Math.abs(Number(m.qty) || 0);
    const now = new Date().toISOString();
    let beforeRemaining;
    let afterRemaining;
    if (!bSnap.exists()) {
      // V151 (2026-06-02) — the original lot is GONE (e.g. V144's real-time
      // 0-lot clear DELETED it after a deduct drained it to 0 while another lot
      // stayed live; or an admin removed it). A reverse MUST still restore the
      // stock — NEVER throw + permanently lose it (pre-V151 the throw propagated
      // out of reverseStockForSale/Treatment's loop → the whole cancel FAILED +
      // the customer's stock was never returned; confirmed R10 e2e). Re-create
      // the lot from the movement metadata carrying the returned qty so
      // conservation holds AND the reverse movement's batchId still matches
      // (audit chain intact). Original total/cost/expiry vanished with the lot;
      // derive cost from costBasis, expiry unknown → null, flag
      // `_recreatedByReverse` so admin can reconcile (e.g. set expiry) if needed.
      beforeRemaining = 0;
      afterRemaining = qtyReturn;
      const derivedCost = (Number(m.costBasis) && qtyReturn) ? (Number(m.costBasis) / qtyReturn) : 0;
      tx.set(batchRef, {
        batchId: m.batchId,
        productId: m.productId || null,
        productName: m.productName || '',
        branchId: m.branchId || null,
        locationId: m.branchId || null,
        locationType: 'branch',
        status: resolveBatchStatusForRemaining(afterRemaining),
        qty: { total: qtyReturn, remaining: qtyReturn },
        originalCost: derivedCost,
        cost: derivedCost,
        receivedAt: now,
        expiresAt: null,
        createdAt: now,
        updatedAt: now,
        notes: 'RECREATED on reverse — original lot was deleted before this cancel/edit (e.g. V144 0-lot clear); stock restored',
        _recreatedByReverse: true,
      });
    } else {
      const b = bSnap.data();
      beforeRemaining = Number(b.qty?.remaining) || 0;
      const newQty = reverseQtyNumeric(b.qty, qtyReturn);
      afterRemaining = newQty.remaining;
      const newStatus = b.status === BATCH_STATUS.DEPLETED && afterRemaining > 0
        ? BATCH_STATUS.ACTIVE
        : b.status;
      tx.update(batchRef, { qty: newQty, status: newStatus, updatedAt: now });
    }

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
// AUDIT-V34 (2026-04-28) — KNOWN PARTIAL-ROLLBACK RISK (deferred to V35):
// If error mid-loop on item N, line 5301 calls reverseStockForSale to
// compensate. But reverseStockForSale itself is async + can throw on a
// concurrent batch state change. Inner catch logs but outer throw masks
// the rollback failure. Stock left partially deducted + partially reversed.
// Fix sketch: collect successful deductions, on error reverse them inside
// runTransaction, on reverse-failure flag sale doc with `needsManualReconcile:
// true` + alert admin. Defer until concurrent test bank (Phase 3 T5) surfaces
// it under repro stress. Production-impact under low-load: rare.
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
        context: 'sale', // legacy silent-skip preserved for untracked products
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

  // V144 — real-time clear redundant 0-lots for every product we just drained.
  try {
    await _clearRedundantZeroLotsForProducts(flat.map(i => ({ productId: i.productId, locationId: branchId })));
  } catch (e) { console.warn('[deductStockForSale] V144 lot-clear skipped:', e?.message); }

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
        context: 'treatment', // V31 fix — auto-init untracked products + fail-loud on no-batch
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

  // V144 — real-time clear redundant 0-lots for every product we just drained.
  try {
    await _clearRedundantZeroLotsForProducts(flat.map(i => ({ productId: i.productId, locationId: branchId })));
  } catch (e) { console.warn('[deductStockForTreatment] V144 lot-clear skipped:', e?.message); }

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
  // Phase 15.7 (2026-04-28) — collect per-item skip reasons for the cancel
  // modal. Pre-fix the modal said "trackStock=false — ไม่กระทบสต็อก" as a
  // blanket disclaimer, which is misleading because the actual reason can
  // be (a) course-item skipStockDeduction=true (the user's "ไม่ตัดสต็อค"
  // checkbox in the course definition) or (b) product-level trackStock=false
  // (admin opted-out of stock tracking for a service product). User wants
  // a precise per-reason breakdown. Each entry: {movementId, productName,
  // reason, courseName?, qty}. reason values mirror _deductOneItem's
  // `return { ..., reason }` shape: 'course-skip' | 'trackStock-false' |
  // 'not-tracked' | 'no-batch-at-branch' | 'shortfall'.
  const skipReasons = [];
  let canReverseFully = true;
  let totalQtyToRestore = 0;

  for (const m of movements) {
    if (m.skipped) {
      // Read the explicit reason hint from the movement's note. _deductOneItem
      // writes deterministic Thai notes per branch which we map back to the
      // reason taxonomy. Fallback: 'trackStock-false' (legacy default).
      const note = String(m.note || '');
      let reason = 'trackStock-false';
      if (note.includes('ไม่ตัดสต็อคในคอร์ส')) reason = 'course-skip';
      else if (note.includes('not yet configured')) reason = 'not-tracked';
      else if (note.includes('ไม่มีสต็อคที่สาขานี้')) reason = 'no-batch-at-branch';
      else if (note.includes('สต็อคไม่พอที่สาขานี้')) reason = 'shortfall';
      else if (note.includes('trackStock=false')) reason = 'trackStock-false';

      skipReasons.push({
        movementId: m.movementId,
        productId: m.productId,
        productName: m.productName,
        reason,
        qty: Math.abs(Number(m.qty) || 0),
        note: m.note || '',
      });
      warnings.push(`${m.productName} skipped (${reason}) — no batch to restore`);
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
    // Phase 15.7 — per-skip-reason detail for the cancel modal copy.
    skipReasons,
  };
}

/**
 * Phase 15.7 (2026-04-28) — Pure helper that groups skipReasons by reason
 * type for the cancel-invoice modal copy. Each group carries:
 *   - count          → total items in this reason
 *   - totalQty       → sum of qty across items
 *   - itemNames      → unique productNames (deduped, max 5 in display)
 *
 * Reason taxonomy (mirrors _deductOneItem return.reason):
 *   - 'course-skip'         → user toggled "ไม่ตัดสต็อค" on the course's product item
 *   - 'trackStock-false'    → admin set product.stockConfig.trackStock=false
 *   - 'not-tracked'         → product never tracked + auto-init failed
 *   - 'no-batch-at-branch'  → tracked but zero batches at branch
 *   - 'shortfall'           → tracked + batches but insufficient qty
 *
 * Returns an object keyed by reason. Empty groups are omitted.
 */
export function summarizeSkipReasons(skipReasons) {
  const groups = {};
  if (!Array.isArray(skipReasons) || skipReasons.length === 0) return groups;
  for (const s of skipReasons) {
    if (!s || !s.reason) continue;
    if (!groups[s.reason]) {
      groups[s.reason] = { reason: s.reason, count: 0, totalQty: 0, itemNames: [] };
    }
    const g = groups[s.reason];
    g.count += 1;
    g.totalQty += Number(s.qty) || 0;
    const name = String(s.productName || '').trim();
    if (name && !g.itemNames.includes(name)) g.itemNames.push(name);
  }
  return groups;
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
  let list = snap.docs.map(d => ({ ...d.data(), id: d.id }));
  if (!includeInactive) list = list.filter(w => w.isActive !== false);
  list.sort((a, b) => (a.stockName || '').localeCompare(b.stockName || ''));
  return list;
}

/**
 * Combined branch + warehouse list for Transfer/Withdrawal UI selectors.
 * Returns: [{id, name, kind: 'branch'|'central'}] — branches first
 * (default-flagged first), then central warehouses.
 *
 * Phase BS regression-fix (2026-05-06) — pre-fix this hardcoded a single
 * 'main' branch + central warehouses; be_branches docs (e.g.
 * "นครราชสีมา") were NEVER in the list. Stock UI's name lookup
 * (currentLocation = locations.find(l => l.id === selectedBranchId))
 * couldn't resolve real branch IDs → fell back to displaying the raw
 * "BR-1777873556815-26df6480" string. User report:
 * "หน้า สต็อคก็เสือกโชว์คำว่า BR-1777873556815-26df6480 ทำไมไม่โชว์ชื่อสาขา".
 *
 * Now: pull be_branches alongside warehouses. Each branch entry uses
 * the human-readable `name` field.
 *
 * Phase 17.2 (2026-05-05): isDefault stripped (all branches equal peers).
 * No synthetic 'main' branch — when be_branches is empty, return only
 * warehouses; callers must guard on empty branch list.
 */
export async function listStockLocations() {
  const [warehouses, branches] = await Promise.all([
    listCentralWarehouses(),
    listBranches(),
  ]);
  const branchEntries = (branches || []).map(b => {
    const id = b.branchId || b.id;
    const name = (typeof b.name === 'string' && b.name.trim()) ? b.name : (b.branchName || id);
    return { id: String(id), name: String(name), kind: 'branch' };
  });
  // Sort branches alphabetically (Thai locale-aware).
  branchEntries.sort((a, b) => a.name.localeCompare(b.name, 'th'));
  return [
    ...branchEntries,
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
    // V48 (2026-05-08) — Rule O extension at the POISON GATE for transfer.
    // resolvedItems carries productName forward into destination batch +
    // RECEIVE movement (lines 7805/7824/7829). If we trust b.productName
    // here, poison propagates downstream. Live-resolve at this gate so
    // every downstream consumer of resolvedItems[i].productName is canonical.
    const liveTransferName = await _resolveProductNameLive(b.productId);
    resolvedItems.push({
      sourceBatchId: it.sourceBatchId,
      productId: b.productId,
      productName: liveTransferName || b.productName || '',
      qty: Number(it.qty),
      unit: b.unit || '',
      cost: Number(b.originalCost || 0),
      expiresAt: b.expiresAt || null,
      isPremium: !!b.isPremium,
      destinationBatchId: null, // filled on receive
    });
  }

  // AV172-exempt: writes a PENDING transfer doc only — NO be_stock_batches
  // write here. Lots are drained/created on the 0→1/1→2 transitions in
  // updateStockTransferStatus, which IS wired to _clearRedundantZeroLotsForProducts.
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
  const { MOVEMENT_TYPES, BATCH_STATUS, deductQtyNumeric, buildQtyNumeric, resolveBatchStatusForRemaining } = stockUtils;
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
      // Phase 15.4 (s19 item 5) — capture ผู้ส่ง on status 0→1.
      // V14 lock: _normalizeAuditUser returns {userId,userName} not undefined.
      patch.dispatchedByUser = _normalizeAuditUser(opts.user);
      patch.dispatchedAt = now;
    }
    if (next === 2) {
      // Phase 15.4 (s19 item 5) — capture ผู้รับ on status 1→2.
      patch.receivedByUser = _normalizeAuditUser(opts.user);
      patch.receivedAt = now;
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

  // V144 — a transfer touches BOTH the source (drain on send) and the
  // destination (new lot on receive). Build the (productId × location) keys
  // for both ends; the post-commit cleanup no-ops at whichever end didn't
  // change. (dedups internally.)
  const v144AffectedKeys = (Array.isArray(cur.items) ? cur.items : []).flatMap(it => ([
    { productId: it.productId, locationId: cur.sourceLocationId },
    { productId: it.productId, locationId: cur.destinationLocationId },
  ]));

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
      // 2026-05-31: single-source status. Export is guarded above (throws if
      // before < qty) so this never drives negative — anti-negative rule:
      // only TFP-treatment + sale may go negative; transfer-out blocks.
      const newStat = resolveBatchStatusForRemaining(newQty.remaining);
      tx.update(bRef, { qty: newQty, status: newStat, updatedAt: now });
      // V48 (2026-05-08) — Rule O extension. liveExportName comes from
      // the resolvedItems entry (live-resolved at create-transfer gate).
      const liveExportName = item.productName || '';
      const mvtId = _genMovementId();
      tx.set(stockMovementDoc(mvtId), {
        movementId: mvtId,
        type: MOVEMENT_TYPES.EXPORT_TRANSFER,
        batchId: item.sourceBatchId,
        productId: b.productId,
        productName: liveExportName || b.productName || '',
        qty: -item.qty,
        before,
        after: newQty.remaining,
        branchId: b.branchId,
        // Phase 15.4 (s19 items 3+4) — multi-branch visibility:
        // both source + destination branches see this movement via
        // listStockMovements({branchId}) array-contains query.
        branchIds: [b.branchId, cur.destinationLocationId].filter(Boolean),
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
    // Phase 15.6 (Issue 3, 2026-04-28) — FK validation: refuse to materialize
    // an orphan batch on the destination tier even if the source batch had
    // a stale productId. Forces admin to run /api/admin/cleanup-orphan-stock
    // first if any source batch is orphaned.
    await _assertProductExists(item.productId, `createStockTransfer:receive item=${item.sourceBatchId}`);

    // V36 (2026-04-29) — multi-writer-sweep: every batch-creating writer MUST
    // route through _ensureProductTracked so the destination tier's product
    // gets stockConfig.trackStock=true set. Pre-V36, transfer-receive
    // created batches WITHOUT flipping the flag → subsequent treatment
    // deduct on those batches silently SKIPped with note "product not yet
    // configured for stock tracking" because _getProductStockConfig saw
    // stockConfig missing/false. V12 multi-writer mirror of the V35
    // multi-reader sweep: when introducing an opt-in flag, audit ALL
    // writers, not just the canonical one. Idempotent (no-op if already
    // tracked). Audit-stock-flow S29 enforces.
    await _ensureProductTracked(item.productId, {
      setBy: 'updateStockTransferStatus._receiveAtDestination',
      unit: item.unit,
    });

    // Phase 15.7-bis (2026-04-28) — auto-repay negatives at destination
    // before creating a new batch. User directive: incoming positives
    // (transfer-in is a positive) must repay existing negatives FIFO.
    const repayResult = await _repayNegativeBalances({
      productId: String(item.productId || ''),
      branchId: String(cur.destinationLocationId || ''),
      incomingQty: Number(item.qty) || 0,
      movementType: MOVEMENT_TYPES.RECEIVE,
      sourceDocPath: docPath,
      linkedField: 'linkedTransferId',
      linkedFieldValue: transferId,
      cost: Number(item.cost) || 0,
      isPremium: !!item.isPremium,
      user,
      now,
      note: `Transfer receive repay (Transfer ${transferId})`,
    });
    const leftover = repayResult.leftover;

    let newBatchId = null;
    if (leftover > 0) {
      newBatchId = _genBatchId();
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
        qty: buildQtyNumeric(leftover),
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
        qty: leftover,
        before: 0,
        after: leftover,
        branchId: cur.destinationLocationId,
        // Phase 15.4 (s19 items 3+4) — multi-branch visibility:
        // both source + destination see this RECEIVE movement.
        branchIds: [cur.sourceLocationId, cur.destinationLocationId].filter(Boolean),
        sourceDocPath: docPath,
        linkedTransferId: transferId,
        revenueImpact: null,
        costBasis: item.cost * leftover,
        isPremium: item.isPremium,
        skipped: false,
        user,
        note: '',
        createdAt: now,
      });
    }
    // Return shape: legacy callers expect { destBatchId } string. Surface
    // repay info via attached fields so caller can accumulate per-item.
    return { newBatchId, repayResult };
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

  // AUDIT-V34 (2026-04-28) — KNOWN CAS+EXTERNAL-WORK PATTERN (deferred to V35):
  // Status is atomically advanced inside the runTransaction above (line ~5676)
  // BUT the heavy per-item work below runs OUTSIDE the tx. If `_exportFromSource`
  // throws after status is flipped to 1, transfer.status='dispatched' but no
  // batches deducted + no EXPORT_TRANSFER movements. Recovery requires admin
  // manual reconcile. Fix sketch: do per-item exports/receives INSIDE a
  // chunked tx (Firestore 500-op limit means most transfers fit; >250 items
  // would need partition). Defer until concurrent test bank surfaces a
  // realistic failure mode. Status flip at row level is itself atomic so
  // no double-fire risk; partial state is the residual concern.
  //
  // Execute the transition — status is already advanced atomically above.
  // Heavy work (batch mutations + movement writes) happens after the CAS so
  // the transfer doc isn't locked for the full duration.
  if (curStatus === 0 && next === 1) {
    for (const it of cur.items) await _exportFromSource(it);
  }
  else if (curStatus === 1 && next === 2) {
    const updatedItems = [];
    const repays = []; // Phase 15.7-bis — accumulate per-item repays for UX
    for (const it of cur.items) {
      const { newBatchId, repayResult } = await _receiveAtDestination(it);
      updatedItems.push({ ...it, destinationBatchId: newBatchId });
      if (repayResult && repayResult.totalRepaid > 0) {
        repays.push({
          productId: String(it.productId || ''),
          productName: String(it.productName || ''),
          totalRepaid: repayResult.totalRepaid,
          leftover: repayResult.leftover,
          repaidBatches: repayResult.repaidBatches,
        });
      }
    }
    await updateDoc(ref, { items: updatedItems, updatedAt: new Date().toISOString() });
    try { await _clearRedundantZeroLotsForProducts(v144AffectedKeys); } catch (e) { console.warn('[updateStockTransferStatus] V144 lot-clear skipped:', e?.message); }
    return { transferId, status: next, success: true, repays };
  }
  else if (curStatus === 1 && (next === 3 || next === 4)) {
    for (const it of cur.items) await _reverseExport(it.sourceBatchId);
  }
  try { await _clearRedundantZeroLotsForProducts(v144AffectedKeys); } catch (e) { console.warn('[updateStockTransferStatus] V144 lot-clear skipped:', e?.message); }
  return { transferId, status: next, success: true };
}

// audit-branch-scope: cross-tier — Phase 17.2-sexies audit (2026-05-05)
// `locationId` IS the branch boundary here: a transfer document spans 2
// stock locations (sourceLocationId + destinationLocationId), each tied
// to a branch retail floor or the central warehouse. Filtering by
// `locationId` already implicitly filters by branch. UI panels
// (StockTransferPanel) pass locationId from the location dropdown which
// is itself branch-scoped via scopedDataLayer.listStockLocations. When
// caller omits locationId entirely, the intent is "all transfers" — used
// by superadmin oversight + cross-branch reports.
export async function listStockTransfers({ locationId, status, includeAll } = {}) {
  const clauses = [];
  const snap = await getDocs(stockTransfersCol());
  let list = snap.docs.map(d => ({ ...d.data(), id: d.id }));
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
    // V48 (2026-05-08) — Rule O extension at the POISON GATE for withdrawal.
    // Mirror of createStockTransfer fix at line ~7621. resolvedItems carries
    // productName forward into destination batch + WITHDRAWAL_CONFIRM movement.
    const liveWithdrawName = await _resolveProductNameLive(b.productId);
    resolvedItems.push({
      sourceBatchId: it.sourceBatchId,
      productId: b.productId,
      productName: liveWithdrawName || b.productName || '',
      qty: Number(it.qty),
      unit: b.unit || '',
      cost: Number(b.originalCost || 0),
      expiresAt: b.expiresAt || null,
      isPremium: !!b.isPremium,
      destinationBatchId: null,
    });
  }

  // AV172-exempt: writes a PENDING withdrawal doc only — NO be_stock_batches
  // write here. Lots drained/created on the 0→1/1→2 transitions in
  // updateStockWithdrawalStatus, which IS wired to _clearRedundantZeroLotsForProducts.
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
  const { MOVEMENT_TYPES, BATCH_STATUS, deductQtyNumeric, buildQtyNumeric, resolveBatchStatusForRemaining } = stockUtils;

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
    if (next === 1) {
      // Phase 15.4 (s19 item 6) — capture ผู้อนุมัติและส่งสินค้า on status 0→1.
      // Withdrawal "approve+dispatch" is a single action (the admin approves
      // the request and immediately dispatches the goods).
      // V14 lock: _normalizeAuditUser returns {userId,userName} not undefined.
      patch.approvedByUser = _normalizeAuditUser(opts.user);
      patch.approvedAt = now;
    }
    if (next === 2) {
      // Phase 15.4 (s19 item 6) — capture ผู้รับสินค้า on status 1→2.
      patch.receivedByUser = _normalizeAuditUser(opts.user);
      patch.receivedAt = now;
    }
    if (next === 3) patch.canceledNote = String(opts.canceledNote || '');
    tx.update(ref, patch);
    return { ...c, _prevStatus: curStat };
  });
  const cur = claim;
  const curStatus = claim._prevStatus;
  const user = opts.user || cur.user || { userId: null, userName: null };

  const docPath = `artifacts/${appId}/public/data/be_stock_withdrawals/${withdrawalId}`;

  // V144 — withdrawal touches source (drain on send) + destination (new lot on
  // receive); build both-end keys, cleanup no-ops where nothing changed.
  const v144AffectedKeys = (Array.isArray(cur.items) ? cur.items : []).flatMap(it => ([
    { productId: it.productId, locationId: cur.sourceLocationId },
    { productId: it.productId, locationId: cur.destinationLocationId },
  ]));

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
      // 2026-05-31: single-source status. Withdrawal-out is guarded above
      // (throws if before < qty) so it never drives negative — anti-negative
      // rule: only TFP-treatment + sale may go negative; withdrawal-out blocks.
      const newStat = resolveBatchStatusForRemaining(newQty.remaining);
      tx.update(bRef, { qty: newQty, status: newStat, updatedAt: now });
      // V48 (2026-05-08) — Rule O extension. liveExportWdName from resolvedItems.
      const liveExportWdName = item.productName || '';
      const mvtId = _genMovementId();
      tx.set(stockMovementDoc(mvtId), {
        movementId: mvtId,
        type: MOVEMENT_TYPES.EXPORT_WITHDRAWAL,
        batchId: item.sourceBatchId,
        productId: b.productId,
        productName: liveExportWdName || b.productName || '',
        qty: -item.qty,
        before,
        after: newQty.remaining,
        branchId: b.branchId,
        // Phase 15.4 (s19 items 3+4) — multi-branch visibility.
        branchIds: [b.branchId, cur.destinationLocationId].filter(Boolean),
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
    // Phase 15.6 (Issue 3, 2026-04-28) — FK validation. Same rationale as
    // createStockTransfer:_receiveAtDestination above. Refuses orphan
    // materialization at the withdrawal destination tier.
    await _assertProductExists(item.productId, `createStockWithdrawal:receive item=${item.sourceBatchId}`);

    // V36 (2026-04-29) — multi-writer-sweep: mirror of the transfer-receive
    // fix above. Withdrawal-receive creates a NEW batch at the destination
    // tier; pre-V36 it skipped _ensureProductTracked → subsequent treatment
    // deduct silent-SKIPped. Idempotent. Audit-stock-flow S29 enforces.
    await _ensureProductTracked(item.productId, {
      setBy: 'updateStockWithdrawalStatus._receiveAtDestination',
      unit: item.unit,
    });

    // Phase 15.7-bis (2026-04-28) — auto-repay negatives at destination.
    const repayResult = await _repayNegativeBalances({
      productId: String(item.productId || ''),
      branchId: String(cur.destinationLocationId || ''),
      incomingQty: Number(item.qty) || 0,
      movementType: MOVEMENT_TYPES.WITHDRAWAL_CONFIRM,
      sourceDocPath: docPath,
      linkedField: 'linkedWithdrawalId',
      linkedFieldValue: withdrawalId,
      cost: Number(item.cost) || 0,
      isPremium: !!item.isPremium,
      user,
      now,
      note: `Withdrawal receive repay (Withdrawal ${withdrawalId})`,
    });
    const leftover = repayResult.leftover;

    let newBatchId = null;
    if (leftover > 0) {
      newBatchId = _genBatchId();
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
        qty: buildQtyNumeric(leftover),
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
        qty: leftover,
        before: 0,
        after: leftover,
        branchId: cur.destinationLocationId,
        // Phase 15.4 (s19 items 3+4) — multi-branch visibility.
        branchIds: [cur.sourceLocationId, cur.destinationLocationId].filter(Boolean),
        sourceDocPath: docPath,
        linkedWithdrawalId: withdrawalId,
        revenueImpact: null,
        costBasis: item.cost * leftover,
        isPremium: item.isPremium,
        skipped: false,
        user, note: '', createdAt: now,
      });
    }
    return { newBatchId, repayResult };
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
    const repays = []; // Phase 15.7-bis — accumulate per-item repays for UX
    for (const it of cur.items) {
      const { newBatchId, repayResult } = await _receiveAtDestination(it);
      updatedItems.push({ ...it, destinationBatchId: newBatchId });
      if (repayResult && repayResult.totalRepaid > 0) {
        repays.push({
          productId: String(it.productId || ''),
          productName: String(it.productName || ''),
          totalRepaid: repayResult.totalRepaid,
          leftover: repayResult.leftover,
          repaidBatches: repayResult.repaidBatches,
        });
      }
    }
    await updateDoc(ref, { items: updatedItems, updatedAt: new Date().toISOString() });
    try { await _clearRedundantZeroLotsForProducts(v144AffectedKeys); } catch (e) { console.warn('[updateStockWithdrawalStatus] V144 lot-clear skipped:', e?.message); }
    return { withdrawalId, status: next, success: true, repays };
  }
  else if (curStatus === 1 && next === 3) {
    for (const it of cur.items) await _reverseExport(it.sourceBatchId);
  }
  try { await _clearRedundantZeroLotsForProducts(v144AffectedKeys); } catch (e) { console.warn('[updateStockWithdrawalStatus] V144 lot-clear skipped:', e?.message); }
  return { withdrawalId, status: next, success: true };
}

// audit-branch-scope: cross-tier — Phase 17.2-sexies audit (2026-05-05)
// Same contract as listStockTransfers — `locationId` is the branch boundary.
export async function listStockWithdrawals({ locationId, status } = {}) {
  const snap = await getDocs(stockWithdrawalsCol());
  let list = snap.docs.map(d => ({ ...d.data(), id: d.id }));
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

/** Phase BSA — branch-scoped via _listWithBranchOrMerge. See helper docstring
 *  for legacy-doc gotcha. */
export async function listPromotions(opts = {}) {
  return _listWithBranchOrMerge(promotionsCol(), opts);
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
    branchId: _resolveBranchIdForWrite(data),
    createdAt: data.createdAt || now,
    updatedAt: now,
  }, { merge: false });
}

export async function deletePromotion(promotionId) {
  const id = String(promotionId || '');
  if (!id) throw new Error('promotionId required');
  await deleteDoc(promotionDoc(id));
}

// V50-followup (2026-05-08) — migrateMasterPromotionsToBe REMOVED. Inert
// dead code post-V50 (MasterDataTab + master_data Firestore rules deleted).
// New promotions land in be_promotions directly via PromotionFormModal.

// ─── Coupon CRUD (Phase 9 Marketing) ───────────────────────────────────────

const couponsCol = () => collection(db, ...basePath(), 'be_coupons');
const couponDoc = (id) => doc(db, ...basePath(), 'be_coupons', String(id));

export async function getCoupon(proClinicId) {
  const snap = await getDoc(couponDoc(proClinicId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Phase BSA — branch-scoped via _listWithBranchOrMerge. See helper docstring
 *  for legacy-doc gotcha. */
export async function listCoupons(opts = {}) {
  return _listWithBranchOrMerge(couponsCol(), opts);
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
    branchId: _resolveBranchIdForWrite(data),
    createdAt: data.createdAt || now,
    updatedAt: now,
  }, { merge: false });
}

export async function deleteCoupon(couponId) {
  const id = String(couponId || '');
  if (!id) throw new Error('couponId required');
  await deleteDoc(couponDoc(id));
}

// V50-followup (2026-05-08) — migrateMasterCouponsToBe REMOVED. See
// migrateMasterPromotionsToBe note above.

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

/** Phase BSA — branch-scoped via _listWithBranchOrMerge. See helper docstring
 *  for legacy-doc gotcha. */
export async function listVouchers(opts = {}) {
  return _listWithBranchOrMerge(vouchersCol(), opts);
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
    branchId: _resolveBranchIdForWrite(data),
    createdAt: data.createdAt || now, updatedAt: now,
  }, { merge: false });
}

export async function deleteVoucher(voucherId) {
  const id = String(voucherId || '');
  if (!id) throw new Error('voucherId required');
  await deleteDoc(voucherDoc(id));
}

// V50-followup (2026-05-08) — migrateMasterVouchersToBe REMOVED.

// ─── Audience CRUD (Phase 16.1 Smart Audience — 2026-04-30) ────────────────
// Saved query rules for marketing campaigns. Each doc stores a serialized
// rule tree (group AND/OR children with predicate leaves) plus metadata.
// Per Rule C2: ID minted client-side via crypto.getRandomValues (128-bit
// entropy) — no Math.random tokens.

const audiencesCol = () => collection(db, ...basePath(), 'be_audiences');
const audienceDoc = (id) => doc(db, ...basePath(), 'be_audiences', String(id));

/**
 * R-FK helper (audit fix): soft existence check against a be_* collection.
 * Throws BE_REF_NOT_FOUND if the referenced doc doesn't exist. Used at
 * write-time to catch orphan FKs before they land in Firestore.
 *
 * Pattern mirrors V35 `_assertProductExists`. Empty `id` is treated as a
 * no-op (caller's separate validator should reject empty refs).
 *
 * Usage:
 *   await _assertBeRefExists('be_products', productId, 'product');
 *   await _assertBeRefExists('be_courses',  courseId,  'course');
 *   await _assertBeRefExists('be_staff',    staffId,   'staff');
 */
async function _assertBeRefExists(collectionName, id, label) {
  const sid = String(id ?? '').trim();
  if (!sid) return;
  const ref = doc(db, ...basePath(), collectionName, sid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const err = new Error(
      `BE_REF_NOT_FOUND: ${label || collectionName}/${sid} ไม่พบใน ${collectionName} — อาจถูกลบไปแล้ว`,
    );
    err.code = 'BE_REF_NOT_FOUND';
    err.collection = collectionName;
    err.refId = sid;
    throw err;
  }
}

/**
 * Walk an audience rule tree and collect every `bought-x-in-last-n` predicate's
 * (kind, refId) pair. Used by saveAudience to verify each refId resolves to
 * a real be_products / be_courses doc at write-time (R-FK soft fix).
 */
function _collectAudienceBoughtRefs(node) {
  const out = [];
  if (!node || typeof node !== 'object') return out;
  if (node.kind === 'group' && Array.isArray(node.children)) {
    for (const c of node.children) out.push(..._collectAudienceBoughtRefs(c));
    return out;
  }
  if (node.kind === 'predicate' && node.type === 'bought-x-in-last-n') {
    const params = (node.params && typeof node.params === 'object') ? node.params : {};
    const kind = params.kind === 'course' ? 'course' : 'product';
    const refId = String(params.refId || '').trim();
    if (refId) out.push({ kind, refId });
  }
  return out;
}

const AUDIENCE_NAME_MAX = 80;
const AUDIENCE_DESC_MAX = 300;

/** Mint a fresh audience id. Format: `AUD-<ts>-<16hex>`. Caller passes to saveAudience. */
export function newAudienceId() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `AUD-${Date.now()}-${hex}`;
}

export async function getAudience(audienceId) {
  const id = String(audienceId || '').trim();
  if (!id) return null;
  const snap = await getDoc(audienceDoc(id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listAudiences() {
  const snap = await getDocs(audiencesCol());
  const items = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
  items.sort((a, b) => {
    const ua = a.updatedAt || '';
    const ub = b.updatedAt || '';
    if (ua !== ub) return ub.localeCompare(ua);
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });
  return items;
}

/**
 * Real-time listener variant. Mirrors listenToHolidays sort contract so a
 * UI sidebar can drop in onSnapshot without re-sorting.
 *
 * @param {(items: Array) => void} onChange
 * @param {(err: Error) => void} [onError]
 * @returns {() => void} unsubscribe
 */
export function listenToAudiences(onChange, onError) {
  return onSnapshot(audiencesCol(), (snap) => {
    const items = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    items.sort((a, b) => {
      const ua = a.updatedAt || '';
      const ub = b.updatedAt || '';
      if (ua !== ub) return ub.localeCompare(ua);
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
    onChange(items);
  }, onError);
}

export async function saveAudience(audienceId, data, opts = {}) {
  const id = String(audienceId || '').trim();
  if (!id) throw new Error('audienceId required');
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('data object required');

  const name = String(data.name || '').trim();
  if (!name) throw new Error('name required');
  if (name.length > AUDIENCE_NAME_MAX) throw new Error(`name > ${AUDIENCE_NAME_MAX} chars`);
  const descRaw = typeof data.description === 'string' ? data.description.trim() : '';
  if (descRaw.length > AUDIENCE_DESC_MAX) throw new Error(`description > ${AUDIENCE_DESC_MAX} chars`);

  // V14 + shape validation via the rule validator. Rejects undefined leaves
  // + unknown predicate types + malformed params before hitting Firestore.
  const { validateAudienceRule } = await import('./audienceValidation.js');
  const fail = validateAudienceRule(data.rule);
  if (fail) {
    const [field, msg] = fail;
    throw new Error(`audience.${field}: ${msg}`);
  }

  // R-FK soft fix (audit follow-up): every `bought-x-in-last-n.refId`
  // resolves to a real be_products / be_courses doc at write time. Catches
  // the picker-open / admin-deleted-master race. Opt-out via
  // opts.skipFKCheck=true for test fixtures.
  if (!opts.skipFKCheck) {
    const refs = _collectAudienceBoughtRefs(data.rule);
    for (const { kind, refId } of refs) {
      const col = kind === 'course' ? 'be_courses' : 'be_products';
      const label = kind === 'course' ? 'course' : 'product';
      // _assertBeRefExists throws BE_REF_NOT_FOUND with Thai error copy
      // — UI catches by code and prompts admin to re-pick.
      // eslint-disable-next-line no-await-in-loop
      await _assertBeRefExists(col, refId, label);
    }
  }

  const now = new Date().toISOString();
  const createdBy = typeof data.createdBy === 'string' ? data.createdBy : '';
  await setDoc(audienceDoc(id), {
    audienceId: id,
    name,
    description: descRaw,
    rule: data.rule,
    createdAt: data.createdAt || now,
    updatedAt: now,
    createdBy,
  }, { merge: false });
}

export async function deleteAudience(audienceId) {
  const id = String(audienceId || '').trim();
  if (!id) throw new Error('audienceId required');
  await deleteDoc(audienceDoc(id));
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

/** Phase BS V2 — accepts {branchId, allBranches}; default no filter (legacy compat). */
export async function listProductGroups({ branchId, allBranches = false } = {}) {
  const useFilter = branchId && !allBranches;
  const ref = useFilter
    ? query(productGroupsCol(), where('branchId', '==', String(branchId)))
    : productGroupsCol();
  const snap = await getDocs(ref);
  const items = snap.docs.map(d => ({ ...d.data(), id: d.id }));
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
    branchId: _resolveBranchIdForWrite(data),
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
export async function listProductGroupsForTreatment(productType, { branchId, allBranches = false } = {}) {
  const targetType = String(productType || '').trim();
  if (!targetType) return [];
  // Phase 17.0 — accept branchId opts + filter both queries when present.
  // No opts (test/back-end paths) preserves cross-branch behavior.
  const useFilter = branchId && !allBranches;
  const groupsRef = useFilter
    ? query(productGroupsCol(), where('branchId', '==', String(branchId)))
    : productGroupsCol();
  const productsRef = useFilter
    ? query(productsCol(), where('branchId', '==', String(branchId)))
    : productsCol();
  const [groupsSnap, productsSnap] = await Promise.all([
    getDocs(groupsRef),
    getDocs(productsRef),
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
    .map(d => ({ ...d.data(), id: d.id }))
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
 *
 * Phase 17.2-sexies (2026-05-05) — internal-leak fix: now accepts opts.branchId
 * + opts.allBranches and scopes the query so a duplicate-name check in
 * branch A no longer false-positives against an identically-named group in
 * branch B. scopedDataLayer wraps this with `_autoInject` so UI callers
 * don't have to pass branchId explicitly.
 */
export async function findProductGroupByName(name, opts = {}) {
  const q = String(name || '').trim().toLowerCase();
  if (!q) return null;
  const constraints = [];
  if (opts && opts.branchId && !opts.allBranches) {
    constraints.push(where('branchId', '==', opts.branchId));
  }
  const queryRef = constraints.length
    ? query(productGroupsCol(), ...constraints)
    : productGroupsCol();
  const snap = await getDocs(queryRef);
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

/** Phase BS V2 — accepts {branchId, allBranches}; default no filter (legacy compat). */
export async function listProductUnitGroups({ branchId, allBranches = false } = {}) {
  const useFilter = branchId && !allBranches;
  const ref = useFilter
    ? query(productUnitsCol(), where('branchId', '==', String(branchId)))
    : productUnitsCol();
  const snap = await getDocs(ref);
  const items = snap.docs.map(d => ({ ...d.data(), id: d.id }));
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
    branchId: _resolveBranchIdForWrite(data),
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

/** Phase BS V2 — accepts {branchId, allBranches}; default no filter (legacy compat). */
export async function listMedicalInstruments({ branchId, allBranches = false } = {}) {
  const useFilter = branchId && !allBranches;
  const ref = useFilter
    ? query(medicalInstrumentsCol(), where('branchId', '==', String(branchId)))
    : medicalInstrumentsCol();
  const snap = await getDocs(ref);
  const items = snap.docs.map(d => ({ ...d.data(), id: d.id }));
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
    branchId: _resolveBranchIdForWrite(data),
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

/** Phase BS V2 — accepts {branchId, allBranches}; default no filter (legacy compat). */
export async function listHolidays({ branchId, allBranches = false } = {}) {
  const useFilter = branchId && !allBranches;
  const ref = useFilter
    ? query(holidaysCol(), where('branchId', '==', String(branchId)))
    : holidaysCol();
  const snap = await getDocs(ref);
  const items = snap.docs.map(d => ({ ...d.data(), id: d.id }));
  items.sort((a, b) => {
    const ua = a.updatedAt || '';
    const ub = b.updatedAt || '';
    if (ua !== ub) return ub.localeCompare(ua);
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });
  return items;
}

/**
 * Real-time listener variant of `listHolidays`. Returns unsubscribe.
 * Phase 14.7.H follow-up H (2026-04-26) — extends 14.7.H-B listener cluster
 * to holidays. Multi-admin scenario: admin A edits a holiday in HolidaysTab
 * while admin B is mid-booking in AppointmentTab — without a listener, the
 * banner + skipHolidayCheck prompt in AppointmentFormModal stays stale until
 * full reload. With listener, every consumer (AppointmentTab banner +
 * AppointmentFormModal confirm + HolidaysTab CRUD list) refreshes within ~1s.
 *
 * Same sort contract as `listHolidays` (updatedAt desc, createdAt desc tiebreak)
 * so consumers can swap in-place.
 *
 * @param {(items: Array) => void} onChange
 * @param {(err: Error) => void} [onError]
 * @returns {() => void} unsubscribe
 */
/** Phase BS V2 — opts {branchId, allBranches} positional arg between
 * the function name and onChange. Backward-compat: if first arg is a
 * function, treat as legacy 2-arg shape (onChange, onError) and skip
 * the branch filter (cross-branch listener — pre-Phase-BS behavior). */
export function listenToHolidays(optsOrCallback, onChangeOrError, maybeOnError) {
  let opts = {};
  let onChange;
  let onError;
  if (typeof optsOrCallback === 'function') {
    onChange = optsOrCallback;
    onError = onChangeOrError;
  } else {
    opts = optsOrCallback || {};
    onChange = onChangeOrError;
    onError = maybeOnError;
  }
  const { branchId, allBranches = false } = opts || {};
  const useFilter = branchId && !allBranches;
  const q = useFilter
    ? query(holidaysCol(), where('branchId', '==', String(branchId)))
    : holidaysCol();
  return onSnapshot(q, (snap) => {
    const items = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    items.sort((a, b) => {
      const ua = a.updatedAt || '';
      const ub = b.updatedAt || '';
      if (ua !== ub) return ub.localeCompare(ua);
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
    onChange(items);
  }, onError);
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
    branchId: _resolveBranchIdForWrite(data),
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

// ─── Exam Room CRUD (Phase 18.0 Master Data Suite) ─────────────────────────
// Branch-scoped exam-room master. Each branch maintains its OWN list of
// rooms (independent — different counts + names per branch). User directive
// 2026-05-05: "ข้อมูลห้องตรวจจะต้องเก็บแยกเป็นสาขาไว้ และแต่ละสาขาใช้กัน
// ต่างหากไม่เกี่ยวข้องกัน". Mirrors holidays branch-scope pattern; consumed
// by ExamRoomsTab + AppointmentFormModal dropdown + AppointmentTab grid
// columns + DepositPanel deposit-with-appointment flow.

const examRoomsCol = () => collection(db, ...basePath(), 'be_exam_rooms');
const examRoomDoc = (id) => doc(db, ...basePath(), 'be_exam_rooms', String(id));

export async function getExamRoom(examRoomId) {
  const id = String(examRoomId || '');
  if (!id) return null;
  const snap = await getDoc(examRoomDoc(id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * List be_exam_rooms.
 * @param {Object} [opts]
 * @param {string}  [opts.branchId]    — filter to single branch
 * @param {boolean} [opts.allBranches] — bypass branch filter
 * @param {string}  [opts.status]      — additional status filter ('ใช้งาน' | 'พักใช้งาน')
 */
export async function listExamRooms({ branchId, allBranches = false, status } = {}) {
  const constraints = [];
  if (branchId && !allBranches) constraints.push(where('branchId', '==', String(branchId)));
  if (status) constraints.push(where('status', '==', String(status)));
  const ref = constraints.length ? query(examRoomsCol(), ...constraints) : examRoomsCol();
  const snap = await getDocs(ref);
  const items = snap.docs.map(d => ({ ...d.data(), id: d.id }));
  // Sort by sortOrder asc → name (Thai locale) for deterministic column order
  items.sort((a, b) =>
    (a.sortOrder || 0) - (b.sortOrder || 0) ||
    String(a.name || '').localeCompare(String(b.name || ''), 'th')
  );
  return items;
}

/**
 * Subscribe to be_exam_rooms for a single branch. Returns unsubscribe.
 * Wired through useBranchAwareListener in AppointmentTab + ExamRoomsTab.
 * Same sort contract as listExamRooms.
 *
 * @param {string} branchId — required (branch-scoped listener; cross-branch
 *                            uses listExamRooms({allBranches:true}) instead)
 * @param {(items: Array) => void} onChange
 * @param {(err: Error) => void} [onError]
 * @returns {() => void} unsubscribe
 */
export function listenToExamRoomsByBranch(branchId, onChange, onError) {
  const q = query(examRoomsCol(), where('branchId', '==', String(branchId || '')));
  return onSnapshot(q, (snap) => {
    const items = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    items.sort((a, b) =>
      (a.sortOrder || 0) - (b.sortOrder || 0) ||
      String(a.name || '').localeCompare(String(b.name || ''), 'th')
    );
    onChange(items);
  }, onError);
}

/**
 * Create or update an exam room. branchId stamped via _resolveBranchIdForWrite
 * (current selected branch unless explicitly overridden via opts.branchId).
 */
export async function saveExamRoom(examRoomId, data, opts = {}) {
  const id = String(examRoomId || '');
  if (!id) throw new Error('examRoomId required');
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('data object required');
  const { normalizeExamRoom, validateExamRoom } = await import('./examRoomValidation.js');
  const normalized = normalizeExamRoom(data);
  const fail = validateExamRoom(normalized);
  if (fail) {
    const [, msg] = fail;
    throw new Error(msg);
  }
  const now = new Date().toISOString();
  await setDoc(examRoomDoc(id), {
    ...normalized,
    branchId: _resolveBranchIdForWrite({ ...data, ...opts }),
    examRoomId: id,
    createdAt: data.createdAt || now,
    updatedAt: now,
  }, { merge: false });
}

export async function deleteExamRoom(examRoomId) {
  const id = String(examRoomId || '');
  if (!id) throw new Error('examRoomId required');
  await deleteDoc(examRoomDoc(id));
}

// ─── Branch CRUD (Phase 11.6 Master Data Suite) ────────────────────────────
// Core branch record (identification/contact/address/map + status).
// 7-day opening-hours deferred to Phase 13.
// Phase 17.2 (2026-05-05): isDefault stripped — all branches are equal
// peers. Newest-created branch is the implicit landing default (resolved
// in BranchContext.jsx).

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
  const items = snap.docs.map(d => ({ ...d.data(), id: d.id }));
  // Phase 17.2: newest-first by updatedAt then createdAt (no isDefault).
  items.sort((a, b) => {
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

  // Phase 17.2: no isDefault mutual-exclusion update — all branches equal peers.

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
  const items = snap.docs.map(d => ({ ...d.data(), id: d.id }));
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

/**
 * Phase 13.5.1 — chained listener for the current user's permission state.
 * V30 (2026-04-26) FIX: queries `be_staff WHERE firebaseUid == uid` instead
 * of `be_staff/{uid}` direct doc lookup. The doc ID is `staffId` (e.g.
 * `STF-XXX`), NOT the Firebase Auth uid — only `firebaseUid` field links
 * the doc to the auth account. Without this fix, every newly-created
 * staff with separate staffId vs firebaseUid was invisible to the soft-
 * gate listener → empty sidebar even after V29 sync-self set their claims.
 * (User report verbatim: "สิทธิ์เจ้าของกิจการที่เพิ่งสร้างใหม่ ก็ไม่เห็น
 * tab ใน backend อยู่ดี".)
 *
 * Subscribes to:
 *   - be_staff WHERE firebaseUid == uid LIMIT 1 (the staff doc for this user)
 *   - be_permission_groups/{groupId} (chained when staff.permissionGroupId resolves)
 *
 * Fires `onChange({ staff, group })` on any mutation to either result.
 *
 * Pattern follows Phase 14.7.H listener-cluster: 200ms debounce coalesces
 * rapid changes to avoid React re-render storms.
 *
 * Returns an unsubscribe function that tears down BOTH listeners.
 *
 * @param {string} uid - Firebase user uid; if empty, listener returns no-op
 * @param {(state: { staff: object | null, group: object | null }) => void} onChange
 * @param {(err: Error) => void} [onError]
 */
export function listenToUserPermissions(uid, onChange, onError) {
  if (!uid || typeof uid !== 'string') {
    // No uid — fire empty state once and return no-op unsub
    Promise.resolve().then(() => onChange?.({ staff: null, group: null }));
    return () => {};
  }
  let lastStaff = null;
  let lastGroup = null;
  let groupUnsub = null;
  let currentGroupId = null;
  let debounceTimer = null;

  const fire = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      try { onChange?.({ staff: lastStaff, group: lastGroup }); } catch (e) {
        if (onError) onError(e);
        else console.warn('[listenToUserPermissions] onChange handler threw', e);
      }
    }, 200);
  };

  const subscribeToGroup = (groupId) => {
    if (groupUnsub) { groupUnsub(); groupUnsub = null; }
    lastGroup = null;
    if (!groupId) { fire(); return; }
    groupUnsub = onSnapshot(
      permissionGroupDoc(groupId),
      (gsnap) => {
        lastGroup = gsnap.exists() ? { id: gsnap.id, ...gsnap.data() } : null;
        fire();
      },
      (err) => { if (onError) onError(err); }
    );
  };

  // V30 FIX: query by firebaseUid field, NOT by doc ID. be_staff doc IDs
  // are staffId (STF-XXX), Firebase Auth uid is in the `firebaseUid` field.
  const staffQuery = query(
    staffCol(),
    where('firebaseUid', '==', uid),
    limit(1),
  );

  const staffUnsub = onSnapshot(
    staffQuery,
    (querySnap) => {
      const docSnap = querySnap.docs[0] || null;
      lastStaff = docSnap ? { id: docSnap.id, ...docSnap.data() } : null;
      const newGroupId = lastStaff?.permissionGroupId || null;
      if (newGroupId !== currentGroupId) {
        currentGroupId = newGroupId;
        subscribeToGroup(newGroupId);
      } else {
        // Same group ref — staff metadata changed but listener carries on
        fire();
      }
    },
    (err) => { if (onError) onError(err); }
  );

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    staffUnsub();
    if (groupUnsub) groupUnsub();
  };
}

// V50-followup (2026-05-08) — Phase 11.8b bulk-import infrastructure REMOVED.
// Was: mapMasterToProductGroup / Unit / MedicalInstrument / Holiday / Branch /
// PermissionGroup / DfGroup / DfStaffRates / WalletType / MembershipType /
// MedicineLabel + migrate*ToBe wrappers + runMasterToBeMigration helper +
// IMPORT_TARGET_BRANCH_ID const. All consumed only by MasterDataTab.jsx
// (deleted in V50 Phase 2.2). Catalog CRUD now goes through ProductsTab /
// CoursesTab / DfGroupsTab / etc. directly against be_* via scopedDataLayer.

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

export async function listStaff({ includeHidden = false } = {}) {
  const snap = await getDocs(staffCol());
  // Phase 15.7-octies (2026-04-29) — compose `name` field at source
  // (mirror of listDoctors Phase 15.7-bis fix). be_staff stores
  // firstname/lastname/nickname (lowercase, ProClinic schema) but
  // consumers (AppointmentFormModal advisor picker, ActorPicker, etc.)
  // render `{s.name}` directly. Pre-fix s.name was undefined → empty
  // dropdown options (user report 2026-04-29: "ที่ปรึกษา ตอนนี้บั๊ค
  // ไม่แสดงอะไรเลย"). Source-level fix benefits every caller.
  // Composition order mirrors mergeSellersWithBranchFilter:8245-8250.
  //
  // V41 (2026-05-08) — `isHidden` filter. Default-filter `!isHidden` so
  // every picker auto-secures; opt in `{ includeHidden: true }` from
  // StaffTab + past-record lookup-map builders. Mirror be_products
  // isHidden precedent (line 10273). See AV20 audit invariant.
  const items = snap.docs.map(d => {
    const data = d.data();
    const parts = [data.firstname || data.firstName || '', data.lastname || data.lastName || ''].filter(Boolean);
    const composed = parts.join(' ').trim();
    const composedName = data.name || composed || data.nickname || data.fullName || '';
    return { id: d.id, ...data, name: composedName };
  });
  const visible = includeHidden ? items : items.filter(s => !s.isHidden);
  visible.sort((a, b) => {
    const ua = a.updatedAt || '';
    const ub = b.updatedAt || '';
    if (ua !== ub) return ub.localeCompare(ua);
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });
  return visible;
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

  // V41 (2026-05-08) — audit-stamp isHidden transition. Read the existing doc
  // BEFORE the write so we can detect transition; idempotent re-saves of the
  // same isHidden value preserve the original transition record.
  const existingSnap = await getDoc(staffDoc(id));
  const wasHidden = !!(existingSnap.exists?.() && existingSnap.data()?.isHidden);
  const willBeHidden = !!safe.isHidden;
  const auditStamps = {};
  if (wasHidden !== willBeHidden) {
    auditStamps.hiddenAt = willBeHidden ? serverTimestamp() : null;
    auditStamps.hiddenBy = willBeHidden ? (auth?.currentUser?.uid || null) : null;
  }

  const now = new Date().toISOString();
  await setDoc(staffDoc(id), {
    ...safe,
    ...auditStamps,
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

export async function listDoctors({ includeHidden = false } = {}) {
  const snap = await getDocs(doctorsCol());
  // Phase 15.7-bis (2026-04-28) — compose `name` field at source. be_doctors
  // stores firstname/lastname/nickname (ProClinic schema, lowercase) but
  // consumers (AppointmentFormModal picker, AppointmentTab grid via
  // doctorMap, DepositPanel picker, TreatmentFormPage assistants picker)
  // render `{d.name}` directly. Pre-fix d.name was undefined → empty
  // checkboxes in pickers (user report 2026-04-28: "ไม่แสดงชื่อแพทย์และ
  // ผู้ช่วยเลย ในการนัดหมาย"). Source-level fix benefits every caller.
  // Composition order mirrors mergeSellersWithBranchFilter:7937-7942.
  //
  // V41 (2026-05-08) — `isHidden` filter (mirror listStaff). Both regular
  // doctors (position:'แพทย์') and assistant doctors (position:'ผู้ช่วยแพทย์')
  // share the same flag.
  const items = snap.docs.map(d => {
    const data = d.data();
    const parts = [data.firstname || data.firstName || '', data.lastname || data.lastName || ''].filter(Boolean);
    const composed = parts.join(' ').trim();
    const composedName = data.name || composed || data.nickname || data.fullName || '';
    return { id: d.id, ...data, name: composedName };
  });
  const visible = includeHidden ? items : items.filter(d => !d.isHidden);
  visible.sort((a, b) => {
    // Doctors first, assistants second, then newest-first by updatedAt.
    const pa = a.position === 'แพทย์' ? 0 : 1;
    const pb = b.position === 'แพทย์' ? 0 : 1;
    if (pa !== pb) return pa - pb;
    const ua = a.updatedAt || '';
    const ub = b.updatedAt || '';
    if (ua !== ub) return ub.localeCompare(ua);
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });
  return visible;
}

// ─── Phase 14.10-tris (2026-04-26) — unified seller loader ──────────────
// User directive: "ทั้ง backend ใช้ database ตัวเองทั้งหมด ไม่ต้องการ
// mirror from master_data อีกสักที่เลย". Centralized helper that every
// backend tab can call to get a flat `[{ id, name }]` list of sellable
// staff (be_staff + be_doctors). Each entry expands its primary id
// (staffId/doctorId) AND any legacy proClinicId so OLD sales saved with
// numeric ProClinic ids still resolve to the human-readable name.
//
// Use this INSTEAD of `getAllMasterDataItems('staff')` /
// `getAllMasterDataItems('doctors')` in any backend UI that needs to
// display sellable staff.
/**
 * Pure helper exposed for testability — given staff + doctor arrays, return
 * the merged + branch-filtered seller list for ActorPicker dropdowns.
 *
 * Phase 15.5A (2026-04-28) extracted from listAllSellers so unit tests can
 * call it without mocking Firestore. Same dedup contract: later entries
 * (doctors) override earlier (staff) for the same id.
 *
 * @param {Array} staffList
 * @param {Array} doctorList
 * @param {object} [opts]
 * @param {string} [opts.branchId] — filter to sellers with this branch in branchIds[]
 * @returns {Array<{id: string, name: string}>}
 */
export function mergeSellersWithBranchFilter(staffList, doctorList, { branchId } = {}) {
  const buildName = (x) => {
    const parts = [x.firstname || x.firstName || '', x.lastname || x.lastName || ''].filter(Boolean);
    const composed = parts.join(' ').trim();
    return composed || x.nickname || x.name || x.fullName || '';
  };
  // Phase 15.5A — branch filter with legacy-fallback safety:
  //   - When `branchId` given: filter to sellers whose `branchIds[]` contains it.
  //   - Legacy fallback: sellers with NO `branchIds[]` field (or empty array
  //     after filtering falsy entries) are visible everywhere — we can't
  //     determine their branch assignment so safer to show than hide.
  //     Admin should backfill branchIds[] over time.
  //   - When `branchId` not given (or empty/null): no filter, returns all
  //     (preserves pre-15.5A behavior for historical display in reports +
  //     customer detail).
  const matchesBranch = (x) => {
    if (!branchId) return true; // no filter
    const ids = Array.isArray(x.branchIds) ? x.branchIds.filter(Boolean) : [];
    if (ids.length === 0) return true; // legacy fallback (visible everywhere)
    return ids.map(String).includes(String(branchId));
  };
  const expand = (x) => {
    const out = [];
    const name = buildName(x);
    if (!name) return out;
    if (!matchesBranch(x)) return out;
    const ids = new Set([x.id, x.staffId, x.doctorId, x.proClinicId]
      .filter((v) => v != null && String(v).trim() !== ''));
    for (const id of ids) out.push({ id: String(id), name });
    return out;
  };
  const safeStaff = Array.isArray(staffList) ? staffList : [];
  const safeDoctors = Array.isArray(doctorList) ? doctorList : [];
  const merged = [...safeStaff.flatMap(expand), ...safeDoctors.flatMap(expand)];
  // Dedupe by id — later entries (doctors) override earlier (staff) for same id
  const byId = new Map();
  merged.forEach((opt) => { byId.set(opt.id, opt); });
  return Array.from(byId.values());
}

/**
 * List all sellers (be_staff + be_doctors merged) for ActorPicker dropdowns.
 *
 * Phase 15.5A (2026-04-28) — optional `branchId` filter delegates to
 * `mergeSellersWithBranchFilter`. See that helper's JSDoc for filter semantics.
 *
 * @param {object} [opts]
 * @param {string} [opts.branchId] — filter to sellers assigned to this branch
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function listAllSellers({ branchId } = {}) {
  const [staffList, doctorList] = await Promise.all([listStaff(), listDoctors()]);
  return mergeSellersWithBranchFilter(staffList, doctorList, { branchId });
}

/**
 * Phase 16.5-ter (2026-04-29) — staff-only variant for actions that should
 * record a STAFF (not doctor) actor. User directive: "พนักงานในหน้าพนักงาน
 * ของสาขานั้นๆเท่านั้น" — Cancel/Exchange in remaining-course tab + cancel-
 * sale in SaleTab pick from be_staff (employees), branch-filtered, NOT doctors.
 *
 * Returns same {id, name}[] shape as listAllSellers for ActorPicker reuse.
 */
export async function listStaffByBranch({ branchId } = {}) {
  const staffList = await listStaff();
  return mergeSellersWithBranchFilter(staffList, [], { branchId });
}

// Phase 14.10-tris — be_membership_types listing (was master_data/membership_types)
export async function listMembershipTypes() {
  const snap = await getDocs(membershipTypesCol());
  const items = snap.docs.map(d => ({ ...d.data(), id: d.id }));
  items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return items;
}

// Phase 14.10-tris — be_wallet_types listing (was master_data/wallet_types)
export async function listWalletTypes() {
  const snap = await getDocs(walletTypesCol());
  const items = snap.docs.map(d => ({ ...d.data(), id: d.id }));
  items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return items;
}

export async function saveDoctor(doctorId, data) {
  const id = String(doctorId || '');
  if (!id) throw new Error('doctorId required');
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('data object required');
  const { normalizeDoctor, validateDoctor, composeDoctorName } = await import('./doctorValidation.js');

  const normalized = normalizeDoctor(data);
  const fail = validateDoctor(normalized);
  if (fail) {
    const [, msg] = fail;
    throw new Error(msg);
  }

  const { password: _drop, ...safe } = normalized;
  // Write chokepoint (2026-06-04): the appointment form + hub + reports read
  // `name` RAW (no resolver). The form has no `name` input, so recompute it from
  // the editable fields on EVERY save — never carry the old `name` verbatim (that
  // is how it went stale: rename → firstname/nickname change but `name` kept the
  // old value). composeDoctorName = (firstname+lastname).trim() || nickname.
  safe.name = composeDoctorName(normalized);

  // V41 (2026-05-08) — audit-stamp isHidden transition (mirror saveStaff).
  const existingSnap = await getDoc(doctorDoc(id));
  const wasHidden = !!(existingSnap.exists?.() && existingSnap.data()?.isHidden);
  const willBeHidden = !!safe.isHidden;
  const auditStamps = {};
  if (wasHidden !== willBeHidden) {
    auditStamps.hiddenAt = willBeHidden ? serverTimestamp() : null;
    auditStamps.hiddenBy = willBeHidden ? (auth?.currentUser?.uid || null) : null;
  }

  const now = new Date().toISOString();
  await setDoc(doctorDoc(id), {
    ...safe,
    ...auditStamps,
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

// V50-followup (2026-05-08) — Phase 12.1 staff/doctor migrators REMOVED.
// Was: mapMasterToStaff + mapMasterToDoctor + migrateMasterStaffToBe +
// migrateMasterDoctorsToBe. Consumed only by deleted MasterDataTab. Staff /
// doctor CRUD now goes through StaffTab / DoctorsTab + StaffFormModal /
// DoctorFormModal directly against be_staff / be_doctors.


// ─── Products CRUD (Phase 12.2) ─────────────────────────────────────────────

const productsCol = () => collection(db, ...basePath(), 'be_products');
const productDoc = (id) => doc(db, ...basePath(), 'be_products', String(id));

export async function getProduct(productId) {
  const id = String(productId || '');
  if (!id) return null;
  const snap = await getDoc(productDoc(id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Phase BS V2 — accepts {branchId, allBranches}; default no filter (legacy compat).
 *
 * Phase 24.0-vicies-novies-novies (V38, 2026-05-07): spread order swapped from
 * the legacy `id-first` shape to `{ ...d.data(), id: d.id }` so the Firestore
 * docId always wins, even when data has a stray `id` field. Baseline-migrated
 * docs (from `branch-merge-apply.mjs` / `customer-branch-baseline.js`) carry
 * an `id` field in their data that previously OVERRODE `d.id` in the spread,
 * causing handleDelete's `p.productId || p.id` fallback to resolve to the
 * wrong path → silent no-op delete. Rule of 3: see listCourses + audit AV17.
 */
export async function listProducts({ branchId, allBranches = false } = {}) {
  const useFilter = branchId && !allBranches;
  const ref = useFilter
    ? query(productsCol(), where('branchId', '==', String(branchId)))
    : productsCol();
  const snap = await getDocs(ref);
  const items = snap.docs.map(d => ({ ...d.data(), id: d.id }));
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
    branchId: _resolveBranchIdForWrite(data),
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

/** Phase BS V2 — accepts {branchId, allBranches}; default no filter (legacy compat).
 *
 * Phase 24.0-vicies-novies-novies (V38, 2026-05-07): spread order swapped — see
 * listProducts JSDoc above for full rationale. Mirror fix to keep both catalog
 * listers Rule-of-3 aligned. Audit AV17 enforces this pattern across listers.
 */
export async function listCourses({ branchId, allBranches = false } = {}) {
  const useFilter = branchId && !allBranches;
  const ref = useFilter
    ? query(coursesCol(), where('branchId', '==', String(branchId)))
    : coursesCol();
  const snap = await getDocs(ref);
  const items = snap.docs.map(d => ({ ...d.data(), id: d.id }));
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
    branchId: _resolveBranchIdForWrite(data),
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

// V50-followup (2026-05-08) — Phase 12.2 product/course migrators REMOVED.
// Was: mapMasterToProduct + mapMasterToCourse + migrateMasterProductsToBe +
// migrateMasterCoursesToBeV2. Consumed only by deleted MasterDataTab. New
// products / courses land in be_products / be_courses directly via
// ProductFormModal / CourseFormModal.


// ─── Bank Accounts CRUD (Phase 12.5) ────────────────────────────────────────

const bankAccountsCol = () => collection(db, ...basePath(), 'be_bank_accounts');
const bankAccountDoc = (id) => doc(db, ...basePath(), 'be_bank_accounts', String(id));

export async function getBankAccount(bankAccountId) {
  const id = String(bankAccountId || '');
  if (!id) return null;
  const snap = await getDoc(bankAccountDoc(id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Phase BS V2 — accepts {branchId, allBranches}; default no filter (legacy compat). */
export async function listBankAccounts({ branchId, allBranches = false } = {}) {
  const useFilter = branchId && !allBranches;
  const ref = useFilter
    ? query(bankAccountsCol(), where('branchId', '==', String(branchId)))
    : bankAccountsCol();
  const snap = await getDocs(ref);
  const items = snap.docs.map(d => ({ ...d.data(), id: d.id }));
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
    // Phase 17.2-sexies (2026-05-05) — internal-leak fix: previously read
    // ALL be_bank_accounts unfiltered. Saving an isDefault account in
    // branch A would unset isDefault on every bank account in every other
    // branch (cross-branch state corruption). isDefault is per-branch in
    // semantics (each branch has its own preferred deposit account).
    // Scope the mutex query to the same branch the new account belongs to.
    const targetBranch = _resolveBranchIdForWrite(data);
    const allSnap = targetBranch
      ? await getDocs(query(bankAccountsCol(), where('branchId', '==', targetBranch)))
      : await getDocs(bankAccountsCol()); // legacy fallback when no branchId resolvable
    const batch = writeBatch(db);
    for (const d of allSnap.docs) {
      if (d.id !== id && d.data().isDefault === true) {
        batch.update(bankAccountDoc(d.id), { isDefault: false, updatedAt: new Date().toISOString() });
      }
    }
    await batch.commit();
  }

  const now = new Date().toISOString();
  await setDoc(bankAccountDoc(id), {
    ...normalized,
    branchId: _resolveBranchIdForWrite(data),
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

/** Phase BS V2 — accepts {branchId, allBranches}; default no filter (legacy compat). */
export async function listExpenseCategories({ branchId, allBranches = false } = {}) {
  const useFilter = branchId && !allBranches;
  const ref = useFilter
    ? query(expenseCategoriesCol(), where('branchId', '==', String(branchId)))
    : expenseCategoriesCol();
  const snap = await getDocs(ref);
  const items = snap.docs.map(d => ({ ...d.data(), id: d.id }));
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
    branchId: _resolveBranchIdForWrite(data),
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

/**
 * List expenses with optional date / category / branch filters.
 *
 * Phase BS (2026-05-06) — adds explicit `allBranches` opt. When `branchId`
 * is passed AND `allBranches` is true, the branchId filter is bypassed
 * (cross-branch report aggregators that intentionally want every branch
 * use this to avoid accidental scoping if the caller forgets to omit
 * branchId). Legacy semantics preserved: omitting branchId = no filter.
 */
export async function listExpenses({ startDate, endDate, categoryId, branchId, allBranches = false } = {}) {
  const snap = await getDocs(expensesCol());
  let items = snap.docs.map(d => ({ ...d.data(), id: d.id }));
  if (startDate) items = items.filter(e => (e.date || '') >= startDate);
  if (endDate) items = items.filter(e => (e.date || '') <= endDate);
  if (categoryId) items = items.filter(e => e.categoryId === categoryId);
  if (branchId && !allBranches) items = items.filter(e => e.branchId === branchId);
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

export async function listOnlineSales({ status, startDate, endDate, branchId, allBranches = false } = {}) {
  let items = await _listWithBranch(onlineSalesCol(), { branchId, allBranches });
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
    branchId: _resolveBranchIdForWrite(data),
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

export async function listSaleInsuranceClaims({ saleId, status, startDate, endDate, branchId, allBranches = false } = {}) {
  let items = await _listWithBranch(saleInsuranceClaimsCol(), { branchId, allBranches });
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
    branchId: _resolveBranchIdForWrite(data),
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
  let items = snap.docs.map(d => ({ ...d.data(), id: d.id }));
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

// ─── Phase 14.9 — Document Print Audit Log (2026-04-26) ─────────────────
// Append-only ledger of every print + PDF export action. Required for
// compliance + traceability ("who printed what for whom and when?").
// Firestore rule: create allowed for clinic staff; update/delete forbidden
// (matches V19 lesson — append-only contracts must be enforced at the rule
// layer, not just code).
//
// Schema:
//   {
//     printId, templateId, templateName, docType, customerId, customerHN,
//     customerName, action: 'print'|'pdf', language, paperSize,
//     staffUid, staffEmail, staffName, ts (serverTimestamp)
//   }

const documentPrintsCol = () => collection(db, ...basePath(), 'be_document_prints');
const documentPrintDoc = (id) => doc(db, ...basePath(), 'be_document_prints', String(id));
const documentDraftsCol = () => collection(db, ...basePath(), 'be_document_drafts');
const documentDraftDoc = (id) => doc(db, ...basePath(), 'be_document_drafts', String(id));

export async function recordDocumentPrint(payload = {}) {
  // Generate print id with crypto-random suffix (per V31 / Rule C2 — no insecure RNG)
  const tsCompact = new Date().toISOString().slice(0, 16).replace(/[:T-]/g, '').slice(0, 12);
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  const printId = `PRT-${tsCompact}-${rand}`;

  const u = auth?.currentUser;
  const safe = (v) => (v == null ? '' : String(v));
  const nowIso = new Date().toISOString();

  const data = {
    printId,
    templateId: safe(payload.templateId),
    templateName: safe(payload.templateName),
    docType: safe(payload.docType),
    customerId: safe(payload.customerId),
    customerHN: safe(payload.customerHN),
    customerName: safe(payload.customerName),
    action: payload.action === 'pdf' ? 'pdf' : 'print',
    language: safe(payload.language || 'th'),
    paperSize: safe(payload.paperSize || 'A4'),
    staffUid: safe(u?.uid),
    staffEmail: safe(u?.email),
    staffName: safe(payload.staffName || u?.displayName || u?.email),
    ts: nowIso,
    // Phase 14.9 marker — easy to audit-grep "where did print events come from"
    sourceVersion: 'phase-14.9',
  };

  await setDoc(documentPrintDoc(printId), data, { merge: false });
  return { printId };
}

// ─── Phase 14.10 — Document Print Saved Drafts (2026-04-26) ──────────────
// Saves an in-progress print form so admin doesn't lose 10-min fill if they
// navigate away. Drafts are scoped to (templateId + customerId + caller uid)
// — auto-resume picks up the most recent matching draft on modal open.
//
// Schema:
//   {
//     draftId: 'DFT-<ts>-<rand>',
//     templateId, customerId, customerHN, customerName,
//     values: { ... }, language, toggles,
//     staffUid, staffEmail,
//     updatedAt (ISO),
//   }
//
// Lifecycle: writer is upsert (setDoc, merge:true). Drafts auto-purge after
// 30 days (cron later) — for now manual delete from UI.
export async function saveDocumentDraft(draftId, payload = {}) {
  const id = String(draftId || '').trim();
  if (!id) throw new Error('draftId required');
  const u = auth?.currentUser;
  const safe = (v) => (v == null ? '' : String(v));
  const data = {
    draftId: id,
    templateId: safe(payload.templateId),
    customerId: safe(payload.customerId),
    customerHN: safe(payload.customerHN),
    customerName: safe(payload.customerName),
    values: payload.values && typeof payload.values === 'object' ? payload.values : {},
    language: safe(payload.language || 'th'),
    toggles: payload.toggles && typeof payload.toggles === 'object' ? payload.toggles : {},
    staffUid: safe(u?.uid),
    staffEmail: safe(u?.email),
    updatedAt: new Date().toISOString(),
  };
  await setDoc(documentDraftDoc(id), data, { merge: true });
  return { draftId: id };
}

export async function getDocumentDraft(draftId) {
  const id = String(draftId || '').trim();
  if (!id) return null;
  const snap = await getDoc(documentDraftDoc(id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listDocumentDrafts({ templateId, customerId, staffUid, limit: maxLimit = 25 } = {}) {
  const snap = await getDocs(documentDraftsCol());
  let items = snap.docs.map(d => ({ ...d.data(), id: d.id }));
  if (templateId) items = items.filter(i => i.templateId === templateId);
  if (customerId) items = items.filter(i => i.customerId === customerId);
  if (staffUid) items = items.filter(i => i.staffUid === staffUid);
  // Newest-first by updatedAt (ISO string sort works)
  items.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  return items.slice(0, Math.max(1, maxLimit));
}

export async function deleteDocumentDraft(draftId) {
  const id = String(draftId || '').trim();
  if (!id) throw new Error('draftId required');
  await deleteDoc(documentDraftDoc(id));
}

/**
 * Find the most-recent matching draft for the current caller +
 * (templateId, customerId) tuple. Useful for auto-resume on modal open.
 */
export async function findResumableDraft({ templateId, customerId } = {}) {
  const u = auth?.currentUser;
  if (!u || !templateId) return null;
  const drafts = await listDocumentDrafts({
    templateId,
    customerId: customerId || '',
    staffUid: u.uid,
    limit: 1,
  });
  return drafts[0] || null;
}

export async function listDocumentPrints({ limit: maxLimit = 100, customerId, docType } = {}) {
  // Read-only client-side filter — keeps query rule-safe (no compound
  // index needed). Caller may want recent N events for a customer or doc.
  const snap = await getDocs(documentPrintsCol());
  let items = snap.docs.map(d => ({ ...d.data(), id: d.id }));
  if (customerId) items = items.filter(i => i.customerId === customerId);
  if (docType) items = items.filter(i => i.docType === docType);
  items.sort((a, b) => {
    // Newest first — ts is ISO string, sort lexicographically
    const at = String(a.ts || '');
    const bt = String(b.ts || '');
    return bt.localeCompare(at);
  });
  return items.slice(0, Math.max(1, maxLimit));
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
  const existing = snap.docs.map(d => ({ ...d.data(), id: d.id }));
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
  let items = snap.docs.map(d => ({ ...d.data(), id: d.id }));
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

export async function listVendorSales({ vendorId, status, startDate, endDate, branchId, allBranches = false } = {}) {
  let items = await _listWithBranch(vendorSalesCol(), { branchId, allBranches });
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
    branchId: _resolveBranchIdForWrite(data),
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

/**
 * List quotations sorted newest-first.
 *
 * Phase BS (2026-05-06) — branch-scoped read. Same `{branchId, allBranches}`
 * opts contract as `getAllSales`. Legacy callers (no opts) get
 * unfiltered global behavior (preserves QuotationTab pre-Phase-BS shape).
 */
export async function listQuotations(opts = {}) {
  const { branchId, allBranches = false } = opts || {};
  const useFilter = branchId && !allBranches;
  const ref = useFilter
    ? query(quotationsCol(), where('branchId', '==', String(branchId)))
    : quotationsCol();
  const snap = await getDocs(ref);
  const items = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
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

/** Phase BS V2 — accepts {branchId, allBranches}; default no filter (legacy compat). */
export async function listDfGroups({ branchId, allBranches = false } = {}) {
  const useFilter = branchId && !allBranches;
  const ref = useFilter
    ? query(dfGroupsCol(), where('branchId', '==', String(branchId)))
    : dfGroupsCol();
  const snap = await getDocs(ref);
  const items = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
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
    branchId: _resolveBranchIdForWrite(data),
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

/** Phase BS V2 — accepts {branchId, allBranches}; default no filter (legacy compat). */
export async function listDfStaffRates({ branchId, allBranches = false } = {}) {
  const useFilter = branchId && !allBranches;
  const ref = useFilter
    ? query(dfStaffRatesCol(), where('branchId', '==', String(branchId)))
    : dfStaffRatesCol();
  const snap = await getDocs(ref);
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
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
    branchId: _resolveBranchIdForWrite(data),
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
/** Phase BS V2 — filters now also accept {branchId, allBranches}. Default no
 * filter (legacy compat). When branchId given AND !allBranches, server-side
 * where('branchId', '==', X) prunes payload before client-side staff/date filters. */
export async function listStaffSchedules(filters = {}) {
  const { staffId, startDate, endDate, branchId, allBranches = false } = filters || {};
  const useBranchFilter = branchId && !allBranches;
  const ref = useBranchFilter
    ? query(staffSchedulesCol(), where('branchId', '==', String(branchId)))
    : staffSchedulesCol();
  const snap = await getDocs(ref);
  let items = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
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
    branchId: _resolveBranchIdForWrite(data),
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

// V50-followup (2026-05-08) — Phase 13.2.14 staff-schedule migrator REMOVED.
// Was: mapMasterToBeStaffSchedule + migrateMasterStaffSchedulesToBe. Consumed
// only by deleted MasterDataTab. Schedule entries land in be_staff_schedules
// directly via DoctorSchedulesTab / EmployeeSchedulesTab modals.


/**
 * Phase 13.2.6 — return the EFFECTIVE schedule for a single date, merging
 * per-date overrides over recurring weekly shifts (override wins).
 *
 * Pure-data — fetches all be_staff_schedules then filters via the pure
 * `mergeSchedulesForDate` helper from staffScheduleValidation.js.
 *
 * @param {string} targetDate - YYYY-MM-DD
 * @param {Array<string>} [staffIdsFilter]
 * @returns {Promise<Array<{staffId, type, source, startTime, endTime, ...}>>}
 */
export async function getActiveSchedulesForDate(targetDate, staffIdsFilter, branchId) {
  // Phase 17.2-ter (2026-05-05) — accept branchId positional arg (5th in the
  // chained call shape, 3rd here). Safe-by-default: null branchId returns []
  // instead of leaking cross-branch via the unfiltered listStaffSchedules
  // call. This was the root cause of the TodaysDoctorsPanel leak — the
  // panel showed every branch's doctors on the selected date even after
  // the user switched to a branch with no schedule data.
  const effectiveBranchId = branchId !== undefined ? branchId : resolveSelectedBranchId();
  if (!effectiveBranchId) return [];
  const { mergeSchedulesForDate } = await import('./staffScheduleValidation.js');
  const all = await listStaffSchedules({ branchId: effectiveBranchId });
  return mergeSchedulesForDate(targetDate, all, staffIdsFilter);
}

/**
 * Phase 13.2.6 — live listener variant of getActiveSchedulesForDate. Fires
 * the callback whenever ANY be_staff_schedules entry mutates. Caller is
 * expected to debounce in their state setter (or use existing
 * listener-cluster pattern). Returns unsub function.
 *
 * @param {string} targetDate - YYYY-MM-DD
 * @param {(merged: Array) => void} onChange
 * @param {Array<string>} [staffIdsFilter]
 * @param {(err: Error) => void} [onError]
 */
export function listenToScheduleByDay(targetDate, onChange, staffIdsFilter, onError, branchId) {
  // Phase 17.2-ter (2026-05-05) — accept branchId positional (5th arg).
  // Safe-by-default: null branchId emits [] once + returns no-op unsub.
  // Pre-fix: onSnapshot(staffSchedulesCol(), ...) was unfiltered → fed
  // every branch's schedules into the merge function → TodaysDoctorsPanel
  // showed phantom "doctor on duty" entries from other branches.
  const effectiveBranchId = branchId !== undefined ? branchId : resolveSelectedBranchId();
  if (!effectiveBranchId) {
    try { onChange?.([]); } catch (e) {
      if (onError) onError(e);
    }
    return () => {};
  }

  let timer = null;
  const fire = (merged) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      try { onChange?.(merged); } catch (e) {
        if (onError) onError(e);
        else console.warn('[listenToScheduleByDay] handler threw', e);
      }
    }, 200);
  };
  // We have to import inside the closure to avoid a top-level circular
  // import (staffScheduleValidation imports nothing from backendClient).
  let mergeFn = null;
  import('./staffScheduleValidation.js').then((m) => { mergeFn = m.mergeSchedulesForDate; });

  const branchScopedRef = query(
    staffSchedulesCol(),
    where('branchId', '==', String(effectiveBranchId)),
  );
  const unsub = onSnapshot(
    branchScopedRef,
    (snap) => {
      const all = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      // mergeFn might still be loading on the very first snapshot — fall
      // back to a sync require pattern if so. In practice the import
      // resolves microtasks before the first snapshot, but be defensive.
      if (!mergeFn) {
        import('./staffScheduleValidation.js').then((m) => {
          fire(m.mergeSchedulesForDate(targetDate, all, staffIdsFilter));
        });
        return;
      }
      fire(mergeFn(targetDate, all, staffIdsFilter));
    },
    (err) => { if (onError) onError(err); },
  );
  return () => {
    if (timer) clearTimeout(timer);
    unsub();
  };
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

// ═══════════════════════════════════════════════════════════════════════════
// Phase 15.7-novies (2026-04-29) — phantom branch purge
// ═══════════════════════════════════════════════════════════════════════════
// Client SDK CANNOT delete be_stock_batches / be_stock_movements /
// be_stock_orders / be_stock_transfers — firestore.rules has
// `allow delete: if false` on all four (audit-immutability per S3 + V19).
//
// Use the firebase-admin endpoint instead:
//
//   POST /api/admin/cleanup-phantom-branch
//   { action: 'list', phantomId: 'BR-1777095572005-ae97f911' }     → DRY-RUN counts
//   { action: 'delete', phantomId: '...', confirm: true }          → actual delete
//
// The endpoint uses firebase-admin SDK (bypasses rules) so it can
// purge audit-immutable collections too. It mirrors the cleanup-test-*
// pattern (Phase 15.6) — admin-token verified, two-phase list→delete.
//
// Spec: docs/superpowers/specs/2026-04-29-br-phantom-cleanup-design.md

// ─── Phase BSA — universal listener markers ─────────────────────────────────
// useBranchAwareListener (Phase BSA Task 5) checks fn.__universal__ to skip
// branchId injection. Customer-attached + audience + permission listeners
// cross branches (one customer may visit multiple branches; audiences filter
// globally; permissions are per-user). Branch-scoped listeners
// (listenToAppointmentsByDate / listenToAllSales / listenToHolidays /
// listenToScheduleByDay) remain unmarked — the hook injects current branchId
// for them and re-subscribes on branch switch.
listenToCustomer.__universal__ = true;
listenToCustomerTreatments.__universal__ = true;
listenToCustomerAppointments.__universal__ = true;
listenToCustomerSales.__universal__ = true;
listenToCustomerFinance.__universal__ = true;
listenToCourseChanges.__universal__ = true;
listenToAudiences.__universal__ = true;
listenToUserPermissions.__universal__ = true;

// ═══ Phase 29 (2026-05-14) — Recall System ════════════════════════════════
// be_recalls is branch-scoped per BSA Rule L (branchId field). Listers
// follow BS-13 safe-by-default — when branchId is falsy AND !allBranches,
// return empty (no cross-branch leak). Customer-scoped listers are universal
// (sanctioned exception SG10: recalls for a customer cross branches).
//
// Doc shape per spec § 6 — 25 fields (id/branch/customer denorm/slotType/
// source/schedule/pairing/lifecycle/no-answer escalation/LINE/audit).

const recallsCol = () => collection(db, ...basePath(), 'be_recalls');
const recallDoc = (id) => doc(db, ...basePath(), 'be_recalls', id);

function _newRecallId() {
  const tsCompact = Date.now().toString(36);
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  return `RECALL-${tsCompact}-${rand}`;
}

function _resolveRecallAttribution() {
  const u = auth?.currentUser;
  return {
    uid: u?.uid || null,
    name: u?.displayName || u?.email || 'unknown',
    role: 'admin',
  };
}

/**
 * Phase 29 — list recalls (branch-scoped, with optional filters).
 * Safe-by-default per BS-13: when branchId is falsy AND !allBranches → returns [].
 */
export async function listRecalls({ branchId = '', allBranches = false, status, dateBefore } = {}) {
  const effectiveBranchId = (typeof branchId === 'string' && branchId)
    ? branchId
    : (allBranches ? null : resolveSelectedBranchId());
  if (!effectiveBranchId && !allBranches) return [];

  const clauses = [];
  if (!allBranches && effectiveBranchId) clauses.push(where('branchId', '==', String(effectiveBranchId)));
  if (status) clauses.push(where('status', '==', status));
  if (dateBefore) clauses.push(where('recallDate', '<=', dateBefore));
  clauses.push(orderBy('recallDate', 'asc'));

  const q = query(recallsCol(), ...clauses);
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ ...d.data(), id: d.id }));
}

/**
 * Phase 29 — list recalls for a specific customer (universal — not branch-
 * scoped per BSA sanctioned exception SG10). Recalls follow the customer
 * across branches because a customer may visit multiple branches.
 */
export async function listRecallsForCustomer(customerId) {
  if (!customerId) return [];
  const q = query(recallsCol(), where('customerId', '==', String(customerId)), orderBy('recallDate', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ ...d.data(), id: d.id }));
}

/**
 * Phase 29 — real-time listener for branch-scoped recall list.
 * Safe-by-default per BS-13.
 */
export function listenToRecalls({ branchId = '', allBranches = false, status, dateBefore } = {}, onChange, onError) {
  const effectiveBranchId = (typeof branchId === 'string' && branchId)
    ? branchId
    : (allBranches ? null : resolveSelectedBranchId());
  if (!effectiveBranchId && !allBranches) {
    setTimeout(() => onChange?.([]), 0);
    return () => {};
  }

  const clauses = [];
  if (!allBranches && effectiveBranchId) clauses.push(where('branchId', '==', String(effectiveBranchId)));
  if (status) clauses.push(where('status', '==', status));
  if (dateBefore) clauses.push(where('recallDate', '<=', dateBefore));
  clauses.push(orderBy('recallDate', 'asc'));

  const q = query(recallsCol(), ...clauses);
  return onSnapshot(q, (snap) => {
    const items = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    onChange?.(items);
  }, onError);
}

/**
 * Phase 29 — real-time listener per customer (universal, sanctioned
 * exception SG10 — recalls follow customer across branches).
 */
export function listenToRecallsForCustomer(customerId, onChange, onError) {
  if (!customerId) {
    setTimeout(() => onChange?.([]), 0);
    return () => {};
  }
  const q = query(recallsCol(), where('customerId', '==', String(customerId)), orderBy('recallDate', 'asc'));
  return onSnapshot(q, (snap) => {
    const items = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    onChange?.(items);
  }, onError);
}

/**
 * Phase 29 — create a single recall doc. Stamps audit fields + 'pending'.
 */
export async function createRecall(payload = {}) {
  const id = _newRecallId();
  const now = serverTimestamp();
  const branchId = _resolveBranchIdForWrite({ branchId: payload.branchId });
  const me = _resolveRecallAttribution();
  await setDoc(recallDoc(id), {
    id, branchId,
    customerId: payload.customerId || '',
    customerName: payload.customerName || '',
    customerPhone: payload.customerPhone || '',
    customerLineUserId: payload.customerLineUserId || null,
    customerHN: payload.customerHN || null,
    slotType: payload.slotType || 'revisit',
    source: payload.source || 'manual',
    sourceTreatmentId: payload.sourceTreatmentId || null,
    sourceProductId: payload.sourceProductId || null,
    sourceProductName: payload.sourceProductName || null,
    sourceCourseId: payload.sourceCourseId || null,
    sourceCourseName: payload.sourceCourseName || null,
    recallDate: payload.recallDate || '',
    reason: payload.reason || '',
    snoozedUntil: null,
    pairedRecallId: payload.pairedRecallId || null,
    status: 'pending',
    outcome: null, outcomeNote: null, outcomeAt: null, outcomeBy: null,
    noAnswerCount: 0, requiresManualReview: false,
    lineMessageSent: false, lineMessageSentAt: null, lineMessageTemplate: null,
    lineMessageText: null, lineMessageBy: null,
    createdAt: now, createdBy: me, updatedAt: now, updatedBy: me,
  });
  return { id };
}

/**
 * Phase 29 — atomic batch create of 2 paired recalls (slot1=aftercare,
 * slot2=revisit). Both stamped with the other's id in `pairedRecallId`.
 */
export async function createRecallPair({
  branchId, customerId, customerName, customerPhone, customerLineUserId, customerHN,
  source, sourceTreatmentId, sourceProductId, sourceProductName, sourceCourseId, sourceCourseName,
  slot1, slot2,
} = {}) {
  const id1 = _newRecallId();
  // Tiny stagger to guarantee different timestamps in id (idempotency)
  await new Promise(r => setTimeout(r, 1));
  const id2 = _newRecallId();
  const now = serverTimestamp();
  const resolvedBranchId = _resolveBranchIdForWrite({ branchId });
  const me = _resolveRecallAttribution();
  const baseFields = {
    branchId: resolvedBranchId,
    customerId: customerId || '',
    customerName: customerName || '',
    customerPhone: customerPhone || '',
    customerLineUserId: customerLineUserId || null,
    customerHN: customerHN || null,
    source: source || 'manual',
    sourceTreatmentId: sourceTreatmentId || null,
    sourceProductId: sourceProductId || null,
    sourceProductName: sourceProductName || null,
    sourceCourseId: sourceCourseId || null,
    sourceCourseName: sourceCourseName || null,
    snoozedUntil: null, status: 'pending',
    outcome: null, outcomeNote: null, outcomeAt: null, outcomeBy: null,
    noAnswerCount: 0, requiresManualReview: false,
    lineMessageSent: false, lineMessageSentAt: null, lineMessageTemplate: null,
    lineMessageText: null, lineMessageBy: null,
    createdAt: now, createdBy: me, updatedAt: now, updatedBy: me,
  };
  const batch = writeBatch(db);
  batch.set(recallDoc(id1), {
    id: id1, slotType: 'aftercare',
    recallDate: slot1?.recallDate || '',
    reason: slot1?.reason || '',
    pairedRecallId: id2,
    ...baseFields,
  });
  batch.set(recallDoc(id2), {
    id: id2, slotType: 'revisit',
    recallDate: slot2?.recallDate || '',
    reason: slot2?.reason || '',
    pairedRecallId: id1,
    ...baseFields,
  });
  await batch.commit();
  return { id1, id2 };
}

/**
 * Phase 29 — generic update with audit stamps.
 */
export async function updateRecall(id, patch = {}) {
  const me = _resolveRecallAttribution();
  await updateDoc(recallDoc(id), { ...patch, updatedAt: serverTimestamp(), updatedBy: me });
}

/**
 * Phase 29 — record outcome + auto-snooze on no-answer + manual-review
 * flag escalation at 3 consecutive no-answers.
 *
 * Pass `currentNoAnswerCount` for accurate increment (caller already has
 * the value from the listened recall doc — avoids re-read).
 *
 * Phase 29.21-fix2 (2026-05-14) — semantic fixes:
 *   - 'reschedule' outcome: keep status='pending' (NOT 'done'). Caller
 *     then opens SnoozeMenu so admin picks new date; snoozeRecall sets
 *     snoozedUntil. Net effect: recall stays pending but shifted to
 *     new date. Single doc semantic — spec §5.5 "creates new recall"
 *     interpretation deferred for simpler UX.
 *   - 'closed-no-answer' outcome: status='closed-no-answer', preserves
 *     noAnswerCount + requiresManualReview audit trail. Admin uses
 *     this to retire a recall that's been no-answer 3+ times.
 *   - For non-no-answer outcomes (will-come / not-interested /
 *     closed-no-answer), RESET noAnswerCount=0 + requiresManualReview=false
 *     so a future re-open + new no-answer cycle starts clean.
 */
export async function recordRecallOutcome(id, { outcome, outcomeNote, currentNoAnswerCount = 0, recordedBy = null } = {}) {
  const me = _resolveRecallAttribution();
  // 2026-05-20 (Q2=B) — the staff who logged this result is REQUIRED. It is
  // stored in outcomeBy (shown in the list "บันทึกโดย:"); the logged-in
  // account stays in updatedBy for the audit trail.
  const recordedName = recordedBy && typeof recordedBy.name === 'string' ? recordedBy.name.trim() : '';
  if (!recordedName) {
    throw new Error('กรุณาเลือกพนักงานผู้ลงบันทึก');
  }
  const outcomeStamp = {
    uid: recordedBy?.staffId || null,
    name: recordedName,
    role: 'staff',
    staffId: recordedBy?.staffId || null,
  };
  const patch = {
    outcome,
    outcomeNote: outcomeNote || '',
    outcomeAt: serverTimestamp(),
    outcomeBy: outcomeStamp,
    updatedAt: serverTimestamp(),
    updatedBy: me,
  };
  if (outcome === 'no-answer') {
    const newCount = (currentNoAnswerCount || 0) + 1;
    patch.status = 'no-answer';
    patch.noAnswerCount = newCount;
    patch.requiresManualReview = newCount >= 3;
    // Auto-snooze 3 days from now (Bangkok-stable midday-UTC)
    const snoozeMs = Date.now() + 3 * 86400000;
    const sd = new Date(snoozeMs);
    patch.snoozedUntil = `${sd.getUTCFullYear()}-${String(sd.getUTCMonth() + 1).padStart(2, '0')}-${String(sd.getUTCDate()).padStart(2, '0')}`;
  } else if (outcome === 'reschedule') {
    // Phase 29.21-fix2: keep status='pending'. Caller opens SnoozeMenu
    // → snoozeRecall sets snoozedUntil. Outcome 'reschedule' stamped for
    // audit but recall remains an actionable item until admin marks done.
    patch.status = 'pending';
    patch.noAnswerCount = 0;
    patch.requiresManualReview = false;
  } else if (outcome === 'closed-no-answer') {
    // Phase 29.21-fix2: admin explicitly retires a no-answer chain (typically
    // after 3+ strikes flagged via requiresManualReview).
    patch.status = 'closed-no-answer';
    // Preserve noAnswerCount + requiresManualReview for audit (no reset).
  } else {
    // will-come / not-interested → done. Reset no-answer accounting so
    // any future re-open starts clean.
    patch.status = 'done';
    patch.noAnswerCount = 0;
    patch.requiresManualReview = false;
  }
  await updateDoc(recallDoc(id), patch);
}

/**
 * Phase 29 — record LINE template send (called AFTER server endpoint succeeds).
 */
export async function recordRecallLineSend(id, { templateId, messageText } = {}) {
  const me = _resolveRecallAttribution();
  await updateDoc(recallDoc(id), {
    lineMessageSent: true,
    lineMessageSentAt: serverTimestamp(),
    lineMessageTemplate: templateId || null,
    lineMessageText: messageText || '',
    lineMessageBy: me,
    updatedAt: serverTimestamp(),
    updatedBy: me,
  });
}

/**
 * Phase 29 — manual snooze (admin picks new date).
 */
export async function snoozeRecall(id, untilDate) {
  const me = _resolveRecallAttribution();
  await updateDoc(recallDoc(id), {
    snoozedUntil: untilDate || null,
    updatedAt: serverTimestamp(),
    updatedBy: me,
  });
}

/**
 * Phase 29.22 (2026-05-14) — hard-delete a recall doc.
 * If the recall has a paired recall, also clears the partner's pairedRecallId
 * pointer (otherwise the partner shows a broken "🔗 จับคู่กับ" badge).
 *
 * User report: "ลบ Recall ไม่ได้ user จะลบยังไงวะ ไม่มีปุ่มลบ ปุ่มแก้ไขเลย".
 *
 * @param {string} id recall id
 */
export async function deleteRecall(id) {
  if (!id) return;
  // Read first to find paired partner.
  const snap = await getDoc(recallDoc(id));
  if (!snap.exists()) return;
  const data = snap.data();
  const pairedId = data?.pairedRecallId || null;
  const me = _resolveRecallAttribution();
  // Use a batch so partner-cleanup and self-delete commit atomically.
  const batch = writeBatch(db);
  batch.delete(recallDoc(id));
  if (pairedId) {
    batch.update(recallDoc(pairedId), {
      pairedRecallId: null,
      updatedAt: serverTimestamp(),
      updatedBy: me,
    });
  }
  await batch.commit();
}

// Mark customer-scoped recall listener as universal (BSA exception SG10).
// Branch-scoped listener (`listenToRecalls`) follows the default branch-aware
// path via `useBranchAwareListener`.
listenToRecallsForCustomer.__universal__ = true;

// ═══ Phase 29.22 (2026-05-14) — be_recall_cases UNIVERSAL collection ════════
// Per BSA Rule L: no branchId field; shared across branches (mirror be_staff,
// be_doctors universal pattern). Soft-archive only via isHidden (V41 pattern).
// Decouples recall preset data from per-product/per-course denormalization
// that Phase 29 originally introduced (Bug B / V66 lesson).

const recallCasesCol = () => collection(db, ...basePath(), 'be_recall_cases');
const recallCaseDoc = (id) => doc(db, ...basePath(), 'be_recall_cases', id);

function _genRecallCaseId() {
  const ts = Date.now();
  const arr = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < 8; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  const hex = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  return `CASE-${ts}-${hex}`;
}

/**
 * Phase 29.22 — list recall cases (universal; not branch-filtered).
 * @param {{includeHidden?:boolean}} opts
 * @returns {Promise<Array>}
 */
export async function listRecallCases({ includeHidden = false } = {}) {
  const constraints = [];
  if (!includeHidden) constraints.push(where('isHidden', '==', false));
  constraints.push(orderBy('caseName', 'asc'));
  const q = query(recallCasesCol(), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ ...d.data(), id: d.id }));
}
listRecallCases.__universal__ = true;

/**
 * Phase 29.22 — create or update a recall case.
 * Generates CASE- prefix id when omitted; stamps audit fields.
 * @param {{id?,caseName,defaultDays,isHidden?}} form
 * @param {{uid?,user?}} ctx
 * @returns {Promise<{id,...}>}
 */
export async function saveRecallCase(form, ctx = {}) {
  const uid = ctx?.uid || ctx?.user?.uid || '';
  const isEdit = !!form?.id;
  const id = form?.id || _genRecallCaseId();
  const payload = {
    caseName: typeof form?.caseName === 'string' ? form.caseName.trim() : '',
    defaultDays: Math.floor(Number(form?.defaultDays) || 0),
    isHidden: !!form?.isHidden,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  };
  if (!isEdit) {
    payload.createdAt = serverTimestamp();
    payload.createdBy = uid;
  }
  await setDoc(recallCaseDoc(id), payload, { merge: true });
  return { id, ...payload };
}

/**
 * Phase 29.22 — toggle isHidden with V41 transition audit stamps.
 * @param {string} id
 * @param {boolean} isHidden
 * @param {{uid?,user?}} ctx
 */
export async function setRecallCaseHidden(id, isHidden, ctx = {}) {
  const uid = ctx?.uid || ctx?.user?.uid || '';
  await setDoc(
    recallCaseDoc(id),
    {
      isHidden: !!isHidden,
      hiddenAt: isHidden ? serverTimestamp() : null,
      hiddenBy: isHidden ? uid : null,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    },
    { merge: true }
  );
}

/**
 * Phase 29.23 (2026-05-14) — hard-delete a be_recall_cases doc.
 * Safe because recalls store `reason` as STRING SNAPSHOT (no FK to caseId);
 * existing recalls are unaffected by deleting the master case.
 *
 * No audit doc emitted (consistent with setRecallCaseHidden which writes
 * audit fields directly on the doc — but here the doc is gone, so we don't
 * write anywhere). If audit trail needed in future, callers can pre-record
 * to be_admin_audit via separate write.
 *
 * @param {string} id be_recall_cases doc id
 * @param {object} [ctx] reserved for future audit (unused now)
 */
export async function deleteRecallCase(id, ctx = {}) {
  if (!id) return;
  await deleteDoc(recallCaseDoc(id));
}
