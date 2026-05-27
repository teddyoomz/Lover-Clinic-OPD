---
updated_at: "2026-05-27 EOD+12 — chart-edit flash FIXED (portal) + treatment-image ดูรูปใหญ่ button + light-theme button fix (LOCAL commit, NOT pushed/deployed)"
status: "Feature committed locally (96eb089d) on master. Full suite 14971/0, build clean. Root cause CSS-proven in real browser (light theme). NOT pushed, NOT deployed — await explicit 'push'/'deploy' (V18). In-app live-TFP-edit L1 = user hands-on (login/data)."
branch: "master"
last_commit: "96eb089d fix(chart): portal chart overlays → no edit-flash + treatment-image ดูรูปใหญ่ button [V123/AV143]"
tests: "full suite 14971 pass / 0 fail (677 files). build clean."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "8f6b7ced LIVE (EOD+10) — EOD+11 & EOD+12 work NOT deployed"
firestore_rules_version: "UNCHANGED (no rules/storage/data/cron this session)"
---

# Active Context

## State
- Chart-edit FLASH fixed: ChartCanvas + ChartTemplateSelector + PcPairingModal now `createPortal(…, document.body)`. Root cause = `fixed inset-0` trapped by a transient transformed ancestor in TFP (the editor laid out in-box then snapped full-screen). Same class as AV117 → NEW **AV143** (editors/modals). Committed local `96eb089d`.
- Treatment + lab images now have a `Maximize2` "ดูรูปใหญ่" button → shared portaled **ImageLightbox** (extracted from ChartSection.ChartLightbox, Rule of 3). Light-theme bug fixed: buttons `bg-black/70 text-white` → `bg-white/90` + gray/red icon (index.css:404 remaps `text-white` dark on non-colored bg → icon was invisible). Mirrors the chart button.
- EOD+11 appt-live-cross-device + CC-row-align work STILL unpushed/undeployed; this session's chart work stacks on top. Working tree clean except the 2 pre-existing user Rule S doc edits (CLAUDE.md, rules/01) — untouched.

## What this session shipped (detail: .agents/sessions/2026-05-27-chart-overlay-portal-flash.md)
- `/systematic-debugging`: root cause confirmed via static-chain proof (no persistent transform → transient → flash) + AV117 precedent + real-browser CSS computed-style proof in light theme.
- 4 files portaled (ChartCanvas/Selector/PairingModal) + NEW `ImageLightbox.jsx`; TFP wires zoom buttons + lightbox; ChartSection delegates to ImageLightbox.
- Tier 2 (Rule P): NEW AV143 + `tests/v123-chart-overlay-portal.test.js` (13); AV117 + `v117-lightbox-portal.test.js` retargeted to ImageLightbox; `pc-pairing-rtl` PP4 portal fixup.
- Verify: build clean ×2 · full suite **14971/0** · root cause + fix CSS-proven in real browser (light theme: old icon `rgb(15,23,42)` dark-on-dark = invisible; new = gray-on-white visible).

## Next action
- USER-TRIGGERED: push master + deploy (vercel-only — no rules/storage/cron → no Probe-Deploy-Probe). Say "push" / "deploy".

## Outstanding user-triggered actions
- push + `vercel --prod` (covers EOD+11 appt-live + EOD+12 chart work — all frontend) — await explicit word (V18).
- In-app live L1 (your hands-on): open real TFP edit → กดแก้ไข Chart → expect full-screen immediately (NO flash); hover a treatment image in light theme → white "ดูรูปใหญ่" button visible → opens lightbox. (Mechanism AV117-proven + CSS-proven; live TFP-edit not driven by me — login/data.)
- 2 pre-existing Rule S doc edits (CLAUDE.md, rules/01) still uncommitted (user's).
- OPD ember-band live-pixel (carryover) — user L1 when a patient is mid-OPD.
- ⚠ SESSION_HANDOFF.md is 266 KB (over its 200 KB cap) — archival overdue (flagged at boot; separate maintenance pass).
