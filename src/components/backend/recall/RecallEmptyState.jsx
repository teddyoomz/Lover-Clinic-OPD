import React from 'react';

/**
 * Phase 29 (2026-05-14) — empty-state card for Recall lists.
 * Shown when no recalls exist (or when filtered/searched list is empty).
 *
 * @param {object} props
 * @param {string} [props.message] override default text
 * @param {string} [props.hint] secondary hint line
 */
export function RecallEmptyState({ message = 'ไม่มี Recall', hint = 'กดปุ่ม + เพื่อเพิ่ม' } = {}) {
  return (
    <div
      data-testid="recall-empty-state"
      className="flex flex-col items-center justify-center py-10 px-4 text-center"
    >
      <div className="text-4xl mb-2 opacity-60" aria-hidden="true">🔔</div>
      <div className="text-[13px] font-bold text-[var(--tx-primary)] mb-1">{message}</div>
      <div className="text-[10px] text-[var(--tx-muted)] italic">{hint}</div>
    </div>
  );
}

export default RecallEmptyState;
