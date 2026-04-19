// ─── Coupon validation — pure functions (Phase 9) ───────────────────────────
// Extracted from CouponFormModal so the business rules can be unit-tested
// without rendering React.

export function validateCoupon(form) {
  if (!form || typeof form !== 'object') return ['form', 'missing form'];

  if (!String(form.coupon_name || '').trim()) return ['coupon_name', 'กรุณากรอกชื่อคูปอง'];
  if (!String(form.coupon_code || '').trim()) return ['coupon_code', 'กรุณากรอกโค้ดส่วนลด'];

  const d = Number(form.discount);
  if (!Number.isFinite(d) || d < 0.01) return ['discount', 'ส่วนลดต้อง ≥ 0.01'];
  if (form.discount_type === 'percent' && d > 100) {
    return ['discount', 'ส่วนลด % ต้อง ≤ 100'];
  }

  const q = Number(form.max_qty);
  if (!Number.isFinite(q) || q < 0 || Math.floor(q) !== q) return ['max_qty', 'จำนวนต้องเป็นจำนวนเต็ม ≥ 0'];

  if (!form.start_date) return ['start_date', 'กรุณาเลือกวันเริ่ม'];
  if (!form.end_date) return ['end_date', 'กรุณาเลือกวันสิ้นสุด'];
  if (form.end_date < form.start_date) return ['end_date', 'วันสิ้นสุดต้องมากกว่าหรือเท่ากับวันเริ่ม'];

  return null;
}

export function emptyCouponForm() {
  return {
    coupon_name: '',
    coupon_code: '',
    discount: '',
    discount_type: 'percent',
    max_qty: 1,
    is_limit_per_user: false,
    start_date: '',
    end_date: '',
    description: '',
    branch_ids: [],
  };
}

// Hardcoded branch list — 5 branches captured from /admin/coupon intel
// (2026-04-19). IDs are ProClinic branch DB keys — verify on live submit.
export const COUPON_BRANCHES = [
  { id: 28, name: 'ชลบุรี' },
  { id: 29, name: 'พระราม9' },
  { id: 30, name: 'ราชพฤกษ์' },
  { id: 31, name: 'สุขุมวิท' },
  { id: 32, name: 'สยาม' },
];
