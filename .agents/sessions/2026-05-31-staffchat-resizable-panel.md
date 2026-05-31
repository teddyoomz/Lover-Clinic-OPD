# Checkpoint — 2026-05-31 EOD+6 — Staff-chat desktop RESIZABLE panel (brainstorm→spec→plan→impl)

## Summary
New desktop feature: staff-chat box is freely resizable by dragging the top-left ⤡ grip (bottom-right stays anchored), reflows live, size persisted per-device, restored automatically on minimize-reopen + auto-popup. Full cycle `/brainstorming` (Visual Companion grounded in REAL design per §S-design) → spec → `/writing-plans` → `/executing-plans` inline TDD. Pushed; NOT deployed.

## Current State
- master = `3678f6c5` (pushed origin/master); prod UNCHANGED = `0c607f68` LIVE. **17 commits ahead** of prod (EOD+5 confirmed-card/course-step 13 + EOD+6 resizable-panel 4).
- Frontend/lib only → no rules/storage/index/cron → **no Probe-Deploy-Probe**.
- Additive: zero change to existing chat flow (send/minimize/popup/cursor/unread/upload/sticker/unsend). Mobile (<768px) unchanged.
- Full suite **15469/0** (+29 vs 15440; ran after Task 3; NOT re-run at session-end). Build clean.
- Decisions: **Q1=A** top-left-corner grip only (gauge w+h together) · **Q2=A** min 360×480 .. max vw−32×vh−32 + auto-clamp on window-resize.

## Commits (this session)
```
3678f6c5 test(staffchat): Rule I flow-simulate — resize persist -> remount restore (minimize/popup contract) (Task 3)
11b1d931 feat(staffchat): desktop resizable panel — top-left grip drag + persist + clamp + reset (Task 2)
507bdd87 feat(staffchat): staffChatPanelSize — per-device size persistence + pure clampSize (Task 1)
c5a41304 docs(staffchat): brainstorm spec + plan + grounded mockup (Q1=A corner, Q2=A 360x480..vw-32)
```

## Files Touched (names only)
- NEW `src/lib/staffChatPanelSize.js` (pure clampSize + per-device localStorage; mirrors staffChatReadCursor.js)
- NEW `src/hooks/useStaffChatPanelResize.js` (matchMedia desktop-gate; direct-DOM drag; window-resize re-clamp; dbl-click reset)
- MOD `src/components/staffchat/StaffChatPanel.jsx` (import + hook + ref + inline desktopSize + grip ⤡)
- NEW tests: `staff-chat-panel-size.test.js` (15) · `staff-chat-panel-resize-rtl.test.jsx` (8) · `staff-chat-panel-resize-flow-simulate.test.js` (6)
- docs: spec + plan HTML · `public/brainstorm-staffchat-resize.html` (dev mockup — DELETE at deploy)
- TEMP (deleted, never committed): `src/__staffChatPanelL1.jsx` + `public/staffchat-panel-l1.html` (Rule Q L1 harness)

## Decisions (1-line each)
- Reflow is FREE: existing `flex-1 min-h-0` list + `max-w-[80%]` bubbles reflow via browser when container resizes — no manual reflow code.
- Auto-restore is FREE: minimize/popup flip `minimized` in useStaffChat → StaffChatPanel REMOUNTS → mount-time `getPanelSize()` re-applies saved size. No popup/minimize wiring touched.
- Smoothness: pointermove writes `panelRef.style.width/height` DIRECTLY (no setState → 50-msg list not re-rendered → 60fps); commit state + `setPanelSize` only on pointerup.
- Desktop-gate via `matchMedia('(min-width:768px)')`; inline width/height overrides `md:w-[360px]`; mobile renders no grip / no inline → fullscreen overlay unchanged.
- clampSize pure: `min(vw−32, max(360, w))` — viewport ceiling wins when < MIN so box always fits; window-resize listener re-clamps.
- Per-device single localStorage key `staffChat:panelSize` (NOT per-branch) — matches "เก็บขนาดที่เครื่อง".
- L1 harness delivery gotcha: Vite (started before file) won't serve a NEW root .html; public/ static html needs the @vitejs/plugin-react preamble injected manually (else "can't detect preamble"). Dev server died during build/full-suite → preview_start restart needed.

## Rule Q evidence (L1 real-browser, REAL mounted panel, SEEN+measured)
- default 360×480, grip present, bottom-right anchored (right=1813≈vw−16, bottom=852≈vh−16)
- drag up-left → 560×680, bottom-right corner UNCHANGED, bubbles reflowed (3→2 lines, screenshot)
- drag past edge → clamp 1797×836 (vw−32×vh−32), onScreen:true
- reload → restored to saved size = minimize/popup remount contract
- dbl-click grip → reset 360×480 + persisted
- HONEST GAP: mobile-<768 real-browser viewport-shrink harness-blocked (resize_window left innerWidth=1829) → mobile-unchanged RTL-verified (R2) only; assembled auth-gated widget L1 = USER post-deploy.

## Next Todo (ship artifacts — at deploy)
- V-log feature entry (resizable-panel) + carryover EOD+5 entries (V73-BS1 + course-step). Delete `public/brainstorm-*.html`.
- USER L1 on the auth-gated AdminDashboard widget (smoothness feel + both themes + real minimize/popup w/ live messages).

## Resume Prompt
```text
Resume LoverClinic — continue from 2026-05-31 EOD+6.

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=3678f6c5, prod=0c607f68)
3. .agents/active.md (15469 tests)
4. .claude/rules/00-session-start.md (iron-clad + V-summary)
5. .agents/sessions/2026-05-31-staffchat-resizable-panel.md

Status: master=3678f6c5 (17 commits ahead, pushed), prod=0c607f68 LIVE, 15469/0 (not re-run).
Next: USER-gated — deploy the 17-commit batch (frontend/lib, no Probe-Deploy-Probe) → USER L1
  (resizable staff-chat: drag top-left grip, bottom-anchored, persist across minimize/popup, both themes;
   + carryover EOD+5 confirm-btn/green-card/course-steps; + V142/V143 2-device balance + NK shows 0).
  At deploy: V-log entries (resizable-panel + EOD+5 V73-BS1/course-step) + delete public/brainstorm-*.html.
Outstanding (user): deploy + L1; cron stock-lot-cleanup active 03:45 BKK.
Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe on rules; Rule Q L1/L2 before "verified"; ground mockups in REAL design (§S-design).
/session-start
```
