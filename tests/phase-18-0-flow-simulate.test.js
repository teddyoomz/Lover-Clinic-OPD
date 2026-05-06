// ─── Phase 18.0 Task 10 — Rule I full-flow simulate ─────────────────────
// Per the project's Rule I, every sub-phase that touches a user-visible
// flow needs a full-flow chain test. Phase 18.0 covers:
//   F1: migration idempotency (seed + backfill plans)
//   F2: appointment write contract (roomId + roomName both written)
//   F3: column derivation (effectiveRoomId + buildRoomColumnList)
//   F4: delete-room runtime fallback (no writes, just re-route)
//   F5: cross-branch isolation
//   F6: virtual UNASSIGNED column appearance/hidden
//   F7: source-grep regression bank (locks the contract across files)

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  effectiveRoomId,
  buildRoomColumnList,
  UNASSIGNED_ROOM_ID,
} from '../src/lib/appointmentRoomColumns.js';
import {
  normalizeRoomName,
  buildSeedPlan,
  buildBackfillPlan,
  SEED_ROOMS,
} from '../scripts/phase-18-0-seed-exam-rooms.mjs';

describe('Phase 18.0 Task 10 — Rule I full-flow simulate', () => {
  describe('F1 — Migration script idempotency', () => {
    it('F1.1 dry-run plan describes 3 creates + 0 updates on empty branch', () => {
      const seed = buildSeedPlan([], 'BR-A', () => 'EXR-NEW');
      const back = buildBackfillPlan([], seed.nameToId);
      expect(seed.toCreate).toHaveLength(3);
      expect(back.toUpdate).toEqual([]);
    });
    it('F1.2 second run after apply describes 0 creates + 0 updates', () => {
      const existing = SEED_ROOMS.map((r, i) => ({ examRoomId: `EXR-${i}`, name: r.name, branchId: 'BR-A' }));
      const seed = buildSeedPlan(existing, 'BR-A', () => 'EXR-NEW');
      const appts = [{ id: 'A1', roomName: 'ห้องดริป', roomId: 'EXR-2' }];
      const back = buildBackfillPlan(appts, seed.nameToId);
      expect(seed.toCreate).toEqual([]);
      expect(back.toUpdate).toEqual([]);
    });
    it('F1.3 backfill smart-matches case-insensitive trim', () => {
      const seed = buildSeedPlan([], 'BR-A', () => 'EXR-N');
      const appts = [
        { id: 'A1', roomName: 'ห้องดริป' },
        { id: 'A2', roomName: '  ห้องช็อคเวฟ  ' },
        { id: 'A3', roomName: 'ห้องอื่นๆ' },  // unmatched
      ];
      const back = buildBackfillPlan(appts, seed.nameToId);
      expect(back.toUpdate).toHaveLength(2);
      expect(back.unmatched).toHaveLength(1);
    });
  });

  describe('F2 — Appointment write contract (roomId + roomName)', () => {
    it('F2.1 AppointmentFormModal submit-payload writes both roomId + roomName', () => {
      const src = readFileSync('src/components/backend/AppointmentFormModal.jsx', 'utf8');
      // Both fields appear in the same payload literal
      expect(src).toMatch(/roomId:\s*formData\.roomId\s*\|\|\s*''/);
      expect(src).toMatch(/roomName:\s*formData\.roomName/);
    });
    it('F2.2 AppointmentFormModal NO FALLBACK_ROOMS / ROOMS_CACHE_KEY remains active', () => {
      const src = readFileSync('src/components/backend/AppointmentFormModal.jsx', 'utf8');
      // The const declarations are removed; only the comment marker remains
      expect(src).not.toMatch(/const FALLBACK_ROOMS = \[\]/);
      expect(src).not.toMatch(/const ROOMS_CACHE_KEY = ['"]appt-rooms-seen['"]/);
      // The localStorage write block is removed
      expect(src).not.toMatch(/localStorage\.setItem\(ROOMS_CACHE_KEY/);
    });
    it('F2.3 DepositPanel deposit→appt writes both roomId + roomName', () => {
      const src = readFileSync('src/components/backend/DepositPanel.jsx', 'utf8');
      expect(src).toMatch(/roomId:\s*apptRoomId\s*\|\|\s*''/);
      expect(src).toMatch(/roomName:\s*apptRoomName/);
    });
    it('F2.4 DepositPanel sources from listExamRooms', () => {
      const src = readFileSync('src/components/backend/DepositPanel.jsx', 'utf8');
      expect(src).toMatch(/listExamRooms\(\{\s*branchId:\s*selectedBranchId/);
    });
  });

  describe('F3 — Column derivation', () => {
    it('F3.1 effectiveRoomId returns id when valid', () => {
      const set = new Set(['EXR-1']);
      expect(effectiveRoomId({ roomId: 'EXR-1' }, set)).toBe('EXR-1');
    });
    it('F3.2 effectiveRoomId returns UNASSIGNED for blank/stale/cross-branch', () => {
      const set = new Set(['EXR-1']);
      expect(effectiveRoomId({ roomId: '' }, set)).toBe(UNASSIGNED_ROOM_ID);
      expect(effectiveRoomId({ roomId: 'EXR-DELETED' }, set)).toBe(UNASSIGNED_ROOM_ID);
      expect(effectiveRoomId({}, set)).toBe(UNASSIGNED_ROOM_ID);
    });
    it('F3.3 buildRoomColumnList sorts master rooms then appends UNASSIGNED', () => {
      const rooms = [
        { examRoomId: 'EXR-A', name: 'A', sortOrder: 1 },
        { examRoomId: 'EXR-B', name: 'B', sortOrder: 0 },
      ];
      const cols = buildRoomColumnList(rooms, [{ roomId: 'EXR-DELETED' }]);
      expect(cols.map(c => c.id)).toEqual(['EXR-B', 'EXR-A', UNASSIGNED_ROOM_ID]);
      expect(cols[2].virtual).toBe(true);
    });
  });

  describe('F4 — Delete-room runtime fallback (no writes)', () => {
    it('F4.1 deleting EXR-1 → next render routes its appts to UNASSIGNED', () => {
      const before = new Set(['EXR-1', 'EXR-2']);
      const after = new Set(['EXR-2']); // EXR-1 deleted
      const appt = { roomId: 'EXR-1', roomName: 'ห้องดริป' };
      expect(effectiveRoomId(appt, before)).toBe('EXR-1');
      expect(effectiveRoomId(appt, after)).toBe(UNASSIGNED_ROOM_ID);
      // No mutation of appt — pure runtime semantics
      expect(appt.roomId).toBe('EXR-1');  // unchanged
    });
    it('F4.2 ExamRoomsTab delete confirm message warns about auto-routing', () => {
      const src = readFileSync('src/components/backend/ExamRoomsTab.jsx', 'utf8');
      // Soft-confirm message includes the auto-routing promise
      expect(src).toMatch(/นัดหมายที่อ้างถึงห้องนี้จะถูกย้ายไป.*ไม่ระบุห้อง.*อัตโนมัติ/);
    });
  });

  describe('F5 — Cross-branch isolation', () => {
    it('F5.1 listExamRooms wrapper auto-injects branchId via scopedDataLayer', () => {
      const src = readFileSync('src/lib/scopedDataLayer.js', 'utf8');
      expect(src).toMatch(/listExamRooms\s*=\s*_autoInject\(\(\)\s*=>\s*raw\.listExamRooms\)/);
    });
    it('F5.2 saveExamRoom stamps branchId via _resolveBranchIdForWrite', () => {
      const src = readFileSync('src/lib/backendClient.js', 'utf8');
      const saveBlock = src.match(/export async function saveExamRoom[\s\S]{0,1500}?\n\}/);
      expect(saveBlock).toBeTruthy();
      expect(saveBlock[0]).toMatch(/_resolveBranchIdForWrite/);
    });
    it('F5.3 BC1.1 — be_exam_rooms classified as branch-spread in coverage matrix', () => {
      const src = readFileSync('tests/branch-collection-coverage.test.js', 'utf8');
      expect(src).toMatch(/'be_exam_rooms':\s*\{\s*scope:\s*'branch-spread'/);
    });
  });

  describe('F6 — Virtual UNASSIGNED column appearance/hidden', () => {
    it('F6.1 no orphans → no virtual column', () => {
      const rooms = [{ examRoomId: 'EXR-1', name: 'A' }];
      const cols = buildRoomColumnList(rooms, [{ roomId: 'EXR-1' }]);
      expect(cols.find(c => c.id === UNASSIGNED_ROOM_ID)).toBeUndefined();
    });
    it('F6.2 mix valid + orphan → virtual column appended', () => {
      const rooms = [{ examRoomId: 'EXR-1', name: 'A' }];
      const cols = buildRoomColumnList(rooms, [
        { roomId: 'EXR-1' },
        { roomId: 'EXR-DELETED' },
      ]);
      expect(cols[cols.length - 1].id).toBe(UNASSIGNED_ROOM_ID);
    });
    it('F6.3 empty appts → no virtual column even with master rooms', () => {
      const rooms = [{ examRoomId: 'EXR-1', name: 'A' }];
      const cols = buildRoomColumnList(rooms, []);
      expect(cols).toHaveLength(1);
      expect(cols[0].id).toBe('EXR-1');
    });
  });

  describe('F7 — Source-grep regression bank (cross-file contract)', () => {
    it('F7.1 firestore.rules has be_exam_rooms match block', () => {
      const rules = readFileSync('firestore.rules', 'utf8');
      expect(rules).toMatch(/match\s+\/be_exam_rooms\/\{\s*roomId\s*\}/);
    });
    it('F7.2 nav has exam-rooms entry under master section', () => {
      const src = readFileSync('src/components/backend/nav/navConfig.js', 'utf8');
      expect(src).toMatch(/id:\s*['"]exam-rooms['"]/);
      expect(src).toMatch(/icon:\s*DoorOpen/);
    });
    it('F7.3 BackendDashboard renders ExamRoomsTab', () => {
      const src = readFileSync('src/pages/BackendDashboard.jsx', 'utf8');
      expect(src).toMatch(/import ExamRoomsTab from/);
      expect(src).toMatch(/activeTab === 'exam-rooms' \? \(\s*<ExamRoomsTab/);
    });
    it('F7.4 permissionGroupValidation has exam_room_management key', () => {
      const src = readFileSync('src/lib/permissionGroupValidation.js', 'utf8');
      expect(src).toMatch(/key:\s*'exam_room_management'/);
    });
    it('F7.5 ExamRoomsTab subscribes to selectedBranchId (BS-9 compliant)', () => {
      const src = readFileSync('src/components/backend/ExamRoomsTab.jsx', 'utf8');
      expect(src).toMatch(/const\s*\{\s*branchId\s*\}\s*=\s*useSelectedBranch\(\)/);
      // reload deps include branchId
      expect(src).toMatch(/}, \[branchId\]\);/);
    });
    it('F7.6 AppointmentTab loads listExamRooms with branchId in deps', () => {
      const src = readFileSync('src/components/backend/AppointmentCalendarView.jsx', 'utf8');
      expect(src).toMatch(/listExamRooms\(\{\s*branchId:\s*selectedBranchId/);
    });
    it('F7.7 Phase 18.0 marker present in modified files', () => {
      const tfp = readFileSync('src/lib/appointmentRoomColumns.js', 'utf8');
      expect(tfp).toMatch(/Phase 18\.0/);
    });
  });
});
