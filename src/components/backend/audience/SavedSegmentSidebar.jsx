// ─── SavedSegmentSidebar — Phase 16.1 (2026-04-30) ───────────────────────────
// Left-rail list of saved be_audiences. Click to load; "ใหม่" to reset.
// Real-time list flows from listenToAudiences (mounted in parent).

import { useMemo, useState } from 'react';
import { Plus, Search, FolderOpen } from 'lucide-react';

export default function SavedSegmentSidebar({ audiences, loading, selectedId, onSelect, onNew }) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return audiences || [];
    return (audiences || []).filter((a) =>
      String(a.name || '').toLowerCase().includes(q) ||
      String(a.description || '').toLowerCase().includes(q),
    );
  }, [audiences, search]);

  return (
    <aside
      className="lg:w-64 lg:shrink-0 bg-[var(--bg-card)] border border-[var(--bd)] rounded-lg p-3 flex flex-col gap-2 max-h-[70vh]"
      data-testid="saved-segment-sidebar"
    >
      <div className="flex items-center gap-2 text-xs font-semibold text-[var(--tx-heading)]">
        <FolderOpen className="w-4 h-4" aria-hidden />
        <span>กลุ่มที่บันทึกไว้</span>
        <button
          type="button"
          onClick={onNew}
          className="ml-auto px-1.5 py-0.5 rounded border border-[var(--bd)] hover:border-emerald-500 text-[10px] flex items-center gap-1"
          data-testid="saved-segment-new"
          title="เริ่มกลุ่มใหม่"
        >
          <Plus className="w-3 h-3" aria-hidden />
          ใหม่
        </button>
      </div>

      <div className="relative">
        <Search
          className="w-3.5 h-3.5 text-[var(--tx-secondary)] absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none"
          aria-hidden
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหา"
          className="pl-7 pr-2 py-1 text-xs w-full rounded bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-primary)]"
          data-testid="saved-segment-search"
        />
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col gap-1">
        {loading ? (
          <div className="text-xs text-[var(--tx-secondary)] py-2">กำลังโหลด…</div>
        ) : filtered.length === 0 ? (
          <div className="text-xs text-[var(--tx-secondary)] py-2">
            {(audiences?.length || 0) === 0 ? 'ยังไม่มีกลุ่มที่บันทึก' : 'ไม่พบ'}
          </div>
        ) : (
          filtered.map((a) => {
            const isSel = String(a.id) === String(selectedId);
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => onSelect(a)}
                className={`text-left px-2 py-1.5 rounded text-xs border transition-colors ${
                  isSel
                    ? 'bg-emerald-700/20 border-emerald-600 text-[var(--tx-heading)]'
                    : 'bg-[var(--bg-surface)] border-[var(--bd)] hover:border-emerald-500 text-[var(--tx-primary)]'
                }`}
                data-testid={`saved-segment-item-${a.id}`}
              >
                <div className="font-medium truncate">{a.name || '(ไม่มีชื่อ)'}</div>
                {a.description && (
                  <div className="text-[var(--tx-secondary)] text-[10px] truncate mt-0.5">
                    {a.description}
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
