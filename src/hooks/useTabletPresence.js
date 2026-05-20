import { useEffect, useRef, useCallback } from 'react';
import { upsertChartTabletPresence, freeChartTablet } from '../lib/chartEditSession.js';
import { HEARTBEAT_INTERVAL_MS } from '../lib/chartEditSessionCore.js';

// A standby/active tablet announces presence + heartbeats every 10s. Disabled until
// the device has a name + branch (caller passes enabled). `busy` reflects whether the
// tablet is mid-edit — the heartbeat writes that status so presence stays 'busy' while
// editing (the PC ready-list must NOT offer a tablet that's in a session, even though
// the standby screen is merely hidden behind the editor overlay). On unmount → free.
export function useTabletPresence({ deviceId, deviceName, branchId, uid, byName, enabled, busy = false }) {
  const dataRef = useRef({});
  dataRef.current = { deviceName, branchId, uid, byName };
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const beat = useCallback(() => {
    if (!enabled || !deviceId) return;
    upsertChartTabletPresence(deviceId, { ...dataRef.current, status: busyRef.current ? 'busy' : 'idle' }).catch(() => {});
  }, [enabled, deviceId]);
  useEffect(() => {
    if (!enabled || !deviceId) return;
    beat();
    const t = setInterval(beat, HEARTBEAT_INTERVAL_MS);
    const onVis = () => { if (document.visibilityState === 'visible') beat(); }; // V17 mobile-resume reconnect
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); freeChartTablet(deviceId).catch(() => {}); };
  }, [enabled, deviceId, beat]);
}
