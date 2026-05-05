---
updated_at: "2026-05-05 EOD — Phase 19.0 LIVE in prod (V15 #22). Migration --apply complete."
status: "master=024f6dd · prod=024f6dd (V15 #22 LIVE) · 5463 tests pass"
current_focus: "Idle — Phase 19.0 (15-min slots + 4-type taxonomy) shipped + migrated"
branch: "master"
last_commit: "024f6dd"
tests: 5463
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "024f6dd"
firestore_rules_version: 26
storage_rules_version: 2
---

# Active Context

## State
- master = `024f6dd` (post Phase 19.0 deploy + migration script fix); prod = `024f6dd` (V15 #22 LIVE 2026-05-05)
- IN SYNC with prod (no commits ahead)
- 5463/5463 tests pass · build clean · firestore.rules v26 (idempotent re-publish on V15 #22)

## What this session shipped (Phase 19.0 — appointment 15-min slots + 4-type taxonomy)

### Spec + plan + execution
- Spec: `docs/superpowers/specs/2026-05-06-phase-19-0-appointment-15min-and-4types-design.md`
- Plan: `docs/superpowers/plans/2026-05-06-phase-19-0-appointment-15min-and-4types.md` (14 tasks, Rule K work-first-test-last, subagent-driven)
- Brainstorm Q1 = Option B Uniform: all legacy `appointmentType` → `'no-deposit-booking'`

### Source commits (in order)
- `ef4c003` Task 1 — NEW `src/lib/appointmentTypes.js` SSOT (4-type taxonomy + resolvers + migrate helper)
- `73fbf22` Task 2 — `staffScheduleValidation.js` canonical TIME_SLOTS 28 → 56 (15-min)
- `1dcd55b` Task 3 — NEW `api/proclinic/_lib/appointmentTypeProClinic.js` 4→2 translator (@dev-only H-bis)
- `a25b101` + flex-wrap polish — Task 4 AppointmentFormModal: drop local TIME_SLOTS+APPT_TYPES; defaults `'10:15'`/`'no-deposit-booking'`; auto-bump endTime
- `99711f8` Task 5 — AppointmentTab: SLOT_H 36→18 (15-min grid, total height preserved); canonical TIME_SLOTS
- `c5a97e5` + 2 polish commits — Task 6 DepositPanel: canonical TIME_SLOTS; `'deposit-booking'` default; useState + reset both updated; APPOINTMENT_TYPES SSOT import
- `f4df1d7` Task 7 — `appointmentReportAggregator.js` + `AppointmentReportTab.jsx` use SSOT resolver + APPOINTMENT_TYPES filter
- `010e42f` Task 8 — `AdminDashboard.jsx` typeMap → `resolveAppointmentTypeLabel`; `appointmentDisplay.js` re-exports SSOT
- `74a3f76` Task 9 — `api/proclinic/appointment.js` lines 32 + 198 use `mapAppointmentTypeForProClinic`
- `b671ec1` + `fbc3215` Task 10 — NEW `scripts/phase-19-0-migrate-appointment-types.mjs` (Option B uniform; --dry-run/--apply; audit doc; forensic-trail fields); polish: invocation guard + crypto-secure randHex
- `af0be21` Task 11 — Test bank batch: 9 new files, 69 new tests (A/T/F/D/G/C/M/F/P groups including Rule I full-flow)
- `b6b87a8` — adjacent test fix (phase15.7-bis effectiveRoom shape; Phase 18.0 evolution)
- `024f6dd` — migration script PEM-parse + artifacts-path fixes (surfaced during V15 #22 prod run)

### Deploy + migration
- **V15 #22** (combined): vercel `lover-clinic-omo4w9c5z-...` aliased to `lover-clinic-app.vercel.app`; firestore:rules idempotent re-publish (rules unchanged)
- **Pre-probe 6/6 PASS** + **Post-probe 6/6 PASS** (Rule B with corrected `artifacts/{APP_ID}/public/data/` prefix — Rule B docs need a Phase 19.0 follow-up to fix the simplified URL notation)
- **Migration `--apply`** ran on prod (audit `phase-19-0-migrate-appointment-types-1777987427963-c3e11db0`): 27/27 docs migrated (18 null + 9 'sales' → 'no-deposit-booking'). Idempotency verified (re-run 0 writes).
- HTTP smoke: / 200 · /admin 200

## Decisions (this session — one-line each)
- Phase 19.0 Q1 Option B Uniform (vs A smart-map, C backward-compat)
- Q3 lock: 15-min everywhere; canonical TIME_SLOTS; SLOT_H 36→18 keeps grid pixel-height equivalent
- Q4: default new-appt duration 15-min + auto-bump endTime when admin changes startTime (preserves admin-customized gap)
- Q6: per-type default colors (เขียว/ส้ม/น้ำเงิน/เหลือง อ่อน); admin-picked appointmentColor still wins
- Q7: types are descriptive labels only — no hard business-rule gates
- Q8: DepositPanel deposit→appt writes `'deposit-booking'`
- Q9: ProClinic dev-only translator: `'follow-up'` → `'followup'`; other 3 → `'sales'`
- DepositPanel useState + resetForm both use Phase-19.0 defaults (caught by spec reviewer)
- AppointmentFormModal radio row uses `flex-wrap` to avoid overflow at 4 items (caught by code-quality reviewer)
- Migration script: bare `be_appointments` path bug surfaced in prod (artifacts/{APP_ID}/public/data prefix needed; matched Phase 18.0 convention) → fixed live + committed `024f6dd`

## Lessons learned this cycle
- **Rule B probe URLs need `artifacts/{APP_ID}/public/data/` prefix** — the simplified path notation in `01-iron-clad.md` is misleading. Future-self: always use the full path. Consider updating Rule B doc.
- **Migration scripts must mirror Phase 18.0 conventions exactly** — both PEM-parse + artifacts-path were caught only at LIVE execution time, after V15 #22 deploy succeeded. The plan/script template should bake in the artifacts prefix + PEM `\n` conversion as defaults.
- **Code-quality reviewer caught real layout bug** (4-item radio overflow) and real cancel-reset bug (DepositPanel resetForm) — both spec compliant on paper but functionally regressive. Two-stage review (spec then quality) earned its keep.
- **Subagent-driven mode worked cleanly** — 14 tasks, ~10 reviewer dispatches, 0 source-correction loops. Sonnet for integration, Haiku for mechanical pure helpers.

## Next action
Idle. Phase 19.0 fully shipped + LIVE in prod.

## Outstanding user-triggered actions (deferred)
- Update Rule B docs in `.claude/rules/01-iron-clad.md` to clarify `artifacts/{APP_ID}/public/data/` prefix on probe URLs
- SaleTab field-name audit (same pattern as TFP post-Phase-17.2-septies)
- Full AppointmentTab roomId migration (deferred from Phase 18.0)
- LineSettings พระราม 3 per-branch redesign · Hard-gate Firebase claim · /audit-all readiness · 🚨 H-bis ProClinic strip pre-launch
