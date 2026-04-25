// ─── Phase 14.7.D — CustomerDetailView treatment-history redesign + pagination
// User report 2026-04-26 (with ProClinic side-by-side screenshot):
// "redesign รายการ ประวัติการรักษา สวยกว่านี้ และแสดงแค่ไม่เกิน 5 อัน
//  ในแต่ละหน้า ให้สามารถเปลี่ยนหน้าเพื่อดูประวัติการรักษาได้ครบ ... ของเรา
//  กากมาก"
//
// Source-grep regression guards (Rule D / Rule I — full-flow simulate):
//  H1: shared module exports + state hooks landed
//  H2: pagination wiring (5-per-page, clamped, page-numbers, prev/next, ellipsis)
//  H3: ProClinic-fidelity card layout (data-testid + visible action chips +
//      empty state + ล่าสุด badge for newest entry)
//  H4: ดูไทม์ไลน์ button placeholder wired (Phase 14.7.E gate)
//  H5: edge cases — auto-clamp page on shrink, auto-collapse expanded row
//      when it scrolls off page
//  H6: pure pagination math invariants

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const READ = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const SRC = READ('src/components/backend/CustomerDetailView.jsx');

// ─── Pure pagination math (mirror inline logic so the test can chain) ──────

function paginate(list, pageSize, page) {
  const total = Math.max(1, Math.ceil(list.length / pageSize));
  const clamped = Math.min(Math.max(1, page), total);
  const start = (clamped - 1) * pageSize;
  return { items: list.slice(start, start + pageSize), totalPages: total, page: clamped };
}

function pageNumbers(total, current) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const candidates = [1, current - 1, current, current + 1, total]
    .filter(p => p >= 1 && p <= total);
  return Array.from(new Set(candidates)).sort((a, b) => a - b);
}

describe('H1: pagination state + constants', () => {
  it('H1.1: TREATMENT_PAGE_SIZE = 5 const declared', () => {
    expect(SRC).toMatch(/const\s+TREATMENT_PAGE_SIZE\s*=\s*5/);
  });

  it('H1.2: treatmentPage state hook present', () => {
    expect(SRC).toMatch(/const\s*\[\s*treatmentPage,\s*setTreatmentPage\s*\]\s*=\s*useState\(\s*1\s*\)/);
  });

  it('H1.3: ChevronLeft + ChevronRight icons imported (for pagination buttons)', () => {
    expect(SRC).toMatch(/ChevronLeft/);
    expect(SRC).toMatch(/ChevronRight/);
  });

  it('H1.4: paginatedTreatments slices treatmentSummary by current page', () => {
    expect(SRC).toMatch(/paginatedTreatments\s*=\s*useMemo/);
    expect(SRC).toMatch(/treatmentSummary\.slice\(start,\s*start\s*\+\s*TREATMENT_PAGE_SIZE\)/);
  });

  it('H1.5: treatmentTotalPages computed via Math.ceil', () => {
    expect(SRC).toMatch(/treatmentTotalPages\s*=\s*Math\.max\(1,\s*Math\.ceil\(treatmentSummary\.length\s*\/\s*TREATMENT_PAGE_SIZE\)\)/);
  });

  it('H1.6: treatmentPageNumbers helper produces compact list (≤7 → all, else 1/current±1/total)', () => {
    expect(SRC).toMatch(/treatmentPageNumbers\s*=\s*useMemo/);
    expect(SRC).toMatch(/treatmentTotalPages\s*<=\s*7/);
  });

  it('H1.7: auto-clamp effect resets to page 1 when totalPages < currentPage', () => {
    expect(SRC).toMatch(/if\s*\(\s*treatmentPage\s*>\s*treatmentTotalPages\s*\)\s*setTreatmentPage\(\s*1\s*\)/);
  });

  it('H1.8: auto-collapse effect un-expands rows that scroll off the current page', () => {
    expect(SRC).toMatch(/expandedTreatment\s*&&\s*!paginatedTreatments\.some\(t\s*=>\s*t\.id\s*===\s*expandedTreatment\)/);
    expect(SRC).toMatch(/setExpandedTreatment\(\s*null\s*\)/);
  });
});

describe('H2: ProClinic-fidelity rendering wiring', () => {
  it('H2.1: treatment-history card has stable testid', () => {
    expect(SRC).toMatch(/data-testid="treatment-history-card"/);
  });

  it('H2.2: empty state renders dedicated testid + Thai copy', () => {
    expect(SRC).toMatch(/data-testid="treatment-history-empty"/);
    expect(SRC).toMatch(/ยังไม่มีประวัติการรักษา/);
    expect(SRC).toMatch(/บันทึกการรักษา/); // hint copy in empty state mentions the CTA
  });

  it('H2.3: list renders paginatedTreatments (NOT raw treatmentSummary)', () => {
    expect(SRC).toMatch(/paginatedTreatments\.map\(/);
    expect(SRC).not.toMatch(/treatmentSummary\.map\(/);
  });

  it('H2.4: per-row testids (treatment-row + treatment-toggle + treatment-edit/delete) exposed', () => {
    expect(SRC).toMatch(/data-testid=\{`treatment-row-\$\{t\.id\}`\}/);
    expect(SRC).toMatch(/data-testid=\{`treatment-toggle-\$\{t\.id\}`\}/);
    expect(SRC).toMatch(/data-testid=\{`treatment-edit-\$\{t\.id\}`\}/);
    expect(SRC).toMatch(/data-testid=\{`treatment-delete-\$\{t\.id\}`\}/);
  });

  it('H2.5: globalIndex = (treatmentPage - 1) * TREATMENT_PAGE_SIZE + pageIndex (correct latest-marker on multi-page)', () => {
    expect(SRC).toMatch(/globalIndex\s*=\s*\(treatmentPage\s*-\s*1\)\s*\*\s*TREATMENT_PAGE_SIZE\s*\+\s*pageIndex/);
  });

  it('H2.6: latest entry shows ล่าสุด badge keyed on globalIndex === 0', () => {
    expect(SRC).toMatch(/globalIndex\s*===\s*0/);
    expect(SRC).toMatch(/ล่าสุด/);
  });

  it('H2.7: action chips (edit/delete) are aria-labeled + stop-propagation on click', () => {
    expect(SRC).toMatch(/aria-label="แก้ไขการรักษา"/);
    expect(SRC).toMatch(/aria-label="ลบการรักษา"/);
    expect(SRC).toMatch(/e\.stopPropagation\(\);\s*onEditTreatment/);
    expect(SRC).toMatch(/e\.stopPropagation\(\);\s*onDeleteTreatment/);
  });

  it('H2.8: per-treatment dual print buttons (Phase 14.2.B) preserved in expanded state', () => {
    expect(SRC).toMatch(/data-testid=\{`treatment-print-cert-\$\{t\.id\}`\}/);
    expect(SRC).toMatch(/data-testid=\{`treatment-print-record-\$\{t\.id\}`\}/);
    expect(SRC).toMatch(/พิมพ์ใบรับรองแพทย์/);
    expect(SRC).toMatch(/พิมพ์การรักษา/);
  });
});

describe('H3: header CTAs (พิมพ์เอกสาร / บันทึกการรักษา / ดูไทม์ไลน์)', () => {
  it('H3.1: print-document button kept (purple variant)', () => {
    expect(SRC).toMatch(/data-testid="print-document-btn"/);
    expect(SRC).toMatch(/พิมพ์เอกสาร/);
  });

  it('H3.2: create-treatment renamed บันทึกการรักษา in BUTTON copy (matches ProClinic)', () => {
    expect(SRC).toMatch(/data-testid="create-treatment-btn"/);
    // The button itself uses the new copy. Other places in the file may still
    // reference the old "หน้าสร้างการรักษา" page label as a hint string —
    // unrelated and out of scope for this rename.
    expect(SRC).toMatch(/data-testid="create-treatment-btn"[\s\S]{0,400}บันทึกการรักษา/);
  });

  it('H3.3: ดูไทม์ไลน์ button placeholder wired with onShowTimeline prop', () => {
    expect(SRC).toMatch(/data-testid="show-timeline-btn"/);
    expect(SRC).toMatch(/ดูไทม์ไลน์/);
    expect(SRC).toMatch(/onShowTimeline\?\.\(\)/);
    expect(SRC).toMatch(/disabled=\{!onShowTimeline\}/);
  });

  it('H3.4: onShowTimeline received in component signature', () => {
    expect(SRC).toMatch(/onShowTimeline,?\s*\}/);
  });
});

describe('H4: pagination footer rendering + a11y', () => {
  it('H4.1: footer wraps in data-testid only when ≥2 pages', () => {
    expect(SRC).toMatch(/data-testid="treatment-history-pagination"/);
    expect(SRC).toMatch(/treatmentTotalPages\s*>\s*1\s*&&/);
  });

  it('H4.2: page-number buttons keyed on page + aria-current="page" on active', () => {
    expect(SRC).toMatch(/data-testid=\{`treatment-page-\$\{p\}`\}/);
    expect(SRC).toMatch(/aria-current=\{p\s*===\s*treatmentPage\s*\?\s*['"]page['"]\s*:\s*undefined\}/);
  });

  it('H4.3: prev/next buttons disabled at boundaries + Thai aria-labels', () => {
    expect(SRC).toMatch(/data-testid="treatment-page-prev"/);
    expect(SRC).toMatch(/data-testid="treatment-page-next"/);
    expect(SRC).toMatch(/aria-label="หน้าก่อนหน้า"/);
    expect(SRC).toMatch(/aria-label="หน้าถัดไป"/);
    expect(SRC).toMatch(/disabled=\{treatmentPage\s*===\s*1\}/);
    expect(SRC).toMatch(/disabled=\{treatmentPage\s*===\s*treatmentTotalPages\}/);
  });

  it('H4.4: range label shows "แสดง X–Y จาก N" + clamped end', () => {
    expect(SRC).toMatch(/แสดง/);
    expect(SRC).toMatch(/Math\.min\(treatmentPage\s*\*\s*TREATMENT_PAGE_SIZE,\s*treatmentSummary\.length\)/);
  });

  it('H4.5: ellipsis renders between non-adjacent page-number entries', () => {
    expect(SRC).toMatch(/p\s*-\s*prev\s*>\s*1/);
    expect(SRC).toMatch(/…/);
  });
});

describe('H5: pure pagination math invariants', () => {
  it('H5.1: empty list → 1 total page, empty items', () => {
    const { items, totalPages, page } = paginate([], 5, 1);
    expect(items).toEqual([]);
    expect(totalPages).toBe(1);
    expect(page).toBe(1);
  });

  it('H5.2: 5 items → 1 page (boundary)', () => {
    const list = [1, 2, 3, 4, 5];
    expect(paginate(list, 5, 1).totalPages).toBe(1);
  });

  it('H5.3: 6 items → 2 pages', () => {
    const list = [1, 2, 3, 4, 5, 6];
    const r = paginate(list, 5, 2);
    expect(r.totalPages).toBe(2);
    expect(r.items).toEqual([6]);
  });

  it('H5.4: page > total clamps to total (we set to 1 in component, but math allows clamping)', () => {
    const list = [1, 2, 3, 4, 5, 6];
    const r = paginate(list, 5, 99);
    // paginate helper clamps to total — component has its own auto-reset effect.
    expect(r.page).toBeLessThanOrEqual(r.totalPages);
  });

  it('H5.5: page <= 0 clamps to 1', () => {
    const r = paginate([1, 2, 3], 5, 0);
    expect(r.page).toBe(1);
  });

  it('H5.6: 122 items / 5 per page = 25 pages (matches user screenshot)', () => {
    const list = Array.from({ length: 122 }, (_, i) => i);
    expect(paginate(list, 5, 1).totalPages).toBe(25);
  });

  it('H5.7: pageNumbers compact form for 25 pages, current=1 → [1, 2, 25]', () => {
    expect(pageNumbers(25, 1)).toEqual([1, 2, 25]);
  });

  it('H5.8: pageNumbers compact form for 25 pages, current=13 → [1, 12, 13, 14, 25]', () => {
    expect(pageNumbers(25, 13)).toEqual([1, 12, 13, 14, 25]);
  });

  it('H5.9: pageNumbers compact form for 25 pages, current=25 → [1, 24, 25]', () => {
    expect(pageNumbers(25, 25)).toEqual([1, 24, 25]);
  });

  it('H5.10: pageNumbers shows all when total ≤ 7', () => {
    expect(pageNumbers(7, 4)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(pageNumbers(1, 1)).toEqual([1]);
  });

  it('H5.11: pageNumbers de-dupes when current is at edge (current=2 of 25 → 1, 2, 3, 25)', () => {
    expect(pageNumbers(25, 2)).toEqual([1, 2, 3, 25]);
  });
});

describe('H6: legacy footprint stripped', () => {
  it('H6.1: button with create-treatment-btn testid no longer carries old "สร้างการรักษา" copy', () => {
    // Only assert about the specific button — other places (hint copy in
    // customerSales rendering) may still reference "หน้าสร้างการรักษา" by
    // page name, which is intentional and unrelated to this rename.
    expect(SRC).not.toMatch(/data-testid="create-treatment-btn"[\s\S]{0,400}สร้างการรักษา/);
  });

  it('H6.2: old "ไม่มีประวัติการรักษา" copy replaced with "ยังไม่มี"', () => {
    expect(SRC).toMatch(/ยังไม่มีประวัติการรักษา/);
  });

  it('H6.3: no raw treatmentSummary.map in render path (must go through paginatedTreatments)', () => {
    // Allow useMemo computations to reference treatmentSummary, just not .map() directly
    const renderRegion = SRC.match(/return\s*\([\s\S]+/);
    if (renderRegion) {
      expect(renderRegion[0]).not.toMatch(/treatmentSummary\.map\(/);
    }
  });
});
