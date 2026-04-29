// tests/phase16.7-expense-report-tab.test.jsx — Phase 16.7 (2026-04-29 session 33)
//
// RTL coverage of ExpenseReportTab — 4 sections rendered, sidebar filters,
// permission gate, drilldown.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../src/lib/expenseReportAggregator.js', () => ({
  expenseReportAggregator: vi.fn(),
}));
vi.mock('../src/lib/BranchContext.jsx', () => ({
  useSelectedBranch: () => ({ branches: [{ id: 'BR-A', name: 'พระราม 9' }], branchId: 'BR-A' }),
  resolveBranchName: (id) => id,
}));
// V11 mock-shadowed-reality lock: useTabAccess returns canAccess (NOT canAccessTab)
vi.mock('../src/hooks/useTabAccess.js', () => ({
  useTabAccess: () => ({ canAccess: () => true, isAdmin: true }),
  useHasPermission: () => () => true,
}));

import { expenseReportAggregator } from '../src/lib/expenseReportAggregator.js';
import ExpenseReportTab from '../src/components/backend/reports/ExpenseReportTab.jsx';

const SNAPSHOT = {
  summary: {
    totalDoctor: 31500,
    totalDoctorSit: 500, totalDoctorDf: 1000, totalDoctorSalary: 30000, totalDoctorOther: 0,
    totalStaff: 25500, totalStaffDf: 500, totalStaffSalary: 25000, totalStaffOther: 0,
    totalCategory: 57000, totalAll: 57000,
    totalDoctorCount: 1, totalStaffCount: 2, totalCategoryCount: 3,
  },
  sections: {
    doctors: [
      { id: 'D-1', name: 'หมอ ก', position: 'แพทย์', sitFee: 500, df: 1000, salary: 30000, other: 0, total: 31500 },
    ],
    staff: [
      { id: 'S-1', name: 'พนักงาน A', position: 'รีเซฟชั่น', df: 500, salary: 25000, other: 0, total: 25500 },
      { id: 'A-1', name: 'ผู้ช่วย A', position: 'ผู้ช่วยแพทย์', df: 500, salary: 0, other: 0, total: 500 },
    ],
    categories: [
      { categoryName: 'เงินเดือน', count: 2, total: 55000 },
      { categoryName: 'ค่านั่งแพทย์', count: 1, total: 500 },
      { categoryName: 'Lab', count: 1, total: 1500 },
    ],
    products: [],
  },
  meta: {
    generatedAt: '2026-04-29T12:00:00.000Z',
    filterApplied: { from: '2026-04-01', to: '2026-04-30' },
    branchScope: 'all',
    partialErrors: null,
    sourceCounts: { expenses: 4, categories: 3, doctors: 1, staff: 1, sales: 2, treatments: 2, dfRows: 2 },
  },
};

describe('ER.A — ExpenseReportTab top-level rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    expenseReportAggregator.mockResolvedValue(SNAPSHOT);
  });

  it('ER.A.1 — renders sidebar + 4 KPI tiles after load', async () => {
    render(<ExpenseReportTab />);
    expect(screen.getByTestId('expense-report-sidebar')).toBeInTheDocument();
    await waitFor(() => expect(expenseReportAggregator).toHaveBeenCalled());
    await waitFor(() => expect(screen.getAllByText(/57,000/).length).toBeGreaterThan(0));
  });

  it('ER.A.2 — renders all 3 visible sections (doctors / staff / categories)', async () => {
    render(<ExpenseReportTab />);
    await waitFor(() => screen.getByTestId('expense-section-doctors'));
    expect(screen.getByTestId('expense-section-doctors')).toBeInTheDocument();
    expect(screen.getByTestId('expense-section-staff')).toBeInTheDocument();
    expect(screen.getByTestId('expense-section-categories')).toBeInTheDocument();
    expect(screen.getByTestId('expense-section-products-placeholder')).toBeInTheDocument();
  });

  it('ER.A.3 — doctor row shows the test data', async () => {
    render(<ExpenseReportTab />);
    await waitFor(() => screen.getByText('หมอ ก'));
    expect(screen.getByText('หมอ ก')).toBeInTheDocument();
  });

  it('ER.A.4 — staff section shows assistant + receptionist', async () => {
    render(<ExpenseReportTab />);
    await waitFor(() => screen.getByText('ผู้ช่วย A'));
    expect(screen.getByText('ผู้ช่วย A')).toBeInTheDocument();
    expect(screen.getByText('พนักงาน A')).toBeInTheDocument();
  });
});

describe('ER.B — Filter rail interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    expenseReportAggregator.mockResolvedValue(SNAPSHOT);
  });

  it('ER.B.1 — preset switch triggers refetch', async () => {
    render(<ExpenseReportTab />);
    await waitFor(() => expect(expenseReportAggregator).toHaveBeenCalledTimes(1));
    const ytdBtn = screen.getByText('YTD').closest('button');
    fireEvent.click(ytdBtn);
    await waitFor(() => expect(expenseReportAggregator).toHaveBeenCalledTimes(2));
  });

  it('ER.B.2 — refresh button invalidates cache + refetches', async () => {
    render(<ExpenseReportTab />);
    await waitFor(() => expect(expenseReportAggregator).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTestId('expense-report-refresh'));
    await waitFor(() => expect(expenseReportAggregator).toHaveBeenCalledTimes(2));
  });

  it('ER.B.3 — branch toggle changes filter (refetch fires)', async () => {
    render(<ExpenseReportTab />);
    await waitFor(() => expect(expenseReportAggregator).toHaveBeenCalledTimes(1));
    const cb = screen.getByLabelText('พระราม 9');
    fireEvent.click(cb);
    await waitFor(() => expect(expenseReportAggregator).toHaveBeenCalledTimes(2));
  });
});

describe('ER.C — Permission gate', () => {
  it('ER.C.1 — no permission → renders no-access placeholder', async () => {
    vi.resetModules();
    vi.doMock('../src/hooks/useTabAccess.js', () => ({
      useTabAccess: () => ({ canAccess: () => false, isAdmin: false }),
      useHasPermission: () => () => false,
    }));
    const { default: GatedTab } = await import('../src/components/backend/reports/ExpenseReportTab.jsx');
    render(<GatedTab />);
    expect(screen.getByTestId('expense-report-no-access')).toBeInTheDocument();
    expect(screen.getByText(/ไม่มีสิทธิ์/)).toBeInTheDocument();
    vi.doUnmock('../src/hooks/useTabAccess.js');
  });
});

describe('ER.D — V32 + iron-clad source-grep guards', () => {
  it('ER.D.1 — uses html2canvas + jspdf direct (NOT html2pdf.js)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/components/backend/reports/ExpenseReportTab.jsx', 'utf-8');
    expect(src).toMatch(/import\(['"]html2canvas['"]\)/);
    expect(src).toMatch(/import\(['"]jspdf['"]\)/);
    expect(src).not.toMatch(/html2pdf/);
  });

  it('ER.D.2 — Rule E: no brokerClient import', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/components/backend/reports/ExpenseReportTab.jsx', 'utf-8');
    expect(src).not.toMatch(/brokerClient/);
  });

  it('ER.D.3 — Rule E: no /api/proclinic/* fetch', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/components/backend/reports/ExpenseReportTab.jsx', 'utf-8');
    expect(src).not.toMatch(/\/api\/proclinic\//);
  });

  it('ER.D.4 — Rule H-quater: no master_data reads in feature code', async () => {
    const { readFileSync } = await import('node:fs');
    const tab = readFileSync('src/components/backend/reports/ExpenseReportTab.jsx', 'utf-8');
    const agg = readFileSync('src/lib/expenseReportAggregator.js', 'utf-8');
    const helpers = readFileSync('src/lib/expenseReportHelpers.js', 'utf-8');
    expect(tab).not.toMatch(/master_data/);
    expect(agg).not.toMatch(/master_data/);
    expect(helpers).not.toMatch(/master_data/);
  });

  it('ER.D.5 — Hook + tab + aggregator + helpers wired', async () => {
    const { readFileSync } = await import('node:fs');
    const tab = readFileSync('src/components/backend/reports/ExpenseReportTab.jsx', 'utf-8');
    expect(tab).toMatch(/useExpenseReport/);
    expect(tab).toMatch(/EXPENSE_REPORT_METRIC_SPECS/);
    expect(tab).toMatch(/ExpenseSectionTable/);
  });
});

describe('ER.E — Permission key + tab gate registry', () => {
  it('ER.E.1 — TAB_PERMISSION_MAP has expense-report gated by report_expense', async () => {
    const { TAB_PERMISSION_MAP } = await import('../src/lib/tabPermissions.js');
    expect(TAB_PERMISSION_MAP['expense-report']).toEqual({ requires: ['report_expense'] });
  });

  it('ER.E.2 — report_expense exists in ALL_PERMISSION_KEYS (already shipped)', async () => {
    const { ALL_PERMISSION_KEYS } = await import('../src/lib/permissionGroupValidation.js');
    expect(ALL_PERMISSION_KEYS).toContain('report_expense');
  });

  it('ER.E.3 — navConfig has expense-report under reports section', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/components/backend/nav/navConfig.js', 'utf-8');
    expect(src).toMatch(/'expense-report'.*รายจ่ายทั้งหมด/);
  });

  it('ER.E.4 — BackendDashboard lazy-imports + renders ExpenseReportTab', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/pages/BackendDashboard.jsx', 'utf-8');
    expect(src).toMatch(/const ExpenseReportTab\s*=\s*lazy/);
    expect(src).toMatch(/activeTab === 'expense-report'/);
  });
});
