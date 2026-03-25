import { useState, useEffect } from 'react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { ArrowLeft, Printer } from 'lucide-react';
import { auth, db, appId } from './firebase.js';
import { DEFAULT_CLINIC_SETTINGS } from './constants.js';
import { applyThemeColor, hexToRgb } from './utils.js';
import { useTheme } from './hooks/useTheme.js';
import { OfficialOPDPrint, DashboardOPDPrint } from './components/PrintTemplates.jsx';
import AdminLogin from './pages/AdminLogin.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import PatientForm from './pages/PatientForm.jsx';
import PatientDashboard from './pages/PatientDashboard.jsx';

export default function App() {
  const { theme, setTheme } = useTheme();
  const [user, setUser] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [printMode, setPrintMode] = useState(null);
  const [viewingSession, setViewingSession] = useState(null);
  const [adminView, setAdminView] = useState('dashboard');
  const [simulatedSessionId, setSimulatedSessionId] = useState(null);
  const [simulationSuppressNotif, setSimulationSuppressNotif] = useState(false);
  const [clinicSettings, setClinicSettings] = useState(() => ({
    ...DEFAULT_CLINIC_SETTINGS,
    clinicName: localStorage.getItem('clinic-name') || DEFAULT_CLINIC_SETTINGS.clinicName,
  }));
  const [clinicSettingsLoaded, setClinicSettingsLoaded] = useState(false);

  const params = new URLSearchParams(window.location.search);
  const sessionFromUrl = params.get('session');
  const patientFromUrl = params.get('patient');

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'clinic_settings', 'main'), (snap) => {
      setClinicSettingsLoaded(true);
      if (snap.exists()) {
        const data = snap.data();
        const merged = { ...DEFAULT_CLINIC_SETTINGS, ...data };
        if (merged.clinicName) localStorage.setItem('clinic-name', merged.clinicName);
        setClinicSettings(merged);
        applyThemeColor(merged.accentColor || DEFAULT_CLINIC_SETTINGS.accentColor);
      } else {
        applyThemeColor(DEFAULT_CLINIC_SETTINGS.accentColor);
      }
    }, () => { setClinicSettingsLoaded(true); applyThemeColor(DEFAULT_CLINIC_SETTINGS.accentColor); });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => { setUser(u); setIsInitializing(false); });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (sessionFromUrl && !user && !isInitializing) {
      signInAnonymously(auth).catch(err => console.error('Anonymous Auth Error:', err));
    }
  }, [sessionFromUrl, user, isInitializing]);

  useEffect(() => {
    const handler = () => setPrintMode(null);
    window.addEventListener('afterprint', handler);
    return () => window.removeEventListener('afterprint', handler);
  }, []);

  // Auto-reload เมื่อ deploy version ใหม่ (poll ทุก 60 วิ)
  useEffect(() => {
    let baseline = null;
    const check = async () => {
      try {
        const res = await fetch('/version.json?t=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) return;
        const { v } = await res.json();
        if (v === 'dev') return; // dev mode ไม่ reload
        if (baseline === null) { baseline = v; return; }
        if (v !== baseline) window.location.reload();
      } catch { /* network error — skip */ }
    };
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, []);

  const ac = clinicSettings.accentColor || '#dc2626';
  const acRgb = hexToRgb(ac);

  if (isInitializing) {
    return <div className="flex items-center justify-center min-h-screen bg-[#050505] font-medium tracking-widest uppercase animate-pulse" style={{color: ac}}>กำลังโหลดระบบ {clinicSettings.clinicName}...</div>;
  }

  if (patientFromUrl) {
    const isAdminView = params.get('admin') === '1';
    return (
      <div className="min-h-screen bg-[#050505] font-sans text-gray-200">
        <PatientDashboard token={patientFromUrl} clinicSettings={clinicSettings} clinicSettingsLoaded={clinicSettingsLoaded} theme={theme} setTheme={setTheme} isAdminView={isAdminView} />
      </div>
    );
  }

  if (sessionFromUrl) {
    return (
      <div className="min-h-screen bg-[var(--bg-base)] font-sans text-gray-200" style={{['--selection-bg']: `rgba(${acRgb},0.4)`}}>
        <PatientForm db={db} appId={appId} user={user} sessionId={sessionFromUrl} isSimulation={false} clinicSettings={clinicSettings} theme={theme} setTheme={setTheme} />
      </div>
    );
  }

  if (!user || user.isAnonymous) {
    return <AdminLogin auth={auth} clinicSettings={clinicSettings} theme={theme} setTheme={setTheme} />;
  }

  return (
    <>
      <div className={`min-h-screen bg-[#050505] font-sans text-gray-200 ${printMode !== null ? 'hidden' : 'block print:hidden'}`}>
        {/* AdminDashboard stays mounted always — keeps Firestore listener alive for auto-sync */}
        <div className={adminView === 'simulation' ? 'hidden' : ''}>
          <AdminDashboard
            db={db} appId={appId} user={user} auth={auth}
            viewingSession={viewingSession} setViewingSession={setViewingSession}
            setPrintMode={setPrintMode}
            clinicSettings={clinicSettings}
            theme={theme} setTheme={setTheme}
            onSimulateScan={(id, opts) => { setSimulatedSessionId(id); setSimulationSuppressNotif(!!opts?.suppressNotif); setAdminView('simulation'); }}
          />
        </div>
        {adminView === 'simulation' && (
          <PatientForm
            db={db} appId={appId} user={user} sessionId={simulatedSessionId} isSimulation={true}
            suppressNotif={simulationSuppressNotif}
            onBack={() => setAdminView('dashboard')} clinicSettings={clinicSettings}
            theme={theme} setTheme={setTheme}
          />
        )}
      </div>

      {printMode !== null && viewingSession && (
        <div className="bg-white text-black w-full" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
          <div className="print:hidden sticky top-0 z-50 flex items-center gap-3 px-5 py-3 bg-gray-100 border-b border-gray-200 shadow-sm">
            <button onClick={() => setPrintMode(null)} className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 rounded-lg border border-gray-300 text-sm font-semibold transition-all shadow-sm active:scale-95">
              <ArrowLeft size={16} /> ย้อนกลับ
            </button>
            <span className="text-gray-400 text-sm">|</span>
            <span className="text-gray-600 text-sm font-medium">
              {printMode === 'official' ? 'บันทึก OPD' : 'สรุป OPD (A4)'} — {viewingSession?.sessionId || ''}
            </span>
            <div className="flex-1" />
            <button onClick={() => window.print()} className="flex items-center gap-2 px-5 py-2 bg-gray-900 hover:bg-black text-white rounded-lg text-sm font-semibold transition-all shadow-sm active:scale-95">
              <Printer size={15} /> พิมพ์
            </button>
          </div>
          {printMode === 'official'
            ? <OfficialOPDPrint session={viewingSession} clinicSettings={clinicSettings} />
            : <DashboardOPDPrint session={viewingSession} clinicSettings={clinicSettings} />}
        </div>
      )}
    </>
  );
}
