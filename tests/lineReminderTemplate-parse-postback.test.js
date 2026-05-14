import { describe, it, expect } from 'vitest';
import { parsePostbackData } from '../src/lib/lineReminderTemplate.js';

describe('T2 parsePostbackData', () => {
  it('PB1 parses action + appt + br', () => {
    const r = parsePostbackData('action=confirm&appt=BA-x&br=BR-y');
    expect(r).toEqual({ action: 'confirm', appt: 'BA-x', br: 'BR-y' });
  });
  it('PB2 handles missing br field', () => {
    const r = parsePostbackData('action=reschedule&appt=BA-x');
    expect(r.action).toBe('reschedule');
    expect(r.br).toBe(null);
  });
  it('PB3 handles empty data', () => {
    expect(parsePostbackData('')).toEqual({ action: null, appt: null, br: null });
  });
  it('PB4 handles malformed (no equal)', () => {
    expect(parsePostbackData('confirm-and-appt-BA-x')).toEqual({ action: null, appt: null, br: null });
  });
  it('PB5 ignores unknown fields', () => {
    const r = parsePostbackData('action=confirm&appt=BA-x&unknown=hack');
    expect(r).toEqual({ action: 'confirm', appt: 'BA-x', br: null });
  });
});
