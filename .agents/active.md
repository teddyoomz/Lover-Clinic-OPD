---
updated_at: "2026-05-21 EOD+1 LATE+2 — Tablet Chart more-tools: LIVE-DISPLAY render bug FIXED (rAF-deferred render → blank live canvas; sync renderAll fix). Verified at the rendered-pixel level in a real browser at dpr=2 (template paints + stroke paints live, rAF dead). All post-ship symptoms now resolved. storage.rules json still awaits deploy."
status: "more-tools complete; 3 post-ship bugs fixed (init-once + storage.rules/onSave save + sync-render live-display); render fix pixel-verified in browser @ dpr=2; full vitest 13932/0; NOT deployed — awaiting 'deploy' (vercel + storage.rules Probe-Deploy-Probe #13)"
branch: "master"
last_commit: "fix(tablet-chart): RENDER — paint via SYNC renderAll, never rAF-deferred requestRenderAll (blank live canvas + correct save when rAF unreliable); RC6-RC8 + AV104"
tests: "full vitest GREEN (13932/0) · build clean · render fix pixel-verified (getImageData) in real browser @ forced dpr=2 · full-relay Playwright e2e GREEN (real prod)"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "d750c725 — ratio fix LIVE. more-tools + 3 post-ship fixes (~18 commits) NOT deployed."
firestore_rules_version: "be_chart_* unchanged. storage.rules: NEW uploads/chart-edit-sessions match allows application/json — NEEDS `firebase deploy --only storage` (Probe-Deploy-Probe #13)."
---

# Active Context

## State — ALL post-ship symptoms FIXED (init + save + LIVE render), pixel-verified
The tablet chart more-tools editor had THREE post-ship rounds, all now resolved:
- **fix1 (init-once)**: init `useEffect` was keyed on `[templateImageUrl]` → late template re-ran it → `fc.dispose()` destroyed the React-owned `<canvas>`. Fixed: init ONCE + template on the live canvas.
- **fix2 (save)**: `storage.rules` denied the `result.json` (application/json) client upload → `onSave` threw silently. Fixed: storage.rules allows json + onSave makes the json upload non-fatal (PNG always saves). Caught by a full-relay Playwright e2e.
- **fix3 (LIVE render — THIS round)**: the canvas painted via `fc.requestRenderAll()` (rAF-deferred) ×17; on the tablet rAF is unreliable (throttled / stuck nextRenderHandle / not firing) so the paint never landed → blank live canvas (template + strokes invisible) while the object model stayed correct (so save was right — masking it). Fixed: replace all `requestRenderAll`→`renderAll` (sync; mirror the proven PC `ChartCanvas`). **Verified at the rendered-pixel level** in a real browser at forced `dpr=2`: template paints (colored 121, was transparent) + a stroke paints live (gray→green) with rAF DEAD. RC6-RC8 lock it; AV104 invariant.

## Lesson (V66, 4th time in this saga)
Verify RENDERED PIXELS (getImageData on the live canvas), NOT the object model — my prior probe checked `json:['Image']` (model present) and "passed" while the screen was blank. Reproduce device-only render bugs by forcing `config.devicePixelRatio`. A Fabric editor must render synchronously — rAF can silently never fire.

## Next action
- **DEPLOY** (user-triggered, V18): `vercel --prod` (more-tools + all 3 post-ship fixes; ~18 commits) **+** `firebase deploy --only storage` (storage.rules json → enables the lossless re-edit; **Probe-Deploy-Probe #13**: anon write to `uploads/chart-edit-sessions/...` → 403, staff json write → 200). [⚠ CLI 15.x: `--only storage`, NOT `storage:rules`.]
- After deploy: user on-device iPad re-test → template shows live + every tool draws live + erase works + save → PC merges. Then re-run the relay e2e (STEP6 should now verify json carries Image+Path).

## Outstanding user-triggered
- **deploy** (vercel + storage.rules, Probe-Deploy-Probe #13).
- on-device re-test (iPad) — live render + every tool + save→PC.
- (carryover) V106 cron 03:30 BKK first drain; calendar-density / Recall / V108 list-visual L1.
