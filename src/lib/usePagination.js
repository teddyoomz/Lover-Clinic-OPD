// ─── usePagination — shared pagination hook ─────────────────────────────────
// Phase 15.4 (2026-04-28) — Rule C1 Rule-of-3.
//
// User directive (s19 item 1, verbatim):
//   "ทุกรายการในทุก tab ของหน้าสต็อคและคลังกลาง รายการล่าสุดอยู่บนสุด
//    และแสดงไม่เกิน 20 รายการในแต่ละหน้า"
//
// Apply across all stock + central-stock list panels (Order, Adjust, Transfer,
// Withdrawal, Movement Log, Central PO). 20/page, recent-first sort.
//
// Why a hook + component (not just sliced render): the hook owns page state
// + reset-on-filter-change + slice math; the component owns the Prev/Next
// UI. Separation lets a panel customize the position/styling of the controls
// without duplicating the math.
//
// Reset semantics: when the `key` option changes (filter/sort/search state
// fingerprint serialized to a string), page resets to 1. Without this,
// filtering from "list 200" → "list 5" could leave page=10 showing nothing.
//
// Defensive: empty/null items returns visibleItems=[], page=1, totalPages=1.
// Component below this hides when totalPages <= 1 — so callers don't need
// to gate the render themselves.

import { useEffect, useMemo, useState } from 'react';

const DEFAULT_PAGE_SIZE = 20;

/**
 * @param {Array} items — full list (post-filter/sort, pre-paginate)
 * @param {Object} [opts]
 * @param {number} [opts.pageSize=20] — items per page
 * @param {string} [opts.key] — fingerprint string; when it changes, page resets to 1
 * @returns {{page: number, setPage: Function, totalPages: number, visibleItems: Array, pageSize: number, totalCount: number}}
 */
export function usePagination(items, { pageSize = DEFAULT_PAGE_SIZE, key } = {}) {
  const [page, setPage] = useState(1);

  const totalCount = Array.isArray(items) ? items.length : 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Reset to page 1 when filters change (key fingerprint).
  useEffect(() => {
    setPage(1);
  }, [key]);

  // Clamp page when items shrink below current page (e.g. delete N items).
  // Functional updater avoids race with the key-reset effect above when both
  // fire in the same render cycle: the clamp reads the freshly-queued page.
  useEffect(() => {
    setPage((current) => (current > totalPages ? totalPages : current));
  }, [totalPages]);

  const visibleItems = useMemo(() => {
    if (!Array.isArray(items)) return [];
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  return {
    page,
    setPage,
    totalPages,
    visibleItems,
    pageSize,
    totalCount,
  };
}

export const __DEFAULT_PAGE_SIZE = DEFAULT_PAGE_SIZE;
