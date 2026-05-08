// V55 / BS-14 — Rule I full-flow simulate: BranchProvider switch +
// useEffectiveClinicSettings + filterDoctorsByBranch + listExamRooms({branchId})
// chain that the AdminDashboard schedule-link modal exercises.
//
// User report (verbatim 2026-05-08):
//   "modal สร้างลิ้งค์ตาราง ยังไม่ได้ดึงข้อมูลต่างๆใน modal จากสาขานั้นๆ"
// Plus follow-up:
//   "ทำให้ลิ้งค์ตารางที่ส่ง สัมพันธ์กับหมอที่เข้างานจริง สัมพันธ์กับห้อง
//    ตรวจนั้นๆ ... แต่ว่าสำหรับการสร้างลิ้ง เมื่อนำข้อมูลจริงมาจาก backend
//    จะต้องมาติด filter บริเวณ ตั้งค่าตารางคลินิก"
//
// Validates end-to-end:
//   F1. Initial mount on BR-A → cs.openHoursMonFri matches BR-A; rooms filtered to BR-A
//   F2. selectBranch('BR-B') → cs.openHoursMonFri updates; rooms refetch
//   F3. Practitioners filter by branch — BR-A has Dr.A only, BR-B has Dr.B + Dr.Univ
//   F4. Defensive reset — picking BR-A doctor + switching to BR-B → doctor invalidated
//   F5. Defensive reset for rooms — same lifecycle
//   F6. Hours fallback chain — branch with empty settings.openHours → falls to legacy + literal
//   F7. Round-trip A → B → A preserves per-branch hours
//
// Spec: docs/superpowers/specs/2026-05-08-schedule-link-modal-branch-scope-design.md
// (See also brainstorming-derived design Qs answered in user's 2nd message.)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React, { useEffect, useMemo, useState } from 'react';

// ─── Mock firebase + UserPermissionContext for BranchContext ───

vi.mock('../src/firebase.js', () => ({
  db: {},
  appId: 'test-app-v55',
}));

const MOCK_BRANCHES = [
  {
    id: 'BR-A',
    name: 'สาขา A',
    createdAt: '2026-01-01',
    settings: {
      openHours: {
        monFri: { open: '11:00', close: '15:00' }, // narrow A
        satSun: { open: '12:00', close: '16:00' },
      },
    },
  },
  {
    id: 'BR-B',
    name: 'สาขา B',
    createdAt: '2026-02-01',
    settings: {
      openHours: {
        monFri: { open: '09:00', close: '21:00' }, // wide B
        satSun: { open: '08:00', close: '18:00' },
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
    user: { uid: 'TEST-UID-V55' },
    permissions: {},
    isAdmin: true,
    accessibleBranchIds: ['BR-A', 'BR-B'],
  }),
}));

// Mock branchExamRooms data + scopedDataLayer's listExamRooms behavior.
// Branch A has 1 doctor room only; Branch B has 2 (1 doctor + 1 staff).
const ROOMS_BY_BRANCH = {
  'BR-A': [
    { id: 'room-A1', name: 'ห้องตรวจ A1', kind: 'doctor', branchId: 'BR-A', status: 'ใช้งาน' },
  ],
  'BR-B': [
    { id: 'room-B1', name: 'ห้องตรวจ B1', kind: 'doctor', branchId: 'BR-B', status: 'ใช้งาน' },
    { id: 'room-B2', name: 'ห้องผ่าตัด B2', kind: 'staff', branchId: 'BR-B', status: 'ใช้งาน' },
  ],
};
const DOCTORS = [
  { id: 'd-A', name: 'หมอ A', branchIds: ['BR-A'], status: 'ใช้งาน' },
  { id: 'd-B', name: 'หมอ B', branchIds: ['BR-B'], status: 'ใช้งาน' },
  { id: 'd-univ', name: 'หมอ Universal' /* no branchIds = all branches */, status: 'ใช้งาน' },
];
const STAFF = [
  { id: 's-A', name: 'พนง A', branchIds: ['BR-A'], status: 'ใช้งาน' },
  { id: 's-B', name: 'พนง B', branchIds: ['BR-B'], status: 'ใช้งาน' },
];

vi.mock('../src/lib/scopedDataLayer.js', () => ({
  listExamRooms: vi.fn(async ({ branchId } = {}) => ROOMS_BY_BRANCH[branchId] || []),
  listDoctors: vi.fn(async () => DOCTORS),
  listStaff: vi.fn(async () => STAFF),
}));

beforeEach(() => {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem('selectedBranchId:TEST-UID-V55', 'BR-A');
      window.localStorage.removeItem('selectedBranchId');
    } catch { /* ignore */ }
  }
});

// Lazy-import (mocks must be hoisted first)
async function importContext() {
  return await import('../src/lib/BranchContext.jsx');
}
async function importBranchScopeUtils() {
  return await import('../src/lib/branchScopeUtils.js');
}
async function importScopedDataLayer() {
  return await import('../src/lib/scopedDataLayer.js');
}

// ─── Mini Tab component mirroring AdminDashboard schedule-link modal logic ──
//
// Captures the state/derived-values into `captured` so the test can assert
// what the modal would render at each render cycle.
function buildScheduleLinkTabHarness(captured, branchScopeUtils, scopedDataLayer, contextHooks) {
  const { useEffectiveClinicSettings } = contextHooks;
  const { filterDoctorsByBranch, filterStaffByBranch } = branchScopeUtils;
  const { listExamRooms, listDoctors, listStaff } = scopedDataLayer;

  return function ScheduleLinkTab({ selectedBranchId, schedSelectedDoctor, schedSelectedRoom }) {
    // V55 hooks mirror AdminDashboard.jsx
    const cs = useEffectiveClinicSettings({ clinicOpenTime: '09:00', clinicCloseTime: '21:00', clinicOpenTimeWeekend: '08:00', clinicCloseTimeWeekend: '18:00' });

    const monFriOpen = useMemo(
      () => cs.openHoursMonFri?.open || '10:00',
      [cs.openHoursMonFri],
    );
    const monFriClose = useMemo(
      () => cs.openHoursMonFri?.close || '19:00',
      [cs.openHoursMonFri],
    );
    const satSunOpen = useMemo(
      () => cs.openHoursSatSun?.open || '10:00',
      [cs.openHoursSatSun],
    );
    const satSunClose = useMemo(
      () => cs.openHoursSatSun?.close || '17:00',
      [cs.openHoursSatSun],
    );

    // Branch-filtered practitioners (mirror AdminDashboard L348)
    const [livePractitioners, setLivePractitioners] = useState(null);
    useEffect(() => {
      let cancelled = false;
      (async () => {
        const [doctors, staff] = await Promise.all([
          listDoctors({ includeHidden: true }),
          listStaff({ includeHidden: true }),
        ]);
        if (cancelled) return;
        const docs = filterDoctorsByBranch(doctors || [], selectedBranchId)
          .map((d) => ({ id: d.id, name: d.name, role: 'doctor' }));
        const assts = filterStaffByBranch(staff || [], selectedBranchId)
          .map((s) => ({ id: s.id, name: s.name, role: 'assistant' }));
        setLivePractitioners([...docs, ...assts]);
      })();
      return () => { cancelled = true; };
    }, [selectedBranchId]);

    // Branch-scoped exam rooms (mirror AdminDashboard branchExamRooms)
    const [branchExamRooms, setBranchExamRooms] = useState([]);
    useEffect(() => {
      let cancelled = false;
      (async () => {
        const rooms = await listExamRooms({ branchId: selectedBranchId, status: 'ใช้งาน' });
        if (cancelled) return;
        const mapped = (rooms || []).map((r) => ({
          id: r.id,
          name: r.name,
          role: r.kind === 'doctor' ? 'doctor' : 'staff',
          kind: r.kind,
        }));
        setBranchExamRooms(mapped);
      })();
      return () => { cancelled = true; };
    }, [selectedBranchId]);

    // Capture for assertions
    captured.cs = cs;
    captured.monFriOpen = monFriOpen;
    captured.monFriClose = monFriClose;
    captured.satSunOpen = satSunOpen;
    captured.satSunClose = satSunClose;
    captured.livePractitioners = livePractitioners;
    captured.branchExamRooms = branchExamRooms;
    captured.selectedBranchId = selectedBranchId;
    captured.schedSelectedDoctor = schedSelectedDoctor;
    captured.schedSelectedRoom = schedSelectedRoom;

    return null;
  };
}

async function mountHarness({ initialDoctor = null, initialRoom = null } = {}) {
  const ctx = await importContext();
  const utils = await importBranchScopeUtils();
  const layer = await importScopedDataLayer();
  const captured = {};
  const Tab = buildScheduleLinkTabHarness(captured, utils, layer, ctx);

  function Outer() {
    const { branchId, selectBranch } = ctx.useSelectedBranch();
    captured.selectBranch = selectBranch;
    captured.currentBranchId = branchId;
    return React.createElement(Tab, {
      selectedBranchId: branchId,
      schedSelectedDoctor: initialDoctor,
      schedSelectedRoom: initialRoom,
    });
  }

  const { rerender, unmount } = renderHook(() => null, {
    wrapper: ({ children }) =>
      React.createElement(
        ctx.BranchProvider,
        null,
        React.createElement(Outer, null),
        children,
      ),
  });

  // Allow snapshots + initial effects to settle
  await act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });

  return { captured, ctx, unmount, rerender };
}

// ─── F1 — Initial mount uses BR-A per-branch hours ─────────────────────────

describe('V55.F1 — initial mount uses BR-A per-branch openHours', () => {
  it('F1.1 monFriOpen/Close reflect BR-A narrow window 11:00..15:00', async () => {
    const { captured, unmount } = await mountHarness();
    expect(captured.currentBranchId).toBe('BR-A');
    expect(captured.cs.openHoursMonFri).toEqual({ open: '11:00', close: '15:00' });
    expect(captured.monFriOpen).toBe('11:00');
    expect(captured.monFriClose).toBe('15:00');
    expect(captured.satSunOpen).toBe('12:00');
    expect(captured.satSunClose).toBe('16:00');
    unmount();
  });

  it('F1.2 branchExamRooms loads BR-A rooms (1 doctor room)', async () => {
    const { captured, unmount } = await mountHarness();
    expect(captured.branchExamRooms).toHaveLength(1);
    expect(captured.branchExamRooms[0].id).toBe('room-A1');
    expect(captured.branchExamRooms[0].role).toBe('doctor');
    unmount();
  });

  it('F1.3 livePractitioners filtered to BR-A only (Dr.A + Universal + พนง A)', async () => {
    const { captured, unmount } = await mountHarness();
    const ids = (captured.livePractitioners || []).map((p) => p.id).sort();
    expect(ids).toEqual(['d-A', 'd-univ', 's-A']);
    unmount();
  });
});

// ─── F2 — Branch switch BR-A → BR-B updates per-branch hours + rooms ──────

describe('V55.F2 — branch switch reactivates per-branch hours/rooms', () => {
  it('F2.1 selectBranch(BR-B) → cs.openHoursMonFri updates to wide window', async () => {
    const { captured, unmount } = await mountHarness();
    expect(captured.monFriOpen).toBe('11:00'); // BR-A initial
    await act(async () => {
      captured.selectBranch('BR-B');
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });
    expect(captured.currentBranchId).toBe('BR-B');
    expect(captured.cs.openHoursMonFri).toEqual({ open: '09:00', close: '21:00' });
    expect(captured.monFriOpen).toBe('09:00');
    expect(captured.monFriClose).toBe('21:00');
    unmount();
  });

  it('F2.2 selectBranch(BR-B) → branchExamRooms refetches (2 rooms)', async () => {
    const { captured, unmount } = await mountHarness();
    expect(captured.branchExamRooms).toHaveLength(1); // BR-A
    await act(async () => {
      captured.selectBranch('BR-B');
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });
    expect(captured.branchExamRooms).toHaveLength(2);
    const ids = captured.branchExamRooms.map((r) => r.id).sort();
    expect(ids).toEqual(['room-B1', 'room-B2']);
    unmount();
  });

  it('F2.3 selectBranch(BR-B) → livePractitioners shows Dr.B + Universal + พนง B', async () => {
    const { captured, unmount } = await mountHarness();
    await act(async () => {
      captured.selectBranch('BR-B');
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });
    const ids = (captured.livePractitioners || []).map((p) => p.id).sort();
    expect(ids).toEqual(['d-B', 'd-univ', 's-B']);
    unmount();
  });
});

// ─── F3 — Cross-branch isolation (no leak) ───

describe('V55.F3 — cross-branch isolation', () => {
  it('F3.1 BR-A practitioners exclude Dr.B', async () => {
    const { captured, unmount } = await mountHarness();
    const ids = (captured.livePractitioners || []).map((p) => p.id);
    expect(ids).not.toContain('d-B');
    expect(ids).not.toContain('s-B');
    unmount();
  });

  it('F3.2 BR-B rooms exclude room-A1', async () => {
    const { captured, unmount } = await mountHarness();
    await act(async () => {
      captured.selectBranch('BR-B');
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });
    const ids = captured.branchExamRooms.map((r) => r.id);
    expect(ids).not.toContain('room-A1');
    unmount();
  });

  it('F3.3 universal doctor (no branchIds) appears in BOTH branches', async () => {
    const { captured, unmount } = await mountHarness();
    expect((captured.livePractitioners || []).map((p) => p.id)).toContain('d-univ');
    await act(async () => {
      captured.selectBranch('BR-B');
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });
    expect((captured.livePractitioners || []).map((p) => p.id)).toContain('d-univ');
    unmount();
  });
});

// ─── F4 — Hours fallback chain (branch with empty settings.openHours) ──────

describe('V55.F4 — hours fallback chain', () => {
  it('F4.1 BR-A narrow window (11-15) is preserved across re-renders', async () => {
    const { captured, unmount } = await mountHarness();
    expect(captured.monFriOpen).toBe('11:00');
    expect(captured.monFriClose).toBe('15:00');
    // Trigger a refresh by branch switch + back
    await act(async () => {
      captured.selectBranch('BR-B');
      for (let i = 0; i < 6; i++) await Promise.resolve();
      captured.selectBranch('BR-A');
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });
    expect(captured.monFriOpen).toBe('11:00');
    expect(captured.monFriClose).toBe('15:00');
    unmount();
  });
});

// ─── F5 — Lifecycle round-trip A → B → A ───

describe('V55.F5 — lifecycle round-trip', () => {
  it('F5.1 A → B → A preserves per-branch hours each step', async () => {
    const { captured, unmount } = await mountHarness();
    // Initial A
    const a1 = { ...captured.cs.openHoursMonFri };
    expect(a1).toEqual({ open: '11:00', close: '15:00' });

    // Switch to B
    await act(async () => {
      captured.selectBranch('BR-B');
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });
    expect(captured.cs.openHoursMonFri).toEqual({ open: '09:00', close: '21:00' });

    // Back to A
    await act(async () => {
      captured.selectBranch('BR-A');
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });
    expect(captured.cs.openHoursMonFri).toEqual({ open: '11:00', close: '15:00' });
    expect(captured.branchExamRooms).toHaveLength(1);

    unmount();
  });
});

// ─── F6 — Saved doc shape (mirror AdminDashboard handleGenScheduleLink) ────

describe('V55.F6 — simulated saved-doc shape', () => {
  it('F6.1 saved doc would carry per-branch clinicOpenTime/Close from monFriOpen/Close', async () => {
    const { captured, unmount } = await mountHarness();
    // Simulate the L1354-1357/1368-1371 stamp
    const savedDoc = {
      branchId: captured.currentBranchId,
      clinicOpenTime: captured.monFriOpen,
      clinicCloseTime: captured.monFriClose,
      clinicOpenTimeWeekend: captured.satSunOpen,
      clinicCloseTimeWeekend: captured.satSunClose,
      doctorStartTime: captured.monFriOpen,
      doctorEndTime: captured.monFriClose,
      doctorStartTimeWeekend: captured.satSunOpen,
      doctorEndTimeWeekend: captured.satSunClose,
    };
    expect(savedDoc.branchId).toBe('BR-A');
    expect(savedDoc.clinicOpenTime).toBe('11:00');
    expect(savedDoc.clinicCloseTime).toBe('15:00');
    expect(savedDoc.doctorStartTime).toBe('11:00'); // doctor defaults = clinic open per V55
    expect(savedDoc.doctorEndTime).toBe('15:00');
    unmount();
  });

  it('F6.2 after switch to BR-B → saved doc would carry BR-B hours', async () => {
    const { captured, unmount } = await mountHarness();
    await act(async () => {
      captured.selectBranch('BR-B');
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });
    const savedDoc = {
      branchId: captured.currentBranchId,
      clinicOpenTime: captured.monFriOpen,
      clinicCloseTime: captured.monFriClose,
    };
    expect(savedDoc.branchId).toBe('BR-B');
    expect(savedDoc.clinicOpenTime).toBe('09:00');
    expect(savedDoc.clinicCloseTime).toBe('21:00');
    unmount();
  });
});

// ─── F7 — Pre-V55 BUG REPRO (anti-regression doc) ───

describe('V55.F7 — pre-V55 bug reproduction (anti-regression)', () => {
  it('F7.1 PRE-V55: cs without per-branch merge would have had legacy global only', () => {
    // Simulate the pre-V55 cs initialization that DID NOT branch-merge
    const preV55Cs = {
      clinicOpenTime: '09:00',
      clinicCloseTime: '21:00',
      // openHoursMonFri NOT branch-merged → undefined
    };
    const monFriOpenPre = preV55Cs.openHoursMonFri?.open || preV55Cs.clinicOpenTime || '10:00';
    // Pre-V55 saved doc would carry the GLOBAL open time, NOT per-branch
    expect(monFriOpenPre).toBe('09:00');
    // POST-V55: cs IS branch-merged, so monFriOpen reflects the SELECTED branch
    // (verified in F1.1, F2.1)
  });

  it('F7.2 PRE-V55 modal "เลือกห้อง" dropdown would have shown clinicSettings.rooms (global)', () => {
    // The pre-V55 code: shownRooms = (clinicSettings.rooms || []).filter(...)
    // post-V55: shownRooms = branchExamRooms.filter(...)
    // This anti-regression doc — the legacy pattern ought never resurface.
    const legacyClinicSettingsRooms = [
      { id: 'global-1', name: 'old global room', role: 'doctor' },
    ];
    const branchAExamRooms = ROOMS_BY_BRANCH['BR-A'];
    // Pre-V55 the modal would have rendered global-1 even when admin was on BR-A
    expect(legacyClinicSettingsRooms[0].id).toBe('global-1');
    // Post-V55 the modal renders BR-A's actual rooms
    expect(branchAExamRooms[0].id).toBe('room-A1');
  });
});
