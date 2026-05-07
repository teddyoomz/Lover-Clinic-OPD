// V51 (2026-05-08) — shared TimeSelect24 component extracted from
// ClinicSettingsPanel for Rule of 3: BranchFormModal also needs the same
// 24-hour time picker for per-branch openHours / chatHours.
//
// HOURS + MINUTES exported as named exports for callers that need to render
// custom hour/minute lists.
//
// Phase 2 of per-branch settings migration — see
// docs/superpowers/specs/2026-05-08-per-branch-settings-migration-design.md

export const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
export const MINUTES = ['00', '15', '30', '45'];

export default function TimeSelect24({ value, onChange, focusColor }) {
  const [hh, mm] = (value || '10:00').split(':');
  const selCls = `bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-heading)] rounded-lg px-2 py-2.5 outline-none transition-all text-sm font-mono cursor-pointer ${focusColor || 'focus:border-[var(--accent)]'}`;
  return (
    <div className="flex items-center gap-0.5">
      <select value={hh} onChange={e => onChange(`${e.target.value}:${mm}`)} className={`${selCls} w-[60px] text-center rounded-r-none`}>
        {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
      </select>
      <span className="text-gray-500 font-mono text-sm font-bold">:</span>
      <select value={MINUTES.includes(mm) ? mm : '00'} onChange={e => onChange(`${hh}:${e.target.value}`)} className={`${selCls} w-[56px] text-center rounded-l-none`}>
        {MINUTES.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
    </div>
  );
}
