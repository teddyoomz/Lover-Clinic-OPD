// V52 (BS-11) — branch-scoped per top-right BranchSelector.
// ─── Stock-alert Report Tab — แจ้งเตือนสต็อค ─────────────────────────────────
// Snapshot (no date range) over be_stock_batches + be_products thresholds:
// expired lots / near-expiry lots / low-stock products. Uses the clinic's own
// per-product alert thresholds (aggregateStockAlert). Firestore-only (Rule E).
// Product/lot names may use red (Thai-culture red rule guards patient names only).

import { useState, useEffect, useMemo, useCallback } from 'react';
import { BellRing } from 'lucide-react';
import ReportShell from './ReportShell.jsx';
import { aggregateStockAlert } from '../../../lib/stockAlertReportAggregator.js';
import { loadAllStockBatchesForReport } from '../../../lib/reportsLoaders.js';
import { listProductsForPicker } from '../../../lib/scopedDataLayer.js';
import { useSelectedBranch } from '../../../lib/BranchContext.jsx';
import { downloadCSV } from '../../../lib/csvExport.js';

const fmtDate = (x) => {
  const s = String(x || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || '—';
  return s.split('-').reverse().join('/'); // dd/mm/yyyy (ค.ศ. — backend report)
};

export default function StockAlertTab({ clinicSettings }) {
  const { branchId: selectedBranchId } = useSelectedBranch();
  const [batches, setBatches] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let abort = false; setLoading(true); setError('');
    Promise.all([
      loadAllStockBatchesForReport({ branchId: selectedBranchId }),
      listProductsForPicker({ branchId: selectedBranchId }),
    ])
      .then(([b, p]) => { if (!abort) { setBatches(b || []); setProducts(p || []); } })
      .catch(e => { if (!abort) setError(e?.message || 'โหลดข้อมูลล้มเหลว'); })
      .finally(() => { if (!abort) setLoading(false); });
    return () => { abort = true; };
  }, [selectedBranchId, reloadKey]);

  const out = useMemo(() => aggregateStockAlert(batches, products), [batches, products]);
  const totalRows = out.counts.expired + out.counts.nearExpiry + out.counts.lowStock;

  const handleExport = useCallback(() => {
    const rows = [
      ...out.expired.map(r => ({ section: 'หมดอายุแล้ว', product: r.product, batch: r.batch, remaining: r.remaining, expiresAt: fmtDate(r.expiresAt), note: `เกิน ${r.overdueDays} วัน` })),
      ...out.nearExpiry.map(r => ({ section: 'ใกล้หมดอายุ', product: r.product, batch: r.batch, remaining: r.remaining, expiresAt: fmtDate(r.expiresAt), note: `อีก ${r.daysLeft} วัน` })),
      ...out.lowStock.map(r => ({ section: 'ใกล้หมดสต็อค', product: r.product, batch: '', remaining: r.remaining, expiresAt: '', note: `เกณฑ์ ${r.threshold}` })),
    ];
    const cols = [
      { key: 'section', label: 'ประเภท' }, { key: 'product', label: 'สินค้า' }, { key: 'batch', label: 'ล็อต' },
      { key: 'remaining', label: 'คงเหลือ' }, { key: 'expiresAt', label: 'หมดอายุ' }, { key: 'note', label: 'หมายเหตุ' },
    ];
    downloadCSV(`stock-alert_${selectedBranchId || 'all'}`, rows, cols);
  }, [out, selectedBranchId]);

  return (
    <ReportShell
      icon={BellRing}
      title="แจ้งเตือนสต็อค"
      subtitle={`หมดอายุ ${out.counts.expired} · ใกล้หมดอายุ ${out.counts.nearExpiry} · ใกล้หมดสต็อค ${out.counts.lowStock}`}
      totalCount={totalRows}
      filteredCount={totalRows}
      onExport={handleExport}
      exportDisabled={totalRows === 0}
      onRefresh={() => setReloadKey(k => k + 1)}
      loading={loading}
      error={error}
      emptyText="สต็อคปกติ ไม่มีรายการแจ้งเตือน 🎉"
      clinicSettings={clinicSettings}
    >
      <div className="space-y-4">
        <AlertSection
          title="ล็อตหมดอายุแล้ว" tone="rose" count={out.counts.expired} testid="stock-alert-expired"
          cols={['สินค้า', 'ล็อต', 'คงเหลือ', 'หมดอายุ', 'เกินมา (วัน)']}
          rows={out.expired.map(r => [r.product, r.batch, r.remaining, fmtDate(r.expiresAt), r.overdueDays])}
          emphCol={4}
        />
        <AlertSection
          title="ใกล้หมดอายุ" tone="amber" count={out.counts.nearExpiry} testid="stock-alert-near"
          cols={['สินค้า', 'ล็อต', 'คงเหลือ', 'หมดอายุ', 'อีก (วัน)']}
          rows={out.nearExpiry.map(r => [r.product, r.batch, r.remaining, fmtDate(r.expiresAt), r.daysLeft])}
          emphCol={4}
        />
        <AlertSection
          title="สินค้าใกล้หมดสต็อค" tone="emerald" count={out.counts.lowStock} testid="stock-alert-low"
          cols={['สินค้า', 'คงเหลือรวม', 'เกณฑ์แจ้งเตือน']}
          rows={out.lowStock.map(r => [r.product, r.remaining, r.threshold])}
          emphCol={1}
        />
      </div>
    </ReportShell>
  );
}

const TONES = {
  rose: 'text-rose-400 bg-rose-900/20',
  amber: 'text-orange-400 bg-orange-900/20',
  emerald: 'text-emerald-400 bg-emerald-900/20',
};

function AlertSection({ title, tone, count, cols, rows, emphCol, testid }) {
  if (count === 0) return null;
  return (
    <div className="overflow-auto rounded-lg border border-[var(--bd)] bg-[var(--bg-card)]" data-testid={testid}>
      <div className={`px-3 py-2 text-xs font-black uppercase tracking-wider border-b border-[var(--bd)] ${TONES[tone]}`}>
        {title} <span className="text-[10px] font-normal opacity-70">({count})</span>
      </div>
      <table className="w-full text-xs min-w-[480px]">
        <thead className="bg-[var(--bg-hover)] text-[var(--tx-muted)] uppercase text-[10px] tracking-wider">
          <tr>{cols.map((c, i) => <th key={c} className={`px-3 py-2 font-bold ${i === 0 ? 'text-left' : 'text-right'}`}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-t border-[var(--bd)] hover:bg-cyan-900/10">
              {r.map((cell, ci) => (
                <td key={ci} className={`px-3 py-2 ${ci === 0 ? 'font-bold text-left' : 'text-right tabular-nums'} ${ci === emphCol ? TONES[tone].split(' ')[0] + ' font-black' : ''}`}>
                  {cell === '' || cell == null ? '—' : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
