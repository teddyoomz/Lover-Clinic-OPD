import { describe, it, expect } from 'vitest';
import {
  resolveCourseDeducted,
  resolveCourseStepState,
  getTreatmentLifecycle,
} from '../src/lib/treatmentDisplayResolvers.js';
import { decideApptStatusServiceSync } from '../src/lib/appointmentDisplay.js';

// V139 (2026-05-31) — Rule I full-flow simulate: chains the REAL helpers the
// production code uses (no mounting), so a drift in any link is caught.

// ── F1 · course-step end-to-end (deduct → live doc → step state) ──────────────
describe('V139.F1 · course-step flow (real getTreatmentLifecycle + resolvers)', () => {
  const completedDone = (t) => getTreatmentLifecycle(t).some((s) => s.key === 'completed');
  const stepFor = (t) => resolveCourseStepState({ courseDeducted: resolveCourseDeducted(t), completedDone: completedDone(t) });

  it('buy-and-deduct-this-visit → done (purchase + deduct present)', () => {
    expect(stepFor({ completedAt: '2026-05-31T03:40:00Z', detail: { courseItems: [{ rowId: 'r1' }], treatmentItems: [{ id: 't1' }], purchasedItems: [{ id: 'p1' }] } })).toBe('done');
  });
  it('deduct-existing-only → done', () => {
    expect(stepFor({ completedAt: '2026-05-31T03:40:00Z', detail: { courseItems: [{ rowId: 'r1' }], treatmentItems: [{ id: 't1' }] } })).toBe('done');
  });
  it('treatmentItems-only (fill-later) → done', () => {
    expect(stepFor({ completedAt: '2026-05-31T03:40:00Z', detail: { treatmentItems: [{ id: 't1' }] } })).toBe('done');
  });
  it('purchase-only-no-deduct + completed → warn (THE bug we catch)', () => {
    expect(stepFor({ completedAt: '2026-05-31T03:40:00Z', detail: { purchasedItems: [{ id: 'p1' }], courseItems: [], treatmentItems: [] } })).toBe('warn');
  });
  it('no-course + completed → warn', () => {
    expect(stepFor({ completedAt: '2026-05-31T03:40:00Z', detail: {} })).toBe('warn');
  });
  it('no-course + in-progress (doctor done, not completed) → pending (no false warn)', () => {
    expect(stepFor({ doctorRecordedAt: '2026-05-31T03:20:00Z', detail: {} })).toBe('pending');
  });
  it('completed via the !status fallback (editedAt, no top-level status) + no deduct → warn', () => {
    // mirrors real prod shape: status:'(none)', completedAt present
    expect(stepFor({ editedAt: '2026-05-31T03:40:00Z', detail: {} })).toBe('warn');
  });
});

// ── F2 · status ↔ tab coupling round-trips (the 4 user scenarios) ─────────────
describe('V139.F2 · status/tab coupling round-trip', () => {
  it('① mark-complete: confirmed + no stamp → stamp (→ done tab)', () => {
    expect(decideApptStatusServiceSync('done', null)).toBe('stamp');
  });
  it('② modal sets "เสร็จแล้ว" from confirmed → stamp (→ done tab) — cross-surface', () => {
    expect(decideApptStatusServiceSync('done', undefined)).toBe('stamp');
  });
  it('③ back-to-queue: confirmed while stamped → clear (→ waiting tab)', () => {
    expect(decideApptStatusServiceSync('confirmed', { toMillis: () => 1 })).toBe('clear');
  });
  it('④ symmetric: modal sets "ยืนยันแล้ว" from done → clear (→ waiting tab)', () => {
    expect(decideApptStatusServiceSync('confirmed', '2026-05-31T00:00:00Z')).toBe('clear');
  });
  it('round-trip stays stable: stamp then re-save (done, stamped) → none (no churn)', () => {
    expect(decideApptStatusServiceSync('done', '2026-05-31T00:00:00Z')).toBe('none');
  });
  it('no-clobber: edit time/room only (no status in patch, was stamped) → none (stays in done tab)', () => {
    expect(decideApptStatusServiceSync(undefined, '2026-05-31T00:00:00Z')).toBe('none');
  });
  it('cancelled from done → clear (leaves done tab; cancelled filtered out of today anyway)', () => {
    expect(decideApptStatusServiceSync('cancelled', '2026-05-31T00:00:00Z')).toBe('clear');
  });
});

// ── F3 · adversarial ─────────────────────────────────────────────────────────
describe('V139.F3 · adversarial', () => {
  it('resolveCourseDeducted tolerates poison shapes → false', () => {
    for (const x of [null, undefined, 0, '', [], NaN, { detail: null }, { detail: 'x' }, { detail: { courseItems: {} } }, { detail: { courseItems: [], treatmentItems: [] } }, { detail: { courseItems: 0 } }])
      expect(resolveCourseDeducted(x)).toBe(false);
  });
  it('resolveCourseStepState tolerates missing/partial args → pending unless explicit', () => {
    expect(resolveCourseStepState()).toBe('pending');
    expect(resolveCourseStepState({ courseDeducted: undefined, completedDone: undefined })).toBe('pending');
    expect(resolveCourseStepState({ completedDone: true })).toBe('warn');
  });
  it('decideApptStatusServiceSync only couples lowercase "done"; tolerates weird input', () => {
    for (const s of [null, undefined, '', 0, 1, {}, [], 'DONE', 'Done', 'done ', ' done'])
      expect(['stamp', 'clear', 'none']).toContain(decideApptStatusServiceSync(s, null));
    expect(decideApptStatusServiceSync('DONE', null)).toBe('none');   // case-sensitive
    expect(decideApptStatusServiceSync('done ', null)).toBe('none');  // trailing space ≠ done
    expect(decideApptStatusServiceSync('done', { seconds: 0, nanoseconds: 0 })).toBe('none'); // FS Timestamp object is truthy → already in done tab
  });
});
