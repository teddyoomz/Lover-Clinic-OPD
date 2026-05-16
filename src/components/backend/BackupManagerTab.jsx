// src/components/backend/BackupManagerTab.jsx
// V74 T23 — Unified backup-manager tab (tab=backup-manager). Lists ALL backup
// types (customer + branch + central-stock) with filter chips + per-row actions
// (download / rename / delete) + bulk-delete (≤50).
//
// Restore actions are NOT here — admins restore via per-type tabs:
//   - V40 BranchBackupTab (branch backups)
//   - V15 CentralStock backup flow (central-stock backups)
//   - V74 CustomerDataRecoveryTab (customer backups)
//
// Spec § 5.3

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Download, Edit3, Trash2, RefreshCw, AlertTriangle, X, CheckCircle2 } from 'lucide-react';
import { auth } from '../../firebase.js';
// V77 (2026-05-16 EOD+1) — Whole-fleet customer backup trigger modal.
import WholeFleetBackupModal from './WholeFleetBackupModal.jsx';

async function authedFetch(url, body) {
  const token = await auth.currentUser?.getIdToken();
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

const TYPE_LABELS = {
  customer: '👤 ลูกค้า',
  branch: '🏢 สาขา',
  'central-stock': '📦 คลังกลาง',
};

export default function BackupManagerTab() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [typeFilter, setTypeFilter] = useState({ customer: true, branch: true, 'central-stock': true });
  const [search, setSearch] = useState('');
  const [selectedRefs, setSelectedRefs] = useState(new Set());
  const [renameTarget, setRenameTarget] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  // V77 (2026-05-16 EOD+1) — whole-fleet backup modal
  const [wholeFleetModalOpen, setWholeFleetModalOpen] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const types = Object.entries(typeFilter).filter(([, v]) => v).map(([k]) => k);
      const res = await authedFetch('/api/admin/backup-manager-list', {
        types, search, page, pageSize,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || 'LIST_FAILED');
        setItems([]);
        return;
      }
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e) {
      setError(e.message || 'NETWORK_ERROR');
    } finally {
      setLoading(false);
    }
  }, [typeFilter, search, page, pageSize]);

  useEffect(() => { reload(); }, [reload]);

  function toggleType(type) {
    setTypeFilter(p => ({ ...p, [type]: !p[type] }));
    setPage(1);
  }
  function toggleSelect(ref) {
    setSelectedRefs(prev => {
      const next = new Set(prev);
      if (next.has(ref)) next.delete(ref); else next.add(ref);
      return next;
    });
  }
  function selectAll() {
    if (selectedRefs.size === items.length) setSelectedRefs(new Set());
    else setSelectedRefs(new Set(items.map(i => i.backupRef)));
  }

  async function handleDownload(item) {
    try {
      const res = await authedFetch('/api/admin/backup-manager-download', {
        backupRef: item.backupRef,
        format: 'json',
      });
      const data = await res.json();
      if (data.ok && data.downloadUrl) {
        window.open(data.downloadUrl, '_blank', 'noopener,noreferrer');
      } else {
        setError(data.error || 'DOWNLOAD_FAILED');
      }
    } catch (e) {
      setError(e.message);
    }
  }

  const totalSizeMB = (items.reduce((acc, i) => acc + (i.sizeBytes || 0), 0) / 1024 / 1024).toFixed(1);
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="p-4 max-w-7xl mx-auto" data-testid="backup-manager-tab">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-white">📦 จัดการไฟล์สำรองข้อมูลทั้งหมด</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            แสดงไฟล์สำรอง <span className="text-gray-300">{total}</span> รายการ
            (รวม <span className="text-gray-300">{totalSizeMB} MB</span>)
            — Restore: ใช้แท็บเฉพาะประเภท (Customer Data Recovery / Branch Backup / Central Stock)
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* V77 (2026-05-16 EOD+1) — Whole-fleet customer backup trigger button. */}
          <button
            onClick={() => setWholeFleetModalOpen(true)}
            className="px-3 py-1.5 rounded-lg text-xs bg-amber-700 hover:bg-amber-600 text-white font-bold flex items-center gap-1.5"
            data-testid="whole-fleet-backup-trigger"
            title="สำรองลูกค้าทุกคนพร้อมกัน"
          >
            📦 สำรองลูกค้าทุกคน
          </button>
          <button onClick={reload} className="px-3 py-1.5 rounded-lg text-xs border border-gray-700 hover:bg-gray-800 flex items-center gap-1.5">
            <RefreshCw size={12} /> รีโหลด
          </button>
        </div>
      </div>

      {/* V77 (2026-05-16 EOD+1) — Whole-fleet backup modal */}
      <WholeFleetBackupModal
        isOpen={wholeFleetModalOpen}
        onClose={() => setWholeFleetModalOpen(false)}
        onComplete={() => { reload(); }}
      />

      {/* Filter chips + search */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-xs text-gray-500">ประเภท:</span>
        {Object.entries(TYPE_LABELS).map(([k, v]) => (
          <button
            key={k}
            onClick={() => toggleType(k)}
            data-testid={`filter-type-${k}`}
            className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
              typeFilter[k]
                ? 'bg-amber-900/30 text-amber-300 border-amber-700/50'
                : 'bg-gray-900 text-gray-500 border-gray-800 hover:text-gray-300'
            }`}
          >
            {v}
          </button>
        ))}
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="ค้นหา HN / ชื่อ / สาขา / userNote"
          className="ml-auto px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-700 text-xs text-gray-100 w-64 focus:border-amber-500 focus:outline-none"
          data-testid="search-input"
        />
      </div>

      {error && (
        <div className="mb-3 p-2 bg-rose-950/30 border border-rose-800/50 rounded text-xs text-rose-300 flex items-center gap-2">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* Bulk action toolbar */}
      {selectedRefs.size > 0 && (
        <div className="mb-3 p-2 bg-amber-950/20 border border-amber-700/40 rounded flex items-center justify-between" data-testid="bulk-toolbar">
          <span className="text-xs text-amber-300">
            เลือก {selectedRefs.size} ไฟล์ (จำกัด ≤50 ต่อครั้ง)
          </span>
          <div className="flex gap-2">
            <button onClick={() => setSelectedRefs(new Set())} className="text-xs px-3 py-1 rounded border border-gray-700 text-gray-300 hover:bg-gray-800">
              ล้าง
            </button>
            <button
              onClick={() => setBulkDeleteConfirm(true)}
              disabled={selectedRefs.size > 50}
              className="text-xs px-3 py-1 rounded bg-rose-900 hover:bg-rose-800 text-white disabled:opacity-40 flex items-center gap-1"
              data-testid="bulk-delete-btn"
            >
              <Trash2 size={12} /> ลบที่เลือก ({selectedRefs.size})
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto border border-gray-800 rounded-lg">
        <table className="w-full text-xs">
          <thead className="bg-gray-900/50 text-gray-400">
            <tr>
              <th className="px-2 py-2 text-left w-8">
                <input
                  type="checkbox"
                  checked={items.length > 0 && selectedRefs.size === items.length}
                  onChange={selectAll}
                  data-testid="select-all"
                />
              </th>
              <th className="px-2 py-2 text-left">ประเภท</th>
              <th className="px-2 py-2 text-left">ขอบเขต</th>
              <th className="px-2 py-2 text-left">ชื่อ / HN</th>
              <th className="px-2 py-2 text-left">บันทึก (userNote)</th>
              <th className="px-2 py-2 text-left">เวลาสำรอง</th>
              <th className="px-2 py-2 text-right">ขนาด</th>
              <th className="px-2 py-2 text-right">การกระทำ</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="p-6 text-center text-gray-400">
                <Loader2 size={20} className="inline animate-spin" /> กำลังโหลด...
              </td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={8} className="p-6 text-center text-gray-500">ไม่พบไฟล์สำรอง</td></tr>
            )}
            {!loading && items.map(item => (
              <tr key={item.backupRef} className="border-t border-gray-800 hover:bg-gray-900/40">
                <td className="px-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={selectedRefs.has(item.backupRef)}
                    onChange={() => toggleSelect(item.backupRef)}
                    data-testid={`select-${item.backupRef}`}
                  />
                </td>
                <td className="px-2 py-1.5 text-gray-300">{TYPE_LABELS[item.type] || item.type}</td>
                <td className="px-2 py-1.5 text-gray-400 font-mono text-[10px]">{item.scopeId}</td>
                <td className="px-2 py-1.5 text-gray-300">
                  {item.customerHN && <span className="text-amber-300 font-bold mr-1">HN {item.customerHN}</span>}
                  {item.scopeName}
                  {item.isAutoPreFresh && <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-amber-900/40 text-amber-300">auto-pre</span>}
                </td>
                <td className="px-2 py-1.5 text-gray-400 italic max-w-xs truncate">{item.userNote || <span className="text-gray-600">-</span>}</td>
                <td className="px-2 py-1.5 text-gray-400 text-[10px]">{item.exportedAt?.replace('T', ' ').slice(0, 19) || '-'}</td>
                <td className="px-2 py-1.5 text-right text-gray-400">{(item.sizeBytes / 1024).toFixed(1)} KB</td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => handleDownload(item)} className="p-1 rounded hover:bg-gray-800 text-gray-300" title="ดาวน์โหลด JSON">
                      <Download size={12} />
                    </button>
                    <button onClick={() => setRenameTarget(item)} className="p-1 rounded hover:bg-gray-800 text-amber-300" title="แก้ไขชื่อ" data-testid={`rename-${item.backupRef}`}>
                      <Edit3 size={12} />
                    </button>
                    <button onClick={() => setDeleteConfirm(item)} className="p-1 rounded hover:bg-rose-900/40 text-rose-400" title="ลบ" data-testid={`delete-${item.backupRef}`}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-3 text-xs">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1 rounded border border-gray-700 disabled:opacity-30">‹ Prev</button>
          <span className="px-2 py-1 text-gray-400">หน้า {page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1 rounded border border-gray-700 disabled:opacity-30">Next ›</button>
        </div>
      )}

      {/* Rename modal */}
      {renameTarget && (
        <RenameModal
          target={renameTarget}
          onClose={() => setRenameTarget(null)}
          onSaved={() => { setRenameTarget(null); reload(); }}
        />
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <DeleteConfirmModal
          target={deleteConfirm}
          onClose={() => setDeleteConfirm(null)}
          onDeleted={() => { setDeleteConfirm(null); reload(); }}
        />
      )}

      {/* Bulk delete confirm */}
      {bulkDeleteConfirm && (
        <BulkDeleteConfirmModal
          backupRefs={[...selectedRefs]}
          onClose={() => setBulkDeleteConfirm(false)}
          onDeleted={() => { setBulkDeleteConfirm(false); setSelectedRefs(new Set()); reload(); }}
        />
      )}
    </div>
  );
}

function RenameModal({ target, onClose, onSaved }) {
  const [userNote, setUserNote] = useState(target.userNote || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const res = await authedFetch('/api/admin/backup-manager-rename', {
        backupRef: target.backupRef,
        userNote: userNote.slice(0, 200),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { setError(data.error || 'RENAME_FAILED'); return; }
      onSaved();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm" role="dialog" data-testid="rename-modal">
      <div className="w-[95vw] max-w-md rounded-xl bg-[var(--bg-card)] border border-amber-700/40 p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-amber-200">✏️ แก้ไขชื่อ backup</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="text-xs text-gray-500"><code>{target.backupRef}</code></div>
        <textarea
          value={userNote}
          onChange={e => setUserNote(e.target.value.slice(0, 200))}
          maxLength={200}
          rows={2}
          className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-700 text-sm"
          data-testid="rename-input"
        />
        <span className="text-xs text-gray-500">{userNote.length} / 200 — bodyHash + storageManifestHash จะไม่เปลี่ยน (userNote excluded จาก hash)</span>
        {error && <div className="text-xs text-rose-300">⚠️ {error}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded text-sm border border-gray-700">ยกเลิก</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded text-sm bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50" data-testid="rename-save">
            {saving ? <Loader2 size={12} className="inline animate-spin" /> : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirmModal({ target, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [graceError, setGraceError] = useState(null);
  const [forceOverride, setForceOverride] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    setError('');
    setGraceError(null);
    try {
      const res = await authedFetch('/api/admin/backup-manager-delete', {
        backupRef: target.backupRef,
        forceOverrideGrace: forceOverride,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (data.error === 'AV19_GRACE_PERIOD') {
          setGraceError(data.detail);
        } else {
          setError(data.error || 'DELETE_FAILED');
        }
        return;
      }
      onDeleted();
    } catch (e) { setError(e.message); }
    finally { setDeleting(false); }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm" role="dialog" data-testid="delete-confirm-modal">
      <div className="w-[95vw] max-w-md rounded-xl bg-[var(--bg-card)] border border-rose-700/40 p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-rose-300">🗑️ ลบ backup file?</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="text-xs text-gray-500"><code>{target.backupRef}</code></div>
        <div className="text-sm text-gray-300">การลบไฟล์สำรองนี้จะลบทั้ง JSON และ Storage tree ที่เกี่ยวข้องอย่างถาวร</div>

        {graceError && (
          <div className="p-2 bg-amber-950/30 border border-amber-700/50 rounded text-xs space-y-1">
            <div className="text-amber-200 font-bold">⚠️ AV19 72h-grace period</div>
            <div className="text-amber-100">{graceError.message}</div>
            <div className="text-amber-200">Audit doc: <code>{graceError.recentAuditDocRef}</code></div>
            <div className="text-amber-200">เหลือ {graceError.graceRemaining}h ก่อนกราซหมด</div>
            <label className="flex items-center gap-2 mt-2 text-xs text-amber-100">
              <input type="checkbox" checked={forceOverride} onChange={e => setForceOverride(e.target.checked)} />
              ⚠️ บังคับลบโดยข้าม AV19 grace (มีความเสี่ยงสูง)
            </label>
          </div>
        )}

        {error && <div className="text-xs text-rose-300">⚠️ {error}</div>}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded text-sm border border-gray-700">ยกเลิก</button>
          <button onClick={handleDelete} disabled={deleting || (graceError && !forceOverride)} className="px-4 py-2 rounded text-sm bg-rose-700 hover:bg-rose-600 text-white disabled:opacity-50" data-testid="delete-confirm-btn">
            {deleting ? <Loader2 size={12} className="inline animate-spin" /> : 'ลบถาวร'}
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkDeleteConfirmModal({ backupRefs, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [forceOverride, setForceOverride] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    setError('');
    try {
      const res = await authedFetch('/api/admin/backup-manager-bulk-delete', {
        backupRefs,
        forceOverrideGrace: forceOverride,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { setError(data.error || 'BULK_DELETE_FAILED'); return; }
      setResult(data);
    } catch (e) { setError(e.message); }
    finally { setDeleting(false); }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm" role="dialog" data-testid="bulk-delete-confirm-modal">
      <div className="w-[95vw] max-w-md rounded-xl bg-[var(--bg-card)] border border-rose-700/40 p-6 space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-rose-300">🗑️ ลบ {backupRefs.length} ไฟล์?</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        {!result && (
          <>
            <div className="text-sm text-gray-300">การลบไฟล์สำรองทั้ง {backupRefs.length} ไฟล์ + Storage tree ที่เกี่ยวข้องอย่างถาวร — ไฟล์ที่ตรง AV19 grace จะถูกข้าม (มีรายงานในผลลัพธ์)</div>
            <label className="flex items-center gap-2 text-xs text-amber-100">
              <input type="checkbox" checked={forceOverride} onChange={e => setForceOverride(e.target.checked)} />
              ⚠️ บังคับลบโดยข้าม AV19 grace
            </label>
            {error && <div className="text-xs text-rose-300">⚠️ {error}</div>}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={onClose} className="px-4 py-2 rounded text-sm border border-gray-700">ยกเลิก</button>
              <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 rounded text-sm bg-rose-700 hover:bg-rose-600 text-white disabled:opacity-50" data-testid="bulk-delete-confirm-btn">
                {deleting ? <Loader2 size={12} className="inline animate-spin" /> : `ลบถาวร (${backupRefs.length})`}
              </button>
            </div>
          </>
        )}
        {result && (
          <div className="space-y-2 text-sm" data-testid="bulk-delete-result">
            <div className="flex items-center gap-2 text-green-400 font-bold">
              <CheckCircle2 size={16} /> ลบสำเร็จ {result.deletedCount} / {result.requestedCount}
            </div>
            {result.failedRefs?.length > 0 && (
              <div className="text-xs text-amber-300">
                <div className="font-bold mb-1">ข้ามไม่ลบ: {result.failedRefs.length}</div>
                {result.failedRefs.slice(0, 5).map(f => (
                  <div key={f.ref} className="font-mono text-[10px]">{f.ref} — {f.reason}</div>
                ))}
              </div>
            )}
            <button onClick={onDeleted} className="px-4 py-2 rounded text-sm bg-amber-600 text-white">ปิด</button>
          </div>
        )}
      </div>
    </div>
  );
}
