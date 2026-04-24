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
