// Light-theme audit (2026-05-27) — regression guard against future drift.
// Every DARK arbitrary bg/border/gradient hex class used in app code must have a
// [data-theme="light"] override in src/index.css (or be a sanctioned brand/accent
// colour). Catches the failure mode: a new component uses bg-[#0d0d0d] / a dark
// colour with no light remap → renders as a dark block on the light surface.
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import { aaAccent, LIGHT_AA_ACCENT } from '../src/lib/themeAccent.js';

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

  it('AA-bg: white-on-bg-{c}-600 darkened to {c}-700 in light (push white-on-color CTAs/badges to AA)', () => {
    for (const [c, hex] of [['amber', '#b45309'], ['emerald', '#047857'], ['sky', '#0369a1'], ['red', '#b91c1c'], ['green', '#15803d']]) {
      expect(css, `.bg-${c}-600.text-white should darken to ${c}-700`).toMatch(
        new RegExp(`\\.bg-${c}-600\\.text-white[\\s\\S]{0,120}background-color:\\s*${hex}`),
      );
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

// V125 (2026-05-28) — TreatmentFormPage accent headers/pills set color via INLINE
// style={{ color: '#xxx' }} (raw -500 hex from local SectionHeader/ActionBtn +
// ~12 inline spans), so V124's CLASS-based [data-theme=light] overrides could not
// reach them → they stayed raw -500 in light theme and failed AA (yellow-500
// 1.87:1, amber-500 2.08:1, cyan-500 2.43:1, ...). Fix = shared aaAccent(hex,isDark)
// that deepens to the -700 AA-dark family in light, pass-through in dark.
describe('V125 — theme-aware accent helper (light-theme AA for inline accents)', () => {
  const tfp = readFileSync('src/components/TreatmentFormPage.jsx', 'utf8');

  it('aaAccent: every mapped light-theme target is >= 4.5:1 on white (AA)', () => {
    const sub = [];
    for (const [src, target] of Object.entries(LIGHT_AA_ACCENT)) {
      const cr = 1.05 / (lum(target) + 0.05); // contrast vs white (lum = 1)
      if (cr < 4.5) sub.push(`#${src} → ${target} = ${cr.toFixed(2)}`);
    }
    expect(sub, `mapped targets below AA on white:\n${sub.join('\n')}`).toEqual([]);
  });

  it('aaAccent: deepens raw -500/-400 accent hex in LIGHT, passes through in DARK', () => {
    expect(aaAccent('#f59e0b', false)).toBe('#b45309'); // amber-500 → amber-700
    expect(aaAccent('#06b6d4', false)).toBe('#0e7490'); // cyan-500  → cyan-700
    expect(aaAccent('#eab308', false)).toBe('#a16207'); // yellow-500 → yellow-700
    expect(aaAccent('#14b8a6', false)).toBe('#0f766e'); // teal-500  → teal-700
    expect(aaAccent('#EF4444', false)).toBe('#b91c1c'); // case-insensitive
    // dark theme = unchanged (vibrant -500 is already AA on a dark surface — V124 "dark untouched")
    expect(aaAccent('#f59e0b', true)).toBe('#f59e0b');
    expect(aaAccent('#06b6d4', true)).toBe('#06b6d4');
  });

  it('aaAccent: unknown / empty / non-string input passes through (safe)', () => {
    expect(aaAccent('#123456', false)).toBe('#123456'); // unknown hex unchanged
    expect(aaAccent('', false)).toBe('');
    expect(aaAccent(null, false)).toBe(null);
    expect(aaAccent(undefined, false)).toBe(undefined);
  });

  it('TreatmentFormPage: SectionHeader + ActionBtn deepen accent via aaAccent', () => {
    // TFP extraction step 1 (2026-07-07): SectionHeader + ActionBtn moved verbatim
    // to TfpFormPrimitives.jsx — the V125 aaAccent contract holds at their new home.
    const primitives = readFileSync('src/components/treatment-form/TfpFormPrimitives.jsx', 'utf8');
    expect(tfp).toMatch(/import \{ aaAccent \} from '\.\.\/lib\/themeAccent\.js'/); // 12+ inline spans still in TFP
    expect(primitives).toMatch(/import \{ aaAccent \} from '\.\.\/\.\.\/lib\/themeAccent\.js'/);
    expect(primitives).toMatch(/const a = aaAccent\(accent, isDark\)/); // SectionHeader icon + h4
    expect(primitives).toMatch(/const c = aaAccent\(color, isDark\)/);  // ActionBtn color/border/bg
  });

  it('TreatmentFormPage: NO raw inline accent style remains — all inline colors are theme-aware', () => {
    // TFP extraction steps 1+2 (2026-07-07): the V125 contract now spans the
    // TFP FAMILY (TreatmentFormPage + treatment-form/*.jsx) — the extracted
    // files must obey the same no-raw-inline-accent rule, and the ≥12
    // converted-callsite count is a property of the rendered form, so it
    // counts across the union.
    const family = tfp
      + readFileSync('src/components/treatment-form/TfpFormPrimitives.jsx', 'utf8')
      + readFileSync('src/components/treatment-form/TfpItemModals.jsx', 'utf8')
      // TFP extraction step 3 (2026-07-19): the buy modal (1 aaAccent header) joined the family
      + readFileSync('src/components/treatment-form/TfpBuyModal.jsx', 'utf8');
    expect(family).not.toMatch(/style=\{\{ color: '#[0-9a-fA-F]{6}'/); // regression guard (all homes)
    const wraps = (family.match(/aaAccent\('#[0-9a-fA-F]{6}', isDark\)/g) || []).length;
    expect(wraps).toBeGreaterThanOrEqual(12); // the 12 inline callsites we converted
  });

  it('class#2: violet save-button (bg-[#7c3aed] text-white) restored to white in light (was dark 3.05:1)', () => {
    // the button keeps its arbitrary-hex violet bg with text-white on one line
    expect(tfp).toMatch(/text-white[^\n]*bg-\[#7c3aed\]/);
    // index.css restores white for that arbitrary-hex bg (base .text-white→dark darkened it to 3.05:1)
    expect(css.includes('.bg-\\[\\#7c3aed\\].text-white')).toBe(true);
    // ...and the teal sibling bg-[#2EC4B6] is intentionally NOT white-restored (dark text @7.76 is AA)
    expect(css.includes('.bg-\\[\\#2EC4B6\\].text-white')).toBe(false);
  });

  it('TreatmentTimeline: hardcoded inline accents (green-500/teal-500) routed through aaAccent', () => {
    const tl = readFileSync('src/components/TreatmentTimeline.jsx', 'utf8');
    expect(tl).toMatch(/import \{ aaAccent \} from '\.\.\/lib\/themeAccent\.js'/);
    // the 2 hardcoded inline -500 accents now go through aaAccent (theme-aware)
    expect(tl).toMatch(/aaAccent\('#22c55e', isDark\)/);
    expect(tl).toMatch(/aaAccent\('#14b8a6', isDark\)/);
    // no raw hardcoded inline -500 color literal remains (the theme-aware `accent` var #7c3aed is fine)
    expect(tl).not.toMatch(/color: '#22c55e'/);
    expect(tl).not.toMatch(/color: '#14b8a6'/);
  });
});

// V126 (2026-05-28 EOD+1 follow-up) — PatientForm light-theme AA (B-i Selective).
// V124 already deepens every Tailwind text-{c} CLASS; the customer-facing intake form
// ALSO set ~10 accents via INLINE style={{color:'#hex'}} that no class could reach (the
// V125 class-of-bug, never wired into PatientForm) + a dynamic clinic accent `ac` with
// no AA guard. Fix = aaAccent for the inline/dynamic accents + a shared .pf-req asterisk
// class (rose-600 light / ember-red dark). Per Q1=B / Q2=B-i / Q3=Selective: rose-harmonize
// the BROKEN sites; KEEP orange-emergency / blue-custom / red-critical semantic zones
// (already AA via V124); decorative pinks/gradients + LINE-green button UNTOUCHED.
describe('V126 — PatientForm light-theme AA (B-i Selective)', () => {
  const pf = readFileSync('src/pages/PatientForm.jsx', 'utf8');
  const contrastWhite = (hex) => 1.05 / (lum(hex) + 0.05);
  const contrastDark = (hex) => (lum(hex) + 0.05) / (lum('#0a0a0a') + 0.05);

  it('PF-1: section-header orange (emergency + HRT) routes through aaAccent', () => {
    expect((pf.match(/aaAccent\('#f97316', isDark\)/g) || []).length).toBeGreaterThanOrEqual(4);
    // accentO definition keeps #f97316 in the DARK branch only (decorative gradient — AA on dark)
    expect(pf).toMatch(/const accentO = isDark \? '#f97316' : '#ea580c'/);
  });

  it('PF-2: HeartPulse medical icon routes through aaAccent', () => {
    expect(pf).toMatch(/<HeartPulse[^>]*aaAccent\('#ef4444', isDark\)/);
  });

  it('PF-3: light-branch literals use AA-dark, rose-harmonized values', () => {
    expect(pf).toMatch(/isDark \? '#ef4444' : '#be185d'/);  // back-button → pink-700
    expect(pf).toMatch(/isDark \? '#4b5563' : '#64748b'/);  // cancel → slate-500
    expect(pf).toMatch(/isLightHero \? '#1d4ed8'/);         // caption → blue-700 (blue zone kept)
    expect(pf).toMatch(/isDark \? accentO : '#c2410c'/);    // success greeting → orange-700
    expect(pf).toMatch(/isDark \? '#555' : '#6b7280'/);     // state-screen icons → gray-500
  });

  it('PF-4: no LIGHT-branch raw sub-AA accent remains (pink-500/blue-500/gray-400/aaa)', () => {
    expect(pf).not.toMatch(/: '#ec4899' \}/);            // back-btn light pink-500 gone
    expect(pf).not.toMatch(/isLightHero \? '#3b82f6'/);  // caption light blue-500 gone
    expect(pf).not.toMatch(/: '#94a3b8'/);               // cancel light gray-400 gone
    expect(pf).not.toMatch(/: '#aaa'/);                  // state-icon light gray gone
  });

  it('PF-5: acLight defined + wired to dynamic-accent sites', () => {
    expect(pf).toMatch(/const acLight = aaAccent\(ac, isDark\)/);
    expect((pf.match(/acLight/g) || []).length).toBeGreaterThanOrEqual(5);
  });

  it('PF-6: asterisks unified to .pf-req (no span text-red-600/#ef4444 asterisk remains)', () => {
    expect(pf).not.toMatch(/<span className="text-red-600">\*/);
    expect(pf).not.toMatch(/<span style=\{\{color:\s*'#ef4444'[^}]*\}\}>\*/);
    expect((pf.match(/className="pf-req">\*/g) || []).length).toBeGreaterThanOrEqual(20);
  });

  it('PF-7: every PatientForm light accent target >= 4.5:1 on white (AA)', () => {
    const sub = [];
    for (const hex of ['#c2410c', '#b91c1c', '#be185d', '#1d4ed8', '#e11d48', '#64748b']) {
      const cr = contrastWhite(hex);
      if (cr < 4.5) sub.push(`${hex} = ${cr.toFixed(2)}`);
    }
    expect(sub, `sub-AA on white:\n${sub.join('\n')}`).toEqual([]);
  });

  it('PF-8: .pf-req rose-600 AA on white + ember-red visible on dark', () => {
    expect(contrastWhite('#e11d48')).toBeGreaterThanOrEqual(4.5); // light asterisk rose-600
    expect(contrastDark('#ef4444')).toBeGreaterThanOrEqual(4.5);  // dark asterisk ember-red on #0a0a0a
  });

  it('PF-9: .pf-req class defined (ember-red base, rose-600 light)', () => {
    expect(css).toMatch(/\.pf-req\s*\{\s*color:\s*#ef4444/);
    expect(css).toMatch(/\[data-theme="light"\]\s*\.pf-req\s*\{\s*color:\s*#e11d48/);
  });

  it('PF-10: LINE-green button (#06C755) kept as brand exception (sanctioned, white-on-green)', () => {
    expect(pf).toMatch(/backgroundColor: '#06C755'/);
  });
});
