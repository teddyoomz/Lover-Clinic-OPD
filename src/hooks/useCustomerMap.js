import { useState, useEffect, useMemo } from 'react';
import { getAllCustomers } from '../lib/scopedDataLayer.js';
import { resolveCustomerDisplayName } from '../lib/customerDisplayName.js';

/**
 * useCustomerMap — one-shot customer lookup map (customerId → display name) for
 * resolving a stock movement's customer at RENDER time (2026-06-09). Stock
 * movements stamp `customerId` (e.g. "LC-26000001") at deduct time but NOT a
 * customerName; the linked treatment/sale may have been deleted (Rule O keeps
 * the movement). So we live-resolve the name from be_customers here — works for
 * every movement regardless of whether its source doc still exists, with NO
 * backfill (V113 live-resolve-at-render pattern).
 *
 * be_customers is a UNIVERSAL collection (BSA) → no branch scoping. One-shot on
 * mount (mirrors useDoctorMap); customers rarely rename and the panel re-mounts
 * on navigation. Maps BOTH the doc id and (legacy) proClinicId → name so any id
 * form a movement may carry resolves.
 *
 * Defensive: a non-critical display enhancement — if getAllCustomers is
 * unavailable (partial test mock) or rejects, the map stays empty and the
 * consumer falls back to the raw id. NEVER crash a render over it.
 *
 * @returns {Map<string,string>} customerId → display name
 */
export function useCustomerMap() {
  const [customers, setCustomers] = useState([]);
  useEffect(() => {
    let alive = true;
    try {
      const p = getAllCustomers();
      if (p && typeof p.then === 'function') {
        p.then((list) => { if (alive) setCustomers(Array.isArray(list) ? list : []); })
         .catch(() => { /* non-fatal */ });
      }
    } catch { /* getAllCustomers unavailable — keep empty map, render falls back to id */ }
    return () => { alive = false; };
  }, []);
  return useMemo(() => {
    const m = new Map();
    for (const c of customers) {
      if (!c) continue;
      const name = (resolveCustomerDisplayName(c) || '').trim();
      if (!name) continue;
      for (const id of [c.id, c.proClinicId, c.customerId]) {
        if (id && !m.has(String(id))) m.set(String(id), name);
      }
    }
    return m;
  }, [customers]);
}
