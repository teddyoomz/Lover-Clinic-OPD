import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, appId } from '../firebase.js';
import { CalendarDays, ChevronLeft, ChevronRight, X, Clock, Stethoscope, Phone, MessageCircle, Globe, CheckCircle2, XCircle } from 'lucide-react';
import ClinicLogo from '../components/ClinicLogo.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';

// ── i18n ──
const LANG = {
  th: {
    months: ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'],
    days: ['จ','อ','พ','พฤ','ศ','ส','อา'],
    schedule: 'ตารางนัดหมาย',
    loading: 'กำลังโหลดตาราง...',
    expired: 'ลิงก์หมดอายุแล้ว',
    expiredSub: 'กรุณาขอลิงก์ใหม่จากคลินิก',
    notFound: 'ไม่พบตารางนัดหมาย',
    notFoundSub: 'ลิงก์อาจหมดอายุหรือไม่ถูกต้อง',
    today: 'วันนี้',
    available: 'ว่าง',
    full: 'เต็ม',
    unavailable: 'ไม่ว่าง',
    doctor: 'หมอเข้า',
    to: 'ถึง',
    contact: 'สนใจนัดหมาย ติดต่อ',
    call: 'โทร',
    dataAt: 'ข้อมูล ณ',
    selectDate: 'เลือกวันที่เพื่อดูเวลาว่าง',
  },
  en: {
    months: ['January','February','March','April','May','June','July','August','September','October','November','December'],
    days: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
    schedule: 'Appointment Schedule',
    loading: 'Loading schedule...',
    expired: 'Link has expired',
    expiredSub: 'Please request a new link from the clinic',
    notFound: 'Schedule not found',
    notFoundSub: 'This link may have expired or is invalid',
    today: 'Today',
    available: 'Open',
    full: 'Full',
    unavailable: 'Booked',
    doctor: 'Doctor',
    to: 'to',
    contact: 'Interested? Contact us',
    call: 'Call',
    dataAt: 'Data as of',
    selectDate: 'Select a date to view available times',
  },
};

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
  const [lang, setLang] = useState('th');

  const t = LANG[lang];
  const cs = clinicSettings || {};
  const ac = cs.accentColor || '#dc2626';
  // Detect light mode from theme prop
  const isDark = theme === 'dark' || (theme === 'auto' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    if (!token) { setStatus('notfound'); return; }
    const unsub = onSnapshot(
      doc(db, 'artifacts', appId, 'public', 'data', 'clinic_schedules', token),
      (snap) => {
        if (!snap.exists() || snap.data().enabled === false) { setStatus('notfound'); return; }
        const d = snap.data();
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

  // ── Loading ──
  if (status === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--bg-base)] text-[var(--tx-muted)] gap-3">
        <div className="w-10 h-10 rounded-full border-2 border-[var(--bd)] border-t-sky-400 animate-spin" />
        <p className="text-sm font-medium">{t.loading}</p>
      </div>
    );
  }

  // ── Not found / Expired ──
  if (status === 'notfound' || status === 'expired') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--bg-base)] text-[var(--tx-muted)] gap-4 p-8">
        <div className="w-16 h-16 rounded-2xl bg-[var(--bg-card)] border border-[var(--bd)] flex items-center justify-center">
          <CalendarDays size={28} className="opacity-30" />
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-[var(--tx-heading)]">{status === 'expired' ? t.expired : t.notFound}</p>
          <p className="text-sm mt-1">{status === 'expired' ? t.expiredSub : t.notFoundSub}</p>
        </div>
      </div>
    );
  }

  // ── Data prep ──
  const data = scheduleData;
  const months = data.months || [];
  const currentMonth = months[activeMonthIdx] || months[0];
  const [y, m] = currentMonth.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const startDow = new Date(y, m - 1, 1).getDay();
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
    return (d.getDay() === 0 || d.getDay() === 6) ? weekendSlots : weekdaySlots;
  };

  const toMin = (t) => parseInt(t.split(':')[0]) * 60 + parseInt(t.split(':')[1]);
  // Returns array of { start, end } — backwards compat with old single-range format
  const getDoctorRangesForDate = (dateStr) => {
    const custom = customDoctorHours[dateStr];
    if (custom) return Array.isArray(custom) ? custom : [custom];
    const d = new Date(dateStr);
    const isWknd = d.getDay() === 0 || d.getDay() === 6;
    return [{
      start: isWknd ? (data.doctorStartTimeWeekend || data.doctorStartTime || '10:00') : (data.doctorStartTime || '10:00'),
      end: isWknd ? (data.doctorEndTimeWeekend || data.doctorEndTime || '19:00') : (data.doctorEndTime || '19:00'),
    }];
  };
  const getDoctorHoursForDate = (dateStr) => getDoctorRangesForDate(dateStr)[0] || { start: '10:00', end: '19:00' };
  const isSlotOutsideDoctorHours = (dateStr, slotStart, slotEnd) => {
    if (noDoctorRequired) return false;
    if (!doctorDaysSet.has(dateStr)) return false;
    const ranges = getDoctorRangesForDate(dateStr);
    const sMin = toMin(slotStart);
    const eMin = toMin(slotEnd);
    // Slot is outside if it doesn't fit entirely within ANY range
    return !ranges.some(r => sMin >= toMin(r.start) && eMin <= toMin(r.end));
  };

  const todayStr = new Date().toISOString().substring(0, 10);
  const showFrom = data.showFrom || 'today'; // 'today' | 'tomorrow'
  const showFromDate = showFrom === 'tomorrow'
    ? new Date(new Date().getTime() + 86400000).toISOString().substring(0, 10)
    : todayStr;
  const endDate = data.endDate || ''; // 'YYYY-MM-DD' or '' for no limit

  // For today: compute current time in minutes for filtering past slots
  const nowMinutes = (() => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); })();

  const availByDate = {};
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${currentMonth}-${String(d).padStart(2, '0')}`;
    if (closedDaysSet.has(dateStr)) { availByDate[dateStr] = -1; continue; }
    if (dateStr < showFromDate || (endDate && dateStr > endDate)) { availByDate[dateStr] = 0; continue; }
    const slots = getSlotsForDate(dateStr);
    const free = slots.filter(s => {
      if (isSlotBooked(dateStr, s.start, s.end, bookedSlots)) return false;
      if (isSlotOutsideDoctorHours(dateStr, s.start, s.end)) return false;
      // For today with showFrom=today: exclude past slots from count
      if (dateStr === todayStr && showFrom === 'today') {
        const sMin = parseInt(s.start.split(':')[0]) * 60 + parseInt(s.start.split(':')[1]);
        if (sMin < nowMinutes) return false;
      }
      return true;
    }).length;
    availByDate[dateStr] = free;
  }

  const isSlotWithinDoctorHours = (dateStr, slotStart, slotEnd) => {
    if (!doctorDaysSet.has(dateStr)) return false;
    const ranges = getDoctorRangesForDate(dateStr);
    const sMin = toMin(slotStart);
    const eMin = toMin(slotEnd);
    return ranges.some(r => sMin >= toMin(r.start) && eMin <= toMin(r.end));
  };

  const isSlotPast = (dateStr, slotStart) => {
    if (dateStr !== todayStr || showFrom !== 'today') return false;
    const sMin = parseInt(slotStart.split(':')[0]) * 60 + parseInt(slotStart.split(':')[1]);
    return sMin < nowMinutes;
  };

  const selectedSlots = selectedDate ? getSlotsForDate(selectedDate)
    .filter(s => !isSlotPast(selectedDate, s.start))
    .map(s => ({
      ...s,
      booked: isSlotBooked(selectedDate, s.start, s.end, bookedSlots) || isSlotOutsideDoctorHours(selectedDate, s.start, s.end),
      doctorSlot: noDoctorRequired && isSlotWithinDoctorHours(selectedDate, s.start, s.end),
    })) : [];

  const freeCount = selectedSlots.filter(s => !s.booked).length;
  const totalCount = selectedSlots.length;
  const yearDisplay = lang === 'th' ? y + 543 : y;

  // ── Theme-aware color helpers ──
  // Dark = fire/ember theme, Light = clean standard
  const docCellBg = isDark ? 'border-sky-700/40' : 'bg-sky-100 border-sky-300';
  const availCellBg = isDark ? 'border-emerald-800/30' : 'bg-emerald-50 border-emerald-200';
  const availColor = isDark ? 'text-emerald-400' : 'text-emerald-600';
  const fullColor = isDark ? 'text-amber-400' : 'text-amber-600';
  const todayDotColor = isDark ? 'bg-orange-400' : 'bg-sky-500';
  const todayTextColor = isDark ? 'text-orange-400' : 'text-sky-600';
  const weekendColor = isDark ? 'text-rose-400/70' : 'text-rose-500/70';
  const docIconColor = isDark ? 'text-orange-400' : 'text-sky-500';
  const slotOpenBg = isDark ? 'border-orange-900/40' : 'bg-emerald-50 border-emerald-200';
  const slotOpenBadgeBg = isDark ? 'text-emerald-300 bg-emerald-900/50' : 'text-emerald-700 bg-emerald-100';
  const slotBookedBg = isDark ? 'bg-[var(--bg-hover)] border-[var(--bd)]' : 'bg-gray-50 border-gray-200';
  const legendDocBg = isDark ? 'bg-sky-900/50 border-sky-700/50' : 'bg-sky-100 border-sky-200';
  const legendAvailBg = isDark ? 'bg-emerald-900/30 border-emerald-800/40' : 'bg-emerald-100 border-emerald-200';

  // Fire/ember cell inline styles (dark mode only)
  const fireGlow = isDark ? {
    normal: {
      background: 'linear-gradient(to bottom, #0a0a0a 40%, #1a0800 70%, #2d0f00 100%)',
      boxShadow: 'inset 0 -8px 16px -4px rgba(255,80,0,0.15), inset 0 -2px 6px rgba(255,120,0,0.1)',
    },
    doctor: {
      background: 'linear-gradient(to bottom, #0a0a12 40%, #0a1020 70%, #0d1a30 100%)',
      boxShadow: 'inset 0 -8px 16px -4px rgba(56,189,248,0.15), inset 0 -2px 6px rgba(56,189,248,0.1)',
    },
    avail: {
      background: 'linear-gradient(to bottom, #0a0a0a 40%, #001a0a 70%, #002d10 100%)',
      boxShadow: 'inset 0 -8px 16px -4px rgba(16,185,129,0.15), inset 0 -2px 6px rgba(16,185,129,0.1)',
    },
    selected: {
      background: 'linear-gradient(to bottom, #7c2d12 0%, #ea580c 50%, #fb923c 100%)',
      boxShadow: '0 0 20px rgba(234,88,12,0.4), inset 0 1px 0 rgba(255,255,255,0.15)',
    },
    disabled: {
      background: '#080808',
    },
  } : null;

  return (
    <div className="min-h-screen bg-[var(--bg-base)] font-sans text-[var(--tx-body)]">
      {/* ── Header ── */}
      <header className={`px-4 py-3.5 sm:py-4 sticky top-0 z-10 ${isDark ? '' : 'bg-[var(--bg-card)] border-b border-[var(--bd)]'}`}
        style={isDark ? { background: 'linear-gradient(135deg, #0a0a0a 0%, #1a0800 50%, #0a0a0a 100%)', borderBottom: '1px solid #4a1a0a', boxShadow: '0 2px 20px rgba(200,60,0,0.1)' } : undefined}>
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="shrink-0 w-10 h-10 rounded-xl overflow-hidden"
              style={isDark ? { boxShadow: '0 0 12px rgba(220,38,38,0.3)', border: '1px solid #4a1a0a' } : undefined}>
              <ClinicLogo clinicSettings={cs} className="w-full h-full" showText={false} theme={theme} />
            </div>
            <div className="min-w-0">
              <h1 className={`text-base font-bold truncate tracking-tight ${isDark ? 'text-orange-100' : 'text-[var(--tx-heading)]'}`}>{cs.clinicName || 'Clinic'}</h1>
              <p className={`text-[11px] tracking-wide ${isDark ? 'text-orange-300/40' : 'text-[var(--tx-muted)]'}`}>{t.schedule}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={() => setLang(lang === 'th' ? 'en' : 'th')}
              className={`p-2 rounded-xl transition-colors text-[11px] font-bold flex items-center gap-1 ${isDark ? 'text-orange-300/60 hover:text-orange-200' : 'bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-[var(--tx-heading)]'}`}
              style={isDark ? { background: '#1a0a00', border: '1px solid #4a1a0a' } : undefined}
              title={lang === 'th' ? 'Switch to English' : 'เปลี่ยนเป็นภาษาไทย'}>
              <Globe size={14} />
              <span className="uppercase">{lang === 'th' ? 'EN' : 'TH'}</span>
            </button>
            <ThemeToggle theme={theme} setTheme={setTheme} />
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">

        {/* ── Month Navigation ── */}
        <div className="flex items-center justify-center gap-3">
          {months.length > 1 && (
            <button onClick={() => { setActiveMonthIdx(Math.max(0, activeMonthIdx - 1)); setSelectedDate(null); }}
              disabled={activeMonthIdx === 0}
              className={`p-2.5 rounded-xl transition-all disabled:opacity-20 ${isDark ? 'text-orange-400/60 hover:text-orange-300' : 'bg-[var(--bg-card)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-[var(--tx-heading)] hover:border-[var(--bd-strong)]'}`}
              style={isDark ? { background: '#1a0a00', border: '1px solid #4a1a0a' } : undefined}>
              <ChevronLeft size={18} />
            </button>
          )}
          <div className="text-center min-w-[180px]">
            <h2 className={`text-xl font-black tracking-tight ${isDark ? 'text-orange-100' : 'text-[var(--tx-heading)]'}`}
              style={isDark ? { textShadow: '0 0 20px rgba(251,146,60,0.2)' } : undefined}>
              {t.months[m - 1]}
            </h2>
            <p className={`text-sm font-medium -mt-0.5 ${isDark ? 'text-orange-300/40' : 'text-[var(--tx-muted)]'}`}>{yearDisplay}</p>
          </div>
          {months.length > 1 && (
            <button onClick={() => { setActiveMonthIdx(Math.min(months.length - 1, activeMonthIdx + 1)); setSelectedDate(null); }}
              disabled={activeMonthIdx >= months.length - 1}
              className={`p-2.5 rounded-xl transition-all disabled:opacity-20 ${isDark ? 'text-orange-400/60 hover:text-orange-300' : 'bg-[var(--bg-card)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-[var(--tx-heading)] hover:border-[var(--bd-strong)]'}`}
              style={isDark ? { background: '#1a0a00', border: '1px solid #4a1a0a' } : undefined}>
              <ChevronRight size={18} />
            </button>
          )}
        </div>

        {/* ── Calendar Card ── */}
        <div className={`rounded-2xl overflow-hidden shadow-lg ${isDark ? 'border-2' : 'bg-[var(--bg-card)] border border-[var(--bd)]'}`}
          style={isDark ? { borderColor: '#4a1a0a', background: '#0a0a0a', boxShadow: '0 0 30px rgba(200,60,0,0.08), 0 4px 20px rgba(0,0,0,0.5)' } : undefined}>
          {/* Day headers */}
          <div className={`grid grid-cols-7 ${isDark ? '' : 'border-b border-[var(--bd)]'}`}
            style={isDark ? { background: 'linear-gradient(135deg, #1a0800 0%, #2d0f00 50%, #1a0800 100%)', borderBottom: '1px solid #4a1a0a' } : undefined}>
            {t.days.map((d, i) => (
              <div key={i} className={`text-center text-[11px] font-bold py-3 tracking-wider ${isDark ? (i >= 5 ? 'text-red-400/80' : 'text-orange-300/70') : (i >= 5 ? weekendColor : 'text-[var(--tx-muted)]')}`}>{d}</div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7" style={isDark ? { gap: '1px', background: '#1a0a00' } : { gap: '1px', background: 'var(--bd)' }}>
            {Array.from({ length: calStart }).map((_, i) => (
              <div key={`e-${i}`} className="min-h-[52px]" style={isDark ? { background: '#080808' } : { background: 'var(--bg-card)' }} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${currentMonth}-${String(day).padStart(2, '0')}`;
              const isClosed = closedDaysSet.has(dateStr);
              const isDoctor = doctorDaysSet.has(dateStr);
              const avail = availByDate[dateStr] || 0;
              const isSelected = selectedDate === dateStr;
              const isToday = dateStr === todayStr;
              const dow = (calStart + i) % 7;
              const isWeekend = dow >= 5;
              const isPastCutoff = dateStr < showFromDate || (endDate && dateStr > endDate);
              const isDayDisabled = isPastCutoff || isClosed || (!noDoctorRequired && !isDoctor);

              // Light mode: use Tailwind classes
              let cellBg = 'bg-[var(--bg-card)]';
              let cellStyle = undefined;
              if (isDark && fireGlow) {
                if (isSelected) {
                  cellStyle = fireGlow.selected;
                } else if (isDayDisabled) {
                  cellStyle = fireGlow.disabled;
                } else if (isDoctor) {
                  cellStyle = fireGlow.doctor;
                } else if (avail > 0) {
                  cellStyle = fireGlow.avail;
                } else {
                  cellStyle = fireGlow.normal;
                }
                cellBg = '';
              } else {
                if (!isDayDisabled && !isSelected) {
                  if (isDoctor) cellBg = docCellBg;
                  else if (avail > 0) cellBg = availCellBg;
                }
                if (isSelected) cellBg = 'bg-sky-500';
              }

              const dayTextColor = isSelected ? (isDark ? 'text-white font-black' : 'text-white')
                : isDayDisabled ? (isDark ? 'text-gray-700' : 'text-[var(--tx-muted)] opacity-30')
                : isToday ? todayTextColor
                : isWeekend ? (isDark ? 'text-red-400' : weekendColor)
                : isDark ? (isDoctor ? 'text-sky-300' : avail > 0 ? 'text-emerald-300' : 'text-orange-200/90')
                : 'text-[var(--tx-heading)]';

              return (
                <button key={day} onClick={() => !isDayDisabled && setSelectedDate(isSelected ? null : dateStr)}
                  disabled={isDayDisabled}
                  className={`min-h-[52px] py-1.5 flex flex-col items-center justify-center gap-px transition-all relative
                    ${cellBg} ${isDayDisabled ? 'cursor-default' : 'cursor-pointer'}`}
                  style={cellStyle}>

                  {/* Today dot */}
                  {isToday && !isSelected && <span className={`absolute top-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full ${todayDotColor}`}
                    style={isDark ? { boxShadow: '0 0 6px rgba(251,146,60,0.8)' } : undefined} />}

                  {/* Date number */}
                  <span className={`font-bold text-sm leading-none ${dayTextColor}`}
                    style={isDark && isSelected ? { textShadow: '0 0 10px rgba(255,255,255,0.5)' } : undefined}>{day}</span>

                  {/* Doctor emoji (top-right corner) */}
                  {!isClosed && isDoctor && !isDayDisabled && (
                    <span className="absolute top-0.5 right-0.5 text-[8px] sm:text-[10px] leading-none">♥️</span>
                  )}

                  {/* Availability */}
                  {!isDayDisabled && !isClosed && avail > 0 && (
                    <span className={`text-[8px] font-bold leading-none ${isSelected ? (isDark ? 'text-white/80' : 'text-emerald-100') : availColor}`}>
                      {t.available} {avail}
                    </span>
                  )}
                  {!isDayDisabled && !isClosed && avail === 0 && (
                    <span className={`text-[8px] font-bold leading-none ${isSelected ? 'text-white/60' : fullColor}`}>
                      {t.full}
                    </span>
                  )}

                  {/* Today label */}
                  {isToday && (
                    <span className={`text-[7px] font-bold leading-none ${isSelected ? 'text-white/70' : todayTextColor}`}>{t.today}</span>
                  )}
                </button>
              );
            })}
            {/* Fill trailing cells */}
            {Array.from({ length: (7 - (calStart + daysInMonth) % 7) % 7 }).map((_, i) => (
              <div key={`trail-${i}`} className="min-h-[52px]" style={isDark ? { background: '#080808' } : { background: 'var(--bg-card)' }} />
            ))}
          </div>

          {/* Legend */}
          <div className={`flex items-center justify-center gap-4 py-2.5 text-[10px] ${isDark ? '' : 'border-t border-[var(--bd)] text-[var(--tx-muted)]'}`}
            style={isDark ? { borderTop: '1px solid #4a1a0a', background: 'linear-gradient(135deg, #1a0800 0%, #0a0a0a 100%)', color: '#a08060' } : undefined}>
            <span className="flex items-center gap-1.5">
              <span className="text-[11px]">♥️</span>
              {t.doctor}
            </span>
            <span className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-sm ${isDark ? '' : `${legendAvailBg} border`}`}
                style={isDark ? { background: 'linear-gradient(to bottom, #002d10, #001a0a)', border: '1px solid #1a4a2a' } : undefined} />
              {t.available}
            </span>
            <span className="flex items-center gap-1">
              <span className={`font-bold ${fullColor}`}>{t.full}</span>
            </span>
          </div>
        </div>

        {/* ── Hint ── */}
        {!selectedDate && (
          <p className="text-center text-[13px] text-[var(--tx-muted)] py-2">{t.selectDate}</p>
        )}

        {/* ── Time Slots ── */}
        {selectedDate && (
          <div className={`rounded-2xl overflow-hidden shadow-lg ${isDark ? 'border-2' : 'bg-[var(--bg-card)] border border-[var(--bd)]'}`}
            style={isDark ? { borderColor: '#4a1a0a', background: '#0a0a0a', boxShadow: '0 0 30px rgba(200,60,0,0.08), 0 4px 20px rgba(0,0,0,0.5)' } : undefined}>
            {/* Header */}
            <div className={`px-5 py-4 flex items-center justify-between ${isDark ? '' : 'border-b border-[var(--bd)]'}`}
              style={isDark ? { background: 'linear-gradient(135deg, #1a0800 0%, #2d0f00 50%, #1a0800 100%)', borderBottom: '1px solid #4a1a0a' } : undefined}>
              <div>
                <h3 className={`text-base font-bold flex items-center gap-2 ${isDark ? 'text-orange-200' : 'text-[var(--tx-heading)]'}`}>
                  <Clock size={16} className={docIconColor} />
                  {parseInt(selectedDate.split('-')[2])} {t.months[m - 1]} {yearDisplay}
                </h3>
                <div className="flex items-center gap-3 mt-1">
                  {doctorDaysSet.has(selectedDate) && (
                    <span className={`text-[11px] font-semibold flex items-center gap-1 ${docIconColor}`}>
                      <Stethoscope size={10} /> {t.doctor} {getDoctorRangesForDate(selectedDate).map(r => `${r.start}-${r.end}`).join(', ')}
                    </span>
                  )}
                  <span className={`text-[11px] ${isDark ? 'text-orange-300/60' : 'text-[var(--tx-muted)]'}`}>
                    {freeCount}/{totalCount} {t.available}
                  </span>
                </div>
              </div>
              <button onClick={() => setSelectedDate(null)}
                className={`p-2 rounded-xl transition-colors ${isDark ? 'text-orange-400/60 hover:text-orange-300' : 'bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-[var(--tx-heading)]'}`}
                style={isDark ? { background: '#1a0a00', border: '1px solid #4a1a0a' } : undefined}>
                <X size={16} />
              </button>
            </div>

            {/* Slot list */}
            <div className="p-4 space-y-2">
              {selectedSlots.map((slot) => {
                const slotStyle = isDark && !slot.booked ? {
                  background: slot.doctorSlot
                    ? 'linear-gradient(135deg, #0a0a12 0%, #0d1a30 100%)'
                    : 'linear-gradient(135deg, #0a0a0a 0%, #1a0800 100%)',
                  border: `1px solid ${slot.doctorSlot ? '#1a3050' : '#3a1a0a'}`,
                } : isDark && slot.booked ? {
                  background: '#080808',
                  border: '1px solid #1a1a1a',
                } : undefined;

                return (
                  <div key={slot.start}
                    className={`flex items-center rounded-xl px-4 py-3 transition-all ${isDark ? '' : `border ${
                      slot.booked ? `${slotBookedBg} opacity-40`
                        : slot.doctorSlot ? 'bg-sky-50 border-sky-200'
                        : slotOpenBg
                    }`} ${isDark && slot.booked ? 'opacity-30' : ''}`}
                    style={slotStyle}>
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <div>
                        <span className={`text-lg font-bold tabular-nums ${slot.booked ? 'text-[var(--tx-muted)]' : (isDark ? 'text-orange-100' : 'text-[var(--tx-heading)]')}`}>
                          {slot.start}
                        </span>
                        <span className={`mx-1.5 text-sm ${isDark ? 'text-orange-300/40' : 'text-[var(--tx-muted)]'}`}>{t.to}</span>
                        <span className={`text-sm font-medium tabular-nums ${isDark ? 'text-orange-300/50' : 'text-[var(--tx-muted)]'}`}>
                          {slot.end}
                        </span>
                      </div>
                      {slot.doctorSlot && !slot.booked && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${isDark ? 'bg-sky-900/50 text-sky-300' : 'bg-sky-100 text-sky-600'}`}>
                          {t.doctor}
                        </span>
                      )}
                    </div>
                    <div className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg ${
                      slot.booked ? (isDark ? 'text-gray-600 bg-gray-900/40' : 'text-[var(--tx-muted)] bg-[var(--bg-hover2)]')
                        : slot.doctorSlot ? (isDark ? 'text-sky-300 bg-sky-900/40' : 'text-sky-700 bg-sky-100')
                        : slotOpenBadgeBg
                    }`}>
                      {slot.booked ? <XCircle size={12} /> : <CheckCircle2 size={12} />}
                      {slot.booked ? t.unavailable : t.available}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Contact ── */}
        {(cs.lineOfficialUrl || cs.clinicPhone) && (
          <div className={`rounded-2xl overflow-hidden shadow-lg ${isDark ? 'border-2' : 'bg-[var(--bg-card)] border border-[var(--bd)]'}`}
            style={isDark ? { borderColor: '#4a1a0a', background: '#0a0a0a', boxShadow: '0 0 30px rgba(200,60,0,0.08), 0 4px 20px rgba(0,0,0,0.5)' } : undefined}>
            <div className="px-5 py-5 text-center">
              <p className={`text-sm font-medium mb-4 ${isDark ? 'text-orange-300/60' : 'text-[var(--tx-muted)]'}`}>{t.contact}</p>
              <div className="flex justify-center gap-3">
                {cs.lineOfficialUrl && (
                  <a href={cs.lineOfficialUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white transition-all hover:scale-[1.02] active:scale-[0.98] shadow-md"
                    style={{ backgroundColor: '#06C755' }}>
                    <MessageCircle size={18} /> LINE
                  </a>
                )}
                {cs.clinicPhone && (
                  <a href={`tel:${cs.clinicPhone}`}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white transition-all hover:scale-[1.02] active:scale-[0.98] shadow-md"
                    style={{ backgroundColor: ac }}>
                    <Phone size={18} /> {t.call}
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        <p className="text-[11px] text-center text-[var(--tx-muted)] opacity-60 pb-4">
          {t.dataAt} {data.createdAt?.toDate ? data.createdAt.toDate().toLocaleString(lang === 'th' ? 'th-TH' : 'en-US', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' }) : '—'}
        </p>
      </div>
    </div>
  );
}
