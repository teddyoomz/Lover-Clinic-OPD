// Phase 16.5 (2026-04-29) — full-flow simulate per Rule I
//
// Chains: flatten → filter → sort → mutate (cancel/refund/exchange) →
// re-flatten → assert post-state. Uses pure helpers + simulated customer
// mutations (mirrors what runTransaction would do server-side) so we can
// verify the SHAPE contract end-to-end without firing real Firestore I/O.

import { describe, test, expect } from 'vitest';
import {
  flattenCustomerCourses,
  filterCourses,
  sortCourses,
  aggregateRemainingStats,
  STATUS_ACTIVE,
  STATUS_REFUNDED,
  STATUS_CANCELLED,
} from '../src/lib/remainingCourseUtils.js';
import {
  applyCourseCancel,
  applyCourseRefund,
  applyCourseExchange,
} from '../src/lib/courseExchange.js';

// Apply a mutator's nextCourses to a customer (simulate Firestore write).
function applyToCustomer(customer, nextCourses) {
  return { ...customer, courses: nextCourses };
}

const seed = () => [
  {
    id: 'c1', hn: 'HN001', name: 'Alice', branchId: 'BR-A',
    patientData: { phone: '0811' }, clonedAt: '2026-01-01T00:00:00Z',
    courses: [
      { courseId: 'a1', name: 'Botox 50U', courseType: 'single',  qty: '3/5', status: STATUS_ACTIVE,   value: '500 บาท',  createdAt: '2026-04-01T10:00:00Z' },
      { courseId: 'a2', name: 'Filler',    courseType: 'package', qty: '0/3', status: 'ใช้หมดแล้ว',     value: '3000 บาท', createdAt: '2026-03-10T10:00:00Z' },
    ],
  },
  {
    id: 'c2', hn: 'HN002', name: 'นาย ทดสอบ', branchId: 'BR-B',
    patientData: { phone: '0822' }, clonedAt: '2026-02-01T00:00:00Z',
    courses: [
      { courseId: 'b1', name: 'Hifu', courseType: 'package', qty: '2/2', status: STATUS_ACTIVE, value: '2000 บาท', createdAt: '2026-04-15T10:00:00Z' },
    ],
  },
  {
    id: 'c3', hn: 'HN003', name: 'Bob', branchId: '',
    patientData: { phone: '0833' }, clonedAt: '2026-03-15T00:00:00Z',
    courses: [
      { courseId: 'cc1', name: 'Laser', courseType: 'single', qty: '1/2', status: STATUS_ACTIVE, value: '1500 บาท', createdAt: '2026-04-20T10:00:00Z' },
    ],
  },
];

// ─── FS1 baseline flatten + filter + sort ───────────────────────────────
describe('FS1 baseline flatten + filter + sort', () => {
  test('FS1.1 flatten → 4 rows total', () => {
    expect(flattenCustomerCourses(seed())).toHaveLength(4);
  });

  test('FS1.2 hasRemainingOnly + active filter → 3 rows (Botox / Hifu / Laser)', () => {
    const rows = flattenCustomerCourses(seed());
    const filtered = filterCourses(rows, { hasRemainingOnly: true });
    expect(filtered.map(r => r.courseId).sort()).toEqual(['a1', 'b1', 'cc1']);
  });

  test('FS1.3 sort by purchaseDate desc → cc1 (04-20) > b1 (04-15) > a1 (04-01) > a2 (03-10)', () => {
    const rows = flattenCustomerCourses(seed());
    const sorted = sortCourses(rows, 'purchaseDate', 'desc');
    expect(sorted.map(r => r.courseId)).toEqual(['cc1', 'b1', 'a1', 'a2']);
  });

  test('FS1.4 stats: 3 active, 1 used, 0 refunded, 0 cancelled', () => {
    const stats = aggregateRemainingStats(flattenCustomerCourses(seed()));
    expect(stats.byStatus[STATUS_ACTIVE]).toBe(3);
    expect(stats.byStatus['ใช้หมดแล้ว']).toBe(1);
    expect(stats.byStatus[STATUS_REFUNDED]).toBe(0);
    expect(stats.byStatus[STATUS_CANCELLED]).toBe(0);
    expect(stats.customersWithRemaining).toBe(3);
  });
});

// ─── FS2 cancel a course → verify post-state ────────────────────────────
describe('FS2 cancel flow', () => {
  test('FS2.1 cancel a1 → status=ยกเลิก + filtered out by hasRemainingOnly', () => {
    const customers = seed();
    const { nextCourses } = applyCourseCancel(customers[0], 'a1', { reason: 'test cancel' });
    const c1Mutated = applyToCustomer(customers[0], nextCourses);
    const newCustomers = [c1Mutated, customers[1], customers[2]];

    const rows = flattenCustomerCourses(newCustomers);
    const a1Row = rows.find(r => r.courseId === 'a1');
    expect(a1Row.status).toBe(STATUS_CANCELLED);
    expect(rows[0].cancelReason).toBeUndefined(); // not propagated to row by spec — that's fine

    // hasRemainingOnly filters it out:
    const filtered = filterCourses(rows, { hasRemainingOnly: true });
    expect(filtered.find(r => r.courseId === 'a1')).toBeUndefined();
  });

  test('FS2.2 stats reflect cancellation', () => {
    const customers = seed();
    const { nextCourses } = applyCourseCancel(customers[0], 'a1', { reason: 'r' });
    const newCustomers = [applyToCustomer(customers[0], nextCourses), customers[1], customers[2]];
    const stats = aggregateRemainingStats(flattenCustomerCourses(newCustomers));
    expect(stats.byStatus[STATUS_ACTIVE]).toBe(2); // was 3, now 2
    expect(stats.byStatus[STATUS_CANCELLED]).toBe(1);
    expect(stats.customersWithRemaining).toBe(2); // c1 lost a1 (only active), still has nothing — wait c1 had a2(used). So c1 not counted
  });
});

// ─── FS3 refund flow ─────────────────────────────────────────────────────
describe('FS3 refund flow', () => {
  test('FS3.1 refund b1 → status=คืนเงิน + refundAmount + refundReason on course', () => {
    const customers = seed();
    const { nextCourses } = applyCourseRefund(customers[1], 'b1', 1500, { reason: 'customer ask' });
    const newCustomers = [customers[0], applyToCustomer(customers[1], nextCourses), customers[2]];
    const rows = flattenCustomerCourses(newCustomers);
    const b1Row = rows.find(r => r.courseId === 'b1');
    expect(b1Row.status).toBe(STATUS_REFUNDED);
    // The course still exists in array (audit integrity).
    expect(rows.filter(r => r.courseId === 'b1')).toHaveLength(1);
  });

  test('FS3.2 refund excluded from hasRemainingOnly + counts', () => {
    const customers = seed();
    const { nextCourses } = applyCourseRefund(customers[1], 'b1', 1500, { reason: 'r' });
    const newCustomers = [customers[0], applyToCustomer(customers[1], nextCourses), customers[2]];
    const rows = flattenCustomerCourses(newCustomers);
    const filtered = filterCourses(rows, { hasRemainingOnly: true });
    expect(filtered.find(r => r.courseId === 'b1')).toBeUndefined();

    const stats = aggregateRemainingStats(rows);
    expect(stats.byStatus[STATUS_REFUNDED]).toBe(1);
    expect(stats.customersWithRemaining).toBe(2);
  });
});

// ─── FS4 exchange flow ───────────────────────────────────────────────────
describe('FS4 exchange flow', () => {
  test('FS4.1 exchange a1 → old removed, new appended w/ status=กำลังใช้งาน', () => {
    const customers = seed();
    const newMaster = {
      courseId: 'master-1', name: 'Premium Treatment', price: 5000,
      products: [{ name: 'P', qty: '5/5 ครั้ง' }],
    };
    const { nextCourses } = applyCourseExchange(customers[0], 'a1', newMaster);
    const newCustomers = [applyToCustomer(customers[0], nextCourses), customers[1], customers[2]];
    const rows = flattenCustomerCourses(newCustomers);
    expect(rows.find(r => r.courseId === 'a1')).toBeUndefined();
    const newRow = rows.find(r => r.courseName === 'Premium Treatment');
    expect(newRow).toBeDefined();
    expect(newRow.status).toBe(STATUS_ACTIVE);
    expect(newRow.qtyTotal).toBe(5);
    expect(newRow.qtyRemaining).toBe(5);
  });
});

// ─── FS5 legacy customer (status missing → defaults active) ─────────────
describe('FS5 legacy course missing status', () => {
  test('FS5.1 status fallback applies; row passes hasRemainingOnly', () => {
    const legacy = [{
      id: 'c-legacy', hn: 'HN-L', name: 'Legacy',
      branchId: 'BR-A', clonedAt: '2025-01-01T00:00:00Z',
      courses: [{ courseId: 'leg-1', name: 'Old', qty: '2/2', value: '500 บาท' /* no status */ }],
    }];
    const rows = flattenCustomerCourses(legacy);
    expect(rows[0].status).toBe(STATUS_ACTIVE);
    expect(filterCourses(rows, { hasRemainingOnly: true })).toHaveLength(1);
  });
});

// ─── FS6 multi-filter Thai search ────────────────────────────────────────
describe('FS6 Thai search', () => {
  test('FS6.1 search "ทดสอบ" matches HN002 customer name', () => {
    const rows = flattenCustomerCourses(seed());
    expect(filterCourses(rows, { search: 'ทดสอบ' }).map(r => r.customerHN)).toEqual(['HN002']);
  });
});

// ─── FS7 courseType filter ───────────────────────────────────────────────
describe('FS7 courseType filter', () => {
  test('FS7.1 package filter → 2 rows (Filler + Hifu)', () => {
    const rows = flattenCustomerCourses(seed());
    expect(filterCourses(rows, { courseType: 'package' }).map(r => r.courseId).sort()).toEqual(['a2', 'b1']);
  });
});

// ─── FS8 empty branch → empty rows after branch filter ──────────────────
describe('FS8 branch isolation', () => {
  test('FS8.1 BR-X (no customers there) → empty after filter (legacy still passes through)', () => {
    const rows = flattenCustomerCourses(seed());
    const filtered = filterCourses(rows, { branchId: 'BR-X' });
    // BR-X has no real customers; only legacy (empty branchId) HN003 should show
    expect(filtered.map(r => r.customerHN)).toEqual(['HN003']);
  });

  test('FS8.2 BR-A → c1 (BR-A) + c3 (legacy/empty)', () => {
    const rows = flattenCustomerCourses(seed());
    const filtered = filterCourses(rows, { branchId: 'BR-A' });
    expect(filtered.map(r => r.customerHN).sort()).toEqual(['HN001', 'HN001', 'HN003']);
  });
});

// ─── FS9 multi-mutation chain ────────────────────────────────────────────
describe('FS9 multi-mutation chain', () => {
  test('FS9.1 cancel a1 → refund b1 → re-flatten gives correct stats', () => {
    let customers = seed();
    // Cancel a1
    const { nextCourses: c1n } = applyCourseCancel(customers[0], 'a1', { reason: 'r' });
    customers = [applyToCustomer(customers[0], c1n), customers[1], customers[2]];
    // Refund b1
    const { nextCourses: c2n } = applyCourseRefund(customers[1], 'b1', 1500, { reason: 'r' });
    customers = [customers[0], applyToCustomer(customers[1], c2n), customers[2]];

    const rows = flattenCustomerCourses(customers);
    const stats = aggregateRemainingStats(rows);
    expect(stats.byStatus[STATUS_ACTIVE]).toBe(1);  // only cc1 left
    expect(stats.byStatus[STATUS_CANCELLED]).toBe(1);
    expect(stats.byStatus[STATUS_REFUNDED]).toBe(1);
    expect(stats.byStatus['ใช้หมดแล้ว']).toBe(1);   // a2 unchanged
    expect(stats.customersWithRemaining).toBe(1);   // only c3 has active+remaining
  });
});

// ─── FS10 sort stability across filtered set ────────────────────────────
describe('FS10 sort stability after filter', () => {
  test('FS10.1 hasRemaining + sort by qtyRemaining desc', () => {
    const rows = flattenCustomerCourses(seed());
    const filtered = filterCourses(rows, { hasRemainingOnly: true });
    const sorted = sortCourses(filtered, 'qtyRemaining', 'desc');
    expect(sorted[0].qtyRemaining).toBeGreaterThanOrEqual(sorted[1].qtyRemaining);
  });
});
