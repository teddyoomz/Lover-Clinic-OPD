// V70 (2026-05-15) — User-reported LINE reminder visual fixes.
//
// Bug 1: variables in templateDayBefore + templateDayOf body text must be
//   bold ({{customerName}}, {{date}}, {{time}}, {{branchName}}, {{doctorName}},
//   {{treatments}}). Pre-V70: body text used a flat `{type:'text', text:bodyText}`
//   flex node with no inline formatting — even though the detail rows below
//   already rendered values in bold. The disparity was visually jarring.
//
// Bug 2: header rendered "🏥 LoverClinic" (no space) when no clinicName was
//   passed. Canonical default (`src/constants.js DEFAULT_CLINIC_SETTINGS`) is
//   "Lover Clinic" with a space. V21-class drift in 3 fallback sites:
//     - src/lib/lineReminderTemplate.js:45
//     - src/components/backend/QuotationPrintView.jsx:117
//     - src/components/backend/SalePrintView.jsx:204
//   All 3 fixed in V70 per Rule P cross-file class-of-bug expansion.
//
// Verification approach (Rule Q L2): build the real flex JSON via the real
// `buildReminderFlex` exporter and assert structure. LINE app rendering
// cannot be Playwright'd (renders on user phone via LINE Messaging API); L2
// real-builder JSON assertion is the highest verification level practical.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  buildReminderFlex,
  resolveTokens,
  renderTemplateAsSpans,
} from '../src/lib/lineReminderTemplate.js';

const ROOT = process.cwd();
const read = (p) => readFileSync(path.join(ROOT, p), 'utf-8');

const baseInput = {
  cust: { fullName: 'นาย โอ๊ค' },
  appt: { id: 'BA-V70', date: '2026-05-16', startTime: '14:30' },
  branch: { name: 'นครราชสีมา', branchId: 'BR-V70' },
  doctor: { name: 'นพ. ทดสอบ' },
  treatments: [{ name: 'ฉีดผิว' }],
  branchSettings: {},
};

describe('V70 — Body variables bolded + header "Lover Clinic" spaced', () => {
  describe('B1 renderTemplateAsSpans helper', () => {
    it('B1.1 splits template into alternating static/var spans', () => {
      const out = renderTemplateAsSpans('Hi {{customerName}}, see you {{time}}', {
        customerName: 'แพรพร',
        time: '14:30',
      });
      expect(out).toEqual([
        { type: 'span', text: 'Hi ' },
        { type: 'span', text: 'แพรพร', weight: 'bold' },
        { type: 'span', text: ', see you ' },
        { type: 'span', text: '14:30', weight: 'bold' },
      ]);
    });

    it('B1.2 variable spans carry weight:bold; static spans do NOT', () => {
      const out = renderTemplateAsSpans('A {{x}} B', { x: 'Y' });
      const boldSpans = out.filter((s) => s.weight === 'bold');
      const plainSpans = out.filter((s) => !s.weight);
      expect(boldSpans).toHaveLength(1);
      expect(boldSpans[0].text).toBe('Y');
      expect(plainSpans.every((s) => !('weight' in s))).toBe(true);
    });

    it('B1.3 empty-resolved variable produces no span (LINE I4 mirror)', () => {
      const out = renderTemplateAsSpans('Hi {{missing}} done', {});
      // 'missing' → '' → skipped. Result: [{'Hi '}, {' done'}].
      expect(out).toHaveLength(2);
      expect(out[0].text).toBe('Hi ');
      expect(out[1].text).toBe(' done');
      expect(out.every((s) => !s.weight)).toBe(true);
    });

    it('B1.4 empty/null/undefined template returns empty array', () => {
      expect(renderTemplateAsSpans('', {})).toEqual([]);
      expect(renderTemplateAsSpans(null, {})).toEqual([]);
      expect(renderTemplateAsSpans(undefined, {})).toEqual([]);
    });

    it('B1.5 template with no placeholders returns single static span', () => {
      expect(renderTemplateAsSpans('plain text', {})).toEqual([
        { type: 'span', text: 'plain text' },
      ]);
    });

    it('B1.6 adversarial — numeric / null / Thai / consecutive / trailing placeholders', () => {
      // {{a}}=null→skip; {{b}}=0→bold '0'; {{c}}='ก'→bold; '-' static; {{d}}=undefined→skip.
      const out = renderTemplateAsSpans('{{a}}{{b}}{{c}}-{{d}}', {
        a: null,
        b: 0,
        c: 'ก',
        d: undefined,
      });
      expect(out).toEqual([
        { type: 'span', text: '0', weight: 'bold' },
        { type: 'span', text: 'ก', weight: 'bold' },
        { type: 'span', text: '-' },
      ]);
    });

    it('B1.7 placeholder at the very end produces no spurious trailing span', () => {
      const out = renderTemplateAsSpans('Hi {{name}}', { name: 'X' });
      expect(out).toEqual([
        { type: 'span', text: 'Hi ' },
        { type: 'span', text: 'X', weight: 'bold' },
      ]);
    });

    it('B1.8 placeholder at the very start produces no spurious leading span', () => {
      const out = renderTemplateAsSpans('{{name}} done', { name: 'X' });
      expect(out).toEqual([
        { type: 'span', text: 'X', weight: 'bold' },
        { type: 'span', text: ' done' },
      ]);
    });
  });

  describe('B2 buildReminderFlex body uses bold-span contents', () => {
    it('B2.1 body text node uses `contents:[span]` not `text:string`', () => {
      const flex = buildReminderFlex({
        ...baseInput,
        branchSettings: {
          templateDayBefore: 'สวัสดีคุณ {{customerName}} ค่ะ พรุ่งนี้ {{date}} เวลา {{time}}',
        },
        reminderType: 'dayBefore',
      });
      const body = flex.contents.body.contents;
      const textNode = body.find((n) => n.type === 'text' && Array.isArray(n.contents));
      expect(textNode).toBeDefined();
      expect(textNode.text).toBeUndefined(); // canonical: use contents only
      expect(textNode.contents.length).toBeGreaterThan(0);
      // Cosmetic props preserved at parent level.
      expect(textNode.wrap).toBe(true);
      expect(textNode.size).toBe('md');
    });

    it('B2.2 variable spans in body have weight:bold', () => {
      const flex = buildReminderFlex({
        ...baseInput,
        branchSettings: {
          templateDayBefore: 'สวัสดีคุณ {{customerName}} ค่ะ พรุ่งนี้ {{date}} เวลา {{time}}',
        },
        reminderType: 'dayBefore',
      });
      const textNode = flex.contents.body.contents.find(
        (n) => n.type === 'text' && Array.isArray(n.contents)
      );
      const boldSpans = textNode.contents.filter((s) => s.weight === 'bold');
      const boldTexts = boldSpans.map((s) => s.text);
      // customerName (post-V69 title-prefix strip): 'โอ๊ค' (was 'นาย โอ๊ค')
      // date: '16/05/2569' (BE format)
      // time: '14:30'
      expect(boldTexts).toContain('โอ๊ค');
      expect(boldTexts).toContain('16/05/2569');
      expect(boldTexts).toContain('14:30');
    });

    it('B2.3 templateDayOf also bolds variables (parity with templateDayBefore)', () => {
      const flex = buildReminderFlex({
        ...baseInput,
        branchSettings: {
          templateDayOf: 'วันนี้ {{customerName}} มีนัด {{time}} ที่ {{branchName}}',
        },
        reminderType: 'dayOf',
      });
      const textNode = flex.contents.body.contents.find(
        (n) => n.type === 'text' && Array.isArray(n.contents)
      );
      const boldSpans = textNode.contents.filter((s) => s.weight === 'bold');
      const boldTexts = boldSpans.map((s) => s.text);
      expect(boldTexts).toContain('โอ๊ค');
      expect(boldTexts).toContain('14:30');
      expect(boldTexts).toContain('นครราชสีมา');
    });

    it('B2.4 ALL 6 user-named variables bold when present in template', () => {
      // User spec: {{customerName}}, {{date}}, {{time}}, {{branchName}},
      // {{doctorName}}, {{treatments}} must all bold when used.
      const flex = buildReminderFlex({
        ...baseInput,
        branchSettings: {
          templateDayBefore:
            '{{customerName}}|{{date}}|{{time}}|{{branchName}}|{{doctorName}}|{{treatments}}',
        },
        reminderType: 'dayBefore',
      });
      const textNode = flex.contents.body.contents.find(
        (n) => n.type === 'text' && Array.isArray(n.contents)
      );
      const boldTexts = textNode.contents
        .filter((s) => s.weight === 'bold')
        .map((s) => s.text);
      expect(boldTexts).toEqual([
        'โอ๊ค', // customerName (post-V69 strip)
        '16/05/2569', // date BE
        '14:30', // time
        'นครราชสีมา', // branchName
        'นพ. ทดสอบ', // doctorName
        'ฉีดผิว', // treatments
      ]);
    });

    it('B2.5 empty templateDayBefore → NO body text node (preserve T2.14 I4 contract)', () => {
      const flex = buildReminderFlex({
        ...baseInput,
        branchSettings: { cancellationPolicyText: 'นโยบาย' },
        reminderType: 'dayBefore',
      });
      const bodyContents = flex.contents.body.contents;
      const bodyTextNode = bodyContents.find(
        (n) => n.type === 'text' && Array.isArray(n.contents)
      );
      expect(bodyTextNode).toBeUndefined();
      // No flat-text empty node either (pre-V70 shape).
      const emptyFlatText = bodyContents.filter(
        (n) => n && n.type === 'text' && n.text === ''
      );
      expect(emptyFlatText).toHaveLength(0);
    });

    it('B2.6 detail rows below body still bold (regression — value cells unchanged)', () => {
      const flex = buildReminderFlex({
        ...baseInput,
        branchSettings: { templateDayBefore: 'Hi' },
        reminderType: 'dayBefore',
      });
      const detailRows = flex.contents.body.contents.filter(
        (n) => n.type === 'box' && n.layout === 'baseline'
      );
      expect(detailRows).toHaveLength(5);
      detailRows.forEach((row) => {
        const valueCell = row.contents[1]; // [labelCell, valueCell]
        expect(valueCell.weight).toBe('bold');
      });
    });

    it('B2.7 no body span carries literal "undefined" or "null"', () => {
      // Adversarial: every variable missing → spans should skip them; no
      // literal 'undefined' / 'null' strings should leak.
      const flex = buildReminderFlex({
        ...baseInput,
        branchSettings: {
          templateDayBefore:
            '{{customerName}}|{{date}}|{{time}}|{{branchName}}|{{doctorName}}|{{treatments}}',
        },
        cust: {}, // no fullName / name / firstname
        appt: { id: 'BA-V70', date: '', startTime: '' },
        branch: {},
        doctor: null,
        treatments: [],
        reminderType: 'dayBefore',
      });
      const textNode = flex.contents.body.contents.find(
        (n) => n.type === 'text' && Array.isArray(n.contents)
      );
      // Body text node may be absent entirely if every variable resolved to
      // empty AND every static segment ('|') was preserved. We still check no
      // span contains 'undefined' / 'null' literal regardless.
      if (textNode) {
        const allSpanTexts = textNode.contents.map((s) => s.text);
        expect(allSpanTexts).not.toContain('undefined');
        expect(allSpanTexts).not.toContain('null');
      }
    });
  });

  describe('H1 Header "Lover Clinic" with space (canonical default)', () => {
    it('H1.1 resolveTokens default clinicName = "Lover Clinic" (with space)', () => {
      const tokens = resolveTokens({});
      expect(tokens.clinicName).toBe('Lover Clinic');
    });

    it('H1.2 buildReminderFlex header renders "🏥 Lover Clinic" when no clinicName passed', () => {
      const flex = buildReminderFlex({
        ...baseInput,
        clinicName: undefined,
        branchSettings: { templateDayBefore: 'Hi' },
        reminderType: 'dayBefore',
      });
      const headerTitle = flex.contents.header.contents[0].text;
      expect(headerTitle).toBe('🏥 Lover Clinic');
    });

    it('H1.3 explicit clinicName override is preserved verbatim', () => {
      const tokens = resolveTokens({ clinicName: 'CustomName' });
      expect(tokens.clinicName).toBe('CustomName');
    });

    it('H1.4 source-grep: lineReminderTemplate.js uses canonical "Lover Clinic" default', () => {
      const src = read('src/lib/lineReminderTemplate.js');
      expect(src).toMatch(/clinicName\s*\|\|\s*['"]Lover Clinic['"]/);
      // V21-class regression: NO un-spaced fallback remains
      expect(src).not.toMatch(/clinicName\s*\|\|\s*['"]LoverClinic['"]/);
    });

    it('H1.5 source-grep: QuotationPrintView.jsx uses canonical "Lover Clinic" default', () => {
      const src = read('src/components/backend/QuotationPrintView.jsx');
      expect(src).toMatch(/clinic\.clinicName\s*\|\|\s*['"]Lover Clinic['"]/);
      expect(src).not.toMatch(/clinic\.clinicName\s*\|\|\s*['"]LoverClinic['"]/);
    });

    it('H1.6 source-grep: SalePrintView.jsx uses canonical "Lover Clinic" default', () => {
      const src = read('src/components/backend/SalePrintView.jsx');
      expect(src).toMatch(/clinic\.clinicName\s*\|\|\s*['"]Lover Clinic['"]/);
      expect(src).not.toMatch(/clinic\.clinicName\s*\|\|\s*['"]LoverClinic['"]/);
    });
  });

  describe('M1 V70 marker comments + helper export', () => {
    it('M1.1 lineReminderTemplate.js carries V70 marker referencing the bold-span change', () => {
      const src = read('src/lib/lineReminderTemplate.js');
      expect(src).toMatch(/V70[^\n]*bold/i);
    });

    it('M1.2 renderTemplateAsSpans is exported (callable from outside the module)', () => {
      expect(typeof renderTemplateAsSpans).toBe('function');
    });

    it('M1.3 buildReminderFlex source uses renderTemplateAsSpans (not legacy bodyText flat text)', () => {
      const src = read('src/lib/lineReminderTemplate.js');
      // Locks the V70 helper call inside buildReminderFlex.
      expect(src).toMatch(/const\s+bodySpans\s*=\s*renderTemplateAsSpans/);
      // Body content uses spans, not text:bodyText.
      expect(src).toMatch(/contents:\s*bodySpans/);
      // V21-class regression: pre-V70 flat shape removed.
      expect(src).not.toMatch(/text:\s*bodyText\s*,\s*wrap/);
    });
  });
});
