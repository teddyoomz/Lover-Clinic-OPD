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

**J. Superpowers Auto-Trigger** (added 2026-04-29 after user directive "ทำ 3 Layer และ add rule J ตามนี้เลย และใช้ using-superpower skill เป็น session boot และ ตั้งให้ fire using-superpowers ที่ session start"):
- **SESSION BOOT (mandatory, every new session + after any compaction)**: invoke `using-superpowers` skill FIRST, before any other tool call. The skill is auto-loaded as part of the user-level CLAUDE.md trigger; treat it like the SESSION_HANDOFF read — non-negotiable opening move.
  - Effect: skill instructs me to scan for relevant skills before each task and invoke them via the `Skill` tool.
- **Mandatory skill invocation BEFORE tool calls when context matches** (process-skills first per `using-superpowers` Skill Priority):
  - Sign of new feature / component / endpoint / API → `brainstorming` (HARD-GATE: NO code, NO scaffolding, NO writing-plans until design approved by user).
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
