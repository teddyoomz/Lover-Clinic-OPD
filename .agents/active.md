---
updated_at: "2026-05-15 EOD+3 — V67 LINE reminder pipeline schema-drift FIX (4 bugs class-of-bug expansion)"
status: "master=ahead-by-1 · prod=84c0af1 LIVE on lover-clinic-app.vercel.app · firestore rules v32 (no rules change)"
branch: "master"
last_commit: "(pending V67 commit) — 4 LINE reminder bug fixes + AV46 + V21 fixups + Rule R diag"
tests: "10083 PASS / 0 FAIL / 12 skip (full suite GREEN); 171/171 LINE-reminder + 19/19 V67 AV46 audit GREEN"
playwright_e2e: 14
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "84c0af1"
firestore_rules_version: 32
storage_rules_version: 2
---

# Active Context

## State

- master = ahead-by-1 vs prod=`84c0af1` · build clean · NO rules change · NO data ops
- V67 LINE reminder schema-drift fix (Rule P class-of-bug expansion of V66 mock-shadow class)
- 4 bugs fixed: Bug A `appointmentDate→date` (3 files) · Bug C `branchName→name` (validation + template) · Bug B single-mode picker accepts customerHN · Bug D customerName/doctorName fallback chain
- AV46 invariant + 19 V67 source-grep regression tests + Rule R schema-match diag script
- 5 pre-existing V21-class failures fixed inline (BC1.1 collection matrix + 3 STRIPPED helper + 2 AV41 fetch-isolation)
- Rule Q L2 verified end-to-end on real prod data — pipeline reaches push step with correct flex (customer 2853 / appt BA-1778823940645 / branch BR-1777873556815-26df6480)

## What this session shipped

- **Phase 1 (root cause)**: Rule R diag against real prod revealed pipeline queried `where('appointmentDate', '==', target)` but real Firestore field is `date` (proven by `backendClient.js:2077,2107` writers). Wave 1 LINE reminder shipped with 152 mock tests + 16 AV45 GREEN locking the WRONG field name. EXACT V66 mock-shadow drift replay 1 day after Rule Q infrastructure shipped.
- **Phase 2 (class-of-bug expansion)**: Found 4 bugs in same V66 family — A (date field) + C (branchName field) + B (HN vs customerId picker) + D (customerName/doctorName missing real-schema fallback chain).
- **Phase 4 (fix)**: Defensive `||` fallback chains in 3 runtime files (cron + debug-fire + template); 2-query OR-merge in single-mode picker for customerHN.
- **Phase 5/6 (Tier 2 artifacts)**: AV46 invariant + V67.A1-A8 source-grep regression bank locks canonical field names + Rule R diag-line-reminder-schema-match.mjs for ongoing pipeline ⊆ real-schema check.
- **Phase 7 (V21 fixups)**: 5 pre-existing failures fixed inline since they blocked Rule N green claim — BC1.1 missing collection matrix entries (Wave 1 oversight) + STRIPPED regex helper bug in 3 source-grep tests (literal `/*` inside `//` lines mis-stripped) + 2 AV41 global.fetch isolation files.

## Files Touched (V67)

**MODIFIED runtime (3)**: `src/lib/lineReminderTemplate.js`, `api/cron/line-reminder-fire.js`, `api/admin/line-reminder-debug-fire.js`

**MODIFIED tests (5 fixtures + 5 V21 fixups)**: `tests/lineReminderTemplate.test.js`, `tests/line-reminder-pipeline-idempotency.test.js`, `tests/line-reminder-pipeline-customer-branch-link.test.js`, `tests/line-reminder-pipeline-per-branch-credentials.test.js`, `scripts/e2e-line-reminder-real-prod.mjs`, `tests/branch-collection-coverage.test.js` (V21), `tests/phase-20-0-task-6-branch-selector-frontend.test.jsx` (V21), `tests/phase-20-0-flow-a-queue-read-source.test.jsx` (V21), `tests/phase-20-0-flow-c-no-deposit-flow-simulate.test.jsx` (V21), `tests/branch-make-fresh-selective-flow-simulate.test.jsx` (V21), `tests/central-stock-make-fresh-flow-simulate.test.jsx` (V21)

**NEW (3)**: `tests/v67-line-reminder-canonical-schema-audit.test.js` (19 source-grep), `scripts/diag-line-reminder-schema-match.mjs` (Rule R ongoing), `scripts/diag-line-reminder-l2-verify-v67.mjs` (Rule Q L2 verification)

**MODIFIED audit (1)**: `.agents/skills/audit-anti-vibe-code/SKILL.md` (NEW AV46 invariant + banner AV1–AV46)

## Next action

User authorizes deploy with "deploy" verb to push V67 fix to prod. After deploy:
1. tab=line-settings → นครราชสีมา → toggle lineReminder.enabled=ON (already ON per last session screenshot — verify)
2. Debug Fire → mode=ยิงเฉพาะลูกค้า + customer "000004" or "2853" → "ทดสอบเลย" → Sent should be 1 (not 0)
3. Real LINE message arrives on user's phone (Rule Q L1)
4. Click ✓ ยืนยัน → verify `appointment.status='confirmed'` (postback handler unchanged)
5. DM "หยุดแจ้งเตือน" → verify `notifyOptOut=true` (opt-out handler unchanged)

## Outstanding user-triggered actions

- Deploy V67 fix to prod (vercel --prod only — NO firebase:rules change)
- Confirm LINE Premium tier active for นครราชสีมา OA (~$60/mo, 5K msgs/mo)
- Optional: full 8-scenario e2e `node scripts/e2e-line-reminder-real-prod.mjs --apply --admin-line-user-id=Uxxx`

## Notes

- V67 = canonical replay of V66 mock-shadow drift class. Lesson: Rule Q infrastructure (shipped yesterday) catches at the SELF-CHECK / claim-verified gate, but ONLY if invoked. Wave 1 LINE reminder shipped same day Rule Q shipped — 8-layer test stack lied with same exact failure mode. AV46 grep + Rule R diag are upstream prevention; both should be invoked in PR review for any new pipeline against existing collections.
- Rule R diag pattern (schema-match) is generalizable — every cron/serverless that reads denormalized fields should have one.
