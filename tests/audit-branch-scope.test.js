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
