// ─── Course validation — Phase 12.2 pure helpers ───────────────────────────
// Triangle (Rule F, 2026-04-20): `opd.js forms /admin/course` confirms fields:
// course_name*, course_code, receipt_course_name, course_category, course_type,
// time, usage_type, sale_price, sale_price_incl_vat, is_vat_included, status.
// Also captured: courseProducts sub-array (products deducted per use —
// id + qty). Phase 12.2 ships core + sub-items; DF-per-course editing waits
// for Phase 13.3 be_df_groups.

export const STATUS_OPTIONS = Object.freeze(['ใช้งาน', 'พักใช้งาน']);

export const NAME_MAX_LENGTH = 200;
export const CODE_MAX_LENGTH = 50;
export const CATEGORY_MAX_LENGTH = 100;

export function validateCourse(form) {
  if (!form || typeof form !== 'object' || Array.isArray(form)) {
    return ['form', 'missing form'];
  }

  if (typeof form.courseName !== 'string') return ['courseName', 'กรุณากรอกชื่อคอร์ส'];
  const cn = form.courseName.trim();
  if (!cn) return ['courseName', 'กรุณากรอกชื่อคอร์ส'];
  if (cn.length > NAME_MAX_LENGTH) return ['courseName', `ชื่อคอร์สไม่เกิน ${NAME_MAX_LENGTH} ตัวอักษร`];

  if (form.courseCode && String(form.courseCode).length > CODE_MAX_LENGTH) {
    return ['courseCode', `รหัสคอร์สไม่เกิน ${CODE_MAX_LENGTH} ตัวอักษร`];
  }
  if (form.receiptCourseName && String(form.receiptCourseName).length > NAME_MAX_LENGTH) {
    return ['receiptCourseName', `ชื่อในใบเสร็จไม่เกิน ${NAME_MAX_LENGTH} ตัวอักษร`];
  }
  if (form.courseCategory && String(form.courseCategory).length > CATEGORY_MAX_LENGTH) {
    return ['courseCategory', `หมวดหมู่ไม่เกิน ${CATEGORY_MAX_LENGTH} ตัวอักษร`];
  }

  if (form.salePrice != null && form.salePrice !== '') {
    const n = Number(form.salePrice);
    if (!Number.isFinite(n) || n < 0) return ['salePrice', 'ราคาขายต้องเป็นจำนวนไม่ติดลบ'];
  }
  if (form.salePriceInclVat != null && form.salePriceInclVat !== '') {
    const n = Number(form.salePriceInclVat);
    if (!Number.isFinite(n) || n < 0) return ['salePriceInclVat', 'ราคารวม VAT ต้องเป็นจำนวนไม่ติดลบ'];
  }
  if (form.time != null && form.time !== '') {
    const n = Number(form.time);
    if (!Number.isFinite(n) || n < 0) return ['time', 'เวลา (นาที) ต้องเป็นจำนวนไม่ติดลบ'];
  }
  if (form.orderBy != null && form.orderBy !== '') {
    const n = Number(form.orderBy);
    if (!Number.isFinite(n) || n < 0) return ['orderBy', 'ลำดับต้องเป็นจำนวนไม่ติดลบ'];
  }

  if (form.isVatIncluded != null && typeof form.isVatIncluded !== 'boolean') {
    return ['isVatIncluded', 'isVatIncluded ต้องเป็น boolean'];
  }
  if (form.status != null && !STATUS_OPTIONS.includes(form.status)) {
    return ['status', 'สถานะไม่ถูกต้อง'];
  }

  if (form.courseProducts != null) {
    if (!Array.isArray(form.courseProducts)) return ['courseProducts', 'courseProducts ต้องเป็น array'];
    for (const [i, p] of form.courseProducts.entries()) {
      if (!p || typeof p !== 'object' || Array.isArray(p)) {
        return ['courseProducts', `courseProducts[${i}] ต้องเป็น object`];
      }
      if (!p.productId || typeof p.productId !== 'string') {
        return ['courseProducts', `courseProducts[${i}].productId ต้องเป็น string`];
      }
      const q = Number(p.qty);
      if (!Number.isFinite(q) || q <= 0) {
        return ['courseProducts', `courseProducts[${i}].qty ต้องเป็นจำนวนบวก`];
      }
    }
  }

  return null;
}

export function emptyCourseForm() {
  return {
    courseName: '',
    courseCode: '',
    receiptCourseName: '',
    courseCategory: '',
    courseType: '',
    usageType: '',
    time: '',
    salePrice: '',
    salePriceInclVat: '',
    isVatIncluded: false,
    courseProducts: [],
    orderBy: '',
    status: 'ใช้งาน',
  };
}

export function normalizeCourse(form) {
  const trim = (v) => typeof v === 'string' ? v.trim() : '';
  const numOrNull = (v) => (v === '' || v == null) ? null : Number(v);
  return {
    ...form,
    courseName: trim(form.courseName),
    courseCode: trim(form.courseCode),
    receiptCourseName: trim(form.receiptCourseName),
    courseCategory: trim(form.courseCategory),
    courseType: trim(form.courseType),
    usageType: trim(form.usageType),
    time: numOrNull(form.time),
    salePrice: numOrNull(form.salePrice),
    salePriceInclVat: numOrNull(form.salePriceInclVat),
    isVatIncluded: !!form.isVatIncluded,
    courseProducts: Array.isArray(form.courseProducts)
      ? form.courseProducts.map(p => ({
          productId: trim(p.productId),
          productName: trim(p.productName),
          qty: Number(p.qty) || 0,
        })).filter(p => p.productId && p.qty > 0)
      : [],
    orderBy: numOrNull(form.orderBy),
    status: form.status || 'ใช้งาน',
  };
}

export function generateCourseId() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    return `COURSE-${Date.now().toString(36)}-${hex}`;
  }
  throw new Error('crypto.getRandomValues unavailable');
}
