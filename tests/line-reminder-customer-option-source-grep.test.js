import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

describe('LR-4 — CustomerOption usage in 6 appointment-creating callsites', () => {
  // Phase 21.0 (2026-05-06) — AppointmentTab.jsx was renamed to
  // AppointmentCalendarView.jsx. Task 9 plan referenced the legacy name; the
  // canonical file is AppointmentCalendarView (verified via
  // src/pages/BackendDashboard.jsx:38 import).
  const REQUIRED_SITES = [
    'src/components/backend/AppointmentFormModal.jsx',
    'src/components/backend/DepositPanel.jsx',
    'src/components/backend/AppointmentCalendarView.jsx',
    'src/pages/AdminDashboard.jsx',
    'src/components/backend/CustomerDetailView.jsx',
    'src/components/TreatmentFormPage.jsx',
  ];

  for (const site of REQUIRED_SITES) {
    it(`LR4.${site.split('/').pop()} — imports CustomerOption + uses contextBranchId`, () => {
      const text = fs.readFileSync(path.join(ROOT, site), 'utf8');
      expect(text, `${site} must import CustomerOption`).toMatch(/import\s+\{[^}]*CustomerOption[^}]*\}/);
      // 600-char window accommodates multi-line indented JSX with
      // explicit customer={{...}} shape (AppointmentCalendarView + TFP).
      // Spec plan text wrote 200 chars; bumped at Task 9 ship time so
      // realistic multi-line shape doesn't fail the lock.
      expect(text, `${site} must use <CustomerOption ... contextBranchId={...} />`).toMatch(/CustomerOption[\s\S]{0,600}contextBranchId/);
    });
  }
});
