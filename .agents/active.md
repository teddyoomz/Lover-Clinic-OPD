---
updated_at: "2026-05-27 EOD+13 — Light-Theme Audit (WCAG AA, App UI) COMPLETE + deep automated-scanner pass (7 surfaces). LOCAL, NOT committed/pushed/deployed."
status: "Light-theme audit done + deep-verified. 7 surfaces scanned clean (per-page contrast scanner) + global fixes proven. full vitest 14975/0 (last full run; 1 prior=flake). build clean ×6. NOT committed — await explicit 'commit'/'push'/'deploy' (V18). Brand-red decision pending."
branch: "master"
last_commit: "762a89df (EOD+12 chart docs) — ALL light-theme work UNCOMMITTED on top of working tree"
tests: "full vitest 14975/0 (678 files); T7 override-coverage 4/0; build clean ×6. (green-500/600 edit after last full run = CSS-only, build-confirmed.)"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "8f6b7ced LIVE — EOD+11 + EOD+12 + light-theme NOT deployed"
firestore_rules_version: "UNCHANGED — CSS/theme-config only (no rules/storage/data/cron → no Probe-Deploy-Probe)"
---

# Active Context — Light-Theme Audit (brainstorming→writing-plans→executing-plans→deep scanner)

Goal: every App-UI page+modal WCAG AA in light theme. **CSS/colour/theme-config ONLY — 0 wiring/flow/logic** (diff = index.css + tailwind.config 1 line + 14 inline-colour swaps in 5 .jsx). Spec/plan/inventory: docs/superpowers/2026-05-27-light-theme-*.

## Fixes (all theme-layer)
- **FM-A** ~10 uncovered dark surface classes → light tokens (index.css).
- **FM-C base** ~23 colour text shades -300/400/500 → AA-dark.
- **Alert-box ext** bg-{c}-700/800/900/950/alpha TINTS → {c}-50 + text -50/100/200/300 → {c}-700, all 17 colours (info/success/error boxes 1.0–1.3 → 4.84–6.51:1).
- **FM-D** 14 inline-colour → `--accent-{blue,line,purple,amber,red,teal}` vars (CustomerDetailView, LinkLineInstructionsModal, LinkRequestsTab, TreatmentTimelineModal, ClinicSettingsPanel).
- **teal** text-teal-300/400 #0d9488→#0f766e · **muted** --tx-muted #64748b→#5b6675 · **green** text-green-500/600 #16a34a→#15803d (all were sub-AA).
- **tailwind darkMode root-fix** (USER-APPROVED) `darkMode: ['selector','[data-theme="dark"]']` — was unset(media) → `dark:` (82 uses/15 files) coupled to OS → light-on-dark-OS showed dark-variant colours (invisible finance/wallet). AV136 class, fixed globally.
- NEW tests/light-theme-override-coverage.test.js (4) + TL1.6 fixup.

## Verified (Rule Q-vis/Q-honest — REAL browser, measured)
- **Per-page contrast scanner clean on 7 surfaces**: sale · reports · promotions · finance(synthetic) · appointment-hub · customer-detail · frontend-appt (only residual anywhere = brand-red below).
- darkMode fix **proven both directions** (synthetic + frontend-appt reload: sky-100/200/orange dark: fails GONE after reload).
- Dark theme NO regression (customer-detail dark screenshot post-config).
- The deep scan (user's "ตรวจหมดจริงๆเหรอ" push — justified) surfaced teal/muted/green/dark: classes that eyeballing missed. All fixed.

## ⚠ Pending decision (brand colour — NOT auto-changed)
Brand red `#dc2626` (`text-red-400`, 261 uses) = **4.37:1 on tinted cards** (4.5 on white). Always on appropriate red (delete/weekend/error), NOT names. Keep brand red (≈AA) OR bump → red-700 #b91c1c (strict AA, darkens brand red app-wide) — **user's call**.

## ⚠ HONEST scope gap
Scanner ran on 7 surfaces. **stock / master-data / treatment-form / chat / settings / deep modals NOT individually scanned** — backend collapsed-section + frontend drawer nav resisted programmatic clicks in-session. They use the SAME now-fixed global classes (FM-A/C + alert-box + dark: + teal/muted/green all global) → covered by the global fixes + **need user L1 spot-check**. dev server UP at localhost:5173 (Browser 1, light) for L1.

## Next action (USER-TRIGGERED)
Decide brand-red → `commit` → `push` → `vercel --prod` (frontend+theme-config only; no rules/storage/cron → no Probe-Deploy-Probe). Await word (V18).

## Outstanding
- commit/push/deploy await word (covers EOD+11 appt-live + EOD+12 chart + light-theme).
- brand-red #dc2626 decision · in-app L1 on the 6 unscanned surfaces.
- V-entry + SESSION_HANDOFF finalize at commit (⚠ SESSION_HANDOFF 266KB over 200KB cap — archive first).
- 2 pre-existing Rule S doc edits (CLAUDE.md, rules/01) uncommitted (yours).
