// ─── Broker Client Abstraction ──────────────────────────────────────────────
// Unified interface for ProClinic operations.
// brokerMode === 'script' → calls Vercel API routes directly (async/await)
// brokerMode === 'extension' → uses window.postMessage to Chrome Extension

// ─── Script Mode (Vercel API) ───────────────────────────────────────────────

async function apiFetch(endpoint, body) {
  const res = await fetch(`/api/proclinic/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

function getCredentials(clinicSettings) {
  return {
    origin: clinicSettings.proClinicOrigin || 'https://trial.proclinicth.com',
    email: clinicSettings.proClinicEmail || '',
    password: clinicSettings.proClinicPassword || '',
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Create new customer in ProClinic
 * Script mode: returns { success, proClinicId, proClinicHN, error }
 * Extension mode: fires postMessage, returns null (result comes via event listener)
 */
export function fillProClinic(brokerMode, clinicSettings, sessionId, patient) {
  if (brokerMode === 'script') {
    return apiFetch('create', { ...getCredentials(clinicSettings), patient });
  }
  // Extension mode
  window.postMessage({ type: 'LC_FILL_PROCLINIC', sessionId, patient }, '*');
  return null;
}

/**
 * Update existing customer in ProClinic
 * Script mode: returns { success, error }
 * Extension mode: fires postMessage, returns null
 */
export function updateProClinic(brokerMode, clinicSettings, sessionId, proClinicId, proClinicHN, patient) {
  if (brokerMode === 'script') {
    return apiFetch('update', { ...getCredentials(clinicSettings), proClinicId, proClinicHN, patient });
  }
  window.postMessage({ type: 'LC_UPDATE_PROCLINIC', sessionId, proClinicId, proClinicHN, patient }, '*');
  return null;
}

/**
 * Delete customer from ProClinic
 * Script mode: returns { success, error }
 * Extension mode: fires postMessage, returns null
 */
export function deleteProClinic(brokerMode, clinicSettings, sessionId, proClinicId, proClinicHN, patient) {
  if (brokerMode === 'script') {
    return apiFetch('delete', { ...getCredentials(clinicSettings), proClinicId, proClinicHN, patient });
  }
  window.postMessage({ type: 'LC_DELETE_PROCLINIC', sessionId, proClinicId, proClinicHN, patient }, '*');
  return null;
}

/**
 * Get courses for a customer from ProClinic
 * Script mode: returns { success, patientName, courses, expiredCourses, appointments, error }
 * Extension mode: fires postMessage, returns null
 */
export function getCourses(brokerMode, clinicSettings, sessionId, proClinicId) {
  if (brokerMode === 'script') {
    return apiFetch('courses', { ...getCredentials(clinicSettings), proClinicId });
  }
  window.postMessage({ type: 'LC_GET_COURSES', sessionId, proClinicId }, '*');
  return null;
}

/**
 * Search customers in ProClinic
 * Script mode only (not used in extension mode)
 */
export function searchCustomers(clinicSettings, query) {
  return apiFetch('search', { ...getCredentials(clinicSettings), query });
}

/**
 * Test ProClinic login credentials
 * Script mode only
 */
export function testLogin(clinicSettings) {
  return apiFetch('login', getCredentials(clinicSettings));
}

/**
 * Open ProClinic edit page (extension mode only — opens Chrome tab)
 */
export function openEditPage(brokerMode, proClinicId) {
  if (brokerMode === 'extension') {
    window.postMessage({ type: 'LC_OPEN_EDIT_PROCLINIC', proClinicId }, '*');
  }
  // Script mode: no equivalent (could open in new tab but not needed)
}
