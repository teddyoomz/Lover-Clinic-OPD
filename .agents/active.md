---
updated_at: "2026-05-15 EOD — Central Stock Make-Fresh DEPLOYED + V66 fix committed + 🚨 BRANCH make-fresh has SAME V66 bug (user-reported)"
status: "master=25cdb41 · prod=1f63219 (V66 fix PENDING DEPLOY) · build clean · 5/5 central round-trip GREEN"
branch: "master"
last_commit: "25cdb41 fix(central-stock): V66 — CENTRAL_BUCKETS filter fields corrected against PROD write-side code"
tests: "9883+ vitest GREEN + 12 skipped + 4 pre-existing failures"
playwright_e2e: 14
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "1f63219"
firestore_rules_version: 31
storage_rules_version: 2
---

# Active Context

## 🚨 NEW BUG DISCOVERED EOD — needs next-session work

User report: "กด ลบ Stock สาขานครราชสีมา จากปุ่มสาขาใหม่แล้ว แต่ยังเหลือตามภาพ มันต้องไม่เหลืออะไรเลย". Screenshots show 1,064 transfers + orders + withdrawals + Movement Log STILL THERE after BRANCH make-fresh on นครราชสีมา. **Same V66 class-of-bug as central** — BRANCH make-fresh filters `be_stock_transfers + be_stock_withdrawals` by `branchId` but those collections use `sourceLocationId` + `destinationLocationId` instead. Plus user asked for orphan cleanup.

## State

- master = `25cdb41` · prod = `1f63219` · **2 commits PENDING DEPLOY** (central V66 fix + pre-fix EOD marker)
- Central Stock V66 fix committed + pushed but NOT deployed (broken in prod until vercel --prod)
- BRANCH make-fresh V66 bug DISCOVERED but NOT fixed

## What this session shipped

- Central Stock Make-Fresh + Backup Integrity (12 tasks, brainstorming Q1-Q3 → spec → plan → execution → Rule Q L2 5/5 PASS) — DEPLOYED 2026-05-15
- ★ V66 fix for central stock: CENTRAL_BUCKETS filterField names corrected against prod write-side code (Rule R env-pull diag) + NEW regression test V66.1-V66.7 locks against future invented field names + AV44 extension + re-verified 5/5 on real prod
- Discovered: BRANCH make-fresh has SAME V66 class-of-bug for be_stock_transfers/be_stock_withdrawals (filter field `branchId` ≠ actual `sourceLocationId`/`destinationLocationId`)

Checkpoint: [.agents/sessions/2026-05-15-central-stock-make-fresh-and-v66-saga.md](sessions/2026-05-15-central-stock-make-fresh-and-v66-saga.md)

## Next action

**Top priority**: fix BRANCH make-fresh V66 bug (same root cause + fix pattern as central). Cross-grep production write code → identify ALL field-name mismatches → fix branchBackupBuckets.js or endpoint filter → add to V66 regression test → re-verify 10/10 e2e + user hands-on test on real นครราชสีมา branch.

**Second**: User requested orphan cleanup — likely orphan stock records, abandoned transfers, etc. Use Rule R diag + Rule M two-phase admin-SDK script.

## Outstanding (user-triggered)

1. Deploy V66 fix (central stock) — `vercel --prod --yes` after fixing BRANCH make-fresh in same deploy batch
2. After deploy: hands-on test on real นครราชสีมา branch to verify wipe actually deletes
3. Orphan cleanup script
