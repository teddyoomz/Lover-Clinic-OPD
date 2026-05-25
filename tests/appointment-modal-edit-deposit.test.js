// tests/appointment-modal-edit-deposit.test.js
// Task E6 — edit-mode deposit hydration (open) + reconcile (update / flip-to-create).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const SRC = fs.readFileSync('src/components/backend/AppointmentFormModal.jsx', 'utf8');

describe('edit-mode deposit hydrate + reconcile', () => {
  it('imports getDeposit + updateDeposit (from scopedDataLayer)', () => {
    expect(SRC).toMatch(/getDeposit,\s*updateDeposit|getDeposit[\s\S]{0,40}updateDeposit/);
  });

  it('hydrates deposit fields from the linked deposit on edit-open', () => {
    expect(SRC).toMatch(/getDeposit\(linkedDepositId\)/);
    expect(SRC).toMatch(/depositAmount:\s*dep\.amount/);
    expect(SRC).toMatch(/depositPaymentChannel:\s*dep\.paymentChannel/);
  });

  it('edit save: updateDeposit when linked, createDepositForExistingAppointment when not', () => {
    expect(SRC).toMatch(/updateDeposit\(linkedDepositIdEdit/);
    expect(SRC).toMatch(/createDepositForExistingAppointment\(/);
  });

  it('deposit-field validation gated on showDepositSection (covers edit too)', () => {
    expect(SRC).toMatch(/if \(showDepositSection\) \{[\s\S]{0,80}parseFloat\(formData\.depositAmount\)/);
  });
});
