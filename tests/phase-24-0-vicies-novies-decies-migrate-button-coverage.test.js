// ─── Phase 24.0-vicies-novies-decies — migrate-button branchId coverage (V39) ──
//
// Per user directive: "เทส e2e จริงๆมาว่าสามารถนำเข้าสาขาพระราม 3 และ mapping
// กับข้อมูลของเราได้ทุกปุ่มที่มี" — every migrate button verified.
//
// 19 buttons in MasterDataTab.jsx MIGRATE_TARGETS. Per BSA classification:
//   • 11 branch-scoped → migrate fn must accept {branchId} + mapper must stamp
//   • 8 universal → migrate fn doesn't accept branchId (correct by design)
//
// This file is the source-of-truth assertion. The companion script
// scripts/e2e-migrate-button-coverage.mjs runs the same matrix against real
// Firestore via admin SDK with TEST-prefixed fixtures.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildBePromotionFromMaster,
  buildBeCouponFromMaster,
  buildBeVoucherFromMaster,
} from '../src/lib/phase9Mappers.js';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const BACKEND_CLIENT_PATH = path.join(ROOT, 'src', 'lib', 'backendClient.js');
const MASTER_DATA_TAB_PATH = path.join(ROOT, 'src', 'components', 'backend', 'MasterDataTab.jsx');

function read(p) { return fs.readFileSync(p, 'utf-8'); }

const TEST_BRANCH = 'TEST-BR-PRAM3';

// Per BSA + COLLECTION_MATRIX + V39 audit. Each entry maps a migrate button
// to its expected wiring. branchScoped:true means the migrate fn MUST accept
// {branchId} and the mapper output MUST stamp branchId from the arg.
const BUTTONS = [
  { key: 'promotions',          fn: 'migrateMasterPromotionsToBe',        branchScoped: true,  mapperShape: 'phase9' },
  { key: 'coupons',             fn: 'migrateMasterCouponsToBe',           branchScoped: true,  mapperShape: 'phase9' },
  { key: 'vouchers',            fn: 'migrateMasterVouchersToBe',          branchScoped: true,  mapperShape: 'phase9' },
  { key: 'product_groups',      fn: 'migrateMasterProductGroupsToBe',     branchScoped: true,  mapperShape: 'runMaster' },
  { key: 'product_units',       fn: 'migrateMasterProductUnitsToBe',      branchScoped: true,  mapperShape: 'runMaster' },
  { key: 'medical_instruments', fn: 'migrateMasterMedicalInstrumentsToBe', branchScoped: true,  mapperShape: 'runMaster' },
  { key: 'holidays',            fn: 'migrateMasterHolidaysToBe',          branchScoped: true,  mapperShape: 'runMaster' },
  { key: 'branches',            fn: 'migrateMasterBranchesToBe',          branchScoped: false, mapperShape: 'special' /* branches table itself */ },
  { key: 'permission_groups',   fn: 'migrateMasterPermissionGroupsToBe',  branchScoped: false, mapperShape: 'runMaster' },
  { key: 'df_groups',           fn: 'migrateMasterDfGroupsToBe',          branchScoped: true,  mapperShape: 'runMaster' },
  { key: 'df_staff_rates',      fn: 'migrateMasterDfStaffRatesToBe',      branchScoped: true,  mapperShape: 'runMaster' },
  { key: 'wallet_types',        fn: 'migrateMasterWalletTypesToBe',       branchScoped: false, mapperShape: 'runMaster' },
  { key: 'membership_types',    fn: 'migrateMasterMembershipTypesToBe',   branchScoped: false, mapperShape: 'runMaster' },
  { key: 'medicine_labels',     fn: 'migrateMasterMedicineLabelsToBe',    branchScoped: false, mapperShape: 'runMaster' },
  { key: 'staff',               fn: 'migrateMasterStaffToBe',             branchScoped: false, mapperShape: 'runMaster' },
  { key: 'doctors',             fn: 'migrateMasterDoctorsToBe',           branchScoped: false, mapperShape: 'runMaster' },
  { key: 'staff_schedules',     fn: 'migrateMasterStaffSchedulesToBe',    branchScoped: 'spread', mapperShape: 'special' /* writer stamps src.branchId */ },
  { key: 'products',            fn: 'migrateMasterProductsToBe',          branchScoped: true,  mapperShape: 'runMaster' },
  { key: 'courses',             fn: 'migrateMasterCoursesToBeV2',         branchScoped: true,  mapperShape: 'runMaster' },
];

// ─── B1 — MasterDataTab handleMigrate forwards branchId to ALL targets ─────
describe('B1 — MasterDataTab handleMigrate forwards branchId', () => {
  const src = read(MASTER_DATA_TAB_PATH);

  it('B1.1 handleMigrate uses useSelectedBranch hook', () => {
    expect(src).toMatch(/const \{ selectedBranchId \} = useSelectedBranch\(\)/);
  });

  it('B1.2 handleMigrate passes {branchId: selectedBranchId} to target.fn (every button)', () => {
    expect(src).toMatch(/target\.fn\(\{\s*branchId:\s*selectedBranchId\s*\|\|\s*['"]['"]\s*\}\)/);
  });

  it('B1.3 MIGRATE_TARGETS contains all 19 expected entity keys', () => {
    for (const btn of BUTTONS) {
      expect(src).toContain(`key: '${btn.key}'`);
    }
  });

  it('B1.4 MIGRATE_TARGETS imports each migrate fn from backendClient.js', () => {
    for (const btn of BUTTONS) {
      expect(src).toContain(btn.fn);
    }
  });
});

// ─── B2 — branch-scoped wrapper signatures accept {branchId} opt ────────────
describe('B2 — branch-scoped wrapper signatures (V39 fix)', () => {
  const src = read(BACKEND_CLIENT_PATH);

  for (const btn of BUTTONS.filter(b => b.branchScoped === true)) {
    it(`B2.${btn.key}: ${btn.fn} signature accepts {branchId = ''} = {}`, () => {
      const re = new RegExp(`export async function ${btn.fn}\\(\\s*\\{\\s*branchId\\s*=\\s*['"]['"]\\s*\\}\\s*=\\s*\\{\\s*\\}\\s*\\)`);
      expect(src).toMatch(re);
    });
  }

  it('B2.staff_schedules: writer-spread (passes src.branchId via mapMasterToBeStaffSchedule)', () => {
    // staff_schedules is special — branchScoped via SOURCE branchId filter (per
    // ter sexies). Test that the mapper output stamps branchId from src.
    expect(src).toMatch(/mapMasterToBeStaffSchedule[\s\S]*?branchId:\s*String\(src\.branchId\s*\|\|\s*['"]['"]\)/);
  });
});

// ─── B3 — universal wrapper signatures DO NOT accept branchId (correct) ────
describe('B3 — universal wrapper signatures (must NOT accept branchId)', () => {
  const src = read(BACKEND_CLIENT_PATH);
  const universalButtons = BUTTONS.filter(b => b.branchScoped === false);

  for (const btn of universalButtons) {
    it(`B3.${btn.key}: ${btn.fn} signature is zero-arity (universal collection)`, () => {
      // Allow zero-arity OR { /* legacy opts */ } — but must NOT accept branchId.
      const reZeroArity = new RegExp(`export async function ${btn.fn}\\(\\s*\\)`);
      const reHasBranchIdArg = new RegExp(`export async function ${btn.fn}\\(\\s*\\{[^\\}]*branchId`);
      expect(src).toMatch(reZeroArity);
      expect(src).not.toMatch(reHasBranchIdArg);
    });
  }
});

// ─── B4 — phase9 builders stamp branchId (V39) ─────────────────────────────
describe('B4 — phase9 builders stamp branchId from 5th arg (V39)', () => {
  const fixture = (name) => ({ name, price: 100 });

  it('B4.1 buildBePromotionFromMaster(fixture, id, now, null, branchId) → output.branchId === branchId', () => {
    const out = buildBePromotionFromMaster(fixture('test promo'), 'P1', '2026-05-07', null, TEST_BRANCH);
    expect(out).toBeTruthy();
    expect(out.branchId).toBe(TEST_BRANCH);
  });

  it('B4.2 buildBeCouponFromMaster stamps branchId', () => {
    const out = buildBeCouponFromMaster({ name: 'test', coupon_code: 'TEST10' }, 'C1', '2026-05-07', null, TEST_BRANCH);
    expect(out).toBeTruthy();
    expect(out.branchId).toBe(TEST_BRANCH);
  });

  it('B4.3 buildBeVoucherFromMaster stamps branchId', () => {
    const out = buildBeVoucherFromMaster({ name: 'test', price: 200 }, 'V1', '2026-05-07', null, TEST_BRANCH);
    expect(out).toBeTruthy();
    expect(out.branchId).toBe(TEST_BRANCH);
  });

  it('B4.4 buildBe* fall back to src.branchId when 5th arg empty', () => {
    const out = buildBePromotionFromMaster(
      { name: 'src-branch-promo', branchId: 'SRC-BR' },
      'P2', '2026-05-07', null, '' /* no override */,
    );
    expect(out.branchId).toBe('SRC-BR');
  });

  it('B4.5 buildBe* default to empty string when neither source', () => {
    const out = buildBePromotionFromMaster(fixture('no-branch'), 'P3', '2026-05-07', null);
    expect(out.branchId).toBe('');
  });
});

// ─── B5 — runMasterToBeMigration mapper signatures (V39 sweep) ─────────────
describe('B5 — runMasterToBeMigration mappers stamp branchId (post-V39 + post-octies)', () => {
  const src = read(BACKEND_CLIENT_PATH);

  // Every "branch-scoped" mapper must accept the 5th `branchId` arg AND stamp
  // `branchId: branchId || src.branchId || ''` on output. Pattern locked.
  const branchMapperNames = [
    'mapMasterToProductGroup',
    'mapMasterToProductUnit',
    'mapMasterToMedicalInstrument',
    'mapMasterToHoliday',
    'mapMasterToDfGroup',
    'mapMasterToDfStaffRates',  // V39 added
    'mapMasterToProduct',
    'mapMasterToCourse',
  ];

  for (const name of branchMapperNames) {
    it(`B5.${name}: signature includes 5th branchId arg`, () => {
      const re = new RegExp(`function ${name}\\([^)]*?,\\s*branchId\\s*=\\s*['"]['"]\\s*\\)`);
      expect(src).toMatch(re);
    });

    it(`B5.${name}: stamps branchId on output`, () => {
      // Find the function block (~30 lines after declaration)
      const fnRegex = new RegExp(`function ${name}\\([^)]*?\\)\\s*\\{[\\s\\S]*?\\n\\}`, 'm');
      const m = src.match(fnRegex);
      expect(m).toBeTruthy();
      const block = m[0];
      // Either inline `branchId: branchId || src.branchId || ''` OR
      // `base.branchId = branchId || src.branchId || '';` (Holiday-style)
      const inline = /branchId:\s*branchId\s*\|\|\s*src\.branchId\s*\|\|\s*['"]['"]/;
      const assigned = /\.branchId\s*=\s*branchId\s*\|\|\s*src\.branchId\s*\|\|\s*['"]['"]/;
      expect(inline.test(block) || assigned.test(block)).toBe(true);
    });
  }
});

// ─── B6 — migrate-fn → mapper forwarding (the bug surface fix) ─────────────
describe('B6 — wrapper fns forward branchId to mapper / runMasterToBeMigration', () => {
  const src = read(BACKEND_CLIENT_PATH);

  const wrappersForwarding = [
    { name: 'migrateMasterProductGroupsToBe',     forwards: 'runMasterToBeMigration', via: 'branchId' },
    { name: 'migrateMasterProductUnitsToBe',      forwards: 'runMasterToBeMigration', via: 'branchId' },
    { name: 'migrateMasterMedicalInstrumentsToBe', forwards: 'runMasterToBeMigration', via: 'branchId' },
    { name: 'migrateMasterHolidaysToBe',          forwards: 'runMasterToBeMigration', via: 'branchId' },
    { name: 'migrateMasterDfGroupsToBe',          forwards: 'runMasterToBeMigration', via: 'branchId' },
    { name: 'migrateMasterDfStaffRatesToBe',      forwards: 'runMasterToBeMigration', via: 'branchId' },
    { name: 'migrateMasterProductsToBe',          forwards: 'runMasterToBeMigration', via: 'branchId' },
    { name: 'migrateMasterCoursesToBeV2',         forwards: 'runMasterToBeMigration', via: 'branchId' },
  ];

  for (const w of wrappersForwarding) {
    it(`B6.${w.name}: forwards branchId to ${w.forwards}`, () => {
      // Wrapper body should contain `branchId,` or `branchId })`
      const fnRegex = new RegExp(`export async function ${w.name}[\\s\\S]*?\\n\\}`, 'm');
      const m = src.match(fnRegex);
      expect(m).toBeTruthy();
      expect(m[0]).toContain(w.forwards);
      // branchId either bare-shorthand or explicit
      const hasForwarding = /branchId[\s,}]/.test(m[0]);
      expect(hasForwarding).toBe(true);
    });
  }

  // Promotions/Coupons/Vouchers don't go through runMasterToBeMigration —
  // they have their own loop. Verify branchId is forwarded as 5th arg to builder.
  it('B6.promotions: passes branchId as 5th arg to buildBePromotionFromMaster', () => {
    const fnRegex = /export async function migrateMasterPromotionsToBe[\s\S]*?\n\}/m;
    const m = src.match(fnRegex);
    expect(m).toBeTruthy();
    expect(m[0]).toMatch(/buildBePromotionFromMaster\([^)]*?,\s*existingCreatedAt,\s*branchId\)/);
  });

  it('B6.coupons: passes branchId as 5th arg to buildBeCouponFromMaster', () => {
    const fnRegex = /export async function migrateMasterCouponsToBe[\s\S]*?\n\}/m;
    const m = src.match(fnRegex);
    expect(m).toBeTruthy();
    expect(m[0]).toMatch(/buildBeCouponFromMaster\([^)]*?,\s*createdAt,\s*branchId\)/);
  });

  it('B6.vouchers: passes branchId as 5th arg to buildBeVoucherFromMaster', () => {
    const fnRegex = /export async function migrateMasterVouchersToBe[\s\S]*?\n\}/m;
    const m = src.match(fnRegex);
    expect(m).toBeTruthy();
    expect(m[0]).toMatch(/buildBeVoucherFromMaster\([^)]*?,\s*createdAt,\s*branchId\)/);
  });
});

// ─── B7 — cross-branch-import adapter coverage (V38 source patches) ────────
describe('B7 — cross-branch-import adapters define canonicalIdField (V39)', () => {
  const ADAPTER_DIR = path.join(ROOT, 'src', 'lib', 'crossBranchImportAdapters');
  const adapterFiles = [
    { file: 'products.js',             field: 'productId' },
    { file: 'courses.js',              field: 'courseId' },
    { file: 'product-groups.js',       field: 'groupId' },
    { file: 'product-units.js',        field: 'unitGroupId' },
    { file: 'medical-instruments.js',  field: 'instrumentId' },
    { file: 'holidays.js',             field: 'holidayId' },
    { file: 'df-groups.js',            field: 'groupId' },
  ];

  for (const a of adapterFiles) {
    it(`B7.${a.file}: defines canonicalIdField: '${a.field}'`, () => {
      const code = fs.readFileSync(path.join(ADAPTER_DIR, a.file), 'utf-8');
      expect(code).toMatch(new RegExp(`canonicalIdField:\\s*['"]${a.field}['"]`));
    });

    it(`B7.${a.file}: clone destructures stray 'id' to prevent V38 spread-override`, () => {
      const code = fs.readFileSync(path.join(ADAPTER_DIR, a.file), 'utf-8');
      // Look for `const { id, ... } = item` in clone
      expect(code).toMatch(/const \{[^}]*\bid\b[^}]*\}\s*=\s*item/);
    });
  }

  it('B7.endpoint: cross-branch-import.js stamps id + canonicalIdField generically', () => {
    const code = fs.readFileSync(path.join(ROOT, 'api', 'admin', 'cross-branch-import.js'), 'utf-8');
    expect(code).toMatch(/cloned\.id\s*=\s*newId/);
    expect(code).toMatch(/cloned\[adapter\.canonicalIdField\]\s*=\s*newId/);
    // V38/V39 marker comment for institutional memory
    expect(code).toMatch(/V39 \(2026-05-07\)/);
  });
});
