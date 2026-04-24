// @dev-only — STRIP BEFORE PRODUCTION RELEASE (rule H-bis)
// ─── Broker Client — Server API Only ─────────────────────────────────────────
// All ProClinic operations go through Vercel API routes.
// Credentials come from Vercel env vars (not from frontend).
// Consolidated: customer, deposit, connection, appointment, courses (5 endpoints)
//
// PURPOSE: Dev-time scaffolding to seed `master_data/*` and `be_*` from the
// trial ProClinic server. In the production release the ENTIRE brokerClient
// is removed along with every consumer in `src/components/backend/**`
// (MasterDataTab, CloneTab, CustomerDetailView sync path). `be_*` CRUD is
// the only master-data surface that ships to end users.

import { getAuth } from 'firebase/auth';
import { app } from '../firebase.js';

// ─── Cookie Relay Extension communication ────────────────────────────────────

function sendMessageToExtension(type, extra = {}) {
  return new Promise((resolve) => {
    const resultType = type + '_RESULT';
    const timeout = setTimeout(() => {
      window.removeEventListener('message', handler);
      resolve({ success: false, error: 'Extension not installed or not responding' });
    }, 30000); // 30s — auto-login ~7s + buffer

    function handler(event) {
      if (event.source !== window || event.data?.type !== resultType) return;
      window.removeEventListener('message', handler);
      clearTimeout(timeout);
      resolve(event.data.result);
    }
    window.addEventListener('message', handler);
    window.postMessage({ type, ...extra }, '*');
  });
}

function requestExtensionSync(forceLogin = false) {
  return sendMessageToExtension('LC_SYNC_COOKIES', { forceLogin, useTrial: _useTrialServer });
}

async function ensureExtensionHasCredentials() {
  try {
    const creds = await apiFetch('connection', { action: 'credentials' }, true); // _retried=true to prevent recursion
    if (creds?.success) {
      window.postMessage({
        type: 'LC_SET_CREDENTIALS',
        origin: creds.origin,
        email: creds.email,
        password: creds.password,
      }, '*');
      // Small delay for extension to save
      await new Promise(r => setTimeout(r, 300));
    }
  } catch (_) {}
}

// ─── Cached auth token (avoid re-fetching on every call) ────────────────────
let _cachedToken = null;
let _cachedTokenExp = 0;

export async function getCachedIdToken() {
  const auth = getAuth(app);
  const currentUser = auth.currentUser;
  if (!currentUser) return null;
  // Reuse token if still valid (refresh 2 min before expiry)
  if (_cachedToken && Date.now() < _cachedTokenExp - 120_000) return _cachedToken;
  _cachedToken = await currentUser.getIdToken();
  // Firebase tokens last 1 hour
  _cachedTokenExp = Date.now() + 3_600_000;
  return _cachedToken;
}

// ─── Trial server mode (backend dashboard uses trial, frontend uses production) ─
let _useTrialServer = false;
export function setUseTrialServer(enabled) { _useTrialServer = enabled; }

// ─── API fetch with auto-retry via extension ─────────────────────────────────

async function apiFetch(endpoint, body, _retried, _htmlRetried) {
  // Inject trial flag if backend mode is active
  if (_useTrialServer && body && !body.useTrialServer) {
    body = { ...body, useTrialServer: true };
  }
  // Get cached Firebase auth token
  const token = await getCachedIdToken();
  if (!token) {
    console.warn(`[broker] ${endpoint} — not logged in`);
    return { success: false, error: 'Not logged in' };
  }

  let res;
  // A7: fetch timeout guard. ProClinic can hang the serverless function
  // (Vercel 30s cap) so we abort at 28s and let the caller see a friendly
  // error rather than a 504. Kept per-request via AbortController.
  const ac = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  const timeoutMs = 28000;
  const timeoutId = ac ? setTimeout(() => ac.abort(), timeoutMs) : null;
  try {
    res = await fetch(`/api/proclinic/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: ac ? ac.signal : undefined,
    });
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId);
    if (err?.name === 'AbortError') {
      console.warn(`[broker] ${endpoint} timeout after ${timeoutMs}ms`);
      return { success: false, error: `Timeout (${timeoutMs / 1000}s) — ProClinic ตอบช้า ลองอีกครั้ง` };
    }
    console.warn(`[broker] ${endpoint} network error:`, err);
    return { success: false, error: `เชื่อมต่อ server ไม่ได้: ${err.message}` };
  }
  if (timeoutId) clearTimeout(timeoutId);
  // A3: 429 rate-limit retry with exponential backoff. ProClinic / Vercel
  // rate-limit under burst traffic; CLAUDE.md rule 5 notes operator
  // workaround is "wait and retry" — automate it here for up to two
  // retries before surfacing the error. Only triggers for 429.
  if (res.status === 429 && !_retried) {
    const retryAfter = Number(res.headers.get('Retry-After')) || 0;
    const waitMs = retryAfter > 0 ? Math.min(retryAfter * 1000, 10000) : 2000;
    console.warn(`[broker] ${endpoint} 429 rate-limited — retrying in ${waitMs}ms`);
    await new Promise(r => setTimeout(r, waitMs));
    return apiFetch(endpoint, body, true, _htmlRetried);
  }
  if (!res.ok) {
    console.warn(`[broker] ${endpoint} HTTP ${res.status}`);
    return { success: false, error: `HTTP ${res.status}` };
  }
  let data;
  try {
    const text = await res.text();
    if (text.trimStart().startsWith('<!DOCTYPE') || text.trimStart().startsWith('<html')) {
      // Server returned HTML (Vercel timeout/error page) — auto-retry once
      if (!_htmlRetried) {
        console.warn(`[broker] ${endpoint} got HTML response (timeout?) — retrying in 2s`);
        await new Promise(r => setTimeout(r, 2000));
        return apiFetch(endpoint, body, _retried, true);
      }
      console.warn(`[broker] ${endpoint} got HTML response after retry`);
      return { success: false, error: 'Server timeout — ลองใหม่อีกครั้ง' };
    }
    data = JSON.parse(text);
  } catch {
    console.warn(`[broker] ${endpoint} invalid JSON response`);
    return { success: false, error: 'Invalid response' };
  }

  // If server says session expired or needs extension cookies — auto-recover via Cookie Relay
  if ((data.extensionNeeded || data.sessionExpired) && !_retried) {
    console.log('[broker] Session expired or needs cookies — triggering Cookie Relay auto-recovery');
    // Ensure extension has credentials before auto-login attempt
    await ensureExtensionHasCredentials();
    const syncResult = await requestExtensionSync(true);
    if (syncResult.success) {
      console.log('[broker] Extension synced cookies — retrying API call');
      return apiFetch(endpoint, body, true);
    }
    console.warn('[broker] Extension sync failed:', syncResult.error);
    data.error = `${data.error} (Extension: ${syncResult.error})`;
  }

  return data;
}

// ─── Public API — Customer ──────────────────────────────────────────────────

/** Create new customer in ProClinic → { success, proClinicId, proClinicHN, error } */
export function fillProClinic(patient) {
  return apiFetch('customer', { action: 'create', patient });
}

/** Update existing customer in ProClinic */
export function updateProClinic(proClinicId, proClinicHN, patient) {
  return apiFetch('customer', { action: 'update', proClinicId, proClinicHN, patient });
}

/** Delete customer from ProClinic */
export function deleteProClinic(proClinicId, proClinicHN, patient) {
  return apiFetch('customer', { action: 'delete', proClinicId, proClinicHN, patient });
}

/** Search customers in ProClinic */
export function searchCustomers(query) {
  return apiFetch('customer', { action: 'search', query });
}

/** List ALL customers paginated → { success, customers, page, maxPage } */
export function listAllCustomers(page = 1) {
  return apiFetch('customer', { action: 'list', page });
}

/** Fetch full patient data from ProClinic by ID → { success, patient, proClinicId, proClinicHN } */
export function fetchPatientFromProClinic(proClinicId) {
  return apiFetch('customer', { action: 'fetchPatient', proClinicId });
}

// ─── Public API — Deposit ───────────────────────────────────────────────────

/** Get deposit form options (sellers, doctors, rooms, etc.) from ProClinic */
export function getDepositOptions() {
  return apiFetch('deposit', { action: 'options' });
}

// ─── Live practitioners cache (5-min TTL, kills ProClinic 429) ───────────────
const _LIVE_PRAC_KEY = 'lc_live_practitioners_v1';
const _LIVE_PRAC_TTL_MS = 5 * 60 * 1000;

/**
 * Fetch doctor + assistant lists directly from ProClinic.
 * 5-minute sessionStorage cache. Call with { forceRefresh:true } to bypass.
 *
 * Returns { success, doctors:[{id,name}], assistants:[{id,name}], fetchedAt, fromCache }.
 * Same person can appear in BOTH lists (ProClinic source of truth — we don't dedupe).
 *
 * On fetch failure: returns { success:false, error, doctors:[], assistants:[] }.
 * Consumers should fall back to clinicSettings.practitioners if desired.
 */
export async function getLivePractitioners({ forceRefresh = false } = {}) {
  try {
    if (!forceRefresh && typeof sessionStorage !== 'undefined') {
      const raw = sessionStorage.getItem(_LIVE_PRAC_KEY);
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached && (Date.now() - cached.fetchedAt) < _LIVE_PRAC_TTL_MS) {
          return { ...cached, fromCache: true };
        }
      }
    }
  } catch (_) {}

  const res = await apiFetch('deposit', { action: 'options' });
  if (!res?.success) {
    return { success: false, error: res?.error || 'fetch failed', doctors: [], assistants: [] };
  }
  const opts = res.options || {};
  const doctors = (opts.doctors || []).map(d => ({ id: Number(d.value), name: d.label }));
  const assistants = (opts.assistants || []).map(d => ({ id: Number(d.value), name: d.label }));
  const fresh = { success: true, doctors, assistants, fetchedAt: Date.now(), fromCache: false };
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(_LIVE_PRAC_KEY, JSON.stringify(fresh));
  } catch (_) {}
  return fresh;
}

/** Invalidate the live practitioners cache (e.g. after known ProClinic edit). */
export function invalidateLivePractitioners() {
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(_LIVE_PRAC_KEY);
  } catch (_) {}
}

/** Submit deposit record to ProClinic */
export function submitDeposit(proClinicId, proClinicHN, deposit) {
  return apiFetch('deposit', { action: 'submit', proClinicId, proClinicHN, deposit });
}

/** Update existing deposit record in ProClinic */
export function updateDeposit(proClinicId, proClinicHN, depositProClinicId, deposit) {
  return apiFetch('deposit', { action: 'update', proClinicId, proClinicHN, depositProClinicId, deposit });
}

/** Cancel deposit + delete customer from ProClinic */
export function cancelDeposit(proClinicId, proClinicHN) {
  return apiFetch('deposit', { action: 'cancel', proClinicId, proClinicHN });
}

// ─── Public API — Connection ────────────────────────────────────────────────

/** Test ProClinic login */
export function testLogin() {
  return apiFetch('connection', { action: 'login' });
}

/** Get ProClinic credentials from Vercel env vars — for extension auto-config */
export function getProClinicCredentials() {
  return apiFetch('connection', { action: 'credentials' });
}

/** Clear ProClinic session cache — forces re-login with current env vars */
export function clearProClinicSession() {
  return apiFetch('connection', { action: 'clear' });
}

// ─── Public API — Courses ───────────────────────────────────────────────────

/** Get courses for a customer from ProClinic */
export function getCourses(proClinicId) {
  return apiFetch('courses', { proClinicId });
}

/** Sync appointments for a month from ProClinic → Firestore */
export function syncAppointments(month) {
  return apiFetch('courses', { action: 'sync-appointments', month });
}

/** Get appointment counts per month for a year */
export function fetchAppointmentMonths(year) {
  return apiFetch('courses', { action: 'fetch-appointment-months', year });
}

// ─── Public API — Appointment ───────────────────────────────────────────────

/** Create new appointment in ProClinic → { success, appointmentProClinicId } */
export function createAppointment(appointment) {
  return apiFetch('appointment', { action: 'create', appointment });
}

/** Update existing appointment in ProClinic */
export function updateAppointment(appointmentId, appointment) {
  return apiFetch('appointment', { action: 'update', appointmentId, appointment });
}

/** Delete appointment from ProClinic */
export function deleteAppointment(appointmentId) {
  return apiFetch('appointment', { action: 'delete', appointmentId });
}

/** List all appointments for a customer → { success, customerName, appointments[] } */
export function listCustomerAppointments(customerId) {
  return apiFetch('appointment', { action: 'listByCustomer', customerId });
}

// ─── Public API — Master Data Sync ────────────────────────────────────────

/** Sync products (ยา/บริการ/สินค้า) from ProClinic → { success, items[], count, totalPages } */
export function syncProducts() {
  return apiFetch('master', { action: 'syncProducts' });
}

/** Sync doctors & assistants from ProClinic → { success, items[], count, totalPages } */
export function syncDoctors() {
  return apiFetch('master', { action: 'syncDoctors' });
}

/** Sync staff (พนักงาน) from ProClinic → { success, items[], count, totalPages } */
export function syncStaff() {
  return apiFetch('master', { action: 'syncStaff' });
}

/** Sync courses (คอร์ส) from ProClinic → { success, items[], count, totalPages } */
export function syncCourses() {
  return apiFetch('master', { action: 'syncCourses' });
}

/** Sync wallet types (กระเป๋าเงิน) from ProClinic — uses /admin/api/wallet JSON API */
export function syncWalletTypes() {
  return apiFetch('master', { action: 'syncWalletTypes' });
}

/** Sync membership card types (บัตรสมาชิก) from ProClinic — uses /admin/api/membership JSON API */
export function syncMembershipTypes() {
  return apiFetch('master', { action: 'syncMembershipTypes' });
}

// ─── Public API — Treatment Records ─────────────────────────────────────────

/** List treatments for a customer → { success, treatments[], page, totalPages } */
export function listTreatments(customerId, page = 1) {
  return apiFetch('treatment', { action: 'list', customerId, page });
}

/** Get full treatment detail → { success, treatment } */
export function getTreatment(treatmentId) {
  return apiFetch('treatment', { action: 'get', treatmentId });
}

/** Get create form options (doctors, health info, etc.) → { success, options } */
export function getTreatmentCreateForm(customerId) {
  return apiFetch('treatment', { action: 'getCreateForm', customerId });
}

/** Create new treatment → { success, treatmentId } */
export function createTreatment(customerId, treatment) {
  return apiFetch('treatment', { action: 'create', customerId, treatment });
}

/** Update existing treatment → { success } */
export function updateTreatment(treatmentId, treatment) {
  return apiFetch('treatment', { action: 'update', treatmentId, treatment });
}

/** Cancel treatment → { success } */
export function deleteTreatment(treatmentId, cancelDetail = '') {
  return apiFetch('treatment', { action: 'delete', treatmentId, cancelDetail });
}

/** Upload chart image to ProClinic treatment */
export function uploadChart(treatmentId, fileIndex, imageBase64) {
  return apiFetch('treatment', { action: 'uploadChart', treatmentId, fileIndex, imageBase64 });
}

/** Get chart templates from ProClinic */
export function getChartTemplates() {
  return apiFetch('treatment', { action: 'getChartTemplates' });
}

/** Search ProClinic products by type → { success, products[], total } */
export function searchProducts({ productType, serviceType, query, isTakeaway, perPage } = {}) {
  return apiFetch('treatment', { action: 'searchProducts', productType, serviceType, query, isTakeaway, perPage });
}

/** Get medication groups with products → { success, groups[] } */
export function getMedicationGroups(productType) {
  return apiFetch('treatment', { action: 'getMedicationGroups', productType });
}

/** List purchasable items (courses/promotions/retail) → { success, items[], categories[] } */
export function listItems(itemType, query) {
  return apiFetch('treatment', { action: 'listItems', itemType, query });
}

// NOTE: Phase 9 marketing (promotion/coupon/voucher) is Firestore-only per
// CLAUDE.md rule 03 — those entities live in be_promotions/be_coupons/
// be_vouchers and must NOT POST to ProClinic. An earlier implementation
// added broker wrappers here which violated the rule and was reverted
// 2026-04-19.

// ─── One-way SYNC from ProClinic for master_data/coupons + vouchers ────────
// Only called by MasterDataTab (sanctioned sync point per rule E). Populates
// master_data/{coupons,vouchers}/items; MasterDataTab's migrate button then
// writes to be_coupons / be_vouchers.
export function syncCoupons() { return apiFetch('master', { action: 'syncCoupons' }); }
export function syncVouchers() { return apiFetch('master', { action: 'syncVouchers' }); }

// Phase 11.8c: 6 new master-data sync targets. Each hits the generic
// list-page scraper on the serverless side (see api/proclinic/master.js
// `syncGenericList`). Output lands in master_data/{type}/items/* — the
// matching migrate fn in backendClient.js then writes to be_*.
export function syncProductGroups()      { return apiFetch('master', { action: 'syncProductGroups' }); }
export function syncProductUnits()       { return apiFetch('master', { action: 'syncProductUnits' }); }
export function syncMedicalInstruments() { return apiFetch('master', { action: 'syncMedicalInstruments' }); }
export function syncHolidays()           { return apiFetch('master', { action: 'syncHolidays' }); }
export function syncBranches()           { return apiFetch('master', { action: 'syncBranches' }); }
export function syncPermissionGroups()   { return apiFetch('master', { action: 'syncPermissionGroups' }); }
/** Phase 14.x: pull DF group list + per-group rate matrix from ProClinic. */
export function syncDfGroups()           { return apiFetch('master', { action: 'syncDfGroups' }); }
