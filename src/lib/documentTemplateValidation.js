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
  // Phase 14.1 — medical certificates (8) + system templates (4) + referral (1)
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
  // Phase 14.2.B (2026-04-25) — treatment-record print docs surfaced under
  // ProClinic's "พิมพ์การรักษา ▾" dropdown per treatment row.
  'treatment-history',     // ประวัติการรักษา (A4)
  'treatment-referral',    // ใบส่งตัวทรีตเมนต์ (A5)
  'course-deduction',      // ใบตัดคอร์ส
]);

export const DOC_TYPE_LABELS = Object.freeze({
  'medical-certificate':                                'ใบรับรองแพทย์ (ทั่วไป)',
  'medical-certificate-for-driver-license':             'ใบรับรองแพทย์สำหรับใบอนุญาตขับรถ',
  'medical-opinion':                                    'ใบรับรองแพทย์ลาป่วย',
  'physical-therapy-certificate':                       'ใบรับรองกายภาพบำบัด',
  'thai-traditional-medicine-medical-certificate':      'ใบรับรองแพทย์แผนไทย',
  'chinese-traditional-medicine-medical-certificate':   'ใบรับรองแพทย์แผนจีน',
  'fit-to-fly':                                         'ใบรับรองแพทย์ Fit to fly',
  'medicine-label':                                     'ฉลากยา',
  'chart':                                              'เทมเพลต Chart',
  'consent':                                            'เทมเพลตความยินยอม (Consent)',
  'treatment':                                          'เทมเพลตการรักษา',
  'sale-cancelation':                                   'เทมเพลตยกเลิกการขาย',
  'patient-referral':                                   'ใบส่งตัวผู้ป่วย',
  'treatment-history':                                  'ประวัติการรักษา (A4)',
  'treatment-referral':                                 'ใบส่งตัวทรีตเมนต์ (A5)',
  'course-deduction':                                   'ใบตัดคอร์ส',
});

// Phase 14.2.B — group docTypes by where they surface in the UI:
//  - "พิมพ์ใบรับรองแพทย์ ▾" dropdown per treatment row (8 cert types per ProClinic)
//  - "พิมพ์การรักษา ▾" dropdown per treatment row (3 treatment-record types)
// Other docTypes (consent / chart / treatment / sale-cancelation / medicine-label)
// surface elsewhere (sale-detail / pharmacy / general docs picker).
export const TREATMENT_CERT_DOC_TYPES = Object.freeze([
  'medical-opinion',
  'medical-certificate',
  'medical-certificate-for-driver-license',
  'physical-therapy-certificate',
  'thai-traditional-medicine-medical-certificate',
  'chinese-traditional-medicine-medical-certificate',
  'patient-referral',
  'fit-to-fly',
]);

export const TREATMENT_PRINT_DOC_TYPES = Object.freeze([
  'treatment-history',
  'treatment-referral',
  'course-deduction',
]);

// Buckets used when ProClinic-style cert numbers are auto-issued. Each
// bucket is a separate counter so MED-202604-0001 doesn't collide with
// REF-202604-0001 even though they share the YYYY-MM segment.
export const CERT_NUMBER_PREFIX = Object.freeze({
  'medical-certificate':                                'MC',
  'medical-certificate-for-driver-license':             'DL',
  'medical-opinion':                                    'MO',
  'physical-therapy-certificate':                       'PT',
  'thai-traditional-medicine-medical-certificate':      'TT',
  'chinese-traditional-medicine-medical-certificate':   'CT',
  'fit-to-fly':                                         'FF',
  'patient-referral':                                   'PR',
  'treatment-history':                                  'TH',
  'treatment-referral':                                 'TR',
  'course-deduction':                                   'CD',
  'consent':                                            'CN',
  'chart':                                              'CH',
  'treatment':                                          'TX',
  'sale-cancelation':                                   'SC',
  'medicine-label':                                     'ML',
});

export const LANGUAGES = Object.freeze(['th', 'en', 'bilingual']);
export const PAPER_SIZES = Object.freeze(['A4', 'A5', 'label-57x32']);

// 2026-04-25 — added 'checkbox' for ☑/☐ checkbox marks (was being shown as
// raw text to users, which made the form unusable).
// 2026-04-25 — added 'staff-select' for doctor/staff/assistant dropdowns
// pulling from be_doctors / be_staff. Use field.source = 'doctors' |
// 'staff' | 'doctors+staff' to indicate which collection(s) to load.
// 2026-04-26 (Phase 14.8.B) — added 'signature' for hand-drawn signatures
// captured via signature_pad. Stored in form values as base64 data URL
// (image/png). Render via <img src="{{{signatureKey}}}"> in htmlTemplate.
// MAX size enforced at 200 KB to prevent runaway DOM size on print.
export const FIELD_TYPES = Object.freeze(['text', 'textarea', 'date', 'number', 'select', 'checkbox', 'staff-select', 'signature']);
export const SIGNATURE_MAX_BYTES = 200 * 1024; // 200 KB cap on data-URL payload

export const NAME_MAX_LENGTH = 200;
export const HTML_MAX_LENGTH = 50000; // ~50KB — plenty for any single-page cert
export const FIELD_KEY_MAX_LENGTH = 60;
export const MAX_FIELDS = 50;
export const MAX_TOGGLES = 10;
// Phase 14.2 — schema version. Bump when seed templates change so the
// re-seed mechanism (seedDocumentTemplatesIfNewer) can detect drift and
// upgrade existing system-default templates without losing user edits.
//   v1 (Phase 14.1) — initial 13 simplified templates
//   v2 (Phase 14.2) — toggles + bilingual + ProClinic-fidelity HTML
//   v3 (Phase 14.2.B 2026-04-25) — per-cert toggle config (NO_TOGGLES vs
//       TOGGLE_OPINION_PT) + always-on cert# block for medical-cert/driver/
//       fit-to-fly/patient-referral + 3 NEW treatment-record docTypes
//       (treatment-history, treatment-referral, course-deduction)
//   v4 (Phase 14.2.C 2026-04-25) — Medical-History (treatment-history)
//       full ProClinic replication: 2-column layout with customer info +
//       emergency contact + vital signs (BT/PR/RR/BP/SpO2) + Symptoms +
//       Physical Exam + Diagnosis + Treatment + Treatment Plan + Additional
//       note + Treatment record table + Home medication table.
//   v5 (2026-04-25) — table rows use {{{rawHTML}}} placeholder (3 braces)
//       so HTML rows aren't escaped. Without this fix, treatment record +
//       home medication rendered as literal `<tr><td>` text in print.
export const SCHEMA_VERSION = 15;

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
      // Phase 14.x — `hidden: true` flag for fields that are auto-populated
      // from context (HTML row builders) or are internal sentinel marks.
      // Hidden fields don't render in the print form UI but still appear
      // in the rendered template.
      if (f.hidden != null && typeof f.hidden !== 'boolean') {
        return [`fields[${i}].hidden`, 'field hidden ต้องเป็น boolean'];
      }
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
// Phase 14.2.D (2026-04-25) — LoverClinic black+red color theme per user
// directive: "ต้องมีสีสันด้วยนะ ไม่ใช่แค่ขาวดำ แต่เป็นไปในตีมของเรา ดำ แดง".
// Theme colors (also locked by F16 invariants):
//   Primary red  : #b71c1c (deep — prints as gray on B&W, distinct on color)
//   Accent red   : #d32f2f (lighter, for emphasis)
//   Body black   : #000
//   Sub-text gray: #444
// Cultural rule (.claude/rules/04-thai-ui.md): NEVER apply red to
// customerName / customerHN / patient names / doctor names. Red lives ONLY
// on accents (headers, dividers, table thead, label prefixes).
const HEADER_CLINIC = `
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
    <div style="border-left:4px solid #b71c1c;padding-left:10px">
      <div style="font-weight:bold;font-size:18px;color:#000">{{clinicName}}</div>
      {{#lang en}}<div style="font-size:13px;color:#444">{{clinicNameEn}}</div>{{/lang}}
      <div style="font-size:11px;color:#444;margin-top:2px">{{clinicAddress}}</div>
      {{#lang en}}<div style="font-size:11px;color:#444">{{clinicAddressEn}}</div>{{/lang}}
      <div style="font-size:11px;color:#444">โทร. {{clinicPhone}}{{#if clinicLicenseNo}} &nbsp; <span style="color:#b71c1c;font-weight:bold">เลขที่ใบอนุญาต:</span> {{clinicLicenseNo}}{{/if}}</div>
    </div>
  </div>
  <hr style="border:0;border-top:2px solid #b71c1c;margin:6px 0 14px 0" />
`;

// Always-on patient signature block (used by certs without the
// showPatientSignature toggle — i.e. medical-certificate / driver-license /
// patient-referral / fit-to-fly where the signature is part of the doc).
const SECTION_1_PATIENT_DECLARATION_ALWAYS = `
  <h4 style="margin:14px 0 8px 0;background:#b71c1c;color:#fff;display:inline-block;padding:4px 12px;border-radius:4px">ส่วนที่ 1</h4>
  <span style="margin-left:8px">ของผู้ขอรับใบรับรองสุขภาพ</span>
  <div style="margin:10px 0 6px 0"><strong>ข้าพเจ้า:</strong> <span style="display:inline-block;border-bottom:1px dotted #000;min-width:240px;padding:0 6px">{{customerName}}</span> &nbsp; <strong>หมายเลขบัตรประชาชน:</strong> <span style="display:inline-block;border-bottom:1px dotted #000;min-width:170px;padding:0 6px">{{nationalId}}</span></div>
  <div style="margin-bottom:6px"><strong>ที่อยู่ (ที่ติดต่อได้):</strong> <span style="display:inline-block;border-bottom:1px dotted #000;min-width:540px;padding:0 6px">{{patientAddress}}</span></div>
  <div style="margin:10px 0 6px 0">ข้าพเจ้าขอรับใบรับรองสุขภาพโดยมีประวัติสุขภาพดังนี้:</div>
  <div style="margin:4px 0;display:flex"><span style="min-width:240px">1. โรคประจำตัว</span><span>{{#if hasChronicDisease}}☑{{/if}}{{#unless hasChronicDisease}}☐{{/unless}} ไม่มี &nbsp; {{#if hasChronicDisease}}☑{{/if}}{{#unless hasChronicDisease}}☐{{/unless}} มี ระบุ: {{chronicDisease}}</span></div>
  <div style="margin:4px 0;display:flex"><span style="min-width:240px">2. อุบัติเหตุและผ่าตัด</span><span>{{#if hasAccidents}}☑{{/if}}{{#unless hasAccidents}}☐{{/unless}} ไม่มี &nbsp; {{#if hasAccidents}}☑{{/if}}{{#unless hasAccidents}}☐{{/unless}} มี ระบุ: {{accidentsDetails}}</span></div>
  <div style="margin:4px 0;display:flex"><span style="min-width:240px">3. เคยเข้ารับการรักษาในโรงพยาบาล</span><span>{{#if hasHospitalized}}☑{{/if}}{{#unless hasHospitalized}}☐{{/unless}} ไม่มี &nbsp; {{#if hasHospitalized}}☑{{/if}}{{#unless hasHospitalized}}☐{{/unless}} มี ระบุ: {{hospitalizedDetails}}</span></div>
  <div style="margin:4px 0;display:flex"><span style="min-width:240px">4. โรคลมชัก<sup>*</sup></span><span>{{#if hasEpilepsy}}☑{{/if}}{{#unless hasEpilepsy}}☐{{/unless}} ไม่มี &nbsp; {{#if hasEpilepsy}}☑{{/if}}{{#unless hasEpilepsy}}☐{{/unless}} มี ระบุ: {{epilepsyDetails}}</span></div>
  <div style="margin:4px 0">5. ประวัติอื่นที่สำคัญ {{otherHistory}}</div>
  <div style="margin-top:14px;display:flex;justify-content:space-around;padding:0 40px">
    <div>ลงชื่อ: <span style="display:inline-block;border-bottom:1px dotted #000;min-width:160px"></span></div>
    <div>วัน / เดือน / ปี: <span style="display:inline-block;border-bottom:1px dotted #000;min-width:140px"></span></div>
  </div>
  <div style="font-size:10px;color:#a00;margin-top:6px;text-align:center"><sup>*</sup> ในกรณีที่เด็กไม่สามารถรับรองตนเองได้ ให้ผู้ปกครองลงนามรับรองแทน</div>
`;

// Common section-1 patient self-declaration block — shared by 3 medical
// certificates that have it (general / driver-license / fit-to-fly extended).
const SECTION_1_PATIENT_DECLARATION = `
  <h4 style="margin:14px 0 8px 0;color:#b71c1c;border-bottom:2px solid #b71c1c;padding-bottom:4px">ส่วนที่ 1 ของผู้ขอรับใบรับรองสุขภาพ</h4>
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
  <h4 style="margin:18px 0 8px 0;color:#b71c1c;border-bottom:2px solid #b71c1c;padding-bottom:4px">ส่วนที่ 2 ของแพทย์</h4>
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
  <div style="margin-top:32px;text-align:right;border-top:1px solid #b71c1c;padding-top:14px">
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
    <div><strong style="color:#b71c1c">เลขที่:</strong> <span style="display:inline-block;border-bottom:1px dotted #000;min-width:160px;padding:0 6px">{{certNumber}}</span></div>
    <div><strong style="color:#b71c1c">วันที่รักษา:</strong> <span style="display:inline-block;border-bottom:1px dotted #000;min-width:160px;padding:0 6px">{{today}}</span></div>
  </div>
  {{/if}}
  {{#unless showCertNumber}}
  <div style="text-align:right;margin:10px 0"><strong style="color:#b71c1c">วันที่รักษา:</strong> <span style="display:inline-block;border-bottom:1px dotted #000;min-width:160px;padding:0 6px">{{today}}</span></div>
  {{/unless}}
`;

// Phase 14.2.B (2026-04-25) — per-cert toggle config replicated from
// ProClinic screenshots. Different cert pages expose different toggle bars:
//  - medical-certificate / driver-license / fit-to-fly / patient-referral:
//    only TH/EN language switch (no show/hide toggles — full doc always rendered)
//  - medical-opinion / PT / Thai-traditional / Chinese-traditional:
//    + showCertNumber + showPatientSignature toggles
//  - sale-cancelation / consent / chart / treatment / medicine-label:
//    no toggles (form-fill driven instead)
const TOGGLE_OPINION_PT = Object.freeze([
  { key: 'showCertNumber',       labelTh: 'แสดงเลขที่ใบรับรองแพทย์', labelEn: 'Show certificate number', defaultOn: false },
  { key: 'showPatientSignature', labelTh: 'แสดงลายเซ็นคนไข้',         labelEn: 'Show patient signature',  defaultOn: false },
]);
const NO_TOGGLES = Object.freeze([]);

const COMMON_CERT_FIELDS = [
  { key: 'certNumber',      label: 'เลขที่ใบรับรอง',     type: 'text' },
  { key: 'patientAddress',  label: 'ที่อยู่ผู้ป่วย',      type: 'textarea' },
  { key: 'doctorName',      label: 'แพทย์ผู้ตรวจ',       type: 'staff-select', source: 'doctors', required: true },
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
    name: 'ใบรับรองแพทย์ (5 โรค)',
    language: 'th',
    paperSize: 'A4',
    // Per ProClinic screenshot: TH/EN language switch only — no show/hide
    // toggles. cert# field, patient signature footnote, sec1+sec2 always
    // rendered. Patient signature shown via { showPatientSignature: true }
    // baked into the seed as default ON in COMMON_TOGGLES → flipped to no-
    // toggles here so the block always renders.
    htmlTemplate: HEADER_CLINIC + `
      <h2 style="text-align:center;margin:16px 0;letter-spacing:0.05em;color:#b71c1c">ใบรับรองแพทย์</h2>
      <div style="display:flex;justify-content:space-between;margin:10px 0">
        <div><strong style="color:#b71c1c">เลขที่:</strong> <span style="display:inline-block;border-bottom:1px dotted #000;min-width:160px;padding:0 6px">{{certNumber}}</span></div>
        <div><strong style="color:#b71c1c">วันที่รักษา:</strong> <span style="display:inline-block;border-bottom:1px dotted #000;min-width:160px;padding:0 6px">{{today}}</span></div>
      </div>
      ${SECTION_1_PATIENT_DECLARATION_ALWAYS}
      ${SECTION_2_DOCTOR_BLOCK}
      <!-- Phase 14.2.E (2026-04-25) — ProClinic-replicated vitals + body status + 5-disease (โรคเรื้อน/วัณโรค/เท้าช้าง/อื่นๆ) certification clause + summary. Captured via Chrome MCP from /admin/medical-certificate .print-area. -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin:10px 0">
        <div>น้ำหนักตัว <span style="display:inline-block;border-bottom:1px dotted #000;min-width:60px;padding:0 4px">{{vitalsWeight}}</span> กก.</div>
        <div>ความสูง <span style="display:inline-block;border-bottom:1px dotted #000;min-width:60px;padding:0 4px">{{vitalsHeight}}</span> ซม.</div>
        <div>ความดันโลหิต <span style="display:inline-block;border-bottom:1px dotted #000;min-width:60px;padding:0 4px">{{bp}}</span> มม.ปรอท.</div>
        <div>ชีพจร <span style="display:inline-block;border-bottom:1px dotted #000;min-width:60px;padding:0 4px">{{pr}}</span> ครั้ง/นาที</div>
      </div>
      <div style="margin:10px 0">
        <span>สภาพร่างกายทั่วไปอยู่ในเกณฑ์</span>
        {{bodyNormalMark}} ปกติ &nbsp;
        {{bodyAbnormalMark}} ผิดปกติ ระบุ:
        <span style="display:inline-block;border-bottom:1px dotted #000;min-width:200px;padding:0 4px">{{bodyAbnormalDetail}}</span>
      </div>
      <div style="margin:14px 0 6px 0;font-weight:600">ขอรับรองว่าบุคคลดังกล่าว ไม่เป็นผู้มีร่างกายทุพพลภาพจนไม่สามารถปฏิบัติหน้าที่ได้ ไม่ปรากฏอาการของโรคจิต หรือจิตฟั่นเฟือน หรือปัญญาอ่อน ไม่ปรากฏอาการของการติดยาเสพติดให้โทษและพิษสุราเรื้อรัง และไม่ปรากฏอาการและอาการแสดงของ:</div>
      <div style="margin:6px 0 6px 16px">
        <div style="margin:4px 0">1. โรคเรื้อนในระยะติดต่อ หรือในระยะที่ปรากฏอาการเป็นที่รังเกียจแก่สังคม</div>
        <div style="margin:4px 0">2. วัณโรคในระยะอันตราย</div>
        <div style="margin:4px 0">3. โรคเท้าช้างในระยะที่ปรากฏอาการเป็นที่รังเกียจแก่สังคม</div>
        <div style="margin:4px 0">4. อื่นๆ (ถ้ามี): <span style="display:inline-block;border-bottom:1px dotted #000;min-width:300px;padding:0 4px">{{otherConditions}}</span></div>
      </div>
      <div style="margin:14px 0 6px 0;font-weight:600;color:#b71c1c">สรุปความเห็นและข้อแนะนำของแพทย์:</div>
      <div style="min-height:50px;border-bottom:1px dotted #000;margin-bottom:8px;padding:4px">{{recommendation}}</div>
    ` + DOCTOR_SIGNATURE,
    fields: [...COMMON_CERT_FIELDS, ...COMMON_HISTORY_FIELDS,
      { key: 'vitalsWeight',       label: 'น้ำหนักตัว (กก.)', type: 'text' },
      { key: 'vitalsHeight',       label: 'ความสูง (ซม.)', type: 'text' },
      { key: 'bp',                 label: 'ความดันโลหิต (มม.ปรอท.)', type: 'text' },
      { key: 'pr',                 label: 'ชีพจร (ครั้ง/นาที)', type: 'text' },
      { key: 'bodyNormalMark',     label: 'สภาพร่างกาย: ปกติ', type: 'checkbox' },
      { key: 'bodyAbnormalMark',   label: 'สภาพร่างกาย: ผิดปกติ', type: 'checkbox' },
      { key: 'bodyAbnormalDetail', label: 'ผิดปกติ ระบุ', type: 'text' },
      { key: 'otherConditions',    label: 'โรคอื่นๆ (ถ้ามี)', type: 'text' },
    ],
    toggles: NO_TOGGLES,
  },
  {
    docType: 'medical-certificate-for-driver-license',
    name: 'ใบรับรองแพทย์ (สำหรับใบอนุญาตขับรถ)',
    language: 'th',
    paperSize: 'A4',
    // Per ProClinic screenshot: TH/EN only. Black-bg badges for ส่วนที่ 1 / 2.
    // Special: เลขบัตรประชาชนแบบ box-grid (1-4-5-2-1 split). วันที่ในรูปแบบ
    // วันที่ ___ เดือน ___ พ.ศ. ___
    htmlTemplate: HEADER_CLINIC + `
      <h2 style="text-align:center;margin:16px 0;color:#b71c1c;letter-spacing:0.02em">ใบรับรองแพทย์ (สำหรับใบอนุญาตขับรถ)</h2>
      <div style="display:flex;justify-content:space-between;margin:10px 0">
        <div><strong>เล่มที่:</strong> <span style="display:inline-block;border-bottom:1px dotted #000;min-width:140px;padding:0 6px">{{certBookNumber}}</span></div>
        <div><strong>เลขที่:</strong> <span style="display:inline-block;border-bottom:1px dotted #000;min-width:140px;padding:0 6px">{{certNumber}}</span></div>
      </div>
      ${SECTION_1_PATIENT_DECLARATION_ALWAYS}
      <h4 style="margin:18px 0 8px 0;background:#000;color:#fff;display:inline-block;padding:4px 12px;border-radius:4px">ส่วนที่ 2</h4>
      <span style="margin-left:8px">ของแพทย์</span>
      <div style="margin:10px 0"><strong>สถานที่ตรวจ:</strong> <span style="display:inline-block;border-bottom:1px dotted #000;min-width:340px;padding:0 6px">{{clinicAddress}}</span> <strong>วันที่</strong> <span style="display:inline-block;border-bottom:1px dotted #000;min-width:60px"></span> <strong>เดือน</strong> <span style="display:inline-block;border-bottom:1px dotted #000;min-width:80px"></span> <strong>พ.ศ.</strong> <span style="display:inline-block;border-bottom:1px dotted #000;min-width:60px"></span></div>
      <div style="margin:8px 0">(1) ข้าพเจ้า นายแพทย์/แพทย์หญิง: <span style="display:inline-block;border-bottom:1px dotted #000;min-width:340px;padding:0 6px">{{doctorName}}</span></div>
      <div style="margin:6px 0">ใบอนุญาตประกอบวิชาชีพเวชกรรมเลขที่: <span style="display:inline-block;border-bottom:1px dotted #000;min-width:200px;padding:0 6px">{{doctorLicenseNo}}</span> &nbsp; สถานพยาบาลชื่อ: <span style="display:inline-block;border-bottom:1px dotted #000;min-width:240px;padding:0 6px">{{clinicName}}</span></div>
      <div style="margin:6px 0">ที่ <span style="display:inline-block;border-bottom:1px dotted #000;min-width:540px;padding:0 6px">{{clinicAddress}}</span></div>
      <div style="margin:8px 0">ได้ตรวจร่างกาย นาย/นาง/นางสาว: <span style="display:inline-block;border-bottom:1px dotted #000;min-width:340px;padding:0 6px">{{customerName}}</span></div>
      <div style="margin:6px 0">แล้วเมื่อวันที่ <span style="display:inline-block;border-bottom:1px dotted #000;min-width:80px"></span> เดือน <span style="display:inline-block;border-bottom:1px dotted #000;min-width:80px"></span> พ.ศ. <span style="display:inline-block;border-bottom:1px dotted #000;min-width:60px"></span> มีรายละเอียดดังนี้</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin:10px 0">
        <div>น้ำหนักตัว <span style="display:inline-block;border-bottom:1px dotted #000;min-width:60px;padding:0 4px">{{vitalsWeight}}</span> กก.</div>
        <div>ความสูง <span style="display:inline-block;border-bottom:1px dotted #000;min-width:60px;padding:0 4px">{{vitalsHeight}}</span> ซม.</div>
        <div>ความดันโลหิต <span style="display:inline-block;border-bottom:1px dotted #000;min-width:60px;padding:0 4px">{{bp}}</span> มม.ปรอท.</div>
        <div>ชีพจร <span style="display:inline-block;border-bottom:1px dotted #000;min-width:60px;padding:0 4px">{{pr}}</span> ครั้ง/นาที</div>
      </div>
      <div style="margin:10px 0">
        <span>สภาพร่างกายทั่วไปอยู่ในเกณฑ์</span>
        {{bodyNormalMark}} ปกติ &nbsp;
        {{bodyAbnormalMark}} ผิดปกติ ระบุ:
        <span style="display:inline-block;border-bottom:1px dotted #000;min-width:200px;padding:0 4px">{{bodyAbnormalDetail}}</span>
      </div>
      <div style="margin:8px 0">ผลการตรวจการมองเห็น: ตาขวา <span style="display:inline-block;border-bottom:1px dotted #000;min-width:80px;padding:0 4px">{{visionRight}}</span> ตาซ้าย <span style="display:inline-block;border-bottom:1px dotted #000;min-width:80px;padding:0 4px">{{visionLeft}}</span> ตาบอดสี: {{colorBlindMark}}</div>
      <!-- Phase 14.2.E (2026-04-25) — ProClinic-replicated 4-disease certification clause + summary marker. Captured via Chrome MCP from /admin/medical-certificate-for-driver-license .print-area. -->
      <div style="margin:14px 0 6px 0;font-weight:600">ขอรับรองว่าบุคคลดังกล่าว ไม่เป็นผู้มีร่างกายทุพพลภาพจนไม่สามารถปฏิบัติหน้าที่ได้ ไม่ปรากฏอาการของโรคจิต หรือจิตฟั่นเฟือน หรือปัญญาอ่อน ไม่ปรากฏอาการของการติดยาเสพติดให้โทษ และอาการของโรคพิษสุราเรื้อรัง:</div>
      <div style="margin:6px 0 6px 16px">
        <div style="margin:4px 0">1. โรคเรื้อนในระยะติดต่อ หรือในระยะที่ปรากฏอาการเป็นที่รังเกียจแก่สังคม</div>
        <div style="margin:4px 0">2. วัณโรคในระยะอันตราย</div>
        <div style="margin:4px 0">3. โรคเท้าช้างในระยะที่ปรากฏอาการเป็นที่รังเกียจแก่สังคม</div>
        <div style="margin:4px 0">4. อื่นๆ (ถ้ามี): <span style="display:inline-block;border-bottom:1px dotted #000;min-width:300px;padding:0 4px">{{otherConditions}}</span></div>
      </div>
      <div style="margin:8px 0"><strong>ผลการตรวจ:</strong> {{findings}}</div>
      <div style="margin:8px 0"><strong>การวินิจฉัย:</strong> {{diagnosis}}</div>
      <div style="margin:14px 0;font-weight:bold;text-align:center">ขอรับรองว่าผู้ป่วยรายนี้ {{fitVerdict}} ที่จะขับขี่ยานพาหนะ</div>
      <div style="margin:14px 0 6px 0;font-weight:600;color:#b71c1c">(2) สรุปความเห็นและข้อแนะนำของแพทย์:</div>
      <div style="min-height:50px;border-bottom:1px dotted #000;margin-bottom:8px;padding:4px">{{recommendation}}</div>
    ` + DOCTOR_SIGNATURE + `
      <hr style="border:0;border-top:1px solid #b71c1c;margin:18px 0 8px 0" />
      <div style="font-size:10px;color:#444;line-height:1.5">
        <div style="font-weight:bold;color:#b71c1c">หมายเหตุ</div>
        <div style="margin:2px 0">(1) ต้องเป็นแพทย์ซึ่งได้ขึ้นทะเบียนรับใบอนุญาตประกอบวิชาชีพเวชกรรม</div>
        <div style="margin:2px 0">(2) ให้แสดงว่าผู้ตรวจมีร่างกายสมบูรณ์เพียงใด ใบรับรองแพทย์ฉบับนี้ให้ใช้ได้ 1 เดือน นับจากวันที่ตรวจร่างกาย</div>
        <div style="margin:2px 0">(3) คำรับรองนี้เป็นการตรวจวินิจฉัยเบื้องต้น และใบรับรองแพทย์นี้ใช้สำหรับใบอนุญาตขับรถและการปฏิบัติหน้าที่เป็นผู้ประจำรถ</div>
        <div style="margin-top:6px;text-align:center;font-style:italic">แบบฟอร์มนี้ได้รับการรับรองจากมติคณะกรรมการแพทยสภา ในการประชุมครั้งที่ 2/2564 วันที่ 4 กุมภาพันธ์ 2564</div>
      </div>
    `,
    fields: [
      ...COMMON_CERT_FIELDS,
      ...COMMON_HISTORY_FIELDS,
      { key: 'certBookNumber',     label: 'เล่มที่', type: 'text' },
      { key: 'fitVerdict',         label: 'สรุป (เช่น "มีความเหมาะสม")', type: 'text', required: true },
      { key: 'vitalsWeight',       label: 'น้ำหนักตัว (กก.)', type: 'text' },
      { key: 'vitalsHeight',       label: 'ความสูง (ซม.)', type: 'text' },
      { key: 'bp',                 label: 'ความดันโลหิต (มม.ปรอท.)', type: 'text' },
      { key: 'pr',                 label: 'ชีพจร (ครั้ง/นาที)', type: 'text' },
      { key: 'bodyNormalMark',     label: 'สภาพร่างกาย: ปกติ', type: 'checkbox' },
      { key: 'bodyAbnormalMark',   label: 'สภาพร่างกาย: ผิดปกติ', type: 'checkbox' },
      { key: 'bodyAbnormalDetail', label: 'ผิดปกติ ระบุ', type: 'text' },
      { key: 'visionRight',        label: 'ตาขวา', type: 'text' },
      { key: 'visionLeft',         label: 'ตาซ้าย', type: 'text' },
      { key: 'colorBlindMark',     label: 'ตาบอดสี (ปกติ/ผิดปกติ)', type: 'text' },
      { key: 'otherConditions',    label: 'โรคอื่นๆ (ถ้ามี)', type: 'text' },
    ],
    toggles: NO_TOGGLES,
  },
  {
    docType: 'medical-opinion',
    name: 'ใบรับรองแพทย์ลาป่วย / ความเห็นแพทย์',
    language: 'th',
    paperSize: 'A4',
    htmlTemplate: HEADER_CLINIC + `
      <h2 style="text-align:center;margin:16px 0;color:#b71c1c;letter-spacing:0.02em">ใบรับรองแพทย์ลาป่วย</h2>
      ${CERT_NUMBER_LINE}
      <div style="margin:8px 0"><strong>ข้าพเจ้า นายแพทย์/แพทย์หญิง:</strong> {{doctorName}} &nbsp; <strong>ใบอนุญาตประกอบวิชาชีพเลขที่:</strong> {{doctorLicenseNo}}</div>
      <div style="margin:6px 0"><strong>ได้ทำการตรวจร่างกายของ นาย/นาง/นางสาว:</strong> {{customerName}}</div>
      <div style="margin:6px 0"><strong>หมายเลขบัตรประชาชน:</strong> {{nationalId}} &nbsp; <strong>HN:</strong> {{customerHN}}</div>
      <div style="margin:6px 0"><strong>เมื่อวันที่:</strong> {{today}}</div>
      <!-- Phase 14.2.E (2026-04-25) — ProClinic /admin/medical-opinion .print-area replicated. -->
      <div style="margin:14px 0 6px 0;font-weight:600;color:#b71c1c">อาการ</div>
      <div style="min-height:50px;border-bottom:1px dotted #000;margin-bottom:8px;padding:4px">{{opinion}}</div>
      <div style="margin:10px 0 6px 0;font-weight:600;color:#b71c1c">วินิจฉัย</div>
      <div style="min-height:30px;border-bottom:1px dotted #000;margin-bottom:8px;padding:4px">{{diagnosis}}</div>
      <div style="margin:10px 0 6px 0;font-weight:600;color:#b71c1c">สรุปความเห็นและข้อแนะนำของแพทย์</div>
      <div style="margin:6px 0">{{checkAttendedMark}} ผู้ป่วยได้มารับการตรวจรักษาในวันนี้จริง</div>
      <div style="margin:6px 0">{{checkRestMark}} ให้หยุดพัก ตั้งแต่วันที่ <span style="display:inline-block;border-bottom:1px dotted #000;min-width:120px;padding:0 4px">{{restFrom}}</span> ถึงวันที่ <span style="display:inline-block;border-bottom:1px dotted #000;min-width:120px;padding:0 4px">{{restTo}}</span> {{#if restDays}}({{restDays}} วัน){{/if}}</div>
      <div style="margin:6px 0">{{checkOtherMark}} อื่นๆ (ระบุ): <span style="display:inline-block;border-bottom:1px dotted #000;min-width:300px;padding:0 4px">{{otherDetail}}</span></div>
      {{#if recommendation}}<div style="margin:10px 0">{{recommendation}}</div>{{/if}}
      {{#if showPatientSignature}}
      <div style="margin-top:24px;display:flex;justify-content:flex-start">
        <div style="text-align:center;min-width:240px">
          <div>ลงชื่อ <span style="display:inline-block;border-bottom:1px dotted #000;min-width:200px"></span> ผู้ป่วย</div>
          <div style="margin-top:2px">( {{customerName}} )</div>
          <div>วันที่ {{today}}</div>
        </div>
      </div>
      {{/if}}
    ` + DOCTOR_SIGNATURE,
    // medical-opinion uses `opinion` instead of `findings` — drop findings
    // from the cert-fields baseline so the F2 test (required-field-in-HTML)
    // doesn't flag a non-existent placeholder.
    fields: [
      { key: 'doctorName',      label: 'แพทย์ผู้ตรวจ',       type: 'staff-select', source: 'doctors', required: true },
      { key: 'doctorLicenseNo', label: 'เลขใบอนุญาตแพทย์',   type: 'text' },
      { key: 'certNumber',      label: 'เลขที่ใบรับรอง',      type: 'text' },
      { key: 'opinion',         label: 'อาการ',               type: 'textarea', required: true },
      { key: 'diagnosis',       label: 'วินิจฉัย',            type: 'text', required: true },
      { key: 'recommendation',  label: 'คำแนะนำเพิ่มเติม',    type: 'textarea' },
      { key: 'restDays',        label: 'จำนวนวันพัก',         type: 'number' },
      { key: 'restFrom',        label: 'พักตั้งแต่',           type: 'date' },
      { key: 'restTo',          label: 'ถึง',                 type: 'date' },
      // Phase 14.2.E ProClinic checkboxes for the 3 conclusion items
      { key: 'checkAttendedMark', label: 'ผู้ป่วยมารับการตรวจวันนี้จริง', type: 'checkbox' },
      { key: 'checkRestMark',     label: 'ให้หยุดพัก',                 type: 'checkbox' },
      { key: 'checkOtherMark',    label: 'อื่นๆ',                       type: 'checkbox' },
      { key: 'otherDetail',       label: 'อื่นๆ ระบุ',                  type: 'text' },
    ],
    toggles: TOGGLE_OPINION_PT,
  },
  {
    docType: 'physical-therapy-certificate',
    name: 'ใบรับรองกายภาพบำบัด',
    language: 'th',
    paperSize: 'A4',
    htmlTemplate: HEADER_CLINIC + `
      <h2 style="text-align:center;margin:16px 0;color:#b71c1c;letter-spacing:0.02em">ใบรับรองกายภาพบำบัด</h2>
      ${CERT_NUMBER_LINE}
      <!-- Phase 14.2.E (2026-04-25) — ProClinic /admin/physical-therapy-certificate .print-area replicated. Layout mirrors medical-opinion with PT-specific labels. -->
      <div style="margin:8px 0"><strong>ข้าพเจ้า กภ.:</strong> {{doctorName}} &nbsp; <strong>ใบอนุญาตประกอบวิชาชีพกายภาพบำบัดเลขที่:</strong> {{doctorLicenseNo}}</div>
      <div style="margin:6px 0"><strong>ได้ตรวจร่างกาย นาย/นาง/นางสาว:</strong> {{customerName}} (HN {{customerHN}})</div>
      <div style="margin:6px 0"><strong>สถานที่อยู่ (ที่ติดต่อได้):</strong> {{patientAddress}}</div>
      <div style="margin:6px 0"><strong>หมายเลขบัตรประจำตัวประชาชน:</strong> {{nationalId}}</div>
      <div style="margin:6px 0"><strong>แล้วเมื่อวันที่:</strong> {{today}}</div>
      <div style="margin:14px 0 6px 0;font-weight:600;color:#b71c1c">อาการ</div>
      <div style="min-height:50px;border-bottom:1px dotted #000;margin-bottom:8px;padding:4px">{{symptoms}}</div>
      <div style="margin:10px 0 6px 0;font-weight:600;color:#b71c1c">วินิจฉัย</div>
      <div style="min-height:30px;border-bottom:1px dotted #000;margin-bottom:8px;padding:4px">{{diagnosis}}</div>
      <div style="margin:10px 0 6px 0;font-weight:600;color:#b71c1c">สรุปความเห็นและข้อแนะนำของนักกายภาพบำบัด</div>
      <div style="margin:6px 0">{{checkAttendedMark}} ผู้ป่วยได้มารับการตรวจรักษาในวันนี้จริง</div>
      <div style="margin:6px 0">{{checkRestMark}} ให้หยุดพัก ตั้งแต่วันที่ <span style="display:inline-block;border-bottom:1px dotted #000;min-width:120px;padding:0 4px">{{restFrom}}</span> ถึงวันที่ <span style="display:inline-block;border-bottom:1px dotted #000;min-width:120px;padding:0 4px">{{restTo}}</span> {{#if restDays}}({{restDays}} วัน){{/if}}</div>
      <div style="margin:6px 0">{{checkOtherMark}} อื่นๆ (ระบุ): <span style="display:inline-block;border-bottom:1px dotted #000;min-width:300px;padding:0 4px">{{otherDetail}}</span></div>
      {{#if recommendation}}<div style="margin:10px 0">{{recommendation}}</div>{{/if}}
      {{#if showPatientSignature}}
      <div style="margin-top:24px;display:flex;justify-content:flex-start">
        <div style="text-align:center;min-width:240px">
          <div>ลงชื่อ <span style="display:inline-block;border-bottom:1px dotted #000;min-width:200px"></span> ผู้ป่วย</div>
          <div style="margin-top:2px">( {{customerName}} )</div>
          <div>วันที่ {{today}}</div>
        </div>
      </div>
      {{/if}}
    ` + `
      <div style="margin-top:32px;text-align:right;border-top:1px solid #b71c1c;padding-top:14px">
        <div>ลงชื่อ <span style="display:inline-block;border-bottom:1px dotted #000;min-width:200px"></span></div>
        <div style="margin-top:2px">( {{doctorName}} )</div>
        <div style="font-style:italic;color:#444">นักกายภาพบำบัด</div>
        <div>วันที่ {{today}}</div>
      </div>
    `,
    fields: [
      { key: 'doctorName',     label: 'นักกายภาพ', type: 'staff-select', source: 'doctors+staff', required: true },
      { key: 'doctorLicenseNo',label: 'เลขใบอนุญาตประกอบวิชาชีพ', type: 'text' },
      { key: 'certNumber',     label: 'เลขที่ใบรับรอง', type: 'text' },
      { key: 'patientAddress', label: 'ที่อยู่ผู้ป่วย', type: 'textarea' },
      { key: 'symptoms',       label: 'อาการ', type: 'textarea', required: true },
      { key: 'diagnosis',      label: 'วินิจฉัย', type: 'text', required: true },
      { key: 'recommendation', label: 'คำแนะนำ', type: 'textarea' },
      { key: 'restDays',       label: 'จำนวนวันพัก', type: 'number' },
      { key: 'restFrom',       label: 'พักตั้งแต่', type: 'date' },
      { key: 'restTo',         label: 'ถึง', type: 'date' },
      { key: 'checkAttendedMark', label: 'ผู้ป่วยมารับการตรวจวันนี้จริง', type: 'checkbox' },
      { key: 'checkRestMark',     label: 'ให้หยุดพัก',                 type: 'checkbox' },
      { key: 'checkOtherMark',    label: 'อื่นๆ',                       type: 'checkbox' },
      { key: 'otherDetail',       label: 'อื่นๆ ระบุ',                  type: 'text' },
    ],
    toggles: TOGGLE_OPINION_PT,
  },
  {
    docType: 'thai-traditional-medicine-medical-certificate',
    name: 'ใบรับรองแพทย์แผนไทยประยุกต์',
    language: 'th',
    paperSize: 'A4',
    htmlTemplate: HEADER_CLINIC + `
      <h2 style="text-align:center;margin:16px 0;color:#b71c1c;letter-spacing:0.02em">ใบรับรองแพทย์แผนไทยประยุกต์</h2>
      ${CERT_NUMBER_LINE}
      <div style="margin:8px 0"><strong>ข้าพเจ้า แพทย์แผนไทยประยุกต์:</strong> {{doctorName}}</div>
      <div style="margin:6px 0"><strong>ใบอนุญาตประกอบวิชาชีพแพทย์แผนไทยประยุกต์ :</strong> {{doctorLicenseNo}}</div>
      <div style="margin:6px 0"><strong>ได้ทำการตรวจประเมินทางการแพทย์แผนไทยประยุกต์ นาย/นาง/นางสาว:</strong> {{customerName}}</div>
      <div style="margin:6px 0"><strong>สถานที่อยู่ (ที่ติดต่อได้):</strong> {{patientAddress}}</div>
      <div style="margin:6px 0"><strong>หมายเลขบัตรประจำตัวประชาชน:</strong> {{nationalId}}</div>
      <div style="margin:6px 0"><strong>แล้วเมื่อวันที่:</strong> {{today}}</div>
      <div style="margin:12px 0 6px 0;font-weight:600;color:#b71c1c">จากการประเมินพบว่า</div>
      <div style="min-height:50px;border-bottom:1px dotted #000;margin-bottom:8px;padding:4px">{{findings}}</div>
      <div style="margin:10px 0 6px 0;font-weight:600;color:#b71c1c">ผลการตรวจทางการแพทย์แผนไทยประยุกต์</div>
      <div style="min-height:50px;border-bottom:1px dotted #000;margin-bottom:8px;padding:4px">{{tcmExam}}</div>
      <div style="margin:10px 0 6px 0;font-weight:600;color:#b71c1c">ได้ทำการรักษาโดย</div>
      <div style="min-height:50px;border-bottom:1px dotted #000;margin-bottom:8px;padding:4px">{{treatment}}</div>
      <div style="margin:10px 0 6px 0;font-weight:600;color:#b71c1c">สรุปความเห็นและข้อแนะนำของแพทย์แผนไทยประยุกต์</div>
      <div style="min-height:50px;border-bottom:1px dotted #000;margin-bottom:8px;padding:4px">{{recommendation}}</div>
      {{#if showPatientSignature}}
      <div style="margin-top:24px;display:flex;justify-content:flex-start">
        <div style="text-align:center;min-width:240px">
          <div>ลงชื่อ <span style="display:inline-block;border-bottom:1px dotted #000;min-width:200px"></span> ผู้ป่วย</div>
          <div style="margin-top:2px">( {{customerName}} )</div>
          <div>วันที่ {{today}}</div>
        </div>
      </div>
      {{/if}}
      <div style="margin-top:32px;text-align:right;border-top:1px solid #b71c1c;padding-top:14px">
        <div>ลงชื่อ <span style="display:inline-block;border-bottom:1px dotted #000;min-width:200px"></span></div>
        <div style="margin-top:2px">( {{doctorName}} )</div>
        <div style="font-style:italic;color:#444">แพทย์แผนไทยประยุกต์</div>
        <div>วันที่ {{today}}</div>
      </div>
    `,
    fields: [
      { key: 'doctorName',     label: 'แพทย์แผนไทยประยุกต์', type: 'staff-select', source: 'doctors', required: true },
      { key: 'doctorLicenseNo',label: 'ใบอนุญาตประกอบวิชาชีพ', type: 'text' },
      { key: 'certNumber',     label: 'เลขที่ใบรับรอง', type: 'text' },
      { key: 'patientAddress', label: 'ที่อยู่ผู้ป่วย', type: 'textarea' },
      { key: 'findings',       label: 'จากการประเมินพบว่า', type: 'textarea' },
      { key: 'tcmExam',        label: 'ผลการตรวจ', type: 'textarea' },
      { key: 'treatment',      label: 'ได้ทำการรักษาโดย', type: 'textarea' },
      { key: 'recommendation', label: 'สรุปความเห็นและข้อแนะนำ', type: 'textarea' },
    ],
    toggles: TOGGLE_OPINION_PT,
  },
  {
    docType: 'chinese-traditional-medicine-medical-certificate',
    name: 'ใบรับรองแพทย์แผนจีน / 中医医疗证明',
    language: 'bilingual',
    paperSize: 'A4',
    htmlTemplate: HEADER_CLINIC + `
      <h2 style="text-align:center;margin:16px 0;color:#b71c1c;letter-spacing:0.02em">ใบรับรองแพทย์แผนจีน{{#lang en}} / 中医医疗证明{{/lang}}</h2>
      ${CERT_NUMBER_LINE}
      <!-- Phase 14.2.E (2026-04-25) — ProClinic /admin/chinese-traditional-medicine-medical-certificate .print-area replicated. Single-freeform conclusion (matches ProClinic). -->
      <div style="margin:8px 0"><strong>ข้าพเจ้า แพทย์แผนจีน{{#lang en}} / TCM Doctor{{/lang}}:</strong> {{doctorName}}</div>
      <div style="margin:6px 0"><strong>ใบอนุญาตประกอบวิชาชีพ :</strong> {{doctorLicenseNo}}</div>
      <div style="margin:6px 0"><strong>ได้ทำการตรวจรักษา นาย/นาง/นางสาว:</strong> {{customerName}} (HN {{customerHN}})</div>
      <div style="margin:6px 0"><strong>สถานที่อยู่ (ที่ติดต่อได้):</strong> {{patientAddress}}</div>
      <div style="margin:6px 0"><strong>หมายเลขบัตรประจำตัวประชาชน:</strong> {{nationalId}}</div>
      <div style="margin:6px 0"><strong>แล้วเมื่อวันที่:</strong> {{today}}</div>
      <div style="margin:14px 0 6px 0;font-weight:600;color:#b71c1c">สรุปความเห็นของแพทย์{{#lang en}} / Doctor's Summary{{/lang}}</div>
      {{#lang en}}<div style="margin:4px 0;color:#444;font-size:13px">อาการ / 症状 / Symptoms:</div>{{/lang}}
      <div style="min-height:40px;border-bottom:1px dotted #000;margin-bottom:8px;padding:4px">{{symptoms}}</div>
      {{#lang en}}<div style="margin:4px 0;color:#444;font-size:13px">การวินิจฉัย / 中医诊断 / TCM Diagnosis:</div>{{/lang}}
      <div style="min-height:40px;border-bottom:1px dotted #000;margin-bottom:8px;padding:4px">{{tcmDiagnosis}}</div>
      {{#lang en}}<div style="margin:4px 0;color:#444;font-size:13px">การรักษา / 治疗 / Treatment:</div>{{/lang}}
      <div style="min-height:40px;border-bottom:1px dotted #000;margin-bottom:8px;padding:4px">{{treatment}}</div>
      {{#if showPatientSignature}}
      <div style="margin-top:24px;display:flex;justify-content:flex-start">
        <div style="text-align:center;min-width:240px">
          <div>ลงชื่อ <span style="display:inline-block;border-bottom:1px dotted #000;min-width:200px"></span> ผู้ป่วย{{#lang en}} / Patient{{/lang}}</div>
          <div style="margin-top:2px">( {{customerName}} )</div>
          <div>วันที่ {{today}}</div>
        </div>
      </div>
      {{/if}}
    ` + `
      <div style="margin-top:32px;text-align:right;border-top:1px solid #b71c1c;padding-top:14px">
        <div>ลงชื่อ <span style="display:inline-block;border-bottom:1px dotted #000;min-width:200px"></span></div>
        <div style="margin-top:2px">( {{doctorName}} )</div>
        <div style="font-style:italic;color:#444">แพทย์แผนจีน{{#lang en}} / TCM Doctor{{/lang}}</div>
        <div>วันที่ {{today}}</div>
      </div>
    `,
    fields: [
      { key: 'doctorName',     label: 'แพทย์จีน', type: 'staff-select', source: 'doctors', required: true },
      { key: 'doctorLicenseNo',label: 'เลขใบอนุญาต', type: 'text' },
      { key: 'certNumber',     label: 'เลขที่ใบรับรอง', type: 'text' },
      { key: 'patientAddress', label: 'ที่อยู่ผู้ป่วย', type: 'textarea' },
      { key: 'symptoms',       label: 'อาการ / 症状', type: 'textarea' },
      { key: 'tcmDiagnosis',   label: 'การวินิจฉัยแพทย์จีน / 中医诊断', type: 'textarea' },
      { key: 'treatment',      label: 'การรักษา / 治疗', type: 'textarea' },
    ],
    toggles: TOGGLE_OPINION_PT,
  },
  {
    docType: 'fit-to-fly',
    name: 'Fit-to-fly Certificate / ใบรับรองความพร้อมในการเดินทางทางอากาศ',
    language: 'bilingual',
    paperSize: 'A4',
    htmlTemplate: HEADER_CLINIC + `
      <!-- Phase 14.2.E (2026-04-25) — ProClinic /admin/fit-to-fly .print-area replicated. EN-only labels matching ProClinic exactly. -->
      <h2 style="text-align:center;margin:14px 0;color:#b71c1c;letter-spacing:0.02em">Medical Certificate for Air Travel</h2>
      <h3 style="text-align:center;font-weight:normal;font-size:14px;margin:0 0 14px 0;color:#444">FIT-TO-FLY CERTIFICATE / ใบรับรองความพร้อมในการเดินทางทางอากาศ</h3>
      <div style="display:flex;justify-content:space-between;margin:10px 0">
        <div><strong style="color:#b71c1c">No.:</strong> <span style="display:inline-block;border-bottom:1px dotted #000;min-width:140px;padding:0 4px">{{certNumber}}</span></div>
        <div><strong style="color:#b71c1c">Date:</strong> <span style="display:inline-block;border-bottom:1px dotted #000;min-width:140px;padding:0 4px">{{today}}</span></div>
      </div>
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:8px;margin:8px 0">
        <div><strong>Name:</strong> <span style="display:inline-block;border-bottom:1px dotted #000;min-width:200px;padding:0 4px">{{customerNameEn}}</span></div>
        <div><strong>Gender:</strong> <span style="display:inline-block;border-bottom:1px dotted #000;min-width:80px;padding:0 4px">{{gender}}</span></div>
        <div><strong>Age:</strong> <span style="display:inline-block;border-bottom:1px dotted #000;min-width:40px;padding:0 4px">{{age}}</span> year <span style="display:inline-block;border-bottom:1px dotted #000;min-width:40px;padding:0 4px">{{ageMonth}}</span> month</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0">
        <div><strong>Nationality:</strong> <span style="display:inline-block;border-bottom:1px dotted #000;min-width:120px;padding:0 4px">{{nationality}}</span></div>
        <div><strong>Passport Number/ID Number:</strong> <span style="display:inline-block;border-bottom:1px dotted #000;min-width:160px;padding:0 4px">{{passport}}</span></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr;gap:8px;margin:8px 0">
        <div><strong>Airline:</strong> <span style="display:inline-block;border-bottom:1px dotted #000;min-width:80px;padding:0 4px">{{airline}}</span></div>
        <div><strong>Flight no:</strong> <span style="display:inline-block;border-bottom:1px dotted #000;min-width:80px;padding:0 4px">{{flightNo}}</span></div>
        <div><strong>Depart:</strong> <span style="display:inline-block;border-bottom:1px dotted #000;min-width:80px;padding:0 4px">{{departCity}}</span></div>
        <div><strong>Arrival:</strong> <span style="display:inline-block;border-bottom:1px dotted #000;min-width:80px;padding:0 4px">{{arrivalCity}}</span></div>
        <div><strong>Transit:</strong> <span style="display:inline-block;border-bottom:1px dotted #000;min-width:80px;padding:0 4px">{{transitCity}}</span></div>
      </div>
      <div style="margin:14px 0 6px 0;font-weight:600;color:#b71c1c">Patient's History:</div>
      <div style="margin:6px 0"><strong>Recent infection:</strong> {{recentInfectionMark}} Yes / {{recentInfectionNoMark}} No</div>
      <div style="margin:6px 0"><strong>Recent Fever:</strong> {{recentFeverMark}} Yes / {{recentFeverNoMark}} No</div>
      <div style="margin:6px 0"><strong>Being treated for any conditions:</strong> {{conditionMark}} Yes / {{conditionNoMark}} No &nbsp; if yes explain: <span style="display:inline-block;border-bottom:1px dotted #000;min-width:300px;padding:0 4px">{{conditionDetail}}</span></div>
      <div style="margin:10px 0 4px 0;font-weight:600">Diagnosis:</div>
      <div style="min-height:40px;border-bottom:1px dotted #000;margin-bottom:8px;padding:4px">{{diagnosis}}</div>
      <div style="margin:8px 0 4px 0;font-weight:600">Treatment:</div>
      <div style="min-height:40px;border-bottom:1px dotted #000;margin-bottom:8px;padding:4px">{{treatment}}</div>
      <div style="margin:14px 0 6px 0;font-weight:600;color:#b71c1c">Recommendation for air travel</div>
      <div style="margin:6px 0">{{fitMark}} Fit for air travel &nbsp; {{notFitMark}} Not fit for air travel</div>
      <div style="margin-top:24px"><strong>Medical License no:</strong> <span style="display:inline-block;border-bottom:1px dotted #000;min-width:200px;padding:0 4px">{{doctorLicenseNo}}</span></div>
      <div style="margin-top:32px;display:flex;justify-content:space-between;border-top:1px solid #b71c1c;padding-top:14px">
        <div style="text-align:center">
          <div>Signature <span style="display:inline-block;border-bottom:1px dotted #000;min-width:160px"></span></div>
          <div style="margin-top:2px">( {{customerNameEn}} )</div>
          <div style="font-style:italic;color:#444">Passenger</div>
        </div>
        <div style="text-align:center">
          <div>Signature <span style="display:inline-block;border-bottom:1px dotted #000;min-width:160px"></span></div>
          <div style="margin-top:2px">( {{doctorName}} )</div>
          <div style="font-style:italic;color:#444">Attending Physician</div>
        </div>
      </div>
    `,
    fields: [
      { key: 'customerNameEn',     label: 'Patient Name (English)', type: 'text', required: true },
      { key: 'passport',           label: 'Passport / ID', type: 'text' },
      { key: 'nationality',        label: 'Nationality', type: 'text' },
      { key: 'ageMonth',           label: 'Age (months)', type: 'text' },
      { key: 'airline',            label: 'Airline', type: 'text' },
      { key: 'flightNo',           label: 'Flight No.', type: 'text' },
      { key: 'departCity',         label: 'Depart from', type: 'text' },
      { key: 'arrivalCity',        label: 'Arrival', type: 'text' },
      { key: 'transitCity',        label: 'Transit', type: 'text' },
      { key: 'diagnosis',          label: 'Diagnosis', type: 'textarea' },
      { key: 'treatment',          label: 'Treatment', type: 'textarea' },
      { key: 'doctorName',         label: 'Doctor', type: 'staff-select', source: 'doctors', required: true },
      { key: 'doctorLicenseNo',    label: 'License No.', type: 'text' },
      { key: 'certNumber',         label: 'Certificate No.', type: 'text' },
      { key: 'recentInfectionMark',  label: 'Recent infection: Yes', type: 'checkbox' },
      { key: 'recentInfectionNoMark',label: 'Recent infection: No',  type: 'checkbox' },
      { key: 'recentFeverMark',      label: 'Recent Fever: Yes',     type: 'checkbox' },
      { key: 'recentFeverNoMark',    label: 'Recent Fever: No',      type: 'checkbox' },
      { key: 'conditionMark',        label: 'Being treated: Yes',    type: 'checkbox' },
      { key: 'conditionNoMark',      label: 'Being treated: No',     type: 'checkbox' },
      { key: 'conditionDetail',      label: 'Condition detail', type: 'text' },
      { key: 'fitMark',              label: 'Fit for air travel',     type: 'checkbox' },
      { key: 'notFitMark',           label: 'Not fit for air travel', type: 'checkbox' },
    ],
    toggles: NO_TOGGLES,
  },
  {
    docType: 'medicine-label',
    name: 'ฉลากยา (Medicine Label)',
    language: 'th',
    paperSize: 'label-57x32',
    htmlTemplate: `
<div style="font-family:'Sarabun','Noto Sans Thai',sans-serif;padding:1.5mm;font-size:9px;line-height:1.25;border-left:2px solid #b71c1c">
  <div style="font-weight:bold;font-size:10px;color:#000">{{clinicName}}</div>
  <div style="font-size:8px;color:#444">โทร. {{clinicPhone}}</div>
  <div style="border-top:1px solid #b71c1c;margin:1.5mm 0;padding-top:1mm;font-weight:bold">{{customerName}} &nbsp; HN {{customerHN}}</div>
  <div style="font-weight:bold;font-size:10px;margin-top:1mm;color:#b71c1c">{{medicineName}}</div>
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
      { key: 'doctorName',    label: 'ผู้จ่ายยา', type: 'staff-select', source: 'doctors+staff', required: true },
    ],
    toggles: [],
  },
  {
    docType: 'chart',
    name: 'เทมเพลต Chart (ประวัติการรักษา)',
    language: 'th',
    paperSize: 'A4',
    htmlTemplate: HEADER_CLINIC + `
      <h2 style="text-align:center;margin:16px 0;color:#b71c1c;letter-spacing:0.02em">ใบประวัติการรักษา (Patient Chart)</h2>
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
      <div style="margin:8px 0"><strong>Dx (Diagnosis):</strong> {{dx}}</div>
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
      { key: 'doctorName',  label: 'แพทย์', type: 'staff-select', source: 'doctors', required: true },
      { key: 'doctorLicenseNo', label: 'เลขใบอนุญาต', type: 'text' },
      { key: 'certNumber',  label: 'เลขที่เอกสาร', type: 'text' },
    ],
    toggles: NO_TOGGLES,
  },
  {
    docType: 'consent',
    name: 'หนังสือยินยอมรับการรักษา (Consent Form)',
    language: 'th',
    paperSize: 'A4',
    htmlTemplate: HEADER_CLINIC + `
      <h2 style="text-align:center;margin:16px 0;color:#b71c1c;letter-spacing:0.02em">หนังสือยินยอมรับการรักษา</h2>
      ${CERT_NUMBER_LINE}
      <div style="margin:8px 0">ข้าพเจ้า <strong>{{customerName}}</strong> &nbsp; HN: <strong>{{customerHN}}</strong> &nbsp; เลขบัตรประชาชน: {{nationalId}}</div>
      <div style="margin:6px 0">ที่อยู่: {{patientAddress}}</div>
      <div style="margin:14px 0">ขอแสดงความยินยอมให้แพทย์ <strong>{{doctorName}}</strong> และทีมงานคลินิก <strong>{{clinicName}}</strong> ทำการรักษา/หัตถการดังต่อไปนี้:</div>
      <div style="margin:6px 0;font-weight:bold">หัตถการ/การรักษา:</div>
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
        <div style="text-align:center;min-width:240px">
          <div>ลงชื่อ <span style="display:inline-block;border-bottom:1px dotted #000;min-width:180px"></span> ผู้ป่วย/ผู้ยินยอม</div>
          <div style="margin-top:2px">( {{customerName}} )</div>
          <div>วันที่ {{today}}</div>
        </div>
        <div style="text-align:center;min-width:240px">
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
      { key: 'doctorName', label: 'แพทย์ผู้ทำการรักษา', type: 'staff-select', source: 'doctors', required: true },
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
      <h2 style="text-align:center;margin:16px 0;color:#b71c1c;letter-spacing:0.02em">แผนการรักษา</h2>
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
      { key: 'doctorName',    label: 'แพทย์', type: 'staff-select', source: 'doctors', required: true },
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
      <h2 style="text-align:center;margin:16px 0;color:#b71c1c;letter-spacing:0.02em">ใบยกเลิกการขาย</h2>
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
        <div style="text-align:center;min-width:240px">
          <div>ลงชื่อ <span style="display:inline-block;border-bottom:1px dotted #000;min-width:180px"></span> ลูกค้า/ผู้รับเงิน</div>
          <div style="margin-top:2px">( {{customerName}} )</div>
          <div>วันที่ {{today}}</div>
        </div>
        <div style="text-align:center;min-width:240px">
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
      { key: 'staffName',      label: 'พนักงานผู้ทำรายการ', type: 'staff-select', source: 'staff', required: true },
    ],
    toggles: [],
  },
  {
    docType: 'patient-referral',
    name: 'ใบส่งตัวผู้ป่วย / Patient Referral Letter',
    language: 'bilingual',
    paperSize: 'A4',
    htmlTemplate: HEADER_CLINIC + `
      <!-- Phase 14.2.E (2026-04-25) — ProClinic /admin/patient-referral .print-area replicated. 4 referral checkboxes + 7 numbered clinical history sections. -->
      <h2 style="text-align:center;margin:14px 0;color:#b71c1c;letter-spacing:0.02em">ใบส่งตัวผู้ป่วย{{#lang en}} / Patient Referral Letter{{/lang}}</h2>
      <div style="display:flex;justify-content:space-between;margin:10px 0">
        <div><strong style="color:#b71c1c">เลขที่:</strong> <span style="display:inline-block;border-bottom:1px dotted #000;min-width:140px;padding:0 4px">{{certNumber}}</span></div>
        <div><strong style="color:#b71c1c">วันที่รักษา:</strong> <span style="display:inline-block;border-bottom:1px dotted #000;min-width:140px;padding:0 4px">{{today}}</span></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:8px 0">
        <div>
          <div style="font-weight:600;color:#b71c1c">จาก</div>
          <div>{{clinicName}}</div>
          <div style="color:#444;font-size:11px">(โทรศัพท์) {{clinicPhone}}</div>
        </div>
        <div>
          <div style="font-weight:600;color:#b71c1c">ถึง</div>
          <div><span style="display:inline-block;border-bottom:1px dotted #000;min-width:280px;padding:0 4px">{{referTo}}</span></div>
        </div>
      </div>
      <div style="margin:10px 0">พร้อมหนังสือนี้ ขอส่งผู้ป่วยชื่อ <span style="display:inline-block;border-bottom:1px dotted #000;min-width:280px;padding:0 4px">{{customerName}}</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr 2fr;gap:8px;margin:6px 0">
        <div>เพศ <span style="display:inline-block;border-bottom:1px dotted #000;min-width:80px;padding:0 4px">{{gender}}</span></div>
        <div>อายุ <span style="display:inline-block;border-bottom:1px dotted #000;min-width:60px;padding:0 4px">{{age}}</span> ปี</div>
        <div>HN <span style="display:inline-block;border-bottom:1px dotted #000;min-width:120px;padding:0 4px">{{customerHN}}</span></div>
      </div>
      <div style="margin:6px 0">ที่อยู่: <span style="display:inline-block;border-bottom:1px dotted #000;min-width:540px;padding:0 4px">{{patientAddress}}</span></div>
      <div style="margin:14px 0 6px 0;font-weight:600;color:#b71c1c">มาเพื่อโปรด</div>
      <div style="display:flex;gap:24px;margin:6px 0;flex-wrap:wrap">
        <div>{{checkAdmitMark}} รับไว้รักษาต่อ</div>
        <div>{{checkInvestigateMark}} ตรวจชันสูตร</div>
        <div>{{checkObserveMark}} คุมไว้สังเกต</div>
        <div>{{checkResultMark}} ขอทราบผล</div>
      </div>
      <div style="margin:14px 0 6px 0">
        <div style="margin:6px 0">1.ประวัติการป่วยในอดีต และประวัติครอบครัว</div>
        <div style="min-height:40px;border-bottom:1px dotted #000;margin-bottom:8px;padding:4px">{{history}}</div>
        <div style="margin:6px 0">2.ประวัติการป่วยปัจจุบัน</div>
        <div style="min-height:40px;border-bottom:1px dotted #000;margin-bottom:8px;padding:4px">{{cc}}</div>
        <div style="margin:6px 0">3.ผลการตรวจชันสูตรของห้องทดลองที่สำคัญ</div>
        <div style="min-height:40px;border-bottom:1px dotted #000;margin-bottom:8px;padding:4px">{{labResults}}</div>
        <div style="margin:6px 0">4.การวินิจฉัยขั้นต้น</div>
        <div style="min-height:30px;border-bottom:1px dotted #000;margin-bottom:8px;padding:4px">{{diagnosis}}</div>
        <div style="margin:6px 0">5.การรักษาที่ให้ไว้แล้ว</div>
        <div style="min-height:40px;border-bottom:1px dotted #000;margin-bottom:8px;padding:4px">{{treatmentGiven}}</div>
        <div style="margin:6px 0">6.สาเหตุที่ส่ง</div>
        <div style="min-height:30px;border-bottom:1px dotted #000;margin-bottom:8px;padding:4px">{{referralReason}}</div>
        <div style="margin:6px 0">7.รายละเอียดอื่นๆ</div>
        <div style="min-height:30px;border-bottom:1px dotted #000;margin-bottom:8px;padding:4px">{{otherDetail}}</div>
      </div>
    ` + `
      <div style="margin-top:32px;text-align:right;border-top:1px solid #b71c1c;padding-top:14px">
        <div>ลงชื่อ <span style="display:inline-block;border-bottom:1px dotted #000;min-width:200px"></span></div>
        <div style="margin-top:2px">( {{doctorName}} )</div>
        <div style="font-style:italic;color:#444">แพทย์ผู้ตรวจ</div>
        <div>วันที่ {{today}}</div>
      </div>
    `,
    fields: [
      { key: 'referTo',          label: 'ส่งต่อไปยัง (คลินิก/รพ.)', type: 'text', required: true },
      { key: 'patientAddress',   label: 'ที่อยู่ผู้ป่วย', type: 'textarea' },
      { key: 'history',          label: '1. ประวัติการป่วยในอดีต และครอบครัว', type: 'textarea' },
      { key: 'cc',               label: '2. ประวัติการป่วยปัจจุบัน', type: 'textarea' },
      { key: 'labResults',       label: '3. ผลตรวจชันสูตร', type: 'textarea' },
      { key: 'diagnosis',        label: '4. การวินิจฉัยขั้นต้น', type: 'text' },
      { key: 'treatmentGiven',   label: '5. การรักษาที่ให้ไว้แล้ว', type: 'textarea' },
      { key: 'referralReason',   label: '6. สาเหตุที่ส่ง', type: 'textarea', required: true },
      { key: 'otherDetail',      label: '7. รายละเอียดอื่นๆ', type: 'textarea' },
      { key: 'doctorName',       label: 'แพทย์ผู้ส่งต่อ', type: 'staff-select', source: 'doctors', required: true },
      { key: 'doctorLicenseNo',  label: 'เลขใบอนุญาต', type: 'text' },
      { key: 'certNumber',       label: 'เลขที่ใบส่งตัว', type: 'text' },
      { key: 'checkAdmitMark',        label: 'รับไว้รักษาต่อ', type: 'checkbox' },
      { key: 'checkInvestigateMark',  label: 'ตรวจชันสูตร',   type: 'checkbox' },
      { key: 'checkObserveMark',      label: 'คุมไว้สังเกต',  type: 'checkbox' },
      { key: 'checkResultMark',       label: 'ขอทราบผล',      type: 'checkbox' },
    ],
    toggles: NO_TOGGLES,
  },
  // ─── Phase 14.2.B treatment-record print docs ──────────────────────────
  // Surfaced under "พิมพ์การรักษา ▾" dropdown per treatment row in
  // CustomerDetailView. Templates fill from treatment context (treatmentDate,
  // doctorName, products, dose, totalAmount, etc.) auto-piped from the
  // treatment record at print-time.
  {
    docType: 'treatment-history',
    name: 'ประวัติการรักษา (Medical History) A4',
    language: 'th',
    paperSize: 'A4',
    // ProClinic-replicated 2026-04-25: top-right "Medical History" title +
    // Date + Physician (column-2 header). 2-column body grid: LEFT (customer
    // info + emergency contact + vital signs) / RIGHT (Symptoms / Physical
    // Exam / Diagnosis / Treatment / Treatment Plan / Additional note).
    // Below: Treatment record table + Home medication table. Bottom-right:
    // Physician signature + (name) + date.
    htmlTemplate: `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
        <div style="flex:1">
          <div style="font-weight:bold;font-size:16px">{{clinicName}}</div>
          <div style="font-size:11px;color:#444">Address: {{clinicAddress}}</div>
          <div style="font-size:11px;color:#444">Tel: {{clinicPhone}}</div>
          {{#if clinicLicenseNo}}<div style="font-size:11px;color:#444">Clinic License No: {{clinicLicenseNo}}</div>{{/if}}
          {{#if clinicTaxId}}<div style="font-size:11px;color:#444">Tax ID: {{clinicTaxId}}</div>{{/if}}
        </div>
        <div style="text-align:right;flex:0 0 auto;min-width:240px">
          <h2 style="margin:0;font-size:24px;color:#b71c1c">Medical History</h2>
          <div style="margin-top:8px"><strong>Date:</strong> {{treatmentDate}}</div>
          <div><strong>Physician:</strong> {{doctorName}}</div>
        </div>
      </div>
      <hr style="border:0;border-top:1px solid #ddd;margin:6px 0 14px 0" />
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px">
        <div>
          <h4 style="margin:0 0 6px 0">Customer information</h4>
          <div style="font-weight:bold">HN{{customerHN}} | {{customerName}}</div>
          <div style="margin-top:6px;display:grid;grid-template-columns:auto 1fr;gap:2px 12px;font-size:13px">
            <div>Tel:</div><div>{{phone}}</div>
            <div>Gender:</div><div>{{gender}}</div>
            <div>Birthdate:</div><div>{{birthdate}}</div>
            <div>Blood group:</div><div>{{bloodGroup}}</div>
            <div>Address:</div><div>{{patientAddress}}</div>
          </div>
          <h4 style="margin:14px 0 6px 0">Emergency contact</h4>
          <div style="display:grid;grid-template-columns:auto 1fr;gap:2px 12px;font-size:13px">
            <div>name:</div><div>{{emergencyName}}</div>
            <div>Tel:</div><div>{{emergencyPhone}}</div>
          </div>
          <h4 style="margin:14px 0 6px 0">Vital signs</h4>
          <div style="display:grid;grid-template-columns:auto 1fr;gap:2px 12px;font-size:13px">
            <div>Body Temperature (BT):</div><div>{{bt}} °C</div>
            <div>Pulse Rate (PR):</div><div>{{pr}} bpm</div>
            <div>Respiratory Rate (RR):</div><div>{{rr}} bpm</div>
            <div>Blood Pressure (BP):</div><div>{{bp}} mmHg</div>
            <div>Oxygen Saturation (SpO<sub>2</sub>):</div><div>{{spo2}} %</div>
          </div>
        </div>
        <div>
          <h4 style="margin:0 0 6px 0">Symptoms</h4>
          <div style="min-height:24px;font-size:13px">{{symptoms}}</div>
          <h4 style="margin:14px 0 6px 0">Physical Examination</h4>
          <div style="min-height:24px;font-size:13px">{{physicalExam}}</div>
          <h4 style="margin:14px 0 6px 0">Diagnosis</h4>
          <div style="min-height:36px;font-size:13px">{{diagnosis}}</div>
          <h4 style="margin:14px 0 6px 0">Treatment</h4>
          <div style="min-height:36px;font-size:13px">{{treatment}}</div>
          <h4 style="margin:14px 0 6px 0">Treatment Plan</h4>
          <div style="min-height:24px;font-size:13px">{{treatmentPlan}}</div>
          <h4 style="margin:14px 0 6px 0">Additional note</h4>
          <div style="min-height:24px;font-size:13px">{{additionalNote}}</div>
        </div>
      </div>
      <h4 style="margin:18px 0 6px 0">Treatment record</h4>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#b71c1c;color:#fff">
            <th style="border:1px solid #000;padding:6px;text-align:left">Treatment Description</th>
            <th style="border:1px solid #000;padding:6px;text-align:right;width:120px">Quantity</th>
            <th style="border:1px solid #000;padding:6px;text-align:right;width:140px">Remaining Balance</th>
          </tr>
        </thead>
        <tbody>{{{treatmentRecordRows}}}</tbody>
      </table>
      <h4 style="margin:18px 0 6px 0">Home medication</h4>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#b71c1c;color:#fff">
            <th style="border:1px solid #000;padding:6px;text-align:left">Treatment Description</th>
            <th style="border:1px solid #000;padding:6px;text-align:right;width:120px">Quantity</th>
          </tr>
        </thead>
        <tbody>{{{homeMedicationRows}}}</tbody>
      </table>
      <div style="margin-top:30px;text-align:right">
        <div style="margin-bottom:30px">Physician</div>
        <div>( {{doctorName}} )</div>
        <div>{{today}}</div>
      </div>
    `,
    fields: [
      { key: 'treatmentDate',     label: 'วันที่รักษา', type: 'date' },
      { key: 'doctorName',        label: 'แพทย์ผู้รักษา', type: 'staff-select', source: 'doctors', required: true },
      { key: 'birthdate',         label: 'วันเกิด', type: 'text' },
      { key: 'bloodGroup',        label: 'กรุ๊ปเลือด', type: 'text' },
      { key: 'patientAddress',    label: 'ที่อยู่', type: 'textarea' },
      { key: 'emergencyName',     label: 'ผู้ติดต่อฉุกเฉิน', type: 'text' },
      { key: 'emergencyPhone',    label: 'โทรฉุกเฉิน', type: 'text' },
      { key: 'bt',                label: 'BT (°C)', type: 'text' },
      { key: 'pr',                label: 'PR (bpm)', type: 'text' },
      { key: 'rr',                label: 'RR (bpm)', type: 'text' },
      { key: 'bp',                label: 'BP (mmHg)', type: 'text' },
      { key: 'spo2',              label: 'SpO2 (%)', type: 'text' },
      { key: 'symptoms',          label: 'อาการ (CC)', type: 'textarea' },
      { key: 'physicalExam',      label: 'Physical Examination (PE)', type: 'textarea' },
      { key: 'diagnosis',         label: 'Diagnosis (DX)', type: 'textarea' },
      { key: 'treatment',         label: 'Treatment', type: 'textarea' },
      { key: 'treatmentPlan',     label: 'Treatment Plan', type: 'textarea' },
      { key: 'additionalNote',    label: 'Additional note', type: 'textarea' },
      { key: 'treatmentRecordRows', label: 'Treatment record', type: 'textarea', hidden: true },
      { key: 'homeMedicationRows',  label: 'Home medication',  type: 'textarea', hidden: true },
    ],
    toggles: NO_TOGGLES,
  },
  {
    docType: 'treatment-referral',
    name: 'ใบส่งตัวทรีตเมนต์ (A5)',
    language: 'th',
    paperSize: 'A5',
    htmlTemplate: `
      <div style="text-align:center;margin-bottom:10px;border-left:3px solid #b71c1c;padding-left:8px">
        <div style="font-weight:bold;font-size:16px;color:#000">{{clinicName}}</div>
        <div style="font-size:10px;color:#444">โทร. {{clinicPhone}}</div>
      </div>
      <hr style="border:0;border-top:2px solid #b71c1c;margin:6px 0 10px 0" />
      <h3 style="text-align:center;margin:8px 0;color:#b71c1c;border-bottom:1px solid #b71c1c;padding-bottom:4px">ใบส่งตัวทรีตเมนต์</h3>
      <div style="margin:6px 0"><strong>เลขที่:</strong> {{certNumber}} &nbsp; <strong>วันที่:</strong> {{treatmentDate}}</div>
      <div style="margin:6px 0"><strong>ลูกค้า:</strong> {{customerName}} (HN {{customerHN}})</div>
      <div style="margin:6px 0"><strong>เพศ/อายุ:</strong> {{gender}} / {{age}} ปี</div>
      <hr style="border:0;border-top:1px dashed #000;margin:8px 0" />
      <div style="margin:6px 0"><strong>ทรีตเมนต์ที่จะรับ:</strong></div>
      <div style="border:1px solid #000;padding:6px;min-height:50px;margin:4px 0;font-size:12px">{{treatmentItems}}</div>
      <div style="margin:6px 0"><strong>แพทย์ผู้สั่ง:</strong> {{doctorName}}</div>
      <div style="margin:6px 0"><strong>ผู้ทำหัตถการ:</strong> {{assistantName}}</div>
      <div style="margin:6px 0"><strong>หมายเหตุ:</strong> {{drNote}}</div>
      <div style="margin-top:14px;text-align:right;font-size:11px">
        ลงชื่อ <span style="display:inline-block;border-bottom:1px dotted #000;min-width:120px"></span> ผู้รับ
      </div>
    `,
    fields: [
      { key: 'treatmentDate',  label: 'วันที่รักษา', type: 'date' },
      { key: 'treatmentItems', label: 'ทรีตเมนต์', type: 'textarea' },
      { key: 'drNote',         label: 'หมายเหตุ', type: 'textarea' },
      { key: 'doctorName',     label: 'แพทย์', type: 'staff-select', source: 'doctors', required: true },
      { key: 'assistantName',  label: 'ผู้ช่วย', type: 'staff-select', source: 'doctors+staff' },
      { key: 'certNumber',     label: 'เลขที่', type: 'text' },
    ],
    toggles: NO_TOGGLES,
  },
  {
    docType: 'course-deduction',
    name: 'ใบตัดคอร์ส',
    language: 'th',
    paperSize: 'A4',
    htmlTemplate: HEADER_CLINIC + `
      <h2 style="text-align:center;margin:14px 0;color:#b71c1c;border-bottom:2px solid #b71c1c;padding-bottom:6px">ใบตัดคอร์ส</h2>
      <div style="display:flex;justify-content:space-between;margin:10px 0">
        <div><strong>เลขที่:</strong> {{certNumber}}</div>
        <div><strong>วันที่:</strong> {{treatmentDate}}</div>
      </div>
      <div style="margin:6px 0"><strong>HN:</strong> {{customerHN}} &nbsp; <strong>ชื่อ-นามสกุล:</strong> {{customerName}}</div>
      <hr style="border:0;border-top:1px solid #000;margin:10px 0" />
      <table style="width:100%;border-collapse:collapse;margin:10px 0">
        <thead>
          <tr style="background:#b71c1c;color:#fff">
            <th style="border:1px solid #000;padding:6px;text-align:left">คอร์ส / สินค้า</th>
            <th style="border:1px solid #000;padding:6px;text-align:right">ตัด</th>
            <th style="border:1px solid #000;padding:6px;text-align:right">คงเหลือก่อน</th>
            <th style="border:1px solid #000;padding:6px;text-align:right">คงเหลือหลัง</th>
          </tr>
        </thead>
        <tbody>
          {{{deductionRows}}}
        </tbody>
      </table>
      <div style="margin:10px 0"><strong>หมายเหตุ:</strong> {{note}}</div>
      <div style="margin:10px 0"><strong>ผู้ทำหัตถการ:</strong> {{doctorName}}</div>
      <div style="margin-top:30px;display:flex;justify-content:space-between">
        <div style="text-align:center;min-width:240px">
          <div>ลงชื่อ <span style="display:inline-block;border-bottom:1px dotted #000;min-width:160px"></span> ลูกค้า</div>
          <div style="margin-top:2px">( {{customerName}} )</div>
        </div>
        <div style="text-align:center;min-width:240px">
          <div>ลงชื่อ <span style="display:inline-block;border-bottom:1px dotted #000;min-width:160px"></span> เจ้าหน้าที่</div>
          <div style="margin-top:2px">( {{staffName}} )</div>
        </div>
      </div>
    `,
    fields: [
      { key: 'treatmentDate',  label: 'วันที่ตัด', type: 'date' },
      { key: 'deductionRows',  label: 'รายการที่ตัด', type: 'textarea', hidden: true },
      { key: 'note',           label: 'หมายเหตุ', type: 'textarea' },
      { key: 'doctorName',     label: 'ผู้ทำหัตถการ', type: 'staff-select', source: 'doctors+staff', required: true },
      { key: 'staffName',      label: 'เจ้าหน้าที่', type: 'staff-select', source: 'staff', required: true },
      { key: 'certNumber',     label: 'เลขที่', type: 'text' },
    ],
    toggles: NO_TOGGLES,
  },
]);
