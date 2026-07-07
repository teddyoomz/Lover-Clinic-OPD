// src/components/backend/WholeSystemRestoreModal.jsx
// V81 Task 14 — Restore wizard with Fresh-only DEFAULT + Replace mode opt-in.
// Type-confirm name + AV19 elevation auto-pre-backup notice for Replace.

import { useState, useMemo } from 'react';
import { getAuth } from 'firebase/auth';
import { app } from '../../firebase.js';
import { Loader2, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useModalScrollLock } from '../../lib/useModalScrollLock.js';

export default function WholeSystemRestoreModal({ open, onClose, backups = [], onComplete }) {
  // AV205 — gate on open (early return below runs after hooks)
  useModalScrollLock(!!open);
  const [selectedName, setSelectedName] = useState('');
  const [mode, setMode] = useState('fresh');
  const [confirmName, setConfirmName] = useState('');
  const [sendPasswordReset, setSendPasswordReset] = useState(false);
  // V81-fix2 (2026-05-17 EOD+1): explicit ack only required when caller opts
  // into Auth wipe+restore from backup (V81-fix4 cross-project case).
  const [ackPasswordReset, setAckPasswordReset] = useState(false);
  // V81-fix4 (2026-05-17 EOD+2): Auth preservation by default.
  // false (DEFAULT) = preserve all Auth users on Replace → NO login loss, sessions stay alive.
  // true (advanced — cross-project clone) = wipe Auth + restore from backup (passwords lost per Rule C2).
  const [replaceAuthFromBackup, setReplaceAuthFromBackup] = useState(false);
  const [stage, setStage] = useState('select'); // select | running | done | error
  const [result, setResult] = useState(null);
  const [errMsg, setErrMsg] = useState('');

  const selected = useMemo(() => backups.find(b => b.name === selectedName), [backups, selectedName]);
  // V81-fix4: ack only required when admin explicitly toggles Auth wipe ON.
  const ackRequired = mode === 'replace' && replaceAuthFromBackup;
  const canSubmit = selected
    && confirmName === selectedName
    && stage === 'select'
    && (!ackRequired || ackPasswordReset);

  async function handleStart() {
    setStage('running');
    setErrMsg('');
    try {
      const auth = getAuth(app);
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('ไม่ได้เข้าสู่ระบบ');
      const res = await fetch('/api/admin/whole-system-restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          backupRef: selectedName,
          mode,
          confirmName,
          // V81-fix4: reset emails ONLY when admin explicitly opted into Auth wipe.
          // Default Replace = preserves Auth → no reset needed.
          sendPasswordResetEmails: (mode === 'replace' && replaceAuthFromBackup) ? true : sendPasswordReset,
          // V81-fix4: ack only when replaceAuthFromBackup=true (passwords WILL be lost in that case)
          ackPasswordResetRequired: ackRequired ? ackPasswordReset : false,
          // V81-fix4: forwarded to executor — controls Auth wipe + restore behavior
          replaceAuthFromBackup,
        }),
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
    // AV78 (EOD8): backdrop click does NOT close — explicit close only (X / Cancel / ESC)
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto overscroll-contain">
      <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--bd)] shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[var(--tx-heading)]">🔄 Restore ทั้งระบบ</h2>
          <button onClick={onClose} disabled={stage === 'running'}
            className="text-[var(--tx-muted)] hover:text-[var(--tx-heading)] disabled:opacity-30">
            <X size={18} />
          </button>
        </div>

        {stage === 'select' && (
          <>
            <div className="mb-4">
              <label className="text-xs text-[var(--tx-muted)] block mb-1">เลือก backup</label>
              <select value={selectedName} onChange={e => { setSelectedName(e.target.value); setConfirmName(''); }}
                className="w-full bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-heading)] rounded-xl px-3 py-2 text-sm">
                <option value="">-- เลือก --</option>
                {backups.map(b => (
                  <option key={b.name} value={b.name}>
                    {b.name} {b.hashOk === false ? '⚠ HASH BAD' : ''} ({b.stats?.totalDocCount || 0} docs)
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-4">
              <label className="text-xs text-[var(--tx-muted)] block mb-2">Mode</label>
              <div className="space-y-2">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="radio" value="fresh" checked={mode === 'fresh'} onChange={() => setMode('fresh')} className="mt-1" />
                  <div className="text-sm">
                    <span className="font-bold text-[var(--tx-heading)]">Fresh-only (ปลอดภัย — แนะนำ)</span>
                    <p className="text-xs text-[var(--tx-muted)]">ปฏิเสธถ้า Firebase ปัจจุบันมีข้อมูล. ใช้ตอน clone ไปเปิด Firebase ใหม่.</p>
                  </div>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="radio" value="replace" checked={mode === 'replace'} onChange={() => setMode('replace')} className="mt-1" />
                  <div className="text-sm">
                    <span className="font-bold text-red-400">Replace current data (DESTRUCTIVE)</span>
                    <p className="text-xs text-[var(--tx-muted)]">
                      ลบข้อมูลปัจจุบันทั้งหมด + restore ทับ. <strong>Auto-pre-backup ก่อน wipe</strong> เผื่อ undo.
                      <br />
                      <span className="text-emerald-400">V81-fix4 (default):</span> Auth (login/email/password/session) จะคงไว้ทั้งหมด — ไม่หลุด login, ไม่ต้อง reset password.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {mode === 'replace' && (
              <>
                <div className="mb-4 p-3 bg-red-950/40 border border-red-800 rounded-xl flex items-start gap-2">
                  <AlertTriangle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
                  <span className="text-xs text-red-300">
                    ⚠ Firestore + Storage ปัจจุบันจะถูกลบทั้งหมดและแทนที่ด้วย backup.
                    ข้อมูลใหม่ที่เกิดระหว่าง backup time → restore time จะหาย.
                    Auto-pre-backup จะถูกสร้างไว้ที่ <code>pre-restore-YYYYMMDD-HHmm/</code> (เก็บ 7 วัน — undo ได้).
                  </span>
                </div>

                {/* V81-fix4 (2026-05-17 EOD+2) — Auth preservation by default.
                    User directive: "ถ้าเป็น vercel เดิมจะไม่ศุนย์เสีย รหัส หรือ
                    email login ไป แม้แต่อันเดียว". Default = preserve Auth (no
                    login loss). Advanced opt-in for cross-project clone. */}
                <div className="mb-4 p-3 bg-emerald-950/30 border border-emerald-800 rounded-xl">
                  <div className="flex items-start gap-2 mb-2">
                    <CheckCircle2 size={16} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                    <div className="text-sm font-bold text-emerald-200">✓ Auth preserved (default — V81-fix4)</div>
                  </div>
                  <p className="text-xs text-emerald-200/80 pl-6">
                    หลัง Replace restore: ทุก user (รวมคุณเอง) <strong>ยังคง login ได้ด้วยรหัสเดิม</strong>,
                    sessions ที่เปิดอยู่ <strong>ไม่หลุด</strong>, custom claims + branchIds ยังอยู่. Auth wipe ถูก skip
                    เพราะ same-Vercel restore ไม่ต้องการ Auth churn. <strong>การ login จะไม่ได้รับผลกระทบเลย.</strong>
                  </p>
                  <label className="flex items-start gap-2 cursor-pointer text-xs text-amber-200/80 mt-3 pl-6">
                    <input type="checkbox" checked={replaceAuthFromBackup}
                      onChange={e => setReplaceAuthFromBackup(e.target.checked)}
                      className="mt-0.5 flex-shrink-0"
                      data-testid="v81-fix4-replace-auth-from-backup" />
                    <span>
                      <strong>Advanced — cross-project clone:</strong> wipe Auth + restore จาก backup file (passwords จะหายตาม Rule C2)
                    </span>
                  </label>
                </div>

                {/* Ack gate only when admin opts INTO Auth wipe (advanced cross-project case) */}
                {replaceAuthFromBackup && (
                  <div className="mb-4 p-3 bg-amber-950/40 border-2 border-amber-700 rounded-xl">
                    <div className="flex items-start gap-2 mb-2">
                      <AlertTriangle size={18} className="text-amber-400 mt-0.5 flex-shrink-0" />
                      <div className="text-sm font-bold text-amber-200">⚠ Auth wipe ON = ทุก staff ต้อง reset password</div>
                    </div>
                    <p className="text-xs text-amber-200/90 mb-3 pl-6">
                      เลือก replaceAuthFromBackup=true แล้ว — V81 backup ไม่เก็บ password hash ใน file (Rule C2).
                      หลัง Replace restore: <strong>ทุก user (รวมตัวคุณเอง) จะต้องตั้งรหัสผ่านใหม่</strong>
                      ผ่านปุ่ม "ลืมรหัสผ่าน". Email + สิทธิ์ + customClaims ยังอยู่ — แค่ password ต้อง reset.
                    </p>
                    <label className="flex items-start gap-2 cursor-pointer text-xs text-amber-100">
                      <input type="checkbox" checked={ackPasswordReset}
                        onChange={e => setAckPasswordReset(e.target.checked)}
                        className="mt-0.5 flex-shrink-0"
                        data-testid="v81-fix2-ack-password-reset" />
                      <span><strong>ฉันเข้าใจ:</strong> เลือก wipe Auth จาก backup — ทุก staff (รวมฉัน) ต้องตั้ง password ใหม่. ระบบจะส่ง reset emails อัตโนมัติ.</span>
                    </label>
                  </div>
                )}
              </>
            )}

            {mode === 'fresh' && (
              <label className="flex items-center gap-2 mb-4 text-xs text-[var(--tx-muted)] cursor-pointer">
                <input type="checkbox" checked={sendPasswordReset} onChange={e => setSendPasswordReset(e.target.checked)} />
                ส่งอีเมล password-reset ไปทุก user ที่ restore (Firebase Auth ไม่ export password)
              </label>
            )}

            <div className="mb-4">
              <label className="text-xs text-[var(--tx-muted)] block mb-1">
                พิมพ์ชื่อ backup ยืนยัน: {selectedName && <code className="text-[var(--tx-heading)]">{selectedName}</code>}
              </label>
              <input value={confirmName} onChange={e => setConfirmName(e.target.value)} placeholder="พิมพ์ชื่อ backup ตรงๆ"
                className="w-full bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-heading)] rounded-xl px-3 py-2 text-sm font-mono" />
            </div>

            <button onClick={handleStart} disabled={!canSubmit}
              className="w-full bg-red-600 hover:bg-red-700 text-white rounded-xl py-2.5 font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
              {mode === 'replace' ? 'Replace ทั้งระบบ' : 'Restore (Fresh-only)'}
            </button>
          </>
        )}

        {stage === 'running' && (
          <div className="text-center py-6">
            <Loader2 size={32} className="animate-spin text-red-600 mx-auto mb-3" />
            <p className="text-sm text-[var(--tx-muted)]">กำลัง restore... ใช้เวลา 5-15 นาที — ห้ามปิดหน้านี้</p>
          </div>
        )}

        {stage === 'done' && result && (
          <div className="text-center py-4">
            <CheckCircle2 size={32} className="text-green-500 mx-auto mb-3" />
            <p className="text-sm font-bold text-[var(--tx-heading)] mb-2">Restore สำเร็จ ✓</p>
            <div className="text-xs text-[var(--tx-muted)] space-y-1 text-left">
              <p><strong>Docs restored:</strong> {result.stats?.restoredDocs}</p>
              <p><strong>Auth users:</strong> {result.stats?.restoredAuth}</p>
              <p><strong>Storage blobs:</strong> {result.stats?.restoredStorage}</p>
              <p><strong>Password-reset emails sent:</strong> {result.passwordResetEmailsSent}</p>
              {result.autoBackupRef && (
                <p className="text-amber-300"><strong>Auto pre-backup (undo):</strong> <code>{result.autoBackupRef}</code></p>
              )}
              {(result.stats?.failedDocs?.length > 0 || result.stats?.failedAuth?.length > 0 || result.stats?.failedStorage?.length > 0) && (
                <p className="text-amber-400">⚠ Partial failures — see audit doc be_admin_audit/whole-system-restore-*</p>
              )}
            </div>
            <button onClick={onClose} className="mt-4 w-full bg-[var(--bg-hover)] rounded-xl py-2 text-sm">ปิด</button>
          </div>
        )}

        {stage === 'error' && (
          <div className="text-center py-4">
            <p className="text-sm text-red-400 mb-3">Restore ไม่สำเร็จ: {errMsg}</p>
            <button onClick={() => setStage('select')} className="w-full bg-[var(--bg-hover)] rounded-xl py-2 text-sm">ลองอีกครั้ง</button>
          </div>
        )}
      </div>
    </div>
  );
}
