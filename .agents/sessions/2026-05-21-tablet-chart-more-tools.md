# Checkpoint — 2026-05-21 EOD+1 — Tablet Chart more-tools (Fabric v7) + 5 post-ship rounds + re-edit-on-tablet design

## Summary
Shipped the tablet chart pro toolset (Fabric v7 object editor) + fixed FIVE post-ship rounds (the last user-driven, on-device). The live-display "blank canvas" had TWO real causes (sync-render was a preview artifact; the actual cause was an opaque upper-canvas cover). Then verified the full real-use lifecycle on real prod + completed object-level re-edit. Ended by brainstorming + getting design approval for "re-edit a saved chart ON the tablet" (NOT yet implemented — next chat). Verbose detail: `.claude/rules/v-log-archive.md` "Tablet Chart more-tools" §followup-2/3/4/5.

## Current State
- master `8149d48e` (clean, pushed); prod `d750c725` (ratio fix only — more-tools + 5 rounds = ~24 commits NOT deployed).
- Full vitest **13949/0**; build clean; real-prod round-trip e2e **14/0** (`scripts/e2e-chart-relay-roundtrip.mjs`); object-level PC re-edit verified in a real browser.
- User CONFIRMED the editor renders + draws + saves on-device ("โอเคใช้ได้แล้ว").
- NEXT (design APPROVED, NOT built): re-edit a saved chart on the tablet — full design in `.agents/active.md` ▶ RESUME HERE.
- Object-level re-edit (PC + the new tablet flow) is **live-gated on the storage.rules deploy** (client `application/json` upload denied until then → raster fallback, which works).

## Commits (this session, on master)
```
8149d48e docs(handoff): pause for context — re-edit-on-tablet design APPROVED
468b5ff5 feat(tablet-chart): object-level re-edit (fabricJson + canvas dims) + 1MB-persist guard + real-prod round-trip e2e
a1fbad8f fix(tablet-chart): COVER — remove inline canvas background (Fabric copies it to the opaque upper-canvas)
3463f191 debug(tablet-chart): TEMP on-device render diagnostic overlay (later removed)
edacaea2 docs(rules): add iron-clad Rule S — Chrome MCP / real-browser standing authorization
189f4bf1 fix(tablet-chart): RENDER — sync renderAll, never rAF-deferred requestRenderAll
aa79099d / 6f7895e4 (fix2 save) · 218816c0 / b638fe9d (fix1 init-once)
```

## Files Touched (this session)
- src/components/tablet-chart/TabletChartCanvas.jsx (init-once; sync renderAll; remove inline bg; serializeFabricCanvas)
- src/components/ChartCanvas.jsx (object-level re-edit: loadFromJSON at saved dims + PNG fallback + white bg; serializeFabricCanvas)
- src/components/TreatmentFormPage.jsx (persist via chartEntryForPersist size guard)
- src/lib/tabletChartTools.js (serializeFabricCanvas + isObjectLevelReeditable + chartEntryForPersist)
- src/pages/TabletChartEditorPage.jsx (onSave json non-fatal; temp DIAG added+removed)
- storage.rules (uploads/chart-edit-sessions/{sessionId}/{file=**} allows image/* + json — NEEDS deploy)
- tests/tablet-chart-more-tools-flow-simulate.test.jsx (RC4-RC11), tests/chart-relay-roundtrip.test.js (NEW), scripts/e2e-chart-relay-roundtrip.mjs (NEW)
- .agents/skills/audit-anti-vibe-code/SKILL.md (AV103 follow-up + AV104 + AV105)
- .claude/rules/{00-session-start.md,01-iron-clad.md (Rule S),v-log-archive.md}

## Decisions (1-line; reasoning in v-log-archive.md)
- fix3 sync-render KEPT though it fixed a preview-only artifact — mirrors ChartCanvas + rAF-independent defensive.
- Real on-device cause = Fabric copies the canvas element's inline `background` to the opaque upper-canvas → cover (AV105).
- Object-level re-edit = embed canvas dims in the json (objects carry absolute coords) + loadFromJSON, raster fallback (AV103 follow-up).
- 1MB Firestore doc cap → chartEntryForPersist drops oversized fabricJson (PNG always kept). Storage-ref = pre-existing follow-up.
- Rule S (NEW): Chrome MCP / real-browser standing auth — verify rendered PIXELS, not the object model.
- re-edit-on-tablet (Q1=A): automatic object-level when fabricJson present, raster fallback; reuse PcPairingModal; merge to same slot.

## Next Todo
1. (next chat) Implement re-edit-saved-chart-on-tablet — design approved, go straight to spec/writing-plans → impl → round-trip e2e + real-browser verify. Full design + files in active.md ▶ RESUME HERE.
2. (user-triggered) deploy: `vercel --prod` + `firebase deploy --only storage` (Probe-Deploy-Probe #13) — unlocks live object-level re-edit.
3. (decision) Storage-ref for chart images (pre-existing 1MB-inline limit).

## Resume Prompt
> /session-start, then implement the APPROVED feature "re-edit a saved chart on the tablet" (full design in `.agents/active.md` ▶ RESUME HERE — brainstorming HARD-GATE already satisfied; go to spec/writing-plans → implement → round-trip e2e + real-browser verify). master=8149d48e, prod=d750c725, 13949/0. No deploy without explicit "deploy" THIS turn (V18).
