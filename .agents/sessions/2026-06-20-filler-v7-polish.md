# 2026-06-20 (cont.3) — Filler v7 / v7.1 visual polish (committed, NOT deployed)

## Summary
After the standalone site deployed (see `2026-06-20-filler-standalone-public-site.md`), a series of user-driven visual tweaks to the filler simulator, each via `/systematic-debugging` with Rule Q-vis screenshot verification on the obfuscated build. 3 commits, NOT deployed — live sites still show the pre-polish version.

## Current State
- master `df2f277f` (=origin). full vitest **16870/0** · build clean.
- Live `loverclinic.vercel.app` + OPD `?play=filler` are at ~`5742f73a` (PRE these 3 commits).
- Next "deploy" = `npm run deploy:filler` ships all 3 to both sites.

## Commits
```
df2f277f v7.1: condom HERO card (top + most prominent) + red line breathing full-disappear
c63fd2cb v7: mobile controls-on-top + red "หลังฉีด" line default OFF
6f78c45d v7: red "หลังฉีด" line was barely visible — BOLD + always-visible + strong pulsing glow
```

## What each fixed (root cause → fix, all verified by screenshots)
- **6f78c45d** — red line barely visible. Root cause (peak/trough screenshots): `strokeOpacity 0.6` (washed out over warm skin) + `strokeWidth 1` (thin) + breathe faded opacity 1→0 (vanished periodically) + weak glow from that faint line. Fix (both side-view + cross-section): opacity 1, width 2.6, dash `7 4`, never-fade, always-on pulsing glow. Also fixed the OPD `vite.config.js` obfuscator-breaks-3D bug surfaced while checking parity.
- **c63fd2cb** — mobile: flip the `≤820px` grid order to `.fs-controls{order:1} .fs-graphic{order:2}` (controls on top). `showAfter` default `true`→`false` (red line hidden until toggled).
- **df2f277f** — results: condom card (`resCondom`) moved FIRST + a HERO `ResultCard` variant (full-width, fire border + glow shadow, `แนะนำ` badge, 30px green number) above the now-compact girth+dia cards; new `recommended` string (TH/EN). Breathing keyframes: restore a FULL-disappear beat (`opacity→0` + `filter:none`) for the before↔after contrast, while keeping the bold peak (3.4s: bold-hold → fade → GONE-hold → fade → bold).

## Files Touched
src/components/FillerGraphic2D.jsx · src/pages/FillerSimulator.jsx · src/lib/fillerStrings.js · tests/filler-simulator-flow-simulate.test.js · (6f78c45d also: vite.config.js + R9-8 test)

## Key lessons
- "Barely visible" had FOUR compounding causes — strokeOpacity, width, fade-to-0, glow-derived-from-faint-line. Screenshots at peak AND trough (Rule Q-vis) were what proved each, not code-reading.
- An obfuscator that mangles a dynamic-import literal silently kills code-splitting (3D chunk never emits). Scope the obfuscator to the formula files only; never include the dynamic-import host.
- v7 (never disappear) and v7.1 (full disappear) aren't contradictory: the v7 lesson was the PEAK must be bold (so it's never "barely visible"); v7.1 reintroduces a deliberate disappear FOR CONTRAST now that the visible state is bold.

## Next Todo
- Deploy the 3 commits on explicit "deploy" → `npm run deploy:filler` (both OPD + standalone; frontend-only, no Probe-Deploy-Probe).

## Resume Prompt
Resume LoverClinic — filler standalone DEPLOYED LIVE (loverclinic.vercel.app); v7/v7.1 visual polish (`6f78c45d` red-bold · `c63fd2cb` mobile/default-off · `df2f277f` condom-hero+breathing) committed+pushed, NOT deployed (live sites PRE-polish). master `df2f277f`; full vitest 16870/0; build clean. Next: idle; on "deploy" → `npm run deploy:filler`. Read `.agents/active.md` + SESSION_HANDOFF top + this checkpoint. /session-start
