// ─── Broker Client — Server API Only ─────────────────────────────────────────
// All ProClinic operations go through Vercel API routes.
// Credentials come from Vercel env vars (not from frontend).
// Consolidated: customer, deposit, connection, appointment, courses (5 endpoints)

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
  return sendMessageToExtension('LC_SYNC_COOKIES', { forceLogin });
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

// ─── API fetch with auto-retry via extension ─────────────────────────────────

async function apiFetch(endpoint, body, _retried) {
  // Get Firebase auth token for API authentication
  const auth = getAuth(app);
  const currentUser = auth.currentUser;
  if (!currentUser) {
    console.warn(`[broker] ${endpoint} — not logged in`);
    return { success: false, error: 'Not logged in' };
  }

  let token;
  try {
    token = await currentUser.getIdToken();
  } catch (err) {
    console.warn(`[broker] ${endpoint} — failed to get auth token`, err);
    return { success: false, error: 'Failed to get auth token' };
  }

  let res;
  try {
    res = await fetch(`/api/proclinic/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.warn(`[broker] ${endpoint} network error:`, err);
    return { success: false, error: `เชื่อมต่อ server ไม่ได้: ${err.message}` };
  }
  if (!res.ok) {
    console.warn(`[broker] ${endpoint} HTTP ${res.status}`);
    return { success: false, error: `HTTP ${res.status}` };
  }
  let data;
  try {
    data = await res.json();
  } catch {
    console.warn(`[broker] ${endpoint} invalid JSON response`);
    return { success: false, error: 'Invalid response' };
  }

  // If server says session expired or needs extension cookies — auto-recover via Cookie Relay
  // Skip auto-recovery for connection test (action=login) — it should report actual status
  const isConnectionTest = endpoint === 'connection' && body?.action === 'login';
  if ((data.extensionNeeded || data.sessionExpired) && !_retried && !isConnectionTest) {
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

/** Fetch full patient data from ProClinic by ID → { success, patient, proClinicId, proClinicHN } */
export function fetchPatientFromProClinic(proClinicId) {
  return apiFetch('customer', { action: 'fetchPatient', proClinicId });
}

// ─── Public API — Deposit ───────────────────────────────────────────────────

/** Get deposit form options (sellers, doctors, rooms, etc.) from ProClinic */
export function getDepositOptions() {
  return apiFetch('deposit', { action: 'options' });
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
