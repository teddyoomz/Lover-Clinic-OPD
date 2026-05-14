import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

describe('LR-4b — auto-tick + notifyChannel in 5 appointment modals', () => {
  // NOTE: AppointmentTab.jsx was renamed to AppointmentCalendarView.jsx in
  // Phase 21.0. Plan text references the old name; we use the new name here.
  const SITES = [
    'src/components/backend/AppointmentFormModal.jsx',
    'src/components/backend/DepositPanel.jsx',
    'src/components/backend/AppointmentCalendarView.jsx',
    'src/pages/AdminDashboard.jsx',
    'src/components/TreatmentFormPage.jsx',
  ];

  for (const site of SITES) {
    it(`LR4b.${site.split('/').pop()} — imports LineNotifyConfirmation + notifyChannel state`, () => {
      const text = fs.readFileSync(path.join(ROOT, site), 'utf8');
      expect(text, `${site} must import LineNotifyConfirmation`).toMatch(/import\s+\{[^}]*LineNotifyConfirmation[^}]*\}/);
      expect(text, `${site} must set notifyChannel state`).toMatch(/notifyChannel|notifyChannels/);
    });
  }

  it('LR4b.backendClient writes notifyChannel on createAppointment', () => {
    const text = fs.readFileSync(path.join(ROOT, 'src/lib/backendClient.js'), 'utf8');
    expect(text).toMatch(/createBackendAppointment[\s\S]{0,5000}notifyChannel/);
  });
});
