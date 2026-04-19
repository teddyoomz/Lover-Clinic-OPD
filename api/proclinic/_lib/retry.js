// ─── Retry helper — exponential backoff for transient failures ─────────────
// Used by Phase 9 sync handlers (A3). Retries on 429, 5xx, and network/abort
// errors; never retries on:
//   - SessionExpiredError (credentials issue — re-login won't help repeat)
//   - 4xx != 429 (permanent client-side issue)
//   - ≥ retries+1 attempts
//
// Thrown errors from `fn(attempt)` MAY carry:
//   - err.sessionExpired → don't retry
//   - err.status         → 4xx != 429 = don't retry
//   - err.retryAfterMs   → override backoff delay (e.g. 429 Retry-After header)

export async function withRetry(fn, opts = {}) {
  const {
    retries = 3,
    baseMs = 500,
    maxMs = 8000,
    onRetry,
  } = opts;

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      lastErr = e;
      // Permanent failures — don't retry.
      if (e?.sessionExpired) throw e;
      if (typeof e?.status === 'number' && e.status !== 429 && e.status < 500) {
        throw e;
      }
      if (attempt === retries) throw e;

      // Prefer server-requested Retry-After. Cap at maxMs.
      const explicit = Number(e?.retryAfterMs);
      const delayMs = Number.isFinite(explicit) && explicit > 0
        ? Math.min(explicit, maxMs)
        : Math.min(baseMs * 2 ** attempt, maxMs);

      if (onRetry) {
        try { onRetry({ attempt, error: e, delayMs }); } catch { /* user callback */ }
      }
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  // Unreachable — the loop either returns or throws. Keep for type hygiene.
  throw lastErr;
}

/** Parse a fetch `Retry-After` header into ms. Supports seconds (int) + HTTP-date. */
export function parseRetryAfterMs(headerValue) {
  if (!headerValue) return null;
  const n = Number(headerValue);
  if (Number.isFinite(n)) {
    // Negative seconds = invalid per RFC 7231; don't fall through to Date.parse
    // (Date.parse('-5') silently produces a valid year in some engines).
    return n >= 0 ? Math.floor(n * 1000) : null;
  }
  const t = Date.parse(headerValue);
  if (!Number.isFinite(t)) return null;
  const diff = t - Date.now();
  return diff > 0 ? diff : 0;
}
