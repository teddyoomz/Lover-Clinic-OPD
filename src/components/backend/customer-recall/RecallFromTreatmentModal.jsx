import React from 'react';
import { RecallCreateModal } from '../recall/RecallCreateModal.jsx';

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
 */
export function RecallFromTreatmentModal({ treatmentId, treatments, customer, onClose }) {
  if (!treatmentId) return null;

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
      masterDataSuggestions={{}}
      onClose={onClose}
    />
  );
}

export default RecallFromTreatmentModal;
