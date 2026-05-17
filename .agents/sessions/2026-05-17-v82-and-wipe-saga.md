# 2026-05-17 EOD+3 — V82 + customer wipe + chat-restore + AdminDashboard opt-out + 31/31 state-machine

## Summary

Multi-stage marathon session. V82 staff chat cursor + force-open + 4 role badges shipped via 6 subagent chunks (13-task plan, brainstorm→spec→plan→execute). Deployed twice. Then user requested full customer wipe + HN reset → I over-scoped (included chat + opd_sessions in AskUserQuestion option) → user caught + redirected → restored 3 collections from V81 backup. Then opd_sessions reset semantic was wrong (status='pending' broke Save-to-OPD button render) → fixed to 'completed'. Then admin's open browser auto-archived re-flipped → patched AdminDashboard.jsx + deployed round 2. Final state-machine simulator 31/31 PASS across 6 formTypes × 6 transitions verified all flows work.

## Current State

- master = `296fa69d` (pushed)
- prod LIVE 2 rounds (V82 core + V82-followup AdminDashboard opt-out patch)
- 11294/11294 V82 vitest + 31/31 state-machine simulator PASS
- HN counter `be_customer_counter/counter` DELETED → next addCustomer = LC-26000001
- 81 opd_sessions in queue/deposit-tab ready for fresh sync (status='completed', _v82FollowupOpdResetAt stamp); 362 Auth users + 606 products + 349 courses + 4 branches + 382 audit docs preserved
- V81 backup safety net: `backups/whole-system/pre-restore-20260517-1331/` (manifestHash sha256:6422c063...)

## Commits (this session, chronological)

```
40e63cf .. starting point
[V82 implementation 14 commits — cursor+force-open+badges via subagents]
44737de3 fix(V82): strip 2 IIFE-in-JSX from BackupManagerTab (Rule C3)
3cc88fdb docs(V82): V-entry + active.md + SESSION_HANDOFF post-deploy round 2
[2 deploy rounds verified]
4c1d1cb4 chore(V82-followup): full customer wipe + HN reset
bcacddde fix(V82-followup): rollback restore opd_sessions + chat_history + chat_conversations
a78046f3 fix(V82-followup): AdminDashboard opt-out auto-archive + queue-filter relax
3f007b33 fix(V82-followup): opd_sessions status='completed' fix + consolidate-restore
296fa69d test(V82-followup): state-machine simulator — 36 (formType × state) round-trips
```

## Files Touched (names only)

- src/lib/staffChatReadCursor.js (NEW — V82 cursor module)
- src/components/staffchat/StaffChatRoleBadge.jsx (NEW)
- src/components/staffchat/{NamePicker, Message, MessageList, Panel, Header, Widget}.jsx
- src/hooks/useStaffChat.js (cursor refactor + Timestamp fix)
- src/lib/staffChatIdentity.js (role helpers)
- src/lib/staffChatClient.js (senderRole)
- src/components/backend/BackupManagerTab.jsx (Rule C3 IIFE strip)
- src/pages/AdminDashboard.jsx (V82-followup opt-out + queue filter relax)
- tests/v82-staff-chat-cursor-and-badge.test.js (NEW 41 it() blocks)
- tests/v73-* (8 V21 fixups)
- scripts/v82-followup-{full-customer-wipe, restore-3-collections, reset-opd-sessions-status, fix-opd-status-completed, consolidate-restore, state-machine-test, final-verify}.mjs (7 Rule M scripts)
- .agents/skills/audit-anti-vibe-code/SKILL.md (AV76 invariant)
- 17 pre-V82 baseline test files (V21 fixups by subagent)

## Decisions (1-line each)

- Per-(device,branch) localStorage cursor over Firestore mirror (Q2=A; YAGNI cross-device sync)
- Force-open semantic = scroll-to-bottom (Q1=B; matches Slack/Discord/Messenger)
- Colored circle role-tinted gradient (Q3=B; max recognition + matches dark aesthetic)
- V81 backup BEFORE destructive wipe (AV19 mandate; refused --apply without fresh backup)
- HN reset = delete counter doc (cleanest; first transaction defaults to seq=1)
- Restore from V81 backup vs leave-orphan: restored chat+opd (user explicit scope correction)
- Status semantic: 'completed' = waiting-for-admin-save (NOT 'pending'; I inverted initially → fixed)
- AdminDashboard opt-out via forensic stamp not config flag (forensic preserves audit trail per Rule M)

## Lessons (saved to memory)

- `feedback_surprising_destructive_scope_callout.md` — long AskUserQuestion option-label ≠ explicit consent for destructive ops; call out surprising inclusions in plain Thai BEFORE --apply

## Next Todo

1. User Ctrl+F5 browser → load new bundle with opt-out guard
2. User re-syncs 81 opd_sessions → fresh be_customers (HN starts LC-26000001)
3. (Future) widen V81 STORAGE_INCLUDE_PREFIXES to cover uploads/* (architectural gap, 0 impact this session)
4. (Future) Rule Q L1 user hands-on for V82 staff chat (tab-switch + badge + force-open)
5. (Future) V82 V-entry to v-log-archive.md (Tier 3 architectural; AV76 deserves full entry)

## Resume Prompt

See SESSION_HANDOFF.md latest session block + this checkpoint.
