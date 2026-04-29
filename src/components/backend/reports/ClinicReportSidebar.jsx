// src/components/backend/reports/ClinicReportSidebar.jsx — Phase 16.2
import { Download, FileText, RefreshCcw, Calendar } from 'lucide-react';
import DateField from '../../DateField.jsx';

const PRESETS = [
  { id: 'today',        label: 'วันนี้' },
  { id: 'thisWeek',     label: 'สัปดาห์นี้' },
  { id: 'thisMonth',    label: 'เดือนนี้' },
  { id: 'thisQuarter',  label: 'ไตรมาสนี้' },
  { id: 'ytd',          label: 'YTD' },
  { id: 'last6months',  label: '6 เดือน' },
  { id: 'last12months', label: '12 เดือน' },
];

const CATEGORIES = [
  { id: 'revenue',    label: 'รายได้' },
  { id: 'customers',  label: 'ลูกค้า' },
  { id: 'operations', label: 'ปฏิบัติการ' },
  { id: 'stock',      label: 'สต็อค' },
  { id: 'branch',     label: 'สาขา' },
];

export default function ClinicReportSidebar({
  branches,
  selectedBranchIds, onBranchChange,
  selectedPresetId, onPresetChange,
  customRange, onCustomRangeChange,
  selectedCategories, onCategoryChange,
  onExportPdf, onExportCsv, onRefresh,
  loading = false,
}) {
  const isCustom = selectedPresetId === 'custom';

  const toggleBranch = (id) => {
    const next = selectedBranchIds.includes(id)
      ? selectedBranchIds.filter(x => x !== id)
      : [...selectedBranchIds, id];
    onBranchChange(next);
  };

  const toggleCategory = (id) => {
    const next = selectedCategories.includes(id)
      ? selectedCategories.filter(x => x !== id)
      : [...selectedCategories, id];
    onCategoryChange(next);
  };

  return (
    <aside
      className="w-[200px] shrink-0 sticky top-4 space-y-4 self-start"
      data-testid="clinic-report-sidebar"
    >
      {/* Branch filter */}
      <Section title="🏥 สาขา">
        {branches.map(b => (
          <label
            key={b.id}
            className="flex items-center gap-1.5 text-xs cursor-pointer hover:text-cyan-400"
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
        {branches.length === 0 && (
          <p className="text-[10px] text-[var(--tx-muted)]">ไม่มีสาขา</p>
        )}
      </Section>

      {/* Date range presets */}
      <Section title="📅 ช่วงเวลา">
        {PRESETS.map(p => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPresetChange(p.id)}
            data-active={selectedPresetId === p.id ? 'true' : 'false'}
            data-preset={p.id}
            className={`block w-full text-left px-2 py-1 rounded text-xs transition-colors ${
              selectedPresetId === p.id
                ? 'bg-cyan-700/30 text-cyan-200 border-l-2 border-cyan-400'
                : 'text-[var(--tx-muted)] hover:bg-[var(--bg-hover)] hover:text-cyan-400'
            }`}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onPresetChange('custom')}
          data-active={isCustom ? 'true' : 'false'}
          data-preset="custom"
          className={`block w-full text-left px-2 py-1 rounded text-xs transition-colors mt-1 ${
            isCustom
              ? 'bg-cyan-700/30 text-cyan-200'
              : 'text-[var(--tx-muted)] hover:bg-[var(--bg-hover)]'
          }`}
        >
          <Calendar size={10} className="inline mr-1" />Custom...
        </button>
        {isCustom && (
          <div className="mt-2 space-y-1">
            <DateField
              size="sm"
              value={customRange?.from || ''}
              onChange={(v) =>
                onCustomRangeChange({ from: v, to: customRange?.to || '' })
              }
            />
            <DateField
              size="sm"
              value={customRange?.to || ''}
              onChange={(v) =>
                onCustomRangeChange({ from: customRange?.from || '', to: v })
              }
            />
          </div>
        )}
      </Section>

      {/* Category toggles */}
      <Section title="⚙️ หมวด">
        {CATEGORIES.map(c => (
          <label
            key={c.id}
            className="flex items-center gap-1.5 text-xs cursor-pointer hover:text-cyan-400"
          >
            <input
              type="checkbox"
              checked={selectedCategories.includes(c.id)}
              onChange={() => toggleCategory(c.id)}
              aria-label={c.label}
            />
            <span>{c.label}</span>
          </label>
        ))}
      </Section>

      {/* Export / Refresh */}
      <Section title="📤 Export">
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          aria-label="Refresh"
          className="flex items-center gap-1 w-full px-2 py-1.5 text-xs rounded bg-[var(--bg-hover)] hover:bg-cyan-900/30 text-cyan-300 disabled:opacity-50"
        >
          <RefreshCcw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
        <button
          type="button"
          onClick={onExportPdf}
          disabled={loading}
          aria-label="Export PDF"
          className="flex items-center gap-1 w-full px-2 py-1.5 text-xs rounded bg-[var(--bg-hover)] hover:bg-rose-900/30 text-rose-300 mt-1 disabled:opacity-50"
        >
          <FileText size={12} /> PDF
        </button>
        <button
          type="button"
          onClick={onExportCsv}
          disabled={loading}
          aria-label="Export CSV"
          className="flex items-center gap-1 w-full px-2 py-1.5 text-xs rounded bg-[var(--bg-hover)] hover:bg-emerald-900/30 text-emerald-300 mt-1 disabled:opacity-50"
        >
          <Download size={12} /> CSV
        </button>
      </Section>
    </aside>
  );
}

function Section({ title, children }) {
  return (
    <div className="rounded-lg border border-[var(--bd)] bg-[var(--bg-card)] p-2 space-y-1">
      <h3 className="text-[10px] uppercase tracking-wider text-cyan-400 font-bold mb-1">
        {title}
      </h3>
      {children}
    </div>
  );
}
