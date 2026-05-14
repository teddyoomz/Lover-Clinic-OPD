/**
 * Phase 29.22 (2026-05-14) — shared hook for the 4 RecallCreateModal callers.
 *
 * Encapsulates:
 *   - listRecallCases() fetch on mount (universal, no branchId filter)
 *   - dedup-aware onSaveAsRecallCase callback (silent no-op when name exists)
 *   - reload after save so dropdown reflects new presets next time
 *
 * Rule C1 (Rule of 3) — RecallTab, RecallFrontendView, RecallCard,
 * RecallFromTreatmentModal all need identical logic; shared hook centralizes.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  listRecallCases,
  saveRecallCase,
} from '../lib/scopedDataLayer.js';
import { findRecallCaseByName } from '../lib/recallCaseValidation.js';
import { auth } from '../firebase.js';

export function useRecallCases() {
  const [recallCases, setRecallCases] = useState([]);

  const reload = useCallback(async () => {
    try {
      const data = await listRecallCases({ includeHidden: false });
      setRecallCases(Array.isArray(data) ? data : []);
    } catch (e) {
      // Non-fatal: dropdown stays empty if fetch fails. Admin can still
      // type free-text reason.
      console.warn('[useRecallCases] listRecallCases failed:', e);
      setRecallCases([]);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  /**
   * Inline-learn callback: invoked from RecallCreateModal after a recall
   * is saved + admin ticked "บันทึก".
   *
   * Dedup behavior:
   * - If a case with case-insensitive trimmed name already exists (visible) →
   *   silent no-op (no double-save; Rule C anti-vibe-code).
   * - Else: saveRecallCase + reload so dropdown reflects.
   *
   * @param {{slotType:string, days:number, reason:string}} args
   */
  const onSaveAsRecallCase = useCallback(async ({ days, reason }) => {
    if (!reason || typeof reason !== 'string') return;
    const trimmedReason = reason.trim();
    if (!trimmedReason) return;
    const d = Math.floor(Number(days) || 0);
    if (d < 1) return;
    const dup = findRecallCaseByName(recallCases, trimmedReason);
    if (dup) return; // already exists — silent no-op
    try {
      await saveRecallCase(
        { caseName: trimmedReason, defaultDays: d, isHidden: false },
        { uid: auth?.currentUser?.uid || '' }
      );
      await reload();
    } catch (e) {
      console.warn('[useRecallCases] saveRecallCase failed:', e);
    }
  }, [recallCases, reload]);

  return { recallCases, onSaveAsRecallCase, reload };
}

export default useRecallCases;
