import { useState, useCallback } from 'react';
import { X, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { auth } from '../../firebase.js';

export default function MakeFreshModal({ branch, onClose, onComplete }) {
  const branchName = branch.branchName || branch.name || '?';
  const branchId = branch.branchId || branch.id;
  const [confirmText, setConfirmText] = useState('');
  const matches = confirmText.trim() === branchName.trim();
  const [phase, setPhase] = useState('idle'); // idle | backing-up | wiping | done | error
  const [error, setError] = useState('');
  const [autoBackupRef, setAutoBackupRef] = useState(null);
  const [result, setResult] = useState(null);

  const run = useCallback(async () => {
    if (!matches) return;
    setPhase('backing-up'); setError('');
    try {
      const token = await auth.currentUser?.getIdToken();

      // Phase 1: auto-pre-fresh backup (all tiers)
      const resBackup = await fetch('/api/admin/branch-backup-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ branchId, tiers: ['T1', 'T2', 'T3', 'T4'], isAutoPreFresh: true }),
      });
      const jsonBackup = await resBackup.json();
      if (!resBackup.ok || !jsonBackup.ok) throw new Error(jsonBackup.error || 'auto-backup failed');
      setAutoBackupRef(jsonBackup.storagePath);

      // Phase 2: make-fresh wipe
      setPhase('wiping');
      const resFresh = await fetch('/api/admin/branch-make-fresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ branchId, autoBackupRef: jsonBackup.storagePath }),
      });
      const jsonFresh = await resFresh.json();
      if (!resFresh.ok || !jsonFresh.ok) throw new Error(jsonFresh.error || 'make-fresh failed');

      setResult(jsonFresh);
      setPhase('done');
    } catch (e) {
      setError(e.message || 'failed');
      setPhase('error');
    }
  }, [matches, branchId]);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm" role="dialog">
      <div className="w-[90vw] max-w-lg rounded-xl bg-[var(--bg-card)] border border-rose-800/40 p-6 space-y-4">
        <header className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-rose-300 flex items-center gap-2"><AlertTriangle size={20}/> ทำให้เป็นสาขาใหม่</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10"><X size={18}/></button>
        </header>

        {phase === 'idle' && (
          <>
            <div className="space-y-2 text-sm">
              <div>สาขา: <strong>{branchName}</strong> ({branchId})</div>
              <div className="text-rose-300">การกระทำนี้จะลบทุกข้อมูลที่ไม่ universal ของสาขานี้ พร้อมประวัติทั้งหมด</div>
              <div className="text-emerald-300">ระบบจะสำรอง backup อัตโนมัติก่อนลบ — สามารถ Restore กลับได้</div>
            </div>
            <div>
              <label className="text-xs">พิมพ์ <code className="bg-[var(--bg-hover)] px-1 rounded">{branchName}</code> เพื่อยืนยัน</label>
              <input type="text" value={confirmText} onChange={e => setConfirmText(e.target.value)} className="w-full mt-1 px-3 py-2 rounded bg-[var(--bg-hover)] border border-[var(--bd)]" data-testid="make-fresh-confirm-input" />
            </div>
            <button disabled={!matches} onClick={run} className="w-full px-4 py-2 rounded bg-rose-700 hover:bg-rose-600 disabled:opacity-30 text-white font-bold" data-testid="make-fresh-confirm-btn">
              ยืนยัน — สำรองและลบ
            </button>
          </>
        )}

        {phase === 'backing-up' && (
          <div className="flex items-center gap-2 text-sm"><Loader2 size={16} className="animate-spin"/> 1/2 กำลังสำรอง...</div>
        )}
        {phase === 'wiping' && (
          <div className="space-y-1 text-sm">
            <div className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-400"/> 1/2 สำรองสำเร็จ</div>
            <div className="flex items-center gap-2"><Loader2 size={16} className="animate-spin"/> 2/2 กำลังลบ...</div>
          </div>
        )}
        {phase === 'done' && (
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-emerald-300"><CheckCircle2 size={16}/> เสร็จสิ้น</div>
            <div className="text-xs">สำรอง: <code className="bg-[var(--bg-hover)] px-1 rounded">{autoBackupRef}</code></div>
            <div className="text-xs">ลบทั้งหมด: {Object.values(result?.deletedCounts || {}).reduce((a, b) => a + b, 0)} docs</div>
            <button onClick={() => onComplete?.(result)} className="w-full px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white">ปิด</button>
          </div>
        )}
        {phase === 'error' && (
          <div className="space-y-2 text-sm">
            <div className="text-rose-300">✗ ข้อผิดพลาด: {error}</div>
            {autoBackupRef && <div className="text-emerald-300 text-xs">(แต่สำรองสำเร็จแล้วที่ {autoBackupRef})</div>}
            <button onClick={onClose} className="w-full px-4 py-2 rounded bg-gray-700 text-white">ปิด</button>
          </div>
        )}
      </div>
    </div>
  );
}
