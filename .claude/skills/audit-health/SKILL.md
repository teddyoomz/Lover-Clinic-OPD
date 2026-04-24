---
name: audit-health
description: Quantitative health-check of methodology adoption. Reports V-entry count, audit skill count, invariant count, test count delta, rule freshness, and velocity (V-entries and skills per month). Without measurement, methodology adoption is faith. With measurement, users see the compounding return.
---

# /audit-health

**The dashboard.** Methodology is only as real as its metrics. This
skill counts and trends the 10 key signals of adoption.

**Run frequency**: weekly for active projects, monthly for stable ones.
Store output in `.claude/audit-results/health-YYYY-MM-DD.md` for trend
tracking.

## H1 — V-entry count

Total V-entries in the V-log:

```bash
grep -cE "^### V[0-9]+ " .claude/rules/00-session-start.md
```

**Target (by project age):**
- Week 1: 0 (fresh) or ≥ 10 (starter pack installed)
- Month 3: ≥ 5 native + any starter
- Month 12: ≥ 15 native (real growth)
- Month 24: ≥ 25 native

**Low signal:** < 2 native V-entries in 6 months → team is skipping
Rule D. Ask: did you ship zero bugs this period, or did you not catalog?

## H2 — Audit skill count

Total user-invocable audit skills:

```bash
ls .claude/skills/audit-*/SKILL.md 2>/dev/null | wc -l
```

**Target:** starts at 2-3 (from install), grows to 8-15 over 12 months
as project adds domain-specific audits.

## H3 — Total audit invariant count

Sum of numbered invariants across all audit skills:

```bash
total=0
for s in .claude/skills/audit-*/SKILL.md; do
  n=$(grep -cE "^## [A-Z]{1,3}[0-9]+" "$s")
  total=$((total+n))
done
echo "Total invariants: $total"
```

**Target:** growing monotonically. Flat for > 3 months + bugs shipping
= Rule D broken.

## H4 — Test count delta

Growth of test count is a proxy for "did bugs become adversarial tests":

```bash
# Current count (adapt for your runner)
# Vitest: npm test -- --run 2>&1 | grep -oE '[0-9]+ passed' | head -1
# Jest: npx jest --listTests | wc -l
# pytest: pytest --collect-only -q | tail -1
echo "Run your test runner's count command and compare to last audit."
```

**Store in `.claude/audit-results/health-YYYY-MM-DD.md`** so next run
can compute delta. Growing = healthy. Flat for 3 months + feature work
happening = tests being skipped.

## H5 — Hook count

```bash
cat .claude/settings.json 2>/dev/null | jq '.hooks | to_entries | map(.value | length) | add // 0'
```

**Target:** ≥ 4 hooks configured (PostToolUse + PreToolUse +
SessionStart + UserPromptSubmit). 0 hooks = methodology is voluntary
and will drift.

## H6 — Session handoff count

Session checkpoints accumulated:

```bash
ls .agents/sessions/*.md 2>/dev/null | grep -v _template | wc -l
```

**Target:** ≥ 1 per month of active work. 0 for 2+ months = cross-
session continuity broken.

## H7 — Rule freshness (days since last edit)

```bash
for f in .claude/rules/*.md; do
  # Days since last git commit touched this file
  last=$(git log -1 --format=%at -- "$f" 2>/dev/null)
  if [ -n "$last" ]; then
    now=$(date +%s)
    days=$(( (now - last) / 86400 ))
    echo "$days days — $f"
  fi
done | sort -rn
```

**Target:** no rule file stale > 180 days on an active project. Stale
rules either (a) are so correct they never need editing — healthy, or
(b) got abandoned — unhealthy. Judge by project activity.

## H8 — V-entry velocity (last 6 months)

```bash
# Grep V-entries with dates in the last 6 months
six_months_ago=$(date -d "6 months ago" +%Y-%m-%d 2>/dev/null || date -v-6m +%Y-%m-%d)
grep -E "^### V[0-9]+ — " .claude/rules/00-session-start.md | \
  awk -v cutoff="$six_months_ago" '{
    # Extract date (YYYY-MM-DD) from line
    if (match($0, /[0-9]{4}-[0-9]{2}-[0-9]{2}/)) {
      d = substr($0, RSTART, RLENGTH)
      if (d >= cutoff) count++
    }
  } END {print (count+0) " V-entries in last 6 months"}'
```

**Target:** ≥ 1/month on active project with any bug-fix activity.

## H9 — Skill velocity (new skills added, last 6 months)

```bash
# Skills created in last 6 months (by first commit touching the file)
six_months_ago=$(date -d "6 months ago" +%Y-%m-%d 2>/dev/null || date -v-6m +%Y-%m-%d)
count=0
for s in .claude/skills/*/SKILL.md; do
  first=$(git log --follow --format=%ai --reverse -- "$s" 2>/dev/null | head -1)
  first_date="${first%% *}"
  [ -n "$first_date" ] && [ "$first_date" '>' "$six_months_ago" ] && count=$((count+1))
done
echo "$count new skills in last 6 months"
```

**Target:** ≥ 1 every 3 months. Skill growth = G.2 promotion firing.

## H10 — Adoption tier

Composite classification based on totals:

```
Starter  : H1<5   + H2<5   + H3<20  + H5=0
Standard : H1≥5   + H2≥5   + H3≥20  + H5≥2
Advanced : H1≥15  + H2≥10  + H3≥60  + H5≥4  + H6≥6
Expert   : H1≥25  + H2≥15  + H3≥100 + H5≥4  + H6≥12 + H8≥6
```

Tier up = the team is investing in methodology. Tier down = investment
stopped, consider reasons.

---

## Report format

```
### /audit-health — Run 2026-MM-DD — Project: {name}

📊 Counts
  V-entries         : 12  (prev: 10, delta: +2 in 2 weeks)
  Audit skills      : 8   (prev: 7, delta: +1)
  Audit invariants  : 67  (prev: 62, delta: +5)
  Tests             : 2905 (prev: 2865, delta: +40)
  Hooks configured  : 4
  Sessions archived : 18

⏱️ Freshness
  Oldest rule file  : 45 days (02-workflow.md)
  Newest rule file  : 3 days  (01-iron-clad.md)

📈 Velocity (6mo)
  V-entries  : 6 ≈ 1.0 /month  (target ≥ 1.0)  ✓
  New skills : 3 ≈ 0.5 /month  (target ≥ 0.33) ✓

🏆 Tier: Standard → approaching Advanced
  Need for Advanced: +3 V-entries, +2 audit skills, +40 invariants

🚨 Warnings
  (none)
```

---

## How to grow this skill

Add new health signals when you discover a new adoption indicator. For
example:
- Commit-message discipline: % of commits using conventional prefixes
- Triangle Rule artifact count: `docs/external-scan/` file count
- Audit-skill test coverage: % of audit skills with >= 1 test run recorded

## Integration

Write results to `.claude/audit-results/health-YYYY-MM-DD.md`. Include
in quarterly team review. Tier changes deserve a session checkpoint entry.
