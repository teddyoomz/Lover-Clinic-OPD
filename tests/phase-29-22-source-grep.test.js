// Phase 29.22 (2026-05-14) — Source-grep regression locks.
// Per Rule Q V66: source-grep is a REGRESSION lock AFTER L1/L2 confirms behavior.
// Never PRIMARY verification.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

function read(rel) {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('Phase 29.22 · SG1 — backendClient be_recall_cases exports', () => {
  const code = read('src/lib/backendClient.js');
  it('SG1.1 listRecallCases exported', () => {
    expect(code).toMatch(/export\s+async\s+function\s+listRecallCases/);
  });
  it('SG1.2 listRecallCases marked __universal__', () => {
    expect(code).toMatch(/listRecallCases\.__universal__\s*=\s*true/);
  });
  it('SG1.3 saveRecallCase exported', () => {
    expect(code).toMatch(/export\s+async\s+function\s+saveRecallCase/);
  });
  it('SG1.4 setRecallCaseHidden exported', () => {
    expect(code).toMatch(/export\s+async\s+function\s+setRecallCaseHidden/);
  });
  it('SG1.5 recall_cases section does NOT call _resolveBranchIdForWrite', () => {
    // Locate the Phase 29.22 section (universal — no branchId stamping).
    const marker = '// ═══ Phase 29.22 (2026-05-14) — be_recall_cases UNIVERSAL';
    const idx = code.indexOf(marker);
    expect(idx).toBeGreaterThan(-1);
    const section = code.slice(idx);
    expect(section).not.toMatch(/_resolveBranchIdForWrite/);
  });
});

describe('Phase 29.22 · SG2 — legacy fields stripped', () => {
  const LEGACY = ['followUpAfterDays', 'followUpReason', 'recallAfterDays', 'recallReason'];
  it('SG2.1 productValidation.js has NO legacy field assignments', () => {
    const c = read('src/lib/productValidation.js');
    for (const k of LEGACY) {
      // Allow comments to mention; forbid actual `k: <value>` assignments.
      expect(c).not.toMatch(new RegExp(`${k}:\\s*(numOrNull|null|\\(typeof)`));
    }
  });
  it('SG2.2 courseValidation.js has NO legacy field assignments', () => {
    const c = read('src/lib/courseValidation.js');
    for (const k of LEGACY) {
      expect(c).not.toMatch(new RegExp(`${k}:\\s*(numOrNull|null|\\(typeof)`));
    }
  });
  it('SG2.3 ProductFormModal has NO legacy field data-field/input', () => {
    const c = read('src/components/backend/ProductFormModal.jsx');
    for (const k of LEGACY) {
      expect(c).not.toMatch(new RegExp(`data-field=["']${k}["']`));
      expect(c).not.toMatch(new RegExp(`form\\.${k}`));
    }
  });
  it('SG2.4 CourseFormModal has NO legacy field data-field/input', () => {
    const c = read('src/components/backend/CourseFormModal.jsx');
    for (const k of LEGACY) {
      expect(c).not.toMatch(new RegExp(`data-field=["']${k}["']`));
      expect(c).not.toMatch(new RegExp(`form\\.${k}`));
    }
  });
});

describe('Phase 29.22 · SG3 — firestore.rules + indexes', () => {
  it('SG3.1 firestore.rules has be_recall_cases match block + delete:false', () => {
    const c = read('firestore.rules');
    expect(c).toMatch(/match\s+\/be_recall_cases\/\{caseId\}/);
    const idx = c.indexOf('be_recall_cases');
    const window = c.slice(idx, idx + 500);
    expect(window).toMatch(/allow\s+delete:\s+if\s+false/);
  });
  it('SG3.2 firestore.indexes.json has composite (isHidden, caseName)', () => {
    const idx = JSON.parse(read('firestore.indexes.json'));
    const found = (idx.indexes || []).filter((i) => i.collectionGroup === 'be_recall_cases');
    expect(found.length).toBe(1);
    expect(found[0].fields.map((f) => f.fieldPath)).toEqual(['isHidden', 'caseName']);
  });
});

describe('Phase 29.22 · SG4 — scopedDataLayer + branch-collection-coverage', () => {
  it('SG4.1 scopedDataLayer re-exports listRecallCases as universal', () => {
    const c = read('src/lib/scopedDataLayer.js');
    expect(c).toMatch(/export\s+const\s+listRecallCases\s*=/);
    expect(c).toMatch(/listRecallCases\.__universal__\s*=\s*true/);
    expect(c).toMatch(/export\s+const\s+saveRecallCase\s*=/);
    expect(c).toMatch(/export\s+const\s+setRecallCaseHidden\s*=/);
  });
  it('SG4.2 branch-collection-coverage classifies be_recall_cases as global', () => {
    const c = read('tests/branch-collection-coverage.test.js');
    const matchSection = c.match(/'be_recall_cases':\s*\{[^}]+\}/);
    expect(matchSection).toBeTruthy();
    expect(matchSection[0]).toMatch(/scope:\s*'global'/);
  });
});

describe('Phase 29.22 · SG5 — UI wiring', () => {
  it('SG5.1 RecallTab uses RecallCasesAdminPanel + sub-pill', () => {
    const c = read('src/components/backend/recall/RecallTab.jsx');
    expect(c).toMatch(/RecallCasesAdminPanel/);
    expect(c).toMatch(/view\s*===\s*['"]cases['"]/);
    expect(c).toMatch(/recall-subpill-cases/);
  });
  it('SG5.2 RecallSlotCard uses RecallCaseSelectField', () => {
    const c = read('src/components/backend/recall/RecallSlotCard.jsx');
    expect(c).toMatch(/RecallCaseSelectField/);
    expect(c).toMatch(/recallCases/);
  });
  it('SG5.3 all 4 callers fetch listRecallCases via useRecallCases hook', () => {
    for (const file of [
      'src/components/backend/recall/RecallTab.jsx',
      'src/components/backend/recall/RecallFrontendView.jsx',
      'src/components/backend/customer-recall/RecallCard.jsx',
      'src/components/backend/customer-recall/RecallFromTreatmentModal.jsx',
    ]) {
      const c = read(file);
      expect(c).toMatch(/useRecallCases/);
      expect(c).toMatch(/recallCases/);
      expect(c).toMatch(/onSaveAsRecallCase/);
    }
  });
  it('SG5.4 RecallFromTreatmentModal NO longer fetches be_products[productId]', () => {
    const c = read('src/components/backend/customer-recall/RecallFromTreatmentModal.jsx');
    // Phase 29.21-fix2 path retired — getProduct(productId) call must NOT exist
    expect(c).not.toMatch(/getProduct\s*\(\s*productId/);
    // Strip code-access patterns (not deprecation comments which are allowed).
    expect(c).not.toMatch(/product\?\.followUpAfterDays/);
    expect(c).not.toMatch(/product\?\.recallAfterDays/);
    expect(c).not.toMatch(/product\.followUpAfterDays/);
    expect(c).not.toMatch(/product\.recallAfterDays/);
    expect(c).not.toMatch(/setMasterDataSuggestions\(\s*{[^}]*aftercare/);
  });
});

describe('Phase 29.22 · SG6 — Rule M migration script', () => {
  it('SG6.1 script exists with two-phase + audit doc invariants', () => {
    const c = read('scripts/phase-29-22-strip-recall-fields-from-product-course.mjs');
    expect(c).toMatch(/--apply/);
    expect(c).toMatch(/_recallFieldsClearedAt/);
    expect(c).toMatch(/_recallFieldsLegacyValue/);
    expect(c).toMatch(/be_admin_audit/);
    expect(c).toMatch(/process\.argv\[1\]\s*===\s*fileURLToPath/);
    expect(c).toMatch(/randomBytes/);
  });
  it('SG6.2 script clears all 4 legacy fields', () => {
    const c = read('scripts/phase-29-22-strip-recall-fields-from-product-course.mjs');
    expect(c).toMatch(/followUpAfterDays:\s+FieldValue\.delete/);
    expect(c).toMatch(/followUpReason:\s+FieldValue\.delete/);
    expect(c).toMatch(/recallAfterDays:\s+FieldValue\.delete/);
    expect(c).toMatch(/recallReason:\s+FieldValue\.delete/);
  });
});
