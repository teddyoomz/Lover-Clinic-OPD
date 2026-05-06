---
updated_at: "2026-05-07 EOD continuation — V38 + V39 + V38-followup + e2e + V40 spec (5 commits)"
status: "master=496a15c · 6757/6757 tests pass · build clean · prod=e36811f (V38-only LIVE — V39+spec NOT deployed)"
branch: "master"
last_commit: "496a15c"
tests: 6757
production_url: "https://lover-clinic-app.vercel.app (LIVE at e36811f)"
production_commit: "e36811f"
firestore_rules_version: 27
---

# Active Context

## State
- master = `496a15c` · 6757/6757 tests pass · build clean
- 5 commits this session ahead of prod (e36811f):
  - `4f008a3` V38 — list spread-order V12 fix (listProducts + listCourses)
  - `d964b14` V39 — migrate-button branchId stamping (promotions/coupons/vouchers/df_staff_rates) + V38 source-patch (cross-branch-import adapters) + 70 button-coverage tests + AV18
  - `ee40256` V38-followup — mass-sweep 85+ spread-order swaps across 17 files (AV17 complete)
  - `b33f369` E2E — 19 migrate buttons × 30 fixtures × 122/122 assertions on real prod Firestore
  - `496a15c` V40 spec — branch backup/restore/make-fresh design doc (374 lines)
- Production data fixed via Rule M backfills (479 zombies stamped พระราม 3; user deleted 5+2 V38 docs via post-fix delete)
- V40 IMPLEMENTATION PLAN at `C:\Users\oomzp\.claude\plans\sprightly-jumping-waterfall.md` (~30 bite-sized tasks across 7 phases)

## What this session shipped (5 commits + 1 plan)
- **V38** silent-no-op delete fix on พระราม 3 catalog (spread-order swap in 2 listers + Rule M backfill of 5+2 docs + AV17 audit invariant + Rule I flow-simulate)
- **V39** migrate-button branchId stamping — 4 wrapper fns + 4 mappers patched; 7 cross-branch-import adapters + endpoint generic stamping; 70 contract tests; Rule M backfill of 479 zombies (303 products + 174 courses + 2 promotions stamped พระราม 3); AV18 audit invariant
- **V38-followup mass-sweep** — 85+ `{id: d.id, ...d.data()}` → `{...d.data(), id: d.id}` swaps across 17 files; AV17 marked COMPLETE
- **Comprehensive e2e** — 19 buttons × happy + adversarial × deep mapping × real prod Firestore + cleanup verified (122/122 pass)
- **V40 design spec** — Branch Backup/Restore/Make-Fresh approved via brainstorming (6 Q&A locked); spec doc + implementation plan ready

Detail: `.agents/sessions/2026-05-07-v38-v39-e2e-v40-spec.md`

## Next action
Idle. Open new chat for V40 implementation (subagent-driven per plan) OR new directive.

## Outstanding (user-triggered)
- **V40 implementation** — 7-phase plan ready at `C:\Users\oomzp\.claude\plans\sprightly-jumping-waterfall.md`; user authorizes "go" + execution mode (subagent-driven recommended)
- **Deploy V38 + V39 + V38-followup to Vercel** — say "deploy" to ship the 4 code commits + 1 spec to prod (currently lagging behind master by 5 commits)
- 🚨 H-bis ProClinic full strip (deferred from prior sessions)
- Hard-gate Firebase custom claim (deploy-coupled, deferred)
- /audit-all pre-release pass
