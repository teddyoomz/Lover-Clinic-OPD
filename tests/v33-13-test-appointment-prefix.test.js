// V33.13 (2026-05-06) — drift catcher for TEST-APPT-/E2E-APPT- prefix
// enforcement helper. Mirrors V33.10 + V33.11 + V33.12.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  createTestAppointmentId,
  isTestAppointmentId,
  getTestAppointmentPrefix,
  TEST_APPOINTMENT_PREFIXES,
} from './helpers/testAppointment.js';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('V33.13 E1 — testAppointment.js helper file present + frozen prefixes', () => {
  it('E1.1 — helper file exists', () => {
    const stat = fs.statSync(path.join(ROOT, 'tests/helpers/testAppointment.js'));
    expect(stat.isFile()).toBe(true);
  });

  it('E1.2 — TEST_APPOINTMENT_PREFIXES is frozen', () => {
    expect(Object.isFrozen(TEST_APPOINTMENT_PREFIXES)).toBe(true);
    expect(TEST_APPOINTMENT_PREFIXES).toEqual(['TEST', 'E2E']);
  });
});

describe('V33.13 E2 — createTestAppointmentId', () => {
  it('E2.1 — default prefix TEST', () => {
    const id = createTestAppointmentId({ timestamp: 1777000000000 });
    expect(id).toBe('TEST-APPT-1777000000000');
  });

  it('E2.2 — E2E prefix', () => {
    const id = createTestAppointmentId({ prefix: 'E2E', timestamp: 1777000000000 });
    expect(id).toBe('E2E-APPT-1777000000000');
  });

  it('E2.3 — suffix appended', () => {
    const id = createTestAppointmentId({ suffix: 'multi', timestamp: 1777000000000 });
    expect(id).toBe('TEST-APPT-1777000000000-multi');
  });

  it('E2.4 — invalid prefix rejected', () => {
    expect(() => createTestAppointmentId({ prefix: 'PROD' })).toThrow(/prefix must be one of/);
  });

  it('E2.5 — invalid suffix rejected (special chars)', () => {
    expect(() => createTestAppointmentId({ suffix: 'has space' })).toThrow(/suffix must match/);
  });

  it('E2.6 — uses Date.now() when timestamp omitted', () => {
    const t0 = Date.now();
    const id = createTestAppointmentId();
    const m = id.match(/^TEST-APPT-(\d+)$/);
    expect(m).not.toBeNull();
    const ts = Number(m[1]);
    expect(ts).toBeGreaterThanOrEqual(t0 - 1000);
    expect(ts).toBeLessThanOrEqual(Date.now() + 1000);
  });
});

describe('V33.13 E3 — isTestAppointmentId', () => {
  it.each([
    ['TEST-APPT-1777123845203', true],
    ['TEST-APPT-1777123845203-multi', true],
    ['E2E-APPT-1777000', true],
    ['E2E-APPT-1777000-x', true],
    ['BA-1777000000000', false],     // production appointment ID format
    ['APPT-2026-001', false],
    ['', false],
    [null, false],
    [undefined, false],
    [123, false],
  ])('isTestAppointmentId(%j) === %s', (id, expected) => {
    expect(isTestAppointmentId(id)).toBe(expected);
  });
});

describe('V33.13 E4 — getTestAppointmentPrefix', () => {
  it('E4.1 — TEST id returns "TEST"', () => {
    expect(getTestAppointmentPrefix('TEST-APPT-1234')).toBe('TEST');
  });

  it('E4.2 — E2E id returns "E2E"', () => {
    expect(getTestAppointmentPrefix('E2E-APPT-5678')).toBe('E2E');
  });

  it('E4.3 — non-test id returns null', () => {
    expect(getTestAppointmentPrefix('BA-1')).toBeNull();
    expect(getTestAppointmentPrefix('')).toBeNull();
    expect(getTestAppointmentPrefix(null)).toBeNull();
  });
});

describe('V33.13 E5 — Rule 02 workflow.md documents the V33.13 convention', () => {
  const workflowDoc = read('.claude/rules/02-workflow.md');

  it('E5.1 — V33.13 marker present in workflow rules', () => {
    expect(workflowDoc).toMatch(/V33\.13/);
  });

  it('E5.2 — testAppointment.js helper referenced', () => {
    expect(workflowDoc).toMatch(/testAppointment\.js/);
  });
});
