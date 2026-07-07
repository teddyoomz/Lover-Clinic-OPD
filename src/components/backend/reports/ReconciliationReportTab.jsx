// V52 (2026-05-08, BS-11) — branch-scoped per top-right BranchSelector.
// ─── ReconciliationReportTab — ตรวจความครบธุรกรรม (2026-07-07) ───────────────
// V155/V157 residual closed at the RETRO layer: for every sale in the range,
// verify the money/course side-effects actually landed (deposit usageHistory /
// wallet net / points net / courses[].linkedSaleId / stock movements) against
// what the sale doc claims. READ-ONLY — พบปัญหา → admin ตามไปแก้ที่หน้าจริง.
// SSOT: src/lib/reconcileSaleCore.js (pure; the nightly cron uses the SAME
// module with admin-SDK fetchers — no drift between surfaces).
// Deterministic-only discrepancies (Rule Q-honest): stock + active-sale points
// are INFO, never counted — a money report must not cry wolf.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { ShieldCheck, ChevronDown, ChevronRight } from 'lucide-react';
import ReportShell from './ReportShell.jsx';
import DateRangePicker, { buildPresets } from './DateRangePicker.jsx';
import { loadSalesByDateRange } from '../../../lib/reportsLoaders.js';
import { useSelectedBranch } from '../../../lib/BranchContext.jsx';
import { reconcileSales, summarizeResults } from '../../../lib/reconcileSaleCore.js';
import {
  getCustomer, getCustomerDeposits, getWalletTransactions, getPointTransactions,
  listStockMovements, getAdminAuditDoc,
} from '../../../lib/scopedDataLayer.js';
import { fmtMoney } from '../../../lib/financeUtils.js';

// Yesterday in Asia/Bangkok → the nightly cron's deterministic audit-doc id.
function bangkokYesterdayAuditId(now = Date.now()) {
  const bkk = new Date(now + 7 * 60 * 60 * 1000);
  bkk.setUTCDate(bkk.getUTCDate() - 1);
  return `recon-daily-${bkk.toISOString().slice(0, 10).replace(/-/g, '')}`;
}

// Client-SDK evidence fetchers injected into the shared core (the cron builds
// the admin-SDK twin of this object — keep field-for-field parity).
const CLIENT_FETCHERS = {
  getCustomer: (cid) => getCustomer(cid),
  getDepositsByCustomer: (cid) => getCustomerDeposits(cid),
  getWalletTxByCustomer: (cid) => getWalletTransactions(cid),
  getPointTxByCustomer: (cid) => getPointTransactions(cid),
  countSaleStockMovements: async (saleId) => {
    const mvts = await listStockMovements({ linkedSaleId: saleId });
    return Array.isArray(mvts) ? mvts.length : 0;
  },
};

function VerdictChip({ v, children }) {
  const cls = v === 'ok' ? 'bg-emerald-500/15 text-emerald-400'
    : v === 'discrepancy' ? 'bg-rose-500/20 text-rose-400'
    : v === 'info' ? 'bg-amber-500/15 text-amber-400'
    : 'bg-slate-500/15 text-slate-400';
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap ${cls}`}>{children}</span>;
}

function channelChip(ch, key) {
  const c = ch[key];
  if (key === 'deposit' || key === 'wallet') {
    if (c.verdict === 'na') return <VerdictChip v="na">n/a</VerdictChip>;
    if (c.verdict === 'ok') return <VerdictChip v="ok">ครบ</VerdictChip>;
    return <VerdictChip v="discrepancy">{`ต่าง ${fmtMoney(Math.abs(c.expected - c.found))}`}</VerdictChip>;
  }
  if (key === 'points') {
    if (c.verdict === 'na') return <VerdictChip v="na">n/a</VerdictChip>;
    if (c.verdict === 'ok') return <VerdictChip v="ok">ครบ</VerdictChip>;
    if (c.verdict === 'info') return <VerdictChip v="info">{`${c.net > 0 ? '+' : ''}${c.net}`}</VerdictChip>;
    return <VerdictChip v="discrepancy">{`ค้าง ${c.net}`}</VerdictChip>;
  }
  if (key === 'courses') {
    if (c.verdict === 'na') return <VerdictChip v="na">n/a</VerdictChip>;
    if (c.verdict === 'ok') return <VerdictChip v="ok">{`${c.linked}/${c.expected}`}</VerdictChip>;
    if (c.verdict === 'info') return <VerdictChip v="info">{`${c.linked}/${c.expected}`}</VerdictChip>;
    return <VerdictChip v="discrepancy">ไม่พบ</VerdictChip>;
  }
  // stock — INFO always
  return <VerdictChip v={c.movements > 0 ? 'info' : 'na'}>{c.movements > 0 ? `พบ ${c.movements}` : 'ไม่พบ'}</VerdictChip>;
}

export default function ReconciliationReportTab({ theme }) {
  // V52 (BS-11): subscribe so the scan re-fires on top-right branch switch.
  const { branchId: selectedBranchId } = useSelectedBranch();
  const initialPreset = useMemo(() => buildPresets().find(p => p.id === 'last7'), []);
  const [from, setFrom] = useState(initialPreset.from);
  const [to, setTo] = useState(initialPreset.to);
  const [presetId, setPresetId] = useState(initialPreset.id);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(null); // {done, total}
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [openId, setOpenId] = useState(null);
  // Nightly cron banner — deterministic doc read, no query/index. null = none yet.
  const [cronResult, setCronResult] = useState(null);

  useEffect(() => {
    let abort = false;
    getAdminAuditDoc(bangkokYesterdayAuditId())
      .then(d => { if (!abort && d) setCronResult(d); })
      .catch(() => {}); // banner is best-effort — absence is not an error
    return () => { abort = true; };
  }, []);

  useEffect(() => {
    let abort = false;
    setLoading(true); setError(''); setProgress(null);
    (async () => {
      try {
        // includeCancelled — cancelled sales get the reversal-completeness check
        const sales = await loadSalesByDateRange({ from, to, includeCancelled: true, branchId: selectedBranchId });
        if (abort) return;
        const res = await reconcileSales(sales, CLIENT_FETCHERS, {
          onProgress: (done, total) => { if (!abort) setProgress({ done, total }); },
        });
        if (!abort) setResults(res);
      } catch (e) {
        if (!abort) setError(e?.message || 'ตรวจสอบล้มเหลว');
      } finally {
        if (!abort) { setLoading(false); setProgress(null); }
      }
    })();
    return () => { abort = true; };
  }, [from, to, selectedBranchId, reloadKey]);

  const summary = useMemo(() => summarizeResults(results), [results]);
  const handleRangeChange = useCallback(({ from: f, to: t, presetId: id }) => {
    setFrom(f); setTo(t); setPresetId(id);
  }, []);
  const handleRefresh = useCallback(() => setReloadKey(k => k + 1), []);

  const isDark = theme === 'dark';
  const rowBorder = isDark ? 'border-[#1a1a1a]' : 'border-gray-100';

  return (
    <ReportShell
      icon={ShieldCheck}
      title="ตรวจความครบธุรกรรม"
      subtitle={loading && progress
        ? `กำลังตรวจ ${progress.done}/${progress.total} ใบ…`
        : `${from} → ${to} · ตรวจ ${summary.checked} ใบ · ครบ ${summary.ok} · ไม่ครบ ${summary.discrepancyCount}`}
      totalCount={summary.checked}
      filteredCount={summary.checked}
      onRefresh={handleRefresh}
      loading={loading}
      error={error}
      emptyText="ไม่มีใบขายในช่วงที่เลือก"
    >
      <DateRangePicker from={from} to={to} presetId={presetId} onChange={handleRangeChange} />

      {cronResult && (
        <div
          className={`mt-3 rounded-xl border px-4 py-2.5 text-[12.5px] ${
            cronResult.discrepancyCount > 0
              ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
              : 'border-[var(--bd)] text-[var(--tx-muted)]'
          }`}
          data-testid="recon-cron-banner"
        >
          ⏰ ผลตรวจอัตโนมัติ (คืนวันที่ {cronResult.dateISO}): ตรวจ {cronResult.checked} ใบ ·
          {cronResult.discrepancyCount > 0
            ? ` ไม่ครบ ${cronResult.discrepancyCount} ใบ — เลือกช่วงวันดังกล่าวเพื่อดูรายละเอียด`
            : ' ครบทุกใบ ✓'}
        </div>
      )}

      {!loading && summary.checked > 0 && summary.discrepancyCount === 0 && (
        <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-400"
          data-testid="recon-all-clear">
          ✓ ธุรกรรมครบทุกใบในช่วงที่เลือก ({summary.checked} ใบ · ยกเลิก {summary.cancelledChecked} ใบคืนเงินครบ)
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="mt-3 overflow-x-auto" data-testid="recon-table">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[11px] font-bold uppercase tracking-wider text-[var(--tx-muted)]">
                <th className="text-left py-1.5 pr-2">ใบขาย</th>
                <th className="text-left py-1.5 pr-2">ลูกค้า</th>
                <th className="text-right py-1.5 pr-2">ยอด</th>
                <th className="text-center py-1.5 px-1">มัดจำ</th>
                <th className="text-center py-1.5 px-1">Wallet</th>
                <th className="text-center py-1.5 px-1">แต้ม</th>
                <th className="text-center py-1.5 px-1">คอร์ส</th>
                <th className="text-center py-1.5 px-1">สต็อก</th>
                <th className="py-1.5 w-6"></th>
              </tr>
            </thead>
            <tbody>
              {results.map(r => (
                <RowPair key={r.saleId} r={r} open={openId === r.saleId}
                  onToggle={() => setOpenId(openId === r.saleId ? null : r.saleId)}
                  rowBorder={rowBorder} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ReportShell>
  );
}

function RowPair({ r, open, onToggle, rowBorder }) {
  return (
    <>
      <tr
        className={`border-t ${rowBorder} cursor-pointer ${r.hasDiscrepancy ? 'bg-rose-500/5' : ''}`}
        onClick={onToggle}
        data-testid={`recon-row-${r.saleId}`}
      >
        <td className="py-2 pr-2 font-bold whitespace-nowrap">
          {r.invoiceNo}
          {r.cancelled && <span className="ml-1.5 text-[10px] text-[var(--tx-muted)]">(ยกเลิก)</span>}
        </td>
        <td className="py-2 pr-2 truncate max-w-[140px]">{r.customerName || r.customerId || '-'}</td>
        <td className="py-2 pr-2 text-right font-mono tabular-nums">{fmtMoney(r.total)}</td>
        <td className="py-2 px-1 text-center">{channelChip(r.channels, 'deposit')}</td>
        <td className="py-2 px-1 text-center">{channelChip(r.channels, 'wallet')}</td>
        <td className="py-2 px-1 text-center">{channelChip(r.channels, 'points')}</td>
        <td className="py-2 px-1 text-center">{channelChip(r.channels, 'courses')}</td>
        <td className="py-2 px-1 text-center">{channelChip(r.channels, 'stock')}</td>
        <td className="py-2 text-[var(--tx-muted)]">{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</td>
      </tr>
      {open && (
        <tr className={`border-t ${rowBorder}`}>
          <td colSpan={9} className="py-2 px-3">
            <div className="rounded-lg border border-dashed border-[var(--bd)] px-3 py-2 text-[12px] leading-relaxed">
              {r.hasDiscrepancy ? (
                <ul className="list-disc pl-4 space-y-0.5 text-rose-400">
                  {r.discrepancies.map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              ) : (
                <span className="text-emerald-400">✓ ทุก channel ที่ตรวจได้ตรงกัน</span>
              )}
              <div className="mt-1 text-[var(--tx-muted)]">
                มัดจำ {fmtMoney(r.channels.deposit.found)}/{fmtMoney(r.channels.deposit.expected)} ·
                wallet {fmtMoney(r.channels.wallet.found)}/{fmtMoney(r.channels.wallet.expected)} ·
                แต้มสุทธิ {r.channels.points.net} ·
                คอร์สลิงก์ {r.channels.courses.linked}/{r.channels.courses.expected} ·
                movement {r.channels.stock.movements} รายการ (info)
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
