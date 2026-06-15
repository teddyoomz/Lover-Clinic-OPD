// Task 7 — Rule I full-flow simulate for ED follow-up v2.
// Chains the REAL units end-to-end (NO mocks of the logic under test):
//   buildConfirmInfo → session shape → shouldSupersedeSession (selective delete)
//   → customer submit → buildAssessmentRoundPatch (CF) → deriveRounds → formatRoundDate
import { describe, it, expect } from 'vitest';
import { buildConfirmInfo, formatRoundDate, maskPhone } from '../src/lib/edScoreDisplay.js';
import { shouldSupersedeSession } from '../src/lib/backendClient.js';
import { buildAssessmentRoundPatch } from '../functions/assessmentMaterialize.js';
import { deriveRounds, latestRounds } from '../src/lib/assessmentRoundsCore.js';

const TODAY = '2026-06-15';

describe('ED follow-up v2 — full-flow simulate', () => {
  it('F1: generate → confirmInfo snapshot is correct (R1)', () => {
    const customer = { id: 'LC-26000082', patientData: { prefix: 'นาย', firstName: 'ณรงศักดิ์', lastName: 'เอี่ยมรอด', age: '49', phone: '0872587289' } };
    const ci = buildConfirmInfo(customer);
    expect(ci.name).toContain('ณรงศักดิ์');
    expect(ci.age).toBe('49');
    expect(ci.phoneMasked).toBe('087-•••-7289');
    // the session that would be written carries it
    const session = { formType: 'followup_assessment', types: ['adam'], status: 'pending', branchId: 'BR-A', linkedCustomerId: customer.id, linkedAssessmentRoundId: 'ASMT-1', confirmInfo: ci, patientData: null };
    expect(session.confirmInfo.phoneMasked).toBe('087-•••-7289');
  });

  it('F2: supersede deletes ONLY the matching pending follow-up (R3)', () => {
    const cid = 'LC-1', branch = 'BR-A';
    const sessions = [
      { id: 'S-match-pending', linkedCustomerId: cid, branchId: branch, formType: 'followup_assessment', status: 'pending' },
      { id: 'S-completed', linkedCustomerId: cid, branchId: branch, formType: 'followup_assessment', status: 'completed' }, // already materialized
      { id: 'S-other-branch', linkedCustomerId: cid, branchId: 'BR-B', formType: 'followup_assessment', status: 'pending' },
      { id: 'S-other-cust', linkedCustomerId: 'LC-2', branchId: branch, formType: 'followup_assessment', status: 'pending' },
      { id: 'S-intake', linkedCustomerId: cid, branchId: branch, formType: 'intake', status: 'pending' },
    ];
    const toDelete = sessions.filter((s) => shouldSupersedeSession(s, cid, branch)).map((s) => s.id);
    expect(toDelete).toEqual(['S-match-pending']); // exactly one — completed/other-branch/other-cust/intake survive
  });

  it('F3: customer fills → materialize → round derives a number + today date; intake round keeps its admission date (R4)', () => {
    // intake round (round 1): perf answers + admission date (createdAt fallback)
    const intakePerf = { adam_1: true, adam_2: true, assessmentDate: '2026-05-20' };
    // customer submits the follow-up (no assessmentDate in patientData → CF uses nowISO = today)
    const submittedSession = { patientData: { adam_1: true, iief_1: '3', iief_2: '3', iief_3: '3', iief_4: '3', iief_5: '3' } };
    const patch = buildAssessmentRoundPatch(submittedSession, TODAY);
    expect(patch).not.toBeNull();
    expect(patch.status).toBe('completed');
    expect(patch.assessmentDate).toBe(TODAY);
    // materialized be_assessments round
    const beAssessments = [{ id: 'ASMT-1', status: patch.status, rawAnswers: patch.rawAnswers, assessmentDate: patch.assessmentDate, types: ['adam', 'iief'] }];
    const rounds = deriveRounds(intakePerf, beAssessments);
    expect(rounds.length).toBe(2);                 // intake + 1 follow-up
    expect(rounds[0].round).toBe(1);               // intake first (older date)
    expect(rounds[1].round).toBe(2);               // follow-up second
    // R4 display: intake shows admission date (not today); follow-up shows today + badge
    const fdIntake = formatRoundDate(rounds[0].assessmentDate, TODAY);
    const fdFollow = formatRoundDate(rounds[1].assessmentDate, TODAY);
    expect(fdIntake).toEqual({ text: '20/05/2569', isToday: false });
    expect(fdFollow).toEqual({ text: '15/06/2569', isToday: true });
    // latestRounds (TFP latest-2) — newest first
    const latest2 = latestRounds(intakePerf, beAssessments, 2);
    expect(latest2[0].round).toBe(2);
    expect(formatRoundDate(latest2[0].assessmentDate, TODAY).isToday).toBe(true);
  });

  it('F4: a still-PENDING follow-up round does NOT count (re-generating links never inflates rounds)', () => {
    const intakePerf = { adam_1: true, assessmentDate: '2026-05-20' };
    const beAssessments = [
      { id: 'ASMT-done', status: 'completed', rawAnswers: { adam_1: true }, assessmentDate: TODAY, types: ['adam'] },
      { id: 'ASMT-pending', status: 'pending', rawAnswers: {}, assessmentDate: '', types: ['adam'] }, // a freshly-minted link, not filled
    ];
    const rounds = deriveRounds(intakePerf, beAssessments);
    expect(rounds.length).toBe(2); // intake + the COMPLETED one only; pending hidden
    expect(rounds.some((r) => r.id === 'ASMT-pending')).toBe(false);
  });

  it('F5: blank submit does not materialize a round (no meaningful ED answers)', () => {
    expect(buildAssessmentRoundPatch({ patientData: { firstName: 'x' } }, TODAY)).toBeNull();
  });

  it('F6: privacy — masked phone never exposes the middle digits on the public link', () => {
    expect(maskPhone('0872587289')).toBe('087-•••-7289');
    expect(maskPhone('0872587289')).not.toContain('258');
  });
});
