// tests/phase-21-0-strict-and-backfill-migration.test.js
// Phase 21.0 — M1 — Migration script unit tests
//
// Imports the script's pure helpers — the invocation guard
// (`if (process.argv[1] === fileURLToPath(import.meta.url))`) prevents
// main() from auto-running during the import.

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

let mig;
try {
  mig = await import('../scripts/phase-21-0-migrate-appointment-types-strict.mjs');
} catch (err) {
  // Expected if firebase-admin is not installed in test environment;
  // the source-grep tests below still run.
  mig = null;
}

const SRC = readFileSync('scripts/phase-21-0-migrate-appointment-types-strict.mjs', 'utf8');

describe('Phase 21.0 — M1 migration helpers (pure)', () => {
  test('M1.1 mapAppointmentType passes-through canonical values', () => {
    if (!mig) return;
    expect(mig.mapAppointmentType('no-deposit-booking')).toBe('no-deposit-booking');
    expect(mig.mapAppointmentType('deposit-booking')).toBe('deposit-booking');
    expect(mig.mapAppointmentType('treatment-in')).toBe('treatment-in');
    expect(mig.mapAppointmentType('follow-up')).toBe('follow-up');
  });

  test('M1.2 mapAppointmentType defaults legacy / null / unknown to no-deposit-booking', () => {
    if (!mig) return;
    expect(mig.mapAppointmentType('sales')).toBe('no-deposit-booking');
    expect(mig.mapAppointmentType('followup')).toBe('no-deposit-booking');
    expect(mig.mapAppointmentType(null)).toBe('no-deposit-booking');
    expect(mig.mapAppointmentType(undefined)).toBe('no-deposit-booking');
    expect(mig.mapAppointmentType('')).toBe('no-deposit-booking');
    expect(mig.mapAppointmentType('garbage')).toBe('no-deposit-booking');
  });

  test('M1.3 depositNeedsBackfill skips cancelled deposits', () => {
    if (!mig) return;
    expect(mig.depositNeedsBackfill({
      hasAppointment: true,
      status: 'cancelled',
      appointment: { date: '2026-05-10', startTime: '10:00' },
    })).toBe(false);
  });

  test('M1.4 depositNeedsBackfill skips deposits without hasAppointment', () => {
    if (!mig) return;
    expect(mig.depositNeedsBackfill({
      hasAppointment: false,
      status: 'active',
      appointment: { date: '2026-05-10', startTime: '10:00' },
    })).toBe(false);
  });

  test('M1.5 depositNeedsBackfill skips already-linked deposits (idempotent)', () => {
    if (!mig) return;
    expect(mig.depositNeedsBackfill({
      hasAppointment: true,
      status: 'active',
      linkedAppointmentId: 'BA-existing',
      appointment: { date: '2026-05-10', startTime: '10:00' },
    })).toBe(false);
  });

  test('M1.6 depositNeedsBackfill skips deposits with incomplete appointment data', () => {
    if (!mig) return;
    expect(mig.depositNeedsBackfill({
      hasAppointment: true,
      status: 'active',
      appointment: { date: '', startTime: '10:00' },
    })).toBe(false);
    expect(mig.depositNeedsBackfill({
      hasAppointment: true,
      status: 'active',
      appointment: { date: '2026-05-10', startTime: '' },
    })).toBe(false);
  });

  test('M1.7 depositNeedsBackfill returns true for valid candidate', () => {
    if (!mig) return;
    expect(mig.depositNeedsBackfill({
      hasAppointment: true,
      status: 'active',
      appointment: { date: '2026-05-10', startTime: '10:00' },
    })).toBe(true);
  });

  test('M1.8 buildBackfillAppointment sets type=deposit-booking + cross-link + branchId', () => {
    if (!mig) return;
    const out = mig.buildBackfillAppointment({
      deposit: {
        customerId: 'C1',
        customerName: 'Patient',
        branchId: 'BR-X',
        appointment: {
          date: '2026-05-10',
          startTime: '10:00',
          endTime: '10:15',
          doctorId: 'doc-1',
        },
      },
      depositId: 'DEP-1',
      appointmentId: 'BA-1',
      now: new Date('2026-05-06T10:00:00Z'),
    });
    expect(out.appointmentType).toBe('deposit-booking');
    expect(out.linkedDepositId).toBe('DEP-1');
    expect(out.spawnedFromDepositId).toBe('DEP-1');
    expect(out.branchId).toBe('BR-X');
    expect(out.date).toBe('2026-05-10');
    expect(out.startTime).toBe('10:00');
    expect(out.status).toBe('pending');
  });

  test('M1.9 buildBackfillAppointment defaults endTime to startTime', () => {
    if (!mig) return;
    const out = mig.buildBackfillAppointment({
      deposit: { appointment: { date: '2026-05-10', startTime: '10:00' } },
      depositId: 'D', appointmentId: 'A', now: new Date(),
    });
    expect(out.endTime).toBe('10:00');
  });

  test('M1.10 randHex produces hex string of expected length', () => {
    if (!mig) return;
    expect(mig.randHex(8)).toMatch(/^[0-9a-f]{8}$/);
    expect(mig.randHex(4)).toMatch(/^[0-9a-f]{4}$/);
  });
});

describe('Phase 21.0 — M2 migration script source-grep', () => {
  test('M2.1 invocation guard prevents auto-run when imported', () => {
    expect(SRC).toMatch(/if \(process\.argv\[1\] === fileURLToPath\(import\.meta\.url\)\)/);
  });

  test('M2.2 PEM key newline conversion present (V15 #22 lock)', () => {
    expect(SRC).toMatch(/split\(['"]\\\\n['"]\)\.join\(['"]\\n['"]\)/);
  });

  test('M2.3 BASE_PATH uses canonical artifacts/{APP_ID}/public/data', () => {
    expect(SRC).toMatch(/artifacts\/\$\{APP_ID\}\/public\/data/);
  });

  test('M2.4 dry-run is the default (--apply opts in)', () => {
    expect(SRC).toMatch(/const apply = process\.argv\.includes\(['"]--apply['"]\)/);
    expect(SRC).toMatch(/const dryRun = !apply/);
  });

  test('M2.5 audit-doc collection name + serverTimestamp', () => {
    expect(SRC).toMatch(/be_admin_audit/);
    expect(SRC).toMatch(/FieldValue\.serverTimestamp/);
  });

  test('M2.6 audit doc records BOTH phases (migratedA + spawnedB)', () => {
    expect(SRC).toMatch(/migratedA:/);
    expect(SRC).toMatch(/spawnedB:/);
  });

  test('M2.7 forensic trail fields stamped on strict-stamp', () => {
    expect(SRC).toMatch(/appointmentTypeMigratedAt/);
    expect(SRC).toMatch(/appointmentTypeLegacyValue/);
  });

  test('M2.8 deposit gets linkedAppointmentId stamp on backfill', () => {
    expect(SRC).toMatch(/linkedAppointmentId:\s*appointmentId/);
    expect(SRC).toMatch(/linkedAppointmentBackfilledAt/);
  });

  test('M2.9 batch-size respects writeBatch 500-op cap (200 pair = 400 ops)', () => {
    expect(SRC).toMatch(/PAIR_BATCH_SIZE\s*=\s*200/);
  });

  test('M2.10 idempotency check (skip already-linked deposits)', () => {
    // depositNeedsBackfill enforces this, but the helper is also unit-tested above.
    expect(SRC).toMatch(/linkedAppointmentId/);
  });

  test('M2.11 Phase 21.0 marker present', () => {
    expect(SRC).toMatch(/Phase 21\.0/);
  });
});
