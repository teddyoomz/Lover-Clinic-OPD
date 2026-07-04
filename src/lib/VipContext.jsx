import React, { createContext, useContext, useEffect, useState } from 'react';

/**
 * VIP context (2026-07-04) — ONE Firestore listener powers real-time VIP
 * rendering across every staff surface: toggle vip on a customer → the
 * where('vip','==',true) snapshot fires → Set<customerId> updates → every
 * mounted <VipName>/<VipBadge> re-renders instantly. Denormalized-name
 * surfaces work too because they key by customerId, not by the name copy.
 *
 * Provider mounts ONLY in staff dashboards (BackendDashboard + AdminDashboard).
 * NEVER mount in App root: anon users on public links (?session= / ?patient= /
 * ?schedule=) would hit permission-denied on the be_customers query.
 * No provider ⇒ useIsVip returns false ⇒ VIP rendering silently off — the
 * structural guarantee that customer-facing pages can never leak VIP (AV202).
 */

const VipCtx = createContext(null);

export function VipProvider({ children }) {
  const [vipIds, setVipIds] = useState(() => new Set());

  useEffect(() => {
    let unsub = null;
    let cancelled = false;
    import('./scopedDataLayer.js').then(({ listenToVipCustomers }) => {
      if (cancelled) return;
      unsub = listenToVipCustomers(
        (ids) => setVipIds(new Set((ids || []).map(String))),
        () => setVipIds(new Set()),
      );
    }).catch(() => {});
    return () => { cancelled = true; if (typeof unsub === 'function') unsub(); };
  }, []);

  return <VipCtx.Provider value={vipIds}>{children}</VipCtx.Provider>;
}

/**
 * @param {string|number|null|undefined} customerId
 * @returns {boolean} true iff inside a VipProvider AND the customer is VIP
 */
export function useIsVip(customerId) {
  const vipIds = useContext(VipCtx);
  if (!vipIds || customerId === null || customerId === undefined || customerId === '') return false;
  return vipIds.has(String(customerId));
}

export default VipProvider;
