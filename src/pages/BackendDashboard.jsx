// ─── Backend Dashboard — ระบบหลังบ้าน ──────────────────────────────────────
// Standalone page opened in a new browser tab from AdminDashboard.
// Two tabs: "Clone ลูกค้า" (search + clone from ProClinic) and "ข้อมูลลูกค้า" (view cloned data).

import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { Database, Download, Users, ArrowLeft, ChevronRight } from 'lucide-react';
import { db, appId } from '../firebase.js';
import { DEFAULT_CLINIC_SETTINGS } from '../constants.js';
import { applyThemeColor, hexToRgb } from '../utils.js';
import { useTheme } from '../hooks/useTheme.js';
import ThemeToggle from '../components/ThemeToggle.jsx';
import ClinicLogo from '../components/ClinicLogo.jsx';
import CloneTab from '../components/backend/CloneTab.jsx';
import CustomerListTab from '../components/backend/CustomerListTab.jsx';
import CustomerDetailView from '../components/backend/CustomerDetailView.jsx';
import MasterDataTab from '../components/backend/MasterDataTab.jsx';

export default function BackendDashboard({ clinicSettings: parentSettings }) {
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState('clone'); // 'clone' | 'customers'
  const [viewingCustomer, setViewingCustomer] = useState(null); // selected customer for detail view
  const [clinicSettings, setClinicSettings] = useState(() => parentSettings || { ...DEFAULT_CLINIC_SETTINGS });

  // Subscribe to clinic settings (same pattern as App.jsx)
  useEffect(() => {
    if (parentSettings) { setClinicSettings(parentSettings); return; }
    const unsub = onSnapshot(
      doc(db, 'artifacts', appId, 'public', 'data', 'clinic_settings', 'main'),
      (snap) => {
        if (snap.exists()) {
          const merged = { ...DEFAULT_CLINIC_SETTINGS, ...snap.data() };
          setClinicSettings(merged);
          applyThemeColor(merged.accentColor || DEFAULT_CLINIC_SETTINGS.accentColor);
        } else {
          applyThemeColor(DEFAULT_CLINIC_SETTINGS.accentColor);
        }
      },
      () => applyThemeColor(DEFAULT_CLINIC_SETTINGS.accentColor)
    );
    return () => unsub();
  }, [parentSettings]);

  const ac = clinicSettings.accentColor || '#dc2626';
  const acRgb = hexToRgb(ac);
  const isDark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const tabs = [
    { id: 'clone', icon: <Download size={16} />, label: 'Clone ลูกค้า', color: 'violet' },
    { id: 'customers', icon: <Users size={16} />, label: 'ข้อมูลลูกค้า', color: 'teal' },
    { id: 'masterdata', icon: <Database size={16} />, label: 'ข้อมูลพื้นฐาน', color: 'amber' },
  ];

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--tx-primary)] font-sans">

      {/* ── Header ── */}
      <header className="sticky top-0 z-50 bg-[var(--bg-surface)] border-b border-[var(--bd)] shadow-lg backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">

          {/* Logo + Title */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `rgba(${acRgb},0.15)`, border: `1px solid rgba(${acRgb},0.3)` }}>
              <Database size={18} style={{ color: ac }} />
            </div>
            <div>
              <h1 className="text-sm font-bold text-[var(--tx-heading)] tracking-wider uppercase">ระบบหลังบ้าน</h1>
              <p className="text-[10px] text-[var(--tx-muted)] tracking-wide">{clinicSettings.clinicName}</p>
            </div>
          </div>

          {/* Tabs OR Breadcrumb */}
          <div className="flex items-center gap-1.5 flex-1 justify-center">
            {viewingCustomer ? (
              /* Breadcrumb: ข้อมูลลูกค้า > ชื่อลูกค้า */
              <div className="flex items-center gap-2 text-xs">
                <button onClick={() => { setViewingCustomer(null); setActiveTab('customers'); }}
                  className="text-[var(--tx-muted)] hover:text-teal-400 font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5">
                  <Users size={14} /> ข้อมูลลูกค้า
                </button>
                <ChevronRight size={14} className="text-[var(--tx-muted)]" />
                <span className="font-bold text-[var(--tx-heading)] truncate max-w-[200px]">
                  {`${viewingCustomer.patientData?.prefix || ''} ${viewingCustomer.patientData?.firstName || ''} ${viewingCustomer.patientData?.lastName || ''}`.trim() || viewingCustomer.proClinicHN || '-'}
                </span>
              </div>
            ) : (
              tabs.map(tab => {
                const isActive = activeTab === tab.id;
                const colorMap = {
                  violet: { active: 'bg-violet-700 text-white shadow-[0_0_15px_rgba(139,92,246,0.4)]', hover: 'hover:text-violet-400 hover:border-violet-800/50' },
                  teal: { active: 'bg-teal-700 text-white shadow-[0_0_15px_rgba(20,184,166,0.4)]', hover: 'hover:text-teal-400 hover:border-teal-800/50' },
                  amber: { active: 'bg-amber-700 text-white shadow-[0_0_15px_rgba(245,158,11,0.4)]', hover: 'hover:text-amber-400 hover:border-amber-800/50' },
                };
                const cm = colorMap[tab.color];
                return (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                    className={`px-4 py-2.5 rounded-lg font-bold tracking-wider uppercase text-xs transition-all flex items-center gap-2 ${
                      isActive ? cm.active : `bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] ${cm.hover}`
                    }`}>
                    {tab.icon} {tab.label}
                  </button>
                );
              })
            )}
          </div>

          {/* Theme toggle */}
          <div className="flex-shrink-0">
            <ThemeToggle theme={theme} setTheme={setTheme} />
          </div>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {viewingCustomer ? (
          <CustomerDetailView
            customer={viewingCustomer}
            accentColor={ac}
            onBack={() => setViewingCustomer(null)}
          />
        ) : activeTab === 'clone' ? (
          <CloneTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'customers' ? (
          <CustomerListTab
            clinicSettings={clinicSettings}
            theme={theme}
            onViewCustomer={(c) => { setViewingCustomer(c); }}
          />
        ) : activeTab === 'masterdata' ? (
          <MasterDataTab clinicSettings={clinicSettings} theme={theme} />
        ) : null}
      </main>
    </div>
  );
}
