// V33.14 (2026-05-06) — TEST-/E2E- deposit-doc ID prefix enforcement helper.
//
// Mirrors V33.10 (testCustomer.js) + V33.11 (testStockBranch.js) +
// V33.12 (testSale.js) + V33.13 (testAppointment.js) for the deposit
// domain. Use this in any test that creates a real Firestore deposit doc
// (be_deposits) so admin-side cleanup can identify + batch-delete test
// artifacts safely.
//
// Phase 20.0 (2026-05-06) introduced this alongside V33.13 for Frontend
// rewire — DepositBookingModal preview_eval verification requires it.
//
// Mock-only tests (vi.mock firebase/firestore) don't need this — they
// never hit real production data.

const VALID_PREFIXES = Object.freeze(['TEST', 'E2E']);
const PREFIX_PATTERN = /^(TEST-DEPOSIT-|E2E-DEPOSIT-)/;

function _validatePrefix(prefix) {
  if (!VALID_PREFIXES.includes(prefix)) {
    throw new Error(
      `testDeposit: prefix must be one of ${VALID_PREFIXES.join(' | ')}; ` +
      `got ${JSON.stringify(prefix)}`
    );
  }
}

function _validateSuffix(suffix) {
  if (suffix && !/^[a-zA-Z0-9_-]+$/.test(suffix)) {
    throw new Error(
      `testDeposit: suffix must match [a-zA-Z0-9_-]; got ${JSON.stringify(suffix)}`
    );
  }
}

/**
 * Generate a test deposit doc ID: `<PREFIX>-DEPOSIT-<ts>[-<suffix>]`.
 *   createTestDepositId()                    → "TEST-DEPOSIT-1777310877957"
 *   createTestDepositId({ prefix: 'E2E' })   → "E2E-DEPOSIT-1777310877957"
 *   createTestDepositId({ suffix: 'multi' }) → "TEST-DEPOSIT-1777310877957-multi"
 */
export function createTestDepositId(opts = {}) {
  const prefix = opts.prefix === undefined ? 'TEST' : opts.prefix;
  _validatePrefix(prefix);
  const suffix = String(opts.suffix || '').trim();
  _validateSuffix(suffix);
  const ts = Number.isFinite(opts.timestamp) ? opts.timestamp : Date.now();
  return suffix ? `${prefix}-DEPOSIT-${ts}-${suffix}` : `${prefix}-DEPOSIT-${ts}`;
}

/**
 * Returns true iff `id` is properly TEST-DEPOSIT-/E2E-DEPOSIT- prefixed.
 * Use in admin cleanup scripts to identify safe-to-delete docs.
 */
export function isTestDepositId(id) {
  return PREFIX_PATTERN.test(String(id || ''));
}

/** Extract the prefix ('TEST' | 'E2E' | null). Returns null for non-test IDs. */
export function getTestDepositPrefix(id) {
  const s = String(id || '');
  if (!PREFIX_PATTERN.test(s)) return null;
  return s.startsWith('TEST-DEPOSIT-') ? 'TEST' : 'E2E';
}

export const TEST_DEPOSIT_PREFIXES = VALID_PREFIXES;
