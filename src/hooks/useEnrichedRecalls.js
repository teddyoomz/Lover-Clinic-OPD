// 2026-06-16 Part B (item 3) — enrich recalls with live-resolved customer names.
// Fetches each referenced customer once (cached across renders), then overlays
// the name via the pure overlayRecallNames helper. Used by RecallTab,
// RecallFrontendView, and CDV RecallCard so EVERY recall surface (rows + modals
// opened from rows) gets the real name with no per-site change.
import { useState, useEffect, useMemo, useRef } from 'react';
import { getCustomer } from '../lib/scopedDataLayer.js';
import { collectRecallCustomerIds, overlayRecallNames } from '../lib/recallCustomerName.js';

/**
 * @param {Array} recalls raw recall docs (customerName may be empty)
 * @returns {Array} same recalls with customerName live-resolved where possible
 */
export function useEnrichedRecalls(recalls) {
  const cacheRef = useRef(new Map()); // customerId → customer doc | null (fetched, not found)
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const ids = collectRecallCustomerIds(recalls);
    const missing = ids.filter((id) => !cacheRef.current.has(id));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      await Promise.all(missing.map(async (id) => {
        try {
          const c = await getCustomer(id);
          cacheRef.current.set(id, c || null);
        } catch {
          cacheRef.current.set(id, null);
        }
      }));
      if (!cancelled) setVersion((v) => v + 1);
    })();
    return () => { cancelled = true; };
  }, [recalls]);

  return useMemo(() => {
    const customersById = {};
    for (const [id, c] of cacheRef.current.entries()) if (c) customersById[id] = c;
    return overlayRecallNames(recalls, customersById);
  }, [recalls, version]);
}
