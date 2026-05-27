// ─── BS-F — 5 reader refactor + aggregator opt-out ────────────────────
// Source-grep regression guards on the listers in backendClient.js
// (getAllSales / getAppointmentsByMonth / getAppointmentsByDate /
//  listExpenses / listQuotations) and the consumers of those listers.
// Default behavior unchanged (no opts → no filter) so legacy callers
// keep working; new callers opt in via {branchId}; aggregators opt out
// via {allBranches: true}.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const backendClientSrc = readFileSync(
  resolve(__dirname, '../src/lib/backendClient.js'),
  'utf-8',
);
const aggregatorSrc = readFileSync(
  resolve(__dirname, '../src/lib/clinicReportAggregator.js'),
  'utf-8',
);

function fnSlice(name) {
  // V64 (2026-05-09) — anchor on `name(` so a longer prefix-match function
  // (e.g. getAppointmentsByDateRange) doesn't shadow the slice for the
  // shorter name (getAppointmentsByDate). The previous helper used
  // `indexOf('export async function ${name}')` which matched the longer
  // function first when both exist in the same file.
  const start = backendClientSrc.indexOf(`export async function ${name}(`);
  if (start < 0) return '';
  return backendClientSrc.slice(start, start + 1500);
}

describe('BS-F.1 — getAllSales accepts {branchId, allBranches}', () => {
  const slice = fnSlice('getAllSales');

  it('signature: opts = {}', () => {
    expect(slice).toMatch(/getAllSales\(opts\s*=\s*\{\}\)/);
  });

  it('destructures branchId + allBranches from opts', () => {
    expect(slice).toMatch(/branchId,\s*allBranches\s*=\s*false/);
  });

  it('applies where(branchId,==,X) when filter active', () => {
    expect(slice).toMatch(/where\(['"]branchId['"]\s*,\s*['"]==['"]\s*,\s*String\(branchId\)\)/);
  });

  it('skips filter when allBranches=true', () => {
    expect(slice).toMatch(/branchId\s*&&\s*!allBranches/);
  });
});

describe('BS-F.2 — getAppointmentsByMonth accepts opts', () => {
  const slice = fnSlice('getAppointmentsByMonth');

  it('signature: yearMonth, opts = {}', () => {
    expect(slice).toMatch(/getAppointmentsByMonth\(yearMonth,\s*opts\s*=\s*\{\}\)/);
  });

  it('applies branchId filter when not allBranches', () => {
    // V54 (2026-05-08, BS-13) replaced `branchId && !allBranches` with the
    // safe-by-default chain (effectiveBranchId resolves via
    // resolveSelectedBranchId; falsy result + !allBranches → empty return).
    // The intent of this test (filters by branchId when not allBranches)
    // is preserved — assertion now matches the V54 chain.
    expect(slice).toMatch(/!allBranches\s*&&\s*effectiveBranchId/);
    expect(slice).toMatch(/where\(['"]branchId['"]/);
  });
});

describe('BS-F.3 — getAppointmentsByDate accepts opts', () => {
  const slice = fnSlice('getAppointmentsByDate');

  it('signature: dateStr, opts = {}', () => {
    expect(slice).toMatch(/getAppointmentsByDate\(dateStr,\s*opts\s*=\s*\{\}\)/);
  });

  it('preserves client-side date normalization', () => {
    expect(slice).toMatch(/normalizeApptDate/);
  });
});

describe('BS-F.4 — listExpenses includes allBranches override', () => {
  const slice = fnSlice('listExpenses');

  it('destructures allBranches from opts', () => {
    expect(slice).toMatch(/allBranches\s*=\s*false/);
  });

  it('skips branchId filter when allBranches=true', () => {
    expect(slice).toMatch(/branchId\s*&&\s*!allBranches/);
  });
});

describe('BS-F.5 — listQuotations accepts {branchId, allBranches}', () => {
  const slice = fnSlice('listQuotations');

  it('signature: opts = {}', () => {
    expect(slice).toMatch(/listQuotations\(opts\s*=\s*\{\}\)/);
  });

  it('applies branchId filter when not allBranches', () => {
    expect(slice).toMatch(/where\(['"]branchId['"]/);
  });
});

describe('BS-F.6 — clinicReportAggregator passes allBranches:true (cross-branch by design)', () => {
  it('getAllSales call includes allBranches:true', () => {
    expect(aggregatorSrc).toMatch(/getAllSales\(\{\s*allBranches:\s*true\s*\}\)/);
  });

  it('getAppointmentsByMonth call includes allBranches:true', () => {
    expect(aggregatorSrc).toMatch(/getAppointmentsByMonth\([^,]+,\s*\{\s*allBranches:\s*true\s*\}\)/);
  });

  it('listExpenses call includes allBranches:true', () => {
    expect(aggregatorSrc).toMatch(/listExpenses\(\{[^}]*allBranches:\s*true[^}]*\}\)/);
  });
});

describe('BS-F.7 — UI consumers pass branchId for branch-scoped fetch', () => {
  it('SaleTab.loadSales passes branchId:BRANCH_ID', () => {
    const src = readFileSync(
      resolve(__dirname, '../src/components/backend/SaleTab.jsx'),
      'utf-8',
    );
    expect(src).toMatch(/getAllSales\(\{\s*branchId:\s*BRANCH_ID\s*\}\)/);
  });

  it('AppointmentTab passes branchId:selectedBranchId to the month listener', () => {
    const src = readFileSync(
      resolve(__dirname, '../src/components/backend/AppointmentCalendarView.jsx'),
      'utf-8',
    );
    // 2026-05-28 V124: month-strip switched from one-shot getAppointmentsByMonth
    // → onSnapshot listenToAppointmentsByMonth (real-time, cross-device). branchId
    // scoping preserved (the BS-F intent). day-grid stays listenToAppointmentsByDate.
    expect(src).toMatch(/listenToAppointmentsByMonth\([^,]+,\s*\{\s*branchId:\s*selectedBranchId\s*\}/);
    expect(src).not.toMatch(/getAppointmentsByMonth\s*\(/); // one-shot getter fully removed from this consumer
  });

  it('FinanceMasterTab passes branchId:selectedBranchId to listExpenses', () => {
    const src = readFileSync(
      resolve(__dirname, '../src/components/backend/FinanceMasterTab.jsx'),
      'utf-8',
    );
    expect(src).toMatch(/listExpenses\(\{\s*branchId:\s*selectedBranchId\s*\}\)/);
  });

  it('QuotationTab passes branchId:selectedBranchId', () => {
    const src = readFileSync(
      resolve(__dirname, '../src/components/backend/QuotationTab.jsx'),
      'utf-8',
    );
    expect(src).toMatch(/listQuotations\(\{\s*branchId:\s*selectedBranchId\s*\}\)/);
  });

  it('SaleInsuranceClaimsTab passes branchId:selectedBranchId', () => {
    const src = readFileSync(
      resolve(__dirname, '../src/components/backend/SaleInsuranceClaimsTab.jsx'),
      'utf-8',
    );
    expect(src).toMatch(/getAllSales\(\{\s*branchId:\s*selectedBranchId\s*\}\)/);
  });
});

describe('BS-F.8 — Doctor-collision check is cross-branch (createBackendAppointment)', () => {
  it('getAppointmentsByDate inside collision-check uses allBranches:true', () => {
    // A physical doctor can be assigned to multiple branches but they
    // can only be in one place at a time. The collision check must span
    // ALL branches so we don't allow simultaneous bookings.
    expect(backendClientSrc).toMatch(
      /getAppointmentsByDate\(targetDate,\s*\{\s*allBranches:\s*true\s*\}\)/,
    );
  });
});
