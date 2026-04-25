import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, appId, auth } from '../firebase.js';
import { CalendarDays, ChevronLeft, ChevronRight, X, Clock, Stethoscope, Phone, MessageCircle, Globe, CheckCircle2, XCircle } from 'lucide-react';
import ClinicLogo from '../components/ClinicLogo.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { bangkokNow, thaiTodayISO, thaiNowMinutes } from '../utils.js';
import {
  generateTimeSlots, isSlotBooked, getDoctorRangesForDate,
  isSlotOutsideDoctorHours,
} from '../lib/scheduleFilterUtils.js';

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
    doctorFree: 'หมอว่าง',
    doctorBusy: 'หมอไม่ว่าง',
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
    doctorFree: 'Doctor Free',
    doctorBusy: 'Doctor Busy',
    to: 'to',
    contact: 'Interested? Contact us',
    call: 'Call',
    dataAt: 'Data as of',
    selectDate: 'Select a date to view available times',
  },
};

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

  // 2026-04-25 race fix: track auth-ready state. App.jsx anon-auth gate
  // keeps users from reaching this component pre-auth, but defense in
  // depth — if firestore.rules require isSignedIn() and we subscribe
  // pre-auth, the snapshot returns empty → 'notfound' flashes. Wait for
  // auth.currentUser before subscribing.
  const [authReady, setAuthReady] = useState(!!auth.currentUser);
  useEffect(() => {
    if (auth.currentUser) { setAuthReady(true); return; }
    const unsub = auth.onAuthStateChanged((u) => { if (u) setAuthReady(true); });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!token) { setStatus('notfound'); return; }
    if (!authReady) return;
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
  }, [token, authReady]);

  // ── Loading ──
  if (status === 'loading') {
    return (
      <div className={`flex flex-col items-center justify-center min-h-screen gap-3 ${isDark ? 'bg-[#050505] text-gray-500' : 'bg-gradient-to-b from-pink-50 via-white to-pink-50 text-pink-400'}`}>
        <div className={`w-10 h-10 rounded-full border-2 animate-spin ${isDark ? 'border-gray-800 border-t-red-400' : 'border-pink-200 border-t-pink-500'}`} />
        <p className="text-sm font-medium">{t.loading}</p>
      </div>
    );
  }

  // ── Not found / Expired ──
  if (status === 'notfound' || status === 'expired') {
    return (
      <div className={`flex flex-col items-center justify-center min-h-screen gap-4 p-8 ${isDark ? 'bg-[#050505] text-gray-500' : 'bg-gradient-to-b from-pink-50 via-white to-pink-50 text-pink-400'}`}>
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${isDark ? 'bg-gray-900 border border-gray-800' : 'bg-pink-50 border border-pink-200'}`}>
          <CalendarDays size={28} className="opacity-30" />
        </div>
        <div className="text-center">
          <p className={`text-lg font-bold ${isDark ? 'text-red-50' : 'text-gray-800'}`}>{status === 'expired' ? t.expired : t.notFound}</p>
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
  const doctorBookedSlots = data.doctorBookedSlots || [];
  const noDoctorRequired = data.noDoctorRequired || false;
  // Admin-controlled flag — whether to render the "หมอว่าง / หมอไม่ว่าง"
  // badge on each slot in ไม่พบแพทย์ mode. Default: hide (explicit true only).
  const showDoctorStatus = data.showDoctorStatus === true;
  const customDoctorHours = data.customDoctorHours || {};

  const weekdaySlots = generateTimeSlots(data.clinicOpenTime || '10:00', data.clinicCloseTime || '19:00', data.slotDurationMins || 60);
  const weekendSlots = generateTimeSlots(data.clinicOpenTimeWeekend || data.clinicOpenTime || '10:00', data.clinicCloseTimeWeekend || data.clinicCloseTime || '17:00', data.slotDurationMins || 60);
  const isWeekendDate = (dateStr) => {
    // YYYY-MM-DD → parse at UTC midnight so day-of-week is timezone-invariant.
    const [y, mo, d] = (dateStr || '').split('-').map(Number);
    const dow = new Date(Date.UTC(y, (mo || 1) - 1, d || 1)).getUTCDay();
    return dow === 0 || dow === 6;
  };
  const getSlotsForDate = (dateStr) => isWeekendDate(dateStr) ? weekendSlots : weekdaySlots;

  const toMin = (t) => parseInt(t.split(':')[0]) * 60 + parseInt(t.split(':')[1]);
  const getDoctorHoursForDate = (dateStr) => getDoctorRangesForDate(dateStr, data)[0] || { start: '10:00', end: '19:00' };

  // Thai time (GMT+7) — critical: `.toISOString().slice(0,10)` would emit UTC
  // and drift to the previous day between 00:00–07:00 Thai, breaking "today"
  // highlighting and past-slot filtering for the clinic's timezone.
  const todayStr = thaiTodayISO();
  const showFrom = data.showFrom || 'today'; // 'today' | 'tomorrow'
  const showFromDate = showFrom === 'tomorrow'
    ? (() => { const t = bangkokNow(); t.setUTCDate(t.getUTCDate() + 1); return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`; })()
    : todayStr;
  const endDate = data.endDate || ''; // 'YYYY-MM-DD' or '' for no limit

  // For today: compute current Thai time in minutes for filtering past slots
  const nowMinutes = thaiNowMinutes();

  const availByDate = {};
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${currentMonth}-${String(d).padStart(2, '0')}`;
    if (closedDaysSet.has(dateStr)) { availByDate[dateStr] = -1; continue; }
    if (dateStr < showFromDate || (endDate && dateStr > endDate)) { availByDate[dateStr] = 0; continue; }
    const slots = getSlotsForDate(dateStr);
    const free = slots.filter(s => {
      if (isSlotBooked(dateStr, s.start, s.end, bookedSlots)) return false;
      if (isSlotOutsideDoctorHours(dateStr, s.start, s.end, data)) return false;
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
    const ranges = getDoctorRangesForDate(dateStr, data);
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
      booked: isSlotBooked(selectedDate, s.start, s.end, bookedSlots) || isSlotOutsideDoctorHours(selectedDate, s.start, s.end, data),
      doctorSlot: showDoctorStatus && noDoctorRequired && isSlotWithinDoctorHours(selectedDate, s.start, s.end),
      doctorBusy: showDoctorStatus && noDoctorRequired && isSlotWithinDoctorHours(selectedDate, s.start, s.end) && isSlotBooked(selectedDate, s.start, s.end, doctorBookedSlots),
    })) : [];

  const freeCount = selectedSlots.filter(s => !s.booked).length;
  const totalCount = selectedSlots.length;
  const yearDisplay = lang === 'th' ? y + 543 : y;

  // ── Theme-aware color helpers ──
  // Dark = fire/ember (red-black), Light = sakura (pink-white)
  const docCellBg = isDark ? 'border-sky-700/40' : '';
  const availCellBg = isDark ? 'border-emerald-800/30' : '';
  const availColor = isDark ? 'text-emerald-400' : 'text-emerald-600';
  const fullColor = isDark ? 'text-orange-400' : 'text-pink-500';
  const todayDotColor = isDark ? 'bg-orange-400' : 'bg-pink-500';
  const todayTextColor = isDark ? 'text-orange-400' : 'text-pink-600';
  const weekendColor = isDark ? 'text-rose-400/70' : 'text-rose-400';
  const docIconColor = isDark ? 'text-orange-400' : 'text-pink-500';
  const slotOpenBg = isDark ? 'border-orange-900/40' : '';
  const slotOpenBadgeBg = isDark ? 'text-emerald-300 bg-emerald-900/50' : 'text-emerald-700 bg-emerald-100';
  const slotBookedBg = isDark ? 'bg-[var(--bg-hover)] border-[var(--bd)]' : '';
  const legendDocBg = isDark ? 'bg-sky-900/50 border-sky-700/50' : '';
  const legendAvailBg = isDark ? 'bg-emerald-900/30 border-emerald-800/40' : '';

  // Sakura cell inline styles (light mode only)
  const sakuraGlow = !isDark ? {
    normal: {
      background: 'linear-gradient(to bottom, #ffffff 40%, #fdf2f8 70%, #fce7f3 100%)',
      border: '1px solid rgba(236,72,153,0.12)',
    },
    doctor: {
      background: 'linear-gradient(to bottom, #fdf2f8 30%, #fce7f3 60%, #fbcfe8 100%)',
      border: '1px solid rgba(236,72,153,0.22)',
      boxShadow: 'inset 0 -4px 10px -4px rgba(236,72,153,0.08)',
    },
    avail: {
      background: 'linear-gradient(to bottom, #ffffff 40%, #f0fdf4 70%, #ecfdf5 100%)',
      border: '1px solid rgba(16,185,129,0.15)',
    },
    selected: {
      background: 'linear-gradient(to bottom, #ec4899 0%, #f472b6 50%, #f9a8d4 100%)',
      boxShadow: '0 0 16px rgba(236,72,153,0.3), inset 0 1px 0 rgba(255,255,255,0.3)',
    },
    disabled: {
      background: '#fafafa',
    },
  } : null;

  // Fire/ember cell inline styles (dark mode only) — orange ember glow
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
    <div className={`min-h-screen font-sans ${isDark ? 'bg-[#050505] text-gray-200' : 'bg-gradient-to-b from-pink-50 via-white to-pink-50/30 text-gray-800'}`}>
      {/* ── Header ── */}
      <header className="px-4 py-3.5 sm:py-4 sticky top-0 z-10"
        style={isDark
          ? { background: 'linear-gradient(135deg, #0a0a0a 0%, #1a0000 50%, #0a0a0a 100%)', borderBottom: '1px solid #5a1010', boxShadow: '0 2px 20px rgba(220,38,38,0.1)' }
          : { background: 'linear-gradient(135deg, #fff5f7 0%, #ffffff 50%, #fdf2f8 100%)', borderBottom: '1px solid rgba(236,72,153,0.15)', boxShadow: '0 2px 12px rgba(236,72,153,0.04)' }
        }>
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="shrink-0 w-10 h-10 rounded-xl overflow-hidden"
              style={isDark ? { boxShadow: '0 0 12px rgba(220,38,38,0.3)', border: '1px solid #5a1010' } : { boxShadow: '0 0 8px rgba(236,72,153,0.12)', border: '1px solid rgba(236,72,153,0.15)' }}>
              <ClinicLogo clinicSettings={cs} className="w-full h-full" showText={false} theme={theme} />
            </div>
            <div className="min-w-0">
              <h1 className={`text-base font-bold truncate tracking-tight ${isDark ? 'text-red-50' : 'text-gray-800'}`}>{cs.clinicName || 'Clinic'}</h1>
              <p className={`text-[11px] tracking-wide ${isDark ? 'text-red-300/40' : 'text-pink-400/60'}`}>{t.schedule}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={() => setLang(lang === 'th' ? 'en' : 'th')}
              className={`p-2 rounded-xl transition-colors text-[11px] font-bold flex items-center gap-1 ${isDark ? 'text-red-300/60 hover:text-red-200' : 'text-pink-400 hover:text-pink-600'}`}
              style={isDark ? { background: '#1a0000', border: '1px solid #5a1010' } : { background: 'rgba(244,114,182,0.06)', border: '1px solid rgba(236,72,153,0.15)' }}
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
              className={`p-2.5 rounded-xl transition-all disabled:opacity-20 ${isDark ? 'text-orange-400/60 hover:text-orange-300' : 'text-pink-400 hover:text-pink-600'}`}
              style={isDark ? { background: '#1a0a00', border: '1px solid #4a1a0a' } : { background: 'rgba(244,114,182,0.06)', border: '1px solid rgba(236,72,153,0.15)' }}>
              <ChevronLeft size={18} />
            </button>
          )}
          <div className="text-center min-w-[180px]">
            <h2 className={`text-xl font-black tracking-tight ${isDark ? 'text-orange-100' : 'text-pink-800'}`}
              style={isDark ? { textShadow: '0 0 20px rgba(251,146,60,0.2)' } : undefined}>
              {t.months[m - 1]}
            </h2>
            <p className={`text-sm font-medium -mt-0.5 ${isDark ? 'text-orange-300/40' : 'text-pink-400/60'}`}>{yearDisplay}</p>
          </div>
          {months.length > 1 && (
            <button onClick={() => { setActiveMonthIdx(Math.min(months.length - 1, activeMonthIdx + 1)); setSelectedDate(null); }}
              disabled={activeMonthIdx >= months.length - 1}
              className={`p-2.5 rounded-xl transition-all disabled:opacity-20 ${isDark ? 'text-orange-400/60 hover:text-orange-300' : 'text-pink-400 hover:text-pink-600'}`}
              style={isDark ? { background: '#1a0a00', border: '1px solid #4a1a0a' } : { background: 'rgba(244,114,182,0.06)', border: '1px solid rgba(236,72,153,0.15)' }}>
              <ChevronRight size={18} />
            </button>
          )}
        </div>

        {/* ── Calendar Card ── */}
        <div className="rounded-2xl overflow-hidden shadow-lg border-2"
          style={isDark
            ? { borderColor: '#4a1a0a', background: '#0a0a0a', boxShadow: '0 0 30px rgba(200,60,0,0.08), 0 4px 20px rgba(0,0,0,0.5)' }
            : { borderColor: 'rgba(236,72,153,0.18)', background: '#ffffff', boxShadow: '0 4px 20px rgba(236,72,153,0.06)' }
          }>
          {/* Day headers */}
          <div className="grid grid-cols-7"
            style={isDark
              ? { background: 'linear-gradient(135deg, #1a0800 0%, #2d0f00 50%, #1a0800 100%)', borderBottom: '1px solid #4a1a0a' }
              : { background: 'linear-gradient(135deg, #fdf2f8 0%, #fce7f3 50%, #fdf2f8 100%)', borderBottom: '1px solid rgba(236,72,153,0.12)' }
            }>
            {t.days.map((d, i) => (
              <div key={i} className={`text-center text-[11px] font-bold py-3 tracking-wider ${isDark ? (i >= 5 ? 'text-red-400/80' : 'text-orange-300/70') : (i >= 5 ? 'text-rose-400' : 'text-pink-400/70')}`}>{d}</div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7" style={isDark ? { gap: '1px', background: '#1a0a00' } : { gap: '1px', background: 'rgba(236,72,153,0.08)' }}>
            {Array.from({ length: calStart }).map((_, i) => (
              <div key={`e-${i}`} className="min-h-[52px]" style={isDark ? { background: '#080808' } : { background: '#fafafa' }} />
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

              // Both modes use inline styles for gradients
              let cellBg = '';
              let cellStyle = undefined;
              const glowSet = isDark ? fireGlow : sakuraGlow;
              if (glowSet) {
                if (isSelected) {
                  cellStyle = glowSet.selected;
                } else if (isDayDisabled) {
                  cellStyle = glowSet.disabled;
                } else if (isDoctor) {
                  cellStyle = glowSet.doctor;
                } else if (avail > 0) {
                  cellStyle = glowSet.avail;
                } else {
                  cellStyle = glowSet.normal;
                }
              }

              const dayTextColor = isSelected ? (isDark ? 'text-white font-black' : 'text-white font-black')
                : isDayDisabled ? (isDark ? 'text-gray-700' : 'text-gray-300')
                : isToday ? todayTextColor
                : isWeekend ? (isDark ? 'text-red-400' : 'text-rose-400')
                : isDark ? (isDoctor ? 'text-sky-300' : avail > 0 ? 'text-emerald-300' : 'text-orange-200/90')
                : (isDoctor ? 'text-pink-700' : avail > 0 ? 'text-emerald-700' : 'text-gray-700');

              return (
                <button key={day} onClick={() => !isDayDisabled && setSelectedDate(isSelected ? null : dateStr)}
                  disabled={isDayDisabled}
                  className={`min-h-[52px] py-1.5 flex flex-col items-center justify-center gap-px transition-all relative
                    ${cellBg} ${isDayDisabled ? 'cursor-default' : 'cursor-pointer'}`}
                  style={cellStyle}>

                  {/* Today dot */}
                  {isToday && !isSelected && <span className={`absolute top-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full ${todayDotColor}`}
                    style={isDark ? { boxShadow: '0 0 6px rgba(251,146,60,0.8)' } : { boxShadow: '0 0 6px rgba(236,72,153,0.6)' }} />}

                  {/* Date number */}
                  <span className={`font-bold text-sm leading-none ${dayTextColor}`}
                    style={isDark && isSelected ? { textShadow: '0 0 10px rgba(255,255,255,0.5)' } : undefined}>{day}</span>

                  {/* Doctor emoji (top-right corner) */}
                  {!isClosed && isDoctor && !isDayDisabled && (
                    <span className="absolute top-0.5 right-0.5 text-[8px] sm:text-xs leading-none">🔥</span>
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
              <div key={`trail-${i}`} className="min-h-[52px]" style={isDark ? { background: '#080808' } : { background: '#fafafa' }} />
            ))}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-4 py-2.5 text-xs"
            style={isDark
              ? { borderTop: '1px solid #4a1a0a', background: 'linear-gradient(135deg, #1a0800 0%, #0a0a0a 100%)', color: '#a08060' }
              : { borderTop: '1px solid rgba(236,72,153,0.12)', background: 'linear-gradient(135deg, #fdf2f8 0%, #ffffff 100%)', color: '#9ca3af' }
            }>
            <span className="flex items-center gap-1.5">
              <span className="text-[11px]">🔥</span>
              {t.doctor}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm"
                style={isDark
                  ? { background: 'linear-gradient(to bottom, #002d10, #001a0a)', border: '1px solid #1a4a2a' }
                  : { background: 'linear-gradient(to bottom, #ecfdf5, #f0fdf4)', border: '1px solid rgba(16,185,129,0.2)' }
                } />
              {t.available}
            </span>
            <span className="flex items-center gap-1">
              <span className={`font-bold ${fullColor}`}>{t.full}</span>
            </span>
          </div>
        </div>

        {/* ── Hint ── */}
        {!selectedDate && (
          <p className={`text-center text-[13px] py-2 ${isDark ? 'text-orange-300/30' : 'text-pink-400/60'}`}>{t.selectDate}</p>
        )}

        {/* ── Time Slots ── */}
        {selectedDate && (
          <div className="rounded-2xl overflow-hidden shadow-lg border-2"
            style={isDark
              ? { borderColor: '#4a1a0a', background: '#0a0a0a', boxShadow: '0 0 30px rgba(200,60,0,0.08), 0 4px 20px rgba(0,0,0,0.5)' }
              : { borderColor: 'rgba(236,72,153,0.18)', background: '#ffffff', boxShadow: '0 4px 20px rgba(236,72,153,0.06)' }
            }>
            {/* Header */}
            <div className="px-5 py-4 flex items-center justify-between"
              style={isDark
                ? { background: 'linear-gradient(135deg, #1a0800 0%, #2d0f00 50%, #1a0800 100%)', borderBottom: '1px solid #4a1a0a' }
                : { background: 'linear-gradient(135deg, #fdf2f8 0%, #fce7f3 50%, #fdf2f8 100%)', borderBottom: '1px solid rgba(236,72,153,0.12)' }
              }>
              <div>
                <h3 className={`text-base font-bold flex items-center gap-2 ${isDark ? 'text-orange-200' : 'text-pink-800'}`}>
                  <Clock size={16} className={docIconColor} />
                  {parseInt(selectedDate.split('-')[2])} {t.months[m - 1]} {yearDisplay}
                </h3>
                <div className="flex items-center gap-3 mt-1">
                  {doctorDaysSet.has(selectedDate) && (
                    <span className={`text-[11px] font-semibold flex items-center gap-1 ${docIconColor}`}>
                      <Stethoscope size={10} /> {t.doctor} {getDoctorRangesForDate(selectedDate, data).map(r => `${r.start}-${r.end}`).join(', ')}
                    </span>
                  )}
                  <span className={`text-[11px] ${isDark ? 'text-orange-300/60' : 'text-pink-400/60'}`}>
                    {freeCount}/{totalCount} {t.available}
                  </span>
                </div>
              </div>
              <button onClick={() => setSelectedDate(null)}
                className={`p-2 rounded-xl transition-colors ${isDark ? 'text-orange-400/60 hover:text-orange-300' : 'text-pink-400 hover:text-pink-600'}`}
                style={isDark ? { background: '#1a0a00', border: '1px solid #4a1a0a' } : { background: 'rgba(244,114,182,0.06)', border: '1px solid rgba(236,72,153,0.15)' }}>
                <X size={16} />
              </button>
            </div>

            {/* Slot list */}
            <div className="p-4 space-y-2">
              {selectedSlots.map((slot) => {
                const slotStyle = isDark ? (
                  !slot.booked ? {
                    background: slot.doctorSlot
                      ? 'linear-gradient(135deg, #0a0a12 0%, #0d1a30 100%)'
                      : 'linear-gradient(135deg, #0a0a0a 0%, #1a0800 100%)',
                    border: `1px solid ${slot.doctorSlot ? '#1a3050' : '#3a1a0a'}`,
                  } : {
                    background: '#080808',
                    border: '1px solid #1a1a1a',
                  }
                ) : (
                  !slot.booked ? {
                    background: slot.doctorSlot
                      ? 'linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%)'
                      : 'linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)',
                    border: `1px solid ${slot.doctorSlot ? 'rgba(236,72,153,0.15)' : 'rgba(16,185,129,0.15)'}`,
                  } : {
                    background: '#fafafa',
                    border: '1px solid #e5e7eb',
                  }
                );

                return (
                  <div key={slot.start}
                    className={`flex items-center rounded-xl px-4 py-3 transition-all ${(isDark && slot.booked) || (!isDark && slot.booked) ? 'opacity-30' : ''}`}
                    style={slotStyle}>
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <div>
                        <span className={`text-lg font-bold tabular-nums ${slot.booked ? (isDark ? 'text-gray-600' : 'text-gray-400') : (isDark ? 'text-orange-100' : 'text-gray-800')}`}>
                          {slot.start}
                        </span>
                        <span className={`mx-1.5 text-sm ${isDark ? 'text-orange-300/40' : 'text-pink-300'}`}>{t.to}</span>
                        <span className={`text-sm font-medium tabular-nums ${isDark ? 'text-orange-300/50' : 'text-pink-400/70'}`}>
                          {slot.end}
                        </span>
                      </div>
                      {slot.doctorSlot && !slot.booked && (
                        <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
                          slot.doctorBusy
                            ? (isDark ? 'bg-orange-900/50 text-orange-300' : 'bg-orange-100 text-orange-600')
                            : (isDark ? 'bg-sky-900/50 text-sky-300' : 'bg-pink-100 text-pink-600')
                        }`}>
                          {slot.doctorBusy ? t.doctorBusy : t.doctorFree}
                        </span>
                      )}
                    </div>
                    <div className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg ${
                      slot.booked ? (isDark ? 'text-gray-600 bg-gray-900/40' : 'text-gray-400 bg-gray-100')
                        : slot.doctorSlot ? (isDark ? 'text-sky-300 bg-sky-900/40' : 'text-pink-600 bg-pink-100')
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
          <div className="rounded-2xl overflow-hidden shadow-lg border-2"
            style={isDark
              ? { borderColor: '#4a1a0a', background: '#0a0a0a', boxShadow: '0 0 30px rgba(200,60,0,0.08), 0 4px 20px rgba(0,0,0,0.5)' }
              : { borderColor: 'rgba(236,72,153,0.18)', background: 'linear-gradient(135deg, #fff5f7 0%, #ffffff 50%, #fdf2f8 100%)', boxShadow: '0 4px 16px rgba(236,72,153,0.06)' }
            }>
            <div className="px-5 py-5 text-center">
              <p className={`text-sm font-medium mb-4 ${isDark ? 'text-orange-300/60' : 'text-pink-400/60'}`}>{t.contact}</p>
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
        <p className={`text-[11px] text-center opacity-60 pb-4 ${isDark ? 'text-orange-300/30' : 'text-pink-400/50'}`}>
          {t.dataAt} {data.createdAt?.toDate ? data.createdAt.toDate().toLocaleString(lang === 'th' ? 'th-TH' : 'en-US', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' }) : '—'}
        </p>
      </div>
    </div>
  );
}
