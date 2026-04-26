// T4 (Phase 14.4 G5) — course exchange + refund (2026-04-26)
//
// Closes the deferred T4 from session 9. Customer can swap an existing
// purchased course for a different master course OR refund a course
// (mark consumed + record refund amount). Writes to be_course_changes
// audit log atomically inside a Firestore transaction.

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  findCourseIndex,
  applyCourseExchange,
  applyCourseRefund,
  buildChangeAuditEntry,
} from '../src/lib/courseExchange.js';

const RULES_SRC = readFileSync('firestore.rules', 'utf8');
const CLIENT_SRC = readFileSync('src/lib/backendClient.js', 'utf8');

const baseCustomer = {
  customerId: 'cust-1',
  customerName: 'Test',
  courses: [
    { courseId: 'c-old-1', name: 'Course A', status: 'กำลังใช้งาน', value: '1000 บาท' },
    { courseId: 'c-old-2', name: 'Course B', status: 'กำลังใช้งาน', value: '2000 บาท' },
  ],
};

const newMasterCourse = {
  courseId: 'master-new-1',
  name: 'Course C (Premium)',
  price: 3000,
  daysBeforeExpire: 90,
  courseType: '5+1',
  products: [{ name: 'Product C', qty: '5/5 ครั้ง' }],
};

// ─── T4.A — findCourseIndex ─────────────────────────────────────────────
describe('T4.A findCourseIndex', () => {
  test('A.1 finds existing courseId', () => {
    expect(findCourseIndex(baseCustomer, 'c-old-1')).toBe(0);
    expect(findCourseIndex(baseCustomer, 'c-old-2')).toBe(1);
  });
  test('A.2 returns -1 for missing courseId', () => {
    expect(findCourseIndex(baseCustomer, 'nonexistent')).toBe(-1);
  });
  test('A.3 returns -1 for null/undefined customer or no courses[]', () => {
    expect(findCourseIndex(null, 'c-old-1')).toBe(-1);
    expect(findCourseIndex({}, 'c-old-1')).toBe(-1);
    expect(findCourseIndex({ courses: null }, 'c-old-1')).toBe(-1);
  });
  test('A.4 String-coerces courseId for comparison (mixed types)', () => {
    const c = { courses: [{ courseId: 123 }] };
    expect(findCourseIndex(c, '123')).toBe(0);
  });
});

// ─── T4.B — applyCourseExchange ─────────────────────────────────────────
describe('T4.B applyCourseExchange', () => {
  test('B.1 throws on missing customer / fromCourseId / newMasterCourse', () => {
    expect(() => applyCourseExchange(null, 'c-old-1', newMasterCourse)).toThrow();
    expect(() => applyCourseExchange(baseCustomer, '', newMasterCourse)).toThrow();
    expect(() => applyCourseExchange(baseCustomer, 'c-old-1', null)).toThrow();
    expect(() => applyCourseExchange(baseCustomer, 'c-old-1', {})).toThrow();
  });

  test('B.2 throws when fromCourseId not found', () => {
    expect(() => applyCourseExchange(baseCustomer, 'no-such', newMasterCourse)).toThrow(/not found/);
  });

  test('B.3 produces nextCourses with source course removed + new appended', () => {
    const { nextCourses, fromCourse, newCourse } = applyCourseExchange(
      baseCustomer, 'c-old-1', newMasterCourse,
    );
    expect(nextCourses).toHaveLength(2); // 2 - 1 + 1
    expect(nextCourses.find(c => c.courseId === 'c-old-1')).toBeUndefined();
    expect(nextCourses.find(c => c.courseId === 'c-old-2')).toBeDefined();
    expect(nextCourses[nextCourses.length - 1]).toBe(newCourse);
    expect(fromCourse.courseId).toBe('c-old-1');
  });

  test('B.4 new course has source: "exchange" + parentName from old', () => {
    const { newCourse } = applyCourseExchange(baseCustomer, 'c-old-1', newMasterCourse);
    expect(newCourse.source).toBe('exchange');
    expect(newCourse.parentName).toBe('Course A');
  });

  test('B.5 new course has computed expiry from daysBeforeExpire', () => {
    const { newCourse } = applyCourseExchange(baseCustomer, 'c-old-1', newMasterCourse);
    expect(newCourse.expiry).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('B.6 new course gets value: "<price> บาท"', () => {
    const { newCourse } = applyCourseExchange(baseCustomer, 'c-old-1', newMasterCourse);
    expect(newCourse.value).toBe('3000 บาท');
  });

  test('B.7 new course inherits courseType from master', () => {
    const { newCourse } = applyCourseExchange(baseCustomer, 'c-old-1', newMasterCourse);
    expect(newCourse.courseType).toBe('5+1');
  });

  test('B.8 new course products[] map name+qty+remaining', () => {
    const { newCourse } = applyCourseExchange(baseCustomer, 'c-old-1', newMasterCourse);
    expect(newCourse.products).toEqual([
      { name: 'Product C', qty: '5/5 ครั้ง', remaining: '5/5 ครั้ง' },
    ]);
  });

  test('B.9 newCourseId override via opts works', () => {
    const { newCourse } = applyCourseExchange(
      baseCustomer, 'c-old-1', newMasterCourse, { newCourseId: 'custom-id' },
    );
    expect(newCourse.courseId).toBe('custom-id');
  });

  test('B.10 master without daysBeforeExpire → expiry is empty string', () => {
    const noExpiry = { ...newMasterCourse, daysBeforeExpire: 0 };
    const { newCourse } = applyCourseExchange(baseCustomer, 'c-old-1', noExpiry);
    expect(newCourse.expiry).toBe('');
  });

  test('B.11 fallback to validityDays when daysBeforeExpire missing', () => {
    const legacy = { ...newMasterCourse, daysBeforeExpire: undefined, validityDays: 30 };
    const { newCourse } = applyCourseExchange(baseCustomer, 'c-old-1', legacy);
    expect(newCourse.expiry).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ─── T4.C — applyCourseRefund ───────────────────────────────────────────
describe('T4.C applyCourseRefund', () => {
  test('C.1 throws on missing customer / courseId', () => {
    expect(() => applyCourseRefund(null, 'c-old-1', 1000)).toThrow();
    expect(() => applyCourseRefund(baseCustomer, '', 1000)).toThrow();
  });

  test('C.2 throws on negative / non-finite / non-number refundAmount', () => {
    expect(() => applyCourseRefund(baseCustomer, 'c-old-1', -1)).toThrow();
    expect(() => applyCourseRefund(baseCustomer, 'c-old-1', 'abc')).toThrow();
    expect(() => applyCourseRefund(baseCustomer, 'c-old-1', NaN)).toThrow();
    expect(() => applyCourseRefund(baseCustomer, 'c-old-1', Infinity)).toThrow();
  });

  test('C.3 throws when courseId not found', () => {
    expect(() => applyCourseRefund(baseCustomer, 'nope', 100)).toThrow(/not found/);
  });

  test('C.4 marks course status as "คืนเงิน" + adds refundedAt + refundAmount', () => {
    const { nextCourses } = applyCourseRefund(baseCustomer, 'c-old-1', 500);
    const refunded = nextCourses[0];
    expect(refunded.status).toBe('คืนเงิน');
    expect(refunded.refundAmount).toBe(500);
    expect(refunded.refundedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('C.5 preserves OTHER courses unchanged', () => {
    const { nextCourses } = applyCourseRefund(baseCustomer, 'c-old-1', 500);
    expect(nextCourses[1]).toEqual(baseCustomer.courses[1]);
  });

  test('C.6 preserves array length (does not splice)', () => {
    const { nextCourses } = applyCourseRefund(baseCustomer, 'c-old-1', 500);
    expect(nextCourses).toHaveLength(2);
  });

  test('C.7 stores reason from opts', () => {
    const { nextCourses } = applyCourseRefund(baseCustomer, 'c-old-1', 500, { reason: 'ลูกค้าขอคืน' });
    expect(nextCourses[0].refundReason).toBe('ลูกค้าขอคืน');
  });

  test('C.8 throws when course already refunded (no double refund)', () => {
    const refundedCustomer = {
      ...baseCustomer,
      courses: [{ courseId: 'c-old-1', status: 'คืนเงิน', refundAmount: 500 }],
    };
    expect(() => applyCourseRefund(refundedCustomer, 'c-old-1', 100)).toThrow(/already refunded/);
  });

  test('C.9 zero refund amount is allowed (course closure without money)', () => {
    const { nextCourses } = applyCourseRefund(baseCustomer, 'c-old-1', 0);
    expect(nextCourses[0].refundAmount).toBe(0);
    expect(nextCourses[0].status).toBe('คืนเงิน');
  });

  test('C.10 opts.now overrides refundedAt for deterministic tests', () => {
    const now = '2026-05-01T12:00:00.000Z';
    const { nextCourses } = applyCourseRefund(baseCustomer, 'c-old-1', 100, { now });
    expect(nextCourses[0].refundedAt).toBe(now);
  });
});

// ─── T4.D — buildChangeAuditEntry ───────────────────────────────────────
describe('T4.D buildChangeAuditEntry', () => {
  const fromCourse = { courseId: 'c1', name: 'A', status: 'กำลังใช้งาน', value: '1000 บาท' };
  const toCourse = { courseId: 'c2', name: 'C', value: '3000 บาท' };

  test('D.1 throws on missing customerId or invalid kind', () => {
    expect(() => buildChangeAuditEntry({ kind: 'exchange', fromCourse })).toThrow();
    expect(() => buildChangeAuditEntry({ customerId: 'x', kind: 'invalid' })).toThrow();
  });

  test('D.2 builds exchange entry with both fromCourse + toCourse', () => {
    const entry = buildChangeAuditEntry({
      customerId: 'cust-1', kind: 'exchange', fromCourse, toCourse, actor: 'admin-1',
    });
    expect(entry.kind).toBe('exchange');
    expect(entry.customerId).toBe('cust-1');
    expect(entry.fromCourse.courseId).toBe('c1');
    expect(entry.toCourse.courseId).toBe('c2');
    expect(entry.actor).toBe('admin-1');
    expect(entry.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entry.changeId).toMatch(/^cc-\d+-[a-z0-9]+$/);
  });

  test('D.3 builds refund entry with toCourse=null + refundAmount', () => {
    const entry = buildChangeAuditEntry({
      customerId: 'cust-1', kind: 'refund', fromCourse, toCourse: null, refundAmount: 500,
    });
    expect(entry.kind).toBe('refund');
    expect(entry.toCourse).toBe(null);
    expect(entry.refundAmount).toBe(500);
  });

  test('D.4 truncates reason to 500 chars', () => {
    const longReason = 'ก'.repeat(700);
    const entry = buildChangeAuditEntry({
      customerId: 'x', kind: 'exchange', fromCourse, toCourse, reason: longReason,
    });
    expect(entry.reason.length).toBe(500);
  });

  test('D.5 changeId is unique across rapid calls', async () => {
    const ids = new Set();
    for (let i = 0; i < 50; i++) {
      const e = buildChangeAuditEntry({ customerId: 'x', kind: 'exchange', fromCourse, toCourse });
      ids.add(e.changeId);
    }
    expect(ids.size).toBe(50);
  });

  test('D.6 customerId String-coerced (avoid runtime type quirk)', () => {
    const entry = buildChangeAuditEntry({
      customerId: 12345, kind: 'exchange', fromCourse, toCourse,
    });
    expect(entry.customerId).toBe('12345');
    expect(typeof entry.customerId).toBe('string');
  });
});

// ─── T4.E — backendClient + firestore.rules wiring ──────────────────────
describe('T4.E backendClient wiring', () => {
  test('E.1 exports exchangeCustomerCourse', () => {
    expect(CLIENT_SRC).toMatch(/export async function exchangeCustomerCourse/);
  });
  test('E.2 exports refundCustomerCourse', () => {
    expect(CLIENT_SRC).toMatch(/export async function refundCustomerCourse/);
  });
  test('E.3 exports listCourseChanges', () => {
    expect(CLIENT_SRC).toMatch(/export async function listCourseChanges/);
  });
  test('E.4 both exchange+refund use runTransaction (atomicity)', () => {
    const exBlock = CLIENT_SRC.match(/export async function exchangeCustomerCourse[\s\S]*?^\}/m)?.[0] || '';
    expect(exBlock).toMatch(/runTransaction/);
    const reBlock = CLIENT_SRC.match(/export async function refundCustomerCourse[\s\S]*?^\}/m)?.[0] || '';
    expect(reBlock).toMatch(/runTransaction/);
  });
  test('E.5 both write to be_course_changes audit log inside same tx', () => {
    const exBlock = CLIENT_SRC.match(/export async function exchangeCustomerCourse[\s\S]*?^\}/m)?.[0] || '';
    expect(exBlock).toMatch(/buildChangeAuditEntry/);
    expect(exBlock).toMatch(/tx\.set\(courseChangeDoc/);
    const reBlock = CLIENT_SRC.match(/export async function refundCustomerCourse[\s\S]*?^\}/m)?.[0] || '';
    expect(reBlock).toMatch(/buildChangeAuditEntry/);
    expect(reBlock).toMatch(/tx\.set\(courseChangeDoc/);
  });
});

describe('T4.F firestore.rules — append-only audit log', () => {
  test('F.1 be_course_changes match block exists', () => {
    expect(RULES_SRC).toMatch(/match \/be_course_changes\/\{changeId\}/);
  });
  test('F.2 read + create allowed for clinic staff', () => {
    const block = RULES_SRC.match(/match \/be_course_changes\/\{changeId\}\s*\{[\s\S]*?\}/)?.[0] || '';
    expect(block).toMatch(/allow read:\s+if isClinicStaff\(\)/);
    expect(block).toMatch(/allow create:\s+if isClinicStaff\(\)/);
  });
  test('F.3 update + delete forbidden (audit immutability)', () => {
    const block = RULES_SRC.match(/match \/be_course_changes\/\{changeId\}\s*\{[\s\S]*?\}/)?.[0] || '';
    expect(block).toMatch(/allow update,\s*delete:\s+if false/);
  });
});
