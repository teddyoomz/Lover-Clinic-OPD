// ─── AppointmentCalendarView — Resource Time Grid (replicate ProClinic layout) ────
// 3-panel: Left sidebar (mini calendar + doctor list) | Main (week nav + time grid with room columns)
//
// Phase 14.7.C (2026-04-25): inline form replaced with shared
// `AppointmentFormModal` (extracted in 14.7.B). Calendar grid + holiday
// banner + week nav stay here; the entire form (validation, holiday confirm,
// collision check, staff-schedule check, payload write) lives in the shared
// component. Both writers — AppointmentCalendarView + CustomerDetailView — now flow
// through one save path.
//
// Phase 21.0 (2026-05-06) — RENAMED from AppointmentTab.jsx + parameterized
// with `appointmentType` prop so the same component renders 4 sub-tabs in
// the new นัดหมาย NAV section. Filters dayAppts + monthAppts by exact-match
// `appointmentType` (defense-in-depth: stale/missing types coerce to
// 'no-deposit-booking' via migrateLegacyAppointmentType so they appear in
// the จองไม่มัดจำ sub-tab rather than orphaning). selectedBranchId from
// useSelectedBranch context applies BSA per-branch filter (re-subscribes
// listeners on branch switch). Locks appointmentType on AppointmentFormModal
// when admin creates a new appt from this view (lockedAppointmentType prop).

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
import { useIsBelowLg } from '../../hooks/useIsBelowLg.js';
import { bangkokNow } from '../../utils.js';
import { isDateHoliday, DAY_OF_WEEK_LABELS } from '../../lib/holidayValidation.js';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
import { filterDoctorsByBranch } from '../../lib/branchScopeUtils.js';
import AppointmentFormModal from './AppointmentFormModal.jsx';
import DepositAwareCancelDialog from '../admin/DepositAwareCancelDialog.jsx';
import AppointmentDetailPopover from './AppointmentDetailPopover.jsx';
import AppointmentAgendaView from './AppointmentAgendaView.jsx';
import TodaysDoctorsPanel from './scheduling/TodaysDoctorsPanel.jsx';
// Task 9 (LINE OA Appointment Reminder, 2026-05-15) — shared customer
// name + per-branch LINE badge (LR-4 lock). Used in the appt grid cell
// so admin can see at-a-glance which appts are tied to LINE-linked
// customers (for reminder dispatch readiness).
import { CustomerOption } from '../CustomerOption.jsx';
import PhoneLink from '../PhoneLink.jsx';
// V68 (2026-05-15) — LINE Badge Surfacing. Surfaces a 🟢 LINE chip on
// every appt cell whose notifyChannel includes 'line' (or legacy
// lineNotify=true). Component returns null when the appt has no LINE
// channel, so the wrapper-div gate below only manages visual density
// (span >= 2 to avoid crowding the smallest cells).
import { AppointmentLineBadge } from '../AppointmentLineBadge.jsx';
// Task 10 (LINE OA Appointment Reminder, 2026-05-15) — LR-4 lock part 2.
// AppointmentCalendarView is the grid VIEW; all appointment-create / edit
// flows are delegated to AppointmentFormModal (rendered at the bottom of
// this file when formMode is set). Importing LineNotifyConfirmation here
// documents the LR-4 invariant — every appt-creating surface routes the
// notifyChannel state through this component. The actual render + auto-
// tick effect live inside AppointmentFormModal so the modal's
// notifyChannel state is the single source of truth for this surface.
// (Source-grep AV45 / LR-4 invariant — import-presence + delegation
// comment is the canonical pattern for grid+modal pairs.)
// eslint-disable-next-line no-unused-vars
import { LineNotifyConfirmation } from '../LineNotifyConfirmation.jsx';
// Phase 21.0 (2026-05-06) — SSOT for type filtering + presentation labels.
// migrateLegacyAppointmentType coerces stale/missing types to the safe
// default ('no-deposit-booking') so unknown values appear in the จองไม่มัดจำ
// sub-tab rather than orphaning across all 4 views.
import {
  APPOINTMENT_TYPE_VALUES,
  DEFAULT_APPOINTMENT_TYPE,
  migrateLegacyAppointmentType,
  resolveAppointmentTypeLabel,
} from '../../lib/appointmentTypes.js';
// Phase 15.7 (2026-04-28) — shared assistant-name resolver. Used for
// rendering "+ ผู้ช่วย: A, B, C" below the doctor name. Helper falls back
// to doctorMap lookup for legacy appts that lack assistantNames denorm.
import { resolveAssistantNames, buildDoctorMap, APPT_STATUSES } from '../../lib/appointmentDisplay.js';
import { TIME_SLOTS } from '../../lib/staffScheduleValidation.js';
// V53 (2026-05-08, BS-12) — per-branch openHours filter the visible time grid
// + flag legacy out-of-hours appts. Helper is pure JS; reads V51 merged
// settings via useEffectiveClinicSettings (branch-reactive on top-right
// BranchSelector switch).
import {
  getVisibleTimeSlotsForDate,
  getOpenHoursForDate,
  isTimeOutsideOpenHours,
} from '../../lib/scheduleFilterUtils.js';
import { useEffectiveClinicSettings } from '../../lib/BranchContext.jsx';


const THAI_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const THAI_DAYS_SHORT = ['อา','จ','อ','พ','พฤ','ศ','ส'];
const THAI_DAYS_FULL = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
const CAL_HEADERS = ['จ','อ','พ','พฤ','ศ','ส','อา'];
// Phase 21.0-quinquies (2026-05-06 EOD) — added `accent` (CSS color) for
// each status so the appointment block can wear a 4px left-border in
// status color. Makes the block "pop" visually + lets admin parse status
// at a glance (orange = pending, sky = confirmed, emerald = done,
// red = cancelled).
// Calendar-density (2026-05-20) — STATUSES moved to src/lib/appointmentDisplay.js
// as APPT_STATUSES (single source, Rule of 3: shared with popover + agenda).
const STATUSES = APPT_STATUSES;
const ROOMS_CACHE_KEY = 'appt-rooms-seen'; // localStorage: cumulative room list across month nav (read by AppointmentFormModal)
// Phase 19.0 (2026-05-06) — SLOT_H halved to 18 (was 36 per 30-min); 15-min
// canonical TIME_SLOTS imported from staffScheduleValidation.
// Phase 21.0-quinquies (2026-05-06 EOD) — bumped to 22 for breathing room
// (user feedback: "ตารางเราแม่งโคตรจะไม่สวยดูยาก ลายตา"). Each appointment
// block now has more vertical room for the customer name + purpose chip
// + doctor/assistant rows. Total grid pixel-height = 56 rows × 22 = 1232px.
const SLOT_H = 22; // px per 15-min slot

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
//
// Phase 21.0-quinquies (2026-05-06 EOD) — UI polish per user "ทำให้สวย ให้
// เห็นชื่อ และเหตุผลที่นัดมา ชัดๆ":
//   - Purpose chip prominent (emerald accent — matches Finance.มัดจำ
//     visual link, sets expectation that the field cross-cuts surfaces)
//   - Doctor row uses 👨‍⚕️ icon prefix
//   - Assistant row uses + prefix, slightly bigger font
//   - Visibility tiers: span >= 2 shows purpose; span >= 3 shows doctor;
//     span >= 4 shows assistants. Short blocks (span 1) stay name-only.
function AppointmentSlotMeta({ appt, span, doctorMap }) {
  const assistantNames = resolveAssistantNames(appt, doctorMap);
  return (
    <>
      {/* Purpose row — Phase 21.0-septies (2026-05-06 EOD continuation):
          per user "ออกแบบให้นัดมาเพื่อชัดกว่านี้ ใหญ่พอๆกะชื่อเลยก็ได้",
          purpose is now SAME font size as customer name (text-sm font-bold)
          + emerald accent + 🎯 icon at the front. Color differentiates it
          from the name (which is heading-color); size makes it equally
          prominent so admin reading the grid sees BOTH "who" and "for what"
          at a glance. */}
      {appt.appointmentTo && span >= 2 && (
        <p
          className="mt-0.5 text-sm font-bold text-emerald-300 leading-tight truncate"
          title={appt.appointmentTo}
          data-testid="appt-purpose"
        >
          🎯 {appt.appointmentTo}
        </p>
      )}
      {/* Doctor row — secondary metadata, smaller font, only when there's
          enough vertical room. */}
      {span >= 3 && (
        <p className="text-[11px] text-[var(--tx-muted)] truncate mt-0.5" data-testid="appt-doctor-row">
          👨‍⚕️ {appt.doctorName || 'ไม่ระบุแพทย์'}
        </p>
      )}
      {/* Assistant row — Phase 15.7 — needs even more vertical room. */}
      {assistantNames.length > 0 && span >= 4 && (
        <p className="text-[11px] text-[var(--tx-muted)] truncate" data-testid="appt-assistants">
          + {assistantNames.join(', ')}
        </p>
      )}
      {/* V68 (2026-05-15) — LINE badge if appt has notifyChannel=['line'].
          AppointmentLineBadge returns null if appt has no LINE channel,
          so this conditional only manages the wrapper div + visibility gate. */}
      {span >= 2 && (
        <div className="mt-1 flex justify-end">
          <AppointmentLineBadge appt={appt} size="xs" />
        </div>
      )}
    </>
  );
}

/**
 * @param {Object} props
 * @param {string} [props.appointmentType] — one of APPOINTMENT_TYPE_VALUES
 *   ('no-deposit-booking' | 'deposit-booking' | 'treatment-in' | 'follow-up').
 *   When provided, the calendar grid + mini-calendar dot map filter dayAppts
 *   to ONLY this type (defense-in-depth: stale/missing types coerce to
 *   'no-deposit-booking'). When omitted, all types render (legacy behavior).
 * @param {Object} [props.clinicSettings]
 * @param {string} [props.theme]
 */
export default function AppointmentCalendarView({
  appointmentType,
  clinicSettings,
  theme,
  // Phase 24.0-vicies-octies (2026-05-06) — when set, the calendar opens
  // on this date instead of today. Used by Finance.มัดจำ "ไปที่นัด" button
  // (BackendDashboard deep-link reads ?date=YYYY-MM-DD and passes here).
  initialSelectedDate,
}) {
  const isDark = theme !== 'light';

  // Phase 21.0 (2026-05-06) — defense-in-depth: validate the prop. Unknown
  // values fall through to "show all" behavior. Production callers always
  // pass a canonical value (one of 4); this branch is a safety net.
  const typeFilter = APPOINTMENT_TYPE_VALUES.includes(appointmentType)
    ? appointmentType
    : null;
  const typeLabel = typeFilter ? resolveAppointmentTypeLabel(typeFilter) : '';

  // Phase BS — branch-scoped appointment fetches.
  const { branchId: selectedBranchId } = useSelectedBranch();

  // V53 (BS-12) — branch-reactive merged clinic settings (V51). When admin
  // switches the top-right BranchSelector, useEffectiveClinicSettings re-emits
  // the new branch's openHoursMonFri/SatSun, which feeds the visible useMemo
  // below. selectedDate change also re-runs (Mon→Sat bucket switch).
  const cs = useEffectiveClinicSettings(clinicSettings);

  // ── State ──
  // Phase 24.0-vicies-octies — initialSelectedDate (if set + valid YYYY-MM-DD)
  // overrides today. Falls back to today on null/invalid input.
  const [selectedDate, setSelectedDate] = useState(() => {
    const candidate = String(initialSelectedDate || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return candidate;
    return dateStr(new Date());
  });
  // Thai time (GMT+7): avoid Jan 1 boundary where UTC-negative browsers see last December.
  // Phase 24.0-vicies-octies — when initialSelectedDate provided, anchor
  // calMonth to that date's month so the mini calendar opens on the right page.
  const [calMonth, setCalMonth] = useState(() => {
    const candidate = String(initialSelectedDate || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
      const [y, m] = candidate.split('-');
      return { year: parseInt(y, 10), month: parseInt(m, 10) - 1 };
    }
    const n = bangkokNow();
    return { year: n.getUTCFullYear(), month: n.getUTCMonth() };
  });
  // Issue-1 fix (2026-05-26) — defense-in-depth: initialSelectedDate can arrive
  // AFTER mount (BackendDashboard's deep-link useEffect). The selectedDate/
  // calMonth initializers above run once → if the prop was empty at mount they
  // locked to today and won't re-derive. Sync when the prop becomes a valid
  // YYYY-MM-DD. Deps=[initialSelectedDate] → fires only on prop change, so it
  // never fights the admin's own day navigation (clicks change selectedDate but
  // not the prop). Primary fix is the synchronous URL-derive in BackendDashboard
  // (prop already correct at first mount); this catches any late arrival.
  useEffect(() => {
    const candidate = String(initialSelectedDate || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return;
    setSelectedDate(candidate);
    const [y, m] = candidate.split('-');
    setCalMonth({ year: parseInt(y, 10), month: parseInt(m, 10) - 1 });
  }, [initialSelectedDate]);
  const [monthAppts, setMonthAppts] = useState({}); // for mini calendar dots
  const [dayAppts, setDayAppts] = useState([]); // appointments for selectedDate
  const [dayLoading, setDayLoading] = useState(false);

  // Form modal trigger only — actual form state lives inside AppointmentFormModal.
  // Shape: null | { mode: 'create' | 'edit', appt?, initialDate?, initialStartTime?, initialEndTime?, initialRoomName? }
  // Task 10 LR-4 (2026-05-15): notifyChannel state for the appointment-create
  // form is owned by AppointmentFormModal (delegate). This view does NOT
  // build its own appointment payload — every create/edit routes through
  // the modal, which auto-ticks LINE in notifyChannel based on per-branch
  // customer linkage. AV45 LR-4 invariant satisfied via delegation.
  const [formMode, setFormMode] = useState(null);
  // (2026-05-26) deposit-aware delete — { appt, depositId, apptId } when a
  // deposit-linked appt is being deleted; null otherwise.
  const [deleteDialog, setDeleteDialog] = useState(null);
  // Calendar-density (2026-05-20) — tapping a block/agenda card opens a
  // read-only detail popover first; แก้ไข inside it routes to the edit modal.
  const [detailAppt, setDetailAppt] = useState(null);
  const openDetail = useCallback((appt) => setDetailAppt(appt), []);
  // Calendar-density (2026-05-20) — below `lg` (mobile/tablet) default to the
  // chronological agenda (the 2D room×time grid forces 2-axis scroll on a
  // phone); ≥lg default to the grid. viewModeOverride (null | 'grid' |
  // 'agenda') lets admin pin a view; null = follow viewport.
  const belowLg = useIsBelowLg();
  const [viewModeOverride, setViewModeOverride] = useState(null);
  const effectiveView = viewModeOverride || (belowLg ? 'agenda' : 'grid');

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
    // V41 (2026-05-08) — opt-in for past appointment name resolution via
    // doctorMap; doctors state includes hidden so doctorMap resolves legacy
    // records. AV20: schedule subscription (doctorIds) filters hidden below.
    listDoctors({ includeHidden: true })
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
    // V41 (2026-05-08) — exclude hidden doctors from schedule subscription. AV20.
    const doctorIds = doctors.filter(d => !d.isHidden).map((d) => String(d.doctorId || d.id));
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
  //
  // Phase 24.0-sexiesdecies (2026-05-06) — branch-switch state-staleness fix.
  // User report: "พอกดเปลี่ยนสาขาใน branch selector แล้วตารางมันมากองกัน"
  // (after switching branch, all appointments pile into ไม่ระบุห้อง).
  //
  // Root cause: race between two effects both depending on selectedBranchId:
  //   (a) listenToAppointmentsByDate (fast — onSnapshot) emits NEW branch's
  //       appts almost instantly with their NEW-branch roomIds
  //   (b) listExamRooms (slower — getDocs Promise) takes 100-500ms to update
  //       branchExamRooms with the new branch's rooms
  // During the window in between, NEW appts try to match OLD branchExamRooms
  // → effectiveRoom() returns UNASSIGNED → everything piles into the right-
  // most column. Legacy "refresh fixes it" because remount re-initializes
  // both states to [] and races finish in their natural order.
  //
  // Fix: tag branchExamRooms with the branchId it was loaded for + clear it
  // immediately on switch + gate the resolver on freshness. masterRoomById /
  // masterRoomNameSet only resolve appts when the rooms doc is fresh for the
  // CURRENT selectedBranchId. While stale, the resolver returns
  // UNASSIGNED-pending — but the grid render itself short-circuits via
  // roomsReadyForBranch === false, showing a skeleton instead.
  const [branchExamRooms, setBranchExamRooms] = useState([]);
  const [roomsBranchTag, setRoomsBranchTag] = useState(null);
  const roomsReadyForBranch = roomsBranchTag === selectedBranchId;
  useEffect(() => {
    // Clear immediately so stale OLD-branch rooms can't be used to resolve
    // NEW-branch appts during the load window.
    setBranchExamRooms([]);
    setRoomsBranchTag(null);
    if (!selectedBranchId) return;
    let cancelled = false;
    listExamRooms({ branchId: selectedBranchId, status: 'ใช้งาน' })
      .then(rs => {
        if (cancelled) return;
        setBranchExamRooms(rs || []);
        setRoomsBranchTag(selectedBranchId);
      })
      .catch(() => {
        if (cancelled) return;
        setBranchExamRooms([]);
        // Tag as "ready" even on error — the branch genuinely has no rooms
        // (or the fetch failed); UNASSIGNED column will absorb everything,
        // which is the correct fallback for a roomless branch.
        setRoomsBranchTag(selectedBranchId);
      });
    // One-time legacy cache cleanup — drop the per-device cumulative
    // room-name list now that be_exam_rooms is the canonical source.
    try { window.localStorage?.removeItem(ROOMS_CACHE_KEY); } catch { /* ignore */ }
    return () => { cancelled = true; };
  }, [selectedBranchId]);

  // Phase 15.7-bis (2026-04-28) — array-valued apptMap so duplicate
  // appts at same startTime+room render together. Phase 18.0 (2026-05-05) —
  // effectiveRoom resolved against branch master via roomName string.
  // Phase 20.0 AppointmentTab roomId migration (2026-05-06) — match by
  // roomId FK FIRST (canonical, robust to room renames), fall back to
  // roomName for legacy appts that pre-date Phase 18.0 roomId stamping.
  // Returns the master room's NAME (column-header label) regardless of
  // which side resolved the match.
  const UNASSIGNED_ROOM = '— ไม่ระบุห้อง —';
  const masterRoomById = useMemo(
    () => {
      const m = new Map();
      for (const r of branchExamRooms) {
        if (r?.id) m.set(String(r.id), String(r.name || '').trim());
      }
      return m;
    },
    [branchExamRooms],
  );
  const masterRoomNameSet = useMemo(
    () => new Set(branchExamRooms.map(r => String(r.name || '').trim()).filter(Boolean)),
    [branchExamRooms],
  );
  const effectiveRoom = (a) => {
    // 1. roomId FK match (canonical, post-Phase-18.0 appts)
    const rid = a && a.roomId ? String(a.roomId) : '';
    if (rid && masterRoomById.has(rid)) return masterRoomById.get(rid);
    // 2. roomName legacy match (pre-Phase-18.0 appts written with name only)
    const nm = a && a.roomName ? String(a.roomName).trim() : '';
    if (!nm) return UNASSIGNED_ROOM;
    return masterRoomNameSet.has(nm) ? nm : UNASSIGNED_ROOM;
  };

  // Phase 21.0 (2026-05-06) — type filter (defense-in-depth: stale/missing
  // types coerce to 'no-deposit-booking'). When typeFilter is null (no prop
  // passed), all appointments pass through (legacy behavior).
  //
  // 🚨 ORDER MATTERS: apptMatchesType + typedDayAppts MUST be declared
  // BEFORE the `rooms` useMemo below (which references typedDayAppts in
  // its hasOrphan check). const declarations have a temporal dead zone
  // — referencing them earlier in the function body throws a
  // ReferenceError on first render → blank screen. Hotfix from
  // user-reported "เข้าแล้วจอดำหมดเลย" 2026-05-06 EOD.
  const apptMatchesType = useCallback(
    (a) => {
      if (!typeFilter) return true;
      return migrateLegacyAppointmentType(a?.appointmentType) === typeFilter;
    },
    [typeFilter],
  );
  // Phase 24.0-sexiesdecies (2026-05-06) — gate typedDayAppts on
  // roomsReadyForBranch so the room resolver never sees stale OLD-branch
  // rooms when NEW-branch appts have already arrived. Sub-1s window during
  // branch switch — once both listeners settle on the same branchId, real
  // appts flow through. See branchExamRooms useEffect for the rationale.
  const typedDayAppts = useMemo(
    () => (roomsReadyForBranch ? dayAppts.filter(apptMatchesType) : []),
    [dayAppts, apptMatchesType, roomsReadyForBranch],
  );

  // V53 (BS-12) — visible time-slot range driven by per-branch openHours.
  // Reads cs.openHoursMonFri / cs.openHoursSatSun (V51 merged shape) and
  // returns { slots, openRange, isClosed, hasOutsideAppts }. When admin
  // switches branch → useEffectiveClinicSettings re-emits → this useMemo
  // recomputes → grid + closed banner re-render. Legacy appts outside
  // open hours auto-expand the visible range AND set hasOutsideAppts=true
  // so the per-card chip lights up (Q1=A user choice 2026-05-08).
  const visibleTime = useMemo(
    () => getVisibleTimeSlotsForDate({
      dateISO: selectedDate,
      mergedSettings: cs,
      allTimeSlots: TIME_SLOTS,
      includeAppointments: typedDayAppts,
    }),
    [selectedDate, cs?.openHoursMonFri, cs?.openHoursSatSun, typedDayAppts],
  );

  const rooms = useMemo(() => {
    // Phase 18.0 — column set = master rooms ONLY (sorted by sortOrder
    // then name) + virtual ไม่ระบุห้อง when (a) at least one appt resolves
    // to UNASSIGNED OR (b) the branch has zero master rooms (give the
    // user at least one clickable column so they can create a roomless
    // appt on an empty branch — user directive 2026-05-05: "ต้องการให้
    // user คลิ๊กลงไปในตารางแล้วสร้างนัดจากตารางเปล่าๆได้").
    // Legacy roomName strings dropped entirely.
    // Phase 21.0 — orphan check uses typedDayAppts so the column appears
    // only when the active sub-tab has an unassigned-room appointment.
    const ordered = branchExamRooms
      .slice()
      .sort((a, b) =>
        (a.sortOrder || 0) - (b.sortOrder || 0) ||
        String(a.name || '').localeCompare(String(b.name || ''), 'th')
      )
      .map(r => String(r.name || '').trim())
      .filter(Boolean);
    const set = new Set(ordered);
    const hasOrphan = typedDayAppts.some(a => effectiveRoom(a) === UNASSIGNED_ROOM);
    if (hasOrphan || ordered.length === 0) set.add(UNASSIGNED_ROOM);
    return [...set];
  }, [branchExamRooms, masterRoomNameSet, typedDayAppts]);

  // Pre-compute appointment lookup map for O(1) access in time grid.
  // Phase 15.7-bis: array-valued so duplicates at same startTime+room
  // BOTH render. Sort within each cell by createdAt asc so first-created
  // appears as the primary (deterministic).
  // Phase 21.0 — sources from typedDayAppts so the grid + occupied check
  // only consider appointments of the active sub-tab's type.
  const apptMap = useMemo(() => {
    const map = {};
    typedDayAppts.forEach(a => {
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
  }, [typedDayAppts]);

  const dayDoctors = useMemo(() => {
    const map = {};
    typedDayAppts.forEach(a => {
      if (!a.doctorName) return;
      if (!map[a.doctorName]) map[a.doctorName] = { name: a.doctorName, min: a.startTime, max: a.endTime };
      else {
        if (a.startTime < map[a.doctorName].min) map[a.doctorName].min = a.startTime;
        if (a.endTime > map[a.doctorName].max) map[a.doctorName].max = a.endTime;
      }
    });
    return Object.values(map);
  }, [typedDayAppts]);

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
      // Issue-2 (2026-05-26) — pass '' (not '10:00') when no specific slot was
      // clicked, so AppointmentFormModal applies the branch's open-time default
      // for the date. A clicked slot time is still passed through + respected
      // (the modal treats a non-empty initialStartTime as an explicit choice).
      initialStartTime: time || '',
      initialEndTime: time ? (TIME_SLOTS[TIME_SLOTS.indexOf(time) + 1] || time) : '',
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
              const monthCellList = monthAppts[cell.dateStr]||[];
              const hasAppt = (typeFilter ? monthCellList.filter(apptMatchesType) : monthCellList).length > 0;
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
          branchExamRooms={branchExamRooms}
          onDoctorClick={(doctorId) => {
            // For now, scroll the time grid to the first appointment block
            // for that doctor (or no-op if none). Future: filter UI.
            const first = typedDayAppts.find((a) => String(a.doctorId) === String(doctorId));
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
                const weekDayList = monthAppts[wd.date]||[];
                const count = (typeFilter ? weekDayList.filter(apptMatchesType) : weekDayList).length;
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
            {/* Phase 21.0 — sub-tab type label so admin sees which slice
                of appointments is being filtered. Hidden when typeFilter is null. */}
            {typeFilter && (
              <span
                className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-sky-700/20 text-sky-300 border border-sky-700/30"
                data-testid="appt-type-filter-label"
                data-type-filter={typeFilter}
              >
                {typeLabel}
              </span>
            )}
            <span className="text-xs font-bold text-sky-400" data-testid="appt-doctors-count-header">
              | แพทย์เข้าตรวจ {todaysSchedules.filter(s => s.type === 'recurring' || s.type === 'work' || s.type === 'halfday').length} คน
            </span>
            {dayLoading && <Loader2 size={14} className="animate-spin text-[var(--tx-muted)]" />}
          </div>
          <div className="flex items-center gap-2">
            {/* Calendar-density (2026-05-20) — grid ⇄ agenda toggle. Pins
                viewModeOverride; below-lg defaults to agenda automatically. */}
            <button
              type="button"
              onClick={() => setViewModeOverride(effectiveView === 'grid' ? 'agenda' : 'grid')}
              data-testid="appt-view-toggle"
              data-effective-view={effectiveView}
              title={effectiveView === 'grid' ? 'สลับเป็นมุมมองลิสต์' : 'สลับเป็นมุมมองตาราง'}
              className="px-3 py-2.5 rounded-xl text-xs font-bold text-[var(--tx-secondary)] border border-[var(--bd)] hover:bg-[var(--bg-hover)] transition-all flex items-center gap-1.5"
            >
              {effectiveView === 'grid' ? '☰ ลิสต์' : '⊞ ตาราง'}
            </button>
            <button onClick={() => openCreate(selectedDate)}
              className="px-4 py-2.5 rounded-xl text-xs font-black text-white transition-all flex items-center gap-1.5 hover:shadow-xl active:scale-[0.97] uppercase tracking-wider"
              style={{ background: 'linear-gradient(135deg, #047857, #059669)', boxShadow: '0 4px 15px rgba(5,150,105,0.3)' }}>
              <Plus size={14} /> เพิ่มนัดหมาย
            </button>
          </div>
        </div>

        {/* Phase 11.8 wiring: Holiday banner. Warns admin that the selected
            date is a clinic closure (specific-date or weekly day-of-week).
            Non-blocking — bookings still allowed but flagged. */}
        {/* V53 (BS-12, 2026-05-08) — closed-hours banner. Appears when the
            current branch has no open-hours for the selected day's bucket
            (open===close OR reversed/missing). Distinct from the holiday
            banner above; both can co-exist if needed. */}
        {visibleTime.isClosed && (
          <div data-testid="appt-closed-hours-banner"
            className="flex items-center gap-2 px-4 py-3 rounded-lg bg-amber-700/15 border border-amber-600/40">
            <CalendarX size={18} className="flex-shrink-0 text-amber-300" />
            <div className="flex-1 text-xs text-amber-200">
              <span className="font-bold">นอกเวลาเปิดทำการของสาขา</span>
              <span className="ml-2 text-amber-300/80">— ตั้งเวลาเปิด-ปิดสาขาที่ tab=branches</span>
              <span className="ml-2 text-[11px] opacity-75">· ระบบยังเปิดให้จองได้ แต่อยู่นอกชั่วโมงเปิดสาขา</span>
            </div>
          </div>
        )}
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
        {effectiveView === 'agenda' ? (
          /* Calendar-density (2026-05-20) — mobile/pinned agenda view. Fed by
             the SAME typedDayAppts the grid uses (no refetch); room labels
             resolve via effectiveRoom; card tap → openDetail (popover). */
          <div className="bg-[var(--bg-surface)] rounded-xl overflow-hidden shadow-lg" style={{ border: '1.5px solid rgba(14,165,233,0.1)' }} data-testid="appt-agenda-wrapper">
            <AppointmentAgendaView appts={typedDayAppts} resolveRoom={effectiveRoom} onSelect={openDetail} />
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

              {/* Time rows.
                  Phase 21.0-quinquies (2026-05-06 EOD) — visual rhythm
                  upgrade per user "ตารางเราแม่งโคตรจะไม่สวยดูยาก ลายตา":
                  • Hour-boundary rows (HH:00) get a stronger top border +
                    bolder time label so the eye can quickly anchor on
                    "9 / 10 / 11 / ...".
                  • Half-hour rows (HH:30) get a medium-weight border.
                  • Quarter-hour rows (HH:15 / HH:45) get a faint border.
                  Result: empty grid no longer looks like uniform stripes;
                  the rhythm guides the eye.
                  Phase 21.0-sexies (2026-05-06 EOD continuation) — borders
                  moved from row-wrapper → individual cells so an occupied
                  cell (covered by an appointment block from above) skips
                  its top border, eliminating the horizontal stripes that
                  showed through the translucent status-bg. User report:
                  "ลูกค้าลากคิวยาว ... เอาเส้นขาวๆในพื้นที่สีส้มออกไปปป". */}
              <div className="relative">
                {/* V53 (BS-12) — visibleTime.slots derived from per-branch
                    openHours; auto-expanded when legacy appts fall outside. */}
                {visibleTime.slots.map((time) => {
                  const isHour     = time.endsWith(':00');
                  const isHalfHour = time.endsWith(':30');
                  // Per-cell border style — applied to time-label + each
                  // non-occupied room cell. Occupied cells render a
                  // BORDERLESS empty div so the block above stays clean.
                  const cellBorderCls = isHour
                    ? 'border-t-2 border-[var(--bd)]/70'
                    : isHalfHour
                      ? 'border-t border-[var(--bd)]/35'
                      : 'border-t border-[var(--bd)]/15';
                  const labelCls = isHour
                    ? 'text-[var(--tx-secondary)] font-bold'
                    : 'text-[var(--tx-muted)]/70';
                  return (
                  <div key={time} className="flex" style={{ height: SLOT_H }}>
                    <div className={`w-[60px] flex-shrink-0 text-xs text-right pr-2 pt-0.5 font-mono ${labelCls} ${cellBorderCls}`}>{time}</div>
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
                        // Calendar-density (2026-05-20) — a span=1 (15-min)
                        // block is only SLOT_H-4 = 18px tall. Render a tight
                        // single line (py-0 + 11px) that fits without clipping
                        // the name. AppointmentSlotMeta is already span>1-gated,
                        // so span=1 is name-only. span>=2 keeps the roomy card.
                        const isShortBlock = span === 1;
                        const nameSizeCls = isShortBlock ? 'text-[11px] leading-[18px]' : 'text-sm leading-tight';
                        // V53 (BS-12) — flag this appt's startTime as "outside
                        // current branch open hours" so admin sees an orange
                        // chip + can reschedule. Helper returns false when
                        // settings are missing (no opinion → no chip).
                        const apptOutsideHours = isTimeOutsideOpenHours(appt.startTime, selectedDate, cs);
                        // Phase 21.0-sexies — appointment-block FIRST row keeps
                        // the per-row top border (so the row above ends with a
                        // visible line). Subsequent rows under the block are
                        // rendered borderless via the `occupied` branch below.
                        return (
                          <div key={room} className={`flex-1 ${_colMinClass} border-l border-[var(--bd)]/30 px-0.5 relative ${cellBorderCls}`} style={{ height: SLOT_H }}>
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
                              onClick={() => openDetail(appt)}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(appt); } }}
                              className={`absolute left-0.5 right-0.5 top-0.5 rounded-lg px-2 ${isShortBlock ? 'py-0' : 'py-1'} text-left overflow-hidden transition-all hover:ring-2 hover:ring-sky-400 hover:shadow-lg z-[5] ${st.bg} border border-[var(--bd)]/40 cursor-pointer shadow-sm`}
                              style={{
                                height: span * SLOT_H - 4,
                                // Phase 21.0-quinquies — 4px status-color left
                                // border + soft inset shadow so the block reads
                                // as a card. status accent (orange/sky/emerald/red)
                                // is identifiable at a glance.
                                borderLeft: `4px solid ${st.accent}`,
                                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04)',
                              }}>
                              <div className="flex items-center gap-1.5">
                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${st.dot} shadow-md`} style={{ boxShadow: `0 0 6px ${st.accent}` }} />
                                {/* V53 (BS-12) — out-of-hours chip for legacy
                                    appts whose startTime falls outside the
                                    branch's current open hours. Click on the
                                    parent cell still opens the edit modal so
                                    admin can reschedule. */}
                                {apptOutsideHours && (
                                  <span
                                    title="นัดนี้อยู่นอกเวลาเปิดสาขาปัจจุบัน — แตะเพื่อแก้ไขเวลา"
                                    data-testid="appt-outside-hours-chip"
                                    className="text-[9px] uppercase tracking-wider px-1 py-0.5 rounded font-bold border bg-amber-900/40 text-amber-300 border-amber-700/50 flex-shrink-0"
                                  >
                                    ⚠ นอกเวลา
                                  </span>
                                )}
                                {/* Customer name = clickable link to customer detail
                                    in a NEW BROWSER TAB. e.stopPropagation prevents the
                                    parent cell's onClick (edit modal) from firing.
                                    Phase 21.0-quinquies — bumped to text-sm + tighter
                                    leading for legibility. */}
                                {/* Phase 24.0-septiesdecies (2026-05-06) — display
                                    fallback chain for customer-later appts:
                                    customerName → customerNameTemp → '-'. The
                                    phone temp is appended in small font when
                                    no real customer is linked yet. */}
                                {appt.customerId ? (
                                  <a
                                    href={`/?backend=1&customer=${encodeURIComponent(String(appt.customerId))}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => { e.stopPropagation(); }}
                                    className={`${nameSizeCls} font-bold text-[var(--tx-heading)] truncate hover:underline underline-offset-2 hover:text-sky-300`}
                                    title={`เปิดข้อมูล ${appt.customerName || appt.customerNameTemp || ''} ในแท็บใหม่`}
                                    data-testid="appt-grid-customer-link"
                                  >
                                    {/* Task 9 LR-4 (2026-05-15) — show 🟢/⚪️ LINE chip alongside
                                        the denormalized customer name. appt docs carry only
                                        the denormalized name; lineUserId / lineUserId_byBranch
                                        (when denormalized) drive the per-branch badge. */}
                                    <CustomerOption
                                      customer={{
                                        name: appt.customerName || appt.customerNameTemp || '-',
                                        branchId: appt.branchId,
                                        lineUserId: appt.lineUserId,
                                        lineDisplayName: appt.lineDisplayName,
                                        lineUserId_byBranch: appt.lineUserId_byBranch,
                                      }}
                                      contextBranchId={selectedBranchId}
                                    />
                                  </a>
                                ) : (
                                  <span
                                    className={`${nameSizeCls} font-bold text-[var(--tx-heading)] truncate`}
                                    data-testid={(appt.customerNameTemp || appt.customerPhoneTemp) ? 'appt-grid-customer-temp' : undefined}
                                    title={appt.customerPhoneTemp ? `เบอร์: ${appt.customerPhoneTemp}` : undefined}
                                  >
                                    {appt.customerName || appt.customerNameTemp || '-'}
                                    {!appt.customerName && appt.customerPhoneTemp && (
                                      <span className="ml-1.5 text-[10px] font-normal font-mono text-[var(--tx-muted)]">· <PhoneLink value={appt.customerPhoneTemp}>{appt.customerPhoneTemp}</PhoneLink></span>
                                    )}
                                  </span>
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
                                        onClick={(e) => { e.stopPropagation(); openDetail(dup); }}
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
                      const occupied = typedDayAppts.some(a => {
                        if (effectiveRoom(a) !== room || !a.startTime || !a.endTime) return false;
                        return time > a.startTime && time < a.endTime;
                      });
                      // Phase 21.0-sexies (2026-05-06 EOD continuation) — when
                      // a cell is OCCUPIED (covered by an appointment block
                      // from above), suppress its top border. The block's
                      // translucent status-bg is no longer striped by row
                      // boundaries showing through. Non-occupied cells keep
                      // the hour/half/quarter rhythm.
                      return (
                        <div key={room}
                          onClick={() => !occupied && openCreate(selectedDate, time, room === UNASSIGNED_ROOM ? '' : room)}
                          className={`flex-1 ${_colMinClass} border-l border-[var(--bd)]/30 ${occupied ? '' : `${cellBorderCls} cursor-pointer hover:bg-sky-900/5`}`}
                          style={{ height: SLOT_H }} />
                      );
                    })}
                  </div>
                  );
                })}
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
          /* Phase 21.0 — lock appointmentType to the active sub-tab's
             canonical id. The modal hides the type radio + forces payload
             value so admin can't miscategorize while inside a typed view.
             For 'deposit-booking' specifically, the modal renders a banner
             redirecting admin to the Finance.มัดจำ form (DepositPanel) since
             deposit-bookings need the deposit fields (amount/payment) and
             go through the appointmentDepositBatch.js pair-helper writer. */
          lockedAppointmentType={typeFilter || null}
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
          // Phase 24.0-vicies-quinquies (2026-05-06) — when admin deletes a
          // deposit-booking appointment from this view AND the appt has a
          // linkedDepositId, also delete the linked be_deposits doc via
          // deleteDepositBookingPair (atomic writeBatch). Pre-fix: deleting
          // the appt left an orphan deposit in Finance.มัดจำ + the bubble
          // counter on the date-strip kept showing 1 because something in
          // the deposit's embedded appointment metadata caused a phantom
          // count. User report: "ถ้าลบนัดหมาย จองมัดจำ จากหน้านัดหมายแล้ว
          // ถ้าไม่ลบในการเงินด้วย มันจะแสดง bubble ตรงแถบวันที่ ด้านบน
          // ของ tab นัดหมายไปตลอด".
          onDelete={formMode.mode === 'edit' && formMode.appt ? async () => {
            const id = formMode.appt.appointmentId || formMode.appt.id;
            if (!id) return;
            // Phase 24.0-vicies-septies (2026-05-06) — coerce legacy
            // {depositId,success} object shape (broken records from pre-fix
            // kiosk createDeposit). Pre-fix the helper called String(obj)
            // → "[object Object]" → throws "deposit [object Object] not found".
            const _coerceDepId = (v) => (
              !v ? '' :
              typeof v === 'string' ? v :
              typeof v === 'object' && v.depositId ? String(v.depositId) :
              String(v)
            );
            const linkedDepositId = _coerceDepId(formMode.appt.linkedDepositId)
              || _coerceDepId(formMode.appt.spawnedFromDepositId)
              || '';
            // (2026-05-26) deposit-linked → open the deposit-aware dialog
            // (ลบมัดจำด้วย / เก็บมัดจำ) instead of silently pair-deleting.
            // The dialog (rendered below) routes the choice to the cascade.
            if (linkedDepositId) {
              setDeleteDialog({ appt: formMode.appt, depositId: linkedDepositId, apptId: id });
              setFormMode(null);
              return;
            }
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

      {/* (2026-05-26) deposit-aware delete — when a deposit-linked appt is
          deleted, ask ลบมัดจำด้วย / เก็บมัดจำ. 'both' hard-deletes the pair;
          'this-only' deletes just the appt (deposit preserved). */}
      {deleteDialog && (
        <DepositAwareCancelDialog
          open
          orientation="appt"
          depositId={deleteDialog.depositId}
          subtitle={`คุณ ${deleteDialog.appt.customerName || '-'} · ${deleteDialog.appt.date || ''} ${deleteDialog.appt.startTime || ''}`.trim()}
          onChoice={async (choice) => {
            const dlg = deleteDialog;
            setDeleteDialog(null);
            if (!dlg || choice === 'cancel') return;
            try {
              if (choice === 'both') {
                const { deleteDepositBookingPair } = await import('../../lib/appointmentDepositBatch.js');
                await deleteDepositBookingPair(dlg.depositId);
              } else {
                await deleteBackendAppointment(dlg.apptId); // keep deposit
              }
            } catch (err) {
              console.warn('[AppointmentCalendarView] deposit-aware delete failed:', err);
            }
            // listener auto-refreshes the day grid + the mini-calendar bubble
          }}
          onClose={() => setDeleteDialog(null)}
        />
      )}

      {/* Calendar-density (2026-05-20) — read-only detail popover. roomName
          resolved via effectiveRoom (the grid loop's `room` var isn't in
          scope here). แก้ไข → close popover, then open the edit modal. */}
      {detailAppt && (
        <AppointmentDetailPopover
          appt={detailAppt}
          roomName={effectiveRoom(detailAppt)}
          doctorMap={doctorMap}
          onEdit={() => { const a = detailAppt; setDetailAppt(null); openEdit(a); }}
          onClose={() => setDetailAppt(null)}
        />
      )}
    </div>
  );
}
