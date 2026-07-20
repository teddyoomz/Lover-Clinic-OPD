// OPD Note Templates (2026-07-05) — Rule I full-flow simulate + source-grep locks
// Chains: template list (builtin + branch) → pick → appendTemplateToCc →
// opd.symptoms → handleSubmit's detail payload carries the CC text.
// Plus source-grep locks: TFP wiring, alignment mechanism (ปุ่มเขียว/ม่วง
// bottom-align — user hard requirement), firestore.rules match, BC1.1 matrix.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  MANDATORY_OPD_NOTE_TEMPLATES,
  appendTemplateToCc,
  normalizeOpdNoteTemplate,
  validateOpdNoteTemplate,
} from '../src/lib/opdNoteTemplateValidation.js';

const TFP_SRC = fs.readFileSync(path.resolve('src/components/TreatmentFormPage.jsx'), 'utf8');
const RULES_SRC = fs.readFileSync(path.resolve('firestore.rules'), 'utf8');
const MENU_SRC = fs.readFileSync(path.resolve('src/components/OpdNoteTemplateMenu.jsx'), 'utf8');
const MATRIX_SRC = fs.readFileSync(path.resolve('tests/branch-collection-coverage.test.js'), 'utf8');

// ─── Pure mirrors of the TFP wiring (lock the real source separately in F4) ──
// Mirror of handleInsertCcTemplate: functional setOpd(prev => ...)
const simulateInsert = (opdState, content) => ({
  ...opdState,
  symptoms: appendTemplateToCc(opdState.symptoms, content),
});
// Mirror of menu composition: builtins first, then branch items
const composeMenuItems = (branchItems) => [...MANDATORY_OPD_NOTE_TEMPLATES, ...branchItems];

describe('F1 — full flow: list → pick → append → opd.symptoms → save payload', () => {
  it('F1.1 pick builtin ตอน CC ว่าง → CC = เนื้อหา template เต็ม → payload มีครบ', () => {
    const branchItems = [{ id: 'OPDT-1', name: 'ปรึกษาผมร่วง', content: 'ผมร่วง : __' }];
    const menu = composeMenuItems(branchItems);
    expect(menu[0].builtin).toBe(true);

    let opd = { symptoms: '', physicalExam: '', diagnosis: '' };
    opd = simulateInsert(opd, menu[0].content);
    expect(opd.symptoms).toBe(MANDATORY_OPD_NOTE_TEMPLATES[0].content);

    // handleSubmit mirror: detail carries opd fields verbatim
    const detail = { ...opd };
    expect(detail.symptoms).toContain('สมรรถภาพทางเพศ');
    expect(detail.symptoms).toContain('-ประวัติผ่าตัด โรคประจำตัว /ยาที่ทานประจำ :');
    expect(detail.physicalExam).toBe(''); // ฟิลด์อื่นไม่ถูกแตะ
  });

  it('F1.2 pick ตอน CC มีข้อความ staff → append ไม่ทับ (Q2=A)', () => {
    let opd = { symptoms: 'ปวดหัวมา 2 วัน' };
    opd = simulateInsert(opd, MANDATORY_OPD_NOTE_TEMPLATES[0].content);
    expect(opd.symptoms.startsWith('ปวดหัวมา 2 วัน\n\n')).toBe(true);
    expect(opd.symptoms).toContain('สมรรถภาพทางเพศ');
  });

  it('F2 ซ้อน 2 templates → ครบทั้งคู่ตามลำดับ', () => {
    const custom = { id: 'OPDT-1', name: 'ผมร่วง', content: 'ผมร่วง\n-ระยะ : __' };
    let opd = { symptoms: '' };
    opd = simulateInsert(opd, MANDATORY_OPD_NOTE_TEMPLATES[0].content);
    opd = simulateInsert(opd, custom.content);
    const idxBuiltin = opd.symptoms.indexOf('สมรรถภาพทางเพศ');
    const idxCustom = opd.symptoms.indexOf('ผมร่วง\n-ระยะ : __');
    expect(idxBuiltin).toBe(0);
    expect(idxCustom).toBeGreaterThan(idxBuiltin);
  });

  it('F3 adversarial: create→normalize→pick round-trip — tab/underscore/Thai ยาวรอดครบ', () => {
    const raw = { name: ' เทส ', content: '\nหัวข้อ\r\n-ก\t\t: ____ นาที \nไม่มี/มี  ' };
    expect(validateOpdNoteTemplate(raw)).toBeNull();
    const stored = normalizeOpdNoteTemplate(raw);
    expect(stored.content).toBe('หัวข้อ\n-ก\t\t: ____ นาที \nไม่มี/มี');
    let opd = { symptoms: 'เดิม' };
    opd = simulateInsert(opd, stored.content);
    expect(opd.symptoms).toBe('เดิม\n\nหัวข้อ\n-ก\t\t: ____ นาที \nไม่มี/มี');
  });

  it('F3-bis lifecycle: edit template แล้ว insert ครั้งใหม่ใช้เนื้อหาใหม่ (สิ่งที่แก้ effect จริง)', () => {
    const v1 = { id: 'OPDT-1', name: 'ก', content: 'เวอร์ชันแรก' };
    let opd = { symptoms: '' };
    opd = simulateInsert(opd, v1.content);
    expect(opd.symptoms).toBe('เวอร์ชันแรก');
    // แก้ template (normalize ใหม่) → รายการใน list เปลี่ยน → insert รอบใหม่ได้เนื้อใหม่
    const v2 = { ...v1, ...normalizeOpdNoteTemplate({ name: 'ก', content: 'เวอร์ชันสอง' }) };
    let opd2 = { symptoms: '' };
    opd2 = simulateInsert(opd2, v2.content);
    expect(opd2.symptoms).toBe('เวอร์ชันสอง');
  });
});

describe('F4 — source-grep: TFP wiring จริงตรงกับ mirror', () => {
  it('F4.1 OpdNoteTemplateMenu render อยู่ใน SectionHeader "OPD Card" children', () => {
    const headerIdx = TFP_SRC.indexOf('title="OPD Card"');
    expect(headerIdx).toBeGreaterThan(-1);
    const closeIdx = TFP_SRC.indexOf('</SectionHeader>', headerIdx);
    const slice = TFP_SRC.slice(headerIdx, closeIdx);
    expect(slice).toContain('<OpdNoteTemplateMenu');
    expect(slice).toContain('onInsert={handleInsertCcTemplate}');
  });

  it('F4.2 handler ใช้ appendTemplateToCc + functional setOpd (กัน stale closure)', () => {
    expect(TFP_SRC).toMatch(/const handleInsertCcTemplate = useCallback\(\(content\) => \{\s*\n\s*setOpd\(prev => \(\{ \.\.\.prev, symptoms: appendTemplateToCc\(prev\.symptoms, content\) \}\)\);/);
  });

  it('F4.3 imports ครบ (V11 pre-flight)', () => {
    expect(TFP_SRC).toContain("import OpdNoteTemplateMenu from './OpdNoteTemplateMenu.jsx';");
    expect(TFP_SRC).toContain("import { appendTemplateToCc } from '../lib/opdNoteTemplateValidation.js';");
  });
});

describe('F5 — alignment lock (ปุ่มเขียว/ม่วง bottom-align — ข้อบังคับจากไฟล์ user)', () => {
  it('F5.1 กลไก CC-grow ยังอยู่: grow={key === \'symptoms\'}', () => {
    expect(TFP_SRC).toContain("grow={key === 'symptoms'}");
  });

  it('F5.2 right column ยังเป็น flex-col + FormSection flex-1 (column-balance เดิม)', () => {
    const rightPanelIdx = TFP_SRC.indexOf('RIGHT PANEL — OPD Card');
    const slice = TFP_SRC.slice(rightPanelIdx, rightPanelIdx + 900);
    expect(slice).toContain('<div className="flex flex-col gap-4">');
    expect(slice).toContain('className="flex-1 flex flex-col"');
  });

  it('F5.3 เมนูอยู่ใน header row เท่านั้น — ไม่ถูก render เป็น block แถวใหม่ใน OPD Card (กันเพิ่มความสูง)', () => {
    // OpdNoteTemplateMenu ปรากฏใน TFP ครั้งเดียว (ใน SectionHeader children)
    const matches = TFP_SRC.match(/<OpdNoteTemplateMenu/g) || [];
    expect(matches).toHaveLength(1);
  });

  it('F5.4 component root ใช้ ml-auto ใน header row (ชิดขวา ไม่ดัน layout)', () => {
    expect(MENU_SRC).toContain('className="relative ml-auto"');
  });
});

describe('F6-F7 — rules + BSA bookkeeping', () => {
  it('F6.1 firestore.rules มี match be_opd_note_templates = isClinicStaff (staff-only)', () => {
    const idx = RULES_SRC.indexOf('match /be_opd_note_templates/{templateId}');
    expect(idx).toBeGreaterThan(-1);
    const slice = RULES_SRC.slice(idx, idx + 200);
    expect(slice).toContain('allow read, write: if isClinicStaff();');
    // อยู่ก่อน be_branches (วางใน master-data cluster)
    expect(slice).not.toContain('allow read, write: if true');
  });

  it('F6.2 Rule B probe #19 ลงทะเบียนแล้ว', () => {
    const ironClad = fs.readFileSync(path.resolve('.claude/rules/01-iron-clad.md'), 'utf8');
    expect(ironClad).toContain('be_opd_note_templates?documentId=test-probe-opdt-');
    // 2026-07-21 repoint: probe #20 (be_line_friends) joined the list on
    // 2026-07-20 NIGHT — assert probe 19 IS in the re-run list without
    // freezing the full enumeration (future probes extend it again).
    expect(ironClad).toMatch(/รัน probe 1, 5, 6, 7, 8, 9, 12, 15, 16, 17, 18, 19(?:, \d+)* ซ้ำ/);
  });

  it('F7 BC1.1 matrix classify เป็น branch-spread', () => {
    expect(MATRIX_SRC).toMatch(/'be_opd_note_templates':\s*\{ scope: 'branch-spread'/);
  });
});
