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

  it('FM-A/alert-box: dark colour bg TINTS lightened in light (substring rule present)', () => {
    expect(css).toMatch(/\[class\*="bg-emerald-900\/"\]/);
    expect(css).toMatch(/\[class\*="bg-blue-900\/"\]/);
    expect(css).toMatch(/\[class\*="bg-red-900\/"\]/);
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
