---
name: audit-stock-flow
description: "Audit stock conservation across batches, movements, transfers, and withdrawals in the LoverClinic backend. Grep-checks 28 invariants and reports violations as a punch list. Use after stock-related changes, before releases, or when reconciling physical stock against Firestore. Read-only (no Edit/Write/Bash)."
user-invocable: true
argument-hint: "[--quick | --full]"
allowed-tools: "Read, Grep, Glob"
---

# Audit Stock Flow — LoverClinic backend

**Purpose**: Detect places where stock quantities can vanish, appear free, or drift from the movement log ledger. FIFO/FEFO correctness, batch integrity, audit-trail completeness. READ-ONLY.

## Scope
**28 invariants across 8 subsystems** (V34 added S16–S20 on 2026-04-28; Phase 15.5 added S21–S25 on 2026-04-28; Phase 15.6 / V35 added S26–S28 on 2026-04-28):
- **Batch integrity**: qty caps, append-only log, status transitions
- **FIFO/FEFO allocation**: sort ordering monotonic, exactBatchId override, skip-expired/depleted
- **Movement log**: reversedByMovementId chain intact, user+sourceDocPath always set
- **Transfer/Withdrawal**: new-batch-at-destination invariant, inherits cost/expiry
- **Order lifecycle**: cancel-blocked-if-consumed, qty-edit-blocked
- **V34 conservation + UI** (S16-S20): per-tier sum-check, replay/time-travel, concurrent tx safety, component listener alignment, test-prefix discipline
- **Phase 15.5 patterns** (S21-S25): per-product warning thresholds, anti-hardcoded-threshold, ActorPicker branchIds[] filter (5 panels), withdrawal approval admin endpoint, unit dropdown enrichment
- **Phase 15.6 / V35 patterns** (S26-S28): default-branch view passes includeLegacyMain to listStockBatches, every batch creator validates productId via _assertProductExists before setDoc (FK), ProductSelectField extracted + sourced everywhere (Rule C1 lock)

## How to run
1. Read [checklist.md](checklist.md) — full invariant catalog S1–S15
2. Run greps from [patterns.md](patterns.md) — file:line anchors
3. For each invariant, check PASS/WARN/VIOLATION
4. Emit report using [report-template.md](report-template.md)

## Workflow

For each invariant S1..S15:
1. Read "Where to check" file:line from checklist
2. Run grep pattern(s) from patterns.md
3. Read surrounding code
4. Decide severity:
   - **PASS**: invariant holds across all paths
   - **WARN**: holds in happy path, fragile to edge cases or concurrency
   - **VIOLATION**: code demonstrably breaks invariant → stock can vanish or dupe
5. Emit entry with file:line / expected / actual / impact / fix-hint

## Arguments
- `--quick` — S1, S2, S4, S5, S6, S12, S13 (7 highest-risk)
- `--full` — all 15 (default)

## Output
Single markdown report to chat. Do NOT write to disk.

## Domain rationale

**Why stock conservation matters**: Every pharmacy/clinic in Thailand is audited by MOPH. They can pull any time window and ask: "Show me every movement for batch X." If our log has gaps (movement deleted, user field null, source doc path missing), the clinic gets flagged. Fines range from 20k-500k baht.

**Why reversedByMovementId chain matters**: When admin A and admin B concurrently cancel the same sale, both will call `reverseStockForSale`. Both will read the same set of un-reversed movements, both will create reverse entries, and both will attempt to set `reversedByMovementId` on the original — the second write wins, so the chain points to the wrong reverse. Auditor sees a forward movement pointing to a reverse movement pointing to... a different forward movement. Chain is broken. See S5.

**Why new-batch-at-destination matters**: If transfer moved an existing batch by changing its `branchId`, the batch's history (movements referencing old branchId) is orphaned — auditor can't reconstruct "stock was at branch X on date Y". By creating a NEW batch at the destination with `sourceBatchId` back-ref, both branches retain their own batch history and the transfer creates a queryable link. See S10, S11.

**Why qty caps matter**: `remaining ≤ total` is the single most important invariant. Violate it and you have phantom stock (can sell what you don't have) or oversold stock (customer paid for what you can't deliver). See S1, S2.
