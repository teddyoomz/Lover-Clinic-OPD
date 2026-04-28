// Phase 15.7-bis (2026-04-28) — calendar badge ↔ grid mismatch fix
//
// User report: mini-calendar bubble shows "4" on 29/4 but the time grid
// shows only 1 appointment. Same on 30/4 (badge=1, grid empty) and 6/5
// (badge=2, grid=1).
//
// Root cause (preview_eval confirmed):
//   1. apptMap dropped appointments without `roomName` (silent filter)
//   2. apptMap was {[key]: appt} — same startTime+roomName collisions
//      overwrote (last-write-wins) so 4 collisions rendered as 1.
//
// Fix:
//   - effectiveRoom() resolves missing roomName → "ไม่ระบุห้อง" sentinel
//   - virtual "ไม่ระบุห้อง" room column added when any dayAppt has no roomName
//   - apptMap is array-valued; collisions render primary + "+N" indicator
//     + dupe pills under the cell so admin can edit each
//
// This test bank is a structural source-grep (the AppointmentTab is heavy
// to mount with all its listeners); but each grep targets the specific
// fix shape, so any future regression to silent-drop will fail here.
// Functional simulation of effectiveRoom + apptMap building is at C4.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(import.meta.dirname || __dirname, '..');
const ApptTabSrc = readFileSync(path.join(REPO_ROOT, 'src/components/backend/AppointmentTab.jsx'), 'utf-8');

describe('Phase 15.7-bis — Calendar badge mismatch fix', () => {
  describe('C1 — effectiveRoom + UNASSIGNED_ROOM sentinel', () => {
    it('C1.1 UNASSIGNED_ROOM sentinel constant present', () => {
      expect(ApptTabSrc).toMatch(/const\s+UNASSIGNED_ROOM\s*=\s*['"]— ไม่ระบุห้อง —['"]/);
    });

    it('C1.2 effectiveRoom helper falls back to UNASSIGNED_ROOM when roomName missing', () => {
      expect(ApptTabSrc).toMatch(/const\s+effectiveRoom\s*=\s*\(a\)\s*=>\s*\(a\s*&&\s*a\.roomName\s*\?\s*String\(a\.roomName\)\.trim\(\)\s*:\s*UNASSIGNED_ROOM\)/);
    });

    it('C1.3 virtual ไม่ระบุห้อง column appended when any dayAppt is roomless', () => {
      expect(ApptTabSrc).toMatch(/dayAppts\.some\(a\s*=>\s*!a\?\.roomName\)/);
      expect(ApptTabSrc).toMatch(/set\.add\(UNASSIGNED_ROOM\)/);
    });
  });

  describe('C2 — apptMap is array-valued (no silent overwrite)', () => {
    it('C2.1 apptMap pushes onto array per key', () => {
      // The pre-fix line was: map[`${a.startTime}|${a.roomName}`] = a;
      // Post-fix: map[key] = []; map[key].push(a);
      expect(ApptTabSrc).toMatch(/if\s*\(\s*!map\[key\]\s*\)\s*map\[key\]\s*=\s*\[\]/);
      expect(ApptTabSrc).toMatch(/map\[key\]\.push\(a\)/);
    });

    it('C2.2 apptMap no longer requires roomName to register an appt', () => {
      // Anti-regression: pre-fix `if (a.startTime && a.roomName)` is gone.
      // Post-fix only requires a.startTime (room derived from effectiveRoom).
      const apptMapBlock = ApptTabSrc.split('const apptMap = useMemo')[1] || '';
      const closeIdx = apptMapBlock.indexOf('}, [dayAppts]);');
      const block = closeIdx > 0 ? apptMapBlock.slice(0, closeIdx) : apptMapBlock;
      expect(block).not.toMatch(/a\.startTime\s*&&\s*a\.roomName/);
    });

    it('C2.3 apptMap sorts each cell array by createdAt asc (deterministic primary)', () => {
      expect(ApptTabSrc).toMatch(/map\[k\]\.sort\(/);
      // Sort key uses createdAt + localeCompare. Allow any chars between
      // (the actual code: `String(x.createdAt || '').localeCompare(...)`).
      expect(ApptTabSrc).toMatch(/createdAt[\s\S]{0,100}localeCompare/);
    });
  });

  describe('C3 — cell render handles array + collision indicator', () => {
    it('C3.1 cell render reads apptMap[key] as array (apptList)', () => {
      expect(ApptTabSrc).toMatch(/const\s+apptList\s*=\s*apptMap\[/);
    });

    it('C3.2 collision badge renders when dupCount > 0', () => {
      expect(ApptTabSrc).toMatch(/data-testid="appt-collision-badge"/);
      expect(ApptTabSrc).toMatch(/\+\{dupCount\}/);
    });

    it('C3.3 dupe pills (with data-testid) render below primary', () => {
      expect(ApptTabSrc).toMatch(/data-testid="appt-collision-dupe"/);
      expect(ApptTabSrc).toMatch(/apptList\.slice\(1\)\.map/);
    });

    it('C3.4 occupied check uses effectiveRoom() (not raw roomName)', () => {
      expect(ApptTabSrc).toMatch(/effectiveRoom\(a\)\s*!==\s*room/);
    });

    it('C3.5 click on virtual UNASSIGNED column passes empty roomName to openCreate', () => {
      expect(ApptTabSrc).toMatch(/room\s*===\s*UNASSIGNED_ROOM\s*\?\s*['"]{2}\s*:\s*room/);
    });
  });

  describe('C4 — Functional simulate (mirrors apptMap build)', () => {
    // Mirrors the in-component logic to verify the SHAPE produces correct
    // counts under the user's reported scenarios.

    const UNASSIGNED_ROOM = '— ไม่ระบุห้อง —';
    const effectiveRoom = (a) => (a && a.roomName ? String(a.roomName).trim() : UNASSIGNED_ROOM);

    function buildApptMap(dayAppts) {
      const map = {};
      dayAppts.forEach(a => {
        if (!a.startTime) return;
        const room = effectiveRoom(a);
        const key = `${a.startTime}|${room}`;
        if (!map[key]) map[key] = [];
        map[key].push(a);
      });
      for (const k of Object.keys(map)) {
        map[k].sort((x, y) => String(x.createdAt || '').localeCompare(String(y.createdAt || '')));
      }
      return map;
    }

    function buildRoomList(allKnownRooms, dayAppts) {
      const set = new Set(allKnownRooms);
      if (dayAppts.some(a => !a?.roomName)) set.add(UNASSIGNED_ROOM);
      return [...set];
    }

    function countRendered(map) {
      // How many appts are visible across all cells (sum of array lengths).
      return Object.values(map).reduce((s, arr) => s + arr.length, 0);
    }

    it('C4.1 — 29/4 scenario (4 collisions same time+room) — all 4 visible', () => {
      const dayAppts = [
        { id: 'A1', startTime: '10:30', endTime: '11:00', roomName: 'นักกายภาพ', customerName: 'คุณ นุ่น อิอิ', createdAt: '2026-04-28T01:00Z' },
        { id: 'A2', startTime: '10:30', endTime: '11:00', roomName: 'นักกายภาพ', customerName: 'คุณ นุ่น อิอิ', createdAt: '2026-04-28T02:00Z' },
        { id: 'A3', startTime: '10:30', endTime: '11:00', roomName: 'นักกายภาพ', customerName: 'คุณ นุ่น อิอิ', createdAt: '2026-04-28T03:00Z' },
        { id: 'A4', startTime: '10:30', endTime: '11:00', roomName: 'นักกายภาพ', customerName: 'คุณ นุ่น อิอิ', createdAt: '2026-04-28T04:00Z' },
      ];
      const map = buildApptMap(dayAppts);
      expect(countRendered(map)).toBe(4); // matches badge count
      const cell = map['10:30|นักกายภาพ'];
      expect(cell).toHaveLength(4);
      expect(cell[0].id).toBe('A1'); // earliest createdAt = primary
    });

    it('C4.2 — 30/4 scenario (1 appt, no roomName) — visible in virtual column', () => {
      const dayAppts = [
        { id: 'B1', startTime: '10:00', endTime: '10:30', roomName: null, customerName: 'คุณ หนึ่ง PH' },
      ];
      const rooms = buildRoomList([], dayAppts);
      expect(rooms).toContain(UNASSIGNED_ROOM);
      const map = buildApptMap(dayAppts);
      expect(countRendered(map)).toBe(1);
      expect(map[`10:00|${UNASSIGNED_ROOM}`]).toHaveLength(1);
    });

    it('C4.3 — 6/5 scenario (1 with room + 1 without) — both visible, badge=2 = grid=2', () => {
      const dayAppts = [
        { id: 'C1', startTime: '10:00', endTime: '10:30', roomName: 'นักกายภาพA x', customerName: 'คุณ น้อย PH' },
        { id: 'C2', startTime: '10:00', endTime: '10:30', roomName: null, customerName: 'นาย ลูกค้าใหม่ 04/03' },
      ];
      const rooms = buildRoomList(['นักกายภาพA x'], dayAppts);
      expect(rooms).toContain('นักกายภาพA x');
      expect(rooms).toContain(UNASSIGNED_ROOM);
      const map = buildApptMap(dayAppts);
      expect(countRendered(map)).toBe(2);
      expect(map['10:00|นักกายภาพA x']).toHaveLength(1);
      expect(map[`10:00|${UNASSIGNED_ROOM}`]).toHaveLength(1);
    });

    it('C4.4 — appt without startTime is dropped (cannot render in time grid)', () => {
      const dayAppts = [
        { id: 'D1', startTime: '', roomName: 'X' },
        { id: 'D2', startTime: '10:00', roomName: 'X' },
      ];
      const map = buildApptMap(dayAppts);
      expect(countRendered(map)).toBe(1);
    });

    it('C4.5 — virtual room NOT added when all appts have roomName', () => {
      const dayAppts = [
        { id: 'E1', startTime: '10:00', roomName: 'A' },
      ];
      const rooms = buildRoomList(['A'], dayAppts);
      expect(rooms).not.toContain(UNASSIGNED_ROOM);
    });

    it('C4.6 — empty dayAppts → empty map, room list unchanged', () => {
      const map = buildApptMap([]);
      expect(map).toEqual({});
      const rooms = buildRoomList(['A', 'B'], []);
      expect(rooms).toEqual(['A', 'B']);
    });

    it('C4.7 — sort tolerates undefined createdAt (treats as empty string)', () => {
      const dayAppts = [
        { id: 'F1', startTime: '10:00', roomName: 'X', createdAt: '2026-04-28T05:00Z' },
        { id: 'F2', startTime: '10:00', roomName: 'X' /* no createdAt */ },
      ];
      const map = buildApptMap(dayAppts);
      // F2 (no createdAt='') sorts BEFORE F1 (any ISO date string)
      expect(map['10:00|X'][0].id).toBe('F2');
    });
  });

  describe('C5 — Phase 15.7-bis institutional-memory marker', () => {
    it('C5.1 marker comment present in AppointmentTab', () => {
      expect(ApptTabSrc).toMatch(/Phase 15\.7-bis/);
    });
  });
});
