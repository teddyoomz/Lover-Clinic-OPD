# V71 OPD Lifecycle Badge + Service-Completed Sub-Tab + LINE/Status De-overlap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 3-stage OPD lifecycle stepper to every Frontend appointment row, fix the LINE-badge overlap with the status chip, add a manual "ลูกค้ารับบริการเรียบร้อย" button on today's tab, and introduce an inline "เสร็จแล้ว" sub-pill under "วันนี้".

**Architecture:** Reuse the canonical Phase 28 `TreatmentLifecycleStepper` + the existing `apptDateTreatments` prop already plumbed by `AppointmentHubView`. One new schema field on `be_appointments` (`serviceCompletedAt`). Two new admin components (`AppointmentOpdStepperRow`, `AppointmentHubTodaySubPillBar`). UI-only change + 1 new writer in `backendClient.js`. No Firestore rules / no deploy required.

**Tech Stack:** React 19 + Vitest 4 + @testing-library/react + Firebase (firestore-only). Branch-scope via `scopedDataLayer.js` (BSA Layer 2). Editorial Ember palette (V64-fix11).

**Spec:** `docs/superpowers/specs/2026-05-15-opd-lifecycle-badge-frontend-appt-list-design.md`

---

### Task 1: Writer — `markAppointmentServiceCompleted` in backendClient + scopedDataLayer re-export

**Files:**
- Create: `tests/v71-mark-service-completed.test.js`
- Modify: `src/lib/backendClient.js` (append new exported function after the existing `appointmentDoc` writers ~line 2400)
- Modify: `src/lib/scopedDataLayer.js` (universal re-export — appointment-doc writes are NOT branch-scoped because the doc is keyed by id)

- [ ] **Step 1.1: Write failing test**

Create `tests/v71-mark-service-completed.test.js`:

```js
// V71 — markAppointmentServiceCompleted writer.
// Single-doc updateDoc({serviceCompletedAt: serverTimestamp(), serviceCompletedBy: uid}).
// No branch-scope (appt id is the key).

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mock — Firebase modules
vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    updateDoc: vi.fn(),
    serverTimestamp: vi.fn(() => '__SERVER_TS__'),
    doc: vi.fn((...args) => ({ __doc: args.join('/') })),
  };
});

vi.mock('../src/firebase.js', () => ({ db: {} }));

import { updateDoc } from 'firebase/firestore';
import { markAppointmentServiceCompleted } from '../src/lib/backendClient.js';

describe('V71 markAppointmentServiceCompleted', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('M1.1 writes serviceCompletedAt:serverTimestamp + serviceCompletedBy:uid to be_appointments doc', async () => {
    await markAppointmentServiceCompleted('BA-test-1', 'uid-staff-1');
    expect(updateDoc).toHaveBeenCalledTimes(1);
    const [docRef, payload] = updateDoc.mock.calls[0];
    expect(docRef).toBeDefined();
    expect(payload).toEqual({
      serviceCompletedAt: '__SERVER_TS__',
      serviceCompletedBy: 'uid-staff-1',
    });
  });

  it('M1.2 throws when apptId empty (fail loud)', async () => {
    await expect(markAppointmentServiceCompleted('', 'uid-staff-1'))
      .rejects.toThrow(/APPT_ID/);
  });

  it('M1.3 tolerates missing uid (admin SDK or anon admin sets null)', async () => {
    await markAppointmentServiceCompleted('BA-test-2', '');
    const [, payload] = updateDoc.mock.calls[0];
    expect(payload.serviceCompletedBy).toBe('');
  });

  it('M1.4 scopedDataLayer re-exports the function', async () => {
    const mod = await import('../src/lib/scopedDataLayer.js');
    expect(typeof mod.markAppointmentServiceCompleted).toBe('function');
  });
});
```

- [ ] **Step 1.2: Run test, verify it fails**

Run: `npx vitest run tests/v71-mark-service-completed.test.js`
Expected: FAIL — `markAppointmentServiceCompleted is not a function` / module export missing.

- [ ] **Step 1.3: Implement writer in `backendClient.js`**

Append to `src/lib/backendClient.js` (find an existing appointment writer like `confirmBackendAppointment` and append immediately after it for locality):

```js
// V71 (2026-05-15) — Mark appointment as service-completed on today's tab.
// Writes ONE forensic-stamped field pair + serverTimestamp. No branch-scope
// (doc id is the key). Caller passes Firebase Auth uid for serviceCompletedBy
// (empty string allowed for admin-SDK paths).
export async function markAppointmentServiceCompleted(apptId, uid) {
  if (!apptId || typeof apptId !== 'string') {
    throw new Error('V71_MARK_SERVICE_COMPLETED_REQUIRES_APPT_ID');
  }
  await updateDoc(appointmentDoc(apptId), {
    serviceCompletedAt: serverTimestamp(),
    serviceCompletedBy: typeof uid === 'string' ? uid : '',
  });
}
```

Make sure `serverTimestamp` is imported at the top of `backendClient.js` (it almost certainly already is; if not, add to the firestore import line).

- [ ] **Step 1.4: Re-export from `scopedDataLayer.js`**

In `src/lib/scopedDataLayer.js`, find the universal-passthrough exports block (search for `export const ... = raw.` pattern with NO branch injection). Append:

```js
// V71 (2026-05-15) — universal pass-through; appt-id-keyed write, no branch-scope.
export const markAppointmentServiceCompleted = (...args) =>
  raw.markAppointmentServiceCompleted(...args);
```

- [ ] **Step 1.5: Run test, verify it passes**

Run: `npx vitest run tests/v71-mark-service-completed.test.js`
Expected: PASS (4 tests).

- [ ] **Step 1.6: Commit**

```bash
git add tests/v71-mark-service-completed.test.js src/lib/backendClient.js src/lib/scopedDataLayer.js
git commit -m "feat(V71): markAppointmentServiceCompleted writer + scopedDataLayer re-export"
```

---

### Task 2: Filter helper extension — `todaySubPill` param + `subPillCountsForToday`

**Files:**
- Create: `tests/v71-today-sub-pill-filter.test.js`
- Modify: `src/lib/appointmentHubFilters.js`

- [ ] **Step 2.1: Write failing test**

Create `tests/v71-today-sub-pill-filter.test.js`:

```js
// V71 — Today sub-pill filter (กำลังรอ / เสร็จแล้ว).
// applyTabFilter accepts `todaySubPill: 'waiting'|'completed'` — ignored unless tab==='today'.
// subPillCountsForToday derives counts from same apptList.

import { describe, it, expect } from 'vitest';
import { applyTabFilter, subPillCountsForToday } from '../src/lib/appointmentHubFilters.js';

const now = new Date('2026-05-15T10:00:00+07:00');
const today = '2026-05-15';

const baseAppts = [
  { id: 'A1', date: today, startTime: '10:00', status: 'confirmed', serviceCompletedAt: null },
  { id: 'A2', date: today, startTime: '11:00', status: 'confirmed', serviceCompletedAt: { seconds: 12345 } },
  { id: 'A3', date: today, startTime: '12:00', status: 'pending', serviceCompletedAt: null },
  { id: 'A4', date: '2026-05-16', startTime: '09:00', status: 'pending', serviceCompletedAt: null },
];

describe('V71 applyTabFilter todaySubPill', () => {
  it('S2.1 today + waiting → only !serviceCompletedAt rows', () => {
    const out = applyTabFilter(baseAppts, { tab: 'today', todaySubPill: 'waiting', now });
    expect(out.map(a => a.id).sort()).toEqual(['A1', 'A3']);
  });

  it('S2.2 today + completed → only serviceCompletedAt!=null rows', () => {
    const out = applyTabFilter(baseAppts, { tab: 'today', todaySubPill: 'completed', now });
    expect(out.map(a => a.id)).toEqual(['A2']);
  });

  it('S2.3 today + no todaySubPill → both (legacy default = waiting OR completed = today rows)', () => {
    const out = applyTabFilter(baseAppts, { tab: 'today', now });
    expect(out.map(a => a.id).sort()).toEqual(['A1', 'A2', 'A3']);
  });

  it('S2.4 tomorrow tab — todaySubPill param ignored', () => {
    const out = applyTabFilter(baseAppts, { tab: 'tomorrow', todaySubPill: 'completed', now });
    expect(out.map(a => a.id)).toEqual(['A4']);
  });
});

describe('V71 subPillCountsForToday', () => {
  it('S2.5 derives waiting/completed counts from apptList', () => {
    const counts = subPillCountsForToday(baseAppts, now);
    expect(counts).toEqual({ waiting: 2, completed: 1 });
  });

  it('S2.6 ignores non-today appts', () => {
    const onlyTomorrow = [
      { id: 'X', date: '2026-05-16', status: 'confirmed', serviceCompletedAt: null },
    ];
    expect(subPillCountsForToday(onlyTomorrow, now)).toEqual({ waiting: 0, completed: 0 });
  });

  it('S2.7 handles serviceCompletedAt as Firestore Timestamp object (truthy check, not value)', () => {
    const fsTimestamp = { toDate: () => new Date(), seconds: 1, nanoseconds: 0 };
    const list = [
      { id: 'A', date: today, status: 'confirmed', serviceCompletedAt: fsTimestamp },
    ];
    expect(subPillCountsForToday(list, now)).toEqual({ waiting: 0, completed: 1 });
  });
});
```

- [ ] **Step 2.2: Run test, verify it fails**

Run: `npx vitest run tests/v71-today-sub-pill-filter.test.js`
Expected: FAIL — `subPillCountsForToday` undefined OR `applyTabFilter` ignores `todaySubPill`.

- [ ] **Step 2.3: Extend `applyTabFilter` + add helper**

Open `src/lib/appointmentHubFilters.js`. Find the `applyTabFilter` function. Inside the `today` tab branch (after the existing today-specific filter logic but BEFORE the final return), add:

```js
// V71 (2026-05-15) — today sub-pill split.
if (tab === 'today' && opts && (opts.todaySubPill === 'waiting' || opts.todaySubPill === 'completed')) {
  filtered = filtered.filter(a =>
    opts.todaySubPill === 'completed' ? !!a.serviceCompletedAt : !a.serviceCompletedAt
  );
}
```

Make sure `filtered` is the variable used inside the function for the working list right before the final return; if the function returns a literal computation, refactor minimally to bind it. The exact placement: directly before the final `return filtered;` (or equivalent).

At the bottom of the file, append:

```js
// V71 (2026-05-15) — count helper for the today inline sub-pill bar.
// Returns {waiting, completed} from the same appts array the view already holds.
export function subPillCountsForToday(appts, now = new Date()) {
  const todayList = applyTabFilter(appts, { tab: 'today', now });
  let waiting = 0;
  let completed = 0;
  for (const a of todayList) {
    if (a && a.serviceCompletedAt) completed++;
    else waiting++;
  }
  return { waiting, completed };
}
```

- [ ] **Step 2.4: Run test, verify it passes**

Run: `npx vitest run tests/v71-today-sub-pill-filter.test.js`
Expected: PASS (7 tests).

- [ ] **Step 2.5: Commit**

```bash
git add tests/v71-today-sub-pill-filter.test.js src/lib/appointmentHubFilters.js
git commit -m "feat(V71): applyTabFilter todaySubPill param + subPillCountsForToday helper"
```

---

### Task 3: `AppointmentOpdStepperRow` component

**Files:**
- Create: `tests/v71-opd-stepper-row.test.jsx`
- Create: `src/components/admin/AppointmentOpdStepperRow.jsx`

- [ ] **Step 3.1: Write failing test**

Create `tests/v71-opd-stepper-row.test.jsx`:

```jsx
// V71 — AppointmentOpdStepperRow wrapper over TreatmentLifecycleStepper.
// Visibility matrix:
//  - latestTreatment present → full stepper, isLatest=true
//  - !latestTreatment + isTodayTab=true → muted stepper (3 pending-future dots)
//  - !latestTreatment + isTodayTab=false → render null

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AppointmentOpdStepperRow from '../src/components/admin/AppointmentOpdStepperRow.jsx';

const treatmentWithVitals = {
  id: 'T1',
  vitalsignsRecordedAt: { toDate: () => new Date('2026-05-15T08:00:00') },
  status: 'vitalsigns-recorded',
  recordedAt: '2026-05-15T08:00:00',
};

describe('V71 AppointmentOpdStepperRow', () => {
  it('R1.1 renders stepper with label "สถานะ OPD" when latestTreatment present', () => {
    render(<AppointmentOpdStepperRow latestTreatment={treatmentWithVitals} isTodayTab={true} />);
    expect(screen.getByText('สถานะ OPD')).toBeInTheDocument();
    expect(screen.getByTestId('treatment-lifecycle-stepper')).toBeInTheDocument();
    expect(screen.getByTestId('appt-row-opd-stepper')).toBeInTheDocument();
  });

  it('R1.2 renders muted stepper when no treatment + today tab', () => {
    render(<AppointmentOpdStepperRow latestTreatment={null} isTodayTab={true} />);
    expect(screen.getByTestId('appt-row-opd-stepper')).toBeInTheDocument();
    expect(screen.getByTestId('treatment-lifecycle-stepper')).toBeInTheDocument();
    // Muted: all 3 dots present, none have done state
    const dots = screen.getAllByTestId('stepper-dot');
    expect(dots).toHaveLength(3);
  });

  it('R1.3 renders null when no treatment + non-today tab', () => {
    const { container } = render(<AppointmentOpdStepperRow latestTreatment={null} isTodayTab={false} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('appt-row-opd-stepper')).toBeNull();
  });

  it('R1.4 renders stepper for past tab when treatment present', () => {
    render(<AppointmentOpdStepperRow latestTreatment={treatmentWithVitals} isTodayTab={false} />);
    expect(screen.getByTestId('appt-row-opd-stepper')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3.2: Run test, verify it fails**

Run: `npx vitest run tests/v71-opd-stepper-row.test.jsx`
Expected: FAIL — component file does not exist.

- [ ] **Step 3.3: Create component**

Create `src/components/admin/AppointmentOpdStepperRow.jsx`:

```jsx
// V71 (2026-05-15) — Bottom-row wrapper around the canonical Phase 28
// `TreatmentLifecycleStepper` for use inside <AppointmentHubRowCard>.
// Visibility rules per spec §3.1:
//  - latestTreatment present     → full stepper, isLatest=true (pulse on next pending)
//  - no treatment + today tab    → muted stepper (3 pending-future dots, no times)
//  - no treatment + other tabs   → render null entirely
//
// Pure-display; no Firestore writes; data prop flows from AppointmentHubView's
// already-loaded `treatmentsByCustomerDate.get(...)[0]`.

import React from 'react';
import { TreatmentLifecycleStepper } from '../backend/treatment-history/TreatmentLifecycleStepper.jsx';
import { getTreatmentLifecycle } from '../../lib/treatmentDisplayResolvers.js';

export default function AppointmentOpdStepperRow({ latestTreatment, isTodayTab }) {
  // Hide entirely on non-today tabs when no treatment exists.
  if (!latestTreatment && !isTodayTab) return null;

  // Derive lifecycle from real treatment (drives all 3 stages + colors + times)
  // OR pass empty array → stepper renders 3 muted pending dots.
  const lifecycle = latestTreatment ? getTreatmentLifecycle(latestTreatment) : [];
  const isLatest = !!latestTreatment;

  return (
    <div
      className="border-t border-[var(--bd)] mt-3 pt-3"
      data-testid="appt-row-opd-stepper"
    >
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--tx-muted)] shrink-0">
          สถานะ OPD
        </span>
        <TreatmentLifecycleStepper lifecycle={lifecycle} isLatest={isLatest} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3.4: Run test, verify it passes**

Run: `npx vitest run tests/v71-opd-stepper-row.test.jsx`
Expected: PASS (4 tests).

- [ ] **Step 3.5: Commit**

```bash
git add tests/v71-opd-stepper-row.test.jsx src/components/admin/AppointmentOpdStepperRow.jsx
git commit -m "feat(V71): AppointmentOpdStepperRow wrapper (TreatmentLifecycleStepper + visibility rules)"
```

---

### Task 4: `AppointmentHubTodaySubPillBar` component

**Files:**
- Create: `tests/v71-today-sub-pill-bar.test.jsx`
- Create: `src/components/admin/AppointmentHubTodaySubPillBar.jsx`

- [ ] **Step 4.1: Write failing test**

Create `tests/v71-today-sub-pill-bar.test.jsx`:

```jsx
// V71 — TodaySubPillBar.
// Renders TWO pills with counts. Active pill is styled distinctly.
// onSubPillChange callback fires with 'waiting' | 'completed' on click.

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AppointmentHubTodaySubPillBar from '../src/components/admin/AppointmentHubTodaySubPillBar.jsx';

describe('V71 AppointmentHubTodaySubPillBar', () => {
  it('SP1.1 renders both pills with correct counts', () => {
    render(<AppointmentHubTodaySubPillBar
      activeSubPill="waiting"
      waitingCount={3}
      completedCount={5}
      onSubPillChange={() => {}}
    />);
    expect(screen.getByText(/กำลังรอ/)).toBeInTheDocument();
    expect(screen.getByText(/เสร็จแล้ว/)).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('SP1.2 active pill has aria-selected=true', () => {
    render(<AppointmentHubTodaySubPillBar
      activeSubPill="completed"
      waitingCount={0}
      completedCount={2}
      onSubPillChange={() => {}}
    />);
    const completedBtn = screen.getByTestId('sub-pill-completed');
    const waitingBtn = screen.getByTestId('sub-pill-waiting');
    expect(completedBtn).toHaveAttribute('aria-selected', 'true');
    expect(waitingBtn).toHaveAttribute('aria-selected', 'false');
  });

  it('SP1.3 clicking inactive pill calls onSubPillChange', () => {
    const handler = vi.fn();
    render(<AppointmentHubTodaySubPillBar
      activeSubPill="waiting"
      waitingCount={1}
      completedCount={1}
      onSubPillChange={handler}
    />);
    fireEvent.click(screen.getByTestId('sub-pill-completed'));
    expect(handler).toHaveBeenCalledWith('completed');
  });

  it('SP1.4 zero count still renders (no hide)', () => {
    render(<AppointmentHubTodaySubPillBar
      activeSubPill="waiting"
      waitingCount={0}
      completedCount={0}
      onSubPillChange={() => {}}
    />);
    expect(screen.getByText(/กำลังรอ/)).toBeInTheDocument();
    expect(screen.getByText(/เสร็จแล้ว/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 4.2: Run test, verify it fails**

Run: `npx vitest run tests/v71-today-sub-pill-bar.test.jsx`
Expected: FAIL — component does not exist.

- [ ] **Step 4.3: Create component**

Create `src/components/admin/AppointmentHubTodaySubPillBar.jsx`:

```jsx
// V71 (2026-05-15) — Inline sub-pill bar rendered ONLY when activeTab==='today'.
// Splits today's queue into "กำลังรอ" (default) and "เสร็จแล้ว" (manually marked
// complete via the row button). Caller owns the activeSubPill state +
// onSubPillChange handler.

import React from 'react';

const PILL_BASE =
  'px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors flex items-center gap-2';

const PILL_ACTIVE = {
  waiting: 'bg-amber-600 border-amber-600 text-white',
  completed: 'bg-emerald-700 border-emerald-700 text-white',
};

const PILL_INACTIVE =
  'bg-[var(--bg-hover)] border-[var(--bd)] text-[var(--tx-muted)] hover:text-[var(--tx-heading)]';

function pillClass(key, active) {
  return `${PILL_BASE} ${active ? PILL_ACTIVE[key] : PILL_INACTIVE}`;
}

export default function AppointmentHubTodaySubPillBar({
  activeSubPill = 'waiting',
  waitingCount = 0,
  completedCount = 0,
  onSubPillChange,
}) {
  return (
    <div
      role="tablist"
      aria-label="วันนี้ — แบ่งสถานะรับบริการ"
      className="flex gap-2 mb-3 pl-2"
      data-testid="appt-hub-today-sub-pill-bar"
    >
      <button
        type="button"
        role="tab"
        data-testid="sub-pill-waiting"
        aria-selected={activeSubPill === 'waiting' ? 'true' : 'false'}
        onClick={() => onSubPillChange?.('waiting')}
        className={pillClass('waiting', activeSubPill === 'waiting')}
      >
        <span>⏳ กำลังรอ</span>
        <span className="font-mono">{waitingCount}</span>
      </button>
      <button
        type="button"
        role="tab"
        data-testid="sub-pill-completed"
        aria-selected={activeSubPill === 'completed' ? 'true' : 'false'}
        onClick={() => onSubPillChange?.('completed')}
        className={pillClass('completed', activeSubPill === 'completed')}
      >
        <span>✓ เสร็จแล้ว</span>
        <span className="font-mono">{completedCount}</span>
      </button>
    </div>
  );
}
```

- [ ] **Step 4.4: Run test, verify it passes**

Run: `npx vitest run tests/v71-today-sub-pill-bar.test.jsx`
Expected: PASS (4 tests).

- [ ] **Step 4.5: Commit**

```bash
git add tests/v71-today-sub-pill-bar.test.jsx src/components/admin/AppointmentHubTodaySubPillBar.jsx
git commit -m "feat(V71): AppointmentHubTodaySubPillBar inline sub-pill bar component"
```

---

### Task 5: Modify `AppointmentHubRowCard` — inline LINE badge + OPD stepper row + complete button

**Files:**
- Create: `tests/v71-row-card-integration.test.jsx`
- Modify: `src/components/admin/AppointmentHubRowCard.jsx`

- [ ] **Step 5.1: Write failing test**

Create `tests/v71-row-card-integration.test.jsx`:

```jsx
// V71 — AppointmentHubRowCard integration: LINE badge inline, OPD stepper row,
// complete button on today tab with treatment present.

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AppointmentHubRowCard from '../src/components/admin/AppointmentHubRowCard.jsx';

const baseAppt = {
  id: 'BA-V71-test',
  customerId: 'C-V71',
  customerName: 'นางสาว แพรพร พรแพร',
  date: '2026-05-15',
  startTime: '13:15',
  endTime: '14:15',
  status: 'confirmed',
  notifyChannel: ['line'],  // triggers LINE badge
  customerLineUserId: 'Uxxx',
  doctorName: 'หมอมายด์',
  roomName: 'ห้องแพทย์/ผ่าตัด',
  appointmentTo: 'botox',
  serviceCompletedAt: null,
};

const baseSummary = {
  hn: '000004',
  name: 'นางสาว แพรพร พรแพร',
  walletBalance: 207000,
};

const treatment = {
  id: 'T-V71',
  vitalsignsRecordedAt: { toDate: () => new Date('2026-05-15T08:00:00') },
  status: 'vitalsigns-recorded',
};

describe('V71 RowCard LINE badge moved inline', () => {
  it('RC1.1 LINE badge renders INSIDE row (not absolute-positioned)', () => {
    const { container } = render(
      <AppointmentHubRowCard
        appt={baseAppt}
        summary={baseSummary}
        apptDateTreatments={[]}
        isTodayTab={false}
      />
    );
    const lineBadge = container.querySelector('[data-testid="line-badge"]');
    expect(lineBadge).toBeTruthy();
    // Walk parents — no absolute-positioned ancestor inside the card root
    let node = lineBadge;
    while (node && node !== container) {
      const cls = node.className || '';
      expect(typeof cls === 'string' && cls.includes('absolute')).toBe(false);
      node = node.parentElement;
    }
  });
});

describe('V71 RowCard OPD stepper row', () => {
  it('RC2.1 stepper row renders with latestTreatment', () => {
    render(
      <AppointmentHubRowCard
        appt={baseAppt}
        summary={baseSummary}
        apptDateTreatments={[treatment]}
        isTodayTab={true}
      />
    );
    expect(screen.getByTestId('appt-row-opd-stepper')).toBeInTheDocument();
  });

  it('RC2.2 stepper row renders MUTED on today tab with no treatment', () => {
    render(
      <AppointmentHubRowCard
        appt={baseAppt}
        summary={baseSummary}
        apptDateTreatments={[]}
        isTodayTab={true}
      />
    );
    expect(screen.getByTestId('appt-row-opd-stepper')).toBeInTheDocument();
  });

  it('RC2.3 stepper row HIDDEN on tomorrow tab with no treatment', () => {
    render(
      <AppointmentHubRowCard
        appt={baseAppt}
        summary={baseSummary}
        apptDateTreatments={[]}
        isTodayTab={false}
      />
    );
    expect(screen.queryByTestId('appt-row-opd-stepper')).toBeNull();
  });
});

describe('V71 RowCard service-completed button', () => {
  it('RC3.1 button visible on today + treatment exists + not yet completed', () => {
    render(
      <AppointmentHubRowCard
        appt={baseAppt}
        summary={baseSummary}
        apptDateTreatments={[treatment]}
        isTodayTab={true}
        onMarkServiceComplete={() => {}}
      />
    );
    expect(screen.getByTestId('row-action-mark-complete')).toBeInTheDocument();
  });

  it('RC3.2 button HIDDEN when no treatment', () => {
    render(
      <AppointmentHubRowCard
        appt={baseAppt}
        summary={baseSummary}
        apptDateTreatments={[]}
        isTodayTab={true}
        onMarkServiceComplete={() => {}}
      />
    );
    expect(screen.queryByTestId('row-action-mark-complete')).toBeNull();
  });

  it('RC3.3 button HIDDEN on non-today tab', () => {
    render(
      <AppointmentHubRowCard
        appt={baseAppt}
        summary={baseSummary}
        apptDateTreatments={[treatment]}
        isTodayTab={false}
        onMarkServiceComplete={() => {}}
      />
    );
    expect(screen.queryByTestId('row-action-mark-complete')).toBeNull();
  });

  it('RC3.4 button HIDDEN when serviceCompletedAt already set', () => {
    const completedAppt = { ...baseAppt, serviceCompletedAt: { seconds: 12345 } };
    render(
      <AppointmentHubRowCard
        appt={completedAppt}
        summary={baseSummary}
        apptDateTreatments={[treatment]}
        isTodayTab={true}
        onMarkServiceComplete={() => {}}
      />
    );
    expect(screen.queryByTestId('row-action-mark-complete')).toBeNull();
  });

  it('RC3.5 click → confirm → calls onMarkServiceComplete with appt', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const handler = vi.fn();
    render(
      <AppointmentHubRowCard
        appt={baseAppt}
        summary={baseSummary}
        apptDateTreatments={[treatment]}
        isTodayTab={true}
        onMarkServiceComplete={handler}
      />
    );
    fireEvent.click(screen.getByTestId('row-action-mark-complete'));
    expect(confirmSpy).toHaveBeenCalled();
    expect(handler).toHaveBeenCalledWith(baseAppt);
    confirmSpy.mockRestore();
  });

  it('RC3.6 click → confirm-no → handler NOT called', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const handler = vi.fn();
    render(
      <AppointmentHubRowCard
        appt={baseAppt}
        summary={baseSummary}
        apptDateTreatments={[treatment]}
        isTodayTab={true}
        onMarkServiceComplete={handler}
      />
    );
    fireEvent.click(screen.getByTestId('row-action-mark-complete'));
    expect(handler).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
```

Note: The `AppointmentLineBadge` component must render a `data-testid="line-badge"` attribute on its root span/div. If it doesn't already, we'll patch it in the same task.

- [ ] **Step 5.2: Run test, verify it fails**

Run: `npx vitest run tests/v71-row-card-integration.test.jsx`
Expected: FAIL — RowCard doesn't accept `isTodayTab`, `onMarkServiceComplete`, LINE badge still absolute-positioned in parent, stepper not rendered.

- [ ] **Step 5.3: Verify `AppointmentLineBadge` has `data-testid="line-badge"`**

Open `src/components/AppointmentLineBadge.jsx` and verify the root element has `data-testid="line-badge"`. If absent, add it:

```jsx
return (
  <span data-testid="line-badge" className={...}>
    LINE
  </span>
);
```

Match the exact existing render structure — only add the attribute. The badge already self-nullifies when no LINE channel; data-testid only renders alongside the badge content.

- [ ] **Step 5.4: Modify `AppointmentHubRowCard.jsx`**

Edits to `src/components/admin/AppointmentHubRowCard.jsx`:

**(a) Add imports at top of file** (after existing imports):

```jsx
import AppointmentOpdStepperRow from './AppointmentOpdStepperRow.jsx';
import { AppointmentLineBadge } from '../AppointmentLineBadge.jsx';
```

**(b) Extend the component prop signature** — add `isTodayTab` and `onMarkServiceComplete`:

```jsx
export default function AppointmentHubRowCard({
  appt,
  summary,
  apptDeposit,
  apptDateTreatments = [],
  isTodayTab = false,                    // V71 NEW
  now = new Date(),
  onConfirm, onEdit, onCancel,
  onCreateTreatment, onEditTreatment, onOpenLine,
  onMarkServiceComplete,                 // V71 NEW
}) {
```

**(c) Add the V71 derived flag** right after the existing `hasTreatmentForDay` line:

```jsx
const hasTreatmentForDay = !!latestTreatment;
// V71 (2026-05-15) — service-completed button visibility: today tab + treatment
// exists + not yet marked complete. serviceCompletedAt is a Firestore Timestamp
// or null; truthy-check works for both.
const showMarkCompleteBtn = isTodayTab && hasTreatmentForDay && !appt.serviceCompletedAt;
```

**(d) Replace the RIGHT column status-chip block** — find the current:

```jsx
<div className="flex flex-col gap-2 items-start md:items-end justify-start md:min-w-[200px]">
  <span
    className={`text-[11px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${STATUS_CHIP_CLS[status] || ''}`}
    data-testid="row-status"
  >
    {statusLabel}
  </span>
  <div className="flex gap-1.5 flex-wrap md:justify-end">
```

Replace with:

```jsx
<div className="flex flex-col gap-2 items-start md:items-end justify-start md:min-w-[200px]">
  {/* V71 (2026-05-15) — LINE badge inline with status chip (de-overlap from
      absolute top-right). Self-nullifies when appt.notifyChannel !== 'line'. */}
  <div className="flex items-center gap-2 flex-wrap md:justify-end">
    <AppointmentLineBadge appt={appt} size="xs" />
    <span
      className={`text-[11px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${STATUS_CHIP_CLS[status] || ''}`}
      data-testid="row-status"
    >
      {statusLabel}
    </span>
  </div>
  <div className="flex gap-1.5 flex-wrap md:justify-end">
```

**(e) Inside the button group, INSERT the V71 mark-complete button** as the FIRST conditional, right after the opening `<div className="flex gap-1.5 flex-wrap md:justify-end">`:

```jsx
{/* V71 (2026-05-15) — mark service complete (today tab only, treatment recorded,
    not already completed). Confirm dialog before optimistic write. */}
{showMarkCompleteBtn && (
  <button
    type="button"
    data-testid="row-action-mark-complete"
    onClick={() => {
      if (window.confirm('ยืนยันลูกค้าได้รับบริการเรียบร้อย? ลูกค้าจะถูกย้ายไปแท็บ "เสร็จแล้ว"')) {
        onMarkServiceComplete?.(appt);
      }
    }}
    className={BTN_PRIMARY}
  >
    ✓ ลูกค้ารับบริการเรียบร้อย
  </button>
)}
```

**(f) After the closing `</div>` of the outer card (right before the final `</div>` of the root return), insert the OPD stepper row** — actually insert it AS THE LAST CHILD of the root div (after the RIGHT column). The root return looks like:

```jsx
return (
  <div className={`${CARD_SURFACE} flex flex-col md:flex-row gap-4`} ... >
    <span className={ACCENT_BAR_BASE} ... />
    <div className="flex-1 ..."> {/* LEFT */} ... </div>
    <div className="flex-1 ..."> {/* MIDDLE */} ... </div>
    <div className="flex flex-col ..."> {/* RIGHT */} ... </div>
  </div>
);
```

Change the root flex direction so the stepper row can sit BELOW the three columns. Wrap the existing 3-column layout in an inner container, then append the stepper row:

```jsx
return (
  <div
    className={`${CARD_SURFACE} flex flex-col`}
    data-testid="appt-hub-row"
    data-appt-id={appt.id}
    data-status-accent={accentKey}
  >
    <span aria-hidden="true" data-testid="row-accent-bar" className={`${ACCENT_BAR_BASE} ${accentClass}`} />
    {/* V71 (2026-05-15) — 3-column body wrapped so V71 stepper row sits below. */}
    <div className="flex flex-col md:flex-row gap-4">
      <div className="flex-1 min-w-0 md:min-w-[260px] pl-2">
        {/* LEFT — unchanged */}
        ...
      </div>
      <div className="flex-1 min-w-0 md:min-w-[260px] text-xs space-y-1">
        {/* MIDDLE — unchanged */}
        ...
      </div>
      <div className="flex flex-col gap-2 items-start md:items-end justify-start md:min-w-[200px]">
        {/* RIGHT — modified per (d) + (e) */}
        ...
      </div>
    </div>
    {/* V71 (2026-05-15) — full-width OPD lifecycle stepper row, sits below the
        3-column body. Self-nullifies when no treatment + non-today tab. */}
    <AppointmentOpdStepperRow latestTreatment={latestTreatment} isTodayTab={isTodayTab} />
  </div>
);
```

Be careful: the `CARD_SURFACE` style includes a flex direction. After this change the OUTER div uses `flex flex-col` (with no `md:flex-row`) and the INNER div has `flex flex-col md:flex-row gap-4` — that's how the stepper sits below the columns. Verify the rendered layout matches expectation.

- [ ] **Step 5.5: Run test, verify it passes**

Run: `npx vitest run tests/v71-row-card-integration.test.jsx`
Expected: PASS (10 tests).

- [ ] **Step 5.6: Run sibling RTL tests for the row card to catch V21 regressions**

Run: `npx vitest run tests/v64-appointment-hub-flow-simulate.test.jsx`
Expected: PASS (or identify + fix any V21-class lock-in inline — likely the LINE badge absolute test if one exists).

- [ ] **Step 5.7: Commit**

```bash
git add tests/v71-row-card-integration.test.jsx src/components/admin/AppointmentHubRowCard.jsx src/components/AppointmentLineBadge.jsx
git commit -m "feat(V71): RowCard LINE inline + OPD stepper row + mark-complete button"
```

---

### Task 6: Modify `AppointmentHubView` — sub-pill state, render bar, remove absolute LINE wrapper, plumb props

**Files:**
- Create: `tests/v71-hub-view-sub-pill.test.jsx`
- Modify: `src/components/admin/AppointmentHubView.jsx`

- [ ] **Step 6.1: Write failing test**

Create `tests/v71-hub-view-sub-pill.test.jsx`:

```jsx
// V71 — AppointmentHubView sub-pill bar renders on today tab, filters by waiting/completed.

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock scopedDataLayer — return today's appts (some completed, some waiting)
vi.mock('../src/lib/scopedDataLayer.js', () => ({
  getAppointmentsByDateRange: vi.fn(),
  getAllCustomers: vi.fn(() => Promise.resolve([])),
  getAllDeposits: vi.fn(() => Promise.resolve([])),
  getAllSales: vi.fn(() => Promise.resolve([])),
  getAllMemberships: vi.fn(() => Promise.resolve([])),
  getWalletsForCustomerIds: vi.fn(() => Promise.resolve([])),
  listStaffSchedules: vi.fn(() => Promise.resolve([])),
  markAppointmentServiceCompleted: vi.fn(() => Promise.resolve()),
}));
vi.mock('../src/lib/reportsLoaders.js', () => ({
  loadTreatmentsByDateRange: vi.fn(() => Promise.resolve([])),
}));
vi.mock('../src/lib/BranchContext.jsx', () => ({
  useSelectedBranch: () => ({ branchId: 'BR-V71-test' }),
}));

import { getAppointmentsByDateRange } from '../src/lib/scopedDataLayer.js';
import AppointmentHubView from '../src/components/admin/AppointmentHubView.jsx';

// Build a date string for today in Bangkok TZ.
function todayBangkok() {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

describe('V71 AppointmentHubView sub-pill bar', () => {
  beforeEach(() => {
    const today = todayBangkok();
    getAppointmentsByDateRange.mockResolvedValue([
      { id: 'A1', date: today, startTime: '10:00', customerId: 'C1', customerName: 'Waiter 1', status: 'confirmed', serviceCompletedAt: null },
      { id: 'A2', date: today, startTime: '11:00', customerId: 'C2', customerName: 'Done 1',   status: 'confirmed', serviceCompletedAt: { seconds: 1 } },
      { id: 'A3', date: today, startTime: '12:00', customerId: 'C3', customerName: 'Waiter 2', status: 'pending',   serviceCompletedAt: null },
    ]);
  });

  it('VS1.1 sub-pill bar renders on today tab with correct counts', async () => {
    render(<AppointmentHubView />);
    await waitFor(() => expect(screen.getByTestId('appt-hub-today-sub-pill-bar')).toBeInTheDocument());
    expect(screen.getByTestId('sub-pill-waiting')).toHaveTextContent('2');
    expect(screen.getByTestId('sub-pill-completed')).toHaveTextContent('1');
  });

  it('VS1.2 default sub-pill = waiting; only 2 waiting rows visible', async () => {
    render(<AppointmentHubView />);
    await waitFor(() => expect(screen.getAllByTestId('appt-hub-row').length).toBe(2));
  });

  it('VS1.3 clicking completed sub-pill → only 1 completed row visible', async () => {
    render(<AppointmentHubView />);
    await waitFor(() => expect(screen.getByTestId('sub-pill-completed')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('sub-pill-completed'));
    await waitFor(() => expect(screen.getAllByTestId('appt-hub-row').length).toBe(1));
    expect(screen.getByText(/Done 1/)).toBeInTheDocument();
  });

  it('VS1.4 sub-pill bar hidden on tomorrow tab', async () => {
    render(<AppointmentHubView />);
    await waitFor(() => expect(screen.getByTestId('appt-hub-today-sub-pill-bar')).toBeInTheDocument());
    // Switch to tomorrow tab via the existing tab bar
    fireEvent.click(screen.getByText(/พรุ่งนี้/));
    await waitFor(() => expect(screen.queryByTestId('appt-hub-today-sub-pill-bar')).toBeNull());
  });

  it('VS1.5 sub-pill resets to waiting when activeTab changes back to today from elsewhere', async () => {
    render(<AppointmentHubView />);
    await waitFor(() => expect(screen.getByTestId('sub-pill-waiting')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('sub-pill-completed'));
    await waitFor(() => expect(screen.getByTestId('sub-pill-completed')).toHaveAttribute('aria-selected', 'true'));
    fireEvent.click(screen.getByText(/พรุ่งนี้/));
    fireEvent.click(screen.getByText(/วันนี้/));
    await waitFor(() => expect(screen.getByTestId('sub-pill-waiting')).toHaveAttribute('aria-selected', 'true'));
  });
});
```

- [ ] **Step 6.2: Run test, verify it fails**

Run: `npx vitest run tests/v71-hub-view-sub-pill.test.jsx`
Expected: FAIL — sub-pill bar not rendered, view doesn't pass isTodayTab or filter by subPill.

- [ ] **Step 6.3: Modify `AppointmentHubView.jsx`**

Open `src/components/admin/AppointmentHubView.jsx`. Make these surgical edits:

**(a) Add imports** (top of file, after existing local imports):

```jsx
import AppointmentHubTodaySubPillBar from './AppointmentHubTodaySubPillBar.jsx';
import { subPillCountsForToday } from '../../lib/appointmentHubFilters.js';
```

Also add to the imports from `scopedDataLayer.js`:

```jsx
import {
  getAppointmentsByDateRange,
  getAllCustomers,
  getAllDeposits,
  getAllSales,
  getAllMemberships,
  getWalletsForCustomerIds,
  listStaffSchedules,
  markAppointmentServiceCompleted,           // V71 NEW
} from '../../lib/scopedDataLayer.js';
```

**(b) Add state for the sub-pill** (after the existing `useState` declarations near the top of the component):

```jsx
// V71 (2026-05-15) — today sub-pill state. Resets to 'waiting' on tab change.
const [todaySubPill, setTodaySubPill] = useState('waiting');
```

**(c) Reset sub-pill on tab change** — find the existing `useEffect(() => { setActiveTab(...); }, [selectedBranchId])` and add a sibling effect:

```jsx
// V71 — reset sub-pill to waiting whenever activeTab changes (including
// branch-switch which resets activeTab to 'today').
useEffect(() => {
  setTodaySubPill('waiting');
}, [activeTab]);
```

**(d) Pass `todaySubPill` into `applyTabFilter`** — find the `filteredAppts` useMemo:

```jsx
const filteredAppts = useMemo(() => {
  const filtered = applyTabFilter(appts, {
    tab: activeTab,
    now: new Date(),
    statusOverride: statusFilter,
    search,
    typeFilter,
    todaySubPill,                          // V71 NEW
  });
  return sortApptsByDateTimeAsc(filtered);
}, [appts, activeTab, statusFilter, search, typeFilter, todaySubPill]);
```

**(e) Add sub-pill counts memo** (right after the existing `counts` useMemo):

```jsx
// V71 — sub-pill counts derived from same appts array.
const todaySubCounts = useMemo(() => subPillCountsForToday(appts, new Date()), [appts]);
```

**(f) Add the optimistic mark-complete handler** (after `handleCancelOptimistic`):

```jsx
// V71 (2026-05-15) — mark service complete with optimistic local update + revert on error.
const handleMarkServiceCompleteOptimistic = useCallback(async (appt) => {
  const prevValue = appt.serviceCompletedAt;
  // Optimistic — local state immediately reflects completion so row moves
  // to the "เสร็จแล้ว" sub-pill on the next render.
  const optimisticStamp = new Date();
  setAppts(prev => prev.map(a => a.id === appt.id ? { ...a, serviceCompletedAt: optimisticStamp } : a));
  try {
    const uid = (typeof window !== 'undefined' && window.__FIREBASE_UID__) || '';
    await markAppointmentServiceCompleted(appt.id, uid);
  } catch {
    // Revert on error so the row reappears in "กำลังรอ".
    setAppts(prev => prev.map(a => a.id === appt.id ? { ...a, serviceCompletedAt: prevValue } : a));
  }
}, []);
```

Note: the `window.__FIREBASE_UID__` is a stop-gap; in practice the caller passes from `auth.currentUser?.uid`. We'll plumb the real uid via prop in Task 7 (AdminDashboard layer owns the auth import).

Actually — simpler approach: lift the handler to AdminDashboard which has direct access to `auth`. Let the prop drill the handler in. Update this step accordingly:

Replace the above with:

```jsx
// V71 (2026-05-15) — optimistic local-state update wrapper. The actual
// Firestore write lives in the parent (AdminDashboard owns auth); this
// closure does the optimistic move + revert-on-error pattern (mirror of
// V64-fix3 handleConfirmOptimistic).
const handleMarkServiceCompleteOptimistic = useCallback(async (appt) => {
  const prevValue = appt.serviceCompletedAt;
  const optimisticStamp = new Date();
  setAppts(prev => prev.map(a => a.id === appt.id ? { ...a, serviceCompletedAt: optimisticStamp } : a));
  try {
    await Promise.resolve(onMarkServiceComplete?.(appt));
  } catch {
    setAppts(prev => prev.map(a => a.id === appt.id ? { ...a, serviceCompletedAt: prevValue } : a));
  }
}, [onMarkServiceComplete]);
```

And add `onMarkServiceComplete` to the View's props signature (top of component):

```jsx
export default function AppointmentHubView({
  treatmentDataVersion = 0,
  appointmentDataVersion = 0,
  onConfirmAppt,
  onEditAppt,
  onCancelAppt,
  onCreateTreatmentForAppt,
  onEditTreatmentForAppt,
  onOpenLineForAppt,
  onAddWalkIn,
  onMarkServiceComplete,                   // V71 NEW
  branchName = '',
  doctors = [],
  assistants = [],
}) {
```

**(g) Render the sub-pill bar** — find the `return (...)` block. After `<AppointmentHubTabBar />` and BEFORE `<AppointmentHubFilterBar />`, insert:

```jsx
{/* V71 (2026-05-15) — today sub-pill bar. Renders only on today tab. */}
{activeTab === 'today' && (
  <AppointmentHubTodaySubPillBar
    activeSubPill={todaySubPill}
    waitingCount={todaySubCounts.waiting}
    completedCount={todaySubCounts.completed}
    onSubPillChange={setTodaySubPill}
  />
)}
```

**(h) Remove the absolute LINE-badge wrapper** — find the `filteredAppts.map(...)` JSX. Replace:

```jsx
{!loading && filteredAppts.map(a => (
  <div key={a.id} className="relative">
    {/* V68 (2026-05-15) — LINE badge if appt has notifyChannel=['line'] */}
    <div className="absolute top-2 right-2 z-10 pointer-events-none">
      <AppointmentLineBadge appt={a} size="sm" />
    </div>
    <AppointmentHubRowCard
      appt={a}
      summary={summaryMap.get(String(a.customerId))}
      apptDeposit={depositByApptId.get(String(a.id))}
      apptDateTreatments={treatmentsByCustomerDate.get(`${a.customerId}|${a.date}`) || []}
      now={new Date()}
      onConfirm={handleConfirmOptimistic}
      onEdit={handleEditOpenModal}
      onCancel={handleCancelOptimistic}
      onCreateTreatment={onCreateTreatmentForAppt}
      onEditTreatment={onEditTreatmentForAppt}
      onOpenLine={onOpenLineForAppt}
    />
  </div>
))}
```

With:

```jsx
{!loading && filteredAppts.map(a => (
  <AppointmentHubRowCard
    key={a.id}
    appt={a}
    summary={summaryMap.get(String(a.customerId))}
    apptDeposit={depositByApptId.get(String(a.id))}
    apptDateTreatments={treatmentsByCustomerDate.get(`${a.customerId}|${a.date}`) || []}
    isTodayTab={activeTab === 'today'}             {/* V71 NEW */}
    now={new Date()}
    onConfirm={handleConfirmOptimistic}
    onEdit={handleEditOpenModal}
    onCancel={handleCancelOptimistic}
    onCreateTreatment={onCreateTreatmentForAppt}
    onEditTreatment={onEditTreatmentForAppt}
    onOpenLine={onOpenLineForAppt}
    onMarkServiceComplete={handleMarkServiceCompleteOptimistic}    {/* V71 NEW */}
  />
))}
```

The LINE-badge floating wrapper is GONE. The badge is now rendered inline inside `AppointmentHubRowCard` (Task 5 already wired it).

Also remove the now-unused `AppointmentLineBadge` import at the top of `AppointmentHubView.jsx` if it has no other consumer in this file (the import was only for the absolute wrapper).

- [ ] **Step 6.4: Run test, verify it passes**

Run: `npx vitest run tests/v71-hub-view-sub-pill.test.jsx`
Expected: PASS (5 tests).

- [ ] **Step 6.5: Run related sibling tests for V21 regressions**

Run: `npx vitest run tests/v64-appointment-hub-flow-simulate.test.jsx tests/v68-line-badge-surfacing-audit.test.js`
Expected: PASS. If V68 audit asserts AppointmentLineBadge is wrapped in absolute, that's a V21-class lock-in — update it inline to assert inline-positioning per V71 contract. Add V71 marker comment explaining the contract change.

- [ ] **Step 6.6: Commit**

```bash
git add tests/v71-hub-view-sub-pill.test.jsx src/components/admin/AppointmentHubView.jsx tests/v64-appointment-hub-flow-simulate.test.jsx tests/v68-line-badge-surfacing-audit.test.js
git commit -m "feat(V71): HubView sub-pill state + bar + inline LINE + onMarkServiceComplete plumb"
```

---

### Task 7: Wire `onMarkServiceComplete` handler in `AdminDashboard.jsx`

**Files:**
- Create: `tests/v71-admin-dashboard-wire.test.js` (source-grep regression)
- Modify: `src/pages/AdminDashboard.jsx`

- [ ] **Step 7.1: Write failing test**

Create `tests/v71-admin-dashboard-wire.test.js`:

```js
// V71 — source-grep regression: AdminDashboard wires onMarkServiceComplete to
// AppointmentHubView using auth.currentUser.uid + the canonical writer.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = process.cwd();
const read = (p) => readFileSync(path.join(ROOT, p), 'utf-8');

describe('V71 AdminDashboard handler wiring', () => {
  const src = read('src/pages/AdminDashboard.jsx');

  it('AD1.1 AppointmentHubView receives onMarkServiceComplete prop', () => {
    // Must contain `onMarkServiceComplete={` in the AppointmentHubView render
    expect(src).toMatch(/<AppointmentHubView[\s\S]*?onMarkServiceComplete\s*=/);
  });

  it('AD1.2 handler calls markAppointmentServiceCompleted with auth uid', () => {
    expect(src).toMatch(/markAppointmentServiceCompleted/);
    // uid sourced from auth.currentUser
    expect(src).toMatch(/auth\?\.currentUser\?\.uid|auth\.currentUser\?\.uid|auth\.currentUser\.uid/);
  });

  it('AD1.3 V71 marker comment present near the handler', () => {
    expect(src).toMatch(/V71[^\n]*(?:service[ -]?complete|mark[ -]?complete)/i);
  });
});
```

- [ ] **Step 7.2: Run test, verify it fails**

Run: `npx vitest run tests/v71-admin-dashboard-wire.test.js`
Expected: FAIL — handler not yet wired.

- [ ] **Step 7.3: Wire handler in `AdminDashboard.jsx`**

Find the `<AppointmentHubView ... />` render (search for `<AppointmentHubView`). It's around line 6737. Before that JSX, define a handler. Find a nearby memoized handler (e.g. `handleConfirmAppt`) and add a sibling:

```jsx
// V71 (2026-05-15) — mark service complete handler. Calls the canonical writer
// with the current admin's Firebase auth uid for the serviceCompletedBy stamp.
const handleMarkAppointmentServiceComplete = useCallback(async (appt) => {
  try {
    const uid = auth?.currentUser?.uid || '';
    await markAppointmentServiceCompleted(appt.id, uid);
  } catch (err) {
    console.error('[V71] markAppointmentServiceCompleted failed:', err);
    showToast?.('บันทึกสถานะ "รับบริการเรียบร้อย" ไม่สำเร็จ — ลองอีกครั้ง', 4000);
    throw err;  // re-throw so HubView's optimistic-revert path fires
  }
}, []);
```

Add `markAppointmentServiceCompleted` to the existing `scopedDataLayer.js` import block (search for the import from `'../lib/scopedDataLayer.js'`):

```jsx
import {
  ...existing imports...,
  markAppointmentServiceCompleted,           // V71 NEW
} from '../lib/scopedDataLayer.js';
```

Then in the `<AppointmentHubView />` JSX, add the prop:

```jsx
<AppointmentHubView
  ...existing props...
  onMarkServiceComplete={handleMarkAppointmentServiceComplete}
/>
```

- [ ] **Step 7.4: Run test, verify it passes**

Run: `npx vitest run tests/v71-admin-dashboard-wire.test.js`
Expected: PASS (3 tests).

- [ ] **Step 7.5: Commit**

```bash
git add tests/v71-admin-dashboard-wire.test.js src/pages/AdminDashboard.jsx
git commit -m "feat(V71): wire onMarkServiceComplete handler in AdminDashboard"
```

---

### Task 8: AV49 audit invariant — LINE badge anti-overlap discipline

**Files:**
- Create: `tests/v71-av49-line-badge-no-absolute.test.js`
- Modify: `.agents/skills/audit-anti-vibe-code/SKILL.md`

- [ ] **Step 8.1: Write failing test**

Create `tests/v71-av49-line-badge-no-absolute.test.js`:

```js
// AV49 (V71, 2026-05-15) — AppointmentLineBadge MUST NOT be wrapped in an
// absolute-positioned div in admin appt-list code. Inline placement only.
// Sanctioned exception: calendar grid micro-cells in AdminDashboard.jsx
// (badge is already inline; no absolute wrapper exists there).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = process.cwd();
const read = (p) => readFileSync(path.join(ROOT, p), 'utf-8');

const VIOLATION = /<div[^>]*className=["'][^"']*\babsolute\b[^"']*["'][^>]*>[\s\S]{0,200}<AppointmentLineBadge/;

describe('AV49 inline LINE badge discipline', () => {
  it('AV49.1 AppointmentHubView.jsx has NO absolute wrapper around AppointmentLineBadge', () => {
    const src = read('src/components/admin/AppointmentHubView.jsx');
    expect(VIOLATION.test(src)).toBe(false);
  });

  it('AV49.2 AppointmentHubRowCard.jsx has NO absolute wrapper around AppointmentLineBadge', () => {
    const src = read('src/components/admin/AppointmentHubRowCard.jsx');
    expect(VIOLATION.test(src)).toBe(false);
  });

  it('AV49.3 AdminDashboard.jsx calendar micro-cells inline LINE badge (sanctioned-exception narrow)', () => {
    const src = read('src/pages/AdminDashboard.jsx');
    // Allow `absolute` to exist near AppointmentLineBadge IF it's a different
    // element (e.g. a chip floating in a calendar cell). Just assert no
    // absolute DIV directly wraps the badge.
    expect(VIOLATION.test(src)).toBe(false);
  });
});
```

- [ ] **Step 8.2: Run test, verify it passes immediately**

Run: `npx vitest run tests/v71-av49-line-badge-no-absolute.test.js`
Expected: PASS (3 tests) — Task 5+6 already removed the wrapper.

If it fails for any file, that file still has the absolute-wrapper pattern; fix it before continuing.

- [ ] **Step 8.3: Register AV49 in audit-anti-vibe-code SKILL.md**

Open `.agents/skills/audit-anti-vibe-code/SKILL.md`. Add a new row to the invariant table (find AV48 entry and add AV49 below it):

```markdown
| AV49 | Inline LINE badge discipline in admin appt-list (V71, 2026-05-15) | `<div className="absolute …"><AppointmentLineBadge` MUST NOT appear in `src/components/admin/AppointmentHub*.jsx` or `src/pages/AdminDashboard.jsx`. Inline placement only. Sanctioned exception: NONE (calendar micro-cells are already inline). | tests/v71-av49-line-badge-no-absolute.test.js |
```

Match the existing entry style — verify column structure mirrors AV48.

- [ ] **Step 8.4: Commit**

```bash
git add tests/v71-av49-line-badge-no-absolute.test.js .agents/skills/audit-anti-vibe-code/SKILL.md
git commit -m "feat(V71): AV49 audit invariant — inline LINE badge discipline in admin appt-list"
```

---

### Task 9: Rule I full-flow simulate + Rule N full vitest + build + localhost L1 review

**Files:**
- Create: `tests/v71-appointment-hub-flow-simulate.test.jsx`

- [ ] **Step 9.1: Write Rule I full-flow simulate test**

Create `tests/v71-appointment-hub-flow-simulate.test.jsx`:

```jsx
// V71 Rule I — full-flow simulate chaining: load treatments → render row
// → stepper visible → click mark-complete → sub-pill filter + counts.

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const markFn = vi.fn(() => Promise.resolve());

vi.mock('../src/lib/scopedDataLayer.js', () => ({
  getAppointmentsByDateRange: vi.fn(),
  getAllCustomers: vi.fn(() => Promise.resolve([])),
  getAllDeposits: vi.fn(() => Promise.resolve([])),
  getAllSales: vi.fn(() => Promise.resolve([])),
  getAllMemberships: vi.fn(() => Promise.resolve([])),
  getWalletsForCustomerIds: vi.fn(() => Promise.resolve([])),
  listStaffSchedules: vi.fn(() => Promise.resolve([])),
  markAppointmentServiceCompleted: markFn,
}));
vi.mock('../src/lib/reportsLoaders.js', () => ({
  loadTreatmentsByDateRange: vi.fn(),
}));
vi.mock('../src/lib/BranchContext.jsx', () => ({
  useSelectedBranch: () => ({ branchId: 'BR-FLOW-V71' }),
}));

import { getAppointmentsByDateRange } from '../src/lib/scopedDataLayer.js';
import { loadTreatmentsByDateRange } from '../src/lib/reportsLoaders.js';
import AppointmentHubView from '../src/components/admin/AppointmentHubView.jsx';

function todayBangkok() {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

describe('V71 Rule I — full-flow simulate', () => {
  beforeEach(() => {
    markFn.mockClear();
    const today = todayBangkok();
    getAppointmentsByDateRange.mockResolvedValue([
      { id: 'F1', date: today, startTime: '09:00', customerId: 'CF1', customerName: 'Flow-customer', status: 'confirmed', serviceCompletedAt: null },
    ]);
    loadTreatmentsByDateRange.mockResolvedValue([
      {
        id: 'TF1',
        customerId: 'CF1',
        detail: { treatmentDate: today },
        createdAt: '2026-05-15T08:00:00.000Z',
        vitalsignsRecordedAt: { toDate: () => new Date('2026-05-15T08:00:00') },
        status: 'vitalsigns-recorded',
      },
    ]);
  });

  it('F1.1 load → stepper visible → click mark-complete → moves to completed sub-pill', async () => {
    const onMark = vi.fn(() => Promise.resolve());
    render(<AppointmentHubView onMarkServiceComplete={onMark} />);

    // 1. Wait for load
    await waitFor(() => expect(screen.getByTestId('appt-hub-row')).toBeInTheDocument());

    // 2. Stepper present
    expect(screen.getByTestId('appt-row-opd-stepper')).toBeInTheDocument();

    // 3. Mark-complete button visible
    expect(screen.getByTestId('row-action-mark-complete')).toBeInTheDocument();

    // 4. Sub-pill counts: 1 waiting, 0 completed
    expect(screen.getByTestId('sub-pill-waiting')).toHaveTextContent('1');
    expect(screen.getByTestId('sub-pill-completed')).toHaveTextContent('0');

    // 5. Click mark-complete + confirm
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByTestId('row-action-mark-complete'));
    confirmSpy.mockRestore();

    // 6. onMark called with the appt
    await waitFor(() => expect(onMark).toHaveBeenCalled());
    expect(onMark.mock.calls[0][0].id).toBe('F1');

    // 7. Sub-pill counts updated optimistically: 0 waiting, 1 completed
    await waitFor(() => expect(screen.getByTestId('sub-pill-waiting')).toHaveTextContent('0'));
    expect(screen.getByTestId('sub-pill-completed')).toHaveTextContent('1');

    // 8. Default sub-pill = waiting → row disappears
    expect(screen.queryByText(/Flow-customer/)).toBeNull();

    // 9. Click completed sub-pill → row reappears
    fireEvent.click(screen.getByTestId('sub-pill-completed'));
    await waitFor(() => expect(screen.getByText(/Flow-customer/)).toBeInTheDocument());
  });
});
```

- [ ] **Step 9.2: Run Rule I test**

Run: `npx vitest run tests/v71-appointment-hub-flow-simulate.test.jsx`
Expected: PASS (1 test, 9 assertions).

- [ ] **Step 9.3: Run all V71 tests + key sibling tests**

Run:
```bash
npx vitest run tests/v71-*.test.* tests/v64-appointment-hub-flow-simulate.test.jsx tests/v68-line-badge-surfacing-audit.test.js tests/audit-anti-vibe-code.test.js
```
Expected: PASS for all V71 + sibling tests.

- [ ] **Step 9.4: Run full vitest (Rule N — new exported component + writer)**

Run: `npm test -- --run`
Expected: PASS (10141 + V71 net adds, 0 FAIL). If any non-V71 test fails, classify as V21-class lock-in (fix inline) or genuine regression (return to Task 5/6 to fix the root).

- [ ] **Step 9.5: Build clean (V11 lesson)**

Run: `npm run build`
Expected: exit 0; new component imports resolve cleanly.

- [ ] **Step 9.6: Commit Rule I test**

```bash
git add tests/v71-appointment-hub-flow-simulate.test.jsx
git commit -m "test(V71): Rule I full-flow simulate (load → stepper → mark-complete → sub-pill move)"
```

- [ ] **Step 9.7: Localhost L1 visual review (Rule Q)**

Start dev server: `npm run dev`. Open `http://localhost:5173/`. Sign in as clinic staff. Navigate: `/admin` → `นัดหมาย` → `รายการ` → confirm:

1. **Today tab** with a real appointment that has a treatment:
   - Full 3-dot stepper renders at bottom of card with stage colors + timestamps.
   - LINE badge sits inline next to "ยืนยันแล้ว" / "เสร็จแล้ว" status chip — no overlap.
   - "ลูกค้ารับบริการเรียบร้อย" button visible.
2. **Today tab** with an appointment with NO treatment:
   - Muted stepper (3 grey dots).
   - Mark-complete button NOT visible.
3. **Tomorrow tab**:
   - Sub-pill bar HIDDEN.
   - Stepper row HIDDEN for all rows.
4. **Click mark-complete**:
   - Confirm dialog appears with Thai text.
   - On confirm → row disappears from "กำลังรอ" + count -1 + "เสร็จแล้ว" count +1.
   - Click "เสร็จแล้ว" sub-pill → row visible there with `serviceCompletedAt` set.
5. **Switch to tomorrow then back to today**:
   - Sub-pill resets to "กำลังรอ" (the row in "เสร็จแล้ว" remains there visually if you click that pill again).

If anything visually off — return to Task 5 or 6 to refine.

- [ ] **Step 9.8: Update SESSION_HANDOFF.md + .agents/active.md (skipped — assistant task, not user task)**

Defer to brainstorming/writing-plans wrap — handled by session-end skill on user "wrap up" prompt.

---

## Self-Review

**1. Spec coverage:**

| Spec section | Plan task |
|---|---|
| §3.1 Stepper bottom-row + visibility matrix | Task 3 + Task 5 |
| §3.2 LINE inline relocation | Task 5 + Task 6 (remove absolute wrapper) |
| §4.1 Schema field `serviceCompletedAt` | Task 1 (writer signs the field) — no migration |
| §4.2 Button visibility composite predicate | Task 5 RC3.1–3.4 |
| §4.3 Sub-pill bar component | Task 4 |
| §4.4 Filter logic update | Task 2 |
| §5.1 Files-changed table | All tasks distribute the file changes; mapping matches |
| §7 AV49 audit invariant | Task 8 |
| §6.1 RTL unit/integration | Tasks 3, 4, 5, 6 |
| §6.4 Rule Q L1 localhost review | Task 9.7 |

Gaps: none. All spec requirements have at least one task.

**2. Placeholder scan:** scanned for "TBD", "TODO", vague phrases — none present. Each step contains actual code or exact commands.

**3. Type consistency:** verified across tasks:
- `markAppointmentServiceCompleted(apptId, uid)` signature consistent across Task 1 (definition), Task 6 (call site in AdminDashboard via prop), Task 7 (handler in AdminDashboard).
- `serviceCompletedAt` field name consistent everywhere.
- `todaySubPill: 'waiting'|'completed'` enum consistent across Task 2 filter, Task 4 component, Task 6 view state.
- `isTodayTab` boolean prop consistent across Task 3, Task 5, Task 6.

No naming drift detected.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-15-opd-lifecycle-badge-frontend-appt-list.md`.**
