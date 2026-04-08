// ─── AppointmentTab — Backend appointment calendar ──────────────────────────
// Monthly calendar grid + day view + create/edit form modal

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar, ChevronLeft, ChevronRight, Plus, Edit3, Trash2,
  Search, Loader2, X, Clock, User, MapPin, Phone, Stethoscope,
  CheckCircle2, AlertCircle
} from 'lucide-react';
import {
  createBackendAppointment, updateBackendAppointment, deleteBackendAppointment,
  getAppointmentsByMonth, getAllCustomers, getAllMasterDataItems
} from '../../lib/backendClient.js';
import { hexToRgb } from '../../utils.js';

const THAI_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const DAY_HEADERS = ['จ','อ','พ','พฤ','ศ','ส','อา'];
const CHANNELS = ['เคาน์เตอร์','โทรศัพท์','Walk-in','Facebook','Instagram','TikTok','Line','อื่นๆ'];
const STATUSES = [
  { value: 'pending', label: 'รอยืนยัน', color: 'amber' },
  { value: 'confirmed', label: 'ยืนยันแล้ว', color: 'sky' },
  { value: 'done', label: 'เสร็จแล้ว', color: 'emerald' },
  { value: 'cancelled', label: 'ยกเลิก', color: 'red' },
];

// Generate time slots 08:30 - 22:30 (30-min)
const TIME_SLOTS = [];
for (let h = 8; h <= 22; h++) {
  for (let m = 0; m < 60; m += 30) {
    if (h === 8 && m === 0) continue; // start at 08:30
    const t = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    TIME_SLOTS.push(t);
  }
}

function getMonthStr(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
function getDateStr(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

export default function AppointmentTab({ clinicSettings, theme }) {
  const ac = clinicSettings?.accentColor || '#dc2626';
  const acRgb = hexToRgb(ac);

  // Calendar state
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selectedDate, setSelectedDate] = useState(null); // 'YYYY-MM-DD'
  const [appointments, setAppointments] = useState({}); // { 'YYYY-MM-DD': [...] }
  const [loading, setLoading] = useState(false);

  // Form state
  const [formMode, setFormMode] = useState(null); // null | { mode: 'create'|'edit', appt? }
  const [formData, setFormData] = useState({});
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Options for form
  const [customers, setCustomers] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');

  const monthStr = `${currentMonth.year}-${String(currentMonth.month + 1).padStart(2, '0')}`;
  const thaiYear = currentMonth.year + 543;

  // Load appointments for current month
  useEffect(() => {
    setLoading(true);
    getAppointmentsByMonth(monthStr)
      .then(data => setAppointments(data))
      .catch(() => setAppointments({}))
      .finally(() => setLoading(false));
  }, [monthStr]);

  // Load customers + doctors for form (lazy — on first form open)
  const loadFormOptions = useCallback(async () => {
    if (customers.length && doctors.length) return;
    const [c, d] = await Promise.all([
      getAllCustomers(),
      getAllMasterDataItems('doctors'),
    ]);
    setCustomers(c);
    setDoctors(d.filter(doc => doc.status !== 'พักใช้งาน'));
  }, [customers.length, doctors.length]);

  // Calendar grid computation
  const calendarDays = useMemo(() => {
    const firstDay = new Date(currentMonth.year, currentMonth.month, 1);
    const lastDay = new Date(currentMonth.year, currentMonth.month + 1, 0);
    let startDow = firstDay.getDay(); // 0=Sun
    startDow = startDow === 0 ? 6 : startDow - 1; // Convert to Mon=0

    const days = [];
    // Padding before
    for (let i = 0; i < startDow; i++) days.push(null);
    // Actual days
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dateStr = `${currentMonth.year}-${String(currentMonth.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({ day: d, dateStr });
    }
    return days;
  }, [currentMonth]);

  const today = getDateStr(new Date());

  // Handlers
  const navMonth = (delta) => {
    setCurrentMonth(prev => {
      let m = prev.month + delta;
      let y = prev.year;
      if (m < 0) { m = 11; y--; }
      if (m > 11) { m = 0; y++; }
      return { year: y, month: m };
    });
    setSelectedDate(null);
  };

  const openCreateForm = (date) => {
    loadFormOptions();
    setFormData({
      date: date || selectedDate || today,
      startTime: '10:00', endTime: '10:30',
      customerId: '', customerName: '', customerHN: '',
      doctorId: '', doctorName: '', roomName: '',
      channel: '', appointmentTo: '', notes: '', status: 'pending',
    });
    setFormMode({ mode: 'create' });
    setFormError('');
  };

  const openEditForm = (appt) => {
    loadFormOptions();
    setFormData({
      date: appt.date || '', startTime: appt.startTime || '', endTime: appt.endTime || '',
      customerId: appt.customerId || '', customerName: appt.customerName || '', customerHN: appt.customerHN || '',
      doctorId: appt.doctorId || '', doctorName: appt.doctorName || '', roomName: appt.roomName || '',
      channel: appt.channel || '', appointmentTo: appt.appointmentTo || '', notes: appt.notes || '',
      status: appt.status || 'pending',
    });
    setFormMode({ mode: 'edit', appt });
    setFormError('');
  };

  const handleDelete = async (appt) => {
    if (!confirm('ต้องการลบนัดหมายนี้?')) return;
    await deleteBackendAppointment(appt.appointmentId || appt.id);
    const data = await getAppointmentsByMonth(monthStr);
    setAppointments(data);
  };

  const handleSave = async () => {
    if (!formData.customerId) { setFormError('กรุณาเลือกลูกค้า'); return; }
    if (!formData.date) { setFormError('กรุณาเลือกวันที่'); return; }
    if (!formData.startTime) { setFormError('กรุณาเลือกเวลาเริ่ม'); return; }

    setFormSaving(true);
    setFormError('');
    try {
      const saveData = {
        customerId: formData.customerId,
        customerName: formData.customerName,
        customerHN: formData.customerHN,
        date: formData.date,
        startTime: formData.startTime,
        endTime: formData.endTime || formData.startTime,
        doctorId: formData.doctorId,
        doctorName: formData.doctorName,
        roomName: formData.roomName,
        channel: formData.channel,
        appointmentTo: formData.appointmentTo,
        notes: formData.notes,
        status: formData.status || 'pending',
      };
      // Strip undefined
      const clean = JSON.parse(JSON.stringify(saveData));

      if (formMode.mode === 'edit') {
        await updateBackendAppointment(formMode.appt.appointmentId || formMode.appt.id, clean);
      } else {
        await createBackendAppointment(clean);
      }
      setFormMode(null);
      // Reload appointments
      const data = await getAppointmentsByMonth(monthStr);
      setAppointments(data);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setFormSaving(false);
    }
  };

  // Filtered customers for search
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers.slice(0, 20);
    const q = customerSearch.toLowerCase();
    return customers.filter(c => {
      const name = `${c.patientData?.prefix||''} ${c.patientData?.firstName||''} ${c.patientData?.lastName||''}`.toLowerCase();
      return name.includes(q) || (c.proClinicHN||'').toLowerCase().includes(q) || (c.patientData?.phone||'').includes(q);
    }).slice(0, 20);
  }, [customers, customerSearch]);

  const selectedAppts = selectedDate ? (appointments[selectedDate] || []) : [];

  return (
    <div className="space-y-4">

      {/* ═══ Calendar Header ═══ */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => navMonth(-1)} className="p-2 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-[var(--tx-primary)] transition-all">
            <ChevronLeft size={16} />
          </button>
          <h2 className="text-sm font-bold text-[var(--tx-heading)] uppercase tracking-wider min-w-[180px] text-center">
            {THAI_MONTHS[currentMonth.month]} {thaiYear}
          </h2>
          <button onClick={() => navMonth(1)} className="p-2 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-[var(--tx-primary)] transition-all">
            <ChevronRight size={16} />
          </button>
          {loading && <Loader2 size={14} className="animate-spin text-[var(--tx-muted)]" />}
        </div>
        <button onClick={() => openCreateForm(selectedDate || today)}
          className="px-3 py-2 rounded-lg text-xs font-bold bg-sky-900/20 border border-sky-700/40 text-sky-400 hover:bg-sky-900/30 transition-all flex items-center gap-1.5">
          <Plus size={13} /> สร้างนัดหมาย
        </button>
      </div>

      {/* ═══ Calendar Grid ═══ */}
      <div className="bg-[var(--bg-surface)] border border-[var(--bd)] rounded-xl overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-[var(--bd)]">
          {DAY_HEADERS.map((d, i) => (
            <div key={d} className={`py-2 text-center text-[10px] font-bold uppercase tracking-wider ${i >= 5 ? 'text-red-400' : 'text-[var(--tx-muted)]'}`}>
              {d}
            </div>
          ))}
        </div>
        {/* Day cells */}
        <div className="grid grid-cols-7">
          {calendarDays.map((cell, i) => {
            if (!cell) return <div key={`empty-${i}`} className="min-h-[70px] border-b border-r border-[var(--bd)]/30 bg-[var(--bg-card)]/30" />;
            const { day, dateStr } = cell;
            const count = (appointments[dateStr] || []).length;
            const isToday = dateStr === today;
            const isSelected = dateStr === selectedDate;
            const dow = (i % 7);
            const isWeekend = dow >= 5;
            return (
              <button key={dateStr} onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                className={`min-h-[70px] p-1.5 border-b border-r border-[var(--bd)]/30 text-left transition-all hover:bg-[var(--bg-hover)] relative ${
                  isSelected ? 'ring-2 ring-sky-500 bg-sky-900/10 z-10' : ''
                } ${isToday ? 'bg-[var(--bg-elevated)]' : ''}`}>
                <span className={`text-xs font-bold ${isWeekend ? 'text-red-400' : 'text-[var(--tx-secondary)]'} ${isToday ? 'bg-sky-600 text-white rounded-full w-6 h-6 flex items-center justify-center' : ''}`}>
                  {day}
                </span>
                {count > 0 && (
                  <div className="mt-1">
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-sky-900/30 text-sky-400 font-bold">
                      {count} นัด
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══ Day View (when date selected) ═══ */}
      {selectedDate && (
        <div className="bg-[var(--bg-surface)] border border-[var(--bd)] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--bd)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-sky-400" />
              <h3 className="text-sm font-bold text-[var(--tx-heading)]">{selectedDate}</h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-900/30 text-sky-400 font-bold">{selectedAppts.length} นัด</span>
            </div>
            <button onClick={() => openCreateForm(selectedDate)}
              className="text-[10px] font-bold px-2.5 py-1 rounded-lg border border-sky-700/40 text-sky-400 bg-sky-900/10 hover:bg-sky-900/20 transition-all flex items-center gap-1">
              <Plus size={11} /> เพิ่มนัด
            </button>
          </div>

          {selectedAppts.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--tx-muted)]">ไม่มีนัดหมายในวันนี้</div>
          ) : (
            <div className="divide-y divide-[var(--bd)]">
              {selectedAppts.map(appt => {
                const st = STATUSES.find(s => s.value === appt.status) || STATUSES[0];
                return (
                  <div key={appt.appointmentId || appt.id} className="px-4 py-3 hover:bg-[var(--bg-hover)] transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-[var(--tx-heading)]">
                            {appt.startTime}{appt.endTime ? `-${appt.endTime}` : ''}
                          </span>
                          <span className="text-sm text-[var(--tx-secondary)] truncate">{appt.customerName || '-'}</span>
                          {appt.customerHN && <span className="text-[10px] font-mono text-[var(--tx-muted)]">({appt.customerHN})</span>}
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[10px] text-[var(--tx-muted)]">
                          {appt.doctorName && <span className="flex items-center gap-0.5"><Stethoscope size={9} />{appt.doctorName}</span>}
                          {appt.roomName && <span className="flex items-center gap-0.5"><MapPin size={9} />{appt.roomName}</span>}
                          {appt.channel && <span>{appt.channel}</span>}
                          {appt.appointmentTo && <span>{appt.appointmentTo}</span>}
                        </div>
                        {appt.notes && <p className="mt-0.5 text-[10px] text-[var(--tx-muted)] truncate">{appt.notes}</p>}
                      </div>
                      <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded bg-${st.color}-900/30 text-${st.color}-400`}>{st.label}</span>
                        <button onClick={() => openEditForm(appt)} className="p-1 rounded hover:bg-sky-900/20 text-sky-400"><Edit3 size={12} /></button>
                        <button onClick={() => handleDelete(appt)} className="p-1 rounded hover:bg-red-900/20 text-red-400"><Trash2 size={12} /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ Form Modal ═══ */}
      {formMode && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setFormMode(null)}>
          <div className="bg-[var(--bg-surface)] border border-[var(--bd)] rounded-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-[var(--bd)] flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--tx-heading)] uppercase tracking-wider">
                {formMode.mode === 'edit' ? 'แก้ไขนัดหมาย' : 'สร้างนัดหมาย'}
              </h3>
              <button onClick={() => setFormMode(null)} className="text-[var(--tx-muted)] hover:text-[var(--tx-primary)]"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              {/* Customer picker */}
              <div>
                <label className="text-[10px] font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">ลูกค้า *</label>
                {formData.customerName ? (
                  <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-sky-900/10 border border-sky-700/30">
                    <span className="text-xs text-[var(--tx-heading)] font-bold">{formData.customerName} <span className="font-mono text-[var(--tx-muted)]">{formData.customerHN}</span></span>
                    <button onClick={() => setFormData(p => ({ ...p, customerId:'', customerName:'', customerHN:'' }))} className="text-[var(--tx-muted)] hover:text-red-400"><X size={14} /></button>
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
                            <button key={c.id} onClick={() => { setFormData(p => ({ ...p, customerId: c.proClinicId || c.id, customerName: name, customerHN: c.proClinicHN || '' })); setCustomerSearch(''); }}
                              className="w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--bg-hover)] transition-colors flex items-center justify-between">
                              <span className="text-[var(--tx-secondary)]">{name}</span>
                              <span className="text-[10px] font-mono text-[var(--tx-muted)]">{c.proClinicHN || ''}</span>
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
                <div>
                  <label className="text-[10px] font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">วันที่ *</label>
                  <input type="date" value={formData.date} onChange={e => setFormData(p => ({ ...p, date: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] focus:outline-none focus:ring-1 focus:ring-sky-500" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">เริ่ม *</label>
                  <select value={formData.startTime} onChange={e => setFormData(p => ({ ...p, startTime: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] focus:outline-none focus:ring-1 focus:ring-sky-500">
                    {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">สิ้นสุด</label>
                  <select value={formData.endTime} onChange={e => setFormData(p => ({ ...p, endTime: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] focus:outline-none focus:ring-1 focus:ring-sky-500">
                    {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              {/* Doctor + Room */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">แพทย์</label>
                  <select value={formData.doctorId} onChange={e => {
                    const doc = doctors.find(d => String(d.id) === e.target.value);
                    setFormData(p => ({ ...p, doctorId: e.target.value, doctorName: doc?.name || '' }));
                  }} className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] focus:outline-none focus:ring-1 focus:ring-sky-500">
                    <option value="">ไม่ระบุ</option>
                    {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">ห้องตรวจ</label>
                  <input type="text" value={formData.roomName} onChange={e => setFormData(p => ({ ...p, roomName: e.target.value }))} placeholder="ห้อง 1"
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] placeholder:text-[var(--tx-muted)] focus:outline-none focus:ring-1 focus:ring-sky-500" />
                </div>
              </div>

              {/* Channel + Purpose + Status */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">ช่องทาง</label>
                  <select value={formData.channel} onChange={e => setFormData(p => ({ ...p, channel: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] focus:outline-none focus:ring-1 focus:ring-sky-500">
                    <option value="">ไม่ระบุ</option>
                    {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">นัดมาเพื่อ</label>
                  <input type="text" value={formData.appointmentTo} onChange={e => setFormData(p => ({ ...p, appointmentTo: e.target.value }))} placeholder="botox, filler..."
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] placeholder:text-[var(--tx-muted)] focus:outline-none focus:ring-1 focus:ring-sky-500" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">สถานะ</label>
                  <select value={formData.status} onChange={e => setFormData(p => ({ ...p, status: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] focus:outline-none focus:ring-1 focus:ring-sky-500">
                    {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-[10px] font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">หมายเหตุ</label>
                <textarea value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} rows={2}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] placeholder:text-[var(--tx-muted)] resize-none focus:outline-none focus:ring-1 focus:ring-sky-500" />
              </div>

              {/* Error */}
              {formError && (
                <div className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={12} />{formError}</div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-[var(--bd)] flex items-center justify-end gap-2">
              <button onClick={() => setFormMode(null)} className="px-4 py-2 rounded-lg text-xs font-bold bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-[var(--tx-primary)] transition-all">
                ยกเลิก
              </button>
              <button onClick={handleSave} disabled={formSaving}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-sky-700 text-white hover:bg-sky-600 transition-all disabled:opacity-50 flex items-center gap-1.5">
                {formSaving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                {formMode.mode === 'edit' ? 'บันทึก' : 'สร้างนัดหมาย'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
