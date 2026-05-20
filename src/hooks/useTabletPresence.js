import { useEffect, useRef, useCallback } from 'react';
import { upsertChartTabletPresence, freeChartTablet } from '../lib/chartEditSession.js';
import { HEARTBEAT_INTERVAL_MS } from '../lib/chartEditSessionCore.js';

// A standby tablet announces presence + heartbeats every 10s. Disabled until the
// device has a name + branch (caller passes enabled). On unmount → free the tablet.
export function useTabletPresence({ deviceId, deviceName, branchId, uid, byName, enabled }) {
  const dataRef = useRef({});
  dataRef.current = { deviceName, branchId, uid, byName };
  const beat = useCallback((status = 'idle') => {
    if (!enabled || !deviceId) return;
    upsertChartTabletPresence(deviceId, { ...dataRef.current, status }).catch(() => {});
  }, [enabled, deviceId]);
  useEffect(() => {
    if (!enabled || !deviceId) return;
    beat('idle');
    const t = setInterval(() => beat('idle'), HEARTBEAT_INTERVAL_MS);
    const onVis = () => { if (document.visibilityState === 'visible') beat('idle'); }; // V17 mobile-resume reconnect
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); freeChartTablet(deviceId).catch(() => {}); };
  }, [enabled, deviceId, beat]);
  return { setBusy: () => beat('busy'), setIdle: () => beat('idle') };
}
