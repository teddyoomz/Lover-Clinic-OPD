# V64 Appointment Coming-Hub View — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 4-tab (วันนี้/พรุ่งนี้/ล่วงหน้า 30 วัน/ย้อนหลัง 30 วัน) appointment hub view at the top of `/admin` `adminMode==='appointment'` that mirrors ProClinic's `/admin/appointment/coming` UX, with a `[รายการ] [ปฏิทิน]` toggle preserving the existing calendar.

**Architecture:** 7 NEW source files (3 lib helpers + 4 React components + 1 orchestrator) + 5 NEW test files + 1 surgical modification to `AdminDashboard.jsx`. TWO new backend helpers (`getAppointmentsByDateRange` + `getWalletsForCustomerIds`). Single-load aggregation strategy (Q3=C). All paths BSA-compliant via `scopedDataLayer.js`. PDF print via direct html2canvas+jsPDF (V32 lock).

**Tech Stack:** React 19 + Vite 8 + Firebase 12 + Tailwind 3.4 + Vitest 4.1 + RTL + jsPDF + html2canvas. Existing patterns: `useSelectedBranch`, `useBranchAwareListener`, `useEffectiveClinicSettings`, `scopedDataLayer.js` BSA Layer 2, V63 `derivedDoctorDaysAcrossWindow`.

**Spec:** [`docs/superpowers/specs/2026-05-08-appointment-coming-hub-design.md`](../specs/2026-05-08-appointment-coming-hub-design.md)

---

### Task 1: NEW backend helper `getAppointmentsByDateRange`

**Files:**
- Modify: `src/lib/backendClient.js` (add export at end of "Appointments" section, around line 2400)
- Modify: `src/lib/scopedDataLayer.js` (add `_autoInject` re-export)
- Test: `tests/v64-get-appointments-by-date-range.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/v64-get-appointments-by-date-range.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Firestore at module level
const mockGetDocs = vi.fn();
const mockQuery = vi.fn((...args) => ({ __mocked: true, args }));
const mockWhere = vi.fn((field, op, val) => ({ field, op, val }));
const mockCollection = vi.fn();
vi.mock('firebase/firestore', () => ({
  collection: (...args) => mockCollection(...args),
  query: (...args) => mockQuery(...args),
  where: (...args) => mockWhere(...args),
  getDocs: (...args) => mockGetDocs(...args),
  documentId: () => '__name__',
  Timestamp: { fromDate: (d) => ({ __ts: d.getTime() }) },
}));

vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test-app' }));

// Mock branchSelection — returns 'BR-A' by default
vi.mock('../src/lib/branchSelection.js', () => ({
  resolveSelectedBranchId: () => 'BR-A',
}));

import { getAppointmentsByDateRange } from '../src/lib/backendClient.js';

describe('V64.B1 getAppointmentsByDateRange — branch-scope safe-by-default (V54 BS-13 mirror)', () => {
  beforeEach(() => {
    mockGetDocs.mockReset();
    mockWhere.mockClear();
    mockGetDocs.mockResolvedValue({ docs: [] });
  });

  it('B1.1 explicit branchId is honored', async () => {
    await getAppointmentsByDateRange({ from: '2026-05-01', to: '2026-05-31', branchId: 'BR-X' });
    expect(mockWhere).toHaveBeenCalledWith('branchId', '==', 'BR-X');
    expect(mockWhere).toHaveBeenCalledWith('date', '>=', '2026-05-01');
    expect(mockWhere).toHaveBeenCalledWith('date', '<=', '2026-05-31');
  });

  it('B1.2 falsy branchId resolves via resolveSelectedBranchId', async () => {
    await getAppointmentsByDateRange({ from: '2026-05-01', to: '2026-05-31' });
    expect(mockWhere).toHaveBeenCalledWith('branchId', '==', 'BR-A');
  });

  it('B1.3 allBranches:true skips branchId filter', async () => {
    await getAppointmentsByDateRange({ from: '2026-05-01', to: '2026-05-31', allBranches: true });
    const branchClauses = mockWhere.mock.calls.filter(c => c[0] === 'branchId');
    expect(branchClauses).toHaveLength(0);
  });

  it('B1.4 returns array of {id, ...data} from snapshot', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        { id: 'A1', data: () => ({ date: '2026-05-09', status: 'pending' }) },
        { id: 'A2', data: () => ({ date: '2026-05-10', status: 'confirmed' }) },
      ],
    });
    const out = await getAppointmentsByDateRange({ from: '2026-05-01', to: '2026-05-31', branchId: 'BR-X' });
    expect(out).toEqual([
      { id: 'A1', date: '2026-05-09', status: 'pending' },
      { id: 'A2', date: '2026-05-10', status: 'confirmed' },
    ]);
  });

  it('B1.5 missing from/to → throws', async () => {
    await expect(getAppointmentsByDateRange({ branchId: 'BR-X' })).rejects.toThrow(/from.*to/i);
  });

  it('B1.6 source-grep — function name + V54 marker comment present', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/lib/backendClient.js', 'utf8');
    expect(src).toMatch(/export\s+async\s+function\s+getAppointmentsByDateRange/);
    expect(src).toMatch(/V54.*BS-13|safe-by-default/i);
  });
});
```

- [ ] **Step 2: Run the test — verify FAIL**

Run: `npm test -- --run tests/v64-get-appointments-by-date-range.test.js`
Expected: FAIL with "getAppointmentsByDateRange is not a function" or "is not exported".

- [ ] **Step 3: Implement in `backendClient.js`**

Find the section near `getAppointmentsByMonth` (around line 2188-2280). Add this AFTER `listenToAppointmentsByMonth`:

```js
/**
 * V64 — Get appointments by date range (inclusive). Mirrors V54 BS-13
 * safe-by-default pattern used by getAppointmentsByMonth: when branchId is
 * falsy AND allBranches !== true, resolves via resolveSelectedBranchId();
 * if STILL falsy → returns []. Never falls through to whole-collection.
 *
 * @param {Object} opts
 * @param {string} opts.from        ISO date 'YYYY-MM-DD' (inclusive)
 * @param {string} opts.to          ISO date 'YYYY-MM-DD' (inclusive)
 * @param {string} [opts.branchId]  explicit branch ID; falsy → resolve from selection
 * @param {boolean} [opts.allBranches]  true → skip branchId filter (cross-branch reports)
 * @returns {Promise<Array<Object>>}
 */
export async function getAppointmentsByDateRange({ from, to, branchId = '', allBranches = false } = {}) {
  if (!from || !to) {
    throw new Error('getAppointmentsByDateRange: from and to are required (YYYY-MM-DD).');
  }
  // V54 BS-13 — safe-by-default
  const effectiveBranchId = (typeof branchId === 'string' && branchId)
    ? branchId
    : (allBranches ? null : resolveSelectedBranchId());
  if (!effectiveBranchId && !allBranches) return [];
  const useFilter = !allBranches && effectiveBranchId;

  const constraints = [
    where('date', '>=', String(from)),
    where('date', '<=', String(to)),
  ];
  if (useFilter) constraints.push(where('branchId', '==', String(effectiveBranchId)));
  const q = query(appointmentsCol(), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
```

If `resolveSelectedBranchId` is not yet imported in this file, add to the existing imports at the top:
```js
import { resolveSelectedBranchId } from './branchSelection.js';
```
(Likely already present since V54.)

- [ ] **Step 4: Re-export in `scopedDataLayer.js`**

Find the `_autoInject` block for appointments (around line 280-310 — search for `getAppointmentsByMonth`). Add immediately after:

```js
export const getAppointmentsByDateRange = _autoInject(() => raw.getAppointmentsByDateRange);
```

- [ ] **Step 5: Run the test — verify PASS**

Run: `npm test -- --run tests/v64-get-appointments-by-date-range.test.js`
Expected: PASS (6/6).

- [ ] **Step 6: Commit**

```bash
git add tests/v64-get-appointments-by-date-range.test.js src/lib/backendClient.js src/lib/scopedDataLayer.js
git commit -m "feat(V64 task1): getAppointmentsByDateRange — V54 BS-13 safe-by-default mirror"
```

---

### Task 2: NEW backend helper `getWalletsForCustomerIds`

**Files:**
- Modify: `src/lib/backendClient.js` (add in "Wallet" section, around line 4500)
- Modify: `src/lib/scopedDataLayer.js` (add universal pass-through export)
- Test: `tests/v64-get-wallets-for-customer-ids.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/v64-get-wallets-for-customer-ids.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetDocs = vi.fn();
const mockQuery = vi.fn((...args) => ({ args }));
const mockWhere = vi.fn((field, op, val) => ({ field, op, val }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: (...args) => mockQuery(...args),
  where: (...args) => mockWhere(...args),
  getDocs: (...args) => mockGetDocs(...args),
  documentId: () => '__name__',
}));
vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test-app' }));

import { getWalletsForCustomerIds } from '../src/lib/backendClient.js';

describe('V64.W1 getWalletsForCustomerIds — bulk fetch via in-query (≤30 chunks)', () => {
  beforeEach(() => {
    mockGetDocs.mockReset();
    mockWhere.mockClear();
  });

  it('W1.1 empty array returns empty array (no Firestore call)', async () => {
    const out = await getWalletsForCustomerIds([]);
    expect(out).toEqual([]);
    expect(mockGetDocs).not.toHaveBeenCalled();
  });

  it('W1.2 single customerId → one in-query chunk', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [{ id: 'C1', data: () => ({ balance: 100 }) }],
    });
    const out = await getWalletsForCustomerIds(['C1']);
    expect(out).toEqual([{ id: 'C1', balance: 100 }]);
    expect(mockWhere).toHaveBeenCalledWith('__name__', 'in', ['C1']);
  });

  it('W1.3 31 customerIds → 2 chunks (30 + 1)', async () => {
    const ids = Array.from({ length: 31 }, (_, i) => `C${i}`);
    mockGetDocs.mockResolvedValue({ docs: [] });
    await getWalletsForCustomerIds(ids);
    expect(mockGetDocs).toHaveBeenCalledTimes(2);
    const chunk1 = mockWhere.mock.calls.find(c => c[2] && c[2].length === 30);
    const chunk2 = mockWhere.mock.calls.find(c => c[2] && c[2].length === 1);
    expect(chunk1).toBeTruthy();
    expect(chunk2).toBeTruthy();
  });

  it('W1.4 chunks are flattened to a single output array', async () => {
    const ids = Array.from({ length: 31 }, (_, i) => `C${i}`);
    mockGetDocs
      .mockResolvedValueOnce({ docs: ids.slice(0, 30).map(id => ({ id, data: () => ({ balance: 1 }) })) })
      .mockResolvedValueOnce({ docs: [{ id: 'C30', data: () => ({ balance: 2 }) }] });
    const out = await getWalletsForCustomerIds(ids);
    expect(out).toHaveLength(31);
  });

  it('W1.5 deduplicates input customerIds before chunking', async () => {
    mockGetDocs.mockResolvedValue({ docs: [] });
    await getWalletsForCustomerIds(['C1', 'C1', 'C2']);
    const inClause = mockWhere.mock.calls.find(c => c[1] === 'in');
    expect(inClause[2]).toEqual(expect.arrayContaining(['C1', 'C2']));
    expect(inClause[2]).toHaveLength(2);
  });

  it('W1.6 source-grep — function exported + V64 marker', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/lib/backendClient.js', 'utf8');
    expect(src).toMatch(/export\s+async\s+function\s+getWalletsForCustomerIds/);
    expect(src).toMatch(/V64/);
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

Run: `npm test -- --run tests/v64-get-wallets-for-customer-ids.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `backendClient.js`, near the wallet helpers (search for `getCustomerWallets`):

```js
/**
 * V64 — bulk fetch wallets for many customerIds. Chunks input into
 * groups of 30 (Firestore 'in' query cap) and Promise.all's the chunks.
 * Deduplicates input. Universal (no branchId — wallets are customer-attached).
 *
 * @param {Array<string>} customerIds
 * @returns {Promise<Array<Object>>}
 */
export async function getWalletsForCustomerIds(customerIds = []) {
  const ids = [...new Set((Array.isArray(customerIds) ? customerIds : []).filter(Boolean).map(String))];
  if (ids.length === 0) return [];
  const CHUNK = 30;
  const chunks = [];
  for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
  const snaps = await Promise.all(
    chunks.map(chunk =>
      getDocs(query(walletsCol(), where(documentId(), 'in', chunk)))
    )
  );
  return snaps.flatMap(s => s.docs.map(d => ({ id: d.id, ...d.data() })));
}
```

If `walletsCol()` is not already defined in this file (search for it), use the canonical pattern:
```js
const walletsCol = () => collection(db, `artifacts/${appId}/public/data/be_wallets`);
```

If `documentId` is not imported, add to the firestore imports:
```js
import { ..., documentId } from 'firebase/firestore';
```

- [ ] **Step 4: Re-export in `scopedDataLayer.js`**

Find the wallet section (around line 251). Add:

```js
export const getWalletsForCustomerIds = (...args) => raw.getWalletsForCustomerIds(...args);
```

(Universal pass-through — no branchId injection.)

- [ ] **Step 5: Run — verify PASS**

Run: `npm test -- --run tests/v64-get-wallets-for-customer-ids.test.js`
Expected: PASS (6/6).

- [ ] **Step 6: Commit**

```bash
git add tests/v64-get-wallets-for-customer-ids.test.js src/lib/backendClient.js src/lib/scopedDataLayer.js
git commit -m "feat(V64 task2): getWalletsForCustomerIds — bulk fetch via in-query chunks"
```

---

### Task 3: Pure helper `appointmentHubFilters.js`

**Files:**
- Create: `src/lib/appointmentHubFilters.js`
- Test: `tests/v64-appointment-hub-filters.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/v64-appointment-hub-filters.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  dateRangeForTab,
  defaultStatusFilterForTab,
  applyTabFilter,
  isMissedAppointment,
  matchesSearchText,
} from '../src/lib/appointmentHubFilters.js';

const FIXED_NOW = new Date('2026-05-08T07:00:00+07:00'); // Bangkok 14:00

describe('V64.F dateRangeForTab', () => {
  it('F1.1 today → from==to==today ISO', () => {
    expect(dateRangeForTab('today', FIXED_NOW)).toEqual({ from: '2026-05-08', to: '2026-05-08' });
  });
  it('F1.2 tomorrow → today+1', () => {
    expect(dateRangeForTab('tomorrow', FIXED_NOW)).toEqual({ from: '2026-05-09', to: '2026-05-09' });
  });
  it('F1.3 future → today+1..today+30', () => {
    expect(dateRangeForTab('future', FIXED_NOW)).toEqual({ from: '2026-05-09', to: '2026-06-07' });
  });
  it('F1.4 past → today-30..today-1', () => {
    expect(dateRangeForTab('past', FIXED_NOW)).toEqual({ from: '2026-04-08', to: '2026-05-07' });
  });
  it('F1.5 unknown tab throws', () => {
    expect(() => dateRangeForTab('xxx', FIXED_NOW)).toThrow(/unknown tab/i);
  });
});

describe('V64.F defaultStatusFilterForTab', () => {
  it('F2.1 today/tomorrow exclude cancelled', () => {
    expect(defaultStatusFilterForTab('today')).toEqual({ exclude: ['cancelled'] });
    expect(defaultStatusFilterForTab('tomorrow')).toEqual({ exclude: ['cancelled'] });
  });
  it('F2.2 future excludes done + cancelled', () => {
    expect(defaultStatusFilterForTab('future')).toEqual({ exclude: ['done', 'cancelled'] });
  });
  it('F2.3 past — all statuses', () => {
    expect(defaultStatusFilterForTab('past')).toEqual({ exclude: [] });
  });
});

describe('V64.F applyTabFilter — combines date + status + search + type', () => {
  const APPTS = [
    { id: 'A1', date: '2026-05-08', status: 'pending', appointmentType: 'follow', customerName: 'Alice', customerHN: 'HN001', customerPhone: '0811111111' },
    { id: 'A2', date: '2026-05-08', status: 'cancelled', appointmentType: 'sale', customerName: 'Bob', customerHN: 'HN002', customerPhone: '0822222222' },
    { id: 'A3', date: '2026-05-09', status: 'confirmed', appointmentType: 'follow', customerName: 'Charlie', customerHN: 'HN003', customerPhone: '0833333333' },
    { id: 'A4', date: '2026-04-15', status: 'confirmed', appointmentType: 'follow', customerName: 'Dave', customerHN: 'HN004', customerPhone: '0844444444' },
  ];

  it('F3.1 today tab default → A1 only (A2 excluded by status; A3+A4 excluded by date)', () => {
    expect(applyTabFilter(APPTS, { tab: 'today', now: FIXED_NOW }).map(a => a.id)).toEqual(['A1']);
  });
  it('F3.2 past tab default → A4 only (others outside window or future-dated)', () => {
    expect(applyTabFilter(APPTS, { tab: 'past', now: FIXED_NOW }).map(a => a.id)).toEqual(['A4']);
  });
  it('F3.3 status override on today tab — show cancelled', () => {
    const out = applyTabFilter(APPTS, { tab: 'today', now: FIXED_NOW, statusOverride: 'cancelled' });
    expect(out.map(a => a.id)).toEqual(['A2']);
  });
  it('F3.4 search by phone substring', () => {
    const out = applyTabFilter(APPTS, { tab: 'today', now: FIXED_NOW, search: '0811' });
    expect(out.map(a => a.id)).toEqual(['A1']);
  });
  it('F3.5 search by HN', () => {
    const out = applyTabFilter(APPTS, { tab: 'today', now: FIXED_NOW, search: 'HN001' });
    expect(out.map(a => a.id)).toEqual(['A1']);
  });
  it('F3.6 search case-insensitive on name', () => {
    const out = applyTabFilter(APPTS, { tab: 'today', now: FIXED_NOW, search: 'alice' });
    expect(out.map(a => a.id)).toEqual(['A1']);
  });
  it('F3.7 type filter narrows to appointmentType', () => {
    const out = applyTabFilter(APPTS, { tab: 'past', now: FIXED_NOW, statusOverride: '__all__', typeFilter: 'follow' });
    expect(out.map(a => a.id)).toEqual(['A4']);
  });
});

describe('V64.F isMissedAppointment', () => {
  it('F4.1 status==confirmed AND date<today → true', () => {
    expect(isMissedAppointment({ status: 'confirmed', date: '2026-05-07' }, FIXED_NOW)).toBe(true);
  });
  it('F4.2 status==confirmed AND date==today → false', () => {
    expect(isMissedAppointment({ status: 'confirmed', date: '2026-05-08' }, FIXED_NOW)).toBe(false);
  });
  it('F4.3 status==done → false (already treated)', () => {
    expect(isMissedAppointment({ status: 'done', date: '2026-05-07' }, FIXED_NOW)).toBe(false);
  });
  it('F4.4 status==pending past date → false (admin never confirmed)', () => {
    expect(isMissedAppointment({ status: 'pending', date: '2026-05-07' }, FIXED_NOW)).toBe(false);
  });
});

describe('V64.F matchesSearchText — adversarial', () => {
  const APPT = { customerName: 'นาย ทดสอบ', customerHN: 'HN066', customerPhone: '0655529999' };
  it('F5.1 empty search → match', () => expect(matchesSearchText(APPT, '')).toBe(true));
  it('F5.2 thai partial match', () => expect(matchesSearchText(APPT, 'ทดสอบ')).toBe(true));
  it('F5.3 whitespace-only search → match', () => expect(matchesSearchText(APPT, '   ')).toBe(true));
  it('F5.4 no field present (corrupted row)', () => expect(matchesSearchText({}, 'x')).toBe(false));
});

describe('V64.F Bangkok TZ midday-UTC parse (V53 BS-12 mirror)', () => {
  it('F6.1 day boundary at midnight Bangkok stays in current day', () => {
    const midnight = new Date('2026-05-08T00:00:00+07:00');
    expect(dateRangeForTab('today', midnight)).toEqual({ from: '2026-05-08', to: '2026-05-08' });
  });
  it('F6.2 23:59 Bangkok stays in current day', () => {
    const lateNight = new Date('2026-05-08T23:59:00+07:00');
    expect(dateRangeForTab('today', lateNight)).toEqual({ from: '2026-05-08', to: '2026-05-08' });
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

Run: `npm test -- --run tests/v64-appointment-hub-filters.test.js`
Expected: FAIL with "Cannot find module ../src/lib/appointmentHubFilters.js".

- [ ] **Step 3: Implement**

Create `src/lib/appointmentHubFilters.js`:

```js
// V64 — appointment hub per-tab filter helpers (pure JS).
// Q4=A: smart per-tab defaults + missed-inference + dropdown override.
// Bangkok TZ stable via midday-UTC parse pattern (V53 BS-12).

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

function bangkokYearMonthDay(d) {
  const ms = d.getTime() + BANGKOK_OFFSET_MS;
  const u = new Date(ms);
  const y = u.getUTCFullYear();
  const m = String(u.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(u.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function addDaysISO(isoYMD, delta) {
  // midday-UTC parse so day-of-week + adds stay stable
  const [y, m, d] = isoYMD.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d + delta, 12, 0, 0);
  return bangkokYearMonthDay(new Date(t - BANGKOK_OFFSET_MS));
}

export function dateRangeForTab(tabKey, now = new Date()) {
  const today = bangkokYearMonthDay(now);
  switch (tabKey) {
    case 'today':    return { from: today, to: today };
    case 'tomorrow': { const t = addDaysISO(today, 1); return { from: t, to: t }; }
    case 'future':   return { from: addDaysISO(today, 1), to: addDaysISO(today, 30) };
    case 'past':     return { from: addDaysISO(today, -30), to: addDaysISO(today, -1) };
    default: throw new Error(`Unknown tab: ${tabKey}`);
  }
}

export function defaultStatusFilterForTab(tabKey) {
  switch (tabKey) {
    case 'today':
    case 'tomorrow': return { exclude: ['cancelled'] };
    case 'future':   return { exclude: ['done', 'cancelled'] };
    case 'past':     return { exclude: [] };
    default: return { exclude: [] };
  }
}

export function isMissedAppointment(appt, now = new Date()) {
  if (!appt || appt.status !== 'confirmed') return false;
  const today = bangkokYearMonthDay(now);
  return typeof appt.date === 'string' && appt.date < today;
}

export function matchesSearchText(appt, searchRaw) {
  const search = String(searchRaw || '').trim().toLowerCase();
  if (!search) return true;
  const haystack = [
    appt?.customerName,
    appt?.customerHN,
    appt?.customerPhone,
    appt?.doctorName,
    appt?.assistantName,
  ].filter(Boolean).map(String).join(' ').toLowerCase();
  return haystack.includes(search);
}

/**
 * Apply combined tab + status + search + type filter.
 * @param {Array} appts
 * @param {Object} opts
 * @param {string} opts.tab — 'today' | 'tomorrow' | 'future' | 'past'
 * @param {Date}   opts.now
 * @param {string} [opts.statusOverride] — if set, overrides the default exclude list. '__all__' = no status filter.
 * @param {string} [opts.search]
 * @param {string} [opts.typeFilter] — appointmentType exact match; falsy = no filter
 */
export function applyTabFilter(appts, { tab, now = new Date(), statusOverride, search = '', typeFilter = '' } = {}) {
  const range = dateRangeForTab(tab, now);
  const defaultStatus = defaultStatusFilterForTab(tab);
  return (appts || []).filter(a => {
    if (typeof a?.date !== 'string') return false;
    if (a.date < range.from || a.date > range.to) return false;
    // Status filter
    if (statusOverride && statusOverride !== '__all__') {
      if (a.status !== statusOverride) return false;
    } else if (defaultStatus.exclude.includes(a.status)) {
      return false;
    }
    // Type filter
    if (typeFilter && a.appointmentType !== typeFilter) return false;
    // Search
    if (!matchesSearchText(a, search)) return false;
    return true;
  });
}
```

- [ ] **Step 4: Run — verify PASS**

Run: `npm test -- --run tests/v64-appointment-hub-filters.test.js`
Expected: PASS (28/28).

- [ ] **Step 5: Commit**

```bash
git add tests/v64-appointment-hub-filters.test.js src/lib/appointmentHubFilters.js
git commit -m "feat(V64 task3): appointmentHubFilters — pure per-tab predicates + missed-inference"
```

---

### Task 4: Pure helper `appointmentHubAggregator.js`

**Files:**
- Create: `src/lib/appointmentHubAggregator.js`
- Test: `tests/v64-appointment-hub-aggregator.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/v64-appointment-hub-aggregator.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildCustomerSummaryMap } from '../src/lib/appointmentHubAggregator.js';

const FIXED_NOW = new Date('2026-05-08T07:00:00+07:00');

describe('V64.A buildCustomerSummaryMap — single-load aggregation (Q3=C)', () => {
  it('A1.1 empty inputs → empty Map', () => {
    expect(buildCustomerSummaryMap({ customers: [], deposits: [], sales: [], memberships: [], wallets: [], now: FIXED_NOW }).size).toBe(0);
  });

  it('A1.2 single customer with all fields populated', () => {
    const m = buildCustomerSummaryMap({
      customers: [{ id: 'C1', hn: 'HN001', patientData: { firstName: 'Alice', gender: 'F', phone: '0811111111', customerType2: 'VIP' } }],
      deposits: [{ id: 'D1', customerId: 'C1', amount: 5000, status: 'active' }, { id: 'D2', customerId: 'C1', amount: 3000, status: 'active' }],
      sales: [
        { id: 'S1', customerId: 'C1', totalAmount: 10000, totalRemaining: 0, paymentStatus: 'paid' },
        { id: 'S2', customerId: 'C1', totalAmount: 5000, totalRemaining: 1500, paymentStatus: 'partial' },
      ],
      memberships: [{ id: 'M1', customerId: 'C1', tier: 'GOLD', expiresAt: '2027-04-13', status: 'active' }],
      // V64 schema: composite doc id `${customerId}__${walletTypeId}`; customerId field carries the link
      wallets: [
        { id: 'C1__cash',   customerId: 'C1', balance: 9000,  walletTypeId: 'cash'   },
        { id: 'C1__points', customerId: 'C1', balance: 3000,  walletTypeId: 'points' },
      ],
      now: FIXED_NOW,
    });
    const s = m.get('C1');
    expect(s.hn).toBe('HN001');
    expect(s.name).toBe('Alice');
    expect(s.gender).toBe('F');
    expect(s.phone).toBe('0811111111');
    expect(s.customerType).toBe('VIP');
    expect(s.activeDepositTotal).toBe(8000);
    expect(s.outstandingTotal).toBe(1500);
    expect(s.lifetimeSaleTotal).toBe(15000);
    expect(s.membershipTier).toBe('GOLD');
    expect(s.membershipDaysLeft).toBeGreaterThan(330);  // ~340
    expect(s.membershipDaysLeft).toBeLessThan(345);
    expect(s.walletBalance).toBe(12000);
  });

  it('A1.3 customer with no membership → tier="" days=0', () => {
    const m = buildCustomerSummaryMap({
      customers: [{ id: 'C1', hn: 'HN001', patientData: { firstName: 'Bob' } }],
      deposits: [], sales: [], memberships: [], wallets: [], now: FIXED_NOW,
    });
    expect(m.get('C1').membershipTier).toBe('');
    expect(m.get('C1').membershipDaysLeft).toBe(0);
  });

  it('A1.4 expired membership → tier="" days=0', () => {
    const m = buildCustomerSummaryMap({
      customers: [{ id: 'C1', hn: 'HN001', patientData: { firstName: 'Bob' } }],
      memberships: [{ id: 'M1', customerId: 'C1', tier: 'GOLD', expiresAt: '2025-01-01', status: 'active' }],
      deposits: [], sales: [], wallets: [], now: FIXED_NOW,
    });
    expect(m.get('C1').membershipTier).toBe('');
    expect(m.get('C1').membershipDaysLeft).toBe(0);
  });

  it('A1.5 deposit-status filter — only active counted', () => {
    const m = buildCustomerSummaryMap({
      customers: [{ id: 'C1' }],
      deposits: [
        { customerId: 'C1', amount: 1000, status: 'active' },
        { customerId: 'C1', amount: 5000, status: 'used' },
        { customerId: 'C1', amount: 2000, status: 'cancelled' },
      ],
      sales: [], memberships: [], wallets: [], now: FIXED_NOW,
    });
    expect(m.get('C1').activeDepositTotal).toBe(1000);
  });

  it('A1.6 outstanding sums totalRemaining where paymentStatus !== paid', () => {
    const m = buildCustomerSummaryMap({
      customers: [{ id: 'C1' }],
      sales: [
        { customerId: 'C1', totalAmount: 1000, totalRemaining: 0, paymentStatus: 'paid' },
        { customerId: 'C1', totalAmount: 2000, totalRemaining: 500, paymentStatus: 'partial' },
        { customerId: 'C1', totalAmount: 3000, totalRemaining: 3000, paymentStatus: 'unpaid' },
      ],
      deposits: [], memberships: [], wallets: [], now: FIXED_NOW,
    });
    expect(m.get('C1').outstandingTotal).toBe(3500);
    expect(m.get('C1').lifetimeSaleTotal).toBe(6000);
  });

  it('A1.7 lifetimeSaleTotal includes cancelled sales? Spec: include all by default', () => {
    const m = buildCustomerSummaryMap({
      customers: [{ id: 'C1' }],
      sales: [
        { customerId: 'C1', totalAmount: 1000, totalRemaining: 0, paymentStatus: 'paid' },
        { customerId: 'C1', totalAmount: 500, totalRemaining: 0, paymentStatus: 'cancelled', isVoid: true },
      ],
      deposits: [], memberships: [], wallets: [], now: FIXED_NOW,
    });
    // void sales excluded
    expect(m.get('C1').lifetimeSaleTotal).toBe(1000);
  });

  it('A1.8 multiple customers — independent', () => {
    const m = buildCustomerSummaryMap({
      customers: [{ id: 'C1' }, { id: 'C2' }],
      deposits: [
        { customerId: 'C1', amount: 100, status: 'active' },
        { customerId: 'C2', amount: 200, status: 'active' },
      ],
      sales: [], memberships: [], wallets: [], now: FIXED_NOW,
    });
    expect(m.get('C1').activeDepositTotal).toBe(100);
    expect(m.get('C2').activeDepositTotal).toBe(200);
  });

  it('A1.9 adversarial — null fields', () => {
    const m = buildCustomerSummaryMap({
      customers: [{ id: 'C1', patientData: null }],
      deposits: [{ customerId: 'C1', amount: null, status: 'active' }],
      sales: [{ customerId: 'C1', totalAmount: null, totalRemaining: null, paymentStatus: null }],
      memberships: [], wallets: [], now: FIXED_NOW,
    });
    const s = m.get('C1');
    expect(s.activeDepositTotal).toBe(0);
    expect(s.outstandingTotal).toBe(0);
    expect(s.lifetimeSaleTotal).toBe(0);
  });

  it('A1.10 idempotent — same inputs → same output', () => {
    const inputs = {
      customers: [{ id: 'C1', hn: 'HN001', patientData: { firstName: 'X' } }],
      deposits: [{ customerId: 'C1', amount: 100, status: 'active' }],
      sales: [], memberships: [], wallets: [],
      now: FIXED_NOW,
    };
    const m1 = buildCustomerSummaryMap(inputs);
    const m2 = buildCustomerSummaryMap(inputs);
    expect(JSON.stringify([...m1])).toBe(JSON.stringify([...m2]));
  });

  it('A1.11 branch-blind invariant (toString.grep — no branchId reference in helper body)', () => {
    expect(buildCustomerSummaryMap.toString()).not.toMatch(/branchId/);
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

Run: `npm test -- --run tests/v64-appointment-hub-aggregator.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/lib/appointmentHubAggregator.js`:

```js
// V64 — single-load aggregation (Q3=C). Pure JS; no Firestore.
// Builds a Map<customerId, summary> from already-fetched lists so per-card
// rendering is O(1).

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function daysBetween(fromISO, nowDate) {
  if (typeof fromISO !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(fromISO)) return 0;
  const [y, m, d] = fromISO.slice(0, 10).split('-').map(Number);
  const targetMs = Date.UTC(y, m - 1, d, 12, 0, 0);
  const nowMs = Date.UTC(
    nowDate.getUTCFullYear(),
    nowDate.getUTCMonth(),
    nowDate.getUTCDate(),
    12, 0, 0,
  );
  return Math.round((targetMs - nowMs) / (24 * 60 * 60 * 1000));
}

/**
 * Build per-customer summary map.
 *
 * @param {Object} args
 * @param {Array}  args.customers   list of be_customers docs
 * @param {Array}  args.deposits    list of be_deposits docs
 * @param {Array}  args.sales       list of be_sales docs
 * @param {Array}  args.memberships list of be_memberships docs
 * @param {Array}  args.wallets     list of be_wallets docs (one per customerId)
 * @param {Date}   args.now
 * @returns {Map<string, Object>}
 */
export function buildCustomerSummaryMap({ customers = [], deposits = [], sales = [], memberships = [], wallets = [], now } = {}) {
  const nowDate = now instanceof Date ? now : new Date();
  const out = new Map();

  // Index customers
  for (const c of customers) {
    const id = String(c?.id || '');
    if (!id) continue;
    const pd = c?.patientData || {};
    out.set(id, {
      hn: c?.hn || '',
      name: [pd.prefix, pd.firstName, pd.lastName].filter(Boolean).join(' ').trim() || pd.firstName || '',
      gender: pd.gender || '',
      phone: pd.phone || '',
      customerType: (pd.customerType2 || '').trim() || 'ลูกค้าทั่วไป',
      membershipTier: '',
      membershipDaysLeft: 0,
      walletBalance: 0,
      activeDepositTotal: 0,
      outstandingTotal: 0,
      lifetimeSaleTotal: 0,
    });
  }

  // Aggregate deposits
  for (const d of deposits) {
    if (d?.status !== 'active') continue;
    const id = String(d?.customerId || '');
    const summary = out.get(id);
    if (!summary) continue;
    summary.activeDepositTotal += safeNum(d.amount);
  }

  // Aggregate sales
  for (const s of sales) {
    if (s?.isVoid === true) continue;  // void sales excluded
    const id = String(s?.customerId || '');
    const summary = out.get(id);
    if (!summary) continue;
    summary.lifetimeSaleTotal += safeNum(s.totalAmount);
    if (s.paymentStatus !== 'paid') {
      summary.outstandingTotal += safeNum(s.totalRemaining);
    }
  }

  // Aggregate memberships
  for (const m of memberships) {
    if (m?.status !== 'active') continue;
    const id = String(m?.customerId || '');
    const summary = out.get(id);
    if (!summary) continue;
    const days = daysBetween(m.expiresAt, nowDate);
    if (days <= 0) continue;
    summary.membershipTier = m.tier || '';
    summary.membershipDaysLeft = days;
  }

  // Aggregate wallets
  // V64 schema fix (2026-05-08): be_customer_wallets uses composite doc IDs
  // `${customerId}__${walletTypeId}` so a customer with N wallet types
  // produces N docs. Sum balances per customerId.
  for (const w of wallets) {
    const id = String(w?.customerId || '');  // customerId FIELD, not doc.id
    const summary = out.get(id);
    if (!summary) continue;
    summary.walletBalance += safeNum(w.balance);
  }

  return out;
}
```

- [ ] **Step 4: Run — verify PASS**

Run: `npm test -- --run tests/v64-appointment-hub-aggregator.test.js`
Expected: PASS (11/11).

- [ ] **Step 5: Commit**

```bash
git add tests/v64-appointment-hub-aggregator.test.js src/lib/appointmentHubAggregator.js
git commit -m "feat(V64 task4): appointmentHubAggregator — single-load Map<customerId, summary>"
```

---

### Task 5: Pure helper `appointmentHubPrintTemplate.js`

**Files:**
- Create: `src/lib/appointmentHubPrintTemplate.js`
- Test: `tests/v64-appointment-hub-pdf-template.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/v64-appointment-hub-pdf-template.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  buildPrintRows,
  buildPrintHeader,
  buildPrintHTMLTemplate,
} from '../src/lib/appointmentHubPrintTemplate.js';

const FIXED_NOW = new Date('2026-05-08T07:00:00+07:00');

describe('V64.P appointmentHubPrintTemplate — pure layout', () => {
  it('P1.1 buildPrintRows returns one row per appt with denormalized customer + appt fields', () => {
    const rows = buildPrintRows({
      appts: [
        { id: 'A1', customerId: 'C1', date: '2026-05-08', startTime: '09:00', endTime: '09:30', doctorName: 'หมอ น้ำตาล', roomName: 'ห้อง 3', status: 'pending', appointmentTo: 'หัตถการ' },
      ],
      summaryMap: new Map([['C1', { hn: 'HN001', name: 'Alice', phone: '0811111111' }]]),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      hn: 'HN001', customerName: 'Alice', dateLabel: expect.any(String), timeLabel: '09:00 - 09:30',
      doctorName: 'หมอ น้ำตาล', roomName: 'ห้อง 3', appointmentTo: 'หัตถการ', statusLabel: 'รอยืนยัน',
    });
  });

  it('P1.2 buildPrintHeader includes branch name + tab label + thai-formatted date range', () => {
    const h = buildPrintHeader({ tab: 'today', branchName: 'พระราม 9', from: '2026-05-08', to: '2026-05-08', now: FIXED_NOW });
    expect(h.title).toMatch(/นัดหมาย/);
    expect(h.subTitle).toMatch(/พระราม 9/);
    expect(h.tabLabel).toMatch(/วันนี้/);
    expect(h.dateRangeLabel).toMatch(/8.*พฤษภาคม.*2569/);
  });

  it('P1.3 buildPrintHTMLTemplate returns a string with embedded thai font + tabular structure', () => {
    const html = buildPrintHTMLTemplate({
      header: buildPrintHeader({ tab: 'today', branchName: 'TestBranch', from: '2026-05-08', to: '2026-05-08', now: FIXED_NOW }),
      rows: [],
    });
    expect(typeof html).toBe('string');
    expect(html).toMatch(/<table/);
    expect(html).toMatch(/Sarabun|Noto Sans Thai|font-family/i);
  });

  it('P1.4 V32 lock — no html2pdf reference; uses html2canvas + jsPDF directly', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/lib/appointmentHubPrintTemplate.js', 'utf8');
    expect(src).not.toMatch(/html2pdf/i);
    // The actual export call site is in the View component; this helper is HTML-only.
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

Run: `npm test -- --run tests/v64-appointment-hub-pdf-template.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/lib/appointmentHubPrintTemplate.js`:

```js
// V64 — appointment hub PDF print template (Q5=C). Pure HTML/data builder.
// Render path: View component takes the HTML, paints it into a hidden DOM
// node, runs html2canvas + jsPDF.addImage (V32 lock — never html2pdf).

import { resolveAppointmentTypeLabel } from './appointmentTypes.js';

const STATUS_LABELS = {
  pending: 'รอยืนยัน',
  confirmed: 'ยืนยันแล้ว',
  done: 'เสร็จแล้ว',
  cancelled: 'ยกเลิก',
};

const TAB_LABELS = {
  today: 'วันนี้',
  tomorrow: 'พรุ่งนี้',
  future: 'ล่วงหน้า 30 วัน',
  past: 'ย้อนหลัง 30 วัน',
};

const THAI_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

function thaiDateLabel(isoYMD) {
  if (typeof isoYMD !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(isoYMD)) return '';
  const [y, m, d] = isoYMD.split('-').map(Number);
  return `${d} ${THAI_MONTHS[m - 1]} ${y + 543}`;
}

export function buildPrintRows({ appts = [], summaryMap = new Map() } = {}) {
  return appts.map(a => {
    const s = summaryMap.get(String(a.customerId)) || {};
    return {
      id: a.id,
      hn: s.hn || '',
      customerName: s.name || a.customerName || '',
      phone: s.phone || a.customerPhone || '',
      dateLabel: thaiDateLabel(a.date),
      timeLabel: `${a.startTime || '-'} - ${a.endTime || '-'}`,
      doctorName: a.doctorName || '-',
      assistantName: (a.assistantNames || []).join(', ') || a.assistantName || '-',
      roomName: a.roomName || '-',
      appointmentTo: a.appointmentTo || '-',
      typeLabel: resolveAppointmentTypeLabel(a.appointmentType) || '-',
      statusLabel: STATUS_LABELS[a.status] || a.status || '',
    };
  });
}

export function buildPrintHeader({ tab, branchName = '', from, to, now = new Date() } = {}) {
  const tabLabel = TAB_LABELS[tab] || tab;
  const dateRangeLabel = (from === to)
    ? thaiDateLabel(from)
    : `${thaiDateLabel(from)} - ${thaiDateLabel(to)}`;
  const printedAt = thaiDateLabel(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);
  return {
    title: 'ตารางนัดหมาย',
    subTitle: `สาขา: ${branchName || '-'}`,
    tabLabel,
    dateRangeLabel,
    printedAtLabel: `พิมพ์เมื่อ: ${printedAt}`,
  };
}

export function buildPrintHTMLTemplate({ header, rows = [] } = {}) {
  const tableRows = rows.map(r => `
    <tr>
      <td>${escape(r.hn)}</td>
      <td>${escape(r.customerName)}</td>
      <td>${escape(r.phone)}</td>
      <td>${escape(r.dateLabel)}</td>
      <td>${escape(r.timeLabel)}</td>
      <td>${escape(r.doctorName)}</td>
      <td>${escape(r.assistantName)}</td>
      <td>${escape(r.roomName)}</td>
      <td>${escape(r.appointmentTo)}</td>
      <td>${escape(r.statusLabel)}</td>
    </tr>
  `).join('');
  return `
    <div style="font-family: 'Sarabun', 'Noto Sans Thai', sans-serif; padding: 20px; color: #000; background: #fff;">
      <h2 style="margin: 0 0 4px 0;">${escape(header?.title || '')}</h2>
      <div style="font-size: 14px; margin-bottom: 2px;">${escape(header?.subTitle || '')}</div>
      <div style="font-size: 14px; margin-bottom: 2px;">ช่วง: ${escape(header?.tabLabel || '')} (${escape(header?.dateRangeLabel || '')})</div>
      <div style="font-size: 12px; margin-bottom: 16px; color: #666;">${escape(header?.printedAtLabel || '')}</div>
      <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
        <thead>
          <tr style="background: #f5f5f5;">
            <th style="border: 1px solid #ccc; padding: 6px;">HN</th>
            <th style="border: 1px solid #ccc; padding: 6px;">ลูกค้า</th>
            <th style="border: 1px solid #ccc; padding: 6px;">โทร</th>
            <th style="border: 1px solid #ccc; padding: 6px;">วันที่</th>
            <th style="border: 1px solid #ccc; padding: 6px;">เวลา</th>
            <th style="border: 1px solid #ccc; padding: 6px;">แพทย์</th>
            <th style="border: 1px solid #ccc; padding: 6px;">ผู้ช่วย</th>
            <th style="border: 1px solid #ccc; padding: 6px;">ห้อง</th>
            <th style="border: 1px solid #ccc; padding: 6px;">นัดมาเพื่อ</th>
            <th style="border: 1px solid #ccc; padding: 6px;">สถานะ</th>
          </tr>
        </thead>
        <tbody style="font-family: inherit;">
          ${tableRows || '<tr><td colspan="10" style="text-align:center; padding: 20px;">— ไม่มีรายการ —</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

function escape(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
```

Note: cells use `border: 1px solid #ccc; padding: 6px` instead of the dotted-underline pattern, so V32 alignment fix is not required here.

- [ ] **Step 4: Run — verify PASS**

Run: `npm test -- --run tests/v64-appointment-hub-pdf-template.test.js`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add tests/v64-appointment-hub-pdf-template.test.js src/lib/appointmentHubPrintTemplate.js
git commit -m "feat(V64 task5): appointmentHubPrintTemplate — pure HTML/data builder"
```

---

### Task 6: NEW component `AppointmentHubDoctorCards.jsx`

**Files:**
- Create: `src/components/admin/AppointmentHubDoctorCards.jsx`
- (Tested as part of `v64-appointment-hub-rtl.test.jsx` in Task 11.)

- [ ] **Step 1: Implement (no isolated test — covered in RTL bank)**

Create `src/components/admin/AppointmentHubDoctorCards.jsx`:

```jsx
// V64 — doctors + assistants header (Q2=B+D).
// Renders ONLY when tab is 'today' or 'tomorrow'; otherwise null.

import React from 'react';

export default function AppointmentHubDoctorCards({ tab, doctorShifts = [], assistantShifts = [], dateLabel = '' }) {
  if (tab !== 'today' && tab !== 'tomorrow') return null;

  return (
    <div className="mb-4 space-y-3" data-testid="appt-hub-doctor-cards">
      {doctorShifts.length > 0 && (
        <div>
          <div className="text-xs font-bold text-[var(--tx-heading)] mb-1">
            🩺 แพทย์เข้างาน {doctorShifts.length} คน
          </div>
          <div className="flex gap-2 flex-wrap">
            {doctorShifts.map((s, i) => (
              <div key={`d-${i}`} className="bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/40 rounded-lg px-3 py-2 text-xs min-w-[140px]" data-testid="appt-hub-doctor-card">
                <div className="font-bold text-[var(--tx-heading)] truncate">{s.name}</div>
                <div className="text-[var(--tx-muted)]">{s.startTime} - {s.endTime}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {assistantShifts.length > 0 && (
        <div>
          <div className="text-xs font-bold text-[var(--tx-heading)] mb-1">
            👤 ผู้ช่วยเข้างาน {assistantShifts.length} คน
          </div>
          <div className="flex gap-2 flex-wrap">
            {assistantShifts.map((s, i) => (
              <div key={`a-${i}`} className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/40 rounded-lg px-2 py-1.5 text-xs min-w-[120px]" data-testid="appt-hub-assistant-card">
                <div className="font-bold text-[var(--tx-heading)] truncate">{s.name}</div>
                <div className="text-[var(--tx-muted)]">{s.startTime} - {s.endTime}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {doctorShifts.length === 0 && assistantShifts.length === 0 && (
        <div className="text-xs text-[var(--tx-muted)] italic" data-testid="appt-hub-doctor-cards-empty">
          ไม่มีพนักงานเข้างาน{dateLabel ? ` วัน${dateLabel}` : ''}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/AppointmentHubDoctorCards.jsx
git commit -m "feat(V64 task6): AppointmentHubDoctorCards — Q2 today/tomorrow staff header"
```

---

### Task 7: NEW component `AppointmentHubTabBar.jsx`

**Files:**
- Create: `src/components/admin/AppointmentHubTabBar.jsx`
- Test: covered in RTL bank (Task 11)

- [ ] **Step 1: Implement**

Create `src/components/admin/AppointmentHubTabBar.jsx`:

```jsx
// V64 — 4 tab pills with bubble counts (Q4=A).
import React from 'react';

const TABS = [
  { key: 'today', label: 'วันนี้' },
  { key: 'tomorrow', label: 'พรุ่งนี้' },
  { key: 'future', label: 'ล่วงหน้า 30 วัน' },
  { key: 'past', label: 'ย้อนหลัง 30 วัน' },
];

export default function AppointmentHubTabBar({ activeTab, counts = {}, onTabChange }) {
  return (
    <div className="flex gap-2 mb-3 flex-wrap" data-testid="appt-hub-tabbar">
      {TABS.map(t => {
        const active = t.key === activeTab;
        const count = Number(counts[t.key] || 0);
        return (
          <button
            key={t.key}
            type="button"
            data-testid={`appt-hub-tab-${t.key}`}
            data-active={active ? 'true' : 'false'}
            onClick={() => onTabChange?.(t.key)}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 border ${
              active
                ? 'bg-sky-600 border-sky-600 text-white'
                : 'bg-[var(--bg-hover)] border-[var(--bd)] text-[var(--tx-muted)] hover:text-sky-400 hover:border-sky-700/50'
            }`}
          >
            <span>{t.label}</span>
            <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-bold ${active ? 'bg-white text-sky-700' : 'bg-sky-100 text-sky-700'}`}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/AppointmentHubTabBar.jsx
git commit -m "feat(V64 task7): AppointmentHubTabBar — 4-tab pills with bubble counts"
```

---

### Task 8: NEW component `AppointmentHubFilterBar.jsx`

**Files:**
- Create: `src/components/admin/AppointmentHubFilterBar.jsx`

- [ ] **Step 1: Implement**

Create `src/components/admin/AppointmentHubFilterBar.jsx`:

```jsx
// V64 — search + 3 filter dropdowns + 2 right-side buttons.
import React from 'react';
import { Search, Printer, Plus } from 'lucide-react';

const STATUS_OPTIONS = [
  { value: '__all__', label: 'ทุกสถานะ' },
  { value: 'pending', label: 'รอยืนยัน' },
  { value: 'confirmed', label: 'ยืนยันแล้ว' },
  { value: 'done', label: 'เสร็จแล้ว' },
  { value: 'cancelled', label: 'ยกเลิก' },
];

export default function AppointmentHubFilterBar({
  search, onSearchChange,
  typeFilter, onTypeFilterChange, typeOptions = [],
  statusFilter, onStatusFilterChange,
  onPrint, onAddWalkIn,
  resultCount = 0,
}) {
  return (
    <div className="mb-3" data-testid="appt-hub-filterbar">
      <div className="text-xs font-bold text-[var(--tx-heading)] mb-2">
        รายการนัดหมาย ลูกค้า {resultCount} คน
      </div>
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--tx-muted)]" />
          <input
            type="text"
            data-testid="appt-hub-search"
            placeholder="ค้นหาข้อมูล ชื่อลูกค้า, เบอร์โทร, แพทย์"
            value={search || ''}
            onChange={(e) => onSearchChange?.(e.target.value)}
            className="w-full pl-7 pr-2 py-1.5 text-xs bg-[var(--bg-card)] border border-[var(--bd)] rounded-lg text-[var(--tx-heading)] focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>
        <select
          data-testid="appt-hub-type-filter"
          value={typeFilter || ''}
          onChange={(e) => onTypeFilterChange?.(e.target.value)}
          className="text-xs px-2 py-1.5 bg-[var(--bg-card)] border border-[var(--bd)] rounded-lg text-[var(--tx-heading)] min-w-[120px]"
        >
          <option value="">ประเภทนัด</option>
          {typeOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <select
          data-testid="appt-hub-status-filter"
          value={statusFilter || '__all__'}
          onChange={(e) => onStatusFilterChange?.(e.target.value)}
          className="text-xs px-2 py-1.5 bg-[var(--bg-card)] border border-[var(--bd)] rounded-lg text-[var(--tx-heading)] min-w-[120px]"
        >
          {STATUS_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <button
          type="button"
          data-testid="appt-hub-print-btn"
          onClick={() => onPrint?.()}
          className="text-xs px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-bold flex items-center gap-1"
        >
          <Printer size={12} /> พิมพ์ตารางนัดหมาย
        </button>
        <button
          type="button"
          data-testid="appt-hub-walkin-btn"
          onClick={() => onAddWalkIn?.()}
          className="text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold flex items-center gap-1"
        >
          <Plus size={12} /> เพิ่มคิว Walk-in
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/AppointmentHubFilterBar.jsx
git commit -m "feat(V64 task8): AppointmentHubFilterBar — search + 3 dropdowns + 2 buttons"
```

---

### Task 9: NEW component `AppointmentHubRowCard.jsx`

**Files:**
- Create: `src/components/admin/AppointmentHubRowCard.jsx`

- [ ] **Step 1: Implement**

Create `src/components/admin/AppointmentHubRowCard.jsx`:

```jsx
// V64 — per-row appointment card with customer summary + appt detail + status-conditional buttons.
import React from 'react';
import { isMissedAppointment } from '../../lib/appointmentHubFilters.js';
import { resolveAppointmentTypeLabel } from '../../lib/appointmentTypes.js';

const STATUS_LABELS = {
  pending: 'รอยืนยัน',
  confirmed: 'ยืนยันแล้ว',
  done: 'เสร็จแล้ว',
  cancelled: 'ยกเลิก',
};

const STATUS_CHIP_CLS = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  confirmed: 'bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300',
  done: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  cancelled: 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
};

function fmtMoney(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function AppointmentHubRowCard({
  appt,
  summary,
  now = new Date(),
  // Action handlers (passed from container; wire to AdminDashboard)
  onConfirm, onEdit, onCancel, onCreateTreatment, onEditTreatment, onOpenLine,
}) {
  const status = appt.status || 'pending';
  const statusLabel = STATUS_LABELS[status] || status;
  const isMissed = isMissedAppointment(appt, now);
  const isPastDate = appt.date < now.toISOString().slice(0, 10);
  const typeLabel = resolveAppointmentTypeLabel(appt.appointmentType);
  const hasLinkedTreatment = !!appt.linkedTreatmentId;

  return (
    <div
      className="border border-[var(--bd)] rounded-xl bg-[var(--bg-card)] p-3 mb-2 flex flex-col md:flex-row gap-3"
      data-testid="appt-hub-row"
      data-appt-id={appt.id}
    >
      {/* LEFT — Customer */}
      <div className="flex-1 min-w-[260px]">
        <div className="flex items-baseline gap-2 mb-1 flex-wrap">
          <span className="text-[11px] text-[var(--tx-muted)]" data-testid="row-hn">HN: {summary?.hn || '-'}</span>
          {summary?.membershipTier && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800">
              {summary.membershipTier} คงเหลือ {summary.membershipDaysLeft} วัน
            </span>
          )}
        </div>
        <div className="font-bold text-sm text-[var(--tx-heading)]" data-testid="row-name">
          {summary?.name || appt.customerName || '-'}
        </div>
        <div className="text-xs text-[var(--tx-muted)] flex flex-wrap gap-x-3 gap-y-1 mt-1">
          {summary?.gender && <span>เพศ: {summary.gender}</span>}
          {summary?.phone && <span>📞 {summary.phone}</span>}
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {summary?.walletBalance > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
              Wallet {fmtMoney(summary.walletBalance)} ฿
            </span>
          )}
          {summary?.activeDepositTotal > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-800">
              มัดจำ {fmtMoney(summary.activeDepositTotal)} ฿
            </span>
          )}
          {summary?.outstandingTotal > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-800">
              ค่างชำระ {fmtMoney(summary.outstandingTotal)} ฿
            </span>
          )}
          {summary?.lifetimeSaleTotal > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
              ยอดสั่งซื้อ {fmtMoney(summary.lifetimeSaleTotal)} ฿
            </span>
          )}
        </div>
      </div>

      {/* MIDDLE — Appointment detail */}
      <div className="flex-1 min-w-[220px] text-xs space-y-0.5">
        <div className="flex items-center gap-1.5 mb-1">
          {typeLabel && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">{typeLabel}</span>
          )}
          {isMissed && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 font-bold" data-testid="row-missed-chip">
              ไม่มาตามนัด
            </span>
          )}
        </div>
        <div className="text-[var(--tx-muted)]">ที่ปรึกษา: <span className="text-[var(--tx-heading)]">{appt.advisor || '-'}</span></div>
        <div className="text-[var(--tx-muted)]">แพทย์: <span className="text-[var(--tx-heading)]">{appt.doctorName || '-'}</span></div>
        <div className="text-[var(--tx-muted)]">ผู้ช่วย: <span className="text-[var(--tx-heading)]">{(appt.assistantNames || []).join(', ') || appt.assistantName || '-'}</span></div>
        <div className="text-[var(--tx-muted)]">เวลานัด: <span className="text-[var(--tx-heading)]">{appt.startTime || '-'} - {appt.endTime || '-'}</span></div>
        <div className="text-[var(--tx-muted)]">ห้องตรวจ: <span className="text-[var(--tx-heading)]">{appt.roomName || '-'}</span></div>
        <div className="text-[var(--tx-muted)]">นัดมาเพื่อ: <span className="text-[var(--tx-heading)]">{appt.appointmentTo || '-'}</span></div>
      </div>

      {/* RIGHT — Status + Actions */}
      <div className="flex md:flex-col gap-2 items-end justify-start min-w-[200px]">
        <span className={`text-[11px] px-2 py-1 rounded-full font-bold ${STATUS_CHIP_CLS[status] || ''}`} data-testid="row-status">
          {statusLabel}
        </span>
        <div className="flex gap-1.5 flex-wrap justify-end">
          {/* LINE icon */}
          {appt.customerLineUserId && (
            <button
              type="button"
              data-testid="row-action-line"
              onClick={() => onOpenLine?.(appt)}
              title="LINE"
              className="text-[11px] px-2 py-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded font-bold"
            >
              LINE
            </button>
          )}
          {/* Pending (รอยืนยัน) */}
          {status === 'pending' && (
            <>
              <button data-testid="row-action-confirm" onClick={() => onConfirm?.(appt)} className="text-[11px] px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold">
                คอนเฟิร์มนัด
              </button>
              <button data-testid="row-action-edit" onClick={() => onEdit?.(appt)} className="text-[11px] px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded font-bold">
                แก้ไขนัด
              </button>
              <button data-testid="row-action-cancel" onClick={() => onCancel?.(appt)} className="text-[11px] px-2 py-1 bg-rose-500 hover:bg-rose-600 text-white rounded font-bold">
                ยกเลิก
              </button>
            </>
          )}
          {/* Confirmed (รอเข้าตรวจ / ไม่มาตามนัด) */}
          {status === 'confirmed' && (
            <>
              <button data-testid="row-action-create-treatment" onClick={() => onCreateTreatment?.(appt)} className="text-[11px] px-2 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded font-bold">
                บันทึกการรักษา
              </button>
              <button data-testid="row-action-edit" onClick={() => onEdit?.(appt)} className="text-[11px] px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded font-bold">
                แก้ไขนัด
              </button>
              <button data-testid="row-action-cancel" onClick={() => onCancel?.(appt)} className="text-[11px] px-2 py-1 bg-rose-500 hover:bg-rose-600 text-white rounded font-bold">
                ยกเลิก
              </button>
            </>
          )}
          {/* Done (ตรวจเสร็จแล้ว) */}
          {status === 'done' && (
            <>
              <button data-testid="row-action-edit-treatment" onClick={() => hasLinkedTreatment ? onEditTreatment?.(appt) : onCreateTreatment?.(appt)} className="text-[11px] px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold">
                {hasLinkedTreatment ? 'แก้ไขการรักษา' : 'บันทึกการรักษา'}
              </button>
              {!hasLinkedTreatment && (
                <button data-testid="row-action-cancel" onClick={() => onCancel?.(appt)} className="text-[11px] px-2 py-1 bg-rose-500 hover:bg-rose-600 text-white rounded font-bold">
                  ยกเลิก
                </button>
              )}
            </>
          )}
          {/* Cancelled — read-only */}
          {status === 'cancelled' && (
            <span className="text-[11px] text-[var(--tx-muted)] italic">ยกเลิกแล้ว</span>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/AppointmentHubRowCard.jsx
git commit -m "feat(V64 task9): AppointmentHubRowCard — per-row card with status-conditional buttons"
```

---

### Task 10: NEW component `AppointmentHubView.jsx` (orchestrator)

**Files:**
- Create: `src/components/admin/AppointmentHubView.jsx`

- [ ] **Step 1: Implement**

Create `src/components/admin/AppointmentHubView.jsx`:

```jsx
// V64 — orchestrator. Owns state (active tab, search, filters) + loaders.
// Mutations call BACK into AdminDashboard via props (no new mutation logic).

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
import {
  getAppointmentsByDateRange,
  getAllCustomers,
  getAllDeposits,
  getAllSales,
  getAllMemberships,
  getWalletsForCustomerIds,
  listStaffSchedules,
} from '../../lib/scopedDataLayer.js';
import {
  applyTabFilter,
  dateRangeForTab,
  defaultStatusFilterForTab,
} from '../../lib/appointmentHubFilters.js';
import { buildCustomerSummaryMap } from '../../lib/appointmentHubAggregator.js';
import {
  buildPrintRows,
  buildPrintHeader,
  buildPrintHTMLTemplate,
} from '../../lib/appointmentHubPrintTemplate.js';
import { resolveDoctorWorkingHoursForDate } from '../../lib/staffScheduleValidation.js';
import { getAppointmentTypeOptions } from '../../lib/appointmentTypes.js';
import AppointmentHubDoctorCards from './AppointmentHubDoctorCards.jsx';
import AppointmentHubTabBar from './AppointmentHubTabBar.jsx';
import AppointmentHubFilterBar from './AppointmentHubFilterBar.jsx';
import AppointmentHubRowCard from './AppointmentHubRowCard.jsx';

const TAB_KEYS = ['today', 'tomorrow', 'future', 'past'];

export default function AppointmentHubView({
  // Action handlers passed from AdminDashboard (existing helpers)
  onConfirmAppt,
  onEditAppt,
  onCancelAppt,
  onCreateTreatmentForAppt,
  onEditTreatmentForAppt,
  onOpenLineForAppt,
  onAddWalkIn,
  branchName = '',
  doctors = [],
  assistants = [],
}) {
  const { branchId: selectedBranchId } = useSelectedBranch();
  const [activeTab, setActiveTab] = useState('today');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('__all__');
  const [typeFilter, setTypeFilter] = useState('');

  const [appts, setAppts] = useState([]);
  const [summaryMap, setSummaryMap] = useState(new Map());
  const [scheduleEntries, setScheduleEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  // Reset filters on branch switch (Phase 17.0 BS-9 pattern + V64 Rule I F3)
  useEffect(() => {
    setActiveTab('today');
    setSearch('');
    setStatusFilter('__all__');
    setTypeFilter('');
  }, [selectedBranchId]);

  // Compute date range from active tab + load
  const range = useMemo(() => dateRangeForTab(activeTab, new Date()), [activeTab]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [apptList, customers, deposits, sales, memberships, schedules] = await Promise.all([
          getAppointmentsByDateRange({ from: range.from, to: range.to, branchId: selectedBranchId }),
          getAllCustomers(),
          getAllDeposits({ branchId: selectedBranchId }),
          getAllSales({ branchId: selectedBranchId }),
          getAllMemberships(),
          listStaffSchedules({ branchId: selectedBranchId }),
        ]);
        if (cancelled) return;
        const customerIds = [...new Set(apptList.map(a => String(a.customerId)).filter(Boolean))];
        const wallets = customerIds.length > 0 ? await getWalletsForCustomerIds(customerIds) : [];
        if (cancelled) return;
        const map = buildCustomerSummaryMap({
          customers, deposits, sales, memberships, wallets, now: new Date(),
        });
        setAppts(apptList);
        setSummaryMap(map);
        setScheduleEntries(schedules);
        setLoading(false);
      } catch (e) {
        // Surface errors in console; UI shows empty list.
        // eslint-disable-next-line no-console
        console.error('AppointmentHubView load failed:', e);
        if (!cancelled) {
          setAppts([]);
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [range.from, range.to, selectedBranchId]);

  // Per-tab filtered list
  const filteredAppts = useMemo(() => {
    return applyTabFilter(appts, {
      tab: activeTab,
      now: new Date(),
      statusOverride: statusFilter,
      search,
      typeFilter,
    });
  }, [appts, activeTab, statusFilter, search, typeFilter]);

  // Bubble counts per tab — we have the loaded data for the active tab only,
  // but counts should reflect each tab's range. For accuracy, we render the
  // active tab's count from filtered data and 0 for others until they're
  // navigated to. Alternative: lightweight count-only loader. V64 keeps it
  // simple — counts reflect ONLY the loaded tab; switching tabs reloads.
  const counts = useMemo(() => {
    const c = { today: 0, tomorrow: 0, future: 0, past: 0 };
    c[activeTab] = filteredAppts.length;
    return c;
  }, [activeTab, filteredAppts.length]);

  // Doctor + assistant shifts for today/tomorrow header (Q2=B+D)
  const { doctorShifts, assistantShifts } = useMemo(() => {
    const targetDate = activeTab === 'today' ? new Date() : (activeTab === 'tomorrow' ? new Date(Date.now() + 24 * 3600 * 1000) : null);
    if (!targetDate) return { doctorShifts: [], assistantShifts: [] };
    const dateISO = targetDate.toISOString().slice(0, 10);
    const docHrs = resolveDoctorWorkingHoursForDate?.({ allEntries: scheduleEntries, dateISO, role: 'doctor' }) || [];
    const asstHrs = resolveDoctorWorkingHoursForDate?.({ allEntries: scheduleEntries, dateISO, role: 'assistant' }) || [];
    const enrich = (shifts, peopleList) => shifts.map(s => ({
      ...s,
      name: peopleList.find(p => String(p.id) === String(s.staffId))?.name || s.staffId,
    }));
    return {
      doctorShifts: enrich(docHrs, doctors),
      assistantShifts: enrich(asstHrs, assistants),
    };
  }, [scheduleEntries, doctors, assistants, activeTab]);

  // Print PDF (Q5=C)
  const handlePrint = useCallback(async () => {
    const rows = buildPrintRows({ appts: filteredAppts, summaryMap });
    const header = buildPrintHeader({ tab: activeTab, branchName, from: range.from, to: range.to, now: new Date() });
    const html = buildPrintHTMLTemplate({ header, rows });
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '1100px';
    container.innerHTML = html;
    document.body.appendChild(container);
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      const canvas = await html2canvas(container.firstElementChild, { scale: 2, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgRatio = canvas.height / canvas.width;
      const imgW = pageW;
      const imgH = imgW * imgRatio;
      if (imgH <= pageH) {
        pdf.addImage(imgData, 'JPEG', 0, 0, imgW, imgH);
      } else {
        // Multi-page if very long
        let y = 0;
        const sliceH = pageH;
        while (y < imgH) {
          pdf.addImage(imgData, 'JPEG', 0, -y, imgW, imgH);
          y += sliceH;
          if (y < imgH) pdf.addPage();
        }
      }
      const filename = `appointments-${selectedBranchId || 'all'}-${activeTab}-${range.from}.pdf`;
      pdf.save(filename);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Print failed:', e);
      window.alert('พิมพ์ตารางนัดหมายไม่สำเร็จ — ลองใหม่อีกครั้ง');
    } finally {
      document.body.removeChild(container);
    }
  }, [filteredAppts, summaryMap, activeTab, branchName, range.from, range.to, selectedBranchId]);

  const dateLabel = activeTab === 'today' ? 'นี้' : (activeTab === 'tomorrow' ? 'พรุ่งนี้' : '');

  return (
    <div data-testid="appt-hub-view">
      <AppointmentHubDoctorCards
        tab={activeTab}
        doctorShifts={doctorShifts}
        assistantShifts={assistantShifts}
        dateLabel={dateLabel}
      />
      <AppointmentHubTabBar
        activeTab={activeTab}
        counts={counts}
        onTabChange={setActiveTab}
      />
      <AppointmentHubFilterBar
        search={search}
        onSearchChange={setSearch}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        typeOptions={getAppointmentTypeOptions?.() || []}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        onPrint={handlePrint}
        onAddWalkIn={onAddWalkIn}
        resultCount={filteredAppts.length}
      />
      {loading && (
        <div className="text-xs text-[var(--tx-muted)] italic mb-2">กำลังโหลด…</div>
      )}
      {!loading && filteredAppts.length === 0 && (
        <div className="text-xs text-[var(--tx-muted)] italic text-center py-6 border border-dashed border-[var(--bd)] rounded-lg" data-testid="appt-hub-empty">
          — ไม่มีรายการนัดหมาย —
        </div>
      )}
      {!loading && filteredAppts.map(a => (
        <AppointmentHubRowCard
          key={a.id}
          appt={a}
          summary={summaryMap.get(String(a.customerId))}
          now={new Date()}
          onConfirm={onConfirmAppt}
          onEdit={onEditAppt}
          onCancel={onCancelAppt}
          onCreateTreatment={onCreateTreatmentForAppt}
          onEditTreatment={onEditTreatmentForAppt}
          onOpenLine={onOpenLineForAppt}
        />
      ))}
    </div>
  );
}
```

Note: this assumes `resolveDoctorWorkingHoursForDate` exists in `staffScheduleValidation.js` returning `[{staffId, startTime, endTime}, ...]` for a given date+role. If it doesn't exist with that signature, fall back to filtering `scheduleEntries` inline by date + role.

- [ ] **Step 2: Verify the helper signature**

Run: `npm test -- --run tests/v64-appointment-hub-aggregator.test.js tests/v64-appointment-hub-filters.test.js tests/v64-appointment-hub-pdf-template.test.js`
Expected: PASS — these don't depend on the View.

- [ ] **Step 3: Check `resolveDoctorWorkingHoursForDate` exists**

```bash
grep -n "resolveDoctorWorkingHoursForDate" src/lib/staffScheduleValidation.js
```

If MISSING (likely), add a small inline filter in the View instead. Update `useMemo` block to:

```js
const targetDateISO = activeTab === 'today'
  ? new Date().toISOString().slice(0, 10)
  : (activeTab === 'tomorrow' ? new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10) : null);
if (!targetDateISO) return { doctorShifts: [], assistantShifts: [] };
const dow = new Date(targetDateISO + 'T12:00:00Z').getUTCDay();
const filterShifts = (entries, role) => entries
  .filter(e => {
    if (e.role !== role) return false;
    if (e.kind === 'recurring' && e.dayOfWeek === dow) return true;
    if (e.kind === 'override' && e.dateISO === targetDateISO) return true;
    return false;
  })
  .map(e => ({ staffId: e.staffId, startTime: e.startTime, endTime: e.endTime }));
const docHrs = filterShifts(scheduleEntries, 'doctor');
const asstHrs = filterShifts(scheduleEntries, 'assistant');
```

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/AppointmentHubView.jsx
git commit -m "feat(V64 task10): AppointmentHubView orchestrator — Q3=C single-load + Q5=C print"
```

---

### Task 11: RTL test bank for components

**Files:**
- Create: `tests/v64-appointment-hub-rtl.test.jsx`

- [ ] **Step 1: Write the test bank**

Create `tests/v64-appointment-hub-rtl.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AppointmentHubTabBar from '../src/components/admin/AppointmentHubTabBar.jsx';
import AppointmentHubDoctorCards from '../src/components/admin/AppointmentHubDoctorCards.jsx';
import AppointmentHubFilterBar from '../src/components/admin/AppointmentHubFilterBar.jsx';
import AppointmentHubRowCard from '../src/components/admin/AppointmentHubRowCard.jsx';

const FIXED_NOW = new Date('2026-05-08T07:00:00+07:00');

describe('V64.R AppointmentHubTabBar', () => {
  it('R1.1 renders 4 tabs', () => {
    render(<AppointmentHubTabBar activeTab="today" counts={{ today: 1, tomorrow: 2, future: 6, past: 116 }} />);
    expect(screen.getByTestId('appt-hub-tab-today')).toBeInTheDocument();
    expect(screen.getByTestId('appt-hub-tab-tomorrow')).toBeInTheDocument();
    expect(screen.getByTestId('appt-hub-tab-future')).toBeInTheDocument();
    expect(screen.getByTestId('appt-hub-tab-past')).toBeInTheDocument();
  });

  it('R1.2 active tab carries data-active=true', () => {
    render(<AppointmentHubTabBar activeTab="future" counts={{}} />);
    expect(screen.getByTestId('appt-hub-tab-future').getAttribute('data-active')).toBe('true');
    expect(screen.getByTestId('appt-hub-tab-today').getAttribute('data-active')).toBe('false');
  });

  it('R1.3 click fires onTabChange with key', () => {
    const fn = vi.fn();
    render(<AppointmentHubTabBar activeTab="today" counts={{}} onTabChange={fn} />);
    fireEvent.click(screen.getByTestId('appt-hub-tab-past'));
    expect(fn).toHaveBeenCalledWith('past');
  });

  it('R1.4 bubble count rendered', () => {
    render(<AppointmentHubTabBar activeTab="past" counts={{ past: 116 }} />);
    expect(screen.getByTestId('appt-hub-tab-past').textContent).toMatch(/116/);
  });
});

describe('V64.R AppointmentHubDoctorCards (Q2=D)', () => {
  it('R2.1 renders cards on today tab', () => {
    render(<AppointmentHubDoctorCards
      tab="today"
      doctorShifts={[{ name: 'หมอ น้ำตาล', startTime: '10:30', endTime: '17:00' }]}
      assistantShifts={[{ name: 'นาสาว เอ', startTime: '09:00', endTime: '12:00' }]}
    />);
    expect(screen.getByTestId('appt-hub-doctor-cards')).toBeInTheDocument();
    expect(screen.getAllByTestId('appt-hub-doctor-card')).toHaveLength(1);
    expect(screen.getAllByTestId('appt-hub-assistant-card')).toHaveLength(1);
  });

  it('R2.2 hides on future tab', () => {
    render(<AppointmentHubDoctorCards tab="future" doctorShifts={[{ name: 'X', startTime: '08:00', endTime: '17:00' }]} />);
    expect(screen.queryByTestId('appt-hub-doctor-cards')).not.toBeInTheDocument();
  });

  it('R2.3 hides on past tab', () => {
    render(<AppointmentHubDoctorCards tab="past" doctorShifts={[{ name: 'X', startTime: '08:00', endTime: '17:00' }]} />);
    expect(screen.queryByTestId('appt-hub-doctor-cards')).not.toBeInTheDocument();
  });

  it('R2.4 empty state on tomorrow with no shifts', () => {
    render(<AppointmentHubDoctorCards tab="tomorrow" doctorShifts={[]} assistantShifts={[]} />);
    expect(screen.getByTestId('appt-hub-doctor-cards-empty')).toBeInTheDocument();
  });
});

describe('V64.R AppointmentHubFilterBar', () => {
  it('R3.1 search input fires onSearchChange', () => {
    const fn = vi.fn();
    render(<AppointmentHubFilterBar search="" onSearchChange={fn} resultCount={0} />);
    fireEvent.change(screen.getByTestId('appt-hub-search'), { target: { value: 'alice' } });
    expect(fn).toHaveBeenCalledWith('alice');
  });

  it('R3.2 status dropdown fires onStatusFilterChange', () => {
    const fn = vi.fn();
    render(<AppointmentHubFilterBar statusFilter="__all__" onStatusFilterChange={fn} resultCount={0} />);
    fireEvent.change(screen.getByTestId('appt-hub-status-filter'), { target: { value: 'pending' } });
    expect(fn).toHaveBeenCalledWith('pending');
  });

  it('R3.3 print button fires onPrint', () => {
    const fn = vi.fn();
    render(<AppointmentHubFilterBar onPrint={fn} resultCount={0} />);
    fireEvent.click(screen.getByTestId('appt-hub-print-btn'));
    expect(fn).toHaveBeenCalled();
  });

  it('R3.4 walk-in button fires onAddWalkIn', () => {
    const fn = vi.fn();
    render(<AppointmentHubFilterBar onAddWalkIn={fn} resultCount={0} />);
    fireEvent.click(screen.getByTestId('appt-hub-walkin-btn'));
    expect(fn).toHaveBeenCalled();
  });

  it('R3.5 result count rendered', () => {
    render(<AppointmentHubFilterBar resultCount={42} />);
    expect(screen.getByText(/42 คน/)).toBeInTheDocument();
  });
});

describe('V64.R AppointmentHubRowCard', () => {
  const baseSummary = { hn: 'HN001', name: 'Alice', gender: 'F', phone: '0811111111', membershipTier: 'GOLD', membershipDaysLeft: 340, walletBalance: 12000, activeDepositTotal: 5000, outstandingTotal: 1500, lifetimeSaleTotal: 100000 };

  it('R4.1 pending row shows confirm + edit + cancel', () => {
    render(<AppointmentHubRowCard appt={{ id: 'A1', customerId: 'C1', date: '2026-05-08', startTime: '09:00', endTime: '09:30', status: 'pending', doctorName: 'D' }} summary={baseSummary} now={FIXED_NOW} />);
    expect(screen.getByTestId('row-action-confirm')).toBeInTheDocument();
    expect(screen.getByTestId('row-action-edit')).toBeInTheDocument();
    expect(screen.getByTestId('row-action-cancel')).toBeInTheDocument();
    expect(screen.queryByTestId('row-action-create-treatment')).not.toBeInTheDocument();
  });

  it('R4.2 confirmed row shows create-treatment + edit + cancel', () => {
    render(<AppointmentHubRowCard appt={{ id: 'A1', customerId: 'C1', date: '2026-05-08', startTime: '09:00', endTime: '09:30', status: 'confirmed' }} summary={baseSummary} now={FIXED_NOW} />);
    expect(screen.getByTestId('row-action-create-treatment')).toBeInTheDocument();
  });

  it('R4.3 done with linkedTreatment shows edit-treatment', () => {
    render(<AppointmentHubRowCard appt={{ id: 'A1', customerId: 'C1', date: '2026-05-08', status: 'done', linkedTreatmentId: 'T1' }} summary={baseSummary} now={FIXED_NOW} />);
    const btn = screen.getByTestId('row-action-edit-treatment');
    expect(btn.textContent).toMatch(/แก้ไขการรักษา/);
  });

  it('R4.4 done without linkedTreatment shows fallback create-treatment', () => {
    render(<AppointmentHubRowCard appt={{ id: 'A1', customerId: 'C1', date: '2026-05-08', status: 'done' }} summary={baseSummary} now={FIXED_NOW} />);
    const btn = screen.getByTestId('row-action-edit-treatment');
    expect(btn.textContent).toMatch(/บันทึกการรักษา/);
  });

  it('R4.5 cancelled row is read-only', () => {
    render(<AppointmentHubRowCard appt={{ id: 'A1', customerId: 'C1', date: '2026-05-08', status: 'cancelled' }} summary={baseSummary} now={FIXED_NOW} />);
    expect(screen.queryByTestId('row-action-confirm')).not.toBeInTheDocument();
    expect(screen.getByText(/ยกเลิกแล้ว/)).toBeInTheDocument();
  });

  it('R4.6 missed-chip shown for confirmed past-date', () => {
    render(<AppointmentHubRowCard appt={{ id: 'A1', customerId: 'C1', date: '2026-05-01', status: 'confirmed' }} summary={baseSummary} now={FIXED_NOW} />);
    expect(screen.getByTestId('row-missed-chip')).toBeInTheDocument();
  });

  it('R4.7 missed-chip NOT shown for confirmed today', () => {
    render(<AppointmentHubRowCard appt={{ id: 'A1', customerId: 'C1', date: '2026-05-08', status: 'confirmed' }} summary={baseSummary} now={FIXED_NOW} />);
    expect(screen.queryByTestId('row-missed-chip')).not.toBeInTheDocument();
  });

  it('R4.8 LINE button rendered when customerLineUserId present', () => {
    render(<AppointmentHubRowCard appt={{ id: 'A1', customerId: 'C1', date: '2026-05-08', status: 'pending', customerLineUserId: 'U123' }} summary={baseSummary} now={FIXED_NOW} />);
    expect(screen.getByTestId('row-action-line')).toBeInTheDocument();
  });

  it('R4.9 LINE button hidden when no lineUserId', () => {
    render(<AppointmentHubRowCard appt={{ id: 'A1', customerId: 'C1', date: '2026-05-08', status: 'pending' }} summary={baseSummary} now={FIXED_NOW} />);
    expect(screen.queryByTestId('row-action-line')).not.toBeInTheDocument();
  });

  it('R4.10 click on confirm fires onConfirm with appt', () => {
    const fn = vi.fn();
    render(<AppointmentHubRowCard appt={{ id: 'A1', customerId: 'C1', date: '2026-05-08', status: 'pending' }} summary={baseSummary} now={FIXED_NOW} onConfirm={fn} />);
    fireEvent.click(screen.getByTestId('row-action-confirm'));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0].id).toBe('A1');
  });

  it('R4.11 customer summary chips rendered when present', () => {
    render(<AppointmentHubRowCard appt={{ id: 'A1', customerId: 'C1', date: '2026-05-08', status: 'pending' }} summary={baseSummary} now={FIXED_NOW} />);
    expect(screen.getByText(/GOLD คงเหลือ 340 วัน/)).toBeInTheDocument();
    expect(screen.getByText(/Wallet 12,000 ฿/)).toBeInTheDocument();
    expect(screen.getByText(/มัดจำ 5,000 ฿/)).toBeInTheDocument();
    expect(screen.getByText(/ค่างชำระ 1,500 ฿/)).toBeInTheDocument();
    expect(screen.getByText(/ยอดสั่งซื้อ 100,000 ฿/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — verify PASS**

Run: `npm test -- --run tests/v64-appointment-hub-rtl.test.jsx`
Expected: PASS (~24/24).

- [ ] **Step 3: Commit**

```bash
git add tests/v64-appointment-hub-rtl.test.jsx
git commit -m "test(V64 task11): RTL bank for hub components — 4 component groups, 24 cases"
```

---

### Task 12: Surgical insert in `AdminDashboard.jsx`

**Files:**
- Modify: `src/pages/AdminDashboard.jsx` (around line 6413, the `adminMode === 'appointment'` branch)

- [ ] **Step 1: Add imports at top of `AdminDashboard.jsx`**

Find the existing imports section. Add:

```js
import AppointmentHubView from '../components/admin/AppointmentHubView.jsx';
```

(near other admin/* component imports)

- [ ] **Step 2: Add state for view-toggle**

Find the state declarations near `apptMonth` (around line 587). Add:

```js
const [apptViewMode, setApptViewMode] = useState('list');  // V64 — 'list' | 'calendar'
```

- [ ] **Step 3: Modify the appointment branch render**

Find the line `} ) : adminMode === 'appointment' ? renderJsxBlock(() => {` (around line 6413). Replace the IIFE block with:

```jsx
) : adminMode === 'appointment' ? (
  <div>
    {/* V64 — view-toggle pill */}
    <div className="flex gap-2 mb-3">
      <button
        type="button"
        data-testid="appt-view-toggle-list"
        onClick={() => setApptViewMode('list')}
        className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
          apptViewMode === 'list'
            ? 'bg-sky-600 border-sky-600 text-white'
            : 'bg-[var(--bg-hover)] border-[var(--bd)] text-[var(--tx-muted)] hover:text-sky-400'
        }`}
      >
        📋 รายการ
      </button>
      <button
        type="button"
        data-testid="appt-view-toggle-calendar"
        onClick={() => setApptViewMode('calendar')}
        className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
          apptViewMode === 'calendar'
            ? 'bg-sky-600 border-sky-600 text-white'
            : 'bg-[var(--bg-hover)] border-[var(--bd)] text-[var(--tx-muted)] hover:text-sky-400'
        }`}
      >
        📅 ปฏิทิน
      </button>
    </div>
    {apptViewMode === 'list' ? (
      <AppointmentHubView
        branchName={selectedBranch?.name || ''}
        doctors={practitioners.filter(p => p.role === 'doctor')}
        assistants={practitioners.filter(p => p.role === 'assistant')}
        onConfirmAppt={(appt) => {
          // existing flow: cycle status to 'confirmed' via update
          updateAppointment(appt.id, { status: 'confirmed' }).then(() => {
            showToast('ยืนยันนัดสำเร็จ', 2000);
          }).catch((e) => showToast('ยืนยันนัดไม่สำเร็จ: ' + (e?.message || e), 3000));
        }}
        onEditAppt={(appt) => {
          setApptFormMode({ mode: 'edit', appointmentId: appt.id });
        }}
        onCancelAppt={(appt) => {
          if (!confirm('ยกเลิกนัดนี้?')) return;
          updateAppointment(appt.id, { status: 'cancelled' }).then(() => {
            showToast('ยกเลิกนัดสำเร็จ', 2000);
          }).catch((e) => showToast('ยกเลิกนัดไม่สำเร็จ: ' + (e?.message || e), 3000));
        }}
        onCreateTreatmentForAppt={(appt) => {
          setTreatmentFormMode({ mode: 'create', appointmentId: appt.id, customerId: appt.customerId });
        }}
        onEditTreatmentForAppt={(appt) => {
          setTreatmentFormMode({ mode: 'edit', treatmentId: appt.linkedTreatmentId });
        }}
        onOpenLineForAppt={(appt) => {
          if (!appt.customerLineUserId) return;
          window.open(`https://line.me/R/oaMessage/@loverclinic/?customer=${appt.customerHN || appt.customerId}`, '_blank');
        }}
        onAddWalkIn={() => {
          setSessionModalTab('standard');
          setShowSessionModal(true);
        }}
      />
    ) : (
      renderJsxBlock(() => {
        // ── Existing calendar block ──
        // (paste the entire body of the previous IIFE here, unchanged)
        const [y, m] = apptMonth.split('-').map(Number);
        // ... (rest of the existing calendar code) ...
      })
    )}
  </div>
) : ...
```

**IMPORTANT:** the existing calendar IIFE body is ~600 lines. Do NOT inline it into this plan — keep it in place by wrapping it in `apptViewMode === 'calendar' ? (existing IIFE) : null`. The minimum diff:

- BEFORE the existing `) : adminMode === 'appointment' ? renderJsxBlock(() => {` block, the new toggle pill is rendered.
- The existing IIFE block is gated `apptViewMode === 'calendar'` — when `'list'`, render `<AppointmentHubView .../>` instead.

To make the diff small, wrap the entire current `adminMode === 'appointment'` IIFE in a `<div>{toggle}{view==='list' ? <Hub/> : <existing IIFE>}</div>`.

- [ ] **Step 4: Verify the existing helpers exist**

Confirm these are already defined in `AdminDashboard.jsx`:
- `updateAppointment(id, patch)` — yes (used elsewhere)
- `setApptFormMode({mode, appointmentId})` — yes
- `setTreatmentFormMode({mode, ...})` — yes
- `showToast(msg, ms)` — yes
- `setSessionModalTab(tab)` + `setShowSessionModal(bool)` — yes
- `practitioners`, `selectedBranch` — yes

If `selectedBranch` isn't in scope but `selectedBranchId` is, fetch the branch name from `branches` array:
```js
const selectedBranch = branches.find(b => b.id === selectedBranchId) || null;
```

- [ ] **Step 5: Build check**

Run: `npm run build`
Expected: clean build (no errors).

- [ ] **Step 6: Test the dev server**

Run preview server (already running):
- preview_eval to navigate to `/admin` and click `นัดหมาย` tab.
- Verify `[📋 รายการ] [📅 ปฏิทิน]` toggle visible.
- Verify list view loads (4 tabs + cards).
- Click `[📅 ปฏิทิน]` — existing calendar appears unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/pages/AdminDashboard.jsx
git commit -m "feat(V64 task12): AdminDashboard appointment-tab integrates V64 hub view"
```

---

### Task 13: Rule I full-flow simulate test

**Files:**
- Create: `tests/v64-appointment-hub-flow-simulate.test.jsx`

- [ ] **Step 1: Write the test**

Create `tests/v64-appointment-hub-flow-simulate.test.jsx`:

```jsx
// V64 — Rule I full-flow simulate. End-to-end branch switch + tab switch +
// button-wire-source verification. Mocks scopedDataLayer for deterministic
// data; asserts the View component fires the correct handler chain.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

const mockGetAppointmentsByDateRange = vi.fn();
const mockGetAllCustomers = vi.fn();
const mockGetAllDeposits = vi.fn();
const mockGetAllSales = vi.fn();
const mockGetAllMemberships = vi.fn();
const mockGetWalletsForCustomerIds = vi.fn();
const mockListStaffSchedules = vi.fn();

vi.mock('../src/lib/scopedDataLayer.js', () => ({
  getAppointmentsByDateRange: (...args) => mockGetAppointmentsByDateRange(...args),
  getAllCustomers: (...args) => mockGetAllCustomers(...args),
  getAllDeposits: (...args) => mockGetAllDeposits(...args),
  getAllSales: (...args) => mockGetAllSales(...args),
  getAllMemberships: (...args) => mockGetAllMemberships(...args),
  getWalletsForCustomerIds: (...args) => mockGetWalletsForCustomerIds(...args),
  listStaffSchedules: (...args) => mockListStaffSchedules(...args),
}));

vi.mock('../src/lib/staffScheduleValidation.js', () => ({
  resolveDoctorWorkingHoursForDate: vi.fn(() => []),
}));

vi.mock('../src/lib/appointmentTypes.js', () => ({
  resolveAppointmentTypeLabel: (v) => v || '',
  getAppointmentTypeOptions: () => [{ value: 'follow', label: 'นัดติดตาม' }],
}));

const mockUseSelectedBranch = vi.fn();
vi.mock('../src/lib/BranchContext.jsx', () => ({
  useSelectedBranch: () => mockUseSelectedBranch(),
  __esModule: true,
}));

import AppointmentHubView from '../src/components/admin/AppointmentHubView.jsx';

describe('V64.S full-flow simulate', () => {
  beforeEach(() => {
    mockGetAppointmentsByDateRange.mockReset();
    mockGetAllCustomers.mockReset();
    mockGetAllDeposits.mockReset();
    mockGetAllSales.mockReset();
    mockGetAllMemberships.mockReset();
    mockGetWalletsForCustomerIds.mockReset();
    mockListStaffSchedules.mockReset();
    mockUseSelectedBranch.mockReset();

    mockGetAllCustomers.mockResolvedValue([{ id: 'C1', hn: 'HN001', patientData: { firstName: 'Alice', phone: '0811111111' } }]);
    mockGetAllDeposits.mockResolvedValue([]);
    mockGetAllSales.mockResolvedValue([]);
    mockGetAllMemberships.mockResolvedValue([]);
    mockGetWalletsForCustomerIds.mockResolvedValue([]);
    mockListStaffSchedules.mockResolvedValue([]);
    mockGetAppointmentsByDateRange.mockResolvedValue([]);
    mockUseSelectedBranch.mockReturnValue({ branchId: 'BR-A' });
  });

  afterEach(() => vi.clearAllMocks());

  it('S1.1 mount with branch BR-A → loaders fire with branchId=BR-A', async () => {
    render(<AppointmentHubView />);
    await waitFor(() => {
      expect(mockGetAppointmentsByDateRange).toHaveBeenCalled();
      const call = mockGetAppointmentsByDateRange.mock.calls[0][0];
      expect(call.branchId).toBe('BR-A');
    });
  });

  it('S1.2 branch switch BR-A → BR-B → loaders re-fire with new branchId + filters reset', async () => {
    const { rerender } = render(<AppointmentHubView />);
    await waitFor(() => expect(mockGetAppointmentsByDateRange).toHaveBeenCalled());

    mockUseSelectedBranch.mockReturnValue({ branchId: 'BR-B' });
    mockGetAppointmentsByDateRange.mockResolvedValueOnce([{ id: 'B1', customerId: 'C1', date: '2026-05-08', status: 'pending' }]);
    rerender(<AppointmentHubView />);
    await waitFor(() => {
      const calls = mockGetAppointmentsByDateRange.mock.calls;
      expect(calls.some(c => c[0].branchId === 'BR-B')).toBe(true);
    });
  });

  it('S1.3 tab switch today → past triggers reload with new range', async () => {
    render(<AppointmentHubView />);
    await waitFor(() => expect(mockGetAppointmentsByDateRange).toHaveBeenCalled());
    const initialCallCount = mockGetAppointmentsByDateRange.mock.calls.length;
    fireEvent.click(screen.getByTestId('appt-hub-tab-past'));
    await waitFor(() => {
      expect(mockGetAppointmentsByDateRange.mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });

  it('S1.4 confirm button fires onConfirmAppt with appt', async () => {
    mockGetAppointmentsByDateRange.mockResolvedValue([
      { id: 'A1', customerId: 'C1', date: '2026-05-08', startTime: '09:00', endTime: '09:30', status: 'pending' },
    ]);
    const onConfirm = vi.fn();
    // Use today's date in fixture so it appears in 'today' tab default
    const today = new Date().toISOString().slice(0, 10);
    mockGetAppointmentsByDateRange.mockResolvedValue([
      { id: 'A1', customerId: 'C1', date: today, startTime: '09:00', endTime: '09:30', status: 'pending' },
    ]);
    render(<AppointmentHubView onConfirmAppt={onConfirm} />);
    await waitFor(() => expect(screen.getByTestId('row-action-confirm')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('row-action-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][0].id).toBe('A1');
  });

  it('S1.5 walk-in button fires onAddWalkIn', async () => {
    const fn = vi.fn();
    render(<AppointmentHubView onAddWalkIn={fn} />);
    await waitFor(() => expect(screen.getByTestId('appt-hub-walkin-btn')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('appt-hub-walkin-btn'));
    expect(fn).toHaveBeenCalled();
  });

  it('S1.6 source-grep — View imports from scopedDataLayer.js (not raw backendClient)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/admin/AppointmentHubView.jsx', 'utf8');
    expect(src).toMatch(/from ['"]\.\.\/\.\.\/lib\/scopedDataLayer\.js['"]/);
    expect(src).not.toMatch(/from ['"]\.\.\/\.\.\/lib\/backendClient\.js['"]/);
  });

  it('S1.7 V64 marker comment present in View', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/admin/AppointmentHubView.jsx', 'utf8');
    expect(src).toMatch(/V64/);
  });
});
```

- [ ] **Step 2: Run — verify PASS**

Run: `npm test -- --run tests/v64-appointment-hub-flow-simulate.test.jsx`
Expected: PASS (7/7).

- [ ] **Step 3: Commit**

```bash
git add tests/v64-appointment-hub-flow-simulate.test.jsx
git commit -m "test(V64 task13): Rule I full-flow simulate — branch switch + tab switch + button wiring"
```

---

### Task 14: Audit invariants BS-16 + AV36

**Files:**
- Modify: `tests/audit-branch-scope.test.js` (add BS-16 block)
- Modify: `.agents/skills/audit-branch-scope/SKILL.md` (15 → 16 invariants)
- Modify: `.agents/skills/audit-anti-vibe-code/SKILL.md` (35 → 36 invariants)

- [ ] **Step 1: Add BS-16 block to `tests/audit-branch-scope.test.js`**

Find the last `BS-15` block. Append:

```js
describe('BS-16 V64 — AppointmentHub* components branch-scope discipline', () => {
  it('BS-16.1 AppointmentHubView imports useSelectedBranch', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/admin/AppointmentHubView.jsx', 'utf8');
    expect(src).toMatch(/import\s+\{[^}]*useSelectedBranch/);
  });

  it('BS-16.2 AppointmentHubView imports from scopedDataLayer (NOT raw backendClient)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/admin/AppointmentHubView.jsx', 'utf8');
    expect(src).toMatch(/from ['"]\.\.\/\.\.\/lib\/scopedDataLayer\.js['"]/);
    expect(src).not.toMatch(/from ['"]\.\.\/\.\.\/lib\/backendClient\.js['"]/);
  });

  it('BS-16.3 AppointmentHubView includes selectedBranchId in data-load deps', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/admin/AppointmentHubView.jsx', 'utf8');
    // The useEffect deps array must mention selectedBranchId
    expect(src).toMatch(/\[range\.from,\s*range\.to,\s*selectedBranchId\]/);
  });

  it('BS-16.4 V64 marker comment present', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/admin/AppointmentHubView.jsx', 'utf8');
    expect(src).toMatch(/V64/);
  });

  it('BS-16.5 AppointmentHubFilters helper is branch-blind (no branchId in toString)', async () => {
    const mod = await import('../src/lib/appointmentHubFilters.js');
    for (const fnName of ['dateRangeForTab', 'applyTabFilter', 'isMissedAppointment']) {
      expect(typeof mod[fnName]).toBe('function');
      expect(mod[fnName].toString()).not.toMatch(/branchId/);
    }
  });

  it('BS-16.6 AppointmentHubAggregator helper is branch-blind', async () => {
    const mod = await import('../src/lib/appointmentHubAggregator.js');
    expect(mod.buildCustomerSummaryMap.toString()).not.toMatch(/branchId/);
  });
});
```

- [ ] **Step 2: Add AV36 to `audit-anti-vibe-code` test bank**

Find or grep `tests/audit-anti-vibe-code.test.js` (or equivalent registry). If it exists, append:

```js
describe('AV36 V64 — appointment hub PDF print V32 lock', () => {
  it('AV36.1 appointmentHubPrintTemplate.js does NOT import html2pdf', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/lib/appointmentHubPrintTemplate.js', 'utf8');
    expect(src).not.toMatch(/html2pdf/i);
  });

  it('AV36.2 AppointmentHubView uses html2canvas + jspdf (NOT html2pdf) for export', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/admin/AppointmentHubView.jsx', 'utf8');
    expect(src).not.toMatch(/html2pdf/i);
    expect(src).toMatch(/import\(['"]html2canvas['"]\)/);
    expect(src).toMatch(/import\(['"]jspdf['"]\)/);
  });
});
```

If `tests/audit-anti-vibe-code.test.js` doesn't exist, just append the AV36 block to `tests/audit-branch-scope.test.js` after BS-16 (with header comment that AV36 lives there for V64 because no separate AV file exists).

- [ ] **Step 3: Update SKILL.md counts**

Edit `.agents/skills/audit-branch-scope/SKILL.md` — find the invariant count (e.g. "15 invariants") and change to "16 invariants". Add BS-16 row to the invariant table:

```markdown
| BS-16 | AppointmentHub* components branch-scope discipline (V64) | `tests/audit-branch-scope.test.js BS-16.x` | 6 |
```

Edit `.agents/skills/audit-anti-vibe-code/SKILL.md` — find the count (e.g. "35 invariants") and change to "36". Add AV36 row.

- [ ] **Step 4: Run audit tests**

Run: `npm test -- --run tests/audit-branch-scope.test.js`
Expected: PASS — full audit including new BS-16 block.

- [ ] **Step 5: Commit**

```bash
git add tests/audit-branch-scope.test.js .agents/skills/audit-branch-scope/SKILL.md .agents/skills/audit-anti-vibe-code/SKILL.md
git commit -m "test(V64 task14): BS-16 + AV36 audit invariants"
```

---

### Task 15: Final verification — full vitest + build + dev server preview

- [ ] **Step 1: Full vitest run**

Run: `npm test -- --run`
Expected: PASS — full suite (8059 + V64 new tests = ~8120+; 1 skipped). NO regressions.

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: clean (chunk sizes logged; no errors).

- [ ] **Step 3: Preview server visual verify**

Use preview_eval (server already running at 5173):
- Navigate to `/admin`.
- Click `นัดหมาย` tab.
- Verify `[📋 รายการ] [📅 ปฏิทิน]` toggle visible at top.
- Verify list view: 4 tabs, doctor cards header, search bar, action buttons.
- Click `[📅 ปฏิทิน]` — existing calendar block renders.
- Switch back to `[📋 รายการ]` — list reappears.
- Switch BranchSelector top-right — confirm list reloads with new data.

Read-only inspection ONLY — do NOT click action buttons that mutate prod data (per `feedback_no_real_action_in_preview_eval.md`).

- [ ] **Step 4: Console check**

`preview_console_logs` level=error — verify NO new V64-specific errors (the existing always-on listener noise from session-start is OK).

---

### Task 16: State + commit + push

**Files:**
- Modify: `SESSION_HANDOFF.md`
- Modify: `.agents/active.md`
- Create: `.agents/sessions/2026-05-08-v64-appointment-hub.md` (checkpoint)

- [ ] **Step 1: Add session checkpoint**

Create `.agents/sessions/2026-05-08-v64-appointment-hub.md`:

```markdown
# Session Checkpoint — V64 Appointment Coming-Hub

> 2026-05-08 EOD #18 — V64 appointment hub (4 tabs + cards + actions + PDF) shipped.

## Summary

V64 ships the ProClinic-faithful appointment list view at the top of /admin
tab=appointment. Q1=A list-first; Q2=B+D doctors+assistants header; Q3=C
single-load aggregation; Q4=A smart per-tab defaults + missed-chip; Q5=C
jsPDF export.

## Commits

(populate with task1..task16 commit SHAs)

## Files Touched

(populate)

## Test Delta

8059 → ~8120+ GREEN

## Next Todo

Combined `vercel --prod` for V52..V64 (35+ commits ahead).
```

- [ ] **Step 2: Update `.agents/active.md`**

Update header block:
```yaml
updated_at: "2026-05-08 EOD #18 — V64 appointment coming-hub view shipped"
status: "master=<HEAD> (+35 ahead of prod) · ~8120 GREEN · build clean · NOT yet deployed"
last_commit: "feat(V64): appointment coming-hub view + audit invariants"
```

Add new "What this session shipped" entry mentioning V64 with all 5 Qs locked.

- [ ] **Step 3: Update `SESSION_HANDOFF.md`**

Add new section "Session 2026-05-08 EOD #18 — V64 Appointment Coming-Hub" with Q1-Q5 summary + file list + test delta + outstanding deploy.

- [ ] **Step 4: Final commit + push**

```bash
git add .agents/active.md .agents/sessions/2026-05-08-v64-appointment-hub.md SESSION_HANDOFF.md
git commit -m "docs(V64): session checkpoint + handoff state update

V64 appointment coming-hub view shipped — 4 tabs + doctors-cards header +
single-load aggregation + smart per-tab filters + jsPDF export + audit
BS-16 + AV36. ~60 NEW tests across 5 files.

Combined vercel --prod still pending; user authorizes 'deploy' THIS turn.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push origin master
```

---

## Self-Review

Spec coverage check (vs `2026-05-08-appointment-coming-hub-design.md`):

- ✅ Q1 list-first toggle: Task 12 (toggle pill in AdminDashboard)
- ✅ Q2 doctors + assistants header: Task 6 (component) + Task 10 (View shifts memo)
- ✅ Q3 single-load aggregation: Task 4 (aggregator helper) + Task 10 (Promise.all in View)
- ✅ Q4 per-tab smart defaults + missed-chip: Task 3 (filters helper) + Task 9 (RowCard chip)
- ✅ Q5 jsPDF print: Task 5 (template helper) + Task 10 (handlePrint in View)
- ✅ All 5 status flows wired: Task 9 RowCard
- ✅ Branch-scope: Task 1 + Task 2 (lib helpers safe-by-default) + Task 10 (View imports scopedDataLayer)
- ✅ BS-16 + AV36 audit: Task 14
- ✅ Rule I flow simulate: Task 13
- ✅ RTL bank: Task 11

Type consistency: `appt`, `summary`, `tab`, `customerId` used consistently throughout.

Plan complete and saved to `docs/superpowers/plans/2026-05-08-appointment-coming-hub.md`.

## Execution Handoff

**Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task with two-stage review; fastest iteration on a feature this size (16 tasks).

**2. Inline Execution** — execute tasks in this session via `executing-plans` skill; checkpoints between groups.

**Recommend: Subagent-Driven.** V64 has 16 distinct tasks across 7 NEW files + 5 NEW test files + 1 modified file. Subagents keep main context lean.
