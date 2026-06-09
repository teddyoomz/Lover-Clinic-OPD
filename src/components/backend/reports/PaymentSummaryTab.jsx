// V52 (2026-05-08, BS-11) — branch-scoped per top-right BranchSelector.
// ─── Payment Summary Tab — Phase 12.8 + deposit-in-reports (2026-06-09) ─────
// "เงินที่บัญชีได้รับจริง": be_sales payment channels (ยอดขาย) + deposits
// received in range by paymentChannel (มัดจำ) → ยอดรวม per channel. No
// double-count (deposit deducted before sale channels). Receipt number is
// clickable → PaymentDocsModal (sales + deposits) → SaleDetailModal / deposit
// deep-link. Firestore-only (Rule E).

import { useState, useEffect, useMemo, useCallback } from 'react';
import { CreditCard } from 'lucide-react';
import ReportShell from './ReportShell.jsx';
import DateRangePicker, { buildPresets } from './DateRangePicker.jsx';
import SaleDetailModal from './SaleDetailModal.jsx';
import PaymentDocsModal from './PaymentDocsModal.jsx';
import { aggregatePaymentSummary, getPaymentSummaryColumns } from '../../../lib/paymentSummaryAggregator.js';
import { loadSalesByDateRange, loadDepositsByDateRange } from '../../../lib/reportsLoaders.js';
import { listAllSellers } from '../../../lib/scopedDataLayer.js';
import { useSelectedBranch } from '../../../lib/BranchContext.jsx';
import { downloadCSV } from '../../../lib/csvExport.js';
import { fmtMoney } from '../../../lib/financeUtils.js';

export default function PaymentSummaryTab({ clinicSettings, theme }) {
  // V52 (BS-11): subscribe so reload re-fires when admin switches branch.
  const { branchId: selectedBranchId } = useSelectedBranch();
  const initialPreset = useMemo(() => buildPresets().find(p => p.id === 'thisMonth'), []);
  const [from, setFrom] = useState(initialPreset.from);
  const [to, setTo] = useState(initialPreset.to);
  const [presetId, setPresetId] = useState(initialPreset.id);
  const [sales, setSales] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  // Drill-down: which channel's docs modal is open + which sale receipt is open.
  const [docsMethod, setDocsMethod] = useState(null);
  const [viewingSaleId, setViewingSaleId] = useState(null);
  const viewingSale = useMemo(
    () => (viewingSaleId ? sales.find(s => (s.saleId || s.id) === viewingSaleId) : null),
    [viewingSaleId, sales]
  );

  useEffect(() => {
    let abort = false;
    setLoading(true); setError('');
    // V52 (BS-11): all loaders narrow to selectedBranchId.
    Promise.all([
      loadSalesByDateRange({ from, to, includeCancelled: true, branchId: selectedBranchId }),
      loadDepositsByDateRange({ from, to, branchId: selectedBranchId }),
      listAllSellers({ branchId: selectedBranchId }),
    ])
      .then(([s, d, se]) => { if (!abort) { setSales(s); setDeposits(d); setSellers(se || []); } })
      .catch(e => { if (!abort) setError(e?.message || 'โหลดข้อมูลล้มเหลว'); })
      .finally(() => { if (!abort) setLoading(false); });
    return () => { abort = true; };
  }, [from, to, selectedBranchId, reloadKey]);

  const out = useMemo(() => aggregatePaymentSummary(sales, deposits, { from, to }), [sales, deposits, from, to]);
  const range = useMemo(() => ({ from, to }), [from, to]);

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
      subtitle={`${from} → ${to} · รับจริง ${fmtMoney(out.totals.total)} (ขาย ${fmtMoney(out.totals.salesAmount)} + มัดจำ ${fmtMoney(out.totals.depositAmount)})`}
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
        <table className="w-full text-xs min-w-[620px]">
          <thead className="bg-[var(--bg-hover)] text-[var(--tx-muted)] uppercase text-[10px] tracking-wider">
            <tr>
              <th className="px-3 py-2 text-left font-bold">วิธีชำระ</th>
              <th className="px-3 py-2 text-right font-bold">ยอดขาย</th>
              <th className="px-3 py-2 text-right font-bold">มัดจำ</th>
              <th className="px-3 py-2 text-right font-bold">ยอดรวม</th>
              <th className="px-3 py-2 text-right font-bold">ใบเสร็จ</th>
              <th className="px-3 py-2 text-right font-bold">%</th>
            </tr>
          </thead>
          <tbody>
            {out.rows.map(r => (
              <tr key={r.method} className="border-t border-[var(--bd)] hover:bg-cyan-900/10" data-testid={`payment-row-${r.method}`}>
                <td className="px-3 py-2 font-bold">{r.method}</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold text-emerald-400">{fmtMoney(r.salesAmount)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold text-teal-400">{r.depositAmount > 0 ? fmtMoney(r.depositAmount) : <span className="text-[var(--tx-muted)]">—</span>}</td>
                <td className="px-3 py-2 text-right tabular-nums font-black text-[var(--tx-primary)]">{fmtMoney(r.total)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.docCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => setDocsMethod(r.method)}
                      className="text-cyan-400 hover:text-cyan-300 hover:underline underline-offset-2 font-bold"
                      data-testid={`payment-doc-link-${r.method}`}
                      title="ดูเอกสาร (ใบขาย + ใบมัดจำ)"
                    >
                      {r.docCount}
                    </button>
                  ) : r.docCount}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.percentage.toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-[var(--bg-hover)] font-bold border-t-2 border-[var(--bd)]" data-testid="payment-summary-footer">
            <tr>
              <td className="px-3 py-2">รวม</td>
              <td className="px-3 py-2 text-right tabular-nums text-emerald-400" data-testid="footer-sales">{fmtMoney(out.totals.salesAmount)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-teal-400" data-testid="footer-deposit">{fmtMoney(out.totals.depositAmount)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-[var(--tx-primary)]" data-testid="footer-total">{fmtMoney(out.totals.total)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{out.totals.docCount}</td>
              <td className="px-3 py-2 text-right tabular-nums">100%</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {out.refundsTotal > 0 && (
        <div className="mt-2 text-[11px] text-[var(--tx-muted)]" data-testid="payment-refund-footnote">
          คืนมัดจำในช่วงนี้ <span className="text-rose-400 font-bold tabular-nums">{fmtMoney(out.refundsTotal)}</span>
          <span className="opacity-70"> (แสดงแยก ไม่หักออกจากยอดรับ)</span>
        </div>
      )}

      {docsMethod && (
        <PaymentDocsModal
          method={docsMethod}
          sales={sales}
          deposits={deposits}
          range={range}
          onViewSale={(sid) => setViewingSaleId(sid)}
          onClose={() => setDocsMethod(null)}
        />
      )}
      {viewingSale && (
        <SaleDetailModal
          sale={viewingSale}
          sellerLookup={sellers}
          onClose={() => setViewingSaleId(null)}
        />
      )}
    </ReportShell>
  );
}
