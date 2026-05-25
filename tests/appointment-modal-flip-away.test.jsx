// tests/appointment-modal-flip-away.test.jsx
// Task E7 — flip-away confirm (edit: was deposit + linked → now non-deposit).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const SRC = fs.readFileSync('src/components/backend/AppointmentFormModal.jsx', 'utf8');

describe('flip-away confirm (edit: deposit→non-deposit with a linked deposit)', () => {
  it('has flipAway state/ref + dialog testid + 3 actions', () => {
    expect(SRC).toMatch(/flipAwayOpen/);
    expect(SRC).toMatch(/flipAwayDecisionRef/);
    expect(SRC).toMatch(/data-testid="appt-flipaway-confirm"/);
    expect(SRC).toMatch(/cancelDepositBookingPair\(/);
  });

  it('early-returns to open the dialog when flip-away detected with no decision', () => {
    expect(SRC).toMatch(/wasDeposit[\s\S]{0,160}!isDepositBooking[\s\S]{0,160}setFlipAwayOpen\(true\)/);
  });

  it('delete path surfaces the usedAmount-guard error', () => {
    expect(SRC).toMatch(/ถูกใช้[\s\S]{0,40}การเงิน/);
  });

  it('dialog buttons set a decision then re-invoke handleSave / abort', () => {
    expect(SRC).toMatch(/flipAwayDecisionRef\.current = 'delete'/);
    expect(SRC).toMatch(/flipAwayDecisionRef\.current = 'keep'/);
  });
});
