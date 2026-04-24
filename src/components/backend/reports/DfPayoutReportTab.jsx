// ─── DF Payout Report Tab — Phase 13.4.2 ──────────────────────────────────
// Per-doctor DF payout over a date range. Joins be_sales × be_doctors ×
// be_df_groups × be_df_staff_rates via computeDfPayoutReport.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Percent } from 'lucide-react';
import ReportShell from './ReportShell.jsx';
import DateRangePicker, { buildPresets } from './DateRangePicker.jsx';
import { computeDfPayoutReport } from '../../../lib/dfPayoutAggregator.js';
import { loadSalesByDateRange, loadTreatmentsByDateRange } from '../../../lib/reportsLoaders.js';
import { listDoctors, listDfGroups, listDfStaffRates } from '../../../lib/backendClient.js';
import { downloadCSV } from '../../../lib/csvExport.js';
import { fmtMoney } from '../../../lib/financeUtils.js';

const COLUMNS = [
  { key: 'doctorId', label: 'รหัสแพทย์' },
  { key: 'doctorName', label: 'ชื่อแพทย์' },
  { key: 'saleCount', label: 'จำนวนใบขาย' },
  { key: 'lineCount', label: 'รายการ' },
  { key: 'totalDf', label: 'ยอด DF (บาท)', format: (v) => fmtMoney(v) },
];

export default function DfPayoutReportTab({ clinicSettings, theme }) {
  const initialPreset = useMemo(() => buildPresets().find((p) => p.id === 'thisMonth'), []);
  const [from, setFrom] = useState(initialPreset.from);
  const [to, setTo] = useState(initialPreset.to);
  const [presetId, setPresetId] = useState(initialPreset.id);
  const [sales, setSales] = useState([]);
  const [treatments, setTreatments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [groups, setGroups] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let abort = false;
    setLoading(true); setError('');
    Promise.all([
      loadSalesByDateRange({ from, to }),
      loadTreatmentsByDateRange({ from, to }).catch(() => []),
      listDoctors().catch(() => []),
      listDfGroups().catch(() => []),
      listDfStaffRates().catch(() => []),
    ])
      .then(([s, t, d, g, o]) => {
        if (abort) return;
        setSales(s || []); setTreatments(t || []); setDoctors(d || []); setGroups(g || []); setOverrides(o || []);
      })
      .catch((err) => { if (!abort) setError(err?.message || 'โหลดข้อมูลล้มเหลว'); })
      .finally(() => { if (!abort) setLoading(false); });
    return () => { abort = true; };
  }, [from, to, reloadKey]);

  const out = useMemo(() => computeDfPayoutReport({
    sales, treatments, doctors, groups, staffOverrides: overrides,
    startDate: from, endDate: to,
  }), [sales, treatments, doctors, groups, overrides, from, to]);

  const handleRangeChange = useCallback(({ from: f, to: t, presetId: id }) => {
    setFrom(f); setTo(t); setPresetId(id);
  }, []);
  const handleExport = useCallback(() => {
    downloadCSV(`df-payout_${from}_to_${to}`, out.rows, COLUMNS);
  }, [out.rows, from, to]);
  const handleRefresh = useCallback(() => setReloadKey((k) => k + 1), []);

  return (
    <ReportShell
      icon={Percent}
      title="รายงานจ่าย DF (ค่ามือแพทย์)"
      subtitle={`${from} → ${to} · ${out.summary.doctorCount} แพทย์ · รวม ${fmtMoney(out.summary.total)} บาท`}
      totalCount={out.rows.length}
      filteredCount={out.rows.length}
      onExport={handleExport}
      exportDisabled={out.rows.length === 0}
      onRefresh={handleRefresh}
      loading={loading}
      error={error}
      emptyText="ยังไม่มีข้อมูล DF ในช่วงนี้"
      notFoundText="ไม่พบข้อมูล"
      clinicSettings={clinicSettings}
      dateRangeSlot={<DateRangePicker from={from} to={to} presetId={presetId} onChange={handleRangeChange} />}
    >
      <div className="overflow-x-auto" data-testid="df-payout-table">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-[var(--bd)] text-[var(--tx-muted)]">
              {COLUMNS.map((c) => (
                <th key={c.key} className="text-left py-2 px-2 text-xs font-bold uppercase tracking-wider">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {out.rows.map((r) => (
              <tr key={r.doctorId} data-testid={`df-payout-row-${r.doctorId}`}
                className="border-b border-[var(--bd)] hover:bg-[var(--bg-hover)]">
                <td className="py-2 px-2 font-mono text-xs text-[var(--tx-muted)]">{r.doctorId}</td>
                <td className="py-2 px-2 font-semibold">{r.doctorName || '—'}</td>
                <td className="py-2 px-2 tabular-nums">{r.saleCount}</td>
                <td className="py-2 px-2 tabular-nums">{r.lineCount}</td>
                <td className="py-2 px-2 tabular-nums font-bold text-emerald-400">{fmtMoney(r.totalDf)}</td>
              </tr>
            ))}
          </tbody>
          {out.rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-[var(--bd)]">
                <td colSpan={4} className="py-2 px-2 font-bold text-right">รวม</td>
                <td className="py-2 px-2 tabular-nums font-black text-emerald-400">{fmtMoney(out.summary.total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </ReportShell>
  );
}
