---
updated_at: "2026-05-14 LATE-EOD continued — Phase 28 + Phase 27 saga DEPLOYED to prod (0389e23); deploy queue empty"
status: "master=0389e23 · prod=0389e23 · IN SYNC · 9176 tests + 1 skip · build clean"
branch: "master"
last_commit: "0389e23 docs(Phase 28): SESSION_HANDOFF + active + V-log + checkpoint"
tests: 9176
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "0389e23"
firestore_rules_version: 29
storage_rules_version: 2
---

# Active Context

## State
- master = `0389e23` · prod = `0389e23` (IN SYNC — Phase 27 saga + Phase 28 redesign DEPLOYED LIVE)
- Phase 28 SHIPPED: 7 new treatment-history components (Card/Header/DateHeader/Row/ExpandedBody/Stepper/Pagination) + 6 pure helpers + 3 Rule C1 extractions (formatBadgeTime / roleLabels / TreatmentDetailExpanded) + 152 new tests + 7 V21 fixups
- CDV.jsx: 2349 → 2047 lines (−302 net) by replacing inline 290-line treatment-history block with `<TreatmentHistoryCard ... />`
- Build clean. BackendDashboard chunk 907.60 → 914.70 KB (+7.10 KB justified)
- Live-verified on real prod LC-26000006: 5 rows + 2 date groups + steppers + light/dark theme + mobile 375px viewport

## What this session shipped (Phase 28 in addition to Phase 27)
- **28.1** treatmentDisplayResolvers — 6 helpers (TDD) ✅
- **28.1-bis** FS Timestamp sort regression fix (caught by code-quality reviewer) ✅
- **28.2** TreatmentLifecycleStepper (3-dot stepper + connectors + glow + pulse) ✅
- **28.3** TreatmentDateHeader (fire-red today / muted past + relative pill) + formatThaiDateFull added to utils ✅
- **28.4** TreatmentHistoryRow (collapsed + expanded states + edit/delete chips with e.stopPropagation) + ROLE_LABEL_TH extracted ✅
- **28.5** TreatmentHistoryExpandedBody (CC/DX callout + detail + print buttons) + TreatmentDetailExpanded extracted ✅
- **28.6** TreatmentHistoryHeader (CTA cluster: 2 ghost + 1 fire-red primary with glow) ✅
- **28.7** TreatmentHistoryPagination (refined ghost + fire-red active gradient) ✅
- **28.8** TreatmentHistoryCard composer + wire into CDV (replace inline 290-line block) ✅
- **28.9 + 28.10** Source-grep regression bank (15) + Rule I full-flow simulate (15 with realistic 5-treatment fixture matching user's screenshot) ✅
- **28.11** V21 fixups (7 across phase-26-0-status-display + phase-26-2f) ✅
- Live preview verification (Rule I item b) on LC-26000006 ✅
- Spec: `docs/superpowers/specs/2026-05-14-treatment-history-redesign-design.md`
- Plan: `docs/superpowers/plans/2026-05-14-phase-28-treatment-history-redesign.md`
- Checkpoint: `.agents/sessions/2026-05-14-phase-28-treatment-history-redesign.md`

## Next action
- (idle) await user direction — deploy queue EMPTY

## Outstanding user-triggered actions
- (none — deploy queue empty)
- **(optional)** Phase 27.2-septies — extract shared `buildTreatmentSummaryEntry(t)` helper
- **(optional)** Rule-of-3 cleanup: migrate 4+ inline `THAI_MONTHS` sites to use `formatThaiDateFull` from src/utils.js
- **(optional)** Storage rules CLI quirk — `firebase deploy --only storage:rules` errors "Could not find rules for the following storage targets: rules" despite firebase.json having `"storage": {"rules": "storage.rules"}`. Pre-existing config issue (Phase 28 has zero storage changes — not blocking). Deferred for separate maintenance.
