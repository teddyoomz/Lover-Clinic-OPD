// V52 (BS-11) — branch-scoped per top-right BranchSelector.
// ─── Outstanding-sales Report Tab — รายการขายค้างชำระ ───────────────────────
// Sales where net total > amount paid. Aggregator owns the cancelled/refunded/
// audit-source filtering (outstandingSalesAggregator). Receipt no. is clickable
// → SaleDetailModal. Firestore-only (Rule E).

import { useState, useEffect, useMemo, useCallback } from 'react';
import { AlertCircle } from 'lucide-react';
import ReportShell from './ReportShell.jsx';
import DateRangePicker, { buildPresets } from './DateRangePicker.jsx';
import SaleDetailModal from './SaleDetailModal.jsx';
import { aggregateOutstanding } from '../../../lib/outstandingSalesAggregator.js';
import { loadSalesByDateRange } from '../../../lib/reportsLoaders.js';
import { listAllSellers } from '../../../lib/scopedDataLayer.js';
import { useSelectedBranch } from '../../../lib/BranchContext.jsx';
import { downloadCSV } from '../../../lib/csvExport.js';
import { fmtMoney } from '../../../lib/financeUtils.js';

export default function OutstandingTab({ clinicSettings }) {
  const { branchId: selectedBranchId } = useSelectedBranch();
  const p0 = useMemo(() => buildPresets().find(p => p.id === 'thisMonth'), []);
  const [from, setFrom] = useState(p0.from);
  const [to, setTo] = useState(p0.to);
  const [presetId, setPresetId] = useState(p0.id);
  const [sales, setSales] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [viewingSaleId, setViewingSaleId] = useState(null);
  const viewingSale = useMemo(
    () => (viewingSaleId ? sales.find(s => (s.saleId || s.id) === viewingSaleId) : null),
    [viewingSaleId, sales]
  );

  useEffect(() => {
    let abort = false; setLoading(true); setError('');
    // includeCancelled:true — the aggregator owns the cancelled/audit filter so
    // nothing is silently pre-dropped (single source of truth for the rule).
    Promise.all([
      loadSalesByDateRange({ from, to, includeCancelled: true, branchId: selectedBranchId }),
      listAllSellers({ branchId: selectedBranchId }),
    ])
      .then(([s, se]) => { if (!abort) { setSales(s || []); setSellers(se || []); } })
      .catch(e => { if (!abort) setError(e?.message || 'โหลดข้อมูลล้มเหลว'); })
      .finally(() => { if (!abort) setLoading(false); });
    return () => { abort = true; };
  }, [from, to, selectedBranchId, reloadKey]);

  const out = useMemo(() => aggregateOutstanding(sales), [sales]);

  const handleExport = useCallback(() => {
    const cols = [
      { key: 'ref', label: 'ใบเสร็จ' }, { key: 'date', label: 'วันที่' }, { key: 'customer', label: 'ลูกค้า' },
      { key: 'total', label: 'ยอดรวม', format: v => fmtMoney(v) },
      { key: 'paid', label: 'ชำระแล้ว', format: v => fmtMoney(v) },
      { key: 'outstanding', label: 'ค้างชำระ', format: v => fmtMoney(v) },
      { key: 'status', label: 'สถานะ' },
    ];
    downloadCSV(`outstanding-sales_${from}_to_${to}`, out.rows, cols);
  }, [out.rows, from, to]);

  return (
    <ReportShell
      icon={AlertCircle}
      title="รายการขายค้างชำระ"
      subtitle={`${from} → ${to} · ค้างชำระ ${fmtMoney(out.totals.outstanding)} (${out.totals.count} ใบ) · ยอดรวม ${fmtMoney(out.totals.gross)} · ชำระแล้ว ${fmtMoney(out.totals.paid)}`}
      totalCount={out.rows.length}
      filteredCount={out.rows.length}
      onExport={handleExport}
      exportDisabled={out.rows.length === 0}
      onRefresh={() => setReloadKey(k => k + 1)}
      loading={loading}
      error={error}
      emptyText="ไม่มีรายการค้างชำระในช่วงนี้ 🎉"
      clinicSettings={clinicSettings}
      dateRangeSlot={<DateRangePicker from={from} to={to} presetId={presetId}
        onChange={({ from: f, to: t, presetId: id }) => { setFrom(f); setTo(t); setPresetId(id); }} />}
    >
      <div className="overflow-auto rounded-lg border border-[var(--bd)] bg-[var(--bg-card)]" data-testid="outstanding-table">
        <table className="w-full text-xs min-w-[680px]">
          <thead className="bg-[var(--bg-hover)] text-[var(--tx-muted)] uppercase text-[10px] tracking-wider">
            <tr>
              <th className="px-3 py-2 text-left font-bold">ใบเสร็จ</th>
              <th className="px-3 py-2 text-left font-bold">วันที่</th>
              <th className="px-3 py-2 text-left font-bold">ลูกค้า</th>
              <th className="px-3 py-2 text-right font-bold">ยอดรวม</th>
              <th className="px-3 py-2 text-right font-bold">ชำระแล้ว</th>
              <th className="px-3 py-2 text-right font-bold">ค้างชำระ</th>
            </tr>
          </thead>
          <tbody>
            {out.rows.map(r => (
              <tr key={r.id} className="border-t border-[var(--bd)] hover:bg-cyan-900/10" data-testid={`outstanding-row-${r.ref}`}>
                <td className="px-3 py-2">
                  <button type="button" onClick={() => setViewingSaleId(r.ref)}
                    className="text-cyan-400 hover:text-cyan-300 hover:underline underline-offset-2 font-bold"
                    title="ดูใบเสร็จ">{r.ref}</button>
                </td>
                <td className="px-3 py-2 tabular-nums">{r.date || '—'}</td>
                <td className="px-3 py-2 font-bold">{r.customer}</td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--tx-primary)]">{fmtMoney(r.total)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-emerald-400">{fmtMoney(r.paid)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-black text-rose-400">{fmtMoney(r.outstanding)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-[var(--bg-hover)] font-bold border-t-2 border-[var(--bd)]" data-testid="outstanding-footer">
            <tr>
              <td className="px-3 py-2" colSpan={3}>รวม ({out.totals.count} ใบ)</td>
              <td className="px-3 py-2 text-right tabular-nums text-[var(--tx-primary)]">{fmtMoney(out.totals.gross)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-emerald-400">{fmtMoney(out.totals.paid)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-rose-400" data-testid="outstanding-total">{fmtMoney(out.totals.outstanding)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {viewingSale && (
        <SaleDetailModal sale={viewingSale} sellerLookup={sellers} onClose={() => setViewingSaleId(null)} />
      )}
    </ReportShell>
  );
}
