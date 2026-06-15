// 2026-06-16 — intake assessmentDate must survive the customer projection
// (was dropped: 0/40 customers had patientData.assessmentDate). AV194-class.
// Contract (Phase 23.0): the canonical/form side is SNAKE_CASE (assessment_date,
// no camelCase leak onto the root doc); the patientData side is camelCase
// (assessmentDate). Mirrors firstname→firstName, visit_reasons→visitReasons.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { kioskPatientToCanonical } from '../src/lib/kioskPatientToCanonical.js';
import { buildPatientDataFromForm, buildFormFromCustomer } from '../src/lib/backendClient.js';

describe('intake assessmentDate preservation (AV194-class)', () => {
  it('kioskPatientToCanonical preserves it as SNAKE assessment_date (no camelCase leak)', () => {
    const canonical = kioskPatientToCanonical({ firstName: 'สมชาย', lastName: 'ใจดี', assessmentDate: '2026-05-20' });
    expect(canonical.assessment_date).toBe('2026-05-20');
    expect('assessmentDate' in canonical).toBe(false); // camelCase must NOT leak onto canonical/root
  });
  it('kioskPatientToCanonical → empty string when none', () => {
    expect(kioskPatientToCanonical({ firstName: 'x' }).assessment_date).toBe('');
  });

  it('buildPatientDataFromForm renames assessment_date → camelCase assessmentDate on patientData', () => {
    const pd = buildPatientDataFromForm({ firstname: 'a', assessment_date: '2026-05-20' });
    expect(pd.assessmentDate).toBe('2026-05-20');
  });
  it('buildPatientDataFromForm does NOT inject a default when absent (no edit re-stamp)', () => {
    const pd = buildPatientDataFromForm({ firstname: 'a' });
    expect('assessmentDate' in pd).toBe(false);
  });

  it('buildFormFromCustomer round-trips it as SNAKE assessment_date from patientData', () => {
    const form = buildFormFromCustomer({ patientData: { firstName: 'a', assessmentDate: '2026-05-20' } });
    expect(form.assessment_date).toBe('2026-05-20');
  });

  it('FULL round-trip: kiosk → canonical → patientData → form → patientData is STABLE', () => {
    const kiosk = { firstName: 'สมชาย', lastName: 'ใจดี', adam_1: true, assessmentDate: '2026-05-20' };
    const canonical = kioskPatientToCanonical(kiosk);
    const pd1 = buildPatientDataFromForm(canonical);
    expect(pd1.assessmentDate).toBe('2026-05-20');
    // simulate a backend edit: customer → form → re-save
    const form = buildFormFromCustomer({ patientData: pd1 });
    const pd2 = buildPatientDataFromForm(form);
    expect(pd2.assessmentDate).toBe('2026-05-20'); // NOT clobbered by an edit
  });

  it('addCustomer stamps assessmentDate=thaiTodayISO() at CREATE when absent (source)', () => {
    const bc = readFileSync('src/lib/backendClient.js', 'utf8');
    expect(bc).toMatch(/const createPatientData = buildPatientDataFromForm\(finalForm\)/);
    expect(bc).toMatch(/if \(!createPatientData\.assessmentDate\) createPatientData\.assessmentDate = thaiTodayISO\(\)/);
    // edit path (updateCustomerFromForm) must NOT have a today-default stamp
    const idx = bc.indexOf('export async function updateCustomerFromForm');
    expect(bc.slice(idx, idx + 3000)).not.toMatch(/assessmentDate = thaiTodayISO\(\)/);
  });
});
