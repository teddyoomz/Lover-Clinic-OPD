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
    isActive: true,
    isSystemDefault: false,
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
  return {
    ...form,
    docType: DOC_TYPES.includes(form.docType) ? form.docType : 'medical-certificate',
    name: trim(form.name) || DOC_TYPE_LABELS[form.docType] || '',
    language: LANGUAGES.includes(form.language) ? form.language : 'th',
    paperSize: PAPER_SIZES.includes(form.paperSize) ? form.paperSize : 'A4',
    htmlTemplate: typeof form.htmlTemplate === 'string' ? form.htmlTemplate : '',
    fields: safeFields,
    isActive: form.isActive !== false,
    isSystemDefault: !!form.isSystemDefault,
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

/* ─── 13 seed templates — shipped on first load of DocumentTemplatesTab ─── */

// Thin defaults — each uses placeholders the print engine will fill from
// { customer, clinic, today, ...fillValues }. Staff can edit the HTML
// later via the tab. System defaults get `isSystemDefault: true` so the
// delete button is hidden.

const HEADER_TH = `
  <div style="text-align:center;margin-bottom:12px">
    <div style="font-weight:bold;font-size:20px">{{clinicName}}</div>
    <div style="font-size:12px">{{clinicAddress}}</div>
    <div style="font-size:12px">โทร. {{clinicPhone}}</div>
  </div>
  <hr />
`;

const PATIENT_LINE = `
  <div style="margin-bottom:8px">
    <strong>ชื่อ-นามสกุล:</strong> {{customerName}} &nbsp;
    <strong>HN:</strong> {{customerHN}} &nbsp;
    <strong>เลขบัตรประชาชน:</strong> {{nationalId}} &nbsp;
    <strong>อายุ:</strong> {{age}} ปี
  </div>
`;

const FOOTER = `
  <div style="margin-top:40px;text-align:right">
    <div>ลงชื่อ ................................................</div>
    <div>( {{doctorName}} )</div>
    <div>วันที่ {{today}}</div>
  </div>
`;

export const SEED_TEMPLATES = Object.freeze([
  {
    docType: 'medical-certificate',
    name: 'ใบรับรองแพทย์ (ทั่วไป)',
    language: 'th',
    paperSize: 'A4',
    htmlTemplate: HEADER_TH + `
      <h2 style="text-align:center;margin:16px 0">ใบรับรองแพทย์</h2>
      ${PATIENT_LINE}
      <p>ข้าพเจ้าได้ตรวจร่างกายผู้ป่วยรายนี้ เมื่อวันที่ {{today}} พบว่า:</p>
      <div style="margin:12px 0">{{findings}}</div>
      <p><strong>การวินิจฉัย:</strong> {{diagnosis}}</p>
      <p><strong>คำแนะนำ:</strong> {{recommendation}}</p>
      <p>ให้หยุดพักรักษาตัวเป็นเวลา {{restDays}} วัน ตั้งแต่วันที่ {{restFrom}} ถึง {{restTo}}</p>
    ` + FOOTER,
    fields: [
      { key: 'findings',       label: 'ผลการตรวจ', type: 'textarea', required: true },
      { key: 'diagnosis',      label: 'การวินิจฉัย', type: 'text',     required: true },
      { key: 'recommendation', label: 'คำแนะนำ',    type: 'textarea', required: false },
      { key: 'restDays',       label: 'จำนวนวันพัก', type: 'number',   required: false },
      { key: 'restFrom',       label: 'พักตั้งแต่',  type: 'date',     required: false },
      { key: 'restTo',         label: 'ถึง',         type: 'date',     required: false },
      { key: 'doctorName',     label: 'แพทย์ผู้ตรวจ', type: 'text',    required: true  },
    ],
  },
  {
    docType: 'medical-certificate-for-driver-license',
    name: 'ใบรับรองแพทย์ทำใบขับขี่',
    language: 'th',
    paperSize: 'A4',
    htmlTemplate: HEADER_TH + `
      <h2 style="text-align:center;margin:16px 0">ใบรับรองแพทย์ (สำหรับทำใบอนุญาตขับขี่)</h2>
      ${PATIENT_LINE}
      <p><strong>ตรวจร่างกายทั่วไป:</strong> {{generalExam}}</p>
      <p><strong>ความดันโลหิต:</strong> {{bp}} mmHg &nbsp; <strong>ชีพจร:</strong> {{pulse}}/นาที</p>
      <p><strong>การมองเห็น:</strong> ตาขวา {{visionRight}} / ตาซ้าย {{visionLeft}}</p>
      <p><strong>การวินิจฉัย:</strong> {{diagnosis}}</p>
      <p>ขอรับรองว่าผู้ป่วยรายนี้ {{fitVerdict}} ที่จะขับขี่ยานพาหนะ</p>
    ` + FOOTER,
    fields: [
      { key: 'generalExam',  label: 'ตรวจร่างกายทั่วไป', type: 'textarea' },
      { key: 'bp',           label: 'ความดันโลหิต (mmHg)', type: 'text' },
      { key: 'pulse',        label: 'ชีพจร (ครั้ง/นาที)', type: 'number' },
      { key: 'visionRight',  label: 'การมองเห็นตาขวา',   type: 'text' },
      { key: 'visionLeft',   label: 'การมองเห็นตาซ้าย',   type: 'text' },
      { key: 'diagnosis',    label: 'การวินิจฉัย', type: 'textarea' },
      { key: 'fitVerdict',   label: 'สรุป (เช่น "มีความเหมาะสม")', type: 'text', required: true },
      { key: 'doctorName',   label: 'แพทย์', type: 'text', required: true },
    ],
  },
  {
    docType: 'medical-opinion',
    name: 'ความเห็นแพทย์',
    language: 'th',
    paperSize: 'A4',
    htmlTemplate: HEADER_TH + `
      <h2 style="text-align:center;margin:16px 0">ความเห็นแพทย์</h2>
      ${PATIENT_LINE}
      <p><strong>เหตุที่ร้องขอ:</strong> {{requestReason}}</p>
      <p><strong>ประวัติที่เกี่ยวข้อง:</strong></p>
      <div style="margin:8px 0;padding-left:16px">{{history}}</div>
      <p><strong>ความเห็น:</strong></p>
      <div style="margin:8px 0;padding-left:16px">{{opinion}}</div>
    ` + FOOTER,
    fields: [
      { key: 'requestReason', label: 'เหตุที่ร้องขอ', type: 'text' },
      { key: 'history',       label: 'ประวัติที่เกี่ยวข้อง', type: 'textarea' },
      { key: 'opinion',       label: 'ความเห็น',    type: 'textarea', required: true },
      { key: 'doctorName',    label: 'แพทย์',       type: 'text',     required: true },
    ],
  },
  {
    docType: 'physical-therapy-certificate',
    name: 'ใบรับรองกายภาพบำบัด',
    language: 'th',
    paperSize: 'A4',
    htmlTemplate: HEADER_TH + `
      <h2 style="text-align:center;margin:16px 0">ใบรับรองกายภาพบำบัด</h2>
      ${PATIENT_LINE}
      <p><strong>อาการ:</strong> {{symptoms}}</p>
      <p><strong>การบำบัดที่ได้รับ:</strong></p>
      <div style="margin:8px 0;padding-left:16px">{{treatments}}</div>
      <p><strong>จำนวนครั้ง:</strong> {{sessionCount}} ครั้ง</p>
      <p><strong>คำแนะนำ:</strong> {{recommendation}}</p>
    ` + FOOTER,
    fields: [
      { key: 'symptoms',       label: 'อาการ',         type: 'textarea' },
      { key: 'treatments',     label: 'การบำบัด',       type: 'textarea' },
      { key: 'sessionCount',   label: 'จำนวนครั้ง',     type: 'number' },
      { key: 'recommendation', label: 'คำแนะนำ',       type: 'textarea' },
      { key: 'doctorName',     label: 'นักกายภาพ', type: 'text', required: true },
    ],
  },
  {
    docType: 'thai-traditional-medicine-medical-certificate',
    name: 'ใบรับรองแพทย์แผนไทย',
    language: 'th',
    paperSize: 'A4',
    htmlTemplate: HEADER_TH + `
      <h2 style="text-align:center;margin:16px 0">ใบรับรองแพทย์แผนไทย</h2>
      ${PATIENT_LINE}
      <p><strong>อาการ:</strong> {{symptoms}}</p>
      <p><strong>การรักษา:</strong> {{treatment}}</p>
      <p><strong>คำแนะนำ:</strong> {{recommendation}}</p>
    ` + FOOTER,
    fields: [
      { key: 'symptoms',       label: 'อาการ', type: 'textarea' },
      { key: 'treatment',      label: 'การรักษา', type: 'textarea' },
      { key: 'recommendation', label: 'คำแนะนำ', type: 'textarea' },
      { key: 'doctorName',     label: 'แพทย์', type: 'text', required: true },
    ],
  },
  {
    docType: 'chinese-traditional-medicine-medical-certificate',
    name: 'ใบรับรองแพทย์แผนจีน',
    language: 'bilingual',
    paperSize: 'A4',
    htmlTemplate: HEADER_TH + `
      <h2 style="text-align:center;margin:16px 0">ใบรับรองแพทย์แผนจีน / 中医医疗证明</h2>
      ${PATIENT_LINE}
      <p><strong>อาการ (症状):</strong> {{symptoms}}</p>
      <p><strong>การวินิจฉัยจีน (中医诊断):</strong> {{tcmDiagnosis}}</p>
      <p><strong>การรักษา (治疗):</strong> {{treatment}}</p>
    ` + FOOTER,
    fields: [
      { key: 'symptoms',     label: 'อาการ', type: 'textarea' },
      { key: 'tcmDiagnosis', label: 'การวินิจฉัยแพทย์จีน', type: 'textarea' },
      { key: 'treatment',    label: 'การรักษา', type: 'textarea' },
      { key: 'doctorName',   label: 'แพทย์จีน', type: 'text', required: true },
    ],
  },
  {
    docType: 'fit-to-fly',
    name: 'Fit-to-fly Certificate',
    language: 'bilingual',
    paperSize: 'A4',
    htmlTemplate: HEADER_TH + `
      <h2 style="text-align:center;margin:16px 0">FIT-TO-FLY CERTIFICATE</h2>
      <h3 style="text-align:center;font-weight:normal;margin-bottom:16px">ใบรับรองความพร้อมในการเดินทางทางอากาศ</h3>
      <p><strong>Patient Name / ชื่อผู้ป่วย:</strong> {{customerNameEn}} ({{customerName}})</p>
      <p><strong>Passport / หนังสือเดินทาง:</strong> {{passport}}</p>
      <p><strong>Date of Birth / วันเกิด:</strong> {{dob}}</p>
      <p><strong>Nationality / สัญชาติ:</strong> {{nationality}}</p>
      <p><strong>Flight No. / เที่ยวบิน:</strong> {{flightNo}} &nbsp; <strong>Date:</strong> {{flightDate}}</p>
      <p><strong>Route / เส้นทาง:</strong> {{route}}</p>
      <p style="margin-top:16px">I hereby certify that the above-named patient has been examined and is fit to fly on the scheduled commercial flight.</p>
      <p>ข้าพเจ้าขอรับรองว่าผู้ป่วยรายที่กล่าวข้างต้นได้รับการตรวจร่างกายและมีความพร้อมในการเดินทางทางอากาศตามเที่ยวบินที่กำหนด</p>
      <p><strong>Findings / ผลการตรวจ:</strong> {{findings}}</p>
    ` + FOOTER,
    fields: [
      { key: 'customerNameEn', label: 'Patient Name (English)', type: 'text', required: true },
      { key: 'passport',       label: 'Passport / ID', type: 'text' },
      { key: 'dob',            label: 'Date of Birth', type: 'date' },
      { key: 'nationality',    label: 'Nationality', type: 'text' },
      { key: 'flightNo',       label: 'Flight No.', type: 'text' },
      { key: 'flightDate',     label: 'Flight Date', type: 'date' },
      { key: 'route',          label: 'Route', type: 'text' },
      { key: 'findings',       label: 'Findings / ผลการตรวจ', type: 'textarea' },
      { key: 'doctorName',     label: 'Doctor / แพทย์', type: 'text', required: true },
    ],
  },
  {
    docType: 'medicine-label',
    name: 'ฉลากยา',
    language: 'th',
    paperSize: 'label-57x32',
    htmlTemplate: `
      <div style="font-family:sans-serif;padding:4px;font-size:11px">
        <div style="font-weight:bold">{{clinicName}}</div>
        <div>{{customerName}} HN {{customerHN}}</div>
        <div style="margin:2px 0;border-top:1px solid #000;padding-top:2px">
          <strong>{{medicineName}}</strong> × {{qty}}
        </div>
        <div>{{instructions}}</div>
        <div>จ่ายเมื่อ {{today}} — {{doctorName}}</div>
      </div>
    `,
    fields: [
      { key: 'medicineName',  label: 'ชื่อยา', type: 'text', required: true },
      { key: 'qty',           label: 'จำนวน', type: 'text', required: true },
      { key: 'instructions',  label: 'วิธีใช้', type: 'textarea', required: true },
      { key: 'doctorName',    label: 'ผู้จ่าย', type: 'text' },
    ],
  },
  {
    docType: 'chart',
    name: 'เทมเพลต Chart (ประวัติ)',
    language: 'th',
    paperSize: 'A4',
    htmlTemplate: HEADER_TH + `
      <h2 style="text-align:center;margin:16px 0">ใบประวัติผู้ป่วย</h2>
      ${PATIENT_LINE}
      <p><strong>CC (Chief Complaint):</strong> {{cc}}</p>
      <p><strong>HPI (History of Present Illness):</strong></p>
      <div style="margin:8px 0;padding-left:16px">{{hpi}}</div>
      <p><strong>PMH:</strong> {{pmh}}</p>
      <p><strong>PE (Physical Exam):</strong></p>
      <div style="margin:8px 0;padding-left:16px">{{pe}}</div>
      <p><strong>Dx:</strong> {{dx}}</p>
      <p><strong>Tx Plan:</strong> {{txPlan}}</p>
    ` + FOOTER,
    fields: [
      { key: 'cc',     label: 'CC',     type: 'text' },
      { key: 'hpi',    label: 'HPI',    type: 'textarea' },
      { key: 'pmh',    label: 'PMH',    type: 'textarea' },
      { key: 'pe',     label: 'PE',     type: 'textarea' },
      { key: 'dx',     label: 'Diagnosis',  type: 'text' },
      { key: 'txPlan', label: 'Tx Plan', type: 'textarea' },
      { key: 'doctorName', label: 'แพทย์', type: 'text', required: true },
    ],
  },
  {
    docType: 'consent',
    name: 'ใบยินยอมรับการรักษา (Consent)',
    language: 'th',
    paperSize: 'A4',
    htmlTemplate: HEADER_TH + `
      <h2 style="text-align:center;margin:16px 0">หนังสือยินยอมรับการรักษา</h2>
      ${PATIENT_LINE}
      <p>ข้าพเจ้ายินยอมให้แพทย์ {{doctorName}} ทำการรักษา/หัตถการ ดังต่อไปนี้:</p>
      <div style="margin:8px 0;padding-left:16px">{{procedure}}</div>
      <p><strong>ข้าพเจ้าได้รับคำอธิบายเกี่ยวกับ:</strong></p>
      <ul>
        <li>ขั้นตอนการรักษา</li>
        <li>ผลที่คาดว่าจะได้รับ</li>
        <li>ผลข้างเคียง / ความเสี่ยง: {{risks}}</li>
        <li>ทางเลือกอื่น</li>
      </ul>
      <p>ข้าพเจ้าเข้าใจดีแล้วและยินยอมรับการรักษาด้วยความสมัครใจ</p>
      <div style="margin-top:40px">
        <div>ลงชื่อ ................................................ ผู้ป่วย/ผู้ยินยอม</div>
        <div>( {{customerName}} ) &nbsp; วันที่ {{today}}</div>
      </div>
    ` + FOOTER.replace('ลงชื่อ', 'ลงชื่อ พยาน '),
    fields: [
      { key: 'procedure', label: 'หัตถการ/การรักษา', type: 'textarea', required: true },
      { key: 'risks',     label: 'ความเสี่ยง / ผลข้างเคียง', type: 'textarea' },
      { key: 'doctorName', label: 'แพทย์ผู้ทำการรักษา', type: 'text', required: true },
    ],
  },
  {
    docType: 'treatment',
    name: 'เทมเพลตแผนการรักษา',
    language: 'th',
    paperSize: 'A4',
    htmlTemplate: HEADER_TH + `
      <h2 style="text-align:center;margin:16px 0">แผนการรักษา</h2>
      ${PATIENT_LINE}
      <p><strong>ภาวะที่ต้องรักษา:</strong> {{condition}}</p>
      <p><strong>เป้าหมายการรักษา:</strong> {{goals}}</p>
      <p><strong>แผนการรักษา:</strong></p>
      <div style="margin:8px 0;padding-left:16px">{{plan}}</div>
      <p><strong>ระยะเวลาโดยประมาณ:</strong> {{duration}}</p>
      <p><strong>ค่ารักษา (ประมาณ):</strong> {{estimatedCost}} บาท</p>
    ` + FOOTER,
    fields: [
      { key: 'condition',     label: 'ภาวะที่ต้องรักษา', type: 'text' },
      { key: 'goals',         label: 'เป้าหมาย',       type: 'textarea' },
      { key: 'plan',          label: 'แผนการรักษา',    type: 'textarea', required: true },
      { key: 'duration',      label: 'ระยะเวลา',        type: 'text' },
      { key: 'estimatedCost', label: 'ค่ารักษา (บาท)', type: 'number' },
      { key: 'doctorName',    label: 'แพทย์',          type: 'text', required: true },
    ],
  },
  {
    docType: 'sale-cancelation',
    name: 'ใบยกเลิกการขาย',
    language: 'th',
    paperSize: 'A4',
    htmlTemplate: HEADER_TH + `
      <h2 style="text-align:center;margin:16px 0">ใบยกเลิกการขาย</h2>
      <p><strong>เลขที่ใบเสร็จเดิม:</strong> {{originalSaleId}}</p>
      <p><strong>ลูกค้า:</strong> {{customerName}} (HN {{customerHN}})</p>
      <p><strong>วันที่ขาย:</strong> {{saleDate}}</p>
      <p><strong>ยอดเงินรวม:</strong> {{amount}} บาท</p>
      <p><strong>เหตุผลการยกเลิก:</strong></p>
      <div style="margin:8px 0;padding-left:16px">{{reason}}</div>
      <p><strong>วันที่ยกเลิก:</strong> {{today}}</p>
      <p><strong>จำนวนเงินคืน:</strong> {{refundAmount}} บาท</p>
      <p><strong>ช่องทางคืนเงิน:</strong> {{refundMethod}}</p>
      <div style="margin-top:40px;text-align:right">
        <div>ลงชื่อ ................................................ พนักงาน</div>
        <div>( {{staffName}} )</div>
        <div>วันที่ {{today}}</div>
      </div>
    `,
    fields: [
      { key: 'originalSaleId', label: 'เลขที่ใบเสร็จเดิม', type: 'text', required: true },
      { key: 'saleDate',       label: 'วันที่ขาย',    type: 'date' },
      { key: 'amount',         label: 'ยอดเงินเดิม',  type: 'number' },
      { key: 'reason',         label: 'เหตุผลการยกเลิก', type: 'textarea', required: true },
      { key: 'refundAmount',   label: 'จำนวนเงินคืน', type: 'number' },
      { key: 'refundMethod',   label: 'ช่องทางคืนเงิน', type: 'text' },
      { key: 'staffName',      label: 'พนักงานผู้ทำรายการ', type: 'text', required: true },
    ],
  },
  {
    docType: 'patient-referral',
    name: 'ใบส่งตัวผู้ป่วย',
    language: 'bilingual',
    paperSize: 'A4',
    htmlTemplate: HEADER_TH + `
      <h2 style="text-align:center;margin:16px 0">ใบส่งตัวผู้ป่วย / Patient Referral Letter</h2>
      ${PATIENT_LINE}
      <p><strong>ส่งต่อไปยัง / Refer to:</strong> {{referTo}}</p>
      <p><strong>แพทย์ผู้รับ / Attending Physician:</strong> {{referDoctor}}</p>
      <p><strong>อาการ / Chief Complaint:</strong> {{cc}}</p>
      <p><strong>ประวัติ / History:</strong></p>
      <div style="margin:8px 0;padding-left:16px">{{history}}</div>
      <p><strong>การตรวจ / Examination:</strong></p>
      <div style="margin:8px 0;padding-left:16px">{{examination}}</div>
      <p><strong>การวินิจฉัยเบื้องต้น / Provisional Dx:</strong> {{diagnosis}}</p>
      <p><strong>การรักษาที่ทำไปแล้ว / Treatment given:</strong></p>
      <div style="margin:8px 0;padding-left:16px">{{treatmentGiven}}</div>
      <p><strong>เหตุที่ส่งต่อ / Reason for referral:</strong></p>
      <div style="margin:8px 0;padding-left:16px">{{referralReason}}</div>
      <p>ขอความกรุณาให้การดูแลรักษาต่อ / Please continue the care for this patient.</p>
    ` + FOOTER,
    fields: [
      { key: 'referTo',        label: 'ส่งต่อไปยัง (คลินิก/รพ.)', type: 'text', required: true },
      { key: 'referDoctor',    label: 'แพทย์ผู้รับ', type: 'text' },
      { key: 'cc',             label: 'อาการ', type: 'text' },
      { key: 'history',        label: 'ประวัติ', type: 'textarea' },
      { key: 'examination',    label: 'การตรวจ', type: 'textarea' },
      { key: 'diagnosis',      label: 'วินิจฉัยเบื้องต้น', type: 'text' },
      { key: 'treatmentGiven', label: 'การรักษาที่ทำไปแล้ว', type: 'textarea' },
      { key: 'referralReason', label: 'เหตุที่ส่งต่อ', type: 'textarea', required: true },
      { key: 'doctorName',     label: 'แพทย์ผู้ส่งต่อ', type: 'text', required: true },
    ],
  },
]);
