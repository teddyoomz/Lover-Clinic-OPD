// ─── RFM utilities (Phase 10.6) — pure compute for CRM Insight ──────────
//
// Recency / Frequency / Monetary analysis over be_sales.
//
// Iron-clad:
//   - AR8 quintile boundaries over ACTIVE customers (≥1 non-cancelled sale)
//   - AR9 stable boundaries (same input → same output; no RNG / no Date.now
//          flowing into boundary calc)
//   - AR14 defensive access
//   - AR15 pure — asOfISO is a PARAMETER, not Date.now()
//
// Triangle-verified 2026-04-20: 11 segments captured from opd.js intel of
// /admin/crm-insight — Table 2 (5×6 RFM matrix cells).
//
// Segment mapping (R-quintile → F-quintile → M-quintile):
//   Champions       R∈[5]    F∈[5]    M∈[5]         recent + frequent + high-spend
//   Loyalty         R∈[3,4]  F∈[4,5]  M∈[4,5]       frequent + high-spend
//   High Spending   R∈[4,5]  F∈[1,3]  M∈[4,5]       recent + high-spend, new-ish
//   Good            R∈[3,4]  F∈[3]    M∈[3]         average across axes
//   Cheap           R∈[4,5]  F∈[1,2]  M∈[1,2]       recent but low-value
//   Lost Loyalty    R∈[1,2]  F∈[4,5]  M∈[4,5]       was loyal, gone cold
//   Lost Good       R∈[1,2]  F∈[3]    M∈[3]         was average, gone cold
//   Lost High Spending R∈[1,2] F∈[1,3] M∈[4,5]      was high-spend, gone cold
//   Lost Cheap      R∈[1,2]  F∈[1,2]  M∈[1,2]       gone cold, low-value
//   New Customer    R∈[5]    F∈[1]    M∈[1,5]       just signed up, too early
//   About to Sleep  R∈[3]    F∈[1,3]  M∈[1,3]       recent-ish, low-mid
//
// 11 segments total. Default "Unclassified" only if all quintile computation
// fails (e.g. active set ≤1 customer — insufficient for quintiles).

import { quantileBoundaries, quintileOf, sortBy, roundTHB } from './reportsUtils.js';

/** Days between two ISO dates. Negative if date1 > date2. */
function daysBetweenISO(date1ISO, date2ISO) {
  const a = Date.parse(`${date1ISO}T00:00:00.000Z`);
  const b = Date.parse(`${date2ISO}T00:00:00.000Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.floor((b - a) / 86400000);
}

/* ─── Per-customer RFM compute ───────────────────────────────────────────── */

/**
 * Compute per-customer R/F/M/AOV values from active (non-cancelled) sales.
 *
 * @param {Array<{customerId,saleDate,status,billing:{netTotal}}>} sales
 * @param {string} asOfISO   YYYY-MM-DD — "today" for recency
 * @returns {Map<customerId, {R,F,M,AOV,lastSaleDate,firstSaleDate}>}
 */
export function computeRFMRaw(sales, asOfISO) {
  const index = new Map();
  const list = Array.isArray(sales) ? sales : [];
  for (const s of list) {
    if (!s || s.status === 'cancelled') continue; // AR3
    const cid = String(s.customerId || '');
    if (!cid) continue;
    const date = (s.saleDate || '').trim();
    if (!date) continue;
    const amount = Number(s?.billing?.netTotal) || 0;
    const cur = index.get(cid) || {
      totalAmount: 0, count: 0,
      lastSaleDate: '',
      firstSaleDate: '',
    };
    cur.totalAmount += amount;
    cur.count += 1;
    if (date > cur.lastSaleDate) cur.lastSaleDate = date;
    if (!cur.firstSaleDate || date < cur.firstSaleDate) cur.firstSaleDate = date;
    index.set(cid, cur);
  }
  const out = new Map();
  for (const [cid, v] of index.entries()) {
    const R = daysBetweenISO(v.lastSaleDate, asOfISO);
    out.set(cid, {
      R: R == null || R < 0 ? 0 : R,
      F: v.count,
      M: roundTHB(v.totalAmount),
      AOV: v.count > 0 ? roundTHB(v.totalAmount / v.count) : 0,
      lastSaleDate: v.lastSaleDate,
      firstSaleDate: v.firstSaleDate,
    });
  }
  return out;
}

/* ─── Segment classification (11 ProClinic segments) ─────────────────────── */

/**
 * Map a (rQuint, fQuint, mQuint) tuple → segment name.
 *
 * R-quintile: HIGHER quintile = more recent (low days-since-last-sale).
 * F-quintile: HIGHER quintile = more frequent.
 * M-quintile: HIGHER quintile = more money.
 *
 * Matches the 11 segments captured from opd.js intel of /admin/crm-insight.
 */
export function segmentFromQuintiles(rQ, fQ, mQ) {
  // Rule order: most-specific first. Each rule consumes a region of the
  // 5×5×5 cube. Dimensions loosen from strict-all-three at the top to
  // broad-2-axis near the bottom so fallback is always covered.

  // Hottest: recent + frequent + high-spend
  if (rQ >= 5 && fQ >= 5 && mQ >= 5) return 'Champions';

  // Loyalty: medium-to-recent, frequent, high-spend
  if (rQ >= 3 && fQ >= 4 && mQ >= 4) return 'Loyalty';

  // Lost Loyalty: old but was frequent + high-spend
  if (rQ <= 2 && fQ >= 4 && mQ >= 4) return 'Lost Loyalty';

  // New Customer: very recent + very low F (just 1 sale)
  if (rQ >= 5 && fQ <= 1) return 'New Customer';

  // Lost Cheap: old + low-value (M-driven, F-agnostic — a 2-axis loss)
  if (rQ <= 2 && mQ <= 2) return 'Lost Cheap';

  // Lost High Spending: old + was high-spend
  if (rQ <= 2 && mQ >= 4) return 'Lost High Spending';

  // Lost Good: everything else that's gone cold
  if (rQ <= 2) return 'Lost Good';

  // Cheap: recent but low-value
  if (rQ >= 4 && mQ <= 2) return 'Cheap';

  // High Spending: recent + high-spend (medium-to-low F)
  if (rQ >= 4 && mQ >= 4) return 'High Spending';

  // About to Sleep: middle-recency band (R=3), slipping but not gone
  if (rQ === 3) return 'About to Sleep';

  // Good: everything else in the R=4-5 band with mid-value
  return 'Good';
}

/* ─── Main aggregator ─────────────────────────────────────────────────────── */

/**
 * Build full RFM analysis over customers + sales.
 *
 * @param {Array} customers — be_customers docs (optional; used to surface name/HN)
 * @param {Array} sales     — be_sales docs
 * @param {object} opts
 * @param {string} opts.asOfISO — YYYY-MM-DD "today" reference
 * @param {string} [opts.from]   — optional date filter for sales window
 * @param {string} [opts.to]
 * @returns {{
 *   perCustomer: Array<{customerId, customerHN, customerName, R, F, M, AOV, segment, periodBuckets: [6]}>,
 *   segmentSummary: Array<{segment, customerCount, totalRevenue}>,
 *   matrix: { rows: number[], cols: number[], cells: Record<string, {segment, count, percent}> },
 *   meta: { activeCustomerCount, totalCustomers, asOfISO }
 * }}
 */
export function aggregateRFM(customers, sales, opts = {}) {
  const { asOfISO = '', from = '', to = '' } = opts;

  const safeCustomers = Array.isArray(customers) ? customers : [];
  const safeSales = Array.isArray(sales) ? sales : [];

  // Optional date narrow on sales — typically RFM is ALL-TIME, but filter
  // support lets user run "RFM for last 6 months" windows.
  const filtered = (from || to)
    ? safeSales.filter(s => {
        const d = s?.saleDate || '';
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      })
    : safeSales;

  // Compute raw per-customer R/F/M/AOV
  const raw = computeRFMRaw(filtered, asOfISO);

  // Build customer name/HN index
  const custIndex = new Map();
  for (const c of safeCustomers) {
    const cid = String(c?.proClinicId || c?.id || '');
    if (cid) custIndex.set(cid, c);
  }

  // Quintile boundaries — computed over ACTIVE customers only (AR8)
  const activeList = [...raw.values()];
  // Reverse R: LOW recency days = GOOD = high quintile; quintileOf expects
  // high = high quintile, so we compute on NEGATIVE R. Equivalent to
  // "days since" → invert.
  const rValues = activeList.map(v => -v.R);
  const fValues = activeList.map(v => v.F);
  const mValues = activeList.map(v => v.M);
  const rBoundaries = quantileBoundaries(rValues, 5);
  const fBoundaries = quantileBoundaries(fValues, 5);
  const mBoundaries = quantileBoundaries(mValues, 5);

  // Period buckets — 6 time-period windows (newest to oldest), each 30 days
  // Used for the "ยอดชำระเงิน (ใหม่ไปเก่า) 1..6" columns in table 2.
  function periodBucketsForCustomer(cid) {
    const buckets = [0, 0, 0, 0, 0, 0];
    if (!asOfISO) return buckets;
    const asOfMs = Date.parse(`${asOfISO}T00:00:00.000Z`);
    if (Number.isNaN(asOfMs)) return buckets;
    for (const s of filtered) {
      if (!s || s.status === 'cancelled') continue;
      if (String(s.customerId || '') !== cid) continue;
      const sd = Date.parse(`${s.saleDate}T00:00:00.000Z`);
      if (Number.isNaN(sd)) continue;
      const daysAgo = Math.floor((asOfMs - sd) / 86400000);
      if (daysAgo < 0) continue;
      const bucket = Math.min(5, Math.floor(daysAgo / 30));
      buckets[bucket] += Number(s?.billing?.netTotal) || 0;
    }
    return buckets.map(roundTHB);
  }

  // Build per-customer rows
  const perCustomer = [];
  for (const [cid, v] of raw.entries()) {
    const rQ = quintileOf(-v.R, rBoundaries, 5); // invert — more recent = higher quintile
    const fQ = quintileOf(v.F, fBoundaries, 5);
    const mQ = quintileOf(v.M, mBoundaries, 5);
    const segment = segmentFromQuintiles(rQ, fQ, mQ);
    const cust = custIndex.get(cid);
    const name = cust?.patientData
      ? `${cust.patientData.prefix || ''} ${cust.patientData.firstName || ''} ${cust.patientData.lastName || ''}`.trim()
      : cust?.name || '-';
    const hn = cust?.proClinicHN || cust?.hn || '';
    perCustomer.push({
      customerId: cid,
      customerHN: hn,
      customerName: name,
      R: v.R,
      F: v.F,
      M: v.M,
      AOV: v.AOV,
      rQuintile: rQ,
      fQuintile: fQ,
      mQuintile: mQ,
      segment,
      totalPaid: v.M, // alias for CSV/display
      periodBuckets: periodBucketsForCustomer(cid),
      lastSaleDate: v.lastSaleDate,
      firstSaleDate: v.firstSaleDate,
    });
  }

  // Sort: segment rank primary, M desc secondary
  const segmentRank = {
    'Champions': 1, 'Loyalty': 2, 'High Spending': 3, 'Good': 4,
    'New Customer': 5, 'About to Sleep': 6, 'Cheap': 7,
    'Lost Loyalty': 8, 'Lost High Spending': 9, 'Lost Good': 10, 'Lost Cheap': 11,
  };
  const sorted = sortBy(perCustomer, r => segmentRank[r.segment] || 99);

  // Segment summary (Table 1 in ProClinic)
  const segmentMap = new Map();
  for (const r of perCustomer) {
    const cur = segmentMap.get(r.segment) || { customerCount: 0, totalRevenue: 0 };
    cur.customerCount += 1;
    cur.totalRevenue += r.M;
    segmentMap.set(r.segment, cur);
  }
  const segmentSummary = [...segmentMap.entries()]
    .map(([segment, v]) => ({
      segment,
      customerCount: v.customerCount,
      totalRevenue: roundTHB(v.totalRevenue),
      rank: segmentRank[segment] || 99,
    }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ rank, ...rest }) => rest);

  // 5×5 matrix (F × R), cell = { segment-label, count, percent }
  const matrixCells = {};
  for (let fQ = 1; fQ <= 5; fQ++) {
    for (let rQ = 1; rQ <= 5; rQ++) {
      // Use median M-quintile (3) as representative for matrix label
      const segment = segmentFromQuintiles(rQ, fQ, 3);
      const count = perCustomer.filter(r => r.rQuintile === rQ && r.fQuintile === fQ).length;
      const total = perCustomer.length;
      matrixCells[`F${fQ}-R${rQ}`] = {
        segment,
        count,
        percent: total > 0 ? roundTHB((count / total) * 100) : 0,
      };
    }
  }

  return {
    perCustomer: sorted,
    segmentSummary,
    matrix: {
      rows: [5, 4, 3, 2, 1], // F descending (display convention)
      cols: [1, 2, 3, 4, 5], // R ascending
      cells: matrixCells,
    },
    meta: {
      activeCustomerCount: perCustomer.length,
      totalCustomers: safeCustomers.length,
      asOfISO,
      range: { from, to },
      quintileBoundaries: {
        R: rBoundaries,
        F: fBoundaries,
        M: mBoundaries,
      },
    },
  };
}

/* ─── Column spec for per-customer table CSV (13 cols) ───────────────────── */

export function buildRFMColumns({ fmtMoney = (v) => v, fmtDate = (v) => v } = {}) {
  return [
    {
      key: 'customerLabel',
      label: 'ลูกค้า',
      format: (_v, r) => `${r.customerHN || ''} ${r.customerName || ''}`.trim(),
    },
    { key: 'R',         label: 'Recency' },
    { key: 'F',         label: 'Frequency' },
    { key: 'M',         label: 'Monetary', format: (v) => fmtMoney(v) },
    { key: 'AOV',       label: 'AOV', format: (v) => fmtMoney(v) },
    { key: 'segment',   label: 'Segment' },
    { key: 'totalPaid', label: 'ยอดชำระเงิน', format: (v) => fmtMoney(v) },
    { key: 'period1',   label: 'ช่วง 1 (0-30d)', format: (_v, r) => fmtMoney(r.periodBuckets?.[0] || 0) },
    { key: 'period2',   label: 'ช่วง 2 (30-60d)', format: (_v, r) => fmtMoney(r.periodBuckets?.[1] || 0) },
    { key: 'period3',   label: 'ช่วง 3 (60-90d)', format: (_v, r) => fmtMoney(r.periodBuckets?.[2] || 0) },
    { key: 'period4',   label: 'ช่วง 4 (90-120d)', format: (_v, r) => fmtMoney(r.periodBuckets?.[3] || 0) },
    { key: 'period5',   label: 'ช่วง 5 (120-150d)', format: (_v, r) => fmtMoney(r.periodBuckets?.[4] || 0) },
    { key: 'period6',   label: 'ช่วง 6 (150d+)', format: (_v, r) => fmtMoney(r.periodBuckets?.[5] || 0) },
  ];
}
