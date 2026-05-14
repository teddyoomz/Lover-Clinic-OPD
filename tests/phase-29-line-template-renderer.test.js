// tests/phase-29-line-template-renderer.test.js
//
// Phase 29.1 (2026-05-14) — TDD test bank for lineTemplateRenderer.js
// L1 renderTemplate · L2 DEFAULT_RECALL_TEMPLATES shape · L3 getRecallTemplateVariables

import { describe, it, expect } from 'vitest';
import {
  renderTemplate,
  getRecallTemplateVariables,
  DEFAULT_RECALL_TEMPLATES,
} from '../src/lib/lineTemplateRenderer.js';

describe('Phase 29 · L1 renderTemplate', () => {
  it('L1.1 substitutes single variable', () => {
    expect(renderTemplate('สวัสดีคุณ {ชื่อ}', { 'ชื่อ': 'นาย Eee' })).toBe('สวัสดีคุณ นาย Eee');
  });
  it('L1.2 multi-variable', () => {
    expect(renderTemplate('คุณ {ชื่อ} ครบ {N เดือน}', { 'ชื่อ': 'X', 'N เดือน': '6' })).toBe('คุณ X ครบ 6');
  });
  it('L1.3 missing variable replaced with empty', () => {
    expect(renderTemplate('คุณ {ชื่อ}', {})).toBe('คุณ ');
  });
  it('L1.4 same key repeated', () => {
    expect(renderTemplate('{X} {X}', { X: 'Y' })).toBe('Y Y');
  });
  it('L1.5 no variable returns unchanged', () => {
    expect(renderTemplate('สวัสดีค่ะ', {})).toBe('สวัสดีค่ะ');
  });
  it('L1.6 null template returns empty', () => {
    expect(renderTemplate(null, {})).toBe('');
    expect(renderTemplate(undefined, {})).toBe('');
  });
  it('L1.7 numeric values coerced to string', () => {
    expect(renderTemplate('คุณ {N}', { N: 5 })).toBe('คุณ 5');
  });
  it('L1.8 null vars safe', () => {
    expect(renderTemplate('สวัสดี {X}', null)).toBe('สวัสดี ');
  });
});

describe('Phase 29 · L2 DEFAULT_RECALL_TEMPLATES', () => {
  it('L2.1 has 3 templates with expected ids', () => {
    expect(DEFAULT_RECALL_TEMPLATES).toHaveLength(3);
    expect(DEFAULT_RECALL_TEMPLATES.map(t => t.id)).toEqual(['recall-default', 'aftercare-followup', 'custom']);
  });
  it('L2.2 default template contains required variables', () => {
    const tpl = DEFAULT_RECALL_TEMPLATES[0];
    expect(tpl.text).toMatch(/\{ชื่อ\}/);
    expect(tpl.text).toMatch(/\{เรื่อง\}/);
  });
  it('L2.3 aftercare template contains required vars', () => {
    const tpl = DEFAULT_RECALL_TEMPLATES[1];
    expect(tpl.text).toMatch(/\{ชื่อ\}/);
    expect(tpl.text).toMatch(/\{เรื่อง\}/);
  });
  it('L2.4 custom template has empty text', () => {
    const tpl = DEFAULT_RECALL_TEMPLATES[2];
    expect(tpl.text).toBe('');
  });
  it('L2.5 every template has id + label + text fields', () => {
    for (const tpl of DEFAULT_RECALL_TEMPLATES) {
      expect(tpl).toHaveProperty('id');
      expect(tpl).toHaveProperty('label');
      expect(tpl).toHaveProperty('text');
    }
  });
  it('L2.6 array is frozen (immutable)', () => {
    expect(Object.isFrozen(DEFAULT_RECALL_TEMPLATES)).toBe(true);
  });
});

describe('Phase 29 · L3 getRecallTemplateVariables', () => {
  it('L3.1 extracts vars from recall + customer', () => {
    const recall = { reason: 'ฟิลเลอร์ครบ 6 เดือน', recallDate: '2026-11-14' };
    const customer = { displayName: 'นาย Eee', firstName: 'Eee' };
    const vars = getRecallTemplateVariables(recall, customer);
    expect(vars['ชื่อ']).toBe('นาย Eee');
    expect(vars['เรื่อง']).toBe('ฟิลเลอร์ครบ 6 เดือน');
    expect(vars['วันที่']).toBe('2026-11-14');
    expect(vars['คลินิก']).toBe('Lover Clinic');
  });
  it('L3.2 falls back to firstName when displayName missing', () => {
    const vars = getRecallTemplateVariables({ reason: 'x' }, { firstName: 'Bee' });
    expect(vars['ชื่อ']).toBe('Bee');
  });
  it('L3.3 null customer safe', () => {
    const vars = getRecallTemplateVariables({ reason: 'x' }, null);
    expect(vars['ชื่อ']).toBe('');
  });
  it('L3.4 null recall safe', () => {
    const vars = getRecallTemplateVariables(null, { displayName: 'X' });
    expect(vars['เรื่อง']).toBe('');
  });
  it('L3.5 full render with renderTemplate', () => {
    const recall = { reason: 'ฟิลเลอร์ครบ 6 เดือน', recallDate: '2026-11-14' };
    const customer = { displayName: 'นาย Eee' };
    const vars = getRecallTemplateVariables(recall, customer);
    const out = renderTemplate(DEFAULT_RECALL_TEMPLATES[0].text, vars);
    expect(out).toMatch(/นาย Eee/);
    expect(out).toMatch(/ฟิลเลอร์ครบ 6 เดือน/);
    expect(out).not.toMatch(/\{ชื่อ\}/); // all placeholders substituted
    expect(out).not.toMatch(/\{เรื่อง\}/);
  });
});
