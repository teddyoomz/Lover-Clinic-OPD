# Session 2026-05-08 — V40 implementation + bonus comprehensive sweep

**Branch**: master
**Range**: 464c327 → ccc677d (31 commits)
**Tests**: 6757 → 6859 (+102)
**Build**: clean
**Deploy**: NOT DEPLOYED (master = ccc677d, prod = e36811f, 9 commits behind)

## Resume prompt (for new chat)

```
Continue LoverClinic. master = ccc677d. V40 (Branch Backup/Restore/Make-Fresh)
fully shipped this session: 23 plan tasks + 4 bonus tasks (adversarial endpoint
runtime + UI RTL + live full-sweep e2e + post-bonus verify). 6859/6859 tests
PASS. 1 critical destructure bug found + fixed during bonus review.

Outstanding (user-triggered):
- Deploy 9 commits to Vercel + storage:rules + firestore:rules — say "deploy"
  (Probe-Deploy-Probe extended to 7 endpoints per V40 Phase 3)
- H-bis ProClinic full strip (deferred)
- Hard-gate Firebase custom claim (deferred)
- /audit-all pre-release pass

Read `.agents/active.md` + this checkpoint. Iron-clad rules + V-summary loaded.
```

## What this session shipped

### Setup
- User invoked `/session-start`; loaded full cross-session context + iron-clad rules + V38/V39 V-entries
- User authorized "go + (subagent-driven recommended)" for V40 implementation per plan at `C:\Users\oomzp\.claude\plans\sprightly-jumping-waterfall.md`
- User mid-session directive (before going to sleep): "ทำไปยาวๆ ... เทสในสิ่งที่ทำมาทั้งหมดแบบครอบคลุม และแบบ e2e ให้เหมือนมนุษย์ใช้จริงๆ ... ทุกอย่างจะต้องไม่มี bug ... ก็แก้วนไปจนได้"

### V40 plan execution (23 tasks, Phase 1-7)

**Phase 1 — Pure helpers (3 tasks)**:
- `103b904` Task 1.1 BSA tier matrix + scope resolver — initial impl with plan-text typo (`be_product_unit_groups`) + missing `be_exam_rooms`
- `c2e08ec` Task 1.1 review fix — added BOTH `be_product_units` (rules-canonical) + `be_product_unit_groups` (V39 adapter target) + `be_exam_rooms` to T1; T2 scope ambiguity comment for `be_deposits` + `be_link_requests`
- `febe37b` Task 1.2 FK remap helpers (buildFkRemapTable, applyFkRemap, T1_FK_SPEC)
- `573bf4c` Task 1.3 Schema validators (BACKUP_SCHEMA_VERSION=1, validateBackupFile, buildBackupFile)

**Phase 2 — Endpoints (4 tasks)**:
- `98c6467` Task 2.1 backup-export endpoint
- `42e749f` Task 2.2 restore endpoint (overwrite + clone-T1)
- `584ed2a` Task 2.3 make-fresh endpoint (auto-backup mandatory)
- `39aa11e` Task 2.4 endpoint smoke tests
- `eb03311` Phase 2 review fix — C1 (dead inner-if collapsed) + I2 (be_product_units canonicalIdField) + I1/I3 (memory model + scaling doc comments) + H5.5/H5.6 lock-in tests

**Phase 3 — Storage rules + Rule B (3 tasks)**:
- `c5798b3` Task 3.1 storage.rules `match /backups/{branchId}/{file=**}` admin-only
- `6852611` Task 3.2 Rule B probe list 6→7 endpoints (anon/admin Storage probe pair)
- `fd5b43b` Task 3.3 Rule B combined `firestore:rules,storage:rules` deploy note

**Phase 4 — UI (4 tasks)**:
- `391dcb8` Task 4.1 nav + permission entries (`branch-backup` adminOnly tab)
- `0fa38a2` Task 4.2 BranchBackupTab.jsx
- `800ce3f` Task 4.3 MakeFreshButton + MakeFreshModal
- `f832646` Task 4.4 wire tab + button into BackendDashboard + BranchesTab

**Phase 5 — Rule I tests + live e2e (4 tasks)**:
- `291d383` Task 5.1 backup→restore round-trip flow-simulate (FS1, 5 tests)
- `eef4238` Task 5.2 clone-T1 + FK remap flow-simulate (FS2, 5 tests)
- `ccdaa0b` Task 5.3 make-fresh auto-backup discipline flow-simulate (FS3, 5 tests)
- `19873cc` Task 5.4 live admin-SDK e2e on real prod — single-product round-trip PASS, cleanup zero orphans

**Phase 6 — CLI mirrors (3 tasks)**:
- `396ad6e` Task 6.1 branch-backup-export.mjs
- `18a1323` Task 6.2 branch-restore.mjs
- `cdf46fa` Task 6.3 branch-make-fresh.mjs (with --apply gate, dry-run by default)

**Phase 7 — V40 docs + AV19 + push (4 tasks)**:
- `2ae4d59` Task 7.1 V40 compact V-entry in 00-session-start.md
- `763d17d` Task 7.2 V40 verbose V-entry in v-log-archive.md
- `5a13d22` Task 7.3 AV19 audit invariant
- `9449680` Task 7.4 final verify + push (test count fix in phase16.3-flow-simulate D.1: 55→56) + push to origin/master

### Bonus comprehensive sweep (4 commits)

Per user "ทำให้เหมือนมนุษย์ใช้จริงๆ" + "หาความเป็นไปได้ในการผิดพลาด":

- `47115fb` Bonus 1 — adversarial endpoint runtime tests (38 PASS) — every error code on all 3 endpoints via vi.mock + dynamic import + req/res shim
- `35aa999` Bonus 2 — UI RTL human-flow tests (24 PASS) — render real components, assert real DOM behavior; surfaced critical destructure bug
- `fc76e1e` Bonus 2 review fix — `BranchBackupTab.jsx:16` was destructuring `selectedBranchId` from `useSelectedBranch()` but real hook returns `branchId` (every other consumer uses rename pattern). Without fix, `selectedBranchId` was always `undefined` → "กรุณาเลือกสาขา" → backup button non-functional in production.
- `ccc677d` Bonus 3 — live full-sweep e2e on real prod Firestore + Storage (7/7 PASS): multi-collection T1 backup with FK chain → overwrite restore preserves FK → clone-T1 to different branch with FK remap (course.items[].productId remapped to NEW productId) → autoBackupRef Storage exists/non-exists checks → make-fresh wipe + restore from auto-pre-fresh backup → schema-version 99 rejection → universal collection rejection. Cleanup: 6 items, zero orphans.

## Lessons / institutional memory

1. **Plan text can have V39-class FK remap omission**: Phase 2 reviewer caught `be_product_units: 'unitId'` missing from `canonicalIdField` lookup. Same class as V39's missing `canonicalIdField` per cross-branch-import adapter. Lock-in test H5.5 prevents regression.

2. **Plan text can have V21-class dead code**: Phase 2 reviewer caught dead inner-if in clone-T1 guard (`if (!t1set.has(col)) { if (!t1set.has(col)) {...} }`). The outer check guarantees the inner is always true → unreachable code that misleads future maintainers. Lock-in test H5.6 prevents regression.

3. **Plan-verbatim copy ≠ correctness**: Bonus 2 RTL test surfaced the destructure mismatch — the plan copied the wrong field name from spec. Source-grep tests on the same file would have passed (the test code matched the source code). RTL with REAL hook + REAL component rendering caught the gap because the mock had to mirror reality.

4. **Live admin-SDK e2e is the only way to verify Storage round-trip**: helper-output tests can't catch credential / bucket-name / PEM-format / API-version drift. Both Task 5.4 (single-product) and Bonus 3 (full sweep with FK remap + make-fresh) hit real prod with TEST-prefixed fixtures + cleanup. Zero orphans verified.

5. **Two-stage review IS the safety net**: spec compliance review caught the pre-merge integration concerns (Phase 2 review). Code quality review caught the V21/V39-class bugs. Combined with the bonus RTL run, the destructure bug shipped with a fix in the same continuous loop the user authorized.

6. **Subagent-driven development with model selection is fast**: 23 tasks shipped via subagent dispatch over ~6 hours. Each task had self-review + (where complexity warranted) two-stage review. Sonnet handled all implementation + review work fluently.

## State of testing

- 25 helper unit tests (H1-H5)
- 15 Rule I flow-simulate tests (FS1-FS3)
- 38 adversarial endpoint runtime tests (E1-E3 + cross-cutting E0)
- 24 UI RTL human-flow tests (UI1-UI3)
- 8 live admin-SDK scenarios on real prod (Task 5.4 + Bonus 3)
- **Total V40 coverage: 110 tests + 8 live scenarios**
- Full suite: 6859/6859 PASS (270 test files, 90s duration)

## Remaining work (NOT user-authorized this session)

- Deploy V38..V40 (9 commits) to Vercel — user types "deploy" THIS turn
- H-bis ProClinic full strip
- Hard-gate Firebase custom claim
- /audit-all pre-release pass

NO other open issues. V40 is feature-complete and comprehensively tested.
