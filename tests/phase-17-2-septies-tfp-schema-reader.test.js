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

  describe('S3 — course .map() reads canonical fields', () => {
    it('S3.1 courseName-first fallback present in course map', () => {
      expect(TFP_SRC).toMatch(/c\.courseName \|\| c\.name/);
    });
    it('S3.2 salePrice-first chain present in course map', () => {
      expect(TFP_SRC).toMatch(/c\.salePrice != null\s*\?\s*c\.salePrice\s*:\s*c\.price/);
    });
    it('S3.3 courseCategory-first fallback present in course map', () => {
      expect(TFP_SRC).toMatch(/c\.courseCategory \|\| c\.category/);
    });
    it('S3.4 courseProducts-first fallback present', () => {
      expect(TFP_SRC).toMatch(/c\.courseProducts \|\| c\.products/);
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
      // The banner block uses `{currentBranch && (` — no isEdit gate.
      const bannerBlock = TFP_SRC.match(/Branch indicator \(Phase 17\.2-septies\)[\s\S]{0,1500}?\{\/\*\s*── Error/);
      expect(bannerBlock).toBeTruthy();
      const block = bannerBlock[0];
      expect(block).toMatch(/\{currentBranch && \(/);
      expect(block).not.toMatch(/\{isEdit && /); // not gated on isEdit
      expect(block).not.toMatch(/\{!isEdit && /);
    });
    it('S4.5 banner shows branch name + raw branchId for diagnostic', () => {
      expect(TFP_SRC).toMatch(/currentBranch\.name\s*\|\|\s*['"]\(ไม่มีชื่อ\)['"]/);
      expect(TFP_SRC).toMatch(/font-mono.*SELECTED_BRANCH_ID/);
    });
    it('S4.6 banner placement: after sticky header, before error banner', () => {
      const headerEnd = TFP_SRC.indexOf('── Header ──');
      const bannerStart = TFP_SRC.indexOf('── Branch indicator');
      const errorStart = TFP_SRC.indexOf('── Error ──');
      expect(headerEnd).toBeGreaterThan(0);
      expect(bannerStart).toBeGreaterThan(headerEnd);
      expect(errorStart).toBeGreaterThan(bannerStart);
    });
  });

  describe('S5 — institutional memory marker', () => {
    it('S5.1 Phase 17.2-septies marker comment present', () => {
      expect(TFP_SRC).toMatch(/Phase 17\.2-septies/);
    });
  });
});
