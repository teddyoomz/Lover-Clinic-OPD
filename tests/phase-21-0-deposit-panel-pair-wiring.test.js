// tests/phase-21-0-deposit-panel-pair-wiring.test.js
// Phase 21.0 — D1 — DepositPanel routes hasAppointment to pair helper

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync('src/components/backend/DepositPanel.jsx', 'utf8');

describe('Phase 21.0 — D1 DepositPanel pair-helper wiring', () => {
  test('D1.1 imports createDepositBookingPair + cancelDepositBookingPair', () => {
    expect(SRC).toMatch(/createDepositBookingPair/);
    expect(SRC).toMatch(/cancelDepositBookingPair/);
    expect(SRC).toMatch(/from\s+['"]\.\.\/\.\.\/lib\/appointmentDepositBatch\.js['"]/);
  });

  test('D1.2 handleSave routes hasAppointment=true to pair helper', () => {
    // Locate the handleSave commit branch.
    expect(SRC).toMatch(/else if \(hasAppointment\) \{[\s\S]{0,400}?createDepositBookingPair/);
  });

  test('D1.3 handleSave preserves createDeposit fallback for hasAppointment=false', () => {
    expect(SRC).toMatch(/else \{[\s\S]{0,200}?await createDeposit\(payload\)/);
  });

  test('D1.4 handleCancel pair-cancel when linkedAppointmentId set', () => {
    expect(SRC).toMatch(/if \(cancelModal\.linkedAppointmentId\)\s*\{[\s\S]{0,300}?cancelDepositBookingPair/);
  });

  test('D1.5 handleCancel falls back to cancelDeposit for legacy deposits', () => {
    expect(SRC).toMatch(/else\s*\{[\s\S]{0,300}?await cancelDeposit\(/);
  });

  test('D1.6 createDepositBookingPair receives depositData payload', () => {
    expect(SRC).toMatch(/createDepositBookingPair\(\s*\{\s*depositData:\s*payload/);
  });

  test('D1.7 V36 audit BS-1 — DepositPanel imports from scopedDataLayer for read/write helpers (createDeposit + cancelDeposit + listExamRooms)', () => {
    // Existing pattern unchanged — pair helper is a separate module, not via scopedDataLayer
    expect(SRC).toMatch(/from\s+['"]\.\.\/\.\.\/lib\/scopedDataLayer\.js['"]/);
  });

  test('D1.8 Phase 21.0 marker present', () => {
    expect(SRC).toMatch(/Phase 21\.0/);
  });
});
