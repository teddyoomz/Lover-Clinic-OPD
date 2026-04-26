// ─── LangPillToggle — V33.7 (2026-04-27) ────────────────────────────────
// Reusable segmented-pill language toggle. Rule C1 (Rule of 3) extract:
// 1st instance was inline in DocumentPrintModal.jsx (TH/EN/Bilingual print
// language selector); V33.7 adds 2 new instances (LinkLineInstructionsModal
// + LinkRequestsTab "ผูกแล้ว" row TH/EN bot reply selector). Three call
// sites = extract.
//
// Each option is a small "pill" button. Active option is filled with the
// `activeClassName` (defaults to clinic-red for V33.7 LINE OA). Inactive
// options use a muted background with hover. Lowercase labels uppercased
// inline ('th' → 'TH', 'en' → 'EN', 'bilingual' → 'TH/EN').

import React from 'react';

const DEFAULT_OPTIONS = ['th', 'en'];

function defaultLabel(opt) {
  if (opt === 'bilingual') return 'TH/EN';
  return String(opt || '').toUpperCase();
}

export function LangPillToggle({
  value,
  onChange,
  options = DEFAULT_OPTIONS,
  disabled = false,
  size = 'sm',                                          // 'sm' | 'xs'
  activeClassName = 'bg-rose-700 text-white border-rose-700',
  inactiveClassName = 'bg-[var(--bg-hover,rgba(255,255,255,0.05))] text-[var(--tx-muted,#9ca3af)] hover:text-[var(--tx-primary,#fff)] border-transparent',
  className = '',
  ariaLabel = 'language',
  labelFn = defaultLabel,
}) {
  const safeOptions = Array.isArray(options) && options.length >= 1 ? options : DEFAULT_OPTIONS;
  const sizeCls = size === 'xs'
    ? 'px-1.5 py-0.5 text-[10px]'
    : 'px-2 py-0.5 text-[11px]';

  return (
    <div role="group" aria-label={ariaLabel} className={`inline-flex items-center gap-0.5 ${className}`}>
      {safeOptions.map((opt) => {
        const isActive = opt === value;
        const cls = `${sizeCls} font-bold uppercase rounded border transition-colors ${
          isActive ? activeClassName : inactiveClassName
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`;
        return (
          <button
            key={opt}
            type="button"
            disabled={disabled}
            aria-pressed={isActive}
            aria-label={`${ariaLabel}: ${labelFn(opt)}`}
            onClick={() => {
              if (disabled) return;
              if (typeof onChange === 'function' && opt !== value) onChange(opt);
            }}
            className={cls}
          >
            {labelFn(opt)}
          </button>
        );
      })}
    </div>
  );
}

export default LangPillToggle;
