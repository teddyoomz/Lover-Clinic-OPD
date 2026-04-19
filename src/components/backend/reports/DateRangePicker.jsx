// ─── DateRangePicker — shared date-range filter for Phase 10 reports ────────
// Mirrors ProClinic's flatpickr range filter pattern. Quick presets accelerate
// the common cases (today / this month / last month / this year / custom).
// All dates ISO YYYY-MM-DD in Bangkok timezone.

import { useMemo } from 'react';
import DateField from '../../DateField.jsx';
import { thaiTodayISO, bangkokNow } from '../../../utils.js';

/**
 * @param {object} props
 * @param {string} props.from               — ISO YYYY-MM-DD start (inclusive)
 * @param {string} props.to                 — ISO YYYY-MM-DD end (inclusive)
 * @param {(range: { from: string, to: string, presetId: string }) => void} props.onChange
 * @param {string} [props.presetId='last30'] — id of currently-selected preset
 */
export default function DateRangePicker({ from, to, onChange, presetId = 'last30' }) {
  const presets = useMemo(() => buildPresets(), []);

  const apply = (preset) => {
    onChange({ from: preset.from, to: preset.to, presetId: preset.id });
  };

  return (
    <div className="flex items-center gap-2 flex-wrap" data-testid="date-range-picker">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider">
        {presets.map(p => (
          <button
            key={p.id}
            type="button"
            onClick={() => apply(p)}
            className={`px-2 py-1.5 rounded font-bold transition-all border ${
              presetId === p.id
                ? 'bg-cyan-700/30 border-cyan-700/50 text-cyan-300'
                : 'bg-[var(--bg-hover)] border-[var(--bd)] text-[var(--tx-muted)] hover:text-cyan-400'
            }`}
            data-preset={p.id}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1 text-[10px] text-[var(--tx-muted)]">
        <span>จาก</span>
        <DateField
          value={from}
          onChange={(v) => onChange({ from: v, to, presetId: 'custom' })}
          size="sm"
          className="max-w-[140px]"
        />
        <span>ถึง</span>
        <DateField
          value={to}
          onChange={(v) => onChange({ from, to: v, presetId: 'custom' })}
          size="sm"
          className="max-w-[140px]"
        />
      </div>
    </div>
  );
}

/**
 * Build the standard preset list. Pure (only depends on bangkokNow()) so
 * tests can mock the system clock and assert exact ranges.
 */
export function buildPresets(now = bangkokNow()) {
  // `now` is a UTC-shifted Date (see bangkokNow in utils.js); read fields via
  // getUTC* so we get Bangkok wall-clock day/month/year without TZ drift.
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();

  const iso = (yr, mo, da) => {
    const dd = String(da).padStart(2, '0');
    const mm = String(mo + 1).padStart(2, '0');
    return `${yr}-${mm}-${dd}`;
  };

  const today = iso(y, m, d);

  const shiftDays = (delta) => {
    // Use UTC arithmetic on the same UTC-shifted epoch so subtraction stays in
    // Bangkok wall-clock terms.
    const dt = new Date(now.getTime() + delta * 86400000);
    return iso(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
  };

  const last7 = shiftDays(-6);
  const last30 = shiftDays(-29);

  const monthStart = iso(y, m, 1);
  const lastMonth = m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 };
  const lastMonthStart = iso(lastMonth.y, lastMonth.m, 1);
  const lastMonthEnd = (() => {
    // Day 0 of next month = last day of this month (UTC).
    const dt = new Date(Date.UTC(lastMonth.y, lastMonth.m + 1, 0));
    return iso(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
  })();

  const yearStart = iso(y, 0, 1);

  return [
    { id: 'today',     label: 'วันนี้',      from: today,          to: today },
    { id: 'last7',     label: '7 วัน',        from: last7,          to: today },
    { id: 'last30',    label: '30 วัน',       from: last30,         to: today },
    { id: 'thisMonth', label: 'เดือนนี้',     from: monthStart,     to: today },
    { id: 'lastMonth', label: 'เดือนก่อน',   from: lastMonthStart, to: lastMonthEnd },
    { id: 'thisYear',  label: 'ปีนี้',        from: yearStart,      to: today },
  ];
}
