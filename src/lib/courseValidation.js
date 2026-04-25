// ─── Course validation — Phase 12.2 pure helpers ───────────────────────────
// Triangle (Rule F/F-bis, refreshed 2026-04-24): `opd.js forms /admin/course/
// {id}/edit` captured the full ProClinic course form. Phase 12.2b (the retro
// gap-close) expands OUR schema to mirror ProClinic's field set so we can
// replicate the course-edit page end-to-end (4 course types + VAT /
// deduct-cost / validity / repeat / secondary products / DF flags).
//
// All new fields are OPTIONAL — existing be_courses docs keep working
// unchanged; missing fields normalize to defaults (empty, 0, false, or
// the first enum value).

export const STATUS_OPTIONS = Object.freeze(['ใช้งาน', 'พักใช้งาน']);

// Phase 12.2b: ProClinic's 4 course types — stored as Thai strings
// verbatim so our docs round-trip through ProClinic sync without mapping
// loss. Display labels in the UI come from COURSE_TYPE_LABEL below.
export const COURSE_TYPE_OPTIONS = Object.freeze([
  'ระบุสินค้าและจำนวนสินค้า',  // specific products + fixed qty (most common)
  'บุฟเฟต์',                     // buffet — unlimited within validity window
  'เหมาตามจริง',                 // real-qty — no qty pre-set, doctor fills at treatment
  'เลือกสินค้าตามจริง',           // choose-at-treatment — products picked at treatment time
]);

export const COURSE_TYPE_LABEL = Object.freeze({
  'ระบุสินค้าและจำนวนสินค้า': 'ระบุสินค้าและจำนวนสินค้า',
  'บุฟเฟต์': 'บุฟเฟต์',
  'เหมาตามจริง': 'เหมาตามจริง',
  'เลือกสินค้าตามจริง': 'เลือกสินค้าตามจริง',
});

// Phase 12.2b: usage_type — scope of course availability.
export const USAGE_TYPE_OPTIONS = Object.freeze(['ระดับคลินิก', 'ระดับสาขา']);

export const NAME_MAX_LENGTH = 200;
export const CODE_MAX_LENGTH = 50;
export const CATEGORY_MAX_LENGTH = 100;
export const PROCEDURE_TYPE_MAX_LENGTH = 100;

function numOrNull(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function validateNonNeg(val, fieldName, labelThai) {
  if (val == null || val === '') return null;
  const n = Number(val);
  if (!Number.isFinite(n) || n < 0) {
    return [fieldName, `${labelThai}ต้องเป็นจำนวนไม่ติดลบ`];
  }
  return null;
}

// ─── Phase 14.7.H follow-up E (V12.2b deferred — period enforcement) ─────
// Day-count fields (period, daysBeforeExpire) must be non-negative INTEGER
// ≤ 3650 (10 years) when set. Empty/null = "ไม่จำกัด" (unlimited) — valid.
// Decimals + over-bound + non-numeric all rejected at save-time.
//
// Without integer enforcement, users can save period=7.5 → no UI parses
// that correctly downstream; without max bound, a typo (period=730000)
// silently locks the buffet for 2000 years.
function validateDayInteger(val, fieldName, labelThai) {
  if (val == null || val === '') return null; // empty = unlimited (valid)
  const n = Number(val);
  if (!Number.isFinite(n)) {
    return [fieldName, `${labelThai}ต้องเป็นตัวเลข`];
  }
  if (n < 0) {
    return [fieldName, `${labelThai}ต้องเป็นจำนวนไม่ติดลบ`];
  }
  if (!Number.isInteger(n)) {
    return [fieldName, `${labelThai}ต้องเป็นจำนวนเต็ม (จำนวนวัน)`];
  }
  if (n > 3650) {
    return [fieldName, `${labelThai}ต้องไม่เกิน 3650 วัน (~10 ปี)`];
  }
  return null;
}

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
  if (form.procedureType && String(form.procedureType).length > PROCEDURE_TYPE_MAX_LENGTH) {
    return ['procedureType', `ประเภทหัตถการไม่เกิน ${PROCEDURE_TYPE_MAX_LENGTH} ตัวอักษร`];
  }

  // Phase 12.2b: courseType must match ProClinic's enum when set. Empty
  // string is allowed (legacy data pre-12.2b) and normalize falls back to
  // 'ระบุสินค้าและจำนวนสินค้า'.
  if (form.courseType && !COURSE_TYPE_OPTIONS.includes(form.courseType)) {
    return ['courseType', 'ประเภทคอร์สไม่ถูกต้อง'];
  }
  if (form.usageType && !USAGE_TYPE_OPTIONS.includes(form.usageType)) {
    return ['usageType', 'ระดับการใช้งานไม่ถูกต้อง'];
  }

  const numFail =
    validateNonNeg(form.salePrice, 'salePrice', 'ราคาขาย')
    || validateNonNeg(form.salePriceInclVat, 'salePriceInclVat', 'ราคารวม VAT ')
    || validateNonNeg(form.deductCost, 'deductCost', 'หักต้นทุนก่อนค่ามือ')
    || validateNonNeg(form.time, 'time', 'เวลา (นาที) ')
    || validateNonNeg(form.orderBy, 'orderBy', 'ลำดับ')
    || validateNonNeg(form.mainQty, 'mainQty', 'จำนวนสินค้าหลัก')
    || validateNonNeg(form.qtyPerTime, 'qtyPerTime', 'จำนวนที่ใช้ต่อครั้ง')
    || validateNonNeg(form.minQty, 'minQty', 'จำนวนต่ำสุดที่เลือกได้')
    || validateNonNeg(form.maxQty, 'maxQty', 'จำนวนสูงสุดที่เลือกได้');
  if (numFail) return numFail;

  // Phase 14.7.H follow-up E (V12.2b deferred): day-count fields are
  // strict-integer + bounded — replaces the loose validateNonNeg checks.
  const periodFail = validateDayInteger(form.period, 'period', 'ระยะเวลาทำซ้ำ');
  if (periodFail) return periodFail;
  const dbeFail = validateDayInteger(form.daysBeforeExpire, 'daysBeforeExpire', 'ระยะเวลาใช้งานหลังซื้อ');
  if (dbeFail) return dbeFail;

  // Buffet courses MUST have a validity window (daysBeforeExpire > 0).
  // Without it, the buffet has no expiry → use forever (financially dangerous).
  // The CourseFormModal already shows "บุฟเฟต์ใช้ได้จนครบกำหนด" hint at line 452;
  // this validator enforces the implicit business rule.
  if (isBuffetCourse(form.courseType)) {
    const dbe = numOrNull(form.daysBeforeExpire);
    if (dbe == null || dbe <= 0) {
      return ['daysBeforeExpire', 'บุฟเฟต์ต้องระบุระยะเวลาใช้งานหลังซื้อ (มากกว่า 0 วัน)'];
    }
  }

  // min_qty ≤ max_qty (when both present)
  const min = numOrNull(form.minQty);
  const max = numOrNull(form.maxQty);
  if (min != null && max != null && min > max) {
    return ['minQty', 'จำนวนต่ำสุดต้องไม่เกินจำนวนสูงสุด'];
  }

  for (const f of ['isVatIncluded', 'isDf', 'dfEditableGlobal', 'isHidden']) {
    if (form[f] != null && typeof form[f] !== 'boolean') {
      return [f, `${f} ต้องเป็น boolean`];
    }
  }
  if (form.status != null && !STATUS_OPTIONS.includes(form.status)) {
    return ['status', 'สถานะไม่ถูกต้อง'];
  }

  // Sub-items (courseProducts[]) — each row mirrors ProClinic's secondary
  // products table: productId + per-time qty + min/max + 3 flags.
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
      // Phase 12.2b: min/max on sub-item — optional but must be non-neg
      // numbers when set, and minQty ≤ maxQty.
      for (const f of ['minQty', 'maxQty', 'qtyPerTime']) {
        if (p[f] != null && p[f] !== '') {
          const n = Number(p[f]);
          if (!Number.isFinite(n) || n < 0) {
            return ['courseProducts', `courseProducts[${i}].${f} ต้องไม่ติดลบ`];
          }
        }
      }
      const pmin = numOrNull(p.minQty);
      const pmax = numOrNull(p.maxQty);
      if (pmin != null && pmax != null && pmin > pmax) {
        return ['courseProducts', `courseProducts[${i}] ต่ำสุดต้องไม่เกินสูงสุด`];
      }
      for (const bf of ['isRequired', 'isDf', 'isHidden']) {
        if (p[bf] != null && typeof p[bf] !== 'boolean') {
          return ['courseProducts', `courseProducts[${i}].${bf} ต้องเป็น boolean`];
        }
      }
    }
  }

  return null;
}

export function emptyCourseForm() {
  return {
    // Identity + metadata
    courseName: '',
    courseCode: '',
    receiptCourseName: '',
    courseCategory: '',
    procedureType: '',              // Phase 12.2b
    // Type + usage
    courseType: 'ระบุสินค้าและจำนวนสินค้า', // Phase 12.2b default = most common
    usageType: 'ระดับคลินิก',        // Phase 12.2b default
    // Pricing
    salePrice: '',
    salePriceInclVat: '',
    isVatIncluded: false,
    deductCost: '',                  // Phase 12.2b — หักต้นทุนก่อนคำนวณค่ามือ
    // Main product + quantities
    mainProductId: '',               // Phase 12.2b — primary product_id
    mainProductName: '',             // denormalized for display round-trip
    mainQty: '',                     // Phase 12.2b — total qty
    qtyPerTime: '',                  // Phase 12.2b — จำนวนที่ใช้ต่อครั้ง
    minQty: '',                      // Phase 12.2b — จำนวนต่ำสุดที่เลือกได้
    maxQty: '',                      // Phase 12.2b — จำนวนสูงสุดที่เลือกได้
    // Duration
    daysBeforeExpire: '',            // Phase 12.2b — validity days
    period: '',                      // Phase 12.2b — repeat period
    time: '',                        // legacy (minute duration) — kept for compat
    // Flags
    isDf: true,                      // Phase 12.2b — "มีค่ามือ" default on
    dfEditableGlobal: false,         // Phase 12.2b — "อนุญาตให้ทุกคนแก้ไขค่ามือ"
    isHidden: false,                 // Phase 12.2b — "ซ่อนการขาย"
    // Sub-items (secondary products)
    courseProducts: [],
    // Misc
    orderBy: '',
    status: 'ใช้งาน',
  };
}

export function normalizeCourse(form) {
  const trim = (v) => typeof v === 'string' ? v.trim() : '';
  return {
    ...form,
    courseName: trim(form.courseName),
    courseCode: trim(form.courseCode),
    receiptCourseName: trim(form.receiptCourseName),
    courseCategory: trim(form.courseCategory),
    procedureType: trim(form.procedureType),
    // Phase 12.2b: courseType falls back to the "specific qty" default
    // when missing or unknown — same contract ProClinic uses for legacy
    // courses imported pre-enum.
    courseType: COURSE_TYPE_OPTIONS.includes(form.courseType)
      ? form.courseType
      : 'ระบุสินค้าและจำนวนสินค้า',
    usageType: USAGE_TYPE_OPTIONS.includes(form.usageType)
      ? form.usageType
      : 'ระดับคลินิก',
    time: numOrNull(form.time),
    salePrice: numOrNull(form.salePrice),
    salePriceInclVat: numOrNull(form.salePriceInclVat),
    isVatIncluded: !!form.isVatIncluded,
    deductCost: numOrNull(form.deductCost),
    mainProductId: trim(form.mainProductId),
    mainProductName: trim(form.mainProductName),
    mainQty: numOrNull(form.mainQty),
    qtyPerTime: numOrNull(form.qtyPerTime),
    minQty: numOrNull(form.minQty),
    maxQty: numOrNull(form.maxQty),
    daysBeforeExpire: numOrNull(form.daysBeforeExpire),
    period: numOrNull(form.period),
    isDf: form.isDf == null ? true : !!form.isDf,
    dfEditableGlobal: !!form.dfEditableGlobal,
    isHidden: !!form.isHidden,
    courseProducts: Array.isArray(form.courseProducts)
      ? form.courseProducts.map(p => ({
          productId: trim(p.productId),
          productName: trim(p.productName),
          qty: Number(p.qty) || 0,
          qtyPerTime: numOrNull(p.qtyPerTime),
          minQty: numOrNull(p.minQty),
          maxQty: numOrNull(p.maxQty),
          isRequired: !!p.isRequired,
          isDf: p.isDf == null ? true : !!p.isDf,
          isHidden: !!p.isHidden,
        })).filter(p => p.productId && p.qty > 0)
      : [],
    orderBy: numOrNull(form.orderBy),
    status: STATUS_OPTIONS.includes(form.status) ? form.status : 'ใช้งาน',
  };
}

// Phase 12.2b helpers — course-type-aware treatment flow gates.
// TreatmentFormPage + DfEntryModal consult these to skip / alter behavior
// based on the course's type.
export function isRealQtyCourse(courseType) {
  return courseType === 'เหมาตามจริง';
}
export function isBuffetCourse(courseType) {
  return courseType === 'บุฟเฟต์';
}
export function isPickAtTreatmentCourse(courseType) {
  return courseType === 'เลือกสินค้าตามจริง';
}
export function isSpecificQtyCourse(courseType) {
  return !courseType || courseType === 'ระบุสินค้าและจำนวนสินค้า';
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
