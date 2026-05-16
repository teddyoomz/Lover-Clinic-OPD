---
name: audit-harness
description: 7-dimension quantitative scoring of the Claude harness config itself — tool coverage / context efficiency / quality gates / memory persistence / eval coverage / security guardrails / cost efficiency. Complements `/audit-health` (which measures methodology adoption) by measuring the harness ARTIFACTS — CLAUDE.md, rules, skills, hooks, memory, audit invariants. Use monthly OR before major rule consolidation. Adapted from affaan-m/everything-claude-code harness-audit (MIT, 2026-05-18); 7-dim framework retained, metrics rebuilt against LoverClinic surface (24+ audit skills + V-log 73+ entries + iron-clad rules A-R + AV1-51 + BS-1..15).
---

# /audit-harness — Claude harness configuration quality

Quantitative complement to `/audit-health`. Where `/audit-health` measures
**methodology adoption** (V-entry count, audit skill count, velocity), this skill
measures **harness ARTIFACT quality** (config size, gate enforcement, eval depth,
security posture).

Run periodically (monthly or before major rule consolidation). Reports a single
score 0-70 with 7 dimensions × 10 each. NOT registered in `/audit-all` Tier 1-4
(this is a meta-audit, not a pre-release gate). Optional Tier 5 invocation.

## Origin

Adapted 2026-05-18 from `affaan-m/everything-claude-code` (MIT) `commands/harness-audit.md`.
Their version is a Node.js script that scores generic config. Our version is a
manual checklist + grep recipes tailored to OUR surface. The 7-dimension framework
is the value we adopt; the metrics + grep recipes are LoverClinic-specific.

## The 7 dimensions

Each scored 0-10. Tally for /70 overall.

### D1. Tool Coverage (0-10)

Do we have skills/agents for the work we do?

| Score | Criteria |
|---|---|
| 10 | Every recurring task type has a dedicated skill + audit |
| 7-9 | ≥1 gap; new feature areas not yet audited |
| 4-6 | Multiple gaps; ad-hoc patterns leak through |
| 0-3 | Major gaps — relying on freelance code generation |

LoverClinic measurement:
- Count `.agents/skills/` + `~/.claude/skills/` invocable skills → ≥30 = full marks
- Per Phase 1-30, every shipped feature should have an audit skill ≥7
- New collections / new endpoints without an AV invariant = drift

Grep:
```bash
ls .agents/skills/ | wc -l                  # local skills
grep -c "^- " MEMORY.md                      # memory index size
grep -c "AV[0-9]\+" .agents/skills/audit-anti-vibe-code/SKILL.md  # AV invariants
```

### D2. Context Efficiency (0-10)

How much context burn per task?

| Score | Criteria |
|---|---|
| 10 | CLAUDE.md ≤ 200 lines; rules split by area; skills load lazily |
| 7-9 | One file >300 lines but well-justified |
| 4-6 | Multiple monolithic files; vague skill descriptions force whole-load |
| 0-3 | CLAUDE.md > 1000 lines; everything inline |

LoverClinic measurement:
```bash
wc -l CLAUDE.md                              # target ≤ 200
wc -l .claude/rules/*.md                      # per-area splits OK ≤ 500 each
wc -l SESSION_HANDOFF.md                      # target ≤ 1000 (current ~300KB OK for cross-session)
wc -l .claude/rules/v-log-archive.md          # archive grows; not auto-loaded — OK
```

Watch for:
- CLAUDE.md auto-load size exceeding 100KB → context burn per session
- Skill descriptions >300 chars in YAML frontmatter (Claude reads ALL descriptions on every session boot)

### D3. Quality Gates (0-10)

Pre-commit / pre-deploy gate enforcement.

| Score | Criteria |
|---|---|
| 10 | All gates automated (CI/hooks); rule violations fail build |
| 7-9 | Manual but disciplined; checklists in workflow docs |
| 4-6 | Inconsistent — some gates skipped under time pressure |
| 0-3 | Vibe-coded — no gates |

LoverClinic gates inventory:
- Rule B Probe-Deploy-Probe (firestore:rules) — manual but mandatory
- `npm test -- --run` (10000+ tests)
- `npm run build` (catches Edit silent-fail)
- /audit-all before release
- Rule Q L1/L2 verification before "verified" claim
- V18 explicit "deploy" verb lock

Grep:
```bash
grep -l "Probe-Deploy-Probe\|npm run build\|npm test" .claude/rules/*.md
ls scripts/probe-deploy-probe.mjs            # core gate exists
grep -c "iron-clad" .claude/rules/00-session-start.md  # rule density
```

### D4. Memory Persistence (0-10)

Cross-session context retention.

| Score | Criteria |
|---|---|
| 10 | SESSION_HANDOFF.md updated every session; checkpoint per milestone; user-memory index |
| 7-9 | Most sessions update but occasional gaps |
| 4-6 | Stale handoff text (e.g. "next session" notes that never closed) |
| 0-3 | No cross-session state captured |

LoverClinic measurement:
- `SESSION_HANDOFF.md` Current State block last-updated date
- `.agents/active.md` updated_at frontmatter freshness
- `.agents/sessions/` checkpoint count + most-recent date
- `~/.claude/projects/F--LoverClinic-app/memory/MEMORY.md` index size
- Watch for "NOT FIXED yet — next session" text that's stale (V73 L1 caught one)

Grep:
```bash
grep -n "next session\|TODO next session\|NOT FIXED yet" SESSION_HANDOFF.md
# Each match should be either FRESH (this week) or RESOLVED-annotation per V66 BRANCH pattern
```

### D5. Eval Coverage (0-10)

Test invariants + regression locks per audit area.

| Score | Criteria |
|---|---|
| 10 | Every audit has numbered invariants + grep recipes + sanctioned-exception list |
| 7-9 | Most audits have invariants; a few are documentation-only |
| 4-6 | Audits exist as prose without testable invariants |
| 0-3 | No audit invariants |

LoverClinic measurement:
```bash
grep -c "AV[0-9]" .agents/skills/audit-anti-vibe-code/SKILL.md      # target ≥50
grep -c "BS-[0-9]" .agents/skills/audit-branch-scope/SKILL.md      # target ≥15
grep -c "S[0-9]\+ " .agents/skills/audit-stock-flow/SKILL.md       # target ≥20
ls tests/v[0-9]*-*.test.* | wc -l                                   # V-bank tests
```

V66 lesson: source-grep tests can lock BROKEN behavior. Score 10 requires not just
quantity but also Rule Q L1/L2 verification gating, not just grep regression.

### D6. Security Guardrails (0-10)

Real-adversarial verification + secret hygiene + rules audit.

| Score | Criteria |
|---|---|
| 10 | Rule Q L1/L2 mandatory; Probe-Deploy-Probe enforced; no secrets in src/; firestore rules audited per change |
| 7-9 | Rule Q discipline practiced; one or two manual gates |
| 4-6 | Audits exist but not enforced before "verified" claims |
| 0-3 | Mock tests claimed as verification (V66 antipattern) |

LoverClinic measurement:
- Rule Q (00-session-start.md + 01-iron-clad.md top) loaded every turn
- `/audit-firebase-admin-security` exists + run on /api/admin/** changes
- `/audit-firestore-correctness` covers REST API patterns
- crypto.getRandomValues for tokens (not Math.random — Rule C2)
- `.env.local.prod` in .gitignore (V41-anchored)
- Probe-Deploy-Probe with 10 endpoints (V73 added #9 + #10)

Grep:
```bash
grep -l "Math\.random.*token\|Math\.random.*id" src/ api/  # should be empty
grep "\.env\.local" .gitignore                              # gitignored
grep -c "Probe-Deploy-Probe" .claude/rules/*.md            # rule presence
```

### D7. Cost Efficiency (0-10)

Token/dollar/time per task.

| Score | Criteria |
|---|---|
| 10 | Per-area skills load lazily; rule files modular; no repeated re-derivation per turn |
| 7-9 | Most paths efficient; occasional re-reads |
| 4-6 | Frequent re-deriving from scratch; large prompt re-loads |
| 0-3 | Vibe-coded — no caching strategy |

LoverClinic measurement:
- Per-skill description size (YAML frontmatter `description:` field) ≤ 300 chars
- Subagent dispatching for parallel research (Explore agent, dispatching-parallel-agents)
- RTK token-killer wrapper in user's environment
- /audit-class-of-bug-discipline catches Rule P repeat-work patterns

Grep:
```bash
awk '/^description:/ {print length($0), FILENAME}' .agents/skills/*/SKILL.md | sort -n -r | head -5
# Top 5 longest skill descriptions — keep ≤ 300 chars
```

## How to score

1. For each dimension D1-D7:
   - Apply criteria + measurement
   - Assign 0-10 integer score
2. Sum → /70 overall
3. Identify lowest-scored dimension(s) → top recommended action

## Output template

```
=== Harness Audit (YYYY-MM-DD) ===
D1 Tool Coverage:        N/10  — <one-line evidence>
D2 Context Efficiency:   N/10  — ...
D3 Quality Gates:        N/10  — ...
D4 Memory Persistence:   N/10  — ...
D5 Eval Coverage:        N/10  — ...
D6 Security Guardrails:  N/10  — ...
D7 Cost Efficiency:      N/10  — ...
                       ──────
                Total:   N/70

Top 3 recommended actions:
1. <highest-impact gap>
2. <second>
3. <third>
```

## Frequency

- Monthly (or quarterly) routine
- Before major rule consolidation (e.g. compressing CLAUDE.md / rule splits)
- After 5+ V-entries accumulate (drift signal)
- When user-curse incidents happen (V66 trust-collapse class signal)

## What this skill is NOT

- Not a pre-release gate (use `/audit-all` for that)
- Not a code audit (use `/audit-anti-vibe-code` etc)
- Not a methodology adoption check (use `/audit-health` for that)
- Not automated — manual scoring with grep recipes (the manual step is the value;
  numbers chosen by Claude are anchored by recent observation, not by guess)

## Related skills

- `/audit-health` — methodology adoption velocity (V-entries/month, skills/month)
- `/audit-rules` — lint rule files for well-formedness
- `/audit-all` — pre-release gate aggregator
- `/audit-class-of-bug-discipline` — Rule P 7-step expansion verification

## Source

- Adapted 2026-05-18 from `affaan-m/everything-claude-code` (MIT)
  `commands/harness-audit.md` — 7-dimension framework retained, metrics rebuilt
  against LoverClinic surface
- Original is a Node.js script; ours is a manual skill (more flexible, less infra)
