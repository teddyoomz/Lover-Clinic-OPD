import React, { useState, useEffect } from 'react';
import { X, Check, Clock, MessageSquare, PhoneOff } from 'lucide-react';
import { recordRecallOutcome } from '../../../lib/scopedDataLayer.js';

/**
 * Phase 29 (2026-05-14) — Record-outcome modal.
 * Per spec §4.5 + §5.5 state machine + §5.7 auto-snooze.
 *
 * 4 outcome cards (single-select, required):
 *   ✓ will-come (จะมาตามนัด) — emerald → status=done
 *   ⏰ reschedule (ขอเลื่อน) — amber → status=done + onAfterSave(snooze)
 *   💭 not-interested (ไม่สนใจ / ไม่ต้องการ) — indigo → status=done
 *   📵 no-answer (ติดต่อไม่ได้) — red → status=no-answer + auto-snooze 3d + count++
 *
 * Auto-snooze hint appears when no-answer selected.
 * Optional textarea for outcomeNote.
 *
 * @param {object} props
 * @param {object} props.recall full recall doc (we read id + noAnswerCount + customerName)
 * @param {function} props.onClose () => void
 * @param {function} [props.onSaved] (outcome) => void — fires after save success
 * @param {function} [props.onReschedule] (recallId) => void — called when outcome=reschedule
 */

const OUTCOMES = [
  {
    id: 'will-come',
    label: 'จะมาตามนัด',
    icon: Check,
    emoji: '✓',
    color: 'emerald',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/40',
    selectedBg: 'bg-emerald-500/20',
    selectedBorder: 'border-emerald-500',
    text: 'text-emerald-300',
  },
  {
    id: 'reschedule',
    label: 'ขอเลื่อน',
    icon: Clock,
    emoji: '⏰',
    color: 'amber',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/40',
    selectedBg: 'bg-amber-500/20',
    selectedBorder: 'border-amber-500',
    text: 'text-amber-300',
  },
  {
    id: 'not-interested',
    label: 'ไม่สนใจ / ไม่ต้องการ',
    icon: MessageSquare,
    emoji: '💭',
    color: 'indigo',
    bg: 'bg-indigo-500/10',
    border: 'border-indigo-500/40',
    selectedBg: 'bg-indigo-500/20',
    selectedBorder: 'border-indigo-500',
    text: 'text-indigo-300',
  },
  {
    id: 'no-answer',
    label: 'ติดต่อไม่ได้',
    icon: PhoneOff,
    emoji: '📵',
    color: 'red',
    bg: 'bg-red-500/10',
    border: 'border-red-500/40',
    selectedBg: 'bg-red-500/20',
    selectedBorder: 'border-red-500',
    text: 'text-red-300',
  },
];

export function RecallOutcomeModal({ recall, onClose, onSaved, onReschedule }) {
  const [outcome, setOutcome] = useState(null);
  const [outcomeNote, setOutcomeNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // ESC closes
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSave = async () => {
    if (!outcome || !recall?.id || saving) return;
    setError('');
    setSaving(true);
    try {
      await recordRecallOutcome(recall.id, {
        outcome,
        outcomeNote,
        currentNoAnswerCount: recall.noAnswerCount || 0,
      });
      onSaved?.(outcome);
      if (outcome === 'reschedule' && typeof onReschedule === 'function') {
        // Parent decides whether to show snooze picker on top of close
        onReschedule(recall.id);
      }
      onClose?.();
    } catch (ex) {
      console.error('[RecallOutcomeModal] save failed:', ex);
      setError(ex?.message || 'บันทึกผลไม่สำเร็จ');
      setSaving(false);
    }
  };

  const willEscalate = outcome === 'no-answer' && (recall?.noAnswerCount || 0) + 1 >= 3;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      data-testid="recall-outcome-modal"
    >
      <div
        className="bg-[var(--bg-card)] border border-[var(--bd)] rounded-2xl shadow-2xl w-full max-w-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-[var(--bd)] px-4 py-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-[var(--tx-primary)]">
            📞 บันทึกผลการ Recall · {recall?.customerName || '—'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            data-testid="recall-outcome-close"
            className="w-7 h-7 rounded-lg hover:bg-[var(--bg-hover)] flex items-center justify-center text-[var(--tx-muted)]"
            aria-label="ปิด"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          <p className="text-[11px] font-bold text-[var(--tx-muted)] uppercase tracking-wider">
            ผลการติดต่อ <span className="text-red-300">*</span>
          </p>
          <div className="grid grid-cols-2 gap-2" data-testid="recall-outcome-cards">
            {OUTCOMES.map(opt => {
              const Icon = opt.icon;
              const selected = outcome === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setOutcome(opt.id)}
                  data-testid={`recall-outcome-card-${opt.id}`}
                  data-selected={selected ? 'true' : 'false'}
                  className={`text-left p-3 rounded-lg border transition-all ${
                    selected
                      ? `${opt.selectedBg} ${opt.selectedBorder} border-2`
                      : `${opt.bg} ${opt.border} hover:${opt.selectedBg}`
                  }`}
                >
                  <div className={`flex items-center gap-2 ${opt.text} font-bold text-xs`}>
                    <Icon size={14} />
                    <span>{opt.emoji}</span>
                    <span>{opt.label}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Auto-snooze hint (only for no-answer) */}
          {outcome === 'no-answer' && (
            <div
              data-testid="recall-outcome-auto-snooze-hint"
              className="px-3 py-2 rounded-lg bg-indigo-500/[0.06] border border-indigo-500/25 border-dashed text-[10px] text-indigo-300"
            >
              📵 ระบบจะ auto-snooze 3 วัน — ครั้งที่ 3 จะ flag ให้ admin จัดการ manual
              {willEscalate && (
                <div className="mt-1 font-bold text-red-300" data-testid="recall-outcome-escalate-warning">
                  ⚠ ครั้งที่ {((recall?.noAnswerCount || 0) + 1)} — จะ flag requiresManualReview
                </div>
              )}
            </div>
          )}

          {/* Note textarea */}
          <div data-field="outcomeNote">
            <label className="block text-[11px] font-bold text-[var(--tx-muted)] mb-1 uppercase">
              รายละเอียด / หมายเหตุ
            </label>
            <textarea
              rows={3}
              value={outcomeNote}
              onChange={(e) => setOutcomeNote(e.target.value)}
              maxLength={1000}
              placeholder="(เลือกได้ — เช่น ลูกค้าบอกจะมาวันที่... / ขอเลื่อนเป็น...)"
              data-testid="recall-outcome-note"
              className="w-full px-3 py-2 rounded-lg text-xs bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)] resize-none"
            />
          </div>

          {error && (
            <div
              className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-[11px] text-red-300"
              data-testid="recall-outcome-error"
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--bd)] px-4 py-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            data-testid="recall-outcome-cancel"
            className="px-4 py-2 rounded-lg text-xs font-semibold text-[var(--tx-muted)] hover:bg-[var(--bg-hover)]"
            disabled={saving}
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!outcome || saving}
            data-testid="recall-outcome-save"
            className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'กำลังบันทึก…' : 'บันทึกผล'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default RecallOutcomeModal;
