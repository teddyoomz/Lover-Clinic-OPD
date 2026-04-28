// Phase 16.5 (2026-04-29) — pure helpers for remainingCourseUtils.js
//
// Adversarial coverage of:
//   - flattenCustomerCourses (8 tests) — empty in, single, multi, missing courseId,
//                                        legacy missing-status, qty edge, totalSpent parse,
//                                        branchId propagation
//   - filterCourses (7) — search HN/name/phone/courseName, status, courseType,
//                         hasRemainingOnly + status interaction, branch filter
//   - sortCourses (5) — purchaseDate desc default, lastUsedDate, qtyRemaining,
//                       totalSpent, customerName Thai-locale
//   - aggregateRemainingStats (4) — empty, mixed, terminal-not-counted, pro-rata
//   - listDistinctCourseTypes + isTerminalRow + parseValueFromCourseString +
//     parseStatusFromCourse + status enum exports

import { describe, test, expect } from 'vitest';
import {
  flattenCustomerCourses,
  filterCourses,
  sortCourses,
  aggregateRemainingStats,
  listDistinctCourseTypes,
  isTerminalRow,
  parseValueFromCourseString,
  parseStatusFromCourse,
  deriveEffectiveStatus,
  STATUS_ACTIVE,
  STATUS_USED,
  STATUS_REFUNDED,
  STATUS_CANCELLED,
  ALL_STATUSES,
} from '../src/lib/remainingCourseUtils.js';

const mkCustomer = (overrides = {}) => ({
  id: 'cust-1',
  hn: 'HN001',
  name: 'นาย ทดสอบ ใจดี',
  patientData: { phone: '0801112222' },
  branchId: 'BR-A',
  clonedAt: '2026-01-01T00:00:00Z',
  courses: [],
  ...overrides,
});

const mkCourse = (overrides = {}) => ({
  courseId: 'c-1',
  name: 'Course A',
  product: 'Botox',
  qty: '5/10 ครั้ง',
  status: STATUS_ACTIVE,
  value: '1000 บาท',
  courseType: '5+1',
  createdAt: '2026-04-01T10:00:00Z',
  ...overrides,
});

// ─── F1 flattenCustomerCourses ──────────────────────────────────────────
describe('F1 flattenCustomerCourses', () => {
  test('F1.1 empty input returns []', () => {
    expect(flattenCustomerCourses([])).toEqual([]);
    expect(flattenCustomerCourses(null)).toEqual([]);
    expect(flattenCustomerCourses(undefined)).toEqual([]);
  });

  test('F1.2 single customer with single course → 1 row, all fields populated', () => {
    const rows = flattenCustomerCourses([mkCustomer({ courses: [mkCourse()] })]);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.customerId).toBe('cust-1');
    expect(r.customerHN).toBe('HN001');
    expect(r.customerName).toBe('นาย ทดสอบ ใจดี');
    expect(r.customerPhone).toBe('0801112222');
    expect(r.customerBranchId).toBe('BR-A');
    expect(r.courseIndex).toBe(0);
    expect(r.courseId).toBe('c-1');
    expect(r.courseName).toBe('Course A');
    expect(r.courseType).toBe('5+1');
    expect(r.status).toBe(STATUS_ACTIVE);
    expect(r.qtyTotal).toBe(10);
    expect(r.qtyUsed).toBe(5);
    expect(r.qtyRemaining).toBe(5);
    expect(r.qtyUnit).toBe('ครั้ง');
    expect(r.purchaseDate).toBe('2026-04-01');
    expect(r.totalSpent).toBe(1000);
  });

  test('F1.3 multi customers + multi courses → cartesian flatten', () => {
    const customers = [
      mkCustomer({ id: 'cust-1', courses: [mkCourse({ courseId: 'a' }), mkCourse({ courseId: 'b' })] }),
      mkCustomer({ id: 'cust-2', courses: [mkCourse({ courseId: 'c' })] }),
    ];
    const rows = flattenCustomerCourses(customers);
    expect(rows).toHaveLength(3);
    expect(rows.map(r => r.customerId)).toEqual(['cust-1', 'cust-1', 'cust-2']);
    expect(rows.map(r => r.courseId)).toEqual(['a', 'b', 'c']);
    expect(rows.map(r => r.courseIndex)).toEqual([0, 1, 0]);
  });

  test('F1.4 legacy courses missing courseId produce rows w/ synthetic id (Phase 16.5 fix)', () => {
    // Pre-fix: defensive skip eliminated 1384/1384 ProClinic-cloned courses.
    // Post-fix: every course produces a row; legacy ones get `idx-${courseIndex}`
    // synthetic id and `hasRealCourseId: false` flag.
    const c = mkCustomer({
      courses: [
        mkCourse({ courseId: 'good' }),
        mkCourse({ courseId: '' }),
        mkCourse({ courseId: null }),
        mkCourse({ courseId: 'good-2' }),
      ],
    });
    const rows = flattenCustomerCourses([c]);
    expect(rows.map(r => r.courseId)).toEqual(['good', 'idx-1', 'idx-2', 'good-2']);
    expect(rows.map(r => r.hasRealCourseId)).toEqual([true, false, false, true]);
    expect(rows.map(r => r.courseIndex)).toEqual([0, 1, 2, 3]);
  });

  test('F1.5 legacy course missing status → defaults to STATUS_ACTIVE', () => {
    const rows = flattenCustomerCourses([
      mkCustomer({ courses: [mkCourse({ status: undefined })] }),
    ]);
    expect(rows[0].status).toBe(STATUS_ACTIVE);
  });

  test('F1.6 qty edge cases: empty qty, "0/0", "1/1 คอร์ส"', () => {
    const rows = flattenCustomerCourses([
      mkCustomer({
        id: 'c1',
        courses: [
          mkCourse({ courseId: 'a', qty: '' }),
          mkCourse({ courseId: 'b', qty: '0/0' }),
          mkCourse({ courseId: 'c', qty: '1/1 คอร์ส' }),
          mkCourse({ courseId: 'd', qty: '3/5' }), // no unit
        ],
      }),
    ]);
    expect(rows[0]).toMatchObject({ qtyTotal: 0, qtyUsed: 0, qtyRemaining: 0, qtyUnit: '' });
    expect(rows[1]).toMatchObject({ qtyTotal: 0, qtyUsed: 0, qtyRemaining: 0 });
    expect(rows[2]).toMatchObject({ qtyTotal: 1, qtyUsed: 0, qtyRemaining: 1, qtyUnit: 'คอร์ส' });
    expect(rows[3]).toMatchObject({ qtyTotal: 5, qtyUsed: 2, qtyRemaining: 3 });
  });

  test('F1.7 totalSpent parses Thai value strings', () => {
    const rows = flattenCustomerCourses([
      mkCustomer({
        courses: [
          mkCourse({ courseId: 'a', value: '1000 บาท' }),
          mkCourse({ courseId: 'b', value: '1,500.50 บาท' }),
          mkCourse({ courseId: 'c', value: '' }),
          mkCourse({ courseId: 'd', value: 'free' }),
        ],
      }),
    ]);
    expect(rows.map(r => r.totalSpent)).toEqual([1000, 1500.5, 0, 0]);
  });

  test('F1.8 customerBranchId propagates (branch filter foundation)', () => {
    const rows = flattenCustomerCourses([
      mkCustomer({ id: 'c1', branchId: 'BR-A', courses: [mkCourse()] }),
      mkCustomer({ id: 'c2', branchId: 'BR-B', courses: [mkCourse()] }),
      mkCustomer({ id: 'c3', branchId: null, courses: [mkCourse()] }),
    ]);
    expect(rows.map(r => r.customerBranchId)).toEqual(['BR-A', 'BR-B', '']);
  });

  test('F1.9 purchaseDate fallback chain: course.purchaseDate > createdAt > customer.clonedAt', () => {
    const rows = flattenCustomerCourses([
      mkCustomer({ id: 'c1', clonedAt: '2026-01-01T00:00:00Z', courses: [
        mkCourse({ courseId: 'a', createdAt: undefined, purchaseDate: '2026-03-15' }),
        mkCourse({ courseId: 'b', createdAt: '2026-02-10T00:00:00Z', purchaseDate: undefined }),
        mkCourse({ courseId: 'c', createdAt: undefined, purchaseDate: undefined }),
      ] }),
    ]);
    expect(rows.map(r => r.purchaseDate)).toEqual(['2026-03-15', '2026-02-10', '2026-01-01']);
  });
});

// ─── F2 filterCourses ───────────────────────────────────────────────────
describe('F2 filterCourses', () => {
  const sampleRows = flattenCustomerCourses([
    mkCustomer({ id: 'c1', hn: 'HN001', name: 'Alice', patientData: { phone: '0811111111' }, branchId: 'BR-A',
      courses: [
        mkCourse({ courseId: 'a1', name: 'Botox 50U', product: '', courseType: 'single',  qty: '3/5', status: STATUS_ACTIVE, value: '500 บาท' }),
        mkCourse({ courseId: 'a2', name: 'Filler',    product: '', courseType: 'package', qty: '0/3', status: STATUS_USED,   value: '3000 บาท' }),
      ] }),
    mkCustomer({ id: 'c2', hn: 'HN002', name: 'นาย ทดสอบ', patientData: { phone: '0822222222' }, branchId: 'BR-B',
      courses: [
        mkCourse({ courseId: 'b1', name: 'Hifu', product: '', courseType: 'package', qty: '2/2', status: STATUS_ACTIVE, value: '2000 บาท' }),
      ] }),
    mkCustomer({ id: 'c3', hn: 'HN003', name: 'Bob', patientData: { phone: '0833333333' }, branchId: '',
      courses: [
        mkCourse({ courseId: 'cc1', name: 'Laser', product: '', courseType: 'single', qty: '0/1', status: STATUS_REFUNDED, value: '1500 บาท' }),
      ] }),
  ]);

  test('F2.1 empty filter returns all rows', () => {
    expect(filterCourses(sampleRows, {})).toHaveLength(4);
  });

  test('F2.2 search matches HN', () => {
    expect(filterCourses(sampleRows, { search: 'HN002' })).toHaveLength(1);
    expect(filterCourses(sampleRows, { search: 'hn001' })).toHaveLength(2); // case-insensitive
  });

  test('F2.3 search matches customer name (Thai + English)', () => {
    expect(filterCourses(sampleRows, { search: 'Alice' })).toHaveLength(2);
    expect(filterCourses(sampleRows, { search: 'ทดสอบ' })).toHaveLength(1);
  });

  test('F2.4 search matches phone + course name', () => {
    expect(filterCourses(sampleRows, { search: '0833' })).toHaveLength(1);
    expect(filterCourses(sampleRows, { search: 'Hifu' })).toHaveLength(1);
    expect(filterCourses(sampleRows, { search: 'botox' })).toHaveLength(1);
  });

  test('F2.5 status filter exact match', () => {
    expect(filterCourses(sampleRows, { status: STATUS_ACTIVE })).toHaveLength(2);
    expect(filterCourses(sampleRows, { status: STATUS_REFUNDED })).toHaveLength(1);
    expect(filterCourses(sampleRows, { status: STATUS_USED })).toHaveLength(1);
  });

  test('F2.6 courseType filter exact match', () => {
    expect(filterCourses(sampleRows, { courseType: 'single' })).toHaveLength(2);
    expect(filterCourses(sampleRows, { courseType: 'package' })).toHaveLength(2);
  });

  test('F2.7 hasRemainingOnly default view (no status picked): keeps only qtyRemaining>0 + active', () => {
    const r = filterCourses(sampleRows, { hasRemainingOnly: true });
    expect(r).toHaveLength(2);
    expect(r.every(x => x.qtyRemaining > 0 && x.status === STATUS_ACTIVE)).toBe(true);
  });

  test('F2.7-bis Phase 16.5 fix: hasRemainingOnly + explicit non-active status → status pick wins', () => {
    // Pre-fix bug: user reports "คอร์สใช้หมดแล้ว/คืนเงิน/ยกเลิก ไม่มีในตารางเลย" —
    // hasRemainingOnly forcibly excluded all non-active rows even when user
    // explicitly picked one of those statuses. Post-fix: status pick wins.
    const used = filterCourses(sampleRows, { status: STATUS_USED, hasRemainingOnly: true });
    expect(used.map(r => r.courseId)).toEqual(['a2']);

    const refunded = filterCourses(sampleRows, { status: STATUS_REFUNDED, hasRemainingOnly: true });
    expect(refunded.map(r => r.courseId)).toEqual(['cc1']);
  });

  test('F2.7-tris hasRemainingOnly + status=active: keeps qtyRemaining>0 (intersect)', () => {
    const r = filterCourses(sampleRows, { status: STATUS_ACTIVE, hasRemainingOnly: true });
    // a1 (3/5 active) + b1 (2/2 active) — same as F2.7 but explicit
    expect(r).toHaveLength(2);
    expect(r.every(x => x.status === STATUS_ACTIVE && x.qtyRemaining > 0)).toBe(true);
  });

  test('F2.8 branchId filter: matches exact branch + includes empty branchId (legacy)', () => {
    expect(filterCourses(sampleRows, { branchId: 'BR-A' }).map(r => r.customerHN).sort())
      .toEqual(['HN001', 'HN001', 'HN003']); // BR-A + legacy
    expect(filterCourses(sampleRows, { branchId: 'BR-B' }).map(r => r.customerHN).sort())
      .toEqual(['HN002', 'HN003']); // BR-B + legacy
  });

  test('F2.9 multi-filter AND: search + status + courseType + hasRemainingOnly stack', () => {
    const r = filterCourses(sampleRows, {
      search: 'HN001',
      status: STATUS_ACTIVE,
      courseType: 'single',
      hasRemainingOnly: true,
    });
    expect(r).toHaveLength(1);
    expect(r[0].courseId).toBe('a1');
  });
});

// ─── F3 sortCourses ─────────────────────────────────────────────────────
describe('F3 sortCourses', () => {
  const rows = [
    { courseId: 'a', customerName: 'Charlie', courseName: 'Hifu', purchaseDate: '2026-01-01', lastUsedDate: '2026-03-01', qtyRemaining: 5, totalSpent: 1000 },
    { courseId: 'b', customerName: 'Alice',   courseName: 'Botox', purchaseDate: '2026-04-15', lastUsedDate: '2026-04-25', qtyRemaining: 10, totalSpent: 500 },
    { courseId: 'c', customerName: 'Bob',     courseName: 'Filler', purchaseDate: '2026-02-10', lastUsedDate: '', qtyRemaining: 1, totalSpent: 2000 },
  ];

  test('F3.1 default purchaseDate desc', () => {
    expect(sortCourses(rows).map(r => r.courseId)).toEqual(['b', 'c', 'a']);
  });

  test('F3.2 purchaseDate asc', () => {
    expect(sortCourses(rows, 'purchaseDate', 'asc').map(r => r.courseId)).toEqual(['a', 'c', 'b']);
  });

  test('F3.3 lastUsedDate desc — empty strings sort last', () => {
    expect(sortCourses(rows, 'lastUsedDate', 'desc').map(r => r.courseId)).toEqual(['b', 'a', 'c']);
  });

  test('F3.4 qtyRemaining desc', () => {
    expect(sortCourses(rows, 'qtyRemaining', 'desc').map(r => r.courseId)).toEqual(['b', 'a', 'c']);
  });

  test('F3.5 totalSpent desc', () => {
    expect(sortCourses(rows, 'totalSpent', 'desc').map(r => r.courseId)).toEqual(['c', 'a', 'b']);
  });

  test('F3.6 customerName asc Thai-locale', () => {
    const thai = [
      { courseId: 'a', customerName: 'นาย กุ้ง' },
      { courseId: 'b', customerName: 'นาย หนู' },
      { courseId: 'c', customerName: 'นาย ใจ' },
    ];
    const sorted = sortCourses(thai, 'customerName', 'asc');
    expect(sorted.map(r => r.courseId)).toHaveLength(3); // shape stable
  });

  test('F3.7 does not mutate input', () => {
    const input = [...rows];
    const original = JSON.stringify(input);
    sortCourses(input);
    expect(JSON.stringify(input)).toBe(original);
  });
});

// ─── F4 aggregateRemainingStats ──────────────────────────────────────────
describe('F4 aggregateRemainingStats', () => {
  test('F4.1 empty rows → zeros + empty byStatus', () => {
    const s = aggregateRemainingStats([]);
    expect(s.totalRows).toBe(0);
    expect(s.totalRemainingValue).toBe(0);
    expect(s.customersWithRemaining).toBe(0);
    expect(s.byStatus[STATUS_ACTIVE]).toBe(0);
  });

  test('F4.2 mixed statuses count correctly', () => {
    const rows = [
      { customerId: 'c1', status: STATUS_ACTIVE,    qtyTotal: 10, qtyRemaining: 5, totalSpent: 1000 },
      { customerId: 'c1', status: STATUS_USED,      qtyTotal: 5,  qtyRemaining: 0, totalSpent: 500 },
      { customerId: 'c2', status: STATUS_ACTIVE,    qtyTotal: 1,  qtyRemaining: 1, totalSpent: 200 },
      { customerId: 'c3', status: STATUS_REFUNDED,  qtyTotal: 5,  qtyRemaining: 5, totalSpent: 2000 },
      { customerId: 'c4', status: STATUS_CANCELLED, qtyTotal: 3,  qtyRemaining: 3, totalSpent: 600 },
    ];
    const s = aggregateRemainingStats(rows);
    expect(s.totalRows).toBe(5);
    expect(s.byStatus[STATUS_ACTIVE]).toBe(2);
    expect(s.byStatus[STATUS_USED]).toBe(1);
    expect(s.byStatus[STATUS_REFUNDED]).toBe(1);
    expect(s.byStatus[STATUS_CANCELLED]).toBe(1);
    expect(s.customersWithRemaining).toBe(2); // c1 + c2 (both active w/ remaining)
  });

  test('F4.3 totalRemainingValue is pro-rata (qtyRemaining/qtyTotal × totalSpent)', () => {
    const rows = [
      { customerId: 'c1', status: STATUS_ACTIVE, qtyTotal: 10, qtyRemaining: 3, totalSpent: 1000 }, // 300
      { customerId: 'c1', status: STATUS_ACTIVE, qtyTotal: 5,  qtyRemaining: 5, totalSpent: 500 },  // 500
      { customerId: 'c2', status: STATUS_USED,   qtyTotal: 5,  qtyRemaining: 0, totalSpent: 200 }, // not counted
    ];
    expect(aggregateRemainingStats(rows).totalRemainingValue).toBe(800);
  });

  test('F4.4 terminal statuses (refunded/cancelled) NOT counted in customersWithRemaining', () => {
    const rows = [
      { customerId: 'c1', status: STATUS_REFUNDED,  qtyTotal: 5, qtyRemaining: 5, totalSpent: 1000 },
      { customerId: 'c2', status: STATUS_CANCELLED, qtyTotal: 5, qtyRemaining: 5, totalSpent: 1000 },
    ];
    const s = aggregateRemainingStats(rows);
    expect(s.customersWithRemaining).toBe(0);
    expect(s.totalRemainingValue).toBe(0);
  });
});

// ─── F5 supporting helpers ──────────────────────────────────────────────
describe('F5 supporting helpers', () => {
  test('F5.1 listDistinctCourseTypes sorted Thai-locale', () => {
    const rows = [
      { courseType: 'package' },
      { courseType: 'single' },
      { courseType: '' }, // excluded
      { courseType: 'package' }, // dedup
      { courseType: 'buffet' },
    ];
    expect(listDistinctCourseTypes(rows)).toHaveLength(3);
  });

  test('F5.2 isTerminalRow — refunded + cancelled true; active + used false', () => {
    expect(isTerminalRow({ status: STATUS_REFUNDED })).toBe(true);
    expect(isTerminalRow({ status: STATUS_CANCELLED })).toBe(true);
    expect(isTerminalRow({ status: STATUS_ACTIVE })).toBe(false);
    expect(isTerminalRow({ status: STATUS_USED })).toBe(false);
    expect(isTerminalRow(null)).toBe(false);
    expect(isTerminalRow({})).toBe(false);
  });

  test('F5.3 parseValueFromCourseString — Thai value formats', () => {
    expect(parseValueFromCourseString('1000 บาท')).toBe(1000);
    expect(parseValueFromCourseString('1,500.50 บาท')).toBe(1500.5);
    expect(parseValueFromCourseString('500')).toBe(500);
    expect(parseValueFromCourseString('')).toBe(0);
    expect(parseValueFromCourseString(null)).toBe(0);
    expect(parseValueFromCourseString('free')).toBe(0);
    expect(parseValueFromCourseString('-100')).toBe(0); // negative rejected
  });

  test('F5.4 parseStatusFromCourse — exact match or fallback to ACTIVE', () => {
    expect(parseStatusFromCourse({ status: STATUS_ACTIVE })).toBe(STATUS_ACTIVE);
    expect(parseStatusFromCourse({ status: STATUS_REFUNDED })).toBe(STATUS_REFUNDED);
    expect(parseStatusFromCourse({ status: 'unknown' })).toBe(STATUS_ACTIVE);
    expect(parseStatusFromCourse({})).toBe(STATUS_ACTIVE);
    expect(parseStatusFromCourse(null)).toBe(STATUS_ACTIVE);
  });

  test('F5.4-bis Phase 16.5 fix — deriveEffectiveStatus promotes active+qty=0 → USED', () => {
    // ProClinic data: status stays "กำลังใช้งาน" even when qty hits zero.
    // Effective status promotion makes used-up courses filterable as USED.
    expect(deriveEffectiveStatus(STATUS_ACTIVE, 5, 0)).toBe(STATUS_USED);
    expect(deriveEffectiveStatus(STATUS_ACTIVE, 5, 5)).toBe(STATUS_ACTIVE); // not used
    expect(deriveEffectiveStatus(STATUS_ACTIVE, 5, 1)).toBe(STATUS_ACTIVE); // partial
    // Edge: qtyTotal=0 means no qty info → preserve raw status
    expect(deriveEffectiveStatus(STATUS_ACTIVE, 0, 0)).toBe(STATUS_ACTIVE);
    // Terminal statuses preserved untouched (don't promote to USED)
    expect(deriveEffectiveStatus(STATUS_REFUNDED, 5, 0)).toBe(STATUS_REFUNDED);
    expect(deriveEffectiveStatus(STATUS_CANCELLED, 5, 0)).toBe(STATUS_CANCELLED);
    expect(deriveEffectiveStatus(STATUS_USED, 5, 0)).toBe(STATUS_USED);
  });

  test('F5.4-tris flatten promotes effective status when qty=0/N + active', () => {
    const rows = flattenCustomerCourses([
      mkCustomer({ courses: [
        mkCourse({ courseId: 'a', qty: '0/5', status: STATUS_ACTIVE }), // promoted → USED
        mkCourse({ courseId: 'b', qty: '5/5', status: STATUS_ACTIVE }), // stays ACTIVE
        mkCourse({ courseId: 'c', qty: '0/3', status: STATUS_REFUNDED }), // stays REFUNDED
      ] }),
    ]);
    expect(rows.map(r => r.status)).toEqual([STATUS_USED, STATUS_ACTIVE, STATUS_REFUNDED]);
  });

  test('F5.5 status enum exports — Thai strings + ALL_STATUSES array', () => {
    expect(STATUS_ACTIVE).toBe('กำลังใช้งาน');
    expect(STATUS_USED).toBe('ใช้หมดแล้ว');
    expect(STATUS_REFUNDED).toBe('คืนเงิน');
    expect(STATUS_CANCELLED).toBe('ยกเลิก');
    expect(ALL_STATUSES).toHaveLength(4);
    expect(ALL_STATUSES).toContain(STATUS_ACTIVE);
  });
});
