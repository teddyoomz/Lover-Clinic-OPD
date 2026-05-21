---
updated_at: "2026-05-21 EOD+1 LATE+4 — Tablet Chart more-tools: real-use round-trip VERIFIED on real prod (14/0: persist to OPD + re-edit + fresh image + stress) + object-level RE-EDIT completed (ChartCanvas now consumes fabricJson, verified in real browser) + 1MB-persist size guard. Awaiting deploy."
status: "more-tools complete; 5 post-ship rounds (init / save / sync-render / cover / round-trip+re-edit+guard); data layer SOLID (real-prod e2e 14/0); object-level re-edit live-gated on storage deploy; full vitest 13949/0; NOT deployed — awaiting 'deploy' (vercel + storage Probe-Deploy-Probe #13)"
branch: "master"
last_commit: "feat(tablet-chart): object-level re-edit (ChartCanvas consumes fabricJson + canvas dims) + 1MB-persist size guard + real-prod round-trip e2e"
tests: "full vitest 13949/0 · build clean · real-prod round-trip e2e 14/0 (scripts/e2e-chart-relay-roundtrip.mjs) · object-level re-edit verified in a real browser (objectLevelPathTaken:true, objects render)"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "d750c725 — ratio fix LIVE. more-tools + all post-ship work NOT deployed."
firestore_rules_version: "be_chart_* unchanged. storage.rules: NEW uploads/chart-edit-sessions match allows application/json — NEEDS `firebase deploy --only storage` (Probe-Deploy-Probe #13). Object-level re-edit's fabricJson is live-gated on this deploy."
---

# Active Context

## State — real-use flows verified + object-level re-edit completed
User confirmed fix4 ("โอเคใช้ได้แล้ว" — the live editor renders). Then asked for comprehensive real-use verification + bug/edge hunt. Result:
- **Real-prod round-trip e2e 14/0** (`scripts/e2e-chart-relay-roundtrip.mjs`): fresh PC image → relay → tablet result (PNG+json) → PC download → **persist to `be_treatments.detail.charts[]`** → re-read → re-edit → stress (68-obj json / 2026-char emoji+Thai+RTL byte-identical / 2 concurrent patients no cross-contamination / rapid re-save last-wins). **Data layer SOLID, zero data bugs.**
- **Real gap fixed (object-level re-edit)**: `ChartCanvas` re-edit IGNORED the persisted `fabricJson` (loaded the flat PNG → raster-only, couldn't move/delete prior strokes — defeated AV103). Fix: `serializeFabricCanvas` embeds canvas dims; `ChartCanvas` re-edit `loadFromJSON` at saved dims (object-level) + PNG-raster fallback. **Verified in a real browser** (objectLevelPathTaken:true + objects render).
- **Edge case guarded**: chart PNG + fabricJson both inline the `be_treatments` doc (~1MB cap) → oversized fabricJson dropped by `chartEntryForPersist` (PNG kept → save never breaks).
- **Pre-existing limit flagged (NOT this feature)**: a single chart PNG dataUrl > ~1MB still risks the cap — Storage-ref is the architectural follow-up (decide separately).

## Lessons (this round)
- Transporting data is pointless if the consumer ignores it — re-edit dropped the fabricJson for the whole feature life; verify the CONSUMER, not just the transport.
- Fabric object coords are absolute → re-edit must carry + recreate the canvas dims (no zoom, or re-save corrupts the dims).
- Inlining images/json in a Firestore doc has a ~1MB ceiling — guard it; Storage-ref is the real fix for large media.

## Next action
- **DEPLOY** (user-triggered, V18): `vercel --prod` (more-tools + all 5 post-ship rounds) **+** `firebase deploy --only storage` (storage.rules json → unlocks object-level re-edit live; **Probe-Deploy-Probe #13**: anon write `uploads/chart-edit-sessions/...` → 403, staff json → 200). [⚠ CLI 15.x: `--only storage`.]
- After deploy: on-device — tablet edit → save → PC re-edit shows prior strokes as MOVABLE objects (object-level); confirm OPD persist.

## Outstanding user-triggered
- **deploy** (vercel + storage, Probe-Deploy-Probe #13) — unlocks live object-level re-edit.
- (decision) Storage-ref for chart images (pre-existing 1MB-inline limit) — architectural follow-up.
- (carryover) V106 cron 03:30 BKK first drain; calendar-density / Recall / V108 list-visual L1.
