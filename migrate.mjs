// Migration script: splits App.jsx into separate files
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const src = readFileSync('src/App.jsx', 'utf8');
const lines = src.split('\n');

// Helper: extract lines [from, to] inclusive (1-based)
const extract = (from, to) => lines.slice(from - 1, to).join('\n');

// ── 1. firebase.js ─────────────────────────────────────────────────────────
writeFileSync('src/firebase.js', `import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCYJzM-88rNe9CbOMypN3K2n_Y8j61BdDc",
  authDomain: "genform-2f3f3.firebaseapp.com",
  projectId: "genform-2f3f3",
  storageBucket: "genform-2f3f3.firebasestorage.app",
  messagingSenderId: "149469865438",
  appId: "1:149469865438:web:104cc4cd4da01adfc6294f",
  measurementId: "G-JNBP7WCTJ2"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const appId = 'loverclinic-opd-4c39b';
`);
console.log('✓ firebase.js');

// ── 2. constants.js ───────────────────────────────────────────────────────
writeFileSync('src/constants.js', `export const SESSION_TIMEOUT_MS = 2 * 60 * 60 * 1000;

export const DEFAULT_CLINIC_SETTINGS = {
  clinicName: 'Lover Clinic',
  clinicSubtitle: '',
  logoUrl: '',
  accentColor: '#dc2626',
};

export const PRESET_COLORS = [
  { hex: '#dc2626', name: 'แดง (Red)' },
  { hex: '#2563eb', name: 'น้ำเงิน (Blue)' },
  { hex: '#7c3aed', name: 'ม่วง (Purple)' },
  { hex: '#059669', name: 'เขียว (Green)' },
  { hex: '#d97706', name: 'ส้ม (Orange)' },
  { hex: '#db2777', name: 'ชมพู (Pink)' },
  { hex: '#0891b2', name: 'ฟ้า (Cyan)' },
  { hex: '#4f46e5', name: 'คราม (Indigo)' },
  { hex: '#ca8a04', name: 'ทอง (Gold)' },
  { hex: '#475569', name: 'เทา (Slate)' },
];
`);
console.log('✓ constants.js');

// ── 3. Add hexToRgb + applyThemeColor to utils.js ────────────────────────
const utilsContent = readFileSync('src/utils.js', 'utf8');
if (!utilsContent.includes('hexToRgb')) {
  writeFileSync('src/utils.js',
    `export const hexToRgb = (hex) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return \`\${r},\${g},\${b}\`;
};

export const applyThemeColor = (hex) => {
  const rgb = hexToRgb(hex);
  document.documentElement.style.setProperty('--accent', hex);
  document.documentElement.style.setProperty('--accent-rgb', rgb);
};

` + utilsContent
  );
}
console.log('✓ utils.js (added hexToRgb + applyThemeColor)');

// ── 4. hooks/useTheme.js ─────────────────────────────────────────────────
writeFileSync('src/hooks/useTheme.js', `import { useState, useEffect, useMemo } from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';

export const THEME_KEY = 'app-theme';
export const THEMES = [
  { value: 'dark',  label: 'Dark',  icon: Moon },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'auto',  label: 'Auto',  icon: Monitor },
];

export function useTheme() {
  const [theme, setThemeState] = useState(() => localStorage.getItem(THEME_KEY) || 'dark');

  const resolvedTheme = useMemo(() => {
    if (theme !== 'auto') return theme;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('theme-transitioning');
    setTimeout(() => root.classList.remove('theme-transitioning'), 350);
    root.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (localStorage.getItem(THEME_KEY) === 'auto') {
        document.documentElement.setAttribute('data-theme', 'auto');
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return { theme, resolvedTheme, setTheme: setThemeState };
}
`);
console.log('✓ hooks/useTheme.js');

// ── 5. components/ThemeToggle.jsx ─────────────────────────────────────────
writeFileSync('src/components/ThemeToggle.jsx', `import { THEMES } from '../hooks/useTheme.js';
import { Moon } from 'lucide-react';

export default function ThemeToggle({ theme, setTheme, compact = false }) {
  if (compact) {
    const order = ['dark', 'light', 'auto'];
    const next = order[(order.indexOf(theme) + 1) % order.length];
    const Icon = THEMES.find(t => t.value === theme)?.icon || Moon;
    return (
      <button
        onClick={() => setTheme(next)}
        className="p-2.5 bg-[#141414] hover:bg-[#222] border border-[#333] text-gray-400 hover:text-white rounded-lg transition-all"
        title={\`Theme: \${theme} (click to change)\`}
      >
        <Icon size={16} />
      </button>
    );
  }

  return (
    <div className="flex bg-[#141414] border border-[#333] rounded-lg overflow-hidden">
      {THEMES.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          className={\`flex items-center gap-1.5 px-3 py-2 text-xs font-bold transition-all \${
            theme === value
              ? 'bg-[var(--accent,#dc2626)] text-white'
              : 'text-gray-400 hover:text-white hover:bg-[#222]'
          }\`}
          title={label}
        >
          <Icon size={13} />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}
`);
console.log('✓ components/ThemeToggle.jsx');

// ── 6. components/ClinicLogo.jsx ─────────────────────────────────────────
// Extract lines 384-442 from App.jsx
const clinicLogoCode = extract(384, 442);
writeFileSync('src/components/ClinicLogo.jsx', `import { useState } from 'react';
import { hexToRgb } from '../utils.js';
import { DEFAULT_CLINIC_SETTINGS } from '../constants.js';

${clinicLogoCode.replace(/^const ClinicLogo/, 'export default function ClinicLogo').replace(/^};$/, '}')}
`);
console.log('✓ components/ClinicLogo.jsx');

// ── 7. components/PrintTemplates.jsx ────────────────────────────────────
// OfficialOPDPrint: lines 447-701, DashboardOPDPrint: lines 703-1049
const printCode = extract(447, 1049);
writeFileSync('src/components/PrintTemplates.jsx', `import ClinicLogo from './ClinicLogo.jsx';
import { DEFAULT_CLINIC_SETTINGS } from '../constants.js';
import {
  generateClinicalSummary, getReasons, getHrtGoals,
  calculateADAM, calculateIIEFScore, calculateMRS,
  getIIEFInterpretation, formatPhoneNumberDisplay
} from '../utils.js';

${printCode.replace(/^function OfficialOPDPrint/, 'export function OfficialOPDPrint').replace(/^function DashboardOPDPrint/, 'export function DashboardOPDPrint')}
`);
console.log('✓ components/PrintTemplates.jsx');

// ── 8. components/ClinicSettingsPanel.jsx ───────────────────────────────
// Lines 1054-1248
const settingsCode = extract(1054, 1248);
writeFileSync('src/components/ClinicSettingsPanel.jsx', `import { useState, useRef } from 'react';
import { setDoc, doc, serverTimestamp } from 'firebase/firestore';
import { ArrowLeft, Settings, Type, ImageIcon, Upload, Link, Trash2, Palette, Check, Moon, Save } from 'lucide-react';
import { DEFAULT_CLINIC_SETTINGS, PRESET_COLORS } from '../constants.js';
import { hexToRgb, applyThemeColor } from '../utils.js';
import { THEMES } from '../hooks/useTheme.js';

${settingsCode.replace(/^function ClinicSettingsPanel/, 'export default function ClinicSettingsPanel')}
`);
console.log('✓ components/ClinicSettingsPanel.jsx');

// ── 9. components/CustomFormBuilder.jsx ─────────────────────────────────
// Lines 1253-1420
const builderCode = extract(1253, 1420);
writeFileSync('src/components/CustomFormBuilder.jsx', `import { useState, useEffect } from 'react';
import { collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { ArrowLeft, Save, PlusCircle, Edit3, Trash2, X, Plus, LayoutTemplate, Type, AlignLeft, CircleDot, CheckSquare } from 'lucide-react';

${builderCode.replace(/^function CustomFormBuilder/, 'export default function CustomFormBuilder')}
`);
console.log('✓ components/CustomFormBuilder.jsx');

// ── 10. pages/AdminLogin.jsx ─────────────────────────────────────────────
// Lines 1550-1599
const loginCode = extract(1550, 1599);
writeFileSync('src/pages/AdminLogin.jsx', `import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { Lock } from 'lucide-react';
import { DEFAULT_CLINIC_SETTINGS } from '../constants.js';
import { hexToRgb } from '../utils.js';
import ThemeToggle from '../components/ThemeToggle.jsx';
import ClinicLogo from '../components/ClinicLogo.jsx';

${loginCode.replace(/^function AdminLogin/, 'export default function AdminLogin')}
`);
console.log('✓ pages/AdminLogin.jsx');

// ── 11. pages/AdminDashboard.jsx ─────────────────────────────────────────
// Lines 1601-2631
const dashCode = extract(1601, 2631);
writeFileSync('src/pages/AdminDashboard.jsx', `import { useState, useEffect, useRef } from 'react';
import { collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import {
  QrCode, Users, PlusCircle, ClipboardList, CheckCircle2, Clock, Activity,
  AlertCircle, Eye, X, FileText, Edit3, TimerOff, Trash2, Phone, HeartPulse,
  Pill, CheckSquare, LogOut, Lock, Flame, Printer, Link, ClipboardCheck,
  Globe, Bell, BellOff, Volume2, Settings, LayoutTemplate, Palette
} from 'lucide-react';
import { DEFAULT_CLINIC_SETTINGS, SESSION_TIMEOUT_MS } from '../constants.js';
import {
  hexToRgb, getReasons, getHrtGoals, calculateADAM, calculateIIEFScore,
  calculateMRS, getIIEFInterpretation, generateClinicalSummary,
  formatPhoneNumberDisplay, renderDobFormat, playNotificationSound
} from '../utils.js';
import ThemeToggle from '../components/ThemeToggle.jsx';
import ClinicLogo from '../components/ClinicLogo.jsx';
import ClinicSettingsPanel from '../components/ClinicSettingsPanel.jsx';
import CustomFormBuilder from '../components/CustomFormBuilder.jsx';

${dashCode.replace(/^function AdminDashboard/, 'export default function AdminDashboard')}
`);
console.log('✓ pages/AdminDashboard.jsx');

// ── 12. pages/PatientForm.jsx ────────────────────────────────────────────
// Lines 2633-end
const pfCode = lines.slice(2632).join('\n');
writeFileSync('src/pages/PatientForm.jsx', `import { useState, useEffect } from 'react';
import { doc, updateDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import {
  ArrowLeft, Activity, AlertCircle, CheckCircle2, Clock, Edit3,
  TimerOff, User, Phone, MapPin, HeartPulse, Pill, CheckSquare, Flame, Globe
} from 'lucide-react';
import { DEFAULT_CLINIC_SETTINGS, SESSION_TIMEOUT_MS } from '../constants.js';
import {
  hexToRgb, THAI_MONTHS, EN_MONTHS, YEARS_BE, YEARS_CE,
  COUNTRY_CODES, defaultFormData
} from '../utils.js';
import ThemeToggle from '../components/ThemeToggle.jsx';
import ClinicLogo from '../components/ClinicLogo.jsx';

${pfCode.replace(/^function PatientForm/, 'export default function PatientForm')}
`);
console.log('✓ pages/PatientForm.jsx');

// ── 13. New App.jsx (routing only) ──────────────────────────────────────
writeFileSync('src/App.jsx', `import { useState, useEffect } from 'react';
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

export default function App() {
  const { theme, setTheme } = useTheme();
  const [user, setUser] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [printMode, setPrintMode] = useState(null);
  const [viewingSession, setViewingSession] = useState(null);
  const [adminView, setAdminView] = useState('dashboard');
  const [simulatedSessionId, setSimulatedSessionId] = useState(null);
  const [clinicSettings, setClinicSettings] = useState(DEFAULT_CLINIC_SETTINGS);

  const params = new URLSearchParams(window.location.search);
  const sessionFromUrl = params.get('session');

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'clinic_settings', 'main'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const merged = { ...DEFAULT_CLINIC_SETTINGS, ...data };
        setClinicSettings(merged);
        applyThemeColor(merged.accentColor || DEFAULT_CLINIC_SETTINGS.accentColor);
      } else {
        applyThemeColor(DEFAULT_CLINIC_SETTINGS.accentColor);
      }
    }, () => applyThemeColor(DEFAULT_CLINIC_SETTINGS.accentColor));
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

  const ac = clinicSettings.accentColor || '#dc2626';
  const acRgb = hexToRgb(ac);

  if (isInitializing) {
    return <div className="flex items-center justify-center min-h-screen bg-[#050505] font-medium tracking-widest uppercase animate-pulse" style={{color: ac}}>กำลังโหลดระบบ {clinicSettings.clinicName}...</div>;
  }

  if (sessionFromUrl) {
    return (
      <div className="min-h-screen bg-[#050505] font-sans text-gray-200" style={{['--selection-bg']: \`rgba(\${acRgb},0.4)\`}}>
        <PatientForm db={db} appId={appId} user={user} sessionId={sessionFromUrl} isSimulation={false} clinicSettings={clinicSettings} />
      </div>
    );
  }

  if (!user || user.isAnonymous) {
    return <AdminLogin auth={auth} clinicSettings={clinicSettings} theme={theme} setTheme={setTheme} />;
  }

  return (
    <>
      <div className={\`min-h-screen bg-[#050505] font-sans text-gray-200 \${printMode !== null ? 'hidden' : 'block print:hidden'}\`}>
        {adminView === 'dashboard' ? (
          <AdminDashboard
            db={db} appId={appId} user={user} auth={auth}
            viewingSession={viewingSession} setViewingSession={setViewingSession}
            setPrintMode={setPrintMode}
            clinicSettings={clinicSettings}
            theme={theme} setTheme={setTheme}
            onSimulateScan={(id) => { setSimulatedSessionId(id); setAdminView('simulation'); }}
          />
        ) : (
          <PatientForm
            db={db} appId={appId} user={user} sessionId={simulatedSessionId} isSimulation={true}
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
              {printMode === 'official' ? 'ฟอร์มมาตรฐาน' : 'สรุปข้อมูล A4'} — {viewingSession?.sessionId || ''}
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
`);
console.log('✓ App.jsx (routing only)');

console.log('\n✅ Migration complete!');
