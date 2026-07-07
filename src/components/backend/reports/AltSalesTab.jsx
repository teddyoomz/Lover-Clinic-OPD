// V52 (BS-11) — branch-scoped per top-right BranchSelector.
// ─── Alt-sales Report Tab — ยอดขายช่องทางอื่น (ออนไลน์ + คู่ค้า) ─────────────
// Two sections in one report: online sales (be_online_sales) + vendor sales
// (be_vendor_sales). Totals count realized revenue only (online paid/completed,
// vendor confirmed) — see altSalesReportAggregator. Firestore-only (Rule E).

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Globe } from 'lucide-react';
import ReportShell from './ReportShell.jsx';
import DateRangePicker, { buildPresets } from './DateRangePicker.jsx';
import { aggregateAltSales } from '../../../lib/altSalesReportAggregator.js';
import { listOnlineSales, listVendorSales } from '../../../lib/scopedDataLayer.js';
import { useSelectedBranch } from '../../../lib/BranchContext.jsx';
import { downloadCSV } from '../../../lib/csvExport.js';
import { fmtMoney } from '../../../lib/financeUtils.js';

const STATUS_TH = {
  pending: 'รอชำระ', paid: 'ชำระแล้ว', completed: 'เสร็จสมบูรณ์',
  draft: 'ร่าง', confirmed: 'ยืนยันแล้ว', cancelled: 'ยกเลิก',
};
const REALIZED = new Set(['paid', 'completed', 'confirmed']);

export default function AltSalesTab({ clinicSettings }) {
  const { branchId: selectedBranchId } = useSelectedBranch();
  const p0 = useMemo(() => buildPresets().find(p => p.id === 'thisMonth'), []);
  const [from, setFrom] = useState(p0.from);
  const [to, setTo] = useState(p0.to);
  const [presetId, setPresetId] = useState(p0.id);
  const [online, setOnline] = useState([]);
  const [vendor, setVendor] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let abort = false; setLoading(true); setError('');
    Promise.all([
      listOnlineSales({ startDate: from, endDate: to, branchId: selectedBranchId }),
      listVendorSales({ startDate: from, endDate: to, branchId: selectedBranchId }),
    ])
      .then(([o, v]) => { if (!abort) { setOnline(o || []); setVendor(v || []); } })
      .catch(e => { if (!abort) setError(e?.message || 'โหลดข้อมูลล้มเหลว'); })
      .finally(() => { if (!abort) setLoading(false); });
    return () => { abort = true; };
  }, [from, to, selectedBranchId, reloadKey]);

  const out = useMemo(() => aggregateAltSales(online, vendor), [online, vendor]);
  const totalRows = out.onlineRows.length + out.vendorRows.length;

  const handleExport = useCallback(() => {
    const csvRows = [
      ...out.onlineRows.map(r => ({ channel: 'ออนไลน์', date: r.date, name: r.customer, amount: r.amount, status: STATUS_TH[r.status] || r.status })),
      ...out.vendorRows.map(r => ({ channel: 'คู่ค้า', date: r.date, name: r.vendor, amount: r.amount, status: STATUS_TH[r.status] || r.status })),
    ];
    const cols = [
      { key: 'channel', label: 'ช่องทาง' }, { key: 'date', label: 'วันที่' },
      { key: 'name', label: 'ลูกค้า/คู่ค้า' },
      { key: 'amount', label: 'ยอด', format: v => fmtMoney(v) }, { key: 'status', label: 'สถานะ' },
    ];
    downloadCSV(`alt-sales_${from}_to_${to}`, csvRows, cols);
  }, [out, from, to]);

  return (
    <ReportShell
      icon={Globe}
      title="ยอดขายช่องทางอื่น"
      subtitle={`${from} → ${to} · ออนไลน์ ${fmtMoney(out.totals.online)} + คู่ค้า ${fmtMoney(out.totals.vendor)} = ${fmtMoney(out.totals.total)}`}
      totalCount={totalRows}
      filteredCount={totalRows}
      onExport={handleExport}
      exportDisabled={totalRows === 0}
      onRefresh={() => setReloadKey(k => k + 1)}
      loading={loading}
      error={error}
      emptyText="ยังไม่มีการขายช่องทางอื่นในช่วงนี้"
      clinicSettings={clinicSettings}
      dateRangeSlot={<DateRangePicker from={from} to={to} presetId={presetId}
        onChange={({ from: f, to: t, presetId: id }) => { setFrom(f); setTo(t); setPresetId(id); }} />}
    >
      <div className="space-y-4">
        <SaleSection
          title="การขายออนไลน์" nameHead="ลูกค้า" rows={out.onlineRows}
          total={out.totals.online} testid="alt-sales-online"
        />
        <SaleSection
          title="ยอดขายคู่ค้า" nameHead="คู่ค้า" rows={out.vendorRows.map(r => ({ ...r, customer: r.vendor }))}
          total={out.totals.vendor} testid="alt-sales-vendor"
        />
      </div>
    </ReportShell>
  );
}

function SaleSection({ title, nameHead, rows, total, testid }) {
  return (
    <div className="overflow-auto rounded-lg border border-[var(--bd)] bg-[var(--bg-card)]" data-testid={testid}>
      <div className="px-3 py-2 text-xs font-black uppercase tracking-wider text-cyan-400 border-b border-[var(--bd)] bg-[var(--bg-hover)]">
        {title} <span className="text-[10px] text-[var(--tx-muted)] font-normal">({rows.length})</span>
      </div>
      {rows.length === 0 ? (
        <div className="px-3 py-4 text-xs text-[var(--tx-muted)]">ไม่มีรายการ</div>
      ) : (
        <table className="w-full text-xs min-w-[520px]">
          <thead className="bg-[var(--bg-hover)] text-[var(--tx-muted)] uppercase text-[10px] tracking-wider">
            <tr>
              <th className="px-3 py-2 text-left font-bold">วันที่</th>
              <th className="px-3 py-2 text-left font-bold">{nameHead}</th>
              <th className="px-3 py-2 text-right font-bold">ยอด</th>
              <th className="px-3 py-2 text-left font-bold">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t border-[var(--bd)] hover:bg-cyan-900/10">
                <td className="px-3 py-2 tabular-nums">{r.date || '—'}</td>
                <td className="px-3 py-2 font-bold">{r.customer || '-'}</td>
                <td className={`px-3 py-2 text-right tabular-nums font-bold ${REALIZED.has(r.status) ? 'text-emerald-400' : 'text-[var(--tx-muted)]'}`}>{fmtMoney(r.amount)}</td>
                <td className="px-3 py-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded ${r.status === 'cancelled' ? 'bg-rose-900/30 text-rose-300' : REALIZED.has(r.status) ? 'bg-emerald-900/30 text-emerald-300' : 'bg-[var(--bg-hover)] text-[var(--tx-muted)]'}`}>
                    {STATUS_TH[r.status] || r.status || '—'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-[var(--bg-hover)] font-bold border-t-2 border-[var(--bd)]">
            <tr>
              <td className="px-3 py-2" colSpan={2}>รวมที่ชำระแล้ว</td>
              <td className="px-3 py-2 text-right tabular-nums text-emerald-400" data-testid={`${testid}-total`}>{fmtMoney(total)}</td>
              <td className="px-3 py-2"></td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}
