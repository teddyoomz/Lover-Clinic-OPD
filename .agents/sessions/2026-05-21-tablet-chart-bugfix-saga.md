# 2026-05-21 — Tablet Chart Editor: bugfix saga + more-tools brainstorm

## Summary
After the Tablet Chart Editor shipped, the user's real-device hands-on (L1) surfaced a chain of bugs the Node e2e missed. Fixed 5 root causes across `/systematic-debugging` rounds (root cause from real prod data BEFORE any fix), making the relay work end-to-end on prod. Then opened a brainstorm to add a professional toolset to the tablet editor — at the design-approval gate, not started.

## Current State
- master = `da71fa01`; prod = `dc9d230c` (relay fixes #1/#3 live; **ratio fix `72ea7585` NOT deployed**).
- **Storage bucket CORS applied (live, bucket-side)** — the real blocker. `origin:['*']` GET/HEAD via `scripts/set-storage-cors.mjs --apply`.
- Relay **VERIFIED end-to-end on real prod** (post-CORS): iPad renders chart → draw+save → PC fetches 123KB annotated result.
- more-tools feature: brainstorm pending; user chose B (select/move/resize); pen approach unanswered.

## Commits
```
da71fa01 test(tablet-chart): DIAG_TPL env to pick template for ratio testing
72ea7585 fix(tablet-chart): render template at true aspect ratio (contain, not stretch)
fb74f0b5 fix(tablet-chart): set Storage bucket CORS — unblocks browser image download
dc9d230c fix(tablet-chart): template image not shown + PC stuck after tablet save
1b7a58bd docs(agents): session-end — verification close-out + V-log (earlier this session)
```

## Files Touched
- src/lib/chartEditSession.js (resolveToDataUrl chokepoint)
- src/hooks/useChartEditSession.js (saved-handler try/catch no-hang + cancel-on-failure)
- src/pages/TabletChartEditorPage.jsx (late-template-load)
- src/lib/backendClient.js (newest-requested-session selection + toMillis import)
- src/components/tablet-chart/PenCanvas.jsx (buffer=real ratio + CSS contain)
- scripts/set-storage-cors.mjs (NEW), scripts/diag-tablet-chart-admin-trigger.mjs (cors/urltest/list/real-SVG/DIAG_TPL)
- tests/tablet-chart-template-transport.test.js (NEW R1-R7), tests/tablet-chart-editor-flow-simulate.test.jsx (F7), tests/chart-edit-session-backend.test.js (B3 fixup)
- .agents/skills/audit-anti-vibe-code/SKILL.md (AV102 #1-#6)

## Decisions (1-line each — full lessons → v-log-archive.md "Tablet Chart Editor")
- #1 template `imageUrl` is a PATH not a data URL → normalize via `resolveToDataUrl` at the transport chokepoint (data: passthrough / fetch+convert / blank→null).
- #2 instant-pop fires before the PC finishes uploading → tablet must load a late-arriving `templateImageUrl` (read-once-vs-live class).
- #3 un-guarded `await` in the saved-merge handler hung the PC forever → always try/catch + teardown + free tablet; never leave phase=waiting.
- #4 **CORS was THE blocker** — bucket `cors:null` blocks browser `fetch()` of Storage URLs. Token is the access control; `origin:['*']` GET is safe. **Node e2e can't catch browser CORS — verify in a real browser** (Rule Q lesson, V66 family).
- #5 PenCanvas stretched (fixed buffer + width/height:100%) → buffer = real image ratio + CSS `max-width/height` contain; mirror the working PC ChartCanvas. NOT yet deployed.
- more-tools: user chose select/move/resize (B). Recommendation = reuse Fabric/ChartCanvas (constant pen, proven/fast) over hybrid perfect-freehand (pressure, high effort).

## Next Todo
1. **Deploy `72ea7585`** (`vercel --prod`, user-triggered) → iPad shows correct ratio. Re-verify body renders 1:2 on prod.
2. Get the more-tools pen answer (Fabric constant vs hybrid pressure) → spec (HTML) → writing-plans → implement (select/move/resize + line/circle/rect/arrow/text + color picker + sizes + undo/redo/clear) → test → verify → deploy.
3. Carryover: V106 cron 03:30 first drain; calendar-density / Recall / V108 L1.

## Resume Prompt
Resume LoverClinic — 2026-05-21 EOD. Tablet Chart Editor relay works end-to-end on prod (post-CORS). master=da71fa01, prod=dc9d230c. Ratio fix 72ea7585 pushed but NOT deployed (body stretched on prod until `vercel --prod`). CORS applied bucket-side (live). more-tools feature: at design gate (user chose select/move/resize; pen approach unanswered — Fabric-constant [rec] vs hybrid-pressure). Read CLAUDE.md → SESSION_HANDOFF → .agents/active.md → 00-session-start.md. No deploy without "deploy" THIS turn (V18).
