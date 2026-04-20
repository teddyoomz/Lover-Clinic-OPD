// ─── Payment Summary Tab — Phase 12.8 ──────────────────────────────────────
// Groups be_sales payment channels by canonical method, with amount + saleCount
// + percentage. Firestore-only (Rule E).

import { useState, useEffect, useMemo, useCallback } from 'react';
import { CreditCard } from 'lucide-react';
import ReportShell from './ReportShell.jsx';
import DateRangePicker, { buildPresets } from './DateRangePicker.jsx';
import { aggregatePaymentSummary, getPaymentSummaryColumns } from '../../../lib/paymentSummaryAggregator.js';
import { loadSalesByDateRange } from '../../../lib/reportsLoaders.js';
import { downloadCSV } from '../../../lib/csvExport.js';
import { fmtMoney } from '../../../lib/financeUtils.js';

export default function PaymentSummaryTab({ clinicSettings, theme }) {
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

  const out = useMemo(() => aggregatePaymentSummary(sales, { from, to }), [sales, from, to]);

  const columns = useMemo(() => getPaymentSummaryColumns(fmtMoney), []);

  const handleRangeChange = useCallback(({ from: f, to: t, presetId: id }) => {
    setFrom(f); setTo(t); setPresetId(id);
  }, []);

  const handleExport = useCallback(() => {
    downloadCSV(`payment-summary_${from}_to_${to}`, out.rows, columns);
  }, [out.rows, columns, from, to]);

  const handleRefresh = useCallback(() => setReloadKey(k => k + 1), []);

  return (
    <ReportShell
      icon={CreditCard}
      title="สรุปบัญชีรับชำระ"
      subtitle={`${from} → ${to} · รวม ${fmtMoney(out.totals.amount)} · ${out.totals.saleCount} ใบ`}
      totalCount={out.rows.length}
      filteredCount={out.rows.length}
      onExport={handleExport}
      exportDisabled={out.rows.length === 0}
      onRefresh={handleRefresh}
      loading={loading}
      error={error}
      emptyText="ยังไม่มีข้อมูลการชำระในช่วงนี้"
      notFoundText="ไม่พบข้อมูล"
      clinicSettings={clinicSettings}
      dateRangeSlot={<DateRangePicker from={from} to={to} presetId={presetId} onChange={handleRangeChange} />}
    >
      <div className="overflow-auto rounded-lg border border-[var(--bd)] bg-[var(--bg-card)]" data-testid="payment-summary-table">
        <table className="w-full text-xs min-w-[600px]">
          <thead className="bg-[var(--bg-hover)] text-[var(--tx-muted)] uppercase text-[10px] tracking-wider">
            <tr>
              <th className="px-3 py-2 text-left font-bold">วิธีชำระ</th>
              <th className="px-3 py-2 text-right font-bold">ยอดรวม</th>
              <th className="px-3 py-2 text-right font-bold">ใบเสร็จ</th>
              <th className="px-3 py-2 text-right font-bold">%</th>
              <th className="px-3 py-2 text-left font-bold">สัดส่วน</th>
            </tr>
          </thead>
          <tbody>
            {out.rows.map(r => (
              <tr key={r.method} className="border-t border-[var(--bd)] hover:bg-cyan-900/10" data-testid={`payment-row-${r.method}`}>
                <td className="px-3 py-2 font-bold">{r.method}</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold text-emerald-400">{fmtMoney(r.amount)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.saleCount}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.percentage.toFixed(2)}%</td>
                <td className="px-3 py-2">
                  <div className="h-1.5 rounded-full bg-[var(--bg-hover)] overflow-hidden max-w-[200px]">
                    <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-300" style={{ width: `${Math.min(r.percentage, 100)}%` }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-[var(--bg-hover)] font-bold border-t-2 border-[var(--bd)]" data-testid="payment-summary-footer">
            <tr>
              <td className="px-3 py-2">รวม</td>
              <td className="px-3 py-2 text-right tabular-nums text-emerald-400" data-testid="footer-amount">{fmtMoney(out.totals.amount)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{out.totals.saleCount}</td>
              <td className="px-3 py-2 text-right tabular-nums">100%</td>
              <td className="px-3 py-2" />
            </tr>
          </tfoot>
        </table>
      </div>
    </ReportShell>
  );
}
