// V33.11 (2026-04-28) — TEST-/E2E- stock-branch / warehouse / product / order ID
// prefix enforcement helper.
//
// Mirrors V33.10 (testCustomer.js) for the stock domain. Use this in any test
// that creates a real Firestore stock doc (be_stock_batches, be_stock_movements,
// be_stock_adjustments, be_stock_orders, be_central_stock_orders, etc.) so
// admin-side cleanup can identify + batch-delete test artifacts safely.
//
// V34 (2026-04-28) revealed that even tests that PASSED could leave production-
// looking stock docs in the db (the chanel batch ADJ-1777299* movements). The
// V33.11 prefix convention closes that gap for stock the same way V33.10 closed
// it for customers.
//
// Mock-only tests (vi.mock firebase/firestore) don't need this — they never
// hit real production data. Use only when writing real Firestore from tests.

const VALID_PREFIXES = Object.freeze(['TEST', 'E2E']);
const PREFIX_PATTERN = /^(TEST|E2E)-/;

function _validatePrefix(prefix) {
  if (!VALID_PREFIXES.includes(prefix)) {
    throw new Error(
      `testStockBranch: prefix must be one of ${VALID_PREFIXES.join(' | ')}; ` +
      `got ${JSON.stringify(prefix)}`
    );
  }
}

function _validateSuffix(suffix) {
  if (suffix && !/^[a-zA-Z0-9_-]+$/.test(suffix)) {
    throw new Error(
      `testStockBranch: suffix must match [a-zA-Z0-9_-]; got ${JSON.stringify(suffix)}`
    );
  }
}

/**
 * Generate a test branch ID: `<PREFIX>-BR-<ts>[<-suffix>]`.
 *   createTestStockBranchId()                      → "TEST-BR-1777310877957"
 *   createTestStockBranchId({ prefix: 'E2E' })     → "E2E-BR-1777310877957"
 *   createTestStockBranchId({ suffix: 'src' })     → "TEST-BR-1777310877957-src"
 */
export function createTestStockBranchId(opts = {}) {
  const prefix = opts.prefix === undefined ? 'TEST' : opts.prefix;
  _validatePrefix(prefix);
  const suffix = String(opts.suffix || '').trim();
  _validateSuffix(suffix);
  const ts = Number.isFinite(opts.timestamp) ? opts.timestamp : Date.now();
  return suffix ? `${prefix}-BR-${ts}-${suffix}` : `${prefix}-BR-${ts}`;
}

/** Generate a test central-warehouse ID: `<PREFIX>-WH-<ts>[<-suffix>]`. */
export function createTestCentralWarehouseId(opts = {}) {
  const prefix = opts.prefix === undefined ? 'TEST' : opts.prefix;
  _validatePrefix(prefix);
  const suffix = String(opts.suffix || '').trim();
  _validateSuffix(suffix);
  const ts = Number.isFinite(opts.timestamp) ? opts.timestamp : Date.now();
  return suffix ? `${prefix}-WH-${ts}-${suffix}` : `${prefix}-WH-${ts}`;
}

/** Generate a test product ID. Same format. */
export function createTestStockProductId(opts = {}) {
  const prefix = opts.prefix === undefined ? 'TEST' : opts.prefix;
  _validatePrefix(prefix);
  const suffix = String(opts.suffix || '').trim();
  _validateSuffix(suffix);
  const ts = Number.isFinite(opts.timestamp) ? opts.timestamp : Date.now();
  return suffix ? `${prefix}-PROD-${ts}-${suffix}` : `${prefix}-PROD-${ts}`;
}

/** Generate a test batch ID. Same format. */
export function createTestStockBatchId(opts = {}) {
  const prefix = opts.prefix === undefined ? 'TEST' : opts.prefix;
  _validatePrefix(prefix);
  const suffix = String(opts.suffix || '').trim();
  _validateSuffix(suffix);
  const ts = Number.isFinite(opts.timestamp) ? opts.timestamp : Date.now();
  return suffix ? `${prefix}-BATCH-${ts}-${suffix}` : `${prefix}-BATCH-${ts}`;
}

/**
 * Returns true iff `id` is properly TEST-/E2E- prefixed.
 * Use in admin cleanup scripts to identify safe-to-delete docs.
 */
export function isTestStockId(id) {
  return PREFIX_PATTERN.test(String(id || ''));
}

/** Extract the prefix ('TEST' | 'E2E' | null). Returns null for non-test IDs. */
export function getTestStockPrefix(id) {
  const match = String(id || '').match(PREFIX_PATTERN);
  return match ? match[1] : null;
}

export const TEST_STOCK_PREFIXES = VALID_PREFIXES;
