// ═══════════════════════════════════════════════════════════════════════════
// schedule-filter — slot blocking rules for clinic schedule-link generation
// Covers the user-reported bug 2026-04-19: a Shockwave (staff room) appointment
// leaked through to a พบแพทย์ link that targeted ห้องตรวจ/ผ่าตัด (doctor room).
// ═══════════════════════════════════════════════════════════════════════════
import { describe, it, expect } from 'vitest';
import { shouldBlockScheduleSlot } from '../src/lib/scheduleFilterUtils.js';

// Practitioner / room fixtures
const DR_A = '101';     // doctor
const DR_B = '102';     // doctor
const AST_X = '201';    // assistant
const AST_Y = '202';    // assistant
const ROOM_DOC1 = '301'; // doctor room
const ROOM_DOC2 = '302'; // doctor room
const ROOM_STAFF1 = '401'; // staff room (e.g. Shockwave)
const ROOM_STAFF2 = '402'; // staff room

const assistantIds = new Set([AST_X, AST_Y]);

// Config factories — keep call sites readable.
const drCfg = ({ doctor = null, room = null } = {}) => ({
  noDoctorRequired: false,
  selectedDoctorId: doctor,
  selectedRoomId: room,
  assistantIds,
});
const staffCfg = ({ room = null } = {}) => ({
  noDoctorRequired: true,
  selectedDoctorId: null,
  selectedRoomId: room,
  assistantIds,
});

describe('shouldBlockScheduleSlot — user-reported bug', () => {
  it('BUG-REPRO: Shockwave staff-room appt does NOT block doctor-room link (no specific doctor)', () => {
    // Exact reproduction of 2026-04-19 report: appointment is in Shockwave
    // (staff room) at 16:30, link is พบแพทย์ mode targeting a DOCTOR room.
    const appt = { doctorId: DR_A, roomId: ROOM_STAFF1 };
    const cfg = drCfg({ doctor: null, room: ROOM_DOC1 });
    expect(shouldBlockScheduleSlot(appt, cfg)).toBe(false);
  });

  it('BUG-REPRO variant: still false even if the appointment is by the doctor we care about, so long as doctor is not selected and room differs', () => {
    // "all doctors" with a room filter → room decides alone.
    const appt = { doctorId: DR_A, roomId: ROOM_STAFF1 };
    const cfg = drCfg({ doctor: null, room: ROOM_DOC2 });
    expect(shouldBlockScheduleSlot(appt, cfg)).toBe(false);
  });
});

describe('shouldBlockScheduleSlot — พบแพทย์ with specific doctor', () => {
  it('doctor A is busy → block regardless of room', () => {
    const appt = { doctorId: DR_A, roomId: ROOM_DOC2 };
    expect(shouldBlockScheduleSlot(appt, drCfg({ doctor: DR_A, room: ROOM_DOC1 }))).toBe(true);
  });
  it('doctor A booked but someone else has my room → block (room busy)', () => {
    const appt = { doctorId: DR_B, roomId: ROOM_DOC1 };
    expect(shouldBlockScheduleSlot(appt, drCfg({ doctor: DR_A, room: ROOM_DOC1 }))).toBe(true);
  });
  it('neither doctor A nor room DOC1 busy → free', () => {
    const appt = { doctorId: DR_B, roomId: ROOM_DOC2 };
    expect(shouldBlockScheduleSlot(appt, drCfg({ doctor: DR_A, room: ROOM_DOC1 }))).toBe(false);
  });
  it('doctor A selected, no room filter — A booked → block', () => {
    const appt = { doctorId: DR_A, roomId: ROOM_DOC1 };
    expect(shouldBlockScheduleSlot(appt, drCfg({ doctor: DR_A }))).toBe(true);
  });
  it('doctor A selected, no room filter — B booked → free', () => {
    const appt = { doctorId: DR_B, roomId: ROOM_DOC1 };
    expect(shouldBlockScheduleSlot(appt, drCfg({ doctor: DR_A }))).toBe(false);
  });
});

describe('shouldBlockScheduleSlot — พบแพทย์ with no specific doctor (all-doctors view)', () => {
  it('no room filter + any booking → block (legacy conservative behaviour)', () => {
    const appt = { doctorId: DR_A, roomId: ROOM_DOC1 };
    expect(shouldBlockScheduleSlot(appt, drCfg())).toBe(true);
  });
  it('room DOC1 filter + same room booking → block', () => {
    const appt = { doctorId: DR_A, roomId: ROOM_DOC1 };
    expect(shouldBlockScheduleSlot(appt, drCfg({ room: ROOM_DOC1 }))).toBe(true);
  });
  it('room DOC1 filter + DOC2 booking by any doctor → free', () => {
    const appt = { doctorId: DR_A, roomId: ROOM_DOC2 };
    expect(shouldBlockScheduleSlot(appt, drCfg({ room: ROOM_DOC1 }))).toBe(false);
  });
  it('room DOC1 filter + STAFF room booking → free (exact bug scenario)', () => {
    const appt = { doctorId: DR_A, roomId: ROOM_STAFF1 };
    expect(shouldBlockScheduleSlot(appt, drCfg({ room: ROOM_DOC1 }))).toBe(false);
  });
});

describe('shouldBlockScheduleSlot — ไม่พบแพทย์', () => {
  it('no room filter + assistant-X booking → block', () => {
    const appt = { doctorId: AST_X, roomId: ROOM_STAFF1 };
    expect(shouldBlockScheduleSlot(appt, staffCfg())).toBe(true);
  });
  it('no room filter + doctor (not assistant) booking → free (legacy)', () => {
    // In legacy ไม่พบแพทย์ mode without a room, only assistants block.
    const appt = { doctorId: DR_A, roomId: ROOM_STAFF1 };
    expect(shouldBlockScheduleSlot(appt, staffCfg())).toBe(false);
  });
  it('room STAFF1 filter + assistant booking in STAFF1 → block', () => {
    const appt = { doctorId: AST_X, roomId: ROOM_STAFF1 };
    expect(shouldBlockScheduleSlot(appt, staffCfg({ room: ROOM_STAFF1 }))).toBe(true);
  });
  it('room STAFF1 filter + assistant booking in STAFF2 → free', () => {
    const appt = { doctorId: AST_X, roomId: ROOM_STAFF2 };
    expect(shouldBlockScheduleSlot(appt, staffCfg({ room: ROOM_STAFF1 }))).toBe(false);
  });
  it('room STAFF1 filter + doctor-in-STAFF1 booking → block (room is physically occupied)', () => {
    // The room is physically busy regardless of who booked it.
    const appt = { doctorId: DR_A, roomId: ROOM_STAFF1 };
    expect(shouldBlockScheduleSlot(appt, staffCfg({ room: ROOM_STAFF1 }))).toBe(true);
  });
  it('room STAFF1 filter + doctor-in-STAFF2 booking → free', () => {
    const appt = { doctorId: DR_A, roomId: ROOM_STAFF2 };
    expect(shouldBlockScheduleSlot(appt, staffCfg({ room: ROOM_STAFF1 }))).toBe(false);
  });
});

describe('shouldBlockScheduleSlot — edge cases', () => {
  it('null doctorId — no match for specific doctor', () => {
    const appt = { doctorId: null, roomId: ROOM_DOC1 };
    expect(shouldBlockScheduleSlot(appt, drCfg({ doctor: DR_A }))).toBe(false);
  });
  it('null roomId — no match for specific room', () => {
    const appt = { doctorId: DR_A, roomId: null };
    expect(shouldBlockScheduleSlot(appt, drCfg({ room: ROOM_DOC1 }))).toBe(false);
  });
  it('number vs string id — coerces both sides consistently', () => {
    const appt = { doctorId: 101, roomId: 301 };
    expect(shouldBlockScheduleSlot(appt, drCfg({ doctor: '101', room: '301' }))).toBe(true);
    expect(shouldBlockScheduleSlot(appt, drCfg({ doctor: 101, room: 301 }))).toBe(true);
  });
  it('empty-string ids treated as "not selected"', () => {
    const appt = { doctorId: DR_A, roomId: ROOM_STAFF1 };
    const cfg = { noDoctorRequired: false, selectedDoctorId: '', selectedRoomId: '', assistantIds };
    // Falls into legacy "all doctors" → blocks
    expect(shouldBlockScheduleSlot(appt, cfg)).toBe(true);
  });
  it('room selected + selected doctor books another room → block (doctor is busy)', () => {
    const appt = { doctorId: DR_A, roomId: ROOM_DOC2 };
    expect(shouldBlockScheduleSlot(appt, drCfg({ doctor: DR_A, room: ROOM_DOC1 }))).toBe(true);
  });
  it('room selected + selected doctor books our room → block (both)', () => {
    const appt = { doctorId: DR_A, roomId: ROOM_DOC1 };
    expect(shouldBlockScheduleSlot(appt, drCfg({ doctor: DR_A, room: ROOM_DOC1 }))).toBe(true);
  });
  it('missing assistantIds tolerated in ไม่พบแพทย์ mode', () => {
    const appt = { doctorId: AST_X, roomId: ROOM_STAFF1 };
    const cfg = { noDoctorRequired: true, selectedDoctorId: null, selectedRoomId: null, assistantIds: new Set() };
    // No assistants configured → nobody blocks in "legacy" ไม่พบแพทย์ path.
    expect(shouldBlockScheduleSlot(appt, cfg)).toBe(false);
  });
});

describe('shouldBlockScheduleSlot — integration-style cluster scenarios', () => {
  it('morning clinic: Dr.A + exam-room1 free despite Shockwave fully booked', () => {
    // Shockwave has 4 staff appointments; none are Dr.A nor exam-room1.
    const appts = [
      { doctorId: AST_X, roomId: ROOM_STAFF1 },
      { doctorId: AST_Y, roomId: ROOM_STAFF1 },
      { doctorId: DR_B, roomId: ROOM_STAFF1 },
      { doctorId: AST_X, roomId: ROOM_STAFF2 },
    ];
    const cfg = drCfg({ doctor: DR_A, room: ROOM_DOC1 });
    expect(appts.every(a => !shouldBlockScheduleSlot(a, cfg))).toBe(true);
  });

  it('all-doctors link to exam-room1: only exam-room1 bookings block', () => {
    const appts = [
      { doctorId: DR_A, roomId: ROOM_DOC1 },  // blocks
      { doctorId: DR_B, roomId: ROOM_DOC1 },  // blocks
      { doctorId: DR_A, roomId: ROOM_DOC2 },  // free (different doctor room)
      { doctorId: AST_X, roomId: ROOM_STAFF1 }, // free (different room)
    ];
    const cfg = drCfg({ room: ROOM_DOC1 });
    const blocked = appts.map(a => shouldBlockScheduleSlot(a, cfg));
    expect(blocked).toEqual([true, true, false, false]);
  });

  it('ไม่พบแพทย์ link to Shockwave: everyone in Shockwave blocks, others free', () => {
    const appts = [
      { doctorId: AST_X, roomId: ROOM_STAFF1 },  // blocks (same room)
      { doctorId: DR_A, roomId: ROOM_STAFF1 },   // blocks (same room, even if doctor booked)
      { doctorId: AST_Y, roomId: ROOM_STAFF2 },  // free (different staff room)
      { doctorId: DR_B, roomId: ROOM_DOC1 },     // free (different room entirely)
    ];
    const cfg = staffCfg({ room: ROOM_STAFF1 });
    const blocked = appts.map(a => shouldBlockScheduleSlot(a, cfg));
    expect(blocked).toEqual([true, true, false, false]);
  });
});
