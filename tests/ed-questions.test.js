// edQuestions canonical data + buildEdAnswerRows helper (pure unit).
import { describe, it, expect } from 'vitest';
import {
  ADAM_QUESTIONS, IIEF_QUESTIONS, MRS_QUESTIONS, MRS_OPTION_LABELS, PE_QUESTION, buildEdAnswerRows,
} from '../src/lib/edQuestions.js';

describe('edQuestions canonical data', () => {
  it('Q1 question counts', () => {
    expect(ADAM_QUESTIONS).toHaveLength(10);
    expect(IIEF_QUESTIONS).toHaveLength(5);
    expect(MRS_QUESTIONS).toHaveLength(11);
    expect(MRS_OPTION_LABELS).toHaveLength(5);
    expect(PE_QUESTION.key).toBe('symp_pe');
  });
  it('Q2 every IIEF question has 5 options + keys are sequential', () => {
    IIEF_QUESTIONS.forEach((q, i) => { expect(q.key).toBe(`iief_${i + 1}`); expect(q.options).toHaveLength(5); });
    ADAM_QUESTIONS.forEach((q, i) => expect(q.key).toBe(`adam_${i + 1}`));
    MRS_QUESTIONS.forEach((q, i) => expect(q.key).toBe(`mrs_${i + 1}`));
  });
  it('Q3 IIEF options differ per question type (Q1 confidence vs Q2 frequency vs Q4 difficulty)', () => {
    expect(IIEF_QUESTIONS[0].options[0]).toMatch(/ไม่มีเลย/);   // confidence
    expect(IIEF_QUESTIONS[1].options[0]).toMatch(/แทบไม่เคย/);  // frequency
    expect(IIEF_QUESTIONS[3].options[0]).toMatch(/ยากมากที่สุด/); // difficulty
  });
});

describe('buildEdAnswerRows', () => {
  it('A1 adam: truthy → มีอาการ (flagged), else ไม่มี; 10 rows', () => {
    const rows = buildEdAnswerRows('adam', { adam_1: true, adam_7: true });
    expect(rows).toHaveLength(10);
    expect(rows[0]).toMatchObject({ n: 1, question: 'ความต้องการทางเพศลดลง', answer: 'มีอาการ', flagged: true });
    expect(rows[1]).toMatchObject({ n: 2, answer: 'ไม่มี', flagged: false });
    expect(rows[6].answer).toBe('มีอาการ'); // adam_7
  });
  it('A2 iief: value → that question option label; missing/out-of-range → —', () => {
    const rows = buildEdAnswerRows('iief', { iief_1: 3, iief_4: 2, iief_5: 9 });
    expect(rows).toHaveLength(5);
    expect(rows[0].answer).toBe('ปานกลาง (3)');      // iief_1 option[2]
    expect(rows[1].answer).toBe('—');                 // iief_2 missing
    expect(rows[3].answer).toBe('ยากมาก (2)');        // iief_4 option[1]
    expect(rows[4].answer).toBe('—');                 // iief_5 = 9 out of range
  });
  it('A3 iief accepts string-number values', () => {
    expect(buildEdAnswerRows('iief', { iief_1: '4' })[0].answer).toBe('สูง (4)');
  });
  it('A4 mrs: ระดับ N — label; 0 is a real answer (ไม่มีอาการ); undefined → —', () => {
    const rows = buildEdAnswerRows('mrs', { mrs_1: 0, mrs_2: 3 });
    expect(rows).toHaveLength(11);
    expect(rows[0].answer).toBe('ระดับ 0 — ไม่มีอาการ');
    expect(rows[1].answer).toBe('ระดับ 3 — รุนแรง');
    expect(rows[2].answer).toBe('—'); // mrs_3 undefined
  });
  it('A5 pe: single row, present/absent', () => {
    expect(buildEdAnswerRows('pe', { symp_pe: true })).toEqual([{ n: 1, question: PE_QUESTION.th, answer: 'มีอาการ', flagged: true }]);
    expect(buildEdAnswerRows('pe', { symp_pe: false })[0]).toMatchObject({ answer: 'ไม่มีอาการ', flagged: false });
  });
  it('A6 adversarial: null/empty/unknown type', () => {
    expect(buildEdAnswerRows('adam', null)).toHaveLength(10);     // null raw → all "ไม่มี"
    expect(buildEdAnswerRows('adam', null).every((r) => r.answer === 'ไม่มี')).toBe(true);
    expect(buildEdAnswerRows('mrs', { mrs_1: '' })[0].answer).toBe('—'); // empty string → not answered
    expect(buildEdAnswerRows('bogus', {})).toEqual([]);
  });
});
