// ─── Document Template validation — Phase 14.1 ────────────────────────────
// ONE collection `be_document_templates` backs all 13 ProClinic document
// variants (6 medical certificates + fit-to-fly + medicine-label + 4
// system templates + patient-referral). A `docType` discriminator selects
// the render-time layout. Staff CRUD the template HTML + fields; a shared
// print engine fills placeholders and prints.
//
// Rule H: OUR data in OUR Firestore — ProClinic sync is seed-only for the
// medicine-label preset collection (be_medicine_labels, shipped Phase 14.x).
//
// Shape (validated):
//   templateId: 'DOC-TMPL-<crypto-hex>'
//   docType:    enum DOC_TYPES
//   name:       Thai human-readable name (visible in picker)
//   language:   'th' | 'en' | 'bilingual'
//   paperSize:  'A4' | 'A5' | 'label-57x32' (medicine label size)
//   htmlTemplate: string — body HTML with {{placeholder}} tokens
//   fields:     [{ key, label, type: 'text'|'textarea'|'date'|'number', required }]
//   isActive:   boolean — inactive templates hidden from picker
//   isSystemDefault: boolean — seed-created, cannot delete (only edit)
//   createdAt / updatedAt — ISO strings

export const DOC_TYPES = Object.freeze([
  'medical-certificate',
  'medical-certificate-for-driver-license',
  'medical-opinion',
  'physical-therapy-certificate',
  'thai-traditional-medicine-medical-certificate',
  'chinese-traditional-medicine-medical-certificate',
  'fit-to-fly',
  'medicine-label',
  'chart',
  'consent',
  'treatment',
  'sale-cancelation',
  'patient-referral',
]);

export const DOC_TYPE_LABELS = Object.freeze({
  'medical-certificate':                                'ใบรับรองแพทย์ (ทั่วไป)',
  'medical-certificate-for-driver-license':             'ใบรับรองแพทย์ทำใบขับขี่',
  'medical-opinion':                                    'ความเห็นแพทย์',
  'physical-therapy-certificate':                       'ใบรับรองกายภาพบำบัด',
  'thai-traditional-medicine-medical-certificate':      'ใบรับรองแพทย์แผนไทย',
  'chinese-traditional-medicine-medical-certificate':   'ใบรับรองแพทย์แผนจีน',
  'fit-to-fly':                                         'ใบรับรอง Fit-to-fly',
  'medicine-label':                                     'ฉลากยา',
  'chart':                                              'เทมเพลต Chart',
  'consent':                                            'เทมเพลตความยินยอม (Consent)',
  'treatment':                                          'เทมเพลตการรักษา',
  'sale-cancelation':                                   'เทมเพลตยกเลิกการขาย',
  'patient-referral':                                   'ใบส่งตัวผู้ป่วย',
});

export const LANGUAGES = Object.freeze(['th', 'en', 'bilingual']);
export const PAPER_SIZES = Object.freeze(['A4', 'A5', 'label-57x32']);

export const FIELD_TYPES = Object.freeze(['text', 'textarea', 'date', 'number', 'select']);

export const NAME_MAX_LENGTH = 200;
export const HTML_MAX_LENGTH = 50000; // ~50KB — plenty for any single-page cert
export const FIELD_KEY_MAX_LENGTH = 60;
export const MAX_FIELDS = 50;
export const MAX_TOGGLES = 10;
// Phase 14.2 — schema version. Bump when seed templates change so the
// re-seed mechanism (seedDocumentTemplatesIfNewer) can detect drift and
// upgrade existing system-default templates without losing user edits.
export const SCHEMA_VERSION = 2;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FIELD_KEY_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function validateDocumentTemplate(form, opts = {}) {
  const strict = !!opts.strict;
  if (!form || typeof form !== 'object' || Array.isArray(form)) return ['form', 'missing form'];

  if (!DOC_TYPES.includes(form.docType)) return ['docType', 'docType ไม่ถูกต้อง'];

  if (typeof form.name !== 'string' || !form.name.trim()) return ['name', 'กรุณาระบุชื่อเทมเพลต'];
  if (form.name.length > NAME_MAX_LENGTH) return ['name', `ชื่อเกิน ${NAME_MAX_LENGTH} ตัวอักษร`];

  if (!LANGUAGES.includes(form.language)) return ['language', 'ภาษาไม่ถูกต้อง'];
  if (!PAPER_SIZES.includes(form.paperSize)) return ['paperSize', 'ขนาดกระดาษไม่ถูกต้อง'];

  if (typeof form.htmlTemplate !== 'string') return ['htmlTemplate', 'htmlTemplate ต้องเป็น string'];
  if (strict && !form.htmlTemplate.trim()) return ['htmlTemplate', 'กรุณาระบุเนื้อหาเทมเพลต'];
  if (form.htmlTemplate.length > HTML_MAX_LENGTH) {
    return ['htmlTemplate', `เทมเพลตเกิน ${HTML_MAX_LENGTH} ตัวอักษร`];
  }

  // Fields validation
  if (form.fields !== undefined && form.fields !== null) {
    if (!Array.isArray(form.fields)) return ['fields', 'fields ต้องเป็น array'];
    if (form.fields.length > MAX_FIELDS) return ['fields', `มีได้สูงสุด ${MAX_FIELDS} ฟิลด์`];
    const seenKeys = new Set();
    for (let i = 0; i < form.fields.length; i++) {
      const f = form.fields[i];
      if (!f || typeof f !== 'object') return [`fields[${i}]`, 'field item ผิดรูปแบบ'];
      if (typeof f.key !== 'string' || !f.key.trim()) return [`fields[${i}].key`, 'field key ว่าง'];
      if (f.key.length > FIELD_KEY_MAX_LENGTH) return [`fields[${i}].key`, `field key เกิน ${FIELD_KEY_MAX_LENGTH}`];
      if (!FIELD_KEY_RE.test(f.key)) return [`fields[${i}].key`, 'field key รับเฉพาะ a-z A-Z 0-9 _'];
      if (seenKeys.has(f.key)) return [`fields[${i}].key`, `field key "${f.key}" ซ้ำ`];
      seenKeys.add(f.key);
      if (typeof f.label !== 'string') return [`fields[${i}].label`, 'field label ต้องเป็น string'];
      if (!FIELD_TYPES.includes(f.type)) return [`fields[${i}].type`, 'field type ไม่ถูกต้อง'];
    }
  }

  if (form.isActive != null && typeof form.isActive !== 'boolean') {
    return ['isActive', 'isActive ต้องเป็น boolean'];
  }
  if (form.isSystemDefault != null && typeof form.isSystemDefault !== 'boolean') {
    return ['isSystemDefault', 'isSystemDefault ต้องเป็น boolean'];
  }

  // Phase 14.2 — toggle schema validation. Each toggle is a print-time
  // checkbox that gates a {{#if key}}...{{/if}} block in htmlTemplate.
  if (form.toggles !== undefined && form.toggles !== null) {
    if (!Array.isArray(form.toggles)) return ['toggles', 'toggles ต้องเป็น array'];
    if (form.toggles.length > MAX_TOGGLES) return ['toggles', `มีได้สูงสุด ${MAX_TOGGLES} toggles`];
    const seen = new Set();
    for (let i = 0; i < form.toggles.length; i++) {
      const t = form.toggles[i];
      if (!t || typeof t !== 'object') return [`toggles[${i}]`, 'toggle item ผิดรูปแบบ'];
      if (typeof t.key !== 'string' || !t.key.trim()) return [`toggles[${i}].key`, 'toggle key ว่าง'];
      if (!FIELD_KEY_RE.test(t.key)) return [`toggles[${i}].key`, 'toggle key รับเฉพาะ a-z A-Z 0-9 _'];
      if (seen.has(t.key)) return [`toggles[${i}].key`, `toggle key "${t.key}" ซ้ำ`];
      seen.add(t.key);
      if (typeof t.labelTh !== 'string' || !t.labelTh.trim()) return [`toggles[${i}].labelTh`, 'toggle labelTh ว่าง'];
    }
  }

  if (form.createdAt && typeof form.createdAt === 'string' && form.createdAt.includes('-')) {
    const datePart = form.createdAt.slice(0, 10);
    if (!ISO_DATE_RE.test(datePart)) return ['createdAt', 'createdAt ISO format ไม่ถูกต้อง'];
  }

  return null;
}

export function emptyDocumentTemplateForm(docType = 'medical-certificate') {
  return {
    docType,
    name: DOC_TYPE_LABELS[docType] || '',
    language: 'th',
    paperSize: docType === 'medicine-label' ? 'label-57x32' : 'A4',
    htmlTemplate: '',
    fields: [],
    toggles: [],
    isActive: true,
    isSystemDefault: false,
    schemaVersion: SCHEMA_VERSION,
  };
}

export function normalizeDocumentTemplate(form) {
  const trim = (v) => typeof v === 'string' ? v.trim() : '';
  const safeFields = Array.isArray(form.fields)
    ? form.fields
        .filter(f => f && typeof f === 'object')
        .map(f => {
          // Build field object WITHOUT undefined values — Firestore setDoc()
          // rejects `undefined` (caught 2026-04-25 during seed: "Unsupported
          // field value: undefined"). Only include `options` when it's a
          // real array; only include `placeholder` when non-empty.
          const out = {
            key: trim(f.key),
            label: trim(f.label),
            type: FIELD_TYPES.includes(f.type) ? f.type : 'text',
            required: !!f.required,
          };
          if (Array.isArray(f.options) && f.options.length > 0) {
            out.options = f.options.map(String);
          }
          const ph = trim(f.placeholder);
          if (ph) out.placeholder = ph;
          return out;
        })
        .filter(f => f.key)
    : [];
  // Phase 14.2 — normalize toggles same way (no undefined leaks).
  const safeToggles = Array.isArray(form.toggles)
    ? form.toggles
        .filter(t => t && typeof t === 'object')
        .map(t => {
          const out = {
            key: trim(t.key),
            labelTh: trim(t.labelTh),
            defaultOn: !!t.defaultOn,
          };
          const labelEn = trim(t.labelEn);
          if (labelEn) out.labelEn = labelEn;
          return out;
        })
        .filter(t => t.key && t.labelTh)
    : [];
  return {
    ...form,
    docType: DOC_TYPES.includes(form.docType) ? form.docType : 'medical-certificate',
    name: trim(form.name) || DOC_TYPE_LABELS[form.docType] || '',
    language: LANGUAGES.includes(form.language) ? form.language : 'th',
    paperSize: PAPER_SIZES.includes(form.paperSize) ? form.paperSize : 'A4',
    htmlTemplate: typeof form.htmlTemplate === 'string' ? form.htmlTemplate : '',
    fields: safeFields,
    toggles: safeToggles,
    isActive: form.isActive !== false,
    isSystemDefault: !!form.isSystemDefault,
    schemaVersion: typeof form.schemaVersion === 'number' ? form.schemaVersion : SCHEMA_VERSION,
  };
}

export function generateDocumentTemplateId(docType = 'generic') {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    const slug = String(docType).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'generic';
    return `DOC-TMPL-${slug}-${hex}`;
  }
  throw new Error('crypto.getRandomValues unavailable');
}

/**
 * Extract placeholder keys from an HTML template. Returns unique, in-order
 * list of `{{key}}` tokens. Used by the print engine to warn if a required
 * field is referenced but not present in the form values — and by the CRUD
 * UI to suggest fields to add.
 */
export function extractTemplatePlaceholders(html) {
  if (typeof html !== 'string') return [];
  const set = new Set();
  const re = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
  let m;
  while ((m = re.exec(html)) !== null) set.add(m[1]);
  return Array.from(set);
}

/* ─── 13 seed templates — replicated from ProClinic 2026-04-25 ─────────────
 *
 * Triangle Rule F-bis: every template was inspected on trial.proclinicth.com
 * via opd.js look + intel before authoring. Layout matches ProClinic to
 * pixel-readable fidelity — only clinic identity (name/address/phone/license)
 * is swapped via {{placeholders}}.
 *
 * Common toggles per ProClinic (top-right of every cert page):
 *  - showCertNumber:        แสดงเลขที่ใบรับรอง (default off)
 *  - showPatientSignature:  แสดงลายเซ็นคนไข้ (default off)
 *  - language:              TH / EN / bilingual switch (handled separately
 *                           via language context + {{#lang}} blocks)
 *
 * Print engine supports {{#if key}}...{{/if}}, {{#unless key}}...{{/unless}},
 * and {{#lang th}}...{{/lang}} / {{#lang en}}...{{/lang}} for conditional
 * blocks. Documents/Modal expose toggle UI before fill-form.
 */

// Shared header — clinic letterhead. Logo placeholder removed (URLs from
// clinic_settings.logoUrl can be added in future). Address + license + tax
// ID surface from clinic settings (nullable; empty lines stay blank).
const HEADER_CLINIC = `
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
    <div>
      <div style="font-weight:bold;font-size:18px">{{clinicName}}</div>
      {{#lang en}}<div style="font-size:13px">{{clinicNameEn}}</div>{{/lang}}
      <div style="font-size:11px;color:#444;margin-top:2px">{{clinicAddress}}</div>
      {{#lang en}}<div style="font-size:11px;color:#444">{{clinicAddressEn}}</div>{{/lang}}
      <div style="font-size:11px;color:#444">โทร. {{clinicPhone}}{{#if clinicLicenseNo}} &nbsp; เลขที่ใบอนุญาต: {{clinicLicenseNo}}{{/if}}</div>
    </div>
  </div>
  <hr style="border:0;border-top:1px solid #000;margin:6px 0 14px 0" />
`;

// Common section-1 patient self-declaration block — shared by 3 medical
// certificates that have it (general / driver-license / fit-to-fly extended).
const SECTION_1_PATIENT_DECLARATION = `
  <h4 style="margin:14px 0 8px 0">ส่วนที่ 1 ของผู้ขอรับใบรับรองสุขภาพ</h4>
  <div style="margin-bottom:6px"><strong>ข้าพเจ้า:</strong> <span style="display:inline-block;border-bottom:1px dotted #000;min-width:240px;padding:0 6px">{{customerName}}</span> &nbsp; <strong>หมายเลขบัตรประชาชน:</strong> <span style="display:inline-block;border-bottom:1px dotted #000;min-width:170px;padding:0 6px">{{nationalId}}</span></div>
  <div style="margin-bottom:6px"><strong>ที่อยู่ (ที่ติดต่อได้):</strong> <span style="display:inline-block;border-bottom:1px dotted #000;min-width:540px;padding:0 6px">{{patientAddress}}</span></div>
  <div style="margin:10px 0 6px 0">ข้าพเจ้าขอรับใบรับรองสุขภาพโดยมีประวัติสุขภาพดังนี้:</div>
  <div style="margin:4px 0;display:flex"><span style="min-width:240px">1. โรคประจำตัว</span><span>{{#if hasChronicDisease}}☑{{/if}}{{#unless hasChronicDisease}}☐{{/unless}} ไม่มี &nbsp; {{#if hasChronicDisease}}☑{{/if}}{{#unless hasChronicDisease}}☐{{/unless}} มี ระบุ: {{chronicDisease}}</span></div>
  <div style="margin:4px 0;display:flex"><span style="min-width:240px">2. อุบัติเหตุและผ่าตัด</span><span>{{#if hasAccidents}}☑{{/if}}{{#unless hasAccidents}}☐{{/unless}} ไม่มี &nbsp; {{#if hasAccidents}}☑{{/if}}{{#unless hasAccidents}}☐{{/unless}} มี ระบุ: {{accidentsDetails}}</span></div>
  <div style="margin:4px 0;display:flex"><span style="min-width:240px">3. เคยเข้ารับการรักษาในโรงพยาบาล</span><span>{{#if hasHospitalized}}☑{{/if}}{{#unless hasHospitalized}}☐{{/unless}} ไม่มี &nbsp; {{#if hasHospitalized}}☑{{/if}}{{#unless hasHospitalized}}☐{{/unless}} มี ระบุ: {{hospitalizedDetails}}</span></div>
  <div style="margin:4px 0;display:flex"><span style="min-width:240px">4. โรคลมชัก*</span><span>{{#if hasEpilepsy}}☑{{/if}}{{#unless hasEpilepsy}}☐{{/unless}} ไม่มี &nbsp; {{#if hasEpilepsy}}☑{{/if}}{{#unless hasEpilepsy}}☐{{/unless}} มี ระบุ: {{epilepsyDetails}}</span></div>
  <div style="margin:4px 0">5. ประวัติอื่นที่สำคัญ {{otherHistory}}</div>
  {{#if showPatientSignature}}
  <div style="margin-top:14px;display:flex;justify-content:space-between">
    <div>ลงชื่อ <span style="display:inline-block;border-bottom:1px dotted #000;min-width:200px"></span></div>
    <div>วัน/เดือน/ปี: {{today}}</div>
  </div>
  <div style="font-size:10px;color:#a00;margin-top:4px">* ในกรณีที่เด็กไม่สามารถรับรองตนเองได้ ให้ผู้ปกครองลงนามรับรองแทน</div>
  {{/if}}
`;

// Common doctor's section-2 footer (with signature block).
const SECTION_2_DOCTOR_BLOCK = `
  <h4 style="margin:18px 0 8px 0">ส่วนที่ 2 ของแพทย์</h4>
  <div style="margin-bottom:6px"><strong>สถานที่ตรวจ:</strong> {{clinicAddress}} &nbsp; <strong>วัน/เดือน/ปี:</strong> {{today}}</div>
  <div style="margin-bottom:6px"><strong>ข้าพเจ้า นายแพทย์/แพทย์หญิง:</strong> {{doctorName}} &nbsp; <strong>ใบอนุญาตประกอบวิชาชีพเวชกรรมเลขที่:</strong> {{doctorLicenseNo}}</div>
  <div style="margin-bottom:6px"><strong>สถานที่ประกอบวิชาชีพเวชกรรม:</strong> {{clinicName}} &nbsp; <strong>ได้ตรวจร่างกาย:</strong> {{customerName}}</div>
  <div style="margin-top:10px;font-weight:bold">มีรายละเอียดดังนี้:</div>
  <div style="margin:8px 0;min-height:50px;border-bottom:1px dotted #000">{{findings}}</div>
  <div style="margin:8px 0"><strong>การวินิจฉัย:</strong> {{diagnosis}}</div>
  {{#if recommendation}}<div style="margin:8px 0"><strong>คำแนะนำ:</strong> {{recommendation}}</div>{{/if}}
  {{#if restDays}}<div style="margin:8px 0">ให้หยุดพักรักษาตัวเป็นเวลา <strong>{{restDays}}</strong> วัน ตั้งแต่วันที่ {{restFrom}} ถึง {{restTo}}</div>{{/if}}
`;

const DOCTOR_SIGNATURE = `
  <div style="margin-top:32px;text-align:right">
    <div>ลงชื่อ <span style="display:inline-block;border-bottom:1px dotted #000;min-width:200px"></span> {{#lang en}}/ Sign{{/lang}}</div>
    <div style="margin-top:2px">( {{doctorName}} )</div>
    <div>{{#lang en}}Date{{/lang}}{{#lang th}}วันที่{{/lang}} {{today}}</div>
  </div>
`;

const COMMON_TOGGLES = [
  { key: 'showCertNumber',       labelTh: 'แสดงเลขที่ใบรับรอง', labelEn: 'Show certificate number', defaultOn: false },
  { key: 'showPatientSignature', labelTh: 'แสดงลายเซ็นคนไข้',    labelEn: 'Show patient signature',  defaultOn: false },
];

const CERT_NUMBER_LINE = `
  {{#if showCertNumber}}
  <div style="display:flex;justify-content:space-between;margin:10px 0">
    <div><strong>เลขที่:</strong> <span style="display:inline-block;border-bottom:1px dotted #000;min-width:160px;padding:0 6px">{{certNumber}}</span></div>
    <div><strong>วันที่รักษา:</strong> <span style="display:inline-block;border-bottom:1px dotted #000;min-width:160px;padding:0 6px">{{today}}</span></div>
  </div>
  {{/if}}
  {{#unless showCertNumber}}
  <div style="text-align:right;margin:10px 0"><strong>วันที่รักษา:</strong> <span style="display:inline-block;border-bottom:1px dotted #000;min-width:160px;padding:0 6px">{{today}}</span></div>
  {{/unless}}
`;

// Common cert-page top-toggle bar — replicated from ProClinic.
// Renders as a hint at top of the page when previewing in print engine.
const TOGGLE_HINT_TOP = `
  {{#if showCertNumber}}{{/if}}{{#unless showCertNumber}}{{/unless}}
`;

const SECTION_FILL_LINE = (label, key) => `
  <div style="margin:6px 0"><strong>${label}:</strong> <span style="display:inline-block;border-bottom:1px dotted #000;min-width:340px;padding:0 6px">{{${key}}}</span></div>
`;

const COMMON_CERT_FIELDS = [
  { key: 'certNumber',      label: 'เลขที่ใบรับรอง',     type: 'text' },
  { key: 'patientAddress',  label: 'ที่อยู่ผู้ป่วย',      type: 'textarea' },
  { key: 'doctorName',      label: 'แพทย์ผู้ตรวจ',       type: 'text', required: true },
  { key: 'doctorLicenseNo', label: 'เลขใบอนุญาตแพทย์',   type: 'text' },
  { key: 'findings',        label: 'มีรายละเอียดดังนี้',  type: 'textarea', required: true },
  { key: 'diagnosis',       label: 'การวินิจฉัย',         type: 'text', required: true },
  { key: 'recommendation',  label: 'คำแนะนำ',            type: 'textarea' },
  { key: 'restDays',        label: 'จำนวนวันพัก',         type: 'number' },
  { key: 'restFrom',        label: 'พักตั้งแต่',           type: 'date' },
  { key: 'restTo',          label: 'ถึง',                 type: 'date' },
];

const COMMON_HISTORY_FIELDS = [
  { key: 'hasChronicDisease',  label: 'มีโรคประจำตัว (boolean)', type: 'select', options: ['', 'true', 'false'] },
  { key: 'chronicDisease',     label: 'รายละเอียดโรคประจำตัว',    type: 'text' },
  { key: 'hasAccidents',       label: 'มีอุบัติเหตุ/ผ่าตัด (boolean)', type: 'select', options: ['', 'true', 'false'] },
  { key: 'accidentsDetails',   label: 'รายละเอียดอุบัติเหตุ',     type: 'text' },
  { key: 'hasHospitalized',    label: 'เคยรักษาในรพ. (boolean)', type: 'select', options: ['', 'true', 'false'] },
  { key: 'hospitalizedDetails',label: 'รายละเอียด',                type: 'text' },
  { key: 'hasEpilepsy',        label: 'มีโรคลมชัก (boolean)',     type: 'select', options: ['', 'true', 'false'] },
  { key: 'epilepsyDetails',    label: 'รายละเอียดโรคลมชัก',       type: 'text' },
  { key: 'otherHistory',       label: 'ประวัติอื่น',              type: 'textarea' },
];

export const SEED_TEMPLATES = Object.freeze([
  {
    docType: 'medical-certificate',
    name: 'ใบรับรองแพทย์ (ทั่วไป)',
    language: 'th',
    paperSize: 'A4',
    htmlTemplate: HEADER_CLINIC + `
      <h2 style="text-align:center;margin:16px 0;letter-spacing:0.05em">ใบรับรองแพทย์</h2>
      ${CERT_NUMBER_LINE}
      ${SECTION_1_PATIENT_DECLARATION}
      ${SECTION_2_DOCTOR_BLOCK}
    ` + DOCTOR_SIGNATURE,
    fields: [...COMMON_CERT_FIELDS, ...COMMON_HISTORY_FIELDS],
    toggles: COMMON_TOGGLES,
  },
  {
    docType: 'medical-certificate-for-driver-license',
    name: 'ใบรับรองแพทย์ (สำหรับทำใบอนุญาตขับขี่)',
    language: 'th',
    paperSize: 'A4',
    htmlTemplate: HEADER_CLINIC + `
      <h2 style="text-align:center;margin:16px 0">ใบรับรองแพทย์ (สำหรับทำใบอนุญาตขับขี่)</h2>
      ${CERT_NUMBER_LINE}
      ${SECTION_1_PATIENT_DECLARATION}
      ${SECTION_2_DOCTOR_BLOCK}
      <div style="margin-top:8px"><strong>สัญญาณชีพ:</strong> ความดันโลหิต {{bp}} mmHg &nbsp; ชีพจร {{pulse}} ครั้ง/นาที</div>
      <div style="margin-top:6px"><strong>การมองเห็น:</strong> ตาขวา {{visionRight}} &nbsp; ตาซ้าย {{visionLeft}} &nbsp; ตาบอดสี: {{#if colorBlind}}มี{{/if}}{{#unless colorBlind}}ไม่มี{{/unless}}</div>
      <div style="margin-top:8px;font-weight:bold">ขอรับรองว่าผู้ป่วยรายนี้ {{fitVerdict}} ที่จะขับขี่ยานพาหนะ</div>
    ` + DOCTOR_SIGNATURE,
    fields: [
      ...COMMON_CERT_FIELDS,
      ...COMMON_HISTORY_FIELDS,
      { key: 'bp',           label: 'ความดันโลหิต (mmHg)', type: 'text' },
      { key: 'pulse',        label: 'ชีพจร (ครั้ง/นาที)', type: 'number' },
      { key: 'visionRight',  label: 'การมองเห็นตาขวา', type: 'text' },
      { key: 'visionLeft',   label: 'การมองเห็นตาซ้าย', type: 'text' },
      { key: 'colorBlind',   label: 'ตาบอดสี (boolean)', type: 'select', options: ['', 'true', 'false'] },
      { key: 'fitVerdict',   label: 'สรุป (เช่น "มีความเหมาะสม")', type: 'text', required: true },
    ],
    toggles: COMMON_TOGGLES,
  },
  {
    docType: 'medical-opinion',
    name: 'ใบรับรองแพทย์ลาป่วย / ความเห็นแพทย์',
    language: 'th',
    paperSize: 'A4',
    htmlTemplate: HEADER_CLINIC + `
      <h2 style="text-align:center;margin:16px 0">ใบรับรองแพทย์ลาป่วย</h2>
      ${CERT_NUMBER_LINE}
      <div style="margin:8px 0"><strong>ข้าพเจ้า นายแพทย์/แพทย์หญิง:</strong> {{doctorName}} &nbsp; <strong>ใบอนุญาตประกอบวิชาชีพเลขที่:</strong> {{doctorLicenseNo}}</div>
      <div style="margin:6px 0"><strong>ได้ทำการตรวจร่างกายของ นาย/นาง/นางสาว:</strong> {{customerName}}</div>
      <div style="margin:6px 0"><strong>หมายเลขบัตรประชาชน:</strong> {{nationalId}} &nbsp; <strong>HN:</strong> {{customerHN}}</div>
      <div style="margin:6px 0"><strong>เมื่อวันที่:</strong> {{today}}</div>
      <div style="margin:14px 0 6px 0"><strong>ความเห็น/อาการ:</strong></div>
      <div style="min-height:60px;border-bottom:1px dotted #000;margin-bottom:8px">{{opinion}}</div>
      <div style="margin:8px 0"><strong>การวินิจฉัย:</strong> {{diagnosis}}</div>
      <div style="margin:8px 0">เห็นควรให้หยุดพักรักษาตัวเป็นเวลา <strong>{{restDays}}</strong> วัน ตั้งแต่วันที่ {{restFrom}} ถึง {{restTo}}</div>
      {{#if recommendation}}<div style="margin:8px 0"><strong>คำแนะนำเพิ่มเติม:</strong> {{recommendation}}</div>{{/if}}
    ` + DOCTOR_SIGNATURE,
    // medical-opinion uses `opinion` instead of `findings` — drop findings
    // from the cert-fields baseline so the F2 test (required-field-in-HTML)
    // doesn't flag a non-existent placeholder.
    fields: [
      { key: 'doctorName',      label: 'แพทย์ผู้ตรวจ',       type: 'text', required: true },
      { key: 'doctorLicenseNo', label: 'เลขใบอนุญาตแพทย์',   type: 'text' },
      { key: 'certNumber',      label: 'เลขที่ใบรับรอง',      type: 'text' },
      { key: 'opinion',         label: 'ความเห็น/อาการ',      type: 'textarea', required: true },
      { key: 'diagnosis',       label: 'การวินิจฉัย',         type: 'text', required: true },
      { key: 'recommendation',  label: 'คำแนะนำเพิ่มเติม',    type: 'textarea' },
      { key: 'restDays',        label: 'จำนวนวันพัก',         type: 'number' },
      { key: 'restFrom',        label: 'พักตั้งแต่',           type: 'date' },
      { key: 'restTo',          label: 'ถึง',                 type: 'date' },
    ],
    toggles: COMMON_TOGGLES,
  },
  {
    docType: 'physical-therapy-certificate',
    name: 'ใบรับรองกายภาพบำบัด',
    language: 'th',
    paperSize: 'A4',
    htmlTemplate: HEADER_CLINIC + `
      <h2 style="text-align:center;margin:16px 0">ใบรับรองกายภาพบำบัด</h2>
      ${CERT_NUMBER_LINE}
      <div style="margin:8px 0"><strong>ข้าพเจ้า นักกายภาพ:</strong> {{doctorName}} &nbsp; <strong>เลขใบอนุญาต:</strong> {{doctorLicenseNo}}</div>
      <div style="margin:6px 0"><strong>ได้ทำการประเมินและบำบัดให้ผู้ป่วย:</strong> {{customerName}} (HN {{customerHN}})</div>
      <div style="margin:6px 0"><strong>วันที่:</strong> {{today}}</div>
      <div style="margin:14px 0 6px 0"><strong>อาการ:</strong></div>
      <div style="min-height:50px;border-bottom:1px dotted #000;margin-bottom:8px">{{symptoms}}</div>
      <div style="margin:8px 0 4px 0"><strong>ผลการตรวจประเมิน:</strong></div>
      <div style="min-height:50px;border-bottom:1px dotted #000;margin-bottom:8px">{{evaluation}}</div>
      <div style="margin:8px 0 4px 0"><strong>การบำบัดที่ได้รับ:</strong></div>
      <div style="min-height:50px;border-bottom:1px dotted #000;margin-bottom:8px">{{treatments}}</div>
      <div style="margin:8px 0"><strong>จำนวนครั้งที่บำบัด:</strong> {{sessionCount}} ครั้ง</div>
      {{#if recommendation}}<div style="margin:8px 0"><strong>คำแนะนำ:</strong> {{recommendation}}</div>{{/if}}
    ` + DOCTOR_SIGNATURE,
    fields: [
      { key: 'doctorName',     label: 'นักกายภาพ', type: 'text', required: true },
      { key: 'doctorLicenseNo',label: 'เลขใบอนุญาตประกอบวิชาชีพ', type: 'text' },
      { key: 'certNumber',     label: 'เลขที่ใบรับรอง', type: 'text' },
      { key: 'symptoms',       label: 'อาการ', type: 'textarea', required: true },
      { key: 'evaluation',     label: 'ผลการตรวจประเมิน', type: 'textarea' },
      { key: 'treatments',     label: 'การบำบัด', type: 'textarea', required: true },
      { key: 'sessionCount',   label: 'จำนวนครั้ง', type: 'number' },
      { key: 'recommendation', label: 'คำแนะนำ', type: 'textarea' },
    ],
    toggles: COMMON_TOGGLES,
  },
  {
    docType: 'thai-traditional-medicine-medical-certificate',
    name: 'ใบรับรองแพทย์แผนไทยประยุกต์',
    language: 'th',
    paperSize: 'A4',
    htmlTemplate: HEADER_CLINIC + `
      <h2 style="text-align:center;margin:16px 0">ใบรับรองแพทย์แผนไทยประยุกต์</h2>
      ${CERT_NUMBER_LINE}
      <div style="margin:8px 0"><strong>ข้าพเจ้า แพทย์แผนไทยประยุกต์:</strong> {{doctorName}}</div>
      <div style="margin:6px 0"><strong>ใบอนุญาตประกอบวิชาชีพแพทย์แผนไทยประยุกต์ :</strong> {{doctorLicenseNo}}</div>
      <div style="margin:6px 0"><strong>ได้ทำการตรวจประเมินทางการแพทย์แผนไทยประยุกต์ นาย/นาง/นางสาว:</strong> {{customerName}}</div>
      <div style="margin:6px 0"><strong>สถานที่อยู่ (ที่ติดต่อได้):</strong> {{patientAddress}}</div>
      <div style="margin:6px 0"><strong>หมายเลขบัตรประจำตัวประชาชน:</strong> {{nationalId}}</div>
      <div style="margin:6px 0"><strong>แล้วเมื่อวันที่:</strong> {{today}}</div>
      <div style="margin:12px 0 6px 0"><strong>จากการประเมินพบว่า</strong></div>
      <div style="min-height:50px;border-bottom:1px dotted #000;margin-bottom:8px">{{findings}}</div>
      <div style="margin:8px 0 4px 0"><strong>ผลการตรวจทางการแพทย์แผนไทยประยุกต์</strong></div>
      <div style="min-height:50px;border-bottom:1px dotted #000;margin-bottom:8px">{{tcmExam}}</div>
      <div style="margin:8px 0 4px 0"><strong>ได้ทำการรักษาโดย</strong></div>
      <div style="min-height:50px;border-bottom:1px dotted #000;margin-bottom:8px">{{treatment}}</div>
      <div style="margin:8px 0 4px 0"><strong>สรุปความเห็นและข้อแนะนำของแพทย์แผนไทยประยุกต์</strong></div>
      <div style="min-height:50px;border-bottom:1px dotted #000;margin-bottom:8px">{{recommendation}}</div>
      <div style="margin-top:32px;text-align:right">
        <div>ลงชื่อ <span style="display:inline-block;border-bottom:1px dotted #000;min-width:200px"></span> แพทย์แผนไทยประยุกต์</div>
        <div style="margin-top:2px">( {{doctorName}} )</div>
      </div>
    `,
    fields: [
      { key: 'doctorName',     label: 'แพทย์แผนไทยประยุกต์', type: 'text', required: true },
      { key: 'doctorLicenseNo',label: 'ใบอนุญาตประกอบวิชาชีพ', type: 'text' },
      { key: 'certNumber',     label: 'เลขที่ใบรับรอง', type: 'text' },
      { key: 'patientAddress', label: 'ที่อยู่ผู้ป่วย', type: 'textarea' },
      { key: 'findings',       label: 'จากการประเมินพบว่า', type: 'textarea' },
      { key: 'tcmExam',        label: 'ผลการตรวจ', type: 'textarea' },
      { key: 'treatment',      label: 'ได้ทำการรักษาโดย', type: 'textarea' },
      { key: 'recommendation', label: 'สรุปความเห็นและข้อแนะนำ', type: 'textarea' },
    ],
    toggles: COMMON_TOGGLES,
  },
  {
    docType: 'chinese-traditional-medicine-medical-certificate',
    name: 'ใบรับรองแพทย์แผนจีน / 中医医疗证明',
    language: 'bilingual',
    paperSize: 'A4',
    htmlTemplate: HEADER_CLINIC + `
      <h2 style="text-align:center;margin:16px 0">ใบรับรองแพทย์แผนจีน{{#lang en}} / 中医医疗证明{{/lang}}</h2>
      ${CERT_NUMBER_LINE}
      <div style="margin:8px 0"><strong>ข้าพเจ้า แพทย์แผนจีน{{#lang en}} / TCM Doctor{{/lang}}:</strong> {{doctorName}}</div>
      <div style="margin:6px 0"><strong>ใบอนุญาตประกอบวิชาชีพแพทย์แผนจีนเลขที่:</strong> {{doctorLicenseNo}}</div>
      <div style="margin:6px 0"><strong>ได้ทำการตรวจประเมินทางการแพทย์แผนจีน นาย/นาง/นางสาว:</strong> {{customerName}} (HN {{customerHN}})</div>
      <div style="margin:6px 0"><strong>เมื่อวันที่:</strong> {{today}}</div>
      <div style="margin:14px 0 6px 0"><strong>อาการ{{#lang en}} / 症状{{/lang}}:</strong></div>
      <div style="min-height:50px;border-bottom:1px dotted #000;margin-bottom:8px">{{symptoms}}</div>
      <div style="margin:8px 0 4px 0"><strong>การวินิจฉัยแพทย์จีน{{#lang en}} / 中医诊断{{/lang}}:</strong></div>
      <div style="min-height:50px;border-bottom:1px dotted #000;margin-bottom:8px">{{tcmDiagnosis}}</div>
      <div style="margin:8px 0 4px 0"><strong>การรักษา{{#lang en}} / 治疗{{/lang}}:</strong></div>
      <div style="min-height:50px;border-bottom:1px dotted #000;margin-bottom:8px">{{treatment}}</div>
    ` + DOCTOR_SIGNATURE,
    fields: [
      { key: 'doctorName',     label: 'แพทย์จีน', type: 'text', required: true },
      { key: 'doctorLicenseNo',label: 'เลขใบอนุญาต', type: 'text' },
      { key: 'certNumber',     label: 'เลขที่ใบรับรอง', type: 'text' },
      { key: 'symptoms',       label: 'อาการ / 症状', type: 'textarea' },
      { key: 'tcmDiagnosis',   label: 'การวินิจฉัยแพทย์จีน / 中医诊断', type: 'textarea' },
      { key: 'treatment',      label: 'การรักษา / 治疗', type: 'textarea' },
    ],
    toggles: COMMON_TOGGLES,
  },
  {
    docType: 'fit-to-fly',
    name: 'Fit-to-fly Certificate / ใบรับรองความพร้อมในการเดินทางทางอากาศ',
    language: 'bilingual',
    paperSize: 'A4',
    htmlTemplate: HEADER_CLINIC + `
      <h2 style="text-align:center;margin:14px 0 4px 0">FIT-TO-FLY CERTIFICATE</h2>
      <h3 style="text-align:center;font-weight:normal;margin-bottom:14px">ใบรับรองความพร้อมในการเดินทางทางอากาศ</h3>
      ${CERT_NUMBER_LINE}
      <div style="margin:8px 0"><strong>Patient Name / ชื่อผู้ป่วย:</strong> {{customerNameEn}} ({{customerName}})</div>
      <div style="margin:6px 0"><strong>Passport No. / หนังสือเดินทาง:</strong> {{passport}} &nbsp; <strong>Nationality / สัญชาติ:</strong> {{nationality}}</div>
      <div style="margin:6px 0"><strong>Date of Birth / วันเกิด:</strong> {{dob}} &nbsp; <strong>HN:</strong> {{customerHN}}</div>
      <div style="margin:6px 0"><strong>Flight No. / เที่ยวบิน:</strong> {{flightNo}} &nbsp; <strong>Date / วันที่:</strong> {{flightDate}}</div>
      <div style="margin:6px 0"><strong>Route / เส้นทาง:</strong> {{route}}</div>
      <div style="margin:14px 0">
        I hereby certify that I have examined the above-named patient on {{today}} and certify that the patient is fit to travel by commercial flight.<br>
        ข้าพเจ้าได้ตรวจร่างกายผู้ป่วยข้างต้นเมื่อ {{today}} และขอรับรองว่ามีความพร้อมในการเดินทางทางอากาศ
      </div>
      <div style="margin:8px 0"><strong>Findings / ผลการตรวจ:</strong></div>
      <div style="min-height:50px;border-bottom:1px dotted #000;margin-bottom:8px">{{findings}}</div>
      <div style="margin:8px 0"><strong>Vital signs / สัญญาณชีพ:</strong> BP {{bp}} mmHg, Pulse {{pulse}}/min, Temp {{temp}} °C</div>
      <div style="margin:8px 0"><strong>Diagnosis / การวินิจฉัย:</strong> {{diagnosis}}</div>
    ` + DOCTOR_SIGNATURE,
    fields: [
      { key: 'customerNameEn', label: 'Patient Name (English)', type: 'text', required: true },
      { key: 'passport',       label: 'Passport / ID', type: 'text' },
      { key: 'nationality',    label: 'Nationality', type: 'text' },
      { key: 'dob',            label: 'Date of Birth', type: 'date' },
      { key: 'flightNo',       label: 'Flight No.', type: 'text' },
      { key: 'flightDate',     label: 'Flight Date', type: 'date' },
      { key: 'route',          label: 'Route', type: 'text' },
      { key: 'bp',             label: 'BP (mmHg)', type: 'text' },
      { key: 'pulse',          label: 'Pulse (/min)', type: 'number' },
      { key: 'temp',           label: 'Temperature (°C)', type: 'text' },
      { key: 'findings',       label: 'Findings', type: 'textarea' },
      { key: 'diagnosis',      label: 'Diagnosis', type: 'text' },
      { key: 'doctorName',     label: 'Doctor', type: 'text', required: true },
      { key: 'doctorLicenseNo',label: 'License No.', type: 'text' },
      { key: 'certNumber',     label: 'Certificate No.', type: 'text' },
    ],
    toggles: COMMON_TOGGLES,
  },
  {
    docType: 'medicine-label',
    name: 'ฉลากยา (Medicine Label)',
    language: 'th',
    paperSize: 'label-57x32',
    htmlTemplate: `
<div style="font-family:'Sarabun','Noto Sans Thai',sans-serif;padding:1.5mm;font-size:9px;line-height:1.25">
  <div style="font-weight:bold;font-size:10px">{{clinicName}}</div>
  <div style="font-size:8px">โทร. {{clinicPhone}}</div>
  <div style="border-top:1px solid #000;margin:1.5mm 0;padding-top:1mm;font-weight:bold">{{customerName}} &nbsp; HN {{customerHN}}</div>
  <div style="font-weight:bold;font-size:10px;margin-top:1mm">{{medicineName}}</div>
  {{#if genericName}}<div style="font-size:8px;color:#444">({{genericName}})</div>{{/if}}
  <div style="margin-top:1mm">จำนวน: <strong>{{qty}}</strong></div>
  <div style="font-size:8px;margin-top:1mm">วิธีใช้: {{instructions}}</div>
  {{#if indication}}<div style="font-size:8px">ข้อบ่งใช้: {{indication}}</div>{{/if}}
  {{#if warning}}<div style="font-size:8px;color:#a00">ระวัง: {{warning}}</div>{{/if}}
  <div style="font-size:8px;margin-top:1.5mm;border-top:1px dotted #000;padding-top:0.5mm">จ่ายเมื่อ {{today}} โดย {{doctorName}}</div>
</div>
    `,
    fields: [
      { key: 'medicineName',  label: 'ชื่อยา', type: 'text', required: true },
      { key: 'genericName',   label: 'ชื่อสามัญ', type: 'text' },
      { key: 'qty',           label: 'จำนวน', type: 'text', required: true },
      { key: 'instructions',  label: 'วิธีใช้', type: 'textarea', required: true },
      { key: 'indication',    label: 'ข้อบ่งใช้', type: 'text' },
      { key: 'warning',       label: 'คำเตือน/ข้อควรระวัง', type: 'text' },
      { key: 'doctorName',    label: 'ผู้จ่ายยา', type: 'text', required: true },
    ],
    toggles: [],
  },
  {
    docType: 'chart',
    name: 'เทมเพลต Chart (ประวัติการรักษา)',
    language: 'th',
    paperSize: 'A4',
    htmlTemplate: HEADER_CLINIC + `
      <h2 style="text-align:center;margin:16px 0">ใบประวัติการรักษา (Patient Chart)</h2>
      ${CERT_NUMBER_LINE}
      <div style="margin:6px 0"><strong>ผู้ป่วย:</strong> {{customerName}} (HN {{customerHN}}) &nbsp; <strong>เพศ:</strong> {{gender}} &nbsp; <strong>อายุ:</strong> {{age}} ปี</div>
      <div style="margin:6px 0"><strong>วันที่:</strong> {{today}}</div>
      <div style="margin:14px 0 6px 0"><strong>CC (Chief Complaint):</strong></div>
      <div style="min-height:30px;border-bottom:1px dotted #000;margin-bottom:8px">{{cc}}</div>
      <div style="margin:8px 0 4px 0"><strong>HPI (History of Present Illness):</strong></div>
      <div style="min-height:60px;border-bottom:1px dotted #000;margin-bottom:8px">{{hpi}}</div>
      <div style="margin:8px 0 4px 0"><strong>PMH (Past Medical History):</strong></div>
      <div style="min-height:30px;border-bottom:1px dotted #000;margin-bottom:8px">{{pmh}}</div>
      <div style="margin:8px 0 4px 0"><strong>PE (Physical Exam):</strong></div>
      <div style="min-height:50px;border-bottom:1px dotted #000;margin-bottom:8px">{{pe}}</div>
      <div style="margin:8px 0"><strong>Diagnosis:</strong> {{dx}}</div>
      <div style="margin:8px 0 4px 0"><strong>Tx Plan:</strong></div>
      <div style="min-height:50px;border-bottom:1px dotted #000;margin-bottom:8px">{{txPlan}}</div>
    ` + DOCTOR_SIGNATURE,
    fields: [
      { key: 'cc',          label: 'CC',     type: 'textarea' },
      { key: 'hpi',         label: 'HPI',    type: 'textarea' },
      { key: 'pmh',         label: 'PMH',    type: 'textarea' },
      { key: 'pe',          label: 'PE',     type: 'textarea' },
      { key: 'dx',          label: 'Diagnosis', type: 'text' },
      { key: 'txPlan',      label: 'Tx Plan', type: 'textarea' },
      { key: 'doctorName',  label: 'แพทย์', type: 'text', required: true },
      { key: 'doctorLicenseNo', label: 'เลขใบอนุญาต', type: 'text' },
      { key: 'certNumber',  label: 'เลขที่เอกสาร', type: 'text' },
    ],
    toggles: COMMON_TOGGLES,
  },
  {
    docType: 'consent',
    name: 'หนังสือยินยอมรับการรักษา (Consent Form)',
    language: 'th',
    paperSize: 'A4',
    htmlTemplate: HEADER_CLINIC + `
      <h2 style="text-align:center;margin:16px 0">หนังสือยินยอมรับการรักษา</h2>
      ${CERT_NUMBER_LINE}
      <div style="margin:8px 0">ข้าพเจ้า <strong>{{customerName}}</strong> &nbsp; HN: <strong>{{customerHN}}</strong> &nbsp; เลขบัตรประชาชน: {{nationalId}}</div>
      <div style="margin:6px 0">ที่อยู่: {{patientAddress}}</div>
      <div style="margin:14px 0">ขอแสดงความยินยอมให้แพทย์ <strong>{{doctorName}}</strong> และทีมงานคลินิก <strong>{{clinicName}}</strong> ทำการรักษา/หัตถการดังต่อไปนี้:</div>
      <div style="min-height:50px;border-bottom:1px dotted #000;margin-bottom:8px;padding:6px;background:#fafafa">{{procedure}}</div>
      <div style="margin:14px 0 6px 0;font-weight:bold">ข้าพเจ้าได้รับคำอธิบายอย่างชัดเจนเกี่ยวกับ:</div>
      <ul style="margin:6px 0;padding-left:24px">
        <li>ขั้นตอนการรักษา/หัตถการ</li>
        <li>ผลที่คาดว่าจะได้รับ</li>
        <li>ผลข้างเคียง / ความเสี่ยง: {{risks}}</li>
        <li>ทางเลือกอื่นในการรักษา</li>
        <li>ค่าใช้จ่าย (ถ้ามี): {{cost}} บาท</li>
      </ul>
      <div style="margin:14px 0">ข้าพเจ้าเข้าใจดีแล้วและยินยอมรับการรักษาด้วยความสมัครใจ ปราศจากการบังคับ</div>
      <div style="margin-top:30px;display:flex;justify-content:space-between">
        <div>
          <div>ลงชื่อ <span style="display:inline-block;border-bottom:1px dotted #000;min-width:180px"></span> ผู้ป่วย/ผู้ยินยอม</div>
          <div style="margin-top:2px">( {{customerName}} )</div>
          <div>วันที่ {{today}}</div>
        </div>
        <div>
          <div>ลงชื่อ <span style="display:inline-block;border-bottom:1px dotted #000;min-width:180px"></span> พยาน</div>
          <div style="margin-top:2px">( {{witnessName}} )</div>
          <div>วันที่ {{today}}</div>
        </div>
      </div>
    ` + DOCTOR_SIGNATURE,
    fields: [
      { key: 'procedure',  label: 'หัตถการ/การรักษา', type: 'textarea', required: true },
      { key: 'risks',      label: 'ความเสี่ยง / ผลข้างเคียง', type: 'textarea' },
      { key: 'cost',       label: 'ค่าใช้จ่ายโดยประมาณ (บาท)', type: 'number' },
      { key: 'patientAddress', label: 'ที่อยู่ผู้ป่วย', type: 'textarea' },
      { key: 'witnessName',label: 'ชื่อพยาน', type: 'text' },
      { key: 'doctorName', label: 'แพทย์ผู้ทำการรักษา', type: 'text', required: true },
      { key: 'doctorLicenseNo', label: 'เลขใบอนุญาตแพทย์', type: 'text' },
      { key: 'certNumber', label: 'เลขที่เอกสาร', type: 'text' },
    ],
    toggles: [
      { key: 'showCertNumber', labelTh: 'แสดงเลขที่เอกสาร', labelEn: 'Show document number', defaultOn: false },
    ],
  },
  {
    docType: 'treatment',
    name: 'แผนการรักษา (Treatment Plan)',
    language: 'th',
    paperSize: 'A4',
    htmlTemplate: HEADER_CLINIC + `
      <h2 style="text-align:center;margin:16px 0">แผนการรักษา</h2>
      ${CERT_NUMBER_LINE}
      <div style="margin:6px 0"><strong>ผู้ป่วย:</strong> {{customerName}} (HN {{customerHN}}) &nbsp; <strong>วันที่:</strong> {{today}}</div>
      <div style="margin:14px 0 6px 0"><strong>ภาวะที่ต้องรักษา:</strong></div>
      <div style="min-height:40px;border-bottom:1px dotted #000;margin-bottom:8px">{{condition}}</div>
      <div style="margin:8px 0 4px 0"><strong>เป้าหมายการรักษา:</strong></div>
      <div style="min-height:40px;border-bottom:1px dotted #000;margin-bottom:8px">{{goals}}</div>
      <div style="margin:8px 0 4px 0"><strong>แผนการรักษา (ขั้นตอน):</strong></div>
      <div style="min-height:60px;border-bottom:1px dotted #000;margin-bottom:8px">{{plan}}</div>
      <div style="margin:8px 0"><strong>ระยะเวลาโดยประมาณ:</strong> {{duration}} &nbsp; <strong>จำนวนครั้งที่คาดว่าต้องมา:</strong> {{visitCount}} ครั้ง</div>
      <div style="margin:8px 0"><strong>ค่ารักษา (ประมาณ):</strong> {{estimatedCost}} บาท</div>
      <div style="margin:8px 0"><strong>ผลข้างเคียงที่อาจพบ:</strong> {{sideEffects}}</div>
      {{#if recommendation}}<div style="margin:8px 0"><strong>คำแนะนำเพิ่มเติม:</strong> {{recommendation}}</div>{{/if}}
    ` + DOCTOR_SIGNATURE,
    fields: [
      { key: 'condition',     label: 'ภาวะที่ต้องรักษา', type: 'text' },
      { key: 'goals',         label: 'เป้าหมายการรักษา', type: 'textarea' },
      { key: 'plan',          label: 'แผนการรักษา', type: 'textarea', required: true },
      { key: 'duration',      label: 'ระยะเวลา', type: 'text' },
      { key: 'visitCount',    label: 'จำนวนครั้งที่คาดว่าต้องมา', type: 'number' },
      { key: 'estimatedCost', label: 'ค่ารักษา (บาท)', type: 'number' },
      { key: 'sideEffects',   label: 'ผลข้างเคียง', type: 'textarea' },
      { key: 'recommendation',label: 'คำแนะนำ', type: 'textarea' },
      { key: 'doctorName',    label: 'แพทย์', type: 'text', required: true },
      { key: 'doctorLicenseNo', label: 'เลขใบอนุญาต', type: 'text' },
      { key: 'certNumber',    label: 'เลขที่เอกสาร', type: 'text' },
    ],
    toggles: [
      { key: 'showCertNumber', labelTh: 'แสดงเลขที่เอกสาร', labelEn: 'Show document number', defaultOn: false },
    ],
  },
  {
    docType: 'sale-cancelation',
    name: 'ใบยกเลิกการขาย / Refund Receipt',
    language: 'th',
    paperSize: 'A4',
    htmlTemplate: HEADER_CLINIC + `
      <h2 style="text-align:center;margin:16px 0">ใบยกเลิกการขาย</h2>
      <div style="text-align:right;margin-bottom:10px"><strong>วันที่ยกเลิก:</strong> {{today}}</div>
      <div style="margin:8px 0"><strong>เลขที่ใบเสร็จเดิม:</strong> {{originalSaleId}} &nbsp; <strong>วันที่ขายเดิม:</strong> {{saleDate}}</div>
      <div style="margin:6px 0"><strong>ลูกค้า:</strong> {{customerName}} (HN {{customerHN}})</div>
      <div style="margin:6px 0"><strong>ยอดเงินรวมเดิม:</strong> {{amount}} บาท</div>
      <div style="margin:14px 0 6px 0"><strong>เหตุผลการยกเลิก:</strong></div>
      <div style="min-height:50px;border-bottom:1px dotted #000;margin-bottom:8px">{{reason}}</div>
      <div style="margin:14px 0;background:#fff7e6;padding:10px;border:1px solid #f59e0b;border-radius:4px">
        <div style="font-weight:bold;color:#d97706">รายละเอียดการคืนเงิน</div>
        <div style="margin-top:4px"><strong>จำนวนเงินคืน:</strong> {{refundAmount}} บาท</div>
        <div style="margin-top:2px"><strong>ช่องทางคืนเงิน:</strong> {{refundMethod}}</div>
        {{#if refundReference}}<div style="margin-top:2px"><strong>เลขอ้างอิง:</strong> {{refundReference}}</div>{{/if}}
      </div>
      <div style="margin-top:30px;display:flex;justify-content:space-between">
        <div>
          <div>ลงชื่อ <span style="display:inline-block;border-bottom:1px dotted #000;min-width:180px"></span> ลูกค้า/ผู้รับเงิน</div>
          <div style="margin-top:2px">( {{customerName}} )</div>
          <div>วันที่ {{today}}</div>
        </div>
        <div>
          <div>ลงชื่อ <span style="display:inline-block;border-bottom:1px dotted #000;min-width:180px"></span> พนักงานผู้ทำรายการ</div>
          <div style="margin-top:2px">( {{staffName}} )</div>
          <div>วันที่ {{today}}</div>
        </div>
      </div>
    `,
    fields: [
      { key: 'originalSaleId', label: 'เลขที่ใบเสร็จเดิม', type: 'text', required: true },
      { key: 'saleDate',       label: 'วันที่ขายเดิม', type: 'date' },
      { key: 'amount',         label: 'ยอดเงินเดิม (บาท)', type: 'number' },
      { key: 'reason',         label: 'เหตุผลการยกเลิก', type: 'textarea', required: true },
      { key: 'refundAmount',   label: 'จำนวนเงินคืน (บาท)', type: 'number', required: true },
      { key: 'refundMethod',   label: 'ช่องทางคืนเงิน', type: 'text' },
      { key: 'refundReference',label: 'เลขอ้างอิงการคืนเงิน', type: 'text' },
      { key: 'staffName',      label: 'พนักงานผู้ทำรายการ', type: 'text', required: true },
    ],
    toggles: [],
  },
  {
    docType: 'patient-referral',
    name: 'ใบส่งตัวผู้ป่วย / Patient Referral Letter',
    language: 'bilingual',
    paperSize: 'A4',
    htmlTemplate: HEADER_CLINIC + `
      <h2 style="text-align:center;margin:14px 0 4px 0">ใบส่งตัวผู้ป่วย</h2>
      <h3 style="text-align:center;font-weight:normal;margin-bottom:14px">Patient Referral Letter</h3>
      ${CERT_NUMBER_LINE}
      <div style="margin:8px 0"><strong>ส่งต่อไปยัง / Refer to:</strong> {{referTo}}</div>
      <div style="margin:6px 0"><strong>แพทย์ผู้รับ / Attending Physician:</strong> {{referDoctor}}</div>
      <div style="margin:14px 0 6px 0;border-top:1px dashed #000;padding-top:8px">
        <strong>ข้อมูลผู้ป่วย / Patient Information</strong>
      </div>
      <div style="margin:6px 0"><strong>ชื่อ-นามสกุล / Name:</strong> {{customerName}} ({{customerNameEn}}) &nbsp; <strong>HN:</strong> {{customerHN}}</div>
      <div style="margin:6px 0"><strong>เพศ / Gender:</strong> {{gender}} &nbsp; <strong>อายุ / Age:</strong> {{age}} &nbsp; <strong>เลขบัตรประชาชน:</strong> {{nationalId}}</div>
      <div style="margin:6px 0"><strong>ที่อยู่ / Address:</strong> {{patientAddress}}</div>
      <div style="margin:14px 0 6px 0"><strong>อาการสำคัญ / Chief Complaint:</strong></div>
      <div style="min-height:30px;border-bottom:1px dotted #000;margin-bottom:8px">{{cc}}</div>
      <div style="margin:8px 0 4px 0"><strong>ประวัติ / History:</strong></div>
      <div style="min-height:50px;border-bottom:1px dotted #000;margin-bottom:8px">{{history}}</div>
      <div style="margin:8px 0 4px 0"><strong>การตรวจร่างกาย / Examination:</strong></div>
      <div style="min-height:50px;border-bottom:1px dotted #000;margin-bottom:8px">{{examination}}</div>
      <div style="margin:8px 0"><strong>การวินิจฉัยเบื้องต้น / Provisional Dx:</strong> {{diagnosis}}</div>
      <div style="margin:8px 0 4px 0"><strong>การรักษาที่ทำไปแล้ว / Treatment given:</strong></div>
      <div style="min-height:50px;border-bottom:1px dotted #000;margin-bottom:8px">{{treatmentGiven}}</div>
      <div style="margin:8px 0 4px 0"><strong>เหตุที่ส่งต่อ / Reason for referral:</strong></div>
      <div style="min-height:40px;border-bottom:1px dotted #000;margin-bottom:8px">{{referralReason}}</div>
      <div style="margin:14px 0;font-style:italic">ขอความกรุณาให้การดูแลรักษาต่อ &nbsp;/&nbsp; Please continue the care for this patient.</div>
    ` + DOCTOR_SIGNATURE,
    fields: [
      { key: 'referTo',        label: 'ส่งต่อไปยัง (คลินิก/รพ.)', type: 'text', required: true },
      { key: 'referDoctor',    label: 'แพทย์ผู้รับ', type: 'text' },
      { key: 'customerNameEn', label: 'ชื่อภาษาอังกฤษ', type: 'text' },
      { key: 'patientAddress', label: 'ที่อยู่ผู้ป่วย', type: 'textarea' },
      { key: 'cc',             label: 'อาการสำคัญ', type: 'text' },
      { key: 'history',        label: 'ประวัติ', type: 'textarea' },
      { key: 'examination',    label: 'ผลการตรวจ', type: 'textarea' },
      { key: 'diagnosis',      label: 'วินิจฉัยเบื้องต้น', type: 'text' },
      { key: 'treatmentGiven', label: 'การรักษาที่ทำไปแล้ว', type: 'textarea' },
      { key: 'referralReason', label: 'เหตุที่ส่งต่อ', type: 'textarea', required: true },
      { key: 'doctorName',     label: 'แพทย์ผู้ส่งต่อ', type: 'text', required: true },
      { key: 'doctorLicenseNo',label: 'เลขใบอนุญาต', type: 'text' },
      { key: 'certNumber',     label: 'เลขที่ใบส่งตัว', type: 'text' },
    ],
    toggles: COMMON_TOGGLES,
  },
]);
