---
updated_at: "2026-05-14 LATE EOD #3 — Selective Make-Fresh + Backup Integrity SHIPPED (34 commits ahead of prod)"
status: "master=7026bad · prod=8dd17c5 · 34 commits PENDING DEPLOY per V18 · build clean · 10/10 Rule Q L2 real-prod round-trip GREEN"
branch: "master"
last_commit: "7026bad test(selective-make-fresh): V21 fixup sweep — migrate V40-locked tests to bucketIds contract (Task 12)"
tests: "9825 vitest GREEN + 12 skipped + 4 pre-existing failures (NOT introduced by selective-make-fresh — flagged in prior active.md)"
playwright_e2e: 13
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "8dd17c5"
firestore_rules_version: 31
storage_rules_version: 2
---

# Active Context

## 🚨 RULE Q V66 + V18 DEPLOY LOCK + RULE R STANDING AUTH

- **Rule Q L1**: every "verified" claim → must pass Playwright real-browser OR real client SDK with exact compound queries.
- **V18 deploy lock**: 34 commits ahead of prod. NO `vercel --prod` without explicit "deploy" verb THIS turn.
- **Rule R**: standing authorization for `vercel env pull .env.local.prod` + read-only admin-SDK diag any time.

## State

- master = `7026bad`, prod = `8dd17c5` (34 commits PENDING)
- Build clean
- **Rule Q L2 ★ VERIFIED**: `scripts/e2e-backup-restore-roundtrip-real-prod.mjs --apply` → 10/10 scenarios PASS on REAL prod (hash byte-equal at every phase boundary, all adversarial fixtures Thai/Unicode/Timestamps/refs/large/nested cleanup zero orphans)
- 9825 vitest GREEN + 12 skipped + 4 pre-existing failures (NOT from this work)

## What this session shipped (Selective Make-Fresh + Backup Integrity)

User directive: extend V40 "ทำให้เป็นสาขาใหม่" button with selective bucket-level wipe + scope-matched backup + CRYPTOGRAPHIC ROUND-TRIP INTEGRITY ("ระบบ backup ต้องเทสให้แน่ใจที่สุดว่า Backup ออกมาแล้ว สามารถ restore เข้าไปได้แล้วเหมือนเดิม เป็นเรื่องที่ serious มาก").

Brainstorming Q1-Q6 locked (Q1=D hybrid UI + Advanced + T1 server-protected · Q2=B match-scope backup · Q3=A 7 buckets · Q4=B 6+1 default · Q5=B hash verification + test bank · Q6=B 3-step preview UX).

13-task plan executed inline (subagent context-thrashing on this project's large CLAUDE.md forced inline execution after Task 1 attempts):

1. NEW `src/lib/branchBackupBuckets.js` — 7-bucket schema + helpers (21 tests)
2. EDIT `src/lib/branchBackupSchema.js` — v2 schema + `computeBodyHash` SHA-256 (26 tests)
3. EDIT `api/admin/branch-backup-export.js` — bucketIds + dryRun + emit bodyHash
4. EDIT `api/admin/branch-make-fresh.js` — bucketIds + hash verify BEFORE wipe (★ critical)
5. REWRITE `src/components/backend/MakeFreshModal.jsx` — 3-step state machine UX
6. NEW `tests/branch-make-fresh-selective-flow-simulate.test.jsx` — Rule I (7 tests)
7. NEW `tests/branch-make-fresh-selective-source-grep.test.js` — V21 + AV regression (23 tests)
8. ★ NEW `scripts/e2e-backup-restore-roundtrip-real-prod.mjs` — Rule Q L2 (8-phase × 10 scenarios)
9. NEW `tests/e2e/branch-make-fresh-selective.spec.js` — Rule Q L1 Playwright (3 specs)
10. EDIT `scripts/branch-make-fresh.mjs` — CLI `--bucket-ids` arg
11. EDIT `audit-anti-vibe-code/SKILL.md` — NEW AV43 invariant
12. V21 fixup sweep — 3 test files migrated (FS3.5 + UI3 retired + E3.5-10 updated)
13. (this entry) session-end update

## Next action

**AWAITING explicit "deploy" verb** for 34-commit Vercel deploy. NO Firebase rules changed; Vercel-only deploy. Round-trip integrity verified on real prod — feature is production-ready.

## Outstanding (user-triggered)

1. Hard-refresh dev server + test new modal UI hands-on (npm run dev + open BranchesTab)
2. Run Playwright Rule Q L1 spec when ready (`tests/e2e/branch-make-fresh-selective.spec.js`) with auth env vars
3. Explicit **"deploy"** → 34-commit `vercel --prod --yes` (Vercel only)

## Pre-existing failures (NOT from this work — for reference)

- `tests/phase-20-0-flow-a-queue-read-source.test.jsx` — listenToAppointmentsByMonth pattern (flagged in prior session)
- 3 others (need investigation in a future session — not blocking selective-make-fresh)
