# Session 2026-05-04 — Audit-fix sweep + AP1 V15 #11/#12/#13 + AP1-bis V15 #14 pending

## Summary
Resumed Phase 16.1 plan (V15 #11 LIVE) → MEDIUM/LOW audit-fix sweep (TF2 / R-FK / a11y / AP1 lightweight) → ProfileDropdown → PDPA strip per user verbatim directive → AP1 schema atomic slot reservation (V15 #13 with `be_appointment_slots` collection) → TF3 TFP full a11y sweep → AP1-bis multi-slot 15-min interval array (closes range-overlap that exact-key missed).

## Current State
- master = `1d15db5` · prod = `c0d9dc4` (V15 #13) · **1 commit ahead-of-prod**
- 4612/4612 tests pass · build clean · firestore.rules v24
- Phase 16: ALL LIVE (16.1-16.8 done — 16.8 audit-all reverified during MEDIUM/LOW sweep)
- AP1 hardening sequence complete: lightweight verify (V15 #12) → schema atomic exact-key (V15 #13) → multi-slot 15-min array (V15 #14 pending)
- Outstanding: V15 #14 deploy auth · pre-launch H-bis cleanup (user trigger only)

## Commits
```
1d15db5 feat(ap1-bis): multi-slot 15-min interval reservation closes range-overlap
c0d9dc4 feat(ap1+tf3): atomic appointment slot reservation + TFP full a11y sweep
f88f23e feat(audit-fix + profile-dropdown): TF2 + P1/P3 + a11y + R-FK + AP1 + logout dropdown
84c8a38 chore: remove privacy-audit infrastructure + strip related labels per user directive
59f95ab refactor(rp1): eliminate all 28 IIFE-in-JSX sites (Vite-OXC pre-launch hardening)
ed69cc1 docs(agents): EOD 2026-04-30 — V15 #11 deploy LIVE (Phase 16.1 Smart Audience)
```

## Files touched (this session, post-V15 #11)
- `src/lib/backendClient.js` — AP1 schema (V15 #13) + AP1-bis multi-slot (V15 #14): SLOT_INTERVAL_MIN, _parseHHMM, _formatHHMM, buildAppointmentSlotKey (legacy compat), buildAppointmentSlotKeys (plural), _releaseAppointmentSlot (writeBatch + array), createBackendAppointment (Promise.all tx.get + iterate tx.set), updateBackendAppointment (oldKeys/newKeys + sig comparison + writeBatch rotation), deleteBackendAppointment (uses _releaseAppointmentSlot), R-FK `_assertBeRefExists` + `_collectAudienceBoughtRefs`
- `src/components/backend/ProfileDropdown.jsx` — NEW avatar dropdown with logout-only menu
- `src/pages/BackendDashboard.jsx` — wire ProfileDropdown into 2 spots next to ThemeToggle
- `src/components/TreatmentFormPage.jsx` — TF2 8 data-field anchors + TF3 a11y sweep (fieldErrors + ariaErrProps + FieldError + 23 aria-labels)
- `src/components/backend/CustomerCreatePage.jsx` — a11y sweep + PDPA strip
- `src/components/backend/SaleTab.jsx` — a11y sweep
- `firestore.rules` — `match /be_appointment_slots/{slotId}` (V15 #13)
- Tests: `tests/ap1-schema-slot-reservation.test.js` (50 tests now), `tests/profile-dropdown.test.jsx`, `tests/tf2-scroll-to-error-coverage.test.js`, `tests/a11y-aria-coverage.test.jsx`, `tests/tf3-tfp-a11y-coverage.test.jsx`

## Decisions (1-line each)
- AP1 fix sequence: incremental hardening (lightweight verify → schema exact-key → multi-slot 15-min) — each layer additive, deployable independently
- `buildAppointmentSlotKey` (singular) KEPT for backward-compat with V15 #12/#13 production data + legacy slot release fallback (defensive includes() guard against double-delete)
- AP1-bis interval = 15 min (matches ProClinic + clinic-typical scheduling granularity); `SLOT_INTERVAL_MIN` exported configurable for tests
- ProfileDropdown placement: top-right next to ThemeToggle in BOTH customer-detail breadcrumb AND default desktop (per user "Tab login อยู่บนขวาจอ")
- PDPA strip honored verbatim — removed from active code/comments/skills/checkpoints; ProClinic-scan JSON kept (data integrity)
- Range-overlap detection works because slots overlap when ranges overlap: 09:00-10:00 reserves [09:00, 09:15, 09:30, 09:45]; 09:30-10:30 reserves [09:30, 09:45, 10:00, 10:15] — Promise.all tx.get sees the shared [09:30, 09:45] → throws AP1_COLLISION

## Next Todo
1. **Await user "deploy" for V15 #14** — AP1-bis source-only (rules already live)
2. After V15 #14 ships: confirm anon writes to `be_appointment_slots` still 403 (rule unchanged from V15 #13)
3. Phase 17 plan brainstorm when user ready

## Resume Prompt
See `SESSION_HANDOFF.md` Resume Prompt block (top of file). Status: master=1d15db5, 4612 tests, prod=c0d9dc4 LIVE V15 #13, 1 commit ahead.
