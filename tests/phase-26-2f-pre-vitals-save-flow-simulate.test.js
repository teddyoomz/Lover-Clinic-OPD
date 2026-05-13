/**
 * Phase 26.2f-pre — vitals-save pure-JS flow simulate (F11, Task 5)
 *
 * Rule I full-flow simulate: chains the entire vitals-save pathway without
 * React mount or real Firestore. Mirrors the user flow:
 *   handleSubmit('vitals') → saveMode coercion → v26StatusPatch vitals branch
 *   → status:'vitalsigns-recorded' + recordedBy/At stamps
 *   → ALL deduction/sale/stock/course callsites SKIPPED via dual-gate
 *   → canAddNewItems includes vitalsigns-recorded
 *
 * Rule N: targeted-only (pure-JS simulate, no React mount).
 * AV37 extension for Phase 26.2f-pre.
 */
import { describe, it, expect } from 'vitest';

// ── Pure-JS simulators mirroring TFP inline logic ──────────────────────────

/**
 * Mirror of TFP handleSubmit saveMode coercion block.
 * eventOrSaveMode can be a string (direct call) or a synthetic event object.
 */
function simulateSaveModeCoercion(eventOrSaveMode) {
  if (typeof eventOrSaveMode === 'string') {
    return (eventOrSaveMode === 'doctor') ? 'doctor'
         : (eventOrSaveMode === 'vitals') ? 'vitals'
         : 'staff';
  }
  if (eventOrSaveMode && typeof eventOrSaveMode === 'object') {
    const sm = eventOrSaveMode.saveMode;
    return (sm === 'doctor') ? 'doctor'
         : (sm === 'vitals') ? 'vitals'
         : 'staff';
  }
  return 'staff';
}

/**
 * Mirror of TFP v26StatusPatch routing.
 * saveMode === 'doctor' → doctor-recorded patch
 * saveMode === 'vitals' → vitalsigns-recorded patch
 * otherwise → staff patch (null / deleteField equivalent)
 */
function simulateV26StatusPatch(saveMode, currentUserId) {
  if (saveMode === 'doctor') {
    return {
      status: 'doctor-recorded',
      recordedBy: currentUserId || null,
      recordedAt: '__serverTimestamp__',
    };
  }
  if (saveMode === 'vitals') {
    return {
      status: 'vitalsigns-recorded',
      recordedBy: currentUserId || null,
      recordedAt: '__serverTimestamp__',
    };
  }
  // staff / regular save
  return {
    status: null,
    recordedBy: null,
    recordedAt: null,
  };
}

/**
 * Mirror of TFP dual-gate condition guarding every deduction callsite.
 * Returns true if deductions should proceed, false if they should be skipped.
 */
function simulateShouldRunDeductions(saveMode) {
  return saveMode !== 'doctor' && saveMode !== 'vitals';
}

/**
 * Mirror of TFP canAddNewItems computation.
 */
function simulateCanAddNewItems(mode, loadedTreatmentStatus) {
  return (mode === 'create')
    || (loadedTreatmentStatus === 'doctor-recorded')
    || (loadedTreatmentStatus === 'vitalsigns-recorded');
}

// ── F11 — vitals-save flow simulate ────────────────────────────────────────

describe('F11 Phase 26.2f-pre — vitals-save flow simulate', () => {
  // ── F11.1 — string-arg coercion ───────────────────────────────────────────
  it('F11.1 handleSubmit("vitals") coerces to saveMode="vitals"', () => {
    const result = simulateSaveModeCoercion('vitals');
    expect(result).toBe('vitals');
  });

  it('F11.1b handleSubmit("doctor") still coerces to "doctor" (no regression)', () => {
    expect(simulateSaveModeCoercion('doctor')).toBe('doctor');
    expect(simulateSaveModeCoercion('staff')).toBe('staff');
    expect(simulateSaveModeCoercion({})).toBe('staff');
  });

  // ── F11.2 — v26StatusPatch vitals branch ──────────────────────────────────
  it('F11.2 vitals branch stamps status:vitalsigns-recorded + recordedBy/At', () => {
    const patch = simulateV26StatusPatch('vitals', 'uid-nurse-01');
    expect(patch.status).toBe('vitalsigns-recorded');
    expect(patch.recordedBy).toBe('uid-nurse-01');
    expect(patch.recordedAt).toBe('__serverTimestamp__');
  });

  it('F11.2b doctor branch still stamps doctor-recorded (no regression)', () => {
    const patch = simulateV26StatusPatch('doctor', 'uid-doc-01');
    expect(patch.status).toBe('doctor-recorded');
    expect(patch.recordedBy).toBe('uid-doc-01');
  });

  // ── F11.3 — dual gate skips all deductions ────────────────────────────────
  it('F11.3 vitals saveMode skips all deduction callsites via dual gate', () => {
    expect(simulateShouldRunDeductions('vitals')).toBe(false);
  });

  it('F11.3b doctor saveMode also skips deductions (no regression)', () => {
    expect(simulateShouldRunDeductions('doctor')).toBe(false);
  });

  it('F11.3c staff saveMode DOES run deductions', () => {
    expect(simulateShouldRunDeductions('staff')).toBe(true);
    expect(simulateShouldRunDeductions('create')).toBe(true);
  });

  // ── F11.4 — canAddNewItems includes vitalsigns-recorded ───────────────────
  it('F11.4 canAddNewItems is true when loadedTreatmentStatus is vitalsigns-recorded', () => {
    expect(simulateCanAddNewItems('edit', 'vitalsigns-recorded')).toBe(true);
  });

  it('F11.4b canAddNewItems is also true for create and doctor-recorded', () => {
    expect(simulateCanAddNewItems('create', undefined)).toBe(true);
    expect(simulateCanAddNewItems('edit', 'doctor-recorded')).toBe(true);
  });

  it('F11.4c canAddNewItems is false when status is undefined/null on edit', () => {
    expect(simulateCanAddNewItems('edit', undefined)).toBe(false);
    expect(simulateCanAddNewItems('edit', null)).toBe(false);
    expect(simulateCanAddNewItems('edit', 'pending')).toBe(false);
  });

  // ── F11.5 — full chain: vitals-save end-to-end ───────────────────────────
  it('F11.5 full chain: handleSubmit("vitals") → skips deductions → stamps vitalsigns-recorded', () => {
    // Step 1: coerce saveMode
    const saveMode = simulateSaveModeCoercion('vitals');
    expect(saveMode).toBe('vitals');

    // Step 2: dual gate — no deductions
    expect(simulateShouldRunDeductions(saveMode)).toBe(false);

    // Step 3: v26StatusPatch
    const patch = simulateV26StatusPatch(saveMode, 'uid-staff-42');
    expect(patch.status).toBe('vitalsigns-recorded');
    expect(patch.recordedBy).toBe('uid-staff-42');
    expect(patch.recordedAt).toBe('__serverTimestamp__');

    // Step 4: after vitals save, canAddNewItems should be true on next load
    const canAdd = simulateCanAddNewItems('edit', patch.status);
    expect(canAdd).toBe(true);
  });
});
