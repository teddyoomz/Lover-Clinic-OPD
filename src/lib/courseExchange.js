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
 * Phase 16.7-quinquies-ter (2026-04-29) — derive the canonical course
 * type label from a course doc, handling legacy/clone variants where
 * the type marker lives in the qty string instead of a courseType field.
 *
 * Returns one of:
 *   'เหมาตามจริง' — fixed-bundle course consumed in full each visit
 *   'บุฟเฟต์'    — unlimited use until expiry
 *   'pick-at-treatment' — product chosen at treatment time
 *   ''           — standard qty-tracked course (no badge needed)
 *
 * @param {object|null|undefined} c — course-like object
 */
export function inferCourseType(c) {
  if (!c || typeof c !== 'object') return '';
  const ct = String(c.courseType || '').trim();
  if (ct) return ct;
  const qty = typeof c.qty === 'string' ? c.qty : '';
  if (qty === 'เหมาตามจริง' || c.isRealQty) return 'เหมาตามจริง';
  if (qty === 'บุฟเฟต์' || c.isBuffet) return 'บุฟเฟต์';
  if (c.isPickAtTreatment || c.needsPickSelection) return 'pick-at-treatment';
  return '';
}

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
  // Phase 16.5 fix (2026-04-29): courseIndex fallback for legacy courses
  // missing courseId field. Caller passes opts.courseIndex when the row's
  // `hasRealCourseId === false`. Lookup tries courseId first, then falls
  // back to opts.courseIndex.
  const hasIdInput = courseId !== '' && courseId !== null && courseId !== undefined;
  const hasIdxInput = typeof opts.courseIndex === 'number' && opts.courseIndex >= 0;
  if (!hasIdInput && !hasIdxInput) throw new Error('courseId or opts.courseIndex required');
  if (typeof refundAmount !== 'number' || refundAmount < 0 || !Number.isFinite(refundAmount)) {
    throw new Error('refundAmount must be non-negative finite number');
  }
  let idx = hasIdInput ? findCourseIndex(customer, courseId) : -1;
  if (idx < 0 && hasIdxInput) {
    const len = Array.isArray(customer.courses) ? customer.courses.length : 0;
    if (opts.courseIndex < len) idx = opts.courseIndex;
  }
  if (idx < 0) throw new Error(`course not found: ${courseId || `index ${opts.courseIndex}`}`);

  const prevCourses = Array.isArray(customer.courses) ? customer.courses : [];
  const target = prevCourses[idx];

  if (target.status === 'คืนเงิน') {
    throw new Error('course already refunded');
  }

  const refundedAt = opts.now || new Date().toISOString();
  // Phase 16.5-quater — same staff persistence as applyCourseCancel.
  const refundedCourse = {
    ...target,
    status: 'คืนเงิน',
    refundedAt,
    refundAmount,
    refundReason: String(opts.reason || ''),
    staffId: String(opts.staffId || ''),
    staffName: String(opts.staffName || ''),
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
 * Build the post-cancel customer.courses[] array.
 * - Marks the source course as `status: 'ยกเลิก'` (cancelled — terminal).
 * - Sets cancelledAt + cancelReason.
 * - Does NOT remove the course from the array (audit trail integrity —
 *   matches refund pattern; same rationale).
 *
 * Phase 16.5 — first soft-cancel-without-refund path. Distinct from
 * applyCourseRefund which sets status='คืนเงิน' AND records refundAmount.
 * Cancel = admin marks the course as no-longer-usable WITHOUT moving money
 * (e.g. data-entry mistake or customer-side voluntary drop).
 */
export function applyCourseCancel(customer, courseId, opts = {}) {
  if (!customer) throw new Error('customer required');
  // Phase 16.5 fix (2026-04-29): courseIndex fallback for legacy courses
  // missing courseId field (ProClinic-cloned). Caller passes opts.courseIndex
  // when the row's `hasRealCourseId === false`. Lookup tries courseId first,
  // then falls back to opts.courseIndex.
  const hasIdInput = courseId !== '' && courseId !== null && courseId !== undefined;
  const hasIdxInput = typeof opts.courseIndex === 'number' && opts.courseIndex >= 0;
  if (!hasIdInput && !hasIdxInput) throw new Error('courseId or opts.courseIndex required');
  let idx = hasIdInput ? findCourseIndex(customer, courseId) : -1;
  if (idx < 0 && hasIdxInput) {
    const len = Array.isArray(customer.courses) ? customer.courses.length : 0;
    if (opts.courseIndex < len) idx = opts.courseIndex;
  }
  if (idx < 0) throw new Error(`course not found: ${courseId || `index ${opts.courseIndex}`}`);

  const prevCourses = Array.isArray(customer.courses) ? customer.courses : [];
  const target = prevCourses[idx];

  if (target.status === 'ยกเลิก') throw new Error('course already cancelled');
  if (target.status === 'คืนเงิน') throw new Error('course already refunded');

  const cancelledAt = opts.now || new Date().toISOString();
  // Phase 16.5-quater fix (2026-04-29 user directive): "คอร์สในตัวลูกค้าคน
  // นั้นก็ต้องหายจริง และมาแสดงใน tab ประวัติการใช้คอร์ส". Cancel via
  // RemainingCourse tab REMOVES the course from customer.courses[] entirely.
  // The full snapshot is preserved in the be_course_changes audit doc which
  // the ประวัติการใช้คอร์ส tab reads from.
  //
  // Distinct from sale-cascade (applySaleCancelToCourses) which FLIPS status
  // (preserves course in array as terminal-state record). Distinct from
  // applyCourseRefund which also flips.
  const nextCourses = [
    ...prevCourses.slice(0, idx),
    ...prevCourses.slice(idx + 1),
  ];

  return {
    nextCourses,
    fromCourse: target,
    cancelledAt,
  };
}

/**
 * Build a be_course_changes audit log entry. Called by the Firestore
 * write path AFTER applyCourseExchange, applyCourseRefund, or
 * applyCourseCancel succeeds.
 *
 * Append-only: callers should never UPDATE an existing entry (mirrors
 * be_stock_movements / be_wallet_transactions pattern).
 *
 * Phase 16.5 (2026-04-29) — added 'cancel' kind alongside existing
 * 'exchange' and 'refund'. Cancel entries have refundAmount=null +
 * toCourse=null (only fromCourse populated).
 */
export function buildChangeAuditEntry({ customerId, kind, fromCourse, toCourse, refundAmount, reason, actor, staffId, staffName, qtyDelta, qtyBefore, qtyAfter, toCustomerId, toCustomerName, linkedTreatmentId, productName, productQty, productUnit, now }) {
  if (!customerId) throw new Error('customerId required');
  // Phase 16.5-quater (2026-04-29) — extended kind enum:
  //   'add'      — addCourseRemainingQty (เพิ่มคงเหลือ button) — qtyDelta + qtyBefore + qtyAfter
  //   'share'    — shareCustomerCourse — toCustomerId + toCustomerName + qtyDelta
  //   'exchange' — applyCourseExchange (existing)
  //   'refund'   — applyCourseRefund (existing)
  //   'cancel'   — applyCourseCancel (existing)
  if (!['exchange', 'refund', 'cancel', 'add', 'share', 'use'].includes(kind)) {
    throw new Error('kind must be exchange|refund|cancel|add|share|use');
  }
  const changeId = `cc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const createdAt = now || new Date().toISOString();
  // Phase 16.5-bis P0 fix (2026-04-29 user report "Function Transaction.set()
  // called with invalid data. Unsupported field value: undefined (found in
  // field fromCourse.courseId)"): legacy ProClinic-cloned courses have NO
  // courseId field → undefined → Firestore tx.set rejects. V14 lock pattern:
  // walk output, coerce all undefined leaves to safe primitives (null for
  // optional refs, '' for strings).
  return {
    changeId,
    customerId: String(customerId),
    kind,
    fromCourse: fromCourse ? {
      courseId: fromCourse.courseId || null,
      name: String(fromCourse.name || ''),
      status: String(fromCourse.status || ''),
      value: String(fromCourse.value || ''),
      // Phase 16.7-quinquies-ter (2026-04-29) — preserve courseType so
      // the audit display can show a clear badge ("เหมาตามจริง" /
      // "บุฟเฟต์" / standard) and suppress the misleading "1/1 → 0/1"
      // qty line. inferCourseType handles legacy/clone data where
      // courseType lives in the qty string itself instead of a field.
      courseType: inferCourseType(fromCourse),
    } : null,
    toCourse: toCourse ? {
      courseId: toCourse.courseId || null,
      name: String(toCourse.name || ''),
      value: String(toCourse.value || ''),
    } : null,
    refundAmount: typeof refundAmount === 'number' ? refundAmount : null,
    reason: String(reason || '').slice(0, 500),
    actor: String(actor || ''),
    // Phase 16.5-ter (2026-04-29) — required staff identification (NAME, not
    // raw id) per user directive "ระวังเรื่องพนังงานเป็นตัวเลขไม่ใช่ text".
    staffId: String(staffId || ''),
    staffName: String(staffName || ''),
    // Phase 16.5-quater (2026-04-29) — qty/share metadata (kind-specific).
    // V14 lock: coerce undefined → null (not the empty string we use for text).
    qtyDelta: typeof qtyDelta === 'number' ? qtyDelta : null,
    qtyBefore: String(qtyBefore || ''),
    qtyAfter: String(qtyAfter || ''),
    toCustomerId: String(toCustomerId || ''),
    toCustomerName: String(toCustomerName || ''),
    // Phase 16.5-quater 'use' kind metadata: linkedTreatmentId so the
    // ประวัติการใช้คอร์ส tab can deep-link back to the treatment record.
    linkedTreatmentId: String(linkedTreatmentId || ''),
    // Phase 16.7-quinquies-ter (2026-04-29) — product-level enrichment for
    // 'use' audits. When a wrapper course (e.g. "เทส IV แก้แฮงค์2") deducts
    // a sub-product (e.g. Allergan 100 U at 75 U), the audit shows the
    // PRODUCT that was actually consumed alongside the wrapper course name.
    // User directive: "หาบั๊คแล้วแก้ให้แสดงทุกการใช้คอร์ส ตัดคอร์ส จริงๆ".
    // V14 lock: empty string for unset (not undefined), 0 for unset numeric.
    productName: String(productName || ''),
    productQty: typeof productQty === 'number' ? productQty : (Number(productQty) || 0),
    productUnit: String(productUnit || ''),
    createdAt,
  };
}
