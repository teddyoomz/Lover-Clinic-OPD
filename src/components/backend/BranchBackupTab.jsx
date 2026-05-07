import { useState, useEffect, useCallback, useMemo } from 'react';
import { Database, Download, RotateCcw, Trash2, ChevronDown, ChevronUp, Loader2, Upload, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { auth } from '../../firebase.js';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
import { TIER_MAP, BACKUP_TIER_T1, BACKUP_TIER_T2, BACKUP_TIER_T3, BACKUP_TIER_T4 } from '../../lib/branchBackupCore.js';
import { listBranches } from '../../lib/scopedDataLayer.js';
// audit-branch-scope: sanctioned exception — admin tab uses raw fetch to /api/admin/*

const TIER_LABELS = {
  [BACKUP_TIER_T1]: 'T1 — Master/Setup (สินค้า, คอร์ส, โปร, …)',
  [BACKUP_TIER_T2]: 'T2 — Transactions (ขาย, รักษา, นัด, …)',
  [BACKUP_TIER_T3]: 'T3 — Stock + ledger',
  [BACKUP_TIER_T4]: 'T4 — Customer subcollections',
};

// V40-prod-fix-4 (2026-05-08) — smart size formatter so small files (e.g.
// 4 KB) don't display as "0.00 MB" (user reported confusion).
function formatBytes(b) {
  if (!b || b < 0) return '0 B';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(2)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(2)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function totalBackupDocs(perCollectionCounts) {
  if (!perCollectionCounts) return 0;
  return Object.values(perCollectionCounts).reduce((a, b) => a + (Number(b) || 0), 0);
}

export default function BranchBackupTab({ theme = 'dark' }) {
  const { branchId: selectedBranchId } = useSelectedBranch();
  const [tiersChecked, setTiersChecked] = useState({ T1: true, T2: true, T3: true, T4: true });
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [collectionsChecked, setCollectionsChecked] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recent, setRecent] = useState(null);

  const allCollections = useMemo(() => {
    const out = [];
    for (const tier of [BACKUP_TIER_T1, BACKUP_TIER_T2, BACKUP_TIER_T3, BACKUP_TIER_T4]) {
      for (const col of TIER_MAP[tier]) {
        out.push({ tier, col });
      }
    }
    return out;
  }, []);

  const handleBackup = useCallback(async () => {
    if (!selectedBranchId) { setError('กรุณาเลือกสาขา'); return; }
    setBusy(true); setError('');
    try {
      const token = await auth.currentUser?.getIdToken();
      const tiers = Object.keys(tiersChecked).filter(k => tiersChecked[k]);
      const collections = advancedOpen ? Object.keys(collectionsChecked).filter(k => collectionsChecked[k]) : null;
      const res = await fetch('/api/admin/branch-backup-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ branchId: selectedBranchId, tiers, collections, isAutoPreFresh: false }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'Backup failed');
      setRecent({ signedUrl: json.signedUrl, sizeBytes: json.sizeBytes, perCollectionCounts: json.perCollectionCounts, storagePath: json.storagePath });
    } catch (e) {
      setError(e.message || 'Backup failed');
    } finally {
      setBusy(false);
    }
  }, [selectedBranchId, tiersChecked, collectionsChecked, advancedOpen]);

  // Restore section state — controlled by parent so BackupsList "Restore" button can pre-fill source path
  const [restoreSource, setRestoreSource] = useState('');
  const [restoreUploadedFile, setRestoreUploadedFile] = useState(null);
  const [restoreUploadedName, setRestoreUploadedName] = useState('');

  const handleQuickPickForRestore = useCallback((storagePath) => {
    setRestoreSource(storagePath);
    setRestoreUploadedFile(null);
    setRestoreUploadedName('');
    // Scroll to restore section
    setTimeout(() => {
      document.getElementById('v40-restore-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }, []);

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center gap-3">
        <Database size={24} className="text-blue-400" />
        <h2 className="text-xl font-bold">Backup สาขา</h2>
      </header>

      <section className="rounded-lg border border-[var(--bd)] p-4 space-y-3">
        <h3 className="font-semibold">สร้าง Backup</h3>

        <div className="space-y-2">
          {[BACKUP_TIER_T1, BACKUP_TIER_T2, BACKUP_TIER_T3, BACKUP_TIER_T4].map(tier => (
            <label key={tier} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={tiersChecked[tier]} onChange={e => setTiersChecked(s => ({ ...s, [tier]: e.target.checked }))} disabled={busy || advancedOpen} />
              <span className={advancedOpen ? 'opacity-50' : ''}>{TIER_LABELS[tier]}</span>
            </label>
          ))}
        </div>

        <button onClick={() => setAdvancedOpen(o => !o)} className="text-sm flex items-center gap-1 text-blue-400 hover:underline">
          {advancedOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          Advanced — เลือก collection
        </button>

        {advancedOpen && (
          <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto p-3 rounded bg-[var(--bg-hover)]">
            {allCollections.map(({ tier, col }) => (
              <label key={col} className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={!!collectionsChecked[col]} onChange={e => setCollectionsChecked(s => ({ ...s, [col]: e.target.checked }))} disabled={busy} />
                <span><strong>{tier}</strong> · {col}</span>
              </label>
            ))}
          </div>
        )}

        <button onClick={handleBackup} disabled={busy} className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center gap-2">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          เริ่ม Backup
        </button>

        {error && <div className="text-rose-400 text-sm">{error}</div>}
        {recent && (
          <div className="text-emerald-400 text-sm space-y-1">
            <div>
              ✓ Backup สำเร็จ — {totalBackupDocs(recent.perCollectionCounts)} docs · {formatBytes(recent.sizeBytes)}
            </div>
            <div className="flex gap-3 text-xs">
              <a
                href={recent.signedUrl}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1 rounded bg-blue-600/30 hover:bg-blue-600/50 text-blue-200 inline-flex items-center gap-1.5"
              >
                <Download size={12} /> Download ไฟล์ (.json)
              </a>
              <button
                type="button"
                onClick={() => handleQuickPickForRestore(recent.storagePath)}
                className="px-3 py-1 rounded bg-amber-600/30 hover:bg-amber-600/50 text-amber-200 inline-flex items-center gap-1.5"
              >
                <RotateCcw size={12} /> ใช้ไฟล์นี้ Restore
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-[var(--bd)] p-4">
        <h3 className="font-semibold mb-3">Backups ที่มี (สาขานี้)</h3>
        <BackupsList branchId={selectedBranchId} onPickForRestore={handleQuickPickForRestore} />
      </section>

      <RestoreSection
        sourcePath={restoreSource}
        setSourcePath={setRestoreSource}
        uploadedFile={restoreUploadedFile}
        setUploadedFile={setRestoreUploadedFile}
        uploadedName={restoreUploadedName}
        setUploadedName={setRestoreUploadedName}
        defaultTargetBranchId={selectedBranchId}
      />
    </div>
  );
}

function BackupsList({ branchId, onPickForRestore }) {
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!branchId) return;
    setBusy(true); setError('');
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/admin/branch-backups?branchId=${encodeURIComponent(branchId)}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'List failed');
      setItems(json.backups || []);
      setLoaded(true);
    } catch (e) {
      setError(e.message || 'List failed');
    } finally {
      setBusy(false);
    }
  }, [branchId]);

  useEffect(() => { setLoaded(false); setItems([]); }, [branchId]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          onClick={load}
          disabled={busy || !branchId}
          className="px-3 py-1.5 text-xs rounded bg-[var(--bg-hover)] hover:bg-[var(--bg-active)] inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          {loaded ? 'รีเฟรช' : 'โหลดรายการ Backups'}
        </button>
        {loaded && items.length === 0 && (
          <span className="text-xs text-[var(--tx-muted)]">ไม่มี backup สำหรับสาขานี้</span>
        )}
      </div>
      {error && <div className="text-rose-400 text-xs">{error}</div>}

      {items.length > 0 && (
        <div className="overflow-x-auto rounded border border-[var(--bd)]">
          <table className="w-full text-xs">
            <thead className="bg-[var(--bg-hover)]">
              <tr>
                <th className="text-left px-3 py-2">ชื่อไฟล์</th>
                <th className="text-right px-3 py-2">ขนาด</th>
                <th className="text-left px-3 py-2">สร้างเมื่อ</th>
                <th className="text-left px-3 py-2">ประเภท</th>
                <th className="text-right px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(b => (
                <tr key={b.storagePath} className="border-t border-[var(--bd)]">
                  <td className="px-3 py-2 font-mono">{b.name}</td>
                  <td className="px-3 py-2 text-right">{formatBytes(b.size)}</td>
                  <td className="px-3 py-2">{b.createdAt ? new Date(b.createdAt).toLocaleString('th-TH') : '-'}</td>
                  <td className="px-3 py-2">
                    {b.isAutoPreFresh ? (
                      <span className="px-1.5 py-0.5 text-[10px] rounded bg-amber-900/30 text-amber-300 border border-amber-800/40">auto-pre-fresh</span>
                    ) : (
                      <span className="px-1.5 py-0.5 text-[10px] rounded bg-blue-900/30 text-blue-300 border border-blue-800/40">manual</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right space-x-2 whitespace-nowrap">
                    <a
                      href={b.signedUrl}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline"
                    >
                      Download
                    </a>
                    <button
                      type="button"
                      onClick={() => onPickForRestore?.(b.storagePath)}
                      className="text-amber-300 hover:underline"
                    >
                      Restore →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RestoreSection({ sourcePath, setSourcePath, uploadedFile, setUploadedFile, uploadedName, setUploadedName, defaultTargetBranchId }) {
  const [branches, setBranches] = useState([]);
  const [targetBranchId, setTargetBranchId] = useState(defaultTargetBranchId || '');
  const [mode, setMode] = useState('overwrite'); // 'overwrite' | 'clone'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [confirmText, setConfirmText] = useState('');

  // Load branch list
  useEffect(() => {
    listBranches({ includeArchived: false })
      .then(setBranches)
      .catch(() => setBranches([]));
  }, []);

  // When the parent's defaultTargetBranchId changes, sync (initial load)
  useEffect(() => {
    if (defaultTargetBranchId && !targetBranchId) setTargetBranchId(defaultTargetBranchId);
  }, [defaultTargetBranchId, targetBranchId]);

  const targetBranchName = useMemo(() => {
    return branches.find(b => (b.branchId || b.id) === targetBranchId)?.branchName ||
           branches.find(b => (b.branchId || b.id) === targetBranchId)?.name || '?';
  }, [branches, targetBranchId]);

  const handleFileUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedName(file.name);
    setSourcePath(''); // clear path when file selected
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const base64 = String(dataUrl).split(',')[1] || '';
      setUploadedFile(base64);
    };
    reader.readAsDataURL(file);
  }, [setUploadedFile, setUploadedName, setSourcePath]);

  const handleClearFile = useCallback(() => {
    setUploadedFile(null);
    setUploadedName('');
  }, [setUploadedFile, setUploadedName]);

  const sourceProvided = !!(sourcePath || uploadedFile);
  const confirmRequired = `restore ${targetBranchName}`;
  const confirmOk = confirmText.trim() === confirmRequired.trim();

  const handleRestore = useCallback(async () => {
    if (!sourceProvided) { setError('ต้องเลือกไฟล์ backup ก่อน (จากรายการ หรือ upload)'); return; }
    if (!targetBranchId) { setError('กรุณาเลือกสาขาเป้าหมาย'); return; }
    if (!confirmOk) { setError(`กรุณาพิมพ์ "${confirmRequired}" เพื่อยืนยัน`); return; }
    setBusy(true); setError(''); setResult(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const body = {
        mode,
        targetBranchId,
        ...(sourcePath ? { sourceStoragePath: sourcePath } : { uploadedFileBase64: uploadedFile }),
      };
      const res = await fetch('/api/admin/branch-restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || `Restore failed (HTTP ${res.status})${json.detail ? ': ' + json.detail : ''}`);
      setResult(json);
      setConfirmText('');
    } catch (e) {
      setError(e.message || 'Restore failed');
    } finally {
      setBusy(false);
    }
  }, [sourceProvided, targetBranchId, confirmOk, confirmRequired, mode, sourcePath, uploadedFile]);

  return (
    <section
      id="v40-restore-section"
      className="rounded-lg border border-amber-800/40 bg-amber-900/10 p-4 space-y-3"
    >
      <div className="flex items-center gap-2">
        <RotateCcw size={18} className="text-amber-300" />
        <h3 className="font-semibold text-amber-200">Restore — กู้คืนข้อมูล</h3>
      </div>
      <div className="text-xs text-[var(--tx-muted)]">
        นำไฟล์ backup ที่เคย export ไว้ (จากรายการด้านบน หรือไฟล์บนเครื่อง) มาเขียนกลับเข้า Firestore.
        <br />
        <strong className="text-amber-300">Overwrite</strong> = เขียนทับสาขาเดิม (preserve docId) — ใช้กรณี Make-Fresh เผลอกด.
        <br />
        <strong className="text-amber-300">Clone</strong> = สร้าง copy ในสาขาอื่น (T1 master/setup เท่านั้น, re-mint docId + remap FK).
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Source — storagePath OR upload */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-[var(--tx-muted)]">ไฟล์ Backup</label>
          {sourcePath ? (
            <div className="space-y-1">
              <div className="px-3 py-2 rounded bg-[var(--bg-hover)] text-xs font-mono break-all">{sourcePath}</div>
              <button
                type="button"
                onClick={() => { setSourcePath(''); }}
                className="text-xs text-rose-300 hover:underline"
              >
                ลบ — เลือกไฟล์ใหม่
              </button>
            </div>
          ) : uploadedFile ? (
            <div className="space-y-1">
              <div className="px-3 py-2 rounded bg-[var(--bg-hover)] text-xs">📎 {uploadedName}</div>
              <button
                type="button"
                onClick={handleClearFile}
                className="text-xs text-rose-300 hover:underline"
              >
                ลบ — เลือกไฟล์ใหม่
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs cursor-pointer px-3 py-2 rounded border border-dashed border-[var(--bd)] hover:bg-[var(--bg-hover)]">
                <Upload size={14} />
                <span>คลิกเพื่อ upload ไฟล์ JSON จากเครื่อง</span>
                <input type="file" accept=".json,application/json" onChange={handleFileUpload} className="hidden" data-testid="restore-file-upload" />
              </label>
              <div className="text-[10px] text-[var(--tx-muted)] text-center">
                หรือเลือกจากรายการด้านบน (กดปุ่ม "Restore →")
              </div>
            </div>
          )}
        </div>

        {/* Target branch + mode */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-[var(--tx-muted)]">สาขาเป้าหมาย</label>
          <select
            value={targetBranchId}
            onChange={e => setTargetBranchId(e.target.value)}
            disabled={busy}
            className="w-full px-3 py-2 rounded bg-[var(--bg-hover)] border border-[var(--bd)] text-sm"
            data-testid="restore-target-branch"
          >
            <option value="">— เลือกสาขา —</option>
            {branches.map(b => (
              <option key={b.branchId || b.id} value={b.branchId || b.id}>
                {b.branchName || b.name} ({b.branchId || b.id})
              </option>
            ))}
          </select>

          <label className="text-xs font-medium text-[var(--tx-muted)] mt-2 block">โหมด</label>
          <div className="flex gap-2">
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="radio" name="restoreMode" checked={mode === 'overwrite'} onChange={() => setMode('overwrite')} disabled={busy} />
              <span><strong>Overwrite</strong> (สาขาเดิม)</span>
            </label>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="radio" name="restoreMode" checked={mode === 'clone'} onChange={() => setMode('clone')} disabled={busy} />
              <span><strong>Clone</strong> (T1 → สาขาใหม่)</span>
            </label>
          </div>
        </div>
      </div>

      {/* Confirm gate */}
      <div className="pt-2 border-t border-[var(--bd)]">
        <label className="text-xs">
          <span className="text-rose-300">⚠ ยืนยัน</span> — พิมพ์{' '}
          <code className="bg-[var(--bg-hover)] px-1 rounded">{confirmRequired}</code>{' '}
          เพื่อปลดล็อกปุ่ม
        </label>
        <input
          type="text"
          value={confirmText}
          onChange={e => setConfirmText(e.target.value)}
          disabled={busy}
          placeholder={confirmRequired}
          className="w-full mt-1 px-3 py-2 rounded bg-[var(--bg-hover)] border border-[var(--bd)] text-sm font-mono"
          data-testid="restore-confirm-input"
        />
      </div>

      <button
        onClick={handleRestore}
        disabled={busy || !confirmOk || !sourceProvided || !targetBranchId}
        className="px-4 py-2 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-30 text-white text-sm font-bold inline-flex items-center gap-2"
        data-testid="restore-submit"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
        ยืนยัน Restore
      </button>

      {error && (
        <div className="flex items-start gap-2 p-2 rounded bg-rose-900/20 border border-rose-800/40 text-rose-300 text-sm">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result && result.ok && (
        <div className="space-y-2 p-3 rounded bg-emerald-900/20 border border-emerald-800/40 text-sm">
          <div className="flex items-center gap-2 text-emerald-300 font-semibold">
            <CheckCircle2 size={14} /> Restore สำเร็จ ({result.mode})
          </div>
          <div className="text-xs space-y-1">
            <div>auditId: <code className="bg-[var(--bg-hover)] px-1 rounded">{result.auditId}</code></div>
            <div>เขียน: {Object.entries(result.perCollection || {}).map(([k, v]) => `${k}: ${v.written}`).join(' · ')}</div>
            {result.unmapped && result.unmapped.length > 0 && (
              <div className="text-amber-300">
                ⚠ FK unmapped: {result.unmapped.length} รายการ (อาจต้องตรวจสอบ — clone mode ที่อ้างอิง FK ไม่ได้)
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
