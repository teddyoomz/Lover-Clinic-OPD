# Session Handoff — LoverClinic OPD Cross-Session State

> **This file is read FIRST every new session.** Updated by `/session-end` skill.
> Link out to `.agents/sessions/*` for detail.

---

## Current State

- **Date last updated**: 2026-05-13 EOD — Phase 26.2g-fillin-followup SHIPPED (utils.js Rule-of-3 close + UD_LABELS_EN + AV40 shrunk 3→2) · 8490 tests + 1 skipped · build clean · 79+ commits ahead of prod
- **Branch**: `master`
- **Last commit**: `551f5ae` feat(audit AV40 update Task 4): utils.js dropped from sanctioned list (Task 6 session-end docs commit lands next)
- **Test count**: **8490 passed** + 1 skipped. 0 failures. 1 known flake (Phase 17.1, intermittent).
- **Deploy state**: **PRODUCTION = `ccef3c2`** (master 79+ commits ahead). Phase 26.0 + 26.1 + 26.2 + 26.2f + 26.2g-fillin + 26.2g-fillin-followup LIVE on master only.

### Session 2026-05-13 EOD — Phase 26.2g-fillin-followup SHIPPED (NOT YET DEPLOYED)

User chose the optional Rule-of-3 follow-up (`src/utils.js:345-356+415-426` flagged as sanctioned tech-debt in Phase 26.2g-fillin AV40). Brainstormed Approach A (mirror helper + caller wrap) + formal-clinical EN labels (preserve current utils.js output verbatim) → spec → plan → subagent-driven execution.

**Commits this session** (6 total: spec + 5 tasks; session-end docs commit lands next):
- `7b0d421` docs: design spec for utils.js Rule-of-3 refactor
- `037bcc7` feat(Task 1): UD_LABELS_EN + derivePatientCongenitalDiseaseEnglish + 12 unit tests
- `1336bc4` test(Task 1 review fix): file-header CLOSED → PENDING (V21 comment-vs-code drift caught by code-quality reviewer)
- `839aa38` feat(Task 2): utils.js OPD print builders consume helpers + header flip back to CLOSED
- `1995e6e` test(Task 3): G3.1-G3.4 source-grep regression locks
- `551f5ae` feat(Task 4): AV40 sanctioned-list shrink (3 → 2; utils.js dropped)

**(A) `src/lib/patientHealthMapping.js` extension** — NEW `UD_LABELS_EN` frozen map with formal clinical labels (Hypertension / Diabetes Mellitus / Lung Disease / Chronic Kidney Disease / Heart Disease / Hematological Disease) intentionally MORE FORMAL than PatientForm UI labels. NEW pure helper `derivePatientCongenitalDiseaseEnglish` mirrors the Thai version with `UD_LABELS_EN` (same gates: `hasUnderlying === 'มี'` wins; ud_other + ud_otherDetail trimming; typeof guards). ~30 LOC added after existing exports.

**(B) `src/utils.js` refactor** — 2 inline `if (d.ud_X) pmh.push(...)` blocks (10 lines each, Thai + English) collapsed to 2 lines each that call the helpers and wrap with the existing OPD-print prefix + fallback. Output BYTE-IDENTICAL for OPD print recipients (verified via node REPL on full-flags + empty cases). Surrounding allergy + currentMedication lines preserved verbatim (different shape, out of scope).

**(C) AV40 sanctioned-exception list update** — `src/utils.js` REMOVED (now uses helpers). List shrinks 3 → 2 (PatientForm.jsx writer + AdminDashboard.jsx display chips remain). V12 multi-reader-sweep class for `patientData.ud_*` fully closed project-wide.

**Subagent-driven discipline** — 6 tasks. Task 1 + Task 2 had 2-stage review (spec compliance + code quality). Task 1 code-quality reviewer caught V21 comment-vs-code drift (file header declared `utils.js Rule-of-3 tech-debt CLOSED` BEFORE Task 2 actually refactored utils.js — the comment was a lie at Task 1's SHA). Inline review-fix flipped to PENDING; Task 2 flipped back to CLOSED when refactor landed. Task 2 reviewer flagged stale AV40 SKILL.md entry — Task 4 (next in plan sequence) closed it. Tasks 3-5 ran inline due to verbatim plan content + low review surface.

**Tests**: +16 new (12 L1.1-EN..L1.12-EN unit + 4 G3 source-grep). Cumulative: 8474 → 8490 + 1 skipped. Build clean.

**Lessons**: (a) Rule P "ONE class-of-bug at a time" + sanctioned tech-debt + follow-up plan is canonical rhythm for partial-scope refactors. (b) Byte-identical output is the right contract when refactoring builders shipping to external recipients. (c) Intentional label drift between contexts (formal clinical vs lay-friendly UI) deserves separate frozen constants rather than forced unification. (d) The existing helper's pure-derivation contract was preserved by NOT adding a `lang` param (Approach B rejected) — separation of concerns intact. (e) V21 comment-vs-code drift can fire BETWEEN tasks of the same phase — inter-task state correctness deserves explicit attention.

Detail: `.agents/sessions/2026-05-13-phase-26-2g-fillin-followup.md`. NOT yet deployed. 79+ commits ahead.

#### Resume Prompt — Phase 26.2g-fillin-followup SHIPPED

```
Resume LoverClinic — continue from 2026-05-13 EOD (Phase 26.2g-fillin-followup SHIPPED).

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=<NEW HEAD SHA>, prod=ccef3c2 · 79+ commits ahead · NOT DEPLOYED)
3. .agents/active.md (8490 tests · Phase 26.2g-fillin-followup DONE)
4. .claude/rules/00-session-start.md (iron-clad A-P + V-summary)
5. .agents/sessions/2026-05-13-phase-26-2g-fillin-followup.md (latest checkpoint)

Status: master=`<NEW HEAD SHA>`, 8490 tests pass + 1 skip, prod=`ccef3c2` LIVE. Build clean.
Phase 26.0 / 26.1 / 26.2 / 26.2f / 26.2g-fillin / 26.2g-fillin-followup all SHIPPED to master; NOT deployed. 79+ commits ahead.

Next: choose ONE
1. Deploy combined 79+ commits — `vercel --prod` + `firebase deploy --only firestore:rules` per V15 + Rule B Probe-Deploy-Probe.
2. New phase / feature — user specifies priority.
3. Probe-Deploy-Probe maintenance — probes 2/3/4 false-positive or Phase 17.1 flake.

Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe Rule B; Rule J brainstorming HARD-GATE; Rule N targeted-test-only.

Phase 26.2g-fillin-followup institutional memory:
- derivePatientCongenitalDiseaseEnglish + UD_LABELS_EN formal clinical labels = canonical helpers for English OPD print
- V12 multi-reader-sweep for patientData.ud_* fully closed project-wide
- AV40 sanctioned list = 2 entries (PatientForm.jsx + AdminDashboard.jsx)
- Rule P partial-scope refactor + sanctioned tech-debt + follow-up plan rhythm

/session-start
```

---

### Session 2026-05-13 EOD — Phase 26.2g-fillin SHIPPED (NOT YET DEPLOYED)

User approved Phase 26.2g-fillin design (carried from prior session's brainstorming) and selected subagent-driven execution. 9 tasks shipped with 2-stage review (spec compliance + code quality) per task. Single user-reported bug surface ("TFP create แล้วโรคประจำตัว + ประวัติยา ไม่ขึ้นทั้งที่ลูกค้ากรอกใน PatientForm") closed via architectural extraction to a shared lib.

**Commits this session** (8 total, `7d19077` → `f978de6`):
- `7d19077` docs: spec + plan with pre-flight Rule P Step 3 grep result
- `311b814` feat(Task 2+3): NEW `src/lib/patientHealthMapping.js` (~95 LOC) + TDD test bank (17 assertions L1.1-L3.2)
- `7e6f7eb` test(M1 review): 3 typeof-guard regression locks (L1.10 + L2.7 + L2.8)
- `7e839c3` feat(Task 4): wire helpers into `TreatmentFormPage.jsx` create-mode auto-fill at lines 1024-1034
- `9555e19` test(Task 5): G1+G2 source-grep regression (TFP wiring locks + AV40 universal classifier)
- `692b705` test(Task 6): Rule I flow-simulate F1.1-F1.3 (positive + gates-close + edit-mode bypass)
- `d4fcb6a` feat(audit): AV40 audit invariant in `audit-anti-vibe-code/SKILL.md`
- `f978de6` test(Task 8 fixup): D6.2 + D6.3 V21-class 800-char → 2000-char window bump (pre-existing Phase 26.2f-followup tiebreak comment had pushed `.slice(0, 5)` past 800; test count of 8447 in active.md was stale on this drift)

**(A) `src/lib/patientHealthMapping.js`** — NEW pure-JS module (~95 LOC) with 2 derive functions:
- `derivePatientCongenitalDisease(patientData)` → comma-joined Thai chronic-disease labels in PatientForm UI order (Hypertension/Diabetes/Lung/Kidney/Heart/Blood) gated by `hasUnderlying === 'มี'`; `ud_other` + `ud_otherDetail` appended (trimmed); empty when patient declared no underlying
- `derivePatientTreatmentHistory(patientData)` → ` / `-joined "การตั้งครรภ์: <value>" + "ยาที่ใช้ประจำ: <trimmed value>" with sentinel-skip on `'ไม่เกี่ยวข้อง/ไม่ได้ตั้งครรภ์'`
- Frozen `UD_LABELS` map + locked `PREGNANCY_LABEL_PREFIX` / `MEDICATION_LABEL_PREFIX` constants for tests + admin recognition in textarea
- Defensive `typeof` guards on every nullable field (`pregnancy`, `currentMedication`, `ud_otherDetail`); private `_isPlainObject` outer-arg guard

**(B) TFP wiring** — `TreatmentFormPage.jsx:1024-1034` extends the existing `if (patientData) { !isEdit }` block. Existing `setBloodType` + `setDrugAllergy` preserved verbatim; new nested `if (!isEdit) { const derived... if (derived) setter(...) }` adds the two new auto-fills. Edit-mode untouched (lines 927-932 still restore from `t.healthInfo.*`). Vitals-save bypass unchanged (saveMode='vitals' runs on submit, not on mount-time load).

**(C) AV40 audit invariant** — `audit-anti-vibe-code/SKILL.md` extended. Anchor regex `/patientData\.(?:ud_|hasUnderlying|currentMedication|pregnancy)/`. Closed sanctioned-exception list (3 files): `PatientForm.jsx` (writer), `AdminDashboard.jsx:4504-4533` (display chips), `src/utils.js:345-356+415-426` (OPD print builder — tech-debt for future Rule-of-3 refactor). Source-grep regression in `tests/phase-26-2g-fillin-source-grep.test.js` G2.1.

**(D) V21-class fixup** — Phase 26.2f-followup (`68b4bb6`) added multi-line same-date tiebreak comment + sort logic in TFP, pushing `filter` and `.slice(0, 5)` past 800-char window in `phase-26-2-split-screen-rtl.test.jsx` D6.2 + D6.3. Pre-existing latent failure (active.md count of 8447 was stale). Bumped 800 → 2000 + V21 marker comment explaining Phase 26.2f-followup origin. Contract preserved (`filter` + `treatmentId` + `.slice(0, 5)` all still present; only search window grew).

**Pre-flight Rule P Step 3 grep** bounded the class-of-bug. 3 callers found: TFP (target), AdminDashboard.jsx (display chips, sanctioned), src/utils.js (OPD print builder, sanctioned tech-debt). No fourth caller.

**Tests**: 27 new (20 unit L1.1-L3.2 + 4 source-grep G1.1-G2.1 + 3 Rule I flow-simulate F1.1-F1.3). Cumulative: 8447 → 8474 + 1 skipped (delta correctly accounts for 8447 baseline + 27 new = 8474, with 2 V21-fixup tests bumping windows but not adding new assertions). Build clean (2.64s, BackendDashboard chunk 904.98 KB unchanged).

**Subagent-driven discipline**: 9 tasks, fresh subagent per task, 2-stage review (spec compliance + code quality) on Tasks 2+3 / 4 / 5. Tasks 6+7+8+9 reduced review surface (verbatim plan content + verification-only nature). 1 M1 minor finding addressed inline (typeof-guard regression locks). 1 V21 fixup applied inline at Task 8 (Phase 26.2f-followup latent drift).

**Lessons** (Rule D continuous improvement):
- V12 multi-reader-sweep applies at SINGLE-BLOCK boundary too — when an auto-fill block sets N derived fields and N-2 land, the missing 2 are the silent bug
- Sentinel-value handling for radio-default fields (pregnancy `'ไม่เกี่ยวข้อง/ไม่ได้ตั้งครรภ์'`) deserves an explicit named constant to prevent literal-string drift
- Locked label-prefix constants give admin a visible auto-fill origin in the textarea AND make tests deterministic
- Rule of 3 awareness — `src/utils.js` OPD print builders carry the SAME inline derivation (Thai + English) but with different output shape; sanctioned as tech-debt for follow-up
- Subagent-driven 2-stage review caught 1 M1 (typeof-guard regression locks missing — implementation correct, tests didn't lock the contract)
- V21-class regex windows drift when comments expand — bump windows + add V21 marker comment explaining the origin (mirrors Phase 26.2f's L7.2 + P1.5 fixups)
- active.md test count can be stale on latent V21 fixups; running full suite at task batch end is the only way to catch this (Rule N's "small fix + shared file → full suite at batch end" applies even when the helper is small but new)

Detail: `.agents/sessions/2026-05-13-phase-26-2g-fillin.md`. NOT yet deployed. 71 commits ahead.

#### Resume Prompt — Phase 26.2g-fillin SHIPPED

```
Resume LoverClinic — continue from 2026-05-13 EOD (Phase 26.2g-fillin SHIPPED).

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=f978de6, prod=ccef3c2 · 71 commits ahead · NOT DEPLOYED)
3. .agents/active.md (8474 tests · Phase 26.2g-fillin DONE)
4. .claude/rules/00-session-start.md (iron-clad A-P + V-summary)
5. .agents/sessions/2026-05-13-phase-26-2g-fillin.md (latest checkpoint)

Status: master=`f978de6`, 8474 tests pass + 1 skip, prod=`ccef3c2` LIVE. Build clean.
Phase 26.0 / 26.1 / 26.2 / 26.2f / 26.2g-fillin all SHIPPED to master; NOT deployed. 71 commits ahead.

Next: choose ONE
1. Deploy combined 71 commits — `vercel --prod` + `firebase deploy --only firestore:rules` per V15 + Rule B Probe-Deploy-Probe.
2. New phase / feature — user specifies priority.
3. Probe-Deploy-Probe maintenance — probes 2/3/4 false-positive or Phase 17.1 flake.

Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe Rule B; Rule J brainstorming HARD-GATE; Rule N targeted-test-only.

Phase 26.2g-fillin institutional memory:
- `derivePatientCongenitalDisease` + `derivePatientTreatmentHistory` = canonical helpers for patientData health-info → TFP-state derivation (`src/lib/patientHealthMapping.js`)
- AV40 = patientData.ud_* / hasUnderlying / currentMedication / pregnancy reads centralized via patientHealthMapping helpers (sanctioned: PatientForm.jsx + AdminDashboard.jsx + src/utils.js tech-debt)
- V21 windows in source-grep tests drift when comments expand — bump windows + V21 marker

/session-start
```

### Session 2026-05-13 LATE — Phase 26.2f-followups + Phase 26.2g-fillin brainstormed (NOT YET DEPLOYED)

User-reported bugs after Phase 26.2f shipped (TreatmentReadOnlyMirror live in TFP split-screen). 3 followup commits + 1 brainstorming session for the next phase.

**followup #1 (`68b4bb6`)** — 5 fixes: history tab sort tiebreak by `createdAt.toMillis()` desc + `treatmentId/id` lexicographic desc when same date; doctor-required validation at TFP:2029 gated to `saveMode === 'staff'` only (vitals-save + doctor-save bypass); vitals-save button moved from RIGHT col (above doctor-save) → LEFT col (under Vital Signs box); subtitle dropped; doctor-save theme matched vitals-save teal.

**followup #2 (`b127961`)** — 3 fixes: Mirror top-level type-check guard + `detail` always defaulted to `{}` via type-check at destructure; ใบรับรองแพทย์ FormSection moved from LEFT col → RIGHT col immediately before doctor-save button; doctor-save color teal #2EC4B6 → royal purple #7c3aed (vitals-save stays teal, distinct visual identity).

**followup #3 (`6d134a5`) — REAL crash fix**: previous followup #2 was a misdiagnosis. ACTUAL root cause of black-screen-on-tab-click: `formatThaiDateFull/Only` at Mirror lines 29-57 couldn't handle Firestore Timestamp objects (`{seconds, nanoseconds}` or `.toDate()`/.toMillis()`). Old code did `new Date(timestampObject)` → Invalid Date → `isNaN` guard returned the RAW Timestamp object → React tried to render the object as JSX child → throws "Objects are not valid as a React child (found: object with keys {seconds, nanoseconds})" → error boundary → black screen. NEW `toDateSafely(value)` helper handles 5 input forms (Timestamp w/ toDate, Timestamp w/ toMillis, plain {seconds,nanoseconds}, Date, string/number). Returns null on unrecognized → formatters return `'—'` (safe string), never raw object.

**Brainstorming for Phase 26.2g-fillin (NEXT CHAT)**: user reports TFP create mode doesn't auto-fill chronic disease / drug allergy / food allergy from customer.patientData. Q1 locked — data lives in STRUCTURED `patientData` fields (NOT customer.note). Design proposed (not yet approved): NEW `src/lib/patientHealthMapping.js` with `derivePatientCongenitalDisease(pd)` (from `hasUnderlying + ud_diabetes/hypertension/lung/kidney/heart/blood/other + ud_otherDetail`) and `derivePatientTreatmentHistory(pd)` (from `currentMedication + pregnancy`). TFP load useEffect lines ~1018-1019 extended to setCongenitalDisease + setTreatmentHistory in create mode. ~12-15 NEW test assertions estimated. User pivoted to crash-fix priority before approval — pick up next chat.

Detail: `.agents/sessions/2026-05-13-phase-26-2f-mirror.md`. NOT yet deployed. 50 commits ahead.

### Session 2026-05-13 — Phase 26.2 TFP Split-Screen History + Customer.Note (COMPLETE, NOT YET DEPLOYED)

User directive: "ทำต่อ Phase 26.2 ตามแผน" — execute the 8-task subagent-driven plan committed in the previous context.

**5 implementation items shipped** (14 commits, subagent-driven Tasks 1-8):

**(A) HistoryTabStrip** (`dda99cf` + subsequent): 5-tab strip at top of TFP form showing top-5 cross-branch recent treatments via `query(treatmentsCol(), where('customerId','==', ...), orderBy('createdAt','desc'), limit(5))`. Tab label = treatment date + primary course/item name (truncated). State: `historyTreatments`, `selectedHistoryTreatmentId`, `historyLoading`.

**(B) Split-screen layout** (`lg:flex lg:gap-4` outer + `<main lg:w-1/2>` form + `<aside hidden lg:block lg:w-1/2 lg:sticky lg:top-[120px] lg:overflow-y-auto>` panel): On lg+ screens the selected history treatment displays in a read-only panel to the right of the form at 50/50. Mobile (<lg): `historyPanelOpen` state drives a `<dialog>` / modal fallback. State: `historyFullDoc`, `historyPanelOpen`.

**(C) TreatmentReadOnlyPanel** (`src/components/TreatmentReadOnlyPanel.jsx`, ~374 LOC): NEW component extracted from per-row JSX in `TreatmentTimelineModal`. Renders single treatment doc read-only: doctor info, treatment items, notes, chart attachments (Lightbox), before/after images. AV38 read-only contract enforced: no `onEditTreatment`/`onDeleteTreatment` props, no `<input>`/`<textarea>`, no "บันทึก" in buttons; Lightbox permitted. Source-grep regression lock in `tests/v38-av38-treatment-read-only-panel.test.js`.

**(D) TimelineModal DRY refactor**: `TreatmentTimelineModal` per-row render block replaced with `<TreatmentReadOnlyPanel treatment={t} />`. TreatmentReadOnlyPanel = 2nd consumer (TimelineModal + TFP split-screen). Rule of 3 NOT yet triggered (2 consumers; 3rd would).

**(E) customer.note display**: Amber callout box `bg-amber-500/10 border border-amber-500/30 text-amber-200` above "บันทึกสำหรับแพทย์" button in TFP. Triple-fallback chain: `custData?.note ?? custData?.patientData?.note ?? patientData?.note ?? ''`. Read-only, no edit affordance. Mirrors CDV Phase 24.0-decies pattern.

**AV38 audit invariant**: NEW in `audit-anti-vibe-code/SKILL.md`. Forbids edit/delete props + inputs + save buttons on TreatmentReadOnlyPanel. Source-grep regression lock `tests/v38-av38-treatment-read-only-panel.test.js`. Sanctioned exception: Lightbox (zoom = read operation).

**Spec-review**: 18+ spec deviation corrections applied during subagent execution (Tailwind class drift, missing state vars, wrong query limit, fallback chain order).

**Tests**: Phase 26.1 baseline 8320 → Phase 26.2 final **8356** (+36 net). Build clean. 43 commits ahead of prod (`ccef3c2`). Awaiting `deploy` authorization.

Detail: wiki concept page at `wiki/concepts/tfp-split-screen-history.md`. Flow-simulate: `tests/phase26-2-flow-simulate.test.js`. AV38: `tests/v38-av38-treatment-read-only-panel.test.js`.

---

### Session 2026-05-13 — Phase 26.2f TFP Read-Only Mirror + Vitals-Save (COMPLETE, NOT YET DEPLOYED)

User directive: follow-up to Phase 26.2 — replace TreatmentReadOnlyPanel aside with a full-mirror component + add vitals-save entry point for nurses/staff.

**4 implementation items shipped** (11 commits, Tasks 1-10 including this doc commit):

**(A) TreatmentReadOnlyMirror** (`src/components/TreatmentReadOnlyMirror.jsx`, ~947 LOC): NEW component replacing `TreatmentReadOnlyPanel` in TFP split-screen aside. Full mirror of TFP form layout — every section, tab, and field rendered in disabled/readOnly state. `extractDisplayString(val)` helper at top prevents `[object Object]` for doctor/assistant Firestore populated-object fields. AV38 read-only contract: no edit/delete props, no enabled inputs, no save buttons. Lightbox (zoom) permitted.

**(B) saveMode='vitals'** — 5th locked-X family member in TFP payload-shape-routing. `handleSubmit('vitals')` skips course-items, consumables, purchasedItems, auto-sale (identical gates to saveMode='doctor'). Stamps `status: 'vitalsigns-recorded'`, `recordedBy: auth.currentUser.uid`, `recordedAt: serverTimestamp()`. Vitals-save button on right column with nurse/admin scope — amber styling, ClipboardList icon, hidden from doctor-only sessions.

**(C) canAddNewItems 3-branch extension**: `mode==='create' || status==='doctor-recorded' || status==='vitalsigns-recorded'`. When doctor opens a vitals-recorded treatment, course-items + consumables sections unlock exactly as for doctor-recorded.

**(D) Layout reorder**: หมายเหตุทั่วไป (general note) moved from right column top → left column (beneath course-items/consumables). Vitals-save button occupies the right column slot vacated. Mirror reflects this reorder.

**AV37** extended (.12–.17): saveMode='vitals' routing + 'vitalsigns-recorded' stamping + 3-branch canAddNewItems gate + vitals button testid + extractDisplayString usage + layout order.
**AV38** (existing): read-only contract covers BOTH TreatmentReadOnlyPanel AND TreatmentReadOnlyMirror.
**AV39** (NEW): extractDisplayString must appear ≥5 times in TreatmentReadOnlyMirror.jsx. Direct `{treatment.doctor}` JSX is violation.

**Tests**: Phase 26.2 baseline 8356 → Phase 26.2f final **8447** (+91 net). Build clean. 51 commits ahead of prod (`ccef3c2`). Awaiting `deploy` authorization.

Detail: wiki concept page at `wiki/concepts/tfp-readonly-mirror.md`. 3-stage workflow section appended to `wiki/concepts/treatment-status-and-doctor-save.md`. AV37 ext + AV39: `tests/audit-anti-vibe-code.test.js`. Mirror AV38: `tests/v38-av38-treatment-read-only-panel.test.js`.

---

### Session 2026-05-13 EOD — Phase 26.0 + 26.1 + 26.2 saga (3 sub-phases same-day)

Doctor-save (26.0) → editor-attribution + V12 fix (26.1) → split-screen history + customer.note (26.2 spec+plan only). 23 commits across the saga.

**Phase 26.0 Doctor-Save** (11 commits, deployed Tasks 1-9): NEW "บันทึกสำหรับแพทย์" button under OPD Card (Phase 26.0d, sky styling, Stethoscope icon, hidden in edit mode). NEW `saveMode` arg on handleSubmit with defensive coercion + status='doctor-recorded' + recordedBy/recordedAt forensic trail + canAddNewItems flag (mode==='create' || status==='doctor-recorded') replaces !isEdit at 5+ UI sites. AV37 audit invariant + F1-F8 flow-simulate. +55 tests.

**Phase 26.1 TFP Polish + Editor-Attribution** (10 commits): V12 multi-reader-sweep fix at CDV `treatmentSummary` useMemo (Phase 26.0e fixed writer in rebuildTreatmentSummary but missed reader — chip never rendered). Removed broken top-right "ยืนยันการรักษา" button at TFP:2888. NEW `EditAttributionModal` (single picker, merged staff+doctors+assistants per branch, role labels inline). handleSubmit signature extended `(eventOrSaveMode, options={})` accepts internal `{saveMode, editorContext}` re-invoke. 4 new top-level fields (editedBy/Name/Role/At) on be_treatments. CDV row meta inline "· แก้ไขโดย: X (role)" display + ROLE_LABEL_TH constant. AV37.9-AV37.11 ext. +23 tests.

**Phase 26.2 Split-Screen History + Customer.Note** (2 docs commits, implementation NOT executed): Spec + plan committed. 5 items locked from brainstorming: (A) header tab strip 5 recent cross-branch treatments, (B) split-screen 50/50 lg+ (modal popup <lg), (C) NEW `TreatmentReadOnlyPanel` extracted from TimelineModal row with AV38 read-only contract, (D) TimelineModal refactor consumes panel (DRY), (E) `customer.note` display above doctor-save button mirroring CDV Phase 24.0-decies amber box. ~660 LOC estimated, 8 tasks planned. User chose subagent-driven execution. Context limit reached — deferred to next chat.

Detail: `.agents/sessions/2026-05-13-phase-26-0-thru-26-2.md`. NOT deployed — combined Phase 26.0 + 26.1 + 26.2 = 23+ commits ready for user `deploy` authorization (Rule V15 combined).



### Session 2026-05-13 (continued) — Phase 26.1 TFP Polish + Editor-Attribution Modal (NOT YET DEPLOYED)

User directive (3 items from screenshot of CDV treatment history):
1. NEW modal on staff edit-save to pick editor (พนักงาน/ผู้ช่วย/แพทย์ per branch)
2. Phase 26.0e "แพทย์ลงบันทึก" chip missing in CDV list
3. Remove top-right "ยืนยันการรักษา" button (non-functional)

**Brainstorming HARD-GATE honored** (Rule J): 3 Qs locked — Q1 trigger = edit mode only; Q2 picker = single + merged list with role labels; Q3 display = inline row meta.

**11 files modified** (~600 LOC): 4 source + 7 test/wiki/audit. 10 task commits across 3 sub-phases via subagent-driven execution.

**Phase 26.1a — Bug + cleanup** (`0af6a65`): CDV summary mapper V12 reader-sweep fix (add status + editedBy/Name/Role to local useMemo at line 432-442) + top-right button removal (TFP:2888-2893). Smallest atomic commit.

**Phase 26.1b — Modal + RTL** (`97a50df`): NEW `EditAttributionModal.jsx` (176 LOC) + `tests/edit-attribution-modal-rtl.test.jsx` E1-E5 (5 assertions). Single picker, merged list, branch filter via doc.branchIds[].

**Phase 26.1c — Integration** (`7e4f88a` + `476304d` + `6b3f768` + `550b771` + `afe37a9` + `559d0cb`): handleSubmit signature `(eventOrSaveMode, options = {})` + v26StatusPatch staff branch editor stamping + backendClient.js 4-field top-level extraction + rebuildTreatmentSummary preservation + CDV row meta inline display + ROLE_LABEL_TH constant. Tests: G3.1-G3.6 + D5.1-D5.4 + F9.1-F9.5. AV37.9-AV37.11 audit ext + AV37.1 V21 fixup (let-based branch tree contract).

**Rule of 3 status**: `EditAttributionModal` is 2nd member of "pick-a-person-before-action" pattern family (1st = `ActorConfirmModal`); not yet a Rule of 3 trigger.

**Tests**: Phase 26.0 baseline 8297 → Phase 26.1 final **8320** (+23 net: 5 E + 6 G3 + 4 D5 + 5 F9 + 3 AV37). Build clean. Combined Phase 26.0 + 26.1 = 21+ commits ahead of prod (`ccef3c2`).

Detail: future checkpoint at `.agents/sessions/2026-05-13-phase-26-1-tfp-polish.md` (deferred until session-end).

NOT yet deployed — user authorizes `vercel --prod` separately per Rule V18.



### Session 2026-05-13 — Phase 26.0 Doctor-Save + Admin Finalize-Mode (NOT YET DEPLOYED)

User directive (verbatim): "ในหน้า TFP เพิ่มระบบใหม่ คือ ปุ่ม บันทึกสำหรับแพทย์ ... จะไม่สามารถกดบันทึกตรงส่วนของ ข้อมูลการใช้คอร์ส และ สินค้าสิ้นเปลือง ได้ ... และเมื่อ admin กลับมากดแก้ไข ... จะสามารถกดเข้ามาแก้ไข อื่นๆได้ทั้งหมด เช่นเรื่อง ซื้อคอร์ส ตัดการรักษา ซื้อสินค้าหน้าร้าน ใส่ค่ามือ".

**Brainstorming HARD-GATE honored** (Rule J): 4 clarifying Qs locked before code — Q1 button gate = Open-to-all (no auth-context wiring) + stamp recordedBy=uid; Q2 skip scope = Keep meds + DF (skip course-items + consumables + purchasedItems + auto-sale); Q3 status field = Single 'doctor-recorded' + cleared on admin save; Q4 unlock = Status-derived canAddNewItems flag. **Approach A1** locked (single handleSubmit + explicit gates) over A2 (separate handler — too much refactor) + A3 (filter payload — implicit-skip risk).

**Subagent-driven mode** (Rule J): 9 tasks executed with implementer + spec-review + quality-review checkpoints. 10 commits across tasks 26.0a..26.0g-fixups.

**Phase 26.0a — Scaffold** (`c54c63d`): `auth` import + `canAddNewItems = (mode==='create') || (loadedTreatmentStatus === 'doctor-recorded')` flag + `saveMode` defensive coercion in handleSubmit signature.

**Phase 26.0b — handleSubmit gates + status stamping** (`3605eaf` + `db8da4d` + `dad99bb`): 8 explicit gates wrapping deduction/sale-creation call sites with `saveMode !== 'doctor'` (plan called for 6; implementer found 2 more). Meds deductStockForTreatment (type 7) KEPT UNGATED per Q2 sanctioned exception. v26StatusPatch stamps `status: 'doctor-recorded'` + `recordedBy` + `recordedAt` on doctor-save; admin save clears via `deleteField()` (preserves recordedBy/At forensic trail). 2 fixups: spec § 5.1.C edit-mode preserve via `loadedTreatmentStatus === 'doctor-recorded'` proxy + V21-class S2.5 regex evolution in treatment-stock-diff test.

**Phase 26.0c — UI gates** (`7b584e2`): canAddNewItems replaces `!isEdit` at 6 actual edit blocks across 5 logical sites (med add Pattern α + med grid Pattern β + course picker α + course read-only β + consumable add α + consumable grid β). Carefully separated from save-path/title/banner `isEdit` uses. 40 canAddNewItems references total.

**Phase 26.0d — Doctor-save button + edit-mode banner** (`85e1a9e`): "บันทึกสำหรับแพทย์" button (Stethoscope icon + sky styling + `data-testid="tfp-doctor-save-btn"`) under OPD Card additionalNote, before Chart. Hidden in edit mode (`{!isEdit && ...}`). Amber banner with AlertCircle + Thai instruction at top of form when `loadedTreatmentStatus === 'doctor-recorded'`.

**Phase 26.0e — Status chips** (`034c866`): Amber "แพทย์ลงบันทึก" chip in CustomerDetailView treatment cards + TreatmentTimelineModal row headers. `rebuildTreatmentSummary` extended to preserve `status: t.status || null` so chips have data source.

**Phase 26.0f — AV37 audit invariant** (`1b0fc47`): NEW AV37 entry in `audit-anti-vibe-code/SKILL.md` + 8 sub-tests in `tests/audit-branch-scope.test.js` (AV37.1-AV37.8) locking signature coercion + status stamping + meds sanctioned exception + canAddNewItems flag + summary preservation. Catches future V12 multi-writer-sweep violations permanently.

**Phase 26.0g — Rule I flow-simulate** (`b0e1573`): NEW `tests/phase-26-0-doctor-save-flow-simulate.test.js` with F1-F8 groups (19 assertions). Pure simulator mirroring TFP handleSubmit gate logic; chains doctor-save → admin opens edit → canAddNewItems unlocks → admin adds items → admin saves; asserts cumulative state. Source-grep anchors at F2.1 + F7.1 verify simulator agrees with TFP source.

**Phase 26.0 test fixups** (`13b9551`): 3 V21-class regex updates — TF3.A.6 (handleSubmit signature evolution `async ()` → `async (eventOrSaveMode)` + window 400 → 2500 chars) + V36.J.1 (payload var `backendDetail` → `finalBackendDetail`) + V50.F1.12 (active.md sliding-window — accepts any phase marker).

**Rule of 3 reached** — `saveMode` arg joins `lockedCustomer` + `lockedAppointmentType` + `lockedChannel` as 4th member of payload-shape-routing family on TFP/AppointmentFormModal. Future locked-X / save-mode variants MUST mirror: defensive coercion + explicit gates at every site + AV invariant + flow-simulate F-tests + source-grep regression.

**Backward compat preserved** — Legacy treatments (~5000+) stay `status: undefined` = no chip = "completed" behavior. NO data migration. NO firestore.rules change. NO Rule B Probe-Deploy-Probe trigger. NO Rule M data ops.

**Files**: 4 source modified (TFP + CustomerDetailView + TreatmentTimelineModal + backendClient.js) + 3 NEW test files (G1+G2 source-grep, D1+D2+D3+D4 RTL, F1-F8 flow-simulate) + AV37 invariant + wiki concept page + spec + plan. ~810 LOC delta across 12 files.

Spec: `docs/superpowers/specs/2026-05-13-doctor-save-and-admin-finalize-mode-design.md`. Plan: `docs/superpowers/plans/2026-05-13-phase-26-0-doctor-save.md`. Wiki concept: `wiki/concepts/treatment-status-and-doctor-save.md`. Detail: future checkpoint at `.agents/sessions/2026-05-13-phase-26-0-doctor-save.md` (deferred until session-end).

NOT yet deployed — user authorizes `vercel --prod` separately per Rule V18. Production at `ccef3c2` (unchanged this session).





### Session 2026-05-09 EOD #24 — Phase 25.0 Walk-in DEPLOY (combined; PDP green)

User: "deploy" — explicit Rule B authorization for combined vercel + firestore:rules deploy.

Phase 25.0 Walk-in 5th appointment type (committed earlier as `141f927`) shipped to prod alongside `ccef3c2` docs commit. Combined deploy succeeded:
- vercel --prod `byhtrp18g`: exit 0; aliased https://lover-clinic-app.vercel.app
- firebase --only firestore:rules `bjvx0u08h`: idempotent ("already up to date, skipping upload"; rules unchanged from `1da05bb`)
- Pre+post probe 1 + 5: 200/200 GREEN; probes 2/3/4 = 403 V50-followup-2 false-positive (collections deleted, ignored per precedent)
- Cleanup: 4 probe artifacts nuked (chat_conversations 2 + opd_sessions 2)

Live surfaces: 5th appointment type 'walk-in' (น้ำตาลอ่อน amber) + backend nav sub-tab `appointment-walk-in` below 'ติดตามอาการ' (Footprints icon) + frontend tab rename 'คิว'/'หน้าคิว' → 'คิว Walk-IN' (mobile + desktop) + 'บันทึกลง OPD' click → AppointmentFormModal with type/customer/channel/branch LOCKED + V64 hub วันนี้ auto-displays walk-in sorted by time + NEW `lockedChannel` prop on AppointmentFormModal (3rd member of locked-field family; Rule of 3 reached).

Detail: `.agents/sessions/2026-05-09-phase-25-0-walk-in.md`. Production at `ccef3c2`.



### Session 2026-05-09 EOD #23 — Phase 25.0 Walk-in 5th appointment type + Walk-in queue integration (NOT YET DEPLOYED)

User directive (4 tasks):
1. Add 'walk-in' as 5th appointment type with backend tab below 'ติดตามอาการ'; wire ทุก modal/dropdown/chip/filter ที่เกี่ยวกับประเภทนัดหมาย.
2. Rename frontend "คิว"/"หน้าคิว" tab → "คิว Walk-IN".
3. When admin clicks "บันทึกลง OPD" in Walk-IN tab → modal สร้างนัด เด้งขึ้นมา ดึงข้อมูลจากสาขานั้นๆ; LOCK type=walk-in / customer / channel=Walk-in / branch; status default=รอยืนยัน (NOT locked); other fields editable.
4. Walk-in saved appointments แสดงใน V64 hub วันนี้ tab เรียงตามเวลา.

**Brainstorming HARD-GATE honored** (Rule J): 2 clarifying Qs locked before code — (Q1) customer-linking strategy = use existing `lockedCustomer` (auto-provisioned by existing OPD-save flow); (Q2) 5th color = น้ำตาลอ่อน / amber.

**14 files modified** (+511/-31): 6 source + 8 test (4 NEW Phase 25.0 + 4 EXISTING updated for 4→5 type expansion).

**Phase 25.0a — SSOT + UI wiring**: `appointmentTypes.js` 5th frozen entry `{value:'walk-in', label:'Walk-in', defaultColor:'น้ำตาลอ่อน', order:4}`; `AppointmentHubRowCard` TYPE_CHIP_CLS amber-100/950; `nav/navConfig.js` NEW `appointment-walk-in` sub-tab below `appointment-follow-up` (Footprints icon, amber); `BackendDashboard.jsx` tab guard + activeTab→type mapper extended. Auto-scaling consumers (form modals / report filter / hub typeOptions / aggregator) pick up via `APPOINTMENT_TYPES.map`/`resolveAppointmentTypeLabel`.

**Phase 25.0b — Frontend tab rename**: AdminDashboard mobile (line ~5548) "คิว" → "คิว Walk-IN"; desktop (line ~5585) "หน้าคิว" → "คิว Walk-IN". Internal mode key `'dashboard'` unchanged.

**Phase 25.0c — "บันทึกลง OPD" → AppointmentFormModal locked-fields flow**:
- `AppointmentFormModal.jsx` NEW `lockedChannel` prop (mirror of Phase 21.0 `lockedAppointmentType` pattern): safeLockedChannel validation against CHANNELS list + payload override (lock wins) + UI ternary (locked → static read-only chip with 🔒 + `data-testid="locked-channel-chip"`; unlocked → existing `<select>`).
- `AdminDashboard.jsx` NEW `_maybeOpenWalkInModal` helper gated on `adminMode === 'dashboard'`, wired at all 3 customer-save success branches (addCustomer / relink-existing / recovery-create). State `walkInModal = { sessionId, customerId, customerHN, patientData }`. Modal mounts with `mode='create'` + `lockedAppointmentType='walk-in'` + `lockedChannel='Walk-in'` + `lockedCustomer={just-saved}` + `initialDate=thaiTodayISO()` + `skipCollisionCheck=true`. patientData passed THROUGH from `session.patientData` (B.11 V12 anti-regression — no inline rebuild).

**Phase 25.0d — V64 hub วันนี้ auto-display**: NO file edits. Walk-in appointments auto-appear via existing `getAppointmentsByDateRange` wide-range fetch + `applyTabFilter('today')` + `sortApptsByDateTimeAsc` + V64-fix9 `appointmentDataVersion` counter (real-time refresh on `listenToAppointmentsByMonth` callback).

**Tests**: 4 NEW Phase 25.0 test files (44 tests: SSOT 16 + lockedChannel 9 + tab rename 5 + flow-simulate 14). 5 EXISTING tests updated (Phase 19/21 — 4→5 type expansion via N_TYPES parameterization; nav section count 5→6). 141/141 targeted Phase 19/21/23/25 GREEN; full suite 8242/8245 (1 pre-existing flake + 1 pending; 0 Phase 25.0 regressions). Build clean.

**Wiki updates**: UPDATED `entities/appointment-types-ssot.md` (4-type → 5-type taxonomy + Phase 25.0a history line) + UPDATED `concepts/appointment-15min-and-4types.md` (Phase 25.0a evolution section + `lockedChannel` Rule of 3 mirror documentation) + appended `log.md` 2026-05-09 ingest entry.

**Rule of 3 reached** — `lockedChannel` is the 3rd member of the locked-field prop family on AppointmentFormModal (after `lockedCustomer` + Phase 21.0 `lockedAppointmentType`). Future locked-X props MUST mirror the `safeLockedX = ALLOWED.includes(prop) ? prop : null` validation + payload-override + chip-render-with-🔒 + `data-locked-X` attr pattern.

Detail: future checkpoint at `.agents/sessions/2026-05-09-phase-25-0-walk-in.md` (deferred until session-end). Production at `ad7ee0e` (unchanged this session).



### Session 2026-05-09 EOD #22 — V64-fix9..fix14 hub UX overhaul + Editorial Ember redesign (DEPLOYED)

User flow across the day: 8 hub UX requests (real-time refresh / sort / time emphasis / purpose emphasis / patient name color / doctor badge relocation / mobile branch selector / กลับ Frontend) → finance chip prominence → "Re Design / Renovate ปุ่มทุกปุ่ม ... สไตล์เหมือน proclinic เป๊ะ" → doctor badge relocation iterations (mx-auto → FilterBar header) → mobile responsive + count text equal weight → "deploy + end session".

6 V64-fix commits shipped + DEPLOYED:
- **V64-fix9** (`9b90bb7`) — 8-task UX polish (real-time `appointmentDataVersion` counter + sort + chip emphasis + sky name + compact doctor chips + mobile BranchSelector in BackendTopBar + Home/Frontend button mobile+desktop). +13 tests.
- **V64-fix10** (`6dbe23c`) — 4 finance chips bumped (text-xs + font-bold + border + dark variants + emoji). data-testid `row-chip-{wallet,deposit,outstanding,lifetime}`.
- **V64-fix11** (`780a750`) — "Editorial Ember" redesign per `.impeccable.md` Design Context. NEW `_apptHubStyles.js` shared module (3 button tiers: PRIMARY ember gradient / SECONDARY sky outline ghost / DESTRUCTIVE rose ghost / + LINE brand `#06C755`). Tab pills (ember active / ghost inactive). Card surface (gradient + warm hover border). Status accent bar (3px gradient LEFT edge: missed → red, pending → amber, confirmed → sky, done → emerald, cancelled → gray). Patient name → text-lg font-black. HN → font-mono uppercase tracking-widest. Detail block → `<dl><dt><dd>` grid. R4.11 regex relaxed for refined "GOLD · เหลือ N วัน".
- **V64-fix12** (`642c79a`) — doctor badge `ml-auto` → `mx-auto` (center of remaining space).
- **V64-fix13** (`1166367`) — doctor badge moved from TabBar.rightContent → FilterBar.doctorBadge (beside "รายการนัดหมาย" heading). Chips bumped to text-sm + px-3 py-1.5 + rounded-lg + shadow + font-black mono time. Reserved `min-h-[44px]` slot (no UI jump on tab switch).
- **V64-fix14** (`ad7ee0e`) — "N คน" count text → `text-sm font-black text-tx-heading` (peer of heading; data-testid `appt-hub-result-count`). RowCard mobile responsive: LEFT/MIDDLE `min-w-0 md:min-w-[260px]`; RIGHT section always `flex flex-col` (was `flex md:flex-col` causing horizontal crowd); items-start md:items-end; button group `md:justify-end`; RIGHT min-w only on md+.

**Combined deploy** (Rule 02 V15 — user authorized "deploy" THIS turn):
- vercel --prod `b10eyz1c1`: 60s exit 0; aliased `lover-clinic-app.vercel.app`
- firebase --only firestore:rules `bw5qzsp0e`: idempotent ("already up to date, skipping upload")
- Pre+post probe 1 + 5: 200/200 GREEN; probes 2/3/4 = 403 V50-followup-2 false-positive (collections deleted, ignored)
- Cleanup: 4 probe artifacts nuked (chat_conversations 2 + opd_sessions 2)

Detail: `.agents/sessions/2026-05-09-v64-fix9-to-fix14-hub-overhaul.md`. Production at `ad7ee0e`.



### Session 2026-05-09 EOD #21 — V64-fix8 patient name → link to customer detail (DEPLOYED)

User: "ทำให้ชื่อคนไข้ในแต่ละรายการเป็นลิ้งกดเข้าไปดูหน้าข้อมูลคนไข้ได้" (with screenshot of `/admin` V64 hub list view).

V64 AppointmentHubRowCard patient name → `<a target="_blank">` opening customer detail in new browser tab via `buildCustomerDetailUrl(customerId)` (Phase 15.7-septies canonical helper, 4th UI surface adopting it — Rule of 3 lock at AdminDashboard kiosk + AppointmentFormModal + DepositPanel + MembershipPanel + V64-fix8).

**Decisions**: `<a target="_blank">` over `button + onClick` (right-click/middle-click/keyboard work natively + `rel="noopener noreferrer"` security defense); conditional render (truthy customerId → `<a>`; falsy → fallback `<div>`, no `<a href="#">` dead links).

**Files**: `src/components/admin/AppointmentHubRowCard.jsx` + `tests/v64-appointment-hub-rtl.test.jsx` (V64.R8 nested describe, R8.1-R8.7).

**Verification**: 47/47 V64 RTL+flow-simulate GREEN; full suite 8187 passed; build clean.

**Combined deploy** (Rule 02 V15) — user authorized "deploy" THIS turn:
- vercel --prod `blbmt2300`: 50s exit 0; aliased `lover-clinic-app.vercel.app`
- firebase --only firestore:rules `bntn8ij70`: idempotent ("already up to date, skipping upload")
- Pre+post probe 1 + 5: 200/200 GREEN; probes 2/3/4: 403 false-positive (V50-followup-2; collections deleted)
- Cleanup: 31 probe artifacts nuked

Detail: `.agents/sessions/2026-05-09-v64-fix8-patient-name-link.md`. Production at `dcb6c41`.



### Session 2026-05-09 EOD #20 — DEPLOY V52..V64 (combined; PDP green)

User: "deploy" — explicit Rule B authorization for combined vercel + firestore:rules deploy.

**Pre-deploy probe (Rule B, surviving endpoints post-V50-followup-2)**:
- ✅ Probe 1 — chat_conversations POST (unauth REST): HTTP 200
- ✅ Probe 5 — opd_sessions anon CREATE+PATCH: HTTP 200
- (Probes 2/3/4 — pc_appointments + clinic_settings/proclinic_session{,_trial} — return 403 expected per V50-followup-2 rule removal; script `scripts/probe-deploy-probe.mjs` still tests them and reports false-positive 403; flagged for follow-up)

**Build sanity**: `npm run build` clean (chunk size warning only).

**Vercel `--prod`** (background `b0s6a62a7`):
- Production: `https://lover-clinic-566ys1wx5-teddyoomz-4523s-projects.vercel.app`
- Aliased: `https://lover-clinic-app.vercel.app` ✓
- Build duration: ~1m
- Exit 0

**Firebase `--only firestore:rules`** (background `bgru86j8h`):
- "released rules firestore.rules to cloud.firestore"
- "already up to date, skipping upload" (idempotent — rules unchanged since `ef580a6`)
- Storage rules deploy attempted via combined `--only firestore:rules,storage:rules` but failed on storage targets config (firebase.json missing storage target binding); retried firestore-only, succeeded. Storage rules deploy deferred (not changed in this batch; not blocking).

**Post-deploy probe**:
- ✅ Probe 1 chat_conversations POST: HTTP 200
- ✅ Probe 5a opd_sessions anon CREATE: HTTP 200
- ✅ Probe 5b opd_sessions anon PATCH: HTTP 200

55 V-commits shipped: V52..V63 + V63 batch backfill + V64 spec/plan + V64 16-task implementation + V64-fix1..fix5 user-feedback iterations. Production at `1da05bb`.



### Session 2026-05-09 EOD #19 — V64 Appointment Coming-Hub View shipped

User directive (verbatim, with 3 ProClinic screenshots of `/admin/appointment/coming?tab={today,tomorrow,future,past}`):
> "ต่อไป เนรมิต tap นัดหมายใน frontend แต่ละสาขา ของเรา เพิ่มข้อมูลเหล่านี้ ข้างบนสุดของ tap นัดหมายของเรา เหมือน Proclinic ที่ส่งให้ดูในรูป เพื่อเป็นที่รวมนัดหมาย โดยมีทั้ง Tap วันนี้, พรุ่งนี้, ล่วงหน้า 30 วัน, ย้อนหลัง 30 วัน และ bubble แสดงว่าแต่ละวันมีกี่นัด และองค์ประกอบอื่นๆเหมือนเค้าเป๊ะๆ และใช้งานได้ทุกปุ่มเหมือนเค้าเป๊ะๆทุกสาขา ... แล้วเนรมิตมันขึ้นมาอย่างสุดความสามารถ พร้อมเทสการใช้งานจริงทุกรูปแบบ"

**Brainstorming HARD-GATE honored** (Rule J): 5 design Qs locked with user before any code. Q1=A (list-first default; `[📋 รายการ][📅 ปฏิทิน]` toggle preserves calendar) · Q2=B+D (doctors row primary + assistants row below; today/tomorrow tabs only) · Q3=C (single-load aggregation; ~6 batched queries; O(1) lookup; ZERO N+1) · Q4=A (smart per-tab defaults + auto-missed-chip on past tab + dropdown override) · Q5=C (jsPDF export via `documentPrintEngine.js`-style direct html2canvas+jsPDF; V32 lock).

**Triangle Rule scan**:
- **Leg A** (ProClinic): user-supplied screenshots showed 4-tab list layout + doctor-cards header + per-row status-conditional buttons + search + 3 dropdowns + 2 right-side buttons (พิมพ์ตารางนัดหมาย + เพิ่มคิว Walk-in)
- **Leg B** (memory): V52..V63 schedule-link adoption-gap series (BSA + canonical-source patterns); V54 BS-13 safe-by-default; V63 derivedDoctorDaysAcrossWindow
- **Leg C** (our code): `AdminDashboard.jsx:6413` `adminMode==='appointment'` block currently renders only the calendar grid; `apptData.appointments`, `practitioners`, `branchExamRooms`, `useEffectiveClinicSettings`, V63 `canonicalDoctorDays`, `selectedBranchId` all available

**Architecture** (16 tasks via subagent-driven-development on master per repo convention):

7 NEW source files (3 lib helpers + 4 React components + 1 orchestrator):
- `src/lib/appointmentHubFilters.js` — pure per-tab predicates + missed-inference (Bangkok-TZ-stable midday-UTC parse, V53 BS-12 mirror)
- `src/lib/appointmentHubAggregator.js` — single-load Map<customerId, summary> with multi-wallet sum
- `src/lib/appointmentHubPrintTemplate.js` — pure HTML/data builder; V32 lock
- `src/components/admin/AppointmentHubView.jsx` — orchestrator (state + 6-loader Promise.all + handlePrint)
- `src/components/admin/AppointmentHubDoctorCards.jsx` — Q2 header today/tomorrow only
- `src/components/admin/AppointmentHubTabBar.jsx` — 4 pills with bubble counts
- `src/components/admin/AppointmentHubFilterBar.jsx` — search + 3 filter dropdowns + 2 right-side buttons
- `src/components/admin/AppointmentHubRowCard.jsx` — per-row card with status-conditional buttons

5 NEW test files (92 tests cumulative):
- `tests/v64-get-appointments-by-date-range.test.js` (6)
- `tests/v64-get-wallets-for-customer-ids.test.js` (7 — incl. W1.2b multi-wallet repro after schema fix)
- `tests/v64-appointment-hub-filters.test.js` (25)
- `tests/v64-appointment-hub-aggregator.test.js` (11)
- `tests/v64-appointment-hub-pdf-template.test.js` (4)
- `tests/v64-appointment-hub-rtl.test.jsx` (24)
- `tests/v64-appointment-hub-flow-simulate.test.jsx` (7 Rule I)
- 8 sub-tests appended to `tests/audit-branch-scope.test.js` (BS-16 ×6 + AV36 ×2)

2 NEW backend lib helpers (in `backendClient.js` + re-exported via `scopedDataLayer.js`):
- `getAppointmentsByDateRange({from, to, branchId, allBranches})` — V54 BS-13 safe-by-default mirror
- `getWalletsForCustomerIds(customerIds)` — bulk via `where('customerId', 'in', chunk)` chunks of 30 (composite doc-id schema fix; aggregator sums per customer)

1 MODIFIED:
- `src/pages/AdminDashboard.jsx` — surgical wrap of existing ~600-LOC calendar IIFE with view-toggle pill + conditional render. Calendar block UNCHANGED.

NEW audit invariants:
- **BS-16** (audit-branch-scope) — AppointmentHub* components branch-scope discipline (15 → 16 invariants)
- **AV36** (audit-anti-vibe-code) — V64 PDF print V32 lock universal (35 → 36 invariants)

**V64 schema-fix lesson lock** (Task 2 — flagged by implementer subagent's pre-flight verification):
`be_customer_wallets` uses composite doc IDs `${customerId}__${walletTypeId}` with `customerId` as a FIELD. Initial spec wrongly used `where(documentId(), 'in', [customerIds])` which would have returned zero matches against real prod data. Implementer subagent caught this mismatch via grep of `getCustomerWallets:4051` canonical pattern; corrected to `where('customerId', 'in', chunk)`; aggregator updated to SUM balances per customerId across N wallet types. Saved a downstream V12 multi-reader-sweep round when the View loaded zero wallets in production.

**Verification**:
- 92/92 V64 tests GREEN (targeted)
- 8150/8152 full-suite GREEN (was 8059; +92 net)
- 1 pre-existing flake `bsa-task7-h-quater-fix.test.js T7.regression-guard` — passes standalone, flakes in full-suite parallel runs because of Windows shell-spawn timing in `execSync('git grep ... 2>/dev/null || true')`. TFP line 666 comment from V50 has matched the regex for months; the test design is brittle to bash-vs-cmd shell. Not V64-related; deferred.
- `npm run build` CLEAN (post-fix: removed `IMPORT_IS_UNDEFINED` warning by replacing `getAppointmentTypeOptions` import with direct `APPOINTMENT_TYPES` const consumption)

**Commits** (18 V64-related, atop V63 batch backfill):
spec `9ba30a9` · plan `3615f04` · 14 task commits + 2 fix commits — see `.agents/sessions/2026-05-09-v64-appointment-coming-hub.md` for full SHA list.

Outstanding: combined `vercel --prod` for V52..V64 still pending user-explicit "deploy" THIS turn. 50 commits ahead of prod.



### Session 2026-05-08 EOD #17 — V63 batch backfill on prod (Rule M data op)

User: "ทำ Optional ยกเว้น deploy ให้จบๆ" — finish all optional items except the deploy.

Two optional items closed:

**1. Backfill all in-the-wild schedule links** — V63 batch script applied V62 derive-and-merge logic to ALL 7 `clinic_schedules` docs on prod. Pre-state inspection (via NEW `scripts/diag-v63-inspect-schedlinks.mjs` read-only) revealed every doc had stale 28-entry March/April manual paint that didn't match their `months: ['2026-05']` window. V62/V60 earlier backfills had been overwritten — likely by subsequent admin "Generate Schedule Link" or "Sync" calls that re-stamped local `schedDoctorDays` state into the saved doc.

NEW `scripts/v63-batch-fix-all-schedule-links.mjs` (Rule M canonical template):
- Two-phase (dry-run default; `--apply` commits)
- admin-SDK + canonical `artifacts/{APP_ID}/public/data/clinic_schedules` paths + PEM key conversion (Rule M lock)
- Iterates ALL clinic_schedules docs; skips inactive
- For each: re-derive via V62 helpers (`derivedDoctorDaysAcrossWindow` + `derivedDoctorWorkingHoursPerDate`); union with prior manual paint scoped to months; admin overrides win on hours collision
- Idempotency: re-run with `--apply` after first apply yields 0 writes
- Forensic stamps `_v62BackfilledAt` + `_v62LegacyDoctorDays` + `_v62LegacyCustomDoctorHours`
- Atomic batch commit (chunked at 200/batch — Firestore caps at 500/batch); audit doc emit
- Crypto-secure random for audit-doc id

Result on prod (audit `be_admin_audit/v63-batch-fix-schedule-links-1778256189781-958becd1`):
- **7 docs updated**:
  - 6 BR-1777873556815 links (mix of noDoctor/all + specific-doctor): days 28→18, hours 4→22 each
  - 1 BR-1777885958735 link: days 28→0 (no May doctor schedule for that branch — expected)
- Re-run dry-run: 7/7 OK idempotent, 0 writes pending
- Customer-side proof: SCH-cc3964c023 (test link) renders 🔥 on May 9-31 doctor days correctly

**2. Visual verify AdminDashboard /admin** — preview_eval read-only inspection of running dev server (port 5173, logged-in admin):

| Contract | Expected | Actual |
|---|---|---|
| 🔥 fire-emoji count on /admin tab=นัดหมาย | ~36 (18 days × 2 calendars + legend chip) | **37** ✓ |
| Subtitle (V63 simplified) | "ปิดคิว · ปิดช่วงเวลา" | ✓ present |
| Subtitle (legacy V62) absent | "หมอเข้า · ปิดคิว · ปิดช่วงเวลา" | ✓ absent |
| Button label (V63 simplified) | "แก้ไขปิดคิว" | ✓ present |
| Button (legacy) absent | "แก้ไขตารางหมอเข้า/ปิดคิว" | ✓ absent |
| Legend hint | "หมอเข้า (จากตารางหมอ)" | ✓ present |

Per `feedback_no_real_action_in_preview_eval.md`: only DOM read; no clicks on action buttons that mutate prod data. Console errors are pre-existing always-on listener noise (timestamps from earlier session boot — not V63-related).

**Files added (data ops only — no source change to React app)**:
- `scripts/v63-batch-fix-all-schedule-links.mjs` (NEW Rule M template)
- `scripts/diag-v63-inspect-schedlinks.mjs` (NEW read-only diag)

**Outstanding**: combined `vercel --prod` for V52..V63 + V62-bis still pending user-explicit "deploy" THIS turn. 34 commits ahead of prod (data ops + scripts + V52..V63 + V62-bis). User said "ยกเว้น deploy" so deploy NOT triggered.



### Session 2026-05-08 EOD #16 — V63 + V62-bis (AV35)

User: "เปลี่ยน emoji ไฟ ที่หมอเข้า ให้เห็นกับลิ้งที่ไม่ได้ติ๊กให้แสดงสถานะหมอด้วย ... ดึงวันหมอเข้ามาแสดงเป็นอีโมจิไฟในปฏิทิน tab นัดหมาย ของ frontend อันนี้ด้วย ... ส่วนปฏิทินด้านล่าง ให้ทำได้แค่ปิดวัน ไม่สามารถกำหนดวันหมอเข้าได้แล้ว"
Plus follow-up: SCH-cc3964c023 (fresh post-V62 noDoctor link with showDoctorStatus=false) STILL had `doctorDaysCount: 0` → 🔥 didn't render.

**V62-bis fix**: `handleGenScheduleLink` fetch was gated `if (schedSelectedDoctor) { scheduleEntries = await listStaffSchedules({...staffId}) }` → empty entries for noDoctor + ทุกคน modes → V62 derivation on []. Post-V62-bis: ternary always-fetch.

**V63 fix (admin-side)**: NEW state `allBranchScheduleEntries` + useMemo `canonicalDoctorDays` derived from `be_staff_schedules`. Replace `schedDoctorDays.has(...)` → `canonicalDoctorDays.has(...)` at image-1 (Frontend appt calendar) + image-2 (ตั้งค่าตารางคลินิก) render sites. `toggleDay` cycle simplified to closed↔normal only (drops "doctor" toggle). UI legend updates: subtitle, legend chip "(จากตารางหมอ)", button label "แก้ไขปิดคิว".

**Rule M data fix**: SCH-cc3964c023 backfilled to 18 doctorDays + 22 customDoctorHours keys.

**Tests**: +20 V63.M1-M6 + 3 V62-bis.M-bis.1-3 + 1 V60.X2.3 fixup (1 → ≤2 listStaffSchedules tokens). Cumulative: 7992 → 8059 + 1 skipped (+67 net) all GREEN. Build clean.

**NEW audit invariant AV35**: AdminDashboard calendars MUST drive 🔥 from canonical via `canonicalDoctorDays`; `toggleDay` cycle = closed↔normal only; `handleGenScheduleLink` fetch ungated. Companion AV32 + AV34 + AV35 = complete schedule-link canonical-source family. SKILL.md: 34 → 35.

The schedule-link adoption-gap series (V52-V63) is now **9 V-entries deep** — one canonical source-of-truth (`be_staff_schedules`), 9 boundaries closed.

Detail: V63 V-entry compact in `.claude/rules/00-session-start.md` § 2; AV35 in `.agents/skills/audit-anti-vibe-code/SKILL.md`; checkpoint `.agents/sessions/2026-05-08-v63-v62bis-canonical-admin-calendar.md`.



### Session 2026-05-08 EOD #15 — V62 doctorDays + customDoctorHours derived for ALL link modes (AV34)

User report (verbatim, with 2 screenshots showing SCH-9c201860e1):
> "ลิ้งนี้ยังไม่แสดงสถานะหมอ ทั้งๆที่เป็นลิ้งที่ติ๊กเลือกว่าจะแสดงสถานะหมอว่าง/ไม่ว่าง ด้วย ทั้ง emoji ไฟลุกในปฏิทินในช่องวันที่หมอเข้าก็ไม่แสดง ... และวันที่ 9 ในภาพที่ 2 นอกจากจะแสดงว่าห้องช็อคเวฟไม่ว่างแล้ว ก็ให้แสดงให้ลูกค้ารู้ด้วยว่าหมอก็ไม่ว่างอยู่เหมือนกันในอีกห้องหนึ่ง แต่ไม่ต้องบอกว่าห้องอะไร"

**Class-of-bug (Rule P)**: V12 multi-reader-sweep narrowed-derivation gap. V60 closed save-time derivation for SPECIFIC doctor case but did NOT extend to multi-doctor modes (ไม่พบแพทย์ + แพทย์ทุกคน). Diag of SCH-9c201860e1 confirmed: `doctorDaysCount: 0`, `doctorStartTime: '11:30'` (clinic), `doctorEndTime: '20:30'` (clinic) → `isSlotWithinDoctorHours` always returned false → 🔥 emoji + "หมอว่าง/ไม่ว่าง" overlay never rendered.

**Architectural fix (V62 / AV34)**:
1. **NEW pure helpers** in `src/lib/staffScheduleValidation.js`:
   - `derivedDoctorDaysAcrossWindow({doctorIds, allEntries, datesISO})` — multi-doctor extension of V60. `doctorIds=null` aggregates ALL doctors (ไม่พบแพทย์ + แพทย์ทุกคน modes). `[DOC]` filter mode mirrors V60 single-doctor.
   - `derivedDoctorWorkingHoursPerDate({doctorIds, allEntries, datesISO})` — returns `{[dateISO]: [{start,end},...]}` from working entries; off-shift types excluded; multi-doctor non-overlapping windows kept as separate ranges.
2. **`handleGenScheduleLink`** runs V62 derivations UNCONDITIONALLY (no schedSelectedDoctor gate). `finalDoctorDays = union(V60 specific + V62 multi-doctor + manual paint)` Set-deduped. `v62MergedCustomDoctorHours = {...derived, ...adminOverrides}` — admin's per-day overrides win on collision. Saved doc shape: `customDoctorHours: v62MergedCustomDoctorHours` (was `schedCustomDoctorHours` admin-only).
3. **`ClinicSchedule.jsx`** overlay condition `slot.doctorSlot && !slot.booked && (` → `slot.doctorSlot && (` — renders even when slot busy (image-2 spec: shockwave busy + doctor busy → BOTH visible). Outer `opacity-30` moved from card to inner time-text wrapper only — badge stays full opacity.
4. **Rule M data fix** (`scripts/v62-fix-schedule-link-doctor-data.mjs`): two-phase dry-run + apply. SCH-9c201860e1 backfilled to 18 May 2026 doctorDays + 22 customDoctorHours keys (18 derived Sun/Mon/Wed/Sat × 4-5 + 4 admin overrides preserved). Audit doc: `be_admin_audit/v62-fix-schedule-link-doctor-data-1778253292223-c3c8725b`. Forensic stamps `_v62BackfilledAt` + `_v62LegacyDoctorDays` + `_v62LegacyCustomDoctorHours`.

**NEW audit invariant AV34**: customer-facing schedule-link MUST derive doctor data for ALL modes (no schedSelectedDoctor gate); customer overlay MUST render even when slot booked. Sanctioned exceptions: NONE. Companion AV32 (V60 specific-doctor case). SKILL.md: 33 → 34 invariants.

**Test bank shipped (Rule N + Rule I)**:
- 44 V62.H1-H5 + M1-M5 + X1-X4 in `tests/v62-doctor-days-and-hours-from-schedules.test.js`
  - H1-H4: helper unit (multi-doctor / leave-cancels / per-date overrides / cross-helper consistency with V60)
  - H5: V62 marker comments in source
  - M1-M5: source-grep regression (handleGenScheduleLink wiring + saved doc shape + ClinicSchedule overlay always-on + Rule M canonical script + V60 helper still exists for backward compat)
  - X1-X4: mixed combinations (SCH-9c201860e1 reproduction + multi-doctor non-overlapping shifts + per-date overrides + end-to-end fix verification)
- 2 V21-class fixups: V60.X2.1 (import regex 400→1200 chars for grown imports) + V60.X6.1 (setDoc payload regex 3500→5000 chars for V61+V62 added comments)

**Live preview_eval verification**: SCH-9c201860e1 post-V62 shows:
- 14 fire-emoji days in calendar (Sun/Mon/Wed/Sat — was 0 pre-V62)
- May 10 (Sun) clicked → slots 13:30-19:30 show **"หมอว่าง"** badges (matches doctor's actual hours, NOT clinic 11:30-20:30)
- May 10 slots 10:30-13:30 → NO doctor badge (correctly outside doctor hours)
- May 9 (Sat) clicked → slots 15:30-18:30 show **"ไม่ว่าง"** + **"หมอไม่ว่าง"** TOGETHER (image-2 spec satisfied)
- May 9 slots 13:30-15:30 → "ว่าง" + "หมอว่าง" (free + doctor free → can pivot to consultation)

**Cumulative**: 7992 → 8036 + 1 skipped (+44 net) all GREEN. Build clean (AdminDashboard chunk 372 → ~373 KB).

**Methodology lessons**:
- (a) **A narrow derivation is a future bug magnet** — V60's `if (schedSelectedDoctor)` gate skipped ไม่พบแพทย์ mode where admin INTENTIONALLY doesn't select a doctor. Generalize derivation early; gate the OUTPUT (per-mode UI logic) not the INPUT (data derivation).
- (b) **Customer overlay needs FULL 4-state display matrix** — pre-V62 hid overlay when slot busy. User wanted ALL combinations of (slot busy/free × doctor busy/free) visible. Booked + free-doctor is a productive state (pivot opportunity), not a dead end. V62 unconditional render captures this.
- (c) **Snapshot at save = canonical pattern for customer-facing public-link docs** — V60 doctorDays + V61 selectedRoomIds + V62 customDoctorHours all use this. Customer link reflects last-Sync state; admin controls when refresh happens.
- (d) **CSS opacity placement matters for layered information** — applying `opacity-30` to OUTER card dimmed the doctor badge along with slot text. Move dim to inner element that should dim; sibling badges stay at full opacity. Layering visual hierarchy preserves multi-info display when slot has multiple statuses.
- (e) **The complete schedule-link adoption-gap series (V52-V62) is now 8 V-entries deep**: V52 reports / V53 time-axis / V54 raw listeners / V55 modal data sources / V56 room auto-closure / V60 save-time doctorDays specific / V61 modal UI room dropdown / V62 save-time doctorDays + customDoctorHours multi-doctor. 8 boundaries, one canonical source-of-truth (`be_staff_schedules`).

**Outstanding**: combined `vercel --prod` for V52..V61 + V62 (30 commits ahead of prod; user-authorized only).

Detail: V62 V-entry in `.claude/rules/00-session-start.md` § 2; AV34 in `.agents/skills/audit-anti-vibe-code/SKILL.md`.
- **Probe-Deploy-Probe**: N/A — no rules change in any V-entry this session.
- **Iron-clad rule status**: systematic-debugging Phase 1-4 + Rule P 7-step + Rule J HARD-GATE (brainstorming spec written + approved) + Rule K work-first/test-last + Rule M two-phase data ops + Rule H-bis EXECUTED. Invariant set: AV1-AV30 + AV32 + AV33 + BS-1..BS-15 + CB-1..5 (AV31 still pending in SKILL.md from V58).
- **Migrations applied on prod**: + V57 backfill 6 be_exam_rooms.kind='doctor'; + V60 backfill SCH-2f69d853fb doctorDays (18 May 2026 entries). V61 has NO migration — backward-compat via dual-field (`selectedRoomId` legacy + `selectedRoomIds` V61) preserved by `shouldBlockScheduleSlot` fallback.
- **Rule B probe list**: still 4 endpoints.

### Session 2026-05-08 EOD #14 — V61 Schedule-link modal room dropdown driven by `be_staff_schedules` (AV33) — brainstormed feature

User report (verbatim, with screenshot of modal):
> "เพิ่มเงื่อนไขใน Modal สร้างลิงก์ตาราง คือ หากไม่ได้ติ๊กไม่พบแพทย์ … ลิ้งค์พบแพทย์จะแสดงแต่ห้องที่แพทย์คนนั้นๆที่เลือกใน dropdown เข้าตรวจ … หากเลือกสร้างลิ้งแบบไม่พบแพทย์ modal จะโผล่ dropdown ให้เลือกห้องที่ไม่ได้มีแพทย์เข้าตรวจ … ในระยะเวลาที่เลือก"

**Class-of-bug** (Rule P): V12 multi-reader-sweep at the schedule-link MODAL UI boundary. Same family as V52/BS-11 (reportsLoaders), V53/BS-12 (TIME_SLOTS), V54/BS-13 (raw listeners), V55/BS-14 (modal data sources), V56/BS-15 (room auto-closure), V60/AV32 (save-time doctorDays). V61 closes the LAST adoption-gap — the MODAL UI dropdown filter source.

**Pre-V61 root cause**: `AdminDashboard.jsx:4333` filtered `branchExamRooms.filter(r => r.role === (schedNoDoctorRequired ? 'staff' : 'doctor'))` — V57 static kind filter. Two failure modes: (a) พบแพทย์ mode showed every kind=doctor room — including rooms the selected doctor never enters; (b) ไม่พบแพทย์ mode showed every kind=staff room — including rooms doctors actually use for procedures.

**Brainstorming session** (Rule J HARD-GATE): 4 design Qs locked with user before any code:
- **Q1=B refined**: "แพทย์ทุกคน" stays; room dropdown = UNION of ALL doctors' rooms in window
- **Q2=A**: pre-flight gate — block save with inline error when zero rooms qualify
- **Q3=B**: keep "ทุกห้อง" placeholder = "ทุกห้องที่แพทย์เข้า" = union snapshot
- **Q4=A**: snapshot at gen + recompute on Sync; customer link only updates on admin Sync

Spec written to `docs/superpowers/specs/2026-05-08-v61-schedule-link-room-dropdown-from-schedules-design.md` (~14 KB; full architecture + helper signatures + UI changes + save shape + customer rendering + AV33 invariant + test plan).

**Architectural fix (Approach A)**:
1. **Pure helpers** in `src/lib/staffScheduleValidation.js`:
   - `deriveDoctorRoomIdsForWindow({doctorIds, allEntries, datesISO})` — union of `roomIds` across working entries; `doctorIds=null` aggregates ALL doctors (Q1=B refined)
   - `deriveNonDoctorRoomIdsForWindow({branchExamRooms, allEntries, datesISO})` — rooms in `branchExamRooms` (`status='ใช้งาน'`) NOT touched by any working entry in window
2. **Modal UI** (`AdminDashboard.jsx`): `v61DatesInRange` + `v61EligibleRoomIds` + `v61EligibleRooms` useMemos; defensive reset useEffect (V55 pattern); updated label copy ("ห้องที่แพทย์เข้าตรวจ" / "ห้องที่ไม่มีแพทย์เข้าตรวจ"); empty-state banner `data-testid="v61-room-empty-state"` with 3 Thai-copy variants.
3. **useEffect extension**: fetches branch-wide `be_staff_schedules` when `schedSelectedDoctor` is null (needed for "แพทย์ทุกคน" + ไม่พบแพทย์ modes). Pre-V61 V59-bis only fetched for specific doctor.
4. **Save path**: `handleGenScheduleLink` pre-flight gate `if (v61EligibleRoomIds.length === 0)` blocks save with Thai toast (3 variants); `v61SelectedRoomIds` snapshot computed BEFORE the bookedSlots filter loop so the loop applies array-aware filtering; saved doc shape adds `selectedRoomIds: string[]` (legacy `selectedRoomId` preserved for backward compat).
5. **Filter helper extension** (`scheduleFilterUtils.js shouldBlockScheduleSlot`): accepts `selectedRoomIds: string[]` alongside legacy `selectedRoomId: string`. Prefers array when present + non-empty; falls back to single. Empty/nullish array → falls back to single. Pre-V61 saved docs unaffected.
6. **Resync recompute** (`updateActiveSchedules`): detects "ทุกห้อง" V61 saved docs (`selectedRoomId === null` + `selectedRoomIds` non-empty) and recomputes union from current `be_staff_schedules` (fetches `listStaffSchedules` per branch + `listExamRooms` for noDoctorRequired mode). Specific-pick docs preserved verbatim. Customer link only updates on admin Sync (Q4=A).

**NEW audit invariant AV33**: any customer-facing schedule-link modal MUST drive its room dropdown from canonical `be_staff_schedules` data — V57 kind static filter forbidden. Source-grep anchor: `branchExamRooms.filter(r => r.role === ...)` MUST NOT appear; `deriveDoctorRoomIdsForWindow` MUST. Sanctioned exceptions: NONE. Companion AV: AV30 (V57 kind schema). SKILL.md: 32 → 33 invariants.

**Test bank shipped**: 83 V61 tests in `tests/v61-schedule-link-room-from-schedules.test.js`:
- H1-H8 (44) — pure helper unit + adversarial (Doc A specific / แพทย์ทุกคน / multi-doctor / leave cancellation / per-date overrides / nullish inputs / Thai unicode / status filter / V57 kind ignored / multi-month)
- F1-F4 (13) — `shouldBlockScheduleSlot` extension (array preferred / backward compat / specific doctor + array / nullish entries filtered)
- M1-M8 (15) — source-grep regression (imports + V61 markers + V57 filter removed + useMemos + defensive reset + pre-flight gate + saved doc shape + filter cfg array)
- G1-G4 (8) — pre-flight gate (empty-state banner + label updates + resync recompute + filter helper marker)
- X1-X8 (10) — mixed combinations matrix (real-world หมอมายด์ + แพทย์ทุกคน + ไม่พบแพทย์ shockwave-only + per-date override + multi-month + branch-isolation + resync detection + cross-helper consistency with V60)

**V21-class test fixups (2 sites)**: V55.L7.2 (verbatim Thai user-directive quote restored on single line) + V59.P1.5 (relaxed to accept either V59 skip-and-clear path OR V61 branch-fetch path with V61 marker — both satisfy contract "the effect handles the null-doctor case correctly"). Same V52/V54 test-fixup pattern.

**Live preview_eval verification**: V60-fixed link `SCH-2f69d853fb` post-V61 still renders 14 fire days (backward-compat preserved — `selectedRoomIds: null` falls through to existing logic without breaking).

**Cumulative**: 7909 → 7992 + 1 skipped (+83 net) all GREEN. Build clean (AdminDashboard chunk 370 → 372 KB, +2 KB for V61 helpers + dropdown logic).

**Methodology lessons**:
- (a) **Static schema fields ≠ behavior-driven semantics** — V57's `kind` field captured "this room is generally a doctor room" but the schedule-link modal needs "is this room being used by a doctor in THIS window". Two different questions; one needs static metadata, the other needs canonical schedule.
- (b) **Brainstorming HARD-GATE caught architectural drift** — Q1-Q4 locked with user before any code. Q1's "แพทย์ทุกคน" semantics, Q3's "ทุกห้อง" preservation, and Q4's snapshot+recompute pattern would have been ambiguous in code-first. Saved 4+ rounds of "almost right" iteration.
- (c) **Snapshot + recompute pattern complete for schedule-link** — V60 doctorDays + V61 selectedRoomIds both snapshot at gen, recompute on Sync. Customer link is stable until admin syncs. Same architectural pattern as Rule O (V46/V48) "the FINAL write goes through canonical-derive at write boundary".
- (d) **Backward-compat via dual-field** (`selectedRoomId` legacy + `selectedRoomIds` array) — prevents migration risk while progressing the schema. `shouldBlockScheduleSlot` prefers array; falls back to single. Pre-V61 prod docs continue working without intervention.
- (e) **The complete schedule-link adoption-gap series (V52-V61)** demonstrates a single class-of-bug eliminated layer-by-layer across 7+ V-entries: V52 reports / V53 time-axis / V54 raw listeners / V55 modal data sources / V56 room auto-closure / V60 save-time doctorDays / V61 modal UI room dropdown. Each closed a different boundary; together they form a complete BSA + canonical-source story.
- (f) **Two V21-class test fixups** show that locking PRIOR contracts in tests is brittle — when the contract evolves, fix the test, document the V61 marker, preserve institutional memory in code comments. This is now a recurring pattern (V52/V54/V61 all had test fixups).
- (g) **Rule K work-first/test-last** — implemented all 6 source files first (helpers + modal logic + save path + resync paths + filter helper extension), reviewed shape, then wrote tests in single batch. Avoided V21 lock-in mid-stream.

**Outstanding**: combined `vercel --prod` for V52..V60 + V61 (29 commits ahead of prod; user-authorized only).

Detail: V61 V-entry in `.claude/rules/00-session-start.md` § 2; AV33 in `.agents/skills/audit-anti-vibe-code/SKILL.md`.

### Session 2026-05-08 EOD #13 — V60 Schedule-link doctorDays from canonical source (AV32) — systematic-debugging session

User report (verbatim): "http://localhost:5173/?schedule=SCH-2f69d853fb ลิ้งตารางที่ลูกค้าได้ไป กดดูอะไรไม่ได้เลย".

**Root cause** (caught via systematic-debugging Phase 1-2 + admin-SDK diag): saved doc `clinic_schedules/SCH-2f69d853fb` had `noDoctorRequired:false`, `months:['2026-05']`, `selectedDoctorId:DOC-mov2p9c0... (หมอมายด์)` BUT `doctorDays:[28 entries all in 2026-03/04]`. ClinicSchedule.jsx `isDayDisabled = isPastCutoff || isClosed || (!noDoctorRequired && !isDoctor)` → every May day fails `!isDoctor` → all 31 cells disabled silently. Admin had painted prior months but never advanced UI to paint May; pre-V60 `handleGenScheduleLink:1587` dumped `[...schedDoctorDays]` verbatim without intersecting against months window.

**Class-of-bug** (Rule P Step 2): V12 multi-reader-sweep at the schedule-link SAVE boundary. Same family as V52/BS-11 (reportsLoaders), V53/BS-12 (TIME_SLOTS), V54/BS-13 (raw listeners), V55/BS-14 (modal data sources), V56/BS-15 (room auto-closure derived from canonical). V60 closes the doctorDays surface — last adoption-gap in the schedule-link save path. `be_staff_schedules` is the canonical source; V56 introduced its consumption for room auto-closure but missed the doctorDays layer.

**Architectural fix** (4 layers + Rule M data fix):
1. **Pure helper** `derivedDoctorDaysFromSchedules({doctorId, allEntries, datesISO})` in `src/lib/staffScheduleValidation.js` — mirror of `derivedAutoClosedDates` shape; uses `mergeSchedulesForDate` semantics so per-date leave/holiday/sick override correctly cancels recurring weekday.
2. **Save handler refactor** (AdminDashboard.jsx:1455+): fetches `be_staff_schedules` ONCE (consolidates V56's prior fetch into `scheduleEntries`), feeds BOTH `derivedAutoClosedDates` AND `derivedDoctorDaysFromSchedules` from same data. `finalDoctorDays = union(derived, manual-paint-scoped-to-months)` — admin's prior-month manual paint NO longer leaks into future-month link. Saved doc shape: `doctorDays: finalDoctorDays` (was `[...schedDoctorDays]`).
3. **Pre-flight gate**: when `!schedNoDoctorRequired` AND any month has zero `doctorDays` → block save with Thai toast `"ยังไม่มีตารางหมอเข้าสำหรับ <month> — แก้ไขตารางคลินิกหรือตารางหมอก่อนสร้างลิงก์"` + early-return + `setSchedGenLoading(false)`.
4. **Customer-side defense in depth** (`ClinicSchedule.jsx:131+`): `isEmptyDoctorMonth` derived state + banner `data-testid="schedule-empty-doctor-month"` rendered above calendar card with Thai/EN copy ("ยังไม่มีตารางแพทย์ประจำเดือนนี้ — กรุณาติดต่อคลินิก").
5. **Rule M data fix** (`scripts/v60-fix-schedule-link-doctor-days.mjs`): two-phase dry-run + apply on real prod. Backfilled SCH-2f69d853fb to 18 May 2026 days (Sun/Mon/Wed/Sat × 4-5 occurrences from doctor's 4 recurring entries). Idempotent (re-run --apply yields 0 writes). Audit doc emitted; forensic stamps `_v60BackfilledAt` + `_v60LegacyDoctorDays`.

**NEW audit invariant AV32**: any per-date set written to a customer-facing world-readable doc must derive from canonical Firestore source for the doc's window + UNION with admin-state filtered to window. Verbatim spread of admin-state Set FORBIDDEN. Source-grep anchor: `doctorDays:\s*finalDoctorDays` MUST appear in clinic_schedules setDoc shape; `doctorDays:\s*\[\.\.\.schedDoctorDays\]` MUST NOT. Companion AV: AV24 (Rule O productName live-resolve at write-time — same architectural family).

**Test bank shipped**: 48 V60.X1-X7 in `tests/v60-doctor-days-derive-from-schedules.test.js`:
- X1 (13) — `derivedDoctorDaysFromSchedules` helper unit + adversarial (empty/null inputs / wrong doctorId / leave-cancels-recurring / per-date-on-non-recurring-day / invalid date strings / multi-month / V60 marker)
- X2 (7) — handleGenScheduleLink uses derive helper + saves finalDoctorDays + listStaffSchedules consolidated to ONE call
- X3 (6) — ClinicSchedule.jsx empty-doctor-month banner derivation + Thai/EN copy + V60 marker
- X4 (4) — pre-flight gate Thai copy + early-return + skipped when noDoctorRequired=true + Thai BE year conversion
- X5 (9) — Rule M migration script canonical shape (invocation guard + canonical paths + two-phase --apply + PEM key conversion + forensic stamps + crypto.randomBytes + audit emit + atomic batch + idempotency)
- X6 (3) — V12 multi-reader-sweep regression sweep (no verbatim spread in setDoc, ONE listStaffSchedules call, gate uses same finalDoctorDays as save)
- X7 (6) — full-flow simulate (PRE-V60 bug repro with March/April manual paint + POST-V60 contract producing 18 May days + manual-paint-dropped + gate would PASS + gate FIRES on empty schedule + multi-month gate)

**Live preview_eval verification**: SCH-2f69d853fb post-fix renders 14 May dates with 🔥 + "ว่าง 8/9" labels; click on May 9 (Sat) opens slot panel with 9 time slots. End-to-end customer flow VERIFIED working.

**Cumulative**: 7861 → 7909 + 1 skipped (+48 net) all GREEN. Build clean (AdminDashboard chunk 365→370 KB, +5KB for V60 logic).

**Methodology lessons**:
- (a) **Admin-state Sets ≠ save-time canonical sources** — when a per-date set gets persisted into a customer-facing doc, derive from the canonical Firestore source FIRST then UNION with admin-state filtered to window. Same architectural pattern as Rule O (V46/V48): "the FINAL write goes through canonical-derive at write boundary".
- (b) **Pre-flight gates surface latent bugs at admin time** — saving "whatever shape we have" turns silent breakage into noisy bug at link-share time. Adding "would this doc be functional?" check before commit is cheap insurance.
- (c) **Defense in depth on customer side** — even with admin gate, legacy in-the-wild links predate the gate; empty-state banner is one-screen change that prevents customer confusion forever, regardless of who/what produced the broken doc.
- (d) **BSA adoption-gap pattern at the WRITE boundary** is the mirror of READ-boundary gaps (V52-V55). When a canonical source exists, EVERY writer that derives from admin state must also derive from canonical. V56 introduced be_staff_schedules consumption at auto-closure layer but missed the doctorDays layer for 2 sub-revisions until V60.
- (e) **Two-tier solution pattern** (data fix NOW + code fix for class) is the canonical response to "user-affected legacy artifact + recurring class-of-bug". Data fix unblocks customer in <10 min; code fix prevents recurrence in next admin save. Rule M two-phase + admin-SDK + canonical path + audit doc + forensic stamps + idempotency = the canonical Rule M template.
- (f) **systematic-debugging Phase 1-2 caught the gap** — admin-SDK diag on the saved doc + cross-reading the disable rule in ClinicSchedule.jsx revealed root cause in ~10 min. Without the diag script, debugging via UI clicks could have wasted hours.

**Outstanding**: combined `vercel --prod` for V52..V59-bis + V60 (28 commits ahead of prod; user-authorized only).

Detail: V60 V-entry in `.claude/rules/00-session-start.md` § 2.

### Session 2026-05-08 EOD #12 — V57+V58+V59-bis trilogy + black-screen revert recovery

Three V-entries shipped + one instructive React TDZ revert.

**V57 / AV30** (`103e9da`) — Exam Room Kind Schema Completion. User: "ไม่มีห้องตรวจได้ยังไง?" — modal showed empty-state despite 6 rooms in prod. Diag: all 6 rooms had `kind: undefined` (Phase 18.0 schema gap — never declared `kind` field; V55+V56 consumers filtered `r.kind === 'doctor'` strict). Multi-layer fix Approach A: schema (KIND_OPTIONS + emptyForm default + validate enum + normalize coerce) + UI (radio picker ห้องแพทย์/ห้องหัตถการทั่วไป) + 5 consumer defensive defaults `(r.kind ?? 'doctor')` + Rule M backfill (6 prod rooms stamped, audit-doc-emit, idempotent). +26 tests, AV30 invariant.

**V58 / AV31** (`41abd19`) — Doctor picker snap-back. User (frustrated): "มันเลือกไม่ได้โว้ย ... เด้งกลับมาเป็นแพทย์ทุกคน". Root: `Number("DOC-...")` → NaN → falsy → `<select value={NaN || ''}>` reverts default. 1-line fix: drop `Number()` coercion. +11 tests. AV31 invariant. Bug pre-dated V55 (legacy ProClinic numeric-ID assumption).

**V59-bis** (`7ae231e`) — V56 auto-closure inline preview (3 color-coded states: green licensed / amber mismatch / neutral no-shifts). First attempt (`51929f1`) crashed frontend with black screen — useMemo deps referenced `practitioners`/`branchExamRooms`/`schedDoctorSchedules` declared 100-300 lines later → JS Temporal Dead Zone → ReferenceError silently caught by React → empty root. Reverted in `05e210f` per Rule A. Re-applied with hooks placed AFTER all deps (line ~632 instead of ~394). PLACEMENT NOTE comment template added. +22 tests.

A5.2 regex window bumped 3000 → 6000 (pre-existing test-side flake from grown fetchDepositOptions).

Detail: `.agents/sessions/2026-05-08-v57-v58-v59-bis.md`.

### Session 2026-05-08 EOD #10 — V56 Doctor Schedule Room Assignment (BS-15) shipped — subagent-driven-development session

User request: add a room assignment feature to the doctor schedule modal so each schedule entry can specify which exam room(s) the doctor will use for that shift. The saved rooms should drive the schedule-link (auto-closure when all rooms are occupied) and display as inline chips in TodaysDoctorsPanel.

**Feature scope** (Tasks 1–7 via subagent-driven development, Task 8 this session):
- **Schema**: per-shift `roomIds: string[]` on `be_staff_schedules` documents
- **Validators** (`src/lib/scheduleValidation.js`): SS-10 — doctor+working-type entries require `roomIds` non-empty; SS-11 — assistant entries must NOT include `roomIds`
- **Pure helpers** (`src/lib/scheduleFilterUtils.js`): `expandRoomIdsForDisplay(roomIds, examRooms)` → display objects; `derivedAutoClosedDates(staffSchedules, examRooms)` → auto-closes dates where all rooms occupied
- **UI — ScheduleEntryFormModal** (`src/components/scheduling/ScheduleEntryFormModal.jsx`): room-checkbox list rendered below the time-slot section when entry type is doctor+working; disabled when assistant type
- **UI — TodaysDoctorsPanel** (`src/pages/AdminDashboard.jsx`): inline chips showing room names alongside each doctor's schedule entry in the today panel
- **Schedule-link integration** (`src/pages/AdminDashboard.jsx` `handleGenScheduleLink`): calls `derivedAutoClosedDates` to feed auto-closed dates into saved schedule-link doc
- **BS-15 audit invariant** (`audit-branch-scope` SKILL.md): every component reading `roomIds` from `be_staff_schedules` MUST resolve room names from `be_exam_rooms` (not from stale denormalized cache); BS-14 → BS-15 (14 invariants → 15)

**Test bank shipped** (Rule I full-flow simulate + Rule K work-first-test-last):
- `tests/v56-doctor-schedule-room-assignment-flow-simulate.test.jsx` — 25 RTL tests (F1-F7 groups): schema contract + validator SS-10/SS-11 + expandRoomIdsForDisplay helper + derivedAutoClosedDates helper + ScheduleEntryFormModal checkbox render + TodaysDoctorsPanel chip render + handleGenScheduleLink auto-closure integration
- `tests/audit-branch-scope.test.js` extended +BS-15.x sub-tests
- `audit-branch-scope` SKILL.md: 14 → 15 invariants

**Final tally**: 7735 → 7746 GREEN (+11 net). Build clean (2.28s, AdminDashboard 365.57 KB).

**Methodology lessons**:
- **Subagent-driven development** (Tasks 1–7 each a fresh subagent) with 2-stage review: each subagent ran targeted tests + build check before reporting done; orchestrator reviewed cross-task invariants at batch end.
- **Rule K (work-first-test-last)** honored: all 7 implementation tasks completed before test bank written; test bank written in single final pass covering all 7 streams.
- **BS-15 closes the room-assignment surface**: every `be_staff_schedules` roomIds reader must resolve names from live `be_exam_rooms` (not denormalized cache) — AV-class invariant preventing future V49-style shape drift.

**Outstanding**: combined `vercel --prod` for V52+V53+V54+V55+V56 (19 commits ahead of prod; user-authorized only).

Detail: V56 V-entry in `.claude/rules/00-session-start.md` § 2 + V-log compact row.

### Session 2026-05-08 EOD #9 — V55 Schedule-link modal branch-scope (BS-14) shipped — systematic-debugging session

User report (verbatim, with image of "สร้างลิงก์ตาราง" modal showing room dropdown stuck on cross-branch data):
> "modal สร้างลิ้งค์ตาราง ยังไม่ได้ดึงข้อมูลต่างๆใน modal จากสาขานั้นๆ"

User's follow-up clarifying the two-layer architecture:
> "ทำให้ลิ้งค์ตารางที่ส่ง สัมพันธ์กับหมอที่เข้างานจริง สัมพันธ์กับห้องตรวจนั้นๆ ... แต่ว่าสำหรับการสร้างลิ้ง เมื่อนำข้อมูลจริงมาจาก backend จะต้องมาติด filter บริเวณ ตั้งค่าตารางคลินิก ทั้งการเปิดปิดวัน และเปิดปิดช่วงเวลา"

= REAL data layer per-branch (doctors actually working, real exam rooms, real appointments, real clinic open hours per branch) — and admin OVERRIDES (schedClosedDays/schedManualBlocked already per-branch via Phase 22.0c) act as a "fake-busy mask" for customer-facing link.

**Class-of-bug**: V12 multi-reader-sweep at AdminDashboard "Frontend" page → branch-scoped data adoption gap. Same family as V52/BS-11, V53/BS-12, V54/BS-13. Phase 22.0c covered the SAVE side (clinic_schedules.branchId stamp + schedule_prefs per-branch). Phase 22.0c did NOT cover the MODAL DATA SOURCES (doctor list + room list + clinic open hours stamped into the saved doc).

**3 surface defects** (+ adjacent leaks elsewhere in AdminDashboard.jsx — same class):
- **Bug A**: `livePractitioners` (lines 348-380) — universal `listDoctors`/`listStaff` reads NEVER filtered by branch. Fix: `filterDoctorsByBranch + filterStaffByBranch` + `selectedBranchId` in useEffect deps.
- **Bug B**: rooms (4 sites: L917 + L1308 + L1376 + L4026) — read legacy global `clinicSettings.rooms`. Fix: NEW `branchExamRooms` state from `listExamRooms({branchId, status:'ใช้งาน'})` (Phase 18.0 canonical). Mapper: `r.kind === 'doctor' ? 'doctor' : 'staff'` → `r.role` for callsite parity.
- **Bug C**: clinic+doctor hours (12 sites: L1181-1182 + L1221-1222 + L1248-1250 + L1354-1357 + L1368-1371 + L5788-5789 + L6455-6456) — read legacy global `clinicSettings.{clinicOpen,clinicClose,doctorStart,doctorEnd}Time*`. Fix: NEW `cs = useEffectiveClinicSettings({...DEFAULT, ...clinicSettings})` + 4 useMemo helpers (`monFriOpen/Close + satSunOpen/Close`) deriving from V51 `cs.openHoursMonFri/SatSun`. Doctor hours default = clinic open hours per branch (admin per-day overrides via `schedCustomDoctorHours` preserved).

**Defensive resets** (V55 hardening):
- When `livePractitioners` updates (branch switch refetch), if previously-picked `schedSelectedDoctor` not in new list → reset to null.
- Same for `schedSelectedRoom` against `branchExamRooms`.
- Pre-create `getAppointmentsByMonth(mo, preBranchOpts)` now passes EXPLICIT `{branchId: selectedBranchId}` (V52/BS-11 canonical pattern) on top of V54/BS-13 safe-by-default backstop — defense in depth.

**NEW audit invariant BS-14**: every read of `clinicSettings.{rooms|clinicOpen,clinicClose,doctorStart,doctorEnd}Time*` in `src/pages/AdminDashboard.jsx` must go through V55 helpers. 10 sub-tests (BS-14.1..BS-14.10). Sanctioned exceptions: NONE — all sites go through V55 helpers (legacy `clinicSettings.X` allowed only inside the helper memos' fallback chain).

**Test bank shipped** (Rule N targeted + Rule I full-flow):
- `tests/v55-schedule-link-modal-branch-scope.test.js` — 38 helper unit + adversarial (L1-L7): mergeBranchIntoClinic + V55 hours fallback chain + be_exam_rooms.kind→role mapping + defensive reset logic + filterDoctorsByBranch backward-compat (V36 lock) + adversarial (null/undefined/Thai/numeric/string ids) + V55 source-grep markers
- `tests/v55-schedule-link-modal-flow-simulate.test.js` — 17 Rule I full-flow (F1-F7): BranchProvider + canonical pattern → branch switch → re-fetch livePractitioners + branchExamRooms + per-branch hours + lifecycle round-trip + saved-doc shape parity
- `tests/audit-branch-scope.test.js` extended +10 BS-14.x sub-tests
- `audit-branch-scope` SKILL.md: 13 → 14 invariants table

**Final tally**: 7662 + 1 skipped → 7735 GREEN (+~73 net). Build clean.

**Methodology lessons**:
- **Two-layer architecture is the canonical design** for customer-facing link modals — REAL data layer (per-branch from backend) × ADMIN-OVERRIDE LAYER (closedDays/manualBlocked admin can mask real-free as fake-busy). Override layer can ONLY hide availability — never claim fake-free for real-busy (would create double-booking).
- **AdminDashboard.jsx Frontend page lagged BSA adoption** because it predates per-branch architecture (Phase 1-7) and was incrementally retrofitted (V51/V53/V54). Each retrofit closed one surface but left others. BS-14 closes the schedule-link modal surface permanently.
- **Class-of-bug expansion at PAGE LEVEL** — V52/BS-11 was reportsLoaders, V53/BS-12 was TIME_SLOTS, V54/BS-13 was raw listeners, V55/BS-14 is AdminDashboard's clinicSettings.X reads. Each at a different audit boundary; all part of the same V12 multi-reader-sweep family.
- **Defensive resets bridge state-vs-fresh-data** when state outlives the data source — e.g. picking a doctor in branch A then switching to B can leave a stale `schedSelectedDoctor` ID. Without auto-reset, saved doc carries cross-branch ghost ID.

**Outstanding**: combined `vercel --prod` for V52 + V53 + V54 + V55 (4 commits ahead of prod; user-authorized only).

Detail: V55 V-entry in `.claude/rules/v-log-archive.md`.



### Session 2026-05-08 EOD #8 — V54 Listener safe-by-default (BS-13) shipped — systematic-debugging session

User report (verbatim): "tab นัดหมายใน Frontend ยังไม่แยกดึงข้อมูลเป็นสาขาๆ"

= "the appointments tab in Frontend doesn't yet separate-fetch by branch"

**Surface identified**: AdminDashboard.jsx (the `/admin` patient-queue dashboard, the original Phase 1-7 admin "Frontend" page — distinct from BackendDashboard tabs). The Appointment Manager queue calendar uses `listenToAppointmentsByMonth` to render the month's appointments — and showed ALL branches' appointments steady-state regardless of top-right BranchSelector.

**Root cause** (3-layer V21 chain caught via systematic-debugging Phase 1-2):
1. **Comment-vs-code drift (V21)** at `AdminDashboard.jsx:713-715` — comment claimed "scopedDataLayer wrapper resolves the current branch"; wrapper is plain passthrough
2. **Wrapper passthrough** at `scopedDataLayer.js:307` — `listenToAppointmentsByMonth = (...args) => raw.listenToAppointmentsByMonth(...args)`, NO auto-inject
3. **Safe-by-default-FAILED** at `backendClient.js:2361` — `useFilter = undefined && !false` falsy → query = WHOLE be_appointments collection (no where-clause)

**Class-of-bug**: V21 comment-vs-code drift family + NEW "Raw listener safe-by-default-FAILED" sub-class. Same pattern repeated at 3 layers; agent-based static audit missed the gap because it accepted the comment text at face value without verifying the wrapper actually performed auto-inject. The safe template (`listenToScheduleByDay`) existed (line 10572+) but siblings didn't adopt it.

**V54 architectural fix** (mirror `listenToScheduleByDay` pattern in 4 sibling functions in backendClient.js):
- `getAppointmentsByMonth` + `getAppointmentsByDate` + `listenToAppointmentsByDate` + `listenToAppointmentsByMonth`
- Pattern: `effectiveBranchId = (typeof branchId === 'string' && branchId) ? branchId : (allBranches ? null : resolveSelectedBranchId());` then `if (!effectiveBranchId && !allBranches) return ...;` — empty `{}` for grouped getter, `[]` for list getter, `onChange([])` + noop unsubscribe for listeners. NEVER falls back to whole-collection query unless `allBranches: true` is explicit.
- Plus AdminDashboard.jsx:716 — pass `{ branchId: selectedBranchId }` explicitly (V52/BS-11 canonical pattern; defense-in-depth).

**NEW audit invariant BS-13**: every raw appointment getter+listener in backendClient.js MUST be safe-by-default. Closed sanctioned-exception list (none — all 4 follow the rule). Anchor on `resolveSelectedBranchId` reference + V54/BS-13 marker comment. 7 sub-tests in `tests/audit-branch-scope.test.js` (BS-13.x).

**Test bank shipped**:
- `tests/v54-listener-safe-by-default.test.js` (24 tests, L1-L5) — 4 functions × 4-6 scenarios + V54 source-grep markers
- `tests/audit-branch-scope.test.js` extended (+7 BS-13.x sub-tests)
- 4 pre-existing V21-class regression tests fixed (Z3.1, A6.1, S5.1, BS-F.2) — they had locked the broken `{}` opts pattern; updated to lock V54 explicit-branchId contract with V54 marker comments explaining the drift

**Final tally**: 7631 → 7662 + 1 skipped (+31 net) all GREEN. Build clean.

**Methodology lessons**:
- **systematic-debugging Phase 1-2 caught what static audit missed** — V52/V53 audits saw "comment says auto-inject ✓" without VERIFYING the wrapper actually performs auto-inject. The V21 comment-vs-code drift was layered 3 deep (caller comment → scopedDataLayer comment → backendClient pattern). Adding BS-13 anchored on `resolveSelectedBranchId` reference (not comment text) closes the gap structurally.
- **3-layer V21 drift requires backstop at the data layer** — comment lies + wrapper passthrough + safe-by-default-FAILED stack up. Architectural backstop (safe-by-default in backendClient.js) closes the gap permanently regardless of caller mistakes or comment drift.
- **Test fixups are first-class artifacts** — 4 pre-existing tests asserted the broken contract. Updated each with V54 marker comment explaining the pre-V54 V21 drift + post-V54 contract. Same pattern as V52 stale-annotation strip + V53 BS-12 invariant.

**Outstanding**: combined `vercel --prod` for V52 + V53 + V54 (3 commits ahead of prod; user-authorized only).

Detail: `docs/superpowers/specs/2026-05-08-listener-safe-by-default-design.md` + `docs/superpowers/plans/2026-05-08-listener-safe-by-default.md` + V54 V-entry in `.claude/rules/v-log-archive.md`.

### Session 2026-05-08 EOD #7 — V53 Per-Branch Open Hours → Time-Axis Filter (BS-12) shipped

User directive (verbatim): "ทำให้เวลาเปิด-ปิดของแต่ละสาขา มีผลกับตารางแพทย์ ตารางนัดหมาย และ modal ที่จะไปดึงเวลานัดจากสาขานั้นทั้งหมด ... แค่เวลาที่เปิดเปิดคลินิก ไม่ต้องแสดงตั้งแต่ 8 โมง ถึง 4 ทุ่ม ถ้าคลินิกมันเปิดแค่ 11 โมง ถึง 3 ทุ่ม"

= "Make per-branch open-close hours drive the time-axis displayed in doctor schedule, assistant schedule, staff schedule, and appointment calendar (all tabs + every modal that pulls appointment times). Only show open hours."

**Class-of-bug**: parallel to V52 BS-11 — V51 shipped per-branch openHours schema but the canonical TIME_SLOTS axis (08:15–22:00 hardcoded) was rendered raw in 4 surfaces, ignoring per-branch settings. Same V12 multi-reader-sweep family at the time-axis layer.

**V53 commit** (single autonomous commit):
- `src/lib/scheduleFilterUtils.js` — 3 NEW pure helpers: `getOpenHoursForDate`, `getVisibleTimeSlotsForDate`, `isTimeOutsideOpenHours`. Bangkok-TZ-stable day-bucket via midday-UTC parse (avoids T00:00:00+07:00 → previous-day-UTC edge case).
- 4 victim files wired to canonical V53 pattern: `useEffectiveClinicSettings(undefined)` + `useMemo` on `cs.openHoursMonFri/SatSun` + `visibleSlots.map(...)` replaces `TIME_SLOTS.map(...)`:
  1. `AppointmentCalendarView.jsx` — grid filter + closed-day banner + orange "นอกเวลา" chip on legacy appt cards
  2. `AppointmentFormModal.jsx` — start/end picker filter + warning hint + closed-day banner inside modal
  3. `scheduling/ScheduleEntryFormModal.jsx` — picker filter + DOW_ANCHOR_DATE map for `kind === 'recurring'` (no concrete date)
  4. `DepositPanel.jsx` — picker filter for embedded deposit-booking sub-form (4th surface discovered via audit-grep regression test)
- Q1=A locked: legacy appts outside new open hours auto-expand visible range + orange chip flag — admin can see + reschedule (data preserved).

**New audit invariant BS-12** (parallel to BS-9, BS-11, V53):
- Every component importing `TIME_SLOTS` from `staffScheduleValidation.js` AND mapping it MUST also import `getVisibleTimeSlotsForDate` AND read `cs.openHoursMonFri/SatSun` (deps array hint)
- 7 sub-tests in `tests/audit-branch-scope.test.js` (BS-12.1..BS-12.7)
- `audit-branch-scope` SKILL.md: 11 → 12 invariants
- Sanctioned exception: `TimeSelect24.jsx` (uses HOURS/MINUTES local constants, naturally exempt from grep)

**Test bank shipped**:
- `tests/v53-open-hours-helpers.test.js` (33 tests, L1-L3) — Bangkok TZ + closed/reversed/missing detection + auto-expand + adversarial inputs
- `tests/v53-open-hours-source-grep.test.js` (41 tests, G1-G6) — per-victim regression + V12 anti-regression sweep
- `tests/v53-open-hours-flow-simulate.test.js` (7 tests, F1-F7) — Rule I full-flow with actual BranchProvider + canonical pattern
- `tests/audit-branch-scope.test.js` extended (+7 BS-12.x sub-tests)

**Final tally**: 7543 → 7631 + 1 skipped (+88 net) all GREEN. Build clean.

**Outstanding**: combined `vercel --prod` for V52 + V53 (2 commits ahead of prod; user-authorized only — say "deploy" THIS turn).

Detail: `docs/superpowers/specs/2026-05-08-per-branch-open-hours-time-axis-design.md` + `docs/superpowers/plans/2026-05-08-per-branch-open-hours-time-axis.md` + V53 V-entry in `.claude/rules/v-log-archive.md`.

### Session 2026-05-08 EOD #6 — V52 Report Tabs Branch-Scope (BS-11) shipped (autonomous overnight job)

User directive (verbatim, before sleep): "Tab ย่อยของหน้ารายงานทั้งหมดต้องแสดงรายละเอียดของสาขานั้นๆที่เลือกไว้ใน branch selector ยกเว้น tab=expense-report และ tab=clinic-report แสดงแบบ universal ได้ ... ไม่ต้องถามอะไรผมเลย เลือกที่นาย recommend ทั้งหมด และ ผมให้ผ่าทุกการรีวิว code ของนาย ให้ทำการแก้ไข เทส ทดสอบ ได้เลย โดยไม่ต้องถามอะไรผมทั้งนั้น เพราะผมจะไปนอน และหวังว่าตื่นมา งานนี้จะเสร็จทั้งหมด"

**Class-of-bug**: V12 multi-reader-sweep family at the report-tab/loader layer. 13 of 14 substantive report tabs ignored top-right BranchSelector — pre-V52 stale annotations claimed `{allBranches:true}` but flag was never actually passing.

**V52 commit** (single autonomous commit):
- `src/lib/reportsLoaders.js` — 7 loaders gain `{branchId, allBranches}` opts (additive, backward-compat preserved)
- 13 report tabs migrated to canonical V52 pattern: `useSelectedBranch` + `branchId: selectedBranchId` to all `load*` + `selectedBranchId` in deps array. Stale annotations stripped. Raw `backendClient.js` imports migrated to `scopedDataLayer.js` (BS-1 compliance).
- 2 EXEMPTED tabs (Expense + Clinic reports) get NEW `// audit-branch-scope: BS-11 in-page-selector` annotation (in-page multi-branch UI preserved untouched).
- ReportsHomeTab gets NEW `// audit-branch-scope: BS-11 navigation-only` annotation.
- RemainingCourseTab canonicalized destructure shape.

**New audit invariant BS-11** (parallel to BS-9, V52):
- Closed sanctioned-exception list (only 3 files may carry BS-11 annotations); test BS-11.7 enforces lock.
- 9 sub-tests in `tests/audit-branch-scope.test.js` (BS-11.1..BS-11.9).
- `audit-branch-scope` SKILL.md: 8 → 11 invariants table; new annotation table entries.

**Test bank shipped**:
- `tests/v52-reports-loaders-branch-id.test.js` (39 tests, L1-L8) — Firestore mock captures `where` clauses; verifies branchId filter + fallback path + adversarial inputs
- `tests/v52-report-tabs-source-grep.test.js` (52 tests, G1-G4) — per-tab regression locks
- `tests/v52-report-tabs-branch-scope-flow-simulate.test.js` (62 tests, F1-F7) — Rule I full-flow simulate using actual BranchProvider + canonical pattern
- `tests/audit-branch-scope.test.js` extended (+11 BS-11.x sub-tests)

**Final tally**: 7333 → 7543 + 1 skipped (+211 net) all GREEN. Build clean 2.27s.

**Outstanding**: `vercel --prod` (user-authorized only — say "deploy" THIS turn).

Detail: `docs/superpowers/specs/2026-05-08-report-tabs-branch-scope-design.md` + `docs/superpowers/plans/2026-05-08-report-tabs-branch-scope.md` + V52 V-entry in `.claude/rules/v-log-archive.md`.

### Session 2026-05-08 EOD #5 — V50 ProClinic strip COMPLETE

User directives: "Clean firestore.rules + Delete dead orphan master_data/*" → "แค่ครั้งนี้อนุญาตให้ deploy ได้เลย เมื่อถึงเวลา" → "Optional follow-up: delete remaining dead migrators (migrate*ToBe family + mapMasterTo* mappers + phase9Mappers.js)".

**V50-followup** (commit `f9c7b7d`):
- firestore.rules cleaned (5 legacy match blocks removed): pc_* × 10 + master_data + proclinic_session/{docId} + broker_jobs/{jobId} + clinic_settings/proclinic_session*
- backendClient.js — deleted master_data CRUD/read/sync helpers (createMasterCourse/Item, update*, delete*, getMasterDataMeta, getAllMasterDataItems, clearMasterDataItems, BE_BACKED_MASTER_TYPES, readBeForMasterType, getBeBackedMasterTypes, runMasterDataSync, masterDataDoc)
- scopedDataLayer.js — removed 4 dead re-exports (getMasterDataMeta + getBeBackedMasterTypes + deleteMasterCourse + deleteMasterItem)
- AV28.4 sanctioned exception NARROWED to backendClient.js only
- Tests: deleted phase12-11-be-shape-adapters; updated 9 test files (mock fixture cleanup + source-grep anchor migration)
- 4 pre-existing failures surfaced + fixed via Rule P 7-step

**V50-followup-2** (commit `ef580a6`):
- Deleted ~2,200 LOC of dead migrators + mappers from backendClient.js: 19 migrate*ToBe functions + 16 mapMasterTo* mappers + runMasterToBeMigration helper + masterDataItemsCol + IMPORT_TARGET_BRANCH_ID const
- Deleted src/lib/phase9Mappers.js + 4 dead-code test files (courseMigrate / migrate-master-staff-schedules / phase9-migration-mappers / schedule-synced-data-wiring)
- Stripped sub-tests from 3 shared test files (CSS.C / S1.2-S10.2 / F17.2-F17.14)
- AV28 sanctioned exception now EMPTY — ZERO master_data runtime references anywhere

**Combined deploy**:
- vercel --prod + firebase deploy --only firestore:rules in parallel
- Both completed cleanly; aliased + rules version 29 released
- Probe-Deploy-Probe per Rule B: 3 pre-probes 200/200/200; 4 post-probes 200/403/403/403 (matching expectations)
- Rule B probe list updated in 01-iron-clad.md to remove deleted endpoints

Detail: this entry + commit messages on `f9c7b7d` and `ef580a6`.

### Session 2026-05-08 EOD #4 FINAL — All shipped + deployed

Continuation of EOD #4 — user authorized items 1+3+4+5 (migration → Phase 3 → user-level skills → TFP failures) + final deploy. All complete.

**Migration `--apply`**: 3/3 branches migrated (นครราชสีมา + พระราม 3 + ทดลอง 1); 21 fields cleared from `clinic_settings/main`; idempotency confirmed; audit doc emitted.

**Plan #2 Phase 3 cleanup** (`72bc885`): `mergeBranchIntoClinic` flat-fallback removed (2-arg cascade `settings.X || cs.X`); `emptyBranchForm` top-level migrated fields removed; BranchFormModal UI bound to `form.settings.X` + dual-write removed; S11 regression group (5 tests) locks the cleanup state. 54/54 tests + 34/34 audits GREEN.

**Plan #1 user-level Tasks 3+4+8**: `~/.claude/skills/systematic-debugging/SKILL.md` Δ1-Δ5 + `~/.claude/skills/verification-before-completion/SKILL.md` Δ1-Δ8 + `MEMORY.md` Rule P pointer + new `feedback_class_of_bug_expansion.md`.

**5 pre-existing TFP failures fixed** (`7ce9b7a`) via Rule P 7-step (eat-our-own-dogfood post-Spec #1 ship): T6.1 sanctioned annotation on TFP first line; S3.1-S3.4 updated to lock post-V49 mapper-delegation pattern + S3.4 anti-regression for V44/AV22 canonical-mapper-bypass class. Cross-file grep confirmed isolated case.

**Deploy** (`2318557`): vercel.json had stale `api/proclinic/*.js` functions config (V50 deleted that dir). Build failure → 1-line fix → redeployed clean. Production live at `lover-clinic-app.vercel.app`.

Detail: `.agents/sessions/2026-05-08-rule-p-and-per-branch-settings-shipped.md`

### Session 2026-05-08 EOD #4 — Rule P + Per-branch Settings Phase 1+2 SHIPPED

User invoked `/brainstorming` to address 2 pending asks from EOD #3. Both went through full Q&A → spec → writing-plans → subagent-driven execution → merge to master in one rollout.

**Spec #1 — Rule P (Class-of-bug expansion)** — IN-REPO COMPLETE:
- 5 commits + merge: `47a7315` Rule P body in 01-iron-clad.md → `a80ca65` compact entries → `03fea77` NEW /audit-class-of-bug-discipline skill → `67efc98` 18-test bank → `98e2f34` register in /audit-all Tier 5
- 7-step expansion discipline: diagnose → classify → cross-file grep → fix all → regression test → AVxx invariant → escalate iron-clad when architectural
- Tier 2 default artifacts (regression test + AVxx + classifier doc); Tier 3 (V-entry + iron-clad rule) for architectural
- Trigger: broad (test red / user-report / claude-noticed / audit-red); discrimination: strict (every red triggers)

**Spec #2 — Per-branch Settings Migration** — PHASES 1+2 SHIPPED:
- Phase 1 (`a2618b5`): Extended `mergeBranchIntoClinic` with 13-field 3-source cascade (settings.X > flat branch.X > cs.X). Swept 7 actual consumers (spec projected 17 — most pass-through). BS-10 invariant + AV29 invariant + 49-test bank.
- Phase 2 (`8c112d2`): Shared TimeSelect24 (Rule of 3). BranchFormModal 4 new sections. ClinicSettingsPanel 7-section deletion (610→324 LOC). branchValidation extension. NEW `scripts/v51-migrate-clinic-settings-to-branch.mjs` (Rule M canonical).

**Process notes**:
- Used `superpowers:brainstorming` (Q1-Q4 for each spec) → `writing-plans` (both plans authored) → `using-git-worktrees` (.worktrees/rule-p-and-per-branch-settings) → `subagent-driven-development` (3 implementer dispatches across batches) → merge to master with `--no-ff` to preserve history visibility
- Worktree cleaned up post-merge; feature branch deleted

**Outstanding**:
- 🚨 Migration `--apply` (Rule M canonical workflow; runs LOCALLY from F:/LoverClinic-app; not deploy-coupled)
- 🚨 V49+V50+specs+plans+Rule P+per-branch settings = 18 commits → combined `vercel --prod` (V18 explicit "deploy")
- Plan #2 Phase 3 cleanup (post-migration; 1-line change)
- Plan #1 Tasks 3+4+8 (user-level files outside repo)
- 5 pre-existing TFP failures (separate task)

Detail: `.agents/active.md` + design specs in `docs/superpowers/specs/` + plans in `docs/superpowers/plans/`

### Session 2026-05-08 EOD #3 — V50 ProClinic strip COMPLETE (Phase 3-7 shipped)

User said "phase 5 - phase 7 ไปเลยยย จะได้จบๆ" → completed all remaining V50 phases in one push.

**Phase 3** (commit `1c67baf` from EOD #3 start): cross-branch booking contract verified — existing `be_customers.branchId` already serves the creation-branch role (stamped on CREATE only, immutable thereafter). User chose Option A (skip schema, verify only) → 46 vitest + 30 e2e on real prod (3 branches × matrix; customer.branchId IMMUTABLE across 5 dotted-path edits × 3 customers; appt+deposit.branchId always from admin context).

**Phase 4** (commit `59f7aa8`): kiosk → OPD-save auto-link cascade PROF-GRADE bank — 64 vitest (12 categories F1-F12: source-grep + simulator + property-based mulberry32×100 + cross-branch identity + adversarial Thai/Unicode/NUL/10K-char + idempotency + forward-compat + class-of-bug classifier + lifecycle + branch-switch chaos + V50 markers) + 53 live e2e on real prod (10 chaos scenarios A-J: no-deposit grid visibility / kiosk-delete cascade / OPD-save auto-link / deposit-pair both halves / 3-branch matrix / delete appt mid-flow / delete deposit mid-flow / duplicate name+phone / idempotency / branch-switch sharp-edge documented). 37 TEST-V50P4- fixtures + cleanup zero orphans + audit doc.

**Phase 5**: full vitest 7235/7240 PASS (5 pre-existing TFP failures NOT V50-caused) + build clean.

**Phase 6** (`scripts/v50-phase6-cleanup-proclinic-residue.mjs --apply`): Rule M two-phase cleanup of ProClinic residue on real prod — **2,599 docs DELETED**:
- pc_* mirror (10 collections): 2,097 docs (pc_treatments=1132, pc_customers=450, pc_courses=244, pc_treatment_history=247, pc_appointments=14, pc_chart_templates=3, pc_form_options=2, pc_inventory=2, pc_doctors=1, pc_customer_appointments=2)
- master_data/* (12 type subcollections + 11 parent docs): 502 docs (courses=174, products=303, staff=2, doctors=2, permission_groups=4, df_staff_rates=2, promotions=2, plus parent docs for courses/products/staff/doctors/product_groups/product_units/permission_groups/medicine_labels/staff_schedules/df_staff_rates/promotions)
- clinic_settings/proclinic_session{,_trial}: 2 docs
- broker_jobs/*: 0 (already empty)
- Audit: `be_admin_audit/v50-phase6-cleanup-proclinic-residue-1778182611077-a2452825`

**Phase 7** (final commit, end of session):
- AV28 audit invariant added to `audit-anti-vibe-code` SKILL.md (no broker.* / cloneOrchestrator / /api/proclinic/* / runtime pc_*/master_data/broker_jobs reads in src/)
- 26 regression tests in `tests/v50-av28-no-proclinic-imports.test.js` (AV28.1 forbidden imports, AV28.2 forbidden URLs, AV28.3 forbidden namespace calls, AV28.4 forbidden Firestore paths with sanctioned exceptions for orphan exports, AV28.5 deleted file existence check, AV28.6 V50 marker preservation)
- V50 V-entry locked in `.claude/rules/00-session-start.md` § 2 above V49
- SESSION_HANDOFF.md + `.agents/active.md` updated to reflect H-bis EXECUTED state

**Iron-clad Rule H-bis flipped**: "IN PROGRESS" → **EXECUTED**. ProClinic dev-only scaffolding fully removed.

**Final state**: master = POST-V50.Phase 7 · prod = c92f924 (7 commits behind). 7261/7266 vitest + build clean. Ready for combined `vercel --prod` when user authorizes.

Detail: `.agents/sessions/2026-05-08-v50-proclinic-strip.md` (Phase 1-2) + this current-state entry (Phase 3-7).

### Session 2026-05-08 EOD #2 — V50 ProClinic strip Phase 1+2 SHIPPED

User authorized H-bis pre-launch strip per "หลอมรวม Frontend สาขาไหน + Backend สาขานั้น + universal stays universal + ลบ proclinic ออกอย่างสมบูรณ์".

**4 commits**: Phase 1 (`121507b`) runtime broker.* migration (5 frontend files) + Phase 2.1 (`91b044c`) ClinicSettingsPanel 3 sections strip + Phase 2.2 (`b1ecf59`) infrastructure DELETED (-10,318 LOC: brokerClient + cloneOrchestrator + customerBranchBaselineClient + CloneTab + MasterDataTab + api/proclinic/** + cookie-relay/**) + Phase 2.3 (`98e5105`) test cleanup (-1,168 LOC: 3 files updated as V50 anti-regression + 6 obsolete tests deleted).

**Behavior preserved**: AdminDashboard + BackendDashboard unified on be_* (no proclinic mode). Auto-link flows (`attachCustomerToOpdSessionLinks`, `provisionOpdLinkForBookingPair`, `handleOpdClick`) + cascade-delete (`deleteCustomerCascade`, `handleDepositSync`) + move-appointment + BSA branch isolation untouched (all be_*-based).

**Outstanding**:
- 🚨 V49+V50.Phase1-2 `vercel --prod` (V18)
- V50 Phase 3-7 (next session): be_customers.creationBranchId + cross-branch e2e + Rule M data ops (delete master_data/* + broker_jobs/* + pc_* + clinic_settings/proclinic_session*) + V-entry + AV28 + H-bis EXECUTED + final commit

Detail: `.agents/sessions/2026-05-08-v50-proclinic-strip.md`

### Session 2026-05-08 mid-day — V49 picker dropdown empty rows fix

User-reported on PromotionFormModal "ค้นหาคอร์ส / ค้นหาสินค้า" dropdowns showing empty rows with `+` icon and `0 ฿`.

**Root cause**: Phase 14.10-tris (2026-04-26) switched 8 UI pickers from `master_data/*` (legacy `{name, price, category, products[], unit}` shape) to `be_courses` / `be_products` / `be_promotions` (canonical `{courseName, salePrice, courseCategory, courseProducts, productName, mainUnitName, categoryName, promotion_name, sale_price, category_name}` shape) WITHOUT updating field-name reads. Legacy fields ALL undefined on prod (verified via `scripts/v49-diag-be-courses-products-shape.mjs`).

**Architectural fix** (single commit, 11 files):
1. Exported `beProductToMasterShape` + `bePromotionToMasterShape` from `backendClient.js` (were private — V36 lesson)
2. NEW `listCoursesForPicker` / `listProductsForPicker` / `listPromotionsForPicker` in `scopedDataLayer.js`
3. Migrated 8 victim sites (PromotionFormModal · DfGroupFormModal · QuotationFormModal · ExchangeCourseModal · CustomerDetailView ProductExchangeModal · MovementLogPanel · StockSeedPanel · VendorSalesTab)
4. AV27 audit invariant + V49 V-entry + iron-clad rule cross-link

**Verification**:
- Build clean
- V49 unit tests 37/37 PASS (12 categories — source-grep + helper unit + property-based mulberry32×100 + cross-branch toString.grep + adversarial Thai/Unicode/NUL/10K + idempotency + forward-compat + class-of-bug universal classifier)
- Live admin-SDK e2e 95/95 PASS (5 phases — canonical-shape-real, adapter-output-real, cross-branch-identity, write-fixtures-and-verify across 3 simulated branches, audit-doc emit + cleanup zero orphans)
- preview_eval against running dev server: real prod returned 349 courses + 607 products + 4 promos all with adapter-applied legacy shape (Stapple no 22 + Testoviron + PRP fixtures verified)
- Adjacent regression 44/44 PASS (marketing tabs + quotation + DF group + vendor sales)
- Full suite 7302/7312 PASS (10 fail → 5 fixed via mock update + 5 PRE-EXISTING TFP regressions confirmed pre-V49 via stash-test, NOT caused by V49)

**Outstanding**:
- 🚨 V42-V49 `vercel --prod` (V18 — explicit "deploy" THIS turn)
- TFP audit-branch-scope annotation + phase-17-2-septies block-regex fix (5 pre-existing failures — separate task)
- H-bis ProClinic full strip + hard-gate Firebase claim + /audit-all (deferred)

Detail: `.agents/active.md` + `.claude/rules/00-session-start.md` § 2 V49 entry

### Session 2026-05-08 EOD — V42-V48 class-of-bug 7-round saga ARCHITECTURALLY CLOSED

User-driven 7-round mega-session resolving the entire skip-stock-deduction + display-layer-multi-reader-sweep + canonical-mapper class-of-bug. Each round triggered by user repro of remaining symptom; Phase 4.5 architectural review unlocked V46 + V48 universal Rule O extension.

**V-entries shipped**:
- V42 promo bundle qty multiplier (4 writer sites)
- V43 skipStockDeduction overlay + direct-product flag + Rule M migration (3 entries on LC-26000006)
- V44 course-buy product-name source fix (TFP canonical mapper adoption)
- V45 dedup-shadow OR-merge at beCourseToMasterShape (14 affected courses)
- V46 Rule O — productName live-resolve at movement write (3 _deductOneItem sites + 2 poisoned batches migrated)
- V47 CustomerDetailView course grouping (NEW class: display-layer multi-reader-sweep)
- V48 Rule O UNIVERSAL extension to ALL stock writers (7+ sites) + 59-test prof-grade bank covering 10 categories

**Cumulative**: 366/366 V34-V48 unit + 698 e2e verification points + AV20-AV26 invariant set complete.

**Outstanding**:
- 🚨 V42-V48 `vercel --prod` (V18 — explicit "deploy" THIS turn)
- H-bis ProClinic full strip + hard-gate Firebase claim + /audit-all (deferred)

Detail: `.agents/sessions/2026-05-08-v42-to-v48-class-of-bug-saga.md`

### Session 2026-05-07 EOD — V40 trial-fresh + V41 marketing + V42 promo-qty fix

User-driven mega session: 4 sub-projects across one continuous chat.

1. **V40 trial-fresh นครราชสีมา** (`0420921`): backup → trial Make-Fresh → bit-perfect verify → real Make-Fresh. 3,233 docs wiped, 3 backups in Storage as insurance.
2. **V41 cross-branch-import test** for 6 master-data tabs: products + courses verified on real prod (3+3 imported, edit/delete/cleanup, all V39 invariants pass).
3. **Phase 17.1 marketing extension** (`366726c` → `b37edd3` → `c92f924` → `d965eb1`): 3 new adapters (promotions/coupons/vouchers) + UI buttons in 3 marketing tabs + 222 tests + 2 follow-up fixes (LISTER map + FK_C2E map missed `be_courses`). Deployed.
4. **V42 promo bundle qty multiplier** (`bf78779`): 4 writer sites (TFP×3 + SaleTab) dropped `sub.qty` (course-instance multiplier inside promotion bundle). User reproduced live: 6×PRP+2×AHL config → customer got 1× of each. Helper extracted (`computePromotionProductQty` + `buildPromotionSubCourseProducts`). 46 new tests + Rule M migration applied (6 entries fixed at LC-26000006). **NOT YET DEPLOYED.**

**Commits this session**: `0420921` (V40 trial), `366726c` + `b37edd3` + `c92f924` + `d965eb1` (Phase 17.1), `bf78779` (V42).

**Outstanding**:
- 🚨 **V42 needs `vercel --prod`** (V18 — auth never rolls over, user must say "deploy" again)
- 🚨 **NEW bug at session-end** (NOT investigated): "ไม่ตัดสต็อค" flag on course/promotion items ignored at treatment-deduct time → stock still decrements all 3 products despite checkbox checked. Image showed -1/-3/-1 with note "สต็อคติดลบ — ตัดเกินคงเหลืออีก N ครั้ง". Needs investigation per branch + product. V36 has related context.
- H-bis ProClinic full strip + hard-gate Firebase claim + /audit-all (deferred)

Detail: `.agents/sessions/2026-05-07-v42-promo-qty-multiplier.md`

### Session 2026-05-08 EOD — V40-prod-fix-1 thru fix-5 (enterprise-grade backup/restore)

User-driven session debugging V40 bugs after V41 ship. Iterated 5 prod-fixes through systematic-debugging skill. Each fix validated on real prod via diagnostic scripts. Final state: 100% byte-perfect round-trip on every existing branch (นครราชสีมา 3,233 docs · พระราม 3 488 docs · ทดลอง 1) + simulated future branch.

**Bugs fixed (in order)**:
1. `EXPORT_FAILED` — bucket() no-arg throws on Vercel reused-app (fix: explicit `bucket(BUCKET)`)
2. Spinner hangs — Vercel default maxDuration kills function mid-T4 (fix: parallel-batched T4 50/batch + maxDuration:60, 30.9× speedup)
3. No Restore UI — backup file unusable from UI (fix: full RestoreSection + `/api/admin/branch-backups` endpoint)
4. "0.00 MB" + Download opens inline (fix: smart size formatter + responseDisposition:attachment + filename)
5. Round-trip not 100% on นครราชสีมา (fix: schemaVersion=2 sentinel encoding for NaN/Infinity, was lossy → null in v1; back-compat preserved)

**Commits this session** (10): `9bbac5a` fix-1 · `5fc1c9b` fix-2 · `4b7623c` fix-3 · `0f29f53` fix-4 · `32be637` paranoid diag · `6b10c37` fix-5 schemaVersion=2 · `0108dd7` verifier reviver-aware · plus V41 ship commits earlier.

**Verification on real prod** (8 diagnostic scripts):
- Single-branch round-trip on ทดลอง 1 ✅
- Edge-case stress (Thai+emoji+special chars+nested+null+precision) ✅
- Multi-branch matrix: 3/3 existing + simulated future = 4/4 ✅
- Content-Disposition + filename verified ✅
- NaN/Infinity scanner: 1 NaN found in be_medical_instruments/2.costPrice — preserved via fix-5 sentinel encoding (no data mutation needed)

**Outstanding**:
- 🚨 H-bis ProClinic full strip (deferred from prior sessions)
- Hard-gate Firebase custom claim (deferred)
- /audit-all pre-release pass

Detail: `.agents/sessions/2026-05-08-v40-prod-fixes-1-thru-5.md`

### Session 2026-05-07 EOD continuation — V38 + V39 + V38-followup + e2e + V40 spec (5 commits)

User-driven 5-commit single-day continuation. (a) "ลบ products + courses พระราม 3 ไม่ได้" → V38 spread-order V12 fix (2 listers + Rule M backfill of 5+2 + AV17). (b) "นำเข้า products/courses/promotions เข้าพระราม 3 ไม่ได้" → V39 4 wrappers + 4 mappers + V38 source-patch (cross-branch-import 7 adapters with `canonicalIdField` + endpoint generic stamp) + Rule M backfill of 479 zombies + AV18 + 70 button-coverage tests. (c) User asked V38-followup mass-sweep → 85+ spread-order swaps across 17 files (AV17 complete). (d) User asked "เทส e2e จริงๆ ทุกปุ่ม" → 19 buttons × 30 fixtures × 122/122 assertions on real prod Firestore + cleanup. (e) User asked "ระบบ Backup สาขา + ปุ่ม สาขาใหม่" → brainstorming Q1-Q6 locked → V40 design spec (374 lines) committed → implementation plan written to `C:\Users\oomzp\.claude\plans\sprightly-jumping-waterfall.md`.

**Commits this continuation**:
- `4f008a3` V38 — list spread-order V12 fix (listProducts + listCourses)
- `d964b14` V39 — migrate-button branchId stamping + V38 source-patch + 70 contract tests + AV18
- `ee40256` V38-followup — mass-sweep 85+ spread-order swaps across 17 files (AV17 complete)
- `b33f369` E2E — 19 migrate buttons × 30 fixtures × 122/122 assertions (real prod Firestore)
- `496a15c` V40 spec — branch backup/restore/make-fresh design doc (374 lines, 6 Q&A locked)

**Production data ops** (Rule M two-phase): 479 zombies stamped พระราม 3 (303 products + 174 courses + 2 promotions). Audit doc `be_admin_audit/phase-24-0-vicies-novies-decies-backfill-zombie-branchid-1778102599138-4d7618f4`. User deleted 5+2 V38 broken docs via post-fix delete (proof V38 fix worked end-to-end).

**Outstanding**:
- V40 implementation (~30 tasks, 7 phases) ready at `C:\Users\oomzp\.claude\plans\sprightly-jumping-waterfall.md`
- Deploy 5 commits to Vercel (master ahead of prod) — pending user "deploy"
- H-bis ProClinic strip + hard-gate Firebase claim + /audit-all (carried from prior sessions)

Detail: `.agents/sessions/2026-05-07-v38-v39-e2e-v40-spec.md`

### Session 2026-05-07 EOD — Phase 24.0-vicies-novies family (7 commits, 2 deploys, per-branch catalog isolation fix)

User-driven multi-cycle session: shipped vicies-novies → octies (skipping quinquies which was a discarded wipe-script). Mid-session pivot from no-deploy → "ยอมแล้ว ตอนนี้ deploy ไปทำใน vercel ก็ได้" → combined deploy ran. Then 3 more commits + final vercel-only deploy at end.

**Major themes**:
- **OPD-save auto-attach** (vicies-novies): customer-later deposit/appointment auto-link to new be_customer at "บันทึกลง OPD" via unique session-id (handleOpdClick post-save hook, attachCustomerToOpdSessionLinks helper, provisionOpdLinkForBookingPair helper, SendCustomerLinkModal UI)
- **handleDepositSync duplicate fix** (bis): kiosk DEPOSIT queue path was using createDeposit on first OPD save → duplicate doc; now checks linkedDepositId + uses updateDeposit + cascades to appointment
- **Master-data sync source switch** (ter→sexies): Trial → Production ProClinic; IMPORT_TARGET_BRANCH_ID flipped to พระราม 3 per user pivot
- **Local-only sync orchestrator** (quater): firebase-admin + custom-token + master.js handler invocation — diagnostic path when /api/* not reachable from vite dev
- **Per-branch catalog isolation FIX** (septies WRONG → octies CORRECT): wrong direction (allBranches:true) reverted; real fix = migrate mappers stamp branchId from selectedBranchId at migrate-time. 7 mappers + 7 wrappers + MasterDataTab handleMigrate plumbing.

**Bonus diagnostics**:
- Production ProClinic credential discovery: PROCLINIC_EMAIL was for a wrong/limited user (4/18 syncs OK); user updated env to Owner credentials
- Vercel CLI env-pull \\n escape bug discovered + fixed in sync orchestrator's env parser

**Deploys**:
1. Combined vercel + firestore:rules with 4-endpoint Probe-Deploy-Probe (all 200 ✓)
2. Vercel-only at end (rules diff = 0; idempotent)

Detail: `.agents/sessions/2026-05-07-phase-24-0-vicies-novies-octies-saga.md`

### Session 2026-05-06 EOD continuation 5 — Phase 24.0-undecies through vicies-octies (~12 commits) + Rule N

User-driven rapid iteration on kiosk จองมัดจำ + Finance.มัดจำ + appointment-grid flows. NEW iron-clad **Rule N** (targeted-test-only for small bugfixes; full-suite reserved for big changes / end-of-batch / pre-deploy).

**Phases shipped (12 commits, all `npm run build` clean + targeted tests green)**:
- 24.0-undecies (`1c84bc1`) — kiosk visitPurpose "อื่นๆ" detail input + Finance column wrap
- 24.0-duodecies (`feb31eb`) — OPD banner ดู/แก้ไขข้อมูลลูกค้า buttons + edit-mode deep-link
- 24.0-terdecies..octiesdecies (`dce5a20`) — customer-later flow + cascades + branch-grid race fix
- 24.0-noniesdecies (`5e5aba1`) — Finance "+ สร้างนัด" button + auto-create be_appointments
- 24.0-vicies (`91a3190`) — kiosk deposit-edit cascades + visitPurpose + name/phone propagation
- 24.0-vicies-bis (`2e68f4f`) — kiosk-cancel cascade + Rule N
- 24.0-vicies-ter (`39a4f22`) — deposit-card edit-appt link + archive cascade
- 24.0-vicies-quater (`be32427`) — paymentAmount wheel-scroll fix (2000→1999)
- 24.0-vicies-quinquies (`98aa6be`) — kiosk + appt-tab delete = HARD-delete pair
- 24.0-vicies-sexies (`8b61a2f`) — add-appt cascade error surfacing + listener-race defense
- 24.0-vicies-septies (`8dc907b`) — createDeposit().depositId extract + coerceId healing
- 24.0-vicies-octies (`f9aefb1`) — Finance "ไปที่นัด" button + AppointmentCalendarView initialSelectedDate

**NEW helpers in `src/lib/appointmentDepositBatch.js`**: `attachCustomerToLinkedDeposit`, `syncAppointmentToLinkedDeposit`, `syncCustomerTempToLinkedDeposit`, `createAppointmentForExistingDeposit`, `deleteDepositBookingPair`. **NEW `src/lib/visitPurposeUtils.js`**.

**Iron-clad Rule N added** to `.claude/rules/00-session-start.md` (codified rapid-iteration testing rhythm: small fix → targeted run only; big/end-of-batch → full suite).

Detail: `.agents/sessions/2026-05-06-phase-24-0-undecies-thru-vicies-octies.md`

### Session 2026-05-06 EOD continuation 4 — Phase 23.0 + Phase 24.0 customer-delete suite

**Phase 23.0** — kiosk modal channel dropdown (key-name mismatch fix) + 4 explicit branchId stamps on addCustomer + sparse-patient bug fix (V12 mirror — addCustomer expected canonical snake_case but received camelCase) + cache schema-version guard. NEW `kioskPatientToCanonical` helper at top of AdminDashboard wired at 3 call sites.

**Phase 24.0 customer-delete suite** (main + bis through decies, ~25 commits):
- Cascade delete 11 collections + audit doc + dual perm gate (`customer_delete` claim || isAdmin)
- 1-dropdown authorizer (collapsed from 3 via HTML optgroup); HN counter monotonic-no-reuse regression-locked
- Client-side Firestore path (no /api/admin fetch — works on `npm run dev` per local-only directive); server endpoint preserved for production deploy
- Graceful-skip 5 rule-locked collections (link_requests, customer_link_tokens, wallet_tx, point_tx, course_changes); audit doc records cascadeSkipped[]
- Force-refresh ID token + best-effort audit + identity-based dedup recovery (citizen_id/passport/phone match before re-create; tie-break to highest-confidence; ambiguous → admin disambiguates)
- kiosk Thai gender translation (ชาย/หญิง/LGBTQ+ → M/F/LGBTQ); customer_type='ลูกค้าทั่วไป' auto; emergencyRelation → contact_1_relation canonical
- หมายเหตุทั่วไป amber box on CustomerDetailView left column (visible to doctor)

5 NEW phase-24-0-* test files (83 tests) + extensive contract updates. Build clean. NO DEPLOY.

Detail: `.agents/sessions/2026-05-06-phase-23-24-trilogy.md`

### Session 2026-05-06 EOD continuation 3 — Phase 21.0 trilogy + Phase 22.0 trilogy (10 commits)

**Phase 21.0 family — appointment sub-tabs cleanup**:
- TDZ hotfix (86b1df7) — empty-grid + blank-screen ReferenceError fix
- 21.0-bis (4e6a9e4) — added "นัดหมายทุกประเภท" overview sub-tab at top
- 21.0-ter+quater (9590e57) — embedded deposit subform in modal + position-stable single-element refactor (fixes "empty grid until F5" sub-tab click bug)
- 21.0-quinquies+sexies (777c51d) — Finance.มัดจำ "มัดจำสำหรับ" column + calendar grid polish (hour borders, status accent, occupied-cell border skip)
- 21.0-septies (c9794e4) — purpose row size matches customer name (text-sm font-bold)

**Phase 22.0 trilogy — branch correctness sweep**:
- 22.0a (e16ed7b) — sync-status reset migration **LIVE-APPLIED on prod**: 768 docs status-flipped, 0 deletions. opd_sessions broker-* wiped + pc_*.syncedAt cleared. Forensic trail (*ResetMetadata) recoverable. Audit: `be_admin_audit/phase-22-0a-sync-status-reset-1778057983371-ceadb4fe`. User safety directive honored: "อย่าลบข้อมูลลูกค้าใน frontend แค่ให้หบุด sync".
- 22.0b (2cec108) — kiosk modals branch correctness: fetchDepositOptions filter doctors/staff per branch + populate broken assistants dropdown + confirmCreateDeposit atomic pair-write to be_deposits + be_appointments via createDepositBookingPair (kiosk จองมัดจำ now visible in Finance.มัดจำ + BackendDashboard sub-tab).
- 22.0c (d378cf5) — clinic_schedules.branchId stamp + list filter by selectedBranchId + schedule_prefs__{branchId} per-branch doc id + updateActiveSchedules per-schedule branchId query.

5 NEW test files (+~80 tests). Build clean. NO DEPLOY.

Detail: `.agents/sessions/2026-05-06-phase-21-22-trilogy.md`

### Session 2026-05-06 EOD (continuation 2) — Phase 21.0 Appointment Sub-Tabs + Deposit-Booking Pair Atomicity

User authorized full autonomous run: "approve และ approve review ด้วย แล้วทำให้จบ แล้วเทสตามที่บอกไปเลย จะออกไปข้างนอก ฝากด้วย แบบอยู่ในกฎเกนของเรา และใช้ได้จริงแบบที่หวัง ด้วยความสามารถสูงสุดของนาย".

Workflow: Skill(brainstorming) HARD-GATE (Rule J) → 2 design Qs locked (A=section-with-4-tabs, B=uniform-calendar) → spec doc (`82dbb84`) → 7 source impl → build clean → 8 NEW test files (111 tests, all PASS) → migration script (Rule M) `--apply` (0 docs to migrate, idempotent) → acceptance gate per-branch × per-type matrix (8/8 PASS, zero leakage) → commit (`fa366f2`) + push.

**Scope**:
- Nav: move นัดหมาย from PINNED to NAV section with 4 sub-tabs (จองไม่มัดจำ / จองมัดจำ / คิวรอทำหัตถการ / คิวติดตามอาการ)
- View: RENAME `AppointmentTab.jsx` → `AppointmentCalendarView.jsx` + `appointmentType` prop + typedDayAppts filter (defense-in-depth via `migrateLegacyAppointmentType`)
- Modal: AppointmentFormModal `lockedAppointmentType` prop. When set='deposit-booking': hides save button + redirects admin to Finance.มัดจำ (DepositPanel = sole writer, V12 single-writer lock)
- Pair atomicity: NEW `src/lib/appointmentDepositBatch.js` — writeBatch creates BOTH be_deposits + be_appointments docs atomically with cross-link fields (linkedAppointmentId / linkedDepositId). Closes pre-Phase-21.0 visibility gap (deposit-bookings NEVER appeared in any AppointmentTab grid before)
- DepositPanel: routes hasAppointment=true creates to pair helper; pair-cancel for linkedAppointmentId
- BackendDashboard: 4 new tab cases + `?tab=appointments` legacy URL redirect to `?tab=appointment-no-deposit`
- Permissions: 4 sub-tab gates (same set as legacy 'appointments'), firstAllowedTab default updated
- Migration (Rule M): NEW `phase-21-0-migrate-appointment-types-strict.mjs` two-phase. Result: 0 docs to migrate (Phase 19.0/20.0 already cleaned). Audit: `be_admin_audit/phase-21-0-strict-and-backfill-1778047714399-b09eefdc`
- Acceptance gate: NEW `phase-21-0-acceptance-gate.mjs` — admin-SDK matrix verification on real prod. 2 branches (นครราชสีมา + พระราม 3) × 4 types × 2 fixtures = 16 TEST-APPT-* docs (V33.13 prefix). Result: 8/8 PASS, zero leakage. 16 fixtures cleaned.

**Acceptance gate result** (per user verbatim "ทำแล้วเทสด้วยว่าแสดงจริง..."):
```
Branch                       | Type                | Pass
─────────────────────────────┼─────────────────────┼─────
นครราชสีมา (BR-1777873...)   | no-deposit-booking  |  ✓
นครราชสีมา (BR-1777873...)   | deposit-booking     |  ✓
นครราชสีมา (BR-1777873...)   | treatment-in        |  ✓
นครราชสีมา (BR-1777873...)   | follow-up           |  ✓
พระราม 3 (BR-1777885...)     | no-deposit-booking  |  ✓
พระราม 3 (BR-1777885...)     | deposit-booking     |  ✓
พระราม 3 (BR-1777885...)     | treatment-in        |  ✓
พระราม 3 (BR-1777885...)     | follow-up           |  ✓
Overall: ✓ PASS (8/8)
```

Detail: `.agents/sessions/2026-05-06-phase-21-0-appointment-sub-tabs.md`

### Session 2026-05-06 EOD — Final ProClinic UI strip + per-branch filter + hotfix

Continuation after Phase 5a/5b/5c stripped `broker.*` calls — user caught residual ProClinic UI ("นำเข้าจาก ProClinic" button + URL links + edit/delete handlers in OPD history). Final strip + per-branch filter on opd_sessions/chat_conversations/be_appointments + 467-doc hotfix migration to correct branchId. Plus credential leak via `git add -A` (force-push'd clean; user accepted no rotate).

**Strip scope**: handleProClinicEdit + handleProClinicDelete + 4 import handlers + 8 import state vars + entire 85-line import-from-ProClinic JSX section + 3 inline ProClinic URL `<a>` links + Cookie-Relay credentials auto-sync + UPDATE user-facing copy (4 strings).

**Migration**: 75 opd_sessions + 12 chat_conversations + 380 be_appointments stamped with branchId. Hotfix re-stamped 467 docs from stale default `BR-1777095572005-ae97f911` → correct นครราชสีมา `BR-1777873556815-26df6480`.

**Audit docs**:
- be_admin_audit/phase-20-0-migrate-opd-sessions-1778006150465-44cbbb18
- be_admin_audit/phase-20-0-migrate-chat-conversations-1778006214051-5f66c409
- be_admin_audit/phase-20-0-fix-branch-id-mismatch-1778006625867-f28b7f0b

**V37**: `git add -A` swept .env.local.prod → leak → force-push'd clean. User accepted no rotate. .gitignore now explicit. Lesson lock in `feedback_credential_leak_no_rotate.md`.

**Deferred**: BackendDashboard nav restructure (move นัดหมาย + 4 appointmentType sub-tabs + deposit→Finance.มัดจำ wiring) — next chat per user.

Detail: `.agents/sessions/2026-05-06-frontend-proclinic-strip-final-and-per-branch-filter.md`

### Session 2026-05-05 EOD — Phase 19.0 (appointment 15-min slots + 4-type taxonomy)

Marathon EOD continuation session. Spec → plan → 14 tasks subagent-driven → V15 #22 deploy → migration. ~16 commits across implementation + 2 polish commits + post-deploy script fix.

**Brainstorming locks**: Q1 = Option B Uniform (all legacy → 'no-deposit-booking'); Q3-Q9 covered slot interval / defaults / colors / business rules / DepositPanel writer / ProClinic translator.

**Source delivered** (Tasks 1-10):
- Task 1 (`ef4c003`): NEW `src/lib/appointmentTypes.js` SSOT — 4-type taxonomy, frozen, with resolvers + migrate helper
- Task 2 (`73fbf22`): canonical 15-min `TIME_SLOTS` (28 → 56 entries) in `staffScheduleValidation.js`; new `SLOT_INTERVAL_MIN_DISPLAY` export
- Task 3 (`1dcd55b`): NEW `api/proclinic/_lib/appointmentTypeProClinic.js` 4→2 translator (@dev-only H-bis)
- Task 4 (`a25b101` + flex-wrap polish): AppointmentFormModal — drop local TIME_SLOTS+APPT_TYPES; defaults `'10:15'`/`'no-deposit-booking'`; auto-bump endTime; flex-wrap on radio row
- Task 5 (`99711f8`): AppointmentTab — SLOT_H 36→18 (grid pixel-height preserved); canonical TIME_SLOTS
- Task 6 (`c5a97e5` + 2 polish commits): DepositPanel — canonical TIME_SLOTS; `'deposit-booking'` writer default; useState + resetForm both updated; APPOINTMENT_TYPES SSOT import
- Task 7 (`f4df1d7`): aggregator + report tab use SSOT resolver + APPOINTMENT_TYPES filter
- Task 8 (`010e42f`): AdminDashboard typeMap → `resolveAppointmentTypeLabel`; `appointmentDisplay.js` re-exports SSOT
- Task 9 (`74a3f76`): `api/proclinic/appointment.js` translator wired at 2 PATCH sites
- Task 10 (`b671ec1` + `fbc3215`): NEW migration script (Option B uniform; --dry-run/--apply; audit + forensic-trail; invocation guard + crypto-secure randHex)

**Test bank** (Task 11, `af0be21`, Rule K work-first-test-last batch): 9 new files, 69 new tests across A/T/F/D/G/C/M/F/P groups (incl. Rule I full-flow). Plus `b6b87a8` adjacent test polish for phase15.7-bis effectiveRoom shape (Phase 18.0 evolution).

**Verification** (Task 12-13): full suite 5463/5463 passing · build clean · audit greps all zero · live `preview_eval` confirmed runtime SSOT semantics (4 values + Thai labels + colors + resolvers + migrate + translator + 15-min canonical TIME_SLOTS).

**V15 #22 deploy**:
- Pre-probe 6/6 ✓ + Post-probe 6/6 ✓ (Rule B Probe-Deploy-Probe)
- vercel `lover-clinic-omo4w9c5z-...` aliased to `lover-clinic-app.vercel.app`
- firestore:rules idempotent re-publish (rules unchanged from V15 #20)
- Cleanup: pc_appointments DELETE 4/4 + clinic_settings strip 2/2

**Production migration**:
- `node scripts/phase-19-0-migrate-appointment-types.mjs --apply`
- 27/27 documents migrated in 1 batch
- Audit doc: `artifacts/loverclinic-opd-4c39b/public/data/be_admin_audit/phase-19-0-migrate-appointment-types-1777987427963-c3e11db0`
- Idempotency re-check: 0 docs to migrate ✓

**Bugs surfaced + fixed during deploy**:
1. Migration script PEM-parse failure — env loader's `\n` literal not converted; fixed via split('\\n').join('\n')
2. Migration script wrong path — bare `be_appointments` collection vs production's `artifacts/{APP_ID}/public/data/be_appointments`; fixed via BASE_PATH constant
3. Rule B probe URLs were ALSO missing the artifacts prefix — pre-probe initially showed 5/6 incorrect 403s before I corrected the URL convention. The 403s were artifacts of wrong probe URLs, NOT live rule drift.

**Open follow-up**: Update `.claude/rules/01-iron-clad.md` Rule B documentation to clarify the `artifacts/{APP_ID}/public/data/` prefix on all probe URLs. The simplified path notation in the current docs is misleading and triggered a 30-minute false-alarm during deploy.

Detail: `.agents/active.md` (frozen for next-session boot)

### Session 2026-05-05 EOD — Phase 17.2 quinquies/sexies/septies/octies + Phase 18.0 Branch Exam Rooms

Marathon EOD session. Shipped 18 commits + 2 deploys + migration --apply + wiki backfill.

**Phase 17.2 fix series** (cross-branch correctness — V12 shape-drift recurrences):
- 17.2-quinquies (`c76e953`) — TFP cache leak: extend BS-9 to buyItems/buyCategories + drop length>0 short-circuits + SELECTED_BRANCH_ID in form-data deps
- 17.2-sexies (`73771d9`) — internal-leak audit: `_resolveProductIdByName(name, branchId)` + `findProductGroupByName(opts)` + `saveBankAccount` mutex scoped + cross-tier annotations
- 17.2-septies (`9046dcf`) — TFP reader field-name fix (productType/productName/categoryName/mainUnitName/courseName/salePrice fallback) + branch indicator banner
- 17.2-octies (`c248c67`) — isCourseUsableInTreatment GROUPED + FLAT shape; asdas dasd's 3 IV Drip courses now visible

**Phase 18.0 Branch Exam Rooms** (`c08fc14`→`c5609c9`, 11 tasks): NEW be_exam_rooms collection + ExamRoomsTab + ExamRoomFormModal + appointmentRoomColumns helper + AppointmentFormModal/Tab/DepositPanel integration + migration script + 89 new tests. firestore.rules v26 adds match block.

**Deploys**: V15 #19 shipped Phase 17.2 fixes + Phase 18.0 (`e5f2171`). V15 #20 shipped follow-up `bdd917e` (legacy localStorage cache drop + master-rooms-only column derivation). Both clean: 6/6 pre + 6/6 post + 4/4 cleanup. Migration `--apply` seeded นครราชสีมา with 3 rooms (audit `phase-18-0-seed-exam-rooms-1777978075511-...`).

**V15 #21 pending**: `882fb35` drops "ไม่มีนัดหมายวันนี้" empty-state — always render grid for click-create on empty days/branches.

**Wiki backfill** (`a89fc6a`): 6 NEW pages — be_exam_rooms / exam-rooms-tab / appointmentRoomColumns entities + branch-exam-rooms / runtime-fallback-orphan-room / v12-shape-drift concepts. TFP entity extended with Phase 17.2 fix series section.

Detail: `.agents/sessions/2026-05-05-phase-18-0-and-phase-17-2-fix-series.md`

### Session 2026-05-05 EOD — Phase 17 trilogy (BS-9 / cross-branch import / branch equality) + 2 hotfixes

Marathon session: shipped 5 commits (4 features + 1 hotfix-pair) over the course of the day. Phase 17.0 (5799bd5, V15 #17): BSA leak sweep 3 closed Promotion/Coupon/Voucher branch-refresh + TFP modal phantom data + locked BS-9 invariant in 3 places (audit skill + memory + Rule L). 17-page wiki backfill cycle bundled. Phase 17.1 (ff78426, V15 #18): admin-only "Copy from another branch" feature on 7 master-data tabs — shared modal + 7 per-entity adapters + atomic firebase-admin server endpoint + 167 tests. Phase 17.2 (24aa9e9, V15 #18): branch equality directive ("ทุกสาขาเป็นสาขาเหมือนกัน") — admin SDK migration script + per-user uid localStorage + newest-default + single-branch-no-picker + isDefault stripped + includeLegacyMain removed + BranchProvider hoisted to App.jsx. Migration `--apply` ran on prod (3 writes, idempotent).

Post-deploy regression: user reported TFP buttons + AppointmentTab TodaysDoctorsPanel showed cross-branch data after switching to a branch with no data. Root cause: `branchSelection.js resolveSelectedBranchId()` read the LEGACY unkeyed localStorage key, but Phase 17.2 BranchContext writes to per-user keyed `selectedBranchId:${uid}`. After first-mount migration, resolver returned null → scopedDataLayer auto-inject passed null → raw lister `useFilter = branchId && !allBranches` evaluated false → cross-branch read.

**Phase 17.2-bis** (0361268): resolver reads `auth.currentUser.uid` synchronously + per-user key first; `_autoInject`/`_autoInjectPositional` helpers in scopedDataLayer return `[]` when no branch resolved (28 wrappers migrated).
**Phase 17.2-ter** (281c871): `getActiveSchedulesForDate` + `listenToScheduleByDay` accept branchId positional arg + apply where-clause; AppointmentTab passes selectedBranchId + adds to deps.

V15 #19 pending — bundles 17.2-bis + 17.2-ter. Awaits explicit "deploy" THIS turn.

Wiki-first methodology validated: caught a real spec bug (TFP duplicate import / SELECTED_BRANCH_ID name) in Phase 17.0 review pre-implementation.

Detail: `.agents/sessions/2026-05-05-phase-17-trilogy-and-leak-fixes.md`

### Session 2026-05-04 EOD — Phase BS shipped + Phase BS V2 master-data branch-scoped

V15 #15 deploy (LIVE) shipped Phase BS — top-right BranchSelector with per-staff branchIds[] soft-gate; customer doc gains immutable branchId tag; 5 picker filters; 5 reader refactors with allBranches opt-out; /api/admin/customer-branch-baseline migration endpoint; +132 tests; build clean; full Probe-Deploy-Probe 6/6+6/6+cleanup 4/4.

Mid-session 2 user-reported regressions on prod: (1) sales/treatments/appointments empty after Phase BS (legacy untagged data filtered out by branchId where-clause) — fixed via direct admin-SDK migration of 2103 untagged docs to นครราชสีมา (LIVE NOW); (2) stock page showed raw `BR-1777873556815-26df6480` not "นครราชสีมา" — fixed via listStockLocations now pulling be_branches (`da57c08`); (3) appointment tab branch switch had no effect on day grid — listener `listenToAppointmentsByDate` not refactored in Phase BS V1 — fixed (`aecf3a1`).

Phase BS V2 (`cf897f6`): user clarified scope — every tab in ข้อมูลพื้นฐาน must respect BranchSelector EXCEPT พนักงาน/สิทธิ์/เทมเพลต/แพทย์/สาขา/ตั้งค่าระบบ/Sync ProClinic. 11 listers refactored (productGroups/units/medicalInstruments/holidays/products/courses/dfGroups/dfStaffRates/bankAccounts/expenseCategories/staffSchedules); 8 writers stamp branchId via NEW `_resolveBranchIdForWrite` helper; 9 UI tabs wired; /api/admin/link-requests handleList accepts {branchId, allBranches} with legacy-untagged fallback. 730 master-data docs migrated to นครราชสีมา via admin SDK. preview_eval verified all 11 listers branch-scope correctly.

V15 #16 deploy pending (3 commits ahead-of-prod). LineSettingsTab per-branch redesign deferred (needs schema redesign for single global config doc).

Detail: `.agents/sessions/2026-05-04-phase-bs-v2.md`

### Session 2026-05-05 EOD — V15 #14 deploy + H-bis ProClinic strip explored + fully reverted

User authorized V15 #14 to ship `1d15db5` AP1-bis multi-slot. Mid-session pivot to "H-bis backend ProClinic strip — backend ใช้ database เราทั้งหมด" with big-bang rollout. Planned + approved + executed Phase A-F-lite (52-test bank, +source edits across ClinicSettingsPanel / ChartCanvas / ChartTemplateSelector / TreatmentTimeline / TreatmentFormPage / AdminDashboard / BackendDashboard / firestore.rules + cookie-relay/ delete) → user halted "เอาทุกอย่างที่มึงเปลี่ยนใน frontend กุคืนมาให้หมด" → full revert via `git checkout HEAD -- ...` + cookie-relay/ restored. **Zero commits made.**

Then V15 #14 deploy (independent of strip work) shipped clean: pre-probe 6/6 ✓, vercel + firebase rules in parallel ✓ (build 3.12s, rules idempotent re-publish), post-probe 6/6 ✓, cleanup 4/4 ✓, HTTP smoke / 200 + /admin 200 + line webhook 401-LINE-sig.

Branch-selector brainstorm queued for next session (queued via `/brainstorm` × 2 — needs `Skill(superpowers:brainstorming)` invocation per Rule J).

**V15 #14 deploy** (2026-05-05) — vercel ships AP1-bis logic; rules unchanged from V15 #13 (idempotent). 6/6 + 6/6 probes ✓.

Detail: `.agents/sessions/2026-05-05-v15-14-and-hbis-revert.md`

### Session 2026-05-04 EOD — audit-fix sweep + AP1 V15 #11/#12/#13 + AP1-bis V15 #14 pending

Resumed Phase 16.1 plan (V15 #11 deploy LIVE earlier) → MEDIUM/LOW audit-fix sweep (TF2 scrollToError 8 anchors / R-FK FK validator / a11y P1/P3 sweep / AP1 lightweight verify) → ProfileDropdown (top-right avatar logout-only menu) → PDPA strip per user verbatim directive → AP1 schema-based atomic slot reservation (V15 #13 with `be_appointment_slots` collection) → TF3 TFP full a11y sweep → AP1-bis multi-slot 15-min interval array (closes range-overlap that exact-key missed).

**Code commits**:
- `f88f23e` audit-fix bundle — TF2 scrollToError 8 data-field anchors + AP1 lightweight post-write verify w/ rollback + R-FK `_assertBeRefExists` + a11y P1/P3 (CustomerCreatePage + SaleTab) + ProfileDropdown + PDPA strip
- `c0d9dc4` AP1 schema atomic — `be_appointment_slots` collection + `runTransaction(tx.get + tx.set)` exact-key guard + TF3 TFP full a11y sweep (fieldErrors state + ariaErrProps + FieldError + 23 Thai aria-labels)
- `1d15db5` AP1-bis multi-slot — `buildAppointmentSlotKeys()` returns array of `${date}_${doctorId}_${HH:MM}` keys (floor start, ceil end, 15-min interval); createBackendAppointment uses Promise.all tx.get + iterate tx.set; _releaseAppointmentSlot + updateBackendAppointment use writeBatch over arrays; +28 tests (A5 helper 18 + A6 source-grep 9 + A2 updates 1)

**V15 #11 deploy** (2026-04-30) — Phase 16.1 + `be_audiences` rule (firestore.rules v21 → v22). 6/6 + 6/6 probes ✓.
**V15 #12 deploy** (2026-05-04) — audit-fix bundle (no rules change). 6/6 + 6/6 probes ✓.
**V15 #13 deploy** (2026-05-04) — AP1 schema + `be_appointment_slots` rule (v23 → v24). 6/6 + 6/6 probes ✓ + anon write to slots returns 403 (rule confirmed live).

**Pending**: V15 #14 deploy auth for `1d15db5` AP1-bis (source-only — `be_appointment_slots` rule already live).

Detail: `.agents/sessions/2026-05-04-ap1-bis-multi-slot.md`

### Session 2026-04-30 EOD — Phase 16.1 Smart Audience plan locked (after V15 #10 deploy)

After V15 #10 deploy + Phase 16.4 ship, brainstormed Phase 16.1 Smart Audience tab via Skill(brainstorming) + 4 AskUserQuestion locks. Plan written to `~/.claude/plans/resume-loverclinic-continue-tidy-thunder.md` (11 files: 4 modify + 7 create + 4 tests; +99 tests target).

**Brainstorm decisions** (locked):
- Q1 Save mode: NEW be_audiences collection + named segments (CRUD UI)
- Q2 Predicate set: All 8 (4 demographic + 4 behavioural)
- Q3 Export: CSV download only (no LINE push v1)
- Q4 Preview: real-time count + 10-name sample (debounced 300ms)

**Schema audit findings** (in plan):
- customer field is `source` NOT `acquisitionSource`
- customer `branchId` not in customerValidation bounds (deferred audit)
- sales `items[]` has productId XOR courseId, NO medications array
- existing `downloadCSV` (csvExport.js) UTF-8 BOM ready for reuse
- `smart_audience` permission key already declared at permissionGroupValidation.js:164

Detail: `.agents/sessions/2026-04-30-phase16-1-smart-audience-plan.md`

**Next action**: execute the plan via subagent-driven-development OR executing-plans. Rule K work-first-test-last. Will require V15 #11 deploy when ships (firestore.rules adds be_audiences entry).

### V15 #10 deploy (2026-04-30) — combined vercel + firestore:rules
- Pre-probe Rule B: 6/6 endpoints 200 ✓ (chat_conversations / pc_appointments / clinic_settings × 2 / opd_sessions anon CREATE+PATCH)
- `firebase deploy --only firestore:rules` — idempotent re-publish (rules unchanged since V15 #9; release v21 → v21)
- `vercel --prod --yes` — 34s build · `lover-clinic-10paf858k-...` aliased to `lover-clinic-app.vercel.app`
- Post-probe Rule B: 6/6 endpoints 200 ✓
- HTTP smoke: / 200 · /admin 200 · /api/webhook/line 401 (LINE sig expected)
- Cleanup: pc_appointments 2/2 200 · clinic_settings strip 2/2 200 · chat_conversations + opd_sessions probes hidden via V27 isArchived:true (admin staff cleanup pending)
- 13 commits shipped: `821c954` Phase 16.4 + `835070d` 16.7-quinquies-ter + `a5b616c` 16.7-quinquies-bis + `841941a` 16.7-quinquies + `31e2d79` + `a57b4e4` (docs) + `f698ed7` 16.7-quater + `0e5b9ac` 16.7-ter + `088e784` 16.7-bis + `0daf6dd` 16.7 + `e2e46f7` 16.2-bis + `9642bda` + `fdf3d41` 16.2 fixes + `0aa8cb6` 16.2 + `ced094d` 16.3-bis
  - 5 code commits: `e2e46f7` 16.2-bis · `0daf6dd` 16.7 · `088e784` 16.7-bis · `0e5b9ac` 16.7-ter · `f698ed7` 16.7-quater
  - 2 doc commits: `a57b4e4` 16.7-quinquies spec · `31e2d79` 16.7-quinquies plan
  - 3 carry-over from session 32: `ced094d` 16.3-bis · `0aa8cb6` 16.2 · `9642bda` black-screen · `fdf3d41` real-schema · `951e627` doc-handoff (incl. above totals → 10 unpushed unique)
  - firestore.rules version 21 unchanged this session
  - V15 #9 firestore.rules CHANGED — Phase 16.3 narrow match for `clinic_settings/system_config` + `be_admin_audit/system-config-*` create exception (rules version 20 → 21)
  - Probe-Deploy-Probe Rule B: pre 6/6 + 5/5 ✓; post 6/6 + 5/5 ✓; cleanup 4/4 = all 200
  - HTTP smoke: / 200, /admin 200, /api/webhook/line 401 (LINE sig — expected)
  - Phase 16.3 system_config new probe: unauth GET → 404 (doc not yet created; rule deployed cleanly)
  - V15 #8 Probe-Deploy-Probe Rule B: pre 6/6 + 5/5 negative ✓; post 6/6 + 5/5 negative ✓; cleanup pc_appointments 2/2 + clinic_settings strip 2/2 = all 200; opd_sessions probes hidden via V27 isArchived:true; chat_conversations probes left for staff cleanup
  - HTTP smoke: / 200 · /admin 200 · /api/webhook/line 401 ✓
  - Firebase rules: idempotent re-publish (firestore.rules unchanged this deploy)

### Session 2026-04-29 EOD (session 33) — Phase 16.7 Expense Report family + 16.7-quinquies plan

5 ship commits + spec + plan. ExpenseReportTab + DfPayoutReportTab now surface DF/expense/commission with real production data. Phase 16.7-quinquies (payroll + hourly + commission auto-computed) designed end-to-end and planned, awaiting execution next session.

**Code commits**:
- `e2e46f7` Phase 16.2-bis — clinic-report inline explanations (Info icon popover, 16 metrics) + 5 wiring fixes (TOP-10 DOCTORS doctor-enrichment via `enrichSalesWithDoctorIdFromTreatments` + branch-awareness gaps fixed in courseUtilization, expenseRatio, newCustomersTrend, cashFlow expense leg)
- `0daf6dd` Phase 16.7 — NEW Expense Report tab `tab=expense-report` replicating ProClinic `/admin/report/expense` 4-section layout (Doctors / Staff+Assistants / Categories / Products placeholder) using be_* canonical
- `088e784` Phase 16.7-bis — DfPayoutReportTab 4-col extension (ค่านั่ง / ค่ามือ / เงินเดือน / รายจ่ายอื่นๆ) + QuotationFormModal seller picker uses `listAllSellers` (was `listStaff`)
- `0e5b9ac` Phase 16.7-ter — unlinked-treatment DF helpers (`computeUnlinkedTreatmentDfBuckets` + `mergeUnlinkedDfIntoPayoutRows`) so treatments with dfEntries but no linkedSaleId now contribute DF (live verified ฿14,710 reconciled). Branch sidebar empty state with helpful migration hint replacing "ไม่มีสาขา"
- `f698ed7` Phase 16.7-quater — dfPayoutAggregator fallback schema robustness: accept `sellerId‖id`, `percent‖share*100`, equal-split when sum=0 (43/57 April sales had all-zero percents pre-fix)

**Doc commits** (Phase 16.7-quinquies):
- `a57b4e4` spec doc — 5-stream design: salary+payday schema + auto-payroll (computed-on-read) + hourly fee from be_staff_schedules + commission from sale.sellers + ProClinic sync mapper extension
- `31e2d79` plan doc — 22 tasks across 6 phases (A schema/UI / B sync / C payrollHelpers / D wiring / E test bank / F verify+ship). Rule K work-first test-last ordering.

**Live preview_eval verified** (session 33 mid):
- ExpenseReportTab: รายจ่ายรวม ฿14,710 · ค่ามือแพทย์ ฿14,590 · ค่ามือพนักงาน+ผู้ช่วย ฿120 · นาสาว An เอ ฿14,580 · นาสาว เอ เอ ฿10 · คุณ พิมพ์ (ผู้ช่วยแพทย์) ฿120
- 6 of 82 treatments had dfEntries; ALL had `linkedSaleId=''` (consume-existing-course case); pre-fix all-zero. Post-fix: surface correctly.
- 43 of 57 sales have sellers[].percent='0' (master-data drift; sellers are be_staff not be_doctors — no DF rates configured).
- be_branches collection is EMPTY (admin needs to migrate from master_data — branch sidebar shows hint).

**Rule additions this session** (locked in `.claude/rules/00-session-start.md` + `CLAUDE.md`):
- **Rule J extended**: Plan-mode ORTHOGONAL to brainstorming. Both layers required. Drift caught + locked.
- **Rule K added**: Work-first, Test-last for multi-stream cycles. Build all structure → review → test bank as final pass before commit. Don't interleave.

**Methodology drift acknowledged**:
- Session 32 user follow-ups (DF report wiring + clinic-report inline explanations) entered plan-mode WITHOUT explicit `Skill(brainstorming)` invocation. User caught + Rule J updated. Phase 16.7-quinquies brainstorming this session done explicitly via Skill tool — fixed.

Detail: `.agents/sessions/2026-04-29-session33-phase16-7-family.md`

**Next action**: Execute `docs/superpowers/plans/2026-04-29-phase16-7-quinquies-payroll.md` (22 tasks). Pick subagent-driven-development OR executing-plans.

---

### Session 2026-04-29 EOD (session 32) — Phase 16.2 LIVE-data-fix

2 user-reported bug fixes after Phase 16.2 ship — tab opened to **black screen**, then once unblocked **most tiles showed 0/empty**. Both root-caused + fixed; tab now renders with real data.

**Fix 1 — `9642bda` black-screen on tab open**:
- V11 mock-shadowed-reality: `ClinicReportTab` destructured `canAccessTab` but real `useTabAccess()` returns `canAccess`. Test mock used wrong name → tests passed while production threw `TypeError: canAccessTab is not a function`.
- Plus latent Rules of Hooks violation: permission gate's early-return placed BEFORE useState/useMemo/useClinicReport calls → "React detected change in order of Hooks" when canAccess flipped after async config load.
- Fix: rename to `canAccess` + move early-return AFTER all hooks + defensive `Array.isArray(branches)` guard. Test mock corrected to match real shape with V11 anti-pattern comment.

**Fix 2 — `fdf3d41` real-schema field mapping (5 distinct mismatches)**:
- `s.total → s.billing.netTotal` (NEW `getSaleNetTotal` helper with cascading fallback) — affected revenueYtd · avgTicket · momGrowth · revenueTrend · cashFlow · branchComparison
- `e.expenseDate → e.date` (NEW `getExpenseDate` helper) — affected expenseRatio · cashFlow expense leg
- `course.qty` is a STRING `"<rem> / <total> <unit>"` parsed via `courseUtils.parseQtyString` (NEW `computeCourseUtilizationFromCustomers` helper) — affected courseUtilization tile
- topServices duplicated by procedureType+category split → NEW `_aggregateTopServices` groups by courseName
- topProducts used stockReportAggregator (inventory) → NEW `_aggregateTopProducts` walks `sales.items.products[]` + `medications[]`
- `staffSales.rows` doesn't exist (real shape is `{staffRows, doctorRows}`) → orchestrator now reads `doctorRows` directly + drops the brittle `/Dr\./` regex (Thai นพ./พญ./ทพ. now safe)

**Live browser verification**: revenueYtd 0 → ฿2,256,286 · avgTicket 0 → ฿39,583.96 · courseUtil 0% → 23.46% · TOP-10 SERVICES deduped (เทส IV แก้แฮงค์2 800k merged from 600k×3 + 200k×1 splits) · TOP-10 PRODUCTS shows real sold-product names with qty.

**Remaining 0/empty per user "ยกเว้นช่องไหนที่เริ่มเก็บจากวันนี้เป็นต้นไปก็ไม่เป็นไร"**: EXPENSE % (no `be_expenses` yet) · เปรียบเทียบสาขา (no `be_branches`) · TOP-10 DOCTORS (sales lack `doctorId`) · RETENTION 0% (1 cohort n=1) · NO-SHOW % (no statuses) · M-O-M "—" (prev calendar month had 0 revenue).

**Tests**: 3863 → 3894 (+31). 79/79 phase16.2 file pass. Build clean.

Detail: `.agents/sessions/2026-04-29-session32-phase16-2-fixes.md`

**2 user-requested follow-ups queued for session 33**:
1. **DF report wiring** — รายงานจ่าย DF (ค่ามือแพทย์) shows no data; แพทย์ & ผู้ช่วย page already records doctor-vs-assistant. Replicate ProClinic's รายจ่าย page using OUR `be_*` data. Multi-branch aware.
2. **Clinic-report inline UI explanations** — add description per tile + chart on `tab=clinic-report` (metrics need context for non-experts), then trace back through wiring to verify each metric's logic. Multi-branch aware.

### Session 2026-04-29 EOD (session 31) — Phase 16.2 Clinic Report SHIPPED

Subagent-driven 14-task pipeline executed. All tasks closed with two-stage review (spec compliance + code quality). User constraint "ห้ามเปลี่ยน wiring เดิม" preserved — strictly additive: 9 NEW source files + 1 NEW hook + 7 NEW test files + 4 small additive edits (permission key row + tab gate + nav entry + lazy import).

**9 brainstorm decisions locked** (see spec doc):
- Audience: Both (clinic-wide + branch drilldown)
- Scope: Comprehensive 12 widgets
- Layout: Sticky filter rail + scrollable widget grid
- Date control: 7 presets + custom picker
- Permission: NEW `report_clinic_summary` + branch-scoped via branchIds[]
- Export: PDF (V32 pattern: html2canvas+jsPDF direct) + CSV (UTF-8 BOM)
- Cache: Smart hybrid (filter-keyed + manual refresh + auto-invalidate)
- Drilldown: Link to existing detail tabs (zero new modals)
- Architecture: Orchestrator aggregator (Approach A)

**Files** (committed in this bundle): spec + plan + 9 NEW source files + 1 NEW hook + 7 NEW test files + 4 small additive edits.

**Tests**: 3771 → ~3863 (+92). Build clean.

**Status**: master 2 commits ahead of prod (Phase 16.3-bis `ced094d` + Phase 16.2 `dacf189`). Awaiting V15 #10 deploy auth from user when ready.

Spec: `docs/superpowers/specs/2026-04-29-phase16-2-clinic-report-design.md`
Plan: `docs/superpowers/plans/2026-04-29-phase16-2-clinic-report.md`

### Session 2026-04-29 EOD (session 30 cont.) — Phase 16.3 + V15 #9 + 16.3-bis fix

8 commits across V36 family + Phase 16 next sub-phase.

**Commits**: ae760c7 V36 → 6f8af43 V36-bis/tris → db6d84e V36-quater → 0dd147c V36-quinquies → f4e6127 Phase 16.3 → ced094d 16.3-bis (unpushed-to-prod) + 2 EOD doc commits.

**V36-quater** — purchased-in-session course-history audit emit fix (TFP:2654 sibling miss to V36-bis line 2156 fix). Customer "asdas dasd" treatment with purchased-in-session courses → 0 audit docs in be_course_changes pre-fix; post-fix audit emits properly.

**V36-quinquies** — real-time listeners. NEW `listenToCustomer(customerId, ...)` + `listenToCourseChanges(customerId, ...)` helpers. CustomerDetailView now uses live `liveCustomer` state via onSnapshot; CourseHistoryTab swapped from one-shot `listCourseChanges` to onSnapshot. User report: "ประวัติการใช้คอร์สไม่รีเฟรชแบบ real time".

**Phase 16.3 System Settings tab** — admin UI for tab-visibility overrides + defaults (deposit% / points-per-baht / dateRange) + feature flags (allowNegativeStock Q4-C semantic) + audit trail viewer. NEW permission key `system_config_management`. firestore.rules version 20 → 21 (clinic_settings/system_config narrow match + be_admin_audit/system-config-* create exception). 4 brainstorming Qs answered (Q1-D / Q2-C / Q3-A / Q4-C). Spec: `docs/superpowers/specs/2026-04-29-phase16-3-system-settings-design.md`. Tests +107 across 5 phase16.3-* files.

**V15 #9 deploy** — Probe-Deploy-Probe Rule B: pre 6/6 + 5/5 ✓; post 6/6 + 5/5 ✓; cleanup 4/4 200; HTTP smoke / 200 · /admin 200 · /api/webhook/line 401. Phase 16.3 system_config new probe: unauth GET → 404 (doc not yet created — rule deployed cleanly).

**Phase 16.3-bis fix** (ced094d, unpushed-to-prod) — V12 multi-reader-sweep regression at consumer-hook level. `useTabAccess.js` called `canAccessTab/filterAllowedTabs/firstAllowedTab` WITHOUT the new 4th `overrides` arg → admin-saved tabOverrides had ZERO runtime effect. Fix: import `useSystemConfig`, extract `config.tabOverrides`, pass to all 3 forwarded helpers + closures + memo dep. Tests +12 V36-style anti-regression bank (every consumer-hook call must include 4th arg).

Detail: `.agents/sessions/2026-04-29-session30-cont-phase16-3.md`

### Session 2026-04-29 evening (session 30) — V36 + V15 #8

V36 cluster (3 distinct bugs from V15 #7 fallout):
- Bug A — transfer + withdrawal `_receiveAtDestination` skipped `_ensureProductTracked` (V12 multi-writer mirror) → destination batches existed but `stockConfig.trackStock !== true` → treatment silent-SKIPped while qty.remaining never moved
- Bug B — `_deductOneItem` decision-tree comment promised V31 fail-loud for treatment context; code did silent-skip (V21-class comment-vs-code drift)
- Bug C — `BranchContext` retained phantom branchId `BR-1777095572005-ae97f911` from cleanup-deleted branch in localStorage; pre-V36 logic only validated cached id on first snapshot

Fixes (commit `ae760c7`):
- `_receiveAtDestination` (transfer + withdrawal) now route through `_ensureProductTracked` per V12 single-writer contract
- Treatment context throws `TRACKED_UPSERT_FAILED` Thai error when product genuinely missing; sale context preserves silent-skip per V35.3-ter
- `_ensureProductTracked` switched `updateDoc` → `setDoc({merge:true})` for robust upsert
- `BranchContext` re-validates `selectionStillValid` on EVERY snapshot; auto-falls back to default or `'main'` when current selection no longer exists
- Phase 15.7 negative-stock invariant PRESERVED (locked by V36.E.11-15 + V36.F.4-8)

Tests: +144 V36 cases across 4 new files (v36-batch-creator-ensure-tracked-sweep + v36-treatment-skip-fail-loud + v36-branch-correctness-audit + v36-stock-end-to-end-flow-simulate); 3 legacy regressions fixed (course-skip F.6 caller-count + slice; phase15.4 ML.C/ML.D fnSlice; branch-isolation BR1.5 var-name)

Live preview_eval pre-deploy:
- Confirmed product 276 (BA - วิตามินผิวใส) + 281 (BA - Allergan 50 U) had `stockConfig: null` despite having batches
- 3 SKIP movements at branch BR-1777095572005-ae97f911 (the phantom from stale BranchContext)
- After page reload with V36 fix: BranchContext fallback → `selectedBranchId = 'main'` → Movement Log shows 341 entries (vs 4 phantom-only pre-V36)

V15 #8 deploy:
- vercel `lover-clinic-gxx8hxgzm-...` ~41s build + alias
- firebase rules idempotent re-publish (no schema change)
- Probe-Deploy-Probe pre+post 100% green
- All 6 cumulative commits unpushed-to-prod from session 29 + V36 commit shipped (Phase 16.5 base+bis+ter+quater + EOD docs + V36)


  - V15 #7 Probe-Deploy-Probe: pre 6/6 + 5/5 negative ✓; post 6/6 + 5/5 negative ✓; cleanup 4/4 (pc_appointments DELETE) + 2/2 (clinic_settings strip) + 2/2 (opd_sessions DELETE V27-tris) = all 200; chat_conversations probes left (anon delete blocked by rule)
  - HTTP smoke: root 200 / /admin 200 / /api/webhook/line 401 ✓
  - Firebase rules: `released to cloud.firestore` (already up to date — idempotent re-publish; no schema bump)
  - Phantom branch cleanup: `BR-1777095572005-ae97f911` purged via `/api/admin/cleanup-phantom-branch` (51 ops: 4 batches + 29 movements + 12 orders + 1 transfer + 2 appointments + 2 staff updates + 1 branch doc; auditId `cleanup-phantom-branch-1777399906398`; verified all-zeros post-delete)
  - **Damage scope (pre-deploy)**: 24 cumulative commits across sessions 27+28 had been live-locally + tested but un-deployed for ~24h; V15 #7 closed that gap.
  - Vercel (V15 #4): `lover-clinic-kfrlkir4l-teddyoomz-4523s-projects.vercel.app` aliased to `lover-clinic-app.vercel.app`
  - Firestore rules: released to `cloud.firestore` (be_admin_audit added)
  - Probe-Deploy-Probe: pre 6/6 + 5/5 negative ✓; post 6/6 + 5/5 negative ✓; cleanup 4/4 + strip 2/2 = 200
  - HTTP smoke: root 200 / /admin 200 / /api/webhook/line 401 (LINE sig check on empty body — expected)
- **Production cleanup (V15 #4 post-deploy)**:
  - 31 orphan stock batches deleted via /api/admin/cleanup-orphan-stock (auditId: cleanup-orphan-1777363491282)
  - 9 cascade-blocked batches deleted via direct firebase-admin SDK (test products had batches; orphan endpoint missed them since productId WAS in be_products)
  - 40 test products (ADVS-/ADVT-*) deleted via /api/admin/cleanup-test-products (auditId: cleanup-test-products-...)
  - 2 user-named test sales deleted via direct firebase-admin SDK (TEST-SALE-DEFAULT-1777123845203 + TEST-SALE-1777123823846 stored as saleId FIELD on INV-20260425-0004/0005 — endpoint regex on doc.id missed them; one-shot deletion documented in audit log)
  - **Total: 82 docs cleaned. Verification: all 3 endpoints DRY-RUN returns 0.**
  - Counts: be_stock_batches 369→329 (-40), be_products 377→337 (-40), be_sales 52→50 (-2)
- **Rule B probe list**: 6 positive + 5 negative (Phase 15.6 added be_admin_audit to negative list)
- **Production URL**: https://lover-clinic-app.vercel.app
- **Remote sync**: master = origin/master ✅
- **SCHEMA_VERSION**: 18 (V35 added be_admin_audit collection + FK validation at batch creators)
  - Vercel (V15 #3): `lover-clinic-9cama0xir-teddyoomz-4523s-projects.vercel.app` aliased to `lover-clinic-app.vercel.app` — 44s deploy
  - Firestore rules: released to `cloud.firestore` (no rule changes in this deploy; idempotent re-publish)
  - Probe-Deploy-Probe: pre 6/6 + 4/4 negative ✓; post 6/6 + 4/4 negative ✓; cleanup 4/4 = 200 + 2/2 strip = 200
  - HTTP smoke: root 200 / /admin 200 / /api/webhook/line 401 (LINE sig check on empty body — expected)
- **Rule B probe list**: 6 positive + 4 negative (be_central_stock_orders + be_customer_link_tokens + be_link_requests + be_link_attempts)
- **Production URL**: https://lover-clinic-app.vercel.app
- **Remote sync**: master = origin/master ✅
- **SCHEMA_VERSION**: 17 (V34 unchanged schema — pure logic fix)

### Session 2026-04-29 (session 29) — V15 #7 combined deploy + phantom branch cleanup (ops-only, no commits)

User authorized "deploy" → executed combined V15 #7 (vercel --prod + firebase deploy --only firestore:rules) in parallel. All 24 cumulative commits + the EOD doc commit (cf54400) shipped to production. Probe-Deploy-Probe Rule B passed both sides (6/6 positive 200 + 5/5 negative 403). HTTP smoke 200/200/401. Cleanup completed for pc_appointments, clinic_settings probe field, and opd_sessions test docs (V27-tris); chat_conversations probes left for staff-side cleanup per existing rule.

Then admin endpoint `/api/admin/cleanup-phantom-branch` (Phase 15.7-novies) executed against `BR-1777095572005-ae97f911`:
- DRY-RUN list: 4 batches + 29 movements + 12 orders + 1 transfer (source) + 2 appointments + 2 staff with phantom in branchIds[] + 1 branch doc = 51 ops
- DELETE confirmed → 51 ops committed in 1 Firestore writeBatch (under 500-cap); auditId `cleanup-phantom-branch-1777399906398` written to be_admin_audit
- Post-verify: all summary fields = 0, branchDocExists = false ✓
- Caller: `loverclinic@loverclinic.com` (admin claim verified)

**Lesson V36 candidate**: 2 grep regexes mismatched the actual log strings while polling background-deploy state — burned cycles on `(Production: https...)` matching mid-deploy lines and `(Aliased to)` missing the real `Aliased: ` literal. Locked permanently in `feedback_background_task_completion.md` (memory) — rely on background-task completion notification as authoritative signal; don't reinvent it via brittle regex tail-grep.

**Live-QA verification (all 9 features passed in production 2026-04-29 post-V15 #7)**:
- ✓ assistants picker · ✓ advisor dropdown · ✓ location lock · ✓ customer-name new-tab · ✓ appt delete · ✓ calendar column-width · ✓ negative-stock repay · ✓ default-branch auto-pick · ✓ self-created treatment refresh

**Carry-overs cleared (user confirmed 2026-04-29)**:
- ✓ LineSettings creds — user configured (channel access token + secret + bot basic ID)
- ✓ Customer ID backfill — not needed (read-time HN/name backfill in saleReportAggregator suffices)
- ✓ TEST-/E2E- prefix discipline — not needed (V33.10/.11/.12 drift catchers already enforce; existing hardcoded literals are negative-test fixtures asserting validation logic)

**Phase 15 = COMPLETE.** Ready for Phase 16 (Polish & Final) OR pre-launch H-bis cleanup, whichever user picks first.

### Session 2026-04-29 EOD (session 29) — Phase 16 kickoff + 16.5 base/bis/ter/quater + V15 #7 deploy

User shipped 7+ feature requests + bug reports across the day. Auto-mode session shipped 6 commits closing Phase 16.5 family in 4 sub-phases. V15 #7 combined deploy + phantom-branch cleanup also ran. **3312 → 3456 tests · 5 cumulative commits unpushed-to-prod**.

**Commits this session** (newest first):
- `2aae710` Phase 16.5-quater — bug bundle (qty fix + cancel-removes-course + Option B exchange + ExchangeModal V14 lock + retail dropdown beProductToMasterShape) + audit unification (kinds: add/exchange/share/cancel/refund/use) + NEW CourseHistoryTab + treatment-deduction emit
- `6c82d3c` Phase 16.5-ter — staff dropdowns (Cancel/Exchange/SaleTab cancel) + applySaleCancelToCourses flip-status cascade + SaleDetailModal staff display
- `51a4141` P0 hotfix — buildChangeAuditEntry undefined-courseId crash (V14 lock — coerce undefined → null/'' on every leaf)
- `ae865db` Phase 16.5-bis — surface ProClinic-cloned courses (1384 had been skipped) + effective status promotion (qty=0/N + active → 'ใช้หมดแล้ว') + pagination 20/page + status-pick-wins-over-toggle
- `49db77c` doc handoff after Phase 16.5 base
- `6aae9c3` Phase 16.5 base — Remaining Course tab + cancelCustomerCourse helper + 3 action modals + 5 test files (+112 tests)

**Earlier in session** (no commits): V15 #7 combined deploy (vercel + firebase rules) + 6/6 + 5/5 probe-deploy-probe + phantom branch BR-1777095572005-ae97f911 cleanup (51 ops via /api/admin/cleanup-phantom-branch).

**2 memory rules locked**:
- `feedback_no_real_action_in_preview_eval.md` — NEVER click real action btns in preview_eval (after I cancelled real customer 2853 course 200 during a P0 verify; reverted in 60s).
- `feedback_no_prelaunch_cleanup_without_explicit_ask.md` — pre-launch H-bis cleanup never auto-triggers; user verbatim only.

Detail: `.agents/sessions/2026-04-29-session29-phase16-5-family.md`

### Session 2026-04-29 (session 29 — earlier) — Phase 16.5 Remaining Course tab shipped (commit `6aae9c3`)

User picked recommended order (16.5 → 16.3 → 16.2 → 16.1) + intel /admin/order in parallel. Shipped 16.5 first via brainstorming → ExitPlanMode → TDD.

**Architecture**:
- Derived data strategy (no new collection — flatten `be_customers[].courses[]` client-side)
- Thai status enum: `กำลังใช้งาน` / `ใช้หมดแล้ว` / `คืนเงิน` / `ยกเลิก` (matches existing `courseExchange.js` convention)
- Practical 8-col table + practical filter set (search + status + course-type + has-remaining toggle + BranchContext)
- 3 single-purpose modals (Cancel/Refund/Exchange) — first UI surface for `refundCustomerCourse` + `exchangeCourseProduct` (existed in backend since V32-tris-bis but no UI) + NEW `cancelCustomerCourse` (16.5 added)
- All modals: try/catch + error banner (V31 anti-silent-swallow)

**Files** (12 new + 4 modified):
- NEW: `src/lib/remainingCourseUtils.js` · 3 modals · `RemainingCourseTab.jsx` · `RemainingCourseRow.jsx` · 5 test files · spec doc
- MOD: `src/lib/courseExchange.js` (applyCourseCancel + audit-kind:cancel) · `backendClient.js` (cancelCustomerCourse runTransaction) · `navConfig.js` (Clock icon entry) · `BackendDashboard.jsx` (lazy import + render case + REPORT_LABELS)

**Tests**: 3312 → 3424 (+112). Pass: utils 34 / cancel 18 / modals 15 / flow-simulate 16 / source-grep 29.

**Build**: clean — `RemainingCourseTab-BpWYKFHD.js` 26.65 kB chunk; total bundle gzip increase ~9 kB.

**Browser preview verified**: navigated to `/?backend=1&tab=reports-remaining-course` → tab renders with title "คอร์สคงเหลือ" + 4 filter controls + 4 status options (กำลังใช้งาน/ใช้หมดแล้ว/คืนเงิน/ยกเลิก) + course-type filter + has-remaining toggle + Export CSV button + empty state ("ยังไม่มีคอร์สคงเหลือ"). No new console errors.

**Spec**: `docs/superpowers/specs/2026-04-29-phase16-5-remaining-course-design.md`. Master Phase 16 plan: `~/.claude/projects/F--LoverClinic-app/memory/project_phase16_plan.md`.

**Outstanding** (next session): V15 #8 deploy auth (5 commits ready) → live QA on 16.5 family → 16.3 System Settings.

## Resume Prompt

```
Resume LoverClinic — continue from 2026-05-13 LATE EOD.

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=6d134a5, prod=ccef3c2 · 50 commits ahead · not deployed)
3. .agents/active.md (8447 tests · Phase 26.2g-fillin PENDING)
4. .claude/rules/00-session-start.md (iron-clad A-P + V-summary)
5. .agents/sessions/2026-05-13-phase-26-2f-mirror.md (latest checkpoint)

Status: master=`6d134a5`, 8447 tests pass + 1 skip, prod=`ccef3c2` LIVE. Build clean. Phase 26.0/26.1/26.2/26.2f all SHIPPED to master, NOT deployed. 50 commits ahead.

Next: **Phase 26.2g-fillin** — auto-fill `congenitalDisease` + `treatmentHistory` from `patientData.ud_*` + `currentMedication` on TFP create. Brainstorming spec drafted in prior chat (user confirmed structured patientData source). PICK UP from approving the design + writing-plans + implement. Design summary in .agents/active.md "Next action" section.

Outstanding (user-triggered):
- Deploy auth: 50 commits ahead — combined `vercel --prod` + `firebase deploy --only firestore:rules` per V15.
- Phase 26.2g-fillin: approve design → writing-plans → subagent-driven execute.
- (Optional) probe-deploy-probe.mjs probes 2/3/4 false-positive; Phase 17.1 cross-branch-import-rtl flake.

Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe; Rule J brainstorming HARD-GATE; Rule N targeted-test-only.

Phase 26.2f institutional memory: **`toDateSafely(value)` is canonical helper** for any "value might be Firestore Timestamp object" rendering. 5-form coverage (.toDate / .toMillis / plain {seconds,nanoseconds} / Date / string-number). Returns null on unrecognized → caller renders safe fallback. Without this, raw Timestamp objects passed to React as JSX child throws "Objects are not valid as a React child" → black screen. Companion to `extractDisplayString` (Phase 26.2f Mirror) for [object Object] fix. **3-stage save workflow**: vitals → doctor → null/complete; saveMode='vitals' is 5th locked-X family member; AV37/38/39 audit invariants lock the contracts.

/session-start
```

### Session 2026-04-29 EOD (session 28) — Phase 15.7 family + Rule J superpowers boot (12 commits)

User shipped 9 directives across the day → Phase 15.7 family (base → novies, 9 sub-phases). Auto-mode session shipped 12 commits. **2927 → 3312 tests · 24 cumulative commits unpushed-to-prod**.

**Commits this session**:
- `e6afd35` Phase 15.7-ter — StockBalancePanel auto-picks default branch
- `7ec6cb7` Phase 15.7-quater — treatment history real-time + V33 parity audit
- (Phase 15.7 base + bis shipped earlier in same arc — see prior commits)
- `1a8e36d` Phase 15.7-bis bundle (5 fixes — negative repay, calendar badge, etc.)
- `7dbdfd7` Phase 15.7-quinquies — calendar column width scales with roomCount
- `140229c` Phase 15.7-sexies — appt modal delete + clickable customer name
- `8ae753d` Phase 15.7-septies — customer-name opens NEW TAB
- `f310231` Phase 15.7-octies — advisor listAllSellers + location lock
- `3a16b27` Phase 15.7-novies — admin endpoint cleanup-phantom-branch.js (47 tests)
- `28308ad` Rule J — superpowers auto-trigger + session boot (3-layer)

**Key shipments**:
- Negative-stock system: allow deduct past zero, FIFO-oldest auto-repay on incoming positives, ติดลบ badge + filter
- V33 self-created customer parity (id-first resolution, treatment history listener, advisor dropdown)
- Appointment modal: delete button + customer-name new-tab + advisor branch-filtered + location locked
- Phantom branch BR-1777095572005-ae97f911 cleanup: spec doc + admin endpoint (firebase-admin SDK bypasses audit-immutability rules) + 47 regression tests
- 3-layer superpowers boot: skill descriptions auto-trigger + Rule J in CLAUDE.md/00-session-start.md + user-level CLAUDE.md session boot

Detail: `.agents/sessions/2026-04-29-session28-phase15.7-family.md`

### Session 2026-04-28 EOD (session 27) — V35.3-ter + V33-customer-id + UX polish bundle (12 commits)

User shipped 12 directives across the day. Auto+plan-mode session shipped 12 commits addressing course skip-stock flag, 3 stock multi-reader-sweep iterations (V35.3/bis/ter), TFP grouping, SaleTab buy fix, branch-aware PDFs, and V33-customer-id-resolution (5th V12 occurrence). **2783 → 2927 tests · 12 commits unpushed-to-prod**.

**Commits**:
- `2149eae` "ไม่ตัดสต็อค" course flag + treatment silent-skip (V15 #5)
- `f0e3042` treatment shortfall silent-skip not throw (V15 #6 hotfix)
- `aa760b1` V35.3 — _deductOneItem missing includeLegacyMain (3rd V12 miss)
- `c2fe55a` TFP "ข้อมูลการใช้คอร์ส" grouping by purchase event
- `397d9ff` V35.3-bis — drop branchId from batchFifoAllocate (real fix)
- `a16c700` BCC isAddon-key discriminator (no merge with legacy entries)
- `023c1a6` SaleTab buy-modal field-name + skipStockDeduction propagation
- `c48eda4` V35.3-ter — sale-context auto-init + silent-skip parity with treatment
- `409ed8d` Receipt heading rename + clinic header polish + badge alignment
- `9ffbe14` Branch-aware clinic info + sales-list inline items + OPD amount visible
- `f206887` Sales-list redesign + concat clinic name with branch
- `eae90c9` V33-customer treatment-save + assistants filter + OPD Card label

Detail: `.agents/sessions/2026-04-28-session27-eod-bundle.md`

### Session 2026-04-28 (session 26) — V35.1+V35.2 portal/per-lot/cleanup/partial-commit/null-customer

User shipped 10 reports across the day post-V15 #4. Auto-mode session shipped 4 commits addressing dropdown UX, phantom-product cleanup, partial-commit prevention, null-customer crash. **2740 → 2783 tests · 4 commits unpushed-to-prod**.

**Commits**:
- `8ad853c` V35.1+V35.2 — Portal dropdowns + BatchSelectField + per-lot expansion + canonical-name + 64 phantoms cleaned
- `513da1c` V35.2-tris/V35.1-tris+ — ความจุ=QtyBeforeMaxStock direct + flip-up dropdown + HARD_CAP 720
- `038b3d5` V35.2-quater — "นำเข้าจากข้อมูลพื้นฐาน" button removal + sort newest-first
- `72bf0ca` V35.2-quinquies/sexies — atomic _assertAllProductsExist pre-validation + customerDoc null-guard + TreatmentFormPage early-return

**Production cleanup (already shipped via direct admin SDK, audited in be_admin_audit)**:
- 14 ADVX/ADVO/ADVW test products + 18 batches
- 32 test-branch batches (ADVB-/STK-TRT-/STK-SALE-/ADVSA-/V20 BR-)

Detail: `.agents/sessions/2026-04-28-session26-v35-1-v35-2-bundle.md`

### Session 2026-04-28 — Phase 15.6 / V35 stock bug sweep + Phase D + V15 #4 deploy + production cleanup

User reported 5 stock-system issues in one message after V15 #3 deploy. Auto-mode session shipped V35 in 2 commits + V15 #4 combined deploy + production cleanup (82 docs).

**Commits this session**:
- `6075136` Phase 15.6 P0 (Issues 1+2+3+5 — 21 files: balance fix, sale-delete try/catch, FK validation, 3 cleanup endpoints, V33.12 testSale prefix, capacity tooltip; +170 tests)
- `79a974c` Phase 15.6 Phase D (Issue 4 — searchable ProductSelectField + 4 stock picker migrations + +43 tests)

**5 user-reported issues**:
1. ✅ Branch stock balance silent miss → StockBalancePanel mirrors MovementLogPanel includeLegacyMain (Phase 15.4 incomplete-fix gap)
2. ✅ ความจุ semantic confusion → header tooltip + per-row "(เป้าหมาย: N)" sub-label
3. ✅ Orphan products in stock → NEW _assertProductExists hoisted helper at every batch creator + cleanup endpoint
4. ✅ Searchable product dropdown → NEW ProductSelectField + productSearchUtils + 4 stock pickers migrated; non-stock pickers (Course/Promotion/Quotation/Sale) deferred to follow-up
5. ✅ Test pollution + sale delete black-screen → SaleTab try/catch + 3 cleanup endpoints + V33.12 testSale prefix; production cleanup deleted 82 docs

**V35 V-entry locked** in 00-session-start.md § 2 + verbose in v-log-archive.md. audit-stock-flow upgraded S20→S28 (S26 includeLegacyMain at default-branch readers, S27 FK at batch creators, S28 ProductSelectField Rule C1 lock).

**V15 #4 deploy verification**: pre+post probes 6/6 + 5/5 (be_admin_audit added to negative list); HTTP smoke 200/200/401 ✓; vercel aliased ✓; firebase rules released ✓.

**Production cleanup runbook proven**: api/admin/cleanup-orphan-stock + cleanup-test-products + cleanup-test-sales endpoints + admin token mint via firebase-admin custom-token + Identity Toolkit exchange. The 9 cascade-blocked batches + 2 saleId-field-only test sales required one-shot direct firebase-admin SDK deletes (audit log written for both).

Detail: `.agents/sessions/2026-04-28-session25-phase15-6-v35-deploy.md` (NOT YET written — defer to follow-up session-end)

### Session 2026-04-28 EOD — Phase 15.5 bundle (4 features) + audit S21-S25 + coverage spot-check (DEPLOYED in V15 #4)

User chained 4 directives across the session: (1) ลุย Phase 15.5 (15.5A actor filter + 15.5B withdrawal approval); (2) per-product balance warnings; (3) ProductFormModal unit dropdown enrichment; (4) audit + coverage. All shipped + pushed; awaiting V15 #4 deploy auth.

**4 commits**:
- `d037cf0` 15.5A ActorPicker branchIds[] filter on 5 stock-mutation panels + pure helper `mergeSellersWithBranchFilter` (28 tests). 15.5B `/api/admin/stock-withdrawal-approve.js` admin endpoint + `stockWithdrawalApprovalClient.js` + WithdrawalDetailModal approve/reject UI with reason modal (51 tests). Soft-approve (status STAYS at 0) + hard-reject (status 0→3) + type=15/16 audit movements + atomic db.batch + idempotency.
- `89c5607` Item 1 per-product balance warnings (alertDayBeforeExpire / QtyBeforeOutOfStock / QtyBeforeMaxStock — already in productValidation schema, now drive StockBalancePanel via productThresholdMap; 3 helpers + 4 row badges + 3 filter checkboxes; hardcoded ≤30/≤5 thresholds REMOVED; 38 tests). Item 2 ProductFormModal unit dropdown merges master + existing product units (deduped + Thai-locale sort + non-fatal listProducts catch; 21 tests).
- `ac75ad0` audit-stock-flow S1-S20 → S1-S25 (Phase 15.5 patterns: per-product warnings + anti-hardcoded + ActorPicker filter + withdrawal approval contract + dropdown enrichment) + audit-all tier-1 line update + Phase H coverage spot-check via @vitest/coverage-v8.

**Tests**: 2389 → 2527 (+138). Build clean.

**Coverage spot-check** (Phase 15.5 files):
- api/admin/stock-withdrawal-approve.js: 89.47% lines / 100% funcs ✓
- src/lib/stockWithdrawalApprovalClient.js: 100% / 100% ✓
- src/lib/productValidation.js: 91.95% lines / 100% funcs ✓
- tests/helpers/{stockInvariants,testStockBranch}.js: 85-95% ✓
- UI components (StockBalancePanel + ProductFormModal + WithdrawalDetailModal + 5 stock panels): 0-5% (source-grep tests cover structural correctness — 138 grep assertions across the 4 features). Documented as acceptable; future RTL render tests would close ~150 LOC.

All P0 paths covered. No deploy blocker.

Detail: `.agents/sessions/2026-04-28-session24-phase15-5-bundle.md`

### Session 2026-04-28 V34 + V15 #3 deploy (auto-mode, "deploy" authorized)

**V34 — ADJUST_ADD silent qty-cap bug fix** (production-affecting since stock system shipped):
User reported "ทดลองปรับสต็อคคลังกลาง ผ่านทุกปุ่ม แล้วยอดไม่เปลี่ยน". Phase 0 preview_eval diagnostic confirmed `reverseQtyNumeric({total:10, remaining:10}, 20)` → `{remaining:10, total:10}` silent cap. createStockAdjustment used reverseQtyNumeric (cap-at-total semantic for refunds) for type='add' adjustments. Fix: NEW `adjustAddQtyNumeric(qty, amount)` helper with soft-cap math (`{remaining: remaining + amt, total: max(total, remaining + amt)}`); reverseQtyNumeric semantics preserved for `_reverseOneMovement` refund paths.

**Phase 2 systemic audit** (12 mutation sites read):
- 2 P0 atomicity fixes shipped: `cancelStockOrder` + `updateStockOrder` cost cascade migrated to `writeBatch`
- 4 P0 + 4 P1 deferred with `AUDIT-V34` source comments (deductStockForSale partial-rollback, updateStockTransferStatus CAS+external-work, receiveCentralStockOrder concurrent-receive, etc.)

**Phase 3-5 tooling**:
- 61 invariant tests in `tests/v34-stock-invariants.test.js` + shared `tests/helpers/stockInvariants.js`
- audit-stock-flow upgraded S1-S15 → S1-S20 (per-tier conservation, time-travel, concurrent-tx, listener alignment, test-prefix)
- V33.11 stock-test prefix discipline (`tests/helpers/testStockBranch.js` + 12-test drift catcher)

**Phase 6**:
- V34 entry compact in `00-session-start.md` § 2 + verbose in `v-log-archive.md`
- Rule I item (b) hardened for stock paths (preview_eval round-trip NON-NEGOTIABLE for stock mutations)

**Production damage AVERTED by deploy** — every hour the V34 fix wasn't live = admin clinic potentially silent-no-op adjusting full-capacity batches. 4 known historical artifacts on chanel batch (3 user tests yesterday + 1 V34 verify) recoverable via V35 replay-with-new-logic migration script.

Detail: `.claude/rules/v-log-archive.md` V34 entry + `tests/v34-*.test.js` files.

### Session 2026-04-28 session 22+23 (s22+s23 shipped to V15 #3)

User reported 5 issues post-s21. s22 wired StockBalancePanel "ปรับ"/"+" buttons → CentralStockTab navigates with prefillProduct. NEW `CentralOrderDetailModal.jsx`. Both Order panels: clickable rows + inline product summary. s23 added tier-scoped product filter in AdjustCreateForm — central adjust dropdown shows ONLY products with batches at current tier (was leaking branch products → user confusion).

Tests: +61 (39 s22 + 22 s23). All in V15 #3 deploy.

Detail: `.agents/sessions/2026-04-28-session22-23-central-tab-wiring-and-tier-filter.md`

### Session 2026-04-28 session 22+23 (2 commits, NOT deployed) — Central tab wiring + tier-scoped product filter

User reported 4 + 1 issues across two messages:
1. "ระบบปรับ stock ของ tab คลังกลาง มันมั่ว" — wired buttons + (later) tier-scoped product filter
2. "ปุ่ม + ในหน้า ยอดคงเหลือ ของ tab คลังกลาง กดไม่ได้" — wired
3. "ใน tab คลังกลาง การนำเข้าจาก Vendor ให้กดเข้าไปดูรายละเอียด + แสดงสินค้าคร่าวๆ" — NEW CentralOrderDetailModal + inline summary
4. "ใน tab stock ก็เช่นกัน ตรงรายการ Orders" — inline summary in OrderPanel
5. (with screenshot, frustrated) "ในหน้าปรับสต็อคของคลังกลาง เวลากดปุ่มปรับสต็อคใหม่ แล้วมันไปเอาสินค้าจากคลังสาขามาให้เลือก" — TIER-SCOPED PRODUCT FILTER (s23)

**s22 (`25ed70a`)**: CentralStockTab now wires StockBalancePanel callbacks (onAdjustProduct/onAddStockForProduct) → navigates to central subTab='adjust'/'orders' with prefill. CentralStockOrderPanel accepts prefillProduct + auto-opens with items[0] pre-filled. NEW `CentralOrderDetailModal.jsx` (read-only mirror of OrderDetailModal). NEW `src/lib/orderItemsSummary.js` shared helper. Both Order panels: clickable rows + inline "Botox x10 · Filler x5 · +N รายการ" summary.

**s23 (`93c71d6`)**: AdjustCreateForm pre-loads all active batches at current tier, derives unique productIds, filters product dropdown. Branch tier sees only branch-stocked products; central tier sees only central-stocked products. Empty state CTA + loading state. Same legacy-main gate preserved.

**Tests**: 2214 → 2275 (+61: 39 in s22 + 22 in s23). Build clean.

**Bug 3 answer (no code change)**: Vendor data comes from `be_vendors` Firestore collection, populated via existing VendorSalesTab (Phase 14.3).

Detail: `.agents/sessions/2026-04-28-session22-23-central-tab-wiring-and-tier-filter.md`

### Session 2026-04-28 session 21 (2 commits + V15 #2 deploy) — Movement Log architecture corrected to single-tier with counterparty label

User correction (after s20 V15 deploy):
1. "โอนย้ายหรือเบิกของระหว่างสาขาหลักกับคลังกลาง แล้ว movement log ของสาขาหลักไม่ขึ้นเหี้ยไรเลย ยังเป็นอยู่"
   → Bug 2 v3 fix: legacy-main fallback for default branch ID-mismatch (de90130)
2. "stock movement มึงเป็นอันเดียวกัน ซ้ำกันทั้งสองหน้าแล้ว ซึ่งผิด"
   → Bug 2 v4 fix: revert v2/v3 cross-branch alias; single-tier filter + counterparty label (e46eda2)

**v3 (de90130)**: legacy-main fallback in `listStockMovements` + `MovementLogPanel`. Default branch (BR-XXX) view now also matches `branchId='main'` (legacy data from `listStockLocations` hardcoded `id:'main'`). Central tier + non-default branches stay strict.

**v4 (e46eda2)**: corrected architecture per user spec.
- Each movement at OWN tier ONCE (not duplicated on both sides)
- Reader: drop `m.branchIds.some(...)` cross-match; branchId-equality only
- UI: render counterparty label using `branchIds[]` metadata (still written by Phase E):
  - Type 8 (EXPORT_TRANSFER at source): "ส่งออกไป {dest.name}"
  - Type 9 (RECEIVE at destination): "รับเข้าจาก {src.name}"
  - Type 10 (EXPORT_WITHDRAWAL at source): "เบิกโดย {requester.name}"
  - Type 13 (WITHDRAWAL_CONFIRM at destination): "รับเบิกจาก {supplier.name}"
- New helpers: `getCounterpartyId` + `resolveCounterpartyName` (locations → branches → fallback)

**Architecture clarification (locked into institutional memory)**:
The 4 cross-tier movement types remain split into 2 docs (one per tier).
`branchIds[]` is METADATA for label resolution — NOT a cross-branch filter alias.
Counterparty NAME shown in UI but the movement physically lives at its own tier.

**Tests**: 2183 → 2214 (+31). ML.A.3/.G.4 flipped to assert NO `branchIds.some()` (V21 anti-regression). ML.B simulate updated to single-tier. AU.E flipped to single-tier expectations + AU.E.6 added. ML.I (8 source-grep) + ML.I-sim (7 functional) added for counterparty label.

**V15 #2 deploy**: full Probe-Deploy-Probe sequence (pre + post 6/6 + 4/4 ✓; cleanup 4/4 ✓; HTTP smoke 3/3 = 200).

Detail: `.agents/sessions/2026-04-28-session21-bug2-v3-v4-deploy.md`

### Session 2026-04-28 session 20 (V15 combined deploy + 5 post-deploy bug fixes)

User pasted 5 post-s19 bug reports immediately after Phase 15.4 ship.
Auto-mode session shipped 5 fix commits + comprehensive audit + deploy.

**5 post-deploy bug fixes** (all in single sitting):

| # | User words | Commit | Root cause |
|---|---|---|---|
| 1 | "ปุ่มสร้างออเดอร์ใหม่หน้า stock ใช้ไม่ได้ กดเข้าแล้วหน้าจอดำ" | `69a5dd9` | V11: bare `export ... from` is re-export-only; OrderCreateForm referenced `getUnitOptionsForProduct` locally → ReferenceError on form mount |
| 4 | "ปุ่มปรับ stock หน้าคลังกลาง ไปเชื่อมกับ stock สาขา" | `69a5dd9` | Bug-4 cross-tier contamination: `includeLegacyMain: true` always-on pulled 'main' branch-tier batches into central tab. Fix: gate via `deriveLocationType === BRANCH` in 3 stock create forms |
| 2 | "โอนย้าย/เบิกของยังไม่ขึ้นใน Movement log หน้า stock" | `f2b71ec` | Phase E dual-query Promise.all had silent-fail trap. Refactor to client-side branchId filter (`m.branchId === X || m.branchIds.includes(X)`); no composite index, no silent fails |
| 3 | "รายการหน้าปรับสต็อคต้องกดเข้าไปดูรายละเอียดได้เหมือนหน้าอื่นๆ" | `244e909` | NEW AdjustDetailModal mirrors Transfer/Withdrawal pattern. Wires StockAdjustPanel row click → modal. 10 data-testids + V12 backward compat + V22 branch-name resolution |
| 5 | "ตรวจสอบ wiring flow + logic ทุก stock movement" | `ae2ab7e` | Full audit of 12 emit sites: branchId set ✓, 4 cross-branch types have branchIds ✓, reverse spreads `...m` ✓, reader catches all via client-side filter. 22 regression tests lock the architecture |

**Test count**: 2123 → 2183 (+60 across 5 fix commits + audit).

**V15 combined deploy** (this turn — explicit "deploy" authorization):
- Pre-probe: 6/6 positive 200 + 4/4 negative 403 ✓
- Vercel: `--prod --yes` (49s, 911 KB chunk)
- Firestore rules: `--only firestore:rules` (cloud.firestore released)
- Post-probe: 6/6 positive 200 + 4/4 negative 403 ✓
- Cleanup: 4/4 (pc_appointments DELETE x2 + clinic_settings PATCH strip x2)
- HTTP smoke: root + /admin + /api/webhook/line = 200 ✓

**Negative probe list extended**: added `be_central_stock_orders` (Phase 15.2 collection from s18). Probe list now 6 positive + 4 negative permanently.

Detail: `.agents/sessions/2026-04-28-session20-v15-deploy-+-5-post-deploy-fixes.md`



### Session 2026-04-27 session 19 (7 commits, `0792359` → `26ee312`) — Phase 15.4 polish — 7 user-EOD items SHIPPED

User pasted refined 7-item list at start of s19 ("ทำภายใต้กฎของเราอย่างเคร่งครัด").
All 7 mapped 1:1 to commits. Tests 1905 → 2123 (+218). NOT deployed.

**7 commits**:
```
0792359 — Phase A.1 extract UnitField + getUnitOptionsForProduct (+40 tests)
84ce7b0 — Phase A.2 shared Pagination + usePagination hook (+37 tests)
541ad0b — Phase B  pagination 20/page across 6 panels — item 1 (+44 tests)
3bf01c2 — Phase C  transfer + withdrawal 3-role split — items 5+6 (+35 tests)
95336a5 — Phase D  auto-show unit on batch row across 4 forms — item 7 (+23 tests)
94626c8 — Phase E  movement log cross-branch visibility — items 3+4 (+23 tests)
26ee312 — Phase F  batch picker legacy-main fallback — item 2 (+16 tests)
```

**7 items → fix path**:
1. Pagination 20/page recent-first → shared `usePagination` + `<Pagination>` + 6-panel rollout
2. Batch picker bug → `listStockBatches` opt-in `includeLegacyMain: true` (legacy `branchId='main'` fallback)
3. Transfer movements not in stock log → writer adds `branchIds: [src, dst]`; reader dual-queries
4. Withdrawal movements not in stock log → same as 3
5. Transfer detail modal needs ผู้สร้าง+ผู้ส่ง+ผู้รับ → schema +4 fields (dispatchedByUser/At + receivedByUser/At)
6. Withdrawal detail modal 3 roles → schema +4 fields (approvedByUser/At + receivedByUser/At)
7. Auto-show unit on batch row → CentralPO smart UnitField; Adjust/Transfer/Withdrawal read-only unit cell

**Pre-rollout extracts (Rule C1 Rule of 3)**: UnitField + Pagination both extracted to shared modules before being applied across all consumers. OrderPanel migrated; other panels reuse.

**V14 lock everywhere**: `_normalizeAuditUser` for actor fields, `.filter(Boolean)` for branchIds[], no undefined leaves to setDoc.

**V31 no-silent-swallow**: composite-index soft-fails (dual-query Q2) use `console.warn` not silent.

**V21 anti-regression**: every new test file pairs source-grep guards with NEW pattern assertion (not OLD locked-in). One earlier test (`order-panel-branch-id-and-unit-dropdown.test.js` O3.5-.8) flipped from "function UnitField inline" to "import from ./UnitField.jsx" per V21 lesson.

Detail: `.agents/sessions/2026-04-27-session19-phase15.4-7-items.md`



### Session 2026-04-27 session 18 (9 commits, `dba27ad` → `1066711`) — Phase 15.1-15.3 + 5 bug fixes + actor tracking

User directive: "แพลน phase 15 ได้เลย แบบ Multi-branch ภายใต้กฎของเราอย่างเคร่งครัด"
+ multiple bug reports through the day. Day-long arc, 9 commits, 5 bug
classes squashed in flight, +310 tests (1595 → 1905). NOT deployed.

**9 commits**:
```
dba27ad — Phase 15.1 read-only CentralStockTab + V20 multi-branch foundation (+46 tests)
a4307e3 — Phase 15.2 Central PO write flow + Rule C1 _buildBatchFromOrderItem helper (+86 tests)
22cf0b9 — chore: untrack scheduled_tasks.lock
7550c10 — chore: gitignore for lock file
88a2174 — V22-bis seller numeric-id leak fix + resolveSellerName helper (+33 tests)
e65d335 — Phase 15.3 Central adjustments + AdjustForm scope-bug fix (+19 tests)
12d6081 — product picker p.name regression sweep (Phase 14.10-tris fallout, +19 tests)
74985b8 — OrderPanel BRANCH_ID scope + smart unit dropdown (+25 tests)
ece1868 — OrderDetailModal raw branchId → resolveBranchName helper (+20 tests)
1066711 — actor tracking: ActorPicker + ActorConfirmModal + 5 forms + 6 state-flips + MovementLogPanel ผู้ทำ column (+62 tests)
```

**3 entity-name resolver helpers extracted (Rule of 3 trending)**: resolveSellerName · productDisplayName · resolveBranchName — all return `''` (never raw IDs); pattern locked across 9+ render sites.

**Phase 15 status**: 15.1-15.3 ✅ shipped. 15.4 (central→branch dispatch) + 15.5 (withdrawal approval admin endpoint + manual fallback) queued.

**7 user-reported items queued for next session** (Phase 15.4+ + UX):
1. Pagination 20/page recent-first — all stock+central tabs
2. Batch picker bug in StockAdjustPanel (legacy branchId='main' vs new BR-XXX)
3. Transfer/Withdrawal movements not appearing in Stock Movement Log (only Central)
4. Same as 3 for withdrawals
5. Transfer detail modal needs ผู้สร้าง+ผู้ส่ง+ผู้รับ (3 actor roles)
6. Auto-show unit on batch row in all create forms (extend OrderPanel pattern from 74985b8)
7. ActorPicker dropdown filter by `staff.branchIds[]`/`doctor.branchIds[]` (schema exists)

Detail: `.agents/sessions/2026-04-27-session18-phase15-1-2-3-plus-fixes.md`

### Session 2026-04-27 session 17 (1 commit, `75bbc38`) — V33.9 orphan QR cleanup + V33.10 prefix enforcement + Live QA runbook

User authorized "เก็บให้หมดเตรียมไป 15 เลย ทำภายใต้กฎอย่างเคร่งครัด"
(clean it all up, prepare for Phase 15, strictly under the rules) — chose
"Everything" scope (orphan QR + prefix enforcement + QA prep).

**V33.9 — Orphan QR-token plumbing cleanup**:
DELETED:
- `api/admin/customer-link.js` (token mint endpoint)
- `src/lib/customerLinkClient.js` (token mint client)

REMOVED:
- `lineBotResponder.js`: generateLinkToken function + LINK-`<token>` regex
  in interpretCustomerMessage + intent type 'link' + LINK_SUCCESS /
  LINK_FAIL_INVALID / LINK_FAIL_EXPIRED / LINK_FAIL_ALREADY_LINKED messages
  (TH + EN dicts) + formatLinkSuccessReply + formatLinkFailureReply functions
- `api/webhook/line.js`: consumeLinkToken function + intent === 'link' branch
  + 2 stale imports
- `firestore.rules`: be_customer_link_tokens match block (default-deny applies
  to ghost docs; client SDK still locked)
- `tests/branch-collection-coverage.test.js`: be_customer_link_tokens entry
  in COLLECTION_MATRIX

PRESERVED (V33.4 admin-mediated id-link flow):
- id-link-request intent + payload (national-id + passport detection)
- be_link_requests + be_link_attempts collections + rules
- LinkRequestsTab admin queue UI + LinkLineInstructionsModal
- formatLinkRequestApprovedReply + formatLinkRequestRejectedReply

Behavior change: customers DM'ing old "LINK-<token>" QR codes hit 'unknown'
intent → silent ignore. The window of issued QR codes was tiny (<24h between
V33.4 redesign launch and this cleanup); admin-mediated id-link is now sole
linking mechanism.

**V33.10 — TEST-/E2E- customer ID prefix enforcement**:
- NEW `tests/helpers/testCustomer.js`: createTestCustomerId({prefix, suffix,
  timestamp}) + isTestCustomerId + getTestCustomerPrefix +
  TEST_CUSTOMER_PREFIXES (frozen). Codifies V33.2 directive after 53
  untagged test customers polluted production data.
- NEW section in `.claude/rules/02-workflow.md` — convention + helper
  usage example + anti-pattern lock.
- Drift catcher: tests/v33-10-test-customer-prefix.test.js E1+E2 assert
  the rule + helper file are present.

**Live QA runbook**:
- NEW `.agents/qa/2026-04-27-line-oa-checklist.md` — structured tick-off
  for V33.6 + V33.7 + V33.8 + V33.9 mobile verification. Sections:
  pre-flight + V33.6 no-truncation + V33.7 i18n + V33.8 zero-remaining
  + V33.9 orphan regression + admin "ผูกแล้ว" actions + smoke +
  failure-report template.

**Tests**: NEW v33-9-orphan-qr-cleanup.test.js (37 tests, A-G groups)
+ v33-10-test-customer-prefix.test.js (21 tests). Plus carry-over fixups
in v32-tris-ter-line-bot-flow + v32-tris-ter-line-bot-fix +
v33-7-line-bot-i18n + v33-4-line-bot-bare-id-and-exact-match +
v32-tris-quater-id-link-request (drop V33.5 token-flow assertions).
Total: 1576 → 1595 (+19 net).

**Verification**:
- npm test --run: 1595/1595 green
- npm run build: clean, BD 995.30 KB (≈ unchanged)
- Pre-probe 6/6 + 3 negative GREEN
- Post-probe 6/6 + 3 negative GREEN
- HTTP smoke 3/3 = 200

**1 commit**: `75bbc38`

Detail: this V-entry + commit body.

### Session 2026-04-27 session 16 (1 commit, `14396ab`) — V33.8 zero-remaining filter

User report (mobile screenshot 12:03): bot's "Active Courses" bubble
showed "Acne Tx 12 ครั้ง / Remaining 0 / 3 amp." + "HIFU 500 Shot... /
Remaining 0 / 1 Shot" + "Allergan 100 unit / Remaining 0 / 100 U" — courses
with 0 remaining were leaking into the active list AND the "199 รายการ"
header count.

**Root cause**: ProClinic doesn't auto-flip course.status to 'ใช้หมดแล้ว'
when remaining hits 0/X — status stays 'กำลังใช้งาน'. V33.5/.6/.7 active
filter checked status only, so consumed courses leaked through.

**Fix** (numeric guard on top of status filter):
- NEW exported pure helpers in `lineBotResponder.js`:
  - `parseRemainingCount(qty)` — parses leading number from "0/3 amp.",
    "100 / 100 U", "0.5/1", single "5", numeric `0`, or buffet patterns
    ("เหมาตามจริง" / "buffet" → null = uncountable)
  - `isCourseConsumed(course)` — checks qty first, falls back to remaining
- `formatCoursesReply` + `buildCoursesFlex` filter:
  ```
  statusOk && !isCourseConsumed(c)
  ```
- Header count "N รายการ" / "N items" reflects FILTERED active set
- Buffet courses + unparseable strings keep through (defensive)

**Tests**: +46 in V33.8.A-F (parseRemainingCount + isCourseConsumed +
formatCoursesReply hides + buildCoursesFlex hides + screenshot-regression
+ source-grep guards).

**Carry-over test fixups** (qty='0/X' patterns now filtered):
- V33.5.C4: Course B `0/3` → `1/3`
- V33.6 SAMPLE: Acne Tx `0/3` → `2/3`
- V33.6.B9: meta line assertion to `2 / 3 ครั้ง`
- V33.6.E6: array generator `i+1/i+6` (skip i=0 case)
- V33.6.E9: flipped — qty=0 numeric now FILTERS as consumed (was rendered)

**Verification**:
- npm test --run: 1530 → 1576, all green
- npm run build: clean, BD 995.30 KB (≈ unchanged)
- Pre+Post probes 6/6 + 3/3 GREEN; HTTP smoke 3/3 = 200

**1 commit**: `14396ab`

### Session 2026-04-27 session 15 (1 commit, `2ff8803`) — V33.7 TH/EN i18n + full-date + admin language toggle

User shipped 3 directives in one go (post-V33.6 mobile success):
1. **Date format**: appointment bubble + replies use full weekday +
   full month name. TH `อังคาร 28 เมษายน 2569` / EN `Tuesday 28 April 2026`.
2. **Auto-language**: foreign customers (`customer_type === 'foreigner'`)
   auto-receive EN bot replies. Default 'th'. Stored `lineLanguage` field
   wins over auto-derive.
3. **Admin toggle**: TH/EN segmented pill in 2 surfaces:
   - LinkLineInstructionsModal (CustomerDetailView "ผูก LINE")
   - LinkRequestsTab "ผูกแล้ว" sub-tab — per-row inline

Plus V33.6 follow-up: "หมดอายุ -" leak fix (formatThaiDate output now
also filtered via isMeaningfulValue, so non-ISO inputs like "6/2027"
no longer render dangling suffix).

**Architecture**:
- Single `MESSAGES = { th: {...}, en: {...} }` dict in lineBotResponder.js
- `getLanguageForCustomer(c)` priority: `lineLanguage` > `customer_type='foreigner'` > 'th'
- `formatLongDate(iso, lang)` via `Intl.DateTimeFormat` + Buddhist calendar;
  Thai output normalized (strip "วัน" prefix + "พ.ศ." suffix)
- 13 reply functions + 3 Flex builders all accept language param (default 'th')
- Webhook threads `lang` from customer doc; pre-link paths default 'th'

**Rule C1 extract**: NEW `LangPillToggle.jsx` reusable segmented pill.
3rd consumer (LinkLineInstructionsModal + LinkRequestsTab + DocumentPrintModal)
triggered the extract; old inline pattern in DocumentPrintModal refactored.

**Tests**: +91 new
- `tests/v33-7-line-bot-i18n.test.js` (76): A getLanguageForCustomer +
  B formatLongDate + C reply funcs + D Flex i18n + E หมดอายุ smart-hide +
  F webhook threading + G customer-line-link action + H client helper +
  I customerValidation + J UI source-grep
- `tests/v33-7-lang-pill-toggle.test.jsx` (21): LP1 render + LP2 active +
  LP3 onChange + LP4 disabled + LP5 adversarial + LP6 labelFn
- Updated v33-6 C2 + v32-tris-ter L4.3/L4.4/L4.6 (long-form date assertions)

**Files**:
- src/lib/lineBotResponder.js — MESSAGES + helpers + 13 reply + 3 Flex refactor
- src/lib/customerValidation.js — FIELD_BOUNDS lineLanguage + normalize coerce
- src/lib/customerLineLinkClient.js — updateLineLinkLanguage helper
- api/admin/customer-line-link.js — 'update-language' action + list-linked exposes lineLanguage
- api/webhook/line.js — getLanguageForCustomer + lang threading on 3 sites
- src/components/backend/LangPillToggle.jsx — NEW shared pill
- src/components/backend/LinkLineInstructionsModal.jsx — toggle at top
- src/components/backend/LinkRequestsTab.jsx — per-row toggle in "ผูกแล้ว"
- src/components/backend/DocumentPrintModal.jsx — refactor to shared toggle

**Verification**:
- npm test --run: 1439 → 1530, all green
- npm run build: clean, BD 995.30 KB (≈ unchanged)
- Pre+Post probes 6/6 + 3/3 GREEN
- Production HTTP smoke 3/3 = 200

**1 commit**:
```
2ff8803 feat(line-oa): V33.7 — TH/EN i18n + full-date format + admin language toggle
```

### Session 2026-04-27 session 14 (1 commit, `380f05d`) — V33.6 mobile Flex no-truncation

User reported via mobile screenshots (03:33): V33.5 Flex Bubbles
truncated critical data on mobile LINE viewer:
- Course "คงเหลือ" col: "0 / 3 a..." (vs "0 / 3 ครั้ง")
- Course "หมดอายุ" cell: "เหมาตา..." (vs "เหมาตามจริง")
- Appointment "เวลา": "10:00–10..." (vs "10:00–10:30")
- Doctor name in red (Rule 04 spirit: red on names = ชื่อคนตายฯ)

User constraint: "ไม่อยากแก้หลายรอบเพราะ deploy มันเสียตังทุกครั้ง" —
fix must be definitive, no V33.7 round 2.

**Root cause**: horizontal table flex:5/2/2 + wrap:false on data cells.
Mega bubble ~290px - padding → cols ~[116, 47, 47]px. wrap:false +
narrow column made LINE auto-truncate Thai/Latin mixed strings.

**Fix**: eliminate truncation as a bug CLASS (not patch one ratio):
- Course rows: horizontal 3-col table → vertical-stacked card per row.
  Name (bold, full width, wrap:true) on top; "คงเหลือ X · หมดอายุ Y"
  inline meta below. NEW exported helper `buildCourseMetaLine()`.
- Appointment date+time: combined horizontal row → two stacked sub-rows
  (📅 own line, 🕐 own line). Time always full width, never truncates.
- Provider color: `accentColor` (#dc2626 red) → `#222222` dark. Rule 04
  spirit; clinic-red preserved on header band only.
- Column-header table row dropped (data is self-labeled inline).

**Tests** (Rule I full-flow simulate): +54 across V33.6.A-G:
- A buildCourseMetaLine pure helper — 10 tests
- B course bubble structural contract — 10 tests
- C appt date+time split layout — 7 tests
- D provider color #222 (Rule 04) — 5 tests
- E adversarial inputs (no truncation possible) — 12 tests
- F source-grep regression guards — 6 tests
- G backward compat (existing exports + empty paths) — 4 tests
Plus 5 V33.5 shape-lock updates (C6/D1/D2/D3/E5).

**Verification**:
- npm test --run: 1385 → 1439, all green
- npm run build: clean, BD 994 KB (≈ unchanged)
- Pre-probe 6/6 + 3/3 GREEN, post 6/6 + 3/3 GREEN
- Production HTTP smoke: 3/3 = 200

**1 commit**:
```
380f05d feat(line-oa): V33.6 — Flex bubble vertical-stacked rows (mobile no-truncation)
```

Detail: this V-entry + commit body.

### Session 2026-04-27 session 13 EOD2 (8 commits, `1f0faff` → `ea8a09c`) — Customer create/edit + LINE-OA full redesign

Three deploys to production via V15 combined: V33+V33.2 (b4326c3), V33.3
(2cc67ef), V33.4+V33.5 (231b2f5). Five V-entries across one session.

**8 commits**:
```
1f0faff feat(customer): V33 — Add Customer modal + 89 fields + HN counter + storage rules V26
b4326c3 feat(customer): V33.2 — modal→page + DateField + blood types + receipt wiring + 53 cleanup
b2193b3 docs(handoff): V33+V33.2 deployed (b4326c3 LIVE)
2cc67ef feat(customer): V33.3 — Edit Customer page + profile card surgery
1516786 docs(handoff): V33.3 deployed (2cc67ef LIVE)
db8ea42 feat(line-oa): V33.4 — bot exact-match + bare-ID + LinkLineInstructions + suspend/unlink
231b2f5 feat(line-oa): V33.5 — Flex bot replies + doctor in appointments + smart-display
ea8a09c docs(handoff): V33.4+V33.5 deployed (231b2f5 LIVE)
```

**5 V-entries** (V33 → V33.5) — full detail in
`.agents/sessions/2026-04-27-session13-customer-create-and-line-oa-redesign.md`.

**Tests**: 1096 → 1385 (+289 across V33 159 + V33.2 24 + V33.3 23 + V33.4 42 + V33.5 41).

**Probe-Deploy-Probe** (each of 3 deploys): pre 6/6 + 3/3 negative GREEN,
post 6/6 + 3/3 negative GREEN, cleanup 4/4 = 200, smoke 3/3 = 200.

### Session 2026-04-27 session 12 EOD (4 commits, `203581f` → `66ab18b`) — V32-tris-ter-fix + V32-tris-quater LINE OA completion
User chain across the session: production-test bug reports → CORS-proxy fix
+ webhook admin SDK switch → user-asked easier-link options → built
admin-mediated "ผูก [เลขบัตร]" flow + edit-customer-IDs modal → deployed
both via V15 combined Probe-Deploy-Probe.

**4 commits**:
```
203581f fix(line-oa): V32-tris-ter-fix — CORS proxy + webhook admin SDK
cb387c3 feat(line-oa): V32-tris-quater — admin-mediated ID link request
66ab18b docs(handoff): V32-tris-quater deployed (cb387c3 LIVE; rules v16)
```

**2 user-reported production bugs fixed**:
1. **"ทดสอบการเชื่อมต่อ" Failed to fetch** — browser CORS block on
   api.line.me. Fixed via `api/admin/line-test.js` proxy + Firebase
   ID-token wrapper.
2. **LINK token always rejected** — webhook unauth REST blocked by rules.
   Fixed by switching webhook to firebase-admin SDK for be_* paths.

**1 net-new feature (V32-tris-quater)** — admin-mediated approval flow:
- Customer DM `ผูก 1234567890123` (Thai ID) or `ผูก AA1234567` (passport)
- Bot rate-limit (5/24h) + customer lookup via admin SDK + same-reply
  anti-enumeration ack regardless of match
- Admin queue UI (LinkRequestsTab) with filter tabs + approve/reject
  buttons + batch atomic write (customer.lineUserId + request.status)
- LINE Push notifications on approve/reject
- New EditCustomerIdsModal (focused nationalId + passport editor)
  reachable from CustomerDetailView "เลขบัตร" button
- 71 adversarial tests + 3 cascade fixes (nav count, COLLECTION_MATRIX)

**107 new tests** (1025 → 1096): V32-tris-ter-fix 36 + V32-tris-quater 71

**2 deploys via V15 combined**:
- `203581f` — Vercel `lover-clinic-blbt9szsh` + rules v15
- `cb387c3` — Vercel `lover-clinic-ow7hhv2lk` + rules v16 (NEW collections)

**Probe-Deploy-Probe verification (cb387c3 deploy)**:
- Pre 6/6 = 200, Post 6/6 = 200
- Negative 4/4 = 403 (be_customer_link_tokens + be_course_changes +
  be_link_requests + be_link_attempts all locked down)
- Cleanup 4/4 = 200, Production HTTP smoke 3/3 = 200

Detail: `.agents/sessions/2026-04-27-session12-line-oa-completion.md`

### Session 2026-04-26 session 11 (P1-P3 ALL: T3.e + T4 + T5.b + T5.a — pending commit)
User: "ทำทั้งหมด" (do all P1-P3 from session 10's queue). Shipped 4 deferred Tier 3 features in one session:

**T3.e — Email + LINE document delivery** (was BLOCKED on user config in session 9):
- New `api/admin/send-document.js` (admin-gated POST). Body `{type:'email'|'line', recipient, pdfBase64, ...}`.
  - Email path: nodemailer SMTP — config from `clinic_settings/email_config` (host/user/pass/from)
  - LINE path: reuses existing `chat_config.line.channelAccessToken` from webhook/send.js
  - 503 + `code:'CONFIG_MISSING'` when admin hasn't configured yet (UI surfaces friendly Thai error)
  - 10 MB PDF cap; nodemailer dynamically imported (Vercel function size)
- New `src/lib/sendDocumentClient.js` (Firebase ID-token auth wrapper + blob→base64 helper).
- DocumentPrintModal: 2 new buttons "ส่ง Email" + "แจ้ง LINE" with progress + success/error banner. PDF render is intercepted (suppress download click) so the same engine path can both download AND email.
- Tests: 26 in `tests/t3e-send-document.test.js` (helper unit + modal source-grep + server source-grep guards).

**T4 — Course exchange + refund** (Phase 14.4 G5):
- New `src/lib/courseExchange.js` — pure helpers: `findCourseIndex`, `applyCourseExchange`, `applyCourseRefund`, `buildChangeAuditEntry`.
- New `backendClient.exchangeCustomerCourse(...)` + `refundCustomerCourse(...)` — atomic via runTransaction; both write `be_course_changes` audit entry inside the same tx so the customer.courses[] mutation + audit log can never diverge.
- New `backendClient.listCourseChanges(customerId)` — for showing exchange/refund history per customer.
- New `firestore.rules` block for `be_course_changes` (append-only — read+create OK for clinic staff, update+delete forbidden — mirrors be_document_prints / be_stock_movements).
- Tests: 39 in `tests/t4-course-exchange-refund.test.js` (T4.A-F: helpers, exchange, refund, audit, backendClient wiring, firestore rule shape).

**T5.b — TreatmentFormPage refactor** (4676 LOC tech debt):
- Extracted billing math + BMI + baht formatter into `src/lib/treatmentBilling.js` — `computeTreatmentBilling()`, `computeBmi()`, `formatBaht()`. Pure functions, easy to unit-test without mounting the 119-useState component.
- TFP `useMemo(() => billing-calc...)` block went from 40+ LOC inline to a 1-call delegation.
- Tests: 35 in `tests/t5b-treatment-billing.test.js` covering subtotal/medSubtotal/medDisc/billDisc/insurance/membership/deposit/wallet/clamp branches in BOTH backend mode + legacy mode + adversarial inputs.

**T5.a — Visual template designer MVP** (mega XL drag-drop deferred to follow-up):
- DocumentTemplateFormModal gained: live preview pane (sample-data render via DOMPurify-sanitized), quick-insert placeholder bar (clicks insert at textarea cursor with cursor restore), reorder up/down buttons per field row (disabled at edges).
- Tests: 21 in `tests/t5a-template-designer-mvp.test.jsx` (source-grep + RTL: insert at cursor, toggle preview, reorder, edge cases).

**Test fix this session**:
- `tests/branch-collection-coverage.test.js` BC1.1 — added `be_course_changes` to COLLECTION_MATRIX (scope: 'global'); without this the new collection would fail the matrix-spans-rules invariant.

**Production deploy**: 7 commits unpushed-to-prod (b2784cf is prod). Awaiting "deploy".

### Session 2026-04-26 session 10 (V32-tris + M9 reconciler — pending commit)
4 user-reported issues fixed this session:
1. **V32 base** — Bulk PDF blank 2nd page + text floating above underline (V21-class regression — round 1+2)
2. **V32-tris rounds 3+4** — date alignment STILL not right after inline-flex; user "ต้องเอาขึ้นอีกนิด" → switched to position:absolute inner span at bottom:10px + CSS padding-bottom:10px for ~10px clear breathing room
3. **Smart staff picker missing in BulkPrintModal** — user "ทำแบบฉลาดๆ smart อะ" → extracted `StaffSelectField` + `documentFieldAutoFill.js` shared module; both modals now use them; **bonus fix**: original DocumentPrintModal's auto-fill never fired (onChange called with 1 arg instead of 2)
4. **M9 admin reconciler button** — P1 polish queue item; admin-gated card in PermissionGroupsTab with progress + success/failure UI
- New files: `src/lib/documentFieldAutoFill.js`, `src/components/backend/StaffSelectField.jsx`, 4 new test files
- Modified: documentPrintEngine.js (direct html2canvas+jspdf, applyPdfAlignmentInline wrapper approach), DocumentPrintModal.jsx (uses shared module), BulkPrintModal.jsx (smart picker + auto-fill), PermissionGroupsTab.jsx (M9 card)
- package.json: html2canvas + jspdf promoted from transitive to direct deps
- Tests: 5984 → 6005 (+21 new test files / +105 tests, all green); 9/9 e2e public-links pass; build clean

---

### Older sessions (1-line summaries — full detail in `.agents/sessions/*` checkpoints)

| Date | Session | Highlights |
|---|---|---|
| 2026-04-26 | s9 EOD | 8 commits, V31 + Phase 14.8/9/10 + 20-file master_data → be_* migration. `.agents/sessions/2026-04-26-session9-V31-phase14.8-10-master-data-migration.md` |
| 2026-04-26 | s8 EOD | 27 commits — Phase 13.5.4 hard-gate END-TO-END (V23-V30) + UC1 + Tier 2 |
| 2026-04-26 | s7 | 2 commits — Phase 13.5.4 Deploy 1 + V24 schedule sync fix |
| 2026-04-26 | s6 | 1 commit — V23 P0 hotfix anon QR/link patient submit |
| 2026-04-26 | s5 | 10 commits — Phase 13.2.6-13.2.16 ProClinic schedule replication |
| 2026-04-26 | s4 | 4 commits — Polish batch + Phase 13.5 permission system |
| 2026-04-26 | s3 | 5 commits — 24h pre-launch pass |
| 2026-04-26 | s2 | 3 commits — Phase 14.7.H follow-ups D-G |
| 2026-04-26 | s1 EOD | full session — Phase 14.7.C-G + V19 + multi-branch infra (V20) |
| 2026-04-25 | s0 | Phase 14.6 doc-print UX overhaul + Phase 14.7 customer-page appointments |

## What's Next

### Primary: ALL DEPLOYED — production at `093d4d9` ✅
V15 combined deploy completed 2026-04-26 EOD. 11 commits shipped (`7a9c62d`
→ `093d4d9`). Pre+post probes 200/200/200/200. master 1 commit ahead with
V16 anti-regression public-link spec only — no production code change.

If user wants to extend: see P1/P2 polish below.

### P1 polish queue — drained this session
- ✅ Pick-at-treatment partial-pick reopen — DONE (`55b5919`)
- ✅ `listenToHolidays` + bounded `listenToAllSales` — DONE (`b1032bf`)
- ✅ Debug-level logging for ProClinic API silent-catch — DONE (`65ba420` + extended in `b870b40`)
- (deferred) TreatmentTimelineModal virtualization — only if 122-row customer reports lag (not observed yet)

### P2 polish remaining (defer until next pre-launch pass)
- ✅ IIFE JSX refactor at TFP — DONE (`5b790e4`)
- ✅ BackendDashboard code-split — DONE (`4d4529b`, -26% bundle)
- (skip) Remaining brokerClient silent catches (lines 54, 233, 245, 253) — verified false positive: sessionStorage/extension-postMessage best-effort caching with zero functional impact; logging would be noise
- TFP 3200 LOC refactor — split into 7-8 sub-components (high leverage, M-XL effort, defer)
- UC1 weekend red labels in calendar — cultural review (borderline, calendar weekend coloring is global convention)
- M9 customer doc summary drift — mitigated by tx-log; nightly reconciler implicit
- Doc 10/11/12 ProClinic-fidelity sweep — our-own designs; no immediate ProClinic-parity demand
- Permission system end-to-end (Phase 13.5 deferred) — `hasPermission(user, key)` gate at every tab render entry. Needs user input on permission group definitions before implementation.

### P3 explicitly out-of-scope
- AV6 open Firestore rules — all justified by webhook/extension/public-link needs (locked by Rule B comments)

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

None code-side. Production at `9169363` LIVE + verified (vercel +
firestore rules deployed; pre+post-probe 200/200/200/200; production
HTTP 200 on all 3 routes).

Optional follow-ups (not blockers):
- **Permission group customization**: 5 default groups seeded
  (gp-owner / gp-manager / gp-frontdesk / gp-nurse / gp-doctor). User
  can edit via PermissionGroupsTab; assignments via StaffFormModal.
- **ProClinic schedule sync**: now LIVE in production. User can click
  MasterDataTab → "ดูดตารางหมอ + พนักงาน จาก ProClinic" → "นำเข้า
  master_data → be_staff_schedules" to populate real schedule data.
  Today's-Doctors panel + DoctorSchedulesTab calendar will reflect
  immediately via the live listener.

---

## Blockers

None. Production at `093d4d9` LIVE + verified.

---

## Known Limitations / Tech Debt (carry over)

- **Doc 13/15 deferred to Phase 16** — chart (canvas drawing) / treatment-template (dental chart) are graphical surfaces beyond seed templates.
- **Phase 14.4 G5 customer-product-change NOT STARTED** — bigger feature (course exchange + refund). XL effort.
- ~~Pick-at-treatment partial-pick reopen~~ — ✅ **DONE** in `55b5919` (Phase 14.7.H-I) — last V12.2b deferred item closed.
- ~~Period enforcement (V12.2b)~~ — ✅ **DONE** in `7a9c62d` (Phase 14.7.H-E).
- ~~Hook-order TDZ JSDoc guard~~ — ✅ **DONE** in `7a9c62d` (Phase 14.7.H-G).
- ~~Bundle listenToCustomerFinance~~ — ✅ **DONE** in `7a9c62d` (Phase 14.7.H-F).
- ~~ProClinic API silent-catch logging~~ — ✅ **DONE** in `65ba420` (Phase 14.7.H-J) — debugLog helper + 9 highest-value sites wired; remaining brokerClient catches verified false-positive (sessionStorage best-effort).
- **Phase 14.8/9/10/11 print-form roadmap** — pre-flight + signature canvas + PDF export + audit log + watermark + email/LINE delivery + bulk print + QR embed + visual designer. Tracked in `~/.claude/projects/F--LoverClinic-app/memory/project_print_form_world_class_roadmap.md`. XL each, defer.
- **DocumentPrintModal `dangerouslySetInnerHTML`** — XSS risk if admin types hostile template HTML. Need DOMPurify. Audit P1.
- **FileUploadField URL.createObjectURL** — never revoked → memory leak on repeated uploads. Audit P1.

---

## Violations This Session

None new. Session 3 built on prior V13/V14/V18/V19/V20/V21 lessons:
- **V13** helper-tests-not-enough → applied via Rule I full-flow simulate
- **V14** undefined-reject → no Firestore writes added
- **V18** deploy-without-asking-third-repeat → user said "deploy" verbatim before V15 combined deploy
- **V19** rule-vs-callers → no firestore.rules changes this session
- **V20** multi-branch decision (Option 1) → no re-debate; honored
- **V21** source-grep-locks-broken-behavior → AB6 IIFE refactor tests pair shape grep with runtime outcome via preview_eval

---

## Resume Prompt

Paste this into the next Claude session (or invoke `/session-start`):

```
Resume LoverClinic — continue from 2026-04-29 EOD (session 28).

Read in order BEFORE any tool call:
0. Skill(skill="using-superpowers")  ← Rule J session boot (NEW 2026-04-29)
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=28308ad, prod=c36888e — 24 commits unpushed)
3. .agents/active.md (3312 tests pass; bundle NOT deployed)
4. .claude/rules/00-session-start.md (iron-clad A-J + V-summary)
5. .agents/sessions/2026-04-29-session28-phase15.7-family.md

Status: master=28308ad, 3312/3312 tests pass, prod=c36888e LIVE (V15 #4).

Next: V15 #7 combined deploy when authorized. 24 commits ready (Phase 15.7 base→novies family + Rule J superpowers boot).

After deploy: run /api/admin/cleanup-phantom-branch action:list → action:delete to nuke 49 BR-1777095572005-ae97f911 phantom-branch docs + 2 staff updates. Live QA: assistants picker · advisor dropdown · location lock · customer-name new-tab · appt delete button · negative stock badge.

Outstanding (admin): V15 #7 deploy auth · phantom-branch cleanup execution · LineSettings creds · customer ID backfill · TEST-/E2E- prefix discipline.

Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe Rule B; Rule J skill auto-trigger.

/session-start
```

---

## How to use this file

- `/session-end` skill auto-updates it. If editing manually, keep under ~250 lines.
- Detail lives in `.agents/sessions/YYYY-MM-DD-*.md` checkpoints.
- Resume Prompt block is the KEY output — user pastes into new chat to boot.
- Committed to repo (not memory-only) → team-visible + cross-machine synced.
