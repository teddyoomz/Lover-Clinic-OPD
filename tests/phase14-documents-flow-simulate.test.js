// ─── Phase 14 · Document Templates — full-flow simulate test ──────────────
// Rule I: chain master-data → picker whitelist → fill-form → template
// render → print dispatch. Catches the V11/V12/V13 cluster failure mode
// where helper unit tests pass but the real flow is broken because
// inline UI logic silently strips fields or the render path doesn't
// receive what the form sends.
//
// Structure:
//   F1: validator covers every docType + field-shape edge case
//   F2: seed templates (all 13 docTypes, covers all DOC_TYPES) pass
//       strict validator (guards future Copy-paste regressions)
//   F3: extractTemplatePlaceholders finds every {{key}} in seed HTML
//   F4: print engine — htmlEscape + renderTemplate + buildPrintContext
//   F5: end-to-end render (seed template + mock customer → valid HTML)
//   F6: adversarial inputs (nulls, XSS attempt, unicode, unknown tokens)
//   F7: source-grep regression guards (lock integration points)

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  validateDocumentTemplate,
  normalizeDocumentTemplate,
  emptyDocumentTemplateForm,
  generateDocumentTemplateId,
  extractTemplatePlaceholders,
  DOC_TYPES,
  DOC_TYPE_LABELS,
  LANGUAGES,
  PAPER_SIZES,
  FIELD_TYPES,
  SEED_TEMPLATES,
  NAME_MAX_LENGTH,
  HTML_MAX_LENGTH,
  SCHEMA_VERSION,
  MAX_TOGGLES,
} from '../src/lib/documentTemplateValidation.js';
import {
  htmlEscape,
  renderTemplate,
  buildPrintContext,
  buildPrintDocument,
} from '../src/lib/documentPrintEngine.js';

/* ─── F1: validator ─────────────────────────────────────────────────────── */

describe('F1: validateDocumentTemplate covers every legal + illegal edge', () => {
  const base = (o = {}) => ({ ...emptyDocumentTemplateForm('medical-certificate'), htmlTemplate: '<p>test</p>', ...o });

  it('F1.1: null rejected', () => expect(validateDocumentTemplate(null)?.[0]).toBe('form'));
  it('F1.2: array rejected', () => expect(validateDocumentTemplate([])?.[0]).toBe('form'));
  it('F1.3: unknown docType rejected', () => expect(validateDocumentTemplate(base({ docType: 'nope' }))?.[0]).toBe('docType'));
  it('F1.4: empty name rejected', () => expect(validateDocumentTemplate(base({ name: '' }))?.[0]).toBe('name'));
  it('F1.5: name over max length rejected', () => {
    const long = 'x'.repeat(NAME_MAX_LENGTH + 1);
    expect(validateDocumentTemplate(base({ name: long }))?.[0]).toBe('name');
  });
  it('F1.6: unknown language rejected', () => expect(validateDocumentTemplate(base({ language: 'fr' }))?.[0]).toBe('language'));
  it('F1.7: unknown paperSize rejected', () => expect(validateDocumentTemplate(base({ paperSize: 'A3' }))?.[0]).toBe('paperSize'));
  it('F1.8: htmlTemplate must be string', () => expect(validateDocumentTemplate(base({ htmlTemplate: 42 }))?.[0]).toBe('htmlTemplate'));
  it('F1.9: strict mode requires non-empty htmlTemplate', () => {
    expect(validateDocumentTemplate(base({ htmlTemplate: '   ' }), { strict: true })?.[0]).toBe('htmlTemplate');
  });
  it('F1.10: htmlTemplate over max rejected', () => {
    expect(validateDocumentTemplate(base({ htmlTemplate: 'x'.repeat(HTML_MAX_LENGTH + 1) }))?.[0]).toBe('htmlTemplate');
  });
  it('F1.11: fields must be array', () => expect(validateDocumentTemplate(base({ fields: 'wrong' }))?.[0]).toBe('fields'));
  it('F1.12: field without key rejected', () => {
    expect(validateDocumentTemplate(base({ fields: [{ key: '', label: 'x', type: 'text' }] }))?.[0]).toBe('fields[0].key');
  });
  it('F1.13: field key with invalid chars rejected', () => {
    expect(validateDocumentTemplate(base({ fields: [{ key: 'bad-key', label: 'x', type: 'text' }] }))?.[0]).toBe('fields[0].key');
  });
  it('F1.14: duplicate field keys rejected', () => {
    const err = validateDocumentTemplate(base({ fields: [
      { key: 'dup', label: 'a', type: 'text' },
      { key: 'dup', label: 'b', type: 'text' },
    ] }));
    expect(err?.[0]).toBe('fields[1].key');
  });
  it('F1.15: field with unknown type rejected', () => {
    expect(validateDocumentTemplate(base({ fields: [{ key: 'x', label: 'y', type: 'weird' }] }))?.[0]).toBe('fields[0].type');
  });
  it('F1.16: all-valid form passes', () => {
    expect(validateDocumentTemplate(base({
      fields: [{ key: 'dx', label: 'Diagnosis', type: 'text', required: true }],
    }), { strict: true })).toBeNull();
  });
  it('F1.17: empty docType label map has no holes', () => {
    for (const t of DOC_TYPES) expect(typeof DOC_TYPE_LABELS[t]).toBe('string');
  });
});

/* ─── F2: seed templates ────────────────────────────────────────────────── */

describe('F2: every SEED_TEMPLATE passes strict validator', () => {
  it('F2.1: 13 seeds for 13 docTypes (no missing, no duplicates)', () => {
    const docTypes = SEED_TEMPLATES.map(s => s.docType);
    expect(docTypes.length).toBe(13);
    expect(new Set(docTypes).size).toBe(13);
    for (const t of DOC_TYPES) expect(docTypes).toContain(t);
  });

  for (const seed of SEED_TEMPLATES) {
    it(`F2.seed:${seed.docType}: passes strict validator`, () => {
      const fail = validateDocumentTemplate(seed, { strict: true });
      expect(fail).toBeNull();
    });
    it(`F2.seed:${seed.docType}: HTML has all placeholder-only fields we need`, () => {
      // Each seed declares `fields`. For every field with required=true, the
      // HTML template must reference {{key}} so the print-time form value
      // actually reaches the page. Catch drift when someone edits fields
      // without updating HTML.
      const placeholders = extractTemplatePlaceholders(seed.htmlTemplate || '');
      for (const f of (seed.fields || []).filter(f => f.required)) {
        expect(placeholders).toContain(f.key);
      }
    });
  }
});

/* ─── F3: extractTemplatePlaceholders ───────────────────────────────────── */

describe('F3: extractTemplatePlaceholders', () => {
  it('F3.1: empty / non-string → []', () => {
    expect(extractTemplatePlaceholders('')).toEqual([]);
    expect(extractTemplatePlaceholders(null)).toEqual([]);
    expect(extractTemplatePlaceholders(42)).toEqual([]);
  });
  it('F3.2: returns unique in-order keys', () => {
    expect(extractTemplatePlaceholders('{{a}} {{b}} {{a}} {{c}}')).toEqual(['a', 'b', 'c']);
  });
  it('F3.3: accepts whitespace inside braces', () => {
    expect(extractTemplatePlaceholders('{{  foo  }}')).toEqual(['foo']);
  });
  it('F3.4: ignores invalid identifiers', () => {
    // {{1abc}} / {{hello-world}} / {{ }} not matched
    expect(extractTemplatePlaceholders('{{1bad}} {{a-b}} {{ }} {{good}}')).toEqual(['good']);
  });
});

/* ─── F4: print engine ─────────────────────────────────────────────────── */

describe('F4: htmlEscape + renderTemplate + buildPrintContext', () => {
  it('F4.1: htmlEscape escapes 5 dangerous chars', () => {
    expect(htmlEscape('<img src=x onerror="alert(1)">&"\'')).toBe(
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&quot;&#39;'
    );
  });
  it('F4.2: htmlEscape null/undefined → ""', () => {
    expect(htmlEscape(null)).toBe('');
    expect(htmlEscape(undefined)).toBe('');
  });
  it('F4.3: renderTemplate replaces known + empties unknown', () => {
    expect(renderTemplate('hello {{name}} {{unknown}}', { name: 'ทดสอบ' })).toBe('hello ทดสอบ ');
  });
  it('F4.4: renderTemplate HTML-escapes value (XSS guard)', () => {
    expect(renderTemplate('<p>{{x}}</p>', { x: '<script>alert(1)</script>' }))
      .toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  });
  it('F4.5: renderTemplate leaves malformed tokens untouched', () => {
    expect(renderTemplate('{{1bad}} {{}} {{ok}}', { ok: 'Y' })).toBe('{{1bad}} {{}} Y');
  });
  it('F4.6: buildPrintContext merges clinic + customer + values', () => {
    const ctx = buildPrintContext({
      clinic: { clinicName: 'Lover Clinic', phone: '02-000-0000' },
      customer: { proClinicHN: 'HN-42', patientData: { firstName: 'สมชาย', lastName: 'ใจดี' } },
      values: { diagnosis: 'ปกติดี' },
    });
    expect(ctx.clinicName).toBe('Lover Clinic');
    expect(ctx.clinicPhone).toBe('02-000-0000');
    expect(ctx.customerHN).toBe('HN-42');
    expect(ctx.customerName).toContain('สมชาย');
    expect(ctx.customerName).toContain('ใจดี');
    expect(ctx.diagnosis).toBe('ปกติดี');
    // today provided automatically in dd/mm/yyyy
    expect(ctx.today).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(ctx.todayBE).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });
  it('F4.7: per-document values override defaults', () => {
    const ctx = buildPrintContext({
      clinic: { clinicName: 'A' },
      customer: {},
      values: { clinicName: 'Overridden' },
    });
    expect(ctx.clinicName).toBe('Overridden');
  });
  it('F4.8: empty inputs yield safe defaults (no NaN / undefined)', () => {
    const ctx = buildPrintContext({});
    expect(ctx.clinicName).toBe('คลินิก');
    expect(ctx.customerName).toBe('');
    expect(ctx.today).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });
});

/* ─── F5: end-to-end render ─────────────────────────────────────────────── */

describe('F5: end-to-end — seed template renders customer HTML', () => {
  it('F5.1: medical-certificate renders with patient + today + dx', () => {
    const seed = SEED_TEMPLATES.find(s => s.docType === 'medical-certificate');
    const ctx = buildPrintContext({
      clinic: { clinicName: 'Lover Clinic' },
      customer: { proClinicHN: 'HN-1', patientData: { firstName: 'สมหญิง', lastName: 'รักสุข' } },
      values: { findings: 'ปกติ', diagnosis: 'โรคหวัด', doctorName: 'นพ.สมชาย' },
    });
    const html = renderTemplate(seed.htmlTemplate, ctx);
    expect(html).toContain('Lover Clinic');
    // ProClinic-replicated medical-cert section 1 uses nationalId only —
    // HN appears via SECTION_2 (sometimes), not by default. Customer name
    // surfaces via {{customerName}} (auto-built from patientData).
    expect(html).toContain('สมหญิง');
    expect(html).toContain('ปกติ');
    expect(html).toContain('โรคหวัด');
    expect(html).toContain('นพ.สมชาย');
  });
  it('F5.2: medicine-label renders minimal shape (3 required fields)', () => {
    const seed = SEED_TEMPLATES.find(s => s.docType === 'medicine-label');
    const ctx = buildPrintContext({
      clinic: { clinicName: 'Lover' },
      customer: { proClinicHN: 'HN-2' },
      values: { medicineName: 'Paracetamol', qty: '20 เม็ด', instructions: 'กินหลังอาหาร' },
    });
    const html = renderTemplate(seed.htmlTemplate, ctx);
    expect(html).toContain('Paracetamol');
    expect(html).toContain('20 เม็ด');
    expect(html).toContain('กินหลังอาหาร');
  });
  it('F5.3: buildPrintDocument produces full HTML with @page size', () => {
    const seed = SEED_TEMPLATES.find(s => s.docType === 'medicine-label');
    const doc = buildPrintDocument({
      template: seed.htmlTemplate,
      context: buildPrintContext({
        values: { medicineName: 'A', qty: '1', instructions: 'B' },
      }),
      paperSize: 'label-57x32',
    });
    expect(doc).toContain('<!DOCTYPE html>');
    expect(doc).toContain('57mm');
    expect(doc).toContain('@page');
    expect(doc).toContain('Sarabun');
    expect(doc).toContain('window.print');
  });
  it('F5.4: missing docType falls back to A4 paper', () => {
    const doc = buildPrintDocument({ template: '<p>x</p>', context: {}, paperSize: 'WTF' });
    expect(doc).toContain('210mm');
    expect(doc).toContain('297mm');
  });
  it('F5.5: fit-to-fly bilingual template renders both languages', () => {
    const seed = SEED_TEMPLATES.find(s => s.docType === 'fit-to-fly');
    const ctx = buildPrintContext({
      customer: { proClinicHN: 'HN-3', patientData: { firstName: 'John', lastName: 'Doe' } },
      values: { customerNameEn: 'John Doe', passport: 'AA1234', flightNo: 'TG103', doctorName: 'Dr.Smith', findings: 'Healthy' },
    });
    const html = renderTemplate(seed.htmlTemplate, ctx);
    expect(html).toContain('FIT-TO-FLY CERTIFICATE');
    expect(html).toContain('ใบรับรองความพร้อม');
    expect(html).toContain('John Doe');
    expect(html).toContain('TG103');
  });
});

/* ─── F6: adversarial inputs ───────────────────────────────────────────── */

describe('F6: adversarial inputs', () => {
  it('F6.1: generateDocumentTemplateId unique × 100', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) ids.add(generateDocumentTemplateId('medical-certificate'));
    expect(ids.size).toBe(100);
    for (const id of ids) expect(id.startsWith('DOC-TMPL-medical-certificate-')).toBe(true);
  });
  it('F6.2: ID slug sanitizes weird characters', () => {
    const id = generateDocumentTemplateId('WTF!@#');
    expect(id).toMatch(/^DOC-TMPL-wtf-[0-9a-f]+$/);
  });
  it('F6.3: Thai value in placeholder escapes nothing harmful (Thai code points allowed)', () => {
    const html = renderTemplate('{{x}}', { x: 'ใบรับรอง "ทดสอบ" >50 คำ' });
    expect(html).toContain('ใบรับรอง');
    expect(html).toContain('&quot;');
    expect(html).toContain('&gt;50');
  });
  it('F6.4: normalizeDocumentTemplate strips invalid field shapes', () => {
    const norm = normalizeDocumentTemplate({
      docType: 'medical-certificate',
      name: '  ชื่อ  ',
      language: 'gibberish',
      paperSize: 'A99',
      htmlTemplate: '<p>x</p>',
      fields: [
        { key: 'ok', label: 'ok', type: 'text' },
        { key: '', label: 'no key' },           // stripped
        'not an object',                         // stripped
        null,                                    // stripped
        { key: 'secondOk', label: '', type: 'textarea', required: true },
      ],
    });
    expect(norm.language).toBe('th'); // fallback
    expect(norm.paperSize).toBe('A4'); // fallback
    expect(norm.name).toBe('ชื่อ');
    expect(norm.fields.length).toBe(2);
    expect(norm.fields[0].key).toBe('ok');
    expect(norm.fields[1].key).toBe('secondOk');
  });
  it('F6.5: renderTemplate handles 1000 placeholders without degrading', () => {
    const body = Array.from({ length: 1000 }, (_, i) => `{{k${i}}}`).join(' ');
    const ctx = {};
    for (let i = 0; i < 1000; i++) ctx[`k${i}`] = String(i);
    const out = renderTemplate(body, ctx);
    // Rough sanity — 999 not stripped by accident
    expect(out).toContain('999');
  });

  it('F6.6: normalize output has NO undefined values (Firestore setDoc compatibility)', () => {
    // V14-class bug 2026-04-25: seed shipped a normalize() that returned
    // `options: undefined` on fields without options → Firestore setDoc()
    // rejected with "Unsupported field value: undefined". Helper-only tests
    // (which only checked output keys/values) didn't catch it because they
    // never touched setDoc. This guard locks the fix: every normalized
    // field must omit absent values, not undefined them.
    function findUndefined(obj, path = '$') {
      if (obj === undefined) return path;
      if (obj === null || typeof obj !== 'object') return null;
      if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
          const r = findUndefined(obj[i], `${path}[${i}]`);
          if (r) return r;
        }
        return null;
      }
      for (const [k, v] of Object.entries(obj)) {
        const r = findUndefined(v, `${path}.${k}`);
        if (r) return r;
      }
      return null;
    }
    for (const seed of SEED_TEMPLATES) {
      const norm = normalizeDocumentTemplate({ ...seed, isSystemDefault: true });
      const undef = findUndefined(norm);
      expect(undef).toBe(null); // any non-null path = an undefined leak
    }
    // Also: explicitly construct fields with mixed-shape inputs
    const norm = normalizeDocumentTemplate({
      docType: 'medical-certificate',
      name: 'x',
      htmlTemplate: '<p>x</p>',
      language: 'th',
      paperSize: 'A4',
      fields: [
        { key: 'a', label: 'A', type: 'text' },                       // no options, no placeholder
        { key: 'b', label: 'B', type: 'select', options: ['X', 'Y'] },// has options
        { key: 'c', label: 'C', type: 'text', placeholder: 'พิมพ์'   }, // has placeholder
        { key: 'd', label: 'D', type: 'text', options: [] },          // empty array — should NOT serialize
      ],
    });
    expect(findUndefined(norm)).toBe(null);
    expect(norm.fields[0]).not.toHaveProperty('options');
    expect(norm.fields[0]).not.toHaveProperty('placeholder');
    expect(norm.fields[1].options).toEqual(['X', 'Y']);
    expect(norm.fields[2].placeholder).toBe('พิมพ์');
    expect(norm.fields[3]).not.toHaveProperty('options'); // empty array stripped
  });
});

/* ─── F7: source-grep regression guards ────────────────────────────────── */

describe('F7: source-grep regression guards', () => {
  const srcDir = path.resolve(__dirname, '..');
  const read = (p) => fs.readFileSync(path.join(srcDir, p), 'utf8');

  it('F7.1: backendClient exports the full CRUD quadruple', () => {
    const src = read('src/lib/backendClient.js');
    expect(src).toMatch(/export async function listDocumentTemplates/);
    expect(src).toMatch(/export async function saveDocumentTemplate/);
    expect(src).toMatch(/export async function deleteDocumentTemplate/);
    expect(src).toMatch(/export async function seedDocumentTemplatesIfEmpty/);
  });
  it('F7.2: firestore.rules has be_document_templates gated on isClinicStaff', () => {
    const src = read('firestore.rules');
    expect(src).toMatch(/be_document_templates/);
    const block = src.split('be_document_templates')[1]?.slice(0, 200) || '';
    expect(block).toMatch(/isClinicStaff/);
    expect(block).not.toMatch(/if true/);
  });
  it('F7.3: nav + BackendDashboard route document-templates tab', () => {
    const nav = read('src/components/backend/nav/navConfig.js');
    expect(nav).toMatch(/id: 'document-templates'/);
    expect(nav).toMatch(/เทมเพลตเอกสาร/);
    const dash = read('src/pages/BackendDashboard.jsx');
    expect(dash).toMatch(/activeTab === 'document-templates'/);
    expect(dash).toMatch(/<DocumentTemplatesTab/);
  });
  it('F7.4: CustomerDetailView mounts DocumentPrintModal + has print button', () => {
    const src = read('src/components/backend/CustomerDetailView.jsx');
    expect(src).toMatch(/DocumentPrintModal/);
    expect(src).toMatch(/พิมพ์เอกสาร/);
    expect(src).toMatch(/data-testid="print-document-btn"/);
  });
  it('F7.5: Rule E — no brokerClient or /api/proclinic in doc files', () => {
    const files = [
      'src/lib/documentTemplateValidation.js',
      'src/lib/documentPrintEngine.js',
      'src/components/backend/DocumentTemplatesTab.jsx',
      'src/components/backend/DocumentTemplateFormModal.jsx',
      'src/components/backend/DocumentPrintModal.jsx',
    ];
    for (const f of files) {
      const src = read(f);
      expect(src).not.toMatch(/brokerClient/);
      expect(src).not.toMatch(/\/api\/proclinic\//);
    }
  });
  it('F7.6: all 13 seed docTypes covered by DOC_TYPES array', () => {
    for (const docType of SEED_TEMPLATES.map(s => s.docType)) {
      expect(DOC_TYPES).toContain(docType);
      expect(typeof DOC_TYPE_LABELS[docType]).toBe('string');
    }
  });
});

/* ─── F8: Phase 14.2 — toggle blocks + language blocks engine ──────────── */

describe('F8: conditional template blocks', () => {
  it('F8.1: {{#if key}} renders body when truthy', () => {
    expect(renderTemplate('A {{#if x}}YES{{/if}} B', { x: true })).toBe('A YES B');
    expect(renderTemplate('A {{#if x}}YES{{/if}} B', { x: false })).toBe('A  B');
    expect(renderTemplate('A {{#if x}}YES{{/if}} B', {})).toBe('A  B');
  });

  it('F8.2: {{#unless key}} renders body when falsy', () => {
    expect(renderTemplate('{{#unless x}}NO{{/unless}}', { x: true })).toBe('');
    expect(renderTemplate('{{#unless x}}NO{{/unless}}', { x: false })).toBe('NO');
    expect(renderTemplate('{{#unless x}}NO{{/unless}}', {})).toBe('NO');
  });

  it('F8.3: {{#lang th}} only renders when language=th (or bilingual)', () => {
    expect(renderTemplate('{{#lang th}}TH{{/lang}}', { language: 'th' })).toBe('TH');
    expect(renderTemplate('{{#lang th}}TH{{/lang}}', { language: 'en' })).toBe('');
    expect(renderTemplate('{{#lang th}}TH{{/lang}}', { language: 'bilingual' })).toBe('TH');
    expect(renderTemplate('{{#lang en}}EN{{/lang}}', { language: 'en' })).toBe('EN');
    expect(renderTemplate('{{#lang en}}EN{{/lang}}', { language: 'th' })).toBe('');
    expect(renderTemplate('{{#lang en}}EN{{/lang}}', { language: 'bilingual' })).toBe('EN');
  });

  it('F8.4: blocks + replacements interact correctly', () => {
    const tpl = '{{customerName}} {{#if showCertNumber}}#{{certNumber}}{{/if}} {{#unless showCertNumber}}(no cert#){{/unless}}';
    expect(renderTemplate(tpl, { customerName: 'A', showCertNumber: true, certNumber: 'C-1' }))
      .toBe('A #C-1 ');
    expect(renderTemplate(tpl, { customerName: 'A', showCertNumber: false }))
      .toBe('A  (no cert#)');
  });

  it('F8.5: tokens inside dropped {{#if}} blocks are also dropped (not leaked)', () => {
    const tpl = 'before {{#if hide}} secret={{secret}} {{/if}} after';
    expect(renderTemplate(tpl, { hide: false, secret: 'BAD' })).toBe('before  after');
  });

  it('F8.6: malformed block (no closing tag) leaves the literal in place', () => {
    // engine simply does not match — block stays
    const tpl = '{{#if x}}orphan';
    expect(renderTemplate(tpl, { x: true })).toBe('{{#if x}}orphan');
  });
});

/* ─── F9: Phase 14.2 — toggles schema validation ───────────────────────── */

describe('F9: validateDocumentTemplate toggles', () => {
  const base = (toggles) => ({
    ...emptyDocumentTemplateForm('medical-certificate'),
    htmlTemplate: '<p>x</p>',
    toggles,
  });

  it('F9.1: empty toggles array allowed', () => {
    expect(validateDocumentTemplate(base([]))).toBeNull();
  });

  it('F9.2: missing toggle.key rejected', () => {
    expect(validateDocumentTemplate(base([{ key: '', labelTh: 'X' }]))?.[0]).toBe('toggles[0].key');
  });

  it('F9.3: invalid toggle.key chars rejected', () => {
    expect(validateDocumentTemplate(base([{ key: 'bad-key', labelTh: 'X' }]))?.[0]).toBe('toggles[0].key');
  });

  it('F9.4: duplicate toggle.key rejected', () => {
    expect(validateDocumentTemplate(base([
      { key: 'a', labelTh: 'A' },
      { key: 'a', labelTh: 'B' },
    ]))?.[0]).toBe('toggles[1].key');
  });

  it('F9.5: missing labelTh rejected', () => {
    expect(validateDocumentTemplate(base([{ key: 'a', labelTh: '' }]))?.[0]).toBe('toggles[0].labelTh');
  });

  it('F9.6: more than MAX_TOGGLES rejected', () => {
    const tooMany = Array.from({ length: MAX_TOGGLES + 1 }, (_, i) => ({ key: `t${i}`, labelTh: `T${i}` }));
    expect(validateDocumentTemplate(base(tooMany))?.[0]).toBe('toggles');
  });

  it('F9.7: every seed with toggles passes validation', () => {
    for (const seed of SEED_TEMPLATES) {
      if (Array.isArray(seed.toggles) && seed.toggles.length > 0) {
        expect(validateDocumentTemplate(seed, { strict: true })).toBeNull();
      }
    }
  });

  it('F9.8: toggle keys referenced in template HTML must exist in toggle list', () => {
    // Lock the contract: if HTML uses {{#if showCertNumber}}, the template
    // must declare a toggle with key=showCertNumber.
    const HARDCODED_CTX_KEYS = new Set([
      'language', 'today', 'todayISO', 'todayBE',
      'clinicName', 'clinicNameEn', 'clinicAddress', 'clinicAddressEn',
      'clinicPhone', 'clinicEmail', 'clinicTaxId', 'clinicLicenseNo',
      'customerName', 'customerHN', 'customerNameEn',
      'nationalId', 'age', 'gender', 'phone',
    ]);
    for (const seed of SEED_TEMPLATES) {
      const ifRe = /\{\{#(?:if|unless)\s+([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
      const conditionalKeys = new Set();
      let m;
      while ((m = ifRe.exec(seed.htmlTemplate)) !== null) conditionalKeys.add(m[1]);
      const fieldKeys = new Set((seed.fields || []).map(f => f.key));
      const toggleKeys = new Set((seed.toggles || []).map(t => t.key));
      for (const ck of conditionalKeys) {
        const known = fieldKeys.has(ck) || toggleKeys.has(ck) || HARDCODED_CTX_KEYS.has(ck);
        expect(`${seed.docType}::${ck}::known=${known}`).toBe(`${seed.docType}::${ck}::known=true`);
      }
    }
  });
});

/* ─── F10: schemaVersion + buildPrintContext language/toggles ──────────── */

describe('F10: schemaVersion + context spread', () => {
  it('F10.1: SEED_TEMPLATES omit schemaVersion → normalize adds default', () => {
    const norm = normalizeDocumentTemplate(SEED_TEMPLATES[0]);
    expect(norm.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('F10.2: explicit schemaVersion preserved', () => {
    const norm = normalizeDocumentTemplate({ ...SEED_TEMPLATES[0], schemaVersion: 1 });
    expect(norm.schemaVersion).toBe(1);
  });

  it('F10.3: buildPrintContext spreads toggle keys at top level', () => {
    const ctx = buildPrintContext({
      clinic: {}, customer: {},
      toggles: { showCertNumber: true, showPatientSignature: false },
    });
    expect(ctx.showCertNumber).toBe(true);
    expect(ctx.showPatientSignature).toBe(false);
  });

  it('F10.4: buildPrintContext clinic fields cover full ProClinic header', () => {
    const ctx = buildPrintContext({
      clinic: {
        clinicName: 'Lover',
        clinicNameEn: 'Lover Clinic',
        clinicAddress: 'ที่อยู่',
        clinicAddressEn: 'Address',
        clinicPhone: '02-000-0000',
        clinicLicenseNo: 'L-123',
        clinicTaxId: 'TX-456',
      },
    });
    expect(ctx.clinicName).toBe('Lover');
    expect(ctx.clinicNameEn).toBe('Lover Clinic');
    expect(ctx.clinicAddress).toBe('ที่อยู่');
    expect(ctx.clinicAddressEn).toBe('Address');
    expect(ctx.clinicLicenseNo).toBe('L-123');
    expect(ctx.clinicTaxId).toBe('TX-456');
  });

  it('F10.5: buildPrintContext language defaults to th, accepts en/bilingual', () => {
    expect(buildPrintContext({}).language).toBe('th');
    expect(buildPrintContext({ language: 'en' }).language).toBe('en');
    expect(buildPrintContext({ language: 'bilingual' }).language).toBe('bilingual');
    expect(buildPrintContext({ language: 'gibberish' }).language).toBe('th');
  });
});

/* ─── F11: full-flow render — replicated seeds with all options ────────── */

describe('F11: full ProClinic-replicated rendering', () => {
  it('F11.1: medical-cert with showCertNumber off + showPatientSignature off', () => {
    const seed = SEED_TEMPLATES.find(s => s.docType === 'medical-certificate');
    const ctx = buildPrintContext({
      clinic: { clinicName: 'Lover Clinic', clinicAddress: '67/12 ทดสอบ', clinicPhone: '02-000', clinicLicenseNo: '11102000999' },
      customer: { proClinicHN: 'HN-9', patientData: { firstName: 'สมชาย', lastName: 'ใจดี' } },
      values: { findings: 'ปกติ', diagnosis: 'หวัด', doctorName: 'นพ.A', doctorLicenseNo: 'L-A' },
      toggles: { showCertNumber: false, showPatientSignature: false },
    });
    const html = renderTemplate(seed.htmlTemplate, ctx);
    expect(html).toContain('Lover Clinic');
    expect(html).toContain('11102000999'); // license shown in header
    expect(html).toContain('นพ.A');
    // Cert# block hidden — its specific markup is `<strong>เลขที่:</strong>`
    // (the unique pattern in CERT_NUMBER_LINE). The header has
    // `เลขที่ใบอนุญาต:` for clinic license which is fine to leave.
    expect(html).not.toContain('<strong>เลขที่:</strong>');
    // Patient signature block hidden — the specific footnote text "ผู้ปกครอง"
    // only appears inside that block.
    expect(html).not.toContain('ผู้ปกครอง');
    // Date still shown via top date line
    expect(html).toMatch(/วันที่รักษา/);
  });

  it('F11.2: medical-cert with showCertNumber ON renders cert# block', () => {
    const seed = SEED_TEMPLATES.find(s => s.docType === 'medical-certificate');
    const ctx = buildPrintContext({
      clinic: { clinicName: 'Lover' },
      customer: {},
      values: { certNumber: 'CERT-2026-001', findings: 'X', diagnosis: 'Y', doctorName: 'Z' },
      toggles: { showCertNumber: true },
    });
    const html = renderTemplate(seed.htmlTemplate, ctx);
    expect(html).toContain('เลขที่:');
    expect(html).toContain('CERT-2026-001');
  });

  it('F11.3: thai-traditional cert renders without doctor-license footer (Thai-style)', () => {
    const seed = SEED_TEMPLATES.find(s => s.docType === 'thai-traditional-medicine-medical-certificate');
    const ctx = buildPrintContext({
      clinic: { clinicName: 'Lover' },
      customer: { patientData: { firstName: 'A' } },
      values: { doctorName: 'แพทย์แผนไทย', findings: 'F', tcmExam: 'E', treatment: 'T' },
    });
    const html = renderTemplate(seed.htmlTemplate, ctx);
    expect(html).toContain('แพทย์แผนไทยประยุกต์');
    expect(html).toContain('สรุปความเห็นและข้อแนะนำ');
  });

  it('F11.4: chinese-traditional cert in EN mode shows Chinese characters', () => {
    const seed = SEED_TEMPLATES.find(s => s.docType === 'chinese-traditional-medicine-medical-certificate');
    const ctx = buildPrintContext({
      clinic: { clinicName: 'Lover' },
      customer: {},
      values: { doctorName: 'D', symptoms: 'S', tcmDiagnosis: 'TD', treatment: 'T' },
      language: 'en',
    });
    const html = renderTemplate(seed.htmlTemplate, ctx);
    expect(html).toContain('中医医疗证明');
    expect(html).toContain('症状');
  });

  it('F11.5: chinese cert in TH mode hides Chinese chars', () => {
    const seed = SEED_TEMPLATES.find(s => s.docType === 'chinese-traditional-medicine-medical-certificate');
    const ctx = buildPrintContext({
      clinic: { clinicName: 'Lover' },
      customer: {},
      values: { doctorName: 'D', symptoms: 'S', tcmDiagnosis: 'TD', treatment: 'T' },
      language: 'th',
    });
    const html = renderTemplate(seed.htmlTemplate, ctx);
    expect(html).not.toContain('中医医疗证明');
    expect(html).not.toContain('症状');
    // TH-only label still shown
    expect(html).toContain('การวินิจฉัยแพทย์จีน');
  });

  it('F11.6: medicine-label still works (no toggles)', () => {
    const seed = SEED_TEMPLATES.find(s => s.docType === 'medicine-label');
    const ctx = buildPrintContext({
      clinic: { clinicName: 'Lover', clinicPhone: '02-000-0000' },
      customer: { proClinicHN: 'HN-1', patientData: { firstName: 'A', lastName: 'B' } },
      values: { medicineName: 'Paracetamol', genericName: 'พารา', qty: '20', instructions: 'กินหลังอาหาร', warning: 'ห้ามขับรถ', doctorName: 'D' },
    });
    const html = renderTemplate(seed.htmlTemplate, ctx);
    expect(html).toContain('Paracetamol');
    expect(html).toContain('พารา');
    expect(html).toContain('ห้ามขับรถ'); // warning shown
  });

  it('F11.7: patient-referral bilingual renders both languages by default', () => {
    const seed = SEED_TEMPLATES.find(s => s.docType === 'patient-referral');
    const ctx = buildPrintContext({
      clinic: { clinicName: 'L' },
      customer: { patientData: { firstName: 'X' } },
      values: { referTo: 'รพ.ราม', cc: 'ปวด', referralReason: 'ส่งต่อ', doctorName: 'D' },
      language: 'bilingual',
    });
    const html = renderTemplate(seed.htmlTemplate, ctx);
    expect(html).toContain('Patient Referral Letter');
    expect(html).toContain('ใบส่งตัวผู้ป่วย');
    expect(html).toContain('รพ.ราม');
  });
});
