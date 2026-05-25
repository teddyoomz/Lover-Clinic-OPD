// tests/visit-reason-options.test.js
// Task E1 — single-source visitReasonOptions constant (Rule C1).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { visitReasonOptions, VISIT_REASON_VALUES } from '../src/lib/visitReasonOptions.js';

describe('visitReasonOptions single source', () => {
  it('exports 10 options with value/th/en', () => {
    expect(visitReasonOptions).toHaveLength(10);
    for (const o of visitReasonOptions) {
      expect(typeof o.value).toBe('string');
      expect(o.th).toBeTruthy();
      expect(o.en).toBeTruthy();
    }
    expect(visitReasonOptions.map((o) => o.value)).toContain('อื่นๆ');
  });

  it('VISIT_REASON_VALUES is the value[] (used by AdminDashboard chips)', () => {
    expect(VISIT_REASON_VALUES).toEqual(visitReasonOptions.map((o) => o.value));
    expect(VISIT_REASON_VALUES[0]).toBe('สมรรถภาพทางเพศ');
    expect(VISIT_REASON_VALUES).toHaveLength(10);
  });

  it('NO inline copy remains in PatientForm / AdminDashboard (source-grep)', () => {
    const pf = fs.readFileSync('src/pages/PatientForm.jsx', 'utf8');
    const ad = fs.readFileSync('src/pages/AdminDashboard.jsx', 'utf8');
    // the old inline array literal pattern must be gone
    expect(pf).not.toMatch(/const\s+visitReasonOptions\s*=\s*\[/);
    expect(ad).not.toMatch(/\['สมรรถภาพทางเพศ','โรคระบบทางเดินปัสสาวะ'/);
    // and they must import the shared constant
    expect(pf).toMatch(/from '\.\.\/lib\/visitReasonOptions\.js'/);
    expect(ad).toMatch(/visitReasonOptions|VISIT_REASON_VALUES/);
  });
});
