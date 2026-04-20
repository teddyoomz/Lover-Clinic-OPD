// ─── Permission Groups Tab — Phase 11.7 Master Data Suite ──────────────────
// Lists `be_permission_groups`. Card shows role name + granted-permission
// count (e.g. "42 / 130 สิทธิ์"). 9th reuse of MarketingTabShell.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Edit2, Trash2, ShieldCheck, Loader2 } from 'lucide-react';
import { listPermissionGroups, deletePermissionGroup } from '../../lib/backendClient.js';
import PermissionGroupFormModal from './PermissionGroupFormModal.jsx';
import MarketingTabShell from './MarketingTabShell.jsx';
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

  const extraFilters = (
    <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
      className="px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]">
      <option value="">สถานะทั้งหมด</option>
      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
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
                  <button onClick={() => handleDelete(p)} disabled={busy}
                    aria-label={`ลบกลุ่มสิทธิ์ ${p.name || ''}`}
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
