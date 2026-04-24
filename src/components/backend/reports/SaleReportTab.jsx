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
import { loadSalesByDateRange, loadAllCustomersForReport, loadSaleInsuranceClaimsByDateRange } from '../../../lib/reportsLoaders.js';
import { aggregateClaimsBySaleId } from '../../../lib/saleInsuranceClaimValidation.js';
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
  const [allCustomers, setAllCustomers] = useState([]);
  // Phase 12.3 (2026-04-25): load be_sale_insurance_claims in the same
  // window and aggregate paid claims by saleId. Before this wiring the
  // "เบิกประกัน" column was always ฿0 (aggregator had claimsBySaleId
  // optional but nobody passed it). Only 'paid' claims count per
  // aggregateClaimsBySaleId spec.
  const [allClaims, setAllClaims] = useState([]);
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

  // Load sales + customers + insurance-claims in parallel. Customers enable
  // HN/name backfill for legacy sales; claims populate the "เบิกประกัน" col
  // (Phase 12.3, was hardcoded 0 before this wiring). Claims use their own
  // `claimDate` field to load — a claim may be filed AFTER the sale date
  // window but we still want it visible against its sale row when present.
  useEffect(() => {
    let abort = false;
    setLoading(true); setError('');
    Promise.all([
      loadSalesByDateRange({ from, to, includeCancelled }),
      loadAllCustomersForReport(),
      loadSaleInsuranceClaimsByDateRange({}),
    ])
      .then(([s, c, cl]) => { if (!abort) { setAllSales(s); setAllCustomers(c); setAllClaims(cl); } })
      .catch(e => { if (!abort) setError(e?.message || 'โหลดข้อมูลล้มเหลว'); })
      .finally(() => { if (!abort) setLoading(false); });
    return () => { abort = true; };
  }, [from, to, includeCancelled, reloadKey]);

  // Build saleId → paid total map. Only 'paid' claims count (aggregator spec).
  const claimsBySaleId = useMemo(
    () => aggregateClaimsBySaleId(allClaims),
    [allClaims]
  );

  // Aggregate (pure, deterministic — runs in render)
  const out = useMemo(
    () => aggregateSaleReport(allSales, {
      from, to, statusFilter, saleTypeFilter, includeCancelled, searchText,
      customers: allCustomers,
      claimsBySaleId,
    }),
    [allSales, allCustomers, claimsBySaleId, from, to, statusFilter, saleTypeFilter, includeCancelled, searchText]
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
      <SaleMobileList rows={out.rows} onOpenCustomer={handleOpenCustomer} onViewSale={handleViewSale} />
      <SaleMobileFooter totals={out.totals} />
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
  const inputCls = "px-2 py-2 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] w-full sm:w-auto";
  const selectCls = `${inputCls} sm:min-w-[150px]`;
  return (
    <>
      <input
        type="text"
        value={searchText}
        onChange={e => setSearchText(e.target.value)}
        placeholder="ค้นหา HN / ชื่อ / เลขที่ขาย"
        className={`${inputCls} sm:min-w-[200px] sm:flex-1`}
        data-testid="filter-search"
      />
      <div className="grid grid-cols-2 sm:flex sm:flex-none gap-2 sm:gap-3">
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className={selectCls}
          data-testid="filter-status"
        >
          {STATUS_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
        </select>
        <select
          value={saleTypeFilter}
          onChange={e => setSaleTypeFilter(e.target.value)}
          className={selectCls}
          data-testid="filter-saletype"
        >
          {TYPE_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
        </select>
      </div>
      <label className="flex items-center gap-2 text-xs text-[var(--tx-muted)] cursor-pointer select-none min-h-[32px] sm:min-h-0">
        <input
          type="checkbox"
          checked={includeCancelled}
          onChange={e => setIncludeCancelled(e.target.checked)}
          className="accent-rose-600 w-4 h-4"
          data-testid="filter-include-cancelled"
        />
        แสดงที่ยกเลิก
      </label>
    </>
  );
}

const STATUS_BADGE = {
  paid:   'bg-emerald-900/30 text-emerald-300 border-emerald-700/50',
  split:  'bg-amber-900/30   text-amber-300   border-amber-700/50',
  unpaid: 'bg-rose-900/30    text-rose-300    border-rose-700/50',
};

function SaleMobileList({ rows, onOpenCustomer, onViewSale }) {
  return (
    <div className="lg:hidden space-y-2" data-testid="sale-report-mobile-list">
      {rows.map((r, i) => {
        const statusClass = STATUS_BADGE[r.paymentStatus] || 'bg-[var(--bg-hover)] text-[var(--tx-muted)] border-[var(--bd)]';
        return (
          <div
            key={`${r.saleId}-${i}`}
            onClick={() => onViewSale?.(r.saleId)}
            className={`rounded-xl border border-[var(--bd)] bg-[var(--bg-card)] p-3.5 shadow-sm hover:border-cyan-800/50 transition-colors cursor-pointer ${
              r.isCancelled ? 'opacity-60' : ''
            }`}
            data-testid={`mobile-row-${r.saleId}`}
            data-cancelled={r.isCancelled ? 'true' : 'false'}
            title="แตะเพื่อดูรายละเอียด"
          >
            {/* Head: date + saleId + status badge */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[10px] text-[var(--tx-muted)] mb-0.5">
                  <span className="font-bold tabular-nums">{fmtDateCE(r.saleDate)}</span>
                  <span className="opacity-50">·</span>
                  <span className="font-mono truncate">{r.saleId}</span>
                </div>
                {r.saleType && r.saleType !== '-' && (
                  <span className="inline-block text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold border bg-cyan-900/30 text-cyan-300 border-cyan-700/50">
                    {r.saleType}
                  </span>
                )}
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold border ${statusClass}`}>
                  {r.paymentStatusLabel || r.paymentStatus}
                </span>
                {r.isCancelled && (
                  <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold border bg-red-900/30 text-red-300 border-red-700/50">
                    ยกเลิก
                  </span>
                )}
              </div>
            </div>

            {/* Customer */}
            {(r.customerHN || r.customerName) && (
              <div className="mt-2 pt-2 border-t border-[var(--bd)] flex items-center gap-2 flex-wrap">
                {r.customerHN && <span className="font-mono text-[10px] text-[var(--tx-muted)]">{r.customerHN}</span>}
                {r.customerId ? (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onOpenCustomer?.(r.customerId); }}
                    className="text-sm font-bold text-cyan-400 hover:text-cyan-300 hover:underline underline-offset-2 text-left"
                    data-testid={`mobile-customer-link-${r.saleId}`}
                  >
                    {r.customerName || '-'}
                  </button>
                ) : (
                  <span className="text-sm font-bold text-[var(--tx-primary)]">{r.customerName || '-'}</span>
                )}
              </div>
            )}

            {/* Items summary */}
            {r.itemsSummary && r.itemsSummary !== '-' && (
              <div className="mt-2 text-[11px] text-[var(--tx-secondary)] leading-snug line-clamp-2" title={r.itemsSummary}>
                {r.itemsSummary}
              </div>
            )}

            {/* Financial grid */}
            <div className="mt-3 pt-2 border-t border-[var(--bd)] grid grid-cols-2 gap-2">
              <div className="min-w-0">
                <div className="text-[9px] uppercase tracking-wider text-[var(--tx-muted)]">ราคาหลังหักส่วนลด</div>
                <div className="text-sm font-black tabular-nums text-[var(--tx-primary)] truncate">{fmtMoney(r.netTotal)}</div>
              </div>
              <div className="min-w-0 text-right">
                <div className="text-[9px] uppercase tracking-wider text-[var(--tx-muted)]">ยอดที่ชำระ</div>
                <div className="text-sm font-black tabular-nums text-emerald-400 truncate">
                  {fmtMoney(r.paidAmount)} <span className="text-[9px] text-[var(--tx-muted)]">฿</span>
                </div>
              </div>
              {r.outstandingAmount > 0 && (
                <div className="col-span-2 flex items-baseline justify-between text-[10px] text-rose-400 font-bold">
                  <span>ค้างชำระ</span>
                  <span className="tabular-nums">{fmtMoney(r.outstandingAmount)} ฿</span>
                </div>
              )}
            </div>

            {/* Secondary: deposit/wallet/refund/channel (only non-zero) */}
            {(r.depositApplied > 0 || r.walletApplied > 0 || r.refundAmount > 0 || r.paymentChannels) && (
              <div className="mt-2 pt-2 border-t border-[var(--bd)] flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-[var(--tx-muted)]">
                {r.depositApplied > 0 && <span>มัดจำ <span className="text-[var(--tx-secondary)] font-bold tabular-nums">{fmtMoney(r.depositApplied)}</span></span>}
                {r.walletApplied > 0 && <span>Wallet <span className="text-[var(--tx-secondary)] font-bold tabular-nums">{fmtMoney(r.walletApplied)}</span></span>}
                {r.refundAmount > 0 && <span>คืน <span className="text-rose-400 font-bold tabular-nums">{fmtMoney(r.refundAmount)}</span></span>}
                {r.paymentChannels && r.paymentChannels !== '-' && (
                  <span className="w-full sm:w-auto truncate" title={r.paymentChannels}>ช่องทาง: <span className="text-[var(--tx-secondary)]">{r.paymentChannels}</span></span>
                )}
              </div>
            )}

            {/* Seller */}
            {r.sellersLabel && r.sellersLabel !== '-' && (
              <div className="mt-1.5 text-[10px] text-[var(--tx-muted)]">
                พนักงานขาย: <span className="text-[var(--tx-secondary)]">{r.sellersLabel}</span>
              </div>
            )}

            <div className="mt-2 text-[10px] text-cyan-400/70 text-right flex items-center justify-end gap-1">
              <span>ดูรายละเอียด</span>
              <ChevronRight size={11} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SaleMobileFooter({ totals }) {
  return (
    <div
      className="lg:hidden sticky bottom-0 z-[5] mt-3 -mx-1 px-3 py-2.5 rounded-xl border border-[var(--bd)] bg-[var(--bg-hover)]/95 backdrop-blur-sm shadow-lg"
      data-testid="sale-report-footer-mobile"
    >
      <div className="flex items-center justify-between gap-3 text-[11px]">
        <div className="text-[var(--tx-muted)]">
          รวม <span className="text-[var(--tx-primary)] font-bold tabular-nums">{totals.count.toLocaleString('th-TH')}</span> รายการ
        </div>
        <div className="text-right">
          <div className="text-[9px] uppercase tracking-wider text-[var(--tx-muted)]">ยอดที่ชำระ</div>
          <div className="font-black tabular-nums text-emerald-400">
            {fmtMoney(totals.paidAmount)} <span className="text-[9px] opacity-70">฿</span>
          </div>
        </div>
      </div>
      <div className="mt-1.5 pt-1.5 border-t border-[var(--bd)] flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] justify-end">
        <span className="text-[var(--tx-muted)]">สุทธิ <span className="text-[var(--tx-secondary)] font-bold">{fmtMoney(totals.netTotal)}</span></span>
        {totals.depositApplied > 0 && (
          <><span className="opacity-50">·</span><span className="text-[var(--tx-muted)]">มัดจำ <span className="text-[var(--tx-secondary)] font-bold">{fmtMoney(totals.depositApplied)}</span></span></>
        )}
        {totals.walletApplied > 0 && (
          <><span className="opacity-50">·</span><span className="text-[var(--tx-muted)]">Wallet <span className="text-[var(--tx-secondary)] font-bold">{fmtMoney(totals.walletApplied)}</span></span></>
        )}
        {totals.outstandingAmount > 0 && (
          <><span className="opacity-50">·</span><span className="text-rose-400 font-bold">ค้าง <span className="tabular-nums">{fmtMoney(totals.outstandingAmount)}</span></span></>
        )}
      </div>
    </div>
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
    <div className="hidden lg:block overflow-auto rounded-lg border border-[var(--bd)] bg-[var(--bg-card)]" data-testid="sale-report-table">
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
