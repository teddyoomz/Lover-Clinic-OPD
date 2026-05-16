// src/components/backend/WholeSystemBackupModal.jsx
// V81 Task 13 — Manual whole-system backup create wizard.
// POST /api/admin/whole-system-backup-export → returns {name, manifestHash, stats}.

import { useState } from 'react';
import { getAuth } from 'firebase/auth';
import { app } from '../../firebase.js';
import { Loader2, X, CheckCircle2 } from 'lucide-react';

export default function WholeSystemBackupModal({ open, onClose, onComplete }) {
  const [stage, setStage] = useState('idle'); // idle | running | done | error
  const [result, setResult] = useState(null);
  const [errMsg, setErrMsg] = useState('');

  async function handleStart() {
    setStage('running');
    setErrMsg('');
    try {
      const auth = getAuth(app);
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('ไม่ได้เข้าสู่ระบบ');
      const res = await fetch('/api/admin/whole-system-backup-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || json.error || 'unknown');
      setResult(json);
      setStage('done');
      onComplete?.(json);
    } catch (e) {
      setErrMsg(e.message);
      setStage('error');
    }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={() => stage !== 'running' && onClose?.()}>
      <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--bd)] shadow-2xl w-full max-w-md p-6"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[var(--tx-heading)]">📥 สำรองทั้งระบบทันที</h2>
          <button onClick={onClose} disabled={stage === 'running'}
            className="text-[var(--tx-muted)] hover:text-[var(--tx-heading)] disabled:opacity-30">
            <X size={18} />
          </button>
        </div>

        {stage === 'idle' && (
          <>
            <p className="text-sm text-[var(--tx-muted)] mb-4">
              สำรองข้อมูลทั้งระบบ (Firestore + Storage + Auth users) เป็น 1 backup.
              ใช้เวลาประมาณ 5-10 นาที. ไฟล์เก็บที่ <code className="text-xs">backups/whole-system/manual-YYYYMMDD-HHmm/</code> —
              ไม่ผูก auto-retention (admin ลบเองได้).
            </p>
            <button onClick={handleStart}
              className="w-full bg-red-600 hover:bg-red-700 text-white rounded-xl py-2.5 font-bold transition-colors">
              เริ่มสำรอง
            </button>
          </>
        )}

        {stage === 'running' && (
          <div className="text-center py-6">
            <Loader2 size={32} className="animate-spin text-red-600 mx-auto mb-3" />
            <p className="text-sm text-[var(--tx-muted)]">กำลังสำรอง... อาจใช้เวลา 5-10 นาที — ห้ามปิดหน้านี้</p>
          </div>
        )}

        {stage === 'done' && result && (
          <div className="text-center py-4">
            <CheckCircle2 size={32} className="text-green-500 mx-auto mb-3" />
            <p className="text-sm font-bold text-[var(--tx-heading)] mb-2">สำรองสำเร็จ ✓</p>
            <div className="text-xs text-[var(--tx-muted)] space-y-1 text-left">
              <p><strong>Name:</strong> <code>{result.name}</code></p>
              <p><strong>Hash:</strong> <code className="text-[10px]">{result.manifestHash?.slice(0, 32)}...</code></p>
              <p><strong>Docs:</strong> {result.stats?.totalDocCount?.toLocaleString()}</p>
              <p><strong>Storage:</strong> {Math.round((result.stats?.totalStorageBytes || 0) / 1024 / 1024)} MB</p>
              <p><strong>Auth users:</strong> {result.stats?.totalAuthUsers}</p>
              <p><strong>Elapsed:</strong> {result.stats?.elapsedSec}s</p>
              {result.failedCollections?.length > 0 && (
                <p className="text-amber-400">⚠ {result.failedCollections.length} collections failed</p>
              )}
              {result.failedStorageObjects?.length > 0 && (
                <p className="text-amber-400">⚠ {result.failedStorageObjects.length} storage objects failed</p>
              )}
            </div>
            <button onClick={onClose}
              className="mt-4 w-full bg-[var(--bg-hover)] hover:bg-[var(--bd)] text-[var(--tx-heading)] rounded-xl py-2 text-sm">
              ปิด
            </button>
          </div>
        )}

        {stage === 'error' && (
          <div className="text-center py-4">
            <p className="text-sm text-red-400 mb-3">สำรองไม่สำเร็จ: {errMsg}</p>
            <button onClick={() => setStage('idle')}
              className="w-full bg-[var(--bg-hover)] rounded-xl py-2 text-sm">
              ลองอีกครั้ง
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
