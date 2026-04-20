// ─── AppointmentTab — Resource Time Grid (replicate ProClinic layout) ────────
// 3-panel: Left sidebar (mini calendar + doctor list) | Main (week nav + time grid with room columns)

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar, ChevronLeft, ChevronRight, Plus, Edit3, Trash2,
  Search, Loader2, X, Clock, User, MapPin, Stethoscope,
  CheckCircle2, AlertCircle, CalendarDays, CalendarX,
} from 'lucide-react';
import {
  createBackendAppointment, updateBackendAppointment, deleteBackendAppointment,
  getAppointmentsByMonth, getAppointmentsByDate, getAllCustomers, getAllMasterDataItems,
  listHolidays,
} from '../../lib/backendClient.js';
import { bangkokNow } from '../../utils.js';
import { isDateHoliday, DAY_OF_WEEK_LABELS } from '../../lib/holidayValidation.js';
import DateField from '../DateField.jsx';


const THAI_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const THAI_DAYS_SHORT = ['อา','จ','อ','พ','พฤ','ศ','ส'];
const THAI_DAYS_FULL = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
const CAL_HEADERS = ['จ','อ','พ','พฤ','ศ','ส','อา'];
const CHANNELS = ['เคาน์เตอร์','โทรศัพท์','Walk-in','Facebook','Instagram','TikTok','Line','อื่นๆ'];
const APPT_TYPES = [{ value: 'sales', label: 'ขาย' }, { value: 'followup', label: 'ติดตาม' }];
const APPT_COLORS = ['ใช้สีเริ่มต้น','เหลืองอ่อน','เขียวอ่อน','ส้มอ่อน','แดงอ่อน','น้ำตาลอ่อน','ชมพูอ่อน','ม่วงอ่อน','น้ำเงินอ่อน'];
const STATUSES = [
  { value: 'pending', label: 'รอยืนยัน', bg: 'bg-orange-500/20', text: 'text-orange-400', dot: 'bg-orange-400' },
  { value: 'confirmed', label: 'ยืนยันแล้ว', bg: 'bg-sky-500/20', text: 'text-sky-400', dot: 'bg-sky-400' },
  { value: 'done', label: 'เสร็จแล้ว', bg: 'bg-emerald-500/20', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  { value: 'cancelled', label: 'ยกเลิก', bg: 'bg-red-500/20', text: 'text-red-400', dot: 'bg-red-400' },
];
const FALLBACK_ROOMS = []; // no fallback — show only rooms that have appointments
const ROOMS_CACHE_KEY = 'appt-rooms-seen'; // localStorage: cumulative room list across month nav
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

export default function AppointmentTab({ clinicSettings, theme }) {
  const isDark = theme !== 'light';

  // ── State ──
  const [selectedDate, setSelectedDate] = useState(() => dateStr(new Date()));
  // Thai time (GMT+7): avoid Jan 1 boundary where UTC-negative browsers see last December.
  const [calMonth, setCalMonth] = useState(() => { const n = bangkokNow(); return { year: n.getUTCFullYear(), month: n.getUTCMonth() }; });
  const [monthAppts, setMonthAppts] = useState({}); // for mini calendar dots
  const [dayAppts, setDayAppts] = useState([]); // appointments for selectedDate
  const [dayLoading, setDayLoading] = useState(false);

  // Form
  const [formMode, setFormMode] = useState(null);
  const [formData, setFormData] = useState({});
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [customers, setCustomers] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [staff, setStaff] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');

  const today = dateStr(new Date());
  const monthStr = `${calMonth.year}-${String(calMonth.month+1).padStart(2,'0')}`;

  // Phase 11.8 wiring: load holidays once; use pure `isDateHoliday` to decide
  // whether the currently-viewed date falls on a clinic closure. Banner renders
  // above the time grid so admins see it before creating new appointments.
  // Silent-fail on load (permission denied or network hiccup) = no banner,
  // existing booking flow untouched.
  const [holidays, setHolidays] = useState([]);
  useEffect(() => {
    listHolidays().then(setHolidays).catch(() => setHolidays([]));
  }, []);
  const currentHoliday = useMemo(
    () => isDateHoliday(selectedDate, holidays),
    [selectedDate, holidays],
  );

  // ── Load month appointment counts (for mini calendar) ──
  useEffect(() => {
    getAppointmentsByMonth(monthStr).then(setMonthAppts).catch(() => setMonthAppts({}));
  }, [monthStr]);

  // ── Load day appointments (for time grid) ──
  const loadDay = useCallback(async (d) => {
    setDayLoading(true);
    try {
      const appts = await getAppointmentsByDate(d);
      setDayAppts(appts);
    } catch { setDayAppts([]); }
    finally { setDayLoading(false); }
  }, []);

  useEffect(() => { if (selectedDate) loadDay(selectedDate); }, [selectedDate, loadDay]);

  // ── Derived: rooms, doctors for the day ──
  // Cumulative across month navigation + persistent via localStorage. Bug
  // 2026-04-20: previously REPLACED rooms on every month change → months
  // with 1 booking showed only 1 room column, blocking new bookings into
  // other rooms. Fix: only ADD, never remove, seeded from prior sessions.
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

  const rooms = useMemo(() => {
    if (allKnownRooms.length > 0) return allKnownRooms;
    return FALLBACK_ROOMS;
  }, [allKnownRooms]);

  // Pre-compute appointment lookup map for O(1) access in time grid
  const apptMap = useMemo(() => {
    const map = {};
    dayAppts.forEach(a => { if (a.startTime && a.roomName) map[`${a.startTime}|${a.roomName}`] = a; });
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

  // ── Form handlers ──
  const loadFormOptions = useCallback(async () => {
    if (customers.length && doctors.length && staff.length) return;
    const [c, d, s] = await Promise.all([getAllCustomers(), getAllMasterDataItems('doctors'), getAllMasterDataItems('staff')]);
    setCustomers(c);
    setDoctors(d.filter(x => x.status !== 'พักใช้งาน'));
    setStaff(s.filter(x => x.status !== 'พักใช้งาน'));
  }, [customers.length, doctors.length, staff.length]);

  const defaultFormData = (overrides = {}) => ({
    date: selectedDate, startTime: '10:00', endTime: '10:30',
    customerId: '', customerName: '', customerHN: '',
    appointmentType: 'sales', advisorId: '', advisorName: '',
    doctorId: '', doctorName: '', assistantIds: [], roomName: '',
    channel: '', appointmentTo: '', location: '',
    expectedSales: '', preparation: '', customerNote: '', notes: '',
    appointmentColor: '', lineNotify: false,
    recurringOption: 'once', recurringInterval: '', recurringUnit: 'วัน', recurringTimes: '',
    status: 'pending',
    ...overrides,
  });

  const openCreate = (date, time, room) => {
    // Phase 11.8d: holiday-gate. If the target date falls on an active
    // holiday, require an explicit confirm before proceeding. Non-blocking
    // override — admin can still book on holidays (emergency / special
    // hours) but must consciously acknowledge.
    const target = date || selectedDate;
    const holiday = isDateHoliday(target, holidays);
    if (holiday) {
      const label = holiday.type === 'weekly'
        ? `ทุกวัน${DAY_OF_WEEK_LABELS[Number(holiday.dayOfWeek) || 0]}`
        : (holiday.note || `วันหยุดเฉพาะ (${target})`);
      if (!window.confirm(`วันนี้เป็นวันหยุดคลินิก:\n\n${label}\n\nยืนยันสร้างนัดหมายในวันนี้ ?`)) return;
    }

    loadFormOptions();
    setFormData(defaultFormData({
      date: target,
      startTime: time || '10:00',
      endTime: time ? TIME_SLOTS[TIME_SLOTS.indexOf(time) + 1] || time : '10:30',
      roomName: room || '',
    }));
    setFormMode({ mode: 'create' });
    setFormError('');
  };

  const openEdit = (appt) => {
    loadFormOptions();
    setFormData(defaultFormData({
      date: appt.date, startTime: appt.startTime, endTime: appt.endTime || appt.startTime,
      customerId: appt.customerId, customerName: appt.customerName, customerHN: appt.customerHN,
      appointmentType: appt.appointmentType || 'sales',
      advisorId: appt.advisorId || '', advisorName: appt.advisorName || '',
      doctorId: appt.doctorId, doctorName: appt.doctorName, assistantIds: appt.assistantIds || [],
      roomName: appt.roomName, channel: appt.channel, appointmentTo: appt.appointmentTo,
      location: appt.location || '', expectedSales: appt.expectedSales || '',
      preparation: appt.preparation || '', customerNote: appt.customerNote || '',
      notes: appt.notes, appointmentColor: appt.appointmentColor || '',
      lineNotify: appt.lineNotify || false, status: appt.status || 'pending',
    }));
    setFormMode({ mode: 'edit', appt });
    setFormError('');
  };

  const handleDelete = async (appt) => {
    if (!confirm('ต้องการลบนัดหมายนี้?')) return;
    await deleteBackendAppointment(appt.appointmentId || appt.id);
    loadDay(selectedDate);
    getAppointmentsByMonth(monthStr).then(setMonthAppts);
  };

  const scrollToFormError = (fieldAttr, msg) => {
    setFormError(msg);
    setTimeout(() => {
      const el = document.querySelector(`[data-field="${fieldAttr}"]`);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('ring-2', 'ring-red-500'); setTimeout(() => el.classList.remove('ring-2', 'ring-red-500'), 3000); }
    }, 50);
  };

  const handleSave = async () => {
    if (!formData.customerId) { scrollToFormError('apptCustomer', 'กรุณาเลือกลูกค้า'); return; }
    if (!formData.date) { scrollToFormError('apptDate', 'กรุณาเลือกวันที่'); return; }
    if (!formData.startTime) { scrollToFormError('apptStartTime', 'กรุณาเลือกเวลาเริ่ม'); return; }
    setFormSaving(true); setFormError('');
    try {
      // AP1: overlap detection. A time slot is considered busy if either
      // the room OR the doctor already has an appointment whose [start,end)
      // range intersects the new one. Check against appointments for the
      // EXACT target date (formData.date), not the UI-selected date — user
      // may pick a different date in the form than what the calendar shows.
      const editingId = formMode.mode === 'edit' ? (formMode.appt.appointmentId || formMode.appt.id) : null;
      const newStart = String(formData.startTime);
      const newEnd = String(formData.endTime || formData.startTime) || newStart;
      const targetDate = String(formData.date);
      let sameDay = [];
      if (targetDate === selectedDate) {
        sameDay = Array.isArray(dayAppts) ? dayAppts : [];
      } else {
        try { sameDay = await getAppointmentsByDate(targetDate); }
        catch { sameDay = []; }
      }
      const overlaps = sameDay.filter(a => {
        const aid = a.appointmentId || a.id;
        if (aid && editingId && String(aid) === String(editingId)) return false; // editing self
        if ((a.status || '') === 'cancelled') return false;
        const aStart = String(a.startTime || '');
        const aEnd = String(a.endTime || a.startTime || '');
        if (!aStart) return false;
        // half-open interval overlap: aStart < newEnd && aEnd > newStart
        const startsBeforeNewEnds = aStart < newEnd;
        const endsAfterNewStarts = (aEnd || aStart) > newStart;
        if (!(startsBeforeNewEnds && endsAfterNewStarts)) return false;
        const sameRoom = formData.roomName && a.roomName && a.roomName === formData.roomName;
        const sameDoctor = formData.doctorId && a.doctorId && String(a.doctorId) === String(formData.doctorId);
        return !!(sameRoom || sameDoctor);
      });
      if (overlaps.length > 0) {
        const o = overlaps[0];
        const who = o.roomName === formData.roomName ? `ห้อง "${o.roomName}"` : `หมอ "${o.doctorName || o.doctorId}"`;
        setFormError(`ช่วงเวลานี้ชน: ${who} มีนัด ${o.startTime}–${o.endTime || o.startTime} (${o.customerName || o.customerHN || 'อีกนัด'}) อยู่แล้ว`);
        setFormSaving(false);
        return;
      }
      const clean = JSON.parse(JSON.stringify({
        customerId:formData.customerId, customerName:formData.customerName, customerHN:formData.customerHN,
        date:formData.date, startTime:formData.startTime, endTime:formData.endTime||formData.startTime,
        appointmentType:formData.appointmentType||'sales',
        advisorId:formData.advisorId||'', advisorName:formData.advisorName||'',
        doctorId:formData.doctorId, doctorName:formData.doctorName,
        assistantIds:formData.assistantIds||[], roomName:formData.roomName,
        channel:formData.channel, appointmentTo:formData.appointmentTo, location:formData.location||'',
        expectedSales:formData.expectedSales||'', preparation:formData.preparation||'',
        customerNote:formData.customerNote||'', notes:formData.notes,
        appointmentColor:formData.appointmentColor||'', lineNotify:!!formData.lineNotify,
        status:formData.status||'pending',
      }));
      if (formMode.mode === 'edit') await updateBackendAppointment(formMode.appt.appointmentId||formMode.appt.id, clean);
      else await createBackendAppointment(clean);
      setFormMode(null);
      loadDay(selectedDate);
      getAppointmentsByMonth(monthStr).then(setMonthAppts);
    } catch (err) { setFormError(err.message); }
    finally { setFormSaving(false); }
  };

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers.slice(0, 20);
    const q = customerSearch.toLowerCase();
    return customers.filter(c => {
      const name = `${c.patientData?.prefix||''} ${c.patientData?.firstName||''} ${c.patientData?.lastName||''}`.toLowerCase();
      return name.includes(q) || (c.proClinicHN||'').toLowerCase().includes(q) || (c.patientData?.phone||'').includes(q);
    }).slice(0, 20);
  }, [customers, customerSearch]);

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
              const dow = ((i % 7) + 1) % 7; // Mon=1..Sun=0 mapped
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

        {/* Doctor Schedule for Selected Day */}
        <div className="bg-[var(--bg-surface)] rounded-xl p-3 shadow-lg" style={{ border: '1.5px solid rgba(14,165,233,0.15)' }}>
          <h4 className="text-xs font-black text-[var(--tx-heading)] mb-1 tracking-tight">{selThaiDate}</h4>
          <p className="text-[11px] text-sky-400 font-bold mb-2">แพทย์เข้าตรวจ {dayDoctors.length} คน</p>
          {dayDoctors.length === 0 ? (
            <p className="text-[11px] text-[var(--tx-muted)]">ไม่มีแพทย์เข้าตรวจ</p>
          ) : (
            <div className="space-y-1.5">
              {dayDoctors.map(doc => (
                <div key={doc.name} className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-sky-900/30' : 'bg-sky-50'}`}>
                    <User size={11} className={isDark ? 'text-sky-400' : 'text-sky-600'} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-[var(--tx-secondary)] font-medium truncate">{doc.name}</p>
                    <p className="text-[11px] text-[var(--tx-muted)]">{doc.min} - {doc.max}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
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

        {/* Day Header + Add Button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-bold text-[var(--tx-heading)]">{selThaiDate}</h3>
            <span className="text-xs font-bold text-sky-400">| แพทย์เข้าตรวจ {dayDoctors.length} คน</span>
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
            <div style={{ minWidth: rooms.length * 160 + 60 }}>
              {/* Room header row */}
              <div className="flex border-b border-[var(--bd)] sticky top-0 z-10 bg-[var(--bg-elevated)]">
                <div className="w-[60px] flex-shrink-0 py-2 px-1 text-center text-[11px] font-bold text-[var(--tx-muted)]">เวลา</div>
                {rooms.map(room => (
                  <div key={room} className="flex-1 min-w-[140px] py-2 px-2 text-center text-xs font-bold text-sky-400 border-l border-[var(--bd)]">
                    {room}
                  </div>
                ))}
              </div>

              {/* Time rows */}
              <div className="relative">
                {TIME_SLOTS.map((time, ti) => (
                  <div key={time} className="flex border-b border-[var(--bd)]/30" style={{ height: SLOT_H }}>
                    <div className="w-[60px] flex-shrink-0 text-xs text-[var(--tx-muted)] text-right pr-2 pt-0.5 font-mono">{time}</div>
                    {rooms.map(room => {
                      // O(1) lookup via pre-computed map
                      const appt = apptMap[`${time}|${room}`];
                      if (appt) {
                        const startIdx = TIME_SLOTS.indexOf(appt.startTime);
                        const endIdx = appt.endTime ? TIME_SLOTS.indexOf(appt.endTime) : startIdx + 1;
                        const span = Math.max(1, endIdx - startIdx);
                        const st = STATUSES.find(s => s.value === appt.status) || STATUSES[0];
                        return (
                          <div key={room} className="flex-1 min-w-[140px] border-l border-[var(--bd)]/30 px-0.5 relative" style={{ height: SLOT_H }}>
                            <button onClick={() => openEdit(appt)}
                              className={`absolute left-0.5 right-0.5 top-0.5 rounded-md px-1.5 py-0.5 text-left overflow-hidden transition-all hover:ring-1 hover:ring-sky-400 z-[5] ${st.bg} border border-[var(--bd)]/50`}
                              style={{ height: span * SLOT_H - 4 }}>
                              <div className="flex items-center gap-1">
                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${st.dot}`} />
                                <span className="text-xs font-bold text-[var(--tx-heading)] truncate">{appt.customerName || '-'}</span>
                              </div>
                              {span > 1 && (
                                <p className="text-[8px] text-[var(--tx-muted)] truncate mt-0.5">
                                  {appt.doctorName && `${appt.doctorName}`}{appt.appointmentTo && ` · ${appt.appointmentTo}`}
                                </p>
                              )}
                            </button>
                          </div>
                        );
                      }
                      // Check if this slot is occupied by a multi-slot appointment (skip rendering)
                      const occupied = dayAppts.some(a => {
                        if (a.roomName !== room || !a.startTime || !a.endTime) return false;
                        return time > a.startTime && time < a.endTime;
                      });
                      return (
                        <div key={room}
                          onClick={() => !occupied && openCreate(selectedDate, time, room)}
                          className={`flex-1 min-w-[140px] border-l border-[var(--bd)]/30 ${occupied ? '' : 'cursor-pointer hover:bg-sky-900/5'}`}
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

      {/* ════════════ FORM MODAL ════════════ */}
      {formMode && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="modal-title-appointment" onClick={() => setFormMode(null)} onKeyDown={e => { if (e.key === 'Escape') setFormMode(null); }}>
          <div className="bg-[var(--bg-surface)] border border-[var(--bd)] rounded-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-[var(--bd)] flex items-center justify-between">
              <h3 id="modal-title-appointment" className="text-sm font-bold text-[var(--tx-heading)] uppercase tracking-wider">
                {formMode.mode === 'edit' ? 'แก้ไขนัดหมาย' : 'สร้างนัดหมาย'}
              </h3>
              <button onClick={() => setFormMode(null)} className="text-[var(--tx-muted)] hover:text-[var(--tx-primary)]" aria-label="ปิด"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              {/* Customer picker */}
              <div data-field="apptCustomer">
                <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">ลูกค้า *</label>
                {formData.customerName ? (
                  <div className={`flex items-center justify-between px-3 py-2 rounded-lg border ${isDark ? 'bg-sky-900/10 border-sky-700/30' : 'bg-sky-50 border-sky-200'}`}>
                    <span className="text-xs text-[var(--tx-heading)] font-bold">{formData.customerName} <span className="font-mono text-[var(--tx-muted)]">{formData.customerHN}</span></span>
                    <button onClick={() => setFormData(p => ({...p, customerId:'', customerName:'', customerHN:''}))} className="text-[var(--tx-muted)] hover:text-red-400" aria-label="ล้าง"><X size={14}/></button>
                  </div>
                ) : (
                  <div>
                    <input type="text" value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} placeholder="ค้นหาชื่อ / HN / เบอร์..."
                      className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] placeholder:text-[var(--tx-muted)] focus:outline-none focus:ring-1 focus:ring-sky-500" />
                    {filteredCustomers.length > 0 && (
                      <div className="mt-1 max-h-32 overflow-y-auto border border-[var(--bd)] rounded-lg bg-[var(--bg-card)]">
                        {filteredCustomers.map(c => {
                          const name = `${c.patientData?.prefix||''} ${c.patientData?.firstName||''} ${c.patientData?.lastName||''}`.trim();
                          return (
                            <button key={c.id} onClick={() => { setFormData(p => ({...p, customerId:c.proClinicId||c.id, customerName:name, customerHN:c.proClinicHN||''})); setCustomerSearch(''); }}
                              className="w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--bg-hover)] transition-colors flex items-center justify-between">
                              <span className="text-[var(--tx-secondary)]">{name}</span>
                              <span className="text-xs font-mono text-[var(--tx-muted)]">{c.proClinicHN||''}</span>
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
                  <DateField value={formData.date} onChange={v => setFormData(p => ({...p, date:v}))}
                    fieldClassName="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] focus:outline-none focus:ring-1 focus:ring-sky-500" />
                </div>
                <div data-field="apptStartTime">
                  <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">เริ่ม *</label>
                  <select value={formData.startTime} onChange={e => setFormData(p => ({...p, startTime:e.target.value}))}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] focus:outline-none focus:ring-1 focus:ring-sky-500">
                    {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">สิ้นสุด</label>
                  <select value={formData.endTime} onChange={e => setFormData(p => ({...p, endTime:e.target.value}))}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] focus:outline-none focus:ring-1 focus:ring-sky-500">
                    {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              {/* Appointment Type */}
              <div>
                <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">ประเภทนัดหมาย</label>
                <div className="flex gap-3">
                  {APPT_TYPES.map(t => (
                    <label key={t.value} className="flex items-center gap-1.5 cursor-pointer text-xs">
                      <input type="radio" checked={formData.appointmentType === t.value} onChange={() => setFormData(p => ({...p, appointmentType: t.value}))} className="accent-sky-500" />{t.label}
                    </label>
                  ))}
                </div>
              </div>
              {/* Advisor + Doctor + Room */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">ที่ปรึกษา</label>
                  <select value={formData.advisorId} onChange={e => { const s=staff.find(x=>String(x.id)===e.target.value); setFormData(p=>({...p,advisorId:e.target.value,advisorName:s?.name||''})); }}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] focus:outline-none focus:ring-1 focus:ring-sky-500">
                    <option value="">ไม่ระบุ</option>
                    {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">แพทย์</label>
                  <select value={formData.doctorId} onChange={e => { const d=doctors.find(x=>String(x.id)===e.target.value); setFormData(p=>({...p,doctorId:e.target.value,doctorName:d?.name||''})); }}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] focus:outline-none focus:ring-1 focus:ring-sky-500">
                    <option value="">ไม่ระบุ</option>
                    {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">ห้องตรวจ</label>
                  <select value={formData.roomName} onChange={e => setFormData(p => ({...p, roomName:e.target.value}))}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] focus:outline-none focus:ring-1 focus:ring-sky-500">
                    <option value="">ไม่ระบุ</option>
                    {[...new Set([...rooms, ...FALLBACK_ROOMS])].map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              {/* Assistants (multi-select) */}
              <div>
                <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">ผู้ช่วยแพทย์ (สูงสุด 5 คน)</label>
                <div className="flex flex-wrap gap-1.5">
                  {doctors.map(d => (
                    <label key={d.id} className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg cursor-pointer border transition-all ${
                      formData.assistantIds?.includes(String(d.id))
                        ? (isDark ? 'bg-sky-900/30 border-sky-700/40 text-sky-400' : 'bg-sky-50 border-sky-200 text-sky-700')
                        : 'bg-[var(--bg-input)] border-[var(--bd)] text-[var(--tx-muted)]'
                    }`}>
                      <input type="checkbox" checked={formData.assistantIds?.includes(String(d.id)) || false}
                        onChange={e => {
                          const id = String(d.id);
                          setFormData(p => ({...p, assistantIds: e.target.checked
                            ? [...(p.assistantIds||[]), id].slice(0, 5)
                            : (p.assistantIds||[]).filter(x => x !== id)
                          }));
                        }} className="accent-sky-500 w-3 h-3" />
                      {d.name}
                    </label>
                  ))}
                </div>
              </div>
              {/* Channel + Purpose + Status + Color */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">ช่องทางนัดหมาย</label>
                  <select value={formData.channel} onChange={e => setFormData(p => ({...p, channel:e.target.value}))}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] focus:outline-none focus:ring-1 focus:ring-sky-500">
                    <option value="">ไม่ระบุ</option>
                    {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">สถานะ</label>
                  <select value={formData.status} onChange={e => setFormData(p => ({...p, status:e.target.value}))}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] focus:outline-none focus:ring-1 focus:ring-sky-500">
                    {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">นัดมาเพื่อ</label>
                  <textarea value={formData.appointmentTo} onChange={e => setFormData(p => ({...p, appointmentTo:e.target.value}))} rows={2} placeholder="botox, filler..."
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] placeholder:text-[var(--tx-muted)] resize-none focus:outline-none focus:ring-1 focus:ring-sky-500" />
                </div>
                <div>
                  <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">สีนัดหมาย</label>
                  <select value={formData.appointmentColor} onChange={e => setFormData(p => ({...p, appointmentColor:e.target.value}))}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] focus:outline-none focus:ring-1 focus:ring-sky-500">
                    <option value="">ไม่ระบุ</option>
                    {APPT_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              {/* Extra fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">สถานที่นัด</label>
                  <input type="text" value={formData.location} onChange={e => setFormData(p => ({...p, location:e.target.value}))} placeholder="คลินิก สาขา..."
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] placeholder:text-[var(--tx-muted)] focus:outline-none focus:ring-1 focus:ring-sky-500" />
                </div>
                <div>
                  <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">ยอดขายที่คาดหวัง</label>
                  <input type="number" value={formData.expectedSales} onChange={e => setFormData(p => ({...p, expectedSales:e.target.value}))} placeholder="0"
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] placeholder:text-[var(--tx-muted)] focus:outline-none focus:ring-1 focus:ring-sky-500" />
                </div>
              </div>
              {/* Recurring */}
              {formMode?.mode === 'create' && (
                <div>
                  <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">ตัวเลือกนัดหมาย</label>
                  <div className="flex gap-3 mb-2">
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                      <input type="radio" checked={formData.recurringOption === 'once'} onChange={() => setFormData(p => ({...p, recurringOption:'once'}))} className="accent-sky-500" />นัดครั้งเดียว
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                      <input type="radio" checked={formData.recurringOption === 'multiple'} onChange={() => setFormData(p => ({...p, recurringOption:'multiple'}))} className="accent-sky-500" />นัดหลายครั้ง
                    </label>
                  </div>
                  {formData.recurringOption === 'multiple' && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-[var(--tx-muted)]">ทุก</span>
                      <input type="number" value={formData.recurringInterval} onChange={e => setFormData(p => ({...p, recurringInterval:e.target.value}))} min="1"
                        className="w-16 px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-center text-[var(--tx-primary)]" />
                      <select value={formData.recurringUnit} onChange={e => setFormData(p => ({...p, recurringUnit:e.target.value}))}
                        className="px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)]">
                        <option value="วัน">วัน</option><option value="เดือน">เดือน</option>
                      </select>
                      <span className="text-[var(--tx-muted)]">จำนวน</span>
                      <input type="number" value={formData.recurringTimes} onChange={e => setFormData(p => ({...p, recurringTimes:e.target.value}))} min="1"
                        className="w-16 px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-center text-[var(--tx-primary)]" />
                      <span className="text-[var(--tx-muted)]">ครั้ง</span>
                    </div>
                  )}
                </div>
              )}
              {/* Preparation */}
              <div>
                <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">การเตรียมตัว</label>
                <textarea value={formData.preparation} onChange={e => setFormData(p => ({...p, preparation:e.target.value}))} rows={2} placeholder="งดทาครีม, งดกินแอสไพริน..."
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] resize-none placeholder:text-[var(--tx-muted)] focus:outline-none focus:ring-1 focus:ring-sky-500" />
              </div>
              {/* Notes (2 types) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">หมายเหตุ (แจ้งลูกค้า)</label>
                  <textarea value={formData.customerNote} onChange={e => setFormData(p => ({...p, customerNote:e.target.value}))} rows={2}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] resize-none focus:outline-none focus:ring-1 focus:ring-sky-500" />
                </div>
                <div>
                  <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">โน้ต (สำหรับคลินิก)</label>
                  <textarea value={formData.notes} onChange={e => setFormData(p => ({...p, notes:e.target.value}))} rows={2}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] resize-none focus:outline-none focus:ring-1 focus:ring-sky-500" />
                </div>
              </div>
              {/* LINE notify */}
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={formData.lineNotify || false} onChange={e => setFormData(p => ({...p, lineNotify:e.target.checked}))} className="accent-emerald-500" />
                แจ้งเตือนนัดหมายทาง LINE
              </label>
              {formError && <div className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={12}/>{formError}</div>}
            </div>
            <div className="px-5 py-4 border-t border-[var(--bd)] flex items-center justify-end gap-2">
              <button onClick={() => setFormMode(null)} className="px-4 py-2 rounded-lg text-xs font-bold bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-[var(--tx-primary)] transition-all">ยกเลิก</button>
              <button onClick={handleSave} disabled={formSaving}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-sky-700 text-white hover:bg-sky-600 transition-all disabled:opacity-50 flex items-center gap-1.5">
                {formSaving ? <Loader2 size={12} className="animate-spin"/> : <CheckCircle2 size={12}/>}
                {formMode.mode === 'edit' ? 'บันทึก' : 'สร้างนัดหมาย'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
