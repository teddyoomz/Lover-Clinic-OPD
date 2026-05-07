---
updated_at: "2026-05-08 EOD — V40 backup/restore enterprise-grade (100% bit-perfect on all branches incl. NaN/Infinity)"
status: "master=0108dd7 · prod=0108dd7 (LIVE) · 6900/6900 tests · build clean"
branch: "master"
last_commit: "0108dd7"
tests: 6900
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "0108dd7"
firestore_rules_version: 28
storage_rules_version: 2
---

# Active Context

## State
- master = `0108dd7` · prod = `0108dd7` (FULLY SYNCED)
- 6900/6900 tests pass · build clean · 270 test files
- V40 backup/restore: enterprise-grade 100% byte-perfect round-trip on every branch (incl. NaN/Infinity preservation via schemaVersion=2 sentinel encoding)

## What this session shipped (V40-prod-fix-1 through fix-5)
- **fix-1**: explicit `bucket(BUCKET)` arg (Vercel reused-app missing storageBucket)
- **fix-2**: parallel-batched T4 traversal (84s → 2.56s, 30.9× speedup) + `maxDuration:60` on 3 admin endpoints
- **fix-3**: full Restore UI (file upload + storage path + target branch dropdown + mode toggle + confirm gate) + `/api/admin/branch-backups` list endpoint + V40-prod-fix-3 commit
- **fix-4**: force browser download via `responseDisposition: attachment` on signedUrl + smart size formatter (B/KB/MB/GB) + doc count display
- **fix-5**: schemaVersion=2 with `jsonReplacerForNonFinite` + `jsonReviverForNonFinite` — preserves NaN/Infinity bit-perfect through backup→restore (was lossy → null in v1); v1 files still accepted (back-compat)
- 8 new diagnostic scripts (round-trip on real prod, NaN/Infinity scanner+fixer, multi-branch verifier, content-disposition probe, etc.)
- 99/99 V40 unit tests + 4 live e2e on real prod (single-branch + edge-case stress + multi-branch matrix + paranoid download+reupload) — all 100% PASS

Detail: `.agents/sessions/2026-05-08-v40-prod-fixes-1-thru-5.md`

## Next action
Idle. V40 is feature-complete + enterprise-grade verified on prod. Awaiting new directive.

## Outstanding (user-triggered, none blocking)
- 🚨 H-bis ProClinic full strip (deferred from prior sessions)
- Hard-gate Firebase custom claim (deferred)
- /audit-all pre-release pass
- V41 staff/doctor hide (deployed earlier this session, also LIVE)
