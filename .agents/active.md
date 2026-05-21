---
updated_at: "2026-05-21 EOD+1 — Tablet Chart more-tools (Fabric v7 pro toolset) shipped LOCAL; ratio fix DEPLOYED earlier this session (user-confirmed)"
status: "more-tools feature complete (local, 11 commits ahead of prod); full vitest 13924/0; build clean; NOT deployed — awaiting 'deploy' + user on-device L1"
branch: "master"
last_commit: "8ae6c86f fix(tablet-chart): unmount-during-init guard + V21 page-RTL mock fixup + AV41 global.fetch restore"
tests: "full vitest GREEN (13924/0) · build clean (~3s)"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "d750c725 — ratio fix (72ea7585) LIVE (deployed this session; user confirmed 'ipad ration ตรงแล้ว'). more-tools (11 commits) NOT deployed."
firestore_rules_version: "be_chart_* (isClinicStaff) — UNCHANGED. more-tools adds NO rules change (fabricJson rides the existing uploads/ Storage path + live CORS)."
---

# Active Context

## State
- master = `8ae6c86f`; prod = `d750c725`. master AHEAD by 11 commits (the more-tools feature — spec, plan, T1-T8 + casing fix + regression fixes). **NOT deployed.**
- Earlier this session: deployed ratio fix `72ea7585` (`vercel --prod`) → **user confirmed "ipad ration ตรงแล้ว"** (L3) → that thread closed.

## What this session shipped (more-tools, T1-T9)
- **TabletChartCanvas** (Fabric v7 object editor) replaces PenCanvas: select/move/resize + line/arrow/rect/circle/text + freeform color picker, KEEPING the perfect-freehand pressure pen (built as a `fabric.Path` on pointer-up, rides Fabric `mouse:*` + `getScenePoint` — not a BaseBrush subclass). Eraser = object-granular tap + scrub. EditorToolRail upgraded to 9 tools.
- **Save transports PNG + full `fabricJson`** (2nd Storage blob → merged `charts[]` lossless, never `fabricJson:null`). `uploadTransportJson`/`downloadTransportJson` (guarded) + `resultFabricJsonUrl`. **AV103**.
- Flow: brainstorming(Visual Companion)→spec→writing-plans→executing-plans inline. **Rule Q**: L2 e2e **9/0 on real prod Storage** (`scripts/e2e-tablet-chart-more-tools.mjs`) + **L1 real-browser** (every tool creates its object, eraser removes, PNG/JSON round-trip). **L1 caught fabric v7 PascalCase `toJSON().type`** (V66 mock-shadow; lowercase fixtures fixed). Full-suite caught 2 V21 (unmount-init guard + page-RTL mock drift) + AV41 (global.fetch restore ×3 files).
- Full vitest **13924/0**; build clean.

## Next action
- **DEPLOY** the more-tools feature: `vercel --prod` (user-triggered) — **Vercel-only** (no rules/data change; CORS already live). 11 commits.
- **User on-device L1 hands-on** (the harness-limited piece): open `?tablet=chart` on a real iPad → draw with EACH tool (pen/highlighter/line/arrow/rect/circle/text) → select+move+resize → tap+scrub erase → save → confirm the PC merges the annotated chart with objects intact + ratio correct.

## Outstanding user-triggered actions
- **deploy** (more-tools, 11 commits) — Vercel-only.
- **on-device L1** per-tool hands-on (pointer-event wiring rides Fabric core + the proven relay; needs real-device confirmation per workstyle).
- (carryover) V106 cron 03:30 BKK first drain; calendar-density / Recall / V108 list-visual L1.
