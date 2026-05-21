---
updated_at: "2026-05-21 EOD+2 — RE-EDIT a saved chart ON TABLET: IMPLEMENTED + verified (local, NOT deployed). full vitest 13965/0 · L2 e2e ALL PASS real prod (Phase E) · L1 real-browser object-level hydrate confirmed. Prior more-tools + 5 rounds also local. Next = deploy (vercel + firebase --only storage, Probe #13) → on-device L1."
status: "re-edit-on-tablet DONE + verified (local). Awaiting 'deploy' (V18) — combined vercel + storage deploy unlocks LIVE object-level tablet re-edit (pre-deploy = raster fallback, works)."
branch: "master"
last_commit: "feat(tablet-chart): re-edit a saved chart ON TABLET — editFabricJsonUrl relay leg + object-level hydrate + same-slot merge (verified L1+L2)"
tests: "full vitest 13965/0 · build clean 3.43s · L2 e2e ALL PASS real prod (re-edit Phase E + A/B/C1-C4) · L1 real-browser object-level (exportObjects 2, dims 600×800). RT1-RT7 + RC2/R4.2/R4.4 V21 fixups."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "d750c725 — ratio fix LIVE. more-tools + 5 post-ship rounds + re-edit-on-tablet (~25 commits) NOT deployed."
firestore_rules_version: "storage.rules uploads/chart-edit-sessions/{sessionId}/{file=**} allows image/* + application/json (covers result.json AND the NEW edit.json) — NEEDS `firebase deploy --only storage` (Probe-Deploy-Probe #13). Object-level re-edit (PC + tablet) is live-gated on this deploy."
---

# Active Context

## ▶ RESUME HERE (next chat) — re-edit-on-tablet DONE; next = DEPLOY (user-triggered)

**Status: re-edit a saved chart ON TABLET is IMPLEMENTED + verified (local, NOT deployed).** No code work pending — the only outstanding action is the user-triggered deploy.

**What shipped**: edit ✏️ on a saved chart → `PcPairingModal` (PC/tablet choice, reuses add-new) → send-to-tablet ships the existing chart PNG (`templateImageUrl` raster fallback) + `fabricJson` (NEW `editFabricJsonUrl`) → `TabletChartEditorPage` resolves json-first → `TabletChartCanvas` `initialFabricJson` → object-level `loadFromJSON` at saved dims (mirror PC ChartCanvas) else raster → result merges back to the SAME slot (`editingIdx`). Reuses serializeFabricCanvas/isObjectLevelReeditable/uploadTransportJson; **no new collection, no new storage rule**. Spec/plan: `docs/superpowers/{specs,plans}/2026-05-21-re-edit-saved-chart-on-tablet*`.

**Verified (Rule Q/S)**: full vitest 13965/0 · build clean · L2 e2e ALL PASS real prod (Phase E new leg: editFabricJsonUrl + PRODUCTION isObjectLevelReeditable on the round-tripped edit.json + same-slot merge) · L1 real-browser object-level hydrate (mounted REAL component → exportObjects 2, native 600×800, NOT container-fit raster). `tests/re-edit-chart-on-tablet.test.jsx` RT1-RT7 + RC2/R4.2/R4.4 V21 fixups. Verbose: `v-log-archive.md` "Tablet Chart more-tools" §followup-6.

## Outstanding (user-triggered)
- **deploy** (combined, V18): `vercel --prod` (more-tools + 5 rounds + re-edit-on-tablet, ~25 commits) **+** `firebase deploy --only storage` (Probe-Deploy-Probe #13: anon write `uploads/chart-edit-sessions/...` → 403, staff json → 200) — **unlocks LIVE object-level re-edit (PC + tablet)**. [⚠ firebase CLI 15.x: `--only storage`, NOT `storage:rules`.]
- After deploy → on-device L1: tablet edit a saved chart → prior strokes load as MOVABLE/erasable objects → save → PC same slot updated.
- (decision) Storage-ref for chart images (pre-existing ~1MB Firestore-doc inline limit) — architectural follow-up.
- (carryover) V106 cron 03:30 BKK first drain; calendar-density / Recall / V108 list-visual L1.

## Done recent (local, NOT deployed)
- **re-edit-on-tablet** (this session) — editFabricJsonUrl relay leg + object-level tablet hydrate + same-slot merge. 13965/0; L1+L2 verified.
- **more-tools + 5 post-ship rounds** — Fabric v7 pro toolset + init/save/sync-render/cover/round-trip+re-edit+guard. AV103/AV104/AV105 + RC1-RC11 + Rule S.
