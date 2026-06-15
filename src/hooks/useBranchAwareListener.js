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

import { useEffect, useRef, useState } from 'react';
import { useSelectedBranch } from '../lib/BranchContext.jsx';
import { reconnectFirestore } from '../lib/firestoreReconnect.js';

// 2026-06-16 (mobile-load reliability) — silent auto-heal. If a listener
// subscribed during a half-dead mobile connection and the first onChange never
// arrives within SOFT_TIMEOUT_MS, reconnect (shared debounced toggle) and
// re-subscribe (capped). Returns void as before — every backend tab using this
// hook auto-heals with ZERO consumer change. V17 visibility/online + the next
// branch switch remain the longer-term recovery.
const SOFT_TIMEOUT_MS = 8000;
const MAX_AUTO_RETRIES = 2;

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
  const argsKey = JSON.stringify(args);

  const [retryNonce, setRetryNonce] = useState(0);
  const attemptsRef = useRef(0);
  // Reset the auto-heal counter whenever the SUBSCRIPTION identity changes
  // (branch / args / fn) — NOT on a retry nonce bump (that IS a retry).
  useEffect(() => { attemptsRef.current = 0; }, [listenerFn, effectiveBranchId, argsKey]);

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

    let gotData = false;
    const timer = setTimeout(() => {
      if (gotData) return;
      if (attemptsRef.current < MAX_AUTO_RETRIES) {
        attemptsRef.current += 1;
        reconnectFirestore();        // heal half-dead conn (shared debounce → no thrash)
        setRetryNonce((n) => n + 1); // re-subscribe
      }
      // else: give up; V17 visibility/online + next branch switch recover.
    }, SOFT_TIMEOUT_MS);

    const unsub = listenerFn(
      enrichedArgs,
      (data) => { gotData = true; clearTimeout(timer); onChangeRef.current?.(data); },
      (err) => onErrorRef.current?.(err)
    );
    return () => { clearTimeout(timer); try { unsub?.(); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listenerFn, effectiveBranchId, argsKey, retryNonce]);
}
