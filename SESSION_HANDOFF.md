# Session Handoff — LoverClinic OPD Cross-Session State

> **This file is read FIRST every new session.** Updated by `/session-end` skill.
> Link out to `.agents/sessions/*` for detail.

---

## Current State

- **Date last updated**: 2026-04-24 (end-of-session — Phase 12.2b marathon)
- **Branch**: `master`
- **Last commit**: `84f5b0d feat(phase12.2b): เลือกสินค้าตามจริง = two-step pick-at-purchase flow (not unbounded)`
- **Test count**: 3555 / 3555 passing (was 3306 at session start; **+249 this session**)
- **Build**: clean
- **Deploy state**:
  - **firestore:rules**: unchanged this session (last deploy 2026-04-24 with Probe-Deploy-Probe 200×4)
  - **Vercel prod**: `148fe0b` via `vercel --prod` — **24 commits BEHIND HEAD** (entire Phase 12.2b marathon awaiting deploy approval)
- **Production URL**: https://lover-clinic-app.vercel.app
- **Remote sync**: master = origin/master ✅

---

## What's Done (recent phases)

- ✅ **Phase 1-11.9** — base app + Master Data Suite (historical)
- ✅ **Phase 12.0-12.11** — Financial completeness + adapter bridge + Firebase Admin SDK (historical)
- ✅ **Phase 13.1-13.6** (2026-04-24 earlier) — Quotations, staff schedules, DF groups, DF payout report, tab-gate scaffolding, treatment validator
- ✅ **Phase 14 + 14.x** — DF modal Triangle + auto-populate + wallet/membership/medicine-label migrate (historical)
- ✅ **Phase 12.2b COMPLETE** (2026-04-24) — Course form ProClinic parity end-to-end:
  - Step 1-2: schema + CourseFormModal rewrite (prior session)
  - Step 3: syncCourses mapper full ProClinic parity (this session)
  - Step 5: DfEntryModal group-switch race + no-rate visibility
  - Step 6: ซื้อเพิ่ม courses under parent headers
  - Step 7: fill-later (เหมาตามจริง) qty flow + treatment-time validation
  - Course form: category + procedureType datalist dropdowns from be_courses
  - Stock config: reads be_products (sale/treatment actually deducts)
  - sub-item grid alignment + main product in beCourseToMasterShape
  - auto-populate treatment qty from saved course qty on tick
  - เหมาตามจริง ProClinic parity — display text + productId + consume-on-use
  - Late-visit tick flow for เหมาตามจริง
  - Bug batch (0-baht payment, productId stock carry, DF % baht display)
  - DF dup non-blocking + summary baht display + expired-tab semantics + purchase history details
  - Filter consumed courses from treatment form
  - DF Payout Report id/courseId fallback (฿0 across prod bug)
  - Partial-usage DF weighting (rate × full course price × usage weight)
  - 41-test comprehensive scenario file (tests/phase12.2b-scenarios.test.js)
  - เลือกสินค้าตามจริง two-step pick-at-purchase flow (PickProductsModal)

---

## What's Next

Pick one:

### A. Vercel deploy (most valuable)

24 commits ready. Tests 3555/3555 pass. Build clean. User authorization
required THIS turn: `vercel --prod --yes`.

### B. Late-visit support for เลือกสินค้าตามจริง (follow-up, ~1h)

Currently bought-but-unpicked courses don't survive treatment-page
close — `availableProducts` not persisted to `be_customers`.

Files (per checkpoint):
- `src/lib/backendClient.js:491` `assignCourseToCustomer` — when
  `masterCourse.courseType === 'เลือกสินค้าตามจริง'`, write ONE
  placeholder entry with `availableProducts` + `needsPickSelection: true`
  instead of per-product entries
- `src/components/TreatmentFormPage.jsx:572` `customerCoursesForForm` —
  detect `c.needsPickSelection` + `c.availableProducts` → emit
  placeholder-shape courseEntry
- `src/components/backend/CustomerDetailView.jsx` — "เลือกสินค้าเพื่อใช้"
  badge on CourseItemBar
- Tests: Scenario 21 end-to-end (assign → persist → late-visit restore → pick → save)

### C. Phase 15 Central Stock Conditional

Per `memory/project_execution_order.md`. Waits behind Phase 14.x finish.

---

## Outstanding User Actions (NOT auto-run)

- [ ] **Vercel re-deploy** — HEAD `84f5b0d` is 24 commits ahead of prod `148fe0b`. Awaiting explicit "deploy" authorization.
- [ ] **Manual UI verify** (end-to-end, user-side per `feedback_user_workstyle`):
  - Buy `เหมาตามจริง` → use in same treatment → stock decrements + course → history
  - Buy `เหมาตามจริง` → close without using → stays in active as "เหมาตามจริง" violet bar
  - Buy `เลือกสินค้าตามจริง` → click "เลือกสินค้า" → pick products + qtys → course shows picked sub-rows
  - 0-baht course save → payment UI hidden, save succeeds
  - DF % rate → summary card shows baht amount (not just %)
  - DF Payout Report → rows actually show non-zero ฿ (was ฿0 everywhere before `6e6dd00`)
  - Purchase history tab → shows item breakdown with course/promo/product/med colors
  - Customer's "คอร์สของฉัน" → consumed fill-later course hidden; "คอร์สหมดอายุ" date-expired only

---

## Blockers

None.

---

## Known Limitations / Technical Debt

- **Pick-at-treatment late-visit**: bought-but-unpicked courses lose the
  `availableProducts` list after treatment-form close. Next-session work
  per "What's Next · B". In-same-treatment pick + use works today.
- **Partial-pick**: picking a subset consumes all those picks; no reopen
  flow to add more later. Acceptable MVP.
- **`assignCourseToCustomer` for pick-at-treatment**: doesn't yet
  special-case courseType — relies on in-memory
  `options.customerCourses` + `resolvePickedCourseEntry` for the pick
  resolution. Only affects late-visit flow.

---

## Violations This Session

None. Rule A (bug-blast revert) exercised cleanly: `f7cb8a8` (limit-gated
design) → `967d7b2` (revert). No new V-entry needed — the revert
happened in-session before user acceptance, so the bad design never
reached production. The in-session design iteration was caught by user
feedback, exactly as Rule A is meant to handle.

---

## Resume Prompt

Paste this block into the next Claude session (or just invoke `/session-start`):

```
Resume LoverClinic OPD — continue from 2026-04-24 end-of-session.

Read in order BEFORE any tool call:
1. CLAUDE.md (stack + env + rule index)
2. SESSION_HANDOFF.md (this file, cross-session state of truth)
3. .agents/active.md (hot state — master=84f5b0d, 3555 tests)
4. .claude/rules/00-session-start.md (iron-clad A-H + F-bis + V1-V12)
5. .agents/sessions/2026-04-24-phase12.2b-marathon-pick-at-treatment.md (detail checkpoint)

Status summary:
- master = 84f5b0d, 3555/3555 tests pass, build clean, preview HMR green
- Production (Vercel): 148fe0b — 24 commits BEHIND HEAD (whole Phase 12.2b marathon awaiting deploy approval)
- firestore:rules: untouched this session
- Phase 12.2b COMPLETE end-to-end for all 4 ProClinic course types
- Last shipped: pick-at-treatment two-step flow (commit 84f5b0d)

Next action — pick one:
A. Deploy the 24 commits (user must say "deploy" THIS turn)
B. Wire late-visit support for pick-at-treatment courses
   (assignCourseToCustomer + customerCoursesForForm carry availableProducts
   through be_customers — see checkpoint section "Next action · B" for
   file:line breakdown)
C. Start Phase 15 Central Stock Conditional per project_execution_order.md

Rules to remember:
- No deploy without explicit THIS-turn authorization (V4/V7 repeat)
- Probe-Deploy-Probe 4 endpoints before any firestore:rules deploy (V1/V9)
- Rule A bug-blast revert worked cleanly this session (f7cb8a8 → 967d7b2)
- Every bug → test + rule + audit invariant (Rule D)

Invoke /session-start to boot context.
```

---

## How to use this file

- `/session-end` skill auto-updates it. If editing manually, keep under ~200 lines.
- Detail lives in `.agents/sessions/YYYY-MM-DD-*.md` checkpoints.
- Resume Prompt block is the KEY output — user pastes into new chat to boot.
- Committed to repo (not memory-only) → team-visible + cross-machine synced.
