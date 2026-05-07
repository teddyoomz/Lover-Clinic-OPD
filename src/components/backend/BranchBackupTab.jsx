import { useState, useEffect, useCallback, useMemo } from 'react';
import { Database, Download, RotateCcw, Trash2, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { auth } from '../../firebase.js';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
import { TIER_MAP, BACKUP_TIER_T1, BACKUP_TIER_T2, BACKUP_TIER_T3, BACKUP_TIER_T4 } from '../../lib/branchBackupCore.js';
// audit-branch-scope: sanctioned exception — admin tab uses raw fetch to /api/admin/*

const TIER_LABELS = {
  [BACKUP_TIER_T1]: 'T1 — Master/Setup (สินค้า, คอร์ส, โปร, …)',
  [BACKUP_TIER_T2]: 'T2 — Transactions (ขาย, รักษา, นัด, …)',
  [BACKUP_TIER_T3]: 'T3 — Stock + ledger',
  [BACKUP_TIER_T4]: 'T4 — Customer subcollections',
};

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
      setRecent({ signedUrl: json.signedUrl, sizeBytes: json.sizeBytes, perCollectionCounts: json.perCollectionCounts });
    } catch (e) {
      setError(e.message || 'Backup failed');
    } finally {
      setBusy(false);
    }
  }, [selectedBranchId, tiersChecked, collectionsChecked, advancedOpen]);

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
          <div className="text-emerald-400 text-sm">
            ✓ Backup สำเร็จ — {(recent.sizeBytes / 1024 / 1024).toFixed(2)} MB
            <a href={recent.signedUrl} target="_blank" rel="noopener noreferrer" className="ml-2 underline">Download</a>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-[var(--bd)] p-4">
        <h3 className="font-semibold mb-3">Backups ที่มี (สาขานี้)</h3>
        <BackupsList branchId={selectedBranchId} theme={theme} />
      </section>
    </div>
  );
}

function BackupsList({ branchId, theme }) {
  // Stub — list endpoint not yet wired (out of v1 scope per spec §11);
  // for v1, admin can paste storage path manually into Restore form.
  // TODO v2: wire GET /api/admin/branch-backups?branchId=...
  return (
    <div className="text-xs text-[var(--tx-muted)]">
      v1: ดู backups ผ่าน Firebase Console → Storage → backups/{branchId || '...'}/<br />
      Restore: ใช้ "Upload File" form ด้านล่าง (or paste storage path)
    </div>
  );
}
