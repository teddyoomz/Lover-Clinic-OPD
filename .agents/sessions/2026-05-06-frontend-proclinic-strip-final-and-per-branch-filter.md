# 2026-05-06 EOD continuation — Final ProClinic UI strip + per-branch filter + hotfix

## Summary

Continuation of Phase 20.0 EOD session. After Phase 5a/5b/5c stripped `broker.*` CALLS, user caught residual ProClinic UI in OPD history page → final strip. Then user requested per-branch filter on Frontend tabs (queue/deposit/no-deposit/appointment/history) + migrated 467 docs across 3 collections to correct branchId. Plus credential leak via `git add -A`, force-push'd clean (user explicit accept no rotate).

## Current State

- master = `79084bc` (handoff) · prod = `024f6dd` FROZEN (V15 #22, no-deploy directive)
- 5742+/5742+ tests pass · build clean · firestore.rules v26 unchanged
- Frontend ProClinic strip 100% — 0 broker.* + 0 ProClinic UI labels in AdminDashboard
- BranchSelector visible (desktop xl:flex + mobile xl:hidden both rendered)
- End-to-end branch isolation verified live: นครราชสีมา ประวัติ = 68 รายการ vs พระราม 3 = 0 รายการ

## Commits (chronological — 9 ahead of prior EOD)

```
79084bc docs(agents): EOD 2026-05-06 wrap — ProClinic UI strip + per-branch filter complete
0cfb082 fix(admin-dashboard): final ProClinic UI strip — kiosk surface 100% on be_*
09826f1 fix(opd-sessions+chat+appointments): per-branch filter + branchId migration + hotfix
ea75b21 fix(chat-panel): filter chat_conversations by selectedBranchId
50aaffd fix(admin-dashboard): BranchSelector also in desktop xl:flex header block
1f40cdd <REWRITTEN by force-push — credential leak removed>
```

## Files touched (top-level)

- src/pages/AdminDashboard.jsx — final ProClinic UI strip + per-branch session filter + 3× sessionDoc branchId stamp
- src/components/ChatPanel.jsx — per-branch chat_conversations filter + useSelectedBranch hook
- src/App.jsx — wrap AdminDashboard in UserPermissionProvider + BranchProvider
- .gitignore — explicit .env.local.prod entry (V37 lock)
- scripts/phase-20-0-migrate-opd-sessions-to-branch.mjs (NEW) — 75 docs migrated
- scripts/phase-20-0-migrate-chat-conversations-to-branch.mjs (NEW) — 12 docs migrated
- scripts/phase-20-0-fix-branch-id-mismatch.mjs (NEW HOTFIX) — 75+12+380 = 467 docs re-stamped
- tests/phase-20-0-task-5b-patient-submit.test.js + tests/phase-20-0-flow-misc-broker-strip.test.js — Y4 + X3.2 + X4 inverted to assert removal

## Decisions (one-line — full reasoning in v-log-archive.md)

- Strip "นำเข้าจาก ProClinic" feature entirely (not repurpose) — admins use BackendDashboard's CustomerListTab for full be_* CRUD; kiosk-side import dead.
- handleProClinicEdit / handleProClinicDelete REMOVED — cascade-delete + customer edit relocated to BackendDashboard (single source of truth).
- session.brokerProClinicId field NAME preserved (semantics now = be_customers id) for backward compat with existing opd_sessions docs.
- Migration default branchId hardcode bug → hotfix script re-stamps OLD_ID → NEW_ID across 3 collections (lesson: never hardcode default branchId in migration scripts; query be_branches first).
- Force-push to clean origin after credential leak — user explicit "อนุญาต" + accept no rotate per `feedback_credential_leak_no_rotate.md`.
- BackendDashboard nav restructure DEFERRED to next chat per user.

## V-entries

V37 — `git add -A` swept .env.local.prod → credential leak. Force-push'd clean. .gitignore now explicit. Lesson: always `git add <specific files>`. User accepted no rotate.

## Lessons learned this cycle

- Comment-only stripping (replacing function with `// REMOVED` comment) is safer than deleting silently — leaves audit trail + lets tests assert removal.
- HMR in vitest dev server caches listener effects; per-branch filter changes require hard reload to verify in preview_eval.
- Migration scripts targeting branchId-stamped docs MUST query be_branches at runtime instead of hardcoding default — saves a hotfix round.

## Next Todo

DEFERRED to next chat per user directive 2026-05-06: BackendDashboard nav restructure — move "นัดหมาย" from PINNED to its own section + 4 appointmentType sub-tabs (จองไม่มัดจำ / จองมัดจำ / คิวรอทำหัตถการ / คิวติดตามอาการ). Plus deposit-booking writes ลง Finance.มัดจำ tab per branch.

## Resume Prompt

See SESSION_HANDOFF.md Resume Prompt block.
