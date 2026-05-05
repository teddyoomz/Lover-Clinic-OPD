// ─── Phase 18.0 Task 9 — migration script pure helpers ──────────────────
// Tests for buildSeedPlan + buildBackfillPlan + normalizeRoomName.
// firebase-admin not exercised — pure helpers only.

import { describe, it, expect } from 'vitest';
import {
  normalizeRoomName,
  buildSeedPlan,
  buildBackfillPlan,
  SEED_ROOMS,
} from '../scripts/phase-18-0-seed-exam-rooms.mjs';

describe('Phase 18.0 — migration script pure helpers', () => {
  describe('M1 normalizeRoomName', () => {
    it('M1.1 lowercases + trims', () => {
      expect(normalizeRoomName('  ห้องดริป  ')).toBe('ห้องดริป');
      expect(normalizeRoomName('ห้อง Drip ')).toBe('ห้อง drip');
    });
    it('M1.2 returns "" for non-strings', () => {
      expect(normalizeRoomName(null)).toBe('');
      expect(normalizeRoomName(undefined)).toBe('');
      expect(normalizeRoomName(123)).toBe('');
    });
  });

  describe('M2 SEED_ROOMS', () => {
    it('M2.1 has 3 rooms in expected order with sortOrder 0/1/2', () => {
      expect(SEED_ROOMS.map(r => r.name)).toEqual([
        'ห้องแพทย์/ห้องผ่าตัด',
        'ห้องช็อคเวฟ',
        'ห้องดริป',
      ]);
      expect(SEED_ROOMS.map(r => r.sortOrder)).toEqual([0, 1, 2]);
    });
    it('M2.2 frozen', () => {
      expect(Object.isFrozen(SEED_ROOMS)).toBe(true);
    });
  });

  describe('M3 buildSeedPlan', () => {
    it('M3.1 empty existing → CREATE all 3 with new IDs', () => {
      const plan = buildSeedPlan([], 'BR-A', () => 'EXR-FAKE-ID');
      expect(plan.toCreate).toHaveLength(3);
      expect(plan.toCreate[0].name).toBe('ห้องแพทย์/ห้องผ่าตัด');
      expect(plan.toCreate[0].branchId).toBe('BR-A');
      expect(plan.toCreate[0].status).toBe('ใช้งาน');
      expect(plan.skippedExisting).toEqual([]);
      expect(Object.keys(plan.nameToId).length).toBe(3);
    });
    it('M3.2 existing room with case/space-variant name reused (no new CREATE)', () => {
      const existing = [{ examRoomId: 'EXR-OLD', name: 'ห้องดริป  ', branchId: 'BR-A' }];
      const plan = buildSeedPlan(existing, 'BR-A', () => 'EXR-FAKE');
      expect(plan.toCreate.map(r => r.name)).toEqual(['ห้องแพทย์/ห้องผ่าตัด', 'ห้องช็อคเวฟ']);
      expect(plan.skippedExisting.map(r => r.examRoomId)).toEqual(['EXR-OLD']);
      expect(plan.nameToId['ห้องดริป']).toBe('EXR-OLD');
    });
    it('M3.3 idempotent — re-run with all 3 already existing → 0 CREATE', () => {
      const existing = SEED_ROOMS.map((r, i) => ({ examRoomId: `EXR-${i}`, name: r.name, branchId: 'BR-A' }));
      const plan = buildSeedPlan(existing, 'BR-A', () => 'EXR-FAKE');
      expect(plan.toCreate).toEqual([]);
      expect(Object.keys(plan.nameToId).length).toBe(3);
      // nameToId points to existing IDs, not new ones
      expect(plan.nameToId['ห้องดริป']).toBe('EXR-2');
    });
    it('M3.4 idGen called once per CREATE (sequential)', () => {
      const ids = ['EXR-1', 'EXR-2', 'EXR-3'];
      let i = 0;
      const idGen = () => ids[i++];
      const plan = buildSeedPlan([], 'BR-A', idGen);
      expect(plan.toCreate.map(r => r.examRoomId)).toEqual(['EXR-1', 'EXR-2', 'EXR-3']);
    });
  });

  describe('M4 buildBackfillPlan', () => {
    const nameToId = {
      'ห้องแพทย์/ห้องผ่าตัด': 'EXR-A',
      'ห้องช็อคเวฟ': 'EXR-B',
      'ห้องดริป': 'EXR-C',
    };

    it('M4.1 appts with matching roomName get queued for UPDATE with the right roomId', () => {
      const appts = [
        { id: 'A1', roomName: 'ห้องดริป', roomId: '' },
        { id: 'A2', roomName: '  ห้องช็อคเวฟ ', roomId: '' },
      ];
      const plan = buildBackfillPlan(appts, nameToId);
      expect(plan.toUpdate).toEqual([
        { id: 'A1', roomId: 'EXR-C' },
        { id: 'A2', roomId: 'EXR-B' },
      ]);
      expect(plan.unmatched).toEqual([]);
    });

    it('M4.2 appts with non-matching roomName are unmatched (left alone)', () => {
      const appts = [
        { id: 'A1', roomName: 'ห้องอื่นๆ' },
        { id: 'A2', roomName: '' },
      ];
      const plan = buildBackfillPlan(appts, nameToId);
      expect(plan.toUpdate).toEqual([]);
      expect(plan.unmatched).toEqual([
        { id: 'A1', roomName: 'ห้องอื่นๆ' },
        { id: 'A2', roomName: '' },
      ]);
    });

    it('M4.3 appts with roomId already set are skipped (idempotent)', () => {
      const appts = [{ id: 'A1', roomName: 'ห้องดริป', roomId: 'EXR-PRE-EXISTING' }];
      const plan = buildBackfillPlan(appts, nameToId);
      expect(plan.toUpdate).toEqual([]);
      expect(plan.skippedAlreadyLinked).toEqual([{ id: 'A1', roomId: 'EXR-PRE-EXISTING' }]);
    });

    it('M4.4 counts grouped by matched name', () => {
      const appts = [
        { id: 'A1', roomName: 'ห้องดริป' },
        { id: 'A2', roomName: 'ห้องดริป' },
        { id: 'A3', roomName: 'ห้องช็อคเวฟ' },
      ];
      const plan = buildBackfillPlan(appts, nameToId);
      expect(plan.matchCounts).toEqual({ 'ห้องดริป': 2, 'ห้องช็อคเวฟ': 1 });
    });

    it('M4.5 case-insensitive trim match', () => {
      const appts = [{ id: 'A1', roomName: '  ห้องดริป  ' }];
      const plan = buildBackfillPlan(appts, nameToId);
      expect(plan.toUpdate).toEqual([{ id: 'A1', roomId: 'EXR-C' }]);
    });
  });
});
