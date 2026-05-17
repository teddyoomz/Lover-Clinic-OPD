# 2026-05-18 EOD+6 — Sub-tab Picker (T1-T7) SHIPPED + Arc Fan polish (5 rounds)

## Summary

Executed the 7-task sub-tab picker plan via subagent-driven-development (Rule K work-first: T1-T6 source only, T7 batched all 6 test tiers). Shipped V5 desktop 3D Tilt + Mouse-Follow / V2 mobile Expanding Bubble picker that opens when a multi-item orb is clicked. Then 5 iterative polish rounds on the mobile Arc Fan menu per user feedback, landing at appts-centric concentric ring layout (1 center + 3 inner + 4 outer).

## Current State

- master = `666008f6` · ~13 commits ahead of prod (`ef4bd5c3`)
- Full project tests: 11543 PASS / 25 skipped · pre-existing v81-emulator-roundtrip failure (Java not installed, unrelated)
- Backend Menu D pyramid: 136/136 PASS
- Build clean 2.63–2.92s · BackendDashboard chunk ~949 KB
- No deploy this session (awaiting "deploy" verb)

## Commits (this session)

```
666008f6 fix(backend-menu-d EOD+5 polish round 5): appts-centric concentric rings (1 + 3 + 4)
cdbff32c fix(backend-menu-d EOD+5 polish round 3): mobile Arc Fan ZERO overlap (inner r=160 + outer r=250)
11313ba5 fix(backend-menu-d EOD+5 polish round 2): mobile Arc Fan → TWO-TIER concentric arcs (4 inner + 4 outer)
a1fffa50 fix(backend-menu-d EOD+5 polish): Arc Fan mobile · default-open bloom · mouse-follow seed
52e3d108 test(backend-menu-d T7 subtab): final test batch · all 6 tiers + V21 fixups + ArcBloom Esc-gate fix
6ab3296d feat(backend-menu-d T6 subtab): ArcBloom integration · open picker when items.length ≥ 2
7b43feb0 feat(backend-menu-d T5 subtab): mobile bubble origin from clicked orb position
f04f8a4a feat(backend-menu-d T4 subtab): mouse-follow interactive tilt
78ea8cff feat(backend-menu-d T3 subtab): CSS layer V5 3D + V2 bubble + mini-orb
35573b88 feat(backend-menu-d T2 subtab): SubTabBloom component skeleton (V5/V2 split + a11y)
8042a405 feat(backend-menu-d T1 subtab): emoji map for sub-tab picker mini-orbs
```

(Round 4 was the 3-tier-from-corner layout — replaced by round 5 appts-centric per user redirect.)

## Files Touched

### Sub-tab picker (T1-T6 source)
- NEW `src/components/backend/shell/subTabEmoji.js` (51 emoji entries · Rule C1 extraction)
- NEW `src/components/backend/shell/BackendSubTabBloom.jsx` (component + a11y baseline + mouse-follow lerp + mobile bubble origin)
- MOD `src/index.css` (+177 LOC: V5 3D, V2 bubble, mini-orb, reduced-motion safe)
- MOD `src/components/backend/shell/BackendArcBloom.jsx` (import + state + handleOrbClick branch + SubTabBloom mount + Esc-gate fix)

### T7 test batch (6 tiers)
- NEW `tests/backend-menu-d-subtab-picker-rtl.test.jsx` (20 tests including P1.19 + P1.20)
- NEW `tests/backend-menu-d-subtab-picker-source-grep.test.js` (26 regression locks)
- NEW `tests/backend-menu-d-subtab-picker-flow-simulate.test.jsx` (8 Rule I chains)
- NEW `tests/backend-menu-d-subtab-picker-stress.test.jsx` (8 chaos scenarios)
- MOD `tests/e2e/backend-menu-d.spec.js` (Playwright E9-E14 — Rule Q V66 L1 mouse-follow)
- MOD `tests/backend-menu-d-user-simulation.mjs` (bot SELECTORS extended)
- MOD `tests/backend-menu-d-bloom-rtl.test.jsx` (T3.4 + T3.5 V21 fixups)
- MOD `tests/backend-menu-d-flow-simulate.test.jsx` (FS2/FS3/FS4 V21 fixups)
- MOD `tests/backend-menu-d-shell-rtl.test.jsx` (T6.6 + T6.9 V21 fixups)

### Polish rounds (5)
- MOD `src/components/backend/shell/BackendArcBloom.jsx` — MOBILE_POSITION iterated 5 times (corner-quarter-arc → 2-tier-same-angle → 2-tier-wider-r → 3-tier-from-corner → appts-centric concentric)
- MOD `src/components/backend/shell/BackendShellNew.jsx` — bloomOpen useState default flip false→true
- MOD `src/pages/BackendDashboard.jsx` — activeTab useState default 'customers'→'appointment-all'
- MOD `src/components/backend/shell/BackendSubTabBloom.jsx` — module-level cursor tracker + rAF seed for immediate mouse-follow on picker open

## Decisions

- Sub-tab picker: subagent-driven-development with sonnet model per task. T1-T6 source only, T7 = single test batch (Rule K work-first per user explicit).
- V21 fixups landed alongside T7 (5 pre-T6 tests asserted old direct-navigate contract; updated to multi-item-picker contract).
- ArcBloom Esc-gate (defer Esc handler to picker when picker mounted) — spec-compliance fix discovered during T7c FP3, not a regression. Per Rule I lesson.
- EOD+5 polish: cosmetic-shell preserved across all 5 rounds (only MOBILE_POSITION values + 2 default useState flips + cursor tracker added; no handler/state/prop signature changes).
- Final Arc Fan: appts-centric concentric rings (NOT corner-anchored quarter arc). User iterated 5 rounds to land here. Rationale: appts as visual focal point + 2 concentric ring layers + zero overlap + just above duo pill.
- Per Rule N — focused test runs during iteration, full vitest at batch end (11543 PASS confirmed).

## Next Todo

1. **Deploy** when user types "deploy" (vercel-only, no rules change since V82-Phone). Combined batch: V82-Phone `257a699f` + sub-tab picker T1-T7 + 5 polish rounds.
2. After deploy: user L1 hands-on tests for (a) mouse-follow tilt on real cursor, (b) Arc Fan tap-test on real phone, (c) sub-tab picker E2E on real prod multi-item sections.
3. V82 Menu V2 mobile L1 re-test (carryover from prior session).
4. Playwright L1 mouse-follow tilt run when admin creds env set (E11 in backend-menu-d.spec.js).
