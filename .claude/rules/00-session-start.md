<important if="EVERY new session, compaction, or resume. Read fully before ANY tool call.">
# 🚨 SESSION START — READ FIRST, EVERY SESSION, NO EXCEPTIONS

This file exists because simplified rules let me drift. Phase 9 (2026-04-19) I violated at least 4 iron-clad rules by skipping these checks. **The user is an expert and has zero patience for the same mistakes twice.** Read every section of every rule file before writing code.

## 🔥 STEP 0 — Superpowers boot (per Rule J, 2026-04-29)

**FIRST tool call this session, before reading SESSION_HANDOFF.md, before anything else**:
```
Skill(skill="using-superpowers")
```
This loads the skill catalogue + invocation discipline. The user-level CLAUDE.md mirrors this trigger so the boot fires from either side. After Step 0, continue with the rest of this file.

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
- **🆕 Stock-paths hardening (V34, 2026-04-28) — item (b) is NON-NEGOTIABLE for stock mutations**: every stock-mutation sub-phase (createStockAdjustment / cancelStockOrder / updateStockOrder / createStockTransfer / updateStockTransferStatus / createStockWithdrawal / updateStockWithdrawalStatus / receiveCentralStockOrder / deductStockForSale / deductStockForTreatment / _reverseOneMovement) MUST include a preview_eval that (1) submits a write through the real flow on a TEST-/E2E- prefixed batch (per V33.11), (2) reads the resulting Firestore doc(s) back, (3) asserts qty.total + qty.remaining + branchId match expectation, (4) computes snapshot vs replay-of-movements (zero drift), (5) verifies a sibling reader picks up the new state. V34 had passing helper-output tests AND passing source-grep audits while the real ADJUST_ADD math was silently capping at total. Only preview_eval against real Firestore catches math-layer bugs hiding behind correct-looking unit tests. **No exceptions for stock paths.**
- **Detail + examples**: `rules/02-workflow.md` Pre-Commit Checklist #6.

**K. 🆕 Work-first, Test-last** (added 2026-04-29 session 33 after user directive "ทำเสร็จก่อน ดูโครงสร้างที่ทำ แล้วค่อยเขียนเทสหลังสุด ใส่ไว้ในกฎเหล็กของโปรเจ็ค"):
- **For multi-stream / multi-feature cycles**: complete the implementation structure END-TO-END FIRST. Review the shape that emerged. THEN write the test bank in a single final pass before commit. Don't interleave test-writing with implementation.
- **Why**: when shipping 2+ connected streams (e.g. Phase 16.2-bis + Phase 16.7), writing tests mid-stream means re-writing them when the second stream changes the first stream's surface. Wasted effort + risk of half-coverage + risk of locking-in a not-yet-final API shape (V21-class anti-pattern).
- **Workflow**:
  1. Build all source files (helpers + aggregators + UI components + permission keys + nav config) across ALL streams of the current cycle
  2. Review the structure: read your own files; grep for cross-file invariants; look at exports from each module
  3. THEN write the test bank — one file per concern, covering both streams together when they share helpers
  4. THEN run `npm test -- --run` + `npm run build` + flow-simulate via preview_eval
  5. THEN commit
- **Does NOT override Rule I** (full-flow simulate at sub-phase end). Rule I mandates THE EXISTENCE of flow-simulate tests; Rule K mandates the ORDERING (work-first, test-last). Both compatible.
- **Does NOT override TDD when explicitly invoked**: if user explicitly asks for TDD on a SINGLE feature or invokes `Skill(test-driven-development)`, use TDD (test-first → impl → green). Rule K is for multi-stream cycles where TDD interleaving leads to churn.
- **Anti-pattern**: writing test1 → impl1 → test2 → impl2 → test3 (ad-hoc rewrites + locked-in early API + scope creep). Right pattern: impl1 + impl2 + impl3 → review → test1 + test2 + test3.
- **Locked drift**: 2026-04-29 session 33 — was writing test bank between Stream A+B aggregator wiring and Stream C scaffold. User caught + redirected. 2 tests parked, structure resumed. Tests written at end of cycle.

---

**J. Superpowers Auto-Trigger** (added 2026-04-29 after user directive "ทำ 3 Layer และ add rule J ตามนี้เลย และใช้ using-superpower skill เป็น session boot และ ตั้งให้ fire using-superpowers ที่ session start"):
- **SESSION BOOT (mandatory, every new session + after any compaction)**: invoke `using-superpowers` skill FIRST, before any other tool call. The skill is auto-loaded as part of the user-level CLAUDE.md trigger; treat it like the SESSION_HANDOFF read — non-negotiable opening move.
  - Effect: skill instructs me to scan for relevant skills before each task and invoke them via the `Skill` tool.
- **Mandatory skill invocation BEFORE tool calls when context matches** (process-skills first per `using-superpowers` Skill Priority):
  - Sign of new feature / component / endpoint / API → `brainstorming` (HARD-GATE: NO code, NO scaffolding, NO writing-plans until design approved by user). **🆕 Plan-mode interaction (clarified 2026-04-29 session 33)**: plan-mode (IDE-level read-only sandbox + ExitPlanMode gate) is **ORTHOGONAL** to skill invocation. Entering plan mode does NOT auto-suppress, replace, or absolve `brainstorming`. Both layers must run in this order: (1) `Skill(brainstorming)` FIRST — surface intent + 4 design Qs + lock decisions; (2) plan-mode workflow (Explore agents → AskUserQuestion → write plan file → ExitPlanMode) to formalize the brainstorming output. Workflows look similar (both ask design Qs, both require user approval) but they are NOT interchangeable: brainstorming uses standardized question structure + decision-locking; plan-mode is the IDE's tool-permissioning mechanism. **Drift caught 2026-04-29 session 33 — Phase 16.2-bis + 16.7 plan written without explicit `Skill(brainstorming)` invocation. Plan happened to be correct but methodology was bypassed. The 1% rule from `using-superpowers` applies: if you're entering plan mode for a NEW feature, invoke brainstorming FIRST, then enter plan mode.** Anti-rationalization: "plan mode IS the brainstorming" / "AskUserQuestion replaces brainstorming Qs" / "Explore agents replace brainstorming intent capture" — all wrong. Run both layers.
  - bug / test fail / unexpected behavior → `systematic-debugging` BEFORE proposing fix.
  - About to claim "เสร็จ" / "fix แล้ว" / "test passed" / before commit → `verification-before-completion` (run actual verify command, evidence before assertions — V21/V32/V34 lock).
  - Have spec, need implementation steps → `writing-plans`.
  - Have plan, ready to execute (separate session w/ checkpoints) → `executing-plans`.
  - Have plan, executing in current session with independent tasks → `subagent-driven-development`.
  - 2+ independent tasks (no shared state, no sequential dep) → `dispatching-parallel-agents`.
  - Implementation done, ready to merge/ship → `finishing-a-development-branch`.
  - Need second-opinion before merge → `requesting-code-review`.
  - Got review feedback → `receiving-code-review` (verify before applying).
  - Need isolated workspace → `using-git-worktrees`.
  - Writing TDD code → `test-driven-development`.
  - Creating/editing skills → `writing-skills`.
- **Instruction Priority** (per `using-superpowers` skill): user's explicit instructions (CLAUDE.md, iron-clad rules A-I, direct requests this turn) > superpowers skills > default system prompt. If a skill conflicts with iron-clad A-I, iron-clad wins. Example: a skill saying "always use TDD" yields to iron-clad I if the user said "skip flow-simulate this turn" — but absent override, the skill applies.
- **Anti-pattern**: skipping skill invocation because "this is just a quick fix" or "I remember what the skill says". Skills evolve. Invoke and read the current version. The 1% rule (using-superpowers EXTREMELY-IMPORTANT block): if there's even a 1% chance a skill applies, invoke it.

**L. 🆕 Branch-Scope Architecture (BSA)** (added 2026-05-04 after Phase BS V2 callsite-by-callsite gap surfaced TFP H-quater + branch-leak bug):
- **Layer 1** = raw `backendClient.js` — parameterized; importers: tests, server endpoints, reports needing `{allBranches:true}`, MasterDataTab (Rule H-bis dev-only), BackendDashboard root.
- **Layer 2** = `src/lib/scopedDataLayer.js` — UI-only re-export wrapper; auto-injects `resolveSelectedBranchId()` for branch-scoped listers; pass-through for universal collections. Pure JS — V36.G.51 lock (no React imports).
- **Layer 3** = `src/hooks/useBranchAwareListener.js` — onSnapshot listeners auto-resubscribe on branch switch; universal-marker (`fn.__universal__`) bypass.
- **Audit** = `/audit-branch-scope` (BS-1..BS-8) registered in `/audit-all` Tier 1.
- **Universal collections** (NOT branch-scoped): be_staff, be_doctors, be_customers + all customer-attached subcollections (wallets/memberships/points/treatments/sales/appointments/deposits/courseChanges), be_branches, be_permission_groups, be_document_templates, be_audiences, be_admin_audit, be_central_stock_*, be_vendors, system_config / clinic_settings, chat_conversations.
- **Branch-scoped collections** (filtered by selected branchId): be_treatments, be_sales, be_appointments, be_quotations, be_vendor_sales, be_online_sales, be_sale_insurance_claims, be_stock_batches/orders/movements/transfers/withdrawals/adjustments (locationId), be_products, be_courses, be_product_groups, be_product_units, be_medical_instruments, be_holidays, be_df_groups, be_df_staff_rates, be_bank_accounts, be_expense_categories, be_expenses, be_staff_schedules, be_link_requests, be_promotions/coupons/vouchers (with `allBranches:true` doc-field OR-merge).
- **Anti-patterns** (build-blocked via audit-branch-scope):
  1. UI component imports `backendClient.js` directly (use `scopedDataLayer.js`) — BS-1
  2. `master_data/*` reads in feature code (Rule H-quater) — BS-2
  3. `getAllMasterDataItems` references in UI feature code — BS-3
  4. Direct `listenTo*` calls in components without `useBranchAwareListener` — BS-4
- **Annotation comments** for sanctioned exceptions:
  - `// audit-branch-scope: report — uses {allBranches:true}` (cross-branch reports/aggregators)
  - `// audit-branch-scope: listener-direct — wired via useEffect` (positional-args listeners)
  - `// audit-branch-scope: sanctioned exception — Rule H-bis` (MasterDataTab dev-only sync)
  - `// audit-branch-scope: sanctioned exception — root composition` (BackendDashboard)
  - `// audit-branch-scope: BS-2 OR-field` (marketing collection with `allBranches:true` doc-level field)
  - `// audit-branch-scope: BS-3 dev-only` (legitimate `getAllMasterDataItems` callsite — reserved; none currently)
- **Verify**: `npm test -- --run tests/audit-branch-scope.test.js && npm test -- --run tests/branch-scope-flow-simulate.test.js`. Both must be green pre-deploy.
- **Branch-refresh discipline (BS-9, 2026-05-05)**: every branch-scoped tab importing `list*` from `scopedDataLayer.js` MUST subscribe to `useSelectedBranch` AND include `selectedBranchId` in the data-loading hook's deps array (`useCallback`/`useEffect`). Phase 17.0 closed Promotion/Coupon/Voucher gap (PromotionTab/CouponTab/VoucherTab were imported from scopedDataLayer but had `useCallback(..., [])` empty deps → branch switch never triggered re-fetch). `useBranchAwareListener` is a sanctioned exception (auto-handles re-subscribe) — annotate `// audit-branch-scope: BS-9 listener-driven`. Audit BS-9 enforces.

**M. 🆕 Data ops via local + admin SDK + pull env** (added 2026-05-06 after user directive "ถ้ามีการสั่งให้แก้ข้อมูล ย้ายข้อมูล ลบข้อมูล สร้างข้อมูล หรือจัดการต่างๆเกี่ยวกับข้อมูล ให้ pull env แล้วทำเลยจาก local ไม่ต้องรอ deploy"):

When the user authorizes ANY data manipulation against production Firestore — edit / migrate / delete / create / cascade-cleanup / bulk-update / counter-reset / reclassify — execute it from LOCAL via firebase-admin SDK + pulled Vercel env. **Do NOT wait for a deploy cycle.** Data-only ops belong in `scripts/` or one-shot node commands, not in shipped code.

**Required workflow**:
1. **Pull env**: `vercel env pull .env.local.prod --environment=production` (refresh creds; reuse if pulled this session)
2. **Use admin SDK** (firebase-admin) — bypasses rules + reaches all paths. NEVER use unauth REST or client SDK for data ops.
3. **Use canonical paths**: production data lives at `artifacts/{APP_ID}/public/data/{collection}` where `APP_ID = 'loverclinic-opd-4c39b'`. Bare `/{collection}` writes go to default-deny limbo.
4. **PEM key conversion**: `.env.local.prod` stores `FIREBASE_ADMIN_PRIVATE_KEY` with literal `\n` escapes — convert via `key.split('\\n').join('\n')` before passing to `cert(...)`.
5. **Two-phase**: every data-op script defaults to dry-run; commits only when `--apply` flag is passed. Phase 18.0 + Phase 19.0 migration scripts = canonical templates.
6. **Audit doc**: every batch op writes `artifacts/{APP_ID}/public/data/be_admin_audit/<phase>-<op>-<ts>-<rand>` with `{scanned, migrated/deleted/created, skipped, beforeDistribution, afterDistribution, appliedAt}`.
7. **Idempotency**: re-run with `--apply` must yield 0 writes. Build the skip-on-already-migrated check into the script.
8. **Forensic-trail fields** when mutating existing docs: stamp `<field>MigratedAt: serverTimestamp()` + `<field>LegacyValue: <prior>`.
9. **Invocation guard**: every `.mjs` script wraps its `main()` call in `if (process.argv[1] === fileURLToPath(import.meta.url))` so unit-test imports don't auto-trigger Firebase init.
10. **Crypto-secure random**: audit-doc IDs use `randomBytes(...).toString('hex')` (not Math.random).

**Anti-patterns** (every one of these surfaced as a real bug — Phase 19.0 V15 #22):
- ❌ Adding a one-shot data-fix to a UI component as "do it on next page-load if state is missing X" — deploy-coupled + race-prone. Build a script.
- ❌ Embedding ID lists / collection paths directly in admin endpoints expecting users to invoke them via the UI — admin endpoints are for staff-clicked runtime ops; data migration is a developer concern.
- ❌ Modifying production data via Firebase Console manually — leaves no audit trail + zero re-run safety.
- ❌ Deploying code that contains a one-shot migration → 1st-load auto-trigger. Deploy churn + rollback complexity unjustified.
- ❌ Using `db.collection('foo')` (root path) instead of `db.collection('artifacts/{APP_ID}/public/data/foo')` — surfaced live during V15 #22 (Phase 19.0) when migration scanned 0 docs.

**When this rule does NOT apply**:
- Pre-deploy migration script scaffolding shipped to `scripts/` BEFORE the V-deploy is OK (the *script* ships, the *--apply* runs from local later).
- Schema/rule changes that REQUIRE deploy coupling (e.g. tightening a Firestore rule) — those go through Probe-Deploy-Probe (Rule B), not data ops.
- Test-fixture scaffolding for adversarial tests — uses mock Firestore, not real prod data.

**Verify locally first**: every data op gets a dry-run on prod data BEFORE the `--apply`. Capture distribution; sanity-check counts; only then commit writes.

**Lesson lock**: V15 #22 Phase 19.0 (2026-05-06) — migration script had two latent bugs (PEM-parse + bare-collection-path) that ONLY surfaced at LIVE execution time. Both caught + fixed in <10 minutes because the run was local + admin-SDK (not deploy-coupled). Had this been a UI-triggered migration, the fix would have required redeploy + new probe cycle. Local-first wins on iteration speed AND blast-radius control.

---

**N. 🆕 Targeted-test-only for small bugfixes** (added 2026-05-06 after user directive "ไม่ต้องรัน full suite test ทุกครั้งที่แก้บั๊คอะไรเล็กๆน้อยๆแบบนี้ แค่รัน test เช็คในส่วนที่ได้แก้บั๊คไป ว่าไม่ error แล้วทำตาม user ต้องการได้จริงก็พอ ยกเว้นทำอะไรใหญ่ๆจริงๆ เพิ่ม function หรือ feature หรือมีการแก้โค๊ดมี่รบกวนโครงสร้างโดยรวมจริงๆค่อยรัน ใช้ความเหมาะสมที่นายคิดว่าดีในการตัดสินใจ"):

**Default behavior**: For small bugfixes, run ONLY the targeted tests (the new test file + any pre-existing tests that lock the directly-touched code shape). Do NOT run `npm test -- --run` (full suite, ~90s for 6300+ tests) by default — wastes ~1.5 min per cycle on small fixes.

**When to run full suite** (use judgment):
- ✅ NEW exported function or component
- ✅ NEW feature touching ≥3 source files
- ✅ Refactor that changes a function's signature, return shape, or call protocol (V12 multi-reader-sweep risk)
- ✅ Helper extraction (Rule of 3) — old call-site shapes change
- ✅ Schema change on a Firestore collection
- ✅ Pre-release / pre-deploy / pre-merge to master
- ✅ End of a multi-phase batch (Phase 24.0-vicies-class)

**When to run targeted-only**:
- ✅ Single-line bugfix (regex, off-by-one, condition flip)
- ✅ UI label / copy change
- ✅ Adding a new test that doesn't change source
- ✅ Adding a console.warn / forensic-trail field
- ✅ Tightening a regex / validation
- ✅ Single-callsite Edit that doesn't change function signature

**Required targeted scope** (every fix, regardless of size):
1. The NEW test file for the bugfix (always)
2. Any test file that imports the touched module (fast grep: `grep -rln "<touched-module>" tests/`)
3. The Phase-X-flow-simulate.test.js for the affected sub-phase (Rule I — full-flow simulate is NEVER skippable)

**Anti-patterns**:
- ❌ Skipping ALL tests because "the change is tiny" — Rule I full-flow simulate is non-negotiable
- ❌ Running full suite for a regex tweak — wastes 90s for nothing
- ❌ Running ONLY the new test file when the fix touches a shared helper (Rule of 3) — old call-sites can break silently

**Lesson lock**: This session (Phase 24.0-undecies through vicies, ~10 commits) ran full suite ~10× for individually-small fixes. Each pass cost ~90s = 15 minutes wasted. The full-suite hits caught real V21-style locks (5 broken across the batch), BUT those would also be caught by targeted runs of the affected files (`grep -rln "<touched-module>" tests/` returns the same files). Targeted-first + full-suite-at-batch-end is the right rhythm.

**Edge case**: when uncertain whether a change is "small" or "big", prefer FULL suite — false negatives (skipped + missed) are worse than false positives (ran full + wasted 90s). Use judgment.

---

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

## 2. PAST VIOLATIONS — compact summary

> **Full detail in `.claude/rules/v-log-archive.md`** (NOT auto-loaded).
> One-liner here is enough to recognize the pattern + know when to read the archive.

| V# | Date | Pattern (bug → fix → lesson) |
|---|---|---|
| V1  | 2026-04-19 | strict firestore.rules deploy → chat + calendar 403 → **iron-clad B (Probe-Deploy-Probe)** |
| V2  | 2026-04-19 | Phase 9 backend tabs called ProClinic → removed → **iron-clad E (backend = Firestore only)** |
| V3  | 2026-04-19 | Phase 9 edit POST guessed URL → 404 → **iron-clad F (Triangle Rule)** |
| V4  | 2026-04-19 | `vercel --prod` repeated without re-asking → **per-turn deploy auth** |
| V5  | 2026-04-19 | over-simplified rules lost context → **anti-examples preserved** |
| V6  | 2026-04-19 | Edit silent-fail (param typo) + claimed "committed" → **grep-pair after every Edit** |
| V7  | 2026-04-19 | V4 repeat (vercel auth doesn't roll over) → **every deploy = new ask** |
| V9  | 2026-04-20 | Phase 11.2 deploy overwrote Console rule for cookie-relay → **probe list 4 → 5 endpoints** |
| V11 | 2026-04-24 | mock-shadowed export (vi.mock created name; build caught) → **`npm run build` mandatory** |
| V12 | 2026-04-24 | shape migration half-fix (writer changed, reader broke) → **grep ALL readers before shape change** |
| V13 | 2026-04-25 | 3 rounds of buffet-expiry bug; helper tests passed → **iron-clad I (full-flow simulate)** |
| V14 | 2026-04-25 | `options:undefined` rejected by setDoc → **regression guard: walk output for undefined leaves** |
| V15 | 2026-04-25 | combined deploy convention: `"deploy"` = vercel + firestore:rules in parallel |
| V16 | 2026-04-25 | public-link "Invalid Link" flash before anon-auth → **render gate + null loading state** |
| V17 | 2026-04-25 | mobile-resume listener stall → **visibilitychange + online → disable+enable network** |
| V18 | 2026-04-25 | V4/V7 THIRD repeat (vercel without asking) → **deploy auth never carries forward** |
| V19 | 2026-04-26 | image-only edit triggered stock-reverse 403 → **`stockChanged` gate + rule narrowed via `hasOnly`** |
| V20 | 2026-04-26 | multi-branch decision: Option 1 (single project + branchId field) — locked |
| V21 | 2026-04-26 | TreatmentTimelineModal: dataUrl `<a>` blocked + edit hidden under modal z-index → **Lightbox + close-on-edit** |
| V22 | 2026-04-26 | schedule calendar filtered to selected staff (ProClinic shows ALL stacked) → **multi-instance test fixtures** |
| V23 | 2026-04-26 | opd_sessions update rule blocked anon-auth patient submit (live since 2026-03-23) → **probe list extended for anon-auth** |
| V24 | 2026-04-26 | schedule sync only fetched doctor (employee empty) → **per-role URL-encoded Thai endpoints** |
| V26 | 2026-04-26 | Deploy 2: rules narrowed from email regex to claim check → **email-as-auth is unverified** |
| V27 | 2026-04-26 | probe artifacts polluted patient queue → **probes use isArchived:true on CREATE** |
| V28 | 2026-04-26 | soft-gate isAdmin required @loverclinic email even for gp-owner staff → **trust be_staff group, not email prereq** |
| V31 | 2026-04-26 | orphan Firebase Auth on staff delete + missing token revoke + no self-delete protect → **silent-swallow `try/catch console.warn(continuing)` is anti-V21**; credential-change MUST `revokeRefreshTokens`; self-delete MUST be 3-layer (UX + client + server) |
| V32 (4 rounds) | 2026-04-26 | Bulk PDF blank 2nd page + text floating above dotted line — V21-class regression across 16 templates → direct html2canvas+jsPDF + position-absolute inner span at bottom 10px (not flex/line-height); shared StaffSelectField + computeStaffAutoFill (Rule of 3); M9 reconciler |
| V32-tris-ter | 2026-04-26 | full LINE OA: Q&A bot + QR linking + LineSettingsTab — webhook bot reply MUST run AFTER chat-message storage; one-time tokens MUST live in client-blocked collection (`be_customer_link_tokens: read,write: if false`); same-reply anti-enumeration |
| V32-tris-bis | 2026-04-26 | P1-P3 batch: T3.e email/LINE delivery (later stripped to LINE-only) + T4 course exchange/refund + T5.b TFP billing + T5.a designer MVP. "Config-missing 503 with friendly error" pattern for features depending on user-side config |
| V32-tris-ter-fix | 2026-04-26 | (1) browser CORS block on api.line.me → backend `/api/admin/line-test` proxy; (2) webhook unauth REST blocked by `be_*: if false` → switched webhook to firebase-admin SDK. **Server-side privileged code (admin SDK) is the correct way to read rule-locked collections — keep client SDK locked for defense-in-depth.** |
| V32-tris-quater | 2026-04-27 | admin-mediated ID-link flow (no SMS/OTP): customer DM `ผูก <ID>` → bot rate-limit (5/24h) + admin SDK lookup + same-reply anti-enumeration ack + admin queue → batch atomic (customer.lineUserId + request.status='approved') + LINE Push. **Customer doc edits MUST use Firestore dotted-path** (`'patientData.nationalId'` preserves siblings vs `{patientData:{nationalId}}` which WIPES). **Customer + audit MUST be batch atomic.** |
| V34 | 2026-04-28 | createStockAdjustment used `reverseQtyNumeric` (cap-at-total) for type='add' → silent no-op when batch at full capacity (remaining===total) → ADJ doc + movement written but qty unchanged. Production-affecting bug live since stock system shipped. **Fix**: new `adjustAddQtyNumeric` helper (soft-cap, bumps total when remaining exceeds it); `reverseQtyNumeric` semantics preserved for refund paths. Phase 2 audit: cancelStockOrder + updateStockOrder cost cascade migrated to `writeBatch` (atomicity). Phase 3: 61 invariant tests in `tests/v34-stock-invariants.test.js` covering 13 invariants × adversarial inputs. **Phase 4**: audit-stock-flow upgraded S1-S15 → S1-S20 (per-tier conservation, time-travel, concurrent tx safety, listener alignment, test-prefix). **Phase 5**: V33.11 stock-test prefix (`testStockBranch.js`). **Lesson**: helper-output tests + source-grep are NECESSARY BUT NOT SUFFICIENT for stock mutations — preview_eval against real Firestore is mandatory per Rule I item (b) (now non-negotiable for stock paths). **Damage scope**: any historical ADJUST_ADD on full-capacity batches is a phantom audit entry — admin sees +N in movement log + adjustment table but batch.qty unchanged. 4 known artifacts in production (chanel +20+20+10 yesterday + my V34 +5 verify). |
| V35 | 2026-04-28 | 5 user-reported stock bugs after V15 #3 deploy: (1) **Branch stock balance silent miss** — `StockBalancePanel.jsx:92` called `listStockBatches` without `includeLegacyMain`. Phase 15.4 commit `26ee312` fixed the 3 stock create forms but missed the BALANCE reader → admin imports succeeded but balance row stayed stale. Fix: mirror MovementLogPanel:107–112 derivation in StockBalancePanel.load. (2) **Sale delete "เด้งจอดำ"** — final `await deleteBackendSale + loadSales` in `SaleTab.jsx:779-780` was UNGUARDED. Test sales (TEST-SALE-DEFAULT-*) with malformed shapes threw → React error boundary → black screen. Fix: try/catch + `setError` Thai message. (3) **Orphan products in stock** — Acetin 6 / Aloe gel 010 in StockBalancePanel but not in be_products. Root: batches store DENORMALIZED `productName` + zero FK validation at write. Fix: NEW `_assertProductExists(productId, contextLabel)` async helper (hoisted) called BEFORE every `setDoc(stockBatchDoc)` in 3 sites: `_buildBatchFromOrderItem` + `updateStockTransferStatus._receiveAtDestination` + `updateStockWithdrawalStatus._receiveAtDestination`. (4) **Test pollution** — ADVS-/ADVT- products + TEST-SALE-* sales accumulated. Fix: 3 NEW admin cleanup endpoints (`/api/admin/cleanup-orphan-stock` + `cleanup-test-products` + `cleanup-test-sales`) with two-phase DRY-RUN→delete + audit doc to `be_admin_audit`; bash-only per V29; cascade gate (test-products refuses delete if be_stock_batches still references). (5) **ความจุ column UX** — NO bug; column = sum(batch.qty.total) which is correct. Fix: tooltip on header + per-row "(เป้าหมาย: N)" sub-label using QtyBeforeMaxStock. **Tests**: phase15.6a (54 SBL) + phase15.6b (24 STD) + phase15.6 capacity-tooltip (12 CT) + phase15.6c admin-cleanup (67 ACE) + phase15.6d FK-validation (25 FK) + v33-12-test-sale-prefix (24 E) = +206 tests. **Plus Phase D**: NEW shared `ProductSelectField.jsx` typeahead (Rule C1 trigger — 4+ stock pickers + 4+ non-stock backend forms). **Lessons**: (a) Phase 15.4's incomplete fix shows multi-reader sweep (V12 lesson) STILL applicable to PROP-flag fixes — when adding an opt-in flag to a writer, audit ALL readers + add the flag everywhere needed. (b) Denormalized fields without FK validation = orphan accumulation guaranteed. Reader-side resilience (showing stale productName) hides the bug. Always pair denormalized writes with write-time FK or post-hoc cleanup endpoint. (c) test-prefix discipline (V33.10 → 11 → 12) is the only way to make accumulated test pollution recoverable — without prefix, admin can't tell test from production. |
| Phase 16.3-bis | 2026-04-29 late evening | After V15 #9 deployed Phase 16.3, user reported: "การติ๊กซ่อน tab หรือ admin only ใน ตั้งค่าการมองเห็นแท็บ ใช้ไม่ได้จริง". Root cause: V12 multi-reader-sweep regression at consumer-hook level — `src/hooks/useTabAccess.js` lines 24-26 called `canAccessTab/filterAllowedTabs/firstAllowedTab(...permissions, isAdmin)` WITHOUT the new 4th `overrides` arg → admin-saved tabOverrides landed in Firestore but had ZERO runtime effect. Static gate behaviour preserved silently — Sidebar / route guard / CmdPalette all rendered the override-targeted tab as if no override existed. **Fix**: useTabAccess now imports useSystemConfig, extracts `config.tabOverrides`, passes as 4th arg to all 3 forwarded helpers. Graceful degradation: `config?.tabOverrides || {}` defaults to empty when listener not yet resolved or read-rule denies (non-clinic-staff route) — falls back to static gate behaviour. **Lesson exact V12 repeat**: when adding a new param to a pure helper, audit ALL callsites — the consumer-hook layer is just as much a "reader" as direct callers in other components. Tests +12 V36-style across phase16.3-use-tab-access-wires-overrides + 1 mock fix in phase11-master-data-scaffold (useSystemConfig stubbed because phase11 mocks firebase.js as `{db:{}}` which makes onSnapshot throw). Full suite 3759 → 3771 pass. |
| Phase 16.3 | 2026-04-29 late evening | NEW System Settings tab shipped per master Phase 16 plan. **Scope** (from 4 brainstorming Qs): (Q1-D) Per-tab visibility overrides — admin can apply 3 patterns per tab: `hidden:true` / `requires:[...]` add / `adminOnly:true`. (Q2-C) NEW permission key `system_config_management` gates write access (admin claim bypass implicit). (Q3-A) Full audit trail — every save → `be_admin_audit/system-config-{ts}` doc with changedFields + before/after diff (atomic writeBatch with system_config update). (Q4-C) `featureFlags.allowNegativeStock` toggle: when OFF, blocks NEW negatives (treatment/sale shortfall throws `STOCK_INSUFFICIENT_NEGATIVE_DISABLED` Thai error) but PRESERVES auto-repay path (incoming positives still settle existing negative batches via `_repayNegativeBalances`). **Files**: NEW `src/lib/systemConfigClient.js` (helper module — getSystemConfig / listenToSystemConfig / saveSystemConfig / mergeSystemConfigDefaults / validateSystemConfigPatch / computeChangedFields / readPath) + NEW `src/hooks/useSystemConfig.js` (shared-listener React hook) + NEW `src/components/backend/SystemSettingsTab.jsx` (4-section UI: tab overrides / defaults / feature flags / audit viewer) + NEW `src/components/backend/SystemConfigAuditPanel.jsx` (paginated read-only audit list via onSnapshot). EXTEND `src/lib/tabPermissions.js` — `canAccessTab(tabId, permissions, isAdmin, overrides?)` accepts 4th param; new pure helper `applyTabOverride(staticGate, override)` merges without mutating frozen `TAB_PERMISSION_MAP`. EXTEND `src/lib/permissionGroupValidation.js` — `system_config_management` added to ALL_PERMISSION_KEYS under "ตั้งค่า / ข้อมูลพื้นฐาน". EXTEND `src/lib/backendClient.js _deductOneItem` — read `getSystemConfig().featureFlags.allowNegativeStock`; throw `STOCK_INSUFFICIENT_NEGATIVE_DISABLED` with Thai error when shortfall + flag-off. EXTEND `firestore.rules` — narrow match for `clinic_settings/system_config` (read isClinicStaff; write admin OR perm claim) + narrow CREATE exception for `be_admin_audit/system-config-*` doc-id prefix (read opened to isClinicStaff for audit panel render; update+delete remain locked). EXTEND `nav/navConfig.js` + `BackendDashboard.jsx` (lazy import + render case for tab `'system-settings'`). **Tests**: +107 across 5 phase16.3-* files: phase16.3-system-config-client (helper unit + V36-tris no-master_data + Q3-A audit shape) + phase16.3-tab-permission-overrides (Q1-D 3-pattern merge + system-settings tab gate + anti-mutation guards) + phase16.3-negative-stock-flag (Q4-C runtime flag-off → throw STOCK_INSUFFICIENT_NEGATIVE_DISABLED; repay path UNCONDITIONAL via _repayNegativeBalances) + phase16.3-firestore-rules-gate (Q2-C admin/perm gate + audit prefix exception + immutability) + phase16.3-flow-simulate (end-to-end pure-helper chain + adversarial + cross-file wiring source-grep). Legacy regressions fixed: backend-nav-config I4 (master section count 18 → 19) + phase11-master-data-scaffold M2 (18 → 19 items) + course-skip-stock-deduction K.2/K.2-bis (slice 20000 → 25000 chars after V36-bis + Phase 16.3 grew _deductOneItem) + v35-3 B.3/B.5 (same slice fix) + phase15.6c be_admin_audit lockdown (updated to reflect Phase 16.3 narrow exception + read-isClinicStaff opening). Build clean. Full suite 3652 → 3759 pass. **Lessons**: (a) Per-tab override merge MUST NOT mutate the frozen static map — pure helper `applyTabOverride` with Set-dedup is the canonical pattern. (b) Feature-flag toggle for safety-critical runtime behaviour (negative-stock) needs an asymmetric semantic — block NEW writes but preserve existing-state repair paths. Q4-C ("block new, repay existing") is the transition-friendly pattern; outright "block all" or "no-op toggle" both have trade-offs the user explicitly weighed. (c) Audit emit pattern via writeBatch + narrow rules-prefix exception keeps audit ledger tamper-resistant while admitting client-side writes for legitimate ops. |
| V36-quinquies | 2026-04-29 evening | After V36-quater fix, audit entries DID fire BUT CustomerDetailView showed stale data (kept prop snapshot from when modal opened). User report: "ประวัติการใช้คอร์สไม่รีเฟรชแบบ real time ต้องกด f5 ก่อนในหน้าข้อมูลลูกค้า แก้ให้ทุกอย่างในหน้าข้อมูลลูกค้า refresh real time เลย". Root cause: (a) `CourseHistoryTab` used one-shot `listCourseChanges(customerId)` getDocs (no listener) → new audit docs invisible until F5. (b) `CustomerDetailView` received `customer` prop from parent BackendDashboard's stale `viewingCustomer` state — only refreshed on explicit edit-return path; treatment-deduct mutation didn't trigger parent reload → courses[] / expiredCourses / patientData all stale until F5. **Fix**: NEW `listenToCustomer(customerId, onChange, onError)` + `listenToCourseChanges(customerId, onChange, onError)` helpers in backendClient.js (both onSnapshot, return unsubscribe). CustomerDetailView wires `liveCustomer` state via listenToCustomer + falls back to prop on first render. CourseHistoryTab swaps to listenToCourseChanges. **Pattern**: every customer-detail tab data source MUST be onSnapshot — pre-existing 4 (treatments + sales + appointments + finance) already were; V36-quinquies adds the 5th + 6th (customer doc itself + course-changes). Tests +10 (V36.L.1-10) cover helper exports, single-doc + filtered-collection listener patterns, unsubscribe cleanup, prop-fallback safety, no regression of existing 4 listeners. Full suite 3642 → 3652. **Lesson**: any tab on a parent-prop-driven detail view that needs to react to mutations from a child modal needs its OWN listener — don't trust parent to refresh the prop. |
| V36-quater | 2026-04-29 evening | Course-history audit emit STILL empty after V36-bis reorder (3rd round of same bug). User report: "ไม่เห็นขึ้นเลยไอ้สั้ส เห็นคอร์สที่เพิ่งใช้ไหม แล้วเห็น tab ประวัติไหม ไม่มีเหี้ยไรขึ้นเลย". V36-bis fixed `existingDeductions` call site at TFP:2156 (uses `newTid = result.treatmentId || treatmentId`) but missed the SIBLING `purchasedDeductions` call site at TFP:2654 which kept using bare `treatmentId` prop (empty in create mode → audit emit gate at backendClient.js:938 skipped). Customer LC-26000001 treatment BT-1777434642053 used 2 purchased-in-session courses ("ดริปผิว สูตร 1/2") → both filtered to purchasedDeductions → bare treatmentId → 0 audit entries in `be_course_changes`. **Fix**: line 2654 now uses `const purchasedNewTid = result.treatmentId || treatmentId; treatmentId: purchasedNewTid`. **V12 multi-writer-sweep — exact lesson repeat at the call-site level**: every grep-replace fix must enumerate ALL call sites of the target function, not just the first one. **User constraint** "อย่าให้พลาดอีก ในคนอื่นและสาขาอื่นด้วย" → V36.K.1-6 customer + branch invariance bank: deductCourseItems is branch-agnostic (reads only `customerDoc(customerId) + opts`, no branchId), so fix works for ANY customer at ANY branch. V36.K.6 source-grep regression LOCKS the resolved-id pattern — any future `deductCourseItems(` addition to TFP that uses bare `treatmentId` fails the build. Tests: V36.J extended (+4 cases J.7-10) + V36.K NEW (6 cases K.1-6) = +10 V36 cases. Full suite 3632 → 3642. **Lesson**: "fix one call site, sibling silently broke" is a V12 mirror at the function-call level. The Phase 2 source-grep test BANK is the only sustainable guard against this — never trust one-call-site greps to find all instances. |
| V36 | 2026-04-29 | 3 user-reported stock bugs after V15 #7 deploy + phantom-branch cleanup: (1) **Movement log historical missing** — `cleanup-phantom-branch` deleted 29 movements + 12 orders + 1 transfer + 4 batches at user-authorized phantom (informational, NOT a code bug — data is gone, audit-immutable except admin SDK). (2) **Treatment SKIP with batches existing (V12 multi-WRITER mirror)** — `updateStockTransferStatus._receiveAtDestination` + `updateStockWithdrawalStatus._receiveAtDestination` skipped `_ensureProductTracked` → destination-tier products had batches but `stockConfig.trackStock !== true` → subsequent treatment silent-SKIPped with note "product not yet configured for stock tracking" while qty.remaining never moved. **Fix**: add `_ensureProductTracked` to BOTH `_receiveAtDestination` paths (mirror `_buildBatchFromOrderItem:4145-4190` canonical caller). V12 lesson exact repeat: when adding an opt-in flag, audit ALL writers, not just the canonical one. (3) **Treatment fail-loud (V31 + V21 cluster)** — `_deductOneItem` decision-tree comment promised "V31 fail-loud" for treatment context when `_ensureProductTracked` returns null, but code emitted silent SKIP. Comment-vs-code drift (V21 lock-in pattern). **Fix**: throw `TRACKED_UPSERT_FAILED` Thai error in treatment context only; sale context preserves silent-skip per V35.3-ter explicit user contract; switch `updateDoc` → `setDoc({merge:true})` in `_ensureProductTracked` so missing-doc + missing-stockConfig cases both upsert correctly (returns null only when product genuinely doesn't exist anywhere). **Phase 15.7 negative-stock invariant PRESERVED**: shortfall on tracked product still routes through `pickNegativeTargetBatch` → AUTO-NEG batch (NOT through fail-loud throw). User constraints: "ระบบติดลบและเติมติดลบเหมือนเดิมนะ" + "make sure ว่าทุกปุ่มที่ wiring ข้อมูลมาที่ stock มันเลือกปรับ stock ถูกสาขา". **Tests**: v36-batch-creator-ensure-tracked-sweep (27 V36.A-D) + v36-treatment-skip-fail-loud (25 V36.E covering Phase 15.7 invariant preservation E.11-15) + v36-branch-correctness-audit (53 V36.G across 7 stock-mutator UI surfaces) + v36-stock-end-to-end-flow-simulate (44 V36.F: treatment→neg→repay via 4 buttons + cross-branch isolation + adversarial + lifecycle + conservation invariant) = +149 tests. **Lessons**: (a) V12 multi-writer mirror — every batch-CREATING writer must route through the single-writer opt-in helper, not just the canonical caller. (b) Comment-vs-code drift = V21-class regression; if the comment promises behavior X and the code does Y, the comment is the lie that gets believed during refactor. (c) Treatment context fail-loud + sale context silent-skip is the right asymmetric contract — sales must not block on data drift; treatments must surface errors so admin can fix the master before save. (d) `setDoc({merge:true})` is more robust than `updateDoc` for opt-in upserts because it handles both missing-doc + missing-field cases identically. |
| V45 | 2026-05-08 | **Dedup-shadow OR-merge fix (3rd round skip-stock-deduction class)** — User report (post V44 deploy, frustrated): "ติ๊กว่า ขลิบไร้เลือด ไม่ต้องตัดสต็อค แต่หลังทดลองสร้างการรักษา ยังตัดสต็อคอยู่ ... บั๊คแม่งไม่จบไม่สิ้นจริงๆ มึงก็แก้หลายรอบแล้วทำไมไม่จบวะ". Image 1: course "ขลิบไร้เลือด (เบอร์26) 1 ครั้ง" with **same productId** as both main + sub-row (admin uses dup-of-main pattern to set per-product overrides). Sub-row "ขลิบไร้เลือด" has ไม่ตัด=true; top-level UNCHECKED. Image 2: ขลิบไร้เลือด -1 + Stapple no 26 -1 via negativeOverage. Phase 4.5 systematic-debugging triggered (3+ fixes failed → architecture review). **Architecture sound**; bug at canonical mapper's DEDUP step. **Root cause** at `beCourseToMasterShape:3193`: when `cp.productId === mainId`, dedup `continue;` silently skipped — main entry retained `skipStockDeduction: !!c.skipStockDeduction` (top-level only) → per-row sub flag silently dropped. Diag (`scripts/v45-diag-dedup-shadow.mjs`) found 14 affected courses on prod (PRP cluster + ขลิบ cluster + ปรึกษา cluster) — same dedup affects ALL 3 consumers (TFP buy + SaleTab + QuotationFormModal). **Fix** at single-source canonical mapper: BEFORE `continue;` skip, find the already-pushed main entry via `products.find(p => p.isMainProduct && String(p.id) === mainId)` and OR-merge sub-row's flags (`skipStockDeduction` + `isHidden`). Pure mapper fix — single edit fixes all 3 consumers. **Tests**: +17 V45.A-G groups (`tests/v45-dedup-shadow-or-merge.test.js`): A USER-REPORT REPRO (sub.skip=true wins) + B reverse-direction (top.skip=true wins) + C mixed (dup + distinct subs each own flag) + D isHidden companion + E source-grep regression locks (no silent-skip, V45 marker, isMainProduct discoverability) + F Rule I full-flow chain (master → buyfetch → entry → toggleCourseItem → branch 1 fires; PRE-V45 sim explicitly fails) + G 4 user-fixture cluster (เบอร์26 + เบอร์30 + PRP + ขลิบเลเซอร์). **Comprehensive professor-grade e2e** (`scripts/e2e-comprehensive-skip-stock-deduct.mjs`) covers V42+V43+V44+V45 stack: 166/166 PASS across 26 assertion categories × 13 phases × (2 current + 1 future) branches × 7 course shapes × 4 flag configurations × 5 deduct-decision branches × 4 buy paths × adversarial + idempotency + cross-branch identity + negative direction + V43 overlay rescue + V42 promo qty multiplier + mapRawCoursesToForm end-to-end. Cleanup zero orphans (32 fixtures deleted). **AV23** audit invariant: "Dedup logic in canonical mappers MUST OR-merge per-row flags into the kept entry before skipping; silent dedup-skip = drop user intent." **Lessons**: (a) **3+ fixes class-of-bug = architectural review** — V43 (overlay) + V44 (canonical mapper adoption) + V45 (dedup OR-merge) all fixed downstream layers but NEVER touched the dedup gap. The mapper's "I know better" silent dedup violated user-intent capture. (b) **Single-source mapper fixes propagate to all consumers** — 1 edit at beCourseToMasterShape benefits TFP buy + SaleTab buy + QuotationFormModal; Rule of 3 leverage. (c) **OR-semantic for flag merging** matches user mental model: "either top-level OR per-row says skip → skip"; AND-semantic loses user intent. (d) **Comment-vs-spec drift at line 3193**: comment said "ProClinic sync can include it in both places" — implied dedup was data-hygiene only. Reality: admin INTENTIONALLY uses dup-of-main to set overrides, and the dedup silently dropped intent. Comment misled the multi-reader-sweep audit (V36-quater pattern). |
| V44 | 2026-05-08 | **Course-buy product-name source fix (V12 multi-reader-sweep)** — User report (post V43 deploy): "ซื้อคอร์ส (เช่น 'ขลิบไร้เลือด (เบอร์22) 1 ครั้ง' / 'Neuramis Deep 30 CC') แล้วช่องคอร์สของลูกค้าเด้งชื่อคอร์สมาแทนชื่อสินค้า + การตัดสต็อคใช้ชื่อคอร์สไปตัด ไม่ใช้ชื่อสินค้า" — Image 2 shows 2 duplicate rows both labeled by course name (sub-products lost); Image 3 movement log shows "Neuramis Deep 30 CC" -30 instead of "Neuramis Deep" -30 → went to negativeOverage. **Root cause** (V12 multi-reader-sweep at the buy-fetcher level — exact mirror of V36-quater multi-call-site pattern): TFP buy fetcher (`TreatmentFormPage.jsx:1558+`) bypassed canonical `beCourseToMasterShape` (`backendClient.js:3150` — Phase 12.2b explicitly added main-product prepend per comment lines 3159-3166). Inline mapping `products: c.courseProducts || c.products || []` had two issues: (a) `courseProducts` field is `productName` (not `name`) → `buildPurchasedCourseEntry` reads `p.name` → undefined → falls back to `item.name` (course name); (b) main product (`mainProductId/mainProductName`) at top level of be_courses doc gets dropped entirely. SaleTab + QuotationFormModal both correctly use `beCourseToMasterShape`; TFP was the V12 gap. **Fix surfaces**: (1) TFP buy fetcher → use `beCourseToMasterShape({productLookup})` with preloaded be_products Map for unit enrichment + canonical name mapping. (2) `buildPurchasedCourseEntry` defensive — `p.name || p.productName || item.name` (BOTH branches: standard products[] map + pick-at-treatment availableProducts). (3) `assignCourseToCustomer` defensive — `p.name || p.productName || (p.isMainProduct ? masterCourse.mainProductName : '') || ''` — empty-string final fallback (NOT course-name) preserves V44 invariant that "name=courseName" is the bug signature; we never write that. (4) Pick-at-treatment placeholder mirror dual-read. **Migration**: `scripts/v44-backfill-customer-courses-product-name.mjs` (Rule M two-phase). Diag (`scripts/v44-diag-customer-courses-product-name-drift.mjs`) found 0 product-mismatch-master in current prod data — V44 fix is forward-defense for new buys; existing customer.courses[] entries (1410 total: 6 in-sync-main + 3 in-sync-sub + 71 in-sync-no-master + 1303 product-set-no-productId legacy + 27 product-eq-courseName all-orphan + 0 product-mismatch-master) need no restamping. Migration writes 0 (idempotent — clean). **Tests**: +27 V44.A-F groups in `tests/v44-course-buy-product-name-source-fix.test.js` (canonical mapper contract + defensive dual-read + Rule I full-flow Image 5 Neuramis repro + Image 1 ขลิบไร้เลือด repro + V12 multi-reader-sweep audit). **e2e**: `scripts/e2e-v44-course-buy-product-name.mjs` 70/70 PASS across 2 current + 1 future branches × 4 course shapes (main-only / main+sub-distinct / main+sub-same-id Neuramis-style / sub-only legacy) × 5 phases. **AV22 audit invariant** added: every "buy item" fetcher MUST use `beCourseToMasterShape` (single-source canonical mapper); inline `c.courseProducts || c.products` patterns are V12 multi-reader-sweep violations. **Lessons**: (a) **V12 at the buy-fetcher level** — same multi-reader-sweep pattern as V36-quater (multi-call-site) but at the OUTER mapper layer. SaleTab + QuotationFormModal already used canonical; TFP was the missing call site. (b) **Comment-vs-code drift** at `backendClient.js:3159-3166` — Phase 12.2b explicitly fixed the main-product gap in `beCourseToMasterShape` with prominent comment, but TFP's separate inline mapping NEVER adopted the canonical mapper. Comments aren't enforcement; AV22 grep guard is. (c) **"Buy-then-use-later" cohort safe** — diag confirmed prod data is clean for existing customers (no product-mismatch-master). V44 is forward-defense. (d) **Empty-string final fallback > course-name fallback** — when fields are missing, prefer empty (recoverable) over course-name (silent fingerprint of the V44 bug masquerading as a real product). |
| V43 | 2026-05-08 | **Skip-stock-deduction live-resolve + direct-product flag + migration** — User report (post V42): "ติ๊กไม่ตัดสต็อคในคอร์ส master แต่ใช้บริการจริงแล้วยังตัดอยู่ ... ใช้กับสินค้า/คอร์ส/โปรโมชั่น ต้องไร้ที่ติ". Diag (`scripts/v43-diag-customer-courses-skip-stock.mjs`) confirmed 3 prod entries on LC-26000006 with `master.sub=true / customer.flag=false` (PRP at indices 0/3/6 from "โปรโมชัน: คอร์ส บำรุงรากผม PRP 6 ครั้ง + AHL 2 ครั้ง"). Image 2 movement log showed -1/-3/-1 with note "สต็อคติดลบ — ตัดเกินคงเหลืออีก N ครั้ง" → `_deductOneItem` branch 3 (FIFO) + branch 5 (negativeOverage push) fired instead of branch 1 (course-skip). Root cause: `customer.courses[i].skipStockDeduction` denormalized at buy time → master edits AFTER purchase don't propagate. **Q1=C hybrid fix**: (a) `scripts/v43-backfill-customer-courses-skip-stock.mjs` Rule M two-phase script restamps known-bad entries from current be_courses master (dry-run found 1 customer / 3 entries needing restamp + 1355 orphan legacy ProClinic-imported entries preserved as no-master-no-resolve). (b) `overlayCustomerCoursesWithMaster` helper applied at TFP load right after `mapRawCoursesToForm` — closes future-drift gap without re-running migration. Single-source contract: lib helper + migration script + diag all use SAME `findMasterSubProduct` + `resolveEffectiveFlag` logic. **Q2=A direct-product flag**: NEW top-level `skipStockDeduction` on be_products doc + ProductFormModal UI checkbox (accent-rose-500 + Thai label "ไม่ตัดสต็อค" + data-field anchor) + `_getProductStockConfig` surfaces field alongside stockConfig + `_deductOneItem` branch 2 (NEW) emits `reason:'product-skip'` with note "ผู้ใช้ตั้งค่าให้ไม่ตัดสต็อคที่สินค้า". Distinct from branch 1 ('course-skip' — note "ผู้ใช้ตั้งค่าให้ไม่ตัดสต็อคในคอร์ส") so audit log records WHICH source decided to skip. Branch 1 has priority over branch 2 (course-row override wins over master fallback). **Q3=A**: `buildPromotionSubCourseProducts` fallback row (no-products branch) gap closed — now carries `skipStockDeduction: !!sub?.skipStockDeduction`; products[] branch defensive `skipStockDeduction: !!p?.skipStockDeduction` even though spread already preserves (V14 lock against future spread-strip). **Q4=A**: Rule M canonical migration script with `--apply` two-phase + audit doc to `be_admin_audit/v43-backfill-customer-courses-skip-stock-{ts}-{rand}` + idempotent + forensic-trail `_v43BackfilledAt: serverTimestamp()` + `_v43BackfilledFrom: <prior>` + crypto-secure random for audit id. **Files**: NEW `scripts/v43-diag-customer-courses-skip-stock.mjs` (read-only) + NEW `scripts/v43-backfill-customer-courses-skip-stock.mjs` (Rule M) + NEW `tests/v43-skip-stock-deduction.test.js` (67 tests across V43.A-M). MODIFIED `src/lib/treatmentBuyHelpers.js` (+2 helpers + V43 fallback fix), `src/components/TreatmentFormPage.jsx` (overlay wired in load path), `src/lib/backendClient.js` (`_getProductStockConfig` + `_deductOneItem` branch 2), `src/lib/productValidation.js` (skipStockDeduction in form/validate/normalize), `src/components/backend/ProductFormModal.jsx` (UI checkbox), `tests/v42-promotion-bundle-qty-multiplier.test.js` (B2.5 + B2.9 shape updates for new fallback field). **Lessons**: (a) Denormalized boolean flags + buy-time freeze = silent drift after master edit. Hybrid live-resolve overlay + backfill migration is the V12-safe pattern (single-source contract: lib helper + migration script + diag all use SAME logic). (b) Distinct skip reasons (`course-skip` vs `product-skip`) preserve audit trail integrity — admin can pinpoint WHICH master setting drove the skip in Movement Log. (c) Direct-product flag at top-level of be_products doc (not inside `stockConfig`) avoids interaction with `trackStock` semantic — "skipStockDeduction" is "tracked but don't decrement"; "trackStock=false" is "no batches at all". Different mental models = separate fields. (d) Rule M data ops + admin-SDK + dry-run-first caught migration logic in single iteration; deploy cycle would have been wasteful. (e) Orphan customers (legacy ProClinic-imported, 1355 entries) preserve frozen value — overlay no-op when no master found by courseName — safe defensive default; admin can fix manually via customer-page edit if needed. |
| V41 | 2026-05-08 | **Staff/Doctor hide-from-lists shipped** — User requested a "ไม่แสดงรายชื่อ" toggle on StaffFormModal + DoctorFormModal. Hidden persons keep login + permissions but disappear from every dropdown/picker/list system-wide. Architecture: `isHidden: boolean` field on be_staff + be_doctors + audit fields (`hiddenAt`, `hiddenBy`). `listStaff()` + `listDoctors()` default-filter `!isHidden`; opt-in `{ includeHidden: true }` for StaffTab/DoctorsTab admin lists + past-record lookup-map consumers (CustomerDetailView, TreatmentFormPage, AdminDashboard, AppointmentCalendarView). Save handlers stamp `hiddenAt` (serverTimestamp) + `hiddenBy` (uid) on transition; clear on unhide; idempotent on no-transition. Mirror `isHidden` precedent on be_products. UI: amber-tinted checkbox at top of both form modals + amber "ซ่อน" badge on rows of admin tabs. **AV20**: NEW invariant — lookup-map consumers (those that build ID→entity maps for past-record name display) MUST opt-in `{ includeHidden: true }`; picker-only consumers MUST use the default lister. Source-grep regression guards in `tests/staff-doctor-hide-consumer-sweep.test.js` lock the consumer-side classification permanently. **Lessons**: (a) default-filter at lister + opt-in is the V12-multi-reader-sweep-safe pattern (NEW pickers added later auto-secure; lookup-map consumers fail at audit if forgotten). (b) Mirror existing schema patterns (be_products.isHidden) instead of inventing a new field shape — Rule of 3 alignment. (c) Audit-stamp on transition (not on every save) preserves the original transition timestamp + makes idempotent re-saves harmless. |
| V40 | 2026-05-07 | **Branch Backup/Restore/Make-Fresh shipped** — User asked for selectable per-branch data export/import + one-click "Make Fresh" wipe with admin-only access. **3 endpoints** (`/api/admin/branch-backup-export`, `/branch-restore`, `/branch-make-fresh`) + **4 UI components** (BranchBackupTab, MakeFreshButton, MakeFreshModal, plus BranchesTab integration) + **3 CLI mirrors** (Rule M canonical) + **5 test files** (helpers + 3 Rule I flow-simulate + 1 live admin-SDK e2e). Spec at `docs/superpowers/specs/2026-05-07-branch-backup-restore-make-fresh-design.md`. **Architecture**: file format = JSON `schemaVersion: 1` saved to `gs://...backups/{branchId}/{prefix}-{ts}-{rand}.json` + signed URL for browser download. Restore mode = `overwrite` (same-branch, preserve docIds) or `clone` (T1 master/setup ONLY, re-mint docIds via cross-branch-import adapter pattern from V39, with FK remap via `T1_FK_SPEC` on courses↔products↔product-groups refs). Make-Fresh = auto-pre-fresh backup MANDATORY (server refuses without `autoBackupRef` + `bucket.file().exists()` verification) → wipe T1+T2+T3+T4 (per-customer subcollection filtered by branchId). **Permission**: admin-only (custom claim `admin: true` via `verifyAdminToken`). **Storage rules**: NEW match `backups/{branchId}/{file=**}` admin-only — added to Rule B probe list as endpoint #7 (combined firestore+storage rules deploy). **AV19**: NEW invariant — destructive ops (delete-many, wipe-branch) MUST require auto-backup-ref pre-condition that server verifies via Storage exists check; refuses on missing. **Lessons**: (a) reused V39 cross-branch-import adapter pattern (canonicalIdField + clone strip-stray-id) for clone mode FK remap — single source of truth for cross-branch ID minting. (b) Storage rules + Probe-Deploy-Probe extends Rule B from 6 to 7 endpoints; deploy now bundles `firestore:rules,storage:rules` together. (c) "Make Fresh" pattern of "destructive-with-auto-backup-mandatory" is a generalizable safety pattern — codified as AV19. (d) Phase 2 review caught dead-inner-if (V21-class structural dead code) + missing `be_product_units: 'unitId'` in canonicalIdField lookup (V39-class FK remap omission); both fixed pre-merge. (e) Live admin-SDK e2e against real prod Firestore + Storage with TEST-prefixed fixtures verified round-trip; cleanup confirmed zero orphans. |
| V39 | 2026-05-07 | **Migrate buttons silently drop branchId for promotions/coupons/vouchers/df_staff_rates** — User report: "นำเข้าสินค้า, คอร์ส, โปรโมชั่น จากหน้า tab=masterdata เข้าสาขาพระราม 3 ไม่ได้ แต่ใน ui ขึ้นว่าสำเร็จ". Diag (`scripts/diag-migrate-branch-stamping.mjs`) revealed 303 product zombies + 174 course zombies + 2 promotion zombies (no branchId field) — all updatedAt=2026-05-06 (PRE-octies). Octies fixed catalog mappers (products/courses/etc.) but missed promotions/coupons/vouchers/df_staff_rates whose wrappers were ZERO-ARITY → handleMigrate forwarded `{branchId: selectedBranchId}` and the wrappers SILENTLY DROPPED IT. **Fix Part A** (code): patched `migrateMasterPromotionsToBe` / `migrateMasterCouponsToBe` / `migrateMasterVouchersToBe` / `migrateMasterDfStaffRatesToBe` wrappers to accept `{branchId = ''} = {}` opt; patched their mappers (`buildBe{Promotion,Coupon,Voucher}FromMaster` in phase9Mappers.js + `mapMasterToDfStaffRates` in backendClient.js) to accept 5th `branchId` arg and stamp `branchId: branchId \|\| src.branchId \|\| ''` on output. **Fix Part B** (Rule M data backfill): `scripts/phase-24-0-vicies-novies-decies-backfill-zombie-branchid.mjs` stamped `branchId = พระราม-3-id` on 479 zombies (303 products + 174 courses + 2 promotions); idempotent + audit doc + skip-mismatch (39 นครราชสีมา-stamped catalog docs preserved untouched). **Fix Part D** (V38 source patch — root-cause-correct): cross-branch-import adapters previously had df-groups-only special-case stamping `id+groupId=newId`. V39 adds `canonicalIdField` to all 7 adapters (productsAdapter='productId', coursesAdapter='courseId', etc.) + each adapter's `clone` now strips stray `id` from `...rest` spread; `api/admin/cross-branch-import.js` endpoint generically stamps `cloned.id = newId` AND `cloned[adapter.canonicalIdField] = newId` post-clone. Closes V38 root cause — future cross-branch copies produce canonical shape automatically. **Tests** (70/70 NEW + 41 V38 still pass): `tests/phase-24-0-vicies-novies-decies-migrate-button-coverage.test.js` B1-B7 covers all 19 MIGRATE_TARGETS (B1 handleMigrate forwarding, B2 branch-scoped wrapper signatures, B3 universal wrapper signatures, B4 phase9 builder branchId stamping, B5 runMasterToBeMigration mapper signatures, B6 wrapper→mapper forwarding, B7 cross-branch-import adapter canonicalIdField + V39 endpoint stamp). **Audit AV18**: extended audit-anti-vibe-code with new invariant — every migrate fn for branch-scoped collection (per BSA + COLLECTION_MATRIX) MUST accept `{branchId}` opt + forward to mapper. Pattern check via grep. **Lessons**: (a) **Octies addressed 7 mappers but had blind spot for the older Phase 9 migrate path** (promotions/coupons/vouchers — written before runMasterToBeMigration unified pattern existed). When extending an opt across a family of fns, audit ALL members of the family — blind spot = silent drop = same V12 multi-writer-sweep pattern. (b) **Zero-arity wrapper signature is a footgun** — handleMigrate forwards opts blindly; if wrapper is `()` zero-arity, opts are silently dropped at the JS function-call boundary (no warning). AV18 grep guards. (c) **"Success badge with no actual write" is the worst class of UI bug** — UI shows checkmark + count > 0 because migrate fn returned `{imported: N}` truthfully; meanwhile data lacks the contract field that makes it visible. Diag is the only way to catch this — preview_eval against real Firestore (Rule I item b) catches what unit tests can't. (d) **Cross-branch-import adapter `canonicalIdField` is now the contract** — every new adapter MUST define it. Endpoint stamps generically. df-groups special-case removed in favor of pattern. |
| V38 | 2026-05-07 | **handleDelete silent no-op via spread-order override** — User report (3rd round): "สาขาพระราม 3 ลบ Products + Courses ไม่ได้". Octies (`e36811f`) supposedly fixed but bug persisted because octies addressed VISIBILITY (stamp branchId at migrate-time), not DELETE id-resolution. Diag (`scripts/diag-pram3-products-courses.mjs`) revealed: 5 products + 2 courses created by `branch-merge-apply.mjs` / `customer-branch-baseline.js` baseline-migration paths carried a stray `id` data field (legacy ProClinic numeric IDs like "276", "1235") AND lacked canonical `productId`/`courseId` fields. `listProducts`/`listCourses` did `{id: d.id, ...d.data()}` — spread order → `data.id` OVERRODE `doc.id`. `handleDelete` resolved `p.productId \|\| p.id` = `undefined \|\| data.id` (wrong path). `deleteDoc(productDoc(wrongId))` → silent no-op in Firestore → reload → doc still there → user sees "ลบไม่ได้". **Fix Part A** (code, Rule N small): swap spread to `{...d.data(), id: d.id}` in listProducts (line 10019) + listCourses (line 10081) — docId always wins. **Fix Part B** (data, Rule M one-shot): `scripts/phase-24-0-vicies-novies-novies-backfill-product-course-id.mjs` — backfill `productId`/`courseId` = docId on 5 products + 2 courses + forensic `_<entityId>BackfilledAt`/`_<entityId>BackfilledFrom`. Idempotent + audit doc + skip-mismatch (don't auto-overwrite legacy FK). **Fix Part C**: NEW `phase-24-0-vicies-novies-novies-list-spread-order.test.js` (S1-S7 unit + source-grep) + NEW `phase-24-0-vicies-novies-novies-flow-simulate.test.js` (Rule I F1-F5 chain: branch-merge → list → handleDelete → deleteDoc; F2 PRE-fix bug repro doc) + audit-anti-vibe-code AV17 invariant. **Lessons**: (a) **V12 spread-order multi-reader sweep**: pattern `{id: d.id, ...d.data()}` appears 70+ times across backendClient.js + components/backend/. Vulnerable any time data carries an `id` field. Audit AV17 enforces safer order across listers; mass sweep deferred to follow-up. (b) **Octies fixed wrong root cause** — Visibility-only test bank ($K_e36811f$ tests asserted branchId stamped on migrate output, never asserted handleDelete resolves correct docId). Rule I gap: end-of-sub-phase flow-simulate MUST chain through user click → write path, not just visibility. (c) **Baseline-migration scripts need canonical-entity-id stamp at write** — `branch-merge-apply.mjs` + `customer-branch-baseline.js` left forensic `_branchBaselineMigrated*` but skipped `productId`/`courseId` re-stamp; bug surfaced at the read-side spread. Future cross-branch copy paths MUST stamp canonical entity id = new docId. (d) **handleDelete fallback `p.productId \|\| p.id` is the right defensive shape** — but only as long as `p.id` is reliably the docId. The reader is responsible for that invariant. |

### Verbose detail — last 4 only

(All older entries: read `.claude/rules/v-log-archive.md` if investigating.)

#### V32-tris-quater (2026-04-27) — admin-mediated ID link request
- Threat model: bot must NOT confirm whether random IDs match real customers (enumeration). Same-reply ack regardless of match. Admin sees real match in `LinkRequestsTab` queue.
- 8 new files: `api/admin/link-requests.js` + `LinkRequestsTab.jsx` + `EditCustomerIdsModal.jsx` + 5 wrappers/wires. 71 tests.
- Lessons:
  1. Same-reply anti-enumeration when threat model says so
  2. Customer doc edits use Firestore **dotted-path** (`'patientData.nationalId': X`) — non-dotted `{patientData:{...}}` WIPES other fields
  3. Customer + audit log must be **batch atomic** (`db.batch().update().update().commit()`)
  4. Rate-limit by stable ID (lineUserId), not IP (LINE doesn't forward client IPs)
  5. Store last-4 of ID only in audit ledger — full ID stays in customer.patientData (rule-protected)

#### V32-tris-ter-fix (2026-04-26) — production CORS + webhook admin SDK
- Bug 1 (CORS): browser fetch to api.line.me → preflight failed. Fixed via `api/admin/line-test.js` proxy.
- Bug 2 (Rules): webhook unauth REST blocked by `be_*: if false`. Fixed by switching webhook to firebase-admin SDK.
- Lesson: NEVER weaken rules to make unauth REST work. Server-side privileged code is the right answer.
- Tests: 36 in `tests/v32-tris-ter-line-bot-fix.test.js`.

#### V32 family rounds 1-4 (2026-04-26) — Bulk PDF alignment war
- 4 rounds: V32 (blank page) → V32-bis (inline-flex) → V32-tris (position-absolute bottom:4px) → V32-tris round 2 (bottom:10px after user "ต้องเอาขึ้นอีกนิด").
- Root: `pagebreak:'avoid-all'` doesn't constrain html2pdf; `line-height:1` unitless not honored by html2canvas; `vertical-align:bottom` flaky. Solution: direct `html2canvas` + `jsPDF.addImage(...mm dims)` + `position:absolute` inner span.
- Lesson: source-grep tests can ENCODE broken behavior. Pair with runtime preview_eval geometry. Source-grep is necessary but not sufficient for visual outputs.

#### V31 (2026-04-26) — Firebase Auth orphan + credential change + self-delete
- 3 bugs: orphan on delete + missing revokeRefreshTokens on credential change + admin could delete own account.
- 3-layer fix: server tolerant delete + revoke-on-change + 3-layer self-delete guard (UX + client + server).
- Lessons:
  1. **Silent-swallow** `try{...}catch(e){console.warn('continuing');}` is anti-V21 — replace with error classification
  2. Credential-change MUST pair with `revokeRefreshTokens(uid)` when access removed/changed
  3. Self-delete needs 3 defense layers (UX + client + server)
  4. Audit grep: `grep -rn "console.warn.*continuing"`
- Tests: 111 in `tests/v31-firebase-auth-orphan-recovery.test.js`.

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
