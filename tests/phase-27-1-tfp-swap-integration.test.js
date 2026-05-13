// V27.1 Task 12 — TFP layout swap integration source-grep
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const SRC = readFileSync('src/components/TreatmentFormPage.jsx', 'utf-8');

describe('TFP1 — Phase 27.1 layout swap integration', () => {
  it('TFP1.1 imports useLayoutPreference', () => {
    expect(SRC).toMatch(/import.*useLayoutPreference.*from.*useLayoutPreference/);
  });

  it('TFP1.2 imports LayoutSwapButton', () => {
    expect(SRC).toMatch(/import.*LayoutSwapButton.*from/);
  });

  it('TFP1.3 calls useLayoutPreference("tfp", ...)', () => {
    expect(SRC).toMatch(/useLayoutPreference\(\s*['"]tfp['"]/);
  });

  it('TFP1.4 outer container applies lg:flex-row-reverse conditionally', () => {
    expect(SRC).toMatch(/lg:flex-row-reverse/);
  });

  it('TFP1.5 renders LayoutSwapButton', () => {
    expect(SRC).toMatch(/<LayoutSwapButton/);
  });

  it('TFP1.6 V27.1 marker comment present', () => {
    expect(SRC).toMatch(/Phase 27\.1.*[Ll]ayout/);
  });
});
