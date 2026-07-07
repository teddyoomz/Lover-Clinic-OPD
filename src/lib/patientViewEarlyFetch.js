// ─── patientViewEarlyFetch — start the ?patient= data fetch at ENTRY time ────
// perf link-patient LCP (2026-07-07): /api/patient-view needs NO Firebase auth,
// NO clinic settings, NO React — it's a plain token-gated GET. But the page used
// to start it only after anon-auth gate → PatientDashboard lazy chunk →
// clinicSettingsLoaded gate (~1.2-1.8s of dead serial time in front of a
// 1.3-3.5s serverless call). main.jsx calls startEarlyPatientViewFetch() the
// moment the entry module evaluates, so the API call runs in PARALLEL with
// anon-auth + chunk download + settings. PatientDashboard consumes it once on
// its first fetch attempt; every failure/retry path falls back to a fresh fetch.
//
// Module-scoped slot (single evaluation, shared between entry chunk and the
// PatientDashboard chunk) — NOT window.* globals.

let slot = null; // { token, promise } | null

export function startEarlyPatientViewFetch(token) {
  if (!token || slot) return;
  const promise = fetch(`/api/patient-view?token=${encodeURIComponent(token)}`);
  // Suppress unhandled-rejection noise if the consumer never mounts (e.g. auth
  // stuck). Attaching a handler here does NOT swallow the rejection for the
  // consumer awaiting the original promise.
  promise.catch(() => {});
  slot = { token, promise };
}

// Consume-once + token-guarded: returns the in-flight Response promise the
// FIRST time the matching token asks, null afterwards (and null on mismatch),
// so the caller's retry loop always falls back to a fresh fetch().
export function takeEarlyPatientViewFetch(token) {
  if (!slot || slot.token !== token) return null;
  const p = slot.promise;
  slot = null;
  return p;
}
