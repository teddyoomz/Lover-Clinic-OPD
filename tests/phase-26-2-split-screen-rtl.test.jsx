// Phase 26.2 — TreatmentReadOnlyPanel RTL tests (E6.1–E6.4)
// Task 2: create panel component extracted from TreatmentTimelineModal row JSX.
// AV38 read-only contract: no edit/delete props, no form inputs, no save buttons.
// Phase 26.2 spec: docs/superpowers/specs/2026-05-13-phase-26-2-tfp-split-screen.md

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../src/lib/dateFormat.js', () => ({
  fmtThaiDate: (d) => d || '-',
  THAI_MONTHS_FULL: ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'],
}));

vi.mock('../src/utils.js', () => ({
  hexToRgb: () => '220,38,38',
}));

// Stub Lucide icons to avoid SVG issues in jsdom
// Use importOriginal + override every named export so vitest named-import checks pass
vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal();
  const mockIcon = (key) =>
    ({ size, className, style, 'aria-label': al, ...rest }) =>
      React.createElement('span', { 'data-mock-icon': key, className, style, ...rest });

  const overrides = {};
  for (const key of Object.keys(actual)) {
    overrides[key] = mockIcon(key);
  }
  return { ...actual, ...overrides };
});

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TREATMENT_SUMMARY = {
  id: 'T-001',
  date: '2026-05-13',
  doctor: 'นพ. สมชาย',
  branch: 'สาขาหลัก',
  assistants: ['พยาบาล A'],
  cc: 'อาการปวด',
  dx: 'วินิจฉัย X',
  status: undefined,
};

const TREATMENT_FULL = {
  treatmentId: 'T-001',
  detail: {
    treatmentNote: 'หมายเหตุแพทย์',
    treatmentItems: [
      { name: 'รายการ 1', qty: 1, unit: 'ครั้ง' },
    ],
    medications: [{ name: 'ยา A', qty: 1, unit: 'เม็ด' }],
    consumables: [],
    beforeImages: [{ dataUrl: 'data:image/png;base64,abc', id: 'img1' }],
    afterImages: [],
    otherImages: [],
  },
};

// ─── E6: TreatmentReadOnlyPanel RTL ──────────────────────────────────────────

describe('E6 — TreatmentReadOnlyPanel', () => {
  let TreatmentReadOnlyPanel;

  beforeEach(async () => {
    const mod = await import('../src/components/backend/TreatmentReadOnlyPanel.jsx');
    TreatmentReadOnlyPanel = mod.default;
  });

  // E6.1 — renders treatment data correctly
  it('E6.1 renders treatment summary and detail data', () => {
    render(
      <TreatmentReadOnlyPanel
        treatmentSummary={TREATMENT_SUMMARY}
        treatmentFull={TREATMENT_FULL}
        treatmentsLoading={false}
        theme="dark"
        accentColor="#2EC4B6"
      />
    );

    // Root testid
    expect(screen.getByTestId('treatment-read-only-panel')).toBeTruthy();

    // Date is rendered
    expect(screen.getByText('2026-05-13')).toBeTruthy();

    // Doctor is rendered
    expect(screen.getByText('นพ. สมชาย')).toBeTruthy();

    // Branch is rendered
    expect(screen.getByText('สาขาหลัก')).toBeTruthy();

    // CC visible
    expect(screen.getByText('อาการปวด')).toBeTruthy();

    // DX visible
    expect(screen.getByText('วินิจฉัย X')).toBeTruthy();

    // No edit button — AV38 read-only contract
    expect(screen.queryByTestId('timeline-edit-T-001')).toBeNull();
  });

  // E6.2 — shows loading state when treatmentsLoading and no full doc
  it('E6.2 shows loading spinner when treatmentsLoading=true and no full detail', () => {
    render(
      <TreatmentReadOnlyPanel
        treatmentSummary={TREATMENT_SUMMARY}
        treatmentFull={null}
        treatmentsLoading={true}
        theme="dark"
        accentColor="#2EC4B6"
      />
    );

    // Loading text visible
    expect(screen.getByText(/กำลังโหลดรายละเอียด/)).toBeTruthy();

    // No image grids while loading
    expect(screen.queryByTestId('timeline-img-zoom')).toBeNull();
  });

  // E6.3 — close button hidden by default (showCloseButton=false default)
  it('E6.3 close button is hidden by default (showCloseButton defaults to false)', () => {
    render(
      <TreatmentReadOnlyPanel
        treatmentSummary={TREATMENT_SUMMARY}
        treatmentFull={TREATMENT_FULL}
        treatmentsLoading={false}
        theme="dark"
        accentColor="#2EC4B6"
      />
    );

    expect(screen.queryByTestId('treatment-read-only-panel-close')).toBeNull();
  });

  // E6.4 — close button visible and fires onClose when showCloseButton=true
  it('E6.4 close button visible and fires onClose when showCloseButton=true', () => {
    const handleClose = vi.fn();
    render(
      <TreatmentReadOnlyPanel
        treatmentSummary={TREATMENT_SUMMARY}
        treatmentFull={TREATMENT_FULL}
        treatmentsLoading={false}
        theme="dark"
        accentColor="#2EC4B6"
        showCloseButton={true}
        onClose={handleClose}
      />
    );

    const closeBtn = screen.getByTestId('treatment-read-only-panel-close');
    expect(closeBtn).toBeTruthy();

    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
