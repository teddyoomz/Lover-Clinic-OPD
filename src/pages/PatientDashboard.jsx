import { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, appId } from '../firebase.js';
import { hexToRgb } from '../utils.js';
import * as broker from '../lib/brokerClient.js';
import ClinicLogo from '../components/ClinicLogo.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { Package, PackageX, CalendarClock, Phone, PhoneCall, AlertCircle, Loader2,
         CheckCircle2, XCircle, RefreshCw, MapPin, Clock, Stethoscope, MessageCircle } from 'lucide-react';

// ── i18n ──────────────────────────────────────────────────────────────────────
const TX = {
  th: {
    loading: 'กำลังโหลด', headerSub: 'ข้อมูลผู้ป่วย',
    disabled: 'ลิงก์ถูกปิดชั่วคราว', disabledSub: 'กรุณาติดต่อคลินิกเพื่อขอลิงก์ใหม่',
    notfound: 'ไม่พบข้อมูล', notfoundSub: 'URL นี้ไม่ถูกต้องหรือหมดอายุแล้ว',
    unknown: 'ไม่ระบุชื่อ',
    syncReq: 'กำลังส่งคำขอ...', syncIng: 'กำลัง Sync ข้อมูล',
    syncDone: 'Sync เสร็จ', syncFail: 'Sync ไม่สำเร็จ', readySync: 'Sync ล่าสุด',
    syncData: 'Sync ข้อมูล', resync: 'ลอง Sync ใหม่', cooldownMin: 'นาที',
    apptLabel: 'นัดหมายถัดไป', coursesLabel: 'คอร์สของฉัน', expiredLabel: 'คอร์สหมดอายุ',
    noCourses: 'ไม่มีคอร์สคงเหลือ', noData: 'ยังไม่มีข้อมูลคอร์ส',
    noDataSub: 'ข้อมูลจะแสดงหลังจากที่คลินิกดึงข้อมูลจากระบบ',
    syncingCourses: 'กำลัง Sync ข้อมูลคอร์ส...', requesting: 'กำลังส่งคำขอไปยังคลินิก...',
    updatedAt: 'อัพเดท', poweredBy: 'จัดทำโดย', active: 'กำลังใช้งาน',
  },
  en: {
    loading: 'Loading', headerSub: 'Patient Dashboard',
    disabled: 'Link Disabled', disabledSub: 'Please contact the clinic for a new link.',
    notfound: 'Not Found', notfoundSub: 'This URL is invalid or has expired.',
    unknown: 'Unknown',
    syncReq: 'Requesting...', syncIng: 'Syncing data',
    syncDone: 'Synced', syncFail: 'Sync failed', readySync: 'Last sync',
    syncData: 'Sync Data', resync: 'Retry Sync', cooldownMin: 'min',
    apptLabel: 'Upcoming Appointments', coursesLabel: 'My Courses', expiredLabel: 'Expired Courses',
    noCourses: 'No active courses', noData: 'No course data yet',
    noDataSub: 'Data will appear after the clinic syncs from the system.',
    syncingCourses: 'Syncing course data...', requesting: 'Sending request to clinic...',
    updatedAt: 'Updated', poweredBy: 'Powered by', active: 'Active',
  },
};

// ── helpers ──────────────────────────────────────────────────────────────────

// cooldown อ่านจาก clinicSettings.patientSyncCooldownMins (set โดย admin)
// ค่า default fallback 60 นาที ถ้ายังไม่ได้ตั้งค่า

function formatSyncTime(fetchedAt, lang = 'th') {
  if (!fetchedAt) return null;
  try {
    const d = new Date(fetchedAt);
    const locale = lang === 'en' ? 'en-US' : 'th-TH';
    const isToday = d.toDateString() === new Date().toDateString();
    const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    if (isToday) return lang === 'en' ? time : `${time} น.`;
    const dateStr = d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
    return lang === 'en' ? `${dateStr} ${time}` : `${dateStr} ${time} น.`;
  } catch { return null; }
}

function parseDateParts(dateStr = '', lang = 'th') {
  const m = dateStr.match(/^(\d+)\s+(.+)$/);
  if (!m) return { day: '', rest: dateStr };
  let rest = m[2];
  if (lang === 'en') rest = translateThaiDate(rest);
  return { day: m[1], rest };
}

const TH_MONTHS = { 'มกราคม':'January','กุมภาพันธ์':'February','มีนาคม':'March','เมษายน':'April','พฤษภาคม':'May','มิถุนายน':'June','กรกฎาคม':'July','สิงหาคม':'August','กันยายน':'September','ตุลาคม':'October','พฤศจิกายน':'November','ธันวาคม':'December',
  'ม.ค.':'Jan','ก.พ.':'Feb','มี.ค.':'Mar','เม.ย.':'Apr','พ.ค.':'May','มิ.ย.':'Jun','ก.ค.':'Jul','ส.ค.':'Aug','ก.ย.':'Sep','ต.ค.':'Oct','พ.ย.':'Nov','ธ.ค.':'Dec' };

function translateThaiDate(str) {
  let out = str;
  for (const [th, en] of Object.entries(TH_MONTHS)) out = out.replace(th, en);
  return out;
}

function translateThaiUnit(str, lang) {
  if (lang !== 'en' || !str) return str;
  return str.replace(/ครั้ง/g, 'times').replace(/ซีซี/g, 'cc').replace(/หน่วย/g, 'units');
}

function getInitials(firstName = '', lastName = '') {
  const f = firstName.trim()[0] || '';
  const l = lastName.trim()[0] || '';
  if (f || l) return (f + l).toUpperCase();
  return '?';
}

// ── CourseCard ────────────────────────────────────────────────────────────────

function CourseCard({ c, expired, accentRgb, tx, lang }) {
  const hasValue  = c.value && !c.value.includes('0.00');
  const expiryText = (c.expiry || '').replace('ใช้ได้ถึง ', '').replace('ไม่มีวันหมดอายุ', lang === 'en' ? 'No expiry' : 'ไม่มีวันหมดอายุ');
  const qtyText = translateThaiUnit(c.qty, lang);
  const isActive  = c.status === 'กำลังใช้งาน';

  const cardBase = expired
    ? { className: 'rounded-2xl border border-red-900/40 bg-red-950/10 p-4 flex flex-col gap-2.5', style: { boxShadow: '0 0 10px rgba(239,68,68,0.06), var(--shadow-card)' } }
    : isActive
    ? { className: 'rounded-2xl border border-teal-700/40 bg-teal-950/[0.18] p-4 flex flex-col gap-2.5', style: { boxShadow: '0 0 12px rgba(45,212,191,0.08), 0 0 0 1px rgba(45,212,191,0.06), var(--shadow-card)' } }
    : { className: 'rounded-2xl border border-[#1a1a1a] bg-[#0f0f0f] p-4 flex flex-col gap-2.5', style: { boxShadow: 'var(--shadow-card)' } };

  return (
    <div className={cardBase.className} style={cardBase.style}>
      {/* Name + status */}
      <div className="flex items-start justify-between gap-2">
        <span className={`font-bold text-sm leading-snug ${expired ? 'text-red-300/80' : 'text-white'}`}>
          {c.name}
        </span>
        {c.status && (
          <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full shrink-0 ${
            expired  ? 'bg-red-950/50 border border-red-900/50 text-red-400'
            : isActive ? 'bg-teal-950/60 border border-teal-800/60 text-teal-300'
            : 'bg-white/5 border border-white/10 text-gray-500'
          }`}>{isActive ? tx.active : c.status}</span>
        )}
      </div>

      {/* Product + qty */}
      {c.product && (
        <p className="text-[11px] text-gray-500 flex items-center gap-1.5 leading-relaxed">
          <span>{c.product}</span>
          {qtyText && qtyText !== c.product && (
            <span className="font-mono font-bold text-gray-300 bg-[#1a1a1a] px-1.5 py-0.5 rounded-md">
              {qtyText}
            </span>
          )}
        </p>
      )}

      {/* Expiry + value */}
      {(expiryText || hasValue) && (
        <div className="flex flex-wrap gap-2 pt-0.5">
          {expiryText && (
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-lg border ${
              expired ? 'text-red-500/80 border-red-900/30 bg-red-950/20'
              : 'text-gray-500 border-[#1a1a1a] bg-[#0f0f0f]'
            }`}>{expiryText}</span>
          )}
          {hasValue && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-lg border text-teal-400 border-teal-900/40 bg-teal-950/20">
              {c.value}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── SyncButton — unified status chip + resync button ─────────────────────────

function SyncButton({ syncStatus, syncTimeStr, inCooldown, cooldownMins, onResync, tx }) {
  // Loading states → non-interactive chip
  if (syncStatus === 'requesting' || syncStatus === 'syncing') {
    const isReq = syncStatus === 'requesting';
    return (
      <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-semibold ${isReq ? 'text-gray-400 border-gray-700/60 bg-gray-900/40' : 'text-teal-300 border-teal-800/60 bg-teal-950/40'}`}>
        {isReq
          ? <RefreshCw size={11} className="animate-spin shrink-0" />
          : <Loader2   size={11} className="animate-spin shrink-0" />}
        <span>{isReq ? tx.syncReq : tx.syncIng}</span>
      </div>
    );
  }

  const isError = syncStatus === 'timeout' || syncStatus === 'error';
  const isReady = !inCooldown;

  // Build label
  let icon, label;
  if (isReady) {
    icon = <RefreshCw size={11} className="shrink-0" />;
    if (!syncTimeStr) {
      // ไม่มีเวลาเก่า = ยังไม่เคย sync หรือ timeout ที่ไม่มีข้อมูล
      label = tx.syncData;
    } else {
      const base = isError ? tx.resync : tx.readySync;
      label = `${base} — ${syncTimeStr}`;
    }
  } else {
    // ใน cooldown
    const countdown = `⏰ ${cooldownMins} ${tx.cooldownMin}`;
    if (!syncTimeStr) {
      // ไม่มีเวลาเก่า → แสดงแค่ countdown
      icon = <CheckCircle2 size={11} className="shrink-0" />;
      label = countdown;
    } else {
      const base = isError ? tx.syncFail : tx.syncDone;
      icon = isError
        ? <XCircle      size={11} className="shrink-0" />
        : <CheckCircle2 size={11} className="shrink-0" />;
      label = `${base} — ${syncTimeStr}  |  ${countdown}`;
    }
  }

  const isDone = !isError && syncStatus === 'done';
  return (
    <button
      onClick={isReady ? onResync : undefined}
      disabled={!isReady}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-semibold transition-all ${
        isReady
          ? 'cursor-pointer text-yellow-300 border-yellow-600/40 bg-yellow-950/30 hover:bg-yellow-950/50 active:scale-95'
          : isDone
          ? 'cursor-default'
          : 'cursor-default text-gray-500 border-gray-700/30 bg-gray-900/20'
      }`}
      {...(isDone && !isReady ? { style: { color: '#059669', borderColor: 'rgba(5,150,105,0.5)', background: 'rgba(5,150,105,0.08)' } } : {})}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

// ── AppointmentCard ───────────────────────────────────────────────────────────

function AppointmentCard({ a, lang }) {
  const { day, rest } = parseDateParts(a.date, lang);
  return (
    <div className="rounded-2xl border border-violet-800/30 bg-violet-950/[0.22] overflow-hidden flex"
      style={{ boxShadow: '0 0 15px rgba(139,92,246,0.08), var(--shadow-card)' }}>
      {/* Date sidebar */}
      <div className="flex flex-col items-center justify-center px-4 py-4 bg-violet-900/[0.35] border-r border-violet-800/20 min-w-[64px] gap-0.5">
        <span className="text-2xl font-black text-white leading-none">{day}</span>
        <span className="text-[9px] font-bold text-violet-300 text-center leading-tight">{rest}</span>
      </div>
      {/* Details */}
      <div className="flex flex-col gap-1.5 px-4 py-3.5 flex-1 min-w-0">
        {a.time && (
          <div className="flex items-center gap-1.5">
            <Clock size={11} className="text-violet-400/70 shrink-0" />
            <span className="text-sm font-bold text-white">{a.time}</span>
          </div>
        )}
        {a.doctor && (
          <div className="flex items-center gap-1.5">
            <Stethoscope size={11} className="text-violet-400/70 shrink-0" />
            <span className="text-xs text-gray-300">{a.doctor}</span>
          </div>
        )}
        {(a.branch || a.room) && (
          <div className="flex items-center gap-1.5">
            <MapPin size={11} className="text-violet-400/70 shrink-0" />
            <span className="text-xs text-gray-400">{[a.branch, a.room].filter(Boolean).join(' · ')}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ icon, label, count, accent, meta }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span style={{ color: accent, filter: `drop-shadow(0 0 4px ${accent}60)` }}>{icon}</span>
      <h3 className="text-[11px] font-black uppercase tracking-[0.15em]" style={{ color: accent }}>{label}</h3>
      {count != null && (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
          style={{ color: accent, borderColor: `${accent}40`, background: `${accent}10`, boxShadow: `0 0 8px ${accent}15` }}>
          {count}
        </span>
      )}
      {meta && <span className="ml-auto text-[10px] text-gray-600 font-mono">{meta}</span>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const SYNC_TIMEOUT_MS = 20_000; // 20 วิ

export default function PatientDashboard({ token, clinicSettings, clinicSettingsLoaded, theme, setTheme, isAdminView }) {
  // cooldown ที่ admin กำหนด (0 = ไม่จำกัด); admin view ไม่มี cooldown
  const COURSES_REFRESH_COOLDOWN_MS = isAdminView ? 0 : ((clinicSettings?.patientSyncCooldownMins ?? 0) * 60_000);
  const [status, setStatus]           = useState('loading');
  const [sessionData, setSessionData] = useState(null);
  const [justSynced, setJustSynced]   = useState(false);
  const [syncTimedOut, setSyncTimedOut] = useState(false);
  const [scriptSyncing, setScriptSyncing] = useState(false); // local loading state for script mode
  const [language, setLanguage]       = useState('th');
  const [, forceUpdate]               = useState(0); // ticker สำหรับ countdown
  const prevFetchedAtRef    = useRef(null);
  const syncTimeoutRef      = useRef(null);
  const sessionIdRef        = useRef(null);
  const refreshRequestedRef = useRef(false);
  const sessionDataRef      = useRef(null); // ref สำหรับใช้ใน timer callback
  const cooldownMsRef       = useRef(0);   // sync กับ COURSES_REFRESH_COOLDOWN_MS ทุก render

  // อัพเดท countdown ทุก 30 วิ + ยิง re-render ตรงๆ เมื่อ cooldown หมดพอดี
  useEffect(() => {
    const id = setInterval(() => forceUpdate(n => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const last = sessionData?.lastCoursesAutoFetch;
    if (!last || COURSES_REFRESH_COOLDOWN_MS <= 0) return;
    const remaining = COURSES_REFRESH_COOLDOWN_MS - (Date.now() - last.toMillis());
    if (remaining <= 0) return;
    const id = setTimeout(() => forceUpdate(n => n + 1), remaining + 50);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionData?.lastCoursesAutoFetch?.toMillis?.(), COURSES_REFRESH_COOLDOWN_MS]);

  // Auto-sync on page load: เรียก API ตรงเสมอ (ไม่พึ่ง AdminDashboard relay — patient page ต้อง self-sufficient)
  useEffect(() => {
    if (!clinicSettingsLoaded || !sessionData?.brokerProClinicId || refreshRequestedRef.current) return;
    const last = sessionData.lastCoursesAutoFetch;
    const cooling = cooldownMsRef.current > 0 && last && (Date.now() - last.toMillis()) < cooldownMsRef.current;
    if (!cooling) {
      refreshRequestedRef.current = true;
      fetchCoursesViaApi(sessionData.id, sessionData.brokerProClinicId);
    }
  }, [clinicSettingsLoaded, sessionData?.id]);

  // Schedule auto-sync เมื่อ cooldown หมดอายุ (กรณีเปิดหน้าค้างไว้)
  useEffect(() => {
    if (!sessionData?.brokerProClinicId || refreshRequestedRef.current) return;
    const last = sessionData.lastCoursesAutoFetch;
    const cooldown = isAdminView ? 0 : ((clinicSettings?.patientSyncCooldownMins ?? 0) * 60_000);
    if (cooldown <= 0 || !last) return;
    const remaining = cooldown - (Date.now() - last.toMillis());
    if (remaining <= 0) return;
    const id = setTimeout(() => {
      const d = sessionDataRef.current;
      if (!d || refreshRequestedRef.current || d.coursesRefreshRequest) return;
      refreshRequestedRef.current = true;
      if (d.brokerProClinicId) {
        fetchCoursesViaApi(d.id, d.brokerProClinicId);
      }
    }, remaining + 200);
    return () => clearTimeout(id);
  }, [sessionData?.lastCoursesAutoFetch]);

  // sync ref ทุก render เพื่อให้ snapshot callback ใช้ค่า cooldown ล่าสุดเสมอ
  cooldownMsRef.current = COURSES_REFRESH_COOLDOWN_MS;

  const ac    = clinicSettings?.accentColor || '#dc2626';
  const acRgb = hexToRgb(ac);
  const tx    = TX[language];

  // Cleanup timeout on unmount
  useEffect(() => () => { if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current); }, []);

  function startSyncTimeout() {
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(() => {
      syncTimeoutRef.current = null;
      setSyncTimedOut(true);
    }, SYNC_TIMEOUT_MS);
  }

  function clearSyncTimeout() {
    if (syncTimeoutRef.current) { clearTimeout(syncTimeoutRef.current); syncTimeoutRef.current = null; }
  }

  // Script mode: call courses API directly and write results to Firestore
  async function fetchCoursesViaApi(sid, proClinicId) {
    setSyncTimedOut(false);
    setJustSynced(false);
    setScriptSyncing(true);
    startSyncTimeout();
    try {
      const ref = doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', sid);
      await updateDoc(ref, { lastCoursesAutoFetch: serverTimestamp(), coursesRefreshRequest: null });
      const result = await broker.getCourses(proClinicId);
      clearSyncTimeout();
      setScriptSyncing(false);
      // Set justSynced BEFORE Firestore write so snapshot doesn't briefly show wrong state
      if (result?.success) setJustSynced(true);
      else setSyncTimedOut(true);
      await updateDoc(ref, {
        brokerStatus: 'done', brokerError: null, brokerJob: null,
        latestCourses: {
          courses: result?.courses || [], expiredCourses: result?.expiredCourses || [],
          appointments: result?.appointments || [], patientName: result?.patientName || '',
          jobId: `courses_patient_${sid}_${Date.now()}`, fetchedAt: new Date().toISOString(),
          success: !!result?.success, error: result?.error || null,
        },
      });
    } catch (e) {
      console.error('fetchCoursesViaApi:', e);
      clearSyncTimeout();
      setScriptSyncing(false);
      setSyncTimedOut(true);
    }
  }

  async function handleResync() {
    // ใช้ ref เพื่อหลีกเลี่ยง stale closure (state อาจ lag หลัง snapshot fire)
    const sd = sessionDataRef.current;
    if (!sessionIdRef.current || !sd) return;
    // cooldown guard (skip เมื่อ cooldown = 0 เช่น admin view)
    const cooldownMs = cooldownMsRef.current;
    if (cooldownMs > 0) {
      const lastFetch = sd.lastCoursesAutoFetch;
      if (lastFetch && (Date.now() - lastFetch.toMillis()) < cooldownMs) return;
    }
    // เรียก API ตรง
    if (sd.brokerProClinicId) {
      refreshRequestedRef.current = true;
      return fetchCoursesViaApi(sessionIdRef.current, sd.brokerProClinicId);
    }
  }

  useEffect(() => {
    if (!token) { setStatus('notfound'); return; }
    const q = query(
      collection(db, 'artifacts', appId, 'public', 'data', 'opd_sessions'),
      where('patientLinkToken', '==', token)
    );
    const unsub = onSnapshot(q, (snap) => {
      if (snap.empty) { setStatus('notfound'); return; }
      const d = snap.docs[0];
      const data = { id: d.id, ...d.data() };
      if (!data.patientLinkEnabled) { setStatus('disabled'); return; }
      sessionIdRef.current = data.id;
      setSessionData(data);
      setStatus('done');

      const newFetchedAt = data.latestCourses?.fetchedAt || null;
      if (newFetchedAt && newFetchedAt !== prevFetchedAtRef.current) {
        prevFetchedAtRef.current = newFetchedAt;
        clearSyncTimeout();
        setSyncTimedOut(false);
        if (data.latestCourses?.success !== false) setJustSynced(true);
      }

      sessionDataRef.current = data;

    }, () => setStatus('notfound'));
    return () => unsub();
  }, [token]);

  // ── Loading ────────────────────────────────────────────────────────────────
  // ── Controls bar (reused in loading/error/main screens) ───────────────────
  const Controls = () => (
    <>
      {isAdminView && (
        <button
          onClick={() => window.history.back()}
          className="absolute top-4 left-4 z-20 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-black/40 border border-white/10 backdrop-blur-sm text-xs font-bold text-gray-300 hover:text-white transition-colors"
        >
          ← Admin
        </button>
      )}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
        {theme && setTheme && <ThemeToggle theme={theme} setTheme={setTheme} compact />}
        <div className="flex bg-black/40 border border-white/10 rounded-lg overflow-hidden backdrop-blur-sm">
          <button onClick={() => setLanguage('th')}
            className={`px-3 py-2 text-xs font-bold transition-colors ${language === 'th' ? 'text-white' : 'text-gray-500 hover:text-white'}`}
            style={language === 'th' ? { backgroundColor: ac } : {}}>TH</button>
          <button onClick={() => setLanguage('en')}
            className={`px-3 py-2 text-xs font-bold transition-colors ${language === 'en' ? 'text-white' : 'text-gray-500 hover:text-white'}`}
            style={language === 'en' ? { backgroundColor: ac } : {}}>EN</button>
        </div>
      </div>
    </>
  );

  if (status === 'loading') {
    return (
      <div className="relative flex flex-col items-center justify-center min-h-screen gap-4 bg-[#050505]">
        <Controls />
        <Loader2 size={28} className="animate-spin" style={{ color: ac }} />
        <p className="text-[11px] font-black uppercase tracking-[0.25em] text-gray-600">{tx.loading}</p>
      </div>
    );
  }

  // ── Error / disabled ───────────────────────────────────────────────────────
  if (status === 'notfound' || status === 'disabled') {
    return (
      <div className="relative flex flex-col items-center justify-center min-h-screen gap-5 bg-[#050505] px-8 text-center">
        <Controls />
        <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center">
          <AlertCircle size={28} className="text-gray-600" />
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-black uppercase tracking-widest text-gray-400">
            {status === 'disabled' ? tx.disabled : tx.notfound}
          </p>
          <p className="text-xs text-gray-600 max-w-[260px] leading-relaxed">
            {status === 'disabled' ? tx.disabledSub : tx.notfoundSub}
          </p>
        </div>
      </div>
    );
  }

  // ── Data ───────────────────────────────────────────────────────────────────
  const d             = sessionData.patientData || {};
  const courses       = sessionData.latestCourses?.courses       || [];
  const expiredCourses = sessionData.latestCourses?.expiredCourses || [];
  const appointments  = sessionData.latestCourses?.appointments  || [];
  const plName        = sessionData.latestCourses?.patientName;
  const hn            = sessionData.brokerProClinicHN || '';
  const fetchedAt     = sessionData.latestCourses?.fetchedAt || null;
  const syncTimeStr   = formatSyncTime(fetchedAt, language);
  const formName      = `${d.prefix || ''} ${d.firstName || ''} ${d.lastName || ''}`.trim();
  const patientName   = (plName && plName !== '0') ? plName : formName;

  const isCoursesJob = sessionData.brokerJob?.type === 'LC_GET_COURSES';
  const syncStatus =
    syncTimedOut                                                   ? 'timeout'
    : scriptSyncing                                                ? 'syncing'
    : sessionData.coursesRefreshRequest                            ? 'requesting'
    : (sessionData.brokerStatus === 'pending' && isCoursesJob)    ? 'syncing'
    : sessionData.latestCourses?.success === false                 ? 'error'
    : justSynced                                                   ? 'done'
    : 'idle';

  const hasData = sessionData.latestCourses != null;

  // ─── Cooldown ───────────────────────────────────────────────────────────────
  const lastAutoFetch = sessionData.lastCoursesAutoFetch;
  const cooldownRemainingMs = (COURSES_REFRESH_COOLDOWN_MS > 0 && lastAutoFetch)
    ? Math.max(0, COURSES_REFRESH_COOLDOWN_MS - (Date.now() - lastAutoFetch.toMillis()))
    : 0;
  const inCooldown   = cooldownRemainingMs > 0;
  const configuredMins = clinicSettings?.patientSyncCooldownMins ?? 0;
  const cooldownMins = Math.min(Math.ceil(cooldownRemainingMs / 60_000), configuredMins);

  return (
    <div className="min-h-screen bg-[#050505] text-gray-200">

      {/* ── Hero header ─────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden">
        {/* Radial glow — intensified */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: `radial-gradient(ellipse 90% 80% at 50% -10%, rgba(${acRgb},0.30) 0%, transparent 65%)` }} />
        <div className="absolute bottom-0 left-0 right-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, rgba(${acRgb},0.35), transparent)` }} />

        {/* Controls top-right */}
        <Controls />

        <div className="relative flex flex-col items-center gap-3 pt-10 pb-8 px-6">
          <ClinicLogo
            clinicSettings={clinicSettings}
            className="h-14 sm:h-16 md:h-20 max-w-[200px] sm:max-w-[240px]"
            center
            theme={theme}
          />
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-gray-600 mt-1">
            {tx.headerSub}
          </p>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto px-4 sm:px-6 pb-12 pt-5 flex flex-col gap-5">

        {/* Patient info card */}
        <div className="rounded-2xl border bg-[#0f0f0f] overflow-hidden"
          style={{ borderColor: `rgba(${acRgb},0.15)`, boxShadow: `var(--shadow-panel), 0 0 30px rgba(${acRgb},0.06), inset 0 1px 0 rgba(255,255,255,0.04)` }}>
          {/* Accent top bar */}
          <div className="h-0.5 w-full" style={{ background: `linear-gradient(90deg, transparent, rgba(${acRgb},0.8), transparent)` }} />

          <div className="px-5 pt-5 pb-4 flex gap-4 items-start">
            {/* Avatar — glowing red ring */}
            <div className="w-16 h-16 rounded-full shrink-0 flex items-center justify-center text-xl font-black select-none"
              style={{
                background: `radial-gradient(135deg, rgba(${acRgb},0.12) 0%, var(--bg-card) 100%)`,
                border: `2px solid rgba(${acRgb},0.5)`,
                color: 'var(--tx-primary)',
                boxShadow: `0 0 18px rgba(${acRgb},0.35), 0 0 40px rgba(${acRgb},0.12), inset 0 0 12px rgba(${acRgb},0.08)`,
              }}>
              {getInitials(d.firstName || patientName, d.lastName)}
            </div>

            {/* Info */}
            <div className="flex flex-col gap-2 pt-0.5 min-w-0 flex-1">
              <p className="text-xl font-black text-white leading-snug">{patientName || tx.unknown}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {hn && (
                  <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg"
                    style={{ color: 'var(--tx-secondary)', background: 'var(--bg-hover)', border: '1px solid var(--bd)' }}>
                    HN {hn}
                  </span>
                )}
                {d.phone && (
                  <span className="text-xs text-gray-500 flex items-center gap-1.5">
                    <Phone size={11} className="text-gray-600" />{d.phone}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Sync button strip */}
          <div className="px-5 pb-4 pt-1 flex justify-center">
            <SyncButton
              syncStatus={syncStatus}
              syncTimeStr={syncTimeStr}
              inCooldown={inCooldown}
              cooldownMins={cooldownMins}
              onResync={handleResync}
              tx={tx}
            />
          </div>
        </div>

        {/* ── Contact Buttons (LINE + Call) ────────────────────────────────── */}
        {(clinicSettings?.lineOfficialUrl || clinicSettings?.clinicPhone) && (
          <div className="rounded-2xl border bg-[#0f0f0f] overflow-hidden"
            style={{ borderColor: `rgba(${acRgb},0.12)`, boxShadow: `var(--shadow-panel), 0 0 25px rgba(${acRgb},0.05)` }}>
            {/* Accent top bar */}
            <div className="h-px w-full" style={{ background: `linear-gradient(90deg, transparent 5%, rgba(6,199,85,0.35) 25%, rgba(${acRgb},0.3) 50%, rgba(${acRgb},0.35) 75%, transparent 95%)` }} />

            <div className="grid" style={{ gridTemplateColumns: clinicSettings?.lineOfficialUrl && clinicSettings?.clinicPhone ? '1fr auto 1fr' : '1fr' }}>

              {/* LINE Official */}
              {clinicSettings?.lineOfficialUrl && (
                <a
                  href={clinicSettings.lineOfficialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative flex items-center gap-3.5 px-5 py-4 transition-all duration-300 active:scale-[0.98]"
                >
                  {/* Hover glow */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-400 pointer-events-none"
                    style={{ background: 'radial-gradient(ellipse at 30% 50%, rgba(6,199,85,0.08) 0%, transparent 70%)' }} />

                  {/* Icon */}
                  <div className="relative w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border transition-all duration-300 group-hover:shadow-[0_0_20px_rgba(6,199,85,0.25),0_0_40px_rgba(6,199,85,0.08)]"
                    style={{ background: 'rgba(6,199,85,0.08)', borderColor: 'rgba(6,199,85,0.22)', boxShadow: '0 0 8px rgba(6,199,85,0.08)' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" className="group-hover:scale-110 transition-transform duration-300" style={{ fill: '#06C755' }}><path d="M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/></svg>
                  </div>

                  {/* Text */}
                  <div className="relative flex flex-col gap-0.5 min-w-0">
                    <span className="text-[11px] font-black uppercase tracking-[0.12em] text-[#06C755]">LINE</span>
                    <span className="text-[10px] text-gray-500 group-hover:text-gray-400 transition-colors truncate">
                      {language === 'en' ? 'Contact Clinic' : 'ติดต่อคลินิก'}
                    </span>
                  </div>

                  {/* Arrow */}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className="ml-auto shrink-0 text-gray-700 group-hover:text-[#06C755]/60 group-hover:translate-x-0.5 transition-all duration-300">
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </a>
              )}

              {/* Divider */}
              {clinicSettings?.lineOfficialUrl && clinicSettings?.clinicPhone && (
                <div className="w-px self-stretch my-3" style={{ background: `linear-gradient(180deg, transparent, rgba(${acRgb},0.12), transparent)` }} />
              )}

              {/* Call Clinic */}
              {clinicSettings?.clinicPhone && (
                <a
                  href={`tel:${clinicSettings.clinicPhone.replace(/[^0-9+]/g, '')}`}
                  className="group relative flex items-center gap-3.5 px-5 py-4 transition-all duration-300 active:scale-[0.98]"
                >
                  {/* Hover glow */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-400 pointer-events-none"
                    style={{ background: `radial-gradient(ellipse at 30% 50%, rgba(${acRgb},0.08) 0%, transparent 70%)` }} />

                  {/* Icon */}
                  <div className="relative w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border transition-all duration-300 group-hover:shadow-[0_0_20px_var(--phone-glow),0_0_40px_var(--phone-glow2)]"
                    style={{ background: `rgba(${acRgb},0.08)`, borderColor: `rgba(${acRgb},0.22)`, boxShadow: `0 0 8px rgba(${acRgb},0.10)`, '--phone-glow': `rgba(${acRgb},0.30)`, '--phone-glow2': `rgba(${acRgb},0.08)` }}>
                    <PhoneCall size={18} className="group-hover:scale-110 transition-transform duration-300 group-hover:animate-[wiggle_0.5s_ease-in-out]" style={{ color: ac }} />
                  </div>

                  {/* Text */}
                  <div className="relative flex flex-col gap-0.5 min-w-0">
                    <span className="text-[11px] font-black uppercase tracking-[0.12em] text-white">
                      {language === 'en' ? 'Call' : 'โทรหาคลินิก'}
                    </span>
                    <span className="text-[10px] text-gray-500 group-hover:text-gray-400 transition-colors font-mono truncate">
                      {clinicSettings.clinicPhone}
                    </span>
                  </div>

                  {/* Arrow */}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className="ml-auto shrink-0 text-gray-700 group-hover:text-gray-400 group-hover:translate-x-0.5 transition-all duration-300">
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </a>
              )}
            </div>

            {/* Bottom accent line */}
            <div className="h-px w-full" style={{ background: `linear-gradient(90deg, transparent 10%, rgba(6,199,85,0.10) 25%, rgba(${acRgb},0.10) 50%, rgba(${acRgb},0.10) 75%, transparent 90%)` }} />
          </div>
        )}

        {/* ── Appointments ───────────────────────────────────────────────────── */}
        {appointments.length > 0 && (
          <section>
            <SectionHeader
              icon={<CalendarClock size={14} />}
              label={tx.apptLabel}
              count={appointments.length}
              accent="#a78bfa"
            />
            <div className="flex flex-col gap-2.5">
              {appointments.map((a, i) => <AppointmentCard key={i} a={a} lang={language} />)}
            </div>
          </section>
        )}

        {/* ── Courses ────────────────────────────────────────────────────────── */}
        {hasData ? (
          <>
            {courses.length > 0 && (
              <section>
                <SectionHeader
                  icon={<Package size={14} />}
                  label={tx.coursesLabel}
                  count={courses.length}
                  accent="#2dd4bf"
                  meta={syncStatus === 'idle' && syncTimeStr ? `${tx.updatedAt} ${syncTimeStr}` : undefined}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {courses.map((c, i) => <CourseCard key={i} c={c} expired={false} accentRgb={acRgb} tx={tx} lang={language} />)}
                </div>
              </section>
            )}

            {courses.length === 0 && (
              <div className="rounded-2xl border border-[#1a1a1a] bg-[#0f0f0f] p-8 text-center flex flex-col items-center gap-2">
                <Package size={28} className="text-gray-700" />
                <p className="text-xs font-black uppercase tracking-widest text-gray-600">{tx.noCourses}</p>
              </div>
            )}

            {expiredCourses.length > 0 && (
              <section>
                <SectionHeader
                  icon={<PackageX size={14} />}
                  label={tx.expiredLabel}
                  count={expiredCourses.length}
                  accent="#f87171"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {expiredCourses.map((c, i) => <CourseCard key={i} c={c} expired={true} accentRgb={acRgb} tx={tx} lang={language} />)}
                </div>
              </section>
            )}
          </>
        ) : (syncStatus === 'requesting' || syncStatus === 'syncing') ? (
          <div className="rounded-2xl border border-[#1a1a1a] bg-[#0f0f0f] p-10 flex flex-col items-center gap-3">
            <Loader2 size={24} className="animate-spin text-gray-600" />
            <p className="text-xs font-black uppercase tracking-widest text-gray-600">
              {syncStatus === 'syncing' ? tx.syncingCourses : tx.requesting}
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-[#1a1a1a] bg-[#0f0f0f] p-10 flex flex-col items-center gap-2">
            <CalendarClock size={28} className="text-gray-700" />
            <p className="text-xs font-black uppercase tracking-widest text-gray-600">{tx.noData}</p>
            <p className="text-[10px] text-gray-700 text-center max-w-[220px] leading-relaxed mt-0.5">
              {tx.noDataSub}
            </p>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-[10px] text-gray-700 pt-2">
          {tx.poweredBy} {clinicSettings?.clinicName || 'คลินิก'}
        </p>
      </div>
    </div>
  );
}
