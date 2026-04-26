// ═══════════════════════════════════════════════════════════════════════════
// schedule-customer-link — end-to-end tests of the slot experience the
// customer actually sees when they open a schedule link.
//
// Scope:
//   • ห้อง — every link type (พบแพทย์ / ไม่พบแพทย์, with/without doctor,
//            with/without room) × every appointment room type
//   • เวลา — slot overlaps, exact boundaries, various slot durations
//   • เปิด/ปิด — clinic closed days, clinic open/close hours per weekday
//     vs weekend, showFrom today/tomorrow, endDate caps
//   • แพทย์เข้า/ออก — doctorDays subset, customDoctorHours overrides,
//     multi-range doctor hours, no-doctor mode
//
// Strategy: simulate the admin-side filter (to build bookedSlots exactly
// like AdminDashboard.handleGenScheduleLink would), then feed into the
// customer-side helpers (isSlotBooked / isSlotOutsideDoctorHours / etc)
// to assert the slot experience the customer renders.
// ═══════════════════════════════════════════════════════════════════════════
import { describe, it, expect } from 'vitest';
import {
  shouldBlockScheduleSlot,
  shouldBlockDoctorSlot,
  generateTimeSlots,
  isSlotBooked,
  getDoctorRangesForDate,
  isSlotOutsideDoctorHours,
  isDayVisible,
  getClinicHoursForDate,
} from '../src/lib/scheduleFilterUtils.js';

// Practitioner + room fixtures
const DR_A = '101'; const DR_B = '102';
const AST_X = '201'; const AST_Y = '202';
const ROOM_EXAM = '301';     // doctor room (ห้องตรวจ/ผ่าตัด)
const ROOM_EXAM2 = '302';    // doctor room
const ROOM_SHOCK = '401';    // staff room (Shockwave)
const ROOM_SHOCK2 = '402';   // staff room

const assistantIds = new Set([AST_X, AST_Y]);
const doctorPractitionerIds = new Set([DR_A, DR_B]);
const doctorRoomIds = new Set([ROOM_EXAM, ROOM_EXAM2]);

// Utility: given a list of appointments and filter, produce bookedSlots the
// same way AdminDashboard.handleGenScheduleLink would. Mirrors that flow
// minus the Firestore I/O. Both admin-side helpers are shared from
// scheduleFilterUtils, so this test stays in lockstep with production.
function buildBookedSlots(appointments, filterCfg) {
  const doctorSlotCfg = {
    noDoctorRequired: filterCfg.noDoctorRequired,
    doctorPractitionerIds,
    doctorRoomIds,
  };
  const bookedSlots = [];
  const doctorBookedSlots = [];
  appointments.forEach((a) => {
    if (!a.date || !a.startTime || !a.endTime) return;
    if (shouldBlockDoctorSlot(a, doctorSlotCfg)) {
      doctorBookedSlots.push({ date: a.date, startTime: a.startTime, endTime: a.endTime });
    }
    if (shouldBlockScheduleSlot(a, filterCfg)) {
      bookedSlots.push({ date: a.date, startTime: a.startTime, endTime: a.endTime });
    }
  });
  return { bookedSlots, doctorBookedSlots };
}

// Shared clinic schedule doc — Monday through Friday 10–19, Sat/Sun 10–17.
// Doctor present weekdays only by default.
const CLINIC_DOC = {
  clinicOpenTime: '10:00', clinicCloseTime: '19:00',
  clinicOpenTimeWeekend: '10:00', clinicCloseTimeWeekend: '17:00',
  doctorStartTime: '10:00', doctorEndTime: '19:00',
  doctorStartTimeWeekend: '10:00', doctorEndTimeWeekend: '17:00',
  slotDurationMins: 60,
  doctorDays: ['2026-04-20', '2026-04-21', '2026-04-22', '2026-04-23', '2026-04-24'], // Mon-Fri
  closedDays: [],
  customDoctorHours: {},
  noDoctorRequired: false,
};

// ═══════════════════════════════════════════════════════════════════════════
// ห้อง × ประเภทลิ้งก์ — customer view correctness
// ═══════════════════════════════════════════════════════════════════════════
describe('customer-link × room — bookedSlots end-to-end', () => {
  const appts = [
    // Shockwave (staff room) booked by assistant X at 16:30–17:00
    { date: '2026-04-20', startTime: '16:30', endTime: '17:00', doctorId: AST_X, roomId: ROOM_SHOCK },
    // Doctor A in exam-room 1 at 14:00–15:00
    { date: '2026-04-20', startTime: '14:00', endTime: '15:00', doctorId: DR_A, roomId: ROOM_EXAM },
    // Doctor B in exam-room 2 at 11:00–12:00
    { date: '2026-04-20', startTime: '11:00', endTime: '12:00', doctorId: DR_B, roomId: ROOM_EXAM2 },
  ];

  it('type A [พบแพทย์ + all doctors + no room] — customer sees all doctor bookings busy, Shockwave too (legacy)', () => {
    const cfg = { noDoctorRequired: false, selectedDoctorId: null, selectedRoomId: null, assistantIds };
    const { bookedSlots } = buildBookedSlots(appts, cfg);
    expect(isSlotBooked('2026-04-20', '14:00', '15:00', bookedSlots)).toBe(true);
    expect(isSlotBooked('2026-04-20', '11:00', '12:00', bookedSlots)).toBe(true);
    expect(isSlotBooked('2026-04-20', '16:30', '17:00', bookedSlots)).toBe(true); // legacy includes all
  });

  it('type B [พบแพทย์ + doctor A + no room] — only A\'s 14:00 slot busy', () => {
    const cfg = { noDoctorRequired: false, selectedDoctorId: DR_A, selectedRoomId: null, assistantIds };
    const { bookedSlots } = buildBookedSlots(appts, cfg);
    expect(isSlotBooked('2026-04-20', '14:00', '15:00', bookedSlots)).toBe(true);
    expect(isSlotBooked('2026-04-20', '11:00', '12:00', bookedSlots)).toBe(false); // doctor B not us
    expect(isSlotBooked('2026-04-20', '16:30', '17:00', bookedSlots)).toBe(false); // assistant not us
  });

  it('type C [พบแพทย์ + all doctors + exam-room 1] — ONLY exam-1 bookings busy (user bug-fix)', () => {
    const cfg = { noDoctorRequired: false, selectedDoctorId: null, selectedRoomId: ROOM_EXAM, assistantIds };
    const { bookedSlots } = buildBookedSlots(appts, cfg);
    expect(isSlotBooked('2026-04-20', '14:00', '15:00', bookedSlots)).toBe(true);  // A in exam-1 → busy
    expect(isSlotBooked('2026-04-20', '11:00', '12:00', bookedSlots)).toBe(false); // exam-2 → free
    expect(isSlotBooked('2026-04-20', '16:30', '17:00', bookedSlots)).toBe(false); // Shockwave → free
  });

  it('type D [พบแพทย์ + doctor A + exam-room 1] — A OR exam-1 busy', () => {
    const cfg = { noDoctorRequired: false, selectedDoctorId: DR_A, selectedRoomId: ROOM_EXAM, assistantIds };
    const moreAppts = [...appts, { date: '2026-04-20', startTime: '15:00', endTime: '16:00', doctorId: DR_B, roomId: ROOM_EXAM }];
    const { bookedSlots } = buildBookedSlots(moreAppts, cfg);
    expect(isSlotBooked('2026-04-20', '14:00', '15:00', bookedSlots)).toBe(true);  // A in exam-1
    expect(isSlotBooked('2026-04-20', '15:00', '16:00', bookedSlots)).toBe(true);  // B in our exam-1 → room busy
    expect(isSlotBooked('2026-04-20', '11:00', '12:00', bookedSlots)).toBe(false); // B in exam-2 — neither
  });

  it('type E [ไม่พบแพทย์ + no room] — only assistant bookings busy', () => {
    const cfg = { noDoctorRequired: true, selectedDoctorId: null, selectedRoomId: null, assistantIds };
    const { bookedSlots } = buildBookedSlots(appts, cfg);
    expect(isSlotBooked('2026-04-20', '16:30', '17:00', bookedSlots)).toBe(true);  // assistant
    expect(isSlotBooked('2026-04-20', '14:00', '15:00', bookedSlots)).toBe(false); // doctor A
    expect(isSlotBooked('2026-04-20', '11:00', '12:00', bookedSlots)).toBe(false); // doctor B
  });

  it('type F [ไม่พบแพทย์ + Shockwave room] — only Shockwave bookings busy, others free', () => {
    const apptsPlus = [
      ...appts,
      // Doctor A walks into Shockwave — room is physically busy
      { date: '2026-04-20', startTime: '10:00', endTime: '10:30', doctorId: DR_A, roomId: ROOM_SHOCK },
      // Assistant in Shockwave-2 — different staff room
      { date: '2026-04-20', startTime: '12:00', endTime: '13:00', doctorId: AST_X, roomId: ROOM_SHOCK2 },
    ];
    const cfg = { noDoctorRequired: true, selectedDoctorId: null, selectedRoomId: ROOM_SHOCK, assistantIds };
    const { bookedSlots } = buildBookedSlots(apptsPlus, cfg);
    expect(isSlotBooked('2026-04-20', '16:30', '17:00', bookedSlots)).toBe(true);  // Shockwave booked
    expect(isSlotBooked('2026-04-20', '10:00', '10:30', bookedSlots)).toBe(true);  // Shockwave booked by dr
    expect(isSlotBooked('2026-04-20', '12:00', '13:00', bookedSlots)).toBe(false); // Shockwave-2 different
    expect(isSlotBooked('2026-04-20', '14:00', '15:00', bookedSlots)).toBe(false); // exam room, unrelated
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// เวลา — slot overlap + boundary correctness
// ═══════════════════════════════════════════════════════════════════════════
describe('time — slot overlap detection', () => {
  const booked = [{ date: '2026-04-20', startTime: '10:00', endTime: '11:00' }];

  it('exact match → busy', () => {
    expect(isSlotBooked('2026-04-20', '10:00', '11:00', booked)).toBe(true);
  });
  it('slot ends exactly at booking start → free (half-open interval)', () => {
    expect(isSlotBooked('2026-04-20', '09:00', '10:00', booked)).toBe(false);
  });
  it('slot starts exactly at booking end → free', () => {
    expect(isSlotBooked('2026-04-20', '11:00', '12:00', booked)).toBe(false);
  });
  it('slot straddles start → busy', () => {
    expect(isSlotBooked('2026-04-20', '09:30', '10:30', booked)).toBe(true);
  });
  it('slot straddles end → busy', () => {
    expect(isSlotBooked('2026-04-20', '10:30', '11:30', booked)).toBe(true);
  });
  it('slot contained in booking → busy', () => {
    expect(isSlotBooked('2026-04-20', '10:15', '10:45', booked)).toBe(true);
  });
  it('slot contains booking → busy', () => {
    expect(isSlotBooked('2026-04-20', '09:00', '12:00', booked)).toBe(true);
  });
  it('different date → free', () => {
    expect(isSlotBooked('2026-04-21', '10:00', '11:00', booked)).toBe(false);
  });
});

describe('time — generateTimeSlots boundaries + durations', () => {
  it('10:00–13:00 × 60min → 3 slots (10, 11, 12)', () => {
    expect(generateTimeSlots('10:00', '13:00', 60)).toEqual([
      { start: '10:00', end: '11:00' }, { start: '11:00', end: '12:00' }, { start: '12:00', end: '13:00' },
    ]);
  });
  it('10:00–11:30 × 30min → 3 slots', () => {
    expect(generateTimeSlots('10:00', '11:30', 30)).toEqual([
      { start: '10:00', end: '10:30' }, { start: '10:30', end: '11:00' }, { start: '11:00', end: '11:30' },
    ]);
  });
  it('10:00–12:00 × 90min → 1 slot (second would overrun)', () => {
    expect(generateTimeSlots('10:00', '12:00', 90)).toEqual([{ start: '10:00', end: '11:30' }]);
  });
  it('10:00–11:00 × 15min → 4 slots', () => {
    const slots = generateTimeSlots('10:00', '11:00', 15);
    expect(slots.length).toBe(4);
    expect(slots[0]).toEqual({ start: '10:00', end: '10:15' });
    expect(slots[3]).toEqual({ start: '10:45', end: '11:00' });
  });
  it('open equals close → no slots', () => {
    expect(generateTimeSlots('10:00', '10:00', 60)).toEqual([]);
  });
  it('close before open → no slots', () => {
    expect(generateTimeSlots('15:00', '10:00', 60)).toEqual([]);
  });
  it('duration 0 → no slots', () => {
    expect(generateTimeSlots('10:00', '20:00', 0)).toEqual([]);
  });
  it('pads HH and MM to two digits', () => {
    expect(generateTimeSlots('09:00', '10:00', 60)[0]).toEqual({ start: '09:00', end: '10:00' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// เปิด/ปิด — clinic day visibility + open/close hours
// ═══════════════════════════════════════════════════════════════════════════
describe('open/close — closed days, showFrom, endDate', () => {
  it('closed day hidden', () => {
    const doc = { ...CLINIC_DOC, closedDays: ['2026-04-22'] };
    expect(isDayVisible('2026-04-22', doc)).toBe(false);
    expect(isDayVisible('2026-04-21', doc)).toBe(true);
  });
  it('before showFromDate hidden', () => {
    expect(isDayVisible('2026-04-19', CLINIC_DOC, { showFromDate: '2026-04-20' })).toBe(false);
    expect(isDayVisible('2026-04-20', CLINIC_DOC, { showFromDate: '2026-04-20' })).toBe(true);
  });
  it('after endDate hidden', () => {
    expect(isDayVisible('2026-04-25', CLINIC_DOC, { endDate: '2026-04-24' })).toBe(false);
    expect(isDayVisible('2026-04-24', CLINIC_DOC, { endDate: '2026-04-24' })).toBe(true);
  });
  it('endDate + closedDays combined', () => {
    const doc = { ...CLINIC_DOC, closedDays: ['2026-04-22'] };
    expect(isDayVisible('2026-04-22', doc, { endDate: '2026-04-24' })).toBe(false); // closed trumps
    expect(isDayVisible('2026-04-25', doc, { endDate: '2026-04-24' })).toBe(false);
  });
});

describe('open/close — weekday vs weekend clinic hours', () => {
  it('Monday 2026-04-20 → weekday hours', () => {
    expect(getClinicHoursForDate('2026-04-20', CLINIC_DOC)).toEqual({ open: '10:00', close: '19:00' });
  });
  it('Saturday 2026-04-25 → weekend hours', () => {
    expect(getClinicHoursForDate('2026-04-25', CLINIC_DOC)).toEqual({ open: '10:00', close: '17:00' });
  });
  it('Sunday 2026-04-26 → weekend hours', () => {
    expect(getClinicHoursForDate('2026-04-26', CLINIC_DOC)).toEqual({ open: '10:00', close: '17:00' });
  });
  it('weekend hours fall back to weekday when weekend fields missing', () => {
    const doc = { clinicOpenTime: '09:00', clinicCloseTime: '18:00' };
    expect(getClinicHoursForDate('2026-04-25', doc)).toEqual({ open: '09:00', close: '18:00' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// แพทย์เข้า/ออก — doctor working hours
// ═══════════════════════════════════════════════════════════════════════════
describe('doctor in/out — doctorDays + doctorStart/End', () => {
  it('doctor NOT present on a non-doctor day → no gating', () => {
    // Wednesday is a doctor day, but 2026-04-25 (Saturday) is not in doctorDays.
    // isSlotOutsideDoctorHours returns false (no gating) → caller treats as OK.
    expect(isSlotOutsideDoctorHours('2026-04-25', '10:00', '11:00', CLINIC_DOC)).toBe(false);
  });
  it('doctor present, slot inside hours → not outside', () => {
    expect(isSlotOutsideDoctorHours('2026-04-20', '12:00', '13:00', CLINIC_DOC)).toBe(false);
  });
  it('doctor present, slot fully before hours → outside', () => {
    expect(isSlotOutsideDoctorHours('2026-04-20', '08:00', '09:00', CLINIC_DOC)).toBe(true);
  });
  it('doctor present, slot straddles start → outside (must fit fully)', () => {
    expect(isSlotOutsideDoctorHours('2026-04-20', '09:30', '10:30', CLINIC_DOC)).toBe(true);
  });
  it('doctor present, slot fully after hours → outside', () => {
    expect(isSlotOutsideDoctorHours('2026-04-20', '19:00', '20:00', CLINIC_DOC)).toBe(true);
  });
  it('ไม่พบแพทย์ mode → always returns false (no gating)', () => {
    const doc = { ...CLINIC_DOC, noDoctorRequired: true };
    expect(isSlotOutsideDoctorHours('2026-04-20', '08:00', '09:00', doc)).toBe(false);
  });
});

describe('doctor in/out — customDoctorHours overrides', () => {
  it('single-range override — slot inside override → inside', () => {
    const doc = { ...CLINIC_DOC, customDoctorHours: { '2026-04-20': { start: '13:00', end: '17:00' } } };
    expect(isSlotOutsideDoctorHours('2026-04-20', '14:00', '15:00', doc)).toBe(false);
    expect(isSlotOutsideDoctorHours('2026-04-20', '12:00', '13:00', doc)).toBe(true);
  });
  it('multi-range override — lunch break carved out', () => {
    const doc = { ...CLINIC_DOC, customDoctorHours: { '2026-04-20': [
      { start: '10:00', end: '12:00' }, { start: '14:00', end: '19:00' },
    ] } };
    expect(isSlotOutsideDoctorHours('2026-04-20', '10:00', '11:00', doc)).toBe(false);
    expect(isSlotOutsideDoctorHours('2026-04-20', '14:00', '15:00', doc)).toBe(false);
    expect(isSlotOutsideDoctorHours('2026-04-20', '12:30', '13:30', doc)).toBe(true); // in the gap
    expect(isSlotOutsideDoctorHours('2026-04-20', '11:30', '14:30', doc)).toBe(true); // crosses both
  });
  it('override on a weekend date makes doctor present there (if that date is in doctorDays)', () => {
    const doc = {
      ...CLINIC_DOC,
      doctorDays: [...CLINIC_DOC.doctorDays, '2026-04-26'],
      customDoctorHours: { '2026-04-26': { start: '13:00', end: '17:00' } },
    };
    const ranges = getDoctorRangesForDate('2026-04-26', doc);
    expect(ranges).toEqual([{ start: '13:00', end: '17:00' }]);
  });
});

describe('doctor in/out — day-of-week correctness (timezone-invariant)', () => {
  it('Saturday detected as weekend regardless of browser timezone', () => {
    // 2026-04-25 is a Saturday. UTC-parsing ensures we don't depend on local TZ.
    const doc = { doctorStartTime: '10:00', doctorEndTime: '19:00', doctorStartTimeWeekend: '11:00', doctorEndTimeWeekend: '15:00' };
    expect(getDoctorRangesForDate('2026-04-25', doc)).toEqual([{ start: '11:00', end: '15:00' }]);
  });
  it('Monday detected as weekday', () => {
    const doc = { doctorStartTime: '10:00', doctorEndTime: '19:00', doctorStartTimeWeekend: '11:00', doctorEndTimeWeekend: '15:00' };
    expect(getDoctorRangesForDate('2026-04-20', doc)).toEqual([{ start: '10:00', end: '19:00' }]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Integration — real-world clinic days
// ═══════════════════════════════════════════════════════════════════════════
describe('integration — full customer-view walk-through', () => {
  // Scenario: Monday 2026-04-20, clinic 10–19, doctor A present all day,
  // slot duration 30min. Bookings:
  //   10:00–11:00  Dr A in exam-1
  //   12:00–13:00  Dr B in exam-2 (different doctor, different room)
  //   16:30–17:00  Assistant X in Shockwave (different class of room entirely)
  const doc = {
    ...CLINIC_DOC,
    slotDurationMins: 30,
  };
  const appts = [
    { date: '2026-04-20', startTime: '10:00', endTime: '11:00', doctorId: DR_A, roomId: ROOM_EXAM },
    { date: '2026-04-20', startTime: '12:00', endTime: '13:00', doctorId: DR_B, roomId: ROOM_EXAM2 },
    { date: '2026-04-20', startTime: '16:30', endTime: '17:00', doctorId: AST_X, roomId: ROOM_SHOCK },
  ];

  function slotsFreeForDate(dateStr, doc, cfg) {
    const weekday = generateTimeSlots(doc.clinicOpenTime, doc.clinicCloseTime, doc.slotDurationMins);
    const { bookedSlots } = buildBookedSlots(appts, cfg);
    return weekday.filter((s) =>
      !isSlotBooked(dateStr, s.start, s.end, bookedSlots) &&
      !isSlotOutsideDoctorHours(dateStr, s.start, s.end, doc)
    ).map((s) => `${s.start}-${s.end}`);
  }

  it('type C link (exam-1 room only) — 16:30 Shockwave does NOT block 16:30 exam-1 slot', () => {
    const cfg = { noDoctorRequired: false, selectedDoctorId: null, selectedRoomId: ROOM_EXAM, assistantIds };
    const free = slotsFreeForDate('2026-04-20', doc, cfg);
    expect(free).toContain('16:30-17:00');  // the bug — must be free
    expect(free).not.toContain('10:00-10:30'); // Dr A in exam-1 — busy
    expect(free).not.toContain('10:30-11:00'); // still within Dr A booking
    expect(free).toContain('12:00-12:30');  // Dr B in exam-2 — different room, free
  });

  it('type B link (Dr A only) — 12:00 Dr B booking does NOT block', () => {
    const cfg = { noDoctorRequired: false, selectedDoctorId: DR_A, selectedRoomId: null, assistantIds };
    const free = slotsFreeForDate('2026-04-20', doc, cfg);
    expect(free).toContain('12:00-12:30');
    expect(free).toContain('16:30-17:00'); // assistant in Shockwave
    expect(free).not.toContain('10:00-10:30');
  });

  it('doctorBookedSlots excludes doctor-in-STAFF-room (user bug 2026-04-19)', () => {
    // Appointment: Dr A in Shockwave (staff room) at 16:30.
    // Link: ไม่พบแพทย์ + IV-drip (another staff room).
    // Expected: 16:30 free for IV-drip + "หมอว่าง" (NOT หมอไม่ว่าง) because
    // the doctor is doing a procedure, not at their exam station.
    const cfg = { noDoctorRequired: true, selectedDoctorId: null, selectedRoomId: ROOM_SHOCK2, assistantIds };
    const apptsUserScenario = [
      { date: '2026-04-20', startTime: '16:30', endTime: '17:00', doctorId: DR_A, roomId: ROOM_SHOCK },
    ];
    const { bookedSlots, doctorBookedSlots } = buildBookedSlots(apptsUserScenario, cfg);
    // IV-drip slot itself is free — the other staff room is Shockwave, unrelated.
    expect(isSlotBooked('2026-04-20', '16:30', '17:00', bookedSlots)).toBe(false);
    // "หมอไม่ว่าง" would only fire if doctorBookedSlots contained this appointment.
    expect(isSlotBooked('2026-04-20', '16:30', '17:00', doctorBookedSlots)).toBe(false);
  });

  it('doctorBookedSlots INCLUDES doctor-in-DOCTOR-room (legitimate "หมอไม่ว่าง")', () => {
    const cfg = { noDoctorRequired: true, selectedDoctorId: null, selectedRoomId: ROOM_SHOCK, assistantIds };
    const apptsUserScenario = [
      { date: '2026-04-20', startTime: '14:00', endTime: '15:00', doctorId: DR_A, roomId: ROOM_EXAM },
    ];
    const { doctorBookedSlots } = buildBookedSlots(apptsUserScenario, cfg);
    // Doctor is at their doctor desk → genuinely busy.
    expect(isSlotBooked('2026-04-20', '14:00', '15:00', doctorBookedSlots)).toBe(true);
  });

  it('doctorBookedSlots excludes assistant in doctor room (assistants never count as "หมอ")', () => {
    const cfg = { noDoctorRequired: true, selectedDoctorId: null, selectedRoomId: ROOM_SHOCK, assistantIds };
    const apptsUserScenario = [
      { date: '2026-04-20', startTime: '14:00', endTime: '15:00', doctorId: AST_X, roomId: ROOM_EXAM },
    ];
    const { doctorBookedSlots } = buildBookedSlots(apptsUserScenario, cfg);
    expect(isSlotBooked('2026-04-20', '14:00', '15:00', doctorBookedSlots)).toBe(false);
  });

  it('type F link (Shockwave room) — exam-room appointments do NOT block', () => {
    const cfg = { noDoctorRequired: true, selectedDoctorId: null, selectedRoomId: ROOM_SHOCK, assistantIds };
    const free = slotsFreeForDate('2026-04-20', doc, cfg);
    // No-doctor mode skips doctor-hour gating entirely
    expect(free).toContain('10:00-10:30');
    expect(free).toContain('12:00-12:30');
    expect(free).not.toContain('16:30-17:00'); // Shockwave busy
  });

  it('closed day hides availability entirely', () => {
    const doc2 = { ...doc, closedDays: ['2026-04-20'] };
    expect(isDayVisible('2026-04-20', doc2)).toBe(false);
  });

  it('doctor works mornings only via customDoctorHours — afternoon slots are "outside"', () => {
    const doc2 = { ...doc, customDoctorHours: { '2026-04-20': { start: '10:00', end: '12:00' } } };
    expect(isSlotOutsideDoctorHours('2026-04-20', '10:00', '10:30', doc2)).toBe(false);
    expect(isSlotOutsideDoctorHours('2026-04-20', '13:00', '13:30', doc2)).toBe(true);
  });

  it('doctor off on Friday (removed from doctorDays) — slot-outside check is disabled, but day-level handling left to caller', () => {
    const doc2 = { ...doc, doctorDays: ['2026-04-20', '2026-04-21', '2026-04-22', '2026-04-23'] };
    // Friday 2026-04-24: since doctorDays doesn't include it, isSlotOutsideDoctorHours returns false
    // (it's the calendar's job to show "no doctor" marker for that day, not the helper's).
    expect(isSlotOutsideDoctorHours('2026-04-24', '10:00', '10:30', doc2)).toBe(false);
  });
});
