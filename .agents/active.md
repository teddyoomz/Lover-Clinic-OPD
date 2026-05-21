---
updated_at: "2026-05-21 EOD+1 LATE+3 — Tablet Chart more-tools: LIVE-DISPLAY bug REAL on-device cause FOUND + FIXED — inline `background:#fff` on the canvas → Fabric copies it to the opaque upper-canvas → covered the painted lower-canvas (blank live + correct save). Proven in a real browser; fix = remove inline bg (mirror ChartCanvas). Awaiting on-device re-confirm + deploy."
status: "more-tools complete; 4 post-ship fixes (init-once + save + sync-render + upper-canvas-cover); fix4 is the REAL on-device cause (proven via real-browser isolation + on-device DIAG); full vitest GREEN; NOT deployed — awaiting 'deploy' (vercel + storage.rules Probe-Deploy-Probe #13)"
branch: "master"
last_commit: "fix(tablet-chart): COVER — remove inline canvas background (Fabric copies it to the opaque upper-canvas → covered the painted lower-canvas); RC9-RC11 + AV105"
tests: "full vitest GREEN · build clean · fix4 proven in a real browser (fabric-reexport isolation: WITH inline bg → upper-canvas opaque white cover; WITHOUT → transparent) + on-device DIAG (lower-canvas painted t0, screen white = covered)"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "d750c725 — ratio fix LIVE. more-tools + 4 post-ship fixes NOT deployed."
firestore_rules_version: "be_chart_* unchanged. storage.rules: NEW uploads/chart-edit-sessions match allows application/json — NEEDS `firebase deploy --only storage` (Probe-Deploy-Probe #13)."
---

# Active Context

## State — LIVE-DISPLAY bug REAL cause found + fixed (the user tests localhost dev from a real browser)
The tablet chart more-tools editor had FOUR post-ship rounds. The live-display "blank canvas" had TWO causes; fix4 is the real on-device one:
- **fix1 (init-once)**: init effect keyed on `[templateImageUrl]` → late template re-ran it → `fc.dispose()` destroyed the React-owned `<canvas>`. Fixed: init ONCE + template on live canvas.
- **fix2 (save)**: storage.rules denied the `result.json` (application/json) client upload → onSave threw silently. Fixed: storage.rules allows json + onSave json non-fatal.
- **fix3 (sync-render)**: replaced `requestRenderAll` (rAF-deferred) → sync `renderAll`. **HONEST: this fixed a headless-PREVIEW-only artifact (rAF dead there), NOT the device bug.** KEPT anyway — mirrors the proven ChartCanvas + rAF-independent defensive.
- **fix4 (upper-canvas COVER — THE REAL on-device cause)**: an inline `background:#fff` on the `<canvas>` element → **Fabric v7 copies the element's inline style to the upper-canvas** (interaction layer, absolutely positioned ON TOP) → opaque white upper-canvas **covered** the correctly-painted lower-canvas → blank-white screen while save (object model) stayed correct. Proven in a real browser (isolation: WITH inline bg → upper opaque white; WITHOUT → transparent) + on-device DIAG (`paint c7 w42 t0` = lower IS painted; screen white = covered). **Fix: remove the inline `background:#fff`** (white fill comes from Fabric `backgroundColor:'#fff'` on the LOWER canvas). Class-of-bug grep: `TabletChartCanvas` was the ONLY canvas in src/ with an inline bg; the working PC `ChartCanvas` has none → that's why it works. RC9-RC11 + AV105.

## Lessons (this saga)
- Verify in a browser with **rAF ALIVE** — the headless preview's dead-rAF was a confound that sent fix3 down the wrong path. Rule S (NEW: Chrome MCP / real-browser standing auth) + on-device DIAG overlay = the pattern for devices I can't open devtools on.
- **Fabric copies the canvas element's inline style to the opaque upper-canvas** — never set an opaque `background` on a Fabric-wrapped canvas; use Fabric `backgroundColor`. (AV105)
- "Painted backing + correct save + blank screen" ⇒ a COVER, not a render failure. Look for an opaque layer on top.
- The working sibling (ChartCanvas) had the answer — `grep "<canvas"` diff would have found it round 1. Diff the working example FIRST, structurally.

## Next action
- **User on-device re-confirm**: reload `?tablet=chart` on the device → template shows live + every tool draws live + erase + save → PC merges. (High confidence — mechanism proven in a real browser.)
- **DEPLOY** (user-triggered, V18): `vercel --prod` (more-tools + all 4 post-ship fixes) **+** `firebase deploy --only storage` (storage.rules json → lossless re-edit; **Probe-Deploy-Probe #13**: anon write `uploads/chart-edit-sessions/...` → 403, staff json → 200). [⚠ CLI 15.x: `--only storage`.]

## Outstanding user-triggered
- on-device re-confirm (the fix4 cover removal).
- **deploy** (vercel + storage.rules, Probe-Deploy-Probe #13).
- (carryover) V106 cron 03:30 BKK first drain; calendar-density / Recall / V108 list-visual L1.
