---
updated_at: "2026-05-13 EOD — Phase 26.2g-fillin-bis SHIPPED (canonical resolvers; corrects Phase 26.2g-fillin V21 no-op)"
status: "master=b6c6253 · prod=ccef3c2 · 90+ commits ahead · 8552 passed · build clean"
branch: "master"
last_commit: "b6c6253 feat(audit AV40 Phase 26.2g-fillin-bis Task 7): extend forbidden-read list to canonical fields"
tests: 8552
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "ccef3c2"
firestore_rules_version: 29
storage_rules_version: 2
---

# Active Context

## State
- master = `b6c6253` (pre session-end docs commit) · prod = `ccef3c2` (90+ commits ahead — Phase 26.0+26.1+26.2+26.2f+26.2g-fillin+26.2g-fillin-followup+26.2g-fillin-bis LIVE on master only; NOT deployed)
- 8552 tests + 1 skipped + 0 fail. Build clean (2.48s).
- Phase 26.2g-fillin-bis shipped via 9 subagent-driven tasks with 2-stage review on Tasks 1 + 2.
- Live admin-SDK e2e dry-run 6/6 PASS; `--apply` pending user authorization per Rule M.

## What this session shipped
- NEW 3 `resolvePatient*` helpers in `src/lib/patientHealthMapping.js` reading CANONICAL be_customers.patientData fields directly (`congenitalDisease`/`drugAllergy`+`foodAllergy`/`beforeTreatment`+`pregnanted`). 3 NEW label-prefix constants. ~70 LOC added.
- TFP create-mode auto-fill swapped derive→resolve. Removed pre-existing `setDrugAllergy(patientData.allergiesDetail)` no-op (allergiesDetail is kiosk-shape, doesn't exist on be_customers).
- 5-layer test bank (+62 net assertions): unit R1-R4 (30) + source-grep G4 (6) + flow-simulate FB1-FB6 (19 — chains REAL kioskPatientToCanonical + buildPatientDataFromForm + resolver + setter) + RTL (7 incl. LC-26000001 user fixture) + live admin-SDK e2e script (6 scenarios dry-run verified).
- AV40 extended to lock direct reads of canonical fields (congenitalDisease/drugAllergy/foodAllergy/beforeTreatment/pregnanted) in src/components|src/pages. G2.1 PATTERN extended.
- V21 fixup on existing G1 tests in `tests/phase-26-2g-fillin-source-grep.test.js` (asserted broken derive* pattern post-Task 2; rewritten to lock resolve* + anti-regression).
- V-entry transparently acknowledges Phase 26.2g-fillin was a V21 architectural-error no-op (read kiosk-shape fields on canonical-only target doc).
- 9 task commits: helper TDD + M1+M2 follow-up · TFP refactor · G1 V21 fixup · G4 source-grep · FB flow-simulate · RTL · e2e script · AV40+G2.1 PATTERN.

## Next action
Choose ONE in next chat:
1. **Deploy combined 90+ commits** — `vercel --prod` + `firebase deploy --only firestore:rules` per V15 + Rule B Probe-Deploy-Probe.
2. **Run `--apply` live e2e** — `node scripts/e2e-phase-26-2g-fillin-bis.mjs --apply` writes 6 TEST-prefixed customer docs to real prod Firestore + cleanup + audit doc. Per Rule M.
3. **New phase / feature** — user specifies priority.
4. **kioskPatientToCanonical Rule-of-3 close** (deferred follow-up) — replace inline `ud_*` derivation at lines 47-55 with `derivePatientCongenitalDisease` helper call.
5. **Probe-Deploy-Probe maintenance** — investigate probes 2/3/4 false-positive or Phase 17.1 flake.

## Outstanding user-triggered actions
- **Deploy auth**: 90+ commits ahead. Combined deploy per V15 + Rule B.
- **--apply gate** on `scripts/e2e-phase-26-2g-fillin-bis.mjs` per Rule M.
- (Optional) Phase 17.1 cross-branch-import-rtl flake (intermittent under full-suite load).

## Carried institutional memory
- saveMode='vitals' = 5th locked-X family member (Phase 26.2f AV37 extension).
- Panel + Mirror co-exist for TimelineModal vs TFP split-screen (Phase 26.2f AV38 + AV39).
- `extractDisplayString` = canonical fix for [object Object] rendering (Phase 26.2).
- `toDateSafely` = canonical fix for Firestore Timestamp → React child crash (Phase 26.2f3).
- `derivePatient*` helpers consume KIOSK-shape patientData (opd_session.patientData where hasUnderlying/ud_*/etc. exist) — utils.js OPD print is the legitimate consumer.
- `resolvePatient*` helpers consume CANONICAL patientData (be_customers.patientData where buildPatientDataFromForm has projected admin/kiosk data to canonical camelCase) — TFP create-mode auto-fill is the canonical consumer.
- be_customers.patientData has ONE shape (canonical camelCase) regardless of write path (admin form direct OR kiosk via kioskPatientToCanonical pre-derive). Never the kiosk shape.
- `UD_LABELS_EN` formal-clinical labels intentionally distinct from PatientForm UI labels (lay-friendly).
- 3-stage save workflow: vitals → doctor → null/complete (Phase 26.2f).
- AV40 = patientData reads centralized via patientHealthMapping. Forbidden direct-reads: BOTH kiosk-shape AND canonical-shape outside sanctioned (PatientForm writer + AdminDashboard chips + utils.js OPD print).
- V21-class regex windows drift when comments expand — bump windows + V21 marker comment.
- Rule P "ONE class-of-bug at a time" + sanctioned tech-debt + follow-up plan = canonical rhythm.
- V21 comment-vs-code drift can fire BETWEEN tasks of the same phase (Phase 26.2g-fillin-followup Task 1) AND at task boundaries (Phase 26.2g-fillin-bis Task 2 invalidated Task 1's source-grep — caught by reviewer).
- **NEW lesson (Phase 26.2g-fillin-bis 2026-05-13)**: V21 architectural error — helpers reading fields that don't exist on target doc shape ALWAYS return ''. Source-grep + unit tests cannot catch it; only Rule I flow-simulate chaining REAL helpers across REAL data paths + a 1-line preview_eval `Object.keys(realCustomer.patientData)` BEFORE shipping the helper-consumer pairing catches it. Phase 26.2g-fillin shipped because that step was skipped. End-of-sub-phase Rule I IS the canonical guard; skipping it lets no-op fixes ship.
