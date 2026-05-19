/**
 * V107 (2026-05-19 LATE+3 NIGHT+5) — Light theme text-visibility regression.
 *
 * User report (verbatim, 22:21 BKK iPhone screenshots):
 *   "Light theme มีปัญหาเรื่อง Clearly Visible มากๆ ภาพแรก ปุ่มสร้าง QR code
 *    สีขาวล้วนไปเลย และปัญหาที่ 2 ซีเรียสมาก คือตัวพิมพ์ใน modal มันมี
 *    สีตัวอักษรสีขาว แล้วใครมันจะไปมองเห็นวะ ... ห้ามปล่อยไว้แม้แต่ที่เดียว"
 *
 * Root cause: TOO-BROAD exception rule at src/index.css line 548 (before fix):
 *
 *   [data-theme="light"] [class*="bg-[var"].text-white { color: #ffffff !important; }
 *
 * The pattern `[class*="bg-[var"]` matched ANY class containing "bg-[var"
 * substring — including modal inputs styled `bg-[var(--bg-card)] text-white`
 * (108 occurrences across src/). Result: in light mode, inputs forced
 * white-on-light = invisible. The rule was originally intended to keep CTA
 * buttons styled `bg-[var(--accent)] text-white` visible, but matched far
 * too broadly.
 *
 * Plus secondary issues:
 *   - Tailwind named-color exception list (line 408-427) MISSED emerald,
 *     amber, rose, violet, fuchsia, sky, lime → CTA buttons using those
 *     colors silently went dark in light mode
 *   - White-bg buttons (`bg-white`) blended into light card surfaces with
 *     no border → "ปุ่มสร้าง QR code สีขาวล้วน" (image 1)
 *   - Input + textarea + select had Tailwind preflight `color: inherit`
 *     interacting with text-white in ways that allowed white-on-white
 *
 * Fix (4-part):
 *   A. NARROW the `[class*="bg-[var"]` exception to ONLY
 *      `[class*="bg-[var(--accent"]` + `--ember` + `--fire` + `--brand`
 *      (canonical accent var names). Modal inputs using
 *      `bg-[var(--bg-card)]` no longer match the exception.
 *   B. EXTEND the named-color exception list with 7 missing palettes:
 *      emerald, amber, rose, violet, fuchsia, sky, lime.
 *   C. NEW UNIVERSAL safety net for form elements:
 *      input/textarea/select → `color: var(--tx-heading) !important`
 *      placeholder → muted-dark
 *      select option → dark text on bg-card
 *      bg-white button without border → 1px border var(--bd)
 *   D. NEW arbitrary `text-[#fff]` / `text-[#ffffff]` etc. overrides for
 *      components using Tailwind arbitrary syntax.
 *
 * Verification: preview_eval against running dev server reports 24/24 PASS:
 *   - modal input/textarea/select: rgb(15, 23, 42) ✓ dark
 *   - 17 Tailwind named-color CTAs + var-accent CTAs + gradient menu: white ✓
 *   - plain div/span/button.text-white (no bg): dark ✓
 *   - bg-white button: border applied ✓
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const CSS_SRC = readFileSync('src/index.css', 'utf8');

describe('V107.SG — source-grep lockdown for light-theme text visibility', () => {
  it('SG1: narrowed accent-var exception (no broad `bg-[var" match)', () => {
    // The old TOO-BROAD pattern must NOT exist
    expect(CSS_SRC).not.toMatch(/\[class\*="bg-\[var"\]\.text-white\s*\{[^}]*color:\s*#fff/);
    // The narrowed canonical accent patterns must exist
    expect(CSS_SRC).toMatch(/\[class\*="bg-\[var\(--accent"\]\.text-white/);
    expect(CSS_SRC).toMatch(/\[class\*="bg-\[var\(--ember"\]\.text-white/);
    expect(CSS_SRC).toMatch(/\[class\*="bg-\[var\(--fire"\]\.text-white/);
    expect(CSS_SRC).toMatch(/\[class\*="bg-\[var\(--brand"\]\.text-white/);
  });

  it('SG2: Tailwind named-color exception list extended to 17 palettes', () => {
    // Pre-V107 (had 10): red, blue, green, orange, pink, purple, cyan, indigo, teal, yellow
    // Post-V107 (17): + emerald, amber, rose, violet, fuchsia, sky, lime
    const PALETTES = ['red', 'blue', 'green', 'orange', 'pink', 'purple', 'cyan', 'indigo', 'teal', 'yellow',
                      'emerald', 'amber', 'rose', 'violet', 'fuchsia', 'sky', 'lime'];
    for (const c of PALETTES) {
      const re = new RegExp(`\\[class\\*="bg-${c}-"\\]\\.text-white`);
      expect(CSS_SRC, `missing palette exception: ${c}`).toMatch(re);
    }
  });

  it('SG3: universal form-element color rule for light mode', () => {
    expect(CSS_SRC).toMatch(/\[data-theme="light"\] input:not\(\[type="checkbox"\]\)/);
    expect(CSS_SRC).toMatch(/\[data-theme="light"\] textarea:not\(\[data-light-text-white\]\)/);
    expect(CSS_SRC).toMatch(/\[data-theme="light"\] select:not\(\[data-light-text-white\]\)/);
    expect(CSS_SRC).toMatch(/-webkit-text-fill-color:\s*var\(--tx-heading\)\s*!important/);
  });

  it('SG4: placeholder visible in light mode', () => {
    expect(CSS_SRC).toMatch(/\[data-theme="light"\] input::placeholder/);
    expect(CSS_SRC).toMatch(/\[data-theme="light"\] textarea::placeholder/);
  });

  it('SG5: bg-white button gets border in light mode', () => {
    expect(CSS_SRC).toMatch(/\[data-theme="light"\] button\.bg-white:not\(\[class\*="border-"\]\)/);
    expect(CSS_SRC).toMatch(/\[data-theme="light"\] a\.bg-white:not\(\[class\*="border-"\]\)/);
  });

  it('SG6: arbitrary text-[#fff] variants overridden in light mode', () => {
    expect(CSS_SRC).toMatch(/\.text-\\\[\\#fff\\\]/);
    expect(CSS_SRC).toMatch(/\.text-\\\[\\#ffffff\\\]/);
    expect(CSS_SRC).toMatch(/\.text-\\\[white\\\]/);
  });

  it('SG7: REMOVED redundant V107 catch-all button rule (too-high specificity)', () => {
    // The first-attempt fix had a button.text-white:not(...) catch-all with
    // 16 :not() exclusions → specificity ~19, beat the narrowed accent rule
    // → CTA buttons lost white. Removed in favor of base-line-405 + accent
    // exception. Test catches re-introduction.
    expect(CSS_SRC).not.toMatch(/button\.text-white:not\(\[class\*="bg-red-"\]\)[^,]*:not\(\[class\*="bg-blue-"\]\)/);
  });

  it('SG8: V107 marker comment present', () => {
    expect(CSS_SRC).toMatch(/V107 \(2026-05-19/);
  });
});
