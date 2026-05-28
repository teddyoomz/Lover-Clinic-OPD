---
updated_at: "2026-05-28 EOD+3 — V127 appointment hover-detail peek SHIPPED+DEPLOYED."
status: "SHIPPED + DEPLOYED (frontend-only). code 26fb5789 LIVE + docs commit on top. prod LIVE. Tree clean."
branch: "master"
last_commit: "V127 docs commit (state). Code: 26fb5789 (V127 hover peek). Prev: 53eaddcb V126 docs / 4ed43920 V126 code."
tests: "full vitest 15009 pass / 1 KNOWN flake (phase-17-1-cross-branch-import-rtl global.fetch-leak, 7/0 isolated — not V127); touched-area 49/0; build clean."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "26fb5789 LIVE (2026-05-28) — V127 deployed (Vercel build clean). Hover-on-calendar L1 = user."
firestore_rules_version: "UNCHANGED — frontend-only (no rules/storage/data/cron → no Probe-Deploy-Probe)"
---

# Active Context — V127 appointment hover-detail peek (SHIPPED 2026-05-28 EOD+3)

## State
- code `26fb5789` LIVE @ lover-clinic-app.vercel.app (+ docs commit on top) · tree clean.
- full vitest 15009 pass / 1 known flake · touched-area 49/0 · build clean.
- Spec/plan: `docs/superpowers/{specs,plans}/2026-05-28-appt-hover-detail*`.

## What this session shipped (all DEPLOYED)
- **V126 — PatientForm light-theme WCAG-AA** (B-i Selective, rose-harmonized) — DEPLOYED + prod-verified (reachable states).
- **V125 doc backfill** — verbose v-log-archive entry + §2 one-liner.
- **V127 — appointment hover-detail peek** — hover an appt card (desktop mouse) → anchored XL peek-card showing all present details, no click needed. Covers every appointment calendar sub-tab (shared `AppointmentCalendarView`) + agenda. Click→modal + touch unchanged.
  - NEW `useApptHoverPeek` (desktop-only `pointerType==='mouse'`, 150ms/80ms) + shared `AppointmentDetailBody` (modal + peek both render it — no drift) + portal-anchored `AppointmentHoverPeek` (XL 345px, theme-aware) + modal refactored onto the body + **AV144**.
  - Hub rows deliberately excluded (already full-detail inline).
  - Verified: build clean · suite 15009/1-flake · touched-area 49/0 (modal 14/0 + 3 V21 source-grep fixups) · peek theme AA in BOTH light+dark (live scan + screenshot).

## HONEST GAP (Rule Q)
- The *assembled* hover-on-the-real-calendar (peek beside a real grid cell on mouse-hover, flip/clamp/dismiss, no flicker between dense cells) = **USER L1** (admin-gated calendar + real mouse; the harness can't drive a trusted hover on the mounted calendar without admin login). Logic (hook unit + source-grep) + theme (live scan) + body↔modal consistency (RTL) all verified.

## Next action
Idle / await user.

## Outstanding user-triggered
- **V127 hover L1** on the real admin appointment calendar (desktop mouse; flip Dark/Light).
- PatientForm full intake-form 5-state visual L1 (V126).
- appt-live cross-device + chart on a real iPad (multi-device L1).
