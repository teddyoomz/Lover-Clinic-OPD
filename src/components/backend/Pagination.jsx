// ─── Pagination — shared 20/page pager UI ──────────────────────────────────
// Phase 15.4 (2026-04-28) — Rule C1 Rule-of-3.
//
// Renders Prev / "หน้า N / M · X รายการ" / Next pill. Auto-hides when
// totalPages <= 1 so callers can render `<Pagination ... />` unconditionally
// after their list.
//
// Pairs with `usePagination` hook in src/lib/usePagination.js. Caller:
//   const { page, setPage, totalPages, visibleItems, totalCount } = usePagination(filtered, { key: filtersKey });
//   return <>
//     {visibleItems.map(...)}
//     <Pagination page={page} totalPages={totalPages} onPageChange={setPage} totalCount={totalCount} />
//   </>
//
// Iron-clad:
//   - Rule 04 Thai UI: dd/mm-style natural; "หน้า X / Y" Thai copy
//   - Rule 03-stack V5: no JSX IIFE; plain function component
//   - V14 lock: no undefined defaults that could leak to writers (this is
//     a UI component — no Firestore writes, but we still defensive-default
//     totalPages/page to safe values)

import { ChevronLeft, ChevronRight } from 'lucide-react';

const DEFAULT_BTN_CLS =
  'px-3 py-1.5 rounded-md text-xs font-bold inline-flex items-center gap-1 ' +
  'bg-[var(--bg-surface)] text-[var(--tx-primary)] border border-[var(--bd)] ' +
  'hover:bg-[var(--bg-hover)] disabled:opacity-30 disabled:cursor-not-allowed ' +
  'transition-colors';

/**
 * @param {Object} props
 * @param {number} props.page — current 1-based page index
 * @param {number} props.totalPages — total number of pages (>= 1)
 * @param {(p: number) => void} props.onPageChange — called with new page (1..totalPages)
 * @param {number} [props.totalCount] — total item count for the "X รายการ" hint
 * @param {string} [props.testId='pagination'] — data-testid prefix
 * @param {string} [props.className] — extra Tailwind classes for outer wrapper
 */
export default function Pagination({
  page = 1,
  totalPages = 1,
  onPageChange,
  totalCount,
  testId = 'pagination',
  className = '',
}) {
  const safePage = Math.max(1, Math.min(Number(page) || 1, Math.max(1, Number(totalPages) || 1)));
  const safeTotal = Math.max(1, Number(totalPages) || 1);

  // Hide when only 1 page (or none).
  if (safeTotal <= 1) return null;

  const goPrev = () => {
    if (safePage > 1 && typeof onPageChange === 'function') onPageChange(safePage - 1);
  };
  const goNext = () => {
    if (safePage < safeTotal && typeof onPageChange === 'function') onPageChange(safePage + 1);
  };

  return (
    <div
      className={`flex items-center justify-center gap-3 py-3 ${className}`.trim()}
      data-testid={testId}
    >
      <button
        type="button"
        disabled={safePage === 1}
        onClick={goPrev}
        className={DEFAULT_BTN_CLS}
        data-testid={`${testId}-prev`}
        aria-label="หน้าก่อนหน้า"
      >
        <ChevronLeft size={14} /> ก่อนหน้า
      </button>
      <span
        className="text-xs text-[var(--tx-muted)] font-bold tabular-nums"
        data-testid={`${testId}-status`}
      >
        หน้า {safePage} / {safeTotal}
        {typeof totalCount === 'number' && totalCount >= 0 && (
          <span className="ml-2 font-normal">· {totalCount.toLocaleString('th-TH')} รายการ</span>
        )}
      </span>
      <button
        type="button"
        disabled={safePage === safeTotal}
        onClick={goNext}
        className={DEFAULT_BTN_CLS}
        data-testid={`${testId}-next`}
        aria-label="หน้าถัดไป"
      >
        ถัดไป <ChevronRight size={14} />
      </button>
    </div>
  );
}
