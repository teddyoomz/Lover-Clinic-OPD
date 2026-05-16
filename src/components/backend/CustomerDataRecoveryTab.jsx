// src/components/backend/CustomerDataRecoveryTab.jsx
// V74 T22 — Customer-data-recovery tab (tab=customer-data-recovery).
// Lists customer backups + upload-from-file + restore preview/confirm flow.
//
// Spec § 5.2

import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, Upload, RefreshCw, AlertTriangle, X, CheckCircle2, RotateCcw, Download } from 'lucide-react';
import { auth } from '../../firebase.js';

async function authedFetch(url, body) {
  const token = await auth.currentUser?.getIdToken();
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

export default function CustomerDataRecoveryTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [restoreTarget, setRestoreTarget] = useState(null); // {backupRef, preview}
  const fileInputRef = useRef(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await authedFetch('/api/admin/backup-manager-list', {
        types: ['customer'], search, page: 1, pageSize: 200,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { setError(data.error || 'LIST_FAILED'); setItems([]); return; }
      setItems(data.items || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [search]);

  useEffect(() => { reload(); }, [reload]);

  async function handleRestoreClick(item) {
    // Preview first
    setRestoreTarget({ backupRef: item.backupRef, customerHN: item.customerHN, customerName: item.scopeName, loading: true, preview: null });
    try {
      const res = await authedFetch('/api/admin/customer-restore', {
        backupRef: item.backupRef,
        action: 'preview',
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setRestoreTarget(prev => ({ ...prev, loading: false, error: data.error || 'PREVIEW_FAILED', detail: data.detail }));
        return;
      }
      setRestoreTarget(prev => ({ ...prev, loading: false, preview: data }));
    } catch (e) {
      setRestoreTarget(prev => ({ ...prev, loading: false, error: e.message }));
    }
  }

  async function handleDownload(item) {
    try {
      const res = await authedFetch('/api/admin/backup-manager-download', { backupRef: item.backupRef, format: 'json' });
      const data = await res.json();
      if (data.ok && data.downloadUrl) {
        window.open(data.downloadUrl, '_blank', 'noopener,noreferrer');
      } else { setError(data.error || 'DOWNLOAD_FAILED'); }
    } catch (e) { setError(e.message); }
  }

  return (
    <div className="p-4 max-w-7xl mx-auto" data-testid="customer-data-recovery-tab">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-white">🔄 กู้คืนข้อมูลลูกค้า</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            แสดงไฟล์สำรองลูกค้า <span className="text-gray-300">{items.length}</span> รายการ — เลือก 🔄 กู้คืน เพื่อสร้างลูกค้ากลับมาแบบ 100%
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={reload} className="px-3 py-1.5 rounded-lg text-xs border border-gray-700 hover:bg-gray-800 flex items-center gap-1.5">
            <RefreshCw size={12} /> รีโหลด
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="ค้นหา HN / ชื่อลูกค้า / userNote"
          className="px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-700 text-xs text-gray-100 w-64 focus:border-amber-500 focus:outline-none"
          data-testid="search-input"
        />
      </div>

      {error && (
        <div className="mb-3 p-2 bg-rose-950/30 border border-rose-800/50 rounded text-xs text-rose-300 flex items-center gap-2">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      <div className="overflow-x-auto border border-gray-800 rounded-lg">
        <table className="w-full text-xs">
          <thead className="bg-gray-900/50 text-gray-400">
            <tr>
              <th className="px-2 py-2 text-left">HN</th>
              <th className="px-2 py-2 text-left">ชื่อลูกค้า</th>
              <th className="px-2 py-2 text-left">บันทึก</th>
              <th className="px-2 py-2 text-left">เวลาสำรอง</th>
              <th className="px-2 py-2 text-right">ขนาด</th>
              <th className="px-2 py-2 text-right">การกระทำ</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="p-6 text-center text-gray-400"><Loader2 size={20} className="inline animate-spin" /> กำลังโหลด...</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-gray-500">ไม่พบไฟล์สำรองลูกค้า</td></tr>}
            {!loading && items.map(item => (
              <tr key={item.backupRef} className="border-t border-gray-800 hover:bg-gray-900/40">
                <td className="px-2 py-1.5 text-amber-300 font-bold">{item.customerHN || '-'}</td>
                <td className="px-2 py-1.5 text-gray-300">
                  {item.scopeName}
                  {item.isAutoPreFresh && <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-amber-900/40 text-amber-300">auto-pre-delete</span>}
                </td>
                <td className="px-2 py-1.5 text-gray-400 italic max-w-xs truncate">{item.userNote || <span className="text-gray-600">-</span>}</td>
                <td className="px-2 py-1.5 text-gray-400 text-[10px]">{item.exportedAt?.replace('T', ' ').slice(0, 19) || '-'}</td>
                <td className="px-2 py-1.5 text-right text-gray-400">{(item.sizeBytes / 1024).toFixed(1)} KB</td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => handleRestoreClick(item)} className="px-2 py-1 rounded bg-green-900/30 hover:bg-green-800/50 text-green-300 text-[10px] font-bold flex items-center gap-1" data-testid={`restore-${item.backupRef}`}>
                      <RotateCcw size={10} /> กู้คืน
                    </button>
                    <button onClick={() => handleDownload(item)} className="p-1 rounded hover:bg-gray-800 text-gray-300" title="ดาวน์โหลด JSON">
                      <Download size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Restore preview/confirm modal */}
      {restoreTarget && (
        <RestoreModal target={restoreTarget} onClose={() => setRestoreTarget(null)} onComplete={() => { setRestoreTarget(null); reload(); }} />
      )}
    </div>
  );
}

function RestoreModal({ target, onClose, onComplete }) {
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const preview = target.preview;

  async function handleRestore() {
    setRestoring(true);
    setError('');
    try {
      const res = await authedFetch('/api/admin/customer-restore', {
        backupRef: target.backupRef,
        action: 'restore',
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { setError(data.error || 'RESTORE_FAILED'); setRestoring(false); return; }
      setResult(data);
    } catch (e) { setError(e.message); setRestoring(false); }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm" role="dialog" data-testid="restore-modal">
      <div className="w-[95vw] max-w-xl rounded-xl bg-[var(--bg-card)] border border-green-700/40 p-6 space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-green-300">🔄 กู้คืนลูกค้า</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="text-xs text-gray-500"><code>{target.backupRef}</code></div>

        {target.loading && (
          <div className="flex items-center gap-2 text-amber-300"><Loader2 size={16} className="animate-spin" /> กำลังโหลด preview + integrity verify...</div>
        )}

        {target.error && (
          <div className="p-3 bg-rose-950/30 border border-rose-800/50 rounded text-xs">
            <div className="text-rose-200 font-bold mb-1">⚠️ {target.error}</div>
            {target.detail && <pre className="text-rose-100 text-[10px] overflow-x-auto">{JSON.stringify(target.detail, null, 2)}</pre>}
          </div>
        )}

        {preview && !result && !error && (
          <>
            <div className="text-sm space-y-2 border border-gray-700 rounded p-3 bg-gray-900/40">
              <div><span className="text-gray-500">HN:</span> <span className="text-amber-300 font-bold">{preview.customerHN}</span></div>
              <div><span className="text-gray-500">ชื่อ:</span> {preview.customerName}</div>
              <div><span className="text-gray-500">ลูกค้า ID:</span> <code className="text-[10px]">{preview.customerId}</code></div>
              <div className="border-t border-gray-700 pt-2 mt-2">
                <div className="text-gray-500 mb-1">จะสร้างคืน:</div>
                <div className="text-xs text-gray-300 space-y-0.5">
                  <div>• {Object.values(preview.cascadeRecreateCounts).reduce((a, b) => a + b, 0)} top-level docs (16 collections)</div>
                  <div>• {Object.values(preview.subcollectionRecreateCounts).reduce((a, b) => a + b, 0)} subcollection docs</div>
                  <div>• {preview.chatConversationCount} chat conversations</div>
                  <div>• {preview.storageObjectCount} Storage objects (รูป + ไฟล์)</div>
                </div>
              </div>

              {preview.conflicts.customerIdExists && (
                <div className="mt-2 p-2 bg-rose-950/30 border border-rose-800/50 rounded text-xs">
                  <div className="text-rose-200 font-bold">⛔ BLOCK — customerId ยังอยู่ในระบบ</div>
                  <div className="text-rose-100 mt-1">ต้องลบลูกค้าที่มีอยู่ก่อนถึงจะกู้คืนได้</div>
                </div>
              )}
              {preview.conflicts.hnCollision && (
                <div className="mt-2 p-2 bg-rose-950/30 border border-rose-800/50 rounded text-xs">
                  <div className="text-rose-200 font-bold">⛔ BLOCK — HN collision</div>
                  <div className="text-rose-100 mt-1">HN {preview.conflicts.hnCollision.hn} ถูกใช้โดย {preview.conflicts.hnCollision.takenBy}</div>
                </div>
              )}
              {preview.conflicts.lineConflicts?.length > 0 && (
                <div className="mt-2 p-2 bg-amber-950/30 border border-amber-700/50 rounded text-xs">
                  <div className="text-amber-200 font-bold">⚠️ จะ STRIP lineUserId conflicts ({preview.conflicts.lineConflicts.length})</div>
                  {preview.conflicts.lineConflicts.map((c, i) => (
                    <div key={i} className="text-amber-100 mt-1">• Branch {c.branchId}: LINE {c.originalLineUserId} ตอนนี้ผูกอยู่กับ {c.takenBy}</div>
                  ))}
                </div>
              )}
            </div>
            {error && <div className="text-xs text-rose-300">⚠️ {error}</div>}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={onClose} className="px-4 py-2 rounded text-sm border border-gray-700">ยกเลิก</button>
              <button
                onClick={handleRestore}
                disabled={restoring || preview.wouldBlock}
                className="px-4 py-2 rounded text-sm bg-green-700 hover:bg-green-600 text-white disabled:opacity-40 flex items-center gap-1.5"
                data-testid="restore-confirm-btn"
              >
                {restoring ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                {restoring ? 'กำลังกู้คืน...' : `กู้คืน${preview.wouldBlock ? ' (BLOCKED)' : ''}`}
              </button>
            </div>
          </>
        )}

        {result && (
          <div className="space-y-2 text-sm" data-testid="restore-success">
            <div className="flex items-center gap-2 text-green-400 font-bold">
              <CheckCircle2 size={16} /> กู้คืนสำเร็จ
            </div>
            <div className="text-xs text-gray-300 space-y-1">
              <div>customerId: <code className="text-amber-300">{result.customerId}</code></div>
              <div>Firestore writes: {result.totalWrites}</div>
              <div>Storage restored: {result.storageObjectCount}</div>
              {result.storageRestoreErrors && <div className="text-amber-300">⚠️ Storage errors: {result.storageRestoreErrors.length}</div>}
              {result.strippedLineConflicts?.length > 0 && <div className="text-amber-300">⚠️ Stripped LINE conflicts: {result.strippedLineConflicts.length}</div>}
              <div>audit: <code className="text-[10px]">{result.auditDocId}</code></div>
            </div>
            <button onClick={onComplete} className="w-full mt-2 px-4 py-2 rounded text-sm bg-green-700 text-white">ปิด</button>
          </div>
        )}
      </div>
    </div>
  );
}
