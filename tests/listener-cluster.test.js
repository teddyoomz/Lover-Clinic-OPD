// ─── Phase 14.7.H Follow-up B — listener cluster tests ────────────────
//
// Pre-Phase-15 survey 2026-04-26 surfaced 3 staleness gaps with the
// same shape as the 14.7.G treatment-listener fix. This file locks all 3
// listener helpers + their wire-ups in CustomerDetailView and
// AppointmentTab.
//
// Listener 1: listenToCustomerSales (CustomerDetailView purchase history)
// Listener 2: listenToCustomerAppointments (CustomerDetailView nextUpcomingAppt + list)
// Listener 3: listenToAppointmentsByDate (AppointmentTab time-grid — multi-admin collision fix)
//
// Test groups:
//   LC1 — backendClient export shape + onSnapshot wiring
//   LC2 — pure listener-impl behavior (mirrored callback)
//   LC3 — CustomerDetailView wiring (sales + appointments)
//   LC4 — AppointmentTab wiring (day grid)
//   LC5 — anti-regression (no one-shot fetches in render path)

import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const READ = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ─── LC1: backendClient exports ────────────────────────────────────────────

describe('LC1: backendClient exports the 3 new listeners', () => {
  const SRC = READ('src/lib/backendClient.js');

  it('LC1.1: exports listenToCustomerSales', () => {
    expect(SRC).toMatch(/export\s+function\s+listenToCustomerSales/);
  });

  it('LC1.2: exports listenToCustomerAppointments', () => {
    expect(SRC).toMatch(/export\s+function\s+listenToCustomerAppointments/);
  });

  it('LC1.3: exports listenToAppointmentsByDate', () => {
    expect(SRC).toMatch(/export\s+function\s+listenToAppointmentsByDate/);
  });

  it('LC1.4: each listener returns onSnapshot result (which is the unsubscribe fn)', () => {
    expect(SRC).toMatch(/listenToCustomerSales[\s\S]+?return onSnapshot\(/);
    expect(SRC).toMatch(/listenToCustomerAppointments[\s\S]+?return onSnapshot\(/);
    expect(SRC).toMatch(/listenToAppointmentsByDate[\s\S]+?return onSnapshot\(/);
  });

  it('LC1.5: customer-scoped listeners filter by where(customerId == X)', () => {
    expect(SRC).toMatch(/listenToCustomerSales[\s\S]+?where\(['"]customerId['"],\s*['"]==['"],\s*String\(customerId\)\)/);
    expect(SRC).toMatch(/listenToCustomerAppointments[\s\S]+?where\(['"]customerId['"],\s*['"]==['"],\s*String\(customerId\)\)/);
  });

  it('LC1.6: listenToAppointmentsByDate normalizes date + filters client-side (matches getAppointmentsByDate contract)', () => {
    expect(SRC).toMatch(/listenToAppointmentsByDate[\s\S]+?normalizeApptDate\(dateStr\)/);
    expect(SRC).toMatch(/listenToAppointmentsByDate[\s\S]+?normalizeApptDate\(a\.date\)\s*===\s*target/);
  });

  it('LC1.7: listenToAppointmentsByDate returns no-op unsubscribe for invalid date', () => {
    // Defensive: if normalizeApptDate returns null, listener returns
    // `() => {}` so callers can call unsubscribe() without errors.
    expect(SRC).toMatch(/if\s*\(!target\)\s*\{[\s\S]+?return\s*\(\)\s*=>\s*\{\}/);
  });

  it('LC1.8: each listener sorts results to match the one-shot contract', () => {
    // sales: by createdAt || saleDate desc
    expect(SRC).toMatch(/listenToCustomerSales[\s\S]+?\.localeCompare\([^)]*createdAt[^)]*\|\|[^)]*saleDate/);
    // customerAppointments: by date desc (b.date || '').localeCompare(a.date || '')
    expect(SRC).toMatch(/listenToCustomerAppointments[\s\S]+?\(b\.date\s*\|\|\s*['"]['"]\)\.localeCompare\(a\.date/);
    // appointmentsByDate: by startTime asc
    expect(SRC).toMatch(/listenToAppointmentsByDate[\s\S]+?startTime[\s\S]+?\.localeCompare/);
  });
});

// ─── LC2: listener pure behavior — mirrored impl (no Firebase emulator) ────

describe('LC2: listener pure behavior — sort + filter contracts', () => {
  // Simulate listenToCustomerSales sorting
  function sortSales(snapDocs) {
    const sales = snapDocs.map(d => ({ id: d.id, ...d.data() }));
    sales.sort((a, b) => (b.createdAt || b.saleDate || '').localeCompare(a.createdAt || a.saleDate || ''));
    return sales;
  }
  function sortApptsByDate(snapDocs, target) {
    return snapDocs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(a => (a.date || '').slice(0, 10) === target)
      .map(a => ({ ...a, date: target }))
      .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  }
  function sortCustAppts(snapDocs) {
    const appts = snapDocs.map(d => ({ id: d.id, ...d.data() }));
    appts.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return appts;
  }

  it('LC2.1: customer sales sorted desc by createdAt with saleDate fallback', () => {
    const docs = [
      { id: 'S1', data: () => ({ saleId: 'S1', createdAt: '2026-04-01T10:00:00Z' }) },
      { id: 'S2', data: () => ({ saleId: 'S2', createdAt: '2026-04-26T10:00:00Z' }) },
      { id: 'S3', data: () => ({ saleId: 'S3', saleDate: '2026-04-15' }) }, // no createdAt
    ];
    const result = sortSales(docs);
    expect(result.map(s => s.saleId)).toEqual(['S2', 'S3', 'S1']);
  });

  it('LC2.2: appointments-by-date filters then sorts asc by startTime', () => {
    const docs = [
      { id: 'A1', data: () => ({ date: '2026-04-26', startTime: '14:00' }) },
      { id: 'A2', data: () => ({ date: '2026-04-26', startTime: '09:00' }) },
      { id: 'A3', data: () => ({ date: '2026-04-25', startTime: '10:00' }) }, // wrong date
    ];
    const result = sortApptsByDate(docs, '2026-04-26');
    expect(result.map(a => a.id)).toEqual(['A2', 'A1']);
    expect(result.every(a => a.date === '2026-04-26')).toBe(true);
  });

  it('LC2.3: customer appointments sorted desc by date', () => {
    const docs = [
      { id: 'A1', data: () => ({ date: '2026-04-01' }) },
      { id: 'A2', data: () => ({ date: '2026-04-26' }) },
      { id: 'A3', data: () => ({ date: '2026-05-15' }) },
    ];
    const result = sortCustAppts(docs);
    expect(result.map(a => a.id)).toEqual(['A3', 'A2', 'A1']);
  });

  it('LC2.4: snapshot fires on doc add → all listeners see the new doc immediately', () => {
    const cb = vi.fn();
    const handler = (snap) => cb(sortSales(snap.docs));
    handler({ docs: [{ id: 'S1', data: () => ({ saleId: 'S1' }) }] });
    handler({ docs: [
      { id: 'S1', data: () => ({ saleId: 'S1' }) },
      { id: 'S2', data: () => ({ saleId: 'S2', createdAt: '2026-04-26' }) },
    ] });
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb.mock.calls[0][0].length).toBe(1);
    expect(cb.mock.calls[1][0].length).toBe(2);
  });

  it('LC2.5: empty snapshot → onChange called with []', () => {
    const cb = vi.fn();
    const handler = (snap) => cb(sortSales(snap.docs));
    handler({ docs: [] });
    expect(cb).toHaveBeenCalledWith([]);
  });
});

// ─── LC3: CustomerDetailView wiring ────────────────────────────────────────

describe('LC3: CustomerDetailView uses listenToCustomerSales + listenToCustomerAppointments', () => {
  const SRC = READ('src/components/backend/CustomerDetailView.jsx');

  it('LC3.1: imports both listener helpers from backendClient', () => {
    expect(SRC).toMatch(/listenToCustomerSales/);
    expect(SRC).toMatch(/listenToCustomerAppointments/);
  });

  it('LC3.2: sales listener subscribed in useEffect with proper cleanup', () => {
    expect(SRC).toMatch(/listenToCustomerSales\(\s*customer\.proClinicId/);
    // The listener is assigned to a local `unsubscribe` const, and the
    // useEffect that owns it returns () => unsubscribe(). Search for both.
    expect(SRC).toMatch(/const\s+unsubscribe\s*=\s*listenToCustomerSales/);
    expect(SRC).toMatch(/return\s*\(\s*\)\s*=>\s*unsubscribe\(\)/);
  });

  it('LC3.3: appointments listener subscribed in useEffect with proper cleanup', () => {
    expect(SRC).toMatch(/listenToCustomerAppointments\(\s*customer\.proClinicId/);
    expect(SRC).toMatch(/const\s+unsubscribe\s*=\s*listenToCustomerAppointments/);
    // 3 separate `return () => unsubscribe()` exist in this file (treatments,
    // sales, appointments listeners). Just assert one exists; LC3.2 checks
    // it for sales separately.
    expect(SRC).toMatch(/return\s*\(\s*\)\s*=>\s*unsubscribe\(\)/);
  });

  it('LC3.4: legacy one-shot fetches removed from useEffect bodies', () => {
    // Pattern: `getCustomerSales(customer.proClinicId).then(...)` was the
    // old call. Must not appear in the live useEffect anymore.
    expect(SRC).not.toMatch(/getCustomerSales\(customer\.proClinicId\)\s*\.then/);
    expect(SRC).not.toMatch(/getCustomerAppointments\(customer\.proClinicId\)\s*\.then\(\s*list/);
  });

  it('LC3.5: getCustomerSales + getCustomerAppointments still imported (one-shot variants kept for non-listener callers)', () => {
    expect(SRC).toMatch(/import\s*\{[\s\S]*?getCustomerSales[\s\S]*?\}/);
    expect(SRC).toMatch(/import\s*\{[\s\S]*?getCustomerAppointments[\s\S]*?\}/);
  });
});

// ─── LC4: AppointmentTab wiring ────────────────────────────────────────────

describe('LC4: AppointmentTab uses listenToAppointmentsByDate', () => {
  const SRC = READ('src/components/backend/AppointmentTab.jsx');

  it('LC4.1: imports listenToAppointmentsByDate', () => {
    expect(SRC).toMatch(/listenToAppointmentsByDate/);
  });

  it('LC4.2: day-load useEffect subscribes to listener with cleanup', () => {
    expect(SRC).toMatch(/listenToAppointmentsByDate\(\s*selectedDate/);
    expect(SRC).toMatch(/const\s+unsubscribe\s*=\s*listenToAppointmentsByDate/);
    expect(SRC).toMatch(/return\s*\(\s*\)\s*=>\s*unsubscribe\(\)/);
  });

  it('LC4.3: legacy `await getAppointmentsByDate(d)` removed from loadDay body', () => {
    // The shim version of loadDay is a no-op now.
    expect(SRC).not.toMatch(/await\s+getAppointmentsByDate\(/);
  });

  it('LC4.4: loadDay kept as no-op shim so refreshAfterSave callsite still works', () => {
    expect(SRC).toMatch(/const\s+loadDay\s*=\s*useCallback\(/);
  });

  it('LC4.5: month-level getAppointmentsByMonth still one-shot (intentional — reduces snapshot cost)', () => {
    expect(SRC).toMatch(/getAppointmentsByMonth\(monthStr\)\.then\(setMonthAppts\)/);
  });
});

// ─── LC5: anti-regression source-grep guards ──────────────────────────────

describe('LC5: anti-regression source-grep guards', () => {
  const VIEW = READ('src/components/backend/CustomerDetailView.jsx');
  const APPT = READ('src/components/backend/AppointmentTab.jsx');

  it('LC5.1: CustomerDetailView no longer has reload-callback for appointments (listener handles it)', () => {
    // The old reloadCustomerAppointments did getCustomerAppointments(...).then(setCustomerAppointments)
    // — that pattern should not appear in the live function body anymore.
    expect(VIEW).not.toMatch(/setCustomerAppointments\(Array\.isArray\(list\)/);
  });

  it('LC5.2: NO setInterval polling in either component (listeners handle freshness)', () => {
    // Treatment-listener region (~line 175-200 of CustomerDetailView):
    const treatmentRegion = VIEW.match(/listenToCustomerTreatments[\s\S]{0,800}/)?.[0] || '';
    expect(treatmentRegion).not.toMatch(/setInterval/);
    // AppointmentTab day-listener region:
    const apptRegion = APPT.match(/listenToAppointmentsByDate[\s\S]{0,500}/)?.[0] || '';
    expect(apptRegion).not.toMatch(/setInterval/);
  });

  it('LC5.3: listener subscriptions have stable deps so they don\'t re-subscribe on every render', () => {
    // CustomerDetailView appointments useEffect has `[customer?.proClinicId]` as dep
    expect(VIEW).toMatch(/listenToCustomerAppointments[\s\S]+?\}\,\s*\[\s*customer\?\.proClinicId\s*\]\s*\)/);
    // AppointmentTab day-listener has `[selectedDate]`
    expect(APPT).toMatch(/listenToAppointmentsByDate[\s\S]+?\}\,\s*\[selectedDate\]\s*\)/);
  });

  it('LC5.4: NO inline backendClient brokerClient or /api/proclinic/* call (Rule E)', () => {
    expect(VIEW).not.toMatch(/brokerClient/);
    expect(APPT).not.toMatch(/brokerClient/);
    expect(VIEW).not.toMatch(/\/api\/proclinic/);
    expect(APPT).not.toMatch(/\/api\/proclinic/);
  });
});
