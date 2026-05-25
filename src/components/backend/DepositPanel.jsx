// ─── DepositPanel — มัดจำ (Phase 7) ─────────────────────────────────────────
// List + create/edit + cancel + refund + detail, with optional appointment booking
// (fully replicates ProClinic /admin/deposit per Phase 7 plan §7 + §20.1)

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Wallet, Plus, Edit3, Search, Loader2, X, Eye, ArrowLeft, CheckCircle2,
  AlertCircle, Ban, RotateCcw, Calendar, Clock, Users as UsersIcon, Trash2,
  // Phase 24.0-noniesdecies (2026-05-06) — "+ สร้างนัด" button icon.
  CalendarPlus,
  // Phase 24.0-vicies-novies (2026-05-07) — "ส่งลิ้งค์ลูกค้า" button icon.
  Send, QrCode,
} from 'lucide-react';
import {
  createDeposit, updateDeposit, cancelDeposit, refundDeposit, deleteDeposit,
  getAllDeposits, getDeposit, getAllCustomers,
  // Phase 14.10-tris (2026-04-26) — be_* canonical, no master_data mirror
  listStaff, listDoctors,
  // Phase 18.0 (2026-05-05) — branch-scoped exam-room master
  listExamRooms,
} from '../../lib/scopedDataLayer.js';
// Phase 21.0 (2026-05-06) — paired deposit-booking writer. When admin
// creates a deposit with hasAppointment=true, BOTH be_deposits AND
// be_appointments docs are written via a single Firestore writeBatch
// (atomic). Closes the pre-Phase-21.0 visibility gap where
// deposit-bookings created from this panel never appeared in
// AppointmentTab/AppointmentCalendarView.
import {
  createDepositBookingPair,
  cancelDepositBookingPair,
  deleteDepositBookingPair,
  // Phase 24.0-vicies-novies (2026-05-07) — provision an opd_sessions doc +
  // stamp linkedOpdSessionId on the deposit + linked appointment so the
  // bookings auto-attach when admin clicks "บันทึกลง OPD" later.
  provisionOpdLinkForBookingPair,
} from '../../lib/appointmentDepositBatch.js';
import DepositAwareCancelDialog from '../admin/DepositAwareCancelDialog.jsx';
// Phase 24.0-noniesdecies (2026-05-06) — AppointmentFormModal in
// create-for-existing-deposit mode (existingDepositId prop set).
import AppointmentFormModal from './AppointmentFormModal.jsx';
// Phase 24.0-vicies-novies (2026-05-07) — share-link modal (URL + QR + copy).
import SendCustomerLinkModal from './SendCustomerLinkModal.jsx';
import { calcDepositRemaining, fmtMoney } from '../../lib/financeUtils.js';
import { fmtThaiDate } from '../../lib/dateFormat.js';
import { resolveSellerName } from '../../lib/documentFieldAutoFill.js';
import FileUploadField from './FileUploadField.jsx';
import DateField from '../DateField.jsx';
// Task 9 (LINE OA Appointment Reminder, 2026-05-15) — shared customer
// name + per-branch LINE badge (LR-4 lock).
import { CustomerOption } from '../CustomerOption.jsx';
import PhoneLink from '../PhoneLink.jsx';
// Task 10 (LINE OA Appointment Reminder, 2026-05-15) — per-branch
// LINE-notify confirmation card with auto-tick (LR-4 lock part 2).
import { LineNotifyConfirmation } from '../LineNotifyConfirmation.jsx';
import { thaiTodayISO, bangkokNow } from '../../utils.js';
import { useHasPermission } from '../../hooks/useTabAccess.js';
import { useSelectedBranch, useEffectiveClinicSettings } from '../../lib/BranchContext.jsx';
import { filterStaffByBranch, filterDoctorsByBranch } from '../../lib/branchScopeUtils.js';
import { TIME_SLOTS } from '../../lib/staffScheduleValidation.js';
import { APPOINTMENT_TYPES } from '../../lib/appointmentTypes.js';
// V53 (2026-05-08, BS-12) — per-branch openHours filter the deposit-booking
// time pickers (DepositPanel embeds an inline appt subform when admin
// opts to pair the deposit with a booking).
import {
  getVisibleTimeSlotsForDate,
  isTimeOutsideOpenHours,
} from '../../lib/scheduleFilterUtils.js';
// 2026-05-20 — sub-tab partition (ใช้งานอยู่ / สิ้นสุดแล้ว). Single-source.
import {
  filterDepositsBySubTab,
  ACTIVE_DEPOSIT_STATUSES,
  FINISHED_DEPOSIT_STATUSES,
} from '../../lib/depositSubTabFilter.js';

const PAYMENT_CHANNELS = ['เงินสด', 'โอนธนาคาร', 'บัตรเครดิต', 'QR Payment', 'อื่นๆ'];
const CUSTOMER_SOURCES = ['Walk-in', 'Drag-in', 'เพื่อนแนะนำ', 'BNI', 'ChatGPT', 'Facebook', 'Gemini', 'Influencer', 'Instagram', 'LINE', 'TikTok', 'Google', 'อื่นๆ'];
// Phase 19.0 — APPT_TYPES sourced from appointmentTypes.js SSOT (was inline 2-value array pre-Phase-19.0).
const APPT_CHANNELS = ['เคาน์เตอร์', 'โทรศัพท์', 'Walk-in', 'Facebook', 'Instagram', 'TikTok', 'Line', 'อื่นๆ'];
const APPT_COLORS = ['ใช้สีเริ่มต้น', 'เหลืองอ่อน', 'เขียวอ่อน', 'ส้มอ่อน', 'แดงอ่อน', 'น้ำตาลอ่อน', 'ชมพูอ่อน', 'ม่วงอ่อน', 'น้ำเงินอ่อน'];
// Sub-tabs inside มัดจำ (2026-05-20). "ใช้งานอยู่" = active+partial (default);
// "สิ้นสุดแล้ว" = used/cancelled/refunded/expired. Pill mirrors SaleTab (emerald).
const DEPOSIT_SUB_TABS = [
  { id: 'active', label: 'ใช้งานอยู่' },
  { id: 'finished', label: 'สิ้นสุดแล้ว' },
];

const STATUS_META = {
  active:    { label: 'ใช้งาน',    cls: 'bg-emerald-900/30 text-emerald-400 border-emerald-700/40', lightCls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  partial:   { label: 'ใช้บางส่วน', cls: 'bg-sky-900/30 text-sky-400 border-sky-700/40',               lightCls: 'bg-sky-50 text-sky-700 border-sky-200' },
  used:      { label: 'ใช้หมด',     cls: 'bg-gray-800/50 text-gray-400 border-gray-700/40',         lightCls: 'bg-gray-100 text-gray-600 border-gray-200' },
  cancelled: { label: 'ยกเลิก',     cls: 'bg-red-900/30 text-red-400 border-red-700/40',            lightCls: 'bg-red-50 text-red-700 border-red-200' },
  refunded:  { label: 'คืนเงิน',    cls: 'bg-purple-900/30 text-purple-400 border-purple-700/40',   lightCls: 'bg-purple-50 text-purple-700 border-purple-200' },
  expired:   { label: 'หมดอายุ',    cls: 'bg-orange-900/30 text-orange-400 border-orange-700/40',      lightCls: 'bg-orange-50 text-orange-700 border-orange-200' },
};

function todayStr() { return thaiTodayISO(); }
function nowTimeStr() {
  const d = bangkokNow();
  return `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;
}
const clean = (o) => JSON.parse(JSON.stringify(o));

// Phase 19.0 (2026-05-06) — TIME_SLOTS imported from canonical
// staffScheduleValidation (15-min, 56 entries). Was a local 30-min
// generator pre-Phase-19.0 (Rule of 3 #3 of 3).

function StatusBadge({ status, isDark }) {
  const meta = STATUS_META[status] || STATUS_META.active;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${isDark ? meta.cls : meta.lightCls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${status === 'active' ? 'bg-emerald-400' : status === 'partial' ? 'bg-sky-400' : status === 'cancelled' ? 'bg-red-400' : status === 'refunded' ? 'bg-purple-400' : 'bg-gray-400'}`} />
      {meta.label}
    </span>
  );
}

export default function DepositPanel({ clinicSettings, theme, initialCustomer, onCustomerUsed }) {
  const isDark = theme === 'dark' || (theme === 'auto' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const inputCls = `w-full rounded-lg px-3 py-2 text-xs outline-none border transition-all ${isDark ? 'bg-[var(--bg-surface)] border-[var(--bd)] text-[var(--tx-primary)] focus:border-emerald-500' : 'bg-white border-gray-200 text-gray-800 focus:border-emerald-400'}`;
  const labelCls = 'text-[11px] font-bold uppercase tracking-widest text-[var(--tx-muted)] mb-1 block';
  // Phase 13.5.3 — gate refund button on deposit_cancel. Admin bypasses.
  const canRefund = useHasPermission('deposit_cancel');

  // ── List state ─────────────────────────────────────────────────────────
  const [deposits, setDeposits] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [filterQuery, setFilterQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  // 2026-05-20 — sub-tab: 'active' (active+partial, default) | 'finished'.
  const [subTab, setSubTab] = useState('active');
  // The status dropdown's option set differs per sub-tab, so reset the status
  // filter on any switch to avoid a stale value silently emptying a tab.
  const handleSubTabChange = (id) => {
    setSubTab(id);
    setFilterStatus('');
  };

  // ── Modal state ─────────────────────────────────────────────────────────
  const [viewingDeposit, setViewingDeposit] = useState(null);
  // Phase 24.0-noniesdecies (2026-05-06) — when set, AppointmentFormModal
  // opens in create-for-existing-deposit mode + the deposit auto-gains
  // hasAppointment=true + linkedAppointmentId on save.
  const [apptForDepositModal, setApptForDepositModal] = useState(null);
  // Phase 24.0-vicies-novies (2026-05-07) — send-link modal state. Holds the
  // resolved {sessionId, url, sessionName, alreadyProvisioned} after admin
  // clicks "ส่งลิ้งค์ลูกค้า" on a customer-later deposit card.
  const [sendLinkModal, setSendLinkModal] = useState(null);
  const [sendLinkBusyId, setSendLinkBusyId] = useState('');
  const [cancelModal, setCancelModal] = useState(null);
  // (2026-05-26) deposit-aware HARD delete — { dep } when a deposit-linked
  // (linkedAppointmentId) deposit is being deleted; null otherwise.
  const [deleteDialog, setDeleteDialog] = useState(null);
  const [cancelNote, setCancelNote] = useState('');
  const [cancelEvidenceUrl, setCancelEvidenceUrl] = useState('');
  const [cancelSaving, setCancelSaving] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [refundModal, setRefundModal] = useState(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundChannel, setRefundChannel] = useState('เงินสด');
  const [refundDate, setRefundDate] = useState(todayStr());
  const [refundNote, setRefundNote] = useState('');
  const [refundSaving, setRefundSaving] = useState(false);
  const [refundError, setRefundError] = useState('');

  // ── Form state ──────────────────────────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false);
  const [editingDeposit, setEditingDeposit] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Core fields
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerHN, setCustomerHN] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentChannel, setPaymentChannel] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayStr());
  const [paymentTime, setPaymentTime] = useState(nowTimeStr());
  const [refNo, setRefNo] = useState('');
  const [note, setNote] = useState('');
  const [customerSource, setCustomerSource] = useState('');
  const [sourceDetail, setSourceDetail] = useState('');
  const [paymentEvidenceUrl, setPaymentEvidenceUrl] = useState('');
  const [paymentEvidencePath, setPaymentEvidencePath] = useState('');

  // Sellers (5 slots)
  const emptySellers = () => [...Array(5)].map(() => ({ enabled: false, id: '', name: '', percent: '0', total: '' }));
  const [sellers, setSellers] = useState(emptySellers);

  // Appointment sub-form
  const [hasAppointment, setHasAppointment] = useState(false);
  const [apptType, setApptType] = useState('deposit-booking'); // Phase 19.0 — was 'sales'
  const [apptOption, setApptOption] = useState('once'); // 'once' | 'multiple'
  const [apptEveryN, setApptEveryN] = useState('1');
  const [apptUnit, setApptUnit] = useState('วัน');
  const [apptTimes, setApptTimes] = useState('1');
  const [apptDate, setApptDate] = useState(todayStr());
  const [apptStartTime, setApptStartTime] = useState('10:00');
  const [apptEndTime, setApptEndTime] = useState('10:30');

  // V53 (BS-12) — branch-reactive merged settings + visible time-slots
  // filtered by openHours for the active appt date. Re-fires when admin
  // changes the deposit appt date OR switches branch on the top-right selector.
  const cs = useEffectiveClinicSettings(undefined);
  const visibleTime = useMemo(
    () => getVisibleTimeSlotsForDate({
      dateISO: apptDate,
      mergedSettings: cs,
      allTimeSlots: TIME_SLOTS,
    }),
    [apptDate, cs?.openHoursMonFri, cs?.openHoursSatSun],
  );
  const visibleSlots = visibleTime.slots;
  const [apptDoctorId, setApptDoctorId] = useState('');
  const [apptDoctorName, setApptDoctorName] = useState('');
  const [apptAssistantIds, setApptAssistantIds] = useState([]);
  const [apptRoomId, setApptRoomId] = useState('');  // Phase 18.0 — FK to be_exam_rooms
  const [apptRoomName, setApptRoomName] = useState('');  // snapshot for historical display
  const [apptChannel, setApptChannel] = useState('');
  const [apptPurpose, setApptPurpose] = useState('');
  const [apptNote, setApptNote] = useState('');
  const [apptColor, setApptColor] = useState('');
  const [apptLineNotify, setApptLineNotify] = useState(false);
  // Task 10 (LINE OA Appointment Reminder, 2026-05-15) — notifyChannel
  // array drives the be_appointments.notifyChannel write so the cron
  // pipeline can pick this appt up for reminder delivery. Auto-ticked
  // when selected customer has LINE linked at selectedBranchId + not
  // opted-out + not stale (LR-4 invariant). User can untick to suppress.
  const [notifyChannel, setNotifyChannel] = useState([]);

  // Options data
  const [customers, setCustomers] = useState([]);
  const [staff, setStaff] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  // Phase BSA leak-fix (2026-05-04): cache key on branchId so seller/recipient
  // pickers re-load when admin switches branch. Pre-fix `false` flag never
  // re-loaded → stale staff/doctors visible across branches.
  const { branchId: selectedBranchId } = useSelectedBranch();
  const [optionsLoadedFor, setOptionsLoadedFor] = useState(null);

  // ── Load list ──────────────────────────────────────────────────────────
  // Phase BSA leak-sweep-2 (2026-05-04) — deposits are branch-scoped per
  // user directive "ทำให้แถบมัดจำ แยกสาขากัน". scopedDataLayer.getAllDeposits
  // auto-injects current branchId on each call; deps include selectedBranchId
  // so the list re-loads when admin switches branch via top-right selector.
  const loadList = useCallback(async () => {
    setListLoading(true);
    try { setDeposits(await getAllDeposits()); }
    catch (e) { console.warn('[DepositPanel] load list failed:', e); setDeposits([]); }
    finally { setListLoading(false); }
  }, [selectedBranchId]);
  useEffect(() => { loadList(); }, [loadList]);

  // ── Load options on demand ─────────────────────────────────────────────
  const [examRooms, setExamRooms] = useState([]);
  const loadOptions = useCallback(async () => {
    if (optionsLoadedFor === selectedBranchId) return;
    try {
      const [c, s, d, rooms] = await Promise.all([
        getAllCustomers(),
        listStaff(),
        listDoctors(),
        // Phase 18.0 (2026-05-05) — branch-scoped active exam rooms
        listExamRooms({ branchId: selectedBranchId, status: 'ใช้งาน' }).catch(() => []),
      ]);
      setCustomers(c);
      // Phase 14.10-tris — be_staff/be_doctors shape: firstname+lastname (no flat .name)
      const buildName = (x) => {
        const parts = [x.firstname || x.firstName || '', x.lastname || x.lastName || ''].filter(Boolean);
        return parts.join(' ').trim() || x.nickname || x.name || x.fullName || '';
      };
      // Phase BSA leak-fix (2026-05-04): branch soft-gate. Seller/recipient
      // pickers must show only staff/doctors with access to current branch.
      const sFiltered = filterStaffByBranch(s || [], selectedBranchId);
      const dFiltered = filterDoctorsByBranch(d || [], selectedBranchId);
      setStaff(sFiltered.map(x => ({ id: x.staffId || x.id, name: buildName(x), position: x.position })));
      setDoctors(dFiltered.map(x => ({ id: x.doctorId || x.id, name: buildName(x), position: x.position })));
      setExamRooms(rooms || []);
      setOptionsLoadedFor(selectedBranchId);
    } catch (e) { console.warn('[DepositPanel] load options failed:', e); }
  }, [optionsLoadedFor, selectedBranchId]);

  // ── Open create form (with optional initial customer) ─────────────────
  const openCreate = useCallback((initial) => {
    loadOptions();
    setEditingDeposit(null);
    const src = initial || {};
    setCustomerId(src.proClinicId || src.id || '');
    setCustomerName(
      src.patientData
        ? `${src.patientData.prefix || ''} ${src.patientData.firstName || ''} ${src.patientData.lastName || ''}`.trim()
        : ''
    );
    setCustomerHN(src.proClinicHN || '');
    setAmount(''); setPaymentChannel(''); setPaymentDate(todayStr()); setPaymentTime(nowTimeStr()); setRefNo('');
    setNote(''); setCustomerSource(''); setSourceDetail('');
    setPaymentEvidenceUrl(''); setPaymentEvidencePath('');
    setSellers(emptySellers());
    setHasAppointment(false); setApptType('deposit-booking'); setApptOption('once');
    setApptEveryN('1'); setApptUnit('วัน'); setApptTimes('1');
    setApptDate(todayStr()); setApptStartTime('10:00'); setApptEndTime('10:15');
    setApptDoctorId(''); setApptDoctorName(''); setApptAssistantIds([]);
    setApptRoomName(''); setApptChannel(''); setApptPurpose(''); setApptNote('');
    setApptColor(''); setApptLineNotify(false);
    // Task 10 (2026-05-15) — reset notifyChannel; auto-tick effect will
    // re-populate when customerId resolves.
    setNotifyChannel([]);
    setError(''); setSuccess(false); setFormOpen(true);
  }, [loadOptions]);

  // Auto-open form when initialCustomer arrives (from CustomerDetail "จ่ายมัดจำ")
  useEffect(() => {
    if (initialCustomer) {
      openCreate(initialCustomer);
      if (onCustomerUsed) onCustomerUsed();
    }
  }, [initialCustomer, openCreate, onCustomerUsed]);

  // Task 10 (LINE OA Appointment Reminder, 2026-05-15) — resolve the
  // selected customer doc (from customers[]) so the LINE-notify auto-tick
  // effect can read lineUserId_byBranch / notifyOptOut / _lineStale.
  // Returns null when no customer chosen yet.
  const selectedCustomerDoc = useMemo(() => {
    if (!customerId) return null;
    const id = String(customerId);
    return customers.find((c) => String(c.proClinicId || c.id) === id) || null;
  }, [customerId, customers]);

  // Task 10 auto-tick — selectedBranchId is the appointment's branch
  // (the deposit + appointment write to the currently-selected branch).
  // LR-4 invariant: 'line' channel is pre-checked iff customer has
  // linkedHere + !optOut + !stale.
  useEffect(() => {
    if (!selectedCustomerDoc) { setNotifyChannel([]); return; }
    const branchLink = selectedCustomerDoc.lineUserId_byBranch?.[selectedBranchId];
    const legacyValid = selectedCustomerDoc.branchId === selectedBranchId && selectedCustomerDoc.lineUserId;
    const linkedHere = !!(branchLink?.lineUserId || legacyValid);
    const optedOut = selectedCustomerDoc.notifyOptOut === true;
    const isStale = branchLink?._lineStale === true ||
      (selectedCustomerDoc.branchId === selectedBranchId && selectedCustomerDoc._lineStale === true);
    const canAutoTick = linkedHere && !optedOut && !isStale;
    if (canAutoTick) setNotifyChannel((prev) => (prev.includes('line') ? prev : [...prev, 'line']));
    else setNotifyChannel((prev) => prev.filter((c) => c !== 'line'));
  }, [selectedCustomerDoc?.id, selectedBranchId]);

  const openEdit = useCallback((dep) => {
    loadOptions();
    setEditingDeposit(dep);
    setCustomerId(dep.customerId || '');
    setCustomerName(dep.customerName || '');
    setCustomerHN(dep.customerHN || '');
    setAmount(String(dep.amount || ''));
    setPaymentChannel(dep.paymentChannel || '');
    setPaymentDate(dep.paymentDate || todayStr());
    setPaymentTime(dep.paymentTime || '');
    setRefNo(dep.refNo || '');
    setNote(dep.note || '');
    setCustomerSource(dep.customerSource || '');
    setSourceDetail(dep.sourceDetail || '');
    setPaymentEvidenceUrl(dep.paymentEvidenceUrl || '');
    setPaymentEvidencePath(dep.paymentEvidencePath || '');
    // Edit form (per §20.1): simpler — hides sellers + appointment
    setSellers(emptySellers());
    setHasAppointment(false);
    setError(''); setSuccess(false); setFormOpen(true);
  }, [loadOptions]);

  // ── Filtered list ──────────────────────────────────────────────────────
  const filteredDeposits = useMemo(() => {
    // 2026-05-20: split by sub-tab FIRST (active = active+partial, finished =
    // used/cancelled/refunded/expired) via the single-source helper, then apply
    // the scoped status dropdown + date-range + search.
    let list = filterDepositsBySubTab(deposits, subTab);
    if (filterStatus) list = list.filter(d => d.status === filterStatus);
    if (filterFrom) list = list.filter(d => (d.paymentDate || '') >= filterFrom);
    if (filterTo) list = list.filter(d => (d.paymentDate || '') <= filterTo);
    if (filterQuery.trim()) {
      const q = filterQuery.trim().toLowerCase();
      list = list.filter(d =>
        (d.customerName || '').toLowerCase().includes(q) ||
        (d.customerHN || '').toLowerCase().includes(q) ||
        (d.depositId || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [deposits, filterQuery, filterStatus, filterFrom, filterTo, subTab]);

  // ── Customer search (in form) ──────────────────────────────────────────
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers.slice(0, 15);
    const q = customerSearch.toLowerCase();
    return customers.filter(c => {
      const nm = `${c.patientData?.prefix || ''} ${c.patientData?.firstName || ''} ${c.patientData?.lastName || ''}`.toLowerCase();
      return nm.includes(q) || (c.proClinicHN || '').toLowerCase().includes(q);
    }).slice(0, 15);
  }, [customers, customerSearch]);

  const staffOptions = useMemo(
    () => [...staff, ...doctors.map(d => ({ ...d, position: d.position || 'แพทย์' }))],
    [staff, doctors]
  );

  // ── Save handler ──────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!customerId) { setError('กรุณาเลือกลูกค้า'); return; }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError('กรุณาระบุยอดมัดจำมากกว่า 0'); return; }
    if (!paymentChannel) { setError('กรุณาเลือกช่องทางชำระเงิน'); return; }
    if (!paymentDate) { setError('กรุณาเลือกวันที่ชำระ'); return; }

    // Sellers validation: at least one enabled seller with id
    if (!editingDeposit) {
      const activeSellers = sellers.filter(s => s.enabled && s.id);
      if (activeSellers.length === 0) { setError('กรุณาเลือกพนักงานขายอย่างน้อย 1 คน'); return; }
    }

    setSaving(true); setError('');
    try {
      const activeSellers = sellers.filter(s => s.enabled && s.id).map(s => ({
        id: s.id, name: s.name,
        percent: Number(s.percent) || 0,
        total: Number(s.total) || 0,
      }));
      const appointment = hasAppointment ? {
        type: apptType,
        option: apptOption,
        everyN: apptOption === 'multiple' ? Number(apptEveryN) || 1 : null,
        unit: apptOption === 'multiple' ? apptUnit : null,
        times: apptOption === 'multiple' ? Number(apptTimes) || 1 : null,
        date: apptDate,
        startTime: apptStartTime,
        endTime: apptEndTime,
        doctorId: apptDoctorId, doctorName: apptDoctorName,
        assistantIds: apptAssistantIds,
        // Phase 15.7 (2026-04-28) — denorm `assistantNames` so render-time
        // consumers (AppointmentTab, CustomerDetailView) can show names
        // without a doctorMap lookup. resolveAssistantNames falls back to
        // doctorMap if absent so legacy data still renders.
        assistantNames: (apptAssistantIds || [])
          .map((id) => {
            const d = doctors.find((x) => String(x.id) === String(id));
            return d ? String(d.name || '').trim() : '';
          })
          .filter(Boolean),
        roomId: apptRoomId || '',  // Phase 18.0 — FK to be_exam_rooms
        roomName: apptRoomName,    // snapshot
        channel: apptChannel,
        purpose: apptPurpose,
        note: apptNote,
        color: apptColor,
        lineNotify: !!apptLineNotify,
        // Task 10 (LINE OA Appointment Reminder, 2026-05-15) — channels
        // the user confirmed for reminder delivery (LR-4 invariant). The
        // createDepositBookingPair helper writes this onto the
        // be_appointments doc so the cron pipeline can pick it up.
        notifyChannel,
      } : null;

      const payload = clean({
        customerId, customerName, customerHN,
        amount: amt,
        paymentChannel, paymentDate, paymentTime, refNo,
        sellers: activeSellers,
        customerSource, sourceDetail,
        note,
        hasAppointment,
        appointment,
        paymentEvidenceUrl: paymentEvidenceUrl || '',
        paymentEvidencePath: paymentEvidencePath || '',
      });

      if (editingDeposit) {
        await updateDeposit(editingDeposit.depositId || editingDeposit.id, {
          // Edit form only updates payment fields (per §20.1)
          amount: amt,
          paymentChannel, paymentDate, paymentTime, refNo,
          note,
          paymentEvidenceUrl: paymentEvidenceUrl || '',
          paymentEvidencePath: paymentEvidencePath || '',
        });
      } else if (hasAppointment) {
        // Phase 21.0 — paired write: be_deposits + be_appointments via
        // single Firestore writeBatch. Sets linkedAppointmentId on the
        // deposit so cancelDepositBookingPair can route both docs later.
        // The new จองมัดจำ sub-tab reads be_appointments → this is the
        // single hop that makes deposit-bookings visible there.
        await createDepositBookingPair({ depositData: payload });
      } else {
        // Pre-Phase-21.0 path: no paired appointment — single be_deposits write.
        await createDeposit(payload);
      }
      setSuccess(true);
      setTimeout(() => { setFormOpen(false); setSuccess(false); loadList(); }, 700);
    } catch (err) {
      setError(err.message || 'บันทึกไม่สำเร็จ');
    } finally { setSaving(false); }
  };

  // ── Handlers: cancel / refund / delete ─────────────────────────────────
  const openCancel = (dep) => {
    setCancelModal(dep); setCancelNote(''); setCancelEvidenceUrl(''); setCancelError('');
  };
  const handleCancel = async () => {
    if (!cancelNote.trim()) { setCancelError('กรุณาระบุเหตุผล'); return; }
    setCancelSaving(true); setCancelError('');
    try {
      const depositId = cancelModal.depositId || cancelModal.id;
      // Phase 21.0 — pair cancel when this deposit has a linkedAppointmentId
      // (deposit-booking created via createDepositBookingPair). Both docs
      // flip to status='cancelled' atomically. Falls back to single-doc
      // cancelDeposit for legacy deposits without a linked appointment.
      if (cancelModal.linkedAppointmentId) {
        await cancelDepositBookingPair(depositId, {
          cancelNote,
          cancelEvidenceUrl: cancelEvidenceUrl || '',
        });
      } else {
        await cancelDeposit(depositId, {
          cancelNote,
          cancelEvidenceUrl: cancelEvidenceUrl || '',
        });
      }
      setCancelModal(null); loadList();
    } catch (err) { setCancelError(err.message || 'ยกเลิกไม่สำเร็จ'); }
    finally { setCancelSaving(false); }
  };

  const openRefund = (dep) => {
    setRefundModal(dep);
    setRefundAmount(String(dep.remainingAmount || 0));
    setRefundChannel('เงินสด');
    setRefundDate(todayStr());
    setRefundNote('');
    setRefundError('');
  };
  const handleRefund = async () => {
    const amt = parseFloat(refundAmount);
    if (!amt || amt <= 0) { setRefundError('กรุณาระบุจำนวนคืนมากกว่า 0'); return; }
    setRefundSaving(true); setRefundError('');
    try {
      await refundDeposit(refundModal.depositId || refundModal.id, {
        refundAmount: amt,
        refundChannel,
        refundDate,
        note: refundNote,
      });
      setRefundModal(null); loadList();
    } catch (err) { setRefundError(err.message || 'คืนเงินไม่สำเร็จ'); }
    finally { setRefundSaving(false); }
  };

  const handleDelete = async (dep) => {
    // (2026-05-26) deposit-linked → ask ลบนัดด้วย / เก็บนัด via the shared
    // deposit-aware dialog (fixes the orphan-appt gap: bare deleteDeposit left
    // the linked be_appointments doc dangling). Legacy no-link → plain confirm.
    if (dep.linkedAppointmentId) { setDeleteDialog({ dep }); return; }
    if (!confirm(`ต้องการลบมัดจำ ${dep.depositId}?`)) return;
    try {
      await deleteDeposit(dep.depositId || dep.id);
      loadList();
    } catch (err) { alert(err.message || 'ลบไม่สำเร็จ'); }
  };

  // ══════════════════ RENDER ══════════════════
  if (formOpen) return renderForm();

  return (
    <div className="space-y-4">
      {/* Sub-tab pills (2026-05-20) — ใช้งานอยู่ / สิ้นสุดแล้ว */}
      <div className="bg-[var(--bg-surface)] rounded-xl p-1.5 shadow border border-[var(--bd)] flex gap-1 overflow-x-auto">
        {DEPOSIT_SUB_TABS.map(t => {
          const active = subTab === t.id;
          return (
            <button key={t.id} onClick={() => handleSubTabChange(t.id)}
              data-testid={`depositpanel-subtab-${t.id}`}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                active
                  ? 'bg-emerald-700 text-white shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                  : 'text-[var(--tx-muted)] hover:text-emerald-400 hover:bg-[var(--bg-hover)]'
              }`}>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Header / Toolbar ── */}
      <div className="bg-[var(--bg-surface)] rounded-2xl p-5 shadow-lg" style={{ border: '1.5px solid rgba(16,185,129,0.15)' }}>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-400/60" />
            <input type="text" value={filterQuery} onChange={e => setFilterQuery(e.target.value)}
              placeholder="ค้นหามัดจำ... (DEP-, ชื่อลูกค้า, HN)"
              className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-[var(--bg-input)] border-2 border-[var(--bd-strong)] text-sm text-[var(--tx-primary)] placeholder:text-[var(--tx-muted)] focus:outline-none focus:border-emerald-500/50 transition-all" />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-2.5 rounded-xl bg-[var(--bg-input)] border-2 border-[var(--bd-strong)] text-xs font-bold text-[var(--tx-primary)] focus:outline-none transition-all">
            <option value="">ทุกสถานะ</option>
            {(subTab === 'active' ? ACTIVE_DEPOSIT_STATUSES : FINISHED_DEPOSIT_STATUSES).map(k => <option key={k} value={k}>{STATUS_META[k].label}</option>)}
          </select>
          <button onClick={() => openCreate()}
            className="px-5 py-2.5 rounded-xl font-black text-sm text-white transition-all flex items-center gap-2 hover:shadow-xl active:scale-[0.97] uppercase tracking-wider whitespace-nowrap"
            style={{ background: 'linear-gradient(135deg, #047857, #10b981)', boxShadow: '0 4px 20px rgba(16,185,129,0.35)' }}>
            <Plus size={16} /> สร้างมัดจำ
          </button>
        </div>

        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--tx-muted)]">ช่วงวันที่:</span>
          <DateField value={filterFrom} onChange={setFilterFrom} size="sm" className="w-36" placeholder="เริ่ม" />
          <span className="text-[var(--tx-muted)] text-xs">—</span>
          <DateField value={filterTo} onChange={setFilterTo} size="sm" className="w-36" placeholder="สิ้นสุด" />
          {(filterFrom || filterTo || filterStatus || filterQuery) && (
            <button onClick={() => { setFilterFrom(''); setFilterTo(''); setFilterStatus(''); setFilterQuery(''); }}
              className="text-xs text-emerald-400 hover:underline ml-1">ล้างตัวกรอง</button>
          )}
          <span className="ml-auto text-xs text-[var(--tx-muted)] font-bold">{filteredDeposits.length} รายการ</span>
        </div>
      </div>

      {/* ── Table / Empty state ── */}
      {listLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={22} className="animate-spin text-[var(--tx-muted)]" />
          <span className="ml-3 text-sm text-[var(--tx-muted)]">กำลังโหลด...</span>
        </div>
      ) : deposits.length === 0 ? (
        <EmptyState onCreate={() => openCreate()} isDark={isDark} />
      ) : filteredDeposits.length === 0 ? (
        subTab === 'finished' ? (
          <div className="text-center py-12 bg-[var(--bg-surface)] border border-[var(--bd)] rounded-xl">
            <Wallet size={24} className="mx-auto text-[var(--tx-muted)] mb-2" />
            <p className="text-xs text-[var(--tx-muted)]">ยังไม่มีมัดจำที่สิ้นสุด</p>
          </div>
        ) : (
          <div className="text-center py-12 bg-[var(--bg-surface)] border border-[var(--bd)] rounded-xl">
            <Search size={24} className="mx-auto text-[var(--tx-muted)] mb-2" />
            <p className="text-xs text-[var(--tx-muted)]">{(filterQuery || filterStatus || filterFrom || filterTo) ? 'ไม่พบรายการที่ตรงกับตัวกรอง' : 'ยังไม่มีมัดจำที่ใช้งานอยู่'}</p>
          </div>
        )
      ) : (
        <div className="bg-[var(--bg-surface)] border border-[var(--bd)] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--bd)] bg-[var(--bg-elevated)]">
                  {['เลขที่', 'ลูกค้า', 'มัดจำสำหรับ', 'ยอด / คงเหลือ', 'ช่องทาง', 'วันที่ชำระ', 'สถานะ', 'จัดการ'].map(h => (
                    <th key={h} scope="col" className="px-3 py-2.5 text-left font-bold text-[var(--tx-muted)] uppercase tracking-wider text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredDeposits.map((dep, i) => {
                  // Prefer the stored remainingAmount (source of truth — accounts for apply AND refund).
  // Fall back to amount - usedAmount only when the field is missing (legacy docs).
  const remain = dep.remainingAmount != null
    ? Number(dep.remainingAmount) || 0
    : calcDepositRemaining(dep.amount, dep.usedAmount);
                  const isFullyUsable = dep.status === 'active' || dep.status === 'partial';
                  const canCancel = dep.status === 'active';
                  const canRefund = isFullyUsable && remain > 0;
                  const canEdit = dep.status !== 'cancelled' && dep.status !== 'refunded' && (Number(dep.usedAmount) || 0) === 0;
                  const canDelete = dep.status !== 'used' && (Number(dep.usedAmount) || 0) === 0;
                  return (
                    <tr key={dep.depositId || dep.id || i}
                      className={`border-b border-[var(--bd)]/50 hover:bg-[var(--bg-hover)] transition-colors ${i % 2 ? 'bg-[var(--bg-card)]/30' : ''}`}>
                      <td className="px-3 py-2 font-mono text-[var(--tx-secondary)]">{dep.depositId || '-'}</td>
                      <td className="px-3 py-2 text-[var(--tx-heading)] font-medium" data-testid="deposit-customer-cell">
                        {dep.customerId ? (
                          <a href={`/?backend=1&customer=${dep.customerId}`} target="_blank" rel="noopener noreferrer"
                            className="text-teal-400 hover:text-teal-300 hover:underline transition-colors">{dep.customerName || '-'}</a>
                        ) : (dep.customerName || '-')}
                        {dep.customerHN && <span className="text-[var(--tx-muted)] text-xs ml-1">{dep.customerHN}</span>}
                        {/* Phase 24.0-terdecies (2026-05-06) — when customerId is
                            empty (kiosk-booked / customer-later), surface the
                            booking-time temp name + phone so admin reading the
                            Finance.มัดจำ row knows who paid the deposit before
                            their patient doc exists. Renders as an amber badge
                            below the (placeholder) customerName. */}
                        {!dep.customerId && (dep.customerNameTemp || dep.customerPhoneTemp) && (
                          <div className="mt-1 text-[10px] flex flex-wrap items-center gap-1.5" data-testid="deposit-customer-temp-badge">
                            <span className="px-1.5 py-0.5 rounded bg-amber-900/30 border border-amber-700/40 text-amber-300 font-bold uppercase">ลูกค้าจอง</span>
                            {dep.customerNameTemp && <span className="text-amber-200">{dep.customerNameTemp}</span>}
                            {dep.customerPhoneTemp && <span className="text-amber-300/80 font-mono">· <PhoneLink value={dep.customerPhoneTemp}>{dep.customerPhoneTemp}</PhoneLink></span>}
                            {/* Phase 24.0-vicies-novies (2026-05-07) —
                                "ส่งลิ้งค์ลูกค้า" button. When clicked, mints
                                an opd_sessions doc + stamps linkedOpdSessionId
                                on this deposit + the linked appointment so
                                the bookings auto-attach when admin clicks
                                "บันทึกลง OPD" on the customer's submitted
                                form later. Idempotent — re-clicking shows
                                the same URL/QR (alreadyProvisioned=true). */}
                            <button
                              type="button"
                              onClick={async () => {
                                const depKey = dep.depositId || dep.id;
                                if (!depKey || sendLinkBusyId === depKey) return;
                                setSendLinkBusyId(depKey);
                                try {
                                  const r = await provisionOpdLinkForBookingPair({
                                    depositId: depKey,
                                    appointmentId: dep.linkedAppointmentId || '',
                                    branchId: dep.branchId || selectedBranchId || '',
                                    formType: 'intake',
                                    sessionName: dep.customerNameTemp
                                      || dep.customerName
                                      || 'ลูกค้าจอง',
                                  });
                                  setSendLinkModal({
                                    sessionId: r.sessionId,
                                    url: r.url,
                                    sessionName: dep.customerNameTemp || dep.customerName || 'ลูกค้าจอง',
                                    alreadyProvisioned: r.alreadyProvisioned,
                                  });
                                } catch (err) {
                                  console.warn('[DepositPanel] provisionOpdLinkForBookingPair failed:', err);
                                  alert('สร้างลิ้งค์ไม่สำเร็จ: ' + (err?.message || String(err)));
                                } finally {
                                  setSendLinkBusyId('');
                                }
                              }}
                              data-testid="deposit-send-link-btn"
                              className={`ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                                dep.linkedOpdSessionId
                                  ? 'bg-emerald-900/30 border-emerald-700/40 text-emerald-300 hover:bg-emerald-900/50'
                                  : 'bg-blue-900/30 border-blue-700/40 text-blue-300 hover:bg-blue-900/50'
                              } disabled:opacity-50`}
                              disabled={sendLinkBusyId === (dep.depositId || dep.id)}
                              title={dep.linkedOpdSessionId
                                ? 'ดู / พิมพ์ลิ้งค์ที่ส่งให้ลูกค้าแล้ว'
                                : 'สร้างลิ้งค์สำหรับลูกค้ากรอกข้อมูล OPD'}
                            >
                              {dep.linkedOpdSessionId ? (
                                <>
                                  <QrCode size={10} />
                                  ดูลิ้งค์ที่ส่งไป
                                </>
                              ) : (
                                <>
                                  <Send size={10} />
                                  ส่งลิ้งค์ลูกค้า
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </td>
                      {/* Phase 21.0-quinquies (2026-05-06 EOD) — "มัดจำสำหรับ" column
                          surfaces the deposit's appointment purpose so admin reading
                          the Finance.มัดจำ list sees what the customer is paying
                          for. Sourced from dep.appointment.purpose (the same field
                          AppointmentFormModal stamps when admin creates a deposit-
                          booking via the embedded subform). Falls back to
                          appointmentTo for legacy shape compat, then a friendly
                          dash for non-appointment deposits.
                          Phase 24.0-undecies (2026-05-06) — drop max-w-[200px] +
                          truncate so multi-purpose strings ("สมรรถภาพ, อื่นๆ: ผ่ามุก")
                          show in full. The badge wraps via whitespace-normal +
                          break-words; title tooltip preserved as a courtesy. */}
                      <td className="px-3 py-2 text-[var(--tx-secondary)] max-w-[280px] align-top" data-testid="deposit-purpose-cell">
                        {dep.appointment?.purpose || dep.appointment?.appointmentTo ? (
                          <span className="inline-flex items-start gap-1 px-2 py-0.5 rounded-md bg-emerald-900/20 border border-emerald-700/30 text-emerald-300 text-[11px] font-medium whitespace-normal break-words leading-snug" title={dep.appointment.purpose || dep.appointment.appointmentTo}>
                            <span className="shrink-0">🎯</span>
                            <span>{dep.appointment.purpose || dep.appointment.appointmentTo}</span>
                          </span>
                        ) : (
                          <span className="text-[var(--tx-muted)]/60 text-[11px]">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono">
                        <div className="text-emerald-400 font-bold">
                          คงเหลือ {fmtMoney(remain)} <span className="text-[10px] text-[var(--tx-muted)] font-normal">บาท</span>
                        </div>
                        <div className="text-[10px] text-[var(--tx-muted)] mt-0.5">
                          <span>ยอด {fmtMoney(dep.amount)}</span>
                          {Number(dep.usedAmount) > 0 && <span> · ใช้ {fmtMoney(dep.usedAmount)}</span>}
                          {Number(dep.refundAmount) > 0 && <span> · คืน {fmtMoney(dep.refundAmount)}</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-[var(--tx-secondary)]">{dep.paymentChannel || '-'}</td>
                      <td className="px-3 py-2 text-[var(--tx-secondary)]">{fmtThaiDate(dep.paymentDate)}</td>
                      <td className="px-3 py-2"><StatusBadge status={dep.status} isDark={isDark} /></td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <button onClick={() => setViewingDeposit(dep)} className="p-2 rounded hover:bg-violet-900/20 text-violet-400" title="ดูรายละเอียด" aria-label="ดูรายละเอียด"><Eye size={13} /></button>
                          {/* Phase 24.0-noniesdecies (2026-05-06) — "+ สร้างนัด"
                              button on deposit rows that DON'T yet have a linked
                              appointment. Click → opens AppointmentFormModal in
                              create-for-existing-deposit mode. The new appt
                              auto-appears in BackendDashboard's จองมัดจำ
                              sub-tab (be_appointments doc) + the deposit doc
                              gains hasAppointment=true + linkedAppointmentId. */}
                          {!dep.hasAppointment && !dep.linkedAppointmentId
                            && dep.status !== 'cancelled' && dep.status !== 'refunded' && (
                            <button
                              onClick={() => setApptForDepositModal(dep)}
                              data-testid="deposit-add-appointment-btn"
                              className="p-2 rounded hover:bg-emerald-900/20 text-emerald-400"
                              title="สร้างนัดสำหรับมัดจำนี้"
                              aria-label="สร้างนัด"
                            >
                              <CalendarPlus size={13} />
                            </button>
                          )}
                          {/* Phase 24.0-vicies-octies (2026-05-06) — "ไปที่นัด"
                              button on rows WITH a linked appointment. Click →
                              opens new browser tab on BackendDashboard's
                              appointment-deposit sub-tab on the appointment's
                              date. User: "ทำให้จากหน้า tab=finance มีปุ่ม
                              ไปที่นัด เมื่อกดก็จะเด้งไป tab=appointment-deposit
                              ในวันนั้น นัดนั้นเลย". */}
                          {(dep.hasAppointment || dep.linkedAppointmentId) && dep.appointment?.date && (
                            <button
                              onClick={() => {
                                const apptDate = String(dep.appointment?.date || '').trim();
                                if (!apptDate) return;
                                const origin = (typeof window !== 'undefined' && window.location?.origin) || '';
                                const url = `${origin}/?backend=1&tab=appointment-deposit&date=${encodeURIComponent(apptDate)}`;
                                if (typeof window !== 'undefined' && typeof window.open === 'function') {
                                  window.open(url, '_blank', 'noopener,noreferrer');
                                }
                              }}
                              data-testid="deposit-goto-appointment-btn"
                              className="p-2 rounded hover:bg-blue-900/20 text-blue-400"
                              title="ไปที่นัด (เปิดแท็บใหม่)"
                              aria-label="ไปที่นัด"
                            >
                              <Calendar size={13} />
                            </button>
                          )}
                          {canEdit && (
                            <button onClick={() => openEdit(dep)} className="p-2 rounded hover:bg-sky-900/20 text-sky-400" title="แก้ไข" aria-label="แก้ไข"><Edit3 size={13} /></button>
                          )}
                          {canRefund && (
                            <button onClick={() => openRefund(dep)} className="p-2 rounded hover:bg-purple-900/20 text-purple-400" title="คืนเงิน" aria-label="คืนเงิน"><RotateCcw size={13} /></button>
                          )}
                          {canCancel && (
                            <button onClick={() => openCancel(dep)} className="p-2 rounded hover:bg-red-900/20 text-red-400" title="ยกเลิก" aria-label="ยกเลิก"><Ban size={13} /></button>
                          )}
                          {canDelete && (
                            <button onClick={() => handleDelete(dep)} className="p-2 rounded hover:bg-red-900/20 text-red-400" title="ลบ" aria-label="ลบ"><Trash2 size={13} /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      {viewingDeposit && <DetailModal dep={viewingDeposit} isDark={isDark} onClose={() => setViewingDeposit(null)} />}

      {/* Phase 24.0-vicies-novies (2026-05-07) — share-link modal for
          customer-later deposit cards. Surfaces URL + QR + copy/print
          helpers after provisionOpdLinkForBookingPair mints the session. */}
      {sendLinkModal && (
        <SendCustomerLinkModal
          isOpen={true}
          onClose={async () => {
            setSendLinkModal(null);
            // Refresh list so the linkedOpdSessionId badge flips on the row.
            try { await loadList(); } catch { /* best-effort */ }
          }}
          sessionId={sendLinkModal.sessionId}
          url={sendLinkModal.url}
          sessionName={sendLinkModal.sessionName}
          alreadyProvisioned={sendLinkModal.alreadyProvisioned}
        />
      )}

      {/* Phase 24.0-noniesdecies (2026-05-06) — "+ สร้างนัด" modal.
          existingDepositId prop tells AppointmentFormModal to use
          createAppointmentForExistingDeposit instead of pair-helper. */}
      {apptForDepositModal && (
        <AppointmentFormModal
          mode="create"
          theme={isDark ? 'dark' : 'light'}
          lockedAppointmentType="deposit-booking"
          existingDepositId={apptForDepositModal.depositId || apptForDepositModal.id}
          // Pre-fill from the deposit's existing customer/time/etc when
          // available. lockedCustomer is set only when a real customer is
          // already linked; otherwise the modal opens in pickLater mode +
          // the form-data hydration below restores the temp identity.
          lockedCustomer={apptForDepositModal.customerId ? {
            id: apptForDepositModal.customerId,
            proClinicId: apptForDepositModal.customerId,
            proClinicHN: apptForDepositModal.customerHN || '',
            patientData: { firstName: apptForDepositModal.customerName || '', lastName: '' },
          } : null}
          initialDate={apptForDepositModal.appointment?.date || apptForDepositModal.paymentDate}
          initialStartTime={apptForDepositModal.appointment?.startTime || ''}
          initialEndTime={apptForDepositModal.appointment?.endTime || ''}
          initialRoomName={apptForDepositModal.appointment?.roomName || ''}
          skipHolidayCheck
          skipCollisionCheck
          enableCustomerLink={false}
          onSaved={async () => {
            await loadList();
            setApptForDepositModal(null);
          }}
          onClose={() => setApptForDepositModal(null)}
        />
      )}

      {/* (2026-05-26) deposit-aware HARD delete — ลบมัดจำ+ยกเลิกนัด / ลบแต่มัดจำ-เก็บนัด */}
      {deleteDialog && (
        <DepositAwareCancelDialog
          open
          orientation="deposit"
          depositId={deleteDialog.dep.depositId || deleteDialog.dep.id}
          subtitle={`มัดจำ ${deleteDialog.dep.depositId || ''} · ผูกกับนัดหมาย`}
          onChoice={async (choice) => {
            const dlg = deleteDialog;
            setDeleteDialog(null);
            if (!dlg || choice === 'cancel') return;
            const depId = dlg.dep.depositId || dlg.dep.id;
            try {
              if (choice === 'both') {
                await deleteDepositBookingPair(depId); // hard: deposit + linked appt
              } else {
                await deleteDeposit(depId); // deposit only — keep the appt
              }
              loadList();
            } catch (err) { alert(err.message || 'ลบไม่สำเร็จ'); }
          }}
          onClose={() => setDeleteDialog(null)}
        />
      )}
      {cancelModal && (
        // AV78 (EOD8): backdrop click does NOT close — explicit close only (X / Cancel / ESC)
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60" role="dialog" aria-modal="true" aria-labelledby="deposit-cancel-title"
          onKeyDown={e => { if (e.key === 'Escape') setCancelModal(null); }}>
          <div className={`w-full max-w-md mx-4 rounded-2xl shadow-2xl ${isDark ? 'bg-[var(--bg-surface)] border border-[var(--bd)]' : 'bg-white border border-gray-200'}`}
            onClick={e => e.stopPropagation()}>
            <div className={`px-5 py-4 border-b ${isDark ? 'border-[var(--bd)]' : 'border-gray-200'}`}>
              <h3 id="deposit-cancel-title" className="text-sm font-bold text-red-400">ยกเลิกมัดจำ {cancelModal.depositId}</h3>
              <p className="text-xs text-[var(--tx-muted)] mt-1">{cancelModal.customerName} · {fmtMoney(cancelModal.amount)} บาท</p>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className={labelCls}>เหตุผล *</label>
                <textarea value={cancelNote} onChange={e => setCancelNote(e.target.value)} rows={3}
                  className={`${inputCls} resize-none`} placeholder="ระบุเหตุผลการยกเลิก..." />
              </div>
              <FileUploadField
                storagePath={`uploads/be_deposits/${cancelModal.depositId}`}
                fieldName="cancelEvidence"
                label="แนบหลักฐานการยกเลิก (ถ้ามี)"
                isDark={isDark}
                onUploadComplete={({ url }) => setCancelEvidenceUrl(url)}
                onDelete={() => setCancelEvidenceUrl('')}
              />
              {cancelError && <div className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={12} />{cancelError}</div>}
            </div>
            <div className={`px-5 py-4 border-t flex justify-end gap-2 ${isDark ? 'border-[var(--bd)]' : 'border-gray-200'}`}>
              <button onClick={() => setCancelModal(null)} className={`px-4 py-2 rounded-lg text-xs font-bold ${isDark ? 'bg-[var(--bg-hover)] text-[var(--tx-muted)]' : 'bg-gray-100 text-gray-600'}`}>ปิด</button>
              <button onClick={handleCancel} disabled={cancelSaving} className="px-4 py-2 rounded-lg text-xs font-bold bg-red-700 text-white hover:bg-red-600 disabled:opacity-50 flex items-center gap-1.5">
                {cancelSaving ? <Loader2 size={12} className="animate-spin" /> : <Ban size={12} />}
                ยืนยันยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      {refundModal && (
        // AV78 (EOD8): backdrop click does NOT close — explicit close only (X / Cancel / ESC)
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60" role="dialog" aria-modal="true" aria-labelledby="deposit-refund-title"
          onKeyDown={e => { if (e.key === 'Escape') setRefundModal(null); }}>
          <div className={`w-full max-w-md mx-4 rounded-2xl shadow-2xl ${isDark ? 'bg-[var(--bg-surface)] border border-[var(--bd)]' : 'bg-white border border-gray-200'}`}
            onClick={e => e.stopPropagation()}>
            <div className={`px-5 py-4 border-b ${isDark ? 'border-[var(--bd)]' : 'border-gray-200'}`}>
              <h3 id="deposit-refund-title" className="text-sm font-bold text-purple-400">คืนเงินมัดจำ {refundModal.depositId}</h3>
              <p className="text-xs text-[var(--tx-muted)] mt-1">{refundModal.customerName} · คงเหลือ {fmtMoney(refundModal.remainingAmount)} บาท</p>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>จำนวนคืน (บาท) *</label>
                  <input type="number" value={refundAmount} onChange={e => setRefundAmount(e.target.value)}
                    className={inputCls} placeholder="0" min="1" max={refundModal.remainingAmount} />
                </div>
                <div>
                  <label className={labelCls}>ช่องทางคืน</label>
                  <select value={refundChannel} onChange={e => setRefundChannel(e.target.value)} className={inputCls}>
                    {PAYMENT_CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className={labelCls}>วันที่คืน</label>
                <DateField value={refundDate} onChange={setRefundDate} />
              </div>
              <div>
                <label className={labelCls}>หมายเหตุ</label>
                <textarea value={refundNote} onChange={e => setRefundNote(e.target.value)} rows={2}
                  className={`${inputCls} resize-none`} placeholder="ระบุหมายเหตุ (ถ้ามี)" />
              </div>
              {refundError && <div className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={12} />{refundError}</div>}
            </div>
            <div className={`px-5 py-4 border-t flex justify-end gap-2 ${isDark ? 'border-[var(--bd)]' : 'border-gray-200'}`}>
              <button onClick={() => setRefundModal(null)} className={`px-4 py-2 rounded-lg text-xs font-bold ${isDark ? 'bg-[var(--bg-hover)] text-[var(--tx-muted)]' : 'bg-gray-100 text-gray-600'}`}>ปิด</button>
              <button onClick={handleRefund} disabled={refundSaving || !canRefund}
                title={!canRefund ? 'ไม่มีสิทธิ์คืนมัดจำ' : undefined}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-purple-700 text-white hover:bg-purple-600 disabled:opacity-50 flex items-center gap-1.5">
                {refundSaving ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                ยืนยันคืน
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ══════════════════ FORM OVERLAY ══════════════════
  function renderForm() {
    return (
      <div className={`fixed inset-0 z-[80] overflow-y-auto ${isDark ? 'bg-[var(--bg-elevated)] text-[var(--tx-primary)]' : 'bg-gray-50 text-gray-800'}`}>
        <div className={`sticky top-0 z-10 border-b backdrop-blur-sm ${isDark ? 'bg-[var(--bg-elevated)]/95 border-[var(--bd)]' : 'bg-white/95 border-gray-200'}`}>
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
            <button onClick={() => setFormOpen(false)} className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)]" aria-label="กลับ"><ArrowLeft size={16} /></button>
            <h2 className="text-sm font-black tracking-tight text-emerald-400 flex items-center gap-2">
              <Wallet size={16} /> {editingDeposit ? 'แก้ไขมัดจำ' : 'สร้างมัดจำ'}
            </h2>
            {customerName && <span className="text-xs text-[var(--tx-muted)]">| {customerName}</span>}
          </div>
        </div>

        {success ? (
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
              <CheckCircle2 size={48} className="mx-auto text-emerald-400 mb-3" />
              <p className="text-sm font-bold text-emerald-400">{editingDeposit ? 'บันทึกสำเร็จ' : 'สร้างมัดจำสำเร็จ'}</p>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
            {/* Customer picker */}
            <div className={`p-4 rounded-xl border ${isDark ? 'bg-[var(--bg-card)] border-[var(--bd)]' : 'bg-white border-gray-200'}`}>
              <label className={labelCls}>ลูกค้า *</label>
              {customerName ? (
                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-emerald-900/10 border border-emerald-700/30">
                  <span className="text-xs font-bold">
                    {customerName} <span className="font-mono text-[var(--tx-muted)]">{customerHN}</span>
                  </span>
                  {!editingDeposit && (
                    <button onClick={() => { setCustomerId(''); setCustomerName(''); setCustomerHN(''); }} className="text-[var(--tx-muted)] hover:text-red-400" aria-label="ล้าง"><X size={14} /></button>
                  )}
                </div>
              ) : (
                <div>
                  <input type="text" value={customerSearch} onChange={e => setCustomerSearch(e.target.value)}
                    placeholder="ค้นหาชื่อ / HN..." className={inputCls} />
                  {filteredCustomers.length > 0 && customerSearch && (
                    <div className={`mt-1 max-h-32 overflow-y-auto border rounded-lg ${isDark ? 'border-[var(--bd-strong)] bg-[var(--bg-surface)]' : 'border-gray-200 bg-white'}`}>
                      {filteredCustomers.map(c => {
                        const nm = `${c.patientData?.prefix || ''} ${c.patientData?.firstName || ''} ${c.patientData?.lastName || ''}`.trim();
                        return (
                          <button key={c.id} onClick={() => { setCustomerId(c.proClinicId || c.id); setCustomerName(nm); setCustomerHN(c.proClinicHN || ''); setCustomerSearch(''); }}
                            className="w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--bg-hover)] flex justify-between">
                            {/* Task 9 LR-4 (2026-05-15) — CustomerOption surfaces 🟢/⚪️ LINE
                                badge so admin can see per-branch LINE linkage before
                                picking the customer for this deposit. */}
                            <CustomerOption customer={{ ...c, name: nm }} contextBranchId={selectedBranchId} />
                            <span className="text-xs font-mono text-[var(--tx-muted)]">{c.proClinicHN || ''}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              {/* Task 10 LR-4 (2026-05-15) — LINE-notify confirmation card.
                  Only renders when this deposit will create an appointment
                  (hasAppointment=true). Shows green checkbox + display name
                  when linked at this branch, yellow warning when linked
                  elsewhere, or null otherwise. */}
              {hasAppointment && (
                <LineNotifyConfirmation
                  customer={selectedCustomerDoc}
                  targetBranchId={selectedBranchId}
                  checked={notifyChannel.includes('line')}
                  onChange={(val) => setNotifyChannel((prev) =>
                    val ? Array.from(new Set([...prev, 'line'])) : prev.filter((c) => c !== 'line'),
                  )}
                />
              )}
            </div>

            {/* Payment fields */}
            <div className={`p-4 rounded-xl border space-y-3 ${isDark ? 'bg-[var(--bg-card)] border-[var(--bd)]' : 'bg-white border-gray-200'}`}>
              <h3 className="text-xs font-bold uppercase tracking-widest text-emerald-400">ข้อมูลมัดจำ</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>ยอดมัดจำ (บาท) *</label>
                  {/* Phase 24.0-vicies-quater (2026-05-06) — same wheel-scroll
                      fix as the kiosk paymentAmount input. type="number"
                      reacts to wheel + arrow keys causing accidental
                      decrement (2000 → 1999, 1000 → 998). type="text" +
                      inputMode="numeric" + sanitizer + onWheel-blur is
                      bullet-proof. */}
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={amount}
                    onChange={e => setAmount(String(e.target.value).replace(/[^\d.]/g, ''))}
                    onWheel={e => e.target.blur()}
                    className={inputCls}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className={labelCls}>ช่องทางชำระเงิน *</label>
                  <select value={paymentChannel} onChange={e => setPaymentChannel(e.target.value)} className={inputCls}>
                    <option value="">เลือกช่องทาง</option>
                    {PAYMENT_CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>วันที่จ่ายมัดจำ *</label>
                  <DateField value={paymentDate} onChange={setPaymentDate} />
                </div>
                <div>
                  <label className={labelCls}>เวลา</label>
                  <input type="time" value={paymentTime} onChange={e => setPaymentTime(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>เลขอ้างอิง</label>
                  <input type="text" value={refNo} onChange={e => setRefNo(e.target.value)} className={inputCls} placeholder="REF-..." />
                </div>
              </div>
              <FileUploadField
                storagePath={`uploads/be_deposits/${editingDeposit?.depositId || `_pending_${Date.now()}`}`}
                fieldName="paymentEvidence"
                label="แนบหลักฐานชำระเงิน"
                value={paymentEvidenceUrl}
                isDark={isDark}
                onUploadComplete={({ url, storagePath }) => { setPaymentEvidenceUrl(url); setPaymentEvidencePath(storagePath); }}
                onDelete={() => { setPaymentEvidenceUrl(''); setPaymentEvidencePath(''); }}
              />
              <div>
                <label className={labelCls}>หมายเหตุ</label>
                <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                  className={`${inputCls} resize-none`} placeholder="หมายเหตุ (ถ้ามี)" />
              </div>
            </div>

            {/* Sellers (create only — edit form hides per §20.1) */}
            {!editingDeposit && (
              <div className={`p-4 rounded-xl border ${isDark ? 'bg-[var(--bg-card)] border-[var(--bd)]' : 'bg-white border-gray-200'}`}>
                <h3 className="text-xs font-bold uppercase tracking-widest text-orange-400 flex items-center gap-1.5 mb-3">
                  <UsersIcon size={12} /> พนักงานขาย (5 ช่อง)
                </h3>
                <div className="space-y-1.5">
                  {sellers.map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input type="checkbox" checked={s.enabled}
                        onChange={e => setSellers(prev => prev.map((x, j) => j === i ? { ...x, enabled: e.target.checked } : x))}
                        className="accent-orange-500" aria-label={`เปิดพนักงานขายช่อง ${i + 1}`} />
                      <select value={s.id} onChange={e => {
                        const sel = staffOptions.find(x => String(x.id) === e.target.value);
                        setSellers(prev => prev.map((x, j) => j === i ? { ...x, id: e.target.value, name: sel?.name || '' } : x));
                      }} className={`${inputCls} !w-64`} disabled={!s.enabled}>
                        <option value="">เลือกพนักงาน</option>
                        {staffOptions.map(opt => <option key={opt.id} value={opt.id}>{opt.name}{opt.position ? ` — ${opt.position}` : ''}</option>)}
                      </select>
                      <input type="number" value={s.percent}
                        onChange={e => setSellers(prev => prev.map((x, j) => j === i ? { ...x, percent: e.target.value } : x))}
                        className={`${inputCls} !w-20 text-center`} placeholder="%" disabled={!s.enabled} />
                      <span className="text-xs text-[var(--tx-muted)]">%</span>
                      <input type="number" value={s.total}
                        onChange={e => setSellers(prev => prev.map((x, j) => j === i ? { ...x, total: e.target.value } : x))}
                        className={`${inputCls} !w-28 text-right`} placeholder="0" disabled={!s.enabled} />
                      <span className="text-xs text-[var(--tx-muted)]">บาท</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Customer source (create only) */}
            {!editingDeposit && (
              <div className={`p-4 rounded-xl border ${isDark ? 'bg-[var(--bg-card)] border-[var(--bd)]' : 'bg-white border-gray-200'}`}>
                <h3 className="text-xs font-bold uppercase tracking-widest text-sky-400 mb-3">แหล่งที่มาลูกค้า</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>แหล่งที่มา</label>
                    <select value={customerSource} onChange={e => setCustomerSource(e.target.value)} className={inputCls}>
                      <option value="">ไม่ระบุ</option>
                      {CUSTOMER_SOURCES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>รายละเอียด</label>
                    <input type="text" value={sourceDetail} onChange={e => setSourceDetail(e.target.value)}
                      className={inputCls} placeholder="รายละเอียดเพิ่มเติม" />
                  </div>
                </div>
              </div>
            )}

            {/* Appointment toggle + sub-form (create only) */}
            {!editingDeposit && (
              <div className={`p-4 rounded-xl border ${isDark ? 'bg-[var(--bg-card)] border-[var(--bd)]' : 'bg-white border-gray-200'}`}>
                <div className="flex items-center gap-4 mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-violet-400 flex items-center gap-1.5">
                    <Calendar size={12} /> นัดหมาย
                  </h3>
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                    <input type="radio" checked={!hasAppointment} onChange={() => setHasAppointment(false)} className="accent-violet-500" />ไม่นัดหมาย
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                    <input type="radio" checked={hasAppointment} onChange={() => setHasAppointment(true)} className="accent-violet-500" />จองนัดหมาย
                  </label>
                </div>
                {hasAppointment && (
                  <div className="space-y-3">
                    {/* Type + Recurring option */}
                    <div className="flex flex-wrap gap-4 text-xs">
                      <div className="flex gap-3">
                        <span className="text-[var(--tx-muted)] font-bold">ประเภท:</span>
                        {APPOINTMENT_TYPES.map(t => (
                          <label key={t.value} className="flex items-center gap-1 cursor-pointer">
                            <input type="radio" checked={apptType === t.value} onChange={() => setApptType(t.value)} className="accent-violet-500" />{t.label}
                          </label>
                        ))}
                      </div>
                      <div className="flex gap-3">
                        <span className="text-[var(--tx-muted)] font-bold">ตัวเลือก:</span>
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input type="radio" checked={apptOption === 'once'} onChange={() => setApptOption('once')} className="accent-violet-500" />นัดครั้งเดียว
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input type="radio" checked={apptOption === 'multiple'} onChange={() => setApptOption('multiple')} className="accent-violet-500" />นัดหลายครั้ง
                        </label>
                      </div>
                    </div>
                    {apptOption === 'multiple' && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-[var(--tx-muted)]">ทุก</span>
                        <input type="number" value={apptEveryN} onChange={e => setApptEveryN(e.target.value)} min="1" className={`${inputCls} !w-16 text-center`} />
                        <select value={apptUnit} onChange={e => setApptUnit(e.target.value)} className={`${inputCls} !w-20`}>
                          <option value="วัน">วัน</option><option value="เดือน">เดือน</option>
                        </select>
                        <span className="text-[var(--tx-muted)]">จำนวน</span>
                        <input type="number" value={apptTimes} onChange={e => setApptTimes(e.target.value)} min="1" className={`${inputCls} !w-16 text-center`} />
                        <span className="text-[var(--tx-muted)]">ครั้ง</span>
                      </div>
                    )}
                    {/* Date + Times */}
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className={labelCls}>วันนัด *</label>
                        <DateField value={apptDate} onChange={setApptDate} />
                      </div>
                      <div>
                        <label className={labelCls}>เริ่ม *</label>
                        <select value={apptStartTime} onChange={e => setApptStartTime(e.target.value)} className={inputCls}>
                          {/* V53 (BS-12) — filtered by branch openHours for selected date */}
                          {visibleSlots.map(t => <option key={t} value={t}>{t}</option>)}
                          {apptStartTime && !visibleSlots.includes(apptStartTime) && (
                            <option key={`legacy-${apptStartTime}`} value={apptStartTime}>{apptStartTime}</option>
                          )}
                        </select>
                        {isTimeOutsideOpenHours(apptStartTime, apptDate, cs) && (
                          <p className="text-[10px] text-amber-400 mt-1" data-testid="deposit-modal-startTime-warning">
                            ⚠ นอกเวลาเปิดสาขา
                          </p>
                        )}
                      </div>
                      <div>
                        <label className={labelCls}>สิ้นสุด</label>
                        <select value={apptEndTime} onChange={e => setApptEndTime(e.target.value)} className={inputCls}>
                          {visibleSlots.map(t => <option key={t} value={t}>{t}</option>)}
                          {apptEndTime && !visibleSlots.includes(apptEndTime) && (
                            <option key={`legacy-${apptEndTime}`} value={apptEndTime}>{apptEndTime}</option>
                          )}
                        </select>
                      </div>
                    </div>
                    {/* Doctor + Room */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>แพทย์</label>
                        <select value={apptDoctorId} onChange={e => {
                          const d = doctors.find(x => String(x.id) === e.target.value);
                          setApptDoctorId(e.target.value); setApptDoctorName(d?.name || '');
                        }} className={inputCls}>
                          <option value="">ไม่ระบุ</option>
                          {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>ห้องตรวจ</label>
                        <select
                          aria-label="ห้องตรวจ"
                          value={apptRoomId}
                          onChange={e => {
                            const id = e.target.value;
                            const room = examRooms.find(r => (r.examRoomId || r.id) === id);
                            setApptRoomId(id);
                            setApptRoomName(room ? room.name : '');
                          }}
                          className={inputCls}>
                          <option value="">— ไม่ระบุห้อง —</option>
                          {examRooms.map(r => <option key={r.examRoomId || r.id} value={r.examRoomId || r.id}>{r.name}</option>)}
                        </select>
                      </div>
                    </div>
                    {/* Assistants (multi, max 5) */}
                    <div>
                      <label className={labelCls}>ผู้ช่วยแพทย์ (สูงสุด 5 คน)</label>
                      <div className="flex flex-wrap gap-1.5">
                        {doctors.map(d => {
                          const idStr = String(d.id);
                          const picked = apptAssistantIds.includes(idStr);
                          return (
                            <label key={d.id}
                              className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg cursor-pointer border transition-all ${
                                picked
                                  ? (isDark ? 'bg-violet-900/30 border-violet-700/40 text-violet-400' : 'bg-violet-50 border-violet-200 text-violet-700')
                                  : 'bg-[var(--bg-input)] border-[var(--bd)] text-[var(--tx-muted)]'
                              }`}>
                              <input type="checkbox" checked={picked}
                                onChange={e => setApptAssistantIds(prev => e.target.checked
                                  ? [...prev, idStr].slice(0, 5)
                                  : prev.filter(x => x !== idStr))}
                                className="accent-violet-500 w-3 h-3" />
                              {d.name}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    {/* Channel + Color */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>ช่องทางนัดหมาย</label>
                        <select value={apptChannel} onChange={e => setApptChannel(e.target.value)} className={inputCls}>
                          <option value="">ไม่ระบุ</option>
                          {APPT_CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>สีนัดหมาย</label>
                        <select value={apptColor} onChange={e => setApptColor(e.target.value)} className={inputCls}>
                          <option value="">ไม่ระบุ</option>
                          {APPT_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                    {/* Purpose + Note */}
                    <div>
                      <label className={labelCls}>นัดมาเพื่อ</label>
                      <textarea value={apptPurpose} onChange={e => setApptPurpose(e.target.value)} rows={2}
                        className={`${inputCls} resize-none`} placeholder="botox, filler..." />
                    </div>
                    <div>
                      <label className={labelCls}>โน้ต (สำหรับคลินิก)</label>
                      <textarea value={apptNote} onChange={e => setApptNote(e.target.value)} rows={2}
                        className={`${inputCls} resize-none`} placeholder="รายละเอียดเพิ่มเติม" />
                    </div>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input type="checkbox" checked={apptLineNotify} onChange={e => setApptLineNotify(e.target.checked)} className="accent-emerald-500" />
                      แจ้งเตือนนัดหมายทาง LINE
                    </label>
                  </div>
                )}
              </div>
            )}

            {/* Error + Submit */}
            {error && <div className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={12} />{error}</div>}
            <div className="flex justify-end gap-2 pb-8">
              <button onClick={() => setFormOpen(false)}
                className={`px-4 py-2 rounded-lg text-xs font-bold ${isDark ? 'bg-[var(--bg-hover)] text-[var(--tx-muted)]' : 'bg-gray-100 text-gray-600'}`}>ยกเลิก</button>
              <button onClick={handleSave} disabled={saving}
                className="px-6 py-2 rounded-lg text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 flex items-center gap-1.5">
                {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                {editingDeposit ? 'บันทึก' : 'สร้างมัดจำ'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }
}

function EmptyState({ onCreate, isDark }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="relative mb-6">
        <div className="w-20 h-20 rounded-2xl flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(16,185,129,0.05))',
            border: '1.5px solid rgba(16,185,129,0.3)',
            boxShadow: '0 0 40px rgba(16,185,129,0.15)',
          }}>
          <Wallet size={32} className="text-emerald-400" />
        </div>
        <div className="absolute -inset-4 rounded-3xl opacity-30"
          style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.15) 0%, transparent 70%)' }} />
      </div>
      <h3 className="text-xl font-black text-[var(--tx-heading)] mb-2 tracking-tight">ยังไม่มีมัดจำ</h3>
      <p className="text-sm text-[var(--tx-muted)] max-w-lg mx-auto text-center leading-relaxed mb-6">
        บันทึกมัดจำลูกค้า ติดตามยอดคงเหลือ และผูกกับนัดหมายได้ในที่เดียว
      </p>
      <button onClick={onCreate}
        className="px-6 py-2.5 rounded-xl font-black text-xs text-white transition-all flex items-center gap-2 hover:shadow-xl uppercase tracking-wider"
        style={{ background: 'linear-gradient(135deg, #047857, #10b981)', boxShadow: '0 4px 20px rgba(16,185,129,0.35)' }}>
        <Plus size={14} /> สร้างมัดจำรายการแรก
      </button>
    </div>
  );
}

function DetailModal({ dep, isDark, onClose }) {
  const labelCls = 'text-[11px] font-bold uppercase tracking-widest text-[var(--tx-muted)] mb-1 block';
  // Prefer the stored remainingAmount (source of truth — accounts for apply AND refund).
  // Fall back to amount - usedAmount only when the field is missing (legacy docs).
  const remain = dep.remainingAmount != null
    ? Number(dep.remainingAmount) || 0
    : calcDepositRemaining(dep.amount, dep.usedAmount);
  return (
    // AV78 (EOD8): backdrop click does NOT close — explicit close only (X / Cancel / ESC)
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="deposit-detail-title"
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
      <div className={`w-full max-w-2xl mx-4 rounded-2xl shadow-2xl max-h-[85vh] overflow-y-auto ${isDark ? 'bg-[var(--bg-surface)] border border-[var(--bd)]' : 'bg-white border border-gray-200'}`}
        onClick={e => e.stopPropagation()}>
        <div className={`px-5 py-4 border-b flex items-center justify-between sticky top-0 z-10 ${isDark ? 'border-[var(--bd)] bg-[var(--bg-surface)]' : 'border-gray-200 bg-white'}`}>
          <div>
            <h3 id="deposit-detail-title" className="text-sm font-bold text-emerald-400">{dep.depositId}</h3>
            <p className="text-xs text-[var(--tx-muted)]">{dep.customerName} {dep.customerHN && `· ${dep.customerHN}`} · {fmtThaiDate(dep.paymentDate)}</p>
          </div>
          <button onClick={onClose} className="text-[var(--tx-muted)] hover:text-[var(--tx-primary)]" aria-label="ปิด"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4 text-xs">
          <div className={`p-3 rounded-lg ${isDark ? 'bg-[var(--bg-elevated)]' : 'bg-gray-50'}`}>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-[10px] text-[var(--tx-muted)] uppercase">ยอด</p>
                <p className="font-bold text-[var(--tx-heading)] font-mono text-sm">{fmtMoney(dep.amount)}</p>
              </div>
              <div>
                <p className="text-[10px] text-[var(--tx-muted)] uppercase">ใช้ไป</p>
                <p className="font-bold text-sky-400 font-mono text-sm">{fmtMoney(dep.usedAmount)}</p>
              </div>
              <div>
                <p className="text-[10px] text-[var(--tx-muted)] uppercase">คงเหลือ</p>
                <p className="font-bold text-emerald-400 font-mono text-sm">{fmtMoney(remain)}</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><p className={labelCls}>ช่องทางชำระ</p><p>{dep.paymentChannel || '-'}</p></div>
            <div><p className={labelCls}>สถานะ</p><StatusBadge status={dep.status} isDark={isDark} /></div>
            {dep.paymentTime && <div><p className={labelCls}>เวลาจ่าย</p><p>{dep.paymentTime}</p></div>}
            {dep.refNo && <div><p className={labelCls}>เลขอ้างอิง</p><p className="font-mono">{dep.refNo}</p></div>}
          </div>
          {dep.sellers?.length > 0 && (
            <div>
              <p className={labelCls}>พนักงานขาย</p>
              <div className="space-y-0.5">
                {dep.sellers.map((s, i) => (
                  <div key={i} className="flex justify-between">
                    {/* V22 follow-up (2026-04-27) — never leak numeric s.id */}
                    <span>{resolveSellerName(s, []) || 'ไม่ระบุ'}</span>
                    <span className="text-[var(--tx-muted)]">{s.percent}% / {fmtMoney(s.total)} บาท</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {(dep.customerSource || dep.sourceDetail) && (
            <div className="grid grid-cols-2 gap-3">
              <div><p className={labelCls}>แหล่งที่มา</p><p>{dep.customerSource || '-'}</p></div>
              <div><p className={labelCls}>รายละเอียด</p><p>{dep.sourceDetail || '-'}</p></div>
            </div>
          )}
          {dep.hasAppointment && dep.appointment && (
            <div className={`p-3 rounded-lg border ${isDark ? 'bg-violet-950/20 border-violet-900/40' : 'bg-violet-50 border-violet-200'}`}>
              <p className="text-[11px] font-bold text-violet-400 uppercase mb-2 flex items-center gap-1">
                <Calendar size={10} /> นัดหมาย
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><p className="text-[var(--tx-muted)]">วัน/เวลา</p><p>{fmtThaiDate(dep.appointment.date)} · {dep.appointment.startTime}–{dep.appointment.endTime}</p></div>
                <div><p className="text-[var(--tx-muted)]">แพทย์</p><p>{dep.appointment.doctorName || '-'}</p></div>
                {dep.appointment.roomName && <div><p className="text-[var(--tx-muted)]">ห้อง</p><p>{dep.appointment.roomName}</p></div>}
                {dep.appointment.purpose && <div className="col-span-2"><p className="text-[var(--tx-muted)]">นัดมาเพื่อ</p><p>{dep.appointment.purpose}</p></div>}
              </div>
            </div>
          )}
          {dep.usageHistory?.length > 0 && (
            <div>
              <p className={labelCls}>ประวัติการใช้</p>
              <div className="space-y-1">
                {dep.usageHistory.map((u, i) => (
                  <div key={i} className={`flex justify-between px-2 py-1 rounded ${isDark ? 'bg-[var(--bg-elevated)]' : 'bg-gray-50'}`}>
                    <span className="font-mono text-sky-400">{u.saleId}</span>
                    <span className="font-mono">{fmtMoney(u.amount)} บาท</span>
                    <span className="text-[var(--tx-muted)]">{u.date ? new Date(u.date).toLocaleDateString('th-TH') : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {dep.status === 'cancelled' && (
            <div className={`p-3 rounded-lg border ${isDark ? 'bg-red-950/20 border-red-900/40' : 'bg-red-50 border-red-200'}`}>
              <p className="text-[11px] font-bold text-red-400 uppercase mb-1">ยกเลิกแล้ว</p>
              <p className="text-[var(--tx-secondary)]">เหตุผล: {dep.cancelNote || '-'}</p>
              {dep.cancelledAt && <p className="text-[var(--tx-muted)] text-[10px] mt-1">เมื่อ: {new Date(dep.cancelledAt).toLocaleString('th-TH')}</p>}
            </div>
          )}
          {dep.status === 'refunded' && dep.refundAmount > 0 && (
            <div className={`p-3 rounded-lg border ${isDark ? 'bg-purple-950/20 border-purple-900/40' : 'bg-purple-50 border-purple-200'}`}>
              <p className="text-[11px] font-bold text-purple-400 uppercase mb-1">คืนเงินแล้ว</p>
              <p className="text-[var(--tx-secondary)]">จำนวนคืน: {fmtMoney(dep.refundAmount)} บาท ({dep.refundChannel || '-'})</p>
              {dep.refundDate && <p className="text-[var(--tx-muted)] text-[10px] mt-1">วันที่: {new Date(dep.refundDate).toLocaleDateString('th-TH')}</p>}
            </div>
          )}
          {dep.note && <div><p className={labelCls}>หมายเหตุ</p><p className="text-[var(--tx-secondary)]">{dep.note}</p></div>}
        </div>
      </div>
    </div>
  );
}
