// ─── useBranchAwareListener — Branch-Scope Architecture Layer 3 ────────────
// Phase BSA (2026-05-04). Wraps any `listenToX(args, onChange, onError)` from
// backendClient — handles current branchId injection, re-subscribe on branch
// change, cleanup on unmount, ref-stable callbacks.
//
// Usage:
//   useBranchAwareListener(listenToAllSales, { startDate, endDate }, setSales, setError);
//   useBranchAwareListener(listenToCustomer, customerId, setCustomer);
//
// Universal listeners (marked `fn.__universal__ = true` in backendClient.js
// Phase BSA Task 3) skip branch injection AND skip re-subscribe on branch
// change. Customer-attached + audience + permission listeners are universal.
//
// Args:
//   listenerFn — backendClient listener function (or null/undefined for no-op)
//   args       — first arg to the listener. Object args get branchId merged
//                in for branch-scoped listeners; positional args (string id,
//                date string, array) pass through unchanged.
//   onChange   — data callback. Ref-stored — updates without re-subscribe.
//   onError    — error callback. Ref-stored — updates without re-subscribe.
//
// Imports BranchContext.jsx (the React provider) — this is intentional;
// hooks live in the React layer. V36.G.51 lock applies to data layer
// (scopedDataLayer.js) NOT to hooks.

import { useEffect, useRef } from 'react';
import { useSelectedBranch } from '../lib/BranchContext.jsx';

export function useBranchAwareListener(listenerFn, args, onChange, onError) {
  const { branchId } = useSelectedBranch();
  const onChangeRef = useRef(onChange);
  const onErrorRef = useRef(onError);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const isUniversal = listenerFn?.__universal__ === true;
  // Universal listeners ignore branchId entirely — exclude from deps so they
  // don't re-subscribe on branch switch.
  const effectiveBranchId = isUniversal ? null : branchId;

  useEffect(() => {
    if (!listenerFn) return undefined;
    let enrichedArgs;
    if (isUniversal) {
      enrichedArgs = args;
    } else if (typeof args === 'object' && args !== null && !Array.isArray(args)) {
      enrichedArgs = { ...args, branchId };
    } else {
      // Positional arg (date string, id, array, etc.) — pass through unchanged.
      // Branch-scoped positional listeners (listenToAppointmentsByDate) accept
      // opts as 2nd arg; consumers should call with object args to opt into
      // branchId injection. Fallback shape preserves back-compat.
      enrichedArgs = args;
    }
    const unsub = listenerFn(
      enrichedArgs,
      (data) => onChangeRef.current?.(data),
      (err) => onErrorRef.current?.(err)
    );
    return () => { try { unsub?.(); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listenerFn, effectiveBranchId, JSON.stringify(args)]);
}
