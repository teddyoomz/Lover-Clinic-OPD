// ─── AppointmentHubPagination (2026-07-21) ──────────────────────────────────
// Bottom pager for the appointment-hub list — every tab renders 20 rows/page
// (HUB_PAGE_SIZE) instead of the whole filtered set (past-30 tab hit 270 rows
// on prod = the RAM/paint worst case). Renders nothing when 1 page suffices.
// Numbered window (1 … p-1 p p+1 … last) + prev/next; touch-sized buttons.
import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

function pageWindow(page, totalPages) {
  // Always: first, last, and page±1 — with ellipsis markers ('…') between gaps.
  const wanted = new Set([1, totalPages, page - 1, page, page + 1]);
  const pages = [...wanted].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < pages.length; i++) {
    if (i > 0 && pages[i] - pages[i - 1] > 1) out.push('…');
    out.push(pages[i]);
  }
  return out;
}

export default function AppointmentHubPagination({ page, totalPages, total, start, end, onPageChange }) {
  if (!(totalPages > 1)) return null;
  const go = (p) => { if (p >= 1 && p <= totalPages && p !== page) onPageChange?.(p); };
  return (
    <div className="flex flex-col items-center gap-2 py-4" data-testid="appt-hub-pagination">
      <div className="flex items-center gap-1.5 flex-wrap justify-center">
        <button
          type="button"
          data-testid="appt-hub-page-prev"
          onClick={() => go(page - 1)}
          disabled={page <= 1}
          aria-label="หน้าก่อนหน้า"
          className="min-w-[40px] h-10 px-2 rounded-xl border border-[var(--bd)] text-[var(--tx-primary)] disabled:opacity-35 hover:bg-[var(--bg-hover)] transition-colors flex items-center justify-center"
        >
          <ChevronLeft size={16} />
        </button>
        {pageWindow(page, totalPages).map((p, i) =>
          p === '…' ? (
            <span key={`gap-${i}`} className="px-1 text-xs text-[var(--tx-muted)]" aria-hidden="true">…</span>
          ) : (
            <button
              key={p}
              type="button"
              data-testid={`appt-hub-page-${p}`}
              onClick={() => go(p)}
              aria-current={p === page ? 'page' : undefined}
              className={`min-w-[40px] h-10 px-2 rounded-xl border text-sm font-bold transition-colors ${
                p === page
                  ? 'border-orange-600/60 bg-orange-950/25 text-orange-400'
                  : 'border-[var(--bd)] text-[var(--tx-muted)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              {p}
            </button>
          )
        )}
        <button
          type="button"
          data-testid="appt-hub-page-next"
          onClick={() => go(page + 1)}
          disabled={page >= totalPages}
          aria-label="หน้าถัดไป"
          className="min-w-[40px] h-10 px-2 rounded-xl border border-[var(--bd)] text-[var(--tx-primary)] disabled:opacity-35 hover:bg-[var(--bg-hover)] transition-colors flex items-center justify-center"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <p className="text-[11px] text-[var(--tx-muted)]" data-testid="appt-hub-page-info">
        แสดง {total === 0 ? 0 : start + 1}–{end} จาก {total} รายการ · หน้า {page}/{totalPages}
      </p>
    </div>
  );
}
