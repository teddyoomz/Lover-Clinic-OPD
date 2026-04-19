// ─── ReportShell — shared chrome for Phase 10 report tabs ──────────────────
// Mirrors MarketingTabShell pattern (Rule C1 — Rule of 3): all 8 report tabs
// share header (icon + title + subtitle + counts + export button), filter
// row, error banner, loading / empty / no-data states. Tab body (table or
// custom layout) passed via children.
//
// Why a separate shell from MarketingTabShell: marketing has create-button
// + 1-line search; reports have export-button + date-range-picker + variable
// filter row. Different chrome. Same Rule-of-3 principle.

import { Loader2, Download, RefreshCw } from 'lucide-react';
import { hexToRgb } from '../../../utils.js';

/**
 * @param {object} props
 * @param {React.ComponentType} props.icon            — lucide icon for header
 * @param {string} props.title                        — Thai section title
 * @param {string} [props.subtitle]                   — small caption below title
 * @param {number} [props.totalCount]                 — full row count (unfiltered)
 * @param {number} [props.filteredCount]              — filtered row count
 * @param {React.ReactNode} [props.dateRangeSlot]     — DateRangePicker
 * @param {React.ReactNode} [props.filtersSlot]       — extra <select> / <input>
 * @param {() => void} [props.onExport]               — fires CSV export
 * @param {() => void} [props.onRefresh]              — re-fetch data
 * @param {boolean} [props.exportDisabled]            — when filteredCount === 0
 * @param {string} [props.error]
 * @param {boolean} [props.loading]
 * @param {string} [props.emptyText='ยังไม่มีข้อมูล']
 * @param {string} [props.notFoundText='ไม่พบข้อมูลตามตัวกรอง']
 * @param {{ accentColor?: string }} [props.clinicSettings]
 * @param {React.ReactNode} props.children
 */
export default function ReportShell({
  icon: Icon,
  title,
  subtitle = '',
  totalCount,
  filteredCount,
  dateRangeSlot = null,
  filtersSlot = null,
  onExport,
  onRefresh,
  exportDisabled = false,
  error = '',
  loading = false,
  emptyText = 'ยังไม่มีข้อมูล',
  notFoundText = 'ไม่พบข้อมูลตามตัวกรอง',
  clinicSettings,
  children,
}) {
  const ac = clinicSettings?.accentColor || '#06b6d4';
  const acRgb = hexToRgb(ac);
  const showCounts = typeof totalCount === 'number' && typeof filteredCount === 'number';
  const hasItems = (totalCount || 0) > 0;
  const noFilteredItems = (filteredCount || 0) === 0;

  return (
    <div className="space-y-4" data-testid="report-shell">
      {/* Header — typeset 2026-04-19:
          - Title: text-2xl (24px) font-black, NO uppercase / NO wide tracking
            (both wreck Thai script). Color: white (--tx-heading) for max
            readability — accent color carries through the icon chip + title
            underline accent.
          - Icon in an accent-tinted chip on the LEFT (mass + visual mark).
          - Subtitle: text-sm muted, comma-separated facts.
          - 1px accent underline below the chip+title block ties chrome to
            the body table that follows. */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
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
            {(subtitle || showCounts) && (
              <p className="text-sm text-[var(--tx-muted)] mt-1">
                {showCounts && (
                  <>
                    จำนวน {totalCount.toLocaleString('th-TH')} รายการ
                    {filteredCount !== totalCount && (
                      <> · แสดง {filteredCount.toLocaleString('th-TH')} รายการ</>
                    )}
                  </>
                )}
                {subtitle && (
                  <>{showCounts ? ' · ' : ''}{subtitle}</>
                )}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="px-3 py-2 rounded-lg font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all border border-[var(--bd)] bg-[var(--bg-hover)] text-[var(--tx-secondary)] hover:text-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="report-refresh"
              title="โหลดข้อมูลใหม่"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">รีเฟรช</span>
            </button>
          )}
          {onExport && (
            <button
              type="button"
              onClick={onExport}
              disabled={exportDisabled || loading}
              className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all text-white disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: `linear-gradient(135deg, rgba(${acRgb},0.9), rgba(${acRgb},0.7))`,
                boxShadow: `0 0 15px rgba(${acRgb},0.35)`,
              }}
              data-testid="report-export"
            >
              <Download size={14} /> Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Filter row */}
      {(dateRangeSlot || filtersSlot) && (
        <div className="flex items-center gap-3 flex-wrap p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--bd)]">
          {dateRangeSlot}
          {filtersSlot}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-900/30 border border-red-700/50 text-red-300 text-sm" data-testid="report-error">
          {error}
        </div>
      )}

      {/* Body: loading / empty / children */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-[var(--tx-muted)]" data-testid="report-loading">
          <Loader2 size={24} className="animate-spin mr-2" /> กำลังโหลด…
        </div>
      ) : noFilteredItems ? (
        <div className="py-16 text-center text-[var(--tx-muted)] border border-dashed border-[var(--bd)] rounded-lg" data-testid="report-empty">
          {Icon ? <Icon size={32} className="inline mb-2 opacity-50" /> : null}
          <p className="text-sm">{!hasItems ? emptyText : notFoundText}</p>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
