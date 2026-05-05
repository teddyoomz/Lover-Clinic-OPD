---
updated_at: "2026-05-05 EOD — V15 #20 SHIPPED — AppointmentTab columns = master rooms ONLY (legacy localStorage cache dropped)"
status: "master=bdd917e · prod=bdd917e (V15 #20, LIVE) · 0 commits ahead-of-prod · 5394 tests pass"
current_focus: "V15 #20 LIVE. AppointmentTab columns now show only master rooms per branch (+ ไม่ระบุห้อง for orphan appts)."
branch: "master"
last_commit: "bdd917e"
tests: 5394
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "bdd917e"
firestore_rules_version: 26
storage_rules_version: 2
---

# Active Context

## State
- master = `bdd917e` = LIVE in prod (V15 #20 deployed 2026-05-05)
- 5394/5394 tests pass · build clean · firestore.rules v26 (idempotent re-deploy)

## V15 #20 deploy (2026-05-05) — AppointmentTab follow-up fix
User report after V15 #19 deploy: legacy localStorage cache strings
("Dr.Chaiyaporn", "นักกายภาพ", "นักกายภาพA x", "ห้อง 1", "ห้องผ่าตัด")
were rendering as column headers in AppointmentTab BOTH branches —
nonsense at พระราม 3 (which has 0 master rooms). Phase 18.0 contract
violated by Task 7's "minimal patch" preserving allKnownRooms.

Fix (commit `bdd917e`):
- Drop allKnownRooms state + setAllKnownRooms useEffect entirely
- One-time legacy cache cleanup on AppointmentTab mount: localStorage.removeItem('appt-rooms-seen')
- effectiveRoom() resolves strictly against branch master → orphan
  legacy roomName values route to ไม่ระบุห้อง column
- rooms useMemo: column set = master rooms (sorted) + virtual ไม่ระบุห้อง
  iff any orphan appt

Deploy: 6/6 pre + 6/6 post probes ✓; cleanup 4/4 ✓; HTTP smoke ✓;
be_exam_rooms unauth POST → 403 (rule active) ✓.

## V15 #19 deploy (2026-05-05)
- Pre-probe Rule B: 6/6 endpoints 200 ✓ (chat_conversations + pc_appointments + clinic_settings × 2 + V23 anon opd_sessions CREATE+PATCH)
- `firebase deploy --only firestore:rules`: released cleanly (rules version bumped to v26 — adds be_exam_rooms match block)
- `vercel --prod --yes`: built in 45s, aliased to `lover-clinic-app.vercel.app`. Deployment URL `lover-clinic-mulqskcf0-...vercel.app`
- Post-probe Rule B: 6/6 endpoints 200 ✓ (no regression)
- Cleanup: pc_appointments 2/2 + clinic_settings strip 2/2 = 4/4 ✓; chat_conversations + opd_sessions probes hidden via V27 isArchived=true (admin cleanup later)
- HTTP smoke: / 200 · /admin 200 · /api/webhook/line 401 (LINE sig expected)
- **Phase 18.0 rule verified**: `be_exam_rooms` unauth POST → 403 (rule shipped + working — isClinicStaff() gate active)

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
Awaits explicit user authorization to run migration script:
  `node scripts/phase-18-0-seed-exam-rooms.mjs --dry-run` (preview first)
  → review counts → `--apply` to seed นครราชสีมา with 3 rooms + backfill matched appts.

## Outstanding user-triggered actions
- **Phase 18.0 migration --apply** — admin-only, awaits user authorization. Will seed นครราชสีมา with 3 rooms (ห้องแพทย์/ห้องผ่าตัด · ห้องช็อคเวฟ · ห้องดริป) + backfill matched appt roomIds
- **Browser smoke** in user's actual prod browser: ExamRoomsTab navigable + AppointmentTab columns + TFP branch banner visible
- **Phase 18.0 follow-ups** (deferred): full AppointmentTab roomId migration (openCreate handlers + occupied detection + apptMap keying), audit other backend tabs for legacy field-name reads (SaleTab buy modal, treatmentBilling.js)
- LineSettings พระราม 3 admin entry · Hard-gate Firebase claim · /audit-all readiness pass
