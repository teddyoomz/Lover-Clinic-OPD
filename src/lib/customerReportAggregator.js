// ─── Customer Report Aggregator (Phase 10.3) — pure, deterministic ────────
//
// Source: be_customers (Phase 5 schema) + be_sales (per-customer roll-up).
// All other "summary" fields (deposit / wallet / points / membership) live
// already-denormalized on the customer doc as `finance.*` — see
// recalcCustomerDepositBalance / recalcCustomerWalletBalances /
// earnPoints / getCustomerMembership in backendClient.js. Reading them
// directly here means the report = the same numbers the backend tabs
// already trust, with no separate aggregation that could drift.
//
// Output shape: { rows, totals, meta } per /audit-reports-accuracy AR5.
//
// Iron-clad gates:
//   - AR1 date filter: not applied to customer base list (the report
//     shows ALL customers — like ProClinic's /admin/report/customer);
//     date filter only narrows the embedded purchase-summary subquery.
//   - AR3 cancelled excluded from purchase totals
//   - AR4 every currency value rounded via roundTHB
//   - AR5 footer reconciles to row sums
//   - AR12 currency rendered via fmtMoney externally
//   - AR13 dates rendered as dd/mm/yyyy ค.ศ. (admin)
//   - AR14 defensive ?. access throughout
//   - AR15 idempotent — pure function of (customers, sales, filters)

import { roundTHB, dateRangeFilter, sortBy } from './reportsUtils.js';

/* ─── Identity helpers ───────────────────────────────────────────────────── */

/** Compose customer display name from patientData fields. */
function deriveName(c) {
  const pd = c?.patientData || {};
  const composed = `${pd.prefix || ''} ${pd.firstName || ''} ${pd.lastName || ''}`.trim();
  return composed || pd.nickname || c?.name || '-';
}

function deriveHN(c) {
  return c?.proClinicHN || c?.hn || c?.patientData?.proClinicHN || '';
}

function deriveCustomerId(c) {
  return String(c?.proClinicId || c?.id || '');
}

function derivePhone(c) {
  return c?.patientData?.phone || c?.phone || '';
}

/** "เพศ / วันเกิด" composite cell. */
function deriveGenderBirth(c) {
  const pd = c?.patientData || {};
  const gender = (pd.gender || '').trim();
  const birthdate = (pd.birthdate || '').trim();
  if (!gender && !birthdate) return '--';
  const parts = [];
  if (gender) parts.push(gender);
  if (birthdate) parts.push(birthdate);
  return parts.join(' / ');
}

/** "อาชีพ / รายได้" composite cell. */
function deriveOccupationIncome(c) {
  const pd = c?.patientData || {};
  const occ = (pd.occupation || '').trim();
  const income = (pd.income || '').trim();
  if (!occ && !income) return '--';
  return [occ, income].filter(Boolean).join(' / ');
}

function deriveSource(c) {
  const s = (c?.patientData?.source || c?.source || '').trim();
  return s || '-';
}

function deriveRegisteredDate(c) {
  // clonedAt is the canonical "added to our system" timestamp for cloned
  // customers; createdAt is the fallback for any future paths that don't
  // come through the clone orchestrator.
  const iso = c?.clonedAt || c?.registeredAt || c?.createdAt || '';
  if (!iso || typeof iso !== 'string') return '';
  return iso.slice(0, 10); // YYYY-MM-DD; UI formats to dd/mm/yyyy
}

/** Membership badge fields read from denormalized finance.* (kept fresh
 *  by getCustomerMembership lazy-expire path). */
function deriveMembership(c) {
  const f = c?.finance || {};
  return {
    type: f.membershipType || null,                    // 'GOLD' | 'DIAMOND' | 'Platinum' | null
    expiry: f.membershipExpiry || null,
    discountPercent: Number(f.membershipDiscountPercent) || 0,
  };
}

/* ─── Money summary helpers ──────────────────────────────────────────────── */

function deriveDepositBalance(c) {
  return roundTHB(Number(c?.finance?.depositBalance) || 0);
}

function deriveWalletBalance(c) {
  return roundTHB(Number(c?.finance?.totalWalletBalance) || 0);
}

function derivePoints(c) {
  return Number(c?.finance?.loyaltyPoints) || 0;
}

/* ─── Per-customer purchase summary (derived from sales) ─────────────────── */

/**
 * Build per-customer index of sales (saleDate-filtered, cancelled excluded).
 * Returns Map<customerId, { totalAmount, lastDate, unpaidCount, count }>.
 *
 * AR3: cancelled sales NEVER contribute to total / count / unpaid.
 *      They DO contribute to lastDate iff the user explicitly opts in
 *      (current behavior: excluded — match the rest of the report).
 * AR4: totalAmount rounded via roundTHB at the boundary.
 */
export function buildCustomerSalesIndex(sales, { from = '', to = '' } = {}) {
  const index = new Map();
  const list = Array.isArray(sales) ? sales : [];
  // Apply date range first if provided. Empty range = no filter.
  const inRange = dateRangeFilter(list, 'saleDate', from, to);
  for (const s of inRange) {
    if (!s || s.status === 'cancelled') continue; // AR3
    const cid = String(s.customerId || '');
    if (!cid) continue;
    const bucket = index.get(cid) || { totalAmount: 0, lastDate: '', unpaidCount: 0, count: 0 };
    const net = Number(s?.billing?.netTotal) || 0;
    bucket.totalAmount += net;
    bucket.count += 1;
    if ((s.payment?.status || 'unpaid') === 'unpaid') bucket.unpaidCount += 1;
    if ((s.saleDate || '') > bucket.lastDate) bucket.lastDate = s.saleDate || '';
    index.set(cid, bucket);
  }
  // Round totals at the boundary
  for (const [k, v] of index.entries()) {
    v.totalAmount = roundTHB(v.totalAmount);
    index.set(k, v);
  }
  return index;
}

/* ─── Row builder ────────────────────────────────────────────────────────── */

/**
 * Build display row for one customer + its purchase summary.
 * Pure: same input → same output. AR15.
 */
export function buildCustomerReportRow(customer, purchaseSummary) {
  const c = customer || {};
  const ps = purchaseSummary || { totalAmount: 0, lastDate: '', unpaidCount: 0, count: 0 };
  const membership = deriveMembership(c);
  return {
    customerId: deriveCustomerId(c),
    customerHN: deriveHN(c),
    customerName: deriveName(c),
    phone: derivePhone(c),
    membership,                           // {type, expiry, discountPercent}
    membershipBadge: membership.type || 'ลูกค้าทั่วไป',
    genderBirth: deriveGenderBirth(c),
    occupationIncome: deriveOccupationIncome(c),
    source: deriveSource(c),
    depositBalance: deriveDepositBalance(c),
    walletBalance: deriveWalletBalance(c),
    points: derivePoints(c),
    purchaseTotal: roundTHB(ps.totalAmount),
    purchaseLastDate: ps.lastDate || '',
    purchaseUnpaidCount: ps.unpaidCount || 0,
    purchaseCount: ps.count || 0,
    registeredDate: deriveRegisteredDate(c),
    consentMarketing: !!(c?.consent?.marketing),
  };
}

/* ─── Aggregator ─────────────────────────────────────────────────────────── */

/**
 * Aggregate be_customers + be_sales into Customer Report shape.
 *
 * @param {Array<Object>} customers — raw be_customers docs
 * @param {Array<Object>} sales     — raw be_sales docs (used for purchase summary)
 * @param {Object} filters
 * @param {string} [filters.from]                 — YYYY-MM-DD; narrows purchase summary only
 * @param {string} [filters.to]                   — YYYY-MM-DD; narrows purchase summary only
 * @param {string} [filters.searchText]           — case-insensitive on HN / name / phone
 * @param {boolean} [filters.marketingConsentOnly=false] — show only customers who consented
 * @param {string} [filters.membershipFilter='all'] — 'all' | 'GOLD' | 'DIAMOND' | 'Platinum' | 'none'
 * @param {string} [filters.sourceFilter='all']     — 'all' | <source string>
 *
 * @returns {{
 *   rows: Array,
 *   totals: { count, depositBalance, walletBalance, points,
 *             purchaseTotal, purchaseUnpaidCount },
 *   meta: { totalCount, filteredCount, range }
 * }}
 */
export function aggregateCustomerReport(customers, sales, filters = {}) {
  const {
    from = '', to = '',
    searchText = '',
    marketingConsentOnly = false,
    membershipFilter = 'all',
    sourceFilter = 'all',
  } = filters;

  const allCustomers = Array.isArray(customers) ? customers : [];
  const salesIndex = buildCustomerSalesIndex(sales, { from, to });

  // 1) Build all rows
  const allRows = allCustomers.map(c => {
    const cid = deriveCustomerId(c);
    const ps = salesIndex.get(cid);
    return buildCustomerReportRow(c, ps);
  });

  // 2) Filters
  let filtered = allRows;

  if (marketingConsentOnly) {
    filtered = filtered.filter(r => r.consentMarketing);
  }

  if (membershipFilter && membershipFilter !== 'all') {
    if (membershipFilter === 'none') {
      filtered = filtered.filter(r => !r.membership.type);
    } else {
      filtered = filtered.filter(r => r.membership.type === membershipFilter);
    }
  }

  if (sourceFilter && sourceFilter !== 'all') {
    filtered = filtered.filter(r => r.source === sourceFilter);
  }

  const q = (searchText || '').trim().toLowerCase();
  if (q) {
    filtered = filtered.filter(r => {
      const hay = `${r.customerHN} ${r.customerName} ${r.phone}`.toLowerCase();
      return hay.includes(q);
    });
  }

  // 3) Sort newest registered first (matches ProClinic)
  filtered = sortBy(filtered, r => r.registeredDate || '', 'desc');

  // 4) Totals — AR5 reconciliation
  let depositSum = 0, walletSum = 0, pointsSum = 0,
      purchaseTotalSum = 0, unpaidSum = 0;
  for (const r of filtered) {
    depositSum += r.depositBalance;
    walletSum += r.walletBalance;
    pointsSum += r.points;
    purchaseTotalSum += r.purchaseTotal;
    unpaidSum += r.purchaseUnpaidCount;
  }

  return {
    rows: filtered,
    totals: {
      count: filtered.length,
      depositBalance: roundTHB(depositSum),
      walletBalance: roundTHB(walletSum),
      points: pointsSum,
      purchaseTotal: roundTHB(purchaseTotalSum),
      purchaseUnpaidCount: unpaidSum,
    },
    meta: {
      totalCount: allCustomers.length,
      filteredCount: filtered.length,
      range: { from, to },
    },
  };
}

/* ─── Column spec — single source of truth for table + CSV (AR11) ───────── */

/**
 * Build the 9-column spec matching ProClinic /admin/report/customer.
 * Caller injects fmtMoney/fmtDate/fmtPoints; tests can pass identity.
 */
export function buildCustomerReportColumns({
  fmtMoney = (v) => v,
  fmtDate = (v) => v,
  fmtPoints = (v) => v,
} = {}) {
  return [
    {
      key: 'customerName',
      label: 'ลูกค้า',
      // Custom render uses HN + name + membership badge — UI handles
    },
    { key: 'genderBirth',       label: 'เพศ / วันเกิด' },
    { key: 'occupationIncome',  label: 'อาชีพ / รายได้' },
    { key: 'source',            label: 'ที่มา' },
    { key: 'depositBalance',    label: 'เงินมัดจำ',  format: fmtMoney },
    { key: 'walletBalance',     label: 'Wallet',     format: fmtMoney },
    { key: 'points',            label: 'คะแนน',      format: fmtPoints },
    {
      key: 'purchaseSummary',
      label: 'การสั่งซื้อ',
      // Composite — UI renders 3 lines (total / last / unpaid count)
      format: (_v, row) => {
        const total = fmtMoney(row.purchaseTotal);
        const last = row.purchaseLastDate ? fmtDate(row.purchaseLastDate) : '-';
        return `ยอดสั่งซื้อ: ${total} บาท | ล่าสุด: ${last} | ค้างชำระ: ${row.purchaseUnpaidCount}`;
      },
    },
    { key: 'registeredDate',    label: 'วันที่ลงทะเบียน', format: fmtDate },
  ];
}
