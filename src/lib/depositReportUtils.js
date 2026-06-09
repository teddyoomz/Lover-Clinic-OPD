// ─── Deposit report helpers — pure, deterministic (2026-06-09) ─────────────
// Shared by reports-payment (PaymentSummaryTab) + reports-sale (SaleReportTab).
// Non-mutating; inputs treated read-only.
//
// MONEY SEMANTICS:
//  - "received" = a deposit whose cash genuinely entered the account. Every
//    status EXCEPT 'cancelled' counts (cancelled = reversed / never received).
//    refunded/expired money DID come in (the refund is a separate outflow shown
//    apart — Q1=A gross, refunds not subtracted).
//  - "remaining in system" = Σ remainingAmount of active|partial deposits
//    (V154: remainingAmount is maintained as amount − usedAmount − refundAmount).

import { roundTHB } from './reportsUtils.js';

/**
 * Deposits whose money was RECEIVED in [from, to] by `paymentDate`.
 * Excludes cancelled. Empty/missing paymentDate is excluded by a from/to bound
 * (createDeposit always sets paymentDate, so real docs always pass).
 *
 * @param {Array} deposits — be_deposits docs
 * @param {{from?:string,to?:string}} [range] — YYYY-MM-DD inclusive
 * @returns {Array} filtered deposits (same refs)
 */
export function depositsReceivedInRange(deposits, { from = '', to = '' } = {}) {
  return (Array.isArray(deposits) ? deposits : []).filter(d => {
    if (!d || d.status === 'cancelled') return false;
    const pd = String(d.paymentDate || '');
    if (from && pd < from) return false;
    if (to && pd > to) return false;
    return true;
  });
}

/**
 * Total deposit money still held by the clinic = Σ remainingAmount of
 * active|partial deposits. Other statuses carry 0 remaining (used/refunded/
 * cancelled/expired) so excluding them is also defensive against stale fields.
 *
 * @param {Array} deposits — be_deposits docs
 * @returns {number} THB-rounded sum
 */
export function sumSystemRemainingDeposits(deposits) {
  let total = 0;
  for (const d of (Array.isArray(deposits) ? deposits : [])) {
    if (d && (d.status === 'active' || d.status === 'partial')) {
      total += Number(d.remainingAmount) || 0;
    }
  }
  return roundTHB(total);
}

/**
 * Deep-link to the finance · deposit tab focused on one deposit record.
 * BackendDashboard parses ?tab=finance&subtab=deposit&deposit=<id> → opens the
 * DepositPanel DetailModal for that deposit. Opened in a new tab so the report
 * keeps its context (mirrors the report's customer-link pattern).
 *
 * @param {string} depositId
 * @returns {string} absolute URL
 */
export function buildDepositDeepLinkUrl(depositId) {
  const origin = (typeof window !== 'undefined' && window.location && window.location.origin) || '';
  return `${origin}?backend=1&tab=finance&subtab=deposit&deposit=${encodeURIComponent(String(depositId || ''))}`;
}
