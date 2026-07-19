// ─── Error Beacon (2026-07-19) — client runtime ────────────────────────────
//
// Global crash visibility: window.onerror + unhandledrejection (+ the
// AppErrorBoundary calling reportErrorToBeacon) → sanitized, deduped, capped
// POSTs to /api/client-error. Before this, an error on a clinic machine or a
// customer's phone was invisible until the user reported it (V163 black screen
// class).
//
// SAFETY CONTRACT (the beacon must never make anything worse):
//   - every path is try/catch-wrapped; a beacon failure is silent
//   - the beacon NEVER reports its own errors (no feedback loop)
//   - memory-only state (no localStorage) — nothing persists or leaks
//   - dedupe: max 1 send per error-hash per 5 minutes; max 20 sends/session
//   - payload built by clientErrorCore.sanitizeErrorPayload (PHI-safe URL)
// On the vite dev server /api/client-error does not exist → the fetch fails →
// swallowed. Full round-trip works on prod (and is verified post-deploy).

import { sanitizeErrorPayload } from './clientErrorCore.js';

export const BEACON_ENDPOINT = '/api/client-error';
export const DEDUPE_WINDOW_MS = 5 * 60 * 1000;
export const SESSION_MAX_SENDS = 20;

const state = {
  installed: false,
  sentCount: 0,
  lastSentByHash: new Map(), // hash → ms
};

// Exported for tests only — resets the in-memory gate.
export function _resetBeaconStateForTest() {
  state.installed = false;
  state.sentCount = 0;
  state.lastSentByHash.clear();
}

/** Pure-ish gate decision (exported for tests). Mutates the provided state. */
export function shouldSendBeacon(hash, nowMs, s = state) {
  if (s.sentCount >= SESSION_MAX_SENDS) return false;
  const last = s.lastSentByHash.get(hash);
  if (Number.isFinite(last) && nowMs - last < DEDUPE_WINDOW_MS) return false;
  s.lastSentByHash.set(hash, nowMs);
  s.sentCount += 1;
  return true;
}

function transport(payload) {
  const body = JSON.stringify(payload);
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      // sendBeacon survives page unload (the exact moment crashes happen).
      const ok = navigator.sendBeacon(BEACON_ENDPOINT, new Blob([body], { type: 'application/json' }));
      if (ok) return;
    }
  } catch { /* fall through to fetch */ }
  try {
    fetch(BEACON_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch { /* silent — beacon must never throw */ }
}

/** Report one error. Safe to call from anywhere (boundary, handlers). */
export function reportErrorToBeacon(err, { source = 'manual' } = {}) {
  try {
    const message = err && (err.message || (typeof err === 'string' ? err : String(err)));
    const payload = sanitizeErrorPayload({
      message: source === 'manual' ? message : `[${source}] ${message}`,
      stack: err && err.stack,
      href: typeof window !== 'undefined' ? window.location.href : '',
      ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      now: Date.now(),
    });
    if (!payload) return;
    if (!shouldSendBeacon(payload.hash, Date.now())) return;
    transport(payload);
  } catch { /* silent — never loop, never rethrow */ }
}

/** Install the global handlers once. Idempotent. */
export function installErrorBeacon() {
  try {
    if (state.installed || typeof window === 'undefined') return;
    state.installed = true;
    window.addEventListener('error', (event) => {
      try {
        // Resource-load errors (img/script tags) have no .error and no message
        // worth storing at volume — only report real script errors.
        const err = event?.error || (event?.message ? { message: event.message } : null);
        if (err) reportErrorToBeacon(err, { source: 'onerror' });
      } catch { /* silent */ }
    });
    window.addEventListener('unhandledrejection', (event) => {
      try {
        const r = event?.reason;
        const err = r instanceof Error ? r : { message: typeof r === 'string' ? r : JSON.stringify(r ?? 'unknown').slice(0, 200) };
        reportErrorToBeacon(err, { source: 'unhandledrejection' });
      } catch { /* silent */ }
    });
  } catch { /* silent — installing the beacon must never break boot */ }
}
