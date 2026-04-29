// ─── DF Payout Aggregator — Phase 13.4.1 pure function ────────────────────
// Given a window of be_sales + all be_doctors + be_df_groups + be_df_staff_rates,
// compute per-doctor payout. Reuses the Phase 13.3.1 resolver + computer.
//
// Doctor ID source precedence per sale (Phase 14.5 update):
//   0. treatment.detail.dfEntries[] (via treatments[] + linkedSaleId match) —
//      AUTHORITATIVE. When a treatment carries explicit DF entries, use them
//      verbatim and skip the sale-inference path below. This is the model
//      post Phase 14.4 where TreatmentFormPage stores per-doctor per-course
//      DF via DfEntryModal.
//   1. sale.sellers[] — each seller.sellerId gets their percent share of each line
//   2. sale.doctorId (legacy single-doctor sales) — full credit for every line
//
// For the sellers[] case: each seller gets DF on (line_subtotal × seller.percent/100).
// Matches Phase 12.9 sale split semantics (SA-4 sum(percent)=100).
//
// Line subtotal: qty × price × (1 − item_discount_percent) / or (qty×price − baht_discount).
// Matches Phase 13.1.3 Quotation computation for consistency.

import { getRateForStaffCourse, computeDfAmount, computeCourseUsageWeight } from './dfGroupValidation.js';

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
 * @param {Array} [args.treatments]   - be_treatments docs. Those with
 *                                      `detail.dfEntries[]` + `detail.linkedSaleId`
 *                                      override sale inference for the matching sale
 *                                      (Phase 14.5).
 * @param {Array} args.doctors        - be_doctors docs
 * @param {Array} args.groups         - be_df_groups docs
 * @param {Array} args.staffOverrides - be_df_staff_rates docs
 * @param {string} [args.startDate]   - inclusive, YYYY-MM-DD
 * @param {string} [args.endDate]     - inclusive, YYYY-MM-DD
 * @param {boolean} [args.includeCancelled=false]
 * @returns {{ rows: Array, summary: { total, doctorCount, saleCount } }}
 */
export function computeDfPayoutReport({
  sales = [], treatments = [], doctors = [], groups = [], staffOverrides = [],
  startDate = '', endDate = '', includeCancelled = false,
}) {
  const doctorById = new Map(
    (doctors || []).map((d) => [String(d.doctorId || d.id), d]),
  );
  const perDoctor = new Map(); // doctorId → { id, name, dfGroupId, totalDf, saleSet, lineCount, breakdown: [] }

  // Phase 14.5: index treatments by linkedSaleId when they carry explicit
  // dfEntries. Lookup during the sale loop short-circuits inference.
  //
  // Phase 12.2b follow-up (2026-04-24): changed from last-wins Map to
  // accumulating array so MULTIPLE treatments linked to the same sale
  // each contribute their own proportional DF share. Required for the
  // partial-usage spec — a ฿50,000 course with 10% DF used across two
  // visits splits ฿5,000 as ฿1,250 (visit 1 = 25%) + ฿3,750 (visit 2 =
  // 75%) instead of double-counting or dropping one visit silently.
  const explicitBySale = new Map(); // saleId → Array<{ treatment, entries }>
  for (const t of (treatments || [])) {
    // Phase 12.2b follow-up (2026-04-25): read linkedSaleId from EITHER
    // `t.detail.linkedSaleId` (where TFP writes via setTreatmentLinkedSaleId)
    // OR `t.linkedSaleId` (top-level, written by the same helper +
    // _clearLinkedTreatmentsHasSale). Belt-and-suspenders so legacy docs
    // that have only one shape still resolve. User-reported bug:
    // "ค่ามือหมอที่คิด ไม่ได้เชื่อมกับหน้ารายงาน DF" — before this fix
    // NEITHER shape was ever written, so this lookup returned '' for
    // every treatment and the aggregator skipped every explicit entry.
    const linked = String(t?.detail?.linkedSaleId || t?.linkedSaleId || '');
    const entries = Array.isArray(t?.detail?.dfEntries) ? t.detail.dfEntries : [];
    if (linked && entries.length > 0) {
      if (!explicitBySale.has(linked)) explicitBySale.set(linked, []);
      explicitBySale.get(linked).push({ treatment: t, entries });
    }
  }

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

    // Phase 14.5: if a treatment with explicit dfEntries covers this sale,
    // aggregate from those entries directly and skip the sale-inference
    // code path below. Per-row rate comes from the entry row (value + type);
    // qty + subtotal still come from the sale line (the entry only carries
    // who + how, not how-much-was-sold).
    //
    // Phase 12.2b follow-up (2026-04-24): iterate ALL treatments linked
    // to this sale (not just one) and scale each treatment's percent DF
    // by the course usage weight — the fraction of the course's total
    // product qty consumed in that visit. Baht DF uses qty directly so
    // it already accounts for per-visit usage and isn't scaled further.
    const saleId = String(sale.saleId || sale.id);
    const explicit = explicitBySale.get(saleId);
    if (explicit && explicit.length > 0) {
      // Phase 12.2b follow-up (2026-04-24): real backend-created sales
      // store course items with `id: <master_course_id>` (SaleTab's
      // confirmBuy maps the purchased item that way). Previous code
      // only keyed courseIndex by `it.courseId` → every production
      // sale produced an empty-string key collision → DF report showed
      // ฿0 across the board. Key by BOTH `courseId` AND `id` so test
      // fixtures (which use `courseId`) AND prod sales (which use `id`)
      // both resolve correctly. Empty keys skipped so products without
      // a courseId don't collide on ''.
      const courseIndex = new Map();
      for (const it of items) {
        if (!it) continue;
        const courseIdKey = String(it.courseId || '').trim();
        const idKey = String(it.id || '').trim();
        if (courseIdKey) courseIndex.set(courseIdKey, it);
        if (idKey && idKey !== courseIdKey) courseIndex.set(idKey, it);
      }
      for (const { treatment, entries } of explicit) {
        const treatmentCourseItems = Array.isArray(treatment?.detail?.courseItems)
          ? treatment.detail.courseItems
          : (Array.isArray(treatment?.courseItems) ? treatment.courseItems : []);
        for (const entry of entries) {
          const doctorId = String(entry.doctorId || '');
          if (!doctorId) continue;
          const doctor = doctorById.get(doctorId);
          const doctorName = doctor?.name
            || `${doctor?.firstname || ''} ${doctor?.lastname || ''}`.trim()
            || doctor?.nickname
            || entry.doctorName
            || '';
          const entryGroupId = String(entry.dfGroupId || '');
          for (const row of (entry.rows || [])) {
            if (!row || !row.enabled) continue;
            const courseId = String(row.courseId || '');
            if (!courseId) continue;
            const matchingItem = courseIndex.get(courseId);
            if (!matchingItem) continue; // row references a course not on the sale
            const qty = Number(matchingItem.qty) || 0;
            const sub = lineSubtotal(matchingItem);
            if (qty <= 0 || sub <= 0) continue;
            const rate = { value: Number(row.value) || 0, type: row.type, source: 'dfEntry' };
            // Weighted percent DF: fraction of course consumed this visit.
            // Baht rate ignores the weight (already per-unit).
            const usageWeight = computeCourseUsageWeight(matchingItem, treatmentCourseItems);
            const df = computeDfAmount(rate, sub, qty, { courseUsageWeight: usageWeight });
            if (df <= 0) continue;
            const reportRow = ensureRow(doctorId, doctorName, entryGroupId);
            reportRow.totalDf += df;
            reportRow.saleSet.add(saleId);
            reportRow.lineCount += 1;
            reportRow.breakdown.push({
              saleId,
              saleDate: sale.saleDate,
              courseId,
              courseName: matchingItem.name || matchingItem.courseName || '',
              qty,
              subtotal: sub,
              rateValue: rate.value,
              rateType: rate.type,
              rateSource: 'dfEntry',
              share: 1, // explicit entry is authoritative — no sharing
              courseUsageWeight: usageWeight,
              treatmentId: treatment?.treatmentId || treatment?.id || null,
              df,
            });
          }
        }
      }
      continue; // skip legacy sale-inference path for this sale
    }

    // Build list of (doctorId, share) pairs for this sale.
    //
    // Phase 16.7-quater (2026-04-29 session 33) — schema flexibility:
    //   1. Accept seller.id ALONGSIDE seller.sellerId. Production data
    //      (verified via preview_eval against live April 2026 sales) uses
    //      `id` field for the seller key — pre-fix the filter rejected
    //      every such seller, leading to all-zero DF in the fallback path.
    //   2. Accept seller.share (0..1) ALONGSIDE seller.percent (0..100) so
    //      legacy + new sale schemas both resolve.
    //   3. When the sum of explicit percents/shares equals zero but
    //      sellers exist, fall back to EQUAL SPLIT (1/N). 43 of 57 April
    //      sales had all-zero percents and no DF computed — equal split is
    //      the safe default that preserves DF visibility while admin fixes
    //      the underlying data drift.
    let assignments = [];
    if (Array.isArray(sale.sellers) && sale.sellers.length > 0) {
      const validSellers = sale.sellers.filter((s) => s && (s.sellerId || s.id));
      if (validSellers.length > 0) {
        const explicitShares = validSellers.map((s) => {
          const pct = Number(s.percent);
          if (Number.isFinite(pct) && pct > 0) return pct / 100;
          const sh = Number(s.share);
          if (Number.isFinite(sh) && sh > 0) return sh;
          return 0;
        });
        const sumShare = explicitShares.reduce((a, b) => a + b, 0);
        if (sumShare > 0) {
          assignments = validSellers.map((s, i) => ({
            doctorId: String(s.sellerId || s.id),
            share: explicitShares[i],
          }));
        } else {
          // All-zero percents: equal split across N sellers
          const evenShare = 1 / validSellers.length;
          assignments = validSellers.map((s) => ({
            doctorId: String(s.sellerId || s.id),
            share: evenShare,
          }));
        }
      }
    }
    if (assignments.length === 0 && sale.doctorId) {
      assignments = [{ doctorId: String(sale.doctorId), share: 1 }];
    }
    if (assignments.length === 0) continue; // unassigned sale — skip

    for (const { doctorId, share } of assignments) {
      if (share <= 0) continue;
      const doctor = doctorById.get(doctorId);
      const doctorName = doctor?.name
        || `${doctor?.firstname || ''} ${doctor?.lastname || ''}`.trim()
        || doctor?.nickname || '';
      const dfGroupId = doctor?.defaultDfGroupId || '';

      for (const it of items) {
        if (!it) continue;
        // Phase 12.2b follow-up (2026-04-24): real backend sales store
        // course master id on `it.id` (not `courseId`). Fall back to
        // both fields so the inference path resolves for prod AND test
        // fixtures. Skip non-course items: when items come from the
        // grouped sale shape (sale.items.courses[] only) everything is
        // a course; when items come from a legacy flat array, require
        // itemType === 'course' OR an explicit courseId to earn DF.
        const courseId = String(it.courseId || it.id || '').trim();
        if (!courseId) continue;
        const isCourseLike = it.itemType == null // grouped path already filtered
          || it.itemType === 'course'
          || !!it.courseId; // test-fixture shape
        if (!isCourseLike) continue;
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
          courseName: it.courseName || it.name || '',
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
