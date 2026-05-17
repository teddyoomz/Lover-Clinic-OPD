// tests/v82-fix6-pick-first-login-exclude-test-branches.test.js
//
// V82-fix6 (2026-05-17 EOD+3 LATE+3) — regression test for the V81-fix1
// Branch login-empty-skeleton bug.
//
// User report (verbatim): "เวลา Login เข้ามาใหม่ ไม่ว่าจะเมลไหน หน้าจอ
// Frontend และ backend เราจะไม่โหลด DATA อะไรเลย เป็น skeleton โครงเปล่าๆ
// ที่ไม่มีดาต้า user ต้องทำการไป selector เป็น Branch อื่น หรือกด Refresh
// รัวๆ ดาต้าต่างๆถึงปรากฎขึ้น".
//
// ROOT CAUSE: V81 backup verification (2026-05-16) created a TEST-prefixed
// branch (`TEST-V81-TS-BR-1778958484080` = "V81-fix1 Branch") which was the
// NEWEST createdAt → pickFirstLoginDefault returned it for every fresh
// login → 0 data → empty skeleton until user manually switched.
//
// CLASS-OF-BUG: V12 multi-reader-sweep family at first-login-default
// resolution boundary. Mirrors V33.10/.11/.12/.13/.14 TEST-prefix
// discipline (already enforced for opd_sessions / stock / sale /
// appointment / deposit IDs).
//
// FIX: pickFirstLoginDefault now drops TEST-/E2E- prefixed branches BEFORE
// applying access filter + sort. User CAN still manually pick a TEST branch
// via the dropdown; only the auto-default skips them.

import { describe, it, expect } from 'vitest';
import { __pickFirstLoginDefaultForTest, __isTestBranchIdForTest } from '../src/lib/BranchContext.jsx';

describe('V82-fix6 — A. isTestBranchId helper', () => {
  it('A.1 — TEST- prefix returns true', () => {
    expect(__isTestBranchIdForTest('TEST-V81-TS-BR-1778958484080')).toBe(true);
    expect(__isTestBranchIdForTest('TEST-BR-foo')).toBe(true);
    expect(__isTestBranchIdForTest('TEST-')).toBe(true);
  });

  it('A.2 — E2E- prefix returns true', () => {
    expect(__isTestBranchIdForTest('E2E-BR-foo')).toBe(true);
    expect(__isTestBranchIdForTest('E2E-V82-X')).toBe(true);
  });

  it('A.3 — production branchId returns false', () => {
    expect(__isTestBranchIdForTest('BR-1777873556815-26df6480')).toBe(false); // NAKHON
    expect(__isTestBranchIdForTest('BR-1777885958735-38afbdeb')).toBe(false); // พระราม 3
    expect(__isTestBranchIdForTest('BR-foo')).toBe(false);
  });

  it('A.4 — adversarial: null / empty / non-string', () => {
    expect(__isTestBranchIdForTest(null)).toBe(false);
    expect(__isTestBranchIdForTest(undefined)).toBe(false);
    expect(__isTestBranchIdForTest('')).toBe(false);
    expect(__isTestBranchIdForTest(0)).toBe(false);
  });

  it('A.5 — case-sensitive: lowercase test- does NOT match (intentional)', () => {
    // Stays strict to match the exact convention used by V33.10/.11/.12 helpers.
    expect(__isTestBranchIdForTest('test-foo')).toBe(false);
    expect(__isTestBranchIdForTest('e2e-foo')).toBe(false);
  });
});

describe('V82-fix6 — B. pickFirstLoginDefault drops TEST-/E2E- branches', () => {
  const NAKHON = { branchId: 'BR-1777873556815-26df6480', name: 'นครราชสีมา', createdAt: '2026-04-26' };
  const PRAM3  = { branchId: 'BR-1777885958735-38afbdeb', name: 'พระราม 3', createdAt: '2026-05-04' };
  const THDLOG1 = { branchId: 'BR-1778136097138-98199ef5', name: 'ทดลอง 1', createdAt: '2026-05-06' };
  const V81_TEST = { branchId: 'TEST-V81-TS-BR-1778958484080', name: 'V81-fix1 Branch', createdAt: '2026-05-16' }; // NEWEST — pre-V82-fix6 would win
  const E2E_TEST = { branchId: 'E2E-BR-foo', name: 'E2E playground', createdAt: '2026-05-17' };

  it('B.1 — V81-fix1 Branch (TEST-) EXCLUDED from default; ทดลอง 1 wins instead', () => {
    const id = __pickFirstLoginDefaultForTest({
      branches: [NAKHON, PRAM3, THDLOG1, V81_TEST],
      accessibleBranchIds: [],
    });
    expect(id).toBe('BR-1778136097138-98199ef5'); // ทดลอง 1 (next-newest non-TEST)
  });

  it('B.2 — E2E-prefixed also excluded', () => {
    const id = __pickFirstLoginDefaultForTest({
      branches: [NAKHON, E2E_TEST],
      accessibleBranchIds: [],
    });
    expect(id).toBe('BR-1777873556815-26df6480'); // NAKHON (only non-TEST)
  });

  it('B.3 — both TEST + E2E excluded; NAKHON wins', () => {
    const id = __pickFirstLoginDefaultForTest({
      branches: [NAKHON, V81_TEST, E2E_TEST],
      accessibleBranchIds: [],
    });
    expect(id).toBe('BR-1777873556815-26df6480'); // NAKHON
  });

  it('B.4 — when ONLY TEST branches exist, returns null', () => {
    const id = __pickFirstLoginDefaultForTest({
      branches: [V81_TEST, E2E_TEST],
      accessibleBranchIds: [],
    });
    expect(id).toBe(null);
  });

  it('B.5 — accessFilter overrides do not re-include TEST branches', () => {
    // Even if a staff has access to TEST branches explicitly, default still skips them
    const id = __pickFirstLoginDefaultForTest({
      branches: [NAKHON, V81_TEST],
      accessibleBranchIds: ['TEST-V81-TS-BR-1778958484080', 'BR-1777873556815-26df6480'],
    });
    expect(id).toBe('BR-1777873556815-26df6480'); // NAKHON, not the TEST one even though accessible
  });

  it('B.6 — empty branches → null', () => {
    expect(__pickFirstLoginDefaultForTest({ branches: [], accessibleBranchIds: [] })).toBe(null);
    expect(__pickFirstLoginDefaultForTest({ branches: null, accessibleBranchIds: [] })).toBe(null);
  });

  it('B.7 — newest-first sort preserved among non-TEST branches', () => {
    const id = __pickFirstLoginDefaultForTest({
      branches: [NAKHON, PRAM3, THDLOG1],
      accessibleBranchIds: [],
    });
    expect(id).toBe('BR-1778136097138-98199ef5'); // ทดลอง 1 (newest non-TEST)
  });

  it('B.8 — pre-V82-fix6 BUG REPRO documented: WOULD have returned V81-fix1 Branch', () => {
    // Reproduction of the pre-V82-fix6 behavior:
    // Without the TEST-exclude filter, sort by createdAt DESC put V81-fix1 first.
    // This is what the user experienced as "empty skeleton" on every login.
    const sortedDesc = [NAKHON, PRAM3, THDLOG1, V81_TEST].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    expect(sortedDesc[0].branchId).toBe('TEST-V81-TS-BR-1778958484080');
    // Post-V82-fix6, this entry is filtered out BEFORE sort, so it doesn't win.
    expect(__pickFirstLoginDefaultForTest({
      branches: [NAKHON, PRAM3, THDLOG1, V81_TEST],
      accessibleBranchIds: [],
    })).not.toBe('TEST-V81-TS-BR-1778958484080');
  });
});

describe('V82-fix6 — C. PermissionGroupsTab M9 + Backfill button strip (source-grep)', () => {
  it('C.1 — PermissionGroupsTab.jsx does NOT import M9/Backfill helpers (import statements only)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('src/components/backend/PermissionGroupsTab.jsx', 'utf8');
    // Strip line comments + block comments to allow the V82-fix6 explanation comment
    // to mention the removed helper names without failing the regression check.
    const codeOnly = src
      .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
      .replace(/\/\/[^\n]*$/gm, '');    // line comments
    expect(codeOnly).not.toMatch(/import\s*\{[^}]*\breconcileAllCustomerSummaries\b/);
    expect(codeOnly).not.toMatch(/import\s*\{[^}]*\blistCoursesNeedingMigration\b/);
    expect(codeOnly).not.toMatch(/import\s*\{[^}]*\bcommitCoursesSkipStockMigration\b/);
    expect(codeOnly).not.toMatch(/from\s+['"][^'"]*migrateCoursesSkipStockClient/);
  });

  it('C.2 — PermissionGroupsTab.jsx does NOT render M9/Backfill cards', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('src/components/backend/PermissionGroupsTab.jsx', 'utf8');
    expect(src).not.toContain('m9-reconciler-card');
    expect(src).not.toContain('m9-reconcile-btn');
    expect(src).not.toContain('course-skip-stock-migrate-card');
    expect(src).not.toContain('course-skip-stock-migrate-btn');
    expect(src).not.toContain('สรุปยอดลูกค้าใหม่');
    expect(src).not.toContain('Backfill flag');
  });

  it('C.3 — V82-fix6 marker comment present', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('src/components/backend/PermissionGroupsTab.jsx', 'utf8');
    expect(src).toMatch(/V82-fix6.*REMOVED/);
  });
});
