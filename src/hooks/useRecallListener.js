// src/hooks/useRecallListener.js
//
// Phase 29 (2026-05-14) — Recall listener hook.
// Auto-resubscribes on branch switch for branch-scoped mode; pass-through
// for per-customer mode (universal, BSA SG10).
//
// Mode 1 (branch-scoped): pass { filters } only — Backend tab / Frontend tab
// Mode 2 (per-customer): pass { customerId } — CDV card (universal)
//
// Returns { recalls, loading, error, errorClass } — components consume directly.
// errorClass = 'index-building' | 'permission' | 'generic' | null — UI uses
// to show friendly message for known transient classes.

import { useEffect, useState, useMemo } from 'react';
import { useSelectedBranch } from '../lib/BranchContext.jsx';
import {
  listenToRecalls,
  listenToRecallsForCustomer,
} from '../lib/scopedDataLayer.js';

/**
 * Phase 29.21-fix1 (2026-05-14) — Detect transient Firestore errors so the UI
 * can show a friendly Thai message instead of the raw English banner.
 *
 * Known transient classes:
 *   - 'index-building'  → composite index still building after fresh deploy
 *     (resolves automatically within 2-5 min). User-reported issue immediately
 *     post-Phase-29 deploy — required because Firestore returns the same
 *     "index requires" error during BUILDING state as for missing index.
 *   - 'permission'      → user lacks rule access (kept for completeness)
 *   - 'generic'         → fallback for everything else
 *
 * @param {Error|any} err
 * @returns {{message: string, class: 'index-building'|'permission'|'generic'}}
 */
function _classifyError(err) {
  const raw = err?.message || String(err || '');
  if (/index/i.test(raw) && /(building|require|cannot be used)/i.test(raw)) {
    return {
      message: 'ระบบกำลังเตรียมพร้อมข้อมูล Recall (Firestore index กำลังสร้างหลัง deploy ใหม่) — ลองรีเฟรชอีกครั้งใน 2-5 นาทีค่ะ',
      class: 'index-building',
    };
  }
  if (/permission|insufficient/i.test(raw)) {
    return {
      message: 'ไม่มีสิทธิ์เข้าถึง Recall (โปรดติดต่อ admin)',
      class: 'permission',
    };
  }
  return {
    message: raw || 'โหลด Recall ไม่สำเร็จ',
    class: 'generic',
  };
}

/**
 * Phase 29 — recall listener hook.
 *
 * @param {object} opts
 * @param {object} [opts.filters] additional Firestore filters (status / dateBefore)
 * @param {string} [opts.customerId] when present → switches to per-customer mode (universal)
 * @returns {{recalls: Array, loading: boolean, error: string, errorClass: string|null}}
 */
export function useRecallListener({ filters = {}, customerId = null } = {}) {
  const { branchId } = useSelectedBranch();
  const [recalls, setRecalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [errorClass, setErrorClass] = useState(null);

  // Stable filter signature for useEffect dep — JSON.stringify is fine for
  // {status, dateBefore} shapes (no functions, no Date objects).
  const filterKey = useMemo(() => JSON.stringify(filters || {}), [filters]);

  useEffect(() => {
    setLoading(true);
    setError('');
    setErrorClass(null);
    let unsub = () => {};
    const onErr = (err, source) => {
      console.error(`[useRecallListener] ${source} listener:`, err);
      const cls = _classifyError(err);
      setError(cls.message);
      setErrorClass(cls.class);
      setLoading(false);
    };
    if (customerId) {
      // Per-customer universal mode — no branchId injection.
      unsub = listenToRecallsForCustomer(
        customerId,
        (data) => {
          setRecalls(data || []);
          setLoading(false);
        },
        (err) => onErr(err, 'customer'),
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
        (err) => onErr(err, 'branch'),
      );
    }
    return () => {
      try { unsub?.(); } catch (e) { /* defensive */ }
    };
  }, [branchId, customerId, filterKey]);

  return { recalls, loading, error, errorClass };
}
