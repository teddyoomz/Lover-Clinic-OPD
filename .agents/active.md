---
updated_at: "2026-05-17 EOD+3 LATE — V82 LIVE + full customer wipe complete; prod = fresh-start state (next HN = LC-26000001)"
status: "V82 LIVE on prod (2 rounds verified) + 3,832 customer-side docs wiped + HN counter reset; ready for frontend sync re-population"
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
Idle. Prod = fresh-start state for customers. User will sync customers from frontend going forward; first new customer will get HN = LC-26000001.

## Wipe event 2026-05-17 EOD+3 LATE
- User directive: ลบข้อมูลลูกค้าและคอร์สคงเหลือ + ทุกอย่างที่เกี่ยวกับลูกค้าทุกคน + reset HN to LC-26000001
- Sequence: V81 whole-system backup taken FIRST (AV19 mandate) → dry-run reviewed → explicit "go --apply" → executed
- Backup safety net: `backups/whole-system/pre-restore-20260517-1331/` (5,274 docs + 362 Auth users + manifestHash sha256:6422c063...)
- Recovery path: `node scripts/whole-system-restore.mjs --backup-ref backups/whole-system/pre-restore-20260517-1331/manifest.json --apply` (Replace mode + AV19 gate)
- Wiped (3,832 docs total):
  - be_customers (391) + 8 customer subcollections (0 — never populated)
  - be_treatments (15), be_sales (8), be_appointments (3), be_recalls (8)
  - chat_conversations (1), chat_history (3,324), opd_sessions (82)
  - be_deposits, be_quotations, be_online_sales, be_sale_insurance_claims (all already 0)
  - Storage uploads/be_customers/.../etc. (all already 0 — no live customer image data)
- HN counter `be_customer_counter/counter` DELETED → next addCustomer mints LC-26000001 fresh
- Preserved: be_products (606), be_courses (349), be_doctors (2), be_staff (4), be_branches (4), be_stock_* (4 each), be_admin_audit (382), be_promotions (4), all master_data, all be_*_configs
- Auth users (362) preserved — no staff logins affected
- Audit doc: `be_admin_audit/v82-followup-full-customer-wipe-1779000038538-d34ca45a`

## Outstanding (user-triggered, not auto)
- Sync first customer from Frontend (PatientForm submit → opd_sessions → admin attaches → be_customers with LC-26000001)
- Rule Q L1 user verification on prod for V82 staff chat (tab-switch chaos + badge selection + force-open block check)
- (Future) Widen V81 STORAGE_INCLUDE_PREFIXES to cover `uploads/*` so future wipes have full Storage backup coverage (architectural gap noted; no impact this wipe since 0 customer Storage files existed)
- (Future) Clean local scripts/.tmp-* diag files when comfortable
