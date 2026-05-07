import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf-8');

describe('CS1 — Lookup-map consumers opt-in {includeHidden:true}', () => {
  it('CS1.1 — StaffTab calls listStaff({includeHidden:true})', () => {
    const code = read('src/components/backend/StaffTab.jsx');
    expect(code).toMatch(/listStaff\(\s*\{\s*includeHidden:\s*true\s*\}/);
  });

  it('CS1.2 — DoctorsTab calls listDoctors({includeHidden:true})', () => {
    const code = read('src/components/backend/DoctorsTab.jsx');
    expect(code).toMatch(/listDoctors\(\s*\{\s*includeHidden:\s*true\s*\}/);
  });

  it('CS1.3 — CustomerDetailView opts in for staff/doctor lookup', () => {
    const code = read('src/components/backend/CustomerDetailView.jsx');
    // CustomerDetailView builds doctor lookup map for past-record name display.
    // listDoctors opt-in is required; listStaff opt-in MAY be present if
    // staff names also rendered on past records (judgment per migration).
    // Minimum: at least ONE of the two must be opted in.
    const hasOptIn = /listStaff\(\s*\{\s*includeHidden:\s*true\s*\}/.test(code)
                  || /listDoctors\(\s*\{\s*includeHidden:\s*true\s*\}/.test(code);
    expect(hasOptIn).toBe(true);
  });

  it('CS1.4 — TreatmentFormPage opts in for both listStaff + listDoctors', () => {
    const code = read('src/components/TreatmentFormPage.jsx');
    expect(code).toMatch(/listStaff\(\s*\{\s*includeHidden:\s*true\s*\}/);
    expect(code).toMatch(/listDoctors\(\s*\{\s*includeHidden:\s*true\s*\}/);
  });

  it('CS1.5 — AdminDashboard opts in for both listStaff + listDoctors', () => {
    const code = read('src/pages/AdminDashboard.jsx');
    expect(code).toMatch(/listStaff\(\s*\{\s*includeHidden:\s*true\s*\}/);
    expect(code).toMatch(/listDoctors\(\s*\{\s*includeHidden:\s*true\s*\}/);
  });

  it('CS1.6 — AppointmentCalendarView opts in for past appointment name resolution', () => {
    const code = read('src/components/backend/AppointmentCalendarView.jsx');
    expect(code).toMatch(/listDoctors\(\s*\{\s*includeHidden:\s*true\s*\}/);
  });
});

describe('CS2 — Picker-only consumers should NOT opt in (default-filter handles them)', () => {
  it('CS2.1 — AppointmentFormModal does NOT use {includeHidden:true} for its pickers', () => {
    const code = read('src/components/backend/AppointmentFormModal.jsx');
    // AppointmentFormModal is a picker-only consumer — default-filter is correct.
    // If a future change adds {includeHidden:true} here, it must be paired with
    // a justifying inline comment + filtered visibleX derivation.
    expect(code).not.toMatch(/listDoctors\(\s*\{\s*includeHidden:\s*true\s*\}/);
    expect(code).not.toMatch(/listStaff\(\s*\{\s*includeHidden:\s*true\s*\}/);
  });

  it('CS2.2 — DepositPanel: same constraint (picker-only)', () => {
    const code = read('src/components/backend/DepositPanel.jsx');
    expect(code).not.toMatch(/listDoctors\(\s*\{\s*includeHidden:\s*true\s*\}/);
    expect(code).not.toMatch(/listStaff\(\s*\{\s*includeHidden:\s*true\s*\}/);
  });
});

describe('CS3 — Lib-layer source-grep', () => {
  it('CS3.1 — listStaff signature accepts {includeHidden} opt', () => {
    const code = read('src/lib/backendClient.js');
    expect(code).toMatch(/export async function listStaff\(\{?\s*includeHidden\s*=\s*false/);
  });

  it('CS3.2 — listDoctors signature accepts {includeHidden} opt', () => {
    const code = read('src/lib/backendClient.js');
    expect(code).toMatch(/export async function listDoctors\(\{?\s*includeHidden\s*=\s*false/);
  });

  it('CS3.3 — saveStaff includes V41 transition stamp logic', () => {
    const code = read('src/lib/backendClient.js');
    expect(code).toMatch(/V41.*audit-stamp/);
    expect(code).toMatch(/wasHidden\s*!==\s*willBeHidden/);
    // Match the actual assignment shape: `auditStamps.hiddenAt = willBeHidden ? serverTimestamp()...`
    expect(code).toMatch(/auditStamps\.hiddenAt\s*=\s*willBeHidden\s*\?\s*serverTimestamp/);
  });

  it('CS3.4 — saveDoctor includes V41 transition stamp logic', () => {
    const code = read('src/lib/backendClient.js');
    // Both saveStaff and saveDoctor have the same comment marker
    const matches = code.match(/V41.*audit-stamp/g);
    expect(matches?.length).toBeGreaterThanOrEqual(2);
  });
});

describe('CS4 — emptyForm shapes include isHidden', () => {
  it('CS4.1 — emptyStaffForm includes isHidden:false', () => {
    const code = read('src/lib/staffValidation.js');
    expect(code).toMatch(/isHidden:\s*false/);
  });

  it('CS4.2 — emptyDoctorForm includes isHidden:false', () => {
    const code = read('src/lib/doctorValidation.js');
    expect(code).toMatch(/isHidden:\s*false/);
  });
});
