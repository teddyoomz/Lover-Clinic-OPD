---
updated_at: "2026-05-17 EOD+3 LATE+2 — V82 LIVE + customer wipe + chat/opd restore + state-machine 31/31 PASS"
status: "Prod fresh-start (HN=LC-26000001); 81 opd_sessions ready for re-sync; state-machine verified 100%"
branch: "master"
last_commit: "296fa69d test(V82-followup): state-machine simulator — 36 (formType × state) round-trips against real prod"
tests: "V82 family 133/133 + V82-followup state-machine 31/31 PASS (6 formTypes × 6 states); 17 pre-V82 baseline closed earlier"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "2 rounds LIVE — V82 core + V82-followup AdminDashboard opt-out (44737de3 then a78046f3)"
firestore_rules_version: "unchanged; idempotent re-release per V15 both rounds"
---

# Active Context

## State
- V82 LIVE 2 rounds (cursor+force-open+role badges, then AdminDashboard auto-archive opt-out)
- Customer wipe: 3,832 docs deleted (be_customers 391 + treatments/sales/appointments/recalls), HN counter reset → next = LC-26000001
- Chat + opd_sessions RESTORED from V81 backup pre-restore-20260517-1331 (initial over-wipe corrected): chat_history 3,323 + chat_conversations 1 + opd_sessions 82
- 81 opd_sessions reset to status='completed' + isArchived=false + _v82FollowupOpdResetAt forensic stamp → in queue with Save-to-OPD button visible
- AdminDashboard auto-archive + queue filter patched to opt-out on _v82FollowupOpdResetAt stamp (deploy round 2)

## What this session shipped
- V82 staff chat cursor + force-open + 4 role badges (brainstorm→plan→6 subagent chunks→deploy round 1)
- All 17 pre-V82 baseline V21-stale fails closed → 11294/11294 PASS
- Customer wipe (per user "ลบลูกค้า backend + reset HN") via Rule M canonical 3-script saga
- Chat+opd over-wipe acknowledgement + V81 backup restore (saved lesson `feedback_surprising_destructive_scope_callout.md`)
- AdminDashboard opt-out patch + state-machine 31/31 PASS verification across 6 formTypes × 6 states

Checkpoint: `.agents/sessions/2026-05-17-v82-and-wipe-saga.md`

## Next action
Idle. User Rule Q L1: Ctrl+F5 browser → verify 81 opd_sessions appear in queue (intake/walkin/followup/custom) + DEP-* in deposit tab. Then re-sync each into fresh be_customers (HN starts LC-26000001).

## Outstanding (user-triggered, not auto)
- Hard-refresh browser → load new bundle with opt-out guard
- Re-sync 81 opd_sessions → fresh be_customers via "Save to OPD" button
- (Future) widen V81 STORAGE_INCLUDE_PREFIXES to cover `uploads/*` (architectural gap noted; 0 impact this session)
- (Future) Rule Q L1 hands-on for V82 staff chat (tab-switch chaos + badge + force-open)
