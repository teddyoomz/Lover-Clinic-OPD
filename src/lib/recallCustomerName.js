// 2026-06-16 Part B (item 3) — recall customer-name live-resolve at the load
// chokepoint. Recall docs snapshot `customerName` at create; for kiosk customers
// (name in patientData, not displayName/name) that snapshot is EMPTY → every
// recall surface showed "—". Per V113 (live-resolve at the renderer, NOT an
// admin-SDK display backfill) we overlay the name resolved from the LINKED
// customer doc, keeping the snapshot only as a fallback.
//
// Pure (no Firestore). One overlay helper feeds RecallRow (all 3 lists) AND the
// 5 modal headers — no per-site edit, no V12 multi-reader drift.
import { resolveCustomerDisplayName } from './customerDisplayName.js';

/** Unique, non-empty customerIds referenced by a recall list. */
export function collectRecallCustomerIds(recalls) {
  const ids = new Set();
  for (const r of (Array.isArray(recalls) ? recalls : [])) {
    const id = r && r.customerId ? String(r.customerId).trim() : '';
    if (id) ids.add(id);
  }
  return [...ids];
}

/**
 * Overlay each recall's `customerName` with the live-resolved name from its
 * linked customer doc. Non-destructive: keeps the existing snapshot when the
 * customer isn't loaded yet OR has no resolvable name (so a missing fetch never
 * blanks an already-good name).
 * @param {Array} recalls
 * @param {Record<string, object>} customersById customerId → be_customers doc
 * @returns {Array}
 */
export function overlayRecallNames(recalls, customersById) {
  if (!Array.isArray(recalls)) return [];
  const map = customersById && typeof customersById === 'object' ? customersById : {};
  return recalls.map((r) => {
    if (!r || !r.customerId) return r;
    const cust = map[String(r.customerId)];
    if (!cust) return r;
    const resolved = resolveCustomerDisplayName(cust);
    if (!resolved) return r;
    if (resolved === r.customerName) return r;
    return { ...r, customerName: resolved };
  });
}
