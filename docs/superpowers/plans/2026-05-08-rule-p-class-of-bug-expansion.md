# Rule P Class-of-Bug Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Codify the V42-V49 saga discipline as iron-clad Rule P + skill updates + new audit skill, so every bug discovery triggers class-of-bug expansion (cross-file grep + Tier 2 artifacts) BEFORE claiming done.

**Architecture:** Methodology-only spec. 8 tasks across 4 logical phases: (1) rule files, (2) skill updates, (3) audit skill creation, (4) cross-references + tests. No deploy required. No code semantics change. ~10 files touched.

**Tech Stack:** Markdown rule files (`.claude/rules/`), user-level skills (`~/.claude/skills/`), project audit skills (`.agents/skills/`), vitest test bank.

**Spec reference:** `docs/superpowers/specs/2026-05-08-rule-p-class-of-bug-expansion-design.md`

**Pre-flight check** before starting:
- [ ] Read spec file in full
- [ ] Verify current iron-clad rule set ends at Rule O (next available letter = P)
- [ ] Verify current AV invariant set ends at AV28 (post-V50 baseline)
- [ ] Verify `audit-anti-vibe-code` SKILL.md exists at `.agents/skills/audit-anti-vibe-code/`

---

## Task 1 — Land Rule P body in `.claude/rules/01-iron-clad.md`

**Files:**
- Modify: `.claude/rules/01-iron-clad.md` — append Rule P entry after current Rule O block

- [ ] **Step 1.1: Read current 01-iron-clad.md to locate Rule O block end**

```bash
grep -n "^### " F:/LoverClinic-app/.claude/rules/01-iron-clad.md
```
Expected: list of `### ` headings; identify last one (likely Rule O or related sub-block).

- [ ] **Step 1.2: Append Rule P body**

Use the verbatim Rule P body from spec Section 3 (`docs/superpowers/specs/2026-05-08-rule-p-class-of-bug-expansion-design.md` § 3 "The Rule"). Copy the entire markdown block starting from `### Rule P — Class-of-bug expansion at every bug discovery (added 2026-05-08, after V42-V49 saga)` through the final "Verify:" line (~70 lines).

- [ ] **Step 1.3: Verify markdown renders correctly**

```bash
# Sanity grep — Rule P section now exists
grep -c "^### Rule P" F:/LoverClinic-app/.claude/rules/01-iron-clad.md
```
Expected: `1`

- [ ] **Step 1.4: Commit task 1 standalone** (small, self-contained)

```bash
cd F:/LoverClinic-app
git add .claude/rules/01-iron-clad.md
git commit -m "$(cat <<'EOF'
docs(rule): land Rule P (class-of-bug expansion at every bug discovery)

Rule P body verbatim from Spec #1 §3:
- Trigger scope: bug discovery ทุกประเภท (test red / user-report / claude-noticed / audit-red)
- Trigger discrimination: strict (every red triggers)
- 7-step expansion: diagnose → classify class-of-bug → cross-file grep → fix all → regression test → AVxx invariant → escalate iron-clad when architectural
- Tier 2 default artifacts; Tier 3 (V-entry + iron-clad) for architectural
- Interactions with Rule N + D + skills documented

Spec: docs/superpowers/specs/2026-05-08-rule-p-class-of-bug-expansion-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```
Expected: `1 file changed, ~70 insertions(+)`

---

## Task 2 — Compact Rule P entry in `.claude/rules/00-session-start.md` § 1 + CLAUDE.md

**Files:**
- Modify: `.claude/rules/00-session-start.md` § 1 (iron-clad summary list)
- Modify: `CLAUDE.md` (project root "Iron-clad ย่อ" section)

- [ ] **Step 2.1: Add Rule P compact entry to 00-session-start.md § 1**

Locate the iron-clad summary list (current entries A-O). Insert Rule P entry between Rule O and the next item (likely letter doesn't matter for in-list order, but keep alphabetical-ish per existing convention). Use the verbatim compact entry from spec Section 7:

```markdown
- **P. 🆕 Class-of-bug expansion at every bug discovery** (2026-05-08 after V42-V49 saga 7-round class-of-bug class) — ทุก bug discovery (test red / user-report / claude-noticed / audit-red) ต้อง **7-step expansion**: diagnose → classify class-of-bug → cross-file grep → fix all in batch → regression test → AVxx invariant → escalate iron-clad rule + V-entry เมื่อ architectural. Stop = `/audit-class-of-bug-discipline` green + classifier doc 0 remaining + full suite green. Trigger discrimination **strict** (ทุก red); scope **broad** (test+user+claude+audit). NO quick fix-and-ship. **Tier 2 default artifacts** (regression test + AVxx + classifier doc); Tier 3 escalation (V-entry + iron-clad rule) เฉพาะ architectural. ดู `.claude/rules/01-iron-clad.md` Rule P (full workflow + Tier 1/2/3 artifacts + 7 anti-patterns + audit hook).
```

- [ ] **Step 2.2: Add Rule P compact entry to CLAUDE.md "Iron-clad ย่อ" section**

Locate the "Iron-clad ย่อ (ห้ามลืม):" bullet list. Append Rule P entry (after the existing letters). Use the verbatim CLAUDE.md entry from spec Section 7:

```markdown
- **P. 🆕 Class-of-bug expansion at every bug discovery** (2026-05-08 หลัง V42-V49 saga) — ทุก bug discovery → 7-step expansion (diagnose → classify → cross-file grep → fix all → regression test → AVxx → escalate iron-clad เมื่อ architectural). Tier 2 default artifacts. Stop = /audit-class-of-bug-discipline green + classifier 0 remaining + full suite green. ดู `.claude/rules/00-session-start.md` Rule P + `01-iron-clad.md` Rule P.
```

- [ ] **Step 2.3: Commit task 2**

```bash
cd F:/LoverClinic-app
git add .claude/rules/00-session-start.md CLAUDE.md
git commit -m "docs(rules): Rule P compact entries in 00-session-start §1 + CLAUDE.md

Cross-references for Rule P (class-of-bug expansion). Bodies in 01-iron-clad.md
landed in prior commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3 — Update `~/.claude/skills/systematic-debugging/SKILL.md` (5 deltas)

**Files:**
- Modify: `~/.claude/skills/systematic-debugging/SKILL.md` (currently 296 lines)

Apply 5 deltas Δ1-Δ5 verbatim from spec Section 4. Each delta is a precise addition or rewrite of an existing block.

- [ ] **Step 3.1: Apply Δ1 — Overview line extension**

After current line `Random fixes waste time and create new bugs. Quick patches mask underlying issues.`, insert the V42-V49 lesson paragraph from spec Section 4 Δ1.

After current line `**Core principle:** ALWAYS find root cause before attempting fixes. Symptom fixes are failure.`, append `**AND class-of-bug expansion BEFORE proposing fix is mandatory (Rule P).**`.

- [ ] **Step 3.2: Apply Δ2 — Phase 2 Step 5 (NEW)**

After current Step 4 of Phase 2 ("Understand Dependencies"), insert new Step 5 verbatim from spec Section 4 Δ2 (the markdown block titled `5. **Find Adjacent Broken Instances (class-of-bug expansion — Rule P)**`).

- [ ] **Step 3.3: Apply Δ3 — Phase 4 Step 2 rewrite + Sub-step 6 (NEW)**

Replace current Step 2 of Phase 4 ("Implement Single Fix" — 4 bullet lines) with the new "Implement Class-of-Bug-Wide Fix (Rule P)" block from spec Section 4 Δ3.

After current Step 5 ("If 3+ Fixes Failed: Question Architecture"), insert new Sub-step 6 verbatim from spec Section 4 Δ3 (the markdown block titled `6. **Land Tier 2 Artifacts Before Commit (Rule P)**`).

- [ ] **Step 3.4: Apply Δ4 — Quick Reference + Red Flags + Rationalizations**

In the Quick Reference table, replace rows 2 and 4 per spec Section 4 Δ4 diff.

In the Red Flags section (the bullet list under "Red Flags - STOP and Follow Process"), append the 3 new bullets from spec Section 4 Δ4 ("Fixed the failing test, moving on" / "Single-file fix is enough" / "The other instances aren't broken YET").

In the Common Rationalizations table, append 3 new rows from spec Section 4 Δ4 (`"Just fix this one..."` / `"Other instances aren't broken yet"` / `"Architectural rule too heavy..."`).

- [ ] **Step 3.5: Apply Δ5 — Related skills cross-link**

In the "Related skills:" section near the bottom, append 2 new bullets from spec Section 4 Δ5 (`iron-clad Rule P` + `/audit-class-of-bug-discipline`).

- [ ] **Step 3.6: Commit task 3 (user-level skill — separate concern from project files)**

User-level skills typically go in their own commit since they live in `~/.claude/skills/` outside the project repo. **NOTE**: this commit is OUTSIDE the LoverClinic repo. Use a separate commit message at the user-level skills repo if one exists, or simply save the file with no commit (user-level skills are not in version control by default).

If user-level skills are NOT in git: just save and verify:

```bash
diff ~/.claude/skills/systematic-debugging/SKILL.md.bak ~/.claude/skills/systematic-debugging/SKILL.md 2>/dev/null
# Expected: 5 delta blocks added (~100 lines insertion total)
```

---

## Task 4 — Update `~/.claude/skills/verification-before-completion/SKILL.md` (8 deltas)

**Files:**
- Modify: `~/.claude/skills/verification-before-completion/SKILL.md` (currently 140 lines)

Apply 8 deltas Δ1-Δ8 verbatim from spec Section 5.

- [ ] **Step 4.1: Apply Δ1-Δ2** — Overview line extension + Gate Function Step 1+2 inline additions per spec Section 5 Δ1-Δ2 diffs

- [ ] **Step 4.2: Apply Δ3** — Common Failures table: replace existing "Bug fixed" row with new Tier 2 Tier 3 split per spec Section 5 Δ3 (3 new rows total)

- [ ] **Step 4.3: Apply Δ4-Δ5** — Append 5 new bullets to Red Flags + 4 new rows to Rationalization Prevention per spec Section 5 Δ4-Δ5

- [ ] **Step 4.4: Apply Δ6** — Insert "Class-of-bug expansion (Rule P)" + "Architectural rule extension (Rule P Tier 3)" Key Patterns blocks per spec Section 5 Δ6 (after existing "Regression tests (TDD Red-Green)" pattern)

- [ ] **Step 4.5: Apply Δ7-Δ8** — Append 3 new bullets to "When To Apply" + new "Rule P-specific (V42-V49 saga)" subsection to "Why This Matters" per spec Section 5 Δ7-Δ8

- [ ] **Step 4.6: Save + verify**

```bash
wc -l ~/.claude/skills/verification-before-completion/SKILL.md
# Expected: ~190-200 lines (was 140; +50-60 from deltas)
```

---

## Task 5 — Create `/audit-class-of-bug-discipline` skill (SKILL.md + patterns.md)

**Files:**
- Create: `.agents/skills/audit-class-of-bug-discipline/SKILL.md`
- Create: `.agents/skills/audit-class-of-bug-discipline/patterns.md`

- [ ] **Step 5.1: Create SKILL.md from spec Section 6 verbatim**

Create directory `.agents/skills/audit-class-of-bug-discipline/` and write `SKILL.md` with frontmatter + body sections per spec Section 6. The body has:
1. Frontmatter (name + description per spec)
2. Overview section (Rule P enforcement at audit layer)
3. When to run section
4. Invariants CB-1..CB-5 (verbatim from spec Section 6 "Invariants" block — full text including check criteria + sanctioned exceptions + mapping table)
5. Sanctioned exception catalog (initially populated with: AV1-AV19 baseline + V42 sanctioned exception per spec Section 11 Open question 1)
6. Verify line + Registered in /audit-all cross-link

- [ ] **Step 5.2: Create patterns.md from spec Section 6 grep recipes**

Mirror `.agents/skills/audit-anti-vibe-code/patterns.md` structure. For each invariant CB-1..CB-5, add:
- Description (1-2 lines)
- Grep recipe (bash one-liner)
- Expected output (red flag pattern)
- Fix recipe (how to bring into compliance)

CB-1 example given verbatim in spec Section 6.

- [ ] **Step 5.3: Verify skill files**

```bash
ls -la F:/LoverClinic-app/.agents/skills/audit-class-of-bug-discipline/
# Expected: SKILL.md + patterns.md
wc -l F:/LoverClinic-app/.agents/skills/audit-class-of-bug-discipline/*.md
# Expected: SKILL.md ~150-200 lines, patterns.md ~100-150 lines
```

- [ ] **Step 5.4: Commit task 5**

```bash
cd F:/LoverClinic-app
git add .agents/skills/audit-class-of-bug-discipline/
git commit -m "feat(audit): NEW /audit-class-of-bug-discipline skill (CB-1..CB-5)

Per Spec #1 §6. Audits Rule P compliance:
- CB-1: Every V-entry (V42+) maps to AVxx
- CB-2: Every AVxx has regression test
- CB-3: Every class-of-bug expansion has classifier doc
- CB-4: Every architectural class has iron-clad rule + V-entry + verbose archive
- CB-5: Sanctioned exception catalog maintained

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6 — Write `tests/audit-class-of-bug-discipline.test.js`

**Files:**
- Create: `F:/LoverClinic-app/tests/audit-class-of-bug-discipline.test.js`

Mirror `tests/audit-branch-scope.test.js` shape. ~18-22 tests across 6 describe blocks per spec Section 6 "Test file" subsection.

- [ ] **Step 6.1: Write test file scaffold + CB-1 group**

```javascript
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const READ = (rel) => readFileSync(join(ROOT, rel), 'utf8');

describe('CB-1: V-entry → AVxx mapping', () => {
  const sessionStart = READ('.claude/rules/00-session-start.md');
  const auditAvc = READ('.agents/skills/audit-anti-vibe-code/SKILL.md');

  it('CB-1.1: every V42+ V-entry has AVxx citation OR sanctioned-exception entry', () => {
    // Extract V42-V99 entries from §2 table (one row per V-entry)
    // For each, verify either:
    //   - mentions AVxx in the row's pattern column, OR
    //   - is in CB-5 sanctioned exception catalog
    const vEntryMatches = [...sessionStart.matchAll(/^\| V[4-9][0-9]\b.*$/gm)];
    expect(vEntryMatches.length).toBeGreaterThan(0);
    // Each row should mention either AV<num> or be a known sanctioned V (V42 per spec)
    const sanctionedV = ['V42'];
    for (const match of vEntryMatches) {
      const row = match[0];
      const vNum = row.match(/V[4-9][0-9]/)?.[0];
      const hasAv = /AV\d+/.test(row);
      if (!hasAv && !sanctionedV.includes(vNum)) {
        throw new Error(`CB-1.1 violation: ${vNum} has no AVxx citation`);
      }
    }
  });

  it('CB-1.2: AV20-AV28 baseline mapping matches 00-session-start.md V-entries', () => {
    // Reference mapping per spec Section 6 CB-1
    const expectedMapping = {
      AV20: 'V41',
      AV21: 'V43',
      AV22: 'V44',
      AV23: 'V45',
      AV24: 'V46',
      AV25: 'V47',
      AV26: 'V48',
      AV27: 'V49',
      AV28: 'V50',
    };
    for (const [av, v] of Object.entries(expectedMapping)) {
      const avHeading = new RegExp(`### ${av} —[^(]+\\(${v}\\)`);
      expect(auditAvc).toMatch(avHeading);
    }
  });

  it('CB-1.3: no orphan AVxx (every AV20+ has at least one V-entry citation)', () => {
    const avHeadings = [...auditAvc.matchAll(/^### (AV\d+) —[^(]+\(([^)]+)\)/gm)];
    const av20Plus = avHeadings.filter(([, name]) => parseInt(name.replace('AV', ''), 10) >= 20);
    expect(av20Plus.length).toBeGreaterThanOrEqual(9);  // AV20-AV28
    for (const [, , citation] of av20Plus) {
      expect(citation).toMatch(/V\d+/);
    }
  });
});
```

- [ ] **Step 6.2: Add CB-2 group**

```javascript
describe('CB-2: AVxx → regression test', () => {
  const auditAvc = READ('.agents/skills/audit-anti-vibe-code/SKILL.md');

  it('CB-2.1: every AVxx in audit-anti-vibe-code SKILL.md references tests/ file', () => {
    const avBlocks = auditAvc.split(/^### AV/m).slice(1);
    for (const block of avBlocks) {
      const verifyLine = block.match(/(?:tests\/[^\s)`'"]+\.test\.[jt]sx?)/);
      // Optional: skip blocks tagged "descriptive only"
      if (block.includes('CB-2 descriptive only')) continue;
      expect(verifyLine).not.toBeNull();
    }
  });

  it('CB-2.2: referenced test file exists', () => {
    const refs = [...auditAvc.matchAll(/(tests\/[^\s)`'"]+\.test\.[jt]sx?)/g)];
    const seen = new Set();
    for (const [, path] of refs) {
      if (seen.has(path)) continue;
      seen.add(path);
      const full = join(ROOT, path);
      if (!existsSync(full)) {
        // Allow stub if explicitly tagged
        if (auditAvc.includes(`${path}* — descriptive`)) continue;
        throw new Error(`CB-2.2 violation: ${path} referenced but not on disk`);
      }
    }
  });

  it('CB-2.3: test file actually contains the AVxx grep (not stub)', () => {
    // Spot-check 3 known AV→test mappings
    const checks = [
      { av: 'AV24', testFile: 'tests/v46-rule-o-live-product-name.test.js', greppattern: '_resolveProductNameLive' },
      { av: 'AV28', testFile: 'tests/v50-av28-no-proclinic-imports.test.js', greppattern: 'broker' },
    ];
    for (const c of checks) {
      const test = READ(c.testFile);
      expect(test).toContain(c.greppattern);
    }
  });
});
```

- [ ] **Step 6.3: Add CB-3 + CB-4 + CB-5 + CB-meta groups**

Follow the same pattern. Each group ~3-5 tests. Use `existsSync` + `READ` helpers + regex assertions. Patterns:

CB-3 (classifier doc/test):
- Every AVxx test file has a CAT block OR `// classifier inline` tag

CB-4 (architectural class):
- Each iron-clad rule (A-P) appears in 00-session-start.md § 1
- Each rule body exists in 01-iron-clad.md
- Each rule has V-entry citation OR is policy-only (CB-5 catalog)
- Each architectural rule has verbose entry in v-log-archive.md

CB-5 (sanctioned exception catalog):
- Catalog section exists in audit-class-of-bug-discipline SKILL.md
- Each entry has WHICH/WHY/REVIEW-DATE fields
- AV1-AV19 baseline entries present
- V42 sanctioned exception present

CB-meta (skill registration):
- audit-class-of-bug-discipline registered in /audit-all SKILL.md Tier 1
- Cross-referenced from systematic-debugging "Related skills"
- Cross-referenced from verification-before-completion "Key Patterns" section

- [ ] **Step 6.4: Run test bank**

```bash
cd F:/LoverClinic-app
npm test -- --run tests/audit-class-of-bug-discipline.test.js
```
Expected: 18-22 tests GREEN (some may fail at this step if Task 7 not done yet — Task 8 verifies after Task 7 ships /audit-all registration)

- [ ] **Step 6.5: Commit task 6**

```bash
git add tests/audit-class-of-bug-discipline.test.js
git commit -m "test(audit): tests/audit-class-of-bug-discipline.test.js (CB-1..CB-5 + meta)

Per Spec #1 §6. ~18-22 tests across 6 describe blocks lock Rule P compliance:
- CB-1: V-entry → AVxx mapping
- CB-2: AVxx → regression test
- CB-3: classifier doc presence
- CB-4: iron-clad + V-entry + archive
- CB-5: sanctioned exception catalog
- CB-meta: skill registration

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7 — Register `/audit-class-of-bug-discipline` in `/audit-all` Tier 1

**Files:**
- Modify: `.agents/skills/audit-all/SKILL.md` (locate Tier 1 table, add row)

- [ ] **Step 7.1: Locate Tier 1 table**

```bash
grep -n "Tier 1" F:/LoverClinic-app/.agents/skills/audit-all/SKILL.md
grep -n "audit-anti-vibe-code" F:/LoverClinic-app/.agents/skills/audit-all/SKILL.md
```
Expected: identify the Tier 1 table containing audit-anti-vibe-code row.

- [ ] **Step 7.2: Insert audit-class-of-bug-discipline row**

Insert row immediately after `audit-anti-vibe-code` row per spec Section 6 "Registration in /audit-all":

```diff
 | audit-anti-vibe-code | AV1-AV28 | Critical anti-patterns | tests/audit-anti-vibe-code.test.js |
+| audit-class-of-bug-discipline | CB-1..CB-5 | Rule P expansion compliance | tests/audit-class-of-bug-discipline.test.js |
 | audit-branch-scope | BS-1..BS-9 | Branch-Scope Architecture | tests/audit-branch-scope.test.js |
```

- [ ] **Step 7.3: Re-run test bank** (Task 6 CB-meta should now pass)

```bash
npm test -- --run tests/audit-class-of-bug-discipline.test.js
```
Expected: ALL tests GREEN (CB-meta.1 was the only failing test pre-Task-7)

- [ ] **Step 7.4: Commit task 7**

```bash
git add .agents/skills/audit-all/SKILL.md
git commit -m "docs(audit): register audit-class-of-bug-discipline in /audit-all Tier 1

Per Spec #1 §6. Tier 1 alongside audit-anti-vibe-code. Verified
via tests/audit-class-of-bug-discipline.test.js CB-meta.1.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8 — MEMORY.md cross-link + `feedback_class_of_bug_expansion.md`

**Files:**
- Modify: `~/.claude/projects/F--LoverClinic-app/memory/MEMORY.md`
- Create: `~/.claude/projects/F--LoverClinic-app/memory/feedback_class_of_bug_expansion.md`

- [ ] **Step 8.1: Add Rule P pointer to MEMORY.md**

Locate "🔥 IRON-CLAD RULES — NEVER FORGET" section. Insert Rule P entry per spec Section 7 Δ3 verbatim (after existing Rule H entry).

- [ ] **Step 8.2: Create feedback_class_of_bug_expansion.md**

Use verbatim content from spec Section 7 Δ4. Frontmatter (name + description + type) + body (when to apply / why / how to apply).

- [ ] **Step 8.3: Verify**

```bash
grep "Rule P" ~/.claude/projects/F--LoverClinic-app/memory/MEMORY.md
ls -la ~/.claude/projects/F--LoverClinic-app/memory/feedback_class_of_bug_expansion.md
```
Expected: Rule P entry visible in MEMORY.md; new feedback file exists.

- [ ] **Step 8.4: Memory files are user-level — typically not in project git**. Save + done.

---

## Final Verification

- [ ] **VR1: Run audit-class-of-bug-discipline against current codebase**

```bash
cd F:/LoverClinic-app
npm test -- --run tests/audit-class-of-bug-discipline.test.js
```
Expected: 18-22 tests GREEN

- [ ] **VR2: Run /audit-all (full suite — methodology audit)**

```bash
# Per /audit-all SKILL.md instructions; runs all Tier 1 audits
npm test -- --run tests/audit-anti-vibe-code.test.js tests/audit-class-of-bug-discipline.test.js tests/audit-branch-scope.test.js
```
Expected: ALL GREEN

- [ ] **VR3: Build clean**

```bash
cd F:/LoverClinic-app
npm run build
```
Expected: build succeeds (no source code touched in this plan)

- [ ] **VR4: Push all commits**

```bash
git push origin master
```
Expected: 5-7 new commits pushed (Task 1, 2, 5, 6, 7 each committed; Task 3+4+8 are user-level skills outside project repo)

- [ ] **VR5: Acceptance criteria checklist**

Verify all 13 items in spec Section 8 Acceptance Criteria. Tick each as confirmed.

---

## Plan summary

- **Total commits**: 5 (Task 1+2 = 2 commits; Task 5 = 1 commit; Task 6 = 1 commit; Task 7 = 1 commit; user-level skill Tasks 3+4+8 outside repo)
- **Files touched in repo**: ~7 (`.claude/rules/01-iron-clad.md`, `.claude/rules/00-session-start.md`, `CLAUDE.md`, `.agents/skills/audit-class-of-bug-discipline/SKILL.md`, `.agents/skills/audit-class-of-bug-discipline/patterns.md`, `tests/audit-class-of-bug-discipline.test.js`, `.agents/skills/audit-all/SKILL.md`)
- **Files touched user-level**: 3 (`~/.claude/skills/systematic-debugging/SKILL.md`, `~/.claude/skills/verification-before-completion/SKILL.md`, `~/.claude/projects/F--LoverClinic-app/memory/`)
- **Estimated time**: 2-3 hours of focused implementation
- **No deploy required**
