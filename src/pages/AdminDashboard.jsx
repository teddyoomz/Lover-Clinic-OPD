import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { collection, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, onSnapshot, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { app } from '../firebase.js';
import { signOut } from 'firebase/auth';
import {
  QrCode, Users, PlusCircle, ClipboardList, CheckCircle2, Clock, Activity,
  AlertCircle, Eye, X, FileText, Edit3, TimerOff, Trash2, Phone, HeartPulse,
  Pill, CheckSquare, LogOut, Lock, Flame, Printer, Link, ClipboardCheck,
  Globe, Bell, BellOff, Volume2, Settings, LayoutTemplate, Palette, Archive, History,
  Smartphone, RotateCcw, Timer, Infinity, Search, Package, PackageX, CalendarClock, Calendar, CalendarDays, Banknote, Loader2, ChevronDown, ChevronRight, ChevronLeft, Unlink, ToggleLeft, ToggleRight, ExternalLink, XCircle, UserCheck, RefreshCw, Stethoscope, MapPin, User, CreditCard, UserPlus, MessageCircle, Database, MoreHorizontal
} from 'lucide-react';
import { DEFAULT_CLINIC_SETTINGS, SESSION_TIMEOUT_MS } from '../constants.js';
import LoadErrorRetry from '../components/LoadErrorRetry.jsx';
import { useResilientLoad } from '../hooks/useResilientLoad.js';
// Phase 20.0 Tasks 1-6 + 5a-5c (2026-05-06) — Frontend ProClinic rewire
// COMPLETE. AdminDashboard no longer imports brokerClient — every broker.*
// call has been replaced with be_* equivalents from scopedDataLayer:
//
//   broker.syncAppointments        → listenToAppointmentsByMonth (live)
//   broker.list/create/update/deleteAppointment → backend appointment CRUD
//   broker.listCustomerAppointments → getCustomerAppointments
//   broker.getDepositOptions       → listStaff + listDoctors + listExamRooms
//                                   + listAllSellers + canonical TIME_SLOTS
//   broker.getLivePractitioners    → Promise.all([listDoctors, listStaff])
//   broker.getProClinicCredentials → REMOVED (cookie-relay credential auto-sync)
//   broker.searchCustomers         → searchBackendCustomers
//   broker.getCourses              → getCustomer (read .courses[] field)
//   broker.fetchPatientFromProClinic → getCustomer
//   broker.fillProClinic           → addCustomer
//   broker.updateProClinic         → updateCustomerFromForm
//   broker.deleteProClinic         → deleteCustomerCascade
//   broker.submitDeposit           → createDeposit
//   broker.updateDeposit           → updateDeposit (be_*)
//   broker.cancelDeposit           → cancelDeposit (be_*)
//
// brokerClient.js + api/proclinic/* + cookie-relay still EXIST in repo
// (used by MasterDataTab dev sync) but the Frontend layer is fully on be_*.
// Per user directive 2026-05-06 (no-deploy), production stays on V15 #22
// until next explicit deploy.
import {
  listenToAppointmentsByMonth,
  getAppointmentsByMonth,
  getCustomerAppointments,
  createBackendAppointment,
  updateBackendAppointment,
  deleteBackendAppointment,
  listStaff,
  listDoctors,
  listExamRooms,
  listAllSellers,
  searchBackendCustomers,
  getCustomer,
  addCustomer,
  updateCustomerFromForm,
  findCustomersByField,
  deleteCustomerCascade,
  createDeposit,
  updateDeposit,
  cancelDeposit,
  listStaffSchedules,       // V56 / BS-15 — auto-closure derivation in handleGenScheduleLink
  markAppointmentServiceCompleted, // V71 (2026-05-15) — service-complete writer for AppointmentHubView
  unmarkAppointmentServiceCompleted, // V71.A (2026-05-15) — symmetric un-mark writer for "↩ กลับไปคิวรอ" button
} from '../lib/scopedDataLayer.js';
import { DEFAULT_APPOINTMENT_TYPE } from '../lib/appointmentTypes.js';
// Phase 25.0c (2026-05-09) — Walk-in OPD-save → appointment-create modal flow.
// Reused from BackendDashboard's tab=appointment-all. Imported eagerly here
// because handleOpdClick can open it on click; no lazy boundary needed
// (modal is small + already built).
import AppointmentFormModal from '../components/backend/AppointmentFormModal.jsx';
// Task 9 (LINE OA Appointment Reminder, 2026-05-15) — shared customer
// name + per-branch LINE badge (LR-4 lock). Used in the appointment
// customer-picker so admin can see per-branch LINE linkage before
// linking an appointment to a customer.
import { CustomerOption } from '../components/CustomerOption.jsx';
import { VipName } from '../components/VipBadge.jsx';
import { OpdIntakeDetailBody } from '../components/OpdIntakeDetailBody.jsx';
// Task 10 (LINE OA Appointment Reminder, 2026-05-15) — per-branch
// LINE-notify confirmation card with auto-tick (LR-4 lock part 2).
import { LineNotifyConfirmation } from '../components/LineNotifyConfirmation.jsx';
// Phase 22.0b (2026-05-06 EOD) — branch-filter helpers for kiosk modals.
// listDoctors + listStaff in scopedDataLayer are UNIVERSAL (no auto-inject);
// fetchDepositOptions must filter the results by selectedBranchId so the
// kiosk modal dropdowns show only the current branch's staff/doctors.
import { filterDoctorsByBranch, filterStaffByBranch } from '../lib/branchScopeUtils.js';
// Phase 22.0b — kiosk จองมัดจำ flow now writes the paired (be_deposits +
// be_appointments) docs alongside opd_sessions, mirroring DepositPanel's
// pair-helper pattern so the deposit-booking is visible in BOTH
// Finance.มัดจำ AND BackendDashboard's จองมัดจำ sub-tab. User directive:
// "ต้องบันทึกไปในรูปแบบการจองมัดจำใน backend ได้ถูกต้อง และบันทึกมัดจำใน
//  การเงินได้ถูกต้อง ตามสาขาที่ได้มีการ Gen QR".
import { createDepositBookingPair, provisionOpdLinkForBookingPair } from '../lib/appointmentDepositBatch.js';
import { isChatHoursActiveNow } from '../lib/chatHours.js';
// V118 (2026-05-23) — Card-level OPD lifecycle row.
// V121 (2026-05-23) — extended with isCardFlowSession + isCardFlowUnread.
// V124 (2026-05-24 EOD+1) — bubble surfaces swapped to isAppointmentPendingOpdSave
// (broader state-D match). isCardFlowSession is still used by the modal-open gate
// at line ~3424 (V121 Q1=B locked behavior); isCardFlowUnread retained for any
// future Card-flow-specific surface but no longer used by the count memos.
import { isOpdSessionSaved, isCardFlowSession, isCardFlowUnread, isAppointmentPendingOpdSave } from '../lib/opdSessionState.js';
// V118 — SendCustomerLinkModal for card-level OPD link send/view (mounted at root).
import SendCustomerLinkModal from '../components/backend/SendCustomerLinkModal.jsx';
// Phase 24.0-undecies (2026-05-06) — chip + free-text "อื่นๆ" join/parse.
import { buildVisitPurposeText, parseVisitPurposeText } from '../lib/visitPurposeUtils.js';
// Phase 24.0-duodecies (2026-05-06) — open backend customer detail/edit in new tab.
import { openCustomerInNewTab, openCustomerEditInNewTab } from '../lib/customerNavigation.js';
import {
  TIME_SLOTS as CANONICAL_TIME_SLOTS,
  derivedAutoClosedDates,              // V56 / BS-15 (2026-05-08) — auto-closure helper for schedule-link gen
  derivedDoctorDaysFromSchedules,      // V60 / AV32 (2026-05-08) — doctorDays derived from be_staff_schedules (specific doctor)
  deriveDoctorRoomIdsForWindow,        // V61 / AV33 (2026-05-08) — modal room dropdown driven by be_staff_schedules (specific or แพทย์ทุกคน)
  deriveNonDoctorRoomIdsForWindow,     // V61 / AV33 (2026-05-08) — modal room dropdown for ไม่พบแพทย์ mode
  derivedDoctorDaysAcrossWindow,       // V62 / AV34 (2026-05-08) — multi-doctor doctorDays for noDoctor + ทุกคน modes (showDoctorStatus overlay)
  derivedDoctorWorkingHoursPerDate,    // V62 / AV34 (2026-05-08) — per-date doctor hours map for customDoctorHours
} from '../lib/staffScheduleValidation.js';
import {
  hexToRgb, getReasons, getHrtGoals, calculateADAM, calculateIIEFScore,
  calculateMRS, getIIEFInterpretation, generateClinicalSummary,
  formatPhoneNumberDisplay, renderDobFormat, playNotificationSound, formatBangkokTime,
  bangkokNow as bangkokNowUtil, thaiTodayISO, thaiYearMonth, genShortId
} from '../utils.js';
import ThemeToggle from '../components/ThemeToggle.jsx';
import ClinicLogo from '../components/ClinicLogo.jsx';
import PhoneLink from '../components/PhoneLink.jsx';
import { VISIT_REASON_VALUES } from '../lib/visitReasonOptions.js'; // Rule C1 single source (2026-05-25)
// V68 (2026-05-15) — LINE badge for queue-calendar appt cells. Self-nullifies
// for non-LINE appts (notifyChannel ≠ ['line']); only renders the 🟢 chip when
// the appt's reminder channel is LINE OA. See AppointmentLineBadge.jsx.
import { AppointmentLineBadge } from '../components/AppointmentLineBadge.jsx';
// Phase 20.0 Task 6 (2026-05-06) — BranchSelector in Frontend header.
// Mirrors BackendDashboard's BranchSelector mount; auto-hides for single-
// branch clinics. BranchProvider already at App.jsx (Phase 17.2) so this
// component picks up the per-user-keyed selectedBranchId immediately.
import BranchSelector from '../components/backend/BranchSelector.jsx';
import AppointmentHubView from '../components/admin/AppointmentHubView.jsx';
// Phase 29 (2026-05-14) — Recall System (Frontend daily-work view).
// Both imports bucketed into the 'recall' manualChunk (vite.config.js) to
// isolate Thai-content components from AdminDashboard's chunk (works around
// a Rolldown char-boundary panic when they were co-located).
import { RecallFrontendView } from '../components/backend/recall/RecallFrontendView.jsx';
import { RecallTogglePill } from '../components/backend/recall/RecallTogglePill.jsx';
// V55/BS-14 (2026-05-08) — useEffectiveClinicSettings merges per-branch
// settings (V51 openHoursMonFri/SatSun + chatHours*) over global cs. The
// schedule-link modal's saved doc + slot-build derivations now use these
// per-branch hours so customer links carry the SELECTED branch's open hours
// instead of the legacy global ones. User directive (verbatim 2026-05-08):
// "ทำให้ลิ้งค์ตารางที่ส่ง สัมพันธ์กับหมอที่เข้างานจริง สัมพันธ์กับห้องตรวจนั้นๆ
//  คือใช้ได้จริงและแสดงข้อมูลจริงๆในทุกๆการเลือกใน modal".
import { useSelectedBranch, useEffectiveClinicSettings } from '../lib/BranchContext.jsx';
import ClinicSettingsPanel from '../components/ClinicSettingsPanel.jsx';
import CustomFormBuilder from '../components/CustomFormBuilder.jsx';
import ChatPanel, { useChatUnread, playAlertSound, playChatNotificationSound } from '../components/ChatPanel.jsx';
import TreatmentTimeline from '../components/TreatmentTimeline.jsx';
import TreatmentFormPage from '../components/TreatmentFormPage.jsx';
import { shouldBlockScheduleSlot, shouldBlockDoctorSlot, getVisibleTimeSlotsForDate } from '../lib/scheduleFilterUtils.js';
import { shouldRingChatAlert, shouldRingChatInterval } from '../lib/chatUnreadUtils.js';
import { resolveAppointmentTypeLabel } from '../lib/appointmentDisplay.js';
import { kioskPatientToCanonical } from '../lib/kioskPatientToCanonical.js';
import DateField from '../components/DateField.jsx';

// ── Date format helpers (DD/MM/YYYY ↔ YYYY-MM-DD) ──────────────────────────
function toThaiDate(isoDate) {
  // YYYY-MM-DD → DD/MM/YYYY
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  return (y && m && d) ? `${d}/${m}/${y}` : isoDate;
}
function fromThaiDate(thaiDate) {
  // DD/MM/YYYY → YYYY-MM-DD
  if (!thaiDate) return '';
  const cleaned = thaiDate.replace(/[^0-9/]/g, '');
  const parts = cleaned.split('/');
  if (parts.length === 3 && parts[2].length === 4) return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
  return thaiDate;
}
// Thin local aliases — canonical helpers live in src/utils.js so every file
// resolves "today" / "now" in Asia/Bangkok consistently (see utils.js comment).
const bangkokNow = bangkokNowUtil;
const todayISO = thaiTodayISO;

// RP1 lift (2026-04-30) — small pure helpers extracted from inline JSX-IIFE
// per Vite-OXC ban (see CLAUDE.md rules/03-stack.md § Vite OXC).
function formatThaiAppointmentDate(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  return `${parseInt(d)}/${parseInt(m)}/${parseInt(y) + 543}`;
}

function renderDoctorLabel(doctors, value) {
  if (!doctors || !value) return null;
  const doc = doctors.find(o => o.value === value);
  return doc ? <span className="text-gray-500">แพทย์: {doc.label}</span> : null;
}
function renderJsxBlock(fn) {
  return fn();
}

// DatePickerThai removed — shared `DateField` (imported below) replaces all
// 5 use sites. Each caller's custom `className` (bg/border/focus color) is
// now passed as `fieldClassName` to preserve the original visual concept.
function nowTime() {
  const d = bangkokNow();
  return `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;
}

// ── CourseCard: stable top-level component (ห้ามวางไว้ใน render function) ─────
function CourseCard({ c, expired }) {
  const hasValue   = c.value && !c.value.includes('0.00');
  const expiryText = (c.expiry || '').replace('ใช้ได้ถึง ', '').replace('ไม่มีวันหมดอายุ', '∞');
  const daysMatch  = (c.expiry || '').match(/ภายใน (\d+) วัน|หมดอายุแล้ว (\d+) วัน/);
  const daysLeft   = daysMatch ? (daysMatch[1] ? parseInt(daysMatch[1]) : -parseInt(daysMatch[2])) : null;
  const urgentColor = daysLeft !== null && daysLeft <= 30 && daysLeft > 0 ? 'text-orange-400'
    : daysLeft !== null && daysLeft <= 0 ? 'text-red-500' : 'text-gray-400';
  return (
    <div className={`rounded-xl border p-3.5 flex flex-col gap-2.5 transition-colors ${expired ? 'border-red-900/30 bg-red-950/10' : 'border-[var(--bd)] bg-[var(--bg-card)] hover:border-teal-900/40'}`}>
      <div className="flex items-start justify-between gap-2">
        <span className={`font-bold text-sm leading-tight ${expired ? 'text-red-300' : 'text-white'}`}>{c.name}</span>
        {c.status && (
          <span className={`text-xs font-black font-semibold px-2 py-0.5 rounded-lg shrink-0 ${
            expired ? 'bg-red-950/40 border border-red-900/50 text-red-400' :
            c.status === 'กำลังใช้งาน' ? 'bg-teal-950/40 border border-teal-900/50 text-teal-400' :
            'bg-[var(--bg-hover)] border border-[var(--bd)] text-gray-400'
          }`}>{expired ? 'หมดอายุ' : c.status}</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {c.product && (
          <span className="flex items-center gap-1.5 text-xs text-gray-400">
            <Package size={11} className="shrink-0 text-gray-600"/>
            <span>{c.product}</span>
            {c.qty && c.qty !== c.product && <><span className="text-gray-500">·</span><span className="font-mono font-bold text-gray-300">{c.qty}</span></>}
          </span>
        )}
        {c.expiry && (
          <span className={`flex items-center gap-1.5 text-xs font-mono ${urgentColor}`}>
            <CalendarClock size={11} className="shrink-0"/>{expiryText}
          </span>
        )}
      </div>
      {c.value && (
        <div className={`flex items-center gap-1.5 text-xs font-bold mt-0.5 ${hasValue ? (expired ? 'text-red-400' : 'text-teal-400') : 'text-gray-600'}`}>
          <Banknote size={12} className="shrink-0"/>{c.value}
        </div>
      )}
    </div>
  );
}

// Sorted JSON.stringify — Firestore ไม่การันตี key order ใน nested objects
// ถ้า key order ต่างกัน JSON.stringify ธรรมดาจะได้ string ต่างกัน → false positive
const stableStr = (obj) => {
  if (!obj || typeof obj !== 'object') return JSON.stringify(obj);
  const sort = (o) => {
    if (Array.isArray(o)) return o.map(sort);
    if (o && typeof o === 'object') {
      return Object.keys(o).sort().reduce((r, k) => { r[k] = sort(o[k]); return r; }, {});
    }
    return o;
  };
  return JSON.stringify(sort(obj));
};

// Phase 24.0-septies (2026-05-06 evening) — graceful update helper.
// Wraps updateCustomerFromForm + getCustomer so call-sites can recover
// when the target be_customers doc was DELETED (e.g. via Phase 24.0
// cascade-delete) but the kiosk session still holds the old id in
// `session.brokerProClinicId`. Pre-fix: updateDoc throws "No document
// to update" → entire handleResync / handleOpdClick fails → user sees
// red error toast + can't sync. Now: returns notFound flag → caller
// falls through to addCustomer recovery path.
//
// Returns one of:
//   { ok: true, customerId, hn }   → update succeeded
//   { ok: false, notFound: true }  → original doc gone; caller should re-create
// Throws on unexpected errors (network, validation, etc.).
async function tryUpdateExistingCustomer(customerId, patient) {
  try {
    await updateCustomerFromForm(customerId, patient, {});
    const updated = await getCustomer(customerId);
    if (!updated) return { ok: false, notFound: true };
    return {
      ok: true,
      customerId: updated.id,
      hn: updated.hn_no || updated.proClinicHN || '',
    };
  } catch (e) {
    const msg = String(e?.code || e?.message || '');
    if (/No document to update|not[-\s]?found/i.test(msg)) {
      return { ok: false, notFound: true };
    }
    throw e;
  }
}

// Phase 24.0-octies (2026-05-06 evening) — identity-based duplicate lookup.
// User directive: "เวลาข้อมูล Frontend หลุด Sync ไม่ว่าจากกรณีใดๆ การบันทึก
// ลงไปซ้ำ ให้ลอง mapping hn, เลขบัตร ปชช/passport, เบอร์โทรศัพธ์ ดูก่อน
// ถ้าซ้ำกับคนไหน ก็บันทึก sync ลงไปกับคนนั้น ... แต่ถ้าไม่ซ้ำก็ทำการสร้างใหม่"
//
// Searches be_customers for an existing record matching ANY of:
//   - citizen_id (Thai national ID)
//   - passport_id (foreigner)
//   - telephone_number
// Multi-key lookup; if multiple distinct customers match different keys,
// pick the one with MOST matched keys (highest-confidence). Returns:
//   { customer, matched: [...keys] }    → single high-confidence match
//   { ambiguous: true, candidates: [] } → multiple distinct customers; admin picks
//   null                                  → no match (safe to create new)
async function findExistingCustomerByIdentity(patient) {
  if (!patient || typeof patient !== 'object') return null;
  const queries = [];
  if (patient.citizen_id)       queries.push(['citizen_id', patient.citizen_id]);
  if (patient.passport_id)      queries.push(['passport_id', patient.passport_id]);
  if (patient.telephone_number) queries.push(['telephone_number', patient.telephone_number]);
  if (queries.length === 0) return null;

  const seen = new Map();  // customerId → { id, matched: [field, ...] }
  await Promise.all(queries.map(async ([field, value]) => {
    const found = await findCustomersByField(field, value).catch(() => []);
    for (const r of found) {
      const id = String(r.id);
      if (!seen.has(id)) seen.set(id, { id, matched: [field] });
      else seen.get(id).matched.push(field);
    }
  }));
  if (seen.size === 0) return null;

  const matches = Array.from(seen.values());
  if (matches.length === 1) {
    const full = await getCustomer(matches[0].id).catch(() => null);
    return full ? { customer: full, matched: matches[0].matched } : null;
  }
  // Multiple distinct customers — pick the one with most matched keys
  matches.sort((a, b) => b.matched.length - a.matched.length);
  if (matches[0].matched.length > matches[1].matched.length) {
    const full = await getCustomer(matches[0].id).catch(() => null);
    return full ? { customer: full, matched: matches[0].matched } : null;
  }
  // Tie at top — ambiguous; let admin disambiguate manually
  return { ambiguous: true, candidates: matches };
}

// 2026-06-16 Part A — OPD/deposit create chokepoint. addCustomer now throws
// DUPLICATE_IDENTITY (Rule T atomic claim) when a kiosk patient's national-id /
// passport already belongs to a customer (a RETURNING patient re-submitting the
// kiosk form). Instead of failing the OPD save (or creating a dup), LINK the
// session to that existing customer. Conservative: link only — do NOT clobber
// the existing record with the kiosk re-submit (admin data stays authoritative).
async function addCustomerOrLinkExisting(patient, opts) {
  try {
    return await addCustomer(patient, opts);
  } catch (e) {
    if (e?.code === 'DUPLICATE_IDENTITY' && e.existingCustomerId) {
      // Resolve the existing customer's HN so the OPD session links with a real
      // brokerProClinicHN (not blank). For LC- customers the doc-id IS the HN;
      // ProClinic-cloned customers carry it on hn_no/proClinicHN.
      let hn = '';
      try {
        const ex = await getCustomer(e.existingCustomerId);
        hn = (ex && (ex.hn_no || ex.proClinicHN)) || e.existingCustomerId || '';
      } catch { hn = e.existingCustomerId || ''; }
      return { id: e.existingCustomerId, hn, linkedExisting: true };
    }
    throw e;
  }
}

// Phase 20.0 Task 5c (2026-05-06) — pure mapper from Frontend kiosk
// depositData shape → be_deposits createDeposit/updateDeposit shape.
// Field rename:
//   paymentAmount → amount
//   depositDate   → paymentDate
//   depositTime   → paymentTime
//   salesperson   → sellers[0] (single-seller kiosk flow)
//   visitPurpose  → joined into appointmentTo (string)
//   has-appt    → preserves doctor/assistant/room ids inside appointment{}
// Customer ids from session.brokerProClinicId/HN (Phase 5b — be_customers
// id) + patient.firstname/lastname for customerName denormalization.
export function mapDepositPayloadToBe(dep, customerId, customerHN, patient) {
  const visitPurposeText = Array.isArray(dep?.visitPurpose) ? dep.visitPurpose.join(', ') : '';
  const customerName = [
    patient?.firstname || patient?.firstName || '',
    patient?.lastname || patient?.lastName || '',
  ].filter(Boolean).join(' ').trim();
  return {
    customerId: String(customerId || ''),
    customerName: customerName || patient?.fullName || '',
    customerHN: String(customerHN || ''),
    amount: Number(dep?.paymentAmount) || 0,
    paymentChannel: dep?.paymentChannel || '',
    paymentDate: dep?.depositDate || thaiTodayISO(),
    paymentTime: dep?.depositTime || '',
    refNo: dep?.refNo || '',
    sellers: dep?.salesperson
      ? [{ sellerId: String(dep.salesperson), percent: 100 }]
      : [],
    customerSource: dep?.appointmentChannel || '',
    sourceDetail: dep?.sourceDetail || '',
    hasAppointment: !!dep?.hasAppointment,
    appointment: dep?.hasAppointment
      ? {
          appointmentDate: dep.appointmentDate || '',
          appointmentStartTime: dep.appointmentStartTime || '',
          appointmentEndTime: dep.appointmentEndTime || '',
          consultantId: dep.consultant ? String(dep.consultant) : '',
          doctorId: dep.doctor ? String(dep.doctor) : '',
          assistantId: dep.assistant ? String(dep.assistant) : '',
          roomId: dep.room ? String(dep.room) : '',
          appointmentTo: visitPurposeText,
        }
      : null,
    note: visitPurposeText,
  };
}

export default function AdminDashboard({ db, appId, user, auth, viewingSession, setViewingSession, setPrintMode, onSimulateScan, clinicSettings = {}, theme, setTheme }) {
  // V55/BS-14 (2026-05-08) — merge order: DEFAULT_CLINIC_SETTINGS (safety
  // floor) → clinicSettings prop (global Firestore doc) → per-branch overrides
  // (V51 openHoursMonFri/SatSun, chatHours, address, phone, taxId, etc).
  // Pre-V55 this was just default + global; V51 per-branch overrides leaked
  // past the schedule-link modal because cs wasn't branch-merged here.
  const cs = useEffectiveClinicSettings({ ...DEFAULT_CLINIC_SETTINGS, ...clinicSettings });
  // V55/BS-14 — per-branch clinic open hours helpers. Derives from V51
  // openHoursMonFri/SatSun (per-branch); falls back to legacy global
  // clinicOpenTime/Close (cs spread) then to '10:00'/'19:00' literal floor.
  // Used everywhere the schedule-link modal + slot generators previously
  // read clinicSettings.{clinicOpenTime,...} so the SELECTED BRANCH's hours
  // drive every slot-build + saved-doc stamp.
  const monFriOpen = useMemo(
    () => (cs.openHoursMonFri?.open) || clinicSettings.clinicOpenTime || '10:00',
    [cs.openHoursMonFri, clinicSettings.clinicOpenTime],
  );
  const monFriClose = useMemo(
    () => (cs.openHoursMonFri?.close) || clinicSettings.clinicCloseTime || '19:00',
    [cs.openHoursMonFri, clinicSettings.clinicCloseTime],
  );
  const satSunOpen = useMemo(
    () => (cs.openHoursSatSun?.open) || clinicSettings.clinicOpenTimeWeekend || '10:00',
    [cs.openHoursSatSun, clinicSettings.clinicOpenTimeWeekend],
  );
  const satSunClose = useMemo(
    () => (cs.openHoursSatSun?.close) || clinicSettings.clinicCloseTimeWeekend || '17:00',
    [cs.openHoursSatSun, clinicSettings.clinicCloseTimeWeekend],
  );
  const ac = cs.accentColor;
  const acRgb = hexToRgb(ac);
  const isDark = theme === 'dark' || (theme === 'auto' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  // Phase 20.0 Task 6 (2026-05-06) — observe BranchContext so be_*
  // listeners + reads can include selectedBranchId in their deps array
  // and auto-resubscribe on branch switch.
  const { branchId: selectedBranchId, branches } = useSelectedBranch();
  // Live practitioners — Phase 20.0 Task 2 (2026-05-06): rewired from
  // broker.getLivePractitioners (ProClinic 5-min cache) to be_* parallel
  // listStaff() + listDoctors() reads. listStaff = assistants/staff,
  // listDoctors = doctors. Universal lists (not branch-scoped).
  // Fallback to clinicSettings.practitioners if reads fail (Firestore offline).
  const [livePractitioners, setLivePractitioners] = useState(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // V41 (2026-05-08) — opt-in for past-record name resolution in the
        // practitioners panel. Filter isHidden so hidden persons don't appear
        // as selectable options. AV20.
        // V55/BS-14 (2026-05-08) — additionally filter by selectedBranchId
        // via filterDoctorsByBranch / filterStaffByBranch (mirror of the
        // Phase 22.0b fetchDepositOptions pattern at L1830-1838) so the
        // schedule-link modal's "เลือกแพทย์" dropdown shows ONLY doctors who
        // actually work at the selected branch. selectedBranchId in deps so
        // the practitioners list re-fetches on branch switch.
        const [doctors, staff] = await Promise.all([
          listDoctors({ includeHidden: true }),
          listStaff({ includeHidden: true }),
        ]);
        if (cancelled) return;
        const docs = filterDoctorsByBranch(doctors || [], selectedBranchId)
          .filter(d => d.status !== 'พักใช้งาน' && !d.isHidden)
          .map(d => ({ id: d.id, name: d.name, role: 'doctor' }));
        const assts = filterStaffByBranch(staff || [], selectedBranchId)
          .filter(s => s.status !== 'พักใช้งาน' && !s.isHidden)
          .map(s => ({ id: s.id, name: s.name, role: 'assistant' }));
        setLivePractitioners([...docs, ...assts]);
      } catch (_) { /* silent — fallback to clinicSettings */ }
    })();
    return () => { cancelled = true; };
  }, [selectedBranchId]);
  const practitioners = useMemo(() => {
    if (livePractitioners) return livePractitioners;
    // Fallback: dedup clinicSettings + drop hidden
    const raw = clinicSettings.practitioners || [];
    const seen = new Set();
    return raw.filter(p => p.role !== 'hidden').filter(p => {
      const key = `${p.id}-${p.role}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  }, [livePractitioners, clinicSettings.practitioners]);
  // V55/BS-14 (2026-05-08) — branch-scoped exam rooms via Phase 18.0
  // be_exam_rooms collection. Replaces 4 legacy `clinicSettings.rooms`
  // reads in (a) updateActiveSchedules doctorRoomIds Set, (b)
  // handleGenScheduleLink doctorRoomIds Set, (c) selectedRoomName lookup,
  // (d) modal render shownRooms. Re-fetches on branch switch via
  // selectedBranchId in deps. Mirror of AppointmentFormModal:361 +
  // AppointmentCalendarView:391 + DepositPanel:230 + fetchDepositOptions:1833.
  // Maps be_exam_rooms.kind ('doctor'|'staff') → legacy role for callsite
  // parity; preserves kind for forward compat.
  const [branchExamRooms, setBranchExamRooms] = useState([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rooms = await listExamRooms({ branchId: selectedBranchId, status: 'ใช้งาน' });
        if (cancelled) return;
        const mapped = (rooms || []).map(r => ({
          id: r.id,
          name: r.name,
          // V57 / AV30 — defensive default `kind ?? 'doctor'` for legacy
          // be_exam_rooms entries (Phase 18.0 pre-V57 had no kind field).
          role: (r.kind ?? 'doctor') === 'doctor' ? 'doctor' : 'staff',
          kind: r.kind ?? 'doctor',
        }));
        setBranchExamRooms(mapped);
      } catch (_) { if (!cancelled) setBranchExamRooms([]); }
    })();
    return () => { cancelled = true; };
  }, [selectedBranchId]);
  const [sessions, setSessions] = useState([]);
  const [formTemplates, setFormTemplates] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedQR, setSelectedQR] = useState(null);
  const [sessionToDelete, setSessionToDelete] = useState(null);
  const [depositToDelete, setDepositToDelete] = useState(null); // { session, action: 'archive'|'cancel'|'complete' }
  const [currentTime, setCurrentTime] = useState(Date.now()); 
  const [isCopied, setIsCopied] = useState(false);
  const [isLinkCopied, setIsLinkCopied] = useState(false);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [sessionModalTab, setSessionModalTab] = useState('standard'); // standard, custom
  
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [pendingConfig, setPendingConfig] = useState(null);
  const [sessionNameInput, setSessionNameInput] = useState('');
  const [editingNameId, setEditingNameId] = useState(null);
  const [editingNameValue, setEditingNameValue] = useState("");
  // (2026-05-26) default landing → 'appointment' (the unified นัดหมาย surface).
  // คิวหน้า Clinic / จองมัดจำ / จองไม่มัดจำ / ประวัติ tabs were removed.
  const [adminMode, setAdminModeRaw] = useState('appointment'); // chat, appointment, formBuilder, clinicSettings
  // (2026-05-26) redirect guard — any removed mode (legacy programmatic nav OR
  // a stale deep-link) lands on 'appointment'. Single chokepoint: every UI nav
  // goes through setAdminMode (setAdminModeRaw is private to this wrapper).
  const REMOVED_ADMIN_MODES = ['dashboard', 'noDeposit', 'noDepositHistory', 'deposit', 'depositHistory', 'history'];
  const setAdminMode = (mode, preserveQR = false) => {
    const safeMode = REMOVED_ADMIN_MODES.includes(mode) ? 'appointment' : mode;
    setAdminModeRaw(safeMode);
    if (!preserveQR) setSelectedQR(null);
  };
  // V78 (2026-05-16 NIGHT — BUG-CHAT-3 wire): pass selectedBranchId so the
  // chat-tab badge + chime gate are scoped to the admin's current branch.
  // Pre-V78 the badge showed cross-branch unread total → cross-branch chime
  // → the visceral "ไม่เห็นจะแยกกันเลย" complaint.
  const { totalUnread: chatUnread } = useChatUnread(db, appId, selectedBranchId);
  const [treatmentFormMode, setTreatmentFormMode] = useState(null); // null | { mode, customerId, treatmentId, patientName }
  const [treatmentRefreshKey, setTreatmentRefreshKey] = useState(0);
  // V64-fix9 (2026-05-09): appointmentDataVersion bumps every time the
  // listenToAppointmentsByMonth listener fires (new appt created, edited,
  // cancelled, etc.). AppointmentHubView listens to this prop and silently
  // re-fetches its wide [today-30..today+30] range so all 4 tab bubble counts
  // + the active list update real-time without F5. Mirror of treatmentRefreshKey.
  const [appointmentDataVersion, setAppointmentDataVersion] = useState(0);
  const [autoExpandTreatmentId, setAutoExpandTreatmentId] = useState('');

  // ─── Chat schedule: check if within operating hours ─────
  // V77-ter (2026-05-16 EOD+1) — Fix V12 multi-reader-sweep + V51 per-branch
  // migration gap. V51 BranchFormModal saves chat hours under
  // be_branches.settings.chatHours.{alwaysOn,monFri,satSun} and
  // mergeBranchIntoClinic exposes them as cs.chatHoursAlwaysOn +
  // cs.chatHoursMonFri.{open,close} + cs.chatHoursSatSun.{open,close}.
  // AdminDashboard isChatActive was still reading the OLD pre-V51 field
  // names (cs.chatAlwaysOn / cs.chatOpenTime / cs.chatCloseTime / *Weekend)
  // which are now undefined → fell back to default '10:00'-'19:00' →
  // chime gated off after 19:00 even when admin configured 11:15-20:45.
  // User report: "เสียงต่อเนื่องเมื่อไม่ได้เคลีย Chat หายไป" (locked V51
  // migration gap; AV29-class per-branch-settings sweep miss).
  // Legacy field fallback retained for env where merge hasn't propagated.
  // V77-fix3 (S-2, 2026-05-16 NIGHT) — extracted to shared chatHours.js.
  // Was duplicated with ChatPanel.isWithinChatHours; the duplicate IS what
  // caused V77-quater to be a separate fix after V77-ter (deferred Rule P
  // Step 3 cross-file grep cost 2 user-rage rounds). Now both consume the
  // same canonical helper — future V51-field schema drift only updates
  // src/lib/chatHours.js.
  const isChatActive = useMemo(() => isChatHoursActiveNow(cs), [
    cs.chatHoursAlwaysOn, cs.chatHoursMonFri, cs.chatHoursSatSun,
    cs.chatAlwaysOn, cs.chatOpenTime, cs.chatCloseTime,
    cs.chatOpenTimeWeekend, cs.chatCloseTimeWeekend,
    currentTime,
  ]);

  // ─── Chat alert sound: fires on UNREAD count, never on total conv count ─
  const chatIsPlayingRef = useRef(false);
  const chatPrevUnreadRef = useRef(0);
  const chatUnreadRef = useRef(0);
  const isChatActiveRef = useRef(isChatActive);
  // Track in-flight deposit syncs locally (so stuck Firestore 'pending' state doesn't block retry)
  const depositSyncingRef = useRef(new Set());
  const [, forceRerender] = useState(0);
  chatUnreadRef.current = chatUnread;
  isChatActiveRef.current = isChatActive;

  useEffect(() => {
    if (shouldRingChatAlert({
      chatUnread,
      prevUnread: chatPrevUnreadRef.current,
      isChatActive,
      isPlaying: chatIsPlayingRef.current,
    })) {
      chatIsPlayingRef.current = true;
      // V75 Item 4 — gated by per-device chat mute (AV58 keeps the helper
      // import scope locked to ChatPanel.jsx; we use the safe wrapper here).
      playChatNotificationSound();
      setTimeout(() => { chatIsPlayingRef.current = false; }, 1400);
    }
    chatPrevUnreadRef.current = chatUnread;
  }, [chatUnread, isChatActive]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (shouldRingChatInterval({
        chatUnread: chatUnreadRef.current,
        isChatActive: isChatActiveRef.current,
        isPlaying: chatIsPlayingRef.current,
      })) {
        chatIsPlayingRef.current = true;
        // V75 Item 4 — gated by per-device chat mute (AV58 scope-locked).
        playChatNotificationSound();
        setTimeout(() => { chatIsPlayingRef.current = false; }, 1400);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // ── Admin presence tracking ──
  const [onlineAdmins, setOnlineAdmins] = useState([]);
  const tabIdRef = useRef(`${Date.now()}_${genShortId(6)}`);

  // Heartbeat: write presence doc every 30s, delete on unmount
  useEffect(() => {
    const presenceCol = `artifacts/${appId}/public/data/admin_presence`;
    const myDocRef = doc(db, presenceCol, tabIdRef.current);
    const writePresence = () => setDoc(myDocRef, {
      userId: user?.uid || 'unknown',
      email: user?.email || '',
      lastSeen: Date.now(),
      userAgent: navigator.userAgent.slice(0, 80),
    });
    writePresence();
    const interval = setInterval(writePresence, 30000);
    const cleanup = () => { deleteDoc(myDocRef).catch(() => {}); };
    window.addEventListener('beforeunload', cleanup);
    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', cleanup);
      cleanup();
    };
  }, [db, appId, user]);

  // Listen to all presence docs
  useEffect(() => {
    const presenceCol = collection(db, `artifacts/${appId}/public/data/admin_presence`);
    return onSnapshot(presenceCol, snap => {
      const now = Date.now();
      const staleMs = 60000; // 60s = offline
      const active = snap.docs
        .map(d => ({ ...d.data(), id: d.id }))
        .filter(d => d.lastSeen && (now - d.lastSeen) < staleMs);
      setOnlineAdmins(active);
      // Clean up stale docs silently
      snap.docs.forEach(d => {
        const data = d.data();
        if (!data.lastSeen || (now - data.lastSeen) >= staleMs) {
          deleteDoc(d.ref).catch(() => {});
        }
      });
    });
  }, [db, appId]);

  // ── Appointment calendar state ──
  const [apptMonth, setApptMonth] = useState(() => thaiYearMonth());
  const [apptViewMode, setApptViewMode] = useState('list');  // V64 — 'list' | 'calendar'
  const [apptData, setApptData] = useState(null);
  const [apptSelectedDate, setApptSelectedDate] = useState(null);
  const [apptSlotDuration, setApptSlotDuration] = useState(60);
  // Phase 20.0 Task 1 (2026-05-06) — apptSyncing/apptSyncSuccess + sync refs
  // removed. be_appointments is canonical + live via listenToAppointmentsByMonth;
  // no manual ProClinic sync state needed.
  const [apptFilterPractitioner, setApptFilterPractitioner] = useState('all'); // 'all' | practitioner id string

  // ── Appointment Manager (search & manage) state ──
  const [apptSearchQuery, setApptSearchQuery] = useState('');
  const [apptSearchResults, setApptSearchResults] = useState(null);
  const [apptSearching, setApptSearching] = useState(false);
  const [apptSelectedCustomer, setApptSelectedCustomer] = useState(null); // { id, name, hn, phone }
  const [apptCustomerAppts, setApptCustomerAppts] = useState([]);
  const [apptCustomerLoading, setApptCustomerLoading] = useState(false);
  const [apptFormMode, setApptFormMode] = useState(null); // null | { mode: 'create'|'edit', appointmentId? }
  const [apptFormData, setApptFormData] = useState({ date: '', startTime: '', endTime: '', doctor: '', advisor: '', room: '', source: '', appointmentTo: '', note: '' });
  const [apptFormSaving, setApptFormSaving] = useState(false);
  // Task 10 (LINE OA Appointment Reminder, 2026-05-15) — notifyChannel
  // array drives the be_appointments.notifyChannel write so the cron
  // pipeline picks this appt up for reminder delivery. Auto-ticked when
  // apptSelectedCustomer has LINE linked at selectedBranchId + not
  // opted-out + not stale (LR-4 invariant). User can untick to suppress.
  const [apptNotifyChannel, setApptNotifyChannel] = useState([]);

  // ── Schedule Link modal state ──
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [schedStartMonth, setSchedStartMonth] = useState(() => thaiYearMonth());
  const [schedAdvanceMonths, setSchedAdvanceMonths] = useState(1);
  const [schedDoctorDays, setSchedDoctorDays] = useState(new Set());
  const [schedClosedDays, setSchedClosedDays] = useState(new Set());
  const [schedGenLoading, setSchedGenLoading] = useState(false);
  const [schedGenResult, setSchedGenResult] = useState(null); // { token, url, qrUrl }
  const [schedSlotDuration, setSchedSlotDuration] = useState(60);
  const [schedNoDoctorRequired, setSchedNoDoctorRequired] = useState(false);
  const [schedSelectedDoctor, setSchedSelectedDoctor] = useState(null); // practitioner id for per-doctor schedule
  const [schedSelectedRoom, setSchedSelectedRoom] = useState(null); // room id (string) — filters bookedSlots by roomId
  // Only relevant for ไม่พบแพทย์ links — whether to render "หมอว่าง / หมอไม่ว่าง"
  // info badge on each slot. Default OFF per user 2026-04-19.
  const [schedShowDoctorStatus, setSchedShowDoctorStatus] = useState(false);
  const [schedShowFrom, setSchedShowFrom] = useState('today'); // 'today' | 'tomorrow'
  const [schedEndDay, setSchedEndDay] = useState(''); // 'YYYY-MM-DD' or '' for last day of month
  const [schedManualBlocked, setSchedManualBlocked] = useState([]); // [{ date, startTime, endTime }]
  const [schedBlockingDay, setSchedBlockingDay] = useState(null); // date string being edited
  const [schedList, setSchedList] = useState([]); // previously generated schedule links
  const [schedPrefsLoaded, setSchedPrefsLoaded] = useState(false);
  const dayDragRef = useRef({ active: false, action: null, touched: new Set() }); // drag for day toggle
  const slotDragRef = useRef({ active: false, action: null }); // drag for slot toggle
  const [schedCustomDoctorHours, setSchedCustomDoctorHours] = useState({}); // { "YYYY-MM-DD": { start, end } }
  const doctorSlotDragRef = useRef({ active: false, action: null }); // drag for doctor hour slots
  const [schedCalendarEditing, setSchedCalendarEditing] = useState(false);
  const [schedSlotEditing, setSchedSlotEditing] = useState(false);
  const schedCalendarBackup = useRef(null); // backup for cancel
  const schedSlotBackup = useRef(null); // backup for cancel

  // V59 / 2026-05-08 — live preview state for V56 auto-closure feedback.
  // PLACEMENT NOTE: V59 hooks intentionally land HERE (after all sched*
  // useStates AND after `practitioners` + `branchExamRooms` declarations
  // earlier in the file). The previous V59 commit (51929f1) placed these
  // hooks too early — practitioners (line ~488) + branchExamRooms (~508)
  // were referenced BEFORE declaration → JS Temporal Dead Zone →
  // ReferenceError → React render crash → black screen. Reverted in
  // 05e210f, re-applied here with correct ordering.
  const [schedDoctorSchedules, setSchedDoctorSchedules] = useState([]);

  // V59 + V61 (extended 2026-05-08) — fetch be_staff_schedules for the
  // schedule-link modal. V59 originally fetched only the SELECTED doctor's
  // entries; V61 extends to fetch ALL branch entries when admin uses
  // "แพทย์ทุกคน" (Q1=B refined) OR ไม่พบแพทย์ mode (Q3=B+Q1: need to know
  // which rooms are touched by ANY doctor to compute non-doctor rooms).
  // Cancellation guard mirrors V55 livePractitioners pattern.
  useEffect(() => {
    let cancelled = false;
    const promise = schedSelectedDoctor
      ? listStaffSchedules({ branchId: selectedBranchId, staffId: schedSelectedDoctor })
      : listStaffSchedules({ branchId: selectedBranchId });
    promise
      .then((list) => { if (!cancelled) setSchedDoctorSchedules(list || []); })
      .catch(() => { if (!cancelled) setSchedDoctorSchedules([]); });
    return () => { cancelled = true; };
  }, [schedSelectedDoctor, selectedBranchId]);

  // V59 — live preview of V56 auto-closure for the picked (doctor, room)
  // combo. Returns null when admin hasn't picked both. Returns
  // { closedCount, totalDays, isLicensed, hasShifts, doctorName, roomName }
  // when both picked.
  const v59Preview = useMemo(() => {
    if (!schedSelectedDoctor || !schedSelectedRoom) return null;
    const datesInRange = [];
    const [sy, sm] = schedStartMonth.split('-').map(Number);
    for (let i = 0; i < schedAdvanceMonths; i++) {
      const d = new Date(sy, sm - 1 + i, 1);
      const mo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const [yMo, mMo] = mo.split('-').map(Number);
      const daysInMo = new Date(yMo, mMo, 0).getDate();
      for (let dd = 1; dd <= daysInMo; dd++) {
        datesInRange.push(`${mo}-${String(dd).padStart(2, '0')}`);
      }
    }
    const closed = derivedAutoClosedDates({
      doctorId: schedSelectedDoctor,
      roomId: schedSelectedRoom,
      allEntries: schedDoctorSchedules,
      datesISO: datesInRange,
    });
    const hasShifts = Array.isArray(schedDoctorSchedules) && schedDoctorSchedules.some(
      (s) => s.type === 'recurring' || s.type === 'work' || s.type === 'halfday',
    );
    const isLicensed = Array.isArray(schedDoctorSchedules) && schedDoctorSchedules.some((s) => {
      if (!Array.isArray(s.roomIds) || s.roomIds.length === 0) return false;
      return s.roomIds.map(String).includes(String(schedSelectedRoom));
    });
    const doctorName = (practitioners || []).find(
      (p) => String(p.id) === String(schedSelectedDoctor),
    )?.name || '';
    const roomName = (branchExamRooms || []).find(
      (r) => String(r.id) === String(schedSelectedRoom),
    )?.name || '';
    return {
      closedCount: closed.length,
      totalDays: datesInRange.length,
      isLicensed,
      hasShifts,
      doctorName,
      roomName,
    };
  }, [
    schedSelectedDoctor,
    schedSelectedRoom,
    schedStartMonth,
    schedAdvanceMonths,
    schedDoctorSchedules,
    practitioners,
    branchExamRooms,
  ]);

  // V61 / AV33 (2026-05-08) — months window dates for derive helpers.
  // Shared between v59Preview (V56 auto-closure) + V61 eligibleRoomIds
  // derivation. Recomputes when schedStartMonth or schedAdvanceMonths
  // change so the dropdown re-derives on month-window change.
  const v61DatesInRange = useMemo(() => {
    const out = [];
    const [sy, sm] = schedStartMonth.split('-').map(Number);
    for (let i = 0; i < schedAdvanceMonths; i++) {
      const d = new Date(sy, sm - 1 + i, 1);
      const mo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const [yMo, mMo] = mo.split('-').map(Number);
      const daysInMo = new Date(yMo, mMo, 0).getDate();
      for (let dd = 1; dd <= daysInMo; dd++) {
        out.push(`${mo}-${String(dd).padStart(2, '0')}`);
      }
    }
    return out;
  }, [schedStartMonth, schedAdvanceMonths]);

  // V61 / AV33 — modal room dropdown options derived from canonical
  // be_staff_schedules data (NOT V57 be_exam_rooms.kind static filter).
  //
  //   พบแพทย์ + specific doctor → that doctor's roomIds in window
  //   พบแพทย์ + แพทย์ทุกคน      → union of ALL doctors' roomIds (Q1=B refined)
  //   ไม่พบแพทย์                → rooms in branchExamRooms NOT touched by any
  //                                doctor's schedule in window
  //
  // Closes V12 multi-reader-sweep at the schedule-link MODAL UI boundary.
  // V60 closed the SAVE boundary (doctorDays); V61 closes the MODAL UI
  // boundary (room dropdown options).
  const v61EligibleRoomIds = useMemo(() => {
    if (schedNoDoctorRequired) {
      return deriveNonDoctorRoomIdsForWindow({
        branchExamRooms,
        allEntries: schedDoctorSchedules,
        datesISO: v61DatesInRange,
      });
    }
    return deriveDoctorRoomIdsForWindow({
      doctorIds: schedSelectedDoctor ? [schedSelectedDoctor] : null,
      allEntries: schedDoctorSchedules,
      datesISO: v61DatesInRange,
    });
  }, [
    schedNoDoctorRequired,
    schedSelectedDoctor,
    schedDoctorSchedules,
    branchExamRooms,
    v61DatesInRange,
  ]);

  const v61EligibleRooms = useMemo(() => {
    if (!Array.isArray(branchExamRooms)) return [];
    const ids = new Set(v61EligibleRoomIds.map(String));
    return branchExamRooms.filter((r) => r && r.id != null && ids.has(String(r.id)));
  }, [branchExamRooms, v61EligibleRoomIds]);

  // V63 / AV35 (2026-05-08) — branch-wide be_staff_schedules entries for the
  // AdminDashboard "Frontend" calendar 🔥-emoji rendering. Replaces admin's
  // manual paint Set (schedDoctorDays) which is now READ-ONLY per V63.
  // User directive: "ดึงวันหมอเข้ามาแสดงเป็นอีโมจิไฟในปฏิทิน tab นัดหมาย
  // ของ frontend อันนี้ด้วย ... ส่วนปฏิทินด้านล่าง ให้ทำได้แค่ปิดวัน
  // ไม่สามารถกำหนดวันหมอเข้าได้แล้ว" — schedDoctorDays paint dropped;
  // canonical source = be_staff_schedules.
  //
  // Cancellation guard mirrors V55 livePractitioners pattern.
  const [allBranchScheduleEntries, setAllBranchScheduleEntries] = useState([]);
  useEffect(() => {
    if (!selectedBranchId) { setAllBranchScheduleEntries([]); return; }
    let cancelled = false;
    listStaffSchedules({ branchId: selectedBranchId })
      .then((list) => { if (!cancelled) setAllBranchScheduleEntries(list || []); })
      .catch(() => { if (!cancelled) setAllBranchScheduleEntries([]); });
    return () => { cancelled = true; };
  }, [selectedBranchId]);

  // V63 / AV35 — derived doctor days for the visible appointment calendar
  // month (apptMonth). Used by both image-1 (Frontend appointment tab
  // calendar at line ~6602) and image-2 (ตั้งค่าตารางคลินิก calendar at
  // line ~7044). Pre-V63 these read schedDoctorDays (admin's manual paint
  // Set) which is no longer authoritative.
  const canonicalDoctorDays = useMemo(() => {
    if (!apptMonth || !/^\d{4}-\d{2}$/.test(apptMonth)) return new Set();
    const [yy, mm] = apptMonth.split('-').map(Number);
    const dim = new Date(yy, mm, 0).getDate();
    const datesISO = [];
    for (let d = 1; d <= dim; d++) {
      datesISO.push(`${apptMonth}-${String(d).padStart(2, '0')}`);
    }
    const days = derivedDoctorDaysAcrossWindow({
      doctorIds: null,                 // ALL doctors in branch
      allEntries: allBranchScheduleEntries,
      datesISO,
    });
    return new Set(days);
  }, [apptMonth, allBranchScheduleEntries]);

  // V61 defensive reset (V55 pattern): when eligibleRoomIds changes (branch
  // switch / doctor switch / mode toggle / months window change) and the
  // previously-picked schedSelectedRoom is no longer in the eligible set,
  // reset to null. Without this, saved doc carries a roomId that's no
  // longer in the dropdown's set → confusing UX + potential broken link.
  useEffect(() => {
    if (schedSelectedRoom == null) return;
    if (!v61EligibleRoomIds.includes(String(schedSelectedRoom))) {
      setSchedSelectedRoom(null);
    }
  }, [v61EligibleRoomIds, schedSelectedRoom]);

  // V55/BS-14 (2026-05-08) — when branch switches, the per-branch
  // practitioners/rooms lists re-fetch (effects above key on selectedBranchId).
  // If the previously-picked schedSelectedDoctor or schedSelectedRoom isn't
  // in the new branch's set, reset to null so the modal dropdown reflects
  // a valid selection. Without this reset the saved schedule-link doc
  // would carry an ID that doesn't exist in the chosen branch.
  useEffect(() => {
    if (!livePractitioners || schedSelectedDoctor == null) return;
    const found = livePractitioners.some(p => String(p.id) === String(schedSelectedDoctor));
    if (!found) setSchedSelectedDoctor(null);
  }, [livePractitioners, schedSelectedDoctor]);
  useEffect(() => {
    if (!Array.isArray(branchExamRooms) || schedSelectedRoom == null) return;
    const found = branchExamRooms.some(r => String(r.id) === String(schedSelectedRoom));
    if (!found) setSchedSelectedRoom(null);
  }, [branchExamRooms, schedSelectedRoom]);

  const [isNotifEnabled, setIsNotifEnabled] = useState(true);
  const [notifVolume, setNotifVolume] = useState(0.5);
  const [showNotifSettings, setShowNotifSettings] = useState(false);
  // ─── Menu Variant A v2 (Phase A, 2026-05-18) — mobile drawer state ───
  const [showMobileMoreDrawer, setShowMobileMoreDrawer] = useState(false);   // ⋯ เพิ่ม drawer
  // V2-bis (2026-05-18) — flag html[data-mobile-menu-overlay-open] when either
  // sheet/drawer is open so CSS can hide the floating staff-chat bubble that
  // otherwise covers drawer items (user-reported: bubble obscured ออกจากระบบ).
  useEffect(() => {
    const open = showMobileMoreDrawer;
    if (open) {
      document.documentElement.setAttribute('data-mobile-menu-overlay-open', 'true');
    } else {
      document.documentElement.removeAttribute('data-mobile-menu-overlay-open');
    }
    return () => {
      document.documentElement.removeAttribute('data-mobile-menu-overlay-open');
    };
  }, [showMobileMoreDrawer]);
  const [toastMsg, setToastMsg] = useState(null);
  const toastTimerRef = useRef(null);
  const showToast = (msg, durationMs = 5000) => {
    clearTimeout(toastTimerRef.current);
    setToastMsg(msg);
    toastTimerRef.current = setTimeout(() => setToastMsg(null), durationMs);
  };
  const prevSessionsRef = useRef([]);
  // ป้องกัน auto-sync ซ้ำ: sessionId → JSON string ของ patientData ที่ sync ไปล่าสุด
  // ถ้า snapshot ส่ง patientData เดิมมาอีก (เช่น จาก isUnread=false update) จะไม่ re-trigger
  const lastAutoSyncedStrRef = useRef({}); // dedup auto-sync (ป้องกัน sync ซ้ำ)
  const lastNotifiedStrRef = useRef({});   // dedup notification (ป้องกัน toast/sound ซ้ำ)
  const lastViewedStrRef = useRef({});     // banner suppression (admin เห็นแล้ว → ไม่โชว์ false banner)
  const [hasNewUpdate, setHasNewUpdate] = useState(false);
  const [summaryLang, setSummaryLang] = useState('en');
  const [archivedSessions, setArchivedSessions] = useState([]);
  const [depositSessions, setDepositSessions] = useState([]);
  const [archivedDepositSessions, setArchivedDepositSessions] = useState([]);
  const [noDepositSessions, setNoDepositSessions] = useState([]);
  const [archivedNoDepositSessions, setArchivedNoDepositSessions] = useState([]);
  // FIX ① (2026-05-26) — live map of ALL branch sessions (incl. card-flow that
  // the queue filters exclude) so resolveLinkedSession returns FRESH data and the
  // นัดหมาย card flips the instant the linked form is filled (no F5, no re-fetch).
  const [allLinkedSessions, setAllLinkedSessions] = useState([]);
  const [sessionToHardDelete, setSessionToHardDelete] = useState(null);

  // ── Deposit form state ──
  const [showDepositForm, setShowDepositForm] = useState(false);
  const [depositOptions, setDepositOptions] = useState(null);
  const [depositOptionsLoading, setDepositOptionsLoading] = useState(false);
  const [depositFormData, setDepositFormData] = useState({
    sessionName: '', paymentChannel: '', paymentAmount: '', depositDate: todayISO(),
    depositTime: nowTime(), salesperson: '', hasAppointment: false,
    appointmentDate: '', appointmentStartTime: '', appointmentEndTime: '',
    consultant: '', doctor: '', assistant: '', room: '', appointmentChannel: '',
    visitPurpose: [],
    // Phase 24.0-undecies — captures the free-text detail when "อื่นๆ" is one
    // of the visitPurpose chips. Joined into the saved `purpose` string as
    // "อื่นๆ: <detail>" via buildVisitPurposeText so the DepositPanel
    // "มัดจำสำหรับ" column shows the full detail.
    visitPurposeOther: '',
    // Phase 24.0-terdecies (2026-05-06) — "เลือกลูกค้าภายหลัง" flow: explicit
    // booking name + phone captured AT JOIN TIME (kiosk staff types what the
    // caller said). Persisted on opd_sessions.depositData AND on
    // be_deposits.customerNameTemp / customerPhoneTemp via the pair-write
    // helper. When a customer doc is later linked (Phase 24.0-Z attach
    // flow), these fields fade into a forensic-trail role only.
    customerNameTemp: '',
    customerPhoneTemp: '',
  });
  const [editingDepositData, setEditingDepositData] = useState(null); // null = not editing, object = editing copy
  const [depositSaving, setDepositSaving] = useState(false); // guards against double-click duplicate ProClinic updates

  // ── No-deposit appointment form state ──
  const [showNoDepositForm, setShowNoDepositForm] = useState(false);
  const [noDepositFormData, setNoDepositFormData] = useState({
    sessionName: '', appointmentDate: todayISO(),
    appointmentStartTime: '', appointmentEndTime: '',
    advisor: '', doctor: '', assistant: '', room: '', source: '',
    visitPurpose: [],
    // Phase 24.0-undecies — see depositFormData.visitPurposeOther.
    visitPurposeOther: '',
    // Phase 24.0-terdecies — see depositFormData.customerNameTemp.
    customerNameTemp: '',
    customerPhoneTemp: '',
  });

  // Phase 29.23-bis2 (2026-05-14) — V53 BS-12 expansion to Frontend booking modals.
  // Pre-fix: depositOptions.appointment{Start,End}Times was built from
  // CANONICAL_TIME_SLOTS (08:15-22:00 hardcoded) and consumed verbatim in 3
  // modal time pickers. Bug surfaced when branch open hours were narrower —
  // pickers still showed slots starting at 08:15 regardless of branch.
  //
  // Root cause: BS-12 audit only scanned src/components/** (NOT src/pages/),
  // so AdminDashboard.jsx escaped V53's audit + got missed in V53's wiring.
  // BS-12 audit now extended to src/pages/ (see audit-branch-scope.test.js).
  //
  // Fix: derive visible slots per-date per-branch via getVisibleTimeSlotsForDate
  // (mirror of Backend AppointmentFormModal pattern from V53). Each modal has
  // its own date state → 3 separate useMemo's, recompute on date or open-hours
  // change. Legacy values outside visible slots are preserved at the option
  // layer (so existing appts on now-closed days remain readable in edit mode).
  const editDepositVisibleSlots = useMemo(() => {
    const r = getVisibleTimeSlotsForDate({
      dateISO: editingDepositData?.appointmentDate || '',
      mergedSettings: cs,
      allTimeSlots: CANONICAL_TIME_SLOTS,
      includeAppointments: [],
    });
    return r?.slots || CANONICAL_TIME_SLOTS;
  }, [editingDepositData?.appointmentDate, cs?.openHoursMonFri, cs?.openHoursSatSun]);

  const depositFormVisibleSlots = useMemo(() => {
    const r = getVisibleTimeSlotsForDate({
      dateISO: depositFormData?.appointmentDate || '',
      mergedSettings: cs,
      allTimeSlots: CANONICAL_TIME_SLOTS,
      includeAppointments: [],
    });
    return r?.slots || CANONICAL_TIME_SLOTS;
  }, [depositFormData?.appointmentDate, cs?.openHoursMonFri, cs?.openHoursSatSun]);

  const noDepositFormVisibleSlots = useMemo(() => {
    const r = getVisibleTimeSlotsForDate({
      dateISO: noDepositFormData?.appointmentDate || '',
      mergedSettings: cs,
      allTimeSlots: CANONICAL_TIME_SLOTS,
      includeAppointments: [],
    });
    return r?.slots || CANONICAL_TIME_SLOTS;
  }, [noDepositFormData?.appointmentDate, cs?.openHoursMonFri, cs?.openHoursSatSun]);

  const [editingAppointment, setEditingAppointment] = useState(null); // null = creating, sessionId = editing
  const [sessionToRestore, setSessionToRestore] = useState(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [globalPushMuted, setGlobalPushMuted] = useState(false);
  const [brokerPending, setBrokerPending] = useState({}); // sessionId → true while pending
  // Phase 25.0c (2026-05-09) — Walk-in OPD-save → appointment-create modal.
  // After admin clicks "บันทึกลง OPD" on the คิวหน้า Clinic tab and customer
  // is saved to be_customers, this state holds the data needed to render
  // <AppointmentFormModal> with type+channel+customer+branch locked.
  const [walkInModal, setWalkInModal] = useState(null);
  // V118 (2026-05-23) — Card-level OPD lifecycle state.
  // sendLinkModal: { sessionId, url, sessionName, alreadyProvisioned } | null
  // opdLink/SaveBusyByApptId: per-row in-flight maps (independent spinners)
  // lazyFetchedSessionsRef: cache for past-month linked sessions outside the
  //   current listener window. lazyFetchedTick: bump on resolve → re-render.
  const [sendLinkModal, setSendLinkModal] = useState(null);
  const [opdLinkBusyByApptId, setOpdLinkBusyByApptId] = useState({});
  const [opdSaveBusyByApptId, setOpdSaveBusyByApptId] = useState({});
  const lazyFetchedSessionsRef = useRef(new Map());
  const lazyFetchInFlightRef = useRef(new Set());
  const [lazyFetchedTick, setLazyFetchedTick] = useState(0);
  const [historySearch, setHistorySearch] = useState('');
  const [historyPage,   setHistoryPage]   = useState(1);
  // Phase 20.0 final ProClinic strip (2026-05-06) — Import-from-ProClinic
  // state + handlers + JSX REMOVED. With ProClinic phasing out, the
  // import-clone flow is obsolete. Admins manage customers via
  // BackendDashboard's CustomerListTab.
  const [coursesPanel,  setCoursesPanel]  = useState(null); // { sessionId, patientName, hn, status, courses, expiredCourses, error }
  const brokerPendingRef = useRef(brokerPending);
  brokerPendingRef.current = brokerPending;
  const brokerTimers = useRef({}); // sessionId → timeout id
  const coursesJobIdRef  = useRef(null);       // jobId ของ LC_GET_COURSES ที่รออยู่
  const autoCoursesRequestedRef = useRef(new Set()); // sessionId ที่ auto-trigger แล้วใน session นี้
  const autoSyncInFlightRef     = useRef(new Set()); // sessionId ที่ brokerSyncSessions กำลัง LC_UPDATE อยู่ → block auto-trigger courses จนกว่าจะเสร็จ
  const prevAdminModeRef        = useRef(null); // track adminMode ก่อนเปิด report (เพื่อกลับไปหน้าเดิมเมื่อปิด)
  const [qrDisplayMode, setQrDisplayMode] = useState('session'); // 'session' | 'patientLink'
  const [patientLinkModal, setPatientLinkModal] = useState(null); // session id
  const [patientLinkLoading, setPatientLinkLoading] = useState(false);

  // *** ใส่ VAPID Key ที่ได้จาก Firebase Console → Project Settings → Cloud Messaging → Web Push certificates ***
  const VAPID_KEY = 'BCCrQVfqNfY2JJQsqrJ0EdU0O1AYV2LOdReWyziuYDO5d2Wm8otNht_oqCwh8qvqTy9SYtdwlGF2XvXWtg1b5ao';

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  // โหลดสถานะ push จาก localStorage
  useEffect(() => {
    if (localStorage.getItem('lc_push_enabled') === 'true') setPushEnabled(true);
  }, []);

  // Phase 20.0 Task 5a (2026-05-06) — broker.getProClinicCredentials removed.
  // Cookie Relay auto-sync was for ProClinic session bootstrap; with the
  // ProClinic dependency phasing out (no-deploy directive 2026-05-06) the
  // Cookie Relay extension is dev-only scaffolding (Rule H-bis). Listener
  // entirely dropped — extension that posts LC_COOKIE_RELAY_READY now sees
  // no response, which is fine: it falls back to manual credential entry
  // in MasterDataTab.

  // โหลด / subscribe globalPushMuted จาก Firestore
  useEffect(() => {
    if (!db || !appId) return;
    const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'push_config', 'settings');
    const unsub = onSnapshot(settingsRef, (snap) => {
      if (snap.exists()) setGlobalPushMuted(!!snap.data().globalPushMuted);
    });
    return () => unsub();
  }, [db, appId]);

  // เคลียร์ brokerStatus: 'pending' ที่ค้างอยู่ใน Firestore ตอน load (ครั้งเดียว)
  const stalePendingCleared = useRef(false);
  useEffect(() => {
    if (stalePendingCleared.current) return;
    const allSessions = [...sessions, ...archivedSessions];
    if (allSessions.length === 0) return; // ยังไม่โหลด
    stalePendingCleared.current = true;
    allSessions.forEach(async (s) => {
      if (s.brokerStatus === 'pending' && !brokerTimers.current[s.id]) {
        try {
          await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', s.id), {
            brokerStatus: 'failed',
            brokerError: 'หมดเวลา — API ไม่ตอบสนอง',
          });
        } catch(e) { console.error('clear stale broker pending:', e); }
      }
    });
  }, [sessions, archivedSessions]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Appointment calendar: live listener on be_appointments for current month ──
  // Phase 20.0 Task 1 (2026-05-06) — replaces pc_appointments getDoc onSnapshot
  // + broker.syncAppointments auto-sync effects (auto-sync, lazy-sync per-month
  // navigate, 21:00 daily sync, manual handleSyncAppointments). be_appointments
  // is now the canonical source, kept live by Firestore — no manual sync needed.
  //
  // Phase 20.0 Task 6 (2026-05-06) — branch-scoped via scopedDataLayer
  // auto-inject (resolveSelectedBranchId reads per-user localStorage). Switching
  // BranchSelector → branchSelection key changes → next mount picks up new
  // branch. selectedBranchId added to deps so the effect resubscribes when
  // admin clicks BranchSelector dropdown.
  useEffect(() => {
    if (!db || !appId) return;
    const unsub = listenToAppointmentsByMonth(
      apptMonth,
      // V54 (BS-13, 2026-05-08) — pass selectedBranchId EXPLICITLY (V52/BS-11
      // canonical pattern). Pre-V54 the comment claimed "scopedDataLayer
      // wrapper resolves the current branch" but the wrapper is plain
      // passthrough — combined with backendClient.js's safe-by-default-FAILED,
      // {} opts caused the queue calendar to subscribe to the WHOLE
      // be_appointments collection (cross-branch leak). Defense-in-depth:
      // backendClient.js raw listener is now safe-by-default (resolves via
      // resolveSelectedBranchId), AND callers pass branchId explicitly.
      { branchId: selectedBranchId },
      (appts) => {
        setApptData({ appointments: appts, syncedAt: new Date().toISOString() });
        // V64-fix9 — real-time bump for AppointmentHubView silent reload
        setAppointmentDataVersion(v => v + 1);
      },
      () => { setApptData(null); }
    );
    return () => { try { unsub?.(); } catch { /* defensive */ } };
  }, [apptMonth, db, appId, selectedBranchId]);

  // ── Appointment Manager handlers ──
  const handleApptSearch = async () => {
    const q = (apptSearchQuery || '').trim();
    if (!q) return;
    setApptSearching(true);
    setApptSearchResults(null);
    setApptSelectedCustomer(null);
    try {
      // Phase 20.0 Task 5a (2026-05-06) — search be_customers via
      // searchBackendCustomers (replaces broker.searchCustomers).
      const customers = await searchBackendCustomers(q);
      setApptSearchResults(customers || []);
    } catch (e) {
      showToast(`ค้นหาไม่สำเร็จ: ${e.message}`, 4000);
      setApptSearchResults([]);
    }
    setApptSearching(false);
  };

  const handleApptSelectCustomer = async (customer) => {
    setApptSelectedCustomer(customer);
    setApptSearchResults(null);
    setApptFormMode(null);
    setApptCustomerLoading(true);
    if (!depositOptions) fetchDepositOptions();
    try {
      // Phase 20.0 Task 2 — read be_appointments via getCustomerAppointments
      // (one-shot; client-filters by customerId across cross-branch).
      const list = await getCustomerAppointments(customer.id);
      setApptCustomerAppts(list || []);
    } catch (e) { showToast(e.message || String(e), 4000); }
    setApptCustomerLoading(false);
  };

  // Task 10 (LINE OA Appointment Reminder, 2026-05-15) — auto-tick LINE
  // when the selected customer has per-branch linkage at selectedBranchId
  // (LR-4 invariant). Re-runs on customer pick OR branch switch.
  // apptSelectedCustomer carries lineUserId_byBranch / lineUserId /
  // notifyOptOut / _lineStale from the be_customers fetch.
  useEffect(() => {
    if (!apptSelectedCustomer) { setApptNotifyChannel([]); return; }
    const branchLink = apptSelectedCustomer.lineUserId_byBranch?.[selectedBranchId];
    const legacyValid = apptSelectedCustomer.branchId === selectedBranchId && apptSelectedCustomer.lineUserId;
    const linkedHere = !!(branchLink?.lineUserId || legacyValid);
    const optedOut = apptSelectedCustomer.notifyOptOut === true;
    const isStale = branchLink?._lineStale === true ||
      (apptSelectedCustomer.branchId === selectedBranchId && apptSelectedCustomer._lineStale === true);
    const canAutoTick = linkedHere && !optedOut && !isStale;
    if (canAutoTick) setApptNotifyChannel((prev) => (prev.includes('line') ? prev : [...prev, 'line']));
    else setApptNotifyChannel((prev) => prev.filter((c) => c !== 'line'));
  }, [apptSelectedCustomer?.id, selectedBranchId]);

  const handleApptEdit = (appt) => {
    setApptFormMode({ mode: 'edit', appointmentId: appt.id });
    setApptFormData({
      date: appt.date || '', startTime: appt.startTime || '', endTime: appt.endTime || '',
      doctor: appt.doctorId || '', advisor: appt.advisorId || '', room: appt.roomId || '',
      source: appt.source || '', appointmentTo: appt.appointmentTo || '', note: appt.note || '',
    });
    if (!depositOptions) fetchDepositOptions();
  };

  const handleApptFormSubmit = async () => {
    if (!apptFormData.date || !apptFormData.startTime || !apptFormData.endTime) {
      showToast('กรุณากรอกวันที่และเวลา', 3000); return;
    }
    if (!apptSelectedCustomer) {
      showToast('กรุณาเลือกลูกค้าก่อน', 3000); return;
    }
    setApptFormSaving(true);
    try {
      // Phase 20.0 Task 2 — be_appointments shape (ProClinic field names
      // dropped). advisor + room + source are NOT mandatory by be_*
      // schema (admin can leave blank); soft-validate but don't block save.
      const advisorVal = apptFormData.advisor || (depositOptions?.advisors?.[0]?.value) || '';
      const roomVal = apptFormData.room || (depositOptions?.rooms?.[0]?.value) || '';
      // Look up display names for denormalized be_appointments fields.
      const doctorRecord = practitioners.find(p => String(p.id) === String(apptFormData.doctor || ''));
      const advisorRecord = practitioners.find(p => String(p.id) === String(advisorVal || ''));
      const payload = {
        date: apptFormData.date,
        startTime: apptFormData.startTime,
        endTime: apptFormData.endTime,
        doctorId: apptFormData.doctor ? String(apptFormData.doctor) : '',
        doctorName: doctorRecord?.name || '',
        advisorId: advisorVal ? String(advisorVal) : '',
        advisorName: advisorRecord?.name || '',
        roomId: roomVal ? String(roomVal) : '',
        source: apptFormData.source || 'walk-in',
        appointmentTo: apptFormData.appointmentTo || '',
        note: apptFormData.note || '',
        appointmentType: DEFAULT_APPOINTMENT_TYPE, // Phase 19.0 default
        customerId: String(apptSelectedCustomer.id),
        customerName: apptSelectedCustomer.name || '',
        // Task 10 (LINE OA Appointment Reminder, 2026-05-15) — write
        // notifyChannel so the cron pipeline can pick this appt up for
        // LINE-reminder delivery. Auto-ticked when the customer has LINE
        // linked at selectedBranchId + not opted-out + not stale (LR-4).
        notifyChannel: apptNotifyChannel,
      };
      let res;
      if (apptFormMode.mode === 'edit') {
        res = await updateBackendAppointment(apptFormMode.appointmentId, payload);
      } else {
        res = await createBackendAppointment(payload);
      }
      if (res?.success !== false) {
        showToast(apptFormMode.mode === 'create' ? 'สร้างนัดหมายสำเร็จ' : 'แก้ไขนัดหมายสำเร็จ', 3000);
        setApptFormMode(null);
        setApptFormData({ date: '', startTime: '', endTime: '', doctor: '', advisor: '', room: '', source: '', appointmentTo: '', note: '' });
        // Re-fetch appointments
        const list = await getCustomerAppointments(apptSelectedCustomer.id);
        setApptCustomerAppts(list || []);
      } else {
        showToast(res.error || 'ไม่สำเร็จ', 4000);
      }
    } catch (e) {
      // AP1_COLLISION surfaces here — show friendly message
      if (e?.code === 'AP1_COLLISION') {
        showToast(`ช่วงเวลานี้มีนัดอยู่แล้ว: ${e.collision?.startTime || ''}-${e.collision?.endTime || ''}`, 5000);
      } else {
        showToast(e.message || String(e), 4000);
      }
    }
    setApptFormSaving(false);
  };

  const handleApptDelete = async (appointmentId) => {
    if (!confirm('ลบนัดหมายนี้?')) return;
    try {
      const res = await deleteBackendAppointment(appointmentId);
      if (res?.success !== false) {
        showToast('ลบนัดหมายสำเร็จ', 3000);
        // Re-fetch (Phase 20.0 Task 2 — be_*)
        const list = await getCustomerAppointments(apptSelectedCustomer.id);
        setApptCustomerAppts(list || []);
      } else {
        showToast(res.error || 'ลบไม่สำเร็จ', 4000);
      }
    } catch (e) { showToast(e.message || String(e), 4000); }
  };

  // ── Load saved schedule day preferences + schedule list ──
  useEffect(() => {
    if (!db || !appId) return;
    // Load saved doctor/closed day prefs
    // Phase 22.0c (2026-05-06 EOD) — per-branch schedule_prefs. Doc id
    // suffixed with __{branchId} so admin-set prefs (closed days, doctor
    // schedule, custom hours, manual-blocked slots) are SEPARATE per branch.
    // Falls back to the legacy global doc 'schedule_prefs' for one
    // load-cycle if the per-branch doc doesn't exist yet (admin's first
    // visit to a branch reads global → first save creates the per-branch
    // doc → subsequent reads use per-branch). User directive: "การตั้งค่า
    // ตารางคลินิก ... จะต้องเป็นข้อมูลคนละสาขากัน".
    const branchPrefsId = `schedule_prefs${selectedBranchId ? `__${selectedBranchId}` : ''}`;
    const loadPrefs = async () => {
      try {
        let snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'clinic_settings', branchPrefsId));
        // Fall back to legacy global doc if per-branch doesn't exist yet
        if (!snap.exists() && selectedBranchId) {
          snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'clinic_settings', 'schedule_prefs'));
        }
        if (snap.exists()) {
          const d = snap.data();
          if (d.doctorDays) setSchedDoctorDays(new Set(d.doctorDays));
          if (d.closedDays) setSchedClosedDays(new Set(d.closedDays));
          if (d.manualBlockedSlots) setSchedManualBlocked(d.manualBlockedSlots);
          if (d.customDoctorHours) setSchedCustomDoctorHours(d.customDoctorHours);
        }
      } catch { /* ignore */ }
      setSchedPrefsLoaded(true);
    };
    loadPrefs();

    // Subscribe to schedule list.
    // Phase 22.0c (2026-05-06 EOD) — branch-filter applied client-side
    // (legacy schedule docs without branchId are kept for backward compat
    // — admin can re-create or migrate later). Re-subscribes when
    // selectedBranchId changes so the list reflects the active branch.
    const unsub = onSnapshot(
      collection(db, 'artifacts', appId, 'public', 'data', 'clinic_schedules'),
      (snap) => {
        const allDocs = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        const list = allDocs
          .filter(s => !s.branchId || String(s.branchId) === String(selectedBranchId || ''))
          .sort((a, b) => {
            const ta = a.createdAt?.toMillis?.() || 0;
            const tb = b.createdAt?.toMillis?.() || 0;
            return tb - ta;
          });
        setSchedList(list);
      },
      () => {}
    );
    return () => unsub();
  }, [db, appId, selectedBranchId]);

  // Update bookedSlots + doctorBookedSlots in all active schedule docs after
  // an auto-sync fires. Must re-apply the SAME filter that was persisted on
  // each doc (doctorId/roomId/noDoctorRequired/assistantIds/doctorRoomIds) —
  // otherwise "Dr A in exam-1" links would get their bookedSlots wiped with
  // a global "every appointment" list, causing customers to see legit slots
  // as busy (and ไม่พบแพทย์ links would carry stale doctorBookedSlots for 24h).
  const updateActiveSchedules = async () => {
    try {
      const activeScheds = schedList.filter(s => s.enabled !== false);
      if (activeScheds.length === 0) return;
      // Admin-config sets used by the filter helpers (current, not frozen per-doc).
      const doctorIds = new Set(practitioners.filter(p => p.role === 'doctor').map(p => String(p.id)));
      const assistantIds = new Set(practitioners.filter(p => p.role === 'assistant').map(p => String(p.id)));
      // V55/BS-14 (2026-05-08) — be_exam_rooms branch-scoped (Phase 18.0)
      // replaces legacy global clinicSettings.rooms. doctorRoomIds is the
      // set of "ห้องแพทย์" room IDs in the SELECTED branch only.
      const doctorRoomIds = new Set(branchExamRooms.filter(r => r.role === 'doctor').map(r => String(r.id)));

      // Phase 20.0 Task 1 — read be_appointments (canonical) instead of
      // pc_appointments mirror. getAppointmentsByMonth returns { [date]: [...] }
      // grouped by date; flatten back to flat array per month for the existing
      // schedule-filter loop (preserves filter shape).
      // Phase 22.0c (2026-05-06 EOD) — keyed by `${month}|${branchId}` so
      // each (month, branch) pair queries be_appointments separately. A
      // schedule for branch A in month X gets only branch-A appointments;
      // schedule for branch B in month X gets only branch-B appointments.
      // Pre-22.0c the call passed `{}` which auto-injected the CURRENT
      // admin's selectedBranchId — wrong because schedules can belong to
      // any branch.
      const monthBranchKeys = new Set();
      for (const s of activeScheds) {
        const sBranch = s.branchId || '';
        for (const mo of (s.months || [])) {
          monthBranchKeys.add(`${mo}|${sBranch}`);
        }
      }
      const apptsByMonthBranch = {};
      await Promise.all(Array.from(monthBranchKeys).map(async (key) => {
        const [mo, sBranch] = key.split('|');
        const opts = sBranch ? { branchId: sBranch } : { allBranches: true };
        const grouped = await getAppointmentsByMonth(mo, opts);
        apptsByMonthBranch[key] = Object.values(grouped || {}).flat();
      }));

      for (const sched of activeScheds) {
        // Check if not expired (24hr)
        if (sched.createdAt?.toMillis && Date.now() - sched.createdAt.toMillis() > 24 * 60 * 60 * 1000) continue;

        const months = sched.months || [];

        // V61 / AV33 (2026-05-08) — recompute selectedRoomIds snapshot on
        // resync. Q4=A: customer link reflects state at last admin Sync.
        // - Specific room pick (selectedRoomId truthy) → keep [selectedRoomId]
        //   (admin chose specific; "ทุกห้อง" expansion would change link semantics).
        // - "ทุกห้อง" pick (selectedRoomId null + selectedRoomIds non-empty) →
        //   recompute the union from current be_staff_schedules in the saved
        //   months window. Picks up newly-added rooms / drops removed ones.
        // - Legacy pre-V61 (selectedRoomId only, no selectedRoomIds field) →
        //   no recomputation; preserve legacy behavior.
        let recomputedRoomIds = null;
        const wasGenericRoomPick = (
          (sched.selectedRoomId == null || sched.selectedRoomId === '')
          && Array.isArray(sched.selectedRoomIds)
          && sched.selectedRoomIds.length > 0
        );
        if (wasGenericRoomPick) {
          try {
            const sBranchForFetch = sched.branchId || '';
            const branchEntries = sBranchForFetch
              ? await listStaffSchedules({
                  branchId: sBranchForFetch,
                  ...(sched.selectedDoctorId ? { staffId: sched.selectedDoctorId } : {}),
                })
              : [];
            // Build datesISO from saved.months
            const dates = [];
            for (const mo of months) {
              if (typeof mo !== 'string' || !/^\d{4}-\d{2}$/.test(mo)) continue;
              const [yMo, mMo] = mo.split('-').map(Number);
              const daysInMo = new Date(yMo, mMo, 0).getDate();
              for (let d = 1; d <= daysInMo; d++) {
                dates.push(`${mo}-${String(d).padStart(2, '0')}`);
              }
            }
            // For ไม่พบแพทย์ mode, need branch's full be_exam_rooms list to
            // compute non-doctor rooms. Fetch fresh per resync.
            if (sched.noDoctorRequired) {
              const branchRoomsForRecompute = sBranchForFetch
                ? await listExamRooms({ branchId: sBranchForFetch, status: 'ใช้งาน' }).catch(() => [])
                : [];
              recomputedRoomIds = deriveNonDoctorRoomIdsForWindow({
                branchExamRooms: branchRoomsForRecompute,
                allEntries: branchEntries,
                datesISO: dates,
              });
            } else {
              recomputedRoomIds = deriveDoctorRoomIdsForWindow({
                doctorIds: sched.selectedDoctorId ? [sched.selectedDoctorId] : null,
                allEntries: branchEntries,
                datesISO: dates,
              });
            }
          } catch (e) {
            console.warn('[V61/AV33] resync recompute failed:', sched.token, e?.message || e);
            recomputedRoomIds = null;
          }
        }

        const effectiveSelectedRoomIds = recomputedRoomIds != null
          ? recomputedRoomIds
          : (Array.isArray(sched.selectedRoomIds) ? sched.selectedRoomIds : null);

        // V61 / AV33 (2026-05-08) — pass selectedRoomIds array through to
        // shouldBlockScheduleSlot. V61 saved docs carry the snapshot array
        // (single-pick → 1-element; ทุกห้อง → full union, recomputed above).
        // Pre-V61 docs carry only selectedRoomId — backward-compat fallback.
        const filterCfg = {
          noDoctorRequired: !!sched.noDoctorRequired,
          selectedDoctorId: sched.selectedDoctorId || null,
          selectedRoomId: sched.selectedRoomId || null,
          selectedRoomIds: effectiveSelectedRoomIds,
          assistantIds,
        };
        const doctorSlotCfg = {
          noDoctorRequired: !!sched.noDoctorRequired,
          doctorPractitionerIds: doctorIds,
          doctorRoomIds,
        };

        const freshBookedSlots = [];
        const freshDoctorBookedSlots = [];
        // Phase 22.0c — read appts for THIS schedule's branch (not the
        // admin's current branch). Empty branchId = legacy schedule;
        // falls through to allBranches in the query above.
        const sBranch = sched.branchId || '';
        for (const mo of months) {
          const appts = apptsByMonthBranch[`${mo}|${sBranch}`] || [];
          appts.forEach(a => {
            if (!a.date || !a.startTime || !a.endTime) return;
            if (shouldBlockDoctorSlot(a, doctorSlotCfg)) {
              freshDoctorBookedSlots.push({ date: a.date, startTime: a.startTime, endTime: a.endTime });
            }
            if (shouldBlockScheduleSlot(a, filterCfg)) {
              freshBookedSlots.push({ date: a.date, startTime: a.startTime, endTime: a.endTime });
            }
          });
        }
        // V61 / AV33 — write back recomputed selectedRoomIds when admin
        // had picked "ทุกห้อง" (recomputedRoomIds non-null). Specific-pick
        // saved docs keep their original [selectedRoomId] verbatim.
        const updatePayload = {
          bookedSlots: freshBookedSlots,
          doctorBookedSlots: sched.noDoctorRequired ? freshDoctorBookedSlots : [],
        };
        if (recomputedRoomIds != null) {
          updatePayload.selectedRoomIds = recomputedRoomIds;
        }
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'clinic_schedules', sched.token), updatePayload)
          .catch(e => console.warn('[updateActiveSchedules] write failed:', sched.token, e.message));
      }
    } catch (e) { console.warn('[updateActiveSchedules] failed:', e.message); }
  };

  // Phase 20.0 Task 1 (2026-05-06) — handleSyncAppointments removed.
  // be_appointments is the canonical live source via listenToAppointmentsByMonth;
  // no manual sync needed. updateActiveSchedules can still be called explicitly
  // when an admin wants to refresh schedule-link bookedSlots from current data.

  // ── Toggle/Delete schedule links ──
  const handleToggleSchedule = async (token, currentEnabled) => {
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'clinic_schedules', token), { enabled: !currentEnabled });
      showToast(currentEnabled ? 'ปิดลิงก์แล้ว' : 'เปิดลิงก์แล้ว', 2000);
    } catch (e) { showToast(`Error: ${e.message}`, 3000); }
  };
  const handleDeleteSchedule = async (token) => {
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'clinic_schedules', token));
      showToast('ลบลิงก์แล้ว', 2000);
    } catch (e) { showToast(`Error: ${e.message}`, 3000); }
  };

  // ── Save schedule prefs to Firestore + update active schedule links ──
  // Phase 22.0c — saves to per-branch doc id so each branch has its own
  // prefs (closed days, doctor work days, manual-blocked slots, custom
  // doctor hours).
  const saveSchedulePrefs = (doctorDays, closedDays, manualBlocked, customDocHours) => {
    if (!db || !appId) return;
    const cdh = customDocHours ?? schedCustomDoctorHours;
    const branchPrefsId = `schedule_prefs${selectedBranchId ? `__${selectedBranchId}` : ''}`;
    setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'clinic_settings', branchPrefsId), {
      branchId: selectedBranchId || null,
      doctorDays: [...doctorDays],
      closedDays: [...closedDays],
      manualBlockedSlots: manualBlocked,
      customDoctorHours: cdh,
      updatedAt: serverTimestamp(),
    }).then(() => {
      // Update active schedule docs with new day settings
      schedList.forEach(s => {
        if (s.enabled === false) return;
        const age = Date.now() - (s.createdAt?.toMillis?.() || 0);
        if (age > 24 * 60 * 60 * 1000) return;
        updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'clinic_schedules', s.token), {
          doctorDays: [...doctorDays],
          closedDays: [...closedDays],
          manualBlockedSlots: manualBlocked,
          customDoctorHours: cdh,
        }).catch(e => console.warn('[schedule-prefs-sync] update failed:', s.token, e.message));
      });
    }).catch(e => console.warn('[schedule-prefs-sync] save failed:', e.message));
  };

  // ── Edit mode helpers for schedule settings ──
  const startCalendarEdit = () => {
    schedCalendarBackup.current = {
      doctorDays: new Set(schedDoctorDays),
      closedDays: new Set(schedClosedDays),
      customDoctorHours: { ...schedCustomDoctorHours },
    };
    setSchedCalendarEditing(true);
  };
  const saveCalendarEdit = () => {
    saveSchedulePrefs(schedDoctorDays, schedClosedDays, schedManualBlocked, schedCustomDoctorHours);
    schedCalendarBackup.current = null;
    schedSlotBackup.current = null;
    setSchedCalendarEditing(false);
    setSchedSlotEditing(false);
    setSchedBlockingDay(null);
    showToast('บันทึกตารางคลินิกแล้ว', 2000);
  };
  const cancelCalendarEdit = () => {
    if (schedCalendarBackup.current) {
      setSchedDoctorDays(schedCalendarBackup.current.doctorDays);
      setSchedClosedDays(schedCalendarBackup.current.closedDays);
      setSchedCustomDoctorHours(schedCalendarBackup.current.customDoctorHours);
    }
    schedCalendarBackup.current = null;
    setSchedCalendarEditing(false);
    // Also cancel slot edit if active
    if (schedSlotEditing) cancelSlotEdit();
  };
  const startSlotEdit = () => {
    schedSlotBackup.current = {
      manualBlocked: [...schedManualBlocked],
    };
    setSchedSlotEditing(true);
    setSchedBlockingDay(null);
  };
  const saveSlotEdit = () => {
    saveSchedulePrefs(schedDoctorDays, schedClosedDays, schedManualBlocked, schedCustomDoctorHours);
    schedSlotBackup.current = null;
    setSchedSlotEditing(false);
    setSchedBlockingDay(null);
    showToast('บันทึกการปิดช่วงเวลาแล้ว', 2000);
  };
  const cancelSlotEdit = () => {
    if (schedSlotBackup.current) {
      setSchedManualBlocked(schedSlotBackup.current.manualBlocked);
    }
    schedSlotBackup.current = null;
    setSchedSlotEditing(false);
    setSchedBlockingDay(null);
  };

  // ── Toggle day: normal ↔ closed ──
  // V63 / AV35 (2026-05-08) — drop "doctor" cycle. User directive:
  // "ส่วนปฏิทินด้านล่าง ให้ทำได้แค่ปิดวัน ไม่สามารถกำหนดวันหมอเข้าได้แล้ว".
  // Doctor days now read-only from canonical be_staff_schedules
  // (canonicalDoctorDays useMemo). Calendar toggle is closed/normal only;
  // the 🔥 emoji is still rendered when canonical schedule has working
  // entry, but admin can NO longer paint/un-paint it manually.
  const toggleDay = (dateStr, forceAction) => {
    let newClosed;
    const action = forceAction || (schedClosedDays.has(dateStr) ? 'normal' : 'closed');
    if (action === 'closed') {
      newClosed = new Set(schedClosedDays); newClosed.add(dateStr);
    } else {
      newClosed = new Set(schedClosedDays); newClosed.delete(dateStr);
    }
    setSchedClosedDays(newClosed);
    // Don't auto-save — user must click save button
    return action;
  };

  // ── Drag handlers for day toggle ──
  // V63 / AV35 — drag cycle simplified to closed ↔ normal.
  const handleDayPointerDown = (dateStr, e) => {
    e.preventDefault();
    const action = schedClosedDays.has(dateStr) ? 'normal' : 'closed';
    dayDragRef.current = { active: true, action, touched: new Set([dateStr]) };
    toggleDay(dateStr, action);
  };
  const handleDayPointerEnter = (dateStr) => {
    if (!dayDragRef.current.active || dayDragRef.current.touched.has(dateStr)) return;
    dayDragRef.current.touched.add(dateStr);
    toggleDay(dateStr, dayDragRef.current.action);
  };
  const handleDayPointerUp = () => { dayDragRef.current.active = false; };
  const handleDayPointerMove = (e) => {
    if (!dayDragRef.current.active) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const ds = el?.closest?.('[data-dayds]')?.dataset?.dayds;
    if (ds) handleDayPointerEnter(ds);
  };

  // ── Drag handlers for slot toggle ──
  const handleSlotPointerDown = (date, start, end, e) => {
    e.preventDefault();
    const isBlocked = schedManualBlocked.some(b => b.date === date && b.startTime === start && b.endTime === end);
    slotDragRef.current = { active: true, action: isBlocked ? 'unblock' : 'block' };
    toggleBlockedSlot(date, start, end);
  };
  const handleSlotPointerEnter = (date, start, end) => {
    if (!slotDragRef.current.active) return;
    const isBlocked = schedManualBlocked.some(b => b.date === date && b.startTime === start && b.endTime === end);
    if (slotDragRef.current.action === 'block' && !isBlocked) toggleBlockedSlot(date, start, end);
    if (slotDragRef.current.action === 'unblock' && isBlocked) toggleBlockedSlot(date, start, end);
  };
  const handleSlotPointerUp = () => { slotDragRef.current.active = false; };
  const handleSlotPointerMove = (e) => {
    if (!slotDragRef.current.active && !doctorSlotDragRef.current.active) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const btn = el?.closest?.('[data-slot-info]');
    if (!btn) return;
    const { slotDate, slotStart, slotEnd, slotType } = btn.dataset;
    if (!slotDate) return;
    if (slotType === 'block' && slotDragRef.current.active) handleSlotPointerEnter(slotDate, slotStart, slotEnd);
    if (slotType === 'doctor' && doctorSlotDragRef.current.active) handleDocSlotPointerEnter(slotDate, slotStart, slotEnd);
  };

  // ── Toggle manual blocked slot ──
  const toggleBlockedSlot = (date, start, end) => {
    setSchedManualBlocked(prev => {
      const exists = prev.some(b => b.date === date && b.startTime === start && b.endTime === end);
      const next = exists
        ? prev.filter(b => !(b.date === date && b.startTime === start && b.endTime === end))
        : [...prev, { date, startTime: start, endTime: end }];
      // Don't auto-save — user must click save button
      return next;
    });
  };

  // ── Doctor hour slot helpers (supports array of ranges per day) ──
  const toMin = (t) => parseInt(t.split(':')[0]) * 60 + parseInt(t.split(':')[1]);
  const fromMin = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

  // Returns array of { start, end } ranges — backwards compat with old single-range format
  const getDoctorRangesForDate = (dateStr) => {
    const custom = schedCustomDoctorHours[dateStr];
    if (custom) return Array.isArray(custom) ? custom : [custom];
    // TZ-invariant weekday: parse YYYY-MM-DD at UTC midnight then read UTC day.
    // `new Date(dateStr).getDay()` is browser-local and wrong in UTC-negative zones.
    const [yy, mm, dd] = (dateStr || '').split('-').map(Number);
    const dow = new Date(Date.UTC(yy, (mm || 1) - 1, dd || 1)).getUTCDay();
    const isWknd = dow === 0 || dow === 6;
    // V55/BS-14 — default doctor entry hours per-branch (= clinic open hours
    // per branch). Admin per-day override via schedCustomDoctorHours still
    // takes precedence (handled at the top of getDoctorRangesForDate).
    return [{
      start: isWknd ? satSunOpen : monFriOpen,
      end: isWknd ? satSunClose : monFriClose,
    }];
  };
  // Legacy compat: return first range (used in display)
  const getDoctorHoursForDate = (dateStr) => {
    const ranges = getDoctorRangesForDate(dateStr);
    return ranges[0] || { start: '10:00', end: '19:00' };
  };
  const isSlotInDoctorHours = (dateStr, slotStart) => {
    const ranges = getDoctorRangesForDate(dateStr);
    const sMin = toMin(slotStart);
    return ranges.some(r => sMin >= toMin(r.start) && sMin <= toMin(r.end));
  };

  // Convert a set of enabled 15-min slot minutes into array of contiguous ranges
  // End = last slot's start time (NOT +15) — so "ticked to 19:15" shows as range ending 19:15
  const slotsToRanges = (enabledSet) => {
    if (enabledSet.size === 0) return [];
    const sorted = [...enabledSet].sort((a, b) => a - b);
    const ranges = [];
    let rStart = sorted[0], prev = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === prev + 15) { prev = sorted[i]; }
      else { ranges.push({ start: fromMin(rStart), end: fromMin(prev) }); rStart = sorted[i]; prev = sorted[i]; }
    }
    ranges.push({ start: fromMin(rStart), end: fromMin(prev) });
    return ranges;
  };

  // Toggle custom doctor hours for a specific day+slot
  const toggleDoctorSlot = (dateStr, slotStart, slotEnd, forceAction) => {
    const inDoc = isSlotInDoctorHours(dateStr, slotStart);
    const action = forceAction || (inDoc ? 'remove' : 'add');
    setSchedCustomDoctorHours(prev => {
      // Get all 15-min slots for the day based on clinic hours.
      // TZ-invariant weekday parsing (see getDoctorRangesForDate).
      const [yy, mm, dd] = (dateStr || '').split('-').map(Number);
      const dow = new Date(Date.UTC(yy, (mm || 1) - 1, dd || 1)).getUTCDay();
      const isWknd = dow === 0 || dow === 6;
      // V55/BS-14 — clinic open hours per-branch (V51 openHoursMonFri/SatSun).
      const openT = isWknd ? satSunOpen : monFriOpen;
      const closeT = isWknd ? satSunClose : monFriClose;
      const allSlots = [];
      let cur = toMin(openT);
      const endMin = toMin(closeT);
      while (cur + 15 <= endMin) { allSlots.push(cur); cur += 15; }

      // Build set of enabled doctor slot minutes from current ranges
      const currentRanges = prev[dateStr] ? (Array.isArray(prev[dateStr]) ? prev[dateStr] : [prev[dateStr]]) : getDoctorRangesForDate(dateStr);
      const enabledSet = new Set(allSlots.filter(m => currentRanges.some(r => m >= toMin(r.start) && m <= toMin(r.end))));

      const slotMin = toMin(slotStart);
      if (action === 'remove') enabledSet.delete(slotMin);
      else enabledSet.add(slotMin);

      const newRanges = slotsToRanges(enabledSet);
      if (newRanges.length === 0) {
        const next = { ...prev, [dateStr]: [{ start: '00:00', end: '00:00' }] };
        return next;
      }

      // Check if same as default → remove custom override
      // Default end is actual end time (e.g. "19:00"), adjust by -15 to match new format (last slot start)
      const defRanges = (() => {
        // TZ-invariant weekday (UTC-parse).
        const [yy2, mm2, dd2] = (dateStr || '').split('-').map(Number);
        const w = [0, 6].includes(new Date(Date.UTC(yy2, (mm2 || 1) - 1, dd2 || 1)).getUTCDay());
        // V55/BS-14 — default doctor hours per-branch (= clinic open hours).
        const defEnd = w ? satSunClose : monFriClose;
        return [{
          start: w ? satSunOpen : monFriOpen,
          end: fromMin(toMin(defEnd) - 15),
        }];
      })();
      if (newRanges.length === 1 && defRanges.length === 1 && newRanges[0].start === defRanges[0].start && newRanges[0].end === defRanges[0].end) {
        const next = { ...prev };
        delete next[dateStr];
        return next;
      }

      const next = { ...prev, [dateStr]: newRanges };
      return next;
    });
  };

  // Doctor slot drag handlers
  const handleDocSlotPointerDown = (dateStr, slotStart, slotEnd, e) => {
    e.preventDefault();
    const inDoc = isSlotInDoctorHours(dateStr, slotStart);
    doctorSlotDragRef.current = { active: true, action: inDoc ? 'remove' : 'add' };
    toggleDoctorSlot(dateStr, slotStart, slotEnd, inDoc ? 'remove' : 'add');
  };
  const handleDocSlotPointerEnter = (dateStr, slotStart, slotEnd) => {
    if (!doctorSlotDragRef.current.active) return;
    const inDoc = isSlotInDoctorHours(dateStr, slotStart);
    if (doctorSlotDragRef.current.action === 'remove' && inDoc) toggleDoctorSlot(dateStr, slotStart, slotEnd, 'remove');
    if (doctorSlotDragRef.current.action === 'add' && !inDoc) toggleDoctorSlot(dateStr, slotStart, slotEnd, 'add');
  };
  const handleDocSlotPointerUp = () => { doctorSlotDragRef.current.active = false; };

  // ── Generate Schedule Link ──
  const handleGenScheduleLink = async () => {
    setSchedGenLoading(true);
    try {
      // 1. Build months array
      const months = [];
      const [sy, sm] = schedStartMonth.split('-').map(Number);
      for (let i = 0; i < schedAdvanceMonths; i++) {
        const d = new Date(sy, sm - 1 + i, 1);
        months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      }

      // 2. Phase 20.0 Task 1 — pre-sync removed. be_appointments is canonical
      //    + live, no broker.syncAppointments call needed before reading.

      // 3. Collect booked slots — filter rules live in scheduleFilterUtils.js
      //    so they're testable in isolation (see tests/schedule-filter.test.js).
      //    Rule summary: a slot is busy if EITHER the specific doctor (when
      //    selected) is busy OR the specific room (when selected) is occupied.
      //    With no room filter, legacy "all doctors" behaviour is preserved.
      const bookedSlots = [];
      const doctorBookedSlots = []; // นัดของแพทย์ทุกคน — ใช้แสดง "หมอว่าง/ไม่ว่าง" ในหน้าลูกค้า
      const allPractitioners = practitioners;
      const doctorIds = new Set(allPractitioners.filter(p => p.role === 'doctor').map(p => String(p.id)));
      const assistantIds = new Set(allPractitioners.filter(p => p.role === 'assistant').map(p => String(p.id)));
      // "Doctor busy" label only fires when the doctor is at their DOCTOR room
      // (per user 2026-04-19: a doctor performing Shockwave in a staff room
      // should NOT surface as "หมอไม่ว่าง" to a customer looking at an iv-drip link).
      // V55/BS-14 (2026-05-08) — be_exam_rooms branch-scoped (Phase 18.0)
      // replaces legacy global clinicSettings.rooms. doctorRoomIds is the
      // set of "ห้องแพทย์" room IDs in the SELECTED branch only.
      const doctorRoomIds = new Set(branchExamRooms.filter(r => r.role === 'doctor').map(r => String(r.id)));
      const selectedRoomStr = schedSelectedRoom ? String(schedSelectedRoom) : null;
      // V61 / AV33 (2026-05-08) — snapshot the V61 room set BEFORE the
      // bookedSlots filter loop so the loop applies array-aware filtering.
      // - Specific room pick → [room]
      // - "ทุกห้อง" pick (Q3=B) → full v61EligibleRoomIds union (snapshot)
      // The same array is saved into the doc shape below (Q4=A consistency).
      const v61SelectedRoomIds = schedSelectedRoom
        ? [String(schedSelectedRoom)]
        : [...v61EligibleRoomIds];
      const filterCfg = {
        noDoctorRequired: schedNoDoctorRequired,
        selectedDoctorId: schedSelectedDoctor,
        selectedRoomId: schedSelectedRoom,
        // V61 — array preferred when present; shouldBlockScheduleSlot
        // backward-compat falls through to selectedRoomId for legacy.
        selectedRoomIds: v61SelectedRoomIds,
        assistantIds,
      };
      const doctorSlotCfg = {
        noDoctorRequired: schedNoDoctorRequired,
        doctorPractitionerIds: doctorIds,
        doctorRoomIds,
      };
      // Phase 20.0 Task 1 — read be_appointments (canonical) instead of
      // pc_appointments mirror.
      // V55/BS-14 (2026-05-08) — pass explicit branchId opts (V52/BS-11
      // canonical pattern + defense-in-depth on top of V54/BS-13 safe-by-
      // default). Pre-V55 the call passed `{}` and relied on V54's
      // resolveSelectedBranchId backstop. Explicit pass is preferred so the
      // pre-create + post-create-resync paths use the SAME branchId source
      // (selectedBranchId at modal-open time), preventing edge cases where
      // resolveSelectedBranchId reads stale localStorage.
      const preBranchOpts = selectedBranchId ? { branchId: selectedBranchId } : { allBranches: true };
      for (const mo of months) {
        const grouped = await getAppointmentsByMonth(mo, preBranchOpts);
        const appts = Object.values(grouped || {}).flat();
        appts.forEach(a => {
          if (!a.date || !a.startTime || !a.endTime) return;
          if (shouldBlockDoctorSlot(a, doctorSlotCfg)) {
            doctorBookedSlots.push({ date: a.date, startTime: a.startTime, endTime: a.endTime });
          }
          if (shouldBlockScheduleSlot(a, filterCfg)) {
            bookedSlots.push({ date: a.date, startTime: a.startTime, endTime: a.endTime });
          }
        });
      }

      // 4. Generate token — WS3 (2026-06-10): 16 bytes = 128-bit (was 5 bytes =
      // 40-bit). Mirrors patientLinkToken (AdminDashboard:4597). clinic_schedules
      // `get` is public-by-token (WS1) so the token must be unguessable.
      const token = 'SCH-' + Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');

      // V56 / BS-15 (2026-05-08) — auto-close dates where the picked
      // (schedSelectedDoctor, schedSelectedRoom) combo isn't licensed per
      // the doctor's be_staff_schedules entries. Skip if either pick is
      // null (admin chose "all doctors" or "all rooms"). Pre-V56 entries
      // with no roomIds field return [] (backward-compat preserved).
      // closedDays union = admin-set schedClosedDays + V56 auto-closures.
      //
      // V60 / AV32 (2026-05-08) — fetch be_staff_schedules ONCE, reuse for
      // BOTH V56 auto-closure AND V60 doctorDays derivation. Pre-V60 the
      // saved doc dumped `[...schedDoctorDays]` (admin's manual paint Set)
      // verbatim — admin who painted only March/April but generated a May
      // link produced a doc with zero May doctorDays → every cell disabled
      // on customer page (root cause of V60). Fix: derive from canonical
      // `be_staff_schedules` for the months window when a specific doctor
      // is picked; UNION with admin's manual paint scoped to the months
      // window (preserves admin's ability to ADD ad-hoc dates beyond the
      // schedule, but prevents prior-month manual paint from leaking into
      // a future-month link).
      // V62-bis (2026-05-08) — fetch branch-wide entries when no specific
      // doctor selected. Mirrors V61 useEffect line ~654 extension.
      // Pre-V62-bis gated fetch on schedSelectedDoctor → noDoctor mode
      // (and พบแพทย์ + แพทย์ทุกคน) got empty scheduleEntries → V62
      // derivedDoctorDays = []. Bug surfaced when user generated
      // SCH-cc3964c023 (noDoctor + showDoctorStatus=false + selected
      // shockwave room) — fresh link still had doctorDays=[] post-V62
      // because V62 derivation ran on empty input.
      let scheduleEntries = [];
      try {
        scheduleEntries = schedSelectedDoctor
          ? await listStaffSchedules({ branchId: selectedBranchId, staffId: schedSelectedDoctor })
          : await listStaffSchedules({ branchId: selectedBranchId });
      } catch (e) {
        console.warn('[V60/AV32 + V62-bis] listStaffSchedules failed:', e?.message || e);
      }
      // Build every calendar date in the link's months window so the
      // derive helpers can iterate them day-by-day.
      const datesInRange = [];
      for (const mo of months) {
        const [yMo, mMo] = mo.split('-').map(Number);
        const daysInMo = new Date(yMo, mMo, 0).getDate();
        for (let d = 1; d <= daysInMo; d++) {
          datesInRange.push(`${mo}-${String(d).padStart(2, '0')}`);
        }
      }
      let v56AutoClosed = [];
      if (schedSelectedDoctor && schedSelectedRoom) {
        try {
          v56AutoClosed = derivedAutoClosedDates({
            doctorId: schedSelectedDoctor,
            roomId: schedSelectedRoom,
            allEntries: scheduleEntries,
            datesISO: datesInRange,
          });
        } catch (e) {
          console.warn('[V56/BS-15] auto-closure derivation failed:', e?.message || e);
        }
      }
      // V60 / AV32 — derive doctor working days from canonical source.
      let derivedDoctorDays = [];
      if (schedSelectedDoctor) {
        try {
          derivedDoctorDays = derivedDoctorDaysFromSchedules({
            doctorId: schedSelectedDoctor,
            allEntries: scheduleEntries,
            datesISO: datesInRange,
          });
        } catch (e) {
          console.warn('[V60/AV32] doctor-days derivation failed:', e?.message || e);
        }
      }
      // V62 / AV34 (2026-05-08) — extend doctorDays + per-date hours
      // derivation to ALL link modes (including noDoctorRequired). Pre-V62
      // bug: noDoctorRequired link had `doctorDays: []` saved → 🔥 emoji
      // never rendered + showDoctorStatus overlay never fired (because
      // isSlotWithinDoctorHours requires doctorDaysSet.has(date)). User
      // case (SCH-9c201860e1, shockwave link with showDoctorStatus=true)
      // showed clean shockwave availability but ZERO doctor info → customer
      // couldn't know "doctor is also free, I could pivot to consultation".
      //
      // V62 derives doctorDays + customDoctorHours from be_staff_schedules
      // for the link's effective doctor set:
      //   - พบแพทย์ specific doctor → that doctor's days + hours (V60 case)
      //   - พบแพทย์ ทุกคน           → union of ALL doctors
      //   - ไม่พบแพทย์              → union of ALL doctors (so customer can
      //                                see when ANY doctor is on-shift, in
      //                                case they want to switch to a
      //                                consultation booking)
      //
      // The doctor-id filter `v62DoctorIdsForDerivation` mirrors the room
      // filter (V61) — null = aggregate all branch doctors.
      const v62DoctorIdsForDerivation = schedSelectedDoctor ? [schedSelectedDoctor] : null;
      let v62MultiDoctorDays = [];
      let v62DoctorHoursPerDate = {};
      try {
        v62MultiDoctorDays = derivedDoctorDaysAcrossWindow({
          doctorIds: v62DoctorIdsForDerivation,
          allEntries: scheduleEntries,
          datesISO: datesInRange,
        });
        v62DoctorHoursPerDate = derivedDoctorWorkingHoursPerDate({
          doctorIds: v62DoctorIdsForDerivation,
          allEntries: scheduleEntries,
          datesISO: datesInRange,
        });
      } catch (e) {
        console.warn('[V62/AV34] doctor-days/hours derivation failed:', e?.message || e);
      }
      // Manual paint scoped to months window — prior-month paints (from
      // schedule_prefs__{branch}) DON'T leak into the saved doc anymore.
      const monthSet = new Set(months);
      const inMonthsManualDoctorDays = [...schedDoctorDays].filter(
        (d) => typeof d === 'string' && monthSet.has(d.slice(0, 7)),
      );
      // V62 / AV34 — union V60 derived (specific doctor) + V62 multi-doctor
      // (ALL doctors path for noDoctor + ทุกคน modes) + admin manual paint.
      // The two derivations overlap in the "specific doctor" case (V60
      // returns subset of V62); Set dedup handles it cleanly. For noDoctor
      // mode V60 returns []; V62 fills the gap with all-doctors union.
      const finalDoctorDays = [...new Set([
        ...derivedDoctorDays,
        ...v62MultiDoctorDays,
        ...inMonthsManualDoctorDays,
      ])].sort();
      // V62 / AV34 — merge derived per-date hours with admin manual overrides.
      // Admin override wins (admin-set per-day exception always trumps the
      // raw schedule data, e.g. for ad-hoc "clinic closes early" days).
      const v62MergedCustomDoctorHours = {
        ...v62DoctorHoursPerDate,
        ...(schedCustomDoctorHours || {}),
      };
      // V60 / AV32 — pre-flight gate: when noDoctorRequired=false, refuse
      // to save a link that would have ZERO doctor days in any month
      // (every cell would render disabled on customer page → "กดดูอะไร
      // ไม่ได้เลย" silent breakage). Surfaces the gap to admin before
      // the link goes out instead of letting the customer hit a dead
      // calendar.
      if (!schedNoDoctorRequired) {
        const monthsCovered = new Set(finalDoctorDays.map((d) => d.slice(0, 7)));
        const missingMonths = months.filter((m) => !monthsCovered.has(m));
        if (missingMonths.length > 0) {
          const monthLabels = missingMonths.map((m) => {
            const [yy, mm] = m.split('-').map(Number);
            const thaiMonths = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
            return `${thaiMonths[mm - 1]} ${yy + 543}`;
          });
          showToast(
            `ยังไม่มีตารางหมอเข้าสำหรับ ${monthLabels.join(', ')} — แก้ไขตารางคลินิกหรือตารางหมอก่อนสร้างลิงก์`,
            7000,
          );
          setSchedGenLoading(false);
          return;
        }
      }
      // V61 / AV33 (2026-05-08) — pre-flight gate Q2=A: refuse to save a
      // link with zero eligible rooms (broken customer-facing dropdown
      // would render empty calendar). Mirrors V60 doctorDays gate.
      if (v61EligibleRoomIds.length === 0) {
        showToast(
          schedNoDoctorRequired
            ? 'ไม่พบห้องที่ไม่มีแพทย์เข้าตรวจในระยะเวลาที่เลือก — แก้ไขตารางหมอก่อน'
            : (schedSelectedDoctor
                ? 'แพทย์ที่เลือกไม่มีตารางเข้าห้องในระยะเวลาที่เลือก — แก้ไขตารางหมอก่อน'
                : 'ไม่พบห้องที่มีแพทย์เข้าตรวจในระยะเวลาที่เลือก — แก้ไขตารางหมอก่อน'),
          7000,
        );
        setSchedGenLoading(false);
        return;
      }
      // V61 / AV33 — v61SelectedRoomIds was computed earlier (before the
      // bookedSlots filter loop) so the loop applies array-aware filtering.
      // Q4=A: customer link reflects WHAT WAS COMPUTED AT GEN TIME; refreshed
      // on admin Sync only (resync paths recompute via same helpers).
      const closedDaysUnion = [...new Set([...(schedClosedDays || []), ...v56AutoClosed])].sort();

      // 5. Save schedule doc (world-readable by token — do NOT include
      //    admin-only fields like user.uid that leak internal identifiers).
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'clinic_schedules', token), {
        token,
        createdAt: serverTimestamp(),
        enabled: true,
        // Phase 22.0c (2026-05-06 EOD) — stamp branchId so this schedule
        // link is scoped to the branch where admin created it. The admin's
        // schedule list filters by selectedBranchId; the public-page
        // bookedSlots are pre-filtered using THIS branchId (not the
        // current admin's selectedBranchId at re-sync time). User directive:
        // "ลิ้งก์ตารางที่ส่งให้ลูกค้า จะต้องเป็นข้อมูลคนละสาขากัน".
        branchId: selectedBranchId || '',
        months,
        // V55/BS-14 (2026-05-08) — saved schedule-link doc carries
        // PER-BRANCH clinic open hours. Pre-V55 these read the legacy
        // global clinicSettings.X — customer link from "พระราม 3" branch
        // showed นครราชสีมา's hours. Now the saved doc reflects the
        // branch admin actually created the link from.
        clinicOpenTime: monFriOpen,
        clinicCloseTime: monFriClose,
        clinicOpenTimeWeekend: satSunOpen,
        clinicCloseTimeWeekend: satSunClose,
        slotDurationMins: schedSlotDuration,
        noDoctorRequired: schedNoDoctorRequired,
        showFrom: schedShowFrom,
        endDate: schedEndDay || '',
        // V60 / AV32 (2026-05-08) — doctorDays is now derived from
        // be_staff_schedules canonical source (when admin picks a specific
        // doctor) UNIONed with admin's manual paint scoped to months
        // window. Pre-V60 dumped `[...schedDoctorDays]` verbatim — the
        // root cause of "customer can't click anything" when admin's
        // manual paint didn't cover the link's months window.
        doctorDays: finalDoctorDays,
        closedDays: closedDaysUnion,  // V56 / BS-15 — union of admin-set + auto-closed dates
        bookedSlots,
        doctorBookedSlots: schedNoDoctorRequired ? doctorBookedSlots : [],
        manualBlockedSlots: schedManualBlocked,
        // V62 / AV34 (2026-05-08) — customDoctorHours now MERGES V62-derived
        // per-date doctor hours (from be_staff_schedules) with admin's
        // per-day overrides. Pre-V62 saved only admin overrides → customer-
        // side overlay used clinic hours as default for noDoctor mode →
        // wrong "หมอ ว่าง" coverage. V62 fixes by storing actual doctor
        // hours per-date from canonical source.
        customDoctorHours: v62MergedCustomDoctorHours,
        // V55/BS-14 — doctor entry hours default to per-branch clinic open
        // hours (admin's per-day overrides via schedCustomDoctorHours
        // are stamped separately as customDoctorHours map below). User
        // intent: "หมอเข้าจริงๆเวลานี้" reflects the branch the link
        // belongs to.
        doctorStartTime: monFriOpen,
        doctorEndTime: monFriClose,
        doctorStartTimeWeekend: satSunOpen,
        doctorEndTimeWeekend: satSunClose,
        selectedDoctorId: schedSelectedDoctor || null,
        selectedDoctorName: allPractitioners.find(p => p.id === schedSelectedDoctor)?.name || null,
        selectedRoomId: selectedRoomStr || null,
        // V61 / AV33 (2026-05-08) — array snapshot of room set at save time.
        // Q3=B: "ทุกห้อง" pick saves the full union; specific pick saves a
        // 1-element wrap. Backward-compat: pre-V61 docs keep `selectedRoomId`
        // single; resync logic prefers the array when present + non-empty.
        selectedRoomIds: v61SelectedRoomIds,
        selectedRoomName: selectedRoomStr
          ? (branchExamRooms.find(r => String(r.id) === selectedRoomStr)?.name || null)
          : null,
        // ไม่พบแพทย์ only — whether the customer sees "หมอว่าง/ไม่ว่าง" hint.
        showDoctorStatus: schedNoDoctorRequired ? !!schedShowDoctorStatus : false,
      });

      // 5b. Prefs are already saved on every toggle — no need to save again

      // 6. Build URL + QR
      const baseUrl = window.location.origin;
      const url = `${baseUrl}/?schedule=${token}`;
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(url)}`;
      setSchedGenResult({ token, url, qrUrl });
      showToast('สร้างลิงก์ตารางสำเร็จ', 3000);

      // Phase 20.0 Task 1 — background resync simplified: no ProClinic pull
      // (be_appointments is canonical + live), just one fresh read of
      // be_appointments and update the schedule doc's bookedSlots. Eliminates
      // the 3s-delay-per-month staggering since there's no rate-limited
      // upstream to throttle against.
      (async () => {
        try {
          const freshBookedSlots = [];
          const freshDoctorBookedSlots = [];
          // Phase 22.0c — query per the schedule's branchId (the one we
          // just stamped in the setDoc above). Ensures the bookedSlots
          // resync uses ONLY this branch's appointments.
          const branchOpts = selectedBranchId ? { branchId: selectedBranchId } : { allBranches: true };
          for (const mo of months) {
            const grouped = await getAppointmentsByMonth(mo, branchOpts);
            const appts = Object.values(grouped || {}).flat();
            appts.forEach(a => {
              if (!a.date || !a.startTime || !a.endTime) return;
              if (shouldBlockDoctorSlot(a, doctorSlotCfg)) {
                freshDoctorBookedSlots.push({ date: a.date, startTime: a.startTime, endTime: a.endTime });
              }
              if (shouldBlockScheduleSlot(a, filterCfg)) {
                freshBookedSlots.push({ date: a.date, startTime: a.startTime, endTime: a.endTime });
              }
            });
          }
          await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'clinic_schedules', token), {
            bookedSlots: freshBookedSlots,
            doctorBookedSlots: schedNoDoctorRequired ? freshDoctorBookedSlots : [],
          }).catch(e => console.warn('[schedule-resync] update failed:', token, e.message));
          console.log('[schedule-resync] updated schedule doc with fresh booked slots');
        } catch (e) { console.warn('[schedule-resync] update schedule failed:', e.message); }
      })();
    } catch (e) {
      showToast(`สร้างลิงก์ล้มเหลว: ${e.message}`, 5000);
    }
    setSchedGenLoading(false);
  };

  const enablePushNotifications = async () => {
    setPushLoading(true);
    try {
      const supported = await isSupported();
      if (!supported) {
        alert('เบราว์เซอร์นี้ไม่รองรับ Push Notifications\niPhone/iPad: ต้องเปิดจาก Safari แล้วกด "เพิ่มลงหน้าจอ" ก่อน');
        setPushLoading(false); return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        alert('กรุณาอนุญาต Notifications ในการตั้งค่าเบราว์เซอร์');
        setPushLoading(false); return;
      }
      const msg = getMessaging(app);
      const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      const token = await getToken(msg, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
      if (!token) { alert('ไม่สามารถรับ Push Token ได้ กรุณาลองใหม่'); setPushLoading(false); return; }

      const tokensRef = doc(db, 'artifacts', appId, 'public', 'data', 'push_config', 'tokens');
      const tokensSnap = await getDoc(tokensRef);
      const existing = tokensSnap.exists() ? (tokensSnap.data().tokens || []) : [];
      const alreadyExists = existing.some(t => (typeof t === 'string' ? t : t.token) === token);
      if (!alreadyExists) {
        await setDoc(tokensRef, {
          tokens: [...existing, { token, userAgent: navigator.userAgent.substring(0, 120), createdAt: new Date().toISOString() }]
        });
      }
      setPushEnabled(true);
      localStorage.setItem('lc_push_enabled', 'true');
      showToast('เปิดการแจ้งเตือนมือถือสำเร็จ! 📱');
      setShowNotifSettings(false);
    } catch (err) {
      console.error('Push setup error:', err);
      alert('เกิดข้อผิดพลาด: ' + err.message);
    }
    setPushLoading(false);
  };

  const disablePushNotifications = () => {
    setPushEnabled(false);
    localStorage.removeItem('lc_push_enabled');
    showToast('ปิดการแจ้งเตือนมือถือแล้ว');
  };

  // Fetch Form Templates
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'form_templates'), snap => {
      setFormTemplates(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    });
    return () => unsub();
  }, [db, appId]);

  // FIX ③ (2026-05-26) — push token self-heal. Diag found 7 tokens all ~2 months
  // stale. If push was previously enabled on THIS device, silently re-acquire +
  // re-register the current FCM token on load so push keeps working without the
  // admin manually re-enabling. Guarded on already-granted permission (no prompt).
  // One-shot app-load effect — NOT inside the opd_sessions snapshot callback, so
  // the V34/V36 read-only-listener constraint does not apply.
  useEffect(() => {
    if (!user || user.isAnonymous) return;
    if (typeof localStorage === 'undefined' || localStorage.getItem('lc_push_enabled') !== 'true') return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    let cancelled = false;
    (async () => {
      try {
        const supported = await isSupported();
        if (!supported || cancelled) return;
        const msg = getMessaging(app);
        const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        const token = await getToken(msg, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
        if (!token || cancelled) return;
        const tokensRef = doc(db, 'artifacts', appId, 'public', 'data', 'push_config', 'tokens');
        const tokensSnap = await getDoc(tokensRef);
        const existing = tokensSnap.exists() ? (tokensSnap.data().tokens || []) : [];
        if (existing.some(t => (typeof t === 'string' ? t : t.token) === token)) return;
        await setDoc(tokensRef, { tokens: [...existing, { token, userAgent: navigator.userAgent.substring(0, 120), createdAt: new Date().toISOString() }] });
      } catch (e) { console.warn('[push self-heal] failed:', e?.message); }
    })();
    return () => { cancelled = true; };
  }, [db, appId, user]);

  // 2026-06-16 (mobile-load reliability) — resilient queue load. If the
  // opd_sessions snapshot never fires (half-dead mobile connection), the queue
  // used to silently stay empty with no recovery; now it auto-heals (reconnect
  // + re-subscribe) and, if still failing, shows a slim non-blocking
  // "ลองใหม่" banner (chat / rest of the dashboard stay usable).
  // resetKey: selectedBranchId — the opd_sessions listener re-subscribes on a
  // branch switch (a fresh load to different data), so re-arm stuck-detection
  // for the new branch (else a hung new-branch sub would show stale data with no
  // error card). Mid-session drops on the SAME branch are handled by V17
  // visibility/online reconnect + Firestore's own listener auto-reconnect.
  // ponytail: error card is for the (re)load; ongoing live resilience = V17 + SDK.
  const { loadStatus: queueLoad, retryKey: queueRetryKey, markReady: queueReady, markError: queueErr, retry: queueRetry } = useResilientLoad({ resetKey: selectedBranchId });

  useEffect(() => {
    if (!user || user.isAnonymous) return;
    const sessionsRef = collection(db, 'artifacts', appId, 'public', 'data', 'opd_sessions');
    const unsubscribe = onSnapshot(sessionsRef, (snapshot) => {
      queueReady(); // snapshot fired = queue loaded
      const now = Date.now();
      const allDocsRaw = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      // Phase 20.0 follow-up (2026-05-06) — per-branch session filter.
      // Frontend tabs (queue / deposit / no-deposit / appointment / history)
      // all derive from this listener. Filter by selectedBranchId; legacy
      // docs without branchId fall through (one-shot migration script
      // stamps existing docs with default branch).
      const allDocs = selectedBranchId
        ? allDocsRaw.filter(s => !s.branchId || String(s.branchId) === String(selectedBranchId))
        : allDocsRaw;

      // [Auto-cleanup MOVED to cron 2026-05-24 — see api/cron/opd-session-cleanup-sweep.js]
      // PRE-2026-05-24: this listener body called updateDoc/deleteDoc on every
      // snapshot fire for expired sessions. Each write triggered ANOTHER snapshot
      // fire (own-write mirror) → cascade. With N admin tabs open, N parallel
      // cleanup runs raced for the same docs. User-visible symptom: Frontend
      // page slow because opd_sessions listener pulled 110 docs + cascaded writes
      // per fire. Backend stayed fast because it doesn't subscribe to opd_sessions.
      //
      // FIX: cron `api/cron/opd-session-cleanup-sweep.js` (every 30 min) owns
      // the cleanup. Shared decision logic in `src/lib/opdSessionCleanupCore.js`
      // (decideCleanupAction). Listener becomes pure read-only — no cascade.
      // Trade-off: cleanup latency up to 30 min vs sub-second inline (acceptable —
      // admin doesn't wait on archive/hide ops).
      //
      // V82-followup opt-out (`_v82FollowupOpdResetAt`) preserved in
      // decideCleanupAction (returns skip). V116 hide-vs-delete branching for
      // linked bookings preserved. All semantics identical to legacy inline.

      // Archived sessions → history page (exclude deposits except serviceCompleted, exclude noDeposit)
      setArchivedSessions(
        allDocs
          .filter(s => s.isArchived && (s.formType !== 'deposit' || s.serviceCompleted) && !(s.isPermanent && s.formType !== 'deposit' && !s.serviceCompleted))
          .sort((a, b) => (b.archivedAt?.toMillis() || b.createdAt?.toMillis() || 0) - (a.archivedAt?.toMillis() || a.createdAt?.toMillis() || 0))
      );

      // Deposit sessions — separate from queue (exclude serviceCompleted → those go to queue)
      // V116 (2026-05-23) — isHiddenFromQueue:true sessions are hidden UNLESS
      // customer has filled (patientData) — auto-restore via read-side override
      // so admin sees the customer when they come back to fill the form.
      setDepositSessions(
        allDocs
          .filter(s => !s.isArchived && s.formType === 'deposit' && !s.serviceCompleted
            // V121 (2026-05-23): card-flow sessions stay hidden from this queue
            // REGARDLESS of patientData (closes V120 latent gap — V116's
            // patientData auto-restore would otherwise surface them post-fill).
            && !(s.isHiddenFromQueue && s.createdFromBackendBooking)
            && (!s.isHiddenFromQueue || s.patientData))
          .sort((a, b) => (b.updatedAt?.toMillis() || b.createdAt?.toMillis() || 0) - (a.updatedAt?.toMillis() || a.createdAt?.toMillis() || 0))
      );
      setArchivedDepositSessions(
        allDocs
          .filter(s => s.isArchived && s.formType === 'deposit')
          .sort((a, b) => (b.archivedAt?.toMillis() || b.createdAt?.toMillis() || 0) - (a.archivedAt?.toMillis() || a.createdAt?.toMillis() || 0))
      );

      // จองไม่มัดจำ = isPermanent + NOT deposit + NOT serviceCompleted
      // V82-fix2 (2026-05-17 EOD+3 LATE+3): EXCLUDE _v82FollowupOpdResetAt-
      // stamped sessions. Those belong in the main queue (re-sync workflow)
      // regardless of isPermanent. If user accidentally clicked
      // "กลับเข้าคิว → ลิงก์ดูข้อมูล" on a reset session, isPermanent=true
      // was set but the reset stamp still indicates queue-intent. The queue
      // filter below (line ~2282) now picks them up. Pair-edit with that
      // filter to avoid double-appearance.
      // V116 (2026-05-23) — same isHiddenFromQueue gate + patientData auto-restore
      // as deposit queue above. See line ~2270 for the rationale.
      const ndData = allDocs
          .filter(s => !s.isArchived && s.isPermanent && s.formType !== 'deposit' && !s.serviceCompleted && !s._v82FollowupOpdResetAt
              // V121 (2026-05-23): same V120-gap close as deposit filter above —
              // card-flow sessions stay hidden regardless of patientData.
              && !(s.isHiddenFromQueue && s.createdFromBackendBooking)
              && (!s.isHiddenFromQueue || s.patientData))
          .sort((a, b) => (b.updatedAt?.toMillis() || b.createdAt?.toMillis() || 0) - (a.updatedAt?.toMillis() || a.createdAt?.toMillis() || 0));
      setNoDepositSessions(ndData);
      setArchivedNoDepositSessions(
        allDocs
          .filter(s => s.isArchived && s.isPermanent && s.formType !== 'deposit' && !s.serviceCompleted)
          .sort((a, b) => (b.archivedAt?.toMillis() || b.createdAt?.toMillis() || 0) - (a.archivedAt?.toMillis() || a.createdAt?.toMillis() || 0))
      );

      const data = allDocs.filter(session => {
          if (session.isArchived) return false;
          // V116 (2026-05-23) — isHiddenFromQueue gate with patientData auto-restore.
          // Set by deleteSession line ~3293 when admin deletes a queue entry that
          // has no patientData but is linked to a booking (link must survive →
          // session preserved, only hide from queue). If customer fills the form
          // later (patientData becomes truthy), this filter auto-restores via
          // the override → session reappears in queue. Read-side mechanism — no
          // write needed at customer-fill time. Mirrors sibling deposit + noDeposit
          // filters above. User directive: "หายไปแต่ list รายการในคิวหน้าคลินิกเฉยๆ".
          // V121 (2026-05-23) — card-flow sessions stay hidden REGARDLESS of patientData.
          // Closes V120 latent gap: V116's `&& !patientData` clause auto-restores
          // hidden sessions once filled, but V118 card-flow sessions should NEVER
          // appear in คิวหน้า Clinic queue (Card has its own affordances). Tested
          // gate at line ~3418 + bubble surfaces use the SAME predicate semantics.
          if (session.isHiddenFromQueue && session.createdFromBackendBooking) return false;
          if (session.isHiddenFromQueue && !session.patientData) return false;
          // V82-fix2 (2026-05-17 EOD+3 LATE+3): _v82FollowupOpdResetAt opt-out
          // MUST fire BEFORE any other early-reject so that reset sessions are
          // ALWAYS in queue once unarchived — regardless of isPermanent (set
          // by restoreToQueue 'permanent' choice) or deposit/serviced state.
          // Bug found 2026-05-17 EOD+3 LATE+3 — 2 customers (LOV-1F5QNL,
          // LOV-5PG74T) silently routed to จองไม่มัดจำ tab after user clicked
          // "กลับเข้าคิว → ลิงก์ดูข้อมูล" on reset opd_sessions. The previous
          // ordering placed this opt-out AFTER line 2275's isPermanent reject,
          // making it unreachable for that path. Sibling จองไม่มัดจำ filter
          // also excludes reset sessions to avoid double-appearance — pair
          // edit at line ~2263 above. Deposit-unserviced case left to existing
          // ordering (per state-machine test E intent — deposit tab assignment
          // has priority for that formType only).
          if (session._v82FollowupOpdResetAt && session.formType !== 'deposit') return true;
          if (session.formType === 'deposit' && !session.serviceCompleted) return false; // deposit ที่ยังไม่มารับบริการ → อยู่ tab จองมัดจำ
          if (session.isPermanent && session.formType !== 'deposit' && !session.serviceCompleted) return false; // จองไม่มัดจำ → อยู่ tab จองไม่มัดจำ
          if (session.isPermanent) return true;
          if (session.formType === 'deposit' && session.serviceCompleted) return true; // deposit มารับบริการแล้ว → แสดงในคิว
          // V82-followup (2026-05-17 EOD+3 LATE) — manual reset overrides the 2hr
          // freshness rule. Used when admin wipes be_customers but wants the
          // original kiosk intake records back in queue for re-sync into fresh
          // be_customers (new HN starting LC-26000001).
          // (V82-fix2 elevated the non-deposit branch above; this fallthrough
          // remains for legacy / edge cases where formType is missing.)
          if (session._v82FollowupOpdResetAt) return true;
          if (!session.createdAt) return true;
          const createdAtMs = session.createdAt.toMillis();
          return (now - createdAtMs) <= SESSION_TIMEOUT_MS;
        });
      data.sort((a, b) => {
        const timeA = a.updatedAt?.toMillis() || a.createdAt?.toMillis() || 0;
        const timeB = b.updatedAt?.toMillis() || b.createdAt?.toMillis() || 0;
        return timeB - timeA;
      });

      // รวม queue + noDeposit สำหรับ notification detection (ทั้ง 2 tab ต้องมี noti)
      // FIX ② (2026-05-26) — card-flow (backend-booking) sessions are EXCLUDED
      // from data/ndData (2305/2329/2354) because the appointment card is their
      // display surface — but that ALSO dropped them from notification detection,
      // so their form-fills never fired bubble+sound. Re-include the EXACT
      // excluded predicate here. They are not in data/ndData (excluded) so no
      // double-count. Downstream detector (new-session branch ~2429) + dedup
      // (lastNotifiedStrRef) + first-load stamp (else ~2450) all apply unchanged.
      const cardFlowNotif = allDocs.filter(s =>
        !s.isArchived && s.isHiddenFromQueue && s.createdFromBackendBooking &&
        s.patientData && s.isUnread && s.status === 'completed'
      );
      const allNotifData = [...data, ...ndData, ...cardFlowNotif];

      if (prevSessionsRef.current.length > 0) {
        let updatedSessions = [];
        let brokerSyncSessions = [];
        let brokerDesyncSessions = [];
        allNotifData.forEach(newS => {
          const oldS = prevSessionsRef.current.find(s => s.id === newS.id);
          if (oldS) {
            const oldStr = stableStr(oldS.patientData || {});
            const newStr = stableStr(newS.patientData || {});
            // Only notify when notifications enabled AND session is unread AND patientData changed
            // + dedup: ไม่ซ้ำถ้า data เดิมเคย notify แล้ว (ป้องกัน toast/sound รัวจาก snapshot ซ้ำ)
            if (isNotifEnabled && newS.isUnread && (!oldS.isUnread || oldStr !== newStr) && lastNotifiedStrRef.current[newS.id] !== newStr) {
              lastNotifiedStrRef.current[newS.id] = newStr;
              updatedSessions.push(newS);
            }
            // ── ตัดสายวงจร: isUnread true→false = admin กด Report ──────────────────
            if (oldS.isUnread && !newS.isUnread) {
              lastViewedStrRef.current[newS.id] = newStr;
              lastAutoSyncedStrRef.current[newS.id] = newStr;
              delete lastNotifiedStrRef.current[newS.id];
              return;
            }
            // ── Patient edit detected: drop sync status → admin ต้องกด OPD ใหม่ ──
            if (
              oldStr !== newStr && newStr !== '{}' && newS.patientData &&
              newS.formType !== 'deposit' &&
              newS.brokerStatus === 'done' && newS.brokerProClinicId &&
              oldS.brokerStatus === 'done' &&
              oldS.brokerProClinicId === newS.brokerProClinicId &&
              lastAutoSyncedStrRef.current[newS.id] !== newStr &&
              !autoSyncInFlightRef.current.has(newS.id)
            ) {
              lastAutoSyncedStrRef.current[newS.id] = newStr;
              brokerDesyncSessions.push(newS);
            }
          } else if (newS.isUnread && newS.patientData && newS.status === 'completed') {
            // Session ใหม่ที่ส่งข้อมูลมาแล้ว แต่ไม่เจอใน prevRef (เช่น สร้าง+ส่งพร้อมกัน, หรือ listener restart)
            const newStr = stableStr(newS.patientData || {});
            if (isNotifEnabled && lastNotifiedStrRef.current[newS.id] !== newStr) {
              lastNotifiedStrRef.current[newS.id] = newStr;
              updatedSessions.push(newS);
            }
          }
        });

        if (isNotifEnabled && updatedSessions.length > 0) {
          playNotificationSound(notifVolume);
          const names = updatedSessions.map(s => s.sessionName || s.patientData?.firstName || s.id).join(', ');
          showToast(`อัปเดตข้อมูลประวัติ: ${names}`);
        }

        // ── ลูกค้าแก้ข้อมูล → หลุด sync รอ admin กด OPD ใหม่ ─────────────────
        brokerDesyncSessions.forEach(session => {
          const ref = doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', session.id);
          updateDoc(ref, { brokerStatus: null, brokerError: null, brokerJob: null }).catch(() => {});
        });
      } else {
        // ── First load: stamp ทุก session เพื่อป้องกัน re-sync + notification ซ้ำตอนเปิดหน้า ──
        allNotifData.forEach(s => {
          const str = stableStr(s.patientData || {});
          if (s.brokerStatus === 'done' && s.brokerProClinicId && s.patientData) {
            lastAutoSyncedStrRef.current[s.id] = str;
          }
          // stamp notification dedup สำหรับทุก session ที่มีอยู่แล้ว
          lastNotifiedStrRef.current[s.id] = str;
        });
      }
      // ─── Sync brokerPending local state กับ Firestore ─────────────────────────
      allDocs.forEach(s => {
        if (brokerTimers.current[s.id] && s.brokerStatus !== 'pending') {
          clearTimeout(brokerTimers.current[s.id]);
          delete brokerTimers.current[s.id];
          setBrokerPending(prev => { const n = { ...prev }; delete n[s.id]; return n; });
        }
      });

      // ─── Detect LC_GET_COURSES result จาก Firestore (cross-device delivery) ──
      allDocs.forEach(s => {
        const lc = s.latestCourses;
        if (lc?.jobId && lc.jobId === coursesJobIdRef.current) {
          coursesJobIdRef.current = null;
          setCoursesPanel(prev => prev?.sessionId === s.id
            ? { ...prev, status: lc.success === false ? 'error' : 'done',
                patientName: lc.patientName || prev.patientName,
                courses: lc.courses || [], expiredCourses: lc.expiredCourses || [],
                error: lc.error || '' }
            : prev
          );
        }
      });

      // ─── Auto-trigger courses refresh เมื่อลูกค้าเปิดลิงก์ ────────────────────
      // NOTE: ไม่แตะ brokerStatus — fetch courses เงียบๆ ไม่กระทบสถานะ OPD
      allDocs.forEach(s => {
        if (
          s.coursesRefreshRequest &&
          s.brokerProClinicId &&
          !autoCoursesRequestedRef.current.has(s.id)
        ) {
          autoCoursesRequestedRef.current.add(s.id);
          const jobId = `courses_auto_${s.id}_${Date.now()}`;
          const ref = doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', s.id);
          updateDoc(ref, {
            coursesRefreshRequest: null,
            lastCoursesAutoFetch: serverTimestamp(),
          }).catch(e => console.error('auto courses trigger:', e));
          // Phase 20.0 Task 5a (2026-05-06) — read be_customers doc directly
          // (customer.courses[] is already maintained by treatment / sale flows).
          // Replaces broker.getCourses (which scraped ProClinic).
          getCustomer(s.brokerProClinicId)
            .then(customer => {
              autoCoursesRequestedRef.current.delete(s.id);
              const cRef = doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', s.id);
              const result = customer ? {
                success: true,
                courses: customer.courses || [],
                expiredCourses: customer.expiredCourses || [],
                appointments: customer.appointments || [],
                patientName: [customer.firstname || '', customer.lastname || ''].filter(Boolean).join(' ').trim() || customer.patientData?.fullName || '',
                error: null,
              } : { success: false, courses: [], expiredCourses: [], appointments: [], patientName: '', error: 'ไม่พบลูกค้าใน be_customers' };
              updateDoc(cRef, {
                latestCourses: {
                  courses: result?.courses || [], expiredCourses: result?.expiredCourses || [],
                  appointments: result?.appointments || [], patientName: result?.patientName || '',
                  jobId, fetchedAt: new Date().toISOString(),
                  success: !!result?.success, error: result?.error || null,
                },
              }).catch(() => {});
            }).catch(() => { autoCoursesRequestedRef.current.delete(s.id); });
        }
      });

      prevSessionsRef.current = allNotifData;
      setSessions(data);
      // FIX ① — publish the unfiltered branch session set for live linked-session
      // resolution (includes card-flow / isHiddenFromQueue sessions the queue
      // filters drop). Read-only: no Firestore write here (V34/V36 cascade lock).
      setAllLinkedSessions(allDocs);
    }, (error) => { console.error("Firestore Error:", error); queueErr(); });
    return () => unsubscribe();
    // Phase 20.0 follow-up (2026-05-06) — selectedBranchId in deps so the
    // filter re-applies on BranchSelector switch.
    // 2026-06-16 — queueRetryKey in deps so resilient auto-retry / "ลองใหม่" re-subscribes.
  }, [db, appId, user, isNotifEnabled, notifVolume, selectedBranchId, queueRetryKey]);

  // ── Auto-fetch deposit options when viewing a session with deposit data ──
  useEffect(() => {
    if (viewingSession?.depositData && !depositOptions && !depositOptionsLoading) {
      fetchDepositOptions();
    }
  }, [viewingSession]);

  useEffect(() => {
    if (viewingSession) {
      const latestSession = sessions.find(s => s.id === viewingSession.id)
        || archivedSessions.find(s => s.id === viewingSession.id)
        || depositSessions.find(s => s.id === viewingSession.id)
        || archivedDepositSessions.find(s => s.id === viewingSession.id)
        || noDepositSessions.find(s => s.id === viewingSession.id);
      if (latestSession) {
        const currentStr = stableStr(viewingSession.patientData || {});
        const latestStr = stableStr(latestSession.patientData || {});
        // เปรียบเทียบเฉพาะ patientData — ไม่รวม updatedAt เพราะ Firestore serverTimestamp
        // มี 2 snapshots (local estimated + server actual) ทำให้ toMillis() ต่างกัน → false positive banner
        const dataOutOfSync = currentStr !== latestStr;

        // Sync broker fields ให้ viewingSession ทันทีที่ Firestore อัปเดต
        const brokerFields = ['brokerStatus','brokerProClinicId','brokerProClinicHN','brokerError','opdRecordedAt','brokerFilledAt','brokerLastAutoSyncAt','depositSyncStatus','depositSyncAt','depositSyncError','depositData','depositProClinicId'];
        const brokerChanged = brokerFields.some(k => viewingSession[k] !== latestSession[k]);

        if (brokerChanged) {
          // อัพเดท broker fields เงียบๆ — ไม่แตะ hasNewUpdate
          // (broker sync เสร็จไม่ใช่เหตุผลที่จะซ่อน banner ที่ patient เพิ่งส่งมา)
          setViewingSession(latestSession);
        } else if (dataOutOfSync) {
          if (lastViewedStrRef.current[viewingSession.id] === latestStr) {
            // stale session จาก isUnread transition — update เงียบๆ ไม่โชว์ banner
            setViewingSession(latestSession);
            setHasNewUpdate(false);
          } else {
            setHasNewUpdate(true);   // patient edit จริง → โชว์ banner
          }
        }
        // else: ข้อมูลตรงกัน — ไม่แตะ hasNewUpdate
        // banner จะหายได้เฉพาะเมื่อ user กด "โหลดข้อมูล" หรือปิด session เท่านั้น
      }
    } else {
      setHasNewUpdate(false);
    }
  }, [sessions, archivedSessions, viewingSession]); // eslint-disable-line react-hooks/exhaustive-deps

  const formatRemainingTime = (session) => {
    if (session.isPermanent) return 'ถาวร (ลิงก์ล่วงหน้า)';
    if (!session.createdAt) return 'กำลังคำนวณ...';
    const expiresAt = session.createdAt.toMillis() + SESSION_TIMEOUT_MS;
    const left = expiresAt - currentTime;
    if (left <= 0) return 'หมดอายุแล้ว';
    const totalMins = Math.floor(left / 60000);
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    if (h > 0) return `เหลือ ${h} ชม. ${m} นาที`;
    return m > 0 ? `เหลือ ${m} นาที` : 'เหลือน้อยกว่า 1 นาที';
  };

  const getBadgeForFormType = (formType, customTemplate) => {
    if (formType === 'deposit') return <span className="bg-emerald-950/50 text-emerald-400 border border-emerald-900/50 px-1.5 py-0.5 rounded text-[11px] font-bold whitespace-nowrap inline-block flex items-center gap-1"><Banknote size={10}/> จองมัดจำ</span>;
    if (formType === 'followup_ed') return <span className="bg-purple-950/50 text-purple-400 border border-purple-900/50 px-1.5 py-0.5 rounded text-[11px] font-bold whitespace-nowrap inline-block">FOLLOW-UP: IIEF</span>;
    if (formType === 'followup_adam') return <span className="bg-blue-950/50 text-blue-400 border border-blue-900/50 px-1.5 py-0.5 rounded text-[11px] font-bold whitespace-nowrap inline-block">FOLLOW-UP: ADAM</span>;
    if (formType === 'followup_mrs') return <span className="bg-pink-950/50 text-pink-400 border border-pink-900/50 px-1.5 py-0.5 rounded text-[11px] font-bold whitespace-nowrap inline-block">FOLLOW-UP: MRS</span>;
    if (formType === 'custom') return <span className="bg-cyan-950/50 text-cyan-400 border border-cyan-900/50 px-1.5 py-0.5 rounded text-[11px] font-bold whitespace-nowrap inline-block flex items-center gap-1"><LayoutTemplate size={10}/> {customTemplate?.title || 'CUSTOM FORM'}</span>;
    return <span className="bg-gray-800 text-gray-300 border border-gray-700 px-1.5 py-0.5 rounded text-[11px] font-bold whitespace-nowrap inline-block">INTAKE</span>;
  };

  // ── Deposit: build form options from be_* (Phase 20.0 Task 4, 2026-05-06) ──
  // Replaces broker.getDepositOptions which scraped ProClinic's deposit form.
  // Sources: listStaff (advisors) + listDoctors + listExamRooms + listAllSellers
  // + canonical TIME_SLOTS (Phase 19.0 15-min) + static paymentMethods
  // (Thai canonical list — admin can rewire to listBankAccounts in a follow-up).
  const PAYMENT_METHODS_STATIC = Object.freeze([
    { value: 'cash', label: 'เงินสด' },
    { value: 'transfer', label: 'โอน' },
    { value: 'credit', label: 'บัตรเครดิต' },
    { value: 'debit', label: 'บัตรเดบิต' },
    { value: 'qr', label: 'QR Code' },
  ]);
  const CUSTOMER_SOURCES_STATIC = Object.freeze([
    { value: 'walk-in', label: 'Walk-in' },
    { value: 'facebook', label: 'Facebook' },
    { value: 'line', label: 'LINE' },
    { value: 'referral', label: 'แนะนำ' },
    { value: 'other', label: 'อื่นๆ' },
  ]);
  // Phase 24.0-quaterdecies (2026-05-06) — appointment channels include
  // "โทรศัพท์" (phone call) so admin can record bookings made by phone, in
  // addition to the customer-source channels. User: "ใน field dropdown
  // ช่องทางนัดหมาย ของทั้ง 2 modal ให้เพิ่ม โทรศัพท์ เข้าไปด้วย".
  const APPT_CHANNELS_STATIC = Object.freeze([
    { value: 'phone', label: 'โทรศัพท์' },
    { value: 'walk-in', label: 'Walk-in' },
    { value: 'facebook', label: 'Facebook' },
    { value: 'line', label: 'LINE' },
    { value: 'referral', label: 'แนะนำ' },
    { value: 'other', label: 'อื่นๆ' },
  ]);
  // Phase 22.0b — fetchDepositOptions captures selectedBranchId at fetch
  // time + invalidates cache when branch switches. Doctors + staff are
  // filtered via filterDoctorsByBranch / filterStaffByBranch (listDoctors
  // and listStaff in scopedDataLayer are UNIVERSAL — no auto-inject).
  // sellers + rooms are auto-injected via scopedDataLayer, so they come
  // back already branch-scoped.
  //
  // assistants is populated from the SAME filtered doctors list (mirrors
  // backend AppointmentFormModal's pattern: a doctor can be picked as an
  // assistant for cross-role coverage). Pre-Phase-22.0b the assistants
  // dropdown was BROKEN — depositOptions.assistants was referenced at
  // render time but never populated.
  // Phase 23.0 — bump on ANY shape change to depositOptions (additions /
  // renames / removals). Cache check below invalidates when version mismatches
  // → new fetch builds the up-to-date shape. Prevents the stale-state HMR
  // bug class where a previously-cached options object survived a code
  // update that added new keys (e.g. appointmentChannels in Phase 23.0).
  const DEPOSIT_OPTIONS_SCHEMA_VERSION = 23;
  const fetchDepositOptions = async () => {
    // Cache invalidation: reuse cached options ONLY when branch AND schema
    // version both match the current code. Otherwise re-fetch.
    if (
      depositOptions
      && depositOptions._branchId === (selectedBranchId || '')
      && depositOptions._schemaVersion === DEPOSIT_OPTIONS_SCHEMA_VERSION
    ) return;
    setDepositOptionsLoading(true);
    try {
      // V41 (2026-05-08) — opt-in for full list; filter isHidden when building
      // picker options so hidden persons don't appear in deposit dropdowns. AV20.
      const [doctors, staff, rooms, sellers] = await Promise.all([
        listDoctors({ includeHidden: true }).catch(() => []),
        listStaff({ includeHidden: true }).catch(() => []),
        listExamRooms().catch(() => []),
        listAllSellers().catch(() => []),
      ]);
      const branchScopedDoctors = filterDoctorsByBranch(doctors || [], selectedBranchId)
        .filter(d => d.status !== 'พักใช้งาน' && !d.isHidden);
      const branchScopedStaff = filterStaffByBranch(staff || [], selectedBranchId)
        .filter(s => s.status !== 'พักใช้งาน' && !s.isHidden);
      const timeOptions = CANONICAL_TIME_SLOTS.map(t => ({ value: t, label: t }));
      const doctorOptions = branchScopedDoctors.map(d => ({ value: String(d.id), label: d.name || d.id }));
      const options = {
        _branchId: selectedBranchId || '',
        _schemaVersion: DEPOSIT_OPTIONS_SCHEMA_VERSION,
        paymentMethods: [...PAYMENT_METHODS_STATIC],
        sellers: (sellers || []).map(s => ({ value: String(s.id), label: s.name || s.id })),
        appointmentStartTimes: timeOptions,
        appointmentEndTimes: timeOptions,
        doctors: doctorOptions,
        // Phase 22.0b — assistants populated from filtered doctors (mirror
        // of backend AppointmentFormModal: any doctor can be chosen as an
        // assistant). Fixes the pre-Phase 22.0b "empty assistants dropdown"
        // bug visible in both จองมัดจำ + จองไม่มัดจำ modals.
        assistants: doctorOptions,
        rooms: (rooms || [])
          .filter(r => r.status !== 'พักใช้งาน')
          .map(r => ({ value: String(r.id), label: r.name || r.roomName || r.id })),
        advisors: branchScopedStaff.map(s => ({ value: String(s.id), label: s.name || s.id })),
        sources: [...CUSTOMER_SOURCES_STATIC],
        // Phase 23.0 — ช่องทางนัดหมาย dropdown reads `appointmentChannels` key.
        // Phase 24.0-quaterdecies — APPT_CHANNELS_STATIC includes "โทรศัพท์"
        // (phone-call) up-front so admin can record phone bookings.
        // Pre-fix: fetchDepositOptions only set `sources` → both deposit & no-deposit
        // modal channel selects rendered with empty options (silent UX failure).
        // Same static enum is reused (walk-in / FB / LINE / referral / other).
        appointmentChannels: [...APPT_CHANNELS_STATIC],
      };
      setDepositOptions(options);
    } catch (e) { console.error('fetchDepositOptions:', e); }
    setDepositOptionsLoading(false);
  };

  // Phase 22.0b — invalidate cached depositOptions when branch switches so
  // the next modal-open re-fetches with the new branch's data.
  useEffect(() => {
    if (depositOptions && depositOptions._branchId !== (selectedBranchId || '')) {
      setDepositOptions(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId]);

  const confirmCreateDeposit = async () => {
    if (!user) return;
    setIsGenerating(true);
    setShowDepositForm(false);

    const shortId = genShortId(32); // WS1 C1: 128-bit id-as-secret (was 6=24-bit → guessable). opd_session doc-id IS the patient-link secret; split get/list rule keeps anon from enumerating.
    const sessionId = `DEP-${shortId}`;

    const sessionDoc = {
      status: 'pending',
      createdAt: serverTimestamp(),
      // Phase 20.0 follow-up (2026-05-06) — stamp branchId on every new
      // opd_sessions doc so the queue/deposit/noDeposit/history filters
      // by selectedBranchId in real time. Falls back to empty if no branch
      // selected (defensive — user should always have a selected branch).
      branchId: selectedBranchId || '',
      patientData: null,
      isPermanent: true,
      formType: 'deposit',
      sessionName: depositFormData.sessionName?.trim() || 'ลูกค้าจอง',
      depositData: {
        paymentChannel: depositFormData.paymentChannel,
        paymentAmount: depositFormData.paymentAmount,
        depositDate: depositFormData.depositDate,
        depositTime: depositFormData.depositTime,
        salesperson: depositFormData.salesperson,
        hasAppointment: depositFormData.hasAppointment,
        appointmentDate: depositFormData.appointmentDate || null,
        appointmentStartTime: depositFormData.appointmentStartTime || null,
        appointmentEndTime: depositFormData.appointmentEndTime || null,
        consultant: depositFormData.consultant || null,
        doctor: depositFormData.doctor || null,
        assistant: depositFormData.assistant || null,
        room: depositFormData.room || null,
        appointmentChannel: depositFormData.appointmentChannel || null,
        visitPurpose: depositFormData.visitPurpose || [],
        // Phase 24.0-undecies — preserve the free-text "อื่นๆ" detail on the
        // kiosk session so edit-mode hydration can restore the input.
        visitPurposeOther: depositFormData.visitPurposeOther || '',
        // Phase 24.0-terdecies — preserve booking-time name + phone.
        customerNameTemp: depositFormData.customerNameTemp?.trim() || '',
        customerPhoneTemp: depositFormData.customerPhoneTemp?.trim() || '',
      },
    };

    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', sessionId), sessionDoc);

      // Phase 22.0b (2026-05-06 EOD) — paired write to be_deposits +
      // be_appointments so the kiosk-created deposit-booking is visible in
      // BOTH Finance.มัดจำ (be_deposits) AND BackendDashboard's จองมัดจำ
      // sub-tab (be_appointments). Pre-22.0b the kiosk write went ONLY to
      // opd_sessions.depositData (embedded field) — invisible to backend.
      // User directive: "ต้องบันทึกไปในรูปแบบการจองมัดจำใน backend ได้
      // ถูกต้อง และบันทึกมัดจำในการเงินได้ถูกต้อง ตามสาขาที่ได้มีการ Gen QR
      // และสร้างนัดประเภทต่างๆ".
      //
      // Best-effort try/catch — if the pair write fails the kiosk session
      // doc still exists (admin can retry from the queue UI later). Stamps
      // linkedDepositId / linkedAppointmentId on the session doc for
      // forensic traceability.
      // appointment-loop R1 (2026-06-03) — createDepositBookingPair now throws
      // AP1_COLLISION (atomic double-booking guard); capture it so the kiosk
      // shows a "pick another time" warning instead of a false success toast.
      let pairBookingCollision = false;
      try {
        const amt = parseFloat(depositFormData.paymentAmount) || 0;
        if (amt > 0) {
          // Phase 24.0-undecies — interpolate "อื่นๆ: <detail>" into purpose
          // string so DepositPanel "มัดจำสำหรับ" column shows the full value.
          const visitPurposeText = buildVisitPurposeText(
            depositFormData.visitPurpose,
            depositFormData.visitPurposeOther,
          );
          const doctorRecord = practitioners.find(p => String(p.id) === String(depositFormData.doctor || ''));
          const advisorRecord = practitioners.find(p => String(p.id) === String(depositFormData.consultant || ''));
          const sellerName = depositFormData.salesperson
            ? (depositOptions?.sellers || []).find(s => String(s.value) === String(depositFormData.salesperson))?.label || ''
            : '';
          const baseDepositData = {
            customerId: '',
            // Phase 24.0-terdecies — prefer the explicit booking-time name
            // (customerNameTemp) over the generic ชื่อคิว/Note when both
            // are present. Falls through to "ลูกค้าจอง" placeholder only
            // when neither was filled.
            customerName: depositFormData.customerNameTemp?.trim()
              || depositFormData.sessionName?.trim()
              || 'ลูกค้าจอง',
            customerHN: '',
            customerNameTemp: depositFormData.customerNameTemp?.trim() || '',
            customerPhoneTemp: depositFormData.customerPhoneTemp?.trim() || '',
            amount: amt,
            paymentChannel: depositFormData.paymentChannel || '',
            paymentDate: depositFormData.depositDate || todayISO(),
            paymentTime: depositFormData.depositTime || '',
            refNo: '',
            sellers: depositFormData.salesperson
              ? [{ id: String(depositFormData.salesperson), name: sellerName, percent: 100, total: amt }]
              : [],
            customerSource: '',
            sourceDetail: '',
            note: '',
            paymentEvidenceUrl: '',
            paymentEvidencePath: '',
            branchId: selectedBranchId || '',
          };
          // Phase 24.0-quaterdecies (2026-05-06) — branch on hasAppointment:
          //   true  → createDepositBookingPair (writes BOTH be_deposits +
          //           be_appointments atomically, with appointment metadata)
          //   false → createDeposit (writes be_deposits ONLY — no appointment
          //           doc; user typed only ชื่อ/เบอร์/amount). The pair-helper
          //           throws when called without hasAppointment+appointment,
          //           which previously stamped depositSyncStatus='failed' on
          //           opd_sessions and surfaced as "มัดจำผิดพลาด" in the UI.
          let pairResult = null;
          let depositId = null;
          if (depositFormData.hasAppointment) {
            const pairPayload = {
              ...baseDepositData,
              hasAppointment: true,
              appointment: {
                type: 'deposit-booking',
                option: 'once',
                date: depositFormData.appointmentDate || '',
                startTime: depositFormData.appointmentStartTime || '',
                endTime: depositFormData.appointmentEndTime || depositFormData.appointmentStartTime || '',
                doctorId: depositFormData.doctor ? String(depositFormData.doctor) : '',
                doctorName: doctorRecord?.name || '',
                advisorId: depositFormData.consultant ? String(depositFormData.consultant) : '',
                advisorName: advisorRecord?.name || '',
                assistantIds: depositFormData.assistant ? [String(depositFormData.assistant)] : [],
                assistantNames: [],
                roomId: depositFormData.room ? String(depositFormData.room) : '',
                roomName: '',
                channel: depositFormData.appointmentChannel || '',
                purpose: visitPurposeText,
                note: '',
                color: '',
                lineNotify: false,
              },
            };
            // Phase 24.0-vicies-novies (2026-05-07) — stamp linkedOpdSessionId
            // on BOTH halves of the pair so attachCustomerToOpdSessionLinks
            // can find the booking at "บันทึกลง OPD" save time and cascade
            // the new customerId. The kiosk session sessionId IS the unique
            // link the user mentioned ("เวลาเราส่ง link ให้ใครอะ มันสร้าง
            // unique link มาอยู่แล้ว"). Phone-mismatch resilient by design.
            pairResult = await createDepositBookingPair({
              depositData: pairPayload,
              branchId: selectedBranchId || '',
              linkedOpdSessionId: sessionId,
            });
            depositId = pairResult?.depositId || null;
          } else {
            // Deposit-only path — no be_appointments doc, no pair atomicity.
            // createDeposit returns the doc id directly.
            // Phase 24.0-vicies (2026-05-06) — when admin selected visit-purpose
            // chips (นัดมาเพื่อ) but NOT มีการนัดหมาย, attach a minimal embedded
            // appointment object so DepositPanel "มัดจำสำหรับ" column shows
            // the purpose. type='deposit-only' distinguishes from
            // 'deposit-booking' on the calendar; BackendDashboard จองมัดจำ
            // sub-tab queries be_appointments (NOT be_deposits), so this
            // marker doesn't surface a phantom appointment in the grid.
            const depositOnlyPayload = {
              ...baseDepositData,
              hasAppointment: false,
              appointment: visitPurposeText ? {
                type: 'deposit-only',
                purpose: visitPurposeText,
                appointmentTo: visitPurposeText, // mirror for legacy readers
              } : null,
            };
            // Phase 24.0-vicies-septies (2026-05-06) — createDeposit returns
            // `{ depositId, success }` (an OBJECT), not the bare id string.
            // Pre-fix stored the object literal on opd_sessions.linkedDepositId
            // → handleSaveDepositData cascade later passed the object to
            // createAppointmentForExistingDeposit which String()-coerced to
            // "[object Object]" and threw "deposit [object Object] not found".
            // User report: "เพิ่มนัดหมายไม่สำเร็จ: createAppointmentForExistingDeposit:
            // deposit [object Object] not found".
            const createdDeposit = await createDeposit(depositOnlyPayload);
            depositId = createdDeposit?.depositId || null;
          }
          // Stamp cross-link on the kiosk session for traceability
          if (depositId) {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', sessionId), {
              linkedDepositId: depositId,
              linkedAppointmentId: pairResult?.appointmentId || null,
              depositSyncStatus: 'done',
            });
            // Phase 24.0-vicies-novies (2026-05-07) — for the deposit-only
            // path (no pair-helper write), stamp linkedOpdSessionId on the
            // be_deposits doc so attachCustomerToOpdSessionLinks finds it
            // at OPD-save time. The pair-helper path already stamps both
            // halves via createDepositBookingPair(linkedOpdSessionId:sessionId).
            if (!pairResult) {
              try {
                await updateDoc(
                  doc(db, 'artifacts', appId, 'public', 'data', 'be_deposits', depositId),
                  {
                    linkedOpdSessionId: sessionId,
                    updatedAt: new Date().toISOString(),
                  },
                );
              } catch (linkErr) {
                console.warn('[confirmCreateDeposit] linkedOpdSessionId stamp failed (best-effort):', linkErr);
              }
            }
          }
        }
      } catch (pairErr) {
        pairBookingCollision = pairErr?.code === 'AP1_COLLISION';
        console.warn('[confirmCreateDeposit] pair-helper write failed (kiosk session still saved):', pairErr);
        // Stamp failure for diagnostics; admin can retry later via backend
        try {
          await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', sessionId), {
            depositSyncStatus: 'failed',
            depositSyncError: pairErr?.message || String(pairErr),
          });
        } catch { /* ignore */ }
      }

      setSelectedQR(sessionId);
      // appointment-loop R1 — don't claim success when the appointment collided
      // (double-booking guard fired). The kiosk session + deposit-sync-failed
      // stamp are kept; admin re-picks a time + retries from the queue.
      showToast(pairBookingCollision
        ? 'ช่วงเวลานี้มีนัดของแพทย์ท่านนี้อยู่แล้ว — สร้างคิวลูกค้าไว้แล้ว แต่ยังไม่ได้จองนัด กรุณาแก้เวลาแล้วลองใหม่'
        : 'สร้างคิวลูกค้าจองมัดจำสำเร็จ!', pairBookingCollision ? 6000 : undefined);
      setAdminMode('deposit', true);
    } catch (e) { console.error('createDeposit:', e); }
    setIsGenerating(false);
    // reset form
    setDepositFormData({
      sessionName: '', paymentChannel: '', paymentAmount: '', depositDate: todayISO(),
      depositTime: nowTime(), salesperson: '', hasAppointment: false,
      appointmentDate: '', appointmentStartTime: '', appointmentEndTime: '',
      consultant: '', doctor: '', assistant: '', room: '', appointmentChannel: '', visitPurpose: [],
      visitPurposeOther: '',
      customerNameTemp: '', customerPhoneTemp: '',
    });
  };

  // ── No-deposit: create session + ProClinic appointment ──
  const confirmCreateNoDeposit = async () => {
    if (!user) return;
    setIsGenerating(true);
    setShowNoDepositForm(false);

    const shortId = genShortId(32); // WS1 C1: 128-bit id-as-secret (was 6=24-bit → guessable). opd_session doc-id IS the patient-link secret; split get/list rule keeps anon from enumerating.
    const sessionId = `ND-${shortId}`;

    const appointmentData = {
      appointmentDate: noDepositFormData.appointmentDate,
      appointmentStartTime: noDepositFormData.appointmentStartTime || null,
      appointmentEndTime: noDepositFormData.appointmentEndTime || null,
      advisor: noDepositFormData.advisor || null,
      doctor: noDepositFormData.doctor || null,
      assistant: noDepositFormData.assistant || null,
      room: noDepositFormData.room || null,
      source: noDepositFormData.source || null,
      visitPurpose: noDepositFormData.visitPurpose || [],
      // Phase 24.0-undecies — preserve "อื่นๆ" detail on the kiosk session.
      visitPurposeOther: noDepositFormData.visitPurposeOther || '',
      // Phase 24.0-terdecies — preserve booking-time name + phone.
      customerNameTemp: noDepositFormData.customerNameTemp?.trim() || '',
      customerPhoneTemp: noDepositFormData.customerPhoneTemp?.trim() || '',
    };

    const sessionDoc = {
      status: 'pending',
      createdAt: serverTimestamp(),
      branchId: selectedBranchId || '', // Phase 20.0 follow-up
      patientData: null,
      isPermanent: true,
      formType: 'intake',
      sessionName: noDepositFormData.sessionName?.trim() || 'ลูกค้าจอง',
      appointmentData,
      appointmentSyncStatus: 'pending',
    };

    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', sessionId), sessionDoc);
      setSelectedQR(sessionId);
      setAdminMode('noDeposit', true);

      // Phase 20.0 Task 3 — create be_appointments doc instead of ProClinic.
      // appointmentProClinicId field name preserved for backward compat with
      // existing opd_sessions docs; semantics now = be_appointments doc id
      // (BA-{ts} format).
      // Phase 24.0-undecies — interpolate "อื่นๆ: <detail>" via helper.
      const visitPurposeText = buildVisitPurposeText(
        noDepositFormData.visitPurpose,
        noDepositFormData.visitPurposeOther,
      );
      const doctorRecord = practitioners.find(p => String(p.id) === String(noDepositFormData.doctor || ''));
      const advisorRecord = practitioners.find(p => String(p.id) === String(noDepositFormData.advisor || ''));
      try {
        const apptResult = await createBackendAppointment({
          date: noDepositFormData.appointmentDate,
          startTime: noDepositFormData.appointmentStartTime,
          endTime: noDepositFormData.appointmentEndTime,
          doctorId: noDepositFormData.doctor ? String(noDepositFormData.doctor) : '',
          doctorName: doctorRecord?.name || '',
          advisorId: noDepositFormData.advisor ? String(noDepositFormData.advisor) : '',
          advisorName: advisorRecord?.name || '',
          assistantId: noDepositFormData.assistant ? String(noDepositFormData.assistant) : '',
          // Phase 22.0b — also pass assistantIds[] (canonical Phase 19.0+ field)
          // so the backend listener picks up the assistant correctly. backendClient
          // accepts both shapes for backward compat.
          assistantIds: noDepositFormData.assistant ? [String(noDepositFormData.assistant)] : [],
          roomId: noDepositFormData.room ? String(noDepositFormData.room) : '',
          source: noDepositFormData.source || 'walk-in',
          appointmentTo: visitPurposeText,
          note: noDepositFormData.sessionName?.trim() || '',
          appointmentType: 'no-deposit-booking', // Phase 19.0 explicit
          // No customerId yet — kiosk session created before patient form fill.
          customerId: '',
          // Phase 24.0-terdecies — prefer explicit booking-time name over
          // generic ชื่อคิว/Note when both filled.
          customerName: noDepositFormData.customerNameTemp?.trim()
            || noDepositFormData.sessionName?.trim()
            || '',
          customerNameTemp: noDepositFormData.customerNameTemp?.trim() || '',
          customerPhoneTemp: noDepositFormData.customerPhoneTemp?.trim() || '',
          // Phase 22.0b — explicit branchId stamp (the auto-resolver in
          // backendClient._resolveBranchIdForWrite would also fall through
          // to selectedBranchId, but explicit > implicit per Rule M).
          branchId: selectedBranchId || '',
          // Phase 24.0-vicies-novies (2026-05-07) — stamp the kiosk sessionId
          // on the be_appointments doc so attachCustomerToOpdSessionLinks
          // finds the no-deposit booking at OPD-save time and cascades the
          // new customerId. Phone-mismatch resilient by design (match key
          // is sessionId, not phone).
          linkedOpdSessionId: sessionId,
        });
        if (apptResult?.appointmentId) {
          await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', sessionId), {
            appointmentProClinicId: apptResult.appointmentId,
            // Phase 24.0-vicies-novies — symmetric stamp on session doc so
            // handleOpdClick can resolve linkedAppointmentId for direct lookup
            // (mirrors confirmCreateDeposit kiosk pattern).
            linkedAppointmentId: apptResult.appointmentId,
            appointmentSyncStatus: 'done',
            appointmentSyncError: null, // clear stale error from previous failed attempts
          });
          showToast('สร้างคิวจองไม่มัดจำ + นัดหมายสำเร็จ!');
        } else {
          // Phase 29.23-bis4 (2026-05-14) — diagnostic logging. createBackendAppointment
          // contract returns {appointmentId, success:true} on success; this branch
          // should be unreachable, but lock evidence in case the contract drifts.
          console.error('[confirmCreateNoDeposit] createBackendAppointment returned no appointmentId. apptResult=', apptResult, 'payload=', { date: noDepositFormData.appointmentDate, startTime: noDepositFormData.appointmentStartTime, endTime: noDepositFormData.appointmentEndTime, doctorId: noDepositFormData.doctor, branchId: selectedBranchId });
          await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', sessionId), {
            appointmentSyncStatus: 'failed',
            appointmentSyncError: 'createBackendAppointment returned no appointmentId (check DevTools console)',
          });
          showToast('สร้างคิวสำเร็จ แต่สร้างนัดหมายไม่สำเร็จ');
        }
      } catch (apptErr) {
        // Phase 29.23-bis4 (2026-05-14) — surface the actual error. Pre-bis4
        // the catch swallowed everything silently and only stamped a sanitized
        // message in Firestore — admin saw "sync ล้มเหลว" with no diagnostic
        // path. User report 2026-05-14: "sync ล้มเหลวทุกครั้งที่กดสร้างนัด
        // ประเภทจองไม่มัดจำ". Without console output we couldn't identify the
        // exact failure path (AP1_COLLISION? Firestore permission?
        // runTransaction abort? etc.). console.error preserves the full
        // error object including stack trace + custom fields like
        // err.code / err.collision / err.slotKey.
        console.error('[confirmCreateNoDeposit] appointment sync failed:', apptErr, 'payload=', {
          date: noDepositFormData.appointmentDate,
          startTime: noDepositFormData.appointmentStartTime,
          endTime: noDepositFormData.appointmentEndTime,
          doctorId: noDepositFormData.doctor,
          branchId: selectedBranchId,
          sessionId,
        });
        const friendlyError = apptErr?.code === 'AP1_COLLISION'
          ? `ช่วงเวลานี้มีนัดอยู่แล้ว: ${apptErr.collision?.startTime || ''}-${apptErr.collision?.endTime || ''}`
          : (apptErr?.message || String(apptErr));
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', sessionId), {
          appointmentSyncStatus: 'failed',
          appointmentSyncError: friendlyError,
          // Phase 29.23-bis4 — also stamp error code + stack for backend audit
          appointmentSyncErrorCode: apptErr?.code || null,
          appointmentSyncErrorStack: typeof apptErr?.stack === 'string' ? apptErr.stack.slice(0, 1000) : null,
        });
        if (apptErr?.code === 'AP1_COLLISION') {
          // Phase 29.23-bis5 (2026-05-14) — surface the collision time in the
          // toast so admin can fix immediately without inspecting Firestore.
          // Root-cause-confirmed via Rule R admin-SDK diag 2026-05-14: every
          // user-reported "sync ล้มเหลว" in the recent batch was a
          // legitimate double-booking guard firing for an existing
          // confirmed appointment on the same doctor + overlapping range.
          const collisionRange = apptErr?.collision
            ? `${apptErr.collision.startTime || '?'}-${apptErr.collision.endTime || '?'}`
            : '';
          showToast(`❌ จองไม่สำเร็จ: หมอมีนัดอยู่แล้วช่วง ${collisionRange} กรุณาเลือกเวลาอื่น`);
        } else {
          showToast(`สร้างคิวสำเร็จ แต่สร้างนัดหมายไม่สำเร็จ: ${friendlyError}`);
        }
      }
    } catch (e) {
      console.error('confirmCreateNoDeposit:', e);
      showToast('เกิดข้อผิดพลาดในการสร้างคิว');
    }
    setIsGenerating(false);
    setNoDepositFormData({
      sessionName: '', appointmentDate: todayISO(),
      appointmentStartTime: '', appointmentEndTime: '',
      advisor: '', doctor: '', assistant: '', room: '', source: '',
      visitPurpose: [],
      visitPurposeOther: '',
      customerNameTemp: '', customerPhoneTemp: '',
    });
  };

  // ── No-deposit: update appointment in ProClinic ──
  const confirmUpdateAppointment = async () => {
    if (!user || !editingAppointment) return;
    setIsGenerating(true);

    const session = noDepositSessions.find(s => s.id === editingAppointment);
    if (!session) { setIsGenerating(false); return; }

    const appointmentData = {
      appointmentDate: noDepositFormData.appointmentDate,
      appointmentStartTime: noDepositFormData.appointmentStartTime || null,
      appointmentEndTime: noDepositFormData.appointmentEndTime || null,
      advisor: noDepositFormData.advisor || null,
      doctor: noDepositFormData.doctor || null,
      assistant: noDepositFormData.assistant || null,
      room: noDepositFormData.room || null,
      source: noDepositFormData.source || null,
      visitPurpose: noDepositFormData.visitPurpose || [],
      // Phase 24.0-undecies — preserve "อื่นๆ" detail on the kiosk session.
      visitPurposeOther: noDepositFormData.visitPurposeOther || '',
      // Phase 24.0-terdecies — preserve booking-time name + phone.
      customerNameTemp: noDepositFormData.customerNameTemp?.trim() || '',
      customerPhoneTemp: noDepositFormData.customerPhoneTemp?.trim() || '',
    };

    // Phase 20.0 Task 3 — be_appointments shape (no ProClinic field names).
    // Phase 24.0-undecies — interpolate "อื่นๆ: <detail>" via helper.
    const visitPurposeText = buildVisitPurposeText(
      noDepositFormData.visitPurpose,
      noDepositFormData.visitPurposeOther,
    );
    const doctorRecord = practitioners.find(p => String(p.id) === String(noDepositFormData.doctor || ''));
    const advisorRecord = practitioners.find(p => String(p.id) === String(noDepositFormData.advisor || ''));
    const apptPayload = {
      date: noDepositFormData.appointmentDate,
      startTime: noDepositFormData.appointmentStartTime,
      endTime: noDepositFormData.appointmentEndTime,
      doctorId: noDepositFormData.doctor ? String(noDepositFormData.doctor) : '',
      doctorName: doctorRecord?.name || '',
      advisorId: noDepositFormData.advisor ? String(noDepositFormData.advisor) : '',
      advisorName: advisorRecord?.name || '',
      assistantId: noDepositFormData.assistant ? String(noDepositFormData.assistant) : '',
      roomId: noDepositFormData.room ? String(noDepositFormData.room) : '',
      source: noDepositFormData.source || 'walk-in',
      appointmentTo: visitPurposeText,
      note: noDepositFormData.sessionName?.trim() || '',
      appointmentType: 'no-deposit-booking',
      customerId: session.customerId ? String(session.customerId) : '',
      // Phase 24.0-terdecies — prefer explicit booking-time name + carry the
      // temp fields through update so admin edits to name/phone propagate.
      customerName: noDepositFormData.customerNameTemp?.trim()
        || noDepositFormData.sessionName?.trim()
        || '',
      customerNameTemp: noDepositFormData.customerNameTemp?.trim() || '',
      customerPhoneTemp: noDepositFormData.customerPhoneTemp?.trim() || '',
      // Phase 29.23-bis5 (2026-05-14) — explicit branchId stamp. PRE-bis5 BUG:
      // this payload was missing branchId entirely; the create-retry path
      // at line ~3076 (when session.appointmentProClinicId is empty after
      // a prior failed create) fed it to createBackendAppointment WITHOUT
      // branchId → be_appointments doc was written without branchId →
      // ORPHAN invisible in branch-scoped UI but still triggering
      // AP1_COLLISION via allBranches:true scan. Root cause confirmed via
      // Rule R admin-SDK probe 2026-05-14 — BA-1778770705076 was such an
      // orphan, deleted via cleanup-orphan-empty-branchid-appointments.mjs.
      // Defense in depth: createBackendAppointment now also auto-stamps via
      // _resolveBranchIdForWrite, but explicit here keeps the payload
      // self-describing + makes the edit-cascade syncAppointmentToLinkedDeposit
      // path (line ~3043+) carry branchId too.
      branchId: selectedBranchId || session.branchId || '',
    };

    try {
      // Update Firestore first
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', editingAppointment), {
        appointmentData,
        sessionName: noDepositFormData.sessionName?.trim() || session.sessionName,
      });

      if (session.appointmentProClinicId) {
        // Update existing be_appointments doc (field name preserved for
        // backward compat — semantics now = be_appointments id).
        try {
          await updateBackendAppointment(session.appointmentProClinicId, apptPayload);
          showToast('อัพเดทนัดหมายสำเร็จ!');
        } catch (apptErr) {
          if (apptErr?.code === 'AP1_COLLISION') {
            showToast('ช่วงเวลานี้มีนัดอยู่แล้ว');
          } else {
            showToast('บันทึกใน app แล้ว แต่อัพเดทนัดหมายไม่สำเร็จ: ' + (apptErr?.message || String(apptErr)));
          }
        }
        // Phase 24.0-vicies (2026-05-06) — when admin edits name/phone (or
        // any appt metadata) on a noDeposit session that ALSO has a linked
        // deposit (rare but possible — legacy data or future cross-linked
        // sessions), cascade the changes to the linked be_deposits doc so
        // Finance.มัดจำ row reflects the edits. Best-effort try/catch.
        // User report: "ตรงปุ่มแก้ไขในหน้าจองไม่มัดจำ ทำให้แก้ไขชื่อและ
        // เบอร์โทรลูกค้าได้ด้วย และเมื่อแก้ในนี้ก็จะไปแก้ตรงหน้าการเงิน
        // และหน้านัดหมายด้วย".
        try {
          const linkedDepositId = session.linkedDepositId
            || session.depositProClinicId
            || '';
          if (linkedDepositId) {
            const mod = await import('../lib/appointmentDepositBatch.js');
            // (a) Customer-temp sync (name + phone) — fires on every edit.
            if (typeof mod.syncCustomerTempToLinkedDeposit === 'function') {
              await mod.syncCustomerTempToLinkedDeposit(linkedDepositId, {
                customerName: apptPayload.customerName,
                customerNameTemp: apptPayload.customerNameTemp,
                customerPhoneTemp: apptPayload.customerPhoneTemp,
              });
            }
            // (b) Appointment-meta sync — purpose / date / doctor / room /
            // etc. so Finance "มัดจำสำหรับ" column reflects the latest.
            if (typeof mod.syncAppointmentToLinkedDeposit === 'function') {
              await mod.syncAppointmentToLinkedDeposit(linkedDepositId, {
                date: apptPayload.date,
                startTime: apptPayload.startTime,
                endTime: apptPayload.endTime,
                doctorId: apptPayload.doctorId,
                doctorName: apptPayload.doctorName,
                advisorId: apptPayload.advisorId,
                advisorName: apptPayload.advisorName,
                roomId: apptPayload.roomId,
                channel: apptPayload.source,
                purpose: apptPayload.appointmentTo,
                appointmentTo: apptPayload.appointmentTo,
              });
            }
          }
        } catch (cascadeErr) {
          console.warn('[confirmUpdateAppointment] linked-deposit cascade failed (best-effort):', cascadeErr);
        }
      } else {
        // No appointment id yet (previous create failed) → retry creating
        try {
          const apptResult = await createBackendAppointment(apptPayload);
          if (apptResult?.appointmentId) {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', editingAppointment), {
              appointmentProClinicId: apptResult.appointmentId,
              appointmentSyncStatus: 'done',
              appointmentSyncError: null,
            });
            showToast('สร้างนัดหมายสำเร็จ!');
          } else {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', editingAppointment), {
              appointmentSyncStatus: 'failed',
              appointmentSyncError: 'No appointmentId returned',
            });
            showToast('บันทึกใน app แล้ว แต่สร้างนัดหมายไม่สำเร็จ');
          }
        } catch (apptErr) {
          await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', editingAppointment), {
            appointmentSyncStatus: 'failed',
            appointmentSyncError: apptErr?.code === 'AP1_COLLISION'
              ? `ช่วงเวลานี้มีนัดอยู่แล้ว: ${apptErr.collision?.startTime || ''}-${apptErr.collision?.endTime || ''}`
              : (apptErr?.message || String(apptErr)),
          });
          showToast('บันทึกใน app แล้ว แต่สร้างนัดหมายไม่สำเร็จ');
        }
      }
    } catch (e) {
      console.error('confirmUpdateAppointment:', e);
      showToast('เกิดข้อผิดพลาด');
    }
    setIsGenerating(false);
    setEditingAppointment(null);
    setShowNoDepositForm(false);
  };

  const openNamePrompt = (config) => {
    setPendingConfig(config);
    setSessionNameInput('');
    setShowSessionModal(false);
    setShowNamePrompt(true);
  };

  const confirmCreateSession = async () => {
    if (!user || !pendingConfig) return;
    setIsGenerating(true);
    setShowNamePrompt(false); 
    
    const { isPermanent, formType, customTemplate } = pendingConfig;
    const shortId = genShortId(32); // WS1 C1: 128-bit id-as-secret (was 6=24-bit → guessable). opd_session doc-id IS the patient-link secret; split get/list rule keeps anon from enumerating.
    
    const namePrefix = (cs.clinicName || 'LC').replace(/[^A-Za-z0-9]/g, '').substring(0, 3).toUpperCase() || 'LC';
    let prefix = `${namePrefix}-`;
    if (formType === 'followup_ed') prefix = 'FW-ED-';
    else if (formType === 'followup_adam') prefix = 'FW-AD-';
    else if (formType === 'followup_mrs') prefix = 'FW-MR-';
    else if (formType === 'custom') prefix = 'CST-';
    else if (isPermanent) prefix = 'PRM-';
    
    const sessionId = `${prefix}${shortId}`;
    
    const sessionDoc = {
      status: 'pending',
      createdAt: serverTimestamp(),
      branchId: selectedBranchId || '', // Phase 20.0 follow-up
      patientData: null,
      isPermanent: isPermanent,
      formType: formType,
      sessionName: sessionNameInput.trim() || 'ไม่ระบุชื่อ'
    };

    if (formType === 'custom' && customTemplate) {
      sessionDoc.customTemplate = customTemplate;
    }

    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', sessionId), sessionDoc);
      setSelectedQR(sessionId);
    } catch (error) {
      alert("Error: ไม่สามารถสร้างคิวได้");
    } finally {
      setIsGenerating(false);
      setPendingConfig(null);
      setAdminMode('dashboard', true);
    }
  };

  const deleteSession = async (sessionId) => {
    setSessionToDelete(null);
    if (selectedQR === sessionId) setSelectedQR(null);
    if (viewingSession && viewingSession.id === sessionId) setViewingSession(null);
    const session = sessions.find(s => s.id === sessionId) || noDepositSessions.find(s => s.id === sessionId) || depositSessions.find(s => s.id === sessionId);
    try {
      if (session?.patientData) {
        // มีข้อมูลกรอกแล้ว → archive เก็บไว้ในประวัติ
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', sessionId), {
          isArchived: true, archivedAt: serverTimestamp()
        });
        // V64-fix2 (Issue 9): if the session is linked to an appointment
        // (came from จองมัดจำ / จองไม่มัดจำ flows), auto-flip that appointment
        // from 'pending' (รอยืนยัน) → 'confirmed' (ยืนยันแล้ว) at queue-arrival.
        // Non-blocking: if the appt update fails (already-cancelled, deleted,
        // etc.), the session-archive still succeeds.
        const linkedApptId = session.appointmentProClinicId || session.linkedAppointmentId || '';
        if (linkedApptId) {
          try {
            await updateBackendAppointment(linkedApptId, { status: 'confirmed' });
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('queue-arrival auto-confirm failed (non-blocking):', e?.message || e);
          }
        }
      } else if (session?.linkedAppointmentId || session?.linkedDepositId) {
        // V116 (2026-05-23) — linked to a real booking (deposit OR appointment)
        // → PRESERVE session doc so the customer's link still works. Only hide
        // from queue listeners. URL is alive, customer can come back + fill.
        // If customer fills later (patientData becomes truthy), queue filter
        // auto-restores via the patientData override at line ~2298. User
        // directive (Q1 verbatim): "ห้ามลบ link ยกเว้นว่าจะลบนัดนั้นทิ้งไป
        // ทั้งนัดเลย อันนี้นลบได้" — link must survive admin queue-delete;
        // only full-appointment-delete may cascade the link.
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', sessionId), {
          isHiddenFromQueue: true,
          hiddenFromQueueAt: serverTimestamp(),
        });
      } else {
        // ไม่มีข้อมูล + ไม่ผูกกับ booking → ลบทิ้งเลย (V116: เหมือนกดผิด, no
        // linked booking → safe to nuke; no customer URL to preserve).
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', sessionId));
      }
    } catch (error) { console.error(error); }
  };

  const handleNoDepositServiceStart = async (session) => {
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', session.id), {
        serviceCompleted: true,
        serviceCompletedAt: serverTimestamp(),
        isPermanent: false,
        createdAt: serverTimestamp(), // reset 2-hour timer
      });
      setAdminMode('appointment'); // ย้ายไปหน้าคิว
    } catch (error) { console.error('handleNoDepositServiceStart error:', error); }
  };

  const handleNoDepositCancel = async (session) => {
    try {
      // Phase 20.0 Task 3 — delete be_appointments doc (field name preserved).
      if (session.appointmentProClinicId) {
        try {
          await deleteBackendAppointment(session.appointmentProClinicId);
        } catch (e) { console.warn('deleteBackendAppointment failed (non-blocking):', e); }
      }

      if (session.patientData) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', session.id), {
          isArchived: true, archivedAt: serverTimestamp()
        });
      } else {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', session.id));
      }
    } catch (error) { console.error('handleNoDepositCancel error:', error); }
  };

  const hardDeleteSession = async (sessionId) => {
    setSessionToHardDelete(null);
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', sessionId));
    } catch (error) { console.error(error); }
  };

  const handleViewSession = async (session) => {
    setViewingSession(session);
    setHasNewUpdate(false);
    // Deposit: ไม่ clear isUnread เมื่อแค่ดู — ต้อง sync (บันทึกการจอง / resync) ถึงจะ clear
    const isDepositKeepUnread = session.formType === 'deposit' && session.isUnread;
    // V121 (2026-05-23) — Q1=B locked: card-flow sessions use 🔴 บันทึก OPD
    // as the read action, NOT modal-open. Pure review (🟢 ดูข้อมูล) does NOT
    // clear isUnread for card-flow sessions. Bubble persists until
    // handleOpdClick stamps opdRecordedAt+brokerStatus:'done' → session
    // drops out of isCardFlowUnread filter via isOpdSessionSaved transition.
    if (session.isUnread && !isDepositKeepUnread && !isCardFlowSession(session)) {
      // ตัดสายวงจร: mark patientData ปัจจุบันว่า "sync แล้ว" ก่อน write isUnread:false
      lastViewedStrRef.current[session.id] = stableStr(session.patientData || {});
      lastAutoSyncedStrRef.current[session.id] = stableStr(session.patientData || {});
      try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', session.id), { isUnread: false });
      } catch(e) { console.error('updateDoc isUnread:', e); }
    }
  };

  const closeViewSession = () => {
    setViewingSession(null);
    setHasNewUpdate(false);
    setEditingDepositData(null);
    if (prevAdminModeRef.current) {
      setAdminMode(prevAdminModeRef.current, true);
      prevAdminModeRef.current = null;
    }
  };

  const getSessionUrl = (sessionId) => `${window.location.origin}${window.location.pathname}?session=${sessionId}`;
  const getQRUrl = (sessionId) => `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(getSessionUrl(sessionId))}&margin=10&color=000000&ecc=Q`;
  const getPatientLinkUrl = (token) => `${window.location.origin}${window.location.pathname}?patient=${token}`;
  const getPatientLinkQRUrl = (token) => `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(getPatientLinkUrl(token))}&margin=10&color=000000&ecc=Q`;

  const handleCopyToClipboard = (text, isUrl = false) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.top = "0"; textArea.style.left = "0"; textArea.style.position = "fixed";
    document.body.appendChild(textArea); textArea.focus(); textArea.select();
    try {
      document.execCommand('copy');
      if (isUrl) { setIsLinkCopied(true); setTimeout(() => setIsLinkCopied(false), 2000); } 
      else { setIsCopied(true); setTimeout(() => setIsCopied(false), 2000); }
    } catch (err) { alert('ไม่สามารถคัดลอกได้อัตโนมัติ'); }
    document.body.removeChild(textArea);
  };

  const handleEditName = (id, currentName) => {
     setEditingNameId(id);
     setEditingNameValue(currentName || '');
  };

  const saveEditedName = async (id) => {
     try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', id), { sessionName: editingNameValue.trim() || 'ไม่ระบุชื่อ' });
        setEditingNameId(null);
     } catch(e) { console.error('saveEditedName:', e); }
  };

  const restoreToQueue = async (sessionId, linkType) => {
    try {
      const ref = doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', sessionId);
      const updates = { isArchived: false, archivedAt: null };
      if (linkType === 'permanent') {
        updates.isPermanent = true;
      } else {
        updates.isPermanent = false;
        updates.createdAt = serverTimestamp();
      }
      await updateDoc(ref, updates);
      setSessionToRestore(null);
      setAdminMode('appointment');
    } catch(e) { console.error('restoreToQueue:', e); }
  };

  // ─── OPD / Broker button ────────────────────────────────────────────────────
  const handleOpdClick = async (session) => {
    const sessionId = session.id;
    const d = session.patientData;

    // ④ (2026-05-26) — booking-flow predicate, HOISTED so BOTH
    // _maybeOpenWalkInModal (early-returns when true) AND _attachLinkedBookings
    // (hard-deletes the session when true) share ONE source — mutual exclusion:
    // a session that opens the walk-in modal (false) is NEVER deleted here; a
    // link/booking session (true) is deleted + never opens the walk-in modal.
    // 6 indicators (V116 added createdFromBackendBooking as the 6th): a session
    // from จองมัดจำ / จองไม่มัดจำ / Backend-pickLater booking flows.
    const isFromBookingFlow = !!(
      session?.linkedAppointmentId ||
      session?.linkedDepositId ||
      session?.appointmentProClinicId ||
      session?.formType === 'deposit' ||
      session?.createdFromBackendBooking ||
      (session?.appointmentData && (
        session.appointmentData.appointmentDate ||
        session.appointmentData.appointmentStartTime
      ))
    );

    // If already recorded successfully → block (ต้องลบจากหน้าประวัติเท่านั้น)
    if (session.opdRecordedAt && session.brokerStatus === 'done') return;

    // Phase 23.0 — Rule C1 shared helper (3rd call site of identical builder).
    const patient = kioskPatientToCanonical(d, {
      formType: session.formType || 'intake',
      customTemplate: session.customTemplate,
      summaryLanguage: 'en',
    });

    // Phase 24.0-vicies-novies (2026-05-07) — auto-attach customer-later
    // deposit + appointment after OPD save succeeds. The unique sessionId is
    // the match key (per user directive: "เวลาเราส่ง link ให้ใครอะ มันสร้าง
    // unique link มาอยู่แล้ว มึงก็เอาไปประกอบกับ มัดจำ กับนัดหมาย"). Phone-
    // mismatch resilient — works even if customer types a different phone in
    // the OPD form. Idempotent (re-clicking บันทึกลง OPD won't double-attach).
    // Phase 25.0c (2026-05-09) — after customer is saved to be_customers, if
    // admin is on the คิวหน้า Clinic tab (adminMode === 'dashboard'), open the
    // Walk-in appointment-create modal with type+channel+customer+branch
    // LOCKED. Per user directive: walk-in customers are recorded in DB FIRST
    // (this OPD-save step), THEN appointment-create modal pops. Other tabs
    // (จองมัดจำ / จองไม่มัดจำ) already have appointments BEFORE OPD-save.
    //
    // patientData is passed THROUGH from session.patientData (the kiosk
    // form's raw shape — already has prefix/firstName/lastName fields).
    // We do NOT rebuild it inline (B.11 V12 anti-regression — see V-entry
    // archive for the inline-camelCase-builder anti-pattern).
    // AppointmentFormModal reads patientData.{prefix,firstName,lastName}
    // for customerName render.
    const _maybeOpenWalkInModal = (customerId, customerHN) => {
      if (adminMode !== 'dashboard') return;
      if (!customerId) return;
      // Phase 29.23-bis (2026-05-14) — initial narrow gate on linkedAppointmentId
      // / linkedDepositId only.
      //
      // Phase 29.23-bis3 (2026-05-14) — gate WIDENED to all booking-origin
      // indicators because user reported modal still appeared after bis1.
      // Cause: linkedAppointmentId may be null on the session even when entry
      // came from no-deposit booking (failure paths at confirmCreateNoDeposit
      // line ~2884 + line ~2891 stamp appointmentSyncStatus='failed' but NOT
      // linkedAppointmentId). Likewise deposit-only bookings (no appointment
      // checkbox) have linkedDepositId set BUT linkedAppointmentId=null.
      //
      // Broader indicators (any truthy → block walk-in modal):
      //   1. linkedAppointmentId — successful no-deposit OR deposit-with-appt
      //   2. linkedDepositId — any deposit booking
      //   3. appointmentProClinicId — legacy field name, mirrors linkedAppointmentId
      //   4. formType === 'deposit' — sessionDoc fingerprint for deposit booking
      //   5. appointmentData.appointmentDate — no-deposit sessions always carry
      //      appointmentData with at least a date filled by the booking form
      //      (line 2790-2792 of confirmCreateNoDeposit — non-empty date is
      //      required by the form UI).
      //
      // User report (verbatim): "หากมาจากหน้า จองมัดจำ หรือ จองไม่มัดจำ ...
      // เมื่อกดบันทึกลง OPD ในหน้า คิวหน้า Clinic จะไม่ต้องขึ้น modal มาให้
      // สร้างนัดหมายอีก".
      // ④ (2026-05-26) — isFromBookingFlow hoisted to handleOpdClick scope
      // (see top). Walk-in modal is for NON-booking (kiosk) sessions only;
      // booking-flow sessions are hard-deleted in _attachLinkedBookings instead
      // (mutual exclusion via the shared predicate). V116 kept createdFromBackendBooking
      // as the 6th indicator in that hoisted definition.
      if (isFromBookingFlow) return;
      setWalkInModal({
        sessionId,
        customerId,
        customerHN: customerHN || '',
        patientData: d || {},
      });
    };

    const _attachLinkedBookings = async (customerId, customerHN) => {
      if (!customerId) return null;
      const fname = patient.firstname || patient.firstName || '';
      const lname = patient.lastname || patient.lastName || '';
      const customerName = `${patient.prefix || ''} ${fname} ${lname}`.trim();
      let r = null;
      try {
        const mod = await import('../lib/appointmentDepositBatch.js');
        if (typeof mod.attachCustomerToOpdSessionLinks === 'function') {
          r = await mod.attachCustomerToOpdSessionLinks(sessionId, {
            customerId,
            customerName,
            customerHN: customerHN || '',
          });
          const total = (r?.depositCount || 0) + (r?.appointmentCount || 0);
          if (total > 0) {
            showToast(`บันทึกลง OPD สำเร็จ + ผูกนัด/มัดจำ ${total} รายการ`);
          }
        }
      } catch (e) {
        // V31 anti-pattern lock — classify error, don't silent-swallow.
        console.warn('[handleOpdClick] attachCustomerToOpdSessionLinks failed (best-effort):', e);
        showToast('บันทึก OPD สำเร็จ — ผูกนัด/มัดจำล้มเหลว กรุณาลองใหม่');
      }
      // ④ (2026-05-26) — link/booking session is redundant once the customer is
      // saved to be_customers (customerId truthy = saved). Hard-delete it to
      // prevent opd_sessions buildup (perf). Gated on isFromBookingFlow so kiosk
      // walk-in sessions (which open the walk-in modal next) are NOT deleted.
      // Best-effort: delete failure → the cron sweep (③) catches it; never roll
      // back the successful save. AV131.
      if (isFromBookingFlow) {
        try {
          await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', sessionId));
        } catch (delErr) {
          console.warn('[handleOpdClick] post-save session delete failed (best-effort; cron will sweep):', delErr);
        }
      }
      return r;
    };

    const hasExistingProClinic = session.brokerProClinicId || session.brokerProClinicHN;
    const jobId = `${sessionId}_${Date.now()}`;
    const brokerJob = hasExistingProClinic
      ? { id: jobId, type: 'LC_UPDATE_PROCLINIC', patient,
          proClinicId: session.brokerProClinicId || null, proClinicHN: session.brokerProClinicHN || null }
      : { id: jobId, type: 'LC_FILL_PROCLINIC', patient };
    setBrokerPending(prev => ({ ...prev, [sessionId]: true }));
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', sessionId), {
        brokerStatus: 'pending', brokerError: null, brokerJob,
      });
    } catch(e) { console.error('broker pending update:', e); }

    try {
      const ref = doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', sessionId);
      // Phase 20.0 Task 5b (2026-05-06) — patient-submit lifecycle on be_*.
      // brokerProClinicId field semantics now = be_customers id (preserved
      // for backward compat with existing opd_sessions docs). Cloned customers
      // already have the same id between proClinicId and be_customers doc-id;
      // new customers from addCustomer get a fresh id (counter-generated).
      try {
        let result;
        if (hasExistingProClinic) {
          // Phase 24.0-septies — graceful update via shared helper.
          // Detects "doc was deleted" (via Phase 24.0 cascade-delete) and
          // signals notFound so the recovery branch below clears the
          // stale brokerProClinicId + re-creates the customer.
          const upd = await tryUpdateExistingCustomer(session.brokerProClinicId, patient);
          result = upd.ok
            ? { success: true, proClinicId: upd.customerId, proClinicHN: upd.hn }
            : { success: false, notFound: true, error: 'ไม่พบลูกค้าใน be_customers (อาจถูกลบไปแล้ว)' };
        } else {
          // Create new be_customers doc
          // Phase 23.0 — explicit branchId stamp ("สร้างรายการที่"). Mirrors
          // CustomerCreatePage pattern. Pre-fix relied on implicit
          // resolveSelectedBranchId() fallback inside addCustomer; explicit
          // pass eliminates BranchContext-lag race condition.
          const created = await addCustomerOrLinkExisting(patient, { strict: false, branchId: selectedBranchId || '' });
          result = { success: true, proClinicId: created.id, proClinicHN: created.hn || '' };
        }
        setBrokerPending(prev => { const n = { ...prev }; delete n[sessionId]; return n; });
        if (result?.success) {
          await updateDoc(ref, {
            opdRecordedAt: new Date().toISOString(),
            brokerStatus: 'done', brokerFilledAt: new Date().toISOString(),
            brokerError: null, brokerJob: null,
            ...(result.proClinicId ? { brokerProClinicId: result.proClinicId } : {}),
            ...(result.proClinicHN ? { brokerProClinicHN: result.proClinicHN } : {}),
          });
          // Phase 24.0-vicies-novies — auto-attach customer-later bookings.
          await _attachLinkedBookings(result.proClinicId, result.proClinicHN);
          // Phase 25.0c (2026-05-09) — Walk-in OPD-save → modal-create flow.
          _maybeOpenWalkInModal(result.proClinicId, result.proClinicHN);
        } else if (result?.notFound) {
          // Phase 24.0-octies — identity-lookup BEFORE create.
          // Try citizen_id / passport / phone match against be_customers.
          // Hit → re-link to existing (idempotent). Miss → fall to addCustomer.
          let relinked = false;
          try {
            const existing = await findExistingCustomerByIdentity(patient);
            if (existing && !existing.ambiguous) {
              await updateDoc(ref, {
                opdRecordedAt: new Date().toISOString(),
                brokerStatus: 'done', brokerFilledAt: new Date().toISOString(),
                brokerError: null, brokerJob: null,
                brokerProClinicId: existing.customer.id,
                brokerProClinicHN: existing.customer.hn_no || '',
              });
              showToast(`พบลูกค้าซ้ำ (${existing.matched.join(', ')}) — ผูกกับ HN ${existing.customer.hn_no || existing.customer.id}`);
              // Also UPDATE the existing customer's data with latest patient form
              // (so kiosk-fresh edits land on the existing record).
              try { await updateCustomerFromForm(existing.customer.id, patient, {}); } catch (e) { console.warn('relink update failed:', e); }
              // Phase 24.0-vicies-novies — relink path also attaches any
              // customer-later bookings tied to this session.
              await _attachLinkedBookings(existing.customer.id, existing.customer.hn_no || '');
              // Phase 25.0c — Walk-in modal on relink success too.
              _maybeOpenWalkInModal(existing.customer.id, existing.customer.hn_no || '');
              relinked = true;
            } else if (existing?.ambiguous) {
              await updateDoc(ref, {
                brokerStatus: 'failed',
                brokerError: 'พบลูกค้าซ้ำหลายคน — เปิด backend เพื่อตรวจสอบ',
                brokerJob: null,
              });
              showToast('พบลูกค้าซ้ำหลายคน — เปิด backend เพื่อตรวจสอบ');
              relinked = true;  // not really, but skip the addCustomer fallback
            }
          } catch (lookupErr) {
            console.warn('identity-lookup failed; falling through to create:', lookupErr);
          }

          if (!relinked) {
            // No existing match → ถอด HN/OPD แล้ว create ใหม่อัตโนมัติ
            await updateDoc(ref, {
              brokerProClinicId: null, brokerProClinicHN: null,
              opdRecordedAt: null, brokerLastAutoSyncAt: null,
              brokerStatus: null, brokerError: null, brokerJob: null,
              patientLinkToken: null, patientLinkEnabled: false,
            });
            showToast('ไม่พบลูกค้าซ้ำในระบบ — กำลังสร้างใหม่...');
            try {
              const created = await addCustomerOrLinkExisting(patient, { strict: false, branchId: selectedBranchId || '' });
              await updateDoc(ref, {
                opdRecordedAt: new Date().toISOString(),
                brokerStatus: 'done', brokerFilledAt: new Date().toISOString(),
                brokerError: null, brokerJob: null,
                ...(created.id ? { brokerProClinicId: created.id } : {}),
                ...(created.hn ? { brokerProClinicHN: created.hn } : {}),
              });
              // Phase 24.0-vicies-novies — recovery-create path also attaches.
              await _attachLinkedBookings(created.id, created.hn || '');
              // Phase 25.0c — Walk-in modal on recovery-create success too.
              _maybeOpenWalkInModal(created.id, created.hn || '');
            } catch (createErr) {
              await updateDoc(ref, { brokerStatus: 'failed', brokerError: createErr?.message || 'สร้างใหม่ไม่สำเร็จ', brokerJob: null });
            }
          }
        }
      } catch (innerErr) {
        setBrokerPending(prev => { const n = { ...prev }; delete n[sessionId]; return n; });
        await updateDoc(ref, { brokerStatus: 'failed', brokerError: innerErr?.message || String(innerErr), brokerJob: null });
      }
    } catch(e) {
      console.error('broker error:', e);
      setBrokerPending(prev => { const n = { ...prev }; delete n[sessionId]; return n; });
      try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', sessionId), {
          brokerStatus: 'failed', brokerError: e.message, brokerJob: null,
        });
      } catch(_) {}
    }
  };

  // ─── V118 (2026-05-23) — Card-level OPD lifecycle handlers ─────────────────
  // These wrap the existing handleOpdClick + provisionOpdLinkForBookingPair so
  // the appointment Card in the Frontend นัดหมาย tab can drive the same OPD
  // lifecycle actions as the คิวหน้าคลินิก / จองมัดจำ / จองไม่มัดจำ tabs.
  // Per-row busy flags allow multiple cards to be in-flight independently.

  // sessionsById — O(1) lookup across all 5 session state arrays. allNotifData
  // (line ~2362) is a local var inside a useEffect, not state. We index each
  // state array directly so the memo bumps on any session list change.
  const sessionsById = useMemo(() => {
    const m = new Map();
    // FIX ① — allLinkedSessions LAST so the fresh unfiltered doc wins over a
    // stale filtered copy; it is a superset, so card-flow sessions now resolve.
    for (const arr of [sessions, archivedSessions, depositSessions, archivedDepositSessions, noDepositSessions, allLinkedSessions]) {
      for (const s of arr || []) {
        if (s?.id) m.set(s.id, s);
      }
    }
    return m;
  }, [sessions, archivedSessions, depositSessions, archivedDepositSessions, noDepositSessions, allLinkedSessions]);

  // resolveLinkedSession — 3-tier source: current-window listener → lazy cache →
  // trigger lazy fetch (returns null this render; re-renders on resolve via tick).
  // ก่อนหน้า sub-tab cards may reference sessions outside the current window.
  const resolveLinkedSession = useCallback((appt) => {
    if (!appt?.linkedOpdSessionId) return null;
    const id = appt.linkedOpdSessionId;
    if (sessionsById.has(id)) return sessionsById.get(id);
    if (lazyFetchedSessionsRef.current.has(id)) return lazyFetchedSessionsRef.current.get(id);
    if (!lazyFetchInFlightRef.current.has(id)) {
      lazyFetchInFlightRef.current.add(id);
      const ref = doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', id);
      getDoc(ref).then(snap => {
        if (snap.exists()) {
          lazyFetchedSessionsRef.current.set(id, { id: snap.id, ...snap.data() });
          setLazyFetchedTick(t => t + 1);
        }
      }).catch(e => {
        console.warn('[V118 resolveLinkedSession] lazy fetch failed:', e);
      }).finally(() => {
        lazyFetchInFlightRef.current.delete(id);
      });
    }
    return null;
    // lazyFetchedTick is needed in deps so React re-runs this memoized fn after
    // a fetch resolves and the underlying ref gets a new entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionsById, lazyFetchedTick, appId]);

  // handleSendOrViewOpdLink — provisions (or returns existing) OPD link + opens
  // SendCustomerLinkModal. Idempotent via provisionOpdLinkForBookingPair (V116).
  // Mirrors AppointmentFormModal:938-984 logic. Per-row busy flag.
  const handleSendOrViewOpdLink = useCallback(async (appt) => {
    if (!appt?.id) return;
    if (opdLinkBusyByApptId[appt.id]) return;
    setOpdLinkBusyByApptId(m => ({ ...m, [appt.id]: true }));
    try {
      const apptId = appt.appointmentId || appt.id;
      const r = await provisionOpdLinkForBookingPair({
        depositId: appt.linkedDepositId || appt.spawnedFromDepositId || '',
        appointmentId: apptId,
        branchId: appt.branchId || selectedBranchId || '',
        formType: 'intake',
        sessionName: appt.customerNameTemp || appt.customerName || 'ลูกค้าจอง',
        // V120 (2026-05-23) — Card has its own 🟢 ดูข้อมูล + 🔴 บันทึก
        // affordances; the Clinic queue tab doesn't need to ALSO receive
        // these card-bound entries. Hide from queue at mint + re-engage.
        hideFromQueue: true,
      });
      setSendLinkModal({
        sessionId: r.sessionId,
        url: r.url,
        sessionName: appt.customerNameTemp || appt.customerName || 'ลูกค้าจอง',
        alreadyProvisioned: !!r.alreadyProvisioned,
      });
    } catch (err) {
      console.warn('[V118 handleSendOrViewOpdLink] provision failed:', err);
      showToast('สร้างลิ้งค์ไม่สำเร็จ: ' + (err?.message || String(err)), 4000);
    } finally {
      setOpdLinkBusyByApptId(m => {
        const next = { ...m };
        delete next[appt.id];
        return next;
      });
    }
  }, [opdLinkBusyByApptId, selectedBranchId]);

  // handleSaveOpdFromCard — delegates to handleOpdClick after resolving the
  // linked session. No-ops if no session OR already saved (mirrors existing
  // handleOpdClick guards). Per-row busy flag prevents double-clicks.
  const handleSaveOpdFromCard = useCallback(async (appt) => {
    if (!appt?.id) return;
    if (opdSaveBusyByApptId[appt.id]) return;
    const session = resolveLinkedSession(appt);
    if (!session) {
      showToast('ยังไม่มีข้อมูล session — กดส่งลิ้งค์ให้ลูกค้ากรอกก่อน', 4000);
      return;
    }
    if (isOpdSessionSaved(session)) {
      showToast('บันทึก OPD แล้ว — ดูข้อมูลผ่านปุ่ม "ดูข้อมูลรับเข้า"', 3000);
      return;
    }
    setOpdSaveBusyByApptId(m => ({ ...m, [appt.id]: true }));
    try {
      await handleOpdClick(session);
    } catch (err) {
      console.warn('[V118 handleSaveOpdFromCard] handleOpdClick failed:', err);
      showToast('บันทึก OPD ไม่สำเร็จ: ' + (err?.message || String(err)), 4000);
    } finally {
      setOpdSaveBusyByApptId(m => {
        const next = { ...m };
        delete next[appt.id];
        return next;
      });
    }
    // handleOpdClick is a function declaration (not stateful); leaving out of
    // deps is intentional — it's referenced via closure for current behavior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opdSaveBusyByApptId, resolveLinkedSession]);

  // ─── Manual Resync ─────────────────────────────────────────────────────────
  // เหมือน handleOpdClick แต่ไม่บล็อกเมื่อ done — ใช้กด sync ซ้ำด้วยตนเอง
  const toggleGlobalPushMuted = async () => {
    const next = !globalPushMuted;
    const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'push_config', 'settings');
    try { await setDoc(settingsRef, { globalPushMuted: next }, { merge: true }); } catch(e) { console.error('toggle push muted:', e); }
  };

  const handleResync = async (session) => {
    const sessionId = session.id;
    const d = session.patientData;
    // Phase 23.0 — translate kiosk camelCase → canonical snake_case via
    // shared helper. Pre-fix the inline builder produced a camelCase blob
    // that addCustomer's normalize/validate chain didn't recognize → root
    // be_customers doc had wrong keys + patientData mirror was empty.
    const patient = kioskPatientToCanonical(d, {
      formType: session.formType || 'intake',
      customTemplate: session.customTemplate,
      summaryLanguage: 'en',
    });

    const hasExistingProClinic = session.brokerProClinicId || session.brokerProClinicHN;
    const jobId = `${sessionId}_${Date.now()}`;
    const brokerJob = hasExistingProClinic
      ? { id: jobId, type: 'LC_UPDATE_PROCLINIC', patient,
          proClinicId: session.brokerProClinicId || null, proClinicHN: session.brokerProClinicHN || null }
      : { id: jobId, type: 'LC_FILL_PROCLINIC', patient };
    setBrokerPending(prev => ({ ...prev, [sessionId]: true }));
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', sessionId), {
        brokerStatus: 'pending', brokerError: null, brokerJob,
      });
    } catch(e) { console.error('resync pending update:', e); }

    try {
      const ref = doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', sessionId);
      // Phase 20.0 Task 5b — be_customers create-or-update.
      let result;
      try {
        if (hasExistingProClinic) {
          // Phase 24.0-septies — graceful update via shared helper.
          // Detects "doc was deleted" (Phase 24.0 cascade-delete) and signals
          // notFound so the existing recovery branch below clears the stale
          // brokerProClinicId. Next sync click goes through addCustomer.
          const upd = await tryUpdateExistingCustomer(session.brokerProClinicId, patient);
          result = upd.ok
            ? { success: true, proClinicId: upd.customerId, proClinicHN: upd.hn }
            : { success: false, notFound: true, error: 'ไม่พบลูกค้าใน be_customers (อาจถูกลบไปแล้ว)' };
        } else {
          // Phase 23.0 — explicit branchId stamp (handleResync create branch).
          const created = await addCustomerOrLinkExisting(patient, { strict: false, branchId: selectedBranchId || '' });
          result = { success: true, proClinicId: created.id, proClinicHN: created.hn || '' };
        }
      } catch (innerErr) {
        const msg = String(innerErr?.code || innerErr?.message || '');
        if (/No document to update|not[-\s]?found/i.test(msg)) {
          result = { success: false, notFound: true, error: 'ไม่พบลูกค้าใน be_customers (อาจถูกลบไปแล้ว)' };
        } else {
          result = { success: false, error: innerErr?.message || String(innerErr) };
        }
      }
      autoSyncInFlightRef.current.delete(sessionId);
      setBrokerPending(prev => { const n = { ...prev }; delete n[sessionId]; return n; });
      if (result?.success) {
        const syncAt = new Date().toISOString();
        setViewingSession(prev => prev?.id === sessionId
          ? { ...prev, brokerStatus: 'done', brokerError: null, brokerLastAutoSyncAt: syncAt } : prev);
        await updateDoc(ref, {
          brokerFilledAt: syncAt, brokerLastAutoSyncAt: syncAt,
          brokerError: null, brokerStatus: 'done', brokerJob: null,
          ...(result.proClinicId ? { brokerProClinicId: result.proClinicId } : {}),
          ...(result.proClinicHN ? { brokerProClinicHN: result.proClinicHN } : {}),
          ...(session.formType === 'deposit' && session.isUnread ? { isUnread: false } : {}),
        });
        if (session.formType === 'deposit') {
          lastViewedStrRef.current[sessionId] = stableStr(d || {});
          lastAutoSyncedStrRef.current[sessionId] = stableStr(d || {});
        }
      } else if (result?.notFound) {
        // Phase 24.0-octies — identity-lookup BEFORE clearing/creating.
        // Try citizen_id / passport / phone match against be_customers.
        // Hit → re-link to existing (idempotent). Miss → clear stale broker
        // fields and let user click sync again to go through addCustomer.
        let relinked = false;
        try {
          const existing = await findExistingCustomerByIdentity(patient);
          if (existing && !existing.ambiguous) {
            const syncAt = new Date().toISOString();
            setViewingSession(prev => prev?.id === sessionId
              ? { ...prev, brokerStatus: 'done', brokerError: null, brokerProClinicId: existing.customer.id, brokerProClinicHN: existing.customer.hn_no || '', brokerLastAutoSyncAt: syncAt } : prev);
            await updateDoc(ref, {
              brokerStatus: 'done', brokerError: null, brokerJob: null,
              brokerProClinicId: existing.customer.id,
              brokerProClinicHN: existing.customer.hn_no || '',
              brokerLastAutoSyncAt: syncAt, brokerFilledAt: syncAt,
            });
            try { await updateCustomerFromForm(existing.customer.id, patient, {}); } catch (e) { console.warn('relink update failed:', e); }
            showToast(`พบลูกค้าซ้ำ (${existing.matched.join(', ')}) — ผูกกับ HN ${existing.customer.hn_no || existing.customer.id} เรียบร้อย`);
            relinked = true;
          } else if (existing?.ambiguous) {
            setViewingSession(prev => prev?.id === sessionId
              ? { ...prev, brokerStatus: 'failed', brokerError: 'พบลูกค้าซ้ำหลายคน — เปิด backend ตรวจสอบ' } : prev);
            await updateDoc(ref, {
              brokerStatus: 'failed', brokerJob: null,
              brokerError: 'พบลูกค้าซ้ำหลายคน — เปิด backend ตรวจสอบ',
            });
            showToast('พบลูกค้าซ้ำหลายคน — เปิด backend เพื่อตรวจสอบ');
            relinked = true;
          }
        } catch (lookupErr) {
          console.warn('identity-lookup failed; falling through to clear+retry:', lookupErr);
        }

        if (!relinked) {
          // No existing match → ถอด HN/OPD ออก, ให้ user กด sync อีกครั้ง
          // (ครั้งหน้าจะไป CREATE branch เพราะ broker fields ว่าง)
          setViewingSession(prev => prev?.id === sessionId
            ? { ...prev, brokerStatus: null, brokerError: null, brokerProClinicId: null, brokerProClinicHN: null, opdRecordedAt: null, brokerLastAutoSyncAt: null, patientLinkToken: null, patientLinkEnabled: false } : prev);
          await updateDoc(ref, {
            brokerStatus: null, brokerError: null, brokerJob: null,
            brokerProClinicId: null, brokerProClinicHN: null,
            opdRecordedAt: null, brokerLastAutoSyncAt: null,
            patientLinkToken: null, patientLinkEnabled: false,
          });
          showToast('ไม่พบลูกค้าซ้ำในระบบ — ล้าง HN เดิม กดซิงค์อีกครั้งเพื่อสร้างใหม่');
        }
      } else {
        setViewingSession(prev => prev?.id === sessionId
          ? { ...prev, brokerStatus: 'failed', brokerError: result?.error || 'ไม่ทราบสาเหตุ' } : prev);
        await updateDoc(ref, { brokerStatus: 'failed', brokerError: result?.error || 'ไม่ทราบสาเหตุ', brokerJob: null });
      }
    } catch(e) {
      console.error('resync error:', e);
      autoSyncInFlightRef.current.delete(sessionId);
      setBrokerPending(prev => { const n = { ...prev }; delete n[sessionId]; return n; });
    }
  };

  // ─── Deposit: Two-Step Manual Sync (OPD + Deposit) ─────────────────────────
  const handleDepositSync = async (session) => {
    const d = session.patientData;
    if (!d) return;
    const sessionId = session.id;
    // Local in-flight dedupe: prevents double-click during active sync
    // Does NOT rely on Firestore `depositSyncStatus === 'pending'` (which can be stuck on crash)
    if (depositSyncingRef.current.has(sessionId)) return;
    depositSyncingRef.current.add(sessionId);
    forceRerender(n => n + 1);
    const ref = doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', sessionId);
    // Phase 23.0 — Rule C1 shared helper (was duplicated builder).
    const patient = kioskPatientToCanonical(d, {
      formType: 'intake',
      customTemplate: null,
      summaryLanguage: 'en',
    });

    try {
      // Step 1: Create/update customer in ProClinic (if not done yet)
      let proClinicId = session.brokerProClinicId;
      let proClinicHN = session.brokerProClinicHN;

      const alreadySynced = !!proClinicId && session.depositSyncStatus === 'done';

      if (!proClinicId) {
        // First time: create customer in ProClinic
        // Fire-and-forget: don't block API call on Firestore write
        updateDoc(ref, { brokerStatus: 'pending' }).catch(() => {});
        showToast('กำลังสร้างลูกค้า...');
        // Phase 20.0 Task 5b — addCustomer (be_*) replaces broker.fillProClinic
        // Phase 23.0 — explicit branchId stamp ("สร้างรายการที่").
        const created = await addCustomerOrLinkExisting(patient, { strict: false, branchId: selectedBranchId || '' });
        if (!created?.id) throw new Error('สร้างลูกค้าไม่สำเร็จ');
        proClinicId = created.id;
        proClinicHN = created.hn || '';
        await updateDoc(ref, {
          brokerStatus: 'done', brokerError: null,
          brokerProClinicId: proClinicId, brokerProClinicHN: proClinicHN,
          opdRecordedAt: serverTimestamp(),
        });
        showToast(`สร้างลูกค้าสำเร็จ HN: ${proClinicHN} — กำลังบันทึกมัดจำ...`);
      } else if (alreadySynced) {
        // Phase 20.0 Task 5b — update existing be_customers doc.
        // Phase 24.0-septies — if the customer doc was deleted via cascade,
        // fall back to addCustomer so deposit sync isn't blocked.
        showToast('กำลังอัพเดทข้อมูลลูกค้า...');
        const upd = await tryUpdateExistingCustomer(proClinicId, patient);
        if (upd.notFound) {
          showToast('ลูกค้าเดิมถูกลบ — สร้างลูกค้าใหม่อัตโนมัติ...');
          const created = await addCustomerOrLinkExisting(patient, { strict: false, branchId: selectedBranchId || '' });
          if (!created?.id) throw new Error('สร้างลูกค้าไม่สำเร็จ');
          proClinicId = created.id;
          proClinicHN = created.hn || '';
          await updateDoc(ref, {
            brokerStatus: 'done', brokerError: null,
            brokerProClinicId: proClinicId, brokerProClinicHN: proClinicHN,
            opdRecordedAt: serverTimestamp(), brokerLastAutoSyncAt: serverTimestamp(),
          });
          showToast(`สร้างลูกค้าสำเร็จ HN: ${proClinicHN} — กำลังอัพเดทมัดจำ...`);
        } else {
          await updateDoc(ref, { brokerLastAutoSyncAt: serverTimestamp() });
          showToast('อัพเดทข้อมูลลูกค้าสำเร็จ — กำลังอัพเดทมัดจำ...');
        }
      } else {
        showToast('กำลังบันทึกมัดจำ...');
      }

      // Step 2: Phase 20.0 Task 5c (2026-05-06) — write be_deposits doc.
      // ProClinic deposit-sync workflow replaced with be_* canonical write.
      // Field mapping: paymentAmount → amount, depositDate → paymentDate,
      // depositTime → paymentTime, salesperson → sellers[0], visitPurpose
      // joined → appointmentTo. customer ids from session.brokerProClinicId/HN.
      await updateDoc(ref, { depositSyncStatus: 'pending' });
      const dep = session.depositData || {};
      const dataForBe = mapDepositPayloadToBe(dep, proClinicId, proClinicHN, patient);

      // Phase 24.0-vicies-novies-bis (2026-05-07) — kiosk customer-later
      // path: confirmCreateDeposit ALREADY created the be_deposits + (if
      // hasAppointment) be_appointments docs at booking time, with
      // linkedOpdSessionId stamped on both. Pre-fix this branch ALWAYS
      // called createDeposit which created a SECOND duplicate doc — user
      // reported "แทนที่จะแก้อันเดิม มันสร้างมัดจำใหม่" + "tab นัดหมาย ก็ไม่
      // ได้แก้ผูกกับลูกค้าใหม่". Now: detect session.linkedDepositId (V12
      // healing for legacy object shape via coerceId) → updateDeposit on
      // existing doc + cascade customer to linked appointment via shared
      // attachCustomerToOpdSessionLinks helper.
      const coerceId = (v) => {
        if (!v) return '';
        if (typeof v === 'string') return v;
        if (typeof v === 'object' && v.depositId) return String(v.depositId);
        return String(v);
      };
      const existingDepositIdForUpdate = coerceId(session.depositProClinicId)
        || coerceId(session.linkedDepositId);

      let depositId;
      let attachResult = null;
      try {
        if (existingDepositIdForUpdate) {
          // Phase 24.0-vicies-novies-bis — update existing deposit (covers
          // both the alreadySynced re-sync path AND the kiosk customer-later
          // first-save path where linkedDepositId was set by
          // confirmCreateDeposit). updateDeposit applies customerId/HN/name
          // from dataForBe atomically.
          await updateDeposit(existingDepositIdForUpdate, dataForBe);
          depositId = existingDepositIdForUpdate;
          // Cascade customer to the LINKED APPOINTMENT (still has customerId='').
          // attachCustomerToOpdSessionLinks queries by linkedOpdSessionId and
          // filters customerId==''. The deposit (just updated above) is now
          // filtered out; the appointment is matched + updated.
          try {
            const mod = await import('../lib/appointmentDepositBatch.js');
            if (typeof mod.attachCustomerToOpdSessionLinks === 'function') {
              attachResult = await mod.attachCustomerToOpdSessionLinks(sessionId, {
                customerId: proClinicId,
                customerName: dataForBe.customerName || '',
                customerHN: proClinicHN || '',
              });
            }
          } catch (attachErr) {
            console.warn('[handleDepositSync] attach cascade failed (best-effort):', attachErr);
          }
        } else {
          // Legacy path — no linkedDepositId on session (pre Phase 24.0-
          // vicies-novies kiosk). Create a fresh be_deposits doc.
          const created = await createDeposit(dataForBe);
          depositId = created?.depositId;
        }
      } catch (depErr) {
        console.error('deposit sync debug:', depErr);
        throw new Error(depErr?.message || 'บันทึกมัดจำไม่สำเร็จ');
      }

      await updateDoc(ref, {
        depositSyncStatus: 'done',
        depositSyncError: null,
        depositSyncAt: serverTimestamp(),
        isUnread: false,
        ...(depositId ? { depositProClinicId: depositId } : {}),
      });
      lastViewedStrRef.current[session.id] = stableStr(d || {});
      lastAutoSyncedStrRef.current[session.id] = stableStr(d || {});
      // Phase 24.0-vicies-novies-bis — surface attach count in toast so admin
      // sees the linked appointment(s) were also auto-attached.
      const attachedExtra = (attachResult?.appointmentCount || 0);
      showToast(
        alreadySynced
          ? 'อัพเดทข้อมูลสำเร็จ!'
          : (attachedExtra > 0
              ? `บันทึกมัดจำสำเร็จ + ผูกนัด ${attachedExtra} รายการ!`
              : 'บันทึกมัดจำสำเร็จ!'),
      );
    } catch (e) {
      console.error('deposit sync error:', e);
      await updateDoc(ref, {
        depositSyncStatus: 'failed',
        depositSyncError: e.message,
      }).catch(console.error);
      showToast(`ผิดพลาด: ${e.message}`);
    } finally {
      depositSyncingRef.current.delete(sessionId);
      forceRerender(n => n + 1);
    }
  };

  const handleDepositCancel = async (session) => {
    const sessionId = session.id;
    const ref = doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', sessionId);
    const proClinicId = session.brokerProClinicId;
    const proClinicHN = session.brokerProClinicHN;

    try {
      await updateDoc(ref, { depositSyncStatus: 'pending' });
      showToast('กำลังยกเลิกการจอง...');

      // Phase 24.0-vicies-bis (2026-05-06) — cascade-delete both be_deposits
      // AND be_appointments when admin cancels a kiosk deposit-booking from
      // the frontend. User directive: "หากลบลูกค้าจองมัดจำจาก Frontend
      // จะลบข้อมูลการมัดจำและข้อมูลการนัดหมาย (หากมี) ใน data ของลูกค้า
      // คนนั้น ในสาขานั้นๆ ของ backend ไปด้วย".
      //
      // Resolve depositId with linkedDepositId fallback so kiosk-fresh
      // deposits (Phase 24.0-quinquiesdecies stamps linkedDepositId, NOT
      // depositProClinicId) reach the cancel path. Use
      // cancelDepositBookingPair (Phase 21.0 helper) which atomically
      // cancels BOTH be_deposits + linked be_appointments via writeBatch
      // — soft-cancel (status='cancelled') preserves audit trail per
      // Rule D continuous-improvement (no hard delete on financial docs).
      // Phase 24.0-vicies-septies (2026-05-06) — coerce legacy
      // {depositId,success} object shape (from pre-fix kiosk createDeposit
      // mis-stamp) → string id. Heals broken records on cancel without
      // migration.
      const _coerceDepId = (v) => (
        !v ? '' :
        typeof v === 'string' ? v :
        typeof v === 'object' && v.depositId ? String(v.depositId) :
        String(v)
      );
      const depIdForCancel = _coerceDepId(session.depositProClinicId)
        || _coerceDepId(session.linkedDepositId)
        || '';
      if (depIdForCancel) {
        try {
          // Phase 24.0-vicies-quinquies (2026-05-06) — switched from
          // cancelDepositBookingPair (soft-cancel) → deleteDepositBookingPair
          // (HARD delete). User: "ในหน้าการเงินไม่ต้องแสดงเป็นยกเลิกแต่ให้
          // ลบหายไปเลย" — Finance row + appointment grid bubble must vanish
          // entirely after kiosk delete (not show as 'cancelled').
          const { deleteDepositBookingPair } = await import('../lib/appointmentDepositBatch.js');
          const result = await deleteDepositBookingPair(depIdForCancel);
          if (result?.pairDeleted) {
            showToast('ลบการจองสำเร็จ — ลบมัดจำ + นัดหมายแล้ว');
          } else {
            showToast('ลบการจองสำเร็จ — ลบมัดจำแล้ว');
          }
        } catch (cancelErr) {
          throw new Error(cancelErr?.message || 'ลบการจองไม่สำเร็จ');
        }
      }

      // Archive the session (move to deposit history) + clear cross-link
      // fields so the session card no longer points at cancelled docs.
      await updateDoc(ref, {
        isArchived: true,
        archivedAt: serverTimestamp(),
        depositSyncStatus: 'cancelled',
        depositSyncError: null,
        brokerStatus: null,
        brokerProClinicId: null,
        brokerProClinicHN: null,
        patientLinkToken: null, patientLinkEnabled: false,
        serviceCompleted: false, serviceCompletedAt: null,
        // Phase 24.0-vicies-bis — forensic trail (preserves the cancelled
        // doc ids so admin can audit which docs were soft-cancelled).
        cancelledDepositId: depIdForCancel || null,
        cancelledAppointmentId: session.linkedAppointmentId || null,
      });
      showToast('ยกเลิกการจองสำเร็จ — ย้ายไปประวัติจองแล้ว');
    } catch (e) {
      console.error('deposit cancel error:', e);
      await updateDoc(ref, {
        depositSyncStatus: 'failed',
        depositSyncError: e.message,
      }).catch(console.error);
      showToast(`ยกเลิกไม่สำเร็จ: ${e.message}`);
    }
  };

  const handleSaveDepositData = async (sessionId, newData) => {
    if (depositSaving) return; // guard double-click: deposit updates round-trip to ProClinic (seconds)
    setDepositSaving(true);
    try {
      const ref = doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', sessionId);
      // Find the session to check if deposit was already synced to ProClinic
      const sess = [...depositSessions, ...archivedDepositSessions].find(s => s.id === sessionId);
      const alreadySynced = sess?.depositSyncStatus === 'done' && sess?.brokerProClinicId;

      // Save locally first
      await updateDoc(ref, { depositData: newData });
      setEditingDepositData(null);

      // Phase 24.0-vicies (2026-05-06) — resolve the be_deposits doc id for
      // cascade BEFORE the alreadySynced branch. Kiosk-fresh deposits stamp
      // `linkedDepositId` (Phase 24.0-quinquiesdecies); patient-form-filled
      // deposits stamp `depositProClinicId`. Either resolves to the same
      // be_deposits doc — pick whichever is set.
      // Phase 24.0-vicies-septies (2026-05-06) — defensive coercion. Pre-fix
      // confirmCreateDeposit stamped the FULL object `{depositId, success}`
      // returned by createDeposit. Existing broken sessions have linkedDepositId
      // as an object → cascade fails with "deposit [object Object] not found".
      // The coerceId helper extracts a string from either shape, healing
      // legacy data on next save without a migration.
      const coerceId = (v) => {
        if (!v) return '';
        if (typeof v === 'string') return v;
        if (typeof v === 'object' && v.depositId) return String(v.depositId);
        return String(v);
      };
      let depIdForCascade = coerceId(sess?.depositProClinicId)
        || coerceId(sess?.linkedDepositId)
        || '';

      // Phase 24.0-vicies — pre-compute the visitPurposeText so both the
      // sync helper + the cascade reference the same value.
      const visitPurposeTextResolved = buildVisitPurposeText(
        newData?.visitPurpose,
        newData?.visitPurposeOther,
      );

      if (alreadySynced) {
        // Phase 20.0 Task 5c — update existing be_deposits doc.
        showToast('กำลังอัพเดทข้อมูลจอง...');
        await updateDoc(ref, { depositSyncStatus: 'pending' });
        const dataForBe = mapDepositPayloadToBe(
          newData, sess.brokerProClinicId, sess.brokerProClinicHN, sess.patientData,
        );
        try {
          if (sess.depositProClinicId) {
            await updateDeposit(sess.depositProClinicId, dataForBe);
          } else {
            // No deposit doc yet → create new
            const created = await createDeposit(dataForBe);
            if (created?.depositId) {
              await updateDoc(ref, { depositProClinicId: created.depositId });
              depIdForCascade = created.depositId;
            }
          }
        } catch (depErr) {
          await updateDoc(ref, { depositSyncStatus: 'failed', depositSyncError: depErr?.message });
          showToast(`บันทึกในระบบแล้ว แต่อัพเดทมัดจำไม่สำเร็จ: ${depErr?.message}`);
          return;
        }
      } else {
        // Phase 24.0-vicies (2026-05-06) — kiosk-fresh deposit (no
        // brokerProClinicId yet because patient form not filled). The
        // alreadySynced gate skipped the cascade entirely pre-fix → admin
        // saw "นัดหมายสำเร็จ" toast but be_appointments was never created.
        // Now we sync the deposit doc directly (purpose / appointment.* +
        // customer name/phone temps) without going through mapDepositPayloadToBe
        // (which requires brokerProClinicId).
        if (depIdForCascade) {
          try {
            const mod = await import('../lib/appointmentDepositBatch.js');
            // (a) Sync embedded appointment metadata (purpose / date / time /
            // doctor / room / etc.) so DepositPanel "มัดจำสำหรับ" column +
            // detail panel render the new values.
            if (typeof mod.syncAppointmentToLinkedDeposit === 'function') {
              const doctorRecord = practitioners.find(p => String(p.id) === String(newData.doctor || ''));
              const advisorRecord = practitioners.find(p => String(p.id) === String(newData.consultant || ''));
              await mod.syncAppointmentToLinkedDeposit(depIdForCascade, {
                type: newData.hasAppointment ? 'deposit-booking' : 'deposit-only',
                date: newData.appointmentDate || '',
                startTime: newData.appointmentStartTime || '',
                endTime: newData.appointmentEndTime || newData.appointmentStartTime || '',
                doctorId: newData.doctor ? String(newData.doctor) : '',
                doctorName: doctorRecord?.name || '',
                advisorId: newData.consultant ? String(newData.consultant) : '',
                advisorName: advisorRecord?.name || '',
                assistantIds: newData.assistant ? [String(newData.assistant)] : [],
                assistantNames: [],
                roomId: newData.room ? String(newData.room) : '',
                roomName: '',
                channel: newData.appointmentChannel || '',
                purpose: visitPurposeTextResolved,
                appointmentTo: visitPurposeTextResolved,
                note: '',
                color: '',
                lineNotify: false,
              });
            }
            // (b) Sync customer-temp (name + phone) so Finance row label
            // reflects edits even before patient form is filled.
            if (typeof mod.syncCustomerTempToLinkedDeposit === 'function') {
              const tempName = newData.customerNameTemp?.trim() || '';
              const tempPhone = newData.customerPhoneTemp?.trim() || '';
              await mod.syncCustomerTempToLinkedDeposit(depIdForCascade, {
                customerName: tempName || sess?.sessionName || 'ลูกค้าจอง',
                customerNameTemp: tempName,
                customerPhoneTemp: tempPhone,
              });
            }
          } catch (syncErr) {
            console.warn('[handleSaveDepositData] kiosk-fresh deposit sync failed (best-effort):', syncErr);
          }
        }
      }

      // Phase 24.0-noniesdecies (2026-05-06) + vicies (2026-05-06 update) +
      // vicies-sexies (2026-05-06) — auto-create be_appointments when admin
      // edits a kiosk deposit to ADD an appointment. Cascade un-gated +
      // visible-error fix: if the cascade silently failed, the user saw
      // 'สำเร็จ' toast but no appt in the calendar. Now: pre-validate +
      // surface error toast on failure + read FRESH session (live listener
      // copy) so newly-stamped linkedDepositId is visible if the kiosk
      // create-then-edit happened in fast succession.
      let apptCreatedSuccessfully = false;
      try {
        const wantsAppt = !!newData?.hasAppointment;
        // Re-fetch fresh sess to pick up linkedDepositId stamped by
        // confirmCreateDeposit even if the listener hasn't echoed yet.
        const freshSess = [...depositSessions, ...archivedDepositSessions]
          .find(s => s.id === sessionId) || sess;
        const hasAppt = !!freshSess?.linkedAppointmentId;
        // Phase 24.0-vicies-septies — coerceId for legacy {depositId,success}
        // object shape on opd_sessions (broken records from pre-fix kiosk creates).
        const freshDepId = coerceId(freshSess?.depositProClinicId)
          || coerceId(freshSess?.linkedDepositId)
          || depIdForCascade
          || '';

        if (wantsAppt && !hasAppt && freshDepId) {
          // Pre-validate appointment fields BEFORE calling helper. Empty
          // date or startTime → helper throws "date + startTime required" →
          // silent catch ate the error. Now we surface it via toast.
          const apptDate = String(newData.appointmentDate || '').trim();
          const apptStart = String(newData.appointmentStartTime || '').trim();
          if (!apptDate || !apptStart) {
            showToast('กรุณากรอกวันนัด + เวลาเริ่มก่อนบันทึก');
            return;
          }
          const { createAppointmentForExistingDeposit } = await import('../lib/appointmentDepositBatch.js');
          if (typeof createAppointmentForExistingDeposit === 'function') {
            const doctorRecord = practitioners.find(p => String(p.id) === String(newData.doctor || ''));
            const advisorRecord = practitioners.find(p => String(p.id) === String(newData.consultant || ''));
            // Phase 24.0-vicies-sexies — branch resolution prefers the
            // session's original branch (where deposit was created) so the
            // appt + deposit stay paired in the same branch view.
            // selectedBranchId fallback covers the rare case where the
            // session has no branchId stamp.
            const apptResult = await createAppointmentForExistingDeposit(freshDepId, {
              date: apptDate,
              startTime: apptStart,
              endTime: newData.appointmentEndTime || apptStart,
              customerId: '',
              customerName: newData.customerNameTemp?.trim() || freshSess?.sessionName || '',
              customerHN: '',
              customerNameTemp: newData.customerNameTemp?.trim() || '',
              customerPhoneTemp: newData.customerPhoneTemp?.trim() || '',
              doctorId: newData.doctor ? String(newData.doctor) : '',
              doctorName: doctorRecord?.name || '',
              advisorId: newData.consultant ? String(newData.consultant) : '',
              advisorName: advisorRecord?.name || '',
              assistantIds: newData.assistant ? [String(newData.assistant)] : [],
              assistantNames: [],
              roomId: newData.room ? String(newData.room) : '',
              roomName: '',
              channel: newData.appointmentChannel || '',
              appointmentTo: visitPurposeTextResolved,
              notes: '',
              appointmentColor: '',
              lineNotify: false,
              branchId: freshSess?.branchId || selectedBranchId || '',
            });
            if (apptResult?.appointmentId) {
              await updateDoc(ref, {
                linkedAppointmentId: apptResult.appointmentId,
                linkedDepositId: freshDepId,
              });
              apptCreatedSuccessfully = true;
            }
          }
        }
      } catch (apptErr) {
        console.warn('[handleSaveDepositData] add-appointment cascade failed:', apptErr);
        // Phase 24.0-vicies-sexies — surface the error to the user instead
        // of silently swallowing. User: "ขึ้นว่าสำเร็จ แต่ในตารางตามวันที่
        // นัดไม่ปรากฎนัดหมายใดๆ" — silent-catch was the root cause.
        showToast(`เพิ่มนัดหมายไม่สำเร็จ: ${apptErr?.message || 'unknown'}`);
        return;
      }

      if (alreadySynced) {
        await updateDoc(ref, {
          depositSyncStatus: 'done', depositSyncError: null, depositSyncAt: serverTimestamp(),
        });
        showToast('อัพเดทข้อมูลจองสำเร็จทั้งในระบบและ ProClinic');
      } else {
        // Not yet synced — reset sync status so user can re-sync
        await updateDoc(ref, { depositSyncStatus: null, depositSyncAt: null });
        showToast('บันทึกข้อมูลจองสำเร็จ');
      }
    } catch (e) {
      showToast(`ผิดพลาด: ${e.message}`);
    } finally {
      setDepositSaving(false);
    }
  };

  // Phase 20.0 final ProClinic strip (2026-05-06) — handleProClinicEdit
  // REMOVED. Replaced by BackendDashboard's customer edit flow.

  // เปิด PatientDashboard ใน new tab (admin view — ไม่มี cooldown)
  const [patientViewUrl, setPatientViewUrl] = useState(null);

  // ปิด iframe + sync viewingSession ให้เป็นล่าสุด — ป้องกัน stale banner
  const closePatientViewIframe = () => {
    setPatientViewUrl(null);
    setHasNewUpdate(false);
    // stamp lastViewedStrRef ให้ตรงกับ session ล่าสุด — ป้องกัน banner false positive หลังปิด
    if (viewingSession) {
      const latest = sessions.find(s => s.id === viewingSession.id) || archivedSessions.find(s => s.id === viewingSession.id);
      if (latest) {
        const latestStr = stableStr(latest.patientData || {});
        lastViewedStrRef.current[latest.id] = latestStr;
        lastAutoSyncedStrRef.current[latest.id] = latestStr;
        setViewingSession(latest);
      }
    }
  };

  // Keep ref updated so message handler always uses latest closure
  const closePatientViewIframeRef = useRef(closePatientViewIframe);
  closePatientViewIframeRef.current = closePatientViewIframe;

  // Listen for close message from iframe
  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === 'close-patient-view') {
        closePatientViewIframeRef.current();
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleOpenPatientView = async (session) => {
    let token = session.patientLinkToken;
    const enabled = session.patientLinkEnabled;
    if (!token || !enabled) {
      token = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');
      try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', session.id), {
          patientLinkToken: token, patientLinkEnabled: true,
        });
      } catch(e) { console.error('handleOpenPatientView:', e); return; }
    }
    // เปิด iframe = admin กำลังดูข้อมูล → clear banner + sync viewingSession (เฉพาะเมื่อ report เปิดอยู่แล้ว)
    setHasNewUpdate(false);
    if (viewingSession) {
      const latest = sessions.find(s => s.id === session.id) || archivedSessions.find(s => s.id === session.id);
      if (latest) {
        setViewingSession(latest);
        lastViewedStrRef.current[session.id] = stableStr(latest.patientData || {});
      }
    }
    setPatientViewUrl(`/?patient=${token}&admin=1`);
  };

  const handleGetCourses = async (session) => {
    const jobId = `courses_${session.id}_${Date.now()}`;
    coursesJobIdRef.current = jobId;
    // ป้องกัน auto-trigger race: ถ้า coursesRefreshRequest มาพร้อมกับการกดปุ่มนี้
    // auto-trigger loop จะเห็น set นี้และไม่ส่ง LC_GET_COURSES ซ้ำ
    autoCoursesRequestedRef.current.add(session.id);
    setCoursesPanel({
      sessionId: session.id,
      patientName: session.sessionName || session.patientData?.firstName || '',
      hn: session.brokerProClinicHN || '',
      status: 'loading', courses: [], expiredCourses: [], error: '',
    });
    try {
      // Phase 20.0 Task 5a (2026-05-06) — read be_customers doc directly.
      const customer = await getCustomer(session.brokerProClinicId);
      const result = customer ? {
        success: true,
        courses: customer.courses || [],
        expiredCourses: customer.expiredCourses || [],
        appointments: customer.appointments || [],
        patientName: [customer.firstname || '', customer.lastname || ''].filter(Boolean).join(' ').trim() || customer.patientData?.fullName || '',
        error: null,
      } : { success: false, courses: [], expiredCourses: [], appointments: [], patientName: '', error: 'ไม่พบลูกค้าใน be_customers' };
      coursesJobIdRef.current = null;
      autoCoursesRequestedRef.current.delete(session.id);
      setCoursesPanel(prev => prev?.sessionId === session.id
        ? { ...prev, status: result?.success ? 'done' : 'error',
            patientName: result?.patientName || prev.patientName,
            courses: result?.courses || [], expiredCourses: result?.expiredCourses || [],
            appointments: result?.appointments || [], error: result?.error || '' }
        : prev
      );
      // Write to Firestore for cross-device delivery
      const ref = doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', session.id);
      await updateDoc(ref, {
        brokerStatus: 'done', brokerError: null, brokerJob: null,
        latestCourses: {
          courses: result?.courses || [], expiredCourses: result?.expiredCourses || [],
          appointments: result?.appointments || [], patientName: result?.patientName || '',
          jobId, fetchedAt: new Date().toISOString(),
          success: !!result?.success, error: result?.error || null,
        },
      });
    } catch(e) {
      console.error('courses error:', e);
      coursesJobIdRef.current = null;
      autoCoursesRequestedRef.current.delete(session.id);
      setCoursesPanel(prev => prev?.sessionId === session.id
        ? { ...prev, status: 'error', error: e.message } : prev);
    }
  };

  // ─── Patient Link handlers ───────────────────────────────────────────────────
  const handleGeneratePatientLink = async (sessionId) => {
    setPatientLinkLoading(true);
    const token = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', sessionId), {
        patientLinkToken: token, patientLinkEnabled: true,
      });
      setSelectedQR(sessionId);
      setQrDisplayMode('patientLink');
    } catch(e) { console.error('generatePatientLink:', e); }
    setPatientLinkLoading(false);
  };

  const handleTogglePatientLink = async (session) => {
    setPatientLinkLoading(true);
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', session.id), {
        patientLinkEnabled: !session.patientLinkEnabled,
      });
    } catch(e) { console.error('togglePatientLink:', e); }
    setPatientLinkLoading(false);
  };

  const handleDeletePatientLink = async (sessionId) => {
    setPatientLinkLoading(true);
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', sessionId), {
        patientLinkToken: null, patientLinkEnabled: false,
      });
      if (qrDisplayMode === 'patientLink') setQrDisplayMode('session');
    } catch(e) { console.error('deletePatientLink:', e); }
    setPatientLinkLoading(false);
  };

  // Phase 20.0 final ProClinic strip (2026-05-06) — handleProClinicDelete
  // REMOVED. Customer cascade-delete now lives in BackendDashboard's
  // CustomerListTab (uses deleteCustomerCascade directly with admin-gated UX).
  // The kiosk session detail no longer offers a delete-customer path —
  // session-only delete (deleteSession / handleDeleteSession) remains.

  const activeSessionInfo = selectedQR ? sessions.find(s => s.id === selectedQR) : null;
  const unreadCount = sessions.filter(s => s.isUnread).length;
  // V121 (2026-05-23) → V124 (2026-05-24 EOD+1) — count of appointments in
  // state D ("ลูกค้ากรอกลิ้งมาแล้ว แต่ยังไม่บันทึก OPD"). Iterates
  // `apptData?.appointments` (already branch-scoped via
  // `listenToAppointmentsByMonth({branchId: selectedBranchId})` at line ~1137)
  // and joins each appt to its linked opd_session via `resolveLinkedSession`
  // (which falls back to lazy-fetch for sessions excluded from the queue
  // state arrays — important because V120 hides card-flow sessions from
  // sessions/depositSessions/noDepositSessions, AND because non-card-flow
  // bookings with no V118 markers ALSO exist in those arrays).
  //
  // Predicate is `isAppointmentPendingOpdSave` (= `resolveCardOpdState === 'D'`),
  // matching the visible "📥 ลูกค้ากรอกแล้ว · รอบันทึก" badge at
  // AppointmentHubRowCard:172. Pre-V124 the predicate was `isCardFlowUnread`
  // which required V118/V120 markers — too narrow, missed all regular
  // จองไม่มัดจำ/มัดจำ bookings. Caught 2026-05-24 EOD+1 by Rule R diag on
  // BA-1779590375471 (regular no-deposit booking, customer filled, no V118
  // markers → predicate returned false → bubble never rendered).
  //
  // Window limitation (existing — not introduced by V124): apptData listener
  // is per-month; appts outside the current `apptMonth` are not in the array.
  // Sub-pill bubbles (today/tomorrow/future30/past30) for the user's CURRENT
  // window appear correctly; cross-month coverage requires a separate listener
  // (deferred — apptMonth change reload covers most admin use cases).
  const cardFlowUnreadCount = useMemo(() => {
    const appts = apptData?.appointments || [];
    let count = 0;
    for (const a of appts) {
      if (!a?.linkedOpdSessionId) continue;
      const linkedSession = resolveLinkedSession(a);
      if (!linkedSession) continue; // state C — not loaded or no patientData yet
      if (isAppointmentPendingOpdSave({ appt: a, linkedSession })) count++;
    }
    return count;
  }, [apptData, resolveLinkedSession]);
  // Phase 20.0 final ProClinic strip (2026-05-06) — PROCLINIC_ORIGIN +
  // getProClinicUrl helpers REMOVED. AdminDashboard no longer links to
  // any ProClinic admin URL.

  // Phase 20.0 final ProClinic strip (2026-05-06) — handleImportSearch /
  // handleImportSelect / checkImportDuplicate / handleImportConfirm
  // REMOVED. The "นำเข้าจาก ProClinic" UI flow was for cloning
  // ProClinic-only customers; with ProClinic gone, admins manage customers
  // via BackendDashboard's CustomerListTab (full CRUD) — no kiosk-side
  // import needed.

  // ── History page computed vars (ต้องอยู่นอก JSX — OXC parser ไม่รองรับ IIFE) ──
  const HISTORY_PAGE_SIZE = 10;
  const historyQ = historySearch.trim().toLowerCase();
  const historyFiltered = historyQ
    ? archivedSessions.filter(s => {
        const d = s.patientData;
        const hn = (s.brokerProClinicHN || '').toLowerCase();
        const fn = (d?.firstName || '').toLowerCase();
        const ln = (d?.lastName  || '').toLowerCase();
        const ph = (d?.phone     || '').replace(/\D/g, '');
        const phQ = historyQ.replace(/\D/g, '');
        return hn.includes(historyQ) || fn.includes(historyQ) || ln.includes(historyQ) || (phQ.length > 0 && ph.includes(phQ));
      })
    : archivedSessions;
  const historyTotalPages = Math.max(1, Math.ceil(historyFiltered.length / HISTORY_PAGE_SIZE));
  const historyCurrentPage = Math.min(historyPage, historyTotalPages);
  const historyPageItems = historyFiltered.slice(
    (historyCurrentPage - 1) * HISTORY_PAGE_SIZE,
    historyCurrentPage * HISTORY_PAGE_SIZE
  );

  // RP1 lift (2026-04-30) — render functions extracted from JSX-IIFE per
  // Vite-OXC ban (CLAUDE.md rules/03-stack.md § Vite OXC). Behaviour identical;
  // only the wrapping syntax changes: inline JSX-IIFE → render helper.
  const renderOpdButton = (session) => {
    const isPending = brokerPending[session.id] || session.brokerStatus === 'pending';
    const isDone    = !isPending && !!session.opdRecordedAt && session.brokerStatus === 'done';
    const isFailed  = !isPending && !isDone && session.brokerStatus === 'failed';
    return (
      <button
        onClick={() => handleOpdClick(session)}
        disabled={isPending || isDone}
        title={isDone ? 'บันทึกลง OPD แล้ว — ลบจากหน้าประวัติเพื่อบันทึกใหม่' : isPending ? 'กำลังบันทึกข้อมูล...' : isFailed ? `ล้มเหลว: ${session.brokerError || ''}` : 'บันทึกลง OPD'}
        className={`p-2 rounded-lg border transition-all ${
          isDone    ? 'bg-[var(--opd-btn-bg)] text-[var(--opd-color)] border-[var(--opd-bd-str)] cursor-not-allowed opacity-80' :
          isPending ? 'bg-orange-950/20 text-orange-400 border-orange-700/50 animate-pulse' :
          isFailed  ? 'bg-red-950/20 text-red-400 border-red-700/50' :
          'bg-[var(--bg-card)] text-[var(--tx-muted)] border-dashed border-[var(--bd)] hover:border-[var(--opd-bd-str)] hover:text-[var(--opd-color)]'
        }`}
      ><ClipboardCheck size={15}/></button>
    );
  };

  // Viewing-session result modal (huge — full patient OPD record + assessments
  // + deposit + clinical summary + treatment timeline).
  const renderViewingSessionModal = () => {
    const d = viewingSession.patientData || {};
    const formType = viewingSession.formType || 'intake';
    const isFollowUp = formType.startsWith('followup_');
    const isCustom = formType === 'custom';

    const reasons = getReasons(d);
    const goals = getHrtGoals(d);

    const isPerf = (!isFollowUp && reasons.includes('สมรรถภาพทางเพศ')) || formType === 'followup_ed';
    const isHrt = (!isFollowUp && reasons.includes('เสริมฮอร์โมน')) || formType === 'followup_adam' || formType === 'followup_mrs';
    const showAdam = (!isFollowUp && (isPerf || goals.includes('อาการฮอร์โมนตก/วัยทอง (ผู้ชาย)'))) || formType === 'followup_adam';
    const showMrs = (!isFollowUp && goals.includes('อาการฮอร์โมนตก/วัยทอง (ผู้หญิง)')) || formType === 'followup_mrs';

    const clinicalSummaryText = generateClinicalSummary(d, formType, viewingSession.customTemplate, summaryLang);

    return (
      <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center p-2 md:p-4 z-50">
        <div className="bg-[var(--bg-elevated)] rounded-xl shadow-2xl border border-[var(--bd)] w-full max-w-5xl max-h-[95vh] flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden relative">

          {hasNewUpdate && (
            <div className="bg-blue-600 text-white px-4 sm:px-6 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0 shadow-lg relative z-20">
              <div className="flex items-center gap-2">
                <AlertCircle size={18} className="animate-pulse" />
                <span className="text-xs sm:text-sm font-bold tracking-wide">⚠️ มีข้อมูลอัปเดตใหม่ขณะที่คุณกำลังดูหน้านี้!</span>
              </div>
              <button onClick={() => {
                const latest = sessions.find(s => s.id === viewingSession.id);
                setHasNewUpdate(false);
                if (latest) {
                  setViewingSession(latest);
                  if (latest.isUnread) {
                    lastViewedStrRef.current[latest.id] = stableStr(latest.patientData || {});
                    lastAutoSyncedStrRef.current[latest.id] = stableStr(latest.patientData || {});
                    updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', latest.id), { isUnread: false }).catch(console.error);
                  }
                }
              }} className="bg-white text-blue-700 px-4 py-1.5 rounded-lg text-xs sm:text-xs font-black font-semibold shadow-sm hover:bg-blue-50 transition-colors w-full sm:w-auto">
                ✓ รับทราบ
              </button>
            </div>
          )}

          <div className="px-4 py-3 border-b border-[var(--bd)] flex flex-wrap items-center gap-x-3 gap-y-2 shrink-0 bg-[var(--bg-surface)]">
            <div className="flex items-center gap-2.5 flex-1 min-w-[140px]">
              <div className={`p-1.5 rounded bg-black border shrink-0 ${isCustom ? 'border-cyan-900/50 text-cyan-500' : isPerf || isHrt ? 'border-red-900/50 text-red-500' : 'border-[var(--bd-strong)] text-gray-300'}`}>
                {isCustom ? <LayoutTemplate size={16}/> : isPerf ? <Flame size={16} /> : <FileText size={16} />}
              </div>
              <div className="min-w-0">
                <h3 className="font-black text-white font-semibold text-xs sm:text-sm leading-tight">
                  {isCustom ? `แบบฟอร์ม: ${viewingSession.customTemplate?.title}` : isFollowUp ? 'แบบรายงานติดตาม' : 'บันทึกข้อมูลรับเข้า'}
                </h3>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {/* V118 (2026-05-23) — synth sessions (built from be_customers.patientData
                  for State A cards with no linkedOpdSessionId) have no real Firestore
                  doc → "แก้ไขข้อมูล" + Resync would write to a non-existent ref.
                  Gate via __synthetic; print + customer-nav buttons stay reachable
                  because they don't mutate the session. */}
              {viewingSession.patientData && !(viewingSession.isArchived && viewingSession.formType === 'deposit') && !viewingSession.__synthetic && (
              <button onClick={() => { closeViewSession(); onSimulateScan(viewingSession.id); }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-950/30 hover:bg-blue-900/50 text-blue-400 rounded border border-blue-900/50 transition-colors text-xs font-bold font-semibold whitespace-nowrap">
                <Edit3 size={13} /> แก้ไขข้อมูล
              </button>
              )}
              {viewingSession.patientData && !isCustom && (
                <>
                  <button onClick={() => setPrintMode('dashboard')}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--bg-hover)] hover:bg-[var(--bg-hover)] text-gray-300 rounded border border-[var(--bd-strong)] transition-colors text-xs font-bold font-semibold whitespace-nowrap">
                    <Printer size={13} /> พิมพ์สรุป A4
                  </button>
                  <button onClick={() => setPrintMode('official')}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-950/30 hover:bg-red-900/50 text-red-500 rounded border border-red-900/50 transition-colors text-xs font-bold font-semibold whitespace-nowrap">
                    <Printer size={13} /> พิมพ์ฟอร์มมาตรฐาน
                  </button>
                </>
              )}
              {viewingSession.patientData && renderViewingSessionOpdButton()}
              <button onClick={() => {
                if (hasNewUpdate && !window.confirm('⚠️ มีข้อมูลอัปเดตใหม่ที่คุณยังไม่ได้รับทราบ\nต้องการปิดหน้านี้จริงๆ หรือไม่?')) return;
                closeViewSession();
              }} className="p-1.5 bg-[var(--bg-hover)] hover:bg-red-600 text-gray-400 hover:text-white rounded border border-[var(--bd-strong)] hover:border-red-600 transition-all shrink-0">
                <X size={16} />
              </button>
            </div>
          </div>

          {viewingSession.opdRecordedAt && viewingSession.brokerStatus === 'done' && (
            <div className="px-4 sm:px-6 py-3 bg-[var(--opd-bg)] border-b border-[var(--opd-bd)] flex items-center gap-3 shrink-0 flex-wrap">
              <div className="p-1.5 rounded-lg bg-[var(--opd-btn-bg)] border border-[var(--opd-bd)]">
                <ClipboardCheck size={16} className="text-[var(--opd-color)]" />
              </div>
              <div>
                <p className="text-[11px] font-black font-semibold text-[var(--opd-color)]">บันทึก OPD เรียบร้อยแล้ว</p>
                <p className="text-xs text-[var(--opd-color)] font-mono mt-0.5 flex items-center gap-1.5 flex-wrap">
                  บันทึกเมื่อ: {formatBangkokTime(viewingSession.opdRecordedAt)}
                  {viewingSession.brokerProClinicHN && (
                    <span className="px-1.5 py-0.5 rounded bg-[var(--opd-btn-bg)] border border-[var(--opd-bd)] text-[var(--opd-color)] font-black">
                      HN {viewingSession.brokerProClinicHN}
                    </span>
                  )}
                </p>
                {viewingSession.brokerLastAutoSyncAt && (
                  <p className="text-[11px] text-[var(--opd-color)] opacity-70 font-mono mt-0.5 flex items-center gap-1">
                    🔄 ซิงค์อัตโนมัติ · {formatBangkokTime(viewingSession.brokerLastAutoSyncAt)}
                  </p>
                )}
              </div>
              <div className="ml-auto flex items-center gap-2 flex-wrap">
                {/* Phase 20.0 final ProClinic strip (2026-05-06) — "ProClinic ↗" /
                     "แก้ไขใน ProClinic" / "ลบจาก ProClinic" buttons REMOVED.
                     Patient detail/edit/delete now lives in BackendDashboard's
                     CustomerListTab (full be_* CRUD). The "คอร์สและนัดหมาย ↗"
                     button stays — it opens PatientDashboard view. */}
                {/* Phase 24.0-duodecies (2026-05-06) — "ดูข้อมูลลูกค้า" +
                     "แก้ไขข้อมูลลูกค้า" buttons. Both deep-link into
                     BackendDashboard via `?backend=1&customer=ID(&mode=edit)`
                     in a NEW BROWSER TAB (mirrors openCustomerInNewTab pattern
                     used by DepositPanel + MembershipPanel). The customer id
                     used is brokerProClinicHN — be_customers doc ids are
                     HN-formatted (LC-* prefix) so HN === doc id. Falls back
                     to brokerProClinicId for legacy sessions if HN missing. */}
                {(viewingSession.brokerProClinicHN || viewingSession.brokerProClinicId) && (
                  <>
                    <button
                      onClick={() => openCustomerInNewTab(viewingSession.brokerProClinicHN || viewingSession.brokerProClinicId)}
                      data-testid="opd-banner-view-customer-btn"
                      className="text-[11px] font-black font-semibold px-2 py-1 rounded border border-blue-700/50 text-blue-400 hover:bg-blue-900/30 transition-colors whitespace-nowrap flex items-center gap-1"
                    >
                      <Eye size={11}/> ดูข้อมูลลูกค้า ↗
                    </button>
                    <button
                      onClick={() => openCustomerEditInNewTab(viewingSession.brokerProClinicHN || viewingSession.brokerProClinicId)}
                      data-testid="opd-banner-edit-customer-btn"
                      className="text-[11px] font-black font-semibold px-2 py-1 rounded border border-amber-700/50 text-amber-400 hover:bg-amber-900/30 transition-colors whitespace-nowrap flex items-center gap-1"
                    >
                      <Edit3 size={11}/> แก้ไขข้อมูลลูกค้า ↗
                    </button>
                  </>
                )}
                {/* Phase 24.0-quinquiesdecies (2026-05-06) — Resync OPD button.
                     User: "เพิ่มปุ่ม Resync OPD ในหน้า ประวัติผู้ป่วย OPD ของ
                     Frontend ด้วย เพื่อเป็นการเช็คและ Resync ข้อมูลลงไปอีก
                     ครั้ง เผื่อมีการแก้มาจากลูกค้า ซึ่งจะทำการเช็ค matching
                     ก่อนเหมือน flow บันทึกอื่นๆเลย คือรู้ได้ว่าซ้ำใครก็จะไป
                     อัพเดทคนนั้นใน backend หรือรู้ได้ว่า คนนี้ถูกลบไปแล้ว
                     ก็จะสร้างขึ้นมาใหม่ได้".
                     handleResync already does the full match-or-create flow:
                     • If brokerProClinicId set → tryUpdateExistingCustomer
                       (graceful "doc was deleted" detection → falls through
                       to addCustomer recreate path)
                     • Else → addCustomer (Phase 24.0-octies identity-based
                       dedup by citizen_id / passport / phone) */}
                {/* V118 (2026-05-23) — Resync OPD writes to opd_sessions; synth
                    sessions have no doc → gate via !__synthetic. */}
                {viewingSession.patientData && !viewingSession.__synthetic && (
                  <button
                    onClick={() => handleResync(viewingSession)}
                    disabled={!!brokerPending[viewingSession.id]}
                    data-testid="opd-banner-resync-btn"
                    className="text-[11px] font-black font-semibold px-2 py-1 rounded border border-violet-700/50 text-violet-400 hover:bg-violet-900/30 transition-colors whitespace-nowrap flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="เช็คข้อมูลล่าสุด + อัพเดทใน backend (จับคู่จาก HN/บัตร ปชช./เบอร์โทร อัตโนมัติ; ถ้าถูกลบไปแล้วจะสร้างใหม่)"
                  >
                    {brokerPending[viewingSession.id]
                      ? <><Loader2 size={11} className="animate-spin"/> กำลัง Resync...</>
                      : <><RotateCcw size={11}/> Resync OPD</>}
                  </button>
                )}
                {viewingSession.brokerProClinicId && (
                  <button onClick={() => handleOpenPatientView(viewingSession)}
                    className="text-[11px] font-black font-semibold px-2 py-1 rounded border border-teal-700/50 text-teal-400 hover:bg-teal-900/30 transition-colors whitespace-nowrap flex items-center gap-1">
                    <Search size={9}/> คอร์สและนัดหมาย ↗
                  </button>
                )}
              </div>
            </div>
          )}
          {viewingSession.brokerStatus === 'failed' && (
            <div className="px-4 sm:px-6 py-3 bg-red-950/20 border-b border-red-900/40 shrink-0">
              <div className="flex items-center gap-3">
                <X size={16} className="text-red-400 shrink-0" />
                <p className="text-[11px] font-bold text-red-400">บันทึก OPD ไม่สำเร็จ: {viewingSession.brokerError}</p>
                <button
                  onClick={() => handleOpdClick(viewingSession)}
                  className="ml-auto text-[11px] font-black font-semibold text-red-400 hover:text-red-300 whitespace-nowrap border border-red-800 px-2 py-1 rounded"
                >ลองใหม่</button>
              </div>
              {(viewingSession.brokerError || '').includes('Session หมดอายุ') && (
                <p className="text-xs text-orange-400 mt-2 ml-7">💡 กดปุ่ม "แชร์ Session" ใน Extension Popup แล้วกด "ลองใหม่"</p>
              )}
            </div>
          )}
          <div className="p-4 md:p-6 overflow-y-auto bg-[var(--bg-base)] flex-1 custom-scrollbar">
            {/* (2026-07-04 spec ⑤) intake patientData grid EXTRACTED to the shared
                OpdIntakeDetailBody (used here + by StaffChatIntakeModal — V127
                shared-body pattern, byte-behavior-identical). */}
            <OpdIntakeDetailBody session={viewingSession} />

            {/* Custom Form Answers Viewer */}
            {isCustom && viewingSession.customTemplate && (
              <div className="mt-6 bg-[var(--bg-elevated)] p-5 sm:p-8 rounded-2xl border border-cyan-900/40 relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-cyan-900 text-white px-4 py-2 rounded-bl-2xl font-black text-xs shadow-lg">CUSTOM</div>
                <h4 className="text-xs font-black text-cyan-500 font-semibold mb-6 flex items-center gap-2">
                  <LayoutTemplate size={12}/> แบบฟอร์ม: {viewingSession.customTemplate.title}
                </h4>
                <div className="space-y-4">
                  {viewingSession.customTemplate.questions.map((q, idx) => {
                    const answer = d[q.id];
                    let displayAns = '-';
                    if (Array.isArray(answer)) displayAns = answer.length > 0 ? answer.join(', ') : '-';
                    else if (answer) displayAns = answer;

                    return (
                      <div key={q.id} className="bg-[var(--bg-surface)] p-4 rounded-xl border border-[var(--bd)]">
                        <span className="text-gray-400 text-xs font-bold mb-2 block">{idx+1}. {q.label}</span>
                        <div className="text-white text-sm font-medium whitespace-pre-wrap">{displayAns}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Standard Form Answers Viewer */}
            {!isCustom && (isPerf || showAdam || showMrs) && (
              <div className="mt-6 space-y-6">
                {!isFollowUp && isPerf && (
                  <div className="bg-[var(--bg-card)] p-4 sm:p-5 rounded-xl border border-[var(--bd)]">
                     <h4 className="text-xs font-black text-gray-400 font-semibold mb-4 flex items-center gap-2">
                      <span className="w-2 h-2 bg-red-600 rounded-full"></span> การประเมินส่วนที่ 1: อาการเบื้องต้น
                    </h4>
                    <div className="flex items-center justify-between border-b border-[var(--bd)] pb-2">
                      <span className="text-gray-300 font-medium text-sm">มีอาการหลั่งเร็ว / หลั่งไวร่วมด้วย</span>
                      {d.symp_pe ? <span className="font-black text-red-500 bg-red-950/30 px-3 py-1 rounded border border-red-900/50 text-sm">มีอาการ</span> : <span className="text-[#555] font-mono text-sm">ไม่มี</span>}
                    </div>
                  </div>
                )}

                {showAdam && renderAdamSection(d, isFollowUp, isPerf)}
                {showMrs && renderMrsSection(d, isFollowUp)}
                {isPerf && renderIiefSection(d, isFollowUp)}
              </div>
            )}

            {/* Deposit Info Section */}
            {viewingSession.formType === 'deposit' && viewingSession.depositData && renderDepositSection()}

            {viewingSession.patientData && (
            <div className="mt-8 pt-6 border-t border-[var(--bd)] relative">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-3">
                <h4 className="text-xs font-black text-gray-400 font-semibold flex items-center gap-2">
                  <FileText size={14} className="text-blue-500 shrink-0" /> สรุปประวัติผู้ป่วย (Clinical Summary)
                </h4>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="flex bg-[var(--bg-hover)] border border-[var(--bd-strong)] rounded overflow-hidden text-xs font-bold font-semibold">
                    <button onClick={() => setSummaryLang('en')} className="px-3 py-1.5 transition-colors" style={summaryLang === 'en' ? {backgroundColor: ac, color: '#fff'} : {color: '#6b7280'}}>EN</button>
                    <button onClick={() => setSummaryLang('th')} className="px-3 py-1.5 transition-colors" style={summaryLang === 'th' ? {backgroundColor: ac, color: '#fff'} : {color: '#6b7280'}}>TH</button>
                  </div>
                  <button onClick={() => handleCopyToClipboard(clinicalSummaryText, false)} className={`flex flex-1 sm:flex-none justify-center items-center gap-1.5 px-3 py-1.5 border rounded text-xs uppercase font-bold transition-colors ${isCopied ? 'bg-green-950/40 text-green-500 border-green-900/50' : 'bg-[var(--bg-hover)] hover:bg-[var(--bg-hover)] text-gray-300 border-[var(--bd-strong)]'}`}>
                    {isCopied ? <CheckCircle2 size={12} /> : <ClipboardList size={12} />}
                    {isCopied ? 'คัดลอกสำเร็จ' : 'คัดลอกข้อความ'}
                  </button>
                </div>
              </div>
              <textarea readOnly value={clinicalSummaryText} className="w-full bg-[var(--bg-surface)] border border-[var(--bd)] text-gray-300 rounded-lg p-3 sm:p-4 text-xs sm:text-xs font-mono resize-none outline-none custom-scrollbar leading-relaxed" rows="8"/>
            </div>
            )}

            {/* Treatment History from ProClinic */}
            {viewingSession.brokerProClinicId && (
              <div className="mt-8 pt-6 border-t border-[var(--bd)]">
                <TreatmentTimeline customerId={viewingSession.brokerProClinicId} isDark={isDark}
                  refreshKey={treatmentRefreshKey} autoExpandId={autoExpandTreatmentId}
                  onOpenCreateForm={(cid) => {
                    const pd = viewingSession.patientData || {};
                    const name = [pd.prefix, pd.firstName, pd.lastName].filter(Boolean).join(' ') || viewingSession.sessionName || '';
                    setTreatmentFormMode({ mode: 'create', customerId: cid, patientName: name, patientData: pd });
                  }}
                  onOpenEditForm={(tid, cid) => {
                    const pd = viewingSession.patientData || {};
                    const name = [pd.prefix, pd.firstName, pd.lastName].filter(Boolean).join(' ') || viewingSession.sessionName || '';
                    setTreatmentFormMode({ mode: 'edit', customerId: cid, treatmentId: tid, patientName: name });
                  }} />
              </div>
            )}
          </div>

        </div>
      </div>
    );
  };

  // End-date selector inside renderScheduleModal — was a nested IIFE.
  const renderScheduleEndDaySelector = (thaiMo) => {
    const [sy2, sm2] = schedStartMonth.split('-').map(Number);
    const lastMo = new Date(sy2, sm2 - 1 + schedAdvanceMonths, 0);
    const lastMoStr = `${lastMo.getFullYear()}-${String(lastMo.getMonth() + 1).padStart(2, '0')}`;
    const dimLast = lastMo.getDate();
    const todayD = bangkokNow();
    const isCurrentMonth = lastMoStr === `${todayD.getUTCFullYear()}-${String(todayD.getUTCMonth() + 1).padStart(2, '0')}`;
    const minDay = isCurrentMonth ? todayD.getUTCDate() : 1;
    const dayOptions = [];
    for (let d = minDay; d <= dimLast; d++) dayOptions.push(d);
    const defaultEnd = `${lastMoStr}-${String(dimLast).padStart(2, '0')}`;
    const currentEnd = schedEndDay || defaultEnd;
    const currentEndDay = parseInt((currentEnd).split('-')[2]) || dimLast;
    const validDay = currentEndDay < minDay ? minDay : currentEndDay > dimLast ? dimLast : currentEndDay;
    return (
      <div>
        <label className="text-xs text-[var(--tx-muted)] font-bold font-semibold mb-1 block">แสดงถึงวันที่ ({thaiMo[lastMo.getMonth()]})</label>
        <select value={validDay} onChange={e => { const d = Number(e.target.value); setSchedEndDay(`${lastMoStr}-${String(d).padStart(2, '0')}`); }}
          className={`w-full bg-[var(--bg-hover)] border border-[var(--bd)] rounded-lg px-3 py-2 text-xs text-[var(--tx-body)] ${isDark ? '[color-scheme:dark]' : ''}`}>
          {dayOptions.map(d => <option key={d} value={d}>{d} {thaiMo[lastMo.getMonth()]} {lastMo.getFullYear() + 543}</option>)}
        </select>
      </div>
    );
  };

  // Schedule link generator modal.
  const renderScheduleModal = () => {
    const thaiMo = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
    const monthOptions = [];
    const nowForOpts = bangkokNow();
    for (let i = 0; i < 7; i++) {
      const d = new Date(Date.UTC(nowForOpts.getUTCFullYear(), nowForOpts.getUTCMonth() + i, 1));
      const val = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      const label = `${thaiMo[d.getUTCMonth()]} ${d.getUTCFullYear() + 543}`;
      monthOptions.push({ val, label });
    }
    // V55/BS-14 (2026-05-08) — be_exam_rooms branch-scoped (Phase 18.0).
    // User reported (verbatim 2026-05-08): "modal สร้างลิ้งค์ตาราง ยังไม่ได้ดึงข้อมูลต่างๆใน modal จากสาขานั้นๆ".
    // V55 fixed branch-scoping (per-branch be_exam_rooms instead of legacy
    // global clinicSettings.rooms).
    //
    // V61 / AV33 (2026-05-08) — dropdown options now derived from CANONICAL
    // be_staff_schedules data via v61EligibleRooms (computed via useMemo
    // outside this render fn). Pre-V61 used `r.role` static filter which
    // could show rooms the selected doctor never enters (พบแพทย์ mode) OR
    // miss "kind=doctor" rooms with no doctor entries (ไม่พบแพทย์ mode).
    // V61 closes the V12 multi-reader-sweep gap at the modal UI boundary.
    const shownRooms = v61EligibleRooms;

    return (
      <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-[70]" onClick={() => !schedGenLoading && setShowScheduleModal(false)}>
        <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--bd)] w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
          <div className="p-4 border-b border-[var(--bd)] flex items-center justify-between">
            <h2 className="text-sm font-bold text-[var(--tx-heading)] flex items-center gap-2"><Link size={16} className="text-green-400" /> สร้างลิงก์ตาราง</h2>
            <button onClick={() => !schedGenLoading && setShowScheduleModal(false)} className="p-1.5 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-white"><X size={14} /></button>
          </div>

          {schedGenResult ? (
            <div className="p-6 flex flex-col items-center gap-4">
              <img src={schedGenResult.qrUrl} alt="QR" className="w-48 h-48 rounded-xl border border-[var(--bd)]" />
              <div className="w-full">
                <label className="text-xs text-[var(--tx-muted)] font-bold font-semibold mb-1 block">URL</label>
                <div className="flex gap-2">
                  <input readOnly value={schedGenResult.url} className="flex-1 text-xs bg-[var(--bg-hover)] border border-[var(--bd)] rounded-lg px-3 py-2 text-[var(--tx-body)] font-mono" />
                  <button onClick={() => { navigator.clipboard.writeText(schedGenResult.url); showToast('คัดลอกแล้ว', 2000); }}
                    className={`px-3 py-2 rounded-lg text-xs font-bold ${isDark ? 'bg-green-950/40 border border-green-900/50 text-green-400 hover:bg-green-900/40' : 'bg-pink-100 border border-pink-300 text-pink-600 hover:bg-pink-200'}`}>Copy</button>
                </div>
              </div>
              <button onClick={() => { setSchedGenResult(null); setShowScheduleModal(false); }}
                className="mt-2 px-6 py-2.5 rounded-xl bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] text-xs font-bold hover:text-white">ปิด</button>
            </div>
          ) : (
            <div className="p-4 space-y-4">
              <p className="text-xs text-[var(--tx-muted)]">ลิงก์จะใช้ข้อมูลวันหมอเข้า/ปิดคิว/ปิดช่วงเวลา ที่ตั้งค่าไว้ด้านล่างปฏิทิน</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[var(--tx-muted)] font-bold font-semibold mb-1 block">เดือนเริ่มต้น</label>
                  <select value={schedStartMonth} onChange={e => setSchedStartMonth(e.target.value)}
                    className={`w-full bg-[var(--bg-hover)] border border-[var(--bd)] rounded-lg px-3 py-2 text-xs text-[var(--tx-body)] ${isDark ? '[color-scheme:dark]' : ''}`}>
                    {monthOptions.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[var(--tx-muted)] font-bold font-semibold mb-1 block">แสดงทั้งหมด</label>
                  <select value={schedAdvanceMonths} onChange={e => setSchedAdvanceMonths(Number(e.target.value))}
                    className={`w-full bg-[var(--bg-hover)] border border-[var(--bd)] rounded-lg px-3 py-2 text-xs text-[var(--tx-body)] ${isDark ? '[color-scheme:dark]' : ''}`}>
                    {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n} เดือน</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[var(--tx-muted)] font-bold font-semibold mb-1 block">ช่วงเวลาละ</label>
                  <select value={schedSlotDuration} onChange={e => setSchedSlotDuration(Number(e.target.value))}
                    className={`w-full bg-[var(--bg-hover)] border border-[var(--bd)] rounded-lg px-3 py-2 text-xs text-[var(--tx-body)] ${isDark ? '[color-scheme:dark]' : ''}`}>
                    {[15,30,45,60,75,90,105,120].map(n => <option key={n} value={n}>{n >= 60 ? `${n/60} ชม.${n%60 ? ` ${n%60} นาที` : ''}` : `${n} นาที`}</option>)}
                  </select>
                </div>
                <div className="flex items-end pb-0.5">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={schedNoDoctorRequired} onChange={e => { setSchedNoDoctorRequired(e.target.checked); if (e.target.checked) setSchedSelectedDoctor(null); setSchedSelectedRoom(null); }}
                      className="w-4 h-4 rounded border-[var(--bd)] accent-sky-500" />
                    <span className="text-[11px] text-[var(--tx-body)]">ไม่ต้องพบแพทย์</span>
                  </label>
                </div>
              </div>

              {!schedNoDoctorRequired && practitioners.filter(p => p.role === 'doctor').length > 0 && (
                <div>
                  <label className="text-xs text-[var(--tx-muted)] font-bold font-semibold mb-1 block">เลือกแพทย์</label>
                  {/* V58 / AV31 (2026-05-08) — DO NOT wrap e.target.value in Number().
                      Legacy ProClinic used numeric staff IDs ("1234"); modern be_doctors uses
                      string IDs ("DOC-..."/"ASST-..." from generateMarketingId). Number("DOC-...")
                      → NaN → falsy → <select value={NaN || ''}> snaps back to "all doctors"
                      default. Bug pre-dated V55 by months — pre-V55 worked because schedule-link
                      modal data was tied to ProClinic numeric IDs; once branchExamRooms /
                      livePractitioners switched to be_doctors string IDs in V55, the click
                      handler started silently destroying admin's selection. Single-site bug:
                      only this picker has string IDs (room picker at line 4265 already uses
                      bare e.target.value); audit AV31 grep guards future regressions. */}
                  <select value={schedSelectedDoctor || ''} onChange={e => setSchedSelectedDoctor(e.target.value || null)}
                    className={`w-full bg-[var(--bg-hover)] border border-[var(--bd)] rounded-lg px-3 py-2 text-xs text-[var(--tx-body)] ${isDark ? '[color-scheme:dark]' : ''}`}>
                    <option value="">-- แพทย์ทุกคน (รวมนัดแพทย์ทุกคน) --</option>
                    {practitioners.filter(p => p.role === 'doctor').map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {shownRooms.length > 0 && (
                <div>
                  <label className="text-xs text-[var(--tx-muted)] font-bold font-semibold mb-1 block">
                    {/* V61 / AV33 — label reflects schedule-driven semantics:
                        พบแพทย์ → "ห้องที่แพทย์เข้าตรวจ" (in window)
                        ไม่พบแพทย์ → "ห้องที่ไม่มีแพทย์เข้า" (in window) */}
                    เลือกห้อง ({schedNoDoctorRequired ? 'ห้องที่ไม่มีแพทย์เข้าตรวจ' : 'ห้องที่แพทย์เข้าตรวจ'})
                  </label>
                  <select value={schedSelectedRoom || ''} onChange={e => setSchedSelectedRoom(e.target.value || null)}
                    className={`w-full bg-[var(--bg-hover)] border border-[var(--bd)] rounded-lg px-3 py-2 text-xs text-[var(--tx-body)] ${isDark ? '[color-scheme:dark]' : ''}`}>
                    {/* V61 / AV33 — Q3=B: keep "ทุกห้อง" with semantics
                        "ทุกห้องที่แพทย์เข้า" (saves union snapshot at gen time). */}
                    <option value="">
                      -- {schedNoDoctorRequired ? 'ทุกห้อง (ทั้งหมดที่ไม่มีแพทย์)' : 'ทุกห้อง (ทุกห้องที่แพทย์เข้า)'} --
                    </option>
                    {shownRooms.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {/* V61 / AV33 — empty-state banner (Q2=A: pre-flight gate UI surface).
                  When zero eligible rooms → block save + explain why. Mirrors V60
                  customer-side empty-doctor-month banner pattern. */}
              {shownRooms.length === 0 && (schedNoDoctorRequired || schedSelectedDoctor || practitioners.filter(p => p.role === 'doctor').length > 0) && (
                <div data-testid="v61-room-empty-state"
                  className="rounded-lg border border-amber-700/40 bg-amber-900/15 px-3 py-2">
                  <p className="text-[11px] text-amber-300 leading-relaxed">
                    {schedNoDoctorRequired
                      ? 'ไม่พบห้องที่ไม่มีแพทย์เข้าตรวจในระยะเวลาที่เลือก — กรุณาปรับช่วงเวลาหรือตารางหมอ'
                      : (schedSelectedDoctor
                          ? 'แพทย์ที่เลือกไม่มีตารางเข้าห้องในระยะเวลาที่เลือก — กรุณาแก้ไขตารางหมอก่อน'
                          : 'ไม่พบห้องที่มีแพทย์เข้าตรวจในระยะเวลาที่เลือก — กรุณาแก้ไขตารางหมอก่อน')}
                  </p>
                </div>
              )}
              {schedNoDoctorRequired && (
                <label className="flex items-center gap-2 cursor-pointer select-none bg-[var(--bg-hover)] rounded-lg px-3 py-2 border border-[var(--bd)]">
                  <input type="checkbox" checked={schedShowDoctorStatus} onChange={e => setSchedShowDoctorStatus(e.target.checked)}
                    className="w-4 h-4 rounded border-[var(--bd)] accent-sky-500" />
                  <span className="text-xs text-[var(--tx-body)]">แสดงสถานะ "หมอว่าง/ไม่ว่าง" ให้ลูกค้าเห็น</span>
                </label>
              )}

              {/* V59 (2026-05-08, hook-order corrected post-revert 05e210f) —
                  V56 auto-closure live preview. Renders ONLY when admin
                  picked both doctor + room. Three states: green (licensed),
                  amber (mismatch), neutral (no shifts). */}
              {v59Preview && (
                v59Preview.isLicensed ? (
                  <div className="rounded-lg bg-emerald-900/20 border border-emerald-800 px-3 py-2"
                    data-testid="v59-preview-licensed">
                    <p className="text-[11px] text-emerald-300 leading-relaxed">
                      ✓ <span className="font-bold">ห้อง "{v59Preview.roomName}"</span> อยู่ในรายการที่ <span className="font-bold">{v59Preview.doctorName}</span> เข้าตรวจ
                      {v59Preview.closedCount > 0 ? (
                        <> — บางวันที่หมอเข้าตรวจห้องอื่น: <span className="font-bold">ปิดอัตโนมัติ {v59Preview.closedCount} วัน</span></>
                      ) : (
                        <> — ลิงก์จะแสดงตามตารางหมอจริงทุกวัน</>
                      )}
                    </p>
                  </div>
                ) : v59Preview.hasShifts ? (
                  <div className="rounded-lg bg-amber-900/20 border border-amber-800 px-3 py-2"
                    data-testid="v59-preview-mismatch">
                    <p className="text-[11px] text-amber-300 leading-relaxed">
                      ⚠ <span className="font-bold">ห้อง "{v59Preview.roomName}"</span> ไม่อยู่ในรายการที่ <span className="font-bold">{v59Preview.doctorName}</span> เข้าตรวจ
                      {v59Preview.closedCount > 0 && (
                        <> — ลูกค้าจะเห็น <span className="font-bold">"ปิด" {v59Preview.closedCount} วัน</span> (วันที่หมอเข้าห้องอื่น)</>
                      )}
                    </p>
                    <p className="text-[10px] text-amber-200/70 mt-1">
                      💡 แนะนำให้แก้ไขห้องที่หมอเข้าตรวจใน tab=doctor-schedules ก่อน หรือเลือกห้องอื่น
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] px-3 py-2"
                    data-testid="v59-preview-no-shifts">
                    <p className="text-[11px] text-[var(--tx-muted)] leading-relaxed">
                      ⓘ <span className="font-bold">{v59Preview.doctorName}</span> ยังไม่มีตารางทำงานในสาขานี้ — เพิ่มที่{' '}
                      <a href="?backend=1&tab=doctor-schedules" className="underline hover:text-[var(--tx-body)]">tab=doctor-schedules</a>
                    </p>
                  </div>
                )
              )}

              {schedStartMonth === thaiYearMonth() && (
              <div>
                <label className="text-xs text-[var(--tx-muted)] font-bold font-semibold mb-1 block">แสดงคิวตั้งแต่</label>
                <div className="flex gap-2">
                  {[['today', 'วันนี้เป็นต้นไป'], ['tomorrow', 'พรุ่งนี้เป็นต้นไป']].map(([val, label]) => (
                    <button key={val} onClick={() => setSchedShowFrom(val)}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${schedShowFrom === val
                        ? (isDark ? 'bg-sky-500/20 border-sky-500/50 text-sky-300' : 'bg-pink-100 border-pink-400 text-pink-700')
                        : 'bg-[var(--bg-hover)] border-[var(--bd)] text-[var(--tx-muted)] hover:text-[var(--tx-body)]'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              )}

              {/* End date selector — RP1 lift (2026-04-30). */}
              {renderScheduleEndDaySelector(thaiMo)}

              <button onClick={handleGenScheduleLink} disabled={schedGenLoading}
                className={`w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${schedGenLoading ? (isDark ? 'bg-green-950/30 border border-green-900/40 text-green-500 opacity-70' : 'bg-green-100 border border-green-300 text-green-600 opacity-70') : (isDark ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-pink-500 hover:bg-pink-600 text-white')}`}>
                {schedGenLoading ? <><RefreshCw size={14} className="animate-spin" /> กำลัง Sync + สร้างลิงก์...</> : <><Link size={14} /> Sync + สร้างลิงก์</>}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Patient-link modal body. Returns `null` when the modal target is missing
  // and self-clears the modal state — preserves original IIFE side-effect.
  const renderPatientLinkModal = () => {
    const plSession = sessions.find(s => s.id === patientLinkModal) || archivedSessions.find(s => s.id === patientLinkModal);
    if (!plSession) { setPatientLinkModal(null); return null; }
    const plToken = plSession.patientLinkToken;
    const plEnabled = plSession.patientLinkEnabled;
    return (
      <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-[70]" onClick={() => setPatientLinkModal(null)}>
        <div className="bg-[var(--bg-elevated)] rounded-2xl border border-[var(--bd)] w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200" style={{boxShadow: '0 0 60px rgba(168,85,247,0.15)'}} onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-3 p-5 border-b border-[var(--bd)]">
            <div className="w-9 h-9 rounded-xl bg-purple-950/60 border border-purple-900/50 flex items-center justify-center shrink-0">
              <Link size={16} className="text-purple-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black font-semibold text-purple-400">ลิงก์ดูข้อมูลของผู้ป่วย</p>
              <p className="text-sm font-bold text-white truncate">{plSession.sessionName || plSession.id}</p>
            </div>
            <button onClick={() => setPatientLinkModal(null)} className="p-2 rounded-lg text-gray-600 hover:text-white hover:bg-[var(--bg-hover)] transition-colors"><X size={16}/></button>
          </div>
          <div className="p-5 flex flex-col gap-4">
            {!plToken ? (
              <>
                <p className="text-xs text-gray-500 leading-relaxed text-center">สร้างลิงก์ดูข้อมูลเพื่อให้ผู้ป่วยดูข้อมูลนัดหมาย<br/>และคอร์สคงเหลือได้ทุกเวลา</p>
                <button onClick={() => { handleGeneratePatientLink(plSession.id); setPatientLinkModal(null); }} disabled={patientLinkLoading} className="w-full py-3.5 rounded-xl font-bold text-sm font-semibold text-white transition-all disabled:opacity-60 flex items-center justify-center gap-2" style={{background: 'rgba(168,85,247,0.8)', boxShadow: '0 0 20px rgba(168,85,247,0.3)'}}>
                  {patientLinkLoading ? <Loader2 size={15} className="animate-spin"/> : <Link size={15}/>} สร้างลิงก์ดูข้อมูล
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500 font-semibold font-bold">สถานะ</span>
                  <span className={`text-xs font-black font-semibold px-2 py-1 rounded-lg ${plEnabled ? 'bg-green-950/40 text-green-400 border border-green-900/30' : 'bg-gray-800 text-gray-500 border border-gray-700'}`}>
                    {plEnabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs text-gray-600 font-semibold font-bold">ลิงก์</p>
                  <div className="flex items-center gap-2">
                    <input readOnly value={getPatientLinkUrl(plToken)} className="flex-1 bg-[var(--bg-card)] border border-[var(--bd)] text-gray-500 text-xs p-2.5 rounded-lg outline-none font-mono" />
                    <button onClick={() => handleCopyToClipboard(getPatientLinkUrl(plToken), true)} className="p-2.5 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] text-gray-400 hover:text-white transition-colors shrink-0"><ClipboardList size={14}/></button>
                    <a href={getPatientLinkUrl(plToken)} target="_blank" rel="noopener noreferrer" className="p-2.5 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] text-gray-400 hover:text-purple-400 transition-colors shrink-0"><ExternalLink size={14}/></a>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={() => { setSelectedQR(plSession.id); setQrDisplayMode('patientLink'); setPatientLinkModal(null); }} className="flex-1 py-2.5 rounded-xl border border-purple-900/50 text-purple-400 hover:bg-purple-950/30 text-xs font-bold font-semibold transition-colors flex items-center justify-center gap-1.5">
                    <QrCode size={13}/> QR
                  </button>
                  <button onClick={() => { handleTogglePatientLink(plSession); }} disabled={patientLinkLoading} className={`flex-1 py-2.5 rounded-xl border text-xs font-bold font-semibold transition-colors flex items-center justify-center gap-1.5 disabled:opacity-60 ${plEnabled ? 'border-[var(--bd)] text-gray-400 hover:text-white hover:border-[#444]' : 'border-green-900/50 text-green-400 hover:bg-green-950/30'}`}>
                    {plEnabled ? <><ToggleLeft size={13}/> ปิด</> : <><ToggleRight size={13}/> เปิด</>}
                  </button>
                  <button onClick={() => { handleDeletePatientLink(plSession.id); setPatientLinkModal(null); }} disabled={patientLinkLoading} className="p-2.5 rounded-xl border border-red-900/30 text-red-500 hover:bg-red-950/30 transition-colors disabled:opacity-60" title="ลบลิงก์">
                    <Trash2 size={14}/>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Confirm modal for deposit cancel/complete/delete actions.
  const renderDepositConfirmModal = () => {
    const { session: dSess, action: dAction } = depositToDelete;
    const dName = dSess.patientData ? `${dSess.patientData.firstName || ''} ${dSess.patientData.lastName || ''}`.trim() : dSess.sessionName || dSess.id;
    const isCancel = dAction === 'cancel';
    const isComplete = dAction === 'complete';
    const icon = isComplete ? <UserCheck size={24}/> : <Trash2 size={24}/>;
    const iconBg = isComplete ? 'bg-blue-950/50 text-blue-400 border-blue-900/50' : 'bg-red-950/50 text-red-500 border-red-900/50';
    const iconGlow = isComplete ? '0 0 15px rgba(96,165,250,0.4)' : '0 0 15px rgba(220,38,38,0.4)';
    const title = isComplete ? 'ลูกค้ามาถึงคลินิกแล้ว?' : isCancel ? 'ยกเลิกการจอง?' : 'ลบคิวจองนี้?';
    const desc = isComplete ? 'ย้ายไปประวัติจอง (การจองเรียบร้อย ลูกค้ามาถึงคลินิกแล้ว)'
      : isCancel ? 'จะลบมัดจำ + ลูกค้าใน ProClinic ด้วย'
      : 'ย้ายไปประวัติจอง (กู้คืนได้)';
    const confirmLabel = isComplete ? 'ยืนยัน' : isCancel ? 'ยกเลิกการจอง' : 'ยืนยันการลบ';
    const confirmBg = isComplete ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700';
    const confirmGlow = '';
    const borderColor = isComplete ? 'border-blue-900/50' : 'border-red-900/50';
    const boxGlow = isComplete ? '0 0 40px rgba(96,165,250,0.15)' : `0 0 40px rgba(${acRgb},0.15)`;
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
        <div className={`bg-[var(--bg-elevated)] rounded-xl border ${borderColor} w-full max-w-sm overflow-hidden p-6 text-center`} style={{boxShadow: boxGlow}}>
          <div className={`w-16 h-16 ${iconBg} rounded-full border flex items-center justify-center mx-auto mb-4`} style={{boxShadow: iconGlow}}>{icon}</div>
          <h3 className="text-base sm:text-lg font-black text-white mb-2">{title}</h3>
          <p className="text-gray-400 font-bold text-sm mb-1">{dName}</p>
          <p className="text-gray-500 mb-6 text-xs">{desc}</p>
          <div className="flex gap-3">
            <button onClick={() => setDepositToDelete(null)} className="flex-1 px-4 py-3 bg-[var(--bg-hover)] hover:bg-[var(--bg-hover)] text-gray-300 rounded font-bold text-xs border border-[var(--bd-strong)]">ยกเลิก</button>
            <button onClick={async () => {
              setDepositToDelete(null);
              if (isCancel) { handleDepositCancel(dSess); }
              else if (isComplete) {
                updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', dSess.id), {
                  serviceCompleted: true, serviceCompletedAt: serverTimestamp(),
                  isPermanent: false, createdAt: serverTimestamp(),
                });
              } else {
                // Phase 24.0-vicies-ter (2026-05-06) — archive (trash icon)
                // also cascade-deletes the linked be_deposits + be_appointments.
                // User report: "ลบลูกค้า จองมัดจำ จาก front end แล้ว ข้อมูล
                // นัดหมาย และ ข้อมูลมัดจำในหน้าการเงิน ยังไม่ลบไปจาก backend
                // ทำให้ลบได้ด้วย". Pre-fix: archive only set isArchived=true
                // on opd_sessions; orphan deposit + appt docs lingered.
                // Now: cancelDepositBookingPair (atomic writeBatch) on the
                // resolved depIdForCancel (linkedDepositId fallback for kiosk-
                // fresh deposits). Best-effort try/catch — archive proceeds
                // even if cascade fails (orphan doc cleanup can be retried
                // from Finance.มัดจำ).
                // Phase 24.0-vicies-septies — coerce legacy
                // {depositId,success} object shape on broken records.
                const _coerce = (v) => (
                  !v ? '' :
                  typeof v === 'string' ? v :
                  typeof v === 'object' && v.depositId ? String(v.depositId) :
                  String(v)
                );
                const depIdForCancel = _coerce(dSess.depositProClinicId)
                  || _coerce(dSess.linkedDepositId)
                  || '';
                if (depIdForCancel) {
                  try {
                    // Phase 24.0-vicies-quinquies — HARD delete (was soft-cancel).
                    // User: "ในหน้าการเงินไม่ต้องแสดงเป็นยกเลิกแต่ให้ลบหายไปเลย".
                    const { deleteDepositBookingPair } = await import('../lib/appointmentDepositBatch.js');
                    await deleteDepositBookingPair(depIdForCancel);
                  } catch (cascadeErr) {
                    console.warn('[archive cascade] deleteDepositBookingPair failed (best-effort):', cascadeErr);
                  }
                }
                await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', dSess.id), {
                  isArchived: true, archivedAt: serverTimestamp(),
                  // Forensic trail — stamp the cancelled doc ids so admin
                  // can audit which docs were soft-cancelled by the archive.
                  cancelledDepositId: depIdForCancel || null,
                  cancelledAppointmentId: dSess.linkedAppointmentId || null,
                });
              }
            }} className={`flex-1 px-4 py-3 ${confirmBg} text-white rounded font-bold text-xs ${confirmGlow}`}>{confirmLabel}</button>
          </div>
        </div>
      </div>
    );
  };

  // Confirm modal for general session delete.
  const renderSessionDeleteModal = () => {
    const delSession = sessions.find(s => s.id === sessionToDelete) || noDepositSessions.find(s => s.id === sessionToDelete) || depositSessions.find(s => s.id === sessionToDelete);
    const isServiceDone = delSession?.patientData && delSession?.opdRecordedAt && delSession?.brokerStatus === 'done';
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
        <div className={`bg-[var(--bg-elevated)] rounded-xl border w-full max-w-sm overflow-hidden p-6 text-center ${isServiceDone ? 'border-emerald-900/50' : 'border-red-900/50'}`} style={{boxShadow: `0 0 40px rgba(${acRgb},0.15)`}}>
          <div className={`w-16 h-16 rounded-full border flex items-center justify-center mx-auto mb-4 ${isServiceDone ? 'bg-emerald-950/50 text-emerald-400 border-emerald-900/50' : 'bg-red-950/50 text-red-500 border-red-900/50'}`} style={{boxShadow: isServiceDone ? '0 0 15px rgba(16,185,129,0.4)' : '0 0 15px rgba(220,38,38,0.4)'}}>{isServiceDone ? <CheckCircle2 size={24} /> : <Trash2 size={24} />}</div>
          <h3 className="text-base sm:text-lg font-black text-white mb-2">{isServiceDone ? 'ยืนยันการรับบริการ' : 'ยืนยันการลบข้อมูล?'}</h3>
          <p className="text-gray-500 mb-6 text-xs leading-relaxed">{isServiceDone
            ? <>ยืนยันการรับบริการและย้ายไปยังประวัติ<br/><span className="font-mono text-sm text-emerald-400">{delSession?.sessionName || sessionToDelete}</span></>
            : <>กำลังลบข้อมูลคิว <br/><span className="font-mono text-sm" style={{color: ac}}>{sessionToDelete}</span><br/>ข้อมูลนี้จะไม่สามารถกู้คืนได้</>
          }</p>
          <div className="flex gap-3">
            <button onClick={() => setSessionToDelete(null)} className="flex-1 px-4 py-3 bg-[var(--bg-hover)] hover:bg-[var(--bg-hover)] text-gray-300 rounded font-bold text-xs border border-[var(--bd-strong)]">ยกเลิก</button>
            <button onClick={() => deleteSession(sessionToDelete)} className={`flex-1 px-4 py-3 text-white rounded font-bold text-xs ${isServiceDone ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}>{isServiceDone ? 'ยืนยันการรับบริการ' : 'ยืนยันการลบ'}</button>
          </div>
        </div>
      </div>
    );
  };

  // ADAM/MRS/IIEF-5 assessment renderers — used inside the viewing-session
  // modal. Each takes the resolved `d` (patientData) plus context flags.
  const renderAdamSection = (d, isFollowUp, isPerf) => {
    const adamRes = calculateADAM(d);
    return (
      <div className="bg-[var(--bg-card)] p-4 sm:p-5 rounded-xl border border-[var(--bd)]">
        <h4 className="text-xs font-black text-gray-400 font-semibold mb-4 flex items-center gap-2">
          <span className="w-2 h-2 bg-red-600 rounded-full"></span> {isFollowUp ? 'แบบประเมินติดตามอาการ' : `การประเมินส่วนที่ ${isPerf ? '2' : '1'}`}: พร่องฮอร์โมนเพศชาย (ADAM)
        </h4>
        <div className={`p-4 rounded-lg border mb-5 flex items-center justify-between ${adamRes.bg}`}>
          <div className="flex-1 pr-2">
            <span className="text-xs font-semibold text-gray-500 block">ผลการประเมิน</span>
            <span className={`font-black text-sm sm:text-lg leading-tight ${adamRes.color} block`}>{adamRes.text}</span>
          </div>
          <div className="text-right shrink-0">
            <span className="text-xl sm:text-2xl font-black text-white">{adamRes.total}</span>
            <span className="text-gray-500 text-xs sm:text-sm font-bold"> / 10</span>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 gap-x-8 text-xs sm:text-sm">
          {[
            { k: d.adam_1, t: 'ความต้องการทางเพศลดลง' },
            { k: d.adam_2, t: 'รู้สึกขาดพลังงาน' },
            { k: d.adam_3, t: 'ความแข็งแรงหรือความทนทานลดลง' },
            { k: d.adam_4, t: 'ส่วนสูงลดลง' },
            { k: d.adam_5, t: 'ซึมเศร้า ความสุขในชีวิตลดลง' },
            { k: d.adam_6, t: 'อารมณ์แปรปรวน หงุดหงิดง่าย' },
            { k: d.adam_7, t: 'การแข็งตัวของอวัยวะเพศลดลง' },
            { k: d.adam_8, t: 'ความสามารถในการเล่นกีฬาหรือออกกำลังกายลดลง' },
            { k: d.adam_9, t: 'ง่วงนอนหลังทานอาหารเย็น' },
            { k: d.adam_10, t: 'ประสิทธิภาพการทำงานลดลง' }
          ].map((item, idx) => (
            <div key={idx} className="flex items-start justify-between border-b border-[var(--bd)] pb-1.5 gap-4">
              <span className="text-gray-400 leading-snug">{idx+1}. {item.t}</span>
              {item.k ? <span className="font-black text-orange-500 shrink-0">มีอาการ</span> : <span className="text-[#333] font-mono shrink-0">ไม่มี</span>}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderMrsSection = (d, isFollowUp) => {
    const mrsRes = calculateMRS(d);
    return (
      <div className="bg-gradient-to-br from-[#1a0515] to-[#0a0a0a] p-4 sm:p-6 rounded-xl border border-pink-900/50 shadow-inner relative overflow-hidden">
         <h4 className="text-xs font-black text-pink-500 font-semibold mb-6 flex items-center gap-2">
          <Activity size={12}/> {isFollowUp ? 'แบบประเมินติดตามอาการ' : 'การประเมินส่วนที่ 1'}: อาการวัยทอง (MRS)
        </h4>
        <div className="flex flex-col md:flex-row gap-6 items-center md:items-stretch relative z-10">
          <div className="flex flex-col items-center justify-center p-6 bg-black rounded-xl border border-[var(--bd-strong)] w-full md:min-w-[180px] md:w-auto shadow-inner">
            <span className="text-xs font-bold text-gray-500 font-semibold mb-2">คะแนนรวม</span>
            <div className="flex items-baseline gap-1 mb-3">
              <span className={`text-5xl sm:text-6xl font-black ${mrsRes.color} leading-none`}>{mrsRes.score}</span>
              <span className="text-lg font-bold text-[#333]">/ 44</span>
            </div>
            <div className={`px-4 py-1.5 rounded text-xs sm:text-xs font-semibold border text-center whitespace-nowrap ${mrsRes.bg} ${mrsRes.color}`}>
              {mrsRes.text}
            </div>
          </div>
          <div className="flex-1 w-full space-y-2">
            {[
              { q: '1. อาการร้อนวูบวาบ เหงื่อออก', v: d.mrs_1 }, { q: '2. อาการทางหัวใจ (ใจสั่น หัวใจเต้นเร็ว)', v: d.mrs_2 },
              { q: '3. ปัญหาการนอนหลับ (นอนไม่หลับ ตื่นกลางดึก)', v: d.mrs_3 }, { q: '4. อารมณ์ซึมเศร้า (เศร้าหมอง หดหู่)', v: d.mrs_4 },
              { q: '5. อารมณ์หงุดหงิดง่าย', v: d.mrs_5 }, { q: '6. วิตกกังวล กระวนกระวาย', v: d.mrs_6 },
              { q: '7. อ่อนเพลียทั้งร่างกายและจิตใจ (ไม่มีแรง)', v: d.mrs_7 }, { q: '8. ปัญหาทางเพศ (ความต้องการลดลง)', v: d.mrs_8 },
              { q: '9. ปัญหาทางเดินปัสสาวะ (ปัสสาวะบ่อย/แสบขัด)', v: d.mrs_9 }, { q: '10. อาการช่องคลอดแห้ง', v: d.mrs_10 },
              { q: '11. อาการปวดข้อและกล้ามเนื้อ', v: d.mrs_11 }
            ].map((item, idx) => (
              <div key={idx} className="flex items-center justify-between bg-[var(--bg-card)] p-2 sm:px-3 rounded border border-[var(--bd)] gap-2">
                <span className="text-xs text-gray-300 font-medium leading-snug">{item.q}</span>
                <span className="text-sm font-black text-pink-500 whitespace-nowrap shrink-0">ระดับ: {item.v || 0}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderIiefSection = (d, isFollowUp) => {
    const iiefScore = calculateIIEFScore(d);
    const interp = getIIEFInterpretation(iiefScore);
    return (
      <div className="bg-gradient-to-br from-[#1a0505] to-[#0a0a0a] p-4 sm:p-6 rounded-xl border border-red-900/50 relative overflow-hidden">
        <Flame className="absolute bottom-[-20px] right-[-20px] w-48 h-48 text-red-600 opacity-5 pointer-events-none" />
        <h4 className="text-xs font-black text-red-500 font-semibold mb-6 flex items-center gap-2">
          <Flame size={12}/> {isFollowUp ? 'แบบประเมินติดตามอาการ' : 'ส่วนที่ 3'}: ความเสื่อมสมรรถภาพทางเพศ (IIEF-5)
        </h4>
        <div className="flex flex-col md:flex-row gap-6 items-center md:items-stretch relative z-10">
          <div className="flex flex-col items-center justify-center p-6 bg-black rounded-xl border border-[var(--bd-strong)] w-full md:min-w-[180px] md:w-auto shadow-inner">
            <span className="text-xs font-bold text-gray-500 font-semibold mb-2">คะแนนรวม</span>
            <div className="flex items-baseline gap-1 mb-3">
              <span className={`text-5xl sm:text-6xl font-black ${interp.color} leading-none`}>{iiefScore}</span>
              <span className="text-lg font-bold text-[#333]">/ 25</span>
            </div>
            <div className={`px-4 py-1.5 rounded text-xs sm:text-xs font-semibold border text-center ${interp.bg} ${interp.color}`}>
              {interp.text}
            </div>
          </div>
          <div className="flex-1 w-full space-y-3">
            {[
              { q: 'Q1. ความมั่นใจในการแข็งตัว', v: d.iief_1 }, { q: 'Q2. แข็งตัวพอที่จะสอดใส่', v: d.iief_2 },
              { q: 'Q3. คงความแข็งตัวระหว่างมีเพศสัมพันธ์', v: d.iief_3 }, { q: 'Q4. คงความแข็งตัวจนเสร็จกิจ', v: d.iief_4 },
              { q: 'Q5. ความพึงพอใจในการมีเพศสัมพันธ์', v: d.iief_5 }
            ].map((item, idx) => (
              <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between bg-[var(--bg-card)] p-3 rounded border border-[var(--bd)] gap-2">
                <span className="text-xs text-gray-300 font-medium leading-snug">{item.q}</span>
                <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                  <span className="text-xs text-gray-600 uppercase font-mono sm:hidden">คะแนน</span>
                  <span className="text-lg font-black text-red-500 bg-[var(--bg-card)] w-8 h-8 flex items-center justify-center rounded border border-red-900/30 shrink-0">{item.v || 0}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // Deposit info section inside the viewing-session modal body.
  const renderDepositSection = () => {
    const dep = editingDepositData || viewingSession.depositData;
    const isEditing = !!editingDepositData;
    const optLabel = (list, val) => {
      const found = (depositOptions?.[list] || []).find(o => o.value === val);
      return found ? found.label : val || '-';
    };
    return (
      <div className="mt-6 bg-[var(--bg-elevated)] p-4 sm:p-5 rounded-xl border border-emerald-900/40 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-emerald-600"></div>
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-xs font-black text-emerald-500 font-semibold flex items-center gap-2">
            <ClipboardCheck size={12}/> ข้อมูลการจองมัดจำ
          </h4>
          <div className="flex gap-1.5">
            {!isEditing ? (
              !(viewingSession.isArchived && viewingSession.formType === 'deposit') && <button onClick={() => { if (!depositOptions) fetchDepositOptions(); setEditingDepositData({...viewingSession.depositData}); }}
                className="text-[11px] font-black font-semibold px-2 py-1 rounded border border-emerald-700/50 text-emerald-400 hover:bg-emerald-900/30 transition-colors flex items-center gap-1">
                <Edit3 size={10}/> แก้ไข
              </button>
            ) : (<>
              <button onClick={() => handleSaveDepositData(viewingSession.id, editingDepositData)}
                disabled={depositSaving}
                className="text-[11px] font-black font-semibold px-2 py-1 rounded border border-emerald-600 bg-emerald-700 text-white hover:bg-emerald-600 disabled:bg-emerald-900 disabled:cursor-not-allowed transition-colors flex items-center gap-1">
                <CheckCircle2 size={10}/> {depositSaving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
              <button onClick={() => setEditingDepositData(null)}
                className="text-[11px] font-black font-semibold px-2 py-1 rounded border border-[var(--bd-strong)] text-gray-400 hover:text-white transition-colors">
                ยกเลิก
              </button>
            </>)}
          </div>
        </div>
        {!isEditing ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="bg-[var(--bg-surface)] p-3 rounded border border-[var(--bd)]">
              <span className="text-xs text-gray-500 uppercase block mb-1">ช่องทางชำระเงิน</span>
              <span className="font-bold text-emerald-300">{dep.paymentChannel || '-'}</span>
            </div>
            <div className="bg-[var(--bg-surface)] p-3 rounded border border-[var(--bd)]">
              <span className="text-xs text-gray-500 uppercase block mb-1">ยอดชำระ</span>
              <span className="font-bold text-emerald-300">{dep.paymentAmount ? `${Number(dep.paymentAmount).toLocaleString()} บาท` : '-'}</span>
            </div>
            <div className="bg-[var(--bg-surface)] p-3 rounded border border-[var(--bd)]">
              <span className="text-xs text-gray-500 uppercase block mb-1">วันที่จ่าย</span>
              <span className="font-bold text-white">{toThaiDate(dep.depositDate) || '-'}</span>
            </div>
            <div className="bg-[var(--bg-surface)] p-3 rounded border border-[var(--bd)]">
              <span className="text-xs text-gray-500 uppercase block mb-1">เวลา</span>
              <span className="font-bold text-white">{dep.depositTime || '-'}</span>
            </div>
            <div className="bg-[var(--bg-surface)] p-3 rounded border border-[var(--bd)]">
              <span className="text-xs text-gray-500 uppercase block mb-1">พนักงานขาย</span>
              <span className="font-bold text-white">{optLabel('sellers', dep.salesperson)}</span>
            </div>
            <div className="bg-[var(--bg-surface)] p-3 rounded border border-[var(--bd)]">
              <span className="text-xs text-gray-500 uppercase block mb-1">เลขอ้างอิง</span>
              <span className="font-bold text-white">{dep.refNo || '-'}</span>
            </div>
            {dep.depositNote && (
              <div className="bg-[var(--bg-surface)] p-3 rounded border border-[var(--bd)] sm:col-span-2">
                <span className="text-xs text-gray-500 uppercase block mb-1">หมายเหตุ</span>
                <span className="font-bold text-gray-300 text-xs">{dep.depositNote}</span>
              </div>
            )}
            {dep.hasAppointment && (<>
              <div className="sm:col-span-2 mt-2 mb-1"><span className="text-xs font-black text-orange-500 font-semibold flex items-center gap-1"><CalendarClock size={10}/> นัดหมาย</span></div>
              <div className="bg-[var(--bg-surface)] p-3 rounded border border-orange-900/30">
                <span className="text-xs text-gray-500 uppercase block mb-1">วันนัด</span>
                <span className="font-bold text-orange-300">{toThaiDate(dep.appointmentDate) || '-'}</span>
              </div>
              <div className="bg-[var(--bg-surface)] p-3 rounded border border-orange-900/30">
                <span className="text-xs text-gray-500 uppercase block mb-1">เวลา</span>
                <span className="font-bold text-orange-300">{dep.appointmentStartTime || ''} - {dep.appointmentEndTime || ''}</span>
              </div>
              <div className="bg-[var(--bg-surface)] p-3 rounded border border-orange-900/30">
                <span className="text-xs text-gray-500 uppercase block mb-1">แพทย์</span>
                <span className="font-bold text-white">{optLabel('doctors', dep.doctor)}</span>
              </div>
              <div className="bg-[var(--bg-surface)] p-3 rounded border border-orange-900/30">
                <span className="text-xs text-gray-500 uppercase block mb-1">ห้องตรวจ</span>
                <span className="font-bold text-white">{optLabel('rooms', dep.room)}</span>
              </div>
              {(dep.visitPurpose || []).length > 0 && (
                <div className="bg-[var(--bg-surface)] p-3 rounded border border-orange-900/30 sm:col-span-2">
                  <span className="text-xs text-gray-500 uppercase block mb-1">นัดมาเพื่อ</span>
                  <div className="flex flex-wrap gap-1">{dep.visitPurpose.map(v => <span key={v} className="text-xs font-bold text-orange-300 bg-orange-950/30 border border-orange-900/40 px-2 py-0.5 rounded">{v}</span>)}</div>
                </div>
              )}
            </>)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <label className="text-xs text-gray-500 uppercase block mb-1">ช่องทางชำระเงิน</label>
              <select value={dep.paymentChannel || ''} onChange={e => setEditingDepositData(p => ({...p, paymentChannel: e.target.value}))} className="w-full bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white rounded px-2 py-1.5 text-sm outline-none">
                <option value="">-- เลือก --</option>
                {(depositOptions?.paymentMethods || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase block mb-1">ยอดชำระ</label>
              {/* Phase 24.0-vicies-quater — same wheel-scroll fix as the
                  create form. type=text + inputMode=numeric + sanitizer. */}
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={dep.paymentAmount || ''}
                onChange={e => {
                  const sanitized = String(e.target.value).replace(/[^\d.]/g, '');
                  setEditingDepositData(p => ({...p, paymentAmount: sanitized}));
                }}
                onWheel={e => e.target.blur()}
                className="w-full bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white rounded px-2 py-1.5 text-sm outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase block mb-1">วันที่จ่าย</label>
              <DateField value={dep.depositDate || ''} onChange={v => setEditingDepositData(p => ({...p, depositDate: v}))} fieldClassName="w-full bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white rounded px-2 py-1.5 text-sm outline-none"/>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase block mb-1">เวลา</label>
              <input type="time" value={dep.depositTime || ''} onChange={e => setEditingDepositData(p => ({...p, depositTime: e.target.value}))} className="w-full bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white rounded px-2 py-1.5 text-sm outline-none"/>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase block mb-1">พนักงานขาย</label>
              <select value={dep.salesperson || ''} onChange={e => setEditingDepositData(p => ({...p, salesperson: e.target.value}))} className="w-full bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white rounded px-2 py-1.5 text-sm outline-none">
                <option value="">-- เลือก --</option>
                {(depositOptions?.sellers || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase block mb-1">เลขอ้างอิง</label>
              <input type="text" value={dep.refNo || ''} onChange={e => setEditingDepositData(p => ({...p, refNo: e.target.value}))} className="w-full bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white rounded px-2 py-1.5 text-sm outline-none"/>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-gray-500 uppercase block mb-1">หมายเหตุ</label>
              <textarea value={dep.depositNote || ''} onChange={e => setEditingDepositData(p => ({...p, depositNote: e.target.value}))} className="w-full bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white rounded px-2 py-1.5 text-sm outline-none resize-none" rows={2}/>
            </div>
            <div className="sm:col-span-2 flex items-center gap-3 mt-1">
              <label className="text-xs text-gray-500 uppercase">นัดหมาย</label>
              <button onClick={() => setEditingDepositData(p => ({...p, hasAppointment: !p.hasAppointment}))}
                className={`px-3 py-1 rounded text-xs font-bold border transition-colors ${dep.hasAppointment ? 'bg-orange-900/30 border-orange-600 text-orange-400' : 'bg-[var(--bg-card)] border-[var(--bd)] text-gray-500'}`}>
                {dep.hasAppointment ? 'มีนัดหมาย' : 'ไม่มีนัดหมาย'}
              </button>
            </div>
            {dep.hasAppointment && (<>
              <div>
                <label className="text-xs text-gray-500 uppercase block mb-1">วันนัด</label>
                <DateField value={dep.appointmentDate || ''} onChange={v => setEditingDepositData(p => ({...p, appointmentDate: v}))} fieldClassName="w-full bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white rounded px-2 py-1.5 text-sm outline-none"/>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 uppercase block mb-1">เริ่ม</label>
                  <select value={dep.appointmentStartTime || ''} onChange={e => setEditingDepositData(p => ({...p, appointmentStartTime: e.target.value}))} className="w-full bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white rounded px-2 py-1.5 text-sm outline-none">
                    <option value="">--</option>
                    {/* Phase 29.23-bis2 — V53 BS-12 per-branch open-hours filter.
                        Legacy preservation: if existing appt start time is outside
                        new visible slots (e.g. branch hours edited after appt
                        created), keep it selectable so admin sees the original. */}
                    {dep.appointmentStartTime && !editDepositVisibleSlots.includes(dep.appointmentStartTime) && (
                      <option value={dep.appointmentStartTime}>{dep.appointmentStartTime} (นอกเวลา)</option>
                    )}
                    {editDepositVisibleSlots.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase block mb-1">สิ้นสุด</label>
                  <select value={dep.appointmentEndTime || ''} onChange={e => setEditingDepositData(p => ({...p, appointmentEndTime: e.target.value}))} className="w-full bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white rounded px-2 py-1.5 text-sm outline-none">
                    <option value="">--</option>
                    {dep.appointmentEndTime && !editDepositVisibleSlots.includes(dep.appointmentEndTime) && (
                      <option value={dep.appointmentEndTime}>{dep.appointmentEndTime} (นอกเวลา)</option>
                    )}
                    {editDepositVisibleSlots.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase block mb-1">แพทย์</label>
                <select value={dep.doctor || ''} onChange={e => setEditingDepositData(p => ({...p, doctor: e.target.value}))} className="w-full bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white rounded px-2 py-1.5 text-sm outline-none">
                  <option value="">-- เลือก --</option>
                  {(depositOptions?.doctors || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase block mb-1">ห้องตรวจ</label>
                <select value={dep.room || ''} onChange={e => setEditingDepositData(p => ({...p, room: e.target.value}))} className="w-full bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white rounded px-2 py-1.5 text-sm outline-none">
                  <option value="">-- เลือก --</option>
                  {(depositOptions?.rooms || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </>)}
          </div>
        )}
        {/* Deposit sync status */}
        {viewingSession.depositSyncStatus === 'done' && viewingSession.depositSyncAt && (
          <div className="mt-3 p-2 bg-emerald-950/20 border border-emerald-900/30 rounded text-xs text-emerald-400 font-mono flex items-center gap-2">
            <CheckCircle2 size={12}/> บันทึกมัดจำเรียบร้อย · {formatBangkokTime(viewingSession.depositSyncAt)}
          </div>
        )}
        {viewingSession.depositSyncStatus === 'failed' && (
          <div className="mt-3 p-2 bg-red-950/20 border border-red-900/30 rounded text-xs text-red-400 font-mono">
            ผิดพลาด: {viewingSession.depositSyncError}
          </div>
        )}
        {/* Phase 23.0 — surface OPD/customer sync errors inline so the
           red-locked "บันทึกลง OPD" button has a visible recovery message
           (pre-fix the brokerError lived only in the button tooltip → user
           saw red lock with no explanation → "infinite-loop UX"). */}
        {viewingSession.brokerStatus === 'failed' && viewingSession.brokerError && (
          <div className="mt-3 p-2 bg-red-950/20 border border-red-900/30 rounded text-xs text-red-400 font-mono">
            ⚠️ บันทึกลูกค้าล้มเหลว: {viewingSession.brokerError}
          </div>
        )}
      </div>
    );
  };

  // Full-OPD button for the viewing-session modal header (richer styling
  // than the per-row renderOpdButton — shows label + done-state).
  const renderViewingSessionOpdButton = () => {
    const isPending = brokerPending[viewingSession.id] || viewingSession.brokerStatus === 'pending';
    const isFailed  = !isPending && viewingSession.brokerStatus === 'failed';
    const isDone    = !isPending && !!viewingSession.opdRecordedAt && viewingSession.brokerStatus === 'done';
    return (
      <button
        onClick={() => handleOpdClick(viewingSession)}
        disabled={isPending || isDone}
        title={
          isPending ? 'กำลังบันทึกลง backend...' :
          isDone    ? 'บันทึกลง backend แล้ว — ลบจากหน้าประวัติเพื่อบันทึกใหม่' :
          isFailed  ? `ล้มเหลว: ${viewingSession.brokerError || 'unknown error'} — กดอีกครั้งเพื่อลองใหม่` :
          viewingSession.opdRecordedAt ? 'บันทึก OPD ลง backend' : 'บันทึก OPD ลง backend'
        }
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded border transition-all text-xs font-bold font-semibold whitespace-nowrap ${
          isPending ? 'bg-orange-950/20 text-orange-400 border-orange-700/50 animate-pulse' :
          isDone    ? 'bg-[var(--opd-btn-bg)] text-[var(--opd-color)] border-[var(--opd-bd-str)] cursor-not-allowed opacity-80' :
          isFailed  ? 'bg-red-950/20 text-red-400 border-red-700/50' :
          viewingSession.opdRecordedAt ? 'bg-[var(--opd-btn-bg)] text-[var(--opd-color)] border-[var(--opd-bd-str)]' :
          'bg-[var(--bg-card)] text-[var(--tx-muted)] border-dashed border-[var(--bd)] hover:border-teal-500/60 hover:text-[var(--opd-color)]'
        }`}
      >
        <ClipboardCheck size={13} />
        {isPending ? 'กำลังส่ง...' : isFailed ? 'ล้มเหลว' : viewingSession.opdRecordedAt ? 'OPD บันทึกแล้ว' : 'บันทึกเข้าระบบ'}
      </button>
    );
  };

  // Shared QR card renderer (deposit + no-deposit). Diff between the two
  // call sites is only the token-text color (`tokenColor` arg).
  const renderQrCard = (qrSession, tokenColor) => {
    const plToken = qrSession?.patientLinkToken;
    const qrSrc = plToken ? getPatientLinkQRUrl(plToken) : getQRUrl(selectedQR);
    const linkUrl = plToken ? getPatientLinkUrl(plToken) : getSessionUrl(selectedQR);
    return (
      <div className="space-y-4 sm:space-y-6 flex flex-col items-center animate-in zoom-in duration-300 w-full px-2 sm:px-0">
        <div className="p-3 sm:p-4 bg-white rounded-3xl w-full aspect-square max-w-[360px] mx-auto flex items-center justify-center overflow-hidden shadow-xl">
          <img src={qrSrc} alt="QR" className="w-full h-full object-contain"/>
        </div>
        <div className="w-full text-center">
          <h3 className="text-xl sm:text-2xl font-black text-[var(--tx-heading)] mb-1">{qrSession?.sessionName || 'ไม่มีชื่อคิว'}</h3>
        </div>
        <div className="w-full text-left">
          <p className="text-xs sm:text-xs text-[var(--tx-muted)] font-semibold mb-1.5">รหัสคิว (Token)</p>
          <p className={`font-mono text-sm sm:text-base font-black bg-[var(--bg-input)] px-4 py-3 rounded-xl border border-[var(--bd)] shadow-inner text-center break-all ${tokenColor}`}>{selectedQR}</p>
        </div>
        <div className="w-full text-left">
          <p className="text-xs sm:text-xs text-[var(--tx-muted)] font-semibold mb-1.5">คัดลอกลิงก์ (Copy Link)</p>
          <div className="flex items-center gap-2">
            <input readOnly value={linkUrl} className="flex-1 min-w-0 bg-[var(--bg-input)] border border-[var(--bd)] text-[var(--tx-muted)] text-xs sm:text-xs p-3 sm:p-3.5 rounded-xl outline-none font-mono" />
            <button onClick={() => { navigator.clipboard.writeText(linkUrl); setIsLinkCopied(true); setTimeout(() => setIsLinkCopied(false), 2000); }}
              className="bg-[var(--bg-hover)] hover:bg-[var(--bg-hover2)] p-3 sm:p-3.5 rounded-xl border border-[var(--bd)] text-[var(--tx-heading)] transition-colors flex-shrink-0" title="คัดลอกลิงก์">
              {isLinkCopied ? <CheckCircle2 size={18} className="text-green-500"/> : <ClipboardList size={18}/>}
            </button>
            <a href={linkUrl} target="_blank" rel="noopener noreferrer"
              className="bg-[var(--bg-hover)] hover:bg-[var(--bg-hover2)] p-3 sm:p-3.5 rounded-xl border border-[var(--bd)] text-[var(--tx-heading)] transition-colors flex-shrink-0" title="เปิดในหน้าต่างใหม่">
              <ExternalLink size={18}/>
            </a>
          </div>
        </div>
        <div className="w-full h-px bg-[var(--bd)] my-2"></div>
        <button onClick={() => onSimulateScan(selectedQR)} className="w-full bg-[var(--bg-hover)] hover:bg-[var(--bg-hover2)] border border-[var(--bd)] text-[var(--tx-heading)] py-3.5 sm:py-4 rounded-xl text-xs sm:text-sm font-bold font-semibold transition-all flex items-center justify-center gap-2">
          <Eye size={16}/> จำลองเปิดกรอกฟอร์ม
        </button>
      </div>
    );
  };

  return (
    /* V86 (EOD10, 2026-05-18) — admin-frontend-zone + data-section drives per-section
       neon glow (appointments tint for queue/chat/calendar). Cosmetic-shell: display
       metadata only, NO handler/state/prop touch.
       2026-06-01 (AV170): overflow-x-CLIP (not -hidden). `overflow-x: hidden` coerces
       computed `overflow-y: auto`, turning this zone into a scroll-container that
       captures the sticky top menu ([data-testid="admin-top-menu"]) → sticky silently
       no-ops. `overflow-x: clip` clips horizontally WITHOUT creating a scroll-container,
       so the sticky header sticks to the viewport. Verified in a real browser. DO NOT
       revert to overflow-x-hidden while the menu is sticky. */
    <div className="w-full max-w-[1600px] mx-auto p-4 md:p-6 lg:p-8 animate-in fade-in duration-500 overflow-x-clip admin-frontend-zone" data-section="appointments">

      {/* 2026-06-16 (mobile-load reliability) — non-blocking queue-load error
          banner. Shows only when the opd_sessions listener failed to load after
          auto-retries; the rest of the dashboard (chat / menu) stays usable. */}
      {queueLoad === 'error' && (
        <div className="mb-4">
          <LoadErrorRetry onRetry={queueRetry} accentColor={cs.accentColor || '#dc2626'} isDark={true} fullScreen={false}
            title="โหลดคิว/นัดหมายไม่สำเร็จ" retryLabel="ลองใหม่" />
        </div>
      )}

      {toastMsg && (
        <div className="fixed bottom-6 right-6 bg-blue-600 text-white px-5 py-4 rounded-2xl shadow-[0_10px_30px_rgba(37,99,235,0.3)] flex items-center gap-4 animate-in slide-in-from-bottom-5 z-[100] border border-blue-400">
          <div className="bg-white/20 p-2 rounded-full"><Bell size={24} className="animate-bounce" /></div>
          <div><h4 className="font-black text-sm font-semibold">มีการอัปเดตข้อมูล</h4><p className="text-xs opacity-90 font-medium">{toastMsg}</p></div>
          <button onClick={() => setToastMsg(null)} className="ml-2 p-1 opacity-50 hover:opacity-100 transition-opacity bg-black/20 rounded-full"><X size={16}/></button>
        </div>
      )}

      {/* ───── Top Menu — Variant A v2 (Phase A, 2026-05-18) ─────
           Desktop (≥768px): single-row pill bar with logo + 7 tabs + ⋯ overflow + right rail.
           Mobile (<768px): top bar (logo + create + bell + branch + signout) + floating bottom dock.
           Preserves 100% of legacy wiring: every setAdminMode mode kept verbatim, all 4 unread
           badges (chat/queue/no-dep/dep) with same colors + same blink for chat, Notif popover
           preserved verbatim, BranchSelector / ThemeToggle / ClinicLogo / online indicator /
           signOut all wired through identical props. */}
      {/* 2026-06-01 (AV170): sticky top-0 — the top menu stays pinned while the page
          scrolls (was `relative`, which scrolled away with content). Requires the parent
          .admin-frontend-zone to use overflow-x-CLIP not -hidden (see note above). z-20
          keeps it above page-flow content; overlays (modals z-[60]+, toast z-[100],
          bottom dock z-[90]) stay above it. */}
      <header className="menu-shell mb-6 sm:mb-8 sticky top-0 z-20" data-testid="admin-top-menu">
        <div className="menu-grad-line h-[3px] w-full rounded-t-2xl"></div>

        {/* ─── Original mobile Row 1 — REMOVED, replaced by .menu-mobile + .menu-bottom-dock ─── */}
        {/* ─── Desktop top bar (≥768px) — single-row pill bar ─── */}
        <div className="menu-desktop hidden md:flex items-center gap-2 px-4 py-2.5 bg-[var(--bg-surface)] border border-[var(--bd)] border-t-0 rounded-b-2xl shadow-[var(--shadow-panel)] overflow-visible">
          <ClinicLogo className="h-9 max-w-[140px] w-auto shrink-0" showText={false} clinicSettings={cs} theme={theme} />
          <div className="h-7 w-px bg-[var(--bd)] shrink-0 mx-1"></div>

          {/* Pill tabs — all 8 modes, badges preserved verbatim.
              V84 (2026-05-18 EOD+9): gap-0.5 → gap-1.5 (6px) so the chat tab's
              .menu-badge (right:-6px protrusion) no longer overlaps the next tab.
              menu-tab-scroll class adds padding-margin trick so badges with
              top:-6px aren't clipped by the implicit overflow-y:auto that the
              browser auto-applies whenever overflow-x is non-visible. See
              src/index.css `.menu-tab-scroll` for the full why. */}
          <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-x-auto no-scrollbar menu-tab-scroll">
            <button onClick={() => setAdminMode('chat')} className={`menu-tab ${adminMode === 'chat' ? 'menu-tab-active' : ''} ${isChatActive && chatUnread > 0 && adminMode !== 'chat' ? 'chat-tab-blink' : ''}`}>
              <MessageCircle size={14}/> <span>แชท</span>
              {isChatActive && chatUnread > 0 && <span className="menu-badge" style={{background:'#3b82f6'}}>{chatUnread > 99 ? '99+' : chatUnread}</span>}
            </button>
            {/* (2026-05-26) removed: คิวหน้า Clinic / จองไม่มัดจำ / จองมัดจำ — unified into นัดหมาย */}
            <button onClick={() => setAdminMode('appointment')} className={`menu-tab ${adminMode === 'appointment' ? 'menu-tab-active' : ''}`} title="นัดหมาย">
              <CalendarDays size={14}/> <span>นัดหมาย</span>
              {/* V121 (2026-05-23) — purple bubble for V118 card-flow sessions
                  pending admin save. Distinct color (purple #a855f7) from the
                  existing unreadCount red so admin sees the new channel at a
                  glance. Same primitive as menu-badge — see line 5976 / 5980 / 5984. */}
              {cardFlowUnreadCount > 0 && (
                <span className="menu-badge" style={{background:'#a855f7'}} data-testid="cardflow-unread-badge-desktop">
                  {cardFlowUnreadCount > 99 ? '99+' : cardFlowUnreadCount}
                </span>
              )}
            </button>
            {/* (2026-05-26) removed: ประวัติ — patient history lives in Backend (CustomerList + OPD modal) */}
            <button onClick={() => setAdminMode('clinicSettings')} className={`menu-tab ${(adminMode === 'clinicSettings' || adminMode === 'formBuilder') ? 'menu-tab-active' : ''}`} title="ตั้งค่าระบบ">
              <Palette size={14}/> <span>ตั้งค่า</span>
            </button>
            <button onClick={() => window.open('?backend=1', '_blank')} className="menu-tab menu-tab-backend" title="ระบบหลังบ้าน (เปิด tab ใหม่)">
              <Database size={14}/> <span>หลังบ้าน</span>
            </button>
          </div>

          {/* Right rail — notif + branch + theme + online + signout */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* (2026-05-27) Create-queue button REMOVED per user — feature paused, not deleted.
                The session-creation modal/form is KEPT below (state showSessionModal; the modal whose
                heading reads สร้างคิวใหม่). To restore: add a header button here whose onClick opens
                that modal (set the modal tab to standard, then show the session modal); disable while
                isGenerating. Handlers/state intact so re-enabling is a one-line JSX add. */}

            {/* V88 (2026-05-18 EOD+11) — desktop right-rail cosmetic harmony.
                Transparent base + hover:bg-[var(--bg-hover)] matches the
                .menu-tab pill philosophy used by the left tab cluster, so
                the right-rail buttons read as part of the same bar instead
                of detached cards. Handler + state logic UNCHANGED. */}
            <div className="relative">
              <button onClick={() => setShowNotifSettings(!showNotifSettings)}
                className={`p-2 rounded-lg border border-transparent transition-all hover:bg-[var(--bg-hover)] ${isNotifEnabled ? 'text-blue-400' : 'text-[var(--tx-muted)]'}`}
                title="ตั้งค่าการแจ้งเตือน">
                {isNotifEnabled ? <Bell size={14}/> : <BellOff size={14}/>}
              </button>
              {showNotifSettings && (
                <div className="absolute right-0 top-12 w-64 bg-[var(--bg-surface)] border border-[var(--bd)] rounded-xl shadow-2xl p-4 z-[200]">
                  <div className="flex items-center justify-between mb-4 border-b border-[var(--bd)] pb-2">
                    <h3 className="text-white font-bold text-xs font-semibold flex items-center gap-2"><Settings size={14}/> ตั้งค่าแจ้งเตือน</h3>
                    <button onClick={() => setShowNotifSettings(false)} className="text-gray-500 hover:text-white"><X size={14}/></button>
                  </div>
                  <div className="space-y-4">
                    <label className="flex items-center justify-between cursor-pointer group">
                      <span className="text-gray-300 text-sm font-medium group-hover:text-white transition-colors">เสียงและ Pop-up</span>
                      <input type="checkbox" checked={isNotifEnabled} onChange={(e) => setIsNotifEnabled(e.target.checked)} className="w-4 h-4 rounded text-blue-600 bg-black border-[#444] focus:ring-blue-500"/>
                    </label>
                    <div className={`space-y-2 transition-opacity ${isNotifEnabled ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
                      <div className="flex items-center justify-between text-xs text-gray-500 font-bold font-semibold">
                        <span>ระดับเสียง</span><span className="text-blue-500">{Math.round(notifVolume * 100)}%</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Volume2 size={16} className="text-gray-400 shrink-0"/>
                        <input type="range" min="0" max="1" step="0.1" value={notifVolume} onChange={(e) => setNotifVolume(parseFloat(e.target.value))} className="w-full accent-blue-600"/>
                      </div>
                      <button onClick={() => playNotificationSound(notifVolume)} className="w-full mt-2 bg-[var(--bg-hover)] hover:bg-[var(--bg-elevated)] border border-[var(--bd)] text-gray-300 py-2 rounded text-xs font-bold font-semibold transition-colors">ทดสอบเสียง</button>
                    </div>
                    <div className="pt-3 border-t border-[var(--bd)]">
                      <p className="text-xs text-gray-500 font-bold font-semibold mb-2 flex items-center gap-1.5"><Smartphone size={12}/> แจ้งเตือนมือถือ</p>
                      {pushEnabled ? (
                        <button onClick={disablePushNotifications} className="w-full bg-green-950/30 border border-green-900/40 text-green-400 py-2 rounded text-xs font-bold flex items-center justify-center gap-1.5"><CheckCircle2 size={11}/> เปิดอยู่แล้ว — กดเพื่อปิด</button>
                      ) : (
                        <button onClick={enablePushNotifications} disabled={pushLoading} className="w-full bg-[var(--bg-hover)] hover:bg-[var(--bg-elevated)] border border-[var(--bd)] text-gray-300 py-2 rounded text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors"><Smartphone size={11}/> {pushLoading ? 'กำลังตั้งค่า...' : 'เปิดการแจ้งเตือน'}</button>
                      )}
                      <p className="text-[11px] text-gray-600 mt-1.5">iPhone: ต้อง "เพิ่มลงหน้าจอ" ใน Safari ก่อน</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <BranchSelector />
            {theme && setTheme && <ThemeToggle theme={theme} setTheme={setTheme} compact />}

            {/* V88 — online indicator: transparent base (no card frame). */}
            <div className="relative group">
              <div className="flex items-center gap-1 px-2 py-2 rounded-lg cursor-default" title={`ออนไลน์ ${onlineAdmins.length} คน`}>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                <span className="text-xs font-bold text-green-500">{onlineAdmins.length}</span>
              </div>
              <div className="absolute right-0 top-full mt-1 w-48 bg-[var(--bg-surface)] border border-[var(--bd)] rounded-xl shadow-2xl p-3 z-[200] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity">
                <p className="text-[11px] text-gray-500 font-bold font-semibold mb-2">แอดมินออนไลน์</p>
                {onlineAdmins.map(a => (
                  <div key={a.id} className="flex items-center gap-2 py-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0"></span>
                    <span className="text-[11px] text-gray-300 truncate">{a.email || 'Unknown'}</span>
                    {a.id === tabIdRef.current && <span className="text-[8px] text-green-600 font-bold">(คุณ)</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* V88 — signout: transparent base + red on hover (no card frame). */}
            <button onClick={() => signOut(auth)} className="border border-transparent text-[var(--tx-muted)] hover:bg-[var(--bg-hover)] hover:text-red-500 p-2 rounded-lg transition-all" title="ออกจากระบบ">
              <LogOut size={14}/>
            </button>
          </div>
        </div>

        {/* ─── Mobile top bar (<768px) ─── */}
        <div className="menu-mobile md:hidden flex items-center justify-between gap-2 px-3 py-2 bg-[var(--bg-surface)] border border-[var(--bd)] border-t-0 rounded-b-2xl">
          <ClinicLogo className="h-7 max-w-[100px] w-auto shrink-0" showText={false} clinicSettings={cs} theme={theme} />
          <div className="flex items-center gap-1.5 shrink-0">
            {/* (2026-05-27) Mobile create-queue button REMOVED per user — feature paused.
                See the desktop right-rail note above; the modal/form is KEPT for later re-use. */}
            <div className="relative">
              <button onClick={() => setShowNotifSettings(!showNotifSettings)}
                className={`border p-2 rounded-lg ${isNotifEnabled ? 'bg-blue-950/30 border-blue-900/50 text-blue-500' : 'bg-[var(--bg-input)] border-[var(--bd)] text-[var(--tx-muted)]'}`} title="ตั้งค่าการแจ้งเตือน">
                {isNotifEnabled ? <Bell size={15}/> : <BellOff size={15}/>}
              </button>
              {showNotifSettings && (
                <div className="absolute right-0 top-12 w-64 bg-[var(--bg-surface)] border border-[var(--bd)] rounded-xl shadow-2xl p-4 z-[200]">
                  <div className="flex items-center justify-between mb-4 border-b border-[var(--bd)] pb-2">
                    <h3 className="text-white font-bold text-xs font-semibold flex items-center gap-2"><Settings size={14}/> ตั้งค่าแจ้งเตือน</h3>
                    <button onClick={() => setShowNotifSettings(false)} className="text-gray-500 hover:text-white"><X size={14}/></button>
                  </div>
                  <div className="space-y-4">
                    <label className="flex items-center justify-between cursor-pointer group">
                      <span className="text-gray-300 text-sm font-medium group-hover:text-white transition-colors">เสียงและ Pop-up</span>
                      <input type="checkbox" checked={isNotifEnabled} onChange={(e) => setIsNotifEnabled(e.target.checked)} className="w-4 h-4 rounded text-blue-600 bg-black border-[#444] focus:ring-blue-500"/>
                    </label>
                    <div className={`space-y-2 transition-opacity ${isNotifEnabled ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
                      <div className="flex items-center justify-between text-xs text-gray-500 font-bold font-semibold">
                        <span>ระดับเสียง</span><span className="text-blue-500">{Math.round(notifVolume * 100)}%</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Volume2 size={16} className="text-gray-400 shrink-0"/>
                        <input type="range" min="0" max="1" step="0.1" value={notifVolume} onChange={(e) => setNotifVolume(parseFloat(e.target.value))} className="w-full accent-blue-600"/>
                      </div>
                      <button onClick={() => playNotificationSound(notifVolume)} className="w-full mt-2 bg-[var(--bg-hover)] hover:bg-[var(--bg-elevated)] border border-[var(--bd)] text-gray-300 py-2 rounded text-xs font-bold font-semibold transition-colors">ทดสอบเสียง</button>
                    </div>
                    <div className="pt-3 border-t border-[var(--bd)]">
                      <p className="text-xs text-gray-500 font-bold font-semibold mb-2 flex items-center gap-1.5"><Smartphone size={12}/> แจ้งเตือนมือถือ</p>
                      {pushEnabled ? (
                        <button onClick={disablePushNotifications} className="w-full bg-green-950/30 border border-green-900/40 text-green-400 py-2 rounded text-xs font-bold flex items-center justify-center gap-1.5"><CheckCircle2 size={11}/> เปิดอยู่แล้ว — กดเพื่อปิด</button>
                      ) : (
                        <button onClick={enablePushNotifications} disabled={pushLoading} className="w-full bg-[var(--bg-hover)] hover:bg-[var(--bg-elevated)] border border-[var(--bd)] text-gray-300 py-2 rounded text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors"><Smartphone size={11}/> {pushLoading ? 'กำลังตั้งค่า...' : 'เปิดการแจ้งเตือน'}</button>
                      )}
                      <p className="text-[11px] text-gray-600 mt-1.5">iPhone: ต้อง "เพิ่มลงหน้าจอ" ใน Safari ก่อน</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <BranchSelector />
          </div>
        </div>
      </header>

      {adminMode === 'chat' ? (
        <div className="bg-[var(--bg-card)] rounded-2xl sm:rounded-3xl shadow-xl border border-[var(--bd)] p-4 sm:p-6 fx-glow-u3">
          <ChatPanel db={db} appId={appId} user={user} clinicSettings={clinicSettings} />
        </div>
      ) : adminMode === 'clinicSettings' ? (
        <div className="flex flex-col gap-6">
          <ClinicSettingsPanel db={db} appId={appId} clinicSettings={cs} onBack={() => setAdminMode('appointment')} theme={theme} setTheme={setTheme} />
          {/* Form Builder shortcut */}
          <div className="bg-[var(--bg-card)] rounded-2xl sm:rounded-3xl shadow-xl border border-[var(--bd)] p-5 sm:p-6">
            <div className="flex items-center gap-3 mb-4">
              <LayoutTemplate size={18} className="text-blue-500" />
              <h3 className="text-sm font-bold font-semibold text-blue-500">จัดการแบบฟอร์ม</h3>
            </div>
            <button
              onClick={() => setAdminMode('formBuilder')}
              className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors border bg-blue-950/30 border-blue-800/50 text-blue-400 hover:bg-blue-900/40"
            >
              <LayoutTemplate size={15}/> เปิดตัวจัดการแบบฟอร์ม
            </button>
          </div>
          {/* Push notification test mode */}
          <div className="bg-[var(--bg-card)] rounded-2xl sm:rounded-3xl shadow-xl border border-[var(--bd)] p-5 sm:p-6">
            <div className="flex items-center gap-3 mb-4">
              <BellOff size={18} className="text-orange-500" />
              <h3 className="text-sm font-bold font-semibold text-orange-500">โหมดทดสอบ — การแจ้งเตือน</h3>
              {globalPushMuted && (
                <span className="ml-auto text-xs font-black font-semibold px-2 py-1 rounded-lg bg-orange-950/40 border border-orange-800/50 text-orange-400">ปิดอยู่</span>
              )}
            </div>
            <button
              onClick={toggleGlobalPushMuted}
              className={`w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors border ${
                globalPushMuted
                  ? 'bg-orange-950/40 border-orange-800/50 text-orange-400 hover:bg-orange-900/40'
                  : 'bg-[var(--bg-hover)] hover:bg-[var(--bg-hover2)] border-[var(--bd)] text-[var(--tx-muted)] hover:text-white'
              }`}
            >
              {globalPushMuted
                ? <><BellOff size={15}/> Push ถูกปิดทั่วระบบ — กดเพื่อเปิดใช้งาน</>
                : <><Bell size={15}/> Push เปิดปกติ — กดเพื่อปิดสำหรับทดสอบ</>}
            </button>
            {globalPushMuted && (
              <p className="text-xs text-orange-700 mt-3 text-center">ผู้ป่วยกรอกแบบฟอร์มแล้วจะไม่มีแจ้งเตือนส่งไปยังอุปกรณ์ใดๆ</p>
            )}
          </div>
        </div>
      ) : adminMode === 'formBuilder' ? (
        <CustomFormBuilder db={db} appId={appId} user={user} onBack={() => setAdminMode('clinicSettings')} />
      ) : adminMode === 'appointment' ? (
        <div>
          {/* V64 — view-toggle pill. Phase 29 (2026-05-14) extends to 3 states
              (list / recall / calendar) — recall sits between list and calendar
              with a real-time count badge for pending+overdue. */}
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              data-testid="appt-view-toggle-list"
              onClick={() => setApptViewMode('list')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                apptViewMode === 'list'
                  ? 'bg-sky-600 border-sky-600 text-white'
                  : 'bg-[var(--bg-hover)] border-[var(--bd)] text-[var(--tx-muted)] hover:text-sky-400'
              }`}
            >
              📋 รายการ
            </button>
            <RecallTogglePill
              active={apptViewMode === 'recall'}
              onClick={() => setApptViewMode('recall')}
            />
            <button
              type="button"
              data-testid="appt-view-toggle-calendar"
              onClick={() => setApptViewMode('calendar')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                apptViewMode === 'calendar'
                  ? 'bg-sky-600 border-sky-600 text-white'
                  : 'bg-[var(--bg-hover)] border-[var(--bd)] text-[var(--tx-muted)] hover:text-sky-400'
              }`}
            >
              📅 ปฏิทิน
            </button>
          </div>
          {apptViewMode === 'recall' ? (
            <RecallFrontendView />
          ) : apptViewMode === 'list' ? (
            <AppointmentHubView
              branchName={(branches || []).find(b => b.id === selectedBranchId)?.name || ''}
              doctors={(practitioners || []).filter(p => p.role === 'doctor')}
              assistants={(practitioners || []).filter(p => p.role === 'assistant')}
              /* V64-fix7 (2026-05-09): bump-on-mutation token. AdminDashboard's
               * existing treatmentRefreshKey state increments on:
               *  - TFP onSaved (line 7745: setTreatmentRefreshKey(k => k + 1))
               *  - CustomerDetailView treatment delete (already wired)
               * View includes this in loadAll deps → silent reload → row
               * auto-flips to 'แก้ไขบันทึกการรักษา' + missed badge clears
               * the moment treatment is created/edited/deleted anywhere. */
              treatmentDataVersion={treatmentRefreshKey}
              /* V64-fix9 (2026-05-09): real-time tab refresh on appt mutation.
               * AdminDashboard's listenToAppointmentsByMonth fires on every
               * be_appointments change for the current month → bumps this
               * counter → AppointmentHubView silently re-fetches wide range. */
              appointmentDataVersion={appointmentDataVersion}
              onConfirmAppt={(appt) => {
                // V64-fix2: return promise so View can chain reload after success
                return updateBackendAppointment(appt.id, { status: 'confirmed' }).then(() => {
                  showToast?.('ยืนยันนัดสำเร็จ', 2000);
                }).catch((e) => showToast?.('ยืนยันนัดไม่สำเร็จ: ' + (e?.message || e), 3000));
              }}
              onEditAppt={() => {
                // V64-fix3 (Issue 1, 2026-05-09): View opens AppointmentFormModal
                // locally (mode='edit', appt). NO redirect to calendar mode.
                // This handler is now a no-op — kept for prop-shape compat.
              }}
              onCancelAppt={async (appt, opts = {}) => {
                // V64-fix5 (2026-05-09): confirm dialog moved to View
                // (handleCancelOptimistic) so it fires BEFORE optimistic
                // update — no flash-then-revert jitter when user says 'No'.
                //
                // V125 (2026-05-24 EOD+1) — cascade: when the appt has a
                // linked opd_session (Card flow + จองไม่มัดจำ + จองมัดจำ
                // intake-link paths), also flip the session to isArchived:true
                // so the queue-tab filters drop the row (their filter at
                // AdminDashboard:2275/2295/2311/2326 all start with `!s.isArchived`).
                // Data preserved — admin can find the session in ประวัติ tab.
                // Forensic stamps `archivedReason:'appt-cancelled'` +
                // `archivedFromApptId` let admin trace the trigger. The
                // archive write is best-effort (try/catch): the appt cancel
                // is already committed; a session-archive failure surfaces
                // via toast but doesn't roll back the cancel. Pairs with
                // V125 predicate fix in opdSessionState.js
                // isAppointmentPendingOpdSave (closes the bubble surface).
                // User-reported: "กดยกเลิก แต่ bubble ไม่หายไป + จองไม่มัดจำ
                // ยังโชว์รายการ" — both surfaces converge after V125.
                try {
                  // (2026-05-26) deposit-aware: 'ลบมัดจำด้วย' (opts.deleteDeposit)
                  // → HARD-delete the deposit + its linked appt via
                  // deleteDepositBookingPair; archive the opd_session (if any)
                  // for trace. Throws on a partially-used deposit (the dialog
                  // already disables this choice — outer catch surfaces the rare
                  // backstop case). Else fall through to the V125 appt-only cancel.
                  if (opts.deleteDeposit) {
                    const depId = appt.linkedDepositId || appt.spawnedFromDepositId || '';
                    const { deleteDepositBookingPair } = await import('../lib/appointmentDepositBatch.js');
                    await deleteDepositBookingPair(depId);
                    if (appt?.linkedOpdSessionId) {
                      try {
                        await updateDoc(
                          doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', appt.linkedOpdSessionId),
                          { isArchived: true, archivedAt: serverTimestamp(), archivedReason: 'appt-cancelled-with-deposit', archivedFromApptId: appt.id }
                        );
                      } catch (sessErr) { console.warn('[deposit-cancel] opd_session archive failed:', sessErr); }
                    }
                    showToast?.('ยกเลิกนัด + ลบมัดจำแล้ว', 2000);
                    return;
                  }
                  // Issue-3 (2026-05-26) — Frontend นัดหมาย cancel = HARD DELETE
                  // from be_appointments (user: "ยกเลิกลบออกจากระบบ ลบออกจาก
                  // appointment-all ไปเลย"), NOT a status='cancelled' mark.
                  // Mirrors the Backend calendar delete path
                  // (deleteBackendAppointment at AppointmentCalendarView.jsx:1177).
                  // The linked opd_session is still archived (V125 cascade) so the
                  // queue tabs + นัดหมาย bubble clear AND admin keeps a trace in
                  // ประวัติ. deleteBackendAppointment also releases the slot key so
                  // the time becomes bookable again. (Deposit, when present, is
                  // handled by the opts.deleteDeposit branch above: 'ลบทั้งคู่' →
                  // pair delete; 'เก็บมัดจำ'/this-only → falls here = appt deleted,
                  // deposit preserved — mirrors AppointmentCalendarView:1207.)
                  await deleteBackendAppointment(appt.id);
                  if (appt?.linkedOpdSessionId) {
                    try {
                      await updateDoc(
                        doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', appt.linkedOpdSessionId),
                        {
                          isArchived: true,
                          archivedAt: serverTimestamp(),
                          archivedReason: 'appt-deleted',
                          archivedFromApptId: appt.id,
                        }
                      );
                    } catch (sessErr) {
                      console.warn('[Issue-3] delete cascade archive failed:', sessErr);
                      showToast?.('ลบนัดสำเร็จ (แต่ archive session ล้มเหลว — ' + (sessErr?.message || sessErr) + ')', 4000);
                      return;
                    }
                  }
                  showToast?.('ลบนัดออกจากระบบแล้ว', 2000);
                } catch (e) {
                  showToast?.('ยกเลิกนัดไม่สำเร็จ: ' + (e?.message || e), 3000);
                }
              }}
              onCreateTreatmentForAppt={(appt) => {
                // V64-fix7 (2026-05-09): pass appt.date so TFP locks the
                // treatment date to the appointment day. Was defaulting to
                // today, breaking past-missed-appt cascade — admin clicked
                // "สร้างบันทึกการรักษา" on 2026-05-07 missed appt → TFP
                // defaulted to 2026-05-09 → new treatment dated 2026-05-09 →
                // 2026-05-07 row STILL showed missed badge.
                setTreatmentFormMode({
                  mode: 'create',
                  appointmentId: appt.id,
                  customerId: appt.customerId,
                  appointmentDate: appt.date || '',
                });
              }}
              onEditTreatmentForAppt={(appt) => {
                // V71.A (2026-05-15) — BUG FIX: pass customerId + customerHN so
                // TreatmentFormPage's V35.2-sexies guard doesn't short-circuit
                // to the "ไม่พบ customerId" placeholder. Pre-fix this dropped
                // customerId entirely → users couldn't edit treatment from the
                // "เสร็จแล้ว" sub-pill (or any appt-list row with linked treatment).
                // AV50 (V71.A) locks the customerId-required contract permanently.
                setTreatmentFormMode({
                  mode: 'edit',
                  treatmentId: appt.linkedTreatmentId,
                  customerId: appt.customerId,
                  customerHN: appt.customerHN || appt.hnId || '',
                });
              }}
              onOpenLineForAppt={(appt) => {
                if (!appt.customerLineUserId) return;
                // URL-encode the customer ref so a special-char HN/id can't break the
                // LINE OA deep-link query. Byte-identical for normal LC- ids (URL-safe).
                window.open(`https://line.me/R/oaMessage/@loverclinic/?customer=${encodeURIComponent(appt.customerHN || appt.customerId)}`, '_blank');
              }}
              /* V71 (2026-05-15) — mark service complete. Calls the canonical
               * writer with the current admin's Firebase auth uid for the
               * serviceCompletedBy forensic stamp. Re-throws on error so
               * HubView's optimistic-revert path fires. */
              onMarkServiceComplete={(appt) => {
                const uid = auth?.currentUser?.uid || '';
                return markAppointmentServiceCompleted(appt.id, uid).catch((err) => {
                  console.error('[V71] markAppointmentServiceCompleted failed:', err);
                  showToast('บันทึกสถานะ "รับบริการเรียบร้อย" ไม่สำเร็จ — ลองอีกครั้ง', 4000);
                  throw err; // re-throw so HubView's optimistic-revert path fires
                });
              }}
              /* V71.A (2026-05-15) — symmetric un-mark for the "↩ กลับไปคิวรอ"
               * button. Clears serviceCompletedAt + serviceCompletedBy so the
               * row moves back to "กำลังรอ" sub-pill. Re-throws on error so
               * HubView's optimistic-revert path fires. */
              onUnmarkServiceComplete={(appt) => {
                return unmarkAppointmentServiceCompleted(appt.id).catch((err) => {
                  console.error('[V71.A] unmarkAppointmentServiceCompleted failed:', err);
                  showToast('กลับคิวรอไม่สำเร็จ — ลองอีกครั้ง', 4000);
                  throw err;
                });
              }}
              /* V118 (2026-05-23) — card-level OPD lifecycle row. AdminDashboard
               * owns sessions + handlers + the SendCustomerLinkModal mount; the
               * HubView per-row mapping derives state via resolveCardOpdState
               * and dispatches handlers below. setViewingSession reaches the
               * existing ประวัติผู้ป่วย OPD modal owned by App.jsx. */
              resolveLinkedSession={resolveLinkedSession}
              onSendOrViewOpdLink={handleSendOrViewOpdLink}
              onSaveOpdFromCard={handleSaveOpdFromCard}
              setViewingSession={setViewingSession}
              opdLinkBusyByApptId={opdLinkBusyByApptId}
              opdSaveBusyByApptId={opdSaveBusyByApptId}
            />
          ) : renderJsxBlock(() => {
        // ── Appointment Calendar ──
        const [y, m] = apptMonth.split('-').map(Number);
        const firstDayOfMonth = new Date(y, m - 1, 1);
        const lastDayOfMonth = new Date(y, m, 0);
        const daysInMonth = lastDayOfMonth.getDate();
        const startDow = firstDayOfMonth.getDay(); // 0=Sun
        const calStart = startDow === 0 ? 6 : startDow - 1; // shift to Monday-first
        const thaiMonths = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
        const thaiDays = ['จ','อ','พ','พฤ','ศ','ส','อา'];
        // Theme-aware colors
        const docCellBg = isDark ? 'bg-sky-950/30 border border-sky-800/40 hover:border-sky-600/50' : 'bg-sky-50 border border-sky-200 hover:border-sky-400';
        const closedCellBg = isDark ? 'bg-red-950/30 border border-red-900/40 opacity-50' : 'bg-red-50 border border-red-200 opacity-60';
        const normalCellBg = isDark ? 'bg-emerald-950/20 border border-emerald-900/30 hover:border-emerald-700/50' : 'bg-emerald-50 border border-emerald-200 hover:border-emerald-400';
        const legendDocBg = isDark ? 'bg-sky-950/50 border border-sky-800/50' : 'bg-sky-100 border border-sky-200';
        const legendClosedBg = isDark ? 'bg-red-950/50 border border-red-900/50' : 'bg-red-100 border border-red-200';
        const dayNumColor = isDark ? 'text-gray-300' : 'text-gray-700';
        const apptCountColor = isDark ? 'text-sky-300/80' : 'text-sky-600';
        const availCountColor = isDark ? 'text-green-400' : 'text-green-600';
        const warnCountColor = isDark ? 'text-orange-400' : 'text-orange-600';
        const monthTextColor = isDark ? 'text-white' : 'text-[var(--tx-heading)]';
        const selectColor = isDark ? '[color-scheme:dark]' : '[color-scheme:light]';
        const selectText = isDark ? 'text-white' : 'text-[var(--tx-heading)]';
        const appointments = apptData?.appointments || [];
        const pList = practitioners;
        const doctorIdSet = new Set(pList.filter(p => p.role === 'doctor').map(p => String(p.id)));
        const assistantIdSet = new Set(pList.filter(p => p.role === 'assistant').map(p => String(p.id)));
        const filteredAppointments = apptFilterPractitioner === 'all'
          ? appointments
          : apptFilterPractitioner === 'all-doctors'
            ? appointments.filter(a => doctorIdSet.has(String(a.doctorId)))
            : apptFilterPractitioner === 'all-assistants'
              ? appointments.filter(a => assistantIdSet.has(String(a.doctorId)))
              : appointments.filter(a => String(a.doctorId) === apptFilterPractitioner);

        // Build appointment count per day
        const countByDate = {};
        filteredAppointments.forEach(a => {
          if (!countByDate[a.date]) countByDate[a.date] = 0;
          countByDate[a.date]++;
        });

        // Calculate available slots per day based on selected duration
        const availByDate = {};
        const dur = apptSlotDuration || 60;
        for (let d2 = 1; d2 <= daysInMonth; d2++) {
          const ds2 = `${apptMonth}-${String(d2).padStart(2, '0')}`;
          const dt2 = new Date(y, m - 1, d2);
          const dow2 = dt2.getDay();
          const isWknd2 = dow2 === 0 || dow2 === 6;
          // V55/BS-14 — appointment month-grid availability uses per-branch
          // clinic open hours so empty-slot counts reflect the SELECTED
          // branch (not the legacy global doc).
          const openT2 = isWknd2 ? satSunOpen : monFriOpen;
          const closeT2 = isWknd2 ? satSunClose : monFriClose;
          const [oH2, oM2] = openT2.split(':').map(Number);
          const [cH2, cM2] = closeT2.split(':').map(Number);
          const startMin2 = oH2 * 60 + oM2;
          const endMin2 = cH2 * 60 + cM2;
          let totalSlots = 0;
          let bookedSlots = 0;
          const dayAppts2 = filteredAppointments.filter(a => a.date === ds2);
          for (let sm = startMin2; sm + dur <= endMin2; sm += dur) {
            totalSlots++;
            const slotEnd = sm + dur;
            // Check if any appointment overlaps this slot
            const hasAppt = dayAppts2.some(a => {
              const aS = parseInt(a.startTime.split(':')[0]) * 60 + parseInt(a.startTime.split(':')[1]);
              const aE = parseInt(a.endTime.split(':')[0]) * 60 + parseInt(a.endTime.split(':')[1]);
              return aS < slotEnd && aE > sm;
            });
            if (hasAppt) bookedSlots++;
          }
          availByDate[ds2] = totalSlots - bookedSlots;
        }

        // Calculate doctor-hour available slots per day
        const docAvailByDate = {};
        const cs2 = clinicSettings;
        for (let d3 = 1; d3 <= daysInMonth; d3++) {
          const ds3 = `${apptMonth}-${String(d3).padStart(2, '0')}`;
          if (!schedDoctorDays.has(ds3)) continue;
          const dt3 = new Date(y, m - 1, d3);
          const dow3 = dt3.getDay();
          const isWknd3 = dow3 === 0 || dow3 === 6;
          const docOpen = isWknd3 ? (cs2.doctorStartTimeWeekend || cs2.doctorStartTime || '10:00') : (cs2.doctorStartTime || '10:00');
          const docClose = isWknd3 ? (cs2.doctorEndTimeWeekend || cs2.doctorEndTime || '17:00') : (cs2.doctorEndTime || '19:00');
          const [dOH, dOM] = docOpen.split(':').map(Number);
          const [dCH, dCM] = docClose.split(':').map(Number);
          const dStartMin = dOH * 60 + dOM;
          const dEndMin = dCH * 60 + dCM;
          let dTotal = 0;
          let dBooked = 0;
          const dayAppts3 = filteredAppointments.filter(a => a.date === ds3);
          for (let sm = dStartMin; sm + dur <= dEndMin; sm += dur) {
            dTotal++;
            const slotEnd = sm + dur;
            const hasAppt = dayAppts3.some(a => {
              const aS = parseInt(a.startTime.split(':')[0]) * 60 + parseInt(a.startTime.split(':')[1]);
              const aE = parseInt(a.endTime.split(':')[0]) * 60 + parseInt(a.endTime.split(':')[1]);
              return aS < slotEnd && aE > sm;
            });
            if (hasAppt) dBooked++;
          }
          docAvailByDate[ds3] = dTotal - dBooked;
        }

        // Selected day's appointments
        const selectedAppts = apptSelectedDate
          ? filteredAppointments.filter(a => a.date === apptSelectedDate).sort((a, b) => a.startTime.localeCompare(b.startTime))
          : [];

        const prevMonth = () => {
          const d = new Date(y, m - 2, 1);
          setApptMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
          setApptSelectedDate(null);
        };
        const nextMonth = () => {
          const d = new Date(y, m, 1);
          setApptMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
          setApptSelectedDate(null);
        };

        const todayStr = thaiTodayISO();

        // Phase 20.0 Task 1 (2026-05-06) — stale detection removed. be_appointments
        // is live via listenToAppointmentsByMonth; the 'syncedAt' tag is just the
        // listener-fire timestamp and the data is always fresh.

        return (
          <div className="space-y-4 max-w-2xl mx-auto">
            {/* Calendar card */}
            <div className="bg-[var(--bg-card)] rounded-2xl sm:rounded-3xl shadow-xl border border-[var(--bd)] overflow-hidden">
              {/* Header */}
              <div className="p-3 sm:p-5 border-b border-[var(--bd)] space-y-2.5">
                {/* Row 1: title + month nav */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CalendarDays size={18} className="text-sky-400" />
                    <h2 className="text-sm sm:text-lg font-bold font-semibold text-sky-400">นัดหมาย</h2>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={prevMonth} aria-label="เดือนก่อนหน้า" className="p-1.5 sm:p-2 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-white transition-colors">
                      <ChevronLeft size={14} />
                    </button>
                    <span className={`text-xs sm:text-sm font-bold ${monthTextColor} min-w-[110px] sm:min-w-[140px] text-center`}>{thaiMonths[m - 1]} {y + 543}</span>
                    <button onClick={nextMonth} aria-label="เดือนถัดไป" className="p-1.5 sm:p-2 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-white transition-colors">
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
                {/* Phase 20.0 Task 1 (2026-05-06) — Sync button removed; data is live.
                    Only "สร้างลิงก์" remains. */}
                <div className="flex items-center gap-2">
                  <button onClick={() => { setSchedStartMonth(apptMonth); setSchedGenResult(null); setSchedSlotDuration(60); setSchedNoDoctorRequired(false); setSchedSelectedDoctor(null); setSchedSelectedRoom(null); setSchedShowDoctorStatus(false); setSchedShowFrom('today'); setSchedEndDay(''); setShowScheduleModal(true); }}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${isDark ? 'bg-purple-950/40 border border-purple-800/50 text-purple-400 hover:bg-purple-900/40 hover:text-purple-300' : 'bg-purple-50 border border-purple-200 text-purple-600 hover:bg-purple-100'}`}>
                    <Link size={13} /> สร้างลิงก์
                  </button>
                </div>
                {/* Row 3: slot duration selector */}
                <div className="flex items-center gap-2 bg-[var(--bg-hover)] rounded-lg px-3 py-1.5 border border-[var(--bd)]">
                  <Clock size={12} className="text-gray-500 shrink-0" />
                  <span className="text-xs text-gray-500 shrink-0">คำนวณว่าง:</span>
                  <select value={apptSlotDuration} onChange={e => setApptSlotDuration(Number(e.target.value))}
                    className={`bg-[var(--bg-hover)] ${selectText} text-[11px] font-bold outline-none cursor-pointer ${selectColor} flex-1 rounded px-1`}>
                    {[15,30,45,60,75,90,105,120].map(v => (
                      <option key={v} value={v}>{v < 60 ? `${v} นาที` : v === 60 ? '1 ชม.' : `${Math.floor(v/60)}:${String(v%60).padStart(2,'0')} ชม.`}</option>
                    ))}
                  </select>
                  <span className="text-[11px] text-gray-600 shrink-0">|</span>
                  <Stethoscope size={10} className="text-sky-400 shrink-0" />
                  <span className="text-xs text-sky-400/70 shrink-0">หมอ</span>
                </div>
                {/* Practitioner filter */}
                {pList.filter(p => p.role !== 'hidden').length > 0 && (
                  <div className="flex items-center gap-2 bg-[var(--bg-hover)] rounded-lg px-3 py-1.5 border border-[var(--bd)]">
                    <Users size={12} className="text-purple-400 shrink-0" />
                    <select value={apptFilterPractitioner} onChange={e => setApptFilterPractitioner(e.target.value)}
                      className={`bg-[var(--bg-hover)] ${selectText} text-[11px] font-bold outline-none cursor-pointer ${selectColor} flex-1 rounded px-1`}>
                      <option value="all">ทุกคน</option>
                      {doctorIdSet.size > 0 && <option value="all-doctors">🩺 แพทย์ทั้งหมด</option>}
                      {assistantIdSet.size > 0 && <option value="all-assistants">👤 ผู้ช่วยทั้งหมด</option>}
                      {pList.filter(p => p.role === 'doctor').length > 0 && (
                        <optgroup label="แพทย์">
                          {pList.filter(p => p.role === 'doctor').map(p => (
                            <option key={p.id} value={String(p.id)}>{p.name}</option>
                          ))}
                        </optgroup>
                      )}
                      {pList.filter(p => p.role === 'assistant').length > 0 && (
                        <optgroup label="ผู้ช่วย">
                          {pList.filter(p => p.role === 'assistant').map(p => (
                            <option key={p.id} value={String(p.id)}>{p.name}</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>
                )}
              </div>

              {/* Calendar grid */}
              <div className="p-3 sm:p-5 relative">
                {/* Phase 20.0 Task 1 (2026-05-06) — stale + syncing overlays
                    removed. be_appointments is live via listener; data is
                    always fresh, no manual sync gate needed. */}
                {/* Legend */}
                <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mb-2.5 text-[11px] sm:text-[11px] text-gray-500">
                  <span className="flex items-center gap-1">🔥 <span className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-sm inline-block ${legendDocBg}`} /> หมอเข้า</span>
                  <span className="flex items-center gap-1"><span className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-sm inline-block ${isDark ? 'bg-emerald-950/40 border border-emerald-900/40' : 'bg-emerald-50 border border-emerald-200'}`} /> ปกติ</span>
                  <span className="flex items-center gap-1"><span className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-sm inline-block ${legendClosedBg}`} /> ปิด</span>
                  <span className="flex items-center gap-1"><span className={`${apptCountColor} font-bold`}>นัด</span></span>
                  <span className="flex items-center gap-1"><span className={`${availCountColor} font-bold`}>ว่าง</span>/<span className="text-sky-400 font-bold">หมอ</span></span>
                </div>
                {/* Day headers */}
                <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-1">
                  {thaiDays.map((d, i) => (
                    <div key={i} className={`text-center text-xs sm:text-xs font-bold font-semibold py-1.5 ${i >= 5 ? 'text-red-400/60' : 'text-gray-500'}`}>{d}</div>
                  ))}
                </div>
                {/* Day cells */}
                <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
                  {Array.from({ length: calStart }).map((_, i) => (
                    <div key={`empty-${i}`} className="min-h-[56px] sm:min-h-[72px]" />
                  ))}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const dateStr = `${apptMonth}-${String(day).padStart(2, '0')}`;
                    const count = countByDate[dateStr] || 0;
                    const avail = availByDate[dateStr] ?? null;
                    const docAvail = docAvailByDate[dateStr] ?? null;
                    const isSelected = apptSelectedDate === dateStr;
                    const isToday = dateStr === todayStr;
                    const dow = (calStart + i) % 7;
                    const isWeekend = dow >= 5;
                    // V63 / AV35 (2026-05-08) — read from canonicalDoctorDays
                    // (derived from be_staff_schedules via useMemo above) NOT
                    // schedDoctorDays admin manual paint. User directive: pull
                    // doctor-days from canonical source for fire emoji.
                    const isDoc = canonicalDoctorDays.has(dateStr);
                    const isClosed = schedClosedDays.has(dateStr);

                    let cellBg = normalCellBg;
                    if (isClosed) cellBg = closedCellBg;
                    else if (isDoc) cellBg = docCellBg;
                    if (isSelected) cellBg = 'bg-sky-600 ring-2 ring-sky-400 ring-offset-1 ring-offset-[var(--bg-card)] border-0';

                    return (
                      <button key={day} onClick={() => setApptSelectedDate(isSelected ? null : dateStr)}
                        className={`rounded-lg flex flex-col items-center justify-center py-1 sm:py-1.5 gap-px transition-all text-xs relative cursor-pointer min-h-[58px] sm:min-h-[76px]
                          ${cellBg} ${isToday && !isSelected ? 'ring-2 ring-sky-400/60' : ''}`}>
                        {!isClosed && isDoc && <span className="absolute top-0.5 right-0.5 sm:top-1 sm:right-1 text-[8px] sm:text-xs leading-none">🔥</span>}
                        {isToday && <span className={`text-[6px] sm:text-[8px] font-bold leading-none mb-px ${isSelected ? 'text-white/80' : 'text-sky-400'}`}>วันนี้</span>}
                        <span className={`font-black text-[15px] sm:text-lg leading-tight ${isSelected ? 'text-white' : isToday ? 'text-sky-400' : isClosed ? 'text-red-400/60' : isWeekend ? 'text-red-400/70' : isDoc ? (isDark ? 'text-sky-300' : 'text-sky-700') : isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>{day}</span>
                        {isClosed && <span className="text-[7px] sm:text-[11px] font-bold text-red-400/70 leading-none">ปิด</span>}
                        {!isClosed && count > 0 && <span className={`text-[7px] sm:text-[11px] font-bold leading-tight ${isSelected ? 'text-sky-100' : apptCountColor}`}>นัด {count}</span>}
                        {!isClosed && (avail != null || docAvail != null) && (
                          <div className="flex items-center gap-0.5 mt-px">
                            {avail != null && <span className={`text-[7px] sm:text-[11px] font-bold leading-tight ${isSelected ? 'text-green-200' : avail > 0 ? availCountColor : warnCountColor}`}>{avail}</span>}
                            {avail != null && docAvail != null && <span className={`text-[6px] sm:text-[7px] ${isSelected ? 'text-white/40' : 'text-gray-600'}`}>/</span>}
                            {docAvail != null && <span className={`text-[7px] sm:text-[11px] font-bold leading-tight ${isSelected ? 'text-sky-200' : docAvail > 0 ? 'text-sky-400' : warnCountColor}`}>{docAvail}</span>}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Phase 20.0 Task 1 (2026-05-06) — sync timestamp + Sync button
                    removed; be_appointments is live and always fresh. */}
                {!apptData && (
                  <div className="text-center py-8 text-gray-500">
                    <CalendarDays size={36} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-bold mb-2">ยังไม่มีข้อมูลเดือนนี้</p>
                  </div>
                )}
              </div>
            </div>

            {/* ══ Appointment Manager — Search & Manage ══ */}
            <div className="bg-[var(--bg-card)] rounded-2xl sm:rounded-3xl shadow-xl border border-[var(--bd)] overflow-hidden">
              <div className="p-4 sm:p-5 border-b border-[var(--bd)]">
                <div className="flex items-center gap-2 mb-3">
                  <UserPlus size={16} className="text-emerald-400" />
                  <h3 className="text-sm font-bold text-[var(--tx-heading)]">จัดการนัดหมายลูกค้า</h3>
                </div>
                {/* Search input */}
                <div className="flex gap-2">
                  <input type="text" placeholder="ค้นหา ชื่อ นามสกุล เลขบัตร ปชช. หรือ HN..."
                    value={apptSearchQuery || ''}
                    onChange={e => setApptSearchQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleApptSearch(); }}
                    className="flex-1 text-sm px-3 py-2 rounded-lg border bg-[var(--bg-input)] border-[var(--bd)] text-[var(--tx-normal)] placeholder-gray-500 focus:outline-none focus:border-sky-500" />
                  <button onClick={handleApptSearch} disabled={apptSearching || !apptSearchQuery?.trim()}
                    className="px-4 py-2 rounded-lg text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 flex items-center gap-1.5">
                    {apptSearching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                    ค้นหา
                  </button>
                </div>
                {/* Search results */}
                {apptSearchResults && apptSearchResults.length > 0 && !apptSelectedCustomer && (
                  <div className="mt-3 space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
                    {apptSearchResults.map(c => (
                      <button key={c.id} onClick={() => handleApptSelectCustomer(c)}
                        className="w-full text-left px-3 py-2 rounded-lg border border-[var(--bd)] hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all flex items-center gap-3">
                        <User size={14} className="text-emerald-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          {/* Task 9 LR-4 (2026-05-15) — show 🟢/⚪️ LINE chip alongside the
                              customer name so admin sees per-branch LINE linkage before
                              picking this customer for the appointment.
                              Task 9 polish I1 (2026-05-15) — pass `nameClassName` to
                              preserve the original bold-heading-color + truncate
                              styling (pre-migration: `<span className="text-sm font-bold
                              text-[var(--tx-heading)] truncate block">`). */}
                          <CustomerOption
                            customer={{ ...c, name: c.name || `ลูกค้า #${c.id}` }}
                            contextBranchId={selectedBranchId}
                            nameClassName="text-sm font-bold text-[var(--tx-heading)] truncate block"
                          />
                          <span className="text-xs text-gray-500">{c.hn ? `HN: ${c.hn}` : ''}{c.phone ? <> | <PhoneLink value={c.phone}>{c.phone}</PhoneLink></> : null} | ID: {c.id}</span>
                        </div>
                        <ChevronRight size={14} className="text-gray-500" />
                      </button>
                    ))}
                  </div>
                )}
                {apptSearchResults && apptSearchResults.length === 0 && !apptSearching && (
                  <p className="mt-3 text-xs text-gray-500 text-center py-2">ไม่พบลูกค้า</p>
                )}
              </div>

              {/* Selected customer — appointment list + add/edit form */}
              {apptSelectedCustomer && (
                <div className="p-4 sm:p-5">
                  {/* Customer header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                        <User size={14} className="text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-[var(--tx-heading)]">{apptSelectedCustomer.name || `ลูกค้า #${apptSelectedCustomer.id}`}</p>
                        <p className="text-xs text-gray-500">{apptSelectedCustomer.hn ? `HN: ${apptSelectedCustomer.hn}` : ''} ID: {apptSelectedCustomer.id}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => { setApptFormMode({ mode: 'create' }); }}
                        className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 flex items-center gap-1">
                        <PlusCircle size={12} /> เพิ่มนัดหมาย
                      </button>
                      <button onClick={() => { setApptSelectedCustomer(null); setApptCustomerAppts([]); setApptFormMode(null); }}
                        className="p-1.5 rounded-lg border border-[var(--bd)] text-gray-500 hover:text-white transition-colors">
                        <X size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Add/Edit form */}
                  {apptFormMode && (
                    <div className="mb-4 p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
                      <p className="text-xs font-bold font-semibold text-emerald-400 mb-3">
                        {apptFormMode.mode === 'create' ? 'เพิ่มนัดหมายใหม่' : 'แก้ไขนัดหมาย'}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
                        <div>
                          <label className="text-[11px] font-bold text-gray-500 uppercase">วันที่</label>
                          <DateField value={apptFormData.date || ''}
                            onChange={v => setApptFormData(p => ({ ...p, date: v }))}
                            fieldClassName="w-full text-xs px-2 py-1.5 rounded-lg border bg-[var(--bg-input)] border-[var(--bd)] text-[var(--tx-normal)]" />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-gray-500 uppercase">เวลาเริ่ม</label>
                          <select value={apptFormData.startTime || ''}
                            onChange={e => {
                              const st = e.target.value;
                              setApptFormData(p => {
                                // Auto-set endTime = startTime + 30min
                                const [h,m] = st.split(':').map(Number);
                                const endMin = h * 60 + m + 30;
                                const endH = String(Math.floor(endMin / 60)).padStart(2,'0');
                                const endM = String(endMin % 60).padStart(2,'0');
                                return { ...p, startTime: st, endTime: `${endH}:${endM}` };
                              });
                            }}
                            className="w-full text-xs px-2 py-1.5 rounded-lg border bg-[var(--bg-input)] border-[var(--bd)] text-[var(--tx-normal)]">
                            <option value="">-- เลือก --</option>
                            {Array.from({ length: 29 }, (_, i) => { const t = 8 * 60 + 30 + i * 30; const h = String(Math.floor(t/60)).padStart(2,'0'); const m = String(t%60).padStart(2,'0'); return <option key={`${h}:${m}`} value={`${h}:${m}`}>{h}:{m}</option>; })}
                          </select>
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-gray-500 uppercase">เวลาสิ้นสุด</label>
                          <select value={apptFormData.endTime || ''}
                            onChange={e => setApptFormData(p => ({ ...p, endTime: e.target.value }))}
                            className="w-full text-xs px-2 py-1.5 rounded-lg border bg-[var(--bg-input)] border-[var(--bd)] text-[var(--tx-normal)]">
                            <option value="">-- เลือก --</option>
                            {Array.from({ length: 29 }, (_, i) => { const t = 8 * 60 + 30 + i * 30; const h = String(Math.floor(t/60)).padStart(2,'0'); const m = String(t%60).padStart(2,'0'); return <option key={`${h}:${m}`} value={`${h}:${m}`}>{h}:{m}</option>; })}
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                        <div>
                          <label className="text-[11px] font-bold text-gray-500 uppercase">ที่ปรึกษา *</label>
                          <select value={apptFormData.advisor || ''}
                            onChange={e => setApptFormData(p => ({ ...p, advisor: e.target.value }))}
                            className="w-full text-xs px-2 py-1.5 rounded-lg border bg-[var(--bg-input)] border-[var(--bd)] text-[var(--tx-normal)]">
                            <option value="">-- เลือก --</option>
                            {(depositOptions?.advisors || []).map(o => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-gray-500 uppercase">แพทย์</label>
                          <select value={apptFormData.doctor || ''}
                            onChange={e => setApptFormData(p => ({ ...p, doctor: e.target.value }))}
                            className="w-full text-xs px-2 py-1.5 rounded-lg border bg-[var(--bg-input)] border-[var(--bd)] text-[var(--tx-normal)]">
                            <option value="">-- ไม่ระบุ --</option>
                            {(depositOptions?.doctors || practitioners.filter(p => p.role === 'doctor')).map(o => (
                              <option key={o.value || o.id} value={o.value || o.id}>{o.label || o.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-gray-500 uppercase">ห้องตรวจ *</label>
                          <select value={apptFormData.room || ''}
                            onChange={e => setApptFormData(p => ({ ...p, room: e.target.value }))}
                            className="w-full text-xs px-2 py-1.5 rounded-lg border bg-[var(--bg-input)] border-[var(--bd)] text-[var(--tx-normal)]">
                            <option value="">-- เลือก --</option>
                            {(depositOptions?.rooms || []).map(o => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-gray-500 uppercase">จุดประสงค์</label>
                          <select value={apptFormData.appointmentTo || ''}
                            onChange={e => setApptFormData(p => ({ ...p, appointmentTo: e.target.value }))}
                            className="w-full text-xs px-2 py-1.5 rounded-lg border bg-[var(--bg-input)] border-[var(--bd)] text-[var(--tx-normal)]">
                            <option value="">-- ไม่ระบุ --</option>
                            <option value="ปรึกษา">ปรึกษา</option>
                            <option value="ทำหัตถการ">ทำหัตถการ</option>
                            <option value="ติดตามผล">ติดตามผล</option>
                            <option value="รับยา">รับยา</option>
                            <option value="อื่นๆ">อื่นๆ</option>
                          </select>
                        </div>
                      </div>
                      <div className="mb-3">
                        <label className="text-[11px] font-bold text-gray-500 uppercase">หมายเหตุ</label>
                        <textarea value={apptFormData.note || ''}
                          onChange={e => setApptFormData(p => ({ ...p, note: e.target.value }))}
                          rows={2} className="w-full text-xs px-2 py-1.5 rounded-lg border bg-[var(--bg-input)] border-[var(--bd)] text-[var(--tx-normal)] resize-none" />
                      </div>
                      {/* Task 10 LR-4 (2026-05-15) — LINE-notify confirmation
                          card. Shows green checkbox + display name when the
                          selected customer has LINE linked at the active
                          branch; yellow warning when linked elsewhere; null
                          otherwise. Drives apptNotifyChannel for the
                          createBackendAppointment payload. */}
                      <LineNotifyConfirmation
                        customer={apptSelectedCustomer}
                        targetBranchId={selectedBranchId}
                        checked={apptNotifyChannel.includes('line')}
                        onChange={(val) => setApptNotifyChannel((prev) =>
                          val ? Array.from(new Set([...prev, 'line'])) : prev.filter((c) => c !== 'line'),
                        )}
                      />
                      <div className="flex gap-2">
                        <button onClick={handleApptFormSubmit} disabled={apptFormSaving}
                          className="px-4 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 flex items-center gap-1.5">
                          {apptFormSaving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                          {apptFormMode.mode === 'create' ? 'สร้างนัดหมาย' : 'บันทึก'}
                        </button>
                        <button onClick={() => setApptFormMode(null)}
                          className="px-4 py-1.5 rounded-lg text-xs font-bold border border-[var(--bd)] text-gray-400 hover:text-white">
                          ยกเลิก
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Appointment list */}
                  {apptCustomerLoading ? (
                    <div className="flex items-center justify-center gap-2 py-6">
                      <Loader2 size={16} className="animate-spin text-emerald-400" />
                      <span className="text-xs text-gray-500">กำลังโหลดนัดหมาย...</span>
                    </div>
                  ) : apptCustomerAppts.length === 0 ? (
                    <div className="text-center py-6 text-xs text-gray-500">ไม่พบนัดหมาย</div>
                  ) : (
                    <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar" ref={el => {
                      if (el && el._scrolled) return;
                      if (el && apptCustomerAppts.length > 0) {
                        el._scrolled = true;
                        const today = thaiTodayISO();
                        const firstFutureIdx = apptCustomerAppts.findIndex(a => a.date >= today);
                        if (firstFutureIdx > 0) {
                          const target = el.children[firstFutureIdx];
                          if (target) requestAnimationFrame(() => el.scrollTop = target.offsetTop - el.offsetTop);
                        }
                      }
                    }}>
                      {apptCustomerAppts.map(a => {
                        const isPast = a.date < thaiTodayISO();
                        const [ay, amo, ad] = (a.date || '').split('-').map(Number);
                        const thMo = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
                        const dateDisplay = ad && amo ? `${ad} ${thMo[amo - 1]} ${ay + 543}` : a.date;
                        return (
                          <div key={a.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all ${isPast ? 'border-[var(--bd)] opacity-60' : 'border-emerald-500/20 bg-emerald-500/5'}`}>
                            <div className="text-center shrink-0 w-24">
                              <p className={`text-xs font-bold ${isPast ? 'text-gray-500' : 'text-emerald-400'}`}>{dateDisplay}</p>
                              <p className="text-[11px] text-gray-500">{a.startTime}-{a.endTime}</p>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-[var(--tx-heading)] truncate">{a.doctorName || '-'}</p>
                              <p className="text-xs text-gray-500 truncate">{a.appointmentTo || ''}{a.note ? ` | ${a.note}` : ''}{a.roomName && a.roomName !== '-' ? ` | ${a.roomName}` : ''}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {!isPast && (
                                <button onClick={() => handleApptEdit(a)} title="แก้ไข"
                                  className="p-1.5 rounded-lg border border-[var(--bd)] text-sky-400 hover:bg-sky-500/10 transition-colors">
                                  <Edit3 size={12} />
                                </button>
                              )}
                              <button onClick={() => handleApptDelete(a.id)} title="ลบ"
                                className="p-1.5 rounded-lg border border-[var(--bd)] text-red-400 hover:bg-red-500/10 transition-colors">
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Selected date appointments */}
            {apptSelectedDate && (
              <div className="bg-[var(--bg-card)] rounded-2xl sm:rounded-3xl shadow-xl border border-[var(--bd)] overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-[var(--bd)] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar size={16} className="text-sky-400" />
                    <h3 className="text-sm font-bold text-white">
                      {parseInt(apptSelectedDate.split('-')[2])} {thaiMonths[m - 1]} {y + 543}
                    </h3>
                    <span className="text-xs text-gray-500 font-bold ml-1">({selectedAppts.length} นัดหมาย)</span>
                  </div>
                  <button onClick={() => setApptSelectedDate(null)} className="p-1.5 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] text-gray-500 hover:text-white transition-colors">
                    <X size={14} />
                  </button>
                </div>

                {selectedAppts.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    <CalendarDays size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">ไม่มีนัดหมายในวันนี้</p>
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--bd)]">
                    {selectedAppts.map((appt) => {
                      const statusMap = { '1': 'รอดำเนินการ', '2': 'ยืนยันแล้ว', '3': 'เสร็จสิ้น', '4': 'ยกเลิก' };
                      const statusColor = { '1': 'text-orange-400', '2': 'text-green-400', '3': 'text-blue-400', '4': 'text-red-400' };
                      return (
                        <div key={appt.id} className="p-4 hover:bg-[var(--bg-hover)] transition-colors">
                          <div className="flex items-start gap-3">
                            {/* Time */}
                            <div className="shrink-0 w-[72px] text-center bg-sky-950/30 border border-sky-900/40 rounded-lg py-1.5 px-1">
                              <div className="text-xs font-black text-sky-300">{appt.startTime}</div>
                              <div className="text-[11px] text-sky-500">{appt.endTime}</div>
                            </div>
                            {/* Details */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-bold text-sm text-white truncate">{appt.customerName !== '-' ? appt.fullCustomerName || appt.customerName : 'ไม่ระบุชื่อ'}</span>
                                {appt.hnId && appt.hnId !== '-' && (
                                  <span className="text-[11px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded font-mono shrink-0">{appt.hnId}</span>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-400">
                                {appt.doctorName && appt.doctorName !== '-' && (
                                  <span className="flex items-center gap-1"><Stethoscope size={10} className="text-sky-500" /> {appt.doctorName}</span>
                                )}
                                {appt.roomName && appt.roomName !== '-' && (
                                  <span className="flex items-center gap-1"><MapPin size={10} className="text-sky-500" /> {appt.roomName}</span>
                                )}
                                {appt.source && (
                                  <span className="flex items-center gap-1"><Phone size={10} className="text-sky-500" /> {appt.source}</span>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-1.5 mt-1.5 items-center">
                                {appt.appointmentType && (
                                  <span className="text-[11px] bg-sky-950/40 text-sky-400 border border-sky-900/40 px-1.5 py-0.5 rounded font-bold">{resolveAppointmentTypeLabel(appt.appointmentType)}</span>
                                )}
                                <span className={`text-[11px] font-bold ${statusColor[appt.status] || 'text-gray-400'}`}>
                                  {appt.confirmed ? '✓ ' : ''}{statusMap[appt.status] || `สถานะ ${appt.status}`}
                                </span>
                                {/* V68 (2026-05-15) — LINE badge if appt has notifyChannel=['line'].
                                    Self-nullifies for non-LINE appts so most cells render nothing. */}
                                <AppointmentLineBadge appt={appt} size="xs" />
                              </div>
                              {appt.note && (
                                <p className="text-[11px] text-gray-500 mt-1.5 line-clamp-2">{appt.note}</p>
                              )}
                            </div>
                            {/* Phase 20.0 final ProClinic strip (2026-05-06) —
                                 ProClinic external link REMOVED. Color dot only. */}
                            <div className="shrink-0 flex flex-col items-center gap-1.5 mt-1">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: appt.eventColor || appt.appointmentColor || '#4FC3F7' }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── Schedule Day Preferences ── */}
            {renderJsxBlock(() => {
              // Build months for preference calendar: current apptMonth ± based on navigation
              const prefMonths = [apptMonth];
              const moPrefix = apptMonth + '-';
              const blockedCount = schedManualBlocked.filter(b => b.date.startsWith(moPrefix)).length;
              const doctorCount = [...schedDoctorDays].filter(d => d.startsWith(moPrefix)).length;
              const closedCount = [...schedClosedDays].filter(d => d.startsWith(moPrefix)).length;

              return (
                <div className="bg-[var(--bg-card)] rounded-2xl sm:rounded-3xl shadow-xl border border-[var(--bd)] overflow-hidden">
                  {/* Header */}
                  <div className="p-4 sm:p-5 border-b border-[var(--bd)]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500/20 to-purple-500/20 border border-sky-800/30 flex items-center justify-center">
                          <Stethoscope size={16} className="text-sky-400" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-[var(--tx-heading)] tracking-wide">ตั้งค่าตารางคลินิก</h3>
                          {/* V63 / AV35 (2026-05-08) — subtitle dropped "หมอเข้า"
                              since admin can no longer paint it manually.
                              Doctor days = canonical from be_staff_schedules. */}
                          <p className="text-xs text-[var(--tx-muted)]">ปิดคิว · ปิดช่วงเวลา</p>
                        </div>
                      </div>
                      {/* Summary badges */}
                      <div className="flex items-center gap-1.5">
                        {doctorCount > 0 && <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${isDark ? 'bg-sky-950/40 border border-sky-900/40 text-sky-400' : 'bg-sky-100 border border-sky-200 text-sky-600'}`}>{doctorCount} หมอเข้า</span>}
                        {closedCount > 0 && <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${isDark ? 'bg-red-950/40 border border-red-900/40 text-red-400' : 'bg-red-100 border border-red-200 text-red-600'}`}>{closedCount} ปิด</span>}
                        {blockedCount > 0 && <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${isDark ? 'bg-orange-950/40 border border-orange-900/40 text-orange-400' : 'bg-orange-100 border border-orange-200 text-orange-600'}`}>{blockedCount} slot ปิด</span>}
                      </div>
                    </div>
                    {/* Legend — V63 / AV35: "หมอเข้า" is now READ-ONLY
                        (canonical source: be_staff_schedules). Admin paint
                        only toggles ปิดคิว ↔ ปกติ. The legend keeps "หมอเข้า"
                        chip for visual reference (still rendered) but appends
                        "(จากตารางหมอ)" hint to clarify it's not editable here. */}
                    <div className="flex flex-wrap gap-3 mt-3 text-xs text-[var(--tx-muted)]">
                      <span className="flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-sm inline-block ${isDark ? 'bg-sky-600' : 'bg-sky-400'}`} /> หมอเข้า <span className="opacity-60">(จากตารางหมอ)</span></span>
                      <span className="flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-sm inline-block ${isDark ? 'bg-red-600' : 'bg-red-400'}`} /> ปิดคิว</span>
                      <span className="flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-sm inline-block ${isDark ? 'bg-emerald-700' : 'bg-emerald-400'}`} /> ปกติ</span>
                      <span className="flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-sm inline-block ${isDark ? 'bg-orange-600' : 'bg-orange-400'}`} /> ปิดช่วงเวลา</span>
                      {!schedCalendarEditing && <span className="text-[11px] text-[var(--tx-muted)] ml-auto opacity-50">กดแก้ไขเพื่อเปลี่ยน</span>}
                    </div>
                    {/* Calendar edit/save/cancel buttons */}
                    <div className="flex items-center gap-2 mt-3">
                      {!schedCalendarEditing ? (
                        <button onClick={() => { if (confirm('ต้องการแก้ไขปิดคิว?')) startCalendarEdit(); }}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${isDark ? 'bg-sky-950/40 border border-sky-900/50 text-sky-400 hover:bg-sky-900/40' : 'bg-sky-50 border border-sky-200 text-sky-600 hover:bg-sky-100'}`}>
                          {/* V63 / AV35 — admin can only toggle closed/normal now */}
                          <Edit3 size={11} /> แก้ไขปิดคิว
                        </button>
                      ) : (
                        <>
                          <button onClick={saveCalendarEdit}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-green-950/40 border border-green-900/50 text-green-400 hover:bg-green-900/40 transition-all">
                            <CheckCircle2 size={11} /> บันทึก
                          </button>
                          <button onClick={cancelCalendarEdit}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-red-950/40 border border-red-900/50 text-red-400 hover:bg-red-900/40 transition-all">
                            <XCircle size={11} /> ยกเลิก
                          </button>
                          {/* V63 / AV35 — cycle simplified to closed ↔ normal */}
                          <span className="text-[11px] text-sky-400 ml-auto">กำลังแก้ไข — กดวันที่เพื่อสลับ ปกติ ↔ ปิดคิว</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Calendar(s) */}
                  <div className={`p-3 sm:p-4 space-y-3 ${!schedCalendarEditing ? 'pointer-events-none opacity-50' : ''}`}>
                    {prefMonths.map(mo => {
                      const [cy, cm] = mo.split('-').map(Number);
                      const dim = new Date(cy, cm, 0).getDate();
                      const fdow = new Date(cy, cm - 1, 1).getDay();
                      const calS = fdow === 0 ? 6 : fdow - 1;
                      const moBlockedCount = schedManualBlocked.filter(b => b.date.startsWith(mo)).length;

                      return (
                        <div key={mo} className="bg-[var(--bg-hover)] rounded-xl border border-[var(--bd)] overflow-hidden">
                          {/* Month header */}
                          <div className="px-3 py-2 border-b border-[var(--bd)] flex items-center justify-between">
                            <span className="text-xs font-bold text-[var(--tx-heading)]">{thaiMonths[cm - 1]} {cy + 543}</span>
                            {moBlockedCount > 0 && <span className="text-[8px] bg-orange-950/40 border border-orange-900/40 text-orange-400 px-1.5 py-0.5 rounded-full font-bold">{moBlockedCount} slot ปิด</span>}
                          </div>
                          <div className="p-2.5">
                            {/* Day headers */}
                            <div className="grid grid-cols-7 gap-0.5 mb-0.5">
                              {thaiDays.map((d, i) => <div key={i} className={`text-center text-[11px] font-bold py-0.5 ${i >= 5 ? 'text-red-400/50' : 'text-gray-500'}`}>{d}</div>)}
                            </div>
                            {/* Day cells — drag to toggle */}
                            <div className="grid grid-cols-7 gap-0.5 select-none" style={{touchAction: 'none'}}
                              onPointerUp={handleDayPointerUp} onPointerLeave={handleDayPointerUp} onPointerCancel={handleDayPointerUp} onPointerMove={handleDayPointerMove}>
                              {Array.from({ length: calS }).map((_, i) => <div key={`e-${i}`} className="aspect-square" />)}
                              {Array.from({ length: dim }).map((_, i) => {
                                const day = i + 1;
                                const ds = `${mo}-${String(day).padStart(2, '0')}`;
                                // V63 / AV35 (2026-05-08) — canonical doctor
                                // days (read-only, from be_staff_schedules).
                                // Admin can no longer toggle "doctor day" via
                                // this calendar — only closed/normal cycle
                                // remains. 🔥 emoji shows when doctor has
                                // schedule entry (canonical source).
                                const isDoc = canonicalDoctorDays.has(ds);
                                const isCl = schedClosedDays.has(ds);
                                const hasBlocked = schedManualBlocked.some(b => b.date === ds);
                                const dow = (calS + i) % 7;
                                return (
                                  <button key={day} data-dayds={ds}
                                    onPointerDown={(e) => handleDayPointerDown(ds, e)}
                                    onPointerEnter={() => handleDayPointerEnter(ds)}
                                    className={`aspect-square rounded-md flex flex-col items-center justify-center text-[11px] font-bold transition-colors relative
                                      ${isCl ? (isDark ? 'bg-red-900/40 border border-red-800/50' : 'bg-red-100 border border-red-200') : isDoc ? (isDark ? 'bg-sky-900/40 border border-sky-700/50' : 'bg-sky-100 border border-sky-200') : (isDark ? 'bg-emerald-950/30 border border-emerald-900/30 hover:border-emerald-700/40' : 'bg-emerald-50 border border-emerald-200 hover:border-emerald-400')}
                                      ${isCl ? 'text-red-400' : dow >= 5 ? 'text-red-400/70' : isDoc ? (isDark ? 'text-sky-300' : 'text-sky-600') : (isDark ? 'text-emerald-300' : 'text-emerald-700')}`}>
                                    {day}
                                    {isDoc && <span className="text-[7px] leading-none mt-px">🔥</span>}
                                    {isCl && <span className="text-[7px]">✕</span>}
                                    {hasBlocked && !isCl && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-orange-500" />}
                                  </button>
                                );
                              })}
                            </div>

                            {/* Manual slot blocking for this month */}
                            <div className={`mt-2.5 pt-2 border-t border-[var(--bd)] ${!schedSlotEditing ? 'pointer-events-none opacity-50' : ''}`}>
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[11px] text-[var(--tx-muted)] font-bold flex items-center gap-1"><Clock size={9} /> ปิดช่วงเวลา{schedSlotEditing ? ' — กดเลือกวัน' : ''}</span>
                              </div>
                              <div className="flex flex-wrap gap-0.5">
                                {Array.from({ length: dim }).map((_, i) => {
                                  const ds2 = `${mo}-${String(i + 1).padStart(2, '0')}`;
                                  const isActive = schedBlockingDay === ds2;
                                  const dayHasBlocked = schedManualBlocked.some(b => b.date === ds2);
                                  return (
                                    <button key={ds2} onClick={() => setSchedBlockingDay(isActive ? null : ds2)}
                                      className={`w-6 h-6 rounded text-[11px] font-bold transition-all ${isActive ? 'bg-sky-600 text-white ring-1 ring-sky-400' : dayHasBlocked ? 'bg-orange-900/40 border border-orange-800/40 text-orange-400' : 'bg-[var(--bg-card)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-white hover:border-[var(--tx-muted)]'}`}>
                                      {i + 1}
                                    </button>
                                  );
                                })}
                              </div>
                              {/* Time slot grid for selected day */}
                              {schedBlockingDay && schedBlockingDay.startsWith(mo) && renderJsxBlock(() => {
                                const bDate = new Date(schedBlockingDay);
                                const bDow = bDate.getDay();
                                const isWknd = bDow === 0 || bDow === 6;
                                // V55/BS-14 — time-slot grid for "ตั้งค่าตาราง
                                // คลินิก" day-block UI uses per-branch
                                // clinic open hours.
                                const openT = isWknd ? satSunOpen : monFriOpen;
                                const closeT = isWknd ? satSunClose : monFriClose;
                                const slots15 = [];
                                const [oh2, om2] = openT.split(':').map(Number);
                                const [ch2, cm22] = closeT.split(':').map(Number);
                                let cur2 = oh2 * 60 + om2;
                                const end2 = ch2 * 60 + cm22;
                                while (cur2 <= end2) {
                                  const sH = String(Math.floor(cur2 / 60)).padStart(2, '0');
                                  const sM = String(cur2 % 60).padStart(2, '0');
                                  const eMin = cur2 + 15;
                                  const eH = String(Math.floor(eMin / 60)).padStart(2, '0');
                                  const eM = String(eMin % 60).padStart(2, '0');
                                  slots15.push({ start: `${sH}:${sM}`, end: `${eH}:${eM}` });
                                  cur2 += 15;
                                }
                                const dayNum = parseInt(schedBlockingDay.split('-')[2]);
                                const dayMo = parseInt(schedBlockingDay.split('-')[1]);
                                // Find appointments for this day
                                const dayAppts = appointments.filter(a => a.date === schedBlockingDay);
                                const findApptForSlot = (slotStart) => {
                                  const slotMin = parseInt(slotStart.split(':')[0]) * 60 + parseInt(slotStart.split(':')[1]);
                                  return dayAppts.find(a => {
                                    const aStart = parseInt(a.startTime.split(':')[0]) * 60 + parseInt(a.startTime.split(':')[1]);
                                    const aEnd = parseInt(a.endTime.split(':')[0]) * 60 + parseInt(a.endTime.split(':')[1]);
                                    return slotMin >= aStart && slotMin < aEnd;
                                  });
                                };
                                const isDoctorDay = schedDoctorDays.has(schedBlockingDay);
                                const docRanges = getDoctorRangesForDate(schedBlockingDay);
                                const hasCustomDocHours = !!schedCustomDoctorHours[schedBlockingDay];
                                return (
                                  <div className="mt-2 bg-[var(--bg-card)] rounded-lg border border-[var(--bd)] p-2.5">
                                    <div className="text-xs text-[var(--tx-muted)] mb-2 flex items-center gap-1.5 flex-wrap">
                                      <Clock size={10} className="text-orange-400" />
                                      <span>วันที่ <strong className="text-[var(--tx-body)]">{dayNum}/{dayMo}</strong> — กด/ลากเพื่อปิด-เปิด</span>
                                      {dayAppts.length > 0 && <span className="text-[11px] text-sky-400 font-bold ml-auto">{dayAppts.length} นัดหมาย</span>}
                                    </div>
                                    {isDoctorDay && (
                                      <div className="text-[11px] text-sky-400 mb-1.5 flex items-center gap-1 flex-wrap">
                                        <Stethoscope size={9} /> เวลาหมอ: {docRanges.map((r, i) => <span key={i}>{i > 0 && ', '}{r.start}–{r.end}</span>)}
                                        {hasCustomDocHours && <span className="text-orange-400 font-bold">(custom)</span>}
                                      </div>
                                    )}
                                    <div className="flex items-center gap-3 mb-1.5 text-[8px]">
                                      <span className="flex items-center gap-1"><span className={`w-2 h-2 rounded-sm inline-block ${isDark ? 'bg-red-900/50 border border-red-800/50' : 'bg-red-200 border border-red-300'}`}></span> ปิดคิว</span>
                                      {isDoctorDay && <span className="flex items-center gap-1"><span className={`w-2 h-2 rounded-sm inline-block ${isDark ? 'bg-sky-900/50 border border-sky-700/50' : 'bg-sky-200 border border-sky-300'}`}></span> หมอเข้า</span>}
                                    </div>
                                    <div className="space-y-0.5 select-none" style={{touchAction: 'none'}}
                                      onPointerUp={() => { handleSlotPointerUp(); handleDocSlotPointerUp(); }}
                                      onPointerLeave={() => { handleSlotPointerUp(); handleDocSlotPointerUp(); }}
                                      onPointerCancel={() => { handleSlotPointerUp(); handleDocSlotPointerUp(); }}
                                      onPointerMove={handleSlotPointerMove}>
                                      {slots15.map(s => {
                                        const blocked = schedManualBlocked.some(b => b.date === schedBlockingDay && b.startTime === s.start && b.endTime === s.end);
                                        const inDocHour = isDoctorDay && isSlotInDoctorHours(schedBlockingDay, s.start);
                                        const appt = findApptForSlot(s.start);
                                        return (
                                          <div key={s.start} className="flex items-stretch gap-0.5">
                                            <div className="w-12 shrink-0 flex items-center justify-center text-xs font-mono font-bold text-[var(--tx-muted)] bg-[var(--bg-hover)]/30 border-y border-l border-[var(--bd)]/30 rounded-l">
                                              {s.start}
                                            </div>
                                            <button data-slot-info data-slot-date={schedBlockingDay} data-slot-start={s.start} data-slot-end={s.end} data-slot-type="block"
                                              onPointerDown={(e) => handleSlotPointerDown(schedBlockingDay, s.start, s.end, e)}
                                              onPointerEnter={() => handleSlotPointerEnter(schedBlockingDay, s.start, s.end)}
                                              className={`w-12 shrink-0 py-2 text-xs font-bold transition-colors ${blocked ? (isDark ? 'bg-red-900/50 border border-red-800/50 text-red-400' : 'bg-red-200 border border-red-300 text-red-600') : 'bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:border-red-800/40 hover:text-red-300'}`}
                                              title={blocked ? 'ปิดคิวอยู่ — กดเพื่อเปิด' : 'กดเพื่อปิดคิว'}>
                                              {blocked ? '✕' : ''}
                                            </button>
                                            {isDoctorDay && (
                                              <button data-slot-info data-slot-date={schedBlockingDay} data-slot-start={s.start} data-slot-end={s.end} data-slot-type="doctor"
                                                onPointerDown={(e) => handleDocSlotPointerDown(schedBlockingDay, s.start, s.end, e)}
                                                onPointerEnter={() => handleDocSlotPointerEnter(schedBlockingDay, s.start, s.end)}
                                                className={`w-12 shrink-0 py-2 text-xs font-bold transition-colors ${inDocHour ? (isDark ? 'bg-sky-900/50 border border-sky-700/50 text-sky-400' : 'bg-sky-200 border border-sky-300 text-sky-600') : 'bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:border-sky-800/40 hover:text-sky-300'}`}
                                                title={inDocHour ? 'หมอเข้า — กดเพื่อปิด' : 'กดเพื่อเปิดเวลาหมอ'}>
                                                {inDocHour ? '🔥' : ''}
                                              </button>
                                            )}
                                            {/* V68 (2026-05-15) — schedule-day-preferences slot grid intentionally
                                                SKIPS the AppointmentLineBadge: 8px micro-cells are too tight for the
                                                chip; admin's canonical LINE-channel scanning surface is the queue
                                                calendar selectedAppts list above. AV47 sanctioned skip. */}
                                            <div className={`flex-1 px-2 py-1.5 text-xs flex items-center gap-1.5 min-w-0 rounded-r ${appt ? (isDark ? 'bg-sky-950/30 border border-sky-900/30' : 'bg-sky-50 border border-sky-200') : 'bg-[var(--bg-hover)]/30 border border-transparent'}`}>
                                              {appt ? (
                                                <>
                                                  <span className={`font-bold truncate ${isDark ? 'text-sky-300' : 'text-sky-700'}`}>{appt.fullCustomerName || appt.customerName || '—'}</span>
                                                  {appt.doctorName && appt.doctorName !== '-' && <span className="text-[8px] text-sky-500 shrink-0">🔥{appt.doctorName}</span>}
                                                  {appt.appointmentType && <span className="text-[8px] text-gray-500 shrink-0">{resolveAppointmentTypeLabel(appt.appointmentType)}</span>}
                                                </>
                                              ) : (
                                                <span className="text-gray-600 text-[11px]">—</span>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Slot edit buttons — only show when calendar edit is active */}
                  {schedCalendarEditing && <div className="px-4 pb-4">
                    <div className="flex items-center gap-2">
                      {!schedSlotEditing ? (
                        <button onClick={() => { if (confirm('ต้องการแก้ไขการปิดช่วงเวลา?')) startSlotEdit(); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-orange-950/40 border border-orange-900/50 text-orange-400 hover:bg-orange-900/40 transition-all">
                          <Edit3 size={11} /> แก้ไขปิดช่วงเวลา
                        </button>
                      ) : (
                        <>
                          <button onClick={saveSlotEdit}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-green-950/40 border border-green-900/50 text-green-400 hover:bg-green-900/40 transition-all">
                            <CheckCircle2 size={11} /> บันทึก
                          </button>
                          <button onClick={cancelSlotEdit}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-red-950/40 border border-red-900/50 text-red-400 hover:bg-red-900/40 transition-all">
                            <XCircle size={11} /> ยกเลิก
                          </button>
                          <span className="text-[11px] text-orange-400 ml-auto">กำลังแก้ไข</span>
                        </>
                      )}
                    </div>
                  </div>}
                </div>
              );
            })}

            {/* ── Schedule links list ── */}
            {schedList.length > 0 && (
              <div className="bg-[var(--bg-card)] rounded-2xl sm:rounded-3xl shadow-xl border border-[var(--bd)] overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-[var(--bd)] flex items-center gap-2">
                  <Link size={16} className="text-green-400" />
                  <h3 className="text-sm font-bold text-green-400 font-semibold">ลิงก์ตาราง</h3>
                  <span className="text-xs text-gray-500 font-bold ml-1">({schedList.length})</span>
                </div>
                <div className="p-3 sm:p-4 space-y-2">
                  {schedList.map(s => {
                    const url = `${window.location.origin}/?schedule=${s.token}`;
                    const date = s.createdAt?.toDate ? s.createdAt.toDate().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
                    const isEnabled = s.enabled !== false;
                    const createdMs = s.createdAt?.toMillis?.() || 0;
                    const expiresMs = createdMs + 24 * 60 * 60 * 1000;
                    const remainMs = expiresMs - Date.now();
                    const isExpired = remainMs <= 0;
                    const remainHrs = Math.floor(remainMs / (60 * 60 * 1000));
                    const remainMins = Math.floor((remainMs % (60 * 60 * 1000)) / (60 * 1000));
                    const remainText = isExpired ? 'หมดอายุ' : remainHrs > 0 ? `เหลือ ${remainHrs} ชม. ${remainMins} น.` : `เหลือ ${remainMins} น.`;
                    const isDoctor = !s.noDoctorRequired;
                    return (
                      <div key={s.id} className={`rounded-xl border p-3 transition-all ${!isEnabled || isExpired ? 'border-red-900/30 bg-red-950/10 opacity-60' : 'border-[var(--bd)] bg-[var(--bg-hover)]'}`}>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                              <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-bold ${isDoctor ? 'bg-sky-950/40 border border-sky-900/40 text-sky-400' : 'bg-purple-950/40 border border-purple-900/40 text-purple-400'}`}>
                                {isDoctor ? 'พบแพทย์' : 'ไม่พบแพทย์'}
                              </span>
                              {s.selectedDoctorName && (
                                <span className="text-[11px] px-1.5 py-0.5 rounded-full font-bold bg-sky-950/30 border border-sky-800/40 text-sky-300" title="แพทย์ที่เลือก">
                                  🩺 {s.selectedDoctorName}
                                </span>
                              )}
                              {s.selectedRoomName && (
                                <span className="text-[11px] px-1.5 py-0.5 rounded-full font-bold bg-cyan-950/30 border border-cyan-800/40 text-cyan-300 max-w-[180px] truncate" title={`ห้อง: ${s.selectedRoomName}`}>
                                  {isDoctor ? '🩺' : '🛏️'} {s.selectedRoomName}
                                </span>
                              )}
                              {!isDoctor && (
                                <span
                                  className={`text-[11px] px-1.5 py-0.5 rounded-full font-bold ${s.showDoctorStatus ? 'bg-emerald-950/30 border border-emerald-800/40 text-emerald-300' : 'bg-gray-800/40 border border-gray-700/50 text-gray-400'}`}
                                  title={s.showDoctorStatus ? 'ลูกค้าเห็นสถานะหมอว่าง/ไม่ว่าง' : 'ไม่แสดงสถานะหมอให้ลูกค้า'}
                                >
                                  สถานะหมอ: {s.showDoctorStatus ? 'แสดง' : 'ซ่อน'}
                                </span>
                              )}
                              <span className={`text-[11px] font-bold ${isExpired ? 'text-red-400' : remainHrs < 6 ? 'text-orange-400' : 'text-green-400'}`}>{remainText}</span>
                            </div>
                            <div className="text-xs text-[var(--tx-muted)]">{date} · {(s.months || []).length} เดือน · {s.slotDurationMins || 60} นาที/slot</div>
                            <div className="text-xs font-mono text-[var(--tx-muted)] truncate">{s.token}</div>
                          </div>
                          <button onClick={() => { navigator.clipboard.writeText(url); showToast('คัดลอกแล้ว', 2000); }}
                            className="p-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-green-400 transition-colors" title="Copy URL">
                            <ClipboardCheck size={12} />
                          </button>
                          <button onClick={() => handleToggleSchedule(s.token, isEnabled)}
                            className={`p-1.5 rounded-lg border transition-colors ${isEnabled ? 'bg-green-950/30 border-green-900/40 text-green-400 hover:text-green-300' : 'bg-[var(--bg-card)] border-[var(--bd)] text-red-400 hover:text-red-300'}`} title={isEnabled ? 'ปิดลิงก์' : 'เปิดลิงก์'}>
                            {isEnabled ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                          </button>
                          <button onClick={() => { if (confirm('ลบลิงก์นี้?')) handleDeleteSchedule(s.token); }}
                            className="p-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-red-400 transition-colors" title="ลบ">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 xl:gap-8">
          <div className="xl:col-span-1" id="qr-panel">
            {/* 2026-06-01 (AV170): top-24 (was top-8) — clears the now-sticky ~60px top
                menu so this sticky QR sidebar doesn't overlap it when scrolling. */}
            <div className="bg-[var(--bg-surface)] p-4 sm:p-6 lg:p-8 rounded-2xl sm:rounded-3xl border border-[var(--bd)] text-center sticky top-24 shadow-[var(--shadow-panel)] flex flex-col items-center">
              <h2 className="text-sm sm:text-base font-bold font-semibold mb-4 sm:mb-6 flex items-center justify-center gap-2 text-gray-400 w-full">
                <QrCode size={18} style={{color: ac}} /> QR Code / ลิงก์
              </h2>
              {selectedQR ? renderJsxBlock(() => {
                const plToken = activeSessionInfo?.patientLinkToken;
                const plEnabled = activeSessionInfo?.patientLinkEnabled;
                const isPlMode = qrDisplayMode === 'patientLink' && !!plToken;
                const qrSrc = isPlMode ? getPatientLinkQRUrl(plToken) : getQRUrl(selectedQR);
                const linkUrl = isPlMode ? getPatientLinkUrl(plToken) : getSessionUrl(selectedQR);
                const tokenLabel = isPlMode ? 'Patient Link Token' : 'รหัสคิว (Token)';
                const tokenValue = isPlMode ? plToken : selectedQR;
                return (
                <div className="space-y-4 sm:space-y-6 flex flex-col items-center animate-in zoom-in duration-300 w-full px-2 sm:px-0">
                  {/* Mode toggle — show only when patient link token exists */}
                  {plToken && (
                    <div className="flex w-full rounded-xl overflow-hidden border border-[var(--bd)] text-xs font-bold font-semibold">
                      <button onClick={() => setQrDisplayMode('session')} className={`flex-1 py-2 transition-colors ${qrDisplayMode === 'session' ? 'bg-[var(--bg-hover2)] text-[var(--tx-heading)]' : 'text-gray-600 hover:text-gray-400'}`}>QR คิว</button>
                      <button onClick={() => setQrDisplayMode('patientLink')} className={`flex-1 py-2 transition-colors flex items-center justify-center gap-1 ${qrDisplayMode === 'patientLink' ? 'bg-purple-950/40 text-purple-300' : 'text-gray-600 hover:text-purple-400'}`}>
                        <Link size={11}/> ลิงก์ดูข้อมูล
                      </button>
                    </div>
                  )}
                  <div className="p-3 sm:p-4 bg-white rounded-3xl w-full aspect-square max-w-[360px] mx-auto flex items-center justify-center overflow-hidden" style={{boxShadow: `0 0 40px rgba(${acRgb},0.25)`}}>
                    <img src={qrSrc} alt="QR" className="w-full h-full object-contain" />
                  </div>
                  <div className="w-full text-center">
                    <h3 className="text-xl sm:text-2xl font-black text-[var(--tx-heading)] mb-1">{activeSessionInfo?.sessionName || 'ไม่มีชื่อคิว'}</h3>
                    {isPlMode && (
                      <span className={`text-xs font-bold font-semibold px-2 py-0.5 rounded-full ${plEnabled ? 'bg-green-950/40 text-green-400 border border-green-900/30' : 'bg-gray-800 text-gray-500 border border-gray-700'}`}>
                        {plEnabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                      </span>
                    )}
                  </div>
                  <div className="w-full text-left">
                    <p className="text-xs sm:text-xs text-[var(--tx-muted)] font-semibold mb-1.5">{tokenLabel}</p>
                    <p className="font-mono text-sm sm:text-base font-black bg-[var(--bg-input)] px-4 py-3 rounded-xl border border-[var(--bd)] shadow-inner text-center break-all" style={{color: isPlMode ? '#a855f7' : ac}}>{tokenValue}</p>
                  </div>
                  <div className="w-full text-left">
                    <p className="text-xs sm:text-xs text-[var(--tx-muted)] font-semibold mb-1.5">คัดลอกลิงก์ (Copy Link)</p>
                    <div className="flex items-center gap-2">
                      <input readOnly value={linkUrl} className="flex-1 bg-[var(--bg-input)] border border-[var(--bd)] text-[var(--tx-muted)] text-xs sm:text-xs p-3 sm:p-3.5 rounded-xl outline-none font-mono" />
                      <button onClick={() => handleCopyToClipboard(linkUrl, true)} className="bg-[var(--bg-hover)] hover:bg-[var(--bg-hover2)] p-3 sm:p-3.5 rounded-xl border border-[var(--bd)] text-[var(--tx-heading)] transition-colors flex-shrink-0" title="คัดลอกลิงก์">
                        {isLinkCopied ? <CheckCircle2 size={18} className="text-green-500" /> : <ClipboardList size={18} />}
                      </button>
                    </div>
                  </div>
                  <div className="w-full h-px bg-[var(--bd)] my-2"></div>
                  {isPlMode ? (
                    <div className="w-full flex gap-2">
                      <button onClick={() => activeSessionInfo && handleTogglePatientLink(activeSessionInfo)} disabled={patientLinkLoading} className={`flex-1 py-3 rounded-xl text-xs font-bold font-semibold transition-all flex items-center justify-center gap-2 border ${plEnabled ? 'bg-[var(--bg-hover)] border-[var(--bd)] text-gray-400 hover:text-white' : 'bg-green-950/30 border-green-900/50 text-green-400 hover:bg-green-900/40'}`}>
                        {plEnabled ? <><ToggleLeft size={15}/> ปิด</> : <><ToggleRight size={15}/> เปิด</>}
                      </button>
                      <button onClick={() => handleDeletePatientLink(selectedQR)} disabled={patientLinkLoading} className="p-3 rounded-xl border border-red-900/40 text-red-500 hover:bg-red-950/30 transition-colors" title="ลบลิงก์ดูข้อมูล">
                        <Trash2 size={15}/>
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => onSimulateScan(selectedQR)} className="w-full bg-[var(--bg-hover)] hover:bg-[var(--bg-hover2)] border border-[var(--bd)] text-[var(--tx-heading)] py-3.5 sm:py-4 rounded-xl text-xs sm:text-sm font-bold font-semibold transition-all flex items-center justify-center gap-2">
                      <Eye size={16}/> จำลองเปิดกรอกฟอร์ม
                    </button>
                  )}
                </div>
                );
              }) : (
                <div className="py-20 w-full text-gray-600 flex flex-col items-center bg-[var(--bg-elevated)] rounded-2xl border border-dashed border-[var(--bd)]">
                  <Flame size={48} className="mb-4 opacity-20 text-red-500" />
                  <p className="text-xs sm:text-sm font-semibold text-center px-4 leading-relaxed font-bold">กดสร้างคิวใหม่ด้านบน<br/>เพื่อแสดง QR Code และลิงก์</p>
                </div>
              )}
            </div>
          </div>

          <div className="xl:col-span-3 h-full">
            <div className="bg-[var(--bg-surface)] rounded-2xl sm:rounded-3xl shadow-[var(--shadow-panel)] border border-[var(--bd)] overflow-hidden h-full flex flex-col">
              <div className="p-5 sm:p-6 border-b border-[var(--bd)] flex items-center gap-3 bg-[var(--bg-elevated)]">
                <Activity size={20} style={{color: ac}} />
                <h2 className="text-base sm:text-lg font-bold font-semibold text-[var(--tx-heading)]">รายการคิวผู้ป่วย</h2>
              </div>
              {/* ── CARDS (all sizes) ── */}
              <div className="flex-1 divide-y divide-[var(--bd)]">
                {sessions.length === 0 ? (
                  <div className="p-16 text-center text-gray-600 flex flex-col items-center gap-4">
                    <Activity size={36} className="opacity-20" />
                    <p className="text-xs font-bold font-bold">ไม่มีรายการในขณะนี้</p>
                  </div>
                ) : sessions.map(session => {
                  const data = session.patientData;
                  const formType = session.formType || 'intake';
                  const isFollowUp = formType.startsWith('followup_');
                  const isCustom = formType === 'custom';
                  const reasons = getReasons(data);
                  const isPerf = reasons.includes('สมรรถภาพทางเพศ') || formType === 'followup_ed';
                  const isHrt = reasons.includes('เสริมฮอร์โมน') || formType === 'followup_adam' || formType === 'followup_mrs';
                  const timeLeftStr = formatRemainingTime(session);
                  const isLowTime = timeLeftStr.includes('m') && !timeLeftStr.includes('h') && parseInt(timeLeftStr) < 30 && !session.isPermanent;
                  return (
                    <div key={session.id} className={`p-4 flex flex-col gap-3 ${session.isUnread ? 'bg-red-950/10' : ''}`}>
                      {/* Row 1: name + actions */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-col gap-1.5 min-w-0">
                          {editingNameId === session.id ? (
                            <input autoFocus value={editingNameValue}
                              onChange={e => setEditingNameValue(e.target.value)}
                              onBlur={() => saveEditedName(session.id)}
                              onKeyDown={e => e.key === 'Enter' && saveEditedName(session.id)}
                              className="bg-[var(--bg-input)] border border-blue-500 text-[var(--tx-heading)] text-sm px-3 py-1 rounded-lg w-40 outline-none" />
                          ) : (
                            <div className="flex items-center gap-1.5 relative">
                              {session.isUnread && (
                                <span className="text-[11px] px-1.5 py-0.5 rounded bg-red-600 text-white font-black font-semibold animate-pulse shrink-0">New</span>
                              )}
                              <span className="font-bold text-[var(--tx-heading)] text-sm truncate max-w-[160px] sm:max-w-none"><VipName customerId={session.brokerProClinicId}>{session.sessionName || 'ไม่ระบุชื่อ'}</VipName></span>
                              <button onClick={() => handleEditName(session.id, session.sessionName)} className="text-gray-600 hover:text-blue-400 shrink-0"><Edit3 size={12} /></button>
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`font-mono text-xs font-bold bg-[var(--bg-hover)] px-2 py-1 rounded-lg border border-[var(--bd)] ${session.isPermanent ? 'text-orange-500' : 'text-red-500'}`}>{session.id}</span>
                            {getBadgeForFormType(formType, session.customTemplate)}
                          </div>
                        </div>
                        {/* Action buttons */}
                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          <button onClick={() => { setSelectedQR(session.id); setTimeout(() => document.getElementById('qr-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }} className={`p-2 rounded-lg border transition-colors ${selectedQR === session.id ? 'bg-[var(--bg-input)] border-gray-400 text-white' : 'bg-[var(--bg-hover)] hover:bg-[var(--bg-input)] text-gray-400 hover:text-[var(--tx-heading)] border-[var(--bd)]'}`} title="QR"><QrCode size={15} /></button>
                          {/* V87 (2026-05-18 EOD+11) — AV84 OPD-save guard.
                              Mirrors the sibling history-view wrapper (line 6080).
                              Patient-link button promises customer-view of saved
                              OPD data; before save there is no data to link to,
                              so the button MUST stay hidden. V12 multi-reader-
                              sweep at the action-button boundary. */}
                          {session.opdRecordedAt && session.brokerStatus === 'done' && (
                          <button
                            onClick={() => setPatientLinkModal(session.id)}
                            title={session.patientLinkToken ? (session.patientLinkEnabled ? 'ลิงก์ดูข้อมูล: เปิดใช้งาน' : 'ลิงก์ดูข้อมูล: ปิดใช้งาน') : 'สร้างลิงก์ดูข้อมูล'}
                            className={`p-2 rounded-lg border transition-all ${
                              session.patientLinkToken && session.patientLinkEnabled ? 'bg-purple-950/30 text-purple-400 border-purple-900/50' :
                              session.patientLinkToken ? 'bg-[var(--bg-hover)] text-gray-500 border-[var(--bd)] opacity-60' :
                              'bg-[var(--bg-hover)] text-gray-600 border-dashed border-[var(--bd)] hover:text-gray-400'
                            }`}
                          >
                            {session.patientLinkToken && !session.patientLinkEnabled ? <Unlink size={15}/> : <Link size={15}/>}
                          </button>
                          )}
                          {session.status === 'completed' && data && (
                            <button onClick={() => handleViewSession(session)} className="p-2 bg-blue-950/30 hover:bg-blue-900/50 text-blue-400 hover:text-blue-300 rounded-lg border border-blue-900/50 transition-colors" title="ดูข้อมูล"><FileText size={15} /></button>
                          )}
                          {/* RP1 lift (2026-04-30) — extracted from JSX-IIFE per Vite-OXC ban. */}
                          {session.status === 'completed' && data && renderOpdButton(session)}
                          {session.formType === 'deposit' && session.serviceCompleted && (
                            <button onClick={() => setDepositToDelete({ session, action: 'cancel' })} className="p-2 bg-red-950/30 hover:bg-red-900/50 text-red-400 hover:text-red-300 rounded-lg border border-red-900/50 transition-colors" title="ยกเลิกการจอง (ลบมัดจำ + ข้อมูลลูกค้า)"><XCircle size={15} /></button>
                          )}
                          {session.patientData && session.opdRecordedAt && session.brokerStatus === 'done' ? (
                            <button onClick={() => setSessionToDelete(session.id)} className="p-2 bg-emerald-950/30 hover:bg-emerald-900/50 text-emerald-400 rounded-lg border border-emerald-900/50 transition-colors" title="ลูกค้ามารับบริการเรียบร้อยแล้ว"><CheckCircle2 size={15} /></button>
                          ) : (
                            <button onClick={() => setSessionToDelete(session.id)} className="p-2 bg-red-950/30 hover:bg-red-900/50 text-red-500 rounded-lg border border-red-900/50 transition-colors" title="ลบ"><Trash2 size={15} /></button>
                          )}
                        </div>
                      </div>
                      {/* Row 2: time + QR timestamp */}
                      <div className="flex flex-wrap items-center gap-3">
                        <span className={`text-xs flex items-center gap-1 font-bold font-semibold ${isLowTime ? 'text-red-500 animate-pulse' : 'text-gray-500'}`}>
                          {session.isPermanent ? <Link size={11} /> : <Clock size={11} />} {timeLeftStr}
                        </span>
                        {session.createdAt && (
                          <span className="text-xs text-gray-600 flex items-center gap-1 font-mono">
                            <QrCode size={9}/> {formatBangkokTime(session.createdAt)}
                          </span>
                        )}
                      </div>
                      {/* Row 3: patient info */}
                      {data ? (
                        <div className="flex flex-col gap-2 bg-[var(--bg-card)] rounded-xl p-3 border border-[var(--bd)]">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-[var(--tx-heading)] text-sm"><VipName customerId={session.brokerProClinicId}>{data.prefix !== 'ไม่ระบุ' ? data.prefix : ''} {data.firstName} {data.lastName}</VipName></span>
                            {isPerf && <Flame size={14} className="text-red-500" />}
                            {isHrt && <Activity size={14} className="text-orange-500" />}
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs text-gray-500 font-mono font-semibold">
                            <span>อายุ: {data.age || '-'} ปี</span>
                            {!isFollowUp && !isCustom && <span>โทร: <PhoneLink value={formatPhoneNumberDisplay(data.phone, data.isInternationalPhone, data.phoneCountryCode)}>{formatPhoneNumberDisplay(data.phone, data.isInternationalPhone, data.phoneCountryCode)}</PhoneLink></span>}
                            {(isFollowUp || isCustom) && <span className="text-orange-400">ประเมิน: {data.assessmentDate || '-'}</span>}
                          </div>
                          {/* Reasons */}
                          {isCustom ? (
                            <span className="text-xs font-bold text-cyan-400">แบบฟอร์มเฉพาะทาง: {session.customTemplate?.title || 'Custom'}</span>
                          ) : isFollowUp ? (
                            <span className="text-[11px] font-bold text-gray-400">
                              {formType === 'followup_ed' && 'ประเมินภาวะเสื่อมสมรรถภาพ (IIEF-5)'}
                              {formType === 'followup_adam' && 'ประเมินภาวะพร่องฮอร์โมนชาย (ADAM)'}
                              {formType === 'followup_mrs' && 'ประเมินอาการวัยทองหญิง (MRS)'}
                            </span>
                          ) : (
                            <div className="flex flex-col gap-1.5">
                              <div className="flex flex-wrap gap-1">
                                {reasons.map(r => (
                                  <span key={r} className="text-xs font-bold text-gray-300 bg-[var(--bg-hover)] px-2 py-0.5 rounded-lg border border-[var(--bd)] whitespace-nowrap">
                                    {r === 'อื่นๆ' ? `อื่นๆ: ${data.visitReasonOther}` : r}
                                  </span>
                                ))}
                              </div>
                              {isHrt && getHrtGoals(data).length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {getHrtGoals(data).map(g => (
                                    <span key={g} className="text-xs font-bold text-orange-400 border border-orange-900/30 bg-orange-950/20 px-2 py-0.5 rounded-md">
                                      {g === 'ฮอร์โมนเพื่อการข้ามเพศ' ? 'ข้ามเพศ' : g}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {data.hasAllergies === 'มี' && (
                                <span className="text-xs text-red-400 flex items-center gap-1 font-bold font-semibold border border-red-900/50 bg-red-950/20 px-2 py-0.5 rounded-lg w-fit">
                                  <AlertCircle size={10}/> แพ้: {data.allergiesDetail}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-600 text-xs italic font-semibold">รอผู้ป่วยกรอกข้อมูล...</span>
                      )}
                      {/* Row 4: status */}
                      <div className="flex flex-wrap items-center gap-2">
                        {session.status === 'completed' ? (
                          <>
                            {session.updatedAt ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black font-semibold bg-blue-950/40 text-blue-400 border border-blue-900/50 whitespace-nowrap">
                                <Edit3 size={11} /> มีการแก้ไข
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black font-semibold bg-green-950/40 text-green-500 border border-green-900/50 whitespace-nowrap">
                                <CheckCircle2 size={11} /> รับข้อมูลแล้ว
                              </span>
                            )}
                            {session.updatedAt && formatBangkokTime(session.updatedAt) && (
                              <span className="text-xs text-blue-400 flex items-center gap-1 font-mono">
                                <Edit3 size={9}/> {formatBangkokTime(session.updatedAt)}
                              </span>
                            )}
                            {!session.updatedAt && session.submittedAt && (
                              <span className="text-xs text-green-500 flex items-center gap-1 font-mono">
                                <CheckCircle2 size={9}/> {formatBangkokTime(session.submittedAt)}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black font-semibold bg-orange-950/30 text-orange-500 border border-orange-900/50 whitespace-nowrap">
                            <Clock size={11} /> กำลังรอ
                          </span>
                        )}
                      </div>
                      {/* OPD Recorded Badge */}
                      {session.opdRecordedAt && session.brokerStatus === 'done' && (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--opd-bg)] border border-[var(--opd-bd)] w-full">
                          <ClipboardCheck size={14} className="text-[var(--opd-color)] shrink-0" />
                          <div className="flex flex-col min-w-0 gap-0.5">
                            <span className="text-xs font-black font-semibold text-[var(--opd-color)]">บันทึกลง OPD Card เรียบร้อย</span>
                            <span className="text-[11px] text-[var(--opd-color)] font-mono flex items-center gap-1.5">
                              {formatBangkokTime(session.opdRecordedAt)}
                              {/* Phase 20.0 final ProClinic strip (2026-05-06) —
                                   external ProClinic link REMOVED. HN badge stays
                                   (hn_no is now denormalized from be_customers). */}
                              {session.brokerProClinicHN && <span className="px-1 py-px rounded bg-[var(--opd-btn-bg)] border border-[var(--opd-bd)] font-black">HN {session.brokerProClinicHN}</span>}
                            </span>
                            {session.brokerLastAutoSyncAt && (
                              <span className="text-[8px] text-[var(--opd-color)] opacity-70 font-mono flex items-center gap-1">
                                🔄 ซิงค์อัตโนมัติ · {formatBangkokTime(session.brokerLastAutoSyncAt)}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Session Result Viewer */}
      {/* RP1 lift (2026-04-30) — extracted from JSX-IIFE per Vite-OXC ban. */}
      {viewingSession && renderViewingSessionModal()}
      {/* Treatment Create/Edit Full Page */}
      {treatmentFormMode && (
        <TreatmentFormPage
          mode={treatmentFormMode.mode || 'create'}
          customerId={treatmentFormMode.customerId}
          treatmentId={treatmentFormMode.treatmentId}
          patientName={treatmentFormMode.patientName}
          patientData={treatmentFormMode.patientData}
          initialTreatmentDate={treatmentFormMode.appointmentDate || ''}
          isDark={isDark}
          db={db}
          appId={appId}
          onClose={() => setTreatmentFormMode(null)}
          onSaved={(savedTreatmentId) => {
            // appointment-loop R4 (2026-06-03) — persist the appt→treatment link so
            // the hub card reliably knows the appointment was treated (vs the fragile
            // date-match heuristic) → no accidental 2nd treatment → no double charge.
            // Best-effort fire-and-forget (the treatment already saved). Only fires
            // for create-FROM-appointment (treatmentFormMode.appointmentId set).
            const srcApptId = treatmentFormMode?.appointmentId || '';
            setTreatmentFormMode(null);
            setAutoExpandTreatmentId(savedTreatmentId || '');
            setTreatmentRefreshKey(k => k + 1);
            if (srcApptId && savedTreatmentId) {
              (async () => {
                try {
                  const { updateBackendAppointment } = await import('../lib/scopedDataLayer.js');
                  await updateBackendAppointment(srcApptId, { linkedTreatmentId: savedTreatmentId });
                } catch (e) { console.warn('[onSaved] appt linkedTreatmentId stamp failed (best-effort):', e); }
              })();
            }
          }}
        />
      )}

      {/* Unified Create Session Modal */}
      {showSessionModal && (
        <div className="fixed inset-0 bg-[var(--overlay-bg)] backdrop-blur-sm flex items-center justify-center p-4 z-[60]" onClick={() => setShowSessionModal(false)}>
           <div className="bg-[var(--bg-card)] rounded-2xl shadow-[var(--shadow-modal)] border border-[var(--bd)] w-full max-w-lg overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="p-5 sm:p-6 pb-0">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-base sm:text-lg font-black text-[var(--tx-heading)] tracking-tight">สร้างคิวใหม่</h2>
                  <button onClick={() => setShowSessionModal(false)} className="p-1.5 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-[var(--tx-heading)] transition-colors"><X size={14} /></button>
                </div>
                <p className="text-[11px] text-[var(--tx-muted)]">เลือกประเภทแบบฟอร์มที่ต้องการ</p>
                {/* Tabs */}
                <div className="flex mt-4 bg-[var(--bg-hover)] rounded-lg p-0.5 border border-[var(--bd)]">
                  <button onClick={() => setSessionModalTab('standard')} className={`flex-1 py-2 text-[11px] font-bold font-semibold rounded-md transition-all ${sessionModalTab === 'standard' ? 'bg-[var(--bg-card)] text-[var(--tx-heading)] shadow-sm' : 'text-[var(--tx-muted)] hover:text-[var(--tx-body)]'}`}>ฟอร์มมาตรฐาน</button>
                  <button onClick={() => setSessionModalTab('custom')} className={`flex-1 py-2 text-[11px] font-bold font-semibold rounded-md transition-all ${sessionModalTab === 'custom' ? 'bg-[var(--bg-card)] text-[var(--tx-heading)] shadow-sm' : 'text-[var(--tx-muted)] hover:text-[var(--tx-body)]'}`}>ฟอร์มสร้างเอง</button>
                </div>
              </div>

              <div className="p-5 sm:p-6 max-h-[55vh] overflow-y-auto">
                 {sessionModalTab === 'standard' ? (
                   <div className="space-y-3">
                     {/* Primary actions */}
                     {/* V87 (2026-05-18 EOD+11): reordered จองมัดจำ → จองไม่มัดจำ → คิว Walk-in
                         + renamed "OPD Intake" → "คิว Walk-in" per user directive.
                         Handlers unchanged — pure cosmetic reorder + label swap. */}
                     <div className="grid grid-cols-3 gap-3">
                        <button onClick={() => { setShowSessionModal(false); if (!depositOptions) fetchDepositOptions(); setShowDepositForm(true); }} className={`p-4 text-left rounded-xl transition-all group border-2 hover:shadow-lg ${isDark ? 'bg-[var(--bg-hover)] border-[var(--bd)] hover:border-emerald-500/50' : 'bg-white border-gray-200 hover:border-emerald-400 shadow-sm'}`}>
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2.5 ${isDark ? 'bg-emerald-950/50 text-emerald-400' : 'bg-emerald-50 text-emerald-500'}`}>
                            <Banknote size={16} />
                          </div>
                          <span className="block text-[var(--tx-heading)] font-bold text-sm">จองมัดจำ</span>
                          <span className="text-xs text-[var(--tx-muted)] mt-1 block leading-relaxed">ลูกค้าจอง<br/>ลิงก์ถาวร</span>
                        </button>
                        <button onClick={() => { setShowSessionModal(false); if (!depositOptions) fetchDepositOptions(); setEditingAppointment(null); setNoDepositFormData({ sessionName: '', appointmentDate: todayISO(), appointmentStartTime: '', appointmentEndTime: '', advisor: '', doctor: '', assistant: '', room: '', source: '', visitPurpose: [], visitPurposeOther: '', customerNameTemp: '', customerPhoneTemp: '' }); setShowNoDepositForm(true); }} className={`p-4 text-left rounded-xl transition-all group border-2 hover:shadow-lg ${isDark ? 'bg-[var(--bg-hover)] border-[var(--bd)] hover:border-orange-500/50' : 'bg-white border-gray-200 hover:border-orange-400 shadow-sm'}`}>
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2.5 ${isDark ? 'bg-orange-950/50 text-orange-400' : 'bg-orange-50 text-orange-500'}`}>
                            <UserPlus size={16} />
                          </div>
                          <span className="block text-[var(--tx-heading)] font-bold text-sm">จองไม่มัดจำ</span>
                          <span className="text-xs text-[var(--tx-muted)] mt-1 block leading-relaxed">ลูกค้าจองล่วงหน้า<br/>นัดหมาย ProClinic</span>
                        </button>
                        <button onClick={() => openNamePrompt({isPermanent: false, formType: 'intake'})} className={`p-4 text-left rounded-xl transition-all group border-2 hover:shadow-lg ${isDark ? 'bg-[var(--bg-hover)] border-[var(--bd)] hover:border-red-500/50' : 'bg-white border-gray-200 hover:border-red-400 shadow-sm'}`}>
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2.5 ${isDark ? 'bg-red-950/50 text-red-400' : 'bg-red-50 text-red-500'}`}>
                            <ClipboardCheck size={16} />
                          </div>
                          <span className="block text-[var(--tx-heading)] font-bold text-sm">คิว Walk-in</span>
                          <span className="text-xs text-[var(--tx-muted)] mt-1 block leading-relaxed">บันทึกผู้ป่วยใหม่<br/>หมดอายุ 2 ชม.</span>
                        </button>
                     </div>

                     {/* Follow-up section */}
                     <div className={`mt-2 pt-3 border-t ${isDark ? 'border-[var(--bd)]' : 'border-gray-200'}`}>
                       <h4 className="text-xs font-black text-[var(--tx-muted)] font-semibold mb-2.5">Follow-up — ลิงก์ถาวร</h4>
                       <div className="space-y-2">
                         {[
                           { formType: 'followup_ed', label: 'เสื่อมสมรรถภาพทางเพศ (ชาย)', sub: 'IIEF-5 Score' },
                           { formType: 'followup_adam', label: 'ภาวะพร่องฮอร์โมน (ชาย)', sub: 'ADAM Score' },
                           { formType: 'followup_mrs', label: 'อาการวัยทอง (หญิง)', sub: 'MRS Score' },
                         ].map((fu, idx) => (
                           <button key={fu.formType} onClick={() => openNamePrompt({isPermanent: true, formType: fu.formType})}
                             className={`w-full p-3 text-left rounded-xl transition-all flex items-center gap-3 group ${isDark ? 'bg-[var(--bg-hover)] border border-[var(--bd)] hover:border-orange-500/50' : 'bg-white border border-gray-200 hover:border-orange-400 shadow-sm'}`}>
                             <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${isDark ? 'bg-orange-950/50 text-orange-400' : 'bg-orange-50 text-orange-500'}`}>{idx + 1}</span>
                             <div className="min-w-0">
                               <span className={`block text-sm font-bold truncate ${isDark ? 'text-[var(--tx-body)] group-hover:text-orange-400' : 'text-[var(--tx-heading)] group-hover:text-orange-600'} transition-colors`}>{fu.label}</span>
                               <span className="text-xs text-[var(--tx-muted)]">{fu.sub}</span>
                             </div>
                           </button>
                         ))}
                       </div>
                     </div>
                   </div>
                 ) : (
                   <div className="space-y-3">
                     {formTemplates.length === 0 ? (
                       <div className="text-center py-10 text-[var(--tx-muted)]">
                         <LayoutTemplate size={32} className="mx-auto mb-3 opacity-30" />
                         <p className="text-sm font-medium mb-1">ยังไม่มีแบบฟอร์ม</p>
                         <button onClick={() => {setShowSessionModal(false); setAdminMode('formBuilder');}} className="text-sky-500 hover:text-sky-400 text-xs font-bold">สร้างแบบฟอร์มใหม่</button>
                       </div>
                     ) : (
                       <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                         {formTemplates.map(tpl => (
                           <div key={tpl.id} className={`rounded-xl p-4 flex flex-col justify-between border ${isDark ? 'bg-[var(--bg-hover)] border-[var(--bd)]' : 'bg-white border-gray-200 shadow-sm'}`}>
                             <div>
                               <h4 className="text-[var(--tx-heading)] font-bold text-sm mb-1">{tpl.title}</h4>
                               <p className="text-[var(--tx-muted)] text-xs mb-3 truncate">{tpl.description}</p>
                             </div>
                             <div className="flex gap-2 mt-2">
                               <button onClick={() => openNamePrompt({isPermanent: false, formType: 'custom', customTemplate: tpl})} className="flex-1 py-2 rounded-lg text-xs font-bold transition-all border" style={{background:'transparent', borderColor:`${ac}66`, color:ac}} onMouseEnter={e=>{e.currentTarget.style.background=ac;e.currentTarget.style.borderColor=ac;e.currentTarget.style.color='#fff'}} onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.borderColor=`${ac}66`;e.currentTarget.style.color=ac}}>คิว 2 ชม.</button>
                               <button onClick={() => openNamePrompt({isPermanent: true, formType: 'custom', customTemplate: tpl})} className="flex-1 py-2 rounded-lg text-xs font-bold transition-all border flex items-center justify-center gap-1" style={{background:ac, borderColor:ac, color:'#fff'}} onMouseEnter={e=>{e.currentTarget.style.opacity='0.85'}} onMouseLeave={e=>{e.currentTarget.style.opacity='1'}}><Link size={10}/> ถาวร</button>
                             </div>
                           </div>
                         ))}
                       </div>
                     )}
                   </div>
                 )}
              </div>
           </div>
        </div>
      )}

      {/* Name Prompt Modal for New Session */}
      {/* ══ Deposit Creation Form Modal ══════════════════════════════════════════ */}
      {showDepositForm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[70]">
          <div className="bg-[var(--bg-elevated)] rounded-xl w-full max-w-lg max-h-[85vh] overflow-y-auto border border-emerald-900/50 shadow-2xl animate-in zoom-in-95">
            <div className="sticky top-0 bg-[var(--bg-elevated)] border-b border-emerald-900/30 p-4 flex items-center justify-between z-10">
              <h3 className="text-lg font-black text-emerald-400 flex items-center gap-2"><Banknote size={20}/> สร้างคิวลูกค้าจอง</h3>
              <button onClick={() => setShowDepositForm(false)} className="text-gray-500 hover:text-white"><X size={18}/></button>
            </div>
            <div className="p-4 space-y-4">
              {depositOptionsLoading ? (
                <div className="text-center py-12"><Loader2 size={32} className="animate-spin text-emerald-500 mx-auto mb-3"/><p className="text-gray-500 text-sm">กำลังโหลดข้อมูลจาก ProClinic...</p></div>
              ) : (
                <>
                  {/* ชื่อคิว */}
                  <div>
                    <label className="text-xs text-gray-500 font-semibold block mb-1">ชื่อคิว / Note</label>
                    <input type="text" value={depositFormData.sessionName} onChange={e => setDepositFormData(p => ({...p, sessionName: e.target.value}))} placeholder="เช่น คุณ A จอง HRT" className="w-full bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white rounded-lg px-3 py-2.5 text-sm outline-none focus:border-emerald-600"/>
                  </div>

                  {/* Phase 24.0-terdecies (2026-05-06) — "เลือกลูกค้าภายหลัง"
                      flow: explicit booking-time name + phone. Persisted on
                      opd_sessions.depositData.customerNameTemp/PhoneTemp +
                      pair-write to be_deposits + be_appointments. Visible on
                      session card list + Finance.มัดจำ row even before a
                      customer doc is linked. */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 font-semibold block mb-1">ชื่อลูกค้า <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        value={depositFormData.customerNameTemp}
                        onChange={e => setDepositFormData(p => ({...p, customerNameTemp: e.target.value}))}
                        placeholder="เช่น คุณสมชาย ใจดี"
                        maxLength={120}
                        data-testid="deposit-customer-name-temp"
                        className="w-full bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white rounded-lg px-3 py-2.5 text-sm outline-none focus:border-emerald-600"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 font-semibold block mb-1">เบอร์โทร <span className="text-red-500">*</span></label>
                      <input
                        type="tel"
                        inputMode="tel"
                        value={depositFormData.customerPhoneTemp}
                        onChange={e => setDepositFormData(p => ({...p, customerPhoneTemp: e.target.value}))}
                        placeholder="08x-xxx-xxxx"
                        maxLength={20}
                        data-testid="deposit-customer-phone-temp"
                        className="w-full bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white rounded-lg px-3 py-2.5 text-sm outline-none focus:border-emerald-600 font-mono"
                      />
                    </div>
                  </div>

                  {/* ช่องทางชำระเงิน */}
                  <div>
                    <label className="text-xs text-gray-500 font-semibold block mb-1">ช่องทางชำระเงิน</label>
                    <select value={depositFormData.paymentChannel} onChange={e => setDepositFormData(p => ({...p, paymentChannel: e.target.value}))} className="w-full bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white rounded-lg px-3 py-2.5 text-sm outline-none focus:border-emerald-600">
                      <option value="">-- เลือกช่องทาง --</option>
                      {(depositOptions?.paymentMethods || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>

                  {/* ยอดชำระ */}
                  <div>
                    <label className="text-xs text-gray-500 font-semibold block mb-1">ยอดชำระ (บาท) <span className="text-red-500">*</span></label>
                    {/* Phase 24.0-vicies-quater (2026-05-06) — switched from
                        type="number" to type="text" + inputMode="numeric" +
                        digit-sanitizer. type="number" reacts to mouse-wheel
                        scroll + arrow keys — accidental wheel scrolled
                        2000 → 1999, arrow ↓ took 1000 → 998 across multi-
                        keystrokes. User report: "บั๊คการแสดงผลการจองมัดจำ
                        ใน front end กรอก 2000 แสดง 1999 บางทีกรอก 1000
                        แสดง 998". Sanitizer also defends against locale
                        autofill (e.g. browser autofill of "2,000.00").
                        onWheel blur is defense-in-depth in case some
                        future revert reintroduces type="number". */}
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={depositFormData.paymentAmount}
                      onChange={e => {
                        const sanitized = String(e.target.value).replace(/[^\d.]/g, '');
                        setDepositFormData(p => ({...p, paymentAmount: sanitized}));
                      }}
                      onWheel={e => e.target.blur()}
                      placeholder=""
                      className="w-full bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white rounded-lg px-3 py-2.5 text-sm outline-none focus:border-emerald-600"
                    />
                  </div>

                  {/* วันที่ + เวลา */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 font-semibold block mb-1">วันที่จ่ายมัดจำ</label>
                      <DateField value={depositFormData.depositDate} onChange={v => setDepositFormData(p => ({...p, depositDate: v}))} fieldClassName="w-full bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white rounded-lg px-3 py-2.5 text-sm outline-none focus:border-emerald-600"/>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 font-semibold block mb-1">เวลา</label>
                      <input type="time" value={depositFormData.depositTime} onChange={e => setDepositFormData(p => ({...p, depositTime: e.target.value}))} className="w-full bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white rounded-lg px-3 py-2.5 text-sm outline-none focus:border-emerald-600"/>
                    </div>
                  </div>

                  {/* พนักงานขาย */}
                  <div>
                    <label className="text-xs text-gray-500 font-semibold block mb-1">พนักงานขาย</label>
                    <select value={depositFormData.salesperson} onChange={e => setDepositFormData(p => ({...p, salesperson: e.target.value}))} className="w-full bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white rounded-lg px-3 py-2.5 text-sm outline-none focus:border-emerald-600">
                      <option value="">-- เลือก --</option>
                      {(depositOptions?.sellers || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>

                  {/* นัดหมาย toggle */}
                  <div className="border-t border-[var(--bd)] pt-4">
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-300">
                      <input type="checkbox" checked={depositFormData.hasAppointment} onChange={e => setDepositFormData(p => ({...p, hasAppointment: e.target.checked}))} className="w-4 h-4 rounded"/>
                      <CalendarClock size={14} className="text-blue-400"/> มีการนัดหมาย
                    </label>
                  </div>

                  {/* Phase 24.0-quaterdecies (2026-05-06) — when "มีการนัดหมาย"
                      is checked, the appointment subform mirrors the no-deposit
                      modal's required-fields set: วันนัด / เริ่ม / สิ้นสุด /
                      ที่ปรึกษา / ช่องทางนัดหมาย are required. แพทย์ /
                      ผู้ช่วยแพทย์ / ห้องตรวจ stay optional. */}
                  {depositFormData.hasAppointment && (
                    <div className="space-y-3 pl-2 border-l-2 border-blue-900/50 ml-2">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">วันนัด <span className="text-red-500">*</span></label>
                          <DateField value={depositFormData.appointmentDate} onChange={v => setDepositFormData(p => ({...p, appointmentDate: v}))} fieldClassName="w-full bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-600"/>
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          <div>
                            <label className="text-xs text-gray-500 block mb-1">เริ่ม <span className="text-red-500">*</span></label>
                            <select value={depositFormData.appointmentStartTime} onChange={e => setDepositFormData(p => ({...p, appointmentStartTime: e.target.value}))} className="w-full bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white rounded-lg px-2 py-2 text-xs outline-none">
                              <option value="">--</option>
                              {/* Phase 29.23-bis2 — V53 BS-12 per-branch open-hours filter. */}
                              {depositFormData.appointmentStartTime && !depositFormVisibleSlots.includes(depositFormData.appointmentStartTime) && (
                                <option value={depositFormData.appointmentStartTime}>{depositFormData.appointmentStartTime} (นอกเวลา)</option>
                              )}
                              {depositFormVisibleSlots.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 block mb-1">สิ้นสุด <span className="text-red-500">*</span></label>
                            <select value={depositFormData.appointmentEndTime} onChange={e => setDepositFormData(p => ({...p, appointmentEndTime: e.target.value}))} className="w-full bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white rounded-lg px-2 py-2 text-xs outline-none">
                              <option value="">--</option>
                              {depositFormData.appointmentEndTime && !depositFormVisibleSlots.includes(depositFormData.appointmentEndTime) && (
                                <option value={depositFormData.appointmentEndTime}>{depositFormData.appointmentEndTime} (นอกเวลา)</option>
                              )}
                              {depositFormVisibleSlots.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">ที่ปรึกษา <span className="text-red-500">*</span></label>
                        <select value={depositFormData.consultant} onChange={e => setDepositFormData(p => ({...p, consultant: e.target.value}))} className="w-full bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white rounded-lg px-3 py-2 text-sm outline-none">
                          <option value="">-- เลือก --</option>
                          {(depositOptions?.advisors || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">แพทย์/ผู้ช่วยแพทย์</label>
                        <select value={depositFormData.doctor} onChange={e => setDepositFormData(p => ({...p, doctor: e.target.value}))} className="w-full bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white rounded-lg px-3 py-2 text-sm outline-none">
                          <option value="">-- เลือก --</option>
                          {(depositOptions?.doctors || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">ผู้ช่วยแพทย์</label>
                        <select value={depositFormData.assistant} onChange={e => setDepositFormData(p => ({...p, assistant: e.target.value}))} className="w-full bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white rounded-lg px-3 py-2 text-sm outline-none">
                          <option value="">-- เลือก --</option>
                          {(depositOptions?.assistants || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">ห้องตรวจ</label>
                        <select value={depositFormData.room} onChange={e => setDepositFormData(p => ({...p, room: e.target.value}))} className="w-full bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white rounded-lg px-3 py-2 text-sm outline-none">
                          <option value="">-- เลือก --</option>
                          {(depositOptions?.rooms || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">ช่องทางนัดหมาย <span className="text-red-500">*</span></label>
                        <select value={depositFormData.appointmentChannel} onChange={e => setDepositFormData(p => ({...p, appointmentChannel: e.target.value}))} className="w-full bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white rounded-lg px-3 py-2 text-sm outline-none">
                          <option value="">-- เลือก --</option>
                          {(depositOptions?.appointmentChannels || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* นัดมาเพื่อ — visit purpose. Required only when hasAppointment. */}
                  <div className="border-t border-[var(--bd)] pt-4">
                    <label className="text-xs text-gray-500 font-semibold block mb-2">นัดมาเพื่อ {depositFormData.hasAppointment && <span className="text-red-500">*</span>}</label>
                    <div className="flex flex-wrap gap-2">
                      {VISIT_REASON_VALUES.map(r => (
                        <button key={r} type="button"
                          onClick={() => setDepositFormData(p => {
                            const has = p.visitPurpose.includes(r);
                            return {
                              ...p,
                              visitPurpose: has ? p.visitPurpose.filter(x=>x!==r) : [...p.visitPurpose, r],
                              // Phase 24.0-undecies — clear the free-text detail
                              // when "อื่นๆ" is unchecked so stale text doesn't
                              // persist across toggle.
                              visitPurposeOther: (r === 'อื่นๆ' && has) ? '' : p.visitPurposeOther,
                            };
                          })}
                          className={`text-xs px-2.5 py-1.5 rounded-lg border font-bold transition-all ${depositFormData.visitPurpose.includes(r) ? 'bg-emerald-900/40 border-emerald-600 text-emerald-300' : 'bg-[var(--bg-card)] border-[var(--bd)] text-gray-500 hover:text-gray-300'}`}
                        >{r}</button>
                      ))}
                    </div>
                    {/* Phase 24.0-undecies — free-text detail when "อื่นๆ" is selected. */}
                    {depositFormData.visitPurpose.includes('อื่นๆ') && (
                      <div className="mt-3" data-testid="deposit-visit-purpose-other-wrap">
                        <label className="text-xs text-gray-500 font-semibold block mb-1">ระบุ "อื่นๆ"</label>
                        <input
                          type="text"
                          value={depositFormData.visitPurposeOther}
                          onChange={e => setDepositFormData(p => ({...p, visitPurposeOther: e.target.value}))}
                          placeholder="เช่น ผ่ามุก, ตรวจสุขภาพ, ฯลฯ"
                          maxLength={120}
                          data-testid="deposit-visit-purpose-other-input"
                          className="w-full bg-[var(--bg-card)] border border-emerald-700/50 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500"
                        />
                      </div>
                    )}
                  </div>

                  {/* Submit */}
                  <div className="flex gap-3 pt-4 border-t border-[var(--bd)]">
                    <button onClick={() => setShowDepositForm(false)} className="flex-1 px-4 py-3 bg-[var(--bg-hover)] hover:bg-[var(--bg-hover)] text-gray-300 rounded-lg font-bold text-xs uppercase border border-[var(--bd-strong)]">ยกเลิก</button>
                    {/* Phase 24.0-quaterdecies (2026-05-06) — submit-gate
                        mirrors the no-deposit modal's required-fields set
                        when hasAppointment is checked: ที่ปรึกษา /
                        ช่องทางนัดหมาย / นัดมาเพื่อ / วันนัด / เริ่ม /
                        สิ้นสุด are required. แพทย์ / ผู้ช่วยแพทย์ / ห้องตรวจ
                        stay optional. customerNameTemp (ชื่อลูกค้า) is
                        required regardless. */}
                    <button
                      onClick={confirmCreateDeposit}
                      disabled={
                        isGenerating
                        || !depositFormData.customerNameTemp?.trim()
                        || !depositFormData.paymentAmount
                        || (depositFormData.hasAppointment && (
                          !depositFormData.appointmentDate
                          || !depositFormData.appointmentStartTime
                          || !depositFormData.appointmentEndTime
                          || !depositFormData.consultant
                          || !depositFormData.appointmentChannel
                          || depositFormData.visitPurpose.length === 0
                        ))
                      }
                      className="flex-1 px-4 py-3 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg font-bold text-xs uppercase disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isGenerating ? <><Loader2 size={14} className="animate-spin"/> สร้าง...</> : <><Banknote size={14}/> สร้างคิวจอง</>}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ No-Deposit Appointment Form Modal ══════════════════════════════════ */}
      {showNoDepositForm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[70]">
          <div className={`rounded-xl w-full max-w-lg max-h-[85vh] overflow-y-auto animate-in zoom-in-95 ${isDark ? 'bg-[var(--bg-elevated)] border border-orange-900/50 shadow-2xl' : 'bg-white border border-pink-200 shadow-xl'}`}>
            <div className={`sticky top-0 border-b p-4 flex items-center justify-between z-10 ${isDark ? 'bg-[var(--bg-elevated)] border-orange-900/30' : 'bg-white border-pink-200'}`}>
              <h3 className={`text-lg font-black flex items-center gap-2 ${isDark ? 'text-orange-400' : 'text-pink-600'}`}><UserPlus size={20}/> {editingAppointment ? 'แก้ไขนัดหมาย' : 'จองไม่มัดจำ + นัดหมาย'}</h3>
              <button onClick={() => { setShowNoDepositForm(false); setEditingAppointment(null); }} className={`${isDark ? 'text-gray-500 hover:text-white' : 'text-gray-400 hover:text-gray-700'}`}><X size={18}/></button>
            </div>
            <div className="p-4 space-y-4">
              {depositOptionsLoading ? (
                <div className="text-center py-12"><Loader2 size={32} className="animate-spin text-orange-500 mx-auto mb-3"/><p className="text-gray-500 text-sm">กำลังโหลดข้อมูลจาก ProClinic...</p></div>
              ) : (
                <>
                  {/* ชื่อคิว */}
                  <div>
                    <label className="text-xs text-gray-500 font-semibold block mb-1">ชื่อคิว / Note</label>
                    <input type="text" value={noDepositFormData.sessionName} onChange={e => setNoDepositFormData(p => ({...p, sessionName: e.target.value}))} placeholder="เช่น คุณ A จอง HRT" className={`w-full rounded-lg px-3 py-2.5 text-sm outline-none ${isDark ? 'bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white focus:border-orange-600' : 'bg-pink-50 border border-pink-200 text-gray-900 focus:border-pink-500'}`}/>
                  </div>

                  {/* Phase 24.0-terdecies (2026-05-06) — "เลือกลูกค้าภายหลัง"
                      flow: explicit booking-time name + phone (mirror of
                      deposit modal pattern). */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 font-semibold block mb-1">ชื่อลูกค้า <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        value={noDepositFormData.customerNameTemp}
                        onChange={e => setNoDepositFormData(p => ({...p, customerNameTemp: e.target.value}))}
                        placeholder="เช่น คุณสมชาย ใจดี"
                        maxLength={120}
                        data-testid="no-deposit-customer-name-temp"
                        className={`w-full rounded-lg px-3 py-2.5 text-sm outline-none ${isDark ? 'bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white focus:border-orange-600' : 'bg-pink-50 border border-pink-200 text-gray-900 focus:border-pink-500'}`}
                      />
                    </div>
                    <div>
                      {/* Phase 24.0-quaterdecies (2026-05-06) — เบอร์โทร is OPTIONAL
                          per user directive "ไม่จำเป็นต้องกรอก เบอร์โทร". * removed. */}
                      <label className="text-xs text-gray-500 font-semibold block mb-1">เบอร์โทร</label>
                      <input
                        type="tel"
                        inputMode="tel"
                        value={noDepositFormData.customerPhoneTemp}
                        onChange={e => setNoDepositFormData(p => ({...p, customerPhoneTemp: e.target.value}))}
                        placeholder="08x-xxx-xxxx"
                        maxLength={20}
                        data-testid="no-deposit-customer-phone-temp"
                        className={`w-full rounded-lg px-3 py-2.5 text-sm outline-none font-mono ${isDark ? 'bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white focus:border-orange-600' : 'bg-pink-50 border border-pink-200 text-gray-900 focus:border-pink-500'}`}
                      />
                    </div>
                  </div>

                  {/* วันนัด + เวลา */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">วันนัด <span className="text-red-500">*</span></label>
                      <DateField value={noDepositFormData.appointmentDate} onChange={v => setNoDepositFormData(p => ({...p, appointmentDate: v}))} fieldClassName={`w-full rounded-lg px-3 py-2.5 text-sm outline-none ${isDark ? 'bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white focus:border-orange-600' : 'bg-pink-50 border border-pink-200 text-gray-900 focus:border-pink-500'}`}/>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">เริ่ม <span className="text-red-500">*</span></label>
                        <select value={noDepositFormData.appointmentStartTime} onChange={e => setNoDepositFormData(p => ({...p, appointmentStartTime: e.target.value}))} className={`w-full rounded-lg px-2 py-2.5 text-xs outline-none ${isDark ? 'bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white' : 'bg-pink-50 border border-pink-200 text-gray-900'}`}>
                          <option value="">--</option>
                          {/* Phase 29.23-bis2 — V53 BS-12 per-branch open-hours filter. */}
                          {noDepositFormData.appointmentStartTime && !noDepositFormVisibleSlots.includes(noDepositFormData.appointmentStartTime) && (
                            <option value={noDepositFormData.appointmentStartTime}>{noDepositFormData.appointmentStartTime} (นอกเวลา)</option>
                          )}
                          {noDepositFormVisibleSlots.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">สิ้นสุด <span className="text-red-500">*</span></label>
                        <select value={noDepositFormData.appointmentEndTime} onChange={e => setNoDepositFormData(p => ({...p, appointmentEndTime: e.target.value}))} className={`w-full rounded-lg px-2 py-2.5 text-xs outline-none ${isDark ? 'bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white' : 'bg-pink-50 border border-pink-200 text-gray-900'}`}>
                          <option value="">--</option>
                          {noDepositFormData.appointmentEndTime && !noDepositFormVisibleSlots.includes(noDepositFormData.appointmentEndTime) && (
                            <option value={noDepositFormData.appointmentEndTime}>{noDepositFormData.appointmentEndTime} (นอกเวลา)</option>
                          )}
                          {noDepositFormVisibleSlots.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* ที่ปรึกษา */}
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">ที่ปรึกษา <span className="text-red-500">*</span></label>
                    <select value={noDepositFormData.advisor} onChange={e => setNoDepositFormData(p => ({...p, advisor: e.target.value}))} className={`w-full rounded-lg px-3 py-2.5 text-sm outline-none ${isDark ? 'bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white' : 'bg-pink-50 border border-pink-200 text-gray-900'}`}>
                      <option value="">-- เลือก --</option>
                      {(depositOptions?.advisors || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>

                  {/* แพทย์ — Phase 24.0-quaterdecies: optional (no *) */}
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">แพทย์</label>
                    <select value={noDepositFormData.doctor} onChange={e => setNoDepositFormData(p => ({...p, doctor: e.target.value}))} className={`w-full rounded-lg px-3 py-2.5 text-sm outline-none ${isDark ? 'bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white' : 'bg-pink-50 border border-pink-200 text-gray-900'}`}>
                      <option value="">-- เลือก --</option>
                      {(depositOptions?.doctors || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>

                  {/* ผู้ช่วยแพทย์ — Phase 24.0-quaterdecies: optional (no *) */}
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">ผู้ช่วยแพทย์</label>
                    <select value={noDepositFormData.assistant} onChange={e => setNoDepositFormData(p => ({...p, assistant: e.target.value}))} className={`w-full rounded-lg px-3 py-2.5 text-sm outline-none ${isDark ? 'bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white' : 'bg-pink-50 border border-pink-200 text-gray-900'}`}>
                      <option value="">-- เลือก --</option>
                      {(depositOptions?.assistants || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>

                  {/* ห้องตรวจ — Phase 24.0-quaterdecies: optional (no *) */}
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">ห้องตรวจ</label>
                    <select value={noDepositFormData.room} onChange={e => setNoDepositFormData(p => ({...p, room: e.target.value}))} className={`w-full rounded-lg px-3 py-2.5 text-sm outline-none ${isDark ? 'bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white' : 'bg-pink-50 border border-pink-200 text-gray-900'}`}>
                      <option value="">-- เลือก --</option>
                      {(depositOptions?.rooms || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>

                  {/* ช่องทางนัดหมาย */}
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">ช่องทางนัดหมาย <span className="text-red-500">*</span></label>
                    <select value={noDepositFormData.source} onChange={e => setNoDepositFormData(p => ({...p, source: e.target.value}))} className={`w-full rounded-lg px-3 py-2.5 text-sm outline-none ${isDark ? 'bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white' : 'bg-pink-50 border border-pink-200 text-gray-900'}`}>
                      <option value="">-- เลือก --</option>
                      {(depositOptions?.appointmentChannels || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>

                  {/* นัดมาเพื่อ — visit purpose */}
                  <div className={`border-t pt-4 ${isDark ? 'border-[var(--bd)]' : 'border-pink-200'}`}>
                    <label className="text-xs text-gray-500 font-semibold block mb-2">นัดมาเพื่อ <span className="text-red-500">*</span></label>
                    <div className="flex flex-wrap gap-2">
                      {VISIT_REASON_VALUES.map(r => (
                        <button key={r} type="button"
                          onClick={() => setNoDepositFormData(p => {
                            const has = p.visitPurpose.includes(r);
                            return {
                              ...p,
                              visitPurpose: has ? p.visitPurpose.filter(x=>x!==r) : [...p.visitPurpose, r],
                              // Phase 24.0-undecies — clear free-text detail when
                              // "อื่นๆ" toggles off.
                              visitPurposeOther: (r === 'อื่นๆ' && has) ? '' : p.visitPurposeOther,
                            };
                          })}
                          className={`text-xs px-2.5 py-1.5 rounded-lg border font-bold transition-all ${noDepositFormData.visitPurpose.includes(r) ? (isDark ? 'bg-orange-900/40 border-orange-600 text-orange-300' : 'bg-pink-100 border-pink-500 text-pink-700') : (isDark ? 'bg-[var(--bg-card)] border-[var(--bd)] text-gray-500 hover:text-gray-300' : 'bg-white border-pink-200 text-gray-500 hover:text-pink-600')}`}
                        >{r}</button>
                      ))}
                    </div>
                    {/* Phase 24.0-undecies — free-text detail when "อื่นๆ" is selected. */}
                    {noDepositFormData.visitPurpose.includes('อื่นๆ') && (
                      <div className="mt-3" data-testid="no-deposit-visit-purpose-other-wrap">
                        <label className="text-xs text-gray-500 font-semibold block mb-1">ระบุ "อื่นๆ"</label>
                        <input
                          type="text"
                          value={noDepositFormData.visitPurposeOther}
                          onChange={e => setNoDepositFormData(p => ({...p, visitPurposeOther: e.target.value}))}
                          placeholder="เช่น ผ่ามุก, ตรวจสุขภาพ, ฯลฯ"
                          maxLength={120}
                          data-testid="no-deposit-visit-purpose-other-input"
                          className={`w-full rounded-lg px-3 py-2 text-sm outline-none ${isDark ? 'bg-[var(--bg-card)] border border-orange-700/50 text-white focus:border-orange-500' : 'bg-pink-50 border border-pink-300 text-gray-900 focus:border-pink-500'}`}
                        />
                      </div>
                    )}
                  </div>

                  {/* Submit */}
                  <div className={`flex gap-3 pt-4 border-t ${isDark ? 'border-[var(--bd)]' : 'border-pink-200'}`}>
                    <button onClick={() => { setShowNoDepositForm(false); setEditingAppointment(null); }} className={`flex-1 px-4 py-3 rounded-lg font-bold text-xs uppercase border ${isDark ? 'bg-[var(--bg-hover)] hover:bg-[var(--bg-hover)] text-gray-300 border-[var(--bd-strong)]' : 'bg-gray-100 hover:bg-gray-200 text-gray-600 border-pink-200'}`}>ยกเลิก</button>
                    {/* Phase 24.0-quaterdecies (2026-05-06) — required-fields
                        narrowed per user directive: doctor / assistant / room
                        DROPPED from gate (no longer * in labels). New required:
                        customerNameTemp (ชื่อลูกค้า). Phone stays optional. */}
                    <button onClick={editingAppointment ? confirmUpdateAppointment : confirmCreateNoDeposit} disabled={isGenerating || !noDepositFormData.customerNameTemp?.trim() || !noDepositFormData.appointmentDate || !noDepositFormData.appointmentStartTime || !noDepositFormData.appointmentEndTime || !noDepositFormData.advisor || !noDepositFormData.source || noDepositFormData.visitPurpose.length === 0} className={`flex-1 px-4 py-3 rounded-lg font-bold text-xs uppercase disabled:opacity-50 flex items-center justify-center gap-2 ${isDark ? 'bg-orange-700 hover:bg-orange-600 text-white' : 'bg-pink-500 hover:bg-pink-600 text-white'}`}>
                      {isGenerating ? <><Loader2 size={14} className="animate-spin"/> {editingAppointment ? 'อัพเดท...' : 'สร้าง...'}</> : <><CalendarClock size={14}/> {editingAppointment ? 'อัพเดทนัดหมาย' : 'สร้างคิวจอง'}</>}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showNamePrompt && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[70]">
          <div className="bg-[var(--bg-elevated)] rounded-xl w-full max-w-md p-6 text-center animate-in zoom-in-95" style={{boxShadow: `0 0 40px rgba(${acRgb},0.2)`, border: `1px solid rgba(${acRgb},0.3)`}}>
            <h3 className="text-lg font-black text-white font-semibold mb-2">ตั้งชื่อคิว / Note</h3>
            <p className="text-gray-500 mb-4 text-xs font-semibold leading-relaxed">
              กรุณาระบุชื่อหรือหมายเหตุ<br/>เพื่อให้ง่ายต่อการค้นหา
            </p>
            <input type="text" autoFocus value={sessionNameInput} onChange={(e) => setSessionNameInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && confirmCreateSession()} placeholder="เช่น คุณ A, เคส 001" className="w-full bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white rounded-lg px-4 py-3 outline-none mb-6 text-sm" onFocus={e => { e.target.style.borderColor = ac; }} onBlur={e => { e.target.style.borderColor = '#333'; }} />
            <div className="flex gap-3">
              <button onClick={() => setShowNamePrompt(false)} className="flex-1 px-4 py-3 bg-[var(--bg-hover)] hover:bg-[var(--bg-hover)] text-gray-300 rounded font-bold text-xs font-semibold border border-[var(--bd-strong)]">ยกเลิก</button>
              <button onClick={confirmCreateSession} disabled={isGenerating} className="flex-1 px-4 py-3 rounded font-bold text-xs font-semibold disabled:opacity-70" style={{backgroundColor: ac, color: '#fff', boxShadow: `0 0 15px rgba(${acRgb},0.4)`}}>
                {isGenerating ? 'กำลังสร้าง...' : 'สร้างคิว'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Courses Panel Modal ══════════════════════════════════════════════════ */}
      {coursesPanel && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-[70]" onClick={() => setCoursesPanel(null)}>
          <div
            className="bg-[var(--bg-elevated)] rounded-2xl border border-[var(--bd)] w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            style={{boxShadow: '0 0 80px rgba(0,0,0,0.8)'}}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-3 p-5 border-b border-[var(--bd)] shrink-0">
              <div className="w-9 h-9 rounded-xl bg-teal-950/60 border border-teal-900/50 flex items-center justify-center shrink-0">
                <Package size={16} className="text-teal-400" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-black font-semibold text-teal-400">คอร์ส & บริการคงเหลือ</span>
                <span className="text-sm font-bold text-white truncate">{coursesPanel.patientName || '—'}{coursesPanel.hn ? <span className="text-teal-500 ml-2 font-mono text-xs">HN {coursesPanel.hn}</span> : ''}</span>
              </div>
              <button onClick={() => setCoursesPanel(null)} className="ml-auto p-2 rounded-lg text-gray-600 hover:text-white hover:bg-[var(--bg-hover)] transition-colors shrink-0"><X size={16}/></button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 p-4 sm:p-5 flex flex-col gap-5">

              {coursesPanel.status === 'loading' && (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-600">
                  <Loader2 size={28} className="animate-spin text-teal-600" />
                  <p className="text-xs font-bold font-semibold">กำลังดึงข้อมูลจาก ProClinic...</p>
                </div>
              )}

              {coursesPanel.status === 'error' && (
                <div className="flex flex-col items-center justify-center gap-3 py-12 text-red-600">
                  <PackageX size={28} />
                  <p className="text-xs font-bold font-semibold">{coursesPanel.error || 'เกิดข้อผิดพลาด'}</p>
                </div>
              )}

              {coursesPanel.status === 'done' && (
                <>
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Package size={14} className="text-teal-500"/>
                      <h4 className="text-xs font-black font-semibold text-teal-500">คอร์สของฉัน</h4>
                      <span className="text-xs font-bold text-teal-700 bg-teal-950/30 px-2 py-0.5 rounded-full border border-teal-900/30">{coursesPanel.courses.length}</span>
                    </div>
                    {coursesPanel.courses.length === 0
                      ? <p className="text-xs text-gray-600 italic py-4 text-center">ไม่มีคอร์สคงเหลือ</p>
                      : <div className="flex flex-col gap-2">{coursesPanel.courses.map((c, i) => <CourseCard key={i} c={c} expired={false}/>)}</div>
                    }
                  </div>
                  {coursesPanel.expiredCourses.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <PackageX size={14} className="text-red-500"/>
                        <h4 className="text-xs font-black font-semibold text-red-500">คอร์สหมดอายุ</h4>
                        <span className="text-xs font-bold text-red-700 bg-red-950/30 px-2 py-0.5 rounded-full border border-red-900/30">{coursesPanel.expiredCourses.length}</span>
                      </div>
                      <div className="flex flex-col gap-2">{coursesPanel.expiredCourses.map((c, i) => <CourseCard key={i} c={c} expired={true}/>)}</div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-[var(--bd)] shrink-0 flex items-center justify-between">
              <p className="text-xs text-gray-700 font-mono">ข้อมูลดึงจาก ProClinic แบบ Real-time</p>
              <button
                onClick={() => {
                  const s = sessions.find(x => x.id === coursesPanel.sessionId) || archivedSessions.find(x => x.id === coursesPanel.sessionId);
                  if (s) handleGetCourses(s);
                }}
                disabled={coursesPanel.status === 'loading'}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-[var(--bd)] text-gray-500 hover:text-teal-400 hover:border-teal-900/50 disabled:opacity-40 transition-colors"
              >
                <RotateCcw size={11} className={coursesPanel.status === 'loading' ? 'animate-spin' : ''}/>
                รีเฟรช
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hard Delete Modal (from History) */}
      {sessionToHardDelete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-[var(--bg-elevated)] rounded-xl border border-red-900/50 w-full max-w-sm overflow-hidden p-6 text-center" style={{boxShadow: '0 0 40px rgba(220,38,38,0.2)'}}>
            <div className="w-16 h-16 bg-red-950/50 text-red-500 rounded-full border border-red-900/50 flex items-center justify-center mx-auto mb-4"><Trash2 size={24}/></div>
            <h3 className="text-base sm:text-lg font-black text-white mb-2">ลบถาวร?</h3>
            <p className="text-red-400 font-bold text-xs mb-1">⚠ ไม่สามารถกู้คืนได้อีก</p>
            <p className="text-gray-500 mb-6 text-xs leading-relaxed">กำลังลบถาวร<br/><span className="font-mono text-sm text-red-400">{sessionToHardDelete}</span></p>
            <div className="flex gap-3">
              <button onClick={() => setSessionToHardDelete(null)} className="flex-1 px-4 py-3 bg-[var(--bg-hover)] hover:bg-[var(--bg-hover)] text-gray-300 rounded font-bold text-xs border border-[var(--bd-strong)]">ยกเลิก</button>
              <button onClick={() => hardDeleteSession(sessionToHardDelete)} className="flex-1 px-4 py-3 bg-red-700 hover:bg-red-600 text-white rounded font-bold text-xs">ลบถาวร</button>
            </div>
          </div>
        </div>
      )}

      {/* Restore to Queue Modal */}
      {sessionToRestore && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-[var(--bg-elevated)] rounded-2xl border border-[var(--bd)] w-full max-w-sm overflow-hidden shadow-2xl">
            <div className="px-6 pt-6 pb-4 border-b border-[var(--bd)]">
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 rounded-xl bg-orange-950/40 border border-orange-800/40"><RotateCcw size={18} className="text-orange-400" /></div>
                <div>
                  <h3 className="text-sm font-black text-white tracking-wide">กลับเข้าคิวใหม่</h3>
                  <p className="text-xs text-orange-400 font-mono mt-0.5">ID: {sessionToRestore.id}</p>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-3 leading-relaxed">เลือกประเภทลิงก์ — <span className="text-white font-bold">QR Code / Session ID เดิม</span> จะถูกใช้ต่อเนื่อง</p>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <button onClick={() => restoreToQueue(sessionToRestore.id, 'timed')}
                className="flex items-center gap-4 p-4 bg-[var(--bg-card)] hover:bg-[var(--bg-card)] border border-[var(--bd)] hover:border-orange-900/50 rounded-xl transition-all text-left group">
                <div className="p-2.5 rounded-xl bg-orange-950/30 border border-orange-900/30 group-hover:border-orange-700/50 transition-colors shrink-0">
                  <Timer size={18} className="text-orange-400" />
                </div>
                <div>
                  <p className="text-sm font-black text-white">ลิงก์ 2 ชั่วโมง</p>
                  <p className="text-xs text-gray-500 mt-0.5">นับเวลาใหม่จากตอนนี้ — หมดอายุอัตโนมัติ</p>
                </div>
              </button>
              <button onClick={() => restoreToQueue(sessionToRestore.id, 'permanent')}
                className="flex items-center gap-4 p-4 bg-[var(--bg-card)] hover:bg-[var(--bg-card)] border border-[var(--bd)] hover:border-blue-900/50 rounded-xl transition-all text-left group">
                <div className="p-2.5 rounded-xl bg-blue-950/30 border border-blue-900/30 group-hover:border-blue-700/50 transition-colors shrink-0">
                  <Infinity size={18} className="text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-black text-white">ลิงก์ดูข้อมูล</p>
                  <p className="text-xs text-gray-500 mt-0.5">ไม่มีวันหมดอายุ — ใช้ได้จนกว่าจะลบ</p>
                </div>
              </button>
              <button onClick={() => setSessionToRestore(null)}
                className="w-full px-4 py-2.5 bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-gray-500 hover:text-gray-300 rounded-xl font-bold text-xs border border-[var(--bd)] transition-colors">
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Patient Link Modal */}
      {/* RP1 lift (2026-04-30) — extracted from JSX-IIFE per Vite-OXC ban. */}
      {patientLinkModal && renderPatientLinkModal()}

      {/* Patient View Modal (iframe popup) */}
      {patientViewUrl && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[80] flex flex-col" onClick={() => closePatientViewIframe()}>
          <div className="flex items-center justify-between px-4 py-2 bg-[var(--bg-elevated)]/90 border-b border-[var(--bd-strong)] shrink-0">
            <span className="text-xs font-bold text-gray-400 font-semibold">ข้อมูลผู้ป่วย — Admin View</span>
            <button onClick={() => closePatientViewIframe()} className="text-gray-500 hover:text-white text-xl font-bold px-2 transition-colors">&times;</button>
          </div>
          <div className="flex-1 p-2 sm:p-4" onClick={e => e.stopPropagation()}>
            <iframe src={patientViewUrl} className="w-full h-full rounded-xl border border-[var(--bd-strong)]" style={{background:'#0a0a0a', boxShadow:`0 0 40px rgba(${acRgb},0.12)`}} />
          </div>
        </div>
      )}

      {/* Deposit Confirm Modal — RP1 lift (2026-04-30) extracted from JSX-IIFE per Vite-OXC ban. */}
      {depositToDelete && renderDepositConfirmModal()}

      {/* Delete Modal — RP1 lift (2026-04-30) extracted from JSX-IIFE per Vite-OXC ban. */}
      {sessionToDelete && renderSessionDeleteModal()}

      {/* ── Schedule Link Modal — RP1 lift (2026-04-30) extracted from JSX-IIFE per Vite-OXC ban. ── */}
      {showScheduleModal && renderScheduleModal()}

      {/* Phase 25.0c (2026-05-09) — Walk-in appointment-create modal. Opens
          after admin clicks "บันทึกลง OPD" on the คิวหน้า Clinic tab, customer
          is saved to be_customers, and adminMode === 'dashboard'. Locks
          type='walk-in' / channel='Walk-in' / customer / branch (via context).
          User: "เด้ง modal สร้างนัดหมาย ... ดึงข้อมูลจากสาขานั้นๆมา แล้วล็อค
          ประเภทเป็น walk-in, ล็อคชื่อลูกค้า, ไม่ล็อคสถานะแต่ตั้ง default
          เป็นรอยืนยัน, ล็อคช่องทางนัดหมายเป็น walk-in, ล็อคสาขาเป็นสาขา
          ที่สร้างคิว, ส่วนอันอื่นๆไม่ล็อค". */}
      {walkInModal && (
        <AppointmentFormModal
          mode="create"
          lockedAppointmentType="walk-in"
          lockedChannel="Walk-in"
          lockedCustomer={{
            id: walkInModal.customerId,
            proClinicId: walkInModal.customerId,
            proClinicHN: walkInModal.customerHN,
            patientData: walkInModal.patientData,
          }}
          initialDate={thaiTodayISO()}
          skipCollisionCheck={true}
          skipHolidayCheck={true}
          existingAppointments={[]}
          theme={theme}
          onSaved={() => {
            showToast('สร้างนัดหมาย Walk-in สำเร็จ', 2500);
            setWalkInModal(null);
          }}
          onClose={() => setWalkInModal(null)}
        />
      )}

      {/* V118 (2026-05-23) — SendCustomerLinkModal for card-level OPD link
          send/view. Mounted at AdminDashboard root so it's reachable from any
          sub-tab. State `sendLinkModal` set by handleSendOrViewOpdLink; cleared
          here on close (with a tick bump so derived per-row state recomputes
          if admin reopens immediately, before the listener has propagated). */}
      {sendLinkModal && (
        <SendCustomerLinkModal
          isOpen={true}
          onClose={() => {
            setSendLinkModal(null);
            setLazyFetchedTick(t => t + 1);
          }}
          sessionId={sendLinkModal.sessionId}
          url={sendLinkModal.url}
          sessionName={sendLinkModal.sessionName}
          alreadyProvisioned={sendLinkModal.alreadyProvisioned}
        />
      )}

      {/* ───── Mobile floating bottom dock — Variant A v2 (Phase A, 2026-05-18) ─────
           4 main tabs + ⋯ overflow. Visible only at <768px via Tailwind md:hidden.
           จอง opens BottomSheet sub-picker (มัดจำ / ไม่มัดจำ). ⋯ opens overflow
           drawer with ประวัติ/ตั้งค่า/หลังบ้าน/theme/online/signout. Every action
           wired to the SAME state hooks the desktop tabs use — zero behavioral
           drift from V82-fix6. */}
      <nav className="md:hidden fixed left-2 right-2 z-[90] flex justify-around items-stretch p-1.5 rounded-2xl backdrop-blur-xl border border-[var(--bd-strong)] shadow-2xl menu-bottom-dock menu-dock-surface" style={{bottom: 'calc(env(safe-area-inset-bottom) + 8px)'}} data-testid="menu-bottom-dock">
        <button onClick={() => setAdminMode('chat')} className={`menu-dock-tab ${adminMode === 'chat' ? 'menu-dock-tab-active' : ''} ${isChatActive && chatUnread > 0 && adminMode !== 'chat' ? 'chat-tab-blink' : ''}`} data-tab="chat">
          <MessageCircle size={18}/>
          <span>แชท</span>
          {isChatActive && chatUnread > 0 && <span className="menu-badge-dock" style={{background:'#3b82f6'}}>{chatUnread > 99 ? '99+' : chatUnread}</span>}
        </button>
        {/* (2026-05-26) removed คิว dock tab — unified into นัด */}
        <button onClick={() => setAdminMode('appointment')} className={`menu-dock-tab ${adminMode === 'appointment' ? 'menu-dock-tab-active' : ''}`} data-tab="appointment">
          <CalendarDays size={18}/>
          <span>นัด</span>
          {/* V121 (2026-05-23) — mobile mirror of desktop sidebar purple bubble.
              Same cardFlowUnreadCount source = guaranteed consistent count. */}
          {cardFlowUnreadCount > 0 && (
            <span className="menu-badge-dock" style={{background:'#a855f7'}} data-testid="cardflow-unread-badge-mobile">
              {cardFlowUnreadCount > 99 ? '99+' : cardFlowUnreadCount}
            </span>
          )}
        </button>
        {/* (2026-05-26) removed จอง dock picker — จองมัดจำ/ไม่มัดจำ unified into นัด */}
        <button onClick={() => setShowMobileMoreDrawer(true)} className="menu-dock-tab" data-tab="more">
          <MoreHorizontal size={18}/>
          <span>เพิ่ม</span>
        </button>
      </nav>

      {/* (2026-05-26) Mobile จอง BottomSheet removed — จองมัดจำ/ไม่มัดจำ unified into นัด */}

      {/* ───── Mobile ⋯ เพิ่ม Drawer (ประวัติ/ตั้งค่า/หลังบ้าน/theme/online/signout) ───── */}
      {showMobileMoreDrawer && (
        <div className="md:hidden fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-end" onClick={() => setShowMobileMoreDrawer(false)} data-testid="menu-more-drawer">
          <div className="w-full bg-[var(--bg-surface)] rounded-t-3xl p-4 border-t border-[var(--bd-strong)] animate-in slide-in-from-bottom max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-[var(--bd)] rounded-full mx-auto mb-4"></div>
            <h3 className="text-sm font-bold text-[var(--tx-heading)] mb-3">เพิ่มเติม</h3>
            <div className="space-y-1.5">
              {/* (2026-05-26) removed ประวัติ — patient history lives in Backend (CustomerList + OPD modal) */}
              <button onClick={() => { setAdminMode('clinicSettings'); setShowMobileMoreDrawer(false); }} className="w-full p-3 rounded-xl bg-[var(--bg-hover)] border border-[var(--bd)] flex items-center gap-3 active:scale-[0.98] transition-all">
                <Palette size={18} className="shrink-0" style={{color: ac}}/>
                <span className="text-sm font-bold text-[var(--tx-heading)] flex-1 text-left">ตั้งค่า</span>
                {(adminMode === 'clinicSettings' || adminMode === 'formBuilder') && <span className="text-[10px] font-bold" style={{color: ac}}>เปิดอยู่</span>}
              </button>
              <button onClick={() => { window.open('?backend=1', '_blank'); setShowMobileMoreDrawer(false); }} className="w-full p-3 rounded-xl bg-[var(--bg-hover)] border border-[var(--bd)] flex items-center gap-3 hover:border-violet-900/50 active:scale-[0.98] transition-all">
                <Database size={18} className="text-violet-400 shrink-0"/>
                <span className="text-sm font-bold text-[var(--tx-heading)] flex-1 text-left">หลังบ้าน</span>
                <span className="text-[10px] text-violet-500 font-bold">เปิด tab ใหม่</span>
              </button>
              <div className="h-px bg-[var(--bd)] my-2"></div>
              {theme && setTheme && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-hover)] border border-[var(--bd)]">
                  <span className="text-sm font-bold text-[var(--tx-heading)]">ธีม</span>
                  <ThemeToggle theme={theme} setTheme={setTheme} compact />
                </div>
              )}
              <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-hover)] border border-[var(--bd)]">
                <span className="text-sm font-bold text-[var(--tx-heading)]">แอดมินออนไลน์</span>
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                  <span className="text-xs font-bold text-green-500">{onlineAdmins.length}</span>
                </div>
              </div>
              <button onClick={() => signOut(auth)} className="w-full p-3 rounded-xl bg-red-950/30 border border-red-900/50 flex items-center gap-3 mt-2 hover:bg-red-900/40 active:scale-[0.98] transition-all">
                <LogOut size={18} className="text-red-500 shrink-0"/>
                <span className="text-sm font-bold text-red-500 flex-1 text-left">ออกจากระบบ</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ==========================================
// 7. PATIENT FORM COMPONENT
