// ─── AppointmentFormModal — shared "สร้างนัดหมาย / แก้ไขนัดหมาย" ────────
// Phase 14.7.B (2026-04-25)
//
// Single source of truth for the appointment booking form. Used by:
//   - AppointmentTab        (full form with collision + holiday checks)
//   - CustomerDetailView    (lockedCustomer mode — same form, customer
//                            pre-filled + locked, calendar-context checks
//                            skipped because the user isn't picking a
//                            specific time slot from a grid)
//
// Wiring contract (matches AppointmentTab.handleSave verbatim per user
// 2026-04-25 directive "wiring ให้ถูกต้องเหมือนกันด้วย"):
//   - Loads customers / doctors / staff / rooms / holidays from be_*
//   - Validates customerId + date + startTime
//   - Holiday confirm prompt on create (skipped if skipHolidayCheck)
//   - Slot collision check against `existingAppointments` (skipped if
//     skipCollisionCheck — set when the caller doesn't have full-day
//     appointment context, e.g. customer-detail page)
//   - Calls createBackendAppointment / updateBackendAppointment with
//     the same payload shape as AppointmentTab (every field listed below)
//   - On create with recurringOption='multiple', writes one row per
//     occurrence (every recurringInterval recurringUnit, recurringTimes
//     iterations)

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar, X, Loader2, CheckCircle2, AlertCircle, Trash2,
} from 'lucide-react';
// Phase 15.7-septies (2026-04-29) — open customer detail in a NEW BROWSER TAB
// instead of in-page redirect. User: "เปิด Tab ของ Browser ใหม่... ไม่ใช่
// redirection หน้าเดิมไป มันใช้ยาก".
import { openCustomerInNewTab } from '../../lib/customerNavigation.js';
import {
  createBackendAppointment, updateBackendAppointment,
  getAllCustomers,
  listenToHolidays, listStaffSchedules,
  // Phase 14.10-tris (2026-04-26) — load doctors + staff from be_* canonical
  // (was master_data via getAllMasterDataItems — stale ProClinic mirror).
  listDoctors, listStaff,
  // Phase 15.7-octies (2026-04-29) — advisor dropdown uses listAllSellers
  // (staff + doctors merged + branch-filtered + composed names) per user
  // directive: "ที่ปรึกษา ... แสดงเป็น พนักงาน และ ผู้ช่วย ในสาขานั้นๆ".
  listAllSellers,
  // Phase 18.0 (2026-05-05) — branch-scoped exam-room master
  listExamRooms,
} from '../../lib/scopedDataLayer.js';
import { useBranchAwareListener } from '../../hooks/useBranchAwareListener.js';
import { isDateHoliday, DAY_OF_WEEK_LABELS } from '../../lib/holidayValidation.js';
import { checkAppointmentCollision, TIME_SLOTS } from '../../lib/staffScheduleValidation.js';
import { APPOINTMENT_TYPES, DEFAULT_APPOINTMENT_TYPE } from '../../lib/appointmentTypes.js';
import { thaiTodayISO } from '../../utils.js';
import DateField from '../DateField.jsx';
import { useSelectedBranch, resolveBranchName } from '../../lib/BranchContext.jsx';
import { filterDoctorsByBranch } from '../../lib/branchScopeUtils.js';

// Phase 19.0 (2026-05-06) — TIME_SLOTS imported from canonical
// staffScheduleValidation; APPT_TYPES replaced by APPOINTMENT_TYPES SSOT.
// CHANNELS + STATUSES + APPT_COLORS retained locally (no SSOT yet).
const CHANNELS = ['เคาน์เตอร์','โทรศัพท์','Walk-in','Facebook','Instagram','TikTok','Line','อื่นๆ'];
const APPT_COLORS = ['ใช้สีเริ่มต้น','เหลืองอ่อน','เขียวอ่อน','ส้มอ่อน','แดงอ่อน','น้ำตาลอ่อน','ชมพูอ่อน','ม่วงอ่อน','น้ำเงินอ่อน'];
const STATUSES = [
  { value: 'pending',   label: 'รอยืนยัน' },
  { value: 'confirmed', label: 'ยืนยันแล้ว' },
  { value: 'done',      label: 'เสร็จแล้ว' },
  { value: 'cancelled', label: 'ยกเลิก' },
];
// Phase 18.0 (2026-05-05) — FALLBACK_ROOMS + ROOMS_CACHE_KEY removed.
// Replaced with be_exam_rooms branch-scoped master via listExamRooms.
// Each appt now stores both roomId (FK) + roomName (snapshot for historical
// display + deletion-safe rendering).

function defaultFormData(overrides = {}) {
  return {
    date: thaiTodayISO(),
    startTime: '10:00',
    endTime: '10:15',  // Phase 19.0 — default 15-min duration
    customerId: '', customerName: '', customerHN: '',
    appointmentType: DEFAULT_APPOINTMENT_TYPE,  // Phase 19.0 — 'no-deposit-booking'
    advisorId: '', advisorName: '',
    doctorId: '', doctorName: '',
    assistantIds: [],
    roomId: '',  // Phase 18.0 (2026-05-05) — FK to be_exam_rooms
    roomName: '',
    channel: '',
    appointmentTo: '',
    location: '',
    expectedSales: '',
    preparation: '',
    customerNote: '',
    notes: '',
    appointmentColor: '',
    lineNotify: false,
    recurringOption: 'once',
    recurringInterval: '',
    recurringUnit: 'วัน',
    recurringTimes: '',
    status: 'pending',
    ...overrides,
  };
}

/**
 * @param {Object} props
 * @param {'create'|'edit'} props.mode
 * @param {Object} [props.appt] — existing appointment when mode='edit'
 * @param {Object} [props.lockedCustomer] — { proClinicId, proClinicHN, patientData{prefix,firstName,lastName} }.
 *   When provided, customer field is read-only + payload uses this customer.
 * @param {string} [props.initialDate] — for create from a calendar slot
 * @param {string} [props.initialStartTime]
 * @param {string} [props.initialEndTime]
 * @param {string} [props.initialRoomName]
 * @param {boolean} [props.skipHolidayCheck=false]
 * @param {boolean} [props.skipCollisionCheck=false]
 * @param {boolean} [props.skipStaffScheduleCheck=true] — default ON-skip; AppointmentTab opts in by passing false to preserve Phase 13.2.4 behavior. CustomerDetailView keeps default (skip) because it has no full-day calendar context.
 * @param {Array}  [props.existingAppointments] — for collision check
 * @param {Object} [props.theme]
 * @param {() => void} props.onSaved
 * @param {() => void} props.onClose
 * @param {boolean} [props.enableCustomerLink=false] — Phase 15.7-septies
 *        When true, the customer name renders as a clickable link that
 *        opens the customer detail page in a NEW BROWSER TAB
 *        (`?backend=1&customer={id}`). When false (default), name renders
 *        as static text. CustomerDetailView keeps it false (we're already
 *        on the customer page); AppointmentTab passes true.
 *        Replaces the Phase 15.7-sexies in-page-redirect `onOpenCustomer`
 *        callback per user directive 2026-04-29.
 * @param {() => Promise<void> | void} [props.onDelete] — Phase 15.7-sexies
 *        Optional callback fired when admin clicks the "ลบนัดหมาย" button.
 *        Edit mode only. Caller is responsible for confirm() + actual
 *        deleteBackendAppointment(...) + closing the modal. The button is
 *        hidden when this prop is omitted (CustomerDetailView already has
 *        its own cancel button outside the modal).
 */
export default function AppointmentFormModal({
  mode,
  appt,
  lockedCustomer,
  initialDate,
  initialStartTime,
  initialEndTime,
  initialRoomName,
  skipHolidayCheck = false,
  skipCollisionCheck = false,
  skipStaffScheduleCheck = true,
  existingAppointments = [],
  theme,
  onSaved,
  onClose,
  enableCustomerLink = false,
  onDelete,
}) {
  const isDark = theme !== 'light';
  // Phase 14.7.H follow-up A — branch-aware appointment writes.
  // Phase 15.7-octies (2026-04-29) — also pull `branches` so we can render
  // the locked location field with the human-readable branch name + load
  // listAllSellers with the branch filter for the advisor dropdown.
  const { branchId: selectedBranchId, branches } = useSelectedBranch();
  const currentBranchName = resolveBranchName(selectedBranchId, branches) || (selectedBranchId === 'main' ? 'สาขาหลัก (main)' : selectedBranchId || 'สาขาหลัก');

  // ── Form data ──
  const [formData, setFormData] = useState(() => {
    if (mode === 'edit' && appt) {
      return defaultFormData({
        date: appt.date,
        startTime: appt.startTime,
        endTime: appt.endTime || appt.startTime,
        customerId: appt.customerId,
        customerName: appt.customerName,
        customerHN: appt.customerHN,
        appointmentType: appt.appointmentType || DEFAULT_APPOINTMENT_TYPE,
        advisorId: appt.advisorId || '',
        advisorName: appt.advisorName || '',
        doctorId: appt.doctorId || '',
        doctorName: appt.doctorName || '',
        assistantIds: appt.assistantIds || [],
        roomId: appt.roomId || '',  // Phase 18.0
        roomName: appt.roomName || '',
        channel: appt.channel || '',
        appointmentTo: appt.appointmentTo || '',
        location: appt.location || '',
        expectedSales: appt.expectedSales || '',
        preparation: appt.preparation || '',
        customerNote: appt.customerNote || '',
        notes: appt.notes || '',
        appointmentColor: appt.appointmentColor || '',
        lineNotify: !!appt.lineNotify,
        status: appt.status || 'pending',
      });
    }
    // Create mode — apply lockedCustomer if any + initial slot data
    const cInit = lockedCustomer ? {
      customerId: lockedCustomer.proClinicId || lockedCustomer.id || '',
      customerName: `${lockedCustomer.patientData?.prefix || ''} ${lockedCustomer.patientData?.firstName || ''} ${lockedCustomer.patientData?.lastName || ''}`.trim(),
      customerHN: lockedCustomer.proClinicHN || '',
    } : {};
    return defaultFormData({
      date: initialDate || thaiTodayISO(),
      startTime: initialStartTime || '10:00',
      endTime: initialEndTime || (initialStartTime ? (TIME_SLOTS[TIME_SLOTS.indexOf(initialStartTime) + 1] || initialStartTime) : '10:15'),
      roomName: initialRoomName || '',
      ...cInit,
    });
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // ── Data loaders ──
  const [customers, setCustomers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [doctors, setDoctors] = useState([]);
  // Phase 15.7-octies (2026-04-29) — advisor dropdown uses merged
  // staff + doctors filtered by branch (via listAllSellers). User
  // directive: "แสดงเป็น พนักงาน และ ผู้ช่วย ในสาขานั้นๆ".
  // Replaces the prior `staff` state which was raw be_staff (V33 schema
  // missing composed `name` → empty dropdown options).
  const [advisorOptions, setAdvisorOptions] = useState([]);
  // Phase 15.7 (2026-04-28) — REVERSED 2026-04-28-AM directive. User's
  // ACTUAL spec: "ผู้ช่วยแพทย์ (สูงสุด 5 คน) หมายความว่า ให้เอาแพทย์และ
  // ผู้ช่วยที่มีทั้งหมดมาให้เลือก แต่ select ได้แค่ 5 คน". Show ALL doctors
  // + assistants in the picker (any user with be_doctors record), MAX-5
  // is enforced on SELECTION only via .slice(0, 5) in onChange.
  // Position-filter removed: a doctor may be picked as an assistant for a
  // procedure (cross-role coverage), and assistant-only position is too
  // narrow. Same change applied at TreatmentFormPage:618-620.
  const assistants = useMemo(() => doctors, [doctors]);
  // Phase 18.0 — exam rooms loaded from be_exam_rooms (branch-scoped master).
  // Replaces FALLBACK_ROOMS + localStorage cache.
  const [examRooms, setExamRooms] = useState([]);
  const [holidays, setHolidays] = useState([]);

  useEffect(() => {
    // Load doctors + staff on mount (one-shot — masters change rarely).
    // Phase 14.10-tris — switched from master_data to be_* canonical.
    // Phase 15.7-octies — advisor list now sources from listAllSellers
    // (merged staff + doctors with branch filter + composed names).
    // Phase 18.0 — listExamRooms loads branch-scoped active rooms for
    // the room dropdown.
    Promise.all([
      listDoctors().catch(() => []),
      listAllSellers({ branchId: selectedBranchId }).catch(() => []),
      listExamRooms({ branchId: selectedBranchId, status: 'ใช้งาน' }).catch(() => []),
    ]).then(([d, sellers, rooms]) => {
      setExamRooms(rooms || []);
      const _placeholder = null; // keep destructure shape stable
      // Phase BS (2026-05-06): filter doctor picker to those with branch
      // access. listDoctors() doesn't accept a branchId param (the legacy
      // pattern queries the entire be_doctors collection); we filter at the
      // consumer via filterDoctorsByBranch which respects the empty-branchIds
      // legacy fallback. Status filter retained for "พักใช้งาน" exclusion.
      const branchScoped = filterDoctorsByBranch(d || [], selectedBranchId);
      setDoctors(branchScoped.filter(x => x.status !== 'พักใช้งาน'));
      // listAllSellers already returns {id, name} composed shape and dedupes
      // ids across staff + doctors. Sort alphabetically for picker UX.
      const sorted = (sellers || []).slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'th'));
      setAdvisorOptions(sorted);
    });
    // Load customers ONLY if customer is not locked (saves a heavy fetch
    // when CustomerDetailView opens this modal — the customer is already
    // known and can't be changed).
    if (!lockedCustomer) {
      getAllCustomers().then(c => setCustomers(c || [])).catch(() => setCustomers([]));
    }
  }, [lockedCustomer, selectedBranchId]);

  // Phase 14.7.H follow-up H (2026-04-26): listenToHolidays so the modal's
  // skipHolidayCheck confirm prompt fires against the latest holiday set
  // even when admin A edits HolidaysTab while admin B is mid-booking.
  // Phase BSA Task 8 (2026-05-04) — migrated to useBranchAwareListener.
  // Pass {allBranches: true} to keep cross-branch holiday visibility (legacy
  // behavior — modal's holiday confirm should fire regardless of selected
  // branch since holidays may be clinic-wide).
  useBranchAwareListener(
    listenToHolidays,
    { allBranches: true },
    setHolidays,
    () => setHolidays([]),
  );

  // Filtered customer list (only used when not locked)
  const filteredCustomers = useMemo(() => {
    if (lockedCustomer) return [];
    if (!customerSearch) return customers.slice(0, 50);
    const q = customerSearch.toLowerCase();
    return customers.filter(c => {
      const name = `${c.patientData?.prefix || ''} ${c.patientData?.firstName || ''} ${c.patientData?.lastName || ''}`.toLowerCase();
      const hn = (c.proClinicHN || '').toLowerCase();
      const phone = (c.patientData?.phone || '').toLowerCase();
      return name.includes(q) || hn.includes(q) || phone.includes(q);
    }).slice(0, 50);
  }, [customers, customerSearch, lockedCustomer]);

  const scrollToFormError = useCallback((fieldAttr, msg) => {
    setError(msg);
    setTimeout(() => {
      const el = document.querySelector(`[data-field="${fieldAttr}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-2', 'ring-red-500');
        setTimeout(() => el.classList.remove('ring-2', 'ring-red-500'), 3000);
      }
    }, 50);
  }, []);

  const handleSave = async () => {
    if (!formData.customerId) { scrollToFormError('apptCustomer', 'กรุณาเลือกลูกค้า'); return; }
    if (!formData.date) { scrollToFormError('apptDate', 'กรุณาเลือกวันที่'); return; }
    if (!formData.startTime) { scrollToFormError('apptStartTime', 'กรุณาเลือกเวลาเริ่ม'); return; }

    // Holiday confirm (create only)
    if (mode === 'create' && !skipHolidayCheck) {
      const holiday = isDateHoliday(formData.date, holidays);
      if (holiday) {
        const label = holiday.type === 'weekly'
          ? `ทุกวัน${DAY_OF_WEEK_LABELS[Number(holiday.dayOfWeek) || 0]}`
          : (holiday.note || `วันหยุดเฉพาะ (${formData.date})`);
        if (!window.confirm(`วันนี้เป็นวันหยุดคลินิก:\n\n${label}\n\nยืนยันสร้างนัดหมายในวันนี้ ?`)) return;
      }
    }

    setSaving(true);
    setError('');
    try {
      // Collision check (skip for customer-page mode where caller doesn't
      // have full-day appointment context). Mirror AppointmentTab logic.
      if (!skipCollisionCheck) {
        const editingId = mode === 'edit' && appt ? (appt.appointmentId || appt.id) : null;
        const newStart = String(formData.startTime);
        const newEnd = String(formData.endTime || formData.startTime) || newStart;
        const conflicts = (existingAppointments || []).filter(a => {
          if (editingId && (a.appointmentId === editingId || a.id === editingId)) return false;
          if (a.date !== formData.date) return false;
          if (a.status === 'cancelled') return false;
          const aStart = String(a.startTime);
          const aEnd = String(a.endTime || a.startTime) || aStart;
          // Overlap iff [aStart, aEnd) intersects [newStart, newEnd)
          if (aEnd <= newStart || aStart >= newEnd) return false;
          const sameRoom = formData.roomName && a.roomName && a.roomName === formData.roomName;
          const sameDoctor = formData.doctorId && a.doctorId && String(a.doctorId) === String(formData.doctorId);
          return sameRoom || sameDoctor;
        });
        if (conflicts.length > 0) {
          const o = conflicts[0];
          const who = o.roomName === formData.roomName ? `ห้อง "${o.roomName}"` : `หมอ "${o.doctorName || o.doctorId}"`;
          if (!window.confirm(`${who} มีนัดอยู่แล้วในช่วง ${o.startTime}-${o.endTime || o.startTime}\nยืนยันสร้างทับซ้อน ?`)) {
            setSaving(false);
            return;
          }
        }
      }

      // Phase 13.2.4 staff schedule collision (warning, not blocking). Opt-in
      // via `skipStaffScheduleCheck=false`. AppointmentTab passes false to
      // preserve its pre-refactor behavior; CustomerDetailView keeps the
      // default (skip) because it has no full-calendar context to compare.
      // Non-fatal on fetch failure — log + continue.
      //
      // Phase 13.2.10 (2026-04-26): query ALL doctor schedules (no date
      // filter) so checkAppointmentCollision → mergeSchedulesForDate can
      // see RECURRING entries (which have dayOfWeek, no date). Previous
      // {startDate, endDate} filter excluded recurring entries entirely
      // → silent "no entry → assume available" for every doctor.
      if (!skipStaffScheduleCheck && formData.doctorId) {
        try {
          const newStart = String(formData.startTime);
          const newEnd = String(formData.endTime || formData.startTime) || newStart;
          // Pull ALL entries for this doctor (recurring + per-date) — no
          // date filter so recurring entries reach the merge helper.
          const entries = await listStaffSchedules({
            staffId: formData.doctorId,
          });
          const check = checkAppointmentCollision(
            formData.doctorId, formData.date, newStart, newEnd, entries,
          );
          if (!check.available) {
            const who = formData.doctorName || formData.doctorId;
            const sourceTag = check.source === 'recurring' ? '(งานประจำ)' : check.source === 'override' ? '(งานรายวัน)' : '';
            const msg = `แพทย์ "${who}" ${check.reason} ${sourceTag} ในช่วงเวลาที่เลือก (${newStart}–${newEnd}).\n\nต้องการจองต่อหรือไม่?`;
            if (!window.confirm(msg)) { setSaving(false); return; }
          }
        } catch (e) {
          console.warn('[AppointmentFormModal] staff schedule check failed:', e);
        }
      }

      // Build payload — IDENTICAL shape to AppointmentTab.handleSave per
      // user directive "wiring ให้ถูกต้องเหมือนกันด้วย".
      // Phase 15.7 (2026-04-28) — denormalize `assistantNames` at save so
      // AppointmentTab + CustomerDetailView can render names without a
      // doctorMap lookup. Legacy appts (assistantIds only) still resolve via
      // resolveAssistantNames(appt, doctorMap) fallback in render code.
      const assistantIdsForSave = formData.assistantIds || [];
      const assistantNamesForSave = assistantIdsForSave
        .map((id) => {
          const d = doctors.find((x) => String(x.id) === String(id));
          return d ? String(d.name || '').trim() : '';
        })
        .filter(Boolean);
      const payload = {
        customerId: formData.customerId, customerName: formData.customerName, customerHN: formData.customerHN,
        date: formData.date, startTime: formData.startTime, endTime: formData.endTime || formData.startTime,
        appointmentType: formData.appointmentType || DEFAULT_APPOINTMENT_TYPE,
        advisorId: formData.advisorId || '', advisorName: formData.advisorName || '',
        doctorId: formData.doctorId, doctorName: formData.doctorName,
        assistantIds: assistantIdsForSave,
        assistantNames: assistantNamesForSave,
        roomId: formData.roomId || '',  // Phase 18.0 — FK to be_exam_rooms
        roomName: formData.roomName,    // snapshot (deletion-safe historical display)
        channel: formData.channel, appointmentTo: formData.appointmentTo,
        // Phase 15.7-octies (2026-04-29) — location is now LOCKED to the
        // current branch (resolved via useSelectedBranch + resolveBranchName).
        // Falls back to formData.location for legacy edit-mode appts that
        // already had a freeform location string (preserved on save).
        location: currentBranchName || formData.location || '',
        expectedSales: formData.expectedSales || '', preparation: formData.preparation || '',
        customerNote: formData.customerNote || '', notes: formData.notes,
        appointmentColor: formData.appointmentColor || '',
        lineNotify: !!formData.lineNotify,
        status: formData.status || 'pending',
        // Phase 14.7.H follow-up A — branch-aware appointment writes.
        branchId: selectedBranchId,
      };

      if (mode === 'edit' && appt) {
        await updateBackendAppointment(appt.appointmentId || appt.id, payload);
      } else {
        // Phase 18.0 (2026-05-05) — localStorage room cache removed.
        // Recurring multiplier (create only). Same logic as AppointmentTab.
        if (formData.recurringOption === 'multiple' && formData.recurringInterval && formData.recurringTimes) {
          const interval = Math.max(1, parseInt(formData.recurringInterval, 10) || 1);
          const times = Math.max(1, parseInt(formData.recurringTimes, 10) || 1);
          for (let i = 0; i < times; i++) {
            const d = new Date(formData.date);
            if (formData.recurringUnit === 'เดือน') d.setMonth(d.getMonth() + (interval * i));
            else d.setDate(d.getDate() + (interval * i));
            const iso = d.toISOString().slice(0, 10);
            await createBackendAppointment({ ...payload, date: iso });
          }
        } else {
          await createBackendAppointment(payload);
        }
      }
      await onSaved?.();
    } catch (e) {
      // Audit P1 (2026-04-26 AP1): server-side last-mile collision check
      // surfaces a friendly Thai message instead of the raw English code.
      if (e?.code === 'AP1_COLLISION') {
        const c = e.collision || {};
        setError(`ช่วงเวลานี้ถูกจองให้แพทย์ท่านนี้แล้ว: ${c.startTime || ''}-${c.endTime || ''} (${c.date || ''}). กรุณาเลือกเวลาอื่น`);
      } else {
        setError(e?.message || 'บันทึกล้มเหลว');
      }
    } finally {
      setSaving(false);
    }
  };

  const update = (patch) => {
    setFormData((prev) => {
      const next = { ...prev, ...patch };
      // Phase 19.0 — when admin changes startTime and endTime is still
      // a +15 distance from the prior startTime (default gap), auto-advance
      // endTime to maintain the +15 default. Admin-edited endTime where
      // the gap is anything other than +15 is preserved.
      if (Object.prototype.hasOwnProperty.call(patch, 'startTime') && !Object.prototype.hasOwnProperty.call(patch, 'endTime')) {
        const prevStartIdx = TIME_SLOTS.indexOf(prev.startTime);
        const prevEndIdx = TIME_SLOTS.indexOf(prev.endTime);
        if (prevStartIdx >= 0 && prevEndIdx === prevStartIdx + 1) {
          // endTime was at +15 (default gap); auto-advance to maintain
          const nextStartIdx = TIME_SLOTS.indexOf(next.startTime);
          if (nextStartIdx >= 0) {
            next.endTime = TIME_SLOTS[nextStartIdx + 1] || next.startTime;
          }
        }
      }
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="appt-form-modal-title" onClick={onClose} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
      <div className="bg-[var(--bg-surface)] border border-[var(--bd)] rounded-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()} data-testid="appointment-form-modal">
        <div className="px-5 py-4 border-b border-[var(--bd)] flex items-center justify-between">
          <h3 id="appt-form-modal-title" className="text-sm font-bold text-[var(--tx-heading)] uppercase tracking-wider">
            {mode === 'edit' ? 'แก้ไขนัดหมาย' : 'สร้างนัดหมาย'}
          </h3>
          <button onClick={onClose} className="text-[var(--tx-muted)] hover:text-[var(--tx-primary)]" aria-label="ปิด"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          {/* Customer (locked or picker) */}
          <div data-field="apptCustomer">
            <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">ลูกค้า *</label>
            {lockedCustomer || formData.customerName ? (
              <div className={`flex items-center justify-between px-3 py-2 rounded-lg border ${isDark ? 'bg-sky-900/10 border-sky-700/30' : 'bg-sky-50 border-sky-200'}`}>
                {/* Phase 15.7-septies (2026-04-29) — clickable customer name
                    that opens a NEW BROWSER TAB to the customer detail page.
                    Replaces the Phase 15.7-sexies in-page-redirect callback.
                    User: "เปิด Tab ของ Browser ใหม่... ไม่ใช่ redirection".
                    Gated by `enableCustomerLink` prop so CustomerDetailView's
                    own modal still renders static text. */}
                {enableCustomerLink && formData.customerId ? (
                  <a
                    href={`/?backend=1&customer=${encodeURIComponent(formData.customerId)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => { e.stopPropagation(); }}
                    className={`text-xs font-bold underline-offset-4 hover:underline transition-colors ${isDark ? 'text-sky-300 hover:text-sky-200' : 'text-sky-700 hover:text-sky-900'} text-left`}
                    title="เปิดหน้าข้อมูลลูกค้าในแท็บใหม่"
                    data-testid="appt-modal-open-customer"
                  >
                    {formData.customerName || '-'} {formData.customerHN && <span className="font-mono text-[var(--tx-muted)]">{formData.customerHN}</span>}
                  </a>
                ) : (
                  <span className="text-xs text-[var(--tx-heading)] font-bold">
                    {formData.customerName || '-'} {formData.customerHN && <span className="font-mono text-[var(--tx-muted)]">{formData.customerHN}</span>}
                  </span>
                )}
                {!lockedCustomer && (
                  <button onClick={() => update({ customerId:'', customerName:'', customerHN:'' })} className="text-[var(--tx-muted)] hover:text-red-400" aria-label="ล้าง"><X size={14}/></button>
                )}
              </div>
            ) : (
              <div>
                <input type="text" value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} placeholder="ค้นหาชื่อ / HN / เบอร์..."
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] placeholder:text-[var(--tx-muted)] focus:outline-none focus:ring-1 focus:ring-sky-500" />
                {filteredCustomers.length > 0 && (
                  <div className="mt-1 max-h-48 overflow-y-auto border border-[var(--bd)] rounded-lg bg-[var(--bg-card)]">
                    {filteredCustomers.map(c => {
                      const name = `${c.patientData?.prefix||''} ${c.patientData?.firstName||''} ${c.patientData?.lastName||''}`.trim();
                      return (
                        <button key={c.id} onClick={() => { update({ customerId: c.proClinicId || c.id, customerName: name, customerHN: c.proClinicHN || '' }); setCustomerSearch(''); }}
                          className="w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--bg-hover)] transition-colors flex items-center justify-between">
                          <span className="text-[var(--tx-secondary)]">{name}</span>
                          <span className="text-xs font-mono text-[var(--tx-muted)]">{c.proClinicHN || ''}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
          {/* Date + Time */}
          <div className="grid grid-cols-3 gap-3">
            <div data-field="apptDate">
              <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">วันที่ *</label>
              <DateField value={formData.date} onChange={v => update({ date: v })}
                fieldClassName="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] focus:outline-none focus:ring-1 focus:ring-sky-500" />
            </div>
            <div data-field="apptStartTime">
              <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">เริ่ม *</label>
              <select value={formData.startTime} onChange={e => update({ startTime: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] focus:outline-none focus:ring-1 focus:ring-sky-500">
                {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">สิ้นสุด</label>
              <select value={formData.endTime} onChange={e => update({ endTime: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] focus:outline-none focus:ring-1 focus:ring-sky-500">
                {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          {/* Appointment Type */}
          <div>
            <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">ประเภทนัดหมาย</label>
            <div className="flex gap-3">
              {APPOINTMENT_TYPES.map(t => (
                <label key={t.value} className="flex items-center gap-1.5 cursor-pointer text-xs">
                  <input type="radio" checked={formData.appointmentType === t.value} onChange={() => update({ appointmentType: t.value })} className="accent-sky-500" />{t.label}
                </label>
              ))}
            </div>
          </div>
          {/* Advisor + Doctor + Room */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">ที่ปรึกษา</label>
              {/* Phase 15.7-octies (2026-04-29) — advisor dropdown shows
                  merged พนักงาน + ผู้ช่วย at the current branch, with
                  composed names from listAllSellers. */}
              <select value={formData.advisorId} onChange={e => { const s = advisorOptions.find(x => String(x.id) === e.target.value); update({ advisorId: e.target.value, advisorName: s?.name || '' }); }}
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] focus:outline-none focus:ring-1 focus:ring-sky-500"
                data-testid="advisor-select">
                <option value="">ไม่ระบุ</option>
                {advisorOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">แพทย์</label>
              <select value={formData.doctorId} onChange={e => { const d = doctors.find(x => String(x.id) === e.target.value); update({ doctorId: e.target.value, doctorName: d?.name || '' }); }}
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] focus:outline-none focus:ring-1 focus:ring-sky-500">
                <option value="">ไม่ระบุ</option>
                {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">ห้องตรวจ</label>
              <select
                aria-label="ห้องตรวจ"
                value={formData.roomId || ''}
                onChange={e => {
                  const id = e.target.value;
                  const room = examRooms.find(r => (r.examRoomId || r.id) === id);
                  update({ roomId: id, roomName: room ? room.name : '' });
                }}
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] focus:outline-none focus:ring-1 focus:ring-sky-500">
                <option value="">— ไม่ระบุห้อง —</option>
                {examRooms.map(r => <option key={r.examRoomId || r.id} value={r.examRoomId || r.id}>{r.name}</option>)}
                {/* Edit-mode hint: appt has stale roomId (e.g. room deleted) */}
                {formData.roomId && !examRooms.find(r => (r.examRoomId || r.id) === formData.roomId) && (
                  <option value={formData.roomId}>(ห้องที่ลบแล้ว: {formData.roomName || formData.roomId})</option>
                )}
              </select>
            </div>
          </div>
          {/* Assistants (multi-select chips) — Phase 15.7 (2026-04-28):
              picker shows ALL doctors + assistants (no position filter);
              max-5 enforced on SELECTION only. User-confirmed wording. */}
          <div>
            <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">ผู้ช่วยแพทย์ (สูงสุด 5 คน)</label>
            {assistants.length === 0 ? (
              <p className="text-[10px] text-amber-400 italic">
                ยังไม่มีรายชื่อใน be_doctors — เพิ่มแพทย์/ผู้ช่วยแพทย์ในหน้า "แพทย์ &amp; ผู้ช่วย"
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {assistants.map(d => {
                  const checked = formData.assistantIds?.includes(String(d.id)) || false;
                  return (
                    <label key={d.id} className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg cursor-pointer border transition-all ${checked
                      ? (isDark ? 'bg-sky-900/30 border-sky-700/40 text-sky-400' : 'bg-sky-50 border-sky-200 text-sky-700')
                      : 'bg-[var(--bg-input)] border-[var(--bd)] text-[var(--tx-muted)]'}`}>
                      <input type="checkbox" checked={checked}
                        onChange={e => {
                          const id = String(d.id);
                          update({ assistantIds: e.target.checked
                            ? [...(formData.assistantIds || []), id].slice(0, 5)
                            : (formData.assistantIds || []).filter(x => x !== id),
                          });
                        }} className="accent-sky-500 w-3 h-3" />
                      {d.name}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
          {/* Channel + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">ช่องทางนัดหมาย</label>
              <select value={formData.channel} onChange={e => update({ channel: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] focus:outline-none focus:ring-1 focus:ring-sky-500">
                <option value="">ไม่ระบุ</option>
                {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">สถานะ</label>
              <select value={formData.status} onChange={e => update({ status: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] focus:outline-none focus:ring-1 focus:ring-sky-500">
                {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
          {/* AppointmentTo + Color */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">นัดมาเพื่อ</label>
              <textarea value={formData.appointmentTo} onChange={e => update({ appointmentTo: e.target.value })} rows={2} placeholder="botox, filler..."
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] placeholder:text-[var(--tx-muted)] resize-none focus:outline-none focus:ring-1 focus:ring-sky-500" />
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">สีนัดหมาย</label>
              <select value={formData.appointmentColor} onChange={e => update({ appointmentColor: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] focus:outline-none focus:ring-1 focus:ring-sky-500">
                <option value="">ไม่ระบุ</option>
                {APPT_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          {/* Location + Expected sales */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">สถานที่นัด</label>
              {/* Phase 15.7-octies (2026-04-29) — locked to current branch.
                  User: "ให้ล็อคเป็นสาขาที่สร้างหรือแก้ไขนัดนั้นๆเลย".
                  Pre-fix was a freeform input which let admin type any
                  string (creating per-appt drift across the dataset).
                  Now reads from useSelectedBranch() + resolveBranchName.
                  Saved on the appt doc as `location: currentBranchName`
                  in the build-payload step (V20 multi-branch alignment). */}
              <div
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--bd)] text-xs text-[var(--tx-secondary)] flex items-center gap-2 cursor-not-allowed"
                title={`ล็อคเป็นสาขาที่กำลังใช้งาน (${currentBranchName})`}
                data-testid="appt-location-locked"
              >
                <span className="text-[var(--tx-muted)]">🔒</span>
                <span className="font-bold">{currentBranchName}</span>
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">ยอดขายที่คาดหวัง</label>
              <input type="number" value={formData.expectedSales} onChange={e => update({ expectedSales: e.target.value })} placeholder="0"
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] placeholder:text-[var(--tx-muted)] focus:outline-none focus:ring-1 focus:ring-sky-500" />
            </div>
          </div>
          {/* Recurring (create only) */}
          {mode === 'create' && (
            <div>
              <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">ตัวเลือกนัดหมาย</label>
              <div className="flex gap-3 mb-2">
                <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                  <input type="radio" checked={formData.recurringOption === 'once'} onChange={() => update({ recurringOption: 'once' })} className="accent-sky-500" />นัดครั้งเดียว
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                  <input type="radio" checked={formData.recurringOption === 'multiple'} onChange={() => update({ recurringOption: 'multiple' })} className="accent-sky-500" />นัดหลายครั้ง
                </label>
              </div>
              {formData.recurringOption === 'multiple' && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-[var(--tx-muted)]">ทุก</span>
                  <input type="number" value={formData.recurringInterval} onChange={e => update({ recurringInterval: e.target.value })} min="1"
                    className="w-16 px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-center text-[var(--tx-primary)]" />
                  <select value={formData.recurringUnit} onChange={e => update({ recurringUnit: e.target.value })}
                    className="px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)]">
                    <option value="วัน">วัน</option>
                    <option value="เดือน">เดือน</option>
                  </select>
                  <span className="text-[var(--tx-muted)]">จำนวน</span>
                  <input type="number" value={formData.recurringTimes} onChange={e => update({ recurringTimes: e.target.value })} min="1"
                    className="w-16 px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-center text-[var(--tx-primary)]" />
                  <span className="text-[var(--tx-muted)]">ครั้ง</span>
                </div>
              )}
            </div>
          )}
          {/* Preparation */}
          <div>
            <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">การเตรียมตัว</label>
            <textarea value={formData.preparation} onChange={e => update({ preparation: e.target.value })} rows={2} placeholder="งดทาครีม, งดกินแอสไพริน..."
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] resize-none placeholder:text-[var(--tx-muted)] focus:outline-none focus:ring-1 focus:ring-sky-500" />
          </div>
          {/* Notes (2 types) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">หมายเหตุ (แจ้งลูกค้า)</label>
              <textarea value={formData.customerNote} onChange={e => update({ customerNote: e.target.value })} rows={2}
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] resize-none focus:outline-none focus:ring-1 focus:ring-sky-500" />
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">โน้ต (สำหรับคลินิก)</label>
              <textarea value={formData.notes} onChange={e => update({ notes: e.target.value })} rows={2}
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] resize-none focus:outline-none focus:ring-1 focus:ring-sky-500" />
            </div>
          </div>
          {/* LINE notify */}
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={formData.lineNotify || false} onChange={e => update({ lineNotify: e.target.checked })} className="accent-emerald-500" />
            แจ้งเตือนนัดหมายทาง LINE
          </label>
          {error && <div className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={12}/>{error}</div>}
        </div>
        <div className="px-5 py-4 border-t border-[var(--bd)] flex items-center gap-2">
          {/* Phase 15.7-sexies (2026-04-28) — delete button (edit mode + onDelete provided).
              Pinned to LEFT (visually + semantically distinct from the right-side
              save/cancel pair) so admin doesn't accidentally hit it. Confirm dialog
              + delete + close are the caller's responsibility. */}
          {mode === 'edit' && onDelete && (
            <button
              onClick={async () => {
                if (saving) return;
                if (!window.confirm('ลบนัดหมายนี้? การลบจะถาวร — ไม่สามารถกู้คืนได้')) return;
                try {
                  setSaving(true);
                  await onDelete();
                } catch (e) {
                  setError(e?.message || 'ลบนัดหมายไม่สำเร็จ');
                  setSaving(false);
                }
              }}
              disabled={saving}
              data-testid="appointment-form-delete"
              className="px-3 py-2 rounded-lg text-xs font-bold bg-red-900/20 border border-red-700/40 text-red-400 hover:bg-red-900/30 hover:text-red-300 transition-all disabled:opacity-50 flex items-center gap-1.5"
              title="ลบนัดหมายนี้"
            >
              <Trash2 size={12} /> ลบนัดหมาย
            </button>
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-bold bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-[var(--tx-primary)] transition-all">ยกเลิก</button>
          <button onClick={handleSave} disabled={saving}
            data-testid="appointment-form-save"
            className="px-4 py-2 rounded-lg text-xs font-bold bg-sky-700 text-white hover:bg-sky-600 transition-all disabled:opacity-50 flex items-center gap-1.5">
            {saving ? <Loader2 size={12} className="animate-spin"/> : <CheckCircle2 size={12}/>}
            {mode === 'edit' ? 'บันทึก' : 'สร้างนัดหมาย'}
          </button>
        </div>
      </div>
    </div>
  );
}
