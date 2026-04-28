// Phase 15.7-bis (2026-04-28) — shared helper that formats the repay summary
// returned by createStockOrder / receiveCentralStockOrder /
// updateStockTransferStatus / updateStockWithdrawalStatus into a Thai
// admin-facing banner string.
//
// User chose Option 2 ("Auto-repay + แสดง toast/banner แจ้ง admin") in the
// AskUserQuestion design call. Each consumer (OrderPanel, CentralStockOrder
// detail, TransferDetail, WithdrawalDetail) imports this and surfaces the
// banner alongside its existing success state.
//
// Pure helper — no React, no Firestore. Safe for tests.

/**
 * Format a per-product repay summary into a single Thai banner line.
 *
 * @param {Array<{productId:string, productName:string, totalRepaid:number, leftover:number, repaidBatches:Array}>} repays
 * @returns {string} — empty when no repays
 */
export function formatNegativeRepayBanner(repays) {
  if (!Array.isArray(repays) || repays.length === 0) return '';
  // Group already happens at backend (per-product). Sum totals across products
  // for the headline, list per-product breakdown.
  const totalUnits = repays.reduce((s, r) => s + Number(r.totalRepaid || 0), 0);
  const lines = repays.map((r) => {
    const name = String(r.productName || r.productId || 'ไม่ระบุ').trim();
    const repaid = Number(r.totalRepaid) || 0;
    const leftover = Number(r.leftover) || 0;
    const detail = leftover > 0
      ? `เติม ${repaid} หน่วย (เคลียร์สต็อคติดลบ) + เพิ่มสต็อคใหม่ ${leftover} หน่วย`
      : `เติม ${repaid} หน่วย (เคลียร์สต็อคติดลบทั้งหมด ไม่มีสต็อคใหม่เพิ่ม)`;
    return `• ${name}: ${detail}`;
  });
  const head = `✓ มีการเคลียร์สต็อคติดลบอัตโนมัติ ${repays.length} สินค้า รวม ${totalUnits} หน่วย`;
  return [head, ...lines].join('\n');
}

/**
 * Returns true when the repay summary is meaningful (≥1 product with
 * totalRepaid > 0). Use this to gate banner rendering.
 */
export function hasNegativeRepay(repays) {
  if (!Array.isArray(repays) || repays.length === 0) return false;
  return repays.some((r) => Number(r?.totalRepaid) > 0);
}
