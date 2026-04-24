// ─── DF Payout Aggregator — Phase 13.4.1 pure function ────────────────────
// Given a window of be_sales + all be_doctors + be_df_groups + be_df_staff_rates,
// compute per-doctor payout. Reuses the Phase 13.3.1 resolver + computer.
//
// Doctor ID source precedence per sale:
//   1. sale.sellers[] — each seller.sellerId gets their percent share of each line
//   2. sale.doctorId (legacy single-doctor sales) — full credit for every line
//
// For the sellers[] case: each seller gets DF on (line_subtotal × seller.percent/100).
// Matches Phase 12.9 sale split semantics (SA-4 sum(percent)=100).
//
// Line subtotal: qty × price × (1 − item_discount_percent) / or (qty×price − baht_discount).
// Matches Phase 13.1.3 Quotation computation for consistency.

import { getRateForStaffCourse, computeDfAmount } from './dfGroupValidation.js';

function lineSubtotal(item) {
  const qty = Number(item?.qty) || 0;
  const price = Number(item?.price) || 0;
  const gross = qty * price;
  const disc = Number(item?.discount ?? item?.itemDiscount) || 0;
  const type = item?.discountType ?? item?.itemDiscountType;
  if (type === 'percent') return Math.max(0, gross * (1 - disc / 100));
  return Math.max(0, gross - disc);
}

function isSaleInRange(sale, startDate, endDate) {
  const d = sale?.saleDate || '';
  if (startDate && d < startDate) return false;
  if (endDate && d > endDate) return false;
  return true;
}

/**
 * @param {object} args
 * @param {Array} args.sales          - be_sales docs
 * @param {Array} args.doctors        - be_doctors docs
 * @param {Array} args.groups         - be_df_groups docs
 * @param {Array} args.staffOverrides - be_df_staff_rates docs
 * @param {string} [args.startDate]   - inclusive, YYYY-MM-DD
 * @param {string} [args.endDate]     - inclusive, YYYY-MM-DD
 * @param {boolean} [args.includeCancelled=false]
 * @returns {{ rows: Array, summary: { total, doctorCount, saleCount } }}
 */
export function computeDfPayoutReport({
  sales = [], doctors = [], groups = [], staffOverrides = [],
  startDate = '', endDate = '', includeCancelled = false,
}) {
  const doctorById = new Map(
    (doctors || []).map((d) => [String(d.doctorId || d.id), d]),
  );
  const perDoctor = new Map(); // doctorId → { id, name, dfGroupId, totalDf, saleSet, lineCount, breakdown: [] }

  const ensureRow = (doctorId, doctorName, dfGroupId) => {
    const key = String(doctorId);
    if (!perDoctor.has(key)) {
      perDoctor.set(key, {
        doctorId: key,
        doctorName: doctorName || '',
        dfGroupId: dfGroupId || '',
        totalDf: 0,
        saleSet: new Set(),
        lineCount: 0,
        breakdown: [],
      });
    }
    return perDoctor.get(key);
  };

  for (const sale of sales) {
    if (!sale) continue;
    if (!isSaleInRange(sale, startDate, endDate)) continue;
    if (!includeCancelled && (sale.status === 'cancelled' || sale.refunded)) continue;

    // Sale items may be GROUPED (SaleTab canonical: {promotions, courses,
    // products, medications}) or LEGACY FLAT (pre-Phase-14 converter output).
    // DF payout is course-driven — walk the courses bucket in either shape.
    let items;
    if (Array.isArray(sale.items)) {
      items = sale.items;
    } else if (sale.items && typeof sale.items === 'object') {
      items = Array.isArray(sale.items.courses) ? sale.items.courses : [];
    } else {
      items = [];
    }
    if (items.length === 0) continue;

    // Build list of (doctorId, share) pairs for this sale.
    let assignments = [];
    if (Array.isArray(sale.sellers) && sale.sellers.length > 0) {
      assignments = sale.sellers
        .filter((s) => s && s.sellerId)
        .map((s) => ({ doctorId: String(s.sellerId), share: (Number(s.percent) || 0) / 100 }));
    } else if (sale.doctorId) {
      assignments = [{ doctorId: String(sale.doctorId), share: 1 }];
    } else {
      continue; // unassigned sale — skip
    }

    for (const { doctorId, share } of assignments) {
      if (share <= 0) continue;
      const doctor = doctorById.get(doctorId);
      const doctorName = doctor?.name
        || `${doctor?.firstname || ''} ${doctor?.lastname || ''}`.trim()
        || doctor?.nickname || '';
      const dfGroupId = doctor?.defaultDfGroupId || '';

      for (const it of items) {
        if (!it) continue;
        const courseId = it.courseId;
        if (!courseId) continue; // products don't earn DF in this model
        const qty = Number(it.qty) || 0;
        const sub = lineSubtotal(it);
        if (sub <= 0 || qty <= 0) continue;
        const rate = getRateForStaffCourse(doctorId, courseId, dfGroupId, groups, staffOverrides);
        if (!rate) continue;
        const dfFull = computeDfAmount(rate, sub, qty);
        const df = dfFull * share;
        if (df <= 0) continue;
        // Create row lazily — only when there's a real contribution.
        const row = ensureRow(doctorId, doctorName, dfGroupId);
        row.totalDf += df;
        row.saleSet.add(sale.saleId || sale.id);
        row.lineCount += 1;
        row.breakdown.push({
          saleId: sale.saleId || sale.id,
          saleDate: sale.saleDate,
          courseId,
          courseName: it.courseName || '',
          qty,
          subtotal: sub,
          rateValue: rate.value,
          rateType: rate.type,
          rateSource: rate.source,
          share,
          df,
        });
      }
    }
  }

  const rows = Array.from(perDoctor.values()).map((r) => ({
    doctorId: r.doctorId,
    doctorName: r.doctorName,
    dfGroupId: r.dfGroupId,
    totalDf: Math.round(r.totalDf * 100) / 100,
    saleCount: r.saleSet.size,
    lineCount: r.lineCount,
    breakdown: r.breakdown,
  }));
  rows.sort((a, b) => b.totalDf - a.totalDf);

  const summary = {
    total: Math.round(rows.reduce((s, r) => s + r.totalDf, 0) * 100) / 100,
    doctorCount: rows.length,
    saleCount: new Set(rows.flatMap((r) => Array.from(r.breakdown.map((b) => b.saleId)))).size,
  };

  return { rows, summary };
}
