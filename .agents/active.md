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

# Active Context — V124 light-theme invisibility + appt real-time (SHIPPED+DEPLOYED+verified 2026-05-28)

## ✅ V124 + V124-fix2 — /systematic-debugging, 2 bug classes — SHIPPED + DEPLOYED + prod-verified
- master `d106a5cd` (77757f67 V124 + d106a5cd V124-fix2) · prod `d106a5cd` LIVE @ lover-clinic-app.vercel.app · full vitest **14983/0** · build clean · tree clean.
- **Bug A (light-theme invisibility)** — user: finance/deposit "มองไม่เห็นอะไรเลย" + date-strip "มองไม่ค่อยเห็น". `src/index.css` (CSS-only, cosmetic shell):
  - bg-tint selectors `[class*="bg-{c}-{700..950}/"]` also matched the `dark:bg-...` variant → clobbered solid `bg-{c}-600 text-white` badges to pale → white-on-pale INVISIBLE (~1.05:1). **v1** used `:not([class*=":bg-..."])` but that over-excluded base+`hover:` elements (stock ปรับ/เพิ่ม/แก้ไข → 3.64:1 regression, caught post-deploy). **v2 (d106a5cd)** = BASE-match `[class*=" bg-X/"] + [class^="bg-X/"]` (136 sels) — fires for base tint despite variants, skips dark:-only badges. Scripts: fix-light-theme-bg-tint-{dark-clobber,v2-base-match}.mjs.
  - gray-600→`--tx-muted`, gray-700→`--tx-heading` (were `--tx-faint` #94a3b8 — inverted). orange-500→#c2410c. `-400` + `-600` colored-text shades completed to AA-dark (FM-C gaps; fixed text-amber-600 "ยังไม่นัด"/text-teal-600 name).
  - date-strip SELECTED tab: label `text-sky-200`→`text-white` + bg-sky-700/600 descendant white-restore (was 1.0/3.01:1 invisible); count badge bg-sky-500→sky-600.
- **Bug B (appt real-time)** — `AppointmentCalendarView.jsx` month-strip used one-shot `getAppointmentsByMonth` → stale until refresh → `listenToAppointmentsByMonth` (onSnapshot = cross-device per-branch). Covers all 6 backend appt sub-tabs. Day-grid was already live.
- **VERIFIED on REAL deployed prod (Rule Q-vis + L2)**: stock 0 fails (regression fixed) · finance badges all VISIBLE + ส่งลิ้งค์/ยังไม่นัด/name AA · date-strip selected tab white-on-blue readable · **Bug B real-time: node admin-SDK write→date-strip 2→3 LIVE no-refresh, delete→3→2 LIVE** (cross-process/per-branch). T7 12/0 · BS-F 21/0.
- **Remaining (honest)**: 3 finance white-on-{c}-600 SOLID badges (ลูกค้าจอง 3.19 / ดูลิ้งค์ 3.77 / 🎯) = VISIBLE + meet WCAG 3:1 UI-component bar (branded solid, same as dark theme); strict-4.5-AA would need tint+dark-text redesign — flagged, not done. treatment-form still not individually scanned (deep PHI nav).

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
