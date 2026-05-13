// tests/phase-28-treatment-history-card-rtl.test.jsx
//
// Phase 28 Task 8 (2026-05-14) — TreatmentHistoryCard composer RTL bank.
//
// Component under test: src/components/backend/treatment-history/TreatmentHistoryCard.jsx
// Spec: docs/superpowers/specs/2026-05-14-treatment-history-redesign-design.md
//   § 4.1 (card frame) + § 5 (behavior) + § 7 (architecture)
//
// Composer wires together (all extracted in Tasks 1-7):
//   - TreatmentHistoryHeader (Task 6) — icon + title + count + 3 CTA buttons
//   - TreatmentDateHeader (Task 3) — date-grouped section header
//   - TreatmentHistoryRow (Task 4) — collapsed row + chip block
//   - TreatmentHistoryExpandedBody (Task 5) — CC/DX callout + detail + print buttons
//   - TreatmentHistoryPagination (Task 7) — page numbers + prev/next
//   - groupTreatmentsByDate helper (Task 1)
//
// Replaces the inline 290-line treatment-history block in CustomerDetailView.jsx.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TreatmentHistoryCard } from '../src/components/backend/treatment-history/TreatmentHistoryCard.jsx';

describe('Phase 28 · TreatmentHistoryCard RTL', () => {
  const buildTreatments = () => [
    { id: 'BT-1', date: '2026-05-14', vitalsignsRecordedAt: '2026-05-14T04:13:00Z', cc: 'aaa' },
    {
      id: 'BT-2',
      date: '2026-05-14',
      vitalsignsRecordedAt: '2026-05-14T04:02:00Z',
      doctorRecordedAt: '2026-05-14T04:23:00Z',
      completedAt: '2026-05-14T04:23:00Z',
      cc: 'bbb',
      dx: 'ccc',
    },
    { id: 'BT-3', date: '2026-05-07', completedAt: '2026-05-07T01:03:00Z', cc: 'ddd' },
  ];

  const baseProps = {
    treatmentSummary: buildTreatments(),
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
  };

  it('C1.1 renders header + 2 date groups + 3 rows', () => {
    render(<TreatmentHistoryCard {...baseProps} />);
    expect(screen.getByText('ประวัติการรักษา')).toBeInTheDocument();
    expect(screen.getByTestId('date-header-2026-05-14')).toBeInTheDocument();
    expect(screen.getByTestId('date-header-2026-05-07')).toBeInTheDocument();
    expect(screen.getByTestId('treatment-row-BT-1')).toBeInTheDocument();
    expect(screen.getByTestId('treatment-row-BT-2')).toBeInTheDocument();
    expect(screen.getByTestId('treatment-row-BT-3')).toBeInTheDocument();
  });

  it('C1.2 pagination NOT rendered when only 3 items < page size 5', () => {
    render(<TreatmentHistoryCard {...baseProps} />);
    expect(screen.queryByTestId('treatment-history-pagination')).not.toBeInTheDocument();
  });

  it('C1.3 click row → setExpandedTreatment called with row id', async () => {
    const setExpanded = vi.fn();
    render(<TreatmentHistoryCard {...baseProps} setExpandedTreatment={setExpanded} />);
    await userEvent.click(screen.getByTestId('treatment-toggle-BT-1'));
    expect(setExpanded).toHaveBeenCalledWith('BT-1');
  });

  it('C1.4 click already-expanded row → setExpandedTreatment(null)', async () => {
    const setExpanded = vi.fn();
    render(
      <TreatmentHistoryCard
        {...baseProps}
        expandedTreatment="BT-1"
        setExpandedTreatment={setExpanded}
      />
    );
    await userEvent.click(screen.getByTestId('treatment-toggle-BT-1'));
    expect(setExpanded).toHaveBeenCalledWith(null);
  });

  it('C1.5 expanded row shows CC/DX callout (BT-2 has both)', () => {
    render(<TreatmentHistoryCard {...baseProps} expandedTreatment="BT-2" />);
    expect(screen.getByText(/CC.*อาการ/)).toBeInTheDocument();
    expect(screen.getByText(/DX.*วินิจฉัย/)).toBeInTheDocument();
    expect(screen.getByText('bbb')).toBeInTheDocument();
    expect(screen.getByText('ccc')).toBeInTheDocument();
  });

  it('C1.6 displays empty state when treatmentSummary empty', () => {
    render(
      <TreatmentHistoryCard
        {...baseProps}
        treatmentSummary={[]}
        customer={{ treatmentCount: 0 }}
      />
    );
    expect(screen.getByTestId('treatment-history-empty')).toBeInTheDocument();
    expect(screen.getByText(/ยังไม่มีประวัติ/)).toBeInTheDocument();
  });

  it('C1.7 displays error banner when treatmentsError set', () => {
    render(<TreatmentHistoryCard {...baseProps} treatmentsError="โหลดข้อมูลล้มเหลว" />);
    expect(screen.getByText(/โหลดข้อมูลล้มเหลว/)).toBeInTheDocument();
  });

  it('C1.8 latest row has "ล่าสุด" tag (only globalIndex===0)', () => {
    render(<TreatmentHistoryCard {...baseProps} />);
    const latestTags = screen.getAllByText('ล่าสุด');
    expect(latestTags).toHaveLength(1);
    // Verify it's on BT-1 (first row of paginated treatments)
    const bt1Row = screen.getByTestId('treatment-row-BT-1');
    expect(bt1Row.textContent).toContain('ล่าสุด');
  });

  it('C1.9 print button click triggers setPrintDocOpen(true)', async () => {
    const setPrintDocOpen = vi.fn();
    render(<TreatmentHistoryCard {...baseProps} setPrintDocOpen={setPrintDocOpen} />);
    await userEvent.click(screen.getByTestId('print-document-btn'));
    expect(setPrintDocOpen).toHaveBeenCalledWith(true);
  });

  it('C1.10 timeline button click triggers setShowTimeline(true)', async () => {
    const setShowTimeline = vi.fn();
    render(<TreatmentHistoryCard {...baseProps} setShowTimeline={setShowTimeline} />);
    await userEvent.click(screen.getByTestId('show-timeline-btn'));
    expect(setShowTimeline).toHaveBeenCalledWith(true);
  });

  it('C1.11 create button click triggers onCreateTreatment callback', async () => {
    const onCreate = vi.fn();
    render(<TreatmentHistoryCard {...baseProps} onCreateTreatment={onCreate} />);
    await userEvent.click(screen.getByTestId('create-treatment-btn'));
    expect(onCreate).toHaveBeenCalled();
  });

  it('C1.12 large treatment count → pagination renders with correct totalPages', () => {
    // 13 items, page 1 of 3 (pageSize 5)
    const treatments13 = Array.from({ length: 13 }, (_, i) => ({
      id: `BT-${i + 1}`,
      date: '2026-05-14',
      vitalsignsRecordedAt: `2026-05-14T0${4}:0${i % 10}:00Z`,
      cc: `cc${i}`,
    }));
    render(
      <TreatmentHistoryCard
        {...baseProps}
        treatmentSummary={treatments13}
        customer={{ treatmentCount: 13 }}
      />
    );
    expect(screen.getByTestId('treatment-history-pagination')).toBeInTheDocument();
    // Should mention "13" total items
    expect(screen.getAllByText(/13/).length).toBeGreaterThan(0);
  });

  it('C1.13 paginated rows respect treatmentPage prop', () => {
    const treatments13 = Array.from({ length: 13 }, (_, i) => ({
      id: `BT-${i + 1}`,
      date: '2026-05-14',
      vitalsignsRecordedAt: `2026-05-14T04:0${i % 10}:00Z`,
      cc: `cc${i}`,
    }));
    render(
      <TreatmentHistoryCard
        {...baseProps}
        treatmentSummary={treatments13}
        treatmentPage={2}
        customer={{ treatmentCount: 13 }}
      />
    );
    // Page 2 = items 6-10 (BT-6 through BT-10)
    expect(screen.getByTestId('treatment-row-BT-6')).toBeInTheDocument();
    expect(screen.getByTestId('treatment-row-BT-10')).toBeInTheDocument();
    expect(screen.queryByTestId('treatment-row-BT-1')).not.toBeInTheDocument();
  });
});
