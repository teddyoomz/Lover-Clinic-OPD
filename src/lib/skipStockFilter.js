// ─── src/lib/skipStockFilter.js ───────────────────────────────────────────
// V43-followup (2026-05-19 NIGHT+5 EOD+1) — pure helper for hiding products
// flagged `skipStockDeduction:true` from balance views (per-branch + central
// + future). Branch-agnostic. Single-source contract per Rule O.
//
// Consumers (per AV97 audit invariant):
//   - src/components/backend/StockBalancePanel.jsx (both per-branch + central
//     tabs use this same panel)
// Sanctioned exceptions (AV97 closed list):
//   - ProductsTab — master CRUD list; admin needs to see ALL products to edit
//   - MovementLogPanel — history audit; immutable per Rule D

/**
 * Returns true iff product is explicitly flagged `skipStockDeduction: true`.
 * Strict boolean check — does NOT coerce truthy values (e.g. '1', 'true',
 * numeric 1 all return false). Mirrors the strict `=== true` check inside
 * _deductOneItem branch 2 (backendClient.js:6928).
 */
export function isSkippedProduct(p) {
  if (p == null || typeof p !== 'object') return false;
  if (Array.isArray(p)) return false;
  return p.skipStockDeduction === true;
}

/**
 * Returns a NEW array with skipStockDeduction:true products filtered out.
 * Preserves order. Does not mutate input. Returns [] for non-array / null /
 * undefined input. Silently drops null/undefined array items.
 *
 * @param {Array<object|null|undefined>|null|undefined} products
 * @returns {Array<object>}
 */
export function filterOutSkippedProducts(products) {
  if (!Array.isArray(products)) return [];
  return products.filter(p => p != null && !isSkippedProduct(p));
}
