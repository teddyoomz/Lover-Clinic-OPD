import { describe, it, expect } from 'vitest';
import { resolveCourseDeducted, resolveCourseStepState } from '../src/lib/treatmentDisplayResolvers.js';

// V139 (2026-05-31) — OPD "course" step on the "นัดหมาย วันนี้" card.
// SSOT predicate reads detail.courseItems / detail.treatmentItems on the raw
// be_treatments doc (Rule R confirmed: TOP-LEVEL courseItems = 0; usage under detail).

describe('V139 · resolveCourseDeducted (SSOT, reads detail.* on raw be_treatments doc)', () => {
  it('true when detail.courseItems non-empty (deduction ledger)', () => {
    expect(resolveCourseDeducted({ detail: { courseItems: [{ rowId: 'r1' }] } })).toBe(true);
  });
  it('true when detail.treatmentItems non-empty (fill-later course usage)', () => {
    expect(resolveCourseDeducted({ detail: { treatmentItems: [{ id: 'x' }] } })).toBe(true);
  });
  it('false when only purchasedItems (ซื้ออย่างเดียว ≠ ตัด)', () => {
    expect(resolveCourseDeducted({ detail: { purchasedItems: [{ id: 'p' }], courseItems: [], treatmentItems: [] } })).toBe(false);
  });
  it('false for empty/missing detail / null / non-object / arrays-undefined-or-bad-type', () => {
    expect(resolveCourseDeducted({ detail: {} })).toBe(false);
    expect(resolveCourseDeducted({})).toBe(false);
    expect(resolveCourseDeducted(null)).toBe(false);
    expect(resolveCourseDeducted(undefined)).toBe(false);
    expect(resolveCourseDeducted('nope')).toBe(false);
    expect(resolveCourseDeducted({ detail: { courseItems: 'bad', treatmentItems: null } })).toBe(false);
    expect(resolveCourseDeducted({ detail: { courseItems: {} } })).toBe(false);
  });
  it('does NOT read top-level courseItems (must be under detail — Rule R locked)', () => {
    expect(resolveCourseDeducted({ courseItems: [{ rowId: 'r' }] })).toBe(false);
    expect(resolveCourseDeducted({ treatmentItems: [{ id: 'x' }] })).toBe(false);
  });
});

describe('V139 · resolveCourseStepState', () => {
  it('done when courseDeducted (regardless of completed)', () => {
    expect(resolveCourseStepState({ courseDeducted: true, completedDone: false })).toBe('done');
    expect(resolveCourseStepState({ courseDeducted: true, completedDone: true })).toBe('done');
  });
  it('not-deducted when completed but not deducted (② 2026-05-31 — was warn "ยังไม่ตัด")', () => {
    expect(resolveCourseStepState({ courseDeducted: false, completedDone: true })).toBe('not-deducted');
  });
  it('pending when not deducted and not completed (no false warn mid-flow)', () => {
    expect(resolveCourseStepState({ courseDeducted: false, completedDone: false })).toBe('pending');
  });
  it('defensive: missing args → pending', () => {
    expect(resolveCourseStepState()).toBe('pending');
    expect(resolveCourseStepState({})).toBe('pending');
  });
});

import { render, screen, cleanup } from '@testing-library/react';
import AppointmentOpdStepperRow from '../src/components/admin/AppointmentOpdStepperRow.jsx';

// tests/setup.js does NOT auto-cleanup → isolate each render so dot-counts are exact.
afterEach(cleanup);

const mkTreatment = (over = {}) => ({
  id: 'T1',
  vitalsignsRecordedAt: '2026-05-31T03:00:00Z',
  doctorRecordedAt: '2026-05-31T03:20:00Z',
  completedAt: '2026-05-31T03:40:00Z',
  detail: { treatmentDate: '2026-05-31' },
  ...over,
});

describe('V139 · OPD card course step (RTL)', () => {
  it('renders 4 dots incl. "คอร์ส" when course deducted', () => {
    render(<AppointmentOpdStepperRow isTodayTab latestTreatment={mkTreatment({ detail: { treatmentDate: '2026-05-31', courseItems: [{ rowId: 'r' }] } })} />);
    expect(screen.getByText('คอร์ส')).toBeInTheDocument();
    expect(screen.getAllByTestId('stepper-dot')).toHaveLength(4);
  });
  it('shows muted "ไม่ตัดคอร์ส" when completed but not deducted (② 2026-05-31 — was amber "ยังไม่ตัด")', () => {
    render(<AppointmentOpdStepperRow isTodayTab latestTreatment={mkTreatment()} />);
    expect(screen.getByText('ไม่ตัดคอร์ส')).toBeInTheDocument();
    expect(screen.queryByText('ยังไม่ตัด')).toBeNull();
    expect(screen.queryByText('คอร์ส')).toBeNull();
  });
  it('shows neutral "คอร์ส" (no warn) when in-progress (doctor done, not completed)', () => {
    render(<AppointmentOpdStepperRow isTodayTab latestTreatment={mkTreatment({ completedAt: null })} />);
    expect(screen.getByText('คอร์ส')).toBeInTheDocument();
    expect(screen.queryByText('ยังไม่ตัด')).toBeNull();
  });
  it('purchase-only (ซื้อแต่ไม่ตัด) + completed → muted "ไม่ตัดคอร์ส" (② 2026-05-31 — was warn)', () => {
    render(<AppointmentOpdStepperRow isTodayTab latestTreatment={mkTreatment({ detail: { treatmentDate: '2026-05-31', purchasedItems: [{ id: 'p' }], courseItems: [], treatmentItems: [] } })} />);
    expect(screen.getByText('ไม่ตัดคอร์ส')).toBeInTheDocument();
  });
  it('no-treatment today → 4 muted dots incl. course', () => {
    render(<AppointmentOpdStepperRow isTodayTab latestTreatment={null} />);
    expect(screen.getAllByTestId('stepper-dot')).toHaveLength(4);
  });
});
