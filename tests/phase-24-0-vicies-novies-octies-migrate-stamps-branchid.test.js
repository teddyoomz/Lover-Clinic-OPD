// ─── Phase 24.0-vicies-novies-octies — migrate mappers stamp branchId ──────
//
// User report (verbatim, 2026-05-07): "เอ้าเชี่ย ทำไมอยู่ๆ สาขาพระราม 3
// มีคอร์สวะ มันตั้งแยกกันดิ" + "อยู่ดีๆ ไปใช้คอร์ส กับ สินค้า ที่ไม่ใช่
// สิ่งที่ universal ร่วมกันเฉยเลย" + "แล้วทำให้ลบได้ด้วยนะ".
//
// Background:
//   • Phase 24.0-vicies-novies-septies WRONGLY changed catalog tabs to
//     {allBranches:true} — made products/courses appear universal across
//     all branches. User correctly pointed out this violates per-branch
//     isolation intent.
//   • Real fix: catalog tabs KEEP {branchId: selectedBranchId} filter; the
//     migrate flow is what was broken — mappers didn't stamp branchId on
//     imported docs. After this fix, imported items have branchId stamped
//     at migrate-time → catalog tabs see them via per-branch filter.
//
// Sweep coverage (6 mappers + their migrate wrappers):
//   - mapMasterToProduct / migrateMasterProductsToBe
//   - mapMasterToCourse / migrateMasterCoursesToBeV2
//   - mapMasterToDfGroup / migrateMasterDfGroupsToBe
//   - mapMasterToMedicalInstrument / migrateMasterMedicalInstrumentsToBe
//   - mapMasterToProductUnit / migrateMasterProductUnitsToBe
//   - mapMasterToProductGroup / migrateMasterProductGroupsToBe
//   - mapMasterToHoliday / migrateMasterHolidaysToBe
//
// MasterDataTab handleMigrate now reads selectedBranchId from BranchContext
// and passes {branchId} to each migrate fn → through to runMasterToBeMigration
// → through to mapper as 5th arg.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..');
const BC = fs.readFileSync(path.join(ROOT, 'src/lib/backendClient.js'), 'utf8');
const MDT = fs.readFileSync(
  path.join(ROOT, 'src/components/backend/MasterDataTab.jsx'),
  'utf8',
);

// ═══════════════════════════════════════════════════════════════════════════
// A. runMasterToBeMigration accepts + forwards branchId
// ═══════════════════════════════════════════════════════════════════════════
describe('Phase 24.0-vicies-novies-octies — A: runMasterToBeMigration plumbing', () => {
  it('VNO.A.1 — runMasterToBeMigration signature accepts {branchId} opt', () => {
    expect(BC).toMatch(
      /async\s+function\s+runMasterToBeMigration\(\{\s*sourceType,\s*targetCol,\s*targetDocFn,\s*mapper,\s*filter\s*=\s*null,\s*branchId\s*=\s*['"]['"]\s*\}\)/,
    );
  });

  it('VNO.A.2 — runMasterToBeMigration passes branchId to mapper as 5th arg', () => {
    expect(BC).toMatch(
      /const\s+doc_\s*=\s*mapper\(src,\s*id,\s*now,\s*existingCreatedAt,\s*branchId\)/,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B. Each affected mapper accepts branchId arg + stamps branchId on output
// ═══════════════════════════════════════════════════════════════════════════
describe('Phase 24.0-vicies-novies-octies — B: 6 mappers accept + stamp branchId', () => {
  const MAPPERS = [
    { name: 'mapMasterToProduct',           sigRe: /function\s+mapMasterToProduct\(src,\s*id,\s*now,\s*existingCreatedAt,\s*branchId\s*=\s*['"]['"]\)/ },
    { name: 'mapMasterToCourse',            sigRe: /function\s+mapMasterToCourse\(src,\s*id,\s*now,\s*existingCreatedAt,\s*branchId\s*=\s*['"]['"]\)/ },
    { name: 'mapMasterToDfGroup',           sigRe: /function\s+mapMasterToDfGroup\(src,\s*id,\s*now,\s*existingCreatedAt,\s*branchId\s*=\s*['"]['"]\)/ },
    { name: 'mapMasterToMedicalInstrument', sigRe: /function\s+mapMasterToMedicalInstrument\(src,\s*id,\s*now,\s*existingCreatedAt,\s*branchId\s*=\s*['"]['"]\)/ },
    { name: 'mapMasterToProductUnit',       sigRe: /function\s+mapMasterToProductUnit\(src,\s*id,\s*now,\s*existingCreatedAt,\s*branchId\s*=\s*['"]['"]\)/ },
    { name: 'mapMasterToProductGroup',      sigRe: /function\s+mapMasterToProductGroup\(src,\s*id,\s*now,\s*existingCreatedAt,\s*branchId\s*=\s*['"]['"]\)/ },
    { name: 'mapMasterToHoliday',           sigRe: /function\s+mapMasterToHoliday\(src,\s*id,\s*now,\s*existingCreatedAt,\s*branchId\s*=\s*['"]['"]\)/ },
  ];
  for (const m of MAPPERS) {
    it(`VNO.B.${m.name} — accepts branchId arg + stamps on output`, () => {
      expect(BC).toMatch(m.sigRe);
      // Each mapper output stamps branchId via `branchId: branchId || src.branchId || ''`
      // (mapMasterToHoliday uses dotted assign; everything else inline).
    });
  }

  it('VNO.B.stamp — at least 7 occurrences of "branchId: branchId || src.branchId" pattern (6 mappers + dotted holiday)', () => {
    // Inline pattern (6 mappers)
    const inline = (BC.match(/branchId:\s*branchId\s*\|\|\s*src\.branchId\s*\|\|\s*['"]['"]/g) || []).length;
    // Dotted pattern (mapMasterToHoliday)
    const dotted = (BC.match(/base\.branchId\s*=\s*branchId\s*\|\|\s*src\.branchId\s*\|\|\s*['"]['"]/g) || []).length;
    expect(inline + dotted).toBeGreaterThanOrEqual(7);
  });

  it('VNO.B.no-empty-string — mapMasterToDfGroup no longer hardcodes branchId: \'\'', () => {
    // Anti-regression: pre-fix had `branchId: ''` (line 9452). Must be replaced.
    const dfBlock = BC.match(/function\s+mapMasterToDfGroup[\s\S]+?return\s*\{[\s\S]+?\};\s*\n\}/);
    expect(dfBlock).toBeTruthy();
    expect(dfBlock[0]).not.toMatch(/branchId:\s*['"]['"]/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// C. Wrapper migrate functions accept + forward branchId
// ═══════════════════════════════════════════════════════════════════════════
describe('Phase 24.0-vicies-novies-octies — C: 6 migrate wrappers accept + forward branchId', () => {
  const WRAPPERS = [
    'migrateMasterProductsToBe',
    'migrateMasterCoursesToBeV2',
    'migrateMasterDfGroupsToBe',
    'migrateMasterMedicalInstrumentsToBe',
    'migrateMasterProductUnitsToBe',
    'migrateMasterProductGroupsToBe',
    'migrateMasterHolidaysToBe',
  ];
  for (const fn of WRAPPERS) {
    it(`VNO.C.${fn} — signature accepts {branchId} opt + forwards to runMasterToBeMigration`, () => {
      // Signature: async function migrateMasterXToBe({ branchId = '' } = {})
      expect(BC).toMatch(
        new RegExp(`export\\s+async\\s+function\\s+${fn}\\(\\{\\s*branchId\\s*=\\s*['"]['"]\\s*\\}\\s*=\\s*\\{\\}\\)`),
      );
      // Forwards to runMasterToBeMigration with branchId
      const block = BC.match(new RegExp(`${fn}[\\s\\S]+?\\}\\s*\n`));
      expect(block).toBeTruthy();
      expect(block[0]).toMatch(/runMasterToBeMigration\([\s\S]+?branchId/);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// D. MasterDataTab uses BranchContext + passes branchId to migrate fns
// ═══════════════════════════════════════════════════════════════════════════
describe('Phase 24.0-vicies-novies-octies — D: MasterDataTab handleMigrate plumbing', () => {
  it('VNO.D.1 — MasterDataTab imports useSelectedBranch from BranchContext', () => {
    expect(MDT).toMatch(
      /import\s*\{\s*useSelectedBranch\s*\}\s*from\s*['"]\.\.\/\.\.\/lib\/BranchContext\.jsx['"]/,
    );
  });

  it('VNO.D.2 — MasterDataTab destructures selectedBranchId from useSelectedBranch()', () => {
    expect(MDT).toMatch(
      /const\s*\{\s*selectedBranchId\s*\}\s*=\s*useSelectedBranch\(\)/,
    );
  });

  it('VNO.D.3 — handleMigrate passes {branchId: selectedBranchId} to target.fn', () => {
    expect(MDT).toMatch(
      /target\.fn\(\s*\{\s*branchId:\s*selectedBranchId\s*\|\|\s*['"]['"]\s*\}\s*\)/,
    );
  });

  it('VNO.D.4 — handleMigrate useCallback deps include selectedBranchId', () => {
    expect(MDT).toMatch(
      /handleMigrate\s*=\s*useCallback\([\s\S]+?\[selectedBranchId\]\)/,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// E. 6 catalog tabs ARE per-branch (KEEP {branchId: selectedBranchId})
// ═══════════════════════════════════════════════════════════════════════════
describe('Phase 24.0-vicies-novies-octies — E: catalog tabs filter by selectedBranchId (per-branch isolation)', () => {
  const TABS = [
    { file: 'src/components/backend/ProductsTab.jsx',           listFn: 'listProducts' },
    { file: 'src/components/backend/CoursesTab.jsx',            listFn: 'listCourses' },
    { file: 'src/components/backend/DfGroupsTab.jsx',           listFn: 'listDfGroups' },
    { file: 'src/components/backend/MedicalInstrumentsTab.jsx', listFn: 'listMedicalInstruments' },
    { file: 'src/components/backend/ProductUnitsTab.jsx',       listFn: 'listProductUnitGroups' },
    { file: 'src/components/backend/ProductGroupsTab.jsx',      listFn: 'listProductGroups' },
  ];
  for (const tab of TABS) {
    it(`VNO.E — ${tab.file} uses ${tab.listFn}({ branchId: selectedBranchId }) (per-branch filter)`, () => {
      const src = fs.readFileSync(path.join(ROOT, tab.file), 'utf8');
      expect(src).toMatch(
        new RegExp(`${tab.listFn}\\(\\s*\\{\\s*branchId:\\s*selectedBranchId`),
      );
      // Anti-regression: NO allBranches:true on the catalog list
      expect(src).not.toMatch(
        new RegExp(`${tab.listFn}\\(\\s*\\{\\s*allBranches:\\s*true`),
      );
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// F. Pure-helper unit tests (the mapper actually stamps branchId)
// ═══════════════════════════════════════════════════════════════════════════
describe('Phase 24.0-vicies-novies-octies — F: mapMasterToCourse stamps branchId at runtime', () => {
  it('VNO.F.1 — mapMasterToCourse(..., branchId) → output.branchId === branchId', async () => {
    const { mapMasterToCourse } = await import('../src/lib/backendClient.js');
    const now = new Date().toISOString();
    const result = mapMasterToCourse(
      { courseName: 'Test Course', price: 1000 },
      'COURSE-XYZ',
      now,
      null,
      'BR-1777885958735-38afbdeb',  // พระราม 3
    );
    expect(result.branchId).toBe('BR-1777885958735-38afbdeb');
  });

  it('VNO.F.2 — mapMasterToCourse with no branchId arg → output.branchId === \'\' (default)', async () => {
    const { mapMasterToCourse } = await import('../src/lib/backendClient.js');
    const now = new Date().toISOString();
    const result = mapMasterToCourse(
      { courseName: 'Test Course' },
      'COURSE-NO-BRANCH',
      now,
      null,
    );
    expect(result.branchId).toBe('');
  });

  it('VNO.F.3 — mapMasterToCourse src.branchId fallback when arg empty', async () => {
    const { mapMasterToCourse } = await import('../src/lib/backendClient.js');
    const now = new Date().toISOString();
    const result = mapMasterToCourse(
      { courseName: 'Test', branchId: 'BR-LEGACY' },
      'COURSE-LEGACY',
      now,
      null,
      '',  // no branchId arg
    );
    expect(result.branchId).toBe('BR-LEGACY');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// G. Phase marker
// ═══════════════════════════════════════════════════════════════════════════
describe('Phase 24.0-vicies-novies-octies — G: institutional-memory marker', () => {
  it('VNO.G.1 — Phase 24.0-vicies-novies-octies marker present in backendClient + MasterDataTab', () => {
    expect(BC).toMatch(/Phase 24\.0-vicies-novies-octies/);
    expect(MDT).toMatch(/Phase 24\.0-vicies-novies-octies/);
  });
});
