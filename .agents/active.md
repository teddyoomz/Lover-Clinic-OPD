---
updated_at: "2026-05-17 EOD+3 — V82 staff chat cursor + force-open + role badges LIVE; 11294/11294 PASS / 0 FAIL; both deploy rounds verified"
status: "V82 LIVE on prod (both rounds); 0 V82 regressions; all 17 pre-V82 baseline stale fails closed; perfect green"
branch: "master"
last_commit: "44737de3 fix(V82-followup): strip 2 IIFE-in-JSX from BackupManagerTab (Rule C3) — RP1 lock"
tests: "11294/11294 PASS / 0 FAIL / 18 skip (V21 markers + 6 emulator-skip Java-gated); build clean 3.12s"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "V82 + cleanup batch LIVE — last aliased deploy https://lover-clinic-4lct44tkm-teddyoomz-4523s-projects.vercel.app"
firestore_rules_version: "unchanged (V82 = no rules change); idempotent re-release per V15 + V1/V9 console-drift defense"
---

# Active Context

## State (PERFECT)
- V82 implementation LIVE: persistent read cursor + force-open until read + 4 role badges (แพทย์/ผู้ช่วยแพทย์/พนักงาน/ผู้จัดการ)
- Bug #2 closed permanently — useStaffChat's `lastSeenIdsRef = useRef(new Set())` replaced with localStorage cursor per-(device, branchId); tab switches no longer resurrect read state
- Force-open: minimize button disabled until cursor reaches latest message (scroll-to-bottom advances cursor via IntersectionObserver)
- Role badge: optional, persisted to localStorage, rendered inline before sender name in chat bubbles + below name in NamePicker (lg=40px) / inside bubble (sm=16px)
- AV76 invariant codified — useRef(new Set()) for Firestore listener dedup forbidden across remount
- 17 pre-V82 baseline V21-stale failures ALL CLOSED in V82-followup batch (V77 BMT + V81-fix2 K.* + v81-source-grep archiver + AV67.1 + V75 button-polish + RP1 IIFE in BackupManagerTab)

## What this session shipped
- Brainstorming Q1-Q4 → spec → 13-task plan → 6 subagent-driven chunks → final verify
- 14 commits ahead of pre-session HEAD (40e63cf → 44737de3) all pushed + 2 deploy rounds verified
- Round 1 deploy: V82 core implementation — Vercel `2b156ltbl` aliased; Firebase rules idempotent; 6/6 pre/post probes; L2 verify PASS
- Round 2 deploy: V21 cleanup batch + BackupManagerTab Rule C3 fix — Vercel `4lct44tkm` aliased; Firebase rules idempotent; 6/6 pre/post probes; L2 verify PASS
- V82 V-entry appended to `.claude/rules/00-session-start.md` § 2 PAST VIOLATIONS table

Checkpoint: V82 LIVE round 2 = master 44737de3; production hash = same.

## Files touched this session (commits ahead of 40e63cf)
- NEW: src/lib/staffChatReadCursor.js (cursor module)
- NEW: src/components/staffchat/StaffChatRoleBadge.jsx
- NEW: tests/v82-staff-chat-cursor-and-badge.test.js (41 it() blocks, ~60 expects)
- NEW: scripts/v82-staff-chat-stress.mjs (10 scenarios)
- NEW: scripts/v82-cursor-l2-verify.mjs (5-refire admin-SDK)
- MODIFIED: src/hooks/useStaffChat.js (cursor + canMinimize + markScrolledToBottom + role wire; Timestamp shape fix)
- MODIFIED: src/lib/staffChatIdentity.js (getRole/setRole/ROLE_KEYS/ROLE_LABELS_TH)
- MODIFIED: src/lib/staffChatClient.js (buildMessageDoc senderRole)
- MODIFIED: src/components/staffchat/StaffChatNamePicker.jsx (role section + Rule C3 IIFE strip)
- MODIFIED: src/components/staffchat/StaffChatMessage.jsx (RoleBadge inline)
- MODIFIED: src/components/staffchat/StaffChatMessageList.jsx (bottomSentinelRef + IntersectionObserver)
- MODIFIED: src/components/staffchat/StaffChatHeader.jsx (canMinimize disabled gate)
- MODIFIED: src/components/staffchat/StaffChatPanel.jsx + StaffChatWidget.jsx (markScrolledToBottom prop wiring)
- MODIFIED: src/components/backend/BackupManagerTab.jsx (2 IIFE-in-JSX stripped per Rule C3; extracted formatBytesDisplay helper)
- MODIFIED: .agents/skills/audit-anti-vibe-code/SKILL.md (AV76 invariant)
- MODIFIED: 7 V73 sibling tests (V21 fixups for (name,color,role) signature + force-open semantics + cursor-relative dedup)
- MODIFIED: 4 V81-followup test files (skip with V21 markers for V81-fix4/V81-fix6b removed surfaces)

## Next action
Idle. User Rule Q L1 hands-on encouraged: switch Frontend↔Backend rapidly post-deploy; verify badge count stays 0; verify minimize button disabled when unread > 0; verify role badges appear in NamePicker + bubble.

## Outstanding (user-triggered, not auto)
- Rule Q L1 user verification on prod (multi-device tab-switch chaos + badge selection + force-open block check)
- (Future) Clean local scripts/.tmp-* diag files when comfortable
