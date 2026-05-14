import React, { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { RecallSlotCard } from './RecallSlotCard.jsx';
import {
  validateRecallCreate,
  normalizeRecallSlot,
} from '../../../lib/recallValidation.js';
import {
  createRecall,
  createRecallPair,
} from '../../../lib/scopedDataLayer.js';
import { thaiTodayISO } from '../../../utils.js';

/**
 * Phase 29 (2026-05-14) — Create Recall modal with 2-slot design.
 *
 * Each slot toggles independently; ≥1 must be enabled. Save dispatches:
 *   - createRecall (single, when only 1 slot enabled)
 *   - createRecallPair (atomic batch, when both enabled — cross-stamps
 *     pairedRecallId on both)
 *
 * Auto-suggest: parent passes `masterDataSuggestions` keyed by slotType
 * with `{days, reason, sourceLabel}`. Modal pre-fills the slot's date +
 * reason on mount when present.
 *
 * Inline-learn: when admin sets values for a slot that had no master
 * suggestion, the slot's `saveToMaster` checkbox surfaces. Parent's
 * `onSaveToMaster` callback is invoked after recall creation (parent
 * decides where to write — be_products or be_courses).
 *
 * Anti-flicker discipline (spec §5.6):
 *   - Optimistic close on save success (parent's listener updates list)
 *   - Validation banner inline, no modal-level state churn
 *
 * @param {object} props
 * @param {object} props.customer { id, displayName, phone, lineUserId, hn }
 * @param {object} [props.treatmentContext] { treatmentId, date, summary }
 * @param {object} [props.sourceContext] { productId, productName, courseId, courseName }
 * @param {object} [props.masterDataSuggestions]
 *   { aftercare: {days, reason, sourceLabel}, revisit: {days, reason, sourceLabel} }
 *   When set for a slot, pre-fills + shows auto-suggest hint
 * @param {function} props.onClose () => void
 * @param {function} [props.onCreated] (createdIds) => void — fires after successful save
 * @param {function} [props.onSaveToMaster] ({slotType, days, reason}) => Promise<void>
 *   When slot.saveToMaster checked + creation succeeds, invokes for each opt-in slot.
 *   Parent decides target collection (be_products / be_courses).
 */
export function RecallCreateModal({
  customer,
  treatmentContext = null,
  sourceContext = null,
  masterDataSuggestions = {},
  onClose,
  onCreated,
  onSaveToMaster,
}) {
  const todayISO = thaiTodayISO();

  // Initialize each slot — auto-suggest pre-fill when master data exists.
  const initSlot = useCallback((slotType) => {
    const suggestion = masterDataSuggestions?.[slotType];
    if (suggestion?.days != null) {
      // Pre-fill: enable + compute date from today + reason from master
      const daysMs = todayISO ? new Date(`${todayISO}T12:00:00Z`).getTime() : Date.now();
      const futureMs = daysMs + suggestion.days * 86400000;
      const fd = new Date(futureMs);
      const y = fd.getUTCFullYear();
      const mo = String(fd.getUTCMonth() + 1).padStart(2, '0');
      const d = String(fd.getUTCDate()).padStart(2, '0');
      return {
        enabled: true,
        recallDate: `${y}-${mo}-${d}`,
        reason: suggestion.reason || '',
        saveToMaster: false,
      };
    }
    // No master data — disabled by default unless launched from treatment
    return {
      enabled: !!treatmentContext && slotType === 'aftercare', // default aftercare-on when from treatment
      recallDate: '',
      reason: '',
      saveToMaster: false,
    };
  }, [masterDataSuggestions, todayISO, treatmentContext]);

  const [slot1, setSlot1] = useState(() => initSlot('aftercare'));
  const [slot2, setSlot2] = useState(() => initSlot('revisit'));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Re-initialize when master data arrives async (parent loads after open)
  useEffect(() => {
    if (masterDataSuggestions?.aftercare && !slot1.recallDate) {
      setSlot1(initSlot('aftercare'));
    }
    if (masterDataSuggestions?.revisit && !slot2.recallDate) {
      setSlot2(initSlot('revisit'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterDataSuggestions]);

  // ESC closes modal
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Enabled-slot count for live footer summary
  const enabledCount = (slot1.enabled ? 1 : 0) + (slot2.enabled ? 1 : 0);

  const validationResult = validateRecallCreate({
    customerId: customer?.id,
    slot1: normalizeRecallSlot(slot1),
    slot2: normalizeRecallSlot(slot2),
  });
  const validationErrors = validationResult.errors;
  const canSave = validationResult.ok && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setError('');
    setSaving(true);
    try {
      const baseCustomerFields = {
        customerId: customer.id,
        customerName: customer.displayName || customer.name || '',
        customerPhone: customer.phone || '',
        customerLineUserId: customer.lineUserId || null,
        customerHN: customer.hn || customer.HN || null,
      };
      const baseSourceFields = {
        sourceTreatmentId: treatmentContext?.treatmentId || null,
        sourceProductId: sourceContext?.productId || null,
        sourceProductName: sourceContext?.productName || null,
        sourceCourseId: sourceContext?.courseId || null,
        sourceCourseName: sourceContext?.courseName || null,
        source: treatmentContext ? 'from-treatment-row' : 'manual',
      };

      const norm1 = normalizeRecallSlot(slot1);
      const norm2 = normalizeRecallSlot(slot2);

      let createdIds = [];
      if (slot1.enabled && slot2.enabled) {
        const { id1, id2 } = await createRecallPair({
          ...baseCustomerFields,
          ...baseSourceFields,
          slot1: { recallDate: norm1.recallDate, reason: norm1.reason },
          slot2: { recallDate: norm2.recallDate, reason: norm2.reason },
        });
        createdIds = [id1, id2];
      } else if (slot1.enabled) {
        const { id } = await createRecall({
          ...baseCustomerFields,
          ...baseSourceFields,
          slotType: 'aftercare',
          recallDate: norm1.recallDate,
          reason: norm1.reason,
        });
        createdIds = [id];
      } else if (slot2.enabled) {
        const { id } = await createRecall({
          ...baseCustomerFields,
          ...baseSourceFields,
          slotType: 'revisit',
          recallDate: norm2.recallDate,
          reason: norm2.reason,
        });
        createdIds = [id];
      }

      // Fire inline-learn callbacks (parent decides target collection)
      if (typeof onSaveToMaster === 'function') {
        try {
          if (slot1.enabled && slot1.saveToMaster) {
            await onSaveToMaster({
              slotType: 'aftercare',
              days: computeDaysBetween(todayISO, norm1.recallDate),
              reason: norm1.reason,
            });
          }
          if (slot2.enabled && slot2.saveToMaster) {
            await onSaveToMaster({
              slotType: 'revisit',
              days: computeDaysBetween(todayISO, norm2.recallDate),
              reason: norm2.reason,
            });
          }
        } catch (mEx) {
          // Non-fatal — recalls already created. Log + warn but don't block close.
          console.warn('[RecallCreateModal] inline-learn save failed (continuing):', mEx);
        }
      }

      onCreated?.(createdIds);
      onClose?.();
    } catch (ex) {
      console.error('[RecallCreateModal] save failed:', ex);
      setError(ex?.message || 'บันทึก Recall ไม่สำเร็จ');
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      data-testid="recall-create-modal"
    >
      <div
        className="bg-[var(--bg-card)] border border-[var(--bd)] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-[var(--bg-card)] border-b border-[var(--bd)] px-4 py-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-[var(--tx-primary)]">🔔 ตั้ง Recall ใหม่</h2>
          <button
            type="button"
            onClick={onClose}
            data-testid="recall-create-close"
            className="w-7 h-7 rounded-lg hover:bg-[var(--bg-hover)] flex items-center justify-center text-[var(--tx-muted)]"
            aria-label="ปิด"
          >
            <X size={14} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* Customer header */}
          <div className="p-3 rounded-lg bg-teal-500/[0.06] border border-teal-500/25">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-teal-500/20 flex items-center justify-center text-[11px] font-bold text-teal-300 flex-shrink-0">
                {(customer?.displayName || customer?.name || '?')[0]}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-bold text-[var(--tx-primary)]">{customer?.displayName || customer?.name || '—'}</span>
                  {customer?.id && (
                    <span className="font-mono text-[9px] text-[var(--tx-muted)]">{customer.id}</span>
                  )}
                  {customer?.lineUserId && (
                    <span className="text-[8px] px-1 py-0 bg-green-500/15 text-green-300 border border-green-500/30 rounded font-bold">L</span>
                  )}
                </div>
                {customer?.phone && (
                  <div className="text-[10px] text-[var(--tx-muted)] mt-0.5">📞 {customer.phone}</div>
                )}
                {treatmentContext && (
                  <div className="text-[10px] text-teal-300 mt-0.5">
                    จากการรักษา {treatmentContext.date || ''} · {treatmentContext.summary || ''}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Slot 1 */}
          <RecallSlotCard
            slotType="aftercare"
            value={slot1}
            onChange={(patch) => setSlot1(prev => ({ ...prev, ...patch }))}
            todayISO={todayISO}
            masterDataSuggestion={masterDataSuggestions?.aftercare || null}
          />

          {/* Slot 2 */}
          <RecallSlotCard
            slotType="revisit"
            value={slot2}
            onChange={(patch) => setSlot2(prev => ({ ...prev, ...patch }))}
            todayISO={todayISO}
            masterDataSuggestion={masterDataSuggestions?.revisit || null}
          />

          {/* Validation banner */}
          {validationErrors.includes('at-least-one-slot-required') && (
            <div
              className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300"
              data-testid="recall-create-validation-banner"
            >
              ⚠ กรุณาเปิดอย่างน้อย 1 slot
            </div>
          )}
          {validationErrors.includes('customer-required') && (
            <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-[11px] text-red-300">
              ⚠ ไม่พบลูกค้า
            </div>
          )}

          {error && (
            <div
              className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-[11px] text-red-300"
              data-testid="recall-create-error"
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-[var(--bg-card)] border-t border-[var(--bd)] px-4 py-3 flex items-center justify-between gap-3">
          <div
            className="text-[11px] text-[var(--tx-muted)]"
            data-testid="recall-create-summary"
          >
            📋 จะสร้าง <span className="font-bold text-[var(--tx-primary)]">{enabledCount}</span> recall
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              data-testid="recall-create-cancel"
              className="px-4 py-2 rounded-lg text-xs font-semibold text-[var(--tx-muted)] hover:bg-[var(--bg-hover)]"
              disabled={saving}
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              data-testid="recall-create-save"
              className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'กำลังบันทึก…' : `บันทึก ${enabledCount} Recall`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: days delta between two ISO dates (Bangkok-stable via midday-UTC parse)
// — duplicated here intentionally to avoid an extra import; matches the
// recallResolvers internal convention.
// ─────────────────────────────────────────────────────────────────────────────
function computeDaysBetween(fromISO, toISO) {
  const parse = (iso) => {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0) : null;
  };
  const a = parse(fromISO);
  const b = parse(toISO);
  if (a === null || b === null) return null;
  return Math.round((b - a) / 86400000);
}

export default RecallCreateModal;
