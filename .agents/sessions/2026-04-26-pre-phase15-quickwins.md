# 2026-04-26 (session 2) — V21 lightbox + 14.7.H-D wireup + EFG pre-Phase-15 quick wins

## Summary

Sequence-of-three session. Started with multi-branch wireup for the 6 branch-future collections (Phase 14.7.H-D). User flagged TreatmentTimelineModal had two latent UI bugs (image click + edit-button-hidden); shipped V21 lightbox + close-on-edit fix and deployed via V15 combined deploy. Then user asked "ก่อน Phase 15 เหลืออะไรต้องทำอีกไหม"; chose to ship 3 quick wins (period enforcement / listenToCustomerFinance bundle / TFP hook-order JSDoc guard) with comprehensive testing per Rule I + V21 lesson. **3 production commits, 4586 → 4679 tests (+93)**.

## Current State

- **Branch**: `master`
- **HEAD**: `7a9c62d feat(phase14.7.H-followup-EFG): pre-Phase-15 quick wins (period + finance listener + TDZ guard)`
- **Production**: `791b2de` aliased at `https://lover-clinic-app.vercel.app` (V15 combined deploy 2026-04-26 — V21 fix + 14.7.H-D wireup)
- **Tests**: 4679/4679 passing
- **Build**: clean
- **firestore:rules**: live at v10 (be_stock_movements update narrowed in 14.7.F per V19); idempotent fire on this session's deploy (no diff)
- **SCHEMA_VERSION**: 15

## What shipped (chronological commit list)

| # | Commit | Phase | What |
|---|---|---|---|
| 1 | `370854a` | 14.7.H-D | Wire branchId in 6 branch-future collections — QuotationFormModal / VendorSaleFormModal / OnlineSalesTab / SaleInsuranceClaimFormModal / FinanceMasterTab.ExpensesSection / StaffSchedulesTab. Each uses the AppointmentFormModal pattern: `useSelectedBranch()` + `branchId: selectedBranchId` literal in saveX payload. 6 BC2.spread tests + 6 matrix flips + BC2.future loop relaxed. |
| 2 | `791b2de` | V21 | TreatmentTimelineModal lightbox + close-on-edit. Image click now opens in-modal Lightbox at z-110 (replaces blocked `<a href="data:...">`). Edit button calls `onClose?.()` then `onEditTreatment(t.id)` so modal yields to TreatmentFormPage at z-80. 15 TL9 tests + V21 V-entry. **DEPLOYED via V15 combined deploy.** |
| 3 | `7a9c62d` | 14.7.H-EFG | Pre-Phase-15 quick wins (3 in 1 commit): (E) period+daysBeforeExpire integer/bound enforcement + buffet rule, (F) listenToCustomerFinance bundle (4 inner listeners with coalesce), (G) TFP hook-order TDZ JSDoc guard. +68 tests across 3 test files. **NOT YET DEPLOYED — awaiting user "deploy" command per V18.** |

## Decisions (non-obvious — preserve reasoning)

### D1 — V21 lightbox uses `<button>` not `<a>` for image preview
**Why**: Chrome blocks `<a href="data:...">` top-frame navigation since 2017+ (anti-XSS hardening). Treatment images stored as base64 dataUrls. Click was silent no-op. **Lesson**: any inline-stored binary data (dataUrls) must be previewed via in-app overlay, never `<a href>` navigation.

### D2 — V21 close-on-edit pattern unconditional
**Why**: TreatmentTimelineModal at z-100 covered TreatmentFormPage at z-80. Edit button fired correctly but user saw nothing change. Fix: `onClick={() => { onClose?.(); onEditTreatment(t.id); }}`. NOT a stopPropagation issue — pure stacking-context bug. Tests now lock both ordering (z-80 < z-100 < z-110) AND the dual-call shape.

### D3 — V21 reveals V21 lesson: source-grep can encode broken behavior
TL2.6 was `expect(SRC).toMatch(/target="_blank"/)` — actively LOCKED IN the broken `<a href>` pattern. TL5.1 asserted bare `() => onEditTreatment(t.id)` (no close). Both passed because they pattern-matched the source code; neither chained click → expected outcome. **Going forward**: any new click handler test must pair source-grep (shape) with a runtime outcome assertion (preview_eval or RTL).

### D4 — Period validator widened to daysBeforeExpire
**Why**: V12.2b note flagged "period" specifically, but daysBeforeExpire has identical day-count semantics + same failure modes (decimals, over-bound, NaN). Same validateDayInteger applied to both. Same effort, more value.

### D5 — Buffet rule = `daysBeforeExpire > 0` (NOT `period > 0`)
**Why**: CourseFormModal:452 says "บุฟเฟต์ใช้ได้จนครบกำหนด" — implies validity window is required. Period placeholder is "ไม่จำกัด" — implies empty period = "no rate limit" is intentional. Enforcement matches UI hints + business reality.

### D6 — listenToCustomerFinance coalesces emit until 4/4 ready
**Why**: Alternative was emit-on-each-snapshot → 4 partial-state callbacks during initial mount → finance card flickers. Coalesce: 1 stable snapshot. ~ms latency increase, vastly better UX.

### D7 — listenToCustomerFinance does NOT lazy-write expired memberships
**Why**: getCustomerMembership writes status='expired' on expired docs. Listener variant would write on every snapshot fire (wasteful). UI handles display correctly via client-side filter `membership.expiresAt < now`. Tradeoff documented in JSDoc.

### D8 — Comprehensive testing per Rule I + V21 lesson
User directive: "เทสแบบฉลาดที่สุดว่าจะไม่พลาด". For each quick win:
- Pure source-grep (shape lock)
- Pure simulate (logic chain without React mount)
- Adversarial inputs
- Live preview_eval on real data (Rule I item b)

V21 + V13 + V14 cluster all share the failure mode: tests pass while real flow broken. Pure-helper tests are necessary but NOT sufficient.

## Blockers

None code-side. EFG quick wins commit `7a9c62d` pushed to master but production still on `791b2de`. User must say "deploy" THIS turn (per V18) for next deploy.

## Files Touched (this session)

### NEW (1 file)
- `tests/tfp-hook-order-tdz-guard.test.js` — 14 tests across 3 groups

### Modified (heavy)
- `src/components/backend/QuotationFormModal.jsx` — useSelectedBranch + branchId payload
- `src/components/backend/VendorSalesTab.jsx` — useSelectedBranch in VendorSaleFormModal sub-component
- `src/components/backend/OnlineSalesTab.jsx` — useSelectedBranch + branchId payload
- `src/components/backend/SaleInsuranceClaimFormModal.jsx` — useSelectedBranch + branchId payload
- `src/components/backend/FinanceMasterTab.jsx` — useSelectedBranch in ExpensesSection sub-component
- `src/components/backend/StaffSchedulesTab.jsx` — useSelectedBranch + branchId payload
- `src/components/backend/TreatmentTimelineModal.jsx` — V21 Lightbox + close-on-edit (~80 LOC + Lightbox helper)
- `src/components/backend/CustomerDetailView.jsx` — listenToCustomerFinance migration (Promise.all → listener)
- `src/components/TreatmentFormPage.jsx` — JSDoc guard upgrade for hook-order TDZ
- `src/lib/courseValidation.js` — validateDayInteger helper + buffet rule
- `src/lib/backendClient.js` — listenToCustomerFinance bundle (~110 LOC)
- `tests/branch-collection-coverage.test.js` — 6 matrix flips + 6 BC2.spread tests + BC2.future relaxed
- `tests/customer-treatment-timeline-flow.test.js` — TL2.6 + TL5.1 rewritten + 15 new TL9 tests
- `tests/courseValidation.test.js` — CV13 updated + 32 new PD1-PD6 tests
- `tests/listener-cluster.test.js` — 22 new LC6 + LC7 tests
- `.claude/rules/00-session-start.md` — V21 entry added before V20

### Modified (light)
- `SESSION_HANDOFF.md` — refreshed (this session-end)
- `.agents/active.md` — refreshed (this session-end)

## Live integration tests run (preview_eval against real Firestore)

User authorizations from earlier sessions still in force ("Generate อะไรจริงๆขึ้นมาเทสใน backend ได้ไม่จำกัด").

### Test 1 — V21 lightbox + close-on-edit (customer 2853, 122 treatments)
- Modal renders 122 edit + 69 zoom buttons cleanly
- Click zoom: lightbox opens at z-110, dataUrl image renders, modal still at z-100 underneath, aria-label correct
- Esc: lightbox closes, modal stays open
- Click edit: modal closes (`modalClosed: true`), TreatmentFormPage renders (`hasTfpField: true`)

### Test 2 — Period validator (cache-busted import)
- 12/12 runtime cases pass — buffet+empty-dbe rejected, period=7.5 rejected, period=99999 rejected, valid combos accepted
- All errors return correct Thai messages

### Test 3 — listenToCustomerFinance (customer 2853)
- Empty cid → emits zero-state synchronously, returns no-op unsub ✓
- Real customer → 1 emit (coalesce ✓), shape correct, deposit=5000 / wallet=207000 / points=699 / GOLD active ✓
- After page reload → all 4 finance numbers render in DOM ✓

## Commands run (representative)

```bash
# Tests + build (per quick win + final sweep)
npx vitest run tests/customer-treatment-timeline-flow.test.js
npx vitest run tests/courseValidation.test.js
npx vitest run tests/listener-cluster.test.js
npx vitest run tests/tfp-hook-order-tdz-guard.test.js
npx vitest run tests/branch-collection-coverage.test.js tests/branch-isolation.test.js
npm test -- --run                                            # full sweep — 4679 final
npm run build                                                # V11 verification per commit

# V15 combined deploy (after 791b2de)
TS=$(date +%s) BASE=".../artifacts/loverclinic-opd-4c39b/public/data"
curl -X POST "$BASE/chat_conversations?documentId=test-probe-$TS&key=$KEY"
curl -X PATCH "$BASE/pc_appointments/test-probe-$TS?updateMask.fieldPaths=probe&key=$KEY"
# … (4 endpoints pre + post = 200/200/200/200/200/200/200/200)
vercel --prod --yes & firebase deploy --only firestore:rules
# cleanup probes (chat_conv 403 expected, pc_appt deleted, clinic_settings stripped)

# Git: commit + push every milestone
git add <files> && git commit -m "..." && git push origin master
```

## Iron-clad rules invoked this session

- **Rule A** (revert on regression): not invoked — no regressions to revert.
- **Rule B** (Probe-Deploy-Probe): used 1× for V15 combined deploy of `791b2de`; all probes 200 pre + post.
- **Rule C** (anti-vibe-code): C1 Rule of 3 hit when adding the 4th customer-scoped listener (listenToCustomerFinance) — bundled it into one helper instead of 4 sibling hooks. C2 not invoked.
- **Rule D** (continuous improvement): every shipped commit added tests; V21 entry permanent.
- **Rule E** (backend Firestore-only): all 6 form modals confirmed Firestore-only — no broker imports added.
- **Rule F** (Triangle): not heavily invoked — mostly internal refactor + bug fix from user report.
- **Rule I** (full-flow simulate): every quick win included pure helper tests + flow simulate + adversarial + source-grep + live preview_eval.

## V-entries logged

- **V21** (`791b2de`) — Two latent UI bugs in shipped TreatmentTimelineModal: image click blocked by Chrome `<a href="data:">` policy + edit button hidden behind modal stacking. Source-grep tests TL2.6/TL5.1 had encoded broken behavior. Lesson: any new click handler test must pair shape grep with runtime outcome assertion. 15 TL9 tests + comprehensive V-entry.

## Next todo (ranked by priority + risk)

### P0 (user-gated, ready to deploy)
1. **`vercel --prod` for `7a9c62d`** — EFG quick wins committed + pushed; production still on `791b2de`. User says "deploy" → V15 combined deploy.

### P1 (next 1-2 sessions if user wants)
1. **Pick-at-treatment partial-pick reopen** (V12.2b note) — M effort (3-4h). Last remaining V12.2b deferred item. UX gap: user picks subset of a course at treatment time, can't reopen to add more.
2. **`listenToHolidays` + `listenToAllSales`** — S effort each. Continue listener-cluster pattern for further multi-tab consistency.
3. **`be_branches` listener (in BranchContext provider)** — already done per BR1.4 source check; verify still listening + not regressed.

### P2 (defer to polish phase)
4. TreatmentTimelineModal virtualization (only if 122-row customer reports lag — not currently observed)
5. Phase 14.4 G5 customer-product-change (course exchange + refund) — XL effort, NOT STARTED
6. Phase 14.8/9/10/11 print-form roadmap (PDF export, watermark, audit log, bulk print, designer)
7. Debug-level logging for ProClinic API silent-catch sites (35+ locations)

### Phase 15 readiness — UNBLOCKED ✓
- `be_branches` collection ✓
- ProductGroups + Units ✓
- BRANCH_ID hardcode REMOVED ✓
- Multi-branch reports filtering ✓
- 13 collections wired (7 from 14.7.H-A + 6 from 14.7.H-D) ✓
- Period enforcement (V12.2b deferred item) ✓
- Real-time finance listener ✓
- **Phase 15 (Central Stock Conditional) can now be started.**

## Resume Prompt (paste into next chat)

```
Resume LoverClinic OPD — continue from 2026-04-26 end-of-session 2.

Read in order BEFORE any tool call:
1. CLAUDE.md (stack + env + rule index)
2. SESSION_HANDOFF.md (cross-session state of truth — master = 7a9c62d)
3. .agents/active.md (hot state — production at 791b2de, master 1 ahead)
4. .claude/rules/00-session-start.md (iron-clad A-I + V1-V21)
5. .agents/sessions/2026-04-26-pre-phase15-quickwins.md (this session's detail)

Status summary:
- master = 7a9c62d, 4679/4679 tests passing, build clean
- Production: 791b2de LIVE — V21 fix + 14.7.H-D wireup deployed
- master 1 commit ahead with EFG quick wins (period enforcement +
  listenToCustomerFinance + TFP hook-order JSDoc guard) NOT YET DEPLOYED
- V21 entry logged
- Phase 15 (Central Stock Conditional) is now technically UNBLOCKED

Next action (when user gives go-ahead):
- If user wants EFG live: V15 combined deploy of 7a9c62d (vercel +
  firestore:rules with full Probe-Deploy-Probe per Rule B)
- If user wants more polish before Phase 15: pick-at-treatment
  partial-pick reopen (last V12.2b deferred, M ~3-4h)
- If user wants to start Phase 15: Central Stock Conditional planning

Outstanding user-triggered actions (NOT auto-run):
- vercel --prod for 7a9c62d (EFG quick wins)

Rules:
- No deploy unless user explicitly says "deploy" THIS turn (V4/V7/V18)
- V15 combined: "deploy" = vercel + firestore:rules in parallel
- Probe-Deploy-Probe with /artifacts/{appId}/public/data prefix (V1/V9/V19)
- Multi-branch decision is locked at Option 1 (V20) — don't re-debate
- be_stock_movements update narrowed to reversedByMovementId only (V19)
- V21 lesson: source-grep tests can encode broken behavior — pair with
  runtime outcome assertions (preview_eval or RTL)
- Every bug → test + audit invariant + V-entry (Rule D + Rule I)

Invoke /session-start to boot context.
```
