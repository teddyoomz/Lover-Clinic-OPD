---
updated_at: "2026-05-24 EOD+1 LATE — V124 (bubble↔badge parity) + V125 (cancel cascade) LOCAL, awaiting deploy"
status: "V115+V116 + perf-cron LIVE @ 2fe8940d. V124 + V125 LOCAL (4 src + 2 tests + AV124+AV125, uncommitted). V117-V123-fix1 still reverted."
branch: "master"
last_commit: "feat(perf): chat_history retention cron + opd_sessions cleanup → cron"
tests: "118/0 PASS (V125 + V124 + V121 + V118 + AV124+AV125 chain) · build clean 2.86s"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "2fe8940d LIVE (V115+V116+V116-followup + perf cron) · office-to-pdf-00007-tfb (Cloud Run V110-bis)"
firestore_rules_version: "unchanged (V124+V125 client-only — no Probe-Deploy-Probe needed)"
---

# Active Context

## State (2026-05-24 EOD+1 LATE)
- **V124 + V125 LOCAL** — 4 src + 2 tests + AV124+AV125 amendments uncommitted. 118/0 PASS targeted. Build clean.
- **V124** = bubble↔badge predicate parity. Pre-V124 the desktop+mobile+sub-pill bubbles used `isCardFlowUnread` (V118/V120 markers required) — missed all regular จองไม่มัดจำ/มัดจำ bookings (no V118 markers). NEW `isAppointmentPendingOpdSave({appt, linkedSession}) = resolveCardOpdState === 'D'` matches row badge at AppointmentHubRowCard:172. Memo iterates `apptData.appointments` not session state arrays. Verified L1 in browser: bubble showed "1" purple `#a855f7` for BA-1779590375471 → ND-68FA49 (regular no-deposit booking).
- **V125** = cancel cascade. Pre-V125 ยกเลิก click wrote `appt.status='cancelled'` only — V124 predicate didn't check status (state-D still matched) → bubble persisted, AND linked opd_session stayed in noDepositSessions/depositSessions/sessions filters → row visible in 3 sibling tabs. Fix: (a) predicate excludes cancelled; (b) `hideOpdLifecycle` per-row covers cancelled status (defense for past sub-pill which admits cancelled); (c) `onCancelAppt` cascade-archives linked opd_session with `archivedReason:'appt-cancelled'` + `archivedFromApptId` forensic stamps. Best-effort try/catch (appt cancel must not roll back on session-archive failure).
- **V126** = workflow-strict mark-complete gate. Pre-V126 `showMarkCompleteBtn = isTodayTab && !serviceCompletedAt` (open to all statuses incl. pending). User: "ต้องกดคอนเฟืมนัดก่อน เป็นการยืนยันว่าลูกค้ามาคลินิกตามนัดแล้ว ถึงจะกด ✓ ลูกค้ารับบริการเรียบร้อย ได้". Fix: add `&& rawStatus === 'confirmed'` to gate. V71.B-ter philosophy preserved for TREATMENT concerns (hasTreatmentForDay + wasServiceCompleted still dropped); V126 is orthogonal status guard. V21 fixup absorbed: V73 test bank (B2.1 + B2.4 + B2.6 + B3.x simulator). L1 verified browser — 8 pending today rows = 0 mark buttons.
- **Frontend ทำงานเร็วแล้ว** (user confirmed earlier session). Perf cron live; backend fast.
- **V117-V123-fix1 still REVERTED** — not touched in V124/V125. Can re-introduce via brainstorm later.

## What this session shipped
- **V124 (bubble↔badge predicate parity)**: `src/lib/opdSessionState.js` + `AdminDashboard.jsx` memo (apptData iteration) + `AppointmentHubView.jsx` sub-pill memo + V121 source-grep V21 fixups + 28 V124 tests + AV124. L1 verified bubble = "1" purple.
- **V125 (cancel cascade)**: predicate status guard + `hideOpdLifecycle` per-row + `onCancelAppt` cascade-archive + 13 V125 tests + AV125. L1 verified bubble = 0 post-cancel.
- Rule R diag: `scripts/diag-v121-card-flow-bubble.mjs` + `scripts/diag-v125-state-after-cancel.mjs` — both READ-ONLY, evidenced root cause + verified fix on real prod data.

## Earlier session (perf cron, already DEPLOYED)
- Frontend slow → root cause (1) chat_history 3,855 docs/snapshot (2) opd_sessions inline cleanup cascade
- Rule M one-shot deleted 3,755 chat_history docs >24h
- Phase 1 cron: chat-history-retention-sweep (daily 04:00 BKK)
- Phase 2 cron: opd-session-cleanup-sweep (every 30 min) — moved inline cleanup OUT
- Vercel deployed @ `2fe8940d` LIVE

## Next action
1. **Commit V124 + V125** when user authorizes — single commit covers both since they're 1 systematic-debugging cycle. NOT yet committed/pushed/deployed.
2. **Deploy** awaits explicit "deploy" verb (V18). V124+V125 are client-only — no rules / index / Cloud Run change. `vercel --prod` only when authorized.
3. **Strategic roadmap (user-flagged 2026-05-24 EOD+1)**: unify นัดหมาย tab as primary source-of-truth; eventually deprecate คิวหน้า Clinic / จองไม่มัดจำ / จองมัดจำ tabs (or convert to passive views over the same data). V125 cascade is the FIRST step in that direction (cancel in นัดหมาย propagates to the 3 sibling tabs via `isArchived` filter convention). Future scope: brainstorm + plan needed before larger refactor.
4. **Phase 3 perf (still deferred)** — server-side filter on opd_sessions listener. Needs brainstorming.

## Outstanding user-triggered actions
- Commit V124 + V125 (when ready)
- Deploy (when ready)
- Brainstorm นัดหมาย-tab unification roadmap
- Monitor perf cron audit docs over next 24h

## Notes
- V18: deploy auth never carries forward.
- V124+V125 are tightly coupled — same systematic-debugging cycle, same predicate file. Ship together.
- AV124 + AV125 are closed-list invariants; new bubble surfaces MUST go through `isAppointmentPendingOpdSave` + new cancel handlers MUST cascade-archive.
- Architectural note: 4 tabs read 4 independent opd_session/be_appointment filters with no join layer. V125 cascade is a tactical fix; the strategic answer is unifying around นัดหมาย tab.
