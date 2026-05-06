// tests/phase-21-0-tab-redirect.test.js
// Phase 21.0 — R1 — Legacy ?tab=appointments redirect + permission map

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const BD = readFileSync('src/pages/BackendDashboard.jsx', 'utf8');
const TP = readFileSync('src/lib/tabPermissions.js', 'utf8');

describe('Phase 21.0 — R1 BackendDashboard routing + redirect', () => {
  test('R1.1 BackendDashboard imports AppointmentCalendarView (not AppointmentTab)', () => {
    expect(BD).toMatch(/import\s+AppointmentCalendarView\s+from\s+['"]\.\.\/components\/backend\/AppointmentCalendarView\.jsx['"]/);
    expect(BD).not.toMatch(/import\s+AppointmentTab\s+from/);
  });

  test('R1.2 4 tab cases for the new sub-tab IDs', () => {
    expect(BD).toMatch(/activeTab === ['"]appointment-no-deposit['"]/);
    expect(BD).toMatch(/activeTab === ['"]appointment-deposit['"]/);
    expect(BD).toMatch(/activeTab === ['"]appointment-treatment-in['"]/);
    expect(BD).toMatch(/activeTab === ['"]appointment-follow-up['"]/);
  });

  test('R1.3 Each sub-tab passes appointmentType prop to AppointmentCalendarView', () => {
    expect(BD).toMatch(/<AppointmentCalendarView[\s\S]{0,200}?appointmentType=['"]no-deposit-booking['"]/);
    expect(BD).toMatch(/<AppointmentCalendarView[\s\S]{0,200}?appointmentType=['"]deposit-booking['"]/);
    expect(BD).toMatch(/<AppointmentCalendarView[\s\S]{0,200}?appointmentType=['"]treatment-in['"]/);
    expect(BD).toMatch(/<AppointmentCalendarView[\s\S]{0,200}?appointmentType=['"]follow-up['"]/);
  });

  test('R1.4 Old activeTab === "appointments" branch is REMOVED', () => {
    expect(BD).not.toMatch(/activeTab === ['"]appointments['"]\s*\?/);
  });

  test('R1.5 URL hydration redirects legacy ?tab=appointments to no-deposit sub-tab', () => {
    expect(BD).toMatch(/tab === ['"]appointments['"]\s*\?\s*['"]appointment-no-deposit['"]/);
  });

  test('R1.6 fallback array uses appointment-no-deposit (not legacy "appointments")', () => {
    expect(BD).toMatch(/firstAllowedTab\(\s*\[['"]appointment-no-deposit['"]/);
  });

  test('R1.7 tabPermissions.js has gate entries for all 4 sub-tabs', () => {
    expect(TP).toMatch(/['"]appointment-no-deposit['"]:\s*\{\s*requires:\s*\[/);
    expect(TP).toMatch(/['"]appointment-deposit['"]:\s*\{\s*requires:\s*\[/);
    expect(TP).toMatch(/['"]appointment-treatment-in['"]:\s*\{\s*requires:\s*\[/);
    expect(TP).toMatch(/['"]appointment-follow-up['"]:\s*\{\s*requires:\s*\[/);
  });

  test('R1.8 All 4 sub-tabs require the same permission set as legacy appointments', () => {
    // Each sub-tab gate references the 3 legacy permission keys.
    for (const id of ['appointment-no-deposit', 'appointment-deposit', 'appointment-treatment-in', 'appointment-follow-up']) {
      const re = new RegExp(`['"]${id}['"]:\\s*\\{\\s*requires:\\s*\\[[^\\]]*['"]appointment['"][^\\]]*['"]coming_appointment['"][^\\]]*['"]coming_appointment_self['"]`);
      expect(TP).toMatch(re);
    }
  });

  test('R1.9 firstAllowedTab default candidates updated to use new sub-tab', () => {
    expect(TP).toMatch(/candidates\s*=\s*\[\s*['"]appointment-no-deposit['"]/);
  });

  test('R1.10 Phase 21.0 marker present in BackendDashboard', () => {
    expect(BD).toMatch(/Phase 21\.0/);
  });
});
