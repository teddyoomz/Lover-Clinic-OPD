---
name: audit-class-of-bug-discipline
description: "Audit Rule P (class-of-bug expansion at every bug discovery) compliance. Every V42+ V-entry must map to an AVxx invariant; every AVxx must have a regression test in tests/; every class-of-bug expansion must have a classifier doc/test enumerating all instances; every architectural class must have an iron-clad rule + V-entry + verbose archive entry; sanctioned exceptions must be documented in CB-5 catalog. Use before release and after every multi-V-entry session — and before /audit-all closes."
user-invocable: true
argument-hint: "[--quick | --full]"
allowed-tools: "Read, Grep, Glob, Bash"
---

# Audit Class-of-Bug Discipline — Rule P enforcement

**Purpose**: Catch drift in the Rule P expansion methodology before it lets a class-of-bug saga return.

Rule P (`.claude/rules/01-iron-clad.md`) was added 2026-05-08 after the V42-V49 saga (7 rounds of the same class-of-bug, 698 cumulative verification points). Each round followed an ad-hoc class-of-bug expansion discipline that the V46/V48 architectural escalation finally codified. Rule P mandates a 7-step expansion at every bug discovery (test red / user-report / claude-noticed / audit-red) with **Tier 2 default artifacts** (regression test + AVxx invariant + classifier doc) and **Tier 3 escalation** (V-entry + iron-clad rule) when the pattern is architectural.

This audit guards the methodology — without CB-1..CB-5 holding, future bugs can quietly slip past the discipline (e.g. fixed without an AVxx, missing a classifier doc, or escalating to architectural class without filing a V-entry).

## When to run

- **Pre-release** — combined with `/audit-all` Tier 1 (this audit is registered there)
- **After any multi-V-entry session** — when 2+ V-entries land in the same week, sweep CB-1..CB-5 to confirm each closed correctly
- **Before claiming "expansion done"** — Rule P's stop condition includes `/audit-class-of-bug-discipline` GREEN
- **After adding a new AVxx invariant** — verify CB-1..CB-3 are met before merge
- **Before ironing-clad a NEW rule letter** — verify CB-4 will hold for the new rule

## Invariants (CB-1..CB-5)

### CB-1 — Every V-entry (V42+) maps to an AVxx invariant

**Why**: V42-V49 saga proved every class-of-bug expansion needs a permanent grep guard. Without an AVxx, future drift returns silently — the regression test exists but no audit invariant catches NEW callsites that drift from the safer pattern.

**Check**:
- Grep `00-session-start.md § 2` for V-entries V42 onward
- For each, verify it cites an AVxx (in V-entry body, "Audit invariant" / "AV invariant" subsection)
- OR is documented in the CB-5 sanctioned exception catalog with rationale

**Mapping table** (post-V50 baseline, verified against `audit-anti-vibe-code/SKILL.md` 2026-05-08):

| V-entry | AVxx | Class |
|---------|------|-------|
| V41 | AV20 | Staff/Doctor hide-from-lists (lookup-map opt-in) |
| V42 | (sanctioned — CB-5) | Promotion bundle qty multiplier (folded into AV21-AV23 cluster) |
| V43 | AV21 | Skip-stock-deduction overlay (denormalized-flag live-resolve) |
| V44 | AV22 | Buy-fetcher canonical-mapper-bypass |
| V45 | AV23 | Dedup-shadow OR-merge |
| V46 | AV24 | Rule O productName live-resolve |
| V47 | AV25 | Display-layer multi-reader-sweep (course grouping) |
| V48 | AV26 | Rule O universal extension to all stock writers |
| V49 | AV27 | Canonical-shape-mapper multi-reader-sweep (picker fetch) |
| V50 | AV28 | No-broker-imports-post-strip (ProClinic full strip) |

**Sanctioned exceptions**: V-entries that only refine an existing AVxx (e.g. V36-quater extends V12; V42 folded into AV21-AV23 cluster) — noted in CB-5 catalog with rationale + REVIEW-DATE.

### CB-2 — Every AVxx has a regression test file in `tests/`

**Why**: AVxx is a contract; the regression test is the build-time enforcement. Without a test, a new commit can re-introduce the broken pattern silently.

**Check**:
- Parse `audit-anti-vibe-code/SKILL.md` for AVxx entries
- For each, the AV body's "Source-grep regression test pattern" subsection (or AV-level cross-link) must cite a test file path
- Verify the file exists in `tests/`
- Verify the file's body contains the AVxx grep (not a stub / TODO)

**Sanctioned exception**: AVxx that's purely descriptive ("guidance, not enforced" — e.g. AV1 about duplicate components; AV10 about copy-paste UI) must be tagged in CB-5 catalog as `descriptive-only`.

### CB-3 — Every class-of-bug expansion has a classifier doc / classifier test

**Why**: Tier 2 minimum requires enumeration of all instances + sanctioned categories. Without a classifier, "expansion done" claim is unverifiable — auditors can't confirm cross-file grep was complete.

**Check**:
- For each AVxx (V41+), verify a classifier section exists. Acceptable forms:
  - **CAT-style classifier** in the regression test (e.g. V49 CAT8 "universal classifier of all 28 list*() consumers" → 5 categories ForPicker/Canonical/Sanctioned/Internal/Defensive)
  - **Separate classifier `.md`** doc referenced from the AVxx entry
  - **Inline enumeration** in the regression test for AVxx with ≤3 instances — tag with `// classifier inline` comment

**Required classifier elements**:
1. List of instances **fixed** (file:line citations preferred)
2. List of **sanctioned exceptions** (with annotation pattern + rationale)
3. Optional: list of **ongoing-monitoring sites** (legitimate uses that future commits should preserve)

### CB-4 — Every architectural class has iron-clad rule + V-entry + verbose archive

**Why**: Tier 3 escalation locks the architectural pattern as a permanent backstop. Pattern affecting ≥3 sub-systems without an iron-clad rule = institutional memory loss. The V46/V48 → Rule O escalation is the canonical proof.

**Threshold for "architectural"** (per Rule P body):
1. Pattern affects ≥3 sub-systems (e.g. stock + sale + treatment), OR
2. Fixing one instance requires changing the WRITE-TIME contract (not just READ-TIME), OR
3. Pattern returns across multiple V-entries (saga signal)

**Check**: for each iron-clad rule (A through whatever the latest letter is — currently A-P after Rule P 2026-05-08):
- (a) Compact entry in `.claude/rules/00-session-start.md` § 1
- (b) Full body in `.claude/rules/01-iron-clad.md`
- (c) At least one V-entry in `00-session-start.md` § 2 cites the rule (saga signal proves architectural)
- (d) Verbose archive entry in `.claude/rules/v-log-archive.md`

**Sanctioned exception**: pure-policy rules that don't have a triggering bug (e.g. Rule D Continuous Improvement codifies discipline, not a specific bug fix) may not have a V-entry — tag in CB-5 as `policy-rule, no triggering V`.

### CB-5 — Sanctioned exception catalog maintained

**Why**: every CB-1..CB-4 miss must be documented with rationale, otherwise the audit becomes "well, that one's fine" hand-waved exemption. Catalog forces explicit justification.

**Check**:
- This skill's "Sanctioned exception catalog" section (below) has an entry for each known CB-N miss
- Each entry has: WHICH invariant skipped (CB-1/2/3/4) + WHY (1-line rationale) + REVIEW DATE (when to re-check)

**Anti-pattern**: "this one's a one-off, no catalog needed" — every miss in catalog OR fix it.

## Sanctioned exception catalog (CB-5)

Pre-V41 invariants AV1-AV19 predate the formal class-of-bug discipline; V42 has no own AVxx because its broken-pattern signature folded into the AV21-AV23 cluster. These are documented exceptions to CB-1..CB-4.

| Exception | Skipped invariant | Why | Review date |
|-----------|-------------------|-----|-------------|
| AV1 (no duplicate component) | CB-1 | Pre-saga descriptive guidance — no triggering V-entry; codifies Rule of 3 hygiene | 2026-11-08 |
| AV2 (no raw `<input type="date">`) | CB-1 | Pre-saga descriptive guidance — no triggering V-entry; canonical DateField hygiene | 2026-11-08 |
| AV3 (no `Math.random` for tokens) | CB-1 | Pre-saga descriptive guidance — no triggering V-entry; Rule C2 enforcement | 2026-11-08 |
| AV4 (no credentials in src/api) | CB-1 | Pre-saga descriptive guidance — no triggering V-entry; Rule C2 enforcement | 2026-11-08 |
| AV5 (no admin-uid in world-readable docs) | CB-1 | Pre-saga descriptive guidance — V19-class but predates formal V-mapping | 2026-11-08 |
| AV6 (no `if true` in rules) | CB-1 | Pre-saga descriptive guidance — V1/V9 cluster but predates 1:1 V-mapping | 2026-11-08 |
| AV7 (every collection has reader+writer) | CB-1 | Pre-saga descriptive guidance — Rule C3 hygiene | 2026-11-08 |
| AV8 (no orphan log/history collection) | CB-1 | Pre-saga descriptive guidance — Rule C3 hygiene | 2026-11-08 |
| AV9 (canonical shared modules reused) | CB-1 | Pre-saga descriptive guidance — Rule C1 enforcement | 2026-11-08 |
| AV10 (Rule of 3 for copy-paste UI) | CB-1, CB-2 (descriptive-only) | Pre-saga descriptive guidance — guidance pattern, not strictly grep-enforced | 2026-11-08 |
| AV11 (no over-normalized docs) | CB-1 | Pre-saga descriptive guidance — Rule C3 hygiene | 2026-11-08 |
| AV12 (no orphan collections) | CB-1 | Pre-saga descriptive guidance — Rule C3 hygiene | 2026-11-08 |
| AV13 (long-lived auth-write-blocked) | CB-1 | V23 origin but predates formal V→AV mapping discipline | 2026-11-08 |
| AV14 (silent cleanup masks failure) | CB-1 | V27 origin but predates formal V→AV mapping discipline | 2026-11-08 |
| AV15 (silent-swallow + missing token revoke) | CB-1 | V31 origin but predates formal V→AV mapping discipline | 2026-11-08 |
| AV16 (source-grep visual must pair runtime) | CB-1 | V32-family origin but predates formal V→AV mapping discipline | 2026-11-08 |
| AV17 (list spread-order docId wins) | CB-1 | V38 origin — formally maps to V38 (V42+ baseline starts at V41/AV20) | 2026-11-08 |
| AV18 (migrate-fn `{branchId}` opt) | CB-1 | V39 origin — formally maps to V39 (V42+ baseline starts at V41/AV20) | 2026-11-08 |
| AV19 (destructive ops auto-backup-ref) | CB-1 | V40 origin — formally maps to V40 (V42+ baseline starts at V41/AV20) | 2026-11-08 |
| V42 (promo bundle qty multiplier) | CB-1 | Folded into AV21-AV23 cluster — fix landed in same V43-V45 saga commit; classifier in `tests/v42-promotion-bundle-qty-multiplier.test.js` | 2026-11-08 |
| Rule D (continuous improvement) | CB-4 (policy-rule) | Policy / methodology rule — codifies discipline rather than fixing a specific bug | 2026-11-08 |

**Adding entries**: when a new CB-1..CB-4 miss is identified, add a row to this table. Include WHICH invariant + WHY (1-line) + REVIEW DATE (typically 6 months out). Re-check on the review date — if the rationale still holds, extend; if not, fix and remove.

## Verify

```bash
npm test -- --run tests/audit-class-of-bug-discipline.test.js
```

Expected: ~18-22 tests across 6 describe blocks (CB-1, CB-2, CB-3, CB-4, CB-5, CB-meta) all GREEN.

For interactive investigation, use grep recipes from [patterns.md](patterns.md).

## Registered in /audit-all

Tier 1 (release-blocking) alongside `/audit-anti-vibe-code`. See `.claude/skills/audit-all/SKILL.md` Tier 1 table.

## Companion files

- [patterns.md](patterns.md) — concrete grep recipes (Bash) per invariant CB-1..CB-5
- `tests/audit-class-of-bug-discipline.test.js` — automated regression bank (drift catcher)
- `.claude/rules/01-iron-clad.md` Rule P — the source rule this audit enforces
- `.claude/rules/00-session-start.md` § 2 — V-entry catalog (CB-1 input)
- `.agents/skills/audit-anti-vibe-code/SKILL.md` — AVxx invariants (CB-1, CB-2 input)

## Cross-references

- Rule P body: `.claude/rules/01-iron-clad.md` "Rule P — Class-of-bug expansion at every bug discovery"
- V42-V49 saga: `00-session-start.md § 2` V42 through V50 (verbose entries in `v-log-archive.md`)
- systematic-debugging skill: `~/.claude/skills/systematic-debugging/SKILL.md` Phase 2 Step 5 + Phase 4 Sub-step 6 (Rule P operationalization)
- verification-before-completion skill: `~/.claude/skills/verification-before-completion/SKILL.md` (Rule P gate function)
