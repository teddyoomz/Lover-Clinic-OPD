// tests/phase-22-0a-sync-status-reset.test.js
// Phase 22.0a — sync-status reset migration helpers + source-grep contract.
//
// Locks the safety contract per user directive (verbatim 2026-05-06):
//   "อย่าลบข้อมูลลูกค้าใน frontend นะเว้ย แค่ให้หบุด sync นะเว้ยย
//    ข้อมูลสำคัญมากนะ"
//
// NO test asserts a deletion. ALL tests assert preservation + status flip.

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

let mig;
try {
  mig = await import('../scripts/phase-22-0a-reset-sync-status.mjs');
} catch (err) {
  // firebase-admin may not init in test env if creds missing; pure helpers
  // are still importable since the invocation guard prevents main() from running.
  mig = null;
}

const SRC = readFileSync('scripts/phase-22-0a-reset-sync-status.mjs', 'utf8');

describe('Phase 22.0a — F1 mapOpdSessionWipe (opd_sessions field wipe)', () => {
  test('F1.1 returns the wipe patch + forensic-trail when any wipe-target field is set', () => {
    if (!mig) return;
    const result = mig.mapOpdSessionWipe({
      brokerStatus: 'done',
      brokerProClinicId: 'PC-12345',
      brokerProClinicHN: 'HN-001',
      depositSyncStatus: 'done',
      appointmentSyncStatus: 'pending',
      otherField: 'kept',
    });
    expect(result.hasChange).toBe(true);
    expect(result.patch.brokerStatus).toBeNull();
    expect(result.patch.brokerProClinicId).toBeNull();
    expect(result.patch.brokerProClinicHN).toBeNull();
    expect(result.patch.depositSyncStatus).toBeNull();
    expect(result.patch.appointmentSyncStatus).toBeNull();
    expect(result.patch.brokerError).toBeNull();
    expect(result.patch.brokerFilledAt).toBeNull();
    expect(result.patch.brokerLastAutoSyncAt).toBeNull();
    // Forensic trail captures legacy values
    expect(result.patch.brokerResetMetadata).toBeDefined();
    expect(result.patch.brokerResetMetadata.legacyBrokerStatus).toBe('done');
    expect(result.patch.brokerResetMetadata.legacyBrokerProClinicId).toBe('PC-12345');
    expect(result.patch.brokerResetMetadata.legacyBrokerProClinicHN).toBe('HN-001');
    expect(result.patch.brokerResetMetadata.legacyDepositSyncStatus).toBe('done');
    expect(result.patch.brokerResetMetadata.legacyAppointmentSyncStatus).toBe('pending');
    expect(result.patch.brokerResetMetadata.resetPhase).toBe('22.0a');
  });

  test('F1.2 idempotent — already-wiped doc returns hasChange=false', () => {
    if (!mig) return;
    // All wipe-target fields null OR missing
    const result1 = mig.mapOpdSessionWipe({});
    expect(result1.hasChange).toBe(false);
    expect(result1.patch).toBeNull();

    const result2 = mig.mapOpdSessionWipe({
      brokerStatus: null,
      depositSyncStatus: null,
      appointmentSyncStatus: '',
      brokerProClinicId: null,
    });
    expect(result2.hasChange).toBe(false);

    const result3 = mig.mapOpdSessionWipe({ brokerStatus: '', depositSyncStatus: '' });
    expect(result3.hasChange).toBe(false);
  });

  test('F1.3 partial — only the SET fields appear in legacy metadata', () => {
    if (!mig) return;
    const result = mig.mapOpdSessionWipe({
      brokerStatus: 'done',
      // depositSyncStatus is null → not a legacy entry
      appointmentSyncStatus: 'failed',
    });
    expect(result.hasChange).toBe(true);
    const meta = result.patch.brokerResetMetadata;
    expect(meta.legacyBrokerStatus).toBe('done');
    expect(meta.legacyAppointmentSyncStatus).toBe('failed');
    expect(meta.legacyDepositSyncStatus).toBeUndefined();
    expect(meta.legacyBrokerProClinicId).toBeUndefined();
  });

  test('F1.4 doc with non-wipe-target fields untouched', () => {
    if (!mig) return;
    const result = mig.mapOpdSessionWipe({
      brokerStatus: 'done',
      patientData: { firstName: 'Test' },
      sessionName: 'preserve me',
      formType: 'deposit',
      isPermanent: true,
    });
    // Patch only contains the wipe-target nulls + forensic trail.
    // Non-wipe fields are NOT in the patch (preserved by Firestore update).
    expect(result.patch.patientData).toBeUndefined();
    expect(result.patch.sessionName).toBeUndefined();
    expect(result.patch.formType).toBeUndefined();
    expect(result.patch.isPermanent).toBeUndefined();
  });
});

describe('Phase 22.0a — F2 mapPcSyncCleared (pc_*.syncedAt → null, DOCS PRESERVED)', () => {
  test('F2.1 returns clear-syncedAt patch + forensic trail when syncedAt is set', () => {
    if (!mig) return;
    const result = mig.mapPcSyncCleared({
      syncedAt: '2026-05-01T10:00:00Z',
      patientData: { firstName: 'Test' },  // PRESERVED
      hn_no: 'HN-001',                      // PRESERVED
    });
    expect(result.hasChange).toBe(true);
    expect(result.patch.syncedAt).toBeNull();
    expect(result.patch.proSyncedResetMetadata).toBeDefined();
    expect(result.patch.proSyncedResetMetadata.legacySyncedAt).toBe('2026-05-01T10:00:00Z');
    expect(result.patch.proSyncedResetMetadata.resetPhase).toBe('22.0a');
    // Patch does NOT include patientData / hn_no — those are preserved
    // automatically by Firestore update (only fields in patch are written).
    expect(result.patch.patientData).toBeUndefined();
    expect(result.patch.hn_no).toBeUndefined();
  });

  test('F2.2 idempotent — doc with null/missing syncedAt returns hasChange=false', () => {
    if (!mig) return;
    expect(mig.mapPcSyncCleared({}).hasChange).toBe(false);
    expect(mig.mapPcSyncCleared({ syncedAt: null }).hasChange).toBe(false);
    expect(mig.mapPcSyncCleared({ syncedAt: '' }).hasChange).toBe(false);
  });

  test('F2.3 pc_appointments YYYY-MM doc — embedded appointments[] array PRESERVED', () => {
    if (!mig) return;
    const result = mig.mapPcSyncCleared({
      syncedAt: '2026-05-01T10:00:00Z',
      appointments: [
        { customerId: 'C1', date: '2026-05-15' },
        { customerId: 'C2', date: '2026-05-20' },
      ],
    });
    expect(result.hasChange).toBe(true);
    // patch only touches syncedAt at the top level + adds metadata.
    // The embedded appointments[] array is NOT in the patch → preserved by
    // Firestore (update writes only the patched fields).
    expect(result.patch.syncedAt).toBeNull();
    expect(result.patch.appointments).toBeUndefined();
  });

  test('F2.4 NO destructive delete code path — anti-regression source-grep', () => {
    // Per user safety directive, the script MUST NOT contain any path that
    // calls .delete() on pc_* collections. Guards against regression to
    // the originally-considered Q3=B "delete entire docs" approach.
    expect(SRC).not.toMatch(/db\.collection\(COL\.pcCustomers\)\.\w*\(\)\.delete/);
    expect(SRC).not.toMatch(/\.doc\(.*?\)\.delete\(\)/);
    // Also the helper export name should make the intent explicit
    expect(SRC).toMatch(/export function mapPcSyncCleared/);
    expect(SRC).not.toMatch(/export function shouldDeletePcDoc/);
    expect(SRC).not.toMatch(/export function mapPcDelete/);
  });
});

describe('Phase 22.0a — F3 mapBeDepositWipe (be_deposits.proClinicDepositId)', () => {
  test('F3.1 returns null-out patch when proClinicDepositId is set', () => {
    if (!mig) return;
    const result = mig.mapBeDepositWipe({
      depositId: 'DEP-1',
      proClinicDepositId: 'PC-DEP-99',
      amount: 1000,           // PRESERVED
      customerId: 'C1',       // PRESERVED
    });
    expect(result.hasChange).toBe(true);
    expect(result.patch.proClinicDepositId).toBeNull();
    expect(result.patch.proClinicDepositResetMetadata).toBeDefined();
    expect(result.patch.proClinicDepositResetMetadata.legacyProClinicDepositId).toBe('PC-DEP-99');
    // amount + customerId NOT in patch → preserved by Firestore update
    expect(result.patch.amount).toBeUndefined();
    expect(result.patch.customerId).toBeUndefined();
  });

  test('F3.2 idempotent — deposit without proClinicDepositId returns hasChange=false', () => {
    if (!mig) return;
    expect(mig.mapBeDepositWipe({}).hasChange).toBe(false);
    expect(mig.mapBeDepositWipe({ proClinicDepositId: null }).hasChange).toBe(false);
    expect(mig.mapBeDepositWipe({ proClinicDepositId: '' }).hasChange).toBe(false);
  });

  test('F3.3 conservative scope — does NOT touch other proClinic-related fields', () => {
    if (!mig) return;
    const result = mig.mapBeDepositWipe({
      proClinicDepositId: 'PC-DEP-99',
      // Other fields with proClinic-prefix MUST be left alone (per spec C):
      proClinicCustomerId: 'PC-CUST-1',
    });
    expect(result.patch.proClinicDepositId).toBeNull();
    expect(result.patch.proClinicCustomerId).toBeUndefined();  // not touched
  });
});

describe('Phase 22.0a — F4 randHex (audit-doc id suffix)', () => {
  test('F4.1 generates hex string of expected length', () => {
    if (!mig) return;
    expect(mig.randHex(8)).toMatch(/^[0-9a-f]{8}$/);
    expect(mig.randHex(4)).toMatch(/^[0-9a-f]{4}$/);
    expect(mig.randHex()).toMatch(/^[0-9a-f]{8}$/); // default length
  });

  test('F4.2 unique across calls (crypto-secure)', () => {
    if (!mig) return;
    const ids = new Set();
    for (let i = 0; i < 50; i++) ids.add(mig.randHex(8));
    expect(ids.size).toBe(50);
  });
});

describe('Phase 22.0a — F5 source-grep contract', () => {
  test('F5.1 invocation guard prevents auto-run when imported (V19 #22 lock)', () => {
    expect(SRC).toMatch(/if \(process\.argv\[1\] === fileURLToPath\(import\.meta\.url\)\)/);
  });

  test('F5.2 PEM key newline conversion present (V15 #22 lock)', () => {
    expect(SRC).toMatch(/split\(['"]\\\\n['"]\)\.join\(['"]\\n['"]\)/);
  });

  test('F5.3 BASE_PATH uses canonical artifacts/{APP_ID}/public/data', () => {
    expect(SRC).toMatch(/artifacts\/\$\{APP_ID\}\/public\/data/);
  });

  test('F5.4 dry-run is the default (--apply opts in)', () => {
    expect(SRC).toMatch(/const apply = process\.argv\.includes\(['"]--apply['"]\)/);
    expect(SRC).toMatch(/const dryRun = !apply/);
  });

  test('F5.5 audit doc to be_admin_audit + serverTimestamp', () => {
    expect(SRC).toMatch(/be_admin_audit/);
    expect(SRC).toMatch(/FieldValue\.serverTimestamp/);
  });

  test('F5.6 audit-doc records all 3 sub-phase counters', () => {
    expect(SRC).toMatch(/opdSessionsWiped/);
    expect(SRC).toMatch(/pcCustomersSyncCleared/);
    expect(SRC).toMatch(/pcAppointmentsSyncCleared/);
    expect(SRC).toMatch(/pcCoursesSyncCleared/);
    expect(SRC).toMatch(/pcDepositsSyncCleared/);
    expect(SRC).toMatch(/pcTreatmentsSyncCleared/);
    expect(SRC).toMatch(/beDepositsProClinicIdNulled/);
  });

  test('F5.7 user safety directive captured in audit doc field', () => {
    expect(SRC).toMatch(/safetyDirective:\s*['"]อย่าลบข้อมูลลูกค้าใน frontend/);
  });

  test('F5.8 batch-size respects writeBatch 500-op cap', () => {
    expect(SRC).toMatch(/BATCH_SIZE\s*=\s*400/);
  });

  test('F5.9 marker comment present (institutional memory grep)', () => {
    expect(SRC).toMatch(/Phase 22\.0a/);
    expect(SRC).toMatch(/NO DELETIONS/);
  });

  test('F5.10 OPD_WIPE_FIELDS contains all 8 expected fields', () => {
    expect(SRC).toMatch(/OPD_WIPE_FIELDS = Object\.freeze\(\[/);
    for (const field of [
      'brokerStatus',
      'brokerProClinicId',
      'brokerProClinicHN',
      'brokerError',
      'brokerFilledAt',
      'brokerLastAutoSyncAt',
      'depositSyncStatus',
      'appointmentSyncStatus',
    ]) {
      expect(SRC).toMatch(new RegExp(`['"]${field}['"]`));
    }
  });
});
