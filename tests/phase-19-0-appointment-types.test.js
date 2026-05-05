// tests/phase-19-0-appointment-types.test.js
// Phase 19.0 — A1-A7 — appointmentTypes.js SSOT.

import { describe, test, expect } from 'vitest';
import {
  APPOINTMENT_TYPES,
  APPOINTMENT_TYPE_VALUES,
  DEFAULT_APPOINTMENT_TYPE,
  resolveAppointmentTypeLabel,
  resolveAppointmentTypeDefaultColor,
  isLegacyAppointmentType,
  migrateLegacyAppointmentType,
} from '../src/lib/appointmentTypes.js';
import { readFileSync } from 'node:fs';

const SRC = readFileSync('src/lib/appointmentTypes.js', 'utf8');

describe('Phase 19.0 — appointmentTypes SSOT', () => {
  test('A1.1 APPOINTMENT_TYPES is frozen with 4 entries', () => {
    expect(Object.isFrozen(APPOINTMENT_TYPES)).toBe(true);
    expect(APPOINTMENT_TYPES).toHaveLength(4);
  });

  test('A1.2 each entry is frozen with value/label/defaultColor/order', () => {
    for (const t of APPOINTMENT_TYPES) {
      expect(Object.isFrozen(t)).toBe(true);
      expect(typeof t.value).toBe('string');
      expect(typeof t.label).toBe('string');
      expect(typeof t.defaultColor).toBe('string');
      expect(typeof t.order).toBe('number');
    }
  });

  test('A1.3 values are exactly the 4 phase-19.0 keys', () => {
    expect(APPOINTMENT_TYPE_VALUES).toEqual([
      'deposit-booking', 'no-deposit-booking', 'treatment-in', 'follow-up',
    ]);
  });

  test('A1.4 Thai labels match spec', () => {
    const labels = APPOINTMENT_TYPES.map((t) => t.label);
    expect(labels).toEqual(['จองมัดจำ', 'จองไม่มัดจำ', 'เข้าทำหัตถการ', 'ติดตามอาการ']);
  });

  test('A1.5 default colors map to spec', () => {
    expect(APPOINTMENT_TYPES.find((t) => t.value === 'deposit-booking').defaultColor).toBe('เขียวอ่อน');
    expect(APPOINTMENT_TYPES.find((t) => t.value === 'no-deposit-booking').defaultColor).toBe('ส้มอ่อน');
    expect(APPOINTMENT_TYPES.find((t) => t.value === 'treatment-in').defaultColor).toBe('น้ำเงินอ่อน');
    expect(APPOINTMENT_TYPES.find((t) => t.value === 'follow-up').defaultColor).toBe('เหลืองอ่อน');
  });

  test('A1.6 DEFAULT is no-deposit-booking', () => {
    expect(DEFAULT_APPOINTMENT_TYPE).toBe('no-deposit-booking');
  });

  test('A2.1 resolveAppointmentTypeLabel for known values', () => {
    expect(resolveAppointmentTypeLabel('deposit-booking')).toBe('จองมัดจำ');
    expect(resolveAppointmentTypeLabel('no-deposit-booking')).toBe('จองไม่มัดจำ');
    expect(resolveAppointmentTypeLabel('treatment-in')).toBe('เข้าทำหัตถการ');
    expect(resolveAppointmentTypeLabel('follow-up')).toBe('ติดตามอาการ');
  });

  test('A2.2 resolveAppointmentTypeLabel falls back to DEFAULT label for unknown / null / legacy', () => {
    const fallback = 'จองไม่มัดจำ';
    expect(resolveAppointmentTypeLabel('sales')).toBe(fallback);
    expect(resolveAppointmentTypeLabel('followup')).toBe(fallback);
    expect(resolveAppointmentTypeLabel('consult')).toBe(fallback);
    expect(resolveAppointmentTypeLabel(null)).toBe(fallback);
    expect(resolveAppointmentTypeLabel(undefined)).toBe(fallback);
    expect(resolveAppointmentTypeLabel('')).toBe(fallback);
    expect(resolveAppointmentTypeLabel('garbage-xyz')).toBe(fallback);
  });

  test('A3.1 resolveAppointmentTypeDefaultColor for known values', () => {
    expect(resolveAppointmentTypeDefaultColor('deposit-booking')).toBe('เขียวอ่อน');
    expect(resolveAppointmentTypeDefaultColor('treatment-in')).toBe('น้ำเงินอ่อน');
  });

  test('A3.2 unknown → fallback to DEFAULT color', () => {
    expect(resolveAppointmentTypeDefaultColor('sales')).toBe('ส้มอ่อน');
    expect(resolveAppointmentTypeDefaultColor(null)).toBe('ส้มอ่อน');
  });

  test('A4.1 isLegacyAppointmentType true for legacy + null + empty', () => {
    expect(isLegacyAppointmentType('sales')).toBe(true);
    expect(isLegacyAppointmentType('followup')).toBe(true);
    expect(isLegacyAppointmentType('follow')).toBe(true);
    expect(isLegacyAppointmentType('consult')).toBe(true);
    expect(isLegacyAppointmentType('treatment')).toBe(true);
    expect(isLegacyAppointmentType(null)).toBe(true);
    expect(isLegacyAppointmentType('')).toBe(true);
    expect(isLegacyAppointmentType(undefined)).toBe(true);
  });

  test('A4.2 isLegacyAppointmentType false for new 4 values', () => {
    for (const v of APPOINTMENT_TYPE_VALUES) {
      expect(isLegacyAppointmentType(v)).toBe(false);
    }
  });

  test('A5.1 migrateLegacyAppointmentType — all 6 legacy inputs → DEFAULT', () => {
    expect(migrateLegacyAppointmentType('sales')).toBe('no-deposit-booking');
    expect(migrateLegacyAppointmentType('followup')).toBe('no-deposit-booking');
    expect(migrateLegacyAppointmentType('follow')).toBe('no-deposit-booking');
    expect(migrateLegacyAppointmentType('consult')).toBe('no-deposit-booking');
    expect(migrateLegacyAppointmentType('treatment')).toBe('no-deposit-booking');
    expect(migrateLegacyAppointmentType(null)).toBe('no-deposit-booking');
    expect(migrateLegacyAppointmentType('')).toBe('no-deposit-booking');
    expect(migrateLegacyAppointmentType(undefined)).toBe('no-deposit-booking');
  });

  test('A5.2 migrateLegacyAppointmentType — passthrough for new 4 values (idempotent)', () => {
    for (const v of APPOINTMENT_TYPE_VALUES) {
      expect(migrateLegacyAppointmentType(v)).toBe(v);
    }
  });

  test('A6.1 module exports stable shape', () => {
    expect(SRC).toMatch(/export const APPOINTMENT_TYPES = Object\.freeze/);
    expect(SRC).toMatch(/export const DEFAULT_APPOINTMENT_TYPE = 'no-deposit-booking'/);
    expect(SRC).toMatch(/export function migrateLegacyAppointmentType/);
  });

  test('A7.1 Phase 19.0 marker present (institutional memory)', () => {
    expect(SRC).toMatch(/Phase 19\.0/);
  });
});
