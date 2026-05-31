---
updated_at: "2026-06-01 EOD+2 — Frontend top menu bar pinned (sticky) SHIPPED + DEPLOYED (AV170)."
status: "DEPLOYED (vercel-only, no Probe-Deploy-Probe). prod = current code."
branch: "master"
last_commit: "6aee3de3 (sticky menu fix). prod bundle = 6aee3de3 LIVE."
tests: "148 targeted pass (header source-grep banks + glow/portal + new regression). Full suite NOT run (Rule N — small CSS fix). Last full suite 15533/15534 (prior session)."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "6aee3de3 LIVE (aliased; vercel --prod). Was ede847dd (staff-chat scroll)."
firestore_rules_version: "UNCHANGED. vercel-only deploy (0 rules/storage/index/cron/functions in prod->HEAD diff)."
---

# Active Context — Frontend top menu pinned (sticky) DEPLOYED (2026-06-01 EOD+2)

## State
- `/systematic-debugging`: Frontend top menu (`<header data-testid="admin-top-menu">`) scrolled away (was `position: relative`). The trap: a naive `sticky top-0` SILENTLY fails because parent `.admin-frontend-zone` used `overflow-x-hidden` → CSS coerces `overflow-y: auto` → zone becomes a scroll-container that captures the sticky. Proven in a real browser (sticky+hidden header −568px / sticky+clip 0).
- Fix (3 coordinated): header `relative z-20`→`sticky top-0 z-20`; zone `overflow-x-hidden`→`overflow-x-clip`; in-page QR sidebar `sticky top-8`→`top-24` (clears the ~60px sticky menu).
- Backend top bar (`BackendTopBarNew`) was ALREADY `sticky top-0` (its `overflow-x-hidden` is on a sibling `<main>`, not an ancestor) — working reference, unchanged. Isolated Frontend miss.

## Verification (Rule Q)
- Real-browser isolation probe (mechanism) + REAL authed AdminDashboard on the dev server (= exact committed code, real prod Firebase): `menuPosition` sticky / `top` 0 / zone `overflow-x` clip + `overflow-y` visible; scroll 700px → menu stays at viewport-top **0** (`getBoundingClientRect` = real rendered geometry).
- 148 targeted tests pass + build clean. **AV170** + `tests/admin-menu-sticky-source-grep.test.js` (S1-S5).
- HONEST gap (Rule Q-honest): literal LIVE-prod-URL browser nav harness-blocked (Claude Preview origin-locked to localhost + Chrome ext not connected). Deployed bundle = the verified commit; sticky CSS behavior is identical regardless of serving origin. Screenshot capture stalls on this animation/listener-heavy page (no page error). User can glance at the live app to SEE it.

## Next action
- None pending — deployed + verified (identical-code L1). Awaiting next task.

## Outstanding (carryover, user-triggered)
- cron `stock-lot-cleanup` 03:45 BKK (optional CRON_SECRET verify).
- Prior-session ship-artifact V-log entries still unwritten (sales paid-column/redesign; EOD+5/+6 resizable-panel/V73-BS1/course-step). This session (sticky menu): AV170 written; no V-entry needed (isolated localized CSS fix).
