// src/hooks/useLayoutPreference.js
//
// Phase 27.1 (2026-05-14) — device-persistent split-screen layout preference.
// Reusable hook: each consumer passes a unique `key` (e.g. 'tfp', 'customer-timeline').
// Persists to localStorage under `layout_pref:<key>`. Safe-no-op when storage
// unavailable (SSR / private browsing).
//
// Returns: { position: 'left'|'right', isPrimaryLeft: boolean, swap: () => void,
//            setPosition: (p: 'left'|'right') => void }

import { useState, useEffect, useCallback } from 'react';

const STORAGE_PREFIX = 'layout_pref:';

function _readStored(key, fallback) {
  try {
    const v = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (v === 'left' || v === 'right') return v;
  } catch {
    /* localStorage unavailable */
  }
  return fallback === 'right' ? 'right' : 'left';
}

export function useLayoutPreference(key, defaultValue = 'left') {
  const storageKey = `${STORAGE_PREFIX}${key}`;
  const [position, setPositionState] = useState(() => _readStored(key, defaultValue));

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, position);
    } catch {
      /* write failed (quota / disabled) — UI state still works */
    }
  }, [storageKey, position]);

  const swap = useCallback(() => {
    setPositionState((p) => (p === 'left' ? 'right' : 'left'));
  }, []);

  const setPosition = useCallback((p) => {
    if (p === 'left' || p === 'right') setPositionState(p);
  }, []);

  return {
    position,
    isPrimaryLeft: position === 'left',
    swap,
    setPosition,
  };
}
