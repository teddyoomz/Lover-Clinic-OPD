// ─── Phase 15.4 — Pagination + usePagination shared regression bank ─────────
// Rule C1 extract — both used across 6 panels (Order, Adjust, Transfer,
// Withdrawal, Movement Log, Central PO) per s19 item 1 user EOD message.
//
// Coverage:
//   PG.A — usePagination hook (page state, totalPages math, slice, reset-on-key)
//   PG.B — usePagination clamp-on-shrink (delete items below current page)
//   PG.C — Pagination component render contract (Prev/Next/status/hide-when-1)
//   PG.D — Pagination user interaction (RTL fireEvent → onPageChange called)
//   PG.E — adversarial inputs (null items, negative page, NaN, etc.)
//   PG.F — full-flow simulate (filter changes → list shrinks → page resets)

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import Pagination from '../src/components/backend/Pagination.jsx';
import { usePagination, __DEFAULT_PAGE_SIZE } from '../src/lib/usePagination.js';

const range = (n, mapFn = (i) => i) => Array.from({ length: n }, (_, i) => mapFn(i));

// ============================================================================
describe('Phase 15.4 PG.A — usePagination hook', () => {
  it('PG.A.1 — default page size is 20 (matches user requirement)', () => {
    expect(__DEFAULT_PAGE_SIZE).toBe(20);
  });

  it('PG.A.2 — totalPages = 1 for empty list', () => {
    const { result } = renderHook(() => usePagination([]));
    expect(result.current.totalPages).toBe(1);
    expect(result.current.visibleItems).toEqual([]);
    expect(result.current.totalCount).toBe(0);
  });

  it('PG.A.3 — totalPages = 1 for items <= pageSize', () => {
    const { result } = renderHook(() => usePagination(range(20)));
    expect(result.current.totalPages).toBe(1);
    expect(result.current.visibleItems).toHaveLength(20);
  });

  it('PG.A.4 — totalPages = 2 for items = pageSize + 1', () => {
    const { result } = renderHook(() => usePagination(range(21)));
    expect(result.current.totalPages).toBe(2);
    expect(result.current.visibleItems).toHaveLength(20);
  });

  it('PG.A.5 — totalPages = N for items = N * pageSize', () => {
    const { result } = renderHook(() => usePagination(range(60)));
    expect(result.current.totalPages).toBe(3);
  });

  it('PG.A.6 — visibleItems is the correct slice for page 1', () => {
    const items = range(50, (i) => `item-${i}`);
    const { result } = renderHook(() => usePagination(items));
    expect(result.current.visibleItems).toEqual(items.slice(0, 20));
  });

  it('PG.A.7 — visibleItems updates when setPage changes', () => {
    const items = range(50, (i) => `item-${i}`);
    const { result } = renderHook(() => usePagination(items));
    act(() => result.current.setPage(2));
    expect(result.current.page).toBe(2);
    expect(result.current.visibleItems).toEqual(items.slice(20, 40));
  });

  it('PG.A.8 — last page may have fewer items', () => {
    const items = range(45);
    const { result } = renderHook(() => usePagination(items));
    act(() => result.current.setPage(3));
    expect(result.current.visibleItems).toHaveLength(5); // 40..44
  });

  it('PG.A.9 — custom pageSize honored', () => {
    const items = range(100);
    const { result } = renderHook(() => usePagination(items, { pageSize: 10 }));
    expect(result.current.totalPages).toBe(10);
    expect(result.current.visibleItems).toHaveLength(10);
  });

  it('PG.A.10 — null/undefined items handled defensively', () => {
    const { result: r1 } = renderHook(() => usePagination(null));
    expect(r1.current.totalPages).toBe(1);
    expect(r1.current.visibleItems).toEqual([]);
    const { result: r2 } = renderHook(() => usePagination(undefined));
    expect(r2.current.visibleItems).toEqual([]);
  });
});

// ============================================================================
describe('Phase 15.4 PG.B — usePagination reset + clamp', () => {
  it('PG.B.1 — page resets to 1 when key changes', () => {
    const items = range(60);
    const { result, rerender } = renderHook(
      ({ key }) => usePagination(items, { key }),
      { initialProps: { key: 'A' } }
    );
    act(() => result.current.setPage(3));
    expect(result.current.page).toBe(3);
    rerender({ key: 'B' });
    expect(result.current.page).toBe(1);
  });

  it('PG.B.2 — page does NOT reset when key stays the same', () => {
    const items = range(60);
    const { result, rerender } = renderHook(
      ({ key }) => usePagination(items, { key }),
      { initialProps: { key: 'A' } }
    );
    act(() => result.current.setPage(2));
    rerender({ key: 'A' });
    expect(result.current.page).toBe(2);
  });

  it('PG.B.3 — page clamps when items shrink below current page', () => {
    let items = range(60);
    const { result, rerender } = renderHook(({ data }) => usePagination(data), {
      initialProps: { data: items },
    });
    act(() => result.current.setPage(3));
    expect(result.current.page).toBe(3);
    items = range(15); // shrink to fewer than 1 page
    rerender({ data: items });
    expect(result.current.page).toBe(1);
    expect(result.current.totalPages).toBe(1);
  });
});

// ============================================================================
describe('Phase 15.4 PG.C — Pagination component render', () => {
  it('PG.C.1 — renders nothing when totalPages <= 1', () => {
    const { container } = render(
      <Pagination page={1} totalPages={1} onPageChange={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('PG.C.2 — renders nothing when totalPages = 0 (defensive)', () => {
    const { container } = render(
      <Pagination page={1} totalPages={0} onPageChange={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('PG.C.3 — renders Prev/Next + status when totalPages >= 2', () => {
    render(<Pagination page={1} totalPages={3} onPageChange={() => {}} />);
    expect(screen.getByTestId('pagination-prev')).toBeTruthy();
    expect(screen.getByTestId('pagination-next')).toBeTruthy();
    expect(screen.getByTestId('pagination-status').textContent).toContain('1');
    expect(screen.getByTestId('pagination-status').textContent).toContain('3');
  });

  it('PG.C.4 — Prev disabled at page 1', () => {
    render(<Pagination page={1} totalPages={5} onPageChange={() => {}} />);
    expect(screen.getByTestId('pagination-prev').disabled).toBe(true);
    expect(screen.getByTestId('pagination-next').disabled).toBe(false);
  });

  it('PG.C.5 — Next disabled at last page', () => {
    render(<Pagination page={5} totalPages={5} onPageChange={() => {}} />);
    expect(screen.getByTestId('pagination-prev').disabled).toBe(false);
    expect(screen.getByTestId('pagination-next').disabled).toBe(true);
  });

  it('PG.C.6 — both enabled in the middle', () => {
    render(<Pagination page={3} totalPages={5} onPageChange={() => {}} />);
    expect(screen.getByTestId('pagination-prev').disabled).toBe(false);
    expect(screen.getByTestId('pagination-next').disabled).toBe(false);
  });

  it('PG.C.7 — totalCount displayed when provided', () => {
    render(
      <Pagination page={1} totalPages={5} onPageChange={() => {}} totalCount={97} />
    );
    expect(screen.getByTestId('pagination-status').textContent).toContain('97');
    expect(screen.getByTestId('pagination-status').textContent).toMatch(/รายการ/);
  });

  it('PG.C.8 — totalCount=0 still rendered (not hidden)', () => {
    // totalPages = 1 so component hides anyway, but covers the branch.
    const { container } = render(
      <Pagination page={1} totalPages={2} onPageChange={() => {}} totalCount={0} />
    );
    expect(screen.getByTestId('pagination-status').textContent).toContain('0');
    expect(container.firstChild).toBeTruthy();
  });

  it('PG.C.9 — custom testId prefix applies to all sub-elements', () => {
    render(
      <Pagination page={1} totalPages={2} onPageChange={() => {}} testId="custom-page" />
    );
    expect(screen.getByTestId('custom-page')).toBeTruthy();
    expect(screen.getByTestId('custom-page-prev')).toBeTruthy();
    expect(screen.getByTestId('custom-page-next')).toBeTruthy();
    expect(screen.getByTestId('custom-page-status')).toBeTruthy();
  });

  it('PG.C.10 — Thai copy "หน้า N / M" + "ก่อนหน้า"/"ถัดไป" present', () => {
    render(<Pagination page={2} totalPages={5} onPageChange={() => {}} />);
    expect(screen.getByTestId('pagination-status').textContent).toContain('หน้า');
    expect(screen.getByTestId('pagination-prev').textContent).toContain('ก่อนหน้า');
    expect(screen.getByTestId('pagination-next').textContent).toContain('ถัดไป');
  });
});

// ============================================================================
describe('Phase 15.4 PG.D — Pagination user interaction', () => {
  it('PG.D.1 — clicking Next calls onPageChange(page+1)', () => {
    let captured = null;
    render(<Pagination page={1} totalPages={5} onPageChange={(p) => (captured = p)} />);
    fireEvent.click(screen.getByTestId('pagination-next'));
    expect(captured).toBe(2);
  });

  it('PG.D.2 — clicking Prev calls onPageChange(page-1)', () => {
    let captured = null;
    render(<Pagination page={3} totalPages={5} onPageChange={(p) => (captured = p)} />);
    fireEvent.click(screen.getByTestId('pagination-prev'));
    expect(captured).toBe(2);
  });

  it('PG.D.3 — clicking disabled Prev does not call onPageChange', () => {
    let captured = 'unset';
    render(<Pagination page={1} totalPages={5} onPageChange={(p) => (captured = p)} />);
    fireEvent.click(screen.getByTestId('pagination-prev'));
    expect(captured).toBe('unset');
  });

  it('PG.D.4 — clicking disabled Next does not call onPageChange', () => {
    let captured = 'unset';
    render(<Pagination page={5} totalPages={5} onPageChange={(p) => (captured = p)} />);
    fireEvent.click(screen.getByTestId('pagination-next'));
    expect(captured).toBe('unset');
  });

  it('PG.D.5 — onPageChange not called if not a function (no crash)', () => {
    render(<Pagination page={1} totalPages={5} onPageChange={null} />);
    expect(() => fireEvent.click(screen.getByTestId('pagination-next'))).not.toThrow();
  });
});

// ============================================================================
describe('Phase 15.4 PG.E — adversarial inputs', () => {
  it('PG.E.1 — page > totalPages renders Next disabled (clamped)', () => {
    render(<Pagination page={99} totalPages={5} onPageChange={() => {}} />);
    expect(screen.getByTestId('pagination-next').disabled).toBe(true);
  });

  it('PG.E.2 — negative page treated as page 1', () => {
    render(<Pagination page={-3} totalPages={5} onPageChange={() => {}} />);
    expect(screen.getByTestId('pagination-prev').disabled).toBe(true);
  });

  it('PG.E.3 — NaN page treated as page 1', () => {
    render(<Pagination page={NaN} totalPages={5} onPageChange={() => {}} />);
    expect(screen.getByTestId('pagination-prev').disabled).toBe(true);
  });

  it('PG.E.4 — string-typed numbers handled', () => {
    render(<Pagination page={'2'} totalPages={'5'} onPageChange={() => {}} />);
    expect(screen.getByTestId('pagination-status').textContent).toContain('2');
  });

  it('PG.E.5 — totalPages NaN renders nothing (defensive)', () => {
    const { container } = render(
      <Pagination page={1} totalPages={NaN} onPageChange={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });
});

// ============================================================================
describe('Phase 15.4 PG.F — full-flow simulate (Rule I)', () => {
  it('PG.F.1 — 25 items → page 1 shows 20, click next → page 2 shows 5', () => {
    const items = range(25, (i) => `item-${i}`);
    const { result } = renderHook(() => usePagination(items));
    expect(result.current.visibleItems).toHaveLength(20);
    expect(result.current.visibleItems[0]).toBe('item-0');
    expect(result.current.totalPages).toBe(2);
    act(() => result.current.setPage(2));
    expect(result.current.visibleItems).toHaveLength(5);
    expect(result.current.visibleItems[0]).toBe('item-20');
    expect(result.current.visibleItems[4]).toBe('item-24');
  });

  it('PG.F.2 — filter shrinks items → resets to page 1 + Pagination hides', () => {
    let items = range(60);
    let key = 'all';
    const { result, rerender } = renderHook(
      ({ data, k }) => usePagination(data, { key: k }),
      { initialProps: { data: items, k: key } }
    );
    act(() => result.current.setPage(3));
    expect(result.current.page).toBe(3);
    // Filter to 5 items + change key
    items = range(5);
    key = 'filtered-empty-batch';
    rerender({ data: items, k: key });
    expect(result.current.page).toBe(1); // reset by key change
    expect(result.current.totalPages).toBe(1); // hidden when single page
  });

  it('PG.F.3 — chained interaction: filter → page → filter again resets each time', () => {
    let items = range(100);
    let key = 'A';
    const { result, rerender } = renderHook(
      ({ data, k }) => usePagination(data, { key: k }),
      { initialProps: { data: items, k: key } }
    );
    expect(result.current.totalPages).toBe(5);
    act(() => result.current.setPage(4));
    expect(result.current.page).toBe(4);

    // Filter A
    items = range(40);
    key = 'B';
    rerender({ data: items, k: key });
    expect(result.current.page).toBe(1);
    expect(result.current.totalPages).toBe(2);

    act(() => result.current.setPage(2));
    expect(result.current.visibleItems).toHaveLength(20);

    // Filter B
    items = range(15);
    key = 'C';
    rerender({ data: items, k: key });
    expect(result.current.page).toBe(1);
    expect(result.current.totalPages).toBe(1);
  });

  it('PG.F.4 — empty list edge case produces stable state', () => {
    const { result } = renderHook(() => usePagination([]));
    expect(result.current.page).toBe(1);
    expect(result.current.totalPages).toBe(1);
    expect(result.current.visibleItems).toEqual([]);
    expect(result.current.totalCount).toBe(0);
  });
});
