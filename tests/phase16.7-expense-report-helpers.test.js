// tests/phase16.7-expense-report-helpers.test.js — Phase 16.7 (2026-04-29 session 33)
//
// Pure helper coverage for expenseReportHelpers.js — the data layer of the
// new ExpenseReportTab.

import { describe, it, expect } from 'vitest';
import {
  filterExpensesForExpenseReport,
  buildExpenseDoctorRows,
  buildExpenseStaffRows,
  buildExpenseCategoryRows,
  computeExpenseSummary,
  classifyExpenseCategory,
  bucketExpensesByUser,
  fullName,
  EXPENSE_CATEGORY_PATTERNS,
} from '../src/lib/expenseReportHelpers.js';

describe('EH.A — filterExpensesForExpenseReport', () => {
  const expenses = [
    { id: 'e1', date: '2026-04-15', amount: 1000, branchId: 'BR-A', status: 'active' },
    { id: 'e2', date: '2026-04-16', amount: 2000, branchId: 'BR-B', status: 'active' },
    { id: 'e3', date: '2026-04-17', amount: 9999, branchId: 'BR-A', status: 'void' },
    { id: 'e4', date: '2025-12-31', amount: 500,  branchId: 'BR-A', status: 'active' },
  ];

  it('EH.A.1 — date range only', () => {
    const out = filterExpensesForExpenseReport(expenses, { from: '2026-04-01', to: '2026-04-30' });
    expect(out.map(e => e.id).sort()).toEqual(['e1', 'e2']);
  });

  it('EH.A.2 — branchIds restricts', () => {
    const out = filterExpensesForExpenseReport(expenses, { from: '2026-04-01', to: '2026-04-30', branchIds: ['BR-A'] });
    expect(out.map(e => e.id)).toEqual(['e1']);
  });

  it('EH.A.3 — void excluded', () => {
    const out = filterExpensesForExpenseReport(expenses, {});
    expect(out.map(e => e.id)).not.toContain('e3');
  });

  it('EH.A.4 — null input → []', () => {
    expect(filterExpensesForExpenseReport(null, {})).toEqual([]);
  });

  it('EH.A.5 — falls back to expenseDate when date missing', () => {
    const exp = [{ id: 'e1', expenseDate: '2026-04-10', amount: 100, status: 'active' }];
    const out = filterExpensesForExpenseReport(exp, { from: '2026-04-01', to: '2026-04-30' });
    expect(out).toHaveLength(1);
  });
});

describe('EH.B — classifyExpenseCategory', () => {
  it('EH.B.1 — sit fee patterns', () => {
    expect(classifyExpenseCategory('ค่านั่ง')).toBe('sitFee');
    expect(classifyExpenseCategory('ค่านั่งแพทย์')).toBe('sitFee');
  });

  it('EH.B.2 — salary patterns', () => {
    expect(classifyExpenseCategory('เงินเดือน')).toBe('salary');
    expect(classifyExpenseCategory('โบนัส')).toBe('salary');
    expect(classifyExpenseCategory('Bonus')).toBe('salary');
  });

  it('EH.B.3 — DF pattern', () => {
    expect(classifyExpenseCategory('ค่ามือ')).toBe('df');
    expect(classifyExpenseCategory('ค่ามือพนักงาน')).toBe('df');
  });

  it('EH.B.4 — other catches everything else', () => {
    expect(classifyExpenseCategory('Lab')).toBe('other');
    expect(classifyExpenseCategory('ของใช้ในคลินิก')).toBe('other');
    expect(classifyExpenseCategory('')).toBe('other');
    expect(classifyExpenseCategory(null)).toBe('other');
  });

  it('EH.B.5 — patterns frozen', () => {
    expect(Object.isFrozen(EXPENSE_CATEGORY_PATTERNS)).toBe(true);
  });
});

describe('EH.C — bucketExpensesByUser', () => {
  it('EH.C.1 — buckets per userId by category', () => {
    const exp = [
      { userId: 'D-1', categoryName: 'ค่านั่งแพทย์', amount: 500 },
      { userId: 'D-1', categoryName: 'เงินเดือน',     amount: 30000 },
      { userId: 'D-1', categoryName: 'Lab',          amount: 200 },
      { userId: 'D-2', categoryName: 'ค่ามือ',        amount: 1000 },
    ];
    const map = bucketExpensesByUser(exp);
    expect(map.get('D-1')).toEqual({ sitFee: 500, salary: 30000, df: 0, other: 200 });
    expect(map.get('D-2')).toEqual({ sitFee: 0, salary: 0, df: 1000, other: 0 });
  });

  it('EH.C.2 — expense without userId is skipped', () => {
    const exp = [{ categoryName: 'Lab', amount: 100 }];
    const map = bucketExpensesByUser(exp);
    expect(map.size).toBe(0);
  });
});

describe('EH.D — buildExpenseDoctorRows', () => {
  const doctors = [
    { id: 'D-1', firstname: 'นาย ก', lastname: 'นามสกุล', position: 'แพทย์' },
    { id: 'D-2', name: 'หมอ ข',                            position: 'แพทย์' },
    { id: 'A-1', name: 'ผู้ช่วย ก',                         position: 'ผู้ช่วยแพทย์' }, // skipped (assistant)
    { id: 'D-3', name: 'หมอ ที่ไม่มีรายจ่าย',               position: 'แพทย์' },         // included with 0
  ];
  const expenses = [
    { userId: 'D-1', categoryName: 'ค่านั่งแพทย์', amount: 500 },
    { userId: 'D-1', categoryName: 'เงินเดือน', amount: 30000 },
    { userId: 'D-2', categoryName: 'Lab',       amount: 200 },
  ];
  const dfPayoutRows = [
    { doctorId: 'D-1', totalDf: 1000 },
    { doctorId: 'D-2', totalDf: 5000 },
  ];

  it('EH.D.1 — produces row per doctor with position=แพทย์', () => {
    const rows = buildExpenseDoctorRows({ doctors, expenses, dfPayoutRows });
    expect(rows).toHaveLength(3);
    expect(rows.map(r => r.id).sort()).toEqual(['D-1', 'D-2', 'D-3']);
  });

  it('EH.D.2 — D-1 row reconciles all 4 columns', () => {
    const rows = buildExpenseDoctorRows({ doctors, expenses, dfPayoutRows });
    const d1 = rows.find(r => r.id === 'D-1');
    expect(d1.sitFee).toBe(500);
    expect(d1.df).toBe(1000); // from dfPayoutRows
    expect(d1.salary).toBe(30000);
    expect(d1.other).toBe(0);
    expect(d1.total).toBe(31500);
  });

  it('EH.D.3 — D-2 row: only DF + Lab(other)', () => {
    const rows = buildExpenseDoctorRows({ doctors, expenses, dfPayoutRows });
    const d2 = rows.find(r => r.id === 'D-2');
    expect(d2.df).toBe(5000);
    expect(d2.other).toBe(200);
    expect(d2.total).toBe(5200);
  });

  it('EH.D.4 — D-3 row included with all zeros', () => {
    const rows = buildExpenseDoctorRows({ doctors, expenses, dfPayoutRows });
    const d3 = rows.find(r => r.id === 'D-3');
    expect(d3.total).toBe(0);
  });

  it('EH.D.5 — assistants excluded from doctor section', () => {
    const rows = buildExpenseDoctorRows({ doctors, expenses, dfPayoutRows });
    expect(rows.find(r => r.id === 'A-1')).toBeUndefined();
  });

  it('EH.D.6 — sorted desc by total', () => {
    const rows = buildExpenseDoctorRows({ doctors, expenses, dfPayoutRows });
    for (let i = 0; i < rows.length - 1; i++) {
      expect(rows[i].total).toBeGreaterThanOrEqual(rows[i + 1].total);
    }
  });

  it('EH.D.7 — empty inputs → []', () => {
    expect(buildExpenseDoctorRows({})).toEqual([]);
  });

  it('EH.D.8 — manual ค่ามือ expense adds to dfPayout DF', () => {
    const exp = [...expenses, { userId: 'D-1', categoryName: 'ค่ามือ', amount: 333 }];
    const rows = buildExpenseDoctorRows({ doctors, expenses: exp, dfPayoutRows });
    const d1 = rows.find(r => r.id === 'D-1');
    expect(d1.df).toBe(1333); // 1000 (from dfPayout) + 333 (manual)
  });
});

describe('EH.E — buildExpenseStaffRows', () => {
  const staff = [
    { id: 'S-1', firstname: 'พนักงาน', lastname: 'A', position: 'รีเซฟชั่น' },
    { id: 'S-2', name: 'พนักงาน B',                    position: 'พนักงานต้อนรับ' },
  ];
  const doctors = [
    { id: 'D-1', name: 'หมอ A', position: 'แพทย์' }, // excluded from staff section
    { id: 'A-1', name: 'ผู้ช่วย A', position: 'ผู้ช่วยแพทย์' },
  ];
  const expenses = [
    { userId: 'S-1', categoryName: 'เงินเดือน', amount: 25000 },
    { userId: 'S-1', categoryName: 'ค่ามือ',    amount: 500 },
    { userId: 'A-1', categoryName: 'ค่ามือ',    amount: 1000 }, // explicit assistant DF expense
  ];
  const dfPayoutRows = [
    { doctorId: 'A-1', totalDf: 2500 }, // assistant DF from dfEntries
  ];

  it('EH.E.1 — includes be_staff + ผู้ช่วยแพทย์, excludes แพทย์', () => {
    const rows = buildExpenseStaffRows({ staff, doctors, expenses, dfPayoutRows });
    const ids = rows.map(r => r.id).sort();
    expect(ids).toEqual(['A-1', 'S-1', 'S-2']);
    expect(ids).not.toContain('D-1');
  });

  it('EH.E.2 — S-1 row: salary + manual DF', () => {
    const rows = buildExpenseStaffRows({ staff, doctors, expenses, dfPayoutRows });
    const s1 = rows.find(r => r.id === 'S-1');
    expect(s1.salary).toBe(25000);
    expect(s1.df).toBe(500);
    expect(s1.total).toBe(25500);
    expect(s1.position).toBe('รีเซฟชั่น');
  });

  it('EH.E.3 — A-1 (assistant) row combines dfPayoutRows + manual DF', () => {
    const rows = buildExpenseStaffRows({ staff, doctors, expenses, dfPayoutRows });
    const a1 = rows.find(r => r.id === 'A-1');
    expect(a1.df).toBe(3500); // 2500 (dfEntries) + 1000 (manual)
    expect(a1.position).toBe('ผู้ช่วยแพทย์');
  });

  it('EH.E.4 — empty inputs → []', () => {
    expect(buildExpenseStaffRows({})).toEqual([]);
  });
});

describe('EH.F — buildExpenseCategoryRows', () => {
  it('EH.F.1 — groups by categoryName, sums amount, counts', () => {
    const exp = [
      { categoryName: 'Lab',        amount: 100 },
      { categoryName: 'Lab',        amount: 200 },
      { categoryName: 'เงินเดือน', amount: 30000 },
    ];
    const rows = buildExpenseCategoryRows({ expenses: exp });
    expect(rows).toHaveLength(2);
    const lab = rows.find(r => r.categoryName === 'Lab');
    expect(lab.count).toBe(2);
    expect(lab.total).toBe(300);
  });

  it('EH.F.2 — handles missing categoryName via fallback', () => {
    const exp = [{ amount: 50 }];
    const rows = buildExpenseCategoryRows({ expenses: exp });
    expect(rows[0].categoryName).toBe('ไม่ระบุหมวดหมู่');
  });

  it('EH.F.3 — sorted desc by total', () => {
    const exp = [
      { categoryName: 'Small', amount: 10 },
      { categoryName: 'Big',   amount: 9999 },
    ];
    const rows = buildExpenseCategoryRows({ expenses: exp });
    expect(rows[0].categoryName).toBe('Big');
  });
});

describe('EH.G — computeExpenseSummary', () => {
  it('EH.G.1 — sums all 3 sections + counts', () => {
    const summary = computeExpenseSummary({
      doctorRows: [{ sitFee: 100, df: 200, salary: 300, other: 0, total: 600 }],
      staffRows:  [{ df: 50, salary: 25000, other: 0, total: 25050 }],
      categoryRows: [{ count: 5, total: 30000 }, { count: 3, total: 1500 }],
    });
    expect(summary.totalDoctor).toBe(600);
    expect(summary.totalDoctorDf).toBe(200);
    expect(summary.totalStaff).toBe(25050);
    expect(summary.totalStaffDf).toBe(50);
    expect(summary.totalCategory).toBe(31500);
    expect(summary.totalAll).toBe(31500);
    expect(summary.totalDoctorCount).toBe(1);
    expect(summary.totalStaffCount).toBe(1);
    expect(summary.totalCategoryCount).toBe(2);
  });

  it('EH.G.2 — empty inputs → all zeros', () => {
    const summary = computeExpenseSummary({});
    expect(summary.totalAll).toBe(0);
    expect(summary.totalDoctorCount).toBe(0);
  });
});

describe('EH.H — fullName', () => {
  it('EH.H.1 — uses .name when present', () => {
    expect(fullName({ name: 'หมอ ก' })).toBe('หมอ ก');
  });

  it('EH.H.2 — composes from firstname+lastname+nickname', () => {
    expect(fullName({ firstname: 'ดร.', lastname: 'นามสกุล', nickname: 'นิค' })).toBe('ดร. นามสกุล (นิค)');
  });

  it('EH.H.3 — fallback to id when no fields', () => {
    expect(fullName({ id: 'D-99' })).toBe('D-99');
  });
});
