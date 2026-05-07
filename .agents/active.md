---
updated_at: "2026-05-08 V40 SHIPPED + DEPLOYED — prod live, 6859/6859 tests pass, post-deploy e2e 7/7 PASS"
status: "master=cea9fb6 · prod=cea9fb6 (V40 LIVE) · 6859/6859 tests pass · build clean"
branch: "master"
last_commit: "cea9fb6"
tests: 6859
production_url: "https://lover-clinic-app.vercel.app (LIVE at cea9fb6)"
production_commit: "cea9fb6"
firestore_rules_version: 28
storage_rules_version: 2
---

# Active Context

## State
- master = `cea9fb6` · prod = `cea9fb6` (FULLY DEPLOYED)
- 6859/6859 tests pass · build clean · 270 test files
- V40 (Branch Backup/Restore/Make-Fresh) feature-complete + LIVE in production
- 32 commits this session (V40 implementation + bonus comprehensive sweep)
- 1 critical bug found + fixed during bonus review (BranchBackupTab `selectedBranchId` destructure mismatch)

## Deploy summary (2026-05-08)
- **Firestore rules**: deployed (idempotent — no V40 changes; re-released for safety)
- **Storage rules**: deployed (V40 NEW `match /backups/{branchId}/{file=**}` admin-only)
- **Vercel**: deployed → `https://lover-clinic-app.vercel.app` (alias) ← `https://lover-clinic-mzdo9b9g3-teddyoomz-4523s-projects.vercel.app` (immutable URL)
- **Probe-Deploy-Probe (Rule B)**: 4/4 unauth REST probes 200 pre-deploy + 200 post-deploy + V40 storage anon → 403 (correctly blocked) + 3 deployed admin endpoints respond 401 without token / 204 OPTIONS
- **Post-deploy live e2e** (`scripts/e2e-branch-backup-full-sweep.mjs`): 7/7 PASS on real Firestore + Storage with TEST-prefixed fixtures, 6 items cleaned, zero orphans

## V40 features now LIVE in production
- **Backup สาขา tab** (admin-only) — admin can export selectable tier (T1-T4) or per-collection backup → JSON in Firebase Storage → 24h signed URL download
- **MakeFreshButton** (per branch row, admin-only) — typed-confirm modal → auto-pre-fresh-backup MANDATORY → wipe T1+T2+T3 + T4 customer-subcollections → restore-able from auto-backup
- **Restore endpoint** (overwrite preserves docIds OR clone-T1 re-mints docIds + applies FK remap)
- **3 CLI mirrors** (Rule M canonical) for dev / emergency use

## V40 coverage
- 25 helper unit tests (H1-H5)
- 15 Rule I flow-simulate tests (FS1-FS3)
- 38 adversarial endpoint runtime tests (E0-E3, every error code)
- 24 UI RTL human-flow tests (UI1-UI3)
- 8 live admin-SDK scenarios on real prod (Task 5.4 + Bonus 3 + post-deploy verify)
- **Total: 110 tests + 8 live scenarios + 3 deployed-endpoint smoke checks**

## Outstanding (user-triggered, none blocking)
- 🚨 H-bis ProClinic full strip (deferred from prior sessions)
- Hard-gate Firebase custom claim (deferred — defense-in-depth on top of existing isClinicStaff() rule)
- /audit-all pre-release pass

## Next action
Idle. V40 fully shipped + deployed + verified. Awaiting new directive.

Detail: `.agents/sessions/2026-05-08-v40-implementation-and-bonus-sweep.md`
