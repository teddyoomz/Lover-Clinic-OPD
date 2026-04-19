// ─── MarketingTabShell — shared chrome for Phase 9 marketing tabs ──────────
// Extracted from PromotionTab / CouponTab / VoucherTab (AV10).
//
// Owns: header (icon + title + counts + create button), filter row (search +
// extra selects), error banner, loading / empty / not-found empty-states.
// Card grid content is passed via `children` so each tab keeps full control
// over its card markup.
//
// Rule C1 (Rule of 3): 3 tabs shared ~60% of the visual scaffolding before
// this extract. Changes to spacing / header / empty copy now happen once.

import { Plus, Search, Loader2 } from 'lucide-react';
import { hexToRgb } from '../../utils.js';

/**
 * @param {object} props
 * @param {React.ComponentType} props.icon — lucide icon used in header + empty state
 * @param {string} props.title — section title ("โปรโมชัน" / "คูปอง" / "Voucher")
 * @param {number} props.totalCount — items.length (unfiltered)
 * @param {number} props.filteredCount — filtered.length
 * @param {string} props.createLabel — text for the create button
 * @param {() => void} props.onCreate
 * @param {string} props.searchValue
 * @param {(v: string) => void} props.onSearchChange
 * @param {string} props.searchPlaceholder
 * @param {React.ReactNode} [props.extraFilters] — additional <select> controls
 * @param {string} [props.error]
 * @param {boolean} props.loading
 * @param {string} props.emptyText — shown when totalCount === 0
 * @param {string} props.notFoundText — shown when totalCount > 0 but filteredCount === 0
 * @param {{ accentColor?: string }} [props.clinicSettings]
 * @param {React.ReactNode} props.children — card grid (rendered only when there are items to show)
 */
export default function MarketingTabShell({
  icon: Icon,
  title,
  totalCount,
  filteredCount,
  createLabel,
  onCreate,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  extraFilters = null,
  error = '',
  loading = false,
  emptyText,
  notFoundText,
  clinicSettings,
  children,
}) {
  const ac = clinicSettings?.accentColor || '#dc2626';
  const acRgb = hexToRgb(ac);
  const hasItems = totalCount > 0;
  const showEmpty = !loading && filteredCount === 0;

  return (
    <div className="space-y-4">
      {/* Header — typeset 2026-04-19: white title at 24px, accent in the
          chip (left) + counts (numbers semibold). Same pattern as
          ReportShell so all backend tabs read with consistent rhythm. */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {Icon && (
            <span
              className="flex-shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-xl mt-0.5"
              style={{
                background: `linear-gradient(135deg, rgba(${acRgb},0.20), rgba(${acRgb},0.06))`,
                border: `1px solid rgba(${acRgb},0.30)`,
                boxShadow: `0 0 16px -4px rgba(${acRgb},0.30)`,
              }}
            >
              <Icon size={20} strokeWidth={2.25} style={{ color: ac }} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2
              className="text-2xl font-black text-[var(--tx-heading)] leading-tight"
              style={{ letterSpacing: '-0.015em' }}
            >
              {title}
            </h2>
            <p className="text-sm text-[var(--tx-muted)] mt-1">
              จำนวน {totalCount} รายการ · แสดง {filteredCount} รายการ
            </p>
          </div>
        </div>
        <button
          onClick={onCreate}
          className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all text-white"
          style={{
            background: `linear-gradient(135deg, rgba(${acRgb},0.9), rgba(${acRgb},0.7))`,
            boxShadow: `0 0 15px rgba(${acRgb},0.35)`,
          }}
        >
          <Plus size={16} /> {createLabel}
        </button>
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tx-muted)]" />
          <input
            type="text"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>
        {extraFilters}
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-900/30 border border-red-700/50 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Body: loading / empty / children */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-[var(--tx-muted)]">
          <Loader2 size={24} className="animate-spin mr-2" /> กำลังโหลด…
        </div>
      ) : showEmpty ? (
        <div className="py-16 text-center text-[var(--tx-muted)] border border-dashed border-[var(--bd)] rounded-lg">
          {!hasItems ? (
            <>
              {Icon ? <Icon size={32} className="inline mb-2 opacity-50" /> : null}
              <p className="text-sm">{emptyText}</p>
            </>
          ) : (
            <p className="text-sm">{notFoundText}</p>
          )}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
