---
title: Light-theme WCAG-AA accent handling
type: concept
date-created: 2026-05-28
date-updated: 2026-05-28
tags: [light-theme, accessibility, wcag, accent, v124, v125]
source-count: 0
---

# Light-theme WCAG-AA accent handling

> How LoverClinic keeps colored accent text/CTAs ≥4.5:1 (WCAG AA) in light theme. The app is dark-first; light theme is delivered by `[data-theme="light"]` CSS overrides in `src/index.css` plus, for inline-styled accents, the [`aaAccent`](../entities/theme-accent.md) JS helper. V124 built the CSS layer; V125 closed the two gaps it couldn't reach.

## The two mechanisms

1. **Class-based CSS overrides (V124)** — `src/index.css` `[data-theme="light"]` blocks remap Tailwind accent UTILITY classes to AA-dark: `.text-{c}-400/-500/-600 → -700/-800` deepen, and a blanket `.text-white → var(--tx-heading)` (dark) with **white-restore exceptions** for colored CTA backgrounds (`[class*="bg-{c}-"].text-white → #fff`, `src/index.css:509-542`). White-on-`bg-{c}-600` CTAs deepen the bg to `-700` so white passes (V124-fix3 "ดัน AA เต็ม").
2. **JS helper for inline styles (V125)** — [`aaAccent(hex, isDark)`](../entities/theme-accent.md) deepens inline `style={{color:'#…500'}}` accents at render. CSS can't touch inline styles (no class to match), so this is the only fix for them.

## The two V124 gaps V125 closed (treatment form — the one surface V124 didn't individually scan)

- **Inline -500 accents** (section headers, pills, ChartSection/TreatmentTimeline) set color via inline `style={{color}}` from a per-section accent hex — V124's class overrides never matched them, so they stayed raw -500 (e.g. yellow-500 **1.87:1**, amber-500 2.08, cyan-500 2.43). Fix: route through `aaAccent` (deepen to -700 in light).
- **Arbitrary-hex CTA + `text-white`** — the doctor-note save button `bg-[#7c3aed] text-white` (`src/components/TreatmentFormPage.jsx`) was darkened to slate **3.05:1** by V124's blanket `.text-white→dark`, because the white-restore exceptions match only Tailwind `bg-{c}-`, not arbitrary `bg-[#hex]`. Fix: a white-restore rule for `.bg-\[\#7c3aed\].text-white` in `src/index.css` (→5.2 AA). Its teal sibling `#2EC4B6` (dark @7.76) and LINE-green `#06C755` (@7.67) are left dark — already AA, so NOT restored.

## Key facts

- Dark theme is **never** changed — `aaAccent` is pass-through when `isDark`, CSS overrides are `[data-theme=light]`/`[data-theme=auto]` scoped.
- Verification is **real-browser contrast scan** (gradient-aware: skips `background-image`), not source-grep alone — per Rule Q / Rule Q-vis. V124-fix2 lesson: a partial inject-preview missed a stock-button regression → scan the real DEPLOYED build across surfaces.
- `tests/light-theme-override-coverage.test.js` (T7) is the regression guard: AA-math (every mapped target ≥4.5 on white) + source-grep (every consumer routes through the helper / restore present).

## Cross-references

- Entity: [themeAccent.js / aaAccent](../entities/theme-accent.md)
- Entity: [TreatmentFormPage](../entities/treatment-form-page.md)
- Lessons: V124 (light-theme invisibility) + V125 (inline-accent + arbitrary-hex CTA) in `.claude/rules/v-log-archive.md`.

## History

- 2026-05-28 — Created with V125 (shipped + deployed + prod-verified: treatment form 0 fails on live build, finance tab 0 no-regression). Documents the V124 CSS layer + the two gaps V125 closed.
- Known follow-up: `PatientForm.jsx` uses bespoke `isDark ? dark : light` brand colors (pink/rose) — some light values may be sub-AA but it needs a DESIGN pass, not a mechanical `aaAccent` wrap.
