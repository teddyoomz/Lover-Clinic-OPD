import { useState, useEffect, useRef, useMemo } from 'react';
import { collection, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, onSnapshot, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { app } from '../firebase.js';
import { signOut } from 'firebase/auth';
import {
  QrCode, Users, PlusCircle, ClipboardList, CheckCircle2, Clock, Activity,
  AlertCircle, Eye, X, FileText, Edit3, TimerOff, Trash2, Phone, HeartPulse,
  Pill, CheckSquare, LogOut, Lock, Flame, Printer, Link, ClipboardCheck,
  Globe, Bell, BellOff, Volume2, Settings, LayoutTemplate, Palette, Archive, History,
  Smartphone, RotateCcw, Timer, Infinity, Search, Package, PackageX, CalendarClock, Calendar, CalendarDays, Banknote, Loader2, ChevronDown, ChevronRight, ChevronLeft, Unlink, ToggleLeft, ToggleRight, ExternalLink, XCircle, UserCheck, RefreshCw, Stethoscope, MapPin, User, CreditCard, UserPlus, MessageCircle, Database
} from 'lucide-react';
import { DEFAULT_CLINIC_SETTINGS, SESSION_TIMEOUT_MS } from '../constants.js';
import * as broker from '../lib/brokerClient.js';
import {
  hexToRgb, getReasons, getHrtGoals, calculateADAM, calculateIIEFScore,
  calculateMRS, getIIEFInterpretation, generateClinicalSummary,
  formatPhoneNumberDisplay, renderDobFormat, playNotificationSound, formatBangkokTime
} from '../utils.js';
import ThemeToggle from '../components/ThemeToggle.jsx';
import ClinicLogo from '../components/ClinicLogo.jsx';
import ClinicSettingsPanel from '../components/ClinicSettingsPanel.jsx';
import CustomFormBuilder from '../components/CustomFormBuilder.jsx';
import ChatPanel, { useChatUnread, playAlertSound } from '../components/ChatPanel.jsx';
import TreatmentTimeline from '../components/TreatmentTimeline.jsx';
import TreatmentFormPage from '../components/TreatmentFormPage.jsx';

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
function bangkokNow() {
  // Always GMT+7 regardless of browser locale
  const utc = Date.now();
  return new Date(utc + 7 * 3600000);
}
function todayISO() {
  const d = bangkokNow();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}

// ── DatePickerThai — shows DD/MM/YYYY + opens native calendar picker on click
function DatePickerThai({ value, onChange, className = '', placeholder = 'DD/MM/YYYY' }) {
  const hiddenRef = useRef(null);
  const display = value ? toThaiDate(value) : '';
  return (
    <div className="relative">
      <input
        type="text"
        readOnly
        value={display}
        placeholder={placeholder}
        onClick={() => { try { hiddenRef.current?.showPicker(); } catch { hiddenRef.current?.click(); } }}
        className={`${className} cursor-pointer pr-8`}
      />
      <Calendar size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
      <input
        ref={hiddenRef}
        type="date"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        className="absolute inset-0 opacity-0 cursor-pointer [color-scheme:dark]"
        tabIndex={-1}
      />
    </div>
  );
}
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
  const urgentColor = daysLeft !== null && daysLeft <= 30 && daysLeft > 0 ? 'text-amber-400'
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

export default function AdminDashboard({ db, appId, user, auth, viewingSession, setViewingSession, setPrintMode, onSimulateScan, clinicSettings = {}, theme, setTheme }) {
  const cs = { ...DEFAULT_CLINIC_SETTINGS, ...clinicSettings };
  const ac = cs.accentColor;
  const acRgb = hexToRgb(ac);
  const isDark = theme === 'dark' || (theme === 'auto' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  // Dedup practitioners from clinicSettings (Firestore may have duplicates from older saves)
  const practitioners = useMemo(() => {
    const raw = clinicSettings.practitioners || [];
    const seen = new Set();
    return raw.filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
  }, [clinicSettings.practitioners]);
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
  const [adminMode, setAdminModeRaw] = useState('dashboard'); // chat, dashboard, formBuilder, appointment
  const setAdminMode = (mode, preserveQR = false) => { setAdminModeRaw(mode); if (!preserveQR) setSelectedQR(null); };
  const { totalUnread: chatUnread, totalConversations: chatConvCount } = useChatUnread(db, appId);
  const [treatmentFormMode, setTreatmentFormMode] = useState(null); // null | { mode, customerId, treatmentId, patientName }
  const [treatmentRefreshKey, setTreatmentRefreshKey] = useState(0);
  const [autoExpandTreatmentId, setAutoExpandTreatmentId] = useState('');

  // ─── Chat schedule: check if within operating hours ─────
  const isChatActive = useMemo(() => {
    if (cs.chatAlwaysOn) return true;
    const now = new Date();
    const bkk = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    const day = bkk.getDay(); // 0=Sun, 6=Sat
    const isWeekend = day === 0 || day === 6;
    const openStr = isWeekend ? (cs.chatOpenTimeWeekend || '10:00') : (cs.chatOpenTime || '10:00');
    const closeStr = isWeekend ? (cs.chatCloseTimeWeekend || '17:00') : (cs.chatCloseTime || '19:00');
    const [oh, om] = openStr.split(':').map(Number);
    const [ch, cm] = closeStr.split(':').map(Number);
    const nowMin = bkk.getHours() * 60 + bkk.getMinutes();
    const openMin = oh * 60 + om;
    const closeMin = ch * 60 + cm;
    return nowMin >= openMin && nowMin < closeMin;
  }, [cs.chatAlwaysOn, cs.chatOpenTime, cs.chatCloseTime, cs.chatOpenTimeWeekend, cs.chatCloseTimeWeekend, currentTime]);

  // ─── Chat alert sound: plays on ALL pages when chat is active ─────
  const chatIsPlayingRef = useRef(false);
  const chatPrevCountRef = useRef(0);
  const chatConvCountRef = useRef(0);
  const isChatActiveRef = useRef(isChatActive);
  chatConvCountRef.current = chatConvCount;
  isChatActiveRef.current = isChatActive;

  useEffect(() => {
    if (!isChatActive) { chatPrevCountRef.current = chatConvCount; return; }
    if (chatConvCount > 0 && chatPrevCountRef.current === 0 && !chatIsPlayingRef.current) {
      chatIsPlayingRef.current = true;
      playAlertSound();
      setTimeout(() => { chatIsPlayingRef.current = false; }, 1400);
    }
    chatPrevCountRef.current = chatConvCount;
  }, [chatConvCount, isChatActive]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (isChatActiveRef.current && chatConvCountRef.current > 0 && !chatIsPlayingRef.current) {
        chatIsPlayingRef.current = true;
        playAlertSound();
        setTimeout(() => { chatIsPlayingRef.current = false; }, 1400);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // ── Admin presence tracking ──
  const [onlineAdmins, setOnlineAdmins] = useState([]);
  const tabIdRef = useRef(`${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

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
        .map(d => ({ id: d.id, ...d.data() }))
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
  const [apptMonth, setApptMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [apptData, setApptData] = useState(null);
  const [apptSelectedDate, setApptSelectedDate] = useState(null);
  const [apptSyncing, setApptSyncing] = useState(false);
  const [apptSyncSuccess, setApptSyncSuccess] = useState(false);
  const [apptSlotDuration, setApptSlotDuration] = useState(60);
  const apptAutoSyncedRef = useRef(false); // prevent re-sync every tab switch
  const apptSyncedMonthsRef = useRef(new Set()); // track which months have been synced
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

  // ── Schedule Link modal state ──
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [schedStartMonth, setSchedStartMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [schedAdvanceMonths, setSchedAdvanceMonths] = useState(1);
  const [schedDoctorDays, setSchedDoctorDays] = useState(new Set());
  const [schedClosedDays, setSchedClosedDays] = useState(new Set());
  const [schedGenLoading, setSchedGenLoading] = useState(false);
  const [schedGenResult, setSchedGenResult] = useState(null); // { token, url, qrUrl }
  const [schedSlotDuration, setSchedSlotDuration] = useState(60);
  const [schedNoDoctorRequired, setSchedNoDoctorRequired] = useState(false);
  const [schedSelectedDoctor, setSchedSelectedDoctor] = useState(null); // practitioner id for per-doctor schedule
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

  const [isNotifEnabled, setIsNotifEnabled] = useState(true);
  const [notifVolume, setNotifVolume] = useState(0.5);
  const [showNotifSettings, setShowNotifSettings] = useState(false);
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
  });
  const [editingDepositData, setEditingDepositData] = useState(null); // null = not editing, object = editing copy

  // ── No-deposit appointment form state ──
  const [showNoDepositForm, setShowNoDepositForm] = useState(false);
  const [noDepositFormData, setNoDepositFormData] = useState({
    sessionName: '', appointmentDate: todayISO(),
    appointmentStartTime: '', appointmentEndTime: '',
    advisor: '', doctor: '', assistant: '', room: '', source: '',
    visitPurpose: [],
  });
  const [editingAppointment, setEditingAppointment] = useState(null); // null = creating, sessionId = editing
  const [sessionToRestore, setSessionToRestore] = useState(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [globalPushMuted, setGlobalPushMuted] = useState(false);
  const [brokerPending, setBrokerPending] = useState({}); // sessionId → true while pending
  const [historySearch, setHistorySearch] = useState('');
  const [historyPage,   setHistoryPage]   = useState(1);
  // ─── Import from ProClinic state ──────────────────────────
  const [showImport, setShowImport] = useState(false);
  const [importSearch, setImportSearch] = useState('');
  const [importResults, setImportResults] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [importPreviewLoading, setImportPreviewLoading] = useState(false);
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
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

  // Auto-sync ProClinic credentials to Cookie Relay extension
  useEffect(() => {
    function handleExtReady(e) {
      if (e.data?.type !== 'LC_COOKIE_RELAY_READY') return;
      broker.getProClinicCredentials().then(res => {
        if (res?.success) {
          window.postMessage({ type: 'LC_SET_CREDENTIALS', origin: res.origin, email: res.email, password: res.password }, '*');
        }
      });
    }
    window.addEventListener('message', handleExtReady);
    return () => window.removeEventListener('message', handleExtReady);
  }, []);

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

  // ── Appointment calendar: subscribe to Firestore doc for current month ──
  useEffect(() => {
    if (!db || !appId) return;
    const unsub = onSnapshot(
      doc(db, 'artifacts', appId, 'public', 'data', 'pc_appointments', apptMonth),
      (snap) => { setApptData(snap.exists() ? snap.data() : null); },
      () => { setApptData(null); }
    );
    return () => unsub();
  }, [apptMonth, db, appId]);

  // ── Auto-sync ±1 month on first open, then lazy sync when navigating ──
  useEffect(() => {
    if (adminMode !== 'appointment' || apptAutoSyncedRef.current) return;
    apptAutoSyncedRef.current = true;
    (async () => {
      setApptSyncing(true);
      setApptSyncSuccess(false);
      try {
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        await broker.syncAppointments(currentMonth);
        apptSyncedMonthsRef.current.add(currentMonth);
        setApptSyncSuccess(true);
      } catch (e) {
        showToast(`Auto-sync error: ${e.message}`, 5000);
      }
      setApptSyncing(false);
    })();
  }, [adminMode]);

  // ── Lazy sync: when user navigates to a month not yet synced ──
  useEffect(() => {
    if (adminMode !== 'appointment' || !apptAutoSyncedRef.current) return;
    if (apptSyncedMonthsRef.current.has(apptMonth)) return;
    (async () => {
      setApptSyncing(true);
      try {
        await broker.syncAppointments(apptMonth);
        apptSyncedMonthsRef.current.add(apptMonth);
      } catch { /* silent */ }
      setApptSyncing(false);
    })();
  }, [apptMonth, adminMode]);

  // ── Auto-sync at 21:00 daily — sync months up to furthest active session appointment ──
  const apptAutoSyncDoneRef = useRef(null); // date string of last auto-sync (e.g. "2026-03-30")
  useEffect(() => {
    if (!db || !appId) return;
    const check = async () => {
      const now = new Date();
      const hh = now.getHours();
      const mm = now.getMinutes();
      const todayKey = now.toISOString().substring(0, 10);
      // Trigger at 21:00-21:04 (5-min window), once per day
      if (hh !== 21 || mm > 4) return;
      if (apptAutoSyncDoneRef.current === todayKey) return;
      apptAutoSyncDoneRef.current = todayKey;

      // Find furthest month from active sessions (noDeposit + deposit)
      const allActive = [...noDepositSessions, ...depositSessions];
      let maxMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      for (const s of allActive) {
        const aDate = s.appointmentData?.appointmentDate || s.depositData?.appointmentDate;
        if (aDate) {
          const mo = aDate.substring(0, 7); // "YYYY-MM"
          if (mo > maxMonth) maxMonth = mo;
        }
      }
      // Also check schedule links
      for (const s of schedList) {
        if (s.enabled === false) continue;
        for (const mo of (s.months || [])) {
          if (mo > maxMonth) maxMonth = mo;
        }
      }

      // Build list of months: current → maxMonth
      const months = [];
      let cursor = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      while (cursor <= maxMonth && months.length < 12) {
        months.push(cursor);
        const [cy, cm] = cursor.split('-').map(Number);
        const next = cm === 12 ? `${cy + 1}-01` : `${cy}-${String(cm + 1).padStart(2, '0')}`;
        cursor = next;
      }

      console.log(`[auto-sync 21:00] syncing ${months.length} months: ${months[0]} → ${months[months.length - 1]}`);
      // Sync one by one with delay to avoid ProClinic rate limiting
      for (const mo of months) {
        try {
          await broker.syncAppointments(mo);
          console.log(`[auto-sync] ${mo} done`);
        } catch (e) { console.warn(`[auto-sync] ${mo} failed:`, e.message); }
        // 3 second delay between months
        await new Promise(r => setTimeout(r, 3000));
      }
      // Update active schedules after sync
      try { await updateActiveSchedules(); } catch {}
      console.log('[auto-sync 21:00] complete');
    };
    const interval = setInterval(check, 60000); // check every minute
    check(); // run immediately on mount too
    return () => clearInterval(interval);
  }, [db, appId, noDepositSessions, depositSessions, schedList]);

  // ── Appointment Manager handlers ──
  const handleApptSearch = async () => {
    const q = (apptSearchQuery || '').trim();
    if (!q) return;
    setApptSearching(true);
    setApptSearchResults(null);
    setApptSelectedCustomer(null);
    try {
      const res = await broker.searchCustomers(q);
      setApptSearchResults(res.success ? (res.customers || []) : []);
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
      const res = await broker.listCustomerAppointments(customer.id);
      if (res.success) {
        setApptCustomerAppts(res.appointments || []);
        // Update customer name if API returned a better one
        if (res.customerName && !customer.name) setApptSelectedCustomer(prev => ({ ...prev, name: res.customerName }));
      } else {
        showToast(res.error || 'โหลดนัดหมายไม่สำเร็จ', 4000);
      }
    } catch (e) { showToast(e.message, 4000); }
    setApptCustomerLoading(false);
  };

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
    setApptFormSaving(true);
    try {
      // Include customer name in note for ProClinic identification
      const custLabel = apptSelectedCustomer.name || `ID:${apptSelectedCustomer.id}`;
      const noteWithCust = apptFormData.note
        ? `[${custLabel}] ${apptFormData.note}`
        : `[${custLabel}]`;

      // advisor + room + source are REQUIRED by ProClinic
      const advisorVal = apptFormData.advisor || (depositOptions?.advisors?.[0]?.value) || '';
      const roomVal = apptFormData.room || (depositOptions?.rooms?.[0]?.value) || '';
      if (!advisorVal || !roomVal) {
        showToast('กรุณาเลือกที่ปรึกษาและห้องตรวจ', 3000);
        setApptFormSaving(false);
        return;
      }
      const payload = {
        appointmentDate: apptFormData.date,
        appointmentStartTime: apptFormData.startTime,
        appointmentEndTime: apptFormData.endTime,
        advisor: advisorVal,
        doctor: apptFormData.doctor || undefined,
        room: roomVal,
        source: apptFormData.source || 'walk-in',
        appointmentTo: apptFormData.appointmentTo || undefined,
        appointmentNote: noteWithCust,
        customerId: apptSelectedCustomer.id,
      };
      let res;
      if (apptFormMode.mode === 'edit') {
        res = await broker.updateAppointment(apptFormMode.appointmentId, payload);
      } else {
        res = await broker.createAppointment(payload);
      }
      if (res.success) {
        showToast(apptFormMode.mode === 'create' ? 'สร้างนัดหมายสำเร็จ' : 'แก้ไขนัดหมายสำเร็จ', 3000);
        setApptFormMode(null);
        setApptFormData({ date: '', startTime: '', endTime: '', doctor: '', advisor: '', room: '', source: '', appointmentTo: '', note: '' });
        // Re-fetch appointments (real-time update)
        const refresh = await broker.listCustomerAppointments(apptSelectedCustomer.id);
        if (refresh.success) setApptCustomerAppts(refresh.appointments || []);
      } else {
        showToast(res.error || 'ไม่สำเร็จ', 4000);
      }
    } catch (e) { showToast(e.message, 4000); }
    setApptFormSaving(false);
  };

  const handleApptDelete = async (appointmentId) => {
    if (!confirm('ลบนัดหมายนี้?')) return;
    try {
      const res = await broker.deleteAppointment(appointmentId);
      if (res.success) {
        showToast('ลบนัดหมายสำเร็จ', 3000);
        // Re-fetch (real-time update)
        const refresh = await broker.listCustomerAppointments(apptSelectedCustomer.id);
        if (refresh.success) setApptCustomerAppts(refresh.appointments || []);
      } else {
        showToast(res.error || 'ลบไม่สำเร็จ', 4000);
      }
    } catch (e) { showToast(e.message, 4000); }
  };

  // ── Load saved schedule day preferences + schedule list ──
  useEffect(() => {
    if (!db || !appId) return;
    // Load saved doctor/closed day prefs
    getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'clinic_settings', 'schedule_prefs')).then(snap => {
      if (snap.exists()) {
        const d = snap.data();
        if (d.doctorDays) setSchedDoctorDays(new Set(d.doctorDays));
        if (d.closedDays) setSchedClosedDays(new Set(d.closedDays));
        if (d.manualBlockedSlots) setSchedManualBlocked(d.manualBlockedSlots);
        if (d.customDoctorHours) setSchedCustomDoctorHours(d.customDoctorHours);
      }
      setSchedPrefsLoaded(true);
    }).catch(() => setSchedPrefsLoaded(true));

    // Subscribe to schedule list
    const unsub = onSnapshot(
      collection(db, 'artifacts', appId, 'public', 'data', 'clinic_schedules'),
      (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => {
          const ta = a.createdAt?.toMillis?.() || 0;
          const tb = b.createdAt?.toMillis?.() || 0;
          return tb - ta;
        });
        setSchedList(list);
      },
      () => {}
    );
    return () => unsub();
  }, [db, appId]);

  // Update bookedSlots in all active schedule docs
  const updateActiveSchedules = async () => {
    try {
      const activeScheds = schedList.filter(s => s.enabled !== false);
      for (const sched of activeScheds) {
        // Check if not expired (24hr)
        if (sched.createdAt?.toMillis && Date.now() - sched.createdAt.toMillis() > 24 * 60 * 60 * 1000) continue;
        const months = sched.months || [];
        const bookedSlots = [];
        for (const mo of months) {
          const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pc_appointments', mo));
          if (snap.exists()) {
            (snap.data().appointments || []).forEach(a => {
              if (a.date && a.startTime && a.endTime) {
                bookedSlots.push({ date: a.date, startTime: a.startTime, endTime: a.endTime });
              }
            });
          }
        }
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'clinic_schedules', sched.token), { bookedSlots }).catch(() => {});
      }
    } catch { /* silent */ }
  };

  const handleSyncAppointments = async (month) => {
    setApptSyncing(true);
    setApptSyncSuccess(false);
    try {
      const result = await broker.syncAppointments(month || apptMonth);
      if (!result.success) showToast(`Sync ล้มเหลว: ${result.error}`, 5000);
      else {
        setApptSyncSuccess(true);
        updateActiveSchedules();
      }
    } catch (e) {
      showToast(`Sync error: ${e.message}`, 5000);
    }
    setApptSyncing(false);
  };

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
  const saveSchedulePrefs = (doctorDays, closedDays, manualBlocked, customDocHours) => {
    if (!db || !appId) return;
    const cdh = customDocHours ?? schedCustomDoctorHours;
    setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'clinic_settings', 'schedule_prefs'), {
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
        }).catch(() => {});
      });
    }).catch(() => {});
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

  // ── Toggle day: normal → doctor → closed → normal (or forced action for drag) ──
  const toggleDay = (dateStr, forceAction) => {
    let newDoc, newClosed;
    const action = forceAction || (schedDoctorDays.has(dateStr) ? 'closed' : schedClosedDays.has(dateStr) ? 'normal' : 'doctor');
    if (action === 'doctor') {
      newDoc = new Set(schedDoctorDays); newDoc.add(dateStr);
      newClosed = new Set(schedClosedDays); newClosed.delete(dateStr);
    } else if (action === 'closed') {
      newDoc = new Set(schedDoctorDays); newDoc.delete(dateStr);
      newClosed = new Set(schedClosedDays); newClosed.add(dateStr);
    } else {
      newDoc = new Set(schedDoctorDays); newDoc.delete(dateStr);
      newClosed = new Set(schedClosedDays); newClosed.delete(dateStr);
    }
    setSchedDoctorDays(newDoc);
    setSchedClosedDays(newClosed);
    // Don't auto-save — user must click save button
    return action;
  };

  // ── Drag handlers for day toggle ──
  const handleDayPointerDown = (dateStr, e) => {
    e.preventDefault();
    const action = schedDoctorDays.has(dateStr) ? 'closed' : schedClosedDays.has(dateStr) ? 'normal' : 'doctor';
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
    const d = new Date(dateStr);
    const isWknd = d.getDay() === 0 || d.getDay() === 6;
    return [{
      start: isWknd ? (clinicSettings.doctorStartTimeWeekend || clinicSettings.doctorStartTime || '10:00') : (clinicSettings.doctorStartTime || '10:00'),
      end: isWknd ? (clinicSettings.doctorEndTimeWeekend || clinicSettings.doctorEndTime || '19:00') : (clinicSettings.doctorEndTime || '19:00'),
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
      // Get all 15-min slots for the day based on clinic hours
      const bDate = new Date(dateStr);
      const isWknd = bDate.getDay() === 0 || bDate.getDay() === 6;
      const openT = isWknd ? (clinicSettings.clinicOpenTimeWeekend || '10:00') : (clinicSettings.clinicOpenTime || '10:00');
      const closeT = isWknd ? (clinicSettings.clinicCloseTimeWeekend || '17:00') : (clinicSettings.clinicCloseTime || '19:00');
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
        const d2 = new Date(dateStr);
        const w = d2.getDay() === 0 || d2.getDay() === 6;
        const defEnd = w ? (clinicSettings.doctorEndTimeWeekend || clinicSettings.doctorEndTime || '19:00') : (clinicSettings.doctorEndTime || '19:00');
        return [{
          start: w ? (clinicSettings.doctorStartTimeWeekend || clinicSettings.doctorStartTime || '10:00') : (clinicSettings.doctorStartTime || '10:00'),
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

      // 2. Sync all months
      for (const mo of months) {
        await broker.syncAppointments(mo);
      }

      // 3. Collect booked slots from Firestore — filtered by selected doctor or assistants
      const bookedSlots = [];
      const doctorBookedSlots = []; // นัดของแพทย์ทุกคน — ใช้แสดง "หมอว่าง/ไม่ว่าง" ในหน้าลูกค้า
      const allPractitioners = clinicSettings.practitioners || [];
      const doctorIds = new Set(allPractitioners.filter(p => p.role === 'doctor').map(p => String(p.id)));
      const assistantIds = new Set(allPractitioners.filter(p => p.role === 'assistant').map(p => String(p.id)));
      for (const mo of months) {
        const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pc_appointments', mo));
        if (snap.exists()) {
          const appts = snap.data().appointments || [];
          appts.forEach(a => {
            if (!a.date || !a.startTime || !a.endTime) return;
            // Collect doctor booked slots separately (for "หมอว่าง/ไม่ว่าง" in ไม่พบแพทย์ mode)
            if (schedNoDoctorRequired && doctorIds.has(String(a.doctorId))) {
              doctorBookedSlots.push({ date: a.date, startTime: a.startTime, endTime: a.endTime });
            }
            if (schedNoDoctorRequired) {
              if (assistantIds.has(String(a.doctorId))) {
                bookedSlots.push({ date: a.date, startTime: a.startTime, endTime: a.endTime });
              }
            } else if (schedSelectedDoctor) {
              if (String(a.doctorId) === String(schedSelectedDoctor)) {
                bookedSlots.push({ date: a.date, startTime: a.startTime, endTime: a.endTime });
              }
            } else {
              bookedSlots.push({ date: a.date, startTime: a.startTime, endTime: a.endTime });
            }
          });
        }
      }

      // 4. Generate token
      const token = 'SCH-' + Array.from(crypto.getRandomValues(new Uint8Array(5))).map(b => b.toString(16).padStart(2, '0')).join('');

      // 5. Save schedule doc
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'clinic_schedules', token), {
        token,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        enabled: true,
        months,
        clinicOpenTime: clinicSettings.clinicOpenTime || '10:00',
        clinicCloseTime: clinicSettings.clinicCloseTime || '19:00',
        clinicOpenTimeWeekend: clinicSettings.clinicOpenTimeWeekend || '10:00',
        clinicCloseTimeWeekend: clinicSettings.clinicCloseTimeWeekend || '17:00',
        slotDurationMins: schedSlotDuration,
        noDoctorRequired: schedNoDoctorRequired,
        showFrom: schedShowFrom,
        endDate: schedEndDay || '',
        doctorDays: [...schedDoctorDays],
        closedDays: [...schedClosedDays],
        bookedSlots,
        doctorBookedSlots: schedNoDoctorRequired ? doctorBookedSlots : [],
        manualBlockedSlots: schedManualBlocked,
        customDoctorHours: schedCustomDoctorHours,
        doctorStartTime: clinicSettings.doctorStartTime || '10:00',
        doctorEndTime: clinicSettings.doctorEndTime || '19:00',
        doctorStartTimeWeekend: clinicSettings.doctorStartTimeWeekend || '10:00',
        doctorEndTimeWeekend: clinicSettings.doctorEndTimeWeekend || '17:00',
        selectedDoctorId: schedSelectedDoctor || null,
        selectedDoctorName: allPractitioners.find(p => p.id === schedSelectedDoctor)?.name || null,
      });

      // 5b. Prefs are already saved on every toggle — no need to save again

      // 6. Build URL + QR
      const baseUrl = window.location.origin;
      const url = `${baseUrl}/?schedule=${token}`;
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(url)}`;
      setSchedGenResult({ token, url, qrUrl });
      showToast('สร้างลิงก์ตารางสำเร็จ', 3000);

      // Background resync all months in the schedule link (gradual, 3s delay between each)
      // This ensures the schedule link gets the freshest data from ProClinic
      (async () => {
        console.log(`[schedule-resync] background resync ${months.length} months for new link`);
        for (const mo of months) {
          try {
            await broker.syncAppointments(mo);
            console.log(`[schedule-resync] ${mo} done`);
          } catch (e) { console.warn(`[schedule-resync] ${mo} failed:`, e.message); }
          await new Promise(r => setTimeout(r, 3000));
        }
        // Update booked slots in the newly created schedule doc with fresh data
        try {
          const freshBookedSlots = [];
          const freshDoctorBookedSlots = [];
          for (const mo of months) {
            const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pc_appointments', mo));
            if (snap.exists()) {
              (snap.data().appointments || []).forEach(a => {
                if (!a.date || !a.startTime || !a.endTime) return;
                if (schedNoDoctorRequired && doctorIds.has(String(a.doctorId))) {
                  freshDoctorBookedSlots.push({ date: a.date, startTime: a.startTime, endTime: a.endTime });
                }
                if (schedNoDoctorRequired) {
                  if (assistantIds.has(String(a.doctorId))) {
                    freshBookedSlots.push({ date: a.date, startTime: a.startTime, endTime: a.endTime });
                  }
                } else if (schedSelectedDoctor) {
                  if (String(a.doctorId) === String(schedSelectedDoctor)) {
                    freshBookedSlots.push({ date: a.date, startTime: a.startTime, endTime: a.endTime });
                  }
                } else {
                  freshBookedSlots.push({ date: a.date, startTime: a.startTime, endTime: a.endTime });
                }
              });
            }
          }
          await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'clinic_schedules', token), {
            bookedSlots: freshBookedSlots,
            doctorBookedSlots: schedNoDoctorRequired ? freshDoctorBookedSlots : [],
          }).catch(() => {});
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
      setFormTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [db, appId]);

  useEffect(() => {
    if (!user || user.isAnonymous) return;
    const sessionsRef = collection(db, 'artifacts', appId, 'public', 'data', 'opd_sessions');
    const unsubscribe = onSnapshot(sessionsRef, (snapshot) => {
      const now = Date.now();
      const allDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Auto-cleanup expired sessions: delete if no data, archive if has data
      allDocs.forEach(s => {
        if (s.isArchived || s.isPermanent || !s.createdAt) return;
        if ((now - s.createdAt.toMillis()) > SESSION_TIMEOUT_MS) {
          if (!s.patientData) {
            deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', s.id)).catch(console.error);
          } else if (!s.isArchived) {
            updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', s.id), {
              isArchived: true, archivedAt: serverTimestamp()
            }).catch(console.error);
          }
        }
      });

      // Archived sessions → history page (exclude deposits except serviceCompleted, exclude noDeposit)
      setArchivedSessions(
        allDocs
          .filter(s => s.isArchived && (s.formType !== 'deposit' || s.serviceCompleted) && !(s.isPermanent && s.formType !== 'deposit' && !s.serviceCompleted))
          .sort((a, b) => (b.archivedAt?.toMillis() || b.createdAt?.toMillis() || 0) - (a.archivedAt?.toMillis() || a.createdAt?.toMillis() || 0))
      );

      // Deposit sessions — separate from queue (exclude serviceCompleted → those go to queue)
      setDepositSessions(
        allDocs
          .filter(s => !s.isArchived && s.formType === 'deposit' && !s.serviceCompleted)
          .sort((a, b) => (b.updatedAt?.toMillis() || b.createdAt?.toMillis() || 0) - (a.updatedAt?.toMillis() || a.createdAt?.toMillis() || 0))
      );
      setArchivedDepositSessions(
        allDocs
          .filter(s => s.isArchived && s.formType === 'deposit')
          .sort((a, b) => (b.archivedAt?.toMillis() || b.createdAt?.toMillis() || 0) - (a.archivedAt?.toMillis() || a.createdAt?.toMillis() || 0))
      );

      // จองไม่มัดจำ = isPermanent + NOT deposit + NOT serviceCompleted
      const ndData = allDocs
          .filter(s => !s.isArchived && s.isPermanent && s.formType !== 'deposit' && !s.serviceCompleted)
          .sort((a, b) => (b.updatedAt?.toMillis() || b.createdAt?.toMillis() || 0) - (a.updatedAt?.toMillis() || a.createdAt?.toMillis() || 0));
      setNoDepositSessions(ndData);
      setArchivedNoDepositSessions(
        allDocs
          .filter(s => s.isArchived && s.isPermanent && s.formType !== 'deposit' && !s.serviceCompleted)
          .sort((a, b) => (b.archivedAt?.toMillis() || b.createdAt?.toMillis() || 0) - (a.archivedAt?.toMillis() || a.createdAt?.toMillis() || 0))
      );

      const data = allDocs.filter(session => {
          if (session.isArchived) return false;
          if (session.formType === 'deposit' && !session.serviceCompleted) return false; // deposit ที่ยังไม่มารับบริการ → อยู่ tab จองมัดจำ
          if (session.isPermanent && session.formType !== 'deposit' && !session.serviceCompleted) return false; // จองไม่มัดจำ → อยู่ tab จองไม่มัดจำ
          if (session.isPermanent) return true;
          if (session.formType === 'deposit' && session.serviceCompleted) return true; // deposit มารับบริการแล้ว → แสดงในคิว
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
      const allNotifData = [...data, ...ndData];

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
          broker.getCourses(s.brokerProClinicId)
            .then(result => {
              autoCoursesRequestedRef.current.delete(s.id);
              const cRef = doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', s.id);
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
    }, (error) => console.error("Firestore Error:", error));
    return () => unsubscribe();
  }, [db, appId, user, isNotifEnabled, notifVolume]);

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

  // ── Deposit: fetch options from ProClinic ──
  const fetchDepositOptions = async () => {
    if (depositOptions) return; // already loaded
    setDepositOptionsLoading(true);
    try {
      const res = await broker.getDepositOptions();
      if (res?.success) setDepositOptions(res.options);
      else console.warn('deposit-options failed:', res?.error);
    } catch (e) { console.error('fetchDepositOptions:', e); }
    setDepositOptionsLoading(false);
  };

  const confirmCreateDeposit = async () => {
    if (!user) return;
    setIsGenerating(true);
    setShowDepositForm(false);

    const shortId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const sessionId = `DEP-${shortId}`;

    const sessionDoc = {
      status: 'pending',
      createdAt: serverTimestamp(),
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
      },
    };

    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', sessionId), sessionDoc);
      setSelectedQR(sessionId);
      showToast('สร้างคิวลูกค้าจองมัดจำสำเร็จ!');
      setAdminMode('deposit', true);
    } catch (e) { console.error('createDeposit:', e); }
    setIsGenerating(false);
    // reset form
    setDepositFormData({
      sessionName: '', paymentChannel: '', paymentAmount: '', depositDate: todayISO(),
      depositTime: nowTime(), salesperson: '', hasAppointment: false,
      appointmentDate: '', appointmentStartTime: '', appointmentEndTime: '',
      consultant: '', doctor: '', assistant: '', room: '', appointmentChannel: '', visitPurpose: [],
    });
  };

  // ── No-deposit: create session + ProClinic appointment ──
  const confirmCreateNoDeposit = async () => {
    if (!user) return;
    setIsGenerating(true);
    setShowNoDepositForm(false);

    const shortId = Math.random().toString(36).substring(2, 8).toUpperCase();
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
    };

    const sessionDoc = {
      status: 'pending',
      createdAt: serverTimestamp(),
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

      // Create appointment in ProClinic (background — don't block UI)
      const visitPurposeText = (noDepositFormData.visitPurpose || []).join(', ');
      const apptResult = await broker.createAppointment({
        appointmentDate: noDepositFormData.appointmentDate,
        appointmentStartTime: noDepositFormData.appointmentStartTime,
        appointmentEndTime: noDepositFormData.appointmentEndTime,
        advisor: noDepositFormData.advisor,
        doctor: noDepositFormData.doctor,
        assistant: noDepositFormData.assistant,
        room: noDepositFormData.room,
        source: noDepositFormData.source,
        appointmentTo: visitPurposeText,
        appointmentNote: noDepositFormData.sessionName?.trim() || '',
      });

      if (apptResult?.success && apptResult.appointmentProClinicId) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', sessionId), {
          appointmentProClinicId: apptResult.appointmentProClinicId,
          appointmentSyncStatus: 'done',
        });
        showToast('สร้างคิวจองไม่มัดจำ + นัดหมาย ProClinic สำเร็จ!');
      } else {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', sessionId), {
          appointmentSyncStatus: 'failed',
          appointmentSyncError: apptResult?.error || 'Unknown error',
        });
        showToast('สร้างคิวสำเร็จ แต่สร้างนัดหมาย ProClinic ไม่สำเร็จ');
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
    };

    const visitPurposeText = (noDepositFormData.visitPurpose || []).join(', ');
    const apptPayload = {
      appointmentDate: noDepositFormData.appointmentDate,
      appointmentStartTime: noDepositFormData.appointmentStartTime,
      appointmentEndTime: noDepositFormData.appointmentEndTime,
      advisor: noDepositFormData.advisor,
      doctor: noDepositFormData.doctor,
      assistant: noDepositFormData.assistant,
      room: noDepositFormData.room,
      source: noDepositFormData.source,
      appointmentTo: visitPurposeText,
      appointmentNote: noDepositFormData.sessionName?.trim() || '',
    };

    try {
      // Update Firestore first
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', editingAppointment), {
        appointmentData,
        sessionName: noDepositFormData.sessionName?.trim() || session.sessionName,
      });

      if (session.appointmentProClinicId) {
        // Update existing appointment in ProClinic
        const apptResult = await broker.updateAppointment(session.appointmentProClinicId, apptPayload);
        if (apptResult?.success) {
          showToast('อัพเดทนัดหมาย ProClinic สำเร็จ!');
        } else {
          showToast('บันทึกใน app แล้ว แต่อัพเดท ProClinic ไม่สำเร็จ: ' + (apptResult?.error || ''));
        }
      } else {
        // No ProClinic ID yet (previous sync failed) → retry creating
        const apptResult = await broker.createAppointment(apptPayload);
        if (apptResult?.success && apptResult.appointmentProClinicId) {
          await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', editingAppointment), {
            appointmentProClinicId: apptResult.appointmentProClinicId,
            appointmentSyncStatus: 'done',
            appointmentSyncError: null,
          });
          showToast('สร้างนัดหมาย ProClinic สำเร็จ!');
        } else {
          await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', editingAppointment), {
            appointmentSyncStatus: 'failed',
            appointmentSyncError: apptResult?.error || 'Unknown error',
          });
          showToast('บันทึกใน app แล้ว แต่สร้างนัดหมาย ProClinic ไม่สำเร็จ: ' + (apptResult?.error || ''));
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
    const shortId = Math.random().toString(36).substring(2, 8).toUpperCase();
    
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
      } else {
        // ไม่มีข้อมูล → ลบทิ้งเลย
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
      setAdminMode('dashboard'); // ย้ายไปหน้าคิว
    } catch (error) { console.error('handleNoDepositServiceStart error:', error); }
  };

  const handleNoDepositCancel = async (session) => {
    try {
      // Delete appointment from ProClinic first (if exists)
      if (session.appointmentProClinicId) {
        try {
          await broker.deleteAppointment(session.appointmentProClinicId);
        } catch (e) { console.warn('deleteAppointment failed (non-blocking):', e); }
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
    if (session.isUnread && !isDepositKeepUnread) {
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
      setAdminMode('dashboard');
    } catch(e) { console.error('restoreToQueue:', e); }
  };

  // ─── OPD / Broker button ────────────────────────────────────────────────────
  const handleOpdClick = async (session) => {
    const sessionId = session.id;
    const d = session.patientData;

    // If already recorded successfully → block (ต้องลบจากหน้าประวัติเท่านั้น)
    if (session.opdRecordedAt && session.brokerStatus === 'done') return;

    // Build patient payload
    const reasons = getReasons(d);
    const pmh = [];
    if (d?.hasUnderlying === 'มี') {
      if (d.ud_hypertension) pmh.push('ความดันโลหิตสูง');
      if (d.ud_diabetes)     pmh.push('เบาหวาน');
      if (d.ud_lung)         pmh.push('โรคปอด');
      if (d.ud_kidney)       pmh.push('โรคไต');
      if (d.ud_heart)        pmh.push('โรคหัวใจ');
      if (d.ud_blood)        pmh.push('โรคโลหิต');
      if (d.ud_other && d.ud_otherDetail) pmh.push(d.ud_otherDetail);
    }

    const patient = {
      prefix:     d?.prefix    || '',
      firstName:  d?.firstName || '',
      lastName:   d?.lastName  || '',
      phone:      d?.phone     || '',
      age:        d?.age       || '',
      reasons,
      dobDay: d?.dobDay || '', dobMonth: d?.dobMonth || '', dobYear: d?.dobYear || '',
      address: d?.address || '',
      province: d?.province || '',
      district: d?.district || '', subDistrict: d?.subDistrict || '', postalCode: d?.postalCode || '',
      nationality: d?.nationality || 'ไทย',
      nationalityCountry: d?.nationalityCountry || '',
      howFoundUs: d?.howFoundUs || [],
      allergies:  d?.hasAllergies === 'มี' ? d.allergiesDetail : '',
      underlying: pmh.join(', '),
      emergencyName:     d?.emergencyName     || '',
      emergencyRelation: d?.emergencyRelation || '',
      emergencyPhone:    d?.emergencyPhone    || '',
      clinicalSummary: generateClinicalSummary(d, session.formType || 'intake', session.customTemplate, 'en'),
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
      let result;
      if (hasExistingProClinic) {
        result = await broker.updateProClinic(
          session.brokerProClinicId || null, session.brokerProClinicHN || null, patient);
      } else {
        result = await broker.fillProClinic(patient);
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
      } else if (result?.notFound) {
        // HN ไม่เจอใน ProClinic → ถอด HN/OPD แล้วลอง create ใหม่อัตโนมัติ
        await updateDoc(ref, {
          brokerProClinicId: null, brokerProClinicHN: null,
          opdRecordedAt: null, brokerLastAutoSyncAt: null,
          brokerStatus: null, brokerError: null, brokerJob: null,
          patientLinkToken: null, patientLinkEnabled: false,
        });
        showToast('HN ไม่พบใน ProClinic — ถอด HN แล้ว กำลังบันทึกใหม่...');
        // ลอง create ใหม่
        const createResult = await broker.fillProClinic(patient);
        if (createResult?.success) {
          await updateDoc(ref, {
            opdRecordedAt: new Date().toISOString(),
            brokerStatus: 'done', brokerFilledAt: new Date().toISOString(),
            brokerError: null, brokerJob: null,
            ...(createResult.proClinicId ? { brokerProClinicId: createResult.proClinicId } : {}),
            ...(createResult.proClinicHN ? { brokerProClinicHN: createResult.proClinicHN } : {}),
          });
        } else {
          await updateDoc(ref, { brokerStatus: 'failed', brokerError: createResult?.error || 'สร้างใหม่ไม่สำเร็จ', brokerJob: null });
        }
      } else {
        await updateDoc(ref, { brokerStatus: 'failed', brokerError: result?.error || 'ไม่ทราบสาเหตุ', brokerJob: null });
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
    const reasons = getReasons(d);
    const pmh = [];
    if (d?.hasUnderlying === 'มี') {
      if (d.ud_hypertension) pmh.push('ความดันโลหิตสูง');
      if (d.ud_diabetes)     pmh.push('เบาหวาน');
      if (d.ud_lung)         pmh.push('โรคปอด');
      if (d.ud_kidney)       pmh.push('โรคไต');
      if (d.ud_heart)        pmh.push('โรคหัวใจ');
      if (d.ud_blood)        pmh.push('โรคโลหิต');
      if (d.ud_other && d.ud_otherDetail) pmh.push(d.ud_otherDetail);
    }
    const patient = {
      prefix: d?.prefix || '', firstName: d?.firstName || '',
      lastName: d?.lastName || '', phone: d?.phone || '',
      age: d?.age || '', reasons,
      dobDay: d?.dobDay || '', dobMonth: d?.dobMonth || '', dobYear: d?.dobYear || '',
      address: d?.address || '',
      province: d?.province || '',
      district: d?.district || '', subDistrict: d?.subDistrict || '', postalCode: d?.postalCode || '',
      nationality: d?.nationality || 'ไทย',
      nationalityCountry: d?.nationalityCountry || '',
      howFoundUs: d?.howFoundUs || [],
      allergies: d?.hasAllergies === 'มี' ? d.allergiesDetail : '',
      underlying: pmh.join(', '),
      emergencyName:     d?.emergencyName     || '',
      emergencyRelation: d?.emergencyRelation || '',
      emergencyPhone:    d?.emergencyPhone    || '',
      clinicalSummary: generateClinicalSummary(d, session.formType || 'intake', session.customTemplate, 'en'),
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
    } catch(e) { console.error('resync pending update:', e); }

    try {
      const ref = doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', sessionId);
      let result;
      if (hasExistingProClinic) {
        result = await broker.updateProClinic(
          session.brokerProClinicId || null, session.brokerProClinicHN || null, patient);
      } else {
        result = await broker.fillProClinic(patient);
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
        // HN ไม่เจอใน ProClinic → ถอด HN/OPD ออก พร้อมบันทึกใหม่
        setViewingSession(prev => prev?.id === sessionId
          ? { ...prev, brokerStatus: null, brokerError: null, brokerProClinicId: null, brokerProClinicHN: null, opdRecordedAt: null, brokerLastAutoSyncAt: null, patientLinkToken: null, patientLinkEnabled: false } : prev);
        await updateDoc(ref, {
          brokerStatus: null, brokerError: null, brokerJob: null,
          brokerProClinicId: null, brokerProClinicHN: null,
          opdRecordedAt: null, brokerLastAutoSyncAt: null,
          patientLinkToken: null, patientLinkEnabled: false,
        });
        showToast('HN ไม่พบใน ProClinic — ถอด HN ออกแล้ว พร้อมบันทึกใหม่');
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
    const ref = doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', sessionId);
    const reasons = getReasons(d);
    const pmh = [];
    if (d.hasUnderlying === 'มี') {
      if (d.ud_hypertension) pmh.push('ความดันโลหิตสูง');
      if (d.ud_diabetes) pmh.push('เบาหวาน');
      if (d.ud_lung) pmh.push('โรคปอด');
      if (d.ud_kidney) pmh.push('โรคไต');
      if (d.ud_heart) pmh.push('โรคหัวใจ');
      if (d.ud_blood) pmh.push('โรคโลหิต');
      if (d.ud_other && d.ud_otherDetail) pmh.push(d.ud_otherDetail);
    }
    const patient = {
      prefix: d?.prefix || '', firstName: d?.firstName || '',
      lastName: d?.lastName || '', phone: d?.phone || '',
      age: d?.age || '', reasons,
      dobDay: d?.dobDay || '', dobMonth: d?.dobMonth || '', dobYear: d?.dobYear || '',
      address: d?.address || '', province: d?.province || '',
      district: d?.district || '', subDistrict: d?.subDistrict || '', postalCode: d?.postalCode || '',
      nationality: d?.nationality || 'ไทย',
      nationalityCountry: d?.nationalityCountry || '',
      howFoundUs: d?.howFoundUs || [],
      allergies: d?.hasAllergies === 'มี' ? d.allergiesDetail : '',
      underlying: pmh.join(', '),
      emergencyName: d?.emergencyName || '',
      emergencyRelation: d?.emergencyRelation || '',
      emergencyPhone: d?.emergencyPhone || '',
      clinicalSummary: generateClinicalSummary(d, 'intake', null, 'en'),
    };

    try {
      // Step 1: Create/update customer in ProClinic (if not done yet)
      let proClinicId = session.brokerProClinicId;
      let proClinicHN = session.brokerProClinicHN;

      const alreadySynced = !!proClinicId && session.depositSyncStatus === 'done';

      if (!proClinicId) {
        // First time: create customer in ProClinic
        // Fire-and-forget: don't block API call on Firestore write
        updateDoc(ref, { brokerStatus: 'pending' }).catch(() => {});
        showToast('กำลังสร้างลูกค้าใน ProClinic...');
        const result = await broker.fillProClinic(patient);
        if (!result?.success) throw new Error(result?.error || 'สร้างลูกค้าไม่สำเร็จ');
        proClinicId = result.proClinicId;
        proClinicHN = result.proClinicHN;
        await updateDoc(ref, {
          brokerStatus: 'done', brokerError: null,
          brokerProClinicId: proClinicId, brokerProClinicHN: proClinicHN,
          opdRecordedAt: serverTimestamp(),
        });
        showToast(`สร้างลูกค้าสำเร็จ HN: ${proClinicHN} — กำลังบันทึกมัดจำ...`);
      } else if (alreadySynced) {
        // Re-sync: update existing customer OPD data
        showToast('กำลังอัพเดทข้อมูลลูกค้าใน ProClinic...');
        await broker.updateProClinic(proClinicId, proClinicHN, patient);
        await updateDoc(ref, { brokerLastAutoSyncAt: serverTimestamp() });
        showToast('อัพเดทข้อมูลลูกค้าสำเร็จ — กำลังอัพเดทมัดจำ...');
      } else {
        showToast('กำลังบันทึกมัดจำลง ProClinic...');
      }

      // Step 2: Submit or update deposit in ProClinic
      await updateDoc(ref, { depositSyncStatus: 'pending' });
      const dep = session.depositData || {};
      const depositPayload = {
        ...dep,
        appointmentTo: (dep.visitPurpose || []).join(', '),
      };

      let depResult;
      if (alreadySynced) {
        // Re-sync: update existing deposit
        depResult = await broker.updateDeposit(proClinicId, proClinicHN, session.depositProClinicId || null, depositPayload);
      } else {
        // First time: create new deposit
        depResult = await broker.submitDeposit(proClinicId, proClinicHN, depositPayload);
      }
      if (!depResult?.success) {
        if (depResult?.debug) console.error('deposit sync debug:', depResult.debug);
        throw new Error(depResult?.error || 'บันทึกมัดจำไม่สำเร็จ');
      }

      await updateDoc(ref, {
        depositSyncStatus: 'done',
        depositSyncError: null,
        depositSyncAt: serverTimestamp(),
        isUnread: false,
        ...(depResult.depositProClinicId ? { depositProClinicId: depResult.depositProClinicId } : {}),
      });
      lastViewedStrRef.current[session.id] = stableStr(d || {});
      lastAutoSyncedStrRef.current[session.id] = stableStr(d || {});
      showToast(alreadySynced ? 'อัพเดทข้อมูลสำเร็จ!' : 'บันทึกมัดจำสำเร็จ!');
    } catch (e) {
      console.error('deposit sync error:', e);
      await updateDoc(ref, {
        depositSyncStatus: 'failed',
        depositSyncError: e.message,
      }).catch(console.error);
      showToast(`ผิดพลาด: ${e.message}`);
    }
  };

  const handleDepositCancel = async (session) => {
    const sessionId = session.id;
    const ref = doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', sessionId);
    const proClinicId = session.brokerProClinicId;
    const proClinicHN = session.brokerProClinicHN;

    try {
      await updateDoc(ref, { depositSyncStatus: 'pending' });
      showToast('กำลังยกเลิกการจองใน ProClinic...');

      if (proClinicId) {
        const result = await broker.cancelDeposit(proClinicId, proClinicHN);
        if (!result?.success) throw new Error(result?.error || 'ยกเลิกการจองไม่สำเร็จ');
        showToast(result.message || 'ยกเลิกการจองสำเร็จ');
      }

      // Archive the session (move to deposit history)
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
    try {
      const ref = doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', sessionId);
      // Find the session to check if deposit was already synced to ProClinic
      const sess = [...depositSessions, ...archivedDepositSessions].find(s => s.id === sessionId);
      const alreadySynced = sess?.depositSyncStatus === 'done' && sess?.brokerProClinicId;

      // Save locally first
      await updateDoc(ref, { depositData: newData });
      setEditingDepositData(null);

      if (alreadySynced) {
        // Also update in ProClinic
        showToast('กำลังอัพเดทข้อมูลจองใน ProClinic...');
        await updateDoc(ref, { depositSyncStatus: 'pending' });
        const depositPayload = { ...newData, appointmentTo: (newData.visitPurpose || []).join(', ') };
        const result = await broker.updateDeposit(
          sess.brokerProClinicId, sess.brokerProClinicHN,
          sess.depositProClinicId || null, depositPayload
        );
        if (!result?.success) {
          await updateDoc(ref, { depositSyncStatus: 'failed', depositSyncError: result?.error });
          showToast(`บันทึกในระบบแล้ว แต่อัพเดท ProClinic ไม่สำเร็จ: ${result?.error}`);
          return;
        }
        await updateDoc(ref, {
          depositSyncStatus: 'done', depositSyncError: null, depositSyncAt: serverTimestamp(),
          ...(result.depositId ? { depositProClinicId: result.depositId } : {}),
        });
        showToast('อัพเดทข้อมูลจองสำเร็จทั้งในระบบและ ProClinic');
      } else {
        // Not yet synced — reset sync status so user can re-sync
        await updateDoc(ref, { depositSyncStatus: null, depositSyncAt: null });
        showToast('บันทึกข้อมูลจองสำเร็จ');
      }
    } catch (e) {
      showToast(`ผิดพลาด: ${e.message}`);
    }
  };

  const handleProClinicEdit = (session) => {
    const proClinicId = session.brokerProClinicId;
    if (!proClinicId) return;
    window.open(`${PROCLINIC_ORIGIN}/admin/customer/${proClinicId}/edit`, '_blank');
  };

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
      token = Math.random().toString(36).substr(2, 10) + Math.random().toString(36).substr(2, 10);
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
      const result = await broker.getCourses(session.brokerProClinicId);
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
    const token = Math.random().toString(36).substr(2, 10) + Math.random().toString(36).substr(2, 10);
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

  const handleProClinicDelete = async (session) => {
    const proClinicId = session.brokerProClinicId;
    if (!window.confirm(`ลบลูกค้านี้ออกจาก ProClinic ด้วยใช่ไหม?\n(จะลบเฉพาะใน ProClinic — ข้อมูลใน LoverClinic ยังอยู่)`)) return;
    const d = session.patientData || {};
    const patient = {
      prefix: d.prefix || '', firstName: d.firstName || '',
      lastName: d.lastName || '', phone: d.phone || '',
      emergencyName: d.emergencyName || '', emergencyRelation: d.emergencyRelation || '', emergencyPhone: d.emergencyPhone || '',
    };
    const jobId = `${session.id}_del_${Date.now()}`;
    const brokerJob = { id: jobId, type: 'LC_DELETE_PROCLINIC', proClinicId, proClinicHN: session.brokerProClinicHN || null, patient };
    setBrokerPending(prev => ({ ...prev, [session.id]: true }));
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', session.id), {
        brokerJob, brokerStatus: 'pending', brokerError: null,
      });
    } catch(e) { console.error('delete job write:', e); }

    try {
      const result = await broker.deleteProClinic(
        proClinicId, session.brokerProClinicHN || null, patient);
      setBrokerPending(prev => { const n = { ...prev }; delete n[session.id]; return n; });
      const ref = doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', session.id);
      if (result?.success || result?.notFound) {
        // ลบสำเร็จ หรือ customer ไม่อยู่แล้ว → ถอด HN/OPD ออกทั้งคู่
        setViewingSession(prev => prev?.id === session.id
          ? { ...prev, brokerStatus: null, brokerError: null, brokerProClinicId: null, brokerProClinicHN: null, opdRecordedAt: null, brokerLastAutoSyncAt: null, patientLinkToken: null, patientLinkEnabled: false }
          : prev);
        await updateDoc(ref, { opdRecordedAt: null, brokerStatus: null, brokerError: null,
          brokerProClinicId: null, brokerProClinicHN: null, brokerLastAutoSyncAt: null, brokerJob: null,
          patientLinkToken: null, patientLinkEnabled: false });
        if (result?.notFound) {
          showToast('HN ไม่พบใน ProClinic (ถูกลบไปแล้ว) — ถอด HN ออก พร้อมบันทึกใหม่');
        }
      } else {
        await updateDoc(ref, { brokerStatus: null, brokerJob: null });
        showToast(`ลบ ProClinic ไม่สำเร็จ: ${result?.error}`);
      }
    } catch(e) {
      setBrokerPending(prev => { const n = { ...prev }; delete n[session.id]; return n; });
      console.error('delete error:', e);
    }
  };

  const activeSessionInfo = selectedQR ? sessions.find(s => s.id === selectedQR) : null;
  const unreadCount = sessions.filter(s => s.isUnread).length;
  const PROCLINIC_ORIGIN = 'https://trial.proclinicth.com';
  const getProClinicUrl = (id) => id ? `${PROCLINIC_ORIGIN}/admin/customer/${id}` : null;

  // ── Import from ProClinic handlers ──────────────────────────────────────────
  const handleImportSearch = async () => {
    const q = importSearch.trim();
    if (!q) return;
    setImportLoading(true);
    setImportResults(null);
    setImportPreview(null);
    setImportError('');
    setImportSuccess('');
    try {
      const result = await broker.searchCustomers(q);
      if (!result.success) throw new Error(result.error || 'ค้นหาไม่สำเร็จ');
      setImportResults(result.customers || []);
    } catch (err) {
      setImportError(err.message);
    } finally {
      setImportLoading(false);
    }
  };

  const handleImportSelect = async (proClinicId) => {
    setImportPreviewLoading(true);
    setImportPreview(null);
    setImportError('');
    try {
      const [patientRes, coursesRes] = await Promise.all([
        broker.fetchPatientFromProClinic(proClinicId),
        broker.getCourses(proClinicId),
      ]);
      if (!patientRes.success) throw new Error(patientRes.error || 'ดึงข้อมูลไม่สำเร็จ');
      setImportPreview({
        patient: patientRes.patient,
        proClinicId: patientRes.proClinicId,
        proClinicHN: patientRes.proClinicHN,
        courses: coursesRes.success ? coursesRes.courses : [],
        expiredCourses: coursesRes.success ? coursesRes.expiredCourses : [],
        appointments: coursesRes.success ? coursesRes.appointments : [],
      });
    } catch (err) {
      setImportError(err.message);
    } finally {
      setImportPreviewLoading(false);
    }
  };

  const checkImportDuplicate = (patient, proClinicHN) => {
    const allSessions = [...sessions, ...archivedSessions];
    const normalPhone = (p) => (p || '').replace(/\D/g, '');
    for (const s of allSessions) {
      const d = s.patientData;
      // HN match
      if (proClinicHN && s.brokerProClinicHN === proClinicHN) {
        return { duplicate: s, canResync: s.brokerStatus !== 'done' };
      }
      // Phone match
      if (patient.phone && d?.phone && normalPhone(patient.phone) === normalPhone(d.phone)) {
        return { duplicate: s, canResync: s.brokerStatus !== 'done' };
      }
      // ID card match
      if (patient.idCard && d?.idCard && patient.idCard === d.idCard) {
        return { duplicate: s, canResync: s.brokerStatus !== 'done' };
      }
    }
    return { duplicate: null, canResync: false };
  };

  const handleImportConfirm = async () => {
    if (!importPreview) return;
    const { patient, proClinicId, proClinicHN, courses, expiredCourses, appointments } = importPreview;
    setImportError('');
    setImportSuccess('');

    const { duplicate, canResync } = checkImportDuplicate(patient, proClinicHN);

    if (duplicate && !canResync) {
      setImportError(`ข้อมูลซ้ำกับ "${duplicate.sessionName || duplicate.id}" (${duplicate.id}) ที่มีอยู่แล้วในระบบ`);
      return;
    }

    try {
      if (duplicate && canResync) {
        // Auto resync existing session
        const sessionRef = doc(db, `artifacts/${appId}/public/data/opd_sessions`, duplicate.id);
        await updateDoc(sessionRef, {
          brokerProClinicId: proClinicId,
          brokerProClinicHN: proClinicHN,
          brokerStatus: 'done',
          brokerError: null,
          brokerFilledAt: new Date().toISOString(),
          opdRecordedAt: new Date().toISOString(),
          patientData: patient,
          latestCourses: { courses, expiredCourses, appointments, fetchedAt: new Date().toISOString(), success: true },
        });
        setImportSuccess(`Resync สำเร็จ — อัพเดทข้อมูล "${duplicate.sessionName || duplicate.id}"`);
      } else {
        // Create new imported session
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
        const sessionId = `IMP-${code}`;
        const sessionName = [patient.firstName, patient.lastName].filter(Boolean).join(' ') || 'นำเข้าจาก ProClinic';
        const sessionRef = doc(db, `artifacts/${appId}/public/data/opd_sessions`, sessionId);
        await setDoc(sessionRef, {
          status: 'completed',
          isArchived: true,
          archivedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          submittedAt: new Date().toISOString(),
          formType: 'intake',
          sessionName,
          patientData: patient,
          brokerProClinicId: proClinicId,
          brokerProClinicHN: proClinicHN,
          brokerStatus: 'done',
          brokerFilledAt: new Date().toISOString(),
          opdRecordedAt: new Date().toISOString(),
          brokerError: null,
          latestCourses: { courses, expiredCourses, appointments, fetchedAt: new Date().toISOString(), success: true },
          importedFromProClinic: true,
          importedAt: new Date().toISOString(),
        });
        setImportSuccess(`นำเข้าสำเร็จ — ${sessionName} (${sessionId})`);
      }
      setImportPreview(null);
      setImportResults(null);
      setImportSearch('');
    } catch (err) {
      setImportError(`เกิดข้อผิดพลาด: ${err.message}`);
    }
  };

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

  return (
    <div className="w-full max-w-[1600px] mx-auto p-4 md:p-6 lg:p-8 animate-in fade-in duration-500 overflow-x-hidden">
      
      {toastMsg && (
        <div className="fixed bottom-6 right-6 bg-blue-600 text-white px-5 py-4 rounded-2xl shadow-[0_10px_30px_rgba(37,99,235,0.3)] flex items-center gap-4 animate-in slide-in-from-bottom-5 z-[100] border border-blue-400">
          <div className="bg-white/20 p-2 rounded-full"><Bell size={24} className="animate-bounce" /></div>
          <div><h4 className="font-black text-sm font-semibold">มีการอัปเดตข้อมูล</h4><p className="text-xs opacity-90 font-medium">{toastMsg}</p></div>
          <button onClick={() => setToastMsg(null)} className="ml-2 p-1 opacity-50 hover:opacity-100 transition-opacity bg-black/20 rounded-full"><X size={16}/></button>
        </div>
      )}

      <header className="flex flex-col xl:flex-row items-start xl:items-center justify-between mb-6 sm:mb-8 bg-[var(--bg-surface)] p-4 sm:p-5 rounded-2xl sm:rounded-3xl shadow-[var(--shadow-panel)] border border-[var(--bd)] gap-3 relative overflow-visible z-20">
        <div className="absolute top-[-50px] left-[-50px] w-40 h-40 rounded-full blur-[50px] pointer-events-none" style={{backgroundColor: `rgba(${acRgb},0.15)`}}></div>

        {/* ── Row 1: Logo + compact action icons (mobile) ── */}
        <div className="relative flex items-center justify-between w-full xl:w-auto gap-1.5 sm:gap-3 z-20">
          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
            <ClinicLogo className="h-7 sm:h-10 max-w-[80px] sm:max-w-[160px] xl:max-w-[200px] w-auto shrink-0" showText={false} clinicSettings={cs} theme={theme} />
            <div className="h-6 sm:h-8 w-px bg-[var(--bd)] shrink-0 hidden sm:block"></div>
            <p className="text-[11px] sm:text-xs text-[var(--tx-muted)] truncate hidden sm:block">{cs.clinicSubtitle || 'ระบบ OPD รับผู้ป่วย'}</p>
          </div>
          {/* Mobile-only: icon-only actions */}
          <div className="flex items-center gap-1 sm:gap-1.5 xl:hidden shrink-0">
            <button onClick={() => { setSessionModalTab('standard'); setShowSessionModal(true); }} disabled={isGenerating}
              className="p-2 sm:p-2.5 rounded-lg text-white flex items-center justify-center disabled:opacity-70 transition-all"
              style={{backgroundColor: ac, boxShadow: `0 0 10px rgba(${acRgb},0.3)`}} title="สร้างคิวใหม่">
              <PlusCircle size={15} />
            </button>
            <div className="relative">
              <button onClick={() => setShowNotifSettings(!showNotifSettings)}
                className={`border p-2 sm:p-2.5 rounded-lg transition-all ${isNotifEnabled ? 'bg-blue-950/30 border-blue-900/50 text-blue-500' : 'bg-[var(--bg-input)] border-[var(--bd)] text-[var(--tx-muted)]'}`}>
                {isNotifEnabled ? <Bell size={15} /> : <BellOff size={15} />}
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
            {theme && setTheme && <ThemeToggle theme={theme} setTheme={setTheme} compact />}
            {/* Online admins indicator */}
            <div className="relative group">
              <div className="flex items-center gap-1 px-2 py-1.5 sm:py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] cursor-default" title={`ออนไลน์ ${onlineAdmins.length} คน`}>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                <span className="text-xs sm:text-xs font-bold text-green-500">{onlineAdmins.length}</span>
              </div>
              {/* Tooltip on hover — show who's online */}
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
            <button onClick={() => signOut(auth)} className="bg-[var(--bg-input)] border border-[var(--bd)] hover:border-red-900/50 text-[var(--tx-muted)] hover:text-red-500 p-2 sm:p-2.5 rounded-lg transition-all" title="ออกจากระบบ">
              <LogOut size={15} />
            </button>
          </div>
        </div>

        {/* ── Row 2: Nav tabs — mobile full-width ── */}
        <div className="grid grid-cols-4 gap-0.5 w-full xl:hidden z-0">
          {[
            { mode: 'chat', icon: <MessageCircle size={14} />, label: 'แชท', badge: isChatActive ? chatUnread : 0, badgeColor: 'bg-blue-500', activeClass: 'bg-blue-700 text-white', blinkWhenBadge: isChatActive },
            { mode: 'dashboard', icon: <Activity size={14} />, label: 'คิว', badge: unreadCount, badgeColor: 'bg-red-500', activeStyle: {backgroundColor: ac, color: '#fff', /* no glow */}, activeClass: '' },
            { mode: 'noDeposit', icon: <UserPlus size={14} />, label: 'ไม่มัดจำ', badge: noDepositSessions.filter(s => s.isUnread).length, badgeColor: 'bg-orange-500', activeClass: 'bg-orange-700 text-white' },
            { mode: 'deposit', icon: <Banknote size={14} />, label: 'มัดจำ', badge: depositSessions.filter(s => s.isUnread).length, badgeColor: 'bg-emerald-500', activeClass: 'bg-emerald-700 text-white' },
            { mode: 'appointment', icon: <CalendarDays size={14} />, label: 'นัด', activeClass: 'bg-sky-700 text-white' },
            { mode: 'history', icon: <History size={14} />, label: 'ประวัติ', activeClass: 'bg-amber-700 text-white' },
            { mode: 'clinicSettings', icon: <Palette size={14} />, label: 'ตั้งค่า', activeStyle: {backgroundColor: ac, color: '#fff', /* no glow */}, activeClass: '' },
            { mode: '_backend', icon: <Database size={14} />, label: 'หลังบ้าน', activeClass: 'bg-violet-700 text-white', isExternal: true },
          ].map(tab => {
            if (tab.isExternal) {
              return (
                <button key={tab.mode} onClick={() => window.open('?backend=1', '_blank')}
                  className="py-2 rounded-xl font-bold text-[11px] sm:text-xs flex flex-col items-center justify-center gap-0.5 transition-all relative bg-[var(--bg-hover)] border border-[var(--bd)] text-violet-400 hover:text-violet-300 hover:border-violet-800/50">
                  {tab.icon}
                  <span className="truncate w-full text-center px-0.5">{tab.label}</span>
                </button>
              );
            }
            const isActive = tab.mode === 'dashboard' ? adminMode === 'dashboard' : tab.mode === 'noDeposit' ? (adminMode === 'noDeposit' || adminMode === 'noDepositHistory') : tab.mode === 'deposit' ? (adminMode === 'deposit' || adminMode === 'depositHistory') : tab.mode === 'clinicSettings' ? (adminMode === 'clinicSettings' || adminMode === 'formBuilder') : adminMode === tab.mode;
            return (
              <button key={tab.mode} onClick={() => setAdminMode(tab.mode)}
                className={`py-2 rounded-xl font-bold text-[11px] sm:text-xs flex flex-col items-center justify-center gap-0.5 transition-all relative ${isActive ? tab.activeClass : tab.blinkWhenBadge && tab.badge > 0 && !isActive ? 'chat-tab-blink' : 'bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)]'}`}
                style={isActive && tab.activeStyle ? tab.activeStyle : {}}>
                {tab.icon}
                <span className="truncate w-full text-center px-0.5">{tab.label}</span>
                {tab.badge > 0 && <span className={`absolute -top-1 -right-0.5 ${tab.badgeColor} text-white text-[8px] font-black rounded-full min-w-[16px] h-4 px-0.5 flex items-center justify-center leading-none`}>{tab.badge > 99 ? '99+' : tab.badge}</span>}
              </button>
            );
          })}
        </div>

        {/* ── Desktop: full button row ── */}
        <div className="hidden xl:flex items-center gap-2 z-10 flex-wrap">
          <button onClick={() => setAdminMode('chat')} className={`px-4 py-3 rounded-lg font-bold font-bold text-xs transition-all flex items-center justify-center gap-2 relative ${adminMode === 'chat' ? 'bg-blue-700 text-white' : isChatActive && chatUnread > 0 ? 'chat-tab-blink' : 'bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-blue-400 hover:border-blue-900/50'}`}>
            <MessageCircle size={16} /> แชท
            {chatUnread > 0 && <span className="absolute -top-1.5 -right-1.5 bg-blue-500 text-white text-[8px] font-black rounded-full min-w-[16px] h-4 px-0.5 flex items-center justify-center leading-none">{chatUnread > 99 ? '99+' : chatUnread}</span>}
          </button>
          <button onClick={() => setAdminMode('dashboard')} className={`px-4 py-3 rounded-lg font-bold font-bold text-xs transition-all flex items-center justify-center gap-2 relative ${adminMode === 'dashboard' ? '' : 'bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-white'}`} style={adminMode === 'dashboard' ? {backgroundColor: ac, color: '#fff', /* no glow */} : {}}>
            <Activity size={16} /> หน้าคิว
            {unreadCount > 0 && <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[8px] font-black rounded-full min-w-[16px] h-4 px-0.5 flex items-center justify-center leading-none">{unreadCount > 99 ? '99+' : unreadCount}</span>}
          </button>
          <button onClick={() => setAdminMode('noDeposit')} className={`px-4 py-3 rounded-lg font-bold font-bold text-xs transition-all flex items-center justify-center gap-2 relative ${adminMode === 'noDeposit' || adminMode === 'noDepositHistory' ? 'bg-orange-700 text-white' : 'bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-orange-400 hover:border-orange-900/50'}`} title="ลูกค้าจองไม่มัดจำ">
            <UserPlus size={16} /> จองไม่มัดจำ
            {noDepositSessions.filter(s => s.isUnread).length > 0 && <span className="absolute -top-1.5 -right-1.5 bg-orange-500 text-white text-[8px] font-black rounded-full min-w-[16px] h-4 px-0.5 flex items-center justify-center leading-none">{noDepositSessions.filter(s => s.isUnread).length}</span>}
          </button>
          <button onClick={() => setAdminMode('deposit')} className={`px-4 py-3 rounded-lg font-bold font-bold text-xs transition-all flex items-center justify-center gap-2 relative ${adminMode === 'deposit' || adminMode === 'depositHistory' ? 'bg-emerald-700 text-white' : 'bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-emerald-400 hover:border-emerald-900/50'}`} title="ลูกค้าจองมัดจำ">
            <Banknote size={16} /> จองมัดจำ
            {depositSessions.filter(s => s.isUnread).length > 0 && <span className="absolute -top-1.5 -right-1.5 bg-emerald-500 text-white text-[8px] font-black rounded-full min-w-[16px] h-4 px-0.5 flex items-center justify-center leading-none">{depositSessions.filter(s => s.isUnread).length}</span>}
          </button>
          <button onClick={() => setAdminMode('appointment')} className={`px-4 py-3 rounded-lg font-bold font-bold text-xs transition-all flex items-center justify-center gap-2 ${adminMode === 'appointment' ? 'bg-sky-700 text-white' : 'bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-sky-400 hover:border-sky-900/50'}`} title="นัดหมาย ProClinic">
            <CalendarDays size={16} /> นัดหมาย
          </button>
          <button onClick={() => setAdminMode('history')} className={`px-4 py-3 rounded-lg font-bold font-bold text-xs transition-all flex items-center justify-center gap-2 ${adminMode === 'history' ? 'bg-amber-700 text-white' : 'bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-amber-400 hover:border-amber-900/50'}`} title="ประวัติผู้ป่วย">
            <History size={16} /> ประวัติ
          </button>
          <button onClick={() => setAdminMode('clinicSettings')} className={`px-4 py-3 rounded-lg font-bold font-bold text-xs transition-all flex items-center justify-center gap-2 ${(adminMode === 'clinicSettings' || adminMode === 'formBuilder') ? '' : 'bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-white'}`} style={(adminMode === 'clinicSettings' || adminMode === 'formBuilder') ? {backgroundColor: ac, color: '#fff', /* no glow */} : {}} title="ตั้งค่าระบบ">
            <Palette size={16} /> ตั้งค่า
          </button>
          <button onClick={() => window.open('?backend=1', '_blank')} className="px-4 py-3 rounded-lg font-bold font-bold text-xs transition-all flex items-center justify-center gap-2 bg-[var(--bg-hover)] border border-[var(--bd)] text-violet-400 hover:text-violet-300 hover:border-violet-800/50 hover:opacity-90" title="ระบบหลังบ้าน (เปิด tab ใหม่)">
            <Database size={16} /> หลังบ้าน
          </button>
          <div className="h-8 w-px bg-[var(--bd)] mx-2"></div>
          <button onClick={() => { setSessionModalTab('standard'); setShowSessionModal(true); }} disabled={isGenerating} className="bg-[var(--bg-hover)] hover:bg-[var(--bg-elevated)] border border-[var(--bd)] text-white px-3 py-3 rounded-lg font-bold font-bold text-xs transition-all flex items-center justify-center gap-2 disabled:opacity-70">
            <PlusCircle size={16} /> สร้างคิวใหม่
          </button>
          <div className="relative flex-none">
            <button onClick={() => setShowNotifSettings(!showNotifSettings)} className={`border p-3 rounded-lg font-semibold transition-all shadow-sm ${isNotifEnabled ? 'bg-blue-950/30 border-blue-900/50 text-blue-500 hover:bg-blue-900/50' : 'bg-[var(--bg-card)] border-[var(--bd)] text-gray-500 hover:bg-[var(--bg-hover)]'}`} title="ตั้งค่าการแจ้งเตือน">
              {isNotifEnabled ? <Bell size={16} /> : <BellOff size={16} />}
            </button>
            {showNotifSettings && (
              <div className="absolute right-0 top-14 w-64 bg-[var(--bg-surface)] border border-[var(--bd)] rounded-xl shadow-2xl p-4 z-[200] animate-in slide-in-from-top-2">
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
                      <span>ระดับเสียง</span>
                      <span className="text-blue-500">{Math.round(notifVolume * 100)}%</span>
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
          {theme && setTheme && <ThemeToggle theme={theme} setTheme={setTheme} />}
          {/* Online admins indicator — desktop */}
          <div className="relative group">
            <div className="flex items-center gap-1.5 px-3 py-3 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] cursor-default" title={`ออนไลน์ ${onlineAdmins.length} คน`}>
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
          <button onClick={() => signOut(auth)} className="bg-[var(--bg-input)] hover:bg-[var(--bg-hover)] border border-[var(--bd)] hover:border-red-900/50 text-[var(--tx-muted)] hover:text-red-500 p-3 rounded-lg font-semibold transition-all shadow-sm flex-none" title="ออกจากระบบ">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {adminMode === 'chat' ? (
        <div className="bg-[var(--bg-card)] rounded-2xl sm:rounded-3xl shadow-xl border border-[var(--bd)] p-4 sm:p-6">
          <ChatPanel db={db} appId={appId} user={user} clinicSettings={clinicSettings} />
        </div>
      ) : adminMode === 'clinicSettings' ? (
        <div className="flex flex-col gap-6">
          <ClinicSettingsPanel db={db} appId={appId} clinicSettings={cs} onBack={() => setAdminMode('dashboard')} theme={theme} setTheme={setTheme} />
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
      ) : adminMode === 'history' ? (
        <div className="bg-[var(--bg-card)] rounded-2xl sm:rounded-3xl shadow-xl border border-[var(--bd)] overflow-hidden">
          {/* Header */}
          <div className="p-5 sm:p-6 border-b border-[var(--bd)] flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <History size={20} className="text-amber-500" />
              <h2 className="text-base sm:text-lg font-bold font-semibold text-amber-500">ประวัติผู้ป่วย (Archive)</h2>
              <span className="text-xs text-[var(--tx-muted)] font-bold">{archivedSessions.length} รายการ</span>
              <button onClick={() => { setShowImport(!showImport); setImportError(''); setImportSuccess(''); }}
                className={`ml-auto text-xs font-bold px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${showImport ? 'bg-teal-600 text-white border-teal-500' : 'bg-teal-950/30 text-teal-400 border-teal-800/50 hover:bg-teal-900/40'}`}>
                <UserPlus size={13}/> นำเข้าจาก ProClinic
              </button>
            </div>

            {/* Import from ProClinic section */}
            {showImport && (
              <div className="bg-teal-950/20 border border-teal-800/40 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <input value={importSearch} onChange={e => setImportSearch(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleImportSearch(); }}
                    placeholder="ค้นหา HN, เบอร์โทร, เลขบัตร ปชช, หรือชื่อ..."
                    className="flex-1 bg-[var(--bg-hover)] border border-[var(--bd)] rounded-lg px-3 py-2 text-sm text-[var(--tx-heading)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-teal-600 transition-colors" />
                  <button onClick={handleImportSearch} disabled={importLoading || !importSearch.trim()}
                    className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-40 flex items-center gap-1.5">
                    {importLoading ? <Loader2 size={14} className="animate-spin"/> : <Search size={14}/>} ค้นหา
                  </button>
                </div>

                {importError && <p className="text-xs text-red-400 bg-red-950/30 border border-red-800/40 rounded-lg px-3 py-2">{importError}</p>}
                {importSuccess && <p className="text-xs text-green-400 bg-green-950/30 border border-green-800/40 rounded-lg px-3 py-2">{importSuccess}</p>}

                {/* Search results */}
                {importResults && !importPreview && (
                  <div className="space-y-1">
                    {importResults.length === 0 ? (
                      <p className="text-xs text-[var(--tx-muted)] text-center py-3">ไม่พบผลลัพธ์ใน ProClinic</p>
                    ) : importResults.map(c => (
                      <div key={c.id} className="flex items-center justify-between bg-[var(--bg-hover)] rounded-lg px-3 py-2">
                        <div>
                          <span className="text-sm font-bold text-[var(--tx-heading)]">{c.name || `ID: ${c.id}`}</span>
                          {c.phone && <span className="ml-2 text-xs text-[var(--tx-muted)]">{c.phone}</span>}
                        </div>
                        <button onClick={() => handleImportSelect(c.id)} disabled={importPreviewLoading}
                          className="text-xs font-bold px-3 py-1 bg-teal-600 hover:bg-teal-500 text-white rounded-lg transition-colors disabled:opacity-40">
                          {importPreviewLoading ? <Loader2 size={12} className="animate-spin"/> : 'เลือก'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Preview */}
                {importPreviewLoading && (
                  <div className="flex justify-center py-6"><Loader2 size={24} className="animate-spin text-teal-400"/></div>
                )}
                {importPreview && (
                  <div className="bg-[var(--bg-card)] border border-teal-800/40 rounded-xl p-4 space-y-3">
                    <h4 className="text-sm font-bold text-teal-400 font-bold">ตรวจสอบข้อมูลก่อนนำเข้า</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-[var(--tx-muted)]">ชื่อ:</span> <span className="text-[var(--tx-heading)] font-bold">{importPreview.patient.prefix} {importPreview.patient.firstName} {importPreview.patient.lastName}</span></div>
                      <div><span className="text-[var(--tx-muted)]">HN:</span> <span className="text-[var(--tx-heading)] font-bold">{importPreview.proClinicHN || '-'}</span></div>
                      <div><span className="text-[var(--tx-muted)]">เบอร์:</span> <span className="text-[var(--tx-heading)] font-bold">{importPreview.patient.phone || '-'}</span></div>
                      <div><span className="text-[var(--tx-muted)]">เลขบัตร:</span> <span className="text-[var(--tx-heading)] font-bold">{importPreview.patient.idCard || '-'}</span></div>
                      <div><span className="text-[var(--tx-muted)]">อายุ:</span> <span className="text-[var(--tx-heading)]">{importPreview.patient.age || '-'} ปี</span></div>
                      <div><span className="text-[var(--tx-muted)]">เพศ:</span> <span className="text-[var(--tx-heading)]">{importPreview.patient.gender || '-'}</span></div>
                      <div><span className="text-[var(--tx-muted)]">จังหวัด:</span> <span className="text-[var(--tx-heading)]">{importPreview.patient.province || '-'}</span></div>
                      <div><span className="text-[var(--tx-muted)]">แพ้ยา:</span> <span className="text-[var(--tx-heading)]">{importPreview.patient.hasAllergies === 'มี' ? importPreview.patient.allergiesDetail : 'ไม่มี'}</span></div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-[var(--tx-muted)]">
                      <span><Package size={12} className="inline mr-1 text-teal-400"/>{importPreview.courses.length} คอร์ส</span>
                      <span><PackageX size={12} className="inline mr-1 text-gray-500"/>{importPreview.expiredCourses.length} หมดอายุ</span>
                      <span><CalendarClock size={12} className="inline mr-1 text-blue-400"/>{importPreview.appointments.length} นัดหมาย</span>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <button onClick={handleImportConfirm}
                        className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white text-sm font-bold rounded-lg transition-colors flex items-center gap-1.5">
                        <UserPlus size={14}/> ยืนยันนำเข้า
                      </button>
                      <button onClick={() => { setImportPreview(null); setImportResults(null); }}
                        className="px-4 py-2 bg-[var(--bg-hover)] text-[var(--tx-muted)] text-sm rounded-lg border border-[var(--bd)] hover:text-[var(--tx-heading)] transition-colors">
                        ยกเลิก
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Search box */}
            <div className="relative">
              <input
                type="text"
                value={historySearch}
                onChange={e => { setHistorySearch(e.target.value); setHistoryPage(1); }}
                placeholder="ค้นหา HN, ชื่อ, นามสกุล, เบอร์โทร..."
                className="w-full bg-[var(--bg-hover)] border border-[var(--bd)] rounded-xl px-4 py-2.5 pr-9 text-sm text-[var(--tx-heading)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-amber-700/60 transition-colors"
              />
              {historySearch ? (
                <button onClick={() => { setHistorySearch(''); setHistoryPage(1); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--tx-muted)] hover:text-amber-400">
                  <X size={14}/>
                </button>
              ) : (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--tx-muted)] pointer-events-none">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                </span>
              )}
            </div>
            {/* Search result count */}
            {historyQ && (
              <p className="text-xs text-[var(--tx-muted)]">
                พบ <span className="text-amber-400 font-bold">{historyFiltered.length}</span> รายการ
              </p>
            )}
          </div>

          {/* Card list */}
          <div className="divide-y divide-[var(--bd)]">
            {historyFiltered.length === 0 ? (
              <div className="p-16 text-center text-gray-600 flex flex-col items-center gap-4">
                <History size={36} className="opacity-20 text-amber-600" />
                <p className="text-xs font-bold font-bold">{historyQ ? 'ไม่พบรายการที่ตรงกัน' : 'ไม่มีประวัติในระบบ'}</p>
              </div>
            ) : historyPageItems.map(session => {
              const d = session.patientData;
              const formType = session.formType || 'intake';
              const isFollowUp = formType.startsWith('followup_');
              const isCustom = formType === 'custom';
              const reasons = getReasons(d);
              const isPerf = reasons.includes('สมรรถภาพทางเพศ') || formType === 'followup_ed';
              const isHrt = reasons.includes('เสริมฮอร์โมน') || formType === 'followup_adam' || formType === 'followup_mrs';
              const tsSubmitted = formatBangkokTime(session.submittedAt);
              const tsUpdated = formatBangkokTime(session.updatedAt);
              const tsArchived = formatBangkokTime(session.archivedAt);
              return (
                <div key={session.id} className="p-4 flex flex-col gap-3 hover:bg-amber-950/5 transition-colors">

                  {/* Row 1: name + actions */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-1.5 min-w-0">
                      <span className="font-bold text-[var(--tx-heading)] text-sm truncate max-w-[200px] sm:max-w-none">{session.sessionName || 'ไม่ระบุชื่อ'}</span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-xs text-amber-600 bg-amber-950/20 px-2 py-0.5 rounded border border-amber-900/30">{session.id}</span>
                        {getBadgeForFormType(formType, session.customTemplate)}
                      </div>
                    </div>
                    {/* Action buttons */}
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      {d && (
                        <button onClick={() => { prevAdminModeRef.current = adminMode; setViewingSession(session); setAdminMode('dashboard'); }}
                          className="p-2 bg-blue-950/30 hover:bg-blue-900/50 text-blue-400 hover:text-blue-300 rounded-lg border border-blue-900/50 transition-colors" title="ดูประวัติ">
                          <FileText size={15}/>
                        </button>
                      )}
                      {d && (() => {
                        const isPending = brokerPending[session.id] || session.brokerStatus === 'pending';
                        const isDone    = !isPending && !!session.opdRecordedAt && session.brokerStatus === 'done';
                        const isFailed  = !isPending && !isDone && session.brokerStatus === 'failed';
                        return (
                          <button
                            onClick={() => handleOpdClick(session)}
                            disabled={isPending || isDone}
                            title={isDone ? 'บันทึกลง ProClinic แล้ว — ลบจากหน้าประวัติเพื่อบันทึกใหม่' : isPending ? 'กำลังส่งข้อมูลไป ProClinic...' : isFailed ? `ล้มเหลว: ${session.brokerError || ''}` : 'ส่งข้อมูลบันทึกลง ProClinic'}
                            className={`p-2 rounded-lg border transition-all ${
                              isDone    ? 'bg-[var(--opd-btn-bg)] text-[var(--opd-color)] border-[var(--opd-bd-str)] cursor-not-allowed opacity-80' :
                              isPending ? 'bg-amber-950/20 text-amber-400 border-amber-700/50 animate-pulse' :
                              isFailed  ? 'bg-red-950/20 text-red-400 border-red-700/50' :
                              'bg-[var(--bg-card)] text-[var(--tx-muted)] border-dashed border-[var(--bd)] hover:border-[var(--opd-bd-str)] hover:text-[var(--opd-color)]'
                            }`}
                          ><ClipboardCheck size={15}/></button>
                        );
                      })()}
                      <button onClick={() => setSessionToRestore(session)}
                        className="p-2 bg-orange-950/30 hover:bg-orange-900/50 text-orange-400 hover:text-orange-300 rounded-lg border border-orange-900/50 transition-colors" title="กลับเข้าคิวใหม่">
                        <RotateCcw size={15}/>
                      </button>
                      {session.brokerProClinicId && (
                        <button onClick={() => handleOpenPatientView(session)}
                          className="p-2 bg-teal-950/30 hover:bg-teal-900/50 text-teal-400 hover:text-teal-300 rounded-lg border border-teal-900/50 transition-colors" title="ดูหน้าข้อมูลผู้ป่วย (admin)">
                          <Search size={15}/>
                        </button>
                      )}
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
                      <button onClick={() => setSessionToHardDelete(session.id)}
                        className="p-2 bg-red-950/30 hover:bg-red-900/50 text-red-500 rounded-lg border border-red-900/50 transition-colors" title="ลบถาวร">
                        <Trash2 size={15}/>
                      </button>
                    </div>
                  </div>

                  {/* Row 2: timestamps */}
                  <div className="flex flex-wrap items-center gap-3">
                    {tsArchived && (
                      <span className="text-xs text-amber-600 flex items-center gap-1 font-mono">
                        <Archive size={9}/> เก็บ: {tsArchived}
                      </span>
                    )}
                    {tsSubmitted && (
                      <span className="text-xs text-green-600 flex items-center gap-1 font-mono">
                        <CheckCircle2 size={9}/> กรอก: {tsSubmitted}
                      </span>
                    )}
                    {tsUpdated && (
                      <span className="text-xs text-blue-500 flex items-center gap-1 font-mono">
                        <Edit3 size={9}/> แก้ไข: {tsUpdated}
                      </span>
                    )}
                  </div>

                  {/* Row 3: patient info */}
                  {d ? (
                    <div className="flex flex-col gap-2 bg-[var(--bg-card)] rounded-xl p-3 border border-[var(--bd)]">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-bold text-[var(--tx-heading)] text-sm">
                          {d.prefix && d.prefix !== 'ไม่ระบุ' ? d.prefix : ''} {d.firstName} {d.lastName}
                        </span>
                        {isPerf && <Flame size={14} className="text-red-500" />}
                        {isHrt && <Activity size={14} className="text-orange-500" />}
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-gray-500 font-mono font-semibold">
                        <span>อายุ: {d.age || '-'} ปี</span>
                        {d.phone && <span>โทร: {formatPhoneNumberDisplay(d.phone, d.isInternationalPhone, d.phoneCountryCode)}</span>}
                        {d.idCard && <span className="flex items-center gap-1"><CreditCard size={10}/> {d.idCard.length === 13 ? d.idCard.replace(/(\d)(\d{4})(\d{5})(\d{2})(\d)/, '$1-$2-$3-$4-$5') : d.idCard}</span>}
                      </div>
                      {reasons.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {reasons.map(r => (
                            <span key={r} className="text-xs font-bold text-gray-300 bg-[var(--bg-hover)] px-2 py-0.5 rounded-lg border border-[var(--bd)] whitespace-nowrap">
                              {r === 'อื่นๆ' ? `อื่นๆ: ${d.visitReasonOther}` : r}
                            </span>
                          ))}
                        </div>
                      )}
                      {d.hasAllergies === 'มี' && (
                        <span className="text-xs text-red-400 flex items-center gap-1.5 font-bold font-semibold border border-red-900/50 bg-red-950/20 px-2 py-1 rounded-lg w-fit">
                          <AlertCircle size={10}/> แพ้: {d.allergiesDetail}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-gray-600 text-xs italic">ไม่มีข้อมูล</span>
                  )}

                  {/* Row 4: OPD badge */}
                  {session.opdRecordedAt && session.brokerStatus === 'done' && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--opd-bg)] border border-[var(--opd-bd)] w-full">
                      <ClipboardCheck size={13} className="text-[var(--opd-color)] shrink-0" />
                      <div className="flex flex-col min-w-0 gap-0.5">
                        <span className="text-xs font-black font-semibold text-[var(--opd-color)]">บันทึกลง OPD Card เรียบร้อย</span>
                        <span className="text-[11px] text-[var(--opd-color)] font-mono flex items-center gap-1.5">
                          {formatBangkokTime(session.opdRecordedAt)}
                          {session.brokerProClinicHN && <span className="px-1 py-px rounded bg-[var(--opd-btn-bg)] border border-[var(--opd-bd)] font-black">HN {session.brokerProClinicHN}</span>}
                        </span>
                        {session.brokerLastAutoSyncAt && (
                          <span className="text-[8px] text-[var(--opd-color)] opacity-70 font-mono flex items-center gap-1">
                            🔄 แก้ไขและ sync ProClinic อัตโนมัติ · {formatBangkokTime(session.brokerLastAutoSyncAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {historyTotalPages > 1 && (
            <div className="p-4 border-t border-[var(--bd)] flex items-center justify-between gap-3">
              <button
                onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                disabled={historyCurrentPage <= 1}
                className="px-4 py-2 rounded-xl text-xs font-bold border border-[var(--bd)] text-[var(--tx-muted)] hover:text-amber-400 hover:border-amber-900/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >← ก่อนหน้า</button>

              <div className="flex items-center gap-1.5 flex-wrap justify-center">
                {Array.from({ length: historyTotalPages }, (_, i) => i + 1).map(n => (
                  <button
                    key={n}
                    onClick={() => setHistoryPage(n)}
                    className={`w-8 h-8 rounded-lg text-xs font-bold border transition-colors ${
                      n === historyCurrentPage
                        ? 'bg-amber-700 text-white border-amber-600'
                        : 'border-[var(--bd)] text-[var(--tx-muted)] hover:text-amber-400 hover:border-amber-900/50'
                    }`}
                  >{n}</button>
                ))}
              </div>

              <button
                onClick={() => setHistoryPage(p => Math.min(historyTotalPages, p + 1))}
                disabled={historyCurrentPage >= historyTotalPages}
                className="px-4 py-2 rounded-xl text-xs font-bold border border-[var(--bd)] text-[var(--tx-muted)] hover:text-amber-400 hover:border-amber-900/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >ถัดไป →</button>
            </div>
          )}
        </div>
      ) : adminMode === 'deposit' ? (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 xl:gap-8">
          {/* ── QR Panel (reuse same pattern as queue) ── */}
          <div className="xl:col-span-1" id="qr-panel-deposit">
            <div className="bg-[var(--bg-surface)] p-4 sm:p-6 lg:p-8 rounded-2xl sm:rounded-3xl border border-[var(--bd)] text-center sticky top-8 shadow-[var(--shadow-panel)] flex flex-col items-center">
              <h2 className="text-sm sm:text-base font-bold font-semibold mb-4 sm:mb-6 flex items-center justify-center gap-2 text-gray-400 w-full">
                <QrCode size={18} className="text-emerald-500" /> QR Code จอง
              </h2>
              {selectedQR && selectedQR.startsWith('DEP-') ? (() => {
                const depSession = depositSessions.find(s => s.id === selectedQR);
                const plToken = depSession?.patientLinkToken;
                const qrSrc = plToken ? getPatientLinkQRUrl(plToken) : getQRUrl(selectedQR);
                const linkUrl = plToken ? getPatientLinkUrl(plToken) : getSessionUrl(selectedQR);
                return (
                  <div className="space-y-4 sm:space-y-6 flex flex-col items-center animate-in zoom-in duration-300 w-full px-2 sm:px-0">
                    {/* QR image — white card with glow */}
                    <div className="p-3 sm:p-4 bg-white rounded-3xl w-full aspect-square max-w-[360px] mx-auto flex items-center justify-center overflow-hidden shadow-xl">
                      <img src={qrSrc} alt="QR" className="w-full h-full object-contain"/>
                    </div>
                    {/* Session name */}
                    <div className="w-full text-center">
                      <h3 className="text-xl sm:text-2xl font-black text-[var(--tx-heading)] mb-1">{depSession?.sessionName || 'ไม่มีชื่อคิว'}</h3>
                    </div>
                    {/* Token */}
                    <div className="w-full text-left">
                      <p className="text-xs sm:text-xs text-[var(--tx-muted)] font-semibold mb-1.5">รหัสคิว (Token)</p>
                      <p className="font-mono text-sm sm:text-base font-black bg-[var(--bg-input)] px-4 py-3 rounded-xl border border-[var(--bd)] shadow-inner text-center break-all text-emerald-400">{selectedQR}</p>
                    </div>
                    {/* Link */}
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
                    {/* Simulate button */}
                    <button onClick={() => onSimulateScan(selectedQR)} className="w-full bg-[var(--bg-hover)] hover:bg-[var(--bg-hover2)] border border-[var(--bd)] text-[var(--tx-heading)] py-3.5 sm:py-4 rounded-xl text-xs sm:text-sm font-bold font-semibold transition-all flex items-center justify-center gap-2">
                      <Eye size={16}/> จำลองเปิดกรอกฟอร์ม
                    </button>
                  </div>
                );
              })() : (
                <div className="text-gray-600 text-sm py-12">
                  <QrCode size={64} className="mx-auto mb-4 opacity-15"/>
                  <p className="text-xs text-gray-500">กดปุ่ม QR บนการ์ดจอง<br/>เพื่อแสดง QR Code</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Deposit sessions list ── */}
          <div className="xl:col-span-3">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-black text-emerald-400 flex items-center gap-2 mb-1"><Banknote size={22}/> ลูกค้าจองมัดจำ</h2>
                <p className="text-xs text-gray-500">{depositSessions.length} รายการ</p>
              </div>
              <button onClick={() => setAdminMode('depositHistory')} className="text-xs px-3 py-2 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-emerald-400 hover:border-emerald-900/50 font-bold flex items-center gap-1.5 transition-all">
                <History size={13}/> ประวัติจอง
              </button>
            </div>

          {depositSessions.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <Banknote size={48} className="mx-auto mb-4 opacity-30" />
              <p className="text-sm font-bold">ยังไม่มีลูกค้าจองมัดจำ</p>
              <p className="text-xs mt-2 text-gray-600">กดปุ่ม "สร้างคิวใหม่" แล้วเลือก "แบบบันทึก OPD ลูกค้าจอง"</p>
            </div>
          ) : (
            <div className="space-y-3">
              {depositSessions.map(session => {
                const d = session.patientData;
                const dep = session.depositData;
                const isCompleted = session.status === 'completed' && d;
                const hasOPD = !!session.brokerProClinicId && session.brokerStatus === 'done';
                const hasDeposit = session.depositSyncStatus === 'done';
                const dataUpdated = hasOPD && hasDeposit && session.isUnread;
                const needsSync = isCompleted && (!hasOPD || !hasDeposit || dataUpdated);
                const isSyncing = session.brokerStatus === 'pending' || session.depositSyncStatus === 'pending';
                return (
                  <div key={session.id} className={`bg-[var(--bg-surface)] rounded-xl border transition-all ${session.isUnread ? 'border-red-600/60 bg-red-950/10' : 'border-[var(--bd)]'}`}>
                    <div className="p-4">
                      {/* Row 1: Name + actions */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          {editingNameId === session.id ? (
                            <input autoFocus value={editingNameValue}
                              onChange={e => setEditingNameValue(e.target.value)}
                              onBlur={() => saveEditedName(session.id)}
                              onKeyDown={e => e.key === 'Enter' && saveEditedName(session.id)}
                              className="bg-[var(--bg-input)] border border-emerald-500 text-[var(--tx-heading)] text-sm px-2 py-0.5 rounded w-32 outline-none" />
                          ) : (
                            <>
                              {session.isUnread && <span className="text-[11px] px-1.5 py-0.5 rounded bg-red-600 text-white font-black font-semibold animate-pulse shrink-0">New</span>}
                              <span className="font-black text-[var(--tx-heading)] text-sm truncate">{session.sessionName || 'ไม่ระบุชื่อ'}</span>
                              <button onClick={() => handleEditName(session.id, session.sessionName)} className="text-gray-600 hover:text-emerald-400 shrink-0"><Edit3 size={12}/></button>
                            </>
                          )}
                          <span className="bg-emerald-950/50 text-emerald-400 border border-emerald-900/50 px-1.5 py-0.5 rounded text-[11px] font-bold whitespace-nowrap flex items-center gap-1"><Banknote size={10}/> จองมัดจำ</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          <button onClick={() => { setSelectedQR(session.id); setTimeout(() => document.getElementById('qr-panel-deposit')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }} className={`p-1.5 rounded border transition-colors ${selectedQR === session.id ? 'bg-[var(--bg-input)] border-gray-400 text-white' : 'bg-[var(--bg-hover)] border-[var(--bd)] text-gray-400 hover:text-emerald-400'}`} title="QR Code">
                            <QrCode size={14}/>
                          </button>
                          <button onClick={() => handleViewSession(session)} className="p-1.5 rounded bg-[var(--bg-hover)] border border-[var(--bd)] text-gray-400 hover:text-emerald-400 transition-colors" title={isCompleted ? 'ดูข้อมูลมัดจำ' : 'แก้ไขข้อมูลมัดจำ'}>
                            {isCompleted ? <Eye size={14}/> : <Edit3 size={14}/>}
                          </button>
                          {isCompleted && (
                            <button
                              onClick={() => handleDepositSync(session)}
                              disabled={isSyncing || (hasOPD && hasDeposit && !dataUpdated)}
                              className={`p-1.5 rounded border text-xs font-bold flex items-center gap-1 transition-colors ${
                                dataUpdated ? 'bg-amber-700 hover:bg-amber-600 border-amber-500 text-white animate-pulse'
                                : hasOPD && hasDeposit ? 'bg-emerald-950/30 border-emerald-900/50 text-emerald-500 cursor-default'
                                : needsSync ? 'bg-emerald-700 hover:bg-emerald-600 border-emerald-600 text-white'
                                : 'bg-[var(--bg-hover)] border-[var(--bd)] text-gray-400'
                              } disabled:opacity-50`}
                              title={dataUpdated ? 'ข้อมูลอัพเดท — กดเพื่อ sync ใหม่' : hasOPD && hasDeposit ? 'บันทึกเรียบร้อยแล้ว' : 'บันทึกลงการจอง'}
                            >
                              {isSyncing ? <Loader2 size={14} className="animate-spin"/> : <ClipboardCheck size={14}/>}
                            </button>
                          )}
                          {hasOPD && (
                            <button
                              onClick={() => setDepositToDelete({ session, action: 'cancel' })}
                              disabled={isSyncing}
                              className="p-1.5 rounded border bg-[var(--bg-hover)] border-[var(--bd)] text-gray-400 hover:text-red-400 hover:border-red-900/50 transition-colors disabled:opacity-50"
                              title="ยกเลิกการจอง (ลบมัดจำ+ลูกค้าใน ProClinic)"
                            >
                              {isSyncing && session.depositSyncStatus === 'pending' ? <Loader2 size={14} className="animate-spin"/> : <XCircle size={14}/>}
                            </button>
                          )}
                          {hasOPD && hasDeposit ? (
                          <button onClick={() => setDepositToDelete({ session, action: 'complete' })}
                            className="p-1.5 rounded bg-[var(--bg-hover)] border border-[var(--bd)] text-gray-500 hover:text-blue-400 transition-colors" title="ลูกค้ามาถึงคลินิกแล้ว">
                            <UserCheck size={14}/>
                          </button>
                          ) : (
                          <button onClick={() => setDepositToDelete({ session, action: 'archive' })}
                            className="p-1.5 rounded bg-[var(--bg-hover)] border border-[var(--bd)] text-gray-500 hover:text-red-400 transition-colors" title="ลบ (ย้ายไปประวัติจอง)">
                            <Trash2 size={14}/>
                          </button>
                          )}
                        </div>
                      </div>

                      {/* Row 2: Patient info */}
                      {isCompleted ? (
                        <div className="text-xs text-gray-400 space-y-1 mt-2">
                          <div className="flex flex-wrap gap-4">
                            <span className="text-white font-bold">{d.prefix !== 'ไม่ระบุ' ? d.prefix + ' ' : ''}{d.firstName} {d.lastName}</span>
                            {d.age && <span className="text-gray-500">{d.age} ปี</span>}
                            {d.phone && <span className="text-gray-500 font-mono">{d.phone}</span>}
                            {d.idCard && <span className="text-gray-500 font-mono text-xs"><CreditCard size={10} className="inline mr-1"/>{d.idCard.length === 13 ? d.idCard.replace(/(\d)(\d{4})(\d{5})(\d{2})(\d)/, '$1-$2-$3-$4-$5') : d.idCard}</span>}
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-600 italic mt-1">รอลูกค้ากรอกข้อมูล...</p>
                      )}

                      {/* Row 3: Deposit info */}
                      {dep && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {dep.paymentAmount && <span className="text-xs bg-emerald-950/30 text-emerald-400 border border-emerald-900/40 px-2 py-0.5 rounded font-bold">฿{Number(dep.paymentAmount).toLocaleString()}</span>}
                          {dep.paymentChannel && <span className="text-xs bg-[var(--bg-hover)] text-gray-400 border border-[var(--bd)] px-2 py-0.5 rounded">{dep.paymentChannel}</span>}
                          {dep.depositDate && <span className="text-xs bg-[var(--bg-hover)] text-gray-400 border border-[var(--bd)] px-2 py-0.5 rounded">{toThaiDate(dep.depositDate)}</span>}
                          {dep.hasAppointment && <span className="text-xs bg-blue-950/30 text-blue-400 border border-blue-900/40 px-2 py-0.5 rounded flex items-center gap-1"><CalendarClock size={9}/> นัดหมาย {toThaiDate(dep.appointmentDate)}{dep.appointmentStartTime ? ` ${dep.appointmentStartTime}${dep.appointmentEndTime ? `-${dep.appointmentEndTime}` : ''}` : ''}</span>}
                        </div>
                      )}

                      {/* Row 4: Status badges */}
                      <div className="flex flex-wrap gap-2 mt-3">
                        {isCompleted ? (
                          <span className="text-xs bg-green-950/30 text-green-400 border border-green-900/40 px-2 py-0.5 rounded flex items-center gap-1"><CheckCircle2 size={10}/> กรอกแล้ว</span>
                        ) : (
                          <span className="text-xs bg-gray-900 text-gray-500 border border-gray-800 px-2 py-0.5 rounded flex items-center gap-1"><Clock size={10}/> รอกรอก</span>
                        )}
                        {hasOPD && (
                          <span className="text-xs bg-green-950/30 text-green-400 border border-green-900/40 px-2 py-0.5 rounded flex items-center gap-1">
                            <CheckCircle2 size={10}/> OPD {session.brokerProClinicHN ? `HN: ${session.brokerProClinicHN}` : ''}
                          </span>
                        )}
                        {hasDeposit && (
                          <span className="text-xs bg-emerald-950/30 text-emerald-400 border border-emerald-900/40 px-2 py-0.5 rounded flex items-center gap-1">
                            <Banknote size={10}/> มัดจำเรียบร้อย
                          </span>
                        )}
                        {session.brokerStatus === 'failed' && (
                          <span className="text-xs bg-red-950/30 text-red-400 border border-red-900/40 px-2 py-0.5 rounded flex items-center gap-1"><AlertCircle size={10}/> OPD ผิดพลาด</span>
                        )}
                        {session.depositSyncStatus === 'failed' && (
                          <span className="text-xs bg-red-950/30 text-red-400 border border-red-900/40 px-2 py-0.5 rounded flex items-center gap-1"><AlertCircle size={10}/> มัดจำผิดพลาด</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          </div>
        </div>
      ) : adminMode === 'depositHistory' ? (
        <div className="bg-[var(--bg-card)] p-4 sm:p-6 lg:p-8 rounded-2xl sm:rounded-3xl border border-[var(--bd)] shadow-[var(--shadow-panel)]">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-black text-emerald-400 flex items-center gap-2 mb-1"><History size={22}/> ประวัติลูกค้าจองมัดจำ</h2>
              <p className="text-xs text-gray-500">{archivedDepositSessions.length} รายการ</p>
            </div>
            <button onClick={() => setAdminMode('deposit')} className="text-xs px-3 py-2 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-emerald-400 hover:border-emerald-900/50 font-bold flex items-center gap-1.5 transition-all">
              <Banknote size={13}/> กลับหน้าจอง
            </button>
          </div>

          {archivedDepositSessions.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <Archive size={48} className="mx-auto mb-4 opacity-30" />
              <p className="text-sm font-bold">ยังไม่มีประวัติ</p>
            </div>
          ) : (
            <div className="space-y-3">
              {archivedDepositSessions.map(session => {
                const d = session.patientData;
                const dep = session.depositData;
                const hasOPD = session.opdRecordedAt && session.brokerStatus === 'done';
                const hasDeposit = session.depositSyncStatus === 'done';
                return (
                  <div key={session.id} className="bg-[var(--bg-surface)] rounded-xl border border-[var(--bd)] p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <span className="font-bold text-gray-400 text-sm truncate">{session.sessionName || 'ไม่ระบุชื่อ'}</span>
                        <span className="bg-emerald-950/50 text-emerald-400 border border-emerald-900/50 px-1.5 py-0.5 rounded text-[11px] font-bold flex items-center gap-1 shrink-0"><Banknote size={10}/> จองมัดจำ</span>
                        {session.serviceCompleted && (
                          <span className="bg-blue-950/50 text-blue-400 border border-blue-900/50 px-1.5 py-0.5 rounded text-[11px] font-bold flex items-center gap-1 shrink-0"><UserCheck size={10}/> มารับบริการแล้ว</span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        {!session.serviceCompleted && (
                          <button onClick={() => {
                            updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', session.id), { isArchived: false, archivedAt: null });
                          }} className="p-1.5 rounded bg-[var(--bg-hover)] border border-[var(--bd)] text-gray-500 hover:text-emerald-400 transition-colors" title="กู้คืน">
                            <RotateCcw size={14}/>
                          </button>
                        )}
                        <button onClick={() => setSessionToHardDelete(session.id)} className="p-1.5 rounded bg-[var(--bg-hover)] border border-[var(--bd)] text-gray-500 hover:text-red-500 transition-colors" title="ลบถาวร">
                          <Trash2 size={14}/>
                        </button>
                      </div>
                    </div>
                    {d && (
                      <p className="text-xs text-gray-500">{d.prefix !== 'ไม่ระบุ' ? d.prefix + ' ' : ''}{d.firstName} {d.lastName} {d.phone ? `· ${d.phone}` : ''}</p>
                    )}
                    {dep && dep.paymentAmount && (
                      <span className="text-xs bg-emerald-950/30 text-emerald-400 border border-emerald-900/40 px-2 py-0.5 rounded font-bold mt-1 inline-block">฿{Number(dep.paymentAmount).toLocaleString()}</span>
                    )}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {hasOPD && <span className="text-xs bg-green-950/30 text-green-400 border border-green-900/40 px-2 py-0.5 rounded flex items-center gap-1"><CheckCircle2 size={10}/> OPD</span>}
                      {hasDeposit && <span className="text-xs bg-emerald-950/30 text-emerald-400 border border-emerald-900/40 px-2 py-0.5 rounded flex items-center gap-1"><Banknote size={10}/> มัดจำ</span>}
                      {session.depositSyncStatus === 'cancelled' && <span className="text-xs bg-red-950/30 text-red-400 border border-red-900/40 px-2 py-0.5 rounded flex items-center gap-1"><XCircle size={10}/> ยกเลิกแล้ว</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : adminMode === 'noDeposit' ? (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 xl:gap-8">
          {/* ── QR Panel (reuse same pattern as deposit) ── */}
          <div className="xl:col-span-1" id="qr-panel-nodeposit">
            <div className="bg-[var(--bg-surface)] p-4 sm:p-6 lg:p-8 rounded-2xl sm:rounded-3xl border border-[var(--bd)] text-center sticky top-8 shadow-[var(--shadow-panel)] flex flex-col items-center">
              <h2 className="text-sm sm:text-base font-bold font-semibold mb-4 sm:mb-6 flex items-center justify-center gap-2 text-gray-400 w-full">
                <QrCode size={18} className="text-orange-500" /> QR Code จอง
              </h2>
              {selectedQR && noDepositSessions.find(s => s.id === selectedQR) ? (() => {
                const ndSession = noDepositSessions.find(s => s.id === selectedQR);
                const plToken = ndSession?.patientLinkToken;
                const qrSrc = plToken ? getPatientLinkQRUrl(plToken) : getQRUrl(selectedQR);
                const linkUrl = plToken ? getPatientLinkUrl(plToken) : getSessionUrl(selectedQR);
                return (
                  <div className="space-y-4 sm:space-y-6 flex flex-col items-center animate-in zoom-in duration-300 w-full px-2 sm:px-0">
                    <div className="p-3 sm:p-4 bg-white rounded-3xl w-full aspect-square max-w-[360px] mx-auto flex items-center justify-center overflow-hidden shadow-xl">
                      <img src={qrSrc} alt="QR" className="w-full h-full object-contain"/>
                    </div>
                    <div className="w-full text-center">
                      <h3 className="text-xl sm:text-2xl font-black text-[var(--tx-heading)] mb-1">{ndSession?.sessionName || 'ไม่มีชื่อคิว'}</h3>
                    </div>
                    <div className="w-full text-left">
                      <p className="text-xs sm:text-xs text-[var(--tx-muted)] font-semibold mb-1.5">รหัสคิว (Token)</p>
                      <p className="font-mono text-sm sm:text-base font-black bg-[var(--bg-input)] px-4 py-3 rounded-xl border border-[var(--bd)] shadow-inner text-center break-all text-orange-400">{selectedQR}</p>
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
              })() : (
                <div className="text-gray-600 text-sm py-12">
                  <QrCode size={64} className="mx-auto mb-4 opacity-15"/>
                  <p className="text-xs text-gray-500">กดปุ่ม QR บนการ์ดจอง<br/>เพื่อแสดง QR Code</p>
                </div>
              )}
            </div>
          </div>

          {/* ── No-deposit sessions list ── */}
          <div className="xl:col-span-3">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-black text-orange-400 flex items-center gap-2 mb-1"><UserPlus size={22}/> ลูกค้าจองไม่มัดจำ</h2>
                <p className="text-xs text-gray-500">{noDepositSessions.length} รายการ</p>
              </div>
              <button onClick={() => setAdminMode('noDepositHistory')} className="text-xs px-3 py-2 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-orange-400 hover:border-orange-900/50 font-bold flex items-center gap-1.5 transition-all">
                <History size={13}/> ประวัติจอง
              </button>
            </div>

          {noDepositSessions.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <UserPlus size={48} className="mx-auto mb-4 opacity-30" />
              <p className="text-sm font-bold">ยังไม่มีลูกค้าจองไม่มัดจำ</p>
              <p className="text-xs mt-2 text-gray-600">กดปุ่ม "สร้างคิวใหม่" แล้วเลือก "จองไม่มัดจำ"</p>
            </div>
          ) : (
            <div className="space-y-3">
              {noDepositSessions.map(session => {
                const d = session.patientData;
                const isCompleted = session.status === 'completed' && d;
                return (
                  <div key={session.id} className={`bg-[var(--bg-surface)] rounded-xl border transition-all ${session.isUnread ? (isDark ? 'border-red-600/60 bg-red-950/10' : 'border-pink-400 bg-pink-50/50') : 'border-[var(--bd)]'}`}>
                    <div className="p-4">
                      {/* Row 1: Name + actions */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          {editingNameId === session.id ? (
                            <input autoFocus value={editingNameValue}
                              onChange={e => setEditingNameValue(e.target.value)}
                              onBlur={() => saveEditedName(session.id)}
                              onKeyDown={e => e.key === 'Enter' && saveEditedName(session.id)}
                              className="bg-[var(--bg-input)] border border-orange-500 text-[var(--tx-heading)] text-sm px-2 py-0.5 rounded w-32 outline-none" />
                          ) : (
                            <>
                              {session.isUnread && <span className="text-[11px] px-1.5 py-0.5 rounded bg-red-600 text-white font-black font-semibold animate-pulse shrink-0">New</span>}
                              <span className="font-black text-[var(--tx-heading)] text-sm truncate">{session.sessionName || 'ไม่ระบุชื่อ'}</span>
                              <button onClick={() => handleEditName(session.id, session.sessionName)} className="text-gray-600 hover:text-orange-400 shrink-0"><Edit3 size={12}/></button>
                            </>
                          )}
                          <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold whitespace-nowrap flex items-center gap-1 border ${isDark ? 'bg-orange-950/50 text-orange-400 border-orange-900/50' : 'bg-pink-100 text-pink-600 border-pink-300'}`}><UserPlus size={10}/> จองไม่มัดจำ</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          <button onClick={() => { setSelectedQR(session.id); setTimeout(() => document.getElementById('qr-panel-nodeposit')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }} className={`p-1.5 rounded border transition-colors ${selectedQR === session.id ? (isDark ? 'bg-[var(--bg-input)] border-gray-400 text-white' : 'bg-pink-100 border-pink-400 text-pink-600') : (isDark ? 'bg-[var(--bg-hover)] border-[var(--bd)] text-gray-400 hover:text-orange-400' : 'bg-pink-50 border-pink-200 text-pink-400 hover:text-pink-600')}`} title="QR Code">
                            <QrCode size={14}/>
                          </button>
                          <button onClick={() => handleViewSession(session)} className={`p-1.5 rounded border transition-colors ${isDark ? 'bg-[var(--bg-hover)] border-[var(--bd)] text-gray-400 hover:text-orange-400' : 'bg-pink-50 border-pink-200 text-pink-400 hover:text-pink-600'}`} title={isCompleted ? 'ดูข้อมูล' : 'แก้ไขข้อมูล'}>
                            {isCompleted ? <Eye size={14}/> : <Edit3 size={14}/>}
                          </button>
                          {isCompleted && (
                            <button onClick={() => handleNoDepositServiceStart(session)}
                              className={`p-1.5 rounded border text-xs font-bold flex items-center gap-1 transition-colors ${isDark ? 'bg-emerald-700 hover:bg-emerald-600 border-emerald-600 text-white' : 'bg-emerald-500 hover:bg-emerald-600 border-emerald-400 text-white'}`}
                              title="ลูกค้าเข้ารับบริการ — ย้ายไปหน้าคิว">
                              <UserCheck size={14}/>
                            </button>
                          )}
                          {isCompleted ? (
                            <button onClick={() => handleNoDepositCancel(session)}
                              className={`p-1.5 rounded border transition-colors ${isDark ? 'bg-[var(--bg-hover)] border-[var(--bd)] text-gray-500 hover:text-red-400' : 'bg-pink-50 border-pink-200 text-gray-400 hover:text-red-500'}`} title="ยกเลิกจอง">
                              <XCircle size={14}/>
                            </button>
                          ) : (
                            <button onClick={() => handleNoDepositCancel(session)}
                              className={`p-1.5 rounded border transition-colors ${isDark ? 'bg-[var(--bg-hover)] border-[var(--bd)] text-gray-500 hover:text-red-400' : 'bg-pink-50 border-pink-200 text-gray-400 hover:text-red-500'}`} title="ลบ">
                              <Trash2 size={14}/>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Row 2: Patient info */}
                      {isCompleted ? (
                        <div className="text-xs text-gray-400 space-y-1 mt-2">
                          <div className="flex flex-wrap gap-4">
                            <span className="text-white font-bold">{d.prefix !== 'ไม่ระบุ' ? d.prefix + ' ' : ''}{d.firstName} {d.lastName}</span>
                            {d.age && <span className="text-gray-500">{d.age} ปี</span>}
                            {d.phone && <span className="text-gray-500 font-mono">{d.phone}</span>}
                            {d.idCard && <span className="text-gray-500 font-mono text-xs"><CreditCard size={10} className="inline mr-1"/>{d.idCard.length === 13 ? d.idCard.replace(/(\d)(\d{4})(\d{5})(\d{2})(\d)/, '$1-$2-$3-$4-$5') : d.idCard}</span>}
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-600 italic mt-1">รอลูกค้ากรอกข้อมูล...</p>
                      )}

                      {/* Row 3: Appointment info */}
                      {session.appointmentData && (
                        <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-gray-400">
                          <CalendarClock size={11} className="text-orange-400"/>
                          <span className={`font-bold ${isDark ? 'text-orange-300' : 'text-pink-600'}`}>{session.appointmentData.appointmentDate ? (() => { const [y,m,d] = session.appointmentData.appointmentDate.split('-'); return `${parseInt(d)}/${parseInt(m)}/${parseInt(y)+543}`; })() : '-'}</span>
                          {session.appointmentData.appointmentStartTime && <span>{session.appointmentData.appointmentStartTime}{session.appointmentData.appointmentEndTime ? ` - ${session.appointmentData.appointmentEndTime}` : ''}</span>}
                          {session.appointmentData.doctor && depositOptions?.doctors && (() => { const doc = depositOptions.doctors.find(o => o.value === session.appointmentData.doctor); return doc ? <span className="text-gray-500">แพทย์: {doc.label}</span> : null; })()}
                          {session.appointmentProClinicId && <span className="text-green-500 font-mono">ID:{session.appointmentProClinicId}</span>}
                          {session.appointmentSyncStatus === 'failed' && <span className="text-red-400">sync ล้มเหลว</span>}
                          {session.appointmentSyncStatus === 'pending' && <span className="text-yellow-500">กำลัง sync...</span>}
                          <button onClick={() => { if (!depositOptions) fetchDepositOptions(); setEditingAppointment(session.id); const a = session.appointmentData || {}; setNoDepositFormData({ sessionName: session.sessionName || '', appointmentDate: a.appointmentDate || todayISO(), appointmentStartTime: a.appointmentStartTime || '', appointmentEndTime: a.appointmentEndTime || '', advisor: a.advisor || '', doctor: a.doctor || '', assistant: a.assistant || '', room: a.room || '', source: a.source || '', visitPurpose: a.visitPurpose || [] }); setShowNoDepositForm(true); }} className={`font-bold underline underline-offset-2 ml-1 ${isDark ? 'text-orange-400 hover:text-orange-300' : 'text-pink-500 hover:text-pink-600'}`}>แก้ไขนัด</button>
                        </div>
                      )}
                      {session.appointmentData?.visitPurpose?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {session.appointmentData.visitPurpose.map(v => <span key={v} className={`text-[11px] px-1.5 py-0.5 rounded border ${isDark ? 'bg-orange-950/30 text-orange-400 border-orange-900/40' : 'bg-pink-50 text-pink-600 border-pink-200'}`}>{v}</span>)}
                        </div>
                      )}

                      {/* Row 4: Status badges */}
                      <div className="flex flex-wrap gap-2 mt-3">
                        {isCompleted ? (
                          <span className={`text-xs px-2 py-0.5 rounded flex items-center gap-1 border ${isDark ? 'bg-green-950/30 text-green-400 border-green-900/40' : 'bg-green-50 text-green-600 border-green-200'}`}><CheckCircle2 size={10}/> กรอกแล้ว</span>
                        ) : (
                          <span className={`text-xs px-2 py-0.5 rounded flex items-center gap-1 border ${isDark ? 'bg-gray-900 text-gray-500 border-gray-800' : 'bg-gray-100 text-gray-500 border-gray-200'}`}><Clock size={10}/> รอกรอก</span>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded flex items-center gap-1 border ${isDark ? 'bg-orange-950/30 text-orange-400 border-orange-900/40' : 'bg-pink-50 text-pink-500 border-pink-200'}`}><Link size={10}/> ลิงก์ถาวร</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          </div>
        </div>
      ) : adminMode === 'noDepositHistory' ? (
        <div className="bg-[var(--bg-card)] p-4 sm:p-6 lg:p-8 rounded-2xl sm:rounded-3xl border border-[var(--bd)] shadow-[var(--shadow-panel)]">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-black text-orange-400 flex items-center gap-2 mb-1"><History size={22}/> ประวัติลูกค้าจองไม่มัดจำ</h2>
              <p className="text-xs text-gray-500">{archivedNoDepositSessions.length} รายการ</p>
            </div>
            <button onClick={() => setAdminMode('noDeposit')} className="text-xs px-3 py-2 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-orange-400 hover:border-orange-900/50 font-bold flex items-center gap-1.5 transition-all">
              <UserPlus size={13}/> กลับหน้าจอง
            </button>
          </div>

          {archivedNoDepositSessions.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <Archive size={48} className="mx-auto mb-4 opacity-30" />
              <p className="text-sm font-bold">ยังไม่มีประวัติ</p>
            </div>
          ) : (
            <div className="space-y-3">
              {archivedNoDepositSessions.map(session => {
                const d = session.patientData;
                return (
                  <div key={session.id} className="bg-[var(--bg-surface)] rounded-xl border border-[var(--bd)] p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <span className="font-bold text-gray-400 text-sm truncate">{session.sessionName || 'ไม่ระบุชื่อ'}</span>
                        <span className="bg-orange-950/50 text-orange-400 border border-orange-900/50 px-1.5 py-0.5 rounded text-[11px] font-bold flex items-center gap-1 shrink-0"><UserPlus size={10}/> จองไม่มัดจำ</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        <button onClick={() => handleViewSession(session)} className="p-1.5 rounded bg-[var(--bg-hover)] border border-[var(--bd)] text-gray-500 hover:text-orange-400 transition-colors" title="ดูข้อมูล">
                          <Eye size={14}/>
                        </button>
                        <button onClick={() => {
                          updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', session.id), { isArchived: false, archivedAt: null });
                        }} className="p-1.5 rounded bg-[var(--bg-hover)] border border-[var(--bd)] text-gray-500 hover:text-orange-400 transition-colors" title="กู้คืน">
                          <RotateCcw size={14}/>
                        </button>
                        <button onClick={() => setSessionToHardDelete(session.id)} className="p-1.5 rounded bg-[var(--bg-hover)] border border-[var(--bd)] text-gray-500 hover:text-red-500 transition-colors" title="ลบถาวร">
                          <Trash2 size={14}/>
                        </button>
                      </div>
                    </div>
                    {d && (
                      <p className="text-xs text-gray-500">{d.prefix !== 'ไม่ระบุ' ? d.prefix + ' ' : ''}{d.firstName} {d.lastName} {d.phone ? `· ${d.phone}` : ''}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : adminMode === 'appointment' ? (() => {
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
        const pList = clinicSettings.practitioners || [];
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
          const openT2 = isWknd2 ? (clinicSettings.clinicOpenTimeWeekend || clinicSettings.clinicOpenTime || '10:00') : (clinicSettings.clinicOpenTime || '10:00');
          const closeT2 = isWknd2 ? (clinicSettings.clinicCloseTimeWeekend || clinicSettings.clinicCloseTime || '17:00') : (clinicSettings.clinicCloseTime || '19:00');
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

        const todayStr = new Date().toISOString().substring(0, 10);

        // Stale detection: syncedAt > 1 hour or never synced
        const syncedAt = apptData?.syncedAt ? new Date(apptData.syncedAt) : null;
        const isStale = !syncedAt || (Date.now() - syncedAt.getTime() > 60 * 60 * 1000);
        const staleMinutes = syncedAt ? Math.floor((Date.now() - syncedAt.getTime()) / 60000) : null;
        const staleText = !syncedAt ? 'ยังไม่เคย Sync เดือนนี้' : staleMinutes >= 60 ? `Sync เมื่อ ${Math.floor(staleMinutes / 60)} ชม. ${staleMinutes % 60} นาทีที่แล้ว — ข้อมูลอาจไม่อัพเดท` : null;

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
                    <button onClick={prevMonth} className="p-1.5 sm:p-2 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-white transition-colors">
                      <ChevronLeft size={14} />
                    </button>
                    <span className={`text-xs sm:text-sm font-bold ${monthTextColor} min-w-[110px] sm:min-w-[140px] text-center`}>{thaiMonths[m - 1]} {y + 543}</span>
                    <button onClick={nextMonth} className="p-1.5 sm:p-2 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-white transition-colors">
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
                {/* Row 2: sync + create link */}
                <div className="flex items-center gap-2">
                  <button onClick={() => handleSyncAppointments(apptMonth)} disabled={apptSyncing}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${apptSyncing ? (isDark ? 'bg-sky-950/40 border border-sky-900/50 text-sky-500' : 'bg-sky-100 border border-sky-200 text-sky-500') + ' opacity-70' : apptSyncSuccess ? (isDark ? 'bg-green-950/40 border border-green-900/50 text-green-400' : 'bg-green-50 border border-green-200 text-green-600') : (isDark ? 'bg-sky-950/40 border border-sky-900/50 text-sky-400 hover:bg-sky-900/40' : 'bg-sky-50 border border-sky-200 text-sky-600 hover:bg-sky-100')}`}>
                    <RefreshCw size={13} className={apptSyncing ? 'animate-spin' : ''} />
                    {apptSyncing ? 'Syncing...' : apptSyncSuccess ? 'Synced' : 'Sync'}
                    {apptSyncSuccess && apptData?.syncedAt && <span className="text-[11px] opacity-70 ml-1">{new Date(apptData.syncedAt).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' })}</span>}
                  </button>
                  <button onClick={() => { setSchedStartMonth(apptMonth); setSchedGenResult(null); setSchedSlotDuration(60); setSchedNoDoctorRequired(false); setSchedSelectedDoctor(null); setSchedShowFrom('today'); setSchedEndDay(''); setShowScheduleModal(true); }}
                    disabled={apptSyncing}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${apptSyncing ? 'opacity-50 cursor-not-allowed ' : ''}${isDark ? 'bg-purple-950/40 border border-purple-800/50 text-purple-400 hover:bg-purple-900/40 hover:text-purple-300' : 'bg-purple-50 border border-purple-200 text-purple-600 hover:bg-purple-100'}`}>
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
                {/* Stale overlay — show when stale (not synced / >1hr old) */}
                {isStale && !apptSyncing && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/60 backdrop-blur-[2px] rounded-b-2xl sm:rounded-b-3xl">
                    <RefreshCw size={28} className="text-amber-400 mb-3" />
                    <p className="text-amber-400 font-bold text-sm mb-1 text-center px-4">{staleText}</p>
                    <p className="text-gray-400 text-xs mb-4 text-center px-4">กด Sync เพื่ออัพเดทข้อมูลนัดหมาย</p>
                    <button onClick={() => handleSyncAppointments(apptMonth)} className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold text-xs font-semibold flex items-center gap-2 transition-colors shadow-lg">
                      <RefreshCw size={14} /> Sync ตอนนี้
                    </button>
                  </div>
                )}
                {/* Syncing overlay — show while sync in progress */}
                {apptSyncing && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/50 backdrop-blur-[1px] rounded-b-2xl sm:rounded-b-3xl">
                    <Loader2 size={32} className="animate-spin text-sky-400 mb-3" />
                    <p className="text-sky-400 font-bold text-sm text-center">กำลัง Sync ข้อมูลนัดหมาย...</p>
                  </div>
                )}
                {/* Legend */}
                <div className={`flex flex-wrap justify-center gap-x-3 gap-y-1 mb-2.5 text-[11px] sm:text-[11px] text-gray-500 ${(isStale || apptSyncing) ? 'opacity-30 pointer-events-none' : ''}`}>
                  <span className="flex items-center gap-1">🔥 <span className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-sm inline-block ${legendDocBg}`} /> หมอเข้า</span>
                  <span className="flex items-center gap-1"><span className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-sm inline-block ${isDark ? 'bg-emerald-950/40 border border-emerald-900/40' : 'bg-emerald-50 border border-emerald-200'}`} /> ปกติ</span>
                  <span className="flex items-center gap-1"><span className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-sm inline-block ${legendClosedBg}`} /> ปิด</span>
                  <span className="flex items-center gap-1"><span className={`${apptCountColor} font-bold`}>นัด</span></span>
                  <span className="flex items-center gap-1"><span className={`${availCountColor} font-bold`}>ว่าง</span>/<span className="text-sky-400 font-bold">หมอ</span></span>
                </div>
                {/* Day headers */}
                <div className={`grid grid-cols-7 gap-1 sm:gap-1.5 mb-1 ${(isStale || apptSyncing) ? 'opacity-30 pointer-events-none' : ''}`}>
                  {thaiDays.map((d, i) => (
                    <div key={i} className={`text-center text-xs sm:text-xs font-bold font-semibold py-1.5 ${i >= 5 ? 'text-red-400/60' : 'text-gray-500'}`}>{d}</div>
                  ))}
                </div>
                {/* Day cells */}
                <div className={`grid grid-cols-7 gap-1 sm:gap-1.5 ${(isStale || apptSyncing) ? 'opacity-30 pointer-events-none' : ''}`}>
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
                    const isDoc = schedDoctorDays.has(dateStr);
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

                {/* Sync info */}
                {apptData?.syncedAt && (
                  <p className="text-xs text-gray-600 mt-3 text-right">sync: {new Date(apptData.syncedAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                )}
                {!apptData && !apptSyncing && (
                  <div className="text-center py-8 text-gray-500">
                    <CalendarDays size={36} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-bold mb-2">ยังไม่มีข้อมูลเดือนนี้</p>
                    <button onClick={() => handleSyncAppointments(apptMonth)} className="text-xs text-sky-400 hover:text-sky-300 font-bold">กด Sync เพื่อดึงข้อมูลจาก ProClinic</button>
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
                          <span className="text-sm font-bold text-[var(--tx-heading)] truncate block">{c.name || `ลูกค้า #${c.id}`}</span>
                          <span className="text-xs text-gray-500">{c.hn ? `HN: ${c.hn}` : ''}{c.phone ? ` | ${c.phone}` : ''} | ID: {c.id}</span>
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
                          <div className="relative">
                            <input type="date" value={apptFormData.date || ''}
                              onChange={e => setApptFormData(p => ({ ...p, date: e.target.value }))}
                              className="w-full text-xs px-2 py-1.5 rounded-lg border bg-[var(--bg-input)] border-[var(--bd)] text-transparent cursor-pointer" />
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-[var(--tx-normal)] pointer-events-none">
                              {apptFormData.date ? (() => { const [y,m,d] = apptFormData.date.split('-'); return `${d}/${m}/${y}`; })() : 'dd/mm/yyyy'}
                            </span>
                          </div>
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
                        const todayISO = new Date().toISOString().substring(0, 10);
                        const firstFutureIdx = apptCustomerAppts.findIndex(a => a.date >= todayISO);
                        if (firstFutureIdx > 0) {
                          const target = el.children[firstFutureIdx];
                          if (target) requestAnimationFrame(() => el.scrollTop = target.offsetTop - el.offsetTop);
                        }
                      }
                    }}>
                      {apptCustomerAppts.map(a => {
                        const isPast = a.date < new Date().toISOString().substring(0, 10);
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
                      const statusColor = { '1': 'text-yellow-400', '2': 'text-green-400', '3': 'text-blue-400', '4': 'text-red-400' };
                      const typeMap = { follow: 'ติดตาม', sales: 'ขาย', consult: 'ปรึกษา', treatment: 'รักษา' };
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
                              <div className="flex flex-wrap gap-1.5 mt-1.5">
                                {appt.appointmentType && (
                                  <span className="text-[11px] bg-sky-950/40 text-sky-400 border border-sky-900/40 px-1.5 py-0.5 rounded font-bold">{typeMap[appt.appointmentType] || appt.appointmentType}</span>
                                )}
                                <span className={`text-[11px] font-bold ${statusColor[appt.status] || 'text-gray-400'}`}>
                                  {appt.confirmed ? '✓ ' : ''}{statusMap[appt.status] || `สถานะ ${appt.status}`}
                                </span>
                              </div>
                              {appt.note && (
                                <p className="text-[11px] text-gray-500 mt-1.5 line-clamp-2">{appt.note}</p>
                              )}
                            </div>
                            {/* Color dot + ProClinic link */}
                            <div className="shrink-0 flex flex-col items-center gap-1.5 mt-1">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: appt.eventColor || appt.appointmentColor || '#4FC3F7' }} />
                              {appt.customerId && clinicSettings.proClinicOrigin && (
                                <a
                                  href={`${clinicSettings.proClinicOrigin}/admin/customer/${appt.customerId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sky-500 hover:text-sky-300 transition-colors"
                                  title="เปิดใน ProClinic"
                                >
                                  <ExternalLink size={13} />
                                </a>
                              )}
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
            {(() => {
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
                          <p className="text-xs text-[var(--tx-muted)]">หมอเข้า · ปิดคิว · ปิดช่วงเวลา</p>
                        </div>
                      </div>
                      {/* Summary badges */}
                      <div className="flex items-center gap-1.5">
                        {doctorCount > 0 && <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${isDark ? 'bg-sky-950/40 border border-sky-900/40 text-sky-400' : 'bg-sky-100 border border-sky-200 text-sky-600'}`}>{doctorCount} หมอเข้า</span>}
                        {closedCount > 0 && <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${isDark ? 'bg-red-950/40 border border-red-900/40 text-red-400' : 'bg-red-100 border border-red-200 text-red-600'}`}>{closedCount} ปิด</span>}
                        {blockedCount > 0 && <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${isDark ? 'bg-orange-950/40 border border-orange-900/40 text-orange-400' : 'bg-orange-100 border border-orange-200 text-orange-600'}`}>{blockedCount} slot ปิด</span>}
                      </div>
                    </div>
                    {/* Legend */}
                    <div className="flex flex-wrap gap-3 mt-3 text-xs text-[var(--tx-muted)]">
                      <span className="flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-sm inline-block ${isDark ? 'bg-sky-600' : 'bg-sky-400'}`} /> หมอเข้า</span>
                      <span className="flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-sm inline-block ${isDark ? 'bg-red-600' : 'bg-red-400'}`} /> ปิดคิว</span>
                      <span className="flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-sm inline-block ${isDark ? 'bg-emerald-700' : 'bg-emerald-400'}`} /> ปกติ</span>
                      <span className="flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-sm inline-block ${isDark ? 'bg-orange-600' : 'bg-orange-400'}`} /> ปิดช่วงเวลา</span>
                      {!schedCalendarEditing && <span className="text-[11px] text-[var(--tx-muted)] ml-auto opacity-50">กดแก้ไขเพื่อเปลี่ยน</span>}
                    </div>
                    {/* Calendar edit/save/cancel buttons */}
                    <div className="flex items-center gap-2 mt-3">
                      {!schedCalendarEditing ? (
                        <button onClick={() => { if (confirm('ต้องการแก้ไขตารางหมอเข้า/ปิดคิว?')) startCalendarEdit(); }}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${isDark ? 'bg-sky-950/40 border border-sky-900/50 text-sky-400 hover:bg-sky-900/40' : 'bg-sky-50 border border-sky-200 text-sky-600 hover:bg-sky-100'}`}>
                          <Edit3 size={11} /> แก้ไขตารางหมอเข้า/ปิดคิว
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
                          <span className="text-[11px] text-sky-400 ml-auto">กำลังแก้ไข — กดวันที่เพื่อเปลี่ยนสถานะ</span>
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
                                const isDoc = schedDoctorDays.has(ds);
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
                              {schedBlockingDay && schedBlockingDay.startsWith(mo) && (() => {
                                const bDate = new Date(schedBlockingDay);
                                const bDow = bDate.getDay();
                                const isWknd = bDow === 0 || bDow === 6;
                                const openT = isWknd ? (clinicSettings.clinicOpenTimeWeekend || '10:00') : (clinicSettings.clinicOpenTime || '10:00');
                                const closeT = isWknd ? (clinicSettings.clinicCloseTimeWeekend || '17:00') : (clinicSettings.clinicCloseTime || '19:00');
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
                                            <div className={`flex-1 px-2 py-1.5 text-xs flex items-center gap-1.5 min-w-0 rounded-r ${appt ? (isDark ? 'bg-sky-950/30 border border-sky-900/30' : 'bg-sky-50 border border-sky-200') : 'bg-[var(--bg-hover)]/30 border border-transparent'}`}>
                                              {appt ? (
                                                <>
                                                  <span className={`font-bold truncate ${isDark ? 'text-sky-300' : 'text-sky-700'}`}>{appt.fullCustomerName || appt.customerName || '—'}</span>
                                                  {appt.doctorName && appt.doctorName !== '-' && <span className="text-[8px] text-sky-500 shrink-0">🔥{appt.doctorName}</span>}
                                                  {appt.appointmentType && <span className="text-[8px] text-gray-500 shrink-0">{appt.appointmentType}</span>}
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
                              })()}
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
            })()}

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
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-bold ${isDoctor ? 'bg-sky-950/40 border border-sky-900/40 text-sky-400' : 'bg-purple-950/40 border border-purple-900/40 text-purple-400'}`}>
                                {isDoctor ? 'พบแพทย์' : 'ไม่พบแพทย์'}
                              </span>
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
      })() : (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 xl:gap-8">
          <div className="xl:col-span-1" id="qr-panel">
            <div className="bg-[var(--bg-surface)] p-4 sm:p-6 lg:p-8 rounded-2xl sm:rounded-3xl border border-[var(--bd)] text-center sticky top-8 shadow-[var(--shadow-panel)] flex flex-col items-center">
              <h2 className="text-sm sm:text-base font-bold font-semibold mb-4 sm:mb-6 flex items-center justify-center gap-2 text-gray-400 w-full">
                <QrCode size={18} style={{color: ac}} /> QR Code / ลิงก์
              </h2>
              {selectedQR ? (() => {
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
              })() : (
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
                              <span className="font-bold text-[var(--tx-heading)] text-sm truncate max-w-[160px] sm:max-w-none">{session.sessionName || 'ไม่ระบุชื่อ'}</span>
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
                          {session.status === 'completed' && data && (
                            <button onClick={() => handleViewSession(session)} className="p-2 bg-blue-950/30 hover:bg-blue-900/50 text-blue-400 hover:text-blue-300 rounded-lg border border-blue-900/50 transition-colors" title="ดูข้อมูล"><FileText size={15} /></button>
                          )}
                          {session.status === 'completed' && data && (() => {
                            const isPending = brokerPending[session.id] || session.brokerStatus === 'pending';
                            const isDone    = !isPending && !!session.opdRecordedAt && session.brokerStatus === 'done';
                            const isFailed  = !isPending && !isDone && session.brokerStatus === 'failed';
                            return (
                              <button
                                onClick={() => handleOpdClick(session)}
                                disabled={isPending || isDone}
                                title={isDone ? 'บันทึกลง ProClinic แล้ว — ลบจากหน้าประวัติเพื่อบันทึกใหม่' : isPending ? 'กำลังส่งข้อมูลไป ProClinic...' : isFailed ? `ล้มเหลว: ${session.brokerError || ''}` : 'ส่งข้อมูลบันทึกลง ProClinic'}
                                className={`p-2 rounded-lg border transition-all ${
                                  isDone    ? 'bg-[var(--opd-btn-bg)] text-[var(--opd-color)] border-[var(--opd-bd-str)] cursor-not-allowed opacity-80' :
                                  isPending ? 'bg-amber-950/20 text-amber-400 border-amber-700/50 animate-pulse' :
                                  isFailed  ? 'bg-red-950/20 text-red-400 border-red-700/50' :
                                  'bg-[var(--bg-card)] text-[var(--tx-muted)] border-dashed border-[var(--bd)] hover:border-[var(--opd-bd-str)] hover:text-[var(--opd-color)]'
                                }`}
                              ><ClipboardCheck size={15} /></button>
                            );
                          })()}
                          {session.formType === 'deposit' && session.serviceCompleted && (
                            <button onClick={() => setDepositToDelete({ session, action: 'cancel' })} className="p-2 bg-red-950/30 hover:bg-red-900/50 text-red-400 hover:text-red-300 rounded-lg border border-red-900/50 transition-colors" title="ยกเลิกการจอง (ลบมัดจำ+ลูกค้าใน ProClinic)"><XCircle size={15} /></button>
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
                            <span className="font-bold text-[var(--tx-heading)] text-sm">{data.prefix !== 'ไม่ระบุ' ? data.prefix : ''} {data.firstName} {data.lastName}</span>
                            {isPerf && <Flame size={14} className="text-red-500" />}
                            {isHrt && <Activity size={14} className="text-orange-500" />}
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs text-gray-500 font-mono font-semibold">
                            <span>อายุ: {data.age || '-'} ปี</span>
                            {!isFollowUp && !isCustom && <span>โทร: {formatPhoneNumberDisplay(data.phone, data.isInternationalPhone, data.phoneCountryCode)}</span>}
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
                                {session.brokerProClinicHN && <span className="px-1 py-px rounded bg-[var(--opd-btn-bg)] border border-[var(--opd-bd)] font-black">HN {session.brokerProClinicHN}</span>}
                              {session.brokerProClinicId && (
                                <a href={getProClinicUrl(session.brokerProClinicId)} target="_blank" rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  className="px-1 py-px rounded border border-emerald-800/50 text-emerald-500 hover:text-emerald-300 font-black text-[8px] transition-colors"
                                  title={getProClinicUrl(session.brokerProClinicId)}>↗</a>
                              )}
                            </span>
                            {session.brokerLastAutoSyncAt && (
                              <span className="text-[8px] text-[var(--opd-color)] opacity-70 font-mono flex items-center gap-1">
                                🔄 แก้ไขและ sync ProClinic อัตโนมัติ · {formatBangkokTime(session.brokerLastAutoSyncAt)}
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
      {viewingSession && (() => {
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
              {/* Title — grows to fill space, buttons wrap below if needed */}
              <div className="flex items-center gap-2.5 flex-1 min-w-[140px]">
                <div className={`p-1.5 rounded bg-black border shrink-0 ${isCustom ? 'border-cyan-900/50 text-cyan-500' : isPerf || isHrt ? 'border-red-900/50 text-red-500' : 'border-[var(--bd-strong)] text-gray-300'}`}>
                  {isCustom ? <LayoutTemplate size={16}/> : isPerf ? <Flame size={16} /> : <FileText size={16} />}
                </div>
                <div className="min-w-0">
                  <h3 className="font-black text-white font-semibold text-xs sm:text-sm leading-tight">
                    {isCustom ? `แบบฟอร์ม: ${viewingSession.customTemplate?.title}` : isFollowUp ? 'แบบรายงานติดตาม' : 'ประวัติผู้ป่วย OPD'}
                  </h3>
                  <p className="text-[11px] text-red-500 font-mono mt-0.5">ID: {viewingSession.id}</p>
                </div>
              </div>

              {/* Buttons — always full labels, wrap to next line when space is tight */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {viewingSession.patientData && !(viewingSession.isArchived && viewingSession.formType === 'deposit') && (
                <button onClick={() => { closeViewSession(); onSimulateScan(viewingSession.id); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-950/30 hover:bg-blue-900/50 text-blue-400 rounded border border-blue-900/50 transition-colors text-xs font-bold font-semibold whitespace-nowrap">
                  <Edit3 size={13} /> แก้ไขข้อมูล
                </button>
                )}
                {viewingSession.patientData && !(viewingSession.isArchived && viewingSession.formType === 'deposit') && (() => {
                  const isPending = brokerPending[viewingSession.id] || viewingSession.brokerStatus === 'pending';
                  return (
                    <button
                      onClick={() => handleResync(viewingSession)}
                      disabled={isPending}
                      title="บันทึกข้อมูลลง ProClinic อีกครั้ง (manual resync)"
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded border transition-all text-xs font-bold font-semibold whitespace-nowrap ${
                        isPending
                          ? 'bg-amber-950/20 text-amber-400 border-amber-700/50 animate-pulse cursor-not-allowed'
                          : 'bg-teal-950/20 hover:bg-teal-900/40 text-teal-400 border-teal-800/50'
                      }`}
                    >
                      <RotateCcw size={13} className={isPending ? 'animate-spin' : ''} />
                      {isPending ? 'กำลังส่ง...' : 'Resync ProClinic'}
                    </button>
                  );
                })()}
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
                {viewingSession.patientData && (() => {
                  const isPending = brokerPending[viewingSession.id] || viewingSession.brokerStatus === 'pending';
                  const isFailed  = !isPending && viewingSession.brokerStatus === 'failed';
                  const isDone    = !isPending && !!viewingSession.opdRecordedAt && viewingSession.brokerStatus === 'done';
                  return (
                    <button
                      onClick={() => handleOpdClick(viewingSession)}
                      disabled={isPending || isDone}
                      title={
                        isPending ? 'กำลังส่งข้อมูลไป ProClinic...' :
                        isDone    ? 'บันทึกลง ProClinic แล้ว — ลบจากหน้าประวัติเพื่อบันทึกใหม่' :
                        isFailed  ? `ล้มเหลว: ${viewingSession.brokerError || ''}` :
                        viewingSession.opdRecordedAt ? 'ส่งข้อมูลไป ProClinic' : 'ส่งข้อมูลไป ProClinic'
                      }
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded border transition-all text-xs font-bold font-semibold whitespace-nowrap ${
                        isPending ? 'bg-amber-950/20 text-amber-400 border-amber-700/50 animate-pulse' :
                        isDone    ? 'bg-[var(--opd-btn-bg)] text-[var(--opd-color)] border-[var(--opd-bd-str)] cursor-not-allowed opacity-80' :
                        isFailed  ? 'bg-red-950/20 text-red-400 border-red-700/50' :
                        viewingSession.opdRecordedAt ? 'bg-[var(--opd-btn-bg)] text-[var(--opd-color)] border-[var(--opd-bd-str)]' :
                        'bg-[var(--bg-card)] text-[var(--tx-muted)] border-dashed border-[var(--bd)] hover:border-teal-500/60 hover:text-[var(--opd-color)]'
                      }`}
                    >
                      <ClipboardCheck size={13} />
                      {isPending ? 'กำลังส่ง...' : isFailed ? 'ล้มเหลว' : viewingSession.opdRecordedAt ? 'OPD บันทึกแล้ว' : 'บันทึกลง OPD'}
                    </button>
                  );
                })()}
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
                  <p className="text-[11px] font-black font-semibold text-[var(--opd-color)]">บันทึกลง ProClinic เรียบร้อยแล้ว</p>
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
                      🔄 แก้ไขและ sync ProClinic อัตโนมัติ · {formatBangkokTime(viewingSession.brokerLastAutoSyncAt)}
                    </p>
                  )}
                </div>
                <div className="ml-auto flex items-center gap-2 flex-wrap">
                  {viewingSession.brokerProClinicId && (<>
                    <a href={getProClinicUrl(viewingSession.brokerProClinicId)} target="_blank" rel="noopener noreferrer"
                      className="text-[11px] font-black font-semibold px-2 py-1 rounded border border-emerald-700/50 text-emerald-400 hover:bg-emerald-900/30 transition-colors whitespace-nowrap flex items-center gap-1"
                      title={getProClinicUrl(viewingSession.brokerProClinicId)}>
                      ProClinic ↗
                    </a>
                    <button onClick={() => handleOpenPatientView(viewingSession)}
                      className="text-[11px] font-black font-semibold px-2 py-1 rounded border border-teal-700/50 text-teal-400 hover:bg-teal-900/30 transition-colors whitespace-nowrap flex items-center gap-1">
                      <Search size={9}/> คอร์สและนัดหมาย ↗
                    </button>
                    <button onClick={() => handleProClinicEdit(viewingSession)}
                      className="text-[11px] font-black font-semibold px-2 py-1 rounded border border-blue-700/50 text-blue-400 hover:bg-blue-900/30 transition-colors whitespace-nowrap">
                      แก้ไขใน ProClinic
                    </button>
                    <button onClick={() => handleProClinicDelete(viewingSession)}
                      className="text-[11px] font-black font-semibold px-2 py-1 rounded border border-red-700/50 text-red-400 hover:bg-red-900/30 transition-colors whitespace-nowrap">
                      ลบจาก ProClinic
                    </button>
                  </>)}
                </div>
              </div>
            )}
            {viewingSession.brokerStatus === 'failed' && (
              <div className="px-4 sm:px-6 py-3 bg-red-950/20 border-b border-red-900/40 shrink-0">
                <div className="flex items-center gap-3">
                  <X size={16} className="text-red-400 shrink-0" />
                  <p className="text-[11px] font-bold text-red-400">ส่งข้อมูลไป ProClinic ไม่สำเร็จ: {viewingSession.brokerError}</p>
                  <button
                    onClick={() => handleOpdClick(viewingSession)}
                    className="ml-auto text-[11px] font-black font-semibold text-red-400 hover:text-red-300 whitespace-nowrap border border-red-800 px-2 py-1 rounded"
                  >ลองใหม่</button>
                </div>
                {(viewingSession.brokerError || '').includes('Session หมดอายุ') && (
                  <p className="text-xs text-amber-400 mt-2 ml-7">💡 กดปุ่ม "แชร์ Session" ใน Extension Popup แล้วกด "ลองใหม่"</p>
                )}
              </div>
            )}
            <div className="p-4 md:p-6 overflow-y-auto bg-[var(--bg-base)] flex-1 custom-scrollbar">
              {!viewingSession.patientData && (
                <div className="p-12 text-center text-gray-600 flex flex-col items-center gap-4 mb-6">
                  <Clock size={36} className="opacity-30" />
                  <p className="text-sm font-bold text-gray-400">รอลูกค้ากรอกข้อมูล...</p>
                  <p className="text-xs text-gray-600">ลูกค้ายังไม่ได้กรอกแบบฟอร์ม</p>
                </div>
              )}
              <div className={`grid grid-cols-1 ${isFollowUp || isCustom ? '' : 'md:grid-cols-2'} gap-6`} style={viewingSession.patientData ? {} : {display:'none'}}>

                <div className="space-y-6">
                  <div className="bg-[var(--bg-card)] p-4 sm:p-5 rounded-xl border border-[var(--bd)] shadow-inner relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-red-600"></div>
                    <h4 className="text-xs font-black text-gray-500 font-semibold border-b border-[var(--bd)] pb-2 mb-4">ข้อมูลส่วนตัว</h4>
                    <div className="space-y-3 text-sm">
                      <div className="grid grid-cols-3 gap-2"><span className="text-gray-500">ชื่อ-สกุล:</span><span className="col-span-2 font-bold text-white break-words">{d.prefix !== 'ไม่ระบุ' ? d.prefix : ''} {d.firstName} {d.lastName}</span></div>
                      <div className="grid grid-cols-3 gap-2"><span className="text-gray-500">เพศ:</span><span className="col-span-2 font-bold text-white">{d.gender || '-'}</span></div>
                      <div className="grid grid-cols-3 gap-2"><span className="text-gray-500">วันเกิด:</span><span className="col-span-2 font-bold text-white">{renderDobFormat(d)} <span className="text-red-500 font-mono text-xs ml-2">[{d.age} ปี]</span></span></div>
                      {d.idCard && (
                        <div className="grid grid-cols-3 gap-2"><span className="text-gray-500 flex items-center gap-1"><CreditCard size={12}/> บัตร/Passport:</span><span className="col-span-2 font-bold text-white font-mono">{d.idCard.length === 13 ? d.idCard.replace(/(\d)(\d{4})(\d{5})(\d{2})(\d)/, '$1-$2-$3-$4-$5') : d.idCard}</span></div>
                      )}

                      {(isFollowUp || isCustom) && (
                        <div className="grid grid-cols-3 gap-2"><span className="text-gray-500">วันที่ประเมิน:</span><span className="col-span-2 font-bold text-orange-400">{d.assessmentDate || '-'}</span></div>
                      )}

                      {!isFollowUp && !isCustom && (
                        <>
                          <div className="grid grid-cols-3 gap-2"><span className="text-gray-500">สัญชาติ:</span><span className="col-span-2 font-bold text-white">{d.nationality === 'ต่างชาติ' ? (d.nationalityCountry || 'ต่างชาติ') : 'ไทย'}</span></div>
                          <div className="grid grid-cols-3 gap-2"><span className="text-gray-500">โทรศัพท์:</span><span className="col-span-2 font-bold text-white font-mono break-all">{formatPhoneNumberDisplay(d.phone, d.isInternationalPhone, d.phoneCountryCode)}</span></div>
                          <div className="grid grid-cols-3 gap-2"><span className="text-gray-500">ที่อยู่:</span><span className="col-span-2 font-bold text-gray-300 text-xs leading-relaxed break-words">{[d.address, d.subDistrict && `ต.${d.subDistrict}`, d.district && `อ.${d.district}`, d.province, d.postalCode].filter(Boolean).join(' ') || '-'}</span></div>
                        </>
                      )}
                    </div>
                  </div>

                  {!isFollowUp && !isCustom && (
                    <div className="bg-[var(--bg-card)] p-4 sm:p-5 rounded-xl border border-orange-900/30">
                      <h4 className="text-xs font-black text-orange-600 font-semibold border-b border-orange-900/30 pb-2 mb-4">ติดต่อฉุกเฉิน</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between"><span className="text-orange-500/50">ชื่อ-สกุล:</span><span className="font-bold text-orange-200">{d.emergencyName || '-'}</span></div>
                        <div className="flex justify-between"><span className="text-orange-500/50">ความสัมพันธ์:</span><span className="font-bold text-orange-200">{d.emergencyRelation || '-'}</span></div>
                        <div className="flex justify-between"><span className="text-orange-500/50">โทรศัพท์:</span><span className="font-bold font-mono text-orange-200 break-all">{formatPhoneNumberDisplay(d.emergencyPhone, d.isInternationalEmergencyPhone, d.emergencyPhoneCountryCode)}</span></div>
                      </div>
                    </div>
                  )}
                </div>

                {!isFollowUp && !isCustom && (
                  <div className="space-y-6">
                    <div className="bg-[var(--bg-card)] p-4 sm:p-5 rounded-xl border border-[var(--bd)] shadow-inner relative overflow-hidden h-full">
                      <div className="absolute top-0 left-0 w-1 h-full bg-gray-700"></div>
                      <h4 className="text-xs font-black text-gray-500 font-semibold border-b border-[var(--bd)] pb-2 mb-4">ข้อมูลสุขภาพพื้นฐาน</h4>
                      <div className="mb-5">
                        <span className="text-xs text-gray-500 block mb-2">สาเหตุที่มาพบแพทย์</span>
                        <div className="flex flex-col gap-2 font-black text-white bg-[var(--bg-hover)] p-3 rounded border border-[var(--bd-strong)] font-semibold text-sm border-l-2 border-l-red-600 mb-2">
                          {reasons.map(r => (
                            <div key={r} className="break-words">• {r === 'อื่นๆ' ? `อื่นๆ: ${d.visitReasonOther}` : r}</div>
                          ))}
                        </div>
                        {isHrt && goals.length > 0 && (
                          <div className="bg-[var(--bg-card)] p-3 rounded border border-[var(--bd-strong)] mt-2">
                            <span className="text-xs text-gray-500 uppercase block mb-2">เป้าหมายการเสริมฮอร์โมน</span>
                            <div className="flex flex-wrap gap-1.5">
                               {goals.map(g => (
                                 <span key={g} className="font-bold text-orange-400 text-xs bg-orange-950/20 border border-orange-900/30 px-2 py-0.5 rounded break-words max-w-full">
                                   {g === 'ฮอร์โมนเพื่อการข้ามเพศ' ? `ข้ามเพศ (${d.hrtTransType})` : g === 'อื่นๆ' ? `อื่นๆ (${d.hrtOtherDetail})` : g}
                                 </span>
                               ))}
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="space-y-3">
                        <div className={`p-3 rounded border ${d.hasAllergies === 'มี' ? 'bg-red-950/20 border-red-900/50' : 'bg-[var(--bg-card)] border-[var(--bd)]'}`}>
                          <span className={`text-xs font-semibold block mb-1 ${d.hasAllergies === 'มี' ? 'text-red-500' : 'text-gray-500'}`}>ประวัติแพ้ยา/อาหาร</span>
                          <span className={`font-bold text-sm break-words ${d.hasAllergies === 'มี' ? 'text-red-400' : 'text-gray-300'}`}>{d.hasAllergies === 'มี' ? d.allergiesDetail : 'ไม่มี'}</span>
                        </div>
                        <div className={`p-3 rounded border ${d.hasUnderlying === 'มี' ? 'bg-orange-950/20 border-orange-900/50' : 'bg-[var(--bg-card)] border-[var(--bd)]'}`}>
                          <span className={`text-xs font-semibold block mb-1 ${d.hasUnderlying === 'มี' ? 'text-orange-500' : 'text-gray-500'}`}>โรคประจำตัว</span>
                          <span className={`font-bold text-sm leading-relaxed break-words ${d.hasUnderlying === 'มี' ? 'text-orange-300' : 'text-gray-300'}`}>
                            {d.hasUnderlying === 'มี' ? (
                              <ul className="list-disc pl-4 space-y-1">
                                {d.ud_hypertension && <li>ความดันโลหิตสูง</li>}
                                {d.ud_diabetes && <li>เบาหวาน</li>}
                                {d.ud_lung && <li>โรคปอด</li>}
                                {d.ud_kidney && <li>โรคไต</li>}
                                {d.ud_heart && <li>โรคหัวใจ</li>}
                                {d.ud_blood && <li>โรคโลหิต</li>}
                                {d.ud_other && <li>{d.ud_otherDetail}</li>}
                              </ul>
                            ) : 'ไม่มี'}
                          </span>
                        </div>
                        <div className="p-3 bg-[var(--bg-card)] rounded border border-[var(--bd)]">
                          <span className="text-xs text-gray-500 font-semibold block mb-1">ยาที่ใช้ประจำ</span>
                          <span className="font-bold text-sm text-gray-300 break-words">{d.currentMedication || 'ไม่มี'}</span>
                        </div>
                        {d.bloodType && d.bloodType !== 'ไม่ทราบ' && (
                          <div className="p-3 bg-[var(--bg-card)] rounded border border-[var(--bd)]">
                            <span className="text-xs text-gray-500 font-semibold block mb-1">กรุ๊ปเลือด</span>
                            <span className="font-bold text-sm text-gray-300">{d.bloodType}</span>
                          </div>
                        )}
                        {d.pregnancy && d.pregnancy !== 'ไม่เกี่ยวข้อง/ไม่ได้ตั้งครรภ์' && (
                          <div className={`p-3 rounded border ${d.pregnancy === 'กำลังตั้งครรภ์' ? 'bg-pink-950/20 border-pink-900/50' : 'bg-[var(--bg-card)] border-[var(--bd)]'}`}>
                            <span className={`text-xs font-semibold block mb-1 ${d.pregnancy === 'กำลังตั้งครรภ์' ? 'text-pink-500' : 'text-gray-500'}`}>การตั้งครรภ์</span>
                            <span className={`font-bold text-sm ${d.pregnancy === 'กำลังตั้งครรภ์' ? 'text-pink-300' : 'text-gray-300'}`}>{d.pregnancy}</span>
                          </div>
                        )}
                        {d.howFoundUs && d.howFoundUs.length > 0 && (
                          <div className="p-3 bg-[var(--bg-elevated)] rounded border border-blue-900/30">
                            <span className="text-xs text-blue-500 font-semibold block mb-2 flex items-center gap-1"><Globe size={10}/> รู้จักคลินิกจาก</span>
                            <div className="flex flex-wrap gap-1.5">
                              {d.howFoundUs.map(ch => (
                                <span key={ch} className="text-xs font-bold text-blue-300 bg-blue-950/30 border border-blue-900/40 px-2.5 py-1 rounded-full">{ch}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

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

                  {showAdam && (() => {
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
                  })()}

                  {showMrs && (() => {
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
                  })()}

                  {isPerf && (() => {
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
                  })()}
                </div>
              )}

              {/* ── Deposit Info Section ── */}
              {viewingSession.formType === 'deposit' && viewingSession.depositData && (() => {
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
                            className="text-[11px] font-black font-semibold px-2 py-1 rounded border border-emerald-600 bg-emerald-700 text-white hover:bg-emerald-600 transition-colors flex items-center gap-1">
                            <CheckCircle2 size={10}/> บันทึก
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
                          <div className="sm:col-span-2 mt-2 mb-1"><span className="text-xs font-black text-amber-500 font-semibold flex items-center gap-1"><CalendarClock size={10}/> นัดหมาย</span></div>
                          <div className="bg-[var(--bg-surface)] p-3 rounded border border-amber-900/30">
                            <span className="text-xs text-gray-500 uppercase block mb-1">วันนัด</span>
                            <span className="font-bold text-amber-300">{toThaiDate(dep.appointmentDate) || '-'}</span>
                          </div>
                          <div className="bg-[var(--bg-surface)] p-3 rounded border border-amber-900/30">
                            <span className="text-xs text-gray-500 uppercase block mb-1">เวลา</span>
                            <span className="font-bold text-amber-300">{dep.appointmentStartTime || ''} - {dep.appointmentEndTime || ''}</span>
                          </div>
                          <div className="bg-[var(--bg-surface)] p-3 rounded border border-amber-900/30">
                            <span className="text-xs text-gray-500 uppercase block mb-1">แพทย์</span>
                            <span className="font-bold text-white">{optLabel('doctors', dep.doctor)}</span>
                          </div>
                          <div className="bg-[var(--bg-surface)] p-3 rounded border border-amber-900/30">
                            <span className="text-xs text-gray-500 uppercase block mb-1">ห้องตรวจ</span>
                            <span className="font-bold text-white">{optLabel('rooms', dep.room)}</span>
                          </div>
                          {(dep.visitPurpose || []).length > 0 && (
                            <div className="bg-[var(--bg-surface)] p-3 rounded border border-amber-900/30 sm:col-span-2">
                              <span className="text-xs text-gray-500 uppercase block mb-1">นัดมาเพื่อ</span>
                              <div className="flex flex-wrap gap-1">{dep.visitPurpose.map(v => <span key={v} className="text-xs font-bold text-amber-300 bg-amber-950/30 border border-amber-900/40 px-2 py-0.5 rounded">{v}</span>)}</div>
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
                          <input type="number" value={dep.paymentAmount || ''} onChange={e => setEditingDepositData(p => ({...p, paymentAmount: e.target.value}))} className="w-full bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white rounded px-2 py-1.5 text-sm outline-none"/>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 uppercase block mb-1">วันที่จ่าย</label>
                          <DatePickerThai value={dep.depositDate || ''} onChange={v => setEditingDepositData(p => ({...p, depositDate: v}))} className="w-full bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white rounded px-2 py-1.5 text-sm outline-none"/>
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
                            className={`px-3 py-1 rounded text-xs font-bold border transition-colors ${dep.hasAppointment ? 'bg-amber-900/30 border-amber-600 text-amber-400' : 'bg-[var(--bg-card)] border-[var(--bd)] text-gray-500'}`}>
                            {dep.hasAppointment ? 'มีนัดหมาย' : 'ไม่มีนัดหมาย'}
                          </button>
                        </div>
                        {dep.hasAppointment && (<>
                          <div>
                            <label className="text-xs text-gray-500 uppercase block mb-1">วันนัด</label>
                            <DatePickerThai value={dep.appointmentDate || ''} onChange={v => setEditingDepositData(p => ({...p, appointmentDate: v}))} className="w-full bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white rounded px-2 py-1.5 text-sm outline-none"/>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-xs text-gray-500 uppercase block mb-1">เริ่ม</label>
                              <select value={dep.appointmentStartTime || ''} onChange={e => setEditingDepositData(p => ({...p, appointmentStartTime: e.target.value}))} className="w-full bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white rounded px-2 py-1.5 text-sm outline-none">
                                <option value="">--</option>
                                {(depositOptions?.appointmentStartTimes || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="text-xs text-gray-500 uppercase block mb-1">สิ้นสุด</label>
                              <select value={dep.appointmentEndTime || ''} onChange={e => setEditingDepositData(p => ({...p, appointmentEndTime: e.target.value}))} className="w-full bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white rounded px-2 py-1.5 text-sm outline-none">
                                <option value="">--</option>
                                {(depositOptions?.appointmentEndTimes || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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
                        <CheckCircle2 size={12}/> บันทึกมัดจำลง ProClinic แล้ว · {formatBangkokTime(viewingSession.depositSyncAt)}
                      </div>
                    )}
                    {viewingSession.depositSyncStatus === 'failed' && (
                      <div className="mt-3 p-2 bg-red-950/20 border border-red-900/30 rounded text-xs text-red-400 font-mono">
                        ผิดพลาด: {viewingSession.depositSyncError}
                      </div>
                    )}
                  </div>
                );
              })()}

              {viewingSession.patientData && (
              <div className="mt-8 pt-6 border-t border-[var(--bd)] relative">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-3">
                  <h4 className="text-xs font-black text-gray-400 font-semibold flex items-center gap-2">
                    <FileText size={14} className="text-blue-500 shrink-0" /> สรุปประวัติผู้ป่วย (Clinical Summary)
                  </h4>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    {/* Language toggle */}
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
      })()}

      {/* Treatment Create/Edit Full Page */}
      {treatmentFormMode && (
        <TreatmentFormPage
          mode={treatmentFormMode.mode || 'create'}
          customerId={treatmentFormMode.customerId}
          treatmentId={treatmentFormMode.treatmentId}
          patientName={treatmentFormMode.patientName}
          patientData={treatmentFormMode.patientData}
          isDark={isDark}
          db={db}
          appId={appId}
          onClose={() => setTreatmentFormMode(null)}
          onSaved={(savedTreatmentId) => { setTreatmentFormMode(null); setAutoExpandTreatmentId(savedTreatmentId || ''); setTreatmentRefreshKey(k => k + 1); }}
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
                     <div className="grid grid-cols-3 gap-3">
                        <button onClick={() => openNamePrompt({isPermanent: false, formType: 'intake'})} className={`p-4 text-left rounded-xl transition-all group border-2 hover:shadow-lg ${isDark ? 'bg-[var(--bg-hover)] border-[var(--bd)] hover:border-red-500/50' : 'bg-white border-gray-200 hover:border-red-400 shadow-sm'}`}>
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2.5 ${isDark ? 'bg-red-950/50 text-red-400' : 'bg-red-50 text-red-500'}`}>
                            <ClipboardCheck size={16} />
                          </div>
                          <span className="block text-[var(--tx-heading)] font-bold text-sm">OPD Intake</span>
                          <span className="text-xs text-[var(--tx-muted)] mt-1 block leading-relaxed">บันทึกผู้ป่วยใหม่<br/>หมดอายุ 2 ชม.</span>
                        </button>
                        <button onClick={() => { setShowSessionModal(false); if (!depositOptions) fetchDepositOptions(); setShowDepositForm(true); }} className={`p-4 text-left rounded-xl transition-all group border-2 hover:shadow-lg ${isDark ? 'bg-[var(--bg-hover)] border-[var(--bd)] hover:border-emerald-500/50' : 'bg-white border-gray-200 hover:border-emerald-400 shadow-sm'}`}>
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2.5 ${isDark ? 'bg-emerald-950/50 text-emerald-400' : 'bg-emerald-50 text-emerald-500'}`}>
                            <Banknote size={16} />
                          </div>
                          <span className="block text-[var(--tx-heading)] font-bold text-sm">จองมัดจำ</span>
                          <span className="text-xs text-[var(--tx-muted)] mt-1 block leading-relaxed">ลูกค้าจอง<br/>ลิงก์ถาวร</span>
                        </button>
                        <button onClick={() => { setShowSessionModal(false); if (!depositOptions) fetchDepositOptions(); setEditingAppointment(null); setNoDepositFormData({ sessionName: '', appointmentDate: todayISO(), appointmentStartTime: '', appointmentEndTime: '', advisor: '', doctor: '', assistant: '', room: '', source: '', visitPurpose: [] }); setShowNoDepositForm(true); }} className={`p-4 text-left rounded-xl transition-all group border-2 hover:shadow-lg ${isDark ? 'bg-[var(--bg-hover)] border-[var(--bd)] hover:border-orange-500/50' : 'bg-white border-gray-200 hover:border-orange-400 shadow-sm'}`}>
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2.5 ${isDark ? 'bg-orange-950/50 text-orange-400' : 'bg-orange-50 text-orange-500'}`}>
                            <UserPlus size={16} />
                          </div>
                          <span className="block text-[var(--tx-heading)] font-bold text-sm">จองไม่มัดจำ</span>
                          <span className="text-xs text-[var(--tx-muted)] mt-1 block leading-relaxed">ลูกค้าจองล่วงหน้า<br/>นัดหมาย ProClinic</span>
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
                    <input type="number" value={depositFormData.paymentAmount} onChange={e => setDepositFormData(p => ({...p, paymentAmount: e.target.value}))} placeholder="" className="w-full bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white rounded-lg px-3 py-2.5 text-sm outline-none focus:border-emerald-600"/>
                  </div>

                  {/* วันที่ + เวลา */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 font-semibold block mb-1">วันที่จ่ายมัดจำ</label>
                      <DatePickerThai value={depositFormData.depositDate} onChange={v => setDepositFormData(p => ({...p, depositDate: v}))} className="w-full bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white rounded-lg px-3 py-2.5 text-sm outline-none focus:border-emerald-600"/>
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

                  {depositFormData.hasAppointment && (
                    <div className="space-y-3 pl-2 border-l-2 border-blue-900/50 ml-2">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">วันนัด</label>
                          <DatePickerThai value={depositFormData.appointmentDate} onChange={v => setDepositFormData(p => ({...p, appointmentDate: v}))} className="w-full bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-600"/>
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          <div>
                            <label className="text-xs text-gray-500 block mb-1">เริ่ม</label>
                            <select value={depositFormData.appointmentStartTime} onChange={e => setDepositFormData(p => ({...p, appointmentStartTime: e.target.value}))} className="w-full bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white rounded-lg px-2 py-2 text-xs outline-none">
                              <option value="">--</option>
                              {(depositOptions?.appointmentStartTimes || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 block mb-1">สิ้นสุด</label>
                            <select value={depositFormData.appointmentEndTime} onChange={e => setDepositFormData(p => ({...p, appointmentEndTime: e.target.value}))} className="w-full bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white rounded-lg px-2 py-2 text-xs outline-none">
                              <option value="">--</option>
                              {(depositOptions?.appointmentEndTimes || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">ที่ปรึกษา</label>
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
                        <label className="text-xs text-gray-500 block mb-1">ช่องทางนัดหมาย</label>
                        <select value={depositFormData.appointmentChannel} onChange={e => setDepositFormData(p => ({...p, appointmentChannel: e.target.value}))} className="w-full bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white rounded-lg px-3 py-2 text-sm outline-none">
                          <option value="">-- เลือก --</option>
                          {(depositOptions?.appointmentChannels || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* นัดมาเพื่อ — visit purpose */}
                  <div className="border-t border-[var(--bd)] pt-4">
                    <label className="text-xs text-gray-500 font-semibold block mb-2">นัดมาเพื่อ</label>
                    <div className="flex flex-wrap gap-2">
                      {['สมรรถภาพทางเพศ','โรคระบบทางเดินปัสสาวะ','ดูแลสุขภาพองค์รวม','เสริมฮอร์โมน','โรคติดต่อทางเพศสัมพันธ์','ขลิบ','ทำหมัน','เลาะสารเหลว','อื่นๆ'].map(r => (
                        <button key={r} type="button"
                          onClick={() => setDepositFormData(p => ({...p, visitPurpose: p.visitPurpose.includes(r) ? p.visitPurpose.filter(x=>x!==r) : [...p.visitPurpose, r]}))}
                          className={`text-xs px-2.5 py-1.5 rounded-lg border font-bold transition-all ${depositFormData.visitPurpose.includes(r) ? 'bg-emerald-900/40 border-emerald-600 text-emerald-300' : 'bg-[var(--bg-card)] border-[var(--bd)] text-gray-500 hover:text-gray-300'}`}
                        >{r}</button>
                      ))}
                    </div>
                  </div>

                  {/* Submit */}
                  <div className="flex gap-3 pt-4 border-t border-[var(--bd)]">
                    <button onClick={() => setShowDepositForm(false)} className="flex-1 px-4 py-3 bg-[var(--bg-hover)] hover:bg-[var(--bg-hover)] text-gray-300 rounded-lg font-bold text-xs uppercase border border-[var(--bd-strong)]">ยกเลิก</button>
                    <button onClick={confirmCreateDeposit} disabled={isGenerating || !depositFormData.paymentAmount} className="flex-1 px-4 py-3 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg font-bold text-xs uppercase disabled:opacity-50 flex items-center justify-center gap-2">
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

                  {/* วันนัด + เวลา */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">วันนัด <span className="text-red-500">*</span></label>
                      <DatePickerThai value={noDepositFormData.appointmentDate} onChange={v => setNoDepositFormData(p => ({...p, appointmentDate: v}))} className={`w-full rounded-lg px-3 py-2.5 text-sm outline-none ${isDark ? 'bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white focus:border-orange-600' : 'bg-pink-50 border border-pink-200 text-gray-900 focus:border-pink-500'}`}/>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">เริ่ม <span className="text-red-500">*</span></label>
                        <select value={noDepositFormData.appointmentStartTime} onChange={e => setNoDepositFormData(p => ({...p, appointmentStartTime: e.target.value}))} className={`w-full rounded-lg px-2 py-2.5 text-xs outline-none ${isDark ? 'bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white' : 'bg-pink-50 border border-pink-200 text-gray-900'}`}>
                          <option value="">--</option>
                          {(depositOptions?.appointmentStartTimes || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">สิ้นสุด <span className="text-red-500">*</span></label>
                        <select value={noDepositFormData.appointmentEndTime} onChange={e => setNoDepositFormData(p => ({...p, appointmentEndTime: e.target.value}))} className={`w-full rounded-lg px-2 py-2.5 text-xs outline-none ${isDark ? 'bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white' : 'bg-pink-50 border border-pink-200 text-gray-900'}`}>
                          <option value="">--</option>
                          {(depositOptions?.appointmentEndTimes || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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

                  {/* แพทย์ */}
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">แพทย์ <span className="text-red-500">*</span></label>
                    <select value={noDepositFormData.doctor} onChange={e => setNoDepositFormData(p => ({...p, doctor: e.target.value}))} className={`w-full rounded-lg px-3 py-2.5 text-sm outline-none ${isDark ? 'bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white' : 'bg-pink-50 border border-pink-200 text-gray-900'}`}>
                      <option value="">-- เลือก --</option>
                      {(depositOptions?.doctors || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>

                  {/* ผู้ช่วยแพทย์ */}
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">ผู้ช่วยแพทย์ <span className="text-red-500">*</span></label>
                    <select value={noDepositFormData.assistant} onChange={e => setNoDepositFormData(p => ({...p, assistant: e.target.value}))} className={`w-full rounded-lg px-3 py-2.5 text-sm outline-none ${isDark ? 'bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white' : 'bg-pink-50 border border-pink-200 text-gray-900'}`}>
                      <option value="">-- เลือก --</option>
                      {(depositOptions?.assistants || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>

                  {/* ห้องตรวจ */}
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">ห้องตรวจ <span className="text-red-500">*</span></label>
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
                      {['สมรรถภาพทางเพศ','โรคระบบทางเดินปัสสาวะ','ดูแลสุขภาพองค์รวม','เสริมฮอร์โมน','โรคติดต่อทางเพศสัมพันธ์','ขลิบ','ทำหมัน','เลาะสารเหลว','อื่นๆ'].map(r => (
                        <button key={r} type="button"
                          onClick={() => setNoDepositFormData(p => ({...p, visitPurpose: p.visitPurpose.includes(r) ? p.visitPurpose.filter(x=>x!==r) : [...p.visitPurpose, r]}))}
                          className={`text-xs px-2.5 py-1.5 rounded-lg border font-bold transition-all ${noDepositFormData.visitPurpose.includes(r) ? (isDark ? 'bg-orange-900/40 border-orange-600 text-orange-300' : 'bg-pink-100 border-pink-500 text-pink-700') : (isDark ? 'bg-[var(--bg-card)] border-[var(--bd)] text-gray-500 hover:text-gray-300' : 'bg-white border-pink-200 text-gray-500 hover:text-pink-600')}`}
                        >{r}</button>
                      ))}
                    </div>
                  </div>

                  {/* Submit */}
                  <div className={`flex gap-3 pt-4 border-t ${isDark ? 'border-[var(--bd)]' : 'border-pink-200'}`}>
                    <button onClick={() => { setShowNoDepositForm(false); setEditingAppointment(null); }} className={`flex-1 px-4 py-3 rounded-lg font-bold text-xs uppercase border ${isDark ? 'bg-[var(--bg-hover)] hover:bg-[var(--bg-hover)] text-gray-300 border-[var(--bd-strong)]' : 'bg-gray-100 hover:bg-gray-200 text-gray-600 border-pink-200'}`}>ยกเลิก</button>
                    <button onClick={editingAppointment ? confirmUpdateAppointment : confirmCreateNoDeposit} disabled={isGenerating || !noDepositFormData.appointmentDate || !noDepositFormData.appointmentStartTime || !noDepositFormData.appointmentEndTime || !noDepositFormData.advisor || !noDepositFormData.doctor || !noDepositFormData.assistant || !noDepositFormData.room || !noDepositFormData.source || noDepositFormData.visitPurpose.length === 0} className={`flex-1 px-4 py-3 rounded-lg font-bold text-xs uppercase disabled:opacity-50 flex items-center justify-center gap-2 ${isDark ? 'bg-orange-700 hover:bg-orange-600 text-white' : 'bg-pink-500 hover:bg-pink-600 text-white'}`}>
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
      {patientLinkModal && (() => {
        const plSession = sessions.find(s => s.id === patientLinkModal) || archivedSessions.find(s => s.id === patientLinkModal);
        if (!plSession) { setPatientLinkModal(null); return null; }
        const plToken = plSession.patientLinkToken;
        const plEnabled = plSession.patientLinkEnabled;
        return (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-[70]" onClick={() => setPatientLinkModal(null)}>
            <div className="bg-[var(--bg-elevated)] rounded-2xl border border-[var(--bd)] w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200" style={{boxShadow: '0 0 60px rgba(168,85,247,0.15)'}} onClick={e => e.stopPropagation()}>
              {/* Header */}
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
              {/* Body */}
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
      })()}

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

      {/* Deposit Confirm Modal */}
      {depositToDelete && (() => {
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
                <button onClick={() => {
                  setDepositToDelete(null);
                  if (isCancel) { handleDepositCancel(dSess); }
                  else if (isComplete) {
                    updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', dSess.id), {
                      serviceCompleted: true, serviceCompletedAt: serverTimestamp(),
                      isPermanent: false, createdAt: serverTimestamp(),
                    });
                  } else {
                    updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', dSess.id), {
                      isArchived: true, archivedAt: serverTimestamp(),
                    });
                  }
                }} className={`flex-1 px-4 py-3 ${confirmBg} text-white rounded font-bold text-xs ${confirmGlow}`}>{confirmLabel}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Delete Modal */}
      {sessionToDelete && (() => {
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
      })()}

      {/* ── Schedule Link Modal ── */}
      {showScheduleModal && (() => {
        const thaiMo = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
        const monthOptions = [];
        const nowForOpts = new Date();
        for (let i = 0; i < 7; i++) {
          const d = new Date(nowForOpts.getFullYear(), nowForOpts.getMonth() + i, 1);
          const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          const label = `${thaiMo[d.getMonth()]} ${d.getFullYear() + 543}`;
          monthOptions.push({ val, label });
        }

        return (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-[70]" onClick={() => !schedGenLoading && setShowScheduleModal(false)}>
            <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--bd)] w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
              {/* Header */}
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
                  {/* Month + advance */}
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

                  {/* Slot interval + options */}
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
                        <input type="checkbox" checked={schedNoDoctorRequired} onChange={e => { setSchedNoDoctorRequired(e.target.checked); if (e.target.checked) setSchedSelectedDoctor(null); }}
                          className="w-4 h-4 rounded border-[var(--bd)] accent-sky-500" />
                        <span className="text-[11px] text-[var(--tx-body)]">ไม่ต้องพบแพทย์</span>
                      </label>
                    </div>
                  </div>

                  {/* Doctor selector — only when พบแพทย์ */}
                  {!schedNoDoctorRequired && practitioners.filter(p => p.role === 'doctor').length > 0 && (
                    <div>
                      <label className="text-xs text-[var(--tx-muted)] font-bold font-semibold mb-1 block">เลือกแพทย์</label>
                      <select value={schedSelectedDoctor || ''} onChange={e => setSchedSelectedDoctor(e.target.value ? Number(e.target.value) : null)}
                        className={`w-full bg-[var(--bg-hover)] border border-[var(--bd)] rounded-lg px-3 py-2 text-xs text-[var(--tx-body)] ${isDark ? '[color-scheme:dark]' : ''}`}>
                        <option value="">-- แพทย์ทุกคน (รวมนัดแพทย์ทุกคน) --</option>
                        {practitioners.filter(p => p.role === 'doctor').map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Show from option — only relevant if start month is current month */}
                  {(() => { const nowMo = new Date(); const curMo = `${nowMo.getFullYear()}-${String(nowMo.getMonth() + 1).padStart(2, '0')}`; return schedStartMonth === curMo; })() && (
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

                  {/* End date selector */}
                  {(() => {
                    const [sy2, sm2] = schedStartMonth.split('-').map(Number);
                    const lastMo = new Date(sy2, sm2 - 1 + schedAdvanceMonths, 0);
                    const lastMoStr = `${lastMo.getFullYear()}-${String(lastMo.getMonth() + 1).padStart(2, '0')}`;
                    const dimLast = lastMo.getDate();
                    const todayD = new Date();
                    const todayFull = `${todayD.getFullYear()}-${String(todayD.getMonth() + 1).padStart(2, '0')}-${String(todayD.getDate()).padStart(2, '0')}`;
                    const isCurrentMonth = lastMoStr === `${todayD.getFullYear()}-${String(todayD.getMonth() + 1).padStart(2, '0')}`;
                    const minDay = isCurrentMonth ? todayD.getDate() : 1;
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
                  })()}

                  {/* Gen button */}
                  <button onClick={handleGenScheduleLink} disabled={schedGenLoading}
                    className={`w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${schedGenLoading ? (isDark ? 'bg-green-950/30 border border-green-900/40 text-green-500 opacity-70' : 'bg-green-100 border border-green-300 text-green-600 opacity-70') : (isDark ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-pink-500 hover:bg-pink-600 text-white')}`}>
                    {schedGenLoading ? <><RefreshCw size={14} className="animate-spin" /> กำลัง Sync + สร้างลิงก์...</> : <><Link size={14} /> Sync + สร้างลิงก์</>}
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

    </div>
  );
}

// ==========================================
// 7. PATIENT FORM COMPONENT
