---
name: audit-all
description: "Run all 3 LoverClinic backend audits (money-flow, stock-flow, cascade-logic) sequentially and produce a consolidated violation report. Use before releases, during regression hunts, or after saga/cascade refactors. Read-only (no Edit/Write/Bash)."
user-invocable: true
argument-hint: "[--quick | --full]"
allowed-tools: "Read, Grep, Glob, Skill"
---

# Audit All — LoverClinic backend

Runs the 3 audit skills in order and aggregates output.

## Execution flow

1. Invoke `/audit-money-flow` with the same argument passed to this skill (`--quick` or `--full`).
2. Invoke `/audit-stock-flow` with the same argument.
3. Invoke `/audit-cascade-logic` with the same argument.
4. Aggregate all 45 invariant results into one consolidated report (see format below).

Do NOT write to disk — chat output only.

## Consolidated report format

```
# Audit All Report — <YYYY-MM-DD HH:MM>

## Overall Summary
- Total invariants checked: 45 (M1–M15 + S1–S15 + C1–C15)
- ✅ PASS: {X}
- ⚠️  WARN: {Y}
- ❌ VIOLATION: {Z}

## Violations by severity (CRITICAL first)

### CRITICAL — money can be created/lost, or audit trail broken
- {list VIOLATION entries from all 3 reports}

### HIGH — stock/cascade integrity broken
- {list}

### MEDIUM — audit gaps or concurrency fragility
- {list}

## Warnings (WARN entries merged)

- {list}

## Passing (abbreviated counts per skill)
- audit-money-flow: X/15 pass
- audit-stock-flow: Y/15 pass
- audit-cascade-logic: Z/15 pass

## Top-5 recommended fixes (ranked by blast radius)
1. [C3] Treatment delete doesn't reverse stock — bleeds inventory silently
2. [S5] Concurrent reverse breaks reversedByMovementId chain — audit trail broken
3. [C5] Sale cancel doesn't update treatments' hasSale — double-deduct risk
4. [M15] Sale cancel doesn't reverse loyalty points (if true) — points inflation
5. [M5] Wallet tx+balance not atomic — orphan risk on crash

## Meta
- Report generated at {timestamp}
- Skills invoked: audit-money-flow, audit-stock-flow, audit-cascade-logic
- Scope: {--quick | --full}
- Files read across all 3 audits: {list}
```

## Severity mapping (CRITICAL / HIGH / MEDIUM)

- **CRITICAL**: money creation/loss, broken audit chain, orphaned stock deduction (MOPH audit failure class)
- **HIGH**: cascade incompleteness, concurrency corruption possible under normal usage
- **MEDIUM**: silent failures, audit-field gaps, edge-case fragility

Sort violations into these buckets. Within each bucket, sort by probability of triggering (routine > rare).

## Do NOT
- Write the report to disk — chat only
- Auto-fix anything — that's a separate session per violation category
- Skip any of the 3 underlying skills — always run all 3 for a complete picture
