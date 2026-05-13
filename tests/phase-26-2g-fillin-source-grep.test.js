// tests/phase-26-2g-fillin-source-grep.test.js
// Phase 26.2g-fillin — source-grep regression locks.
// G1: TFP wires the two helpers correctly inside the create-mode auto-fill block.
// G2: AV40 universal classifier — no other component reads patientData.ud_* directly.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const TFP_PATH = 'src/components/TreatmentFormPage.jsx';
const tfp = readFileSync(TFP_PATH, 'utf8');

// G1 group updated Phase 26.2g-fillin-bis (2026-05-13): TFP swapped from
// derivePatient* (Phase 26.2g-fillin — was a V21 architectural-error no-op
// reading kiosk-shape fields that don't exist on be_customers.patientData)
// → resolvePatient* (canonical reads). Tests now lock the post-bis pattern
// + include anti-regression guards on the removed pre-bis patterns
// (derivePatient* calls + patientData.allergiesDetail read).
describe('G1 — TFP wiring (Phase 26.2g-fillin-bis: resolve* canonical readers)', () => {
  it('G1.1 — TFP imports 3 resolvePatient* helpers from patientHealthMapping.js', () => {
    expect(tfp).toMatch(/import\s*\{[^}]*resolvePatientCongenitalDisease[^}]*\}\s*from\s*['"][^'"]*patientHealthMapping(?:\.js)?['"]/);
    expect(tfp).toMatch(/import\s*\{[^}]*resolvePatientDrugAllergy[^}]*\}\s*from\s*['"][^'"]*patientHealthMapping(?:\.js)?['"]/);
    expect(tfp).toMatch(/import\s*\{[^}]*resolvePatientTreatmentHistory[^}]*\}\s*from\s*['"][^'"]*patientHealthMapping(?:\.js)?['"]/);
    // Anti-regression: pre-bis derive* imports MUST NOT reappear in TFP
    // (they read kiosk-shape fields that don't exist on be_customers.patientData)
    expect(tfp).not.toMatch(/import\s*\{[^}]*derivePatientCongenitalDisease[^}]*\}\s*from\s*['"][^'"]*patientHealthMapping(?:\.js)?['"]/);
    expect(tfp).not.toMatch(/import\s*\{[^}]*derivePatientTreatmentHistory[^}]*\}\s*from\s*['"][^'"]*patientHealthMapping(?:\.js)?['"]/);
  });

  it('G1.2 — All 3 resolvers called inside the create-mode auto-fill block', () => {
    // The block: `if (patientData) { ... setBloodType ... if (!isEdit) { resolve*... } }`
    // Look for all 3 resolver calls within ~1500 chars of the bloodType setter.
    const bloodTypeIdx = tfp.indexOf('setBloodType(patientData.bloodType)');
    expect(bloodTypeIdx).toBeGreaterThan(0);
    const window = tfp.slice(bloodTypeIdx, bloodTypeIdx + 1500);
    expect(window).toContain('resolvePatientCongenitalDisease(patientData)');
    expect(window).toContain('resolvePatientDrugAllergy(patientData)');
    expect(window).toContain('resolvePatientTreatmentHistory(patientData)');
    expect(window).toContain('setCongenitalDisease(');
    expect(window).toContain('setDrugAllergy(');
    expect(window).toContain('setTreatmentHistory(');
    // Anti-regression: pre-bis derive* function calls MUST NOT reappear
    expect(window).not.toContain('derivePatientCongenitalDisease(patientData)');
    expect(window).not.toContain('derivePatientTreatmentHistory(patientData)');
    // Anti-regression: pre-Phase-26.2g-fillin no-op MUST NOT reappear
    // (patientData.allergiesDetail is kiosk-shape, doesn't exist on be_customers)
    expect(window).not.toContain('setDrugAllergy(patientData.allergiesDetail)');
  });

  it('G1.3 — All 3 resolver call-sites gated by !isEdit (no edit-mode auto-fill)', () => {
    // The 3 resolver calls live inside `if (!isEdit) { ... }` — verify by
    // grepping for that exact gate within the bloodType→resolver window.
    const bloodTypeIdx = tfp.indexOf('setBloodType(patientData.bloodType)');
    const window = tfp.slice(bloodTypeIdx, bloodTypeIdx + 1500);
    // The inner gate must appear before each resolver call
    const innerGateIdx = window.indexOf('if (!isEdit)');
    const congenitalCallIdx = window.indexOf('resolvePatientCongenitalDisease');
    const allergyCallIdx = window.indexOf('resolvePatientDrugAllergy');
    const historyCallIdx = window.indexOf('resolvePatientTreatmentHistory');
    expect(innerGateIdx).toBeGreaterThan(-1);
    expect(congenitalCallIdx).toBeGreaterThan(innerGateIdx);
    expect(allergyCallIdx).toBeGreaterThan(innerGateIdx);
    expect(historyCallIdx).toBeGreaterThan(innerGateIdx);
  });
});

describe('G2 — AV40 universal classifier (no direct patientData.ud_* reads outside sanctioned)', () => {
  // Walk src/components/** and src/pages/** for any file that reads
  // patientData.ud_* / patientData.hasUnderlying / patientData.currentMedication
  // / patientData.pregnancy.
  // Sanctioned exceptions: src/pages/PatientForm.jsx (writer); src/pages/AdminDashboard.jsx
  // (pregnancy + chronic display chips per spec § 8).

  const SANCTIONED = new Set([
    'src/pages/PatientForm.jsx',          // writer (kiosk + admin manual)
    'src/pages/AdminDashboard.jsx',       // display chips lines ~4504-4533
    // src/utils.js was previously sanctioned (lived outside walkFiles(src/components|src/pages))
    // but is no longer a direct reader — refactored Phase 26.2g-fillin-followup (2026-05-13)
    // to consume derivePatientCongenitalDisease + derivePatientCongenitalDiseaseEnglish helpers.
    // See tests/phase-26-2g-fillin-followup-source-grep.test.js G3 for the refactor lock.
  ]);
  // Phase 26.2g-fillin-bis (2026-05-13) — extended PATTERN to include canonical
  // be_customers.patientData fields. Direct reads of canonical fields in
  // src/components|src/pages are forbidden; consumers must use resolvePatient*
  // from src/lib/patientHealthMapping.js. bloodType NOT included — legitimate
  // canonical read at TFP:1018 + AdminDashboard chips (identity field).
  const PATTERN = /patientData\.(?:ud_|hasUnderlying|currentMedication|pregnancy|allergiesDetail|congenitalDisease|drugAllergy|foodAllergy|beforeTreatment|pregnanted)/;

  function* walkFiles(dir) {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name).replace(/\\/g, '/');
      const st = statSync(path);
      if (st.isDirectory()) yield* walkFiles(path);
      else if (st.isFile() && /\.(jsx?|tsx?)$/.test(name)) yield path;
    }
  }

  it('G2.1 — only sanctioned files read patientData.ud_* / hasUnderlying / currentMedication / pregnancy', () => {
    const offenders = [];
    for (const path of walkFiles('src/components')) {
      const content = readFileSync(path, 'utf8');
      if (PATTERN.test(content)) offenders.push(path);
    }
    for (const path of walkFiles('src/pages')) {
      const content = readFileSync(path, 'utf8');
      if (PATTERN.test(content) && !SANCTIONED.has(path)) offenders.push(path);
    }
    expect(offenders).toEqual([]);
  });
});
