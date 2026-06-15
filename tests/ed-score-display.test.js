import { describe, it, expect } from 'vitest';
import { ED_TYPE_META, scoreForType, stripScreeningSection } from '../src/lib/edScoreDisplay.js';

describe('scoreForType (reuses real calculators)', () => {
  it('adam → value/max/positive', () => {
    const r = scoreForType('adam', { adam_1: true, adam_2: true, adam_3: true, adam_6: true });
    expect(r.value).toBe(4); expect(r.max).toBe(10); expect(r.positive).toBe(true);
  });
  it('adam negative when <3 and not Q1/Q7', () => {
    const r = scoreForType('adam', { adam_2: true, adam_3: true });
    expect(r.value).toBe(2); expect(r.positive).toBe(false);
  });
  it('iief → sum / 25', () => {
    const r = scoreForType('iief', { iief_1: '4', iief_2: '4', iief_3: '4', iief_4: '4', iief_5: '3' });
    expect(r.value).toBe(19); expect(r.max).toBe(25); expect(typeof r.text).toBe('string');
  });
  it('mrs → sum / 44', () => {
    const r = scoreForType('mrs', { mrs_1: '2', mrs_2: '1', mrs_3: '1' });
    expect(r.value).toBe(4); expect(r.max).toBe(44);
  });
  it('pe → boolean present', () => {
    expect(scoreForType('pe', { symp_pe: true }).present).toBe(true);
    expect(scoreForType('pe', {}).present).toBe(false);
  });
});

describe('ED_TYPE_META', () => {
  it('has label+max for all 4', () => {
    expect(ED_TYPE_META.adam.max).toBe(10);
    expect(ED_TYPE_META.iief.max).toBe(25);
    expect(ED_TYPE_META.mrs.max).toBe(44);
    expect(ED_TYPE_META.pe.boolean).toBe(true);
  });
});

describe('stripScreeningSection (real generateClinicalSummary format)', () => {
  // sep = '───' (3× U+2500), screening is the LAST block (no trailing content)
  const realTh = [
    'Chief Complaint     : สมรรถภาพทางเพศ',
    '───',
    'ประวัติโรคประจำตัว  : ปฏิเสธโรคประจำตัว',
    'ประวัติการแพ้ยา/อาหาร : ปฏิเสธ',
    'ยาที่ใช้ประจำ       : ไม่มี',
    '───',
    'ผลการคัดกรองอาการ',
    '  อาการหลั่งเร็ว                       : มีอาการ',
    '  ภาวะพร่องฮอร์โมนเพศชาย (ADAM Scale) : 4/10 — เข้าข่ายภาวะพร่องฮอร์โมนเพศชาย',
    '  สมรรถภาพทางเพศ (IIEF-5 Scale)       : 14/25 — เสื่อมระดับปานกลาง',
  ].join('\n');

  it('removes the ED screening block (header + items + preceding sep), keeps the rest', () => {
    const out = stripScreeningSection(realTh);
    expect(out).toContain('Chief Complaint');
    expect(out).toContain('ประวัติโรคประจำตัว');
    expect(out).toContain('ยาที่ใช้ประจำ');
    expect(out).not.toContain('ผลการคัดกรองอาการ');
    expect(out).not.toContain('ADAM Scale');
    expect(out).not.toContain('IIEF-5 Scale');
    // the divider that preceded screening is gone; the CC divider stays
    expect(out.split('───').length - 1).toBe(1);
  });

  it('EN variant — Clinical Screening Results', () => {
    const en = ['Chief Complaint     : ED', '───', 'Current Medications : None', '───',
      'Clinical Screening Results',
      '  Androgen Deficiency (ADAM Scale)        : 4/10 — Positive',
      '  Erectile Function (IIEF-5 Scale)        : 14/25 — Moderate'].join('\n');
    const out = stripScreeningSection(en);
    expect(out).toContain('Current Medications');
    expect(out).not.toContain('Clinical Screening Results');
    expect(out).not.toContain('ADAM Scale');
  });

  it('screening in the MIDDLE with a trailing section → keeps the following section', () => {
    const mid = ['CC: ปวด', '───', 'ผลการคัดกรองอาการ',
      '  ภาวะพร่องฮอร์โมนเพศชาย (ADAM Scale) : 4/10 — x',
      '───', 'แผน: ติดตาม'].join('\n');
    const out = stripScreeningSection(mid);
    expect(out).toContain('CC: ปวด');
    expect(out).toContain('แผน: ติดตาม');
    expect(out).not.toContain('ADAM Scale');
  });

  it('note with NO screening block is unchanged (trimmed)', () => {
    const plain = 'Chief Complaint : ขลิบ\n───\nไม่มีประวัติแพ้';
    expect(stripScreeningSection(plain)).toBe(plain);
  });

  it('null/empty safe', () => {
    expect(stripScreeningSection('')).toBe('');
    expect(stripScreeningSection(null)).toBe('');
    expect(stripScreeningSection(undefined)).toBe('');
  });

  it('a note whose CONTENT merely mentions the screening word is NOT stripped (exact-header match)', () => {
    // adversarial — the word appears inside a value line, not as a standalone header
    const note = 'CC: มาตรวจ ผลการคัดกรองอาการปกติดี ไม่มีปัญหา\nแผน: นัดติดตาม';
    const out = stripScreeningSection(note);
    expect(out).toContain('ผลการคัดกรองอาการปกติดี'); // content preserved — NOT eaten
    expect(out).toContain('แผน: นัดติดตาม');
  });
});
