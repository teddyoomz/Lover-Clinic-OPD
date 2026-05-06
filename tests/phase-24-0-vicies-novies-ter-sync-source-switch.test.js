// ─── Phase 24.0-vicies-novies-ter — sync source switch + branch filter + wipe ──
//
// User directives (verbatim, 2026-05-07):
//   1. "ต่อไปในหน้า Sync ข้อมูลจาก ProClinic (tab=masterdata) เราจะเปลี่ยน
//       ไป Sync ข้อมูลจาก Proclinic จริงที่ไม่ใช่ Trial แล้ว ซึ่งจะเป็น
//       อันเดียวกับที่ Frontend เชื่อมต่ออยู่ ให้ย้ายไปเชื่อมอันนั้นทุกปุ่ม Sync"
//   2. "ในส่วนของปุ่ม นำเข้า master_data → backend (be_*) ให้นำเข้าสาขา
//       นครราชสีมาเท่านั้น สาขาอื่นไม่ต้องไปเอาเข้า"
//   3. "ลบและเคลียให้หมด" — wipe master_data/* via admin-SDK script
//
// Three concerns covered:
//   A. BackendDashboard no longer auto-flips _useTrialServer = true
//   B. IMPORT_TARGET_BRANCH_ID + filter on migrateMasterBranchesToBe + staff_schedules
//   C. Wipe script structure — Rule M canonical pattern (dry-run + apply
//      + audit doc + idempotency + tallyByEntity)

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..');
const BACKEND_DASH = fs.readFileSync(
  path.join(ROOT, 'src/pages/BackendDashboard.jsx'),
  'utf8',
);
const BC = fs.readFileSync(
  path.join(ROOT, 'src/lib/backendClient.js'),
  'utf8',
);
const SCRIPT = fs.readFileSync(
  path.join(ROOT, 'scripts/phase-24-0-vicies-novies-ter-wipe-master-data.mjs'),
  'utf8',
);

// ═══════════════════════════════════════════════════════════════════════════
// A. Sync source switch — BackendDashboard no longer enables trial mode
// ═══════════════════════════════════════════════════════════════════════════
describe('Phase 24.0-vicies-novies-ter — A: BackendDashboard sync source = PRODUCTION', () => {
  it('VNT.A.1 — BackendDashboard does NOT call setUseTrialServer(true)', () => {
    expect(BACKEND_DASH).not.toMatch(/setUseTrialServer\(true\)/);
  });

  it('VNT.A.2 — BackendDashboard does NOT import setUseTrialServer (unused)', () => {
    // After Phase 24.0-vicies-novies-ter the symbol is no longer needed in
    // BackendDashboard. The function still exists in brokerClient.js for
    // explicit opt-in elsewhere.
    expect(BACKEND_DASH).not.toMatch(
      /import\s*\{\s*setUseTrialServer\s*\}\s*from\s*['"]\.\.\/lib\/brokerClient\.js['"]/,
    );
  });

  it('VNT.A.3 — BackendDashboard has NO useEffect with cleanup that toggles trial', () => {
    // Anti-regression: the previous mount-cleanup pair was:
    //   useEffect(() => { setUseTrialServer(true); return () => setUseTrialServer(false); }, []);
    // It must not regress.
    expect(BACKEND_DASH).not.toMatch(
      /setUseTrialServer\(true\)[\s\S]{0,200}?setUseTrialServer\(false\)/,
    );
  });

  it('VNT.A.4 — Phase 24.0-vicies-novies-ter marker present in BackendDashboard', () => {
    expect(BACKEND_DASH).toMatch(/Phase 24\.0-vicies-novies-ter/);
  });

  it('VNT.A.5 — brokerClient.js still exports setUseTrialServer (kept for explicit opt-in)', () => {
    const broker = fs.readFileSync(path.join(ROOT, 'src/lib/brokerClient.js'), 'utf8');
    expect(broker).toMatch(/export\s+function\s+setUseTrialServer/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B. Branch filter — IMPORT_TARGET_BRANCH_ID + 2 sites
// ═══════════════════════════════════════════════════════════════════════════
describe('Phase 24.0-vicies-novies-ter — B: IMPORT_TARGET_BRANCH_ID + branch filter', () => {
  it('VNT.B.1 — IMPORT_TARGET_BRANCH_ID exported from backendClient.js', () => {
    // Phase 24.0-vicies-novies-sexies (2026-05-07) — switched from
    // นครราชสีมา (BR-1777873556815-26df6480) to พระราม 3
    // (BR-1777885958735-38afbdeb) per user directive "เปลี่ยนไปนำเข้า
    // ข้อมูลจาก proclinic จริงเข้าสาขาพระราม 3 ดีกว่า".
    expect(BC).toMatch(
      /export\s+const\s+IMPORT_TARGET_BRANCH_ID\s*=\s*['"]BR-1777885958735-38afbdeb['"]/,
    );
  });

  it('VNT.B.2 — runMasterToBeMigration accepts optional `filter` param', () => {
    expect(BC).toMatch(
      /async\s+function\s+runMasterToBeMigration\(\{\s*sourceType,\s*targetCol,\s*targetDocFn,\s*mapper,\s*filter\s*=\s*null\s*\}\)/,
    );
  });

  it('VNT.B.3 — filter is invoked + returns false → item skipped', () => {
    expect(BC).toMatch(
      /if\s*\(typeof\s+filter\s*===\s*['"]function['"]\s*&&\s*!filter\(src,\s*id\)\)\s*\{\s*skipped\+\+;\s*continue;/,
    );
  });

  it('VNT.B.4 — migrateMasterBranchesToBe passes filter (id === IMPORT_TARGET_BRANCH_ID)', () => {
    expect(BC).toMatch(
      /export\s+async\s+function\s+migrateMasterBranchesToBe\(\)\s*\{[\s\S]{0,500}?filter:\s*\(_src,\s*id\)\s*=>\s*id\s*===\s*IMPORT_TARGET_BRANCH_ID/,
    );
  });

  it('VNT.B.5 — migrateMasterStaffSchedulesToBe filters by src.branchId === IMPORT_TARGET_BRANCH_ID', () => {
    expect(BC).toMatch(
      /const\s+srcBranchId\s*=\s*String\(src\.branchId\s*\|\|\s*['"]['"]\)\.trim\(\);\s*\n\s*if\s*\(srcBranchId\s*!==\s*IMPORT_TARGET_BRANCH_ID\)\s*\{\s*skipped\+\+;\s*continue;/,
    );
  });

  it('VNT.B.6 — global entities (products/courses/staff/etc) do NOT pass filter', () => {
    // Anti-regression: only branches + staff_schedules are branch-scoped.
    // Other entities import unfiltered.
    const globalMigrators = [
      'migrateMasterProductsToBe', 'migrateMasterCoursesToBeV2',
      'migrateMasterStaffToBe', 'migrateMasterDoctorsToBe',
      'migrateMasterPromotionsToBe', 'migrateMasterCouponsToBe',
      'migrateMasterVouchersToBe', 'migrateMasterHolidaysToBe',
      'migrateMasterPermissionGroupsToBe',
      'migrateMasterDfGroupsToBe', 'migrateMasterDfStaffRatesToBe',
      'migrateMasterWalletTypesToBe', 'migrateMasterMembershipTypesToBe',
      'migrateMasterMedicineLabelsToBe',
      'migrateMasterProductGroupsToBe', 'migrateMasterProductUnitsToBe',
      'migrateMasterMedicalInstrumentsToBe',
    ];
    for (const fn of globalMigrators) {
      const block = BC.match(
        new RegExp(`export\\s+async\\s+function\\s+${fn}\\(\\)\\s*\\{[\\s\\S]{0,400}?\\}`),
      );
      expect(block).toBeTruthy();
      // No `filter:` opt forwarded
      expect(block[0]).not.toMatch(/filter:/);
    }
  });

  it('VNT.B.7 — Phase 24.0-vicies-novies-ter marker present in backendClient', () => {
    expect(BC).toMatch(/Phase 24\.0-vicies-novies-ter/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// C. Wipe script — Rule M canonical structure
// ═══════════════════════════════════════════════════════════════════════════
describe('Phase 24.0-vicies-novies-ter — C: wipe script (Rule M canonical)', () => {
  it('VNT.C.1 — script header references user directive verbatim', () => {
    expect(SCRIPT).toMatch(/ฝากลบและเคลียให้หมด/);
  });

  it('VNT.C.2 — uses canonical artifacts/{APP_ID}/public/data/master_data path (Rule M lock)', () => {
    expect(SCRIPT).toMatch(/const\s+APP_ID\s*=\s*['"]loverclinic-opd-4c39b['"]/);
    expect(SCRIPT).toMatch(/const\s+BASE_PATH\s*=\s*`artifacts\/\$\{APP_ID\}\/public\/data`/);
    expect(SCRIPT).toMatch(/const\s+MASTER_DATA_PATH\s*=\s*`\$\{BASE_PATH\}\/master_data`/);
  });

  it('VNT.C.3 — dry-run by default + --apply commits', () => {
    expect(SCRIPT).toMatch(/const\s+apply\s*=\s*process\.argv\.includes\(['"]--apply['"]\)/);
    expect(SCRIPT).toMatch(/const\s+dryRun\s*=\s*!apply/);
  });

  it('VNT.C.4 — PEM key conversion (\\\\n → \\n) per Rule M', () => {
    expect(SCRIPT).toMatch(
      /process\.env\.FIREBASE_ADMIN_PRIVATE_KEY[\s\S]{0,200}?\.split\(['"]\\\\n['"]\)\.join\(['"]\\n['"]\)/,
    );
  });

  it('VNT.C.5 — invocation guard prevents auto-run on import', () => {
    expect(SCRIPT).toMatch(
      /if\s*\(process\.argv\[1\]\s*===\s*fileURLToPath\(import\.meta\.url\)\)/,
    );
  });

  it('VNT.C.6 — recursive doc-path collector via listCollections (defense-in-depth)', () => {
    expect(SCRIPT).toMatch(/listCollections/);
  });

  it('VNT.C.7 — batch deletes capped at 400 (Firestore 500-op headroom)', () => {
    expect(SCRIPT).toMatch(/const\s+BATCH_SIZE\s*=\s*400/);
    expect(SCRIPT).toMatch(/batch\.delete\(db\.doc\(p\)\)/);
  });

  it('VNT.C.8 — paths sorted longest-first to delete subcollection items BEFORE parent doc', () => {
    expect(SCRIPT).toMatch(/sort\(\(a,\s*b\)\s*=>\s*b\.length\s*-\s*a\.length\)/);
  });

  it('VNT.C.9 — audit doc with phase + op + scanned + deleted + tallyByEntity', () => {
    expect(SCRIPT).toMatch(/phase:\s*['"]24\.0-vicies-novies-ter['"]/);
    expect(SCRIPT).toMatch(/op:\s*['"]wipe-master-data['"]/);
    expect(SCRIPT).toMatch(/scanned:\s*paths\.length/);
    expect(SCRIPT).toMatch(/deleted/);
    expect(SCRIPT).toMatch(/tallyByEntity:\s*tally/);
  });

  it('VNT.C.10 — randHex uses crypto.randomBytes (Rule C2 — no Math.random)', () => {
    expect(SCRIPT).toMatch(/randomBytes\(/);
    expect(SCRIPT).not.toMatch(/Math\.random\(/);
  });

  it('VNT.C.11 — idempotent re-run: 0 docs → still writes audit doc', () => {
    expect(SCRIPT).toMatch(/0 docs to delete \(idempotent re-run\)/);
  });

  it('VNT.C.12 — KNOWN_ENTITIES list covers the visible UI entities (informational)', () => {
    const expected = [
      'promotions', 'coupons', 'vouchers',
      'product_groups', 'product_units', 'medical_instruments', 'holidays',
      'branches', 'permission_groups',
      'df_groups', 'df_staff_rates',
      'wallet_types', 'membership_types', 'medicine_labels',
      'staff', 'doctors', 'staff_schedules',
      'products', 'courses',
    ];
    for (const e of expected) {
      expect(SCRIPT).toMatch(new RegExp(`['"]${e}['"]`));
    }
  });

  it('VNT.C.13 — audit doc id format: phase-24-0-vicies-novies-ter-wipe-master-data-{ts}-{rand}', () => {
    expect(SCRIPT).toMatch(
      /`phase-24-0-vicies-novies-ter-wipe-master-data-\$\{Date\.now\(\)\}-\$\{randHex\(\)\}`/,
    );
  });

  it('VNT.C.14 — Phase 24.0-vicies-novies-ter marker', () => {
    expect(SCRIPT).toMatch(/Phase 24\.0-vicies-novies-ter/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// D. Pure-helper unit tests (importable from script)
// ═══════════════════════════════════════════════════════════════════════════
describe('Phase 24.0-vicies-novies-ter — D: pure helpers from wipe script', () => {
  it('VNT.D.1 — randHex returns hex string of requested length', async () => {
    const mod = await import(
      '../scripts/phase-24-0-vicies-novies-ter-wipe-master-data.mjs'
    );
    expect(typeof mod.randHex).toBe('function');
    const id = mod.randHex(8);
    expect(id).toMatch(/^[a-f0-9]{8}$/);
    expect(mod.randHex(4)).toMatch(/^[a-f0-9]{4}$/);
  });

  it('VNT.D.2 — tallyByEntity counts paths grouped by master_data/{entity} segment', async () => {
    const mod = await import(
      '../scripts/phase-24-0-vicies-novies-ter-wipe-master-data.mjs'
    );
    const APP_ID = 'loverclinic-opd-4c39b';
    const BASE = `artifacts/${APP_ID}/public/data/master_data`;
    const paths = [
      `${BASE}/staff`,
      `${BASE}/staff/items/1`,
      `${BASE}/staff/items/2`,
      `${BASE}/doctors`,
      `${BASE}/doctors/items/3`,
      `${BASE}/courses/items/4`,
      // Out-of-scope path — should be ignored.
      `artifacts/${APP_ID}/public/data/be_customers/X`,
    ];
    const tally = mod.tallyByEntity(paths, BASE);
    expect(tally).toEqual({ staff: 3, doctors: 2, courses: 1 });
  });

  it('VNT.D.3 — tallyByEntity skips paths that do NOT start with basePath (safety)', async () => {
    const mod = await import(
      '../scripts/phase-24-0-vicies-novies-ter-wipe-master-data.mjs'
    );
    const tally = mod.tallyByEntity(['a/b/c', 'x/y/z'], 'master_data');
    expect(tally).toEqual({});
  });

  it('VNT.D.4 — tallyByEntity handles empty path list', async () => {
    const mod = await import(
      '../scripts/phase-24-0-vicies-novies-ter-wipe-master-data.mjs'
    );
    expect(mod.tallyByEntity([])).toEqual({});
  });
});
