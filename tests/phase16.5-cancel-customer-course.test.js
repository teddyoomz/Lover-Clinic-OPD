// Phase 16.5 (2026-04-29) — applyCourseCancel + buildChangeAuditEntry
// extension to support kind:'cancel' + cancelCustomerCourse backend wrapper.
//
// Mirror pattern: t4-course-exchange-refund.test.js (T4.B for applyCourseRefund).
// Covers the soft-cancel-without-refund path that 16.5 RemainingCourse tab needs.

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  applyCourseCancel,
  buildChangeAuditEntry,
  applyCourseRefund,
} from '../src/lib/courseExchange.js';

const CLIENT_SRC = readFileSync('src/lib/backendClient.js', 'utf8');

const baseCustomer = {
  customerId: 'cust-cancel-1',
  customerName: 'Cancel Test',
  courses: [
    { courseId: 'c-1', name: 'Course A', status: 'กำลังใช้งาน', value: '1000 บาท' },
    { courseId: 'c-2', name: 'Course B', status: 'กำลังใช้งาน', value: '2000 บาท' },
  ],
};

// ─── C1 applyCourseCancel pure ──────────────────────────────────────────
describe('C1 applyCourseCancel', () => {
  test('C1.1 valid cancel sets status=ยกเลิก + cancelledAt + cancelReason', () => {
    const { nextCourses, fromCourse, cancelledAt } = applyCourseCancel(
      baseCustomer, 'c-1', { reason: 'admin entry mistake', now: '2026-04-29T12:00:00Z' },
    );
    expect(nextCourses).toHaveLength(2); // course stays in array (audit integrity)
    expect(nextCourses[0].status).toBe('ยกเลิก');
    expect(nextCourses[0].cancelledAt).toBe('2026-04-29T12:00:00Z');
    expect(nextCourses[0].cancelReason).toBe('admin entry mistake');
    expect(nextCourses[1].status).toBe('กำลังใช้งาน'); // sibling untouched
    expect(fromCourse.courseId).toBe('c-1');
    expect(cancelledAt).toBe('2026-04-29T12:00:00Z');
  });

  test('C1.2 throws on missing customer; throws when neither courseId nor courseIndex provided', () => {
    expect(() => applyCourseCancel(null, 'c-1')).toThrow(/customer required/);
    expect(() => applyCourseCancel(baseCustomer, '')).toThrow(/courseId or opts\.courseIndex required/);
    expect(() => applyCourseCancel(baseCustomer, null)).toThrow(/courseId or opts\.courseIndex required/);
  });

  test('C1.2-bis Phase 16.5 — courseIndex fallback when courseId missing', () => {
    // Real ProClinic-cloned courses don't have courseId. Caller passes
    // opts.courseIndex from the row instead.
    const cloned = {
      courses: [
        { name: 'A', status: 'กำลังใช้งาน' }, // no courseId
        { name: 'B', status: 'กำลังใช้งาน' },
      ],
    };
    const { nextCourses, fromCourse } = applyCourseCancel(cloned, '', {
      courseIndex: 1, reason: 'r',
    });
    expect(nextCourses[1].status).toBe('ยกเลิก');
    expect(nextCourses[0].status).toBe('กำลังใช้งาน'); // sibling untouched
    expect(fromCourse.name).toBe('B');
  });

  test('C1.2-tris courseIndex out-of-range still throws course-not-found', () => {
    expect(() => applyCourseCancel(baseCustomer, '', { courseIndex: 99 })).toThrow(/not found/);
    expect(() => applyCourseCancel(baseCustomer, '', { courseIndex: -1 }))
      .toThrow(/courseId or opts\.courseIndex required/);
  });

  test('C1.2-quater courseId resolves first; courseIndex ignored when courseId valid', () => {
    // If both provided, courseId wins. Index fallback only fires on miss.
    const { nextCourses } = applyCourseCancel(baseCustomer, 'c-1', { courseIndex: 1, reason: 'r' });
    expect(nextCourses[0].status).toBe('ยกเลิก'); // c-1 (index 0), not c-2 (index 1)
    expect(nextCourses[1].status).toBe('กำลังใช้งาน');
  });

  test('C1.3 throws when course not found', () => {
    expect(() => applyCourseCancel(baseCustomer, 'no-such')).toThrow(/not found/);
  });

  test('C1.4 throws when course already terminal (cancelled or refunded)', () => {
    const cancelled = {
      ...baseCustomer,
      courses: [{ courseId: 'c-1', name: 'A', status: 'ยกเลิก' }],
    };
    expect(() => applyCourseCancel(cancelled, 'c-1')).toThrow(/already cancelled/);

    const refunded = {
      ...baseCustomer,
      courses: [{ courseId: 'c-1', name: 'A', status: 'คืนเงิน' }],
    };
    expect(() => applyCourseCancel(refunded, 'c-1')).toThrow(/already refunded/);
  });

  test('C1.5 default cancelledAt = now (ISO) when opts.now omitted', () => {
    const before = new Date().toISOString();
    const { cancelledAt } = applyCourseCancel(baseCustomer, 'c-1', { reason: 'r' });
    const after = new Date().toISOString();
    expect(cancelledAt >= before && cancelledAt <= after).toBe(true);
  });

  test('C1.6 empty reason allowed (UI gate enforces required, helper does not)', () => {
    const { nextCourses } = applyCourseCancel(baseCustomer, 'c-1', {});
    expect(nextCourses[0].cancelReason).toBe('');
  });

  test('C1.7 preserves all other course fields untouched', () => {
    const rich = {
      courses: [{
        courseId: 'c-1', name: 'A', status: 'กำลังใช้งาน',
        product: 'P', qty: '5/5', expiry: '2027-01-01', value: '500 บาท',
        courseType: '5+1', source: 'sale', parentName: '',
      }],
    };
    const { nextCourses } = applyCourseCancel(rich, 'c-1', { reason: 'x' });
    expect(nextCourses[0]).toMatchObject({
      courseId: 'c-1', name: 'A', product: 'P', qty: '5/5',
      expiry: '2027-01-01', value: '500 บาท', courseType: '5+1',
      source: 'sale', status: 'ยกเลิก', cancelReason: 'x',
    });
  });
});

// ─── C2 buildChangeAuditEntry — kind:'cancel' ───────────────────────────
describe('C2 buildChangeAuditEntry kind:cancel', () => {
  test('C2.1 accepts kind:cancel; refundAmount=null; toCourse=null', () => {
    const entry = buildChangeAuditEntry({
      customerId: 'cust-1',
      kind: 'cancel',
      fromCourse: { courseId: 'c-1', name: 'A', status: 'กำลังใช้งาน', value: '1000 บาท' },
      toCourse: null,
      refundAmount: null,
      reason: 'mistake',
      actor: 'admin@x',
      now: '2026-04-29T12:00:00Z',
    });
    expect(entry.kind).toBe('cancel');
    expect(entry.refundAmount).toBeNull();
    expect(entry.toCourse).toBeNull();
    expect(entry.fromCourse).toMatchObject({ courseId: 'c-1', name: 'A' });
    expect(entry.reason).toBe('mistake');
    expect(entry.actor).toBe('admin@x');
    expect(entry.createdAt).toBe('2026-04-29T12:00:00Z');
    expect(entry.changeId).toMatch(/^cc-/);
  });

  test('C2.2 still rejects unknown kinds', () => {
    expect(() => buildChangeAuditEntry({
      customerId: 'x', kind: 'destroy', fromCourse: null,
    })).toThrow(/kind must be exchange\|refund\|cancel/);
  });

  test('C2.3 still rejects missing customerId', () => {
    expect(() => buildChangeAuditEntry({ kind: 'cancel', fromCourse: null })).toThrow(/customerId required/);
  });

  test('C2.4 existing kind:exchange + kind:refund still work (regression guard)', () => {
    const ex = buildChangeAuditEntry({ customerId: 'x', kind: 'exchange', fromCourse: null });
    expect(ex.kind).toBe('exchange');
    const rf = buildChangeAuditEntry({ customerId: 'x', kind: 'refund', fromCourse: null, refundAmount: 100 });
    expect(rf.kind).toBe('refund');
    expect(rf.refundAmount).toBe(100);
  });

  // ─── C2-P0 — V14 lock: NO undefined leaves in audit entry ────────────
  test('C2-P0.1 fromCourse w/ undefined courseId (legacy ProClinic clone) → null, NOT undefined', () => {
    // Pre-fix: tx.set crashed with `Unsupported field value: undefined (found
    // in field fromCourse.courseId)`. Post-fix: legacy course missing
    // courseId still produces a valid Firestore-acceptable audit entry.
    const entry = buildChangeAuditEntry({
      customerId: 'cust-1',
      kind: 'cancel',
      fromCourse: { name: 'Legacy', status: 'กำลังใช้งาน', value: '500 บาท' }, // NO courseId
      toCourse: null,
      reason: 'r',
      actor: 'admin',
    });
    expect(entry.fromCourse.courseId).toBeNull();
    expect(entry.fromCourse.courseId).not.toBeUndefined();
  });

  test('C2-P0.2 V14 lock: walk audit entry → NO undefined leaves anywhere', () => {
    // Adversarial: every fromCourse field undefined.
    const entry = buildChangeAuditEntry({
      customerId: 'x',
      kind: 'cancel',
      fromCourse: {}, // every field undefined
      toCourse: undefined,
      reason: undefined,
      actor: undefined,
    });
    const walk = (obj, path = '') => {
      if (obj === undefined) throw new Error(`undefined leaf at ${path}`);
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        for (const k of Object.keys(obj)) walk(obj[k], `${path}.${k}`);
      }
    };
    expect(() => walk(entry)).not.toThrow();
  });

  test('C2-P0.3 toCourse w/ undefined courseId also coerced to null', () => {
    const entry = buildChangeAuditEntry({
      customerId: 'x',
      kind: 'exchange',
      fromCourse: { courseId: 'a', name: 'A' },
      toCourse: { name: 'B' }, // NO courseId
    });
    expect(entry.toCourse.courseId).toBeNull();
  });
});

// ─── C3 cancelCustomerCourse backend wrapper (source-grep) ──────────────
describe('C3 cancelCustomerCourse backend wrapper', () => {
  test('C3.1 exported from backendClient.js', () => {
    expect(CLIENT_SRC).toMatch(/export async function cancelCustomerCourse\(/);
  });

  test('C3.2 uses runTransaction for atomic write', () => {
    const idx = CLIENT_SRC.indexOf('export async function cancelCustomerCourse(');
    const slice = CLIENT_SRC.slice(idx, idx + 1500);
    expect(slice).toMatch(/runTransaction\(db,/);
  });

  test('C3.3 reads customer doc inside tx + throws on not-found', () => {
    const idx = CLIENT_SRC.indexOf('export async function cancelCustomerCourse(');
    const slice = CLIENT_SRC.slice(idx, idx + 1500);
    expect(slice).toMatch(/tx\.get\(cRef\)/);
    expect(slice).toMatch(/Customer not found/);
  });

  test('C3.4 calls applyCourseCancel + buildChangeAuditEntry kind:cancel', () => {
    const idx = CLIENT_SRC.indexOf('export async function cancelCustomerCourse(');
    const slice = CLIENT_SRC.slice(idx, idx + 1500);
    expect(slice).toMatch(/applyCourseCancel\(/);
    expect(slice).toMatch(/buildChangeAuditEntry\(/);
    expect(slice).toMatch(/kind: 'cancel'/);
  });

  test('C3.5 writes to be_course_changes via courseChangeDoc', () => {
    const idx = CLIENT_SRC.indexOf('export async function cancelCustomerCourse(');
    const slice = CLIENT_SRC.slice(idx, idx + 1500);
    expect(slice).toMatch(/tx\.set\(courseChangeDoc/);
  });

  test('C3.6 returns { changeId, fromCourse, cancelledAt }', () => {
    const idx = CLIENT_SRC.indexOf('export async function cancelCustomerCourse(');
    const slice = CLIENT_SRC.slice(idx, idx + 1500);
    expect(slice).toMatch(/return \{ changeId: audit\.changeId, fromCourse, cancelledAt \}/);
  });
});

// ─── C4 applyCourseRefund still rejects already-cancelled (cross-helper) ─
describe('C4 cross-helper terminal-state rejection', () => {
  test('C4.1 applyCourseRefund still rejects already-refunded (existing behavior preserved)', () => {
    const refunded = {
      courses: [{ courseId: 'c-1', name: 'A', status: 'คืนเงิน' }],
    };
    expect(() => applyCourseRefund(refunded, 'c-1', 100)).toThrow(/already refunded/);
  });
  // Note: applyCourseRefund does NOT currently reject already-cancelled
  // courses (pre-16.5 the cancelled state didn't exist). Future enhancement
  // may add this guard symmetrically. Documented but not tested here to
  // avoid asserting un-implemented behavior.
});
