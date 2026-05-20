import { useEffect, useState } from 'react';
import { listenToChartTabletPresenceByBranch } from '../../lib/chartEditSession.js';
import { isPresenceReady } from '../../lib/chartEditSessionCore.js';

// props: branchId, value (deviceId), onChange(deviceObj). Lists tablets that are
// idle + fresh in this branch; auto-selects when exactly one is ready.
export default function TabletReadyList({ branchId, value, onChange }) {
  const [all, setAll] = useState([]);
  useEffect(() => {
    const unsub = listenToChartTabletPresenceByBranch({ branchId }, setAll, () => {});
    return () => unsub?.();
  }, [branchId]);
  const ready = all.filter(p => isPresenceReady(p, Date.now()));
  useEffect(() => { if (ready.length === 1 && !value) onChange(ready[0]); }, [ready, value, onChange]); // auto-select single
  if (ready.length === 0) return <p data-testid="no-tablet" className="text-sm text-neutral-400">ไม่มีแท็บเล็ตพร้อมใช้งานในสาขานี้</p>;
  return (
    <ul className="space-y-1">
      {ready.map(t => (
        <li key={t.deviceId}>
          <button data-testid={`tablet-${t.deviceId}`} onClick={() => onChange(t)}
            className={`w-full flex items-center gap-2 border rounded px-3 py-2 text-sm ${value === t.deviceId ? 'border-emerald-500 bg-emerald-500/10' : 'border-neutral-600'}`}>
            {value === t.deviceId ? '🔘' : '⚪'} {t.deviceName}<span className="ml-auto text-emerald-500">● พร้อม</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
