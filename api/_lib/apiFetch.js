// ─── apiFetch — shared fetch wrapper with timeout (A7, 2026-05-18) ────────
//
// audit-all 2026-05-18 EOD+11 LATE flagged "no fetch timeout" as a HIGH
// finding across 18 sites in api/. Bare `fetch()` calls hang forever if
// the upstream (LINE / FB / Firestore REST) stalls — bot reply never
// completes, webhook never returns to Vercel, queue backs up.
//
// Rule C1 (Rule of 3) — 18 callsites with identical try-fetch-parse
// pattern → extract shared helper. Single source of truth for timeout
// policy + error-classification.
//
// Usage (drop-in replacement for fetch):
//
//   import { apiFetch } from '../_lib/apiFetch.js';
//
//   const res = await apiFetch(url, { method: 'POST', ... });
//   // → throws { code: 'TIMEOUT' } on timeout
//   // → throws original fetch error otherwise
//
// Options:
//   - opts.timeoutMs (default 5000) — override per-call
//   - all other fetch options pass through verbatim
//   - opts.signal — if caller supplies own AbortSignal, we honor it (no
//     timeout layered on top — assume caller controls cancellation)
//
// Runtime: Vercel Node 20 supports AbortSignal.timeout() natively.

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * fetch() wrapper with timeout + minimal error classification.
 *
 * @param {string | URL | Request} url
 * @param {RequestInit & { timeoutMs?: number }} [opts]
 * @returns {Promise<Response>}
 * @throws {Error} with code === 'TIMEOUT' on AbortSignal.timeout fire
 */
export async function apiFetch(url, opts = {}) {
  const { timeoutMs, signal: callerSignal, ...rest } = opts;

  // If caller provides their own signal, honor it as-is — they own cancellation.
  const signal = callerSignal || AbortSignal.timeout(
    Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS
  );

  try {
    return await fetch(url, { ...rest, signal });
  } catch (err) {
    // AbortError name shape (AbortSignal.timeout fires with this).
    if (err?.name === 'AbortError' || err?.name === 'TimeoutError') {
      const wrapped = new Error(`apiFetch timeout after ${timeoutMs || DEFAULT_TIMEOUT_MS}ms: ${url}`);
      wrapped.code = 'TIMEOUT';
      wrapped.cause = err;
      throw wrapped;
    }
    throw err;
  }
}

export { DEFAULT_TIMEOUT_MS };
