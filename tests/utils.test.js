// ─── Pure Function Unit Tests — utils.js + backendClient.js helpers ──────────
import { describe, it, expect } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════
// 1. hexToRgb
// ═══════════════════════════════════════════════════════════════════════════
import { hexToRgb } from '../src/utils.js';

describe('hexToRgb', () => {
  it('converts red', () => expect(hexToRgb('#dc2626')).toBe('220,38,38'));
  it('converts white', () => expect(hexToRgb('#ffffff')).toBe('255,255,255'));
  it('converts black', () => expect(hexToRgb('#000000')).toBe('0,0,0'));
  it('converts teal', () => expect(hexToRgb('#14b8a6')).toBe('20,184,166'));
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. formatPhoneNumberDisplay
// ═══════════════════════════════════════════════════════════════════════════
import { formatPhoneNumberDisplay } from '../src/utils.js';

describe('formatPhoneNumberDisplay', () => {
  it('returns Thai phone as-is', () => expect(formatPhoneNumberDisplay('0891234567', false, '+66')).toBe('0891234567'));
  it('prepends country code for international', () => expect(formatPhoneNumberDisplay('891234567', true, '+66')).toBe('+66 891234567'));
  it('returns dash for empty', () => expect(formatPhoneNumberDisplay('', false, '')).toBe('-'));
  it('returns dash for null', () => expect(formatPhoneNumberDisplay(null, false, '')).toBe('-'));
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. getReasons + getHrtGoals
// ═══════════════════════════════════════════════════════════════════════════
import { getReasons, getHrtGoals } from '../src/utils.js';

describe('getReasons', () => {
  it('returns array from visitReasons', () => expect(getReasons({ visitReasons: ['a', 'b'] })).toEqual(['a', 'b']));
  it('wraps single visitReason', () => expect(getReasons({ visitReason: 'ขลิบ' })).toEqual(['ขลิบ']));
  it('returns empty for null', () => expect(getReasons(null)).toEqual([]));
  it('returns empty for no reason', () => expect(getReasons({})).toEqual([]));
});

describe('getHrtGoals', () => {
  it('returns array from hrtGoals', () => expect(getHrtGoals({ hrtGoals: ['x'] })).toEqual(['x']));
  it('wraps single hrtGoal', () => expect(getHrtGoals({ hrtGoal: 'y' })).toEqual(['y']));
  it('returns empty for null', () => expect(getHrtGoals(null)).toEqual([]));
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. calculateIIEFScore + getIIEFInterpretation
// ═══════════════════════════════════════════════════════════════════════════
import { calculateIIEFScore, getIIEFInterpretation } from '../src/utils.js';

describe('calculateIIEFScore', () => {
  it('sums 5 fields', () => expect(calculateIIEFScore({ iief_1: '5', iief_2: '5', iief_3: '5', iief_4: '5', iief_5: '5' })).toBe(25));
  it('handles missing fields', () => expect(calculateIIEFScore({ iief_1: '3' })).toBe(3));
  it('handles all zeros', () => expect(calculateIIEFScore({})).toBe(0));
});

describe('getIIEFInterpretation', () => {
  it('score 0 = ข้อมูลไม่ครบ', () => expect(getIIEFInterpretation(0).text).toBe('ข้อมูลไม่ครบถ้วน'));
  it('score 25 = ปกติ', () => expect(getIIEFInterpretation(25).text).toContain('ปกติ'));
  it('score 18 = เล็กน้อย', () => expect(getIIEFInterpretation(18).text).toContain('เล็กน้อย'));
  it('score 14 = เล็กน้อยถึงปานกลาง', () => expect(getIIEFInterpretation(14).text).toContain('ปานกลาง'));
  it('score 9 = ปานกลาง', () => expect(getIIEFInterpretation(9).text).toBe('เสื่อมระดับปานกลาง'));
  it('score 5 = รุนแรง', () => expect(getIIEFInterpretation(5).text).toContain('รุนแรง'));
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. calculateADAM
// ═══════════════════════════════════════════════════════════════════════════
import { calculateADAM } from '../src/utils.js';

describe('calculateADAM', () => {
  it('positive if adam_1 checked', () => {
    const r = calculateADAM({ adam_1: true });
    expect(r.positive).toBe(true);
    expect(r.total).toBe(1);
  });
  it('positive if adam_7 checked', () => {
    expect(calculateADAM({ adam_7: true }).positive).toBe(true);
  });
  it('positive if 3+ checked', () => {
    expect(calculateADAM({ adam_2: true, adam_3: true, adam_4: true }).positive).toBe(true);
  });
  it('negative if only 2 (non-1,non-7)', () => {
    expect(calculateADAM({ adam_2: true, adam_3: true }).positive).toBe(false);
  });
  it('negative if none checked', () => {
    const r = calculateADAM({});
    expect(r.positive).toBe(false);
    expect(r.total).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Billing Calculation Logic (inline — matches TreatmentFormPage)
// ═══════════════════════════════════════════════════════════════════════════
describe('Billing Calculation Logic', () => {
  function calcBilling({ items = [], meds = [], consumables = [], medDiscPct = 0, medDiscOverride = '', billDiscount = '', billDiscountType = 'amount', insClaim = 0, deposit = 0, wallet = 0 }) {
    const lines = [];
    items.forEach(p => {
      const net = (parseFloat(p.unitPrice) || 0) * (parseInt(p.qty) || 1);
      if (net > 0) lines.push({ amount: net, type: 'item' });
    });
    meds.filter(m => m.name && parseFloat(m.unitPrice) > 0 && !m.isPremium).forEach(m => {
      lines.push({ amount: (parseFloat(m.unitPrice) || 0) * (parseInt(m.qty) || 1), type: 'med' });
    });
    consumables.filter(c => c.name).forEach(c => {
      const net = (parseFloat(c.unitPrice) || 0) * (parseInt(c.qty) || 1);
      if (net > 0) lines.push({ amount: net, type: 'cons' });
    });
    const subtotal = lines.reduce((s, l) => s + l.amount, 0);
    const medSubtotal = lines.filter(l => l.type === 'med').reduce((s, l) => s + l.amount, 0);
    const medDisc = parseFloat(medDiscOverride) || (medSubtotal * medDiscPct / 100);
    const afterMedDisc = Math.max(0, subtotal - medDisc);
    const billDiscAmt = billDiscountType === 'percent' ? afterMedDisc * (parseFloat(billDiscount) || 0) / 100 : parseFloat(billDiscount) || 0;
    const afterDiscount = Math.max(0, afterMedDisc - billDiscAmt);
    const netTotal = Math.max(0, afterDiscount - insClaim - deposit - wallet);
    return { subtotal, medSubtotal, medDisc, billDiscAmt, afterDiscount, netTotal };
  }

  it('empty = all zeros', () => {
    const b = calcBilling({});
    expect(b.subtotal).toBe(0);
    expect(b.netTotal).toBe(0);
  });

  it('single item 1000 x 2 = 2000', () => {
    const b = calcBilling({ items: [{ unitPrice: '1000', qty: '2' }] });
    expect(b.subtotal).toBe(2000);
    expect(b.netTotal).toBe(2000);
  });

  it('item + medication subtotals correct', () => {
    const b = calcBilling({
      items: [{ unitPrice: '5000', qty: '1' }],
      meds: [{ name: 'Botox', unitPrice: '3000', qty: '1' }],
    });
    expect(b.subtotal).toBe(8000);
    expect(b.medSubtotal).toBe(3000);
  });

  it('med discount percent deducts from total', () => {
    const b = calcBilling({
      items: [{ unitPrice: '5000', qty: '1' }],
      meds: [{ name: 'Med', unitPrice: '2000', qty: '1' }],
      medDiscPct: 10,
    });
    // medSubtotal=2000, medDisc=200, subtotal=7000, afterMedDisc=6800
    expect(b.medDisc).toBe(200);
    expect(b.netTotal).toBe(6800);
  });

  it('bill discount amount', () => {
    const b = calcBilling({
      items: [{ unitPrice: '10000', qty: '1' }],
      billDiscount: '500',
      billDiscountType: 'amount',
    });
    expect(b.netTotal).toBe(9500);
  });

  it('bill discount percent', () => {
    const b = calcBilling({
      items: [{ unitPrice: '10000', qty: '1' }],
      billDiscount: '10',
      billDiscountType: 'percent',
    });
    expect(b.netTotal).toBe(9000);
  });

  it('insurance + deposit + wallet deductions', () => {
    const b = calcBilling({
      items: [{ unitPrice: '10000', qty: '1' }],
      insClaim: 3000,
      deposit: 2000,
      wallet: 1000,
    });
    expect(b.netTotal).toBe(4000);
  });

  it('netTotal never goes below 0', () => {
    const b = calcBilling({
      items: [{ unitPrice: '100', qty: '1' }],
      billDiscount: '99999',
      billDiscountType: 'amount',
    });
    expect(b.netTotal).toBe(0);
  });

  it('premium meds excluded from billing', () => {
    const b = calcBilling({
      meds: [
        { name: 'Paid Med', unitPrice: '500', qty: '1' },
        { name: 'Free Med', unitPrice: '1000', qty: '1', isPremium: true },
      ],
    });
    expect(b.subtotal).toBe(500);
    expect(b.medSubtotal).toBe(500);
  });

  it('consumables included in subtotal', () => {
    const b = calcBilling({
      consumables: [{ name: 'Gauze', unitPrice: '50', qty: '10' }],
    });
    expect(b.subtotal).toBe(500);
    expect(b.netTotal).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. renderDobFormat
// ═══════════════════════════════════════════════════════════════════════════
import { renderDobFormat } from '../src/utils.js';

describe('renderDobFormat', () => {
  it('formats Thai DOB correctly', () => {
    const r = renderDobFormat({ dobDay: '15', dobMonth: '4', dobYear: '2543' });
    expect(r).toContain('15');
    expect(r).toContain('2543');
  });
  it('returns dash for empty', () => {
    expect(renderDobFormat({})).toBe('-');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. clean() — undefined stripping (retest as pure function)
// ═══════════════════════════════════════════════════════════════════════════
describe('clean() — JSON.parse(JSON.stringify) stripping', () => {
  const clean = (o) => JSON.parse(JSON.stringify(o));

  it('strips undefined values', () => {
    const result = clean({ a: 1, b: undefined, c: 'x' });
    expect(result).toEqual({ a: 1, c: 'x' });
    expect('b' in result).toBe(false);
  });

  it('strips nested undefined', () => {
    const result = clean({ a: { b: undefined, c: 1 } });
    expect(result).toEqual({ a: { c: 1 } });
  });

  it('preserves null', () => {
    const result = clean({ a: null, b: 1 });
    expect(result).toEqual({ a: null, b: 1 });
  });

  it('preserves empty arrays', () => {
    const result = clean({ items: [], name: 'test' });
    expect(result.items).toEqual([]);
  });
});
