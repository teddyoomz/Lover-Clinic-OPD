// tests/av130-appointment-deposit-purpose.test.js
// Task E8 — AV130 audit invariants for the appointment deposit gate + single-source visit purpose.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const MODAL = fs.readFileSync('src/components/backend/AppointmentFormModal.jsx', 'utf8');
const SKILL = fs.readFileSync('.agents/skills/audit-anti-vibe-code/SKILL.md', 'utf8');

describe('AV130 — appointment deposit gate + single-source visit purpose', () => {
  it('AV130 is documented in the audit skill', () => {
    expect(SKILL).toMatch(/AV130/);
  });

  it('(a) deposit gate uses showDepositSection (no isLockedDepositType-only render gate)', () => {
    expect(MODAL).not.toMatch(/\{isLockedDepositType && mode === 'create' && \(/);
    expect(MODAL).toMatch(/\{showDepositSection && \(/);
  });

  it('(b) NO inline visitReason array in src (single source)', () => {
    for (const f of [
      'src/pages/PatientForm.jsx',
      'src/pages/AdminDashboard.jsx',
      'src/components/VisitPurposePicker.jsx',
    ]) {
      const s = fs.readFileSync(f, 'utf8');
      expect(s).not.toMatch(/\['สมรรถภาพทางเพศ','โรคระบบทางเดินปัสสาวะ'/);
    }
  });

  it('(c) modal mutates a deposit ONLY via sanctioned helpers (no raw deleteDoc on deposit)', () => {
    expect(MODAL).not.toMatch(/deleteDoc\(\s*depositDoc/);
    // sanctioned: createDepositBookingPair / createDepositForExistingAppointment / updateDeposit / cancelDepositBookingPair
    expect(MODAL).toMatch(/cancelDepositBookingPair|updateDeposit|createDepositForExistingAppointment/);
  });
});
