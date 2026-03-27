// ─── Broker Client — Server API Only ─────────────────────────────────────────
// All ProClinic operations go through Vercel API routes.
// Credentials come from Vercel env vars (not from frontend).

async function apiFetch(endpoint, body) {
  const res = await fetch(`/api/proclinic/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    return { success: false, error: `API returned non-JSON (${res.status})` };
  }
  return res.json();
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
