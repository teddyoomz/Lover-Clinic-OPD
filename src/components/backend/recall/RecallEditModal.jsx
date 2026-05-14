import React, { useState, useEffect, useCallback } from 'react';
import { X, Save } from 'lucide-react';
import DateField from '../../DateField.jsx';
import { RecallCaseSelectField } from './RecallCaseSelectField.jsx';
import { updateRecall } from '../../../lib/scopedDataLayer.js';

/**
 * Phase 29.23 (2026-05-14) — Edit Recall modal (lightweight, single-recall).
 *
 * Per spec §4.1: edit only `recallDate` + `reason` (forensic trail otherwise).
 * Customer + source + audit stamps + status all immutable post-create.
 *
 * Used by RecallTab + RecallFrontendView + CustomerDetailView/RecallCard
 * (3 surfaces share this single component).
 *
 * Anti-flicker discipline (spec §5.6):
 *   - Save → updateRecall → modal closes → parent's onSnapshot updates list
 *   - Stable React keys upstream (RecallList.jsx) preserve DOM nodes; only
 *     edited row's inner text changes.
 *
 * @param {object} props
 * @param {object} props.recall existing recall doc (required)
 * @param {Array<{caseId,caseName,defaultDays}>} [props.recallCases]
 *   Universal cache from useRecallCases. Drives RecallCaseSelectField typeahead.
 * @param {function} props.onClose () => void
 * @param {function} [props.onSaved] (id: string) => void — fires after successful save
 */
export function RecallEditModal({ recall, recallCases = [], onClose, onSaved }) {
  const [recallDate, setRecallDate] = useState(recall?.recallDate || '');
  const [reason, setReason] = useState(recall?.reason || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // ESC closes modal
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const hasDate = !!String(recallDate || '').trim();
  const hasReason = !!String(reason || '').trim();
  const canSave = hasDate && hasReason && !saving;

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    setError('');
    setSaving(true);
    try {
      await updateRecall(recall.id, {
        recallDate: String(recallDate || '').trim(),
        reason: String(reason || '').trim(),
      });
      onSaved?.(recall.id);
      onClose?.();
    } catch (ex) {
      console.error('[RecallEditModal] save failed:', ex);
      setError(ex?.message || 'บันทึกไม่สำเร็จ');
      setSaving(false);
    }
  }, [canSave, recall?.id, recallDate, reason, onClose, onSaved]);

  if (!recall) return null;

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      data-testid="recall-edit-modal"
    >
      <div
        className="bg-[var(--bg-card)] border-2 border-[var(--bd-strong)] rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        data-testid="recall-edit-card"
      >
        {/* Header */}
        <div className="sticky top-0 bg-[var(--bg-card)] border-b border-[var(--bd-strong)] px-4 py-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-[var(--tx-primary)]">✏️ แก้ไข Recall</h2>
          <button
            type="button"
            onClick={onClose}
            data-testid="recall-edit-close"
            className="w-7 h-7 rounded-lg hover:bg-[var(--bg-hover)] flex items-center justify-center text-[var(--tx-muted)]"
            aria-label="ปิด"
          >
            <X size={14} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* Customer header — read-only forensic trail */}
          <div
            className="p-3 rounded-lg bg-teal-500/[0.06] border border-teal-500/25"
            data-testid="recall-edit-customer-header"
          >
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-[var(--tx-primary)]">
                {recall.customerName || '—'}
              </span>
              {recall.customerLineUserId && (
                <span className="text-[8px] px-1 py-0 bg-green-500/15 text-green-300 border border-green-500/30 rounded font-bold">L</span>
              )}
              {recall.customerHN && (
                <span className="font-mono text-[9px] text-[var(--tx-muted)]">HN {recall.customerHN}</span>
              )}
              {recall.customerId && (
                <span className="font-mono text-[9px] text-[var(--tx-muted)]">{recall.customerId}</span>
              )}
            </div>
            {recall.customerPhone && (
              <div className="text-[10px] text-[var(--tx-muted)] mt-0.5">📞 {recall.customerPhone}</div>
            )}
            {(recall.sourceProductName || recall.sourceCourseName) && (
              <div className="text-[10px] text-teal-300 mt-0.5">
                จากบริการ: {recall.sourceProductName || recall.sourceCourseName}
              </div>
            )}
          </div>

          {/* Editable: recallDate */}
          <div data-field="recallDate">
            <label className="block text-[10px] font-bold text-[var(--tx-muted)] mb-1 uppercase">
              วันที่ Recall <span className="text-red-300">*</span>
            </label>
            <DateField
              value={recallDate}
              onChange={setRecallDate}
              locale="be"
              size="sm"
            />
          </div>

          {/* Editable: reason via typeahead */}
          <div data-field="reason">
            <label className="block text-[10px] font-bold text-[var(--tx-muted)] mb-1 uppercase">
              เหตุผล / เคส Recall <span className="text-red-300">*</span>
            </label>
            <RecallCaseSelectField
              value={reason}
              recallCases={recallCases}
              onChange={setReason}
              onPick={({ caseName }) => setReason(caseName || '')}
              placeholder="พิมพ์เพื่อค้น หรือเลือกจาก dropdown"
              data-testid="recall-edit-reason-field"
            />
          </div>

          {/* Validation banners */}
          {!hasDate && (
            <div
              className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300"
              data-testid="recall-edit-validation-date"
            >
              ⚠ กรุณาเลือกวันที่ Recall
            </div>
          )}
          {!hasReason && (
            <div
              className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300"
              data-testid="recall-edit-validation-reason"
            >
              ⚠ กรุณาเลือกเหตุผล
            </div>
          )}

          {error && (
            <div
              className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-[11px] text-red-300"
              data-testid="recall-edit-error"
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-[var(--bg-card)] border-t border-[var(--bd-strong)] px-4 py-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            data-testid="recall-edit-cancel"
            className="px-4 py-2 rounded-lg text-xs font-semibold text-[var(--tx-muted)] hover:bg-[var(--bg-hover)]"
            disabled={saving}
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            data-testid="recall-edit-save"
            className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
          >
            <Save size={12} />
            {saving ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default RecallEditModal;
