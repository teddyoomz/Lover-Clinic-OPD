// ─── unitFieldHelpers — shared logic for "smart unit dropdown" pattern ──────
// Phase 15.4 (2026-04-28) — Rule C1 Rule-of-3 extract.
//
// Originally inlined in OrderPanel.jsx (commit 74985b8). When we needed the
// same pattern in CentralStockOrderPanel + Adjust/Transfer/Withdrawal create
// forms (item 7 of s19 user EOD message), the right move was to extract once
// rather than copy-paste 4 more times.
//
// `getUnitOptionsForProduct` is a pure helper — no React, no Firestore. The
// `UnitField` component lives in `src/components/backend/UnitField.jsx` and
// imports this helper.
//
// Returns an array of unit names (e.g. ['ขวด', 'แพ็ค', 'ลัง']) for a given
// product, looked up via its `defaultProductUnitGroupId` against the master
// `be_product_units` group list. Empty array when:
//   - product not found
//   - product has no configured group (legacy / not yet set up)
//   - group missing or has no `units[]` array
//
// Empty array signals callers to fall back to free-text input. NEVER returns
// undefined or throws — V14 lock (no undefined leaves to Firestore writers).

/**
 * Pure helper: look up the unit-name options configured for a product.
 *
 * @param {string} productId — be_products doc id
 * @param {Array<{id: string, name: string, defaultProductUnitGroupId?: string}>} products
 * @param {Array<{id?: string, unitGroupId?: string, units?: Array<{name: string}>}>} unitGroups
 * @returns {string[]} unit names (trimmed, non-empty); empty array if no config
 */
export function getUnitOptionsForProduct(productId, products, unitGroups) {
  if (!productId || !Array.isArray(products) || !Array.isArray(unitGroups)) return [];
  const p = products.find((x) => x && String(x.id) === String(productId));
  if (!p) return [];
  const groupId = String(p.defaultProductUnitGroupId || '').trim();
  if (!groupId) return [];
  const grp = unitGroups.find((g) => g && String(g.id || g.unitGroupId) === groupId);
  if (!grp || !Array.isArray(grp.units)) return [];
  return grp.units
    .map((u) => (u && typeof u.name === 'string' ? u.name.trim() : ''))
    .filter(Boolean);
}

/**
 * Pure helper: derive the default unit name for a product.
 * Used by Adjust/Transfer/Withdrawal panels where the unit is read-only —
 * we display whatever the master product says, falling back gracefully.
 *
 * Lookup chain:
 *   1. product.mainUnitName (explicit canonical)
 *   2. product.unit (legacy field on older be_products docs)
 *   3. first option from `getUnitOptionsForProduct` (if a unit group exists)
 *   4. ''  ← caller decides UI placeholder
 *
 * @param {string} productId
 * @param {Array} products
 * @param {Array} unitGroups
 * @returns {string} unit name; empty string when nothing resolvable
 */
export function getDefaultUnitForProduct(productId, products, unitGroups) {
  if (!productId || !Array.isArray(products)) return '';
  const p = products.find((x) => x && String(x.id) === String(productId));
  if (!p) return '';
  if (typeof p.mainUnitName === 'string' && p.mainUnitName.trim()) return p.mainUnitName.trim();
  if (typeof p.unit === 'string' && p.unit.trim()) return p.unit.trim();
  const opts = getUnitOptionsForProduct(productId, products, unitGroups);
  return opts[0] || '';
}
