# Checkpoint — V124 light-theme invisibility + appt real-time + full-AA — 2026-05-28

## Summary
`/systematic-debugging` on 2 user-reported bug classes: (A) light-theme INVISIBILITY (finance/deposit "มองไม่เห็นอะไรเลย" + date-strip "มองไม่ค่อยเห็น") and (B) backend appointments not real-time (date-strip counts stale until refresh). Both root-caused, fixed, deployed, and **verified on the live prod artifact** (Rule Q-vis real-browser + L2 cross-process). Then "ดัน AA เต็ม" (full AA) on the white-on-color badges. SHIPPED + DEPLOYED.

## Current State
- master=prod `38bd3565` LIVE @ lover-clinic-app.vercel.app · prod-verified · tree clean.
- full vitest **14983/0** (last full run, pre-fix3) · fix3 +1 T7 guard → T7 **13/0** targeted (NOT re-run full per directive) · build clean.
- CSS/theme + component-color + listener-swap ONLY — no firestore.rules/storage/data/cron → no Probe-Deploy-Probe.
- 2 verifier scripts kept: `scripts/fix-light-theme-bg-tint-{dark-clobber,v2-base-match}.mjs` (one-shot CSS transforms) + `scripts/diag-v124-realtime-appt-test.mjs` (Rule R real-time prover).
- Remaining (user-triggered): treatment-form not individually scanned (deep PHI nav; same global classes = covered) + appt-live/chart prod L1.

## Bug A — light-theme invisibility (CSS/theme only)
- **Root (finance badges INVISIBLE ~1.05:1)**: light bg-tint selectors `[data-theme=light] [class*="bg-{c}-{700..950}/"]` use SUBSTRING match → also matched the `dark:bg-{c}-900/30` VARIANT class on `bg-{c}-600 text-white dark:bg-{c}-900/30` badges → clobbered the solid bg to pale {c}-50 → white-on-pale = invisible.
- **Fix (v1→v2)**: v1 appended `:not([class*=":bg-X/"])` (exclude colon-prefixed) — but TOO BROAD: an element with base `bg-orange-900/20` AND `hover:bg-orange-900/40` (stock ปรับ/เพิ่ม/แก้ไข) contains `:bg-orange-900/` (hover:) → wrongly excluded → tint-remap stopped → raw dark tint 3.64:1 (regression caught by POST-DEPLOY re-scan). v2 = match the BASE utility instead: `[class*=" bg-X/"] + [class^="bg-X/"]` (space/start-preceded, never colon) → fires for base tint despite variants, skips dark:-ONLY badges. 136 selectors → base-match pairs.
- gray-600→`--tx-muted` + gray-700→`--tx-heading` (were `--tx-faint` #94a3b8 2.45:1 — INVERTED hierarchy: darkest grays → lightest token). orange-500→#c2410c. `-400` + `-600` colored-text shades completed to AA-dark (FM-C coverage uneven; fixed text-amber-600 "ยังไม่นัด" + text-teal-600 customer-name link).
- date-strip SELECTED tab: label `text-sky-200` (→#0369a1, MATCHED bg-sky-700 #0369a1 = 1.0 INVISIBLE) → `text-white`; number text-white (darkened to #0f172a on sky-700 = 3.01) → white via bg-sky-700/600 DESCENDANT white-restore (same-element restore missed child divs). count badge bg-sky-500→sky-600.
- **fix3 "ดัน AA เต็ม"**: white-on-`bg-{c}-600` is sub-AA for most colors (amber 3.19, emerald 3.77, green 2.8, yellow 2.2, sky 4.1, red save 4.0). `.bg-{c}-600.text-white` → `{c}-700` LIGHT/auto only (dark keeps -600 / dark: variants) → white-text ≥4.5 AA. Pushes finance badges + count badge + ALL white-on-color CTAs to strict AA, solid look kept (one-shade deepening). Finance → 0 fails.

## Bug B — appt real-time (per-branch, cross-device)
- **Root**: `AppointmentCalendarView` (renders all 6 backend appt sub-tabs) loaded the month aggregation (date-strip count badges + mini-cal dots) via one-shot `getAppointmentsByMonth` → only re-ran on month/branch change → a booking on another device never updated the strip until refresh. (Day grid was already live via `listenToAppointmentsByDate`.)
- **Fix**: month effect → `listenToAppointmentsByMonth(monthStr, {branchId}, flat→group→setMonthAppts, onError)`. onSnapshot = Firestore pushes to ALL subscribers (cross-device); `where('branchId')` scopes per-branch. Dropped the redundant after-save month re-fetch.

## Verified on LIVE PROD (Rule Q-vis + L2)
- Hardened real-browser contrast scanner (gradient-aware — skips background-image; an earlier FP on top-bar chrome taught this). finance **0 fails** · stock **0 fails** · system-settings/products/modal 0 · date-strip selected tab white-on-blue readable (zoomed).
- **Bug B real-time PROVEN**: `diag-v124-realtime-appt-test.mjs --write` (node admin-SDK = "another device") → date-strip "29/5" **2→3 LIVE, no refresh**; `--clean` → **3→2 LIVE**. Per-branch (write scoped to นครราชสีมา). TEST-APPT- prefix, deleted (prod clean).

## Commits
```
77757f67 fix(theme+appt): V124 light-theme invisibility + backend appointment real-time
d106a5cd fix(theme): V124-fix2 bg-tint dark:-clobber — base-match selectors (post-deploy regression fix)
4c751bf5 docs(agents): V124 + fix2 SHIPPED + DEPLOYED + prod-verified
38bd3565 fix(theme): V124-fix3 "ดัน AA เต็ม" — white-on-bg-{c}-600 → {c}-700 (full AA)
```

## Files Touched
- `src/index.css` (bg-tint base-match ×136, gray-600/700, orange-500, -400/-600 text, date-strip white-restore, AA-bg block)
- `src/components/backend/AppointmentCalendarView.jsx` (month listener + date-strip selected-tab label/badge)
- `tests/light-theme-override-coverage.test.js` (T7 +guards: base-match, gray, orange, -400, -600, date-strip restore, AA-bg, listener)
- `tests/branch-selector-bs-f-reader-refactor.test.js` (V21 fixup: getAppointmentsByMonth→listenToAppointmentsByMonth)
- `scripts/fix-light-theme-bg-tint-dark-clobber.mjs` + `scripts/fix-light-theme-bg-tint-v2-base-match.mjs` + `scripts/diag-v124-realtime-appt-test.mjs`
- `.agents/active.md`

## Decisions (1-line each)
- bg-tint dark:-clobber fix = BASE-match selectors (space/start), NOT `:not(colon)` — `:not` over-excludes base+variant elements (stock-button regression lesson).
- white-on-{c}-600 badges/CTAs → {c}-700 in light theme (full AA) — solid look kept, dark theme untouched (scoped `.bg-{c}-600.text-white`, light/auto only).
- date-strip selected-tab text uses bg-sky-700/600 DESCENDANT white-restore (child divs not covered by same-element restore).
- appt real-time = swap one-shot getter → onSnapshot listener (cross-device + per-branch comes free from Firestore + where-clause).
- Verified the v1→v2 regression via POST-DEPLOY re-scan (Rule Q-vis) — the injection-preview (finance/date-strip only) missed the stock buttons; deploy-then-re-scan caught it.

## Next Todo (user-triggered)
- treatment-form individual scan (deep PHI nav resisted) — covered by global classes; user L1 if desired.
- appt-live cross-device + chart prod flows — user multi-device L1.

## Resume Prompt
Resume LoverClinic — continue from 2026-05-28 EOD (V124 light-theme + appt real-time SHIPPED+DEPLOYED+verified).
Read in order: 1. CLAUDE.md  2. SESSION_HANDOFF.md (master=prod=38bd3565)  3. .agents/active.md  4. .claude/rules/00-session-start.md.
Status: master=prod `38bd3565` LIVE; full vitest 14983/0; build clean; tree clean.
Next: idle / await user. Outstanding: treatment-form L1 + appt-live/chart prod L1.
Rules: no deploy without "deploy" THIS turn (V18); Rule Q/Q-vis/Q-honest; no Probe-Deploy-Probe (no rules/storage/cron).
