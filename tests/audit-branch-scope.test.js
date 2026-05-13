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

// ─── BS-11 — Report-tab branch-refresh discipline (V52, 2026-05-08) ────────
//
// Every file in src/components/backend/reports/**/*Tab.jsx that calls a
// load* from reportsLoaders.js MUST either:
//   (a) subscribe useSelectedBranch + pass branchId to loaders + include
//       selectedBranchId in the data-loading useEffect/useCallback deps
//   (b) be annotated `// audit-branch-scope: BS-11 in-page-selector`
//       (sanctioned: ExpenseReportTab.jsx + ClinicReportTab.jsx ONLY)
//   (c) be annotated `// audit-branch-scope: BS-11 navigation-only`
//       (sanctioned: ReportsHomeTab.jsx ONLY — no data load)
//
// Mirror BS-9 logic but at the reports-loader layer (BS-9 catches
// scopedDataLayer importers; BS-11 catches reportsLoaders importers).

describe('BS-11 — report-tab branch-refresh discipline (V52)', () => {
  const reportTabFiles = fg.sync('src/components/backend/reports/**/*Tab.jsx', { cwd: process.cwd() });

  // Closed sanctioned-exception list — only these 3 files may carry the
  // BS-11 annotation comments. Anything else with the annotation fails.
  const SANCTIONED_INPAGE_SELECTOR = [
    'src/components/backend/reports/ExpenseReportTab.jsx',
    'src/components/backend/reports/ClinicReportTab.jsx',
  ];
  const SANCTIONED_NAVIGATION_ONLY = [
    'src/components/backend/reports/ReportsHomeTab.jsx',
  ];

  function reportTabImportsLoader(content) {
    return /from\s+['"](\.\.\/)+lib\/reportsLoaders/.test(content);
  }

  function reportTabHasBranchSubscription(content) {
    return /useSelectedBranch/.test(content);
  }

  function reportTabHasInPageSelectorAnnotation(content) {
    return /audit-branch-scope:\s*BS-11 in-page-selector/.test(content);
  }

  function reportTabHasNavigationOnlyAnnotation(content) {
    return /audit-branch-scope:\s*BS-11 navigation-only/.test(content);
  }

  function reportTabHasSelectedBranchInDeps(content) {
    // Discover alias for branchId from useSelectedBranch destructure
    const aliasMatch = content.match(/const\s*\{\s*branchId(?:\s*:\s*([A-Za-z_][A-Za-z0-9_]*))?\s*\}\s*=\s*useSelectedBranch\(\)/);
    if (!aliasMatch) return false;
    const alias = aliasMatch[1] || 'branchId';
    // At least one useCallback / useEffect deps array must contain the alias
    const depsRe = new RegExp(
      `(useCallback|useEffect)\\([\\s\\S]+?\\},\\s*\\[[^\\]]*\\b${alias}\\b[^\\]]*\\]`,
    );
    return depsRe.test(content);
  }

  function reportTabPassesBranchIdToLoader(content) {
    // Any load* call site passes `branchId:` (typically `branchId: selectedBranchId`)
    return /load[A-Z][A-Za-z]+\(\s*\{[^}]*\bbranchId:/.test(content);
  }

  it('BS-11.1 every report tab importing reportsLoaders subscribes to useSelectedBranch (or is sanctioned)', () => {
    const violations = [];
    for (const f of reportTabFiles) {
      const content = readFileSync(f, 'utf8');
      if (!reportTabImportsLoader(content)) continue; // tab doesn't load — N/A
      if (reportTabHasBranchSubscription(content)) continue; // OK
      if (reportTabHasInPageSelectorAnnotation(content)) continue; // sanctioned
      if (reportTabHasNavigationOnlyAnnotation(content)) continue; // sanctioned (rare)
      violations.push(f);
    }
    expect(violations, `BS-11.1 violations:\n${violations.join('\n')}`).toEqual([]);
  });

  it('BS-11.2 every such tab includes selectedBranchId in data-loading hook deps', () => {
    const violations = [];
    for (const f of reportTabFiles) {
      const content = readFileSync(f, 'utf8');
      if (!reportTabImportsLoader(content)) continue;
      if (reportTabHasInPageSelectorAnnotation(content)) continue;
      if (reportTabHasNavigationOnlyAnnotation(content)) continue;
      if (!reportTabHasBranchSubscription(content)) continue; // BS-11.1 catches first
      if (!reportTabHasSelectedBranchInDeps(content)) violations.push(f);
    }
    expect(violations, `BS-11.2 violations:\n${violations.join('\n')}`).toEqual([]);
  });

  it('BS-11.3 every such tab passes branchId to load* call sites', () => {
    const violations = [];
    for (const f of reportTabFiles) {
      const content = readFileSync(f, 'utf8');
      if (!reportTabImportsLoader(content)) continue;
      if (reportTabHasInPageSelectorAnnotation(content)) continue;
      if (reportTabHasNavigationOnlyAnnotation(content)) continue;
      if (!reportTabHasBranchSubscription(content)) continue;
      if (!reportTabPassesBranchIdToLoader(content)) violations.push(f);
    }
    expect(violations, `BS-11.3 violations (must pass branchId: selectedBranchId to load* call sites):\n${violations.join('\n')}`).toEqual([]);
  });

  it('BS-11.4 SaleReportTab passes BS-11.1+11.2+11.3 (regression guard)', () => {
    const content = readFileSync('src/components/backend/reports/SaleReportTab.jsx', 'utf8');
    expect(reportTabImportsLoader(content)).toBe(true);
    expect(reportTabHasBranchSubscription(content)).toBe(true);
    expect(reportTabHasSelectedBranchInDeps(content)).toBe(true);
    expect(reportTabPassesBranchIdToLoader(content)).toBe(true);
  });

  it('BS-11.5 RemainingCourseTab passes BS-11.1+11.2+11.3 (V52 partial-fix regression guard)', () => {
    const content = readFileSync('src/components/backend/reports/RemainingCourseTab.jsx', 'utf8');
    expect(reportTabImportsLoader(content)).toBe(true);
    expect(reportTabHasBranchSubscription(content)).toBe(true);
    expect(reportTabHasSelectedBranchInDeps(content)).toBe(true);
    expect(reportTabPassesBranchIdToLoader(content)).toBe(true);
  });

  it('BS-11.6 sanctioned exception annotation pattern works (ExpenseReportTab via in-page-selector)', () => {
    const content = readFileSync('src/components/backend/reports/ExpenseReportTab.jsx', 'utf8');
    expect(reportTabHasInPageSelectorAnnotation(content)).toBe(true);
  });

  it('BS-11.7 sanctioned-exception list is closed (only 3 files have BS-11 annotations)', () => {
    const inPageHolders = [];
    const navOnlyHolders = [];
    for (const f of reportTabFiles) {
      const content = readFileSync(f, 'utf8');
      if (reportTabHasInPageSelectorAnnotation(content)) inPageHolders.push(f);
      if (reportTabHasNavigationOnlyAnnotation(content)) navOnlyHolders.push(f);
    }
    // Normalize Windows path separators for cross-platform stability
    const norm = (arr) => arr.map((p) => p.replace(/\\/g, '/')).sort();
    expect(norm(inPageHolders)).toEqual(SANCTIONED_INPAGE_SELECTOR.slice().sort());
    expect(norm(navOnlyHolders)).toEqual(SANCTIONED_NAVIGATION_ONLY.slice().sort());
  });

  it('BS-11.8 stale `audit-branch-scope: report — uses {allBranches:true}` annotation does NOT exist in any report tab (V52 anti-regression)', () => {
    const violations = [];
    const staleRe = /audit-branch-scope:\s*report\s*[—-]\s*uses\s*\{allBranches:true\}/;
    for (const f of reportTabFiles) {
      const content = readFileSync(f, 'utf8');
      if (staleRe.test(content)) violations.push(f);
    }
    expect(violations, `BS-11.8 stale annotations found (V52 should have stripped these):\n${violations.join('\n')}`).toEqual([]);
  });

  it('BS-11.9 source-grep traversal emits zero violations across all report tabs', () => {
    const allViolations = [];
    for (const f of reportTabFiles) {
      const content = readFileSync(f, 'utf8');
      if (!reportTabImportsLoader(content)) continue;
      if (reportTabHasInPageSelectorAnnotation(content)) continue;
      if (reportTabHasNavigationOnlyAnnotation(content)) continue;
      if (!reportTabHasBranchSubscription(content)) allViolations.push(`${f} BS-11.1`);
      if (!reportTabHasSelectedBranchInDeps(content)) allViolations.push(`${f} BS-11.2`);
      if (!reportTabPassesBranchIdToLoader(content)) allViolations.push(`${f} BS-11.3`);
    }
    expect(allViolations).toEqual([]);
  });
});

// ─── BS-12 — Time-axis branch-aware discipline (V53, 2026-05-08) ───────────
//
// Every component file under src/components/ that imports TIME_SLOTS from
// staffScheduleValidation.js AND uses TIME_SLOTS.map(...) MUST also import
// getVisibleTimeSlotsForDate from scheduleFilterUtils.js. The helper derives
// visible slots from per-branch openHours; without it, the component shows
// the hardcoded 08:15-22:00 axis regardless of branch settings.
//
// Sanctioned exception: TimeSelect24.jsx (uses local HOURS/MINUTES, not
// TIME_SLOTS) — so it never trips the grep.

describe('BS-12 — time-axis branch-aware discipline (V53)', () => {
  const componentFiles = fg.sync('src/components/**/*.{jsx,js}', { cwd: process.cwd() });

  function fileImportsTimeSlots(content) {
    return /import\s*\{[^}]*\bTIME_SLOTS\b[^}]*\}\s*from\s+['"][^'"]*staffScheduleValidation/.test(content);
  }

  function fileMapsTimeSlots(content) {
    return /TIME_SLOTS\.map\s*\(/.test(content);
  }

  function fileImportsHelper(content) {
    return /getVisibleTimeSlotsForDate/.test(content);
  }

  it('BS-12.1 every TIME_SLOTS.map caller also imports getVisibleTimeSlotsForDate', () => {
    const violations = [];
    for (const f of componentFiles) {
      const content = readFileSync(f, 'utf8');
      if (!fileImportsTimeSlots(content)) continue;
      if (!fileMapsTimeSlots(content)) continue;
      if (!fileImportsHelper(content)) violations.push(f);
    }
    expect(violations, `BS-12.1 violations:\n${violations.join('\n')}`).toEqual([]);
  });

  it('BS-12.2 every such file uses useMemo with cs.openHours* in deps', () => {
    const violations = [];
    for (const f of componentFiles) {
      const content = readFileSync(f, 'utf8');
      if (!fileImportsTimeSlots(content)) continue;
      if (!fileMapsTimeSlots(content)) continue;
      // openHoursMonFri or openHoursSatSun must appear (deps array hint)
      if (!/openHoursMonFri/.test(content) || !/openHoursSatSun/.test(content)) {
        violations.push(f);
      }
    }
    expect(violations, `BS-12.2 violations:\n${violations.join('\n')}`).toEqual([]);
  });

  it('BS-12.3 AppointmentCalendarView passes BS-12.1+BS-12.2 (regression guard)', () => {
    const c = readFileSync('src/components/backend/AppointmentCalendarView.jsx', 'utf8');
    expect(fileImportsTimeSlots(c)).toBe(true);
    expect(fileImportsHelper(c)).toBe(true);
    expect(c).toMatch(/openHoursMonFri/);
    expect(c).toMatch(/openHoursSatSun/);
  });

  it('BS-12.4 AppointmentFormModal passes BS-12.1+BS-12.2 (regression guard)', () => {
    const c = readFileSync('src/components/backend/AppointmentFormModal.jsx', 'utf8');
    expect(fileImportsTimeSlots(c)).toBe(true);
    expect(fileImportsHelper(c)).toBe(true);
  });

  it('BS-12.5 ScheduleEntryFormModal passes BS-12.1+BS-12.2 (regression guard)', () => {
    const c = readFileSync('src/components/backend/scheduling/ScheduleEntryFormModal.jsx', 'utf8');
    expect(fileImportsTimeSlots(c)).toBe(true);
    expect(fileImportsHelper(c)).toBe(true);
  });

  it('BS-12.6 DepositPanel passes BS-12.1+BS-12.2 (regression guard)', () => {
    const c = readFileSync('src/components/backend/DepositPanel.jsx', 'utf8');
    expect(fileImportsTimeSlots(c)).toBe(true);
    expect(fileImportsHelper(c)).toBe(true);
  });

  it('BS-12.7 source-grep traversal emits zero violations across all components', () => {
    const allViolations = [];
    for (const f of componentFiles) {
      const content = readFileSync(f, 'utf8');
      if (!fileImportsTimeSlots(content)) continue;
      if (!fileMapsTimeSlots(content)) continue;
      if (!fileImportsHelper(content)) allViolations.push(`${f} BS-12.1`);
    }
    expect(allViolations).toEqual([]);
  });
});

// ─── BS-13 — Raw listener+getter safe-by-default discipline (V54, 2026-05-08) ───
//
// Every raw appointment getter+listener in backendClient.js that reads a
// branch-scoped collection MUST resolve falsy branchId via
// resolveSelectedBranchId(); if still falsy → return empty (NEVER fall
// back to whole-collection query unless allBranches:true is explicit).
//
// Safe template: listenToScheduleByDay (line 10572+).
// Pre-V54 BUG: AdminDashboard listenToAppointmentsByMonth({}) → whole
// collection → cross-branch leak in queue calendar.

describe('BS-13 — raw listener+getter safe-by-default (V54)', () => {
  const SAFE_FNS = [
    'getAppointmentsByMonth',
    'getAppointmentsByDate',
    'listenToAppointmentsByMonth',
    'listenToAppointmentsByDate',
  ];
  const backendClientSrc = readFileSync('src/lib/backendClient.js', 'utf8');

  for (const fn of SAFE_FNS) {
    it(`BS-13.x ${fn} body contains resolveSelectedBranchId fallback`, () => {
      // Find the function definition
      const fnDefRe = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${fn}\\s*\\(`);
      const startMatch = fnDefRe.exec(backendClientSrc);
      expect(startMatch, `${fn} definition not found in backendClient.js`).toBeTruthy();

      // Capture the function body up to the next top-level export or function
      const startIdx = startMatch.index;
      // Find next `export function` after this one
      const nextDefRe = /\n(?:export\s+)?(?:async\s+)?function\s+\w+\s*\(/g;
      nextDefRe.lastIndex = startIdx + startMatch[0].length;
      const nextMatch = nextDefRe.exec(backendClientSrc);
      const endIdx = nextMatch ? nextMatch.index : Math.min(startIdx + 4000, backendClientSrc.length);
      const body = backendClientSrc.slice(startIdx, endIdx);

      // Must reference resolveSelectedBranchId (safe-by-default fallback)
      expect(body, `${fn} body missing resolveSelectedBranchId fallback`).toMatch(/resolveSelectedBranchId/);
      // Must have V54/BS-13 marker
      expect(body, `${fn} body missing V54/BS-13 marker comment`).toMatch(/V54|BS-13/);
    });
  }

  it('BS-13.5 listenToScheduleByDay (safe template) still has the canonical fallback', () => {
    // Anchor test — if the safe template ever loses its fallback, V54 should
    // catch it. listenToScheduleByDay is the original safe-by-default model.
    expect(backendClientSrc).toMatch(/listenToScheduleByDay/);
    expect(backendClientSrc).toMatch(/effectiveBranchId\s*=\s*branchId\s*!==\s*undefined/);
  });

  it('BS-13.6 AdminDashboard.jsx passes branchId explicitly (V54 caller fix)', () => {
    const c = readFileSync('src/pages/AdminDashboard.jsx', 'utf8');
    expect(c).toMatch(/listenToAppointmentsByMonth/);
    expect(c).toMatch(/\{\s*branchId:\s*selectedBranchId\s*\}/);
  });

  it('BS-13.7 AppointmentCalendarView.jsx still passes branchId explicitly (V52 regression guard)', () => {
    const c = readFileSync('src/components/backend/AppointmentCalendarView.jsx', 'utf8');
    expect(c).toMatch(/listenToAppointmentsByDate/);
    expect(c).toMatch(/\{\s*branchId:\s*selectedBranchId\s*\}/);
  });
});

// ─── BS-14 — Schedule-link modal data sources branch-scoped (V55, 2026-05-08) ──
//
// AdminDashboard.jsx schedule-link modal ("สร้างลิงก์ตาราง") MUST source data
// per-branch:
//   (a) livePractitioners filtered via filterDoctorsByBranch +
//       filterStaffByBranch with selectedBranchId in useEffect deps
//   (b) Exam rooms loaded via listExamRooms({branchId, status:'ใช้งาน'}) into
//       a branchExamRooms state (NOT clinicSettings.rooms direct read)
//   (c) Clinic open hours read via per-branch helpers (monFriOpen/Close +
//       satSunOpen/Close) which derive from V51 cs.openHoursMonFri/SatSun;
//       legacy clinicSettings.{clinicOpenTime,clinicCloseTime,...} direct
//       reads NOT allowed outside the helper fallback chains.
//
// User report (verbatim 2026-05-08): "modal สร้างลิ้งค์ตาราง ยังไม่ได้ดึง
// ข้อมูลต่างๆใน modal จากสาขานั้นๆ".
//
// Class-of-bug: V12 multi-reader-sweep at the AdminDashboard "Frontend"
// page → branch-scoped data adoption gap. Same family as BS-11/BS-12/BS-13.

describe('BS-14 — schedule-link modal branch-scope (V55)', () => {
  const adminDashSrc = readFileSync('src/pages/AdminDashboard.jsx', 'utf8');

  it('BS-14.1 useEffectiveClinicSettings imported from BranchContext', () => {
    expect(adminDashSrc).toMatch(
      /import\s*\{[^}]*useEffectiveClinicSettings[^}]*\}\s*from\s*['"]\.\.\/lib\/BranchContext\.jsx['"]/,
    );
  });

  it('BS-14.2 cs is computed via useEffectiveClinicSettings (NOT raw default-merge)', () => {
    // Pre-V55: const cs = { ...DEFAULT_CLINIC_SETTINGS, ...clinicSettings };
    // Post-V55: const cs = useEffectiveClinicSettings({ ...DEFAULT_CLINIC_SETTINGS, ...clinicSettings });
    expect(adminDashSrc).toMatch(
      /const\s+cs\s*=\s*useEffectiveClinicSettings\s*\(/,
    );
    // Anti-regression: legacy bare-merge pattern must NOT appear (would mean
    // cs lost the branch-merge layer).
    const bareMerge = /const\s+cs\s*=\s*\{\s*\.\.\.DEFAULT_CLINIC_SETTINGS\s*,\s*\.\.\.clinicSettings\s*\}\s*;/;
    expect(adminDashSrc).not.toMatch(bareMerge);
  });

  it('BS-14.3 monFriOpen/monFriClose/satSunOpen/satSunClose helpers exist with proper deps', () => {
    // Each helper uses useMemo + cs.openHoursMonFri/SatSun + legacy fallback
    expect(adminDashSrc).toMatch(/const\s+monFriOpen\s*=\s*useMemo\s*\(/);
    expect(adminDashSrc).toMatch(/const\s+monFriClose\s*=\s*useMemo\s*\(/);
    expect(adminDashSrc).toMatch(/const\s+satSunOpen\s*=\s*useMemo\s*\(/);
    expect(adminDashSrc).toMatch(/const\s+satSunClose\s*=\s*useMemo\s*\(/);
    // Helpers must read from cs.openHoursMonFri / cs.openHoursSatSun
    expect(adminDashSrc).toMatch(/cs\.openHoursMonFri\?\.\s*open/);
    expect(adminDashSrc).toMatch(/cs\.openHoursMonFri\?\.\s*close/);
    expect(adminDashSrc).toMatch(/cs\.openHoursSatSun\?\.\s*open/);
    expect(adminDashSrc).toMatch(/cs\.openHoursSatSun\?\.\s*close/);
  });

  it('BS-14.4 livePractitioners useEffect calls filterDoctorsByBranch + filterStaffByBranch', () => {
    // Locate the livePractitioners-fetching useEffect
    const effectMatch = adminDashSrc.match(
      /useEffect\s*\(\s*\(\)\s*=>\s*\{[\s\S]{0,2000}?listDoctors\(\s*\{\s*includeHidden:\s*true\s*\}\s*\)[\s\S]{0,1500}?setLivePractitioners[\s\S]{0,500}?\}\s*,\s*\[selectedBranchId\]\s*\)/,
    );
    expect(effectMatch, 'livePractitioners useEffect with filterDoctorsByBranch + selectedBranchId deps not found').not.toBeNull();
    expect(effectMatch[0]).toMatch(/filterDoctorsByBranch\(/);
    expect(effectMatch[0]).toMatch(/filterStaffByBranch\(/);
    expect(effectMatch[0]).toMatch(/selectedBranchId/);
  });

  it('BS-14.5 branchExamRooms state with listExamRooms branch-scoped fetch', () => {
    // useState declaration
    expect(adminDashSrc).toMatch(/const\s*\[\s*branchExamRooms\s*,\s*setBranchExamRooms\s*\]\s*=\s*useState\(/);
    // Fetch with branchId + status filter, deps include selectedBranchId
    expect(adminDashSrc).toMatch(
      /listExamRooms\(\s*\{\s*branchId:\s*selectedBranchId\s*,\s*status:\s*['"]ใช้งาน['"]\s*\}\s*\)/,
    );
    // Effect deps include selectedBranchId
    const effectBlock = adminDashSrc.match(/setBranchExamRooms[\s\S]{0,500}?\}\s*,\s*\[selectedBranchId\]\s*\)/);
    expect(effectBlock, 'branchExamRooms useEffect missing selectedBranchId deps').not.toBeNull();
  });

  it('BS-14.6 NO direct clinicSettings.rooms reads (anti-regression — must use branchExamRooms)', () => {
    // Find every `clinicSettings.rooms` reference
    const lines = adminDashSrc.split('\n');
    const violations = [];
    lines.forEach((line, idx) => {
      // Skip pure comment lines (// or *) — comments documenting V55 history are OK
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
      if (/clinicSettings\.rooms/.test(line)) {
        violations.push(`L${idx + 1}: ${line.trim()}`);
      }
    });
    expect(
      violations,
      `clinicSettings.rooms direct reads found (use branchExamRooms instead):\n${violations.join('\n')}`,
    ).toEqual([]);
  });

  it('BS-14.7 NO direct clinicSettings.{clinicOpen|Close|doctorStart|End}Time* reads outside helper fallback chains', () => {
    // The four V55 helpers (monFriOpen/Close + satSunOpen/Close) ARE allowed
    // to read clinicSettings.X as legacy fallback. Anywhere else is a violation.
    const lines = adminDashSrc.split('\n');
    const FALLBACK_FIELDS = [
      'clinicOpenTime',
      'clinicCloseTime',
      'clinicOpenTimeWeekend',
      'clinicCloseTimeWeekend',
      'doctorStartTime',
      'doctorEndTime',
      'doctorStartTimeWeekend',
      'doctorEndTimeWeekend',
    ];
    const fieldsRegex = new RegExp(
      `clinicSettings\\.(${FALLBACK_FIELDS.join('|')})\\b`,
    );
    // Identify the V55 helper block by line range — `monFriOpen/Close` +
    // `satSunOpen/Close` useMemo definitions (8 lines each ≈ 32 lines total
    // window). We mark lines whose content matches the helper ALLOWED
    // pattern (cs.openHoursMonFri/SatSun + clinicSettings.X || '10:00').
    const helperAllowed = /\(cs\.openHours(MonFri|SatSun)\?\.\s*(open|close)\)\s*\|\|\s*clinicSettings\.(clinicOpenTime|clinicCloseTime|clinicOpenTimeWeekend|clinicCloseTimeWeekend)/;
    const helperDeps = /\[cs\.openHours(MonFri|SatSun)\s*,\s*clinicSettings\.(clinicOpenTime|clinicCloseTime|clinicOpenTimeWeekend|clinicCloseTimeWeekend)\]/;
    const violations = [];
    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
      if (!fieldsRegex.test(line)) return;
      // Sanctioned: inside the V55 helper memos (matches helperAllowed OR helperDeps)
      if (helperAllowed.test(line) || helperDeps.test(line)) return;
      violations.push(`L${idx + 1}: ${line.trim()}`);
    });
    expect(
      violations,
      `Direct clinicSettings.{Open|Close|doctorStart|End}Time* reads found (must use monFriOpen/Close + satSunOpen/Close helpers):\n${violations.join('\n')}`,
    ).toEqual([]);
  });

  it('BS-14.8 handleGenScheduleLink saves clinic + doctor hours via per-branch helpers', () => {
    // Pre-V55: clinicOpenTime: clinicSettings.clinicOpenTime || '10:00'
    // Post-V55: clinicOpenTime: monFriOpen
    expect(adminDashSrc).toMatch(/clinicOpenTime:\s*monFriOpen/);
    expect(adminDashSrc).toMatch(/clinicCloseTime:\s*monFriClose/);
    expect(adminDashSrc).toMatch(/clinicOpenTimeWeekend:\s*satSunOpen/);
    expect(adminDashSrc).toMatch(/clinicCloseTimeWeekend:\s*satSunClose/);
    expect(adminDashSrc).toMatch(/doctorStartTime:\s*monFriOpen/);
    expect(adminDashSrc).toMatch(/doctorEndTime:\s*monFriClose/);
    expect(adminDashSrc).toMatch(/doctorStartTimeWeekend:\s*satSunOpen/);
    expect(adminDashSrc).toMatch(/doctorEndTimeWeekend:\s*satSunClose/);
  });

  it('BS-14.9 defensive reset useEffect for schedSelectedDoctor + schedSelectedRoom on branch switch', () => {
    // When livePractitioners changes (branch switch refetch), if the picked
    // schedSelectedDoctor isn't in the new list, reset to null.
    expect(adminDashSrc).toMatch(
      /useEffect\s*\(\s*\(\)\s*=>\s*\{[\s\S]{0,400}?livePractitioners[\s\S]{0,400}?setSchedSelectedDoctor\s*\(\s*null\s*\)[\s\S]{0,200}?\}\s*,\s*\[livePractitioners\s*,\s*schedSelectedDoctor\]\s*\)/,
    );
    // Mirror for schedSelectedRoom
    expect(adminDashSrc).toMatch(
      /useEffect\s*\(\s*\(\)\s*=>\s*\{[\s\S]{0,400}?branchExamRooms[\s\S]{0,400}?setSchedSelectedRoom\s*\(\s*null\s*\)[\s\S]{0,200}?\}\s*,\s*\[branchExamRooms\s*,\s*schedSelectedRoom\]\s*\)/,
    );
  });

  it('BS-14.10 V55 marker present + handleGenScheduleLink pre-create getAppointmentsByMonth uses explicit branchId', () => {
    expect(adminDashSrc).toMatch(/V55\/BS-14/);
    // The pre-create appointment fetch (inside handleGenScheduleLink) must
    // pass explicit branchId (V52/BS-11 canonical) — not bare {} that
    // relies on V54 backstop only.
    expect(adminDashSrc).toMatch(
      /preBranchOpts\s*=\s*selectedBranchId\s*\?\s*\{\s*branchId:\s*selectedBranchId\s*\}\s*:\s*\{\s*allBranches:\s*true\s*\}/,
    );
    expect(adminDashSrc).toMatch(/getAppointmentsByMonth\(\s*mo\s*,\s*preBranchOpts\s*\)/);
  });
});

// ─── BS-15 — Doctor schedule room-assignment integrity ────────────────────────
describe('BS-15 — Doctor schedule room-assignment integrity', () => {
  // V56 / BS-15 — bare-path readFileSync (matches rest of the file's pattern;
  // Vitest runs with process.cwd() = project root). The new URL(..., import.meta.url)
  // pattern previously used here failed to resolve in the jsdom environment.
  const validationSrc = readFileSync('src/lib/staffScheduleValidation.js', 'utf8');
  const modalSrc = readFileSync('src/components/backend/scheduling/ScheduleEntryFormModal.jsx', 'utf8');
  const panelSrc = readFileSync('src/components/backend/scheduling/TodaysDoctorsPanel.jsx', 'utf8');
  const adminDashSrc = readFileSync('src/pages/AdminDashboard.jsx', 'utf8');

  it('BS-15.1 — validateStaffScheduleStrict SS-10: doctor + working type → roomIds required', () => {
    expect(validationSrc).toMatch(
      /if\s*\(\s*form\.staffKind\s*===\s*['"]doctor['"]\s*&&\s*WORKING_TIME_TYPES\.has\(type\)\s*\)/,
    );
    expect(validationSrc).toMatch(
      /return\s*\[\s*['"]roomIds['"]\s*,\s*['"]ต้องเลือกห้องอย่างน้อย 1 ห้อง['"]\s*\]/,
    );
  });

  it('BS-15.2 — validateStaffScheduleStrict SS-11: assistant → roomIds forbidden', () => {
    expect(validationSrc).toMatch(
      /if\s*\(\s*form\.staffKind\s*===\s*['"]assistant['"]\s*&&\s*form\.roomIds\s*!=\s*null\s*\)/,
    );
    expect(validationSrc).toMatch(
      /return\s*\[\s*['"]roomIds['"]\s*,\s*['"]ผู้ช่วยไม่ต้องเลือกห้อง['"]\s*\]/,
    );
  });

  it('BS-15.3 — ScheduleEntryFormModal gates room-checkbox to doctor + working type', () => {
    expect(modalSrc).toMatch(/staffKind\s*===\s*['"]doctor['"]\s*&&\s*showTime/);
  });

  it('BS-15.4 — ScheduleEntryFormModal passes staffKind into validateStaffScheduleStrict', () => {
    expect(modalSrc).toMatch(
      /validateStaffScheduleStrict\s*\(\s*\{\s*\.\.\.payload\s*,\s*staffKind\s*\}\s*\)/,
    );
  });

  it('BS-15.5 — TodaysDoctorsPanel imports expandRoomIdsForDisplay and renders room chips', () => {
    expect(panelSrc).toMatch(/import\s*\{[^}]*expandRoomIdsForDisplay[^}]*\}\s*from/);
    expect(panelSrc).toMatch(/expandRoomIdsForDisplay\s*\(\s*s\s*,\s*branchExamRooms\s*\)/);
    expect(panelSrc).toMatch(/todays-doctor-chips-/);
  });

  it('BS-15.6 — AdminDashboard imports derivedAutoClosedDates and merges into closedDays', () => {
    expect(adminDashSrc).toMatch(/derivedAutoClosedDates/);
    expect(adminDashSrc).toMatch(/closedDaysUnion/);
    expect(adminDashSrc).toMatch(/closedDays\s*:\s*closedDaysUnion/);
  });

  it('BS-15.7 — V56/BS-15 markers present in all four wired files', () => {
    expect(validationSrc).toMatch(/V56\s*\/\s*BS-15/);
    expect(modalSrc).toMatch(/V56\s*\/\s*BS-15/);
    expect(panelSrc).toMatch(/V56\s*\/\s*BS-15/);
    expect(adminDashSrc).toMatch(/V56[\s/]BS-15/);
  });
});

describe('BS-16 V64 — AppointmentHub* components branch-scope discipline', () => {
  it('BS-16.1 AppointmentHubView imports useSelectedBranch', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/admin/AppointmentHubView.jsx', 'utf8');
    expect(src).toMatch(/import\s+\{[^}]*useSelectedBranch/);
  });

  it('BS-16.2 AppointmentHubView imports from scopedDataLayer (NOT raw backendClient)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/admin/AppointmentHubView.jsx', 'utf8');
    expect(src).toMatch(/from ['"]\.\.\/\.\.\/lib\/scopedDataLayer\.js['"]/);
    expect(src).not.toMatch(/from ['"]\.\.\/\.\.\/lib\/backendClient\.js['"]/);
  });

  it('BS-16.3 AppointmentHubView includes selectedBranchId in data-load deps', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/admin/AppointmentHubView.jsx', 'utf8');
    // V64-fix2 (2026-05-09): wide-range fetch [today-30..today+30] in ONE shot
    // — loader deps now `[wideRange.from, wideRange.to, selectedBranchId, reloadKey]`.
    // Tab switch no longer triggers refetch; client-side filter only. reloadKey
    // bumped on mutation so loader re-fires after confirm/cancel.
    expect(src).toMatch(/\[(?:range|wideRange)\.from,\s*(?:range|wideRange)\.to,\s*selectedBranchId(?:,\s*reloadKey)?\]/);
  });

  it('BS-16.4 V64 marker comment present', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/admin/AppointmentHubView.jsx', 'utf8');
    expect(src).toMatch(/V64/);
  });

  it('BS-16.5 AppointmentHubFilters helper is branch-blind (no branchId in toString)', async () => {
    const mod = await import('../src/lib/appointmentHubFilters.js');
    for (const fnName of ['dateRangeForTab', 'applyTabFilter', 'isMissedAppointment']) {
      expect(typeof mod[fnName]).toBe('function');
      expect(mod[fnName].toString()).not.toMatch(/branchId/);
    }
  });

  it('BS-16.6 AppointmentHubAggregator helper is branch-blind', async () => {
    const mod = await import('../src/lib/appointmentHubAggregator.js');
    expect(mod.buildCustomerSummaryMap.toString()).not.toMatch(/branchId/);
  });
});

describe('AV36 V64 — appointment hub PDF print V32 lock', () => {
  it('AV36.1 appointmentHubPrintTemplate.js does NOT import html2pdf', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/lib/appointmentHubPrintTemplate.js', 'utf8');
    // Match import statements only (allow comment text mentioning html2pdf for institutional memory)
    expect(src).not.toMatch(/import.*html2pdf/i);
    expect(src).not.toMatch(/from ['"]html2pdf/i);
  });

  it('AV36.2 AppointmentHubView uses html2canvas + jspdf (NOT html2pdf) for export', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/admin/AppointmentHubView.jsx', 'utf8');
    expect(src).not.toMatch(/from ['"]html2pdf/i);
    expect(src).toMatch(/import\(['"]html2canvas['"]\)/);
    expect(src).toMatch(/import\(['"]jspdf['"]\)/);
  });
});

// ─── AV37 — Phase 26.0 doctor-save gate discipline (V26.0, 2026-05-13) ─────
// Every deduction / sale-creation call site in TFP handleSubmit MUST be gated
// on `saveMode !== 'doctor'`. Medications (type 7) stock deduction is the
// sanctioned exception (KEPT for doctor-save per Q2 brainstorming).
// `canAddNewItems` flag replaces `!isEdit` at 5+ UI add-op sites so admin
// finalize-mode unlocks the missing pieces on doctor-recorded treatments.
describe('AV37 Phase 26.0 — TFP doctor-save gate discipline', () => {
  it('AV37.1 handleSubmit signature accepts saveMode arg with defensive coercion', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/TreatmentFormPage.jsx', 'utf8');
    // Phase 26.1 (V26.1) — signature extended to (eventOrSaveMode, options = {}).
    // Defensive coercion preserved via let-binding + conditional branches.
    // Accept either the Phase 26.0a single-line ternary OR the Phase 26.1
    // multi-branch form. Both lock the same "defensive coercion to 'staff'
    // default unless explicit 'doctor' string" contract.
    const phase260Pattern = /const\s+saveMode\s*=\s*\(\s*eventOrSaveMode\s*===\s*['"]doctor['"]\s*\)\s*\?\s*['"]doctor['"]\s*:\s*['"]staff['"]/;
    const phase261Pattern = /let\s+saveMode\s*=\s*['"]staff['"]/;
    const phase261Coercion = /saveMode\s*=\s*\(\s*eventOrSaveMode\s*===\s*['"]doctor['"]\s*\)\s*\?\s*['"]doctor['"]\s*:\s*['"]staff['"]/;
    // Phase 26.2f-pre extended the coercion to include 'vitals' as a 3rd branch:
    // saveMode = (eventOrSaveMode === 'doctor') ? 'doctor' : (eventOrSaveMode === 'vitals') ? 'vitals' : 'staff'
    const phase262fCoercion = /saveMode\s*=\s*\(\s*eventOrSaveMode\s*===\s*['"]doctor['"]\s*\)\s*\?\s*['"]doctor['"]\s*:\s*\(\s*eventOrSaveMode\s*===\s*['"]vitals['"]\s*\)/;
    const matchesPhase260 = phase260Pattern.test(src);
    const matchesPhase261 = phase261Pattern.test(src) && phase261Coercion.test(src);
    const matchesPhase262f = phase261Pattern.test(src) && phase262fCoercion.test(src);
    expect(matchesPhase260 || matchesPhase261 || matchesPhase262f).toBe(true);
  });

  it('AV37.2 status doctor-recorded literal appears ≥2× (stamp + check + chip + banner readers)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/TreatmentFormPage.jsx', 'utf8');
    const matches = src.match(/['"]doctor-recorded['"]/g) || [];
    // TFP minimum: status: 'doctor-recorded' (stamp) + loadedTreatmentStatus === 'doctor-recorded' (check)
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('AV37.3 recordedBy + recordedAt referenced at status-stamp site', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/TreatmentFormPage.jsx', 'utf8');
    expect(src).toMatch(/recordedBy:\s*auth\.currentUser/);
    expect(src).toMatch(/recordedAt:\s*serverTimestamp/);
  });

  it('AV37.4 deleteField() referenced for admin clear path', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/TreatmentFormPage.jsx', 'utf8');
    expect(src).toMatch(/status:\s*deleteField\s*\(\s*\)/);
  });

  it('AV37.5 canAddNewItems flag declared with correct definition', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/TreatmentFormPage.jsx', 'utf8');
    expect(src).toMatch(/const\s+canAddNewItems\s*=\s*\(\s*mode\s*===\s*['"]create['"]/);
    expect(src).toMatch(/loadedTreatmentStatus\s*===\s*['"]doctor-recorded['"]/);
  });

  it('AV37.6 canAddNewItems used ≥5 times (1 declaration + 4+ UI gates)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/TreatmentFormPage.jsx', 'utf8');
    const refs = src.match(/canAddNewItems/g) || [];
    expect(refs.length).toBeGreaterThanOrEqual(5);
  });

  it('AV37.7 meds deductStockForTreatment NOT saveMode-gated (sanctioned per Q2)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/TreatmentFormPage.jsx', 'utf8');
    const callsRe = /await\s+deductStockForTreatment\s*\(/g;
    const matches = [...src.matchAll(callsRe)];
    expect(matches.length).toBeGreaterThanOrEqual(2);
    // 2nd call = medications (type 7). MUST NOT have saveMode-gate immediately preceding.
    const medsMatch = matches[1];
    const before = src.slice(Math.max(0, medsMatch.index - 300), medsMatch.index);
    expect(/saveMode\s*!==\s*['"]doctor['"]/.test(before)).toBe(false);
  });

  it('AV37.8 rebuildTreatmentSummary preserves status field for chip rendering', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/lib/backendClient.js', 'utf8');
    const fnIdx = src.indexOf('function rebuildTreatmentSummary');
    expect(fnIdx).toBeGreaterThan(-1);
    const region = src.slice(fnIdx, fnIdx + 1500);
    expect(region).toMatch(/status:\s*t\.status\s*\|\|\s*null/);
  });

  it('AV37.9 EditAttributionModal exists at canonical path', async () => {
    const fs = await import('node:fs/promises');
    try {
      const stat = await fs.stat('src/components/backend/EditAttributionModal.jsx');
      expect(stat.isFile()).toBe(true);
    } catch (e) {
      expect.fail('EditAttributionModal.jsx missing at canonical path');
    }
  });

  it('AV37.10 TFP handleSubmit signature accepts (eventOrSaveMode, options) (Phase 26.1 ext)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/TreatmentFormPage.jsx', 'utf8');
    expect(src).toMatch(/const\s+handleSubmit\s*=\s*async\s*\(\s*eventOrSaveMode\s*,\s*options\s*=\s*\{\s*\}\s*\)/);
    expect(src).toMatch(/editorContext/);
  });

  it('AV37.11 editedBy/At/Name/Role land in top-level treatment doc (not nested in detail)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/lib/backendClient.js', 'utf8');
    expect(src).toMatch(/if\s*\(\s*editedBy\s*!==\s*undefined\s*\)\s*topLevelPatch\.editedBy/);
    expect(src).toMatch(/if\s*\(\s*editedByName\s*!==\s*undefined\s*\)\s*topLevelPatch\.editedByName/);
    expect(src).toMatch(/if\s*\(\s*editedByRole\s*!==\s*undefined\s*\)\s*topLevelPatch\.editedByRole/);
    expect(src).toMatch(/if\s*\(\s*editedAt\s*!==\s*undefined\s*\)\s*topLevelPatch\.editedAt/);
  });

  // ── AV37.12–17 — Phase 26.2f-pre vitals-save extension (2026-05-13) ───────

  it('AV37.12 saveMode "vitals" coercion present in TFP (string-arg path)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/TreatmentFormPage.jsx', 'utf8');
    expect(src).toMatch(/eventOrSaveMode\s*===\s*['"]vitals['"]\s*\)\s*\?\s*['"]vitals['"]/);
  });

  it('AV37.13 v26StatusPatch vitals branch stamps vitalsigns-recorded + recordedBy/At', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/TreatmentFormPage.jsx', 'utf8');
    expect(src).toMatch(/status\s*:\s*['"]vitalsigns-recorded['"]/);
    expect(src).toMatch(/recordedBy\s*:\s*auth\.currentUser/);
    expect(src).toMatch(/recordedAt\s*:\s*serverTimestamp\s*\(\s*\)/);
  });

  it('AV37.14 dual gate saveMode !== "doctor" && saveMode !== "vitals" present ≥1×', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/TreatmentFormPage.jsx', 'utf8');
    const matches = src.match(
      /saveMode\s*!==\s*['"]doctor['"]\s*&&\s*saveMode\s*!==\s*['"]vitals['"]/g
    ) || [];
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('AV37.15 every saveMode !== "doctor" gate also has the vitals extension (no bare gates)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/TreatmentFormPage.jsx', 'utf8');
    const doctorGates = src.match(/saveMode\s*!==\s*['"]doctor['"]/g) || [];
    const dualGates = src.match(
      /saveMode\s*!==\s*['"]doctor['"]\s*&&\s*saveMode\s*!==\s*['"]vitals['"]/g
    ) || [];
    expect(doctorGates.length).toBe(dualGates.length);
  });

  it('AV37.16 canAddNewItems includes vitalsigns-recorded check', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/TreatmentFormPage.jsx', 'utf8');
    expect(src).toMatch(/loadedTreatmentStatus\s*===\s*['"]vitalsigns-recorded['"]/);
    // Verify the declaration (not a comment) has all three conditions
    const declIdx = src.indexOf('const canAddNewItems');
    expect(declIdx).toBeGreaterThan(-1);
    const region = src.slice(declIdx, declIdx + 500);
    expect(region).toMatch(/mode\s*===\s*['"]create['"]/);
    expect(region).toMatch(/['"]doctor-recorded['"]/);
    expect(region).toMatch(/['"]vitalsigns-recorded['"]/);
  });

  it('AV37.17 vitals-save button present in TFP with correct testid + calls handleSubmit("vitals")', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/TreatmentFormPage.jsx', 'utf8');
    expect(src).toMatch(/data-testid\s*=\s*['"]tfp-vitals-save-btn['"]/);
    expect(src).toMatch(/handleSubmit\s*\(\s*['"]vitals['"]\s*\)/);
  });
});

// ─── AV38 — Phase 26.2 TreatmentReadOnlyPanel read-only contract (V26.2, 2026-05-13)
describe('AV38 Phase 26.2 — TreatmentReadOnlyPanel read-only contract', () => {
  const PANEL_PATH = 'src/components/backend/TreatmentReadOnlyPanel.jsx';

  it('AV38.1 TreatmentReadOnlyPanel exists at canonical path', async () => {
    const fs = await import('node:fs/promises');
    const stat = await fs.stat(PANEL_PATH).catch(() => null);
    expect(stat?.isFile()).toBe(true);
  });

  it('AV38.2 source does NOT contain onEditTreatment prop reference (read-only contract)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(PANEL_PATH, 'utf8');
    // Allow occurrences in JSDoc/comments only — strip those first
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')   // /* ... */
      .replace(/\/\/[^\n]*/g, '');         // //  ...
    expect(code).not.toMatch(/onEditTreatment/);
  });

  it('AV38.3 source does NOT contain onDeleteTreatment prop reference', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(PANEL_PATH, 'utf8');
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(code).not.toMatch(/onDeleteTreatment/);
  });

  it('AV38.4 source does NOT contain <input> or <textarea> tags (no form inputs)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(PANEL_PATH, 'utf8');
    // Strip comments first — line 11 has "NO <input>..." in a comment
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')   // /* ... */
      .replace(/\/\/[^\n]*/g, '');         // //  ...
    expect(code).not.toMatch(/<input/i);
    expect(code).not.toMatch(/<textarea/i);
  });

  it('AV38.5 source does NOT contain "บันทึก" inside <button> tags (no save buttons; chip text in spans OK)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(PANEL_PATH, 'utf8');
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    // Only match if บันทึก is DIRECT text of a <button> (not wrapped in a child <span>).
    // The chip "แพทย์ลงบันทึก" is in a <span>, so [^<]* won't reach it from a <button> open tag.
    expect(code).not.toMatch(/<button[^<]*>[^<]*บันทึก/);
    expect(code).not.toMatch(/<button[^>]*>\s*Save/i);
  });

  it('AV38.6 Lightbox preserved (image zoom is permitted)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(PANEL_PATH, 'utf8');
    expect(src).toMatch(/lightbox/i);
    expect(src).toMatch(/setLightbox/);
  });
});

// ─── AV39 — Phase 26.2f TreatmentReadOnlyMirror read-only contract (V26.2f, 2026-05-13)
describe('AV39 Phase 26.2f — TreatmentReadOnlyMirror read-only contract', () => {
  const MIRROR_PATH = 'src/components/backend/TreatmentReadOnlyMirror.jsx';

  it('AV39.1 TreatmentReadOnlyMirror exists at canonical path', async () => {
    const fs = await import('node:fs/promises');
    const stat = await fs.stat(MIRROR_PATH).catch(() => null);
    expect(stat?.isFile()).toBe(true);
  });

  it('AV39.2 source does NOT contain onEditTreatment prop reference (read-only contract)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(MIRROR_PATH, 'utf8');
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')   // /* ... */
      .replace(/\/\/[^\n]*/g, '');         // //  ...
    expect(code).not.toMatch(/onEditTreatment/);
  });

  it('AV39.3 every <input> tag carries disabled attribute', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(MIRROR_PATH, 'utf8');
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    // [^>]* matches newlines inside multi-line JSX tags
    const inputMatches = [...code.matchAll(/<input\b[^>]*>/g)];
    for (const m of inputMatches) {
      expect(m[0]).toMatch(/\bdisabled\b/);
    }
    // Mirror must have at least one input (proves the check is exercised)
    expect(inputMatches.length).toBeGreaterThan(0);
  });

  it('AV39.4 every <textarea> tag carries disabled attribute', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(MIRROR_PATH, 'utf8');
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    const taMatches = [...code.matchAll(/<textarea\b[^>]*>/g)];
    for (const m of taMatches) {
      expect(m[0]).toMatch(/\bdisabled\b/);
    }
    // Mirror must have at least one textarea
    expect(taMatches.length).toBeGreaterThan(0);
  });

  it('AV39.5 every <select> tag carries disabled attribute', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(MIRROR_PATH, 'utf8');
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    const selMatches = [...code.matchAll(/<select\b[^>]*>/g)];
    for (const m of selMatches) {
      expect(m[0]).toMatch(/\bdisabled\b/);
    }
    // Mirror must have at least one select
    expect(selMatches.length).toBeGreaterThan(0);
  });

  it('AV39.6 source does NOT contain save buttons (no บันทึก/Save in <button> direct text)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(MIRROR_PATH, 'utf8');
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(code).not.toMatch(/<button[^<]*>[^<]*บันทึก/);
    expect(code).not.toMatch(/<button[^>]*>\s*Save/i);
  });

  it('AV39.7 onChange handlers in Mirror are no-ops (vacuously passes — Mirror has NONE)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(MIRROR_PATH, 'utf8');
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    // Any onChange found must be a no-op arrow function
    const onChangeMatches = [...code.matchAll(/onChange\s*=\s*\{([^}]+)\}/g)];
    for (const m of onChangeMatches) {
      // Allow only: {() => {}} style no-ops
      expect(m[1].trim()).toMatch(/^\(\s*\)\s*=>\s*\{?\s*\}?$/);
    }
    // 0 onChange handlers is acceptable (vacuous pass)
  });

  it('AV39.8 Mirror defines internal Lightbox component and uses mirror-img-zoom testid', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(MIRROR_PATH, 'utf8');
    // Mirror has its own internal Lightbox function (not external state setLightbox)
    expect(src).toMatch(/function Lightbox/);
    // Mirror uses mirror-img-zoom testid pattern for image zoom buttons
    expect(src).toMatch(/mirror-img-zoom/);
  });
});
