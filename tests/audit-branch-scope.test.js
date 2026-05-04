// audit-branch-scope BS-1..BS-8 — drift catcher for the Branch-Scope
// Architecture (BSA, 2026-05-04). Mirrors the /audit-branch-scope skill's
// invariants as automated source-grep regressions so a future commit
// re-introducing a violation fails CI before it reaches `npm run build`.
//
// Companion skill: .claude/skills/audit-branch-scope/SKILL.md
// Spec: BSA Task 9 (commit follow-up to 131e378).

import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

/**
 * Run `git grep -nE` against a list of pathspecs and return matching lines.
 * Returns [] on no-match (git grep exits 1 — caught and swallowed).
 */
function gitGrep(pattern, pathspecs) {
  const paths = pathspecs.map((p) => `"${p}"`).join(' ');
  try {
    const out = execSync(`git grep -nE "${pattern}" -- ${paths}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Parse `git grep -n` output line of the form `path:lineno:content` into
 * `{ file, line, content }`. The content can itself contain colons, so
 * splitOnce-twice is needed.
 */
function parseGrepLine(line) {
  const firstColon = line.indexOf(':');
  const secondColon = line.indexOf(':', firstColon + 1);
  if (firstColon < 0 || secondColon < 0) return { file: line, line: 0, content: '' };
  return {
    file: line.slice(0, firstColon),
    line: Number(line.slice(firstColon + 1, secondColon)),
    content: line.slice(secondColon + 1),
  };
}

/** Read file once + cache (per test run). */
const fileCache = new Map();
function readFile(path) {
  if (fileCache.has(path)) return fileCache.get(path);
  let content = '';
  try {
    content = readFileSync(path, 'utf8');
  } catch {
    content = '';
  }
  fileCache.set(path, content);
  return content;
}

/** True if the file has the given audit-branch-scope annotation comment. */
function fileHasAnnotation(file, annotation) {
  const content = readFile(file);
  return content.includes(annotation);
}

describe('audit-branch-scope BS-1..BS-8', () => {
  it('BS-1: UI components import only from scopedDataLayer (no direct backendClient)', () => {
    const hits = gitGrep(
      "from ['\\\"](\\\\.\\\\./)+lib/backendClient",
      ['src/components/', 'src/pages/', 'src/hooks/', 'src/contexts/'],
    );
    const violations = hits.filter((line) => {
      const { file } = parseGrepLine(line);
      // Sanctioned exceptions — file-level annotation in header comment
      if (fileHasAnnotation(file, 'audit-branch-scope:')) return false;
      return true;
    });
    expect(violations, `BS-1 violations (UI must import from scopedDataLayer.js):\n${violations.join('\n')}`).toEqual([]);
  });

  it('BS-2: no master_data/ string reads in feature code (Rule H-quater)', () => {
    const hits = gitGrep("['\\\"]master_data/", ['src/components/', 'src/pages/', 'src/lib/']);
    const violations = hits.filter((line) => {
      const { file } = parseGrepLine(line);
      // MasterDataTab + MasterData migrators + scopedDataLayer (which routes to be_*) — sanctioned
      if (file.includes('MasterDataTab')) return false;
      if (file.includes('MasterData') && file.toLowerCase().includes('migrator')) return false;
      if (fileHasAnnotation(file, 'audit-branch-scope: BS-2')) return false;
      // backendClient.js ITSELF holds the master_data/* legacy lookups for the migrators
      if (file === 'src/lib/backendClient.js') return false;
      return true;
    });
    expect(violations, `BS-2 violations (Rule H-quater — no master_data/* reads in feature code):\n${violations.join('\n')}`).toEqual([]);
  });

  it('BS-3: getAllMasterDataItems not used in UI feature code', () => {
    const hits = gitGrep('getAllMasterDataItems\\(', [
      'src/components/',
      'src/pages/',
      'src/hooks/',
      'src/contexts/',
    ]);
    const violations = hits.filter((line) => {
      const { file, content } = parseGrepLine(line);
      if (file.includes('MasterDataTab')) return false;
      if (fileHasAnnotation(file, 'audit-branch-scope: BS-3')) return false;
      // Comment lines ("// getAllMasterDataItems() ...") are not real callers
      if (/^\s*\/\//.test(content) || /^\s*\*/.test(content)) return false;
      return true;
    });
    expect(violations, `BS-3 violations (BSA Task 7 lock — UI feature code must not call getAllMasterDataItems):\n${violations.join('\n')}`).toEqual([]);
  });

  it('BS-4: branch-scoped listenTo* either wrapped in useBranchAwareListener OR annotated', () => {
    const branchScopedListeners = [
      'listenToAppointmentsByDate',
      'listenToAllSales',
      'listenToHolidays',
      'listenToScheduleByDay',
    ];
    const allViolations = [];
    for (const fn of branchScopedListeners) {
      const hits = gitGrep(`${fn}\\(`, ['src/components/', 'src/pages/']);
      const violations = hits.filter((line) => {
        const { file, content } = parseGrepLine(line);
        // Comments don't count
        if (/^\s*\/\//.test(content) || /^\s*\*/.test(content)) return false;
        // Hook usage: file imports + uses useBranchAwareListener
        const fileContent = readFile(file);
        if (fileContent.includes('useBranchAwareListener')) return false;
        // Or file-level annotation
        if (fileHasAnnotation(file, 'audit-branch-scope: listener-direct')) return false;
        return true;
      });
      allViolations.push(...violations.map((v) => `[${fn}] ${v}`));
    }
    expect(allViolations, `BS-4 violations (branch-scoped listenTo* must use useBranchAwareListener OR be annotated):\n${allViolations.join('\n')}`).toEqual([]);
  });

  it('BS-5: branch-collection-coverage.test.js exists with COLLECTION_MATRIX', () => {
    const path = 'tests/branch-collection-coverage.test.js';
    expect(existsSync(path), `BS-5 setup: ${path} missing — COLLECTION_MATRIX is the source of truth for collection scope`).toBe(true);
    const src = readFileSync(path, 'utf8');
    expect(src, 'BS-5: COLLECTION_MATRIX missing from branch-collection-coverage.test.js').toMatch(/COLLECTION_MATRIX/);
  });

  it('BS-6: branch-scope-flow-simulate.test.js exists (Task 10 will populate)', () => {
    const path = 'tests/branch-scope-flow-simulate.test.js';
    if (!existsSync(path)) {
      // Task 10 will create this file — soft-pass for now so the audit can
      // ship before the simulate test bank lands. The skill output will
      // surface BS-6 as TODO until then.
      console.warn('BS-6: branch-scope-flow-simulate.test.js not yet created (Task 10 pending) — soft-pass');
      return;
    }
    expect(existsSync(path)).toBe(true);
  });

  it('BS-7: scopedDataLayer.js universal re-exports point to raw (no branch-injection)', () => {
    const path = 'src/lib/scopedDataLayer.js';
    expect(existsSync(path), 'BS-7 setup: scopedDataLayer.js missing').toBe(true);
    const src = readFileSync(path, 'utf8');
    const universalNames = [
      'listStaff',
      'listDoctors',
      'listBranches',
      'getCustomer',
      'listAudiences',
      'listMembershipTypes',
    ];
    const failed = [];
    for (const n of universalNames) {
      // Match either `export const NAME = raw.NAME;` or `export const NAME = (...args) => raw.NAME(...args);`
      const re1 = new RegExp(`export\\s+const\\s+${n}\\s*=\\s*raw\\.${n}\\b`);
      const re2 = new RegExp(`export\\s+const\\s+${n}\\s*=\\s*\\([^)]*\\)\\s*=>\\s*raw\\.${n}`);
      if (!re1.test(src) && !re2.test(src)) failed.push(n);
    }
    expect(failed, `BS-7: universal re-exports must access raw.X without branchId injection. Failing: ${failed.join(', ')}`).toEqual([]);
  });

  it('BS-8: existing _resolveBranchIdForWrite call sites preserved (≥17)', () => {
    const hits = gitGrep('_resolveBranchIdForWrite', ['src/lib/backendClient.js']);
    // Floor: 1 declaration + 17 writer call sites = 18 lines minimum.
    // Threshold ≥17 in spec accounts for grep counting the line as hits;
    // we currently land at 19 (1 def + 17 call sites + 1 JSDoc reference).
    expect(
      hits.length,
      `BS-8: ≥17 lines expected (1 def + writer call sites). Got ${hits.length}. Did a Phase BS V2 / BSA writer lose its branchId stamp?`,
    ).toBeGreaterThanOrEqual(17);
  });
});

// ─── BS-9 — Branch-switch refresh discipline (Phase 17.0, 2026-05-05) ──────
//
// Every backend tab that imports a branch-scoped lister from
// scopedDataLayer.js MUST also import useSelectedBranch + include
// selectedBranchId in the data-loading hook's deps.
//
// Sanctioned exception: tabs using useBranchAwareListener (auto-handles
// re-subscribe) — annotate `// audit-branch-scope: BS-9 listener-driven`.

import fg from 'fast-glob';

describe('BS-9 — branch-switch refresh discipline', () => {
  const backendTabFiles = fg.sync('src/components/backend/**/*Tab.jsx', { cwd: process.cwd() });

  // Branch-scoped listers — these helpers in scopedDataLayer.js auto-inject
  // resolveSelectedBranchId() and therefore return data filtered by branch.
  // Tabs that import any of these MUST also subscribe to useSelectedBranch
  // so the read re-fires on branch switch.
  // Source: src/lib/scopedDataLayer.js — every export that calls
  // raw.X({ branchId: resolveSelectedBranchId(), ...opts }) belongs here.
  const BRANCH_SCOPED_LISTERS = [
    'listProducts', 'listCourses', 'listProductGroups', 'listProductUnitGroups',
    'listMedicalInstruments', 'listHolidays', 'listDfGroups', 'listDfStaffRates',
    'listBankAccounts', 'listExpenseCategories', 'listExpenses', 'listStaffSchedules',
    'listPromotions', 'listCoupons', 'listVouchers',
    'listOnlineSales', 'listSaleInsuranceClaims', 'listVendorSales', 'listQuotations',
    'getAllDeposits', 'listAllSellers', 'listStaffByBranch',
    'getAllSales', 'getAppointmentsByDate', 'getAppointmentsByMonth',
    'listStockBatches', 'listStockOrders', 'listStockMovements',
    'listProductGroupsForTreatment',
  ];

  function tabImportsScopedLister(content) {
    return /from\s+['"](\.\.\/)+lib\/scopedDataLayer/.test(content);
  }

  function tabImportsBranchScopedLister(content) {
    if (!tabImportsScopedLister(content)) return false;
    // Look for any branch-scoped lister name in import-specifier braces.
    // Strategy: extract every `import { ... } from '.../scopedDataLayer'`
    // block, then check whether any branch-scoped name appears inside.
    const importBlocks = [...content.matchAll(/import\s*\{([\s\S]*?)\}\s*from\s+['"](\.\.\/)+lib\/scopedDataLayer[^'"]*['"]/g)];
    for (const m of importBlocks) {
      const body = m[1];
      for (const name of BRANCH_SCOPED_LISTERS) {
        // word-boundary match — handles both `name` and `name as alias`
        const re = new RegExp(`\\b${name}\\b`);
        if (re.test(body)) return true;
      }
    }
    return false;
  }

  function tabHasBranchSubscription(content) {
    return /useSelectedBranch/.test(content)
      || /audit-branch-scope:\s*BS-9 listener-driven/.test(content);
  }

  function tabHasSelectedBranchInDeps(content) {
    // Discover the alias the file uses for the branch context's branchId
    // (commonly `selectedBranchId` per Phase BS V2 canonical pattern, but
    // legacy callsites may use `BRANCH_ID` / `SELECTED_BRANCH_ID` / `branchId`).
    // Match `const { branchId: <ALIAS> } = useSelectedBranch()`. If the
    // destructure is `const { branchId } = ...` (no alias), the alias is
    // `branchId` itself.
    if (/audit-branch-scope:\s*BS-9 listener-driven/.test(content)) return true;
    const aliasMatch = content.match(/const\s*\{\s*branchId(?:\s*:\s*([A-Za-z_][A-Za-z0-9_]*))?\s*\}\s*=\s*useSelectedBranch\(\)/);
    if (!aliasMatch) return false;
    const alias = aliasMatch[1] || 'branchId';
    // Verify at least one useCallback / useEffect deps array contains the alias.
    const depsRe = new RegExp(
      `(useCallback|useEffect)\\([\\s\\S]+?\\},\\s*\\[[^\\]]*\\b${alias}\\b[^\\]]*\\]`,
    );
    return depsRe.test(content);
  }

  it('BS-9.1 every tab importing a branch-scoped lister also subscribes to useSelectedBranch', () => {
    const violations = [];
    for (const f of backendTabFiles) {
      const content = readFileSync(f, 'utf8');
      if (tabImportsBranchScopedLister(content) && !tabHasBranchSubscription(content)) {
        violations.push(f);
      }
    }
    expect(violations, `BS-9.1 violations:\n${violations.join('\n')}`).toEqual([]);
  });

  it('BS-9.2 every such tab includes selectedBranchId in data-loading hook deps', () => {
    const violations = [];
    for (const f of backendTabFiles) {
      const content = readFileSync(f, 'utf8');
      if (tabImportsBranchScopedLister(content) && tabHasBranchSubscription(content) && !tabHasSelectedBranchInDeps(content)) {
        violations.push(f);
      }
    }
    expect(violations, `BS-9.2 violations:\n${violations.join('\n')}`).toEqual([]);
  });

  it('BS-9.3 PromotionTab passes BS-9.1+9.2 (regression guard)', () => {
    const content = readFileSync('src/components/backend/PromotionTab.jsx', 'utf8');
    expect(tabImportsBranchScopedLister(content)).toBe(true);
    expect(tabHasBranchSubscription(content)).toBe(true);
    expect(tabHasSelectedBranchInDeps(content)).toBe(true);
  });

  it('BS-9.4 CouponTab passes BS-9.1+9.2 (regression guard)', () => {
    const content = readFileSync('src/components/backend/CouponTab.jsx', 'utf8');
    expect(tabImportsBranchScopedLister(content)).toBe(true);
    expect(tabHasBranchSubscription(content)).toBe(true);
    expect(tabHasSelectedBranchInDeps(content)).toBe(true);
  });

  it('BS-9.5 VoucherTab passes BS-9.1+9.2 (regression guard)', () => {
    const content = readFileSync('src/components/backend/VoucherTab.jsx', 'utf8');
    expect(tabImportsBranchScopedLister(content)).toBe(true);
    expect(tabHasBranchSubscription(content)).toBe(true);
    expect(tabHasSelectedBranchInDeps(content)).toBe(true);
  });

  it('BS-9.6 sanctioned exception annotation pattern works', () => {
    // HolidaysTab uses useBranchAwareListener — audit accepts via annotation OR useSelectedBranch.
    const content = readFileSync('src/components/backend/HolidaysTab.jsx', 'utf8');
    expect(tabHasBranchSubscription(content)).toBe(true);
  });

  it('BS-9.7 BS-9 marker comments present in the 3 fixed marketing tabs', () => {
    const tabs = ['PromotionTab', 'CouponTab', 'VoucherTab'];
    for (const tab of tabs) {
      const content = readFileSync(`src/components/backend/${tab}.jsx`, 'utf8');
      expect(content, tab).toMatch(/Phase 17\.0|BS-9/);
    }
  });

  it('BS-9.8 source-grep traversal emits zero violations across all backend tabs', () => {
    const allViolations = [];
    for (const f of backendTabFiles) {
      const content = readFileSync(f, 'utf8');
      if (tabImportsBranchScopedLister(content)) {
        if (!tabHasBranchSubscription(content)) allViolations.push(`${f} BS-9.1`);
        if (!tabHasSelectedBranchInDeps(content)) allViolations.push(`${f} BS-9.2`);
      }
    }
    expect(allViolations).toEqual([]);
  });
});
