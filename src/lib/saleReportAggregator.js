// ─── Sale Report Aggregator (Phase 10.2) — pure, deterministic, accounting-grade
//
// Source: be_sales (Phase 6 schema) — see SaleTab.jsx for shape
// Output shape: { rows, totals, meta } per /audit-reports-accuracy AR5
//
// Every numeric column finalized via roundTHB to prevent float drift (AR4).
// Cancelled sales excluded from totals BY DEFAULT (AR3) — toggle to display
// row but they NEVER contribute to totals row.
//
// Time-independent (AR15): no Date.now / new Date / Math.random.
// Filter date range comes in as `from` / `to` parameters.
//
// Reconciles via assertReconcile (AR5): footer.x === sum(rows[*].x).

import { roundTHB, dateRangeFilter } from './reportsUtils.js';

/* ─── Source-shape derivers ──────────────────────────────────────────────── */

/** Map sale.payment.status → display label. Same map used by SaleTab. */
const STATUS_LABEL = { paid: 'ชำระแล้ว', split: 'ชำระบางส่วน', unpaid: 'ค้างชำระ' };

/** Sale type derivation per ProClinic intel /admin/report/sale "ประเภท" col.
 *  Precedence: membership > course > product > medication > '-'. */
function deriveSaleType(sale) {
  if (sale?.membershipId) return 'บัตรสมาชิก';
  const items = sale?.items || {};
  if (Array.isArray(items.courses) && items.courses.length > 0) return 'คอร์ส';
  if (Array.isArray(items.products) && items.products.length > 0) return 'สินค้า';
  if (Array.isArray(items.medications) && items.medications.length > 0) return 'เวชภัณฑ์';
  return '-';
}

/** Category bucket for filter dropdown. Smaller set than display label. */
function deriveSaleTypeKey(sale) {
  if (sale?.membershipId) return 'membership';
  const items = sale?.items || {};
  if (Array.isArray(items.courses) && items.courses.length > 0) return 'course';
  if (Array.isArray(items.products) && items.products.length > 0) return 'product';
  if (Array.isArray(items.medications) && items.medications.length > 0) return 'medication';
  return 'other';
}

/** "รายละเอียด" — first 2 item names + "อีก N" if more. AR14 defensive access. */
function deriveItemSummary(sale) {
  const items = sale?.items || {};
  const all = []
    .concat(Array.isArray(items.courses) ? items.courses : [])
    .concat(Array.isArray(items.products) ? items.products : [])
    .concat(Array.isArray(items.medications) ? items.medications : [])
    .map(it => (it?.name || '').trim())
    .filter(Boolean);
  if (all.length === 0) return '-';
  if (all.length <= 2) return all.join(', ');
  return `${all[0]}, ${all[1]} อีก ${all.length - 2}`;
}

/** "พนักงานขาย" — sellers[].name joined. */
function deriveSellersLabel(sale) {
  const sellers = Array.isArray(sale?.sellers) ? sale.sellers : [];
  return sellers.map(s => (s?.name || '').trim()).filter(Boolean).join(', ') || '-';
}

/** "ช่องทางชำระเงิน" — payment.channels[].name joined for paid/split sales. */
function derivePaymentChannelsLabel(sale) {
  const channels = Array.isArray(sale?.payment?.channels) ? sale.payment.channels : [];
  return channels
    .filter(c => Number(c?.amount) > 0)
    .map(c => (c?.name || '').trim())
    .filter(Boolean)
    .join(' + ') || '-';
}

/** "ยอดที่ชำระ" — sum of channel amounts. AR6: refunds are NOT subtracted here
 *  (refund is a separate column). All currency rounded via roundTHB. */
function derivePaidAmount(sale) {
  const channels = Array.isArray(sale?.payment?.channels) ? sale.payment.channels : [];
  const sum = channels.reduce((s, c) => s + (Number(c?.amount) || 0), 0);
  return roundTHB(sum);
}

/** "การคืนเงิน" — refund amount. v1 reads optional `refundAmount` field on
 *  the sale doc (Phase 6 doesn't write it yet — defaults to 0). When refund
 *  tracking arrives in Phase 11/12, the source will populate this. */
function deriveRefundAmount(sale) {
  return roundTHB(Number(sale?.refundAmount) || 0);
}

/** "เบิกประกัน" — insurance claim. Phase 12 dep — defaults 0 in v1. */
function deriveInsuranceClaim(sale) {
  return roundTHB(Number(sale?.insuranceClaim) || 0);
}

/* ─── Row builder ────────────────────────────────────────────────────────── */

/**
 * Build display row for one sale doc. All currency fields are roundTHB.
 * Pure: same input → same output.
 *
 * @param {object} sale — be_sale doc
 * @param {Object<string, object>} [customerLookup] — optional Map / object
 *   keyed by customerId for HN/name backfill when the sale doc has empty
 *   denormalized values (legacy sales pre-2026-04-19 fix where the
 *   treatment-page auto-sale wrote customerHN: '').
 */
export function buildSaleReportRow(sale, customerLookup = null) {
  const s = sale || {};
  const billing = s.billing || {};
  const payment = s.payment || {};
  const netTotal = roundTHB(Number(billing.netTotal) || 0);
  const depositApplied = roundTHB(Number(billing.depositApplied) || 0);
  const walletApplied = roundTHB(Number(billing.walletApplied) || 0);
  const paidAmount = derivePaidAmount(s);
  const refundAmount = deriveRefundAmount(s);
  const insuranceClaim = deriveInsuranceClaim(s);
  // ค้างชำระ = max(0, netTotal − paid). Refund DOES NOT reduce ค้างชำระ
  // (refund is post-payment money returned, separate from outstanding balance).
  const outstandingAmount = roundTHB(Math.max(0, netTotal - paidAmount));
  const isCancelled = s.status === 'cancelled';

  const cid = s.customerId ? String(s.customerId) : '';
  // Backfill HN/name from customer lookup when sale doc has empty fields —
  // self-healing for legacy data. Lookup is optional so unit tests stay pure.
  let resolvedHN = s.customerHN || '';
  let resolvedName = s.customerName || '';
  if ((!resolvedHN || !resolvedName) && cid && customerLookup) {
    const c = typeof customerLookup.get === 'function'
      ? customerLookup.get(cid)
      : customerLookup[cid];
    if (c) {
      if (!resolvedHN) resolvedHN = c.proClinicHN || c.hn || '';
      if (!resolvedName) {
        const pd = c.patientData || {};
        const composed = `${pd.prefix || ''} ${pd.firstName || ''} ${pd.lastName || ''}`.trim();
        resolvedName = composed || pd.nickname || c.name || '';
      }
    }
  }

  return {
    saleDate: s.saleDate || '',
    saleId: s.saleId || s.id || '',
    customerId: cid,
    customerHN: resolvedHN,
    customerName: resolvedName,
    saleType: deriveSaleType(s),
    saleTypeKey: deriveSaleTypeKey(s),
    itemsSummary: deriveItemSummary(s),
    sellersLabel: deriveSellersLabel(s),
    netTotal,
    depositApplied,
    walletApplied,
    refundAmount,
    insuranceClaim,
    paidAmount,
    paymentChannels: derivePaymentChannelsLabel(s),
    outstandingAmount,
    paymentStatus: payment.status || 'unpaid',
    paymentStatusLabel: STATUS_LABEL[payment.status] || 'ค้างชำระ',
    createdBy: s.createdBy || (Array.isArray(s.sellers) && s.sellers[0]?.name) || '-',
    cancelledBy: s.cancelledBy || (isCancelled ? '-' : ''),
    isCancelled,
  };
}

/* ─── Aggregator ─────────────────────────────────────────────────────────── */

/**
 * Aggregate be_sales into Sale Report shape.
 *
 * @param {Array<Object>} sales — raw be_sales docs
 * @param {Object} filters
 * @param {string} [filters.from]            — YYYY-MM-DD (inclusive)
 * @param {string} [filters.to]              — YYYY-MM-DD (inclusive)
 * @param {string} [filters.statusFilter]    — 'all' | 'paid' | 'split' | 'unpaid'
 * @param {string} [filters.saleTypeFilter]  — 'all' | 'course' | 'product' | 'medication' | 'membership'
 * @param {boolean} [filters.includeCancelled=false] — show cancelled rows; AR3: still excluded from totals
 * @param {string} [filters.searchText]      — case-insensitive contains on saleId / HN / customerName
 * @param {Array<object>} [filters.customers] — optional be_customers list for HN/name backfill
 *   on legacy sales that were written with empty customerHN. When provided,
 *   each row resolves missing HN/name from the customer doc keyed by customerId.
 *
 * @returns {{
 *   rows: Array,
 *   totals: { count, netTotal, depositApplied, walletApplied, refundAmount,
 *             insuranceClaim, paidAmount, outstandingAmount },
 *   meta: { totalCount, filteredCount, cancelledShown, range }
 * }}
 */
export function aggregateSaleReport(sales, filters = {}) {
  const {
    from = '',
    to = '',
    statusFilter = 'all',
    saleTypeFilter = 'all',
    includeCancelled = false,
    searchText = '',
    customers = null,
  } = filters;

  // Build O(1) lookup once per aggregation if customers list provided.
  const customerLookup = Array.isArray(customers)
    ? new Map(customers.map(c => [String(c?.proClinicId || c?.id || ''), c]))
    : null;

  const allSales = Array.isArray(sales) ? sales : [];

  // 1) Date filter (inclusive both ends — AR1)
  let filtered = dateRangeFilter(allSales, 'saleDate', from, to);

  // 2) Cancelled filter — default exclude. Even when included, we still mark
  //    isCancelled on row so totals can skip them.
  if (!includeCancelled) {
    filtered = filtered.filter(s => s.status !== 'cancelled');
  }

  // 3) Status filter (paid/split/unpaid)
  if (statusFilter !== 'all') {
    filtered = filtered.filter(s => (s.payment?.status || 'unpaid') === statusFilter);
  }

  // 4) Sale type filter
  if (saleTypeFilter !== 'all') {
    filtered = filtered.filter(s => deriveSaleTypeKey(s) === saleTypeFilter);
  }

  // 5) Search filter — case-insensitive contains across saleId / HN / name
  const q = (searchText || '').trim().toLowerCase();
  if (q) {
    filtered = filtered.filter(s => {
      const hay = `${s.saleId || ''} ${s.customerHN || ''} ${s.customerName || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }

  // 6) Build display rows + sort newest first by (saleDate desc, saleId desc)
  const rows = filtered
    .map(s => buildSaleReportRow(s, customerLookup))
    .sort((a, b) => {
      const c = (b.saleDate || '').localeCompare(a.saleDate || '');
      if (c !== 0) return c;
      return (b.saleId || '').localeCompare(a.saleId || '');
    });

  // 7) Totals — AR3: cancelled rows EXCLUDED from totals even when displayed
  const totalsRows = rows.filter(r => !r.isCancelled);
  let netTotalSum = 0, depositSum = 0, walletSum = 0, refundSum = 0,
      insuranceSum = 0, paidSum = 0, outstandingSum = 0;
  for (const r of totalsRows) {
    netTotalSum += r.netTotal;
    depositSum += r.depositApplied;
    walletSum += r.walletApplied;
    refundSum += r.refundAmount;
    insuranceSum += r.insuranceClaim;
    paidSum += r.paidAmount;
    outstandingSum += r.outstandingAmount;
  }

  const totals = {
    count: totalsRows.length,
    netTotal: roundTHB(netTotalSum),
    depositApplied: roundTHB(depositSum),
    walletApplied: roundTHB(walletSum),
    refundAmount: roundTHB(refundSum),
    insuranceClaim: roundTHB(insuranceSum),
    paidAmount: roundTHB(paidSum),
    outstandingAmount: roundTHB(outstandingSum),
  };

  return {
    rows,
    totals,
    meta: {
      totalCount: allSales.length,
      filteredCount: rows.length,
      cancelledShown: includeCancelled,
      range: { from, to },
    },
  };
}

/* ─── Column spec — single source of truth shared by table + CSV (AR11) ──── */

/** Re-import-friendly column factory. Receives `fmtMoney` + `fmtDate` so the
 *  caller (UI) controls locale formatting; tests can pass identity functions
 *  to verify pure values. AR12: currency MUST go through fmtMoney externally. */
export function buildSaleReportColumns({ fmtMoney = (v) => v, fmtDate = (v) => v } = {}) {
  return [
    { key: 'saleDate',           label: 'วันที่ขาย',        format: fmtDate },
    { key: 'saleId',             label: 'เลขที่ขาย' },
    { key: 'customerHN',         label: 'HN' },
    { key: 'customerName',       label: 'ลูกค้า' },
    { key: 'saleType',           label: 'ประเภท' },
    { key: 'itemsSummary',       label: 'รายละเอียด' },
    { key: 'sellersLabel',       label: 'พนักงานขาย' },
    { key: 'netTotal',           label: 'ราคาหลังหักส่วนลด',  format: fmtMoney },
    { key: 'depositApplied',     label: 'หักมัดจำ',         format: fmtMoney },
    { key: 'walletApplied',      label: 'Wallet',           format: fmtMoney },
    { key: 'refundAmount',       label: 'การคืนเงิน',        format: fmtMoney },
    { key: 'insuranceClaim',     label: 'เบิกประกัน',        format: fmtMoney },
    { key: 'paidAmount',         label: 'ยอดที่ชำระ',         format: fmtMoney },
    { key: 'paymentChannels',    label: 'ช่องทางชำระเงิน' },
    { key: 'outstandingAmount',  label: 'ยอดค้างชำระ',       format: fmtMoney },
    { key: 'paymentStatusLabel', label: 'สถานะชำระเงิน' },
    { key: 'createdBy',          label: 'ผู้ทำรายการ' },
    { key: 'cancelledBy',        label: 'ผู้ยกเลิก' },
  ];
}
