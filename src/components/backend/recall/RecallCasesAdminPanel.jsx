import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { listRecallCases, saveRecallCase, setRecallCaseHidden, deleteRecallCase } from '../../../lib/scopedDataLayer.js';
import { auth } from '../../../firebase.js';
import { RecallCaseFormModal } from './RecallCaseFormModal.jsx';

/**
 * Phase 29.22 (2026-05-14) — sub-pill admin panel for be_recall_cases.
 * CRUD table + add/edit modal + soft-archive toggle + search filter.
 *
 * Rule Q L1 RB5 fix: after any mutation (save / hide / unhide), invokes
 * `onCasesChanged?.()` so the parent's useRecallCases hook (used by the
 * typeahead) can re-fetch. Without this callback, the typeahead in
 * RecallCreateModal would show stale data (incl. just-hidden cases) until
 * full page reload.
 *
 * @param {object} props
 * @param {() => void} [props.onCasesChanged] — invoked after save / hide / unhide
 */
export function RecallCasesAdminPanel({ onCasesChanged }) {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showHidden, setShowHidden] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // editing semantics: null = closed, undefined = add mode, object = edit mode
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listRecallCases({ includeHidden: true });
      setCases(data);
    } catch (e) {
      setError(e?.message || 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const filtered = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    return cases.filter((c) => {
      if (!showHidden && c.isHidden) return false;
      if (!needle) return true;
      return typeof c.caseName === 'string' && c.caseName.toLowerCase().includes(needle);
    });
  }, [cases, showHidden, searchQuery]);

  function getUid() {
    return auth?.currentUser?.uid || '';
  }

  async function handleSave(payload) {
    await saveRecallCase(payload, { uid: getUid() });
    await reload();
    // Rule Q L1 RB5 — notify parent so typeahead source re-fetches.
    onCasesChanged?.();
  }

  async function handleToggleHidden(c) {
    const next = !c.isHidden;
    const msg = next
      ? `ซ่อนเคส "${c.caseName}" จาก dropdown?\n(ข้อมูลยังอยู่; สามารถคืนได้)`
      : `คืนเคส "${c.caseName}" กลับมาแสดง?`;
    if (!window.confirm(msg)) return;
    try {
      await setRecallCaseHidden(c.id, next, { uid: getUid() });
      await reload();
      // Rule Q L1 RB5 — notify parent so typeahead source re-fetches.
      onCasesChanged?.();
    } catch (e) {
      setError(e?.message || 'อัปเดตไม่สำเร็จ');
    }
  }

  async function handleDelete(c) {
    const msg = `ลบเคส "${c.caseName}" ถาวร?\n(Recall ที่ใช้ค่าเดิมไม่ได้รับผลกระทบ; เก็บ snapshot ของชื่อไว้แล้ว)`;
    if (!window.confirm(msg)) return;
    try {
      await deleteRecallCase(c.id, { uid: getUid() });
      await reload();
      onCasesChanged?.();
    } catch (e) {
      setError(e?.message || 'ลบไม่สำเร็จ');
    }
  }

  return (
    <div className="space-y-3" data-testid="recall-cases-admin-panel">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-[var(--tx-heading)]">🗂 จัดการเคส Recall</h3>
        <button
          type="button"
          onClick={() => setEditing(undefined)}
          className="px-3 py-1.5 text-xs rounded bg-rose-500 text-white hover:bg-rose-600"
        >
          + เพิ่มเคส
        </button>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="ค้นหาเคส..."
          className="flex-1 px-2 py-1.5 text-xs rounded border border-[var(--border-card)] bg-[var(--bg-input)] text-[var(--tx-primary)]"
        />
        <label className="flex items-center gap-1.5 text-xs text-[var(--tx-secondary)] cursor-pointer">
          <input
            type="checkbox"
            checked={showHidden}
            onChange={(e) => setShowHidden(e.target.checked)}
            className="accent-rose-500"
          />
          แสดงที่ซ่อน
        </label>
      </div>

      {error && (
        <div className="text-xs text-rose-400" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-xs text-[var(--tx-secondary)]">กำลังโหลด...</div>
      ) : filtered.length === 0 ? (
        <div className="text-xs text-[var(--tx-secondary)] text-center py-6">
          ไม่พบเคส — คลิก "+ เพิ่มเคส" เพื่อเริ่ม
        </div>
      ) : (
        // Phase 29.22 round-2 polish — card-shape rows instead of bare table-rows.
        // Same pattern as RecallList: clear visual separation per row, works in
        // both dark + light themes via --bg-card + --bd-strong + shadow-sm.
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-[1fr_96px_96px_140px] gap-2 px-4 py-2 text-[10px] uppercase tracking-wider font-bold text-[var(--tx-muted)] border-b border-[var(--bd-strong)]">
            <div>ชื่อเคส</div>
            <div>ระยะเวลา</div>
            <div>สถานะ</div>
            <div className="text-right">Actions</div>
          </div>
          {filtered.map((c) => (
            <div
              key={c.id}
              className="grid grid-cols-[1fr_96px_96px_140px] gap-2 px-4 py-3 rounded-lg border border-[var(--bd-strong)] bg-[var(--bg-input)] shadow-md hover:shadow-lg hover:border-rose-500/50 transition-all items-center"
            >
              <div className="text-xs text-[var(--tx-primary)] font-medium truncate">{c.caseName}</div>
              <div className="text-xs text-[var(--tx-primary)]">{c.defaultDays} วัน</div>
              <div>
                {c.isHidden ? (
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 dark:text-amber-400 border border-amber-500/40 text-[10px] font-bold">
                    ซ่อน
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 text-[10px] font-bold">
                    ใช้งาน
                  </span>
                )}
              </div>
              <div className="text-right space-x-2">
                <button
                  type="button"
                  onClick={() => setEditing(c)}
                  className="text-[11px] font-medium text-sky-500 hover:text-sky-600 dark:text-sky-400 dark:hover:text-sky-300 hover:underline"
                >
                  แก้
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleHidden(c)}
                  className="text-[11px] font-medium text-amber-500 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300 hover:underline"
                >
                  {c.isHidden ? 'คืน' : 'ซ่อน'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(c)}
                  className="text-[11px] font-medium text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300 hover:underline"
                  data-testid={`recall-case-delete-${c.id}`}
                >
                  ลบ
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing !== null && (
        <RecallCaseFormModal
          initial={editing === undefined ? null : editing}
          existingCases={cases}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
