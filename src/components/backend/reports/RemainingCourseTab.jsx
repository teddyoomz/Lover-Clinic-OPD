// ─── RemainingCourseTab — Phase 16.5 (2026-04-29) ──────────────────────────
// Mirrors ProClinic /admin/remaining-course. Lists every customer's course
// in be_customers[].courses[] flattened to rows. Filter by search/status/
// course-type/has-remaining toggle. Branch-scoped via BranchContext.
//
// Per-row kebab actions: ยกเลิก (cancel) · คืนเงิน (refund) · เปลี่ยนคอร์ส (exchange)
// — opens the matching modal, which calls the existing/new backend helper.
// On modal success: re-load customers + close modal.
//
// Spec: docs/superpowers/specs/2026-04-29-phase16-5-remaining-course-design.md

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import ReportShell from './ReportShell.jsx';
import RemainingCourseRow from './RemainingCourseRow.jsx';
import {
  flattenCustomerCourses,
  filterCourses,
  sortCourses,
  aggregateRemainingStats,
  listDistinctCourseTypes,
  ALL_STATUSES,
  STATUS_ACTIVE,
} from '../../../lib/remainingCourseUtils.js';
import { loadAllCustomersForReport } from '../../../lib/reportsLoaders.js';
import { downloadCSV } from '../../../lib/csvExport.js';
import { useSelectedBranch } from '../../../lib/BranchContext.jsx';
import { fmtMoney } from '../../../lib/financeUtils.js';
import CancelCourseModal from '../CancelCourseModal.jsx';
import RefundCourseModal from '../RefundCourseModal.jsx';
import ExchangeCourseModal from '../ExchangeCourseModal.jsx';

const COL_DEFS = [
  { key: 'customer', label: 'ลูกค้า' },
  { key: 'course',   label: 'คอร์ส' },
  { key: 'purchase', label: 'วันซื้อ' },
  { key: 'qty',      label: 'รวม / ใช้ไป / คงเหลือ' },
  { key: 'spent',    label: 'มูลค่า', align: 'right' },
  { key: 'lastUsed', label: 'ครั้งล่าสุด' },
  { key: 'status',   label: 'สถานะ' },
  { key: 'actions',  label: '' },
];

export default function RemainingCourseTab({ clinicSettings }) {
  const branch = useSelectedBranch();
  const branchId = branch?.branchId || '';

  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Filter state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [courseTypeFilter, setCourseTypeFilter] = useState('');
  const [hasRemainingOnly, setHasRemainingOnly] = useState(true);

  // Phase 16.5 fix (2026-04-29 user request "ไม่เกิน 20 รายการ ต่อหน้า"):
  // pagination 20 rows/page. Page resets to 0 whenever any filter changes.
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(0);

  // Modal state
  const [modalKind, setModalKind] = useState(''); // '' | 'cancel' | 'refund' | 'exchange'
  const [modalRow, setModalRow] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await loadAllCustomersForReport();
      setCustomers(list || []);
    } catch (e) {
      setError(e?.message || 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const allRows = useMemo(() => flattenCustomerCourses(customers), [customers]);

  const courseTypeOptions = useMemo(() => listDistinctCourseTypes(allRows), [allRows]);

  const filteredRows = useMemo(() => filterCourses(allRows, {
    search, status: statusFilter, courseType: courseTypeFilter,
    hasRemainingOnly, branchId,
  }), [allRows, search, statusFilter, courseTypeFilter, hasRemainingOnly, branchId]);

  const sortedRows = useMemo(() => sortCourses(filteredRows, 'purchaseDate', 'desc'), [filteredRows]);

  const stats = useMemo(() => aggregateRemainingStats(sortedRows), [sortedRows]);

  // Reset page whenever filtered result-set shrinks below current offset.
  useEffect(() => { setPage(0); }, [search, statusFilter, courseTypeFilter, hasRemainingOnly, branchId]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pagedRows = useMemo(
    () => sortedRows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE),
    [sortedRows, safePage],
  );

  const handleAction = useCallback((kind, row) => {
    setModalKind(kind);
    setModalRow(row);
  }, []);

  const handleModalSuccess = useCallback(() => {
    setModalKind('');
    setModalRow(null);
    reload();
  }, [reload]);

  const handleModalCancel = useCallback(() => {
    setModalKind('');
    setModalRow(null);
  }, []);

  const csvColumns = useMemo(() => ([
    { key: 'customerHN',    label: 'HN' },
    { key: 'customerName',  label: 'ชื่อลูกค้า' },
    { key: 'customerPhone', label: 'เบอร์โทร' },
    { key: 'courseName',    label: 'คอร์ส' },
    { key: 'courseType',    label: 'ประเภท' },
    { key: 'status',        label: 'สถานะ' },
    { key: 'qtyTotal',      label: 'จำนวนรวม' },
    { key: 'qtyUsed',       label: 'ใช้ไปแล้ว' },
    { key: 'qtyRemaining',  label: 'คงเหลือ' },
    { key: 'qtyUnit',       label: 'หน่วย' },
    { key: 'totalSpent',    label: 'มูลค่า' },
    { key: 'purchaseDate',  label: 'วันซื้อ' },
    { key: 'lastUsedDate',  label: 'ครั้งล่าสุด' },
  ]), []);

  const handleExport = useCallback(() => {
    const today = new Date().toISOString().slice(0, 10);
    downloadCSV(`remaining-course-${today}`, sortedRows, csvColumns);
  }, [sortedRows, csvColumns]);

  const statusOptionLabels = ['ทุกสถานะ', ...ALL_STATUSES];

  const filtersSlot = (
    <>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="ค้นหา HN / ชื่อ / เบอร์ / คอร์ส"
        className="px-3 py-1.5 rounded-md text-xs bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-primary)] flex-1 min-w-[180px]"
        data-testid="remaining-course-search"
      />
      <select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
        className="px-3 py-1.5 rounded-md text-xs bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-primary)]"
        data-testid="remaining-course-status-filter"
      >
        <option value="">{statusOptionLabels[0]}</option>
        {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <select
        value={courseTypeFilter}
        onChange={(e) => setCourseTypeFilter(e.target.value)}
        className="px-3 py-1.5 rounded-md text-xs bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-primary)]"
        data-testid="remaining-course-type-filter"
      >
        <option value="">ทุกประเภทคอร์ส</option>
        {courseTypeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <label className="flex items-center gap-1.5 text-xs text-[var(--tx-secondary)] cursor-pointer">
        <input
          type="checkbox"
          checked={hasRemainingOnly}
          onChange={(e) => setHasRemainingOnly(e.target.checked)}
          data-testid="remaining-course-has-remaining"
        />
        เฉพาะคงเหลือ ({STATUS_ACTIVE})
      </label>
    </>
  );

  return (
    <>
      <ReportShell
        icon={Clock}
        title="คอร์สคงเหลือ"
        subtitle={
          stats.totalRows > 0
            ? `ผู้ป่วย ${stats.customersWithRemaining} ราย · มูลค่าคงเหลือ ${fmtMoney(stats.totalRemainingValue)}`
            : ''
        }
        totalCount={allRows.length}
        filteredCount={sortedRows.length}
        filtersSlot={filtersSlot}
        onExport={handleExport}
        onRefresh={reload}
        exportDisabled={sortedRows.length === 0}
        error={error}
        loading={loading}
        emptyText="ยังไม่มีคอร์สคงเหลือ"
        notFoundText="ไม่พบคอร์สตามตัวกรอง"
        clinicSettings={clinicSettings}
      >
        <div className="overflow-x-auto rounded-lg border border-[var(--bd)]">
          <table className="w-full" data-testid="remaining-course-table">
            <thead className="bg-[var(--bg-card)] border-b border-[var(--bd)]">
              <tr>
                {COL_DEFS.map((c) => (
                  <th key={c.key} className={`px-3 py-2 text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-bold text-${c.align || 'left'}`}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((row) => (
                <RemainingCourseRow key={`${row.customerId}-${row.courseId}-${row.courseIndex}`} row={row} onAction={handleAction} />
              ))}
            </tbody>
          </table>
        </div>

        {sortedRows.length > PAGE_SIZE && (
          <div className="flex items-center justify-between mt-3 px-1" data-testid="remaining-course-pagination">
            <div className="text-xs text-[var(--tx-muted)]">
              หน้า {safePage + 1} / {totalPages}
              {' · '}
              <span className="text-[var(--tx-secondary)]">
                แสดง {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, sortedRows.length)}
                {' จาก '}
                {sortedRows.length.toLocaleString('th-TH')} รายการ
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="px-3 py-1.5 rounded-md text-xs bg-[var(--bg-card)] border border-[var(--bd)] text-[var(--tx-secondary)] hover:text-[var(--tx-primary)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                data-testid="remaining-course-prev-page"
              >
                <ChevronLeft size={14} /> ก่อนหน้า
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={safePage >= totalPages - 1}
                className="px-3 py-1.5 rounded-md text-xs bg-[var(--bg-card)] border border-[var(--bd)] text-[var(--tx-secondary)] hover:text-[var(--tx-primary)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                data-testid="remaining-course-next-page"
              >
                ถัดไป <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </ReportShell>

      <CancelCourseModal
        open={modalKind === 'cancel'}
        row={modalRow}
        onSuccess={handleModalSuccess}
        onCancel={handleModalCancel}
      />
      <RefundCourseModal
        open={modalKind === 'refund'}
        row={modalRow}
        onSuccess={handleModalSuccess}
        onCancel={handleModalCancel}
      />
      <ExchangeCourseModal
        open={modalKind === 'exchange'}
        row={modalRow}
        onSuccess={handleModalSuccess}
        onCancel={handleModalCancel}
      />
    </>
  );
}
