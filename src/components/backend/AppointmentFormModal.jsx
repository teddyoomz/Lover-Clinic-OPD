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
  // Phase 24.0-vicies-novies (2026-05-07) — "ส่งลิ้งค์ลูกค้า" button icons.
  Send, QrCode,
} from 'lucide-react';
// Phase 15.7-septies (2026-04-29) — open customer detail in a NEW BROWSER TAB
// instead of in-page redirect. User: "เปิด Tab ของ Browser ใหม่... ไม่ใช่
// redirection หน้าเดิมไป มันใช้ยาก".
import { openCustomerInNewTab } from '../../lib/customerNavigation.js';
// Task 9 (LINE OA Appointment Reminder, 2026-05-15) — shared customer
// name + per-branch LINE badge (LR-4 lock).
import { CustomerOption } from '../CustomerOption.jsx';
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
// Phase 21.0-ter (2026-05-06 EOD) — embedded deposit subform routes through
// the same atomic pair-helper DepositPanel uses. V12 single-writer lock
// preserved: AppointmentFormModal (this file, when type='deposit-booking')
// + DepositPanel both call createDepositBookingPair → identical paired
// (be_deposits + be_appointments) shape, no drift possible.
import {
  createDepositBookingPair,
  // Phase 24.0-vicies-novies (2026-05-07) — provision opd_sessions + stamp
  // linkedOpdSessionId on the existing customer-later appointment + linked
  // deposit so the bookings auto-attach when admin clicks "บันทึกลง OPD".
  provisionOpdLinkForBookingPair,
} from '../../lib/appointmentDepositBatch.js';
// Phase 24.0-vicies-novies (2026-05-07) — share-link modal (URL + QR + copy).
import SendCustomerLinkModal from './SendCustomerLinkModal.jsx';
import { useBranchAwareListener } from '../../hooks/useBranchAwareListener.js';
import { isDateHoliday, DAY_OF_WEEK_LABELS } from '../../lib/holidayValidation.js';
import { checkAppointmentCollision, TIME_SLOTS } from '../../lib/staffScheduleValidation.js';
import {
  APPOINTMENT_TYPES,
  APPOINTMENT_TYPE_VALUES,
  DEFAULT_APPOINTMENT_TYPE,
  resolveAppointmentTypeLabel,
} from '../../lib/appointmentTypes.js';
import { thaiTodayISO } from '../../utils.js';
import DateField from '../DateField.jsx';
import { useSelectedBranch, resolveBranchName, useEffectiveClinicSettings } from '../../lib/BranchContext.jsx';
import { filterDoctorsByBranch } from '../../lib/branchScopeUtils.js';
// V53 (2026-05-08, BS-12) — per-branch openHours filter the time-picker dropdowns
// + warn admin when editing a legacy appt whose time falls outside current open hours.
import {
  getVisibleTimeSlotsForDate,
  getOpenHoursForDate,
  isTimeOutsideOpenHours,
} from '../../lib/scheduleFilterUtils.js';

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
    // Phase 24.0-terdecies (2026-05-06) — "เลือกลูกค้าภายหลัง" mode: when
    // pickLater is true, customerId can stay '' and customerNameTemp +
    // customerPhoneTemp become required instead. The picker UI swaps to
    // the inline name+phone inputs. customerName falls through to the
    // temp name on save so existing reports / lists render the temp.
    pickLater: false,
    customerNameTemp: '',
    customerPhoneTemp: '',
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
    // Phase 21.0-ter (2026-05-06 EOD) — embedded deposit subform fields,
    // active only when appointmentType === 'deposit-booking'. Routed through
    // createDepositBookingPair on save → atomic paired (be_deposits +
    // be_appointments) write. Same helper DepositPanel uses → single-writer
    // V12 lock preserved.
    depositAmount: '',
    depositPaymentChannel: 'เงินสด',
    depositPaymentDate: thaiTodayISO(),
    depositNote: '',
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
 * @param {string|null} [props.lockedAppointmentType] — Phase 21.0 (2026-05-06)
 *        When set to one of APPOINTMENT_TYPE_VALUES, the appointment-type
 *        radio row is replaced with a static read-only chip showing the
 *        canonical Thai label, and the save payload forces this value.
 *        Used by the new นัดหมาย sub-tabs (AppointmentCalendarView) so admin
 *        can't miscategorize while inside a typed view.
 *
 *        Special case `lockedAppointmentType === 'deposit-booking'` +
 *        mode='create': renders an embedded deposit subform (amount +
 *        paymentChannel + paymentDate + note) and routes save to
 *        createDepositBookingPair → atomic paired (be_deposits +
 *        be_appointments) write. Admin can create the full deposit-
 *        booking pair from this single modal. (Phase 21.0-ter, 2026-05-06
 *        EOD — replaces the prior "redirect to Finance.มัดจำ" UX per
 *        user directive "ทำให้สร้างได้ตั้งแต่หน้าจองมัดจำเลย ... ก็มีช่อง
 *        ให้กรอกรายละเอียดการมัดจำไปด้วยไง ง่ายๆ".)
 *
 *        When omitted (legacy callers like CustomerDetailView), behaves
 *        as today (admin picks any of 4 types from radio).
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
  lockedAppointmentType = null,
  // Phase 25.0c (2026-05-09) — Walk-in flow lock. When set to one of CHANNELS,
  // the channel field is replaced by a static read-only chip (mirror
  // lockedAppointmentType UX) + the saved doc carries `channel: lockedChannel`.
  // Used by AdminDashboard kiosk "บันทึกลง OPD" to lock channel='Walk-in'.
  lockedChannel = null,
  // Phase 24.0-noniesdecies (2026-05-06) — when set, the modal creates an
  // appointment for an EXISTING deposit (instead of minting a new pair).
  // DepositPanel "+ สร้างนัด" button wires this. Save path uses
  // createAppointmentForExistingDeposit to atomically write be_appointments
  // + update the deposit doc (hasAppointment=true + linkedAppointmentId +
  // appointment metadata).
  existingDepositId = '',
}) {
  const isDark = theme !== 'light';
  // Phase 14.7.H follow-up A — branch-aware appointment writes.
  // Phase 15.7-octies (2026-04-29) — also pull `branches` so we can render
  // the locked location field with the human-readable branch name + load
  // listAllSellers with the branch filter for the advisor dropdown.
  const { branchId: selectedBranchId, branches } = useSelectedBranch();
  const currentBranchName = resolveBranchName(selectedBranchId, branches) || (selectedBranchId === 'main' ? 'สาขาหลัก (main)' : selectedBranchId || 'สาขาหลัก');

  // V53 (BS-12) — branch-reactive merged settings. Modal isn't passed
  // clinicSettings as a prop (parent calls clinic-level fields rarely);
  // hook still works because mergeBranchIntoClinic merges branch.settings
  // when clinicSettings is undefined. Re-renders on branch + form.date change.
  const cs = useEffectiveClinicSettings(undefined);

  // Phase 21.0 (2026-05-06) — validate lockedAppointmentType prop. Unknown
  // values fall through to null (no lock applied). isLockedDepositType
  // gates the deposit-redirect banner + save-button hiding.
  const safeLockedType = APPOINTMENT_TYPE_VALUES.includes(lockedAppointmentType)
    ? lockedAppointmentType
    : null;
  const isLockedDepositType = safeLockedType === 'deposit-booking';

  // Phase 25.0c (2026-05-09) — validate lockedChannel prop. Mirror of
  // safeLockedType pattern. Only values in the CHANNELS list are honored;
  // anything else falls through to null (no lock).
  const safeLockedChannel = CHANNELS.includes(lockedChannel) ? lockedChannel : null;

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
        // Phase 24.0-terdecies — restore pickLater + temp fields on edit.
        // pickLater is implicit: TRUE iff customerId is empty AND a temp
        // name/phone is present (legacy unlinked appts also re-hydrate).
        pickLater: !appt.customerId && !!(appt.customerNameTemp || appt.customerPhoneTemp),
        customerNameTemp: appt.customerNameTemp || '',
        customerPhoneTemp: appt.customerPhoneTemp || '',
        // Phase 21.0 — lockedAppointmentType wins over appt.appointmentType
        // when set (defensive: prevents drift between sub-tab + appt type
        // mid-edit; admin can't relocate an appt to a different type by
        // editing from inside a typed sub-tab).
        appointmentType: safeLockedType || appt.appointmentType || DEFAULT_APPOINTMENT_TYPE,
        advisorId: appt.advisorId || '',
        advisorName: appt.advisorName || '',
        doctorId: appt.doctorId || '',
        doctorName: appt.doctorName || '',
        assistantIds: appt.assistantIds || [],
        roomId: appt.roomId || '',  // Phase 18.0
        roomName: appt.roomName || '',
        // Phase 25.0c (2026-05-09) — lockedChannel wins over appt.channel
        // (defensive: prevents channel drift on edit from inside a locked
        // context like the Walk-in OPD-save flow).
        channel: safeLockedChannel || appt.channel || '',
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
      // Phase 21.0 — pre-fill type from lock so payload + UI start in sync.
      appointmentType: safeLockedType || DEFAULT_APPOINTMENT_TYPE,
      // Phase 25.0c — pre-fill channel from lock so payload + UI start in sync.
      ...(safeLockedChannel ? { channel: safeLockedChannel } : {}),
      ...cInit,
    });
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  // Phase 24.0-vicies-novies (2026-05-07) — send-link modal state. Holds the
  // resolved {sessionId, url, sessionName, alreadyProvisioned} after admin
  // clicks "ส่งลิ้งค์ลูกค้า" on a customer-later appointment in edit mode.
  const [sendLinkModal, setSendLinkModal] = useState(null);
  const [sendLinkBusy, setSendLinkBusy] = useState(false);

  // V53 (BS-12) — visible time-slot list filtered by branch openHours for
  // the currently selected date. Modal pickers should ONLY offer in-range
  // slots; legacy edits still see the full 56 list because the warning hint
  // below renders when current value is outside (admin can pick a new
  // valid slot from the filtered list). Re-fires when admin changes the
  // date inside the modal OR switches branch on the top-right selector.
  const visibleTime = useMemo(
    () => getVisibleTimeSlotsForDate({
      dateISO: formData.date,
      mergedSettings: cs,
      allTimeSlots: TIME_SLOTS,
    }),
    [formData.date, cs?.openHoursMonFri, cs?.openHoursSatSun],
  );
  const visibleSlots = visibleTime.slots;
  const isClosedDay = visibleTime.isClosed;

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
    // Phase 24.0-terdecies — pickLater branch: customerId stays '' but the
    // booking-time temp name + phone become required. Both must be filled
    // (not whitespace) so the appt has a contactable identity even before
    // a real customer doc is linked.
    if (formData.pickLater) {
      const tempName = String(formData.customerNameTemp || '').trim();
      const tempPhone = String(formData.customerPhoneTemp || '').trim();
      if (!tempName) { scrollToFormError('apptCustomerNameTemp', 'กรุณากรอกชื่อลูกค้า'); return; }
      if (!tempPhone) { scrollToFormError('apptCustomerPhoneTemp', 'กรุณากรอกเบอร์โทรลูกค้า'); return; }
    } else if (!formData.customerId) {
      scrollToFormError('apptCustomer', 'กรุณาเลือกลูกค้า หรือเปิดโหมด "เลือกลูกค้าภายหลัง"'); return;
    }
    if (!formData.date) { scrollToFormError('apptDate', 'กรุณาเลือกวันที่'); return; }
    if (!formData.startTime) { scrollToFormError('apptStartTime', 'กรุณาเลือกเวลาเริ่ม'); return; }
    // Phase 21.0-ter (2026-05-06 EOD) — when admin creates a deposit-booking
    // appointment, additional deposit fields are required. The save handler
    // routes to createDepositBookingPair → atomic paired write of be_deposits
    // + be_appointments. Edit mode (mode === 'edit') skips this guard
    // because edits only touch appointment metadata, not the deposit doc.
    const isCreatingDepositBooking = isLockedDepositType && mode === 'create';
    if (isCreatingDepositBooking) {
      const amt = parseFloat(formData.depositAmount);
      if (!amt || amt <= 0) {
        scrollToFormError('depositAmount', 'กรุณาระบุยอดมัดจำมากกว่า 0');
        return;
      }
      if (!formData.depositPaymentChannel) {
        scrollToFormError('depositPaymentChannel', 'กรุณาเลือกช่องทางชำระเงิน');
        return;
      }
      if (!formData.depositPaymentDate) {
        scrollToFormError('depositPaymentDate', 'กรุณาเลือกวันที่ชำระ');
        return;
      }
    }

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
      // Phase 24.0-terdecies — pickLater branch: customerId stays '' but
      // customerName falls through to the typed-in temp name so legacy
      // readers (calendar, lists, reports) still render an identifiable
      // label. Temp fields ALSO ride on the payload for forensic trail.
      const tempName = String(formData.customerNameTemp || '').trim();
      const tempPhone = String(formData.customerPhoneTemp || '').trim();
      const payload = {
        customerId: formData.pickLater ? '' : formData.customerId,
        customerName: formData.pickLater ? tempName : formData.customerName,
        customerHN: formData.pickLater ? '' : formData.customerHN,
        customerNameTemp: tempName,
        customerPhoneTemp: tempPhone,
        date: formData.date, startTime: formData.startTime, endTime: formData.endTime || formData.startTime,
        // Phase 21.0 — lockedAppointmentType wins. safeLockedType is always
        // one of APPOINTMENT_TYPE_VALUES when set; falls through to formData
        // / DEFAULT only when no lock applies.
        appointmentType: safeLockedType || formData.appointmentType || DEFAULT_APPOINTMENT_TYPE,
        advisorId: formData.advisorId || '', advisorName: formData.advisorName || '',
        doctorId: formData.doctorId, doctorName: formData.doctorName,
        assistantIds: assistantIdsForSave,
        assistantNames: assistantNamesForSave,
        roomId: formData.roomId || '',  // Phase 18.0 — FK to be_exam_rooms
        roomName: formData.roomName,    // snapshot (deletion-safe historical display)
        // Phase 25.0c (2026-05-09) — lockedChannel wins over formData.channel
        // (mirror of safeLockedType pattern at line 581).
        channel: safeLockedChannel || formData.channel,
        appointmentTo: formData.appointmentTo,
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
        // Phase 24.0-septiesdecies + octiesdecies (2026-05-06) — TWO cascades
        // when editing a deposit-booking appointment that has a linkedDepositId:
        //
        //   (1) Customer-attach (septiesdecies): when admin attaches a real
        //       customer to a customer-later appt, propagate
        //       customerId/customerName/customerHN to the linked deposit.
        //       User: "ในกรณีที่เมื่อกู Edit ผูกแล้วเนี่ย ตรง tab การเงิน
        //       จะต้องเอาเงินที่มัดจำไว้ไปผูกกับลูกค้าที่กู edit ... โดยอัตโนมัติ".
        //
        //   (2) Appointment-metadata sync (octiesdecies): on EVERY edit,
        //       sync purpose/appointmentTo/date/startTime/endTime/doctor/
        //       room/etc to the linked deposit's embedded `appointment`
        //       object so DepositPanel "มัดจำสำหรับ" column reflects
        //       admin's edits without manual reload. User: "พอไป edit
        //       ตรงนัดหมายเปลี่ยนเหตุผล ตรงตารางหน้าการเงินมันไม่เปลี่ยนตาม".
        //
        // Both best-effort: failure logs but doesn't block the appointment
        // update.
        try {
          const linkedDepositId = appt.linkedDepositId
            || appt.spawnedFromDepositId
            || '';
          if (linkedDepositId) {
            const mod = await import('../../lib/appointmentDepositBatch.js');
            // (1) Customer-attach cascade — gated on transition.
            const wasUnlinked = !appt.customerId
              || !!(appt.customerNameTemp || appt.customerPhoneTemp);
            const isNowLinked = !!payload.customerId && !formData.pickLater;
            if (wasUnlinked && isNowLinked && typeof mod.attachCustomerToLinkedDeposit === 'function') {
              await mod.attachCustomerToLinkedDeposit(linkedDepositId, {
                customerId: payload.customerId,
                customerName: payload.customerName,
                customerHN: payload.customerHN || '',
              });
            }
            // (2) Appointment-metadata sync — fires every edit.
            if (typeof mod.syncAppointmentToLinkedDeposit === 'function') {
              await mod.syncAppointmentToLinkedDeposit(linkedDepositId, {
                date: payload.date,
                startTime: payload.startTime,
                endTime: payload.endTime,
                doctorId: payload.doctorId,
                doctorName: payload.doctorName,
                advisorId: payload.advisorId,
                advisorName: payload.advisorName,
                assistantIds: payload.assistantIds,
                assistantNames: payload.assistantNames,
                roomId: payload.roomId,
                roomName: payload.roomName,
                channel: payload.channel,
                // The deposit's embedded `appointment.purpose` is what
                // DepositPanel "มัดจำสำหรับ" column reads — keep it
                // mirrored to the appointment's appointmentTo (which is
                // what AppointmentFormModal writes for visit purpose).
                purpose: payload.appointmentTo,
                appointmentTo: payload.appointmentTo,
                note: payload.notes,
                color: payload.appointmentColor,
                lineNotify: payload.lineNotify,
              });
            }
          }
        } catch (cascadeErr) {
          console.warn('[AppointmentFormModal] linked-deposit cascade failed (best-effort):', cascadeErr);
        }
      } else if (isCreatingDepositBooking && existingDepositId) {
        // Phase 24.0-noniesdecies (2026-05-06) — "+ สร้างนัด" path: deposit
        // already exists in be_deposits (admin clicked the button on a
        // Finance.มัดจำ row that had hasAppointment=false). Create a
        // be_appointments doc + atomically update the existing deposit
        // (hasAppointment=true + linkedAppointmentId + appointment metadata)
        // via createAppointmentForExistingDeposit. Distinct from the pair-
        // helper which mints BOTH new docs.
        const { createAppointmentForExistingDeposit } = await import('../../lib/appointmentDepositBatch.js');
        await createAppointmentForExistingDeposit(existingDepositId, {
          ...payload,
          // Force the appointment type lock so the new appt appears in the
          // จองมัดจำ sub-tab regardless of any stale formData.appointmentType.
          appointmentType: 'deposit-booking',
        });
      } else if (isCreatingDepositBooking) {
        // Phase 21.0-ter (2026-05-06 EOD) — atomic paired write via the
        // SAME helper DepositPanel uses (V12 single-writer lock). The
        // pair-helper handles ID minting (DEP-{ts} + BA-{ts}-{rand}),
        // cross-link fields (linkedAppointmentId / linkedDepositId), and
        // branchId stamping on both docs. Recurring multiplier is NOT
        // supported here — deposit-bookings are single-occurrence by design
        // (pre-paid for ONE visit). If admin needs recurring deposits,
        // they should create them individually.
        // Phase 24.0-septiesdecies (2026-05-06) — pickLater branch in
        // deposit-booking creates: customerId stays '' but customerName
        // falls through to tempName so existing readers (Finance grid,
        // appointment grid card) render an identifiable label. Temp fields
        // also ride on the deposit + appointment payloads via the pair
        // helper for forensic trail + later-link reconciliation.
        const depositData = {
          customerId: formData.pickLater ? '' : formData.customerId,
          customerName: formData.pickLater ? tempName : formData.customerName,
          customerHN: formData.pickLater ? '' : formData.customerHN,
          customerNameTemp: tempName,
          customerPhoneTemp: tempPhone,
          amount: parseFloat(formData.depositAmount) || 0,
          paymentChannel: formData.depositPaymentChannel,
          paymentDate: formData.depositPaymentDate,
          paymentTime: '',
          refNo: '',
          // Sellers — auto-include the advisor as a single 100% seller when
          // set; otherwise empty (admin can edit in DepositPanel later).
          sellers: formData.advisorId
            ? [{
                id: formData.advisorId,
                name: formData.advisorName || '',
                percent: 100,
                total: parseFloat(formData.depositAmount) || 0,
              }]
            : [],
          customerSource: '',
          sourceDetail: '',
          note: formData.depositNote || '',
          hasAppointment: true,
          // The embedded appointment metadata mirrors what DepositPanel
          // builds for createDeposit. createDepositBookingPair uses this
          // to hydrate the be_appointments doc with date / startTime /
          // doctor / room / etc.
          appointment: {
            type: 'deposit-booking',
            option: 'once',
            date: formData.date,
            startTime: formData.startTime,
            endTime: formData.endTime || formData.startTime,
            doctorId: formData.doctorId,
            doctorName: formData.doctorName,
            assistantIds: assistantIdsForSave,
            assistantNames: assistantNamesForSave,
            roomId: formData.roomId || '',
            roomName: formData.roomName,
            channel: formData.channel,
            purpose: formData.appointmentTo,
            note: formData.notes,
            color: formData.appointmentColor || '',
            lineNotify: !!formData.lineNotify,
          },
          paymentEvidenceUrl: '',
          paymentEvidencePath: '',
          branchId: selectedBranchId,
        };
        await createDepositBookingPair({ depositData, branchId: selectedBranchId });
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
          {/* Customer (locked or picker or pick-later) */}
          <div data-field="apptCustomer">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider">ลูกค้า *</label>
              {/* Phase 24.0-terdecies (2026-05-06) — "เลือกลูกค้าภายหลัง" toggle.
                  Hidden when lockedCustomer is set (CustomerDetailView callsite
                  always has a real customer). When ON, picker UI swaps to a pair
                  of name + phone inputs; customerId stays '' and the typed temp
                  name+phone persist on be_appointments.customerNameTemp /
                  customerPhoneTemp. Admin can later attach a real customer doc
                  via the Phase 24.0-Z attach flow. */}
              {!lockedCustomer && (
                <label className="flex items-center gap-1.5 text-[10px] font-bold text-[var(--tx-muted)] cursor-pointer select-none" data-testid="appt-modal-pick-later-toggle">
                  <input
                    type="checkbox"
                    checked={!!formData.pickLater}
                    onChange={e => update({
                      pickLater: e.target.checked,
                      // Toggling ON clears the picked customer so the form stays
                      // in a single source of truth (either picker OR temp).
                      ...(e.target.checked ? { customerId: '', customerName: '', customerHN: '' } : {
                        customerNameTemp: '',
                        customerPhoneTemp: '',
                      }),
                    })}
                    className="w-3.5 h-3.5 accent-amber-500"
                    data-testid="appt-modal-pick-later-checkbox"
                  />
                  เลือกลูกค้าภายหลัง
                </label>
              )}
            </div>
            {formData.pickLater ? (
              <div className={`grid grid-cols-2 gap-2 px-3 py-2.5 rounded-lg border ${isDark ? 'bg-amber-900/10 border-amber-700/40' : 'bg-amber-50 border-amber-300'}`}>
                <div data-field="apptCustomerNameTemp">
                  <label className="text-[10px] font-bold text-[var(--tx-muted)] block mb-1">ชื่อลูกค้า *</label>
                  <input
                    type="text"
                    value={formData.customerNameTemp}
                    onChange={e => update({ customerNameTemp: e.target.value })}
                    placeholder="เช่น คุณสมชาย ใจดี"
                    maxLength={120}
                    data-testid="appt-modal-customer-name-temp"
                    className="w-full px-2.5 py-1.5 rounded bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] placeholder:text-[var(--tx-muted)] focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
                <div data-field="apptCustomerPhoneTemp">
                  <label className="text-[10px] font-bold text-[var(--tx-muted)] block mb-1">เบอร์โทร *</label>
                  <input
                    type="tel"
                    inputMode="tel"
                    value={formData.customerPhoneTemp}
                    onChange={e => update({ customerPhoneTemp: e.target.value })}
                    placeholder="08x-xxx-xxxx"
                    maxLength={20}
                    data-testid="appt-modal-customer-phone-temp"
                    className="w-full px-2.5 py-1.5 rounded bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] placeholder:text-[var(--tx-muted)] focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
                  />
                </div>
                <p className="col-span-2 text-[10px] text-[var(--tx-muted)] italic mt-0.5">นัดถูกบันทึกโดยยังไม่ผูกลูกค้า — สามารถผูกข้อมูลลูกค้าจริงภายหลังได้</p>
                {/* Phase 24.0-vicies-novies (2026-05-07) — "ส่งลิ้งค์ลูกค้า"
                    button. Visible ONLY in edit mode (we need a saved
                    appointmentId to provision the link). Click → mints
                    opd_sessions + stamps linkedOpdSessionId on the appt +
                    linked deposit so the bookings auto-attach when admin
                    clicks "บันทึกลง OPD" on the customer's submitted form.
                    Idempotent — re-clicking shows the same URL/QR. */}
                {mode === 'edit' && appt && (appt.appointmentId || appt.id) && (
                  <div className="col-span-2 mt-1.5">
                    <button
                      type="button"
                      onClick={async () => {
                        if (sendLinkBusy) return;
                        setSendLinkBusy(true);
                        try {
                          const apptId = appt.appointmentId || appt.id;
                          const r = await provisionOpdLinkForBookingPair({
                            depositId: appt.linkedDepositId || appt.spawnedFromDepositId || '',
                            appointmentId: apptId,
                            branchId: appt.branchId || selectedBranchId || '',
                            formType: 'intake',
                            sessionName: formData.customerNameTemp
                              || appt.customerNameTemp
                              || 'ลูกค้าจอง',
                          });
                          setSendLinkModal({
                            sessionId: r.sessionId,
                            url: r.url,
                            sessionName: formData.customerNameTemp || appt.customerNameTemp || 'ลูกค้าจอง',
                            alreadyProvisioned: r.alreadyProvisioned,
                          });
                        } catch (err) {
                          console.warn('[AppointmentFormModal] provisionOpdLinkForBookingPair failed:', err);
                          setError('สร้างลิ้งค์ไม่สำเร็จ: ' + (err?.message || String(err)));
                        } finally {
                          setSendLinkBusy(false);
                        }
                      }}
                      disabled={sendLinkBusy}
                      data-testid="appt-modal-send-link-btn"
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-bold border transition-colors ${
                        appt.linkedOpdSessionId
                          ? 'bg-emerald-900/30 border-emerald-700/40 text-emerald-300 hover:bg-emerald-900/50'
                          : 'bg-blue-900/30 border-blue-700/40 text-blue-300 hover:bg-blue-900/50'
                      } disabled:opacity-50`}
                      title={appt.linkedOpdSessionId
                        ? 'ดู / พิมพ์ลิ้งค์ที่ส่งให้ลูกค้าแล้ว'
                        : 'สร้างลิ้งค์สำหรับลูกค้ากรอกข้อมูล OPD จากระยะไกล'}
                    >
                      {sendLinkBusy ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : appt.linkedOpdSessionId ? (
                        <QrCode size={12} />
                      ) : (
                        <Send size={12} />
                      )}
                      {appt.linkedOpdSessionId ? 'ดูลิ้งค์ที่ส่งไป' : 'ส่งลิ้งค์ลูกค้ากรอก OPD'}
                    </button>
                  </div>
                )}
              </div>
            ) : lockedCustomer || formData.customerName ? (
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
                          {/* Task 9 LR-4 (2026-05-15) — CustomerOption surfaces 🟢/⚪️ LINE
                              badge so admin can see per-branch LINE linkage before
                              picking the customer for this appointment. */}
                          <CustomerOption customer={{ ...c, name }} contextBranchId={selectedBranchId} />
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
                {/* V53 (BS-12) — filtered by branch openHours for selected date */}
                {visibleSlots.map(t => <option key={t} value={t}>{t}</option>)}
                {/* Preserve legacy value as a hidden option so the select shows
                    the current value even when it falls outside the new open
                    range (admin can re-pick from the filtered list). */}
                {formData.startTime && !visibleSlots.includes(formData.startTime) && (
                  <option key={`legacy-${formData.startTime}`} value={formData.startTime}>{formData.startTime}</option>
                )}
              </select>
              {isTimeOutsideOpenHours(formData.startTime, formData.date, cs) && (
                <p className="text-[10px] text-amber-400 mt-1" data-testid="appt-modal-startTime-warning">
                  ⚠ เวลานี้อยู่นอกช่วงเปิดสาขา — เลือกเวลาในช่วงเปิดเพื่อความถูกต้อง
                </p>
              )}
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">สิ้นสุด</label>
              <select value={formData.endTime} onChange={e => update({ endTime: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] focus:outline-none focus:ring-1 focus:ring-sky-500">
                {visibleSlots.map(t => <option key={t} value={t}>{t}</option>)}
                {formData.endTime && !visibleSlots.includes(formData.endTime) && (
                  <option key={`legacy-${formData.endTime}`} value={formData.endTime}>{formData.endTime}</option>
                )}
              </select>
            </div>
          </div>
          {/* V53 (BS-12) — closed-day banner inside the modal. When the
              selected date falls on a closed bucket (open===close OR invalid),
              admin sees a banner above the form. Save still allowed (admin
              may know what they're doing for special cases). */}
          {isClosedDay && (
            <div data-testid="appt-modal-closed-hours-banner"
              className="text-xs text-amber-200 bg-amber-700/15 border border-amber-600/40 rounded-lg px-3 py-2">
              ⚠ <span className="font-bold">นอกเวลาเปิดทำการของสาขา</span> สำหรับวันที่เลือก — บันทึกได้แต่อยู่นอกชั่วโมงเปิด
            </div>
          )}
          {/* Appointment Type — Phase 21.0: when sub-tab passes
              lockedAppointmentType, render a static chip (no radio, no edit)
              so admin can't miscategorize while inside a typed view. When
              not locked, render the Phase 19.0 4-radio row. */}
          <div>
            <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">ประเภทนัดหมาย</label>
            {safeLockedType ? (
              <div
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border bg-[var(--bg-elevated)] border-[var(--bd)] text-[var(--tx-secondary)]`}
                title="ประเภทถูกล็อคจาก tab ที่เลือก"
                data-testid="appt-type-locked-chip"
                data-locked-type={safeLockedType}
              >
                <span className="text-[var(--tx-muted)]">🔒</span>
                {resolveAppointmentTypeLabel(safeLockedType)}
              </div>
            ) : (
              <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                {APPOINTMENT_TYPES.map(t => (
                  <label key={t.value} className="flex items-center gap-1.5 cursor-pointer text-xs">
                    <input type="radio" checked={formData.appointmentType === t.value} onChange={() => update({ appointmentType: t.value })} className="accent-sky-500" />{t.label}
                  </label>
                ))}
              </div>
            )}
          </div>
          {/* Phase 21.0-ter (2026-05-06 EOD) — embedded deposit subform.
              When admin opens this modal from the จองมัดจำ sub-tab (or
              picks 'deposit-booking' from the radio), these required fields
              appear inline. On save, the handler routes to
              createDepositBookingPair which atomically writes the
              be_deposits doc + the be_appointments doc with cross-link
              fields. Replaces the prior Phase 21.0-main redirect banner
              per user directive: "ทำให้สร้างได้ตั้งแต่หน้าจองมัดจำเลย ...
              ก็มีช่องให้กรอกรายละเอียดการมัดจำไปด้วยไง ง่ายๆ". */}
          {isLockedDepositType && mode === 'create' && (
            <div
              className="rounded-lg p-3 bg-emerald-900/15 border border-emerald-700/40 space-y-3"
              data-testid="appt-deposit-subform"
            >
              <p className="text-xs font-bold text-emerald-200 uppercase tracking-wider">
                💰 รายละเอียดมัดจำ
              </p>
              <p className="text-[10px] text-[var(--tx-muted)] leading-relaxed">
                ระบบจะบันทึกทั้งใบมัดจำและนัดหมายพร้อมกันแบบอัตโนมัติ
                แสดงในแท็บ <span className="text-emerald-300 font-bold">จองมัดจำ</span> และ
                <span className="text-emerald-300 font-bold"> การเงิน → มัดจำ</span> ของสาขานี้
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div data-field="depositAmount">
                  <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">
                    ยอดมัดจำ (บาท) *
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={formData.depositAmount}
                    onChange={(e) => update({ depositAmount: e.target.value })}
                    placeholder="0"
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-emerald-700/30 text-xs text-[var(--tx-primary)] placeholder:text-[var(--tx-muted)] focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    data-testid="appt-deposit-amount"
                  />
                </div>
                <div data-field="depositPaymentChannel">
                  <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">
                    ช่องทางชำระ *
                  </label>
                  <select
                    value={formData.depositPaymentChannel}
                    onChange={(e) => update({ depositPaymentChannel: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-emerald-700/30 text-xs text-[var(--tx-primary)] focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    data-testid="appt-deposit-channel"
                  >
                    <option value="เงินสด">เงินสด</option>
                    <option value="โอนธนาคาร">โอนธนาคาร</option>
                    <option value="บัตรเครดิต">บัตรเครดิต</option>
                    <option value="QR Payment">QR Payment</option>
                    <option value="อื่นๆ">อื่นๆ</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div data-field="depositPaymentDate">
                  <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">
                    วันที่ชำระ *
                  </label>
                  <DateField
                    value={formData.depositPaymentDate}
                    onChange={(v) => update({ depositPaymentDate: v })}
                    fieldClassName="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-emerald-700/30 text-xs text-[var(--tx-primary)] focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">
                    หมายเหตุมัดจำ
                  </label>
                  <input
                    type="text"
                    value={formData.depositNote}
                    onChange={(e) => update({ depositNote: e.target.value })}
                    placeholder="(ไม่บังคับ)"
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-emerald-700/30 text-xs text-[var(--tx-primary)] placeholder:text-[var(--tx-muted)] focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    data-testid="appt-deposit-note"
                  />
                </div>
              </div>
            </div>
          )}
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
              {/* Phase 25.0c (2026-05-09) — when lockedChannel set, render
                  static read-only chip (mirror lockedAppointmentType UX at
                  line 1025+). User: "ล็อคช่องทางนัดหมายเป็น walk-in". */}
              {safeLockedChannel ? (
                <div
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] text-xs font-bold text-[var(--tx-heading)] flex items-center gap-2"
                  data-locked-channel={safeLockedChannel}
                  data-testid="locked-channel-chip"
                  title="ช่องทางนัดหมายถูกล็อค"
                >
                  <span aria-hidden="true">🔒</span>
                  <span>{safeLockedChannel}</span>
                </div>
              ) : (
                <select value={formData.channel} onChange={e => update({ channel: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] focus:outline-none focus:ring-1 focus:ring-sky-500">
                  <option value="">ไม่ระบุ</option>
                  {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
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
          {/* Phase 21.0-ter (2026-05-06 EOD) — save button always visible.
              Deposit-booking creates now route to createDepositBookingPair
              (atomic paired write), enabled by the embedded deposit subform
              above. Replaces the Phase 21.0-main hidden-save-button design
              that redirected to DepositPanel. */}
          <button onClick={handleSave} disabled={saving}
            data-testid="appointment-form-save"
            className="px-4 py-2 rounded-lg text-xs font-bold bg-sky-700 text-white hover:bg-sky-600 transition-all disabled:opacity-50 flex items-center gap-1.5">
            {saving ? <Loader2 size={12} className="animate-spin"/> : <CheckCircle2 size={12}/>}
            {mode === 'edit' ? 'บันทึก' : (isLockedDepositType && mode === 'create' ? 'สร้างจองมัดจำ' : 'สร้างนัดหมาย')}
          </button>
        </div>
      </div>
      {/* Phase 24.0-vicies-novies (2026-05-07) — share-link modal for the
          pickLater section's "ส่งลิ้งค์ลูกค้า" button. Renders OUTSIDE the
          form panel so its z-100 backdrop doesn't trap the form's outer
          backdrop click handler. */}
      {sendLinkModal && (
        <SendCustomerLinkModal
          isOpen={true}
          onClose={() => setSendLinkModal(null)}
          sessionId={sendLinkModal.sessionId}
          url={sendLinkModal.url}
          sessionName={sendLinkModal.sessionName}
          alreadyProvisioned={sendLinkModal.alreadyProvisioned}
        />
      )}
    </div>
  );
}
