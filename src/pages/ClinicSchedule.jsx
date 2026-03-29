import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, appId } from '../firebase.js';
import { CalendarDays, Calendar, ChevronLeft, ChevronRight, X, Clock, Stethoscope, Phone, MessageCircle } from 'lucide-react';
import ClinicLogo from '../components/ClinicLogo.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';

const THAI_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const THAI_DAYS = ['จ','อ','พ','พฤ','ศ','ส','อา'];

function generateTimeSlots(openTime, closeTime, durationMins) {
  const slots = [];
  const [oh, om] = openTime.split(':').map(Number);
  const [ch, cm] = closeTime.split(':').map(Number);
  let current = oh * 60 + om;
  const end = ch * 60 + cm;
  while (current + durationMins <= end) {
    const startH = String(Math.floor(current / 60)).padStart(2, '0');
    const startM = String(current % 60).padStart(2, '0');
    const endMin = current + durationMins;
    const endH = String(Math.floor(endMin / 60)).padStart(2, '0');
    const endM = String(endMin % 60).padStart(2, '0');
    slots.push({ start: `${startH}:${startM}`, end: `${endH}:${endM}` });
    current += durationMins;
  }
  return slots;
}

function isSlotBooked(date, slotStart, slotEnd, bookedSlots) {
  const slotStartMin = parseInt(slotStart.split(':')[0]) * 60 + parseInt(slotStart.split(':')[1]);
  const slotEndMin = parseInt(slotEnd.split(':')[0]) * 60 + parseInt(slotEnd.split(':')[1]);
  return bookedSlots.some(b => {
    if (b.date !== date) return false;
    const bStart = parseInt(b.startTime.split(':')[0]) * 60 + parseInt(b.startTime.split(':')[1]);
    const bEnd = parseInt(b.endTime.split(':')[0]) * 60 + parseInt(b.endTime.split(':')[1]);
    return bStart < slotEndMin && bEnd > slotStartMin;
  });
}

export default function ClinicSchedule({ token, clinicSettings, theme, setTheme }) {
  const [scheduleData, setScheduleData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [activeMonthIdx, setActiveMonthIdx] = useState(0);
  const [selectedDate, setSelectedDate] = useState(null);

  const cs = clinicSettings || {};
  const ac = cs.accentColor || '#dc2626';

  useEffect(() => {
    if (!token) { setStatus('notfound'); return; }
    const unsub = onSnapshot(
      doc(db, 'artifacts', appId, 'public', 'data', 'clinic_schedules', token),
      (snap) => {
        if (!snap.exists() || snap.data().enabled === false) { setStatus('notfound'); return; }
        const d = snap.data();
        // Check 24hr expiry
        if (d.createdAt?.toMillis) {
          const ageMs = Date.now() - d.createdAt.toMillis();
          if (ageMs > 24 * 60 * 60 * 1000) { setStatus('expired'); return; }
        }
        setScheduleData(d);
        setStatus('done');
      },
      () => setStatus('notfound')
    );
    return () => unsub();
  }, [token]);

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--bg-base)] text-[var(--tx-muted)] animate-pulse">
        <CalendarDays size={24} className="mr-2" /> กำลังโหลดตาราง...
      </div>
    );
  }

  if (status === 'notfound' || status === 'expired') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--bg-base)] text-[var(--tx-muted)] gap-4">
        <CalendarDays size={48} className="opacity-30" />
        <p className="text-lg font-bold">{status === 'expired' ? 'ลิงก์หมดอายุแล้ว' : 'ไม่พบตารางนัดหมาย'}</p>
        <p className="text-sm text-gray-500">{status === 'expired' ? 'กรุณาขอลิงก์ใหม่จากคลินิก' : 'ลิงก์อาจหมดอายุหรือไม่ถูกต้อง'}</p>
      </div>
    );
  }

  const data = scheduleData;
  const months = data.months || [];
  const currentMonth = months[activeMonthIdx] || months[0];
  const [y, m] = currentMonth.split('-').map(Number);
  const firstDayOfMonth = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const startDow = firstDayOfMonth.getDay();
  const calStart = startDow === 0 ? 6 : startDow - 1;

  const doctorDaysSet = new Set(data.doctorDays || []);
  const closedDaysSet = new Set(data.closedDays || []);
  const bookedSlots = [...(data.bookedSlots || []), ...(data.manualBlockedSlots || [])];
  const noDoctorRequired = data.noDoctorRequired || false;
  const customDoctorHours = data.customDoctorHours || {};

  const weekdaySlots = generateTimeSlots(data.clinicOpenTime || '10:00', data.clinicCloseTime || '19:00', data.slotDurationMins || 60);
  const weekendSlots = generateTimeSlots(data.clinicOpenTimeWeekend || data.clinicOpenTime || '10:00', data.clinicCloseTimeWeekend || data.clinicCloseTime || '17:00', data.slotDurationMins || 60);

  const getSlotsForDate = (dateStr) => {
    const d = new Date(dateStr);
    const dow = d.getDay(); // 0=Sun, 6=Sat
    return (dow === 0 || dow === 6) ? weekendSlots : weekdaySlots;
  };

  // Doctor hour blocking for "พบแพทย์" links
  const getDoctorHoursForDate = (dateStr) => {
    if (customDoctorHours[dateStr]) return customDoctorHours[dateStr];
    const d = new Date(dateStr);
    const isWknd = d.getDay() === 0 || d.getDay() === 6;
    return {
      start: isWknd ? (data.doctorStartTimeWeekend || data.doctorStartTime || '10:00') : (data.doctorStartTime || '10:00'),
      end: isWknd ? (data.doctorEndTimeWeekend || data.doctorEndTime || '19:00') : (data.doctorEndTime || '19:00'),
    };
  };
  const isSlotOutsideDoctorHours = (dateStr, slotStart, slotEnd) => {
    if (noDoctorRequired) return false;
    if (!doctorDaysSet.has(dateStr)) return false;
    const hours = getDoctorHoursForDate(dateStr);
    const sMin = parseInt(slotStart.split(':')[0]) * 60 + parseInt(slotStart.split(':')[1]);
    const eMin = parseInt(slotEnd.split(':')[0]) * 60 + parseInt(slotEnd.split(':')[1]);
    const dStart = parseInt(hours.start.split(':')[0]) * 60 + parseInt(hours.start.split(':')[1]);
    const dEnd = parseInt(hours.end.split(':')[0]) * 60 + parseInt(hours.end.split(':')[1]);
    return sMin < dStart || eMin > dEnd;
  };

  // Count available slots per day
  const availByDate = {};
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${currentMonth}-${String(d).padStart(2, '0')}`;
    if (closedDaysSet.has(dateStr)) { availByDate[dateStr] = -1; continue; }
    const slots = getSlotsForDate(dateStr);
    const free = slots.filter(s => !isSlotBooked(dateStr, s.start, s.end, bookedSlots) && !isSlotOutsideDoctorHours(dateStr, s.start, s.end)).length;
    availByDate[dateStr] = free;
  }

  const todayStr = new Date().toISOString().substring(0, 10);

  // Selected day slots
  const selectedSlots = selectedDate ? getSlotsForDate(selectedDate).map(s => ({
    ...s,
    booked: isSlotBooked(selectedDate, s.start, s.end, bookedSlots) || isSlotOutsideDoctorHours(selectedDate, s.start, s.end),
  })) : [];

  return (
    <div className="min-h-screen bg-[var(--bg-base)] font-sans text-[var(--tx-body)]">
      {/* Header */}
      <header className="bg-[var(--bg-card)] border-b border-[var(--bd)] px-4 py-3 sm:py-4">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="shrink-0 w-9 h-9">
              <ClinicLogo clinicSettings={cs} className="w-full h-full" showText={false} theme={theme} />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-[var(--tx-heading)] truncate">{cs.clinicName || 'Clinic'}</h1>
              <p className="text-[10px] sm:text-xs text-[var(--tx-muted)]">ตารางนัดหมาย</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ThemeToggle theme={theme} setTheme={setTheme} />
          </div>
        </div>
      </header>

      <div className="max-w-md mx-auto p-4 space-y-4">
        {/* Month selector */}
        {months.length > 1 && (
          <div className="flex items-center justify-center gap-2">
            <button onClick={() => { setActiveMonthIdx(Math.max(0, activeMonthIdx - 1)); setSelectedDate(null); }}
              disabled={activeMonthIdx === 0}
              className="p-2 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-white transition-colors disabled:opacity-30">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-bold text-[var(--tx-heading)] min-w-[140px] text-center">
              {THAI_MONTHS[m - 1]} {y + 543}
            </span>
            <button onClick={() => { setActiveMonthIdx(Math.min(months.length - 1, activeMonthIdx + 1)); setSelectedDate(null); }}
              disabled={activeMonthIdx >= months.length - 1}
              className="p-2 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-white transition-colors disabled:opacity-30">
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {months.length <= 1 && (
          <div className="text-center">
            <span className="text-sm font-bold text-[var(--tx-heading)]">{THAI_MONTHS[m - 1]} {y + 543}</span>
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap justify-center gap-3 text-[10px] text-[var(--tx-muted)]">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-sky-900/50 border border-sky-700/50 inline-block" /> หมอเข้า</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-900/30 border border-green-800/40 inline-block" /> ว่าง</span>
          <span className="flex items-center gap-1"><span className="text-orange-400 font-bold">เต็ม</span></span>
        </div>

        {/* Calendar */}
        <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--bd)] overflow-hidden shadow-xl">
          <div className="p-3 sm:p-4">
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {THAI_DAYS.map((d, i) => (
                <div key={i} className={`text-center text-[10px] font-bold uppercase tracking-wider py-1 ${i >= 5 ? 'text-red-400/60' : 'text-[var(--tx-muted)]'}`}>{d}</div>
              ))}
            </div>
            {/* Day cells */}
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: calStart }).map((_, i) => <div key={`e-${i}`} className="aspect-square" />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${currentMonth}-${String(day).padStart(2, '0')}`;
                const isClosed = closedDaysSet.has(dateStr);
                const isDoctor = doctorDaysSet.has(dateStr);
                const avail = availByDate[dateStr] || 0;
                const isSelected = selectedDate === dateStr;
                const isToday = dateStr === todayStr;
                const isPast = dateStr < todayStr;
                const dow = (calStart + i) % 7;
                const isWeekend = dow >= 5;
                // ถ้าต้องพบแพทย์ → วันที่หมอไม่เข้า disabled
                const isDayDisabled = isClosed || (!noDoctorRequired && !isDoctor);

                let bgClass = 'bg-[var(--bg-hover)] border border-[var(--bd)] hover:border-sky-800/50';
                let textExtra = '';
                if (isDayDisabled) {
                  bgClass = 'bg-[var(--bg-hover)] border border-[var(--bd)]';
                  textExtra = 'opacity-40';
                } else if (isDoctor) {
                  bgClass = noDoctorRequired
                    ? 'bg-sky-950/40 border border-sky-700/50'
                    : 'bg-sky-950/40 border border-sky-700/50';
                } else if (avail > 0) {
                  bgClass = 'bg-green-950/20 border border-green-900/30 hover:border-green-700/50';
                }
                if (isSelected) bgClass = 'bg-sky-600 border-2 border-sky-400 ring-2 ring-sky-400/30';
                if (isPast && !isSelected) textExtra += ' opacity-40';

                return (
                  <button key={day} onClick={() => !isDayDisabled && setSelectedDate(isSelected ? null : dateStr)}
                    disabled={isDayDisabled}
                    className={`aspect-square rounded-lg flex flex-col items-center justify-center gap-0 transition-all text-xs relative ${bgClass} ${isDayDisabled ? 'cursor-not-allowed' : 'cursor-pointer'} ${isToday && !isSelected ? 'ring-2 ring-sky-400/60' : ''}`}>
                    {isToday && <span className={`text-[6px] font-bold leading-none mb-px ${isSelected ? 'text-white/80' : 'text-sky-400'}`}>วันนี้</span>}
                    <span className={`font-black text-sm leading-tight ${isSelected ? 'text-white' : isToday ? 'text-sky-400' : isWeekend ? 'text-red-400/70' : 'text-[var(--tx-body)]'} ${textExtra}`}>{day}</span>
                    {!isClosed && isDoctor && noDoctorRequired && <Stethoscope size={9} className={isSelected ? 'text-sky-100' : 'text-sky-400'} />}
                    {!isDayDisabled && !isClosed && avail > 0 && (
                      <span className={`text-[8px] font-bold leading-tight ${isSelected ? 'text-sky-100' : 'text-green-400'}`}>ว่าง {avail}</span>
                    )}
                    {!isDayDisabled && !isClosed && avail === 0 && (
                      <span className={`text-[8px] font-bold leading-tight ${isSelected ? 'text-sky-100' : 'text-orange-400'}`}>เต็ม</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Selected date time slots */}
        {selectedDate && (
          <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--bd)] overflow-hidden shadow-xl">
            <div className="p-4 border-b border-[var(--bd)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-sky-400" />
                <h3 className="text-sm font-bold text-[var(--tx-heading)]">
                  {parseInt(selectedDate.split('-')[2])} {THAI_MONTHS[m - 1]} {y + 543}
                </h3>
                {doctorDaysSet.has(selectedDate) && (
                  <span className="text-[9px] bg-sky-950/50 text-sky-400 border border-sky-900/50 px-1.5 py-0.5 rounded font-bold flex items-center gap-1">
                    <Stethoscope size={8} /> หมอเข้า
                  </span>
                )}
              </div>
              <button onClick={() => setSelectedDate(null)} className="p-1.5 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-white transition-colors">
                <X size={14} />
              </button>
            </div>
            <div className="p-3 sm:p-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {selectedSlots.map((slot) => (
                <div key={slot.start}
                  className={`rounded-xl border p-3 text-center transition-all ${
                    slot.booked
                      ? 'bg-red-950/20 border-red-900/30 opacity-50'
                      : 'bg-green-950/20 border-green-900/30'
                  }`}>
                  <div className={`text-sm font-bold ${slot.booked ? 'text-red-400/70' : 'text-green-400'}`}>
                    {slot.start}
                  </div>
                  <div className="text-[10px] text-[var(--tx-muted)]">ถึง {slot.end}</div>
                  <div className={`text-[9px] font-bold mt-1 ${slot.booked ? 'text-red-400' : 'text-green-500'}`}>
                    {slot.booked ? 'ไม่ว่าง' : 'ว่าง'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Contact */}
        {(cs.lineOfficialUrl || cs.clinicPhone) && (
          <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--bd)] p-4 text-center space-y-3">
            <p className="text-xs text-[var(--tx-muted)]">สนใจนัดหมาย ติดต่อ</p>
            <div className="flex justify-center gap-3">
              {cs.lineOfficialUrl && (
                <a href={cs.lineOfficialUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
                  style={{ backgroundColor: '#06C755' }}>
                  <MessageCircle size={16} /> LINE
                </a>
              )}
              {cs.clinicPhone && (
                <a href={`tel:${cs.clinicPhone}`}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
                  style={{ backgroundColor: ac }}>
                  <Phone size={16} /> โทร
                </a>
              )}
            </div>
          </div>
        )}

        <p className="text-[10px] text-center text-[var(--tx-muted)] opacity-50">
          ข้อมูล ณ {data.createdAt?.toDate ? data.createdAt.toDate().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) : '—'}
        </p>
      </div>
    </div>
  );
}
