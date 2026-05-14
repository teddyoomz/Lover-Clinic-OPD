// src/hooks/useRecallListener.js
//
// Phase 29 (2026-05-14) — Recall listener hook.
// Auto-resubscribes on branch switch for branch-scoped mode; pass-through
// for per-customer mode (universal, BSA SG10).
//
// Mode 1 (branch-scoped): pass { filters } only — Backend tab / Frontend tab
// Mode 2 (per-customer): pass { customerId } — CDV card (universal)
//
// Returns { recalls, loading, error } — components consume directly.

import { useEffect, useState, useMemo } from 'react';
import { useSelectedBranch } from '../lib/BranchContext.jsx';
import {
  listenToRecalls,
  listenToRecallsForCustomer,
} from '../lib/scopedDataLayer.js';

/**
 * Phase 29 — recall listener hook.
 *
 * @param {object} opts
 * @param {object} [opts.filters] additional Firestore filters (status / dateBefore)
 * @param {string} [opts.customerId] when present → switches to per-customer mode (universal)
 * @returns {{recalls: Array, loading: boolean, error: string}}
 */
export function useRecallListener({ filters = {}, customerId = null } = {}) {
  const { branchId } = useSelectedBranch();
  const [recalls, setRecalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Stable filter signature for useEffect dep — JSON.stringify is fine for
  // {status, dateBefore} shapes (no functions, no Date objects).
  const filterKey = useMemo(() => JSON.stringify(filters || {}), [filters]);

  useEffect(() => {
    setLoading(true);
    setError('');
    let unsub = () => {};
    if (customerId) {
      // Per-customer universal mode — no branchId injection.
      unsub = listenToRecallsForCustomer(
        customerId,
        (data) => {
          setRecalls(data || []);
          setLoading(false);
        },
        (err) => {
          console.error('[useRecallListener] customer listener:', err);
          setError(err?.message || 'โหลด Recall ไม่สำเร็จ');
          setLoading(false);
        },
      );
    } else {
      // Branch-scoped mode — pass current selected branchId; re-fires on
      // branch switch via the `branchId` dep below.
      const opts = { branchId, ...JSON.parse(filterKey) };
      unsub = listenToRecalls(
        opts,
        (data) => {
          setRecalls(data || []);
          setLoading(false);
        },
        (err) => {
          console.error('[useRecallListener] branch listener:', err);
          setError(err?.message || 'โหลด Recall ไม่สำเร็จ');
          setLoading(false);
        },
      );
    }
    return () => {
      try { unsub?.(); } catch (e) { /* defensive */ }
    };
  }, [branchId, customerId, filterKey]);

  return { recalls, loading, error };
}
