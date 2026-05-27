# Checkpoint — Light-Theme WCAG-AA Audit (App UI) — 2026-05-27 EOD+13

## Summary
Dark-first project is launching → audited the LIGHT theme across the App UI for WCAG **AA (4.5:1)** legibility and fixed every contrast/invisible-text failure. **CSS / colour / theme-config ONLY — zero wiring/flow/logic** (per user directive "ยุ่งกับแค่สีดีไซน์ css ห้ามยุ่งกับ wiring flow logic เด็ดขาด เป็นแค่การปรับตีม"). Brainstorm-locked: AA · Hybrid central-first · App-UI (exclude print/doc) · full live-browser pass. After a representative-sample "done" claim, the user pushed "ตรวจหมดจริงๆเหรอ" → I built an automated per-page contrast scanner that found 3 more real classes eyeballing missed (vindicated the push). LOCAL, UNCOMMITTED.

## Current State (5 bullets)
- master HEAD `9042934a` (Rule S docs) on `a4731775` (light-theme+brand-red); **COMMITTED + PUSHED + DEPLOYED**; prod `9042934a` LIVE (was 8f6b7ced) + prod-verified.
- Diff surface = `src/index.css` (central override sweep block) + `tailwind.config.js` (1-line `darkMode`) + 14 inline-colour swaps in 5 `.jsx` + 1 NEW test + 1 test fixup. NO firestore.rules/storage/data/cron → frontend+theme-config (no Probe-Deploy-Probe).
- **Verified (Rule Q-vis, real browser, measured)**: per-page contrast scanner CLEAN on **7 surfaces** (sale · reports · promotions · finance[synthetic] · appointment-hub · customer-detail · frontend-appt). darkMode fix proven BOTH directions. Dark theme NO regression.
- full vitest **14975/0** (678 files; 1 prior "fail" = non-reproduced flake) · build clean ×6 · T7 4/0.
- **✅ Brand-red RESOLVED**: user chose darken → red-700 `#b91c1c` (strict AA); shipped + prod-verified (6.47:1 white, rgb(185,28,28)). **⚠ Honest gap (unchanged)**: 6 surfaces (stock/master-data/treatment-form/chat/settings/deep-modals) NOT individually scanned — covered by global monotonic-safe fixes + need user L1 on prod light theme.

## Architecture understood
Light theme = a giant `[data-theme="light"],[data-theme="auto"]` override layer in `src/index.css` that remaps hardcoded dark Tailwind classes → light values (theme = `data-theme` attr on `<html>`, `useTheme.js`, `THEME_KEY='app-theme'`). Failure mode = any uncovered hardcoded dark class, OR light-pastel text on a light surface → invisible / sub-AA.

## Fixes (all theme-layer)
- **FM-A** ~10 uncovered dark surface classes → light tokens (`.bg-[#0e0e0e]`→`--bg-card`, `bg-[#0a0c14]`→#eff6ff, `border-[#2a2a2a]`→`--bd-strong`, `from-[#1a0515]`→#fdf2f8, etc.).
- **FM-C** colour text -300/400/500 → AA-dark (emerald→#047857, sky→#0369a1, rose→#be123c, amber→#b45309, …).
- **Alert-box ext** (17 colours): `bg-{c}-700/800/900/950/alpha` TINTS → `{c}-50`; `text-{c}-50/100/200/300` → `{c}-700` (1.0–1.3 → 4.84–6.51:1).
- **FM-D** 14 inline `color:#hex` → `--accent-{blue,line,purple,amber,red,teal}` vars (CustomerDetailView · LinkLineInstructionsModal · LinkRequestsTab · TreatmentTimelineModal · ClinicSettingsPanel). borderColor/backgroundColor untouched.
- **teal** text-teal-300/400 #0d9488→#0f766e · **muted** `--tx-muted` #64748b→#5b6675 (light+auto) · **green** text-green-500/600 #16a34a→#15803d (all were sub-AA).
- **tailwind darkMode root-fix (USER-APPROVED "Global config")**: `darkMode: ['selector','[data-theme="dark"]']` — was unset (=media) so `dark:` (82 uses/15 files) coupled to OS prefers-color-scheme → light theme on a dark-OS machine rendered dark-variant colours (invisible finance/wallet). **AV136 class**, fixed globally.
- NEW `tests/light-theme-override-coverage.test.js` (T7, 4 tests) + TL1.6 fixup (`#2EC4B6`→`var(--accent-teal)`).

## Commits (2026-05-28 EOD+13 ship — user authorized "Deploy to prod now")
- `a4731775` style(theme): light-theme WCAG-AA audit + brand-red red-700 #b91c1c (12 files)
- `9042934a` docs(rules): Rule S TIMING reversal (CLAUDE.md + rules/01)
- (+ handoff commit: active.md + this checkpoint)
PUSHED origin/master + `vercel --prod` LIVE (alias lover-clinic-app.vercel.app) + prod-verified (--accent-red #b91c1c). Bundled the previously-unpushed EOD+11 appt-live + EOD+12 chart stack into this push.

## Files Touched (light-theme work — uncommitted)
- `src/index.css` (central override sweep block, labeled "LIGHT-THEME AUDIT 2026-05-27")
- `tailwind.config.js` (darkMode line + comment)
- `src/components/backend/CustomerDetailView.jsx` (841/849/857)
- `src/components/backend/LinkLineInstructionsModal.jsx` (176/289/296/303)
- `src/components/backend/LinkRequestsTab.jsx` (341/352/363)
- `src/components/backend/TreatmentTimelineModal.jsx` (81/83/126)
- `src/components/ClinicSettingsPanel.jsx` (199)
- `tests/light-theme-override-coverage.test.js` (NEW)
- `tests/customer-treatment-timeline-flow.test.js` (TL1.6)
- `docs/superpowers/specs/2026-05-27-light-theme-audit-design.html` (NEW)
- `docs/superpowers/plans/2026-05-27-light-theme-audit.html` (NEW)
- `docs/superpowers/plans/2026-05-27-light-theme-inventory.md` (NEW)

## Decisions (1-line each)
- Quality bar = WCAG **AA 4.5:1** (not AAA). Fix mechanism = **Hybrid central-first** (extend index.css override layer; component-level only where central can't reach = inline styles). Scope = **App UI**, exclude print/document views. darkMode = **Global config** (user-approved).
- Brand-red `#dc2626` = **NOT auto-changed** — flagged for user (4.37:1 on tinted cards; always on delete/weekend/error, never on names/HN per Thai-culture rule).
- Scanner > eyeballing: the frontend-appt page I'd called "clean" from a screenshot had real fails when scanned. The user's "ตรวจหมดจริงๆเหรอ" push was correct.

## Next Todo (USER-triggered)
1. ✅ DONE (2026-05-28): brand-red darken `#b91c1c` (strict AA) → commit `a4731775` + push + `vercel --prod` LIVE + prod-verified.
2. ✅ DONE: SESSION_HANDOFF archival (277→142 KB; 46 oldest blocks → archive; under cap) via one-shot node script.
3. ⏳ user L1 spot-check 6 unscanned surfaces (stock/master-data/treatment-form/chat/settings/deep-modals) on PROD light theme.
4. ⏳ user L1: appt-live cross-device + chart flows (first prod exposure since EOD+11/EOD+12 deployed in this same push).

## Resume Prompt
Resume LoverClinic — continue from 2026-05-28 (light-theme + brand-red SHIPPED + DEPLOYED).
Read in order BEFORE any tool call: 1. CLAUDE.md  2. SESSION_HANDOFF.md (master=3605f284, prod=9042934a; read with a `limit`)  3. .agents/active.md  4. .claude/rules/00-session-start.md.
Status: light-theme WCAG-AA audit (App UI) + brand-red red-700 #b91c1c SHIPPED + DEPLOYED + prod-verified; full vitest 14976/0; build clean; tree clean; SESSION_HANDOFF 142 KB (under cap).
Next: idle / await user. Remaining = user L1 on 6 unscanned surfaces (stock/master-data/treatment-form/chat/settings/deep-modals) + appt-live/chart prod flows.
Rules: no commit/push/deploy without the word THIS turn (V18); Rule Q/Q-vis/Q-honest; no Probe-Deploy-Probe (no rules/storage/cron).
