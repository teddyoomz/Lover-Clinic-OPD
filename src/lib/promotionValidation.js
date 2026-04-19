// ─── Promotion validation — pure functions (Phase 9) ───────────────────────
// Extracted from PromotionFormModal so the business rules can be unit-tested
// without rendering React. Returned shape matches the `scrollToError`
// convention: [fieldName, errorMessage] on failure, null on pass.

export function validatePromotion(form) {
  if (!form || typeof form !== 'object') return ['form', 'missing form'];

  // Type-safe check: rejects non-strings (null, undefined, object, function,
  // number, boolean). Test P7/P8/P15/MF8/MF15 depended on this.
  if (typeof form.promotion_name !== 'string' || !form.promotion_name.trim()) {
    return ['promotion_name', 'กรุณากรอกชื่อโปรโมชัน'];
  }

  // sale_price: numeric coercion OK for string-digits like "123"; Number()
  // of non-numerics returns NaN which is rejected below.
  const sp = Number(form.sale_price);
  if (!Number.isFinite(sp) || sp < 0) {
    return ['sale_price', 'ราคาขายต้อง ≥ 0'];
  }

  if (form.promotion_type === 'flexible') {
    const minC = Number(form.min_course_chosen_count) || 0;
    const maxC = Number(form.max_course_chosen_count) || 0;
    if (minC > maxC) return ['min_course_chosen_count', 'จำนวนคอร์ส: ต่ำสุดต้อง ≤ สูงสุด'];

    const minQ = Number(form.min_course_chosen_qty) || 0;
    const maxQ = Number(form.max_course_chosen_qty) || 0;
    if (minQ > maxQ) return ['min_course_chosen_qty', 'จำนวนครั้ง: ต่ำสุดต้อง ≤ สูงสุด'];
  }

  if (form.has_promotion_period) {
    if (!form.promotion_period_start) return ['promotion_period_start', 'กรุณาเลือกวันเริ่ม'];
    if (!form.promotion_period_end) return ['promotion_period_end', 'กรุณาเลือกวันสิ้นสุด'];
    if (form.promotion_period_end < form.promotion_period_start) {
      return ['promotion_period_end', 'วันสิ้นสุดต้องมากกว่าหรือเท่ากับวันเริ่ม'];
    }
  }

  return null;
}

export function emptyPromotionForm() {
  return {
    usage_type: 'clinic',
    promotion_name: '',
    receipt_promotion_name: '',
    promotion_code: '',
    category_name: '',
    procedure_type_name: '',
    deposit_price: '',
    sale_price: '',
    is_vat_included: false,
    sale_price_incl_vat: '',
    promotion_type: 'fixed',
    min_course_chosen_count: 1,
    max_course_chosen_count: 1,
    min_course_chosen_qty: 1,
    max_course_chosen_qty: 1,
    has_promotion_period: false,
    promotion_period_start: '',
    promotion_period_end: '',
    description: '',
    status: 'active',
    enable_line_oa_display: false,
    is_price_line_display: true,
    button_label: '',
  };
}
