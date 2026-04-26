// ─── RevenueAnalysisTab — Phase 10.7 ──────────────────────────────────────
// Replicates ProClinic /admin/revenue-analysis-by-procedure — 10 cols +
// type/category paid-amount summary bars (replaces deferred pie charts).
//
// Triangle-verified 2026-04-20 via opd.js intel:
//   Table 10 cols: procedureType / category / courseName / promotion /
//                  qty / lineTotal / depositApplied / walletApplied /
//                  refundAmount / paidAmount
//   Filters: period (date range) · procedure_type_name · course_category_name
//
// Data: be_sales.items.courses[] + master_data/courses. Firestore-only.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { TrendingUp, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import ReportShell from './ReportShell.jsx';
import DateRangePicker, { buildPresets } from './DateRangePicker.jsx';
import FancyDonut from './FancyDonut.jsx';
import { RadialBars } from './FancyCharts.jsx';
import {
  aggregateRevenueByProcedure,
  buildRevenueColumns,
} from '../../../lib/revenueAnalysisAggregator.js';
import { loadSalesByDateRange } from '../../../lib/reportsLoaders.js';
// Phase 14.10-tris (2026-04-26) — be_courses canonical
import { listCourses } from '../../../lib/backendClient.js';
import { downloadCSV } from '../../../lib/csvExport.js';
import { fmtMoney } from '../../../lib/financeUtils.js';
import { sortBy } from '../../../lib/reportsUtils.js';

const SORTABLE = {
  procedureType:  { key: 'procedureType',  type: 'string', label: 'ประเภทหัตถการ' },
  category:       { key: 'category',       type: 'string', label: 'หมวดหมู่' },
  courseName:     { key: 'courseName',     type: 'string', label: 'คอร์ส' },
  qty:            { key: 'qty',            type: 'number', label: 'จำนวน' },
  lineTotal:      { key: 'lineTotal',      type: 'number', label: 'ยอดรวม' },
  paidAmount:     { key: 'paidAmount',     type: 'number', label: 'ยอดชำระเงิน' },
};

export default function RevenueAnalysisTab({ clinicSettings, theme }) {
  const initialPreset = useMemo(() => buildPresets().find(p => p.id === 'thisMonth'), []);
  const [from, setFrom] = useState(initialPreset.from);
  const [to, setTo] = useState(initialPreset.to);
  const [presetId, setPresetId] = useState(initialPreset.id);
  const [searchText, setSearchText] = useState('');
  const [procedureTypeFilter, setProcedureTypeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortKey, setSortKey] = useState('paidAmount');
  const [sortDir, setSortDir] = useState('desc');
  const [sales, setSales] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let abort = false;
    setLoading(true); setError('');
    Promise.all([
      loadSalesByDateRange({ from, to }),
      listCourses(),
    ])
      .then(([s, c]) => { if (!abort) { setSales(s); setCourses(c); } })
      .catch(e => { if (!abort) setError(e?.message || 'โหลดข้อมูลล้มเหลว'); })
      .finally(() => { if (!abort) setLoading(false); });
    return () => { abort = true; };
  }, [from, to, reloadKey]);

  const out = useMemo(
    () => aggregateRevenueByProcedure(sales, courses, {
      from, to, procedureType: procedureTypeFilter, category: categoryFilter, searchText,
    }),
    [sales, courses, from, to, procedureTypeFilter, categoryFilter, searchText]
  );

  const sortedRows = useMemo(() => {
    if (sortKey === 'paidAmount' && sortDir === 'desc') return out.rows;
    const meta = SORTABLE[sortKey];
    if (!meta) return out.rows;
    return sortBy(out.rows, r => {
      const v = r?.[meta.key];
      if (meta.type === 'number') return Number(v) || 0;
      return v || '';
    }, sortDir);
  }, [out.rows, sortKey, sortDir]);

  const typeOptions = useMemo(() => {
    const set = new Set(['ไม่ระบุ']);
    for (const c of courses) {
      const t = (c?.procedure_type_name || c?.procedureType || '').trim();
      if (t) set.add(t);
    }
    return [{ v: 'all', t: 'ทุกประเภทหัตถการ' }, ...[...set].sort().map(t => ({ v: t, t }))];
  }, [courses]);

  const categoryOptions = useMemo(() => {
    const set = new Set(['ไม่ระบุ']);
    for (const c of courses) {
      const cat = (c?.category_name || c?.category || '').trim();
      if (cat) set.add(cat);
    }
    return [{ v: 'all', t: 'ทุกหมวดหมู่' }, ...[...set].sort().map(c => ({ v: c, t: c }))];
  }, [courses]);

  const columns = useMemo(() => buildRevenueColumns({ fmtMoney }), []);

  const handleRangeChange = useCallback(({ from: f, to: t, presetId: id }) => {
    setFrom(f); setTo(t); setPresetId(id);
  }, []);

  const handleExport = useCallback(() => {
    downloadCSV(`revenue-by-procedure_${from}_to_${to}`, sortedRows, columns);
  }, [sortedRows, columns, from, to]);

  const handleRefresh = useCallback(() => setReloadKey(k => k + 1), []);

  const handleSort = useCallback((key, forceToggle = false) => {
    setSortKey(prev => {
      if (forceToggle) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return prev; }
      if (prev === key) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return prev; }
      setSortDir(SORTABLE[key]?.type === 'number' ? 'desc' : 'asc');
      return key;
    });
  }, []);

  return (
    <ReportShell
      icon={TrendingUp}
      title="วิเคราะห์รายได้ตามหัตถการ"
      subtitle={`${from} → ${to}`}
      totalCount={out.meta.totalLines}
      filteredCount={out.meta.filteredLines}
      onExport={handleExport}
      exportDisabled={out.meta.filteredLines === 0}
      onRefresh={handleRefresh}
      loading={loading}
      error={error}
      emptyText="ยังไม่มีรายการขายคอร์สในช่วงนี้"
      notFoundText="ไม่พบรายการตามตัวกรอง"
      clinicSettings={clinicSettings}
      dateRangeSlot={
        <DateRangePicker from={from} to={to} presetId={presetId} onChange={handleRangeChange} />
      }
      filtersSlot={
        <FiltersRow
          searchText={searchText} setSearchText={setSearchText}
          procedureTypeFilter={procedureTypeFilter} setProcedureTypeFilter={setProcedureTypeFilter}
          categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter}
          typeOptions={typeOptions} categoryOptions={categoryOptions}
        />
      }
    >
      <div className="space-y-4">
        <ChartSection
          typeSummary={out.meta.typeSummary}
          categorySummary={out.meta.categorySummary}
          onPickType={setProcedureTypeFilter}
          onPickCategory={setCategoryFilter}
          activeType={procedureTypeFilter}
          activeCategory={categoryFilter}
        />
        <MobileSortBar sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
        <RevenueMobileList rows={sortedRows} />
        <RevenueDesktopTable rows={sortedRows} totals={out.totals} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
      </div>
    </ReportShell>
  );
}

function FiltersRow({
  searchText, setSearchText,
  procedureTypeFilter, setProcedureTypeFilter,
  categoryFilter, setCategoryFilter,
  typeOptions, categoryOptions,
}) {
  const inputCls = "px-2 py-2 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] w-full sm:w-auto";
  const selectCls = `${inputCls} sm:min-w-[180px]`;
  return (
    <>
      <input
        type="text"
        value={searchText}
        onChange={e => setSearchText(e.target.value)}
        placeholder="ค้นหา คอร์ส / โปรโมชัน"
        className={`${inputCls} sm:min-w-[220px] sm:flex-1`}
        data-testid="revenue-filter-search"
      />
      <div className="grid grid-cols-1 sm:flex sm:flex-none gap-2 sm:gap-3">
        <select
          value={procedureTypeFilter}
          onChange={e => setProcedureTypeFilter(e.target.value)}
          className={selectCls}
          data-testid="revenue-filter-type"
        >
          {typeOptions.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
        </select>
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className={selectCls}
          data-testid="revenue-filter-category"
        >
          {categoryOptions.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
        </select>
      </div>
    </>
  );
}

/** Dual-chart section: FancyDonut (procedure type) + RadialBars (category).
 *  Clicking a slice/bar sets the corresponding filter — interactive drill. */
function ChartSection({ typeSummary, categorySummary, onPickType, onPickCategory, activeType, activeCategory }) {
  const safeTypes = (typeSummary || []).filter(t => t.paidAmount > 0).slice(0, 12);
  const safeCats = (categorySummary || []).filter(c => c.paidAmount > 0).slice(0, 10);

  if (safeTypes.length === 0 && safeCats.length === 0) return null;

  const donutData = safeTypes.map(t => ({ label: t.type, value: t.paidAmount, pct: t.pct }));
  const radialData = safeCats.map(c => ({ label: c.category, value: c.paidAmount, pct: c.pct }));

  const totalPaid = safeTypes.reduce((s, t) => s + t.paidAmount, 0)
                 || safeCats.reduce((s, c) => s + c.paidAmount, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 rounded-xl border border-[var(--bd)] bg-[var(--bg-card)]">
      {safeTypes.length > 0 && (
        <div className="flex flex-col items-center" data-testid="revenue-chart-type">
          <FancyDonut
            data={donutData}
            size={260}
            innerRadius={72}
            outerRadius={115}
            title="สัดส่วนตามประเภทหัตถการ"
            centerLabel="ยอดชำระเงิน"
            centerValue={`${fmtMoney(totalPaid)} ฿`}
            formatValue={(v) => `${fmtMoney(v)} ฿`}
            onSegmentClick={(seg) => {
              onPickType(activeType === seg.label ? 'all' : seg.label);
            }}
          />
        </div>
      )}
      {safeCats.length > 0 && (
        <div className="flex flex-col items-center" data-testid="revenue-chart-category">
          <RadialBars
            data={radialData}
            size={260}
            title="สัดส่วนตามหมวดหมู่ (Top 10)"
            formatValue={(v) => `${fmtMoney(v)} ฿`}
            onBarClick={(bar) => {
              onPickCategory(activeCategory === bar.label ? 'all' : bar.label);
            }}
          />
        </div>
      )}
    </div>
  );
}

/** Horizontal bar chart (legacy summary row — kept for reference; unused). */
function SummaryBars({ title, summary, labelKey }) {
  if (!summary || summary.length === 0) return null;
  const max = Math.max(...summary.map(s => s.paidAmount), 1);
  return (
    <div data-testid={`revenue-summary-${labelKey}`}>
      <h3 className="text-xs uppercase tracking-wider text-[var(--tx-muted)] font-bold mb-2">{title}</h3>
      <div className="space-y-1 rounded-lg border border-[var(--bd)] bg-[var(--bg-card)] p-3">
        {summary.map((s, i) => {
          const width = Math.round((s.paidAmount / max) * 100);
          const label = s[labelKey] || 'ไม่ระบุ';
          return (
            <div key={`${label}-${i}`} className="flex items-center gap-2 text-xs">
              <div className="w-28 shrink-0 truncate text-[var(--tx-secondary)]" title={label}>{label}</div>
              <div className="flex-1 h-5 rounded bg-[var(--bg-hover)] overflow-hidden relative">
                <div
                  className="h-full bg-gradient-to-r from-amber-600 to-amber-400"
                  style={{ width: `${width}%` }}
                />
                <div className="absolute inset-0 flex items-center justify-between px-2">
                  <span className="text-[10px] font-bold text-[var(--tx-primary)] tabular-nums">
                    {fmtMoney(s.paidAmount)}
                  </span>
                  <span className="text-[10px] text-[var(--tx-muted)] tabular-nums">
                    {s.pct.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MobileSortBar({ sortKey, sortDir, onSort }) {
  return (
    <div className="lg:hidden flex items-center gap-2 px-1">
      <label className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-bold shrink-0">เรียง</label>
      <select
        value={sortKey}
        onChange={e => onSort(e.target.value, false)}
        className="flex-1 px-2 py-1.5 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]"
        data-testid="mobile-sort-key"
      >
        {Object.entries(SORTABLE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </select>
      <button
        type="button"
        onClick={() => onSort(sortKey, true)}
        className="px-2.5 py-1.5 rounded text-xs font-bold border border-[var(--bd)] bg-[var(--bg-hover)] text-cyan-300"
        aria-label={sortDir === 'asc' ? 'น้อย→มาก' : 'มาก→น้อย'}
      >
        {sortDir === 'asc' ? <ArrowUp size={12} className="inline" /> : <ArrowDown size={12} className="inline" />}
      </button>
    </div>
  );
}

function RevenueMobileList({ rows }) {
  return (
    <div className="lg:hidden space-y-2" data-testid="revenue-mobile-list">
      {rows.map((r, i) => (
        <div
          key={`${r.courseId || r.courseName}-${i}`}
          className="rounded-xl border border-[var(--bd)] bg-[var(--bg-card)] p-3.5 shadow-sm"
          data-testid={`revenue-mobile-row-${i}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] text-[var(--tx-muted)] truncate">
                <span>{r.procedureType}</span>
                <span className="opacity-50"> · </span>
                <span>{r.category}</span>
              </div>
              <h3 className="text-sm font-bold text-[var(--tx-primary)] leading-snug break-words">
                {r.courseName}
              </h3>
              {r.promotionName && r.promotionName !== '-' && (
                <div className="text-[10px] text-amber-400 mt-0.5 font-bold">{r.promotionName}</div>
              )}
            </div>
            <div className="text-right shrink-0">
              <div className="text-[9px] uppercase text-[var(--tx-muted)] tracking-wider">จำนวน</div>
              <div className="text-sm font-black tabular-nums">{r.qty}</div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 pt-2 border-t border-[var(--bd)] text-[10px]">
            <div>
              <div className="text-[9px] uppercase text-[var(--tx-muted)]">ยอดรวม</div>
              <div className="text-xs font-bold tabular-nums">{fmtMoney(r.lineTotal)}</div>
            </div>
            <div className="text-right">
              <div className="text-[9px] uppercase text-[var(--tx-muted)]">ยอดชำระเงิน</div>
              <div className="text-sm font-black tabular-nums text-emerald-400">{fmtMoney(r.paidAmount)} ฿</div>
            </div>
          </div>

          {(r.depositApplied > 0 || r.walletApplied > 0 || r.refundAmount > 0) && (
            <div className="mt-2 pt-2 border-t border-[var(--bd)] flex flex-wrap gap-x-2.5 gap-y-1 text-[10px] text-[var(--tx-muted)] justify-end">
              {r.depositApplied > 0 && <span>−มัดจำ <span className="text-[var(--tx-secondary)] font-bold tabular-nums">{fmtMoney(r.depositApplied)}</span></span>}
              {r.walletApplied > 0 && <span>−Wallet <span className="text-[var(--tx-secondary)] font-bold tabular-nums">{fmtMoney(r.walletApplied)}</span></span>}
              {r.refundAmount > 0 && <span>−คืน <span className="text-rose-400 font-bold tabular-nums">{fmtMoney(r.refundAmount)}</span></span>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SortHeader({ sortKey, currentKey, currentDir, onSort, align = 'left', children }) {
  const isActive = currentKey === sortKey;
  const Arrow = isActive ? (currentDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th scope="col" className={`px-3 py-2 ${align === 'right' ? 'text-right' : 'text-left'} font-bold whitespace-nowrap`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 select-none transition-colors ${
          isActive ? 'text-cyan-300' : 'text-[var(--tx-muted)] hover:text-[var(--tx-secondary)]'
        }`}
        data-testid={`sort-${sortKey}`}
      >
        <span>{children}</span>
        <Arrow size={11} className={isActive ? '' : 'opacity-40'} />
      </button>
    </th>
  );
}

function RevenueDesktopTable({ rows, totals, sortKey, sortDir, onSort }) {
  const headerProps = { currentKey: sortKey, currentDir: sortDir, onSort };
  return (
    <div className="hidden lg:block overflow-auto rounded-lg border border-[var(--bd)] bg-[var(--bg-card)]" data-testid="revenue-report-table">
      <table className="w-full text-xs min-w-[1200px]">
        <thead className="bg-[var(--bg-hover)] text-[var(--tx-muted)] uppercase text-[10px] tracking-wider sticky top-0 z-[5]">
          <tr>
            <SortHeader sortKey="procedureType" {...headerProps}>ประเภทหัตถการคอร์ส</SortHeader>
            <SortHeader sortKey="category"      {...headerProps}>หมวดหมู่คอร์ส</SortHeader>
            <SortHeader sortKey="courseName"    {...headerProps}>คอร์ส</SortHeader>
            <th className="px-3 py-2 text-left font-bold whitespace-nowrap">โปรโมชัน</th>
            <SortHeader sortKey="qty"           align="right" {...headerProps}>จำนวน</SortHeader>
            <SortHeader sortKey="lineTotal"     align="right" {...headerProps}>ยอดรวม</SortHeader>
            <th className="px-3 py-2 text-right font-bold whitespace-nowrap">หักมัดจำ</th>
            <th className="px-3 py-2 text-right font-bold whitespace-nowrap">หัก Wallet</th>
            <th className="px-3 py-2 text-right font-bold whitespace-nowrap">คืนเงิน</th>
            <SortHeader sortKey="paidAmount"    align="right" {...headerProps}>ยอดชำระเงิน</SortHeader>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.courseId || r.courseName}-${i}`} className="border-t border-[var(--bd)] hover:bg-cyan-900/10" data-testid={`revenue-row-${i}`}>
              <td className="px-3 py-2 whitespace-nowrap text-[var(--tx-secondary)]">{r.procedureType}</td>
              <td className="px-3 py-2 whitespace-nowrap text-[var(--tx-secondary)]">{r.category}</td>
              <td className="px-3 py-2 whitespace-nowrap font-bold text-[var(--tx-primary)]">{r.courseName}</td>
              <td className="px-3 py-2 whitespace-nowrap text-amber-400">{r.promotionName}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.qty}</td>
              <td className="px-3 py-2 text-right tabular-nums font-bold">{fmtMoney(r.lineTotal)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-[var(--tx-muted)]">{r.depositApplied > 0 ? fmtMoney(r.depositApplied) : '-'}</td>
              <td className="px-3 py-2 text-right tabular-nums text-[var(--tx-muted)]">{r.walletApplied > 0 ? fmtMoney(r.walletApplied) : '-'}</td>
              <td className="px-3 py-2 text-right tabular-nums text-[var(--tx-muted)]">{r.refundAmount > 0 ? fmtMoney(r.refundAmount) : '-'}</td>
              <td className="px-3 py-2 text-right tabular-nums font-bold text-emerald-400">{fmtMoney(r.paidAmount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-[var(--bg-hover)] font-bold text-[var(--tx-primary)] border-t-2 border-[var(--bd)] sticky bottom-0 z-[5]" data-testid="revenue-report-footer">
          <tr>
            <td colSpan={4} className="px-3 py-2">รวม {totals.count.toLocaleString('th-TH')} รายการ</td>
            <td className="px-3 py-2 text-right tabular-nums">{totals.qty}</td>
            <td className="px-3 py-2 text-right tabular-nums" data-testid="footer-linetotal">{fmtMoney(totals.lineTotal)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(totals.depositApplied)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(totals.walletApplied)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(totals.refundAmount)}</td>
            <td className="px-3 py-2 text-right tabular-nums text-emerald-400" data-testid="footer-paid">{fmtMoney(totals.paidAmount)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
