# Rule P — Class-of-Bug Expansion at Every Bug Discovery

> **Status**: DESIGN locked 2026-05-08. Awaiting user spec review → writing-plans → executing-plans.
> **Author**: Claude (sonnet/opus 4.7) under user `/brainstorming` invocation 2026-05-08 EOD #4.
> **Spec**: `docs/superpowers/specs/2026-05-08-rule-p-class-of-bug-expansion-design.md` (this file).

---

## 1. Problem Statement

The V42-V49 class-of-bug saga (2026-05-08, 7 rounds, 698 cumulative verification points)
proved that fixing a single visible bug instance leaves the underlying class-of-bug latent
across the rest of the codebase. Each saga round followed the same pattern:

1. User reports symptom (visible Thai-language repro: "ไม่ตัดสต็อค", "ไม่ขึ้น", "เด้งจอดำ", image)
2. Claude diagnoses the root cause for that ONE instance
3. Claude fixes that ONE instance + adds a regression test
4. Claude claims "done", commits, ships
5. User repros the SAME symptom from a DIFFERENT latent instance of the same class-of-bug
6. Loop back to step 1 with growing user frustration ("บั๊คแม่งไม่จบไม่สิ้นจริงๆ")

Phase 4.5 of V46 broke the loop by escalating to **architectural backstop** (Rule O —
productName live-resolved at write time). V48 then UNIVERSALLY extended Rule O to all
stock writers (7+ sites). The architectural escalation finally closed the saga.

**Lesson**: each saga round practiced an ad-hoc class-of-bug expansion discipline. **Rule P
codifies this discipline as iron-clad** so future bug discoveries can't sneak past with a
single-instance fix.

User directive (verbatim, 2026-05-08):

> "ถ้า Test แล้วเจอ Failed อย่าแก้แค่ failed นั้นๆแล้วจบ ให้เอา failed นั้นมาขยายผล และหาสิ่ง
> ที่เป็นไปได้ที่คล้ายๆกันเพื่อขยายผลการหาบั๊คที่คล้ายๆกันหรือต่อเนื่องกันในจุดอื่นๆของโปรเจ็ค
> และเทสจนจบ แก้บั๊คจนหมด ถึงหยุด test และหยุดทำงานได้ ถ้ามีสกิลดูแลเรื่องนี้ก็อัพเดท skills
> ด้วย อัพทั้งกฎทั้ง skills ไปเลย เพื่อความเก่งของตัวนายและระบบของเรา"

Translation: "When test fails, don't just fix that failure and stop. Use that failure as a
starting point. Find similar possible bugs and expand the search to other places in the
project. Test until done, fix all bugs, only then stop testing and stop working. If there
are skills handling this, update them too. Update both rule and skills, for your skill and
our system."

## 2. Brainstorming Decisions Locked

Per `/brainstorming` Q1-Q4 answers (2026-05-08 EOD #4):

| Q | Topic | Decision | Rationale |
|---|-------|----------|-----------|
| Q1 | Expansion depth (per bug) | **Tier 3 — escalate to iron-clad rule when architectural** | Full V42-V49 methodology: cross-file grep + AVxx + iron-clad escalation when pattern is project-wide architectural backstop (Rule O class) |
| Q2 | Artifacts tier (default) | **Tier 2 — regression test + AVxx + classifier doc** | Tier 1 (regression+AV) is too thin (CAT8 enumeration missing); Tier 3 (V-entry every fix) is too heavy for non-architectural; Tier 2 = sweet spot |
| Q3 | Trigger discrimination | **Strict — every red triggers** | LoverClinic doesn't practice TDD strictly (work-first per Rule K); every npm test red is by definition unexpected |
| Q4 | Trigger scope | **Bug discovery ทุกประเภท** — test red + user-report + claude-noticed + audit-red | V42-V49 saga's actual triggers were dominantly user-reports, not test reds; rule must cover all bug-discovery surfaces |
| App | Implementation approach | **Approach B — Doc + audit skill** | Audit skill is the automated drift catcher (echoes proven AV1-AV28 + audit-anti-vibe-code pattern); Approach A under-enforces; Approach C duplicates AV-as-lexicon |

## 3. The Rule (verbatim text for `.claude/rules/01-iron-clad.md`)

### Rule P — Class-of-bug expansion at every bug discovery (added 2026-05-08, after V42-V49 saga)

User directive (verbatim, 2026-05-08): "ถ้า Test แล้วเจอ Failed อย่าแก้แค่ failed นั้นๆ
แล้วจบ ให้เอา failed นั้นมาขยายผล และหาสิ่งที่เป็นไปได้ที่คล้ายๆกันเพื่อขยายผลการ
หาบั๊คที่คล้ายๆกันหรือต่อเนื่องกันในจุดอื่นๆของโปรเจ็ค และเทสจนจบ แก้บั๊คจนหมด
ถึงหยุด test และหยุดทำงานได้".

When ANY bug surfaces — test red / user-reported / claude-noticed / audit-red — the fix
workflow MUST follow this 7-step expansion discipline. Quick fix-and-ship of a single
instance is **FORBIDDEN**.

#### Trigger scope (broad)

- **Test red**: any `npm test` / `npm run test:e2e` / focused vitest fail
- **User-reported**: chat repro ("ไม่ตัดสต็อค" / "ไม่ขึ้น" / "เด้งจอดำ" / image)
- **Claude-noticed**: spotting a pattern during code-read / refactor / inspection
- **Audit-red**: any `/audit-*` skill flagging an invariant violation

#### Trigger discrimination (strict)

- No exception for TDD / WIP / mid-refactor reds
- Pre-existing-known reds tracked separately in SESSION_HANDOFF "known failures" list
  (deferred but flagged — not exempt from Rule P, just temporarily parked)
- "Expected red" is rationalization; treat every red as a real signal

#### The 7-step expansion discipline

1. **Diagnose root cause** — understand the broken contract / pattern. Pure investigation;
   NO fix proposal yet.

2. **Classify class-of-bug** — match against existing AV1-AVxx in
   `audit-anti-vibe-code` SKILL.md OR name a new class. Common classes (post-V50 baseline):

   | Class | V-entry origin | AVxx |
   |-------|----------------|------|
   | Multi-reader-sweep (shape change broke other readers) | V12 | (uses pre-AV20 cluster) |
   | Source-grep lock-in (test asserts broken behavior) | V21 | (uses pre-AV20 cluster) |
   | Multi-call-site (one fix site, sibling broken) | V36-quater | (uses pre-AV20 cluster) |
   | Staff/Doctor hide-from-lists (lookup-map opt-in) | V41 | AV20 |
   | Promotion bundle qty multiplier | V42 | (no own AV — folded into AV21-AV23 cluster; CB-5 sanctioned exception) |
   | Skip-stock-deduction overlay | V43 | AV21 |
   | Buy-fetcher canonical-mapper-bypass | V44 | AV22 |
   | Dedup-shadow OR-merge | V45 | AV23 |
   | Rule O productName live-resolve | V46 | AV24 |
   | Display-layer multi-reader-sweep | V47 | AV25 |
   | Rule O universal extension | V48 | AV26 |
   | Canonical-shape-mapper multi-reader-sweep | V49 | AV27 |
   | No-broker-imports-post-strip | V50 | AV28 |

3. **Cross-file grep** — find ALL instances of the same broken pattern PROJECT-WIDE
   (not just same file). Examples:
   ```bash
   # V12 spread-order class:
   grep -rn '{ id: d\.id, \.\.\.d\.data() }' src/lib/

   # V46 denormalization class:
   grep -rn 'productName: <doc>\.productName' src/lib/

   # V49 canonical-shape class:
   grep -rn 'list\(Courses\|Products\|Promotions\)(' src/components/backend/ | \
     grep -v ForPicker
   ```

4. **Fix all in single batch** — single commit fixes every match. Partial fix is forbidden.
   "Single fix" = single ROOT-CAUSE-ADDRESSING fix; spans all class instances. ONE
   class-of-bug at a time (not multiple unrelated). No "while I'm here" improvements
   OUTSIDE the class.

5. **Source-grep regression test** — `tests/<area>-<class>.test.js` locks post-fix shape.
   Future drift fails build. Test must:
   - Assert post-fix shape exists at every fixed callsite
   - Assert PRE-fix bug shape DOES NOT exist (regression guard)
   - Assert sanctioned exceptions are explicitly tagged (not silent skips)

6. **AVxx invariant** — add entry to `audit-anti-vibe-code` SKILL.md OR relevant audit
   skill (audit-stock-flow, audit-money-flow, etc.). Permanent grep guard. Each AV entry must include:
   - Description (1-2 lines)
   - Grep pattern
   - Sanctioned exceptions list
   - Cross-link to test file

7. **Iron-clad rule escalation when architectural** — IF the class is architectural
   (denormalization → live-resolve like Rule O; ID-vs-name confusion → live-resolve;
   secret-leak class → architectural rule), file:
   - (a) NEW iron-clad rule letter (next available after current set)
   - (b) V-entry in `.claude/rules/00-session-start.md` § 2 with verbose lessons archive
     in `.claude/rules/v-log-archive.md`
   - (c) MEMORY.md cross-link if user-level (e.g. new `feedback_*.md`)

   **Threshold for "architectural"**: pattern affects ≥3 sub-systems (e.g. stock + sale
   + treatment), or fixing one instance requires changing the WRITE-TIME contract (not
   just READ-TIME), or pattern returns across multiple V-entries (saga signal).

#### Stop condition (Tier 2 default)

- **Tier 1 (always)**: regression test (Step 5) + AV invariant (Step 6) lands in commit
- **Tier 2 (always)**: + classifier doc / classifier test that enumerates all instances +
  sanctioned categories (V49 CAT8 universal classifier pattern). Auditable trail.
- **Tier 3 (architectural-only)**: + V-entry + iron-clad rule entry (Step 7)

The expansion is "**done**" when ALL of:

1. Audit `/audit-class-of-bug-discipline` reports green for the new AVxx + classifier doc
2. Cross-file grep shows zero remaining unfixed instances
3. Originally-failing tests + the new regression test ALL go green
4. Full `npm test -- --run` green (Rule N implicit override at end of expansion)

#### Interaction with other rules

- **Rule N** (targeted-test-only): Rule N permits targeted runs for small bugfixes.
  **Rule P expansion REQUIRES a full `npm test -- --run` AT THE END** to verify no other
  tests turned red. Targeted runs OK during the fix iterations; full run mandatory before
  claiming done. **Rule N implicit override at expansion end.**
- **Rule D** (continuous improvement): Rule D says "fix + adversarial test + audit
  invariant". Rule P EXTENDS D with explicit cross-file grep + Tier 2 artifacts +
  iron-clad escalation. Rule D = policy; Rule P = operational protocol.
- **Rule I** (full-flow simulate): Rule I mandates flow-simulate at end of every
  sub-phase. When Rule P fires DURING a sub-phase, the flow-simulate test MUST cover
  the class-of-bug expansion path (every instance fixed) — not just the originally-
  surfaced instance.
- **Skill J** (Superpowers Auto-Trigger): `systematic-debugging` invocation MUST include
  Phase 2 Step 5 + Phase 4 Sub-step 6; `verification-before-completion` invocation MUST
  verify Tier 2 artifacts present.

#### Anti-patterns

- ❌ Fix one red, push, "done" — V12/V46-class failure mode
- ❌ Skip class-of-bug grep because "the file in question is small"
- ❌ Add regression test only without AV invariant — drift catcher missing
- ❌ Add AV invariant only without classifier doc — auditable trail missing
- ❌ Skip iron-clad escalation when architectural — V-entry/Rule O lessons unwritten
- ❌ Self-attest "expansion done" without running `/audit-class-of-bug-discipline`
- ❌ "Other instances aren't broken yet, no need to fix preemptively" — same broken
  pattern = latent bugs

#### Lesson lock (V42-V49 saga, 7 rounds)

Each round practiced this discipline ad-hoc. 698 cumulative verification points across 7
V-entries is empirical evidence that this discipline pays for itself. The saga was
ARCHITECTURALLY CLOSED only after Rule O escalation (Tier 3 V46/V48) — proving that
Tier 3 escalation is essential for class-of-bug elimination, not optional polish.

#### Audit + Verify

- **Audit**: `/audit-class-of-bug-discipline` (CB-1..CB-5 invariants).
  Registered in `/audit-all` Tier 1.
- **Verify**: `npm test -- --run tests/audit-class-of-bug-discipline.test.js` —
  must be GREEN pre-deploy.

---

## 4. systematic-debugging skill update plan

Path: `~/.claude/skills/systematic-debugging/SKILL.md` (user-level, currently 296 lines, 4 phases).

### Δ1 — Overview line extension

```diff
 ## Overview

 Random fixes waste time and create new bugs. Quick patches mask underlying issues.
+**AND fixing only the surfaced instance leaves the class-of-bug latent — V42-V49 saga
+empirical proof: 7 rounds of the same class-of-bug because each round only fixed the
+visible instance. Rule P (`.claude/rules/01-iron-clad.md`) codifies the discipline.**

 **Core principle:** ALWAYS find root cause before attempting fixes. Symptom fixes are failure.
+**AND class-of-bug expansion BEFORE proposing fix is mandatory (Rule P).**
```

### Δ2 — Phase 2 (Pattern Analysis) gets new Step 5

Inserted after current Step 4 ("Understand Dependencies"):

```markdown
5. **Find Adjacent Broken Instances (class-of-bug expansion — Rule P)**

   **AFTER root cause is understood (Phase 1) AND patterns identified (Steps 1-4),
   BEFORE proposing fix (Phase 3):**

   a. **Classify class-of-bug** — match against existing AV1-AVxx in
      `audit-anti-vibe-code` SKILL.md OR name a new class. See Rule P § 7-step Step 2
      table for known classes.

   b. **Cross-file grep** — find ALL instances of the same broken pattern PROJECT-WIDE,
      not just the same file. Bash recipes per Rule P § 7-step Step 3.

   c. **List ALL matches** in scratchpad before designing fix. Fix scope = all matches,
      not just the surfaced one.

   d. **If found ≥2 instances**: this is class-of-bug expansion territory. Plan a
      batch fix in Phase 4. **If found 0 other instances after thorough grep**:
      classify as isolated bug and continue with single-fix Phase 4. EITHER WAY,
      continue to Tier 2 artifacts gate (Phase 4 Sub-step 6) — even single-instance
      bugs need regression test + AV invariant + classifier note ("isolated, no other
      instances found").
```

### Δ3 — Phase 4 (Implementation) Step 2 rewritten + new Sub-step 6

```diff
-2. **Implement Single Fix**
-   - Address the root cause identified
-   - ONE change at a time
-   - No "while I'm here" improvements
-   - No bundled refactoring
+2. **Implement Class-of-Bug-Wide Fix (Rule P)**
+   - Address the root cause + ALL class instances identified in Phase 2 Step 5
+   - "Single fix" = single ROOT-CAUSE-ADDRESSING fix; spans all class instances in one commit
+   - ONE class-of-bug at a time (not multiple unrelated classes)
+   - No "while I'm here" improvements OUTSIDE the class
+   - No bundled refactoring of unrelated code
+   - Partial fix (one instance only) FORBIDDEN — V42-V49 saga lesson
```

NEW Sub-step 6 inserted after current Step 5 ("If 3+ Fixes Failed: Question Architecture"):

```markdown
6. **Land Tier 2 Artifacts Before Commit (Rule P)**

   **BEFORE git commit, verify ALL of:**

   a. **Source-grep regression test** — `tests/<area>-<class>.test.js` with assertions
      that lock the post-fix shape. Future drift fails build.

   b. **AVxx invariant** — entry in `audit-anti-vibe-code` SKILL.md OR relevant audit
      skill (audit-stock-flow, audit-money-flow, etc.) with grep pattern + sanctioned
      exceptions documented.

   c. **Classifier doc / test** — enumerate ALL instances of the class found in Phase 2
      Step 5 + categorize each (sanctioned / fixed / pending). V49 CAT8 universal
      classifier is the canonical pattern. May be inline in the regression test
      (≤3 instances) or a separate `.md` doc (>3 instances).

   d. **(If architectural)** — V-entry in `.claude/rules/00-session-start.md` § 2 with
      verbose archive in `.claude/rules/v-log-archive.md`. Plus NEW iron-clad rule letter
      if pattern is project-wide architectural backstop (e.g. Rule O for V46/V48).

   e. **Final verification gate**: run `/audit-class-of-bug-discipline` — must report
      GREEN. Then run full `npm test -- --run` — must show no NEW reds.

   ❌ Skip a/b/c = anti-pattern (V42-V49 saga proves drift returns)
   ❌ Self-attest "expansion done" without running /audit-class-of-bug-discipline = Rule P violation
```

### Δ4 — Quick Reference table + Red Flags + Rationalizations

```diff
 | **1. Root Cause** | Read errors, reproduce, check changes, gather evidence | Understand WHAT and WHY |
-| **2. Pattern** | Find working examples, compare | Identify differences |
+| **2. Pattern** | Find working examples + compare + **find broken adjacent instances (Rule P)** | Identify differences + class-of-bug + ALL instances |
 | **3. Hypothesis** | Form theory, test minimally | Confirmed or new hypothesis |
-| **4. Implementation** | Create test, fix, verify | Bug resolved, tests pass |
+| **4. Implementation** | Create test, fix all class instances, verify, **land Tier 2 artifacts (Rule P)** | Bug class resolved + AV/classifier/regression test landed + audit green |
```

Red Flags additions:
- "Fixed the failing test, moving on" — Rule P violation: did you class-of-bug grep?
- "Single-file fix is enough" — almost always wrong without cross-file grep proof
- "The other instances aren't broken YET" — if they share the pattern, they're latent
  bugs (V42-V49 saga: each round was a previously-latent instance surfacing)

Rationalizations table additions:
| "Just fix this one, expand class-of-bug later" | Saga V42-V49 = 7 rounds of "fix one, expand later → user reports same bug". Expand FIRST. |
| "Other instances aren't broken yet" | Same pattern = latent bugs. Cross-file grep is mandatory. |
| "Architectural rule too heavy for this fix" | When pattern affects ≥3 sub-systems → Rule O class → file iron-clad letter. V46/V48 is the template. |

### Δ5 — Related skills cross-link

```diff
 **Related skills:**
 - **superpowers:test-driven-development** - For creating failing test case (Phase 4, Step 1)
 - **superpowers:verification-before-completion** - Verify fix worked before claiming success
+- **iron-clad Rule P** (`.claude/rules/01-iron-clad.md`) — class-of-bug expansion mandate
+- **/audit-class-of-bug-discipline** — automated drift catcher; run before claiming "expansion done"
```

---

## 5. verification-before-completion skill update plan

Path: `~/.claude/skills/verification-before-completion/SKILL.md` (user-level, currently 140 lines).

### Δ1 — Overview extension

```diff
 ## Overview

 Claiming work is complete without verification is dishonesty, not efficiency.

 **Core principle:** Evidence before claims, always.
+
+**For bug fixes specifically — Rule P (`.claude/rules/01-iron-clad.md`) extends "evidence
+before claims" to "class-of-bug expansion done before 'fixed' claim". V42-V49 saga (7
+rounds of the same class-of-bug because each round only verified the surfaced instance)
+proves single-instance verification is insufficient.**

 **Violating the letter of this rule is violating the spirit of this rule.**
```

### Δ2 — The Gate Function (Step 1+2) extended

```diff
 BEFORE claiming any status or expressing satisfaction:

 1. IDENTIFY: What command proves this claim?
+   - For bug fixes: ALSO identify the class-of-bug grep + AVxx + classifier doc
+     (Rule P Tier 2 artifacts). The verification command set is broader.
 2. RUN: Execute the FULL command (fresh, complete)
+   - For bug fixes: run /audit-class-of-bug-discipline + cross-file grep showing 0
+     remaining instances + full `npm test -- --run`
 3. READ: Full output, check exit code, count failures
 4. VERIFY: Does output confirm the claim?
    - If NO: State actual status with evidence
    - If YES: State claim WITH evidence
 5. ONLY THEN: Make the claim
```

### Δ3 — Common Failures table replace + add

```diff
-| Bug fixed | Test original symptom: passes | Code changed, assumed fixed |
+| Bug fixed (Rule P) | Test original symptom passes + cross-file grep shows 0 other instances + AVxx invariant added + regression test added + classifier doc lists all instances + /audit-class-of-bug-discipline green | Single-file fix; "test passes" without class-of-bug grep; missing artifacts |
+| Class-of-bug expansion done (Rule P) | All Tier 2 artifacts landed in commit + audit green + originally-failing tests + new regression test + full suite all green | "I fixed the surfaced instance and the test passes" |
+| Architectural rule extension done (Rule P Tier 3) | Tier 2 + V-entry in 00-session-start §2 + verbose entry in v-log-archive.md + new iron-clad rule letter filed (if applicable) + MEMORY.md cross-link (user-level) | Tier 2 only — V-entry deferred = institutional memory loss |
```

### Δ4 — Red Flags additions

- For bug fixes: thinking "this fix is small enough to skip class-of-bug grep" — V42-V49
  proves "small fix" + "skip grep" = recurring bug
- Claiming "expansion done" without running /audit-class-of-bug-discipline
- Claiming "fixed" after fixing only the surfaced instance — Rule P requires ALL class instances
- Adding regression test alone without AVxx invariant — drift catcher missing
- Adding AVxx alone without classifier doc — auditable trail missing

### Δ5 — Rationalization Prevention additions

| Excuse | Reality |
|--------|---------|
| "This bug is too small for class-of-bug expansion" | V42-V49 saga: 7 rounds of "small bug, skip expansion → same bug returns" |
| "Other instances aren't broken yet, no need to fix preemptively" | Same broken pattern = latent bugs. Fix all in one batch (Rule P) |
| "Test passes, regression test landed, that's enough" | Tier 2 minimum = AV invariant + classifier doc + regression test. All three. |
| "Architectural rule extension is overkill" | If pattern affects ≥3 sub-systems, file V-entry + new iron-clad letter (V46/V48 → Rule O is the template) |

### Δ6 — Key Patterns additions

```markdown
**Class-of-bug expansion (Rule P):**
```
✅ [Identify class-of-bug] [Cross-file grep all instances] [Fix all in one commit]
   [Add regression test] [Add AVxx invariant] [Add classifier doc]
   [Run /audit-class-of-bug-discipline → green] [Run full npm test → green]
   "Class-of-bug expansion done. N instances fixed. AVxx + classifier doc + regression test landed."

❌ "Fixed the failing test" (single-instance fix, no class-of-bug grep)
❌ "Added regression test" (without AVxx + classifier — drift catcher missing)
❌ "AVxx added" (without classifier doc + cross-file proof)
❌ "Done" without running /audit-class-of-bug-discipline
```

**Architectural rule extension (Rule P Tier 3):**
```
✅ [Tier 2 complete] [Pattern affects ≥3 sub-systems confirmed] [V-entry in 00-session-start §2]
   [Verbose entry in v-log-archive.md] [NEW iron-clad rule letter filed if applicable]
   [MEMORY.md cross-link if user-level]
   "Tier 3 architectural escalation complete. Iron-clad Rule X filed. V-entry locked."

❌ Tier 2 only when class is architectural — institutional memory loss
```
```

### Δ7 — When To Apply additions

- Claiming any bug is "fixed" — Rule P Tier 2 artifacts gate first
- Claiming any class-of-bug expansion is "done" — `/audit-class-of-bug-discipline` green first
- Filing a V-entry — verify pattern truly affects ≥3 sub-systems before Tier 3 escalation

### Δ8 — Why This Matters extension

```markdown
**Rule P-specific (V42-V49 saga, 2026-05-08)**:
- 7 rounds of the same class-of-bug because each round verified only the surfaced instance
- User frustration ("กูแค่ edit รูป กับ chart ไปเพิ่ม / บั๊คแม่งไม่จบไม่สิ้นจริงๆ")
- Saga ARCHITECTURALLY CLOSED only after Rule O escalation (Tier 3 V46/V48)
- 698 cumulative verification points proved Tier 2 minimum is the right floor
- Rule P + this skill's gate = the institutional lock against future saga repeats
```

---

## 6. NEW `/audit-class-of-bug-discipline` skill

Path: `.agents/skills/audit-class-of-bug-discipline/{SKILL.md, patterns.md}`
(project-level, mirrors `audit-anti-vibe-code` location).

### SKILL.md structure

```yaml
---
name: audit-class-of-bug-discipline
description: Audit Rule P (class-of-bug expansion) compliance. Every V-entry must map to AVxx + regression test + classifier doc; every architectural class must have iron-clad rule + V-entry; sanctioned exceptions documented. Use before release and after every multi-V-entry session.
---
```

Sections:
1. **Overview** — what Rule P + this audit enforces
2. **When to run** — pre-release / post-multi-V-entry-session / before /audit-all closes
3. **Invariants CB-1..CB-5** (detailed below)
4. **Sanctioned exception catalog**
5. **Verify** — `npm test -- --run tests/audit-class-of-bug-discipline.test.js`
6. **Registered in /audit-all** — Tier 1 cross-link

### Invariants

**CB-1 — Every V-entry (V42+) maps to an AVxx invariant**

- **Why**: V42-V49 saga proved every class-of-bug expansion needs a permanent grep guard.
  Without an AVxx, future drift returns silently.
- **Check**: grep `00-session-start.md § 2` for V-entries V42 onward; grep
  `audit-anti-vibe-code/SKILL.md` for AV20-AV28 baseline; verify each V-entry cites an
  AVxx (or sanctioned-exception entry in CB-5 catalog).
- **Mapping table** (post-V50 baseline, verified against `audit-anti-vibe-code/SKILL.md`):
  V41→AV20, V42→(no own AV — folded into AV21-AV23 cluster), V43→AV21, V44→AV22,
  V45→AV23, V46→AV24, V47→AV25, V48→AV26, V49→AV27, V50→AV28.
- **Sanctioned exception**: V-entries that only refine an existing AVxx (e.g. V36-quater
  extends V12; V42 folded into AV21-AV23 cluster because the promo-bundle bug surfaced
  during the V43-V45 saga and shares root-cause signature with skip-stock-deduction
  overlay) noted in CB-5 catalog with rationale.

**CB-2 — Every AVxx has a regression test file in `tests/`**

- **Why**: AVxx is a contract; regression test is the build-time enforcement.
- **Check**: for each AVxx in `audit-anti-vibe-code/SKILL.md`, parse the "Verify" line
  citing the test file; verify file exists; verify test contains the AVxx grep (not stub).
- **Sanctioned exception**: AVxx that's purely descriptive ("guidance, not enforced")
  must be tagged `// audit-class-of-bug-discipline: CB-2 descriptive only` in audit body.

**CB-3 — Every class-of-bug expansion has a classifier doc / classifier test**

- **Why**: Tier 2 minimum requires enumeration of all instances + sanctioned categories.
  Without classifier, "expansion done" claim is unverifiable.
- **Check**: for each AVxx, verify classifier section exists (CAT block in regression
  test, OR separate `.md` classifier doc referenced from AVxx entry); classifier must
  enumerate (a) instances fixed, (b) sanctioned exceptions, (c) ongoing-monitoring sites.
- **Sanctioned exception**: AVxx with ≤3 instances may inline enumeration in the
  regression test — tag with `// classifier inline` comment.

**CB-4 — Every architectural class has iron-clad rule + V-entry + verbose archive**

- **Why**: Tier 3 escalation locks the architectural pattern as a permanent backstop.
  Pattern affecting ≥3 sub-systems without iron-clad rule = institutional memory loss.
- **Check**: for each iron-clad rule (A-O currently, P+ after this design lands),
  verify (a) compact entry in `00-session-start.md § 1`, (b) full body in
  `01-iron-clad.md`, (c) at least one V-entry in `00-session-start.md § 2` cites the
  rule, (d) verbose archive entry in `v-log-archive.md`.
- **Sanctioned exception**: rules that are pure-policy (Rule D continuous-improvement)
  may not have a specific V-entry — tag in CB-5 catalog as "policy rule, no
  triggering V".

**CB-5 — Sanctioned exception catalog maintained**

- **Why**: every CB-1..CB-4 miss must be documented with rationale, otherwise audit
  becomes "well, that one's fine" hand-waved exemption.
- **Check**: audit skill's exception catalog section has an entry for each known CB-N
  miss; each entry cites (a) WHICH invariant skipped, (b) WHY (1-line rationale),
  (c) REVIEW DATE (sunset for re-checking).
- **Anti-pattern**: "this one's a one-off, no catalog needed" — every miss in catalog
  OR fix it.

### `patterns.md` shape (mirror `audit-anti-vibe-code/patterns.md`)

For each invariant CB-1..CB-5, provide:
- Description (1-2 lines)
- Grep recipe (bash one-liner)
- Expected output (red flag pattern)
- Fix recipe (how to bring into compliance)

Example for CB-1:
```bash
# CB-1: Every V42+ V-entry → AVxx mapping check
grep -E "^\| V[4-9][0-9] \|" .claude/rules/00-session-start.md \
  | awk -F'|' '{print $2, $3, $4}' \
  | sort -u
# Expected: each row's $4 (Pattern column) cites AVxx; if not, V-entry violates CB-1.
```

### Test file `tests/audit-class-of-bug-discipline.test.js`

Mirrors `tests/audit-branch-scope.test.js` shape. Test groups:

```js
describe('CB-1: V-entry → AVxx mapping', () => {
  it('CB-1.1: every V42+ V-entry has AVxx citation OR sanctioned-exception entry', ...);
  it('CB-1.2: AV20-AV28 baseline mapping matches 00-session-start.md V-entries', ...);
  it('CB-1.3: no orphan AVxx (every AV has at least one V-entry citation)', ...);
});

describe('CB-2: AVxx → regression test', () => {
  it('CB-2.1: every AVxx in audit-anti-vibe-code SKILL.md references tests/ file', ...);
  it('CB-2.2: referenced test file exists', ...);
  it('CB-2.3: test file actually contains the AVxx grep (not stub)', ...);
});

describe('CB-3: Classifier doc/test', () => {
  it('CB-3.1: every AVxx test has CAT-style classifier OR classifier inline tag', ...);
  it('CB-3.2: classifier enumerates fixed/sanctioned/ongoing sites', ...);
});

describe('CB-4: Architectural class → iron-clad + V-entry + archive', () => {
  it('CB-4.1: each iron-clad rule (A-P) has compact entry in 00-session-start §1', ...);
  it('CB-4.2: each rule has full body in 01-iron-clad.md', ...);
  it('CB-4.3: each rule has V-entry citation OR is policy-only (CB-5 catalog)', ...);
  it('CB-4.4: each architectural rule has verbose entry in v-log-archive.md', ...);
});

describe('CB-5: Sanctioned exception catalog', () => {
  it('CB-5.1: catalog section exists in audit-class-of-bug-discipline SKILL.md', ...);
  it('CB-5.2: each catalog entry has WHICH/WHY/REVIEW-DATE fields', ...);
  it('CB-5.3: every CB-1..CB-4 expected miss is in catalog', ...);
});

describe('CB-meta: skill registration', () => {
  it('CB-meta.1: registered in /audit-all Tier 1', ...);
  it('CB-meta.2: cross-referenced from systematic-debugging Related skills', ...);
  it('CB-meta.3: cross-referenced from verification-before-completion Key Patterns', ...);
});
```

Estimated 18-22 tests total.

### Registration in `/audit-all`

`/audit-all` SKILL.md Tier 1 table gets row:

```diff
 | audit-anti-vibe-code | AV1-AV28 | Critical anti-patterns | tests/audit-anti-vibe-code.test.js |
+| audit-class-of-bug-discipline | CB-1..CB-5 | Rule P expansion compliance | tests/audit-class-of-bug-discipline.test.js |
 | audit-branch-scope | BS-1..BS-9 | Branch-Scope Architecture | tests/audit-branch-scope.test.js |
```

---

## 7. Cross-references

### `00-session-start.md` § 1 (iron-clad summary list) gets new entry

```markdown
- **P. 🆕 Class-of-bug expansion at every bug discovery** (2026-05-08 after V42-V49 saga 7-round class-of-bug class) — ทุก bug discovery (test red / user-report / claude-noticed / audit-red) ต้อง **7-step expansion**: diagnose → classify class-of-bug → cross-file grep → fix all in batch → regression test → AVxx invariant → escalate iron-clad rule + V-entry เมื่อ architectural. Stop = `/audit-class-of-bug-discipline` green + classifier doc 0 remaining + full suite green. Trigger discrimination **strict** (ทุก red); scope **broad** (test+user+claude+audit). NO quick fix-and-ship. **Tier 2 default artifacts** (regression test + AVxx + classifier doc); Tier 3 escalation (V-entry + iron-clad rule) เฉพาะ architectural. ดู `.claude/rules/01-iron-clad.md` Rule P (full workflow + Tier 1/2/3 artifacts + 7 anti-patterns + audit hook).
```

### `CLAUDE.md` project root "Iron-clad ย่อ" section gets line

```diff
 - **N. 🆕 Targeted-test-only for small bugfixes** ...
 - **M. 🆕 Data ops via local + admin SDK + pull env** ...
+- **P. 🆕 Class-of-bug expansion at every bug discovery** (2026-05-08 หลัง V42-V49 saga) — ทุก bug discovery → 7-step expansion (diagnose → classify → cross-file grep → fix all → regression test → AVxx → escalate iron-clad เมื่อ architectural). Tier 2 default artifacts. Stop = /audit-class-of-bug-discipline green + classifier 0 remaining + full suite green. ดู `.claude/rules/00-session-start.md` Rule P + `01-iron-clad.md` Rule P.
 - **J. 🆕 Superpowers Auto-Trigger** ...
```

### `MEMORY.md` index gets pointer (user-level)

```diff
 ## 🔥 IRON-CLAD RULES — NEVER FORGET
 - **⭐ START EVERY SESSION WITH**: `.claude/rules/00-session-start.md` ...
 - **NEW Rule H (2026-04-20)**: Data ownership ...
+- **NEW Rule P (2026-05-08)**: Class-of-bug expansion at every bug discovery — ทุก test red / user-report / claude-noticed / audit-red → 7-step expansion. Tier 2 artifacts (regression test + AVxx + classifier doc) มาตรฐาน; Tier 3 (V-entry + iron-clad rule) เฉพาะ architectural. Audit `/audit-class-of-bug-discipline` registered in `/audit-all` Tier 1. ดู [feedback_class_of_bug_expansion.md](feedback_class_of_bug_expansion.md).
```

### NEW `feedback_class_of_bug_expansion.md` (user-level memory file)

```markdown
---
name: Class-of-bug expansion
description: Rule P locked 2026-05-08 — V42-V49 saga discipline codified. When test fails / user reports bug / claude notices pattern / audit flags, expand class-of-bug grep before claiming done.
type: feedback
---

When ANY bug surfaces, expand class-of-bug grep across project BEFORE claiming "done".
Single-instance fix is forbidden.

**Why**: V42-V49 saga (7 rounds of the same class-of-bug, 2026-05-08) — each round only
fixed the surfaced instance, user reported same symptom from a different latent instance.

**How to apply**: invoke `Skill(systematic-debugging)` for Phase 2 Step 5 (Find Adjacent
Broken Instances) + Phase 4 Sub-step 6 (Land Tier 2 Artifacts). Then invoke
`Skill(verification-before-completion)` for the gate. Tier 2 minimum = regression test
+ AVxx invariant + classifier doc. Tier 3 (architectural) adds V-entry + iron-clad
rule. Audit via `/audit-class-of-bug-discipline` GREEN.
```

---

## 8. Acceptance Criteria

The implementation is complete when ALL of:

1. ✅ Rule P body lands in `.claude/rules/01-iron-clad.md` (after Rule O, alphabetical)
2. ✅ Compact Rule P entry in `.claude/rules/00-session-start.md` § 1
3. ✅ `CLAUDE.md` "Iron-clad ย่อ" section gets P line
4. ✅ `~/.claude/skills/systematic-debugging/SKILL.md` Δ1-Δ5 applied
5. ✅ `~/.claude/skills/verification-before-completion/SKILL.md` Δ1-Δ8 applied
6. ✅ NEW `.agents/skills/audit-class-of-bug-discipline/SKILL.md` + `patterns.md` exist
7. ✅ NEW `tests/audit-class-of-bug-discipline.test.js` with 18-22 tests, all GREEN
8. ✅ `/audit-all` SKILL.md registers audit-class-of-bug-discipline in Tier 1
9. ✅ `MEMORY.md` index gets Rule P pointer
10. ✅ NEW `~/.claude/projects/F--LoverClinic-app/memory/feedback_class_of_bug_expansion.md`
11. ✅ Sanctioned exception catalog in audit-class-of-bug-discipline SKILL.md populated
    for AV1-AV19 (pre-V42, may not all map cleanly)
12. ✅ Full `npm test -- --run` GREEN (no regressions; 5 pre-existing TFP failures
    don't count)
13. ✅ Build clean (`npm run build`)

## 9. Migration / Rollout

**No deploy required**. This is methodology-only — no UI, no schema, no API changes.
Files that change:

- 4 LoverClinic project files (rules + CLAUDE.md)
- 2 user-level skill files (systematic-debugging + verification-before-completion)
- 3 NEW project skill files (audit-class-of-bug-discipline SKILL.md + patterns.md + test)
- 1 user-level memory pointer file (feedback_class_of_bug_expansion.md)
- 1 user-level MEMORY.md index update

Total: ~10 files. Single commit per layer (rule-text → skill-update → audit-skill-create →
test-bank-create → cross-references). Estimated 4-5 commits.

**Rollout order** (safest):

1. Land Rule P body + 00-session-start.md compact entry + CLAUDE.md (project rule)
2. Land user-level skill updates (systematic-debugging + verification-before-completion)
3. Create NEW audit skill + patterns.md
4. Create test bank + verify GREEN
5. Register in `/audit-all` + cross-references (MEMORY.md, feedback memory)

This way each landing is independently verifiable; if step N has issues, rollback only
that step.

## 10. Open Questions / Sanctioned Exceptions

### Open question 1: AV1-AV19 (pre-V41) baseline classification + V42 sanctioned-exception

The CB-1..CB-5 invariants assume V41+ V-entries map cleanly to AV20+. Two carve-outs
required:

1. **AV1-AV19** (pre-saga AV invariants) predate the formal class-of-bug discipline.
   Some may not have 1:1 V-entry mappings.
2. **V42** (promo bundle qty multiplier) was fixed during the V43-V45 saga but did
   NOT receive its own AVxx — its broken-pattern signature folded into the AV21-AV23
   cluster (denormalized-flag + canonical-mapper-bypass + dedup-shadow). It's the
   only V-entry in V41-V50 without a 1:1 AV mapping.

**Resolution**: populate CB-5 sanctioned exception catalog on first run with:
- AV1-AV19: each with rationale ("pre-saga invariant, descriptive guidance, no
  triggering V") and REVIEW-DATE for re-checking
- V42: explicit entry — "V42 promo bundle qty multiplier folded into AV21-AV23 cluster;
  the 4 writer sites were patched in same saga commit; classifier doc lives in
  `tests/v42-promotion-bundle-qty-multiplier.test.js`"

### Open question 2: How does Rule P interact with Rule K (work-first, test-last)?

Rule K says "complete implementation structure first, then write tests". Rule P says
"every red triggers expansion". If during multi-stream cycle a red appears mid-stream,
does Rule P pause Rule K's work-first ordering?

**Resolution**: Rule P takes precedence — class-of-bug expansion is mandatory regardless
of where in the cycle the red appears. Rule K's "test-last" applies to GREEN tests
(adding coverage); Rule P fires on REDS (real bugs). No conflict in practice.

### Open question 3: How does Rule P apply to the 5 pre-existing TFP failures
(BSA T6.1 + phase-17-2-septies S3)?

**Resolution**: pre-existing-known reds tracked in SESSION_HANDOFF "known failures" list
are deferred from Rule P fire-cycle. They're flagged as "separate task" — not exempt,
just temporarily parked. When user authorizes addressing them, Rule P applies normally
at that time.

### Open question 4: Should Rule P fire on `/audit-*` skill reds?

**Decision (Q4)**: YES. Audit reds are bug discoveries — same class as test reds.
Rule P fires; the audit's named invariant becomes the "class" for grep expansion.

### Open question 5: V-entry threshold for "architectural"

The Rule P body says "≥3 sub-systems" for Tier 3 escalation. But this is a heuristic.

**Resolution**: when in doubt, escalate. False-positive Tier 3 (V-entry filed for a
pattern that turns out to affect only 1 sub-system) is recoverable (entry stays as
historical record). False-negative (architectural pattern shipped without iron-clad
escalation) is the V42-V49 saga repeat we're trying to prevent.

---

## 11. References

- `.claude/rules/00-session-start.md` — current iron-clad rules A-O + V-entries
- `.claude/rules/01-iron-clad.md` — current iron-clad rule bodies
- `.claude/rules/v-log-archive.md` — verbose V-entry archive
- `~/.claude/skills/systematic-debugging/SKILL.md` — current 4-phase debugging skill
- `~/.claude/skills/verification-before-completion/SKILL.md` — current gate function
- `.agents/skills/audit-anti-vibe-code/SKILL.md` — AV1-AV28 invariant set
- `tests/audit-branch-scope.test.js` — invariant test file template (BS-1..BS-9)
- V42-V49 V-entries (compact in 00-session-start §2; verbose in v-log-archive)
- V50 V-entry (ProClinic strip — Rule H-bis EXECUTED)

---

**End of design spec.** Awaiting user spec review → writing-plans → executing-plans.
