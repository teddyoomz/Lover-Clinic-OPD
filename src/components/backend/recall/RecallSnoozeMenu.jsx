import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Clock } from 'lucide-react';
import DateField from '../../DateField.jsx';
import { snoozeRecall } from '../../../lib/scopedDataLayer.js';
import { thaiTodayISO } from '../../../utils.js';

/**
 * Phase 29 (2026-05-14) — Snooze menu (compact date picker).
 * Per spec §5.8.
 *
 * Renders a small modal with quick-pick chips (+1d / +3d / +7d / +14d /
 * +30d) and a DateField for a custom date. Snooze advances the recall's
 * `snoozedUntil` field via `snoozeRecall` backendClient fn.
 *
 * Pre-fills with passed-in `initialDate` so the modal can be reused for
 * the "ขอเลื่อน" outcome flow (parent passes today+N from outcome handler).
 *
 * @param {object} props
 * @param {object} props.recall { id, customerName }
 * @param {string} [props.initialDate] ISO YYYY-MM-DD pre-fill
 * @param {function} props.onClose () => void
 * @param {function} [props.onSnoozed] (untilDate) => void
 */
export function RecallSnoozeMenu({ recall, initialDate, onClose, onSnoozed }) {
  const todayISO = thaiTodayISO();
  const [pickedDate, setPickedDate] = useState(initialDate || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Quick-pick offsets (Bangkok-stable midday-UTC parse)
  const addDays = (base, days) => {
    const m = String(base || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return '';
    const baseMs = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
    const fd = new Date(baseMs + days * 86400000);
    return `${fd.getUTCFullYear()}-${String(fd.getUTCMonth() + 1).padStart(2, '0')}-${String(fd.getUTCDate()).padStart(2, '0')}`;
  };

  const quickPicks = [
    { days: 1, label: '+1 วัน' },
    { days: 3, label: '+3 วัน' },
    { days: 7, label: '+1 สัปดาห์' },
    { days: 14, label: '+2 สัปดาห์' },
    { days: 30, label: '+1 เดือน' },
  ];

  const canSave = !!pickedDate && pickedDate >= todayISO && !saving;

  const handleSave = async () => {
    if (!canSave || !recall?.id) return;
    setError('');
    setSaving(true);
    try {
      await snoozeRecall(recall.id, pickedDate);
      onSnoozed?.(pickedDate);
      onClose?.();
    } catch (ex) {
      console.error('[RecallSnoozeMenu] snooze failed:', ex);
      setError(ex?.message || 'เลื่อน Recall ไม่สำเร็จ');
      setSaving(false);
    }
  };

  // 2026-05-20 (recall modal flicker→freeze) — portal to document.body so the
  // fixed overlay escapes any transformed ancestor (V86 hover-transform on
  // rounded cards in new-menu backend-content). AV98.
  return createPortal(
    // AV78 (EOD8): backdrop click does NOT close — explicit close only (X / Cancel / ESC)
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      data-testid="recall-snooze-menu"
    >
      <div
        className="bg-[var(--bg-card)] border border-[var(--bd)] rounded-2xl shadow-2xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-[var(--bd)] px-4 py-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-[var(--tx-primary)] flex items-center gap-2">
            <Clock size={14} className="text-indigo-300" />
            เลื่อน Recall · {recall?.customerName || '—'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            data-testid="recall-snooze-close"
            className="w-7 h-7 rounded-lg hover:bg-[var(--bg-hover)] flex items-center justify-center text-[var(--tx-muted)]"
            aria-label="ปิด"
          >
            <X size={14} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* 2026-07-04 — show WHY this recall was created while snoozing */}
          {(recall?.reason || '').trim() && (
            <div
              className="px-2.5 py-1.5 rounded-r-md border-l-[3px] border-amber-500 bg-amber-500/10"
              data-testid="recall-reason-strip"
            >
              <span className="text-[11px] text-amber-700 dark:text-amber-300">🏷 นัดเพราะ: </span>
              <span className="text-[12px] font-semibold text-[var(--tx-primary)]">{recall.reason}</span>
            </div>
          )}
          {/* Quick picks */}
          <div>
            <p className="text-[10px] font-bold text-[var(--tx-muted)] uppercase tracking-wider mb-1.5">
              เลื่อนด่วน
            </p>
            <div className="flex flex-wrap gap-1.5" data-testid="recall-snooze-quick-picks">
              {quickPicks.map(p => {
                const date = addDays(todayISO, p.days);
                const isSelected = pickedDate === date;
                return (
                  <button
                    key={p.days}
                    type="button"
                    onClick={() => setPickedDate(date)}
                    data-testid={`recall-snooze-quick-${p.days}`}
                    data-selected={isSelected ? 'true' : 'false'}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      isSelected
                        ? 'bg-indigo-500/20 border-indigo-500 text-indigo-200'
                        : 'bg-[var(--bg-surface)] border-[var(--bd)] text-[var(--tx-primary)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom date */}
          <div data-field="pickedDate">
            <p className="text-[10px] font-bold text-[var(--tx-muted)] uppercase tracking-wider mb-1.5">
              หรือเลือกวันที่
            </p>
            <DateField
              value={pickedDate}
              onChange={setPickedDate}
              locale="be"
              size="md"
              min={todayISO}
            />
          </div>

          {error && (
            <div
              className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-[11px] text-red-300"
              data-testid="recall-snooze-error"
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
            data-testid="recall-snooze-cancel"
            className="px-4 py-2 rounded-lg text-xs font-semibold text-[var(--tx-muted)] hover:bg-[var(--bg-hover)]"
            disabled={saving}
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            data-testid="recall-snooze-save"
            className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            <Clock size={12} />
            {saving ? 'กำลังบันทึก…' : '⏰ เลื่อน'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default RecallSnoozeMenu;
