// tests/phase-26-2g-fillin-bis-followup-kiosk-canonical-source-grep.test.js
// Phase 26.2g-fillin-bis-followup — Rule of 3 close for kioskPatientToCanonical.
//
// G5.1: kioskPatientToCanonical.js imports derivePatientCongenitalDisease
// G5.2: anti-regression — no inline ud_* push pattern remains
// G5.3: helper called once + assigned to underlyingStr (preserves canonical contract)

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const KIOSK_PATH = 'src/lib/kioskPatientToCanonical.js';
const kiosk = readFileSync(KIOSK_PATH, 'utf8');

describe('G5 — kioskPatientToCanonical consumes derivePatientCongenitalDisease (Rule of 3 close)', () => {
  it('G5.1 — imports derivePatientCongenitalDisease from ./patientHealthMapping.js', () => {
    expect(kiosk).toMatch(/import\s*\{[^}]*derivePatientCongenitalDisease[^}]*\}\s*from\s*['"][^'"]*patientHealthMapping(?:\.js)?['"]/);
  });

  it('G5.2 — anti-regression: NO inline pmh.push label statements remain', () => {
    // The 7 inline pushes (ud_hypertension/diabetes/lung/kidney/heart/blood + ud_other) are removed.
    // Sentinel labels: first 2 + ud_otherDetail. If these are gone, the inline block is too.
    expect(kiosk).not.toMatch(/pmh\.push\(['"]ความดันโลหิตสูง['"]\)/);
    expect(kiosk).not.toMatch(/pmh\.push\(['"]เบาหวาน['"]\)/);
    expect(kiosk).not.toMatch(/pmh\.push\(d\.ud_otherDetail\)/);
  });

  it('G5.3 — derivePatientCongenitalDisease called once + result assigned to underlyingStr', () => {
    expect(kiosk).toMatch(/const\s+underlyingStr\s*=\s*derivePatientCongenitalDisease\s*\(\s*d\s*\)/);
    // Anti-regression: no double-call or alternate helper usage
    const matches = kiosk.match(/derivePatientCongenitalDisease\s*\(/g) || [];
    expect(matches.length).toBe(1);
  });

  it('G5.4 — Phase 26.2g-fillin-bis-followup marker comment present (institutional memory)', () => {
    expect(kiosk).toMatch(/Phase 26\.2g-fillin-bis-followup/);
  });
});
