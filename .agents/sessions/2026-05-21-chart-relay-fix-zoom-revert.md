# Checkpoint — 2026-05-21 EOD+3 — chart-relay Rule Q fix (handleSave null, DEPLOYED) + zoom+palm built→REVERTED

## Summary
Ran a real-client-SDK Rule Q adversarial pass on the tablet chart relay → found+fixed `ChartSection.handleSave` persisting the string `"null"` (+ Rule M cleanup of 2 prod charts), DEPLOYED. Then built the tablet pinch-zoom + palm-rejection feature (brainstorm→spec→plan→impl, desktop-verified), DEPLOYED — but it BLACK-SCREENS the editor on real iPad 2-finger zoom. Root-caused to an iPad/WebKit + trusted-multitouch issue (raw listeners on Fabric's upper canvas), couldn't confirm without the device, so REVERTED (Rule A) + redeployed safe.

## Current State
- master/prod = `00a9da2f` (revert) LIVE — zoom+palm removed; `handleSave "null"` fix `7a4b7f47` retained; editor = pre-zoom more-tools version.
- chart-area tests 38/0 green post-revert; build clean.
- Chrome MCP IS connected ("Browser 1", deviceId `8bdc85cc-b6e5-47d9-b3cd-56957264819d`, local) + authorized (Rule S).
- NEXT (user directive): reliably USE Chrome MCP + full Chrome-MCP test of the tablet canvas editor (every tool + function), then stop.
- Zoom+palm shelved; spec/plan + working desktop code recoverable from `e36a73e9`.

## Commits (this session, on master)
```
00a9da2f revert: tablet-chart pinch-zoom + palm-rejection (iPad/WebKit black screen on 2-finger zoom)
e36a73e9 feat(tablet-chart): pinch-zoom (1-4x) + auto-adaptive palm rejection on the tablet canvas  [REVERTED]
7a4b7f47 fix(tablet-chart): handleSave persisted string "null" for absent chart object data  [retained]
```

## Files Touched (net, after revert)
- src/components/ChartSection.jsx (handleSave null→null fix — RETAINED)
- tests/re-edit-chart-on-tablet.test.jsx (RT8 regression — RETAINED)
- scripts/diag-chart-relay-adversarial.mjs · scripts/diag-chart-fabricjson-dump.mjs · scripts/cleanup-chart-fabricjson-null-string.mjs (Rule Q/M — RETAINED)
- (reverted by 00a9da2f) src/lib/chartGestureMath.js, TabletChartCanvas.jsx gesture layer, TabletChartEditorPage.jsx ⤢ button, 2 zoom test files, spec+plan HTML

## Decisions (1-line)
- handleSave "null" bug = JSON.stringify(<JS null>); fix keeps null. Found via real-client-SDK pass; rules/index/cleanup all clean.
- Reverted zoom (Rule A): iPad-specific black screen unconfirmable without the device; desktop (Blink, DPR 1.89, real rAF) renders fine + no crash.
- Root-cause LEAD: zoom added raw addEventListener('pointer*') on fc.upperCanvasEl → conflicts with Fabric's native trusted-touch pipeline on iPad (original code warns "no raw upperCanvasEl listeners"). Synthetic events skip Fabric's touch path → desktop can't repro.
- Re-ship fix direction: overlay-based pinch capture (separate layer / Fabric events), NOT raw listeners on Fabric's element.
- Chrome MCP is the correct real-browser tool (Rule S) — use FIRST for device/touch verification, not Claude Preview. (User flagged twice.)
- V66 lesson again: "verified in a real browser" was DESKTOP-only; iPad/WebKit/trusted-touch was the gap.

## Next Todo
1. (user directive) Make the project reliably USE Chrome MCP + run a FULL Chrome-MCP test of the tablet canvas editor (`?tablet=chart`): every tool (pen/highlighter/line/arrow/rect/circle/text/eraser/select) + function (undo/redo/clear/delete/save/relay). Then stop.
2. Zoom+palm re-ship: on-device iPad diag (overlay capturing window.onerror + state, user pinches + screenshots) to CONFIRM the upperCanvasEl-listener lead → implement the overlay-based fix → re-verify on iPad → redeploy.
3. (carryover) V106 cron drain / calendar-density / Recall / V108 L1.

## Resume Prompt
> /session-start, then: prod=00a9da2f (zoom REVERTED, safe; handleSave fix retained). NEXT (user directive): configure the project to reliably USE Chrome MCP (Rule S; "Browser 1" deviceId 8bdc85cc-…) + FULL Chrome-MCP test of the tablet canvas editor (?tablet=chart) — every tool + function — then stop. Zoom re-ship shelved (on-device iPad diag + overlay-fix; recover from e36a73e9). master=00a9da2f. No deploy without explicit "deploy" THIS turn (V18).
