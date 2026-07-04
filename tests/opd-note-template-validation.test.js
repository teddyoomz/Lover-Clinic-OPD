// OPD Note Templates (2026-07-05) — pure lib unit tests
// Spec: docs/superpowers/specs/2026-07-05-opd-note-templates-design.html
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  MANDATORY_OPD_NOTE_TEMPLATES,
  validateOpdNoteTemplate,
  normalizeOpdNoteTemplate,
  appendTemplateToCc,
  mintOpdNoteTemplateId,
} from '../src/lib/opdNoteTemplateValidation.js';

describe('A1 — MANDATORY_OPD_NOTE_TEMPLATES (built-in บังคับ)', () => {
  it('A1.1 มี 1 template: สมรรถภาพทางเพศ + shape ครบ', () => {
    expect(MANDATORY_OPD_NOTE_TEMPLATES).toHaveLength(1);
    const t = MANDATORY_OPD_NOTE_TEMPLATES[0];
    expect(t.id).toBe('builtin-sexual-performance');
    expect(t.name).toBe('สมรรถภาพทางเพศ');
    expect(t.builtin).toBe(true);
    expect(typeof t.content).toBe('string');
  });

  it('A1.2 frozen — mutation ไม่มีผล (constant ห้ามแก้)', () => {
    expect(Object.isFrozen(MANDATORY_OPD_NOTE_TEMPLATES)).toBe(true);
    expect(Object.isFrozen(MANDATORY_OPD_NOTE_TEMPLATES[0])).toBe(true);
    expect(() => { MANDATORY_OPD_NOTE_TEMPLATES.push({}); }).toThrow();
  });

  it('A1.3 content verbatim key lines จากไฟล์ .docx', () => {
    const c = MANDATORY_OPD_NOTE_TEMPLATES[0].content;
    expect(c.startsWith('สมรรถภาพทางเพศ\n1.ประวัติทางเพศ')).toBe(true);
    expect(c).toContain('-อาการนำ / ระยะเวลาที่เริ่มมีอาการ');
    expect(c).toContain('- ความแข็งตัว');
    expect(c).toContain('____%');
    expect(c).toContain('-Morning erection');
    expect(c).toContain('____วัน/สัปดาห์');
    expect(c).toContain('- อารมณ์ทางเพศ');
    expect(c).toContain('-หลั่งไว');
    expect(c).toContain('2.อาการทางฮอร์โมน');
    expect(c).toContain('-นอนหลับ');
    expect(c).toContain('-หยุดหายใจขณะนอนหลับ : ไม่มี/มี');
    expect(c).toContain('-อารมณ์ ปกติ/สวิง/หงุดหงิดงาย/แปรปรวน : ไม่มี/มี');
    expect(c).toContain('- เบื่อหนาย ไม่มีแรง');
    expect(c).toContain('-น้ำหนักเพิ่ม');
    expect(c).toContain('-ออกกำลังกาย');
    expect(c).toContain('เท่าเดิม/ลดลง/ไม่เคยออก');
    expect(c).toContain('3.ประวัติส่วนตัว');
    expect(c).toContain('-ดื่มแอลกอฮอล์');
    expect(c).toContain('-บุหรี่/กัญชา');
    expect(c.endsWith('-ประวัติผ่าตัด โรคประจำตัว /ยาที่ทานประจำ :')).toBe(true);
  });

  it('A1.4 tab columns คงไว้ (จัดคอลัมน์แบบ Word)', () => {
    expect(MANDATORY_OPD_NOTE_TEMPLATES[0].content).toMatch(/\t/);
  });
});

describe('A2 — validateOpdNoteTemplate', () => {
  it('A2.1 null / undefined / array / non-object → [data, msg]', () => {
    expect(validateOpdNoteTemplate(null)?.[0]).toBe('data');
    expect(validateOpdNoteTemplate(undefined)?.[0]).toBe('data');
    expect(validateOpdNoteTemplate([])?.[0]).toBe('data');
    expect(validateOpdNoteTemplate('x')?.[0]).toBe('data');
  });

  it('A2.2 ชื่อว่าง / whitespace → [name, Thai msg]', () => {
    expect(validateOpdNoteTemplate({ name: '', content: 'x' })).toEqual(['name', 'กรุณากรอกชื่อ template']);
    expect(validateOpdNoteTemplate({ name: '   ', content: 'x' })?.[0]).toBe('name');
    expect(validateOpdNoteTemplate({ content: 'x' })?.[0]).toBe('name');
  });

  it('A2.3 เนื้อหาว่าง / whitespace → [content, Thai msg]', () => {
    expect(validateOpdNoteTemplate({ name: 'x', content: '' })).toEqual(['content', 'กรุณากรอกเนื้อหา template']);
    expect(validateOpdNoteTemplate({ name: 'x', content: ' \n\t ' })?.[0]).toBe('content');
  });

  it('A2.4 ครบ → null (รวม Thai + emoji + ยาวถึงเพดานพอดี)', () => {
    expect(validateOpdNoteTemplate({ name: 'ปรึกษาผมร่วง', content: 'หัวข้อ\n-รายการ : ____' })).toBeNull();
    expect(validateOpdNoteTemplate({ name: '😀', content: 'x'.repeat(10000) })).toBeNull(); // = cap พอดี ผ่าน
  });

  it('A2.5 (Hunt R2-B hardening) เกินเพดาน → [field, Thai msg] — กัน treatment doc ชน 1MB ทีหลัง', () => {
    const nameFail = validateOpdNoteTemplate({ name: 'ก'.repeat(101), content: 'x' });
    expect(nameFail?.[0]).toBe('name');
    expect(nameFail?.[1]).toContain('ยาวเกินไป');
    const contentFail = validateOpdNoteTemplate({ name: 'ก', content: 'x'.repeat(10001) });
    expect(contentFail?.[0]).toBe('content');
    expect(contentFail?.[1]).toContain('ยาวเกินไป');
    // ขอบพอดีผ่านทั้งคู่
    expect(validateOpdNoteTemplate({ name: 'ก'.repeat(100), content: 'x'.repeat(10000) })).toBeNull();
  });
});

describe('A3 — normalizeOpdNoteTemplate (V14: no undefined leaves)', () => {
  const walkNoUndefined = (obj, trail = '') => {
    for (const [k, v] of Object.entries(obj)) {
      expect(v, `${trail}.${k} must not be undefined`).not.toBeUndefined();
      if (v && typeof v === 'object') walkNoUndefined(v, `${trail}.${k}`);
    }
  };

  it('A3.1 trims name; CRLF → LF; ตัด blank หัว + trailing ws; tab ภายในคงไว้', () => {
    const out = normalizeOpdNoteTemplate({ name: '  ชื่อ  ', content: '\n\nหัว\r\n-a\tb : __  \n\n' });
    expect(out.name).toBe('ชื่อ');
    expect(out.content).toBe('หัว\n-a\tb : __');
  });

  it('A3.2 empty/missing input → empty strings (ไม่ undefined)', () => {
    walkNoUndefined(normalizeOpdNoteTemplate({}));
    walkNoUndefined(normalizeOpdNoteTemplate());
    walkNoUndefined(normalizeOpdNoteTemplate({ name: null, content: undefined }));
    expect(normalizeOpdNoteTemplate({}).name).toBe('');
  });

  it('A3.3 numeric / object coerced เป็น string', () => {
    expect(normalizeOpdNoteTemplate({ name: 123, content: 456 }).name).toBe('123');
  });
});

describe('A4 — appendTemplateToCc (Q2=A)', () => {
  const T = 'สมรรถภาพทางเพศ\n1.ประวัติทางเพศ';

  it('A4.1 CC ว่าง → แทนที่ตรงๆ', () => {
    expect(appendTemplateToCc('', T)).toBe(T);
    expect(appendTemplateToCc(null, T)).toBe(T);
    expect(appendTemplateToCc(undefined, T)).toBe(T);
  });

  it('A4.2 CC whitespace-only → แทนที่ตรงๆ (ไม่เหลือ ws ขยะนำหน้า)', () => {
    expect(appendTemplateToCc('   \n\t ', T)).toBe(T);
  });

  it('A4.3 CC มีข้อความ → เดิม + \\n\\n + template', () => {
    expect(appendTemplateToCc('ปวดหัว 2 วัน', T)).toBe('ปวดหัว 2 วัน\n\n' + T);
  });

  it('A4.4 trailing whitespace/newlines ของเดิม collapse เข้า separator', () => {
    expect(appendTemplateToCc('ปวดหัว\n\n\n', T)).toBe('ปวดหัว\n\n' + T);
    expect(appendTemplateToCc('ปวดหัว   ', T)).toBe('ปวดหัว\n\n' + T);
  });

  it('A4.5 template ว่าง → คืนค่าเดิมไม่แตะ', () => {
    expect(appendTemplateToCc('เดิม', '')).toBe('เดิม');
    expect(appendTemplateToCc('เดิม', null)).toBe('เดิม');
  });

  it('A4.6 ซ้อน 2 templates → ทั้งคู่ครบตามลำดับ', () => {
    const once = appendTemplateToCc('', T);
    const twice = appendTemplateToCc(once, 'อีกอัน');
    expect(twice).toBe(T + '\n\nอีกอัน');
  });

  it('A4.7 adversarial: Thai + emoji + 10K chars + tabs รอดครบ', () => {
    const big = '😀ก'.repeat(5000) + '\tจบ';
    expect(appendTemplateToCc('cc', big)).toBe('cc\n\n' + big);
  });
});

describe('A5 — mintOpdNoteTemplateId (Rule C2)', () => {
  it('A5.1 shape OPDT-{ts}-{16 hex}', () => {
    expect(mintOpdNoteTemplateId()).toMatch(/^OPDT-\d+-[0-9a-f]{16}$/);
  });

  it('A5.2 1000 ids unique', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => mintOpdNoteTemplateId()));
    expect(ids.size).toBe(1000);
  });

  it('A5.3 source-grep: ไม่ใช้ Math.random (crypto.getRandomValues เท่านั้น)', () => {
    const src = fs.readFileSync(path.resolve('src/lib/opdNoteTemplateValidation.js'), 'utf8');
    expect(src).not.toMatch(/Math\.random/);
    expect(src).toMatch(/crypto\.getRandomValues/);
  });
});
