// ─── Permission Groups Tab — Phase 11.7 Master Data Suite ──────────────────
// Lists `be_permission_groups`. Card shows role name + granted-permission
// count (e.g. "42 / 130 สิทธิ์"). 9th reuse of MarketingTabShell.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Edit2, Trash2, ShieldCheck, Loader2, KeyRound, Shield } from 'lucide-react';
import { listPermissionGroups, deletePermissionGroup, listStaff } from '../../lib/backendClient.js';
import { setUserPermission, bootstrapSelfAsAdmin } from '../../lib/adminUsersClient.js';
import { auth } from '../../firebase.js';
import PermissionGroupFormModal from './PermissionGroupFormModal.jsx';
import MarketingTabShell from './MarketingTabShell.jsx';
import { useHasPermission } from '../../hooks/useTabAccess.js';
import {
  STATUS_OPTIONS,
  ALL_PERMISSION_KEYS,
  countPermissions,
} from '../../lib/permissionGroupValidation.js';

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

  // ─── Phase 13.5.4 — Hard-Gate Migration Button ───────────────────────────
  // Loops every be_staff doc, calls /api/admin/users setPermission for each
  // user with a firebaseUid, sets isClinicStaff + permissionGroupId custom
  // claims. One-time backfill before Deploy 2 of Phase 13.5.4 (claim-only
  // firestore.rules check).
  //
  // Idempotent: re-running just re-asserts the same claims.
  // Skipped: be_staff entries with no firebaseUid (Firestore-only records).
  // Self-protection: setPermission endpoint blocks "clear own claim" — but
  // SET is fine for everyone including the caller.
  const [migrating, setMigrating] = useState(false);
  const [migrateResult, setMigrateResult] = useState(null);
  const handleMigrateAllToClaims = async () => {
    if (!window.confirm(
      'Sync ทุก staff → Firebase custom claims?\n\n' +
      'ขั้นตอน Deploy 1 ของ Phase 13.5.4 hard-gate.\n' +
      'จะ loop be_staff ทั้งหมด + setCustomUserClaims ตาม permissionGroupId\n' +
      'ของแต่ละคน. + Auto-bootstrap ตัวคุณเอง (admin login) ด้วย gp-owner\n' +
      'ถ้ายังไม่มี be_staff record. Idempotent — รันซ้ำได้ปลอดภัย.'
    )) return;

    setMigrating(true);
    setMigrateResult(null);
    setError('');
    const result = { total: 0, synced: 0, skipped: 0, failed: 0, errors: [], adminBootstrap: null };
    try {
      const allStaff = await listStaff();
      result.total = allStaff.length;

      // ─── ADMIN BOOTSTRAP (V25 — 2026-04-26) ───────────────────────────
      // Sync the CURRENT logged-in user's claims FIRST. If their auth.uid
      // is in any be_staff doc, the loop below handles them. If NOT
      // (bootstrap admin with no be_staff record), self-sync as gp-owner
      // here so they don't lock themselves out after Deploy 2.
      // Lockout would happen if Deploy 2 ships claim-only rules and
      // current admin has no isClinicStaff claim. This guard prevents it.
      const myUid = auth?.currentUser?.uid || '';
      const myEmail = auth?.currentUser?.email || '';
      let foundInBeStaff = false;
      if (myUid) {
        for (const s of allStaff) {
          if ((s.firebaseUid || '') === myUid) { foundInBeStaff = true; break; }
        }
        if (!foundInBeStaff) {
          // Self-sync as gp-owner (bootstrap admin assumption — they can
          // re-assign themselves to a different group later via PermissionGroupsTab)
          try {
            await setUserPermission({ uid: myUid, permissionGroupId: 'gp-owner' });
            result.synced += 1;
            result.adminBootstrap = { uid: myUid, email: myEmail, group: 'gp-owner' };
          } catch (err) {
            result.failed += 1;
            result.errors.push(`(admin self-bootstrap ${myEmail || myUid}): ${err?.message || 'unknown'}`);
          }
        }
      }

      for (const s of allStaff) {
        const uid = s.firebaseUid || '';
        if (!uid) { result.skipped += 1; continue; }
        const groupId = s.permissionGroupId || '';
        try {
          await setUserPermission({ uid, permissionGroupId: groupId });
          result.synced += 1;
        } catch (err) {
          result.failed += 1;
          result.errors.push(`${s.firstname || s.id || uid}: ${err?.message || 'unknown'}`);
        }
      }
      setMigrateResult(result);
    } catch (e) {
      setError(`Migration error: ${e?.message || 'unknown'}`);
    } finally {
      setMigrating(false);
    }
  };

  // ─── Genesis admin bootstrap (V25-bis) ───────────────────────────────
  // If migration button hits 403 "admin privilege required", caller has no
  // admin: true claim AND isn't in FIREBASE_ADMIN_BOOTSTRAP_UIDS env. The
  // bootstrap button calls /api/admin/bootstrap-self which has its own
  // chicken-and-egg-breaking guards (genesis-only, @loverclinic email).
  // After success, force token refresh so the new claim takes effect.
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapResult, setBootstrapResult] = useState(null);
  const handleBootstrapSelf = async () => {
    if (!window.confirm(
      'Bootstrap ตัวคุณเป็น admin (genesis grant)?\n\n' +
      'ใช้ตอนเดียว — กรณี Vercel env ไม่มี FIREBASE_ADMIN_BOOTSTRAP_UIDS\n' +
      'และยังไม่มี admin คนไหนมี custom claim. หลัง bootstrap แล้ว token\n' +
      'จะ refresh อัตโนมัติ + คุณจะเป็น admin ใน custom claim.'
    )) return;

    setBootstrapping(true);
    setBootstrapResult(null);
    setError('');
    try {
      const data = await bootstrapSelfAsAdmin();
      // Force ID token refresh so the new claim is picked up immediately
      try {
        await auth.currentUser?.getIdToken(true);
      } catch { /* non-fatal */ }
      setBootstrapResult({ ok: true, ...data });
    } catch (e) {
      setBootstrapResult({
        ok: false,
        status: e?.status || 0,
        error: e?.message || 'Unknown error',
        existingAdmin: e?.payload?.existingAdmin || null,
      });
    } finally {
      setBootstrapping(false);
    }
  };

  const extraFilters = (
    <div className="flex items-center gap-2">
      <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
        className="px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]">
        <option value="">สถานะทั้งหมด</option>
        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <button
        type="button"
        data-testid="permission-bootstrap-self-button"
        onClick={handleBootstrapSelf}
        disabled={bootstrapping || !canDelete}
        title={!canDelete ? 'ต้องมีสิทธิ์ permission_group_management' : 'Genesis-only admin grant — ใช้เมื่อ migration button คืน 403 admin error'}
        className="px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5 bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] hover:border-violet-700/40 hover:text-violet-300 transition-all disabled:opacity-50">
        {bootstrapping ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
        Bootstrap ตัวเองเป็น admin
      </button>
      <button
        type="button"
        data-testid="permission-claims-migrate-button"
        onClick={handleMigrateAllToClaims}
        disabled={migrating || !canDelete}
        title={!canDelete ? 'ต้องมีสิทธิ์ permission_group_management' : 'Sync ทุก staff → custom claims (Phase 13.5.4)'}
        className="px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5 bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] hover:border-amber-700/40 hover:text-amber-300 transition-all disabled:opacity-50">
        {migrating ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
        Sync ทุก staff → Claims
      </button>
    </div>
  );

  return (
    <>
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

      {bootstrapResult && (
        <div data-testid="permission-bootstrap-result"
          className="mt-4 p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--bd)] text-sm">
          <div className="font-bold text-[var(--tx-heading)] mb-1">ผล Bootstrap admin (genesis grant)</div>
          {bootstrapResult.ok ? (
            <div className="text-emerald-400">
              ✓ {bootstrapResult.alreadyAdmin
                ? `${bootstrapResult.email || bootstrapResult.uid} เป็น admin อยู่แล้ว — ตั้ง isClinicStaff claim ครบแล้ว`
                : `Genesis admin granted: ${bootstrapResult.email || bootstrapResult.uid}. Token refreshed อัตโนมัติ.`}
              <div className="text-[11px] text-[var(--tx-muted)] mt-1">
                ลองกดปุ่ม "Sync ทุก staff → Claims" ใหม่ครับ — ควรจะ synced=1 (ตัวคุณ) + skipped=20 + failed=0
              </div>
            </div>
          ) : (
            <div className="text-red-400">
              ✗ ล้มเหลว ({bootstrapResult.status}): {bootstrapResult.error}
              {bootstrapResult.existingAdmin && (
                <div className="text-[11px] text-amber-300 mt-1">
                  มี admin อยู่แล้ว: {bootstrapResult.existingAdmin.email || bootstrapResult.existingAdmin.uid}
                  — ขอ admin คนนั้น grant สิทธิ์ผ่าน /api/admin/users grantAdmin แทน
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {migrateResult && (
        <div data-testid="permission-claims-migrate-result"
          className="mt-4 p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--bd)] text-sm">
          <div className="font-bold text-[var(--tx-heading)] mb-1">ผลการ Sync Custom Claims</div>
          <div className="text-[var(--tx-muted)]">
            ทั้งหมด <span className="text-[var(--tx-primary)] font-bold">{migrateResult.total}</span> /
            สำเร็จ <span className="text-emerald-400 font-bold">{migrateResult.synced}</span> /
            ข้าม (ไม่มี firebaseUid) <span className="text-neutral-400 font-bold">{migrateResult.skipped}</span> /
            ล้มเหลว <span className="text-red-400 font-bold">{migrateResult.failed}</span>
          </div>
          {migrateResult.adminBootstrap && (
            <div className="mt-2 text-[11px] text-amber-300">
              ⚙ Admin self-bootstrap: <span className="font-mono">{migrateResult.adminBootstrap.email || migrateResult.adminBootstrap.uid}</span> → gp-owner (Phase 13.5.4 lockout-prevention)
            </div>
          )}
          {migrateResult.errors.length > 0 && (
            <ul className="mt-2 text-[11px] text-red-400 list-disc list-inside max-h-32 overflow-y-auto">
              {migrateResult.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
          {migrateResult.failed === 0 && migrateResult.synced > 0 && (
            <div className="mt-2 text-[11px] text-emerald-400">
              ✓ พร้อม Deploy 2 — รัน firestore.rules deploy เพื่อเปลี่ยนเป็น claim-only check
            </div>
          )}
        </div>
      )}

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
