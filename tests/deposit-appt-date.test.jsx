import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// 2026-05-27 — source-grep regression: locks the real DepositPanel JSX to the
// flow-simulate logic (deposit-appt-date-flow-simulate.test.js). Pure-display change.
const src = readFileSync('src/components/backend/DepositPanel.jsx', 'utf8');

describe('deposit appt-date — source-grep regression', () => {
  it('defines + reuses gotoApptDate helper (button + date link share it)', () => {
    expect(src).toMatch(/const gotoApptDate\s*=/);
    expect((src.match(/gotoApptDate\(/g) || []).length).toBeGreaterThanOrEqual(2); // button + date link
  });

  it('renders clickable appt-date link with fmtThaiDate + startTime', () => {
    expect(src).toMatch(/deposit-appt-date-link/);
    expect(src).toMatch(/fmtThaiDate\(dep\.appointment\.date\)/);
    expect(src).toMatch(/dep\.appointment\.startTime/);
  });

  it('renders ยังไม่นัด hint for no-appointment active deposits', () => {
    expect(src).toMatch(/deposit-no-appt-hint/);
    expect(src).toMatch(/ยังไม่นัด/);
  });
});
