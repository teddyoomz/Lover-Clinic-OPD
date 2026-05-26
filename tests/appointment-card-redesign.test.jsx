// Appointment Card Redesign (2026-05-26 EOD+6) — cosmetic-shell source-grep guards.
//
// Spec:  docs/superpowers/specs/2026-05-26-appointment-card-redesign-design.html
// Plan:  docs/superpowers/plans/2026-05-26-appointment-card-redesign.html
//
// Scope: Q1 band layout · Q2 theme-matched OPD pills · Q3 Editorial Ember ·
//        Q4 stepper untouched (re-position only) · Q5 remove "OPD lifecycle"
//        header · Q6 rename save label บันทึกลง OPD → บันทึกเข้าระบบ.
//
// COSMETIC-SHELL INVARIANT: every data-testid / handler / conditional preserved;
// only classNames + the 2 sanctioned labels change. These grep tests lock that.

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const read = (p) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');
const STYLES = 'src/components/admin/_apptHubStyles.js';

describe('Card redesign — Task 1: OPD_PILL tokens', () => {
  it('T1.1 exports OPD_PILL with blue/emerald/wait/save', () => {
    const s = read(STYLES);
    expect(s).toMatch(/export const OPD_PILL\b/);
    for (const k of ['blue', 'emerald', 'wait', 'save']) {
      expect(s, `OPD_PILL.${k}`).toMatch(new RegExp(`\\b${k}\\s*:`));
    }
  });

  it('T1.2 each token has a LIGHT base + a dark: override (theme-matched, not dark-only)', () => {
    const s = read(STYLES);
    // light bases present (the fix — these were missing, causing green-on-green)
    expect(s).toMatch(/bg-blue-100/);
    expect(s).toMatch(/bg-emerald-100/);
    expect(s).toMatch(/bg-slate-100/);
    expect(s).toMatch(/bg-rose-100/);
    // dark overrides present (mirror the prior dark-only values, now as dark: variants)
    expect(s).toMatch(/dark:bg-blue-900\/30/);
    expect(s).toMatch(/dark:bg-emerald-900\/30/);
    expect(s).toMatch(/dark:bg-slate-800\/50/);
    expect(s).toMatch(/dark:bg-red-950\/40/);
  });
});
