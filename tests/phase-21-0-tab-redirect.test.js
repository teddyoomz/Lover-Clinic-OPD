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

  test('R1.2 5 tab cases for the new sub-tab IDs (Phase 21.0-bis added appointment-all)', () => {
    // Phase 21.0-quater (2026-05-06 EOD hotfix) — the 5 sub-tab strings now
    // appear inside ONE OR-conditional `(activeTab === A || activeTab === B
    // || ...)` so React reuses the AppointmentCalendarView instance across
    // sub-tab clicks (avoids unmount-on-tab-change empty-grid bug). The
    // literal `activeTab === 'X'` substring still appears for each id.
    expect(BD).toMatch(/activeTab === ['"]appointment-all['"]/);
    expect(BD).toMatch(/activeTab === ['"]appointment-no-deposit['"]/);
    expect(BD).toMatch(/activeTab === ['"]appointment-deposit['"]/);
    expect(BD).toMatch(/activeTab === ['"]appointment-treatment-in['"]/);
    expect(BD).toMatch(/activeTab === ['"]appointment-follow-up['"]/);
  });

  test('R1.3 The 4 typed sub-tabs map activeTab to canonical appointmentType in the AppointmentCalendarView prop ternary', () => {
    // Phase 21.0-quater shape — single AppointmentCalendarView at ONE
    // syntactic position, with appointmentType prop computed via inline
    // ternary that maps activeTab → canonical type id. Each mapping
    // should appear as `activeTab === 'X' ? 'Y'`.
    expect(BD).toMatch(/activeTab === ['"]appointment-no-deposit['"]\s*\?\s*['"]no-deposit-booking['"]/);
    expect(BD).toMatch(/activeTab === ['"]appointment-deposit['"]\s*\?\s*['"]deposit-booking['"]/);
    expect(BD).toMatch(/activeTab === ['"]appointment-treatment-in['"]\s*\?\s*['"]treatment-in['"]/);
    expect(BD).toMatch(/activeTab === ['"]appointment-follow-up['"]\s*\?\s*['"]follow-up['"]/);
  });

  test('R1.3-bis appointment-all falls through to undefined (no type filter) — combined all-types view', () => {
    // Phase 21.0-quater — the type-prop ternary has no explicit
    // 'appointment-all' → 'X' mapping; instead it falls through to
    // `undefined` as the default. AppointmentCalendarView's internal
    // typeFilter resolves null when prop is undefined → typedDayAppts ===
    // dayAppts (no filter).
    expect(BD).toMatch(/undefined\s*\/\/\s*'appointment-all'/);
    // No `'appointment-all' ? 'X'` mapping should exist.
    expect(BD).not.toMatch(/['"]appointment-all['"]\s*\?\s*['"][\w-]+['"]/);
  });

  test('R1.4 Old activeTab === "appointments" branch is REMOVED', () => {
    expect(BD).not.toMatch(/activeTab === ['"]appointments['"]\s*\?/);
  });

  test('R1.5 URL hydration redirects legacy ?tab=appointments to all-types overview (semantic preservation)', () => {
    // Phase 21.0-bis: redirect target updated from 'appointment-no-deposit' →
    // 'appointment-all' (combined view, semantic successor of legacy
    // 'appointments' PINNED tab which showed all types stacked).
    expect(BD).toMatch(/tab === ['"]appointments['"]\s*\?\s*['"]appointment-all['"]/);
  });

  test('R1.6 fallback array uses appointment-all (not legacy "appointments" or any single-type sub-tab)', () => {
    expect(BD).toMatch(/firstAllowedTab\(\s*\[['"]appointment-all['"]/);
  });

  test('R1.7 tabPermissions.js has gate entries for all 5 sub-tabs', () => {
    expect(TP).toMatch(/['"]appointment-all['"]:\s*\{\s*requires:\s*\[/);
    expect(TP).toMatch(/['"]appointment-no-deposit['"]:\s*\{\s*requires:\s*\[/);
    expect(TP).toMatch(/['"]appointment-deposit['"]:\s*\{\s*requires:\s*\[/);
    expect(TP).toMatch(/['"]appointment-treatment-in['"]:\s*\{\s*requires:\s*\[/);
    expect(TP).toMatch(/['"]appointment-follow-up['"]:\s*\{\s*requires:\s*\[/);
  });

  test('R1.8 All 5 sub-tabs require the same permission set as legacy appointments', () => {
    // Each sub-tab gate references the 3 legacy permission keys.
    for (const id of ['appointment-all', 'appointment-no-deposit', 'appointment-deposit', 'appointment-treatment-in', 'appointment-follow-up']) {
      const re = new RegExp(`['"]${id}['"]:\\s*\\{\\s*requires:\\s*\\[[^\\]]*['"]appointment['"][^\\]]*['"]coming_appointment['"][^\\]]*['"]coming_appointment_self['"]`);
      expect(TP).toMatch(re);
    }
  });

  test('R1.9 firstAllowedTab default candidates updated to appointment-all', () => {
    expect(TP).toMatch(/candidates\s*=\s*\[\s*['"]appointment-all['"]/);
  });

  test('R1.10 Phase 21.0 marker present in BackendDashboard', () => {
    expect(BD).toMatch(/Phase 21\.0/);
  });
});
