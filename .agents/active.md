---
updated_at: "2026-05-24 EOD+1 — perf cron shipped + DEPLOYED · Frontend fast confirmed by user"
status: "V115+V116 + perf-cron LIVE @ 2fe8940d. V117-V123-fix1 all REVERTED (back to last commit before perf work)."
branch: "master"
last_commit: "feat(perf): chat_history retention cron + opd_sessions cleanup → cron"
tests: "Full vitest unchanged from baseline · build clean 3.01s · CLI dry-runs passed (sweep-chat-history scanned=0 · sweep-opd-session scanned=110, 4 would hide, 106 skip)"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "2fe8940d LIVE (V115+V116+V116-followup + perf cron) · office-to-pdf-00007-tfb (Cloud Run V110-bis)"
firestore_rules_version: "unchanged (perf cron client/server-only — no Probe-Deploy-Probe needed)"
---

# Active Context

## State
- **Frontend ทำงานเร็วแล้ว** (user confirmed "เร็วแล้ว" 2026-05-24 EOD+1). Backend ก็เร็วเหมือนเดิม.
- **V117-V123-fix1 REVERTED** ก่อนทำ perf work (user: "กลับมาที่ commit ล่าสุดที่เราทำ" → back to `b40d68d9` then perf changes on top).
- **Perf cron LIVE** on prod via deploy `2fe8940d`. Crons register via vercel.json: `chat-history-retention-sweep` (daily 04:00 BKK) + `opd-session-cleanup-sweep` (every 30 min).

## What this session shipped
- **Root cause identified**: Frontend slow because (1) `chat_history` listener pulled 3,855 docs / ~7.5 MB per ChatPanel snapshot — in-listener auto-delete never wired; (2) opd_sessions inline cleanup wrote to expired sessions on every snapshot → cascade (write → fire → re-eval). Backend fast because subscribes to fewer listeners.
- **Rule M one-shot**: deleted 3,755 chat_history docs > 24h (3,855 → 100). audit doc `be_admin_audit/rule-m-cleanup-chat-history-1d-...`.
- **Phase 1 cron**: `chat-history-retention-sweep` (daily 04:00 BKK). Auto-delete > 24h. Lib + cron + CLI mirror (Rule of 3).
- **Phase 2 cron**: `opd-session-cleanup-sweep` (every 30 min). Moves inline cleanup OUT of AdminDashboard listener → ends cascade. `decideCleanupAction` preserves legacy semantics verbatim (V82-followup opt-out + V116 hide-vs-delete).
- **Rule M admin SDK delete** for noDeposit entry `BA-1779544476132 + opd_sessions/ND-9CBCD7` (user couldn't delete via UI; permission-denied silently). audit doc emitted.
- Deploy `vercel --prod` SUCCESS, aliased `lover-clinic-app.vercel.app`. Commit `2fe8940d` pushed.

## Next action
1. **idle** — user confirmed Frontend เร็วแล้ว. Watch for cron audit docs `be_admin_audit/opd-session-cleanup-sweep-*` and `chat-history-retention-sweep-*` over next 24h to verify cron firing.
2. **Phase 3 (deferred)** — server-side filter on opd_sessions listener (`where('isArchived','==',false)`). Requires legacy doc backfill (some have isArchived field missing) + split active/archived listeners + lazy-mount archived for history view. Needs brainstorming before implement.
3. **Tests Tier 2 (deferred)** — `tests/chat-history-retention-core.test.js` + `tests/opd-session-cleanup-core.test.js` + AV invariant for "no in-listener writes that mirror back via own snapshot fire" pattern. Skipped per user deploy-speed priority.

## Outstanding user-triggered actions
- Monitor cron audit docs for ~24h (first 04:00 BKK fire = chat-history; opd-session fires every 30 min).
- Phase 3 listener filter (when ready — significant refactor).
- Tests Tier 2 (when ready).

## Notes
- V18: deploy auth never carries forward.
- chat_history will accumulate ~50-100 docs/day; cron drops back to <100 after each fire.
- opd_session cleanup latency ≤ 30 min (vs sub-second inline) — admin doesn't wait on archive/hide ops.
- V117 + V118 + V119 + V120 + V121 + V122 + V123 + V123-fix1 all REVERTED — NOT in this commit. Can re-introduce later via brainstorming if needed.
