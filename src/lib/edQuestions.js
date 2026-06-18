// edQuestions.js — canonical ED questionnaire (Rule-of-3 source; text from PatientForm
// adamQuestions/iiefQuestions/mrsQuestions + MRS option labels). PURE, no React.
// New consumer: EDDetailModal (per-question answer detail). The pre-existing inliners
// (PatientForm questionnaire + AdminDashboard render*Section + PrintTemplates) are NOT
// migrated here (follow-up debt) — this is the canonical source for future unification.

export const ADAM_QUESTIONS = [
  { key: 'adam_1', th: 'ความต้องการทางเพศลดลง' },
  { key: 'adam_2', th: 'รู้สึกขาดพลังงาน' },
  { key: 'adam_3', th: 'ความแข็งแรงหรือความทนทานลดลง' },
  { key: 'adam_4', th: 'ส่วนสูงลดลง' },
  { key: 'adam_5', th: 'ซึมเศร้า ความสุขในชีวิตลดลง' },
  { key: 'adam_6', th: 'อารมณ์แปรปรวน หงุดหงิดง่าย' },
  { key: 'adam_7', th: 'การแข็งตัวของอวัยวะเพศลดลง' },
  { key: 'adam_8', th: 'ความสามารถในการเล่นกีฬาหรือออกกำลังกายลดลง' },
  { key: 'adam_9', th: 'ง่วงนอนหลังทานอาหารเย็น' },
  { key: 'adam_10', th: 'ประสิทธิภาพการทำงานลดลง' },
];

// IIEF-5 Likert options differ per question (Q1 confidence / Q2,3,5 frequency / Q4 difficulty).
const IIEF_FREQ = ['แทบไม่เคย / ไม่เคยเลย (1)', 'น้อยครั้ง (น้อยกว่าครึ่ง) (2)', 'บางครั้ง (ประมาณครึ่งหนึ่ง) (3)', 'บ่อยครั้ง (มากกว่าครึ่ง) (4)', 'เกือบทุกครั้ง / ทุกครั้ง (5)'];
export const IIEF_QUESTIONS = [
  { key: 'iief_1', th: 'ท่านมีความมั่นใจว่าสามารถมีอวัยวะเพศแข็งตัวและสอดใส่ได้ มากน้อยเพียงใด?', options: ['น้อยมาก / ไม่มีเลย (1)', 'น้อย (2)', 'ปานกลาง (3)', 'สูง (4)', 'สูงมาก (5)'] },
  { key: 'iief_2', th: 'เมื่อมีการกระตุ้นทางเพศ อวัยวะเพศท่านแข็งตัวพอที่จะสอดใส่ได้บ่อยแค่ไหน?', options: IIEF_FREQ },
  { key: 'iief_3', th: 'เมื่อสอดใส่อวัยวะเพศเข้าไปแล้ว ท่านสามารถคงความแข็งตัวได้บ่อยเพียงใด?', options: IIEF_FREQ },
  { key: 'iief_4', th: 'ระหว่างการมีเพศสัมพันธ์ การคงความแข็งตัวจนเสร็จกิจ ยากมากน้อยแค่ไหน?', options: ['ยากมากที่สุด (1)', 'ยากมาก (2)', 'ยาก (3)', 'ค่อนข้างยาก (4)', 'ไม่ยากเลย (5)'] },
  { key: 'iief_5', th: 'ท่านพึงพอใจกับการมีเพศสัมพันธ์บ่อยแค่ไหน?', options: IIEF_FREQ },
];

export const MRS_QUESTIONS = [
  { key: 'mrs_1', th: 'อาการร้อนวูบวาบ เหงื่อออก' },
  { key: 'mrs_2', th: 'อาการทางหัวใจ (ใจสั่น หัวใจเต้นเร็ว)' },
  { key: 'mrs_3', th: 'ปัญหาการนอนหลับ (นอนไม่หลับ ตื่นกลางดึก)' },
  { key: 'mrs_4', th: 'อารมณ์ซึมเศร้า (เศร้าหมอง หดหู่)' },
  { key: 'mrs_5', th: 'อารมณ์หงุดหงิดง่าย' },
  { key: 'mrs_6', th: 'วิตกกังวล กระวนกระวาย' },
  { key: 'mrs_7', th: 'อ่อนเพลียทั้งร่างกายและจิตใจ (ไม่มีแรง)' },
  { key: 'mrs_8', th: 'ปัญหาทางเพศ (ความต้องการลดลง)' },
  { key: 'mrs_9', th: 'ปัญหาทางเดินปัสสาวะ (ปัสสาวะบ่อย/แสบขัด)' },
  { key: 'mrs_10', th: 'อาการช่องคลอดแห้ง' },
  { key: 'mrs_11', th: 'อาการปวดข้อและกล้ามเนื้อ' },
];
export const MRS_OPTION_LABELS = ['ไม่มีอาการ', 'เล็กน้อย', 'ปานกลาง', 'รุนแรง', 'รุนแรงมากที่สุด'];

export const PE_QUESTION = { key: 'symp_pe', th: 'มีอาการหลั่งเร็ว / หลั่งไวร่วมด้วย' };

// type + raw answer-set → [{ n, question, answer, flagged }] for the detail modal.
// undefined/empty → '—'; mrs 0 → 'ไม่มีอาการ' (a real answer); iief out-of-range → '—'.
// flagged = emphasize (ADAM "มีอาการ" / PE present) for accent styling.
export function buildEdAnswerRows(type, raw) {
  const d = raw || {};
  if (type === 'adam') {
    return ADAM_QUESTIONS.map((q, i) => {
      const yes = !!d[q.key];
      return { n: i + 1, question: q.th, answer: yes ? 'มีอาการ' : 'ไม่มี', flagged: yes };
    });
  }
  if (type === 'iief') {
    return IIEF_QUESTIONS.map((q, i) => {
      const v = Number(d[q.key]);
      const ok = Number.isInteger(v) && v >= 1 && v <= 5;
      return { n: i + 1, question: q.th, answer: ok ? q.options[v - 1] : '—', flagged: false };
    });
  }
  if (type === 'mrs') {
    return MRS_QUESTIONS.map((q, i) => {
      const has = d[q.key] !== undefined && d[q.key] !== null && d[q.key] !== '';
      const v = Number(d[q.key]);
      const ok = has && Number.isInteger(v) && v >= 0 && v <= 4;
      return { n: i + 1, question: q.th, answer: ok ? `ระดับ ${v} — ${MRS_OPTION_LABELS[v]}` : '—', flagged: false };
    });
  }
  if (type === 'pe') {
    return [{ n: 1, question: PE_QUESTION.th, answer: d.symp_pe ? 'มีอาการ' : 'ไม่มีอาการ', flagged: !!d.symp_pe }];
  }
  return [];
}
