// Phase 10.8 — Appointment Analysis: adversarial scenarios.

import { describe, it, expect } from 'vitest';
import {
  aggregateAppointmentAnalysis,
  matchSalesToAppointments,
  buildAdvisorKPIColumns,
} from '../src/lib/appointmentAnalysisAggregator.js';
import { buildCSV } from '../src/lib/csvExport.js';

const ASOF = '2026-04-20';

function appt({ id, cid = 'c1', date = '2026-04-10', status = 'done', expectedSales = 0, advisorName = 'Alice', advisorId = '' }) {
  return {
    appointmentId: id, id, customerId: cid, customerName: `Cust ${cid}`,
    date, startTime: '10:00', endTime: '10:30',
    status, expectedSales,
    advisorId, advisorName, doctorName: 'Dr A',
  };
}

function sale({ id, cid = 'c1', date = '2026-04-10', net = 1000, status = 'active', sellerName = 'Alice' }) {
  return {
    saleId: id, id, customerId: cid, customerName: `Cust ${cid}`,
    saleDate: date, status,
    billing: { netTotal: net },
    sellers: sellerName ? [{ name: sellerName }] : [],
    payment: { status: 'paid' },
  };
}

/* ─── Sale ↔ Appointment matching ────────────────────────────────────────── */

describe('matchSalesToAppointments', () => {
  it('matches sale to same-day same-customer appt', () => {
    const appts = [appt({ id: 'A1', cid: 'c1', date: '2026-04-10' })];
    const sales = [sale({ id: 'S1', cid: 'c1', date: '2026-04-10' })];
    const link = matchSalesToAppointments(sales, appts);
    expect(link.get('S1')).toBe('A1');
  });

  it('matches sale +1 day tolerance', () => {
    const appts = [appt({ id: 'A1', cid: 'c1', date: '2026-04-10' })];
    const sales = [sale({ id: 'S1', cid: 'c1', date: '2026-04-11' })];
    const link = matchSalesToAppointments(sales, appts);
    expect(link.get('S1')).toBe('A1');
  });

  it('matches sale -1 day tolerance', () => {
    const appts = [appt({ id: 'A1', cid: 'c1', date: '2026-04-10' })];
    const sales = [sale({ id: 'S1', cid: 'c1', date: '2026-04-09' })];
    const link = matchSalesToAppointments(sales, appts);
    expect(link.get('S1')).toBe('A1');
  });

  it('does NOT match sale >1 day away', () => {
    const appts = [appt({ id: 'A1', cid: 'c1', date: '2026-04-10' })];
    const sales = [sale({ id: 'S1', cid: 'c1', date: '2026-04-13' })];
    const link = matchSalesToAppointments(sales, appts);
    expect(link.has('S1')).toBe(false);
  });

  it('does NOT match sale to different customer', () => {
    const appts = [appt({ id: 'A1', cid: 'c1' })];
    const sales = [sale({ id: 'S1', cid: 'c2' })];
    const link = matchSalesToAppointments(sales, appts);
    expect(link.has('S1')).toBe(false);
  });

  it('does NOT match cancelled appts', () => {
    const appts = [appt({ id: 'A1', cid: 'c1', status: 'cancelled' })];
    const sales = [sale({ id: 'S1', cid: 'c1' })];
    const link = matchSalesToAppointments(sales, appts);
    expect(link.has('S1')).toBe(false);
  });

  it('does NOT match cancelled sales', () => {
    const appts = [appt({ id: 'A1', cid: 'c1' })];
    const sales = [sale({ id: 'S1', cid: 'c1', status: 'cancelled' })];
    const link = matchSalesToAppointments(sales, appts);
    expect(link.has('S1')).toBe(false);
  });

  it('each appt linked to AT MOST ONE sale (first-come by saleDate)', () => {
    const appts = [appt({ id: 'A1', cid: 'c1', date: '2026-04-10' })];
    const sales = [
      sale({ id: 'S1', cid: 'c1', date: '2026-04-10' }),
      sale({ id: 'S2', cid: 'c1', date: '2026-04-10' }),
    ];
    const link = matchSalesToAppointments(sales, appts);
    expect(link.get('S1')).toBe('A1');
    expect(link.has('S2')).toBe(false);
  });

  it('sale chooses closest-date appt when multiple in ±1d', () => {
    const appts = [
      appt({ id: 'A1', cid: 'c1', date: '2026-04-09' }), // 1 day away
      appt({ id: 'A2', cid: 'c1', date: '2026-04-10' }), // same day — closer
    ];
    const sales = [sale({ id: 'S1', cid: 'c1', date: '2026-04-10' })];
    const link = matchSalesToAppointments(sales, appts);
    expect(link.get('S1')).toBe('A2');
  });
});

/* ─── Per-advisor aggregation ────────────────────────────────────────────── */

describe('per-advisor aggregation (Table 0)', () => {
  it('groups by advisorName', () => {
    const appts = [
      appt({ id: 'A1', advisorName: 'Alice', expectedSales: 1000 }),
      appt({ id: 'A2', advisorName: 'Bob', expectedSales: 2000 }),
    ];
    const out = aggregateAppointmentAnalysis(appts, [], { asOfISO: ASOF });
    expect(out.advisors.length).toBe(2);
    expect(out.advisors.map(a => a.advisorName).sort()).toEqual(['Alice', 'Bob']);
  });

  it('attendedCount counts status=done appts', () => {
    const appts = [
      appt({ id: 'A1', status: 'done', advisorName: 'X' }),
      appt({ id: 'A2', status: 'done', advisorName: 'X' }),
      appt({ id: 'A3', status: 'pending', advisorName: 'X' }),
      appt({ id: 'A4', status: 'confirmed', advisorName: 'X' }),
    ];
    const out = aggregateAppointmentAnalysis(appts, [], { asOfISO: ASOF });
    const row = out.advisors[0];
    expect(row.attendedCount).toBe(2);
    expect(row.apptCount).toBe(4);
    expect(row.attendedRateLabel).toMatch(/^2 \/ 4/);
  });

  it('expectedSales sums across advisor appts', () => {
    const appts = [
      appt({ id: 'A1', advisorName: 'X', expectedSales: 1000 }),
      appt({ id: 'A2', advisorName: 'X', expectedSales: 2500 }),
    ];
    const out = aggregateAppointmentAnalysis(appts, [], { asOfISO: ASOF });
    expect(out.advisors[0].expectedSales).toBe(3500);
  });

  it('actualSales = sum of linked sale netTotal', () => {
    const appts = [
      appt({ id: 'A1', cid: 'c1', advisorName: 'X', expectedSales: 1000 }),
      appt({ id: 'A2', cid: 'c2', advisorName: 'X', expectedSales: 2000 }),
    ];
    const sales = [
      sale({ id: 'S1', cid: 'c1', net: 900 }),
      sale({ id: 'S2', cid: 'c2', net: 2100 }),
    ];
    const out = aggregateAppointmentAnalysis(appts, sales, { asOfISO: ASOF });
    expect(out.advisors[0].actualSales).toBe(3000);
  });

  it('performancePct = actual/expected × 100', () => {
    const appts = [appt({ id: 'A1', cid: 'c1', advisorName: 'X', expectedSales: 1000 })];
    const sales = [sale({ id: 'S1', cid: 'c1', net: 750 })];
    const out = aggregateAppointmentAnalysis(appts, sales, { asOfISO: ASOF });
    expect(out.advisors[0].performancePct).toBe(75);
  });

  it('expectedSales=0 → performancePct=0 (no divide-by-zero)', () => {
    const appts = [appt({ id: 'A1', advisorName: 'X', expectedSales: 0 })];
    const out = aggregateAppointmentAnalysis(appts, [], { asOfISO: ASOF });
    expect(out.advisors[0].performancePct).toBe(0);
  });

  it('unexpectedSales = sales NOT linked to any appt — grouped by first seller name', () => {
    const sales = [sale({ id: 'S1', cid: 'cZ', net: 500, sellerName: 'Eve' })];
    const out = aggregateAppointmentAnalysis([], sales, { asOfISO: ASOF });
    const eve = out.advisors.find(a => a.advisorName === 'Eve');
    expect(eve?.unexpectedSales).toBe(500);
    expect(eve?.actualSales).toBe(0);
  });

  it('totalSales = actualSales + unexpectedSales', () => {
    const appts = [appt({ id: 'A1', cid: 'c1', advisorName: 'X', expectedSales: 1000 })];
    const sales = [
      sale({ id: 'S1', cid: 'c1', net: 900, sellerName: 'X' }),
      sale({ id: 'S2', cid: 'unrelated', net: 500, sellerName: 'X' }),
    ];
    const out = aggregateAppointmentAnalysis(appts, sales, { asOfISO: ASOF });
    const x = out.advisors.find(a => a.advisorName === 'X');
    expect(x.totalSales).toBe(1400);
  });

  it('remainingExpected = sum of expectedSales from FUTURE appts', () => {
    const appts = [
      appt({ id: 'A1', date: '2026-04-10', advisorName: 'X', expectedSales: 1000 }), // past
      appt({ id: 'A2', date: '2026-04-25', advisorName: 'X', expectedSales: 2000 }), // future
      appt({ id: 'A3', date: '2026-05-01', advisorName: 'X', expectedSales: 3000 }), // future
    ];
    const out = aggregateAppointmentAnalysis(appts, [], { asOfISO: ASOF });
    const x = out.advisors[0];
    expect(x.remainingExpected).toBe(5000);
    expect(x.remainingCount).toBe(2);
  });

  it('maxPossible = totalSales + remainingExpected', () => {
    const appts = [
      appt({ id: 'A1', date: '2026-04-10', advisorName: 'X', expectedSales: 1000 }),
      appt({ id: 'A2', date: '2026-05-01', advisorName: 'X', expectedSales: 3000 }),
    ];
    const sales = [sale({ id: 'S1', cid: 'c1', net: 800, sellerName: 'X' })];
    const out = aggregateAppointmentAnalysis(appts, sales, { asOfISO: ASOF });
    const x = out.advisors[0];
    expect(x.maxPossible).toBe(roundIt(x.totalSales + x.remainingExpected));
  });

  it('forecast = totalSales + remainingExpected × performancePct/100', () => {
    const appts = [
      appt({ id: 'A1', cid: 'c1', date: '2026-04-10', advisorName: 'X', expectedSales: 1000 }),
      appt({ id: 'A2', date: '2026-05-01', advisorName: 'X', expectedSales: 1000 }),
    ];
    const sales = [sale({ id: 'S1', cid: 'c1', net: 750, sellerName: 'X' })];
    const out = aggregateAppointmentAnalysis(appts, sales, { asOfISO: ASOF });
    const x = out.advisors[0];
    // performance = 750/1000 = 75%; forecast = 750 + 1000×0.75 = 1500
    expect(x.forecast).toBe(1500);
  });
});

function roundIt(n) { return Math.round(n * 100) / 100; }

/* ─── Empty/null + cancelled safety ──────────────────────────────────────── */

describe('AR2 + AR3 safety', () => {
  it('empty inputs → empty output', () => {
    const out = aggregateAppointmentAnalysis([], [], { asOfISO: ASOF });
    expect(out.advisors).toEqual([]);
    expect(out.appointments).toEqual([]);
    expect(out.unexpectedSales).toEqual([]);
  });

  it('null inputs no throw', () => {
    expect(() => aggregateAppointmentAnalysis(null, null, { asOfISO: ASOF })).not.toThrow();
  });

  it('cancelled appts excluded from apptCount + expected', () => {
    const appts = [
      appt({ id: 'A1', advisorName: 'X', expectedSales: 1000, status: 'cancelled' }),
      appt({ id: 'A2', advisorName: 'X', expectedSales: 2000, status: 'done' }),
    ];
    const out = aggregateAppointmentAnalysis(appts, [], { asOfISO: ASOF });
    const x = out.advisors[0];
    expect(x.apptCount).toBe(1);
    expect(x.expectedSales).toBe(2000);
  });
});

/* ─── Drill tables (Table 1 + Table 2) ───────────────────────────────────── */

describe('drill tables', () => {
  it('appointments drill includes all non-cancelled', () => {
    const appts = [
      appt({ id: 'A1', advisorName: 'X' }),
      appt({ id: 'A2', advisorName: 'Y' }),
      appt({ id: 'A3', advisorName: 'Z', status: 'cancelled' }),
    ];
    const out = aggregateAppointmentAnalysis(appts, [], { asOfISO: ASOF });
    expect(out.appointments.length).toBe(2);
    expect(out.appointments.map(r => r.appointmentId).sort()).toEqual(['A1', 'A2']);
  });

  it('unexpectedSales drill has sales NOT linked to any appt', () => {
    const appts = [appt({ id: 'A1', cid: 'c1', date: '2026-04-10' })];
    const sales = [
      sale({ id: 'S1', cid: 'c1', date: '2026-04-10' }), // linked
      sale({ id: 'S2', cid: 'cZ', date: '2026-04-15' }), // unlinked
    ];
    const out = aggregateAppointmentAnalysis(appts, sales, { asOfISO: ASOF });
    expect(out.unexpectedSales.length).toBe(1);
    expect(out.unexpectedSales[0].saleId).toBe('S2');
  });
});

/* ─── Totals reconciliation ──────────────────────────────────────────────── */

describe('totals reconcile', () => {
  it('totals.actualSales = sum across advisors', () => {
    const appts = [
      appt({ id: 'A1', cid: 'c1', advisorName: 'X', expectedSales: 1000 }),
      appt({ id: 'A2', cid: 'c2', advisorName: 'Y', expectedSales: 2000 }),
    ];
    const sales = [
      sale({ id: 'S1', cid: 'c1', net: 900 }),
      sale({ id: 'S2', cid: 'c2', net: 1800 }),
    ];
    const out = aggregateAppointmentAnalysis(appts, sales, { asOfISO: ASOF });
    const sum = out.advisors.reduce((s, r) => s + r.actualSales, 0);
    expect(out.totals.actualSales).toBe(Math.round(sum * 100) / 100);
  });
});

/* ─── Column spec + CSV ──────────────────────────────────────────────────── */

describe('column spec + CSV', () => {
  it('buildAdvisorKPIColumns returns 10 cols', () => {
    const cols = buildAdvisorKPIColumns();
    expect(cols).toHaveLength(10);
    expect(cols[0].label).toBe('พนักงานทำนัด');
    expect(cols[4].label).toBe('Performance');
    expect(cols[9].label).toBe('Forecast');
  });

  it('CSV includes UTF-8 BOM', () => {
    const out = aggregateAppointmentAnalysis([], [], { asOfISO: ASOF });
    const csv = buildCSV(out.advisors, buildAdvisorKPIColumns());
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
  });
});

/* ─── AR15 pure ─────────────────────────────────────────────────────────── */

describe('AR15 — pure', () => {
  it('same input → same output', () => {
    const appts = [appt({ id: 'A1', advisorName: 'X' })];
    const sales = [sale({ id: 'S1', cid: 'c1' })];
    const a = aggregateAppointmentAnalysis(appts, sales, { asOfISO: ASOF });
    const b = aggregateAppointmentAnalysis(appts, sales, { asOfISO: ASOF });
    expect(a).toEqual(b);
  });
});
