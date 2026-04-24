// ─── Phase 13.6 · treatment validator adversarial tests ──────────────────
import { describe, it, expect } from 'vitest';
import {
  validateTreatmentStrict, normalizeTreatment, emptyTreatmentForm,
  STATUS_OPTIONS, PAYMENT_STATUS_OPTIONS, DISCOUNT_TYPE_OPTIONS,
} from '../src/lib/treatmentValidation.js';

const base = (over = {}) => ({
  ...emptyTreatmentForm(),
  customerId: 'CUST-1',
  detail: {
    treatmentDate: '2026-04-24',
    doctorId: '',
    doctorName: '',
    items: { courses: [], products: [] },
    billing: {},
    payment: {},
  },
  ...over,
});

describe('validateTreatmentStrict — required (TR-1, TR-2)', () => {
  it('TV1: null/array rejected', () => {
    expect(validateTreatmentStrict(null)?.[0]).toBe('form');
    expect(validateTreatmentStrict([])?.[0]).toBe('form');
  });
  it('TV2: missing customerId rejected', () => {
    expect(validateTreatmentStrict({ ...base(), customerId: '' })?.[0]).toBe('customerId');
  });
  it('TV3: missing treatmentDate rejected', () => {
    const f = base();
    f.detail.treatmentDate = '';
    expect(validateTreatmentStrict(f)?.[0]).toBe('treatmentDate');
  });
  it('TV4: dd/mm/yyyy treatmentDate rejected', () => {
    const f = base();
    f.detail.treatmentDate = '24/04/2026';
    expect(validateTreatmentStrict(f)?.[0]).toBe('treatmentDate');
  });
});

describe('validateTreatmentStrict — billing (TR-3)', () => {
  it('TV5: negative netTotal rejected', () => {
    const f = base();
    f.detail.billing = { netTotal: -1 };
    expect(validateTreatmentStrict(f)?.[0]).toBe('netTotal');
  });
  it('TV6: negative discount rejected', () => {
    const f = base();
    f.detail.billing = { discount: -1 };
    expect(validateTreatmentStrict(f)?.[0]).toBe('discount');
  });
  it('TV7: invalid discountType rejected', () => {
    const f = base();
    f.detail.billing = { discountType: 'weird' };
    expect(validateTreatmentStrict(f)?.[0]).toBe('discountType');
  });
  it('TV8: billing absent → accepted', () => {
    expect(validateTreatmentStrict(base())).toBeNull();
  });
});

describe('validateTreatmentStrict — payment (TR-4, TR-5)', () => {
  it('TV9: invalid paymentStatus rejected', () => {
    const f = base();
    f.detail.payment = { paymentStatus: '5' };
    expect(validateTreatmentStrict(f)?.[0]).toBe('paymentStatus');
  });
  it('TV10: paymentStatus=2 with mismatched channel sum rejected', () => {
    const f = base();
    f.detail.billing = { netTotal: 1000 };
    f.detail.payment = { paymentStatus: '2', channels: [{ amount: 500 }] };
    expect(validateTreatmentStrict(f)?.[0]).toBe('payment');
  });
  it('TV11: paymentStatus=2 with exact channel sum accepted', () => {
    const f = base();
    f.detail.billing = { netTotal: 1000 };
    f.detail.payment = { paymentStatus: '2', channels: [{ amount: 700 }, { amount: 300 }] };
    expect(validateTreatmentStrict(f)).toBeNull();
  });
  it('TV12: paymentStatus=0 (unpaid) with no channels accepted', () => {
    const f = base();
    f.detail.payment = { paymentStatus: '0' };
    expect(validateTreatmentStrict(f)).toBeNull();
  });
  it('TV13: paymentStatus=4 (split) bypasses exact-match rule', () => {
    const f = base();
    f.detail.billing = { netTotal: 1000 };
    f.detail.payment = { paymentStatus: '4', channels: [{ amount: 500 }] }; // partial paid
    expect(validateTreatmentStrict(f)).toBeNull();
  });
});

describe('validateTreatmentStrict — doctor (TR-6)', () => {
  it('TV14: doctorId without doctorName rejected', () => {
    const f = base();
    f.detail.doctorId = 'D1';
    expect(validateTreatmentStrict(f)?.[0]).toBe('doctorName');
  });
  it('TV15: both doctorId + doctorName accepted', () => {
    const f = base();
    f.detail.doctorId = 'D1';
    f.detail.doctorName = 'Alice';
    expect(validateTreatmentStrict(f)).toBeNull();
  });
  it('TV16: no doctor (no-doctor treatment) accepted', () => {
    expect(validateTreatmentStrict(base())).toBeNull();
  });
});

describe('validateTreatmentStrict — items (TR-7, TR-8)', () => {
  it('TV17: course without name rejected', () => {
    const f = base();
    f.detail.items = { courses: [{ qty: 1, price: 100 }], products: [] };
    expect(validateTreatmentStrict(f)?.[0]).toBe('courses');
  });
  it('TV18: course qty 0 rejected', () => {
    const f = base();
    f.detail.items = { courses: [{ name: 'Laser', qty: 0 }], products: [] };
    expect(validateTreatmentStrict(f)?.[0]).toBe('courses');
  });
  it('TV19: product without productId rejected', () => {
    const f = base();
    f.detail.items = { courses: [], products: [{ qty: 1 }] };
    expect(validateTreatmentStrict(f)?.[0]).toBe('products');
  });
  it('TV20: product qty <= 0 rejected', () => {
    const f = base();
    f.detail.items = { courses: [], products: [{ productId: 'P1', qty: -1 }] };
    expect(validateTreatmentStrict(f)?.[0]).toBe('products');
  });
  it('TV21: valid items accepted', () => {
    const f = base();
    f.detail.items = {
      courses: [{ name: 'Laser', qty: 1 }],
      products: [{ productId: 'P1', qty: 2 }],
    };
    expect(validateTreatmentStrict(f)).toBeNull();
  });
});

describe('validateTreatmentStrict — status + sale link (TR-9, TR-10)', () => {
  it('TV22: invalid status rejected', () => {
    const f = base();
    f.detail.status = 'invalid';
    expect(validateTreatmentStrict(f)?.[0]).toBe('status');
  });
  it('TV23: status=cancelled without cancelReason rejected', () => {
    const f = base();
    f.detail.status = 'cancelled';
    expect(validateTreatmentStrict(f)?.[0]).toBe('cancelReason');
  });
  it('TV24: status=cancelled with cancelReason accepted', () => {
    const f = base();
    f.detail.status = 'cancelled';
    f.detail.cancelReason = 'ลูกค้ายกเลิก';
    expect(validateTreatmentStrict(f)).toBeNull();
  });
  it('TV25: hasSale=true without linkedSaleId rejected', () => {
    const f = base();
    f.detail.hasSale = true;
    expect(validateTreatmentStrict(f)?.[0]).toBe('linkedSaleId');
  });
  it('TV26: hasSale=true with linkedSaleId accepted', () => {
    const f = base();
    f.detail.hasSale = true;
    f.detail.linkedSaleId = 'INV-1';
    expect(validateTreatmentStrict(f)).toBeNull();
  });
});

describe('normalizeTreatment', () => {
  it('TV27: trims strings + default status', () => {
    const n = normalizeTreatment({ customerId: '  X  ', detail: { treatmentDate: '  2026-04-24  ' } });
    expect(n.customerId).toBe('X');
    expect(n.detail.treatmentDate).toBe('2026-04-24');
    expect(n.detail.status).toBe('draft');
  });
  it('TV28: invalid paymentStatus falls back to 0', () => {
    const n = normalizeTreatment({ detail: { payment: { paymentStatus: '99' } } });
    expect(n.detail.payment.paymentStatus).toBe('0');
  });
  it('TV29: channel amounts rounded to 2 decimals', () => {
    const n = normalizeTreatment({ detail: { payment: { channels: [{ amount: 0.1 + 0.2 }] } } });
    expect(n.detail.payment.channels[0].amount).toBe(0.3);
  });
  it('TV30: negative billing numbers clamped to 0', () => {
    const n = normalizeTreatment({ detail: { billing: { netTotal: -100, discount: -1 } } });
    expect(n.detail.billing.netTotal).toBe(0);
    expect(n.detail.billing.discount).toBe(0);
  });
});

describe('frozen constants', () => {
  it('TV31: STATUS_OPTIONS frozen with 3 entries', () => {
    expect(Object.isFrozen(STATUS_OPTIONS)).toBe(true);
    expect(STATUS_OPTIONS.length).toBe(3);
  });
  it('TV32: PAYMENT_STATUS_OPTIONS has ProClinic codes', () => {
    expect(Object.isFrozen(PAYMENT_STATUS_OPTIONS)).toBe(true);
    expect(PAYMENT_STATUS_OPTIONS).toEqual(['0', '2', '4']);
  });
});
