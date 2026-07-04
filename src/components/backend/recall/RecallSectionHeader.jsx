import React from 'react';
import { formatThaiFullDate } from '../../../lib/recallResolvers.js';

/**
 * Phase 29 (2026-05-14) — bucket section header.
 * Pattern mirrors Phase 28 TreatmentDateHeader.
 *
 * 5 bucket variants (per spec §4.1):
 *   - overdue → 🚨 dark red border-left + pulse
 *   - today → 📅 fire-red border-left
 *   - tomorrow → 📅 amber border-left
 *   - thisWeek → 📆 teal border-left
 *   - later → 📋 indigo border-left
 *
 * Caller passes `bucketKey` + `count` + optional `doneCount` (only used for today).
 */

const BUCKET_THEMES = Object.freeze({
  overdue: {
    icon: '🚨',
    label: 'เกินกำหนด',
    relativePill: 'เกินกำหนด',
    pillColor: 'rgba(239,68,68,0.20)',
    pillText: '#fca5a5',
    borderLeft: 'border-l-red-500',
    bg: 'bg-red-500/[0.04]',
    pulse: true,
  },
  today: {
    icon: '📅',
    label: 'วันนี้',
    relativePill: 'วันนี้',
    pillColor: 'rgba(239,68,68,0.10)',
    pillText: '#fca5a5',
    borderLeft: 'border-l-red-500',
    bg: 'bg-red-500/[0.02]',
  },
  tomorrow: {
    icon: '📅',
    label: 'พรุ่งนี้',
    relativePill: 'พรุ่งนี้',
    pillColor: 'rgba(245,158,11,0.10)',
    pillText: '#fcd34d',
    borderLeft: 'border-l-amber-500',
    bg: 'bg-amber-500/[0.02]',
  },
  thisWeek: {
    icon: '📆',
    label: 'ภายใน 7 วัน',
    relativePill: 'สัปดาห์นี้',
    pillColor: 'rgba(20,184,166,0.10)',
    pillText: '#5eead4',
    borderLeft: 'border-l-teal-500',
    bg: 'bg-teal-500/[0.02]',
  },
  later: {
    icon: '📋',
    label: 'ภายหลัง',
    relativePill: 'ภายหลัง',
    pillColor: 'rgba(99,102,241,0.10)',
    pillText: '#a5b4fc',
    borderLeft: 'border-l-indigo-500',
    bg: 'bg-indigo-500/[0.02]',
  },
});

/**
 * 2026-07-05 additions (user report IMG_8920):
 *   - `dateISO` (Q1=B) — today/tomorrow headers show the REAL full date
 *     (" · 5 ก.ค. 2569") so the group can never be misread.
 *   - `alwaysRender` (Q2=A) — compact mode renders the header even at count 0
 *     (the section carries a "✓ ไม่มี" box below instead of vanishing).
 */
export function RecallSectionHeader({ bucketKey, count, doneCount, prominent = false, dateISO = '', alwaysRender = false }) {
  const theme = BUCKET_THEMES[bucketKey];
  if (!theme || (!count && !alwaysRender)) return null;
  const dateSuffix = dateISO ? formatThaiFullDate(dateISO) : '';

  return (
    <div
      data-testid={`recall-section-${bucketKey}`}
      data-bucket={bucketKey}
      data-prominent={prominent ? 'true' : 'false'}
      className={`flex items-center gap-2 border-l-2 ${theme.borderLeft} ${theme.bg} border-b border-[var(--bd)] ${prominent ? 'px-3 py-3 rounded-t-lg' : 'px-3 py-2'}`}
    >
      <span className={prominent ? 'text-lg' : 'text-sm'} aria-hidden="true">{theme.icon}</span>
      <span className={`font-bold text-[var(--tx-primary)] ${prominent ? 'text-base' : 'text-[12px]'}`}>
        {theme.label}
        {dateSuffix && <span className="font-semibold text-[var(--tx-muted)]" data-testid={`recall-section-date-${bucketKey}`}> · {dateSuffix}</span>}
      </span>
      <span
        className="text-[9px] px-1.5 py-0.5 rounded font-bold"
        style={{ background: theme.pillColor, color: theme.pillText }}
      >
        {theme.relativePill}
      </span>
      <span className="text-[10px] text-[var(--tx-muted)] font-mono ml-auto">
        {count} รายการ
        {bucketKey === 'today' && typeof doneCount === 'number' && (
          <> · เสร็จ {doneCount}/{count}</>
        )}
      </span>
    </div>
  );
}

export default RecallSectionHeader;
