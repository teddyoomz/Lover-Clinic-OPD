// Phase 10.3 — Customer Report fixture with hand-computed expected aggregates.
// Schema mirrors real be_customers + be_sales docs (verified via Grep of
// SaleTab + backendClient + CustomerCard).

function customer({
  proClinicId,
  proClinicHN,
  patientData = {},
  finance = {},
  consent = { marketing: false, healthData: false },
  clonedAt = '2026-01-01T10:00:00.000Z',
}) {
  return {
    proClinicId, proClinicHN,
    patientData: {
      prefix: 'คุณ', firstName: 'ทดสอบ', lastName: '', nickname: '',
      gender: '', birthdate: '', occupation: '', income: '',
      source: '', phone: '',
      ...patientData,
    },
    finance: {
      depositBalance: 0, totalWalletBalance: 0, loyaltyPoints: 0,
      membershipId: null, membershipType: null, membershipExpiry: null,
      membershipDiscountPercent: 0,
      ...finance,
    },
    consent,
    clonedAt,
  };
}

function sale({
  saleId, customerId, saleDate, status = 'active',
  netTotal = 0, paymentStatus = 'paid',
}) {
  return {
    saleId, customerId, saleDate, status,
    billing: { netTotal },
    payment: { status: paymentStatus, channels: paymentStatus === 'paid' ? [{ name: 'cash', amount: netTotal }] : [] },
  };
}

// ─── 6 customers covering the matrix ────────────────────────────────────────

export const FIXTURE_CUSTOMERS = [
  // 1. GOLD member, full profile, marketing-consent yes
  customer({
    proClinicId: 'CUST_GOLD',
    proClinicHN: 'HN67000001',
    patientData: {
      prefix: 'คุณ', firstName: 'ปกป้อง', lastName: 'ซื่อตรง',
      gender: 'ชาย', birthdate: '15/03/1985',
      occupation: 'แพทย์', income: '50000-100000',
      source: 'เพื่อนแนะนำ', phone: '0812345678',
    },
    finance: {
      depositBalance: 5000, totalWalletBalance: 12000, loyaltyPoints: 320,
      membershipType: 'GOLD', membershipExpiry: '2027-03-15',
      membershipDiscountPercent: 10,
    },
    consent: { marketing: true, healthData: true },
    clonedAt: '2025-08-20T10:00:00.000Z',
  }),
  // 2. DIAMOND member, no consent
  customer({
    proClinicId: 'CUST_DIA',
    proClinicHN: 'HN67000002',
    patientData: {
      prefix: 'คุณ', firstName: 'นันทิดา', lastName: 'รุ่งเรือง',
      gender: 'หญิง', birthdate: '20/07/1990',
      source: 'Facebook',
    },
    finance: {
      depositBalance: 0, totalWalletBalance: 50000, loyaltyPoints: 1200,
      membershipType: 'DIAMOND', membershipExpiry: '2027-07-20',
      membershipDiscountPercent: 15,
    },
    consent: { marketing: false, healthData: true },
    clonedAt: '2025-09-15T10:00:00.000Z',
  }),
  // 3. Regular customer (no membership), some deposit, no purchases
  customer({
    proClinicId: 'CUST_REG',
    proClinicHN: 'HN68000001',
    patientData: {
      firstName: 'ทดลอง', source: 'เดินผ่าน', gender: 'หญิง',
    },
    finance: { depositBalance: 2000 },
    consent: { marketing: true, healthData: false },
    clonedAt: '2026-02-10T10:00:00.000Z',
  }),
  // 4. Empty customer (newly registered, no data)
  customer({
    proClinicId: 'CUST_NEW',
    proClinicHN: 'HN68000002',
    patientData: { firstName: 'ใหม่' },
    clonedAt: '2026-04-15T10:00:00.000Z',
  }),
  // 5. Platinum member with high purchases + 2 unpaid
  customer({
    proClinicId: 'CUST_PLAT',
    proClinicHN: 'HN66000001',
    patientData: {
      prefix: 'คุณ', firstName: 'วิสเซอร์', nickname: 'V',
      source: 'Google Ads',
    },
    finance: {
      depositBalance: 15000, totalWalletBalance: 8500.5, loyaltyPoints: 9999,
      membershipType: 'Platinum', membershipExpiry: '2028-01-01',
      membershipDiscountPercent: 20,
    },
    consent: { marketing: true, healthData: true },
    clonedAt: '2024-12-01T10:00:00.000Z',
  }),
  // 6. Customer with sales but no membership, partial profile
  customer({
    proClinicId: 'CUST_BUSY',
    proClinicHN: 'HN69000001',
    patientData: {
      firstName: 'อภิชาติ', gender: 'ชาย', source: 'TikTok',
    },
    finance: { loyaltyPoints: 50, depositBalance: 100.33 },
    clonedAt: '2026-03-20T10:00:00.000Z',
  }),
];

// ─── Sales fixture: build per-customer purchase history ───────────────────

export const FIXTURE_SALES = [
  // GOLD: 3 purchases, 1 unpaid
  sale({ saleId: 'INV-2026-0001', customerId: 'CUST_GOLD', saleDate: '2026-04-10', netTotal: 10000 }),
  sale({ saleId: 'INV-2026-0002', customerId: 'CUST_GOLD', saleDate: '2026-04-15', netTotal: 25000 }),
  sale({ saleId: 'INV-2026-0003', customerId: 'CUST_GOLD', saleDate: '2026-04-18', netTotal: 5000, paymentStatus: 'unpaid' }),
  // DIAMOND: 2 purchases, all paid
  sale({ saleId: 'INV-2026-0004', customerId: 'CUST_DIA', saleDate: '2026-04-05', netTotal: 30000 }),
  sale({ saleId: 'INV-2026-0005', customerId: 'CUST_DIA', saleDate: '2026-04-12', netTotal: 70000 }),
  // PLAT: 2 purchases, 2 unpaid
  sale({ saleId: 'INV-2026-0006', customerId: 'CUST_PLAT', saleDate: '2026-04-01', netTotal: 100000 }),
  sale({ saleId: 'INV-2026-0007', customerId: 'CUST_PLAT', saleDate: '2026-04-08', netTotal: 50000.5, paymentStatus: 'unpaid' }),
  sale({ saleId: 'INV-2026-0008', customerId: 'CUST_PLAT', saleDate: '2026-04-19', netTotal: 25000, paymentStatus: 'unpaid' }),
  // BUSY: 1 purchase
  sale({ saleId: 'INV-2026-0009', customerId: 'CUST_BUSY', saleDate: '2026-03-25', netTotal: 7777 }),
  // Cancelled sale (should NOT contribute to totals — AR3)
  sale({ saleId: 'INV-2026-CXL',  customerId: 'CUST_GOLD', saleDate: '2026-04-17', status: 'cancelled', netTotal: 99999 }),
];

// ─── Hand-computed expected totals (no date filter, all customers) ─────────

export const EXPECTED_TOTALS_NO_FILTER = {
  count: 6,
  // Sum of finance.depositBalance: 5000+0+2000+0+15000+100.33 = 22100.33
  depositBalance: 22100.33,
  // Sum totalWalletBalance: 12000+50000+0+0+8500.5+0 = 70500.5
  walletBalance: 70500.5,
  // Sum loyaltyPoints: 320+1200+0+0+9999+50 = 11569
  points: 11569,
  // Sum sales (active only, no date filter):
  // GOLD = 10000+25000+5000 = 40000, DIA = 100000, PLAT = 175000.5,
  // BUSY = 7777, others 0 → grand 322777.5
  purchaseTotal: 322777.5,
  // Unpaid count: GOLD 1 + PLAT 2 = 3
  purchaseUnpaidCount: 3,
};

export const EXPECTED_TOTALS_MARKETING_ONLY = {
  count: 4, // GOLD, REG, PLAT, BUSY (BUSY has no consent block but defaulted)
  // Recompute: GOLD(5000) + REG(2000) + PLAT(15000) + BUSY(100.33) = 22100.33
  // Wait — BUSY didn't have explicit consent set, so default false.
  // Actually with our customer() helper, default consent.marketing=false.
  // So marketing=true: GOLD, REG, PLAT (BUSY defaults to false since
  // we didn't override). count=3.
  // Recomputing: GOLD 5000 + REG 2000 + PLAT 15000 = 22000
};

// Recompute marketing-only correctly
export const EXPECTED_MARKETING_ONLY = {
  count: 3, // GOLD, REG, PLAT
  depositBalance: 22000,           // 5000+2000+15000
  walletBalance: 20500.5,          // 12000+0+8500.5
  points: 10319,                   // 320+0+9999
  purchaseTotal: 215000.5,         // GOLD 40000 + PLAT 175000.5 (REG no sales)
  purchaseUnpaidCount: 3,          // GOLD 1 + PLAT 2
};

// April 2026 range = same as no filter for this fixture (all sales in April except cancelled)
// Actually BUSY's sale is March 25. So April-only excludes that 7777.
export const EXPECTED_APRIL_ONLY = {
  count: 6, // customers list unchanged — date filter narrows the embedded purchase summary only
  depositBalance: 22100.33,        // from customer.finance, unaffected by date
  walletBalance: 70500.5,
  points: 11569,
  // GOLD 40000 + DIA 100000 + PLAT 175000.5 + BUSY 0 = 315000.5
  purchaseTotal: 315000.5,
  purchaseUnpaidCount: 3,
};
