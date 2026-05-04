// tests/phase16.7-bis-followups.test.jsx — Phase 16.7-bis (2026-04-29 session 33)
//
// Source-grep + RTL coverage for the 2 user follow-ups after Phase 16.7 ship:
//   1. Seller pickers across backend forms include doctors+assistants
//      (verified for QuotationFormModal — main violation per audit)
//   2. DfPayoutReportTab extended with 4 expense columns + assistant section
//      (mirror Phase 16.7 ExpenseReportTab Doctor section pattern)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';

describe('FQ.A — QuotationFormModal seller picker uses listAllSellers (Phase 16.7-bis)', () => {
  const src = readFileSync('src/components/backend/QuotationFormModal.jsx', 'utf-8');

  it('FQ.A.1 — imports listAllSellers (NOT listStaff)', () => {
    expect(src).toMatch(/listAllSellers/);
    // listStaff might appear in comments/legacy — check it's NOT in the import
    const importLine = src.split('\n').find(l => l.includes("from '../../lib/backendClient.js'") || l.includes('saveQuotation'));
    expect(importLine || '').toMatch(/listAllSellers/);
    expect(importLine || '').not.toMatch(/listStaff[^A]/); // not 'listStaff' (allow listStaffByBranch / listAllSellers)
  });

  it('FQ.A.2 — Promise.all loads listAllSellers (Phase BS: with branchId opt)', () => {
    // Phase BS (2026-05-06) — listAllSellers now accepts {branchId} for
    // per-branch staff filtering. Pre-Phase-BS the call was no-arg; now
    // it's `listAllSellers({ branchId: selectedBranchId })`. Match either
    // shape so this regression guard accepts the Phase BS upgrade.
    expect(src).toMatch(/listAllSellers\(\s*(\{[^}]*branchId[^}]*\}|)\s*\)/);
  });

  it('FQ.A.3 — V11 lock: source still imports listAllSellers (do not regress to listStaff)', () => {
    expect(src).not.toMatch(/listStaff\(\)\.catch/);
  });
});

describe('FD.A — DfPayoutReportTab extension (Phase 16.7-bis)', () => {
  const src = readFileSync('src/components/backend/reports/DfPayoutReportTab.jsx', 'utf-8');

  it('FD.A.1 — imports buildExpenseDoctorRows + buildExpenseStaffRows', () => {
    expect(src).toMatch(/buildExpenseDoctorRows/);
    expect(src).toMatch(/buildExpenseStaffRows/);
  });

  it('FD.A.2 — imports loadExpensesByDateRange', () => {
    expect(src).toMatch(/loadExpensesByDateRange/);
  });

  it('FD.A.3 — DOCTOR_COLUMNS includes 7 expense columns', () => {
    expect(src).toMatch(/DOCTOR_COLUMNS/);
    expect(src).toMatch(/key:\s*'sitFee'/);
    expect(src).toMatch(/key:\s*'df'/);
    expect(src).toMatch(/key:\s*'salary'/);
    expect(src).toMatch(/key:\s*'other'/);
    expect(src).toMatch(/key:\s*'total'/);
    expect(src).toMatch(/ค่านั่ง/);
    expect(src).toMatch(/เงินเดือน/);
    expect(src).toMatch(/รายจ่ายอื่นๆ/);
  });

  it('FD.A.4 — ASSISTANT_COLUMNS exists (separate section)', () => {
    expect(src).toMatch(/ASSISTANT_COLUMNS/);
  });

  it('FD.A.5 — Phase 16.7-bis comment marker present (institutional memory)', () => {
    expect(src).toMatch(/Phase 16\.7-bis/);
  });

  it('FD.A.6 — uses computeExpenseSummary for footer totals', () => {
    expect(src).toMatch(/computeExpenseSummary/);
  });
});

// RTL coverage for DfPayoutReportTab extension
vi.mock('../src/lib/dfPayoutAggregator.js', () => ({
  computeDfPayoutReport: () => ({
    rows: [
      { doctorId: 'D-1', doctorName: 'หมอ ก', totalDf: 1000, lineCount: 1, saleCount: 1 },
    ],
    summary: { total: 1000, doctorCount: 1, lineCount: 1, saleCount: 1 },
  }),
}));
vi.mock('../src/lib/reportsLoaders.js', () => ({
  loadSalesByDateRange:      vi.fn().mockResolvedValue([]),
  loadTreatmentsByDateRange: vi.fn().mockResolvedValue([]),
  loadExpensesByDateRange:   vi.fn().mockResolvedValue([
    { id: 'e1', date: '2026-04-15', amount: 500, branchId: 'BR-A', status: 'active', categoryName: 'ค่านั่งแพทย์', userId: 'D-1' },
    { id: 'e2', date: '2026-04-15', amount: 25000, branchId: 'BR-A', status: 'active', categoryName: 'เงินเดือน', userId: 'D-1' },
    { id: 'e3', date: '2026-04-15', amount: 1500, branchId: 'BR-A', status: 'active', categoryName: 'ค่ามือ', userId: 'A-1' },
  ]),
}));
vi.mock('../src/lib/backendClient.js', () => ({
  listDoctors: vi.fn().mockResolvedValue([
    { id: 'D-1', name: 'หมอ ก', position: 'แพทย์' },
    { id: 'A-1', name: 'ผู้ช่วย ก', position: 'ผู้ช่วยแพทย์' },
  ]),
  listStaff:        vi.fn().mockResolvedValue([]),
  listDfGroups:     vi.fn().mockResolvedValue([]),
  listDfStaffRates: vi.fn().mockResolvedValue([]),
  // Phase 16.7-ter — be_courses for percent-rate price lookup on unlinked treatments
  listCourses:      vi.fn().mockResolvedValue([]),
  // Phase 16.7-quinquies — staff schedules for hourly-pay computation
  listStaffSchedules: vi.fn().mockResolvedValue([]),
}));
vi.mock('../src/lib/csvExport.js', () => ({ downloadCSV: vi.fn() }));
vi.mock('../src/components/backend/reports/DateRangePicker.jsx', () => ({
  default: () => null,
  buildPresets: () => [{ id: 'thisMonth', from: '2026-04-01', to: '2026-04-30' }],
}));

import DfPayoutReportTab from '../src/components/backend/reports/DfPayoutReportTab.jsx';

describe('FD.B — DfPayoutReportTab RTL render extension', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('FD.B.1 — renders Doctor section + Assistant section', async () => {
    render(<DfPayoutReportTab />);
    await waitFor(() => screen.getByTestId('df-payout-doctor-section'), { timeout: 3000 });
    expect(screen.getByTestId('df-payout-doctor-section')).toBeInTheDocument();
    expect(screen.getByTestId('df-payout-assistant-section')).toBeInTheDocument();
  });

  it('FD.B.2 — Doctor section table has 7 columns (id+name+sitFee+df+salary+other+total)', async () => {
    render(<DfPayoutReportTab />);
    await waitFor(() => screen.getByTestId('df-payout-doctor-table'), { timeout: 3000 });
    const table = screen.getByTestId('df-payout-doctor-table');
    const ths = table.querySelectorAll('thead th');
    expect(ths.length).toBe(7);
  });

  it('FD.B.3 — Assistant section table has 6 columns (no sitFee for assistants)', async () => {
    render(<DfPayoutReportTab />);
    await waitFor(() => screen.getByTestId('df-payout-assistant-table'), { timeout: 3000 });
    const table = screen.getByTestId('df-payout-assistant-table');
    const ths = table.querySelectorAll('thead th');
    expect(ths.length).toBe(6);
  });

  it('FD.B.4 — D-1 row shows ค่านั่ง=500 + DF=1000 + salary=25000 + total=26500', async () => {
    render(<DfPayoutReportTab />);
    await waitFor(() => screen.getByTestId('df-payout-doctor-row-D-1'), { timeout: 3000 });
    const row = screen.getByTestId('df-payout-doctor-row-D-1');
    expect(row).toHaveTextContent('หมอ ก');
    // Total=26500 (sitFee 500 + df 1000 + salary 25000 + other 0)
    expect(row).toHaveTextContent(/26[,.]500/);
  });

  it('FD.B.5 — A-1 (assistant) row shows DF=1500 from manual ค่ามือ expense', async () => {
    render(<DfPayoutReportTab />);
    await waitFor(() => screen.getByTestId('df-payout-assistant-row-A-1'), { timeout: 3000 });
    const row = screen.getByTestId('df-payout-assistant-row-A-1');
    expect(row).toHaveTextContent('ผู้ช่วย ก');
    expect(row).toHaveTextContent(/1[,.]500/);
  });
});
