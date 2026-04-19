// ─── Phase 10 Sale Report — golden fixture with hand-computed expected totals ─
// Used by phase10-sale-report.test.js. Every test that needs sale data should
// import from here (single source of truth). Hand-calculated totals are the
// asserts of last resort — if production code drifts, the fixture totals
// won't match and tests fail.
//
// Schema follows real be_sales docs (verified via Grep of SaleTab.jsx + backendClient.js).

/** Helper: build a sale doc with sensible defaults; override via overrides. */
function sale({
  saleId,
  customerId = 'CUST_1',
  customerHN = 'HN67000001',
  customerName = 'สมชาย',
  saleDate = '2026-04-15',
  status = 'active',
  items = { courses: [], products: [], medications: [] },
  billing = {},
  payment = {},
  sellers = [{ id: 'S1', name: 'พนักงาน A', percent: 100, total: 0 }],
  membershipId = null,
  createdBy = 'admin',
  cancelledBy = '',
  refundAmount = 0,
  insuranceClaim = 0,
}) {
  return {
    saleId,
    customerId, customerHN, customerName,
    saleDate, status, items,
    billing: {
      subtotal: 0, billDiscount: 0, membershipDiscount: 0,
      depositApplied: 0, walletApplied: 0, netTotal: 0, ...billing,
    },
    payment: { status: 'unpaid', channels: [], date: saleDate, ...payment },
    sellers, membershipId, createdBy, cancelledBy, refundAmount, insuranceClaim,
    createdAt: `${saleDate}T10:00:00.000Z`,
    updatedAt: `${saleDate}T10:00:00.000Z`,
  };
}

// ─── 7 sales with diverse shapes covering the column matrix ─────────────────

export const FIXTURE_SALES = [
  // 1. Simple course sale, fully paid via 1 channel
  sale({
    saleId: 'INV-20260415-0001',
    saleDate: '2026-04-15',
    items: { courses: [{ name: 'นวดหน้าด้วยมือ + Ultrasonic', qty: 5 }], products: [], medications: [] },
    billing: { subtotal: 10000, netTotal: 10000 },
    payment: { status: 'paid', channels: [{ name: 'KBank', amount: 10000 }] },
  }),
  // 2. Multi-item sale w/ deposit + wallet, split payment 2 channels
  sale({
    saleId: 'INV-20260416-0001',
    saleDate: '2026-04-16',
    items: {
      courses: [{ name: 'Botox Hugel', qty: 1 }, { name: 'Filler 0.5cc', qty: 2 }],
      products: [{ name: 'ครีมกันแดด SPF50', qty: 3 }],
      medications: [],
    },
    billing: { subtotal: 50000, depositApplied: 5000, walletApplied: 2000, netTotal: 43000 },
    payment: { status: 'split', channels: [
      { name: 'SCB', amount: 30000 }, { name: 'เงินสด', amount: 13000 },
    ]},
    sellers: [
      { id: 'S1', name: 'พนักงาน A', percent: 50, total: 21500 },
      { id: 'S2', name: 'พนักงาน B', percent: 50, total: 21500 },
    ],
  }),
  // 3. Membership sale (ประเภท = 'บัตรสมาชิก' regardless of items)
  sale({
    saleId: 'INV-20260416-0002',
    saleDate: '2026-04-16',
    items: { courses: [{ name: 'package GOLD', qty: 1 }], products: [], medications: [] },
    billing: { subtotal: 50000, netTotal: 50000 },
    payment: { status: 'paid', channels: [{ name: 'KBank', amount: 50000 }] },
    membershipId: 'MEM-GOLD-001',
  }),
  // 4. Unpaid sale (treatment fee, not yet collected)
  sale({
    saleId: 'INV-20260417-0001',
    saleDate: '2026-04-17',
    items: { courses: [], products: [], medications: [{ name: 'Paracetamol 500mg', qty: 20 }] },
    billing: { subtotal: 200, netTotal: 200 },
    payment: { status: 'unpaid', channels: [] },
  }),
  // 5. Sale with refund (refundAmount > 0)
  sale({
    saleId: 'INV-20260417-0002',
    saleDate: '2026-04-17',
    items: { courses: [{ name: 'Treatment X', qty: 1 }], products: [], medications: [] },
    billing: { subtotal: 5000, netTotal: 5000 },
    payment: { status: 'paid', channels: [{ name: 'KBank', amount: 5000 }] },
    refundAmount: 1000,  // partial refund
  }),
  // 6. Cancelled sale — should be EXCLUDED from totals by default (AR3)
  sale({
    saleId: 'INV-20260418-0001',
    saleDate: '2026-04-18',
    status: 'cancelled',
    items: { courses: [{ name: 'อันที่ยกเลิก', qty: 1 }], products: [], medications: [] },
    billing: { subtotal: 99999, netTotal: 99999 },
    payment: { status: 'paid', channels: [{ name: 'KBank', amount: 99999 }] },
    cancelledBy: 'admin2',
  }),
  // 7. Out-of-range sale (March, before April filter range)
  sale({
    saleId: 'INV-20260301-0001',
    saleDate: '2026-03-01',
    items: { courses: [{ name: 'Old course', qty: 1 }], products: [], medications: [] },
    billing: { subtotal: 7777, netTotal: 7777 },
    payment: { status: 'paid', channels: [{ name: 'KBank', amount: 7777 }] },
  }),
];

// ─── Hand-computed expected totals for [2026-04-15, 2026-04-18] active-only ─

/** Sales 1-5 (in range, NOT cancelled). Sale 6 cancelled. Sale 7 out of range. */
export const EXPECTED_APRIL_RANGE_TOTALS = {
  count: 5,                 // 1+2+3+4+5
  netTotal: 108200,         // 10000+43000+50000+200+5000
  depositApplied: 5000,     // only #2
  walletApplied: 2000,      // only #2
  refundAmount: 1000,       // only #5
  insuranceClaim: 0,
  paidAmount: 108000,       // 10000+43000+50000+0+5000
  outstandingAmount: 200,   // only #4 unpaid
};

/** When includeCancelled=true, rows include #6 but totals UNCHANGED (AR3). */
export const EXPECTED_APRIL_RANGE_TOTALS_INCLUDING_CANCELLED = EXPECTED_APRIL_RANGE_TOTALS;

/** "ปีนี้" range (2026-01-01 to 2026-12-31): includes #7 March sale + April 1-5. */
export const EXPECTED_YEAR_2026_TOTALS = {
  count: 6,                 // 5 April active + 1 March active
  netTotal: 115977,         // 108200 + 7777 = 115977
  depositApplied: 5000,
  walletApplied: 2000,
  refundAmount: 1000,
  insuranceClaim: 0,
  paidAmount: 115777,       // 108000 + 7777
  outstandingAmount: 200,
};

/** Just sale #2 (split-payment fixture for channel-parsing tests). */
export const SALE_SPLIT_PAYMENT = FIXTURE_SALES[1];

/** Just sale #6 (cancelled fixture). */
export const SALE_CANCELLED = FIXTURE_SALES[5];

/** Legacy sale doc — minimal Phase 6 shape (no refundAmount, no insuranceClaim,
 *  no payment.channels — for AR14 defensive-access tests). */
export const LEGACY_SALE_PHASE6 = {
  saleId: 'INV-20251231-0001',
  customerId: 'CUST_X',
  customerHN: 'HN65000999',
  customerName: 'ลูกค้าเก่า',
  saleDate: '2025-12-31',
  status: 'active',
  items: { courses: [{ name: 'old course' }], products: [], medications: [] },
  billing: { subtotal: 1000, netTotal: 1000 },
  // no payment field at all
};

/** Floating-point edge case: 0.1+0.2 should round to 0.3, not 0.30000000000000004. */
export const FLOAT_DRIFT_FIXTURE = [
  sale({
    saleId: 'INV-20260415-FLOAT-1',
    saleDate: '2026-04-15',
    billing: { subtotal: 0.1, netTotal: 0.1 },
    payment: { status: 'paid', channels: [{ name: 'cash', amount: 0.1 }] },
  }),
  sale({
    saleId: 'INV-20260415-FLOAT-2',
    saleDate: '2026-04-15',
    billing: { subtotal: 0.2, netTotal: 0.2 },
    payment: { status: 'paid', channels: [{ name: 'cash', amount: 0.2 }] },
  }),
];
