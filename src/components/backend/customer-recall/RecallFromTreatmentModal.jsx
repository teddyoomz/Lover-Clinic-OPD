import React from 'react';
import { RecallCreateModal } from '../recall/RecallCreateModal.jsx';
import { useRecallCases } from '../../../hooks/useRecallCases.js';

/**
 * Phase 29 (2026-05-14) — Thin wrapper around RecallCreateModal that
 * computes treatmentContext + sourceContext + customer shape from a
 * treatmentId lookup.
 *
 * Extracted from CDV.jsx as a real component to avoid IIFE-in-JSX
 * (Rule 03 — Vite OXC parser crash risk; rp1-no-iife-in-jsx.test.js
 * locks this anti-pattern).
 *
 * Parent passes `treatmentId` (truthy when modal should open) + the
 * already-loaded treatments[] array. We look up the treatment + its
 * first item, build the props, and render. When treatmentId is null,
 * we render null.
 *
 * Phase 29.22 (2026-05-14): REMOVED the Phase 29.21-fix2 be_products
 * fetch entirely. Recall presets now live in be_recall_cases (universal
 * collection) — admin picks from typeahead dropdown via useRecallCases
 * shared hook. Auto-suggest from per-product followUpAfterDays/Reason
 * is GONE; that path was the V66 lesson (denormalized recall presets
 * into product/course master = wrong coupling).
 */
export function RecallFromTreatmentModal({ treatmentId, treatments, customer, onClose }) {
  // Phase 29.22 — be_recall_cases shared hook for typeahead picker.
  const { recallCases, onSaveAsRecallCase } = useRecallCases();

  if (!treatmentId) return null;

  // Look up treatment to build treatmentContext + sourceContext
  const t = (treatments || []).find((tx) => tx.id === treatmentId) || null;
  const detail = t?.detail || {};
  const firstItem = (detail.treatmentItems || [])[0] || null;

  const treatmentContext = {
    treatmentId,
    date: detail.treatmentDate || t?.treatmentDate || '',
    summary: firstItem?.name || firstItem?.productName || t?.treatmentName || '',
  };

  const sourceContext = firstItem
    ? {
        productId: firstItem.productId || null,
        productName: firstItem.productName || firstItem.name || null,
      }
    : null;

  const customerArg = {
    id: customer?.id,
    displayName: customer?.displayName || customer?.name || '',
    name: customer?.displayName || customer?.name || '',
    phone: customer?.phone || customer?.patientData?.phone || '',
    lineUserId: customer?.lineUserId || null,
    hn: customer?.hn || customer?.patientData?.hn || null,
  };

  return (
    <RecallCreateModal
      customer={customerArg}
      treatmentContext={treatmentContext}
      sourceContext={sourceContext}
      // Phase 29.22 — masterDataSuggestions deprecated; pass {} for backward
      // compat (RecallCreateModal accepts it but no longer drives behavior).
      masterDataSuggestions={{}}
      recallCases={recallCases}
      onSaveAsRecallCase={onSaveAsRecallCase}
      onClose={onClose}
    />
  );
}

export default RecallFromTreatmentModal;
