// src/components/backend/reports/ClinicReportTab.jsx — Phase 16.2 root tab
// @phase 16.2
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
import { AreaSparkline } from './FancyCharts.jsx';
import { downloadCsv } from '../../../lib/clinicReportCsv.js';
import { fmtMoney } from '../../../lib/financeUtils.js';
import { thaiTodayISO } from '../../../utils.js';

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
  const { branches, branchId: currentBranchId } = useSelectedBranch();
  const { canAccessTab, isAdmin } = useTabAccess();
  const dashboardRootRef = useRef(null);

  // Permission gate
  if (!canAccessTab('clinic-report')) {
    return (
      <div className="p-6 text-center text-[var(--tx-muted)]" data-testid="clinic-report-no-access">
        <AlertCircle className="inline mr-2" size={16} />
        ไม่มีสิทธิ์ดูรายงานคลินิก
      </div>
    );
  }

  // Branch scoping — admin sees all; non-admin sees only their assigned branch
  const effectiveBranches = isAdmin
    ? branches
    : branches.filter((b) => b.id === currentBranchId);

  const [selectedBranchIds, setSelectedBranchIds] = useState(
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
            {/* Row 1: 4 KPI tiles */}
            <div className="grid grid-cols-4 gap-2">
              <KpiTile
                label="รายได้ YTD"
                value={fmtMoney(snapshot.tiles.revenueYtd)}
                drilldownTabId={DRILLDOWN_MAP.revenueTrend}
                onNavigate={onNavigate}
              />
              <KpiTile
                label="M-o-M %"
                value={snapshot.tiles.momGrowth == null ? '—' : `${snapshot.tiles.momGrowth}%`}
                tone={snapshot.tiles.momGrowth >= 0 ? 'positive' : 'negative'}
              />
              <KpiTile
                label="ลูกค้าใหม่/ด."
                value={snapshot.tiles.newCustomersPerMonth.toFixed(1)}
                drilldownTabId={DRILLDOWN_MAP.newCustomers}
                onNavigate={onNavigate}
              />
              <KpiTile
                label="Retention"
                value={`${snapshot.tiles.retentionRate}%`}
                drilldownTabId={DRILLDOWN_MAP.retentionCohort}
                onNavigate={onNavigate}
              />
            </div>

            {/* Row 2: 4 KPI tiles */}
            <div className="grid grid-cols-4 gap-2">
              <KpiTile
                label="Avg ticket"
                value={fmtMoney(snapshot.tiles.avgTicket)}
              />
              <KpiTile
                label="Course Util"
                value={`${snapshot.tiles.courseUtilization}%`}
                drilldownTabId={DRILLDOWN_MAP.courseUtil}
                onNavigate={onNavigate}
              />
              <KpiTile
                label="No-show %"
                value={`${snapshot.tiles.noShowRate}%`}
                tone="warn"
                drilldownTabId={DRILLDOWN_MAP.noShowRate}
                onNavigate={onNavigate}
              />
              <KpiTile
                label="Expense %"
                value={`${snapshot.tiles.expenseRatio}%`}
                drilldownTabId={DRILLDOWN_MAP.expenseRatio}
                onNavigate={onNavigate}
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
                />
                <ChartTile
                  title="📊 New customers M-o-M"
                  data={snapshot.charts.newCustomersTrend}
                  stroke="#10b981"
                  drilldownTabId={DRILLDOWN_MAP.newCustomers}
                  onNavigate={onNavigate}
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
                />
                <RetentionHeatmapWidget
                  data={snapshot.charts.retentionCohort}
                  drilldownTabId={DRILLDOWN_MAP.retentionCohort}
                  onNavigate={onNavigate}
                />
              </div>
            )}

            {/* Branch comparison */}
            {showCat('branch') && (
              <BranchComparisonWidget
                data={snapshot.charts.branchComparison}
                fmtMoney={fmtMoney}
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
                />
                <RankedTableWidget
                  title="🩺 Top-10 doctors"
                  rows={snapshot.tables.topDoctors}
                  fmtKeys={{ value: 'total' }}
                  drilldownTabId={DRILLDOWN_MAP.topDoctors}
                  onNavigate={onNavigate}
                  fmtMoney={fmtMoney}
                  testId="ranked-doctors"
                />
                <RankedTableWidget
                  title="📦 Top-10 products"
                  rows={snapshot.tables.topProducts}
                  fmtKeys={{ value: 'value', qty: 'qty' }}
                  drilldownTabId={DRILLDOWN_MAP.topProducts}
                  onNavigate={onNavigate}
                  fmtMoney={fmtMoney}
                  testId="ranked-products"
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
function ChartTile({ title, data, stroke, drilldownTabId, onNavigate }) {
  return (
    <div
      className="rounded-lg border border-[var(--bd)] bg-[var(--bg-card)] p-3"
      data-testid={`chart-${title}`}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-300">
          {title}
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
