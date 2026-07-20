// @vitest-environment jsdom
// ─── appt-hub-pagination (2026-07-21) ───────────────────────────────────────
// User report: the "ย้อนหลัง 30 วัน" tab rendered ALL rows at once (270 glow
// cards on prod) → RAM/paint worst case + the iOS white-scroll surface.
// Directive: EVERY hub tab shows 20 rows/page with a bottom pager.
// Pagination is RENDER-side only — the shared wide SWR fetch keeps feeding
// tab counts/badges + print, which MUST keep consuming the FULL list.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { paginateAppts, HUB_PAGE_SIZE } from '../src/lib/appointmentHubFilters.js';
import AppointmentHubPagination from '../src/components/admin/AppointmentHubPagination.jsx';

const ROOT = join(__dirname, '..');
const hub = readFileSync(join(ROOT, 'src/components/admin/AppointmentHubView.jsx'), 'utf8');
const mk = (n) => Array.from({ length: n }, (_, i) => ({ id: `A${i}` }));

describe('HP1 — paginateAppts (pure)', () => {
  it('HP1.1 page size defaults to 20; slices correctly', () => {
    expect(HUB_PAGE_SIZE).toBe(20);
    const p1 = paginateAppts(mk(270), 1);
    expect(p1.pageItems.length).toBe(20);
    expect(p1.pageItems[0].id).toBe('A0');
    expect(p1.totalPages).toBe(14);
    expect(p1.total).toBe(270);
    const p2 = paginateAppts(mk(270), 2);
    expect(p2.pageItems[0].id).toBe('A20');
    expect(p2.start).toBe(20);
    expect(p2.end).toBe(40);
  });

  it('HP1.2 last page carries the remainder', () => {
    const last = paginateAppts(mk(270), 14);
    expect(last.pageItems.length).toBe(10); // 270 = 13×20 + 10
    expect(last.end).toBe(270);
  });

  it('HP1.3 self-clamps: over-range page → last page (list shrank mid-view)', () => {
    const p = paginateAppts(mk(30), 99);
    expect(p.safePage).toBe(2);
    expect(p.pageItems.length).toBe(10);
  });

  it('HP1.4 garbage page inputs resolve to page 1', () => {
    for (const bad of [0, -5, NaN, undefined, null, 'x']) {
      expect(paginateAppts(mk(50), bad).safePage).toBe(1);
    }
  });

  it('HP1.5 empty / non-array lists never throw; ≤20 items = single page', () => {
    expect(paginateAppts([], 1)).toMatchObject({ totalPages: 1, total: 0, pageItems: [] });
    expect(paginateAppts(null, 3).pageItems).toEqual([]);
    expect(paginateAppts(mk(20), 1).totalPages).toBe(1);
    expect(paginateAppts(mk(21), 1).totalPages).toBe(2);
  });
});

describe('HP2 — AppointmentHubPagination component (RTL)', () => {
  const renderPager = (props) => render(
    <AppointmentHubPagination
      page={1} totalPages={14} total={270} start={0} end={20} onPageChange={() => {}}
      {...props}
    />
  );

  it('HP2.1 renders NOTHING when a single page suffices (≤20 rows)', () => {
    cleanup();
    renderPager({ totalPages: 1, total: 12, end: 12 });
    expect(screen.queryByTestId('appt-hub-pagination')).toBeNull();
  });

  it('HP2.2 numbered window with ellipsis + info line', () => {
    cleanup();
    renderPager({ page: 7, start: 120, end: 140 });
    expect(screen.getByTestId('appt-hub-page-1')).toBeTruthy();
    expect(screen.getByTestId('appt-hub-page-6')).toBeTruthy();
    expect(screen.getByTestId('appt-hub-page-7')).toBeTruthy();
    expect(screen.getByTestId('appt-hub-page-8')).toBeTruthy();
    expect(screen.getByTestId('appt-hub-page-14')).toBeTruthy();
    expect(screen.queryByTestId('appt-hub-page-3')).toBeNull(); // inside the gap
    expect(screen.getByTestId('appt-hub-page-info').textContent).toContain('แสดง 121–140 จาก 270');
    expect(screen.getByTestId('appt-hub-page-info').textContent).toContain('หน้า 7/14');
  });

  it('HP2.3 prev disabled on page 1; next disabled on the last page', () => {
    cleanup();
    renderPager({ page: 1 });
    expect(screen.getByTestId('appt-hub-page-prev').disabled).toBe(true);
    expect(screen.getByTestId('appt-hub-page-next').disabled).toBe(false);
    cleanup();
    renderPager({ page: 14, start: 260, end: 270 });
    expect(screen.getByTestId('appt-hub-page-next').disabled).toBe(true);
  });

  it('HP2.4 clicking a page / next fires onPageChange with the target page', () => {
    cleanup();
    const onPageChange = vi.fn();
    renderPager({ page: 2, start: 20, end: 40, onPageChange });
    fireEvent.click(screen.getByTestId('appt-hub-page-next'));
    expect(onPageChange).toHaveBeenCalledWith(3);
    fireEvent.click(screen.getByTestId('appt-hub-page-14'));
    expect(onPageChange).toHaveBeenCalledWith(14);
    fireEvent.click(screen.getByTestId('appt-hub-page-2'));
    expect(onPageChange).toHaveBeenCalledTimes(2); // current page = no-op
  });
});

describe('HP3 — HubView wiring locks (source-grep)', () => {
  it('HP3.1 the row-card map consumes the PAGED list (old full-list map gone)', () => {
    expect(hub).toMatch(/pagedAppts\.pageItems\.map\(a =>/);
    expect(hub).not.toMatch(/filteredAppts\.map\(a =>/);
  });

  it('HP3.2 page resets on tab/sub-pill/search/filters/branch change', () => {
    expect(hub).toMatch(/setApptPage\(1\);\s*\n\s*\}, \[activeTab, todaySubPill, search, typeFilter, statusFilter, selectedBranchId\]\)/);
  });

  it('HP3.3 counts + filter-bar total + PRINT keep the FULL filtered list (anti-regression)', () => {
    expect(hub).toMatch(/resultCount=\{filteredAppts\.length\}/);
    expect(hub).toMatch(/buildPrintRows\(\{ appts: filteredAppts, summaryMap \}\)/);
  });

  it('HP3.4 pager wired at the bottom + scroll anchor jump on page change', () => {
    expect(hub).toMatch(/<AppointmentHubPagination/);
    expect(hub).toMatch(/page=\{pagedAppts\.safePage\}/);
    expect(hub).toMatch(/listTopRef\.current\?\.scrollIntoView/);
    expect(hub).toMatch(/<div ref=\{listTopRef\} aria-hidden="true" \/>/);
  });
});
