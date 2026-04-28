// ─── Remaining Course tab — pure helpers (Phase 16.5, 2026-04-29) ─────────
//
// Aggregates be_customers[].courses[] into a flat row set for the
// RemainingCourseTab table. All helpers are pure (no Firestore I/O) so
// they can be unit-tested without firebase-admin SDK and reused by
// full-flow simulate tests (Rule I).
//
// Status enum: course objects use Thai status strings (existing
// courseExchange.js convention — see V32-tris-bis T4). NOT English.

import { parseQtyString } from './courseUtils.js';

// ── Status enum (Thai — matches courseExchange.js + applyCourse* helpers) ──
export const STATUS_ACTIVE = 'กำลังใช้งาน';
export const STATUS_USED = 'ใช้หมดแล้ว';
export const STATUS_REFUNDED = 'คืนเงิน';
export const STATUS_CANCELLED = 'ยกเลิก';

export const ALL_STATUSES = [
  STATUS_ACTIVE,
  STATUS_USED,
  STATUS_REFUNDED,
  STATUS_CANCELLED,
];

const TERMINAL_STATUSES = new Set([STATUS_REFUNDED, STATUS_CANCELLED]);

/**
 * Parse a course.value string like "1000 บาท" / "1,500.00 บาท" → 1000 (number).
 * Empty / non-string / unparseable → 0.
 *
 * Pure: no rounding/formatting concerns; just numeric extraction.
 */
export function parseValueFromCourseString(valueStr) {
  if (!valueStr) return 0;
  const s = String(valueStr).replace(/,/g, '').replace(/บาท/g, '').trim();
  const n = parseFloat(s);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Determine the effective status of a course. Defaults to STATUS_ACTIVE
 * when missing (legacy course objects pre-Phase 16.5 didn't all have
 * `status` field).
 */
export function parseStatusFromCourse(course) {
  const raw = course?.status;
  if (raw && ALL_STATUSES.includes(raw)) return raw;
  return STATUS_ACTIVE;
}

/**
 * Flatten customers[].courses[] into row objects. Each row is one course
 * line in the RemainingCourseTab table.
 *
 * Skips courses without courseId (defensive — exchange flow rewrites
 * courseId so every active course has one; legacy nulls are filtered).
 *
 * @param {Array} customers — be_customers docs
 * @returns {Array} rows
 */
export function flattenCustomerCourses(customers) {
  const list = Array.isArray(customers) ? customers : [];
  const rows = [];

  for (const cust of list) {
    if (!cust || !Array.isArray(cust.courses)) continue;
    const customerId = String(cust.id || cust.customerId || '');
    const customerHN = String(cust.hn || cust.patientData?.hn || cust.patientData?.HN || '');
    const customerName = String(
      cust.name
        || (cust.patientData?.firstName && cust.patientData?.lastName
          ? `${cust.patientData.firstName} ${cust.patientData.lastName}`
          : '')
        || cust.patientData?.firstName
        || cust.patientData?.fullName
        || '',
    ).trim();
    const customerPhone = String(cust.patientData?.phone || cust.patientData?.tel || cust.phone || '');
    const customerBranchId = cust.branchId || '';

    cust.courses.forEach((course, courseIndex) => {
      if (!course || !course.courseId) return;
      const status = parseStatusFromCourse(course);
      const qtyParsed = parseQtyString(course.qty || '');
      const qtyTotal = Number(qtyParsed.total) || 0;
      const qtyRemaining = Number(qtyParsed.remaining) || 0;
      const qtyUsed = Math.max(0, qtyTotal - qtyRemaining);
      const qtyUnit = qtyParsed.unit || '';
      const totalSpent = parseValueFromCourseString(course.value);

      // Purchase date fallback chain (V32-tris-bis course shape doesn't
      // have explicit purchaseDate; createdAt or course.assignedAt are
      // common; finally fall back to customer.clonedAt for legacy).
      const purchaseDate = String(
        course.purchaseDate
          || course.createdAt
          || course.assignedAt
          || cust.clonedAt
          || cust.createdAt
          || '',
      ).slice(0, 10);

      // Last used date: courses don't track this directly in v1.
      // Future: derive from joined be_treatments. v1 uses '' fallback.
      const lastUsedDate = String(course.lastUsedDate || course.lastUsedAt || '').slice(0, 10);

      rows.push({
        customerId,
        customerHN,
        customerName,
        customerPhone,
        customerBranchId,
        courseIndex,
        courseId: String(course.courseId),
        courseName: String(course.name || ''),
        courseType: String(course.courseType || ''),
        product: String(course.product || ''),
        status,
        qtyTotal,
        qtyUsed,
        qtyRemaining,
        qtyUnit,
        purchaseDate,
        lastUsedDate,
        totalSpent,
        rawValue: String(course.value || ''),
      });
    });
  }

  return rows;
}

/**
 * Apply filter set to row list.
 *
 * @param {Array} rows
 * @param {object} filters
 * @param {string} [filters.search]              — case-insensitive HN/name/phone/courseName substring
 * @param {string} [filters.status]              — '' for all, else one of ALL_STATUSES
 * @param {string} [filters.courseType]          — '' for all, else exact match on row.courseType
 * @param {boolean} [filters.hasRemainingOnly]   — true: keep only rows with qtyRemaining>0 AND status=active
 * @param {string} [filters.branchId]            — '' or null = no branch filter (legacy customers shown);
 *                                                 set value = include rows where row.customerBranchId === id OR row.customerBranchId is empty (legacy/clone)
 */
export function filterCourses(rows, filters = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const search = String(filters.search || '').trim().toLowerCase();
  const statusFilter = filters.status || '';
  const typeFilter = filters.courseType || '';
  const hasRemainingOnly = !!filters.hasRemainingOnly;
  const branchId = filters.branchId || '';

  return list.filter((row) => {
    if (search) {
      const hay = `${row.customerHN} ${row.customerName} ${row.customerPhone} ${row.courseName} ${row.product}`
        .toLowerCase();
      if (!hay.includes(search)) return false;
    }
    if (statusFilter && row.status !== statusFilter) return false;
    if (typeFilter && row.courseType !== typeFilter) return false;
    if (hasRemainingOnly) {
      if (row.qtyRemaining <= 0) return false;
      if (row.status !== STATUS_ACTIVE) return false;
    }
    if (branchId) {
      // Branch-scoped: include rows whose customer is in this branch OR
      // has no branchId (legacy ProClinic-cloned — visible everywhere).
      if (row.customerBranchId && row.customerBranchId !== branchId) return false;
    }
    return true;
  });
}

/**
 * Sort rows by key + direction.
 *
 * Supported keys: 'purchaseDate' (default), 'lastUsedDate', 'qtyRemaining',
 * 'totalSpent', 'customerName' (Thai-locale), 'courseName' (Thai-locale).
 * Direction: 'desc' (default) | 'asc'.
 *
 * Returns a NEW array (does not mutate input).
 */
export function sortCourses(rows, key = 'purchaseDate', dir = 'desc') {
  const list = Array.isArray(rows) ? [...rows] : [];
  const reverse = dir === 'asc' ? 1 : -1;

  const cmp = (a, b) => {
    let av;
    let bv;
    switch (key) {
      case 'qtyRemaining':
      case 'totalSpent':
        av = Number(a[key]) || 0;
        bv = Number(b[key]) || 0;
        return (av - bv) * reverse;
      case 'customerName':
      case 'courseName':
        return String(a[key] || '').localeCompare(String(b[key] || ''), 'th') * reverse;
      case 'lastUsedDate':
      case 'purchaseDate':
      default:
        av = String(a[key] || '');
        bv = String(b[key] || '');
        return av.localeCompare(bv) * reverse;
    }
  };

  list.sort(cmp);
  return list;
}

/**
 * Aggregate stats across the row set (post-filter, pre-pagination).
 *
 * @returns {{totalRows, totalRemainingValue, customersWithRemaining, byStatus}}
 */
export function aggregateRemainingStats(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const byStatus = {
    [STATUS_ACTIVE]: 0,
    [STATUS_USED]: 0,
    [STATUS_REFUNDED]: 0,
    [STATUS_CANCELLED]: 0,
  };
  const customersWithRemainingSet = new Set();
  let totalRemainingValue = 0;

  for (const row of list) {
    if (byStatus[row.status] !== undefined) byStatus[row.status] += 1;
    if (row.status === STATUS_ACTIVE && row.qtyRemaining > 0) {
      customersWithRemainingSet.add(row.customerId);
      // Pro-rata: if 3/10 remaining at total value 1000, remaining value = 300.
      const ratio = row.qtyTotal > 0 ? row.qtyRemaining / row.qtyTotal : 0;
      totalRemainingValue += row.totalSpent * ratio;
    }
  }

  return {
    totalRows: list.length,
    totalRemainingValue,
    customersWithRemaining: customersWithRemainingSet.size,
    byStatus,
  };
}

/**
 * Distinct course types present in rows — for filter dropdown population.
 * Returns sorted Thai-locale list, empty strings excluded.
 */
export function listDistinctCourseTypes(rows) {
  const set = new Set();
  for (const row of (rows || [])) {
    if (row?.courseType) set.add(String(row.courseType));
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'th'));
}

/**
 * Determine if a course row is in a terminal state (cannot be cancelled
 * or refunded again). Used by the kebab menu to disable terminal-action
 * items.
 */
export function isTerminalRow(row) {
  return TERMINAL_STATUSES.has(row?.status);
}
