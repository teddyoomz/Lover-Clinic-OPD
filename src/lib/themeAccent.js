// V125 — Theme-aware accent helper (light-theme AA, 2026-05-28).
//
// Some components (TreatmentFormPage SectionHeader/ActionBtn + inline accent
// spans) set their accent color via INLINE style={{ color: '#xxx' }} using the
// Tailwind -500/-400 hex directly. V124's class-based [data-theme=light] color
// overrides cannot reach inline styles (there is no utility class to match), so
// those accents stay at the raw -500 shade in light theme and fail WCAG AA on a
// light background (e.g. yellow-500 1.87:1, amber-500 2.08:1, cyan-500 2.43:1).
//
// `aaAccent(hex, isDark)` deepens a known -500/-400 accent hex to its -700
// AA-dark equivalent IN LIGHT THEME ONLY (dark theme keeps the vibrant shade,
// which is already AA on a dark surface — mirrors V124 "dark untouched").
// Hue is preserved (one-family deepen), so the design's color identity stays.
//
// Every mapped target is >= 4.5:1 on white (verified in
// tests/light-theme-override-coverage.test.js T7). Unknown hexes pass through
// unchanged (safe — never makes contrast worse on a light bg, since we only
// ever return a DARKER shade of the same family).

// -500 and -400 source hex (lowercased, no #) → -700 AA-dark target.
export const LIGHT_AA_ACCENT = {
  // red
  ef4444: '#b91c1c', f87171: '#b91c1c',
  // orange
  f97316: '#c2410c', fb923c: '#c2410c',
  // amber
  f59e0b: '#b45309', fbbf24: '#b45309',
  // yellow
  eab308: '#a16207', facc15: '#a16207',
  // lime
  '84cc16': '#4d7c0f', a3e635: '#4d7c0f',
  // green
  '22c55e': '#15803d', '4ade80': '#15803d',
  // emerald
  '10b981': '#047857', '34d399': '#047857',
  // teal
  '14b8a6': '#0f766e', '2dd4bf': '#0f766e',
  // cyan
  '06b6d4': '#0e7490', '22d3ee': '#0e7490',
  // sky
  '0ea5e9': '#0369a1', '38bdf8': '#0369a1',
  // blue
  '3b82f6': '#1d4ed8', '60a5fa': '#1d4ed8',
  // indigo
  '6366f1': '#4338ca', '818cf8': '#4338ca',
  // violet
  '8b5cf6': '#6d28d9', a78bfa: '#6d28d9',
  // purple
  a855f7: '#7e22ce', c084fc: '#7e22ce',
  // fuchsia
  d946ef: '#a21caf', e879f9: '#a21caf',
  // pink
  ec4899: '#be185d', f472b6: '#be185d',
  // rose
  f43f5e: '#be123c', fb7185: '#be123c',
};

/**
 * Returns an AA-safe accent for the current theme.
 * @param {string} hex   accent hex (e.g. '#ef4444'); any case, with/without '#'.
 * @param {boolean} isDark  true = dark theme (keep vibrant), false = light (deepen).
 * @returns {string} the (possibly deepened) hex; unknown/empty inputs pass through.
 */
export function aaAccent(hex, isDark) {
  if (isDark || !hex || typeof hex !== 'string') return hex;
  const key = hex.replace('#', '').trim().toLowerCase();
  return LIGHT_AA_ACCENT[key] || hex;
}
