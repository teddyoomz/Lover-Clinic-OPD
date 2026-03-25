import { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, appId } from '../firebase.js';
import { Package, PackageX, CalendarClock, Phone, User, AlertCircle, Loader2, Link, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';

function CourseCard({ c, expired }) {
  const hasValue = c.value && !c.value.includes('0.00');
  const expiryText = (c.expiry || '').replace('ใช้ได้ถึง ', '').replace('ไม่มีวันหมดอายุ', '∞');
  return (
    <div className={`rounded-xl border p-3.5 flex flex-col gap-2 ${expired ? 'border-red-900/30 bg-red-950/10' : 'border-[#2a2a2a] bg-[#111]'}`}>
      <div className="flex items-start justify-between gap-2">
        <span className={`font-bold text-sm leading-tight ${expired ? 'text-red-300' : 'text-white'}`}>{c.name}</span>
        {c.status && (
          <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg shrink-0 ${
            expired ? 'bg-red-950/40 border border-red-900/50 text-red-400' :
            c.status === 'กำลังใช้งาน' ? 'bg-teal-950/40 border border-teal-900/50 text-teal-400' :
            'bg-[#1a1a1a] border border-[#2a2a2a] text-gray-400'
          }`}>{c.status}</span>
        )}
      </div>
      {c.type && <p className="text-[11px] text-gray-500">{c.type}</p>}
      <div className="flex flex-wrap gap-3 text-[10px] font-mono">
        {expiryText && <span className={`${expired ? 'text-red-500' : 'text-gray-500'}`}>{expiryText}</span>}
        {hasValue && <span className="text-teal-500">{c.value}</span>}
        {c.remaining && <span className="text-gray-500">{c.remaining}</span>}
      </div>
    </div>
  );
}

const COURSES_REFRESH_COOLDOWN_MS = 0; // 0 = ไม่มี cooldown (debug); ตั้งเป็น 3600000 เพื่อ limit 1 ชั่วโมง

function formatSyncTime(fetchedAt) {
  if (!fetchedAt) return null;
  try {
    const d = new Date(fetchedAt);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    const time = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    if (isToday) return `${time} น.`;
    const date = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
    return `${date} ${time} น.`;
  } catch { return null; }
}

export default function PatientDashboard({ token, clinicSettings }) {
  const [status, setStatus] = useState('loading'); // loading | disabled | notfound | done
  const [sessionData, setSessionData] = useState(null);
  const [justSynced, setJustSynced] = useState(false); // flash "Sync เสร็จ" หลัง fetch
  const refreshRequestedRef = useRef(false); // ส่ง coursesRefreshRequest แล้วในครั้งนี้หรือยัง
  const prevFetchedAtRef = useRef(null);     // ตรวจว่า latestCourses.fetchedAt เปลี่ยนไหม

  const ac = clinicSettings?.accentColor || '#dc2626';

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
      setSessionData(data);
      setStatus('done');

      // ตรวจ fetchedAt เปลี่ยนไหม → flash "Sync เสร็จ"
      const newFetchedAt = data.latestCourses?.fetchedAt || null;
      if (newFetchedAt && newFetchedAt !== prevFetchedAtRef.current) {
        prevFetchedAtRef.current = newFetchedAt;
        if (data.latestCourses?.success !== false) {
          setJustSynced(true); // แสดงค้างไว้ตลอด ไม่ fade out
        }
      }

      // Auto-trigger courses refresh เมื่อลูกค้าเปิดลิงก์
      // Rate limit: 1 ชั่วโมงต่อ session — ป้องกัน extension ทำงานหนักหรือโดนแกล้ง
      if (!refreshRequestedRef.current && data.brokerProClinicId) {
        const last = data.lastCoursesAutoFetch;
        // deny ทันทีถ้า: (1) ยังอยู่ใน cooldown หรือ (2) request ก่อนหน้ายังค้างอยู่ใน Firestore
        // → ป้องกันลูกค้า refresh รัวๆ สร้าง queue request — ปัดทิ้ง ไม่เอาเข้า queue
        const stillCoolingDown = last && (Date.now() - last.toMillis()) < COURSES_REFRESH_COOLDOWN_MS;
        const alreadyPending   = !!data.coursesRefreshRequest;
        const shouldRequest    = !stillCoolingDown && !alreadyPending;
        if (shouldRequest) {
          refreshRequestedRef.current = true; // mark ทันทีก่อน async write เพื่อป้องกัน double-trigger
          const sessionRef = doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', data.id);
          updateDoc(sessionRef, { coursesRefreshRequest: serverTimestamp() }).catch(console.error);
        }
      }
    }, () => setStatus('notfound'));
    return () => unsub();
  }, [token]);

  if (status === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 bg-[#050505] text-gray-400">
        <Loader2 size={32} className="animate-spin" style={{color: ac}} />
        <p className="text-xs uppercase tracking-widest font-bold">กำลังโหลด...</p>
      </div>
    );
  }

  if (status === 'notfound' || status === 'disabled') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 bg-[#050505] text-gray-600 px-6 text-center">
        <AlertCircle size={40} className="opacity-30" />
        <p className="text-sm font-black uppercase tracking-widest text-gray-500">
          {status === 'disabled' ? 'ลิงก์นี้ถูกปิดการใช้งานชั่วคราว' : 'ไม่พบข้อมูล'}
        </p>
        <p className="text-xs text-gray-700 max-w-xs leading-relaxed">
          {status === 'disabled'
            ? 'กรุณาติดต่อคลินิกเพื่อขอลิงก์ใหม่'
            : 'ลิงก์นี้ไม่ถูกต้องหรือหมดอายุแล้ว กรุณาตรวจสอบ URL อีกครั้ง'}
        </p>
      </div>
    );
  }

  const d = sessionData.patientData || {};
  const courses = sessionData.latestCourses?.courses || [];
  const expiredCourses = sessionData.latestCourses?.expiredCourses || [];
  const plName = sessionData.latestCourses?.patientName;

  // Sync status: requesting → syncing → done/error
  const isCoursesJob = sessionData.brokerJob?.type === 'LC_GET_COURSES';
  const syncStatus =
    sessionData.coursesRefreshRequest             ? 'requesting'  // PatientDashboard เพิ่งส่ง request รอ admin รับ
    : (sessionData.brokerStatus === 'pending' && isCoursesJob) ? 'syncing'  // extension กำลัง fetch
    : sessionData.latestCourses?.success === false ? 'error'      // fetch ล่าสุดล้มเหลว
    : justSynced                                   ? 'done'       // flash หลัง fetch เสร็จ
    : 'idle';

  // chip config ตาม syncStatus
  const fetchedAt = sessionData.latestCourses?.fetchedAt || null;
  const syncTimeStr = formatSyncTime(fetchedAt);
  const syncChip = {
    requesting: { icon: <RefreshCw size={11} className="animate-spin" />, label: 'กำลังส่งคำขอ...', cls: 'text-gray-400 border-gray-700 bg-gray-900/40' },
    syncing:    { icon: <Loader2 size={11} className="animate-spin" />,   label: 'กำลัง Sync',     cls: 'text-teal-400 border-teal-800 bg-teal-950/40' },
    done:       { icon: <CheckCircle2 size={11} />,                        label: syncTimeStr ? `Sync เสร็จ — ${syncTimeStr}` : 'Sync เสร็จแล้ว', cls: 'text-green-400 border-green-800 bg-green-950/40' },
    error:      { icon: <XCircle size={11} />,                             label: 'Sync ไม่สำเร็จ', cls: 'text-red-400 border-red-800 bg-red-950/40' },
    idle:       null,
  }[syncStatus];
  const formName = `${d.prefix || ''} ${d.firstName || ''} ${d.lastName || ''}`.trim();
  const patientName = (plName && plName !== '0') ? plName : formName;
  const hn = sessionData.brokerProClinicHN || '';

  return (
    <div className="min-h-screen bg-[#050505] text-gray-200 font-sans">
      {/* Header */}
      <div className="bg-[#0a0a0a] border-b border-[#1a1a1a] px-5 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{background: `rgba(${ac.replace('#','').match(/.{2}/g)?.map(h=>parseInt(h,16)).join(',')},0.2)`, border: `1px solid rgba(${ac.replace('#','').match(/.{2}/g)?.map(h=>parseInt(h,16)).join(',')},0.4)`}}>
          <Link size={14} style={{color: ac}} />
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">{clinicSettings?.clinicName || 'คลินิก'}</p>
          <p className="text-sm font-bold text-white">ข้อมูลผู้ป่วย</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 flex flex-col gap-5">
        {/* Patient info */}
        <div className="bg-[#0f0f0f] rounded-2xl border border-[#1e1e1e] p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center shrink-0">
              <User size={18} className="text-gray-500" />
            </div>
            <div className="flex flex-col gap-1 min-w-0">
              <p className="text-base font-black text-white">{patientName || 'ไม่ระบุชื่อ'}</p>
              {hn && <p className="text-xs font-mono text-teal-500">HN: {hn}</p>}
              {d.phone && (
                <p className="text-xs text-gray-500 flex items-center gap-1"><Phone size={11}/> {d.phone}</p>
              )}
            </div>
          </div>
        </div>

        {/* Sync status chip */}
        {syncChip && (
          <div className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[11px] font-bold ${syncChip.cls}`}>
            {syncChip.icon}
            <span>{syncChip.label}</span>
            {syncStatus === 'error' && sessionData.latestCourses?.error && (
              <span className="text-red-600 font-normal truncate ml-1">— {sessionData.latestCourses.error}</span>
            )}
          </div>
        )}

        {/* Courses section */}
        {sessionData.latestCourses ? (
          <>
            {courses.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <Package size={14} className="text-teal-500" />
                  <h3 className="text-xs font-black uppercase tracking-widest text-teal-500">คอร์สของฉัน</h3>
                  <span className="text-[10px] font-bold text-teal-700 bg-teal-950/30 px-2 py-0.5 rounded-full border border-teal-900/30">{courses.length}</span>
                  {syncTimeStr && syncStatus === 'idle' && (
                    <span className="ml-auto text-[10px] text-gray-600 font-mono">อัพเดท {syncTimeStr}</span>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  {courses.map((c, i) => <CourseCard key={i} c={c} expired={false} />)}
                </div>
              </div>
            )}
            {courses.length === 0 && (
              <div className="bg-[#0f0f0f] rounded-xl border border-[#1e1e1e] p-6 text-center">
                <Package size={24} className="text-gray-700 mx-auto mb-2" />
                <p className="text-xs text-gray-600 font-bold uppercase tracking-widest">ไม่มีคอร์สคงเหลือ</p>
              </div>
            )}
            {expiredCourses.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <PackageX size={14} className="text-red-500" />
                  <h3 className="text-xs font-black uppercase tracking-widest text-red-500">คอร์สหมดอายุ</h3>
                  <span className="text-[10px] font-bold text-red-700 bg-red-950/30 px-2 py-0.5 rounded-full border border-red-900/30">{expiredCourses.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {expiredCourses.map((c, i) => <CourseCard key={i} c={c} expired={true} />)}
                </div>
              </div>
            )}
          </>
        ) : (syncStatus === 'requesting' || syncStatus === 'syncing') ? (
          <div className="bg-[#0f0f0f] rounded-xl border border-[#1e1e1e] p-6 text-center flex flex-col items-center gap-2">
            <Loader2 size={22} className="animate-spin text-gray-600" />
            <p className="text-xs text-gray-600 font-bold uppercase tracking-widest">
              {syncStatus === 'syncing' ? 'กำลัง Sync ข้อมูลคอร์ส...' : 'กำลังส่งคำขอไปยังคลินิก...'}
            </p>
          </div>
        ) : (
          <div className="bg-[#0f0f0f] rounded-xl border border-[#1e1e1e] p-6 text-center">
            <CalendarClock size={24} className="text-gray-700 mx-auto mb-2" />
            <p className="text-xs text-gray-600 font-bold uppercase tracking-widest">ยังไม่มีข้อมูลคอร์ส</p>
            <p className="text-[10px] text-gray-700 mt-1">ข้อมูลจะแสดงหลังจากที่คลินิกดึงข้อมูลจากระบบ</p>
          </div>
        )}

        <p className="text-center text-[10px] text-gray-700 pb-4">ข้อมูลนี้จัดทำโดย {clinicSettings?.clinicName || 'คลินิก'}</p>
      </div>
    </div>
  );
}
