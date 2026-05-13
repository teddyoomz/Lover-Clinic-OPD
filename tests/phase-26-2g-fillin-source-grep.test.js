// tests/phase-26-2g-fillin-source-grep.test.js
// Phase 26.2g-fillin — source-grep regression locks.
// G1: TFP wires the two helpers correctly inside the create-mode auto-fill block.
// G2: AV40 universal classifier — no other component reads patientData.ud_* directly.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const TFP_PATH = 'src/components/TreatmentFormPage.jsx';
const tfp = readFileSync(TFP_PATH, 'utf8');

describe('G1 — TFP wiring', () => {
  it('G1.1 — TFP imports both helpers from patientHealthMapping.js', () => {
    expect(tfp).toMatch(/import\s*\{[^}]*derivePatientCongenitalDisease[^}]*\}\s*from\s*['"][^'"]*patientHealthMapping(?:\.js)?['"]/);
    expect(tfp).toMatch(/import\s*\{[^}]*derivePatientTreatmentHistory[^}]*\}\s*from\s*['"][^'"]*patientHealthMapping(?:\.js)?['"]/);
  });

  it('G1.2 — Both helpers called inside the create-mode auto-fill block', () => {
    // The block: `if (patientData) { ... setBloodType ... setDrugAllergy ... derive... }`
    // Look for both derive calls within ~1500 chars of the bloodType setter (same block).
    const bloodTypeIdx = tfp.indexOf('setBloodType(patientData.bloodType)');
    expect(bloodTypeIdx).toBeGreaterThan(0);
    const window = tfp.slice(bloodTypeIdx, bloodTypeIdx + 1500);
    expect(window).toContain('derivePatientCongenitalDisease(patientData)');
    expect(window).toContain('derivePatientTreatmentHistory(patientData)');
    expect(window).toContain('setCongenitalDisease(');
    expect(window).toContain('setTreatmentHistory(');
  });

  it('G1.3 — Both call-sites gated by !isEdit (no edit-mode auto-fill)', () => {
    // The new derive calls live inside `if (!isEdit) { ... }` — verify by
    // grepping for that exact gate within the bloodType→derive window.
    const bloodTypeIdx = tfp.indexOf('setBloodType(patientData.bloodType)');
    const window = tfp.slice(bloodTypeIdx, bloodTypeIdx + 1500);
    // The inner gate must appear before the derive calls
    const innerGateIdx = window.indexOf('if (!isEdit)');
    const congenitalCallIdx = window.indexOf('derivePatientCongenitalDisease');
    const historyCallIdx = window.indexOf('derivePatientTreatmentHistory');
    expect(innerGateIdx).toBeGreaterThan(-1);
    expect(congenitalCallIdx).toBeGreaterThan(innerGateIdx);
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
    // src/utils.js sanctioned separately (lives outside walkFiles(src/components|src/pages))
  ]);
  const PATTERN = /patientData\.(?:ud_|hasUnderlying|currentMedication|pregnancy)/;

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
