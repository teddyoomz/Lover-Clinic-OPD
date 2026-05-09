// Phase 25.0a (2026-05-09) — Walk-in (5th appointment type) SSOT additions.
//
// Verifies: APPOINTMENT_TYPES has 5 entries, walk-in is order:4 with label
// 'Walk-in' + defaultColor 'น้ำตาลอ่อน'; resolveAppointmentTypeLabel +
// resolveAppointmentTypeDefaultColor handle the new value; existing 4
// entries preserved verbatim (regression guard); migrateLegacyAppointmentType
// + isLegacyAppointmentType behavior unchanged for walk-in (it's a NEW
// canonical value, not legacy).
import { describe, it, expect } from 'vitest';
import {
  APPOINTMENT_TYPES,
  APPOINTMENT_TYPE_VALUES,
  DEFAULT_APPOINTMENT_TYPE,
  resolveAppointmentTypeLabel,
  resolveAppointmentTypeDefaultColor,
  isLegacyAppointmentType,
  migrateLegacyAppointmentType,
} from '../src/lib/appointmentTypes.js';

describe('Phase 25.0a — Walk-in 5th appointment type SSOT', () => {
  it('P25.0a-S1 APPOINTMENT_TYPES has exactly 5 entries (was 4)', () => {
    expect(APPOINTMENT_TYPES.length).toBe(5);
  });

  it('P25.0a-S2 walk-in entry shape correct (value/label/defaultColor/order)', () => {
    const walkIn = APPOINTMENT_TYPES.find(t => t.value === 'walk-in');
    expect(walkIn).toBeDefined();
    expect(walkIn.label).toBe('Walk-in');
    expect(walkIn.defaultColor).toBe('น้ำตาลอ่อน');
    expect(walkIn.order).toBe(4);
  });

  it('P25.0a-S3 walk-in entry is FROZEN (immutable)', () => {
    const walkIn = APPOINTMENT_TYPES.find(t => t.value === 'walk-in');
    expect(Object.isFrozen(walkIn)).toBe(true);
  });

  it('P25.0a-S4 APPOINTMENT_TYPE_VALUES includes walk-in', () => {
    expect(APPOINTMENT_TYPE_VALUES).toContain('walk-in');
    expect(APPOINTMENT_TYPE_VALUES.length).toBe(5);
  });

  it('P25.0a-S5 existing 4 types preserved verbatim (regression guard)', () => {
    const expected = [
      { value: 'deposit-booking',    label: 'จองมัดจำ',     defaultColor: 'เขียวอ่อน',    order: 0 },
      { value: 'no-deposit-booking', label: 'จองไม่มัดจำ',  defaultColor: 'ส้มอ่อน',      order: 1 },
      { value: 'treatment-in',       label: 'เข้าทำหัตถการ', defaultColor: 'น้ำเงินอ่อน',  order: 2 },
      { value: 'follow-up',          label: 'ติดตามอาการ',   defaultColor: 'เหลืองอ่อน',  order: 3 },
    ];
    for (const exp of expected) {
      const actual = APPOINTMENT_TYPES.find(t => t.value === exp.value);
      expect(actual).toBeDefined();
      expect(actual.label).toBe(exp.label);
      expect(actual.defaultColor).toBe(exp.defaultColor);
      expect(actual.order).toBe(exp.order);
    }
  });

  it('P25.0a-S6 DEFAULT_APPOINTMENT_TYPE unchanged (still no-deposit-booking)', () => {
    expect(DEFAULT_APPOINTMENT_TYPE).toBe('no-deposit-booking');
  });

  it('P25.0a-S7 resolveAppointmentTypeLabel("walk-in") → "Walk-in"', () => {
    expect(resolveAppointmentTypeLabel('walk-in')).toBe('Walk-in');
  });

  it('P25.0a-S8 resolveAppointmentTypeDefaultColor("walk-in") → "น้ำตาลอ่อน"', () => {
    expect(resolveAppointmentTypeDefaultColor('walk-in')).toBe('น้ำตาลอ่อน');
  });

  it('P25.0a-S9 isLegacyAppointmentType("walk-in") → false (canonical, not legacy)', () => {
    expect(isLegacyAppointmentType('walk-in')).toBe(false);
  });

  it('P25.0a-S10 migrateLegacyAppointmentType("walk-in") passes through (idempotent)', () => {
    expect(migrateLegacyAppointmentType('walk-in')).toBe('walk-in');
  });

  it('P25.0a-S11 unknown appointment type still falls back to DEFAULT label (existing contract)', () => {
    expect(resolveAppointmentTypeLabel('something-bogus')).toBe('จองไม่มัดจำ');
  });

  it('P25.0a-S12 ordering is stable (order field 0..4 ascending)', () => {
    const orders = APPOINTMENT_TYPES.map(t => t.order);
    expect(orders).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('Phase 25.0a — TYPE_CHIP_CLS source-grep regression guards', () => {
  // Verifies the 5th type chip class entry exists in the V64 hub row card.
  // Source-grep approach (mirror of V32 visual-regression pattern) — checks
  // the file content rather than mounting React.
  it('P25.0a-G1 AppointmentHubRowCard TYPE_CHIP_CLS contains walk-in entry', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync('src/components/admin/AppointmentHubRowCard.jsx', 'utf-8');
    expect(src).toMatch(/'walk-in':\s+'bg-amber-100/);
    expect(src).toMatch(/dark:bg-amber-950/);
    expect(src).toMatch(/dark:text-amber-200/);
  });

  it('P25.0a-G2 navConfig contains appointment-walk-in sub-tab below appointment-follow-up', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync('src/components/backend/nav/navConfig.js', 'utf-8');
    const followUpIdx = src.indexOf("'appointment-follow-up'");
    const walkInIdx   = src.indexOf("'appointment-walk-in'");
    expect(followUpIdx).toBeGreaterThan(0);
    expect(walkInIdx).toBeGreaterThan(followUpIdx); // walk-in below follow-up
    expect(src).toMatch(/Footprints/); // icon imported + used
  });

  it('P25.0a-G3 BackendDashboard tab guard includes appointment-walk-in', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync('src/pages/BackendDashboard.jsx', 'utf-8');
    expect(src).toMatch(/activeTab === 'appointment-walk-in'/);
  });

  it('P25.0a-G4 BackendDashboard activeTab→type mapper handles appointment-walk-in', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync('src/pages/BackendDashboard.jsx', 'utf-8');
    expect(src).toMatch(/activeTab === 'appointment-walk-in'\s+\?\s+'walk-in'/);
  });
});
