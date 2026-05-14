// 2026-05-15 — REFACTORED to use shared useMakeFreshStateMachine (Task 3
// of Central-Stock Make-Fresh spec). State + handlers now in
// src/lib/makeFreshStateMachine.js; this file is a thin scope=branch wrapper.
// Backward compat preserved: every test-id + every visible string + every
// state transition identical to pre-refactor.

import { X, Loader2, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
import { auth } from '../../firebase.js';
import { BUCKETS, bucketDefaultsForUI } from '../../lib/branchBackupBuckets.js';
import { useMakeFreshStateMachine } from '../../lib/makeFreshStateMachine.js';

const BUCKET_ORDER = Object.keys(BUCKETS);

async function authedFetch(url, body) {
  const token = await auth.currentUser?.getIdToken();
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

export default function MakeFreshModal({ branch, onClose, onComplete }) {
  const branchName = branch.branchName || branch.name || '?';
  const branchId = branch.branchId || branch.id;

  const sm = useMakeFreshStateMachine({
    exportEndpoint: '/api/admin/branch-backup-export',
    makeFreshEndpoint: '/api/admin/branch-make-fresh',
    bucketDefaults: bucketDefaultsForUI(),
    fetcher: authedFetch,
    scopeBody: { branchId },
    confirmName: branchName,
  });

  const {
    phase, checkedBuckets, advancedOpen, confirmText, preview,
    autoBackupRef, bodyHash, result, error, matches, tickedBucketIds,
    handleBucketToggle, setAdvancedOpen, setConfirmText, handlePreview, handleRun,
    setPhase, setPreview,
  } = sm;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm" role="dialog">
      <div className="w-[95vw] max-w-2xl rounded-xl bg-[var(--bg-card)] border border-rose-800/40 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <header className="flex items-center justify-between sticky top-0 bg-[var(--bg-card)] pb-2">
          <h3 className="text-lg font-bold text-rose-300 flex items-center gap-2">
            <AlertTriangle size={20} /> ทำให้เป็นสาขาใหม่
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10"><X size={18} /></button>
        </header>

        <div className="text-sm">
          สาขา: <strong>{branchName}</strong> ({branchId})
        </div>

        {phase === 'idle' && (
          <>
            <div className="space-y-2" data-testid="bucket-list">
              {BUCKET_ORDER.map(id => {
                const b = BUCKETS[id];
                return (
                  <label key={id} className="flex items-start gap-3 p-3 rounded border border-[var(--bd)] hover:bg-[var(--bg-hover)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!checkedBuckets[id]}
                      onChange={() => handleBucketToggle(id)}
                      className="mt-1"
                      data-testid={`bucket-${id}`}
                    />
                    <div className="flex-1">
                      <div className="font-medium">{b.label}</div>
                      <div className="text-xs opacity-70">{b.description}</div>
                      {advancedOpen && (
                        <div className="mt-2 text-xs opacity-50 font-mono">
                          collections: {b.collections.join(', ') || '(none)'}
                          {b.customerSubcollections.length > 0 && (
                            <> · subcoll: {b.customerSubcollections.join(', ')}</>
                          )}
                        </div>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>

            <button
              onClick={() => setAdvancedOpen(!advancedOpen)}
              className="text-xs flex items-center gap-1 opacity-70 hover:opacity-100"
              data-testid="advanced-toggle"
            >
              {advancedOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              ขั้นสูง (Developer — แสดง collection list)
            </button>

            <div className="flex justify-between gap-2 pt-2">
              <button onClick={onClose} className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-white">ยกเลิก</button>
              <button
                onClick={handlePreview}
                disabled={tickedBucketIds.length === 0}
                className="px-4 py-2 rounded bg-blue-700 hover:bg-blue-600 disabled:opacity-30 text-white font-bold"
                data-testid="preview-btn"
              >
                ดูผลกระทบ
              </button>
            </div>
          </>
        )}

        {phase === 'previewing' && (
          <div className="flex items-center gap-2 text-sm"><Loader2 size={16} className="animate-spin" /> กำลังคำนวณ...</div>
        )}

        {phase === 'preview-ready' && preview && (
          <>
            <div className="space-y-1 text-sm" data-testid="impact-panel">
              <div className="font-bold">📊 ผลกระทบ</div>
              {BUCKET_ORDER.map(id => {
                const ticked = !!checkedBuckets[id];
                const bData = preview.perBucket?.[id];
                return (
                  <div key={id} className={ticked ? '' : 'opacity-40'}>
                    {ticked ? '✓' : '✗'} {BUCKETS[id].label}
                    {ticked && bData && (
                      <span> — <strong>{bData.docs}</strong> docs
                        {bData.subDocs > 0 && <> + <strong>{bData.subDocs}</strong> subcoll docs</>}
                      </span>
                    )}
                    {!ticked && <span> — skipped</span>}
                  </div>
                );
              })}
              <div className="border-t border-[var(--bd)] mt-2 pt-2">
                📦 ลบทั้งหมด: <strong>{preview.totalDocs}</strong> docs
              </div>
              <div>💾 Backup ขนาดประมาณ: <strong>{(preview.estSizeBytes / 1024).toFixed(1)} KB</strong></div>
            </div>
            <div className="flex justify-between gap-2 pt-2">
              <button
                onClick={() => { setPhase('idle'); setPreview(null); }}
                className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-white"
              >
                ← ปรับการเลือก
              </button>
              <button
                onClick={() => setPhase('confirming')}
                className="px-4 py-2 rounded bg-amber-700 hover:bg-amber-600 text-white font-bold"
                data-testid="continue-btn"
              >
                ดำเนินการต่อ
              </button>
            </div>
          </>
        )}

        {phase === 'confirming' && (
          <>
            <div className="space-y-2 text-sm">
              <div className="text-rose-300">⚠️ การกระทำนี้จะลบทุกข้อมูลที่ติ๊กเลือก พร้อมประวัติทั้งหมด</div>
              <div className="text-emerald-300">✓ ระบบจะ backup ก่อนลบ + ตรวจสอบ SHA-256 hash ก่อนลบ</div>
            </div>
            <div>
              <label className="text-xs">พิมพ์ <code className="bg-[var(--bg-hover)] px-1 rounded">{branchName}</code> เพื่อยืนยัน</label>
              <input
                type="text"
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded bg-[var(--bg-hover)] border border-[var(--bd)]"
                data-testid="confirm-input"
              />
            </div>
            <div className="flex justify-between gap-2 pt-2">
              <button onClick={() => setPhase('preview-ready')} className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-white">ยกเลิก</button>
              <button
                disabled={!matches}
                onClick={handleRun}
                className="px-4 py-2 rounded bg-rose-700 hover:bg-rose-600 disabled:opacity-30 text-white font-bold"
                data-testid="confirm-btn"
              >
                ยืนยัน — สำรองและลบ
              </button>
            </div>
          </>
        )}

        {phase === 'backing-up' && (
          <div className="flex items-center gap-2 text-sm">
            <Loader2 size={16} className="animate-spin" /> 1/3 กำลังสำรอง...
          </div>
        )}

        {phase === 'wiping' && (
          <div className="space-y-1 text-sm">
            <div className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-400" /> 1/3 สำรองสำเร็จ</div>
            <div className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-400" /> 2/3 ตรวจสอบ hash สำเร็จ</div>
            <div className="flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> 3/3 กำลังลบ...</div>
          </div>
        )}

        {phase === 'done' && result && (
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-emerald-300"><CheckCircle2 size={16} /> เสร็จสิ้น</div>
            <div className="text-xs">📦 Backup: <code className="bg-[var(--bg-hover)] px-1 rounded break-all">{autoBackupRef}</code></div>
            <div className="text-xs">🔐 Hash: <code className="bg-[var(--bg-hover)] px-1 rounded break-all">{bodyHash}</code></div>
            <div className="text-xs">📊 ลบ: {Object.entries(result.deletedCounts || {}).map(([k, v]) => `${k}: ${v}`).join(', ')}</div>
            <div className="text-xs">🧾 Audit: <code className="bg-[var(--bg-hover)] px-1 rounded">{result.auditId}</code></div>
            <button onClick={() => onComplete?.(result)} className="w-full px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white">ปิด</button>
          </div>
        )}

        {phase === 'error' && (
          <div className="space-y-2 text-sm">
            <div className="text-rose-300">✗ ข้อผิดพลาด: {error}</div>
            {autoBackupRef && (
              <div className="text-emerald-300 text-xs">
                (Backup สำเร็จแล้วที่ <code className="break-all">{autoBackupRef}</code> — ใช้ BranchBackupTab → Restore เพื่อกู้คืน)
              </div>
            )}
            <button onClick={onClose} className="w-full px-4 py-2 rounded bg-gray-700 text-white">ปิด</button>
          </div>
        )}
      </div>
    </div>
  );
}
