// ─── P&L Report Tab — Phase 12.8 ───────────────────────────────────────────
// Joins be_sales (revenue side) + be_expenses (expense side) into per-period
// P&L table. Period selector: day / month / year. Firestore-only (Rule E).

import { useState, useEffect, useMemo, useCallback } from 'react';
import { TrendingUp } from 'lucide-react';
import ReportShell from './ReportShell.jsx';
import DateRangePicker, { buildPresets } from './DateRangePicker.jsx';
import { aggregatePnLReport, getPnLColumns, PERIOD_OPTIONS } from '../../../lib/pnlReportAggregator.js';
import { loadSalesByDateRange, loadExpensesByDateRange } from '../../../lib/reportsLoaders.js';
import { downloadCSV } from '../../../lib/csvExport.js';
import { fmtMoney } from '../../../lib/financeUtils.js';

export default function PnLReportTab({ clinicSettings, theme }) {
  const initialPreset = useMemo(() => buildPresets().find(p => p.id === 'thisMonth'), []);
  const [from, setFrom] = useState(initialPreset.from);
  const [to, setTo] = useState(initialPreset.to);
  const [presetId, setPresetId] = useState(initialPreset.id);
  const [period, setPeriod] = useState('month');
  const [sales, setSales] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let abort = false;
    setLoading(true); setError('');
    Promise.all([
      loadSalesByDateRange({ from, to, includeCancelled: true }),
      loadExpensesByDateRange({ from, to }),
    ])
      .then(([s, e]) => { if (!abort) { setSales(s); setExpenses(e); } })
      .catch((err) => { if (!abort) setError(err?.message || 'โหลดข้อมูลล้มเหลว'); })
      .finally(() => { if (!abort) setLoading(false); });
    return () => { abort = true; };
  }, [from, to, reloadKey]);

  const out = useMemo(
    () => aggregatePnLReport({ sales, expenses, filters: { from, to, period } }),
    [sales, expenses, from, to, period]
  );

  const columns = useMemo(() => getPnLColumns(fmtMoney), []);

  const handleRangeChange = useCallback(({ from: f, to: t, presetId: id }) => {
    setFrom(f); setTo(t); setPresetId(id);
  }, []);

  const handleExport = useCallback(() => {
    downloadCSV(`pnl-report_${from}_to_${to}_${period}`, out.rows, columns);
  }, [out.rows, columns, from, to, period]);

  const handleRefresh = useCallback(() => setReloadKey(k => k + 1), []);

  const netColor = out.totals.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400';

  return (
    <ReportShell
      icon={TrendingUp}
      title="รายงานกำไรขาดทุน (P&amp;L)"
      subtitle={`${from} → ${to} · รายรับ ${fmtMoney(out.totals.revenue)} − รายจ่าย ${fmtMoney(out.totals.expense)} = กำไร ${fmtMoney(out.totals.netProfit)}`}
      totalCount={out.rows.length}
      filteredCount={out.rows.length}
      onExport={handleExport}
      exportDisabled={out.rows.length === 0}
      onRefresh={handleRefresh}
      loading={loading}
      error={error}
      emptyText="ยังไม่มีข้อมูลในช่วงนี้"
      notFoundText="ไม่พบข้อมูล"
      clinicSettings={clinicSettings}
      dateRangeSlot={
        <div className="flex items-center gap-2 flex-wrap">
          <DateRangePicker from={from} to={to} presetId={presetId} onChange={handleRangeChange} />
          <select value={period} onChange={(e) => setPeriod(e.target.value)} data-testid="pnl-period-select"
            className="px-2 py-1.5 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]">
            {PERIOD_OPTIONS.map(p => <option key={p} value={p}>{p === 'day' ? 'รายวัน' : p === 'month' ? 'รายเดือน' : 'รายปี'}</option>)}
          </select>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2" data-testid="pnl-insights">
          <InsightCard color="emerald" label="รายรับรวม" value={fmtMoney(out.totals.revenue)} sub={`${out.totals.saleCount} ใบขาย`} />
          <InsightCard color="rose" label="รายจ่ายรวม" value={fmtMoney(out.totals.expense)} sub={`${out.totals.expenseCount} รายการ`} />
          <InsightCard color={out.totals.netProfit >= 0 ? 'emerald' : 'rose'} label="กำไรสุทธิ" value={fmtMoney(out.totals.netProfit)} sub={`${out.rows.length} งวด`} bold />
        </div>

        <div className="overflow-auto rounded-lg border border-[var(--bd)] bg-[var(--bg-card)]" data-testid="pnl-table">
          <table className="w-full text-xs min-w-[700px]">
            <thead className="bg-[var(--bg-hover)] text-[var(--tx-muted)] uppercase text-[10px] tracking-wider">
              <tr>
                <th className="px-3 py-2 text-left font-bold">งวด</th>
                <th className="px-3 py-2 text-right font-bold">รายรับ</th>
                <th className="px-3 py-2 text-right font-bold">รายจ่าย</th>
                <th className="px-3 py-2 text-right font-bold">กำไรสุทธิ</th>
                <th className="px-3 py-2 text-right font-bold">ใบเสร็จ</th>
                <th className="px-3 py-2 text-right font-bold">รายการจ่าย</th>
              </tr>
            </thead>
            <tbody>
              {out.rows.map(r => (
                <tr key={r.period} className="border-t border-[var(--bd)] hover:bg-cyan-900/10" data-testid={`pnl-row-${r.period}`}>
                  <td className="px-3 py-2 font-bold">{r.period}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-400">{fmtMoney(r.revenue)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-rose-400">{fmtMoney(r.expense)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums font-bold ${r.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{fmtMoney(r.netProfit)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.saleCount}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.expenseCount}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-[var(--bg-hover)] font-bold border-t-2 border-[var(--bd)]" data-testid="pnl-footer">
              <tr>
                <td className="px-3 py-2">รวม</td>
                <td className="px-3 py-2 text-right tabular-nums text-emerald-400" data-testid="footer-revenue">{fmtMoney(out.totals.revenue)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-rose-400" data-testid="footer-expense">{fmtMoney(out.totals.expense)}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${netColor}`} data-testid="footer-net-profit">{fmtMoney(out.totals.netProfit)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{out.totals.saleCount}</td>
                <td className="px-3 py-2 text-right tabular-nums">{out.totals.expenseCount}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </ReportShell>
  );
}

function InsightCard({ color, label, value, sub, bold }) {
  const bg = color === 'emerald' ? 'border-emerald-800/40 bg-emerald-900/10 text-emerald-300'
           : color === 'rose'    ? 'border-rose-800/40 bg-rose-900/10 text-rose-300'
           : 'border-cyan-800/40 bg-cyan-900/10 text-cyan-300';
  return (
    <div className={`rounded-xl border p-3 ${bg}`}>
      <div className="text-[9px] uppercase tracking-wider font-bold">{label}</div>
      <div className={`text-lg tabular-nums mt-1 ${bold ? 'font-black' : 'font-bold'}`}>{value}</div>
      {sub && <div className="text-[10px] text-[var(--tx-muted)] mt-0.5">{sub}</div>}
    </div>
  );
}
