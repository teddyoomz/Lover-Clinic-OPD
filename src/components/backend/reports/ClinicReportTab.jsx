// audit-branch-scope: report — uses {allBranches:true} for cross-branch aggregation
// src/components/backend/reports/ClinicReportTab.jsx — Phase 16.2 root tab
// @phase 16.2 + 16.2-bis (2026-04-29 session 33: inline explanations + 5 wiring fixes)
import { useState, useMemo, useRef } from 'react';
import { BarChart3, AlertCircle } from 'lucide-react';
import { useSelectedBranch } from '../../../lib/BranchContext.jsx';
import { useTabAccess } from '../../../hooks/useTabAccess.js';
import { useClinicReport } from '../../../hooks/useClinicReport.js';
import ClinicReportSidebar from './ClinicReportSidebar.jsx';
import KpiTile from './widgets/KpiTile.jsx';
import RankedTableWidget from './widgets/RankedTableWidget.jsx';
import RetentionHeatmapWidget from './widgets/RetentionHeatmapWidget.jsx';
import BranchComparisonWidget from './widgets/BranchComparisonWidget.jsx';
import MetricExplanationPopover from './widgets/MetricExplanationPopover.jsx';
import { AreaSparkline } from './FancyCharts.jsx';
import { downloadCsv } from '../../../lib/clinicReportCsv.js';
import { fmtMoney } from '../../../lib/financeUtils.js';
import { thaiTodayISO } from '../../../utils.js';
// Phase 16.2-bis: per-metric Thai descriptions + computation contracts.
// Source of truth for the inline explanation popovers + the wiring audit.
import { CLINIC_REPORT_METRIC_SPECS as SPECS } from '../../../lib/clinicReportMetricSpecs.js';

// V32 pattern: direct html2canvas + jspdf, no html2pdf wrapper.
// Lazy-imported to keep initial bundle small.

// Drilldown map: widget key → existing detail tabId (null = no drilldown)
const DRILLDOWN_MAP = {
  revenueTrend:    'reports-revenue',
  newCustomers:    'reports-customer',
  retentionCohort: 'reports-rfm',
  topServices:     'reports-sale',
  topDoctors:      'reports-staff-sales',
  topProducts:     'reports-stock',
  branchCompare:   null,
  cashFlow:        'reports-pnl',
  expenseRatio:    'reports-pnl',
  apptFillRate:    'reports-appointment',
  noShowRate:      'reports-appt-analysis',
  courseUtil:      'reports-remaining-course',
};

function buildPresetRange(presetId) {
  const today = thaiTodayISO();
  const [y, m] = today.split('-').map(Number);
  const iso = (yr, mo, da) =>
    `${yr}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`;
  const subDays = (n) => {
    const dt = new Date(Date.UTC(y, m - 1, today.split('-')[2] - 0) - n * 86400000);
    return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  };
  const subMonths = (n) => {
    const dt = new Date(Date.UTC(y, m - 1 - n, today.split('-')[2] - 0));
    return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  };
  switch (presetId) {
    case 'today':        return { from: today,           to: today };
    case 'thisWeek':     return { from: subDays(6),      to: today };
    case 'thisMonth':    return { from: iso(y, m, 1),    to: today };
    case 'thisQuarter': {
      const qStart = ((Math.ceil(m / 3) - 1) * 3) + 1;
      return { from: iso(y, qStart, 1),                 to: today };
    }
    case 'ytd':          return { from: iso(y, 1, 1),   to: today };
    case 'last6months':  return { from: subMonths(6),   to: today };
    case 'last12months': return { from: subMonths(12),  to: today };
    default:             return null;
  }
}

export default function ClinicReportTab({ onNavigate }) {
  // ── ALL HOOKS FIRST (Rules of Hooks — must be called in same order every render) ─
  // Bug history (2026-04-29):
  //   1. canAccessTab destructure was wrong name — useTabAccess returns `canAccess`
  //      (NOT `canAccessTab`). Calling undefined('clinic-report') threw TypeError →
  //      React unmounted → "black screen" UX. The Task 11 test mock locked in the
  //      wrong name so tests passed (V11 mock-shadowed reality).
  //   2. Permission gate was placed BEFORE useState/useMemo/useClinicReport calls,
  //      violating Rules of Hooks (hooks count would change between renders if
  //      `canAccess` flipped after async config load). All hooks now run first.
  const { branches, branchId: currentBranchId } = useSelectedBranch();
  const { canAccess, isAdmin } = useTabAccess();
  const dashboardRootRef = useRef(null);

  // Branch scoping — admin sees all; non-admin sees only their assigned branch.
  // Defensive `branches || []` in case the provider hasn't resolved yet (legacy callers).
  // Phase 16.2-bis fix (2026-04-29 session 33): match BOTH `b.id` (Firestore
  // doc id) AND `b.branchId` (denormalized alt id field); BranchContext stores
  // selectedBranchId from `def.branchId || def.id` so either is canonical.
  // Pre-fix: when branch.id !== branch.branchId, filter rejected everything →
  // sidebar showed "ไม่มีสาขา" even with 1 branch present.
  const safeBranches = Array.isArray(branches) ? branches : [];
  const matchesCurrentBranch = (b) => {
    const id = String(b?.id || '');
    const altId = String(b?.branchId || '');
    const cur = String(currentBranchId || '');
    if (!cur) return false;
    return id === cur || altId === cur;
  };
  let effectiveBranches = isAdmin
    ? safeBranches
    : safeBranches.filter(matchesCurrentBranch);
  // Safety net: if non-admin filter rejected everything but branches exist,
  // surface the full list (better than locking the user out of the dashboard).
  // Real branch isolation still happens at the orchestrator filter level via
  // `selectedBranchIds` (see useState below).
  if (!effectiveBranches.length && safeBranches.length > 0) {
    effectiveBranches = safeBranches;
  }

  const [selectedBranchIds, setSelectedBranchIds] = useState(() =>
    effectiveBranches.map((b) => b.id),
  );
  const [selectedPresetId, setSelectedPresetId] = useState('last6months');
  const [customRange, setCustomRange] = useState({ from: '', to: '' });
  const [selectedCategories, setSelectedCategories] = useState([
    'revenue', 'customers', 'operations', 'stock', 'branch',
  ]);

  const dateRange = useMemo(() => {
    if (selectedPresetId === 'custom' && customRange.from && customRange.to) {
      return customRange;
    }
    return buildPresetRange(selectedPresetId) || buildPresetRange('last6months');
  }, [selectedPresetId, customRange]);

  const filter = useMemo(
    () => ({
      from: dateRange.from,
      to: dateRange.to,
      branchIds: selectedBranchIds,
      categories: selectedCategories,
    }),
    [dateRange, selectedBranchIds, selectedCategories],
  );

  const { snapshot, loading, error, refresh } = useClinicReport(filter);

  // ── ALL HOOKS DONE — now safe to early-return ────────────────────────────
  if (!canAccess('clinic-report')) {
    return (
      <div className="p-6 text-center text-[var(--tx-muted)]" data-testid="clinic-report-no-access">
        <AlertCircle className="inline mr-2" size={16} />
        ไม่มีสิทธิ์ดูรายงานคลินิก
      </div>
    );
  }

  const handleExportPdf = async () => {
    if (!dashboardRootRef.current) return;
    try {
      // V32 pattern: direct html2canvas + jspdf, no html2pdf wrapper.
      // Lazy-imported to keep initial bundle small.
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      const canvas = await html2canvas(dashboardRootRef.current, {
        scale: 1.5,
        useCORS: true,
        backgroundColor: '#1a1a1a',
      });
      const imgData = canvas.toDataURL('image/png');
      // A4 landscape = 297 × 210 mm; image scaled to fit width
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageWidth = 297;
      const pageHeight = 210;
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * pageWidth) / canvas.width;
      if (imgHeight <= pageHeight) {
        pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      } else {
        // Multi-page: scale to fit width, slice height
        let heightLeft = imgHeight;
        let position = 0;
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
        while (heightLeft > 0) {
          position = -(imgHeight - heightLeft);
          pdf.addPage();
          pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;
        }
      }
      pdf.save(`clinic-report-${dateRange.from}-${dateRange.to}.pdf`);
    } catch (e) {
      console.error('[ClinicReport] PDF export failed', e);
    }
  };

  const handleExportCsv = () => {
    if (!snapshot) return;
    downloadCsv(snapshot, `clinic-report-${dateRange.from}-${dateRange.to}.csv`);
  };

  const showCat = (cat) => selectedCategories.includes(cat);

  return (
    <div className="flex gap-4" data-testid="clinic-report-tab">
      <ClinicReportSidebar
        branches={effectiveBranches}
        selectedBranchIds={selectedBranchIds}
        onBranchChange={setSelectedBranchIds}
        selectedPresetId={selectedPresetId}
        onPresetChange={setSelectedPresetId}
        customRange={customRange}
        onCustomRangeChange={setCustomRange}
        selectedCategories={selectedCategories}
        onCategoryChange={setSelectedCategories}
        onExportPdf={handleExportPdf}
        onExportCsv={handleExportCsv}
        onRefresh={refresh}
        loading={loading}
      />

      <div ref={dashboardRootRef} className="flex-1 space-y-3" data-testid="clinic-report-grid">
        <header className="flex items-center gap-2 mb-2">
          <BarChart3 size={16} className="text-cyan-400" />
          <h2 className="text-base font-bold text-[var(--tx-heading)]">รายงานคลินิก</h2>
          <span className="text-[10px] text-[var(--tx-muted)]">
            {dateRange.from} → {dateRange.to}
          </span>
        </header>

        {error && (
          <div className="text-rose-300 text-xs p-2 bg-rose-900/20 rounded">
            <AlertCircle size={12} className="inline mr-1" />
            {error}
          </div>
        )}

        {snapshot?.meta?.partialErrors && (
          <div className="text-amber-300 text-[10px] p-2 bg-amber-900/20 rounded">
            <AlertCircle size={10} className="inline mr-1" />
            บาง widget โหลดข้อมูลไม่ครบ — กดรีเฟรชเพื่อลองใหม่
          </div>
        )}

        {snapshot && (
          <>
            {/* Row 1: 4 KPI tiles — every tile carries Phase 16.2-bis metricSpec */}
            <div className="grid grid-cols-4 gap-2">
              <KpiTile
                label="รายได้ YTD"
                value={fmtMoney(snapshot.tiles.revenueYtd)}
                drilldownTabId={DRILLDOWN_MAP.revenueTrend}
                onNavigate={onNavigate}
                metricSpec={SPECS.revenueYtd}
              />
              <KpiTile
                label="M-o-M %"
                value={snapshot.tiles.momGrowth == null ? '—' : `${snapshot.tiles.momGrowth}%`}
                tone={snapshot.tiles.momGrowth >= 0 ? 'positive' : 'negative'}
                metricSpec={SPECS.momGrowth}
              />
              <KpiTile
                label="ลูกค้าใหม่/ด."
                value={snapshot.tiles.newCustomersPerMonth.toFixed(1)}
                drilldownTabId={DRILLDOWN_MAP.newCustomers}
                onNavigate={onNavigate}
                metricSpec={SPECS.newCustomersPerMonth}
              />
              <KpiTile
                label="Retention"
                value={`${snapshot.tiles.retentionRate}%`}
                drilldownTabId={DRILLDOWN_MAP.retentionCohort}
                onNavigate={onNavigate}
                metricSpec={SPECS.retentionRate}
              />
            </div>

            {/* Row 2: 4 KPI tiles */}
            <div className="grid grid-cols-4 gap-2">
              <KpiTile
                label="Avg ticket"
                value={fmtMoney(snapshot.tiles.avgTicket)}
                metricSpec={SPECS.avgTicket}
              />
              <KpiTile
                label="Course Util"
                value={`${snapshot.tiles.courseUtilization}%`}
                drilldownTabId={DRILLDOWN_MAP.courseUtil}
                onNavigate={onNavigate}
                metricSpec={SPECS.courseUtilization}
              />
              <KpiTile
                label="No-show %"
                value={`${snapshot.tiles.noShowRate}%`}
                tone="warn"
                drilldownTabId={DRILLDOWN_MAP.noShowRate}
                onNavigate={onNavigate}
                metricSpec={SPECS.noShowRate}
              />
              <KpiTile
                label="Expense %"
                value={`${snapshot.tiles.expenseRatio}%`}
                drilldownTabId={DRILLDOWN_MAP.expenseRatio}
                onNavigate={onNavigate}
                metricSpec={SPECS.expenseRatio}
              />
            </div>

            {/* Revenue + customers charts */}
            {showCat('revenue') && (
              <div className="grid grid-cols-2 gap-2">
                <ChartTile
                  title="📈 Revenue trend M-o-M"
                  data={snapshot.charts.revenueTrend}
                  stroke="#06b6d4"
                  drilldownTabId={DRILLDOWN_MAP.revenueTrend}
                  onNavigate={onNavigate}
                  metricSpec={SPECS.revenueTrend}
                />
                <ChartTile
                  title="📊 New customers M-o-M"
                  data={snapshot.charts.newCustomersTrend}
                  stroke="#10b981"
                  drilldownTabId={DRILLDOWN_MAP.newCustomers}
                  onNavigate={onNavigate}
                  metricSpec={SPECS.newCustomersTrend}
                />
              </div>
            )}

            {/* Operations charts */}
            {showCat('operations') && (
              <div className="grid grid-cols-2 gap-2">
                <ChartTile
                  title="💰 Cash flow"
                  data={snapshot.charts.cashFlow}
                  stroke="#a855f7"
                  drilldownTabId={DRILLDOWN_MAP.cashFlow}
                  onNavigate={onNavigate}
                  metricSpec={SPECS.cashFlow}
                />
                <RetentionHeatmapWidget
                  data={snapshot.charts.retentionCohort}
                  drilldownTabId={DRILLDOWN_MAP.retentionCohort}
                  onNavigate={onNavigate}
                  metricSpec={SPECS.retentionCohort}
                />
              </div>
            )}

            {/* Branch comparison */}
            {showCat('branch') && (
              <BranchComparisonWidget
                data={snapshot.charts.branchComparison}
                fmtMoney={fmtMoney}
                metricSpec={SPECS.branchComparison}
              />
            )}

            {/* Top-10 ranked tables */}
            {showCat('revenue') && (
              <div className="grid grid-cols-3 gap-2">
                <RankedTableWidget
                  title="🏆 Top-10 services"
                  rows={snapshot.tables.topServices}
                  fmtKeys={{ value: 'revenue', qty: 'count' }}
                  drilldownTabId={DRILLDOWN_MAP.topServices}
                  onNavigate={onNavigate}
                  fmtMoney={fmtMoney}
                  testId="ranked-services"
                  metricSpec={SPECS.topServices}
                />
                <RankedTableWidget
                  title="🩺 Top-10 doctors"
                  rows={snapshot.tables.topDoctors}
                  fmtKeys={{ value: 'total' }}
                  drilldownTabId={DRILLDOWN_MAP.topDoctors}
                  onNavigate={onNavigate}
                  fmtMoney={fmtMoney}
                  testId="ranked-doctors"
                  metricSpec={SPECS.topDoctors}
                />
                <RankedTableWidget
                  title="📦 Top-10 products"
                  rows={snapshot.tables.topProducts}
                  fmtKeys={{ value: 'value', qty: 'qty' }}
                  drilldownTabId={DRILLDOWN_MAP.topProducts}
                  onNavigate={onNavigate}
                  fmtMoney={fmtMoney}
                  testId="ranked-products"
                  metricSpec={SPECS.topProducts}
                />
              </div>
            )}
          </>
        )}

        {loading && !snapshot && (
          <p className="text-xs text-[var(--tx-muted)] p-4 text-center">
            กำลังโหลดข้อมูล...
          </p>
        )}
      </div>
    </div>
  );
}

// ─── ChartTile ─────────────────────────────────────────────────────────────
// Phase 16.2-bis: accepts `metricSpec` for inline explanation popover.
function ChartTile({ title, data, stroke, drilldownTabId, onNavigate, metricSpec }) {
  return (
    <div
      className="rounded-lg border border-[var(--bd)] bg-[var(--bg-card)] p-3"
      data-testid={`chart-${title}`}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-300 inline-flex items-center gap-1">
          <span>{title}</span>
          <MetricExplanationPopover spec={metricSpec} testId={`chart-${metricSpec?.id || title}`} />
        </h3>
        {drilldownTabId && (
          <button
            type="button"
            onClick={() => onNavigate?.(drilldownTabId)}
            className="text-[10px] text-cyan-400 hover:text-cyan-300"
            data-drilldown-target={drilldownTabId}
          >
            ดูรายละเอียด →
          </button>
        )}
      </div>
      {data && data.length > 0 ? (
        <AreaSparkline data={data} stroke={stroke} width={400} height={120} />
      ) : (
        <p className="text-[10px] text-[var(--tx-muted)]">
          ไม่มีข้อมูลในช่วงเวลานี้
        </p>
      )}
    </div>
  );
}
