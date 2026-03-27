// ─── Broker Client Abstraction ──────────────────────────────────────────────
// Unified interface for ProClinic operations.
// brokerMode === 'script' → calls Vercel API routes (credentials from env vars)
// brokerMode === 'extension' → uses window.postMessage to Chrome Extension

// ─── Script Mode (Vercel API) ───────────────────────────────────────────────

// Ask extension to re-share ProClinic cookies (returns promise that resolves when done or timeout)
function requestExtensionCookieShare() {
  return new Promise((resolve) => {
    const handler = (event) => {
      if (event.data?.type === 'LC_SHARE_COOKIES_RESULT') {
        window.removeEventListener('message', handler);
        resolve(event.data);
      }
    };
    window.addEventListener('message', handler);
    window.postMessage({ type: 'LC_SHARE_COOKIES_NOW' }, '*');
    setTimeout(() => { window.removeEventListener('message', handler); resolve(null); }, 4000);
  });
}

async function apiFetch(endpoint, body) {
  const res = await fetch(`/api/proclinic/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();

  // Auto-retry once if session expired: ask extension to re-share cookies then retry
  if (data.sessionExpired) {
    console.log('[broker] session expired — requesting extension cookie re-share...');
    const shareResult = await requestExtensionCookieShare();
    if (shareResult?.cookieCount > 0) {
      console.log('[broker] cookies re-shared, retrying API call...');
      const retryRes = await fetch(`/api/proclinic/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return retryRes.json();
    }
    return data;
  }

  return data;
}

// ─── Public API ─────────────────────────────────────────────────────────────
// Script mode: credentials come from Vercel env vars (not from frontend)
// Only non-credential data (patient, proClinicId, etc.) is sent in request body

/**
 * Create new customer in ProClinic
 * Script mode: returns { success, proClinicId, proClinicHN, error }
 * Extension mode: fires postMessage, returns null (result comes via event listener)
 */
export function fillProClinic(brokerMode, clinicSettings, sessionId, patient) {
  if (brokerMode === 'script') {
    return apiFetch('create', { patient });
  }
  window.postMessage({ type: 'LC_FILL_PROCLINIC', sessionId, patient }, '*');
  return null;
}

/**
 * Update existing customer in ProClinic
 */
export function updateProClinic(brokerMode, clinicSettings, sessionId, proClinicId, proClinicHN, patient) {
  if (brokerMode === 'script') {
    return apiFetch('update', { proClinicId, proClinicHN, patient });
  }
  window.postMessage({ type: 'LC_UPDATE_PROCLINIC', sessionId, proClinicId, proClinicHN, patient }, '*');
  return null;
}

/**
 * Delete customer from ProClinic
 */
export function deleteProClinic(brokerMode, clinicSettings, sessionId, proClinicId, proClinicHN, patient) {
  if (brokerMode === 'script') {
    return apiFetch('delete', { proClinicId, proClinicHN, patient });
  }
  window.postMessage({ type: 'LC_DELETE_PROCLINIC', sessionId, proClinicId, proClinicHN, patient }, '*');
  return null;
}

/**
 * Get courses for a customer from ProClinic
 */
export function getCourses(brokerMode, clinicSettings, sessionId, proClinicId) {
  if (brokerMode === 'script') {
    return apiFetch('courses', { proClinicId });
  }
  window.postMessage({ type: 'LC_GET_COURSES', sessionId, proClinicId }, '*');
  return null;
}

/**
 * Search customers in ProClinic (script mode only)
 */
export function searchCustomers(clinicSettings, query) {
  return apiFetch('search', { query });
}

/**
 * Test ProClinic login (script mode only)
 */
export function testLogin(clinicSettings) {
  return apiFetch('login', {});
}

/**
 * Open ProClinic edit page (extension mode only — opens Chrome tab)
 */
export function openEditPage(brokerMode, proClinicId) {
  if (brokerMode === 'extension') {
    window.postMessage({ type: 'LC_OPEN_EDIT_PROCLINIC', proClinicId }, '*');
  }
}
