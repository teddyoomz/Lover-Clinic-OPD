# Session 2026-05-08 — V40 prod-fix-1 thru fix-5 (enterprise backup/restore)

**Branch**: master
**Range**: ~ce a9fb6 → 0108dd7 (10 commits this session)
**Tests**: 6859 → 6900 (+41 V40-prod-fix tests)
**Build**: clean · **Deploy state**: master = prod = `0108dd7` (LIVE, fully synced)

## Summary

User reported V40 backup/restore had multiple production bugs after V40 + V41 deployed earlier in the session. Iterated 5 prod-fixes through systematic-debugging skill, each rooted in real evidence (diag scripts vs prod). Final state: enterprise-grade 100% byte-perfect round-trip verified on every existing branch + simulated future branch.

## Current State

- master = prod = `0108dd7` (FULLY SYNCED on Vercel)
- 6900/6900 tests pass · build clean
- V40 backup/restore endpoints + UI: production-ready enterprise-grade
- 8 diagnostic scripts in `scripts/diag-*` for re-running verification any time

## Commits (10 this session)

```
0108dd7 test(branch-backup): verifier uses jsonReviverForNonFinite + NaN-aware deepDiff
6b10c37 fix(branch-backup): preserve NaN/Infinity via sentinel encoding (schemaVersion=2, V40-prod-fix-5)
32be637 test(branch-backup): paranoid round-trip diagnostics
0f29f53 fix(branch-backup): force browser download + smart size formatter (V40-prod-fix-4)
4b7623c feat(branch-backup): full Restore UI + backup-list endpoint + E2E round-trip diag (V40-prod-fix-3)
5fc1c9b fix(branch-backup): parallel-batched T4 traversal + maxDuration:60 (V40-prod-fix-2)
9bbac5a fix(branch-backup): pass BUCKET explicitly to getStorage().bucket() (V40-prod-fix-1)
+ 3 earlier V41 ship commits (staff/doctor hide-from-lists)
```

## Files Touched

**Modified**:
- `api/admin/branch-backup-export.js`
- `api/admin/branch-restore.js`
- `api/admin/branch-make-fresh.js`
- `api/admin/branch-backups.js` (NEW — backup-list endpoint)
- `src/lib/branchBackupSchema.js` (schemaVersion 1 → 2 + replacer/reviver)
- `src/components/backend/BranchBackupTab.jsx` (full Restore UI + smart sizing)
- `vercel.json` (maxDuration:60 for V40 endpoints + 30 for backups-list)
- `tests/branch-backup-helpers.test.js` (H4.1 v→2, H4.6-H4.9 sentinel coverage, H5.7-H5.9 lock-in)
- `tests/branch-backup-flow-simulate.test.js` (schemaVersion 1→2)
- `tests/branch-backup-ui-rtl.test.jsx` (Download label + download attribute)
- `tests/phase-20-0-flow-b-deposit-flow-simulate.test.jsx` (regex accepts {includeHidden} opt — collateral from V41)

**NEW diagnostic scripts**:
- `scripts/diag-prod-export-error.mjs` — capture prod EXPORT_FAILED detail
- `scripts/diag-branch-backup-timing.mjs` — measure sequential vs parallel T4 timing
- `scripts/diag-prod-make-fresh-restore-roundtrip.mjs` — basic round-trip via storagePath
- `scripts/diag-prod-download-reupload-roundtrip.mjs` — download via HTTPS + re-upload via base64 (mirrors UI exactly)
- `scripts/diag-prod-roundtrip-stress.mjs` — 6 edge-case fixtures (Thai/emoji/nested/null/precision)
- `scripts/diag-verify-content-disposition.mjs` — confirm GCS sends attachment header
- `scripts/diag-prod-backup-full-validate.mjs` — full T1+T2+T3+T4 download+parse
- `scripts/diag-prod-all-branches-verify.mjs` — multi-branch matrix (PART A/B/C)
- `scripts/diag-scan-nan-infinity.mjs` — detect non-finite numbers in branch-scoped data
- `scripts/diag-fix-nan-infinity.mjs` — Rule M two-phase fix (NOT executed; user permission denied)
- `scripts/diag-inspect-medical-instrument-2.mjs` — inspect specific NaN-tainted doc

## Decisions (1-line each)

- D1 — explicit `bucket(BUCKET)` instead of relying on app's storageBucket config (Vercel reused-app race).
- D2 — parallel batching (50 customers × 8 subs concurrent) instead of streaming OR collectionGroup (simplest 30× speedup, no Firestore index changes).
- D3 — schemaVersion 1→2 with sentinel `{__number__: 'NaN'/'Infinity'/'-Infinity'}` instead of pre-fix data mutation (preserves user data; round-trip is 100% bit-perfect).
- D4 — backwards compat via reviver no-op on v1 files (existing v1 backups still restore correctly).
- D5 — UI Restore section uses `uploadedFileBase64` for upload + `sourceStoragePath` for list-pick (both endpoints supported, both verified live).
- D6 — Did NOT modify production data to fix NaN (user permission system correctly denied; fixed code to preserve NaN instead).

## Verification matrix (real prod, all PASS)

| Test | Branch | Result |
|---|---|---|
| Single round-trip | ทดลอง 1 (5 docs) | ✅ 100% |
| Stress edge-case | ทดลอง 1 + 6 planted fixtures | ✅ 100% (Thai/emoji/special/null/precision) |
| Multi-branch live-vs-file | นครราชสีมา (3,233) | ✅ 100% |
| Multi-branch live-vs-file | พระราม 3 (488) | ✅ 100% |
| Multi-branch live-vs-file | ทดลอง 1 (5) | ✅ 100% |
| Future-branch round-trip | TEST-FUTURE-V40-* (3 docs) | ✅ 100% |
| Code-path branch-agnostic | source-grep | ✅ no hardcoded branchIds |
| Content-Disposition | curl HEAD | ✅ attachment + filename |
| NaN/Infinity preservation | be_medical_instruments/2.costPrice | ✅ sentinel encoding |

## Next Todo

Idle. V40 enterprise-grade verified. Awaiting new directive.

## Resume Prompt

```
Resume LoverClinic — continue from 2026-05-08 EOD.

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master = prod = 0108dd7, fully synced)
3. .agents/active.md (6900 tests pass)
4. .claude/rules/00-session-start.md (iron-clad + V-summary)
5. (if needed) .agents/sessions/2026-05-08-v40-prod-fixes-1-thru-5.md

Status: master = prod = 0108dd7 LIVE · 6900/6900 tests · build clean
Next: idle (V40 enterprise-grade, V41 staff hide both LIVE)
Outstanding: H-bis ProClinic strip · Hard-gate Firebase claim · /audit-all
Rules: V18 deploy auth never rolls over; V15 combined deploy; Probe-Deploy-Probe
/session-start
```
