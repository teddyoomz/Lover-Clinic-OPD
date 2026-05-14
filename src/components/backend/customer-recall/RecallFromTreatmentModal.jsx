import React, { useEffect, useState } from 'react';
import { RecallCreateModal } from '../recall/RecallCreateModal.jsx';
import { getProduct } from '../../../lib/scopedDataLayer.js';

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
 * Phase 29.21-fix2 (2026-05-14): now ALSO fetches be_products[productId]
 * to populate `masterDataSuggestions` so the modal's slot auto-fill
 * actually works per spec §5.3. Previously hard-coded to `{}` which
 * broke auto-suggest entirely for entry point 4 (treatment-history chip).
 */
export function RecallFromTreatmentModal({ treatmentId, treatments, customer, onClose }) {
  const [masterDataSuggestions, setMasterDataSuggestions] = useState({});
  const [fetchedProductId, setFetchedProductId] = useState(null);

  // Look up treatment first (these don't depend on async fetch)
  const t = (treatments || []).find((tx) => tx.id === treatmentId) || null;
  const detail = t?.detail || {};
  const firstItem = (detail.treatmentItems || [])[0] || null;
  const productId = firstItem?.productId || null;

  // Fetch be_products[productId] to populate auto-suggest fields.
  // Spec §5.3 entry point 4: "If followUpAfterDays exists → enables Slot 1
  // + pre-fills date + reason from master". Same for recallAfterDays.
  useEffect(() => {
    if (!treatmentId || !productId) {
      setMasterDataSuggestions({});
      setFetchedProductId(null);
      return;
    }
    // Avoid refetch if product hasn't changed
    if (productId === fetchedProductId) return;

    let cancelled = false;
    (async () => {
      try {
        const product = await getProduct(productId);
        if (cancelled) return;
        const productName = product?.productName || product?.name || firstItem?.productName || firstItem?.name || '';
        const next = {};
        // Slot 1 (aftercare)
        if (product?.followUpAfterDays != null) {
          next.aftercare = {
            days: Number(product.followUpAfterDays),
            reason: product.followUpReason || `ติดตามอาการหลังการรักษา (${productName})`,
            sourceLabel: `be_products/${productName || productId}`,
          };
        }
        // Slot 2 (revisit)
        if (product?.recallAfterDays != null) {
          next.revisit = {
            days: Number(product.recallAfterDays),
            reason: product.recallReason || `${productName} ครบรอบบริการ`,
            sourceLabel: `be_products/${productName || productId}`,
          };
        }
        setMasterDataSuggestions(next);
        setFetchedProductId(productId);
      } catch (err) {
        if (cancelled) return;
        console.warn('[RecallFromTreatmentModal] getProduct failed (continuing without auto-suggest):', err?.message || err);
        setMasterDataSuggestions({});
        setFetchedProductId(productId); // remember even on failure so we don't retry-loop
      }
    })();

    return () => { cancelled = true; };
  }, [treatmentId, productId, firstItem, fetchedProductId]);

  if (!treatmentId) return null;

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
      masterDataSuggestions={masterDataSuggestions}
      onClose={onClose}
    />
  );
}

export default RecallFromTreatmentModal;
