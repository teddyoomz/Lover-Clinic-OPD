// ─── Backend Dashboard — ระบบหลังบ้าน ──────────────────────────────────────
// Standalone page opened in a new browser tab from AdminDashboard.
// Two tabs: "Clone ลูกค้า" (search + clone from ProClinic) and "ข้อมูลลูกค้า" (view cloned data).

import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { Database, Download, Users, ArrowLeft, ChevronRight, CalendarDays, ShoppingCart, Link2, Check, Wallet, Package, Tag, Ticket, Gift } from 'lucide-react';
import { db, appId } from '../firebase.js';
import { DEFAULT_CLINIC_SETTINGS } from '../constants.js';
import { applyThemeColor, hexToRgb } from '../utils.js';
import { useTheme } from '../hooks/useTheme.js';
import ThemeToggle from '../components/ThemeToggle.jsx';
import ClinicLogo from '../components/ClinicLogo.jsx';

const TAB_COLOR_MAP = {
  violet: { active: 'bg-violet-700 text-white shadow-[0_0_15px_rgba(139,92,246,0.4)]', hover: 'hover:text-violet-400 hover:border-violet-800/50' },
  teal: { active: 'bg-teal-700 text-white shadow-[0_0_15px_rgba(20,184,166,0.4)]', hover: 'hover:text-teal-400 hover:border-teal-800/50' },
  amber: { active: 'bg-orange-700 text-white shadow-[0_0_15px_rgba(245,158,11,0.4)]', hover: 'hover:text-orange-400 hover:border-orange-800/50' },
  sky: { active: 'bg-sky-700 text-white shadow-[0_0_15px_rgba(14,165,233,0.4)]', hover: 'hover:text-sky-400 hover:border-sky-900/50' },
  rose: { active: 'bg-rose-700 text-white shadow-[0_0_15px_rgba(244,63,94,0.4)]', hover: 'hover:text-rose-400 hover:border-rose-900/50' },
  emerald: { active: 'bg-emerald-700 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)]', hover: 'hover:text-emerald-400 hover:border-emerald-800/50' },
  orange: { active: 'bg-orange-700 text-white shadow-[0_0_15px_rgba(249,115,22,0.4)]', hover: 'hover:text-orange-400 hover:border-orange-800/50' },
};
import CloneTab from '../components/backend/CloneTab.jsx';
import CustomerListTab from '../components/backend/CustomerListTab.jsx';
import CustomerDetailView from '../components/backend/CustomerDetailView.jsx';
import MasterDataTab from '../components/backend/MasterDataTab.jsx';
import AppointmentTab from '../components/backend/AppointmentTab.jsx';
import SaleTab from '../components/backend/SaleTab.jsx';
import FinanceTab from '../components/backend/FinanceTab.jsx';
import StockTab from '../components/backend/StockTab.jsx';
import PromotionTab from '../components/backend/PromotionTab.jsx';
import CouponTab from '../components/backend/CouponTab.jsx';
import VoucherTab from '../components/backend/VoucherTab.jsx';
import TreatmentFormPage from '../components/TreatmentFormPage.jsx';
import { deleteBackendTreatment, rebuildTreatmentSummary, getCustomer } from '../lib/backendClient.js';
import { setUseTrialServer } from '../lib/brokerClient.js';

export default function BackendDashboard({ clinicSettings: parentSettings }) {
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState('clone'); // 'clone' | 'customers' | 'masterdata'
  const [viewingCustomer, setViewingCustomer] = useState(null); // selected customer for detail view
  const [treatmentFormMode, setTreatmentFormMode] = useState(null); // { mode, customerId, treatmentId?, patientName, patientData }
  const [linkCopied, setLinkCopied] = useState(false);
  const [saleInitialCustomer, setSaleInitialCustomer] = useState(null);
  const [saleMode, setSaleMode] = useState(false); // true = show SaleTab overlay (from customer detail)
  const [financeInitialCustomer, setFinanceInitialCustomer] = useState(null);
  const [financeSubTab, setFinanceSubTab] = useState(null); // 'deposit' | 'wallet' | ... set when navigating from customer detail
  const [financeMode, setFinanceMode] = useState(false); // overlay from CustomerDetail, similar to saleMode
  const [clinicSettings, setClinicSettings] = useState(() => parentSettings || { ...DEFAULT_CLINIC_SETTINGS });

  // Backend dashboard uses trial ProClinic server (separate from production frontend)
  useEffect(() => {
    setUseTrialServer(true);
    return () => setUseTrialServer(false);
  }, []);

  const [hydrated, setHydrated] = useState(false);

  // Deep link: ?backend=1&customer=ID → auto-load customer detail
  // Deep link: ?backend=1&tab=finance&subtab=deposit → switch to finance tab
  // Runs once on mount; after this, state drives the URL (see next effect).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const customerId = params.get('customer');
    const tab = params.get('tab');
    const subtab = params.get('subtab');
    if (customerId) {
      getCustomer(customerId)
        .then(c => { if (c) { setViewingCustomer(c); setActiveTab('customers'); } })
        .catch(() => {})
        .finally(() => setHydrated(true));
    } else {
      if (tab && ['clone','customers','masterdata','appointments','sales','finance','stock','promotions','coupons','vouchers'].includes(tab)) {
        setActiveTab(tab);
        if (tab === 'finance' && subtab) setFinanceSubTab(subtab);
      }
      setHydrated(true);
    }
  }, []);

  // Keep the URL in sync with state — so switching to another tab removes
  // ?customer=X from the address bar, bookmarks reflect the actual view, etc.
  useEffect(() => {
    if (!hydrated) return;
    const params = new URLSearchParams();
    params.set('backend', '1');
    if (viewingCustomer) {
      params.set('customer', String(viewingCustomer.proClinicId || viewingCustomer.id));
    } else {
      if (activeTab && activeTab !== 'clone') params.set('tab', activeTab);
      if (activeTab === 'finance' && financeSubTab) params.set('subtab', financeSubTab);
    }
    const newSearch = `?${params.toString()}`;
    if (window.location.search !== newSearch) {
      window.history.replaceState(null, '', `${window.location.pathname}${newSearch}`);
    }
  }, [hydrated, activeTab, viewingCustomer, financeSubTab, financeMode]);

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
    { id: 'appointments', icon: <CalendarDays size={16} />, label: 'นัดหมาย', color: 'sky' },
    { id: 'sales', icon: <ShoppingCart size={16} />, label: 'ขาย/ใบเสร็จ', color: 'rose' },
    { id: 'finance', icon: <Wallet size={16} />, label: 'การเงิน', color: 'emerald' },
    { id: 'stock', icon: <Package size={16} />, label: 'สต็อก', color: 'rose' },
    { id: 'promotions', icon: <Tag size={16} />, label: 'โปรโมชัน', color: 'orange' },
    { id: 'coupons', icon: <Ticket size={16} />, label: 'คูปอง', color: 'orange' },
    { id: 'vouchers', icon: <Gift size={16} />, label: 'Voucher', color: 'orange' },
  ];

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--tx-primary)] font-sans">

      {/* ── Header ── */}
      <header className="sticky top-0 z-50 bg-[var(--bg-surface)] shadow-lg backdrop-blur-sm" style={{ borderBottom: `1px solid rgba(${acRgb},0.2)` }}>
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">

          {/* Logo + Title */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, rgba(${acRgb},0.25), rgba(${acRgb},0.1))`, border: `1px solid rgba(${acRgb},0.35)`, boxShadow: `0 0 20px rgba(${acRgb},0.15)` }}>
              <Database size={20} style={{ color: ac }} />
            </div>
            <div>
              <h1 className="text-base font-black tracking-wider uppercase" style={{ color: ac }}>ระบบหลังบ้าน</h1>
              <p className="text-xs text-[var(--tx-muted)] tracking-wide">{clinicSettings.clinicName}</p>
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
                <button onClick={() => {
                  const url = `${window.location.origin}?backend=1&customer=${viewingCustomer.proClinicId || viewingCustomer.id}`;
                  navigator.clipboard.writeText(url).then(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); });
                }} className="ml-2 px-2 py-1 rounded text-[11px] font-bold flex items-center gap-1 transition-all bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-teal-400 hover:border-teal-700/40"
                  title="คัดลอกลิงก์ประวัติลูกค้า">
                  {linkCopied ? <><Check size={10} className="text-emerald-400" /> คัดลอกแล้ว</> : <><Link2 size={10} /> คัดลอกลิงก์</>}
                </button>
              </div>
            ) : (
              tabs.map(tab => {
                const isActive = activeTab === tab.id;
                const cm = TAB_COLOR_MAP[tab.color];
                return (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)} role="tab" aria-selected={isActive}
                    className={`px-4 py-3 rounded-lg font-bold tracking-wider uppercase text-xs transition-all flex items-center gap-2 ${
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
        {saleMode ? (
          <SaleTab clinicSettings={clinicSettings} theme={theme} initialCustomer={saleInitialCustomer}
            onCustomerUsed={() => setSaleInitialCustomer(null)}
            onFormClose={() => { setSaleMode(false); setSaleInitialCustomer(null); }}
          />
        ) : financeMode ? (
          <div>
            <div className="mb-4 flex items-center gap-2">
              <button onClick={() => { setFinanceMode(false); setFinanceInitialCustomer(null); setFinanceSubTab(null); }}
                className="flex items-center gap-1.5 text-xs font-bold text-teal-400 hover:text-teal-300 transition-colors">
                <ArrowLeft size={14} /> กลับไปที่ข้อมูลลูกค้า
              </button>
            </div>
            <FinanceTab clinicSettings={clinicSettings} theme={theme}
              initialSubTab={financeSubTab}
              initialCustomer={financeInitialCustomer}
              onCustomerUsed={() => setFinanceInitialCustomer(null)}
            />
          </div>
        ) : viewingCustomer ? (
          <CustomerDetailView
            customer={viewingCustomer}
            accentColor={ac}
            theme={theme}
            onBack={() => setViewingCustomer(null)}
            onCreateTreatment={() => setTreatmentFormMode({
              mode: 'create',
              customerId: viewingCustomer.proClinicId,
              patientName: `${viewingCustomer.patientData?.prefix || ''} ${viewingCustomer.patientData?.firstName || ''} ${viewingCustomer.patientData?.lastName || ''}`.trim(),
              patientData: viewingCustomer.patientData,
            })}
            onEditTreatment={(treatmentId) => setTreatmentFormMode({
              mode: 'edit',
              customerId: viewingCustomer.proClinicId,
              treatmentId,
              patientName: `${viewingCustomer.patientData?.prefix || ''} ${viewingCustomer.patientData?.firstName || ''} ${viewingCustomer.patientData?.lastName || ''}`.trim(),
              patientData: viewingCustomer.patientData,
            })}
            onDeleteTreatment={async (treatmentId) => {
              if (!confirm('ต้องการลบบันทึกการรักษานี้?')) return;
              // Phase 7 + 8b: reverse course deductions + deposits + wallet + points + STOCK (treatment + linked sale)
              const cid = viewingCustomer.proClinicId;
              try {
                const {
                  getSaleByTreatmentId, reverseDepositUsage, refundToWallet, reversePointsEarned,
                  getTreatment, reverseCourseDeduction,
                  reverseStockForTreatment, reverseStockForSale,
                } = await import('../lib/backendClient.js');
                // 1. Reverse the treatment's course deductions (both existing + purchased-in-session)
                try {
                  const t = await getTreatment(treatmentId);
                  const courseItems = t?.detail?.courseItems || [];
                  const oldExisting = courseItems.filter(ci => !ci.rowId?.startsWith('purchased-') && !ci.rowId?.startsWith('promo-'));
                  const oldPurchased = courseItems.filter(ci => ci.rowId?.startsWith('purchased-') || ci.rowId?.startsWith('promo-'));
                  if (oldExisting.length > 0) await reverseCourseDeduction(cid, oldExisting);
                  if (oldPurchased.length > 0) await reverseCourseDeduction(cid, oldPurchased, { preferNewest: true });
                } catch (e) { console.warn('[BackendDashboard] reverse course deduction on treatment delete failed:', e); }
                // 2. Reverse the linked sale's deposits / wallet / points
                const linkedSale = await getSaleByTreatmentId(treatmentId);
                if (linkedSale && linkedSale.status !== 'cancelled') {
                  const saleId = linkedSale.saleId || linkedSale.id;
                  const deps = Array.isArray(linkedSale.billing?.depositIds) ? linkedSale.billing.depositIds : [];
                  for (const d of deps) {
                    try { await reverseDepositUsage(d.depositId, saleId); }
                    catch (e) { console.warn('[BackendDashboard] reverse deposit on treatment delete failed:', e); }
                  }
                  if (linkedSale.billing?.walletTypeId && Number(linkedSale.billing?.walletApplied) > 0) {
                    try {
                      await refundToWallet(cid, linkedSale.billing.walletTypeId, {
                        amount: Number(linkedSale.billing.walletApplied),
                        walletTypeName: linkedSale.billing.walletTypeName || '',
                        note: `ลบ treatment — คืน wallet บน ${saleId}`,
                        referenceType: 'sale', referenceId: saleId,
                      });
                    } catch (e) { console.warn('[BackendDashboard] wallet refund on treatment delete failed:', e); }
                  }
                  try { await reversePointsEarned(cid, saleId); }
                  catch (e) { console.warn('[BackendDashboard] points reverse on treatment delete failed:', e); }
                  // 2b. Phase 8b — reverse linked sale's stock movements (products + meds)
                  try { await reverseStockForSale(saleId); }
                  catch (e) {
                    console.error('[BackendDashboard] reverse linked sale stock failed:', e);
                    alert(`คืนสต็อก auto-sale ล้มเหลว: ${e.message}\nยกเลิกการลบ`);
                    return;
                  }
                }
                // 3. Phase 8b — reverse treatment-side stock (consumables + treatmentItems + optionally meds)
                try { await reverseStockForTreatment(treatmentId); }
                catch (e) {
                  console.error('[BackendDashboard] reverse treatment stock failed:', e);
                  alert(`คืนสต็อกการรักษาล้มเหลว: ${e.message}\nยกเลิกการลบ`);
                  return;
                }
              } catch (e) { console.warn('[BackendDashboard] linked sale lookup failed:', e); }
              await deleteBackendTreatment(treatmentId);
              await rebuildTreatmentSummary(cid);
              const refreshed = await getCustomer(cid);
              if (refreshed) setViewingCustomer(refreshed);
            }}
            onCustomerUpdated={(refreshed) => setViewingCustomer(refreshed)}
            onCreateSale={(cust) => {
              setSaleInitialCustomer(cust);
              setSaleMode(true); // Overlay SaleTab without clearing customer
            }}
            onOpenFinance={(subtab, cust) => {
              setFinanceSubTab(subtab || 'deposit');
              setFinanceInitialCustomer(cust);
              setFinanceMode(true);
            }}
          />
        ) : activeTab === 'clone' ? (
          <CloneTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'customers' ? (
          <CustomerListTab
            clinicSettings={clinicSettings}
            theme={theme}
            onViewCustomer={(c) => {
              // Open customer detail in new tab (shareable URL)
              const url = `${window.location.origin}?backend=1&customer=${c.proClinicId || c.id}`;
              window.open(url, '_blank');
            }}
          />
        ) : activeTab === 'masterdata' ? (
          <MasterDataTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'appointments' ? (
          <AppointmentTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'sales' ? (
          <SaleTab clinicSettings={clinicSettings} theme={theme} initialCustomer={saleInitialCustomer} onCustomerUsed={() => setSaleInitialCustomer(null)}
            onFormClose={() => {
              // If came from customer detail, go back there
              if (viewingCustomer) { setActiveTab('customers'); }
              setSaleInitialCustomer(null);
            }}
          />
        ) : activeTab === 'finance' ? (
          <FinanceTab clinicSettings={clinicSettings} theme={theme}
            initialSubTab={financeSubTab}
            initialCustomer={financeInitialCustomer}
            onCustomerUsed={() => { setFinanceInitialCustomer(null); setFinanceSubTab(null); }}
          />
        ) : activeTab === 'stock' ? (
          <StockTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'promotions' ? (
          <PromotionTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'coupons' ? (
          <CouponTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'vouchers' ? (
          <VoucherTab clinicSettings={clinicSettings} theme={theme} />
        ) : null}
      </main>

      {/* ── Treatment Form Overlay ── */}
      {treatmentFormMode && (
        <TreatmentFormPage
          mode={treatmentFormMode.mode}
          customerId={treatmentFormMode.customerId}
          treatmentId={treatmentFormMode.treatmentId}
          patientName={treatmentFormMode.patientName}
          patientData={treatmentFormMode.patientData}
          isDark={isDark}
          db={db}
          appId={appId}
          saveTarget="backend"
          onClose={() => setTreatmentFormMode(null)}
          onSaved={async () => {
            setTreatmentFormMode(null);
            const refreshed = await getCustomer(viewingCustomer?.proClinicId);
            if (refreshed) setViewingCustomer(refreshed);
          }}
        />
      )}
    </div>
  );
}
