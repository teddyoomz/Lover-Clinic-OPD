// ─── Phase 18.0 Task 7 — appointmentRoomColumns helpers ─────────────────
// Pure unit tests for the column derivation primitives used by
// AppointmentTab. Helper is branch-blind; the caller passes the branch's
// rooms (already filtered by listExamRooms({branchId})) + the day's appts.

import { describe, it, expect } from 'vitest';
import {
  effectiveRoomId,
  buildRoomColumnList,
  UNASSIGNED_ROOM_ID,
  UNASSIGNED_ROOM_LABEL,
} from '../src/lib/appointmentRoomColumns.js';

describe('Phase 18.0 — appointmentRoomColumns', () => {
  const branchRoomIds = new Set(['EXR-1', 'EXR-2']);

  describe('C1 effectiveRoomId', () => {
    it('C1.1 valid roomId returns it', () => {
      expect(effectiveRoomId({ roomId: 'EXR-1' }, branchRoomIds)).toBe('EXR-1');
    });
    it('C1.2 blank roomId returns UNASSIGNED', () => {
      expect(effectiveRoomId({ roomId: '' }, branchRoomIds)).toBe(UNASSIGNED_ROOM_ID);
    });
    it('C1.3 missing roomId returns UNASSIGNED', () => {
      expect(effectiveRoomId({}, branchRoomIds)).toBe(UNASSIGNED_ROOM_ID);
    });
    it('C1.4 stale roomId (not in set) returns UNASSIGNED', () => {
      expect(effectiveRoomId({ roomId: 'EXR-DELETED' }, branchRoomIds)).toBe(UNASSIGNED_ROOM_ID);
    });
    it('C1.5 cross-branch roomId returns UNASSIGNED', () => {
      expect(effectiveRoomId({ roomId: 'EXR-OTHER-BRANCH' }, branchRoomIds)).toBe(UNASSIGNED_ROOM_ID);
    });
    it('C1.6 null/undefined appt safe', () => {
      expect(effectiveRoomId(null, branchRoomIds)).toBe(UNASSIGNED_ROOM_ID);
      expect(effectiveRoomId(undefined, branchRoomIds)).toBe(UNASSIGNED_ROOM_ID);
    });
    it('C1.7 missing/empty branchRoomIds → UNASSIGNED', () => {
      expect(effectiveRoomId({ roomId: 'EXR-1' }, null)).toBe(UNASSIGNED_ROOM_ID);
      expect(effectiveRoomId({ roomId: 'EXR-1' }, new Set())).toBe(UNASSIGNED_ROOM_ID);
    });
  });

  describe('C2 buildRoomColumnList', () => {
    const rooms = [
      { examRoomId: 'EXR-A', name: 'A', sortOrder: 2 },
      { examRoomId: 'EXR-B', name: 'B', sortOrder: 0 },
      { examRoomId: 'EXR-C', name: 'C', sortOrder: 1 },
    ];

    it('C2.1 sorts by sortOrder asc then name asc', () => {
      const cols = buildRoomColumnList(rooms, []);
      expect(cols.map(c => c.id)).toEqual(['EXR-B', 'EXR-C', 'EXR-A']);
    });
    it('C2.2 appends UNASSIGNED column iff any orphan appt exists', () => {
      const cols = buildRoomColumnList(rooms, [{ roomId: 'EXR-DELETED' }]);
      expect(cols[cols.length - 1]).toEqual({ id: UNASSIGNED_ROOM_ID, label: UNASSIGNED_ROOM_LABEL, virtual: true });
    });
    it('C2.3 NO UNASSIGNED column when all appts have valid roomId', () => {
      const cols = buildRoomColumnList(rooms, [{ roomId: 'EXR-A' }, { roomId: 'EXR-B' }]);
      expect(cols.find(c => c.id === UNASSIGNED_ROOM_ID)).toBeUndefined();
    });
    it('C2.4 empty rooms list still produces UNASSIGNED column when there are appts', () => {
      const cols = buildRoomColumnList([], [{ roomId: 'X' }]);
      expect(cols).toEqual([{ id: UNASSIGNED_ROOM_ID, label: UNASSIGNED_ROOM_LABEL, virtual: true }]);
    });
    it('C2.5 ties on sortOrder fall back to Thai locale name comparison', () => {
      const ties = [
        { examRoomId: 'EXR-Z', name: 'หย', sortOrder: 0 },
        { examRoomId: 'EXR-A', name: 'หก', sortOrder: 0 },
      ];
      const cols = buildRoomColumnList(ties, []);
      expect(cols.map(c => c.label)).toEqual(['หก', 'หย']);
    });
    it('C2.6 falls back to id when examRoomId missing (legacy doc shape)', () => {
      const cols = buildRoomColumnList([{ id: 'XX', name: 'X' }], []);
      expect(cols[0].id).toBe('XX');
    });
    it('C2.7 null rooms safe', () => {
      const cols = buildRoomColumnList(null, []);
      expect(cols).toEqual([]);
    });
    it('C2.8 null dayAppts safe', () => {
      const cols = buildRoomColumnList(rooms, null);
      expect(cols.find(c => c.id === UNASSIGNED_ROOM_ID)).toBeUndefined();
    });
    it('C2.9 mixed valid + orphan → all valid columns + virtual at end', () => {
      const cols = buildRoomColumnList(rooms, [{ roomId: 'EXR-A' }, { roomId: 'EXR-DELETED' }]);
      expect(cols.length).toBe(4);  // 3 rooms + 1 UNASSIGNED
      expect(cols[cols.length - 1].virtual).toBe(true);
    });
  });
});
