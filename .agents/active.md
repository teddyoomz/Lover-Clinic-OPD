---
updated_at: "2026-05-28 EOD+6 — V132 + V133/V133-bis + V134 (reports-revenue: course category, chart, deposit display) SHIPPED + DEPLOYED + prod-verified."
status: "Deployed + live. Reports-revenue (6c99a3d7) deployed. Extended-suite spawned WIP now committed + runnable (4419 pass / 280 pre-existing stale — follow-up). Default suite 15154/0 = deploy gate, unaffected."
branch: "master"
last_commit: "6c99a3d7 (V132+V133+V134). EOD docs commit on top."
tests: "NO re-run at session-end (per rule). This session: default suite 15154 pass / 0 fail + build clean; phase10-revenue 27/27 (extended, via temp config); real-prod Rule R diags (categories surface; money conserved, no fractions); chart full-bar+colors+100%-legend measured in real browser. Screenshot tool timed out (infra) — DOM-measured instead."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "6c99a3d7 LIVE (vercel --prod, aliased) — V132/V133/V133-bis/V134 all live."
firestore_rules_version: "UNCHANGED — frontend/lib/CSS only (no rules/storage/index/cron → no Probe-Deploy-Probe)."
---

# Active Context — V132 + V133/bis + V134 reports-revenue (2026-05-28 EOD+6)

## State
- master = `6c99a3d7` deployed; prod LIVE @ lover-clinic-app.vercel.app. Reports-revenue: course-category resolution + RadialBars chart + deposit display all fixed + live.
- Four `/systematic-debugging` rounds this session, all reports-revenue, triggered by the user viewing the tab.
- ⚠ Working tree has ~150 uncommitted `tests/extended/**` + `package.json` + `vitest.extended.config.js` + `scripts/_tmp-fix-extended-imports.mjs` — from the SPAWNED "fix extended suite" task, NOT this session + NOT verified by me + NOT deployed.

## What this session shipped (detail → checkpoint 2026-05-28-reports-revenue-category-chart-deposit.md)
- **V132** — course หมวดหมู่ showed "ไม่ระบุ" everywhere → canonical `resolveCourseCategory/ProcedureType/DisplayName` (reads live `be_courses.courseCategory`; future categories auto-surface, no enum). AV153.
- **V133/V133-bis** — RadialBars legend summed ~279% + distorted spiral → `computeRadialBarLayout` (legend %=value/total Σ100%; arc=value/max → biggest=full ring; fit-to-radius) + max-distinct palette. AV154.
- **V134** — หักมัดจำ fractions (4,941.35) from proportional split of ROUND deposits → gross-per-row + sale-level footer summary + net. Money was already correct + conserved (real-prod 8,000=8,000). AV155.
- Also fixed `tests/extended/phase10-revenue.test.js` broken imports (`../`→`../../`) so the V134 contract test runs (27/27).

## Next action
Idle / await user.

## Outstanding user-triggered actions
- **Extended suite (`tests/extended/`) — handled this session**: spawned-task fix committed (NEW `vitest.extended.config.js` + `package.json` `--config` + 148 import-path fixes `../`→`../../`). `npm run test:extended` RUNS now → **4419 pass / 280 fail**. The 280 = PRE-EXISTING stale-assertion drift (suite frozen since session-11; ~1yr refactors: V50/branch-scope/V132/Phase28/marketing). NOT import errors, NOT deploy-gating. **Follow-up (large): triage → rewrite/delete obsolete extended assertions.** Default `npm test` = 15154/0 green, unaffected.
- L1 hands-on (auth-gated): reports-revenue tab — categories show real names; chart full-bar + distinct colors + legend 100%; table gross-per-row + footer net.
