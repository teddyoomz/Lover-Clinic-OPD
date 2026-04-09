// ─── Course Utility Functions ────────────────────────────────────────────────
// Pure functions for parsing, formatting, deducting, and reversing course qty.
// Format: "200 / 200 U" → { remaining: 200, total: 200, unit: "U" }

/**
 * Parse a qty string like "200 / 200 U" or "1,200 / 2,000 ml"
 * @returns {{ remaining: number, total: number, unit: string }}
 */
export function parseQtyString(qtyStr) {
  if (!qtyStr || typeof qtyStr !== 'string') return { remaining: 0, total: 0, unit: '' };
  const m = qtyStr.match(/^([\d.,]+)\s*\/\s*([\d.,]+)\s*(.*)$/);
  if (!m) return { remaining: 0, total: 0, unit: '' };
  return {
    remaining: parseFloat(m[1].replace(/,/g, '')),
    total: parseFloat(m[2].replace(/,/g, '')),
    unit: m[3].trim(),
  };
}

/**
 * Format remaining/total/unit back to qty string
 * @returns {string} e.g. "199 / 200 U"
 */
export function formatQtyString(remaining, total, unit) {
  const r = Number.isInteger(remaining) ? remaining : remaining.toFixed(1);
  const t = Number.isInteger(total) ? total : total.toFixed(1);
  return unit ? `${r} / ${t} ${unit}` : `${r} / ${t}`;
}

/**
 * Deduct qty: "200 / 200 U" - 1 → "199 / 200 U"
 * @throws {Error} if remaining would go below 0
 */
export function deductQty(qtyStr, amount = 1) {
  const { remaining, total, unit } = parseQtyString(qtyStr);
  if (remaining < amount) {
    throw new Error(`คอร์สคงเหลือไม่พอ: มี ${remaining} ต้องการตัด ${amount}`);
  }
  return formatQtyString(remaining - amount, total, unit);
}

/**
 * Reverse deduction: "199 / 200 U" + 1 → "200 / 200 U"
 * Caps at total (never exceeds)
 */
export function reverseQty(qtyStr, amount = 1) {
  const { remaining, total, unit } = parseQtyString(qtyStr);
  const restored = Math.min(remaining + amount, total);
  return formatQtyString(restored, total, unit);
}

/**
 * Add remaining (admin): increases both remaining AND total
 * "180 / 200 U" + 20 → "200 / 220 U"
 */
export function addRemaining(qtyStr, addAmount) {
  const { remaining, total, unit } = parseQtyString(qtyStr);
  return formatQtyString(remaining + addAmount, total + addAmount, unit);
}
