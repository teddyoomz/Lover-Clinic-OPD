---
updated_at: "2026-05-22 EOD+2 — Storage-ref architectural fix for chart images (the 'Property detail invalid nested entity' bug — was a 2.16 MiB dataUrl, fixed by moving PNG to Firebase Storage). Plus chart fullscreen button in TFP + lightbox round-6 (button hit-area + always-mounted at edges). NOT YET committed/deployed."
status: "prod LIVE 1e88ed11 (unchanged this session). 4 uncommitted feature files + 3 NEW diag scripts + 1 NEW lib module. Awaiting user verification then commit."
branch: "master"
last_commit: "afb71d19 docs(agents): EOD 2026-05-22+1 — chart templates rewrite + 'invalid nested entity' diag ready"
tests: "vitest 14072/14077 PASS (5 fail likely V21 lock-ins from chart-storage-ref + lightbox-round-6 shape changes — triage NEXT session before commit). Build not run."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "1e88ed11"
firestore_rules_version: "unchanged — Storage-ref reuses existing `match /uploads/{collection}/{docId}/{fileName}` rule (no probe-deploy needed)"
---

# Active Context

## State
- The "Property detail contains an invalid nested entity" bug from EOD+1 → **ROOT CAUSE FOUND** via Rule Q L2 client-SDK bisect: `detail.charts[0].dataUrl` was **2.26 MiB inline base64** (multiplier:2 × user-uploaded high-res template = huge PNG). Firestore rejected the whole `detail` map.
- Fix = **Storage-ref architectural** (per user directive "แยกรูปไปไว้ที่อื่นสิวะ ข้อมูลสำคัญ" — no quality degradation). PNG uploads to Firebase Storage; `detail.charts[].dataUrl` stores a short URL.
- 4 uncommitted features + 1 NEW lib + 3 diag helpers. Tests pending. User pending L1 verify.

## What this session shipped
- **Storage-ref for chart images** — NEW `src/lib/chartImageStorage.js` (uploadChartImage / deleteChartImage); ChartCanvas.handleSave async upload (multiplier:2 KEPT, full resolution preserved); chartEntryForPersist carries storagePath; deleteBackendTreatment cleans Storage cascade; TFP edit-load preserves storagePath. Path `uploads/be_treatments/{customerId}/chart-{ts}-{rand}.png` — covered by EXISTING storage.rules (no new rule deploy).
- **Chart fullscreen button** (TFP) — `Maximize2` icon BEFORE edit, in 3-button hover row; opens new `ChartLightbox` (mirror canonical AV78 pattern from TreatmentReadOnlyMirror); ESC + ✕ + backdrop-click close.
- **Staff-chat lightbox ROUND-6** — fix for keyboard-fast/mouse-flaky bug. (a) ONE `<img>` element, no keyed remount; (b) Blob cache pre-warm all originals at mount (Map<url,blobUrl>); (c) buttons ALWAYS mounted (disabled at edges, not unmounted — phantom-missing-button bug); (d) hit zone widened to w-20 vertically capped top-16/bottom-16 (don't overlap top-bar ✕ or filmstrip).
- Removed DEBUG bisect from createBackendTreatment + updateBackendTreatment.
- Detail + diag artifacts: `.agents/sessions/2026-05-22-storage-ref-chart-fullscreen-lightbox-r6.md`.
- New user-memory: `feedback_no_quality_degradation_for_data.md` (Storage-ref over compression for important data).

## Next action (NEXT CHAT)
1. **Triage 5 vitest failures** (Rule P 7-step) — log `npx vitest run --reporter=verbose 2>&1 | grep FAIL` to identify which tests. Almost certainly V21 source-grep tests locking the old (a) `<img key={idx}>` keyed-remount in lightbox, (b) `idx > 0 &&` conditional render, (c) `chartEntryForPersist` 3-field return, (d) inline base64 in `detail.charts[].dataUrl`. Each fixup includes V-marker comment crosslink.
2. **User confirms** local-test passes for all 3 fixes (chart save succeeds, fullscreen button works, lightbox prev/next click reliably + ✕ accessible).
3. Commit batch + push.
4. User explicit "deploy" → vercel-only (rules unchanged).

## Outstanding user-triggered actions
- Hands-on confirm: chart-save with newly-uploaded template works (no more "invalid nested entity") + fullscreen button opens + lightbox mouse-click responsive
- Pending from EOD+1: confirm round-5 lightbox feel on real iPad (now round-6 supersedes — re-test on device)
- "deploy" verb when ready (rules unchanged → vercel-only)
