# 2026-06-20 (cont.2) — Filler v5.6 (breathe+glow + split-fix) + v6 (narrow cited estimate + ladder-72 + 2D dash toggles)

## Summary
Continued the public pure-client `?play=filler` simulator: shipped v5.6 (red dashed "หลังฉีด" breathe+glow + fainter baseline), fixed a regression I introduced (the breathe faded the whole skin body, not just the line), then a v6 overhaul — narrowed the estimate range with a cited formula recalibration, extended the condom ladder to the real ISO 72mm max, and added 2D dash toggles that double as the legend + stronger glow + auto-scale. All SHIPPED local + pushed; NOT deployed (await "deploy"; pure-client → vercel-only, no Probe-Deploy-Probe).

## Current State
- master `3d37eeca` (= origin, pushed). prod UNCHANGED — filler-sim NOT deployed all session.
- `?play=filler` = pure client, NO Firestore/auth/PII/rules. `three` lazy (3D). Single source of truth = `fillerMath.js`. Obfuscation BUILD-only (dev + vitest unobfuscated).
- filler 98/0 targeted · full vitest **16864/0** (1 transient parallel flake, 0 on re-run) · build clean (obfuscated).
- Rule Q L1 verified in real browser (rendered DOM text + toggle behavior + live CSS + mobile geometry). Honest gap: preview_screenshot times out → no JPEG.
- Estimate now cited (PMC7230452 RCT + ISO 4074) — citations in the v6 spec for the credibility record the user asked for.

## Commits (this session)
```
3d37eeca feat(filler-sim v6): narrow + cited estimate (k 1.8–2.3) · condom ladder→72 · 2D dash toggles · stronger glow
98ed2322 fix(filler-sim v5.6): breathe animates the red OUTLINE only, not the skin body
2975fce3 feat(filler-sim v5.6): red dashed "หลังฉีด" breathe+glow + fainter baseline
```

## Files Touched
- `src/lib/fillerMath.js` (K_REALISTIC/K_OPTIMISTIC recalibration 2.37/3.32→1.8/2.3; condomForGirth beyond-ladder + REAL_MAX_W=72)
- `src/lib/fillerStrings.js` (beyondStd + g2dDashToggleHint/g2dToggleAfter/g2dToggleBaseline, TH+EN)
- `src/pages/FillerSimulator.jsx` (ResultCard delta = beyondStd when beyond)
- `src/components/FillerGraphic2D.jsx` (v5.6 breathe class + split + glow; v6 DashToggle + showAfter/showBaseline state + conditional dashes + legend rebalance + stronger glow + flex-wrap)
- `tests/filler-math.test.js` · `tests/filler-simulator-flow-simulate.test.js` (v5.6 + v5.7 + v6 blocks; ~12 V21 fixups)
- `docs/superpowers/specs/2026-06-20-filler-{red-line-breathe-glow,v6-narrow-estimate-and-dash-toggles}-design.html` · `docs/superpowers/plans/2026-06-20-filler-red-line-breathe-glow.html`

## Decisions
- v5.6 = Calm breathe + glow, fade to opacity 0 (held), ~3.6s, reduced-motion guard; baseline opacity 0.5→0.25 dark / 0.42→0.21 light.
- v5.6 split: red dashed outline is its OWN `fill="none"` element over the static skin-fill body → opacity/glow touch the LINE only (the regression root cause + fix).
- v6 A1: k 1.8 (durable ~6mo) – 2.3 (early-peak ~1mo), anchored to the HA RCT; integer-fraction form (180/100, 230/100) so the obfuscator hides it.
- v6 ladder-72: 66–72 = real ISO numbered sizes (beyond:false); เกินมาตรฐาน 🔥 only > 72.
- v6 B: dash toggles double as the legend (each chip = dashed swatch + label), bottom-right, color-keys left; stronger glow (drop-shadow 4+9+15px); ≥44px tap + flex-wrap.

## Key lessons
- A toggle/animation on a combined fill+stroke SVG element fades the FILL too — split the outline (`fill="none"`) onto its own element when only the line should animate. (Issue-1 regression; verify rendered pixels, not the object model — V66.)
- A formula's UNCERTAINTY BAND is a credibility surface: a mathematically-correct geometry with too-wide empirical multipliers reads as unreliable. Anchor the multipliers to real clinical data + cite it.
- numbersToExpressions hides integer LITERALS in code but the obfuscation lesson stands — write calibration constants as integer fractions (180/100), never float literals.
- Parallel research/adversarial Workflows rate-limit on a 4-agent burst (V83-followup) → recover by running the research INLINE (main loop WebSearch/WebFetch), which also keeps citation verification first-hand (Rule Q-honest, no fabricated sources).
- Two adversarial workflows launched this session BOTH rate-limited and returned nothing; direct verification (98 tests + L1 + synthetic-index self-check) carried the confidence — don't block a verified change on a dead workflow.

## Next Todo
- Idle / await. Deploy filler-sim on explicit "deploy" → `vercel --prod` (frontend-only, pure-client, no Probe-Deploy-Probe).

## Resume Prompt
Resume LoverClinic — filler-sim SHIPPED local (master `3d37eeca`), NOT deployed. `?play=filler` pure-client. This session: v5.6 (breathe+glow + split-fix regression) + v6 (narrow cited estimate k1.8–2.3 [PMC7230452/ISO 4074] + condom ladder→72 + 2D dash toggles + stronger glow + auto-scale). filler 98/0; full vitest 16864/0. Next: idle/await; deploy on explicit "deploy" (vercel-only). Read .agents/active.md + SESSION_HANDOFF top block. /session-start
