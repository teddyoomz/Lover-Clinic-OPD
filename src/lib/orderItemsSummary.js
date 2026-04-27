// ─── orderItemsSummary — shared inline product summary helper ───────────────
// Phase 15.4 post-deploy s22 (2026-04-28).
//
// User requested: "แสดงสินค้าคร่าวๆให้เห็นในรายการเลยแบบไม่ต้องกดเข้าไปดู
// เพื่อความสะดวกให้ user ดูได้คร่าวๆ ไม่จำเป็นต้องกดเข้าไปดูทุกอัน"
//
// Used by both OrderPanel.jsx (branch tier vendor orders) and
// CentralStockOrderPanel.jsx (central tier vendor POs). Renders a short
// "Product1 x10 · Product2 x5 · +3 รายการ" summary so admins can scan a
// list without clicking into each row.

/**
 * Pure helper: format a short inline summary of an order's items array.
 *
 * Examples:
 *   []                                                 → ''
 *   [{productName:'Botox', qty:10}]                   → 'Botox x10'
 *   [{productName:'A',qty:1},{productName:'B',qty:2}] → 'A x1 · B x2'
 *   3 items, max=2                                     → 'A x1 · B x2 · +1 รายการ'
 *
 * @param {Array} items — order line items (productName + qty)
 * @param {Object} [opts]
 * @param {number} [opts.max=2] — max items to show before "+N รายการ" fold
 * @returns {string}
 */
export function formatOrderItemsSummary(items, { max = 2 } = {}) {
  if (!Array.isArray(items) || items.length === 0) return '';
  const safeMax = Math.max(1, Number(max) || 2);
  // Filter empty names FIRST, then slice — so "+N รายการ" reflects the
  // count of NAMED items beyond max, not items with empty names.
  const named = items.map((it) => {
    const name = String(it?.productName || it?.productId || '').trim();
    if (!name) return null;
    const qtyNum = Number(it?.qty);
    const qtyStr = Number.isFinite(qtyNum) && qtyNum > 0 ? ` x${qtyNum}` : '';
    return `${name}${qtyStr}`;
  }).filter(Boolean);
  const visible = named.slice(0, safeMax);
  const remaining = Math.max(0, named.length - safeMax);
  if (remaining > 0) visible.push(`+${remaining} รายการ`);
  return visible.join(' · ');
}
