---
name: audit-firestore-correctness
description: "Audit Firestore-specific correctness: security rules immutability, REST API updateMask pattern, serverTimestamp usage, snapshot-fires-2x handling, atomic counters, document size limits. Use after rules or REST-API changes."
user-invocable: true
allowed-tools: "Read, Grep, Glob"
---

# Audit Firestore Correctness

Firestore has its own sharp edges. This skill covers the 10 highest-impact patterns that, when violated, silently corrupt data or burn through quota.

## Invariants (F1–F10)

### F1 — REST PATCH always includes `updateMask.fieldPaths`
**Why**: CLAUDE.md rule 7 — without mask, PATCH **wipes all other fields**. Silent data loss.
**Where**: `api/proclinic/*.js`, `api/webhook/*.js`
**Grep**: `firestorePatch|PATCH.*documents` in api/
**Check**: Every PATCH builds `updateMask.fieldPaths=X&updateMask.fieldPaths=Y` query string.

### F2 — Immutable collections have `allow update, delete: if false`
**Collections**: `be_stock_movements`, `be_wallet_transactions`, `be_point_transactions`
**Where**: `firestore.rules`
**Read**: the rules file; confirm each immutable collection blocks mutation after create.

### F3 — Soft-delete-only collections have `allow delete: if false`
**Collections**: `be_stock_orders`, `be_stock_batches`, `be_central_stock_warehouses`
**Where**: `firestore.rules`

### F4 — All `be_*` collections require authenticated clinic staff
**Where**: `firestore.rules` — should have `request.auth != null` + staff check

### F5 — snapshot-fires-2x handled via deep-compare (not timestamp)
**Why**: CLAUDE.md rule 1 — writes with `serverTimestamp()` cause 2 snapshot callbacks (local estimate + server confirm). Comparing timestamps triggers redundant work.
**Grep**: `onSnapshot` in src/; for each, confirm data comparison uses JSON.stringify or field-by-field diff, not timestamp equality.

### F6 — `serverTimestamp()` for `createdAt`/`updatedAt`, not `new Date().toISOString()`
**Why**: clock skew if client is wrong; tests depend on `new Date()` deterministic outputs — consistency matters.
**Current state**: we use `new Date().toISOString()` (per test-friendly pattern) — accepted deviation. Document this choice.

### F7 — Atomic counters use `runTransaction`
**Example**: invoice numbers (INV), sale counters.
**Grep**: `runTransaction.*counter` or `counterDoc`
**Check**: Every monotonic ID goes through atomic CAS, not `Date.now()` alone.

### F8 — Long-lived listeners unsubscribed on unmount
**Why**: leak accumulates over a workday → memory bloat + stale state.
**Grep**: `onSnapshot` returns `unsubscribe` stored or returned from useEffect; confirm cleanup.

### F9 — Document size < 1 MB
**Risk**: sale doc with 50+ items + course history could approach limit.
**Check**: estimate size of largest `be_sales` + `be_treatments` docs; flag if any field is unbounded (e.g., `usageHistory[]`, `courses[]` on customer doc).

### F10 — Composite indexes match queries
**Where**: `firestore.indexes.json` + `backendClient.js` queries
**Check**: every `query(col, where(A), where(B), orderBy(C))` has a matching composite index.

## How to run
1. Read `firestore.rules` in full.
2. Grep each pattern above.
3. For F9, Read the largest sale doc structure (Phase 7 finished, so sale can have items + billing + payment + 5 sellers + depositIds).
4. For F10, Read `firestore.indexes.json`.

## Report format standard.

## Regression sensitivity
F1 is highest — a single missing updateMask can wipe days of data.
