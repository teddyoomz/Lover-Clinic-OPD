---
updated_at: "2026-05-27 — V122 backup-subsystem fix DEPLOYED + L2-verified live + create-queue button removed + EOD+8 UI fixes DEPLOYED"
status: "DEPLOYED. master=0805da87 pushed; prod LIVE (vercel --prod → lover-clinic-app.vercel.app). V122 backup fix L2-verified on the real endpoint (HTTP 200 in 38.1s, complete manifest, 0 failed). Full suite 14892/0."
branch: "master"
last_commit: "0805da87 feat(frontend): remove +สร้างคิวใหม่ create-queue button (keep form) + EOD+8 UI fixes"
tests: "full suite 14892 pass / 0 fail. build clean. backup e2e 10/0 (real prod). branch backup e2e healthy."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "0805da87 LIVE (V122 backup + button removal + EOD+8). prior prod = 7e2a5bd8."
firestore_rules_version: "UNCHANGED this session (no rules/data/cron touched — frontend+serverless deploy only; NO Probe-Deploy-Probe needed)"
---

# Active Context

## State
- V122 backup-subsystem fix DEPLOYED + **L2-VERIFIED LIVE**: deployed `/api/admin/whole-system-backup-export` → HTTP 200 in 38.1s (was 504 @ 300.7s timeout); complete manifest (4783 docs · 409 users · 0 failedCollections · 0 failedStorage). The 03:00 cron now produces complete backups (no more NO_MANIFEST).
- Root cause: ~1000 sequential cross-region round-trips > 300s Vercel cap + 28/65 collections silently omitted (hardcoded scope). Fix: mapWithConcurrency bounded-parallel I/O (~20×) + dynamic listCollections() enumeration across backup + restore + whole-fleet + branch maxDuration 60→300. AV141 + AV142. V122 V-log.
- Create-queue "+สร้างคิวใหม่" button REMOVED (desktop + mobile) — modal/form KEPT dormant for later (prose breadcrumb to re-enable). 3 V21 test fixups (v88 R5.1/W1.2 + menu M7.1).
- EOD+8 UI fixes shipped in the same deploy (were awaiting commit/deploy).

## Next action
- idle — user L1 on prod for auth-gated UI (create-queue button gone from header; EOD+8 visual items: card breathing · opd-pending bubble · OPD modal renames · QR mobile).

## Outstanding (user-triggered)
- OPTIONAL: clean up 5 pre-fix broken NO_MANIFEST backup folders (auto-20260522..26 auto-clean via 5-day retention; manual-20260524 needs manual delete).
- OPTIONAL: stale QR-panel placeholder "กดสร้างคิวใหม่ด้านบน" (AdminDashboard.jsx:7541) still references the removed button — left unchanged (scope=button); soften if desired.
- 2 pre-existing Rule S edits (CLAUDE.md, rules/01-iron-clad.md) still UNCOMMITTED — user's to commit (doc-only, not in prod bundle).
