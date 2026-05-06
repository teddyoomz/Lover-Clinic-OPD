// tests/phase-19-0-time-slot-15min.test.js
// Phase 19.0 — T1-T5 — canonical 15-min TIME_SLOTS + Rule of 3 collapse.

import { describe, test, expect } from 'vitest';
import { TIME_SLOTS, SLOT_INTERVAL_MIN_DISPLAY } from '../src/lib/staffScheduleValidation.js';
import { readFileSync } from 'node:fs';

describe('Phase 19.0 — TIME_SLOTS 15-min', () => {
  test('T1.1 length is 56 (was 28 in 30-min)', () => {
    expect(TIME_SLOTS.length).toBe(56);
  });

  test('T1.2 first = 08:15, last = 22:00', () => {
    expect(TIME_SLOTS[0]).toBe('08:15');
    expect(TIME_SLOTS[TIME_SLOTS.length - 1]).toBe('22:00');
  });

  test('T2.1 SLOT_INTERVAL_MIN_DISPLAY exported as 15', () => {
    expect(SLOT_INTERVAL_MIN_DISPLAY).toBe(15);
  });

  test('T3.1 spacing is exactly 15 min between consecutive entries', () => {
    for (let i = 1; i < TIME_SLOTS.length; i++) {
      const [hPrev, mPrev] = TIME_SLOTS[i - 1].split(':').map(Number);
      const [hCurr, mCurr] = TIME_SLOTS[i].split(':').map(Number);
      const minutesPrev = hPrev * 60 + mPrev;
      const minutesCurr = hCurr * 60 + mCurr;
      expect(minutesCurr - minutesPrev).toBe(15);
    }
  });

  test('T3.2 every entry matches HH:MM pattern with mm in {00, 15, 30, 45}', () => {
    for (const slot of TIME_SLOTS) {
      expect(slot).toMatch(/^\d{2}:(00|15|30|45)$/);
    }
  });

  test('T4.1 AppointmentTab does NOT define local TIME_SLOTS', () => {
    const src = readFileSync('src/components/backend/AppointmentCalendarView.jsx', 'utf8');
    expect(src).not.toMatch(/^const TIME_SLOTS = \[\];/m);
  });

  test('T4.2 AppointmentFormModal does NOT define local TIME_SLOTS', () => {
    const src = readFileSync('src/components/backend/AppointmentFormModal.jsx', 'utf8');
    expect(src).not.toMatch(/^const TIME_SLOTS = \[\];/m);
  });

  test('T4.3 DepositPanel does NOT define local TIME_SLOTS', () => {
    const src = readFileSync('src/components/backend/DepositPanel.jsx', 'utf8');
    expect(src).not.toMatch(/^const TIME_SLOTS = \[\];/m);
  });

  test('T5.1 each consumer imports canonical TIME_SLOTS', () => {
    for (const path of [
      'src/components/backend/AppointmentCalendarView.jsx',
      'src/components/backend/AppointmentFormModal.jsx',
      'src/components/backend/DepositPanel.jsx',
    ]) {
      const src = readFileSync(path, 'utf8');
      expect(src).toMatch(/from ['"][^'"]*staffScheduleValidation/);
    }
  });
});
