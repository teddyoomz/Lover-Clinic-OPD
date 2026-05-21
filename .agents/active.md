---
updated_at: "2026-05-21 EOD+1 LATE — Tablet Chart more-tools: post-ship CRITICAL canvas-init bug FIXED (user on-device L1 caught it); ratio fix DEPLOYED earlier this session"
status: "more-tools feature complete + post-ship init-once fix landed (local, 13 commits ahead of prod); full vitest 13927/0; build clean; NOT deployed — awaiting 'deploy' + user on-device re-test"
branch: "master"
last_commit: "b638fe9d fix(tablet-chart): canvas init-once + template on live canvas — late-template re-init was disposing the React-owned <canvas>"
tests: "full vitest GREEN (13927/0) · build clean (~3s)"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "d750c725 — ratio fix (72ea7585) LIVE. more-tools + the init-once fix (13 commits) NOT deployed."
firestore_rules_version: "be_chart_* (isClinicStaff) — UNCHANGED. more-tools adds NO rules change."
---

# Active Context

## State
- master = `b638fe9d`; prod = `d750c725`. master AHEAD by 13 commits (more-tools T1-T9 + the post-ship init-once fix). **NOT deployed.**
- Ratio fix `72ea7585` deployed earlier this session (user confirmed "ipad ration ตรงแล้ว").

## Post-ship CRITICAL bug — FOUND + FIXED (this is the V66 lesson manifesting)
- **User on-device L1 hit 3 symptoms** (ภาพไม่ขึ้น + วาดไม่ติด + กดบันทึกไม่ได้) from **ONE** root cause.
- `/systematic-debugging` (Iron Law): root cause verified in a REAL browser BEFORE fixing; **2 hypotheses rejected** (re-init mechanism + SVG-0-size — both work in isolation).
- **Root cause** (proven via a temp probe mounting the REAL component + driving the late-template race): `TabletChartCanvas` init `useEffect` was keyed on `[templateImageUrl]` → the template arrives LATE via the instant-pop race (`''`→dataUrl) → effect re-ran → cleanup `fc.dispose()` removed the React-owned `<canvas>` → re-init couldn't recover (`elRef.current` null) → `fcRef=null` → all 3 symptoms. Probe proof: after late template `wrappers:0, fcRef:null` (canvas gone).
- **Fix**: init the Fabric canvas ONCE (`[]` deps, mirror PC ChartCanvas) + a separate `[templateImageUrl]` effect loads/replaces the template on the LIVE canvas (`loadTemplate`, never disposes). Probe re-verify: late template → `wrappers:1, json:['Image']` + survives tool change. **RC1-RC3** regression locks it.
- Full vitest **13927/0**; build clean.

## Next action
- **DEPLOY** the more-tools feature + fix: `vercel --prod` (user-triggered) — **Vercel-only** (no rules/data change). 13 commits.
- **User on-device re-test** after deploy: open `?tablet=chart` on the iPad → template now shows → draw with each tool → erase → save → confirm PC merges with objects.

## Outstanding user-triggered actions
- **deploy** (more-tools + init-once fix, 13 commits) — Vercel-only.
- on-device re-test (the bug it fixes).
- (carryover) V106 cron 03:30 BKK first drain; calendar-density / Recall / V108 list-visual L1.
