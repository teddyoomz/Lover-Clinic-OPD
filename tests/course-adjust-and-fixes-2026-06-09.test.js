// 2026-06-09 batch — regression tests for 4 fixes:
//  C1 แก้คงเหลือ (ลด/เพิ่ม) + the Issue-4 wrong-course INDEX fix
//  C3 stock movement → clickable customer link
//  C4 course-use history shows the OPD editor, not the doctor
// (C2 treatment-count has its own tests/treatment-delete-customer-id-resolution.test.js)
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { groupCustomerCoursesForDetailView } from '../src/lib/treatmentBuyHelpers.js';
import { parseQtyString } from '../src/lib/courseUtils.js';

const SRC = (p) => readFileSync(path.resolve(process.cwd(), p), 'utf8');
const remaining = (qty) => Number(parseQtyString(qty).remaining) || 0;

describe('C1 — index fix: groupCustomerCoursesForDetailView preserves the TRUE customer.courses index', () => {
  // Reproduces LC-26000114: a used-up (0/1) sub-item filtered out of activeCourses
  // must NOT shift the indices of later courses. entry.originalIndex is consumed
  // as a customer.courses index by adjustCourseRemainingQty / exchange / share.
  const courses = [
    { name: 'Shock Wave 12 ครั้ง', product: 'Shock wave', qty: '8 / 12 ครั้ง' },   // raw 0
    { name: 'Shock Wave 12 ครั้ง', product: 'ติดตามอาการ', qty: '2 / 2 ครั้ง' },     // raw 1
    { name: 'Shock Wave 1 ครั้ง', product: 'Shock wave', qty: '0 / 1 ครั้ง' },       // raw 2 — remaining 0 → FILTERED
    { name: 'Shock Wave 1 ครั้ง', product: 'ปรึกษาอาการ', qty: '1 / 1 ครั้ง' },       // raw 3
    { name: 'Nebido 3 ครั้ง', product: 'Nebido', qty: '1 / 3 ครั้ง' },               // raw 4
  ];
  // Mirror CustomerDetailView.activeCourses: filter remaining>0, carry rawIndex.
  const active = courses
    .map((course, rawIndex) => ({ course, rawIndex }))
    .filter(({ course: c }) => remaining(c.qty) > 0);
  const groups = groupCustomerCoursesForDetailView(active);
  const entries = groups.flatMap((g) => g.entries);

  it('C1.1 the Nebido entry resolves to its TRUE index 4 (not the filtered position 3)', () => {
    const e = entries.find((x) => x.course.product === 'Nebido');
    expect(e).toBeTruthy();
    expect(e.originalIndex).toBe(4);
  });
  it('C1.2 the consult entry (raw 3) resolves to 3', () => {
    const e = entries.find((x) => x.course.product === 'ปรึกษาอาการ');
    expect(e.originalIndex).toBe(3);
  });
  it('C1.3 every active entry maps back to the right customer.courses object', () => {
    for (const e of entries) {
      expect(courses[e.originalIndex]).toBe(e.course); // index points at the SAME object
    }
  });
  it('C1.4 the filtered (0/1) Shock-wave entry is absent (used-up)', () => {
    const present = entries.filter((x) => x.course.product === 'Shock wave' && x.course.name === 'Shock Wave 1 ครั้ง');
    expect(present.length).toBe(0);
  });
  it('C1.5 raw-array (no wrapper) input still uses positional index (V47 back-compat)', () => {
    const rawGroups = groupCustomerCoursesForDetailView(courses);
    const rawEntries = rawGroups.flatMap((g) => g.entries);
    const nebido = rawEntries.find((x) => x.course.product === 'Nebido');
    expect(nebido.originalIndex).toBe(4);
    // a wrapper with rawIndex always wins over position
    const wrapped = groupCustomerCoursesForDetailView([{ course: courses[4], rawIndex: 99 }]);
    expect(wrapped.flatMap((g) => g.entries)[0].originalIndex).toBe(99);
  });
});

describe('C1 — adjustCourseRemainingQty (add/reduce) source-grep', () => {
  const BC = SRC('src/lib/backendClient.js');
  const SDL = SRC('src/lib/scopedDataLayer.js');
  const SRP = SRC('src/components/backend/SaleRowParts.jsx');
  const CDV = SRC('src/components/backend/CustomerDetailView.jsx');
  const idx = BC.indexOf('export async function adjustCourseRemainingQty');
  const fn = idx > -1 ? BC.slice(idx, idx + 3000) : '';

  it('C1.6 adjustCourseRemainingQty exists + routes through the atomic helper', () => {
    expect(idx).toBeGreaterThan(-1);
    expect(fn).toContain('_mutateCustomerCoursesAtomic(customerId,');
  });
  it('C1.7 add caps at total (reverseQty), reduce floors at 0 (formatQtyString max(...,0))', () => {
    expect(fn).toMatch(/reverseQty\(beforeQty, amount\)/);
    expect(fn).toMatch(/Math\.max\(\(Number\(remaining\)[^)]*\) - amount, 0\)/);
  });
  it('C1.8 records the specific product + kind add|reduce', () => {
    expect(fn).toMatch(/kind:\s*isReduce\s*\?\s*'reduce'\s*:\s*'add'/);
    expect(fn).toMatch(/productName,/);
  });
  it('C1.9 returns the authoritative product/name (sale derives from it, not a UI snapshot)', () => {
    expect(fn).toMatch(/return \{[\s\S]*?productName[\s\S]*?\}/);
    expect(fn).toMatch(/const productName = String\(before\?\.product/);
  });
  it('C1.10 addCourseRemainingQty kept as a thin wrapper (back-compat)', () => {
    expect(BC).toMatch(/export async function addCourseRemainingQty[\s\S]{0,200}adjustCourseRemainingQty\(/);
  });
  it('C1.11 scopedDataLayer exports adjustCourseRemainingQty', () => {
    expect(SDL).toMatch(/export const adjustCourseRemainingQty = \(\.\.\.args\) => raw\.adjustCourseRemainingQty/);
  });
  it('C1.12 SaleRowParts has a reduceRemaining badge', () => {
    expect(SRP).toMatch(/reduceRemaining:\s*\{ label: 'ลดคงเหลือ'/);
  });
  it('C1.13 modal: เพิ่ม/ลด toggle + uses adjustCourseRemainingQty + sale name from result.productName', () => {
    expect(CDV).toMatch(/data-testid="adjust-mode-reduce"/);
    expect(CDV).toMatch(/adjustCourseRemainingQty\(customerId, courseIndex, isReduce \? -amt : amt/);
    expect(CDV).toMatch(/res\?\.productName/);
    expect(CDV).toMatch(/source: isReduce \? 'reduceRemaining' : 'addRemaining'/);
  });
  it('C1.14 Thai-culture: the modal title/heading is teal (NOT red) on the course name', () => {
    // heading must not be red/rose text; rose is only on the ลด button background.
    expect(CDV).toMatch(/id="modal-title-add-qty" className="text-sm font-bold text-teal-400"/);
  });
  it('C1.15 dead origIdx fuzzy-findIndex removed from CourseItemBar', () => {
    expect(CDV).not.toMatch(/const origIdx = allCourses\.findIndex/);
  });
});

describe('C3 — stock movement customer link', () => {
  const HOOK = SRC('src/hooks/useCustomerMap.js');
  const MLP = SRC('src/components/backend/MovementLogPanel.jsx');
  it('C3.1 useCustomerMap built from getAllCustomers + resolveCustomerDisplayName, defensive', () => {
    expect(HOOK).toMatch(/getAllCustomers\(\)/);
    expect(HOOK).toMatch(/resolveCustomerDisplayName\(c\)/);
    expect(HOOK).toMatch(/catch \{/); // never crashes a render
  });
  it('C3.2 MovementLogPanel renders a clickable customer link for movements with customerId', () => {
    expect(MLP).toMatch(/const customerMap = useCustomerMap\(\)/);
    expect(MLP).toMatch(/const custId = m\.customerId/);
    expect(MLP).toMatch(/data-testid="movement-customer-link"/);
    expect(MLP).toMatch(/window\.open\(`\$\{window\.location\.origin\}\?backend=1&customer=\$\{encodeURIComponent\(custId\)\}`, '_blank'\)/);
  });
  it('C3.3 Thai-culture: the customer NAME link is sky (NOT red)', () => {
    expect(MLP).toMatch(/data-testid="movement-customer-link"[\s\S]{0,260}text-sky-400/);
    expect(MLP).not.toMatch(/data-testid="movement-customer-link"[\s\S]{0,260}text-(red|rose)-/);
  });
});

describe('C4 — course-use history shows the OPD editor, not the doctor', () => {
  const TFP = SRC('src/components/TreatmentFormPage.jsx');
  const CHT = SRC('src/components/backend/CourseHistoryTab.jsx');
  const CDV = SRC('src/components/backend/CustomerDetailView.jsx');
  it('C4.1 both deductCourseItems sites pass editorContext name first', () => {
    const calls = [...TFP.matchAll(/staffName: editorContext\?\.name \|\| treatingDoctor\?\.name \|\| ''/g)];
    expect(calls.length).toBe(2);
  });
  it('C4.2 CourseHistoryTab live-resolves the editor for kind=use via treatmentEditorMap', () => {
    expect(CHT).toMatch(/entry\.kind === 'use' && entry\.linkedTreatmentId && treatmentEditorMap/);
    expect(CHT).toMatch(/const whoName = liveEditor \|\| entry\.staffName \|\| entry\.actor/);
  });
  it('C4.3 CustomerDetailView builds treatmentEditorMap from editedByName + passes it', () => {
    expect(CDV).toMatch(/const treatmentEditorMap = useMemo/);
    expect(CDV).toMatch(/t\.editedByName/);
    expect(CDV).toMatch(/<CourseHistoryTab customerId=\{customerId\} treatmentEditorMap=\{treatmentEditorMap\} \/>/);
  });
  it('C4.4 reduce kind + add/reduce product line added to CourseHistoryTab', () => {
    expect(CHT).toMatch(/reduce:\s*\{ label: 'ลดคงเหลือ'/);
    expect(CHT).toMatch(/entry\.kind === 'use' \|\| entry\.kind === 'add' \|\| entry\.kind === 'reduce'/);
  });
});
