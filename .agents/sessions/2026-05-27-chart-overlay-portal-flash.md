# 2026-05-27 EOD+12 — Chart-edit flash FIXED (createPortal) + treatment-image ดูรูปใหญ่ button + light-theme button fix

## Summary
`/systematic-debugging` on a user report: clicking "แก้ไข Chart" in TFP flashed the editor in-box ("ไม่หลุดจาก box ตัวเอง") then full-screen. Root cause = `ChartCanvas` `fixed inset-0` trapped by a transient transformed ancestor in TFP — the codebase's own AV117 class (fullscreen overlay inside the app must `createPortal` to body). Fixed by portaling ChartCanvas + the 2 sibling chart modals; added the requested view-large button on treatment/lab images via a shared portaled ImageLightbox; fixed a follow-up light-theme button-invisibility bug. Committed local; NOT pushed/deployed.

## Current State
- master HEAD = EOD docs commit (feature `96eb089d`); prod UNCHANGED `8f6b7ced`. NOT pushed, NOT deployed (V18).
- Full suite **14971/0** (677 files), build clean ×2. NO rules/storage/data/cron → frontend-only (no Probe-Deploy-Probe when deployed).
- Root cause + fix CSS-proven in a real browser (light theme); live in-app TFP-edit L1 = user hands-on (login/data; preview renderer wedged by my reload).
- Working tree clean except 2 pre-existing Rule S doc edits (CLAUDE.md, rules/01) — user's, untouched.
- EOD+11 appt-live-cross-device work is also still unpushed/undeployed; one "deploy" ships both.

## Commits
```
96eb089d fix(chart): portal chart overlays → no edit-flash + treatment-image ดูรูปใหญ่ button [V123/AV143]
<EOD docs commit on top>
```

## Files Touched
- src: ChartCanvas.jsx · ChartTemplateSelector.jsx · tablet-chart/PcPairingModal.jsx (all → createPortal) · ChartSection.jsx (delegate to ImageLightbox) · **NEW** ImageLightbox.jsx · TreatmentFormPage.jsx (Maximize2 import + imageLightboxSrc state + zoom buttons on treatment+lab images + lightbox render; light-theme button class fix)
- tests: **NEW** v123-chart-overlay-portal.test.js (13) · v117-lightbox-portal.test.js (retarget ChartSection→ImageLightbox) · pc-pairing-rtl.test.jsx (PP4 portal fixup)
- audit: .agents/skills/audit-anti-vibe-code/SKILL.md (NEW AV143 + AV117 list → ImageLightbox)
- docs: .agents/active.md · SESSION_HANDOFF.md · this checkpoint

## Decisions (1-line each)
- Root cause = transient transformed-ancestor trap on `fixed inset-0` (AV117 class); fix = portal to body (ancestor-agnostic, per AV117 "fix is the portal not find-the-ancestor"). Exact ancestor NOT needed.
- Rule P: portal all 3 chart overlays the user hits (editor + template-selector + pairing-modal), not just the reported one.
- AV143 (editors/modals, explicit-close AV78) kept SEPARATE from AV117 (viewers, click-to-close) — different close UX.
- ImageLightbox extracted (Rule of 3) + reused by ChartSection chart-view + TFP treatment/lab images; ChartSection delegates (its inner ChartLightbox removed).
- Light-theme fix = adopt the chart's `bg-white/90 text-gray-700 shadow` scheme (user's reference; theme-stable; `text-white` is remapped dark on bg-black in light theme). Changed both zoom + delete for consistency.
- Commit local only; push/deploy await explicit word (V18 + prior-session precedent).

## Next Todo (user-triggered)
- push origin master + `vercel --prod` (frontend-only; covers EOD+11 + EOD+12) — await "push"/"deploy".
- In-app live L1: open real TFP edit → กดแก้ไข Chart → expect full-screen immediately (no flash); hover a treatment image in light theme → white "ดูรูปใหญ่" button visible → opens lightbox.
- 2 pre-existing Rule S doc edits (CLAUDE.md, rules/01) — user's call.
- OPD ember-band live-pixel (carryover) — user L1 when a patient is mid-OPD.
- ⚠ SESSION_HANDOFF.md is 266 KB (over 200 KB cap) — archival overdue (separate maintenance pass).

## Resume Prompt
See SESSION_HANDOFF.md Current State (2026-05-27 EOD+12). master HEAD = EOD docs commit (feature `96eb089d`); prod `8f6b7ced`. Chart-edit flash fix (createPortal on ChartCanvas/ChartTemplateSelector/PcPairingModal) + treatment-image ดูรูปใหญ่ button (shared ImageLightbox) + light-theme button fix — COMMITTED LOCAL, full suite 14971/0, build clean, root cause CSS-proven in real browser. Next: push + deploy await word (V18). No commit/push/deploy without explicit word THIS turn.
