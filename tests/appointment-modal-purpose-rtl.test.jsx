// tests/appointment-modal-purpose-rtl.test.jsx
// Task E3 — chip นัดมาเพื่อ picker wired into AppointmentFormModal (source-grep contract).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const SRC = fs.readFileSync('src/components/backend/AppointmentFormModal.jsx', 'utf8');

describe('AppointmentFormModal นัดมาเพื่อ picker wire', () => {
  it('imports + renders VisitPurposePicker (textarea removed)', () => {
    expect(SRC).toMatch(/import VisitPurposePicker from '\.\.\/VisitPurposePicker\.jsx'/);
    expect(SRC).toMatch(/<VisitPurposePicker\b/);
    // old free-text textarea must be gone
    expect(SRC).not.toMatch(/placeholder="botox, filler\.\.\."/);
  });

  it('picker is bound to formData.appointmentTo + required', () => {
    expect(SRC).toMatch(/value=\{formData\.appointmentTo\}[\s\S]{0,120}onChange=\{\(s\)\s*=>\s*update\(\{ appointmentTo: s \}\)\}/);
    // V-deposit-noappt (2026-05-27) — window widened from 160: the picker JSX
    // grew a `label={...}` line, pushing `required` further from the tag.
    expect(SRC).toMatch(/<VisitPurposePicker[\s\S]{0,300}required/);
  });

  it('validates นัดมาเพื่อ required (≥1) via scrollToFormError', () => {
    expect(SRC).toMatch(/formData\.appointmentTo[\s\S]{0,200}scrollToFormError\('appointmentTo'/);
  });
});
