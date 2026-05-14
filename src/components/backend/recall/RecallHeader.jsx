import React from 'react';
import { Search, Plus, Filter, PhoneCall } from 'lucide-react';

/**
 * Phase 29 (2026-05-14) — Backend RecallTab header.
 * Per spec §4.1: title + count + search + filter + "+ ตั้ง Recall ใหม่" button.
 *
 * @param {object} props
 * @param {number} props.count total recalls (after current filter)
 * @param {string} props.search query string
 * @param {function} props.onSearchChange (q) => void
 * @param {function} [props.onOpenFilter] () => void — opens filter popover (out of scope MVP)
 * @param {function} props.onOpenCreate () => void
 */
export function RecallHeader({ count = 0, search = '', onSearchChange, onOpenFilter, onOpenCreate }) {
  return (
    <div
      className="flex items-center gap-2 px-4 py-3 border-b border-[var(--bd)] bg-[var(--bg-card)]/50 sticky top-0 z-10"
      data-testid="recall-header"
    >
      {/* Icon tile (Phase 28 DNA — fire-red gradient) */}
      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center flex-shrink-0">
        <PhoneCall size={14} className="text-white" />
      </div>

      {/* Title + count */}
      <h2 className="text-sm font-bold text-[var(--tx-primary)]">Recall</h2>
      <span
        className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-300 border border-red-500/30 font-bold"
        data-testid="recall-header-count"
      >
        {count}
      </span>

      {/* Search */}
      <div className="relative ml-auto max-w-[200px] flex-1">
        <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--tx-muted)] pointer-events-none" />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange?.(e.target.value)}
          placeholder="ค้นหา (ชื่อ / HN / เหตุผล)"
          data-testid="recall-header-search"
          className="w-full pl-7 pr-2 py-1.5 rounded-lg text-xs bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]"
        />
      </div>

      {/* Filter (placeholder — future MVP+) */}
      {onOpenFilter && (
        <button
          type="button"
          onClick={onOpenFilter}
          data-testid="recall-header-filter"
          className="px-2.5 py-1.5 rounded-lg text-[11px] bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-muted)] hover:bg-[var(--bg-hover)] flex items-center gap-1"
        >
          <Filter size={11} />
          ตัวกรอง
        </button>
      )}

      {/* Create */}
      <button
        type="button"
        onClick={onOpenCreate}
        data-testid="recall-header-create"
        className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-white bg-red-600 hover:bg-red-500 flex items-center gap-1"
      >
        <Plus size={11} />
        ตั้ง Recall ใหม่
      </button>
    </div>
  );
}

export default RecallHeader;
