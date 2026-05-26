// src/components/VisitPurposePicker.jsx
// Task E2 (2026-05-25) — controlled chip multi-select for "นัดมาเพื่อ".
//
// The stored value is the joined appointmentTo STRING (backward-compatible —
// same field the modal already wrote). This component derives chip state from
// the string and emits a new string on every change, via the canonical
// build/parse helpers. Unknown (legacy free-text) tokens fold into the "อื่นๆ"
// detail box so nothing is lost on hydration.
//
// Thai-UI: a selected chip uses an ember-red accent (it is NOT a name/HN, so red
// is allowed per the culture rule — red on names/HN is forbidden, chips are fine).
import { useMemo } from 'react';
import { visitReasonOptions } from '../lib/visitReasonOptions.js';
import { buildVisitPurposeText, parseVisitPurposeText } from '../lib/visitPurposeUtils.js';

export default function VisitPurposePicker({ value, onChange, required = false, idPrefix = 'vp', label = 'นัดมาเพื่อ' }) {
  const { purposes, other } = useMemo(() => parseVisitPurposeText(value || ''), [value]);
  const known = useMemo(() => new Set(visitReasonOptions.map((o) => o.value)), []);

  // Any parsed purpose not in the known list is a legacy free-text token →
  // fold it into the "อื่นๆ" detail so hydration is lossless.
  const legacyExtra = purposes.filter((p) => !known.has(p));
  const effOther = [other, ...legacyExtra].filter(Boolean).join(', ');
  const effPurposes = purposes.filter((p) => known.has(p));
  const hasOther = effPurposes.includes('อื่นๆ') || legacyExtra.length > 0;
  const selected = hasOther && !effPurposes.includes('อื่นๆ') ? [...effPurposes, 'อื่นๆ'] : effPurposes;

  const toggle = (v) => {
    const next = selected.includes(v) ? selected.filter((p) => p !== v) : [...selected, v];
    onChange(buildVisitPurposeText(next, effOther));
  };
  const setOther = (txt) => {
    const withOther = selected.includes('อื่นๆ') ? selected : [...selected, 'อื่นๆ'];
    onChange(buildVisitPurposeText(withOther, txt));
  };

  return (
    <div data-field="appointmentTo">
      <label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className="flex flex-wrap gap-2">
        {visitReasonOptions.map((o) => {
          const on = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => toggle(o.value)}
              data-testid={`${idPrefix}-chip-${o.value}`}
              aria-pressed={on}
              className={`px-3 py-1.5 rounded-lg text-xs border transition ${
                on
                  ? 'border-red-600 bg-red-600 text-white dark:border-red-500 dark:bg-red-950/40 dark:text-red-200 font-semibold'
                  : 'border-[var(--bd)] bg-[var(--bg-input)] text-[var(--tx-secondary)] hover:border-red-700/50'
              }`}
            >
              {o.th}
            </button>
          );
        })}
      </div>
      {selected.includes('อื่นๆ') && (
        <input
          type="text"
          value={effOther}
          onChange={(e) => setOther(e.target.value)}
          placeholder="ระบุเพิ่มเติม เช่น ผ่ามุก, ตรวจแผล…"
          data-testid={`${idPrefix}-other-input`}
          className="mt-2 w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] placeholder:text-[var(--tx-muted)] focus:outline-none focus:ring-1 focus:ring-red-500"
        />
      )}
    </div>
  );
}
