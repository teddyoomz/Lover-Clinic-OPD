---
updated_at: "2026-05-14 EOD — Phase 26.2g-fillin-bis-followup + Phase 17.1 flake fix SHIPPED (both optionals closed)"
status: "master=e71dbf9 · prod=ccef3c2 · 94 commits ahead · 8556 passed · build clean"
branch: "master"
last_commit: "e71dbf9 test(Phase 17.1 flake fix): defensive isolation against full-suite-load flake"
tests: 8556
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "ccef3c2"
firestore_rules_version: 29
storage_rules_version: 2
---

# Active Context

## State
- master = `e71dbf9` · prod = `ccef3c2` (94 commits ahead — Phase 26.0+26.1+26.2+26.2f+26.2g-fillin+26.2g-fillin-followup+26.2g-fillin-bis+26.2g-fillin-bis-followup+Phase 17.1 flake fix all LIVE on master; NOT deployed)
- 8556 tests + 1 skipped + 0 fail. Build clean.
- Live admin-SDK e2e --apply 6/6 PASS verified on real prod Firestore (audit doc `be_admin_audit/phase-26-2g-fillin-bis-e2e-1778691063475-ff6ea920`).

## What this session shipped
**Phase 26.2g-fillin-bis** (V21 architectural-error correction for the no-op):
- NEW 3 `resolvePatient*` helpers in `src/lib/patientHealthMapping.js` (canonical reads on be_customers.patientData).
- TFP create-mode auto-fill swapped derive→resolve. Pre-existing `setDrugAllergy(patientData.allergiesDetail)` no-op removed.
- 5-layer test bank +62 net assertions (unit R1-R4 + source-grep G4 + flow-simulate FB1-FB6 + RTL + live admin-SDK e2e on real prod with audit doc).
- AV40 extended to lock both kiosk-shape AND canonical-shape direct reads.
- V-entry transparently acknowledges Phase 26.2g-fillin was V21 no-op.

**Phase 26.2g-fillin-bis-followup** (Rule of 3 close):
- `src/lib/kioskPatientToCanonical.js:46-55` inline ud_* derivation → `derivePatientCongenitalDisease(d)` helper call.
- Byte-identical contract verified across 5 scenarios via node REPL.
- +4 G5 source-grep assertions in `tests/phase-26-2g-fillin-bis-followup-kiosk-canonical-source-grep.test.js`.
- V12 multi-reader-sweep class for kiosk-shape ud_* derivation **FULLY CLOSED project-wide** (3 inline sites → 0).

**Phase 17.1 flake fix** (intermittent under full-suite load):
- Root cause: 4 test files assign `global.fetch` without afterAll restore + scope-narrow beforeEach only resets fetchMock.
- Defensive fixes in `tests/phase-17-1-cross-branch-import-rtl.test.jsx`: `ORIGINAL_FETCH` capture + afterAll restore + `afterEach vi.clearAllMocks()` + `WAIT_FOR_OPTS={timeout:3000}` applied to all 13 waitFor sites.
- 8/8 isolated runs GREEN post-fix; full-suite 8556 GREEN.

## Next action
Choose ONE in next chat:
1. **Deploy combined 94 commits** — `vercel --prod` + `firebase deploy --only firestore:rules` per V15 + Rule B Probe-Deploy-Probe.
2. **New phase / feature** — user specifies priority.
3. **Defensive global.fetch sweep** — extend the Phase 17.1 afterAll pattern to the other 3 files that assign global.fetch (branch-backup-ui-rtl + phase15.5b-withdrawal-approval-endpoint + extended/adminUsersClient). Hygiene; not blocking.
4. **Probe-Deploy-Probe maintenance** — investigate probes 2/3/4 false-positive.

## Outstanding user-triggered actions
- **Deploy auth**: 94 commits ahead. Combined deploy per V15 + Rule B.

## Carried institutional memory
- saveMode='vitals' = 5th locked-X family member (Phase 26.2f AV37 extension).
- Panel + Mirror co-exist for TimelineModal vs TFP split-screen (Phase 26.2f AV38 + AV39).
- `extractDisplayString` = canonical fix for [object Object] rendering (Phase 26.2).
- `toDateSafely` = canonical fix for Firestore Timestamp → React child crash (Phase 26.2f3).
- `derivePatient*` helpers consume KIOSK-shape patientData (opd_session.patientData where hasUnderlying/ud_*/etc. exist). Three consumers (utils.js Thai + utils.js English + kioskPatientToCanonical Thai canonical) — all via canonical helper post-Phase 26.2g-fillin-bis-followup; **NO inline ud_* push patterns remain project-wide**.
- `resolvePatient*` helpers consume CANONICAL patientData (be_customers.patientData where buildPatientDataFromForm has projected admin/kiosk data to canonical camelCase). TFP create-mode auto-fill is the canonical consumer.
- be_customers.patientData has ONE shape (canonical camelCase) regardless of write path. opd_sessions.patientData has the kiosk shape. Different surfaces; different helpers.
- `UD_LABELS_EN` formal-clinical labels intentionally distinct from PatientForm UI labels.
- 3-stage save workflow: vitals → doctor → null/complete (Phase 26.2f).
- AV40 = patientData reads centralized via patientHealthMapping. Forbidden direct-reads: BOTH kiosk-shape AND canonical-shape outside sanctioned (PatientForm writer + AdminDashboard chips + utils.js OPD print + kioskPatientToCanonical via helper).
- V21-class regex windows drift when comments expand — bump windows + V21 marker comment.
- Rule P "ONE class-of-bug at a time" + sanctioned tech-debt + follow-up plan = canonical rhythm.
- V21 architectural error — helpers reading fields that don't exist on target doc shape ALWAYS return ''. Only Rule I flow-simulate + 1-line preview_eval against real data BEFORE shipping helper-consumer pairing catches it.
- **NEW lesson (Phase 17.1 flake fix 2026-05-14)**: When a test file assigns `global.X` (e.g. global.fetch), CAPTURE the original at module-load and RESTORE in afterAll. Under vitest worker parallelism, cross-file global pollution causes intermittent flakes. Plus `afterEach(vi.clearAllMocks())` + extended `waitFor` timeout via `WAIT_FOR_OPTS={timeout:3000}` for RTL tests under load. Pattern applies to all 4 files in this codebase that assign global.fetch; defensive sweep deferred as hygiene task.
