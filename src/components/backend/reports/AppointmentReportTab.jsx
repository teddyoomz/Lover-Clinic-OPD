// ─── AppointmentReportTab — Phase 10.4 ────────────────────────────────────
// Replicates ProClinic /admin/report/appointment (10 cols + Export File).
// Joins be_appointments + be_customers (customerType) + master_data/staff
// (assistant names). Read-only over existing collections — no mutations.
//
// Triangle-verified 2026-04-19: opd.js intel captured 10 cols + 4 filters
// (q, customer_type_2, appointment_status, period). Status filter
// preserves ProClinic's option set (confirmed/pending/postpone); our
// internal statuses (pending/confirmed/done/cancelled) map to the same
// dropdown where possible, with `done` surfaced as an added option so
// completed-appointment reports are usable.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { CalendarCheck, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import ReportShell from './ReportShell.jsx';
import DateRangePicker, { buildPresets } from './DateRangePicker.jsx';
import {
  aggregateAppointmentReport,
  buildAppointmentReportColumns,
} from '../../../lib/appointmentReportAggregator.js';
import {
  loadAppointmentsByDateRange,
  loadAllCustomersForReport,
} from '../../../lib/reportsLoaders.js';
import { getAllMasterDataItems } from '../../../lib/backendClient.js';
import { downloadCSV } from '../../../lib/csvExport.js';
import { sortBy } from '../../../lib/reportsUtils.js';

// Sortable columns — keys map onto aggregator row fields.
const SORTABLE = {
  date:                 { key: 'date',                 type: 'string', label: 'วันที่นัด' },
  customerName:         { key: 'customerName',         type: 'string', label: 'ลูกค้า' },
  customerType:         { key: 'customerType',         type: 'string', label: 'ประเภทลูกค้า' },
  appointmentTypeLabel: { key: 'appointmentTypeLabel', type: 'string', label: 'ประเภทนัด' },
  statusLabel:          { key: 'statusLabel',          type: 'string', label: 'สถานะ' },
  doctorName:           { key: 'doctorName',           type: 'string', label: 'แพทย์' },
  advisorName:          { key: 'advisorName',          type: 'string', label: 'ที่ปรึกษา' },
};

const STATUS_OPTIONS = [
  { v: 'all',       t: 'ทุกสถานะนัดหมาย' },
  { v: 'pending',   t: 'รอยืนยัน' },
  { v: 'confirmed', t: 'ยืนยันแล้ว' },
  { v: 'done',      t: 'เสร็จแล้ว' },
  { v: 'cancelled', t: 'ยกเลิก' },
];

const TYPE_OPTIONS = [
  { v: 'all',      t: 'ทุกประเภทนัด' },
  { v: 'sales',    t: 'นัดเพื่อขาย' },
  { v: 'followup', t: 'นัดติดตาม' },
];

// Badge colors per status (NO red on names — Thai culture; red only on the
// "ยกเลิก" status chip itself, which is acceptable per existing AppointmentTab).
const STATUS_BADGE = {
  pending:   'bg-orange-900/30 text-orange-300 border-orange-700/50',
  confirmed: 'bg-sky-900/30    text-sky-300    border-sky-700/50',
  done:      'bg-emerald-900/30 text-emerald-300 border-emerald-700/50',
  cancelled: 'bg-red-900/30    text-red-300    border-red-700/50',
};
const TYPE_BADGE = {
  sales:    'bg-cyan-900/30    text-cyan-300    border-cyan-700/50',
  followup: 'bg-violet-900/30  text-violet-300  border-violet-700/50',
};

/** YYYY-MM-DD → dd/mm/yyyy ค.ศ. (admin — AR13). */
function fmtDateCE(iso) {
  if (!iso || typeof iso !== 'string') return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export default function AppointmentReportTab({ clinicSettings, theme }) {
  // Default range: this month — appointments are recency-dominant.
  const initialPreset = useMemo(() => buildPresets().find(p => p.id === 'thisMonth'), []);
  const [from, setFrom] = useState(initialPreset.from);
  const [to, setTo] = useState(initialPreset.to);
  const [presetId, setPresetId] = useState(initialPreset.id);
  const [searchText, setSearchText] = useState('');
  const [customerTypeFilter, setCustomerTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortKey, setSortKey] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  const [appointments, setAppointments] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  // Load appointments narrowed by date range; customers + staff are small
  // reference sets loaded once.
  useEffect(() => {
    let abort = false;
    setLoading(true); setError('');
    Promise.all([
      loadAppointmentsByDateRange({ from, to }),
      loadAllCustomersForReport(),
      getAllMasterDataItems('staff'),
    ])
      .then(([appts, cs, st]) => {
        if (abort) return;
        setAppointments(appts);
        setCustomers(cs);
        setStaff(st);
      })
      .catch(e => { if (!abort) setError(e?.message || 'โหลดข้อมูลล้มเหลว'); })
      .finally(() => { if (!abort) setLoading(false); });
    return () => { abort = true; };
  }, [from, to, reloadKey]);

  const out = useMemo(
    () => aggregateAppointmentReport(appointments, customers, staff, {
      from, to, searchText, customerTypeFilter, statusFilter, typeFilter,
    }),
    [appointments, customers, staff, from, to, searchText,
     customerTypeFilter, statusFilter, typeFilter]
  );

  // Apply column sort AFTER aggregation. Aggregator default is date desc.
  const sortedRows = useMemo(() => {
    if (sortKey === 'date' && sortDir === 'desc') return out.rows;
    const meta = SORTABLE[sortKey];
    if (!meta) return out.rows;
    return sortBy(out.rows, r => {
      const v = r?.[meta.key];
      if (meta.type === 'number') return Number(v) || 0;
      return v || '';
    }, sortDir);
  }, [out.rows, sortKey, sortDir]);

  // Derive customer-type dropdown from data (plus the 3 ProClinic canonical
  // values even if they're not present yet, so the filter always has them).
  const customerTypeOptions = useMemo(() => {
    const set = new Set(['ลูกค้าทั่วไป', 'ลูกค้ารีวิว', 'Influencer']);
    for (const c of customers) {
      const ct = (c?.patientData?.customerType2 || '').trim();
      if (ct) set.add(ct);
    }
    return [{ v: 'all', t: 'ทุกประเภทลูกค้า' }, ...[...set].sort().map(t => ({ v: t, t }))];
  }, [customers]);

  const columns = useMemo(
    () => buildAppointmentReportColumns({ fmtDate: fmtDateCE }),
    []
  );

  const handleRangeChange = useCallback(({ from: f, to: t, presetId: id }) => {
    setFrom(f); setTo(t); setPresetId(id);
  }, []);

  const handleExport = useCallback(() => {
    const fname = `appointment-report_${from}_to_${to}`;
    downloadCSV(fname, out.rows, columns);
  }, [out.rows, columns, from, to]);

  const handleRefresh = useCallback(() => setReloadKey(k => k + 1), []);

  const handleSort = useCallback((key) => {
    setSortKey(prev => {
      if (prev === key) {
        setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        return prev;
      }
      setSortDir(SORTABLE[key]?.type === 'number' ? 'desc' : 'asc');
      return key;
    });
  }, []);

  const handleOpenCustomer = useCallback((customerId) => {
    if (!customerId || typeof window === 'undefined') return;
    window.open(`${window.location.origin}?backend=1&customer=${customerId}`, '_blank');
  }, []);

  return (
    <ReportShell
      icon={CalendarCheck}
      title="นัดหมาย"
      subtitle={`ช่วง ${from} → ${to}`}
      totalCount={out.meta.totalCount}
      filteredCount={out.meta.filteredCount}
      onExport={handleExport}
      exportDisabled={out.meta.filteredCount === 0}
      onRefresh={handleRefresh}
      loading={loading}
      error={error}
      emptyText="ยังไม่มีนัดหมายในช่วงที่เลือก"
      notFoundText="ไม่พบนัดหมายตามตัวกรอง"
      clinicSettings={clinicSettings}
      dateRangeSlot={
        <DateRangePicker from={from} to={to} presetId={presetId} onChange={handleRangeChange} />
      }
      filtersSlot={
        <FiltersRow
          searchText={searchText} setSearchText={setSearchText}
          customerTypeFilter={customerTypeFilter} setCustomerTypeFilter={setCustomerTypeFilter}
          statusFilter={statusFilter} setStatusFilter={setStatusFilter}
          typeFilter={typeFilter} setTypeFilter={setTypeFilter}
          customerTypeOptions={customerTypeOptions}
        />
      }
    >
      <AppointmentReportTable
        rows={sortedRows}
        totals={out.totals}
        onOpenCustomer={handleOpenCustomer}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
      />
    </ReportShell>
  );
}

function SortHeader({ sortKey, currentKey, currentDir, onSort, align = 'left', children }) {
  const isActive = currentKey === sortKey;
  const Arrow = isActive ? (currentDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  const ariaSort = isActive ? (currentDir === 'asc' ? 'ascending' : 'descending') : 'none';
  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={`px-3 py-2 ${align === 'right' ? 'text-right' : 'text-left'} font-bold whitespace-nowrap`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 select-none transition-colors ${
          isActive ? 'text-cyan-300' : 'text-[var(--tx-muted)] hover:text-[var(--tx-secondary)]'
        }`}
        data-testid={`sort-${sortKey}`}
        title={`เรียงตาม${SORTABLE[sortKey]?.label || sortKey}`}
      >
        <span>{children}</span>
        <Arrow size={11} className={isActive ? '' : 'opacity-40'} />
      </button>
    </th>
  );
}

function FiltersRow({
  searchText, setSearchText,
  customerTypeFilter, setCustomerTypeFilter,
  statusFilter, setStatusFilter,
  typeFilter, setTypeFilter,
  customerTypeOptions,
}) {
  return (
    <>
      <input
        type="text"
        value={searchText}
        onChange={e => setSearchText(e.target.value)}
        placeholder="ค้นหา HN / ชื่อ / หมอ / นัดมาเพื่อ"
        className="px-2 py-1.5 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] min-w-[240px]"
        data-testid="appt-filter-search"
      />
      <select
        value={customerTypeFilter}
        onChange={e => setCustomerTypeFilter(e.target.value)}
        className="px-2 py-1.5 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]"
        data-testid="appt-filter-customer-type"
      >
        {customerTypeOptions.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
      </select>
      <select
        value={statusFilter}
        onChange={e => setStatusFilter(e.target.value)}
        className="px-2 py-1.5 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]"
        data-testid="appt-filter-status"
      >
        {STATUS_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
      </select>
      <select
        value={typeFilter}
        onChange={e => setTypeFilter(e.target.value)}
        className="px-2 py-1.5 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]"
        data-testid="appt-filter-type"
      >
        {TYPE_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
      </select>
    </>
  );
}

function AppointmentReportTable({ rows, totals, onOpenCustomer, sortKey, sortDir, onSort }) {
  const headerProps = { currentKey: sortKey, currentDir: sortDir, onSort };
  return (
    <div className="overflow-auto rounded-lg border border-[var(--bd)] bg-[var(--bg-card)]" data-testid="appointment-report-table">
      <table className="w-full text-xs min-w-[1400px]">
        <thead className="bg-[var(--bg-hover)] text-[var(--tx-muted)] uppercase text-[10px] tracking-wider sticky top-0 z-[5]">
          <tr>
            <SortHeader sortKey="date"                 {...headerProps}>วันที่นัด</SortHeader>
            <th className="px-3 py-2 text-left font-bold whitespace-nowrap">ประวัติการเลื่อนนัด</th>
            <SortHeader sortKey="customerName"         {...headerProps}>ลูกค้า</SortHeader>
            <SortHeader sortKey="customerType"         {...headerProps}>ประเภทลูกค้า</SortHeader>
            <SortHeader sortKey="appointmentTypeLabel" {...headerProps}>ประเภทนัด</SortHeader>
            <SortHeader sortKey="statusLabel"          {...headerProps}>สถานะ</SortHeader>
            <th className="px-3 py-2 text-left font-bold whitespace-nowrap">รายละเอียด</th>
            <SortHeader sortKey="doctorName"           {...headerProps}>แพทย์</SortHeader>
            <th className="px-3 py-2 text-left font-bold whitespace-nowrap">ผู้ช่วยแพทย์</th>
            <SortHeader sortKey="advisorName"          {...headerProps}>ที่ปรึกษา</SortHeader>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const statusBadge = STATUS_BADGE[r.status] || 'bg-[var(--bg-hover)] text-[var(--tx-muted)] border-[var(--bd)]';
            const typeBadge = TYPE_BADGE[r.appointmentType] || 'bg-[var(--bg-hover)] text-[var(--tx-muted)] border-[var(--bd)]';
            const hasCustomer = !!(r.customerHN || r.customerName);
            return (
              <tr
                key={`${r.appointmentId || i}`}
                className="border-t border-[var(--bd)] hover:bg-cyan-900/10 transition-colors"
                data-testid={`appt-row-${r.appointmentId || i}`}
              >
                {/* วันที่นัด */}
                <td className="px-3 py-2 whitespace-nowrap">
                  <div className="font-bold text-[var(--tx-primary)]">{fmtDateCE(r.date)}</div>
                  <div className="text-[10px] text-[var(--tx-muted)]">
                    {r.startTime}{r.endTime && r.endTime !== r.startTime ? ` - ${r.endTime}` : ''}
                  </div>
                </td>
                {/* ประวัติการเลื่อนนัด */}
                <td className="px-3 py-2 whitespace-nowrap text-[var(--tx-muted)]">{r.rescheduleHistory}</td>
                {/* ลูกค้า (NEVER red on name — Thai culture) */}
                <td className="px-3 py-2 whitespace-nowrap">
                  {hasCustomer ? (
                    <div className="flex items-center gap-2">
                      {r.customerHN && (
                        <span className="font-mono text-[var(--tx-muted)] text-[10px]">{r.customerHN}</span>
                      )}
                      <button
                        type="button"
                        onClick={() => onOpenCustomer?.(r.customerId)}
                        className="font-bold text-cyan-400 hover:text-cyan-300 hover:underline underline-offset-2"
                        data-testid={`appt-customer-link-${r.appointmentId || i}`}
                      >
                        {r.customerName || '-'}
                      </button>
                    </div>
                  ) : (
                    <span className="text-[var(--tx-muted)] italic">ยังไม่ได้เลือกลูกค้า</span>
                  )}
                </td>
                {/* ประเภทลูกค้า */}
                <td className="px-3 py-2 whitespace-nowrap text-[var(--tx-secondary)]">{r.customerType}</td>
                {/* ประเภทนัด */}
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold border ${typeBadge}`}>
                    {r.appointmentTypeLabel}
                  </span>
                </td>
                {/* สถานะ */}
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold border ${statusBadge}`}>
                    {r.statusLabel}
                  </span>
                </td>
                {/* รายละเอียด */}
                <td className="px-3 py-2 text-[10px] text-[var(--tx-secondary)] leading-relaxed max-w-[320px]">
                  <div>ห้อง: <span className="text-[var(--tx-primary)]">{r.roomName || '-'}</span></div>
                  <div>นัดมาเพื่อ: <span className="text-[var(--tx-primary)]">{r.appointmentTo || '-'}</span></div>
                  <div>เตรียมตัว: <span className="text-[var(--tx-primary)]">{r.preparation || '-'}</span></div>
                </td>
                {/* แพทย์ */}
                <td className="px-3 py-2 whitespace-nowrap text-[var(--tx-secondary)]">{r.doctorName}</td>
                {/* ผู้ช่วยแพทย์ */}
                <td className="px-3 py-2 whitespace-nowrap text-[var(--tx-secondary)] max-w-[200px] truncate" title={r.assistantNames}>
                  {r.assistantNames}
                </td>
                {/* ที่ปรึกษา */}
                <td className="px-3 py-2 whitespace-nowrap text-[var(--tx-secondary)]">{r.advisorName}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="bg-[var(--bg-hover)] font-bold text-[var(--tx-primary)] border-t-2 border-[var(--bd)] sticky bottom-0 z-[5]" data-testid="appointment-report-footer">
          <tr>
            <td colSpan={5} className="px-3 py-2">
              รวม {totals.count.toLocaleString('th-TH')} นัด
              {totals.expectedSalesTotal > 0 && (
                <> · ยอดคาดหวังรวม {totals.expectedSalesTotal.toLocaleString('th-TH')} ฿</>
              )}
            </td>
            <td className="px-3 py-2 text-[10px]" colSpan={5}>
              <span className="inline-flex items-center gap-2 text-[var(--tx-muted)]">
                <span>รอยืนยัน {totals.pendingCount}</span>
                <span>·</span>
                <span>ยืนยันแล้ว {totals.confirmedCount}</span>
                <span>·</span>
                <span>เสร็จแล้ว {totals.doneCount}</span>
                {totals.cancelledCount > 0 && (
                  <>
                    <span>·</span>
                    <span className="text-red-400">ยกเลิก {totals.cancelledCount}</span>
                  </>
                )}
              </span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
