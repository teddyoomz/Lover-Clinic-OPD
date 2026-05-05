// tests/phase-19-0-migration-script.test.js
// Phase 19.0 — M1-M6 — migration helper purity (no real Firestore).

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync('scripts/phase-19-0-migrate-appointment-types.mjs', 'utf8');

// Replicate the pure-helper here for testing — the script itself is
// CLI-bound and not directly importable for unit testing without
// triggering firebase-admin init. Mirror the helper exactly.
const APPOINTMENT_TYPE_VALUES = ['deposit-booking', 'no-deposit-booking', 'treatment-in', 'follow-up'];
const DEFAULT_APPOINTMENT_TYPE = 'no-deposit-booking';
function mapAppointmentType(value) {
  if (APPOINTMENT_TYPE_VALUES.includes(value)) return value;
  return DEFAULT_APPOINTMENT_TYPE;
}

describe('Phase 19.0 — migration script', () => {
  test("M1.1 mapAppointmentType('sales') = 'no-deposit-booking'", () => {
    expect(mapAppointmentType('sales')).toBe('no-deposit-booking');
  });

  test('M1.2 mapAppointmentType for all legacy → DEFAULT', () => {
    for (const v of ['sales', 'followup', 'follow', 'consult', 'treatment', null, undefined, '']) {
      expect(mapAppointmentType(v)).toBe('no-deposit-booking');
    }
  });

  test('M2.1 mapAppointmentType passthrough for new 4 (idempotent)', () => {
    for (const v of APPOINTMENT_TYPE_VALUES) {
      expect(mapAppointmentType(v)).toBe(v);
    }
  });

  test('M3.1 script src has --apply gate (default dry-run)', () => {
    expect(SRC).toMatch(/--apply/);
    expect(SRC).toMatch(/const apply = process\.argv\.includes\(['"]--apply['"]\)/);
    expect(SRC).toMatch(/const dryRun = !apply/);
  });

  test('M4.1 audit doc shape matches Phase 18.0 convention', () => {
    expect(SRC).toMatch(/be_admin_audit/);
    expect(SRC).toMatch(/scanned/);
    expect(SRC).toMatch(/migrated/);
    expect(SRC).toMatch(/skipped/);
    expect(SRC).toMatch(/beforeDistribution/);
    expect(SRC).toMatch(/afterDistribution/);
  });

  test('M5.1 forensic-trail fields stamped per migrated doc', () => {
    expect(SRC).toMatch(/appointmentTypeMigratedAt/);
    expect(SRC).toMatch(/appointmentTypeLegacyValue/);
  });

  test('M6.1 batch size respects Firestore 500-op cap', () => {
    expect(SRC).toMatch(/BATCH_SIZE/);
    expect(SRC).toMatch(/= 400/); // safe under 500 cap
  });
});
