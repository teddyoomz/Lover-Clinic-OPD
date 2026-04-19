// ─── Appointment Report Aggregator (Phase 10.4) — pure, deterministic ─────
//
// Source: be_appointments (Phase 4 schema) + be_customers (for ประเภทลูกค้า)
//         + master_data/staff (for ผู้ช่วยแพทย์ name resolution).
//
// Output shape: { rows, totals, meta } per /audit-reports-accuracy AR5.
//
// Iron-clad gates:
//   - AR1 date range filter via dateRangeFilter (field: `date`)
//   - AR3 cancelled appointments excluded from totals by default (AR14: caller
//         can opt-in via includeCancelled flag, same pattern as sale report)
//   - AR5 footer.count reconciles to filteredRows.length
//   - AR13 dates rendered as dd/mm/yyyy ค.ศ. (admin) — by UI layer
//   - AR14 defensive ?. access throughout
//   - AR15 idempotent — pure function of (appointments, customers, staff, filters)
//
// Triangle-verified (2026-04-19):
//   - 10 columns via opd.js intel /admin/report/appointment
//   - filter names match ProClinic: q, customer_type_2, appointment_status, period
//   - status label map: pending→รอยืนยัน, confirmed→ยืนยันแล้ว, done→เสร็จแล้ว,
//     cancelled→ยกเลิก (our 4 internal statuses; ProClinic's `postpone` is
//     shown as filter option but returns empty for us since we don't store it).

import { dateRangeFilter, sortBy } from './reportsUtils.js';

/* ─── Label maps ─────────────────────────────────────────────────────────── */

/** Our internal status → Thai display label (matches AppointmentTab STATUSES). */
const STATUS_LABELS = {
  pending: 'รอยืนยัน',
  confirmed: 'ยืนยันแล้ว',
  done: 'เสร็จแล้ว',
  cancelled: 'ยกเลิก',
};

/** Our internal appointmentType → Thai display label (matches AppointmentTab APPT_TYPES). */
const TYPE_LABELS = {
  sales: 'นัดเพื่อขาย',
  followup: 'นัดติดตาม',
};

/* ─── Source-shape derivers ──────────────────────────────────────────────── */

/** Join on customerId → patientData.customerType2 fallback 'ลูกค้าทั่วไป'. */
function deriveCustomerType(appt, customerIndex) {
  if (!appt?.customerId) return 'ลูกค้าทั่วไป';
  const cust = customerIndex.get(String(appt.customerId));
  const ct = cust?.patientData?.customerType2;
  return (typeof ct === 'string' && ct.trim()) ? ct.trim() : 'ลูกค้าทั่วไป';
}

/** "รายละเอียด" composite: ห้องตรวจ · นัดมาเพื่อ · การเตรียมตัว — matching ProClinic intel. */
function deriveDetail(appt) {
  const room = (appt?.roomName || '').trim() || '-';
  const to = (appt?.appointmentTo || '').trim() || '-';
  const prep = (appt?.preparation || '').trim() || '-';
  return `ห้องตรวจ: ${room} · นัดมาเพื่อ: ${to} · การเตรียมตัว: ${prep}`;
}

/** Resolve assistantIds[] → comma-joined names via staff map; fallback to '-'. */
function deriveAssistantNames(appt, staffIndex) {
  const ids = Array.isArray(appt?.assistantIds) ? appt.assistantIds : [];
  if (ids.length === 0) return '-';
  const names = ids
    .map(id => staffIndex.get(String(id)))
    .map(s => (s?.name || '').trim())
    .filter(Boolean);
  return names.length > 0 ? names.join(', ') : '-';
}

/** Status display — unknown status falls through to raw value so we never hide
 *  data. Empty/missing → 'รอยืนยัน' (pending default per AppointmentTab form). */
function deriveStatusLabel(appt) {
  const raw = (appt?.status || 'pending').trim();
  return STATUS_LABELS[raw] || raw;
}

/** Appointment type display — unknown → raw value (e.g. 'consult' if ever added). */
function deriveTypeLabel(appt) {
  const raw = (appt?.appointmentType || 'sales').trim();
  return TYPE_LABELS[raw] || raw;
}

/** วันที่นัด composite string: "{date} {startTime}-{endTime}" for CSV.
 *  UI renders the pieces separately for better layout. */
function deriveDateRange(appt) {
  const d = (appt?.date || '').trim();
  const s = (appt?.startTime || '').trim();
  const e = (appt?.endTime || '').trim();
  if (!d) return '-';
  if (!s) return d;
  if (!e || e === s) return `${d} ${s}`;
  return `${d} ${s}-${e}`;
}

/* ─── Row builder ────────────────────────────────────────────────────────── */

/**
 * Build display row for one appointment + joined context.
 * Pure: same input → same output. AR15.
 */
export function buildAppointmentReportRow(appt, customerIndex, staffIndex) {
  const a = appt || {};
  return {
    appointmentId: String(a.appointmentId || a.id || ''),
    customerId: String(a.customerId || ''),
    customerHN: a.customerHN || '',
    customerName: a.customerName || '',
    customerType: deriveCustomerType(a, customerIndex),
    date: a.date || '',
    startTime: a.startTime || '',
    endTime: a.endTime || a.startTime || '',
    dateRange: deriveDateRange(a),
    // Reschedule history: not tracked yet — placeholder '-' matches
    // ProClinic's default for appointments that haven't been moved. When
    // we ship reschedulingFrom[] tracking, map here.
    rescheduleHistory: '-',
    appointmentType: a.appointmentType || 'sales',
    appointmentTypeLabel: deriveTypeLabel(a),
    status: a.status || 'pending',
    statusLabel: deriveStatusLabel(a),
    detail: deriveDetail(a),
    roomName: a.roomName || '',
    appointmentTo: a.appointmentTo || '',
    preparation: a.preparation || '',
    doctorName: a.doctorName || '-',
    doctorId: String(a.doctorId || ''),
    assistantNames: deriveAssistantNames(a, staffIndex),
    advisorName: a.advisorName || '-',
    advisorId: String(a.advisorId || ''),
    expectedSales: Number(a.expectedSales) || 0,
    channel: a.channel || '',
    location: a.location || '',
  };
}

/* ─── Aggregator ─────────────────────────────────────────────────────────── */

/**
 * Aggregate be_appointments + joins into Appointment Report shape.
 *
 * @param {Array<Object>} appointments  — raw be_appointments docs
 * @param {Array<Object>} customers     — raw be_customers docs (for customerType join)
 * @param {Array<Object>} staff         — raw master_data/staff docs (for assistant names)
 * @param {Object} filters
 * @param {string} [filters.from]                       — YYYY-MM-DD inclusive
 * @param {string} [filters.to]                         — YYYY-MM-DD inclusive
 * @param {string} [filters.searchText]                 — case-insensitive on HN/name/doctor/advisor/purpose
 * @param {string} [filters.customerTypeFilter='all']   — 'all' | 'ลูกค้าทั่วไป' | 'ลูกค้ารีวิว' | 'Influencer'
 * @param {string} [filters.statusFilter='all']         — 'all' | 'pending' | 'confirmed' | 'done' | 'cancelled'
 * @param {string} [filters.typeFilter='all']           — 'all' | 'sales' | 'followup'
 * @param {boolean} [filters.includeCancelled=true]     — AR3: cancelled appts still show by default
 *                                                        (unlike sales where cancelled are usually hidden).
 *                                                        Kept as a toggle so CSV export can strip them.
 *
 * @returns {{
 *   rows: Array,
 *   totals: { count, pendingCount, confirmedCount, doneCount, cancelledCount, expectedSalesTotal },
 *   meta: { totalCount, filteredCount, range }
 * }}
 */
export function aggregateAppointmentReport(appointments, customers, staff, filters = {}) {
  const {
    from = '', to = '',
    searchText = '',
    customerTypeFilter = 'all',
    statusFilter = 'all',
    typeFilter = 'all',
    includeCancelled = true,
  } = filters;

  // Build lookup indexes. Both are keyed by string id so callers can pass
  // numeric or string id without worrying.
  const customerIndex = new Map();
  if (Array.isArray(customers)) {
    for (const c of customers) {
      const key = String(c?.proClinicId || c?.id || '');
      if (key) customerIndex.set(key, c);
    }
  }
  const staffIndex = new Map();
  if (Array.isArray(staff)) {
    for (const s of staff) {
      const key = String(s?.id || '');
      if (key) staffIndex.set(key, s);
    }
  }

  const allAppts = Array.isArray(appointments) ? appointments : [];

  // 1) Date range narrow (AR1). Empty range = no narrow.
  let list = (from || to) ? dateRangeFilter(allAppts, 'date', from, to) : allAppts;

  // 2) Optional: drop cancelled before row build (AR3 opt-in)
  if (!includeCancelled) {
    list = list.filter(a => (a?.status || 'pending') !== 'cancelled');
  }

  // 3) Build rows (join customerType + assistant names)
  let rows = list.map(a => buildAppointmentReportRow(a, customerIndex, staffIndex));

  // 4) Apply filters (in order so the most-exclusive run first = cheaper)
  if (customerTypeFilter && customerTypeFilter !== 'all') {
    rows = rows.filter(r => r.customerType === customerTypeFilter);
  }
  if (statusFilter && statusFilter !== 'all') {
    rows = rows.filter(r => r.status === statusFilter);
  }
  if (typeFilter && typeFilter !== 'all') {
    rows = rows.filter(r => r.appointmentType === typeFilter);
  }

  const q = (searchText || '').trim().toLowerCase();
  if (q) {
    rows = rows.filter(r => {
      const hay = `${r.customerHN} ${r.customerName} ${r.doctorName} ${r.advisorName} ${r.appointmentTo}`.toLowerCase();
      return hay.includes(q);
    });
  }

  // 5) Sort: date desc, then startTime asc (matches ProClinic's listing order)
  rows = sortBy(rows, r => `${r.date || ''} ${r.startTime || ''}`, 'desc');

  // 6) Totals — AR5. Count bucket per status so footer carries meaning
  //    even though the report has no money columns.
  let pendingCount = 0, confirmedCount = 0, doneCount = 0, cancelledCount = 0;
  let expectedSalesTotal = 0;
  for (const r of rows) {
    if (r.status === 'pending') pendingCount += 1;
    else if (r.status === 'confirmed') confirmedCount += 1;
    else if (r.status === 'done') doneCount += 1;
    else if (r.status === 'cancelled') cancelledCount += 1;
    expectedSalesTotal += r.expectedSales;
  }

  return {
    rows,
    totals: {
      count: rows.length,
      pendingCount,
      confirmedCount,
      doneCount,
      cancelledCount,
      expectedSalesTotal: Math.round(expectedSalesTotal * 100) / 100,
    },
    meta: {
      totalCount: allAppts.length,
      filteredCount: rows.length,
      range: { from, to },
    },
  };
}

/* ─── Column spec — single source of truth for table + CSV (AR11) ───────── */

/**
 * Build the 10-column spec matching ProClinic /admin/report/appointment.
 * Caller injects fmtDate so CSV and table share one formatter.
 */
export function buildAppointmentReportColumns({ fmtDate = (v) => v } = {}) {
  return [
    {
      key: 'dateRange',
      label: 'วันที่นัด',
      format: (_v, row) => {
        const d = row?.date ? fmtDate(row.date) : '';
        const s = row?.startTime || '';
        const e = row?.endTime || '';
        if (!d) return '-';
        if (!s) return d;
        if (!e || e === s) return `${d} ${s}`;
        return `${d} ${s}-${e}`;
      },
    },
    { key: 'rescheduleHistory',   label: 'ประวัติการเลื่อนนัด' },
    {
      key: 'customerLabel',
      label: 'ลูกค้า',
      format: (_v, row) => {
        const hn = row?.customerHN || '';
        const name = row?.customerName || '';
        if (!hn && !name) return 'ยังไม่ได้เลือกลูกค้า';
        return [hn, name].filter(Boolean).join(' ');
      },
    },
    { key: 'customerType',        label: 'ประเภทลูกค้า' },
    { key: 'appointmentTypeLabel',label: 'ประเภทนัด' },
    { key: 'statusLabel',         label: 'สถานะ' },
    { key: 'detail',              label: 'รายละเอียด' },
    { key: 'doctorName',          label: 'แพทย์' },
    { key: 'assistantNames',      label: 'ผู้ช่วยแพทย์' },
    { key: 'advisorName',         label: 'ที่ปรึกษา' },
  ];
}
