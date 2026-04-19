// ─── DailyRevenueTab — Phase 10.X1 ────────────────────────────────────────
// Closes ReportsHome card "รายรับประจำวัน". Groups be_sales by saleDate
// → daily briefing dashboard with top-revenue day + busiest day insight
// cards + date table. Firestore-only (Rule E/H).

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Receipt, TrendingUp, CalendarDays } from 'lucide-react';
import ReportShell from './ReportShell.jsx';
import DateRangePicker, { buildPresets } from './DateRangePicker.jsx';
import { AreaSparkline } from './FancyCharts.jsx';
import {
  aggregateDailyRevenue,
  buildDailyRevenueColumns,
} from '../../../lib/dailyRevenueAggregator.js';
import { loadSalesByDateRange } from '../../../lib/reportsLoaders.js';
import { downloadCSV } from '../../../lib/csvExport.js';
import { fmtMoney } from '../../../lib/financeUtils.js';

function fmtDateCE(iso) {
  if (!iso || typeof iso !== 'string') return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

const THAI_DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
function dayOfWeekThai(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (isNaN(d.getTime())) return '';
  return THAI_DOW[d.getUTCDay()];
}

export default function DailyRevenueTab({ clinicSettings, theme }) {
  const initialPreset = useMemo(() => buildPresets().find(p => p.id === 'thisMonth'), []);
  const [from, setFrom] = useState(initialPreset.from);
  const [to, setTo] = useState(initialPreset.to);
  const [presetId, setPresetId] = useState(initialPreset.id);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let abort = false;
    setLoading(true); setError('');
    loadSalesByDateRange({ from, to, includeCancelled: true })
      .then(s => { if (!abort) setSales(s); })
      .catch(e => { if (!abort) setError(e?.message || 'โหลดข้อมูลล้มเหลว'); })
      .finally(() => { if (!abort) setLoading(false); });
    return () => { abort = true; };
  }, [from, to, reloadKey]);

  const out = useMemo(
    () => aggregateDailyRevenue(sales, { from, to }),
    [sales, from, to]
  );

  const columns = useMemo(
    () => buildDailyRevenueColumns({ fmtMoney, fmtDate: fmtDateCE }),
    []
  );

  const handleRangeChange = useCallback(({ from: f, to: t, presetId: id }) => {
    setFrom(f); setTo(t); setPresetId(id);
  }, []);

  const handleExport = useCallback(() => {
    downloadCSV(`daily-revenue_${from}_to_${to}`, out.rows, columns);
  }, [out.rows, columns, from, to]);

  const handleRefresh = useCallback(() => setReloadKey(k => k + 1), []);

  return (
    <ReportShell
      icon={CalendarDays}
      title="รายรับประจำวัน"
      subtitle={`${from} → ${to} · ${out.totals.days} วัน · เฉลี่ย ${fmtMoney(out.totals.avgPerDay)} ฿/วัน`}
      totalCount={out.meta.totalDays}
      filteredCount={out.meta.filteredDays}
      onExport={handleExport}
      exportDisabled={out.meta.filteredDays === 0}
      onRefresh={handleRefresh}
      loading={loading}
      error={error}
      emptyText="ยังไม่มีข้อมูลการขายในช่วงนี้"
      notFoundText="ไม่พบข้อมูล"
      clinicSettings={clinicSettings}
      dateRangeSlot={
        <DateRangePicker from={from} to={to} presetId={presetId} onChange={handleRangeChange} />
      }
    >
      <div className="space-y-4">
        <InsightCards totals={out.totals} meta={out.meta} />
        <TrendChart rows={out.rows} />
        <DailyMobileList rows={out.rows} />
        <DailyDesktopTable rows={out.rows} totals={out.totals} />
      </div>
    </ReportShell>
  );
}

function InsightCards({ totals, meta }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2" data-testid="daily-revenue-insights">
      <div className="rounded-xl border border-emerald-800/40 bg-emerald-900/10 p-3">
        <div className="text-[9px] uppercase tracking-wider text-emerald-400 font-bold">ยอดขายสุทธิรวม</div>
        <div className="text-lg font-black tabular-nums text-emerald-300 mt-1">{fmtMoney(totals.netTotal)}</div>
        <div className="text-[10px] text-[var(--tx-muted)] mt-0.5">{totals.saleCount} ใบขาย</div>
      </div>
      <div className="rounded-xl border border-cyan-800/40 bg-cyan-900/10 p-3">
        <div className="text-[9px] uppercase tracking-wider text-cyan-400 font-bold">ยอดที่ชำระ</div>
        <div className="text-lg font-black tabular-nums text-cyan-300 mt-1">{fmtMoney(totals.paidAmount)}</div>
        <div className="text-[10px] text-[var(--tx-muted)] mt-0.5">
          {totals.paidCount} ชำระ · {totals.splitCount} บางส่วน · {totals.unpaidCount} ค้าง
        </div>
      </div>
      {meta.topRevenueDay && (
        <div className="rounded-xl border border-amber-800/40 bg-amber-900/10 p-3" data-testid="top-revenue-day">
          <div className="text-[9px] uppercase tracking-wider text-amber-400 font-bold">
            <TrendingUp size={10} className="inline mr-0.5" /> วันที่ขายดีสุด
          </div>
          <div className="text-sm font-black text-amber-300 mt-1 tabular-nums">
            {fmtDateCE(meta.topRevenueDay.date)} <span className="text-[10px] text-[var(--tx-muted)]">({dayOfWeekThai(meta.topRevenueDay.date)})</span>
          </div>
          <div className="text-[10px] text-[var(--tx-muted)] tabular-nums mt-0.5">{fmtMoney(meta.topRevenueDay.amount)}</div>
        </div>
      )}
      {meta.busiestDay && (
        <div className="rounded-xl border border-violet-800/40 bg-violet-900/10 p-3" data-testid="busiest-day">
          <div className="text-[9px] uppercase tracking-wider text-violet-400 font-bold">
            <Receipt size={10} className="inline mr-0.5" /> วันที่ขายเยอะสุด
          </div>
          <div className="text-sm font-black text-violet-300 mt-1">
            {fmtDateCE(meta.busiestDay.date)} <span className="text-[10px] text-[var(--tx-muted)]">({dayOfWeekThai(meta.busiestDay.date)})</span>
          </div>
          <div className="text-[10px] text-[var(--tx-muted)] tabular-nums mt-0.5">{meta.busiestDay.count} ใบขาย</div>
        </div>
      )}
    </div>
  );
}

function TrendChart({ rows }) {
  if (!rows || rows.length < 2) return null; // trend needs ≥2 points
  // Chronological order for trend (aggregator returns desc; reverse)
  const chronological = [...rows].reverse();
  const data = chronological.map(r => ({ label: r.date, value: r.netTotal }));
  return (
    <div className="rounded-xl border border-[var(--bd)] bg-[var(--bg-card)] p-4" data-testid="daily-trend-chart">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-xs uppercase tracking-wider text-[var(--tx-muted)] font-bold">แนวโน้มยอดขายสุทธิ</h3>
        <span className="text-[10px] text-[var(--tx-muted)]">{rows.length} วัน</span>
      </div>
      <AreaSparkline
        data={data}
        width={900}
        height={140}
        stroke="#10b981"
        fillOpacity={0.3}
        formatValue={(v) => `${fmtMoney(v)} ฿`}
        formatLabel={(l) => fmtDateCE(l)}
        ariaLabel="แนวโน้มยอดขายรายวัน"
      />
    </div>
  );
}

function DailyMobileList({ rows }) {
  const max = rows.length > 0 ? Math.max(...rows.map(r => r.netTotal), 1) : 1;
  return (
    <div className="lg:hidden space-y-1.5" data-testid="daily-revenue-mobile-list">
      {rows.map((r, i) => {
        const pct = Math.round((r.netTotal / max) * 100);
        return (
          <div key={`${r.date}-${i}`} className="rounded-lg border border-[var(--bd)] bg-[var(--bg-card)] p-3"
               data-testid={`daily-row-${r.date}`}>
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <div className="text-sm font-bold text-[var(--tx-primary)]">{fmtDateCE(r.date)}</div>
                <div className="text-[10px] text-[var(--tx-muted)]">
                  {dayOfWeekThai(r.date)} · {r.saleCount} ใบ{r.cancelledCount > 0 && <span className="text-rose-400"> · ยกเลิก {r.cancelledCount}</span>}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-black tabular-nums text-emerald-400">{fmtMoney(r.netTotal)}</div>
                {r.outstandingAmount > 0 && (
                  <div className="text-[10px] text-rose-400 font-bold tabular-nums">ค้าง {fmtMoney(r.outstandingAmount)}</div>
                )}
              </div>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-[var(--bg-hover)] overflow-hidden">
              <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-300" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DailyDesktopTable({ rows, totals }) {
  return (
    <div className="hidden lg:block overflow-auto rounded-lg border border-[var(--bd)] bg-[var(--bg-card)]" data-testid="daily-revenue-table">
      <table className="w-full text-xs min-w-[1000px]">
        <thead className="bg-[var(--bg-hover)] text-[var(--tx-muted)] uppercase text-[10px] tracking-wider sticky top-0 z-[5]">
          <tr>
            <th className="px-3 py-2 text-left font-bold whitespace-nowrap">วันที่</th>
            <th className="px-3 py-2 text-center font-bold whitespace-nowrap">ใบขาย</th>
            <th className="px-3 py-2 text-right font-bold whitespace-nowrap">ยอดขายสุทธิ</th>
            <th className="px-3 py-2 text-right font-bold whitespace-nowrap">ยอดที่ชำระ</th>
            <th className="px-3 py-2 text-right font-bold whitespace-nowrap">ยอดค้างชำระ</th>
            <th className="px-3 py-2 text-right font-bold whitespace-nowrap">หักมัดจำ</th>
            <th className="px-3 py-2 text-right font-bold whitespace-nowrap">หัก Wallet</th>
            <th className="px-3 py-2 text-center font-bold whitespace-nowrap">ยกเลิก</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.date}-${i}`} className="border-t border-[var(--bd)] hover:bg-cyan-900/10" data-testid={`daily-row-${r.date}`}>
              <td className="px-3 py-2 whitespace-nowrap">
                <span className="font-bold text-[var(--tx-primary)]">{fmtDateCE(r.date)}</span>
                <span className="ml-2 text-[10px] text-[var(--tx-muted)]">({dayOfWeekThai(r.date)})</span>
              </td>
              <td className="px-3 py-2 text-center tabular-nums">{r.saleCount}</td>
              <td className="px-3 py-2 text-right tabular-nums font-bold text-emerald-400">{fmtMoney(r.netTotal)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.paidAmount)}</td>
              <td className={`px-3 py-2 text-right tabular-nums ${r.outstandingAmount > 0 ? 'text-rose-400 font-bold' : 'text-[var(--tx-muted)]'}`}>
                {r.outstandingAmount > 0 ? fmtMoney(r.outstandingAmount) : '-'}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-[var(--tx-muted)]">{r.depositApplied > 0 ? fmtMoney(r.depositApplied) : '-'}</td>
              <td className="px-3 py-2 text-right tabular-nums text-[var(--tx-muted)]">{r.walletApplied > 0 ? fmtMoney(r.walletApplied) : '-'}</td>
              <td className={`px-3 py-2 text-center tabular-nums ${r.cancelledCount > 0 ? 'text-rose-400 font-bold' : 'text-[var(--tx-muted)]'}`}>
                {r.cancelledCount || '-'}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-[var(--bg-hover)] font-bold text-[var(--tx-primary)] border-t-2 border-[var(--bd)] sticky bottom-0 z-[5]" data-testid="daily-revenue-footer">
          <tr>
            <td className="px-3 py-2">รวม {totals.days} วัน</td>
            <td className="px-3 py-2 text-center tabular-nums" data-testid="footer-sale-count">{totals.saleCount}</td>
            <td className="px-3 py-2 text-right tabular-nums text-emerald-400" data-testid="footer-net-total">{fmtMoney(totals.netTotal)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(totals.paidAmount)}</td>
            <td className="px-3 py-2 text-right tabular-nums text-rose-400">{fmtMoney(totals.outstandingAmount)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(totals.depositApplied)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(totals.walletApplied)}</td>
            <td className="px-3 py-2 text-center tabular-nums text-rose-400">{totals.cancelledCount || '-'}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
