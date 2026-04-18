---
name: audit-money-flow
description: "Audit money conservation across deposits, wallet, points, and billing math in the LoverClinic backend. Grep-checks 15 invariants and reports violations as a punch list. Use after any mutation-touching change, before releases, or when tracing a money-discrepancy complaint. Read-only (no Edit/Write/Bash)."
user-invocable: true
argument-hint: "[--quick | --full]"
allowed-tools: "Read, Grep, Glob"
---

# Audit Money Flow — LoverClinic backend

**Purpose**: Detect places where money can vanish, appear free, or drift due to arithmetic bugs. This skill is READ-ONLY — it diagnoses, it does not fix. Fixes happen in a separate deliberate session.

## Scope
15 invariants across 5 subsystems:
- **Deposits**: uniqueness of usage entries, balance conservation, recalc consistency
- **Wallet**: atomicity of balance-update + tx-log, lifetime-stat integrity, refund handling
- **Points**: customer-doc↔tx-log reconciliation, earn formula correctness, silent-catch detection
- **Billing**: discount/tax order, payment-channel sum reconciliation, rounding convention, float drift
- **Cancel cascade**: sale cancel reverses ALL money flows (no partial)

## How to run
1. Read the invariant catalog: [checklist.md](checklist.md) — full list of M1–M15 with WHY + HOW
2. Run the greps: [patterns.md](patterns.md) — specific Grep regex with file:line anchors
3. For each invariant, check the code + output PASS/WARN/VIOLATION
4. Produce a report using the format in [report-template.md](report-template.md)

## Workflow (step-by-step)

For each invariant M1..M15, follow this loop:
1. Read the "Where to check" file:line from checklist.md
2. Run the grep pattern(s) from patterns.md for that invariant
3. Read enough surrounding code to understand the actual behavior
4. Compare actual vs expected — decide PASS / WARN / VIOLATION:
   - **PASS**: actual matches expected, no risk
   - **WARN**: edge case risk, test gap, silent catch, or missing guard that could fail under rare conditions
   - **VIOLATION**: clear bug where money can be lost/created/drift; expected invariant NOT held
5. For each non-PASS: emit an entry into the final report with expected/actual/impact/fix-hint

## Arguments
- `--quick` — only M1, M2, M4, M5, M8, M11, M15 (the 7 highest-risk)
- `--full` — all 15 invariants (default)

## Output
Single markdown report printed to chat (do NOT write to disk). Format per report-template.md. Severity-sorted: VIOLATION first, then WARN, then PASS (abbreviated).

## Integration with other audit skills
This skill focuses on MONEY. Companion skills:
- `/audit-stock-flow` — stock conservation (batches, FIFO, movement log)
- `/audit-cascade-logic` — cancel/delete cascades, concurrency, OPD rules
- `/audit-all` — runs all three + aggregates

## Domain rationale (why these invariants matter)

**Why money conservation is non-negotiable**: A clinic running a 10M-baht business that loses 0.1% per month to silent bugs bleeds 120k baht/year. Bugs in this class are the ones that don't trigger tests, don't raise exceptions, don't log errors — they just quietly shift the balance.

**Why silent-catch detection matters**: `catch(e) { console.error(...) }` on a customer-doc update is how audit logs and summary fields desync. The tx log says customer earned 50 points; the customer.finance.loyaltyPoints says 0. Which is right? Accountants can't tell without reconstructing from logs.

**Why discount rounding matters**: `12345 × 7.5%` = 925.875. If stored as-is, next recalc may drift. Round to 2 decimals (THB convention) and lock it. See M10.

**Why payment-channel reconciliation matters**: If `channels.sum()` is stored as 2500 but `billing.netTotal` is 2400, which one is trusted? Reports will disagree with receipts. See M4.

**Why cascade completeness matters**: Sale cancel must reverse EVERY mutation that the sale caused. If deposits get refunded but loyalty points don't, the customer now has points from a sale that never existed. See M15.
