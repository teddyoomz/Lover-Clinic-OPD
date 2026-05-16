---
updated_at: "2026-05-16 V74 customer backup/restore — partial ship (11/33 tasks done)"
status: "master ahead of prod · V73 batch (11 commits, awaiting deploy) + V74 partial (11 commits, 11/33 tasks complete) = 22 commits ahead"
branch: "master"
last_commit: "feat(V74): storage.rules — confirm V74 customer-backup path admin-only + rename {branchId}→{prefix}"
tests: "10579+ PASS / 0 FAIL / 12 skip (10463 prior + 116 V74-related this session; full suite not run yet — pending Task 32 next session)"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "aff149e"
firestore_rules_version: 33
---

# Active Context

## State (V74 partial ship — backbone complete, UI deferred)

- master 22 commits ahead of prod (V73 batch 11 + V74 partial 11)
- 0 deploys this session (V18 lock — V74 not ready for deploy until UI + tests + e2e complete)
- Working tree clean except `.claude/settings.local.json` + untracked skill dirs

## V74 Session 2026-05-16 — 11/33 tasks DONE

**Foundation + EXPORT + DELETE + RESTORE chains COMPLETE end-to-end via API/CLI.**

| Task | Status | Artifact |
|---|---|---|
| T1 customerBackupCore.js | ✓ | 11 unit tests |
| T2 customerBackupSchema.js | ✓ | 20 unit tests + extends V40 schema |
| T3 customerBackupConflict.js | ✓ | 16 unit tests Q3=B SAFE |
| T4 /api/admin/customer-backup-export | ✓ | endpoint live |
| T5 scripts/customer-backup-export.mjs | ✓ | CLI mirror (Rule M) |
| T6 T1+T2+T3 round-trip tests | ✓ | 14 tests (vanilla + 20-img gallery + adversarial) |
| T7 delete-customer-cascade extended | ✓ | 11→16 cascade + 8 subcoll + Storage + chat + autoBackupRef AV19 gate + 2 V21 fixups |
| T8 scripts/customer-delete-with-backup.mjs | ✓ | CLI (disaster recovery) |
| T10 /api/admin/customer-restore | ✓ | preview + restore + Q3=B SAFE + integrity verify |
| T11 scripts/customer-restore.mjs | ✓ | CLI (--backup-ref or --local-file) |
| T25 storage.rules | ✓ | covers `backups/customers/*` admin-only |

**Total V74 tests**: 116 PASS (61 new + 55 Phase 24.0 preserved with V21 fixups)
**Total V74 commits**: 11

## What's WORKING right now via CLI

```bash
# Pull prod env (Rule R)
vercel env pull .env.local.prod --environment=production

# 1. Backup customer to Storage (dry-run default; --apply commits)
node scripts/customer-backup-export.mjs --customer-id LC-X --apply --user-note "EOD snapshot"

# 2. Backup + verify + wipe (combined for disaster recovery)
node scripts/customer-delete-with-backup.mjs --customer-id LC-X --apply --user-note "GDPR request"

# 3. Restore from Storage ref OR local JSON file
node scripts/customer-restore.mjs --backup-ref backups/customers/LC-X/12345-abc/backup.json --apply
node scripts/customer-restore.mjs --local-file ./downloaded-backup.json --apply
```

All 3 paths write audit docs to `be_admin_audit/customer-{op}-{id}-{ts}-{rand}` with bodyHash + storageManifestHash + per-Storage-SHA-256 integrity hashes.

## Remaining 22/33 tasks (DEFERRED — next session)

**Critical path** (do these next):
- T9: tests T7 (audit-immutable preservation) + T9 (concurrency / rollback / partial Storage upload fail)
- T12-13: tests T4+T5+T6 (cross-branch + subcoll + conflict resolution) + T8 (tampering detection)
- **T20-24: UI** (CustomerBackupModal in CustomerDetailView + CustomerDeleteModalEnhanced + CustomerDataRecoveryTab + BackupManagerTab + nav wiring)

**Manager endpoints** (T14-19 — admin can manage all backup files):
- T14 backup-manager-list + CLI
- T15 backup-manager-rename (Q5b=Y label-edit, hash-preserving)
- T16 backup-manager-delete + CLI (AV19 72h-grace gate)
- T17 backup-manager-bulk-delete (≤50 per call)
- T18 backup-manager-download (JSON or ZIP)
- T19 T10 manager tests

**Pre-deploy** (must before "verified" claim):
- T26-28: 3 real-prod e2e scripts (Rule Q L2)
- T29: AV52-AV55 invariants in audit-anti-vibe-code SKILL.md
- T30: audit-cascade-logic skill extension (subcoll cascade discipline)
- T31: diag + download CLI scripts
- T32: full vitest + V21 fixup sweep
- T33: V74 V-entry + final SESSION_HANDOFF

## V74 architectural commitments locked in code

- **Q1=A Maximal scope**: CD + C11 + CG + CS + CF + CH backed up + wiped + restored; AI tier (be_admin_audit + be_stock_movements + LINE/recall logs) preserved through wipe per V34/MOPH
- **Q2=B JSON + parallel Storage tree**: `gs://.../backups/customers/{cid}/{ts-rand}/{backup.json, storage/...}`
- **Q3=B SAFE conflict resolution**: BLOCK on customerId-exists / HN collision; STRIP lineUserId conflicts; ALLOW stale FKs
- **Q4=C Hybrid UI** (UI itself pending T20-24): CLI for now; UI surfaces planned
- **Q5=B+Y+72h-grace** (manager pending T14-19): unified backup-manager tab with label-edit + 72h grace
- **Integrity contract**: bodyHash (SHA-256 of canonical collections+subcoll+chat) + storageManifestHash (SHA-256 of sorted manifest entries) + per-Storage-object SHA-256 — ALL verified before any wipe/restore
- **AV19 elevation**: delete-customer-cascade refuses delete if autoBackupRef integrity fails

## Next action (next session)

**FIRST tool call**: read [.agents/sessions/2026-05-16-v74-customer-backup-partial.md](sessions/2026-05-16-v74-customer-backup-partial.md) for full context + resume prompt.

**Recommended sequence**: T9 tests → T12-13 tests → T20 backup button (UI) → T21 delete modal enhanced → T22 recovery tab → T23 manager tab → T24 nav → T14-19 manager endpoints → T26-28 e2e → T29-31 AV + diag → T32 full suite → T33 V-entry + handoff → user "deploy" verb for combined V73 + V74 batch.

## Outstanding (user-triggered)

- `vercel --prod --yes` for combined V73 (11) + V74 partial (11) = 22 commits, BUT V74 deploy should wait until UI + tests + e2e complete (V18 + V66 trust-collapse safety)
- After full V74 ship: Rule Q L1 hands-on via 6 acceptance scenarios per spec § 9
- (Optional) wire continuous-learning-v2 `hooks/observe.sh` into `~/.claude/settings.json`
