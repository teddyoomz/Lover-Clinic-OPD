import { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, appId } from '../firebase.js';
import { hexToRgb } from '../utils.js';
import ClinicLogo from '../components/ClinicLogo.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { Package, PackageX, CalendarClock, Phone, AlertCircle, Loader2,
         CheckCircle2, XCircle, RefreshCw, MapPin, Clock, Stethoscope } from 'lucide-react';

// ── i18n ──────────────────────────────────────────────────────────────────────
const TX = {
  th: {
    loading: 'กำลังโหลด', headerSub: 'ข้อมูลผู้ป่วย',
    disabled: 'ลิงก์ถูกปิดชั่วคราว', disabledSub: 'กรุณาติดต่อคลินิกเพื่อขอลิงก์ใหม่',
    notfound: 'ไม่พบข้อมูล', notfoundSub: 'URL นี้ไม่ถูกต้องหรือหมดอายุแล้ว',
    unknown: 'ไม่ระบุชื่อ',
    syncReq: 'กำลังส่งคำขอ...', syncIng: 'กำลัง Sync ข้อมูล',
    syncDone: 'Sync เสร็จ', syncFail: 'Sync ไม่สำเร็จ',
    syncTimeout: 'Sync ไม่สำเร็จ', syncLast: 'ข้อมูลล่าสุด',
    resync: 'ลอง Sync ใหม่',
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
    syncDone: 'Synced', syncFail: 'Sync failed',
    syncTimeout: 'Sync failed', syncLast: 'Last sync',
    resync: 'Retry Sync',
    apptLabel: 'Upcoming Appointments', coursesLabel: 'My Courses', expiredLabel: 'Expired Courses',
    noCourses: 'No active courses', noData: 'No course data yet',
    noDataSub: 'Data will appear after the clinic syncs from the system.',
    syncingCourses: 'Syncing course data...', requesting: 'Sending request to clinic...',
    updatedAt: 'Updated', poweredBy: 'Powered by', active: 'Active',
  },
};

// ── helpers ──────────────────────────────────────────────────────────────────

const COURSES_REFRESH_COOLDOWN_MS = 0; // 0 = debug; ตั้งเป็น 3600000 สำหรับ production

function formatSyncTime(fetchedAt) {
  if (!fetchedAt) return null;
  try {
    const d = new Date(fetchedAt);
    const isToday = d.toDateString() === new Date().toDateString();
    const time = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    if (isToday) return `${time} น.`;
    return `${d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} ${time} น.`;
  } catch { return null; }
}

function parseDateParts(dateStr = '') {
  const m = dateStr.match(/^(\d+)\s+(.+)$/);
  return m ? { day: m[1], rest: m[2] } : { day: '', rest: dateStr };
}

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || '?';
}

// ── CourseCard ────────────────────────────────────────────────────────────────

function CourseCard({ c, expired, accentRgb, tx }) {
  const hasValue  = c.value && !c.value.includes('0.00');
  const expiryText = (c.expiry || '').replace('ใช้ได้ถึง ', '').replace('ไม่มีวันหมดอายุ', '∞');
  const isActive  = c.status === 'กำลังใช้งาน';

  const cardBase = expired
    ? { className: 'rounded-2xl border border-red-900/40 bg-red-950/10 p-4 flex flex-col gap-2.5', style: { boxShadow: 'var(--shadow-card)' } }
    : isActive
    ? { className: 'rounded-2xl border border-teal-700/40 bg-teal-950/[0.18] p-4 flex flex-col gap-2.5', style: { boxShadow: '0 0 0 1px rgba(45,212,191,0.06), var(--shadow-card)' } }
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
          {c.qty && c.qty !== c.product && (
            <span className="font-mono font-bold text-gray-300 bg-[#1a1a1a] px-1.5 py-0.5 rounded-md">
              {c.qty}
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

// ── SyncChip ──────────────────────────────────────────────────────────────────

function SyncChip({ syncStatus, syncTimeStr, latestCourses, tx }) {
  const failLabel = syncTimeStr ? `${tx.syncFail} — ${tx.syncLast} ${syncTimeStr}` : tx.syncFail;
  const configs = {
    requesting: { icon: <RefreshCw size={11} className="animate-spin shrink-0" />, label: tx.syncReq, cls: 'text-gray-400 border-gray-700/60 bg-gray-900/40' },
    syncing:    { icon: <Loader2   size={11} className="animate-spin shrink-0" />, label: tx.syncIng,  cls: 'text-teal-300 border-teal-800/60 bg-teal-950/40' },
    done:       { icon: <CheckCircle2 size={11} className="shrink-0" />, label: syncTimeStr ? `${tx.syncDone} — ${syncTimeStr}` : tx.syncDone, cls: 'text-emerald-400 border-emerald-800/60 bg-emerald-950/40' },
    error:      { icon: <XCircle   size={11} className="shrink-0" />, label: failLabel, cls: 'text-red-400 border-red-700/60 bg-red-950/50' },
    timeout:    { icon: <XCircle   size={11} className="shrink-0" />, label: syncTimeStr ? `${tx.syncTimeout} — ${tx.syncLast} ${syncTimeStr}` : tx.syncTimeout, cls: 'text-amber-400 border-amber-700/60 bg-amber-950/50' },
  };
  const chip = configs[syncStatus];
  if (!chip) return null;
  return (
    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-semibold ${chip.cls}`}>
      {chip.icon}
      <span>{chip.label}</span>
      {syncStatus === 'error' && latestCourses?.error && (
        <span className="text-red-600 font-normal truncate max-w-[140px]">— {latestCourses.error}</span>
      )}
    </div>
  );
}

// ── AppointmentCard ───────────────────────────────────────────────────────────

function AppointmentCard({ a }) {
  const { day, rest } = parseDateParts(a.date);
  return (
    <div className="rounded-2xl border border-violet-800/30 bg-violet-950/[0.22] overflow-hidden flex"
      style={{ boxShadow: 'var(--shadow-card)' }}>
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
      <span style={{ color: accent }}>{icon}</span>
      <h3 className="text-[11px] font-black uppercase tracking-[0.15em]" style={{ color: accent }}>{label}</h3>
      {count != null && (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
          style={{ color: accent, borderColor: `${accent}40`, background: `${accent}10` }}>
          {count}
        </span>
      )}
      {meta && <span className="ml-auto text-[10px] text-gray-600 font-mono">{meta}</span>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const SYNC_TIMEOUT_MS = 20_000; // 20 วิ

export default function PatientDashboard({ token, clinicSettings, theme, setTheme }) {
  const [status, setStatus]           = useState('loading');
  const [sessionData, setSessionData] = useState(null);
  const [justSynced, setJustSynced]   = useState(false);
  const [syncTimedOut, setSyncTimedOut] = useState(false);
  const [language, setLanguage]       = useState('th');
  const refreshRequestedRef = useRef(false);
  const prevFetchedAtRef    = useRef(null);
  const syncTimeoutRef      = useRef(null);
  const sessionIdRef        = useRef(null);

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

  async function handleResync() {
    if (!sessionIdRef.current) return;
    setSyncTimedOut(false);
    setJustSynced(false);
    refreshRequestedRef.current = true;
    startSyncTimeout();
    try {
      const ref = doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', sessionIdRef.current);
      await updateDoc(ref, { coursesRefreshRequest: serverTimestamp() });
    } catch(e) {
      console.error(e);
      clearSyncTimeout();
      setSyncTimedOut(true);
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

      if (!refreshRequestedRef.current && data.brokerProClinicId) {
        const last = data.lastCoursesAutoFetch;
        const stillCoolingDown = last && (Date.now() - last.toMillis()) < COURSES_REFRESH_COOLDOWN_MS;
        const alreadyPending   = !!data.coursesRefreshRequest;
        if (!stillCoolingDown && !alreadyPending) {
          refreshRequestedRef.current = true;
          const ref = doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', data.id);
          updateDoc(ref, { coursesRefreshRequest: serverTimestamp() })
            .then(startSyncTimeout)
            .catch(console.error);
        }
      }
    }, () => setStatus('notfound'));
    return () => unsub();
  }, [token]);

  // ── Loading ────────────────────────────────────────────────────────────────
  // ── Controls bar (reused in loading/error/main screens) ───────────────────
  const Controls = () => (
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
  const syncTimeStr   = formatSyncTime(fetchedAt);
  const formName      = `${d.prefix || ''} ${d.firstName || ''} ${d.lastName || ''}`.trim();
  const patientName   = (plName && plName !== '0') ? plName : formName;

  const isCoursesJob = sessionData.brokerJob?.type === 'LC_GET_COURSES';
  const syncStatus =
    syncTimedOut                                                   ? 'timeout'
    : sessionData.coursesRefreshRequest                            ? 'requesting'
    : (sessionData.brokerStatus === 'pending' && isCoursesJob)    ? 'syncing'
    : sessionData.latestCourses?.success === false                 ? 'error'
    : justSynced                                                   ? 'done'
    : 'idle';

  const hasData = sessionData.latestCourses != null;

  return (
    <div className="min-h-screen bg-[#050505] text-gray-200">

      {/* ── Hero header ─────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden">
        {/* Radial glow */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: `radial-gradient(ellipse 90% 70% at 50% -5%, rgba(${acRgb},0.22) 0%, transparent 70%)` }} />
        <div className="absolute bottom-0 left-0 right-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, rgba(${acRgb},0.25), transparent)` }} />

        {/* Controls top-right */}
        <Controls />

        <div className="relative flex flex-col items-center gap-3 pt-10 pb-8 px-6">
          <ClinicLogo
            clinicSettings={clinicSettings}
            className="h-14 sm:h-16 md:h-20 max-w-[200px] sm:max-w-[240px]"
            center
            theme="dark"
          />
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-gray-600 mt-1">
            {tx.headerSub}
          </p>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto px-4 sm:px-6 pb-12 pt-5 flex flex-col gap-5">

        {/* Patient info card */}
        <div className="rounded-2xl border border-[#1a1a1a] bg-[#0f0f0f] overflow-hidden"
          style={{ boxShadow: 'var(--shadow-panel), inset 0 1px 0 rgba(255,255,255,0.04)' }}>
          {/* Accent top bar */}
          <div className="h-0.5 w-full" style={{ background: `linear-gradient(90deg, transparent, rgba(${acRgb},0.8), transparent)` }} />

          <div className="px-5 pt-5 pb-4 flex gap-4 items-start">
            {/* Avatar */}
            <div className="w-16 h-16 rounded-full shrink-0 flex items-center justify-center text-xl font-black select-none shadow-lg"
              style={{ background: `radial-gradient(135deg, rgba(${acRgb},0.35) 0%, rgba(${acRgb},0.12) 100%)`, border: `1.5px solid rgba(${acRgb},0.5)`, color: ac, boxShadow: `0 0 28px rgba(${acRgb},0.25), 0 0 0 4px rgba(${acRgb},0.06)` }}>
              {getInitials(patientName)}
            </div>

            {/* Info */}
            <div className="flex flex-col gap-2 pt-0.5 min-w-0 flex-1">
              <p className="text-xl font-black text-white leading-snug">{patientName || tx.unknown}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {hn && (
                  <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg"
                    style={{ color: ac, background: `rgba(${acRgb},0.12)`, border: `1px solid rgba(${acRgb},0.3)` }}>
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

          {/* Sync chip strip */}
          {syncStatus !== 'idle' && (
            <div className="px-5 pb-4 pt-1 flex flex-col items-center gap-2.5">
              <SyncChip
                syncStatus={syncStatus}
                syncTimeStr={syncTimeStr}
                latestCourses={sessionData.latestCourses}
                tx={tx}
              />
              {(syncStatus === 'timeout' || syncStatus === 'error') && (
                <button
                  onClick={handleResync}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl border text-[11px] font-bold transition-all active:scale-95"
                  style={{ color: ac, borderColor: `rgba(${acRgb},0.35)`, background: `rgba(${acRgb},0.08)` }}
                >
                  <RefreshCw size={11} />
                  {tx.resync}
                </button>
              )}
            </div>
          )}
        </div>

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
              {appointments.map((a, i) => <AppointmentCard key={i} a={a} />)}
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
                  {courses.map((c, i) => <CourseCard key={i} c={c} expired={false} accentRgb={acRgb} tx={tx} />)}
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
                  {expiredCourses.map((c, i) => <CourseCard key={i} c={c} expired={true} accentRgb={acRgb} tx={tx} />)}
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
