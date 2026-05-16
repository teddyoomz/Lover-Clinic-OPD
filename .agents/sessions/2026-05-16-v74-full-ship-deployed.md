# 2026-05-16 EOD — V74 Customer Backup/Restore FULL SHIP + DEPLOYED

## Summary

V74 customer backup/wipe/restore + unified backup-manager FULL SHIP (30/33 tasks) + DEPLOYED to prod via combined `vercel --prod` + `firebase deploy --only firestore:rules` + `firebase deploy --only storage`. Pre + post-deploy probes 5/5 PASS. 3 minor tasks deferred (NOT blocking). Awaiting user Rule Q L1 hands-on per spec § 9.

## Current State

- master = `b47a6e6` · prod LIVE at https://lover-clinic-app.vercel.app · firestore rules v34 · storage rules updated
- 35 V74-related commits (spec + plan + 24 implementation + 4 V21 fixups + handoff + probe extension + deploy docs)
- Combined V73 + V74 deployed in this session (V73 batch was already pending; V74 added on top)
- 116 V74 tests + 55 Phase 24.0 preserved with V21 fixups = 171 V74-related PASS / 0 V74-related FAIL
- 2 PRE-EXISTING flakes (V64.R6.1 + V71.RC3.2 — RTL race-condition tests flagged "intermittent under full-suite load" in active.md from V73 session) — unrelated to V74

## Commits (this session — 24 V74 implementation + handoff)

```
b47a6e6 docs(V74): active.md — DEPLOYED status
2019c4f feat(V74): probe-deploy-probe #11
df1bf38 docs(V74 T33): FULL SHIP V-entry + handoff
6914574 feat(V74 T30+T32): audit-cascade-logic C16 + V21 fixups
6c86921 feat(V74 T26+T31+T29): consolidated e2e + diag CLI + AV52-AV55
6a167f0 test(V74 T9+T12+T13+T19): adversarial bank — 22 PASS
fceed1a feat(V74 T22+T23+T24): BackupManagerTab + CustomerDataRecoveryTab + nav
d004b93 feat(V74 T14-T18): 5 backup-manager endpoints
[+ 11 earlier V74 commits + 2 docs commits — see full log via git]
```

## Files Touched (V74 surface — names only)

**Source (4 new + 2 modified)**:
- src/lib/customerBackupCore.js + customerBackupSchema.js + customerBackupConflict.js (NEW)
- src/components/backend/CustomerBackupModal.jsx + CustomerDataRecoveryTab.jsx + BackupManagerTab.jsx (NEW)
- src/components/backend/DeleteCustomerCascadeModal.jsx + CustomerDetailView.jsx (MODIFIED — V74 button + auto-backup)
- src/lib/customerDeleteClient.js (MODIFIED — v74BackupRef param)
- src/lib/tabPermissions.js + src/components/backend/nav/navConfig.js + src/pages/BackendDashboard.jsx (nav wiring)
- src/components/backend/BackupManagerTab.jsx contains inline RenameModal + DeleteConfirmModal + BulkDeleteConfirmModal
- src/components/backend/CustomerDataRecoveryTab.jsx contains inline RestoreModal

**Endpoints (7 new + 1 modified)**:
- api/admin/customer-backup-export.js (NEW)
- api/admin/customer-restore.js (NEW)
- api/admin/backup-manager-list.js (NEW)
- api/admin/backup-manager-rename.js (NEW)
- api/admin/backup-manager-delete.js (NEW)
- api/admin/backup-manager-bulk-delete.js (NEW)
- api/admin/backup-manager-download.js (NEW)
- api/admin/delete-customer-cascade.js (MODIFIED — V74 extension 11→16 + subcoll + Storage + chat + autoBackupRef AV19)

**CLI scripts (4 new)**:
- scripts/customer-backup-export.mjs · customer-delete-with-backup.mjs · customer-restore.mjs · diag-customer-backup-integrity.mjs · e2e-v74-customer-backup-real-prod.mjs
- scripts/probe-deploy-probe.mjs (MODIFIED — added probe #11 customer-backups)

**Tests (8 new + 4 V21 fixups)**:
- 7 v74-customer-backup-*.test.js + 1 e2e script
- V21 fixups: backend-nav-config.test.js I4 + phase11-master-data-scaffold.test.jsx M2 + phase16.3-flow-simulate.test.js D.1 + phase-24-0-customer-delete-modal.test.jsx M4.1/M4.1-bis/M4.2

**Rules (1 modified, both deployed)**:
- storage.rules: renamed `{branchId}` → `{prefix}` for clarity (existing wildcard already covered V74 customer-backup paths)
- firestore.rules: NO changes (admin-SDK bypasses)

**Audit skills (2 modified)**:
- .agents/skills/audit-anti-vibe-code/SKILL.md — AV52-AV55 invariants added (CRITICAL priority)
- .agents/skills/audit-cascade-logic/SKILL.md — C16 customer-wipe cascade completeness invariant

**Docs**:
- docs/superpowers/specs/2026-05-16-customer-backup-restore-design.md (NEW — 620 lines, Q1-Q6 locked)
- docs/superpowers/plans/2026-05-16-customer-backup-restore.md (NEW — 1945 lines, 33-task plan)
- .claude/rules/00-session-start.md — V74 V-entry in § 2 PAST VIOLATIONS table
- SESSION_HANDOFF.md + .agents/active.md + this checkpoint

## Decisions (one-line each — full reasoning in v-log-archive.md)

- Q1=A Maximal scope (CD+C11+CG+CS+CF+CH); AI preserved per V34/MOPH retention
- Q2=B JSON + parallel Storage tree at `backups/customers/{cid}/{ts-rand}/`
- Q3=B SAFE conflict resolution (BLOCK identity / STRIP line / ALLOW stale FK)
- Q4=C Hybrid UI (CLI + 💾 button + delete-modal enhanced + 2 admin tabs)
- Q5=B+Y+72h-grace unified manager (label-edit hash-preserved + AV19 grace + force-override)
- Q6 10-category test catalog (consolidated adversarial bank = 22 tests)
- Integrity 6-step verify (bodyHash + storageManifestHash + per-Storage-SHA-256; userNote EXCLUDED)
- AV19 elevation on delete-customer-cascade (BLOCKs on integrity fail)
- Backward compat preserved (Phase 24.0 11-cascade callers still work; V74 adds 5 + subcoll + Storage + chat as additive)

## Next Todo (user-triggered)

- Rule Q L1 multi-device hands-on per spec § 9 (6 acceptance scenarios — backup / delete-with-backup / restore / rename / bulk-delete / AV19-grace-block)
- (Optional follow-up) ZIP bundle in backup-manager-download (CLI already provides offline path)
- (Optional follow-up) wire continuous-learning-v2 hooks/observe.sh into ~/.claude/settings.json
- If L1 finds bugs → V67-class iteration (V74-bis); else V74 closed

## Resume Prompt

See SESSION_HANDOFF.md Resume Prompt block.
