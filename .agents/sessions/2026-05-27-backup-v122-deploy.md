# 2026-05-27 — V122 backup-subsystem fix (DEPLOYED + L2-verified) + create-queue button removal + EOD+8 deploy

## Summary
`/systematic-debugging` on a business-critical report: the Whole-System V81 backups had been silently `NO_MANIFEST` for days. Confirmed root cause = Vercel 300s timeout from ~1000 sequential cross-region round-trips (real HTTP 504 + 20h-stale cron lock) PLUS 28/65 collections silently omitted (hardcoded scope). Fixed with bounded-parallel I/O + dynamic collection enumeration across backup + restore + whole-fleet + branch; deployed + **L2-verified live** (endpoint 200 in 38.1s, complete manifest). Then removed the unused "+สร้างคิวใหม่" Frontend button (modal/form kept dormant). EOD+8 UI fixes shipped in the same deploy.

## Current State
- master = `954420d6` (pushed); prod LIVE (`vercel --prod` → lover-clinic-app.vercel.app). Prior prod was `7e2a5bd8`.
- Full suite **14892/0** · build clean. Backup e2e 10/0 (real prod) · branch backup e2e healthy.
- NO firestore.rules/storage.rules/data/cron touched → frontend+serverless deploy only, NO Probe-Deploy-Probe.
- Only uncommitted: 2 pre-existing Rule S edits (CLAUDE.md, rules/01-iron-clad.md) — user's.
- The 03:00 cron now produces complete backups (no more NO_MANIFEST).

## Commits
```
954420d6 docs(agents): V122 backup fix DEPLOYED + L2-verified + button removal + EOD+8
0805da87 feat(frontend): remove "+สร้างคิวใหม่" create-queue button (keep form) + EOD+8 UI fixes
f6e861f7 fix(backup): V122 — fix whole-system backup 300s timeout + 28-collection scope drift
```

## Files Touched
- backup: src/lib/wholeSystemBackupCore.js · api/admin/_lib/{wholeSystemBackupExecutor,wholeSystemRestoreExecutor}.js · api/admin/whole-fleet-customer-restore.js · vercel.json
- button: src/pages/AdminDashboard.jsx (+ EOD+8) · tests/{menu-variant-a-v2-source-grep,v88-header-cosmetic-harmony}.test.{jsx,js}
- tests (NEW): tests/v122-backup-parallel-and-completeness.test.js · scripts/{diag-whole-system-backup-failure,diag-whole-system-backup-timing,diag-trigger-whole-system-backup,e2e-whole-system-backup-restore-v122}.mjs
- V21 fixups: tests/{v81-source-grep,v81-fix1-firestore-type-roundtrip,v75-whole-fleet-backup-adversarial,v75-whole-fleet-restore-endpoint}.test.js
- docs: .agents/skills/audit-anti-vibe-code/SKILL.md (AV141+AV142) · .claude/rules/{00-session-start,v-log-archive}.md (V122) · EOD+8 also shipped (PatientForm, ThemeToggle, AppointmentHub*, OpdLifecycleRow, SendCustomerLinkModal, index.css, treatmentDisplayResolvers + their tests)

## Decisions (1-line; full reasoning → v-log-archive.md V122)
- Root cause confirmed via Rule R diags + real 504 trigger BEFORE any fix (killed 2 wrong hypotheses: storage-step, slow-reads).
- mapWithConcurrency (bounded-parallel) over collectionGroup — simpler, 20× headroom, no top-level-`treatments` collision risk.
- Dynamic listCollections() for full scope only; customer-only keeps curated subset.
- Fixed latent orphan-subcoll wipe-order bug (wipe subcoll before parent; listDocuments() up front).
- Rule Q-honest: the 2 "flakes" were real V21 regressions in my whole-fleet refactor's source-greps — verified behavior preserved (isolation + branch-blindness), then fixed. 5 V21 fixups total.
- Restore verified via isolated-namespace round-trip (never touched live prod data; runWholeSystemRestore against prod is destructive).
- Deploy = frontend+serverless only (no rules changed → no Probe-Deploy-Probe).
- Button: removed both variants → prose breadcrumbs (no false source-grep match); modal/form KEPT dormant per user.

## Next Todo (optional / user-triggered)
- Clean 5 pre-fix broken NO_MANIFEST folders (auto-* via retention; manual-20260524 manual delete) — script on request.
- Stale QR placeholder "กดสร้างคิวใหม่ด้านบน" (AdminDashboard:7541) references removed button — soften if desired.
- User L1 on prod (button gone from header; EOD+8 auth-gated visuals).
- 2 pre-existing Rule S edits (CLAUDE.md, rules/01) — user's to commit.

## Resume Prompt
See SESSION_HANDOFF.md Current State (2026-05-27). master=954420d6, prod LIVE. V122 backup fix DEPLOYED + L2-verified (endpoint 200/38s, complete manifest). Next = idle / optional cleanup. No commit/deploy without explicit word THIS turn (V18).
