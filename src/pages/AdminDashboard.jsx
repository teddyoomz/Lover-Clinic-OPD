import { useState, useEffect, useRef } from 'react';
import { collection, doc, setDoc, getDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { app } from '../firebase.js';
import { signOut } from 'firebase/auth';
import {
  QrCode, Users, PlusCircle, ClipboardList, CheckCircle2, Clock, Activity,
  AlertCircle, Eye, X, FileText, Edit3, TimerOff, Trash2, Phone, HeartPulse,
  Pill, CheckSquare, LogOut, Lock, Flame, Printer, Link, ClipboardCheck,
  Globe, Bell, BellOff, Volume2, Settings, LayoutTemplate, Palette, Archive, History,
  Smartphone, RotateCcw, Timer, Infinity
} from 'lucide-react';
import { DEFAULT_CLINIC_SETTINGS, SESSION_TIMEOUT_MS } from '../constants.js';
import {
  hexToRgb, getReasons, getHrtGoals, calculateADAM, calculateIIEFScore,
  calculateMRS, getIIEFInterpretation, generateClinicalSummary,
  formatPhoneNumberDisplay, renderDobFormat, playNotificationSound, formatBangkokTime
} from '../utils.js';
import ThemeToggle from '../components/ThemeToggle.jsx';
import ClinicLogo from '../components/ClinicLogo.jsx';
import ClinicSettingsPanel from '../components/ClinicSettingsPanel.jsx';
import CustomFormBuilder from '../components/CustomFormBuilder.jsx';

export default function AdminDashboard({ db, appId, user, auth, viewingSession, setViewingSession, setPrintMode, onSimulateScan, clinicSettings = {}, theme, setTheme }) {
  const cs = { ...DEFAULT_CLINIC_SETTINGS, ...clinicSettings };
  const ac = cs.accentColor;
  const acRgb = hexToRgb(ac);
  const [sessions, setSessions] = useState([]);
  const [formTemplates, setFormTemplates] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedQR, setSelectedQR] = useState(null);
  const [sessionToDelete, setSessionToDelete] = useState(null); 
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
  const [adminMode, setAdminMode] = useState('dashboard'); // dashboard, formBuilder

  const [isNotifEnabled, setIsNotifEnabled] = useState(true);
  const [notifVolume, setNotifVolume] = useState(0.5);
  const [showNotifSettings, setShowNotifSettings] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);
  const prevSessionsRef = useRef([]);
  // ป้องกัน auto-sync ซ้ำ: sessionId → JSON string ของ patientData ที่ sync ไปล่าสุด
  // ถ้า snapshot ส่ง patientData เดิมมาอีก (เช่น จาก isUnread=false update) จะไม่ re-trigger
  const lastAutoSyncedStrRef = useRef({}); // dedup auto-sync (ป้องกัน sync ซ้ำ)
  const lastViewedStrRef = useRef({});     // banner suppression (admin เห็นแล้ว → ไม่โชว์ false banner)
  const [hasNewUpdate, setHasNewUpdate] = useState(false);
  const [summaryLang, setSummaryLang] = useState('en');
  const [archivedSessions, setArchivedSessions] = useState([]);
  const [sessionToHardDelete, setSessionToHardDelete] = useState(null);
  const [sessionToRestore, setSessionToRestore] = useState(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [brokerPending, setBrokerPending] = useState({}); // sessionId → true while pending
  const brokerTimers = useRef({}); // sessionId → timeout id

  // *** ใส่ VAPID Key ที่ได้จาก Firebase Console → Project Settings → Cloud Messaging → Web Push certificates ***
  const VAPID_KEY = 'BCCrQVfqNfY2JJQsqrJ0EdU0O1AYV2LOdReWyziuYDO5d2Wm8otNht_oqCwh8qvqTy9SYtdwlGF2XvXWtg1b5ao';

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  // โหลดสถานะ push จาก localStorage
  useEffect(() => {
    if (localStorage.getItem('lc_push_enabled') === 'true') setPushEnabled(true);
  }, []);

  // เคลียร์ brokerStatus: 'pending' ที่ค้างอยู่ใน Firestore ตอน load (ไม่มี timer แล้ว)
  useEffect(() => {
    const allSessions = [...sessions, ...archivedSessions];
    allSessions.forEach(async (s) => {
      if (s.brokerStatus === 'pending' && !brokerTimers.current[s.id]) {
        try {
          await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', s.id), {
            brokerStatus: 'failed',
            brokerError: 'หมดเวลา — ไม่พบ Extension หรือ Extension ไม่ตอบสนอง',
          });
        } catch(e) { console.error('clear stale broker pending:', e); }
      }
    });
  }, [sessions, archivedSessions]); // eslint-disable-line react-hooks/exhaustive-deps

  // รับผลลัพธ์จาก Broker Extension
  useEffect(() => {
    const handler = async (event) => {
      if (!['LC_BROKER_RESULT', 'LC_DELETE_RESULT', 'LC_UPDATE_RESULT'].includes(event.data?.type)) return;
      const { type, sessionId, success, error, proClinicId, proClinicHN } = event.data;

      if (type === 'LC_BROKER_RESULT') {
        // Cancel timeout since we got a real response
        if (brokerTimers.current[sessionId]) {
          clearTimeout(brokerTimers.current[sessionId]);
          delete brokerTimers.current[sessionId];
        }
        setBrokerPending(prev => { const n = { ...prev }; delete n[sessionId]; return n; });
        try {
          const ref = doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', sessionId);
          if (success) {
            await updateDoc(ref, {
              opdRecordedAt: new Date().toISOString(),
              brokerStatus: 'done',
              brokerFilledAt: new Date().toISOString(),
              brokerError: null,
              ...(proClinicId ? { brokerProClinicId: proClinicId } : {}),
              ...(proClinicHN  ? { brokerProClinicHN: proClinicHN }  : {}),
            });
          } else {
            await updateDoc(ref, { brokerStatus: 'failed', brokerError: error || 'ไม่ทราบสาเหตุ' });
          }
        } catch (e) { console.error('broker result update:', e); }
      }

      if (type === 'LC_DELETE_RESULT') {
        try {
          const ref = doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', sessionId);
          if (success) {
            // ── ซ่อนปุ่ม ProClinic ทันที ก่อน Firestore roundtrip ──────────────
            setViewingSession(prev =>
              prev?.id === sessionId
                ? { ...prev, brokerStatus: null, brokerError: null, brokerProClinicId: null, brokerProClinicHN: null, opdRecordedAt: null, brokerLastAutoSyncAt: null }
                : prev
            );
            await updateDoc(ref, { opdRecordedAt: null, brokerStatus: null, brokerError: null, brokerProClinicId: null, brokerProClinicHN: null, brokerLastAutoSyncAt: null });
          } else {
            setToastMsg(`ลบ ProClinic ไม่สำเร็จ: ${error}`);
            setTimeout(() => setToastMsg(null), 5000);
          }
        } catch (e) { console.error('broker delete result:', e); }
      }

      if (type === 'LC_UPDATE_RESULT') {
        // ยกเลิก timeout + clear pending (กรณีที่ triggered มาจาก handleOpdClick กดปุ่มแดง retry)
        // auto-sync ไม่ได้ตั้ง timer ไว้ → cancel เป็น no-op
        if (brokerTimers.current[sessionId]) {
          clearTimeout(brokerTimers.current[sessionId]);
          delete brokerTimers.current[sessionId];
        }
        setBrokerPending(prev => { const n = { ...prev }; delete n[sessionId]; return n; });
        try {
          const ref = doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', sessionId);
          if (success) {
            const syncAt = new Date().toISOString();
            // Immediate UI update ก่อน Firestore roundtrip
            setViewingSession(prev =>
              prev?.id === sessionId
                ? { ...prev, brokerStatus: 'done', brokerError: null, brokerLastAutoSyncAt: syncAt }
                : prev
            );
            await updateDoc(ref, {
              brokerStatus: 'done',
              brokerFilledAt: syncAt,
              brokerLastAutoSyncAt: syncAt,
              brokerError: null,
            });
          } else {
            // Update failed → mark failed so button turns red
            setViewingSession(prev =>
              prev?.id === sessionId
                ? { ...prev, brokerStatus: 'failed', brokerError: `อัปเดต ProClinic ไม่สำเร็จ: ${error || 'ไม่ทราบสาเหตุ'}` }
                : prev
            );
            await updateDoc(ref, { brokerStatus: 'failed', brokerError: `อัปเดต ProClinic ไม่สำเร็จ: ${error || 'ไม่ทราบสาเหตุ'}` });
          }
        } catch (e) { console.error('broker update result:', e); }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [db, appId]);

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
      setToastMsg('เปิดการแจ้งเตือนมือถือสำเร็จ! 📱');
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
    setToastMsg('ปิดการแจ้งเตือนมือถือแล้ว');
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

      // Archived sessions → history page
      setArchivedSessions(
        allDocs
          .filter(s => s.isArchived)
          .sort((a, b) => (b.archivedAt?.toMillis() || b.createdAt?.toMillis() || 0) - (a.archivedAt?.toMillis() || a.createdAt?.toMillis() || 0))
      );

      const data = allDocs.filter(session => {
          if (session.isArchived) return false;
          if (session.isPermanent) return true;
          if (!session.createdAt) return true;
          const createdAtMs = session.createdAt.toMillis();
          return (now - createdAtMs) <= SESSION_TIMEOUT_MS;
        });
      data.sort((a, b) => {
        const timeA = a.updatedAt?.toMillis() || a.createdAt?.toMillis() || 0;
        const timeB = b.updatedAt?.toMillis() || b.createdAt?.toMillis() || 0;
        return timeB - timeA;
      });

      if (prevSessionsRef.current.length > 0) {
        let updatedSessions = [];
        let brokerSyncSessions = [];
        data.forEach(newS => {
          const oldS = prevSessionsRef.current.find(s => s.id === newS.id);
          if (oldS) {
            const oldStr = JSON.stringify(oldS.patientData || {});
            const newStr = JSON.stringify(newS.patientData || {});
            // Only notify when notifications enabled AND session is unread AND patientData changed
            if (isNotifEnabled && newS.isUnread && (!oldS.isUnread || oldStr !== newStr)) {
              updatedSessions.push(newS);
            }
            // ── ตัดสายวงจร: isUnread true→false = admin กด Report ──────────────────
            // snapshot นี้เกิดจาก updateDoc({ isUnread:false }) ของ admin
            // Firestore SDK อาจแนบ patientData เวอร์ชันใหม่จาก local cache มาด้วย
            // ทำให้ oldStr≠newStr แม้ admin ไม่ได้แตะ patientData เลย → ห้าม auto-sync เด็ดขาด
            // stamp lastAutoSyncedStr=newStr เพื่อป้องกัน re-trigger ใน snapshot ถัดไป
            if (oldS.isUnread && !newS.isUnread) {
              lastViewedStrRef.current[newS.id] = newStr;     // banner: admin เห็นแล้ว
              lastAutoSyncedStrRef.current[newS.id] = newStr; // auto-sync dedup
              return; // forEach return = skip to next session (no auto-sync for this snapshot)
            }
            // Auto-sync ProClinic: patientData changed AND session was ALREADY done+linked
            if (
              oldStr !== newStr && newStr !== '{}' && newS.patientData &&
              newS.brokerStatus === 'done' && newS.brokerProClinicId &&
              oldS.brokerStatus === 'done' &&
              oldS.brokerProClinicId === newS.brokerProClinicId &&
              lastAutoSyncedStrRef.current[newS.id] !== newStr
            ) {
              lastAutoSyncedStrRef.current[newS.id] = newStr;
              brokerSyncSessions.push(newS);
            }
          }
        });

        if (isNotifEnabled && updatedSessions.length > 0) {
          playNotificationSound(notifVolume);
          const names = updatedSessions.map(s => s.sessionName || s.patientData?.firstName || s.id).join(', ');
          setToastMsg(`อัปเดตข้อมูลประวัติ: ${names}`);
          setTimeout(() => setToastMsg(null), 5000);
        }

        // Trigger ProClinic auto-sync for changed sessions (ทำงานเสมอ ไม่ขึ้นกับ isNotifEnabled)
        brokerSyncSessions.forEach(session => {
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
            howFoundUs: d?.howFoundUs || [],
            allergies: d?.hasAllergies === 'มี' ? d.allergiesDetail : '',
            underlying: pmh.join(', '),
            emergencyName:     d?.emergencyName     || '',
            emergencyRelation: d?.emergencyRelation || '',
            emergencyPhone:    d?.emergencyPhone    || '',
            clinicalSummary: generateClinicalSummary(d, session.formType || 'intake', session.customTemplate, 'th'),
          };
          window.postMessage({
            type: 'LC_UPDATE_PROCLINIC',
            sessionId: session.id,
            proClinicId: session.brokerProClinicId,
            proClinicHN: session.brokerProClinicHN || null,
            patient,
          }, '*');
        });
      }
      prevSessionsRef.current = data;
      setSessions(data);
    }, (error) => console.error("Firestore Error:", error));
    return () => unsubscribe();
  }, [db, appId, user, isNotifEnabled, notifVolume]);

  useEffect(() => {
    if (viewingSession) {
      const latestSession = sessions.find(s => s.id === viewingSession.id);
      if (latestSession) {
        const currentStr = JSON.stringify(viewingSession.patientData || {});
        const latestStr = JSON.stringify(latestSession.patientData || {});
        // เปรียบเทียบเฉพาะ patientData — ไม่รวม updatedAt เพราะ Firestore serverTimestamp
        // มี 2 snapshots (local estimated + server actual) ทำให้ toMillis() ต่างกัน → false positive banner
        const dataOutOfSync = currentStr !== latestStr;

        // Sync broker fields ให้ viewingSession ทันทีที่ Firestore อัปเดต
        const brokerFields = ['brokerStatus','brokerProClinicId','brokerProClinicHN','brokerError','opdRecordedAt','brokerFilledAt','brokerLastAutoSyncAt'];
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
  }, [sessions, viewingSession]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (formType === 'followup_ed') return <span className="bg-purple-950/50 text-purple-400 border border-purple-900/50 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider whitespace-nowrap inline-block">FOLLOW-UP: IIEF</span>;
    if (formType === 'followup_adam') return <span className="bg-blue-950/50 text-blue-400 border border-blue-900/50 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider whitespace-nowrap inline-block">FOLLOW-UP: ADAM</span>;
    if (formType === 'followup_mrs') return <span className="bg-pink-950/50 text-pink-400 border border-pink-900/50 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider whitespace-nowrap inline-block">FOLLOW-UP: MRS</span>;
    if (formType === 'custom') return <span className="bg-cyan-950/50 text-cyan-400 border border-cyan-900/50 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider whitespace-nowrap inline-block flex items-center gap-1"><LayoutTemplate size={10}/> {customTemplate?.title || 'CUSTOM FORM'}</span>;
    return <span className="bg-gray-800 text-gray-300 border border-gray-700 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider whitespace-nowrap inline-block">INTAKE</span>;
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
      setAdminMode('dashboard');
    }
  };

  const deleteSession = async (sessionId) => {
    setSessionToDelete(null);
    if (selectedQR === sessionId) setSelectedQR(null);
    if (viewingSession && viewingSession.id === sessionId) setViewingSession(null);
    const session = sessions.find(s => s.id === sessionId);
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

  const hardDeleteSession = async (sessionId) => {
    setSessionToHardDelete(null);
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', sessionId));
    } catch (error) { console.error(error); }
  };

  const handleViewSession = async (session) => {
    setViewingSession(session);
    setHasNewUpdate(false);
    if (session.isUnread) {
      // ตัดสายวงจร: mark patientData ปัจจุบันว่า "sync แล้ว" ก่อน write isUnread:false
      // ไม่ว่า LOCAL snapshot จะยิงมาด้วย patientData version ไหน guard จะบล็อกก่อนเสมอ
      // เพราะ isUnread:false ไม่มีส่วนเกี่ยวกับ ProClinic sync เลย
      lastViewedStrRef.current[session.id] = JSON.stringify(session.patientData || {});
      lastAutoSyncedStrRef.current[session.id] = JSON.stringify(session.patientData || {});
      try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', session.id), { isUnread: false });
      } catch(e) { console.error('updateDoc isUnread:', e); }
    }
  };

  const closeViewSession = () => {
    setViewingSession(null);
    setHasNewUpdate(false);
  };

  const getSessionUrl = (sessionId) => `${window.location.origin}${window.location.pathname}?session=${sessionId}`;
  const getQRUrl = (sessionId) => `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(getSessionUrl(sessionId))}&margin=10&color=000000&ecc=Q`;

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
      howFoundUs: d?.howFoundUs || [],
      allergies:  d?.hasAllergies === 'มี' ? d.allergiesDetail : '',
      underlying: pmh.join(', '),
      emergencyName:     d?.emergencyName     || '',
      emergencyRelation: d?.emergencyRelation || '',
      emergencyPhone:    d?.emergencyPhone    || '',
      clinicalSummary: generateClinicalSummary(d, session.formType || 'intake', session.customTemplate, 'th'),
    };

    // Set pending in Firestore + local state
    setBrokerPending(prev => ({ ...prev, [sessionId]: true }));
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', sessionId), {
        brokerStatus: 'pending', brokerError: null,
      });
    } catch(e) { console.error('broker pending update:', e); }

    // Dispatch to extension via postMessage (content script will forward to background)
    // ถ้ามี HN / ProClinic ID อยู่แล้ว → ผู้ป่วยมีอยู่ใน ProClinic แล้ว → ส่ง update ไม่ใช่ fill ใหม่
    const hasExistingProClinic = session.brokerProClinicId || session.brokerProClinicHN;
    if (hasExistingProClinic) {
      window.postMessage({
        type: 'LC_UPDATE_PROCLINIC',
        sessionId,
        proClinicId: session.brokerProClinicId || null,
        proClinicHN:  session.brokerProClinicHN  || null,
        patient,
      }, '*');
    } else {
      window.postMessage({ type: 'LC_FILL_PROCLINIC', sessionId, patient }, '*');
    }

    // ─── 10-second timeout: if no result, mark failed ──────────────────────
    if (brokerTimers.current[sessionId]) clearTimeout(brokerTimers.current[sessionId]);
    brokerTimers.current[sessionId] = setTimeout(async () => {
      delete brokerTimers.current[sessionId];
      setBrokerPending(prev => { const n = { ...prev }; delete n[sessionId]; return n; });
      try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', sessionId), {
          brokerStatus: 'failed',
          brokerError: 'หมดเวลา — ไม่พบ Extension หรือ Extension ไม่ตอบสนอง',
        });
      } catch(e) { console.error('broker timeout update:', e); }
    }, 10000);
  };

  // ─── Manual Resync ─────────────────────────────────────────────────────────
  // เหมือน handleOpdClick แต่ไม่บล็อกเมื่อ done — ใช้กด sync ซ้ำด้วยตนเอง
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
      howFoundUs: d?.howFoundUs || [],
      allergies: d?.hasAllergies === 'มี' ? d.allergiesDetail : '',
      underlying: pmh.join(', '),
      emergencyName:     d?.emergencyName     || '',
      emergencyRelation: d?.emergencyRelation || '',
      emergencyPhone:    d?.emergencyPhone    || '',
      clinicalSummary: generateClinicalSummary(d, session.formType || 'intake', session.customTemplate, 'th'),
    };

    setBrokerPending(prev => ({ ...prev, [sessionId]: true }));
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', sessionId), {
        brokerStatus: 'pending', brokerError: null,
      });
    } catch(e) { console.error('resync pending update:', e); }

    const hasExistingProClinic = session.brokerProClinicId || session.brokerProClinicHN;
    if (hasExistingProClinic) {
      window.postMessage({
        type: 'LC_UPDATE_PROCLINIC',
        sessionId,
        proClinicId: session.brokerProClinicId || null,
        proClinicHN:  session.brokerProClinicHN  || null,
        patient,
      }, '*');
    } else {
      window.postMessage({ type: 'LC_FILL_PROCLINIC', sessionId, patient }, '*');
    }

    if (brokerTimers.current[sessionId]) clearTimeout(brokerTimers.current[sessionId]);
    brokerTimers.current[sessionId] = setTimeout(async () => {
      delete brokerTimers.current[sessionId];
      setBrokerPending(prev => { const n = { ...prev }; delete n[sessionId]; return n; });
      try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', sessionId), {
          brokerStatus: 'failed',
          brokerError: 'หมดเวลา — ไม่พบ Extension หรือ Extension ไม่ตอบสนอง',
        });
      } catch(e) { console.error('resync timeout update:', e); }
    }, 10000);
  };

  const handleProClinicEdit = (session) => {
    const proClinicId = session.brokerProClinicId;
    if (!proClinicId) return;
    window.postMessage({ type: 'LC_OPEN_EDIT_PROCLINIC', proClinicId }, '*');
  };

  const handleProClinicDelete = (session) => {
    const proClinicId = session.brokerProClinicId;
    if (!window.confirm(`ลบลูกค้านี้ออกจาก ProClinic ด้วยใช่ไหม?\n(จะลบเฉพาะใน ProClinic — ข้อมูลใน LoverClinic ยังอยู่)`)) return;
    const d = session.patientData || {};
    const patient = {
      prefix: d.prefix || '', firstName: d.firstName || '',
      lastName: d.lastName || '', phone: d.phone || '',
      emergencyName: d.emergencyName || '', emergencyRelation: d.emergencyRelation || '', emergencyPhone: d.emergencyPhone || '',
    };
    window.postMessage({ type: 'LC_DELETE_PROCLINIC', sessionId: session.id, proClinicId, proClinicHN: session.brokerProClinicHN || null, patient }, '*');
  };

  const activeSessionInfo = selectedQR ? sessions.find(s => s.id === selectedQR) : null;
  const unreadCount = sessions.filter(s => s.isUnread).length;
  const PROCLINIC_ORIGIN = 'https://trial.proclinicth.com';
  const getProClinicUrl = (id) => id ? `${PROCLINIC_ORIGIN}/admin/customer/${id}` : null;

  return (
    <div className="w-full max-w-[1600px] mx-auto p-4 md:p-6 lg:p-8 animate-in fade-in duration-500 overflow-x-hidden">
      
      {toastMsg && (
        <div className="fixed bottom-6 right-6 bg-blue-600 text-white px-5 py-4 rounded-2xl shadow-[0_10px_30px_rgba(37,99,235,0.3)] flex items-center gap-4 animate-in slide-in-from-bottom-5 z-[100] border border-blue-400">
          <div className="bg-white/20 p-2 rounded-full"><Bell size={24} className="animate-bounce" /></div>
          <div><h4 className="font-black text-sm uppercase tracking-wider">มีการอัปเดตข้อมูล</h4><p className="text-xs opacity-90 font-medium">{toastMsg}</p></div>
          <button onClick={() => setToastMsg(null)} className="ml-2 p-1 opacity-50 hover:opacity-100 transition-opacity bg-black/20 rounded-full"><X size={16}/></button>
        </div>
      )}

      <header className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 sm:mb-8 bg-[var(--bg-surface)] p-4 sm:p-5 rounded-2xl sm:rounded-3xl shadow-[var(--shadow-panel)] border border-[var(--bd)] gap-3 relative overflow-visible z-20">
        <div className="absolute top-[-50px] left-[-50px] w-40 h-40 rounded-full blur-[50px] pointer-events-none" style={{backgroundColor: `rgba(${acRgb},0.15)`}}></div>

        {/* ── Row 1: Logo + compact action icons (mobile) ── */}
        <div className="relative flex items-center justify-between w-full md:w-auto gap-3 z-20">
          <div className="flex items-center gap-3">
            <ClinicLogo className="h-8 sm:h-10 max-w-[120px] sm:max-w-[160px] md:max-w-[200px] w-auto" showText={false} clinicSettings={cs} theme={theme} />
            <div className="h-8 w-px bg-[var(--bd)]"></div>
            <p className="text-[10px] sm:text-xs text-[var(--tx-muted)] tracking-wider truncate max-w-[120px] sm:max-w-none">{cs.clinicSubtitle || 'ระบบ OPD รับผู้ป่วย'}</p>
          </div>
          {/* Mobile-only: icon-only actions */}
          <div className="flex items-center gap-1.5 md:hidden shrink-0">
            <button onClick={() => { setSessionModalTab('standard'); setShowSessionModal(true); }} disabled={isGenerating}
              className="p-2.5 rounded-lg text-white flex items-center justify-center disabled:opacity-70 transition-all"
              style={{backgroundColor: ac, boxShadow: `0 0 10px rgba(${acRgb},0.3)`}} title="สร้างคิวใหม่">
              <PlusCircle size={16} />
            </button>
            <div className="relative">
              <button onClick={() => setShowNotifSettings(!showNotifSettings)}
                className={`border p-2.5 rounded-lg transition-all ${isNotifEnabled ? 'bg-blue-950/30 border-blue-900/50 text-blue-500' : 'bg-[var(--bg-input)] border-[var(--bd)] text-[var(--tx-muted)]'}`}>
                {isNotifEnabled ? <Bell size={16} /> : <BellOff size={16} />}
              </button>
              {showNotifSettings && (
                <div className="absolute right-0 top-12 w-64 bg-[#111] border border-[#333] rounded-xl shadow-2xl p-4 z-[200]">
                  <div className="flex items-center justify-between mb-4 border-b border-[#222] pb-2">
                    <h3 className="text-white font-bold text-xs uppercase tracking-widest flex items-center gap-2"><Settings size={14}/> ตั้งค่าแจ้งเตือน</h3>
                    <button onClick={() => setShowNotifSettings(false)} className="text-gray-500 hover:text-white"><X size={14}/></button>
                  </div>
                  <div className="space-y-4">
                    <label className="flex items-center justify-between cursor-pointer group">
                      <span className="text-gray-300 text-sm font-medium group-hover:text-white transition-colors">เสียงและ Pop-up</span>
                      <input type="checkbox" checked={isNotifEnabled} onChange={(e) => setIsNotifEnabled(e.target.checked)} className="w-4 h-4 rounded text-blue-600 bg-black border-[#444] focus:ring-blue-500"/>
                    </label>
                    <div className={`space-y-2 transition-opacity ${isNotifEnabled ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
                      <div className="flex items-center justify-between text-xs text-gray-500 font-bold uppercase tracking-wider">
                        <span>ระดับเสียง</span><span className="text-blue-500">{Math.round(notifVolume * 100)}%</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Volume2 size={16} className="text-gray-400 shrink-0"/>
                        <input type="range" min="0" max="1" step="0.1" value={notifVolume} onChange={(e) => setNotifVolume(parseFloat(e.target.value))} className="w-full accent-blue-600"/>
                      </div>
                      <button onClick={() => playNotificationSound(notifVolume)} className="w-full mt-2 bg-[#1a1a1a] hover:bg-[#222] border border-[#333] text-gray-300 py-2 rounded text-xs font-bold uppercase tracking-widest transition-colors">ทดสอบเสียง</button>
                    </div>
                    <div className="pt-3 border-t border-[#222]">
                      <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5"><Smartphone size={12}/> แจ้งเตือนมือถือ</p>
                      {pushEnabled ? (
                        <button onClick={disablePushNotifications} className="w-full bg-green-950/30 border border-green-900/40 text-green-400 py-2 rounded text-xs font-bold flex items-center justify-center gap-1.5"><CheckCircle2 size={11}/> เปิดอยู่แล้ว — กดเพื่อปิด</button>
                      ) : (
                        <button onClick={enablePushNotifications} disabled={pushLoading} className="w-full bg-[#1a1a1a] hover:bg-[#222] border border-[#333] text-gray-300 py-2 rounded text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors"><Smartphone size={11}/> {pushLoading ? 'กำลังตั้งค่า...' : 'เปิดการแจ้งเตือน'}</button>
                      )}
                      <p className="text-[9px] text-gray-600 mt-1.5">iPhone: ต้อง "เพิ่มลงหน้าจอ" ใน Safari ก่อน</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
            {theme && setTheme && <ThemeToggle theme={theme} setTheme={setTheme} compact />}
            <button onClick={() => signOut(auth)} className="bg-[var(--bg-input)] border border-[var(--bd)] hover:border-red-900/50 text-[var(--tx-muted)] hover:text-red-500 p-2.5 rounded-lg transition-all" title="ออกจากระบบ">
              <LogOut size={16} />
            </button>
          </div>
        </div>

        {/* ── Row 2: Nav tabs — mobile full-width ── */}
        <div className="flex items-stretch gap-1.5 w-full md:hidden z-0">
          <button onClick={() => setAdminMode('dashboard')}
            className={`flex-1 py-2.5 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all relative ${adminMode === 'dashboard' ? '' : 'bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)]'}`}
            style={adminMode === 'dashboard' ? {backgroundColor: ac, color: '#fff', boxShadow: `0 0 12px rgba(${acRgb},0.25)`} : {}}>
            <Activity size={13} /> หน้าคิว
            {unreadCount > 0 && <span className="absolute -top-1.5 -right-1 bg-red-500 text-white text-[8px] font-black rounded-full min-w-[16px] h-4 px-0.5 flex items-center justify-center leading-none">{unreadCount > 99 ? '99+' : unreadCount}</span>}
          </button>
          <button onClick={() => setAdminMode('formBuilder')}
            className={`flex-1 py-2.5 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${adminMode === 'formBuilder' ? 'bg-blue-600 text-white shadow-[0_0_12px_rgba(37,99,235,0.3)]' : 'bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)]'}`}>
            <LayoutTemplate size={13} /> จัดการ
          </button>
          <button onClick={() => setAdminMode('clinicSettings')}
            className={`flex-1 py-2.5 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${adminMode === 'clinicSettings' ? '' : 'bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)]'}`}
            style={adminMode === 'clinicSettings' ? {backgroundColor: ac, color: '#fff', boxShadow: `0 0 12px rgba(${acRgb},0.25)`} : {}}>
            <Palette size={13} /> ตั้งค่า
          </button>
          <button onClick={() => setAdminMode('history')}
            className={`flex-1 py-2.5 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${adminMode === 'history' ? 'bg-amber-700 text-white' : 'bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)]'}`}>
            <History size={13} /> ประวัติ
          </button>
        </div>

        {/* ── Desktop: full button row ── */}
        <div className="hidden md:flex items-center gap-2 z-10">
          <button onClick={() => setAdminMode('dashboard')} className={`px-4 py-3 rounded-lg font-bold tracking-wider uppercase text-xs transition-all flex items-center justify-center gap-2 relative ${adminMode === 'dashboard' ? '' : 'bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-white'}`} style={adminMode === 'dashboard' ? {backgroundColor: ac, color: '#fff', boxShadow: `0 0 15px rgba(${acRgb},0.3)`} : {}}>
            <Activity size={16} /> หน้าคิว
            {unreadCount > 0 && <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[8px] font-black rounded-full min-w-[16px] h-4 px-0.5 flex items-center justify-center leading-none">{unreadCount > 99 ? '99+' : unreadCount}</span>}
          </button>
          <button onClick={() => setAdminMode('formBuilder')} className={`px-4 py-3 rounded-lg font-bold tracking-wider uppercase text-xs transition-all flex items-center justify-center gap-2 ${adminMode === 'formBuilder' ? 'bg-blue-600 shadow-[0_0_15px_rgba(37,99,235,0.3)]' : 'bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-white hover:border-blue-500'}`} style={adminMode === 'formBuilder' ? {color: '#fff'} : {}}>
            <LayoutTemplate size={16} /> จัดการแบบฟอร์ม
          </button>
          <button onClick={() => setAdminMode('clinicSettings')} className={`px-4 py-3 rounded-lg font-bold tracking-wider uppercase text-xs transition-all flex items-center justify-center gap-2 ${adminMode === 'clinicSettings' ? '' : 'bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-white'}`} style={adminMode === 'clinicSettings' ? {backgroundColor: ac, color: '#fff', boxShadow: `0 0 15px rgba(${acRgb},0.3)`} : {}} title="ตั้งค่าระบบ">
            <Palette size={16} /> ตั้งค่า
          </button>
          <button onClick={() => setAdminMode('history')} className={`px-4 py-3 rounded-lg font-bold tracking-wider uppercase text-xs transition-all flex items-center justify-center gap-2 ${adminMode === 'history' ? 'bg-amber-700 text-white shadow-[0_0_15px_rgba(180,83,9,0.4)]' : 'bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-amber-400 hover:border-amber-900/50'}`} title="ประวัติผู้ป่วย">
            <History size={16} /> ประวัติ
          </button>
          <div className="h-8 w-px bg-[var(--bd)] mx-2"></div>
          <button onClick={() => { setSessionModalTab('standard'); setShowSessionModal(true); }} disabled={isGenerating} className="bg-[#1a1a1a] hover:bg-[#222] border border-[#333] text-white px-3 py-3 rounded-lg font-bold tracking-wider uppercase text-xs transition-all flex items-center justify-center gap-2 disabled:opacity-70">
            <PlusCircle size={16} /> สร้างคิวใหม่
          </button>
          <div className="relative flex-none">
            <button onClick={() => setShowNotifSettings(!showNotifSettings)} className={`border p-3 rounded-lg font-semibold transition-all shadow-sm ${isNotifEnabled ? 'bg-blue-950/30 border-blue-900/50 text-blue-500 hover:bg-blue-900/50' : 'bg-[#141414] border-[#333] text-gray-500 hover:bg-[#222]'}`} title="ตั้งค่าการแจ้งเตือน">
              {isNotifEnabled ? <Bell size={16} /> : <BellOff size={16} />}
            </button>
            {showNotifSettings && (
              <div className="absolute right-0 top-14 w-64 bg-[#111] border border-[#333] rounded-xl shadow-2xl p-4 z-[200] animate-in slide-in-from-top-2">
                <div className="flex items-center justify-between mb-4 border-b border-[#222] pb-2">
                  <h3 className="text-white font-bold text-xs uppercase tracking-widest flex items-center gap-2"><Settings size={14}/> ตั้งค่าแจ้งเตือน</h3>
                  <button onClick={() => setShowNotifSettings(false)} className="text-gray-500 hover:text-white"><X size={14}/></button>
                </div>
                <div className="space-y-4">
                  <label className="flex items-center justify-between cursor-pointer group">
                    <span className="text-gray-300 text-sm font-medium group-hover:text-white transition-colors">เสียงและ Pop-up</span>
                    <input type="checkbox" checked={isNotifEnabled} onChange={(e) => setIsNotifEnabled(e.target.checked)} className="w-4 h-4 rounded text-blue-600 bg-black border-[#444] focus:ring-blue-500"/>
                  </label>
                  <div className={`space-y-2 transition-opacity ${isNotifEnabled ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
                    <div className="flex items-center justify-between text-xs text-gray-500 font-bold uppercase tracking-wider">
                      <span>ระดับเสียง</span>
                      <span className="text-blue-500">{Math.round(notifVolume * 100)}%</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Volume2 size={16} className="text-gray-400 shrink-0"/>
                      <input type="range" min="0" max="1" step="0.1" value={notifVolume} onChange={(e) => setNotifVolume(parseFloat(e.target.value))} className="w-full accent-blue-600"/>
                    </div>
                    <button onClick={() => playNotificationSound(notifVolume)} className="w-full mt-2 bg-[#1a1a1a] hover:bg-[#222] border border-[#333] text-gray-300 py-2 rounded text-xs font-bold uppercase tracking-widest transition-colors">ทดสอบเสียง</button>
                  </div>
                  <div className="pt-3 border-t border-[#222]">
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5"><Smartphone size={12}/> แจ้งเตือนมือถือ</p>
                    {pushEnabled ? (
                      <button onClick={disablePushNotifications} className="w-full bg-green-950/30 border border-green-900/40 text-green-400 py-2 rounded text-xs font-bold flex items-center justify-center gap-1.5"><CheckCircle2 size={11}/> เปิดอยู่แล้ว — กดเพื่อปิด</button>
                    ) : (
                      <button onClick={enablePushNotifications} disabled={pushLoading} className="w-full bg-[#1a1a1a] hover:bg-[#222] border border-[#333] text-gray-300 py-2 rounded text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors"><Smartphone size={11}/> {pushLoading ? 'กำลังตั้งค่า...' : 'เปิดการแจ้งเตือน'}</button>
                    )}
                    <p className="text-[9px] text-gray-600 mt-1.5">iPhone: ต้อง "เพิ่มลงหน้าจอ" ใน Safari ก่อน</p>
                  </div>
                </div>
              </div>
            )}
          </div>
          {theme && setTheme && <ThemeToggle theme={theme} setTheme={setTheme} />}
          <button onClick={() => signOut(auth)} className="bg-[var(--bg-input)] hover:bg-[var(--bg-hover)] border border-[var(--bd)] hover:border-red-900/50 text-[var(--tx-muted)] hover:text-red-500 p-3 rounded-lg font-semibold transition-all shadow-sm flex-none" title="ออกจากระบบ">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {adminMode === 'clinicSettings' ? (
        <ClinicSettingsPanel db={db} appId={appId} clinicSettings={cs} onBack={() => setAdminMode('dashboard')} theme={theme} setTheme={setTheme} />
      ) : adminMode === 'formBuilder' ? (
        <CustomFormBuilder db={db} appId={appId} user={user} onBack={() => setAdminMode('dashboard')} />
      ) : adminMode === 'history' ? (
        <div className="bg-[var(--bg-card)] rounded-2xl sm:rounded-3xl shadow-xl border border-[var(--bd)] overflow-hidden">
          {/* Header */}
          <div className="p-5 sm:p-6 border-b border-[var(--bd)] flex items-center gap-3">
            <History size={20} className="text-amber-500" />
            <h2 className="text-base sm:text-lg font-bold tracking-widest uppercase text-amber-500">ประวัติผู้ป่วย (Archive)</h2>
            <span className="ml-auto text-xs text-[var(--tx-muted)] font-bold">{archivedSessions.length} รายการ</span>
          </div>

          {/* Card list */}
          <div className="divide-y divide-[var(--bd)]">
            {archivedSessions.length === 0 ? (
              <div className="p-16 text-center text-gray-600 flex flex-col items-center gap-4">
                <History size={36} className="opacity-20 text-amber-600" />
                <p className="text-xs tracking-wider uppercase font-bold">ไม่มีประวัติในระบบ</p>
              </div>
            ) : archivedSessions.map(session => {
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
                    <div className="flex items-center gap-1.5 shrink-0">
                      {d && (
                        <button onClick={() => { setViewingSession(session); setAdminMode('dashboard'); }}
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
                              isDone    ? 'bg-[var(--opd-btn-bg)] text-[var(--opd-color)] border-[var(--opd-bd-str)] shadow-[0_0_8px_rgba(20,184,166,0.2)] cursor-not-allowed opacity-80' :
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
                      <button onClick={() => setSessionToHardDelete(session.id)}
                        className="p-2 bg-red-950/30 hover:bg-red-900/50 text-red-500 rounded-lg border border-red-900/50 transition-colors" title="ลบถาวร">
                        <Trash2 size={15}/>
                      </button>
                    </div>
                  </div>

                  {/* Row 2: timestamps */}
                  <div className="flex flex-wrap items-center gap-3">
                    {tsArchived && (
                      <span className="text-[10px] text-amber-600 flex items-center gap-1 font-mono">
                        <Archive size={9}/> เก็บ: {tsArchived}
                      </span>
                    )}
                    {tsSubmitted && (
                      <span className="text-[10px] text-green-600 flex items-center gap-1 font-mono">
                        <CheckCircle2 size={9}/> กรอก: {tsSubmitted}
                      </span>
                    )}
                    {tsUpdated && (
                      <span className="text-[10px] text-blue-500 flex items-center gap-1 font-mono">
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
                        {isPerf && <Flame size={14} className="text-red-500 drop-shadow-[0_0_5px_rgba(220,38,38,0.8)]" />}
                        {isHrt && <Activity size={14} className="text-orange-500 drop-shadow-[0_0_5px_rgba(249,115,22,0.8)]" />}
                      </div>
                      <div className="flex flex-wrap gap-2 text-[10px] text-gray-500 font-mono uppercase tracking-wider">
                        <span>อายุ: {d.age || '-'} ปี</span>
                        {d.phone && <span>โทร: {formatPhoneNumberDisplay(d.phone, d.isInternationalPhone, d.phoneCountryCode)}</span>}
                      </div>
                      {reasons.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {reasons.map(r => (
                            <span key={r} className="text-[10px] font-bold text-gray-300 bg-[var(--bg-hover)] px-2 py-0.5 rounded-lg border border-[var(--bd)] whitespace-nowrap">
                              {r === 'อื่นๆ' ? `อื่นๆ: ${d.visitReasonOther}` : r}
                            </span>
                          ))}
                        </div>
                      )}
                      {d.hasAllergies === 'มี' && (
                        <span className="text-[10px] text-red-400 flex items-center gap-1.5 font-bold uppercase tracking-wider border border-red-900/50 bg-red-950/20 px-2 py-1 rounded-lg w-fit">
                          <AlertCircle size={10}/> แพ้: {d.allergiesDetail}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-gray-600 text-xs italic">ไม่มีข้อมูล</span>
                  )}

                  {/* Row 4: OPD badge */}
                  {session.opdRecordedAt && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--opd-bg)] border border-[var(--opd-bd)] w-full">
                      <ClipboardCheck size={13} className="text-[var(--opd-color)] shrink-0" />
                      <div className="flex flex-col min-w-0 gap-0.5">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--opd-color)]">บันทึกลง OPD Card เรียบร้อย</span>
                        <span className="text-[9px] text-[var(--opd-color)] font-mono flex items-center gap-1.5">
                          {formatBangkokTime(session.opdRecordedAt)}
                          {session.brokerProClinicHN && <span className="px-1 py-px rounded bg-[var(--opd-btn-bg)] border border-[var(--opd-bd)] font-black tracking-wider">HN {session.brokerProClinicHN}</span>}
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
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 xl:gap-8">
          <div className="xl:col-span-1">
            <div className="bg-[var(--bg-surface)] p-4 sm:p-6 lg:p-8 rounded-2xl sm:rounded-3xl border border-[var(--bd)] text-center sticky top-8 shadow-[var(--shadow-panel)] flex flex-col items-center">
              <h2 className="text-sm sm:text-base font-bold tracking-widest uppercase mb-4 sm:mb-6 flex items-center justify-center gap-2 text-gray-400 w-full">
                <QrCode size={18} style={{color: ac}} /> QR Code / ลิงก์
              </h2>
              {selectedQR ? (
                <div className="space-y-4 sm:space-y-6 flex flex-col items-center animate-in zoom-in duration-300 w-full px-2 sm:px-0">
                  <div className="p-3 sm:p-4 bg-white rounded-3xl w-full aspect-square max-w-[360px] mx-auto flex items-center justify-center overflow-hidden" style={{boxShadow: `0 0 40px rgba(${acRgb},0.25)`}}>
                    <img src={getQRUrl(selectedQR)} alt="Auth QR" className="w-full h-full object-contain" />
                  </div>
                  <div className="w-full text-center">
                    <h3 className="text-xl sm:text-2xl font-black text-[var(--tx-heading)] mb-1">{activeSessionInfo?.sessionName || 'ไม่มีชื่อคิว'}</h3>
                  </div>
                  <div className="w-full text-left">
                    <p className="text-[10px] sm:text-xs text-[var(--tx-muted)] tracking-widest uppercase mb-1.5">รหัสคิว (Token)</p>
                    <p className="font-mono text-xl sm:text-2xl font-black tracking-widest bg-[var(--bg-input)] px-4 py-3 rounded-xl border border-[var(--bd)] shadow-inner text-center break-all" style={{color: ac}}>{selectedQR}</p>
                  </div>
                  <div className="w-full text-left">
                    <p className="text-[10px] sm:text-xs text-[var(--tx-muted)] tracking-widest uppercase mb-1.5">คัดลอกลิงก์ (Copy Link)</p>
                    <div className="flex items-center gap-2">
                      <input readOnly value={getSessionUrl(selectedQR)} className="flex-1 bg-[var(--bg-input)] border border-[var(--bd)] text-[var(--tx-muted)] text-[10px] sm:text-xs p-3 sm:p-3.5 rounded-xl outline-none font-mono" />
                      <button onClick={() => handleCopyToClipboard(getSessionUrl(selectedQR), true)} className="bg-[var(--bg-hover)] hover:bg-[var(--bg-hover2)] p-3 sm:p-3.5 rounded-xl border border-[var(--bd)] text-[var(--tx-heading)] transition-colors flex-shrink-0" title="คัดลอกลิงก์">
                        {isLinkCopied ? <CheckCircle2 size={18} className="text-green-500" /> : <ClipboardList size={18} />}
                      </button>
                    </div>
                  </div>
                  <div className="w-full h-px bg-[var(--bd)] my-2"></div>
                  <button onClick={() => onSimulateScan(selectedQR)} className="w-full bg-[var(--bg-hover)] hover:bg-[var(--bg-hover2)] border border-[var(--bd)] text-[var(--tx-heading)] py-3.5 sm:py-4 rounded-xl text-xs sm:text-sm font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2">
                    <Eye size={16}/> จำลองหน้าจอมือถือ
                  </button>
                </div>
              ) : (
                <div className="py-20 w-full text-gray-600 flex flex-col items-center bg-[var(--bg-elevated)] rounded-2xl border border-dashed border-[var(--bd)]">
                  <Flame size={48} className="mb-4 opacity-20 text-red-500" />
                  <p className="text-xs sm:text-sm uppercase tracking-widest text-center px-4 leading-relaxed font-bold">กดสร้างคิวใหม่ด้านบน<br/>เพื่อแสดง QR Code และลิงก์</p>
                </div>
              )}
            </div>
          </div>

          <div className="xl:col-span-3 h-full">
            <div className="bg-[var(--bg-surface)] rounded-2xl sm:rounded-3xl shadow-[var(--shadow-panel)] border border-[var(--bd)] overflow-hidden h-full flex flex-col">
              <div className="p-5 sm:p-6 border-b border-[var(--bd)] flex items-center gap-3 bg-[var(--bg-elevated)]">
                <Activity size={20} style={{color: ac}} />
                <h2 className="text-base sm:text-lg font-bold tracking-widest uppercase text-[var(--tx-heading)]">รายการคิวผู้ป่วย</h2>
              </div>
              {/* ── CARDS (all sizes) ── */}
              <div className="flex-1 divide-y divide-[var(--bd)]">
                {sessions.length === 0 ? (
                  <div className="p-16 text-center text-gray-600 flex flex-col items-center gap-4">
                    <Activity size={36} className="opacity-20" />
                    <p className="text-xs tracking-wider uppercase font-bold">ไม่มีรายการในขณะนี้</p>
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
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-600 text-white font-black uppercase tracking-widest animate-pulse shadow-[0_0_8px_rgba(220,38,38,0.8)] shrink-0">New</span>
                              )}
                              <span className="font-bold text-[var(--tx-heading)] text-sm truncate max-w-[160px]">{session.sessionName || 'ไม่ระบุชื่อ'}</span>
                              <button onClick={() => handleEditName(session.id, session.sessionName)} className="text-gray-600 hover:text-blue-400 shrink-0"><Edit3 size={12} /></button>
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`font-mono text-xs font-bold bg-[var(--bg-hover)] px-2 py-1 rounded-lg border border-[var(--bd)] ${session.isPermanent ? 'text-orange-500' : 'text-red-500'}`}>{session.id}</span>
                            {getBadgeForFormType(formType, session.customTemplate)}
                          </div>
                        </div>
                        {/* Action buttons */}
                        <div className="flex items-center gap-2 shrink-0">
                          <button onClick={() => setSelectedQR(session.id)} className="p-2 bg-[var(--bg-hover)] hover:bg-[var(--bg-input)] text-gray-400 hover:text-[var(--tx-heading)] rounded-lg border border-[var(--bd)] transition-colors" title="QR"><QrCode size={15} /></button>
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
                                  isDone    ? 'bg-[var(--opd-btn-bg)] text-[var(--opd-color)] border-[var(--opd-bd-str)] shadow-[0_0_8px_rgba(20,184,166,0.2)] cursor-not-allowed opacity-80' :
                                  isPending ? 'bg-amber-950/20 text-amber-400 border-amber-700/50 animate-pulse' :
                                  isFailed  ? 'bg-red-950/20 text-red-400 border-red-700/50' :
                                  'bg-[var(--bg-card)] text-[var(--tx-muted)] border-dashed border-[var(--bd)] hover:border-[var(--opd-bd-str)] hover:text-[var(--opd-color)]'
                                }`}
                              ><ClipboardCheck size={15} /></button>
                            );
                          })()}
                          <button onClick={() => setSessionToDelete(session.id)} className="p-2 bg-red-950/30 hover:bg-red-900/50 text-red-500 rounded-lg border border-red-900/50 transition-colors" title="ลบ"><Trash2 size={15} /></button>
                        </div>
                      </div>
                      {/* Row 2: time + QR timestamp */}
                      <div className="flex flex-wrap items-center gap-3">
                        <span className={`text-[10px] flex items-center gap-1 font-bold uppercase tracking-wider ${isLowTime ? 'text-red-500 animate-pulse' : 'text-gray-500'}`}>
                          {session.isPermanent ? <Link size={11} /> : <Clock size={11} />} {timeLeftStr}
                        </span>
                        {session.createdAt && (
                          <span className="text-[10px] text-gray-600 flex items-center gap-1 font-mono">
                            <QrCode size={9}/> {formatBangkokTime(session.createdAt)}
                          </span>
                        )}
                      </div>
                      {/* Row 3: patient info */}
                      {data ? (
                        <div className="flex flex-col gap-2 bg-[var(--bg-card)] rounded-xl p-3 border border-[var(--bd)]">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-[var(--tx-heading)] text-sm">{data.prefix !== 'ไม่ระบุ' ? data.prefix : ''} {data.firstName} {data.lastName}</span>
                            {isPerf && <Flame size={14} className="text-red-500 drop-shadow-[0_0_5px_rgba(220,38,38,0.8)]" />}
                            {isHrt && <Activity size={14} className="text-orange-500 drop-shadow-[0_0_5px_rgba(249,115,22,0.8)]" />}
                          </div>
                          <div className="flex flex-wrap gap-2 text-[10px] text-gray-500 font-mono uppercase tracking-wider">
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
                                  <span key={r} className="text-[10px] font-bold text-gray-300 bg-[var(--bg-hover)] px-2 py-0.5 rounded-lg border border-[var(--bd)] whitespace-nowrap">
                                    {r === 'อื่นๆ' ? `อื่นๆ: ${data.visitReasonOther}` : r}
                                  </span>
                                ))}
                              </div>
                              {isHrt && getHrtGoals(data).length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {getHrtGoals(data).map(g => (
                                    <span key={g} className="text-[10px] font-bold text-orange-400 border border-orange-900/30 bg-orange-950/20 px-2 py-0.5 rounded-md">
                                      {g === 'ฮอร์โมนเพื่อการข้ามเพศ' ? 'ข้ามเพศ' : g}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {data.hasAllergies === 'มี' && (
                                <span className="text-[10px] text-red-400 flex items-center gap-1 font-bold uppercase tracking-wider border border-red-900/50 bg-red-950/20 px-2 py-0.5 rounded-lg w-fit">
                                  <AlertCircle size={10}/> แพ้: {data.allergiesDetail}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-600 text-xs italic uppercase tracking-wider">รอผู้ป่วยกรอกข้อมูล...</span>
                      )}
                      {/* Row 4: status */}
                      <div className="flex flex-wrap items-center gap-2">
                        {session.status === 'completed' ? (
                          <>
                            {session.updatedAt ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest bg-blue-950/40 text-blue-400 border border-blue-900/50 whitespace-nowrap">
                                <Edit3 size={11} /> มีการแก้ไข
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest bg-green-950/40 text-green-500 border border-green-900/50 whitespace-nowrap">
                                <CheckCircle2 size={11} /> รับข้อมูลแล้ว
                              </span>
                            )}
                            {session.updatedAt && formatBangkokTime(session.updatedAt) && (
                              <span className="text-[10px] text-blue-400 flex items-center gap-1 font-mono">
                                <Edit3 size={9}/> {formatBangkokTime(session.updatedAt)}
                              </span>
                            )}
                            {!session.updatedAt && session.submittedAt && (
                              <span className="text-[10px] text-green-500 flex items-center gap-1 font-mono">
                                <CheckCircle2 size={9}/> {formatBangkokTime(session.submittedAt)}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest bg-orange-950/30 text-orange-500 border border-orange-900/50 whitespace-nowrap">
                            <Clock size={11} /> กำลังรอ
                          </span>
                        )}
                      </div>
                      {/* OPD Recorded Badge */}
                      {session.opdRecordedAt && (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--opd-bg)] border border-[var(--opd-bd)] w-full">
                          <ClipboardCheck size={14} className="text-[var(--opd-color)] shrink-0" />
                          <div className="flex flex-col min-w-0 gap-0.5">
                            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--opd-color)]">บันทึกลง OPD Card เรียบร้อย</span>
                            <span className="text-[9px] text-[var(--opd-color)] font-mono flex items-center gap-1.5">
                              {formatBangkokTime(session.opdRecordedAt)}
                                {session.brokerProClinicHN && <span className="px-1 py-px rounded bg-[var(--opd-btn-bg)] border border-[var(--opd-bd)] font-black tracking-wider">HN {session.brokerProClinicHN}</span>}
                              {session.brokerProClinicId && (
                                <a href={getProClinicUrl(session.brokerProClinicId)} target="_blank" rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  className="px-1 py-px rounded border border-emerald-800/50 text-emerald-500 hover:text-emerald-300 font-black tracking-wider text-[8px] transition-colors"
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
        const d = viewingSession.patientData;
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
          <div className="bg-[#0a0a0a] rounded-xl shadow-[0_0_50px_rgba(220,38,38,0.15)] border border-[#222] w-full max-w-5xl max-h-[95vh] flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden relative">
            
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
                      lastViewedStrRef.current[latest.id] = JSON.stringify(latest.patientData || {});
                      lastAutoSyncedStrRef.current[latest.id] = JSON.stringify(latest.patientData || {});
                      updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', latest.id), { isUnread: false }).catch(console.error);
                    }
                  }
                }} className="bg-white text-blue-700 px-4 py-1.5 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-widest shadow-sm hover:bg-blue-50 transition-colors w-full sm:w-auto">
                  ✓ รับทราบ
                </button>
              </div>
            )}

            <div className="px-4 py-3 border-b border-[#222] flex flex-wrap items-center gap-x-3 gap-y-2 shrink-0 bg-[#111]">
              {/* Title — grows to fill space, buttons wrap below if needed */}
              <div className="flex items-center gap-2.5 flex-1 min-w-[140px]">
                <div className={`p-1.5 rounded bg-black border shrink-0 ${isCustom ? 'border-cyan-900/50 text-cyan-500' : isPerf || isHrt ? 'border-red-900/50 text-red-500' : 'border-[#333] text-gray-300'}`}>
                  {isCustom ? <LayoutTemplate size={16}/> : isPerf ? <Flame size={16} /> : <FileText size={16} />}
                </div>
                <div className="min-w-0">
                  <h3 className="font-black text-white uppercase tracking-widest text-xs sm:text-sm leading-tight">
                    {isCustom ? `แบบฟอร์ม: ${viewingSession.customTemplate?.title}` : isFollowUp ? 'แบบรายงานติดตาม' : 'ประวัติผู้ป่วย OPD'}
                  </h3>
                  <p className="text-[9px] text-red-500 font-mono tracking-widest mt-0.5">ID: {viewingSession.id}</p>
                </div>
              </div>

              {/* Buttons — always full labels, wrap to next line when space is tight */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button onClick={() => { closeViewSession(); onSimulateScan(viewingSession.id, { suppressNotif: true }); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-950/30 hover:bg-blue-900/50 text-blue-400 rounded border border-blue-900/50 transition-colors text-[10px] font-bold uppercase tracking-widest whitespace-nowrap">
                  <Edit3 size={13} /> แก้ไขข้อมูล
                </button>
                {(() => {
                  const isPending = brokerPending[viewingSession.id] || viewingSession.brokerStatus === 'pending';
                  return (
                    <button
                      onClick={() => handleResync(viewingSession)}
                      disabled={isPending}
                      title="บันทึกข้อมูลลง ProClinic อีกครั้ง (manual resync)"
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded border transition-all text-[10px] font-bold uppercase tracking-widest whitespace-nowrap ${
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
                {!isCustom && (
                  <>
                    <button onClick={() => setPrintMode('dashboard')}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1a1a] hover:bg-[#222] text-gray-300 rounded border border-[#333] transition-colors text-[10px] font-bold uppercase tracking-widest whitespace-nowrap">
                      <Printer size={13} /> พิมพ์สรุป A4
                    </button>
                    <button onClick={() => setPrintMode('official')}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-950/30 hover:bg-red-900/50 text-red-500 rounded border border-red-900/50 transition-colors text-[10px] font-bold uppercase tracking-widest shadow-[0_0_10px_rgba(220,38,38,0.2)] whitespace-nowrap">
                      <Printer size={13} /> พิมพ์ฟอร์มมาตรฐาน
                    </button>
                  </>
                )}
                {(() => {
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
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded border transition-all text-[10px] font-bold uppercase tracking-widest whitespace-nowrap ${
                        isPending ? 'bg-amber-950/20 text-amber-400 border-amber-700/50 animate-pulse' :
                        isDone    ? 'bg-[var(--opd-btn-bg)] text-[var(--opd-color)] border-[var(--opd-bd-str)] shadow-[0_0_8px_rgba(20,184,166,0.2)] cursor-not-allowed opacity-80' :
                        isFailed  ? 'bg-red-950/20 text-red-400 border-red-700/50' :
                        viewingSession.opdRecordedAt ? 'bg-[var(--opd-btn-bg)] text-[var(--opd-color)] border-[var(--opd-bd-str)] shadow-[0_0_12px_rgba(20,184,166,0.2)]' :
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
                }} className="p-1.5 bg-[#1a1a1a] hover:bg-red-600 text-gray-400 hover:text-white rounded border border-[#333] hover:border-red-600 transition-all shrink-0">
                  <X size={16} />
                </button>
              </div>
            </div>
            
            {viewingSession.opdRecordedAt && (
              <div className="px-4 sm:px-6 py-3 bg-[var(--opd-bg)] border-b border-[var(--opd-bd)] flex items-center gap-3 shrink-0 flex-wrap">
                <div className="p-1.5 rounded-lg bg-[var(--opd-btn-bg)] border border-[var(--opd-bd)]">
                  <ClipboardCheck size={16} className="text-[var(--opd-color)]" />
                </div>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-widest text-[var(--opd-color)]">บันทึกลง ProClinic เรียบร้อยแล้ว</p>
                  <p className="text-[10px] text-[var(--opd-color)] font-mono mt-0.5 flex items-center gap-1.5 flex-wrap">
                    บันทึกเมื่อ: {formatBangkokTime(viewingSession.opdRecordedAt)}
                    {viewingSession.brokerProClinicHN && (
                      <span className="px-1.5 py-0.5 rounded bg-[var(--opd-btn-bg)] border border-[var(--opd-bd)] text-[var(--opd-color)] font-black tracking-wider">
                        HN {viewingSession.brokerProClinicHN}
                      </span>
                    )}
                  </p>
                  {viewingSession.brokerLastAutoSyncAt && (
                    <p className="text-[9px] text-[var(--opd-color)] opacity-70 font-mono mt-0.5 flex items-center gap-1">
                      🔄 แก้ไขและ sync ProClinic อัตโนมัติ · {formatBangkokTime(viewingSession.brokerLastAutoSyncAt)}
                    </p>
                  )}
                </div>
                <div className="ml-auto flex items-center gap-2 flex-wrap">
                  {viewingSession.brokerProClinicId && (<>
                    <a href={getProClinicUrl(viewingSession.brokerProClinicId)} target="_blank" rel="noopener noreferrer"
                      className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded border border-emerald-700/50 text-emerald-400 hover:bg-emerald-900/30 transition-colors whitespace-nowrap flex items-center gap-1"
                      title={getProClinicUrl(viewingSession.brokerProClinicId)}>
                      ProClinic ↗
                    </a>
                    <button onClick={() => handleProClinicEdit(viewingSession)}
                      className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded border border-blue-700/50 text-blue-400 hover:bg-blue-900/30 transition-colors whitespace-nowrap">
                      แก้ไขใน ProClinic
                    </button>
                    <button onClick={() => handleProClinicDelete(viewingSession)}
                      className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded border border-red-700/50 text-red-400 hover:bg-red-900/30 transition-colors whitespace-nowrap">
                      ลบจาก ProClinic
                    </button>
                  </>)}
                </div>
              </div>
            )}
            {viewingSession.brokerStatus === 'failed' && (
              <div className="px-4 sm:px-6 py-3 bg-red-950/20 border-b border-red-900/40 flex items-center gap-3 shrink-0">
                <X size={16} className="text-red-400 shrink-0" />
                <p className="text-[11px] font-bold text-red-400">ส่งข้อมูลไป ProClinic ไม่สำเร็จ: {viewingSession.brokerError}</p>
                <button
                  onClick={() => handleOpdClick(viewingSession)}
                  className="ml-auto text-[9px] font-black uppercase tracking-widest text-red-400 hover:text-red-300 whitespace-nowrap border border-red-800 px-2 py-1 rounded"
                >ลองใหม่</button>
              </div>
            )}
            <div className="p-4 md:p-6 overflow-y-auto bg-[var(--bg-base)] flex-1 custom-scrollbar">
              <div className={`grid grid-cols-1 ${isFollowUp || isCustom ? '' : 'md:grid-cols-2'} gap-6`}>
                
                <div className="space-y-6">
                  <div className="bg-[#0f0f0f] p-4 sm:p-5 rounded-xl border border-[#1a1a1a] shadow-inner relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-red-600"></div>
                    <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-[#222] pb-2 mb-4">ข้อมูลส่วนตัว</h4>
                    <div className="space-y-3 text-sm">
                      <div className="grid grid-cols-3 gap-2"><span className="text-gray-500">ชื่อ-สกุล:</span><span className="col-span-2 font-bold text-white break-words">{d.prefix !== 'ไม่ระบุ' ? d.prefix : ''} {d.firstName} {d.lastName}</span></div>
                      <div className="grid grid-cols-3 gap-2"><span className="text-gray-500">เพศ:</span><span className="col-span-2 font-bold text-white">{d.gender || '-'}</span></div>
                      <div className="grid grid-cols-3 gap-2"><span className="text-gray-500">วันเกิด:</span><span className="col-span-2 font-bold text-white">{renderDobFormat(d)} <span className="text-red-500 font-mono text-xs ml-2">[{d.age} ปี]</span></span></div>
                      
                      {(isFollowUp || isCustom) && (
                        <div className="grid grid-cols-3 gap-2"><span className="text-gray-500">วันที่ประเมิน:</span><span className="col-span-2 font-bold text-orange-400">{d.assessmentDate || '-'}</span></div>
                      )}

                      {!isFollowUp && !isCustom && (
                        <>
                          <div className="grid grid-cols-3 gap-2"><span className="text-gray-500">โทรศัพท์:</span><span className="col-span-2 font-bold text-white font-mono break-all">{formatPhoneNumberDisplay(d.phone, d.isInternationalPhone, d.phoneCountryCode)}</span></div>
                          <div className="grid grid-cols-3 gap-2"><span className="text-gray-500">ที่อยู่:</span><span className="col-span-2 font-bold text-gray-300 text-xs leading-relaxed break-words">{d.address || '-'}</span></div>
                        </>
                      )}
                    </div>
                  </div>

                  {!isFollowUp && !isCustom && (
                    <div className="bg-[#140a0a] p-4 sm:p-5 rounded-xl border border-orange-900/30">
                      <h4 className="text-[10px] font-black text-orange-600 uppercase tracking-widest border-b border-orange-900/30 pb-2 mb-4">ติดต่อฉุกเฉิน</h4>
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
                    <div className="bg-[#0f0f0f] p-4 sm:p-5 rounded-xl border border-[#1a1a1a] shadow-inner relative overflow-hidden h-full">
                      <div className="absolute top-0 left-0 w-1 h-full bg-gray-700"></div>
                      <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-[#222] pb-2 mb-4">ข้อมูลสุขภาพพื้นฐาน</h4>
                      <div className="mb-5">
                        <span className="text-xs text-gray-500 block mb-2">สาเหตุที่มาพบแพทย์</span>
                        <div className="flex flex-col gap-2 font-black text-white bg-[#1a1a1a] p-3 rounded border border-[#333] uppercase tracking-wider text-sm border-l-2 border-l-red-600 mb-2">
                          {reasons.map(r => (
                            <div key={r} className="break-words">• {r === 'อื่นๆ' ? `อื่นๆ: ${d.visitReasonOther}` : r}</div>
                          ))}
                        </div>
                        {isHrt && goals.length > 0 && (
                          <div className="bg-[#141414] p-3 rounded border border-[#333] mt-2">
                            <span className="text-[10px] text-gray-500 uppercase block mb-2">เป้าหมายการเสริมฮอร์โมน</span>
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
                        <div className={`p-3 rounded border ${d.hasAllergies === 'มี' ? 'bg-red-950/20 border-red-900/50' : 'bg-[#141414] border-[#222]'}`}>
                          <span className={`text-[10px] uppercase tracking-widest block mb-1 ${d.hasAllergies === 'มี' ? 'text-red-500' : 'text-gray-500'}`}>ประวัติแพ้ยา/อาหาร</span>
                          <span className={`font-bold text-sm break-words ${d.hasAllergies === 'มี' ? 'text-red-400' : 'text-gray-300'}`}>{d.hasAllergies === 'มี' ? d.allergiesDetail : 'ไม่มี'}</span>
                        </div>
                        <div className={`p-3 rounded border ${d.hasUnderlying === 'มี' ? 'bg-orange-950/20 border-orange-900/50' : 'bg-[#141414] border-[#222]'}`}>
                          <span className={`text-[10px] uppercase tracking-widest block mb-1 ${d.hasUnderlying === 'มี' ? 'text-orange-500' : 'text-gray-500'}`}>โรคประจำตัว</span>
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
                        <div className="p-3 bg-[#141414] rounded border border-[#222]">
                          <span className="text-[10px] text-gray-500 uppercase tracking-widest block mb-1">ยาที่ใช้ประจำ</span>
                          <span className="font-bold text-sm text-gray-300 break-words">{d.currentMedication || 'ไม่มี'}</span>
                        </div>
                        {d.howFoundUs && d.howFoundUs.length > 0 && (
                          <div className="p-3 bg-[#0d1117] rounded border border-blue-900/30">
                            <span className="text-[10px] text-blue-500 uppercase tracking-widest block mb-2 flex items-center gap-1"><Globe size={10}/> รู้จักคลินิกจาก</span>
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
                <div className="mt-6 bg-[#0a0a0a] p-5 sm:p-8 rounded-2xl border border-cyan-900/40 relative overflow-hidden">
                  <div className="absolute top-0 right-0 bg-cyan-900 text-white px-4 py-2 rounded-bl-2xl font-black text-xs tracking-widest shadow-lg">CUSTOM</div>
                  <h4 className="text-[10px] font-black text-cyan-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                    <LayoutTemplate size={12}/> แบบฟอร์ม: {viewingSession.customTemplate.title}
                  </h4>
                  <div className="space-y-4">
                    {viewingSession.customTemplate.questions.map((q, idx) => {
                      const answer = d[q.id];
                      let displayAns = '-';
                      if (Array.isArray(answer)) displayAns = answer.length > 0 ? answer.join(', ') : '-';
                      else if (answer) displayAns = answer;

                      return (
                        <div key={q.id} className="bg-[#111] p-4 rounded-xl border border-[#222]">
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
                    <div className="bg-[#0f0f0f] p-4 sm:p-5 rounded-xl border border-[#222]">
                       <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <span className="w-2 h-2 bg-red-600 rounded-full"></span> การประเมินส่วนที่ 1: อาการเบื้องต้น
                      </h4>
                      <div className="flex items-center justify-between border-b border-[#1a1a1a] pb-2">
                        <span className="text-gray-300 font-medium text-sm">มีอาการหลั่งเร็ว / หลั่งไวร่วมด้วย</span>
                        {d.symp_pe ? <span className="font-black text-red-500 bg-red-950/30 px-3 py-1 rounded border border-red-900/50 text-sm">มีอาการ</span> : <span className="text-[#555] font-mono text-sm">ไม่มี</span>}
                      </div>
                    </div>
                  )}

                  {showAdam && (() => {
                    const adamRes = calculateADAM(d);
                    return (
                      <div className="bg-[#0f0f0f] p-4 sm:p-5 rounded-xl border border-[#222]">
                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                          <span className="w-2 h-2 bg-red-600 rounded-full"></span> {isFollowUp ? 'แบบประเมินติดตามอาการ' : `การประเมินส่วนที่ ${isPerf ? '2' : '1'}`}: พร่องฮอร์โมนเพศชาย (ADAM)
                        </h4>
                        <div className={`p-4 rounded-lg border mb-5 flex items-center justify-between ${adamRes.bg}`}>
                          <div className="flex-1 pr-2">
                            <span className="text-[10px] uppercase tracking-widest text-gray-500 block">ผลการประเมิน</span>
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
                            <div key={idx} className="flex items-start justify-between border-b border-[#1a1a1a] pb-1.5 gap-4">
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
                         <h4 className="text-[10px] font-black text-pink-500 uppercase tracking-widest mb-6 flex items-center gap-2 drop-shadow-[0_0_5px_rgba(236,72,153,0.8)]">
                          <Activity size={12}/> {isFollowUp ? 'แบบประเมินติดตามอาการ' : 'การประเมินส่วนที่ 1'}: อาการวัยทอง (MRS)
                        </h4>
                        <div className="flex flex-col md:flex-row gap-6 items-center md:items-stretch relative z-10">
                          <div className="flex flex-col items-center justify-center p-6 bg-black rounded-xl border border-[#333] w-full md:min-w-[180px] md:w-auto shadow-inner">
                            <span className="text-[10px] font-bold text-gray-500 tracking-widest uppercase mb-2">คะแนนรวม</span>
                            <div className="flex items-baseline gap-1 mb-3">
                              <span className={`text-5xl sm:text-6xl font-black ${mrsRes.color} leading-none`}>{mrsRes.score}</span>
                              <span className="text-lg font-bold text-[#333]">/ 44</span>
                            </div>
                            <div className={`px-4 py-1.5 rounded text-[10px] sm:text-xs tracking-widest uppercase border text-center whitespace-nowrap ${mrsRes.bg} ${mrsRes.color}`}>
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
                              <div key={idx} className="flex items-center justify-between bg-[#0f0f0f] p-2 sm:px-3 rounded border border-[#222] gap-2">
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
                      <div className="bg-gradient-to-br from-[#1a0505] to-[#0a0a0a] p-4 sm:p-6 rounded-xl border border-red-900/50 shadow-[0_0_30px_rgba(220,38,38,0.05)] relative overflow-hidden">
                        <Flame className="absolute bottom-[-20px] right-[-20px] w-48 h-48 text-red-600 opacity-5 pointer-events-none" />
                        <h4 className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-6 flex items-center gap-2 drop-shadow-[0_0_5px_rgba(220,38,38,0.8)]">
                          <Flame size={12}/> {isFollowUp ? 'แบบประเมินติดตามอาการ' : 'ส่วนที่ 3'}: ความเสื่อมสมรรถภาพทางเพศ (IIEF-5)
                        </h4>
                        <div className="flex flex-col md:flex-row gap-6 items-center md:items-stretch relative z-10">
                          <div className="flex flex-col items-center justify-center p-6 bg-black rounded-xl border border-[#333] w-full md:min-w-[180px] md:w-auto shadow-inner">
                            <span className="text-[10px] font-bold text-gray-500 tracking-widest uppercase mb-2">คะแนนรวม</span>
                            <div className="flex items-baseline gap-1 mb-3">
                              <span className={`text-5xl sm:text-6xl font-black ${interp.color} leading-none`}>{iiefScore}</span>
                              <span className="text-lg font-bold text-[#333]">/ 25</span>
                            </div>
                            <div className={`px-4 py-1.5 rounded text-[10px] sm:text-xs tracking-widest uppercase border text-center ${interp.bg} ${interp.color}`}>
                              {interp.text}
                            </div>
                          </div>
                          <div className="flex-1 w-full space-y-3">
                            {[
                              { q: 'Q1. ความมั่นใจในการแข็งตัว', v: d.iief_1 }, { q: 'Q2. แข็งตัวพอที่จะสอดใส่', v: d.iief_2 },
                              { q: 'Q3. คงความแข็งตัวระหว่างมีเพศสัมพันธ์', v: d.iief_3 }, { q: 'Q4. คงความแข็งตัวจนเสร็จกิจ', v: d.iief_4 },
                              { q: 'Q5. ความพึงพอใจในการมีเพศสัมพันธ์', v: d.iief_5 }
                            ].map((item, idx) => (
                              <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between bg-[#0f0f0f] p-3 rounded border border-[#222] gap-2">
                                <span className="text-xs text-gray-300 font-medium leading-snug">{item.q}</span>
                                <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                                  <span className="text-[10px] text-gray-600 uppercase font-mono sm:hidden">คะแนน</span>
                                  <span className="text-lg font-black text-red-500 bg-[#1a0505] w-8 h-8 flex items-center justify-center rounded border border-red-900/30 shrink-0">{item.v || 0}</span>
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

              <div className="mt-8 pt-6 border-t border-[#222] relative">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-3">
                  <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    <FileText size={14} className="text-blue-500 shrink-0" /> สรุปประวัติผู้ป่วย (Clinical Summary)
                  </h4>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    {/* Language toggle */}
                    <div className="flex bg-[#1a1a1a] border border-[#333] rounded overflow-hidden text-[10px] font-bold uppercase tracking-widest">
                      <button onClick={() => setSummaryLang('en')} className="px-3 py-1.5 transition-colors" style={summaryLang === 'en' ? {backgroundColor: ac, color: '#fff'} : {color: '#6b7280'}}>EN</button>
                      <button onClick={() => setSummaryLang('th')} className="px-3 py-1.5 transition-colors" style={summaryLang === 'th' ? {backgroundColor: ac, color: '#fff'} : {color: '#6b7280'}}>TH</button>
                    </div>
                    <button onClick={() => handleCopyToClipboard(clinicalSummaryText, false)} className={`flex flex-1 sm:flex-none justify-center items-center gap-1.5 px-3 py-1.5 border rounded text-[10px] uppercase font-bold tracking-widest transition-colors ${isCopied ? 'bg-green-950/40 text-green-500 border-green-900/50' : 'bg-[#1a1a1a] hover:bg-[#222] text-gray-300 border-[#333]'}`}>
                      {isCopied ? <CheckCircle2 size={12} /> : <ClipboardList size={12} />}
                      {isCopied ? 'คัดลอกสำเร็จ' : 'คัดลอกข้อความ'}
                    </button>
                  </div>
                </div>
                <textarea readOnly value={clinicalSummaryText} className="w-full bg-[#111] border border-[#222] text-gray-300 rounded-lg p-3 sm:p-4 text-[10px] sm:text-xs font-mono resize-none outline-none custom-scrollbar leading-relaxed" rows="8"/>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Unified Create Session Modal */}
      {showSessionModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
           <div className="bg-[#0a0a0a] rounded-xl shadow-[0_0_40px_rgba(0,0,0,0.8)] border border-[#222] w-full max-w-2xl overflow-hidden animate-in zoom-in-95">
              <div className="flex border-b border-[#222]">
                 <button onClick={() => setSessionModalTab('standard')} className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest transition-colors border-b-2 ${sessionModalTab === 'standard' ? 'bg-[#111]' : 'text-gray-500 hover:text-gray-300 border-transparent'}`} style={sessionModalTab === 'standard' ? {color: ac, borderColor: ac} : {}}>ฟอร์มมาตรฐาน</button>
                 <button onClick={() => setSessionModalTab('custom')} className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2 ${sessionModalTab === 'custom' ? 'bg-[#111] text-blue-500 border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-300'}`}>แบบฟอร์มสร้างเอง</button>
              </div>

              <div className="p-6 max-h-[60vh] overflow-y-auto">
                 {sessionModalTab === 'standard' ? (
                   <div className="space-y-4">
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <button onClick={() => openNamePrompt({isPermanent: false, formType: 'intake'})} className="p-4 bg-[#141414] hover:bg-[#1a1a1a] border border-[#333] text-left rounded-lg transition-all group" onMouseEnter={e => e.currentTarget.style.borderColor = ac} onMouseLeave={e => e.currentTarget.style.borderColor = '#333'}>
                          <span className="block text-gray-200 font-bold transition-colors" style={{}}>แบบบันทึก OPD (Intake)</span>
                          <span className="text-[10px] text-gray-500 mt-1 block">กรอกประวัติผู้ป่วยใหม่ (หมดอายุ 2 ชม.)</span>
                        </button>
                        <button onClick={() => openNamePrompt({isPermanent: true, formType: 'intake'})} className="p-4 bg-[#141414] hover:bg-[#1a1a1a] border border-[#333] text-left rounded-lg transition-all group" onMouseEnter={e => e.currentTarget.style.borderColor = ac} onMouseLeave={e => e.currentTarget.style.borderColor = '#333'}>
                          <span className="block text-gray-200 font-bold flex items-center gap-1"><Link size={12}/> ลิงก์ถาวร</span>
                          <span className="text-[10px] text-gray-500 mt-1 block">คิวไม่หมดอายุ ใช้แปะหน้าเพจได้</span>
                        </button>
                     </div>
                     <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest pt-4 border-t border-[#222]">ติดตามอาการ (Follow-up) - ลิงก์ถาวร</h4>
                     <div className="grid grid-cols-1 gap-3">
                         <button onClick={() => openNamePrompt({isPermanent: true, formType: 'followup_ed'})} className="w-full p-4 bg-[#141414] hover:bg-[#1a1a1a] border border-[#333] hover:border-orange-500 text-left rounded-lg transition-all group">
                            <span className="block text-gray-200 font-bold group-hover:text-orange-400 transition-colors">1. เสื่อมสมรรถภาพทางเพศ (ชาย)</span>
                            <span className="text-[10px] text-gray-500 mt-1 block">ประเมินผลด้วย IIEF-5 Score</span>
                         </button>
                         <button onClick={() => openNamePrompt({isPermanent: true, formType: 'followup_adam'})} className="w-full p-4 bg-[#141414] hover:bg-[#1a1a1a] border border-[#333] hover:border-orange-500 text-left rounded-lg transition-all group">
                            <span className="block text-gray-200 font-bold group-hover:text-orange-400 transition-colors">2. ภาวะพร่องฮอร์โมน (ชาย)</span>
                            <span className="text-[10px] text-gray-500 mt-1 block">ประเมินผลด้วย ADAM Score</span>
                         </button>
                         <button onClick={() => openNamePrompt({isPermanent: true, formType: 'followup_mrs'})} className="w-full p-4 bg-[#141414] hover:bg-[#1a1a1a] border border-[#333] hover:border-orange-500 text-left rounded-lg transition-all group">
                            <span className="block text-gray-200 font-bold group-hover:text-orange-400 transition-colors">3. อาการวัยทอง (หญิง)</span>
                            <span className="text-[10px] text-gray-500 mt-1 block">ประเมินผลด้วย MRS Score</span>
                         </button>
                     </div>
                   </div>
                 ) : (
                   <div className="space-y-4">
                     {formTemplates.length === 0 ? (
                       <div className="text-center py-8 text-gray-500 text-sm">
                         ยังไม่มีแบบฟอร์ม <button onClick={() => {setShowSessionModal(false); setAdminMode('formBuilder');}} className="text-blue-500 underline ml-1">สร้างแบบฟอร์มใหม่</button>
                       </div>
                     ) : (
                       <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                         {formTemplates.map(tpl => (
                           <div key={tpl.id} className="bg-[#141414] border border-[#333] rounded-lg p-4 flex flex-col justify-between">
                             <div>
                               <h4 className="text-white font-bold text-sm mb-1">{tpl.title}</h4>
                               <p className="text-gray-500 text-xs mb-3 truncate">{tpl.description}</p>
                             </div>
                             <div className="flex gap-2 mt-2">
                               <button onClick={() => openNamePrompt({isPermanent: false, formType: 'custom', customTemplate: tpl})} className="flex-1 py-2 rounded text-xs font-bold transition-all border" style={{background:'transparent', borderColor:`${ac}66`, color:ac}} onMouseEnter={e=>{e.currentTarget.style.background=ac;e.currentTarget.style.borderColor=ac;e.currentTarget.style.color='#fff'}} onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.borderColor=`${ac}66`;e.currentTarget.style.color=ac}}>คิว 2 ชม.</button>
                               <button onClick={() => openNamePrompt({isPermanent: true, formType: 'custom', customTemplate: tpl})} className="flex-1 py-2 rounded text-xs font-bold transition-all border flex items-center justify-center gap-1" style={{background:ac, borderColor:ac, color:'#fff'}} onMouseEnter={e=>{e.currentTarget.style.opacity='0.85'}} onMouseLeave={e=>{e.currentTarget.style.opacity='1'}}><Link size={10}/> ถาวร</button>
                             </div>
                           </div>
                         ))}
                       </div>
                     )}
                   </div>
                 )}
              </div>
              <div className="p-4 bg-[#111] border-t border-[#222]">
                 <button onClick={() => setShowSessionModal(false)} className="w-full py-3 bg-transparent text-gray-500 hover:text-white text-xs font-bold uppercase tracking-widest">ยกเลิก</button>
              </div>
           </div>
        </div>
      )}

      {/* Name Prompt Modal for New Session */}
      {showNamePrompt && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[70]">
          <div className="bg-[#0a0a0a] rounded-xl w-full max-w-md p-6 text-center animate-in zoom-in-95" style={{boxShadow: `0 0 40px rgba(${acRgb},0.2)`, border: `1px solid rgba(${acRgb},0.3)`}}>
            <h3 className="text-lg font-black text-white uppercase tracking-wider mb-2">ตั้งชื่อคิว / Note</h3>
            <p className="text-gray-500 mb-4 text-xs uppercase tracking-widest leading-relaxed">
              กรุณาระบุชื่อหรือหมายเหตุ<br/>เพื่อให้ง่ายต่อการค้นหา
            </p>
            <input type="text" autoFocus value={sessionNameInput} onChange={(e) => setSessionNameInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && confirmCreateSession()} placeholder="เช่น คุณ A, เคส 001" className="w-full bg-[#141414] border border-[#333] text-white rounded-lg px-4 py-3 outline-none mb-6 text-sm" onFocus={e => { e.target.style.borderColor = ac; }} onBlur={e => { e.target.style.borderColor = '#333'; }} />
            <div className="flex gap-3">
              <button onClick={() => setShowNamePrompt(false)} className="flex-1 px-4 py-3 bg-[#1a1a1a] hover:bg-[#222] text-gray-300 rounded font-bold text-xs uppercase tracking-wider border border-[#333]">ยกเลิก</button>
              <button onClick={confirmCreateSession} disabled={isGenerating} className="flex-1 px-4 py-3 rounded font-bold text-xs uppercase tracking-wider disabled:opacity-70" style={{backgroundColor: ac, color: '#fff', boxShadow: `0 0 15px rgba(${acRgb},0.4)`}}>
                {isGenerating ? 'กำลังสร้าง...' : 'สร้างคิว'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hard Delete Modal (from History) */}
      {sessionToHardDelete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-[#0a0a0a] rounded-xl border border-red-900/50 w-full max-w-sm overflow-hidden p-6 text-center" style={{boxShadow: '0 0 40px rgba(220,38,38,0.2)'}}>
            <div className="w-16 h-16 bg-red-950/50 text-red-500 rounded-full border border-red-900/50 flex items-center justify-center mx-auto mb-4"><Trash2 size={24}/></div>
            <h3 className="text-base sm:text-lg font-black text-white mb-2">ลบถาวร?</h3>
            <p className="text-red-400 font-bold text-xs mb-1">⚠ ไม่สามารถกู้คืนได้อีก</p>
            <p className="text-gray-500 mb-6 text-xs leading-relaxed">กำลังลบถาวร<br/><span className="font-mono text-sm text-red-400">{sessionToHardDelete}</span></p>
            <div className="flex gap-3">
              <button onClick={() => setSessionToHardDelete(null)} className="flex-1 px-4 py-3 bg-[#1a1a1a] hover:bg-[#222] text-gray-300 rounded font-bold text-xs border border-[#333]">ยกเลิก</button>
              <button onClick={() => hardDeleteSession(sessionToHardDelete)} className="flex-1 px-4 py-3 bg-red-700 hover:bg-red-600 text-white rounded font-bold text-xs">ลบถาวร</button>
            </div>
          </div>
        </div>
      )}

      {/* Restore to Queue Modal */}
      {sessionToRestore && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-[#0a0a0a] rounded-2xl border border-[#222] w-full max-w-sm overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)]">
            <div className="px-6 pt-6 pb-4 border-b border-[#1a1a1a]">
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 rounded-xl bg-orange-950/40 border border-orange-800/40"><RotateCcw size={18} className="text-orange-400" /></div>
                <div>
                  <h3 className="text-sm font-black text-white tracking-wide">กลับเข้าคิวใหม่</h3>
                  <p className="text-[10px] text-orange-400 font-mono mt-0.5">ID: {sessionToRestore.id}</p>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-3 leading-relaxed">เลือกประเภทลิงก์ — <span className="text-white font-bold">QR Code / Session ID เดิม</span> จะถูกใช้ต่อเนื่อง</p>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <button onClick={() => restoreToQueue(sessionToRestore.id, 'timed')}
                className="flex items-center gap-4 p-4 bg-[#0f0f0f] hover:bg-[#141414] border border-[#222] hover:border-orange-900/50 rounded-xl transition-all text-left group">
                <div className="p-2.5 rounded-xl bg-orange-950/30 border border-orange-900/30 group-hover:border-orange-700/50 transition-colors shrink-0">
                  <Timer size={18} className="text-orange-400" />
                </div>
                <div>
                  <p className="text-sm font-black text-white">ลิงก์ 2 ชั่วโมง</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">นับเวลาใหม่จากตอนนี้ — หมดอายุอัตโนมัติ</p>
                </div>
              </button>
              <button onClick={() => restoreToQueue(sessionToRestore.id, 'permanent')}
                className="flex items-center gap-4 p-4 bg-[#0f0f0f] hover:bg-[#141414] border border-[#222] hover:border-blue-900/50 rounded-xl transition-all text-left group">
                <div className="p-2.5 rounded-xl bg-blue-950/30 border border-blue-900/30 group-hover:border-blue-700/50 transition-colors shrink-0">
                  <Infinity size={18} className="text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-black text-white">ลิงก์ถาวร</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">ไม่มีวันหมดอายุ — ใช้ได้จนกว่าจะลบ</p>
                </div>
              </button>
              <button onClick={() => setSessionToRestore(null)}
                className="w-full px-4 py-2.5 bg-[#141414] hover:bg-[#1a1a1a] text-gray-500 hover:text-gray-300 rounded-xl font-bold text-xs border border-[#222] transition-colors">
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {sessionToDelete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-[#0a0a0a] rounded-xl border border-red-900/50 w-full max-w-sm overflow-hidden p-6 text-center" style={{boxShadow: `0 0 40px rgba(${acRgb},0.15)`}}>
            <div className="w-16 h-16 bg-red-950/50 text-red-500 rounded-full border border-red-900/50 flex items-center justify-center mx-auto mb-4" style={{boxShadow: '0 0 15px rgba(220,38,38,0.4)'}}><Trash2 size={24} /></div>
            <h3 className="text-base sm:text-lg font-black text-white mb-2">ยืนยันการลบข้อมูล?</h3>
            <p className="text-gray-500 mb-6 text-xs leading-relaxed">กำลังลบข้อมูลคิว <br/><span className="font-mono text-sm" style={{color: ac}}>{sessionToDelete}</span><br/>ข้อมูลนี้จะไม่สามารถกู้คืนได้</p>
            <div className="flex gap-3">
              <button onClick={() => setSessionToDelete(null)} className="flex-1 px-4 py-3 bg-[#1a1a1a] hover:bg-[#222] text-gray-300 rounded font-bold text-xs border border-[#333]">ยกเลิก</button>
              <button onClick={() => deleteSession(sessionToDelete)} className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded font-bold text-xs shadow-[0_0_15px_rgba(220,38,38,0.3)]">ยืนยันการลบ</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ==========================================
// 7. PATIENT FORM COMPONENT
