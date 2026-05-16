---
updated_at: "2026-05-17 EOD+2 LATE+1 — V81-fix5 DEPLOYED + branch chip bug FIXED + stress loop v2 running"
status: "V81-fix3 + V81-fix4 + V81-fix5 LIVE on prod; cleanup ran; stress loop v2 (with User Simulation) running"
branch: "master"
last_commit: "fix(V81-fix5): CustomerCard resolves branchId → branch NAME via branchesMap"
tests: "216 V81-family tests green (172 prior + 4 AV67 + 30 AV68/69/70/FD + 10 AV71)"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "V81-fix5 LIVE — aliased to production"
firestore_rules_version: "v35 + 5 V78 composite indexes (unchanged this session)"
---

# Active Context

## Status
- **V81-fix3 + V81-fix4 + V81-fix5 LIVE on prod**
- **309 deprecated per-customer backups purged** (1.6 MB freed; audit doc emitted)
- **1 test branch fixture cleaned** (TEST-V81-TS-BR-* deleted; orphan customer re-stamped to NAKHON)
- **216 V81-family regression tests green**
- **Stress loop v2 running in background** (bash `bq0bt8fju`) with User Simulation — each cycle creates 3 non-NAKHON-branch test customers + backup + restore + verifies branchId preserved AND branchesMap.get(branchId)?.name resolves correctly

## V81-fix5 — branch chip bug ("ขึ้นสาขามั่ว")
- User report 2026-05-17 EOD+2 LATE: customer cards showed raw `BR-1777873556815-26df6480` ID instead of branch name
- Rule R diag confirmed: 388/391 customers (99.2%) are stamped NAKHON (preexisting V20 multi-branch migration state). Restore did NOT scramble branchIds — they were always NAKHON.
- **Real root cause**: `CustomerCard.jsx:120` read `customer.branchName || customer.branchId || ''` — customer doc has NO `branchName` field → fallback to raw branchId
- **Fix (AV71)**: CustomerListTab loads branches via `listBranches({allBranches:true})` in parallel with `getAllCustomers()`, builds `Map<branchId, {id, name}>`, passes `branchesMap` prop to every CustomerCard. Card resolves name via `map.get(bid)?.name` with fallback chain preserved.
- **Cleanup**: `scripts/v81-fix5-cleanup-test-branch.mjs --apply` deleted V81-fix1 leftover branch + re-stamped 1 orphan
- 10 AV71 source-grep tests + build clean

## All bugs/features this session (cumulative)

| # | Issue | Resolution | Status |
|---|---|---|---|
| A1 | Download "Unexpected token 'A'..." | V81-fix3 — archiver deps swap | **✅ LIVE** |
| A2 | "0 MB" display for all backups | V81-fix4 list endpoint folder-size sum + UI MB/KB | **✅ LIVE + L2 verified** (real prod shows 6.91–7.03 MB) |
| A3 | Restore error | V81-fix4 Auth-preserve removes slowest path + ack-gate failure | **✅ LIVE** (Cycle 1 = 107s restore) |
| B | Customer backup bulk-delete fails | Obviated by Feature D cleanup script | **✅ Ran** (309 purged) |
| C | Refactor customer backup to single file | V77 + V74 buttons removed; V81 whole-system is canonical | **✅ LIVE** |
| D | Mass delete existing per-customer backups | `scripts/v81-fix4-purge-customer-backups.mjs --apply` | **✅ 309/309** |
| F | Auth preservation (no login loss) | V81-fix4 `replaceAuthFromBackup: false` default | **✅ LIVE** (Cycle 1 = 353 auth preserved) |
| **(NEW)** | "branches มั่ว" display bug | V81-fix5 branchesMap injection | **✅ LIVE** |
| E | Stress test ≥10 cycles | Stress loop v2 with User Simulation running | **🔄 In progress** (background `bq0bt8fju`) |

## Architectural decisions locked
- V81 Whole-System Backup is THE canonical backup mechanism
- Replace mode preserves Auth by default; cross-project clone is opt-in
- AV19 auto-pre-backup MANDATORY before any wipe
- Backup folder size displayed = real on-disk bytes (sum across collections + storage + auth + manifest)
- Customer cards display branch NAME via parent-injected branchesMap (no denormalization on customer doc)
- Per-customer backup files preserved on disk archival-only; UI bindings removed

## Next actions
1. Wait for stress loop v2 completion notification (10 cycles × ~3 min = ~30 min)
2. If all 10 clean → V81 production-grade COMPLETE for this session
3. If any cycle fails → triage + fix + restart from failed cycle (`--start-from=N`)
4. User does Rule Q L1 hands-on:
   - Open https://lover-clinic-app.vercel.app → Backend → CustomerListTab → verify cards show branch NAMES (not raw BR-... IDs)
   - Backend → จัดการ Backup → click Download on any V81 backup row → expect signed-URL download
   - Backend → จัดการ Backup → Restore → verify "Auth preserved (default)" green panel
5. Final SESSION_HANDOFF.md update after stress loop completes

## Files touched this turn
- `src/components/backend/CustomerCard.jsx` — branchesMap prop + name resolution
- `src/components/backend/CustomerListTab.jsx` — listBranches parallel fetch + branchesMap state + prop pass
- `tests/v81-fix5-customer-card-branch-name.test.js` — NEW 10 AV71 tests
- `scripts/v81-fix5-cleanup-test-branch.mjs` — NEW Rule M cleanup
- `scripts/diag-customer-branchid-distribution.mjs` — NEW Rule R diag
- `scripts/diag-v81-fix4-bug-a2-verify-real-sizes.mjs` — NEW Rule R diag (verified A2 fix)
- `scripts/v81-fix5-stress-with-user-simulation.mjs` — NEW stress runner with User Simulation
- `.agents/active.md` — this file

## Outstanding (user-triggered)
- Rule Q L1 hands-on on prod (3 verifications above)
- Storage Backups A/B/C cleanup when comfortable
- (Future) Delete V74/V77 backend endpoint files entirely
- (Future) Java/Node 24 SDK compat for V81 emulator

## Lessons locked
- **Display fallback chains hide schema gaps**: `customer.branchName || customer.branchId` is a fallback that LOOKS safe (renders something) but yields garbage when the primary field never exists. AV71 mandates UI surfaces resolve branchId → name via lookup map, never display raw IDs.
- **Diagnose before assuming corruption**: "branches มั่ว" sounded like restore corruption but was actually preexisting state + raw-ID display. Rule R diag (count by branchId) confirmed the data was correct; the bug was in rendering.
- **Stress test loop must exercise WRITE + READ flows**: cycle-1 admin-SDK loop confirmed backup-restore equality but missed the rendering-layer bug. V81-fix5 stress loop adds User Simulation (create test customers in non-NAKHON branches) to exercise the create→backup→restore→display chain end-to-end.
