// ─── AppointmentAnalysisTab — Phase 10.8 ──────────────────────────────────
// Replicates ProClinic /admin/appointment-analysis — per-advisor KPI table
// (10 cols) + appointment breakdown (expected sales) + unexpected-sale list.
//
// Triangle-verified 2026-04-20 via opd.js intel. Sample row validates
// Performance = actualSales / expectedSales × 100.
//
// Data: be_appointments + be_sales. Firestore-only.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Activity } from 'lucide-react';
import ReportShell from './ReportShell.jsx';
import DateRangePicker, { buildPresets } from './DateRangePicker.jsx';
import {
  aggregateAppointmentAnalysis,
  buildAdvisorKPIColumns,
} from '../../../lib/appointmentAnalysisAggregator.js';
import {
  loadAppointmentsByDateRange,
  loadSalesByDateRange,
} from '../../../lib/reportsLoaders.js';
// Phase 14.10-tris (2026-04-26) — listAllSellers (be_*) replaces master_data
import { listAllSellers } from '../../../lib/backendClient.js';
import { downloadCSV } from '../../../lib/csvExport.js';
import { fmtMoney } from '../../../lib/financeUtils.js';
import { thaiTodayISO } from '../../../utils.js';

function fmtDateCE(iso) {
  if (!iso || typeof iso !== 'string') return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

// Mirror of AppointmentTab STATUSES — keep in sync if that source changes.
const STATUS_LABELS = {
  pending:   'รอยืนยัน',
  confirmed: 'ยืนยันแล้ว',
  done:      'เสร็จแล้ว',
  cancelled: 'ยกเลิก',
  completed: 'เสร็จแล้ว',    // legacy / ProClinic-synced alias
  มาตามนัด:  'มาตามนัด',     // legacy / synced passthrough
};
const STATUS_STYLES = {
  pending:   'bg-orange-900/30 text-orange-300 border-orange-700/50',
  confirmed: 'bg-sky-900/30 text-sky-300 border-sky-700/50',
  done:      'bg-emerald-900/30 text-emerald-300 border-emerald-700/50',
  completed: 'bg-emerald-900/30 text-emerald-300 border-emerald-700/50',
  cancelled: 'bg-red-900/30 text-red-300 border-red-700/50',
};
function renderStatusChip(raw) {
  const key = (raw || '').trim();
  const label = STATUS_LABELS[key] || key || '-';
  const cls = STATUS_STYLES[key] || 'bg-[var(--bg-hover)] text-[var(--tx-muted)] border-[var(--bd)]';
  return (
    <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold border whitespace-nowrap ${cls}`}>
      {label}
    </span>
  );
}

const SALE_PAYMENT_LABELS = {
  paid:   'ชำระแล้ว',
  unpaid: 'ค้างชำระ',
  split:  'ชำระบางส่วน',
};

export default function AppointmentAnalysisTab({ clinicSettings, theme }) {
  const initialPreset = useMemo(() => buildPresets().find(p => p.id === 'thisMonth'), []);
  const [from, setFrom] = useState(initialPreset.from);
  const [to, setTo] = useState(initialPreset.to);
  const [presetId, setPresetId] = useState(initialPreset.id);
  const [advisorFilter, setAdvisorFilter] = useState('all');
  const [activeSection, setActiveSection] = useState('overview'); // overview | expected | unexpected
  const [appointments, setAppointments] = useState([]);
  const [sales, setSales] = useState([]);
  const [staffMaster, setStaffMaster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const asOfISO = useMemo(() => thaiTodayISO(), []);

  useEffect(() => {
    let abort = false;
    setLoading(true); setError('');
    Promise.all([
      loadAppointmentsByDateRange({ from, to }),
      loadSalesByDateRange({ from, to }),
      listAllSellers().catch(() => []),
    ])
      .then(([a, s, st]) => {
        if (abort) return;
        setAppointments(a); setSales(s); setStaffMaster(st);
      })
      .catch(e => { if (!abort) setError(e?.message || 'โหลดข้อมูลล้มเหลว'); })
      .finally(() => { if (!abort) setLoading(false); });
    return () => { abort = true; };
  }, [from, to, reloadKey]);

  const out = useMemo(
    () => aggregateAppointmentAnalysis(appointments, sales, {
      asOfISO, from, to, advisorFilter, staffMasterList: staffMaster,
    }),
    [appointments, sales, staffMaster, asOfISO, from, to, advisorFilter]
  );

  const advisorOptions = useMemo(() => {
    const set = new Set();
    for (const a of appointments) {
      const n = (a?.advisorName || '').trim();
      if (n) set.add(n);
    }
    return [{ v: 'all', t: 'ทุกพนักงานทำนัด' }, ...[...set].sort().map(n => ({ v: n, t: n }))];
  }, [appointments]);

  const columns = useMemo(() => buildAdvisorKPIColumns({ fmtMoney }), []);

  const handleRangeChange = useCallback(({ from: f, to: t, presetId: id }) => {
    setFrom(f); setTo(t); setPresetId(id);
  }, []);

  const handleExport = useCallback(() => {
    downloadCSV(`appt-analysis_${from}_to_${to}`, out.advisors, columns);
  }, [out.advisors, columns, from, to]);

  const handleRefresh = useCallback(() => setReloadKey(k => k + 1), []);

  const handleOpenCustomer = useCallback((customerId) => {
    if (!customerId || typeof window === 'undefined') return;
    window.open(`${window.location.origin}?backend=1&customer=${customerId}`, '_blank');
  }, []);

  return (
    <ReportShell
      icon={Activity}
      title="วิเคราะห์รายการนัดหมาย"
      subtitle={`${from} → ${to} · ${out.meta.apptsTotal} นัด · linked ${out.meta.linkedSaleCount}/${out.meta.salesTotal} sales`}
      totalCount={out.meta.apptsTotal}
      filteredCount={out.advisors.length}
      onExport={handleExport}
      exportDisabled={out.advisors.length === 0}
      onRefresh={handleRefresh}
      loading={loading}
      error={error}
      emptyText="ยังไม่มีนัดหมายในช่วงนี้"
      notFoundText="ไม่พบข้อมูลตามตัวกรอง"
      clinicSettings={clinicSettings}
      dateRangeSlot={
        <DateRangePicker from={from} to={to} presetId={presetId} onChange={handleRangeChange} />
      }
      filtersSlot={
        <select
          value={advisorFilter}
          onChange={e => setAdvisorFilter(e.target.value)}
          className="px-2 py-2 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] w-full sm:w-auto sm:min-w-[200px]"
          data-testid="appt-analysis-filter-advisor"
        >
          {advisorOptions.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
        </select>
      }
    >
      <div className="space-y-4">
        <SectionTabs active={activeSection} onChange={setActiveSection} totals={out.totals} />
        {activeSection === 'overview' && (
          <AdvisorKPITable rows={out.advisors} totals={out.totals} />
        )}
        {activeSection === 'expected' && (
          <AppointmentDrillTable rows={out.appointments} onOpenCustomer={handleOpenCustomer} />
        )}
        {activeSection === 'unexpected' && (
          <UnexpectedSalesTable rows={out.unexpectedSales} onOpenCustomer={handleOpenCustomer} />
        )}
      </div>
    </ReportShell>
  );
}

function SectionTabs({ active, onChange, totals }) {
  const tabs = [
    { id: 'overview',   label: `ภาพรวม (${totals.apptCount} นัด)` },
    { id: 'expected',   label: 'รายนัด' },
    { id: 'unexpected', label: 'ยอดไม่คาดหวัง' },
  ];
  return (
    <div className="flex items-center gap-2 flex-wrap" data-testid="appt-analysis-section-tabs">
      {tabs.map(t => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
              isActive
                ? 'bg-amber-700/30 border-amber-700/50 text-amber-300 ring-1 ring-amber-500/30'
                : 'bg-[var(--bg-hover)] border-[var(--bd)] text-[var(--tx-muted)] hover:text-amber-400'
            }`}
            data-testid={`appt-section-${t.id}`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function AdvisorKPITable({ rows, totals }) {
  const pctColor = (p) => p >= 100 ? 'text-emerald-400' : p >= 70 ? 'text-amber-400' : 'text-rose-400';
  return (
    <div>
      {/* Mobile: card per advisor */}
      <div className="lg:hidden space-y-2" data-testid="appt-analysis-mobile-list">
        {rows.map((r, i) => (
          <div
            key={`${r.advisorKey}-${i}`}
            className="rounded-xl border border-[var(--bd)] bg-[var(--bg-card)] p-3.5"
            data-testid={`advisor-mobile-row-${i}`}
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-bold text-[var(--tx-primary)] leading-snug break-words flex-1">
                {r.advisorName}
              </h3>
              <span className={`text-[10px] font-black tabular-nums ${pctColor(r.performancePct)}`}>
                {r.performancePct.toFixed(2)}%
              </span>
            </div>
            <div className="mt-1.5 text-[10px] text-[var(--tx-muted)]">
              มาตามนัด: <span className="text-[var(--tx-secondary)] font-bold">{r.attendedRateLabel}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 pt-2 border-t border-[var(--bd)] text-[10px]">
              <div>
                <div className="text-[9px] uppercase text-[var(--tx-muted)]">คาดหวัง</div>
                <div className="text-xs font-bold tabular-nums">{fmtMoney(r.expectedSales)}</div>
              </div>
              <div className="text-right">
                <div className="text-[9px] uppercase text-[var(--tx-muted)]">ยอดขายจริง</div>
                <div className="text-xs font-bold tabular-nums text-emerald-400">{fmtMoney(r.actualSales)}</div>
              </div>
              <div>
                <div className="text-[9px] uppercase text-[var(--tx-muted)]">ไม่คาดหวัง</div>
                <div className="text-xs tabular-nums">{fmtMoney(r.unexpectedSales)}</div>
              </div>
              <div className="text-right">
                <div className="text-[9px] uppercase text-[var(--tx-muted)]">ยอดรวม</div>
                <div className="text-sm font-black tabular-nums text-emerald-300">{fmtMoney(r.totalSales)} ฿</div>
              </div>
            </div>
            {(r.remainingCount > 0 || r.forecast !== r.totalSales) && (
              <div className="mt-2 pt-2 border-t border-[var(--bd)] flex items-center gap-2 text-[10px] text-[var(--tx-muted)] justify-between flex-wrap">
                <span>นัดเหลือ: <span className="text-[var(--tx-secondary)] font-bold">{r.remainingCount}</span></span>
                <span>Max: <span className="text-[var(--tx-secondary)] font-bold tabular-nums">{fmtMoney(r.maxPossible)}</span></span>
                <span>Forecast: <span className="text-amber-400 font-bold tabular-nums">{fmtMoney(r.forecast)}</span></span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Desktop: table */}
      <div className="hidden lg:block overflow-auto rounded-lg border border-[var(--bd)] bg-[var(--bg-card)]" data-testid="appt-analysis-table">
        <table className="w-full text-xs min-w-[1400px]">
          <thead className="bg-[var(--bg-hover)] text-[var(--tx-muted)] uppercase text-[10px] tracking-wider sticky top-0 z-[5]">
            <tr>
              <th className="px-3 py-2 text-left font-bold whitespace-nowrap">พนักงานทำนัด</th>
              <th className="px-3 py-2 text-center font-bold whitespace-nowrap">มาตามนัด</th>
              <th className="px-3 py-2 text-right font-bold whitespace-nowrap">ยอดขายที่คาดหวัง</th>
              <th className="px-3 py-2 text-right font-bold whitespace-nowrap">ยอดขาย</th>
              <th className="px-3 py-2 text-right font-bold whitespace-nowrap">Performance</th>
              <th className="px-3 py-2 text-right font-bold whitespace-nowrap">ยอดไม่คาดหวัง</th>
              <th className="px-3 py-2 text-right font-bold whitespace-nowrap">ยอดรวม</th>
              <th className="px-3 py-2 text-right font-bold whitespace-nowrap">คาดหวังจากนัดที่เหลือ</th>
              <th className="px-3 py-2 text-right font-bold whitespace-nowrap">Max</th>
              <th className="px-3 py-2 text-right font-bold whitespace-nowrap">Forecast</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.advisorKey}-${i}`} className="border-t border-[var(--bd)] hover:bg-cyan-900/10" data-testid={`advisor-row-${i}`}>
                <td className="px-3 py-2 whitespace-nowrap font-bold text-[var(--tx-primary)]">{r.advisorName}</td>
                <td className="px-3 py-2 text-center text-[var(--tx-secondary)] text-[11px]">{r.attendedRateLabel}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.expectedSales)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-emerald-400 font-bold">{fmtMoney(r.actualSales)}</td>
                <td className={`px-3 py-2 text-right tabular-nums font-bold ${pctColor(r.performancePct)}`}>{r.performancePct.toFixed(2)}%</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.unexpectedSales)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-black text-emerald-300">{fmtMoney(r.totalSales)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--tx-muted)]">
                  {fmtMoney(r.remainingExpected)} <span className="text-[10px]">({r.remainingCount} นัด)</span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.maxPossible)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-amber-400 font-bold">{fmtMoney(r.forecast)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-[var(--bg-hover)] font-bold text-[var(--tx-primary)] border-t-2 border-[var(--bd)] sticky bottom-0 z-[5]" data-testid="appt-analysis-footer">
            <tr>
              <td className="px-3 py-2">รวม {rows.length} พนักงาน</td>
              <td className="px-3 py-2 text-center text-[11px]">{totals.attendedCount} / {totals.apptCount}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(totals.expectedSales)}</td>
              <td className="px-3 py-2 text-right tabular-nums" data-testid="footer-actual">{fmtMoney(totals.actualSales)}</td>
              <td className={`px-3 py-2 text-right tabular-nums ${pctColor(totals.performancePct)}`}>{totals.performancePct.toFixed(2)}%</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(totals.unexpectedSales)}</td>
              <td className="px-3 py-2 text-right tabular-nums" data-testid="footer-total">{fmtMoney(totals.totalSales)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(totals.remainingExpected)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(totals.maxPossible)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(totals.forecast)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function AppointmentDrillTable({ rows, onOpenCustomer }) {
  if (!rows || rows.length === 0) {
    return <div className="py-8 text-center text-[var(--tx-muted)] text-sm">ยังไม่มีนัดหมายในช่วงนี้</div>;
  }
  return (
    <div className="overflow-auto rounded-lg border border-[var(--bd)] bg-[var(--bg-card)]" data-testid="appt-drill-table">
      <table className="w-full text-xs min-w-[900px]">
        <thead className="bg-[var(--bg-hover)] text-[var(--tx-muted)] uppercase text-[10px] tracking-wider sticky top-0 z-[5]">
          <tr>
            <th className="px-3 py-2 text-left font-bold whitespace-nowrap">ลูกค้า</th>
            <th className="px-3 py-2 text-left font-bold whitespace-nowrap">วันที่</th>
            <th className="px-3 py-2 text-left font-bold whitespace-nowrap">นัดมาเพื่อ</th>
            <th className="px-3 py-2 text-left font-bold whitespace-nowrap">แพทย์</th>
            <th className="px-3 py-2 text-left font-bold whitespace-nowrap">ที่ปรึกษา</th>
            <th className="px-3 py-2 text-right font-bold whitespace-nowrap">คาดหวัง</th>
            <th className="px-3 py-2 text-right font-bold whitespace-nowrap">ยอดขายจริง</th>
            <th className="px-3 py-2 text-left font-bold whitespace-nowrap">สถานะ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.appointmentId}-${i}`} className="border-t border-[var(--bd)] hover:bg-cyan-900/10">
              <td className="px-3 py-2 whitespace-nowrap">
                {r.customerHN && <span className="font-mono text-[10px] text-[var(--tx-muted)] mr-1">{r.customerHN}</span>}
                <button type="button" onClick={() => onOpenCustomer?.(r.customerId)} className="font-bold text-cyan-400 hover:text-cyan-300">{r.customerName}</button>
              </td>
              <td className="px-3 py-2 whitespace-nowrap tabular-nums">{fmtDateCE(r.date)}</td>
              <td className="px-3 py-2 text-[var(--tx-secondary)]">{r.appointmentTo}</td>
              <td className="px-3 py-2 text-[var(--tx-secondary)]">{r.doctorName}</td>
              <td className="px-3 py-2 text-[var(--tx-secondary)]">{r.advisorName}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.expectedSales > 0 ? fmtMoney(r.expectedSales) : '-'}</td>
              <td className={`px-3 py-2 text-right tabular-nums font-bold ${r.actualSales > 0 ? 'text-emerald-400' : 'text-[var(--tx-muted)]'}`}>{r.actualSales > 0 ? fmtMoney(r.actualSales) : '-'}</td>
              <td className="px-3 py-2">{renderStatusChip(r.status)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UnexpectedSalesTable({ rows, onOpenCustomer }) {
  if (!rows || rows.length === 0) {
    return <div className="py-8 text-center text-[var(--tx-muted)] text-sm">ไม่มียอดขายที่ไม่ลิงก์กับนัด</div>;
  }
  return (
    <div className="overflow-auto rounded-lg border border-[var(--bd)] bg-[var(--bg-card)]" data-testid="unexpected-sales-table">
      <table className="w-full text-xs min-w-[700px]">
        <thead className="bg-[var(--bg-hover)] text-[var(--tx-muted)] uppercase text-[10px] tracking-wider sticky top-0 z-[5]">
          <tr>
            <th className="px-3 py-2 text-left font-bold whitespace-nowrap">ลูกค้า</th>
            <th className="px-3 py-2 text-left font-bold whitespace-nowrap">วันที่ขาย</th>
            <th className="px-3 py-2 text-left font-bold whitespace-nowrap">ผู้ขาย</th>
            <th className="px-3 py-2 text-right font-bold whitespace-nowrap">ยอดขาย</th>
            <th className="px-3 py-2 text-left font-bold whitespace-nowrap">สถานะ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.saleId}-${i}`} className="border-t border-[var(--bd)]">
              <td className="px-3 py-2 whitespace-nowrap">
                {r.customerHN && <span className="font-mono text-[10px] text-[var(--tx-muted)] mr-1">{r.customerHN}</span>}
                <button type="button" onClick={() => onOpenCustomer?.(r.customerId)} className="font-bold text-cyan-400 hover:text-cyan-300">{r.customerName}</button>
              </td>
              <td className="px-3 py-2 whitespace-nowrap tabular-nums">{fmtDateCE(r.saleDate)}</td>
              <td className="px-3 py-2 text-[var(--tx-secondary)]">{r.advisorName}</td>
              <td className="px-3 py-2 text-right tabular-nums font-bold text-emerald-400">{fmtMoney(r.actualSales)}</td>
              <td className="px-3 py-2 text-[10px] whitespace-nowrap">
                <span className={`uppercase tracking-wider px-1.5 py-0.5 rounded font-bold border ${
                  r.status === 'paid' ? 'bg-emerald-900/30 text-emerald-300 border-emerald-700/50' :
                  r.status === 'unpaid' ? 'bg-rose-900/30 text-rose-300 border-rose-700/50' :
                  r.status === 'split' ? 'bg-amber-900/30 text-amber-300 border-amber-700/50' :
                  'bg-[var(--bg-hover)] text-[var(--tx-muted)] border-[var(--bd)]'
                }`}>
                  {SALE_PAYMENT_LABELS[r.status] || r.status || '-'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
