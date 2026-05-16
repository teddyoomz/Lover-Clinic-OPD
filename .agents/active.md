---
updated_at: "2026-05-17 EOD+1 ~03:45 BKK — V81-fix2 ack-gate patched + V81 PROVEN end-to-end"
status: "V81 + V81-fix1 LIVE; V81-fix2 patched (NOT deployed). Awaiting USER deploy verb."
branch: "master"
last_commit: "928628f proof(V81): real-prod backup→wipe→restore byte-identical PROVEN (Rule Q L1 final)"
tests: "V81 cumulative 140/140 + V81-fix2 25/25 + 3 stale tests fixed (66/66 affected) = 168 V81-family tests green"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "9107fd0 V81 + V81-fix1 LIVE (Rule Q L1 PROVEN); 1 commit ahead of prod (V81-fix2 not deployed)"
firestore_rules_version: "v35 + 5 V78 composite indexes (unchanged this session)"
---

# Active Context

## State
- V81 ULTIMATE TEST EXECUTED: real-prod backup→wipe→restore byte-identical PROVEN ($928628f proof commit). 5059 docs + 353 auth users round-tripped with ZERO structural data loss.
- V81-fix2 (ack-gate) PATCHED locally — prevents future silent staff-lockout by forcing UI checkbox + endpoint validation + executor double-check before Replace mode.
- Owner login restored (loverclinic@loverclinic.com / Lover2024). 352 other staff still need password reset via standard "ลืมรหัสผ่าน" flow.

## What this session shipped
- V81-fix1: Timestamp/GeoPoint/Bytes encode-decode through markers (140/140 tests; real-prod verified) — caught via Rule Q V66 real-data introspection
- V81 final real-prod roundtrip proof (`scripts/v81-final-real-prod-roundtrip-proof.mjs`) — 5-safety-net orchestrator; verified byte-identical
- V81-fix2 ack-gate (NEW this turn, NOT deployed): UI warning + ackPasswordResetRequired flag + forced sendPasswordResetEmails on Replace
- 3 stale V21-class tests fixed (WF1.7 + RC3.2 + R6.1) → 66/66 PASS
- AV65 + AV66 audit invariants codified at CRITICAL priority
- Verbose V81 + V81-fix1 V-entries appended to v-log-archive.md (2194 lines)
- Java JDK 21 (Zulu) + Google Cloud SDK installed (toolchain expanded)
- Emergency owner password restore script (`scripts/v81-emergency-owner-restore.mjs`)

Checkpoint: `.agents/sessions/2026-05-17-v81-fix2-ack-gate.md`

## Next action
USER `deploy` verb → `vercel --prod` to ship V81-fix2 (1 commit ahead). After deploy: optional staff password resets (each user can use "ลืมรหัสผ่าน" on login page).

## Outstanding user-triggered actions
- `deploy` verb → vercel --prod (V81-fix2 patched but not LIVE)
- 🚨 **NEW BUG**: backup Download button returns "A server error... is not valid JSON" — `/api/admin/whole-system-backup-download` endpoint failure (Vercel 500). Investigate next session — not V81-related, separate latent issue.
- 352 staff still need password reset (use "ลืมรหัสผ่าน" on login page) — Firebase sends reset emails
- Cleanup recovery references when comfortable: `scripts/.tmp-final-roundtrip-backup-1778961439997/` (local 7MB) + 3 backups in Storage (Backup A/B/C from 02:57-03:03)
- (Future) Java/Node 24 SDK compat for emulator E.2-E.11
- (Future) gcloud clone-verify secondary-DB setup
