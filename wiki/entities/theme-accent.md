---
title: themeAccent.js — aaAccent helper
type: entity
date-created: 2026-05-28
date-updated: 2026-05-28
tags: [light-theme, accessibility, wcag, accent, v125]
source-count: 0
---

# themeAccent.js — `aaAccent(hex, isDark)`

> Theme-aware accent helper (V125, 2026-05-28). Deepens a raw Tailwind -500/-400 accent hex to its -700 AA-dark equivalent **in light theme only**; pass-through in dark. Exists because some components set accent color via **inline `style={{color:'#…500'}}`**, which V124's class-based `[data-theme=light]` CSS overrides cannot reach (no utility class to match).

## Overview

`src/lib/themeAccent.js` is a tiny pure-JS module (no React/Firebase) with one map + one function:

- `LIGHT_AA_ACCENT` — frozen map of `-500`/`-400` source hex (lowercased, no `#`) → `-700` AA-dark target, across the full Tailwind palette (red/orange/amber/yellow/lime/green/emerald/teal/cyan/sky/blue/indigo/violet/purple/fuchsia/pink/rose).
- `aaAccent(hex, isDark)` — `src/lib/themeAccent.js:62-66`. If `isDark` truthy OR input not a string → return `hex` unchanged (dark keeps the vibrant shade, already AA on a dark surface — mirrors V124 "dark untouched"). In light → returns the mapped -700 deepen, or the input unchanged for unknown hexes (safe: we only ever return a DARKER same-family shade, which can't reduce contrast on a light bg).

Every mapped target is **≥4.5:1 on white** — asserted by the AA-math test in `tests/light-theme-override-coverage.test.js` (V125 block).

## API surface

```
aaAccent(hex: string, isDark: boolean) → string   // deepened in light, pass-through in dark
LIGHT_AA_ACCENT: Record<lowerHexNoHash, '#rrggbb'>  // -500/-400 → -700
```

## Consumers (V125)

- [TreatmentFormPage (TFP)](treatment-form-page.md) — `SectionHeader` (icon+title) + `ActionBtn` (color/border/bg) compute `aaAccent(accent/color, isDark)` once; + 12 inline accent spans wrapped (`src/components/TreatmentFormPage.jsx`).
- `ChartSection.jsx` — `const a = aaAccent(accent, isDark)` for the CHART header icon/title + "เพิ่ม Chart" button.
- `TreatmentTimeline.jsx` — 2 hardcoded inline accents (`#22c55e` green-500, `#14b8a6` teal-500) routed through `aaAccent`; its main `accent` var was already theme-aware.

## Cross-references

- Concept: [Light-theme WCAG-AA accent handling](../concepts/light-theme-aa.md)
- Related entity: [TreatmentFormPage](treatment-form-page.md)
- Lesson: V125 in `.claude/rules/v-log-archive.md` (the treatment form was the one surface V124 didn't individually scan; 19 light-theme AA fails found + fixed).

## History

- 2026-05-28 — Created with V125. Shipped + deployed + prod-verified (post-deploy re-scan: treatment form 0 fails on live build, sale tab 0 no-regression).
