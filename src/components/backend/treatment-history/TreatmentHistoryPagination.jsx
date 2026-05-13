import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Phase 28 (2026-05-14) — pagination footer for treatment history list.
 * Refined ghost buttons + fire-red gradient for active page.
 *
 * Returns null when totalPages <= 1 (no need to render).
 *
 * @param {number} currentPage — 1-indexed current page
 * @param {number} totalPages — total page count
 * @param {number} totalItems — total item count (for "X–Y / N" info)
 * @param {number} pageSize — items per page
 * @param {number[]} pageNumbers — page numbers to display (caller computes ellipsis windowing)
 * @param {(page: number) => void} onPageChange — page change callback
 */
export function TreatmentHistoryPagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  pageNumbers,
  onPageChange,
}) {
  if (totalPages <= 1) return null;

  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  return (
    <div
      className="px-[18px] py-3 border-t border-[var(--bd)] bg-gradient-to-b from-transparent to-black/30
        flex items-center justify-between flex-wrap gap-2.5"
      data-testid="treatment-history-pagination"
    >
      <span className="text-[11px] text-[var(--tx-muted)]">
        แสดง <b className="text-[var(--tx-primary)] font-mono font-bold">{start}–{end}</b>
        {' '}จาก <b className="text-[var(--tx-primary)] font-mono font-bold">{totalItems}</b> รายการ
      </span>
      <div className="flex gap-1 items-center">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          data-testid="treatment-page-prev"
          aria-label="หน้าก่อนหน้า"
          className="min-w-[30px] h-7 px-2.5 text-[11px] rounded-md border border-[#2a2a2a]
            bg-white/[0.02] text-[var(--tx-secondary)] font-bold font-mono
            inline-flex items-center justify-center
            hover:bg-white/[0.06] hover:text-[var(--tx-heading)] hover:border-[#444]
            disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          <ChevronLeft size={12} aria-hidden="true" />
        </button>
        {pageNumbers.map((p, idx) => {
          const prev = pageNumbers[idx - 1];
          const showEllipsis = prev !== undefined && p - prev > 1;
          const isActive = p === currentPage;
          return (
            <span key={p} className="flex items-center gap-1">
              {showEllipsis && <span className="text-[var(--tx-muted)] text-xs px-1">…</span>}
              <button
                type="button"
                onClick={() => onPageChange(p)}
                data-testid={`treatment-page-${p}`}
                aria-current={isActive ? 'page' : undefined}
                className={`min-w-[30px] h-7 px-2.5 text-[11px] rounded-md font-bold font-mono
                  inline-flex items-center justify-center transition-all ${
                    isActive
                      ? 'bg-gradient-to-br from-red-500 to-red-700 border border-transparent text-white shadow-[0_0_0_1px_rgba(239,68,68,0.4),_0_2px_6px_rgba(239,68,68,0.3)]'
                      : 'bg-white/[0.02] text-[var(--tx-secondary)] border border-[#2a2a2a] hover:bg-white/[0.06] hover:text-[var(--tx-heading)] hover:border-[#444]'
                  }`}
              >
                {p}
              </button>
            </span>
          );
        })}
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          data-testid="treatment-page-next"
          aria-label="หน้าถัดไป"
          className="min-w-[30px] h-7 px-2.5 text-[11px] rounded-md border border-[#2a2a2a]
            bg-white/[0.02] text-[var(--tx-secondary)] font-bold font-mono
            inline-flex items-center justify-center
            hover:bg-white/[0.06] hover:text-[var(--tx-heading)] hover:border-[#444]
            disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          <ChevronRight size={12} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
