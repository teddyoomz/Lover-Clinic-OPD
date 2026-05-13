# Session 2026-05-13 LATE — Phase 26.2f Mirror + Vitals-Save + 3 followups

## Summary

Phase 26.2f shipped via 10-task subagent-driven execution (vitals-save workflow + TreatmentReadOnlyMirror + AV39 audit). Three user-reported followups landed after real-UI testing surfaced bugs the test bank missed. Final followup (`6d134a5`) is the REAL crash fix — `formatThaiDateFull` choked on Firestore Timestamp objects, returning raw objects to React as JSX children → black screen. 50 commits ahead of prod. Phase 26.2g-fillin brainstormed but not yet executed (user pivoted to crash priority).

## Current State

- master = `6d134a5` · prod = `ccef3c2` (50 commits ahead — not deployed)
- 8447 tests + 1 skipped + 0 fail. Build clean.
- Phase 26.0 + 26.1 + 26.2 + 26.2f all LIVE on master only.
- 1 known intermittent flake (Phase 17.1 cross-branch-import-rtl under full-suite load).

## Commits this session

```
6d134a5 fix(Phase 26.2f-followup3): REAL crash fix — Firestore Timestamp handling
b127961 fix(Phase 26.2f-followup2): Mirror defensive guard + ใบรับรองแพทย์ RIGHT + purple
68b4bb6 fix(Phase 26.2f-followup): 5 TFP UX fixes — history sort, vitals gate, layout, style
ecf0924 docs(Phase 26.2f Task 10): wiki + log + SESSION_HANDOFF + active.md
39b38ae fix(Phase 26.2f-pre Task 10-pre): S2.5 V21-class fixup
33249bc feat(Phase 26.2h/Task9): AV39 audit invariant
ce199ee feat(Phase 26.2g Task 8): wire Mirror into TFP split-screen
cfa42da test(Phase 26.2f Task 7): M1 source-grep + M2 RTL test banks
c925c5a fix(Phase 26.2f Task 6-fixup): align Mirror testids with plan
591ab88 feat(Phase 26.2f Task 6): TreatmentReadOnlyMirror component (~947 LOC)
d1a3f66 test(Phase 26.2f-pre/Task5): vitals-save test bank
1b8938c feat(Phase 26.2f-pre Task 4): vitals-recorded chip
770db92 feat(Phase 26.2f-pre/Task3): vitals-save button + gates
c59ac43 feat(Phase 26.2f/Task2): handleSubmit saveMode='vitals'
ed55b37 feat(Phase 26.2f-pre Task 1): move หมายเหตุทั่วไป to LEFT col
```

## Files Touched (names only)

Source modified:
- src/components/TreatmentFormPage.jsx (layout reorder + vitals-save button + handleSubmit branch + canAddNewItems + doctor-save gate + Mirror wiring)
- src/components/backend/TreatmentReadOnlyMirror.jsx (NEW ~947 LOC; toDateSafely added in followup3)
- src/components/backend/TreatmentReadOnlyPanel.jsx (vitalsigns-recorded chip)
- src/components/backend/CustomerDetailView.jsx (vitalsigns-recorded chip)

Tests new:
- tests/phase-26-2f-pre-vitals-save-source-grep.test.js
- tests/phase-26-2f-pre-vitals-save-rtl.test.jsx
- tests/phase-26-2f-pre-vitals-save-flow-simulate.test.js
- tests/phase-26-2f-mirror-source-grep.test.js
- tests/phase-26-2f-mirror-rtl.test.jsx

Tests modified (V21 fixups): tests/audit-branch-scope.test.js (AV37.12-17 + AV39) · tests/treatment-stock-diff.test.js (S2.5 gate extension) · tests/phase-26-0-* regex windows.

Docs:
- docs/superpowers/specs/2026-05-13-phase-26-2f-tfp-readonly-mirror-design.md
- docs/superpowers/plans/2026-05-13-phase-26-2f-tfp-readonly-mirror.md
- wiki/concepts/tfp-readonly-mirror.md
- wiki/log.md (Phase 26.2f entry)
- .agents/skills/audit-anti-vibe-code/SKILL.md (AV37 extension + AV39 NEW)

## Decisions (one-liner each)

- Mirror approach A locked (NEW component mirroring TFP layout, faster + safer than refactoring TFP itself).
- Chart canvas → render saved images zoomable via Lightbox (no editor canvas).
- Vitals-save = create-only (mirror Phase 26.0d pattern); button teal #2EC4B6, Activity icon.
- Doctor-save edit-mode enabled when status='vitalsigns-recorded' (3-stage workflow).
- Status state machine: vitals → doctor → null/complete; recordedBy/recordedAt shared forensic fields.
- canAddNewItems extended to recognize BOTH 'doctor-recorded' AND 'vitalsigns-recorded'.
- Panel + Mirror co-exist: Panel for TimelineModal (condensed per-row); Mirror for TFP split-screen (comprehensive).
- AV37 extended (saveMode='vitals' = 5th locked-X family member); AV39 NEW (Mirror read-only contract: all inputs disabled + no save text + no edit props).
- followup #1: history sort tiebreak by createdAt.toMillis() + treatmentId/id lex desc (fixes "ล่าสุด" pointing at wrong tab when same date).
- followup #1: doctor-required validation at TFP:2029 gated to `saveMode === 'staff'` (was firing on vitals-save + doctor-save too).
- followup #2: ใบรับรองแพทย์ moved LEFT → RIGHT col before doctor-save button (visual alignment).
- followup #2: doctor-save color teal → royal purple #7c3aed (distinct from vitals-save teal).
- followup #3 (REAL crash fix): NEW `toDateSafely(value)` helper handles Firestore Timestamp objects (.toDate / .toMillis / {seconds,nanoseconds} / Date / string-number). Returns null on unrecognized → formatters return '—' (safe string), never raw object. Companion to extractDisplayString.

## Phase 26.2g-fillin brainstorming (NEXT CHAT — design proposed, not approved)

User reports TFP create mode doesn't auto-fill chronic disease / drug allergy / food allergy from customer's patientData. Q1 locked: data lives in structured `patientData` fields (NOT customer.note — PatientForm doesn't write to note).

Proposed design (awaiting approval):
- NEW `src/lib/patientHealthMapping.js` with 2 pure helpers
- `derivePatientCongenitalDisease(pd)` from `hasUnderlying + ud_diabetes/hypertension/lung/kidney/heart/blood/other + ud_otherDetail` → comma-separated Thai labels
- `derivePatientTreatmentHistory(pd)` from `currentMedication + pregnancy` → " / "-joined parts
- TFP load useEffect at lines ~1018-1019 extends auto-fill: setCongenitalDisease + setTreatmentHistory (create mode only, mirrors existing bloodType + drugAllergy auto-fill)
- ~12-15 NEW test assertions: helpers unit (all flag combos) + source-grep + flow-simulate

## Next Todo

Choose ONE in next chat:

1. **Approve Phase 26.2g-fillin design + writing-plans + execute** (recommended — user already drafted scope).
2. **Deploy combined 50 commits** — `vercel --prod` + `firebase deploy --only firestore:rules` per V15.
3. **New direction** — user specifies different priority.

## Resume Prompt

See SESSION_HANDOFF.md Resume Prompt block (master=6d134a5).
