---
updated_at: "2026-05-16 EOD — V74 customer backup/restore FULL SHIP (30/33 tasks)"
status: "master ahead of prod by 31+ commits (V73 batch 11 + V74 full ship 20+) · awaiting deploy authorization"
branch: "master"
last_commit: "feat(V74 T30+T32): audit-cascade-logic C16 + V21 fixups (nav color + 5 tab-count + delete-modal V74 backup)"
tests: "10566+ PASS / 2 FAIL (PRE-EXISTING V64.R6.1 + V71.RC3.2 unrelated to V74; per active.md flagged 'intermittent under full-suite load' from V73 session) / 12 skip"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "aff149e"
firestore_rules_version: 33
---

# Active Context

## State (V74 FULL SHIP — backbone + UI + manager + e2e + AV invariants COMPLETE)

- master ahead of prod by 31+ commits (V73 batch 11 + V74 full ship 20+)
- 0 deploys this session (V18 lock — V74 ready for combined deploy)
- Working tree clean except `.claude/settings.local.json` + untracked skill dirs

## V74 Session 2026-05-16 EOD — 30/33 tasks DONE (3 deferred to follow-up)

**Foundation + EXPORT + DELETE + RESTORE + MANAGER + UI + e2e + AV invariants + handoff COMPLETE.**

| Phase | Tasks done | Artifact |
|---|---|---|
| Foundation | T1-T3 | customerBackupCore.js + customerBackupSchema.js + customerBackupConflict.js (47 unit tests) |
| EXPORT | T4-T6 | /api/admin/customer-backup-export + CLI + 14 round-trip tests |
| DELETE | T7-T8 | delete-customer-cascade extended (16-cascade + 8-subcoll + Storage + chat + AV19 autoBackupRef) + CLI |
| RESTORE | T10-T11 | /api/admin/customer-restore (Q3=B SAFE) + CLI |
| MANAGER | T14-T18 | 5 endpoints (list + rename + delete + bulk-delete + download) |
| UI | T20-T24 | CustomerBackupModal + DeleteCustomerCascadeModal extended + CustomerDataRecoveryTab + BackupManagerTab + nav wiring (2 new tabs) |
| Rules | T25 | storage.rules `match /backups/{prefix}/{file=**}` covers customer paths admin-only |
| Tests | T6+T9+T12+T13+T19+T32 | 116 V74 tests + 4 V21 fixups in Phase 24.0/nav/dashboard tests |
| E2E | T26-T28 (consolidated) | scripts/e2e-v74-customer-backup-real-prod.mjs (3 scenarios: round-trip + tampering + manager) |
| AV invariants | T29 | AV52 (file integrity) + AV53 (autoBackupRef AV19 elevation) + AV54 (subcoll cascade) + AV55 (72h-grace) in audit-anti-vibe-code SKILL.md |
| Audit-cascade | T30 | audit-cascade-logic SKILL.md C16 — Customer-wipe cascade completeness invariant |
| Diag CLI | T31 | scripts/diag-customer-backup-integrity.mjs (Rule R read-only) |
| Handoff | T33 | V74 V-entry in 00-session-start.md + this active.md + SESSION_HANDOFF.md updated |

**DEFERRED (3 tasks)** — minimal value-add, NOT blocking deploy:
- T31 download CLI mirror (admin can download via signed URL from manager-list endpoint instead)
- ZIP bundle in T18 backup-manager-download (current returns JSON-only signed URL + admin uses CLI for offline ZIP)
- Additional Storage integrity checks beyond per-object SHA-256 (deemed sufficient by current 6-step verify chain)

## What's WORKING NOW

**CLI** (works on local with prod env):
```bash
vercel env pull .env.local.prod --environment=production
node scripts/customer-backup-export.mjs --customer-id LC-X --apply --user-note "EOD"
node scripts/customer-delete-with-backup.mjs --customer-id LC-X --apply --user-note "GDPR"
node scripts/customer-restore.mjs --backup-ref backups/customers/LC-X/123-abc/backup.json --apply
node scripts/diag-customer-backup-integrity.mjs --backup-ref backups/customers/...
node scripts/e2e-v74-customer-backup-real-prod.mjs --apply
```

**UI** (works on http://localhost:5173 + after Vercel deploy):
- CustomerDetailView → "💾 สำรอง" button (top-right) opens CustomerBackupModal → posts to backup-export endpoint
- CustomerDetailView → "🗑️ ลบลูกค้า" button opens DeleteCustomerCascadeModal with V74 auto-backup-before-delete checkbox (default ON)
- tab=customer-data-recovery → list + restore preview + restore flow (Q3=B SAFE conflict UI)
- tab=backup-manager → unified list across all backup types + rename + delete + bulk-delete (AV19 72h-grace warning)
- Both new tabs are admin-only (via TAB_PERMISSION_MAP)

## V74 architectural commitments locked in code

- **Q1=A Maximal scope**: CD + C11 + CG + CS + CF + CH backed up + wiped + restored; AI preserved
- **Q2=B JSON + parallel Storage tree**: `gs://.../backups/customers/{cid}/{ts-rand}/{backup.json, storage/...}`
- **Q3=B SAFE conflict resolution**: BLOCK identity / STRIP line / ALLOW stale FK
- **Q4=C Hybrid UI**: 💾 button + delete-modal enhancement + recovery tab + manager tab + CLI
- **Q5=B+Y+72h-grace**: unified manager tab + label-edit + 72h grace + force-override
- **Q6 test catalog**: 10 categories shipped (T1-T10) + adversarial consolidated test bank + 3 real-prod e2e scenarios
- **Integrity contract** (6-step verify): bodyHash + storageManifestHash + per-Storage-SHA-256 (userNote EXCLUDED)
- **AV19 elevation**: delete-customer-cascade refuses delete if integrity fails

## Next action (deploy)

**User says "deploy"** → combined:
```
vercel --prod --yes
firebase deploy --only firestore:rules,storage:rules
# Then Probe-Deploy-Probe (probes #1+5+6+7+8+9+10+11 NEW)
```

**After deploy** → Rule Q L1 hands-on by user (6 acceptance scenarios per spec § 9):
1. Click "💾 สำรอง" on customer page → backup file appears in Storage + downloadable
2. Click "🗑️ ลบ" with autoBackup ON → AV19 integrity verify fires + cascade wipes + Storage cleanup
3. Open tab=customer-data-recovery → find backup → 🔄 กู้คืน → preview shows correct counts + 0 conflicts → confirm → customer reappears identical
4. Open tab=backup-manager → rename a backup label → re-list shows new label (hash preserved)
5. Select 3 backups → bulk delete → 3 audit docs + Storage trees cleaned
6. Try delete a backup that was the autoBackupRef <72h ago → BLOCKED with AV19_GRACE_PERIOD error + admin sees audit ref

## Outstanding (user-triggered)

- `vercel --prod --yes` + `firebase deploy --only firestore:rules,storage:rules` for combined V73 + V74 ship (31+ commits)
- Rule Q L1 multi-device hands-on per acceptance scenarios above
- (Optional) wire continuous-learning-v2 `hooks/observe.sh` into `~/.claude/settings.json`
