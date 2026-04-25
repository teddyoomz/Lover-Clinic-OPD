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
  Calendar, X, Loader2, CheckCircle2, AlertCircle,
} from 'lucide-react';
import {
  createBackendAppointment, updateBackendAppointment,
  getAllCustomers, getAllMasterDataItems,
  listHolidays, listStaffSchedules,
} from '../../lib/backendClient.js';
import { isDateHoliday, DAY_OF_WEEK_LABELS } from '../../lib/holidayValidation.js';
import { checkAppointmentCollision } from '../../lib/staffScheduleValidation.js';
import { thaiTodayISO } from '../../utils.js';
import DateField from '../DateField.jsx';

// Constants — duplicated from AppointmentTab (will collapse into a shared
// constants module in a follow-up Rule-of-3 sweep). Keep values identical.
const CHANNELS = ['เคาน์เตอร์','โทรศัพท์','Walk-in','Facebook','Instagram','TikTok','Line','อื่นๆ'];
const APPT_TYPES = [{ value: 'sales', label: 'ขาย' }, { value: 'followup', label: 'ติดตาม' }];
const APPT_COLORS = ['ใช้สีเริ่มต้น','เหลืองอ่อน','เขียวอ่อน','ส้มอ่อน','แดงอ่อน','น้ำตาลอ่อน','ชมพูอ่อน','ม่วงอ่อน','น้ำเงินอ่อน'];
const STATUSES = [
  { value: 'pending',   label: 'รอยืนยัน' },
  { value: 'confirmed', label: 'ยืนยันแล้ว' },
  { value: 'done',      label: 'เสร็จแล้ว' },
  { value: 'cancelled', label: 'ยกเลิก' },
];
const FALLBACK_ROOMS = [];
const ROOMS_CACHE_KEY = 'appt-rooms-seen';

const TIME_SLOTS = [];
for (let h = 8; h <= 22; h++) {
  for (let m = 0; m < 60; m += 30) {
    if (h === 8 && m === 0) continue;
    TIME_SLOTS.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
  }
}

function defaultFormData(overrides = {}) {
  return {
    date: thaiTodayISO(),
    startTime: '10:00',
    endTime: '10:30',
    customerId: '', customerName: '', customerHN: '',
    appointmentType: 'sales',
    advisorId: '', advisorName: '',
    doctorId: '', doctorName: '',
    assistantIds: [],
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
 * @param {Array}  [props.existingAppointments] — for collision check
 * @param {Object} [props.theme]
 * @param {() => void} props.onSaved
 * @param {() => void} props.onClose
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
  existingAppointments = [],
  theme,
  onSaved,
  onClose,
}) {
  const isDark = theme !== 'light';

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
        appointmentType: appt.appointmentType || 'sales',
        advisorId: appt.advisorId || '',
        advisorName: appt.advisorName || '',
        doctorId: appt.doctorId || '',
        doctorName: appt.doctorName || '',
        assistantIds: appt.assistantIds || [],
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
      endTime: initialEndTime || (initialStartTime ? (TIME_SLOTS[TIME_SLOTS.indexOf(initialStartTime) + 1] || initialStartTime) : '10:30'),
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
  const [staff, setStaff] = useState([]);
  const [rooms, setRooms] = useState(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(ROOMS_CACHE_KEY) || '[]');
      return Array.isArray(cached) ? cached : [];
    } catch { return []; }
  });
  const [holidays, setHolidays] = useState([]);

  useEffect(() => {
    // Load doctors + staff + holidays on mount.
    Promise.all([
      getAllMasterDataItems('doctors').catch(() => []),
      getAllMasterDataItems('staff').catch(() => []),
      listHolidays().catch(() => []),
    ]).then(([d, s, h]) => {
      setDoctors((d || []).filter(x => x.status !== 'พักใช้งาน'));
      setStaff((s || []).filter(x => x.status !== 'พักใช้งาน'));
      setHolidays(h || []);
    });
    // Load customers ONLY if customer is not locked (saves a heavy fetch
    // when CustomerDetailView opens this modal — the customer is already
    // known and can't be changed).
    if (!lockedCustomer) {
      getAllCustomers().then(c => setCustomers(c || [])).catch(() => setCustomers([]));
    }
  }, [lockedCustomer]);

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

      // Build payload — IDENTICAL shape to AppointmentTab.handleSave per
      // user directive "wiring ให้ถูกต้องเหมือนกันด้วย".
      const payload = {
        customerId: formData.customerId, customerName: formData.customerName, customerHN: formData.customerHN,
        date: formData.date, startTime: formData.startTime, endTime: formData.endTime || formData.startTime,
        appointmentType: formData.appointmentType || 'sales',
        advisorId: formData.advisorId || '', advisorName: formData.advisorName || '',
        doctorId: formData.doctorId, doctorName: formData.doctorName,
        assistantIds: formData.assistantIds || [], roomName: formData.roomName,
        channel: formData.channel, appointmentTo: formData.appointmentTo, location: formData.location || '',
        expectedSales: formData.expectedSales || '', preparation: formData.preparation || '',
        customerNote: formData.customerNote || '', notes: formData.notes,
        appointmentColor: formData.appointmentColor || '',
        lineNotify: !!formData.lineNotify,
        status: formData.status || 'pending',
      };

      if (mode === 'edit' && appt) {
        await updateBackendAppointment(appt.appointmentId || appt.id, payload);
      } else {
        // Persist room to localStorage cache so it shows in next session
        if (formData.roomName) {
          try {
            const seen = new Set([...rooms, ...FALLBACK_ROOMS]);
            seen.add(formData.roomName);
            localStorage.setItem(ROOMS_CACHE_KEY, JSON.stringify([...seen]));
          } catch {}
        }
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
      setError(e?.message || 'บันทึกล้มเหลว');
    } finally {
      setSaving(false);
    }
  };

  const update = (patch) => setFormData(p => ({ ...p, ...patch }));

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
                <span className="text-xs text-[var(--tx-heading)] font-bold">
                  {formData.customerName || '-'} {formData.customerHN && <span className="font-mono text-[var(--tx-muted)]">{formData.customerHN}</span>}
                </span>
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
              {APPT_TYPES.map(t => (
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
              <select value={formData.advisorId} onChange={e => { const s = staff.find(x => String(x.id) === e.target.value); update({ advisorId: e.target.value, advisorName: s?.name || '' }); }}
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] focus:outline-none focus:ring-1 focus:ring-sky-500">
                <option value="">ไม่ระบุ</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
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
              <select value={formData.roomName} onChange={e => update({ roomName: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] focus:outline-none focus:ring-1 focus:ring-sky-500">
                <option value="">ไม่ระบุ</option>
                {[...new Set([...rooms, ...FALLBACK_ROOMS])].map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          {/* Assistants (multi-select chips) */}
          <div>
            <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">ผู้ช่วยแพทย์ (สูงสุด 5 คน)</label>
            <div className="flex flex-wrap gap-1.5">
              {doctors.map(d => {
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
              <input type="text" value={formData.location} onChange={e => update({ location: e.target.value })} placeholder="คลินิก สาขา..."
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] placeholder:text-[var(--tx-muted)] focus:outline-none focus:ring-1 focus:ring-sky-500" />
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
        <div className="px-5 py-4 border-t border-[var(--bd)] flex items-center justify-end gap-2">
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
