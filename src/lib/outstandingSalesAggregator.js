// ─── Outstanding-sales report aggregator — pure ────────────────────────────
// "รายการขายค้างชำระ": sales whose net total exceeds the amount actually paid.
//
// Sale total  = billing.netTotal (recon canonical, verified on live sales
//               2026-07-07). netTotal is ALREADY net of billDiscount +
//               depositApplied + walletApplied, so those must NOT be re-added.
// Paid        = Σ payment.channels[].amount (enabled) — this is the REAL money
//               field on be_sales (verified against prod 2026-07-08: the
//               `totalPaidAmount` field is undefined on every live sale; payment
//               is recorded in payment.channels[{method,amount,enabled}]).
//               Legacy fallback to totalPaidAmount/etc for pre-channels docs.
// Outstanding = total − paid, rounded to 2dp; rows with outstanding ≤ 0.005 skip.
//
// Excludes cancelled/refunded sales AND AUDIT_SALE_SOURCES — course-mutation
// records (reduceRemaining/addRemaining/exchange/share) are NOT money sales
// (the reconciliation false-positive lesson, 2026-07-07). Never judge them.
//
// L2 (2026-07-08): with the correct paid field, prod outstanding = 0 (the clinic
// is pay-at-point-of-sale). The earlier `totalPaidAmount` read produced ฿1.67M
// of fake receivables — caught by Rule Q L2 before ship (see V-log).

const AUDIT_SALE_SOURCES = ['reduceRemaining', 'addRemaining', 'exchange', 'share'];
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const round2 = (n) => Math.round(n * 100) / 100;
const saleTotal = (s) => num(s?.billing?.netTotal ?? s?.billing?.grandTotal ?? s?.billing?.total ?? s?.total);
const salePaid = (s) => {
  const chans = s?.payment?.channels;
  if (Array.isArray(chans)) {
    return round2(chans.filter(c => c && c.enabled !== false).reduce((t, c) => t + num(c.amount), 0));
  }
  // legacy docs without payment.channels[]
  return num(s?.totalPaidAmount ?? s?.total_paid_amount ?? s?.payment?.totalPaid ?? s?.paidAmount);
};

/**
 * @param {Array<object>} sales — be_sales docs
 * @returns {{ rows:Array, totals:{count:number,gross:number,paid:number,outstanding:number} }}
 */
export function aggregateOutstanding(sales = []) {
  const rows = [];
  let outstandingTotal = 0, grossTotal = 0, paidTotal = 0;
  for (const s of (sales || [])) {
    if (s?.status === 'cancelled' || s?.status === 'refunded' || s?.refunded) continue;
    if (AUDIT_SALE_SOURCES.includes(s?.source)) continue;
    const total = saleTotal(s);
    const paid = salePaid(s);
    const outstanding = round2(total - paid);
    if (outstanding <= 0.005) continue;
    rows.push({
      id: s.id, ref: s.saleId || s.id, date: s.saleDate || '',
      customer: s.customerName || '-', total, paid, outstanding, status: s.status || '',
    });
    outstandingTotal += outstanding;
    grossTotal += total;
    paidTotal += paid;
  }
  rows.sort((a, b) => b.outstanding - a.outstanding);
  return {
    rows,
    totals: {
      count: rows.length,
      gross: round2(grossTotal),
      paid: round2(paidTotal),
      outstanding: round2(outstandingTotal),
    },
  };
}
