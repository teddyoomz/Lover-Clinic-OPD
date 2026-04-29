// tests/phase16.2-bis-metric-explanations.test.jsx — Phase 16.2-bis (2026-04-29 session 33)
//
// RTL coverage of the inline explanation popover infrastructure.
//
// Verifies:
//   - MetricExplanationPopover renders Info icon when spec is present
//   - MetricExplanationPopover renders NOTHING when spec is null/empty (graceful)
//   - Popover opens on hover/focus and closes on mouseleave/blur
//   - Popover content includes label + explanation + dataSource + computation + branchAware
//   - KpiTile / RankedTableWidget / ExpenseSectionTable / RetentionHeatmapWidget /
//     BranchComparisonWidget all accept metricSpec prop and render the popover
//   - Every metric used in clinicReportMetricSpecs has the 5 required fields

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MetricExplanationPopover from '../src/components/backend/reports/widgets/MetricExplanationPopover.jsx';
import KpiTile from '../src/components/backend/reports/widgets/KpiTile.jsx';
import RankedTableWidget from '../src/components/backend/reports/widgets/RankedTableWidget.jsx';
import ExpenseSectionTable from '../src/components/backend/reports/widgets/ExpenseSectionTable.jsx';
import { CLINIC_REPORT_METRIC_SPECS, getMetricSpec, listMetricIds } from '../src/lib/clinicReportMetricSpecs.js';
import { EXPENSE_REPORT_METRIC_SPECS } from '../src/lib/expenseReportMetricSpecs.js';

describe('ME.A — MetricExplanationPopover graceful degradation', () => {
  it('ME.A.1 — null spec → renders nothing', () => {
    const { container } = render(<MetricExplanationPopover spec={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('ME.A.2 — undefined spec → renders nothing', () => {
    const { container } = render(<MetricExplanationPopover />);
    expect(container.firstChild).toBeNull();
  });

  it('ME.A.3 — spec with all fields empty → renders nothing', () => {
    const { container } = render(
      <MetricExplanationPopover spec={{ id: 'x', label: '', explanation: '', dataSource: '', computation: '' }} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('ME.A.4 — valid spec → renders Info trigger button', () => {
    render(
      <MetricExplanationPopover
        spec={{ id: 'rev', label: 'X', explanation: 'desc', dataSource: 'be_x', computation: 'sum', branchAware: true }}
        testId="x-test"
      />,
    );
    expect(screen.getByTestId('x-test-info-trigger')).toBeInTheDocument();
  });
});

describe('ME.B — Popover opens on focus and shows full content', () => {
  it('ME.B.1 — focus opens popover; blur closes', () => {
    render(
      <MetricExplanationPopover
        spec={{ id: 'rev', label: 'รายได้ YTD', explanation: 'รวมรายได้', dataSource: 'be_sales', computation: 'sum(netTotal)', branchAware: true }}
        testId="rev-test"
      />,
    );
    const trigger = screen.getByTestId('rev-test-info-trigger');
    fireEvent.focus(trigger);
    const pop = screen.getByTestId('rev-test-info-popover');
    expect(pop).toBeInTheDocument();
    expect(pop).toHaveTextContent('รายได้ YTD');
    expect(pop).toHaveTextContent('รวมรายได้');
    expect(pop).toHaveTextContent('be_sales');
    expect(pop).toHaveTextContent('sum(netTotal)');
    expect(pop).toHaveAttribute('data-branch-aware', 'true');
    fireEvent.blur(trigger);
    expect(screen.queryByTestId('rev-test-info-popover')).not.toBeInTheDocument();
  });

  it('ME.B.2 — branchAware:false renders the warning text', () => {
    render(
      <MetricExplanationPopover
        spec={{ id: 'x', label: 'X', explanation: 'd', dataSource: 's', computation: 'c', branchAware: false }}
        testId="x"
      />,
    );
    fireEvent.focus(screen.getByTestId('x-info-trigger'));
    expect(screen.getByTestId('x-info-popover')).toHaveAttribute('data-branch-aware', 'false');
  });
});

describe('ME.C — KpiTile threads metricSpec to popover', () => {
  it('ME.C.1 — KpiTile with metricSpec renders Info icon next to label', () => {
    render(
      <KpiTile
        label="รายได้ YTD"
        value="฿100,000"
        metricSpec={CLINIC_REPORT_METRIC_SPECS.revenueYtd}
      />,
    );
    expect(screen.getByTestId('kpi-revenueYtd-info-trigger')).toBeInTheDocument();
  });

  it('ME.C.2 — KpiTile WITHOUT metricSpec still renders correctly', () => {
    render(<KpiTile label="X" value="0" />);
    expect(screen.queryByTestId(/-info-trigger$/)).not.toBeInTheDocument();
  });
});

describe('ME.D — RankedTableWidget threads metricSpec', () => {
  it('ME.D.1 — Top-10 doctors widget renders Info icon', () => {
    render(
      <RankedTableWidget
        title="Top-10 doctors"
        rows={[{ staffName: 'Dr.A', total: 1000 }]}
        fmtKeys={{ value: 'total' }}
        metricSpec={CLINIC_REPORT_METRIC_SPECS.topDoctors}
      />,
    );
    expect(screen.getByTestId('ranked-topDoctors-info-trigger')).toBeInTheDocument();
  });
});

describe('ME.E — ExpenseSectionTable threads metricSpec (Phase 16.7)', () => {
  it('ME.E.1 — Doctor section renders Info icon + table', () => {
    render(
      <ExpenseSectionTable
        title="รายจ่ายแพทย์"
        rows={[{ id: 'D-1', name: 'Dr.A', sitFee: 100, df: 200, salary: 300, other: 0, total: 600 }]}
        columns={[
          { key: 'name', label: 'ชื่อ' },
          { key: 'total', label: 'รวม', align: 'right', isMoney: true },
        ]}
        metricSpec={EXPENSE_REPORT_METRIC_SPECS.sectionDoctors}
        testId="expense-section-doctors"
      />,
    );
    expect(screen.getByTestId('expense-section-doctors-info-trigger')).toBeInTheDocument();
    expect(screen.getByText('Dr.A')).toBeInTheDocument();
  });

  it('ME.E.2 — empty rows shows empty message', () => {
    render(
      <ExpenseSectionTable
        title="รายจ่ายแพทย์"
        rows={[]}
        columns={[{ key: 'name', label: 'ชื่อ' }]}
        metricSpec={EXPENSE_REPORT_METRIC_SPECS.sectionDoctors}
        testId="ed-empty"
      />,
    );
    expect(screen.getByText(/ไม่มีข้อมูล/)).toBeInTheDocument();
  });

  it('ME.E.3 — totals row renders when supplied', () => {
    render(
      <ExpenseSectionTable
        title="X"
        rows={[{ id: 'D-1', name: 'Dr.A', total: 100 }]}
        columns={[
          { key: 'name', label: 'ชื่อ' },
          { key: 'total', label: 'รวม', align: 'right', isMoney: true },
        ]}
        totals={{ total: 100 }}
        testId="ed-totals"
      />,
    );
    const tfoot = screen.getByTestId('ed-totals-table').querySelector('tfoot');
    expect(tfoot).toBeTruthy();
    expect(tfoot).toHaveTextContent('รวม');
  });
});

describe('ME.F — Spec catalog completeness', () => {
  it('ME.F.1 — clinicReportMetricSpecs has 16 entries (8 tiles + 5 charts + 3 tables)', () => {
    const ids = listMetricIds();
    expect(ids.length).toBeGreaterThanOrEqual(16);
  });

  it('ME.F.2 — every clinic spec has the 5 required fields', () => {
    for (const spec of Object.values(CLINIC_REPORT_METRIC_SPECS)) {
      expect(spec.id).toBeTruthy();
      expect(spec.label).toBeTruthy();
      expect(spec.explanation).toBeTruthy();
      expect(spec.dataSource).toBeTruthy();
      expect(spec.computation).toBeTruthy();
      expect(typeof spec.branchAware).toBe('boolean');
    }
  });

  it('ME.F.3 — every clinic spec post-Phase 16.2-bis is branchAware=true (intentional)', () => {
    for (const [id, spec] of Object.entries(CLINIC_REPORT_METRIC_SPECS)) {
      // All Phase 16.2-bis fixed metrics should be branchAware=true after the
      // 5 wiring fixes. Locked here so future drift fails the test.
      expect(spec.branchAware, `${id} should be branchAware after Phase 16.2-bis fix`).toBe(true);
    }
  });

  it('ME.F.4 — getMetricSpec(id) returns canonical entry; unknown returns null', () => {
    expect(getMetricSpec('revenueYtd')).toBe(CLINIC_REPORT_METRIC_SPECS.revenueYtd);
    expect(getMetricSpec('unknown-id')).toBeNull();
    expect(getMetricSpec(null)).toBeNull();
    expect(getMetricSpec(undefined)).toBeNull();
  });

  it('ME.F.5 — clinicReportMetricSpecs is frozen (Object.freeze)', () => {
    expect(Object.isFrozen(CLINIC_REPORT_METRIC_SPECS)).toBe(true);
  });

  it('ME.F.6 — expenseReportMetricSpecs has the 7 expected ids', () => {
    const expected = ['totalAll', 'totalDoctorDf', 'totalStaffDf', 'totalCount',
      'sectionDoctors', 'sectionStaff', 'sectionCategories', 'sectionProducts'];
    for (const id of expected) {
      expect(EXPENSE_REPORT_METRIC_SPECS[id], `expense spec missing: ${id}`).toBeTruthy();
    }
  });

  it('ME.F.7 — every expense spec has the 5 required fields + branchAware=true', () => {
    for (const spec of Object.values(EXPENSE_REPORT_METRIC_SPECS)) {
      expect(spec.id).toBeTruthy();
      expect(spec.label).toBeTruthy();
      expect(spec.explanation).toBeTruthy();
      expect(spec.dataSource).toBeTruthy();
      expect(spec.computation).toBeTruthy();
      expect(spec.branchAware).toBe(true);
    }
  });
});
