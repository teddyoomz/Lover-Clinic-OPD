// ─── Course Exchange + Refund — T4 (Phase 14.4 G5) ───────────────────────
// V32-tris-bis (2026-04-26) — pure helpers for swapping a customer's
// purchased course (be_customers.courses[N]) with a different master
// course OR refunding a course (mark it consumed + reverse part of the
// money flow).
//
// Why a separate module: course exchange + refund cross multiple
// invariants (customer.courses array, customer.totals, audit log,
// linked sale's items). Pure helpers let us unit-test the SHAPE
// transformations without firing real Firestore writes.
//
// Audit collection: `be_course_changes` (append-only).
//   { changeId, customerId, kind: 'exchange'|'refund',
//     fromCourse: <snapshot>, toCourse: <snapshot or null for refund>,
//     refundAmount: <Number, refund only>,
//     reason: <Thai text>,
//     actor: <admin uid>,
//     createdAt: <ISO> }

/**
 * Find a course inside customer.courses[] by its courseId. Returns the
 * index or -1.
 */
export function findCourseIndex(customer, courseId) {
  if (!customer || !Array.isArray(customer.courses)) return -1;
  return customer.courses.findIndex(c => String(c.courseId) === String(courseId));
}

/**
 * Build the post-exchange `customer.courses[]` array.
 * - Removes the source course at index `idx`.
 * - Appends a new course entry derived from `newMasterCourse`.
 * - Preserves any unrelated courses untouched.
 *
 * The new entry inherits `source: 'exchange'` + `parentName` for audit.
 *
 * Pure: caller is responsible for persisting the result + writing the
 * audit log entry.
 */
export function applyCourseExchange(customer, fromCourseId, newMasterCourse, opts = {}) {
  if (!customer) throw new Error('customer required');
  if (!fromCourseId) throw new Error('fromCourseId required');
  if (!newMasterCourse || !newMasterCourse.name) throw new Error('newMasterCourse with name required');

  const idx = findCourseIndex(customer, fromCourseId);
  if (idx < 0) throw new Error(`course not found: ${fromCourseId}`);

  const prevCourses = Array.isArray(customer.courses) ? customer.courses : [];
  const fromCourse = prevCourses[idx];
  const newId = opts.newCourseId || `exchange-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const products = Array.isArray(newMasterCourse.products) ? newMasterCourse.products : [];
  const validityDays = newMasterCourse.daysBeforeExpire != null
    ? Number(newMasterCourse.daysBeforeExpire)
    : (newMasterCourse.validityDays != null ? Number(newMasterCourse.validityDays) : null);
  const expiry = validityDays > 0
    ? new Date(Date.now() + validityDays * 86400000).toISOString().split('T')[0]
    : '';

  const newCourse = {
    courseId: newId,
    name: newMasterCourse.name,
    product: products[0]?.name || '',
    qty: products[0]?.qty || '',
    status: 'กำลังใช้งาน',
    expiry,
    value: newMasterCourse.price ? `${newMasterCourse.price} บาท` : '',
    parentName: fromCourse?.name || '',  // remember origin for audit trail
    source: 'exchange',
    courseType: newMasterCourse.courseType || '',
    products: products.map(p => ({ name: p.name, qty: p.qty || '1/1', remaining: p.qty || '1/1' })),
  };

  const nextCourses = [
    ...prevCourses.slice(0, idx),
    ...prevCourses.slice(idx + 1),
    newCourse,
  ];

  return {
    nextCourses,
    fromCourse,
    newCourse,
  };
}

/**
 * Build the post-refund `customer.courses[]` array.
 * - Marks the source course as `status: 'คืนเงิน'` (refunded).
 * - Sets `refundedAt` ISO timestamp.
 * - Stores the refund amount on the course entry for audit lookup.
 *
 * Does NOT remove the course from the array (audit trail integrity —
 * matches existing 'ใช้หมดแล้ว' / 'ยกเลิก' patterns where the course stays
 * in customer.courses but with terminal status).
 */
export function applyCourseRefund(customer, courseId, refundAmount, opts = {}) {
  if (!customer) throw new Error('customer required');
  if (!courseId) throw new Error('courseId required');
  if (typeof refundAmount !== 'number' || refundAmount < 0 || !Number.isFinite(refundAmount)) {
    throw new Error('refundAmount must be non-negative finite number');
  }
  const idx = findCourseIndex(customer, courseId);
  if (idx < 0) throw new Error(`course not found: ${courseId}`);

  const prevCourses = Array.isArray(customer.courses) ? customer.courses : [];
  const target = prevCourses[idx];

  if (target.status === 'คืนเงิน') {
    throw new Error('course already refunded');
  }

  const refundedAt = opts.now || new Date().toISOString();
  const refundedCourse = {
    ...target,
    status: 'คืนเงิน',
    refundedAt,
    refundAmount,
    refundReason: opts.reason || '',
  };

  const nextCourses = [
    ...prevCourses.slice(0, idx),
    refundedCourse,
    ...prevCourses.slice(idx + 1),
  ];

  return {
    nextCourses,
    fromCourse: target,
    refundAmount,
    refundedAt,
  };
}

/**
 * Build a be_course_changes audit log entry. Called by the Firestore
 * write path AFTER applyCourseExchange or applyCourseRefund succeeds.
 *
 * Append-only: callers should never UPDATE an existing entry (mirrors
 * be_stock_movements / be_wallet_transactions pattern).
 */
export function buildChangeAuditEntry({ customerId, kind, fromCourse, toCourse, refundAmount, reason, actor, now }) {
  if (!customerId) throw new Error('customerId required');
  if (!['exchange', 'refund'].includes(kind)) throw new Error('kind must be exchange|refund');
  const changeId = `cc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const createdAt = now || new Date().toISOString();
  return {
    changeId,
    customerId: String(customerId),
    kind,
    fromCourse: fromCourse ? {
      courseId: fromCourse.courseId,
      name: fromCourse.name,
      status: fromCourse.status,
      value: fromCourse.value,
    } : null,
    toCourse: toCourse ? {
      courseId: toCourse.courseId,
      name: toCourse.name,
      value: toCourse.value,
    } : null,
    refundAmount: typeof refundAmount === 'number' ? refundAmount : null,
    reason: String(reason || '').slice(0, 500),
    actor: String(actor || ''),
    createdAt,
  };
}
