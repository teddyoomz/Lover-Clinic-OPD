// tests/phase16.2-clinic-report-csv.test.js
import { describe, it, expect } from 'vitest';
import { toCsv } from '../src/lib/clinicReportCsv.js';

describe('CSV1 toCsv', () => {
  const minimalSnapshot = {
    tiles: { revenueYtd: 28000, momGrowth: 12, newCustomersPerMonth: 3.5,
             retentionRate: 66.67, avgTicket: 7000, courseUtilization: 47,
             noShowRate: 8, expenseRatio: 14.28 },
    charts: {
      revenueTrend: [{ label: '2026-04', value: 12000 }, { label: '2026-03', value: 8000 }],
      newCustomersTrend: [{ label: '2026-04', value: 5 }],
      cashFlow: [{ label: '2026-04', value: 3000 }],
      retentionCohort: { rows: [{ cohort: '2025-11', cohortSize: 2, cells: [100, 50] }], overallRate: 50 },
      branchComparison: { rows: [{ branchId: 'BR-A', branchName: 'ชลบุรี', revenue: 15000, saleCount: 2 }] },
      apptFillRate: 80,
    },
    tables: {
      topServices: [{ name: 'ดริปผิวใส', revenue: 2400000, count: 142 }],
      topDoctors: [{ staffName: 'Dr.A', total: 3100000 }],
      topProducts: [{ name: 'BA Vitamin', value: 800000, qty: 100 }],
    },
    meta: {
      generatedAt: '2026-04-29T12:00:00.000Z',
      filterApplied: { from: '2025-11-01', to: '2026-04-30' },
      branchScope: 'all',
      partialErrors: null,
    },
  };

  it('CSV1.1 — output starts with UTF-8 BOM', () => {
    const csv = toCsv(minimalSnapshot);
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
  });

  it('CSV1.2 — has header row with date range', () => {
    const csv = toCsv(minimalSnapshot);
    expect(csv).toMatch(/Clinic Report.*2025-11-01.*2026-04-30/);
  });

  it('CSV1.3 — Thai characters preserved (not garbled)', () => {
    const csv = toCsv(minimalSnapshot);
    expect(csv).toContain('ดริปผิวใส');
    expect(csv).toContain('ชลบุรี');
  });

  it('CSV1.4 — sections labeled with widget IDs', () => {
    const csv = toCsv(minimalSnapshot);
    expect(csv).toMatch(/W1.*Revenue trend/);
    expect(csv).toMatch(/W4.*Top.*services/);
    expect(csv).toMatch(/W7.*Branch comparison/);
  });

  it('CSV1.5 — values comma-escaped (no broken rows)', () => {
    const snap = JSON.parse(JSON.stringify(minimalSnapshot));
    snap.tables.topServices[0].name = 'Service, with comma';
    const csv = toCsv(snap);
    expect(csv).toContain('"Service, with comma"');
  });

  it('CSV1.6 — empty arrays render as empty section (no crash)', () => {
    const empty = JSON.parse(JSON.stringify(minimalSnapshot));
    empty.tables.topServices = [];
    expect(() => toCsv(empty)).not.toThrow();
  });

  it('CSV1.7 — KPI tiles section first', () => {
    const csv = toCsv(minimalSnapshot);
    const tilesIdx = csv.indexOf('KPI Tiles');
    const w1Idx = csv.indexOf('W1');
    expect(tilesIdx).toBeGreaterThan(0);
    expect(tilesIdx).toBeLessThan(w1Idx);
  });

  it('CSV1.8 — meta section includes generatedAt + branchScope', () => {
    const csv = toCsv(minimalSnapshot);
    expect(csv).toContain('2026-04-29T12:00:00');
    expect(csv).toMatch(/branchScope.*all/i);
  });

  it('CSV1.9 — internal double-quotes are doubled (RFC 4180)', () => {
    const snap = JSON.parse(JSON.stringify(minimalSnapshot));
    snap.tables.topServices[0].name = 'Service "VIP"';
    const csv = toCsv(snap);
    // RFC 4180: internal " becomes "" inside a quoted field
    expect(csv).toContain('"Service ""VIP"""');
  });
});
