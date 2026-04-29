// src/components/backend/reports/ExpenseReportTab.jsx — Phase 16.7 (2026-04-29 session 33)
// @phase 16.7
//
// Replicates ProClinic /admin/report/expense (4-section layout) using OUR be_*
// data 100%. Backend-Firestore only — no proclinic-api fetches, no broker
// imports, no upstream-sync reads. Multi-branch aware via filter rail
// (defaults to user's accessible branches, mirrors Phase 16.2).
//
// Sections (per Phase 0 intel — docs/proclinic-scan/_phase0-intel.log):
//   1. รายจ่ายแพทย์          (Doctors)
//   2. รายจ่ายพนักงาน + ผู้ช่วย (Staff)
//   3. รายจ่ายตามหมวดหมู่     (Categories)
//   4. ต้นทุนสินค้า           (Products — DEFERRED to v2)
//
// Iron-clad refs:
//   E         — Firestore-only (see source-grep tests for the forbidden tokens)
//   H + H-quater — be_* canonical (no upstream-sync collection reads)
//   F + F-bis  — Triangle Rule (ProClinic intel captured Phase 0)
//   I         — full-flow simulate at sub-phase end (test bank covers)

import { useState, useMemo, useRef } from 'react';
import { Banknote, AlertCircle, RefreshCcw, Download, FileText } from 'lucide-react';
import { useSelectedBranch } from '../../../lib/BranchContext.jsx';
import { useTabAccess } from '../../../hooks/useTabAccess.js';
import { useExpenseReport } from '../../../hooks/useExpenseReport.js';
import KpiTile from './widgets/KpiTile.jsx';
import ExpenseSectionTable from './widgets/ExpenseSectionTable.jsx';
import { fmtMoney } from '../../../lib/financeUtils.js';
import { thaiTodayISO } from '../../../utils.js';
import DateField from '../../DateField.jsx';
import { EXPENSE_REPORT_METRIC_SPECS as SPECS } from '../../../lib/expenseReportMetricSpecs.js';

const PRESETS = [
  { id: 'today',        label: 'วันนี้' },
  { id: 'thisWeek',     label: 'สัปดาห์นี้' },
  { id: 'thisMonth',    label: 'เดือนนี้' },
  { id: 'thisQuarter',  label: 'ไตรมาสนี้' },
  { id: 'ytd',          label: 'YTD' },
  { id: 'last6months',  label: '6 เดือน' },
  { id: 'last12months', label: '12 เดือน' },
];

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

// CSV export — mirrors Phase 16.2 V32 lock (UTF-8 BOM for Excel-Thai compat).
function downloadExpenseCsv(snapshot, filename) {
  if (!snapshot) return;
  const lines = [];
  lines.push('# รายงานรายจ่ายทั้งหมด');
  lines.push(`# Generated: ${snapshot.meta?.generatedAt || ''}`);
  lines.push(`# Filter: ${JSON.stringify(snapshot.meta?.filterApplied || {})}`);
  lines.push('');

  // Doctors section
  lines.push('# รายจ่ายแพทย์');
  lines.push(['ชื่อแพทย์', 'ค่านั่ง', 'ค่ามือ DF', 'เงินเดือน', 'รายจ่ายอื่นๆ', 'ยอดรวม'].join(','));
  for (const r of (snapshot.sections?.doctors || [])) {
    lines.push([r.name, r.sitFee, r.df, r.salary, r.other, r.total].map(csvCell).join(','));
  }
  lines.push('');

  // Staff section
  lines.push('# รายจ่ายพนักงาน + ผู้ช่วย');
  lines.push(['ชื่อ', 'ตำแหน่ง', 'ค่ามือ', 'เงินเดือน', 'รายจ่ายอื่นๆ', 'ยอดรวม'].join(','));
  for (const r of (snapshot.sections?.staff || [])) {
    lines.push([r.name, r.position, r.df, r.salary, r.other, r.total].map(csvCell).join(','));
  }
  lines.push('');

  // Categories section
  lines.push('# รายจ่ายตามหมวดหมู่');
  lines.push(['หมวดหมู่', 'จำนวนรายการ', 'ยอดรวม'].join(','));
  for (const r of (snapshot.sections?.categories || [])) {
    lines.push([r.categoryName, r.count, r.total].map(csvCell).join(','));
  }

  const csv = '﻿' + lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(v) {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export default function ExpenseReportTab({ onNavigate, clinicSettings, theme }) {
  // ALL HOOKS FIRST (Rules of Hooks; same lesson as Phase 16.2 black-screen fix)
  const { branches, branchId: currentBranchId } = useSelectedBranch();
  const { canAccess, isAdmin } = useTabAccess();
  const dashboardRootRef = useRef(null);

  // Phase 16.2-bis fix mirror: match BOTH b.id and b.branchId; never lock
  // user out when branches exist but filter rejected everything.
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
  if (!effectiveBranches.length && safeBranches.length > 0) {
    effectiveBranches = safeBranches;
  }

  const [selectedBranchIds, setSelectedBranchIds] = useState(() =>
    effectiveBranches.map((b) => b.id),
  );
  const [selectedPresetId, setSelectedPresetId] = useState('thisMonth');
  const [customRange, setCustomRange] = useState({ from: '', to: '' });

  const dateRange = useMemo(() => {
    if (selectedPresetId === 'custom' && customRange.from && customRange.to) {
      return customRange;
    }
    return buildPresetRange(selectedPresetId) || buildPresetRange('thisMonth');
  }, [selectedPresetId, customRange]);

  const filter = useMemo(
    () => ({
      from: dateRange.from,
      to: dateRange.to,
      branchIds: selectedBranchIds,
    }),
    [dateRange, selectedBranchIds],
  );

  const { snapshot, loading, error, refresh } = useExpenseReport(filter);

  // Permission gate — runs AFTER hooks (Rules of Hooks)
  if (!canAccess('expense-report')) {
    return (
      <div className="p-6 text-center text-[var(--tx-muted)]" data-testid="expense-report-no-access">
        <AlertCircle className="inline mr-2" size={16} />
        ไม่มีสิทธิ์ดูรายงานรายจ่าย
      </div>
    );
  }

  const toggleBranch = (id) => {
    const next = selectedBranchIds.includes(id)
      ? selectedBranchIds.filter(x => x !== id)
      : [...selectedBranchIds, id];
    setSelectedBranchIds(next);
  };

  const handleExportPdf = async () => {
    if (!dashboardRootRef.current) return;
    try {
      // V32 lock: direct html2canvas + jspdf (NOT the html-pdf wrapper).
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
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageWidth = 297, pageHeight = 210;
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * pageWidth) / canvas.width;
      if (imgHeight <= pageHeight) {
        pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      } else {
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
      pdf.save(`expense-report-${dateRange.from}-${dateRange.to}.pdf`);
    } catch (e) {
      // V32 lesson: surface error in UI not just console
      console.error('[ExpenseReport] PDF export failed', e);
    }
  };

  const handleExportCsv = () => {
    downloadExpenseCsv(snapshot, `expense-report-${dateRange.from}-${dateRange.to}.csv`);
  };

  // Doctor section column definitions
  const DOCTOR_COLUMNS = [
    { key: 'name',   label: 'ชื่อแพทย์',   align: 'left' },
    { key: 'sitFee', label: 'ค่านั่ง',     align: 'right', isMoney: true },
    { key: 'df',     label: 'ค่ามือ',      align: 'right', isMoney: true },
    { key: 'salary', label: 'เงินเดือน',  align: 'right', isMoney: true },
    { key: 'other',  label: 'รายจ่ายอื่นๆ', align: 'right', isMoney: true },
    { key: 'total',  label: 'ยอดรวม',     align: 'right', isMoney: true },
  ];
  const STAFF_COLUMNS = [
    { key: 'name',     label: 'ชื่อ',        align: 'left' },
    { key: 'position', label: 'ตำแหน่ง',    align: 'left' },
    { key: 'df',       label: 'ค่ามือ',      align: 'right', isMoney: true },
    { key: 'salary',   label: 'เงินเดือน',  align: 'right', isMoney: true },
    { key: 'other',    label: 'รายจ่ายอื่นๆ', align: 'right', isMoney: true },
    { key: 'total',    label: 'ยอดรวม',     align: 'right', isMoney: true },
  ];
  const CATEGORY_COLUMNS = [
    { key: 'categoryName', label: 'หมวดหมู่',     align: 'left' },
    { key: 'count',        label: 'จำนวนรายการ', align: 'right' },
    { key: 'total',        label: 'ยอดรวม',     align: 'right', isMoney: true },
  ];

  const summary = snapshot?.summary || null;
  const sections = snapshot?.sections || { doctors: [], staff: [], categories: [], products: [] };

  return (
    <div className="flex gap-4" data-testid="expense-report-tab">
      {/* Filter rail */}
      <aside
        className="w-[200px] shrink-0 sticky top-4 space-y-4 self-start"
        data-testid="expense-report-sidebar"
      >
        <Section title="🏥 สาขา">
          {effectiveBranches.map(b => (
            <label
              key={b.id}
              className="flex items-center gap-1.5 text-xs cursor-pointer hover:text-rose-400"
              data-branch-id={b.id}
            >
              <input
                type="checkbox"
                checked={selectedBranchIds.includes(b.id)}
                onChange={() => toggleBranch(b.id)}
                aria-label={b.name}
              />
              <span>{b.name}</span>
            </label>
          ))}
          {effectiveBranches.length === 0 && (
            // Phase 16.7-ter — better empty state. When be_branches is empty
            // (typical when admin hasn't migrated upstream-sync data yet),
            // the report still renders ALL data (branchIds=[] = no branch
            // filter). User just doesn't see a branch selector.
            <p className="text-[9px] text-[var(--tx-muted)] leading-relaxed" data-testid="expense-report-no-branches-hint">
              ใช้ข้อมูลทุกสาขา (ยังไม่ได้นำเข้า be_branches — ไปที่
              <span className="text-amber-300"> ข้อมูลพื้นฐาน → Sync ProClinic</span> เพื่อนำเข้า)
            </p>
          )}
        </Section>

        <Section title="📅 ช่วงเวลา">
          {PRESETS.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedPresetId(p.id)}
              data-active={selectedPresetId === p.id ? 'true' : 'false'}
              data-preset={p.id}
              className={`block w-full text-left px-2 py-1 rounded text-xs transition-colors ${
                selectedPresetId === p.id
                  ? 'bg-rose-700/30 text-rose-200 border-l-2 border-rose-400'
                  : 'text-[var(--tx-muted)] hover:bg-[var(--bg-hover)] hover:text-rose-400'
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSelectedPresetId('custom')}
            data-active={selectedPresetId === 'custom' ? 'true' : 'false'}
            data-preset="custom"
            className={`block w-full text-left px-2 py-1 rounded text-xs transition-colors mt-1 ${
              selectedPresetId === 'custom'
                ? 'bg-rose-700/30 text-rose-200'
                : 'text-[var(--tx-muted)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            กำหนดเอง
          </button>
          {selectedPresetId === 'custom' && (
            <div className="space-y-1 mt-2" data-testid="custom-range-fields">
              <DateField
                label="จาก"
                value={customRange.from}
                onChange={(v) => setCustomRange({ ...customRange, from: v })}
              />
              <DateField
                label="ถึง"
                value={customRange.to}
                onChange={(v) => setCustomRange({ ...customRange, to: v })}
              />
            </div>
          )}
        </Section>

        <Section title="🛠️ การกระทำ">
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs rounded hover:bg-[var(--bg-hover)] text-[var(--tx-muted)] hover:text-rose-400 disabled:opacity-40"
            data-testid="expense-report-refresh"
          >
            <RefreshCcw size={12} className={loading ? 'animate-spin' : ''} />
            <span>รีเฟรช</span>
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!snapshot}
            className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs rounded hover:bg-[var(--bg-hover)] text-[var(--tx-muted)] hover:text-emerald-400 disabled:opacity-40"
            data-testid="expense-report-export-csv"
          >
            <Download size={12} />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={!snapshot}
            className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs rounded hover:bg-[var(--bg-hover)] text-[var(--tx-muted)] hover:text-rose-400 disabled:opacity-40"
            data-testid="expense-report-export-pdf"
          >
            <FileText size={12} />
            <span>Export PDF</span>
          </button>
        </Section>
      </aside>

      {/* Main content */}
      <div ref={dashboardRootRef} className="flex-1 space-y-3" data-testid="expense-report-grid">
        <header className="flex items-center gap-2 mb-2">
          <Banknote size={16} className="text-rose-400" />
          <h2 className="text-base font-bold text-[var(--tx-heading)]">รายจ่ายทั้งหมด</h2>
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
            บาง section โหลดข้อมูลไม่ครบ — กดรีเฟรชเพื่อลองใหม่
          </div>
        )}

        {snapshot && summary && (
          <>
            {/* Summary tiles — 4 KPIs */}
            <div className="grid grid-cols-4 gap-2">
              <KpiTile
                label="รายจ่ายรวม"
                value={fmtMoney(summary.totalAll)}
                metricSpec={SPECS.totalAll}
              />
              <KpiTile
                label="ค่ามือแพทย์"
                value={fmtMoney(summary.totalDoctorDf)}
                metricSpec={SPECS.totalDoctorDf}
              />
              <KpiTile
                label="ค่ามือพนักงาน+ผู้ช่วย"
                value={fmtMoney(summary.totalStaffDf)}
                metricSpec={SPECS.totalStaffDf}
              />
              <KpiTile
                label="จำนวนรายการ"
                value={Number(summary.totalCategoryCount || 0).toLocaleString('th-TH')}
                metricSpec={SPECS.totalCount}
              />
            </div>

            {/* Doctor section */}
            <ExpenseSectionTable
              title="รายจ่ายแพทย์"
              rows={sections.doctors || []}
              columns={DOCTOR_COLUMNS}
              totals={summary ? {
                name: '',
                sitFee: summary.totalDoctorSit,
                df:     summary.totalDoctorDf,
                salary: summary.totalDoctorSalary,
                other:  summary.totalDoctorOther,
                total:  summary.totalDoctor,
              } : null}
              metricSpec={SPECS.sectionDoctors}
              testId="expense-section-doctors"
              titleColor="text-rose-300"
            />

            {/* Staff section */}
            <ExpenseSectionTable
              title="รายจ่ายพนักงาน + ผู้ช่วย"
              rows={sections.staff || []}
              columns={STAFF_COLUMNS}
              totals={summary ? {
                name: '',
                position: '',
                df:     summary.totalStaffDf,
                salary: summary.totalStaffSalary,
                other:  summary.totalStaffOther,
                total:  summary.totalStaff,
              } : null}
              metricSpec={SPECS.sectionStaff}
              testId="expense-section-staff"
              titleColor="text-amber-300"
            />

            {/* Category section */}
            <ExpenseSectionTable
              title="รายจ่ายตามหมวดหมู่"
              rows={sections.categories || []}
              columns={CATEGORY_COLUMNS}
              totals={summary ? {
                categoryName: '',
                count: sections.categories?.reduce((s, r) => s + (Number(r.count) || 0), 0) || 0,
                total: summary.totalCategory,
              } : null}
              metricSpec={SPECS.sectionCategories}
              testId="expense-section-categories"
              titleColor="text-cyan-300"
            />

            {/* Product section — placeholder until v2 ships */}
            <div
              className="rounded-lg border border-dashed border-[var(--bd)] bg-[var(--bg-card)] p-3 text-center"
              data-testid="expense-section-products-placeholder"
            >
              <p className="text-[11px] text-[var(--tx-muted)]">
                ⚙️ ต้นทุนสินค้า — กำลังพัฒนา (Phase 16.7-bis: cost cascade audit ก่อน)
              </p>
            </div>
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

// ─── Sidebar Section helper ─────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--tx-muted)] mb-1">
        {title}
      </div>
      {children}
    </div>
  );
}
