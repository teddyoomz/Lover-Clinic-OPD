// Tier-2 regression bank (2026-05-26) — /systematic-debugging 3-fix batch:
//   Issue 1 — Finance "ไปที่นัด" opens the calendar on the appointment's date
//             (was: bounced to TODAY because BackendDashboard set initialApptDate
//             in a post-render useEffect AFTER AppointmentCalendarView had already
//             mounted via the default activeTab='appointment-all' → its
//             selectedDate/calMonth useState initializers locked to today).
//   Issue 2 — create-appointment default start time = branch OPEN hours for the
//             selected date (was hardcoded '10:00' even for an 11:30 branch).
//   Issue 3 — Frontend นัดหมาย cancel HARD-DELETES the appt from be_appointments
//             (was status='cancelled' mark; mirrors the Backend calendar delete).
//
// Source-grep regression locks + pure-logic flow-simulate. Issue 2 runs the REAL
// getOpenHoursForDate (NOT a mock) per Rule Q-honest — the default-time logic is
// verified against the actual helper. The UI render-timing (Issue 1) + the real
// hard-delete round-trip (Issue 3) are L1/user-verified post-deploy (disclosed;
// AdminDashboard is auth-gated and not driven here).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getOpenHoursForDate } from '../src/lib/scheduleFilterUtils.js';

const ROOT = path.resolve(__dirname, '..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const BACKEND_DASH = read('src/pages/BackendDashboard.jsx');
const CALVIEW = read('src/components/backend/AppointmentCalendarView.jsx');
const MODAL = read('src/components/backend/AppointmentFormModal.jsx');
const DEPOSIT = read('src/components/backend/DepositPanel.jsx');
const ADMIN = read('src/pages/AdminDashboard.jsx');
const HUBVIEW = read('src/components/admin/AppointmentHubView.jsx');

// getOpenHoursForDate buckets via midday-UTC getUTCDay(): Sat/Sun → satSun else monFri.
// 2026-06-04 = Thursday (monFri); 2026-06-06 = Saturday (satSun).
const WEEKDAY = '2026-06-04';
const WEEKEND = '2026-06-06';

describe('Issue 1 — Finance "ไปที่นัด" opens the calendar on the appointment date', () => {
  it('I1.1 BackendDashboard derives ?date= SYNCHRONOUSLY in the useState initializer', () => {
    expect(BACKEND_DASH).toMatch(/const \[initialApptDate, setInitialApptDate\] = useState\(\(\) =>/);
    const idx = BACKEND_DASH.indexOf('const [initialApptDate, setInitialApptDate] = useState(() =>');
    const block = BACKEND_DASH.slice(idx, idx + 400);
    expect(block).toMatch(/URLSearchParams\(window\.location\.search\)/);
    expect(block).toMatch(/\.get\('date'\)/);
    expect(block).toMatch(/\\d\{4\}-\\d\{2\}-\\d\{2\}/);
    // Anti-regression: must NOT revert to the old empty-string init (the bug).
    expect(BACKEND_DASH).not.toMatch(/const \[initialApptDate, setInitialApptDate\] = useState\(''\)/);
  });

  it('I1.2 AppointmentCalendarView has a prop-sync effect keyed on [initialSelectedDate]', () => {
    const idx = CALVIEW.indexOf('Issue-1 fix (2026-05-26) — defense-in-depth');
    expect(idx).toBeGreaterThan(-1);
    const block = CALVIEW.slice(idx, idx + 1300);
    expect(block).toMatch(/setSelectedDate\(candidate\)/);
    expect(block).toMatch(/setCalMonth\(/);
    expect(block).toMatch(/\}, \[initialSelectedDate\]\)/);
    // anti-regression: the effect must NOT depend on selectedDate (would fight nav)
    expect(block).not.toMatch(/\}, \[initialSelectedDate, selectedDate\]/);
  });

  it('I1.3 simulate: synchronous derive yields the right date at first mount', () => {
    const deriveInitialApptDate = (search) => {
      try {
        const d = new URLSearchParams(search).get('date');
        return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '';
      } catch { return ''; }
    };
    expect(deriveInitialApptDate('?backend=1&tab=appointment-deposit&date=2026-06-04')).toBe('2026-06-04');
    expect(deriveInitialApptDate('?backend=1&tab=appointment-deposit')).toBe(''); // no date → today
    expect(deriveInitialApptDate('?date=2026-6-4')).toBe('');                      // not zero-padded → reject
    expect(deriveInitialApptDate('?date=garbage')).toBe('');
  });

  it('I1.4 simulate: selectedDate initializer captures the prop when present at mount (vs today-lock when empty)', () => {
    const initSelectedDate = (prop, today) => {
      const c = String(prop || '').trim();
      return /^\d{4}-\d{2}-\d{2}$/.test(c) ? c : today;
    };
    expect(initSelectedDate('2026-06-04', '2026-05-26')).toBe('2026-06-04'); // post-fix (prop correct at mount)
    expect(initSelectedDate('', '2026-05-26')).toBe('2026-05-26');           // PRE-FIX BUG REPRO: empty → today
  });

  it('I1.5 simulate: prop-sync effect snaps a late-arriving valid date (selectedDate + calMonth)', () => {
    const apply = (candidate) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(candidate || '').trim())) return null;
      const [y, m] = candidate.split('-');
      return { selectedDate: candidate, calMonth: { year: parseInt(y, 10), month: parseInt(m, 10) - 1 } };
    };
    expect(apply('2026-06-04')).toEqual({ selectedDate: '2026-06-04', calMonth: { year: 2026, month: 5 } });
    expect(apply('')).toBeNull(); // empty/invalid → no-op (never yank to a bad value)
  });
});

describe('Issue 2 — create-appointment default start time = branch open hours', () => {
  // Mirror of the AppointmentFormModal create initializer + re-apply effect.
  // Runs the REAL getOpenHoursForDate (Rule Q-honest).
  const csOpen1130 = {
    openHoursMonFri: { open: '11:30', close: '20:30' },
    openHoursSatSun: { open: '10:30', close: '19:30' },
  };
  const csNoConfig = {}; // no openHours fields → helper returns null
  const resolveDefaultStart = ({ initialStartTime = '', date, cs }) =>
    initialStartTime || getOpenHoursForDate(date, cs)?.open || '10:00';

  it('I2.1 weekday → branch monFri open time (11:30, NOT 10:00)', () => {
    expect(resolveDefaultStart({ date: WEEKDAY, cs: csOpen1130 })).toBe('11:30');
  });
  it('I2.2 weekend → branch satSun open time (10:30)', () => {
    expect(resolveDefaultStart({ date: WEEKEND, cs: csOpen1130 })).toBe('10:30');
  });
  it('I2.3 no open-hours config → 10:00 legacy fallback', () => {
    expect(getOpenHoursForDate(WEEKDAY, csNoConfig)).toBeNull();
    expect(resolveDefaultStart({ date: WEEKDAY, cs: csNoConfig })).toBe('10:00');
  });
  it('I2.4 explicit initialStartTime (calendar slot click) always wins', () => {
    expect(resolveDefaultStart({ initialStartTime: '15:00', date: WEEKDAY, cs: csOpen1130 })).toBe('15:00');
  });
  it('I2.5 null cs → 10:00 fallback (no throw)', () => {
    expect(resolveDefaultStart({ date: WEEKDAY, cs: null })).toBe('10:00');
  });

  it('I2.6 AppointmentFormModal create initializer uses getOpenHoursForDate', () => {
    expect(MODAL).toMatch(/getOpenHoursForDate\(cDate, cs\)\?\.open \|\| '10:00'/);
  });
  it('I2.7 AppointmentFormModal re-apply effect keyed on date+cs, NOT formData.startTime', () => {
    const idx = MODAL.indexOf('Issue-2 fix (2026-05-26) — keep the create-mode default');
    expect(idx).toBeGreaterThan(-1);
    const block = MODAL.slice(idx, idx + 1300);
    expect(block).toMatch(/getOpenHoursForDate\(formData\.date, cs\)/);
    expect(block).toMatch(/\}, \[mode, initialStartTime, formData\.date, cs\?\.openHoursMonFri, cs\?\.openHoursSatSun\]\)/);
    // anti-regression: keying on formData.startTime would override a manual pick.
    expect(block).not.toMatch(/formData\.startTime\]/);
  });
  it('I2.8 AppointmentCalendarView openCreate passes time || "" (not "10:00")', () => {
    expect(CALVIEW).toMatch(/initialStartTime: time \|\| '',/);
    expect(CALVIEW).not.toMatch(/initialStartTime: time \|\| '10:00'/);
  });
  it('I2.9 DepositPanel deposit-appointment sub-form defaults from visibleTime.openRange', () => {
    const idx = DEPOSIT.indexOf('Issue-2 sibling (2026-05-26)');
    expect(idx).toBeGreaterThan(-1);
    const block = DEPOSIT.slice(idx, idx + 1300);
    expect(block).toMatch(/visibleTime\.openRange\?\.open/);
    expect(block).toMatch(/setApptStartTime\(open\)/);
    expect(block).toMatch(/\}, \[hasAppointment, visibleTime\.openRange\]\)/);
  });
});

describe('Issue 3 — Frontend นัดหมาย cancel HARD-DELETES the appointment', () => {
  const handler = (() => {
    const idx = ADMIN.indexOf('onCancelAppt=');
    return ADMIN.slice(idx, idx + 5500);
  })();

  it('I3.1 onCancelAppt else-path hard-deletes (deleteBackendAppointment)', () => {
    expect(handler).toMatch(/deleteBackendAppointment\(appt\.id\)/);
    // anti-regression: the old mark-cancelled write must be gone from the handler.
    expect(handler).not.toMatch(/updateBackendAppointment\(appt\.id,\s*\{\s*status:\s*['"]cancelled['"]\s*\}\)/);
  });
  it('I3.2 keeps the V125 linked-session archive cascade (reason "appt-deleted")', () => {
    expect(handler).toMatch(/archivedReason:\s*['"]appt-deleted['"]/);
    expect(handler).toMatch(/isArchived:\s*true/);
    expect(handler).toMatch(/catch\s*\(\s*sessErr\s*\)/);
  });
  it('I3.3 deposit "ลบทั้งคู่" path still hard-deletes the pair (deleteDepositBookingPair)', () => {
    expect(handler).toMatch(/deleteDepositBookingPair/);
  });
  it('I3.4 AppointmentHubView confirm wording reflects the delete', () => {
    expect(HUBVIEW).toMatch(/ยกเลิกและลบนัดนี้ออกจากระบบ\?/);
    expect(HUBVIEW).not.toMatch(/window\.confirm\('ยกเลิกนัดนี้\?'\)/);
  });
  it('I3.5 simulate: cancel routing (both → pair delete; this-only / no-deposit → appt delete)', () => {
    const route = (opts = {}) => (opts.deleteDeposit ? 'deleteDepositBookingPair' : 'deleteBackendAppointment');
    expect(route({ deleteDeposit: true })).toBe('deleteDepositBookingPair');  // 'ลบทั้งคู่'
    expect(route({ deleteDeposit: false })).toBe('deleteBackendAppointment'); // 'เก็บมัดจำ' (this-only)
    expect(route({})).toBe('deleteBackendAppointment');                       // no-deposit cancel
  });
});
