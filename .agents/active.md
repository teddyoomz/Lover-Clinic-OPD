---
updated_at: "2026-05-05 EOD — Phase 17.2 trilogy + quinquies/sexies/septies/octies + Phase 18.0 (Branch Exam Rooms) shipped to master; V15 #19+ pending"
status: "master=c5609c9 · prod=24aa9e9 (V15 #18, LEAKING) · 18 commits ahead-of-prod · 5394 tests pass"
current_focus: "Phase 18.0 (Branch Exam Rooms) DONE. Awaits explicit deploy + migration script --apply for นครราชสีมา seed."
branch: "master"
last_commit: "c5609c9"
tests: 5394
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "24aa9e9"
firestore_rules_version: 25
storage_rules_version: 2
---

# Active Context

## State
- master = `c5609c9` = 18 commits ahead-of-prod
- 5394/5394 tests pass · build clean · firestore.rules has NEW be_exam_rooms match block (rules version bump pending deploy)

## What this session shipped
- **Phase 17.2-quinquies** (`c76e953`): TFP modal data caches leak across branches — drop length>0 short-circuits + extend BS-9 to buyItems/buyCategories + add SELECTED_BRANCH_ID to form-data deps
- **Phase 17.2-sexies** (`73771d9`): internal-leak audit — 3 backendClient fixes (`_resolveProductIdByName` accepts branchId, `findProductGroupByName` accepts opts.branchId, `saveBankAccount` isDefault mutex scoped) + 2 cross-tier annotations
- **Phase 17.2-septies** (`9046dcf`): TFP reader field-name fix (productType/productName/categoryName/mainUnitName productType-first fallback chain) + branch indicator banner at TFP top
- **Phase 17.2-octies** (`c248c67`): isCourseUsableInTreatment shape-aware (GROUPED + FLAT shapes); 71 tests covering 4 course types × 2 shapes × cross-branch course-use contract
- **Phase 18.0 Tasks 1-10** (`c08fc14` → `c5609c9`): Branch Exam Rooms feature — branch-scoped CRUD master, AppointmentFormModal + AppointmentTab + DepositPanel integration, migration script with --dry-run/--apply, 89 new Phase 18.0 tests + 5 stale rebases

## Decisions (this session)
- All Phase 17.2-x fixes routed through scopedDataLayer auto-inject (BS-9 compliant)
- Phase 17.2-octies: helper accepts grouped shape; flat-shape preserved for backward compat; zero-total parity check added
- Phase 18.0 followed approved plan (`docs/superpowers/plans/2026-05-05-phase-18-0-branch-exam-rooms.md` `2b106c3`); spec at `docs/superpowers/specs/2026-05-05-branch-exam-rooms-design.md` `3cba005`
- Phase 18.0 Task 7 minimal patch: AppointmentTab keeps roomName-string-based grid; just adds branch's master rooms to column set so empty rooms render. Full roomId migration deferred to follow-up.
- Phase 18.0 Task 4 fixup: ExamRoomsTab delete dialog drops the count (no listAppointments lister exists yet) but keeps the auto-routing warning.

## Next action
Awaits explicit user "deploy" → V15 #19+ ships all 17.2-quinquies/sexies/septies/octies + Phase 18.0 commits (18 total).

After deploy, awaits explicit user authorization to run migration script:
  `node scripts/phase-18-0-seed-exam-rooms.mjs --dry-run` (preview first)
  → review counts → `--apply` to seed นครราชสีมา with 3 rooms + backfill matched appts.

## Outstanding user-triggered actions
- 🚨 **Deploy V15 #19+** — combined vercel + firestore:rules + Probe-Deploy-Probe (Rule B). Bundles 18 commits ahead-of-prod
- **Browser smoke verify** post-deploy: TFP modals + Promotion/Coupon/Voucher + AppointmentTab TodaysDoctorsPanel + ExamRoomsTab
- **Phase 18.0 migration --apply** — admin-only, awaits user authorization
- **Phase 18.0 follow-ups** (deferred): full AppointmentTab roomId migration (openCreate handlers + occupied detection + apptMap keying), audit other backend tabs for legacy field-name reads (SaleTab buy modal, treatmentBilling.js)
- LineSettings พระราม 3 admin entry · Hard-gate Firebase claim · /audit-all readiness pass
