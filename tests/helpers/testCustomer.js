// V33.10 (2026-04-27) — TEST-/E2E- customer ID prefix enforcement.
//
// User directive (V33.2 retroactive): "future test customers MUST use 'TEST-'
// or 'E2E-' doc-id prefix for batch cleanup". After 53 test customers leaked
// into production data with non-prefix IDs, V33.2 introduced
// `deleteCustomerDocOnly` cleanup helper but the prefix convention was only
// documented in `.agents/active.md`. V33.10 codifies it as a shared helper
// so every Firestore-writing test customer goes through ONE function.
//
// Use this helper in ANY test that creates a real Firestore customer doc
// (preview_eval scripts, integration tests writing via firebase-admin SDK,
// etc.). Mock-only tests don't need it — they never hit production data.

const VALID_PREFIXES = Object.freeze(['TEST', 'E2E']);
const PREFIX_PATTERN = /^(TEST|E2E)-/;

/**
 * Generate a test customer document ID with a mandatory TEST- or E2E- prefix.
 *
 * Format: `<PREFIX>-<unix-timestamp-ms>[<-suffix>]`
 *   createTestCustomerId()                      → "TEST-1777267123456"
 *   createTestCustomerId({ prefix: 'E2E' })     → "E2E-1777267123456"
 *   createTestCustomerId({ suffix: 'sale' })    → "TEST-1777267123456-sale"
 *
 * @param {object} [opts]
 * @param {'TEST'|'E2E'} [opts.prefix='TEST']
 * @param {string} [opts.suffix='']  — appended after timestamp, slug-only
 *   ([a-zA-Z0-9-_]). Empty means no suffix.
 * @param {number} [opts.timestamp]  — override clock (for deterministic tests)
 * @returns {string}
 */
export function createTestCustomerId(opts = {}) {
  // Distinguish "omitted" (undefined → default 'TEST') from "explicitly
  // invalid" (any other falsy or wrong value → throw). The latter usually
  // signals a bug in the calling test.
  const prefix = opts.prefix === undefined ? 'TEST' : opts.prefix;
  if (!VALID_PREFIXES.includes(prefix)) {
    throw new Error(`createTestCustomerId: prefix must be one of ${VALID_PREFIXES.join(' | ')}; got ${JSON.stringify(prefix)}`);
  }
  const suffix = String(opts.suffix || '').trim();
  if (suffix && !/^[a-zA-Z0-9_-]+$/.test(suffix)) {
    throw new Error(`createTestCustomerId: suffix must match [a-zA-Z0-9_-]; got ${JSON.stringify(suffix)}`);
  }
  const ts = Number.isFinite(opts.timestamp) ? opts.timestamp : Date.now();
  return suffix ? `${prefix}-${ts}-${suffix}` : `${prefix}-${ts}`;
}

/**
 * Returns true iff `id` is a properly-prefixed test customer ID.
 * Use this in cleanup scripts / admin endpoints to safely identify
 * test data eligible for batch deletion.
 *
 * @param {string} id
 * @returns {boolean}
 */
export function isTestCustomerId(id) {
  return PREFIX_PATTERN.test(String(id || ''));
}

/**
 * Extract the prefix ('TEST' | 'E2E' | null) from a test customer ID.
 * Returns null for non-test IDs.
 */
export function getTestCustomerPrefix(id) {
  const match = String(id || '').match(PREFIX_PATTERN);
  return match ? match[1] : null;
}

export const TEST_CUSTOMER_PREFIXES = VALID_PREFIXES;
