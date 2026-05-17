// Backend Menu D — per-device localStorage helper + React hook for the mode toggle.
// Scope: browser × device (intentional — different devices keep their own preference).
// Default mode = 'new'. Mobile <768px FORCES 'new' regardless of stored value.
// Cosmetic-shell rule: this helper is the ONE place the mode is read/written.

import { useEffect, useState, useCallback } from 'react';

export const STORAGE_KEY = 'lover.backendMenuMode';
const VALID_MODES = ['new', 'classic'];
const MOBILE_BREAKPOINT = 768;

function isMobileViewport() {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < MOBILE_BREAKPOINT;
}

export function getBackendMenuMode() {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return 'new';
  // Mobile forces 'new' — bloom UI is the mobile-first design (Classic sidebar is desktop)
  if (isMobileViewport()) return 'new';
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return VALID_MODES.includes(stored) ? stored : 'new';
  } catch {
    return 'new';
  }
}

export function setBackendMenuMode(mode) {
  if (!VALID_MODES.includes(mode)) return;
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
    // Manually dispatch to other hook instances in same tab (storage event
    // only fires across tabs by default)
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: mode }));
  } catch { /* private-mode storage quota — ignore */ }
}

export function useBackendMenuMode() {
  const [mode, setMode] = useState(() => getBackendMenuMode());
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY || e.key === null) setMode(getBackendMenuMode());
    };
    const onResize = () => setMode(getBackendMenuMode()); // mobile-force re-check
    window.addEventListener('storage', onStorage);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('resize', onResize);
    };
  }, []);
  const update = useCallback((next) => {
    setBackendMenuMode(next);
    setMode(getBackendMenuMode());
  }, []);
  return [mode, update];
}
