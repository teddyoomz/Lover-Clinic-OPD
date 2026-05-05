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
// audit-branch-scope: listener-direct — listenToAppointmentsByDate +
// listenToScheduleByDay use positional args incompatible with the
// useBranchAwareListener (object-arg) contract; kept as direct
// useEffect with branchId in deps. listenToHolidays migrated to hook
// below (Phase BSA Task 8, 2026-05-04).
import {
  getAppointmentsByMonth, getAppointmentsByDate, listenToAppointmentsByDate, listenToHolidays,
  listenToScheduleByDay, listDoctors,
  // Phase 15.7-sexies (2026-04-28) — delete from calendar modal
  deleteBackendAppointment,
  // Phase 18.0 (2026-05-05) — branch-scoped exam-room master
  listExamRooms,
} from '../../lib/scopedDataLayer.js';
import { useBranchAwareListener } from '../../hooks/useBranchAwareListener.js';
import { bangkokNow } from '../../utils.js';
import { isDateHoliday, DAY_OF_WEEK_LABELS } from '../../lib/holidayValidation.js';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
import { filterDoctorsByBranch } from '../../lib/branchScopeUtils.js';
import AppointmentFormModal from './AppointmentFormModal.jsx';
import TodaysDoctorsPanel from './scheduling/TodaysDoctorsPanel.jsx';
// Phase 15.7 (2026-04-28) — shared assistant-name resolver. Used for
// rendering "+ ผู้ช่วย: A, B, C" below the doctor name. Helper falls back
// to doctorMap lookup for legacy appts that lack assistantNames denorm.
import { resolveAssistantNames, buildDoctorMap } from '../../lib/appointmentDisplay.js';
import { TIME_SLOTS } from '../../lib/staffScheduleValidation.js';


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
// Phase 19.0 (2026-05-06) — SLOT_H halved to 18 (was 36 per 30-min); 15-min
// canonical TIME_SLOTS imported from staffScheduleValidation. Total grid
// pixel-height preserved (28 rows × 36 = 1008; 56 rows × 18 = 1008).
const SLOT_H = 18; // px per 15-min slot

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

// RP1 lift (2026-04-30) — appointment-slot meta-row was wrapped in a
// JSX-IIFE inside a .map() (per-row resolveAssistantNames). Extracted to
// a named sub-component so the JSX stays IIFE-free (Vite-OXC ban).
function AppointmentSlotMeta({ appt, span, doctorMap }) {
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
}

export default function AppointmentTab({ clinicSettings, theme }) {
  const isDark = theme !== 'light';

  // Phase BS — branch-scoped appointment fetches.
  const { branchId: selectedBranchId } = useSelectedBranch();

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
  // Phase BSA Task 8 — useBranchAwareListener auto-injects branchId +
  // re-subscribes on branch switch. Pass {allBranches: true} to keep the
  // banner calendar cross-branch (legacy behavior — useFilter is gated by
  // !allBranches in listenToHolidays).
  useBranchAwareListener(
    listenToHolidays,
    { allBranches: true },
    setHolidays,
    () => setHolidays([]),
  );

  // Phase 13.2.9 — TodaysDoctorsPanel data: load doctors once + subscribe
  // to merged schedule entries for the selected date (recurring + override).
  // Replaces the legacy "doctors who have appointments today" derivation.
  const [doctors, setDoctors] = useState([]);
  useEffect(() => {
    // Phase BSA leak-fix (2026-05-04): apply branch soft-gate so calendar
    // only shows doctors with access to current branch. Re-runs on switch.
    listDoctors()
      .then((d) => setDoctors(filterDoctorsByBranch(d || [], selectedBranchId)))
      .catch(() => setDoctors([]));
  }, [selectedBranchId]);
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
    // Phase 17.2-ter (2026-05-05) — pass selectedBranchId as 5th arg so
    // listenToScheduleByDay applies a branchId where-clause to its
    // onSnapshot subscription. Branch switch is in the deps array → effect
    // re-runs → new listener subscribed against new branch. Pre-fix the
    // listener subscribed unfiltered → TodaysDoctorsPanel showed phantom
    // doctors from other branches.
    const unsub = listenToScheduleByDay(
      selectedDate,
      (merged) => {
        setTodaysSchedules(merged);
        setTodaysSchedulesLoading(false);
      },
      doctorIds.length > 0 ? doctorIds : undefined,
      () => { setTodaysSchedules([]); setTodaysSchedulesLoading(false); },
      selectedBranchId,
    );
    return unsub;
  }, [selectedDate, doctors.length, selectedBranchId]);
  const currentHoliday = useMemo(
    () => isDateHoliday(selectedDate, holidays),
    [selectedDate, holidays],
  );

  // ── Load month appointment counts (for mini calendar) ──
  // Phase BS — pass selectedBranchId so the dot map only counts appointments
  // for the current branch. Re-runs when admin switches branch.
  useEffect(() => {
    getAppointmentsByMonth(monthStr, { branchId: selectedBranchId })
      .then(setMonthAppts)
      .catch(() => setMonthAppts({}));
  }, [monthStr, selectedBranchId]);

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
    // Phase BS regression-fix (2026-05-06) — pass branchId so the day-grid
    // listener only emits appointments for the selected branch. Without
    // this, switching branch via the top-right BranchSelector left the
    // day grid showing the previous branch's appointments (user report:
    // "tab=appointments ทำไมกดเปลี่ยนสาขาด้านบนขวามือเป็นพระราม 3 แล้ว
    // นัดแม่งเหมือนเดิม"). selectedBranchId added to deps so the effect
    // re-subscribes on switch.
    const unsubscribe = listenToAppointmentsByDate(
      selectedDate,
      { branchId: selectedBranchId },
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
  }, [selectedDate, selectedBranchId]);

  // Phase 18.0 (2026-05-05) — load branch-scoped exam-room master.
  // Each branch's exam rooms are the SOURCE OF TRUTH for grid columns.
  // Legacy localStorage `appt-rooms-seen` cache is dropped — orphan
  // legacy appts (with non-master roomName) route to ไม่ระบุห้อง column
  // via the runtime fallback below.
  const [branchExamRooms, setBranchExamRooms] = useState([]);
  useEffect(() => {
    if (!selectedBranchId) { setBranchExamRooms([]); return; }
    listExamRooms({ branchId: selectedBranchId, status: 'ใช้งาน' })
      .then(rs => setBranchExamRooms(rs || []))
      .catch(() => setBranchExamRooms([]));
    // One-time legacy cache cleanup — drop the per-device cumulative
    // room-name list now that be_exam_rooms is the canonical source.
    try { window.localStorage?.removeItem(ROOMS_CACHE_KEY); } catch { /* ignore */ }
  }, [selectedBranchId]);

  // Phase 15.7-bis (2026-04-28) — array-valued apptMap so duplicate
  // appts at same startTime+room render together (calendar badge/grid
  // mismatch fix). Phase 18.0 (2026-05-05) — effectiveRoom now resolves
  // strictly against the BRANCH MASTER. Appts with no roomName OR with
  // a roomName not present in the current branch's exam-room master
  // route to UNASSIGNED_ROOM. Result: legacy strings ("Dr.Chaiyaporn",
  // "ห้อง 1", "นักกายภาพA x" etc.) no longer pollute the column header.
  const UNASSIGNED_ROOM = '— ไม่ระบุห้อง —';
  const masterRoomNameSet = useMemo(
    () => new Set(branchExamRooms.map(r => String(r.name || '').trim()).filter(Boolean)),
    [branchExamRooms],
  );
  const effectiveRoom = (a) => {
    const nm = a && a.roomName ? String(a.roomName).trim() : '';
    if (!nm) return UNASSIGNED_ROOM;
    return masterRoomNameSet.has(nm) ? nm : UNASSIGNED_ROOM;
  };

  const rooms = useMemo(() => {
    // Phase 18.0 — column set = master rooms ONLY (sorted by sortOrder
    // then name) + virtual ไม่ระบุห้อง when (a) at least one appt resolves
    // to UNASSIGNED OR (b) the branch has zero master rooms (give the
    // user at least one clickable column so they can create a roomless
    // appt on an empty branch — user directive 2026-05-05: "ต้องการให้
    // user คลิ๊กลงไปในตารางแล้วสร้างนัดจากตารางเปล่าๆได้").
    // Legacy roomName strings dropped entirely.
    const ordered = branchExamRooms
      .slice()
      .sort((a, b) =>
        (a.sortOrder || 0) - (b.sortOrder || 0) ||
        String(a.name || '').localeCompare(String(b.name || ''), 'th')
      )
      .map(r => String(r.name || '').trim())
      .filter(Boolean);
    const set = new Set(ordered);
    const hasOrphan = dayAppts.some(a => effectiveRoom(a) === UNASSIGNED_ROOM);
    if (hasOrphan || ordered.length === 0) set.add(UNASSIGNED_ROOM);
    return [...set];
  }, [branchExamRooms, masterRoomNameSet, dayAppts]);

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
      initialEndTime: time ? (TIME_SLOTS[TIME_SLOTS.indexOf(time) + 1] || time) : '10:15',
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
    getAppointmentsByMonth(monthStr, { branchId: selectedBranchId })
      .then(setMonthAppts)
      .catch(() => {});
  }, [loadDay, selectedDate, monthStr, selectedBranchId]);

  // Selected date info
  const selD = parseDate(selectedDate);
  const selDow = selD.getDay();
  const selThaiDate = `วัน${THAI_DAYS_FULL[selDow]}ที่ ${selD.getDate()} ${THAI_MONTHS[selD.getMonth()]} ${selD.getFullYear()+543}`;

  // RP1 lift (2026-04-30) — column-sizing constants previously wrapped in
  // a JSX-IIFE; hoisted here so the resource-grid block uses plain
  // identifiers (Vite-OXC ban on inline JSX-IIFE inside JSX expressions).
  const _colWidth = rooms.length >= 7 ? 110 : rooms.length >= 5 ? 130 : 160;
  const _colMinClass = rooms.length >= 7 ? 'min-w-[110px]' : rooms.length >= 5 ? 'min-w-[130px]' : 'min-w-[160px]';

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

        {/* Resource Time Grid — always render so user can click empty
            cells to create new appointments (user directive 2026-05-05:
            "ต้องการให้ user คลิ๊กลงไปในตารางแล้วสร้างนัดจากตารางเปล่าๆ
            ได้"). The "ไม่มีนัดหมายวันนี้" empty-state was removed; the
            virtual ไม่ระบุห้อง column ensures at least one clickable
            column even when the branch has no exam rooms. */}
        {(
        <div className="bg-[var(--bg-surface)] rounded-xl overflow-hidden shadow-lg" style={{ border: '1.5px solid rgba(14,165,233,0.1)' }}>
          <div className="overflow-x-auto">
            {/* Phase 15.7-quinquies (2026-04-28) — column width scales with
                roomCount so the virtual "ไม่ระบุห้อง" column doesn't fall
                off the right edge on common viewports. ≤4 rooms get
                generous 160px each; 5-6 rooms get 130px (Thai column
                headers still fit); 7+ rooms get 110px (tighter but
                everything visible). minWidth uses the same per-col size
                so horizontal scroll is the LAST resort, not the default. */}
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
                            {/* Phase 15.7-septies (2026-04-29) — switched
                                outer <button> to <div role="button"> so we
                                can NEST a real <a target="_blank"> on the
                                customer name without violating HTML5
                                button-inside-button rules. The full cell
                                area still opens the edit modal on click;
                                the inner <a> stops propagation so name
                                click opens new tab without ALSO firing
                                edit. Keyboard: tabIndex=0 + Enter/Space → edit. */}
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={() => openEdit(appt)}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEdit(appt); } }}
                              className={`absolute left-0.5 right-0.5 top-0.5 rounded-md px-1.5 py-0.5 text-left overflow-hidden transition-all hover:ring-1 hover:ring-sky-400 z-[5] ${st.bg} border border-[var(--bd)]/50 cursor-pointer`}
                              style={{ height: span * SLOT_H - 4 }}>
                              <div className="flex items-center gap-1">
                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${st.dot}`} />
                                {/* Customer name = clickable link to customer detail
                                    in a NEW BROWSER TAB. e.stopPropagation prevents the
                                    parent cell's onClick (edit modal) from firing. */}
                                {appt.customerId ? (
                                  <a
                                    href={`/?backend=1&customer=${encodeURIComponent(String(appt.customerId))}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => { e.stopPropagation(); }}
                                    className="text-xs font-bold text-[var(--tx-heading)] truncate hover:underline underline-offset-2 hover:text-sky-300"
                                    title={`เปิดข้อมูล ${appt.customerName || ''} ในแท็บใหม่`}
                                    data-testid="appt-grid-customer-link"
                                  >
                                    {appt.customerName || '-'}
                                  </a>
                                ) : (
                                  <span className="text-xs font-bold text-[var(--tx-heading)] truncate">{appt.customerName || '-'}</span>
                                )}
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
                              {span > 1 && (
                                <AppointmentSlotMeta appt={appt} span={span} doctorMap={doctorMap} />
                              )}
                            </div>
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
          // Phase 15.7-septies (2026-04-29) — modal customer-name opens
          // a NEW BROWSER TAB (handled inside the modal via <a target="_blank">).
          // We just enable the link here. The Phase 15.7-sexies in-page
          // redirect callback (onOpenCustomer) is removed per user directive.
          enableCustomerLink={true}
        />
      )}
    </div>
  );
}
