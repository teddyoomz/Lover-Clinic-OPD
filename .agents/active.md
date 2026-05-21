---
updated_at: "2026-05-21 EOD+1 LATE+5 — PAUSED for context (continue next chat). NEW feature 'RE-EDIT saved chart ON TABLET' = brainstormed + design APPROVED by user ('โอเค ลุยเลย'); NOT yet implemented. Prior: more-tools + 5 post-ship rounds DONE (full vitest 13949/0, real-prod round-trip e2e 14/0), NOT deployed."
status: "more-tools + 5 post-ship rounds COMPLETE (local, 13949/0). NEXT (approved, not started): re-edit-saved-chart-on-tablet → write HTML spec → writing-plans → implement → round-trip e2e + real-browser verify. Still awaiting 'deploy' (vercel + storage Probe-Deploy-Probe #13)."
branch: "master"
last_commit: "feat(tablet-chart): object-level re-edit (consume fabricJson + canvas dims) + 1MB-persist guard + real-prod round-trip e2e — 468b5ff5"
tests: "full vitest 13949/0 · build clean · real-prod round-trip e2e 14/0 · object-level PC re-edit verified in real browser. (re-edit-on-tablet feature NOT yet built/tested.)"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "d750c725 — ratio fix LIVE. more-tools + all 5 post-ship rounds (~24 commits) NOT deployed."
firestore_rules_version: "storage.rules NEW uploads/chart-edit-sessions/{sessionId}/{file=**} allows image/* + application/json — NEEDS `firebase deploy --only storage` (Probe-Deploy-Probe #13). Covers the future edit.json too. Object-level re-edit (PC + the new tablet flow) is live-gated on this deploy."
---

# Active Context

## ▶ RESUME HERE (next chat) — implement the APPROVED feature: RE-EDIT saved chart ON TABLET

**Status: brainstormed + design APPROVED by user ("โอเค ลุยเลย"). NOT implemented. Next = write HTML spec (mockup+flow) → writing-plans → implement → verify.** (Brainstorming HARD-GATE already satisfied — do NOT re-brainstorm; go straight to writing-plans/spec.)

**Problem**: clicking edit on a saved chart opens the PC `ChartCanvas` only — no way to send the existing annotated chart back to the iPad to re-edit. User wants a tablet option + the iPad loads the existing chart (prior annotations) → edits → saves back into the SAME chart slot.

**APPROVED DESIGN (Q1=A automatic)**:
- **UX**: edit (pencil) button on a saved chart → open the EXISTING `PcPairingModal` (same as add-new-chart): "แก้ที่นี่ (PC)" / "ส่งไปแก้ที่ iPad <device>". (Today edit goes straight to PC; new-chart already shows the modal — make edit consistent.)
- **Send existing chart to tablet** via relay `start()`: chart PNG → `templateImageUrl` (Storage, existing mechanism, for display + raster); chart `fabricJson` (when present + `isObjectLevelReeditable`) → NEW session field **`editFabricJsonUrl`** uploaded to `uploads/chart-edit-sessions/{id}/edit.json` (already covered by the fix2 storage.rules `{file=**}` json allowance — NO new rule). Remember `editingIdx` so the saved result merges into the SAME slot.
- **Tablet loads** (`TabletChartEditorPage` → `TabletChartCanvas`): if session has `editFabricJsonUrl` → download → pass as NEW prop `initialFabricJson`. TabletChartCanvas: if `initialFabricJson` present + `isObjectLevelReeditable` → `loadFromJSON` at saved dims (prior strokes = movable/erasable objects; reuse `serializeFabricCanvas`/`isObjectLevelReeditable` from `src/lib/tabletChartTools.js`) INSTEAD of `loadTemplate`; else → `loadTemplate` (raster, current).
- **Save back**: unchanged (PNG + fabricJson) → PC hook SAVED → `ChartSection.handleSave` with `editingIdx≥0` → replace the slot.
- **Graceful**: json upload denied (pre-deploy) → `editFabricJsonUrl` null → tablet uses the PNG (raster). Works now; object-level unlocks after the storage deploy.

**Files to touch**: `src/components/ChartSection.jsx` (edit → PcPairingModal + send existing chart; keep editingIdx through the async relay) · `src/hooks/useChartEditSession.js` (`start` accepts the existing chart {dataUrl, fabricJson}) · `src/lib/chartEditSession.js` (+ `editFabricJsonUrl` upload helper, reuse uploadTransportJson 'edit') · `src/lib/chartEditSessionCore.js` (`editFabricJsonUrl: null` in buildSessionCreate) · `src/pages/TabletChartEditorPage.jsx` (download `editFabricJsonUrl` → initialFabricJson) · `src/components/tablet-chart/TabletChartCanvas.jsx` (NEW prop `initialFabricJson` → object-level hydrate branch in the template effect, with raster fallback).

**Verify (Rule Q/S)**: extend `scripts/e2e-chart-relay-roundtrip.mjs` (or new) — send-existing-chart round-trip on real prod; real-browser verify the tablet object-level hydrate (mount TabletChartCanvas with initialFabricJson → objects render); flow-simulate + full vitest. NOTE: object-level tablet re-edit is live-gated on the storage deploy (edit.json upload).

## Done this session (more-tools + 5 post-ship rounds — local, 13949/0, NOT deployed)
init-once (fix1) · save/storage.rules+onSave (fix2) · sync-render (fix3, preview-artifact, kept) · **upper-canvas COVER = real on-device cause** (fix4, remove inline canvas bg — user confirmed "ใช้ได้แล้ว") · real-prod round-trip e2e 14/0 + object-level PC re-edit + 1MB-persist guard (fix5). AV103/AV104/AV105 + RC1-RC11 + Rule S (Chrome MCP standing auth). Verbose: `v-log-archive.md` "Tablet Chart more-tools" §followup + §followup-2/3/4/5.

## Outstanding user-triggered
- **implement the approved re-edit-on-tablet feature** (next chat — design approved, go to spec/plan/impl).
- **deploy** (vercel + storage, Probe-Deploy-Probe #13) — unlocks live object-level re-edit (PC + tablet).
- (decision) Storage-ref for chart images (pre-existing 1MB-inline limit) — architectural follow-up.
- (carryover) V106 cron 03:30 BKK first drain; calendar-density / Recall / V108 list-visual L1.
