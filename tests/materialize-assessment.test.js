import { describe, it, expect } from 'vitest';
import { pickPerf, buildAssessmentRoundPatch, isMaterializableAssessment } from '../functions/assessmentMaterialize.js';

describe('pickPerf', () => {
  it('keeps meaningful adam/iief/mrs/symp_pe; drops empty/false/non-perf', () => {
    const pd = {
      firstName: 'A', adam_1: true, adam_2: false, iief_1: '4', iief_2: '', mrs_1: '0',
      symp_pe: true, note: 'x', assessmentDate: '2026-06-14',
    };
    const out = pickPerf(pd);
    expect(out).toEqual({ adam_1: true, iief_1: '4', mrs_1: '0', symp_pe: true });
    expect(out.firstName).toBeUndefined();
    expect(out.adam_2).toBeUndefined(); // false = not meaningful
  });
  it('null/empty safe', () => {
    expect(pickPerf(null)).toEqual({});
    expect(pickPerf({})).toEqual({});
  });
});

describe('buildAssessmentRoundPatch', () => {
  it('completes the round with snapshotted answers + assessmentDate', () => {
    const session = { patientData: { adam_1: true, adam_3: true, adam_6: true, assessmentDate: '2026-06-14' } };
    const patch = buildAssessmentRoundPatch(session, '2026-06-15');
    expect(patch.status).toBe('completed');
    expect(patch.rawAnswers).toEqual({ adam_1: true, adam_3: true, adam_6: true });
    expect(patch.assessmentDate).toBe('2026-06-14'); // pd date wins
  });
  it('falls back to nowISO when no assessmentDate', () => {
    const patch = buildAssessmentRoundPatch({ patientData: { adam_1: true } }, '2026-06-15');
    expect(patch.assessmentDate).toBe('2026-06-15');
  });
  it('returns null for a blank submit (no meaningful perf)', () => {
    expect(buildAssessmentRoundPatch({ patientData: { adam_1: false, firstName: 'A' } }, '2026-06-15')).toBeNull();
    expect(buildAssessmentRoundPatch({}, '2026-06-15')).toBeNull();
  });
});

describe('isMaterializableAssessment', () => {
  it('true for followup + linkedAssessmentRoundId + patientData', () => {
    expect(isMaterializableAssessment({ formType: 'followup_ed', linkedAssessmentRoundId: 'R1', patientData: { adam_1: true } })).toBe(true);
  });
  it('false when not a followup, no round link, or no data', () => {
    expect(isMaterializableAssessment({ formType: 'intake', linkedAssessmentRoundId: 'R1', patientData: {} })).toBe(false);
    expect(isMaterializableAssessment({ formType: 'followup_ed', patientData: { adam_1: true } })).toBe(false);
    expect(isMaterializableAssessment({ formType: 'followup_ed', linkedAssessmentRoundId: 'R1' })).toBe(false);
    expect(isMaterializableAssessment(null)).toBe(false);
  });
});
