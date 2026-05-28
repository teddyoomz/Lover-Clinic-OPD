# Checkpoint — V125 light-theme WCAG-AA (treatment form) — 2026-05-28 EOD+1

## Summary
`/session-start → "Outstanding ทำเลย"`. Re-proved the 3 outstanding L1 items live, then the treatment-form L1 contrast scan FOUND 19 light-theme AA fails V124's class-based CSS overrides couldn't reach (the one surface V124 never individually scanned). Fixed across 2 classes (inline-accent `aaAccent` helper + arbitrary-hex CTA white-restore), SHIPPED + DEPLOYED + verified on the LIVE build (Rule Q-vis). PatientForm deferred (bespoke brand colors = design pass).

## Current State
- master=prod `f56bfa9b` LIVE @ lover-clinic-app.vercel.app · prod-verified · tree clean (after session-end commit).
- Tests: full vitest **14990 pass + 1 known flake** (phase15.5b global.fetch-leak, passes 51/0 isolated — not V125); T7 **20/0**; build clean. (Reused from this session's runs — not re-run at session-end.)
- CSS/theme + 1 new lib + listener-swap only → no firestore.rules/storage/data/cron → no Probe-Deploy-Probe.
- graphify graph refreshed (AST-only). Wiki updated (entity + concept pages).
- Remaining: PatientForm.jsx light-theme design pass; live TreatmentTimeline render-scan (source-audited + AA-math-verified; awkward nav); appt-live/chart multi-device L1; v-log-archive V125 verbose entry not written (this checkpoint + wiki concept page hold the detail).

## The fix (2 classes)
- **Class 1 — inline -500 accents** (no class for V124 CSS to match): NEW `src/lib/themeAccent.js` `aaAccent(hex,isDark)` deepens -500/-400 → -700 AA-dark in light, pass-through dark. Wired into TFP `SectionHeader`+`ActionBtn` (component-level) + 12 inline spans + `ChartSection` + `TreatmentTimeline` (2). Worst pre-fix: yellow-500 1.87, amber-500 2.08, cyan-500 2.43.
- **Class 2 — arbitrary-hex CTA** — doctor-note save button `bg-[#7c3aed] text-white` darkened to slate 3.05:1 by V124 blanket `.text-white→dark` (white-restore at index.css:509-542 matched only Tailwind `bg-{c}-`, not arbitrary hex). Fix: index.css white-restore for `.bg-\[\#7c3aed\].text-white` (→5.2 AA). Teal #2EC4B6 (7.76) + LINE-green #06C755 (7.67) left dark (already AA).

## Verification (Rule Q / Q-vis)
- T7 20/0 (AA-math: every mapped target ≥4.5 on white + source-grep) · build clean · full suite (above).
- **Post-deploy re-scan on the LIVE deployed build** (gold-standard, V124-fix2 pattern): treatment form light = 0 accent fails (1372 els) + sale/finance tab 0 (2186 els, no regression) + appt view 0 + zoom (violet now white, headers deepened, teal correctly dark).
- Root cause found via inline-style inspection (not class) — systematic-debugging before fixing; inject-simulate on real prod elements = 0 fails pre-deploy; gold-standard = real build post-deploy.

## Commits
```
f56bfa9b fix(theme): V125 light-theme AA — inline-accent deepen + arbitrary-hex CTA white-restore
```

## Files Touched (V125, in f56bfa9b)
`src/lib/themeAccent.js` (new) · `src/components/TreatmentFormPage.jsx` · `src/components/ChartSection.jsx` · `src/components/TreatmentTimeline.jsx` · `src/index.css` · `tests/light-theme-override-coverage.test.js`. (+session-end: `.agents/*`, `SESSION_HANDOFF.md`, `wiki/*`.)

## Decisions (1-line each)
- Inline `style={{color}}` accents need a JS helper (`aaAccent`) — V124's class-based CSS can't reach them; that's why the treatment form was uncovered.
- Helper deepens to -700 keeping hue ("ดัน AA เต็ม" full-AA, design identity preserved); dark theme untouched (pass-through when isDark).
- Violet CTA → white-restore (matches its `text-white` design intent, 5.2 AA); teal/LINE-green left DARK because dark-on-bright is MORE accessible there (7.7) — restoring white would FAIL (~2.2).
- Verified the REAL deployed build (Rule Q-vis), not just inject — V124-fix2 lesson (partial inject-preview missed a stock regression).
- PatientForm NOT mechanically wrapped — bespoke `isDark?dark:light` brand colors need a design pass.

## Next Todo (user-triggered)
- PatientForm.jsx light-theme design pass (pink/rose brand AA).
- appt-live cross-device + chart on a real iPad — multi-device L1.
- Optional: v-log-archive verbose V125 entry + 00-session-start §2 one-liner.

## Resume Prompt
Resume LoverClinic — continue from 2026-05-28 EOD+1 (V125 light-theme AA SHIPPED+DEPLOYED+prod-verified).
Read: 1. CLAUDE.md  2. SESSION_HANDOFF.md (master=prod=f56bfa9b)  3. .agents/active.md  4. .claude/rules/00-session-start.md.
Status: master=prod `f56bfa9b` LIVE; full vitest 14990 pass + 1 known flake (phase15.5b isolated-pass); T7 20/0; build clean; tree clean.
Next: idle / await user. Outstanding: PatientForm light-theme design pass + appt-live/chart multi-device L1.
Rules: no deploy without "deploy" THIS turn (V18); Rule Q/Q-vis/Q-honest; no Probe-Deploy-Probe (no rules/storage/cron).
