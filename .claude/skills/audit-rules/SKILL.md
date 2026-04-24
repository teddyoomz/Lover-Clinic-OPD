---
name: audit-rules
description: Lint the rule files themselves. Every rule should be well-formed — numbered, greppable, evidence-backed, non-contradicting, and enforceable. Without this audit, rule quality decays silently as files grow. Run before every major rule addition + monthly.
---

# /audit-rules

**The meta-audit.** Rules are code — they need the same quality discipline
as source files. This skill greps the rule files (`.claude/rules/*.md`)
and checks 10 invariants.

**This skill does NOT auto-fix.** It reports. Rule edits are human territory.

## LR1 — Every rule has a name + identifier

Rules must be uniquely identified (letter A-Z or numbered A.1/A.2 for sub-rules):

```bash
grep -nE "^### [A-Z]\.|^### [A-Z]\.[0-9]" .claude/rules/01-iron-clad.md
# Every rule heading must match this pattern.
```

**Fix:** add missing identifier. Rule without identifier can't be cited
from V-entries or audit skills.

## LR2 — Every rule has a "Why" section

```bash
# For each rule section, there should be a Why / motivation paragraph
grep -nE "^### [A-Z]" .claude/rules/01-iron-clad.md | while read line; do
  # Check next 20 lines contain "Why:" or "why:" or motivation
  file=".claude/rules/01-iron-clad.md"
  ln=$(echo "$line" | cut -d: -f1)
  block=$(sed -n "${ln},$((ln+20))p" "$file")
  echo "$block" | grep -qE "Why:|motivation|anti-example|V[0-9]" \
    || echo "[LR2] $line — no Why / motivation found"
done
```

**Fix:** add 1-2 sentence Why paragraph. Rules without motivation get
ignored because readers don't understand the cost of breaking them.

## LR3 — Every rule has a grep target OR an "ABSTRACT" marker

Rules that can be verified by grep should have the grep pattern inline.
Abstract rules (e.g. "be polite") should explicitly mark themselves:

```bash
# Rule body should contain ```bash block OR the string "ABSTRACT (no grep)"
grep -nE "^### [A-Z]" .claude/rules/01-iron-clad.md | while read line; do
  file=".claude/rules/01-iron-clad.md"
  ln=$(echo "$line" | cut -d: -f1)
  block=$(sed -n "${ln},$((ln+60))p" "$file")
  echo "$block" | grep -qE '```bash|ABSTRACT \(no grep\)' \
    || echo "[LR3] $line — no grep target and no ABSTRACT marker"
done
```

**Fix:** either add a bash grep example in the rule body, or mark it
"ABSTRACT (no grep)" with a comment explaining why grep isn't possible.

## LR4 — Every rule cites evidence (V-entry or PRE-SHIP marker)

Rules motivated by real bugs must cite the V-entry. Rules added
proactively (no bug yet) must say so explicitly:

```bash
grep -nE "^### [A-Z]" .claude/rules/01-iron-clad.md | while read line; do
  file=".claude/rules/01-iron-clad.md"
  ln=$(echo "$line" | cut -d: -f1)
  block=$(sed -n "${ln},$((ln+50))p" "$file")
  echo "$block" | grep -qE "V[0-9]+|PRE-SHIP" \
    || echo "[LR4] $line — no V-entry citation and no PRE-SHIP marker"
done
```

**Fix:** add `V-example: V7 (YYYY-MM-DD)` reference, or mark `PRE-SHIP
— no real-world bug yet, rule added based on known pattern`.

**Why this matters:** a rule without evidence is decoration. Future
sessions (or reviewers) can't assess whether it should still exist.

## LR5 — No duplicate identifiers

```bash
grep -rnE "^### [A-Z]\." .claude/rules/ | \
  sed -E 's/.*### ([A-Z]\.[0-9]*|[A-Z])\. .*/\1/' | \
  sort | uniq -d
# Any output = duplicate rule identifier across files
```

**Fix:** renumber. Two rules named "E" in different files = ambiguous
citations.

## LR6 — Rule names are imperatives (verb-first)

Good: "Bug-Blast Revert", "Probe-Deploy-Probe", "Continuous Improvement"
Bad: "About Secrets", "Security Thoughts", "Considerations for Tokens"

```bash
# Extract rule titles; flag ones that start with "About" / "Thoughts" / "Consider" / preposition
grep -nE "^### [A-Z]" .claude/rules/*.md | \
  grep -iE "^.*: ### [A-Z]\.? ?(About|Thoughts|Consider|On |For )"
```

**Fix:** rewrite as imperative. "About Secrets" → "Guard Secrets".

## LR7 — No rule body exceeds 500 lines

Long rules don't get read. Split into sub-rules.

```bash
# For each rule, count lines until next ###
awk '/^### [A-Z]/{if(count>500)print prev" had "count" lines";prev=$0;count=0}{count++}' \
  .claude/rules/01-iron-clad.md
```

**Fix:** split into A, A.1, A.2 with each under 200 lines.

## LR8 — Referenced audit skills must exist

Rule mentions `/audit-XYZ` → check the skill file exists:

```bash
grep -rhoE "/audit-[a-z-]+" .claude/rules/ | sort -u | while read skill; do
  name="${skill#/}"
  [ -f ".claude/skills/$name/SKILL.md" ] || echo "[LR8] rule cites $skill — skill file missing"
done
```

**Fix:** either create the skill, or remove the stale reference.

## LR9 — Referenced V-entries must exist

Rules cite V7, V10, etc. → check the V-entry exists in the V-log:

```bash
refs=$(grep -rhoE "V[0-9]+" .claude/rules/ | sort -u)
for v in $refs; do
  grep -q "^### $v " .claude/rules/00-session-start.md \
    || echo "[LR9] $v referenced but not defined in V-log"
done
```

**Fix:** add the V-entry to `00-session-start.md` "PAST VIOLATIONS"
section, or fix the citation.

## LR10 — Rule conflict heuristic (manual review flag)

Rules that say "always X" somewhere and "never X" elsewhere = conflict.
Hard to fully automate; flag suspicious pairs:

```bash
# Same noun with opposite quantifiers
for term in deploy commit push test build migrate; do
  count_always=$(grep -rcE "always.* $term|must.* $term" .claude/rules/ | grep -v ':0$' | wc -l)
  count_never=$(grep -rcE "never.* $term|don't.* $term" .claude/rules/ | grep -v ':0$' | wc -l)
  if [ "$count_always" -gt 0 ] && [ "$count_never" -gt 0 ]; then
    echo "[LR10] $term — $count_always 'always' rules + $count_never 'never' rules. Manual review."
  fi
done
```

**Fix:** when rules conflict, add a priority section to the rule file
resolving which wins when (per `docs/methodology.md` anti-pattern 3).

---

## Report format

```
### /audit-rules — Run 2026-MM-DD

🔴 Critical (LR1, LR5, LR8, LR9) — N findings
[LR5] Duplicate rule identifier "E" in 01-iron-clad.md and 03-stack.md

🟠 Quality (LR2, LR3, LR4, LR6, LR7) — N findings
[LR4] Rule C.3 — no V-entry citation and no PRE-SHIP marker

🟡 Manual review (LR10) — N findings
[LR10] 'deploy' — 3 always rules + 2 never rules — review

🟢 Clean — {invariants passed}

Summary: N findings, X critical. Block rule addition until resolved.
```

## How to grow this skill

When a new class of rule-quality issue ships, add LR11, LR12, ... Every
time a rule degrades silently (no one noticed), add a grep for the
degradation pattern.

**Anti-pattern to catch:** rules growing faster than audit-rules
invariants = quality debt accumulating.

## Integration

Register in `/audit-all` Tier 0 (methodology health, runs before any
code audit). If `/audit-rules` fails critical, it's a sign the rule
system itself needs repair before you audit anything else.
