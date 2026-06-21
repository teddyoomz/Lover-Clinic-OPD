// Review CTA + circum/nocircum popup + new defaults + thinner dashed (owner 2026-06-21).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const page = read('src/pages/FillerSimulator.jsx');
const strings = read('src/lib/fillerStrings.js');
const g2d = read('src/components/FillerGraphic2D.jsx');

describe('filler review CTA + popup', () => {
  it('REVIEW_URLS has both exact circum/nocircum URLs', () => {
    expect(page).toMatch(/circum: 'https:\/\/loverclinic\.com\/review-enhance-circum\/'/);
    expect(page).toMatch(/nocircum: 'https:\/\/loverclinic\.com\/review-enhance-nocircum\/'/);
  });
  it('reviewOpen state + useEffect IS imported (no import-less hook — V80)', () => {
    expect(page).toMatch(/const \[reviewOpen, setReviewOpen\] = useState\(false\)/);
    expect(page).toMatch(/import \{ useMemo, useState, useEffect/);
  });
  it('CTA opens the popup + on-theme fire gradient + i18n copy', () => {
    expect(page).toMatch(/onClick=\{\(\) => setReviewOpen\(true\)\}/);
    expect(page).toMatch(/t\('reviewBtn'\)/);
    expect(page).toMatch(/t\('reviewBtnSub'\)/);
    expect(page).toMatch(/linear-gradient\(90deg, \$\{c\.fire2\}, \$\{c\.amber\}\)/);
  });
  it('CTA sits BEFORE the results box (owner 2026-06-21)', () => {
    const resIdx = page.indexOf("t('resultsHeader')");
    const ctaIdx = page.indexOf('setReviewOpen(true)');
    expect(ctaIdx).toBeGreaterThan(0);
    expect(ctaIdx).toBeLessThan(resIdx);  // CTA rendered ABOVE the results box
  });
  it('popup opens each URL in a NEW tab (noopener,noreferrer), has the 📸 icon, and closes 3 ways', () => {
    expect(page).toMatch(/window\.open\(REVIEW_URLS\[o\.k\], '_blank', 'noopener,noreferrer'\)/);
    expect(page).toMatch(/t\('reviewTitle'\)/);
    expect(page).toMatch(/t\('reviewCircum'\)/);
    expect(page).toMatch(/t\('reviewNocircum'\)/);
    expect(page).toContain('📸');
    expect((page.match(/setReviewOpen\(false\)/g) || []).length).toBeGreaterThanOrEqual(3); // X + backdrop + choice + ESC
    expect(page).toMatch(/e\.key === 'Escape'/);
  });
  it('strings: 6 review keys present in BOTH th and en', () => {
    for (const k of ['reviewBtn', 'reviewBtnSub', 'reviewTitle', 'reviewSub', 'reviewCircum', 'reviewNocircum']) {
      expect((strings.match(new RegExp(`${k}:`, 'g')) || []).length).toBeGreaterThanOrEqual(2);
    }
    expect(strings).toMatch(/reviewCircum: 'แบบขลิบ'/);
    expect(strings).toMatch(/reviewCircum: 'Circumcised'/);
  });
});

describe('filler defaults + thinner dashed', () => {
  it('defaults: length 5in (12.7cm) + filler 10cc', () => {
    expect(page).toMatch(/const \[lengthCm, setLengthCm\] = useState\(12\.7\)/);
    expect(page).toMatch(/const \[totalCc, setTotalCc\] = useState\(10\)/);
  });
  it('red dashed "after" outline is theme-tuned (afterStrokeW), no 1.7 remains', () => {
    expect((g2d.match(/stroke="#ef4444" strokeWidth=\{afterStrokeW\} strokeDasharray="7 4"/g) || []).length).toBe(2);
    expect(g2d).not.toMatch(/stroke="#ef4444" strokeWidth="1\.7"/);
  });
});
