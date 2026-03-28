// ─── Broker Client — Server API Only ─────────────────────────────────────────
// All ProClinic operations go through Vercel API routes.
// Credentials come from Vercel env vars (not from frontend).

import { getAuth } from 'firebase/auth';
import { app } from '../firebase.js';

async function apiFetch(endpoint, body) {
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

  const res = await fetch(`/api/proclinic/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.warn(`[broker] ${endpoint} HTTP ${res.status}`);
    return { success: false, error: `HTTP ${res.status}` };
  }
  try {
    return await res.json();
  } catch {
    console.warn(`[broker] ${endpoint} invalid JSON response`);
    return { success: false, error: 'Invalid response' };
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** Create new customer in ProClinic → { success, proClinicId, proClinicHN, error } */
export function fillProClinic(patient) {
  return apiFetch('create', { patient });
}

/** Update existing customer in ProClinic */
export function updateProClinic(proClinicId, proClinicHN, patient) {
  return apiFetch('update', { proClinicId, proClinicHN, patient });
}

/** Delete customer from ProClinic */
export function deleteProClinic(proClinicId, proClinicHN, patient) {
  return apiFetch('delete', { proClinicId, proClinicHN, patient });
}

/** Get courses for a customer from ProClinic */
export function getCourses(proClinicId) {
  return apiFetch('courses', { proClinicId });
}

/** Search customers in ProClinic */
export function searchCustomers(query) {
  return apiFetch('search', { query });
}

/** Test ProClinic login */
export function testLogin() {
  return apiFetch('login', {});
}

/** Get deposit form options (sellers, doctors, rooms, etc.) from ProClinic */
export function getDepositOptions() {
  return apiFetch('deposit-options', {});
}

/** Submit deposit record to ProClinic */
export function submitDeposit(proClinicId, proClinicHN, deposit) {
  return apiFetch('deposit-submit', { proClinicId, proClinicHN, deposit });
}

/** Cancel deposit + delete customer from ProClinic */
export function cancelDeposit(proClinicId, proClinicHN) {
  return apiFetch('deposit-cancel', { proClinicId, proClinicHN });
}

/** Update existing deposit record in ProClinic */
export function updateDeposit(proClinicId, proClinicHN, depositProClinicId, deposit) {
  return apiFetch('deposit-update', { proClinicId, proClinicHN, depositProClinicId, deposit });
}

/** Clear ProClinic session cache — forces re-login with current env vars */
export function clearProClinicSession() {
  return apiFetch('clear-session', {});
}
