import React, { useState, useEffect } from 'react';
import {
  emptyRecallCaseForm,
  normalizeRecallCase,
  validateRecallCase,
  findRecallCaseByName,
} from '../../../lib/recallCaseValidation.js';

/**
 * Phase 29.22 (2026-05-14) — Add/Edit modal for be_recall_cases.
 *
 * @param {object} props
 * @param {{id?,caseName,defaultDays,isHidden}|null} props.initial — null = add mode
 * @param {Array} props.existingCases — for dedup check
 * @param {(payload)=>Promise<void>} props.onSave — fires payload normalized
 * @param {()=>void} props.onClose
 */
export function RecallCaseFormModal({ initial, existingCases = [], onSave, onClose }) {
  const isEdit = !!initial?.id;
  const [form, setForm] = useState(() =>
    initial ? { ...emptyRecallCaseForm(), ...initial } : emptyRecallCaseForm()
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function onEsc(e) {
      if (e.key === 'Escape' && !busy) onClose?.();
    }
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [busy, onClose]);

  function set(patch) {
    setForm((f) => ({ ...f, ...patch }));
    setError('');
  }

  async function handleSave() {
    const validationErr = validateRecallCase(form);
    if (validationErr) {
      setError(validationErr);
      return;
    }
    const dup = findRecallCaseByName(existingCases, form.caseName);
    if (dup && (!isEdit || dup.caseId !== initial?.id)) {
      setError(`ชื่อเคสซ้ำ — มีอยู่แล้ว: "${dup.caseName}"`);
      return;
    }
    const normalized = normalizeRecallCase(form);
    const payload = isEdit ? { id: initial.id, ...normalized } : normalized;
    setBusy(true);
    try {
      await onSave(payload);
      onClose?.();
    } catch (e) {
      setError(e?.message || 'บันทึกไม่สำเร็จ');
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={() => !busy && onClose?.()}
    >
      <div
        className="w-[460px] max-w-[92vw] rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)] p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-medium text-[var(--tx-heading)]">
          {isEdit ? 'แก้ไขเคส Recall' : 'เพิ่มเคส Recall ใหม่'}
        </h3>

        <label className="block space-y-1">
          <span className="text-xs text-[var(--tx-secondary)]">ชื่อเคส</span>
          <input
            type="text"
            value={form.caseName}
            onChange={(e) => set({ caseName: e.target.value })}
            placeholder="เช่น After PRP 7-day F/U"
            data-field="caseName"
            className="w-full px-2 py-1.5 text-xs rounded border border-[var(--border-card)] bg-[var(--bg-input)] text-[var(--tx-primary)]"
            disabled={busy}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-[var(--tx-secondary)]">ระยะเวลา (วัน)</span>
          <input
            type="number"
            min={1}
            max={365}
            value={form.defaultDays}
            onChange={(e) => set({ defaultDays: e.target.value })}
            data-field="defaultDays"
            className="w-full px-2 py-1.5 text-xs rounded border border-[var(--border-card)] bg-[var(--bg-input)] text-[var(--tx-primary)]"
            disabled={busy}
          />
        </label>

        {error && (
          <div className="text-xs text-rose-400" role="alert">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => onClose?.()}
            className="px-3 py-1.5 text-xs rounded border border-[var(--border-card)] text-[var(--tx-secondary)] hover:bg-[var(--bg-hover)]"
            disabled={busy}
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-3 py-1.5 text-xs rounded bg-rose-500 text-white hover:bg-rose-600 disabled:opacity-50"
            disabled={busy}
            data-testid="recall-case-modal-save"
          >
            {busy ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  );
}
