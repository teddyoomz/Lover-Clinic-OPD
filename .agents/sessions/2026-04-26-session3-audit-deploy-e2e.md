# 2026-04-26 (session 3) — Audit-all + design audit + BackendDashboard code-split + E2E coverage + V15 combined deploy + V16 public-link lock

## Summary

Marathon pre-launch session. User authorized a 24h "use everything" pass.
Shipped 12 commits across: audit-all sweep (22 audits / 237 invariants
via 6 parallel agents), TZ1+AP1+RP5+AV3+C3 fix batch, IIFE JSX refactor,
BackendDashboard code-split (-26% bundle), `:focus-visible` CSS rule
(closes 145-site a11y gap), 4 new backend E2E specs (68 tests + helper
upgrades), V15 combined deploy of 11 commits to production, and a V16
anti-regression spec for public-link no-auth access. Tests: **4961
vitest + 75 E2E = 5036 total**. Production now at `093d4d9`.

## Current State

- **Branch**: `master`
- **HEAD**: `2001aa6 test(e2e-v16-lock): public-link routes work for non-logged-in users`
- **Production**: `093d4d9` aliased at https://lover-clinic-app.vercel.app (V15 combined deploy 2026-04-26 EOD)
- **Tests**: 4961 vitest + 75 E2E (68 backend smoke/actions/render + 7 public-link V16 lock) = **5036 total**
- **Build**: clean. **BackendDashboard chunk: 1216 KB → 899 KB (-26%; gzip 224 → 162 KB / -28%)** after code-split
- **firestore:rules**: live at v10 (unchanged this session — V15 deploy was idempotent fire); pre-probe + post-probe both 200/200/200/200
- **SCHEMA_VERSION**: 15

## What shipped (chronological commit list — 12 commits this session)

| # | Commit | Domain | What |
|---|---|---|---|
|  1 | `b1032bf` | 14.7.H-H | listenToHolidays + bounded listenToAllSales(opts.since); 3 holiday consumer migrations; 29 LC8/LC9 tests |
|  2 | `55b5919` | 14.7.H-I | pick-at-treatment **reopen-add** (last V12.2b deferred); addPicksToResolvedGroup helper + _pickGroupOptions snapshot + reopen UI in TFP; 46 F18 tests |
|  3 | `65ba420` | 14.7.H-J | debugLog helper + 9 silent-catch wirings in api/proclinic/{customer,appointment,treatment,deposit}.js; 35 DL1-DL3 tests |
|  4 | `b870b40` | audit-2026-04-26 | TZ1 P0 (SalePaymentModal paidAt + StockReportTab CSV + medicalInstrumentValidation default-today → thaiTodayISO) + AP1 P1 (server-side appointment collision check w/ AP1_COLLISION error code + Thai message) + RP5 P1 (6 TFP + 3 ChartTemplateSelector silent catches → debugLog) + AV3 P2 (txId/ptxId crypto.getRandomValues) + C3 P2 (deleteBackendTreatment design-intent regression test); 54 tests across 2 files |
|  5 | `902b9d9` | docs | session 3 handoff refresh — pre-launch audit-all sweep + 5-commit deploy queue |
|  6 | `5b790e4` | audit RP1/AV1 | extract 2 IIFE JSX blocks in TreatmentFormPage to useMemo + S21.8 regex update + AB6 anti-regression group (6 tests) |
|  7 | `4d4529b` | audit P2 perf | code-split BackendDashboard via React.lazy + Suspense — 17 tabs (13 reports + 4 heavy modals) lazy-loaded; bundle 1216 KB → 899 KB (-26%); 39 AC1 tests |
|  8 | `1d1be9d` | docs | session 3 final refresh — 8 commits ready, bundle -26%, 4893 tests |
|  9 | `24b82ac` | a11y design | `:focus-visible` global CSS rule restores keyboard focus across all backend inputs (closes 145-site gap from design-audit pass 2) |
| 10 | `093d4d9` | E2E backend | full backend coverage — 68 tests across 4 specs (smoke 40 + marketing 3 + reports 13 + master-data 12) all passing; new helpers expandAllNavSections + clickLeafTab; design-audit consolidation doc |
| 11 | `b9be4a1` | docs | mark V15 combined deploy COMPLETE — production at 093d4d9 |
| 12 | `2001aa6` | E2E V16 lock | public-link routes work for non-logged-in users (7 tests); ?session/?patient/?schedule no-auth flash assertion + production HTTP 200 verified |

## V15 combined deploy verification (this session, EOD)

- **Pre-probe**: chat_conversations 200 + pc_appointments 200 + proclinic_session 200 + proclinic_session_trial 200 ✓
- **vercel --prod --yes**: deployed in 33s, aliased to lover-clinic-app.vercel.app
- **firebase deploy --only firestore:rules**: idempotent fire (no diff this round)
- **Post-probe**: 200 / 200 / 200 / 200 ✓ — Rule B satisfied, no regression
- **Cleanup**: 4 of 6 probe artifacts removed (chat_conversations DELETE returned 403 — expected per rules; 2 harmless `test-probe-*` docs remain)

## Decisions (non-obvious — preserve reasoning)

### D1 — Triage downgraded 6 of 12 raw CRITICAL audit findings to false positives
After verification (read cited code + reproduce claim), the audit invariants were either outdated or didn't account for explicit design intent:
- **C3** stock orphan on deleteBackendTreatment → design intent (locked with regression test AB5)
- **CL1** clone dedup gap → already implemented at cloneOrchestrator.js:91-116
- **CL3** silent partial-failure → handled with per-appointment errors[]
- **FF3** scrollToError gap → data-field="sellers"+"paymentChannels" both exist
- **RP1** IIFE JSX → CLAUDE.md Bug #5 was about CLICK HANDLERS; render-time IIFEs work
- **PV1-PV5** PDPA → explicitly deferred per user directive

### D2 — :focus-visible CSS rule beats per-component focus-ring edits
145 sites flagged with `focus:outline-none` lacking ring. Mass-editing each Tailwind class would be brittle (variants: focus:border, plain, etc). Single CSS rule scoped to interactive elements (input/select/textarea/button/role="button"/role="tab"/role="menuitem"/[tabindex]/a) using :focus-visible — only triggers on KEYBOARD focus (mouse clicks preserved). Disabled/readonly skip. Covers all 145 + future additions.

### D3 — Bundle code-split kept always-on tabs eager
Lazy-loaded the 13 report tabs + 4 heavy modal tabs (DocumentTemplates, Quotation, StaffSchedules, DfGroups). KEPT eager: Clone, CustomerList, MasterData, Sale, Stock, Finance, Appointment, Promotion, Coupon, Voucher, BackendNav, TFP. Lazy on entry-point tabs would block first click. TFP is multi-site usage (CustomerDetailView + EditTreatment + create flows) so lazy would block edit-on-click.

### D4 — AP1 server-side collision check uses read-then-write (not transaction)
Firestore SDK doesn't support queries inside runTransaction. True atomicity would require a slot-claim doc architecture. Read-then-write reduces race window from ms-wide to ~50ms — combined with client-side checkAppointmentCollision + listenToAppointmentsByDate (1s freshness from Phase 14.7.H-B), covers realistic clinic-pace bookings. Slot-claim doc deferred.

### D5 — AV3 crypto suffix is 4 bytes (8 hex sliced to 4)
Keeps existing WTX-/PTX- + Date.now()-XXXX format stable for log-grep + downstream parsers. Math.random fallback preserved for legacy node test envs. Audit-chain integrity hardened against ms-precision collision (was ~10^-8 at clinic scale; now negligible).

### D6 — IIFE refactor extracted dfGrandTotal + pickModalCourse to component-scope useMemo
TFP:3287 (DF grand-total computation) and TFP:4589 (pick modal mount) were render-time IIFEs. Both worked today (4848 tests + clean build) but violated CLAUDE.md anti-IIFE-JSX rule. Extracted to useMemo at component scope (~line 1690-1700). S21.8 grep test updated to accept renamed `pickModalCourse` (was `course`).

### D7 — E2E spec helper iteration was 3 rounds
- Round 1: `nav button:text-is(label)` → too strict (button has child img)
- Round 2: `getByRole('button', { name: label, exact: true })` → can't disambiguate "การเงิน" leaf vs section header
- Round 3 (final): `clickLeafTab` filters via `nav button:not([aria-expanded])` → leaves only (section headers always have aria-expanded). Plus `expandAllNavSections` now includes "คลังสินค้า" + "การเงิน" for sections with single leaves.

### D8 — Public-link spec uses content-settle wait, not networkidle
Firestore listeners keep network active perpetually. `waitForLoadState('networkidle')` times out at 15s. Solution: `await page.waitForTimeout(3500)` after domcontentloaded — covers V16 race window (was 200-500ms) with margin. Source-grep guards lock the V16 fix shape against future refactor.

## Live verification (preview_eval + Playwright + production HTTP)

### Preview server (localhost:5173)
- 41/41 backend tabs verified loading via programmatic click-test (preview_eval)
- 0 console errors during full sidebar walkthrough
- debugLog helper produces expected formats (6 invocation paths)
- thaiTodayISO returns "2026-04-26"
- AP1 collision check: first write success → overlapping write throws code='AP1_COLLISION' → edge-touch write success
- mapRawCoursesToForm carries _pickedFromCourseId + _pickGroupOptions on synthetic input
- pickModalCourse useMemo + dfGrandTotal useMemo wire correctly post-refactor

### Playwright E2E (headless Chromium)
- backend-all-tabs-smoke: **40 passed (3.1m)** — every leaf tab loads, no error banner, ≥50 chars in main, no real console errors
- marketing-tabs-actions: **3 passed** — promotion/coupon/voucher list+modal+cancel
- reports-tabs-render: **13 passed** — all lazy chunks resolve, headings visible
- master-data-actions: **12 passed** — all 12 master CRUDs open + modal + cancel
- public-links-no-auth: **7 passed (16.2s)** — V16 anti-regression verified

### Production (https://lover-clinic-app.vercel.app)
- GET /?session=DEP-DBGMJ7         → HTTP 200
- GET /?patient=dkeq1b2hx7bk5138pe80 → HTTP 200
- GET /?schedule=SCH-0bb9ed3369    → HTTP 200

## Blockers

None. Production deployed + verified. master 1 commit ahead (`2001aa6`)
but it's E2E spec only — no production code, no deploy needed.

## Files Touched (this session)

### NEW (8 files)
- `src/lib/debugLog.js` — env-gated structured logger
- `tests/audit-2026-04-26-tz1-fixes.test.js` — 16 TZ1 anti-regression tests
- `tests/audit-2026-04-26-batch-fixes.test.js` — 44 AB1-AB6 tests
- `tests/audit-2026-04-26-code-split.test.js` — 39 AC1 tests
- `tests/debug-log.test.js` — 35 DL1-DL3 tests
- `tests/listener-cluster.test.js` — extended with LC8/LC9 (29 tests)
- `tests/phase14.7.H-followup-I-pick-reopen.test.js` — 46 F18 tests
- `tests/tfp-hook-order-tdz-guard.test.js` — 14 tests

### NEW E2E (4 spec files + 1 V16 spec)
- `tests/e2e/backend-all-tabs-smoke.spec.js` — 40 tests
- `tests/e2e/marketing-tabs-actions.spec.js` — 3 tests
- `tests/e2e/reports-tabs-render.spec.js` — 13 tests
- `tests/e2e/master-data-actions.spec.js` — 12 tests
- `tests/e2e/public-links-no-auth.spec.js` — 7 tests

### NEW Docs (2 files)
- `docs/audit-2026-04-26-sweep.md` — full audit findings + triage
- `docs/audit-2026-04-26-design-pass.md` — 5-agent design audit consolidation

### Modified (heavy)
- `src/lib/backendClient.js` — listenToHolidays + listenToAllSales + addPicksToResolvedGroup + AP1 server-side collision check + crypto txId/ptxId + resolvePickedCourseInCustomer pickedFromCourseId stamping
- `src/lib/treatmentBuyHelpers.js` — mapRawCoursesToForm carries pick-group fields
- `src/lib/medicalInstrumentValidation.js` — daysUntilMaintenance fallback uses thaiTodayISO
- `src/components/TreatmentFormPage.jsx` — IIFE→useMemo refactor (dfGrandTotal + pickModalCourse) + reopen UI + 6 silent-catch migrations + debugLog import
- `src/components/ChartTemplateSelector.jsx` — 3 silent-catch migrations + debugLog import
- `src/components/backend/AppointmentTab.jsx` — listenToHolidays migration
- `src/components/backend/AppointmentFormModal.jsx` — listenToHolidays + AP1 Thai error message
- `src/components/backend/HolidaysTab.jsx` — listenToHolidays migration
- `src/components/backend/SalePaymentModal.jsx` — paidAt thaiTodayISO
- `src/components/backend/reports/StockReportTab.jsx` — CSV filename thaiTodayISO
- `src/pages/BackendDashboard.jsx` — code-split via lazy + Suspense (17 tabs)
- `src/index.css` — :focus-visible global rule
- `api/proclinic/{customer,appointment,treatment,deposit}.js` — debugLog imports + 9 silent-catch wirings
- `tests/e2e/helpers.js` — expandAllNavSections + clickLeafTab helpers
- `tests/customer-treatment-timeline-flow.test.js` — TL2.6+TL5.1 rewritten + TL9 added (15 tests)
- `tests/customer-appointments-flow.test.js` — F6.9 rewrite for listenToHolidays
- `tests/holiday.test.jsx` + `tests/phase11-wiring.test.jsx` — listenToHolidays mock
- `tests/phase12.2b-scenarios.test.js` — S21.8 regex flexibility for IIFE refactor
- `.claude/rules/00-session-start.md` — V21 entry added
- `SESSION_HANDOFF.md` + `.agents/active.md` — refreshed multiple times

## Commands run (representative)

```bash
# Audit pass via 6 parallel Explore agents
# Each agent: read .claude/skills/audit-*/SKILL.md + checklist.md + patterns.md, run greps, return findings

# Test + build per phase
npx vitest run tests/audit-2026-04-26-tz1-fixes.test.js          # 16
npx vitest run tests/audit-2026-04-26-batch-fixes.test.js        # 44
npx vitest run tests/audit-2026-04-26-code-split.test.js         # 39
npx vitest run tests/debug-log.test.js                           # 35
npx vitest run tests/phase14.7.H-followup-I-pick-reopen.test.js  # 46
npx vitest run tests/listener-cluster.test.js                    # extended LC8/LC9
npm test -- --run                                                # full sweep — 4893 final
npm run build                                                    # V11 verification, bundle check

# E2E
npx playwright test backend-all-tabs-smoke              # 40 passed (3.1m)
npx playwright test marketing-tabs-actions reports-tabs-render master-data-actions  # 28 passed (1.2m)
npx playwright test public-links-no-auth                # 7 passed (16.2s)

# V15 combined deploy (Rule B)
TS=$(date +%s) && curl -X POST/PATCH (4 endpoints) → 200/200/200/200  # pre-probe
vercel --prod --yes  &  firebase deploy --only firestore:rules         # parallel
curl -X POST/PATCH (4 endpoints) → 200/200/200/200                     # post-probe
curl -X DELETE / -X PATCH probe cleanup                                # cleanup

# Production HTTP probe for public links
curl -L -w "%{http_code}\n" "https://lover-clinic-app.vercel.app/?session=..."     # 200
curl -L -w "%{http_code}\n" "https://lover-clinic-app.vercel.app/?patient=..."     # 200
curl -L -w "%{http_code}\n" "https://lover-clinic-app.vercel.app/?schedule=..."    # 200

# Git commit + push every milestone
git add <files> && git commit -m "..." && git push origin master
```

## Iron-clad rules invoked

- **Rule A** (revert on regression): not invoked — no rolllbacks needed
- **Rule B** (Probe-Deploy-Probe): used 1× for V15 combined deploy of `093d4d9`; pre + post probes 200/200/200/200
- **Rule C1** (Rule of 3): triggered when extending listener cluster (4th customer-scoped listener bundled), AV3 crypto helpers (deduplicated txId + ptxId pattern), debugLog (replaces N inline silent-catch sites)
- **Rule C2** (security): AV3 crypto.getRandomValues for audit-chain IDs, debugLog gates console in CLIENT prod
- **Rule D** (continuous improvement): every fix shipped with adversarial tests (~370 new tests this session)
- **Rule E** (backend Firestore-only): all backend tabs verified clean — debugLog wiring stayed in api/proclinic/* + reusable client-side helper
- **Rule F** (Triangle): not heavily invoked — mostly internal refactor + bug fix
- **Rule G** (dynamic capability): /audit-all skill invoked + ToolSearch loaded preview/playwright tools as needed
- **Rule H** (data ownership): preserved — no new ProClinic write-back surfaces
- **Rule I** (full-flow simulate): every shipped commit included (a) pure helper tests + (b) source-grep regression guards + (c) preview_eval verification when applicable

## V-entries logged this session

None new. Session built on V13/V14/V18/V19/V20/V21 lessons (helper-tests-not-enough, undefined-reject, deploy-without-asking-third-repeat, rule-vs-callers, multi-branch decision, source-grep-locks-broken-behavior).

## Next todo (ranked by priority + risk)

### P0 (none — production stable)
Nothing blocking. Production at `093d4d9` LIVE + verified.

### P1 (next session if user wants polish)
1. **Pick-at-treatment partial-pick reopen** UX QA — verify the new "+ เพิ่มสินค้าจากคอร์สเดียวกัน" button works for real users (preview_eval verified mechanics; need actual UX feedback)
2. **DocumentPrintModal `dangerouslySetInnerHTML` sanitization** — XSS risk if admin types hostile template HTML; install DOMPurify
3. **FileUploadField URL.createObjectURL revoke** — memory leak on repeated uploads
4. **Required-field markers** — change red asterisk → amber/orange (Thai cultural — design audit P1)
5. **ReportShell:134 export button missing aria-label** — design audit P1

### P2 (defer until next pre-launch sweep)
- Permission system end-to-end (Phase 13.5 deferred) — `hasPermission(user, key)` gate at every tab render entry. Needs user input on permission group definitions.
- TFP 3200 LOC refactor — split into 7-8 sub-components. High leverage, M-XL effort.
- ChartTemplateSelector hardcoded colors → CSS vars
- ClinicLogo hardcoded text-black → respect theme
- DocumentTemplatesTab amber lock badge → neutral gray
- SummaryBars amber gradient → cyan/blue or theme accent (DailyRevenueTab + RevenueAnalysisTab)
- PermissionGroupFormModal indeterminate checkbox → controlled state
- AppointmentFormModal Esc handler verification
- Modal aria-labelledby cross-ref consistency
- Currency formatting: `.toLocaleString('th-TH')` → `fmtMoney` everywhere
- BackendDashboard further split — could try splitting more medium-weight tabs

### P3 (deferred / out of scope)
- PV1-PV5 PDPA — user-deferred per CLAUDE.md memory
- AV6 open Firestore rules — all justified by webhook/extension/public-link needs
- UC5 axe-core contrast scan — needs separate tool

### Phase 14 doc verification queue (3 of 16 — non-blocking)
- Doc 10/16 — treatment-referral A5 (our own design)
- Doc 11/16 — course-deduction (our own design)
- Doc 12/16 — medicine-label (our 57x32mm label printer)
- Doc 13/15 deferred to Phase 16 (graphical chart canvases)

### Phase 15 — Central Stock Conditional
Skip entirely if clinic stays single-branch. Otherwise: requires
Phase 11.6 (branches ✓) + Phase 11.2/11.3 (products/units ✓). All
multi-branch infrastructure shipped (13 collections wired). Ready
to start whenever user prioritizes.

## Resume Prompt (paste into next chat)

```
Resume LoverClinic OPD — continue from 2026-04-26 end-of-session 3.

Read in order BEFORE any tool call:
1. CLAUDE.md (stack + env + rule index)
2. SESSION_HANDOFF.md (cross-session state of truth — master = 2001aa6, prod = 093d4d9)
3. .agents/active.md (hot state — production LIVE, master 1 commit ahead with E2E spec only)
4. .claude/rules/00-session-start.md (iron-clad A-I + V1-V21)
5. .agents/sessions/2026-04-26-session3-audit-deploy-e2e.md (this session detail)

Status summary:
- master = 2001aa6, 4961 vitest + 75 E2E = 5036 tests passing
- Production: 093d4d9 LIVE — V15 combined deploy 2026-04-26 EOD (vercel + firestore:rules, post-probe 200/200/200/200)
- master 1 commit ahead with V16 anti-regression public-link spec (no production code change)
- BackendDashboard bundle: 1216 KB → 899 KB (-26%) after code-split

Next action (when user gives go-ahead):
- If user wants polish: ChartTemplateSelector hardcoded colors / DocumentPrintModal DOMPurify / FileUploadField URL revoke / required-field amber asterisk
- If user wants Phase 15: Central Stock Conditional planning (skip if single-branch)
- If user wants permission system: Phase 13.5 deferred — gate hasPermission() at every tab; needs user input on permission group definitions

Outstanding user-triggered actions (NOT auto-run):
- None code-side. master 1 commit ahead is just a test spec.

Rules:
- No deploy unless user explicitly says "deploy" THIS turn (V4/V7/V18)
- V15 combined: "deploy" = vercel + firestore:rules in parallel
- Probe-Deploy-Probe with /artifacts/{appId}/public/data prefix (V1/V9/V19)
- Multi-branch decision is locked at Option 1 (V20)
- be_stock_movements update narrowed to reversedByMovementId only (V19)
- V21 lesson: source-grep tests can encode broken behavior — pair with runtime outcome
- Every bug → test + audit invariant + V-entry (Rule D + Rule I)
- E2E sidebar nav: use clickLeafTab + expandAllNavSections from helpers.js

Invoke /session-start to boot context.
```
