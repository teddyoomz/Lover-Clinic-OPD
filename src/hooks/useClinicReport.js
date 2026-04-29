// ─── useClinicReport — smart hybrid cache hook for Phase 16.2 ──────────────
//
// Cache strategy:
//   - filter-keyed Map (component-lifetime, per-instance)
//   - auto-invalidate on filter change (cache miss → re-fetch)
//   - manual refresh() clears current key + refetches
//   - NO setInterval / NO polling
//
// Error semantics:
//   - rejection → error state set, snapshot stays at last-good (null on first fail)

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { clinicReportAggregator } from '../lib/clinicReportAggregator.js';

function stableKey(filter) {
  // Deterministic stringification — sort branchIds + categories for cache hit on equivalent filters
  if (!filter || typeof filter !== 'object') return JSON.stringify(filter ?? null);
  const norm = {
    from: filter.from || '',
    to: filter.to || '',
    branchIds: Array.isArray(filter.branchIds) ? [...filter.branchIds].sort() : null,
    categories: Array.isArray(filter.categories) ? [...filter.categories].sort() : null,
  };
  return JSON.stringify(norm);
}

export function useClinicReport(filter) {
  const cacheRef = useRef(new Map());
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);

  const key = useMemo(() => stableKey(filter), [filter]);

  useEffect(() => {
    let cancelled = false;
    if (cacheRef.current.has(key)) {
      const cached = cacheRef.current.get(key);
      setSnapshot(cached);
      setLoading(false);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    clinicReportAggregator(filter)
      .then(snap => {
        if (cancelled) return;
        cacheRef.current.set(key, snap);
        setSnapshot(snap);
      })
      .catch(e => {
        if (cancelled) return;
        setError(e?.message || 'load failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [key, refreshTick]);

  const refresh = useCallback(async () => {
    cacheRef.current.delete(key);
    setRefreshTick(t => t + 1);
  }, [key]);

  return { snapshot, loading, error, refresh };
}
