// V114 (2026-05-23 EOD+1 LATE+2) — Receipt-info toggle shared by
// SalePrintView + QuotationPrintView. Persists per-device via localStorage;
// cross-tab sync via 'storage' event. Default OFF (Q3=B PDPA-friendly).
// Shared key (Q5=A) — toggling in either view affects both immediately.
//
// Pure renderer-level UI state. No backend, no rules, no migration.
// Parent: V111 (course-name) + V112-A (write resolver) + V113 (live-resolve)
// + V113-C (receiptInfo block). V114 is additive UI over V113-C.
//
// Spec: docs/superpowers/specs/2026-05-23-receipt-info-toggle-design.html

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'lover_receipt_show_address';
const DEFAULT_SHOW = false;

function readStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return DEFAULT_SHOW;
  } catch {
    return DEFAULT_SHOW;
  }
}

export function useReceiptInfoToggle() {
  const [showAddress, setShowAddressState] = useState(readStorage);

  // Cross-tab sync: 'storage' events fire on OTHER tabs when localStorage
  // changes in any tab. Same-tab updates from setShowAddress already
  // update state via setShowAddressState — the listener handles the cross-
  // tab case only (where the same window doesn't fire its own event).
  useEffect(() => {
    function onStorage(e) {
      if (e.key === STORAGE_KEY) setShowAddressState(readStorage());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setShowAddress = useCallback((next) => {
    const val = !!next;
    setShowAddressState(val);
    try {
      localStorage.setItem(STORAGE_KEY, val ? 'true' : 'false');
    } catch {
      // private-mode / quota — render still works, just doesn't persist
    }
  }, []);

  return { showAddress, setShowAddress };
}
