// ─── SaleReportTab — Phase 10.2 ────────────────────────────────────────────
// Wraps aggregateSaleReport in ReportShell with date range + status + sale type
// + search + cancelled toggle. CSV export via downloadCSV using the SAME
// columns array fed to the table (AR11).

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Receipt, ChevronRight } from 'lucide-react';
import ReportShell from './ReportShell.jsx';
import DateRangePicker, { buildPresets } from './DateRangePicker.jsx';
import SaleDetailModal from './SaleDetailModal.jsx';
import { aggregateSaleReport, buildSaleReportColumns } from '../../../lib/saleReportAggregator.js';
import { loadSalesByDateRange } from '../../../lib/reportsLoaders.js';
import { downloadCSV } from '../../../lib/csvExport.js';
import { fmtMoney } from '../../../lib/financeUtils.js';

const STATUS_OPTIONS = [
  { v: 'all',    t: 'ทุกสถานะ' },
  { v: 'paid',   t: 'ชำระแล้ว' },
  { v: 'split',  t: 'ชำระบางส่วน' },
  { v: 'unpaid', t: 'ค้างชำระ' },
];
const TYPE_OPTIONS = [
  { v: 'all',         t: 'ทุกประเภทการขาย' },
  { v: 'course',      t: 'คอร์ส' },
  { v: 'product',     t: 'สินค้า' },
  { v: 'medication',  t: 'เวชภัณฑ์' },
  { v: 'membership',  t: 'บัตรสมาชิก' },
];

/** Format YYYY-MM-DD as dd/mm/yyyy ค.ศ. (admin convention — AR13). */
function fmtDateCE(iso) {
  if (!iso || typeof iso !== 'string') return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export default function SaleReportTab({ clinicSettings, theme }) {
  const initialPreset = useMemo(() => buildPresets().find(p => p.id === 'last30'), []);
  const [from, setFrom] = useState(initialPreset.from);
  const [to, setTo] = useState(initialPreset.to);
  const [presetId, setPresetId] = useState(initialPreset.id);
  const [statusFilter, setStatusFilter] = useState('all');
  const [saleTypeFilter, setSaleTypeFilter] = useState('all');
  const [includeCancelled, setIncludeCancelled] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [allSales, setAllSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  // viewingSaleId is just the saleId; we look up the raw doc from `allSales`
  // when rendering so the modal stays in sync if the source list re-fetches.
  const [viewingSaleId, setViewingSaleId] = useState(null);
  const viewingSale = useMemo(
    () => (viewingSaleId ? allSales.find(s => (s.saleId || s.id) === viewingSaleId) : null),
    [viewingSaleId, allSales]
  );

  // Load sales for the range. AR3: include cancelled at LOAD level only when toggled
  useEffect(() => {
    let abort = false;
    setLoading(true); setError('');
    loadSalesByDateRange({ from, to, includeCancelled })
      .then(s => { if (!abort) setAllSales(s); })
      .catch(e => { if (!abort) setError(e?.message || 'โหลดข้อมูลล้มเหลว'); })
      .finally(() => { if (!abort) setLoading(false); });
    return () => { abort = true; };
  }, [from, to, includeCancelled, reloadKey]);

  // Aggregate (pure, deterministic — runs in render)
  const out = useMemo(
    () => aggregateSaleReport(allSales, {
      from, to, statusFilter, saleTypeFilter, includeCancelled, searchText,
    }),
    [allSales, from, to, statusFilter, saleTypeFilter, includeCancelled, searchText]
  );

  // Single columns array — SAME for table + CSV (AR11)
  const columns = useMemo(
    () => buildSaleReportColumns({ fmtMoney, fmtDate: fmtDateCE }),
    []
  );

  const handleRangeChange = useCallback(({ from: f, to: t, presetId: id }) => {
    setFrom(f); setTo(t); setPresetId(id);
  }, []);

  const handleExport = useCallback(() => {
    const fname = `sale-report_${from}_to_${to}`;
    downloadCSV(fname, out.rows, columns);
  }, [out.rows, columns, from, to]);

  const handleRefresh = useCallback(() => setReloadKey(k => k + 1), []);

  // Open customer detail in a NEW tab — same pattern as CustomerListTab so
  // the user keeps the report context. Customer ID === ProClinic ID for be_*.
  const handleOpenCustomer = useCallback((customerId) => {
    if (!customerId || typeof window === 'undefined') return;
    window.open(`${window.location.origin}?backend=1&customer=${customerId}`, '_blank');
  }, []);

  const handleViewSale = useCallback((saleId) => setViewingSaleId(saleId), []);
  const handleCloseDetail = useCallback(() => setViewingSaleId(null), []);

  return (
    <ReportShell
      icon={Receipt}
      title="รายการขาย"
      subtitle={`${from} → ${to}`}
      totalCount={out.meta.totalCount}
      filteredCount={out.meta.filteredCount}
      onExport={handleExport}
      exportDisabled={out.meta.filteredCount === 0}
      onRefresh={handleRefresh}
      loading={loading}
      error={error}
      emptyText="ยังไม่มีรายการขายในช่วงที่เลือก"
      notFoundText="ไม่พบรายการขายตามตัวกรอง"
      clinicSettings={clinicSettings}
      dateRangeSlot={
        <DateRangePicker from={from} to={to} presetId={presetId} onChange={handleRangeChange} />
      }
      filtersSlot={
        <FiltersRow
          statusFilter={statusFilter} setStatusFilter={setStatusFilter}
          saleTypeFilter={saleTypeFilter} setSaleTypeFilter={setSaleTypeFilter}
          searchText={searchText} setSearchText={setSearchText}
          includeCancelled={includeCancelled} setIncludeCancelled={setIncludeCancelled}
        />
      }
    >
      <SaleReportTable
        rows={out.rows}
        totals={out.totals}
        columns={columns}
        onOpenCustomer={handleOpenCustomer}
        onViewSale={handleViewSale}
      />
      {viewingSale && (
        <SaleDetailModal
          sale={viewingSale}
          onClose={handleCloseDetail}
          onOpenCustomer={handleOpenCustomer}
        />
      )}
    </ReportShell>
  );
}

function FiltersRow({
  statusFilter, setStatusFilter,
  saleTypeFilter, setSaleTypeFilter,
  searchText, setSearchText,
  includeCancelled, setIncludeCancelled,
}) {
  return (
    <>
      <select
        value={statusFilter}
        onChange={e => setStatusFilter(e.target.value)}
        className="px-2 py-1.5 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]"
        data-testid="filter-status"
      >
        {STATUS_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
      </select>
      <select
        value={saleTypeFilter}
        onChange={e => setSaleTypeFilter(e.target.value)}
        className="px-2 py-1.5 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]"
        data-testid="filter-saletype"
      >
        {TYPE_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
      </select>
      <input
        type="text"
        value={searchText}
        onChange={e => setSearchText(e.target.value)}
        placeholder="ค้นหา HN / ชื่อ / เลขที่ขาย"
        className="px-2 py-1.5 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] min-w-[200px]"
        data-testid="filter-search"
      />
      <label className="flex items-center gap-1.5 text-xs text-[var(--tx-muted)] cursor-pointer">
        <input
          type="checkbox"
          checked={includeCancelled}
          onChange={e => setIncludeCancelled(e.target.checked)}
          className="accent-rose-600"
          data-testid="filter-include-cancelled"
        />
        แสดงที่ยกเลิก
      </label>
    </>
  );
}

function SaleReportTable({ rows, totals, columns, onOpenCustomer, onViewSale }) {
  // Right-align currency columns; otherwise left/center contextual
  const isCurrency = (key) => [
    'netTotal', 'depositApplied', 'walletApplied', 'refundAmount',
    'insuranceClaim', 'paidAmount', 'outstandingAmount',
  ].includes(key);
  // Cells we render with custom interaction (link/button), bypassing default format
  const isInteractive = (key) => key === 'customerHN' || key === 'customerName';

  return (
    <div className="overflow-auto rounded-lg border border-[var(--bd)] bg-[var(--bg-card)]" data-testid="sale-report-table">
      <table className="w-full text-xs min-w-[1400px]">
        <thead className="bg-[var(--bg-hover)] text-[var(--tx-muted)] uppercase text-[10px] tracking-wider sticky top-0 z-[5]">
          <tr>
            {columns.map(c => (
              <th
                key={c.key}
                className={`px-2 py-2 font-bold whitespace-nowrap ${isCurrency(c.key) ? 'text-right' : 'text-left'}`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={`${r.saleId}-${i}`}
              onClick={() => onViewSale?.(r.saleId)}
              className={`border-t border-[var(--bd)] cursor-pointer transition-colors ${
                r.isCancelled ? 'opacity-50 line-through hover:bg-red-900/10' : 'hover:bg-cyan-900/15'
              }`}
              data-testid={`row-${r.saleId}`}
              data-cancelled={r.isCancelled ? 'true' : 'false'}
              title="คลิกเพื่อดูรายละเอียดการขาย"
            >
              {columns.map(c => {
                const raw = r[c.key];
                const display = typeof c.format === 'function' ? c.format(raw, r) : raw;
                if (isInteractive(c.key) && r.customerId) {
                  return (
                    <td key={c.key} className="px-2 py-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onOpenCustomer?.(r.customerId); }}
                        className="text-cyan-400 hover:text-cyan-300 hover:underline underline-offset-2 transition-colors"
                        data-testid={`customer-link-${r.saleId}-${c.key}`}
                        title="เปิดข้อมูลลูกค้าในแท็บใหม่"
                      >
                        {display}
                      </button>
                    </td>
                  );
                }
                return (
                  <td
                    key={c.key}
                    className={`px-2 py-2 whitespace-nowrap ${isCurrency(c.key) ? 'text-right tabular-nums' : ''}`}
                  >
                    {display}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        {/* Footer total row — AR3: cancelled excluded, AR5: reconciles to row sums */}
        <tfoot className="bg-[var(--bg-hover)] font-bold text-[var(--tx-primary)] border-t-2 border-[var(--bd)] sticky bottom-0 z-[5]" data-testid="sale-report-footer">
          <tr>
            <td className="px-2 py-2 text-left" colSpan={7}>
              รวม {totals.count.toLocaleString('th-TH')} รายการ
            </td>
            <td className="px-2 py-2 text-right tabular-nums">{fmtMoney(totals.netTotal)}</td>
            <td className="px-2 py-2 text-right tabular-nums">{fmtMoney(totals.depositApplied)}</td>
            <td className="px-2 py-2 text-right tabular-nums">{fmtMoney(totals.walletApplied)}</td>
            <td className="px-2 py-2 text-right tabular-nums">{fmtMoney(totals.refundAmount)}</td>
            <td className="px-2 py-2 text-right tabular-nums">{fmtMoney(totals.insuranceClaim)}</td>
            <td className="px-2 py-2 text-right tabular-nums" data-testid="footer-paid">{fmtMoney(totals.paidAmount)}</td>
            <td />
            <td className="px-2 py-2 text-right tabular-nums" data-testid="footer-outstanding">{fmtMoney(totals.outstandingAmount)}</td>
            <td colSpan={3} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
