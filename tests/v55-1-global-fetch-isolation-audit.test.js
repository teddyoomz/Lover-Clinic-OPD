// V55.3 — Brutal pre-deploy test bank: global.fetch isolation audit (AV41)
// (Phase 17.1 flake fix lock-in, 2026-05-14)
//
// AV41 invariant: every test file containing `global.fetch =` MUST either:
//   (a) PREFERRED — capture ORIGINAL_FETCH at module-load (`const ORIGINAL_FETCH = global.fetch`)
//                 + afterAll restore (delete-if-undefined / assign-otherwise), OR
//   (b) ACCEPTABLE — afterEach delete global.fetch (less robust under worker
//                  parallelism but still prevents cross-file leakage)
//
// Files that assign global.fetch without either restore mechanism FAIL the audit.
//
// Background: Phase 17.1 flake-fix V-entry (.claude/rules/00-session-start.md
// § 2 "Phase 17.1 flake fix") identified 4 files assigning global.fetch without
// afterAll restore. Under vitest worker parallelism, global.fetch CAN leak
// between files mid-test. This audit prevents future regressions by enforcing
// the canonical pattern at every fetch-assigning test file.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const TESTS_ROOT = join(process.cwd(), 'tests');

// Directories to skip when walking
// - helpers/ → shared utilities; not tests themselves
// - e2e/    → Playwright tests, run separately, different runtime
const SKIP_DIRS = new Set(['helpers', 'e2e']);

// Files to skip — typically the audit test itself (which references
// `global.fetch =` only inside documentation string literals, not as
// runtime assignments). Path is relative to TESTS_ROOT.
const SKIP_FILES = new Set([
  'v55-1-global-fetch-isolation-audit.test.js',
]);

/**
 * Recursively walks tests/ collecting *.test.js / *.test.jsx file paths.
 * Skips SKIP_DIRS by name (matched at any depth).
 */
function collectTestFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      out.push(...collectTestFiles(full));
    } else if (stat.isFile()) {
      if (/\.test\.(js|jsx)$/.test(entry)) {
        // Skip self (audit-test) and any other documentation-only files.
        // Use relative path from TESTS_ROOT for portable matching.
        const relFromRoot = relative(TESTS_ROOT, full).replace(/\\/g, '/');
        if (SKIP_FILES.has(relFromRoot)) continue;
        out.push(full);
      }
    }
  }
  return out;
}

// Classification regex patterns
const ASSIGN_FETCH = /global\.fetch\s*=/;
const PREFERRED_CAPTURE = /const\s+ORIGINAL_FETCH\s*=\s*global\.fetch/;
const PREFERRED_RESTORE = /afterAll\s*\(\s*\(\s*\)\s*=>/;
// afterEach block that includes `delete global.fetch` — block body may span
// multiple lines, so we use the [\s\S]*? non-greedy lazy pattern.
const ACCEPTABLE_DELETE = /afterEach\s*\(\s*\(\s*\)\s*=>\s*\{[\s\S]*?delete\s+global\.fetch/;

/**
 * @returns 'PREFERRED' | 'ACCEPTABLE' | 'VIOLATOR' | 'NON_ASSIGNER'
 */
function classifyFile(content) {
  if (!ASSIGN_FETCH.test(content)) return 'NON_ASSIGNER';
  const hasPreferredCapture = PREFERRED_CAPTURE.test(content);
  const hasPreferredRestore = PREFERRED_RESTORE.test(content);
  if (hasPreferredCapture && hasPreferredRestore) return 'PREFERRED';
  if (ACCEPTABLE_DELETE.test(content)) return 'ACCEPTABLE';
  return 'VIOLATOR';
}

// Build the classification report once for all tests
const ALL_FILES = collectTestFiles(TESTS_ROOT);

const CLASSIFICATION = ALL_FILES.map(filePath => {
  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch (e) {
    return { filePath, category: 'READ_ERROR', error: e.message };
  }
  const category = classifyFile(content);
  return { filePath, category };
});

const ASSIGNERS = CLASSIFICATION.filter(c => c.category !== 'NON_ASSIGNER' && c.category !== 'READ_ERROR');
const PREFERRED = CLASSIFICATION.filter(c => c.category === 'PREFERRED');
const ACCEPTABLE = CLASSIFICATION.filter(c => c.category === 'ACCEPTABLE');
const VIOLATORS = CLASSIFICATION.filter(c => c.category === 'VIOLATOR');

function rel(p) {
  return relative(process.cwd(), p).replace(/\\/g, '/');
}

describe('AV41 — global.fetch isolation discipline (V55.3, 2026-05-14)', () => {
  it('AV41.1: tests/ has at least 4 files that assign global.fetch', () => {
    // Sanity check — Phase 17.1 V-entry identified 4 canonical files:
    //   - tests/phase-17-1-cross-branch-import-rtl.test.jsx
    //   - tests/branch-backup-ui-rtl.test.jsx
    //   - tests/phase15.5b-withdrawal-approval-endpoint.test.js
    //   - tests/extended/adminUsersClient.test.js
    // Plus V55.4 stress test (v55-1-stress-fetch-pollution) adds 1 → 5 expected.
    // We assert ≥4 as the floor; future additions only grow.
    expect(ASSIGNERS.length).toBeGreaterThanOrEqual(4);
  });

  it('AV41.2: every file assigning global.fetch has PREFERRED or ACCEPTABLE restore mechanism', () => {
    if (VIOLATORS.length > 0) {
      const list = VIOLATORS.map(v => `  - ${rel(v.filePath)}`).join('\n');
      throw new Error(
        `AV41 VIOLATION — the following test files assign \`global.fetch\` without ` +
        `either (a) PREFERRED capture+afterAll restore OR (b) ACCEPTABLE afterEach ` +
        `delete:\n${list}\n\nFix: add at top of file:\n` +
        `  const ORIGINAL_FETCH = global.fetch;\n` +
        `and add to the outer describe block:\n` +
        `  afterAll(() => {\n` +
        `    if (ORIGINAL_FETCH === undefined) delete global.fetch;\n` +
        `    else global.fetch = ORIGINAL_FETCH;\n` +
        `  });\n` +
        `See .claude/rules/00-session-start.md § 2 "Phase 17.1 flake fix" V-entry.`
      );
    }
    expect(VIOLATORS.length).toBe(0);
  });

  it('AV41.3: ≥3 files use the PREFERRED pattern (capture + afterAll restore)', () => {
    // Quality target: the canonical pattern should dominate. Phase 17.1
    // flake-fix-followup migrated 3 files (phase-17-1-cross-branch-import-rtl
    // + branch-backup-ui-rtl + phase15.5b-withdrawal-approval-endpoint) to
    // PREFERRED. V55.3 (sub-task 2) migrates the 4th (adminUsersClient).
    // Plus the V55.4 stress test (sub-task 3) brings the floor to ≥4, but
    // we assert ≥3 to leave headroom for future ACCEPTABLE-tier exceptions.
    if (PREFERRED.length < 3) {
      const preferred = PREFERRED.map(p => `  - ${rel(p.filePath)} [PREFERRED]`).join('\n');
      const acceptable = ACCEPTABLE.map(a => `  - ${rel(a.filePath)} [ACCEPTABLE]`).join('\n');
      throw new Error(
        `AV41 quality target: expected ≥3 PREFERRED-pattern files, found ${PREFERRED.length}.\n` +
        `PREFERRED files:\n${preferred || '  (none)'}\n` +
        `ACCEPTABLE files (consider migrating):\n${acceptable || '  (none)'}\n`
      );
    }
    expect(PREFERRED.length).toBeGreaterThanOrEqual(3);
  });

  it('AV41.4: classification report (informational)', () => {
    // Informational test — emits the full classification of every
    // fetch-assigning file to console for human review. Always passes.
    // Helps audit reviewers see at a glance which files are PREFERRED
    // vs ACCEPTABLE vs (hopefully) zero VIOLATORs.
    const lines = [];
    lines.push('');
    lines.push('═══ AV41 global.fetch isolation classification ═══');
    lines.push(`  Total test files scanned: ${ALL_FILES.length}`);
    lines.push(`  Files assigning global.fetch: ${ASSIGNERS.length}`);
    lines.push(`    PREFERRED  (capture + afterAll): ${PREFERRED.length}`);
    lines.push(`    ACCEPTABLE (afterEach delete):   ${ACCEPTABLE.length}`);
    lines.push(`    VIOLATORS  (no restore):         ${VIOLATORS.length}`);
    lines.push('');
    if (PREFERRED.length > 0) {
      lines.push('  PREFERRED files:');
      for (const p of PREFERRED) lines.push(`    [P] ${rel(p.filePath)}`);
    }
    if (ACCEPTABLE.length > 0) {
      lines.push('  ACCEPTABLE files:');
      for (const a of ACCEPTABLE) lines.push(`    [A] ${rel(a.filePath)}`);
    }
    if (VIOLATORS.length > 0) {
      lines.push('  VIOLATORS:');
      for (const v of VIOLATORS) lines.push(`    [X] ${rel(v.filePath)}`);
    }
    lines.push('═══════════════════════════════════════════════════');
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));
    expect(true).toBe(true);
  });
});
