// ─── CentralMakeFreshModal — 2026-05-15 (Task 4) ──────────────────────────
// Thin wrapper around shared useMakeFreshStateMachine. Per-warehouse OR
// bulk-all (allWarehouses=true) central stock selective wipe.
//
// Spec: docs/superpowers/specs/2026-05-15-central-stock-make-fresh-and-integrity-design.md §3.4

import { X, Loader2, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
import { auth } from '../../firebase.js';
import { CENTRAL_BUCKETS, centralBucketDefaultsForUI } from '../../lib/centralStockBuckets.js';
import { useMakeFreshStateMachine } from '../../lib/makeFreshStateMachine.js';

const BUCKET_ORDER = Object.keys(CENTRAL_BUCKETS);

async function authedFetch(url, body) {
  const token = await auth.currentUser?.getIdToken();
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

/**
 * Props:
 *   warehouse: { stockId, stockName } | null (when allWarehouses=true)
 *   allWarehouses: boolean — bulk-all mode
 *   allWarehouseList: optional array (for displaying scope summary in bulk mode)
 *   onClose, onComplete: callbacks
 */
export default function CentralMakeFreshModal({ warehouse, allWarehouses = false, allWarehouseList = [], onClose, onComplete }) {
  const warehouseName = allWarehouses
    ? 'ทุกคลังกลาง'
    : (warehouse?.stockName || warehouse?.name || '?');
  const warehouseId = warehouse?.stockId || warehouse?.id || null;
  const scopeBody = allWarehouses
    ? { allWarehouses: true }
    : { warehouseIds: warehouseId ? [warehouseId] : [] };

  const sm = useMakeFreshStateMachine({
    exportEndpoint: '/api/admin/central-stock-backup-export',
    makeFreshEndpoint: '/api/admin/central-stock-make-fresh',
    bucketDefaults: centralBucketDefaultsForUI(),
    fetcher: authedFetch,
    scopeBody,
    confirmName: warehouseName,
  });

  const {
    phase, checkedBuckets, advancedOpen, confirmText, preview,
    autoBackupRef, bodyHash, result, error, matches, tickedBucketIds,
    handleBucketToggle, setAdvancedOpen, setConfirmText, handlePreview, handleRun,
    setPhase, setPreview,
  } = sm;

  return (
    // AV78 (EOD8): backdrop click does NOT close — explicit close only (X / Cancel / ESC)
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm" role="dialog">
      <div className="w-[95vw] max-w-2xl rounded-xl bg-[var(--bg-card)] border border-rose-800/40 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <header className="flex items-center justify-between sticky top-0 bg-[var(--bg-card)] pb-2">
          <h3 className="text-lg font-bold text-rose-300 flex items-center gap-2">
            <AlertTriangle size={20} /> {allWarehouses ? 'เคลีย Central Stock ทั้งหมด' : 'ทำให้คลังกลางใหม่'}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10"><X size={18} /></button>
        </header>

        <div className="text-sm">
          {allWarehouses ? (
            <>คลังกลาง: <strong>ทุกคลังกลาง</strong> ({allWarehouseList.length} คลัง)</>
          ) : (
            <>คลังกลาง: <strong>{warehouseName}</strong> ({warehouseId})</>
          )}
        </div>

        {phase === 'idle' && (
          <>
            <div className="space-y-2" data-testid="cs-bucket-list">
              {BUCKET_ORDER.map(id => {
                const b = CENTRAL_BUCKETS[id];
                return (
                  <label key={id} className="flex items-start gap-3 p-3 rounded border border-[var(--bd)] hover:bg-[var(--bg-hover)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!checkedBuckets[id]}
                      onChange={() => handleBucketToggle(id)}
                      className="mt-1"
                      data-testid={`cs-bucket-${id}`}
                    />
                    <div className="flex-1">
                      <div className="font-medium">{b.label}</div>
                      <div className="text-xs opacity-70">{b.description}</div>
                      {advancedOpen && (
                        <div className="mt-2 text-xs opacity-50 font-mono">
                          collections: {b.collections.map(c => c.name).join(', ') || '(none)'}
                          {b.counterDocs.length > 0 && (
                            <> · counter: {b.counterDocs.join(', ')}</>
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
              data-testid="cs-advanced-toggle"
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
                data-testid="cs-preview-btn"
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
            <div className="space-y-1 text-sm" data-testid="cs-impact-panel">
              <div className="font-bold">📊 ผลกระทบ</div>
              {BUCKET_ORDER.map(id => {
                const ticked = !!checkedBuckets[id];
                const bData = preview.perBucket?.[id];
                return (
                  <div key={id} className={ticked ? '' : 'opacity-40'}>
                    {ticked ? '✓' : '✗'} {CENTRAL_BUCKETS[id].label}
                    {ticked && bData && (
                      <span> — <strong>{bData.docs}</strong> docs</span>
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
                data-testid="cs-continue-btn"
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
              <div className="text-amber-300 text-xs">ℹ️ ข้อมูลคลัง (warehouse master record) จะไม่ถูกลบ — เก็บไว้เสมอ</div>
            </div>
            <div>
              <label className="text-xs">พิมพ์ <code className="bg-[var(--bg-hover)] px-1 rounded">{warehouseName}</code> เพื่อยืนยัน</label>
              <input
                type="text"
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded bg-[var(--bg-hover)] border border-[var(--bd)]"
                data-testid="cs-confirm-input"
              />
            </div>
            <div className="flex justify-between gap-2 pt-2">
              <button onClick={() => setPhase('preview-ready')} className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-white">ยกเลิก</button>
              <button
                disabled={!matches}
                onClick={handleRun}
                className="px-4 py-2 rounded bg-rose-700 hover:bg-rose-600 disabled:opacity-30 text-white font-bold"
                data-testid="cs-confirm-btn"
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
                (Backup สำเร็จแล้วที่ <code className="break-all">{autoBackupRef}</code> — ใช้ CLI: <code>scripts/central-stock-restore.mjs</code> เพื่อกู้คืน)
              </div>
            )}
            <button onClick={onClose} className="w-full px-4 py-2 rounded bg-gray-700 text-white">ปิด</button>
          </div>
        )}
      </div>
    </div>
  );
}
