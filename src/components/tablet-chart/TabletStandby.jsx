import { useState, useEffect } from 'react';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
import { getCachedDeviceName, setCachedDeviceName, getCachedBranchId, setCachedBranchId } from '../../lib/tabletDeviceCache.js';
import { useTabletPresence } from '../../hooks/useTabletPresence.js';

// The ?tablet=chart standby screen. Name + branch are cached on-device (user
// directive) so the tablet never re-enters them. Presence is disabled until both
// are set. Patient/branch text uses neutral colors (Rule 04 — no red on names/HN).
export default function TabletStandby({ deviceId, uid, byName }) {
  const { branches, branchId, selectBranch, isReady } = useSelectedBranch();
  const [name, setName] = useState(() => getCachedDeviceName());
  const [editingName, setEditingName] = useState(() => !getCachedDeviceName());
  // restore cached branch once branches load
  useEffect(() => {
    const cached = getCachedBranchId();
    if (isReady && cached && cached !== branchId && branches.some(b => b.branchId === cached)) selectBranch(cached);
  }, [isReady, branches, branchId, selectBranch]);
  const ready = !!(name && branchId);
  useTabletPresence({ deviceId, deviceName: name, branchId, uid, byName, enabled: ready });
  const saveName = () => { setCachedDeviceName(name.trim()); setEditingName(false); };
  const onBranch = (e) => { selectBranch(e.target.value); setCachedBranchId(e.target.value); };
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center gap-5 p-6">
      <div className="text-5xl">{ready ? '📡' : '⚙️'}</div>
      <div className="text-lg font-semibold">{ready ? 'พร้อมรับงานแก้ไข Chart' : 'ตั้งค่าแท็บเล็ต'}</div>
      <label className="text-sm text-neutral-400">สาขา
        <select data-testid="standby-branch" value={branchId || ''} onChange={onBranch} className="ml-2 bg-neutral-800 rounded px-2 py-1 text-neutral-100">
          <option value="" disabled>เลือกสาขา</option>
          {branches.map(b => <option key={b.branchId} value={b.branchId}>{b.name || b.branchName || b.branchId}</option>)}
        </select>
      </label>
      {editingName ? (
        <div className="flex gap-2 items-center">
          <input data-testid="standby-name-input" autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="ชื่อเครื่อง เช่น iPad ห้องตรวจ 1"
            className="bg-neutral-800 rounded px-3 py-2 text-neutral-100" />
          <button data-testid="standby-name-save" disabled={!name.trim()} onClick={saveName} className="bg-emerald-500 text-black rounded px-3 py-2 disabled:opacity-40">บันทึก</button>
        </div>
      ) : (
        <button data-testid="standby-name" onClick={() => setEditingName(true)} className="text-neutral-300 underline">{name} ✎</button>
      )}
      {ready && <div className="text-sm text-neutral-500 animate-pulse">กำลังรอจากเครื่อง PC…</div>}
    </div>
  );
}
