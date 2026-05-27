---
updated_at: "2026-05-28 — Light-theme WCAG-AA audit + brand-red red-700 SHIPPED + DEPLOYED + prod-verified; SESSION_HANDOFF archived (142 KB)."
status: "SHIPPED + DEPLOYED + prod-verified. Light-theme audit (App UI) + brand-red darken #b91c1c (strict AA) LIVE on prod. SESSION_HANDOFF under cap. Working tree clean. Only remaining = user L1 (6 unscanned surfaces + appt-live/chart prod flows)."
branch: "master"
last_commit: "3605f284 (SESSION_HANDOFF archival). Ship: a4731775 (light-theme+brand-red) + 9042934a (Rule-S docs); prod 9042934a."
tests: "full vitest 14976/0 (678 files); T7 5/0; build clean — last run THIS session (NOT re-run at session-end per directive)."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "9042934a LIVE (2026-05-28) — EOD+11 appt-live + EOD+12 chart + light-theme + brand-red"
firestore_rules_version: "UNCHANGED — CSS/theme-config only (no rules/storage/data/cron → no Probe-Deploy-Probe)"
---

# Active Context — V124 light-theme invisibility + appt real-time (IN PROGRESS 2026-05-28)

## 🔧 V124 (in progress) — /systematic-debugging, 2 bug classes
- **Bug A (light-theme invisibility)** — user: finance/deposit "มองไม่เห็นอะไรเลย" + date-strip "มองไม่ค่อยเห็น". Root causes + fixes in `src/index.css` (CSS-only, cosmetic shell):
  - bg-tint selectors `[class*="bg-{c}-{700..950}/"]` also matched the `dark:bg-...` variant → clobbered solid `bg-{c}-600 text-white` badges to pale → white-on-pale INVISIBLE (~1.05:1). Fix: `:not([class*=":bg-..."])` on all 136 selectors (script `scripts/fix-light-theme-bg-tint-dark-clobber.mjs`).
  - gray-600→`--tx-muted`, gray-700→`--tx-heading` (were `--tx-faint` #94a3b8, 2.45:1 — inverted hierarchy).
  - orange-500 → #c2410c (was #ea580c, 3.4:1).
  - date-strip SELECTED tab: label `text-sky-200`→`text-white` + bg-sky-700/600 descendant white-restore (was 1.0/3.01:1); count badge bg-sky-500→sky-600. `-400` shade completed uniformly (FM-C gaps).
- **Bug B (appt real-time)** — `AppointmentCalendarView.jsx`: month-strip counts used one-shot `getAppointmentsByMonth` → stale until refresh. Fix → `listenToAppointmentsByMonth` (onSnapshot = cross-device per-branch). Covers all 6 appointment sub-tabs. Day-grid was already live.
- Verified: build clean · T7 11/0 + audit-branch-scope 117/0 + appointment cluster 63/0 · full vitest 14980/2 (2 = THIS active.md V-marker meta-check, now resolved).
- PENDING: real-browser pixel verify (finance badges visible + date-strip selected tab + Bug B real-time write→live) + deploy (user authorized "แล้วค่อย deploy").

## State
- master `3605f284` pushed · prod `9042934a` LIVE @ lover-clinic-app.vercel.app + prod-verified (--accent-red #b91c1c, .text-red-400 rgb(185,28,28)).
- full vitest 14976/0 · build clean · working tree clean · SESSION_HANDOFF 142 KB (archived under 200 KB cap).
- Detail: checkpoint `.agents/sessions/2026-05-27-light-theme-audit.md`.

## What this session shipped
- brand-red `.text-red-400` (261 uses) + `--accent-red` light → red-700 `#b91c1c` (strict AA; was 4.37:1 sub-AA on tint → 6.47:1 white). CSS-only (cosmetic shell). Strict-AA guard added to T7 (5/0).
- Committed + pushed + `vercel --prod` LIVE + **prod-verified the deployed artifact** (Rule Q-vis: computed rgb(185,28,28) + screenshot on white + tinted card).
- Deploy bundled the prior unpushed EOD+11 appt-live + EOD+12 chart stack → now LIVE (their first prod exposure).
- Rule S TIMING reversal docs committed (`9042934a`).
- SESSION_HANDOFF archival: 46 oldest blocks → archive; 277 → 142 KB (under cap). Block-conserved (70=24+46; archive 95→141).

## Next action
Idle / await user. No code pending. Next feature/bug = fresh task.

## Outstanding (user-triggered)
- ⏳ user L1 on prod light theme: 6 unscanned surfaces (stock / master-data / treatment-form / chat / settings / deep-modals). Global + monotonic-safe fixes → low risk, but NOT claimed verified (login wall blocks auto-L1 — security rule).
- ⏳ user L1: appt-live cross-device + chart flows (first prod exposure since EOD+11/EOD+12 just deployed).
