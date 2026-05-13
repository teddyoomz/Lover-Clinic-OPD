// tests/phase-26-2g-fillin-bis-source-grep.test.js
// Phase 26.2g-fillin-bis — source-grep regression locks for TFP canonical wiring.
// G4.1-G4.6 lock the post-bis shape; future drift fails build.
//
// NOTE: tests/phase-26-2g-fillin-source-grep.test.js G1 group also locks the
// same invariant (was updated in Task 2 review fixup). Both files intentionally
// co-exist — G1 covers the Phase 26.2g-fillin → bis transition (with anti-
// regression on the OLD derive* pattern); G4 is the canonical bis-named regression
// suite that future readers find via grep "phase-26-2g-fillin-bis".

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const TFP_PATH = 'src/components/TreatmentFormPage.jsx';
const tfp = readFileSync(TFP_PATH, 'utf8');

describe('G4 — TFP canonical resolver wiring', () => {
  it('G4.1 — TFP imports the 3 resolvePatient* helpers from patientHealthMapping.js', () => {
    expect(tfp).toMatch(/import\s*\{[^}]*resolvePatientCongenitalDisease[^}]*\}\s*from\s*['"][^'"]*patientHealthMapping(?:\.js)?['"]/);
    expect(tfp).toMatch(/import\s*\{[^}]*resolvePatientDrugAllergy[^}]*\}\s*from\s*['"][^'"]*patientHealthMapping(?:\.js)?['"]/);
    expect(tfp).toMatch(/import\s*\{[^}]*resolvePatientTreatmentHistory[^}]*\}\s*from\s*['"][^'"]*patientHealthMapping(?:\.js)?['"]/);
  });

  it('G4.2 — All 3 resolver calls inside the create-mode auto-fill block (!isEdit gate)', () => {
    // Anchor: locate bloodType setter in the auto-fill block
    const bloodTypeIdx = tfp.indexOf('setBloodType(patientData.bloodType)');
    expect(bloodTypeIdx).toBeGreaterThan(0);
    const region = tfp.slice(bloodTypeIdx, bloodTypeIdx + 2000);
    expect(region).toContain('resolvePatientCongenitalDisease(patientData)');
    expect(region).toContain('resolvePatientDrugAllergy(patientData)');
    expect(region).toContain('resolvePatientTreatmentHistory(patientData)');
    // The setters fire on the resolver outputs
    expect(region).toContain('setCongenitalDisease(');
    expect(region).toContain('setDrugAllergy(');
    expect(region).toContain('setTreatmentHistory(');
    // !isEdit gate present
    expect(region).toContain('if (!isEdit)');
  });

  it('G4.3 — anti-regression: NO patientData.allergiesDetail read remains (pre-bis no-op)', () => {
    // Pre-bis line `if (patientData.allergiesDetail && !isEdit) setDrugAllergy(patientData.allergiesDetail);`
    // is REMOVED — kiosk-shape allergiesDetail doesn't exist on be_customers.
    expect(tfp).not.toMatch(/patientData\.allergiesDetail/);
  });

  it('G4.4 — anti-regression: NO derivePatientCongenitalDisease call remains in TFP', () => {
    // Phase 26.2g-fillin derive call replaced by resolvePatientCongenitalDisease.
    // Function-call match only — comment-text references are OK.
    expect(tfp).not.toMatch(/derivePatientCongenitalDisease\s*\(/);
  });

  it('G4.5 — anti-regression: NO derivePatientTreatmentHistory call remains in TFP', () => {
    // Phase 26.2g-fillin derive call replaced by resolvePatientTreatmentHistory.
    expect(tfp).not.toMatch(/derivePatientTreatmentHistory\s*\(/);
  });

  it('G4.6 — Phase 26.2g-fillin-bis marker comment present (institutional memory)', () => {
    // Document the architectural correction in the source so future readers
    // grepping for "Phase 26.2g-fillin-bis" find the call site immediately.
    expect(tfp).toMatch(/Phase 26\.2g-fillin-bis/);
  });
});
