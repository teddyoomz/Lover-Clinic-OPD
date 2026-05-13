// ─── Phase 17.2-septies — TFP reader field-name fix ────────────────────
// User report 2026-05-05 (verbatim): on นครราชสีมา branch in TFP —
//   1. ปุ่มยากลับบ้าน ไม่มียาขึ้น
//   2. ปุ่มซื้อคอร์สไม่แสดงชื่อคอร์สราคา รายละเอียดใดๆ เป็นโครงเปล่าๆ
//   3. ปุ่มซื้อสินค้าหน้าร้าน กดเข้าไปไม่มีสินค้าเลย
//   4. ปุ่มกลุ่มสินค้าสิ้นเปลือง ขึ้นไม่ครบ
//   5. ปุ่มสินค้าสิ้นเปลือง search ไม่เจอข้อมูลอะไรเลย
//
// Root cause: V12-class schema drift. Phase BS V2 (2026-05-04, cf897f6)
// wrote canonical be_products / be_courses schemas (productType /
// productName / categoryName / mainUnitName / courseName / salePrice /
// courseCategory / courseProducts). TFP filter+map sites kept reading
// the legacy ProClinic-mirror names (type / name / category / unit /
// price). Phase 17.2-quinquies removed the cache short-circuit that
// was hiding the empty-modal symptom.
//
// Fix: TFP reads productType/productName/categoryName/mainUnitName at
// the 4 modal open paths (medicine / cons / OTC / course). Fallback
// chain `canonical || legacy || ''` for robustness against mixed-shape
// data during transitions.
//
// PRIMARY-B: branch indicator banner at TFP top header (both create +
// edit modes). Reads useSelectedBranch().branchList; renders an
// orange-tinted strip with branch name + branchId. data-testid
// "tfp-branch-indicator" for deterministic test/preview_eval selectors.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const TFP_SRC = readFileSync('src/components/TreatmentFormPage.jsx', 'utf8');

describe('Phase 17.2-septies — TFP reader field-name + branch banner', () => {
  describe('S1 — modal openers filter on canonical productType', () => {
    it('S1.1 NO bare `p.type === \'ยา\'` filter remains', () => {
      // The fix uses `(p.productType || p.type) === 'ยา'` — bare `p.type === '...'`
      // (without productType-first fallback) is the broken pre-fix shape.
      expect(TFP_SRC).not.toMatch(/\(p\) =>\s*p\.type\s*===\s*['"]ยา['"]/);
      expect(TFP_SRC).not.toMatch(/p\s*=>\s*p\.type\s*===\s*['"]ยา['"]/);
    });
    it('S1.2 NO bare `p.type === \'สินค้าหน้าร้าน\'` filter remains', () => {
      expect(TFP_SRC).not.toMatch(/p\s*=>\s*p\.type\s*===\s*['"]สินค้าหน้าร้าน['"]/);
    });
    it('S1.3 NO bare `p.type === \'สินค้าสิ้นเปลือง\'` filter remains', () => {
      expect(TFP_SRC).not.toMatch(/p\s*=>\s*p\.type\s*===\s*['"]สินค้าสิ้นเปลือง['"]/);
    });
    it('S1.4 every modal opener filters on productType-first fallback', () => {
      const matches = TFP_SRC.match(/\(p\.productType \|\| p\.type\) === ['"][^'"]+['"]/g) || [];
      expect(matches.length).toBeGreaterThanOrEqual(3); // medicine + OTC + cons
    });
  });

  describe('S2 — product .map() reads canonical fields with fallback', () => {
    it('S2.1 productName-first fallback present in TFP', () => {
      // Multiple sites map products → must read productName || name fallback
      const matches = TFP_SRC.match(/p\.productName \|\| p\.name/g) || [];
      expect(matches.length).toBeGreaterThanOrEqual(3); // 3 modal openers
    });
    it('S2.2 mainUnitName-first fallback present', () => {
      const matches = TFP_SRC.match(/p\.mainUnitName \|\| p\.unit/g) || [];
      expect(matches.length).toBeGreaterThanOrEqual(3);
    });
    it('S2.3 categoryName-first fallback present', () => {
      const matches = TFP_SRC.match(/p\.categoryName \|\| p\.category/g) || [];
      expect(matches.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('S3 — course .map() reads canonical fields (POST-V49 update)', () => {
    // V49 refactor (2026-05-08) moved the legacy→canonical mapping from inline
    // `c.X || c.legacyX` chains to the `beCourseToMasterShape` adapter helper.
    // TFP buy-fetcher now delegates to the mapper — see line 1283 dynamic import.
    // S3.x tests updated to lock the post-V49 pattern: canonical-only field
    // names + delegation to mapper. The pre-V49 dual-read fallbacks are no
    // longer needed inline (adapter handles them).

    it('S3.1 — TFP imports beCourseToMasterShape canonical mapper (V44/V49)', () => {
      expect(TFP_SRC).toMatch(/beCourseToMasterShape/);
    });

    it('S3.2 — TFP reads canonical c.salePrice in course pricing', () => {
      // Post-V49: c.salePrice is the canonical field (legacy c.price fallback
      // preserved in the mapper, not in TFP). Lock that TFP DOES read salePrice.
      expect(TFP_SRC).toMatch(/c\.salePrice/);
    });

    it('S3.3 — TFP reads canonical c.courseName for course display', () => {
      // Post-V49: c.courseName is canonical. Legacy c.name fallback in mapper.
      expect(TFP_SRC).toMatch(/c\.courseName/);
    });

    it('S3.4 — TFP delegates legacy→canonical mapping to beCourseToMasterShape (no inline fallback chain)', () => {
      // Anti-regression: TFP MUST NOT reintroduce inline `c.courseProducts || c.products`
      // pattern. The mapper handles that. Inline reintroduction would be a
      // canonical-mapper-bypass class regression (V44 / AV22 lesson).
      expect(TFP_SRC).not.toMatch(/c\.courseProducts \|\| c\.products/);
      // TFP's course path should rely on the mapper; assert the canonical mapper
      // is actively invoked (loose match — `beCourseToMasterShape(` somewhere).
      expect(TFP_SRC).toMatch(/beCourseToMasterShape\s*\(/);
    });
  });

  describe('S4 — branch indicator banner (PRIMARY-B)', () => {
    it('S4.1 banner has data-testid="tfp-branch-indicator"', () => {
      expect(TFP_SRC).toMatch(/data-testid=['"]tfp-branch-indicator['"]/);
    });
    it('S4.2 banner reads useSelectedBranch (no parallel resolution)', () => {
      // The destructure pulls both branchId and branches list from the same hook
      expect(TFP_SRC).toMatch(/branchId:\s*SELECTED_BRANCH_ID,\s*branches:\s*branchList/);
    });
    it('S4.3 banner derives currentBranch from branchList match on branchId', () => {
      expect(TFP_SRC).toMatch(/branchList\s*\|\|\s*\[\]\)\.find\(b\s*=>\s*\(b\.branchId\s*\|\|\s*b\.id\)\s*===\s*SELECTED_BRANCH_ID\)/);
    });
    it('S4.4 banner is NOT gated on isEdit (renders in both create + edit)', () => {
      // Phase 27.1-quater (2026-05-14) — branch indicator moved from standalone
      // orange banner BELOW history strip INTO compact chip in the sticky
      // header. The chip is still gated only on `{currentBranch && (` —
      // no isEdit gate. The data-testid="tfp-branch-indicator" anchor is
      // the canonical location regardless of placement.
      const headerStart = TFP_SRC.indexOf('── Header ──');
      const headerEnd = TFP_SRC.indexOf('History tab strip', headerStart);
      expect(headerStart).toBeGreaterThan(0);
      expect(headerEnd).toBeGreaterThan(headerStart);
      const headerBlock = TFP_SRC.slice(headerStart, headerEnd);
      expect(headerBlock).toMatch(/data-testid="tfp-branch-indicator"/);
      expect(headerBlock).toMatch(/\{currentBranch && \(/);
      expect(headerBlock).not.toMatch(/\{isEdit && /);
      expect(headerBlock).not.toMatch(/\{!isEdit && /);
    });
    it('S4.5 chip shows branch name (raw branchId moved to title attribute for hover diagnostic)', () => {
      // Phase 27.1-quater — branch chip in header. Raw branchId no longer
      // a visible chip element; it's in `title` attribute for hover-only
      // diagnostic, keeping the header visually clean.
      expect(TFP_SRC).toMatch(/currentBranch\.name\s*\|\|\s*['"]\(ไม่มีชื่อ\)['"]/);
      // Raw branchId surfaces in title attribute (hover tooltip)
      expect(TFP_SRC).toMatch(/title=\{`สาขา:\s*\$\{currentBranch\.name[^`]*\$\{SELECTED_BRANCH_ID/);
    });
    it('S4.6 chip placement: inside the sticky header (with title + customer name)', () => {
      // Phase 27.1-quater — branch chip lives in the unified sticky header
      // alongside title + customer name + swap button. Replaces the prior
      // standalone "── Branch indicator ──" block (removed).
      const headerStart = TFP_SRC.indexOf('── Header ──');
      // Search for chip + history strip starting AFTER headerStart so we find
      // the in-header occurrence, not an earlier comment elsewhere in the file.
      const chipMatch = TFP_SRC.indexOf('data-testid="tfp-branch-indicator"', headerStart);
      const headerCloseEstimate = TFP_SRC.indexOf('History tab strip', headerStart);
      expect(headerStart).toBeGreaterThan(0);
      expect(chipMatch).toBeGreaterThan(headerStart);
      expect(chipMatch).toBeLessThan(headerCloseEstimate);
      // Anti-regression: prior standalone "── Branch indicator (Phase 17.2-septies)" block removed
      expect(TFP_SRC).not.toMatch(/── Branch indicator \(Phase 17\.2-septies\)/);
    });
  });

  describe('S5 — institutional memory marker', () => {
    it('S5.1 Phase 17.2-septies marker comment present', () => {
      expect(TFP_SRC).toMatch(/Phase 17\.2-septies/);
    });
  });
});
