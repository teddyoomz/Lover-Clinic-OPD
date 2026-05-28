# Wiki Log

Chronological, append-only. Every entry starts `## [YYYY-MM-DD] <op> | <title>` so it's greppable: `grep "^## \[" wiki/log.md | tail -10`.

## [2026-05-28 EOD+1] update | V125 light-theme WCAG-AA — aaAccent helper + arbitrary-hex CTA white-restore (SHIPPED + DEPLOYED + prod-verified)

`/session-start → Outstanding ทำเลย`. Re-proved the 3 outstanding L1 items live (appt real-time strip 2→3/3→2 cross-process; chart relay PC-side pairing modal + accurate presence). The treatment-form L1 contrast scan FOUND **19 light-theme AA fails V124's class-based CSS overrides couldn't reach** (the one surface V124 didn't individually scan) → fixed across 2 classes: (1) inline `style={{color:'#…500'}}` accents → NEW `aaAccent(hex,isDark)` helper deepens -500/-400 → -700 in light (SectionHeader/ActionBtn + 12 spans + ChartSection + TreatmentTimeline); (2) doctor-note save button `bg-[#7c3aed] text-white` darkened to 3.05:1 by V124's blanket `.text-white→dark` (white-restore matched only Tailwind `bg-{c}-`) → index.css restore for the arbitrary hex (→5.2 AA; teal/LINE-green left dark, already AA).

**Verify (Rule Q / Q-vis)**: T7 20/0 (AA-math every target ≥4.5 + source-grep) + build clean + full suite 14990 pass (1 pre-existing global.fetch-leak flake, passes 51/0 isolated) + **post-deploy re-scan on the LIVE build**: treatment form 0 fails (1372 els) + sale/finance tab 0 (2186 els, no regression) + appt view 0 + zoom (violet white, headers deepened). Commit `f56bfa9b`, deployed `vercel --prod` → lover-clinic-app.vercel.app (no rules → no Probe-Deploy-Probe). PatientForm = separate design pass (bespoke brand colors).

**Production this entry**: NEW entity [themeAccent.js / aaAccent](entities/theme-accent.md) + NEW concept [Light-theme WCAG-AA accent handling](concepts/light-theme-aa.md). Index extended +2 rows (1 entity + 1 concept) + date-updated 2026-05-26 → 2026-05-28. `graphify update .` ran (AST-only; graph.json refreshed). Cross-refs: aaAccent ↔ light-theme-aa ↔ TreatmentFormPage ↔ V124/V125 (v-log-archive.md).

## [2026-05-26 EOD+5] ingest | Patient-link hide-empty boxes + auto-cleanup of stale links (AV135) — LOCAL, awaiting deploy

Single-session `/session-start → brainstorming (AskUserQuestion previews, Rule S no live browser at ask/plan) → spec → writing-plans → executing-plans INLINE` (subagents thrash this baseline). Two changes to the customer patient-link page (`?patient=<token>`, `__customerMode`): (1) show ONLY boxes with data — hide the "ไม่มีคอร์สคงเหลือ" empty box in customer-mode (admin/sync view keeps it as feedback, Q1=A); subtle line "ยังไม่มีนัดหมายหรือคอร์สในขณะนี้" when nothing at all (Q2=B). (2) NEW daily cron auto-deletes a link empty (no upcoming appt + no remaining usable course) for ≥30d via an empty-since state machine (Q3=A), delete = clear token (Q4=A true delete).

**Architecture**: "what does this link show" single-sourced in NEW pure `src/lib/customerLinkPayloadCore.js` (`computeUsableCourses` / `isAppointmentUpcoming` / `isCustomerLinkEmpty` / `decidePatientLinkCleanup`) consumed by BOTH `api/patient-view.js` (refactored, behavior-preserving) AND the NEW `api/cron/patient-link-cleanup-sweep.js` + `scripts/patient-link-cleanup-sweep.mjs` (Rule M) + `scripts/diag-patient-link-empty-state.mjs` (Rule R). NEW AV135 (single-source isEmpty · clear-token true-delete · customer-mode-only hide · expired ≠ remaining). NO firestore.rules/index change → no Probe-Deploy-Probe.

**Verify (Rule Q-honest)**: focused 80/0; full suite 14803 pass (residual reds = rotating pre-existing global.fetch-leak/perf load-flakes, all pass isolated). L2 real-prod cron dry-run scanned 2/skipped 2/0 deleted; diag of screenshot customer LC-26000023 (0 courses + 1 appt) → coursesBox HIDDEN, link kept. GAP disclosed: visual pixel render = user L1 post-deploy (vite dev doesn't serve the serverless endpoint). 3 V21 fixups (customer-patient-link F6.6/F7.3 + E10 — the AV127/AV128 class-of-bug locks now follow the core extraction). Master `269010c9`; NOT deployed (awaits "deploy", V18).

**Production this entry**: 1 NEW source page ([patient-link-hide-empty-cleanup-design](sources/patient-link-hide-empty-cleanup-design.md)) + 2 NEW entity pages ([customer-link-payload-core](entities/customer-link-payload-core.md), [patient-link-cleanup-cron](entities/patient-link-cleanup-cron.md)) + 1 NEW concept page ([patient-link-lifecycle](concepts/patient-link-lifecycle.md)). Index extended +4 rows (1 source + 2 entities + 1 concept) + date-updated 2026-05-23 → 2026-05-26. `graphify update .` ran (AST-only): 8087 nodes / 14648 edges / 859 communities (graph.json + GRAPH_REPORT.md updated).

Cross-references locked: customerLinkPayloadCore (single-source isEmpty) ↔ patient-link-cleanup-cron (empty-since state machine, mirror of opd-session-cleanup-sweep) ↔ Customer Patient-Link feature 2026-05-25 (AV126/127/128) ↔ Rule M data-ops-via-local-sdk ↔ skip-stock-filter (same branch-agnostic single-source pure-filter shape).

## [2026-05-23 EOD+1 LATE+3] ingest | V116 link-survives-queue-delete + auto-regen + un-hide on re-engage (DEPLOYED)

Single-session `/systematic-debugging` + ultrathink — Phase 1 mapping (4 files, 4 grep passes) → Phase 2 class-of-bug grep (Rule P Step 3: 3 broken delete sites + 1 self-healing) → Phase 3 brainstorming (Q1-Q4 via AskUserQuestion) → Phase 4 implementation (5 surgical edits + V116-followup catch by user) → 26 V116 tests + AV116 invariant + Tier 2 classifier + full vitest 14344/14344 + Vercel deploy.

**What shipped**: `ดูลิ้งค์ที่ส่งไป` button flow is now self-healing across 3 dimensions:
1. **Queue-delete preserves link when linked to booking** — `deleteSession` (`AdminDashboard.jsx:3287`) no-patientData branch: if `linkedAppointmentId OR linkedDepositId` → set `isHiddenFromQueue:true` (preserve session, queue-only hide); else hard-delete (standalone "เหมือนกดผิด"). Auto-2hr-expire mirrors. URL stays alive.
2. **Provision helper architectural backstop** — `provisionOpdLinkForBookingPair` (`appointmentDepositBatch.js:902`) verifies session existence before idempotent short-circuit; on stale FK → mint fresh + overstamp reverse-FK (legacy victims healed on next click — มนทวัฒน์ + สันติสุข image-2 cohort).
3. **Un-hide on re-engagement** (V116-followup) — re-clicking "ดูลิ้ง" on hidden session un-hides it (queue entry reappears immediately); admin has Review surface before customer fills. URL unchanged (no QR re-share needed). Idempotent on non-hidden sessions.

**Architectural commitments**:
- **Queue auto-restore via read-side override** — filter `(!s.isHiddenFromQueue || s.patientData)` at 3 queue sites (main / deposit / noDeposit). No customer-side write needed when patientData appears.
- **PatientForm.jsx:78 isArchived gate untouched** — `isHiddenFromQueue` is a NEW field separate from `isArchived` (PatientForm rejects archived; would break link-survives-policy if we overloaded).
- **Closed AV116 sanctioned-exception list** of 2 (`handleNoDepositCancel` self-heals via deleteBackendAppointment cascade; `hardDeleteSession` covered by provision backstop) — adding 3rd opd_session delete site fails class-of-bug classifier G3 → forces Rule P V-entry.
- **Walk-in modal gate**: 6th indicator `createdFromBackendBooking` (defense-in-depth; pre-existing 5 already cover but locks against future drift).

**Files touched**: `src/lib/appointmentDepositBatch.js` (2 edits — existence check + un-hide), `src/pages/AdminDashboard.jsx` (5 edits — deleteSession + auto-expire + 3 queue filters + walk-in gate), `tests/v116-link-survives-queue-delete.test.js` (NEW 26 tests: SG/D/F/G), `.agents/skills/audit-anti-vibe-code/SKILL.md` (NEW AV116, 3 rules + sanctioned list).

**Deploy state**: Vercel prod `lover-clinic-app.vercel.app` LIVE @ `3612d8ae` (V115 + V116 + V116-followup combined ship). NO rules change → Probe-Deploy-Probe not needed.

**L1 pending**: user iPhone hands-on for V115 lightbox + Rule Q L1 for V116 (3 scenarios: new flow / legacy victim / re-engage un-hide).

Full lessons + design tradeoffs → `.claude/rules/v-log-archive.md` (V116 entry forthcoming at next major V-log update).

## [2026-05-19 NIGHT+5 EOD+1] ingest | V43-followup hide-skipped-from-balance + Edit shortcut + BS-18 listener (DEPLOYED)

Single-session 12-task subagent-driven implementation: brainstorming (Q1-Q4) → HTML spec → HTML plan → 12 tasks via fresh subagent + 2-stage review (spec compliance + code quality) per task → combined V15 deploy.

**What shipped**: Products flagged `skipStockDeduction:true` are now hidden from the Stock Balance table (both per-branch StockTab + central CentralStockTab + future branches automatic). New `[✎ แก้ไข]` button rightmost in Actions column opens `ProductFormModal`; saves with the toggle flipped cause the row to disappear/reappear LIVE within seconds via `listenToProducts` onSnapshot listener — no page refresh required.

**Architecture commitments**:
- **Single-source filter helper** [`src/lib/skipStockFilter.js`](entities/skip-stock-filter.md) — `filterOutSkippedProducts` + `isSkippedProduct`, branch-agnostic, strict `=== true` check (mirrors `_deductOneItem` branch 2 at backendClient.js:6928)
- **BS-18 listener** — `listenToProducts` Layer 1 ([backendClient.js](../src/lib/backendClient.js)) + Layer 2 wrapper ([scopedDataLayer.js](entities/scoped-data-layer.md)) mirroring V54/BS-13 + V75/BS-16. Safe-by-default empty emit + V38 spread-order
- **Closed AV97 sanctioned-exception list** of 2 (ProductsTab + MovementLogPanel) — adding a 3rd entry fails source-grep `length === 2` assertion → forces Rule P V-entry

**Test bank**: 7-tier prof-grade ~1270 new assertions:
- Tier 1 unit (31) — predicate + happy + adversarial (Thai/NFC vs NFD `é`/`é`/NUL ` `/10K-char/numeric flag) + idempotency + forward-compat
- Tier 2 source-grep AV97 enforcer (9) — closed-list lockup
- Tier 3 BS-18 listener (10) — Layer 1 safe-by-default + Layer 2 auto-inject + V38 spread-order
- Tier 4 Rule I flow-simulate (10) — 7 flow dimensions F1-F7 incl. user-reported screenshot mirror
- Tier 5 mulberry32 adversarial (**1204**) — 100 seeds × 4 product types × 3 tiers (per-branch existing / future-branch / central) + bulk + cross-tier identity
- Tier 6 admin-SDK e2e on real prod (7) — TEST-V43F fixtures, toggle ON → hidden → untoggle → reappear, audit doc emit, zero-orphan cleanup
- Tier 6.5 Playwright L1 (3) — Rule Q V66 real browser + real auth + real prod listener subscription
- Tier 7 stress (5) — 50-concurrent toggle + 100-iter mutation + 10K perf budget 200ms + cross-tab agreement

**Deployed**: combined V15 — Vercel `lover-clinic-g81qa6hk4-...` aliased canonical `https://lover-clinic-app.vercel.app` (HTTP 200) + Firebase rules+storage idempotent. 6/6 Probe-Deploy-Probe IDENTICAL pre+post (chat_conversations 200 · be_exam_rooms/be_line_reminder_log/be_line_reminder_postback_log/be_staff_chat_messages/be_fb_configs all 403). V43 legacy e2e regression 39/39 STILL PASS — no decision-tree-at-deduction-layer regression.

**Production**: 2 NEW pages — 1 concept ([skip-stock-hide-from-balance](concepts/skip-stock-hide-from-balance.md)) + 1 entity ([skip-stock-filter](entities/skip-stock-filter.md)). 1 EXTENDED entity ([scoped-data-layer](entities/scoped-data-layer.md) with listenToProducts Layer 2 wrapper). Index extended +2 rows (1 entity + 1 concept).

Cross-references locked: BS-18 ↔ V54/BS-13 + V75/BS-16 (canonical mirror) ↔ Rule O single-source contract ↔ AV97 closed sanctioned-exception list ↔ V42-V49 saga lessons (skip-stock-deduction at deduction layer).

**Outstanding**: user L1 hands-on Rule Q V66 — open `https://lover-clinic-app.vercel.app/?backend=1` → stock tab → verify 4 flagged services (Shock wave / ผ่าตัดทำหมันชาย / ติดตามอาการกับแพทย์ / เพิ่ม ตัดเส้นสองสลึง) hidden + Edit button toggle round-trip works live without F5.

## [2026-05-04] bootstrap | LoverClinic codebase wiki
Created scaffold per Karpathy LLM Wiki pattern. Schema = `CLAUDE.md` (standard markdown links, kebab-case slugs, frontmatter mandatory, file:line citations for code claims). Categories: sources/ entities/ concepts/ analyses/. User chose Q1=B (codebase architecture knowledge), Q2=A (standard markdown), Q3=A (separate schema), Q4=B (seed ingest). 3 source pages + 3 entity pages + 5 concept pages seeded.

## [2026-05-04] ingest | Karpathy — LLM Wiki gist (gist 442a6bf)
Source page: `sources/karpathy-llm-wiki.md`. Created entity page `entities/andrej-karpathy.md` (person). Created concept page `concepts/llm-wiki-pattern.md` (the pattern this wiki implements). Cross-referenced from index.

## [2026-05-04] ingest | BSA spec + plan
Source pages: `sources/bsa-spec.md`, `sources/bsa-plan.md`. Created concept page `concepts/branch-scope-architecture.md` (the 3-layer pattern). Created entity pages `entities/scoped-data-layer.md` (Layer 2) + `entities/use-branch-aware-listener.md` (Layer 3). Cross-referenced with `concepts/rule-h-quater.md` (BS-2 invariant).

## [2026-05-04] ingest | Iron-clad rules + LoverClinic top-level architecture
Concept pages: `concepts/iron-clad-rules.md` (A-L summary, links to canonical `.claude/rules/`), `concepts/rule-h-quater.md` (the H-quater rule that BSA enforces), `concepts/lover-clinic-architecture.md` (top-level system overview).

## [2026-05-05] ingest | Phase 17.2 directive — branch equality (no main)
Mid-cycle user directive: "ยกเลิกสาขา Main / สาขาหลัก ออกไป — ทุกสาขาเป็นสาขาเหมือนกัน สำคัญเท่ากัน ไม่มีการติดดาว". Filed as `concepts/branch-equality-no-main.md` Phase 17.2 anticipation page. ~20 files affected per initial grep (BranchesTab + BranchFormModal + 6 stock panels + TFP fallback + BranchContext + cloneOrchestrator + MasterDataTab sync + several SaleTab/AppointmentFormModal display layers). Phase 17.2 brainstorm queued after Phase 17.0 ships + Phase 17.1 brainstorm runs.

## [2026-05-05 EOD] backfill | Phase 17.2 fix series + Phase 18.0 Branch Exam Rooms cycle

Marathon EOD session: Phase 17.2 quinquies/sexies/septies/octies (TFP cross-branch correctness fixes — cache leak + internal-leak audit + reader field-name drift + isCourseUsableInTreatment shape-aware) + Phase 18.0 Branch Exam Rooms (full feature — 11 tasks, 89 new tests, migration script, 18 commits) + Phase 18.0 follow-ups (legacy localStorage drop + empty-state removal). Two deploys shipped: V15 #19 (initial Phase 18.0 + Phase 17.2 fixes) + V15 #20 (legacy localStorage cache drop + master-rooms-only column derivation). Migration `--apply` ran on prod 2026-05-05 — 3 rooms seeded for นครราชสีมา (audit doc `be_admin_audit/phase-18-0-seed-exam-rooms-1777978075511-...`).

Production: 6 NEW pages — 3 entities ([be-exam-rooms](entities/be-exam-rooms.md), [exam-rooms-tab](entities/exam-rooms-tab.md), [appointment-room-columns](entities/appointment-room-columns.md)) + 3 concepts ([branch-exam-rooms](concepts/branch-exam-rooms.md), [runtime-fallback-orphan-room](concepts/runtime-fallback-orphan-room.md), [v12-shape-drift](concepts/v12-shape-drift.md)). Plus 1 EXTENDED entity ([treatment-form-page](entities/treatment-form-page.md) with Phase 17.2 fix series section). Index extended +6 rows. Source pages for the Phase 18.0 design spec + plan deferred to next ingest (paths exist at `docs/superpowers/specs/2026-05-05-branch-exam-rooms-design.md` + `docs/superpowers/plans/2026-05-05-phase-18-0-branch-exam-rooms.md`).

Cross-references locked: Branch Exam Rooms ↔ BSA ↔ Runtime fallback ↔ V12 shape-drift form a tight cluster summarizing the cross-branch correctness work. TFP entity page now lists all 4 fix commits with file:line references and links V12 concept page.

## [2026-05-06 EOD] session | Phase 19.0 (15-min slots + 4-type taxonomy) + Rule M data-ops + session-end wiki auto-update

Marathon EOD continuation: Phase 19.0 brainstorm (Q1 = Option B Uniform) → spec + 14-task plan → subagent-driven execution (Sonnet integration / Haiku mechanical) → V15 #22 deploy (combined; 6/6 + 6/6 Rule B probes after URL-convention fix to use `artifacts/{APP_ID}/public/data/` prefix) → migration `--apply` on prod (27/27 docs: 18 null + 9 'sales' → 'no-deposit-booking'; audit `phase-19-0-migrate-appointment-types-1777987427963-c3e11db0`; idempotency verified). Two latent migration-script bugs (PEM-parse + bare-collection-path) caught + fixed at LIVE execution time in <10min. Then codified two new project rules per user directive: **Rule M** (data ops via local + admin SDK + pull env — never deploy-coupled) added to `.claude/rules/01-iron-clad.md` + 00-session-start.md + CLAUDE.md summary. **session-end skill Step 5** — wiki auto-update (always append log entry; create concept/entity pages for novel patterns; update index when new pages land; append-only at section level).

Production this entry: 2 NEW concept pages ([data-ops-via-local-sdk](concepts/data-ops-via-local-sdk.md) — the canonical pattern from Rule M with V15 #22 lesson lock; [appointment-15min-and-4types](concepts/appointment-15min-and-4types.md) — Phase 19.0 design summary) + 1 NEW entity page ([appointment-types-ssot](entities/appointment-types-ssot.md) — the new SSOT module). Index extended +3 rows. Checkpoint: `.agents/sessions/2026-05-06-phase-19-0-and-rule-m.md`.

Cross-references locked: Rule M ↔ Phase 18.0 + 19.0 migration scripts (canonical templates) ↔ data-ops-via-local-sdk concept ↔ iron-clad-rules summary. AppointmentTypes SSOT ↔ Phase 19.0 concept ↔ Rule of 3 collapse (3 local TIME_SLOTS copies → 1 canonical).

## [2026-05-05] backfill | Phase 17.0/17.1 prep cycle
Pivoted from sparse seed (3 entities + 5 concepts) to richer structural memory before Phase 17.0 brainstorm/plan. Production: 13 NEW entity pages (3 marketing tabs + 7 master-data tabs + TFP + listProductGroupsForTreatment + branch-context) + 1 EXTENDED entity page (scoped-data-layer with full function reference + Phase 17.0 context) + 4 NEW concept pages (branch-switch-refresh-discipline / cross-branch-import-pattern / marketing-collections / master-data-tabs-pattern). 4 parallel general-purpose subagents handled entity production; concepts hand-written for cross-cutting synthesis. Index extended 17 new rows. Total ~16 pages produced + 1 extended + index/log updated. Phase 17.0 brainstorm + plan files (`2026-05-05-phase-17-0-bsa-leak-sweep-3-{design,plan}.md`) cited but their wiki source-pages deferred to next ingest. Wiki schema / Karpathy gist / BSA spec sources unchanged. Phase 17.0 implementation NOT YET shipped — plan saved at `docs/superpowers/plans/2026-05-05-phase-17-0-bsa-leak-sweep-3.md`, paused per user directive "wiki backfill cycle FIRST so Phase 17.0 is built on top of richer structural memory".

## [2026-05-09] ingest | Phase 25.0 — Walk-in 5th appointment type + frontend tab rename + OPD-save → modal flow
User requested 4-task batch: (1) add `walk-in` 5th appointment type with backend sub-tab below 'ติดตามอาการ'; (2) rename frontend "คิว"/"หน้าคิว" → "คิว Walk-IN"; (3) "บันทึกลง OPD" click → `AppointmentFormModal` with type/customer/channel/branch LOCKED + status default `pending`; (4) saved walk-in auto-displays in V64 hub วันนี้ tab. 14 files modified (6 source + 8 test); 4 NEW Phase 25.0 test files (44 tests); 5 EXISTING Phase 19/21 tests updated for 4→5 type expansion (parameterized N_TYPES). 141/141 targeted GREEN; full suite 8242/8245 (1 pre-existing flake + 1 pending; 0 regressions). Per Rule J brainstorming HARD-GATE — clarifying Qs locked customer-linking strategy (be_customers exists by modal-open time; reuse existing `lockedCustomer` prop, no new pickLater pattern needed) + 5th color choice (น้ำตาลอ่อน / amber). Per Rule K work-first/test-last (all source first → review → test bank batch). Per Rule N targeted-only during iteration; full suite at end-of-batch.

Production this entry: UPDATED entity page `entities/appointment-types-ssot.md` (4-type → 5-type taxonomy + Phase 25.0a history line) + UPDATED concept page `concepts/appointment-15min-and-4types.md` (Phase 25.0a evolution section with the inverted-flow semantic + `lockedChannel` Rule of 3 mirror documentation). Index NOT changed (existing pages updated, no new pages). NEW `lockedChannel` prop on `AppointmentFormModal` is the canonical mirror of Phase 21.0's `lockedAppointmentType` — same locked-chip-with-🔒 UX, validates against `CHANNELS` list, save-payload override pattern. AdminDashboard's NEW `_maybeOpenWalkInModal` helper gated on `adminMode === 'dashboard'`, called at all 3 customer-save success branches (addCustomer / relink-existing / recovery-create-after-notFound). Master 1 ahead of prod — awaiting explicit "deploy" THIS turn per Rule V18.

Cross-references locked: `appointment-types-ssot` ↔ `appointment-15min-and-4types` (Phase 19.0 + 25.0a evolution). `lockedChannel` (NEW Phase 25.0c) is the third member of the locked-field prop family on AppointmentFormModal (after `lockedCustomer` + `lockedAppointmentType` Phase 21.0) — Rule of 3 reached; future locked-X props can mirror the safeLocked* validation + chip-render pattern. V64 hub auto-displays walk-in via existing infrastructure (`appointmentDataVersion` real-time + `sortApptsByDateTimeAsc` + TYPE_CHIP_CLS amber) — zero edits needed for Phase 25.0d.

## [2026-05-13] ingest | Phase 26.0 — Doctor-Save (บันทึกสำหรับแพทย์) + Admin Finalize-Mode

Created `concepts/treatment-status-and-doctor-save.md` documenting the new asymmetric save flow on TreatmentFormPage. Doctor-save records OPD/vitals/charts/meds/DF only (per Q2 — meds + DF KEPT; course-items + consumables + purchasedItems + auto-sale SKIPPED). Admin finalize unlocks via `canAddNewItems = (mode==='create') || (loadedTreatmentStatus === 'doctor-recorded')` flag derived from `treatment.status === 'doctor-recorded'` set by Phase 26.0b doctor-save.

`saveMode` joins the locked-X / payload-shape-routing architectural family as 4th member (after `lockedCustomer` + `lockedAppointmentType` + Phase 25.0c `lockedChannel`). Future "save-mode" / "lockedX" variants MUST mirror: defensive coercion at entry + explicit gates at every site + AV invariant + flow-simulate F-tests + source-grep regression.

10 commits across 9 tasks. Approach A1 (single handleSubmit + explicit gates) locked over A2 (separate handler — too much refactor) and A3 (filter payload — implicit-skip risk). Status field additive on `be_treatments`; legacy treatments stay `status: undefined` (no chip) — no Rule M data migration, no Rule B firestore.rules deploy needed.

NEW AV37 audit invariant in `audit-anti-vibe-code/SKILL.md` + 8 sub-tests in `tests/audit-branch-scope.test.js`. AV37 locks the doctor-save gate discipline permanently — any new deduction/sale-create call site added to handleSubmit in future MUST be saveMode-gated; meds (type 7) sanctioned exception preserved.

Test bank: G1+G2 (handleSubmit + UI source-grep) + D1+D2+D3+D4 (RTL chip + banner + summary) + F1-F8 (Rule I full-flow simulate). 3 V21-class test fixups in TF3.A.6 + V36.J.1 + V50.F1.12 (legitimate source contract evolution).

Full suite: 8242 → 8297 + 1 skipped (+55 net) all GREEN. Build clean. NOT YET DEPLOYED — awaiting user `deploy` authorization per Rule V18.

## [2026-05-13] ingest | Phase 26.2f — TFP Read-Only Mirror + Vitals-Save

`TreatmentReadOnlyMirror` (~947 LOC) replaces `TreatmentReadOnlyPanel` in TFP split-screen aside. Full mirror of TFP layout with all inputs disabled — doctor can compare historical visit field-by-field alongside live form. `extractDisplayString` helper prevents `[object Object]` rendering for populated-object fields (doctor/assistant Firestore objects). Layout reordered: หมายเหตุทั่วไป → left column; vitals-save button takes right column top.

`saveMode='vitals'` = 5th locked-X family member. Stamps `status: 'vitalsigns-recorded'`. `canAddNewItems` extended to 3-branch gate. Full 3-stage status machine: vitals-save → doctor-save → admin finalize.

AV37 extended (.12–.17). AV38 existing (covers both Panel + Mirror). AV39 NEW (extractDisplayString). Tests: **8447 PASS** (+91 net). Build clean. 51 commits ahead of prod `ccef3c2`. NOT YET DEPLOYED.

New pages: `wiki/concepts/tfp-readonly-mirror.md` (NEW). Updated: `wiki/concepts/treatment-status-and-doctor-save.md`.

Cross-references locked: `treatment-status-and-doctor-save` cites Phase 25.0c lockedChannel + Phase 21.0 lockedAppointmentType (Rule of 3 chain). Future TreatmentFormPage saveMode variants (e.g., draft-save) should land on this concept page first.

## [2026-05-13] ingest | Phase 26.1 — TFP Polish + Editor-Attribution Modal

Follow-up to Phase 26.0 (same-day). 3 items: (A) V12 multi-reader-sweep fix at CDV summary mapper — Phase 26.0e fixed the writer but missed the in-component reader, so the amber "แพทย์ลงบันทึก" chip never rendered. (B) Removed broken top-right "ยืนยันการรักษา" button at TFP:2888-2893. (C) NEW EditAttributionModal on staff edit-save — single picker, merged list (staff + doctors + assistants per branch), inline role labels. Records 4 top-level fields (editedBy/Name/Role/At) and displays "· แก้ไขโดย: X (role)" inline in CDV row meta.

Updated `concepts/treatment-status-and-doctor-save.md` with Phase 26.1 section. handleSubmit signature evolution table added (Pre-26.0 → 26.0a → 26.1). AV37 audit invariant extended with 3 new sub-tests (AV37.9-AV37.11) + 1 V21-class regex fixup on AV37.1 (let-based branch tree contract). Total AV37 coverage: 11 sub-tests across both 26.0 + 26.1.

10 task commits across 3 sub-phases (26.1a bug+cleanup, 26.1b modal+RTL, 26.1c TFP integration + display + flow + audit). ~600 LOC delta across 11 files. Tests delta: +23 net (Phase 26.0 8297 → Phase 26.1 8320 + 1 skipped). Build clean. NOT YET DEPLOYED.

Rule of 3 status: `EditAttributionModal` is 2nd member of "pick-a-person-before-action" pattern family (1st = `ActorConfirmModal`). Future 3rd similar modal should consider extracting a shared `<PersonPickerModal>` base.

Subagent-driven execution mode (same pattern as Phase 26.0). Each task: implementer subagent → verify → commit + push. 2 V21-class regex fixups landed during Tasks 3 + 4 + 8 (TF3.A.6 window 2500→4000, F7.3 let-based shape, AV37.1 let-based shape).

## [2026-05-13] ingest | Phase 26.2 — TFP Split-Screen History + customer.note

Same-day continuation of Phase 26.0 + 26.1. 5-item implementation: (A) 5-tab history strip in TFP header showing top-5 cross-branch recent treatments; (B) 50/50 split-screen on lg+ / modal fallback on mobile; (C) NEW `TreatmentReadOnlyPanel` component extracted from TimelineModal row JSX (~374 LOC, strict AV38 read-only contract); (D) TimelineModal DRY refactor to consume TreatmentReadOnlyPanel; (E) `customer.note` shown in amber callout above doctor-save button via triple-fallback chain.

14 implementation commits + 2 spec/plan commits (from prior day) = 16 total Phase 26.x docs-to-code commits. Tests: +36 net (8320 → 8356 + 1 skipped). Build clean. 43 commits ahead of prod. NOT YET DEPLOYED — awaiting user `deploy` authorization per Rule V18. 1 known flake: Phase 17.1 `cross-branch-import-rtl` intermittent under full-suite load (pre-existing).

NEW concept page: `concepts/tfp-split-screen-history.md` (this entry). Documents split-screen layout architecture, historyTreatments state shape, TreatmentReadOnlyPanel AV38 read-only contract, customer.note triple-fallback chain, file inventory.

AV38 audit invariant: no `onEditTreatment`/`onDeleteTreatment` props, no `<input>`/`<textarea>`, no "บันทึก" inside `<button>`, Lightbox permitted. Source-grep regression lock in `tests/v38-av38-treatment-read-only-panel.test.js`.

Subagent-driven execution (same pattern as Phase 26.0 + 26.1): Tasks 1-7 each had implementer subagent → spec-review subagent catching 18+ deviations → fix → commit + push.

Cross-references: `tfp-split-screen-history` ↔ `treatment-status-and-doctor-save` (Phase 26.0 saveMode + 26.1 editedBy attribution sit alongside the Phase 26.2 split-screen in the same TFP). TreatmentReadOnlyPanel = 2nd consumer of the read-only viewing pattern (1st = TimelineModal inline row; future 3rd = Rule of 3 trigger for shared abstraction).

## [2026-05-21] ingest | Tablet Chart Editor — session-doc relay

Feature ship + deploy. PC's TreatmentFormPage chart modal can hand a chart-template image to a standby tablet (`?tablet=chart`, iPad/Android + Apple Pencil) for full-screen perfect-freehand annotation, merging the result straight back into `charts[]`. Built as separate files; TFP touched in exactly one place — a `patientLabel` prop on `<ChartSection>` (`TreatmentFormPage.jsx:3700`). No TFP logic change (requirement #10).

Architecture = Firestore session-doc state machine (`requested → active → saved|cancelled`) + Firebase Storage image transport (session doc carries only URLs; verified < 5000 bytes for a 2 MB template). Heartbeat presence (`be_chart_tablet_presence`, 10s beat / 30s stale) with a busy-aware heartbeat so opening the editor never frees the tablet mid-edit. TX guard (`createChartEditSession` runTransaction) distinguishes `TABLET_BUSY` (presence busy) from `TABLET_OFFLINE` (presence idle-but-stale) — the FP4 fix after a live Chrome test wrongly reported a stale-but-idle tablet as "in use". Instant-pop compound query (branchId+tabletDeviceId+status composite index). Orphan-sweep cron (`*/15`, CRON_SECRET) cancels stale non-terminal sessions + frees presence + cleans Storage — **verified live on real prod** (reaped an admin-injected orphan within the window).

NEW wiki pages: `concepts/tablet-chart-editor-relay.md` (the relay state machine, presence model, TX guard, orphan sweep, BSA classification, Rule Q chain), `entities/chart-edit-session-core.md` (pure SSOT API surface at file:line), `sources/tablet-chart-editor-design.md` (spec + 11-task plan summary, Q1-Q5, 11-point requirement map).

BSA: be_chart_* are branch-scoped (BC2), listeners BS-13 safe-by-default, Layer 2 passthrough in scopedDataLayer, xDoc/xCol accessors + ACCESSORS map entries. AV101 invariant. Verification: L2 e2e 6/6 on prod (exact compound query + Storage round-trip + TX guard + cleanup) + Rule I flow-simulate F1-F6 + stress ST1-ST6 + AV101 + live partial-L1 (tablet lifecycle + PC choice/ready-list/send in Chrome foreground). Simultaneous two-tab pop blocked only by single-machine harness (backgrounded tab → visibilityState:hidden → suspended Firestore listener), not a product defect.

Subagent-driven start (T1 implementer installed perfect-freehand + first test) then inline execution after subagent autocompact thrashing on the large baseline (V81 lesson). Deployed: frontend + firestore.rules + composite index (Probe-Deploy-Probe). graphify update . ran (AST-only). Rule R diag tools: diag-tablet-chart-trigger.mjs (client SDK) + diag-tablet-chart-admin-trigger.mjs (admin SDK, no client creds).
