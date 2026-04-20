// ─── Backend Dashboard — ระบบหลังบ้าน ──────────────────────────────────────
// Redesigned 2026-04-19: nav extracted to BackendNav (sidebar + mobile
// drawer + cmdk palette). Adding new tabs = just add an entry to
// src/components/backend/nav/navConfig.js; this file doesn't need changes
// for scale.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import {
  ArrowLeft, ChevronRight, Users, Link2, Check, Construction, BarChart3,
  // Phase 11 master-data stub icons
  FolderTree, Scale, Wrench, CalendarX, Building2, ShieldCheck,
} from 'lucide-react';
import { db, appId } from '../firebase.js';
import { DEFAULT_CLINIC_SETTINGS } from '../constants.js';
import { applyThemeColor } from '../utils.js';
import { useTheme } from '../hooks/useTheme.js';
import ThemeToggle from '../components/ThemeToggle.jsx';
import BackendNav from '../components/backend/nav/BackendNav.jsx';
import { ALL_ITEM_IDS } from '../components/backend/nav/navConfig.js';

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
import ReportsHomeTab from '../components/backend/reports/ReportsHomeTab.jsx';
import SaleReportTab from '../components/backend/reports/SaleReportTab.jsx';
import CustomerReportTab from '../components/backend/reports/CustomerReportTab.jsx';
import AppointmentReportTab from '../components/backend/reports/AppointmentReportTab.jsx';
import StockReportTab from '../components/backend/reports/StockReportTab.jsx';
import CRMInsightTab from '../components/backend/reports/CRMInsightTab.jsx';
import RevenueAnalysisTab from '../components/backend/reports/RevenueAnalysisTab.jsx';
import AppointmentAnalysisTab from '../components/backend/reports/AppointmentAnalysisTab.jsx';
import DailyRevenueTab from '../components/backend/reports/DailyRevenueTab.jsx';
import StaffSalesTab from '../components/backend/reports/StaffSalesTab.jsx';
import ComingSoon from '../components/backend/ComingSoon.jsx';
import ProductGroupsTab from '../components/backend/ProductGroupsTab.jsx';
import ProductUnitsTab from '../components/backend/ProductUnitsTab.jsx';
import MedicalInstrumentsTab from '../components/backend/MedicalInstrumentsTab.jsx';
import HolidaysTab from '../components/backend/HolidaysTab.jsx';
import TreatmentFormPage from '../components/TreatmentFormPage.jsx';
import { deleteBackendTreatment, rebuildTreatmentSummary, getCustomer } from '../lib/backendClient.js';
import { setUseTrialServer } from '../lib/brokerClient.js';

export default function BackendDashboard({ clinicSettings: parentSettings }) {
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState('clone');
  const [viewingCustomer, setViewingCustomer] = useState(null);
  const [treatmentFormMode, setTreatmentFormMode] = useState(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [saleInitialCustomer, setSaleInitialCustomer] = useState(null);
  const [saleMode, setSaleMode] = useState(false);
  const [financeInitialCustomer, setFinanceInitialCustomer] = useState(null);
  const [financeSubTab, setFinanceSubTab] = useState(null);
  const [financeMode, setFinanceMode] = useState(false);
  const [clinicSettings, setClinicSettings] = useState(() => parentSettings || { ...DEFAULT_CLINIC_SETTINGS });

  // Backend dashboard uses trial ProClinic server (separate from production frontend)
  useEffect(() => {
    setUseTrialServer(true);
    return () => setUseTrialServer(false);
  }, []);

  const [hydrated, setHydrated] = useState(false);

  // Deep link: ?backend=1&customer=ID → auto-load customer detail
  // Deep link: ?backend=1&tab=finance&subtab=deposit → switch to finance tab
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
      if (tab && ALL_ITEM_IDS.includes(tab)) {
        setActiveTab(tab);
        if (tab === 'finance' && subtab) setFinanceSubTab(subtab);
      }
      setHydrated(true);
    }
  }, []);

  // Keep URL in sync with state.
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

  // Clinic settings subscription.
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
  const isDark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  // Stable handler so memo'd nav children don't re-render on every parent
  // state change (e.g. linkCopied toggle, viewingCustomer refresh).
  const handleNavigate = useCallback((tabId) => {
    // If inside customer detail / sale / finance overlay, exit and switch tab.
    setViewingCustomer(null);
    setSaleMode(false);
    setFinanceMode(false);
    setActiveTab(tabId);
  }, []);

  // Breadcrumb chrome (shown above content via BackendNav topBarSlot) —
  // only when viewing a specific customer or in a modal-style overlay.
  const breadcrumbSlot = viewingCustomer ? (
    <div className="flex items-center gap-2 text-xs">
      <button
        onClick={() => { setViewingCustomer(null); setActiveTab('customers'); }}
        className="text-[var(--tx-muted)] hover:text-teal-400 font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5"
      >
        <Users size={14} /> ข้อมูลลูกค้า
      </button>
      <ChevronRight size={14} className="text-[var(--tx-muted)]" />
      <span className="font-bold text-[var(--tx-heading)] truncate max-w-[200px]">
        {`${viewingCustomer.patientData?.prefix || ''} ${viewingCustomer.patientData?.firstName || ''} ${viewingCustomer.patientData?.lastName || ''}`.trim() || viewingCustomer.proClinicHN || '-'}
      </span>
      <button
        onClick={() => {
          const url = `${window.location.origin}?backend=1&customer=${viewingCustomer.proClinicId || viewingCustomer.id}`;
          navigator.clipboard.writeText(url).then(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); });
        }}
        className="ml-auto px-2 py-1 rounded text-[11px] font-bold flex items-center gap-1 transition-all bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-teal-400 hover:border-teal-700/40"
        title="คัดลอกลิงก์ประวัติลูกค้า"
      >
        {linkCopied ? <><Check size={10} className="text-emerald-400" /> คัดลอกแล้ว</> : <><Link2 size={10} /> คัดลอกลิงก์</>}
      </button>
      {/* Desktop theme toggle in breadcrumb for a11y — mobile has one in TopBar */}
      <div className="hidden lg:block"><ThemeToggle theme={theme} setTheme={setTheme} /></div>
    </div>
  ) : (
    // Desktop: show theme toggle in a tiny slot (mobile TopBar handles it).
    <div className="hidden lg:flex items-center justify-end">
      <ThemeToggle theme={theme} setTheme={setTheme} />
    </div>
  );

  return (
    <BackendNav
      activeTabId={activeTab}
      onNavigate={handleNavigate}
      clinicSettings={clinicSettings}
      theme={theme}
      setTheme={setTheme}
      topBarSlot={breadcrumbSlot}
    >
      <div className={`${activeTab === 'reports' || activeTab.startsWith('reports-') ? 'max-w-none' : 'max-w-7xl'} mx-auto px-4 py-6`}>
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
              customerHN: viewingCustomer.proClinicHN || viewingCustomer.hn || '',
              patientName: `${viewingCustomer.patientData?.prefix || ''} ${viewingCustomer.patientData?.firstName || ''} ${viewingCustomer.patientData?.lastName || ''}`.trim(),
              patientData: viewingCustomer.patientData,
            })}
            onEditTreatment={(treatmentId) => setTreatmentFormMode({
              mode: 'edit',
              customerId: viewingCustomer.proClinicId,
              customerHN: viewingCustomer.proClinicHN || viewingCustomer.hn || '',
              treatmentId,
              patientName: `${viewingCustomer.patientData?.prefix || ''} ${viewingCustomer.patientData?.firstName || ''} ${viewingCustomer.patientData?.lastName || ''}`.trim(),
              patientData: viewingCustomer.patientData,
            })}
            onDeleteTreatment={async (treatmentId) => {
              // Business rule (2026-04-19, user directive): treatment delete is
              // PARTIAL — not a full undo of everything that happened during
              // the treatment.
              //
              // What it DOES:
              //   - Refunds COURSE-CREDIT usages back to the customer (so the
              //     customer's courses go back to "เหลือ" count). Applies to
              //     both customer's existing courses AND courses purchased
              //     via the buy modal in this same treatment (the latter
              //     means the customer keeps the purchased course at FULL
              //     count — they cancelled the treatment, not the purchase).
              //
              // What it DOES NOT touch:
              //   - Linked sale doc — stays alive in รายการขาย
              //   - Sale's money flows: deposit usage / wallet / points
              //   - Sale-side product stock (the products on the sale)
              //   - Treatment-side product stock: consumables, treatmentItems,
              //     take-home meds. User explicitly said: "สินค้าที่เป็นชิ้นๆ
              //     จะไม่คืนกลับสต็อค จะต้องไปยกเลิกที่หน้าการขายเท่านั้น".
              //
              // To undo a sale (and put physical stock back), the user goes
              // to "การขาย" → cancel/delete which has its own full reversal
              // cascade including stock + deposit + wallet + points.
              if (!confirm('ต้องการลบประวัติการรักษานี้?\n\nระบบจะคืน "การใช้คอร์ส" กลับเข้าหาลูกค้า แต่จะไม่คืนสินค้ากลับสต็อค และไม่ยกเลิกใบเสร็จที่เกิดในการรักษานี้\n\nหากต้องการยกเลิกใบเสร็จและคืนสินค้ากลับสต็อค ให้ไปที่ "การขาย"')) return;
              const cid = viewingCustomer.proClinicId;
              try {
                const {
                  getTreatment, reverseCourseDeduction,
                } = await import('../lib/backendClient.js');
                try {
                  const t = await getTreatment(treatmentId);
                  const courseItems = t?.detail?.courseItems || [];
                  const oldExisting = courseItems.filter(ci => !ci.rowId?.startsWith('purchased-') && !ci.rowId?.startsWith('promo-'));
                  const oldPurchased = courseItems.filter(ci => ci.rowId?.startsWith('purchased-') || ci.rowId?.startsWith('promo-'));
                  if (oldExisting.length > 0) await reverseCourseDeduction(cid, oldExisting);
                  if (oldPurchased.length > 0) await reverseCourseDeduction(cid, oldPurchased, { preferNewest: true });
                } catch (e) { console.warn('[BackendDashboard] reverse course deduction on treatment delete failed:', e); }
                // NO stock reversal here — sale is untouched, so its products
                // stay sold. Treatment-side consumables/treatmentItems/meds
                // also stay deducted (per user directive). To put any of that
                // stock back, user must cancel the linked sale via "การขาย".
              } catch (e) { console.warn('[BackendDashboard] treatment delete reverse failed:', e); }
              await deleteBackendTreatment(treatmentId);
              await rebuildTreatmentSummary(cid);
              const refreshed = await getCustomer(cid);
              if (refreshed) setViewingCustomer(refreshed);
            }}
            onCustomerUpdated={(refreshed) => setViewingCustomer(refreshed)}
            onCreateSale={(cust) => {
              setSaleInitialCustomer(cust);
              setSaleMode(true);
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
        ) : activeTab === 'reports' ? (
          <ReportsHomeTab onNavigate={handleNavigate} clinicSettings={clinicSettings} />
        ) : activeTab === 'reports-sale' ? (
          <SaleReportTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'reports-customer' ? (
          <CustomerReportTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'reports-appointment' ? (
          <AppointmentReportTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'reports-stock' ? (
          <StockReportTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'reports-rfm' ? (
          <CRMInsightTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'reports-revenue' ? (
          <RevenueAnalysisTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'reports-appt-analysis' ? (
          <AppointmentAnalysisTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'reports-daily-revenue' ? (
          <DailyRevenueTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'reports-staff-sales' ? (
          <StaffSalesTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab.startsWith('reports-') ? (
          <ReportComingSoon tabId={activeTab} onBack={() => setActiveTab('reports')} clinicSettings={clinicSettings} />
        ) : activeTab === 'product-groups' ? (
          <ProductGroupsTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'product-units' ? (
          <ProductUnitsTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'medical-instruments' ? (
          <MedicalInstrumentsTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'holidays' ? (
          <HolidaysTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'branches' ? (
          <ComingSoon icon={Building2}   label="สาขา"                phaseTag="Phase 11.6" message="จัดการสาขา + ตั้งสาขาหลัก + ที่อยู่/โทร/LINE"                                        clinicSettings={clinicSettings} />
        ) : activeTab === 'permission-groups' ? (
          <ComingSoon icon={ShieldCheck} label="สิทธิ์การใช้งาน"      phaseTag="Phase 11.7" message="บทบาท + ตาราง permission แบบ 8-module (ลูกค้า/ขาย/การเงิน/…)"                        clinicSettings={clinicSettings} />
        ) : null}
      </div>

      {/* ── Phase 10 placeholder for individual report tabs not yet shipped ── */}
      {/* (defined inline so 10.2-10.8 commits can swap each one without
          touching this file again — they'll add their own case branch above
          and remove the matching tabId from this stub.) */}

      {/* ── Treatment Form Overlay ── */}
      {treatmentFormMode && (
        <TreatmentFormPage
          mode={treatmentFormMode.mode}
          customerId={treatmentFormMode.customerId}
          customerHN={treatmentFormMode.customerHN}
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
    </BackendNav>
  );
}

const REPORT_LABELS = {
  'reports-sale':          'รายการขาย',
  'reports-customer':      'ลูกค้าสาขา',
  'reports-appointment':   'นัดหมาย',
  'reports-stock':         'สต็อค',
  'reports-rfm':           'CRM Insight',
  'reports-revenue':       'วิเคราะห์รายได้',
  'reports-appt-analysis': 'วิเคราะห์นัด',
  'reports-daily-revenue': 'รายรับประจำวัน',
  'reports-staff-sales':   'ยอดขายรายพนักงาน',
};

function ReportComingSoon({ tabId, onBack, clinicSettings }) {
  const ac = clinicSettings?.accentColor || '#06b6d4';
  const label = REPORT_LABELS[tabId] || tabId;
  return (
    <div className="space-y-4" data-testid="report-coming-soon">
      <button
        type="button"
        onClick={onBack}
        className="text-xs font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1.5"
      >
        <ArrowLeft size={14} /> กลับไปหน้ารายงาน
      </button>
      <div className="rounded-xl border border-dashed border-[var(--bd)] bg-[var(--bg-card)] p-12 text-center">
        <BarChart3 size={48} className="inline mb-3 opacity-40" style={{ color: ac }} />
        <h2 className="text-xl font-black tracking-wider uppercase mb-2" style={{ color: ac }}>
          {label}
        </h2>
        <p className="text-sm text-[var(--tx-muted)] flex items-center justify-center gap-2">
          <Construction size={14} /> รายงานนี้อยู่ระหว่างพัฒนา — จะปล่อยใน Phase 10 task ถัดไป
        </p>
      </div>
    </div>
  );
}
