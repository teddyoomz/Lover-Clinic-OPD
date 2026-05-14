import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { listRecallCases, saveRecallCase, setRecallCaseHidden } from '../../../lib/scopedDataLayer.js';
import { auth } from '../../../firebase.js';
import { RecallCaseFormModal } from './RecallCaseFormModal.jsx';

/**
 * Phase 29.22 (2026-05-14) — sub-pill admin panel for be_recall_cases.
 * CRUD table + add/edit modal + soft-archive toggle + search filter.
 */
export function RecallCasesAdminPanel() {
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
    } catch (e) {
      setError(e?.message || 'อัปเดตไม่สำเร็จ');
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
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[var(--border-card)] text-[var(--tx-secondary)]">
              <th className="text-left py-2">ชื่อเคส</th>
              <th className="text-left py-2 w-24">ระยะเวลา</th>
              <th className="text-left py-2 w-24">สถานะ</th>
              <th className="text-right py-2 w-32">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-b border-[var(--border-card)]/50">
                <td className="py-2 text-[var(--tx-primary)]">{c.caseName}</td>
                <td className="py-2 text-[var(--tx-primary)]">{c.defaultDays} วัน</td>
                <td className="py-2">
                  {c.isHidden ? (
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[10px]">
                      ซ่อน
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px]">
                      ใช้งาน
                    </span>
                  )}
                </td>
                <td className="py-2 text-right space-x-2">
                  <button
                    type="button"
                    onClick={() => setEditing(c)}
                    className="text-[10px] text-sky-400 hover:underline"
                  >
                    แก้
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleHidden(c)}
                    className="text-[10px] text-amber-400 hover:underline"
                  >
                    {c.isHidden ? 'คืน' : 'ซ่อน'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
