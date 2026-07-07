// ─── reconcileSaleCore — money reconciliation SSOT (2026-07-07) ──────────────
// V155/V157 residual closed: a sale/TFP auto-sale writes many collections
// NON-atomically (deliberate — the treatment/sale must save). V157 surfaces
// side-effect failures AT SAVE TIME; this module verifies them RETROACTIVELY:
// for each sale, compare what the sale doc CLAIMS happened (billing.depositApplied,
// billing.walletApplied, course items, cancelled status) against the EVIDENCE
// collections (be_deposits.usageHistory, wallet/point transaction nets,
// customer.courses[].linkedSaleId, be_stock_movements.linkedSaleId).
//
// PURE MODULE — no Firebase imports. Consumed by BOTH surfaces via injected
// fetchers (no drift):
//   - ReconciliationReportTab.jsx  (client SDK fetchers, branch-scoped)
//   - api/cron/money-reconciliation-sweep.js (admin SDK fetchers, all branches)
//
// VERDICT DISCIPLINE (Rule Q-honest — a money report must never cry wolf):
//   'ok'          — deterministic match
//   'discrepancy' — deterministic mismatch (actionable; counted)
//   'na'          — channel not used by this sale
//   'info'        — shown, NEVER counted (non-deterministic expectation:
//                   stock movements [skip-flags/premium make "expected"
//                   ambiguous] + points on ACTIVE sales [loyalty rate may be
//                   0/disabled] + courses on CANCELLED sales [used entries
//                   legitimately survive per removeLinkedSaleCourses]).

const THB_EPS = 0.011; // V156 roundTHB boundary — one satang tolerance

function num(v) { return Number(v) || 0; }
function moneyEq(a, b) { return Math.abs(num(a) - num(b)) <= THB_EPS; }

/** Σ(debit) − Σ(credit) per referenceId over a raw tx list. */
export function netByReference(txs, { debitType = 'deduct', creditType = 'refund' } = {}) {
  const map = new Map();
  for (const t of txs || []) {
    const ref = String(t?.referenceId || '');
    if (!ref) continue;
    const a = num(t?.amount);
    const cur = map.get(ref) || 0;
    if (t?.type === debitType) map.set(ref, cur + a);
    else if (t?.type === creditType) map.set(ref, cur - a);
  }
  return map;
}

/** Deposit usage total for one sale across a customer's deposits. */
export function depositUsageForSale(deposits, saleId) {
  const sid = String(saleId);
  let total = 0;
  const entries = [];
  for (const d of deposits || []) {
    for (const u of d?.usageHistory || []) {
      if (String(u?.saleId) === sid) {
        total += num(u?.amount);
        entries.push({ depositId: d.depositId || d.id || '', amount: num(u?.amount) });
      }
    }
  }
  return { total, entries };
}

/** Count course rows the sale should have linked into customer.courses[]. */
export function expectedCourseRows(sale) {
  const items = sale?.items || {};
  const courses = Array.isArray(items.courses) ? items.courses.length : 0;
  const promotions = Array.isArray(items.promotions) ? items.promotions.length : 0;
  return { courses, promotions, total: courses + promotions };
}

/**
 * Reconcile ONE sale against pre-gathered evidence. Pure.
 * @param {object} p
 * @param {object} p.sale — raw be_sales doc (must carry id/saleId)
 * @param {Array}  p.courses — customer.courses[] (raw)
 * @param {Array}  p.deposits — the customer's be_deposits docs (raw)
 * @param {number} p.walletNet — Σdeduct−Σrefund for this saleId (all wallet types)
 * @param {number} p.pointsNet — Σearn−Σreverse for this saleId
 * @param {number} p.stockMovements — non-reversed be_stock_movements with linkedSaleId
 */
export function reconcileSale({ sale, courses, deposits, walletNet, pointsNet, stockMovements }) {
  const saleId = String(sale?.saleId || sale?.id || '');
  const cancelled = String(sale?.status || '') === 'cancelled';
  const discrepancies = [];

  // ── deposit ──
  const expectedDeposit = num(sale?.billing?.depositApplied);
  const { total: foundDeposit, entries: depositEntries } = depositUsageForSale(deposits, saleId);
  let depositVerdict = 'na';
  if (cancelled) {
    // reverseDepositUsage strips the usage entry on cancel — anything left = money not returned
    if (foundDeposit > THB_EPS) {
      depositVerdict = 'discrepancy';
      discrepancies.push(`ยกเลิกแล้วแต่มัดจำยังถูกหักอยู่ ${foundDeposit.toFixed(2)} บาท`);
    } else if (expectedDeposit > 0) depositVerdict = 'ok'; // was applied, correctly reversed
  } else if (expectedDeposit > 0 || foundDeposit > THB_EPS) {
    if (moneyEq(expectedDeposit, foundDeposit)) depositVerdict = 'ok';
    else {
      depositVerdict = 'discrepancy';
      discrepancies.push(expectedDeposit > foundDeposit
        ? `ใบขายบันทึกใช้มัดจำ ${expectedDeposit.toFixed(2)} แต่พบ usage เพียง ${foundDeposit.toFixed(2)} (ขาด ${(expectedDeposit - foundDeposit).toFixed(2)})`
        : `พบ usage มัดจำ ${foundDeposit.toFixed(2)} เกินกว่าที่ใบขายบันทึก ${expectedDeposit.toFixed(2)}`);
    }
  }

  // ── wallet ──
  const expectedWallet = num(sale?.billing?.walletApplied);
  const foundWallet = num(walletNet);
  let walletVerdict = 'na';
  if (cancelled) {
    if (foundWallet > THB_EPS) {
      walletVerdict = 'discrepancy';
      discrepancies.push(`ยกเลิกแล้วแต่ wallet ยังถูกหักสุทธิ ${foundWallet.toFixed(2)} บาท (ยังไม่คืน)`);
    } else if (expectedWallet > 0) walletVerdict = 'ok';
  } else if (expectedWallet > 0 || foundWallet > THB_EPS) {
    if (moneyEq(expectedWallet, foundWallet)) walletVerdict = 'ok';
    else {
      walletVerdict = 'discrepancy';
      discrepancies.push(expectedWallet > foundWallet
        ? `ใบขายบันทึกใช้ wallet ${expectedWallet.toFixed(2)} แต่ยอดหักสุทธิ ${foundWallet.toFixed(2)}`
        : `wallet ถูกหักสุทธิ ${foundWallet.toFixed(2)} เกินกว่าที่ใบขายบันทึก ${expectedWallet.toFixed(2)}`);
    }
  }

  // ── points — deterministic ONLY for the cancelled case (V153/V158 reverse contract) ──
  const foundPoints = num(pointsNet);
  let pointsVerdict = 'na';
  if (cancelled) {
    if (foundPoints > 0) {
      pointsVerdict = 'discrepancy';
      discrepancies.push(`ยกเลิกแล้วแต่แต้มสะสมสุทธิยังเหลือ ${foundPoints} แต้ม (ยังไม่ reverse)`);
    } else pointsVerdict = 'ok';
  } else if (foundPoints !== 0) {
    pointsVerdict = 'info'; // earned — shown, not judged (rate config may legitimately be 0)
  }

  // ── courses — deterministic only for the TOTAL-failure case (V104 class) ──
  // AUDIT-FLOW sales (แก้คงเหลือ / exchange / share) record a course MUTATION as
  // an items.courses line but by design create NO new linkedSaleId entry —
  // adjudicated FALSE POSITIVE on real prod (INV-20260706-0001, source:
  // 'reduceRemaining', L2 2026-07-07). Those sales get 'info', never judged.
  const AUDIT_SALE_SOURCES = ['reduceRemaining', 'addRemaining', 'exchange', 'share'];
  const isAuditFlowSale = AUDIT_SALE_SOURCES.includes(String(sale?.source || ''))
    || (sale?.items?.courses || []).some(c => AUDIT_SALE_SOURCES.includes(String(c?.itemType || '')));
  const expected = expectedCourseRows(sale);
  const linked = (courses || []).filter(c => String(c?.linkedSaleId || '') === saleId).length;
  let coursesVerdict = 'na';
  if (expected.total > 0) {
    if (isAuditFlowSale || cancelled) coursesVerdict = 'info'; // mutation record / used entries legitimately remain
    else if (linked === 0) {
      coursesVerdict = 'discrepancy';
      discrepancies.push(`ใบขายมีคอร์ส/โปร ${expected.total} รายการ แต่ไม่พบ entry ที่ลิงก์ใน courses[] ของลูกค้าเลย`);
    } else coursesVerdict = 'ok'; // partial-count mismatch is NOT deterministic (promo sub-rows) → counts shown
  }

  // ── stock — INFO always (skip-flags/premium make "expected" non-deterministic) ──
  const stockCount = num(stockMovements);

  return {
    saleId,
    invoiceNo: String(sale?.invoiceNo || sale?.invoice_no || saleId),
    customerId: String(sale?.customerId || ''),
    customerName: String(sale?.customerName || ''),
    total: num(sale?.billing?.grandTotal ?? sale?.billing?.total ?? sale?.total),
    saleDate: String(sale?.saleDate || sale?.date || ''),
    cancelled,
    channels: {
      deposit: { verdict: depositVerdict, expected: expectedDeposit, found: foundDeposit, entries: depositEntries },
      wallet: { verdict: walletVerdict, expected: expectedWallet, found: foundWallet },
      points: { verdict: pointsVerdict, net: foundPoints },
      courses: { verdict: coursesVerdict, expected: expected.total, linked },
      stock: { verdict: 'info', movements: stockCount },
    },
    discrepancies,
    hasDiscrepancy: discrepancies.length > 0,
  };
}

/**
 * Reconcile MANY sales with per-customer evidence caching.
 * Fetchers are INJECTED so the client tab (client SDK) and the cron
 * (admin SDK) share this exact logic:
 *   getCustomer(cid) → {courses: []} | null
 *   getDepositsByCustomer(cid) → deposit docs[]
 *   getWalletTxByCustomer(cid) → wallet tx docs[]
 *   getPointTxByCustomer(cid) → point tx docs[]
 *   countSaleStockMovements(saleId) → number
 */
export async function reconcileSales(sales, fetchers, { onProgress } = {}) {
  const cache = new Map(); // customerId → evidence
  const results = [];
  let i = 0;
  for (const sale of sales || []) {
    i += 1;
    const cid = String(sale?.customerId || '');
    let ev = cache.get(cid);
    if (!ev) {
      const [customer, deposits, walletTx, pointTx] = await Promise.all([
        fetchers.getCustomer(cid).catch(() => null),
        fetchers.getDepositsByCustomer(cid).catch(() => []),
        fetchers.getWalletTxByCustomer(cid).catch(() => []),
        fetchers.getPointTxByCustomer(cid).catch(() => []),
      ]);
      ev = {
        courses: customer?.courses || [],
        deposits: deposits || [],
        walletNetByRef: netByReference(walletTx, { debitType: 'deduct', creditType: 'refund' }),
        pointsNetByRef: netByReference(pointTx, { debitType: 'earn', creditType: 'reverse' }),
      };
      cache.set(cid, ev);
    }
    const saleId = String(sale?.saleId || sale?.id || '');
    const stockMovements = await fetchers.countSaleStockMovements(saleId).catch(() => 0);
    results.push(reconcileSale({
      sale,
      courses: ev.courses,
      deposits: ev.deposits,
      walletNet: ev.walletNetByRef.get(saleId) || 0,
      pointsNet: ev.pointsNetByRef.get(saleId) || 0,
      stockMovements,
    }));
    onProgress?.(i, (sales || []).length);
  }
  return results;
}

/** Summary for the header line + the cron audit doc. */
export function summarizeResults(results) {
  const checked = (results || []).length;
  const withIssues = (results || []).filter(r => r.hasDiscrepancy);
  const cancelled = (results || []).filter(r => r.cancelled).length;
  return {
    checked,
    ok: checked - withIssues.length,
    discrepancyCount: withIssues.length,
    cancelledChecked: cancelled,
    offendingSales: withIssues.map(r => ({
      saleId: r.saleId,
      invoiceNo: r.invoiceNo,
      customerId: r.customerId,
      discrepancies: r.discrepancies,
    })),
  };
}
