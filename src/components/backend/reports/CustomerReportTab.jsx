// ─── CustomerReportTab — Phase 10.3 ────────────────────────────────────────
// Replicates ProClinic /admin/report/customer (9 cols + Export File).
// Joins be_customers + be_sales (per-customer purchase rollup).
//
// Money summary fields (deposit/wallet/points/membership) read directly
// from already-denormalized customer.finance.* — same numbers every other
// backend tab uses, so the report can never disagree with the source UI.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Users, Star, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import ReportShell from './ReportShell.jsx';
import DateRangePicker, { buildPresets } from './DateRangePicker.jsx';
import { aggregateCustomerReport, buildCustomerReportColumns } from '../../../lib/customerReportAggregator.js';
import { loadAllCustomersForReport, loadSalesByDateRange } from '../../../lib/reportsLoaders.js';
import { downloadCSV } from '../../../lib/csvExport.js';
import { fmtMoney } from '../../../lib/financeUtils.js';
import { sortBy } from '../../../lib/reportsUtils.js';

// Sortable columns — each maps to a key on the aggregator row.
// Composite columns (ลูกค้า, การสั่งซื้อ) use a sub-key for the underlying value.
const SORTABLE = {
  customerName:    { key: 'customerName',         type: 'string', label: 'ลูกค้า' },
  genderBirth:     { key: 'genderBirth',          type: 'string', label: 'เพศ / วันเกิด' },
  occupationIncome:{ key: 'occupationIncome',     type: 'string', label: 'อาชีพ / รายได้' },
  source:          { key: 'source',               type: 'string', label: 'ที่มา' },
  depositBalance:  { key: 'depositBalance',       type: 'number', label: 'เงินมัดจำ',  align: 'right' },
  walletBalance:   { key: 'walletBalance',        type: 'number', label: 'Wallet',     align: 'right' },
  points:          { key: 'points',               type: 'number', label: 'คะแนน',      align: 'right' },
  purchaseTotal:   { key: 'purchaseTotal',        type: 'number', label: 'การสั่งซื้อ' },
  registeredDate:  { key: 'registeredDate',       type: 'string', label: 'วันที่ลงทะเบียน' },
};

const MEMBERSHIP_OPTIONS = [
  { v: 'all',      t: 'ทุกประเภท' },
  { v: 'GOLD',     t: 'GOLD' },
  { v: 'DIAMOND',  t: 'DIAMOND' },
  { v: 'Platinum', t: 'Platinum' },
  { v: 'none',     t: 'ลูกค้าทั่วไป' },
];

/** Format YYYY-MM-DD → dd/mm/yyyy ค.ศ. (admin convention — AR13). */
function fmtDateCE(iso) {
  if (!iso || typeof iso !== 'string') return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}
function fmtPoints(n) {
  return Number(n || 0).toLocaleString('th-TH');
}

// Membership-badge color classes (Tailwind JIT needs explicit names)
const BADGE_COLORS = {
  GOLD:     'bg-amber-900/40 text-amber-300 border-amber-700',
  DIAMOND:  'bg-cyan-900/40 text-cyan-300 border-cyan-700',
  Platinum: 'bg-violet-900/40 text-violet-300 border-violet-700',
  // "ลูกค้าทั่วไป" — gray, no special highlight
  default:  'bg-[var(--bg-hover)] text-[var(--tx-muted)] border-[var(--bd)]',
};

export default function CustomerReportTab({ clinicSettings, theme }) {
  // Default range: ปีนี้ — purchase summary covers full year
  const initialPreset = useMemo(() => buildPresets().find(p => p.id === 'thisYear'), []);
  const [from, setFrom] = useState(initialPreset.from);
  const [to, setTo] = useState(initialPreset.to);
  const [presetId, setPresetId] = useState(initialPreset.id);
  const [searchText, setSearchText] = useState('');
  const [marketingConsentOnly, setMarketingConsentOnly] = useState(false);
  const [membershipFilter, setMembershipFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  // Default sort: registered date desc (matches the aggregator's default order
  // and ProClinic's UI). Click a header to override.
  const [sortKey, setSortKey] = useState('registeredDate');
  const [sortDir, setSortDir] = useState('desc');
  const [allCustomers, setAllCustomers] = useState([]);
  const [allSales, setAllSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  // Load both collections in parallel. Sales loaded WITHOUT date filter at
  // load time — the aggregator handles the date narrow downstream so the
  // user can change the date range without re-fetching.
  useEffect(() => {
    let abort = false;
    setLoading(true); setError('');
    Promise.all([
      loadAllCustomersForReport(),
      loadSalesByDateRange({ /* no range — aggregator filters in-memory */ }),
    ])
      .then(([cs, ss]) => { if (!abort) { setAllCustomers(cs); setAllSales(ss); } })
      .catch(e => { if (!abort) setError(e?.message || 'โหลดข้อมูลล้มเหลว'); })
      .finally(() => { if (!abort) setLoading(false); });
    return () => { abort = true; };
  }, [reloadKey]);

  const out = useMemo(
    () => aggregateCustomerReport(allCustomers, allSales, {
      from, to, searchText, marketingConsentOnly, membershipFilter, sourceFilter,
    }),
    [allCustomers, allSales, from, to, searchText, marketingConsentOnly, membershipFilter, sourceFilter]
  );

  // Apply column sort AFTER aggregation. Aggregator's default order is
  // already registeredDate desc; for any other sortKey, override.
  const sortedRows = useMemo(() => {
    if (sortKey === 'registeredDate' && sortDir === 'desc') return out.rows; // no-op
    const meta = SORTABLE[sortKey];
    if (!meta) return out.rows;
    return sortBy(out.rows, r => {
      const v = r?.[meta.key];
      if (meta.type === 'number') return Number(v) || 0;
      return v || '';
    }, sortDir);
  }, [out.rows, sortKey, sortDir]);

  // Derive source dropdown from actual data
  const sourceOptions = useMemo(() => {
    const set = new Set();
    for (const c of allCustomers) {
      const s = (c?.patientData?.source || '').trim();
      if (s) set.add(s);
    }
    return [{ v: 'all', t: 'ทุกที่มา' }, ...[...set].sort().map(s => ({ v: s, t: s }))];
  }, [allCustomers]);

  const columns = useMemo(
    () => buildCustomerReportColumns({ fmtMoney, fmtDate: fmtDateCE, fmtPoints }),
    []
  );

  const handleRangeChange = useCallback(({ from: f, to: t, presetId: id }) => {
    setFrom(f); setTo(t); setPresetId(id);
  }, []);

  const handleExport = useCallback(() => {
    const fname = `customer-report_${from}_to_${to}`;
    downloadCSV(fname, out.rows, columns);
  }, [out.rows, columns, from, to]);

  const handleRefresh = useCallback(() => setReloadKey(k => k + 1), []);

  // Click a header → if same column, toggle dir; if new, default by type:
  // strings asc, numbers desc (most users want "biggest first" for money).
  // `forceToggle=true` flips direction keeping key (mobile sort-dir button).
  const handleSort = useCallback((key, forceToggle = false) => {
    setSortKey(prev => {
      if (forceToggle) {
        setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        return prev;
      }
      if (prev === key) {
        setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        return prev;
      }
      const defaultDir = SORTABLE[key]?.type === 'number' ? 'desc' : 'asc';
      setSortDir(defaultDir);
      return key;
    });
  }, []);

  const handleOpenCustomer = useCallback((customerId) => {
    if (!customerId || typeof window === 'undefined') return;
    window.open(`${window.location.origin}?backend=1&customer=${customerId}`, '_blank');
  }, []);

  return (
    <ReportShell
      icon={Users}
      title="ลูกค้าสาขา"
      subtitle={`ยอดสั่งซื้อช่วง ${from} → ${to}`}
      totalCount={out.meta.totalCount}
      filteredCount={out.meta.filteredCount}
      onExport={handleExport}
      exportDisabled={out.meta.filteredCount === 0}
      onRefresh={handleRefresh}
      loading={loading}
      error={error}
      emptyText="ยังไม่มีลูกค้าในระบบ"
      notFoundText="ไม่พบลูกค้าตามตัวกรอง"
      clinicSettings={clinicSettings}
      dateRangeSlot={
        <DateRangePicker from={from} to={to} presetId={presetId} onChange={handleRangeChange} />
      }
      filtersSlot={
        <FiltersRow
          searchText={searchText} setSearchText={setSearchText}
          marketingConsentOnly={marketingConsentOnly} setMarketingConsentOnly={setMarketingConsentOnly}
          membershipFilter={membershipFilter} setMembershipFilter={setMembershipFilter}
          sourceFilter={sourceFilter} setSourceFilter={setSourceFilter}
          sourceOptions={sourceOptions}
        />
      }
    >
      <MobileSortBar sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
      <CustomerMobileList rows={sortedRows} onOpenCustomer={handleOpenCustomer} />
      <CustomerMobileFooter totals={out.totals} />
      <CustomerReportTable
        rows={sortedRows}
        totals={out.totals}
        onOpenCustomer={handleOpenCustomer}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
      />
    </ReportShell>
  );
}

/** Sortable column header — click to toggle, shows arrow indicator. */
function SortHeader({ sortKey, currentKey, currentDir, onSort, align = 'left', children }) {
  const isActive = currentKey === sortKey;
  const Arrow = isActive ? (currentDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  const ariaSort = isActive ? (currentDir === 'asc' ? 'ascending' : 'descending') : 'none';
  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={`px-3 py-2 ${align === 'right' ? 'text-right' : 'text-left'} font-bold whitespace-nowrap`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 select-none transition-colors ${
          isActive ? 'text-cyan-300' : 'text-[var(--tx-muted)] hover:text-[var(--tx-secondary)]'
        }`}
        data-testid={`sort-${sortKey}`}
        title={`เรียงตาม${SORTABLE[sortKey]?.label || sortKey}`}
      >
        <span>{children}</span>
        <Arrow size={11} className={isActive ? '' : 'opacity-40'} />
      </button>
    </th>
  );
}

function FiltersRow({
  searchText, setSearchText,
  marketingConsentOnly, setMarketingConsentOnly,
  membershipFilter, setMembershipFilter,
  sourceFilter, setSourceFilter,
  sourceOptions,
}) {
  const inputCls = "px-2 py-2 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] w-full sm:w-auto";
  const selectCls = `${inputCls} sm:min-w-[150px]`;
  return (
    <>
      <input
        type="text"
        value={searchText}
        onChange={e => setSearchText(e.target.value)}
        placeholder="ค้นหา HN / ชื่อ / เบอร์โทร"
        className={`${inputCls} sm:min-w-[220px] sm:flex-1`}
        data-testid="customer-filter-search"
      />
      <div className="grid grid-cols-2 sm:flex sm:flex-none gap-2 sm:gap-3">
        <select
          value={membershipFilter}
          onChange={e => setMembershipFilter(e.target.value)}
          className={selectCls}
          data-testid="customer-filter-membership"
        >
          {MEMBERSHIP_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
        </select>
        <select
          value={sourceFilter}
          onChange={e => setSourceFilter(e.target.value)}
          className={selectCls}
          data-testid="customer-filter-source"
        >
          {sourceOptions.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
        </select>
      </div>
      <label className="flex items-center gap-2 text-xs text-[var(--tx-muted)] cursor-pointer select-none min-h-[32px] sm:min-h-0">
        <input
          type="checkbox"
          checked={marketingConsentOnly}
          onChange={e => setMarketingConsentOnly(e.target.checked)}
          className="accent-cyan-600 w-4 h-4"
          data-testid="customer-filter-marketing"
        />
        เฉพาะลูกค้าที่ยินยอมให้ทำการตลาด
      </label>
    </>
  );
}

/** Mobile sort bar — surfaces sort via select/toggle button. */
function MobileSortBar({ sortKey, sortDir, onSort }) {
  return (
    <div className="lg:hidden flex items-center gap-2 px-1">
      <label className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-bold shrink-0">เรียงตาม</label>
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
        className="px-2.5 py-1.5 rounded text-xs font-bold border border-[var(--bd)] bg-[var(--bg-hover)] text-cyan-300 hover:bg-cyan-900/30 transition-colors"
        aria-label={sortDir === 'asc' ? 'เรียงจากน้อยไปมาก' : 'เรียงจากมากไปน้อย'}
        data-testid="mobile-sort-dir"
      >
        {sortDir === 'asc' ? <ArrowUp size={12} className="inline" /> : <ArrowDown size={12} className="inline" />}
      </button>
    </div>
  );
}

/** Mobile customer card — headline identity + finance grid + purchase summary. */
function CustomerMobileList({ rows, onOpenCustomer }) {
  return (
    <div className="lg:hidden space-y-2" data-testid="customer-report-mobile-list">
      {rows.map((r, i) => {
        const badge = BADGE_COLORS[r.membership.type] || BADGE_COLORS.default;
        return (
          <div
            key={`${r.customerId}-${i}`}
            className="rounded-xl border border-[var(--bd)] bg-[var(--bg-card)] p-3.5 shadow-sm hover:border-cyan-800/50 transition-colors cursor-pointer"
            data-testid={`customer-mobile-row-${r.customerId}`}
            onClick={() => onOpenCustomer?.(r.customerId)}
          >
            {/* Head: badge + HN + name */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--tx-muted)] mb-0.5">
                  {r.customerHN && <span>{r.customerHN}</span>}
                  {r.phone && (
                    <>
                      <span className="opacity-50">·</span>
                      <span className="not-italic">{r.phone}</span>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onOpenCustomer?.(r.customerId); }}
                  className="text-sm font-bold text-cyan-400 hover:text-cyan-300 leading-snug text-left break-words"
                  data-testid={`customer-mobile-link-${r.customerId}`}
                >
                  {r.customerName}
                </button>
              </div>
              <span className={`flex-shrink-0 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold border ${badge}`}>
                {r.membership.type ? (
                  <><Star size={9} className="inline mr-0.5" />{r.membershipBadge}</>
                ) : r.membershipBadge}
              </span>
            </div>

            {/* Demographics (only if present) */}
            {(r.genderBirth !== '--' || r.occupationIncome !== '--' || r.source !== '-') && (
              <div className="mt-2 text-[10px] text-[var(--tx-muted)] leading-relaxed">
                {r.genderBirth !== '--' && <div><span className="text-[var(--tx-muted)]/70">เพศ/เกิด:</span> <span className="text-[var(--tx-secondary)]">{r.genderBirth}</span></div>}
                {r.occupationIncome !== '--' && <div><span className="text-[var(--tx-muted)]/70">อาชีพ:</span> <span className="text-[var(--tx-secondary)]">{r.occupationIncome}</span></div>}
                {r.source !== '-' && <div><span className="text-[var(--tx-muted)]/70">ที่มา:</span> <span className="text-[var(--tx-secondary)]">{r.source}</span></div>}
              </div>
            )}

            {/* Finance grid */}
            <div className="mt-3 pt-2 border-t border-[var(--bd)] grid grid-cols-3 gap-2 text-[10px]">
              <div>
                <div className="text-[9px] uppercase tracking-wider text-[var(--tx-muted)]">เงินมัดจำ</div>
                <div className="text-xs font-bold tabular-nums text-[var(--tx-primary)]">
                  {r.depositBalance > 0 ? fmtMoney(r.depositBalance) : '-'}
                </div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-wider text-[var(--tx-muted)]">Wallet</div>
                <div className="text-xs font-bold tabular-nums text-[var(--tx-primary)]">
                  {r.walletBalance > 0 ? fmtMoney(r.walletBalance) : '-'}
                </div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-wider text-[var(--tx-muted)]">คะแนน</div>
                <div className="text-xs font-bold tabular-nums text-[var(--tx-primary)]">
                  {r.points > 0 ? fmtPoints(r.points) : '-'}
                </div>
              </div>
            </div>

            {/* Purchase summary */}
            {r.purchaseCount > 0 ? (
              <div className="mt-2 pt-2 border-t border-[var(--bd)] text-[10px]">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[var(--tx-muted)]">ยอดสั่งซื้อ</span>
                  <span className="font-bold text-emerald-400 tabular-nums text-xs">{fmtMoney(r.purchaseTotal)} ฿</span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5 text-[var(--tx-muted)]">
                  <span>ล่าสุด: {fmtDateCE(r.purchaseLastDate)}</span>
                  {r.purchaseUnpaidCount > 0 && (
                    <span className="text-rose-400 font-bold">ค้าง: {r.purchaseUnpaidCount} ใบ</span>
                  )}
                </div>
              </div>
            ) : null}

            {/* Registered */}
            <div className="mt-2 pt-2 border-t border-[var(--bd)] text-[10px] text-[var(--tx-muted)] flex items-center justify-between">
              <span>ลงทะเบียน: {fmtDateCE(r.registeredDate)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Mobile footer summary. */
function CustomerMobileFooter({ totals }) {
  return (
    <div
      className="lg:hidden sticky bottom-0 z-[5] mt-3 -mx-1 px-3 py-2.5 rounded-xl border border-[var(--bd)] bg-[var(--bg-hover)]/95 backdrop-blur-sm shadow-lg"
      data-testid="customer-report-footer-mobile"
    >
      <div className="flex items-center justify-between gap-3 text-[11px]">
        <div className="text-[var(--tx-muted)]">
          รวม <span className="text-[var(--tx-primary)] font-bold tabular-nums">{totals.count.toLocaleString('th-TH')}</span> ราย
        </div>
        <div className="text-right">
          <div className="text-[9px] uppercase tracking-wider text-[var(--tx-muted)]">ยอดสั่งซื้อรวม</div>
          <div className="font-black tabular-nums text-emerald-400">
            {fmtMoney(totals.purchaseTotal)} <span className="text-[9px] opacity-70">฿</span>
          </div>
        </div>
      </div>
      <div className="mt-1.5 pt-1.5 border-t border-[var(--bd)] flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] justify-end">
        <span className="text-[var(--tx-muted)]">มัดจำรวม <span className="text-[var(--tx-secondary)] font-bold">{fmtMoney(totals.depositBalance)}</span></span>
        <span className="opacity-50">·</span>
        <span className="text-[var(--tx-muted)]">Wallet <span className="text-[var(--tx-secondary)] font-bold">{fmtMoney(totals.walletBalance)}</span></span>
        <span className="opacity-50">·</span>
        <span className="text-[var(--tx-muted)]">คะแนน <span className="text-[var(--tx-secondary)] font-bold">{fmtPoints(totals.points)}</span></span>
        {totals.purchaseUnpaidCount > 0 && (
          <>
            <span className="opacity-50">·</span>
            <span className="text-rose-400 font-bold">ค้าง {totals.purchaseUnpaidCount}</span>
          </>
        )}
      </div>
    </div>
  );
}

function CustomerReportTable({ rows, totals, onOpenCustomer, sortKey, sortDir, onSort }) {
  const headerProps = { currentKey: sortKey, currentDir: sortDir, onSort };
  return (
    <div className="hidden lg:block overflow-auto rounded-lg border border-[var(--bd)] bg-[var(--bg-card)]" data-testid="customer-report-table">
      <table className="w-full text-xs min-w-[1200px]">
        <thead className="bg-[var(--bg-hover)] text-[var(--tx-muted)] uppercase text-[10px] tracking-wider sticky top-0 z-[5]">
          <tr>
            <SortHeader sortKey="customerName"     {...headerProps}>ลูกค้า</SortHeader>
            <SortHeader sortKey="genderBirth"      {...headerProps}>เพศ / วันเกิด</SortHeader>
            <SortHeader sortKey="occupationIncome" {...headerProps}>อาชีพ / รายได้</SortHeader>
            <SortHeader sortKey="source"           {...headerProps}>ที่มา</SortHeader>
            <SortHeader sortKey="depositBalance"   align="right" {...headerProps}>เงินมัดจำ</SortHeader>
            <SortHeader sortKey="walletBalance"    align="right" {...headerProps}>Wallet</SortHeader>
            <SortHeader sortKey="points"           align="right" {...headerProps}>คะแนน</SortHeader>
            <SortHeader sortKey="purchaseTotal"    {...headerProps}>การสั่งซื้อ</SortHeader>
            <SortHeader sortKey="registeredDate"   {...headerProps}>วันที่ลงทะเบียน</SortHeader>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const badge = BADGE_COLORS[r.membership.type] || BADGE_COLORS.default;
            return (
              <tr
                key={`${r.customerId}-${i}`}
                onClick={() => onOpenCustomer?.(r.customerId)}
                className="border-t border-[var(--bd)] cursor-pointer hover:bg-cyan-900/15 transition-colors"
                data-testid={`customer-row-${r.customerId}`}
                title="คลิกเพื่อเปิดข้อมูลลูกค้าในแท็บใหม่"
              >
                {/* ลูกค้า: badge + HN + name (NEVER red on name — Thai culture) */}
                <td className="px-3 py-2 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold border ${badge}`}>
                      {r.membership.type ? <><Star size={9} className="inline mr-0.5" />{r.membershipBadge}</> : r.membershipBadge}
                    </span>
                    <span className="font-mono text-[var(--tx-muted)]">{r.customerHN}</span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onOpenCustomer?.(r.customerId); }}
                      className="font-bold text-cyan-400 hover:text-cyan-300 hover:underline underline-offset-2"
                      data-testid={`customer-link-${r.customerId}`}
                    >
                      {r.customerName}
                    </button>
                    {r.phone && (
                      <span className="text-[10px] text-[var(--tx-muted)]">โทร: {r.phone}</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-[var(--tx-secondary)]">{r.genderBirth}</td>
                <td className="px-3 py-2 whitespace-nowrap text-[var(--tx-secondary)]">{r.occupationIncome}</td>
                <td className="px-3 py-2 whitespace-nowrap text-[var(--tx-secondary)]">{r.source}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.depositBalance > 0 ? fmtMoney(r.depositBalance) : '-'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.walletBalance > 0 ? fmtMoney(r.walletBalance) : '-'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.points > 0 ? fmtPoints(r.points) : '-'}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.purchaseCount > 0 ? (
                    <div className="space-y-0.5 text-[10px] leading-tight">
                      <div>ยอดสั่งซื้อ: <span className="font-bold text-emerald-400">{fmtMoney(r.purchaseTotal)}</span> บาท</div>
                      <div className="text-[var(--tx-muted)]">สั่งซื้อล่าสุด: {fmtDateCE(r.purchaseLastDate)}</div>
                      {r.purchaseUnpaidCount > 0 && (
                        <div className="text-rose-400">ค้างชำระ: {r.purchaseUnpaidCount} ใบ</div>
                      )}
                    </div>
                  ) : (
                    <span className="text-[var(--tx-muted)]">-</span>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-[var(--tx-secondary)]">{fmtDateCE(r.registeredDate)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="bg-[var(--bg-hover)] font-bold text-[var(--tx-primary)] border-t-2 border-[var(--bd)] sticky bottom-0 z-[5]" data-testid="customer-report-footer">
          <tr>
            <td colSpan={4} className="px-3 py-2">รวม {totals.count.toLocaleString('th-TH')} ราย</td>
            <td className="px-3 py-2 text-right tabular-nums" data-testid="footer-deposit">{fmtMoney(totals.depositBalance)}</td>
            <td className="px-3 py-2 text-right tabular-nums" data-testid="footer-wallet">{fmtMoney(totals.walletBalance)}</td>
            <td className="px-3 py-2 text-right tabular-nums" data-testid="footer-points">{fmtPoints(totals.points)}</td>
            <td className="px-3 py-2 text-left tabular-nums" data-testid="footer-purchase">
              ยอดรวม {fmtMoney(totals.purchaseTotal)} บาท · ค้าง {totals.purchaseUnpaidCount} ใบ
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
