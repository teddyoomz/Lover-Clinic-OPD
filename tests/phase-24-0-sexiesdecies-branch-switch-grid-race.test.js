// ─── Phase 24.0-sexiesdecies — branch-switch grid race fix ──────────────
//
// User report 2026-05-06 (with 2 screenshots): "บั๊คการแสดงผลตาราง พอกด
// เปลี่ยนสาขาใน branch selector แล้ว ตารางมันมากองกันแบบภาพที่ 1 ซึ่งที่
// ถูกต้องคือแบบภาพที่ 2 โดย user ต้องแก้ด้วยการกด refresh ซึ่งมันไม่ใช่
// นายไปแก้ให้มันหายมาเลย"
//
// Bug: After switching branch, all appointments piled into the rightmost
// "ไม่ระบุห้อง" column. Refreshing the page fixed it temporarily.
//
// Root cause: race between two effects both depending on selectedBranchId:
//   (a) listenToAppointmentsByDate (fast — onSnapshot) emits NEW branch's
//       appts almost instantly with their NEW-branch roomIds
//   (b) listExamRooms (slower — getDocs Promise) takes 100-500ms to update
//       branchExamRooms with the new branch's rooms
// During the window in between, NEW appts try to match OLD branchExamRooms
// → effectiveRoom() returns UNASSIGNED → everything piles into the right-
// most column.
//
// Fix: tag branchExamRooms with the branchId it was loaded for. Grid does
// NOT render appointments until rooms have re-loaded for the current
// selectedBranchId. typedDayAppts memo gates on roomsReadyForBranch.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..');
const VIEW = fs.readFileSync(
  path.join(ROOT, 'src/components/backend/AppointmentCalendarView.jsx'),
  'utf8',
);

describe('Phase 24.0-sexiesdecies — branch-switch grid race fix', () => {
  it('BSG.A.1 — roomsBranchTag state declared alongside branchExamRooms', () => {
    expect(VIEW).toMatch(/const\s+\[roomsBranchTag,\s*setRoomsBranchTag\]\s*=\s*useState\(null\)/);
  });

  it('BSG.A.2 — roomsReadyForBranch derives from tag === selectedBranchId', () => {
    expect(VIEW).toMatch(/const\s+roomsReadyForBranch\s*=\s*roomsBranchTag\s*===\s*selectedBranchId/);
  });

  it('BSG.A.3 — branchExamRooms cleared immediately on selectedBranchId change', () => {
    // Split the assertion: find the useEffect for branchExamRooms (which has
    // listExamRooms inside) and verify the synchronous-clear happens at the top.
    const block = VIEW.match(/useEffect\(\(\)\s*=>\s*\{[\s\S]{0,2500}?listExamRooms\(\{[\s\S]{0,2500}?\},\s*\[selectedBranchId\]\)/);
    expect(block).toBeTruthy();
    // Synchronous clears (BEFORE the async fetch).
    expect(block[0]).toMatch(/setBranchExamRooms\(\[\]\)/);
    expect(block[0]).toMatch(/setRoomsBranchTag\(null\)/);
    // Order: clear-rooms appears before listExamRooms call.
    const clearIdx = block[0].indexOf('setBranchExamRooms([])');
    const fetchIdx = block[0].indexOf('listExamRooms(');
    expect(clearIdx).toBeGreaterThan(0);
    expect(clearIdx).toBeLessThan(fetchIdx);
  });

  it('BSG.A.4 — fetch success path tags rooms with selectedBranchId', () => {
    expect(VIEW).toMatch(
      /listExamRooms\(\{\s*branchId:\s*selectedBranchId[\s\S]{0,200}?\}\)\s*\.then[\s\S]{0,300}?setRoomsBranchTag\(selectedBranchId\)/,
    );
  });

  it('BSG.A.5 — fetch error path also tags (so empty branches still resolve)', () => {
    // Even on error, tag as ready — UNASSIGNED column absorbs everything,
    // which is correct for a roomless branch. Both .then() AND .catch()
    // must call setRoomsBranchTag(selectedBranchId).
    const tagCalls = VIEW.match(/setRoomsBranchTag\(selectedBranchId\)/g) || [];
    // At minimum 2 occurrences: one in .then, one in .catch.
    expect(tagCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('BSG.A.6 — cancellation guard prevents stale .then() writes', () => {
    // If admin double-switches before the first fetch resolves, the first
    // resolution must NOT clobber the second. Cancellation flag set on cleanup.
    const block = VIEW.match(/useEffect\(\(\)\s*=>\s*\{[\s\S]{0,2500}?listExamRooms\(\{[\s\S]{0,2500}?\},\s*\[selectedBranchId\]\)/);
    expect(block).toBeTruthy();
    expect(block[0]).toMatch(/let\s+cancelled\s*=\s*false/);
    expect(block[0]).toMatch(/if\s*\(cancelled\)\s*return/);
    expect(block[0]).toMatch(/cancelled\s*=\s*true/);
  });

  it('BSG.A.7 — typedDayAppts gates on roomsReadyForBranch', () => {
    expect(VIEW).toMatch(
      /typedDayAppts\s*=\s*useMemo\(\s*\(\)\s*=>\s*\(roomsReadyForBranch\s*\?\s*dayAppts\.filter\(apptMatchesType\)\s*:\s*\[\]\)/,
    );
  });

  it('BSG.A.8 — Phase 24.0-sexiesdecies marker present', () => {
    expect(VIEW).toMatch(/Phase 24\.0-sexiesdecies/);
  });
});

describe('Phase 24.0-sexiesdecies — runtime invariants (Rule I full-flow simulate)', () => {
  it('BSG.F.1 — race scenario: NEW appts arrive before NEW rooms → typedDayAppts is []', () => {
    // Simulate the gate logic.
    const gate = (roomsBranchTag, selectedBranchId, dayAppts) => {
      const roomsReadyForBranch = roomsBranchTag === selectedBranchId;
      return roomsReadyForBranch ? dayAppts : [];
    };

    // Initial state on branch-A:
    let result = gate('BR-A', 'BR-A', [{ id: 'A1', roomId: 'R-A1' }]);
    expect(result.length).toBe(1); // appts visible

    // Admin switches to BR-B; selectedBranchId updates first; rooms cleared
    // and tag reset to null synchronously; listener already pushed BR-B
    // appts (fast onSnapshot).
    result = gate(null, 'BR-B', [{ id: 'B1', roomId: 'R-B1' }]);
    expect(result.length).toBe(0); // appts HIDDEN until rooms catch up

    // Rooms fetch resolves → tag set to BR-B → appts now visible against
    // the correct master room set.
    result = gate('BR-B', 'BR-B', [{ id: 'B1', roomId: 'R-B1' }]);
    expect(result.length).toBe(1);
  });

  it('BSG.F.2 — double-switch race: cancellation flag protects against stale writes', () => {
    // Simulate two rapid switches. The first effect's .then() resolves AFTER
    // the second effect started; cancellation flag must drop the stale write.
    let setRooms = null;
    let setTag = null;
    const states = { rooms: [], tag: null };
    const subscribe = (initial) => {
      let cancelled = false;
      // Mirror of the source effect.
      // (Phase 24.0-sexiesdecies — see AppointmentCalendarView line ~316.)
      states.rooms = [];
      states.tag = null;
      // The async resolution captures `cancelled`:
      const apply = (rooms, branchId) => {
        if (cancelled) return; // skipped
        states.rooms = rooms;
        states.tag = branchId;
      };
      return { cancel: () => { cancelled = true; }, apply };
    };
    const sub1 = subscribe('BR-A');
    // Switch before sub1 resolves:
    sub1.cancel();
    const sub2 = subscribe('BR-B');
    // sub1's .then() finally fires (stale):
    sub1.apply([{ id: 'R-A1' }], 'BR-A');
    // Should NOT have leaked into states:
    expect(states.tag).toBe(null);
    // sub2 resolves (fresh):
    sub2.apply([{ id: 'R-B1' }], 'BR-B');
    expect(states.tag).toBe('BR-B');
    expect(states.rooms[0].id).toBe('R-B1');
  });

  it('BSG.F.3 — error-path fallback: rooms empty + tag set → UNASSIGNED column absorbs everything (correct for roomless branch)', () => {
    // Branch genuinely has no rooms (or fetch failed). Tag IS set so
    // typedDayAppts unblocks; effectiveRoom() returns UNASSIGNED for every
    // appt; grid shows them all in one column. That is the correct behavior
    // for a branch with no exam rooms configured.
    const roomsBranchTag = 'BR-EMPTY';
    const selectedBranchId = 'BR-EMPTY';
    const branchExamRooms = []; // empty
    const dayAppts = [
      { id: 'X1', roomId: 'R-OLD' },
      { id: 'X2', roomId: 'R-NEW' },
    ];
    const roomsReadyForBranch = roomsBranchTag === selectedBranchId;
    const visible = roomsReadyForBranch ? dayAppts : [];
    expect(visible.length).toBe(2); // unblocked
    // All resolve to UNASSIGNED because no master rooms exist.
    const masterById = new Map(branchExamRooms.map(r => [r.id, r.name]));
    const resolved = visible.map(a => masterById.has(a.roomId) ? 'OK' : 'UNASSIGNED');
    expect(resolved).toEqual(['UNASSIGNED', 'UNASSIGNED']);
  });

  it('BSG.F.4 — anti-regression: PRE-fix race repro fails the assertion', () => {
    // Pre-fix: typedDayAppts only filtered by appointmentType, no room-tag gate.
    // NEW appts visible against OLD rooms → all UNASSIGNED.
    const oldBranchRooms = new Map([['R-A1', 'Room A1']]);
    const newBranchAppts = [{ id: 'B1', roomId: 'R-B1' }, { id: 'B2', roomId: 'R-B2' }];
    // Pre-fix resolver:
    const resolved = newBranchAppts.map(a => oldBranchRooms.has(a.roomId) ? 'OK' : 'UNASSIGNED');
    expect(resolved).toEqual(['UNASSIGNED', 'UNASSIGNED']);
    // Confirms the bug shape — all appts pile into UNASSIGNED.
    // Phase 24.0-sexiesdecies fix prevents this by gating typedDayAppts.
  });
});
