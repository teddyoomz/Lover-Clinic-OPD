// audit-branch-scope: report — uses {allBranches:true} for cross-branch aggregation
// ─── StaffSalesTab — Phase 10.X2 ──────────────────────────────────────────
// Closes 2 ReportsHome cards:
//  - "ยอดขายรายแพทย์/พนักงาน" (sub-tab: ทั้งหมด / ตามยอดเงินที่ชำระ)
//
// Sections: Staff (sellers — share-weighted split) + Doctor (full sale
// attributed to sale's doctorName / treatment.doctorName).

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Users } from 'lucide-react';
import ReportShell from './ReportShell.jsx';
import DateRangePicker, { buildPresets } from './DateRangePicker.jsx';
import {
  aggregateStaffSales,
  buildStaffColumns,
  buildDoctorColumns,
} from '../../../lib/staffSalesAggregator.js';
import { loadSalesByDateRange } from '../../../lib/reportsLoaders.js';
// Phase 14.10-tris (2026-04-26) — listStaff + listDoctors (be_*) canonical
import { listStaff, listDoctors } from '../../../lib/backendClient.js';
import { downloadCSV } from '../../../lib/csvExport.js';
import { fmtMoney } from '../../../lib/financeUtils.js';

export default function StaffSalesTab({ clinicSettings, theme }) {
  const initialPreset = useMemo(() => buildPresets().find(p => p.id === 'thisMonth'), []);
  const [from, setFrom] = useState(initialPreset.from);
  const [to, setTo] = useState(initialPreset.to);
  const [presetId, setPresetId] = useState(initialPreset.id);
  const [searchText, setSearchText] = useState('');
  const [viewMode, setViewMode] = useState('staff'); // staff | doctor
  const [sales, setSales] = useState([]);
  const [staffMaster, setStaffMaster] = useState([]);
  const [doctorMaster, setDoctorMaster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let abort = false;
    setLoading(true); setError('');
    Promise.all([
      loadSalesByDateRange({ from, to }),
      listStaff().catch(() => []),
      listDoctors().catch(() => []),
    ])
      .then(([s, st, dc]) => {
        if (abort) return;
        setSales(s); setStaffMaster(st); setDoctorMaster(dc);
      })
      .catch(e => { if (!abort) setError(e?.message || 'โหลดข้อมูลล้มเหลว'); })
      .finally(() => { if (!abort) setLoading(false); });
    return () => { abort = true; };
  }, [from, to, reloadKey]);

  const out = useMemo(
    () => aggregateStaffSales(sales, {
      from, to, searchText,
      staffMasterList: staffMaster, doctorMasterList: doctorMaster,
    }),
    [sales, staffMaster, doctorMaster, from, to, searchText]
  );

  const activeRows = viewMode === 'staff' ? out.staffRows : out.doctorRows;
  const columns = useMemo(
    () => viewMode === 'staff' ? buildStaffColumns({ fmtMoney }) : buildDoctorColumns({ fmtMoney }),
    [viewMode]
  );

  const handleRangeChange = useCallback(({ from: f, to: t, presetId: id }) => {
    setFrom(f); setTo(t); setPresetId(id);
  }, []);

  const handleExport = useCallback(() => {
    const mode = viewMode === 'staff' ? 'staff' : 'doctor';
    downloadCSV(`${mode}-sales_${from}_to_${to}`, activeRows, columns);
  }, [activeRows, columns, from, to, viewMode]);

  const handleRefresh = useCallback(() => setReloadKey(k => k + 1), []);

  // Use union of both view counts so ReportShell doesn't trigger empty-state
  // when ONE view is empty but the other has data — that would hide the mode
  // tabs and trap the user. Empty messaging handled inline per view.
  const anyData = out.staffRows.length + out.doctorRows.length > 0;

  return (
    <ReportShell
      icon={Users}
      title="ยอดขายรายพนักงาน / แพทย์"
      subtitle={`${from} → ${to} · ${out.totals.saleCount} ใบขาย (${viewMode === 'staff' ? 'แบ่งตามพนักงาน' : 'รวมยอดที่แพทย์'})`}
      totalCount={anyData ? 1 : 0}
      filteredCount={anyData ? 1 : 0}
      onExport={handleExport}
      exportDisabled={activeRows.length === 0}
      onRefresh={handleRefresh}
      loading={loading}
      error={error}
      emptyText="ยังไม่มีข้อมูลการขายในช่วงนี้"
      notFoundText="ไม่พบข้อมูล"
      clinicSettings={clinicSettings}
      dateRangeSlot={
        <DateRangePicker from={from} to={to} presetId={presetId} onChange={handleRangeChange} />
      }
      filtersSlot={
        <>
          <input
            type="text"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder={viewMode === 'staff' ? 'ค้นหาพนักงาน' : 'ค้นหาแพทย์'}
            className="px-2 py-2 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] w-full sm:w-auto sm:min-w-[220px] sm:flex-1"
            data-testid="staff-sales-filter-search"
          />
          <ViewModeTabs active={viewMode} onChange={setViewMode} totals={out.totals} />
        </>
      }
    >
      <div className="space-y-4">
        {viewMode === 'staff' ? (
          out.staffRows.length > 0
            ? <StaffList rows={out.staffRows} totalNet={out.totals.netTotal} />
            : <EmptyInline label="ไม่พบข้อมูลพนักงานในช่วงนี้" />
        ) : (
          out.doctorRows.length > 0
            ? <DoctorList rows={out.doctorRows} totalNet={out.totals.netTotal} />
            : <EmptyInline label="ไม่พบข้อมูลแพทย์ในช่วงนี้" />
        )}
      </div>
    </ReportShell>
  );
}

function EmptyInline({ label }) {
  return (
    <div className="py-12 text-center text-[var(--tx-muted)] text-sm border border-dashed border-[var(--bd)] rounded-lg">
      {label}
    </div>
  );
}

function ViewModeTabs({ active, onChange, totals }) {
  const tabs = [
    { id: 'staff',  label: `ตามพนักงาน (${totals.staffCount})` },
    { id: 'doctor', label: `ตามแพทย์ (${totals.doctorCount})` },
  ];
  return (
    <div className="flex items-center gap-2 flex-wrap" data-testid="staff-sales-mode-tabs">
      {tabs.map(t => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
              isActive
                ? 'bg-sky-700/30 border-sky-700/50 text-sky-300 ring-1 ring-sky-500/30'
                : 'bg-[var(--bg-hover)] border-[var(--bd)] text-[var(--tx-muted)] hover:text-sky-400'
            }`}
            data-testid={`staff-sales-mode-${t.id}`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function StaffList({ rows, totalNet }) {
  const max = rows.length > 0 ? Math.max(...rows.map(r => r.netShare), 1) : 1;
  return (
    <div data-testid="staff-sales-list">
      {/* Mobile cards */}
      <div className="lg:hidden space-y-2">
        {rows.map((r, i) => {
          const pct = Math.round((r.netShare / max) * 100);
          return (
            <div key={r.staffKey} className="rounded-xl border border-[var(--bd)] bg-[var(--bg-card)] p-3"
                 data-testid={`staff-row-${i}`}>
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-bold text-[var(--tx-primary)] truncate">{r.staffName}</h3>
                <span className="text-sm font-black tabular-nums text-emerald-400">{fmtMoney(r.netShare)}</span>
              </div>
              <div className="text-[10px] text-[var(--tx-muted)] mt-1">
                {r.saleCount} ใบขาย · ชำระแล้ว {fmtMoney(r.paidShare)}
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-[var(--bg-hover)] overflow-hidden">
                <div className="h-full bg-gradient-to-r from-sky-500 to-sky-300" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      {/* Desktop table */}
      <div className="hidden lg:block overflow-auto rounded-lg border border-[var(--bd)] bg-[var(--bg-card)]" data-testid="staff-sales-table">
        <table className="w-full text-xs">
          <thead className="bg-[var(--bg-hover)] text-[var(--tx-muted)] uppercase text-[10px] tracking-wider sticky top-0 z-[5]">
            <tr>
              <th className="px-3 py-2 text-left font-bold">พนักงานขาย</th>
              <th className="px-3 py-2 text-center font-bold">ใบขาย</th>
              <th className="px-3 py-2 text-right font-bold">ยอดขาย (แบ่งตามสัดส่วน)</th>
              <th className="px-3 py-2 text-right font-bold">ยอดที่ชำระ (แบ่งตามสัดส่วน)</th>
              <th className="px-3 py-2 text-right font-bold">% ของรวม</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const pct = totalNet > 0 ? (r.netShare / totalNet) * 100 : 0;
              return (
                <tr key={r.staffKey} className="border-t border-[var(--bd)] hover:bg-cyan-900/10" data-testid={`staff-row-${i}`}>
                  <td className="px-3 py-2 font-bold text-[var(--tx-primary)]">{r.staffName}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{r.saleCount}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-emerald-400">{fmtMoney(r.netShare)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.paidShare)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--tx-muted)]">{pct.toFixed(2)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DoctorList({ rows, totalNet }) {
  const max = rows.length > 0 ? Math.max(...rows.map(r => r.netTotal), 1) : 1;
  return (
    <div data-testid="doctor-sales-list">
      <div className="lg:hidden space-y-2">
        {rows.map((r, i) => {
          const pct = Math.round((r.netTotal / max) * 100);
          return (
            <div key={r.doctorKey} className="rounded-xl border border-[var(--bd)] bg-[var(--bg-card)] p-3"
                 data-testid={`doctor-row-${i}`}>
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-bold text-[var(--tx-primary)] truncate">{r.doctorName}</h3>
                <span className="text-sm font-black tabular-nums text-emerald-400">{fmtMoney(r.netTotal)}</span>
              </div>
              <div className="text-[10px] text-[var(--tx-muted)] mt-1">
                {r.saleCount} ใบขาย · ชำระแล้ว {fmtMoney(r.paidAmount)}
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-[var(--bg-hover)] overflow-hidden">
                <div className="h-full bg-gradient-to-r from-cyan-500 to-cyan-300" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="hidden lg:block overflow-auto rounded-lg border border-[var(--bd)] bg-[var(--bg-card)]" data-testid="doctor-sales-table">
        <table className="w-full text-xs">
          <thead className="bg-[var(--bg-hover)] text-[var(--tx-muted)] uppercase text-[10px] tracking-wider sticky top-0 z-[5]">
            <tr>
              <th className="px-3 py-2 text-left font-bold">แพทย์</th>
              <th className="px-3 py-2 text-center font-bold">ใบขาย</th>
              <th className="px-3 py-2 text-right font-bold">ยอดขายรวม</th>
              <th className="px-3 py-2 text-right font-bold">ยอดที่ชำระ</th>
              <th className="px-3 py-2 text-right font-bold">% ของรวม</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const pct = totalNet > 0 ? (r.netTotal / totalNet) * 100 : 0;
              return (
                <tr key={r.doctorKey} className="border-t border-[var(--bd)] hover:bg-cyan-900/10" data-testid={`doctor-row-${i}`}>
                  <td className="px-3 py-2 font-bold text-[var(--tx-primary)]">{r.doctorName}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{r.saleCount}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-emerald-400">{fmtMoney(r.netTotal)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.paidAmount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--tx-muted)]">{pct.toFixed(2)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
