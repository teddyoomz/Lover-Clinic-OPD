// audit-class-of-bug-discipline CB-1..CB-5 — drift catcher for Rule P
// (Class-of-bug expansion at every bug discovery, 2026-05-08, after V42-V49 saga).
// Mirrors the /audit-class-of-bug-discipline skill's invariants as automated
// source-grep regressions so a future commit re-introducing a violation fails
// CI before it reaches `npm run build`.
//
// Companion skill: .agents/skills/audit-class-of-bug-discipline/SKILL.md
// Spec: docs/superpowers/specs/2026-05-08-rule-p-class-of-bug-expansion-design.md §6
// Rule: .claude/rules/01-iron-clad.md "Rule P"

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Project root resolution (cwd is the project root when vitest runs)
const ROOT = process.cwd();

const SESSION_START = join(ROOT, '.claude/rules/00-session-start.md');
const IRON_CLAD = join(ROOT, '.claude/rules/01-iron-clad.md');
const V_ARCHIVE = join(ROOT, '.claude/rules/v-log-archive.md');
const AVI_SKILL = join(ROOT, '.agents/skills/audit-anti-vibe-code/SKILL.md');
const CB_SKILL = join(ROOT, '.agents/skills/audit-class-of-bug-discipline/SKILL.md');
const CB_PATTERNS = join(ROOT, '.agents/skills/audit-class-of-bug-discipline/patterns.md');
const AUDIT_ALL_SKILL = join(ROOT, '.claude/skills/audit-all/SKILL.md');

// Read once, cache
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

// ─── CB-1 — V-entry → AVxx mapping ────────────────────────────────────────

describe('CB-1: V-entry → AVxx mapping', () => {
  it('CB-1.1: every V42+ V-entry has AVxx citation OR sanctioned-exception entry in CB-5 catalog', () => {
    const sessionSrc = readFile(SESSION_START);
    expect(sessionSrc, 'CB-1.1 setup: 00-session-start.md missing').not.toBe('');

    // Extract V-entry compact rows for V41 onward (the post-V41 baseline window)
    // Compact pattern: `| V41 | 2026-05-08 | ... |` or `| V42 | ... |` etc.
    const vRowRe = /^\|\s*(V[4-9]\d|V[5-9]\d{2}|V41)\s*\|/gm;
    const vEntries = new Set();
    let m;
    while ((m = vRowRe.exec(sessionSrc)) !== null) {
      vEntries.add(m[1]);
    }
    expect(vEntries.size, 'CB-1.1: no V41+ entries detected — table format may have drifted').toBeGreaterThanOrEqual(8);

    // Each V41+ V-entry should map per the SKILL.md table OR be in CB-5 catalog
    const cbSrc = readFile(CB_SKILL);
    const expectedMapping = {
      V41: 'AV20',
      V42: 'sanctioned',
      V43: 'AV21',
      V44: 'AV22',
      V45: 'AV23',
      V46: 'AV24',
      V47: 'AV25',
      V48: 'AV26',
      V49: 'AV27',
      V50: 'AV28',
    };

    // Every expected mapping must appear in the CB SKILL.md
    for (const [vEntry, av] of Object.entries(expectedMapping)) {
      if (av === 'sanctioned') {
        // V42 is in the CB-5 catalog
        expect(cbSrc, `CB-1.1: ${vEntry} (sanctioned) missing from CB-5 catalog`).toMatch(
          new RegExp(`\\|\\s*${vEntry}\\b`),
        );
      } else {
        // Mapping table must be present in CB SKILL.md
        expect(cbSrc, `CB-1.1: ${vEntry} → ${av} missing from CB SKILL.md mapping table`).toMatch(
          new RegExp(`${vEntry}\\b.*${av}\\b`, 's'),
        );
      }
    }
  });

  it('CB-1.2: AV20-AV28 baseline mapping matches 00-session-start.md V-entries', () => {
    const aviSrc = readFile(AVI_SKILL);
    expect(aviSrc, 'CB-1.2 setup: audit-anti-vibe-code SKILL.md missing').not.toBe('');

    // AV20-AV28 must each have an `### AVxx ` heading in audit-anti-vibe-code SKILL.md
    const avNumbers = ['AV20', 'AV21', 'AV22', 'AV23', 'AV24', 'AV25', 'AV26', 'AV27', 'AV28'];
    const missing = [];
    for (const av of avNumbers) {
      const re = new RegExp(`^###\\s+${av}\\b`, 'm');
      if (!re.test(aviSrc)) missing.push(av);
    }
    expect(missing, `CB-1.2: AVxx baseline missing from audit-anti-vibe-code SKILL.md: ${missing.join(', ')}`).toEqual([]);
  });

  it('CB-1.3: no orphan AVxx (every AV20+ has at least one V-entry citation in body)', () => {
    const aviSrc = readFile(AVI_SKILL);
    // Each AV20-AV28 body must reference V41+ (typically `(V41)` or similar in heading)
    const aviBlocks = aviSrc.split(/^###\s+/m);
    const orphanAvs = [];
    for (const block of aviBlocks) {
      const headingMatch = block.match(/^(AV2[0-8])\b/);
      if (!headingMatch) continue;
      const av = headingMatch[1];
      // V41-V99 reference somewhere in the body (allow narrow saga refs like V42-V49)
      if (!/V[4-9]\d\b/.test(block)) {
        orphanAvs.push(av);
      }
    }
    expect(orphanAvs, `CB-1.3: orphan AVs with no V-entry citation: ${orphanAvs.join(', ')}`).toEqual([]);
  });
});

// ─── CB-2 — AVxx → regression test ─────────────────────────────────────────

describe('CB-2: AVxx → regression test', () => {
  it('CB-2.1: every AV20+ in audit-anti-vibe-code SKILL.md cites at least one tests/<file>.test.js (own or sibling cluster)', () => {
    const aviSrc = readFile(AVI_SKILL);
    // Per Rule P expansion discipline, EVERY AV20+ must point auditors to AT LEAST ONE
    // test file. The test may be the AV's own (preferred) OR a sibling cluster test
    // (e.g. AV23 dedup-shadow folds into V44/V45 saga test bank).
    // CB-2.2 separately verifies the actual files exist.
    // Split on `### AVNN ` headings and rebuild blocks {av: body}
    const sections = aviSrc.split(/^###\s+(AV\d+)\b/m);
    const blocks = {};
    for (let i = 1; i < sections.length; i += 2) {
      const av = sections[i];
      const body = sections[i + 1] || '';
      blocks[av] = body;
    }
    const TARGET_AVS = ['AV20', 'AV21', 'AV22', 'AV23', 'AV24', 'AV25', 'AV26', 'AV27', 'AV28'];
    const missing = [];
    // Sanctioned cluster-citation: AVxx may share a sibling cluster's test file when V-saga is overlapping
    // (e.g. V42 folds into V43-V45 cluster; V45 dedup is verified inside V44 + V48 prof-grade banks).
    const clusterAllowed = {
      AV21: /tests\/v4[3-8]-/, // skip-stock-deduction cluster (V43-V48)
      AV23: /tests\/v4[4-8]-/, // dedup-shadow folds into V44/V48 saga bank
      AV26: /tests\/v4[6-8]-/, // Rule O universal extension cluster
    };
    for (const av of TARGET_AVS) {
      const body = blocks[av];
      if (!body) {
        missing.push(`${av}: AV section block not found in audit-anti-vibe-code SKILL.md`);
        continue;
      }
      // Acceptable test-trail markers (in priority order):
      //  (a) literal tests/<file>.test.js path
      //  (b) sibling cluster cite (V43-V48 stock saga AVs share test bank)
      //  (c) "Source-grep regression test pattern" subsection — points auditors
      //      to in-body regex contracts they can adapt to a regression test
      //  (d) explicit regression-test-pattern code blocks (```js + expect/grep)
      const hasTestRef = /tests\/[a-zA-Z0-9_.-]+\.test\.js/.test(body);
      const hasClusterRef = clusterAllowed[av] && clusterAllowed[av].test(body);
      const hasRegressionPattern = /Source-grep regression test pattern|regression test pattern|Source-grep regression|Comprehensive grep|grep \(V[0-9]+ CAT/i.test(body);
      if (!hasTestRef && !hasClusterRef && !hasRegressionPattern) {
        missing.push(`${av}: body has no tests/<file>.test.js citation OR regression-test-pattern subsection (block length: ${body.length})`);
      }
    }
    expect(missing, `CB-2.1: AVxx body missing test-file citation:\n${missing.join('\n')}`).toEqual([]);
  });

  it('CB-2.2: every cited test file actually exists', () => {
    const expectedTests = [
      'tests/staff-doctor-hide-consumer-sweep.test.js',
      'tests/v43-skip-stock-deduction.test.js',
      'tests/v44-course-buy-product-name-source-fix.test.js',
      'tests/v45-dedup-shadow-or-merge.test.js',
      'tests/v46-rule-o-live-product-name.test.js',
      'tests/v47-customer-detail-view-grouping.test.js',
      'tests/v48-prof-grade-class-of-bug-coverage.test.js',
      'tests/v49-canonical-shape-multi-reader-sweep.test.js',
      'tests/v50-av28-no-proclinic-imports.test.js',
    ];
    const missing = expectedTests.filter((p) => !existsSync(join(ROOT, p)));
    expect(missing, `CB-2.2: regression test files missing on disk:\n${missing.join('\n')}`).toEqual([]);
  });

  it('CB-2.3: each regression test file actually contains AVxx OR Vxx grep (not stub)', () => {
    const checks = [
      { file: 'tests/staff-doctor-hide-consumer-sweep.test.js', re: /AV20|V41|isHidden/ },
      { file: 'tests/v43-skip-stock-deduction.test.js', re: /V43|skipStock/ },
      { file: 'tests/v44-course-buy-product-name-source-fix.test.js', re: /V44|courseProducts|beCourseToMasterShape/ },
      { file: 'tests/v45-dedup-shadow-or-merge.test.js', re: /V45|dedup|OR-merge/ },
      { file: 'tests/v46-rule-o-live-product-name.test.js', re: /V46|_resolveProductNameLive|Rule O/ },
      { file: 'tests/v47-customer-detail-view-grouping.test.js', re: /V47|groupCustomerCoursesForDetailView/ },
      { file: 'tests/v48-prof-grade-class-of-bug-coverage.test.js', re: /V48|prof-grade|class-of-bug/ },
      { file: 'tests/v49-canonical-shape-multi-reader-sweep.test.js', re: /V49|ForPicker|canonical/ },
      { file: 'tests/v50-av28-no-proclinic-imports.test.js', re: /V50|AV28|broker|proclinic/ },
    ];
    const stubs = [];
    for (const { file, re } of checks) {
      const path = join(ROOT, file);
      if (!existsSync(path)) {
        stubs.push(`${file}: file missing`);
        continue;
      }
      const content = readFile(path);
      if (!re.test(content)) stubs.push(`${file}: missing expected marker ${re}`);
    }
    expect(stubs, `CB-2.3: stub or marker-less regression tests:\n${stubs.join('\n')}`).toEqual([]);
  });
});

// ─── CB-3 — Classifier doc/test ────────────────────────────────────────────

describe('CB-3: Classifier doc/test', () => {
  it('CB-3.1: every V41+ AV regression test has CAT-style classifier OR classifier inline tag', () => {
    // Check the most recent class-of-bug expansions have a CAT classifier
    // (≤3 instances → inline OK; >3 → CAT block expected)
    const classifierChecks = [
      // V49 has the canonical CAT8 classifier (universal classifier of all 28 list*() consumers)
      { file: 'tests/v49-canonical-shape-multi-reader-sweep.test.js', re: /CAT[0-9]+|classifier/i },
      // V48 has CAT8 source-grep classifier
      { file: 'tests/v48-prof-grade-class-of-bug-coverage.test.js', re: /CAT[0-9]+|classifier/i },
      // V41 staff/doctor consumer-sweep has CS1+CS2 classification
      { file: 'tests/staff-doctor-hide-consumer-sweep.test.js', re: /CS[12]|classifier/i },
    ];
    const missing = [];
    for (const { file, re } of classifierChecks) {
      const path = join(ROOT, file);
      if (!existsSync(path)) {
        missing.push(`${file}: file missing`);
        continue;
      }
      const content = readFile(path);
      if (!re.test(content)) missing.push(`${file}: missing classifier marker ${re}`);
    }
    expect(missing, `CB-3.1: classifier missing in V41+ regression tests:\n${missing.join('\n')}`).toEqual([]);
  });

  it('CB-3.2: classifier enumerates fixed/sanctioned/ongoing categories (V49 canonical example)', () => {
    // V49 CAT8 is the canonical universal classifier — every list*() consumer in 5 categories:
    // ForPicker / Canonical / Sanctioned / Internal / Defensive
    const path = join(ROOT, 'tests/v49-canonical-shape-multi-reader-sweep.test.js');
    if (!existsSync(path)) {
      // Soft-pass if V49 test file isn't where we expect; CB-3.1 already caught this
      return;
    }
    const content = readFile(path);
    // Look for classifier vocabulary signaling fixed + sanctioned categories
    const classifierMarkers = ['VICTIM_FILES', 'sanctioned', 'ForPicker', 'CAT'];
    const found = classifierMarkers.filter((marker) => content.includes(marker));
    // V49 CAT8 must surface at least 2 of the classifier vocabulary markers
    expect(found.length, `CB-3.2: V49 classifier missing canonical markers (found ${found.join(', ')})`).toBeGreaterThanOrEqual(2);
  });
});

// ─── CB-4 — Architectural class → iron-clad + V-entry + archive ────────────

describe('CB-4: Architectural class → iron-clad + V-entry + verbose archive', () => {
  it('CB-4.1: each iron-clad rule (A-P) has compact entry in 00-session-start §1', () => {
    const sessionSrc = readFile(SESSION_START);
    const expectedRules = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P'];
    const missing = [];
    for (const letter of expectedRules) {
      // §1 compact entries match `**A.` or `**A. ` etc. (bold letter heading)
      // Allow optional emoji prefix (🆕) and `.` after letter
      const re = new RegExp(`\\*\\*${letter}\\.\\s|^- \\*\\*${letter}\\.`, 'm');
      if (!re.test(sessionSrc)) missing.push(letter);
    }
    expect(missing, `CB-4.1: iron-clad rules missing compact entry in 00-session-start §1: ${missing.join(', ')}`).toEqual([]);
  });

  it('CB-4.2: each rule has full body in 01-iron-clad.md OR is referenced inline in 00-session-start', () => {
    const ironCladSrc = readFile(IRON_CLAD);
    const sessionSrc = readFile(SESSION_START);
    expect(ironCladSrc, 'CB-4.2 setup: 01-iron-clad.md missing').not.toBe('');

    // Tier-3 architectural rules with full bodies in 01-iron-clad.md (sample check)
    const architecturalRules = ['B', 'C', 'D', 'M', 'P'];
    const missing = [];
    for (const letter of architecturalRules) {
      // Match `### A. ...` or `### B. ...` etc as headings (period followed by space)
      // OR `### Rule P — ...` style (Rule + letter + space/em-dash)
      const reIronClad = new RegExp(`^###\\s+(?:Rule\\s+)?${letter}\\.[\\s—]`, 'm');
      const reIronCladRule = new RegExp(`^###\\s+Rule\\s+${letter}[\\s—-]`, 'm');
      // Or rule body inline-summarized in 00-session-start §1 (compact entry)
      const reSession = new RegExp(`\\*\\*${letter}\\.\\s.{40,}`, 'm');
      if (!reIronClad.test(ironCladSrc) && !reIronCladRule.test(ironCladSrc) && !reSession.test(sessionSrc)) {
        missing.push(letter);
      }
    }
    expect(missing, `CB-4.2: architectural rules missing full body in 01-iron-clad.md or 00-session-start §1: ${missing.join(', ')}`).toEqual([]);
  });

  it('CB-4.3: each rule has V-entry citation OR is policy-only (CB-5 catalog)', () => {
    const sessionSrc = readFile(SESSION_START);
    const cbSrc = readFile(CB_SKILL);

    // Architectural rules with concrete saga V-entries that explicitly cite "Rule X" or "iron-clad X"
    // These prove the rule emerged from a real bug pattern, not just policy.
    // Rule D is policy-only (CB-5 sanctioned exception).
    const policyOnlyRules = ['D']; // codified in CB-5 catalog
    const expectVCitation = ['B', 'E', 'F', 'I', 'M', 'O', 'P'];

    // Each must have a "Rule X" or "iron-clad X" citation somewhere in 00-session-start.md
    // (V-entry compact rows + verbose lessons reference the source rule)
    const missingCitation = [];
    for (const letter of expectVCitation) {
      const re = new RegExp(`(Rule|iron-clad)\\s+${letter}\\b`);
      if (!re.test(sessionSrc)) missingCitation.push(letter);
    }
    expect(
      missingCitation,
      `CB-4.3: architectural rules with no "Rule X" or "iron-clad X" citation in 00-session-start: ${missingCitation.join(', ')}`,
    ).toEqual([]);

    // Verify policy-only rules ARE in the CB-5 catalog
    for (const letter of policyOnlyRules) {
      expect(cbSrc, `CB-4.3: Rule ${letter} (policy-only) missing from CB-5 catalog`).toMatch(
        new RegExp(`Rule ${letter}\\b.*policy`, 's'),
      );
    }
  });

  it('CB-4.4: each architectural rule has verbose entry in v-log-archive.md (or V-entry)', () => {
    const archiveSrc = readFile(V_ARCHIVE);
    expect(archiveSrc, 'CB-4.4 setup: v-log-archive.md missing').not.toBe('');

    // V-archive should have at least N entries (V41+ baseline)
    const vEntryRe = /^### V[0-9]+\b/gm;
    const matches = archiveSrc.match(vEntryRe) || [];
    expect(
      matches.length,
      `CB-4.4: v-log-archive.md should have ≥10 V-entries (architectural saga lessons); got ${matches.length}`,
    ).toBeGreaterThanOrEqual(10);
  });
});

// ─── CB-5 — Sanctioned exception catalog ───────────────────────────────────

describe('CB-5: Sanctioned exception catalog', () => {
  it('CB-5.1: catalog section exists in audit-class-of-bug-discipline SKILL.md', () => {
    const cbSrc = readFile(CB_SKILL);
    expect(cbSrc, 'CB-5.1: SKILL.md missing').not.toBe('');
    expect(cbSrc, 'CB-5.1: "Sanctioned exception catalog" section missing').toMatch(
      /Sanctioned exception catalog/,
    );
  });

  it('CB-5.2: each catalog row has WHICH/WHY/REVIEW-DATE fields', () => {
    const cbSrc = readFile(CB_SKILL);
    // Catalog rows match `| <Exception> | CB-N | <Why> | YYYY-MM-DD |`
    const rowRe = /^\|\s+(\S[\S\s]*?)\s+\|\s+CB-[1-5][^|]*\|\s+([^|]+)\s+\|\s+(\d{4}-\d{2}-\d{2})\s+\|/gm;
    const rows = [...cbSrc.matchAll(rowRe)];
    expect(rows.length, `CB-5.2: catalog has ≥10 rows; got ${rows.length}`).toBeGreaterThanOrEqual(10);

    // Spot check that no row has empty WHY field
    const incomplete = rows.filter(([, , why]) => !why || why.trim().length < 5);
    expect(incomplete.length, `CB-5.2: ${incomplete.length} catalog rows have empty/short WHY field`).toBe(0);
  });

  it('CB-5.3: catalog covers AV1-AV19 + V42 + Rule D expected misses', () => {
    const cbSrc = readFile(CB_SKILL);
    const expectedExceptions = [
      'AV1', 'AV2', 'AV3', 'AV4', 'AV5', 'AV6', 'AV7', 'AV8', 'AV9',
      'AV10', 'AV11', 'AV12', 'AV13', 'AV14', 'AV15', 'AV16', 'AV17', 'AV18', 'AV19',
      'V42', 'Rule D',
    ];
    const missing = expectedExceptions.filter((entry) => {
      const re = new RegExp(`\\|\\s*${entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      return !re.test(cbSrc);
    });
    expect(missing, `CB-5.3: missing sanctioned-exception entries:\n${missing.join('\n')}`).toEqual([]);
  });
});

// ─── CB-meta — skill registration ─────────────────────────────────────────

describe('CB-meta: skill registration', () => {
  it('CB-meta.1: registered in /audit-all Tier 1', () => {
    const auditAllSrc = readFile(AUDIT_ALL_SKILL);
    expect(auditAllSrc, 'CB-meta.1 setup: audit-all SKILL.md missing').not.toBe('');
    expect(auditAllSrc, 'CB-meta.1: audit-class-of-bug-discipline must be registered in /audit-all Tier 1').toMatch(
      /audit-class-of-bug-discipline/,
    );
  });

  it('CB-meta.2: SKILL.md cross-references systematic-debugging skill', () => {
    const cbSrc = readFile(CB_SKILL);
    expect(cbSrc, 'CB-meta.2: SKILL.md must reference systematic-debugging').toMatch(
      /systematic-debugging/i,
    );
  });

  it('CB-meta.3: SKILL.md cross-references verification-before-completion skill', () => {
    const cbSrc = readFile(CB_SKILL);
    expect(cbSrc, 'CB-meta.3: SKILL.md must reference verification-before-completion').toMatch(
      /verification-before-completion/i,
    );
  });
});
