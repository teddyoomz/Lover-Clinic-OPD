// ─── Stock Report Aggregator (Phase 10.5) — pure, deterministic ───────────
//
// Source: be_stock_batches (Phase 8 schema — buildQtyNumeric shape)
//         + master_data/products (for name, type, category, unit, status).
//
// Output shape: { rows, totals, meta } per /audit-reports-accuracy AR5.
//
// Iron-clad gates:
//   - AR2 empty/null input safety
//   - AR4 every currency value rounded via roundTHB
//   - AR5 footer reconciles:
//       totals.totalQty     === sum(rows.totalQty)
//       totals.totalValue   === sum(rows.totalValue)
//       totals.nearExpiryQty=== sum(rows.nearExpiryQty)
//       totals.expiredQty   === sum(rows.expiredQty)
//   - AR13 dates rendered as dd/mm/yyyy ค.ศ. (admin) — by UI layer
//   - AR14 defensive ?. access throughout
//   - AR15 idempotent — pure function of (batches, products, filters, nowISO)
//
// Triangle-verified (2026-04-19):
//   - 9 columns via opd.js intel /admin/report/stock
//   - filter names match ProClinic: q, product_category_id, product_status,
//     product_type, is_available (hidden)
//   - "จำนวน" includes expired + near-expiry (it's ALL remaining qty);
//     "ใกล้หมดอายุ" + "หมดอายุ" are additive sub-counters shown alongside.

import { roundTHB } from './reportsUtils.js';

/** Days considered "near expiry" — matches ProClinic's default 30-day window. */
export const NEAR_EXPIRY_DAYS = 30;

/* ─── Source-shape helpers ──────────────────────────────────────────────── */

/** Pull remaining qty from batch, handling both {remaining,total} + legacy scalar shapes. */
function batchRemaining(batch) {
  const r = Number(batch?.qty?.remaining);
  if (Number.isFinite(r)) return r;
  const s = Number(batch?.qty);
  return Number.isFinite(s) ? s : 0;
}

/** Cost-per-unit stored on batch. originalCost is canonical; `cost` is the legacy fallback. */
function batchCost(batch) {
  const oc = Number(batch?.originalCost);
  if (Number.isFinite(oc)) return oc;
  const c = Number(batch?.cost);
  return Number.isFinite(c) ? c : 0;
}

/**
 * Expiry classification: -1 = expired, 0..NEAR = near, >NEAR = safe, null = no expiry.
 * asOfMs is the "now" reference (ms since epoch) — caller passes a fixed
 * value for deterministic tests.
 */
function classifyExpiry(batch, asOfMs) {
  if (!batch?.expiresAt) return null;
  const expMs = Date.parse(batch.expiresAt);
  if (Number.isNaN(expMs)) return null;
  if (expMs < asOfMs) return -1; // already expired
  const daysLeft = Math.floor((expMs - asOfMs) / 86400000);
  if (daysLeft <= NEAR_EXPIRY_DAYS) return daysLeft;
  return daysLeft; // >NEAR_EXPIRY_DAYS = safe
}

/* ─── Row builder ────────────────────────────────────────────────────────── */

/**
 * Build a per-product summary row from a set of batches + the product master doc.
 *
 * Weighted-avg cost:
 *   - Denominator: sum(qty) across ALL non-expired+expired batches (remaining>0)
 *   - Numerator:   sum(qty × cost) across the same set
 *   - Skip batches with qty=0 (would pollute average) — already filtered by
 *     loadAllStockBatchesForReport, but double-guard here
 *   - Denominator===0 → weighted-avg = 0 (no rows with qty to average)
 *
 * totalValue = sum(qty × cost). We use the actual batch costs, NOT totalQty ×
 * weightedAvg, since the latter would drift on odd rounding.
 */
export function buildStockReportRow(product, batches, asOfMs) {
  const p = product || {};
  const productId = String(p.id || p.productId || '');
  const safeBatches = Array.isArray(batches) ? batches : [];

  let totalQty = 0;
  let weightedNumerator = 0;
  let weightedDenominator = 0;
  let nearExpiryQty = 0;
  let expiredQty = 0;
  let totalValue = 0;
  // Track whether any batch had a unit; fall back to product.stockConfig.unit
  // or product.unit so we always have something to render.
  let resolvedUnit = '';

  for (const b of safeBatches) {
    const qty = batchRemaining(b);
    if (qty <= 0) continue;
    const cost = batchCost(b);
    totalQty += qty;
    totalValue += qty * cost;
    weightedNumerator += qty * cost;
    weightedDenominator += qty;

    const cls = classifyExpiry(b, asOfMs);
    if (cls !== null) {
      if (cls < 0) expiredQty += qty;
      else if (cls <= NEAR_EXPIRY_DAYS) nearExpiryQty += qty;
    }

    if (!resolvedUnit && typeof b.unit === 'string' && b.unit.trim()) {
      resolvedUnit = b.unit.trim();
    }
  }

  const weightedAvgCost = weightedDenominator > 0
    ? weightedNumerator / weightedDenominator
    : 0;

  if (!resolvedUnit) {
    resolvedUnit = (p?.stockConfig?.unit || p?.unit || '').trim();
  }

  return {
    productId,
    productCode: productId, // ProClinic shows ID as code (plan 3.4)
    productName: p?.name || '-',
    productType: p?.type || '',
    productCategory: p?.category || p?.categoryName || '',
    productStatus: p?.status || 'ใช้งาน',
    unit: resolvedUnit,
    totalQty: roundTHB(totalQty),
    weightedAvgCost: roundTHB(weightedAvgCost),
    totalValue: roundTHB(totalValue),
    nearExpiryQty: roundTHB(nearExpiryQty),
    expiredQty: roundTHB(expiredQty),
    batchCount: safeBatches.length,
  };
}

/* ─── Aggregator ─────────────────────────────────────────────────────────── */

/**
 * Aggregate be_stock_batches + master_data/products into Stock Report shape.
 *
 * @param {Array<Object>} batches       — raw be_stock_batches docs (filtered to
 *                                         active/expired-status with qty>0)
 * @param {Array<Object>} products      — raw master_data/products docs
 * @param {Object} filters
 * @param {string} [filters.searchText]                   — on name or productId
 * @param {string} [filters.productType='all']            — 'all' | 'ยา' | 'สินค้าหน้าร้าน' | 'สินค้าสิ้นเปลือง'
 * @param {string} [filters.productCategory='all']        — 'all' | <exact category name>
 * @param {string} [filters.productStatus='all']          — 'all' | 'ใช้งาน' | 'พักใช้งาน'
 * @param {boolean} [filters.showZeroQty=false]           — hide totalQty===0 products by default
 * @param {string}  [filters.nowISO]                      — for deterministic "near-expiry" test
 *
 * @returns {{
 *   rows: Array,
 *   totals: { productCount, totalQty, totalValue, nearExpiryQty, expiredQty,
 *             near30ProductCount, expiredProductCount },
 *   meta: { totalCount, filteredCount, nearExpiryDays }
 * }}
 */
export function aggregateStockReport(batches, products, filters = {}) {
  const {
    searchText = '',
    productType = 'all',
    productCategory = 'all',
    productStatus = 'all',
    showZeroQty = false,
    nowISO,
  } = filters;

  const asOfMs = nowISO ? Date.parse(nowISO) : Date.now();
  // NaN fallback: if a bad nowISO is passed, use Date.now() rather than
  // crashing the aggregator.
  const safeAsOfMs = Number.isNaN(asOfMs) ? Date.now() : asOfMs;

  const safeBatches = Array.isArray(batches) ? batches : [];
  const safeProducts = Array.isArray(products) ? products : [];

  // 1) Group batches by productId — one pass.
  const batchesByProduct = new Map();
  for (const b of safeBatches) {
    const pid = String(b?.productId || '');
    if (!pid) continue;
    const bucket = batchesByProduct.get(pid) || [];
    bucket.push(b);
    batchesByProduct.set(pid, bucket);
  }

  // 2) Build rows keyed by product. Include products with batches even if
  //    the master doc doesn't exist (so no stock is hidden by missing data).
  const productIndex = new Map();
  for (const p of safeProducts) {
    const pid = String(p?.id || p?.productId || '');
    if (!pid) continue;
    productIndex.set(pid, p);
  }
  // Also ensure every productId seen in batches gets a row, even if there's
  // no master_data entry — show productName from batches as a fallback.
  const seenPids = new Set(productIndex.keys());
  for (const pid of batchesByProduct.keys()) seenPids.add(pid);

  let allRows = [];
  for (const pid of seenPids) {
    const product = productIndex.get(pid) || {
      id: pid,
      name: batchesByProduct.get(pid)?.[0]?.productName || '-',
      type: '', category: '', status: 'ใช้งาน',
    };
    const batches = batchesByProduct.get(pid) || [];
    allRows.push(buildStockReportRow(product, batches, safeAsOfMs));
  }

  // 3) Optional: hide zero-qty rows (default — matches ProClinic UX).
  if (!showZeroQty) {
    allRows = allRows.filter(r => r.totalQty > 0);
  }

  // 4) Filters
  let rows = allRows;
  if (productType && productType !== 'all') {
    rows = rows.filter(r => r.productType === productType);
  }
  if (productCategory && productCategory !== 'all') {
    rows = rows.filter(r => r.productCategory === productCategory);
  }
  if (productStatus && productStatus !== 'all') {
    rows = rows.filter(r => r.productStatus === productStatus);
  }
  const q = (searchText || '').trim().toLowerCase();
  if (q) {
    rows = rows.filter(r => {
      const hay = `${r.productCode} ${r.productName}`.toLowerCase();
      return hay.includes(q);
    });
  }

  // 5) Sort: by productName asc (Thai locale)
  rows.sort((a, b) => String(a.productName).localeCompare(String(b.productName), 'th'));

  // 6) Totals — AR5 reconciliation
  let totalQty = 0, totalValue = 0, nearExpiryQty = 0, expiredQty = 0;
  let near30ProductCount = 0, expiredProductCount = 0;
  for (const r of rows) {
    totalQty += r.totalQty;
    totalValue += r.totalValue;
    nearExpiryQty += r.nearExpiryQty;
    expiredQty += r.expiredQty;
    if (r.nearExpiryQty > 0) near30ProductCount += 1;
    if (r.expiredQty > 0) expiredProductCount += 1;
  }

  return {
    rows,
    totals: {
      productCount: rows.length,
      totalQty: roundTHB(totalQty),
      totalValue: roundTHB(totalValue),
      nearExpiryQty: roundTHB(nearExpiryQty),
      expiredQty: roundTHB(expiredQty),
      near30ProductCount,
      expiredProductCount,
    },
    meta: {
      totalCount: allRows.length,
      filteredCount: rows.length,
      nearExpiryDays: NEAR_EXPIRY_DAYS,
    },
  };
}

/* ─── Column spec — single source of truth for table + CSV (AR11) ───────── */

/**
 * Build the 9-column spec matching ProClinic /admin/report/stock.
 * Caller injects fmtMoney + fmtQty; tests can pass identity.
 */
export function buildStockReportColumns({
  fmtMoney = (v) => v,
  fmtQty = (v, unit) => unit ? `${v} ${unit}` : String(v),
} = {}) {
  return [
    { key: 'productCode',     label: 'รหัสสินค้า' },
    { key: 'productName',     label: 'ชื่อสินค้า' },
    { key: 'productType',     label: 'ประเภท' },
    { key: 'productCategory', label: 'หมวดหมู่' },
    { key: 'weightedAvgCost', label: 'ต้นทุน/หน่วย', format: (v) => fmtMoney(v) },
    {
      key: 'totalQty',        label: 'จำนวน',
      format: (_v, row) => fmtQty(row?.totalQty || 0, row?.unit || ''),
    },
    { key: 'totalValue',      label: 'มูลค่ารวม', format: (v) => fmtMoney(v) },
    {
      key: 'nearExpiryQty',   label: 'ใกล้หมดอายุ',
      format: (_v, row) => fmtQty(row?.nearExpiryQty || 0, row?.unit || ''),
    },
    {
      key: 'expiredQty',      label: 'หมดอายุ',
      format: (_v, row) => fmtQty(row?.expiredQty || 0, row?.unit || ''),
    },
  ];
}
