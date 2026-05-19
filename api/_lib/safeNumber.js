// ─── safeNumber — defensive numeric coercion (V100, 2026-05-19) ──────────
//
// V99 e2e (2026-05-19) found 2 latent admin-SDK defense gaps:
//   - balance: NaN written without rejection
//   - amount: Infinity written without rejection
//
// Admin SDK with `ignoreUndefinedProperties: true` only handles `undefined`,
// NOT `NaN` / `Infinity` / `-Infinity`. If a buggy code path emits these
// values for a numeric field, Firestore persists them. Reads then return
// NaN/Infinity which breaks arithmetic everywhere downstream:
//   - balance comparisons fail (NaN < N is always false)
//   - sums become NaN (NaN + 100 = NaN)
//   - aggregation queries return wrong totals
//
// Production code currently uses `Number(x) || fallback` short-circuit
// which COERCES NaN to fallback (true for `NaN`, false for `0`, true for
// `Infinity` actually...). This pattern is FRAGILE:
//   - `NaN || 1` === 1 ✓ (NaN is falsy)
//   - `Infinity || 1` === Infinity ✗ (Infinity is truthy!)
//   - `0 || 1` === 1 ✓ (zero is falsy — sometimes wanted, sometimes not)
//
// AV87 (added 2026-05-19) mandates explicit Number.isFinite() check before
// every Firestore numeric write in api/ paths. This helper centralizes the
// pattern + adds finite + minimum + maximum guards.
//
// USAGE:
//   const n = safeNumber(req.body?.amount, 0);
//   const page = safeNumber(req.body?.page, 1, { min: 1 });
//   const pageSize = safeNumber(req.body?.pageSize, 50, { min: 1, max: 200 });

/**
 * Coerce a value to a finite number with bounds clamp + fallback.
 *
 * Rejects: NaN, Infinity, -Infinity, undefined, null, non-numeric strings
 * Returns: fallback (default 0) on rejection
 *
 * @param {unknown} x — input (any type)
 * @param {number} fallback — value if x is non-finite (default: 0)
 * @param {{min?: number, max?: number}} [bounds] — optional clamp
 * @returns {number} — guaranteed finite number
 */
export function safeNumber(x, fallback = 0, bounds = {}) {
  let n = Number(x);
  if (!Number.isFinite(n)) n = fallback;
  if (bounds && typeof bounds.min === 'number' && Number.isFinite(bounds.min)) {
    n = Math.max(bounds.min, n);
  }
  if (bounds && typeof bounds.max === 'number' && Number.isFinite(bounds.max)) {
    n = Math.min(bounds.max, n);
  }
  return n;
}

/**
 * Strict variant — throws on non-finite (no fallback).
 * Use when the caller MUST receive a valid number (e.g. transaction amount).
 *
 * @param {unknown} x — input
 * @param {string} fieldName — for error message
 * @returns {number}
 * @throws {Error} with code='INVALID_NUMERIC' if non-finite
 */
export function strictNumber(x, fieldName = 'value') {
  const n = Number(x);
  if (!Number.isFinite(n)) {
    const err = new Error(`${fieldName} must be a finite number (got: ${String(x)})`);
    err.code = 'INVALID_NUMERIC';
    throw err;
  }
  return n;
}

/**
 * Predicate — true iff x coerces to a finite number.
 * Convenient for gate checks before writes.
 *
 * @param {unknown} x — input
 * @returns {boolean}
 */
export function isFiniteNumber(x) {
  return Number.isFinite(Number(x));
}
