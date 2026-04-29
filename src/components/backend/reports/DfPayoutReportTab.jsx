// ─── DF Payout Report Tab — Phase 13.4.2 / extended Phase 16.7-bis ────────
//
// Per-doctor + per-assistant DF payout over a date range. Joins:
//   be_sales × be_treatments × be_doctors × be_df_groups × be_df_staff_rates
//   × be_expenses × be_staff
//
// Phase 16.7-bis (2026-04-29 session 33) extension per user directive:
//   "ค่านั่ง ค่ามือ เงินเดือน และรายจ่ายอื่นๆ ของแพทย์ จะไปอยู่ใน tab
//   reports-df-payout ด้วย"
//
//   - Doctor table now shows 7 columns: รหัสแพทย์ / ชื่อแพทย์ / ค่านั่ง /
//     ค่ามือ (DF) / เงินเดือน / รายจ่ายอื่นๆ / ยอดรวม
//   - NEW Assistant table mirrors columns minus ค่านั่ง (sit-fee is doctor-
//     only per ProClinic /admin/report/expense intel)
//   - DF data still flows from dfPayoutAggregator (Phase 14.4 canonical
//     source = treatment.detail.dfEntries[]); other columns from be_expenses
//     joined by userId.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Percent } from 'lucide-react';
import ReportShell from './ReportShell.jsx';
import DateRangePicker, { buildPresets } from './DateRangePicker.jsx';
import { computeDfPayoutReport } from '../../../lib/dfPayoutAggregator.js';
import {
  loadSalesByDateRange,
  loadTreatmentsByDateRange,
  loadExpensesByDateRange,
} from '../../../lib/reportsLoaders.js';
import {
  listDoctors,
  listStaff,
  listDfGroups,
  listDfStaffRates,
  listCourses,
} from '../../../lib/backendClient.js';
import {
  filterExpensesForExpenseReport,
  buildExpenseDoctorRows,
  buildExpenseStaffRows,
  computeExpenseSummary,
  // Phase 16.7-ter — surface DF for treatments without linkedSaleId
  computeUnlinkedTreatmentDfBuckets,
  mergeUnlinkedDfIntoPayoutRows,
} from '../../../lib/expenseReportHelpers.js';
import { downloadCSV } from '../../../lib/csvExport.js';
import { fmtMoney } from '../../../lib/financeUtils.js';

const DOCTOR_COLUMNS = [
  { key: 'id',     label: 'รหัสแพทย์' },
  { key: 'name',   label: 'ชื่อแพทย์' },
  { key: 'sitFee', label: 'ค่านั่ง',      format: (v) => fmtMoney(v) },
  { key: 'df',     label: 'ค่ามือ (DF)',   format: (v) => fmtMoney(v) },
  { key: 'salary', label: 'เงินเดือน',   format: (v) => fmtMoney(v) },
  { key: 'other',  label: 'รายจ่ายอื่นๆ', format: (v) => fmtMoney(v) },
  { key: 'total',  label: 'ยอดรวม',      format: (v) => fmtMoney(v) },
];

const ASSISTANT_COLUMNS = [
  { key: 'id',     label: 'รหัสผู้ช่วย' },
  { key: 'name',   label: 'ชื่อผู้ช่วย' },
  { key: 'df',     label: 'ค่ามือ (DF)',   format: (v) => fmtMoney(v) },
  { key: 'salary', label: 'เงินเดือน',   format: (v) => fmtMoney(v) },
  { key: 'other',  label: 'รายจ่ายอื่นๆ', format: (v) => fmtMoney(v) },
  { key: 'total',  label: 'ยอดรวม',      format: (v) => fmtMoney(v) },
];

export default function DfPayoutReportTab({ clinicSettings, theme }) {
  const initialPreset = useMemo(() => buildPresets().find((p) => p.id === 'thisMonth'), []);
  const [from, setFrom] = useState(initialPreset.from);
  const [to, setTo] = useState(initialPreset.to);
  const [presetId, setPresetId] = useState(initialPreset.id);
  const [sales, setSales] = useState([]);
  const [treatments, setTreatments] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [staff, setStaff] = useState([]);
  const [groups, setGroups] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let abort = false;
    setLoading(true); setError('');
    Promise.all([
      loadSalesByDateRange({ from, to }),
      loadTreatmentsByDateRange({ from, to }).catch(() => []),
      loadExpensesByDateRange({ from, to }).catch(() => []),
      listDoctors().catch(() => []),
      listStaff().catch(() => []),
      listDfGroups().catch(() => []),
      listDfStaffRates().catch(() => []),
      // Phase 16.7-ter — be_courses for percent-rate price lookup on
      // unlinked treatments (no sale to read price from).
      listCourses().catch(() => []),
    ])
      .then(([s, t, e, d, st, g, o, c]) => {
        if (abort) return;
        setSales(s || []);
        setTreatments(t || []);
        setExpenses(e || []);
        setDoctors(d || []);
        setStaff(st || []);
        setGroups(g || []);
        setOverrides(o || []);
        setCourses(c || []);
      })
      .catch((err) => { if (!abort) setError(err?.message || 'โหลดข้อมูลล้มเหลว'); })
      .finally(() => { if (!abort) setLoading(false); });
    return () => { abort = true; };
  }, [from, to, reloadKey]);

  const out = useMemo(() => {
    // Phase 14 DF computation (canonical)
    const dfReport = computeDfPayoutReport({
      sales,
      treatments,
      doctors,
      groups,
      staffOverrides: overrides,
      startDate: from,
      endDate: to,
    });
    // Phase 16.7-bis: enrich with 4 expense columns from be_expenses
    const filteredExpenses = filterExpensesForExpenseReport(expenses, { from, to });
    const dfPayoutRowsRaw = Array.isArray(dfReport?.rows) ? dfReport.rows : [];

    // Phase 16.7-ter: merge in DF from treatments without linkedSaleId.
    // Production data finding (2026-04-29 session 33): 6 treatments in April
    // had filled dfEntries but ALL had `linkedSaleId=''` (consume-existing-
    // course case). dfPayoutAggregator skipped them entirely → ฿0 across
    // the board. This block surfaces baht-type DF directly + percent-type
    // via course price lookup.
    const courseById = new Map(
      (Array.isArray(courses) ? courses : []).map(c => [String(c?.courseId || c?.id || ''), c])
    );
    const priceLookup = (courseId) => {
      const c = courseById.get(String(courseId));
      if (!c) return 0;
      const candidates = [c.price, c.salePrice, c.sale_price, c.priceInclVat, c.price_incl_vat];
      for (const v of candidates) {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) return n;
      }
      return 0;
    };
    const alreadyCountedSaleIds = new Set();
    for (const r of dfPayoutRowsRaw) {
      for (const b of (r.breakdown || [])) {
        if (b?.saleId) alreadyCountedSaleIds.add(String(b.saleId));
      }
    }
    const unlinkedBuckets = computeUnlinkedTreatmentDfBuckets(
      treatments,
      { alreadyCountedSaleIds, priceLookup },
    );
    const dfPayoutRows = mergeUnlinkedDfIntoPayoutRows(dfPayoutRowsRaw, unlinkedBuckets, doctors);

    const doctorRows = buildExpenseDoctorRows({
      doctors,
      expenses: filteredExpenses,
      dfPayoutRows,
    });
    // Assistant section: re-use buildExpenseStaffRows but filter out be_staff
    // entries (we only want assistants here — be_staff goes to ExpenseReportTab).
    const staffSectionRows = buildExpenseStaffRows({
      staff: [], // empty so the helper only emits ผู้ช่วยแพทย์ rows
      doctors,
      expenses: filteredExpenses,
      dfPayoutRows,
    });
    const summary = computeExpenseSummary({
      doctorRows,
      staffRows: staffSectionRows,
      categoryRows: [],
    });
    return {
      doctorRows,
      assistantRows: staffSectionRows,
      summary,
      dfSummary: dfReport.summary || { total: 0, doctorCount: 0, lineCount: 0, saleCount: 0 },
      unlinkedDfDoctors: unlinkedBuckets.size,
    };
  }, [sales, treatments, doctors, groups, overrides, expenses, courses, from, to]);

  const handleRangeChange = useCallback(({ from: f, to: t, presetId: id }) => {
    setFrom(f); setTo(t); setPresetId(id);
  }, []);

  const handleExport = useCallback(() => {
    // Doctor + Assistant sections each as a separate sheet via combined CSV.
    // (UTF-8 BOM in csvExport.downloadCSV.) We emit doctors first, blank line,
    // then assistants. Total reconciliation via summary in the meta header.
    const docRowsCsv = (out.doctorRows || []).map(r => ({
      id: r.id,
      name: r.name,
      sitFee: r.sitFee,
      df: r.df,
      salary: r.salary,
      other: r.other,
      total: r.total,
    }));
    downloadCSV(`df-payout_${from}_to_${to}_doctors`, docRowsCsv, DOCTOR_COLUMNS);
  }, [out, from, to]);

  const handleRefresh = useCallback(() => setReloadKey((k) => k + 1), []);

  const subtitle = `${from} → ${to} · ` +
    `แพทย์ ${out.doctorRows.length} ราย รวม ${fmtMoney(out.summary.totalDoctor)} บาท · ` +
    `ผู้ช่วย ${out.assistantRows.length} ราย รวม ${fmtMoney(out.summary.totalStaff)} บาท`;

  return (
    <ReportShell
      icon={Percent}
      title="รายงานจ่าย DF (ค่ามือแพทย์ + ผู้ช่วย)"
      subtitle={subtitle}
      totalCount={out.doctorRows.length + out.assistantRows.length}
      filteredCount={out.doctorRows.length + out.assistantRows.length}
      onExport={handleExport}
      exportDisabled={out.doctorRows.length === 0 && out.assistantRows.length === 0}
      onRefresh={handleRefresh}
      loading={loading}
      error={error}
      emptyText="ยังไม่มีข้อมูลในช่วงนี้"
      notFoundText="ไม่พบข้อมูล"
      clinicSettings={clinicSettings}
      dateRangeSlot={<DateRangePicker from={from} to={to} presetId={presetId} onChange={handleRangeChange} />}
    >
      {/* DOCTOR SECTION */}
      <div className="mb-4" data-testid="df-payout-doctor-section">
        <h3 className="text-sm font-bold text-rose-300 mb-2">รายจ่ายแพทย์ ({out.doctorRows.length} ราย)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="df-payout-doctor-table">
            <thead>
              <tr className="border-b-2 border-[var(--bd)] text-[var(--tx-muted)]">
                {DOCTOR_COLUMNS.map((c) => (
                  <th key={c.key} className="text-left py-2 px-2 text-xs font-bold uppercase tracking-wider">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {out.doctorRows.map((r) => (
                <tr key={r.id} data-testid={`df-payout-doctor-row-${r.id}`}
                  className="border-b border-[var(--bd)] hover:bg-[var(--bg-hover)]">
                  <td className="py-2 px-2 font-mono text-xs text-[var(--tx-muted)]">{r.id}</td>
                  <td className="py-2 px-2 font-semibold">{r.name || '—'}</td>
                  <td className="py-2 px-2 tabular-nums">{fmtMoney(r.sitFee)}</td>
                  <td className="py-2 px-2 tabular-nums font-bold text-emerald-400">{fmtMoney(r.df)}</td>
                  <td className="py-2 px-2 tabular-nums">{fmtMoney(r.salary)}</td>
                  <td className="py-2 px-2 tabular-nums">{fmtMoney(r.other)}</td>
                  <td className="py-2 px-2 tabular-nums font-black text-amber-300">{fmtMoney(r.total)}</td>
                </tr>
              ))}
            </tbody>
            {out.doctorRows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-[var(--bd)] font-bold">
                  <td colSpan={2} className="py-2 px-2">รวม</td>
                  <td className="py-2 px-2 tabular-nums">{fmtMoney(out.summary.totalDoctorSit)}</td>
                  <td className="py-2 px-2 tabular-nums text-emerald-400">{fmtMoney(out.summary.totalDoctorDf)}</td>
                  <td className="py-2 px-2 tabular-nums">{fmtMoney(out.summary.totalDoctorSalary)}</td>
                  <td className="py-2 px-2 tabular-nums">{fmtMoney(out.summary.totalDoctorOther)}</td>
                  <td className="py-2 px-2 tabular-nums font-black text-amber-300">{fmtMoney(out.summary.totalDoctor)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {out.doctorRows.length === 0 && (
          <p className="text-xs text-[var(--tx-muted)] py-3 text-center">ไม่มีข้อมูลแพทย์ในช่วงเวลานี้</p>
        )}
      </div>

      {/* ASSISTANT SECTION */}
      <div data-testid="df-payout-assistant-section">
        <h3 className="text-sm font-bold text-amber-300 mb-2">รายจ่ายผู้ช่วยแพทย์ ({out.assistantRows.length} ราย)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="df-payout-assistant-table">
            <thead>
              <tr className="border-b-2 border-[var(--bd)] text-[var(--tx-muted)]">
                {ASSISTANT_COLUMNS.map((c) => (
                  <th key={c.key} className="text-left py-2 px-2 text-xs font-bold uppercase tracking-wider">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {out.assistantRows.map((r) => (
                <tr key={r.id} data-testid={`df-payout-assistant-row-${r.id}`}
                  className="border-b border-[var(--bd)] hover:bg-[var(--bg-hover)]">
                  <td className="py-2 px-2 font-mono text-xs text-[var(--tx-muted)]">{r.id}</td>
                  <td className="py-2 px-2 font-semibold">{r.name || '—'}</td>
                  <td className="py-2 px-2 tabular-nums font-bold text-emerald-400">{fmtMoney(r.df)}</td>
                  <td className="py-2 px-2 tabular-nums">{fmtMoney(r.salary)}</td>
                  <td className="py-2 px-2 tabular-nums">{fmtMoney(r.other)}</td>
                  <td className="py-2 px-2 tabular-nums font-black text-amber-300">{fmtMoney(r.total)}</td>
                </tr>
              ))}
            </tbody>
            {out.assistantRows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-[var(--bd)] font-bold">
                  <td colSpan={2} className="py-2 px-2">รวม</td>
                  <td className="py-2 px-2 tabular-nums text-emerald-400">{fmtMoney(out.summary.totalStaffDf)}</td>
                  <td className="py-2 px-2 tabular-nums">{fmtMoney(out.summary.totalStaffSalary)}</td>
                  <td className="py-2 px-2 tabular-nums">{fmtMoney(out.summary.totalStaffOther)}</td>
                  <td className="py-2 px-2 tabular-nums font-black text-amber-300">{fmtMoney(out.summary.totalStaff)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {out.assistantRows.length === 0 && (
          <p className="text-xs text-[var(--tx-muted)] py-3 text-center">ไม่มีข้อมูลผู้ช่วยในช่วงเวลานี้</p>
        )}
      </div>
    </ReportShell>
  );
}
