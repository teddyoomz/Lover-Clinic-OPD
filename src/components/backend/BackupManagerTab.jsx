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
// V77 (2026-05-16 EOD+1) — Whole-fleet customer backup trigger modal. DEPRECATED V81-fix4
// (2026-05-17 EOD+2) — per-customer backup model removed per user directive
// "ไม่ต้องเก็บข้อมูล Backup ลูกค้าแบบแยกคน รกเหี้ยๆ". V81 whole-system backup is
// the canonical "backup all customer data" mechanism going forward.
// Import deliberately commented out; file kept for archival reference.
// import WholeFleetBackupModal from './WholeFleetBackupModal.jsx';
// V81 (2026-05-17) — Whole-system backup (Firestore + Storage + Auth) + restore modals.
import WholeSystemBackupModal from './WholeSystemBackupModal.jsx';
import WholeSystemRestoreModal from './WholeSystemRestoreModal.jsx';

async function authedFetch(url, body) {
  const token = await auth.currentUser?.getIdToken();
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

// V81-fix4: 'customer' type removed from filter chips (per-customer backup
// model deprecated). Branch + central-stock chips remain for V40 + V15 backups.
// Legacy customer rows in storage are purged via scripts/v81-fix4-purge-customer-backups.mjs.
const TYPE_LABELS = {
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
  // V81-fix4: customer type removed from default filter (per-customer backup deprecated)
  const [typeFilter, setTypeFilter] = useState({ branch: true, 'central-stock': true });
  const [search, setSearch] = useState('');
  const [selectedRefs, setSelectedRefs] = useState(new Set());
  const [renameTarget, setRenameTarget] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  // V77 (2026-05-16 EOD+1) — whole-fleet backup modal. DEPRECATED V81-fix4 — state removed.
  // V81 (2026-05-17) — whole-system backup + restore state
  const [wsBackups, setWsBackups] = useState([]);
  const [wsLoading, setWsLoading] = useState(false);
  const [wsBackupModalOpen, setWsBackupModalOpen] = useState(false);
  const [wsRestoreModalOpen, setWsRestoreModalOpen] = useState(false);
  // V81-fix6 (2026-05-17 EOD+2 LATE+1) — customer-only single-file backup state
  const [coBackups, setCoBackups] = useState([]);
  const [coLoading, setCoLoading] = useState(false);
  const [coBusy, setCoBusy] = useState(false);
  const [coRestoreConfirm, setCoRestoreConfirm] = useState(null); // {name} or null

  const loadWsBackups = useCallback(async () => {
    setWsLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/admin/whole-system-backups-list', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      setWsBackups(Array.isArray(json.backups) ? json.backups : []);
    } catch (e) {
      setWsBackups([]);
    } finally {
      setWsLoading(false);
    }
  }, []);

  // V81-fix6: customer-only list loader
  const loadCoBackups = useCallback(async () => {
    setCoLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/admin/customer-only-backups-list', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      setCoBackups(Array.isArray(json.backups) ? json.backups : []);
    } catch (e) {
      setCoBackups([]);
    } finally {
      setCoLoading(false);
    }
  }, []);

  useEffect(() => { loadWsBackups(); loadCoBackups(); }, [loadWsBackups, loadCoBackups]);

  async function downloadWs(name) {
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/admin/whole-system-backup-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ backupRef: name }),
      });
      const json = await res.json();
      if (json.downloadUrl) window.open(json.downloadUrl, '_blank');
      else alert(`Download failed: ${json.error || 'unknown'}`);
    } catch (e) {
      alert(`Download error: ${e.message}`);
    }
  }

  // V81-fix6 UX: optimistic delete — remove from state immediately, rollback on error.
  // No full reload = no flicker; UI feels instant.
  async function deleteWs(names) {
    if (!window.confirm(`ลบ ${names.length} backup(s)?`)) return;
    const before = wsBackups;
    setWsBackups(prev => prev.filter(b => !names.includes(b.name)));
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/admin/whole-system-backup-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ names }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      setWsBackups(before); // rollback
      alert(`Delete error: ${e.message}`);
    }
  }

  // V81-fix6: customer-only download (mirror of whole-system)
  async function downloadCo(name) {
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/admin/customer-only-backup-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ backupRef: name }),
      });
      const json = await res.json();
      if (json.downloadUrl) window.open(json.downloadUrl, '_blank');
      else alert(`Download failed: ${json.error || 'unknown'}`);
    } catch (e) {
      alert(`Download error: ${e.message}`);
    }
  }

  // V81-fix6: customer-only optimistic delete
  async function deleteCo(names) {
    if (!window.confirm(`ลบ customer backup ${names.length} ไฟล์?`)) return;
    const before = coBackups;
    setCoBackups(prev => prev.filter(b => !names.includes(b.name)));
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/admin/customer-only-backup-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ names }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      setCoBackups(before);
      alert(`Delete error: ${e.message}`);
    }
  }

  // V81-fix6: customer-only one-click backup (no modal — single button)
  async function backupCoNow() {
    if (coBusy) return;
    if (!window.confirm('สำรองข้อมูลลูกค้าทั้งหมด (ALL customers + transactions + storage) → ไฟล์เดียว ?')) return;
    setCoBusy(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/admin/customer-only-backup-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || json.error || `HTTP ${res.status}`);
      await loadCoBackups();
    } catch (e) {
      alert(`Backup error: ${e.message}`);
    } finally {
      setCoBusy(false);
    }
  }

  // V81-fix6: customer-only restore (Replace mode with confirm)
  async function restoreCoConfirmed(name) {
    setCoBusy(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/admin/customer-only-restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ backupRef: name, mode: 'replace', confirmName: name }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || json.error || `HTTP ${res.status}`);
      alert(`Restore สำเร็จ ✓ Docs: ${json.stats?.restoredDocs || 0} | Auto-pre-backup: ${json.autoBackupRef || '-'}`);
      await loadCoBackups();
      setCoRestoreConfirm(null);
    } catch (e) {
      alert(`Restore error: ${e.message}`);
    } finally {
      setCoBusy(false);
    }
  }

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
          {/* V81-fix4 (2026-05-17 EOD+2) — V77 "📦 สำรองลูกค้าทุกคน" button REMOVED.
              Use the V81 "📥 Backup Now" button below (Whole-System Backups section)
              which includes ALL be_customers + subcollections + Storage + Auth in ONE
              single file. Per user directive: "ไม่ต้องเก็บข้อมูล Backup ลูกค้าแบบแยกคน". */}
          <button onClick={reload} className="px-3 py-1.5 rounded-lg text-xs border border-gray-700 hover:bg-gray-800 flex items-center gap-1.5">
            <RefreshCw size={12} /> รีโหลด
          </button>
        </div>
      </div>

      {/* V77 WholeFleetBackupModal REMOVED V81-fix4 — see import comment above. */}

      {/* V81 (2026-05-17) — Whole-System Backups (full Firestore + Storage + Auth clone) */}
      <section className="mb-6 p-4 bg-gray-900/30 border border-gray-800 rounded-xl" data-testid="whole-system-backups-section">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-lg font-bold text-amber-300">🌐 Whole-System Backups (V81)</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Auto-daily 03:00 BKK · 5-day rolling retention · 7-day pre-restore · ∞ manual.
              Includes ALL Firestore collections + Firebase Storage + Auth users (no passwords).
            </p>
          </div>
          <button
            onClick={() => setWsBackupModalOpen(true)}
            className="px-3 py-1.5 rounded-lg text-xs bg-red-700 hover:bg-red-600 text-white font-bold flex items-center gap-1.5"
            data-testid="whole-system-backup-trigger"
            title="สำรองทั้งระบบ (Firestore + Storage + Auth)"
          >
            📥 Backup Now
          </button>
        </div>

        {wsLoading ? (
          <p className="text-xs text-gray-500">กำลังโหลด...</p>
        ) : wsBackups.length === 0 ? (
          <p className="text-xs text-gray-500">ยังไม่มี backup — กด "📥 Backup Now" เพื่อสร้างตัวแรก หรือรอ auto-cron 03:00 BKK</p>
        ) : (
          <>
            <div className="flex items-center justify-end mb-2">
              <button
                onClick={() => setWsRestoreModalOpen(true)}
                className="px-3 py-1.5 rounded-lg text-xs bg-amber-700 hover:bg-amber-600 text-white font-bold"
                data-testid="whole-system-restore-trigger"
                title="Restore จาก backup ที่เลือก"
              >
                🔄 Restore
              </button>
            </div>
            <div className="space-y-1.5">
              {wsBackups.map(b => (
                <div key={b.name} className="flex items-center justify-between p-2.5 bg-gray-900/50 border border-gray-800 rounded-lg text-xs">
                  <div className="flex-1 min-w-0">
                    <code className="font-bold text-amber-300">{b.name}</code>
                    {b.hashOk === false && <span className="ml-2 text-red-400">⚠ HASH BAD</span>}
                    {b.error && <span className="ml-2 text-red-400">⚠ {b.error}</span>}
                    <div className="text-gray-500 mt-0.5">
                      {b.stats?.totalDocCount?.toLocaleString() || 0} docs ·{' '}
                      {/* V81-fix4 Bug A2: show TOTAL on-disk backup size
                          (collections + storage + auth + manifest); falls back to legacy
                          totalStorageBytes for backups created pre-V81-fix4 */}
                      {(() => {
                        const bytes = b.totalBytes
                          ?? ((b.stats?.totalCollectionFileBytes || 0) + (b.stats?.totalStorageBytes || 0));
                        if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
                        if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
                        return `${bytes} B`;
                      })()} ·{' '}
                      {b.stats?.totalAuthUsers || 0} users · {b.type}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => downloadWs(b.name)}
                      className="px-2 py-1 bg-blue-700 hover:bg-blue-600 text-white rounded text-[10px]"
                      title="Download tar.gz"
                    >
                      Download
                    </button>
                    <button
                      onClick={() => deleteWs([b.name])}
                      className="px-2 py-1 bg-red-800 hover:bg-red-700 text-white rounded text-[10px]"
                      title="ลบ backup"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <WholeSystemBackupModal
          open={wsBackupModalOpen}
          onClose={() => setWsBackupModalOpen(false)}
          onComplete={() => loadWsBackups()}
        />
        <WholeSystemRestoreModal
          open={wsRestoreModalOpen}
          onClose={() => setWsRestoreModalOpen(false)}
          backups={wsBackups}
          onComplete={() => loadWsBackups()}
        />
      </section>

      {/* V81-fix6 (2026-05-17 EOD+2 LATE+1) — Customer-Only Single-File Backups.
          Scoped V81: be_customers + customer subcollections + transactions referencing customer +
          Storage at customers/* — Auth NEVER touched. Replace mode wipes ONLY customer-scoped
          collections (staff/products/branches/courses untouched). */}
      <section className="mb-6 p-4 bg-gray-900/30 border border-emerald-800/40 rounded-xl" data-testid="customer-only-backups-section">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-lg font-bold text-emerald-300">👥 Customer-Only Single-File Backups (V81-fix6)</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              สำรองข้อมูลลูกค้าทั้งหมด (be_customers + subcollections + transactions + customer storage) เป็นไฟล์เดียว.
              Restore Replace = ลบ + ใส่กลับ ENTIRELY for customer data; <strong>Auth + branches + products + courses ไม่ถูกแตะ</strong>.
            </p>
          </div>
          <button
            onClick={backupCoNow}
            disabled={coBusy}
            className="px-3 py-1.5 rounded-lg text-xs bg-emerald-700 hover:bg-emerald-600 text-white font-bold flex items-center gap-1.5 disabled:opacity-40"
            data-testid="customer-only-backup-trigger"
            title="สำรองข้อมูลลูกค้าทั้งหมดเป็นไฟล์เดียว"
          >
            {coBusy ? <Loader2 size={12} className="animate-spin" /> : '📥'} Backup Now (Customer-Only)
          </button>
        </div>

        {coLoading ? (
          <p className="text-xs text-gray-500">กำลังโหลด...</p>
        ) : coBackups.length === 0 ? (
          <p className="text-xs text-gray-500">ยังไม่มี customer-only backup — กด "📥 Backup Now" เพื่อสร้างตัวแรก</p>
        ) : (
          <div className="space-y-1.5">
            {coBackups.map(b => (
              <div key={b.name} className="flex items-center justify-between p-2.5 bg-gray-900/50 border border-emerald-800/40 rounded-lg text-xs">
                <div className="flex-1 min-w-0">
                  <code className="font-bold text-emerald-300">{b.name}</code>
                  {b.hashOk === false && <span className="ml-2 text-red-400">⚠ HASH BAD</span>}
                  {b.error && <span className="ml-2 text-red-400">⚠ {b.error}</span>}
                  <div className="text-gray-500 mt-0.5">
                    {b.stats?.totalDocCount?.toLocaleString() || 0} docs ·{' '}
                    {(() => {
                      const bytes = b.totalBytes ?? 0;
                      if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
                      if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
                      return `${bytes} B`;
                    })()} · {b.type}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCoRestoreConfirm({ name: b.name })}
                    disabled={coBusy}
                    className="px-2 py-1 bg-amber-700 hover:bg-amber-600 text-white rounded text-[10px] disabled:opacity-40"
                    title="Restore (Replace mode) — ลบ + ใส่กลับ"
                    data-testid={`customer-only-restore-${b.name}`}
                  >
                    🔄 Restore
                  </button>
                  <button onClick={() => downloadCo(b.name)} className="px-2 py-1 bg-blue-700 hover:bg-blue-600 text-white rounded text-[10px]" title="Download tar.gz">
                    Download
                  </button>
                  <button onClick={() => deleteCo([b.name])} className="px-2 py-1 bg-red-800 hover:bg-red-700 text-white rounded text-[10px]" title="ลบ backup">
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Customer-Only Restore confirm */}
        {coRestoreConfirm && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm" role="dialog" data-testid="customer-only-restore-confirm">
            <div className="w-[95vw] max-w-md rounded-xl bg-[var(--bg-card)] border-2 border-amber-700/60 p-6 space-y-3">
              <h3 className="text-lg font-bold text-amber-300">🔄 Restore Customer Data (Replace mode)?</h3>
              <div className="text-xs text-gray-400"><code>{coRestoreConfirm.name}</code></div>
              <div className="text-sm text-gray-200 space-y-2">
                <p>✓ Auto-pre-backup จะถูกสร้าง (เก็บ 7 วัน — undo ได้)</p>
                <p>✓ <strong className="text-emerald-300">Auth / branches / staff / products / courses ไม่ถูกแตะ</strong></p>
                <p>⚠ ข้อมูลลูกค้าปัจจุบัน (391 customers + transactions + storage) จะถูกลบทั้งหมด + แทนที่ด้วย backup</p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setCoRestoreConfirm(null)} disabled={coBusy} className="px-4 py-2 rounded text-sm border border-gray-700">ยกเลิก</button>
                <button onClick={() => restoreCoConfirmed(coRestoreConfirm.name)} disabled={coBusy} className="px-4 py-2 rounded text-sm bg-amber-700 hover:bg-amber-600 text-white disabled:opacity-50" data-testid="customer-only-restore-confirm-btn">
                  {coBusy ? <Loader2 size={12} className="inline animate-spin" /> : 'Restore ลบ + ใส่กลับ'}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

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
