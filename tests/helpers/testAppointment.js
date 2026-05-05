// V33.13 (2026-05-06) — TEST-/E2E- appointment-doc ID prefix enforcement helper.
//
// Mirrors V33.10 (testCustomer.js) + V33.11 (testStockBranch.js) +
// V33.12 (testSale.js) for the appointment domain. Use this in any test
// that creates a real Firestore appointment doc (be_appointments) so
// admin-side cleanup can identify + batch-delete test artifacts safely.
//
// Phase 20.0 (2026-05-06) introduced this when Frontend rewired from
// brokerClient → be_appointments. preview_eval write-paths (Flows B/C/D)
// require this helper for safe live verification on production Firestore
// per `feedback_no_real_action_in_preview_eval.md` — never click real
// action buttons against production data without a TEST- prefix (chanel
// customer 2853 incident lock).
//
// Mock-only tests (vi.mock firebase/firestore) don't need this — they
// never hit real production data. Use only when writing real Firestore
// from tests.

const VALID_PREFIXES = Object.freeze(['TEST', 'E2E']);
const PREFIX_PATTERN = /^(TEST-APPT-|E2E-APPT-)/;

function _validatePrefix(prefix) {
  if (!VALID_PREFIXES.includes(prefix)) {
    throw new Error(
      `testAppointment: prefix must be one of ${VALID_PREFIXES.join(' | ')}; ` +
      `got ${JSON.stringify(prefix)}`
    );
  }
}

function _validateSuffix(suffix) {
  if (suffix && !/^[a-zA-Z0-9_-]+$/.test(suffix)) {
    throw new Error(
      `testAppointment: suffix must match [a-zA-Z0-9_-]; got ${JSON.stringify(suffix)}`
    );
  }
}

/**
 * Generate a test appointment doc ID: `<PREFIX>-APPT-<ts>[-<suffix>]`.
 *   createTestAppointmentId()                    → "TEST-APPT-1777310877957"
 *   createTestAppointmentId({ prefix: 'E2E' })   → "E2E-APPT-1777310877957"
 *   createTestAppointmentId({ suffix: 'multi' }) → "TEST-APPT-1777310877957-multi"
 */
export function createTestAppointmentId(opts = {}) {
  const prefix = opts.prefix === undefined ? 'TEST' : opts.prefix;
  _validatePrefix(prefix);
  const suffix = String(opts.suffix || '').trim();
  _validateSuffix(suffix);
  const ts = Number.isFinite(opts.timestamp) ? opts.timestamp : Date.now();
  return suffix ? `${prefix}-APPT-${ts}-${suffix}` : `${prefix}-APPT-${ts}`;
}

/**
 * Returns true iff `id` is properly TEST-APPT-/E2E-APPT- prefixed.
 * Use in admin cleanup scripts to identify safe-to-delete docs.
 */
export function isTestAppointmentId(id) {
  return PREFIX_PATTERN.test(String(id || ''));
}

/** Extract the prefix ('TEST' | 'E2E' | null). Returns null for non-test IDs. */
export function getTestAppointmentPrefix(id) {
  const s = String(id || '');
  if (!PREFIX_PATTERN.test(s)) return null;
  return s.startsWith('TEST-APPT-') ? 'TEST' : 'E2E';
}

export const TEST_APPOINTMENT_PREFIXES = VALID_PREFIXES;
