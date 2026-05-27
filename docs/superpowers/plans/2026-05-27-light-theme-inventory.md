# Light-Theme Audit — Discovery Inventory (T1)

> 2026-05-27 EOD+12. Drives the fix tasks. Scope = App UI (admin + backend + patient-facing); **print/document views EXCLUDED** (PrintTemplates.jsx etc. are hardcoded paper-light by design). 267 .jsx files under components+pages. Method: grep frequency (`scripts/diag-light-theme-scan.sh`, deleted) + diff vs `index.css` `[data-theme=light]` coverage. Live-pixel verification per Rule Q-vis follows.

## FM-B — white/near-white text → ALREADY centrally covered
`text-white`, `text-[#fff/#ffffff/#FFF/#FFFFFF]`, `text-[white]`, `text-gray-200/300/400/500/600/700` all have `[data-theme=light]` overrides + the colored-bg "restore white" rules. **No new central rule needed.** Residual = inline-style whites (see FM-D) + any colored-bg misfire (catch in live pass).

## FM-A — uncovered DARK surface classes (no light override) → central fix
Each near-black bg / dark border / dark gradient-stop renders dark on the light surface.

| Class | uses | → light value |
|---|---|---|
| `bg-[#0e0e0e]` | 5 | `var(--bg-card)` |
| `bg-[#151515]` | 4 | `var(--bg-card)` |
| `bg-[#0c0c0c]` | 2 | `var(--bg-card)` |
| `bg-[#0d0d0d]` | 1 | `var(--bg-card)` |
| `bg-[#080808]` | 1 | `var(--bg-card)` |
| `bg-[#0a0c14]` | 1 | `#eff6ff` (navy → faint-blue, mirrors `#0a1128`) |
| `border-[#2a2a2a]` | 4 | `var(--bd-strong)` |
| `border-[#555]` | 1 | `var(--bd-stronger)` |
| `from-[#1a0515]` | 1 | gradient-from `#fdf2f8` (mirrors `bg-[#1a0515]`) |
| `from-[#1a0505]` | 1 | gradient-from `#fff5f5` (mirrors `bg-[#1a0505]`) |

NOTE `text-[#333]` (3) / `text-[#555]` (1) need NO fix — dark-gray text is legible on light (only a dark-theme concern, out of scope).

## FM-C — low-contrast colour text shades (no AA darkening) → central fix (BIG bucket)
Old palette (red/orange/blue/teal/violet/cyan-400/green-500/pink/purple-400) IS covered; the codebase later adopted emerald/sky/rose/amber + extra 300/500 shades that were never darkened. Targets are -700 family (≥4.5:1 on white), matching the existing darkening convention.

| Used shade(s) | uses | → AA-dark target |
|---|---|---|
| `text-emerald-300/400/500` | 66/211/9 | `#047857` (emerald-700) |
| `text-sky-300/400/500` | 42/150/8 | `#0369a1` (sky-700) |
| `text-rose-300/400/500` | 52/96/17 | `#be123c` (rose-700) |
| `text-amber-300/400/500` | 91/50/9 | `#b45309` (amber-700) |
| `text-cyan-300/500` | 40/7 | `#0e7490` (cyan-700, matches existing cyan-400) |
| `text-green-300/400` | 11/26 | `#15803d` (green-700) |
| `text-teal-500` | 10 | `#0f766e` (teal-700) |
| `text-blue-300` | 8 | `#1d4ed8` (blue-700, matches existing) |
| `text-purple-300/500` | 7/2 | `#6d28d9` (violet-700) |
| `text-pink-300` | 7 | `#be185d` (pink-700, matches existing pink-400) |
| `text-indigo-300` | 6 | `#4338ca` (indigo-700) |
| `text-yellow-400` | 1 | `#a16207` (yellow-700) |
| `text-violet-500` | 1 | `#6d28d9` (violet-700) |

Risk: a darkened colour used as text ON a same-colour saturated bg could lose contrast — same V107 risk the existing overrides already took; mitigated by live verification (narrow that one selector if it breaks).

## FM-D — inline-style / arbitrary colours (central can't reach) → component value-swap
In-scope (NOT PrintTemplates which is excluded paper-light):

| File:line | colour | note → fix |
|---|---|---|
| `CustomerDetailView.jsx:841` | `#60a5fa` text on light tint | blue contact btn — theme-aware var → light `#1d4ed8` |
| `CustomerDetailView.jsx:857` | `#c084fc` text on light tint | purple contact btn → light `#7c3aed` |
| `LinkLineInstructionsModal.jsx:289` | `#f59e0b` text on light tint | amber → light `#b45309` |
| `LinkLineInstructionsModal.jsx:303` / `LinkRequestsTab.jsx:341,363` | `#f59e0b`/`#ef4444` text on tint | amber/red → light dark equivalents |
| `LinkLineInstructionsModal.jsx:176` / `TreatmentTimelineModal.jsx:81,83,126` | `#06C755`/`#2EC4B6` icons | brand/teal icons — verify AA as graphics (3:1); darken in light if needed |
| `ClinicSettingsPanel.jsx:199` | `#f59e0b` icon | amber icon — verify |
| `BackendSidebar.jsx:286` | `ac` accent + `color-mix(...,#fff)` (DYNAMIC) | logic-driven — DO NOT touch; verify accent legible in light, narrow via CSS only if broken |
| `*Panel.jsx` / `SaleTab.jsx` gradient CTAs | `linear-gradient(saturated)` + white text | colored CTA headers — white-on-saturated is fine both themes; verify only |

Fix approach for FM-D text-on-tint: introduce theme-aware CSS vars (dark value = current, light value = AA-dark) and reference inline — value-only swap + a var def, no logic.

## SANCTIONED (NOT bugs — brand/accent saturated backgrounds, white text is correct)
`bg-[#06C755]`/`border-[#06C755]`/`text-[#06C755]` (LINE green) · `bg-[#7c3aed]/#6d28d9/#5b21b6` (violet) · `bg-[#2EC4B6]/#26a89c/#1f8f86` (teal) · `bg-[#04a948]` (green). These are saturated accents, not dark surfaces → no dark-on-light fix. (`text-[#06C755]` small-label uses: verify AA in live pass; darken only if it's body-size text not a branded chip.) Feed this list into the T7 override-coverage test's allowlist.
