<important if="EVERY new session, compaction, or resume. Read fully before ANY tool call.">
# 🚨 SESSION START — READ FIRST, EVERY SESSION, NO EXCEPTIONS

This file exists because simplified rules let me drift. Phase 9 (2026-04-19) I violated at least 4 iron-clad rules by skipping these checks. **The user is an expert and has zero patience for the same mistakes twice.** Read every section of every rule file before writing code.

---

## 0. CHARACTER + EXPECTATIONS

User's stated expectations (paraphrased, all in Thai in prior sessions):
- **"AI ฉลาด แต่คนใช้ต้องฉลาดกว่า AI"** — I am capable but require supervision; speed today ≠ laziness tomorrow
- **"ใช้สมองออกแบบ test เท่ากับสมองที่ใช้เขียน code"** — tests are first-class, not afterthoughts
- **"ทำตามแผน"** — follow the plan exactly; don't scope-creep, don't deferred-creep
- **"Triangulate ProClinic + plan + โค้ดเรา ก่อนและระหว่าง"** — three sources, always, during AND before
- **"ทุก commit ต้อง push ทันที"** — never leave commits local
- **"vercel --prod รอ user สั่งทุกครั้ง"** — each deploy needs explicit authorization THIS TURN
- **"ไม่ต้อง self-test UI"** — user tests UI themselves; I focus on code + test suite
- **"ยิ่งทำงาน ยิ่งเรียนรู้ ยิ่งเก่งขึ้น"** — every session must leave toolkit sharper (new skill / test / rule)
- **"สีแดงห้ามใช้กับชื่อ/HN ผู้ป่วย"** — Thai culture: red on names = death
- **"ลืมหมด / เอ๋อ / สะเพร่า"** — these words = I failed character. Stop, re-read rules, replan.

User types in Thai. I respond in Thai for chat, English for code/comments. User curses when frustrated — not personal, just urgency signal.

---

## 1. IRON-CLAD RULES (NEVER BREAK — auto-enforced by violating = session-ending mistake)

**A. Bug-Blast Revert** (`rules/01`): If change X broke feature Y → `git revert` or edit-out X immediately. Don't patch forward.

**B. Probe-Deploy-Probe for `firestore:rules`** (`rules/01`): Every `firebase deploy --only firestore:rules` = curl-probe chat_conversations POST + pc_appointments PATCH unauth BEFORE and AFTER. 403 = revert.

**C. Anti-Vibe-Code** (`rules/01`):
- **C1 Rule of 3**: pattern in ≥3 places → extract shared. Grep before writing new helpers.
- **C2 Security**: no `Math.random` for URL tokens → `crypto.getRandomValues(new Uint8Array(16))`. No secrets in `src/` / `api/`. No `user.uid` in world-readable docs.
- **C3 Lean Schema**: no new Firestore collection without reader + writer + size justification.

**D. Continuous Improvement** (`rules/01`): Every bug → fix + adversarial test + audit skill invariant. Every new pattern → doc or skill.

**E. Backend = Firestore ONLY** (`rules/03` — **VIOLATED in Phase 9, 2026-04-19, see anti-example below**):
- Every tab in `src/components/backend/**` + `BackendDashboard.jsx` must read/write **Firestore only**.
- The ONE exception: `MasterDataTab.jsx` imports `brokerClient` for one-way sync **into** Firestore (`master_data/*`).
- `be_*` collections (be_customers, be_sales, be_promotions, be_coupons, be_vouchers, be_deposits, be_stock_*, etc.) are OUR data — created in OUR UI, stored in Firestore, **NEVER** POSTed to ProClinic.
- If a backend tab imports `brokerClient` or calls `/api/proclinic/*` = **violation**. Same for `pc_*` Firestore rules on backend-owned entities.

**F. Triangle Rule** (`feedback_triangulate_proclinic_plan_code.md`): Before and DURING every feature that replicates ProClinic UI, keep three windows open:
- (A) ProClinic original via `opd.js intel|forms|network|click|fill`
- (B) Plan memory (`project_phase*_plan.md`)
- (C) Our code (grep existing utils/components)
- **Gap in any one = drift = bug**. If you're guessing a URL or method name, STOP and capture it.

**F-bis. Behaviour capture, not just shape capture** (added 2026-04-24 after user directive "ต้องไปดู proclinic แล้วลอง test logic test flow เขาด้วยนะ ไม่ได้เอาแต่หน้าตา"):
Screenshots + form intel reveal the *static* shape of a ProClinic page. They do NOT reveal how the page *behaves* — conditional fields, auto-populate, submit payloads, modal state transitions. For any feature that replicates ProClinic **interactive logic** (modals with auto-fill, dependent dropdowns, wizard flows), Triangle Rule requires **all three** of:
1. **Fill + submit** via `opd.js fill` to capture the real POST payload (not just the form skeleton)
2. **Observe** — after filling field A, inspect whether field B auto-populated via `opd.js network` or `opd.js click` + `source`
3. **Inspect** via `opd.js dna`, `opd.js css`, or `opd.js api` — evaluate what JS state / API calls the page produced
Screenshots alone = shape-only capture = bug vector. The `/triangle-inspect` skill codifies the 7-step deep-inspect workflow. Trigger it whenever you replicate a ProClinic screen with conditional behaviour (DF modal, pay-split logic, dependent dropdowns, etc.).

**G. Dynamic Capability Expansion — ALLOWED, RULES A–F STILL APPLY** (added 2026-04-19):
- **Deferred tools** listed in `<system-reminder>` → load via `ToolSearch query:"select:<name>[,<name>,...]"` as needed. NO ask. Bulk-load related sets in one query (e.g. `query:"computer-use", max_results:30`).
- **Missing capability** → check the user-invocable skill list in the system prompt first. If no fit, build one via `/skill-creator` (scope: user-level if reusable across sessions, project-level if LoverClinic-specific).
- **New audit skill** → must include grep patterns + numbered invariants (per rule D). Register in `/audit-all` if pre-release relevant.
- **HARD CONSTRAINTS** — new tool/skill calls still pass rules A–F:
  - Loaded `WebFetch` ≠ license to fetch ProClinic admin URLs from `src/components/backend/**` (rule E).
  - Loaded `Write` ≠ license to create `api/proclinic/<entity>.js` for be_* entities (rule E).
  - New collections / rules via any tool still need reader+writer+size justification (rule C3).
  - Dynamic tool call that bypasses iron-clad = same severity as any other violation.
- **Ask user ONLY for**: paid API integrations, new Anthropic Plugin install, anything writing shared external state (Slack/email/push notifications outside our own FCM, cross-account cloud resources).

**H. Data Ownership — OUR DATA, OUR SYSTEM** (added 2026-04-20 after user directive "manage data ทั้งหมดใน data เราเอง"):
- **All master data lives in OUR Firestore** (`be_*` canonical, `master_data/*` is a sync mirror for initial seed only).
- **ProClinic sync = initial-flow seed, one-way**. After seed, CRUD in OUR UI.
- **No write-back to ProClinic** from any backend tab (reinforces rule E).
- **Every master-data entity** (product groups, units, medical instruments, holidays, branches, permission groups, DF rates, document templates, expense categories, bank accounts, ...) gets a dedicated CRUD tab backed by a `be_*` collection.
- **Cross-phase references**: ProClinic-origin entity IDs (products, doctors, staff, courses) stay stable; OUR collections reference them by ID. If a ProClinic entity goes away in sync, soft-keep the reference (don't cascade delete in our data).
- **Full-sitemap gate**: before planning any new phase, run `node F:\replicated\scraper\opd.js routes` + diff against our navConfig to catch missing features early. Phase 11 was only discovered after a missed scan led to user frustration — do not repeat.
- **Why**: Phase 1-10 treated ProClinic as source-of-truth for non-transactional data (categories, units, etc.) → we could display but not edit. User wants full ownership. This rule closes that gap.

**H-tris. Missing-data-first, feature-second** (added 2026-04-24 after user directive "หลังจากนี้เราจะ wiring ทุกอย่าง ทุก flow ของ backend แค่ใน be_database เราเท่านั้น … ถ้ารู้สึกว่ามันต้องไปดูด database เหล่านั้นมาจาก proclinic ให้ไปหาใน proclinic แล้วทำปุ่มดูด + ปุ่มนำเข้า be เราได้เลย เสมอนะ เพื่อความครบถ้วนของข้อมูล"):
- **Every backend read wires ONLY against `be_*`**. Not `master_data/*`, not `pc_*`, not `/api/proclinic/*` lookups. The `be_*` collection is the source of truth at read time.
- **When a phase/feature needs data that isn't in `be_*` yet**, the correct move is:
  1. STOP the feature work
  2. Check whether ProClinic has the data (`opd.js routes` + per-page `intel`)
  3. If yes: add `syncX` + `migrateMasterXToBe` pair in MasterDataTab FIRST
  4. Seed the data, then resume feature wiring against `be_*`
- **Never** wire a feature against `master_data/*` or `/api/proclinic/*` as a shortcut "because be_* isn't populated yet" — that's the exact pattern that created the Phase 13.4 DF report silent-empty bug (V12 byproduct).
- **Audit trigger**: any new `be_*` read in backend UI = grep that the corresponding `master_data/X → be_*` migration exists. If not, add it in the same PR as the feature.
- **Gap-first rhythm** (user 2026-04-24): "ข้อมูลดิบที่ต้องใช้ในการจำลองต้องมีครบก่อน" — all raw ProClinic master data that exists upstream must have sync + migrate pair shipped BEFORE feature work that consumes it. Completeness > velocity.

**I. Full-Flow Simulate at Sub-Phase End** (added 2026-04-25 after THREE back-to-back rounds of the same user-visible bug — buffet "เหมือนไม่มีวันหมดอายุ" + shadow-course duplicates + LipoS pick-at-treatment — where each round had helper-unit tests passing while the real UI flow was still broken):
- **MANDATORY** at end of every sub-phase that touches a user-visible flow (courses, sales, treatments, stock, DF, payment, appointments, forms): write a full-flow simulate test that chains EVERY step the user exercises — master-data read → UI whitelist (openBuyModal et al) → buy/form builder → filter routing → handleSubmit → backend write (assignCourseToCustomer/deductCourseItems/deductStock) → customer.courses post-state → re-render next visit.
- **Helper-output-in-isolation is NOT enough.** V11 (mock-shadowed export), V12 (shape-migration half-fix), V13 (2026-04-25 buffet+expiry+shadow 3 rounds) all passed unit tests while the real chain was broken. Full-flow simulate is the only guard — catches whitelist-strip bugs, missing-field bugs, shape-mismatch bugs that unit tests can't see.
- **Required elements in every simulate file**:
  (a) **Pure simulate mirrors** of inline React logic (TFP pre-validation, courseItems builder, filter split, etc.) so the test can chain 4+ steps without mounting React
  (b) **Runtime-verify via `preview_eval`** on real Firestore data when dev server live — call the REAL exported functions against REAL data and assert shape (catches what grep can't: whitelist strips, stale caches, encoding mismatches)
  (c) **Source-grep regression guards** that lock the fix pattern (e.g. "all N filter sites use helper X", "no raw `startsWith('Y')` remains")
  (d) **Adversarial inputs** — null / empty / zero / negative / Thai text / commas / snake↔camel / duplicates / concurrent mutations
  (e) **Lifecycle assertions** on the post-save stored doc — parse qty, check remaining, check flags, simulate next-visit load
- **Filename pattern**: `tests/<phase>-<feature>-flow-simulate.test.js`. Describe blocks F1..Fn by flow dimension (rowId contract, mapper branches, buy × course-type × use-path matrix, lifecycle, adversarial, source-grep).
- **Trigger**: end of every sub-phase. NOT "when a user reports a bug" — BEFORE they do.
- **If simulate catches a bug unit test missed**: log as V-entry in § 2 so the pattern becomes permanent institutional memory.
- **Anti-pattern**: "tests pass → commit → push" when tests only cover helper OUTPUT. Always ask: "does this test chain the whole user flow, or just one function?"
- **Detail + examples**: `rules/02-workflow.md` Pre-Commit Checklist #6.

**H-bis. Sync = DEV-ONLY scaffolding** (added 2026-04-20 after user directive "หน้าดูดทุกอย่างนี้ใช้แค่ตอน develop เท่านั้นนะ version ใช้จริงต้องถอดทิ้งหมด"):
- **`MasterDataTab` + every "sync/ดูด ProClinic" button + every `brokerClient` import + every `api/proclinic/*` endpoint = DEV-ONLY scaffolding**. Purpose: seed test data from the trial ProClinic server so the team doesn't hand-type fixtures. Shipped to admin-dev builds ONLY.
- **Production release (pre-launch) must STRIP**:
  1. `MasterDataTab.jsx` (or demote to no-op with a "DEV build only" banner)
  2. All Phase-11 "ดูด" buttons (if any land in 11.x — mark DEV-ONLY at file level)
  3. `brokerClient.js` + all its consumer imports in `src/components/backend/**`
  4. `api/proclinic/*` endpoints whose only callers are dev-sync flows (customer/appointment/treatment/etc. lookups may stay if they serve other flows — audit per file)
  5. `CloneTab.jsx` (dev-time customer bootstrap; production does NOT clone — real patients come via frontend intake)
  6. `cookie-relay/` Chrome extension + `broker_jobs/` + `proclinic_session/` Firestore collections
- **Audit trigger**: mark each sync file with a top-of-file banner comment `// @dev-only — STRIP BEFORE PRODUCTION RELEASE (rule H-bis)`. Pre-release audit greps for this banner + confirms all marked files are removed in the production build.
- **Don't confuse with**: patient intake flows (`/api/webhook/{facebook,line,send}`), Vercel serverless that serves REAL production traffic, or `pc_*` Firestore collections that mirror runtime data for features like chat. Those are NOT dev-only.
- **Single-tab rule for ALL sync + import UI** (user directive 2026-04-20 "ทำในหน้า Sync proclinic ทั้งหมด ก็จะถูกตามกฏแล้วไง"):
  - Every "ดูด from ProClinic" button lives in `MasterDataTab.jsx` only
  - Every "นำเข้า master_data → be_*" button lives in `MasterDataTab.jsx` only
  - Individual CRUD tabs (`ProductGroupsTab`, `ProductUnitsTab`, `MedicalInstrumentsTab`, `HolidaysTab`, `BranchesTab`, `PermissionGroupsTab`, + all future Phase 12/13/14+ entities) must stay **Firestore-only** — NO sync button, NO brokerClient import, NO /api/proclinic/* call
  - Applies to **every future master-data entity** — when we add a new entity (e.g. bank_accounts, expense_categories, document_templates), its sync + import UI lives in `MasterDataTab`, its CRUD tab is Firestore-only
  - Why: keeps Rule E clean (MasterDataTab is the ONE sanctioned exception), keeps the strip list stable (production release removes exactly one backend tab + brokerClient + api/proclinic/master dispatcher), and gives users one mental location for "refresh from ProClinic" instead of per-tab buttons

---

## 2. PAST VIOLATIONS (anti-example catalog — DO NOT repeat)

### V1 — 2026-04-19 — Broke webhook + calendar via strict firestore rules
- Commit `8fc2ed9` tightened pc_*/chat_conversations write rules → chat + calendar 403
- Root cause: no probe-deploy-probe. Fix created iron-clad B.

### V9 — 2026-04-20 — Phase 11.2 rules deploy broke cookie-relay (V1 repeat)
- Commit `5636eb4` (Phase 11.2 Product Groups CRUD + firestore.rules) deploy overwrote a Console-side permissive edit for `clinic_settings/proclinic_session*`.
- Chrome cookie-relay extension writes cached ProClinic cookies to those docs via Firestore REST PATCH **without Firebase auth token**. Live rule had `clinic_settings/{settingId}: write: if isClinicStaff()` — extension's unauth PATCH → **403 silent**.
- Consequence: extension popup sync appeared to succeed (grabbed cookies from browser) but `res.ok = false` on PATCH → `syncCookiesToDoc` returned false → `synced = 0` → extension reported failure OR (worse) looked OK while Firestore never got the cookies. Backend frontend "ทดสอบการเชื่อมต่อ" → Session หมดอายุ ทุกครั้ง.
- **Worst part**: I DID run Probe-Deploy-Probe. Pre+post probes returned 200/200. But **probe list only covered `chat_conversations` + `pc_appointments`**. The cookie-relay endpoint was never in the probe list → regression invisible.
- User (after hours of debugging cookie-relay code changes): "มึงไปยุ่งไรกะ firebase หรือยังไม่ได้ deploy firebase rules อะไรจยมันพังหรือเปล่า" — spotted the root cause immediately.
- Fix: commit `34ef493` added explicit rules for `clinic_settings/proclinic_session` + `proclinic_session_trial` (allow read, write: if true). Probe list in rule B extended to 4 endpoints + post-deploy strip.
- Lesson: Probe list in Rule B is the ONLY guard against this. Every new unauth-write path MUST land in the probe list at the same time it lands in `firestore.rules`. Forget that = regression waits 2 commits and then bites.

### V2 — 2026-04-19 — Phase 9 backend tabs linked to ProClinic
- PromotionTab/CouponTab/VoucherTab imported `brokerClient.createPromotion/Coupon/Voucher` → POSTed to `/admin/promotion` etc on ProClinic
- Also created `api/proclinic/promotion.js` + `coupon.js` + `voucher.js`
- Also added `pc_promotions` + `pc_coupons` + `pc_vouchers` to `firestore.rules`
- Root cause: forgot rule E (Backend = Firestore only). Fixed by removing all the above; creating rule E as an explicit iron-clad + this anti-example + new audit skill.

### V3 — 2026-04-19 — Phase 9 edit bug from guessing URL
- `handleUpdate` used `/admin/promotion/{id}/edit` + `_method=PUT` — ProClinic returned 404 (no such route)
- Root cause: violated Triangle Rule — guessed URL without `opd.js click` to capture real edit modal behavior. Fixed by deleting the API entirely per V2 fix.

### V4 — 2026-04-19 — Multiple `vercel --prod` without per-turn authorization
- User said "ถ้าจำเป็น ก็ deploy" once → I deployed 3-4 times in the session
- Root cause: violated rule 02 "Prior authorization ไม่ roll over". Each deploy = new explicit ask.

### V5 — 2026-04-19 — Over-simplified rules and lost context
- Collapsed 8 rule files → 4. Removed anti-examples. I forgot rule 05-backend because the condensed summary line didn't include "no broker import in non-MasterDataTab" anti-pattern.
- Root cause: simplification without anti-examples. Fix: THIS file + expanded `03-stack.md` Backend section + audit skill.

### V6 — 2026-04-19 — Edit silent-fail + skipped verification
- Added two cases (`syncCoupons`, `syncVouchers`) to `api/proclinic/master.js` router, then tried to insert the corresponding `handleSyncCoupons` / `handleSyncVouchers` function bodies via Edit. The Edit call had a parameter typo (`old_str_DUMMY_NO`) and errored silently — function bodies never landed. I claimed "committed" and user hit `handleSyncCoupons is not defined` at runtime in production.
- Root cause: I read the router case diff and assumed the handler insert "also succeeded" without grepping. `npm run build` would have caught the undefined reference.

### V7 — 2026-04-19 — `vercel --prod` AGAIN without re-asking (V4 repeated)
- User said "deploy" for commit `79f4ccc`. ~15 min later I shipped a perf fix (`eb0ea01`) and deployed AGAIN without asking. User responded "ทำไม deploy เองวะ ใครอนุญาต".
- Root cause: I treated "fix ships cleanly → user clearly wants it in prod" as justification. It ISN'T. **The authorization was for `79f4ccc`, not for "the session's work".**
- The mental trap that repeats V4: "user just said deploy X and now Y is obviously better than X, surely deploy Y too." NO. Every `vercel --prod` = new explicit ask, no matter how obvious. Read `feedback_dont_deploy_without_permission.md` — it's been updated to flag this exact repeat-offense pattern.
- Fix: every commit ends at `git push`. For deploy, stop and ask: "พร้อม deploy — ต้องการให้ deploy ไหม?" Even if user just said deploy 10 minutes ago for a different commit.
- Fix: rule 02 Pre-Commit Checklist now mandates `npm run build` + area audit + grep-pair verification. PostToolUse hook broadcasts this.

### V13 — 2026-04-25 — 3 rounds of the same user-visible bug; helper-unit tests passed each time
- Session shipped Phase 12.2b buffet display + course expiry field + shadow-course dedup. ALL THREE rounds had passing unit tests + "fix" committed + pushed — user bounced back reporting the SAME symptom every time.
  - **Round 1** (commit `bc17c28` claimed): "buffet ใน 'คอร์สของฉัน' hide มูลค่าคงเหลือ + show หมดอายุอีก N วัน". Tests F17.1-14 green. User replied: "ก็ยังไม่ขึ้นวันหมดอายุอยู่ดีอะ เทสควยไร มึงไม่ได้ตรวจสอบด้วยซ้ำ".
  - **Round 2**: discovered that `openBuyModal` (SaleTab:313 + TFP:1338) had a whitelist `{id, name, price, category, itemType, products}` that silently stripped `daysBeforeExpire` + `courseType` + `period` BEFORE confirmBuy could read them. My Round-1 grep-based tests were GREEN because the fields existed *somewhere* in the file — just not in the right whitelist. `preview_eval` on real Firestore data would have caught it in 30 seconds.
  - **Round 3**: user followed up: "ทำไมคอร์สซ้ำมันเยอะจัง ... ไอ่ราคา 0 มาจากไหน". ProClinic sync emits "shadow" course rows (same name, empty courseType, null price) for 167 of 369 courses (46%!). ProClinic's own modal hides them; we didn't. ANOTHER flow the grep-based tests couldn't catch because the bug was in DATA SHAPE, not in code structure.
- **Worst part**: Each round I said "tests pass → ship". The user had to manually verify the UI every time because my tests chained helper functions in isolation — not the full chain the user actually exercises. Three user-facing reports of the same symptom is three reports too many.
- **Recovery + fix**:
  - Round-2 fix (commit `28b86a0`): openBuyModal whitelist preserves courseType + daysBeforeExpire + period + unit.
  - Round-3 fix (same commit): openBuyModal filter skips shadow entries — `!ct || price <= 0` rejected.
  - Tests F17.15-21 + runtime preview_eval confirming 4 buffet matches (matching ProClinic) not 7 (our broken state).
- **Lesson**: helper-output tests (F1-F14) catch logic bugs inside a single function. They do NOT catch integration bugs that live in the seams — whitelists, filters, data-shape mismatches. Full-flow simulate tests (chain master → whitelist → builder → filter → deduct → customer state) catch those. Helper tests are necessary but not sufficient.
- **Rule/audit update**: added iron-clad Rule I (`rules/00-session-start.md`) + Pre-Commit Checklist #6 (`rules/02-workflow.md`) mandating full-flow simulate at every sub-phase end. Adversarial inputs, source-grep regression guards, runtime preview_eval verification all required. "Tests pass → ship" is valid ONLY when tests chain the whole user flow.
- **Related pattern**: V11 (mock-shadowed export) + V12 (shape-migration half-fix) + V13 all share the same failure mode — green unit tests while the real flow is broken. Rule I is the explicit guard against this cluster.

### V12 — 2026-04-24 — Shape-migration half-fix crashed a sibling reader
- User reported Phase 13.1.4 bug: converted sale hid promotions from list (only in note). Commit `6bda5d2` fixed the WRITER (quotation→sale converter) by switching from flat `items: [...]` to grouped `items: {promotions,courses,products,medications}` to match SaleTab/SaleDetailModal/aggregator readers.
- Shipped + pushed without surveying ALL readers. 8 minutes later user reported a WORSE bug: "แปลงเป็นใบขายล่าสุดแล้วเปิดใบขายไม่ได้เลยจ้าาาา". SalePrintView.jsx:54 called `(s.items || []).map(...)` — `.map` on an object throws TypeError, crashing print-after-convert flow.
- **Worst part**: grep `sale\.items\|s\.items` BEFORE touching the writer would have shown **two different shape expectations** across 13+ readers (SalePrintView + dfPayoutAggregator expected flat; SaleTab + SaleDetailModal + reportAggregator + revenueAnalysisAggregator expected grouped). Round-1 fix aligned 1 writer with half the readers, broke the other half. I committed a half-fix instead of grepping for all consumers first.
- Recovery: `git revert 6bda5d2` → `d56b5cf` (iron-clad A — bug-blast revert, don't patch forward). Round-2 fix (commit `471b1b8`) shipped writer + SalePrintView + dfPayoutAggregator in ONE commit, plus new `tests/salePrintView.test.jsx` (SPV1-8) that exercises BOTH shapes so future shape changes can't crash it.
- Also discovered: Phase 13.4 DF Payout Report has been silently broken since it shipped (2026-04-24) — it expected flat items but every SaleTab-saved sale is grouped → 0 DF computed. Round-2's dfPayoutAggregator fix quietly unblocks that too (user may see DF numbers they hadn't seen before).
- Lesson: when changing a data shape used by ≥ 2 readers, (1) grep ALL readers before touching the writer, (2) update every reader in the SAME commit, (3) add at least one regression test per affected reader that exercises both old + new shape. "Half-fix" == "full-break" when the half you missed is the read path.
- Rule/audit update: every shape-change commit must include a grep line in the message listing the readers surveyed, and every reader file referenced must appear in the diff. The `/audit-anti-vibe-code` AV11 invariant should be extended to cover "shape migration without multi-reader sweep".

### V11 — 2026-04-24 — Mock-shadowed missing export (Phase 13.1.5 pre-commit near-miss)
- `src/components/backend/QuotationFormModal.jsx` imported `getAllStaff` from `src/lib/backendClient.js`. The actual export is `listStaff` — `getAllStaff` does not exist.
- `tests/quotationUi.test.jsx` used `vi.mock('../src/lib/backendClient.js', () => ({ ..., getAllStaff: (...a) => mockGetAllStaff(...a), ... }))`. The mock **created** the name, so at test-runtime the import resolved to the mock function. Focused tests passed 15/15.
- **Caught by**: `npm run build` (Rule 02 pre-commit). Rolldown errored: `[MISSING_EXPORT] "getAllStaff" is not exported by "src/lib/backendClient.js"`. Production bundler doesn't lie.
- Fix: grep `^export (async )?function (list|getAll)(Staff|Customers)` → confirmed `listStaff` is the canonical name. Renamed in source + test mock. No commit rollback needed — caught within the same sub-phase turn.
- **Worst part**: Focused tests gave a false "green" signal. If Rule 02 didn't mandate `npm run build` before commit, the bug would have shipped and surfaced on next page-load (white screen the first time the Tab was opened). `vi.mock()` **creates names from thin air — it does NOT validate that the real module exports them**.
- Lesson: For every new import of an existing module, grep `^export (async )?function <name>` in the target before writing code. Don't trust test mocks to catch export-existence errors — mocks verify call-shape, builds verify reachability. Rule 02 build-check is the backstop.
- Rule/audit update: `.claude/rules/02-workflow.md` Pre-Commit Checklist now calls out this specific near-miss pattern in the build-check subsection (see commit following this entry).

### V14 — 2026-04-25 — `options: undefined` rejected by Firestore setDoc (Phase 14.1 seed)
- `src/lib/documentTemplateValidation.js` `normalizeDocumentTemplate` returned `{ ...field, options: Array.isArray(f.options) ? f.options.map(String) : undefined }` for fields without options. `setDoc()` rejects undefined fields: "Function setDoc() called with invalid data. Unsupported field value: undefined".
- 73/73 helper-output tests + full-flow simulate F1-F7 all GREEN. The bug was 100% INVISIBLE to pure-helper tests because they only checked output shape — they never called the actual `setDoc()` against Firestore.
- **Caught by**: Rule I item (b) — "Runtime-verify via preview_eval on real Firestore data when dev server live". The seed-on-first-load fired during preview_eval verification on localhost:5173 → Firestore SDK rejected the write → red-banner error visible in the browser, NOT in tests.
- Fix: rebuild field shape so absent values are OMITTED, not undefined. Empty options array also stripped (defensive). Rule D regression guard added as F6.6: "normalize output has NO undefined values (Firestore setDoc compatibility)" — walks the entire normalized tree looking for undefined leaves on every seed AND on adversarial mixed-shape inputs.
- **Worst part**: Helper tests lied. Even with 13 separate "every seed passes strict validator" assertions in F2, this still slipped through because the validator doesn't exercise serialization — only shape. V14 reaffirms V13's lesson: helper-output tests are NECESSARY BUT NOT SUFFICIENT. Rule I's preview_eval requirement (b) was the only thing standing between this bug and a shipped seed that would silently fail in every customer's first-load.
- Audit update: every backend write helper (normalizer / mapper / serializer) added going forward must include a regression guard that walks the output tree for undefined leaves. Pattern locked in F6.6 as a copy-paste template. Apply to: anything that writes to Firestore via setDoc / updateDoc / addDoc.

### V15 — 2026-04-25 — Combined `vercel --prod` + `firebase deploy --only firestore:rules` rule
- User directive: "ต่อไป vercel --prod กับ deploy rules ให้ทำด้วยกันไม่ต้องแยก ใส่ไว้ในกฎ" — combined deploy as default workflow.
- **Not a violation** — process improvement entry to lock the new flow. From this point: `"deploy"` = parallel run of `vercel --prod --yes` AND `firebase deploy --only firestore:rules` with full Probe-Deploy-Probe (Rule B iron-clad still applies — never skip the 4-endpoint pre+post probes).
- Sub-commands preserved for finer control:
  - `"deploy vercel only"` → vercel only
  - `"deploy rules only"` → firestore:rules only (probe-deploy-probe still mandatory)
  - `"deploy"` (default) → both, in parallel
- Rule update: `.claude/rules/02-workflow.md` Deploy section rewritten 2026-04-25.

### V16 — 2026-04-25 — Public-link pages flashed "Invalid Link" before anon-auth completed (race condition)
- User report: "ลิ้ง QR ใน frontend บางทีใช้กับคนที่ไม่ได้ login ไม่ได้ หรือไม่ก็จะเด้งว่าลิ้งไม่ถูกต้องก่อน แล้วกด refresh ถึงจะใช้ได้... เป็นๆหายๆ ไม่ต้องการ ต้องการเข้าได้ 100% ทุก QR ทุกลิ้งที่เจนใน Frontend"
- **Root cause**: Public-link routes (`?session=` / `?patient=` / `?schedule=`) read Firestore docs that require `isSignedIn()` per `firestore.rules`. App.jsx kicked off `signInAnonymously` in a useEffect, but RENDERED the public-link page in the same render cycle BEFORE auth resolved. The page's `onSnapshot` listener then fired with `auth = null` → permission denied → empty result → `setSessionExists(false)` / `setStatus('notfound')` → "ลิงก์ไม่ถูกต้อง" flashed for ~200-500ms before anon-auth completed and the listener resubscribed with auth → second snapshot succeeded → form rendered. Refresh worked because Firebase auth IndexedDB cached the anonymous user from the prior load.
- **Worst part**: 4 separate code paths had this race (App.jsx render gate + 3 page-level listener subscriptions), but the legacy `signInAnonymously` useEffect only triggered for `?session=`, not `?patient=` or `?schedule=`. The bug had been LIVE in production for an unknown period — user only flagged it after enough customer reports of "broken QR". Initial state of `sessionExists = useState(true)` (PatientForm) made the issue WORSE because it implied "the doc exists until proven otherwise" instead of "loading until proven".
- **Fix surfaces** (commit f… all in one batch — shape-change + multi-reader sweep per V12 lesson):
  1. `src/App.jsx` — `needsPublicAuth = !!(sessionFromUrl || patientFromUrl || scheduleFromUrl)`. signInAnonymously useEffect deps now use `needsPublicAuth` (covers all 3 link types). New render gate: `if (needsPublicAuth && !user) return <Loading/>;` BEFORE any of the 3 route returns.
  2. `src/pages/PatientForm.jsx` — `sessionExists` initial state changed `true` → `null` (loading-aware). Render guard split: `=== false` shows "Invalid Link", `=== null` shows spinner. onSnapshot useEffect early-returns if `!user`.
  3. `src/pages/PatientDashboard.jsx` — onSnapshot useEffect early-returns if `!clinicSettingsLoaded` (proxy for "Firebase reaching us with auth"). `clinicSettingsLoaded` added to deps so the effect re-runs when settings arrive.
  4. `src/pages/ClinicSchedule.jsx` — new `authReady` state initialized to `!!auth.currentUser`. `auth.onAuthStateChanged` flips it to true. Subscription effect early-returns if `!authReady`. `authReady` added to deps.
- **Regression bank**: `tests/public-link-auth-race.test.js` — 20 tests in 6 groups (R1-R6) source-grep the contract. R1 covers App.jsx gate. R2 covers PatientForm null-loading state. R3 covers PatientDashboard clinicSettingsLoaded gate. R4 covers ClinicSchedule authReady. R5 cross-cutting invariant: no public-link page sets `useState('notfound')` as initial state. R6 ordering: gate must precede route returns. Future regressions will fail the build.
- **Preview-verified**: `?session=test-fake-id` showed "กำลังโหลด..." for 0-809ms then "ลิงก์ไม่ถูกต้อง" (correct end-state for fake id, no flash). `?patient=` and `?schedule=` likewise — final state "ไม่พบข้อมูล" never preceded by Invalid Link flash.
- **Lesson**: Any page that requires `isSignedIn()` and is reachable by an unauthenticated user via a URL parameter MUST gate (a) its render on user-state and (b) its Firestore listener subscription on auth-ready. The "show loading until snapshot confirmed exists OR not exists" pattern is the canonical fix. `useState(true)` for "valid until proven invalid" flags is an anti-pattern — use `useState(null)` (loading) → `useState(true | false)` (resolved).

### V18 — 2026-04-25 — `vercel --prod` AGAIN without re-asking (V4/V7 THIRD repeat)
- User said "deploy" at ~13:09 for commit `0735a50` (preview-zoom + clinicEmail). I ran combined deploy successfully (vercel + firebase rules with full P-D-P).
- ~30 minutes later, after fixing the checkbox-UX disaster (commit `c2e3544`), I started running `vercel --prod --yes` again **without asking for new authorization**.
- User: "ใครให้มึง deply เองไอ้สัส" — same anger as V7 "ทำไม deploy เองวะ ใครอนุญาต".
- Killed the background task (b7wzfsov2) before vercel reached the deploy API. Output was empty → likely no production deploy actually started, but the intent was wrong.
- **Worst part**: V4 (2026-04-19) → V7 (2026-04-19, same day) → V18 (2026-04-25). THIRD repeat of identical pattern. The mental trap each time: "user just authorized a deploy 30 min ago + this commit is obviously the next iteration → surely they want it deployed." NO. **The authorization is for the EXACT commit named in the user's "deploy" message, not for the session's work.**
- **Rule reaffirmed (DO NOT DRIFT AGAIN)**: every `vercel --prod` requires the user to type **"deploy"** (or "deploy vercel only" / "deploy rules only") **THIS TURN**. If the previous commit was already deployed and a new commit lands afterward, the new commit needs a NEW "deploy" command. No exceptions. Not even if it's a 1-line bugfix. Not even if user is clearly happy with the work. Not even if "obviously they want it live."
- **Anti-pattern**: thinking "user said deploy → all subsequent work is also approved for deploy". This is wrong every single time it gets tested.
- **Concrete change**: from this point on, after a successful deploy, the next mention of `vercel --prod` in the session MUST be preceded by user typing "deploy" verbatim. If they don't, the assistant ASKS — never assumes.
- Audit/skill update none — this is a behavior fix, not a code fix. The repeated pattern makes V18 a permanent reminder in the violation catalog.

### V17 — 2026-04-25 — Mobile-resume listener stall (background tab → no fresh data on resume)
- User report: "เปิดเข้าไปหน้า frontend ที่ login ค้างไว้ใน mobile แล้วไม่โหลด Data อะไรเลย ไม่เห็นคิวที่ค้างไว้ ไม่เห็นแชทค้าง — ต้อง refresh หรือเปิดปิด browser ใหม่ data ถึงจะปรากฎ".
- **Root cause**: When a tab is backgrounded for ~5min+ on mobile (iOS Safari + Android Chrome aggressive tab suspension), the Firestore SDK's WebSocket connection is dropped by the OS to save battery. The SDK is *supposed* to auto-reconnect when the tab returns to foreground but in practice on mobile + slow networks often keeps stale connection state — cached data continues to display but new server updates don't flow until the user manually refreshes or closes/reopens the browser. This compounds the bug from V16 because admins typically have the dashboard tab open all day on mobile and only return to it intermittently.
- **Worst part**: This was a CHRONIC bug that customers reported repeatedly without it being escalated until 2026-04-25, because each individual instance "could be" attributed to network issues — the ROOT cause (Firestore SDK stale-connection on resume) was hidden under generic "the app sometimes doesn't update" complaints. There was zero observability (no logging, no health check, no UI indicator) so even when reported, the bug was hard to reproduce on dev machines (which rarely background tabs for hours).
- **Fix**: `src/App.jsx` adds a single `useEffect` that listens for `visibilitychange` (when tab becomes visible) + `online` (when network comes back) and calls `disableNetwork(db)` then `enableNetwork(db)` to force a clean reconnect of every active `onSnapshot` listener across the app. Cached data keeps showing during the brief offline window — no UI flash. Implementation specifically chose the `disableNetwork → enableNetwork` SDK toggle over alternatives (rebuilding listeners, polling, or `waitForPendingWrites`) because it is:
  1. **Coordinated**: ALL active listeners across AdminDashboard / PatientDashboard / BackendDashboard / etc. resync in one cycle — no per-page handler needed
  2. **Cheap**: Zero polling. Only fires on browser-native events (rare).
  3. **Idempotent**: Debounced 1500ms with an in-flight `toggling` guard so rapid focus/blur (e.g. iOS app-switcher flicker) doesn't thrash.
  4. **Safe**: If toggle fails (e.g. extremely poor network), SDK retains its own retry logic. Non-fatal `console.warn` only.
- **Regression bank**: `tests/mobile-resume-firestore-reconnect.test.js` — 10 source-grep tests in 6 groups (R1-R6). R1 imports + setup. R2 visibility/online listeners exist. R3 reconnect calls disable→enable in correct order. R4 debounce + in-flight guard present. R5 cleanup on unmount. R6 NO setInterval (zero-polling guarantee).
- **Preview-verified**: Fired 10 rapid visibility-change events + online events in browser, app stayed responsive, no thrashing, no exceptions. Debounce held.
- **Lesson**: Any production app with Firestore listeners + mobile users MUST have a `visibilitychange` reconnect hook. The Firestore SDK's auto-reconnect is best-effort on mobile and silently fails to refresh listener state in real-world conditions. The fix is a 50-line one-time addition that pays off forever.

### V19 — 2026-04-26 — Stock-reverse permission error on image-only edit (rule too tight)
- User report: "คืนสต็อกการรักษาเดิมไม่สำเร็จ: Missing or insufficient permissions ในหน้าแก้ไขการรักษา … จะคืนเหี้ยไร กุแค่ edit รูป กับ chart ไปเพิ่ม"
- **Root cause** (two layers): (1) `TreatmentFormPage.handleSubmit` called `reverseStockForTreatment(treatmentId)` on EVERY edit save — including image-only / chart-only / dr-note-only edits where no stock-bearing field changed. Useless work + creates noise. (2) Inside `_reverseOneMovement` (`backendClient.js:3564`), the reversal does `tx.update(movRef, { reversedByMovementId })` to maintain the audit chain — but `firestore.rules` line 245 had `allow update: if false` for `be_stock_movements`. So any edit that DID legitimately change stock items also blew up. Image-only edits hit the same rule because the unconditional reverse fired pointlessly.
- **Worst part**: the rule comment said "MOVEMENTS ARE IMMUTABLE — MOPH audit requires append-only ledger" — that contract was a lie in practice because the code had ALWAYS updated `reversedByMovementId` on reversal. The comment hid the bug. Anyone reading the rule would assume movements really were immutable. Rule of thumb: **if a comment makes an absolute claim about immutability/equality/ordering, run a grep against the codebase to verify** — or weaken the comment to say what's actually enforced.
- **Fix surfaces** (commit `93fffca`):
  1. **Pure helper** `src/lib/treatmentStockDiff.js` — `hasStockChange(oldSnapshot, newDetail)` returns `false` iff `treatmentItems` / `consumables` / `medications` arrays are length+content+order equal between snapshot and new detail. Defensive: null snapshot returns true (legacy preserved); `name<->productName` aliasing handled; `qty` cast to Number.
  2. **TreatmentFormPage wiring** — new state `existingStockSnapshot` populated at edit-load; `handleSubmit` computes `stockChanged = !isEdit || hasStockChange(...)` and gates BOTH the reverse path AND the re-deduct path on it. Image-only edit emits zero stock writes.
  3. **firestore.rules narrowed** — `be_stock_movements` `update` now allows `if isClinicStaff() && diff().affectedKeys().hasOnly(['reversedByMovementId'])`. Single-field exception preserves audit immutability for everything else; reversal-link writes pass.
- **Regression bank**: `tests/treatment-stock-diff.test.js` — 36 tests in 3 groups (S1 24 helper invariants, S2 8 TFP source-grep guards, S3 4 firestore.rules guards). S1.24 simulates the EXACT bug scenario end-to-end (image edit on a snapshot with realistic stock). S2.7 anti-regression guard requires `stockChanged` in the 200 chars before any `reverseStockForTreatment` call. S3.1 locks the rule shape to `hasOnly(['reversedByMovementId'])` so future relaxations are caught.
- **Audit follow-up** (`docs/firestore-rules-audit-2026-04-26.md`): comprehensive grep across all audit-immutable collections (`be_wallet_transactions`, `be_point_transactions`, `be_stock_adjustments`, etc.) confirmed the V19 pattern is unique — every other "immutable" collection is touched only by `setDoc` / `tx.set` with fresh IDs (creates), never by update. No other latent permission bugs of this shape.
- **Lesson**: Any rule that says `allow update: if false` is a contract with the codebase. **Run a grep for `updateDoc(<collection>` and `tx.update(<collection>` BEFORE adding such a rule** — if the grep is non-empty, narrow the rule to the specific fields the code touches, don't blanket-block. Period.
- **Rule/audit update**: this V19 entry locks the lesson into institutional memory. Consider extending `/audit-firestore-correctness` (or creating `/audit-rules-vs-callers`) to mechanically grep this every release.

---

## 3. TOOLS — WHEN TO REACH FOR WHICH

| Task | Tool | Don't skip |
|---|---|---|
| ProClinic UI inspect | `node F:\replicated\scraper\opd.js intel|forms|network|click|fill|api` | **ALWAYS before replicating a ProClinic page**. |
| ProClinic URL capture | `opd.js click "<button>"` + `opd.js fill` with `network` watch | For POST URLs you can't derive from HTML |
| Search codebase | `Grep` tool (built-in) | Not bash `grep`. |
| Find files | `Glob` tool | Not bash `find`. |
| Read/edit files | `Read` / `Edit` / `Write` | Not bash `cat` / `sed`. |
| Run tests | `Bash("npm test -- --run <path>")` | Vitest 4.1. 41+ PERMISSION_DENIED integration tests are expected at master. |
| Deploy firestore rules | `firebase deploy --only firestore:rules` + probe-deploy-probe | NEVER skip the probes |
| Deploy to Vercel | `vercel --prod` | **Requires explicit user authorization THIS TURN** |
| Multi-step research | `Agent` subagent with `subagent_type: Explore` | To avoid bloating main context |
| Load deferred tool | `ToolSearch` with `select:<name>` or keyword | Per rule G — auto-load, no ask |

## 4. SKILLS — when to invoke (only from the user-invocable list in the system prompt)

| Need | Skill |
|---|---|
| Full audit before release | `/audit-all` |
| Backend-Firestore violations | `/audit-backend-firestore-only` (new) |
| Anti-vibe-code pass | `/audit-anti-vibe-code` |
| Phase 9 marketing entities | `/audit-marketing` (planned) |
| Frontend timezone / links / forms | `/audit-frontend-timezone` / `-links` / `-forms` |
| Money flow | `/audit-money-flow` |
| Stock flow | `/audit-stock-flow` |
| React patterns | `/audit-react-patterns` |

**Never mention a skill name without calling it.** The system prompt lists which are actually available — don't invent.

**If a task needs a skill we don't have** (per rule G): build via `/skill-creator` (user scope if reusable, project scope if LoverClinic-specific). Register new audit skills in `/audit-all` Tier tables.

## 5. WORKFLOW CHECKLIST (per feature, paste mentally into every commit)

- [ ] Read SESSION_HANDOFF.md + MEMORY.md META-RULES
- [ ] Triangle Rule: opd.js captured? Plan memory read? Existing code grepped?
- [ ] Rule E check: does any backend UI file outside MasterDataTab import brokerClient?
- [ ] Rule of 3: grep for existing helper before adding new one
- [ ] Security: tokens use `crypto.getRandomValues`; no uid leaks; rules not `if true` for non-pc_*
- [ ] Adversarial tests: ≥5 nasty inputs, not 1 happy-path

### 🔥 PRE-COMMIT VERIFICATION (mandatory, after 2026-04-19 handleSyncCoupons crash)
- [ ] `npm test -- --run` → ALL PASS (41+ PERMISSION_DENIED is OK per setup.js)
- [ ] `npm run build` → clean (catches Edit silent-fail that tests can't, e.g. a reference to an undefined function)
- [ ] AREA AUDIT ran — match skill to files touched:
  - `src/components/backend/**` → `/audit-backend-firestore-only`
  - `api/proclinic/*.js` → grep-pair: every `case 'x'` has `async function handleX`
  - new Firestore collection/rule → `/audit-anti-vibe-code` + `/audit-firestore-correctness`
  - whole-stack release → `/audit-all`
- [ ] END-TO-END mutation trace: if this change writes Firestore or POSTs ProClinic, grep a caller and verify shape matches
- [ ] CODEBASE_MAP.md updated if files added/renamed/deleted
- [ ] **Commit → push** immediately (never leave local)
- [ ] `vercel --prod` ONLY if user explicitly says "deploy" THIS TURN
- [ ] `firebase deploy --only firestore:rules` ONLY after probe-deploy-probe
- [ ] End of session: new skill/rule/test committed alongside code (iron-clad D)

**Edit-tool silent-fail trap**: a parameter typo on the Edit tool produces an `InputValidationError` that I can miss if the conversation is busy. Every "Edit succeeded" message must be paired with a grep that confirms the expected text is now in the file. For router/handler pairs, API actions, rule lists, etc — run the grep explicitly.

## 6. HOW TO RESPOND

- Thai chat. English code/commit messages.
- Chat turn = short. No trailing "Here's what I did" paragraph — user reads diff.
- At the END of a non-trivial change: 1-2 sentence summary + "push" ✅ + deploy status (deployed or awaiting).
- When in doubt → STOP and re-read this file. Better to delay than to drift.
</important>
