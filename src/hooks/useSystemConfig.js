// ─── useSystemConfig — Phase 16.3 (2026-04-29) ─────────────────────────────
//
// React hook wrapping listenToSystemConfig. Consumers receive a fully-
// merged config (defaults applied) and re-render on every Firestore change.
//
// Cached at module level so multiple components subscribing in parallel
// share a single Firestore listener (avoids N×listener fan-out).
//
// Usage:
//   const { config, loading, error } = useSystemConfig();
//   const allowNeg = config.featureFlags.allowNegativeStock;
//   const overrides = config.tabOverrides;
//
// For non-React callers (e.g. backendClient._deductOneItem), use
// `getSystemConfig()` from systemConfigClient.js directly.

import { useEffect, useState } from 'react';
import { listenToSystemConfig, mergeSystemConfigDefaults, SYSTEM_CONFIG_DEFAULTS } from '../lib/systemConfigClient.js';

let _cachedConfig = mergeSystemConfigDefaults(null);
let _cachedListeners = new Set();
let _unsubscribeShared = null;
let _hasFiredOnce = false;

function _ensureSharedListener() {
  if (_unsubscribeShared) return;
  _unsubscribeShared = listenToSystemConfig(
    (cfg) => {
      _cachedConfig = cfg;
      _hasFiredOnce = true;
      for (const cb of _cachedListeners) cb(cfg);
    },
    () => {
      // On error, fall back to defaults so consumers don't render undefined.
      _cachedConfig = mergeSystemConfigDefaults(null);
      _hasFiredOnce = true;
      for (const cb of _cachedListeners) cb(_cachedConfig);
    },
  );
}

function _subscribeLocal(cb) {
  _cachedListeners.add(cb);
  _ensureSharedListener();
  return () => {
    _cachedListeners.delete(cb);
    if (_cachedListeners.size === 0 && _unsubscribeShared) {
      _unsubscribeShared();
      _unsubscribeShared = null;
      _hasFiredOnce = false;
    }
  };
}

export function useSystemConfig() {
  const [config, setConfig] = useState(_cachedConfig);
  const [loading, setLoading] = useState(!_hasFiredOnce);
  useEffect(() => {
    const unsub = _subscribeLocal((cfg) => {
      setConfig(cfg);
      setLoading(false);
    });
    return unsub;
  }, []);
  return { config, loading, defaults: SYSTEM_CONFIG_DEFAULTS };
}

// Test-only — reset cached state between tests so vitest doesn't see
// cross-test contamination.
export function __resetSystemConfigCache() {
  _cachedConfig = mergeSystemConfigDefaults(null);
  _cachedListeners.clear();
  if (_unsubscribeShared) {
    _unsubscribeShared();
    _unsubscribeShared = null;
  }
  _hasFiredOnce = false;
}
