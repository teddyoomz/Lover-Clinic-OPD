import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { generateClinicalSummary } from '../src/utils.js';

const d = {
  visitReasons: ['สมรรถภาพทางเพศ'],
  adam_1: true, adam_3: true, adam_6: true,
  iief_1: '4', iief_2: '4', iief_3: '4', iief_4: '4', iief_5: '3',
  firstName: 'A', lastName: 'B',
};

describe('generateClinicalSummary includeScreening', () => {
  it('default (true) — print/intake KEEP the ED screening block (TH)', () => {
    const s = generateClinicalSummary(d, 'intake', null, 'th'); // default true
    expect(s).toContain('ผลการคัดกรองอาการ');
    expect(s).toContain('ADAM Scale');
    expect(s).toContain('IIEF-5 Scale');
  });
  it('includeScreening=false — the note path DROPS the ED block, keeps the rest', () => {
    const s = generateClinicalSummary(d, 'intake', null, 'th', false);
    expect(s).not.toContain('ผลการคัดกรองอาการ');
    expect(s).not.toContain('ADAM Scale');
    expect(s).not.toContain('IIEF-5 Scale');
    // the rest of the summary still builds (chief complaint / history present)
    expect(s.length).toBeGreaterThan(0);
  });
  it('EN variant also gated', () => {
    expect(generateClinicalSummary(d, 'intake', null, 'en', true)).toContain('Clinical Screening Results');
    expect(generateClinicalSummary(d, 'intake', null, 'en', false)).not.toContain('Clinical Screening Results');
  });
});

describe('caller wiring', () => {
  const kiosk = readFileSync(path.resolve(process.cwd(), 'src/lib/kioskPatientToCanonical.js'), 'utf8');
  const admin = readFileSync(path.resolve(process.cwd(), 'src/pages/AdminDashboard.jsx'), 'utf8');
  const print = readFileSync(path.resolve(process.cwd(), 'src/components/PrintTemplates.jsx'), 'utf8');

  it('the NOTE builder (kioskPatientToCanonical) passes includeScreening=false', () => {
    expect(kiosk).toMatch(/generateClinicalSummary\(d, formType, customTemplate, summaryLanguage, false\)/);
  });
  it('intake-view (AdminDashboard) + OPD print KEEP screening (no false arg)', () => {
    expect(admin).toMatch(/generateClinicalSummary\(d, formType, viewingSession\.customTemplate, summaryLang\)/);
    expect(admin).not.toMatch(/generateClinicalSummary\([^)]*, false\)/);
    expect(print).not.toMatch(/generateClinicalSummary\([^)]*, false\)/);
  });
});
