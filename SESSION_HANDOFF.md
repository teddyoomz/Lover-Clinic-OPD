# Session Handoff — LoverClinic OPD Cross-Session State

> **This file is read FIRST every new session.** Updated by `/session-end` skill.
> Link out to `.agents/sessions/*` for detail.

---

## Current State

- **Date last updated**: 2026-04-26 EOD session 2 — V21 lightbox fix + 14.7.H-D 6-collection wireup + EFG quick wins (period + finance listener + TDZ guard)
- **Branch**: `master`
- **Last commit**: `7a9c62d feat(phase14.7.H-followup-EFG): pre-Phase-15 quick wins (period + finance listener + TDZ guard)`
- **Test count**: 4679/4679 (+93 this session — 6 BC2.spread + 15 TL9 + 32 PD + 22 LC6/LC7 + 14 TFP-HG + small adjustments)
- **Build**: clean
- **Deploy state**: ⚠️ **PARTIAL — production at `791b2de` (V21 + 14.7.H-D); EFG quick wins (`7a9c62d`) NOT YET DEPLOYED**
  - **firestore:rules**: idempotent fire (no diff this round). Probe-Deploy-Probe ✅ — all 4 endpoints 200 pre + post.
  - **Vercel prod**: `791b2de` aliased to https://lover-clinic-app.vercel.app (built 11s, deploy 32s).
  - **Pending deploy**: `7a9c62d` (period enforcement + listenToCustomerFinance + TFP TDZ guard) — user must say "deploy" THIS turn per V18.
- **Production URL**: https://lover-clinic-app.vercel.app
- **Remote sync**: master = origin/master ✅
- **Chrome MCP**: Browser 1 connected (Windows, deviceId `8bdc85cc-b6e5-47d9-b3cd-56957264819d`)
- **SCHEMA_VERSION**: 15 (auto-upgrades on print-modal open, no manual deploy needed for schema)

---

## What's Done

### Historical (carried over from earlier sessions)
- ✅ **Phase 1-13.6** — base app + master data + finance + quotations + staff/schedule/DF
- ✅ **Phase 12.2b** (2026-04-24) — Course form ProClinic parity, Rule I established, V13 logged
- ✅ **Phase 12.3** — Sale Insurance Claim UI + SaleReport "เบิกประกัน" col wiring
- ✅ **Phase 14.1** — Document Templates System: 13 seeds + CRUD + print engine
- ✅ **V14 + V15 + V16 + V17 logged** — Firestore-undefined-reject + combined-deploy + race-condition + mobile-resume reconnect
- ✅ **Phase 14.2.A-E** — All 16 doc templates (9 with ProClinic-fidelity replication via Chrome MCP, 4 our-own designs, 3 deferred to Phase 16). F1-F16 test banks (255 tests).

### Session 2026-04-26 session 2 (3 production commits, `2ee6eeb` → `7a9c62d`)
- ✅ **Phase 14.7.H Follow-up D** — wire branchId in 6 branch-future collections (be_quotations / be_vendor_sales / be_online_sales / be_sale_insurance_claims / be_expenses / be_staff_schedules); 6 form modals refactored + 6 BC2.spread tests + 6 matrix flips; mirrors AppointmentFormModal pattern from 14.7.H-A (`370854a`) **DEPLOYED**
- ✅ **V21 violation entry + fix** — TreatmentTimelineModal lightbox (Chrome blocks `<a href="data:">`) + close-on-edit (modal z-100 was hiding TFP z-80); 15 TL9 tests + lessons (TL2.6+TL5.1 had encoded broken behavior in source-grep) (`791b2de`) **DEPLOYED via V15 combined deploy**
- ✅ **Phase 14.7.H Follow-up E** — period + daysBeforeExpire integer/bound enforcement + buffet-must-have-expiry rule (V12.2b deferred); 32 PD1-PD6 tests + live preview_eval (12/12 cases pass) (`7a9c62d`) **NOT YET DEPLOYED**
- ✅ **Phase 14.7.H Follow-up F** — listenToCustomerFinance bundle (4 inner listeners with coalesce: deposits + wallets + customer-doc-points + memberships); replaces Promise.all in CustomerDetailView; reloadCustomerFinance shim added; 22 LC6+LC7 tests + live preview_eval on customer 2853 (`7a9c62d`) **NOT YET DEPLOYED**
- ✅ **Phase 14.7.H Follow-up G** — JSDoc HOOK-ORDER INVARIANT guard for TreatmentFormPage:1697 dfEntry useEffect (locks ordering vs upstream useMemo); 14 TFP-HG tests including line-number arithmetic guard (`7a9c62d`) **NOT YET DEPLOYED**

### Session 2026-04-26 EOD session 1 (full session, `0735a50` → `39ab33b`)
- ✅ **Phase 14.7.C** AppointmentTab refactor → shared AppointmentFormModal (`5897b59`)
- ✅ **Phase 14.7.D** Treatment-history redesign + 5/page pagination + ProClinic-fidelity colors (`4f9e13e`)
- ✅ **Phase 14.7.E** TreatmentTimelineModal — full ProClinic ดูไทม์ไลน์ replication, 50 TL1-TL8 tests (`f16cce2`) — **had 2 latent bugs fixed in V21**
- ✅ **Phase 14.7.F** Image-only edit stock-reverse permission fix — pure helper + firestore.rules narrow + 36 tests (`93fffca`) **DEPLOYED**
- ✅ **Phase 14.7.G** Treatment listener — onSnapshot real-time refresh on edit (no F5), 21 tests (`772ee8a`)
- ✅ **V19 violation entry** + comprehensive firestore-rules audit (`fc8125b`)
- ✅ **P0 cleanup batch** — window.__auth gated by import.meta.env.DEV + 4 regression tests + handoff refresh (`8eec8dd`)
- ✅ **Phase 14.7.H Follow-up B** — listener cluster: listenToCustomerSales / listenToCustomerAppointments / listenToAppointmentsByDate; closes 3 staleness gaps (multi-tab admin collision risk); 27 tests (`d34d03b`)
- ✅ **Phase 14.7.H Follow-up C** — VendorSalesTab route wiring (G6 was 95% done; closed last 5%); 8 tests (`73fc75e`)
- ✅ **Phase 14.7.H Follow-up A** — multi-branch infrastructure (Option 1: branchId field, ProClinic-style); BranchContext + BranchSelector + 7 consumer refactors; 73 tests; live integration test proves cross-branch transfer attribution + per-branch isolation (`39ab33b`)

### Session 2026-04-25 (carried over, 0735a50 → 2728635)
- ✅ **Phase 14.6 doc-print UX overhaul** (11 commits, c2e3544 → 49682c9)
  - Hide auto-fill HTML fields + checkbox UI for ☑/☐ marks (was emoji-paste)
  - V18 violation logged (vercel-without-asking, V4/V7 third repeat)
  - 6-issue batch: preview scroll, date BE/CE auto-format, fit-to-fly EN gender, patient signature toggle on opinion/PT/thai/chinese, doctor/staff dropdown via 'staff-select' field type
  - Doctor dropdown stuck loading + auto-upgrade Firestore on modal open (was loading forever because list wasn't fetched until template picked)
  - Doctor names compose from prefix+firstname+lastname (was empty because be_doctors raw shape uses firstname/lastname not 'name')
  - ISO date auto-format in user-typed values (restFrom/restTo etc)
  - Hand-drag pan + max-h-80vh + mouse-wheel zoom on preview
  - Text-on-underline (round 1 inline-flex didn't work; round 2 CSS-injected line-height:1 + padding-top works) + 2-col signature centering
  - Multi-line content boxes (chart/cert findings) — flex column + justify-end
  - Rich staff subtitle (6 fields: role/license/nick/dept/phone/email) + white-space:pre-wrap (preserve user newlines on print)
  - Generic auto-fill: `<baseKey><Suffix>` convention populates LicenseNo/Phone/Email/Position/NameEn/Department/Signature on staff pick

- ✅ **Phase 14.7 customer-page appointments** (1 commit, 9677c05)
  - +เพิ่มนัดหมาย / ดูทั้งหมด buttons in CustomerDetailView appointments card
  - AppointmentCard / AppointmentListModal / (initial simple) AppointmentFormModal
  - getCustomerAppointments loader + nextUpcomingAppt computation
  - 30 new tests (F1 selection, F2 list sort, F3 helper shape, F4 wiring, F5 payload)
  - Audit guard caught raw `<input type="date">` → fixed to use shared `DateField`

- ✅ **Phase 14.7.B shared AppointmentFormModal** (1 commit, 2728635)
  - Extracted full form (550 LoC) into `src/components/backend/AppointmentFormModal.jsx`
  - All AppointmentTab fields (advisor/doctor/assistants/channel/expectedSales/preparation/customerNote/appointmentColor/recurring/lineNotify/status)
  - `lockedCustomer` prop + `skipCollisionCheck` prop for customer-page mode
  - Identical payload contract with AppointmentTab.handleSave (verified F5.1-3 tests)
  - CustomerDetailView migrated to shared component (removed 153-line stub)
  - Tests 30 → 34 (+4 covering F5 contract)

---

## What's Next

### Primary: P0 user-gated deploy — `7a9c62d` (EFG quick wins) ready to ship
Production at `791b2de` (V21 + 14.7.H-D). master 1 commit ahead with EFG quick wins. User says "deploy" → V15 combined deploy (vercel + firestore:rules + Probe-Deploy-Probe).

### P1 polish queue (deferred to next session)
- Pick-at-treatment partial-pick reopen (V12.2b note) — M (3-4h) — **last remaining V12.2b deferred item**
- `listenToHolidays` + `listenToAllSales` — S each (continue listener-cluster pattern)
- TreatmentTimelineModal virtualization (only if 122-row customer reports lag) — M
- Debug-level logging for ProClinic API silent-catch sites — M

### Phase 15 readiness — UNBLOCKED ✓
- `be_branches` collection ✓
- ProductGroups + Units ✓
- BRANCH_ID hardcode REMOVED ✓
- Multi-branch reports filtering ✓ (queries accept branchId filter)
- **All 13 branch-aware collections wired** (7 from 14.7.H-A + 6 from 14.7.H-D) ✓
- **Period enforcement (V12.2b deferred)** ✓
- **Real-time finance listener** ✓
- **Phase 15 Central Stock can now be planned + started.** Skip if clinic stays single-branch.

### Phase 14 Doc verification queue (10 done / 6 remaining)
- [x] Doc 1/16 — treatment-history Medical History ✅
- [x] Doc 2/16 — medical-certificate (5 โรค) ✅
- [x] Doc 3/16 — medical-certificate-for-driver-license ✅
- [x] Doc 4/16 — medical-opinion (ลาป่วย) ✅
- [x] Doc 5/16 — physical-therapy-certificate ✅
- [x] Doc 6/16 — thai-traditional-medicine-cert ✅
- [x] Doc 7/16 — chinese-traditional-medicine-cert ✅
- [x] Doc 8/16 — fit-to-fly ✅
- [x] Doc 9/16 — patient-referral ✅
- [x] Doc 14/16 — consent (5846e05 — F12 fix landed)
- [x] Doc 16/16 — sale-cancelation (5846e05)
- [ ] Doc 10/16 — treatment-referral A5 (our own design, already ProClinic-style)
- [ ] Doc 11/16 — course-deduction (our own design)
- [ ] Doc 12/16 — medicine-label (our own 57x32mm label printer design)
- [ ] Doc 13/16 — chart **DEFER Phase 16** (graphical face/body chart)
- [ ] Doc 15/16 — treatment template **DEFER Phase 16** (graphical dental chart)

### Phase 14 follow-up phases (memory: project_print_form_world_class_roadmap.md)
- **14.8** — pre-flight required-field validation + digital signature canvas + PDF export (html2pdf)
- **14.9** — audit log + watermark + email/LINE delivery
- **14.10** — bulk print + QR embed + saved drafts
- **14.11** — visual template designer (big lift, defer)

### After Phase 14
- Phase 14.3 G6 vendor-sale wire to nav + tests + ship
- Phase 14.4 G5 customer-product-change (NOT STARTED — complex)
- Phase 15 Central Stock Conditional

---

## Outstanding User Actions (NOT auto-run)

- **`vercel --prod` for `7a9c62d`** — EFG quick wins (period enforcement + listenToCustomerFinance + TFP TDZ guard) committed + pushed but NOT yet deployed. User must say "deploy" THIS turn for next deploy. Per V18 — no roll-over. V15 combined: "deploy" = vercel + firestore:rules in parallel with Probe-Deploy-Probe.

---

## Blockers

None code-side. Production deploy gap of 1 commit (EFG quick wins) — invisible to live users until next deploy.

---

## Known Limitations / Tech Debt (carry over)

- **Doc 13/15 deferred to Phase 16** — chart (canvas drawing) / treatment-template (dental chart) are graphical surfaces beyond seed templates.
- **Phase 14.4 G5 customer-product-change NOT STARTED** — bigger feature (course exchange + refund). XL effort.
- **Pick-at-treatment partial-pick reopen** (V12.2b note) — user picks subset, can't reopen to add more. M effort, defer to polish. **Last remaining V12.2b deferred item.**
- ~~Period enforcement (V12.2b)~~ — ✅ **DONE** in `7a9c62d` (Phase 14.7.H-E).
- ~~Hook-order TDZ JSDoc guard on TreatmentFormPage:1694~~ — ✅ **DONE** in `7a9c62d` (Phase 14.7.H-G).
- ~~Bundle `listenToCustomerFinance`~~ — ✅ **DONE** in `7a9c62d` (Phase 14.7.H-F).
- **Phase 14.8/9/10/11 print-form roadmap** — pre-flight + signature canvas + PDF export + audit log + watermark + email/LINE delivery + bulk print + QR embed + visual designer. Tracked in `~/.claude/projects/F--LoverClinic-app/memory/project_print_form_world_class_roadmap.md`. XL each, defer.
- **ProClinic API silent-catch logging** — 35+ intentional `/* best effort */` blocks; debug observability gap. M to add structured logger.

---

## Violations This Session

- **V21** (`791b2de`, 2026-04-26) — Two latent UI bugs in shipped TreatmentTimelineModal: image click blocked by Chrome `<a href="data:">` policy + edit button hidden behind modal stacking (z-100 covers TFP z-80). Source-grep tests TL2.6/TL5.1 had **encoded broken behavior** in their assertions. **Lesson**: any new click handler test must pair shape grep with runtime outcome assertion (preview_eval or RTL). 15 TL9 tests + V-entry locked.

---

## Resume Prompt

Paste this into the next Claude session (or invoke `/session-start`):

```
Resume LoverClinic OPD — continue from 2026-04-26 end-of-session 2.

Read in order BEFORE any tool call:
1. CLAUDE.md (stack + env + rule index)
2. SESSION_HANDOFF.md (cross-session state of truth — master = 7a9c62d)
3. .agents/active.md (hot state — production at 791b2de, master 1 ahead)
4. .claude/rules/00-session-start.md (iron-clad A-I + V1-V21)
5. .agents/sessions/2026-04-26-pre-phase15-quickwins.md (this session detail)

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

---

## How to use this file

- `/session-end` skill auto-updates it. If editing manually, keep under ~250 lines.
- Detail lives in `.agents/sessions/YYYY-MM-DD-*.md` checkpoints.
- Resume Prompt block is the KEY output — user pastes into new chat to boot.
- Committed to repo (not memory-only) → team-visible + cross-machine synced.
