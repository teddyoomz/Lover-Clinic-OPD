---
updated_at: "2026-05-04 EOD — V15 #16 LIVE; Phase BSA + leak sweeps + Phase BS V3 + wiki bootstrap shipped"
status: "master=f39760b = prod LIVE (V15 #16) · 4997 tests pass · 0 commits ahead-of-prod"
current_focus: "idle — Phase 17 plan TBD; wiki expand on demand"
branch: "master"
last_commit: "f39760b"
tests: 4997
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "f39760b"
firestore_rules_version: 25
storage_rules_version: 2
---

# Active Context

## State
- master = `f39760b` = **prod LIVE (V15 #16)** — 0 commits ahead; firestore.rules v25 (be_line_configs added)
- 4997/4997 tests pass · build clean · BSA + leak sweeps + Phase BS V3 LINE all live
- llm-wiki skill installed at `~/.claude/skills/llm-wiki/` (auto-loaded session boot per user-level CLAUDE.md)

## What this session shipped
- **Phase BSA** (12 tasks `e13f3c5`..`c5f0a58`): 3-layer wrapper (raw / scopedDataLayer / useBranchAwareListener) + audit + flow-simulate. **🎯 USER BRANCH-LEAK BUG CLOSED.**
- BSA leak sweep `17f8ca4`: 6 UI surfaces filter; 22 staff + 27 doctors → branchIds=[นครราชสีมา]
- Phase BS V3 LINE `40e9d8e`: `be_line_configs/{branchId}` collection + webhook routing by `event.destination` + LinkRequests stamp
- BSA leak sweep 2 `45ad80c`: Stock OrderPanel re-load + 48 docs (promotions/coupons/vouchers/deposits) migrated
- Wiki bootstrap `f39760b`: 12-page wiki (Karpathy pattern); user-level llm-wiki skill installed as base
- V15 #16 deploy LIVE: vercel + firebase rules + Probe-Deploy-Probe 5/5 ✓ pre + post + cleanup
- Checkpoint: `.agents/sessions/2026-05-04-phase-bsa-line-wiki.md`

## Decisions (this session)
- BSA architectural choice over per-callsite refactor — central wrapper at import boundary + audit invariants
- LINE config collection-based (`be_line_configs/{branchId}`); webhook routes by `event.destination`
- Customer-attached collections (wallets/memberships/points/customer-deposit-lookup) stay universal even when sibling list-paths branch-scope
- llm-wiki = always-on default mode for knowledge work per user "ใช้เป็นหลักเหมือนอากาศหายใจ"
- be_deposits added to branch-scoped set (Finance Deposit sub-tab); other Finance sub-tabs stay as-is

## Next action
Idle — awaiting next user direction. Phase 17 plan TBD.

## Outstanding user-triggered actions
- Browser smoke verify per-branch UI behavior on prod (BSA leak fixes + LINE per-branch + Deposit per-branch)
- LineSettingsTab พระราม 3 — admin must enter Channel Secret + Access Token for second LINE OA
- Hard-gate via Firebase custom claim (Phase BS-future)
- /audit-all orchestrator readiness pass
- Wiki expand on demand: Phase plans / V-entries / major files / Firestore collections

## Rules in force
- V18 deploy auth (per-turn "deploy"; no roll-over); V15 combined; Probe-Deploy-Probe Rule B (5 endpoints)
- Rule J brainstorming HARD-GATE + ORTHOGONAL plan-mode; Rule K work-first test-last
- Rule H-quater no master_data reads in feature code; Rule L BSA (BS-1..BS-8 audit-blocking)
- V36.G.51 lock (data layer no React); NO real-action clicks in preview_eval; V31 silent-swallow lock
- llm-wiki always-on (boot session + auto-detect `wiki/index.md`)
