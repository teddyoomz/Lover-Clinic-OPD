// T5.b (Phase 14.4 G5 follow-up) — TFP refactor: pure billing calculator
//
// User directive (this session, P1-P3): "ทำทั้งหมด" → T5.b TFP refactor.
// First extraction: `billing` useMemo + BMI useMemo lifted from
// TreatmentFormPage.jsx (4676 LOC) into pure helpers in
// src/lib/treatmentBilling.js. Pure helpers are unit-testable without
// mounting the whole 119-useState component.
//
// Refactor contract: computeTreatmentBilling MUST produce the SAME shape
// + numeric output as the previous inline useMemo. Tests below mirror
// every branch of the original code (medicine discount with override vs
// percent, bill discount percent vs amount, insurance + membership +
// deposit + wallet stacking in BOTH backend mode + legacy mode).

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { computeTreatmentBilling, computeBmi, formatBaht } from '../src/lib/treatmentBilling.js';

const TFP_SRC = readFileSync('src/components/TreatmentFormPage.jsx', 'utf8');

// ─── B1 — computeBmi ───────────────────────────────────────────────────
describe('B1 computeBmi', () => {
  test('B1.1 returns 1-decimal BMI for valid inputs', () => {
    expect(computeBmi(70, 175)).toBe('22.9');
  });
  test('B1.2 handles string inputs', () => {
    expect(computeBmi('60', '160')).toBe('23.4');
  });
  test('B1.3 returns empty for missing/invalid', () => {
    expect(computeBmi('', '160')).toBe('');
    expect(computeBmi(0, 160)).toBe('');
    expect(computeBmi(70, 0)).toBe('');
    expect(computeBmi(NaN, 160)).toBe('');
    expect(computeBmi(70, 'abc')).toBe('');
  });
  test('B1.4 negative values produce empty (no crash)', () => {
    expect(computeBmi(-1, 160)).toBe('');
    expect(computeBmi(70, -160)).toBe('');
  });
});

// ─── B2 — formatBaht ───────────────────────────────────────────────────
describe('B2 formatBaht', () => {
  test('B2.1 rounds to 2 decimals', () => {
    expect(formatBaht(1234.5)).toMatch(/1,234\.50/);
  });
  test('B2.2 thousands separator (Thai locale or comma; en-US fallback)', () => {
    const out = formatBaht(1234567.89);
    expect(out).toMatch(/1[,]?234[,]?567\.89/);
  });
  test('B2.3 zero / null / undefined → "0.00"', () => {
    expect(formatBaht(0)).toMatch(/0\.00/);
    expect(formatBaht(null)).toMatch(/0\.00/);
    expect(formatBaht(undefined)).toMatch(/0\.00/);
  });
});

// ─── B3 — computeTreatmentBilling: lines + subtotal ────────────────────
describe('B3 computeTreatmentBilling lines + subtotal', () => {
  test('B3.1 empty input → all zeros', () => {
    const r = computeTreatmentBilling({});
    expect(r.lines).toEqual([]);
    expect(r.subtotal).toBe(0);
    expect(r.netTotal).toBe(0);
  });

  test('B3.2 purchasedItems multiply unitPrice × qty', () => {
    const r = computeTreatmentBilling({
      purchasedItems: [{ name: 'Filler', unitPrice: 5000, qty: 2 }],
    });
    expect(r.subtotal).toBe(10000);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]).toEqual({ name: 'Filler', amount: 10000, type: 'item' });
  });

  test('B3.3 medications: skips premium + 0-price + nameless', () => {
    const r = computeTreatmentBilling({
      medications: [
        { name: 'Real', unitPrice: 100, qty: 2 },              // 200
        { name: 'Premium', unitPrice: 200, qty: 1, isPremium: true }, // 0
        { name: 'Free', unitPrice: 0, qty: 1 },                // 0
        { name: '',     unitPrice: 50, qty: 1 },               // 0
      ],
    });
    expect(r.subtotal).toBe(200);
    expect(r.medSubtotal).toBe(200);
  });

  test('B3.4 consumables included if name + price > 0', () => {
    const r = computeTreatmentBilling({
      consumables: [
        { name: 'Gauze', unitPrice: 20, qty: 5 },              // 100
        { name: 'Free', unitPrice: 0, qty: 1 },                // 0
        { name: '', unitPrice: 50, qty: 1 },                   // 0
      ],
    });
    expect(r.subtotal).toBe(100);
  });

  test('B3.5 qty empty/missing defaults to 1', () => {
    const r = computeTreatmentBilling({
      purchasedItems: [{ name: 'X', unitPrice: 100 }],
    });
    expect(r.subtotal).toBe(100);
  });
});

// ─── B4 — discounts (medicine + bill) ──────────────────────────────────
describe('B4 discounts', () => {
  test('B4.1 medDiscountOverride wins over options.medicineDiscountPercent', () => {
    const r = computeTreatmentBilling({
      medications: [{ name: 'M', unitPrice: 1000, qty: 1 }],
      medDiscountOverride: 50,
      options: { medicineDiscountPercent: 10 }, // would be 100
    });
    expect(r.medDisc).toBe(50);
  });

  test('B4.2 fallback to medicineDiscountPercent when no override', () => {
    const r = computeTreatmentBilling({
      medications: [{ name: 'M', unitPrice: 1000, qty: 1 }],
      medDiscountOverride: '',
      options: { medicineDiscountPercent: 10 },
    });
    expect(r.medDisc).toBe(100);
  });

  test('B4.3 billDiscountType:percent applies on afterMedDisc', () => {
    const r = computeTreatmentBilling({
      purchasedItems: [{ name: 'P', unitPrice: 1000, qty: 1 }],
      billDiscount: 10, billDiscountType: 'percent',
    });
    expect(r.billDiscAmt).toBe(100);
    expect(r.afterDiscount).toBe(900);
  });

  test('B4.4 billDiscountType:amount is absolute baht', () => {
    const r = computeTreatmentBilling({
      purchasedItems: [{ name: 'P', unitPrice: 1000, qty: 1 }],
      billDiscount: 200, billDiscountType: 'amount',
    });
    expect(r.billDiscAmt).toBe(200);
    expect(r.afterDiscount).toBe(800);
  });

  test('B4.5 negative discount clamped to 0 (max0 floor)', () => {
    const r = computeTreatmentBilling({
      purchasedItems: [{ name: 'P', unitPrice: 100, qty: 1 }],
      billDiscount: 999, billDiscountType: 'amount',
    });
    expect(r.afterDiscount).toBe(0);
  });
});

// ─── B5 — insurance + deposits + wallet (legacy mode) ──────────────────
describe('B5 legacy mode insurance/deposit/wallet stack', () => {
  test('B5.1 insurance claim deducted from afterDiscount', () => {
    const r = computeTreatmentBilling({
      purchasedItems: [{ name: 'P', unitPrice: 1000, qty: 1 }],
      isInsuranceClaimed: true, insuranceClaimAmount: 300,
    });
    expect(r.insDed).toBe(300);
    expect(r.netTotal).toBe(700);
  });

  test('B5.2 useDeposit:true legacy deduction applies', () => {
    const r = computeTreatmentBilling({
      purchasedItems: [{ name: 'P', unitPrice: 1000, qty: 1 }],
      useDeposit: true, depositAmount: 200,
    });
    expect(r.depDed).toBe(200);
    expect(r.netTotal).toBe(800);
  });

  test('B5.3 useDeposit:false → depDed=0 even with depositAmount set', () => {
    const r = computeTreatmentBilling({
      purchasedItems: [{ name: 'P', unitPrice: 1000, qty: 1 }],
      useDeposit: false, depositAmount: 999,
    });
    expect(r.depDed).toBe(0);
    expect(r.netTotal).toBe(1000);
  });

  test('B5.4 stack: discount + insurance + deposit + wallet', () => {
    const r = computeTreatmentBilling({
      purchasedItems: [{ name: 'P', unitPrice: 1000, qty: 1 }],
      billDiscount: 100, billDiscountType: 'amount',
      isInsuranceClaimed: true, insuranceClaimAmount: 100,
      useDeposit: true, depositAmount: 100,
      useWallet: true, walletAmount: 100,
    });
    // 1000 - 100 = 900 → 900 - 100 = 800 → 800 - 100 = 700 → 700 - 100 = 600
    expect(r.netTotal).toBe(600);
  });

  test('B5.5 over-deduction clamps to 0', () => {
    const r = computeTreatmentBilling({
      purchasedItems: [{ name: 'P', unitPrice: 100, qty: 1 }],
      useWallet: true, walletAmount: 99999,
    });
    expect(r.netTotal).toBe(0);
  });
});

// ─── B6 — backend mode (membership + selectedDeposits + selectedWallet) ──
describe('B6 backend mode stack', () => {
  test('B6.1 backendActiveMembership.discountPercent applied', () => {
    const r = computeTreatmentBilling({
      isBackend: true,
      purchasedItems: [{ name: 'P', unitPrice: 1000, qty: 1 }],
      backendActiveMembership: { discountPercent: 10 },
    });
    expect(r.memPct).toBe(10);
    expect(r.membershipDisc).toBe(100);
    expect(r.afterMembership).toBe(900);
    expect(r.netTotal).toBe(900);
  });

  test('B6.2 selectedDeposits sum applied (multiple deposits)', () => {
    const r = computeTreatmentBilling({
      isBackend: true,
      purchasedItems: [{ name: 'P', unitPrice: 1000, qty: 1 }],
      selectedDeposits: [{ amount: 100 }, { amount: 200 }],
    });
    expect(r.depDed).toBe(300);
    expect(r.netTotal).toBe(700);
  });

  test('B6.3 selectedWallet capped at remaining (cannot over-deduct)', () => {
    const r = computeTreatmentBilling({
      isBackend: true,
      purchasedItems: [{ name: 'P', unitPrice: 100, qty: 1 }],
      selectedWallet: { amount: 9999 },
    });
    expect(r.walDed).toBe(100);
    expect(r.netTotal).toBe(0);
  });

  test('B6.4 backend full stack: discount → insurance → membership → deposit → wallet', () => {
    const r = computeTreatmentBilling({
      isBackend: true,
      purchasedItems: [{ name: 'P', unitPrice: 1000, qty: 1 }],
      billDiscount: 10, billDiscountType: 'percent',
      isInsuranceClaimed: true, insuranceClaimAmount: 100,
      backendActiveMembership: { discountPercent: 10 },
      selectedDeposits: [{ amount: 100 }],
      selectedWallet: { amount: 100 },
    });
    // subtotal=1000, billDisc=100, afterDiscount=900
    // insDed=100, afterIns=800, memPct=10, memDisc=80, afterMem=720
    // dep=100, afterDep=620, wal=100, net=520
    expect(r.netTotal).toBe(520);
  });

  test('B6.5 ignores legacy useDeposit/useWallet in backend mode', () => {
    const r = computeTreatmentBilling({
      isBackend: true,
      purchasedItems: [{ name: 'P', unitPrice: 1000, qty: 1 }],
      useDeposit: true, depositAmount: 999,  // ignored
      useWallet: true, walletAmount: 999,    // ignored
      selectedDeposits: [], selectedWallet: null,
    });
    expect(r.depDed).toBe(0);
    expect(r.walDed).toBe(0);
    expect(r.netTotal).toBe(1000);
  });
});

// ─── B7 — adversarial inputs ────────────────────────────────────────────
describe('B7 adversarial inputs', () => {
  test('B7.1 null/undefined arrays → no crash', () => {
    expect(() => computeTreatmentBilling({
      purchasedItems: null, medications: undefined, consumables: 'not-an-array',
    })).not.toThrow();
  });

  test('B7.2 non-numeric prices → 0 contribution', () => {
    const r = computeTreatmentBilling({
      purchasedItems: [{ name: 'X', unitPrice: 'abc', qty: 'def' }],
    });
    expect(r.subtotal).toBe(0);
  });

  test('B7.3 string-numeric inputs converted (form data shape)', () => {
    const r = computeTreatmentBilling({
      purchasedItems: [{ name: 'X', unitPrice: '500', qty: '3' }],
    });
    expect(r.subtotal).toBe(1500);
  });

  test('B7.4 missing options object → memDisc=0', () => {
    const r = computeTreatmentBilling({
      medications: [{ name: 'M', unitPrice: 100, qty: 1 }],
      options: null,
    });
    expect(r.medDisc).toBe(0);
  });
});

// ─── B8 — TFP source-grep regression guards ─────────────────────────────
describe('B8 TFP wiring (source-grep)', () => {
  test('B8.1 TFP imports from treatmentBilling.js', () => {
    expect(TFP_SRC).toMatch(/from\s+['"]\.\.\/lib\/treatmentBilling\.js['"]/);
    expect(TFP_SRC).toMatch(/computeTreatmentBilling/);
    expect(TFP_SRC).toMatch(/computeBmi/);
    expect(TFP_SRC).toMatch(/formatBaht/);
  });
  test('B8.2 NO inline `billing = useMemo(() => { lines = []; ... medSubtotal ...` block remains', () => {
    // Inlined billing recomputed lines+subtotal+medSubtotal in 40+ LOC.
    // After T5.b extraction, the useMemo body should be a single call to
    // computeTreatmentBilling — NOT a re-implementation.
    expect(TFP_SRC).not.toMatch(/const billing = useMemo\(\(\) => \{[\s\S]{0,200}const lines = \[\];/);
  });
  test('B8.3 NO duplicate inline BMI calc remains', () => {
    // BMI was: parseFloat(vitals.weight) / ((parseFloat(vitals.height) / 100) ** 2)
    expect(TFP_SRC).not.toMatch(/parseFloat\(vitals\.weight\)[\s\S]{0,80}\/\s*\(\(parseFloat\(vitals\.height\)/);
  });
  test('B8.4 NO duplicate inline formatBaht definition remains', () => {
    expect(TFP_SRC).not.toMatch(/const formatBaht = \(n\) =>/);
  });
});
