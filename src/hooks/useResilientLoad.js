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
import { reconnectFirestore } from '../lib/firestoreReconnect.js';

const DEFAULT_SOFT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_AUTO_RETRIES = 1;

export function useResilientLoad(opts = {}) {
  const softTimeoutMs = opts.softTimeoutMs ?? DEFAULT_SOFT_TIMEOUT_MS;
  const maxAutoRetries = opts.maxAutoRetries ?? DEFAULT_MAX_AUTO_RETRIES;

  const [loadStatus, setLoadStatus] = useState('loading');
  const [retryKey, setRetryKey] = useState(0);
  const attemptsRef = useRef(0);
  const statusRef = useRef('loading');
  useEffect(() => { statusRef.current = loadStatus; }, [loadStatus]);

  const markReady = useCallback(() => {
    attemptsRef.current = 0;
    setLoadStatus((prev) => (prev === 'ready' ? prev : 'ready'));
  }, []);

  const handleFail = useCallback(() => {
    // A snapshot already succeeded — ignore any late timeout/error.
    if (statusRef.current === 'ready') return;
    if (attemptsRef.current < maxAutoRetries) {
      const isFirst = attemptsRef.current === 0;
      attemptsRef.current += 1;
      if (isFirst) reconnectFirestore(); // heal half-dead conn before re-subscribe
      setRetryKey((k) => k + 1);         // re-run consumer load effect; stays 'loading' → timer restarts
    } else {
      setLoadStatus('error');
    }
  }, [maxAutoRetries]);

  const markError = useCallback(() => { handleFail(); }, [handleFail]);

  const retry = useCallback(() => {
    attemptsRef.current = 0;
    setLoadStatus('loading');
    setRetryKey((k) => k + 1);
  }, []);

  // Soft-timeout: while loading, if no markReady() within softTimeoutMs → fail path.
  // retryKey in deps so each silent auto-retry restarts the timer.
  useEffect(() => {
    if (loadStatus !== 'loading') return undefined;
    const id = setTimeout(() => handleFail(), softTimeoutMs);
    return () => clearTimeout(id);
  }, [loadStatus, retryKey, softTimeoutMs, handleFail]);

  return { loadStatus, retryKey, markReady, markError, retry };
}
