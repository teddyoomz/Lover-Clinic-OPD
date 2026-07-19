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
16 invariants across 5 categories (V74 adds C16 customer-wipe subcoll discipline):
- **Cancel/delete cascades** (C1–C3): Sale/Treatment reversal completeness
- **OPD domain rules** (C4–C8): Course lookup by name+product, medication hasSale split, purchasedItems/courseItems routing
- **Concurrency + transactions** (C9–C11, C14): Firestore tx scope, atomic counters
- **Idempotency + silent failures** (C12, C13, C15): Reverse* idempotent, no empty catch, soft-delete consistency
- **Customer wipe completeness** (C16, V74): cascade covers 16 top-level collections + 8 subcollections + Storage objects + chat conversations + audit-immutable preservation; autoBackupRef integrity gate fires before any wipe write when provided

### C16 — Customer-wipe cascade completeness (V74, 2026-05-16)

**Trigger**: Any customer-wipe path MUST cover the full V74 surface:
- 16 top-level collections per `CUSTOMER_CASCADE_COLLECTIONS_FULL` (Phase 24.0's 11 + V74 CG's 5: be_quotations + be_vendor_sales + be_online_sales + be_sale_insurance_claims + be_recalls)
- 8 customer-attached subcollections per `T4_SUBCOLLECTIONS` (treatments / sales / appointments / deposits / wallets / memberships / points / courseChanges) — recursive delete (parent doc deletion does NOT cascade subcoll in Firestore)
- Storage objects under `be_customers/{customerId}/` prefix
- chat_conversations matching via `matchCustomerChatPredicate` (customerId OR lineUserId_byBranch values)
- PRESERVED: 6 AUDIT_IMMUTABLE_COLLECTIONS (be_admin_audit + be_stock_movements + 4 LINE/recall/postback logs) — NEVER wiped, NEVER restored (MOPH/HIPAA retention)

**Grep targets**:
  - `api/admin/delete-customer-cascade.js` + `scripts/customer-delete-with-backup.mjs` must reference `CUSTOMER_CASCADE_COLLECTIONS_FULL` + `T4_SUBCOLLECTIONS` from `src/lib/customerBackupCore.js`
  - Storage deletion loop must iterate `bucket.getFiles({ prefix: 'be_customers/{cid}/' })`
  - Chat deletion must filter via `matchCustomerChatPredicate`
  - Pre-V74 pattern `CUSTOMER_CASCADE_COLLECTIONS = Object.freeze([` with inline 11-entry list MUST NOT appear in delete-customer-cascade.js anymore (V74 aliases to the canonical helper)

**Source-grep regression**: `tests/v74-customer-backup-adversarial.test.js` T5 + T7 + `tests/phase-24-0-customer-delete-server.test.js` S4.2 + S5.1 + `tests/phase-24-0-customer-delete-flow-simulate.test.js` F2.2.

**Origin**: V74 (2026-05-16) — Phase 24.0 cascade (2026-05-06) shipped with 5 missing collections (be_quotations + be_vendor_sales + be_online_sales + be_sale_insurance_claims + be_recalls were added AFTER Phase 24.0) + NO subcollection iteration + NO Storage cleanup + NO chat cleanup. Cumulative effect: customer delete left orphan docs in 5 top-level + 8 subcoll + Storage + chat. V74 closes the gap with `CUSTOMER_CASCADE_COLLECTIONS_FULL` (16) + recursive subcoll iter + Storage object cleanup + chat predicate match. AV54 enforces.

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

**Why C3 was RESCOPED (audit-all 2026-07-19)**: treatment delete reversing physical stock is NOT wanted — explicit user directive (see `src/pages/BackendDashboard.jsx:~556`): "สินค้าที่เป็นชิ้นๆ จะไม่คืนกลับสต็อค จะต้องไปยกเลิกที่หน้าการขายเท่านั้น". The delete path reverses COURSE deductions; physical stock returns belong exclusively to the SALE cancel cascade (`reverseStockForSale`). C3 now audits that this split holds (a treatment-delete that reversed stock would double-return when the sale is also cancelled).

**Why C6 (hasSale split) is subtle**: Medications can be deducted from two places — via the linked auto-sale (when hasSale=true) or directly from the treatment (when hasSale=false). The split logic in TreatmentFormPage.jsx lives client-side. If the user cancels the linked sale but keeps the treatment, hasSale technically flips to false. Next edit may try to re-deduct medications that were already deducted (via the now-cancelled sale, reversed) — actually correct! But if auto-reversal didn't happen cleanly, treatment tries to deduct against depleted stock and fails. Test this path.

**Why C10 (Firestore 500-op limit) matters for stock**: a sale with 50 items × 3 batch allocations each = 150 writes. Our per-batch runTransaction pattern keeps each tx ≤ 3 ops, so the overall operation spans ~50 tx's. But if someone later refactors to a single big runTransaction, the 500-op limit will bite at ~150 items.
