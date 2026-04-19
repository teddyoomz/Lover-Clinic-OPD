// ─── Voucher validation — pure functions (Phase 9) ──────────────────────────

export const VOUCHER_PLATFORMS = ['HDmall', 'GoWabi', 'SkinX', 'Shopee', 'Tiktok'];

export function validateVoucher(form) {
  if (!form || typeof form !== 'object') return ['form', 'missing form'];

  if (typeof form.voucher_name !== 'string' || !form.voucher_name.trim()) {
    return ['voucher_name', 'กรุณากรอกชื่อ Voucher'];
  }

  const sp = Number(form.sale_price);
  if (!Number.isFinite(sp) || sp < 0) return ['sale_price', 'ราคาขายต้อง ≥ 0'];

  const cp = Number(form.commission_percent);
  if (!Number.isFinite(cp) || cp < 0) return ['commission_percent', '% ค่าธรรมเนียมต้อง ≥ 0'];
  if (cp > 100) return ['commission_percent', '% ค่าธรรมเนียมต้อง ≤ 100'];

  if (form.platform && !VOUCHER_PLATFORMS.includes(form.platform)) {
    return ['platform', `platform ต้องเป็นหนึ่งใน: ${VOUCHER_PLATFORMS.join(', ')}`];
  }

  if (form.has_period) {
    if (!form.period_start) return ['period_start', 'กรุณาเลือกวันเริ่ม'];
    if (!form.period_end) return ['period_end', 'กรุณาเลือกวันสิ้นสุด'];
    if (form.period_end < form.period_start) return ['period_end', 'วันสิ้นสุดต้องมากกว่าหรือเท่ากับวันเริ่ม'];
  }

  return null;
}

export function emptyVoucherForm() {
  return {
    usage_type: 'clinic',
    voucher_name: '',
    sale_price: '',
    commission_percent: '',
    has_period: false,
    period_start: '',
    period_end: '',
    platform: '',
    description: '',
    status: 'active',
  };
}
