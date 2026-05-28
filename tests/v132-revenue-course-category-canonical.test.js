// V132 (2026-05-28) — reports-revenue course หมวดหมู่ = "ไม่ระบุ" for all rows.
// Root cause (Rule R real-prod confirmed): aggregator + RevenueAnalysisTab read
// legacy `category_name || category` from RAW canonical be_courses docs that
// store `courseCategory` (380/385 populated, 31 real categories). Both legacy
// fields absent → 'ไม่ระบุ'. procedureType resolved (canonical `procedureType`
// matched the fallback) — explaining why only หมวดหมู่ broke. Fix: canonical-first
// resolvers (courseDisplayResolvers.js) read live be_courses.courseCategory →
// real categories surface + ANY future category flows through with no code change.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  resolveCourseCategory,
  resolveCourseProcedureType,
  resolveCourseDisplayName,
} from '../src/lib/courseDisplayResolvers.js';
import { aggregateRevenueByProcedure } from '../src/lib/revenueAnalysisAggregator.js';

const AGG_SRC = readFileSync('src/lib/revenueAnalysisAggregator.js', 'utf8');
const TAB_SRC = readFileSync('src/components/backend/reports/RevenueAnalysisTab.jsx', 'utf8');

// A canonical be_courses doc exactly as listCourses() returns it (V38 spread +
// normalizeCourse fields). courseCategory/procedureType — NO category/category_name.
const canonicalCourse = (over = {}) => ({
  id: 'C-1', courseId: 'C-1', courseName: 'Botox 50u',
  courseCategory: 'Botox', procedureType: 'หัตถการ Botox',
  salePrice: 5000, ...over,
});
const saleWithCourse = (courseId, name, over = {}) => ({
  id: 'S-1', saleId: 'INV-1', saleDate: '2026-05-20', status: 'completed',
  items: { courses: [{ id: courseId, name, qty: 1, lineTotal: 5000 }] },
  billing: {}, ...over,
});

describe('V132 A — resolveCourseCategory canonical-first', () => {
  it('A1 reads canonical courseCategory', () => {
    expect(resolveCourseCategory({ courseCategory: 'Filler' })).toBe('Filler');
  });
  it('A2 falls back to legacy category_name (master_data)', () => {
    expect(resolveCourseCategory({ category_name: 'PRP' })).toBe('PRP');
  });
  it('A3 falls back to mapper course_category / category', () => {
    expect(resolveCourseCategory({ course_category: 'IV Drip' })).toBe('IV Drip');
    expect(resolveCourseCategory({ category: 'Lab' })).toBe('Lab');
  });
  it('A4 canonical wins over legacy when both present', () => {
    expect(resolveCourseCategory({ courseCategory: 'ขลิบ', category: 'OLD', category_name: 'OLD2' })).toBe('ขลิบ');
  });
  it('A5 empty / null / non-string / whitespace → ""', () => {
    expect(resolveCourseCategory(null)).toBe('');
    expect(resolveCourseCategory(undefined)).toBe('');
    expect(resolveCourseCategory({})).toBe('');
    expect(resolveCourseCategory({ courseCategory: '   ' })).toBe('');
    expect(resolveCourseCategory({ courseCategory: 42 })).toBe('42');
    expect(resolveCourseCategory('nope')).toBe('');
  });
  it('A6 Thai / emoji / long category preserved', () => {
    expect(resolveCourseCategory({ courseCategory: 'ฮอร์โมนเพศชาย 💉' })).toBe('ฮอร์โมนเพศชาย 💉');
  });
});

describe('V132 B — resolveCourseProcedureType + resolveCourseDisplayName', () => {
  it('B1 procedureType canonical-first + legacy fallback', () => {
    expect(resolveCourseProcedureType({ procedureType: 'หัตถการทั่วไป' })).toBe('หัตถการทั่วไป');
    expect(resolveCourseProcedureType({ procedure_type_name: 'หัตถการดมยาสลบ' })).toBe('หัตถการดมยาสลบ');
    expect(resolveCourseProcedureType({})).toBe('');
  });
  it('B2 displayName canonical courseName first', () => {
    expect(resolveCourseDisplayName({ courseName: 'Botox 50u' })).toBe('Botox 50u');
    expect(resolveCourseDisplayName({ name: 'legacy name' })).toBe('legacy name');
    expect(resolveCourseDisplayName({})).toBe('');
  });
});

describe('V132 C — aggregator surfaces REAL category (was the bug)', () => {
  it('C1 row.category = real courseCategory, NOT ไม่ระบุ', () => {
    const out = aggregateRevenueByProcedure([saleWithCourse('C-1', 'Botox 50u')], [canonicalCourse()], {});
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].category).toBe('Botox');           // ← FAILS pre-fix (ไม่ระบุ)
    expect(out.rows[0].procedureType).toBe('หัตถการ Botox');
  });
  it('C2 categorySummary carries the real category', () => {
    const out = aggregateRevenueByProcedure([saleWithCourse('C-1', 'Botox 50u')], [canonicalCourse()], {});
    expect(out.meta.categorySummary.map(c => c.category)).toContain('Botox');
    expect(out.meta.categorySummary.map(c => c.category)).not.toContain('ไม่ระบุ');
  });
  it('C3 category filter matches the real category', () => {
    const courses = [canonicalCourse(), canonicalCourse({ id: 'C-2', courseId: 'C-2', courseName: 'PRP', courseCategory: 'PRP' })];
    const sales = [saleWithCourse('C-1', 'Botox 50u'), saleWithCourse('C-2', 'PRP', { id: 'S-2', saleId: 'INV-2', items: { courses: [{ id: 'C-2', name: 'PRP', qty: 1, lineTotal: 3000 }] } })];
    const out = aggregateRevenueByProcedure(sales, courses, { category: 'PRP' });
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].category).toBe('PRP');
  });
});

describe('V132 D — FUTURE category flows through automatically (user requirement)', () => {
  it('D1 a brand-new category never hardcoded anywhere surfaces in rows + summary', () => {
    const future = 'หมวดหมู่อนาคต-2099 ✨'; // never seen before, no enum lists it
    const out = aggregateRevenueByProcedure(
      [saleWithCourse('C-NEW', 'New Service')],
      [canonicalCourse({ id: 'C-NEW', courseId: 'C-NEW', courseName: 'New Service', courseCategory: future, procedureType: 'หัตถการแบบใหม่' })],
      {},
    );
    expect(out.rows[0].category).toBe(future);
    expect(out.rows[0].procedureType).toBe('หัตถการแบบใหม่');
    expect(out.meta.categorySummary.map(c => c.category)).toContain(future);
  });
});

describe('V132 E — name-fallback join works on raw canonical docs', () => {
  it('E1 sale item with only a name joins by courseName → category resolves', () => {
    // No id on the sale item → must join by NAME key (built from courseName, not c.name)
    const out = aggregateRevenueByProcedure(
      [saleWithCourse('', 'Botox 50u')],
      [canonicalCourse()],
      {},
    );
    expect(out.rows[0].category).toBe('Botox');           // ← FAILS pre-fix (name key used c.name = undefined)
  });
});

describe('V132 F — source-grep regression locks', () => {
  it('F1 aggregator imports the canonical resolvers', () => {
    expect(AGG_SRC).toMatch(/from '\.\/courseDisplayResolvers\.js'/);
    expect(AGG_SRC).toMatch(/resolveCourseCategory/);
    expect(AGG_SRC).toMatch(/resolveCourseProcedureType/);
  });
  it('F2 aggregator no longer reads bare category_name||category without courseCategory', () => {
    // the old broken line `doc?.category_name || doc?.category` must be gone
    expect(AGG_SRC).not.toMatch(/doc\?\.category_name\s*\|\|\s*doc\?\.category\b/);
  });
  it('F3 buildCourseIndex name-key reads canonical courseName', () => {
    expect(AGG_SRC).toMatch(/courseName/);
  });
  it('F4 RevenueAnalysisTab dropdowns use the canonical resolvers', () => {
    expect(TAB_SRC).toMatch(/from '\.\.\/\.\.\/\.\.\/lib\/courseDisplayResolvers\.js'/);
    expect(TAB_SRC).toMatch(/resolveCourseCategory/);
    expect(TAB_SRC).toMatch(/resolveCourseProcedureType/);
  });
  it('F5 tab no longer reads bare category_name||category for the dropdown', () => {
    expect(TAB_SRC).not.toMatch(/c\?\.category_name\s*\|\|\s*c\?\.category\b/);
  });
});
