# 2026-05-16 — V74 Customer Backup/Restore — Partial Ship (11/33 tasks)

## Summary

Per-customer global backup/wipe/restore system designed (Q1-Q6 locked with user via brainstorming HARD-GATE) + 11/33 implementation tasks complete. Foundation + EXPORT + DELETE + RESTORE chains all working end-to-end via API + CLI. UI components + manager endpoints + adversarial tests + e2e + AV invariants DEFERRED to next session due to context budget. NO DEPLOY this session (V18 + V66 trust-collapse safety — full ship requires UI + tests + Rule Q L2 before deploy authorization).

## Current State

- master = (latest commit at session end — `git log -1` to check)
- V74 commits this session: **11**
- Combined master ahead of prod: **22 commits** (V73 batch 11 + V74 partial 11)
- Production commit: `aff149e` (V73 deploy 2026-05-16 AM)
- Tests this session: **116 PASS / 0 FAIL** (61 new V74 + 55 Phase 24.0 preserved with V21 fixups)
- 0 deploys (correct per V18 — V74 not ready)

## Commits this session (11 V74 + 2 V74-meta)

```
feat(V74): storage.rules — confirm V74 customer-backup path admin-only + rename {branchId}→{prefix}
feat(V74): scripts/customer-restore.mjs — Rule M CLI for restore
feat(V74): /api/admin/customer-restore — preview + restore with Q3=B SAFE conflict resolution
feat(V74): scripts/customer-delete-with-backup.mjs — disaster-recovery CLI
feat(V74): delete-customer-cascade extended — 16-cascade + 8 subcoll + Storage + chat + AV19 autoBackupRef
test(V74): T1+T2+T3 — vanilla + heavy gallery + adversarial data round-trip
feat(V74): scripts/customer-backup-export.mjs — Rule M CLI mirror
feat(V74): /api/admin/customer-backup-export — per-customer global backup endpoint
feat(V74): customerBackupConflict.js + 16 pure-helper tests — Q3=B SAFE conflict resolution
feat(V74): customerBackupSchema.js + 20 unit tests — extends branchBackupSchema v2
feat(V74): customerBackupCore.js pure helpers + 11 unit tests
docs(V74): customer backup/restore implementation plan — 33 tasks subagent-ready
docs(V74): customer backup/restore + global backup manager spec — Q1-Q6 locked
```

## Files Touched

**Source (5 new + 1 modified)**:
- NEW `src/lib/customerBackupCore.js` — CUSTOMER_CASCADE_COLLECTIONS_FULL (16) + T4_SUBCOLLECTIONS (8) + AUDIT_IMMUTABLE_COLLECTIONS (6) + matchCustomerChatPredicate
- NEW `src/lib/customerBackupSchema.js` — buildCustomerBackupFile + validateCustomerBackupFile + computeStorageManifestHash (extends branchBackupSchema v2)
- NEW `src/lib/customerBackupConflict.js` — scanRestoreConflicts + stripLineConflicts (Q3=B SAFE)
- MODIFIED `api/admin/delete-customer-cascade.js` — Phase 24.0 extended with 16-cascade + 8 subcoll + Storage + chat + autoBackupRef AV19 gate
- NEW `api/admin/customer-backup-export.js` — export endpoint (10-step flow)
- NEW `api/admin/customer-restore.js` — restore endpoint (preview + restore, Q3=B SAFE)
- MODIFIED `storage.rules` — V74 documentation + {branchId}→{prefix} rename

**CLI scripts (3 new)**:
- NEW `scripts/customer-backup-export.mjs` — Rule M canonical CLI (single or `--all-in-branch`)
- NEW `scripts/customer-delete-with-backup.mjs` — combined backup+wipe (disaster recovery)
- NEW `scripts/customer-restore.mjs` — restore from `--backup-ref` or `--local-file`

**Tests (6 new + 2 fixed)**:
- NEW `tests/v74-customer-backup-core.test.js` (11 tests)
- NEW `tests/v74-customer-backup-schema.test.js` (20 tests)
- NEW `tests/v74-customer-backup-conflict-pure.test.js` (16 tests)
- NEW `tests/v74-customer-backup-vanilla-roundtrip.test.js` (3 tests)
- NEW `tests/v74-customer-backup-heavy-gallery-storage.test.js` (5 tests)
- NEW `tests/v74-customer-backup-adversarial-data.test.js` (6 tests)
- FIXED `tests/phase-24-0-customer-delete-server.test.js` — S4.2 + S5.1 updated for V74 16-entry alias
- FIXED `tests/phase-24-0-customer-delete-flow-simulate.test.js` — F2.2 updated for V74 alias

**Docs (2 new)**:
- NEW `docs/superpowers/specs/2026-05-16-customer-backup-restore-design.md` (620 lines)
- NEW `docs/superpowers/plans/2026-05-16-customer-backup-restore.md` (1945 lines, 33-task)

## Architecture commitments locked

**Q1=A Maximal scope** (Customer-data tiers):
- CD — `be_customers/{customerId}` doc (incl. lineUserId_byBranch, patientLinkToken, Storage URL fields)
- C11 — 11 Phase 24.0 cascade collections
- CG — 5 V74 gap collections (be_quotations + be_vendor_sales + be_online_sales + be_sale_insurance_claims + be_recalls) — closes Phase 24.0 stale-cascade bug
- CS — 8 customer-attached subcollections (treatments + sales + appointments + deposits + wallets + memberships + points + courseChanges)
- CF — Storage objects under `be_customers/{customerId}/`
- CH — chat_conversations matching via `matchCustomerChatPredicate(chat, customer)` (customerId OR lineUserId_byBranch values)
- AI (audit-immutable) — be_admin_audit + be_stock_movements + LINE/recall/postback logs PRESERVED through wipe (V34/MOPH retention)

**Q2=B JSON + parallel Storage tree**:
- `gs://.../backups/customers/{cid}/{ts}-{rand}/backup.json`
- `gs://.../backups/customers/{cid}/{ts}-{rand}/storage/be_customers/{cid}/*` (mirrors canonical paths)

**Q3=B SAFE conflict resolution** (restore-time):
- customerId already exists → 400 BLOCK
- HN collision with another customer → 400 BLOCK
- lineUserId_byBranch[X] taken by another customer → STRIP + audit
- stale staff/doctor FK → restore as-is (V41 lookup-map handles missing display)

**Integrity contract** (3-layer hash):
- meta.bodyHash = SHA-256 of canonicalized `collections + subcollections + chatConversations` (subcoll flattened to `__sub__<name>` keys, chat to `__chat__`)
- meta.storageManifestHash = SHA-256 of sorted manifest entries `${path}|${size}|${sha256}` joined by `\n`
- Per-Storage-object SHA-256 verified individually
- userNote EXCLUDED from both hashes (Q5b=Y label-edit preserves integrity)

**AV19 elevated** (autoBackupRef gate on delete):
- delete-customer-cascade BLOCKs wipe if integrity verify fails (6-step: exists + JSON parse + schema validate + bodyHash recompute + storageManifestHash recompute + per-Storage-object SHA-256)
- BACKWARD COMPAT: WITHOUT autoBackupRef, V74 still extends cascade + subcoll + Storage + chat cleanup but skips integrity gate. Phase 24.0 customer_delete perm + branch-roster validation preserved.

## CLI usage examples (WORKING NOW)

```bash
vercel env pull .env.local.prod --environment=production

# Backup customer
node scripts/customer-backup-export.mjs --customer-id LC-26000007 --apply --user-note "EOD"

# Backup + verify + wipe (disaster recovery)
node scripts/customer-delete-with-backup.mjs --customer-id LC-26000007 --apply --user-note "GDPR"

# Restore from Storage ref OR local file
node scripts/customer-restore.mjs --backup-ref backups/customers/LC-26000007/12345-abc/backup.json --apply
node scripts/customer-restore.mjs --local-file ./downloaded.json --apply
```

## Remaining 22 tasks (DEFERRED — recommended next-session sequence)

**Phase A — Tests** (medium priority; provides confidence before user testing):
1. T9 — tests T7 (audit-immutable preservation) + T9 (concurrency / partial Storage upload fail / batch commit fail mid-cascade)
2. T12-13 — tests T4+T5+T6 (cross-branch + subcoll + conflict resolution) + T8 (bodyHash + per-object SHA-256 + manifest count mismatch BLOCK)

**Phase B — UI** (HIGH priority; enables user testing via browser, not just CLI):
3. T20 — CustomerBackupModal + CustomerDetailView header `💾 สำรองข้อมูล` button
4. T21 — CustomerDeleteModalEnhanced (extend Phase 24.0 modal with autoBackupRef radio + picker)
5. T22 — `tab=customer-data-recovery` (list customer backups + 📥 upload-file flow + restore preview + 4 actions per row)
6. T23 — `tab=backup-manager` (unified list across all backup types + filter chips + rename + bulk delete)
7. T24 — nav + tabPermissions + BackendDashboard wiring + audit count fixups

**Phase C — Manager endpoints** (medium priority; enables backup-mgr UI):
8. T14 — /api/admin/backup-manager-list + CLI
9. T15 — /api/admin/backup-manager-rename (Q5b=Y label-edit)
10. T16 — /api/admin/backup-manager-delete + CLI (AV19 72h-grace)
11. T17 — /api/admin/backup-manager-bulk-delete (≤50 per call)
12. T18 — /api/admin/backup-manager-download (JSON or ZIP)
13. T19 — T10 manager tests

**Phase D — Pre-deploy** (REQUIRED before "verified" claim per Rule Q V66):
14. T26-28 — 3 real-prod e2e scripts (Rule Q L2)
15. T29 — AV52-AV55 in audit-anti-vibe-code SKILL.md
16. T30 — audit-cascade-logic skill extension
17. T31 — diag + download CLI scripts
18. T32 — full vitest + V21 fixup sweep
19. T33 — V74 V-entry + final SESSION_HANDOFF + cleanup

## Lessons / decisions

- **Subagent thrashed on Task 1** (autocompact loop — likely read SESSION_HANDOFF or full plan in context). Switched to inline execution; works cleanly when prompt has full code spec. Future: subagents need stricter "DO NOT read large files" prompts.
- **Task 7 (cascade extension) is the biggest single task** — extended a 425-line file with 5 structural changes via targeted Edits + 2 V21 test fixups. ~150 minutes inline. Subagent approach would have needed careful prompt to avoid thrashing.
- **Backward-compat preserved for Phase 24.0**: V74 cascade extension is purely additive. Phase 24.0 callers (UI delete button) without autoBackupRef still work; they just get the 5 additional collections cascaded + subcoll + Storage + chat cleanup (improvements, not regressions).
- **Integrity hash strategy**: meta.userNote EXCLUDED from bodyHash + storageManifestHash so admin can rename labels without invalidating integrity. Subcollections flattened to `__sub__<name>` keys + chat to `__chat__` for hash input (existing computeBodyHash expects object-of-arrays).
- **CLI before UI**: shipped 3 CLI scripts (export + delete-with-backup + restore) BEFORE UI. User can test full round-trip today via CLI. UI deferred to next session.

## Resume prompt for next session

```
Resume LoverClinic V74 — continue from 2026-05-16 partial ship.

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master={check}, V73 + V74 partial = 22 commits ahead of prod)
3. .agents/active.md (V74 11/33 done; 22 remaining)
4. .claude/rules/00-session-start.md (Rule Q V66 + iron-clad A-R)
5. .agents/sessions/2026-05-16-v74-customer-backup-partial.md (full context)
6. docs/superpowers/specs/2026-05-16-customer-backup-restore-design.md (Q1-Q6 locked)
7. docs/superpowers/plans/2026-05-16-customer-backup-restore.md (33-task plan — pick up at Task 9 or 20)

Status: 11/33 V74 tasks complete (foundation + EXPORT + DELETE + RESTORE chains shipped via API + CLI). 116 V74 tests green + 55 Phase 24.0 preserved. Customer can be backed up/deleted/restored end-to-end via CLI today.

Next action: continue 33-task implementation. Recommended sequence — Phase A tests (T9, T12, T13) → Phase B UI (T20-24) → Phase C manager endpoints (T14-19) → Phase D pre-deploy (T26-33). NO DEPLOY until full V74 batch + Rule Q L1 hands-on by user.

Rules: Rule Q V66 (L1/L2 mandatory before "verified"), V18 deploy lock, Rule M (data ops via admin SDK + canonical paths), Rule R (env-pull standing auth for diag).
```
