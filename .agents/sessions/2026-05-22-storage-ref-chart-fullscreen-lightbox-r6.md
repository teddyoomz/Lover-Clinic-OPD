# 2026-05-22 EOD+2 — Storage-ref chart fix + chart fullscreen button + lightbox round-6

## Summary
EOD+1's "Property detail contains an invalid nested entity" bug root-caused via Rule Q L2 client-SDK bisect: `detail.charts[0].dataUrl` was a 2.26 MiB inline base64 PNG (multiplier:2 × user-uploaded high-res template), exceeding Firestore's per-doc cap. Fix is Storage-ref architectural (PNG uploaded to Firebase Storage; doc stores short URL). Plus user-requested fullscreen button in TFP chart row + staff-chat lightbox round-6 (mouse button hit-area + always-mounted at edges to fix the rapid-click-misses bug).

## Current State
- master/prod = `1e88ed11` UNCHANGED on https://lover-clinic-app.vercel.app
- 4 modified files + 1 NEW lib module + 3 NEW Rule R diag scripts — UNCOMMITTED
- vitest 14072/14077 PASS (5 fail = likely V21 lock-ins from shape changes; triage next session)
- Firebase rules unchanged — Storage path `uploads/be_treatments/{customerId}/chart-{ts}-{rand}.png` covered by existing `match /uploads/{collection}/{docId}/{fileName}` rule
- Awaiting: user hands-on confirm + V21 triage + commit batch

## Files Touched (uncommitted)
- NEW `src/lib/chartImageStorage.js` — uploadChartImage / deleteChartImage / extractStoragePathFromUrl
- `src/components/ChartCanvas.jsx` — handleSave async (Storage upload); spinner UI; crossOrigin on raster fallback
- `src/components/ChartSection.jsx` — customerId prop; fullscreen button + ChartLightbox; best-effort Storage delete on chart-replace/delete
- `src/components/TreatmentFormPage.jsx` — passes customerId to ChartSection; edit-load preserves storagePath
- `src/lib/tabletChartTools.js` — chartEntryForPersist returns storagePath
- `src/lib/backendClient.js` — DEBUG bisect REMOVED; deleteBackendTreatment cascade-cleans Storage objects
- `src/components/staffchat/StaffChatImageLightbox.jsx` — ROUND-6 rewrite
- NEW `scripts/diag-chart-template-save-shape.mjs` (modified — Rule R admin-SDK diag with bisect)
- NEW `scripts/diag-chart-template-save-client-sdk.mjs` (Rule Q L2 — real client SDK bisect)
- NEW `scripts/diag-recent-treatment-shape.mjs` + `scripts/diag-find-chart-treatments.mjs` (Rule R helpers)
- NEW user-memory `feedback_no_quality_degradation_for_data.md`

## Decisions (1-line each — see code + memory for reasoning)
- Storage-ref over compression — user directive "ข้อมูลสำคัญ" (memory: `feedback_no_quality_degradation_for_data.md`)
- multiplier:2 KEPT — full resolution preserved; Storage holds the bytes
- Storage path reuses existing `uploads/{collection}/{docId}/{fileName}` rule — NO new rule deploy, NO Probe-Deploy-Probe needed
- Cleanup: deleteBackendTreatment walks detail.charts → best-effort deleteObject; failure non-fatal (orphans cost ~0)
- ChartSection.handleSave: on chart-replace, best-effort delete OLD storagePath (no orphan accumulation per re-edit cycle)
- Round-6 lightbox: ONE `<img>` (no keyed remount) + Blob cache (Map<url,blobUrl>) preserved in state; URL.revokeObjectURL on cleanup
- Lightbox buttons always mounted at edges (disabled visually) — fixes phantom-missing-button bug from rapid mouse clicks
- Lightbox hit zone w-20 × top-16/bottom-16 — wide enough for sloppy clicks but capped vertically so doesn't swallow ✕ close or filmstrip

## Next Todo (priority order)
1. Triage 5 vitest failures (Rule P 7-step). Likely V21 source-grep tests locking old shape (keyed-remount in lightbox / conditional prev-next render / 3-field chartEntryForPersist / inline base64 dataUrl). Each fixup includes V-marker comment.
2. User hands-on verify: chart save with uploaded template works; fullscreen button opens; lightbox prev/next rapid click reliable; ✕ accessible
3. Build check (`npm run build`)
4. Commit batch
5. User explicit "deploy" → vercel-only (rules unchanged)

## Resume Prompt
```
Resume LoverClinic — continue from 2026-05-22 EOD+2.

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=1e88ed11, prod=1e88ed11)
3. .agents/active.md (vitest 14072/14077, 5 fail = V21 lock-ins likely)
4. .claude/rules/00-session-start.md (iron-clad + V-summary)
5. .agents/sessions/2026-05-22-storage-ref-chart-fullscreen-lightbox-r6.md

Status: master=1e88ed11 UNCHANGED; 4 uncommitted features + 1 NEW lib + 3 diag scripts pending commit.
Next: (1) triage 5 vitest fails per Rule P 7-step (likely V21 lock-ins from chart-storage-ref + lightbox-round-6 shape changes); (2) user hands-on confirm 3 fixes work; (3) commit batch; (4) user "deploy" → vercel-only.
Outstanding (user-triggered):
- Hands-on confirm: chart save with newly-uploaded template no longer "invalid nested entity"; chart fullscreen button opens; lightbox mouse-click rapid + ✕ accessible
- Address 5 vitest failures before commit
Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe; Rule R diag pre-authorized
/session-start
```
