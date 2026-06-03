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
 * @param {string} [opts.matchQuery=''] — V159: when set, items whose name
 *        matches sort to the front so the matched product is never truncated
 *        away by the fold (no matchQuery = byte-identical to prior output)
 * @returns {string}
 */
export function formatOrderItemsSummary(items, { max = 2, matchQuery = '' } = {}) {
  if (!Array.isArray(items) || items.length === 0) return '';
  const safeMax = Math.max(1, Number(max) || 2);
  const q = String(matchQuery || '').trim().toLowerCase();
  // Filter empty names FIRST, then slice — so "+N รายการ" reflects the
  // count of NAMED items beyond max, not items with empty names.
  let named = items.map((it) => {
    const name = String(it?.productName || it?.productId || '').trim();
    if (!name) return null;
    const qtyNum = Number(it?.qty);
    const qtyStr = Number.isFinite(qtyNum) && qtyNum > 0 ? ` x${qtyNum}` : '';
    return { label: `${name}${qtyStr}`, matched: q ? name.toLowerCase().includes(q) : false };
  }).filter(Boolean);
  // V159 (2026-06-03) — when searching, surface matched items first so they
  // are not truncated away by the slice (e.g. the matched product is item 9
  // of 10). Array.prototype.sort is stable → no matchQuery = byte-identical
  // to the pre-V159 output (the search call sites in OrderPanel /
  // CentralStockOrderPanel pass matchQuery; every other caller passes none).
  if (q) named = named.slice().sort((a, b) => (b.matched ? 1 : 0) - (a.matched ? 1 : 0));
  const labels = named.map((n) => n.label);
  const visible = labels.slice(0, safeMax);
  const remaining = Math.max(0, labels.length - safeMax);
  if (remaining > 0) visible.push(`+${remaining} รายการ`);
  return visible.join(' · ');
}
