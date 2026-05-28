---
updated_at: "2026-05-28 EOD — V124 light-theme invisibility + appt real-time + full-AA SHIPPED+DEPLOYED+prod-verified."
status: "SHIPPED + DEPLOYED + prod-verified. /systematic-debugging 2 bug classes (light-theme invisibility + appt real-time) + ดัน AA เต็ม. master=prod=38bd3565 LIVE. Working tree clean."
branch: "master"
last_commit: "38bd3565 (V124-fix3 full-AA). Stack: 77757f67 V124 + d106a5cd fix2(base-match) + 4c751bf5 docs + 38bd3565 fix3(AA-bg)."
tests: "full vitest 14983/0 (last full run, pre-fix3); fix3 added 1 T7 guard → T7 13/0 targeted (NOT re-run full per directive); build clean."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "38bd3565 LIVE (2026-05-28) — V124 + fix2 + fix3 all deployed + prod-verified"
firestore_rules_version: "UNCHANGED — CSS/theme + component-color + listener swap only (no rules/storage/data/cron → no Probe-Deploy-Probe)"
---

# Active Context — V124 light-theme + appt real-time (SHIPPED 2026-05-28)

## State
- master=prod `38bd3565` LIVE @ lover-clinic-app.vercel.app · prod-verified (Rule Q-vis + L2 real-browser).
- full vitest 14983/0 (last full) · build clean · tree clean.
- Detail: checkpoint `.agents/sessions/2026-05-28-v124-light-theme-appt-realtime.md`.

## What this session shipped (V124 + fix2 + fix3)
- **Bug A light-theme invisibility (CSS-only)**: bg-tint selectors `[class*="bg-{c}-{700..950}/"]` matched `dark:` variants → clobbered solid `bg-{c}-600 text-white` badges to pale → INVISIBLE (finance "มองไม่เห็นอะไรเลย"). Fix = BASE-match `[class*=" bg-X/"]+[class^="bg-X/"]` (v1 `:not` over-excluded base+hover: → stock-button regression caught post-deploy → v2 base-match).
- gray-600/700→muted/heading (were faint), orange-500→700, `-400`/`-600` colored-text → AA. date-strip selected tab label/number (1.0/3.01:1 invisible) → white-on-blue via bg-sky-700/600 descendant white-restore; count badge sky-500→600.
- **ดัน AA เต็ม (fix3)**: white-on-`bg-{c}-600` → `{c}-700` light-only (`.bg-{c}-600.text-white`) → finance badges + count badge + all white-on-color CTAs to strict AA (finance 0 fails).
- **Bug B appt real-time**: `AppointmentCalendarView` month-strip one-shot `getAppointmentsByMonth` → `listenToAppointmentsByMonth` (onSnapshot, cross-device, per-branch). Covers all 6 backend appt sub-tabs.
- Verified PROD: finance 0 fails · stock 0 fails · date-strip readable · **Bug B real-time: node write→strip 2→3 LIVE no-refresh, delete→3→2** (cross-process). T7 13/0 · BS-F 21/0.

## Next action
Idle / await user. No code pending.

## Outstanding (user-triggered)
- treatment-form not individually scanned (deep PHI nav) — uses same global classes (covered); user L1 if desired.
- appt-live cross-device + chart prod flows (EOD+11/12) — user multi-device L1.
