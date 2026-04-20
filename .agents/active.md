---
updated_at: "2026-04-20"
status: "active"
current_focus: "Phase 12 complete + 12.11 adapter shipped — awaiting Phase 13 decision"
branch: "master"
project_type: "node (React 19 + Vite 8 + Firebase + Tailwind 3.4)"
last_commit: "57da3ba"
tests: 2850
---

# Active Context

## Objective
Finish Phase 12 financial data layer + prep for Phase 13 (quotations / schedules / DF / permission / treatment validator).

## Current State
- **Phase 12 DONE** — all 11 sub-tasks (12.0 through 12.10 + 12.11 bonus) shipped and pushed.
- **Last commit**: `57da3ba feat(phase12.11): be_* → master_data adapter (4 types) + debug delete button`
- **Tests**: 2850 passing (2373 baseline → +477 this session)
- **Build**: clean
- **firestore.rules**: modified but NOT deployed — 9 new be_* match blocks waiting. User needs to run `firebase deploy --only firestore:rules` + Rule B Probe-Deploy-Probe.
- **Vercel env vars pending**: `FIREBASE_ADMIN_CLIENT_EMAIL` + `_PRIVATE_KEY` + optional `_BOOTSTRAP_UIDS` before `/api/admin/users` calls succeed.

## Blockers
1. `firebase deploy --only firestore:rules` pending — until deployed, Phase 12 tabs get `PERMISSION_DENIED` in production.
2. Weekly token budget ~5% — cannot fit full Phase 13 (~23h, 6 sub-tasks) in remaining session.

## Next Action
User decision on Phase 13 approach:
- **Option A**: Stop here + handoff. Full budget next week for Phase 13.
- **Option B**: Ship lightest sub-task (13.5 Permission tab-gate, ~3h, +30 tests). Low risk, high value (wires be_permission_groups from 11.7 to user.permissionGroupId at tab render).
- **Option C**: 13.5 + 13.6 Treatment validator (~7h, +70 tests). Risk: token exhaustion mid-task.

See `.agents/sessions/2026-04-20-phase-12-complete.md` for full checkpoint + resume prompts.

## Notes
- `.agents/` scaffold installed this turn via agent-context-kit (`bash agents.sh`). This file + session note are the first entries.
- `.claude/rules/00-04` + `CLAUDE.md` remain iron-clad source of truth. `.agents/` is advisory + working-state only.
