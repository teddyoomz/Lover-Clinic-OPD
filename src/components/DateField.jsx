// ─── DateField — shared calendar picker for the entire app ─────────────────
// Iron-clad rule: all date inputs must use this, never a raw <input type="date">.
// Displays dd/mm/yyyy (locale: 'ce' = ค.ศ., 'be' = พ.ศ.) and uses the browser date
// picker underneath (transparent overlay) so clicking the field pops the native
// picker UI while the visible text stays in our format.
//
// Click reliability: native <input type="date"> in Chrome only opens the picker
// when the calendar icon is clicked (the rest of the field just focuses). To make
// the ENTIRE field clickable, we call input.showPicker() explicitly — supported
// in Chrome 99+, Firefox 101+, Safari 16+ (2022). Safe to call (throws only on
// non-secure contexts, wrapped in try/catch).

import { useRef } from 'react';

/**
 * @param {Object} props
 * @param {string} props.value      — ISO date string "YYYY-MM-DD"
 * @param {(v: string) => void} props.onChange
 * @param {'ce'|'be'} [props.locale='ce']  — ce: ค.ศ. (backend/admin), be: พ.ศ. (clinic-facing)
 * @param {string}  [props.placeholder='เลือกวันที่']
 * @param {string}  [props.className='']
 * @param {string}  [props.size='md']  — 'sm' | 'md'
 * @param {boolean} [props.disabled=false]
 * @param {string}  [props.min]
 * @param {string}  [props.max]
 */
export default function DateField({
  value = '',
  onChange,
  locale = 'ce',
  placeholder = 'เลือกวันที่',
  className = '',
  size = 'md',
  disabled = false,
  min,
  max,
}) {
  const inputRef = useRef(null);

  const display = (() => {
    if (!value) return placeholder;
    const [y, m, d] = String(value).split('-');
    if (!y || !m || !d) return value;
    const year = locale === 'be' ? Number(y) + 543 : Number(y);
    return `${d}/${m}/${year}`;
  })();

  const padY = size === 'sm' ? 'py-1.5' : 'py-2';
  const text = size === 'sm' ? 'text-[11px]' : 'text-xs';

  // Open the native picker from any click on the field (Chrome would otherwise
  // only open on the calendar icon). Fall back silently if showPicker throws.
  const openPicker = () => {
    const el = inputRef.current;
    if (!el || disabled) return;
    try { el.showPicker(); } catch { /* older browser / non-secure context — default focus still works */ }
  };

  return (
    <div
      className={`relative w-full ${disabled ? 'opacity-50 pointer-events-none' : 'cursor-pointer'} ${className}`}
      onClick={openPicker}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); } }}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={placeholder}
    >
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={e => onChange?.(e.target.value)}
        disabled={disabled}
        min={min}
        max={max}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        aria-label={placeholder}
        tabIndex={-1}
      />
      <div className={`w-full rounded-lg px-3 ${padY} ${text} border bg-[var(--bg-surface)] border-[var(--bd)] text-[var(--tx-primary)] flex items-center justify-between`}>
        <span className={value ? '' : 'text-[var(--tx-muted)]'}>{display}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--tx-muted)] flex-shrink-0 ml-2">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </div>
    </div>
  );
}
