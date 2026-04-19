// ─── CustomerReportTab — Phase 10.3 ────────────────────────────────────────
// Replicates ProClinic /admin/report/customer (9 cols + Export File).
// Joins be_customers + be_sales (per-customer purchase rollup).
//
// Money summary fields (deposit/wallet/points/membership) read directly
// from already-denormalized customer.finance.* — same numbers every other
// backend tab uses, so the report can never disagree with the source UI.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Users, Star } from 'lucide-react';
import ReportShell from './ReportShell.jsx';
import DateRangePicker, { buildPresets } from './DateRangePicker.jsx';
import { aggregateCustomerReport, buildCustomerReportColumns } from '../../../lib/customerReportAggregator.js';
import { loadAllCustomersForReport, loadSalesByDateRange } from '../../../lib/reportsLoaders.js';
import { downloadCSV } from '../../../lib/csvExport.js';
import { fmtMoney } from '../../../lib/financeUtils.js';

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
      <CustomerReportTable
        rows={out.rows}
        totals={out.totals}
        onOpenCustomer={handleOpenCustomer}
      />
    </ReportShell>
  );
}

function FiltersRow({
  searchText, setSearchText,
  marketingConsentOnly, setMarketingConsentOnly,
  membershipFilter, setMembershipFilter,
  sourceFilter, setSourceFilter,
  sourceOptions,
}) {
  return (
    <>
      <input
        type="text"
        value={searchText}
        onChange={e => setSearchText(e.target.value)}
        placeholder="ค้นหา HN / ชื่อ / เบอร์โทร"
        className="px-2 py-1.5 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] min-w-[220px]"
        data-testid="customer-filter-search"
      />
      <select
        value={membershipFilter}
        onChange={e => setMembershipFilter(e.target.value)}
        className="px-2 py-1.5 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]"
        data-testid="customer-filter-membership"
      >
        {MEMBERSHIP_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
      </select>
      <select
        value={sourceFilter}
        onChange={e => setSourceFilter(e.target.value)}
        className="px-2 py-1.5 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]"
        data-testid="customer-filter-source"
      >
        {sourceOptions.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
      </select>
      <label className="flex items-center gap-1.5 text-xs text-[var(--tx-muted)] cursor-pointer">
        <input
          type="checkbox"
          checked={marketingConsentOnly}
          onChange={e => setMarketingConsentOnly(e.target.checked)}
          className="accent-cyan-600"
          data-testid="customer-filter-marketing"
        />
        เฉพาะลูกค้าที่ยินยอมให้ทำการตลาด
      </label>
    </>
  );
}

function CustomerReportTable({ rows, totals, onOpenCustomer }) {
  return (
    <div className="overflow-auto rounded-lg border border-[var(--bd)] bg-[var(--bg-card)]" data-testid="customer-report-table">
      <table className="w-full text-xs min-w-[1200px]">
        <thead className="bg-[var(--bg-hover)] text-[var(--tx-muted)] uppercase text-[10px] tracking-wider sticky top-0 z-[5]">
          <tr>
            <th className="px-3 py-2 text-left font-bold">ลูกค้า</th>
            <th className="px-3 py-2 text-left font-bold">เพศ / วันเกิด</th>
            <th className="px-3 py-2 text-left font-bold">อาชีพ / รายได้</th>
            <th className="px-3 py-2 text-left font-bold">ที่มา</th>
            <th className="px-3 py-2 text-right font-bold">เงินมัดจำ</th>
            <th className="px-3 py-2 text-right font-bold">Wallet</th>
            <th className="px-3 py-2 text-right font-bold">คะแนน</th>
            <th className="px-3 py-2 text-left font-bold">การสั่งซื้อ</th>
            <th className="px-3 py-2 text-left font-bold">วันที่ลงทะเบียน</th>
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
