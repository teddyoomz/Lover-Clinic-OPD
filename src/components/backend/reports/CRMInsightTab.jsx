// ─── CRMInsightTab — Phase 10.6 ───────────────────────────────────────────
// Replicates ProClinic /admin/crm-insight — RFM analysis with 3 layouts:
//   Table 1: Segment summary (segment · totalRevenue · customerCount)
//   Table 2: Per-customer (13 cols — HN/name, R/F/M/AOV/Segment + 6 period buckets)
//   Table 3: 5×5 F×R matrix (heatmap cells show segment + count + %)
//
// Triangle-verified 2026-04-20: 11 segment names captured from intel.
// Data source: be_sales + be_customers (Firestore-only, Rule E/H).

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Sparkles, Star } from 'lucide-react';
import ReportShell from './ReportShell.jsx';
import DateRangePicker, { buildPresets } from './DateRangePicker.jsx';
import { aggregateRFM, buildRFMColumns } from '../../../lib/rfmUtils.js';
import { loadSalesByDateRange, loadAllCustomersForReport } from '../../../lib/reportsLoaders.js';
import { downloadCSV } from '../../../lib/csvExport.js';
import { fmtMoney } from '../../../lib/financeUtils.js';
import { thaiTodayISO } from '../../../utils.js';

// Segment display color classes — NO red on names (Thai culture). Red reserved
// for cancelled/warnings; RFM segments use status-color continuum from emerald
// (best) → amber (mid) → slate (cold/lost).
const SEGMENT_STYLES = {
  'Champions':         'bg-emerald-900/40 text-emerald-300 border-emerald-700/50',
  'Loyalty':           'bg-teal-900/40    text-teal-300    border-teal-700/50',
  'High Spending':     'bg-cyan-900/40    text-cyan-300    border-cyan-700/50',
  'Good':              'bg-sky-900/40     text-sky-300     border-sky-700/50',
  'New Customer':      'bg-violet-900/40  text-violet-300  border-violet-700/50',
  'About to Sleep':    'bg-amber-900/40   text-amber-300   border-amber-700/50',
  'Cheap':             'bg-orange-900/30  text-orange-300  border-orange-700/50',
  'Lost Loyalty':      'bg-zinc-800/60    text-zinc-400    border-zinc-700',
  'Lost High Spending':'bg-zinc-800/60    text-zinc-400    border-zinc-700',
  'Lost Good':         'bg-zinc-800/60    text-zinc-400    border-zinc-700',
  'Lost Cheap':        'bg-zinc-900/60    text-zinc-500    border-zinc-800',
};

function fmtDateCE(iso) {
  if (!iso || typeof iso !== 'string') return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export default function CRMInsightTab({ clinicSettings, theme }) {
  // Default: all-time (no date filter), asOfISO = today
  const initialPreset = useMemo(() => buildPresets().find(p => p.id === 'thisYear'), []);
  const [from, setFrom] = useState(initialPreset?.from || '');
  const [to, setTo] = useState(initialPreset?.to || '');
  const [presetId, setPresetId] = useState(initialPreset?.id || 'thisYear');
  const asOfISO = useMemo(() => thaiTodayISO(), []);

  const [allSales, setAllSales] = useState([]);
  const [allCustomers, setAllCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [segmentFilter, setSegmentFilter] = useState('all');

  useEffect(() => {
    let abort = false;
    setLoading(true); setError('');
    Promise.all([
      loadSalesByDateRange({}),   // ALL sales; filter applied in aggregator
      loadAllCustomersForReport(),
    ])
      .then(([s, c]) => { if (!abort) { setAllSales(s); setAllCustomers(c); } })
      .catch(e => { if (!abort) setError(e?.message || 'โหลดข้อมูลล้มเหลว'); })
      .finally(() => { if (!abort) setLoading(false); });
    return () => { abort = true; };
  }, [reloadKey]);

  const out = useMemo(
    () => aggregateRFM(allCustomers, allSales, { asOfISO, from, to }),
    [allCustomers, allSales, asOfISO, from, to]
  );

  const filteredRows = useMemo(() => {
    if (segmentFilter === 'all') return out.perCustomer;
    return out.perCustomer.filter(r => r.segment === segmentFilter);
  }, [out.perCustomer, segmentFilter]);

  const columns = useMemo(
    () => buildRFMColumns({ fmtMoney, fmtDate: fmtDateCE }),
    []
  );

  const handleRangeChange = useCallback(({ from: f, to: t, presetId: id }) => {
    setFrom(f); setTo(t); setPresetId(id);
  }, []);

  const handleExport = useCallback(() => {
    downloadCSV(`crm-insight-rfm_${asOfISO}`, filteredRows, columns);
  }, [filteredRows, columns, asOfISO]);

  const handleRefresh = useCallback(() => setReloadKey(k => k + 1), []);

  const handleOpenCustomer = useCallback((customerId) => {
    if (!customerId || typeof window === 'undefined') return;
    window.open(`${window.location.origin}?backend=1&customer=${customerId}`, '_blank');
  }, []);

  const segmentOptions = useMemo(
    () => [{ v: 'all', t: 'ทุก Segment' }, ...out.segmentSummary.map(s => ({ v: s.segment, t: `${s.segment} (${s.customerCount})` }))],
    [out.segmentSummary]
  );

  return (
    <ReportShell
      icon={Sparkles}
      title="CRM Insight (RFM)"
      subtitle={`${out.meta.activeCustomerCount} ลูกค้าที่ active · ณ ${fmtDateCE(asOfISO)}`}
      totalCount={out.meta.totalCustomers}
      filteredCount={filteredRows.length}
      onExport={handleExport}
      exportDisabled={filteredRows.length === 0}
      onRefresh={handleRefresh}
      loading={loading}
      error={error}
      emptyText="ยังไม่มีลูกค้าที่มีประวัติการซื้อ"
      notFoundText="ไม่พบลูกค้าใน segment นี้"
      clinicSettings={clinicSettings}
      dateRangeSlot={
        <DateRangePicker from={from} to={to} presetId={presetId} onChange={handleRangeChange} />
      }
      filtersSlot={
        <select
          value={segmentFilter}
          onChange={e => setSegmentFilter(e.target.value)}
          className="px-2 py-2 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] w-full sm:w-auto sm:min-w-[180px]"
          data-testid="rfm-filter-segment"
        >
          {segmentOptions.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
        </select>
      }
    >
      <div className="space-y-4">
        <SegmentSummaryCards summary={out.segmentSummary} onSelect={setSegmentFilter} active={segmentFilter} />
        <RFMMatrix matrix={out.matrix} />
        <PerCustomerList rows={filteredRows} onOpenCustomer={handleOpenCustomer} />
      </div>
    </ReportShell>
  );
}

/* ─── Section 1: segment summary cards (Table 1 replacement — more visual) ── */
function SegmentSummaryCards({ summary, onSelect, active }) {
  if (!summary || summary.length === 0) return null;
  const maxRev = Math.max(...summary.map(s => s.totalRevenue), 1);
  return (
    <div data-testid="rfm-segment-summary">
      <h3 className="text-xs uppercase tracking-wider text-[var(--tx-muted)] font-bold mb-2">Segment Summary</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
        {summary.map(s => {
          const pct = s.totalRevenue / maxRev;
          const badge = SEGMENT_STYLES[s.segment] || 'bg-[var(--bg-hover)] text-[var(--tx-muted)] border-[var(--bd)]';
          const isActive = active === s.segment;
          return (
            <button
              key={s.segment}
              type="button"
              onClick={() => onSelect(active === s.segment ? 'all' : s.segment)}
              className={`rounded-xl border p-3 text-left transition-all hover:border-cyan-800/50 ${
                isActive ? 'ring-2 ring-cyan-500/50' : ''
              } ${badge}`}
              data-testid={`rfm-segment-card-${s.segment.replace(/\s+/g, '-')}`}
            >
              <div className="text-[10px] uppercase tracking-wider opacity-80 font-bold">{s.segment}</div>
              <div className="text-lg font-black tabular-nums mt-1">{s.customerCount}</div>
              <div className="text-[10px] opacity-80 mt-0.5">ลูกค้า</div>
              <div className="text-[11px] tabular-nums mt-1">{fmtMoney(s.totalRevenue)} ฿</div>
              <div className="h-1 rounded-full bg-black/20 mt-2 overflow-hidden">
                <div className="h-full bg-current opacity-60" style={{ width: `${Math.round(pct * 100)}%` }} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Section 2: 5×5 F × R matrix (Table 3) ──────────────────────────────── */
function RFMMatrix({ matrix }) {
  if (!matrix?.rows?.length) return null;
  return (
    <div data-testid="rfm-matrix">
      <h3 className="text-xs uppercase tracking-wider text-[var(--tx-muted)] font-bold mb-2">
        RFM Heatmap (F × R)
      </h3>
      <div className="overflow-x-auto rounded-lg border border-[var(--bd)] bg-[var(--bg-card)]">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[var(--tx-muted)]">
              <th className="px-2 py-1.5 text-left font-bold text-[10px] uppercase tracking-wider">
                F ↓ / R →
              </th>
              {matrix.cols.map(r => (
                <th key={r} className="px-2 py-1.5 text-center font-bold text-[10px]">R={r}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map(f => (
              <tr key={f} className="border-t border-[var(--bd)]">
                <td className="px-2 py-1.5 text-left font-bold text-[10px] text-[var(--tx-muted)] bg-[var(--bg-hover)]">
                  F={f}
                </td>
                {matrix.cols.map(r => {
                  const cell = matrix.cells[`F${f}-R${r}`] || { segment: '-', count: 0, percent: 0 };
                  const badge = SEGMENT_STYLES[cell.segment] || 'bg-[var(--bg-hover)] text-[var(--tx-muted)] border-[var(--bd)]';
                  return (
                    <td
                      key={r}
                      className={`px-2 py-2 text-center border ${badge}`}
                      data-testid={`matrix-cell-F${f}-R${r}`}
                    >
                      <div className="text-[9px] font-bold leading-tight">{cell.segment}</div>
                      {cell.count > 0 && (
                        <div className="text-[10px] tabular-nums mt-0.5">
                          {cell.count} ({cell.percent.toFixed(1)}%)
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Section 3: per-customer list (Table 2 — 13 cols) ───────────────────── */
function PerCustomerList({ rows, onOpenCustomer }) {
  return (
    <div data-testid="rfm-per-customer">
      <h3 className="text-xs uppercase tracking-wider text-[var(--tx-muted)] font-bold mb-2">
        รายลูกค้า ({rows.length} ราย)
      </h3>

      {/* Mobile: card list */}
      <div className="lg:hidden space-y-2" data-testid="rfm-customer-mobile-list">
        {rows.map((r, i) => {
          const badge = SEGMENT_STYLES[r.segment] || 'bg-[var(--bg-hover)] text-[var(--tx-muted)] border-[var(--bd)]';
          return (
            <div
              key={`${r.customerId}-${i}`}
              className="rounded-xl border border-[var(--bd)] bg-[var(--bg-card)] p-3.5 shadow-sm"
              data-testid={`rfm-mobile-row-${r.customerId}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-mono text-[var(--tx-muted)]">{r.customerHN}</div>
                  <button
                    type="button"
                    onClick={() => onOpenCustomer?.(r.customerId)}
                    className="font-bold text-sm text-cyan-400 hover:text-cyan-300 text-left leading-snug break-words"
                  >
                    {r.customerName || '-'}
                  </button>
                </div>
                <span className={`flex-shrink-0 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold border ${badge}`}>
                  <Star size={9} className="inline mr-0.5" />{r.segment}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-2 pt-2 border-t border-[var(--bd)] text-[10px]">
                <div>
                  <div className="text-[9px] uppercase text-[var(--tx-muted)]">R</div>
                  <div className="font-bold tabular-nums">{r.R}d</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase text-[var(--tx-muted)]">F</div>
                  <div className="font-bold tabular-nums">{r.F}</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase text-[var(--tx-muted)]">M</div>
                  <div className="font-bold tabular-nums text-emerald-400">{fmtMoney(r.M)}</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase text-[var(--tx-muted)]">AOV</div>
                  <div className="font-bold tabular-nums">{fmtMoney(r.AOV)}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop: table */}
      <div className="hidden lg:block overflow-auto rounded-lg border border-[var(--bd)] bg-[var(--bg-card)]" data-testid="rfm-customer-table">
        <table className="w-full text-xs min-w-[1400px]">
          <thead className="bg-[var(--bg-hover)] text-[var(--tx-muted)] uppercase text-[10px] tracking-wider sticky top-0 z-[5]">
            <tr>
              <th className="px-3 py-2 text-left font-bold whitespace-nowrap">ลูกค้า</th>
              <th className="px-3 py-2 text-right font-bold whitespace-nowrap">Recency</th>
              <th className="px-3 py-2 text-right font-bold whitespace-nowrap">Frequency</th>
              <th className="px-3 py-2 text-right font-bold whitespace-nowrap">Monetary</th>
              <th className="px-3 py-2 text-right font-bold whitespace-nowrap">AOV</th>
              <th className="px-3 py-2 text-left font-bold whitespace-nowrap">Segment</th>
              <th className="px-3 py-2 text-right font-bold whitespace-nowrap">ยอดชำระเงิน</th>
              {[1,2,3,4,5,6].map(i => (
                <th key={i} className="px-3 py-2 text-right font-bold whitespace-nowrap">{i}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const badge = SEGMENT_STYLES[r.segment] || 'bg-[var(--bg-hover)] text-[var(--tx-muted)] border-[var(--bd)]';
              return (
                <tr key={`${r.customerId}-${i}`} className="border-t border-[var(--bd)] hover:bg-cyan-900/10" data-testid={`rfm-row-${r.customerId}`}>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-[var(--tx-muted)]">{r.customerHN}</span>
                      <button
                        type="button"
                        onClick={() => onOpenCustomer?.(r.customerId)}
                        className="font-bold text-cyan-400 hover:text-cyan-300 hover:underline underline-offset-2"
                      >
                        {r.customerName || '-'}
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.R}d</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold">{r.F}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-emerald-400">{fmtMoney(r.M)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.AOV)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold border ${badge}`}>
                      {r.segment}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.totalPaid)}</td>
                  {(r.periodBuckets || [0,0,0,0,0,0]).map((v, j) => (
                    <td key={j} className="px-3 py-2 text-right tabular-nums text-[10px]">
                      {v > 0 ? fmtMoney(v) : <span className="text-[var(--tx-muted)]">-</span>}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
