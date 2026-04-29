// tests/phase16.2-clinic-report-tab.test.jsx — Phase 16.2 Task 11
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../src/lib/clinicReportAggregator.js', () => ({
  clinicReportAggregator: vi.fn(),
}));
vi.mock('../src/lib/BranchContext.jsx', () => ({
  useSelectedBranch: () => ({ branches: [{ id: 'BR-A', name: 'ชลบุรี' }], branchId: 'BR-A' }),
  resolveBranchName: (id) => id,
}));
// V11 mock-shadowed-reality fix (2026-04-29): real useTabAccess returns
// `canAccess` not `canAccessTab`. The original mock locked in the wrong name
// → tests passed but production crashed with TypeError on tab open.
vi.mock('../src/hooks/useTabAccess.js', () => ({
  useTabAccess: () => ({ canAccess: () => true, isAdmin: true }),
  useHasPermission: () => () => true,
}));

import { clinicReportAggregator } from '../src/lib/clinicReportAggregator.js';
import ClinicReportTab from '../src/components/backend/reports/ClinicReportTab.jsx';

const SNAPSHOT = {
  tiles: { revenueYtd: 28000, momGrowth: 12, newCustomersPerMonth: 3.5, retentionRate: 66, avgTicket: 7000, courseUtilization: 47, noShowRate: 8, expenseRatio: 14 },
  charts: {
    revenueTrend: [{ label: '2026-04', value: 28000 }],
    newCustomersTrend: [],
    retentionCohort: { rows: [{ cohort: '2025-11', cohortSize: 2, cells: [100, 50] }], overallRate: 50 },
    branchComparison: { rows: [{ branchId: 'BR-A', branchName: 'ชลบุรี', revenue: 28000, saleCount: 4 }] },
    cashFlow: [],
    apptFillRate: 80,
  },
  tables: {
    topServices: [{ name: 'ดริปผิวใส', revenue: 2400000, count: 142 }],
    topDoctors: [{ staffName: 'Dr.A', total: 3100000 }],
    topProducts: [{ name: 'BA Vitamin', value: 800000, qty: 100 }],
  },
  meta: { generatedAt: '2026-04-29T12:00:00.000Z', branchScope: 'all', partialErrors: null, filterApplied: { from: '2025-11-01', to: '2026-04-30' } },
};

describe('T1 ClinicReportTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clinicReportAggregator.mockResolvedValue(SNAPSHOT);
  });

  it('T1.1 — renders sidebar + KPI tiles after load', async () => {
    const onNavigate = vi.fn();
    render(<ClinicReportTab onNavigate={onNavigate} />);
    expect(screen.getByTestId('clinic-report-sidebar')).toBeInTheDocument();
    await waitFor(() => expect(clinicReportAggregator).toHaveBeenCalled());
    // Wait for snapshot to render — KPI tile with revenueYtd (multiple elements may show same value)
    await waitFor(() => expect(screen.getAllByText(/28,000/).length).toBeGreaterThan(0));
  });

  it('T1.2 — drilldown click fires onNavigate with correct tabId', async () => {
    const onNavigate = vi.fn();
    render(<ClinicReportTab onNavigate={onNavigate} />);
    await waitFor(() => screen.getByText('ดริปผิวใส'));
    const drilldownBtn = screen.getAllByText(/ดูทั้งหมด/i)[0].closest('button');
    fireEvent.click(drilldownBtn);
    const calledTabId = onNavigate.mock.calls[0][0];
    // expect a known reports-* tabId (sale or stock or staff)
    expect(['reports-sale', 'reports-staff-sales', 'reports-stock']).toContain(calledTabId);
  });

  it('T1.3 — empty data state shows "ไม่มีข้อมูลในช่วงเวลานี้" placeholders', async () => {
    clinicReportAggregator.mockResolvedValueOnce({
      tiles: { revenueYtd: 0, momGrowth: null, newCustomersPerMonth: 0, retentionRate: 0, avgTicket: 0, courseUtilization: 0, noShowRate: 0, expenseRatio: 0 },
      charts: { revenueTrend: [], newCustomersTrend: [], retentionCohort: { rows: [], overallRate: 0 }, branchComparison: { rows: [] }, cashFlow: [], apptFillRate: 0 },
      tables: { topServices: [], topDoctors: [], topProducts: [] },
      meta: { generatedAt: '2026-04-29T12:00:00.000Z', branchScope: 'all', partialErrors: null, filterApplied: {} },
    });
    render(<ClinicReportTab onNavigate={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByText(/ไม่มีข้อมูลในช่วงเวลานี้/).length).toBeGreaterThan(0));
  });
});

import { existsSync, readFileSync } from 'node:fs';

describe('T2 nav wiring', () => {
  it('T2.1 — navConfig has clinic-report entry in reports section', () => {
    const src = readFileSync('src/components/backend/nav/navConfig.js', 'utf8');
    expect(src).toMatch(/id:\s*['"]clinic-report['"]/);
    expect(src).toMatch(/รายงานคลินิก/);
  });

  it('T2.2 — BackendDashboard has lazy import + render case', () => {
    const src = readFileSync('src/pages/BackendDashboard.jsx', 'utf8');
    expect(src).toMatch(/lazy\(\s*\(\)\s*=>\s*import\([^)]*ClinicReportTab[^)]*\)/);
    expect(src).toMatch(/activeTab\s*===\s*['"]clinic-report['"]/);
  });
});
