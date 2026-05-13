// tests/phase-26-2g-fillin-followup-source-grep.test.js
// Phase 26.2g-fillin-followup — source-grep regression locks for utils.js
// Rule-of-3 close.
// G3.1: utils.js imports both helpers
// G3.2: anti-regression — no inline ud_* → label push patterns remain
// G3.3: Thai builder consumes derivePatientCongenitalDisease
// G3.4: English builder consumes derivePatientCongenitalDiseaseEnglish

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const UTILS_PATH = 'src/utils.js';
const utils = readFileSync(UTILS_PATH, 'utf8');

describe('G3 — utils.js consumes patientHealthMapping helpers', () => {
  it('G3.1 — utils.js imports both helpers from ./lib/patientHealthMapping.js', () => {
    expect(utils).toMatch(/import\s*\{[^}]*derivePatientCongenitalDisease\b[^}]*\}\s*from\s*['"][^'"]*patientHealthMapping(?:\.js)?['"]/);
    expect(utils).toMatch(/import\s*\{[^}]*derivePatientCongenitalDiseaseEnglish[^}]*\}\s*from\s*['"][^'"]*patientHealthMapping(?:\.js)?['"]/);
  });

  it('G3.2 — anti-regression: no inline pmh.push label statements remain (Thai + EN)', () => {
    // Lock the refactor — these inline patterns MUST NOT reappear.
    // (Sentinel labels: first Thai label + first English label. If these are
    // gone, the rest of the inline block is too — refactor landed correctly.)
    expect(utils).not.toMatch(/pmh\.push\(['"]ความดันโลหิตสูง['"]\)/);
    expect(utils).not.toMatch(/pmh\.push\(['"]Hypertension['"]\)/);
    // Also lock the secondary distinguishing label per language (Diabetes vs
    // Diabetes Mellitus drift would be caught here; Kidney Disease vs Chronic
    // Kidney Disease likewise).
    expect(utils).not.toMatch(/pmh\.push\(['"]Diabetes Mellitus['"]\)/);
    expect(utils).not.toMatch(/pmh\.push\(['"]เบาหวาน['"]\)/);
  });

  it('G3.3 — Thai builder uses derivePatientCongenitalDisease near its push site', () => {
    // Window around the Thai PMH literal: 500 chars before, 300 chars after.
    // The derive call must appear within that window.
    const idx = utils.indexOf('ประวัติโรคประจำตัว');
    expect(idx).toBeGreaterThan(-1);
    const region = utils.slice(Math.max(0, idx - 500), idx + 300);
    expect(region).toMatch(/derivePatientCongenitalDisease\s*\(\s*d\s*\)/);
    // Thai builder MUST NOT use the English helper.
    expect(region).not.toMatch(/derivePatientCongenitalDiseaseEnglish/);
  });

  it('G3.4 — English builder uses derivePatientCongenitalDiseaseEnglish near its push site', () => {
    const idx = utils.indexOf('Past Medical History');
    expect(idx).toBeGreaterThan(-1);
    const region = utils.slice(Math.max(0, idx - 500), idx + 300);
    expect(region).toMatch(/derivePatientCongenitalDiseaseEnglish\s*\(\s*d\s*\)/);
  });
});
