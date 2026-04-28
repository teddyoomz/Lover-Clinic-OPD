// ─── AppointmentTab — Resource Time Grid (replicate ProClinic layout) ────────
// 3-panel: Left sidebar (mini calendar + doctor list) | Main (week nav + time grid with room columns)
//
// Phase 14.7.C (2026-04-25): inline form replaced with shared
// `AppointmentFormModal` (extracted in 14.7.B). Calendar grid + holiday
// banner + week nav stay here; the entire form (validation, holiday confirm,
// collision check, staff-schedule check, payload write) lives in the shared
// component. Both writers — AppointmentTab + CustomerDetailView — now flow
// through one save path.

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, Loader2, User,
  CalendarDays, CalendarX,
} from 'lucide-react';
import {
  getAppointmentsByMonth, getAppointmentsByDate, listenToAppointmentsByDate, listenToHolidays,
  listenToScheduleByDay, listDoctors,
  // Phase 15.7-sexies (2026-04-28) — delete from calendar modal
  deleteBackendAppointment,
} from '../../lib/backendClient.js';
import { bangkokNow } from '../../utils.js';
import { isDateHoliday, DAY_OF_WEEK_LABELS } from '../../lib/holidayValidation.js';
import AppointmentFormModal from './AppointmentFormModal.jsx';
import TodaysDoctorsPanel from './scheduling/TodaysDoctorsPanel.jsx';
// Phase 15.7 (2026-04-28) — shared assistant-name resolver. Used for
// rendering "+ ผู้ช่วย: A, B, C" below the doctor name. Helper falls back
// to doctorMap lookup for legacy appts that lack assistantNames denorm.
import { resolveAssistantNames, buildDoctorMap } from '../../lib/appointmentDisplay.js';


const THAI_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const THAI_DAYS_SHORT = ['อา','จ','อ','พ','พฤ','ศ','ส'];
const THAI_DAYS_FULL = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
const CAL_HEADERS = ['จ','อ','พ','พฤ','ศ','ส','อา'];
const STATUSES = [
  { value: 'pending', label: 'รอยืนยัน', bg: 'bg-orange-500/20', text: 'text-orange-400', dot: 'bg-orange-400' },
  { value: 'confirmed', label: 'ยืนยันแล้ว', bg: 'bg-sky-500/20', text: 'text-sky-400', dot: 'bg-sky-400' },
  { value: 'done', label: 'เสร็จแล้ว', bg: 'bg-emerald-500/20', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  { value: 'cancelled', label: 'ยกเลิก', bg: 'bg-red-500/20', text: 'text-red-400', dot: 'bg-red-400' },
];
const ROOMS_CACHE_KEY = 'appt-rooms-seen'; // localStorage: cumulative room list across month nav (read by AppointmentFormModal)
const SLOT_H = 36; // px per 30-min slot

// Generate time slots 08:30 - 22:30 (30-min)
const TIME_SLOTS = [];
for (let h = 8; h <= 22; h++) {
  for (let m = 0; m < 60; m += 30) {
    if (h === 8 && m === 0) continue;
    TIME_SLOTS.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
  }
}

// AP3: clinic is Thailand (Asia/Bangkok, UTC+7, no DST). `new Date()` + the
// local-getters below would be fine for admins in Thailand but drift for
// anyone using the backend from another TZ (e.g. a developer in UTC picks
// "2026-04-19" and ends up saving 2026-04-18 because their midnight hasn't
// hit Bangkok's yet). Render the date in Bangkok's wall-clock time so the
// calendar always matches what the clinic sees regardless of the viewer's
// machine clock.
function dateStr(d) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(d).reduce((acc, p) => {
      if (p.type !== 'literal') acc[p.type] = p.value;
      return acc;
    }, {});
    if (parts.year && parts.month && parts.day) return `${parts.year}-${parts.month}-${parts.day}`;
  } catch {}
  // Fallback to local if Intl fails for any reason.
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function parseDate(s) { const [y,m,d] = s.split('-').map(Number); return new Date(y,m-1,d); }

export default function AppointmentTab({ clinicSettings, theme, onOpenCustomer }) {
  const isDark = theme !== 'light';

  // ── State ──
  const [selectedDate, setSelectedDate] = useState(() => dateStr(new Date()));
  // Thai time (GMT+7): avoid Jan 1 boundary where UTC-negative browsers see last December.
  const [calMonth, setCalMonth] = useState(() => { const n = bangkokNow(); return { year: n.getUTCFullYear(), month: n.getUTCMonth() }; });
  const [monthAppts, setMonthAppts] = useState({}); // for mini calendar dots
  const [dayAppts, setDayAppts] = useState([]); // appointments for selectedDate
  const [dayLoading, setDayLoading] = useState(false);

  // Form modal trigger only — actual form state lives inside AppointmentFormModal.
  // Shape: null | { mode: 'create' | 'edit', appt?, initialDate?, initialStartTime?, initialEndTime?, initialRoomName? }
  const [formMode, setFormMode] = useState(null);

  const today = dateStr(new Date());
  const monthStr = `${calMonth.year}-${String(calMonth.month+1).padStart(2,'0')}`;

  // Phase 11.8 wiring: load holidays; use pure `isDateHoliday` to decide
  // whether the currently-viewed date falls on a clinic closure. Banner renders
  // above the time grid so admins see it before creating new appointments.
  // The shared modal also runs `isDateHoliday` on save (skipHolidayCheck=false
  // default) so the confirm prompt fires there.
  // Phase 14.7.H follow-up H (2026-04-26): switched from one-shot `listHolidays`
  // to onSnapshot via `listenToHolidays`. Closes the staleness gap where an
  // admin editing a holiday in HolidaysTab from another tab didn't reflect in
  // this banner without a full nav-and-back. Silent-fail on subscribe error
  // (permission denied / network hiccup) = empty list, booking flow untouched.
  const [holidays, setHolidays] = useState([]);
  useEffect(() => {
    const unsub = listenToHolidays(setHolidays, () => setHolidays([]));
    return unsub;
  }, []);

  // Phase 13.2.9 — TodaysDoctorsPanel data: load doctors once + subscribe
  // to merged schedule entries for the selected date (recurring + override).
  // Replaces the legacy "doctors who have appointments today" derivation.
  const [doctors, setDoctors] = useState([]);
  useEffect(() => {
    listDoctors().then(setDoctors).catch(() => setDoctors([]));
  }, []);
  // Phase 15.7 (2026-04-28) — doctor lookup map for assistant-name resolution
  // on legacy appointments that lack the denormalized `assistantNames` field.
  // Helper resolveAssistantNames in src/lib/appointmentDisplay.js falls back
  // to ID lookup when denorm is absent.
  const doctorMap = useMemo(() => buildDoctorMap(doctors), [doctors]);
  const [todaysSchedules, setTodaysSchedules] = useState([]);
  const [todaysSchedulesLoading, setTodaysSchedulesLoading] = useState(false);
  useEffect(() => {
    if (!selectedDate) return;
    setTodaysSchedulesLoading(true);
    const doctorIds = doctors.map((d) => String(d.doctorId || d.id));
    const unsub = listenToScheduleByDay(
      selectedDate,
      (merged) => {
        setTodaysSchedules(merged);
        setTodaysSchedulesLoading(false);
      },
      doctorIds.length > 0 ? doctorIds : undefined,
      () => { setTodaysSchedules([]); setTodaysSchedulesLoading(false); },
    );
    return unsub;
  }, [selectedDate, doctors.length]);
  const currentHoliday = useMemo(
    () => isDateHoliday(selectedDate, holidays),
    [selectedDate, holidays],
  );

  // ── Load month appointment counts (for mini calendar) ──
  useEffect(() => {
    getAppointmentsByMonth(monthStr).then(setMonthAppts).catch(() => setMonthAppts({}));
  }, [monthStr]);

  // ── Load day appointments (for time grid) ──
  // Phase 14.7.H follow-up B (2026-04-26) — switched from one-shot fetch
  // to onSnapshot listener via `listenToAppointmentsByDate`. Closes the
  // multi-admin collision risk: previously two admins viewing the same
  // day couldn't see each other's bookings without nav-and-back. Now any
  // booking from any admin's tab surfaces here within ~1s.
  // The legacy `loadDay` callback is preserved as a no-op shim so existing
  // post-save callbacks (refreshAfterSave) don't need refactoring; the
  // listener already ensures the data is fresh.
  const loadDay = useCallback(async () => {
    return Promise.resolve();
  }, []);

  useEffect(() => {
    if (!selectedDate) return;
    setDayLoading(true);
    const unsubscribe = listenToAppointmentsByDate(
      selectedDate,
      (appts) => {
        setDayAppts(appts);
        setDayLoading(false);
      },
      () => {
        setDayAppts([]);
        setDayLoading(false);
      },
    );
    return () => unsubscribe();
  }, [selectedDate]);

  // ── Derived: rooms, doctors for the day ──
  // Cumulative across month navigation + persistent via localStorage. Bug
  // 2026-04-20: previously REPLACED rooms on every month change → months
  // with 1 booking showed only 1 room column, blocking new bookings into
  // other rooms. Fix: only ADD, never remove, seeded from prior sessions.
  // The shared AppointmentFormModal reads this same localStorage key so the
  // room dropdown there sees every room ever booked.
  const [allKnownRooms, setAllKnownRooms] = useState(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage?.getItem(ROOMS_CACHE_KEY) : null;
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter(r => typeof r === 'string' && r.trim()).slice(0, 50) : [];
    } catch { return []; }
  });
  useEffect(() => {
    setAllKnownRooms(prev => {
      const roomSet = new Set(prev);
      Object.values(monthAppts).forEach(arr => arr.forEach(a => { if (a.roomName) roomSet.add(a.roomName); }));
      dayAppts.forEach(a => { if (a.roomName) roomSet.add(a.roomName); });
      const next = [...roomSet].sort();
      // Early-exit if identical to avoid redundant localStorage writes
      if (next.length === prev.length && next.every((r, i) => r === prev[i])) return prev;
      try { window.localStorage?.setItem(ROOMS_CACHE_KEY, JSON.stringify(next)); } catch { /* quota or no-window: ignore */ }
      return next;
    });
  }, [monthAppts, dayAppts]);

  // Phase 15.7-bis (2026-04-28) — calendar badge/grid mismatch fix.
  // User reports (29/4 + 30/4 + 6/5): mini-calendar bubble counts ALL
  // appointments for the date (e.g. 4 on 29/4) but the grid shows only 1
  // — because the previous apptMap had two silent-drop bugs:
  //   1. `if (a.startTime && a.roomName)` filter dropped appts with no
  //      roomName (legacy/imported data) entirely.
  //   2. Map keyed by `startTime|roomName` overwrote duplicates — last
  //      appt at the same slot+room "wins"; collisions invisible.
  // Fix: array-valued apptMap (multi-render per cell) + virtual
  // "ไม่ระบุห้อง" column for roomless appts. effectiveRoom() resolves the
  // column for both the map key + the occupied check.
  const UNASSIGNED_ROOM = '— ไม่ระบุห้อง —';
  const effectiveRoom = (a) => (a && a.roomName ? String(a.roomName).trim() : UNASSIGNED_ROOM);

  const rooms = useMemo(() => {
    const set = new Set(allKnownRooms);
    if (dayAppts.some(a => !a?.roomName)) set.add(UNASSIGNED_ROOM);
    return [...set];
  }, [allKnownRooms, dayAppts]);

  // Pre-compute appointment lookup map for O(1) access in time grid.
  // Phase 15.7-bis: array-valued so duplicates at same startTime+room
  // BOTH render. Sort within each cell by createdAt asc so first-created
  // appears as the primary (deterministic).
  const apptMap = useMemo(() => {
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
  }, [dayAppts]);

  const dayDoctors = useMemo(() => {
    const map = {};
    dayAppts.forEach(a => {
      if (!a.doctorName) return;
      if (!map[a.doctorName]) map[a.doctorName] = { name: a.doctorName, min: a.startTime, max: a.endTime };
      else {
        if (a.startTime < map[a.doctorName].min) map[a.doctorName].min = a.startTime;
        if (a.endTime > map[a.doctorName].max) map[a.doctorName].max = a.endTime;
      }
    });
    return Object.values(map);
  }, [dayAppts]);

  // ── Week strip (7 days centered on selectedDate) ──
  const weekDays = useMemo(() => {
    const sel = parseDate(selectedDate);
    const dow = sel.getDay(); // 0=Sun
    const monday = new Date(sel);
    monday.setDate(sel.getDate() - (dow === 0 ? 6 : dow - 1));
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      days.push({ date: dateStr(d), dayNum: d.getDate(), monthNum: d.getMonth()+1, dow: d.getDay(), label: THAI_DAYS_SHORT[d.getDay()] });
    }
    return days;
  }, [selectedDate]);

  // ── Mini calendar ──
  const calDays = useMemo(() => {
    const first = new Date(calMonth.year, calMonth.month, 1);
    const last = new Date(calMonth.year, calMonth.month+1, 0);
    let startDow = first.getDay();
    startDow = startDow === 0 ? 6 : startDow - 1;
    const days = [];
    for (let i = 0; i < startDow; i++) days.push(null);
    for (let d = 1; d <= last.getDate(); d++) {
      const ds = `${calMonth.year}-${String(calMonth.month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      days.push({ day: d, dateStr: ds });
    }
    return days;
  }, [calMonth]);

  const navCalMonth = (delta) => {
    setCalMonth(p => {
      let m = p.month + delta, y = p.year;
      if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; }
      return { year: y, month: m };
    });
  };

  const navWeek = (delta) => {
    const d = parseDate(selectedDate);
    d.setDate(d.getDate() + delta * 7);
    setSelectedDate(dateStr(d));
    setCalMonth({ year: d.getFullYear(), month: d.getMonth() });
  };

  // ── Modal triggers ──
  // Holiday confirm runs inside the shared modal on save (skipHolidayCheck
  // defaults false). The above-grid banner already warns the admin before
  // they click into a holiday slot, so a pre-open prompt would just nag.
  const openCreate = (date, time, room) => {
    setFormMode({
      mode: 'create',
      initialDate: date || selectedDate,
      initialStartTime: time || '10:00',
      initialEndTime: time ? (TIME_SLOTS[TIME_SLOTS.indexOf(time) + 1] || time) : '10:30',
      initialRoomName: room || '',
    });
  };

  const openEdit = (appt) => {
    setFormMode({ mode: 'edit', appt });
  };

  // Refresh both month dot map + day grid after a save.
  const refreshAfterSave = useCallback(async () => {
    setFormMode(null);
    await loadDay(selectedDate);
    getAppointmentsByMonth(monthStr).then(setMonthAppts).catch(() => {});
  }, [loadDay, selectedDate, monthStr]);

  // Selected date info
  const selD = parseDate(selectedDate);
  const selDow = selD.getDay();
  const selThaiDate = `วัน${THAI_DAYS_FULL[selDow]}ที่ ${selD.getDate()} ${THAI_MONTHS[selD.getMonth()]} ${selD.getFullYear()+543}`;

  return (
    // Desktop (≥lg): time grid LEFT, calendar+doctor RIGHT (per user 2026-04-19).
    // Mobile (<lg): stack calendar on top (already matches current UX).
    // Source order is preserved; visual flip handled by Tailwind `order-*`.
    <div className="flex flex-col lg:flex-row gap-4 min-h-[600px]">

      {/* ════════════ CALENDAR + DOCTOR — right on desktop, top on mobile ════ */}
      <div className="w-full lg:w-64 flex-shrink-0 space-y-3 order-1 lg:order-2">

        {/* Mini Calendar */}
        <div className="bg-[var(--bg-surface)] rounded-xl p-3 shadow-lg" style={{ border: '1.5px solid rgba(14,165,233,0.2)' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-black text-[var(--tx-heading)] uppercase tracking-wider">{THAI_MONTHS[calMonth.month]} {calMonth.year+543}</span>
            <div className="flex gap-1">
              <button onClick={() => navCalMonth(-1)} className="p-2 rounded hover:bg-[var(--bg-hover)] text-[var(--tx-muted)]" aria-label="เดือนก่อน"><ChevronLeft size={14}/></button>
              <button onClick={() => navCalMonth(1)} className="p-2 rounded hover:bg-[var(--bg-hover)] text-[var(--tx-muted)]" aria-label="เดือนถัดไป"><ChevronRight size={14}/></button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-0">
            {CAL_HEADERS.map((d,i) => <div key={d} className={`text-center text-[11px] font-bold py-1 ${i>=5?'text-red-400':'text-[var(--tx-muted)]'}`}>{d}</div>)}
            {calDays.map((cell,i) => {
              if (!cell) return <div key={`e${i}`} className="h-7" />;
              const isToday = cell.dateStr === today;
              const isSel = cell.dateStr === selectedDate;
              const hasAppt = (monthAppts[cell.dateStr]||[]).length > 0;
              const isWe = (i % 7) >= 5;
              return (
                <button key={cell.dateStr} onClick={() => { setSelectedDate(cell.dateStr); }}
                  className={`h-10 w-10 mx-auto flex flex-col items-center justify-center rounded-full text-xs font-bold transition-all relative
                    ${isSel ? 'bg-sky-600 text-white' : isToday ? 'bg-emerald-600 text-white' : isWe ? 'text-red-400 hover:bg-[var(--bg-hover)]' : 'text-[var(--tx-secondary)] hover:bg-[var(--bg-hover)]'}`}>
                  {cell.day}
                  {hasAppt && !isSel && !isToday && <span className="absolute bottom-0 w-1 h-1 rounded-full bg-sky-400" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Phase 13.2.9 — Today's Doctors Panel (ProClinic /admin/appointment
            parity). Sources from be_staff_schedules merged via
            listenToScheduleByDay → recurring shifts + per-date overrides.
            Shows doctors WORKING today, NOT doctors with bookings today
            (matches ProClinic SSR Blade output verified in Phase 0). */}
        <TodaysDoctorsPanel
          dateISO={selectedDate}
          doctors={doctors}
          todaysSchedules={todaysSchedules}
          loading={todaysSchedulesLoading}
          isDark={isDark}
          onDoctorClick={(doctorId) => {
            // For now, scroll the time grid to the first appointment block
            // for that doctor (or no-op if none). Future: filter UI.
            const first = dayAppts.find((a) => String(a.doctorId) === String(doctorId));
            if (first) {
              const slotEl = document.querySelector(`[data-time-slot="${first.startTime}"]`);
              slotEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }}
        />
      </div>

      {/* ════════════ TIME GRID — left on desktop, bottom on mobile ══════════ */}
      <div className="flex-1 min-w-0 space-y-3 order-2 lg:order-1">

        {/* Week Navigation Strip */}
        <div className="bg-[var(--bg-surface)] rounded-xl overflow-hidden shadow-lg" style={{ border: '1.5px solid rgba(14,165,233,0.15)' }}>
          <div className="flex items-center">
            <button onClick={() => navWeek(-1)} className="px-3 py-3 hover:bg-[var(--bg-hover)] text-[var(--tx-muted)] transition-all border-r border-[var(--bd)]" aria-label="สัปดาห์ก่อน">
              <ChevronLeft size={16} />
            </button>
            <div className="flex-1 grid grid-cols-7">
              {weekDays.map(wd => {
                const isSel = wd.date === selectedDate;
                const isToday = wd.date === today;
                const count = (monthAppts[wd.date]||[]).length;
                const isWe = wd.dow === 0 || wd.dow === 6;
                return (
                  <button key={wd.date} onClick={() => { setSelectedDate(wd.date); setCalMonth({year:parseDate(wd.date).getFullYear(), month:parseDate(wd.date).getMonth()}); }}
                    className={`py-2.5 text-center transition-all relative ${isSel ? 'bg-sky-700 text-white' : isToday ? 'bg-[var(--bg-elevated)]' : 'hover:bg-[var(--bg-hover)]'}`}>
                    <div className={`text-xs font-bold ${isSel ? 'text-sky-200' : isWe ? 'text-red-400' : 'text-[var(--tx-muted)]'}`}>{wd.label}</div>
                    <div className={`text-sm font-bold ${isSel ? 'text-white' : isToday ? 'text-sky-400' : isWe ? 'text-red-400' : 'text-[var(--tx-heading)]'}`}>{wd.dayNum}/{wd.monthNum}</div>
                    {count > 0 && (
                      <span className={`absolute top-1 right-1 text-[8px] font-bold rounded-full w-4 h-4 flex items-center justify-center ${isSel ? 'bg-white text-sky-700' : 'bg-sky-500 text-white'}`}>{count}</span>
                    )}
                  </button>
                );
              })}
            </div>
            <button onClick={() => navWeek(1)} className="px-3 py-3 hover:bg-[var(--bg-hover)] text-[var(--tx-muted)] transition-all border-l border-[var(--bd)]" aria-label="สัปดาห์ถัดไป">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Day Header + Add Button — แพทย์เข้าตรวจ N คน is derived from
            schedule (Phase 13.2.9 ProClinic-fidelity), not appointments. */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-bold text-[var(--tx-heading)]">{selThaiDate}</h3>
            <span className="text-xs font-bold text-sky-400" data-testid="appt-doctors-count-header">
              | แพทย์เข้าตรวจ {todaysSchedules.filter(s => s.type === 'recurring' || s.type === 'work' || s.type === 'halfday').length} คน
            </span>
            {dayLoading && <Loader2 size={14} className="animate-spin text-[var(--tx-muted)]" />}
          </div>
          <button onClick={() => openCreate(selectedDate)}
            className="px-4 py-2.5 rounded-xl text-xs font-black text-white transition-all flex items-center gap-1.5 hover:shadow-xl active:scale-[0.97] uppercase tracking-wider"
            style={{ background: 'linear-gradient(135deg, #047857, #059669)', boxShadow: '0 4px 15px rgba(5,150,105,0.3)' }}>
            <Plus size={14} /> เพิ่มนัดหมาย
          </button>
        </div>

        {/* Phase 11.8 wiring: Holiday banner. Warns admin that the selected
            date is a clinic closure (specific-date or weekly day-of-week).
            Non-blocking — bookings still allowed but flagged. */}
        {currentHoliday && (
          <div data-testid="appt-holiday-banner"
            className="flex items-center gap-2 px-4 py-3 rounded-lg bg-rose-700/15 border border-rose-600/40">
            <CalendarX size={18} className="flex-shrink-0 text-rose-300" />
            <div className="flex-1 text-xs text-rose-200">
              <span className="font-bold">วันหยุดคลินิก — {' '}
                {currentHoliday.type === 'weekly'
                  ? `ทุกวัน${DAY_OF_WEEK_LABELS[Number(currentHoliday.dayOfWeek) || 0]}`
                  : (currentHoliday.note || 'วันหยุดเฉพาะ')}
              </span>
              {currentHoliday.note && currentHoliday.type === 'weekly' && (
                <span className="ml-2 text-rose-300/80">({currentHoliday.note})</span>
              )}
              <span className="ml-2 text-[11px] opacity-75">· ระบบยังเปิดให้จองได้ แต่แนะนำตรวจสอบอีกครั้ง</span>
            </div>
          </div>
        )}

        {/* Resource Time Grid */}
        {rooms.length === 0 && !dayLoading ? (
          <div className="flex flex-col items-center justify-center py-16 bg-[var(--bg-surface)] rounded-xl" style={{ border: '1.5px solid rgba(14,165,233,0.1)' }}>
            <div className="relative mb-6">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, rgba(14,165,233,0.2), rgba(14,165,233,0.05))', border: '1.5px solid rgba(14,165,233,0.3)', boxShadow: '0 0 40px rgba(14,165,233,0.15)' }}>
                <CalendarDays size={28} className="text-sky-400" />
              </div>
              <div className="absolute -inset-4 rounded-3xl opacity-30" style={{ background: 'radial-gradient(circle, rgba(14,165,233,0.15) 0%, transparent 70%)' }} />
            </div>
            <h3 className="text-lg font-black text-[var(--tx-heading)] mb-2 tracking-tight">ไม่มีนัดหมายวันนี้</h3>
            <p className="text-sm text-[var(--tx-muted)] max-w-md mx-auto text-center leading-relaxed mb-4">
              เลือกวันจากปฏิทินด้านซ้าย หรือกดปุ่ม "เพิ่มนัดหมาย" เพื่อสร้างนัดหมายใหม่
            </p>
          </div>
        ) : (
        <div className="bg-[var(--bg-surface)] rounded-xl overflow-hidden shadow-lg" style={{ border: '1.5px solid rgba(14,165,233,0.1)' }}>
          <div className="overflow-x-auto">
            {/* Phase 15.7-quinquies (2026-04-28) — column width scales with
                roomCount so the virtual "ไม่ระบุห้อง" column doesn't fall
                off the right edge on common viewports. ≤4 rooms get
                generous 160px each; 5-6 rooms get 130px (Thai column
                headers still fit); 7+ rooms get 110px (tighter but
                everything visible). minWidth uses the same per-col size
                so horizontal scroll is the LAST resort, not the default. */}
            {(() => {
              const _colWidth = rooms.length >= 7 ? 110 : rooms.length >= 5 ? 130 : 160;
              const _colMinClass = rooms.length >= 7 ? 'min-w-[110px]' : rooms.length >= 5 ? 'min-w-[130px]' : 'min-w-[160px]';
              return (
            <div style={{ minWidth: rooms.length * _colWidth + 60 }}>
              {/* Room header row */}
              <div className="flex border-b border-[var(--bd)] sticky top-0 z-10 bg-[var(--bg-elevated)]">
                <div className="w-[60px] flex-shrink-0 py-2 px-1 text-center text-[11px] font-bold text-[var(--tx-muted)]">เวลา</div>
                {rooms.map(room => (
                  <div key={room} className={`flex-1 ${_colMinClass} py-2 px-2 text-center text-xs font-bold text-sky-400 border-l border-[var(--bd)] truncate`} title={room}>
                    {room}
                  </div>
                ))}
              </div>

              {/* Time rows */}
              <div className="relative">
                {TIME_SLOTS.map((time) => (
                  <div key={time} className="flex border-b border-[var(--bd)]/30" style={{ height: SLOT_H }}>
                    <div className="w-[60px] flex-shrink-0 text-xs text-[var(--tx-muted)] text-right pr-2 pt-0.5 font-mono">{time}</div>
                    {rooms.map(room => {
                      // Phase 15.7-bis — O(1) lookup, array-valued so duplicates render.
                      const apptList = apptMap[`${time}|${room}`];
                      if (apptList && apptList.length > 0) {
                        const appt = apptList[0]; // primary (oldest createdAt)
                        const dupCount = apptList.length - 1;
                        const startIdx = TIME_SLOTS.indexOf(appt.startTime);
                        const endIdx = appt.endTime ? TIME_SLOTS.indexOf(appt.endTime) : startIdx + 1;
                        const span = Math.max(1, endIdx - startIdx);
                        const st = STATUSES.find(s => s.value === appt.status) || STATUSES[0];
                        return (
                          <div key={room} className={`flex-1 ${_colMinClass} border-l border-[var(--bd)]/30 px-0.5 relative`} style={{ height: SLOT_H }}>
                            <button onClick={() => openEdit(appt)}
                              className={`absolute left-0.5 right-0.5 top-0.5 rounded-md px-1.5 py-0.5 text-left overflow-hidden transition-all hover:ring-1 hover:ring-sky-400 z-[5] ${st.bg} border border-[var(--bd)]/50`}
                              style={{ height: span * SLOT_H - 4 }}>
                              <div className="flex items-center gap-1">
                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${st.dot}`} />
                                <span className="text-xs font-bold text-[var(--tx-heading)] truncate">{appt.customerName || '-'}</span>
                                {/* Phase 15.7-bis — collision indicator: shows when ≥2
                                    appts share this exact startTime+room key. Click on
                                    the badge expands the list (handled by stopPropagation
                                    at this layer; below we render stacked previews for
                                    the dupes). */}
                                {dupCount > 0 && (
                                  <span
                                    className="ml-auto px-1 py-0 rounded text-[9px] font-bold bg-amber-900/50 text-amber-300 border border-amber-700"
                                    title={`มีนัดซ้ำที่เวลานี้ ${apptList.length} ราย — กดเพื่อแก้นัดแรก; รายอื่นด้านล่าง`}
                                    data-testid="appt-collision-badge"
                                  >
                                    +{dupCount}
                                  </span>
                                )}
                              </div>
                              {span > 1 && (() => {
                                const assistantNames = resolveAssistantNames(appt, doctorMap);
                                return (
                                  <>
                                    <p className="text-[8px] text-[var(--tx-muted)] truncate mt-0.5">
                                      {appt.doctorName && `${appt.doctorName}`}{appt.appointmentTo && ` · ${appt.appointmentTo}`}
                                    </p>
                                    {/* Phase 15.7 — assistant names below doctor row.
                                        Hidden if no assistants, or if grid slot is too short
                                        (span >= 2 only — span 1 has barely room for doctor). */}
                                    {assistantNames.length > 0 && span >= 2 && (
                                      <p className="text-[8px] text-[var(--tx-muted)] truncate" data-testid="appt-assistants">
                                        + {assistantNames.join(', ')}
                                      </p>
                                    )}
                                  </>
                                );
                              })()}
                            </button>
                            {/* Phase 15.7-bis — list duplicate appts as small clickable
                                pills directly under the primary, so admin can edit each.
                                Sits inside the same cell so visual rhythm stays. */}
                            {dupCount > 0 && (
                              <div className="absolute left-0.5 right-0.5 z-[6] pointer-events-none" style={{ top: span * SLOT_H + 1 }}>
                                <div className="flex flex-wrap gap-0.5 pointer-events-auto">
                                  {apptList.slice(1).map((dup, di) => {
                                    const dupSt = STATUSES.find(s => s.value === dup.status) || STATUSES[0];
                                    return (
                                      <button
                                        key={dup.appointmentId || dup.id || di}
                                        onClick={(e) => { e.stopPropagation(); openEdit(dup); }}
                                        className={`text-[9px] px-1 py-0.5 rounded border ${dupSt.bg} border-[var(--bd)]/50 truncate max-w-[120px]`}
                                        title={`ซ้ำ #${di + 2}: ${dup.customerName || '-'}`}
                                        data-testid="appt-collision-dupe"
                                      >
                                        ↪ {dup.customerName || '-'}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      }
                      // Check if this slot is occupied by a multi-slot appointment (skip rendering).
                      // Phase 15.7-bis — use effectiveRoom() so the virtual ไม่ระบุห้อง
                      // column also recognises its own multi-slot appointments.
                      const occupied = dayAppts.some(a => {
                        if (effectiveRoom(a) !== room || !a.startTime || !a.endTime) return false;
                        return time > a.startTime && time < a.endTime;
                      });
                      return (
                        <div key={room}
                          onClick={() => !occupied && openCreate(selectedDate, time, room === UNASSIGNED_ROOM ? '' : room)}
                          className={`flex-1 ${_colMinClass} border-l border-[var(--bd)]/30 ${occupied ? '' : 'cursor-pointer hover:bg-sky-900/5'}`}
                          style={{ height: SLOT_H }} />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
              );
            })()}
          </div>
        </div>
        )}
      </div>

      {/* ════════════ FORM MODAL — shared component (Phase 14.7.B) ════════════ */}
      {formMode && (
        <AppointmentFormModal
          mode={formMode.mode}
          appt={formMode.appt}
          theme={theme}
          initialDate={formMode.initialDate}
          initialStartTime={formMode.initialStartTime}
          initialEndTime={formMode.initialEndTime}
          initialRoomName={formMode.initialRoomName}
          existingAppointments={dayAppts}
          skipStaffScheduleCheck={false}
          onClose={() => setFormMode(null)}
          onSaved={refreshAfterSave}
          // Phase 15.7-sexies (2026-04-28) — delete + open-customer wiring.
          // Delete only available in edit mode (modal hides the button when
          // onDelete absent). The actual delete + close happen here so
          // AppointmentTab owns the side-effect; the day-grid auto-refreshes
          // via listenToAppointmentsByDate listener (no manual reload needed).
          onDelete={formMode.mode === 'edit' && formMode.appt ? async () => {
            const id = formMode.appt.appointmentId || formMode.appt.id;
            if (!id) return;
            await deleteBackendAppointment(id);
            setFormMode(null);
            // listener auto-refreshes the day grid + the mini-calendar bubble
          } : undefined}
          // Open the customer's detail page from the modal. Caller (BackendDashboard)
          // injects this; if not provided (legacy embed), the customer name
          // renders as static text per AppointmentFormModal's onOpenCustomer
          // prop guard.
          onOpenCustomer={onOpenCustomer ? (customerId) => {
            setFormMode(null); // close modal so customer page is visible
            onOpenCustomer(customerId);
          } : undefined}
        />
      )}
    </div>
  );
}
