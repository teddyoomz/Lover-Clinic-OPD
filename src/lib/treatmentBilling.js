// ─── Treatment Billing Calculator — T5.b (2026-04-26) ───────────────────
// Pure helper extracted from TreatmentFormPage's `billing` useMemo so it
// can be unit-tested independently of the 4676-line component. The
// calculation chain is:
//
//   subtotal      = sum of purchased items + medications (non-premium) + consumables
//   medDisc       = medSubtotal × medDiscountPercent (or override amount)
//   afterMedDisc  = subtotal - medDisc
//   billDiscAmt   = afterMedDisc × billDiscount% (or fixed amount)
//   afterDiscount = afterMedDisc - billDiscAmt
//   insDed        = insurance claim amount (if claimed)
//   memDisc       = (afterDiscount - insDed) × membershipPercent  (backend mode)
//   afterMember   = afterDiscount - insDed - memDisc
//   depDed        = deposit amount applied (backend: sum selectedDeposits, legacy: depositAmount)
//   walDed        = wallet amount applied (capped at remaining)
//   netTotal      = max(0, afterMember - depDed - walDed)  (backend)
//                 = max(0, afterDiscount - insDed - depDed - walDed)  (legacy)
//
// Pure: input → output, no side effects, no React imports.

/**
 * @typedef {Object} TreatmentBillingInput
 * @property {Array} purchasedItems      [{ name, unitPrice, qty }]
 * @property {Array} medications         [{ name, unitPrice, qty, isPremium }]
 * @property {Array} consumables         [{ name, unitPrice, qty }]
 * @property {string|number} medDiscountOverride - explicit baht override (empty → use percent)
 * @property {string|number} billDiscount        - bill-level discount value
 * @property {'percent'|'amount'} billDiscountType
 * @property {boolean} isInsuranceClaimed
 * @property {string|number} insuranceClaimAmount
 * @property {boolean} isBackend                 - true → use backend mode (membership + selectedDeposits + selectedWallet)
 * @property {Array} [selectedDeposits]          - backend only: [{ amount }]
 * @property {{amount: number}|null} [selectedWallet] - backend only
 * @property {{discountPercent: number}|null} [backendActiveMembership]
 * @property {{medicineDiscountPercent: number|string}|null} [options]
 * @property {boolean} [useDeposit]              - legacy mode: deposit checkbox state
 * @property {string|number} [depositAmount]     - legacy mode
 * @property {boolean} [useWallet]               - legacy mode
 * @property {string|number} [walletAmount]      - legacy mode
 */

/**
 * @typedef {Object} TreatmentBillingResult
 * @property {Array} lines              - billing line items [{ name, amount, type }]
 * @property {number} subtotal
 * @property {number} medSubtotal
 * @property {number} medDiscPct        - medicine discount % from settings
 * @property {number} medDisc           - applied medicine discount baht
 * @property {number} billDiscAmt       - applied bill-level discount baht
 * @property {number} afterDiscount
 * @property {number} insDed            - insurance deduction
 * @property {number} membershipDisc    - membership discount baht (backend only)
 * @property {number} memPct            - membership % (backend only)
 * @property {number} afterMembership
 * @property {number} depDed            - deposit deduction
 * @property {number} walDed            - wallet deduction
 * @property {number} netTotal
 */

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const intNum = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
};
const max0 = (n) => (n > 0 ? n : 0);

/**
 * Compute the full treatment billing breakdown.
 * @param {TreatmentBillingInput} input
 * @returns {TreatmentBillingResult}
 */
export function computeTreatmentBilling(input = {}) {
  const {
    purchasedItems = [],
    medications = [],
    consumables = [],
    medDiscountOverride = '',
    billDiscount = '',
    billDiscountType = 'amount',
    isInsuranceClaimed = false,
    insuranceClaimAmount = '',
    isBackend = false,
    selectedDeposits = [],
    selectedWallet = null,
    backendActiveMembership = null,
    options = null,
    useDeposit = false,
    depositAmount = '',
    useWallet = false,
    walletAmount = '',
  } = input;

  const lines = [];
  (Array.isArray(purchasedItems) ? purchasedItems : []).forEach((p) => {
    if (!p) return;
    const amount = num(p.unitPrice) * (intNum(p.qty) || 1);
    if (amount > 0) lines.push({ name: p.name || '', amount, type: 'item' });
  });
  (Array.isArray(medications) ? medications : []).forEach((m) => {
    if (!m || !m.name) return;
    if (num(m.unitPrice) <= 0) return;
    if (m.isPremium) return;
    lines.push({ name: m.name, amount: num(m.unitPrice) * (intNum(m.qty) || 1), type: 'med' });
  });
  (Array.isArray(consumables) ? consumables : []).forEach((c) => {
    if (!c || !c.name) return;
    const amount = num(c.unitPrice) * (intNum(c.qty) || 1);
    if (amount > 0) lines.push({ name: c.name, amount, type: 'cons' });
  });

  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const medSubtotal = lines.filter((l) => l.type === 'med').reduce((s, l) => s + l.amount, 0);
  const medDiscPct = num(options?.medicineDiscountPercent);
  const medDisc = medDiscountOverride !== '' && medDiscountOverride !== null && medDiscountOverride !== undefined
    ? num(medDiscountOverride)
    : (medSubtotal * medDiscPct) / 100;
  const afterMedDisc = max0(subtotal - medDisc);

  const billDiscAmt = billDiscountType === 'percent'
    ? (afterMedDisc * num(billDiscount)) / 100
    : num(billDiscount);
  const afterDiscount = max0(afterMedDisc - billDiscAmt);

  const insDed = isInsuranceClaimed ? num(insuranceClaimAmount) : 0;
  const memPct = isBackend ? num(backendActiveMembership?.discountPercent) : 0;
  const afterIns = max0(afterDiscount - insDed);
  const membershipDisc = (afterIns * memPct) / 100;
  const afterMembership = max0(afterIns - membershipDisc);

  const backendDepDed = isBackend
    ? selectedDeposits.reduce((s, d) => s + num(d?.amount), 0)
    : 0;
  const legacyDepDed = useDeposit ? num(depositAmount) : 0;
  const depDed = isBackend ? backendDepDed : legacyDepDed;
  const afterDepDed = isBackend
    ? max0(afterMembership - depDed)
    : max0(afterDiscount - insDed - depDed);

  const backendWalDed = isBackend ? Math.min(num(selectedWallet?.amount), afterDepDed) : 0;
  const legacyWalDed = useWallet ? num(walletAmount) : 0;
  const walDed = isBackend ? backendWalDed : legacyWalDed;

  const netTotal = isBackend
    ? max0(afterDepDed - walDed)
    : max0(afterDiscount - insDed - depDed - walDed);

  return {
    lines,
    subtotal,
    medSubtotal,
    medDiscPct,
    medDisc,
    billDiscAmt,
    afterDiscount,
    insDed,
    membershipDisc,
    memPct,
    afterMembership,
    depDed,
    walDed,
    netTotal,
  };
}

/**
 * Format a number as Thai baht with 2 decimal places.
 * @param {number} n
 * @returns {string}
 */
export function formatBaht(n) {
  return Number(n || 0).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Compute BMI from weight (kg) + height (cm). Returns string with 1 decimal,
 * or empty string when either input is missing/invalid.
 *
 * BMI = weight / (height_meters)²
 */
export function computeBmi(weightKg, heightCm) {
  const w = num(weightKg);
  const h = num(heightCm);
  if (w <= 0 || h <= 0) return '';
  const meters = h / 100;
  return (w / (meters * meters)).toFixed(1);
}
