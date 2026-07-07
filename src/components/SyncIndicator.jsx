// SyncIndicator — tiny amber pulse shown while a staff surface is displaying
// stale-while-revalidate CACHE data that the server has not yet confirmed.
// B2 (2026-07-07 instant cold-start, spec Q1=A). Disappears the moment the
// server leg lands. Amber (NOT red — rule 04: red is reserved away from
// names/HN and reads as "error"; this is "informing", not alarming).
import React from 'react';

export default function SyncIndicator({ show }) {
  if (!show) return null;
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-500/90"
      data-testid="sync-indicator"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" aria-hidden="true" />
      กำลังซิงค์…
    </span>
  );
}
