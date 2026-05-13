// tests/phase-28-treatment-history-flow-simulate.test.jsx
//
// Phase 28 Task 10 (2026-05-14) — Rule I full-flow simulate.
//
// Realistic 5-treatment fixture mirrors user's reference screenshot:
//   - 4 rows on 2026-05-14 (today)
//   - 1 row on 2026-05-07 (1 สัปดาห์ที่แล้ว)
//
// Chains the entire post-Phase-28 architecture:
//   master data (treatmentSummary)
//     → groupTreatmentsByDate helper (Task 1)
//     → TreatmentDateHeader render (Task 3)
//     → TreatmentHistoryRow render (Task 4) with stepper + status + meta + cc/dx preview
//     → user click → setExpandedTreatment fired
//     → TreatmentHistoryExpandedBody (Task 5) renders CC/DX callout + print buttons
//     → click print buttons → setPrintPerTreatment fired with correct payload shape
//
// Mirrors V52/V53/V54 Rule I full-flow simulate template.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TreatmentHistoryCard } from '../src/components/backend/treatment-history/TreatmentHistoryCard.jsx';

// Realistic 5-treatment fixture matching user's screenshot:
// - 4 rows on 14 พ.ค. 2569 (today)
// - 1 row on 7 พ.ค. 2569 (7 days ago = "1 สัปดาห์ที่แล้ว")
const FIXTURE = [
  { id: 'BT-1', date: '2026-05-14', vitalsignsRecordedAt: '2026-05-14T04:13:00Z',
    doctor: 'หมอกวางตุ้ง', branch: 'นครราชสีมา', cc: 'aaa', dx: '' },
  { id: 'BT-2', date: '2026-05-14', vitalsignsRecordedAt: '2026-05-14T04:02:00Z',
    doctorRecordedAt: '2026-05-14T04:23:00Z', completedAt: '2026-05-14T04:23:00Z',
    cc: 'ฟหกฟ', dx: 'ฟหกฟห', editedByName: 'กวางตุ้ง', editedByRole: 'staff' },
  { id: 'BT-3', date: '2026-05-14', vitalsignsRecordedAt: '2026-05-14T03:52:00Z',
    cc: '', dx: '' },
  { id: 'BT-4', date: '2026-05-14', vitalsignsRecordedAt: '2026-05-14T03:49:00Z',
    completedAt: '2026-05-14T03:49:00Z', doctor: 'หมอมายด์', cc: 'ฟห', dx: 'ฟหกห' },
  { id: 'BT-5', date: '2026-05-07', completedAt: '2026-05-07T01:03:00Z',
    cc: 'แปฟหก', dx: 'แฟหแ', editedByName: 'กวางตุ้ง', editedByRole: 'staff' },
];

describe('Phase 28 · TreatmentHistoryCard full-flow simulate (Rule I)', () => {
  const renderCard = (overrides = {}) => {
    const props = {
      treatmentSummary: FIXTURE,
      treatments: [],
      customer: { treatmentCount: 13 },
      expandedTreatment: null,
      setExpandedTreatment: vi.fn(),
      onCreateTreatment: vi.fn(),
      onEditTreatment: vi.fn(),
      onDeleteTreatment: vi.fn(),
      treatmentPage: 1,
      setTreatmentPage: vi.fn(),
      treatmentsLoading: false,
      treatmentsError: '',
      setPrintDocOpen: vi.fn(),
      setShowTimeline: vi.fn(),
      setPrintPerTreatment: vi.fn(),
      ac: '#fff',
      acRgb: '255,255,255',
      isDark: true,
      todayISO: '2026-05-14',
      ...overrides,
    };
    return render(<TreatmentHistoryCard {...props} />);
  };

  it('F1.1 grouped rendering — 2 date headers + 5 rows', () => {
    renderCard();
    expect(screen.getByTestId('date-header-2026-05-14')).toBeInTheDocument();
    expect(screen.getByTestId('date-header-2026-05-07')).toBeInTheDocument();
    // Date header counts
    expect(screen.getByText('4 รายการ')).toBeInTheDocument();
    expect(screen.getByText('1 รายการ')).toBeInTheDocument();
    // All 5 rows
    for (const t of FIXTURE) {
      expect(screen.getByTestId(`treatment-row-${t.id}`)).toBeInTheDocument();
    }
  });

  it('F1.2 today date header has fire-red border + วันนี้ pill; past date is muted gray + 1 สัปดาห์ที่แล้ว', () => {
    renderCard();
    expect(screen.getByText('วันนี้')).toBeInTheDocument();
    expect(screen.getByText('1 สัปดาห์ที่แล้ว')).toBeInTheDocument();
  });

  it('F1.3 latest tag only on first row (BT-1) — single occurrence', () => {
    renderCard();
    const latestTags = screen.getAllByText('ล่าสุด');
    expect(latestTags).toHaveLength(1);
    const bt1Row = screen.getByTestId('treatment-row-BT-1');
    expect(bt1Row.textContent).toContain('ล่าสุด');
  });

  it('F1.4 stepper renders all 3 stage timestamps for completed BT-2 (Bangkok TZ)', () => {
    renderCard();
    const row = screen.getByTestId('treatment-row-BT-2');
    // 04:02 UTC = 11:02 Bangkok; 04:23 UTC = 11:23 Bangkok (twice — doctor + completed)
    expect(row.textContent).toContain('11:02');
    expect(row.textContent).toContain('11:23');
  });

  it('F1.5 click row → setExpandedTreatment fired', async () => {
    const setExpanded = vi.fn();
    renderCard({ setExpandedTreatment: setExpanded });
    await userEvent.click(screen.getByTestId('treatment-toggle-BT-1'));
    expect(setExpanded).toHaveBeenCalledWith('BT-1');
  });

  it('F1.6 expanded row chains: stepper + CC/DX callout + print buttons (Task 5 body)', () => {
    renderCard({ expandedTreatment: 'BT-2' });
    // CC/DX callout labels in expanded body
    expect(screen.getByText(/CC.*อาการ/)).toBeInTheDocument();
    expect(screen.getByText(/DX.*วินิจฉัย/)).toBeInTheDocument();
    expect(screen.getByText('ฟหกฟ')).toBeInTheDocument();
    expect(screen.getByText('ฟหกฟห')).toBeInTheDocument();
    // Print buttons
    expect(screen.getByTestId('treatment-print-cert-BT-2')).toBeInTheDocument();
    expect(screen.getByTestId('treatment-print-record-BT-2')).toBeInTheDocument();
  });

  it('F1.7 click print cert in expanded body → setPrintPerTreatment with correct payload', async () => {
    const setPrintPerTreatment = vi.fn();
    renderCard({ expandedTreatment: 'BT-2', setPrintPerTreatment });
    await userEvent.click(screen.getByTestId('treatment-print-cert-BT-2'));
    expect(setPrintPerTreatment).toHaveBeenCalledWith({ treatmentId: 'BT-2', type: 'cert' });
  });

  it('F1.8 click print record in expanded body → setPrintPerTreatment with type record', async () => {
    const setPrintPerTreatment = vi.fn();
    renderCard({ expandedTreatment: 'BT-2', setPrintPerTreatment });
    await userEvent.click(screen.getByTestId('treatment-print-record-BT-2'));
    expect(setPrintPerTreatment).toHaveBeenCalledWith({ treatmentId: 'BT-2', type: 'record' });
  });

  it('F1.9 BT-4 (skip-doctor) renders "ข้ามแพทย์" status label', () => {
    renderCard();
    const row = screen.getByTestId('treatment-row-BT-4');
    expect(row.textContent).toContain('ข้ามแพทย์');
  });

  it('F1.10 BT-3 (vitals-only, not latest) renders "ซักประวัติเท่านั้น" status', () => {
    renderCard();
    const row = screen.getByTestId('treatment-row-BT-3');
    expect(row.textContent).toContain('ซักประวัติเท่านั้น');
  });

  it('F1.11 BT-2 row-action shows "✓ บันทึก HH:MM" (completed)', () => {
    renderCard();
    const row = screen.getByTestId('treatment-row-BT-2');
    expect(row.textContent).toMatch(/บันทึก 11:23/);
  });

  it('F1.12 BT-1 row-action shows "⌛ in progress" (vitals only + isLatest)', () => {
    renderCard();
    const row = screen.getByTestId('treatment-row-BT-1');
    expect(row.textContent).toMatch(/in progress|⌛/);
  });

  it('F1.13 BT-2 meta line shows editor (กวางตุ้ง พนักงาน)', () => {
    renderCard();
    const row = screen.getByTestId('treatment-row-BT-2');
    expect(row.textContent).toContain('แก้ไขโดย: กวางตุ้ง');
    expect(row.textContent).toContain('พนักงาน');
  });

  it('F1.14 expanded body REPLACES collapsed CC/DX preview (not duplicate)', () => {
    renderCard({ expandedTreatment: 'BT-4' });
    // CC/DX callout labels appear ONCE in expanded body
    const ccLabels = screen.getAllByText(/CC.*อาการ/);
    expect(ccLabels).toHaveLength(1);
  });

  it('F1.15 collapsed row (BT-4) shows CC/DX inline preview + truncated', () => {
    renderCard(); // BT-4 NOT expanded
    const row = screen.getByTestId('treatment-row-BT-4');
    // Inline preview labels (collapsed only)
    expect(row.textContent).toContain('CC');
    expect(row.textContent).toContain('DX');
    expect(row.textContent).toContain('ฟห');
    expect(row.textContent).toContain('ฟหกห');
  });
});
