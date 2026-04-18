---
name: audit-cascade-logic
description: "Audit cancel/delete cascades, concurrency safety, and OPD-specific business rules in the LoverClinic backend. Grep-checks 15 invariants across sale/treatment/deposit/stock wiring. Use when tracing a 'why is this orphaned' bug, before releases, or after saga refactors. Read-only (no Edit/Write/Bash)."
user-invocable: true
argument-hint: "[--quick | --full]"
allowed-tools: "Read, Grep, Glob"
---

# Audit Cascade Logic — LoverClinic backend

**Purpose**: Detect places where cancel/delete doesn't fully propagate, saga rollback is partial, concurrent mutations corrupt state, or OPD-specific rules (medication double-deduct, course-by-name-lookup) silently break. READ-ONLY.

## Scope
15 invariants across 4 categories:
- **Cancel/delete cascades** (C1–C3): Sale/Treatment reversal completeness
- **OPD domain rules** (C4–C8): Course lookup by name+product, medication hasSale split, purchasedItems/courseItems routing
- **Concurrency + transactions** (C9–C11, C14): Firestore tx scope, atomic counters
- **Idempotency + silent failures** (C12, C13, C15): Reverse* idempotent, no empty catch, soft-delete consistency

## How to run
1. Read [checklist.md](checklist.md) — C1–C15
2. Run greps from [patterns.md](patterns.md)
3. Read implicated code
4. Emit report using [report-template.md](report-template.md)

## Arguments
- `--quick` — C1, C3, C6, C10, C12, C13 (6 highest-risk)
- `--full` — all 15 (default)

## Domain rationale

**Why cascade completeness matters**: A sale is a "compound mutation": when it lands, it changes stock + deposits + wallet + points + courses (5 subsystems). When it's cancelled, all 5 must reverse. Miss one, and you have value ghosts — customer has points for a sale that no longer exists, or a deposit that's still "applied" to a cancelled sale.

**Why C3 (treatment-delete-doesn't-reverse-stock) is CRITICAL**: current code at `src/lib/backendClient.js:106–111` is `deleteBackendTreatment = (id) => deleteDoc(treatmentDoc(id))`. If the treatment had deducted medications/consumables (via deductStockForTreatment), those batches lose inventory forever. The movement log still records the original deduct. The batch qty remains deducted. Silent stock evaporation.

**Why C6 (hasSale split) is subtle**: Medications can be deducted from two places — via the linked auto-sale (when hasSale=true) or directly from the treatment (when hasSale=false). The split logic in TreatmentFormPage.jsx lives client-side. If the user cancels the linked sale but keeps the treatment, hasSale technically flips to false. Next edit may try to re-deduct medications that were already deducted (via the now-cancelled sale, reversed) — actually correct! But if auto-reversal didn't happen cleanly, treatment tries to deduct against depleted stock and fails. Test this path.

**Why C10 (Firestore 500-op limit) matters for stock**: a sale with 50 items × 3 batch allocations each = 150 writes. Our per-batch runTransaction pattern keeps each tx ≤ 3 ops, so the overall operation spans ~50 tx's. But if someone later refactors to a single big runTransaction, the 500-op limit will bite at ~150 items.
