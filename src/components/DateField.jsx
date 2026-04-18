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
 * @param {string}  props.value      — ISO date string "YYYY-MM-DD"
 * @param {(v: string) => void} props.onChange
 * @param {'ce'|'be'} [props.locale='ce']  — ce: ค.ศ. (backend/admin), be: พ.ศ. (clinic-facing)
 * @param {string}  [props.placeholder='เลือกวันที่']
 * @param {string}  [props.className='']        — EXTRA classes appended to the visible box.
 * @param {string}  [props.fieldClassName]      — FULL REPLACEMENT for the visible box's default
 *                                                 styling (bg/border/padding/text-size). Use this
 *                                                 when the calling form wants its own theme
 *                                                 (e.g. `focus:border-emerald-600 bg-[var(--bg-card)]`).
 *                                                 If omitted, the built-in neutral styling is used.
 * @param {'sm'|'md'} [props.size='md']
 * @param {boolean} [props.disabled=false]
 * @param {string}  [props.min]
 * @param {string}  [props.max]
 * @param {boolean} [props.showIcon=true]
 */
export default function DateField({
  value = '',
  onChange,
  locale = 'ce',
  placeholder = 'เลือกวันที่',
  className = '',
  fieldClassName,
  size = 'md',
  disabled = false,
  min,
  max,
  showIcon = true,
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
  const textSz = size === 'sm' ? 'text-[11px]' : 'text-xs';

  // Default visible styling — used when the caller doesn't opt into a custom look.
  // Callers that pass `fieldClassName` fully replace this (so their focus/border/bg
  // wins instead of getting layered on top of the defaults).
  const defaultField = `w-full rounded-lg px-3 ${padY} ${textSz} border bg-[var(--bg-surface)] border-[var(--bd)] text-[var(--tx-primary)]`;
  const boxClass = `${fieldClassName || defaultField} ${className} flex items-center justify-between cursor-pointer`;

  // Open the native picker from any click on the field (Chrome would otherwise
  // only open on the calendar icon). Fall back silently if showPicker throws.
  const openPicker = () => {
    const el = inputRef.current;
    if (!el || disabled) return;
    try { el.showPicker(); } catch { /* older browser / non-secure context — default focus still works */ }
  };

  return (
    <div
      className={`relative ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
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
      <div className={boxClass}>
        <span className={value ? '' : 'text-[var(--tx-muted)]'}>{display}</span>
        {showIcon && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--tx-muted)] flex-shrink-0 ml-2">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
        )}
      </div>
    </div>
  );
}
