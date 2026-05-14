import React from 'react';
import DateField from '../../DateField.jsx';
import { computeDaysFromToday, formatDaysFromTodayLabel } from '../../../lib/recallResolvers.js';
import { RecallCaseSelectField } from './RecallCaseSelectField.jsx';

/**
 * Bangkok-TZ-stable "today + N days" helper. Uses midday-UTC parse pattern
 * (V53 lesson) so day-of-week math doesn't TZ-shift to prior day.
 * @param {string} isoDate "YYYY-MM-DD"
 * @param {number} daysToAdd
 * @returns {string} "YYYY-MM-DD"
 */
function addDaysISO(isoDate, daysToAdd) {
  if (!isoDate || typeof isoDate !== 'string') return '';
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  const dt = new Date(ms + Math.floor(Number(daysToAdd) || 0) * 86400000);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Phase 29 (2026-05-14) — Single recall slot card inside RecallCreateModal.
 *
 * Slot 1 (aftercare 🩹 amber) and slot 2 (revisit 📅 red) share this component;
 * `slotType` prop controls icon + theme.
 *
 * State is fully controlled by parent — this is a presentational atom.
 *
 * Phase 29.22 (2026-05-14) — reason input swap: plain <input> →
 * RecallCaseSelectField typeahead pulling from be_recall_cases (parent
 * passes `recallCases` array). Pick a row → reason + recallDate auto-fill.
 * Inline-learn checkbox shown when slot reason+date filled but no matching
 * preset (admin opts in to save the values as a new be_recall_cases entry).
 *
 * @param {object} props
 * @param {'aftercare'|'revisit'} props.slotType
 * @param {{enabled:boolean,recallDate:string,reason:string,saveToMaster:boolean}} props.value
 * @param {(patch:object)=>void} props.onChange merges into value
 * @param {string} props.todayISO Bangkok-local today
 * @param {{days:number,reason:string,sourceLabel:string}|null} [props.masterDataSuggestion]
 *   DEPRECATED (Phase 29.22) — kept for backward compat; ignored when
 *   recallCases supplied.
 * @param {Array<{caseId,caseName,defaultDays}>} [props.recallCases]
 *   Phase 29.22 — typeahead options from be_recall_cases.
 */
export function RecallSlotCard({ slotType, value, onChange, todayISO, masterDataSuggestion, recallCases = [] }) {
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
  // Phase 29.23-bis (2026-05-14) — hide inline-learn checkbox when the reason
  // already matches an existing be_recall_cases entry. User report: "กูเลือก
  // เหตุผล ที่มีอยู่แล้วใน dropdown มา แล้วมึงยังมีช่อง บันทึกเป็นเคส Recall
  // โผล่มาให้ติ๊กอีกวะ มันก็บันทึกซ้ำซ้อนอะดิ". When admin picks an existing
  // case from typeahead, the reason exactly matches one of recallCases.caseName
  // → no point offering "save as new case" (would create duplicate).
  // Trim both sides to defend against typeahead-set whitespace asymmetry.
  const normalizedReason = String(value?.reason || '').trim();
  const reasonAlreadyInCases = !!(
    normalizedReason &&
    Array.isArray(recallCases) &&
    recallCases.some((c) => String(c?.caseName || '').trim() === normalizedReason)
  );
  const showInlineLearn = !!(
    value?.enabled &&
    !masterDataSuggestion &&
    value?.recallDate &&
    value?.reason &&
    !reasonAlreadyInCases
  );

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

            {/* Reason picker (Phase 29.22: typeahead from be_recall_cases) */}
            <div data-field={`${slotKeyPrefix}-reason`}>
              <label className="block text-[10px] font-bold text-[var(--tx-muted)] mb-1 uppercase">
                เหตุผล / เคส Recall
              </label>
              <RecallCaseSelectField
                value={value?.reason || ''}
                recallCases={recallCases}
                onChange={(text) => set({ reason: text })}
                onPick={({ caseName, defaultDays }) => {
                  const patch = { reason: caseName };
                  // Auto-fill recallDate from today + defaultDays. Only set
                  // when defaultDays is a positive integer.
                  const d = Math.floor(Number(defaultDays) || 0);
                  if (d > 0 && todayISO) {
                    const newDate = addDaysISO(todayISO, d);
                    if (newDate) patch.recallDate = newDate;
                  }
                  set(patch);
                }}
                placeholder={isAftercare ? 'ติดตามอาการหลังการรักษา' : 'ครบรอบบริการ'}
                data-testid={`recall-slot-${slotType}-reason`}
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
                💾 บันทึกเป็นเคส Recall — Recall ครั้งถัดไปจะ Auto-suggest จากค่านี้
              </span>
            </label>
          )}
        </div>
      )}
    </div>
  );
}

export default RecallSlotCard;
