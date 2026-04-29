// ─── useExpenseReport — smart hybrid cache hook for Phase 16.7 ────────────
//
// Mirror of useClinicReport (Phase 16.2). Strategy:
//   - filter-keyed cache (Map, component-lifetime)
//   - auto-invalidate on filter change
//   - manual refresh() clears current key + refetches
//   - NO setInterval / NO polling

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { expenseReportAggregator } from '../lib/expenseReportAggregator.js';

function stableKey(filter) {
  if (!filter || typeof filter !== 'object') return JSON.stringify(filter ?? null);
  const norm = {
    from: filter.from || '',
    to: filter.to || '',
    branchIds: Array.isArray(filter.branchIds) ? [...filter.branchIds].sort() : null,
  };
  return JSON.stringify(norm);
}

export function useExpenseReport(filter) {
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
    expenseReportAggregator(filter)
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
