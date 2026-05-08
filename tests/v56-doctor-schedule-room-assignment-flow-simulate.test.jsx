// V56 / BS-15 — Rule I full-flow simulate F1-F7.
// Tests the doctor-schedule room-assignment feature end-to-end:
//   F1: doctor modal renders room-box + seeds all branch rooms as checked
//   F2: assistant modal shows info chip, NO room box
//   F3: uncheck a room → submit disabled; re-check → enabled
//   F4: clear-all → no rooms checked → submit disabled
//   F5: select-all → all rooms checked → submit enabled
//   F6: room-box hidden for leave entries (showTime=false)
//   F7: derivedAutoClosedDates helper chains entry data correctly
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// --- Firebase mocks (hoisted) ---
vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test-app-v56' }));
vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  query: () => ({}),
  where: () => ({}),
  getDocs: async () => ({ docs: [] }),
  onSnapshot: () => () => {},
  doc: () => ({}),
  getDoc: async () => ({ exists: () => false, data: () => ({}) }),
  setDoc: async () => {},
  updateDoc: async () => {},
  deleteDoc: async () => {},
  serverTimestamp: () => ({ _serverTimestamp: true }),
  Timestamp: { now: () => ({ toDate: () => new Date() }) },
}));

// --- BranchContext mock — modal calls useEffectiveClinicSettings ---
vi.mock('../src/lib/BranchContext.jsx', () => ({
  useEffectiveClinicSettings: () => ({}),
  useSelectedBranch: () => ({ branchId: 'BR-A' }),
  BranchProvider: ({ children }) => children,
}));

// --- scheduleFilterUtils mock — getVisibleTimeSlotsForDate + isTimeOutsideOpenHours ---
vi.mock('../src/lib/scheduleFilterUtils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getVisibleTimeSlotsForDate: ({ allTimeSlots }) => ({
      slots: allTimeSlots || ['09:00', '10:00', '11:00', '12:00', '13:00',
        '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'],
      openRange: { open: '09:00', close: '19:00' },
      isClosed: false,
      hasOutsideAppts: false,
    }),
    isTimeOutsideOpenHours: () => false,
  };
});

// --- Fixture exam rooms ---
const BRANCH_A_ROOMS = [
  { id: 'room-A1', name: 'ห้องตรวจ A1', kind: 'doctor', branchId: 'BR-A' },
  { id: 'room-A2', name: 'ห้องตรวจ A2', kind: 'doctor', branchId: 'BR-A' },
  { id: 'room-A-staff', name: 'ห้องหัตถการ', kind: 'staff', branchId: 'BR-A' },
];
const BRANCH_B_ROOMS = [
  { id: 'room-B1', name: 'ห้องตรวจ B1', kind: 'doctor', branchId: 'BR-B' },
];

// --- Lazy import helpers ---
async function importModal() {
  return await import('../src/components/backend/scheduling/ScheduleEntryFormModal.jsx');
}
async function importHelpers() {
  return await import('../src/lib/staffScheduleValidation.js');
}

// --- Base render helper ---
function renderModal(props = {}) {
  const { default: ScheduleEntryFormModal } = props._mod;
  const {
    open = true,
    kind = 'recurring',
    staffId = 'DR-001',
    staffName = 'Dr. Test',
    staffKind = 'doctor',
    branchExamRooms = BRANCH_A_ROOMS,
    onClose = vi.fn(),
    onSave = vi.fn(async () => {}),
    branchId = 'BR-A',
    ...rest
  } = props;
  return render(
    <ScheduleEntryFormModal
      open={open}
      kind={kind}
      staffId={staffId}
      staffName={staffName}
      staffKind={staffKind}
      branchExamRooms={branchExamRooms}
      onClose={onClose}
      onSave={onSave}
      branchId={branchId}
      {...rest}
    />,
  );
}

describe('V56/BS-15 — F1: doctor modal renders room-box with branch rooms seeded as checked', () => {
  it('F1.1: room-box is visible for doctor + recurring kind', async () => {
    const mod = await importModal();
    renderModal({ _mod: mod, staffKind: 'doctor', kind: 'recurring', branchExamRooms: BRANCH_A_ROOMS });
    expect(screen.getByTestId('schedule-form-rooms-box')).toBeTruthy();
  });

  it('F1.2: both doctor rooms appear as rows', async () => {
    const mod = await importModal();
    renderModal({ _mod: mod, staffKind: 'doctor', kind: 'recurring', branchExamRooms: BRANCH_A_ROOMS });
    expect(screen.getByTestId('schedule-form-room-row-room-A1')).toBeTruthy();
    expect(screen.getByTestId('schedule-form-room-row-room-A2')).toBeTruthy();
  });

  it('F1.3: staff-kind rooms are NOT shown in the doctor room box', async () => {
    const mod = await importModal();
    renderModal({ _mod: mod, staffKind: 'doctor', kind: 'recurring', branchExamRooms: BRANCH_A_ROOMS });
    // room-A-staff has kind='staff' → should NOT have a row
    expect(screen.queryByTestId('schedule-form-room-row-room-A-staff')).toBeNull();
  });

  it('F1.4: both doctor rooms are checked by default (seeded from branchExamRooms)', async () => {
    const mod = await importModal();
    renderModal({ _mod: mod, staffKind: 'doctor', kind: 'recurring', branchExamRooms: BRANCH_A_ROOMS });
    const row1 = screen.getByTestId('schedule-form-room-row-room-A1');
    const row2 = screen.getByTestId('schedule-form-room-row-room-A2');
    const cb1 = row1.querySelector('input[type="checkbox"]');
    const cb2 = row2.querySelector('input[type="checkbox"]');
    expect(cb1.checked).toBe(true);
    expect(cb2.checked).toBe(true);
  });

  it('F1.5: submit button is ENABLED when rooms are seeded', async () => {
    const mod = await importModal();
    renderModal({ _mod: mod, staffKind: 'doctor', kind: 'recurring', branchExamRooms: BRANCH_A_ROOMS });
    const btn = screen.getByTestId('schedule-form-submit');
    expect(btn.disabled).toBe(false);
  });
});

describe('V56/BS-15 — F2: assistant modal shows info chip, NO room box', () => {
  it('F2.1: room-box is hidden for assistant staffKind', async () => {
    const mod = await importModal();
    renderModal({ _mod: mod, staffKind: 'assistant', kind: 'recurring', branchExamRooms: BRANCH_A_ROOMS });
    expect(screen.queryByTestId('schedule-form-rooms-box')).toBeNull();
  });

  it('F2.2: assistant info chip is shown', async () => {
    const mod = await importModal();
    renderModal({ _mod: mod, staffKind: 'assistant', kind: 'recurring', branchExamRooms: BRANCH_A_ROOMS });
    expect(screen.getByTestId('schedule-form-assistant-info')).toBeTruthy();
  });

  it('F2.3: submit is enabled for assistant (no room validation)', async () => {
    const mod = await importModal();
    renderModal({ _mod: mod, staffKind: 'assistant', kind: 'recurring', branchExamRooms: [] });
    const btn = screen.getByTestId('schedule-form-submit');
    expect(btn.disabled).toBe(false);
  });
});

describe('V56/BS-15 — F3: uncheck a room → submit disabled; re-check → enabled', () => {
  it('F3.1: unchecking all rooms disables submit', async () => {
    const mod = await importModal();
    renderModal({ _mod: mod, staffKind: 'doctor', kind: 'recurring', branchExamRooms: BRANCH_A_ROOMS });
    // Uncheck room-A1
    const row1 = screen.getByTestId('schedule-form-room-row-room-A1');
    const cb1 = row1.querySelector('input[type="checkbox"]');
    fireEvent.click(cb1);
    // Uncheck room-A2
    const row2 = screen.getByTestId('schedule-form-room-row-room-A2');
    const cb2 = row2.querySelector('input[type="checkbox"]');
    fireEvent.click(cb2);
    // Both unchecked → submit disabled
    const btn = screen.getByTestId('schedule-form-submit');
    expect(btn.disabled).toBe(true);
  });

  it('F3.2: re-checking one room enables submit again', async () => {
    const mod = await importModal();
    renderModal({ _mod: mod, staffKind: 'doctor', kind: 'recurring', branchExamRooms: BRANCH_A_ROOMS });
    // Uncheck both
    const row1 = screen.getByTestId('schedule-form-room-row-room-A1');
    const cb1 = row1.querySelector('input[type="checkbox"]');
    fireEvent.click(cb1);
    const row2 = screen.getByTestId('schedule-form-room-row-room-A2');
    const cb2 = row2.querySelector('input[type="checkbox"]');
    fireEvent.click(cb2);
    // Re-check room-A1
    fireEvent.click(cb1);
    const btn = screen.getByTestId('schedule-form-submit');
    expect(btn.disabled).toBe(false);
  });
});

describe('V56/BS-15 — F4: clear-all button → no rooms → submit disabled', () => {
  it('F4.1: clicking clear-all unchecks all rooms', async () => {
    const mod = await importModal();
    renderModal({ _mod: mod, staffKind: 'doctor', kind: 'recurring', branchExamRooms: BRANCH_A_ROOMS });
    const clearAll = screen.getByTestId('schedule-form-rooms-clear-all');
    fireEvent.click(clearAll);
    const cb1 = screen.getByTestId('schedule-form-room-row-room-A1').querySelector('input[type="checkbox"]');
    const cb2 = screen.getByTestId('schedule-form-room-row-room-A2').querySelector('input[type="checkbox"]');
    expect(cb1.checked).toBe(false);
    expect(cb2.checked).toBe(false);
  });

  it('F4.2: after clear-all submit is disabled', async () => {
    const mod = await importModal();
    renderModal({ _mod: mod, staffKind: 'doctor', kind: 'recurring', branchExamRooms: BRANCH_A_ROOMS });
    fireEvent.click(screen.getByTestId('schedule-form-rooms-clear-all'));
    expect(screen.getByTestId('schedule-form-submit').disabled).toBe(true);
  });
});

describe('V56/BS-15 — F5: select-all button → all rooms checked → submit enabled', () => {
  it('F5.1: select-all checks all doctor rooms', async () => {
    const mod = await importModal();
    renderModal({ _mod: mod, staffKind: 'doctor', kind: 'recurring', branchExamRooms: BRANCH_A_ROOMS });
    // First clear, then select-all
    fireEvent.click(screen.getByTestId('schedule-form-rooms-clear-all'));
    fireEvent.click(screen.getByTestId('schedule-form-rooms-select-all'));
    const cb1 = screen.getByTestId('schedule-form-room-row-room-A1').querySelector('input[type="checkbox"]');
    const cb2 = screen.getByTestId('schedule-form-room-row-room-A2').querySelector('input[type="checkbox"]');
    expect(cb1.checked).toBe(true);
    expect(cb2.checked).toBe(true);
  });

  it('F5.2: after select-all submit is enabled', async () => {
    const mod = await importModal();
    renderModal({ _mod: mod, staffKind: 'doctor', kind: 'recurring', branchExamRooms: BRANCH_A_ROOMS });
    fireEvent.click(screen.getByTestId('schedule-form-rooms-clear-all'));
    fireEvent.click(screen.getByTestId('schedule-form-rooms-select-all'));
    expect(screen.getByTestId('schedule-form-submit').disabled).toBe(false);
  });
});

describe('V56/BS-15 — F6: room-box hidden for leave entries (showTime=false)', () => {
  it('F6.1: leave kind → no room-box visible', async () => {
    const mod = await importModal();
    renderModal({ _mod: mod, staffKind: 'doctor', kind: 'leave', branchExamRooms: BRANCH_A_ROOMS });
    expect(screen.queryByTestId('schedule-form-rooms-box')).toBeNull();
  });

  it('F6.2: leave kind → no assistant-info chip either', async () => {
    const mod = await importModal();
    renderModal({ _mod: mod, staffKind: 'doctor', kind: 'leave', branchExamRooms: BRANCH_A_ROOMS });
    expect(screen.queryByTestId('schedule-form-assistant-info')).toBeNull();
  });

  it('F6.3: leave kind → submit not disabled by room validation', async () => {
    const mod = await importModal();
    renderModal({ _mod: mod, staffKind: 'doctor', kind: 'leave', branchExamRooms: [] });
    // leave has no room requirement → submit enabled (date validation may still require a date, but disabled ≠ true from rooms)
    const btn = screen.getByTestId('schedule-form-submit');
    // disabled is driven by roomsRequired && roomsEmpty; for leave showTime=false so roomsRequired=false
    expect(btn.disabled).toBe(false);
  });
});

describe('V56/BS-15 — F7: derivedAutoClosedDates helper chains entry data correctly', () => {
  it('F7.1: returns empty array when roomId is null (all-rooms scenario)', async () => {
    const { derivedAutoClosedDates } = await importHelpers();
    const result = derivedAutoClosedDates({
      doctorId: 'DR-001',
      roomId: null,
      allEntries: [],
      datesISO: ['2026-05-10', '2026-05-11'],
    });
    expect(result).toEqual([]);
  });

  it('F7.2: returns dates where doctor has entry but NOT in target room', async () => {
    const { derivedAutoClosedDates } = await importHelpers();
    // Doctor has entry on 2026-05-10 in room-A1 only
    const allEntries = [
      {
        staffId: 'DR-001',
        type: 'work',
        date: '2026-05-10',
        roomIds: ['room-A1'],
        startTime: '09:00',
        endTime: '17:00',
      },
    ];
    // Query for room-A2 → 2026-05-10 is closed (doctor works but not in A2)
    const result = derivedAutoClosedDates({
      doctorId: 'DR-001',
      roomId: 'room-A2',
      allEntries,
      datesISO: ['2026-05-10', '2026-05-11'],
    });
    expect(result).toContain('2026-05-10');
    // 2026-05-11 has no entry → not closed (doctor doesn't work at all → available)
    expect(result).not.toContain('2026-05-11');
  });

  it('F7.3: does NOT close date if doctor IS in the target room', async () => {
    const { derivedAutoClosedDates } = await importHelpers();
    const allEntries = [
      {
        staffId: 'DR-001',
        type: 'work',
        date: '2026-05-10',
        roomIds: ['room-A1', 'room-A2'],
        startTime: '09:00',
        endTime: '17:00',
      },
    ];
    const result = derivedAutoClosedDates({
      doctorId: 'DR-001',
      roomId: 'room-A1',
      allEntries,
      datesISO: ['2026-05-10'],
    });
    expect(result).not.toContain('2026-05-10');
  });

  it('F7.4: result is sorted ascending', async () => {
    const { derivedAutoClosedDates } = await importHelpers();
    const allEntries = [
      { staffId: 'DR-001', type: 'work', date: '2026-05-12', roomIds: ['room-A1'], startTime: '09:00', endTime: '17:00' },
      { staffId: 'DR-001', type: 'work', date: '2026-05-10', roomIds: ['room-A1'], startTime: '09:00', endTime: '17:00' },
    ];
    const result = derivedAutoClosedDates({
      doctorId: 'DR-001',
      roomId: 'room-A2',
      allEntries,
      datesISO: ['2026-05-10', '2026-05-12'],
    });
    expect(result).toEqual([...result].sort());
  });

  it('F7.5: branch B rooms work independently (cross-branch isolation)', async () => {
    const mod = await importModal();
    // Render modal with branch B rooms → only room-B1 present
    renderModal({ _mod: mod, staffKind: 'doctor', kind: 'recurring', branchExamRooms: BRANCH_B_ROOMS });
    expect(screen.getByTestId('schedule-form-room-row-room-B1')).toBeTruthy();
    // Branch A rooms not present
    expect(screen.queryByTestId('schedule-form-room-row-room-A1')).toBeNull();
    expect(screen.queryByTestId('schedule-form-room-row-room-A2')).toBeNull();
  });
});

describe('V56/BS-15 — source-grep regression guards', () => {
  it('SG.1: ScheduleEntryFormModal exports default', async () => {
    const mod = await importModal();
    expect(typeof mod.default).toBe('function');
  });

  it('SG.2: derivedAutoClosedDates is exported from staffScheduleValidation', async () => {
    const helpers = await importHelpers();
    expect(typeof helpers.derivedAutoClosedDates).toBe('function');
  });

  it('SG.3: V56/BS-15 marker present in modal source', async () => {
    // Verify the modal file contains V56 marker via string check
    const fs = await import('fs');
    const path = await import('path');
    const modalPath = path.resolve(
      path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')),
      '../src/components/backend/scheduling/ScheduleEntryFormModal.jsx',
    );
    const content = fs.readFileSync(modalPath, 'utf-8');
    expect(content).toContain('V56');
    expect(content).toContain('BS-15');
    expect(content).toContain('staffKind');
    expect(content).toContain('branchExamRooms');
  });
});
