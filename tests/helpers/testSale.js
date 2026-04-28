// V33.12 (2026-04-28) — TEST-/E2E- sale-doc ID prefix enforcement helper.
//
// Mirrors V33.10 (testCustomer.js) + V33.11 (testStockBranch.js) for the
// sales domain. Use this in any test that creates a real Firestore sale
// doc (be_sales, be_vendor_sales) so admin-side cleanup
// (/api/admin/cleanup-test-sales) can identify + batch-delete test
// artifacts safely.
//
// Phase 15.6 (2026-04-28) revealed two leftover test sales in production
// (TEST-SALE-DEFAULT-1777123845203 + TEST-SALE-1777123823846) from V20
// multi-branch isolation testing — the original tests didn't enforce a
// prefix convention so admin couldn't tell test from production. V33.12
// closes that gap.
//
// Mock-only tests (vi.mock firebase/firestore) don't need this — they
// never hit real production data. Use only when writing real Firestore
// from tests.

const VALID_PREFIXES = Object.freeze(['TEST', 'E2E']);
const PREFIX_PATTERN = /^(TEST-SALE-|E2E-SALE-)/;

function _validatePrefix(prefix) {
  if (!VALID_PREFIXES.includes(prefix)) {
    throw new Error(
      `testSale: prefix must be one of ${VALID_PREFIXES.join(' | ')}; ` +
      `got ${JSON.stringify(prefix)}`
    );
  }
}

function _validateSuffix(suffix) {
  if (suffix && !/^[a-zA-Z0-9_-]+$/.test(suffix)) {
    throw new Error(
      `testSale: suffix must match [a-zA-Z0-9_-]; got ${JSON.stringify(suffix)}`
    );
  }
}

/**
 * Generate a test sale doc ID: `<PREFIX>-SALE-<ts>[-<suffix>]`.
 *   createTestSaleId()                     → "TEST-SALE-1777310877957"
 *   createTestSaleId({ prefix: 'E2E' })    → "E2E-SALE-1777310877957"
 *   createTestSaleId({ suffix: 'multi' })  → "TEST-SALE-1777310877957-multi"
 *   createTestSaleId({ suffix: 'DEFAULT' })→ "TEST-SALE-1777310877957-DEFAULT"
 *
 * Note: matches the V20 multi-branch test pattern that produced
 * "TEST-SALE-DEFAULT-{TS}" and "TEST-SALE-{TS}" — both forms remain
 * recognizable by the cleanup endpoint regex `^(TEST-SALE-|E2E-SALE-)`.
 */
export function createTestSaleId(opts = {}) {
  const prefix = opts.prefix === undefined ? 'TEST' : opts.prefix;
  _validatePrefix(prefix);
  const suffix = String(opts.suffix || '').trim();
  _validateSuffix(suffix);
  const ts = Number.isFinite(opts.timestamp) ? opts.timestamp : Date.now();
  return suffix ? `${prefix}-SALE-${ts}-${suffix}` : `${prefix}-SALE-${ts}`;
}

/**
 * Returns true iff `id` is properly TEST-SALE-/E2E-SALE- prefixed.
 * Matches both `TEST-SALE-{ts}` and `TEST-SALE-{ts}-{suffix}` (e.g. -DEFAULT).
 * Use in admin cleanup scripts to identify safe-to-delete docs.
 */
export function isTestSaleId(id) {
  return PREFIX_PATTERN.test(String(id || ''));
}

/** Extract the prefix ('TEST' | 'E2E' | null). Returns null for non-test IDs. */
export function getTestSalePrefix(id) {
  const s = String(id || '');
  if (!PREFIX_PATTERN.test(s)) return null;
  return s.startsWith('TEST-SALE-') ? 'TEST' : 'E2E';
}

export const TEST_SALE_PREFIXES = VALID_PREFIXES;
