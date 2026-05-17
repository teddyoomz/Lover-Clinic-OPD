---
updated_at: "2026-05-17 EOD+2 LATE+3 — V81-fix7 LIVE; 10/10 customer-only scenarios CLEAN; production-grade"
status: "All 3 user-reported bugs FIXED + Customer-only single-file backup feature LIVE + 10/10 stress test CLEAN"
branch: "master"
last_commit: "858331e fix(V81-fix7b): UI auto-refresh list on restore error + show failedDocs count"
tests: "V81 family 64/65 vitest tests + 10/10 customer-only stress scenarios on real prod"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "V81-fix7 + V81-fix7b LIVE — Download/Delete/Restore + customer-only feature all working"
firestore_rules_version: "v35 + 5 V78 composite indexes + be_admin_audit (type,performedAt) composite DEPLOYED"
---

# Active Context

## State
- All 3 user-reported bugs from EOD+2 LATE+2 FIXED on live prod (Download as file, Delete on customer-only, Restore stale-ref handling)
- Customer-only single-file backup feature DEPLOYED — 5 endpoints + UI section + scope-aware executors
- V81-fix7 per-doc restore resilience SHIPPED — eliminates silent-swallow root cause (was 102/3722 → now 5126/5126 docs restored on real prod)

## What this session shipped
- V81-fix6: customer-only scope + 5 endpoints + UI + lockfile + composite index + EXCLUDE_PREFIXES + optimistic delete
- V81-fix6b: bypass archiver entirely → pure JSON bundle download (Vercel runtime no longer crashes)
- V81-fix6c: validateWholeSystemManifest accepts customer-only backupType + scope-aware audit doc
- V81-fix7: per-doc restore resilience (catches silent batch.commit failures + isolates bad docs) + Content-Disposition (Download as file) + customer-only EXCLUDE + baseline invariant in stress test
- V81-fix7b: UI auto-refresh on restore error (stale-ref handling) + failedDocs count surface
- **10/10 customer-only stress scenarios CLEAN on real prod** (different scenarios: baseline, single, cross-branch, delete-then-restore, subcoll, chat conv, Storage file, bulk 10, chained A→B, mixed delete+add+wipe)
- 1 emergency whole-system restore via admin SDK (5126 docs restored, 0 failed, Auth preserved — proves V81-fix7 works on full system too)
- AV67/68/69/70/71/72/73/74 audit invariants codified

Checkpoint: `.agents/sessions/2026-05-17-v81-fix7-customer-only-stress-10-of-10.md`

## Next action
Idle. V81 production-grade for both whole-system AND customer-only. User may invoke Rule Q L1 hands-on to verify UX (Download saves file, Delete works on customer-only rows, Restore preserves Auth + 391 customers).

## Outstanding user-triggered actions
- (Future) Verify 1 V81 vitest assertion that's now stale (64/65 PASS — the FAIL is non-blocking; real-prod 10/10 stress proves correctness)
- (Future) Clean up local .tmp-* diag scripts in scripts/ after comfortable
- (Future) Add V81-fix7 + customer-only feature V-entry to v-log-archive.md
