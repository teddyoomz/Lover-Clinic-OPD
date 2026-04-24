// ─── Quotation validation — Phase 13.1.1 pure helpers ─────────────────────
// Triangle (Rule F, 2026-04-20): detailed-adminquotationcreate.json captured
// 6 forms — main (f0) POSTs to /admin/quotation with customer_id,
// quotation_date, discount + discount_type (%/บาท), note, seller_id (single,
// not 5 like sale). Sub-items split into 4 categories (courses/products/
// promotions/takeawayMeds), each with per-item qty + price + item_discount +
// item_discount_type + is_vat_included. Takeaway meds carry extra medication
// fields (dosage, administration method, administration times).
//
// OUR addition (not in ProClinic): `convertedToSaleId` + `convertedAt` fields
// + a `converted` status to support Phase 13.1.4 convert-to-sale flow.
//
// Rule E: OUR data in Firestore (be_quotations). No brokerClient import,
// no /api/proclinic/* call, no pc_quotations mirror.
//
// Invariants (strict mode):
//   QU-1 customerId required
//   QU-2 quotationDate required + YYYY-MM-DD format
//   QU-3 at least one sub-item across the 4 categories
//   QU-4 each sub-item has qty > 0 AND price >= 0
//   QU-5 header discountType in {'', 'percent', 'baht'};
//        discountType='percent' ⇒ discount ≤ 100
//   QU-6 per-item itemDiscountType in {'', 'percent', 'baht'};
//        itemDiscountType='percent' ⇒ itemDiscount ≤ 100
//   QU-7 status in STATUS_OPTIONS
//   QU-8 takeawayMed with administrationMethod='interval' requires
//        administrationMethodHour > 0
//   QU-9 status='converted' ⇒ convertedToSaleId + convertedAt required
//   QU-10 id format matches QUO-{MMYY}-{8hex} when present

export const STATUS_OPTIONS = Object.freeze([
  'draft', 'sent', 'accepted', 'rejected', 'expired', 'converted', 'cancelled',
]);
export const DISCOUNT_TYPE_OPTIONS = Object.freeze(['', 'percent', 'baht']);
export const DOSAGE_UNITS = Object.freeze([
  'เม็ด', 'ซีซี', 'ช้อนชา', 'ช้อนโต๊ะ', 'แคปซูล', 'หยด',
]);
export const ADMINISTRATION_METHODS = Object.freeze([
  'before_meal_30min', 'after_meal', 'interval',
]);
export const ADMINISTRATION_TIMES = Object.freeze([
  'morning', 'noon', 'evening', 'bedtime',
]);

const DATE_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const QUOTATION_ID_RE = /^QUO-\d{4}-[0-9a-f]{8}$/;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function trim(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function validateSubItemCommon(category, i, it) {
  if (!it || typeof it !== 'object') {
    return [category, `${category}[${i}] ต้องเป็น object`];
  }
  const qty = num(it.qty);
  if (!Number.isFinite(qty) || qty <= 0) {
    return [category, `${category}[${i}].qty ต้องเป็นจำนวนบวก`];
  }
  const price = num(it.price);
  if (!Number.isFinite(price) || price < 0) {
    return [category, `${category}[${i}].price ต้องไม่ติดลบ`];
  }
  const itemDiscount = num(it.itemDiscount ?? it.item_discount ?? 0);
  if (!Number.isFinite(itemDiscount) || itemDiscount < 0) {
    return [category, `${category}[${i}].itemDiscount ต้องไม่ติดลบ`];
  }
  const itemDiscountType = it.itemDiscountType ?? it.item_discount_type ?? '';
  if (itemDiscountType !== '' && itemDiscountType != null) {
    if (!DISCOUNT_TYPE_OPTIONS.includes(itemDiscountType)) {
      return [category, `${category}[${i}].itemDiscountType ไม่ถูกต้อง`];
    }
    if (itemDiscountType === 'percent' && itemDiscount > 100) {
      return [category, `${category}[${i}].itemDiscount (%) เกิน 100`];
    }
  }
  return null;
}

export function validateQuotationStrict(form) {
  if (!form || typeof form !== 'object' || Array.isArray(form)) {
    return ['form', 'missing form'];
  }

  const customerId = trim(form.customerId ?? form.customer_id);
  if (!customerId) return ['customerId', 'ต้องระบุ customerId'];

  const quotationDate = trim(form.quotationDate ?? form.quotation_date);
  if (!quotationDate) return ['quotationDate', 'ต้องระบุ quotationDate'];
  if (!DATE_ISO_RE.test(quotationDate)) {
    return ['quotationDate', 'quotationDate ต้องเป็น YYYY-MM-DD'];
  }

  const courses = Array.isArray(form.courses) ? form.courses : [];
  const products = Array.isArray(form.products) ? form.products : [];
  const promotions = Array.isArray(form.promotions) ? form.promotions : [];
  const takeawayMeds = Array.isArray(form.takeawayMeds) ? form.takeawayMeds : [];

  if (courses.length + products.length + promotions.length + takeawayMeds.length === 0) {
    return ['items', 'ใบเสนอราคาต้องมีรายการอย่างน้อย 1 รายการ'];
  }

  for (const [i, it] of courses.entries()) {
    const err = validateSubItemCommon('courses', i, it);
    if (err) return err;
    if (!trim(it.courseId ?? it.course_id)) {
      return ['courses', `courses[${i}] ต้องมี courseId`];
    }
  }
  for (const [i, it] of products.entries()) {
    const err = validateSubItemCommon('products', i, it);
    if (err) return err;
    if (!trim(it.productId ?? it.product_id)) {
      return ['products', `products[${i}] ต้องมี productId`];
    }
  }
  for (const [i, it] of promotions.entries()) {
    const err = validateSubItemCommon('promotions', i, it);
    if (err) return err;
    if (!trim(it.promotionId ?? it.promotion_id)) {
      return ['promotions', `promotions[${i}] ต้องมี promotionId`];
    }
  }
  for (const [i, it] of takeawayMeds.entries()) {
    const err = validateSubItemCommon('takeawayMeds', i, it);
    if (err) return err;
    if (!trim(it.productId ?? it.product_id)) {
      return ['takeawayMeds', `takeawayMeds[${i}] ต้องมี productId`];
    }
    const method = it.administrationMethod ?? it.administration_method;
    if (method && !ADMINISTRATION_METHODS.includes(method)) {
      return ['takeawayMeds', `takeawayMeds[${i}].administrationMethod ไม่ถูกต้อง`];
    }
    if (method === 'interval') {
      const hr = num(it.administrationMethodHour ?? it.administration_method_hour);
      if (!Number.isFinite(hr) || hr <= 0) {
        return ['takeawayMeds', `takeawayMeds[${i}] ทุกๆ ต้องระบุ administrationMethodHour > 0`];
      }
    }
    const dosageUnit = it.dosageUnit ?? it.dosage_unit;
    if (dosageUnit && !DOSAGE_UNITS.includes(dosageUnit)) {
      return ['takeawayMeds', `takeawayMeds[${i}].dosageUnit ไม่ถูกต้อง`];
    }
  }

  const discount = num(form.discount ?? 0);
  if (Number.isFinite(discount) && discount < 0) {
    return ['discount', 'discount ต้องไม่ติดลบ'];
  }
  const discountType = form.discountType ?? form.discount_type ?? '';
  if (discountType !== '' && discountType != null) {
    if (!DISCOUNT_TYPE_OPTIONS.includes(discountType)) {
      return ['discountType', 'discountType ไม่ถูกต้อง'];
    }
    if (discountType === 'percent' && discount > 100) {
      return ['discount', 'percent discount เกิน 100'];
    }
  }

  const status = form.status;
  if (status != null && !STATUS_OPTIONS.includes(status)) {
    return ['status', 'สถานะไม่ถูกต้อง'];
  }

  if (status === 'converted') {
    if (!trim(form.convertedToSaleId ?? form.converted_to_sale_id)) {
      return ['convertedToSaleId', 'status=converted ต้องมี convertedToSaleId'];
    }
    if (!form.convertedAt && !form.converted_at) {
      return ['convertedAt', 'status=converted ต้องมี convertedAt'];
    }
  }

  const id = trim(form.id);
  if (id && !QUOTATION_ID_RE.test(id)) {
    return ['id', 'id ต้องเป็น QUO-MMYY-8hex'];
  }

  return null;
}

export function emptyQuotationForm() {
  return {
    id: '',
    customerId: '',
    customerHN: '',
    customerName: '',
    quotationDate: '',
    sellerId: '',
    sellerName: '',
    note: '',
    discount: 0,
    discountType: '',
    courses: [],
    products: [],
    promotions: [],
    takeawayMeds: [],
    subtotal: 0,
    netTotal: 0,
    status: 'draft',
    convertedToSaleId: '',
    convertedAt: null,
    createdBy: '',
    branchId: '',
  };
}

export function normalizeQuotation(form) {
  if (!form || typeof form !== 'object' || Array.isArray(form)) return form;
  const out = { ...form };

  out.id = trim(out.id);
  out.customerId = trim(out.customerId ?? out.customer_id);
  out.customerHN = trim(out.customerHN ?? out.customer_hn);
  out.customerName = trim(out.customerName ?? out.customer_name);
  out.quotationDate = trim(out.quotationDate ?? out.quotation_date);
  out.sellerId = trim(out.sellerId ?? out.seller_id);
  out.sellerName = trim(out.sellerName ?? out.seller_name);
  out.note = trim(out.note);
  out.discount = Math.max(0, Number(out.discount) || 0);
  const rawDiscountType = out.discountType ?? out.discount_type ?? '';
  out.discountType = DISCOUNT_TYPE_OPTIONS.includes(rawDiscountType) ? rawDiscountType : '';

  const normCommon = (it) => ({
    qty: Math.max(0, Number(it?.qty) || 0),
    price: Math.max(0, Number(it?.price) || 0),
    itemDiscount: Math.max(0, Number(it?.itemDiscount ?? it?.item_discount) || 0),
    itemDiscountType: (() => {
      const raw = it?.itemDiscountType ?? it?.item_discount_type ?? '';
      return DISCOUNT_TYPE_OPTIONS.includes(raw) ? raw : '';
    })(),
    isVatIncluded: !!(it?.isVatIncluded ?? it?.is_vat_included),
  });

  out.courses = Array.isArray(out.courses) ? out.courses.map((it) => ({
    ...normCommon(it),
    courseId: trim(it?.courseId ?? it?.course_id),
    courseName: trim(it?.courseName ?? it?.course_name),
  })).filter((it) => it.courseId) : [];

  out.products = Array.isArray(out.products) ? out.products.map((it) => ({
    ...normCommon(it),
    productId: trim(it?.productId ?? it?.product_id),
    productName: trim(it?.productName ?? it?.product_name),
    isPremium: !!(it?.isPremium ?? it?.is_premium),
  })).filter((it) => it.productId) : [];

  out.promotions = Array.isArray(out.promotions) ? out.promotions.map((it) => ({
    ...normCommon(it),
    promotionId: trim(it?.promotionId ?? it?.promotion_id),
    promotionName: trim(it?.promotionName ?? it?.promotion_name),
  })).filter((it) => it.promotionId) : [];

  out.takeawayMeds = Array.isArray(out.takeawayMeds) ? out.takeawayMeds.map((it) => {
    const rawMethod = it?.administrationMethod ?? it?.administration_method;
    const method = ADMINISTRATION_METHODS.includes(rawMethod) ? rawMethod : '';
    const rawUnit = it?.dosageUnit ?? it?.dosage_unit;
    const dosageUnit = DOSAGE_UNITS.includes(rawUnit) ? rawUnit : '';
    const rawTimes = it?.administrationTimes ?? it?.administration_times;
    const administrationTimes = Array.isArray(rawTimes)
      ? rawTimes.filter((t) => ADMINISTRATION_TIMES.includes(t))
      : [];
    return {
      ...normCommon(it),
      productId: trim(it?.productId ?? it?.product_id),
      productName: trim(it?.productName ?? it?.product_name),
      isPremium: !!(it?.isPremium ?? it?.is_premium),
      genericName: trim(it?.genericName ?? it?.generic_name),
      indications: trim(it?.indications),
      dosageAmount: trim(it?.dosageAmount ?? it?.dosage_amount),
      dosageUnit,
      timesPerDay: trim(it?.timesPerDay ?? it?.times_per_day),
      administrationMethod: method,
      administrationMethodHour: method === 'interval'
        ? Math.max(0, Number(it?.administrationMethodHour ?? it?.administration_method_hour) || 0)
        : 0,
      administrationTimes,
    };
  }).filter((it) => it.productId) : [];

  out.subtotal = Math.max(0, Number(out.subtotal) || 0);
  out.netTotal = Math.max(0, Number(out.netTotal) || 0);
  out.status = STATUS_OPTIONS.includes(out.status) ? out.status : 'draft';
  out.convertedToSaleId = trim(out.convertedToSaleId ?? out.converted_to_sale_id);
  out.branchId = trim(out.branchId ?? out.branch_id);
  out.createdBy = trim(out.createdBy ?? out.created_by);

  return out;
}

export function generateQuotationId(nowMs = Date.now()) {
  if (typeof crypto === 'undefined' || !crypto.getRandomValues) {
    throw new Error('crypto.getRandomValues unavailable');
  }
  const thai = new Date(nowMs + 7 * 3600000);
  const mm = String(thai.getUTCMonth() + 1).padStart(2, '0');
  const yy = String(thai.getUTCFullYear()).slice(-2);
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `QUO-${mm}${yy}-${hex}`;
}
