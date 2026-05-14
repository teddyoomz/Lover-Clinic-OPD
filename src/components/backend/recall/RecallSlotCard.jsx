import React from 'react';
import DateField from '../../DateField.jsx';
import { computeDaysFromToday, formatDaysFromTodayLabel } from '../../../lib/recallResolvers.js';

/**
 * Phase 29 (2026-05-14) — Single recall slot card inside RecallCreateModal.
 *
 * Slot 1 (aftercare 🩹 amber) and slot 2 (revisit 📅 red) share this component;
 * `slotType` prop controls icon + theme.
 *
 * State is fully controlled by parent — this is a presentational atom.
 *
 * Auto-suggest hint shown when `masterDataSuggestion` non-null AND slot enabled.
 * Inline-learn checkbox shown when slot has no master-data suggestion AND user
 * has typed values (admin can opt-in to save the values back to master).
 *
 * @param {object} props
 * @param {'aftercare'|'revisit'} props.slotType
 * @param {{enabled:boolean,recallDate:string,reason:string,saveToMaster:boolean}} props.value
 * @param {(patch:object)=>void} props.onChange merges into value
 * @param {string} props.todayISO Bangkok-local today
 * @param {{days:number,reason:string,sourceLabel:string}|null} [props.masterDataSuggestion]
 *   When passed, shows teal hint "Auto-suggest from master: ___"
 */
export function RecallSlotCard({ slotType, value, onChange, todayISO, masterDataSuggestion }) {
  const isAftercare = slotType === 'aftercare';
  const icon = isAftercare ? '🩹' : '📅';
  const slotLabel = isAftercare ? 'Recall #1 · ติดตามอาการ' : 'Recall #2 · นัดกลับมารับบริการ';
  const slotHint = isAftercare
    ? 'หลังการรักษา (มักจะ 1-3 วัน)'
    : 'เมื่อบริการครบรอบ (ฟิลเลอร์ 6 เดือน / botox 4 เดือน / etc.)';
  const themeBorder = isAftercare ? 'border-l-amber-500' : 'border-l-red-500';
  const themeBg = isAftercare ? 'bg-amber-500/[0.04]' : 'bg-red-500/[0.04]';
  const themeText = isAftercare ? 'text-amber-300' : 'text-red-300';
  const themeBadgeBg = isAftercare ? 'bg-amber-500/15' : 'bg-red-500/15';
  const themeBadgeBorder = isAftercare ? 'border-amber-500/30' : 'border-red-500/30';
  const slotKeyPrefix = isAftercare ? 'slot1' : 'slot2';

  const days = value?.recallDate ? computeDaysFromToday(value.recallDate, todayISO) : null;
  const showAutoSuggest = !!(value?.enabled && masterDataSuggestion);
  const showInlineLearn = !!(value?.enabled && !masterDataSuggestion && value?.recallDate && value?.reason);

  const set = (patch) => onChange?.(patch);

  return (
    <div
      data-testid={`recall-slot-${slotType}`}
      data-slot-enabled={value?.enabled ? 'true' : 'false'}
      className={`rounded-lg border border-[var(--bd)] border-l-2 ${themeBorder} ${themeBg} overflow-hidden transition-all`}
    >
      {/* Header with toggle */}
      <label
        className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
        data-field={`${slotKeyPrefix}-enabled`}
      >
        <input
          type="checkbox"
          checked={!!value?.enabled}
          onChange={(e) => set({ enabled: e.target.checked })}
          className={`w-4 h-4 rounded ${isAftercare ? 'accent-amber-500' : 'accent-red-500'}`}
          data-testid={`recall-slot-${slotType}-toggle`}
        />
        <span className="text-sm" aria-hidden="true">{icon}</span>
        <span className={`text-[12px] font-bold ${themeText}`}>{slotLabel}</span>
        <span className="text-[10px] text-[var(--tx-muted)] italic ml-1">— {slotHint}</span>
      </label>

      {/* Body — visible only when enabled */}
      {value?.enabled && (
        <div className="px-3 pb-3 pt-1 space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {/* Date input */}
            <div data-field={`${slotKeyPrefix}-recallDate`}>
              <label className="block text-[10px] font-bold text-[var(--tx-muted)] mb-1 uppercase">
                วันที่ Recall
              </label>
              <DateField
                value={value?.recallDate || ''}
                onChange={(v) => set({ recallDate: v })}
                locale="be"
                size="sm"
                min={todayISO}
              />
              {days != null && (
                <div
                  className={`mt-1 inline-block text-[10px] px-2 py-0.5 rounded font-bold border ${themeBadgeBg} ${themeBadgeBorder} ${themeText}`}
                  data-testid={`recall-slot-${slotType}-days-badge`}
                >
                  📅 {formatDaysFromTodayLabel(days)}
                </div>
              )}
            </div>

            {/* Reason input */}
            <div data-field={`${slotKeyPrefix}-reason`}>
              <label className="block text-[10px] font-bold text-[var(--tx-muted)] mb-1 uppercase">
                เหตุผล / เรื่อง
              </label>
              <input
                type="text"
                value={value?.reason || ''}
                onChange={(e) => set({ reason: e.target.value })}
                placeholder={isAftercare ? 'ติดตามอาการหลังการรักษา' : 'ครบรอบบริการ'}
                maxLength={200}
                data-testid={`recall-slot-${slotType}-reason`}
                className="w-full px-3 py-1.5 rounded-lg text-xs bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
          </div>

          {/* Auto-suggest hint */}
          {showAutoSuggest && (
            <div
              data-testid={`recall-slot-${slotType}-auto-suggest`}
              className="text-[10px] text-teal-300 italic px-2 py-1 bg-teal-500/[0.06] border border-teal-500/25 border-dashed rounded"
            >
              💡 Auto-suggest จาก {masterDataSuggestion.sourceLabel}: +{masterDataSuggestion.days} วัน
            </div>
          )}

          {/* Inline-learn checkbox */}
          {showInlineLearn && (
            <label
              className="flex items-center gap-2 cursor-pointer select-none px-2 py-1 bg-[var(--bg-surface)] rounded"
              data-field={`${slotKeyPrefix}-saveToMaster`}
            >
              <input
                type="checkbox"
                checked={!!value?.saveToMaster}
                onChange={(e) => set({ saveToMaster: e.target.checked })}
                className="w-3.5 h-3.5 rounded accent-emerald-500"
                data-testid={`recall-slot-${slotType}-save-master`}
              />
              <span className="text-[10px] text-[var(--tx-primary)]">
                💾 บันทึกระยะเวลานี้ลง master-data ด้วย — Recall ครั้งถัดไปจะ Auto-suggest จากค่านี้
              </span>
            </label>
          )}
        </div>
      )}
    </div>
  );
}

export default RecallSlotCard;
