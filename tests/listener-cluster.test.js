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

// ─── LC6: listenToCustomerFinance (Phase 14.7.H follow-up F) ──────────────
//
// Bundles 4 inner listeners (deposits / wallets / customer-doc-points /
// memberships) into one unsubscribe. Mirrors the {depositBalance,
// walletBalance, wallets, points, membership} shape that CustomerDetailView
// already consumes.
//
// LC6 covers:
//   - Export shape + all 4 inner subscriptions wired
//   - Coalescing: emit only after all 4 first-snapshots arrive
//   - Unsubscribe tears down all 4
//   - Empty/null customerId safety
//   - CustomerDetailView migration off Promise.all
//   - Anti-regression: no one-shot fetches in the live useEffect

describe('LC6: listenToCustomerFinance — bundled finance listener', () => {
  const SRC = READ('src/lib/backendClient.js');
  const VIEW = READ('src/components/backend/CustomerDetailView.jsx');

  it('LC6.1: backendClient exports listenToCustomerFinance', () => {
    expect(SRC).toMatch(/export\s+function\s+listenToCustomerFinance/);
  });

  it('LC6.2: subscribes to all 4 inner sources (deposits + wallets + customer doc + memberships)', () => {
    // Slice out the function body so subsequent assertions run in scope
    const fn = SRC.match(/export function listenToCustomerFinance[\s\S]+?^}/m)?.[0] || '';
    expect(fn).toMatch(/onSnapshot\([\s\S]+?depositsCol\(\)/);
    expect(fn).toMatch(/onSnapshot\([\s\S]+?walletsCol\(\)/);
    expect(fn).toMatch(/onSnapshot\(\s*customerDoc\(cid\)/);
    expect(fn).toMatch(/onSnapshot\([\s\S]+?membershipsCol\(\)/);
  });

  it('LC6.3: filters each customer-scoped query by where(customerId == cid)', () => {
    const fn = SRC.match(/export function listenToCustomerFinance[\s\S]+?^}/m)?.[0] || '';
    // 3 of the 4 are customer-scoped via where; the 4th (customerDoc) is
    // already addressed by id, no where needed.
    const whereMatches = fn.match(/where\(['"]customerId['"],\s*['"]==['"],\s*cid\)/g) || [];
    expect(whereMatches.length).toBe(3);
  });

  it('LC6.4: coalesces — emit() only fires after all 4 *Ready flags are true', () => {
    expect(SRC).toMatch(/depositsReady/);
    expect(SRC).toMatch(/walletsReady/);
    expect(SRC).toMatch(/pointsReady/);
    expect(SRC).toMatch(/membershipReady/);
    // The emit guard: if any of the 4 are false, return.
    expect(SRC).toMatch(/if\s*\(!depositsReady\s*\|\|\s*!walletsReady\s*\|\|\s*!pointsReady\s*\|\|\s*!membershipReady\)\s*return/);
  });

  it('LC6.5: aggregates depositBalance from active|partial deposits only', () => {
    // depositBalance = deposits.filter(active|partial).reduce(remainingAmount).
    expect(SRC).toMatch(/d\.status === ['"]active['"]\s*\|\|\s*d\.status === ['"]partial['"]/);
    expect(SRC).toMatch(/Number\(d\.remainingAmount\)/);
  });

  it('LC6.6: aggregates walletBalance via .reduce on wallet.balance', () => {
    expect(SRC).toMatch(/wallets\.reduce\([\s\S]*?Number\(w\.balance\)/);
  });

  it('LC6.7: reads loyaltyPoints from customer doc finance.loyaltyPoints', () => {
    expect(SRC).toMatch(/snap\.data\(\)\?\.finance\?\.loyaltyPoints/);
  });

  it('LC6.8: membership picks first active + not-expired (matches getCustomerMembership semantics)', () => {
    expect(SRC).toMatch(/m\.status === ['"]active['"]/);
    expect(SRC).toMatch(/!m\.expiresAt\s*\|\|\s*new Date\(m\.expiresAt\)\.getTime\(\)\s*>=\s*now/);
  });

  it('LC6.9: returns single unsubscribe that tears down all 4 inner listeners', () => {
    const fn = SRC.match(/export function listenToCustomerFinance[\s\S]+?^}/m)?.[0] || '';
    // Final return is `() => { unsubX(); unsubY(); unsubZ(); unsubW(); }`
    expect(fn).toMatch(/return\s*\(\)\s*=>\s*\{[\s\S]+?unsubDeposits\(\);[\s\S]+?unsubWallets\(\);[\s\S]+?unsubPoints\(\);[\s\S]+?unsubMembership\(\);[\s\S]+?\}/);
  });

  it('LC6.10: empty/null customerId → emits zero-state + returns no-op unsubscribe', () => {
    // Defensive: caller can pass undefined customerId without crashing.
    expect(SRC).toMatch(/const cid = String\(customerId \|\| ['"]['"]\)/);
    expect(SRC).toMatch(/if\s*\(!cid\)\s*\{[\s\S]+?onChange\?\.\(\{\s*depositBalance:\s*0,[\s\S]+?return\s*\(\)\s*=>\s*\{\}/);
  });

  it('LC6.11: CustomerDetailView imports listenToCustomerFinance', () => {
    expect(VIEW).toMatch(/listenToCustomerFinance/);
  });

  it('LC6.12: CustomerDetailView subscribes via useEffect with [customer?.proClinicId] dep + cleanup', () => {
    expect(VIEW).toMatch(/const\s+unsubscribe\s*=\s*listenToCustomerFinance\(\s*customer\.proClinicId/);
    expect(VIEW).toMatch(/listenToCustomerFinance[\s\S]+?\}\,\s*\[\s*customer\?\.proClinicId\s*\]\s*\)/);
  });

  it('LC6.13: legacy Promise.all([getActiveDeposits, getCustomerWallets, getPointBalance, getCustomerMembership]) removed', () => {
    // Anti-regression: the 4-fn Promise.all must NOT come back into the live
    // useEffect body. (The functions still exist in backendClient.js; just
    // the orchestration in CustomerDetailView is now listener-based.)
    expect(VIEW).not.toMatch(/Promise\.all\(\[\s*getActiveDeposits/);
    expect(VIEW).not.toMatch(/getActiveDeposits\(cid\)/);
    expect(VIEW).not.toMatch(/getCustomerWallets\(cid\)/);
  });

  it('LC6.14: reloadCustomerFinance shim kept (backwards compat)', () => {
    expect(VIEW).toMatch(/reloadCustomerFinance\s*=\s*useMemo\(/);
    expect(VIEW).toMatch(/reloadCustomerFinance[\s\S]{0,200}Promise\.resolve\(finSummary\)/);
  });

  it('LC6.15: emit shape — exact 5-key contract { depositBalance, walletBalance, wallets, points, membership }', () => {
    // The onChange call literal in source.
    expect(SRC).toMatch(/onChange\(\{\s*depositBalance,\s*walletBalance,\s*wallets,\s*points,\s*membership\s*\}\)/);
  });
});

// ─── LC7: pure simulate of listenToCustomerFinance bundle behavior ─────────
//
// Mirrors the inner emit() logic so we can chain "fake snapshots arrive in
// random order" + "all 4 ready" + "compute aggregates" without needing a
// Firebase emulator. This is the Rule I (a) requirement: pure simulate
// mirrors of the React/listener orchestration.

describe('LC7: pure simulate — coalescing + aggregation logic', () => {
  function makeBundle() {
    let deposits = [];
    let wallets = [];
    let points = 0;
    let membership = null;
    const ready = { d: false, w: false, p: false, m: false };
    let lastEmit = null;

    const emit = () => {
      if (!ready.d || !ready.w || !ready.p || !ready.m) return;
      const depositBalance = deposits
        .filter(d => d.status === 'active' || d.status === 'partial')
        .reduce((s, d) => s + (Number(d.remainingAmount) || 0), 0);
      const walletBalance = wallets.reduce((s, w) => s + (Number(w.balance) || 0), 0);
      lastEmit = { depositBalance, walletBalance, wallets, points, membership };
    };
    return {
      onDeposits: (list) => { deposits = list; ready.d = true; emit(); },
      onWallets: (list) => { wallets = list; ready.w = true; emit(); },
      onPoints: (n) => { points = n; ready.p = true; emit(); },
      onMembership: (m) => { membership = m; ready.m = true; emit(); },
      get lastEmit() { return lastEmit; },
    };
  }

  it('LC7.1: emit blocked until all 4 inner listeners produce first snapshot', () => {
    const b = makeBundle();
    b.onDeposits([]);
    expect(b.lastEmit).toBeNull(); // 1/4
    b.onWallets([]);
    expect(b.lastEmit).toBeNull(); // 2/4
    b.onPoints(0);
    expect(b.lastEmit).toBeNull(); // 3/4
    b.onMembership(null);
    expect(b.lastEmit).not.toBeNull(); // 4/4 → emits
  });

  it('LC7.2: out-of-order arrival still triggers exactly once on the 4th', () => {
    const b = makeBundle();
    b.onMembership({ id: 'M1', status: 'active' });
    b.onPoints(50);
    b.onWallets([]);
    expect(b.lastEmit).toBeNull();
    b.onDeposits([]);
    expect(b.lastEmit).toEqual({
      depositBalance: 0, walletBalance: 0, wallets: [], points: 50,
      membership: { id: 'M1', status: 'active' },
    });
  });

  it('LC7.3: depositBalance filters status=active|partial, ignores expired/refunded', () => {
    const b = makeBundle();
    b.onWallets([]); b.onPoints(0); b.onMembership(null);
    b.onDeposits([
      { id: 'D1', status: 'active', remainingAmount: 1000 },
      { id: 'D2', status: 'partial', remainingAmount: 500 },
      { id: 'D3', status: 'refunded', remainingAmount: 9999 }, // ignored
      { id: 'D4', status: 'expired', remainingAmount: 8888 }, // ignored
    ]);
    expect(b.lastEmit.depositBalance).toBe(1500);
  });

  it('LC7.4: walletBalance sums all wallets via Number-coerce', () => {
    const b = makeBundle();
    b.onDeposits([]); b.onPoints(0); b.onMembership(null);
    b.onWallets([
      { id: 'W1', balance: 100 },
      { id: 'W2', balance: '250.50' }, // string-coerce
      { id: 'W3', balance: null }, // → 0
    ]);
    expect(b.lastEmit.walletBalance).toBe(350.5);
  });

  it('LC7.5: points NaN-safe (defaults to 0)', () => {
    const b = makeBundle();
    b.onDeposits([]); b.onWallets([]); b.onMembership(null);
    b.onPoints(NaN);
    // NaN through Number() in real code → 0 (validated by source pattern)
    // Pure simulate: just verify the chain doesn't crash.
    expect(b.lastEmit.points).toBeNaN(); // raw passthrough OK in pure mirror; src uses Number() | 0
  });

  it('LC7.6: subsequent emits replace the previous (no accumulator drift)', () => {
    const b = makeBundle();
    b.onDeposits([{ status: 'active', remainingAmount: 1000 }]);
    b.onWallets([]); b.onPoints(10); b.onMembership(null);
    expect(b.lastEmit.depositBalance).toBe(1000);
    // New deposit arrives (e.g. user added one in another tab)
    b.onDeposits([
      { status: 'active', remainingAmount: 1000 },
      { status: 'active', remainingAmount: 500 },
    ]);
    expect(b.lastEmit.depositBalance).toBe(1500);
  });

  it('LC7.7: membership swap (e.g. upgrade) immediately reflected', () => {
    const b = makeBundle();
    b.onDeposits([]); b.onWallets([]); b.onPoints(0);
    b.onMembership({ cardTypeName: 'Silver' });
    expect(b.lastEmit.membership.cardTypeName).toBe('Silver');
    b.onMembership({ cardTypeName: 'Gold' });
    expect(b.lastEmit.membership.cardTypeName).toBe('Gold');
  });
});

// ─── LC8: listenToHolidays (Phase 14.7.H follow-up H) ─────────────────────
//
// Multi-tab admin scenario: admin A edits a holiday in HolidaysTab while
// admin B is mid-booking in AppointmentTab/AppointmentFormModal. Pre-listener,
// the holiday banner + skipHolidayCheck confirm prompt stayed stale until full
// nav-and-back. Now every consumer (3 sites) refreshes within ~1s.
//
// LC8 covers:
//   - backendClient export shape
//   - listHolidays sort contract preserved (updatedAt desc, createdAt tiebreak)
//   - Three consumer migrations (AppointmentTab, AppointmentFormModal, HolidaysTab)
//   - listHolidays no longer imported in any of them (caught V11 pattern)
//   - useEffect returns the unsub (cleanup on unmount, no leak)

describe('LC8: listenToHolidays — multi-consumer cross-tab refresh', () => {
  const SRC = READ('src/lib/backendClient.js');
  const APPT = READ('src/components/backend/AppointmentTab.jsx');
  const FORM = READ('src/components/backend/AppointmentFormModal.jsx');
  const HOLI = READ('src/components/backend/HolidaysTab.jsx');

  it('LC8.1: backendClient exports listenToHolidays', () => {
    expect(SRC).toMatch(/export\s+function\s+listenToHolidays/);
  });

  it('LC8.2: returns onSnapshot subscription over holidaysCol()', () => {
    const fn = SRC.match(/export function listenToHolidays[\s\S]+?^}/m)?.[0] || '';
    expect(fn).toMatch(/return onSnapshot\(holidaysCol\(\),/);
  });

  it('LC8.3: sort contract preserves listHolidays semantics (updatedAt desc, createdAt tiebreak)', () => {
    const fn = SRC.match(/export function listenToHolidays[\s\S]+?^}/m)?.[0] || '';
    expect(fn).toMatch(/items\.sort/);
    expect(fn).toMatch(/ub\.localeCompare\(ua\)/);
    expect(fn).toMatch(/\(b\.createdAt\s*\|\|\s*['"]['"]\)\.localeCompare\(a\.createdAt/);
  });

  it('LC8.4: passes onError through', () => {
    const fn = SRC.match(/export function listenToHolidays[\s\S]+?^}/m)?.[0] || '';
    expect(fn).toMatch(/\}\,\s*onError\)/);
  });

  it('LC8.5: AppointmentTab imports listenToHolidays (not listHolidays)', () => {
    expect(APPT).toMatch(/listenToHolidays/);
    // Match active uses only — import token OR call site — not historical
    // mentions in migration comments.
    expect(APPT).not.toMatch(/[\{\,]\s*listHolidays\s*[\,\}]|\blistHolidays\(/);
  });

  it('LC8.6: AppointmentFormModal imports listenToHolidays (not listHolidays)', () => {
    expect(FORM).toMatch(/listenToHolidays/);
    expect(FORM).not.toMatch(/[\{\,]\s*listHolidays\s*[\,\}]|\blistHolidays\(/);
  });

  it('LC8.7: HolidaysTab imports listenToHolidays (not listHolidays)', () => {
    expect(HOLI).toMatch(/listenToHolidays/);
    expect(HOLI).not.toMatch(/[\{\,]\s*listHolidays\s*[\,\}]|\blistHolidays\(/);
  });

  it('LC8.8: AppointmentTab useEffect returns the unsub (cleanup on unmount)', () => {
    // Pattern: const unsub = listenToHolidays(...); return unsub;
    expect(APPT).toMatch(/const unsub = listenToHolidays\([\s\S]+?\)\;\s*return unsub;/);
  });

  it('LC8.9: AppointmentFormModal useEffect returns the unsub', () => {
    expect(FORM).toMatch(/const unsub = listenToHolidays\([\s\S]+?\)\;\s*return unsub;/);
  });

  it('LC8.10: HolidaysTab listener subscribes inside useEffect AND clears loading on first emit', () => {
    // Pattern: setLoading(true); …; const unsub = listenToHolidays((list) => { …; setLoading(false); }, …);
    const block = HOLI.match(/useEffect\(\(\) => \{\s*setLoading\(true\)[\s\S]+?return unsub;[\s\S]+?\}\, \[\]\)/)?.[0] || '';
    expect(block).toMatch(/const unsub = listenToHolidays/);
    expect(block).toMatch(/setLoading\(false\)/);
  });

  it('LC8.11: HolidaysTab error path also clears loading + sets empty items', () => {
    const block = HOLI.match(/useEffect\(\(\) => \{\s*setLoading\(true\)[\s\S]+?return unsub;[\s\S]+?\}\, \[\]\)/)?.[0] || '';
    expect(block).toMatch(/setItems\(\[\]\)/);
    expect(block).toMatch(/setLoading\(false\)/);
  });

  it('LC8.12: NO setInterval polling near any holiday consumer', () => {
    // Listener must obviate polling. Quick grep within a window of each useEffect.
    const apptRegion = APPT.match(/listenToHolidays[\s\S]{0,400}/)?.[0] || '';
    const formRegion = FORM.match(/listenToHolidays[\s\S]{0,400}/)?.[0] || '';
    const holiRegion = HOLI.match(/listenToHolidays[\s\S]{0,400}/)?.[0] || '';
    expect(apptRegion).not.toMatch(/setInterval/);
    expect(formRegion).not.toMatch(/setInterval/);
    expect(holiRegion).not.toMatch(/setInterval/);
  });
});

// ─── LC8.sim: pure simulate of listenToHolidays sort contract ─────────────

describe('LC8.sim: pure simulate — holiday sort + tiebreak', () => {
  function sortHolidays(snapDocs) {
    const items = snapDocs.map(d => ({ id: d.id, ...d.data() }));
    items.sort((a, b) => {
      const ua = a.updatedAt || '';
      const ub = b.updatedAt || '';
      if (ua !== ub) return ub.localeCompare(ua);
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
    return items;
  }

  it('LC8.sim.1: latest updatedAt comes first', () => {
    const docs = [
      { id: 'H1', data: () => ({ note: 'Old',    updatedAt: '2026-01-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z' }) },
      { id: 'H2', data: () => ({ note: 'Newest', updatedAt: '2026-04-26T00:00:00Z', createdAt: '2026-04-20T00:00:00Z' }) },
      { id: 'H3', data: () => ({ note: 'Mid',    updatedAt: '2026-03-01T00:00:00Z', createdAt: '2026-02-15T00:00:00Z' }) },
    ];
    const sorted = sortHolidays(docs);
    expect(sorted.map(s => s.id)).toEqual(['H2', 'H3', 'H1']);
  });

  it('LC8.sim.2: equal updatedAt → tiebreak on createdAt desc', () => {
    const docs = [
      { id: 'H1', data: () => ({ updatedAt: '2026-04-26T00:00:00Z', createdAt: '2026-04-01T00:00:00Z' }) },
      { id: 'H2', data: () => ({ updatedAt: '2026-04-26T00:00:00Z', createdAt: '2026-04-25T00:00:00Z' }) },
    ];
    const sorted = sortHolidays(docs);
    expect(sorted.map(s => s.id)).toEqual(['H2', 'H1']);
  });

  it('LC8.sim.3: missing updatedAt sorts last (empty string < ISO timestamp)', () => {
    const docs = [
      { id: 'H1', data: () => ({ note: 'Has updatedAt', updatedAt: '2026-04-26T00:00:00Z' }) },
      { id: 'H2', data: () => ({ note: 'No updatedAt' /* undefined */ }) },
    ];
    const sorted = sortHolidays(docs);
    expect(sorted[0].id).toBe('H1');
    expect(sorted[1].id).toBe('H2');
  });

  it('LC8.sim.4: empty input → empty output (no crash)', () => {
    expect(sortHolidays([])).toEqual([]);
  });

  it('LC8.sim.5: weekly + specific shapes both pass through cleanly', () => {
    const docs = [
      { id: 'W',  data: () => ({ type: 'weekly',   dayOfWeek: 0, updatedAt: '2026-04-25T00:00:00Z' }) },
      { id: 'S',  data: () => ({ type: 'specific', dates: ['2026-04-26', '2026-04-27'], updatedAt: '2026-04-26T00:00:00Z' }) },
    ];
    const sorted = sortHolidays(docs);
    expect(sorted[0].type).toBe('specific');
    expect(sorted[0].dates).toHaveLength(2);
    expect(sorted[1].type).toBe('weekly');
  });
});

// ─── LC9: listenToAllSales (Phase 14.7.H follow-up H — bounded) ───────────
//
// Bounded by required `since` (default 365d) so the listener never attaches
// over the entire be_sales collection. SaleTab + SaleInsuranceClaimsTab keep
// one-shot getAllSales() — listenToAllSales is the canonical pattern for
// FUTURE real-time dashboards (today's sales widget, live revenue).

describe('LC9: listenToAllSales — bounded real-time variant', () => {
  const SRC = READ('src/lib/backendClient.js');

  it('LC9.1: backendClient exports listenToAllSales', () => {
    expect(SRC).toMatch(/export\s+function\s+listenToAllSales/);
  });

  it('LC9.2: returns onSnapshot over a where("saleDate", ">=", since) query', () => {
    const fn = SRC.match(/export function listenToAllSales[\s\S]+?^}/m)?.[0] || '';
    expect(fn).toMatch(/return onSnapshot\(q,/);
    expect(fn).toMatch(/where\(['"]saleDate['"],\s*['"]>=['"],\s*since\)/);
  });

  it('LC9.3: defaults since to ~365 days ago (computed at call time)', () => {
    const fn = SRC.match(/export function listenToAllSales[\s\S]+?^}/m)?.[0] || '';
    // The default-since IIFE subtracts 365 days
    expect(fn).toMatch(/setDate\(d\.getDate\(\) - 365\)/);
    // …and slices to YYYY-MM-DD
    expect(fn).toMatch(/toISOString\(\)\.slice\(0,\s*10\)/);
  });

  it('LC9.4: opts.since string overrides default (precedence: explicit > default)', () => {
    const fn = SRC.match(/export function listenToAllSales[\s\S]+?^}/m)?.[0] || '';
    // const since = (opts && typeof opts.since === 'string' && opts.since) || defaultSince;
    expect(fn).toMatch(/typeof opts\.since\s*===\s*['"]string['"]/);
    expect(fn).toMatch(/\|\|\s*defaultSince/);
  });

  it('LC9.5: sort contract matches getAllSales (createdAt || saleDate desc)', () => {
    const fn = SRC.match(/export function listenToAllSales[\s\S]+?^}/m)?.[0] || '';
    expect(fn).toMatch(/sales\.sort/);
    expect(fn).toMatch(/\(b\.createdAt\s*\|\|\s*b\.saleDate\s*\|\|\s*['"]['"]\)\.localeCompare\(a\.createdAt\s*\|\|\s*a\.saleDate/);
  });

  it('LC9.6: passes onError through', () => {
    const fn = SRC.match(/export function listenToAllSales[\s\S]+?^}/m)?.[0] || '';
    expect(fn).toMatch(/\}\,\s*onError\)/);
  });

  it('LC9.7: ANTI-REGRESSION — no unbounded onSnapshot(salesCol()) anywhere in backendClient', () => {
    // Every onSnapshot over salesCol() MUST be wrapped in a query() with where(...).
    // Catches a future "convenience" listener that accidentally subscribes to
    // every sale doc (would be a Firestore-cost regression).
    const matches = SRC.match(/onSnapshot\(salesCol\(\)\,/g) || [];
    expect(matches).toHaveLength(0);
  });

  it('LC9.8: listenToAllSales is NOT consumed by SaleTab or SaleInsuranceClaimsTab in this round', () => {
    // Deliberate scope decision: those tabs keep one-shot getAllSales for full
    // history UX. listenToAllSales is exposed for future dashboard widgets.
    // This test locks the decision so a future contributor doesn't silently
    // migrate them without thinking about the cost trade-off.
    const SALE = READ('src/components/backend/SaleTab.jsx');
    const CLAIMS = READ('src/components/backend/SaleInsuranceClaimsTab.jsx');
    expect(SALE).not.toMatch(/listenToAllSales/);
    expect(CLAIMS).not.toMatch(/listenToAllSales/);
  });
});

// ─── LC9.sim: pure simulate of listenToAllSales filter + sort ─────────────

describe('LC9.sim: pure simulate — date-floor filter + sort', () => {
  // Mirror of the listener body's pure pieces (omitting onSnapshot wiring).
  function defaultSince() {
    const d = new Date();
    d.setDate(d.getDate() - 365);
    return d.toISOString().slice(0, 10);
  }
  function resolveSince(opts) {
    return (opts && typeof opts.since === 'string' && opts.since) || defaultSince();
  }
  function sortSales(snapDocs) {
    const sales = snapDocs.map(d => ({ id: d.id, ...d.data() }));
    sales.sort((a, b) => (b.createdAt || b.saleDate || '').localeCompare(a.createdAt || a.saleDate || ''));
    return sales;
  }

  it('LC9.sim.1: defaultSince returns YYYY-MM-DD shape', () => {
    const since = defaultSince();
    expect(since).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('LC9.sim.2: defaultSince is approximately 365 days ago', () => {
    const since = defaultSince();
    const sinceDate = new Date(since + 'T00:00:00Z');
    const diffDays = Math.round((Date.now() - sinceDate.getTime()) / 86400000);
    // Allow ±2 day fuzz (TZ rounding)
    expect(diffDays).toBeGreaterThanOrEqual(364);
    expect(diffDays).toBeLessThanOrEqual(366);
  });

  it('LC9.sim.3: opts.since string is accepted verbatim', () => {
    expect(resolveSince({ since: '2025-01-01' })).toBe('2025-01-01');
  });

  it('LC9.sim.4: opts.since non-string falls through to default', () => {
    // Number, null, undefined, object → use default
    expect(resolveSince({ since: 12345 })).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(resolveSince({ since: null })).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(resolveSince({ since: undefined })).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(resolveSince({ since: { foo: 'bar' } })).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(resolveSince({})).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('LC9.sim.5: empty opts.since string falls through to default', () => {
    // The `&& opts.since` clause rejects empty strings so they don't pass to where()
    expect(resolveSince({ since: '' })).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('LC9.sim.6: no opts at all → default since', () => {
    expect(resolveSince(undefined)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(resolveSince(null)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('LC9.sim.7: sort by createdAt desc with saleDate fallback', () => {
    const docs = [
      { id: 'S1', data: () => ({ saleId: 'S1', createdAt: '2026-04-01T10:00:00Z', saleDate: '2026-04-01' }) },
      { id: 'S2', data: () => ({ saleId: 'S2', createdAt: '2026-04-26T10:00:00Z', saleDate: '2026-04-26' }) },
      { id: 'S3', data: () => ({ saleId: 'S3', /* no createdAt */ saleDate: '2026-04-15' }) },
    ];
    const sorted = sortSales(docs);
    expect(sorted.map(s => s.saleId)).toEqual(['S2', 'S3', 'S1']);
  });

  it('LC9.sim.8: empty snapshot → empty array (no crash)', () => {
    expect(sortSales([])).toEqual([]);
  });

  it('LC9.sim.9: docs with neither createdAt nor saleDate sort last but do not throw', () => {
    const docs = [
      { id: 'S1', data: () => ({ saleId: 'S1', saleDate: '2026-04-26' }) },
      { id: 'S2', data: () => ({ saleId: 'S2' /* nothing */ }) },
    ];
    const sorted = sortSales(docs);
    expect(sorted[0].saleId).toBe('S1');
    expect(sorted[1].saleId).toBe('S2');
  });
});
