---
updated_at: "2026-05-31 EOD+6 — Staff-chat desktop resizable panel SHIPPED (brainstorm→spec→plan→impl, 4 commits, pushed). NOT deployed."
status: "17 commits ahead of prod, pushed to origin/master. NOT deployed (await 'deploy'). Frontend/lib only → no Probe-Deploy-Probe."
branch: "master"
last_commit: "3678f6c5 (Task 3 flow-simulate). prod = 0c607f68 LIVE."
tests: "15469/0 full suite (ran this session after Task 3; +29 new vs 15440; NOT re-run at session-end per rule)."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "0c607f68 LIVE (V142 course double-deduct + V143 stock). UNCHANGED this session."
firestore_rules_version: "UNCHANGED. No rules/storage/index/cron touched."
---

# Active Context — staff-chat desktop resizable panel (2026-05-31 EOD+6)

## State
- NEW feature: desktop staff-chat box is freely resizable — drag the top-left ⤡ grip (bottom-right anchored), reflows live, size persisted per-device, restored on minimize-reopen + auto-popup. Mobile unchanged. Additive (zero change to chat flow).
- 4 commits this session (docs + Tasks 1-3), all pushed. Prod UNCHANGED. Joins the existing un-deployed batch → 17 commits ahead of prod.
- This batch now bundles: EOD+5 confirmed-card/course-step/confirm-btn (13 commits) + EOD+6 resizable panel (4 commits).

## What this session shipped (detail → checkpoint 2026-05-31-staffchat-resizable-panel.md)
- `/brainstorming` (Visual Companion grounded in REAL StaffChatPanel/tokens; Q1=A top-left corner grip / Q2=A min 360×480..max vw-32×vh-32) → spec HTML → `/writing-plans` HTML → `/executing-plans` inline (TDD, 4 tasks).
- NEW `src/lib/staffChatPanelSize.js` (pure clampSize + per-device localStorage, mirrors staffChatReadCursor) + NEW `src/hooks/useStaffChatPanelResize.js` (matchMedia desktop-gate; direct-DOM drag → 60fps, commit+persist on pointerup; window-resize re-clamp; dbl-click reset) + `StaffChatPanel.jsx` wire (ref + inline size + grip).
- Tests: unit 15/0 + RTL 8/0 + Rule I flow-simulate 6/0 = +29; full suite 15469/0; build clean.
- Rule Q L1 real-browser (Chrome MCP, REAL mounted panel): default 360×480→drag 560×680 (bottom-right UNCHANGED + reflow SEEN)→clamp 1797×836→reload restores saved→dbl-click reset 360×480.

## Next action
- User-gated: **deploy** the 17-commit batch (frontend/lib only, no Probe-Deploy-Probe) → then USER L1. OR continue.

## Outstanding user-triggered actions
- Deploy the 17-commit batch + USER L1 (resizable panel: smoothness/both-themes/real minimize+popup on auth-gated widget; + carryover EOD+5 confirm-btn/green-card/course-steps; + V142/V143 2-device balance + NK shows 0).
- Ship artifacts at deploy: V-log entries (EOD+5 V73-BS1 + course-step; EOD+6 resizable-panel feature) + delete dev mockups `public/brainstorm-*.html`.
- (carryover) cron stock-lot-cleanup active 03:45 BKK.
- Honest gap: mobile-<768 real-browser viewport-shrink harness-blocked → RTL-verified only.
