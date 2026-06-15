// Rule I full-flow simulate — chains the REAL pure helpers across the whole ED
// assessment lifecycle: intake-virtual round 1 → send (pending) → customer fills
// → CF materialize → completed round → delete → renumber. No mounting; pure mirrors.
import { describe, it, expect } from 'vitest';
import { deriveRounds, nextRoundNumber, latestPerType, latestRounds } from '../src/lib/assessmentRoundsCore.js';
import { scoreForType } from '../src/lib/edScoreDisplay.js';
import { buildAssessmentRoundPatch, isMaterializableAssessment } from '../functions/assessmentMaterialize.js';

describe('ED assessment full-flow simulate', () => {
  // A current customer who did ADAM at intake (the AV194/LC-26000082 shape).
  const intakePerf = { adam_1: true, adam_2: true, adam_3: true, adam_6: true, assessmentDate: '2026-05-20' };

  it('F1 — intake-only customer shows round 1 from patientData (ZERO migration)', () => {
    const rounds = deriveRounds(intakePerf, []);
    expect(rounds.length).toBe(1);
    expect(rounds[0].round).toBe(1);
    expect(rounds[0].source).toBe('intake');
    expect(scoreForType('adam', rounds[0].raw)).toMatchObject({ value: 4, positive: true });
    expect(nextRoundNumber(intakePerf, [])).toBe(2); // doctor would send "ครั้งที่ 2"
  });

  it('F2 — doctor sends round 2 → pending be_assessments doc is NOT yet a round', () => {
    const pending = { id: 'ASMT-1', customerId: 'LC-1', status: 'pending', types: ['adam', 'iief'], rawAnswers: {}, assessmentDate: '' };
    const rounds = deriveRounds(intakePerf, [pending]);
    expect(rounds.length).toBe(1); // still just the intake round
    expect(nextRoundNumber(intakePerf, [pending])).toBe(2); // pending doesn't bump the count
  });

  it('F3 — customer fills → CF materializes → round 2 completes with correct scores', () => {
    let assessment = { id: 'ASMT-1', customerId: 'LC-1', status: 'pending', types: ['adam', 'iief'], rawAnswers: {}, assessmentDate: '' };
    // the customer-filled opd_session
    const session = {
      formType: 'followup_ed', linkedAssessmentRoundId: 'ASMT-1',
      patientData: { adam_1: true, adam_3: true, adam_6: true, iief_1: '4', iief_2: '4', iief_3: '4', iief_4: '4', iief_5: '3', assessmentDate: '2026-06-14' },
    };
    expect(isMaterializableAssessment(session)).toBe(true);
    const patch = buildAssessmentRoundPatch(session, '2026-06-15');
    assessment = { ...assessment, ...patch }; // merge (what the CF does)

    const rounds = deriveRounds(intakePerf, [assessment]);
    expect(rounds.length).toBe(2);
    const r2 = rounds[1];
    expect(r2.round).toBe(2);
    expect(r2.assessmentDate).toBe('2026-06-14');
    expect(scoreForType('adam', r2.raw).value).toBe(3);
    expect(scoreForType('iief', r2.raw).value).toBe(19);
    // box/TFP display: latest-per-type + latest-2
    const lpt = latestPerType(intakePerf, [assessment]);
    expect(lpt.adam.round).toBe(2); // newer than intake
    expect(latestRounds(intakePerf, [assessment], 2).map((r) => r.round)).toEqual([2, 1]);
  });

  it('F4 — delete round 2 → renumber (next reverts to 2, no skip)', () => {
    const completed = { id: 'ASMT-1', status: 'completed', types: ['adam'], rawAnswers: { adam_1: true }, assessmentDate: '2026-06-14' };
    expect(nextRoundNumber(intakePerf, [completed])).toBe(3); // before delete: rounds [1,2] → next 3
    const afterDelete = []; // deleteAssessmentRound removes the doc
    expect(deriveRounds(intakePerf, afterDelete).length).toBe(1);
    expect(nextRoundNumber(intakePerf, afterDelete)).toBe(2); // reverts to 2, NOT 4
  });

  it('F5 — multi-type round renders only its types; missing type falls to older round', () => {
    const iiefOnly = { id: 'ASMT-2', status: 'completed', types: ['iief'], assessmentDate: '2026-06-20',
      rawAnswers: { iief_1: '5', iief_2: '5', iief_3: '5', iief_4: '5', iief_5: '5' } };
    const lpt = latestPerType(intakePerf, [iiefOnly]);
    expect(lpt.iief.round).toBe(2); // newest
    expect(lpt.adam.round).toBe(1); // adam only ever in intake → tagged older in the box
  });

  it('F6 — a blank submit does NOT complete the round (no phantom round)', () => {
    const blankSession = { formType: 'followup_ed', linkedAssessmentRoundId: 'ASMT-9', patientData: { adam_1: false } };
    expect(buildAssessmentRoundPatch(blankSession, '2026-06-15')).toBeNull();
  });
});
