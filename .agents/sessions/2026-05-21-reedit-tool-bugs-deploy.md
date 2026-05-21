# Checkpoint — 2026-05-21 EOD+2 — re-edit-on-tablet feature + 2 tool-bug fixes + COMBINED DEPLOY

## Summary
Shipped "re-edit a saved chart ON the tablet" (object-level relay leg), then fixed 2 more-tools editor bugs (arrow vanished-on-release; text trapped-in-editing/no-handles) via `/systematic-debugging`, ran a comprehensive real-pixel verification of every tool + 11 edge cases on a new SVG image, and did the combined deploy (Vercel + storage rules). Object-level re-edit (PC + tablet) is now LIVE. Verbose: `.claude/rules/v-log-archive.md` "Tablet Chart more-tools" §followup-6 (re-edit) + §followup-7 (tool bugs).

## Current State
- master `1bfe1767` (clean, pushed); **prod `1bfe1767` LIVE** — tablet-chart batch deployed (Vercel aliased to lover-clinic-app.vercel.app + storage rules P-D-P #13 ✓).
- full vitest **13970/0**; build clean; L1 real-browser ALL 9 tools + 11 edge cases (getImageData real pixels); L2 e2e prod ALL PASS.
- **Object-level re-edit (PC + tablet) unlocked LIVE** (storage `uploads/chart-edit-sessions/{file=**}` json allowance deployed).
- No code work pending. Idle / await next task.
- 1 UX nuance (NOT a bug): re-edit shows ~0.8s blank while the template image enlivens, then renders fully. Optional spinner — user decides.

## Commits (this session, on master)
```
1bfe1767 fix(tablet-chart): arrow vanished on release + text trapped-in-editing (no resize/move handles)
20e28cee feat(tablet-chart): re-edit a saved chart ON TABLET — editFabricJsonUrl relay leg + object-level hydrate + same-slot merge
```

## Files Touched (this session)
- src/lib/chartEditSessionCore.js (editFabricJsonUrl field)
- src/hooks/useChartEditSession.js (start ships edit.json, guarded)
- src/components/tablet-chart/TabletChartCanvas.jsx (initialFabricJson hydrate; commitShape drag-delta; addText no-auto-edit)
- src/pages/TabletChartEditorPage.jsx (resolveSource json-first + initialFabricJson)
- src/components/ChartSection.jsx (handleEdit→modal + send existing chart + data-testids)
- scripts/e2e-chart-relay-roundtrip.mjs (Phase E)
- tests/re-edit-chart-on-tablet.test.jsx (NEW, RT1-RT7) + tests/tablet-chart-tool-bugs.test.jsx (NEW, TB1/TB2)
- tests/tablet-chart-more-tools-flow-simulate.test.jsx (RC2 V21 fixup) + tests/tablet-chart-template-transport.test.js (R4.2/R4.4 V21 fixups)
- .agents/skills/audit-anti-vibe-code/SKILL.md (AV103 follow-up via §followup-6 + AV106)
- storage.rules (deployed — chart-edit-sessions json allowance)
- docs/superpowers/{specs,plans}/2026-05-21-re-edit-saved-chart-on-tablet*.html

## Decisions (1-line; full reasoning in v-log-archive.md §followup-6/7)
- re-edit = thread ONE field (editFabricJsonUrl) through the proven relay; reuse serializeFabricCanvas/isObjectLevelReeditable/uploadTransportJson — no new collection/rule.
- arrow fix = measure the GESTURE (drag-delta sx,sy→ex,ey), not type-specific object geometry (the arrow is a fabric.Group with no x1/x2).
- text fix = mirror PC ChartCanvas (selected-with-handles, no auto-edit; double-tap to edit) — editing mode hides controls.
- L1 verification via `fc.fire` (drives real handlers past the synthetic-event isTrusted limit) + getImageData (rendered-pixel proof; screenshot tool flaky this session = harness, not product).
- "really no bugs?" → genuine adversarial pass; 2 apparent issues were probe-measured-too-early (re-edit/raster image enliven ~0.8s + textbox.selectable read after enterEditing), confirmed not-bugs via polling/clean reads.
- Deployed this session (user "ผ่านหมดจริงๆค่อย deploy"): V15 combined + Rule B P-D-P #13.

## Next Todo
1. (user, on-device L1) tablet: re-edit a saved chart → prior strokes load as MOVABLE objects → save → PC slot updated.
2. (optional polish) re-edit ~0.8s template-load loading spinner — user decides.
3. (carryover) V106 cron 03:30 BKK first drain; calendar-density / Recall / V108 list-visual L1.

## Resume Prompt
> /session-start, then: tablet-chart batch is LIVE (prod=1bfe1767). No pending code work. If user reports a tablet-chart issue → `/systematic-debugging` + `fc.fire` real-browser probe + getImageData pixel checks. master=1bfe1767, prod=1bfe1767, vitest 13970/0. No deploy without explicit "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe for rules.
