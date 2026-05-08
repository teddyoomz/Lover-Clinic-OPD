// V53 (BS-12) — Rule I full-flow simulate: BranchProvider switch +
// useEffectiveClinicSettings + getVisibleTimeSlotsForDate chain.
//
// Validates end-to-end:
//   1. Render <BranchProvider> with mock branches (BR-A 11:30-20:30 weekday,
//      BR-B 09:00-21:00 weekday)
//   2. Mount a Canonical V53 Tab using the same hook + useMemo pattern
//      every fixed surface uses
//   3. Initial mount on BR-A → visible.slots filtered to 11:30..20:30
//   4. selectBranch('BR-B') → visible.slots refilter to 09:00..21:00
//   5. Date change Mon → Sat → satSun bucket applied
//   6. Closed-day branch → isClosed=true, slots empty
//   7. Legacy appt outside hours → auto-expand visible range + chip flag
//   8. Lifecycle A → B → A round-trip
//
// Spec: docs/superpowers/specs/2026-05-08-per-branch-open-hours-time-axis-design.md

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React, { useMemo } from 'react';

// ─── Mock firebase + UserPermissionContext for BranchContext to resolve ───

vi.mock('../src/firebase.js', () => ({
  db: {},
  appId: 'test-app-v53',
}));

// Mock branches' settings via the snapshot fired by onSnapshot. Each branch
// has its own openHours.{monFri,satSun} so getEffectiveClinicSettings can
// merge them per branch switch.
const MOCK_BRANCHES = [
  {
    id: 'BR-A',
    name: 'สาขา A',
    createdAt: '2026-01-01',
    settings: {
      openHours: {
        monFri: { open: '11:30', close: '20:30' },
        satSun: { open: '10:30', close: '19:30' },
      },
    },
  },
  {
    id: 'BR-B',
    name: 'สาขา B',
    createdAt: '2026-02-01',
    settings: {
      openHours: {
        monFri: { open: '09:00', close: '21:00' },
        satSun: { open: '00:00', close: '00:00' }, // closed weekend
      },
    },
  },
];

vi.mock('firebase/firestore', async () => ({
  collection: () => ({}),
  query: () => ({}),
  where: () => ({}),
  getDocs: async () => ({ docs: [] }),
  onSnapshot: (_q, next) => {
    Promise.resolve().then(() => {
      const snap = {
        docs: MOCK_BRANCHES.map((b) => ({ id: b.id, data: () => b })),
      };
      next(snap);
    });
    return () => {};
  },
}));

vi.mock('../src/contexts/UserPermissionContext.jsx', () => ({
  useUserPermission: () => ({
    user: { uid: 'TEST-UID-V53' },
    permissions: {},
    isAdmin: true,
    accessibleBranchIds: ['BR-A', 'BR-B'],
  }),
}));

beforeEach(() => {
  // Seed BR-A so initial mount resolves deterministically; switching to BR-B
  // becomes a real change. Otherwise default-picker chooses newest (BR-B).
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem('selectedBranchId:TEST-UID-V53', 'BR-A');
      window.localStorage.removeItem('selectedBranchId');
    } catch {}
  }
});

// Lazy-import after mocks
async function importContext() {
  return await import('../src/lib/BranchContext.jsx');
}
async function importHelpers() {
  return await import('../src/lib/scheduleFilterUtils.js');
}

// Build mock TIME_SLOTS (08:15..22:00, 15-min)
function buildAllTimeSlots() {
  const out = [];
  for (let h = 8; h <= 22; h++) {
    for (const m of [0, 15, 30, 45]) {
      if (h === 8 && m === 0) continue;
      if (h === 22 && m > 0) continue;
      out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return out;
}
const ALL_TIME_SLOTS = buildAllTimeSlots();

// Known Bangkok dates
const MON_DATE = '2026-05-04'; // Monday
const SAT_DATE = '2026-05-09'; // Saturday

// ─── F1 — Initial mount derives visible slots from current branch ──────────

describe('F1 — initial mount filters TIME_SLOTS by current branch openHours', () => {
  it('F1.1 mount on BR-A weekday → slots 11:30..20:30', async () => {
    const { BranchProvider, useSelectedBranch, useEffectiveClinicSettings } = await importContext();
    const { getVisibleTimeSlotsForDate } = await importHelpers();

    const captured = { lastVisible: null };

    function Tab() {
      const cs = useEffectiveClinicSettings(undefined);
      const visible = useMemo(
        () => getVisibleTimeSlotsForDate({
          dateISO: MON_DATE,
          mergedSettings: cs,
          allTimeSlots: ALL_TIME_SLOTS,
        }),
        [cs?.openHoursMonFri, cs?.openHoursSatSun],
      );
      captured.lastVisible = visible;
      return null;
    }

    const { unmount } = renderHook(() => useSelectedBranch(), {
      wrapper: ({ children }) => React.createElement(BranchProvider, null, React.createElement(Tab, null), children),
    });

    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(captured.lastVisible).toBeTruthy();
    expect(captured.lastVisible.openRange).toEqual({ open: '11:30', close: '20:30' });
    expect(captured.lastVisible.slots[0]).toBe('11:30');
    expect(captured.lastVisible.slots[captured.lastVisible.slots.length - 1]).toBe('20:30');
    expect(captured.lastVisible.isClosed).toBe(false);

    unmount();
  });
});

// ─── F2 — selectBranch refilters visible slots ─────────────────────────────

describe('F2 — selectBranch triggers visibleSlots recompute', () => {
  it('F2.1 switch BR-A → BR-B → slots refilter to 09:00..21:00', async () => {
    const { BranchProvider, useSelectedBranch, useEffectiveClinicSettings } = await importContext();
    const { getVisibleTimeSlotsForDate } = await importHelpers();

    const captured = { lastVisible: null, selectBranch: null };

    function Tab() {
      const ctx = useSelectedBranch();
      captured.selectBranch = ctx.selectBranch;
      const cs = useEffectiveClinicSettings(undefined);
      captured.lastVisible = getVisibleTimeSlotsForDate({
        dateISO: MON_DATE,
        mergedSettings: cs,
        allTimeSlots: ALL_TIME_SLOTS,
      });
      return null;
    }

    const { unmount } = renderHook(() => useSelectedBranch(), {
      wrapper: ({ children }) => React.createElement(BranchProvider, null, React.createElement(Tab, null), children),
    });

    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(captured.lastVisible.openRange?.open).toBe('11:30');

    await act(async () => {
      captured.selectBranch?.('BR-B');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(captured.lastVisible.openRange).toEqual({ open: '09:00', close: '21:00' });
    expect(captured.lastVisible.slots[0]).toBe('09:00');
    expect(captured.lastVisible.slots[captured.lastVisible.slots.length - 1]).toBe('21:00');

    unmount();
  });
});

// ─── F3 — Date change Mon → Sat → satSun bucket ────────────────────────────

describe('F3 — date change applies day-of-week bucket', () => {
  it('F3.1 BR-A Mon → 11:30-20:30; Sat → 10:30-19:30', async () => {
    const { BranchProvider, useEffectiveClinicSettings, useSelectedBranch } = await importContext();
    const { getVisibleTimeSlotsForDate } = await importHelpers();

    function Tab({ dateISO, ref }) {
      const cs = useEffectiveClinicSettings(undefined);
      const v = getVisibleTimeSlotsForDate({
        dateISO,
        mergedSettings: cs,
        allTimeSlots: ALL_TIME_SLOTS,
      });
      ref.lastVisible = v;
      return null;
    }

    const refMon = { lastVisible: null };
    const refSat = { lastVisible: null };

    const { unmount } = renderHook(() => useSelectedBranch(), {
      wrapper: ({ children }) => React.createElement(
        BranchProvider, null,
        React.createElement(Tab, { dateISO: MON_DATE, ref: refMon }),
        React.createElement(Tab, { dateISO: SAT_DATE, ref: refSat }),
        children,
      ),
    });

    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(refMon.lastVisible.openRange).toEqual({ open: '11:30', close: '20:30' });
    expect(refSat.lastVisible.openRange).toEqual({ open: '10:30', close: '19:30' });

    unmount();
  });
});

// ─── F4 — Closed branch (open===close) ─────────────────────────────────────

describe('F4 — closed branch on the active bucket', () => {
  it('F4.1 BR-B weekend (closed) → isClosed=true, slots=[]', async () => {
    const { BranchProvider, useEffectiveClinicSettings, useSelectedBranch } = await importContext();
    const { getVisibleTimeSlotsForDate } = await importHelpers();

    const captured = { lastVisible: null, selectBranch: null };

    function Tab() {
      const ctx = useSelectedBranch();
      captured.selectBranch = ctx.selectBranch;
      const cs = useEffectiveClinicSettings(undefined);
      captured.lastVisible = getVisibleTimeSlotsForDate({
        dateISO: SAT_DATE,
        mergedSettings: cs,
        allTimeSlots: ALL_TIME_SLOTS,
      });
      return null;
    }

    const { unmount } = renderHook(() => useSelectedBranch(), {
      wrapper: ({ children }) => React.createElement(BranchProvider, null, React.createElement(Tab, null), children),
    });

    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    // BR-A initially → SAT_DATE → 10:30-19:30 (open)
    expect(captured.lastVisible.isClosed).toBe(false);

    await act(async () => {
      captured.selectBranch?.('BR-B');
      await Promise.resolve();
      await Promise.resolve();
    });

    // BR-B weekend = closed
    expect(captured.lastVisible.isClosed).toBe(true);
    expect(captured.lastVisible.slots).toEqual([]);

    unmount();
  });
});

// ─── F5 — Legacy appointment auto-expand (Q1=A) ────────────────────────────

describe('F5 — legacy appt outside hours triggers auto-expand', () => {
  it('F5.1 BR-A Mon (open 11:30) + appt at 09:00 → slots include 09:00 + hasOutsideAppts=true', async () => {
    const { BranchProvider, useEffectiveClinicSettings, useSelectedBranch } = await importContext();
    const { getVisibleTimeSlotsForDate } = await importHelpers();

    const captured = { lastVisible: null };

    function Tab() {
      const cs = useEffectiveClinicSettings(undefined);
      captured.lastVisible = getVisibleTimeSlotsForDate({
        dateISO: MON_DATE,
        mergedSettings: cs,
        allTimeSlots: ALL_TIME_SLOTS,
        includeAppointments: [{ startTime: '09:00', endTime: '10:00' }],
      });
      return null;
    }

    const { unmount } = renderHook(() => useSelectedBranch(), {
      wrapper: ({ children }) => React.createElement(BranchProvider, null, React.createElement(Tab, null), children),
    });

    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(captured.lastVisible.hasOutsideAppts).toBe(true);
    expect(captured.lastVisible.slots).toContain('09:00');
    expect(captured.lastVisible.slots).toContain('11:30');
    expect(captured.lastVisible.expandedFrom).toBe('legacy-expand');

    unmount();
  });
});

// ─── F6 — Round-trip A → B → A returns to original view ────────────────────

describe('F6 — branch switch lifecycle (A → B → A)', () => {
  it('F6.1 returning to original branch restores original openRange', async () => {
    const { BranchProvider, useEffectiveClinicSettings, useSelectedBranch } = await importContext();
    const { getVisibleTimeSlotsForDate } = await importHelpers();

    const captured = { lastVisible: null, selectBranch: null };

    function Tab() {
      const ctx = useSelectedBranch();
      captured.selectBranch = ctx.selectBranch;
      const cs = useEffectiveClinicSettings(undefined);
      captured.lastVisible = getVisibleTimeSlotsForDate({
        dateISO: MON_DATE,
        mergedSettings: cs,
        allTimeSlots: ALL_TIME_SLOTS,
      });
      return null;
    }

    const { unmount } = renderHook(() => useSelectedBranch(), {
      wrapper: ({ children }) => React.createElement(BranchProvider, null, React.createElement(Tab, null), children),
    });

    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(captured.lastVisible.openRange.open).toBe('11:30');

    await act(async () => { captured.selectBranch?.('BR-B'); await Promise.resolve(); await Promise.resolve(); });
    expect(captured.lastVisible.openRange.open).toBe('09:00');

    await act(async () => { captured.selectBranch?.('BR-A'); await Promise.resolve(); await Promise.resolve(); });
    expect(captured.lastVisible.openRange.open).toBe('11:30');

    unmount();
  });
});

// ─── F7 — isTimeOutsideOpenHours flag tracks branch switch ─────────────────

describe('F7 — isTimeOutsideOpenHours flag tracks branch switch', () => {
  it('F7.1 09:00 outside BR-A (open 11:30); inside BR-B (open 09:00)', async () => {
    const { BranchProvider, useEffectiveClinicSettings, useSelectedBranch } = await importContext();
    const { isTimeOutsideOpenHours } = await importHelpers();

    const captured = { isOutside: null, selectBranch: null };

    function Tab() {
      const ctx = useSelectedBranch();
      captured.selectBranch = ctx.selectBranch;
      const cs = useEffectiveClinicSettings(undefined);
      captured.isOutside = isTimeOutsideOpenHours('09:00', MON_DATE, cs);
      return null;
    }

    const { unmount } = renderHook(() => useSelectedBranch(), {
      wrapper: ({ children }) => React.createElement(BranchProvider, null, React.createElement(Tab, null), children),
    });

    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(captured.isOutside).toBe(true); // BR-A: 09:00 < 11:30 = outside

    await act(async () => { captured.selectBranch?.('BR-B'); await Promise.resolve(); await Promise.resolve(); });
    expect(captured.isOutside).toBe(false); // BR-B: 09:00 === open = inside (inclusive)

    unmount();
  });
});
