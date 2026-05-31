// ─── Finance Utils — Pure calculation functions for Phase 7 ─────────────────
// Deposit / Wallet / Membership / Points / Billing
// No Firestore imports — all pure, safe for client + tests.

// M10: THB is stored to 2 decimal places. Multiplications (percent discounts,
// membership discounts) produce float results that must be rounded before
// storage or downstream arithmetic — otherwise tiny drifts accumulate across
// many sales and totals disagree with the sum-of-parts.
export function roundTHB(n) {
  const v = Number(n) || 0;
  return Math.round(v * 100) / 100;
}

// ─── Deposit ────────────────────────────────────────────────────────────────

/** ยอดคงเหลือของมัดจำ = amount - usedAmount (ไม่ต่ำกว่า 0) */
export function calcDepositRemaining(amount, usedAmount) {
  const a = Number(amount) || 0;
  const u = Number(usedAmount) || 0;
  return Math.max(0, a - u);
}

/**
 * คืน status ของมัดจำตาม usedAmount vs amount:
 *   usedAmount >= amount  → 'used'
 *   usedAmount > 0        → 'partial'
 *   else                  → 'active'
 * ไม่คำนึงถึง status พิเศษ (cancelled / refunded / expired) — caller เก็บ flag แยก
 */
export function calcDepositStatus(amount, usedAmount) {
  const a = Number(amount) || 0;
  const u = Number(usedAmount) || 0;
  if (u >= a && a > 0) return 'used';
  if (u > 0) return 'partial';
  return 'active';
}

// ─── Billing (for Phase 7 §11 SaleTab integration) ──────────────────────────
// Order of deductions matches ProClinic: coupon → discount → membership → deposit → wallet
// Points are NOT redeemed in sale (per §20.6) — removed from this calc.

export function calcSaleBilling({
  subtotal = 0,
  billDiscount = 0,
  billDiscountType = 'amount',
  membershipDiscountPercent = 0,
  depositApplied = 0,
  walletApplied = 0,
} = {}) {
  const sub = roundTHB(Math.max(0, Number(subtotal) || 0));
  const rawDiscount = Number(billDiscount) || 0;
  // M10: round after the percent multiplication so 12345 × 7.5% = 925.875
  // is stored as 925.88 (not left as a trailing binary-float).
  const discount = roundTHB(billDiscountType === 'percent'
    ? sub * rawDiscount / 100
    : rawDiscount);
  const afterDiscount = roundTHB(Math.max(0, sub - discount));

  const memPercent = Number(membershipDiscountPercent) || 0;
  const membershipDiscount = roundTHB(afterDiscount * memPercent / 100);
  const afterMembership = roundTHB(Math.max(0, afterDiscount - membershipDiscount));

  const dep = roundTHB(Math.min(Math.max(0, Number(depositApplied) || 0), afterMembership));
  const wal = roundTHB(Math.min(Math.max(0, Number(walletApplied) || 0), afterMembership - dep));

  const netTotal = roundTHB(Math.max(0, afterMembership - dep - wal));

  return {
    subtotal: sub,
    discount,
    afterDiscount,
    membershipDiscount,
    membershipDiscountPercent: memPercent,
    afterMembership,
    depositApplied: dep,
    walletApplied: wal,
    netTotal,
  };
}

// ─── Points ─────────────────────────────────────────────────────────────────

/** คะแนนที่ได้จากยอดซื้อ = floor(purchaseAmount / bahtPerPoint)
 *  bahtPerPoint <= 0 → 0 (membership card กำหนดให้ไม่สะสมคะแนน) */
export function calcPointsEarned(purchaseAmount, bahtPerPoint) {
  const p = Number(purchaseAmount) || 0;
  const b = Number(bahtPerPoint) || 0;
  if (b <= 0 || p <= 0) return 0;
  return Math.floor(p / b);
}

/** มูลค่าคะแนน = points * valuePerPoint */
export function calcPointsValue(points, valuePerPoint) {
  return (Number(points) || 0) * (Number(valuePerPoint) || 0);
}

// ─── Membership ─────────────────────────────────────────────────────────────

/** วันหมดอายุ = activatedAt + expiredInDays วัน (ISO string) */
export function calcMembershipExpiry(activatedAt, expiredInDays) {
  const base = activatedAt ? new Date(activatedAt) : new Date();
  const days = Number(expiredInDays) || 0;
  return new Date(base.getTime() + days * 86400000).toISOString();
}

/** บัตรหมดอายุหรือยัง (เทียบกับ now) */
export function isMembershipExpired(expiresAt) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

// ─── Formatting ─────────────────────────────────────────────────────────────

export function fmtMoney(n) {
  return Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function fmtPoints(n) {
  return Number(n || 0).toLocaleString('th-TH');
}

// ─── Sale actual-paid resolvers (2026-05-31, spec Q1=A) ───────────────────────
// resolveSalePaidAmount(sale) — money actually received on a sale.
// Rule R diag 2026-05-31: 35/35 recent real sales (form + OPD treatment) store the
// paid amount in payment.channels; 0 use totalPaidAmount (only markSalePaid writes
// it). Primary = Σ channels; totalPaidAmount = legacy/edge fallback; else 0.
// Same formula as the pay-modal "ยอดค้าง" + markSalePaid (Rule of 3 → canonical here).
export function resolveSalePaidAmount(sale) {
  const channels = sale?.payment?.channels;
  if (Array.isArray(channels) && channels.length > 0) {
    return roundTHB(channels.reduce((s, c) => s + (parseFloat(c?.amount) || 0), 0));
  }
  const tpa = Number(sale?.totalPaidAmount);
  if (Number.isFinite(tpa)) return roundTHB(tpa);
  return 0;
}

// Unpaid remainder (never negative).
export function resolveSaleOutstanding(sale) {
  const net = Number(sale?.billing?.netTotal ?? sale?.netTotal) || 0;
  return Math.max(0, roundTHB(net - resolveSalePaidAmount(sale)));
}

// Color tone for the ยอดชำระจริง cell: 'full' | 'partial' | 'zero'.
// 'full' covers paid-in-full incl 0฿ (paid 0 >= net 0).
export function resolveSalePaidTone(paid, net) {
  const p = Number(paid) || 0;
  const n = Number(net) || 0;
  if (p + 0.01 >= n) return 'full';
  if (p > 0) return 'partial';
  return 'zero';
}
