// ─── Finance Utils — Pure calculation functions for Phase 7 ─────────────────
// Deposit / Wallet / Membership / Points / Billing
// No Firestore imports — all pure, safe for client + tests.

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
  const sub = Math.max(0, Number(subtotal) || 0);
  const rawDiscount = Number(billDiscount) || 0;
  const discount = billDiscountType === 'percent'
    ? sub * rawDiscount / 100
    : rawDiscount;
  const afterDiscount = Math.max(0, sub - discount);

  const memPercent = Number(membershipDiscountPercent) || 0;
  const membershipDiscount = afterDiscount * memPercent / 100;
  const afterMembership = Math.max(0, afterDiscount - membershipDiscount);

  const dep = Math.min(Math.max(0, Number(depositApplied) || 0), afterMembership);
  const wal = Math.min(Math.max(0, Number(walletApplied) || 0), afterMembership - dep);

  const netTotal = Math.max(0, afterMembership - dep - wal);

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
