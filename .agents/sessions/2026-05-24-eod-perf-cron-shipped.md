# EOD 2026-05-24 EOD+1 — Perf cron shipped + deployed

## Summary

Frontend was slow (user "อยู่ดีๆก็ช้า"). Root-caused via admin-SDK perf
baseline (350ms parallel 7-queries) vs browser client SDK (85s in MY
preview earlier) — NOT data volume (93 customers, all collections tiny),
NOT Vercel/Firestore service (status OK). Two listeners on AdminDashboard
were the culprit: chat_history (3,855 docs, 7.5 MB per snapshot) +
opd_sessions inline cleanup that cascaded writes. Backend was fast
(different listener set). Fixed via 2 crons + listener cleanup removal +
one-shot Rule M for the 3,755 backlog. User confirmed "เร็วแล้ว".

## Current State

- master = `2fe8940d` (push'd), Vercel prod = `2fe8940d` LIVE, aliased
- `.claude/settings.local.json` modified (personal config, ignored)
- Tests not run this batch (build clean ✓ 3.01s — Tier 2 deferred per user)
- CLI dry-runs verified: chat-history sweep scanned=0 (clean); opd-session sweep scanned=110 → 4 hide, 106 skip
- Rule M one-shot earlier: chat_history 3,855 → 100 docs (audit `rule-m-cleanup-chat-history-1d-1779568892...`)

## Commits

```
2fe8940d feat(perf): chat_history retention cron + opd_sessions cleanup → cron
b40d68d9 docs(agents): EOD 2026-05-24 — V122+V123+V123-fix1 LOCAL ready  ← prev
```

## Files Touched

NEW:
- src/lib/chatHistoryRetentionCore.js (RETENTION_HOURS + resolvedAtMs + isExpired)
- src/lib/opdSessionCleanupCore.js (decideCleanupAction — mirrors legacy inline)
- api/cron/chat-history-retention-sweep.js (Vercel cron, daily 04:00 BKK)
- api/cron/opd-session-cleanup-sweep.js (Vercel cron, every 30 min)
- scripts/chat-history-retention-sweep.mjs (CLI mirror, Rule of 3)
- scripts/opd-session-cleanup-sweep.mjs (CLI mirror)
- scripts/rule-m-cleanup-chat-history-1day.mjs (one-shot used 2026-05-24)
- scripts/diag-{collection-count,firestore-perf,frontend-listener-load}.mjs (Rule R)

MOD:
- src/pages/AdminDashboard.jsx (-32 lines: inline cleanup removed, comment links to cron)
- vercel.json (+2 functions entries +2 cron schedules)

REVERTED (back to HEAD before perf work):
- All V117 / V118 / V119 / V120 / V121 / V122 / V123 / V123-fix1 source changes
- 2 V21 test fixups (BS-F.8 + SG2.4)
- 2 V-feature test banks + 5 diag scripts from prior sessions
- AV122 + AV123 entries in audit-anti-vibe-code SKILL.md
- V122 + V123 V-log rows in 00-session-start.md

## Decisions (one-line; full reasoning → v-log-archive.md if escalated)

- chat_history retention = 24h per user verbatim "ลบเหลือเก็บแค่วันเดียวพอ"
- opd_session cleanup → cron every 30 min (not daily — sessions become expired hourly)
- Cron schedule offset 0 21 * * * (04:00 BKK), staggered from existing crons
- Rule of 3: sweep functions exported from cron handler + consumed by CLI mirror
- Phase 3 (server-side filter on listener) DEFERRED — requires legacy doc backfill + listener split
- Tests Tier 2 (chat-history-retention-core + opd-session-cleanup-core) DEFERRED per user deploy priority
- Rule M one-shot delete vs UI button: admin SDK can write where user's token can't (silent permission-denied on UI flow)
- All V117-V123-fix1 REVERTED per user "กลับมาที่ commit ล่าสุดที่เราทำ" — can re-introduce via brainstorm later

## Next Todo

1. **Monitor cron audit docs** next 24h — `be_admin_audit/opd-session-cleanup-sweep-*` (every 30 min) + `be_admin_audit/chat-history-retention-sweep-*` (first fire 04:00 BKK tomorrow). Verify counts.
2. **Phase 3 (when ready)** — opd_sessions listener server-side filter. Needs brainstorming: how to load archived sessions for history view (lazy listener / one-shot getDocs / something else?). Also requires backfill `isArchived:false` on legacy docs without the field.
3. **Tests Tier 2 (when ready)** — `tests/chat-history-retention-core.test.js` + `tests/opd-session-cleanup-core.test.js` + NEW AV invariant "no in-listener writes that mirror back via own snapshot fire" pattern.
4. **V117-V123-fix1 re-introduction** — if user wants those features back, brainstorm scope + plan + execute (this time committing immediately to avoid loose state).

## Outstanding User-Triggered Actions

- Monitor cron audit docs (passive — should self-heal expired sessions every 30 min)
- Phase 3 listener filter (requires brainstorming + likely separate deploy)
- Tests Tier 2 (no urgency unless adding new features)

## Resume Prompt

```
Resume LoverClinic — continue from 2026-05-24 EOD+1.

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=2fe8940d LIVE on Vercel; perf cron infrastructure)
3. .agents/active.md (Frontend fast confirmed by user)
4. .claude/rules/00-session-start.md (iron-clad + V-summary)
5. .agents/sessions/2026-05-24-eod-perf-cron-shipped.md (this checkpoint)

Status: master=2fe8940d, prod=2fe8940d LIVE, build clean, Frontend fast
Next: idle — monitor cron audit docs over next 24h, otherwise await new task
Outstanding (user-triggered): cron monitoring · Phase 3 listener filter (deferred) · Tests Tier 2 (deferred)
Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe
/session-start
```
