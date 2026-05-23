---
updated_at: "2026-05-23 EOD+1 LATE+4 — V116 DEPLOYED · V117 LOCAL (lightbox portal)"
status: "V115+V116+V116-followup LIVE on prod @ 3612d8ae. V117 lightbox-portal SHIPPED local @ f43ab792 — awaiting deploy authorization."
branch: "master"
last_commit: "f43ab792 fix(lightbox): V117 — fullscreen lightboxes MUST createPortal to body [AV117]"
tests: "V117 self 11/11 PASS · V83+V117 28/28 · Phase 17.1 isolated 7/7 (known full-suite flake) · build clean"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "3612d8ae (V115+V116+V116-followup LIVE) · office-to-pdf-00007-tfb (Cloud Run V110-bis)"
firestore_rules_version: "unchanged (V117 client-only)"
---

# Active Context

## State
- **V116 DEPLOYED** — Vercel prod `3612d8ae` LIVE; V115 mobile lightbox UX + V116 link-survives-queue-delete + V116-followup un-hide-on-re-engage all live. User L1 hands-on on iPhone caught V115 incomplete (V117 birthed).
- **V117 LOCAL** — Pushed to master @ `f43ab792`. NOT deployed. Awaits explicit "deploy" verb.
- **V117 architecture**: 5 fullscreen lightboxes converted to `createPortal(jsx, document.body)` — bypasses ancestor CSS containing-block + stacking-context on iOS Safari (the V115 mobile fixes were correct but the lightbox was bounded by StaffChatPanel `position:fixed z-9000`).

## What this session shipped
- V116 main + V116-followup combined deploy → Vercel prod (V115 rode the same deploy).
- V117 (5-instance class-of-bug expansion per Rule P): StaffChatImageLightbox + StaffChatPdfOverlay + TreatmentReadOnlyMirror + TreatmentReadOnlyPanel + ChartSection inner ChartLightbox all portal-mounted.
- AV117 invariant locks closed sanctioned list of 5 + companion to AV114 (mobile UX gates).
- V21 fixup absorbed: V83 M2.1 backdrop-onClick test offending after V117 marker-line shifted past lookback window in ChartSection — fixed by reordering comments.
- 11 V117 tests (SG1-SG5 + AV1-AV3 + G1-G3) — source-grep + portal target lock + classifier.
- Graphify updated → 7828 nodes / 14115 edges. llm-wiki log + index entry for V116 saga.
- Detail → `.agents/sessions/2026-05-23-eod-v116-v117.md`.

## Next action
1. **User authorizes V117 deploy** → `vercel --prod` (client-only, no rules/indexes/Cloud Run change).
2. **User Rule Q L1 iPhone hands-on** post-V117-deploy: open staff chat image attachment → ✕ tappable below notch + backdrop closes + double-tap zoom + iOS pinch native. Re-test V116 scenarios too.

## Outstanding user-triggered actions
- V117 deploy authorization (when ready).
- Post-deploy iPhone L1 hands-on for V117 + V116 acceptance scenarios.
- (If V117 fixes the mobile bug → V115/V116/V117 saga closes.)

## Notes
- V18 deploy authorization never carries forward — previous "deploy" was for V116; V117 needs fresh "deploy" verb.
- AV117 + AV114 = complete fullscreen lightbox contract (structural portal + visual mobile gates).
- Phase 17.1 RTL test flakes under full-suite load (known per active.md history). Isolated runs always pass.
