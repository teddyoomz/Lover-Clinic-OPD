// Phase 15.6 / V35 (2026-04-28) — pure helpers for ProductSelectField.
//
// User directive: "ทำให้ Dropdown เลือกสินค้าในทุกหน้าของระบบสต็อค ... สามารถ
// search ได้ด้วย ไม่ใช่เลือกได้อย่างเดียว สินค้าเยอะต้อง search ได้".
//
// Mirror of documentFieldAutoFill.filterStaffByQuery (V32-tris pattern).
// Pure / mockable / Thai-locale aware.
//
// Rule C1: reuses existing `productDisplayName` from productValidation.js
// (canonical name lookup with productName preference) — same helper that
// inline `<option>` blocks used pre-V35. Added a fallback to "Product {id}"
// when both name fields are missing so the picker never renders blank rows.

import { productDisplayName as canonicalProductDisplayName } from './productValidation.js';

/**
 * Compose a display label for a product. Wraps the canonical
 * `productDisplayName` helper from productValidation.js (preference:
 * productName > name) and adds a defensive fallback when both are empty.
 */
export function composeProductDisplayName(p) {
  if (!p || typeof p !== 'object') return '';
  const canonical = canonicalProductDisplayName(p);
  if (canonical) return canonical;
  const id = String(p.id ?? p.productId ?? '').trim();
  return id ? `Product ${id}` : '';
}

/**
 * Compose a subtitle line shown beneath the display name. Falls back through
 * group → category → mainUnitName → unit. Empty when nothing useful exists.
 */
export function composeProductSubtitle(p) {
  if (!p || typeof p !== 'object') return '';
  const parts = [];
  const group = String(p.groupName ?? p.group ?? '').trim();
  if (group) parts.push(group);
  const cat = String(p.category ?? p.itemType ?? '').trim();
  if (cat && cat !== group) parts.push(cat);
  const unit = String(p.mainUnitName ?? p.unit ?? '').trim();
  if (unit) parts.push(unit);
  return parts.join(' · ');
}

/**
 * Filter products by query. Searches across name + group + category + unit
 * + id (case-insensitive, Thai-aware). Empty query returns the input list
 * unchanged. Result is sorted by Thai locale on display name (stable).
 *
 * Caller passes pre-filtered options (e.g. tier-scoped from
 * StockAdjustPanel.availableProducts) — this helper does NOT enforce
 * external scope.
 */
export function filterProductsByQuery(products, query) {
  const list = Array.isArray(products) ? products : [];
  const q = String(query || '').trim().toLowerCase();

  let filtered;
  if (!q) {
    filtered = list.slice();
  } else {
    filtered = list.filter((p) => {
      const haystack = [
        composeProductDisplayName(p),
        String(p?.groupName ?? p?.group ?? ''),
        String(p?.category ?? p?.itemType ?? ''),
        String(p?.mainUnitName ?? p?.unit ?? ''),
        String(p?.id ?? p?.productId ?? ''),
        String(p?.sku ?? ''),
        String(p?.barcode ?? ''),
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }

  // Thai-locale sort on display name. Stable on equal keys.
  try {
    filtered.sort((a, b) =>
      composeProductDisplayName(a).localeCompare(composeProductDisplayName(b), 'th')
    );
  } catch {
    // Locale collator unavailable in some test envs — fall back to default
    filtered.sort((a, b) =>
      composeProductDisplayName(a).localeCompare(composeProductDisplayName(b))
    );
  }

  return filtered;
}
