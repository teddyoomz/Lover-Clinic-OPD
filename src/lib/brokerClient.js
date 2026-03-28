// ─── Broker Client — Server API Only ─────────────────────────────────────────
// All ProClinic operations go through Vercel API routes.
// Credentials come from Vercel env vars (not from frontend).

async function apiFetch(endpoint, body) {
  const res = await fetch(`/api/proclinic/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
