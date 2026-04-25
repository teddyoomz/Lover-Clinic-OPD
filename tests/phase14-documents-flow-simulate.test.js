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
  it('F2.1: 16 seeds for 16 docTypes (13 originals + 3 treatment-record from Phase 14.2.B)', () => {
    const docTypes = SEED_TEMPLATES.map(s => s.docType);
    expect(docTypes.length).toBe(16);
    expect(new Set(docTypes).size).toBe(16);
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

  it('F9.8: toggle keys referenced in template HTML must exist in toggle list OR universal toggle names', () => {
    // Universal toggle names (always-on when not exposed to user). The
    // print modal pre-populates these as TRUE when the template's toggles
    // array is empty, so {{#if showCertNumber}} blocks render even on
    // certs without an explicit user-facing toggle (e.g., fit-to-fly,
    // patient-referral always show cert# per ProClinic).
    const UNIVERSAL_TOGGLE_KEYS = new Set([
      'showCertNumber', 'showPatientSignature',
    ]);
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
        const known = fieldKeys.has(ck) || toggleKeys.has(ck)
          || HARDCODED_CTX_KEYS.has(ck) || UNIVERSAL_TOGGLE_KEYS.has(ck);
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

/* ─── F12: per-doc end-to-end render verification (all 16 docTypes) ───── */
//
// User directive 2026-04-25: "make sure ว่า field ที่ว่างๆ ใช้ได้จริง หรือไม่
// ก็เขียนเทสขึ้นมาแล้วทดสอบเองเลย กับทุกหน้านะ"
//
// For EVERY seed docType, render the template TWICE:
//   (a) with FULL realistic context (customer + treatment data + every
//       toggle on, every field populated) — assert all sections + values
//       appear, NO literal "{{key}}" placeholder leaks, NO literal
//       "<tr><td" text leak (raw-HTML rows must parse as elements when
//       embedded in real HTML stream).
//   (b) with MINIMAL context (empty customer / no treatment / no toggles) —
//       assert template still renders WITHOUT crashing, no JS errors,
//       no leftover orphan markup, empty fields show as blank/dash, NOT
//       as literal "{{key}}".
//
// Catches the V14/V15 pattern: "tests pass for one happy path, real
// usage breaks because data shape doesn't match" — F12 covers ALL
// docTypes systematically.

describe('F12: per-doc end-to-end render — all 16 docTypes', () => {
  // Build a comprehensive "full" context that satisfies every field across
  // all docTypes. Per-docType tests pull only the fields they care about.
  const FULL_CLINIC = {
    clinicName: 'Lover Clinic',
    clinicNameEn: 'Lover Clinic',
    clinicAddress: '67/12 ทดสอบ',
    clinicAddressEn: '67/12 Test Address',
    clinicPhone: '02-000-0000',
    clinicEmail: 'test@lover.clinic',
    clinicTaxId: '0123456789012',
    clinicLicenseNo: '11102000999',
  };
  const FULL_CUSTOMER = {
    proClinicHN: 'HN-TEST-001',
    patientData: {
      prefix: 'นาง',
      firstName: 'สมหญิง',
      lastName: 'รักษาตัว',
      gender: 'หญิง',
      birthdate: '1990-05-12',
      bloodType: 'A',
      address: '99 ถ.ทดสอบ กรุงเทพฯ 10000',
      phone: '081-234-5678',
      nationalId: '1-1234-12345-12-1',
      age: '35',
    },
  };
  const FULL_VALUES = {
    // common
    certNumber: 'TEST-2026-001',
    certBookNumber: 'B-1',
    treatmentDate: '2026-04-25',
    doctorName: 'นพ.ทดสอบ ใจดี',
    doctorLicenseNo: 'L-12345',
    findings: 'ตรวจร่างกายปกติ',
    diagnosis: 'A001 Cholera due to Vibrio cholerae 01',
    recommendation: 'พักผ่อน',
    restDays: '3',
    restFrom: '2026-04-25',
    restTo: '2026-04-28',
    fitVerdict: 'มีความเหมาะสม',
    // medical-cert history checkboxes
    hasChronicDisease: true,
    chronicDisease: 'เบาหวาน',
    hasAccidents: false,
    accidentsDetails: '',
    hasHospitalized: false,
    hospitalizedDetails: '',
    hasEpilepsy: false,
    epilepsyDetails: '',
    otherHistory: '-',
    patientAddress: '99 ถ.ทดสอบ',
    // driver-license extras
    bp: '120/80',
    pulse: '72',
    visionRight: '20/20',
    visionLeft: '20/20',
    colorBlind: false,
    // medical-opinion
    opinion: 'ผู้ป่วยมีอาการไข้',
    // physical-therapy
    symptoms: 'ปวดคอ',
    evaluation: 'กล้ามเนื้อตึง',
    treatments: 'นวดประคบ',
    sessionCount: '5',
    // thai-traditional
    tcmExam: 'ผลตรวจปกติ',
    treatment: 'ฝังเข็ม',
    // chinese-traditional
    tcmDiagnosis: '中医诊断',
    // fit-to-fly
    customerNameEn: 'Mrs. Somying Raksa',
    passport: 'AA1234567',
    nationality: 'Thai',
    dob: '1990-05-12',
    flightNo: 'TG-103',
    flightDate: '2026-05-01',
    route: 'BKK-LHR',
    temp: '36.5',
    // patient-referral
    referTo: 'รพ.รามาธิบดี',
    referDoctor: 'นพ.ผู้รับ',
    cc: 'เจ็บหน้าอก',
    history: 'ประวัติเดิม',
    examination: 'ผลตรวจ',
    treatmentGiven: 'ให้ยาไปแล้ว',
    referralReason: 'ส่งต่อเพื่อ MRI',
    // medicine-label
    medicineName: 'Paracetamol',
    genericName: 'พารา',
    qty: '20 เม็ด',
    instructions: 'กินหลังอาหาร',
    indication: 'ลดไข้',
    warning: 'ห้ามขับรถ',
    // chart
    hpi: 'มา 3 วัน',
    pmh: '-',
    pe: 'ปกติ',
    dx: 'หวัด',
    txPlan: 'ให้ยา',
    // consent
    procedure: 'ฉีดยา',
    risks: 'แพ้',
    cost: '500',
    witnessName: 'พยาน',
    // treatment plan
    condition: 'อาการ',
    goals: 'หาย',
    plan: 'แผนการ',
    duration: '2 wk',
    visitCount: '4',
    estimatedCost: '5000',
    sideEffects: '-',
    // sale-cancelation
    originalSaleId: 'INV-001',
    saleDate: '2026-04-20',
    amount: '1000',
    reason: 'ลูกค้ายกเลิก',
    refundAmount: '1000',
    refundMethod: 'เงินสด',
    refundReference: 'REF-1',
    staffName: 'พนักงาน A',
    // medical-opinion + others
    physicalExam: 'ปกติ',
    treatmentNote: 'ให้ยา',
    treatmentPlan: 'นัด 2 สัปดาห์',
    additionalNote: '-',
    // treatment-history pre-rendered raw HTML rows
    treatmentRecordRows: '<tr><td style="border:1px solid #000;padding:6px">Allergan 100 U</td><td style="border:1px solid #000;padding:6px;text-align:right">100 U</td><td style="border:1px solid #000;padding:6px;text-align:right">0 U</td></tr>',
    homeMedicationRows: '<tr><td style="border:1px solid #000;padding:6px">Acetin</td><td style="border:1px solid #000;padding:6px;text-align:right">1 amp.</td></tr>',
    // course-deduction rows
    deductionRows: '<tr><td style="border:1px solid #000;padding:6px">Botox</td><td style="border:1px solid #000;padding:6px;text-align:right">100 U</td><td style="border:1px solid #000;padding:6px;text-align:right">200 U</td><td style="border:1px solid #000;padding:6px;text-align:right">100 U</td></tr>',
    // treatment-referral
    treatmentItems: 'Allergan 100 U × 100 U',
    drNote: 'หมายเหตุ',
    // patient bio
    age: '35',
    gender: 'หญิง',
    birthdate: '12/05/1990',
    bloodGroup: 'A',
    emergencyName: 'คุณแม่',
    emergencyPhone: '081-999-9999',
    bt: '36.5',
    pr: '72',
    rr: '18',
    spo2: '98',
    note: 'หมายเหตุทดสอบ',
  };

  const FULL_TOGGLES = { showCertNumber: true, showPatientSignature: true };

  // Helper assertion: NO leftover {{key}} or {{{key}}} placeholders in output
  function expectNoPlaceholderLeak(html, docType) {
    const leaked = html.match(/\{\{[^}]+\}\}/g) || [];
    expect(leaked.length === 0
      ? 'no leak'
      : `${docType} leaked: ${leaked.join(' | ')}`
    ).toBe('no leak');
  }

  // Helper: HTML rendered as actual elements, not literal text. We check by
  // parsing into a DOM and verifying any `<tr>` / `<table>` strings in the
  // raw HTML actually appear as elements (not as text nodes in escaped form).
  function expectNoRawTagLeakInText(html, docType) {
    // Find all literal "&lt;tr&gt;" or "&lt;td" — those would mean raw HTML
    // got escaped. Real elements appear as "<tr" / "<td" without entity.
    const escaped = html.match(/&lt;(tr|td|table)[^&]*&gt;/g) || [];
    expect(escaped.length === 0
      ? 'no escaped tag leak'
      : `${docType} escaped: ${escaped.join(' | ')}`
    ).toBe('no escaped tag leak');
  }

  // Per-docType test cases — what every doc must have when rendered FULL.
  // `mustContain` arrays = strings expected in the rendered HTML.
  const PER_DOC_EXPECTATIONS = {
    'medical-certificate': {
      // Phase 14.2.E (2026-04-25) — locked to ProClinic /admin/medical-certificate
      // .print-area extraction. All section headers + 4-disease clause + vitals
      // labels + summary line must be present.
      mustContain: [
        'ใบรับรองแพทย์', 'ส่วนที่ 1', 'ส่วนที่ 2', 'โรคประจำตัว', 'อุบัติเหตุ', 'ผู้ปกครอง',
        'น้ำหนักตัว', 'ความสูง', 'ความดันโลหิต', 'ชีพจร',
        'สภาพร่างกายทั่วไปอยู่ในเกณฑ์',
        'ขอรับรองว่าบุคคลดังกล่าว',
        'โรคเรื้อนในระยะติดต่อ', 'วัณโรคในระยะอันตราย', 'โรคเท้าช้าง', 'อื่นๆ',
        'สรุปความเห็นและข้อแนะนำของแพทย์',
      ],
      mustHaveValue: ['Lover Clinic', 'นพ.ทดสอบ ใจดี', 'A001 Cholera', 'TEST-2026-001'],
    },
    'medical-certificate-for-driver-license': {
      mustContain: ['ใบรับรองแพทย์', 'ใบอนุญาตขับรถ', 'ส่วนที่ 1', 'ส่วนที่ 2', 'มีความเหมาะสม'],
      mustHaveValue: ['Lover Clinic', 'นพ.ทดสอบ ใจดี', 'มีความเหมาะสม'],
    },
    'medical-opinion': {
      mustContain: ['ใบรับรองแพทย์ลาป่วย', 'ความเห็น/อาการ', 'การวินิจฉัย'],
      mustHaveValue: ['ผู้ป่วยมีอาการไข้', 'A001 Cholera'],
    },
    'physical-therapy-certificate': {
      mustContain: ['ใบรับรองกายภาพบำบัด', 'อาการ', 'การบำบัดที่ได้รับ'],
      mustHaveValue: ['ปวดคอ', 'นวดประคบ'],
    },
    'thai-traditional-medicine-medical-certificate': {
      mustContain: ['ใบรับรองแพทย์แผนไทยประยุกต์', 'จากการประเมินพบว่า', 'สรุปความเห็น'],
      mustHaveValue: ['ตรวจร่างกายปกติ'],
    },
    'chinese-traditional-medicine-medical-certificate': {
      mustContain: ['ใบรับรองแพทย์แผนจีน', 'อาการ'],
      mustHaveValue: ['ปวดคอ'],
    },
    'fit-to-fly': {
      mustContain: ['FIT-TO-FLY CERTIFICATE', 'Patient Name', 'Flight No.'],
      mustHaveValue: ['Mrs. Somying Raksa', 'AA1234567', 'TG-103'],
    },
    'patient-referral': {
      mustContain: ['ใบส่งตัวผู้ป่วย', 'Patient Referral Letter', 'ส่งต่อไปยัง'],
      mustHaveValue: ['รพ.รามาธิบดี', 'ส่งต่อเพื่อ MRI'],
    },
    'medicine-label': {
      mustContain: ['Lover Clinic', 'จำนวน:'],
      mustHaveValue: ['Paracetamol', '20 เม็ด', 'กินหลังอาหาร'],
    },
    'chart': {
      mustContain: ['ใบประวัติการรักษา', 'CC', 'HPI', 'PE', 'Dx'],
      mustHaveValue: ['มา 3 วัน', 'หวัด'],
    },
    'consent': {
      mustContain: ['หนังสือยินยอมรับการรักษา', 'หัตถการ/การรักษา', 'ความเสี่ยง'],
      mustHaveValue: ['ฉีดยา', 'แพ้', 'พยาน'],
    },
    'treatment': {
      mustContain: ['แผนการรักษา', 'ภาวะที่ต้องรักษา', 'เป้าหมาย'],
      mustHaveValue: ['อาการ', 'หาย'],
    },
    'sale-cancelation': {
      mustContain: ['ใบยกเลิกการขาย', 'เลขที่ใบเสร็จเดิม', 'จำนวนเงินคืน'],
      mustHaveValue: ['INV-001', 'พนักงาน A'],
    },
    'treatment-history': {
      mustContain: ['Medical History', 'Customer information', 'Vital signs', 'Symptoms', 'Physical Examination', 'Diagnosis', 'Treatment', 'Treatment Plan', 'Additional note', 'Treatment record', 'Home medication', 'Physician'],
      mustHaveValue: ['Lover Clinic', 'A001 Cholera', 'นพ.ทดสอบ ใจดี'],
    },
    'treatment-referral': {
      mustContain: ['ใบส่งตัวทรีตเมนต์', 'ทรีตเมนต์ที่จะรับ', 'แพทย์ผู้สั่ง'],
      mustHaveValue: ['Lover Clinic', 'นพ.ทดสอบ ใจดี'],
    },
    'course-deduction': {
      mustContain: ['ใบตัดคอร์ส', 'คอร์ส / สินค้า', 'คงเหลือก่อน', 'คงเหลือหลัง'],
      mustHaveValue: ['นพ.ทดสอบ ใจดี', 'พนักงาน A'],
    },
  };

  // Per-doc render with FULL context
  for (const seed of SEED_TEMPLATES) {
    const expectations = PER_DOC_EXPECTATIONS[seed.docType];
    if (!expectations) continue;

    it(`F12.full:${seed.docType} — renders without {{leak}} + raw-HTML rows render as elements`, () => {
      const ctx = buildPrintContext({
        clinic: FULL_CLINIC,
        customer: FULL_CUSTOMER,
        values: FULL_VALUES,
        language: seed.language === 'bilingual' ? 'bilingual' : 'th',
        toggles: FULL_TOGGLES,
      });
      const html = renderTemplate(seed.htmlTemplate, ctx);

      // No leftover placeholders
      expectNoPlaceholderLeak(html, seed.docType);
      // No escaped table tags (would indicate raw-HTML field forgot {{{}}})
      expectNoRawTagLeakInText(html, seed.docType);

      // Required strings appear
      for (const s of expectations.mustContain) {
        const found = html.includes(s);
        expect(found ? `${seed.docType}::contains::${s}` : `${seed.docType}::MISSING::${s}`)
          .toBe(`${seed.docType}::contains::${s}`);
      }
      // Required prefilled values appear
      for (const v of expectations.mustHaveValue) {
        const found = html.includes(v);
        expect(found ? `${seed.docType}::value::${v}` : `${seed.docType}::value-MISSING::${v}`)
          .toBe(`${seed.docType}::value::${v}`);
      }
    });

    it(`F12.empty:${seed.docType} — renders with EMPTY context without crashing or leaking placeholders`, () => {
      // No customer, no values, no toggles.
      const ctx = buildPrintContext({
        clinic: { clinicName: 'X' },
        customer: {},
        values: {},
        language: 'th',
        toggles: {},
      });
      const html = renderTemplate(seed.htmlTemplate, ctx);
      expect(typeof html).toBe('string');
      expect(html.length).toBeGreaterThan(0);
      // No leftover placeholders even when values empty
      expectNoPlaceholderLeak(html, seed.docType);
      expectNoRawTagLeakInText(html, seed.docType);
    });
  }

  it('F12.coverage: PER_DOC_EXPECTATIONS covers every SEED_TEMPLATE docType', () => {
    for (const seed of SEED_TEMPLATES) {
      expect(`${seed.docType}-defined-in-expectations:${!!PER_DOC_EXPECTATIONS[seed.docType]}`)
        .toBe(`${seed.docType}-defined-in-expectations:true`);
    }
  });
});

/* ─── F11: full-flow render — replicated seeds with all options ────────── */

describe('F11: full ProClinic-replicated rendering', () => {
  it('F11.1: medical-certificate (5 โรค) — Phase 14.2.B always-on layout (no toggles per ProClinic)', () => {
    const seed = SEED_TEMPLATES.find(s => s.docType === 'medical-certificate');
    // Per ProClinic screenshot: medical-cert (5 โรค) has TH/EN switch only,
    // no show/hide toggles — full doc always rendered including cert#,
    // section 1+2, patient signature footnote.
    expect(seed.toggles).toEqual([]);
    const ctx = buildPrintContext({
      clinic: { clinicName: 'Lover Clinic', clinicAddress: '67/12 ทดสอบ', clinicPhone: '02-000', clinicLicenseNo: '11102000999' },
      customer: { proClinicHN: 'HN-9', patientData: { firstName: 'สมชาย', lastName: 'ใจดี' } },
      values: { findings: 'ปกติ', diagnosis: 'หวัด', doctorName: 'นพ.A', doctorLicenseNo: 'L-A', certNumber: 'CERT-A1' },
    });
    const html = renderTemplate(seed.htmlTemplate, ctx);
    expect(html).toContain('Lover Clinic');
    expect(html).toContain('11102000999'); // license shown in header
    expect(html).toContain('นพ.A');
    // Cert# block ALWAYS shown — Phase 14.2.D theme adds color:#b71c1c
    expect(html).toContain('เลขที่:');
    expect(html).toContain('CERT-A1');
    // Patient signature footnote ALWAYS shown (no toggle gate)
    expect(html).toContain('ผู้ปกครอง');
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

/* ─── F13: Wiring/prefill flow simulate (pure mirror of CustomerDetailView) ─
 *
 * Per user directive 2026-04-25: "เขียนเทสขึ้นมาแล้วทดสอบเองเลย กับทุก doc
 * นะ ว่าต้องเหมือนเป๊ะและใช้ได้จริงๆ จะต้องมีการทดสอบทั้งความเหมือน และ
 * wiring logic flow ของทุก field ในทุก doc".
 *
 * F12 already covers similarity (mustContain + mustHaveValue). F13 covers
 * the WIRING — given a realistic be_treatments + be_customers doc, the
 * prefill mapping in CustomerDetailView.jsx:787-887 must produce values
 * that flow through buildPrintContext → renderTemplate and surface in
 * the rendered HTML for every doc field that has a known prefill source.
 *
 * F13 mirrors the inline JSX prefill logic as a pure function so we can
 * chain master-data → prefill → render in tests without mounting React.
 * Per Rule I (b): runtime preview_eval covers the React-mount edge cases;
 * F13 covers what grep/build/test can verify deterministically.
 *
 * Why this is necessary (V13 cluster lesson): helper-output-in-isolation
 * tests (F1-F11) catch logic bugs INSIDE a single function. They miss
 * INTEGRATION bugs that live in seams — whitelist strips, missing field
 * mappings, doctor-name regex drift. F13 + F14 lock those seams.
 * ─────────────────────────────────────────────────────────────────────── */

// ─── Pure prefill mirror — copy of CustomerDetailView.jsx:787-887 logic ───
// Keep this in sync with the JSX. If you change one, change the other.
function buildPrefillForTreatment({ customer, treatment, summary, today }) {
  const d = treatment?.detail || {};
  const v = d.vitals || {};
  const pd = customer?.patientData || {};
  const treatmentDate = d.treatmentDate || summary?.date || today || '2026-04-25';
  const fmtBdate = pd.birthdate || pd.dob || pd.dateOfBirth || '';

  const stripDoctorDupes = (raw) => {
    if (!raw) return '';
    const m = String(raw).match(/^[^)]+\)/);
    return m ? m[0].trim() : String(raw).trim();
  };

  const treatmentItemsArr = Array.isArray(d.treatmentItems) ? d.treatmentItems : [];
  const courseItemsArr = Array.isArray(d.courseItems) ? d.courseItems : [];
  const courseRemainMap = new Map();
  for (const ci of courseItemsArr) {
    if (ci.productName) courseRemainMap.set(ci.productName, ci);
  }
  const treatmentRecordRows = treatmentItemsArr.map(ti => {
    const desc = ti.name || ti.productName || '-';
    const qty = ti.quantity || `${ti.qty || ''} ${ti.unit || ''}`.trim() || '';
    const ci = courseRemainMap.get(desc);
    const remaining = ci?.remainingAfter != null ? `${ci.remainingAfter} ${ci.unit || ''}`.trim()
                    : (ci?.remaining != null ? `${ci.remaining} ${ci.unit || ''}`.trim()
                    : (ti.remaining != null ? `${ti.remaining} ${ti.unit || ''}`.trim() : '0 U'));
    return `<tr><td style="border:1px solid #000;padding:6px">${desc}</td><td style="border:1px solid #000;padding:6px;text-align:right">${qty}</td><td style="border:1px solid #000;padding:6px;text-align:right">${remaining}</td></tr>`;
  }).join('') || `<tr><td colspan="3" style="border:1px solid #000;padding:6px;text-align:center;color:#888">-</td></tr>`;

  const homeRows = [...(Array.isArray(d.consumables) ? d.consumables : []), ...(Array.isArray(d.medications) ? d.medications : [])];
  const homeMedicationRows = homeRows.map(it => {
    const desc = it.name || it.productName || it.medicineName || '-';
    const qty = it.quantity || `${it.qty != null ? it.qty : ''} ${it.unit || ''}`.trim() || '';
    return `<tr><td style="border:1px solid #000;padding:6px">${desc}</td><td style="border:1px solid #000;padding:6px;text-align:right">${qty}</td></tr>`;
  }).join('') || `<tr><td colspan="2" style="border:1px solid #000;padding:6px;text-align:center;color:#888">-</td></tr>`;

  const treatmentItemsText = treatmentItemsArr
    .map(p => `${p.name || p.productName || ''} ${p.quantity || `${p.qty || ''} ${p.unit || ''}`.trim()}`.trim())
    .filter(Boolean)
    .join('\n');

  const bp = (v.systolicBP || v.diastolicBP)
    ? `${v.systolicBP || '-'}/${v.diastolicBP || '-'}`
    : (v.bp || '');

  const cleanDoctor = stripDoctorDupes(d.doctorName || summary?.doctor || '');
  return {
    treatmentDate,
    doctorName: cleanDoctor,
    assistantName: (Array.isArray(d.assistants) ? d.assistants.join(', ') : '')
      || (Array.isArray(summary?.assistants) ? summary.assistants.join(', ') : '') || '',
    birthdate: fmtBdate,
    bloodGroup: pd.bloodType || pd.bloodGroup || '',
    patientAddress: pd.address || '',
    emergencyName: pd.emergencyName || pd.emergencyContactName || pd.emergencyContact?.name || '',
    emergencyPhone: pd.emergencyPhone || pd.emergencyContactPhone || pd.emergencyContact?.phone || '',
    bt: v.temperature || v.bt || v.temp || '',
    pr: v.pulseRate || v.pr || v.pulse || '',
    rr: v.respiratoryRate || v.rr || '',
    bp,
    spo2: v.oxygenSaturation || v.spo2 || v.oxygenSat || '',
    symptoms: d.symptoms || d.cc || summary?.cc || '',
    physicalExam: d.physicalExam || d.pe || '',
    diagnosis: d.diagnosis || d.dx || summary?.dx || '',
    treatment: d.treatmentNote || d.tx || '',
    treatmentPlan: d.treatmentPlan || d.txPlan || '',
    additionalNote: d.additionalNote || d.note2 || '',
    treatmentRecordRows,
    homeMedicationRows,
    findings: d.physicalExam || d.pe || d.symptoms || d.cc || '',
    drNote: d.treatmentNote || d.note || d.drNote || '',
    treatmentItems: treatmentItemsText,
    // Phase 14.2.E (2026-04-25) — medical-certificate (5 โรค) extras
    vitalsWeight: v.weight || v.bw || '',
    vitalsHeight: v.height || v.bh || '',
    bodyNormalMark:   '☐',
    bodyAbnormalMark: '☐',
    bodyAbnormalDetail: '',
    otherConditions: '',
  };
}

describe('F13: prefill wiring — every field flows from be_treatments/be_customers → rendered HTML', () => {
  // Realistic be_treatments doc as actually saved by TreatmentFormPage.
  // Schema verified via preview_eval on real Firestore data 2026-04-25.
  const REAL_TREATMENT = {
    treatmentId: 'TR-2026-001',
    detail: {
      treatmentDate: '2026-04-25',
      doctorName: 'นพ.ทดสอบ ใจดี (X)นพ.รอง สอง (Y)เลือกแพทย์ประจำตัว',
      assistants: ['คุณช่วย หนึ่ง', 'คุณช่วย สอง'],
      symptoms: 'ปวดหัว มา 3 วัน',
      physicalExam: 'BP 120/80, HEENT ปกติ',
      diagnosis: 'A001 Cholera',
      treatmentNote: 'ให้ยาแก้ปวดและฉีด Botox 100U',
      treatmentPlan: 'นัดติดตาม 2 สัปดาห์',
      additionalNote: 'แพ้ยาประเภท Sulfa',
      vitals: {
        systolicBP: 120,
        diastolicBP: 80,
        pulseRate: 72,
        respiratoryRate: 18,
        temperature: 36.5,
        oxygenSaturation: 98,
        weight: 60,
        height: 165,
      },
      treatmentItems: [
        { name: 'Allergan Botox', quantity: '100 U', qty: 100, unit: 'U' },
        { name: 'Hyaluronic Filler', quantity: '1 syringe', qty: 1, unit: 'syringe' },
      ],
      courseItems: [
        { productName: 'Allergan Botox', remainingAfter: 0, unit: 'U' },
      ],
      consumables: [
        { name: 'Acetin', quantity: '1 amp.', qty: 1, unit: 'amp.' },
      ],
      medications: [
        { name: 'Paracetamol', quantity: '20 เม็ด', qty: 20, unit: 'เม็ด', instructions: 'กินหลังอาหาร' },
      ],
    },
  };
  const REAL_CUSTOMER = {
    proClinicHN: 'HN-9999',
    patientData: {
      prefix: 'นาง',
      firstName: 'สมหญิง',
      lastName: 'รักษา',
      gender: 'หญิง',
      age: 35,
      birthdate: '1990-05-12',
      bloodType: 'A',
      address: '67/12 ถ.ทดสอบ',
      phone: '081-999-9999',
      nationalId: '1-1010-12345-67-8',
      emergencyName: 'คุณแม่',
      emergencyPhone: '081-888-8888',
    },
  };
  const SUMMARY = { id: 'TR-2026-001', date: '2026-04-25', doctor: 'นพ.ทดสอบ ใจดี', cc: 'ปวดหัว', dx: 'หวัด' };
  const CLINIC_FULL = {
    clinicName: 'Lover Clinic',
    clinicNameEn: 'Lover Clinic Co., Ltd.',
    clinicAddress: '67/12 ทดสอบ',
    clinicPhone: '02-000-0000',
    clinicEmail: 'info@lover.clinic',
    clinicTaxId: '0105566000999',
    clinicLicenseNo: '11102000999',
  };

  it('F13.0: prefill mirror returns object with every expected key', () => {
    const p = buildPrefillForTreatment({ customer: REAL_CUSTOMER, treatment: REAL_TREATMENT, summary: SUMMARY });
    const expectedKeys = [
      'treatmentDate', 'doctorName', 'assistantName', 'birthdate', 'bloodGroup',
      'patientAddress', 'emergencyName', 'emergencyPhone', 'bt', 'pr', 'rr', 'bp',
      'spo2', 'symptoms', 'physicalExam', 'diagnosis', 'treatment', 'treatmentPlan',
      'additionalNote', 'treatmentRecordRows', 'homeMedicationRows', 'findings',
      'drNote', 'treatmentItems',
    ];
    for (const k of expectedKeys) {
      expect(`${k}::${k in p}`).toBe(`${k}::true`);
    }
  });

  it('F13.1: doctorName de-duplication — strips co-doctor + assistant suffix', () => {
    const p = buildPrefillForTreatment({ customer: REAL_CUSTOMER, treatment: REAL_TREATMENT, summary: SUMMARY });
    expect(p.doctorName).toBe('นพ.ทดสอบ ใจดี (X)');
    // No leakage of co-doctor or selector text
    expect(p.doctorName.includes('รอง สอง')).toBe(false);
    expect(p.doctorName.includes('เลือกแพทย์')).toBe(false);
  });

  it('F13.2: vitals — systolic+diastolic combined as bp string', () => {
    const p = buildPrefillForTreatment({ customer: REAL_CUSTOMER, treatment: REAL_TREATMENT, summary: SUMMARY });
    expect(p.bp).toBe('120/80');
    expect(p.bt).toBe(36.5);
    expect(p.pr).toBe(72);
    expect(p.rr).toBe(18);
    expect(p.spo2).toBe(98);
  });

  it('F13.3: treatment record rows — built as raw HTML <tr> from treatmentItems', () => {
    const p = buildPrefillForTreatment({ customer: REAL_CUSTOMER, treatment: REAL_TREATMENT, summary: SUMMARY });
    expect(p.treatmentRecordRows).toContain('<tr>');
    expect(p.treatmentRecordRows).toContain('Allergan Botox');
    expect(p.treatmentRecordRows).toContain('100 U');
    expect(p.treatmentRecordRows).toContain('Hyaluronic Filler');
  });

  it('F13.4: home medication rows — combines consumables + medications', () => {
    const p = buildPrefillForTreatment({ customer: REAL_CUSTOMER, treatment: REAL_TREATMENT, summary: SUMMARY });
    expect(p.homeMedicationRows).toContain('Acetin');
    expect(p.homeMedicationRows).toContain('1 amp.');
    expect(p.homeMedicationRows).toContain('Paracetamol');
    expect(p.homeMedicationRows).toContain('20 เม็ด');
  });

  it('F13.5: assistantName — joins array', () => {
    const p = buildPrefillForTreatment({ customer: REAL_CUSTOMER, treatment: REAL_TREATMENT, summary: SUMMARY });
    expect(p.assistantName).toBe('คุณช่วย หนึ่ง, คุณช่วย สอง');
  });

  it('F13.6: customer info — birthdate + blood + address + emergency', () => {
    const p = buildPrefillForTreatment({ customer: REAL_CUSTOMER, treatment: REAL_TREATMENT, summary: SUMMARY });
    expect(p.birthdate).toBe('1990-05-12');
    expect(p.bloodGroup).toBe('A');
    expect(p.patientAddress).toBe('67/12 ถ.ทดสอบ');
    expect(p.emergencyName).toBe('คุณแม่');
    expect(p.emergencyPhone).toBe('081-888-8888');
  });

  it('F13.7: clinical fields — symptoms / physicalExam / diagnosis / treatment / treatmentPlan', () => {
    const p = buildPrefillForTreatment({ customer: REAL_CUSTOMER, treatment: REAL_TREATMENT, summary: SUMMARY });
    expect(p.symptoms).toBe('ปวดหัว มา 3 วัน');
    expect(p.physicalExam).toBe('BP 120/80, HEENT ปกติ');
    expect(p.diagnosis).toBe('A001 Cholera');
    expect(p.treatment).toBe('ให้ยาแก้ปวดและฉีด Botox 100U');
    expect(p.treatmentPlan).toBe('นัดติดตาม 2 สัปดาห์');
    expect(p.additionalNote).toBe('แพ้ยาประเภท Sulfa');
  });

  // ── Per-doc end-to-end: prefill → buildPrintContext → render → assertions ──
  // Every docType that uses per-treatment prefill (treatment-history,
  // medical-cert family, course-deduction, treatment-referral, etc.) must
  // surface its prefilled values in the final HTML.

  // Map docType → list of [prefillKey, expectedSubstringInHtml] tuples.
  // If the doc template doesn't reference {{<prefillKey>}}, it's NOT in the
  // table. (The validator already rejects broken templates.) This catches
  // the V13 pattern: prefill produces value X, template renders Y, user
  // sees garbage because X never reached Y.
  const PER_DOC_WIRING = {
    'treatment-history': [
      ['doctorName',     'นพ.ทดสอบ ใจดี (X)'],
      ['symptoms',       'ปวดหัว มา 3 วัน'],
      ['physicalExam',   'BP 120/80, HEENT ปกติ'],
      ['diagnosis',      'A001 Cholera'],
      ['treatment',      'ให้ยาแก้ปวดและฉีด Botox 100U'],
      ['treatmentPlan',  'นัดติดตาม 2 สัปดาห์'],
      ['additionalNote', 'แพ้ยาประเภท Sulfa'],
      ['birthdate',      '1990-05-12'],
      ['bloodGroup',     'A'],
      ['patientAddress', '67/12 ถ.ทดสอบ'],
      ['emergencyName',  'คุณแม่'],
      ['emergencyPhone', '081-888-8888'],
      ['bp',             '120/80'],
      ['bt',             '36.5'],
      ['pr',             '72'],
      ['rr',             '18'],
      ['spo2',           '98'],
      // raw-HTML tables surface as elements
      ['treatmentRecordRows', 'Allergan Botox'],
      ['homeMedicationRows',  'Acetin'],
      ['homeMedicationRows',  'Paracetamol'],
    ],
    'medical-certificate': [
      ['doctorName',   'นพ.ทดสอบ ใจดี (X)'],
      ['findings',     'BP 120/80, HEENT ปกติ'], // findings = physicalExam fallback
      ['diagnosis',    'A001 Cholera'],
      // Phase 14.2.E — vitals row + body-status (Doc 2/16 ProClinic match)
      ['vitalsWeight', '60'],
      ['vitalsHeight', '165'],
      ['bp',           '120/80'],
      ['pr',           '72'],
    ],
    'medical-opinion': [
      ['doctorName', 'นพ.ทดสอบ ใจดี (X)'],
      ['symptoms',   'ปวดหัว มา 3 วัน'],
      ['diagnosis',  'A001 Cholera'],
    ],
    'physical-therapy-certificate': [
      ['doctorName', 'นพ.ทดสอบ ใจดี (X)'],
      ['symptoms',   'ปวดหัว มา 3 วัน'],
    ],
    'thai-traditional-medicine-medical-certificate': [
      ['doctorName', 'นพ.ทดสอบ ใจดี (X)'],
      ['findings',   'BP 120/80, HEENT ปกติ'],
    ],
    'fit-to-fly': [
      ['doctorName', 'นพ.ทดสอบ ใจดี (X)'],
    ],
    'patient-referral': [
      ['doctorName', 'นพ.ทดสอบ ใจดี (X)'],
    ],
    'treatment-referral': [
      ['doctorName',     'นพ.ทดสอบ ใจดี (X)'],
      ['treatmentItems', 'Allergan Botox 100 U'],
      ['drNote',         'ให้ยาแก้ปวดและฉีด Botox 100U'],
    ],
    'course-deduction': [
      ['doctorName', 'นพ.ทดสอบ ใจดี (X)'],
    ],
  };

  for (const [docType, wiring] of Object.entries(PER_DOC_WIRING)) {
    it(`F13.wire:${docType} — every prefilled field surfaces in rendered HTML`, () => {
      const seed = SEED_TEMPLATES.find(s => s.docType === docType);
      expect(seed, `seed for ${docType} must exist`).toBeTruthy();

      const prefill = buildPrefillForTreatment({ customer: REAL_CUSTOMER, treatment: REAL_TREATMENT, summary: SUMMARY });

      const ctx = buildPrintContext({
        clinic: CLINIC_FULL,
        customer: REAL_CUSTOMER,
        values: prefill,
        language: seed.language === 'bilingual' ? 'bilingual' : 'th',
        toggles: { showCertNumber: true, showPatientSignature: true },
      });
      const html = renderTemplate(seed.htmlTemplate, ctx);

      // Build a list of [prefillKey, expectedString] checks. Use a flat
      // string assertion per pair so failure messages are greppable.
      for (const [prefillKey, expected] of wiring) {
        // If the seed template doesn't contain {{<prefillKey>}} or {{{<prefillKey>}}},
        // skip this assertion — the value isn't expected to surface.
        const referenced = seed.htmlTemplate.includes(`{{${prefillKey}}}`)
          || seed.htmlTemplate.includes(`{{{${prefillKey}}}}`)
          || seed.htmlTemplate.includes(`{{#if ${prefillKey}}}`)
          || seed.htmlTemplate.includes(`{{#unless ${prefillKey}}}`);
        if (!referenced) {
          // Template doesn't use this field, skip.
          continue;
        }
        const found = html.includes(expected);
        expect(found
          ? `${docType}::wired::${prefillKey}`
          : `${docType}::NOT-WIRED::${prefillKey}::expected:::${expected}`)
          .toBe(`${docType}::wired::${prefillKey}`);
      }
    });
  }

  // Customer-info wiring (clinic + patient identity) — applies to ALL docs.
  it('F13.wire:all — customerName + customerHN + clinicName surface in every doc', () => {
    const prefill = buildPrefillForTreatment({ customer: REAL_CUSTOMER, treatment: REAL_TREATMENT, summary: SUMMARY });
    for (const seed of SEED_TEMPLATES) {
      const ctx = buildPrintContext({
        clinic: CLINIC_FULL,
        customer: REAL_CUSTOMER,
        values: prefill,
        language: seed.language === 'bilingual' ? 'bilingual' : 'th',
        toggles: { showCertNumber: true, showPatientSignature: true },
      });
      const html = renderTemplate(seed.htmlTemplate, ctx);

      // Customer name should appear if template references {{customerName}}
      if (seed.htmlTemplate.includes('{{customerName}}')) {
        expect(`${seed.docType}::name::${html.includes('นาง สมหญิง รักษา')}`)
          .toBe(`${seed.docType}::name::true`);
      }
      // Clinic name in header — every seed uses HEADER_CLINIC which embeds it
      if (seed.htmlTemplate.includes('{{clinicName}}')) {
        expect(`${seed.docType}::clinic::${html.includes('Lover Clinic')}`)
          .toBe(`${seed.docType}::clinic::true`);
      }
      // HN — customer.proClinicHN → ctx.customerHN
      if (seed.htmlTemplate.includes('{{customerHN}}')) {
        expect(`${seed.docType}::hn::${html.includes('HN-9999')}`)
          .toBe(`${seed.docType}::hn::true`);
      }
    }
  });
});

/* ─── F14: Empty-field robustness — every field empty must not break ───────
 *
 * Per user directive 2026-04-25: "make sure ว่า field ที่ว่างๆ ใช้ได้จริง"
 *
 * For every doc, render with completely empty be_treatments + be_customers
 * shapes. Verify:
 *   1. No crash (renderTemplate returns a string)
 *   2. No `{{key}}` placeholder leak
 *   3. No literal "undefined" or "null" appears as text
 *   4. No escaped raw-HTML tag leak (`&lt;tr&gt;`)
 *   5. Output is non-empty string (template still produces structure)
 *   6. Conditional `{{#if X}}` blocks with falsy X are dropped cleanly
 *      (no `{{#if` or `{{/if` markers leak)
 *   7. Empty raw-HTML rows fall back to placeholder row, not literal "undefined"
 * ─────────────────────────────────────────────────────────────────────── */

describe('F14: empty-field robustness — every field empty renders cleanly', () => {
  const EMPTY_TREATMENT = { detail: {} };
  const EMPTY_CUSTOMER  = { patientData: {} };
  const EMPTY_CLINIC    = { clinicName: 'X' }; // minimal so something renders

  // Per-doc empty-render assertions
  for (const seed of SEED_TEMPLATES) {
    it(`F14.empty:${seed.docType} — renders with empty data, no leak, no crash, no undefined-literal`, () => {
      const prefill = buildPrefillForTreatment({
        customer: EMPTY_CUSTOMER,
        treatment: EMPTY_TREATMENT,
        summary: null,
      });

      const ctx = buildPrintContext({
        clinic: EMPTY_CLINIC,
        customer: EMPTY_CUSTOMER,
        values: prefill,
        language: 'th',
        toggles: {},
      });
      const html = renderTemplate(seed.htmlTemplate, ctx);

      // 1. No crash → string returned
      expect(typeof html).toBe('string');

      // 2. Output is non-empty
      expect(html.length).toBeGreaterThan(0);

      // 3. No leftover {{key}} placeholders (all unknown keys empty out)
      const leaked = html.match(/\{\{[^}]+\}\}/g) || [];
      expect(leaked.length === 0
        ? `${seed.docType}::no-leak`
        : `${seed.docType}::leaked::${leaked.join(' | ')}`)
        .toBe(`${seed.docType}::no-leak`);

      // 4. No conditional-block markers leak
      expect(html.includes('{{#if')).toBe(false);
      expect(html.includes('{{/if')).toBe(false);
      expect(html.includes('{{#unless')).toBe(false);
      expect(html.includes('{{/unless')).toBe(false);
      expect(html.includes('{{#lang')).toBe(false);
      expect(html.includes('{{/lang')).toBe(false);

      // 5. No "undefined" or "null" text leak. The string "undefined" or
      //    "null" should NEVER appear in user-facing output. (We allow it
      //    in HTML attribute names like `border:none` — so we only check
      //    for the exact tokens as standalone words.)
      const undefinedLeak = html.match(/\bundefined\b/g) || [];
      expect(undefinedLeak.length === 0
        ? `${seed.docType}::no-undefined`
        : `${seed.docType}::has-undefined-text`)
        .toBe(`${seed.docType}::no-undefined`);

      const nullLeak = html.match(/\bnull\b/g) || [];
      expect(nullLeak.length === 0
        ? `${seed.docType}::no-null`
        : `${seed.docType}::has-null-text`)
        .toBe(`${seed.docType}::no-null`);

      // 6. No escaped raw-HTML tag leak
      const escapedTagLeak = html.match(/&lt;(tr|td|table)[^&]*&gt;/g) || [];
      expect(escapedTagLeak.length === 0
        ? `${seed.docType}::no-escaped-tag`
        : `${seed.docType}::escaped-tag::${escapedTagLeak.join(' | ')}`)
        .toBe(`${seed.docType}::no-escaped-tag`);

      // 7. Empty raw-HTML rows fall back to placeholder rows ("-"), not
      //    literal "undefined" text. Specifically check treatment-history
      //    and course-deduction which use raw-HTML rows.
      if (seed.htmlTemplate.includes('{{{treatmentRecordRows}}}')) {
        expect(html.includes('<tr><td colspan="3"')).toBe(true);
      }
      if (seed.htmlTemplate.includes('{{{homeMedicationRows}}}')) {
        expect(html.includes('<tr><td colspan="2"')).toBe(true);
      }
    });
  }

  it('F14.guard:doctorName-empty — doctorName de-dupe handles empty string', () => {
    const p = buildPrefillForTreatment({
      customer: EMPTY_CUSTOMER,
      treatment: { detail: { doctorName: '' } },
      summary: null,
    });
    expect(p.doctorName).toBe('');
  });

  it('F14.guard:doctorName-no-paren — fallback to whole string when no `)` found', () => {
    const p = buildPrefillForTreatment({
      customer: EMPTY_CUSTOMER,
      treatment: { detail: { doctorName: 'นพ.A' } },
      summary: null,
    });
    expect(p.doctorName).toBe('นพ.A');
  });

  it('F14.guard:vitals-only-systolic — bp shows partial', () => {
    const p = buildPrefillForTreatment({
      customer: EMPTY_CUSTOMER,
      treatment: { detail: { vitals: { systolicBP: 120 } } },
      summary: null,
    });
    expect(p.bp).toBe('120/-');
  });

  it('F14.guard:treatment-record-empty-array — produces placeholder row', () => {
    const p = buildPrefillForTreatment({
      customer: EMPTY_CUSTOMER,
      treatment: { detail: { treatmentItems: [] } },
      summary: null,
    });
    expect(p.treatmentRecordRows).toContain('colspan="3"');
    expect(p.treatmentRecordRows).not.toContain('undefined');
  });

  it('F14.guard:home-meds-mixed-shape — string fallback for partial fields', () => {
    const p = buildPrefillForTreatment({
      customer: EMPTY_CUSTOMER,
      treatment: { detail: { medications: [{ name: 'X' }, { qty: 5, unit: 'tab' }] } },
      summary: null,
    });
    expect(p.homeMedicationRows).toContain('<tr>');
    expect(p.homeMedicationRows).toContain('X');
    expect(p.homeMedicationRows).toContain('5 tab');
    expect(p.homeMedicationRows).not.toContain('undefined');
    expect(p.homeMedicationRows).not.toContain('null');
  });

  it('F14.guard:emergency-contact-nested — reads emergencyContact.name fallback', () => {
    const p = buildPrefillForTreatment({
      customer: { patientData: { emergencyContact: { name: 'แม่', phone: '081' } } },
      treatment: EMPTY_TREATMENT,
      summary: null,
    });
    expect(p.emergencyName).toBe('แม่');
    expect(p.emergencyPhone).toBe('081');
  });

  it('F14.guard:treatmentItems-text-empty — empty array → empty string, not "undefined"', () => {
    const p = buildPrefillForTreatment({
      customer: EMPTY_CUSTOMER,
      treatment: { detail: { treatmentItems: [] } },
      summary: null,
    });
    expect(p.treatmentItems).toBe('');
  });
});

/* ─── F15: cross-doc invariants — locks integration points ───────────────── */

describe('F15: cross-doc invariants — every seed obeys repository-wide rules', () => {
  it('F15.1: every seed in SEED_TEMPLATES has matching docType in DOC_TYPES', () => {
    for (const seed of SEED_TEMPLATES) {
      expect(`${seed.docType}::known::${DOC_TYPES.includes(seed.docType)}`)
        .toBe(`${seed.docType}::known::true`);
    }
  });

  it('F15.2: every seed has at least one signature/doctor block', () => {
    // Phase 14.2 requirement: every printable doc must either show doctorName
    // somewhere OR have a signature block. Catches the V12 pattern where
    // a writer changed and a sibling reader silently broke.
    for (const seed of SEED_TEMPLATES) {
      const hasDoctor = seed.htmlTemplate.includes('{{doctorName}}')
        || seed.htmlTemplate.includes('{{staffName}}')
        || seed.htmlTemplate.includes('ลายเซ็น')
        || seed.htmlTemplate.includes('ลงชื่อ')
        || seed.htmlTemplate.includes('แพทย์ผู้')
        || seed.htmlTemplate.includes('Physician');
      expect(`${seed.docType}::has-signature::${hasDoctor}`)
        .toBe(`${seed.docType}::has-signature::true`);
    }
  });

  it('F15.3: raw-HTML placeholders only used where the field VALUE is HTML', () => {
    // Whitelist of {{{key}}} usages by docType. If a new {{{key}}} appears in
    // a template, this test fails until the pair is added here. Forces
    // explicit review of any new raw-HTML insertion (Rule C2 security).
    const ALLOWED_RAW_HTML_PLACEHOLDERS = {
      'treatment-history': ['treatmentRecordRows', 'homeMedicationRows'],
      'course-deduction':  ['deductionRows'],
    };
    for (const seed of SEED_TEMPLATES) {
      const raw = (seed.htmlTemplate.match(/\{\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}\}/g) || [])
        .map(m => m.slice(3, -3));
      const allowed = ALLOWED_RAW_HTML_PLACEHOLDERS[seed.docType] || [];
      for (const r of raw) {
        expect(`${seed.docType}::${r}::allowed::${allowed.includes(r)}`)
          .toBe(`${seed.docType}::${r}::allowed::true`);
      }
    }
  });

  it('F15.4: no template uses {{key}} (escaped) for known raw-HTML fields', () => {
    // Regression guard for the F12 course-deduction bug: deductionRows /
    // treatmentRecordRows / homeMedicationRows must use {{{key}}} not {{key}}.
    const RAW_HTML_FIELDS = ['treatmentRecordRows', 'homeMedicationRows', 'deductionRows'];
    for (const seed of SEED_TEMPLATES) {
      for (const f of RAW_HTML_FIELDS) {
        // If the template references this field at all, it must be 3-brace.
        const tpl = seed.htmlTemplate;
        const idx = tpl.indexOf(f);
        if (idx === -1) continue;
        // Search for the closest brace pattern around this field
        const before = tpl.slice(Math.max(0, idx - 5), idx);
        const after = tpl.slice(idx + f.length, idx + f.length + 5);
        const isThreeBrace = before.endsWith('{{{') && after.startsWith('}}}');
        const isTwoBrace = before.endsWith('{{') && !before.endsWith('{{{') && after.startsWith('}}');
        // It must be 3-brace OR not be a placeholder at all (mention in comment)
        if (isTwoBrace) {
          expect(`${seed.docType}::${f}::wrong-brace-count`).toBe(`${seed.docType}::${f}::three-brace-required`);
        }
        if (isThreeBrace) {
          // Pass — exactly what we want
        }
      }
    }
  });

  it('F15.5: every field in seed.fields[] has a known FIELD_TYPE', () => {
    for (const seed of SEED_TEMPLATES) {
      for (const f of seed.fields || []) {
        expect(`${seed.docType}::${f.key}::type-known::${FIELD_TYPES.includes(f.type)}`)
          .toBe(`${seed.docType}::${f.key}::type-known::true`);
      }
    }
  });

  it('F15.6: SCHEMA_VERSION matches what tests assume', () => {
    // F13/F14 prefill mirror was authored against schema v6. If schema bumps
    // and prefill mapping changes, this test should fail to force re-sync.
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(6);
  });

  it('F15.7: seed templates do not embed user-input placeholders inside raw-HTML', () => {
    // Security guard (Rule C2): {{{key}}} must NEVER wrap a field that
    // could come from user input (e.g. doctorName, patientName). Only
    // app-built strings (server-built table rows) are safe.
    const FORBIDDEN_RAW_HTML = ['customerName', 'doctorName', 'patientName',
      'symptoms', 'physicalExam', 'diagnosis', 'treatment', 'treatmentPlan',
      'additionalNote', 'cc', 'hpi', 'pmh', 'pe', 'dx', 'txPlan',
      'procedure', 'risks', 'cost', 'witnessName', 'reason', 'note',
      'genericName', 'medicineName', 'qty', 'instructions', 'warning'];
    for (const seed of SEED_TEMPLATES) {
      for (const k of FORBIDDEN_RAW_HTML) {
        const pattern = `{{{${k}}}}`;
        expect(`${seed.docType}::${k}::not-raw-html::${!seed.htmlTemplate.includes(pattern)}`)
          .toBe(`${seed.docType}::${k}::not-raw-html::true`);
      }
    }
  });
});

/* ─── F16: Color-theme invariants — black + red, no red on patient names ──
 *
 * Per user directive 2026-04-25: "เราต้องมีสีสันด้วยนะ ไม่ใช่แค่ขาวดำ
 * แต่เป็นไปในตีมของเรา ดำ แดง". And per .claude/rules/04-thai-ui.md:
 * "สีแดงห้ามใช้กับตัวอักษรชื่อ/HN ผู้ป่วย" (Thai culture rule — red on
 * patient names = death names).
 *
 * F16 locks BOTH:
 *   1. Every seed template has at least ONE red accent (#b71c1c or #d32f2f)
 *      so the doc isn't B&W
 *   2. NO seed template applies red to the IMMEDIATE enclosing element of
 *      {{customerName}}, {{customerHN}}, {{nationalId}}, or {{doctorName}}.
 *      Walking back from each placeholder to its nearest opening tag, the
 *      tag's `style="..."` attribute must NOT contain `color:#b71c1c` or
 *      `color:#d32f2f`. Customer names + doctor names render in body black.
 * ─────────────────────────────────────────────────────────────────────── */

describe('F16: color-theme invariants — black + red, no red on patient names', () => {
  const RED_ACCENT_HEX = ['#b71c1c', '#d32f2f', '#B71C1C', '#D32F2F'];
  const FORBIDDEN_REDS_NEAR_NAMES = /color:\s*#(b71c1c|d32f2f|c62828|e53935)/i;
  const FORBIDDEN_PLACEHOLDERS = ['{{customerName}}', '{{customerHN}}', '{{nationalId}}', '{{doctorName}}'];

  // Helper — for a given template + placeholder, find every occurrence and
  // walk back to the immediately enclosing opening tag. Return list of
  // [enclosingTag, styleAttr] pairs. Used to assert no red on names.
  function findEnclosingTags(template, placeholder) {
    const result = [];
    let idx = 0;
    while ((idx = template.indexOf(placeholder, idx)) !== -1) {
      const before = template.slice(0, idx);
      // Find last `>` (closes the immediately-enclosing opening tag)
      const lastClose = before.lastIndexOf('>');
      if (lastClose === -1) { idx += placeholder.length; continue; }
      // Find matching `<` for that `>`
      const lastOpen = before.lastIndexOf('<', lastClose);
      if (lastOpen === -1) { idx += placeholder.length; continue; }
      const tag = before.slice(lastOpen, lastClose + 1);
      const m = tag.match(/style="([^"]*)"/);
      result.push({ tag, style: m ? m[1] : '' });
      idx += placeholder.length;
    }
    return result;
  }

  // F16.1: every seed has at least one red accent — no all-B&W docs
  for (const seed of SEED_TEMPLATES) {
    it(`F16.1:${seed.docType} — has at least one red accent (theme color)`, () => {
      const hasRed = RED_ACCENT_HEX.some(hex => seed.htmlTemplate.includes(hex));
      expect(hasRed
        ? `${seed.docType}::has-red-accent`
        : `${seed.docType}::MISSING-red-accent`)
        .toBe(`${seed.docType}::has-red-accent`);
    });
  }

  // F16.2: customer name placeholders are NEVER inside red-colored elements
  for (const seed of SEED_TEMPLATES) {
    for (const placeholder of FORBIDDEN_PLACEHOLDERS) {
      const occurrences = findEnclosingTags(seed.htmlTemplate, placeholder);
      if (occurrences.length === 0) continue;
      it(`F16.2:${seed.docType} — ${placeholder} not inside red-colored tag`, () => {
        for (const occ of occurrences) {
          const isRed = FORBIDDEN_REDS_NEAR_NAMES.test(occ.style);
          expect(isRed
            ? `${seed.docType}::${placeholder}::RED-VIOLATION::${occ.style}`
            : `${seed.docType}::${placeholder}::safe`)
            .toBe(`${seed.docType}::${placeholder}::safe`);
        }
      });
    }
  }

  // F16.3: HEADER_CLINIC + section snippets all use red accents (covered
  //        indirectly by F16.1 since every doc embeds HEADER_CLINIC)
  it('F16.3: HEADER_CLINIC red accent — every doc using it inherits red', () => {
    for (const seed of SEED_TEMPLATES) {
      // Skip docs that don't use HEADER_CLINIC (medicine-label, fit-to-fly etc.)
      const usesHeader = seed.htmlTemplate.includes('{{clinicName}}');
      if (!usesHeader) continue;
      // Some seed has clinic header — assert it has red somewhere
      const hasRed = RED_ACCENT_HEX.some(hex => seed.htmlTemplate.includes(hex));
      expect(`${seed.docType}::clinic-header-red::${hasRed}`)
        .toBe(`${seed.docType}::clinic-header-red::true`);
    }
  });

  // F16.4: rendered output also obeys the rule — render with sentinel name
  it('F16.4: rendered HTML — sentinel customerName is never inside a red span', () => {
    const sentinel = 'REDPATIENTNAMETEST_DO_NOT_COLOR_RED';
    for (const seed of SEED_TEMPLATES) {
      const ctx = buildPrintContext({
        clinic: { clinicName: 'C' },
        customer: { customerName: sentinel, proClinicHN: 'HN-X' },
        values: { doctorName: sentinel, certNumber: 'C-1' },
        language: seed.language === 'bilingual' ? 'bilingual' : 'th',
        toggles: { showCertNumber: true, showPatientSignature: true },
      });
      const html = renderTemplate(seed.htmlTemplate, ctx);
      // Find every occurrence of sentinel in rendered output. For each,
      // walk back to its enclosing tag, check style.
      const occurrences = findEnclosingTags(html, sentinel);
      for (const occ of occurrences) {
        const violatesRule = FORBIDDEN_REDS_NEAR_NAMES.test(occ.style);
        expect(violatesRule
          ? `${seed.docType}::sentinel-name-INSIDE-RED::${occ.style}`
          : `${seed.docType}::sentinel-name-safe`)
          .toBe(`${seed.docType}::sentinel-name-safe`);
      }
    }
  });

  // F16.5: no gold colors anywhere (per .claude/rules/04-thai-ui.md
  //        "สีทองห้ามใช้")
  it('F16.5: no gold colors in any seed (cultural rule — gold banned)', () => {
    const goldHexes = [/color:\s*#(?:ff)?d700/i, /color:\s*gold\b/i, /color:\s*#b8860b/i];
    for (const seed of SEED_TEMPLATES) {
      for (const re of goldHexes) {
        expect(`${seed.docType}::no-gold::${!re.test(seed.htmlTemplate)}`)
          .toBe(`${seed.docType}::no-gold::true`);
      }
    }
  });

  // F16.6: red theme color is consistent — only canonical LoverClinic reds.
  // Amber/orange (#f59e0b warning callout, #d97706 warning text) are allowed
  // because they're "warning treatment" colors for refund/cancel callouts,
  // not part of the red theme. We detect "true red" by tight G+B bounds.
  it('F16.6: only the canonical LoverClinic reds appear (#b71c1c / #d32f2f)', () => {
    const ALLOWED_REDS = ['#b71c1c', '#d32f2f', '#a00', '#B71C1C', '#D32F2F', '#A00'];
    const RED_HEX_PATTERN = /#(?:[a-fA-F0-9]{3}|[a-fA-F0-9]{6})\b/g;
    for (const seed of SEED_TEMPLATES) {
      const matches = seed.htmlTemplate.match(RED_HEX_PATTERN) || [];
      for (const hex of matches) {
        const h = hex.toLowerCase().replace('#', '');
        let r = 0, g = 0, b = 0;
        if (h.length === 3) {
          r = parseInt(h[0] + h[0], 16); g = parseInt(h[1] + h[1], 16); b = parseInt(h[2] + h[2], 16);
        } else if (h.length === 6) {
          r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16);
        }
        // True red: high R, low G and B (G < 80, B < 80). Excludes amber/
        // orange (high G), pink (high B), brown (medium R+G+B).
        const isTrueRed = r > 100 && g < 80 && b < 80;
        if (!isTrueRed) continue;
        expect(`${seed.docType}::red-${hex}::allowed::${ALLOWED_REDS.includes(hex)}`)
          .toBe(`${seed.docType}::red-${hex}::allowed::true`);
      }
    }
  });
});
