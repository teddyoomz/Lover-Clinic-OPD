// Phase 20.0 AppointmentTab roomId migration (2026-05-06).
//
// Deferred follow-up from Phase 18.0 — switch effectiveRoom resolution
// from roomName-string matching to roomId FK matching first, with
// roomName fallback for legacy pre-Phase-18.0 appointments.
//
// Why: rename-safe (admin can rename a room without orphaning appointments),
// avoids collisions when two rooms have similar Thai names, and aligns
// with the be_appointments → be_exam_rooms FK contract from Phase 18.0.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const APPT_TAB = fs.readFileSync(
  path.join(ROOT, 'src/components/backend/AppointmentTab.jsx'),
  'utf8',
);

describe('Phase 20.0 AppointmentTab roomId — RM1 effectiveRoom uses roomId-first', () => {
  it('RM1.1 — masterRoomById Map is built from branchExamRooms', () => {
    expect(APPT_TAB).toMatch(/masterRoomById\s*=\s*useMemo/);
    expect(APPT_TAB).toMatch(/m\.set\(String\(r\.id\),\s*String\(r\.name\s*\|\|\s*['"]['"]\)\.trim\(\)\)/);
  });

  it('RM1.2 — effectiveRoom checks roomId FIRST against masterRoomById', () => {
    expect(APPT_TAB).toMatch(/const\s+rid\s*=\s*a\s*&&\s*a\.roomId\s*\?\s*String\(a\.roomId\)/);
    expect(APPT_TAB).toMatch(/masterRoomById\.has\(rid\)/);
  });

  it('RM1.3 — effectiveRoom falls back to roomName for legacy appts', () => {
    expect(APPT_TAB).toMatch(/legacy match.*pre-Phase-18\.0/i);
    expect(APPT_TAB).toMatch(/masterRoomNameSet\.has\(nm\)/);
  });

  it('RM1.4 — UNASSIGNED_ROOM remains the orphan-bucket label', () => {
    expect(APPT_TAB).toMatch(/UNASSIGNED_ROOM\s*=\s*['"]— ไม่ระบุห้อง —['"]/);
  });
});

describe('Phase 20.0 AppointmentTab roomId — RM2 effectiveRoom pure-helper simulate', () => {
  // Pure-helper mirror of effectiveRoom. Mirrors the JSX-side logic so
  // tests can exercise the resolver without mounting React.

  function simulateEffectiveRoom(appt, branchExamRooms, UNASSIGNED) {
    const masterRoomById = new Map();
    for (const r of branchExamRooms) {
      if (r?.id) masterRoomById.set(String(r.id), String(r.name || '').trim());
    }
    const masterNameSet = new Set(
      branchExamRooms.map(r => String(r.name || '').trim()).filter(Boolean),
    );
    const rid = appt && appt.roomId ? String(appt.roomId) : '';
    if (rid && masterRoomById.has(rid)) return masterRoomById.get(rid);
    const nm = appt && appt.roomName ? String(appt.roomName).trim() : '';
    if (!nm) return UNASSIGNED;
    return masterNameSet.has(nm) ? nm : UNASSIGNED;
  }

  const masterRooms = [
    { id: 'R-1', name: 'ห้องตรวจ 1' },
    { id: 'R-2', name: 'ห้องตรวจ 2' },
    { id: 'R-3', name: 'ห้องหัตถการ' },
  ];
  const UNASSIGNED = '— ไม่ระบุห้อง —';

  it('RM2.1 — roomId match takes precedence over roomName (rename-safe)', () => {
    // Appt was created when room was named "ห้องเก่า"; admin renamed it
    // to "ห้องตรวจ 1". roomId FK still resolves correctly.
    const appt = { roomId: 'R-1', roomName: 'ห้องเก่า' };
    expect(simulateEffectiveRoom(appt, masterRooms, UNASSIGNED)).toBe('ห้องตรวจ 1');
  });

  it('RM2.2 — roomId match returns master canonical name (not appt-stamped denorm)', () => {
    const appt = { roomId: 'R-2', roomName: 'wrong-stale-name' };
    expect(simulateEffectiveRoom(appt, masterRooms, UNASSIGNED)).toBe('ห้องตรวจ 2');
  });

  it('RM2.3 — roomId NOT in master → fall through to roomName legacy match', () => {
    // Edge case: appt has roomId from another branch (shouldn't happen
    // post-Phase-BSA but defensive). Falls back to roomName.
    const appt = { roomId: 'R-OTHER-BRANCH', roomName: 'ห้องตรวจ 1' };
    expect(simulateEffectiveRoom(appt, masterRooms, UNASSIGNED)).toBe('ห้องตรวจ 1');
  });

  it('RM2.4 — no roomId, roomName matches master → returns roomName', () => {
    const appt = { roomName: 'ห้องตรวจ 2' };
    expect(simulateEffectiveRoom(appt, masterRooms, UNASSIGNED)).toBe('ห้องตรวจ 2');
  });

  it('RM2.5 — no roomId, roomName does NOT match master → UNASSIGNED', () => {
    const appt = { roomName: 'Dr.Chaiyaporn' }; // legacy noise from doctor name
    expect(simulateEffectiveRoom(appt, masterRooms, UNASSIGNED)).toBe(UNASSIGNED);
  });

  it('RM2.6 — neither roomId nor roomName → UNASSIGNED', () => {
    const appt = {};
    expect(simulateEffectiveRoom(appt, masterRooms, UNASSIGNED)).toBe(UNASSIGNED);
  });

  it('RM2.7 — empty branchExamRooms (no master) → all appts UNASSIGNED', () => {
    expect(simulateEffectiveRoom({ roomId: 'R-1', roomName: 'X' }, [], UNASSIGNED)).toBe(UNASSIGNED);
    expect(simulateEffectiveRoom({ roomName: 'ห้องตรวจ 1' }, [], UNASSIGNED)).toBe(UNASSIGNED);
  });

  it('RM2.8 — null appt handled gracefully', () => {
    expect(simulateEffectiveRoom(null, masterRooms, UNASSIGNED)).toBe(UNASSIGNED);
  });

  it('RM2.9 — roomId is numeric string → still matches when master id stored as string', () => {
    const appt = { roomId: 1234 };
    const numericMaster = [{ id: '1234', name: 'ห้องเลข' }];
    expect(simulateEffectiveRoom(appt, numericMaster, UNASSIGNED)).toBe('ห้องเลข');
  });

  it('RM2.10 — whitespace in roomName tolerated via trim()', () => {
    const appt = { roomName: '  ห้องตรวจ 1  ' };
    expect(simulateEffectiveRoom(appt, masterRooms, UNASSIGNED)).toBe('ห้องตรวจ 1');
  });
});
