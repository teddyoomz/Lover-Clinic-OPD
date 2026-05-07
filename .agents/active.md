---
updated_at: "2026-05-08 V40 SHIPPED — 31 commits + 1 critical bug found+fixed + live prod e2e PASS"
status: "master=ccc677d · 6859/6859 tests pass · build clean · prod=e36811f (V38..V40 NOT deployed — 9 commits behind)"
branch: "master"
last_commit: "ccc677d"
tests: 6859
production_url: "https://lover-clinic-app.vercel.app (LIVE at e36811f)"
production_commit: "e36811f"
firestore_rules_version: 27
---

# Active Context

## State
- master = `ccc677d` · 6859/6859 tests pass (270 test files) · build clean
- 9 commits ahead of prod (e36811f) — V38 spread-order fix + V39 migrate-button branchId stamp + V38-followup mass-sweep + comprehensive e2e + V40 spec + V40 implementation (this session)
- V40 fully implemented: 23 plan tasks (Phase 1-7) + 4 bonus tasks (adversarial 38 + RTL 24 + full-sweep e2e 7 + post-bonus push)
- 1 critical bug found + fixed during bonus review: `BranchBackupTab.jsx` was destructuring `selectedBranchId` from `useSelectedBranch()` but the real hook returns `branchId` — fix changed to rename pattern (every other consumer's pattern)
- Live admin-SDK e2e against real prod Firestore + Storage: 7/7 PASS + cleanup verified zero orphans

## V40 commit chain (31 total since baseline 464c327)
**Phase 1 (3 helpers):** `103b904` `c2e08ec` (review fix) `febe37b` `573bf4c`
**Phase 2 (3 endpoints + smoke + review fix):** `98c6467` `42e749f` `584ed2a` `39aa11e` `eb03311`
**Phase 3 (storage rules + Rule B):** `c5798b3` `6852611` `fd5b43b`
**Phase 4 (UI):** `391dcb8` `0fa38a2` `800ce3f` `f832646`
**Phase 5 (Rule I tests + live e2e):** `291d383` `eef4238` `ccdaa0b` `19873cc`
**Phase 6 (CLI mirrors):** `396ad6e` `18a1323` `cdf46fa`
**Phase 7 (V40 docs + AV19):** `2ae4d59` `763d17d` `5a13d22`
**Phase 7.4 (final verify + push):** `9449680` (test count fix)
**Bonus (post-push, second push):** `47115fb` `35aa999` `fc76e1e` `ccc677d`

## Coverage
- Helper unit tests: 25 H1-H5
- Rule I flow-simulate: 15 FS1-FS3
- Adversarial endpoint runtime tests: 38 (every error path + success path on all 3 endpoints)
- UI RTL human-flow tests: 24 (BranchBackupTab + MakeFreshButton + MakeFreshModal)
- Live admin-SDK e2e on real prod: 7 steps + 1 round-trip = 8 scenarios PASS
- **Total V40 test count: 110 new tests + 8 live scenarios**

## Outstanding (user-triggered)
- **Deploy 9 commits to Vercel + storage:rules + firestore:rules** — say "deploy" to ship V38..V40 to prod
  - V40 storage.rules requires `firebase deploy --only firestore:rules,storage:rules` (Phase 3.3 combined deploy bundle) — Probe-Deploy-Probe extended to 7 endpoints (V40 added admin Storage probe)
  - vercel `--prod` for endpoints + UI
- 🚨 H-bis ProClinic full strip (deferred from prior sessions)
- Hard-gate Firebase custom claim (deploy-coupled, deferred)
- /audit-all pre-release pass

## Next action
Idle. V40 is feature-complete + comprehensively tested. Awaiting:
- "deploy" → ship V38..V40 to prod with Probe-Deploy-Probe
- New directive

Detail: `.agents/sessions/2026-05-08-v40-implementation-and-bonus-sweep.md` (to be written by /session-end)
