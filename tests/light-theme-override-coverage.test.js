// Light-theme audit (2026-05-27) — regression guard against future drift.
// Every DARK arbitrary bg/border/gradient hex class used in app code must have a
// [data-theme="light"] override in src/index.css (or be a sanctioned brand/accent
// colour). Catches the failure mode: a new component uses bg-[#0d0d0d] / a dark
// colour with no light remap → renders as a dark block on the light surface.
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

const css = readFileSync('src/index.css', 'utf8');

function walk(dir) {
  let out = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (/\.(jsx?|tsx?)$/.test(f)) out.push(p);
  }
  return out;
}

const files = [...walk('src/components'), ...walk('src/pages')];

// Collect arbitrary bg/border/gradient hex classes actually used in app code.
const used = new Map(); // class string -> hex
for (const f of files) {
  const t = readFileSync(f, 'utf8');
  for (const m of t.matchAll(/(?:bg|border|from|via|to)-\[(#[0-9a-fA-F]{3,8})\]/g)) {
    used.set(m[0], m[1]);
  }
}

// Relative luminance (WCAG) of a hex colour.
function lum(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const f = [r, g, b].map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
}

// Sanctioned saturated brand/accent backgrounds — white text is intended; NOT dark
// surfaces, so no dark→light remap needed. (LINE green, violet/teal/green accents.)
const SANCTIONED = new Set([
  '#06C755', '#7c3aed', '#6d28d9', '#5b21b6', '#2EC4B6', '#26a89c', '#1f8f86', '#04a948',
]);

// Escape a tailwind arbitrary class to its CSS-selector form: bg-[#0e0e0e] -> .bg-\[\#0e0e0e\]
function escSel(cls) {
  return '.' + cls.replace(/[#[\].]/g, (c) => '\\' + c);
}

describe('light-theme override coverage (audit 2026-05-27)', () => {
  it('every DARK arbitrary bg/border hex used has a light override (or is sanctioned)', () => {
    const missing = [];
    for (const [cls, hex] of used) {
      if (SANCTIONED.has(hex)) continue;
      if (lum(hex) > 0.18) continue; // only police genuinely dark surfaces
      // index.css source only contains these escaped selectors inside light overrides
      // (Tailwind emits the base utility separately at build time), so presence = covered.
      if (!css.includes(escSel(cls))) missing.push(`${cls} (${hex})`);
    }
    expect(missing, `uncovered dark arbitrary classes (add a [data-theme=light] remap in index.css):\n${missing.join('\n')}`).toEqual([]);
  });

  it('FM-C: previously-uncovered colour text shades are AA-darkened in light', () => {
    for (const c of ['emerald', 'sky', 'rose', 'amber']) {
      expect(css).toMatch(new RegExp(`\\[data-theme="light"\\] \\.text-${c}-400`));
    }
    // alert-box light-pastel shades darkened
    for (const c of ['emerald', 'blue', 'amber']) {
      expect(css).toMatch(new RegExp(`\\[data-theme="light"\\] \\.text-${c}-200`));
    }
  });

  it('FM-A/alert-box: dark colour bg TINTS lightened in light (base-match rule present)', () => {
    // 2026-05-28 V124 v2: selectors now match the BASE utility with a leading
    // space ([class*=" bg-X/"]) instead of the bare substring ([class*="bg-X/"]),
    // so dark:/hover: variants don't trigger the remap (see the v2 guard below).
    expect(css).toMatch(/\[class\*=" bg-emerald-900\/"\]/);
    expect(css).toMatch(/\[class\*=" bg-blue-900\/"\]/);
    expect(css).toMatch(/\[class\*=" bg-red-900\/"\]/);
  });

  it('FM-D: theme-aware accent vars defined with AA-dark light values', () => {
    expect(css).toMatch(/--accent-blue:\s*#1d4ed8/);   // light value (AA on tint)
    expect(css).toMatch(/--accent-line:\s*#047857/);
    expect(css).toMatch(/--accent-purple:\s*#7c3aed/);
  });

  it('brand red darkened to red-700 (#b91c1c) for strict AA on tinted cards (2026-05-27 user decision)', () => {
    // .text-red-400 (brand red, 261 uses) + --accent-red(light, FM-D text var) = brand red as
    // text. red-600 (#dc2626) was 4.37:1 on tinted cards (sub-AA); user chose strict red-700.
    expect(css).toMatch(/\.text-red-400\s*\{\s*color:\s*#b91c1c\s*!important/);
    expect(css).not.toMatch(/\.text-red-400\s*\{\s*color:\s*#dc2626/);
    expect(css).toMatch(/--accent-red:\s*#b91c1c/); // light/auto value (dark keeps #ef4444)
  });
});

describe('light-theme + appointment realtime fixes (2026-05-28)', () => {
  it('bg-tint selectors match the BASE utility only (space/start-preceded) — not dark:/hover: variants', () => {
    // Bug: [class*="bg-amber-900/"] also matched the DARK-VARIANT class
    // `dark:bg-amber-900/30`, clobbering a solid `bg-amber-600 text-white` badge's
    // bg to amber-50 → white text invisible (~1.05:1).
    // v1 (:not) over-excluded elements with base + variant (e.g. stock buttons
    // `bg-orange-900/20 hover:bg-orange-900/40`) → regressed them. v2 fix matches
    // the BASE utility: [class*=" bg-X/"] (space) + [class^="bg-X/"] (start), so a
    // base tint fires regardless of variants, while dark:-ONLY badges stay solid.
    const spaceCount = (css.match(/\[class\*=" bg-[a-z]+-(?:700|800|900|950)\/"\]/g) || []).length;
    const startCount = (css.match(/\[class\^="bg-[a-z]+-(?:700|800|900|950)\/"\]/g) || []).length;
    expect(spaceCount).toBe(136); // 17 colors × 4 shades × 2 themes
    expect(startCount).toBe(136);
    // the over-broad :not form must be gone
    expect(css).not.toMatch(/:not\(\[class\*=":bg-[a-z]+-(?:700|800|900|950)\/"\]\)/);
    expect(css).toMatch(/\[class\*=" bg-amber-900\/"\], \[data-theme="light"\] \[class\^="bg-amber-900\/"\]/);
  });

  it('gray hierarchy de-inverted: gray-600 → --tx-muted, gray-700 → --tx-heading (were --tx-faint, sub-AA)', () => {
    expect(css).toMatch(/\.text-gray-600\s*\{\s*color:\s*var\(--tx-muted\)\s*!important/);
    expect(css).toMatch(/\.text-gray-700\s*\{\s*color:\s*var\(--tx-heading\)\s*!important/);
    // neither gray-600 nor gray-700 should map to the placeholder-faint token anymore
    expect(css).not.toMatch(/\.text-gray-600\s*\{\s*color:\s*var\(--tx-faint\)/);
    expect(css).not.toMatch(/\.text-gray-700\s*\{\s*color:\s*var\(--tx-faint\)/);
  });

  it('orange-500 text → orange-700 #c2410c (was #ea580c orange-600, 3.4:1 sub-AA)', () => {
    // assert the DECLARATION (not the comment, which mentions the old #ea580c)
    expect(css).toMatch(/\.text-orange-500\s*\{\s*color:\s*#c2410c/);
    expect(css).not.toMatch(/\.text-orange-500\s*\{\s*color:\s*#ea580c/);
  });

  it('-400 shade completed uniformly (FM-C coverage was uneven: blue/cyan/indigo/violet/etc had no -400 remap)', () => {
    for (const [c, hex] of [['blue', '#1d4ed8'], ['cyan', '#0e7490'], ['indigo', '#4338ca'], ['violet', '#6d28d9'], ['fuchsia', '#a21caf']]) {
      expect(css, `text-${c}-400 should be AA-dark`).toMatch(new RegExp(`\\.text-${c}-400[\\s\\S]{0,90}${hex}`));
    }
  });

  it('-600 colored TEXT shade → -700 (AA): finance status text (amber/teal/etc) was sub-AA', () => {
    for (const [c, hex] of [['amber', '#b45309'], ['teal', '#0f766e'], ['orange', '#c2410c'], ['green', '#15803d']]) {
      expect(css, `text-${c}-600 should be AA-dark`).toMatch(new RegExp(`\\.text-${c}-600[\\s\\S]{0,90}${hex}`));
    }
  });

  it('date-strip selected tab: bg-sky-700/600 descendant white-restore present (label+number are child divs)', () => {
    expect(css).toMatch(/\[class\*="bg-sky-700"\]\s+\.text-white/);
    expect(css).toMatch(/\[class\*="bg-sky-600"\]\s+\.text-white/);
  });

  it('AppointmentCalendarView month strip uses LIVE listener (real-time), not one-shot getter', () => {
    const c = readFileSync('src/components/backend/AppointmentCalendarView.jsx', 'utf8');
    expect(c).toMatch(/listenToAppointmentsByMonth/);            // imported + used
    // the month-count useEffect must subscribe (return unsub), not call the one-shot getter
    expect(c).not.toMatch(/getAppointmentsByMonth\s*\(/);        // no remaining call (only comment mentions)
    expect(c).toMatch(/setMonthAppts\(grouped\)/);              // groups flat listener output
    // selected-day label fixed off text-sky-200 (which matched the bg in light theme)
    expect(c).not.toMatch(/isSel \? 'text-sky-200'/);
  });
});
