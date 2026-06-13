---
updated_at: "2026-06-14 EOD — AV193 branch-count + AV194 perf-assessment projection + Rule M backfill (28) + AV195 chat_config cleanup; ALL DEPLOYED; suite 16386/0 (first fully-green)."
status: "DEPLOYED LIVE (frontend 201bd106 vercel + firestore.rules e5418722 unchanged). All today's work frontend-only — vercel-only, no Probe-Deploy-Probe. Full vitest 16386/0."
branch: "master"
last_commit: "201bd106 — test: 3 long-standing flakes made deterministic (16386/0) + Rule R backup-search diag"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "frontend = 201bd106 LIVE (HTTP 200); firestore.rules = e5418722 LIVE (C2-bis, unchanged this session)."
firestore_rules_version: "WS1 + C2-bis (unchanged 2026-06-14). chat_config read excluded (settingId != 'chat_config')."
tests: "16386 / 0 (full vitest, last run this session — fully green)."
---

# Active — 2026-06-14 EOD — AV193/194/195 + perf backfill

## State
- prod LIVE: vercel `201bd106` + firebase rules `e5418722` (unchanged). Tree clean. All today's work frontend-only.
- Full vitest **16386/0** — first fully-green (3 prior flakes made deterministic this session).
- 2 prod data mutations idempotent + stable (orphan-branchIds, perf backfill 28). 0 drift.

## What this session shipped (detail → checkpoint 2026-06-14-av193-194-195-perf-and-chatconfig.md)
- **AV193** — StaffTab/DoctorsTab branch count live-resolves vs be_branches (orphan TEST-V81 branchId showed 4/3). + Rule M cleanup of OoMz+Mild orphan ids.
- **AV194** — kiosk perf/hormone assessment (symp_pe/ADAM/IIEF-5/MRS, 27 fields) now carried thru opd_session→be_customers projection (V141/AV162 class; 3-mapper triangle + pickKioskAssessmentFields). New shared `src/lib/kioskAssessmentFields.js`.
- **Rule M backfill** — 28 customers' perf recovered from surviving opd_sessions (strong match; ambiguous skipped; idempotent). ภูดิท LC-26000151 unrecoverable (session deleted + not in any backup).
- **AV195** — removed 2 dead client-SDK reads of secret chat_config (fbConfig auto-seed + ChatPanel legacy fallback) — WS1 security collateral; per-branch configs are primary; killed console-error noise. + 6 V21 fixups.
- **Verification pass** — proved 3 long-standing suite reds = test-infra flakes (not bugs, not today); made deterministic → 16386/0. Origin: score bug did NOT come from security work (git -S).

## Next action
- IDLE / await direction.

## Outstanding user-triggered actions
- ⚠ **ROTATE** LINE channelSecret/accessToken + FB appSecret/pageAccessToken (chat_config held OLD secrets; AV195 reinforces).
- L1 hands-on: intake perf render for 28 backfilled customers + staff branch count + chat panel post-cleanup.
- Optional: ภูดิท re-assessment (recover per-item) · LC-26000082 ambiguous backfill (pick session) · SESSION_HANDOFF ~207KB > 200KB cap → archive · deferred audit tail (firebase-admin 14 + transitive dev HIGH).
