---
name: audit-clone-sync
description: "Audit Phase 1-2 clone orchestrator + master data sync for race conditions, orphan partial clones, idempotency, and duplicate detection. Use after clone/sync code changes or before bulk-clone runs."
user-invocable: true
allowed-tools: "Read, Grep, Glob"
---

# Audit Clone + Master Sync

Clone orchestrator coordinates 5-step clone across ~7 Firestore collections. Master sync pulls products/doctors/staff/courses from ProClinic. Both are Phase 1-2 code — oldest in the codebase, never systematically audited.

## Invariants (CL1–CL9)

### CL1 — Duplicate detection before clone
**Check**: `cloneCustomer` queries `be_customers/{id}` existence BEFORE write.
**Where**: `src/lib/cloneOrchestrator.js` + `CloneTab.jsx`
**Current state**: `customerExists(c.id)` check exists but only by ProClinic ID — misses HN/phone/national-ID dup (scan finding #10).

### CL2 — Idempotent clone
**Check**: re-clone same HN updates existing doc, not create dup. Transaction or query-then-write pattern.

### CL3 — Bulk clone concurrency bounded
**Check**: parallel clone operations chunked (Firestore 500-write batch limit; multiple in-flight writes to same doc race).
**Grep**: `Promise.all` on clone operations in cloneOrchestrator.

### CL4 — Master sync dedupe by ProClinic `id`, not name
**Why**: two products with same name, different IDs, must coexist.

### CL5 — ProClinic deletions → mark `isActive=false`, not hard-delete
**Why**: preserves FK for historical sales (R5).
**Where**: master data sync paths.

### CL6 — Course name+product key uniqueness post-sync
**Why**: CLAUDE.md bug #2 — course dedup by name+product.

### CL7 — Orphan detection post-sync
**Check**: after sync, query sales/treatments for `productId` refs that no longer exist in master.

### CL8 — Clone crash mid-step → no partial state
**Known gap**: Step 2 (appointments) uses fire-and-forget loop with silent catch — if crash mid-loop, appointments 1-N remain orphaned (scan finding #2).
**Fix hint**: track created appointment IDs, rollback on crash, or mark customer with `cloneStatus: partial_error` + cleanup cron.

### CL9 — CloneTab surfaces errors to user (no silent swallow)
**Grep**: `catch\\(e\\)\\s*\\{\\s*\\}` in CloneTab.jsx — should be zero.

## How to run
1. Read cloneOrchestrator.js end-to-end (it's ~700 LOC).
2. For each step in the 5-step clone, identify failure-mode behavior.
3. Read CloneTab.jsx for user-facing error handling.
4. Read MasterDataTab.jsx for sync + cascade checks.

## Report format standard.
