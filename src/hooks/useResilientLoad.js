// ─── useResilientLoad — 3-state resilient load machine ───────────────────────
// 2026-06-16 (mobile-load reliability). Wraps ANY onSnapshot / fetch load so it
// can never get permanently stuck on a black screen / spinner / empty skeleton.
//
//   loadStatus : 'loading' | 'ready' | 'error'
//   retryKey   : number — include in the consumer's load effect deps; bumping re-runs the load
//   markReady(): call inside the SUCCESS callback. A doc-FOUND snapshot AND a
//                doc-NOT-FOUND snapshot BOTH count as "loaded" (the page then
//                shows its own data / notfound). Only a snapshot that NEVER
//                fires (or onError) is treated as a failure.
//   markError(): optional — call inside onError; funnels to the same retry/error path
//   retry()    : bind to the <LoadErrorRetry> button
//
// On the FIRST auto-retry the hook fires one shared reconnectFirestore()
// (heals a half-dead connection a bare re-subscribe can't recover).
import { useState, useRef, useCallback, useEffect } from 'react';
// 2026-07-20 (mobile stuck-retry) — the retry ladder escalates to
// hardReloadApp() when the client is provably wedged (reconnect toggle timed
// out) OR a previous manual retry already failed. The automated
// "ปิดแอปเข้าใหม่" — the only heal that works for a frozen-primary-lease /
// wedged-async-queue client (iOS PWA tab switching; beacon log was EMPTY =
// silent hang, nothing a re-subscribe can fix).
import { reconnectFirestore, isConnectionWedged, hardReloadApp } from '../lib/firestoreReconnect.js';

const DEFAULT_SOFT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_AUTO_RETRIES = 1;

export function useResilientLoad(opts = {}) {
  const softTimeoutMs = opts.softTimeoutMs ?? DEFAULT_SOFT_TIMEOUT_MS;
  const maxAutoRetries = opts.maxAutoRetries ?? DEFAULT_MAX_AUTO_RETRIES;
  // resetKey — pass the consumer's load CONTEXT (e.g. selectedBranchId). When it
  // changes the consumer re-subscribes to DIFFERENT data, so the loader must
  // re-arm (fresh stuck-detection for the new load). Omit it for one-shot loads
  // (customer links) — once ready, a later transient error stays suppressed
  // (the data is already rendered). Closes the branch-switch-after-ready gap
  // (adversarial re-hunt 2026-06-16).
  const resetKey = opts.resetKey;

  const [loadStatus, setLoadStatus] = useState('loading');
  const [retryKey, setRetryKey] = useState(0);
  const attemptsRef = useRef(0);
  // settledRef is set SYNCHRONOUSLY in markReady() — NOT via a post-render
  // effect. Closes the race (adversarial-hunt 2026-06-16) where the soft-timeout
  // macrotask fires before React commits the markReady re-render: a state-synced
  // ref would still read 'loading' → spurious retry + reconnect right as data
  // arrived. A synchronous ref is true the instant a snapshot calls markReady,
  // so any later timeout/error is correctly ignored (contract: ready = no retry).
  const settledRef = useRef(false);
  // Escalation ladder state (2026-07-20 mobile stuck-retry):
  // manualRetryRef  — a manual retry's load is currently in flight
  // retryFailedRef  — a manual retry already ended in error → next press reloads
  const manualRetryRef = useRef(false);
  const retryFailedRef = useRef(false);

  const markReady = useCallback(() => {
    settledRef.current = true;
    attemptsRef.current = 0;
    // A successful load resets the escalation ladder — a LATER fresh failure
    // starts over at press#1 (no stale reload).
    manualRetryRef.current = false;
    retryFailedRef.current = false;
    setLoadStatus((prev) => (prev === 'ready' ? prev : 'ready'));
  }, []);

  const handleFail = useCallback(() => {
    // A snapshot already succeeded — ignore any late timeout/error (sync guard).
    if (settledRef.current) return;
    if (attemptsRef.current < maxAutoRetries) {
      const isFirst = attemptsRef.current === 0;
      attemptsRef.current += 1;
      if (isFirst) reconnectFirestore(); // heal half-dead conn before re-subscribe
      setRetryKey((k) => k + 1);         // re-run consumer load effect; stays 'loading' → timer restarts
    } else {
      // If this dead-end followed a MANUAL retry, remember it — the next press
      // escalates to a hard reload (the automated app-kill the user otherwise
      // performs by hand).
      if (manualRetryRef.current) {
        manualRetryRef.current = false;
        retryFailedRef.current = true;
      }
      setLoadStatus('error');
    }
  }, [maxAutoRetries]);

  const markError = useCallback(() => { handleFail(); }, [handleFail]);

  const retry = useCallback(() => {
    // ESCALATE when a bare re-subscribe provably cannot help: the shared
    // reconnect timed out (wedged client — frozen primary lease / dead async
    // queue) OR the previous manual retry already failed. Reload = the only
    // heal that clears every wedge flavor. User-initiated → no loop risk.
    if (isConnectionWedged() || retryFailedRef.current) {
      hardReloadApp('resilient-retry-escalation');
      return;
    }
    manualRetryRef.current = true;
    settledRef.current = false;
    attemptsRef.current = 0;
    // Heal NOW — don't make the user wait for the 8s soft-timeout's auto-retry
    // to fire the reconnect (the button press IS the "it's broken" signal).
    reconnectFirestore();
    setLoadStatus('loading');
    setRetryKey((k) => k + 1);
  }, []);

  // Re-arm when the load CONTEXT changes (resetKey) — e.g. a branch switch
  // re-subscribes to different data, so a previous success must not suppress the
  // new load's stuck-detection. Runs once on mount (no-op: refs already reset,
  // loadStatus already 'loading') then on every resetKey change. Does NOT bump
  // retryKey (that would re-fire the consumer's load effect a SECOND time — the
  // consumer's own resetKey-derived dep already re-subscribes once). The timer
  // effect below keys on resetKey too, so the stale timer is rescheduled from
  // the switch even when loadStatus is already 'loading' (no-op state change).
  useEffect(() => {
    settledRef.current = false;
    attemptsRef.current = 0;
    setLoadStatus('loading');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // Soft-timeout: while loading, if no markReady() within softTimeoutMs → fail path.
  // retryKey → each silent auto-retry restarts the timer. resetKey → a context
  // change (branch switch) clears the stale timer + schedules a fresh window from
  // the switch (else an orphaned mount-scheduled timer fires at the wrong time →
  // premature reconnect for the new context; adversarial re-hunt R3 2026-06-16).
  useEffect(() => {
    if (loadStatus !== 'loading') return undefined;
    const id = setTimeout(() => handleFail(), softTimeoutMs);
    return () => clearTimeout(id);
  }, [loadStatus, retryKey, softTimeoutMs, handleFail, resetKey]);

  return { loadStatus, retryKey, markReady, markError, retry };
}
