// audit-branch-scope: sanctioned exception — root composition / mixed scope
// ─── Backend Dashboard — ระบบหลังบ้าน ──────────────────────────────────────
// Redesigned 2026-04-19: nav extracted to BackendNav (sidebar + mobile
// drawer + cmdk palette). Adding new tabs = just add an entry to
// src/components/backend/nav/navConfig.js; this file doesn't need changes
// for scale.

import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
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
import ProfileDropdown from '../components/backend/ProfileDropdown.jsx';
import BackendNav from '../components/backend/nav/BackendNav.jsx';
import { ALL_ITEM_IDS } from '../components/backend/nav/navConfig.js';
// Phase 17.2 (2026-05-05) — BranchProvider hoisted to App.jsx; this file
// no longer wraps. BranchSelector still rendered here (top-bar slot).
import BranchSelector from '../components/backend/BranchSelector.jsx';

import CloneTab from '../components/backend/CloneTab.jsx';
import CustomerListTab from '../components/backend/CustomerListTab.jsx';
import CustomerCreatePage from '../components/backend/CustomerCreatePage.jsx';
import CustomerDetailView from '../components/backend/CustomerDetailView.jsx';
import MasterDataTab from '../components/backend/MasterDataTab.jsx';
// Phase 21.0 (2026-05-06) — renamed from AppointmentTab to AppointmentCalendarView
// + parameterized via `appointmentType` prop so the same component renders
// each of the 4 new นัดหมาย sub-tabs.
import AppointmentCalendarView from '../components/backend/AppointmentCalendarView.jsx';
import SaleTab from '../components/backend/SaleTab.jsx';
import FinanceTab from '../components/backend/FinanceTab.jsx';
import StockTab from '../components/backend/StockTab.jsx';
// Phase 15.1 (2026-04-27) — Central Stock Conditional, lazy-loaded so the
// shell stays slim for branches that don't use central warehouse.
const CentralStockTab = lazy(() => import('../components/backend/CentralStockTab.jsx'));
import PromotionTab from '../components/backend/PromotionTab.jsx';
import CouponTab from '../components/backend/CouponTab.jsx';
import VoucherTab from '../components/backend/VoucherTab.jsx';
import VendorSalesTab from '../components/backend/VendorSalesTab.jsx';
// Audit P2 (2026-04-26 P2 — performance code-split): the 13 report tabs
// are heavy + each is rarely viewed in a single session. lazy() splits
// each into its own chunk so the initial BackendDashboard payload drops
// from ~1.2MB to the shell + the active tab. Suspense boundary below
// catches the in-flight load with a simple spinner.
const ReportsHomeTab         = lazy(() => import('../components/backend/reports/ReportsHomeTab.jsx'));
const SaleReportTab          = lazy(() => import('../components/backend/reports/SaleReportTab.jsx'));
const CustomerReportTab      = lazy(() => import('../components/backend/reports/CustomerReportTab.jsx'));
const AppointmentReportTab   = lazy(() => import('../components/backend/reports/AppointmentReportTab.jsx'));
const StockReportTab         = lazy(() => import('../components/backend/reports/StockReportTab.jsx'));
const CRMInsightTab          = lazy(() => import('../components/backend/reports/CRMInsightTab.jsx'));
const RevenueAnalysisTab     = lazy(() => import('../components/backend/reports/RevenueAnalysisTab.jsx'));
const AppointmentAnalysisTab = lazy(() => import('../components/backend/reports/AppointmentAnalysisTab.jsx'));
const DailyRevenueTab        = lazy(() => import('../components/backend/reports/DailyRevenueTab.jsx'));
const StaffSalesTab          = lazy(() => import('../components/backend/reports/StaffSalesTab.jsx'));
const PnLReportTab           = lazy(() => import('../components/backend/reports/PnLReportTab.jsx'));
const DfPayoutReportTab      = lazy(() => import('../components/backend/reports/DfPayoutReportTab.jsx'));
const ExpenseReportTab       = lazy(() => import('../components/backend/reports/ExpenseReportTab.jsx'));
const RemainingCourseTab     = lazy(() => import('../components/backend/reports/RemainingCourseTab.jsx'));
// Phase 16.1 (2026-04-30) — Smart Audience tab (lazy; heavy rule-builder UI + onSnapshot listener)
const SmartAudienceTab       = lazy(() => import('../components/backend/SmartAudienceTab.jsx'));
const ClinicReportTab        = lazy(() => import('../components/backend/reports/ClinicReportTab.jsx'));
const PaymentSummaryTab      = lazy(() => import('../components/backend/reports/PaymentSummaryTab.jsx'));
// Phase 16.3 (2026-04-29) — System Settings tab (lazy; rarely opened by non-admin)
const SystemSettingsTab      = lazy(() => import('../components/backend/SystemSettingsTab.jsx'));
import ComingSoon from '../components/backend/ComingSoon.jsx';
import ProductGroupsTab from '../components/backend/ProductGroupsTab.jsx';
import ProductUnitsTab from '../components/backend/ProductUnitsTab.jsx';
import MedicalInstrumentsTab from '../components/backend/MedicalInstrumentsTab.jsx';
import HolidaysTab from '../components/backend/HolidaysTab.jsx';
import BranchesTab from '../components/backend/BranchesTab.jsx';
import ExamRoomsTab from '../components/backend/ExamRoomsTab.jsx';
import PermissionGroupsTab from '../components/backend/PermissionGroupsTab.jsx';
import StaffTab from '../components/backend/StaffTab.jsx';
import DoctorsTab from '../components/backend/DoctorsTab.jsx';
import ProductsTab from '../components/backend/ProductsTab.jsx';
import CoursesTab from '../components/backend/CoursesTab.jsx';
import FinanceMasterTab from '../components/backend/FinanceMasterTab.jsx';
import OnlineSalesTab from '../components/backend/OnlineSalesTab.jsx';
import SaleInsuranceClaimsTab from '../components/backend/SaleInsuranceClaimsTab.jsx';
// 5 more heavy tabs split for the same reason — DocumentTemplatesTab
// pulls the print engine, QuotationTab + DfGroupsTab + DoctorSchedulesTab +
// EmployeeSchedulesTab each pull rich form modals + scheduling components.
// Same Suspense boundary handles all.
const DocumentTemplatesTab = lazy(() => import('../components/backend/DocumentTemplatesTab.jsx'));
// V32-tris-ter (2026-04-26) — LINE OA settings tab
const LineSettingsTab      = lazy(() => import('../components/backend/LineSettingsTab.jsx'));
// V32-tris-quater (2026-04-26) — LINE link request approval queue
const LinkRequestsTab      = lazy(() => import('../components/backend/LinkRequestsTab.jsx'));
const QuotationTab         = lazy(() => import('../components/backend/QuotationTab.jsx'));
// Phase 13.2.8 (2026-04-26) — list-view StaffSchedulesTab replaced by
// calendar-view EmployeeSchedulesTab (ProClinic-fidelity). Old file
// remains importable until Phase F deletes it.
const EmployeeSchedulesTab = lazy(() => import('../components/backend/EmployeeSchedulesTab.jsx'));
const DoctorSchedulesTab   = lazy(() => import('../components/backend/DoctorSchedulesTab.jsx'));
const DfGroupsTab          = lazy(() => import('../components/backend/DfGroupsTab.jsx'));
import TreatmentFormPage from '../components/TreatmentFormPage.jsx';
import { deleteBackendTreatment, rebuildTreatmentSummary, getCustomer } from '../lib/backendClient.js';
import { setUseTrialServer } from '../lib/brokerClient.js';
import { useTabAccess } from '../hooks/useTabAccess.js';

export default function BackendDashboard({ clinicSettings: parentSettings }) {
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState('clone');
  const [viewingCustomer, setViewingCustomer] = useState(null);
  const [creatingCustomer, setCreatingCustomer] = useState(false);   // V33.2 — full-page Add Customer takeover
  const [editingCustomer, setEditingCustomer] = useState(null);      // V33.3 — full-page Edit Customer takeover (the customer doc to edit)
  const [customerListRefresh, setCustomerListRefresh] = useState(0); // bump after Save so list reloads on return
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

  // Phase 13.5.2 — permission-aware navigation. canAccess() guards the
  // initial deep-link tab AND every handleNavigate call. The redirect
  // useEffect (below) catches the case where permissions arrive after
  // hydration and the active tab is no longer reachable.
  const { canAccess, first: firstAllowedTab, loaded: permsLoaded } = useTabAccess();

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
      // Phase 21.0 (2026-05-06) — legacy ?tab=appointments redirects to the
      // 'appointment-all' sub-tab (semantic preservation — legacy URL was
      // the combined all-types calendar). The old 'appointments' id is no
      // longer in ALL_ITEM_IDS so without this redirect, hydration would
      // silently fall through to the default ('clone') and bookmarks
      // would break. Phase 21.0-bis: redirect target updated from
      // 'appointment-no-deposit' to 'appointment-all' after user added
      // the all-types overview sub-tab.
      const resolvedTab = tab === 'appointments' ? 'appointment-all' : tab;
      if (resolvedTab && ALL_ITEM_IDS.includes(resolvedTab)) {
        setActiveTab(resolvedTab);
        if (resolvedTab === 'finance' && subtab) setFinanceSubTab(subtab);
      }
      setHydrated(true);
    }
  }, []);

  // Phase 13.5.2 — redirect if active tab becomes inaccessible after the
  // permission listener resolves. Idempotent: skips if access is already
  // granted. Runs only after BOTH hydration + perms-loaded so we don't
  // bounce the user during the brief loading window.
  useEffect(() => {
    if (!hydrated || !permsLoaded) return;
    if (canAccess(activeTab)) return;
    // Phase 21.0 (2026-05-06) + 21.0-bis (2026-05-06 EOD) — fallback uses
    // the 'appointment-all' overview sub-tab (combined all-types view, the
    // semantic successor of legacy 'appointments'). Per-branch filter is
    // automatic via BSA.
    const fallback = firstAllowedTab(['appointment-all', 'customers', 'reports', 'sales']);
    if (fallback && fallback !== activeTab) setActiveTab(fallback);
  }, [hydrated, permsLoaded, activeTab, canAccess, firstAllowedTab]);

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
  // Phase 13.5.2 — defense-in-depth: filter at sidebar/palette already hides
  // disallowed tabs, but a malicious / stale call from elsewhere is also
  // blocked here. Permissions still loading? Allow navigation (sidebar can't
  // have rendered the disallowed tab yet, so this is safe).
  const handleNavigate = useCallback((tabId) => {
    if (permsLoaded && !canAccess(tabId)) return;
    // If inside customer detail / sale / finance overlay, exit and switch tab.
    setViewingCustomer(null);
    setSaleMode(false);
    setFinanceMode(false);
    setActiveTab(tabId);
  }, [permsLoaded, canAccess]);

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
      {/* Phase 14.7.H follow-up A — branch selector (auto-hides when <2 branches) */}
      <BranchSelector className="hidden lg:flex" />
      {/* Desktop theme toggle in breadcrumb for a11y — mobile has one in TopBar */}
      <div className="hidden lg:block"><ThemeToggle theme={theme} setTheme={setTheme} /></div>
      {/* Profile dropdown (2026-05-04) — avatar + logout-only menu */}
      <div className="hidden lg:block"><ProfileDropdown /></div>
    </div>
  ) : (
    // Desktop: show theme toggle in a tiny slot (mobile TopBar handles it) +
    // branch selector when ≥2 branches exist (auto-hides via BranchSelector).
    <div className="hidden lg:flex items-center justify-end gap-3">
      <BranchSelector />
      <ThemeToggle theme={theme} setTheme={setTheme} />
      <ProfileDropdown />
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
        {/* Audit P2 (2026-04-26 perf code-split): Suspense boundary catches
            in-flight tab loads. Eager-imported tabs render immediately;
            lazy-imported tabs (reports + heavy modals) trigger this fallback
            for ~50-200ms on first click then cache. Simple spinner — heavy
            visual treatment defeats the perf goal. */}
        <Suspense fallback={
          <div className="flex items-center justify-center py-16 text-[var(--tx-muted)]" data-testid="backend-tab-loading">
            <span className="inline-block w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden="true" />
            <span className="ml-3 text-sm">กำลังโหลด...</span>
          </div>
        }>
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
        ) : editingCustomer ? (
          /* V33.3 — full-page Edit Customer takeover (from CustomerDetailView "แก้ไข" button) */
          <CustomerCreatePage
            mode="edit"
            initialCustomer={editingCustomer}
            onSaved={async () => {
              // Refresh the customer doc so CustomerDetailView shows fresh data on return
              try {
                const fresh = await getCustomer(editingCustomer.id || editingCustomer.proClinicId);
                if (fresh) setViewingCustomer(fresh);
              } catch {}
              setCustomerListRefresh((n) => n + 1);
            }}
            onCancel={() => setEditingCustomer(null)}
          />
        ) : viewingCustomer ? (
          <CustomerDetailView
            customer={viewingCustomer}
            accentColor={ac}
            theme={theme}
            clinicSettings={clinicSettings}
            onBack={() => setViewingCustomer(null)}
            onEditCustomer={() => setEditingCustomer(viewingCustomer)}
            onCreateTreatment={() => setTreatmentFormMode({
              mode: 'create',
              // 2026-04-28: customer.id is the canonical Firestore doc id;
              // proClinicId is denormalized + null for V33-created customers
              // (LC-YY###### prefix). Pre-fix passed null → TreatmentFormPage's
              // customerId-null guard blocked the save → user reported
              // "ลูกค้าใหม่กดบันทึกการรักษาไม่ได้".
              customerId: viewingCustomer.id || viewingCustomer.proClinicId,
              customerHN: viewingCustomer.proClinicHN || viewingCustomer.hn || viewingCustomer.hn_no || '',
              patientName: `${viewingCustomer.patientData?.prefix || ''} ${viewingCustomer.patientData?.firstName || ''} ${viewingCustomer.patientData?.lastName || ''}`.trim(),
              patientData: viewingCustomer.patientData,
            })}
            onEditTreatment={(treatmentId) => setTreatmentFormMode({
              mode: 'edit',
              customerId: viewingCustomer.id || viewingCustomer.proClinicId,
              customerHN: viewingCustomer.proClinicHN || viewingCustomer.hn || viewingCustomer.hn_no || '',
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
        ) : activeTab === 'customers' && creatingCustomer ? (
          /* V33.2 — full-page Add Customer takeover (replaces previous modal) */
          <CustomerCreatePage
            onSaved={() => {
              // Bump CustomerListTab's refresh signal so the new HN appears at the top
              setCustomerListRefresh((n) => n + 1);
            }}
            onCancel={() => setCreatingCustomer(false)}
          />
        ) : activeTab === 'customers' ? (
          <CustomerListTab
            clinicSettings={clinicSettings}
            theme={theme}
            refreshSignal={customerListRefresh}
            onCreateCustomer={() => setCreatingCustomer(true)}
            onViewCustomer={(c) => {
              const url = `${window.location.origin}?backend=1&customer=${c.proClinicId || c.id}`;
              window.open(url, '_blank');
            }}
          />
        ) : activeTab === 'masterdata' ? (
          <MasterDataTab clinicSettings={clinicSettings} theme={theme} />
        ) : (activeTab === 'appointment-all' || activeTab === 'appointment-no-deposit' || activeTab === 'appointment-deposit' || activeTab === 'appointment-treatment-in' || activeTab === 'appointment-follow-up') ? (
          // Phase 21.0 (2026-05-06) + 21.0-bis (2026-05-06 EOD) +
          // 21.0-quater (2026-05-06 EOD continuation hotfix) — ALL 5
          // appointment sub-tabs render a SINGLE <AppointmentCalendarView/>
          // element at ONE syntactic position with a computed prop. This
          // matters because React's reconciler diffs by position; if each
          // sub-tab were its own ternary branch with its own JSX element,
          // React would treat them as different positions → unmount + mount
          // on every sub-tab click → fresh state, empty dayAppts → user
          // sees an empty grid until F5 (the bug user reported "ปรากฎ
          // ตารางเปล่าๆ ... user ต้อง refresh จอถึงเห็น"). With ONE
          // position, React reuses the instance across activeTab changes;
          // only the appointmentType prop updates → typedDayAppts re-derives
          // → grid re-renders instantly with the type-filtered slice.
          //
          // appointmentType prop:
          //   appointment-all          → undefined → component's internal
          //                              typeFilter resolves to null →
          //                              typedDayAppts === dayAppts (no filter)
          //   appointment-no-deposit   → 'no-deposit-booking'
          //   appointment-deposit      → 'deposit-booking'
          //   appointment-treatment-in → 'treatment-in'
          //   appointment-follow-up    → 'follow-up'
          //
          // Per-branch filter via BSA + selectedBranchId is automatic
          // (handled inside AppointmentCalendarView's listener subscription).
          <AppointmentCalendarView
            appointmentType={
              activeTab === 'appointment-no-deposit'   ? 'no-deposit-booking' :
              activeTab === 'appointment-deposit'      ? 'deposit-booking' :
              activeTab === 'appointment-treatment-in' ? 'treatment-in' :
              activeTab === 'appointment-follow-up'    ? 'follow-up' :
              undefined  // 'appointment-all' → no type filter
            }
            clinicSettings={clinicSettings}
            theme={theme}
          />
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
        ) : activeTab === 'central-stock' ? (
          <CentralStockTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'promotions' ? (
          <PromotionTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'coupons' ? (
          <CouponTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'vouchers' ? (
          <VoucherTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'vendor-sales' ? (
          <VendorSalesTab clinicSettings={clinicSettings} theme={theme} />
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
        ) : activeTab === 'reports-pnl' ? (
          <PnLReportTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'reports-payment' ? (
          <PaymentSummaryTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'reports-df-payout' ? (
          <DfPayoutReportTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'reports-remaining-course' ? (
          <RemainingCourseTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'smart-audience' ? (
          <SmartAudienceTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'clinic-report' ? (
          <ClinicReportTab onNavigate={setActiveTab} clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'expense-report' ? (
          <ExpenseReportTab onNavigate={setActiveTab} clinicSettings={clinicSettings} theme={theme} />
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
          <BranchesTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'exam-rooms' ? (
          <ExamRoomsTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'permission-groups' ? (
          <PermissionGroupsTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'staff' ? (
          <StaffTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'doctors' ? (
          <DoctorsTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'products' ? (
          <ProductsTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'courses' ? (
          <CoursesTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'finance-master' ? (
          <FinanceMasterTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'online-sales' ? (
          <OnlineSalesTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'insurance-claims' ? (
          <SaleInsuranceClaimsTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'quotations' ? (
          <QuotationTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'staff-schedules' ? (
          <EmployeeSchedulesTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'doctor-schedules' ? (
          <DoctorSchedulesTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'df-groups' ? (
          <DfGroupsTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'document-templates' ? (
          <DocumentTemplatesTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'line-settings' ? (
          <LineSettingsTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'link-requests' ? (
          <LinkRequestsTab clinicSettings={clinicSettings} theme={theme} />
        ) : activeTab === 'system-settings' ? (
          <SystemSettingsTab />
        ) : null}
        </Suspense>
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
            // Phase 15.7-quater (2026-04-28) — V33 self-created customers
            // (LC-* prefix) have proClinicId=null. Pre-fix used only
            // proClinicId → getCustomer(undefined) → null → setViewingCustomer
            // never fired → customer.treatmentSummary stayed stale →
            // ประวัติการรักษา section showed OLD entries until F5. Mirror
            // the same `id || proClinicId` precedence used at lines 318/325
            // when opening TreatmentFormPage.
            const refreshed = await getCustomer(viewingCustomer?.id || viewingCustomer?.proClinicId);
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
  'reports-remaining-course': 'คอร์สคงเหลือ',
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
