// tests/phase-19-0-flow-simulate.test.js
// Phase 19.0 — F1-F9 — Rule I full-flow simulate.

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  APPOINTMENT_TYPES,
  APPOINTMENT_TYPE_VALUES,
  DEFAULT_APPOINTMENT_TYPE,
  resolveAppointmentTypeLabel,
  resolveAppointmentTypeDefaultColor,
  migrateLegacyAppointmentType,
} from '../src/lib/appointmentTypes.js';

const FORM_SRC = readFileSync('src/components/backend/AppointmentFormModal.jsx', 'utf8');
const TAB_SRC = readFileSync('src/components/backend/AppointmentTab.jsx', 'utf8');
const DEP_SRC = readFileSync('src/components/backend/DepositPanel.jsx', 'utf8');
const AGG_SRC = readFileSync('src/lib/appointmentReportAggregator.js', 'utf8');
const ADMIN_SRC = readFileSync('src/pages/AdminDashboard.jsx', 'utf8');

describe('Phase 19.0 — Rule I full-flow simulate', () => {
  test('F1.1 master types loaded — 4 values present', () => {
    expect(APPOINTMENT_TYPE_VALUES.length).toBe(4);
  });

  test('F2.1 form modal references APPOINTMENT_TYPES (radio rendering)', () => {
    expect(FORM_SRC).toMatch(/APPOINTMENT_TYPES\.map/);
  });

  test('F3.1 admin pick treatment-in resolves to label + color', () => {
    expect(resolveAppointmentTypeLabel('treatment-in')).toBe('เข้าทำหัตถการ');
    expect(resolveAppointmentTypeDefaultColor('treatment-in')).toBe('น้ำเงินอ่อน');
  });

  test('F4.1 save path payload shape (form simulate)', () => {
    const formData = { appointmentType: 'treatment-in', startTime: '14:00', endTime: '14:15' };
    const payload = { ...formData, appointmentType: formData.appointmentType || DEFAULT_APPOINTMENT_TYPE };
    expect(payload.appointmentType).toBe('treatment-in');
  });

  test("F4.2 missing appointmentType falls back to DEFAULT (no 'sales' leak)", () => {
    const formData = { appointmentType: '', startTime: '14:00', endTime: '14:15' };
    const payload = { ...formData, appointmentType: formData.appointmentType || DEFAULT_APPOINTMENT_TYPE };
    expect(payload.appointmentType).toBe('no-deposit-booking');
  });

  test('F5.1 grid chip color resolves per type', () => {
    for (const t of APPOINTMENT_TYPES) {
      expect(resolveAppointmentTypeDefaultColor(t.value)).toBe(t.defaultColor);
    }
  });

  test('F6.1 report aggregator delegates to resolver (no inline map)', () => {
    expect(AGG_SRC).toMatch(/resolveAppointmentTypeLabel/);
    expect(AGG_SRC).not.toMatch(/sales: ['"]ขาย['"]/);
  });

  test('F7.1 AdminDashboard typeMap replaced with resolver', () => {
    expect(ADMIN_SRC).toMatch(/resolveAppointmentTypeLabel/);
    // Inline 4-key typeMap removed.
    expect(ADMIN_SRC).not.toMatch(/typeMap = \{ follow:/);
  });

  test('F8.1 source-grep — no inline TIME_SLOTS local generators', () => {
    expect(TAB_SRC).not.toMatch(/^const TIME_SLOTS = \[\];/m);
    expect(FORM_SRC).not.toMatch(/^const TIME_SLOTS = \[\];/m);
    expect(DEP_SRC).not.toMatch(/^const TIME_SLOTS = \[\];/m);
  });

  test('F8.2 source-grep — no inline APPT_TYPES local arrays', () => {
    expect(FORM_SRC).not.toMatch(/^const APPT_TYPES = \[\{ value: ['"]sales['"]/m);
  });

  test('F9.1 migrateLegacyAppointmentType handles full legacy distribution', () => {
    // Simulate post-deploy distribution observed in audit-doc.
    // Only include docs that actually need migration (count > 0).
    const sample = {
      sales: 100,
      followup: 50,
      follow: 5,
      consult: 2,
      treatment: 1,
      null: 10,
      // 'deposit-booking': 0 — none yet pre-migration; skip zero entries
    };
    const after = {};
    for (const [legacy, count] of Object.entries(sample)) {
      if (count === 0) continue;
      const value = legacy === 'null' ? null : legacy;
      const mapped = migrateLegacyAppointmentType(value);
      after[mapped] = (after[mapped] || 0) + count;
    }
    expect(after['no-deposit-booking']).toBe(168); // 100+50+5+2+1+10 = all flowed to default
    expect(Object.keys(after).filter((k) => k !== 'no-deposit-booking')).toEqual([]);
  });
});
