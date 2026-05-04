// ─── Permission Groups Tab — Phase 11.7 Master Data Suite ──────────────────
// Lists `be_permission_groups`. Card shows role name + granted-permission
// count (e.g. "42 / 130 สิทธิ์"). 9th reuse of MarketingTabShell.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Edit2, Trash2, ShieldCheck, Loader2, RefreshCw, CheckCircle2, AlertCircle, PackageOpen } from 'lucide-react';
import { listPermissionGroups, deletePermissionGroup, reconcileAllCustomerSummaries } from '../../lib/scopedDataLayer.js';
import { listCoursesNeedingMigration, commitCoursesSkipStockMigration } from '../../lib/migrateCoursesSkipStockClient.js';
import PermissionGroupFormModal from './PermissionGroupFormModal.jsx';
import MarketingTabShell from './MarketingTabShell.jsx';
import { useHasPermission, useTabAccess } from '../../hooks/useTabAccess.js';
import {
  STATUS_OPTIONS,
  ALL_PERMISSION_KEYS,
  countPermissions,
} from '../../lib/permissionGroupValidation.js';

// V29 (2026-04-26) — Removed manual buttons (Bootstrap self / Sync ทุก staff /
// ลบ test-probe ค้าง) per user directive: "ไม่ต้องการระบบ manual เหล่านี้".
// All claim sync is now AUTOMATIC via UserPermissionContext useEffect on
// login + group change. Test-probe cleanup runs in bash post-deploy via
// V27-tris anon DELETE.

const STATUS_BADGE = {
  ใช้งาน:   { cls: 'bg-emerald-700/20 border-emerald-700/40 text-emerald-400' },
  พักใช้งาน: { cls: 'bg-neutral-700/30 border-neutral-700/50 text-neutral-400' },
};

export default function PermissionGroupsTab({ clinicSettings, theme }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState('');
  // Phase 13.5.3 — gate delete on permission_group_management. Admin
  // bypasses (useHasPermission returns true for admins).
  const canDelete = useHasPermission('permission_group_management');
  // M9 (2026-04-26) — admin-only reconciler button. Walks every customer +
  // recomputes the customer-doc summary (totalSpent / lastSaleAt / etc.)
  // from the ledger collections. Use after a Firestore restore, manual
  // edits, or whenever the customer-list summary drifts from the actual
  // sales/treatments/deposits/wallets data.
  const { isAdmin } = useTabAccess();
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState(null);
  const [reconcileProgress, setReconcileProgress] = useState({ done: 0, total: 0, name: '' });

  const handleReconcile = useCallback(async () => {
    if (!window.confirm('สรุปยอดลูกค้าใหม่ทั้งหมด?\n\nเดินทุกลูกค้า → คำนวณยอดซื้อ / วันที่ซื้อล่าสุด / ฯลฯ จาก ledger จริง.\nใช้เวลาตามจำนวนลูกค้า — อาจกินเวลาหลายนาที.')) return;
    setReconciling(true);
    setReconcileResult(null);
    setReconcileProgress({ done: 0, total: 0, name: '' });
    try {
      const result = await reconcileAllCustomerSummaries({
        onProgress: ({ done, total, name }) => setReconcileProgress({ done, total, name }),
      });
      setReconcileResult(result);
    } catch (e) {
      setReconcileResult({ error: e.message || String(e) });
    } finally {
      setReconciling(false);
    }
  }, []);

  // 2026-04-28 — admin-only "ไม่ตัดสต็อค" course migration. Walks every
  // be_courses doc + backfills `skipStockDeduction: false` (default
  // unchecked = ตัดสต็อคปกติ) on top-level + every courseProducts[i] entry
  // that doesn't already carry the field. Idempotent — re-runs after
  // commit return 0 changes.
  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState(null);
  const handleMigrateCoursesSkipStock = useCallback(async () => {
    if (!window.confirm('Migrate be_courses ทุก doc เพื่อเพิ่ม flag "ไม่ตัดสต็อค" (default = ไม่ติ๊ก = ตัดสต็อคปกติ)?\n\nระบบจะดู docs ที่ขาด field ก่อน แล้ว update เฉพาะที่จำเป็น (idempotent — รันซ้ำได้)')) return;
    setMigrating(true);
    setMigrationResult(null);
    try {
      const dryRun = await listCoursesNeedingMigration();
      if (!dryRun.needsMigrationCount) {
        setMigrationResult({ noop: true, totalCourses: dryRun.totalCourses });
        return;
      }
      if (!window.confirm(`พบ ${dryRun.needsMigrationCount} / ${dryRun.totalCourses} คอร์สที่ต้อง migrate\n  • ขาด top-level: ${dryRun.topMissingCount}\n  • ขาดใน sub-items: ${dryRun.subMissingCount}\n\nยืนยัน commit ?`)) {
        setMigrationResult({ cancelled: true });
        return;
      }
      const commit = await commitCoursesSkipStockMigration();
      setMigrationResult(commit);
    } catch (e) {
      setMigrationResult({ error: e.message || String(e) });
    } finally {
      setMigrating(false);
    }
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setItems(await listPermissionGroups());
    } catch (e) {
      setError(e.message || 'โหลดกลุ่มสิทธิ์ล้มเหลว');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(p => {
      if (q) {
        const hay = [p.name, p.description].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filterStatus && (p.status || 'ใช้งาน') !== filterStatus) return false;
      return true;
    });
  }, [items, query, filterStatus]);

  const handleCreate = () => { setEditing(null); setFormOpen(true); };
  const handleEdit = (p) => { setEditing(p); setFormOpen(true); };

  const handleDelete = async (p) => {
    const id = p.permissionGroupId || p.id;
    const name = p.name || 'กลุ่มสิทธิ์';
    if (!window.confirm(`ลบกลุ่มสิทธิ์ "${name}" ?\n\nลบจาก Firestore — ย้อนไม่ได้`)) return;
    setDeleting(id);
    setError('');
    try {
      await deletePermissionGroup(id);
      await reload();
    } catch (e) {
      setError(e.message || 'ลบไม่สำเร็จ');
    } finally {
      setDeleting(null);
    }
  };

  const handleSaved = async () => { setFormOpen(false); setEditing(null); await reload(); };

  // V29 (2026-04-26) — All manual admin buttons REMOVED per user directive.
  // Auto-sync handles claim management for all users on login + group
  // change (UserPermissionContext useEffect → /api/admin/sync-self).
  // Test-probe cleanup runs in bash post-deploy via V27-tris anon DELETE.

  const extraFilters = (
    <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
      className="px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]">
      <option value="">สถานะทั้งหมด</option>
      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  );

  // M9 (2026-04-26) — admin reconciler card. Rendered OUTSIDE
  // MarketingTabShell because the shell hides children when there are no
  // permission groups (filteredCount === 0), but the M9 card is a distinct
  // admin operation that should always be available to admins regardless
  // of permission-group state.
  const m9Card = isAdmin && (
    <div className="mb-3 p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--bd)]" data-testid="m9-reconciler-card">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-[var(--tx-heading)] flex items-center gap-2">
            <RefreshCw size={14} className="text-sky-400" />
            สรุปยอดลูกค้าใหม่ทั้งหมด (M9 reconciler)
          </div>
          <div className="text-xs text-[var(--tx-muted)] mt-0.5">
            คำนวณยอดซื้อ / วันที่ซื้อล่าสุด / ฯลฯ จาก ledger จริง — ใช้เมื่อข้อมูลรวมหน้า Customer List ไม่ตรงกับยอดจริง
          </div>
        </div>
        <button
          type="button"
          onClick={handleReconcile}
          disabled={reconciling}
          data-testid="m9-reconcile-btn"
          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-sky-700 text-white inline-flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {reconciling ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {reconciling ? `กำลังสรุป... (${reconcileProgress.done}/${reconcileProgress.total})` : 'สรุปยอดใหม่'}
        </button>
      </div>
      {reconciling && reconcileProgress.name && (
        <div className="mt-2 text-xs text-[var(--tx-muted)] truncate" data-testid="m9-reconcile-progress">
          กำลังประมวลผล: <b className="text-[var(--tx-heading)]">{reconcileProgress.name}</b>
        </div>
      )}
      {reconcileResult && !reconcileResult.error && (
        <div className="mt-2 px-3 py-2 rounded-lg bg-emerald-900/20 border border-emerald-700/40 text-emerald-200 text-xs flex items-start gap-2" data-testid="m9-reconcile-success">
          <CheckCircle2 size={14} className="flex-shrink-0 mt-0.5" />
          <div>
            <div>เสร็จสิ้น — สรุปสำเร็จ <b>{reconcileResult.succeeded}</b> / {reconcileResult.total} ลูกค้า</div>
            {reconcileResult.failed.length > 0 && (
              <div className="mt-1 text-amber-200">
                ล้มเหลว {reconcileResult.failed.length} ราย — {reconcileResult.failed.slice(0, 3).map(f => f.customerId).join(', ')}{reconcileResult.failed.length > 3 ? '...' : ''}
              </div>
            )}
          </div>
        </div>
      )}
      {reconcileResult && reconcileResult.error && (
        <div className="mt-2 px-3 py-2 rounded-lg bg-red-900/20 border border-red-700/40 text-red-300 text-xs flex items-start gap-2" data-testid="m9-reconcile-error">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <div>เกิดข้อผิดพลาด: {reconcileResult.error}</div>
        </div>
      )}
    </div>
  );

  // 2026-04-28 — admin-only course skipStockDeduction migration card.
  // Same pattern as M9 — admin-gated, sky-700 button, optimistic Thai
  // confirm dialogs, success/error banners.
  const skipStockCard = isAdmin && (
    <div className="mb-3 p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--bd)]" data-testid="course-skip-stock-migrate-card">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-[var(--tx-heading)] flex items-center gap-2">
            <PackageOpen size={14} className="text-rose-400" />
            Backfill flag "ไม่ตัดสต็อค" ในคอร์สทั้งหมด
          </div>
          <div className="text-xs text-[var(--tx-muted)] mt-0.5">
            เพิ่ม field ลง be_courses ทุก doc — default ไม่ติ๊ก (= ตัดสต็อคปกติ). Idempotent — รันซ้ำได้, จะไม่ repeat update doc ที่มี field อยู่แล้ว.
          </div>
        </div>
        <button
          type="button"
          onClick={handleMigrateCoursesSkipStock}
          disabled={migrating}
          data-testid="course-skip-stock-migrate-btn"
          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-700 text-white inline-flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {migrating ? <Loader2 size={14} className="animate-spin" /> : <PackageOpen size={14} />}
          {migrating ? 'กำลังตรวจสอบ + migrate...' : 'Migrate'}
        </button>
      </div>
      {migrationResult && migrationResult.noop && (
        <div className="mt-2 px-3 py-2 rounded-lg bg-emerald-900/20 border border-emerald-700/40 text-emerald-200 text-xs flex items-start gap-2" data-testid="course-skip-stock-noop">
          <CheckCircle2 size={14} className="flex-shrink-0 mt-0.5" />
          <div>ทุกคอร์สมี field ครบแล้ว ({migrationResult.totalCourses} คอร์ส) — ไม่ต้อง migrate</div>
        </div>
      )}
      {migrationResult && migrationResult.cancelled && (
        <div className="mt-2 px-3 py-2 rounded-lg bg-amber-900/20 border border-amber-700/40 text-amber-200 text-xs flex items-start gap-2" data-testid="course-skip-stock-cancelled">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <div>ยกเลิก — ไม่ได้ commit migration</div>
        </div>
      )}
      {migrationResult && migrationResult.updatedCount != null && (
        <div className="mt-2 px-3 py-2 rounded-lg bg-emerald-900/20 border border-emerald-700/40 text-emerald-200 text-xs flex items-start gap-2" data-testid="course-skip-stock-success">
          <CheckCircle2 size={14} className="flex-shrink-0 mt-0.5" />
          <div>
            <div>Migrate สำเร็จ — update <b>{migrationResult.updatedCount}</b> / {migrationResult.totalCourses} คอร์ส</div>
            <div className="text-[10px] text-[var(--tx-muted)] mt-0.5">audit: {migrationResult.auditId}</div>
          </div>
        </div>
      )}
      {migrationResult && migrationResult.error && (
        <div className="mt-2 px-3 py-2 rounded-lg bg-red-900/20 border border-red-700/40 text-red-300 text-xs flex items-start gap-2" data-testid="course-skip-stock-error">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <div>เกิดข้อผิดพลาด: {migrationResult.error}</div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {m9Card}
      {skipStockCard}
      <MarketingTabShell
        icon={ShieldCheck}
        title="สิทธิ์การใช้งาน"
        totalCount={items.length}
        filteredCount={filtered.length}
        createLabel="เพิ่มกลุ่มสิทธิ์"
        onCreate={handleCreate}
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="ค้นหาชื่อ / คำอธิบาย"
        extraFilters={extraFilters}
        error={error}
        loading={loading}
        emptyText='ยังไม่มีกลุ่มสิทธิ์ — กด "เพิ่มกลุ่มสิทธิ์" เพื่อเริ่มต้น'
        notFoundText="ไม่พบกลุ่มสิทธิ์ที่ตรงกับตัวกรอง"
        clinicSettings={clinicSettings}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3" data-testid="permission-groups-grid">
          {filtered.map(p => {
            const id = p.permissionGroupId || p.id;
            const statusCfg = STATUS_BADGE[p.status || 'ใช้งาน'] || STATUS_BADGE['ใช้งาน'];
            const busy = deleting === id;
            const granted = countPermissions(p.permissions);
            const total = ALL_PERMISSION_KEYS.length;
            const pct = total > 0 ? Math.round((granted / total) * 100) : 0;
            const bucketCls = granted === total ? 'text-red-300'
                            : granted >= total * 0.75 ? 'text-amber-300'
                            : granted >= total * 0.25 ? 'text-sky-300'
                            : 'text-[var(--tx-muted)]';

            return (
              <div key={id} data-testid={`permission-card-${id}`}
                className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--bd)] hover:border-[var(--accent)] transition-all">
                <div className="flex items-start gap-3 mb-2">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] flex items-center justify-center">
                    <ShieldCheck size={16} className="text-[var(--tx-muted)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-[var(--tx-heading)] truncate">{p.name || '(ไม่มีชื่อ)'}</h3>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-bold uppercase tracking-wider ${statusCfg.cls}`}>{p.status || 'ใช้งาน'}</span>
                    </div>
                  </div>
                </div>

                <div className="text-xs mb-2">
                  <div className={`font-bold ${bucketCls}`}>
                    {granted} / {total} สิทธิ์ <span className="opacity-70">({pct}%)</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-[var(--bg-hover)] mt-1 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-sky-500 to-amber-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {p.description && (
                  <p className="text-[11px] text-[var(--tx-muted)] line-clamp-2 mb-2">{p.description}</p>
                )}

                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--bd)]">
                  <button onClick={() => handleEdit(p)} disabled={busy}
                    className="flex-1 px-3 py-1.5 rounded text-xs font-bold flex items-center justify-center gap-1 bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] hover:border-sky-700/40 hover:text-sky-400 transition-all disabled:opacity-50">
                    <Edit2 size={12} /> แก้ไข
                  </button>
                  <button onClick={() => handleDelete(p)} disabled={busy || !canDelete}
                    aria-label={`ลบกลุ่มสิทธิ์ ${p.name || ''}`}
                    title={!canDelete ? 'ไม่มีสิทธิ์ลบกลุ่มสิทธิ์' : undefined}
                    className="px-3 py-1.5 rounded text-xs font-bold flex items-center justify-center gap-1 bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] hover:border-red-700/40 hover:text-red-400 transition-all disabled:opacity-50">
                    {busy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </MarketingTabShell>

      {formOpen && (
        <PermissionGroupFormModal
          permissionGroup={editing}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          onSaved={handleSaved}
          clinicSettings={clinicSettings}
        />
      )}
    </>
  );
}
