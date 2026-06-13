---
updated_at: "2026-06-15 — appt-hub 'ย้อนหลัง 30 วัน' past tab now newest-first (yesterday at top, DESC); DEPLOYED. suite 16398/0."
status: "DEPLOYED LIVE (frontend f302216c vercel + firestore.rules e5418722 unchanged). Frontend-only — vercel-only, no Probe-Deploy-Probe. Full vitest 16398/0."
branch: "master"
last_commit: "f302216c — fix(appt-hub): past tab sorts newest-first (sortApptsByDateTimeDesc; activeTab==='past'→DESC)"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "frontend = f302216c LIVE (HTTP 200); firestore.rules = e5418722 LIVE (C2-bis, unchanged)."
firestore_rules_version: "WS1 + C2-bis (unchanged). chat_config read excluded (settingId != 'chat_config')."
tests: "16398 / 0 (full vitest, exit-0 this session — fully green; +12: F10 desc-helper ×9 + F11 source-grep ×3)."
---

# Active — 2026-06-15 — appt-hub past-tab sort flip (DESC) DEPLOYED

## State
- prod LIVE: vercel `f302216c` + firebase rules `e5418722` (unchanged). Tree clean. Frontend-only.
- Full vitest **16398/0** (exit-0). Build clean.
- `/systematic-debugging`: appt-hub "ย้อนหลัง 30 วัน" tab routed `sortApptsByDateTimeAsc`→`sortApptsByDateTimeDesc` (yesterday at top, descending into the past). Upcoming tabs (tomorrow/future/opd-pending) stay ASC; today stays confirmed-first. Print PDF inherits (buildPrintRows no re-sort). Isolated per-tab fix — no class-of-bug siblings.
- L1 (yesterday-at-top on live past tab w/ real ≤30d appts) = USER hands-on; comparator + routing + build L2-verified.

## Prior (2026-06-14 EOD — AV193/194/195 + perf backfill)
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
