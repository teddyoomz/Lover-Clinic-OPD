import { describe, it, expect } from 'vitest';
import { escapeCell, buildCSV } from '../src/lib/csvExport.js';

describe('escapeCell — RFC 4180 quote-escape', () => {
  it('returns empty string for null/undefined/empty', () => {
    expect(escapeCell(null)).toBe('');
    expect(escapeCell(undefined)).toBe('');
    expect(escapeCell('')).toBe('');
  });

  it('returns plain string for ASCII without separators', () => {
    expect(escapeCell('hello')).toBe('hello');
    expect(escapeCell('123.45')).toBe('123.45');
  });

  it('preserves Thai characters (UTF-8) without escaping', () => {
    expect(escapeCell('ลูกค้า')).toBe('ลูกค้า');
    expect(escapeCell('วันที่ขาย')).toBe('วันที่ขาย');
  });

  it('wraps in quotes when value contains a comma', () => {
    expect(escapeCell('a, b')).toBe('"a, b"');
  });

  it('wraps and doubles internal quotes', () => {
    expect(escapeCell('say "hi"')).toBe('"say ""hi"""');
  });

  it('wraps in quotes when value contains a newline (CR or LF)', () => {
    expect(escapeCell('line1\nline2')).toBe('"line1\nline2"');
    expect(escapeCell('line1\r\nline2')).toBe('"line1\r\nline2"');
  });

  it('coerces numbers to strings without altering precision', () => {
    expect(escapeCell(42)).toBe('42');
    expect(escapeCell(0)).toBe('0');
    expect(escapeCell(3.14)).toBe('3.14');
  });

  it('coerces booleans to "true" / "false"', () => {
    expect(escapeCell(true)).toBe('true');
    expect(escapeCell(false)).toBe('false');
  });
});

describe('buildCSV — assembly + BOM', () => {
  const cols = [
    { key: 'date',  label: 'วันที่' },
    { key: 'name',  label: 'ลูกค้า' },
    { key: 'total', label: 'ยอด' },
  ];

  it('starts with UTF-8 BOM', () => {
    const csv = buildCSV([], cols);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('emits Thai header row after BOM', () => {
    const csv = buildCSV([], cols);
    expect(csv).toBe('\ufeffวันที่,ลูกค้า,ยอด\r\n');
  });

  it('uses CRLF separator between rows', () => {
    const csv = buildCSV(
      [{ date: '2026-01-01', name: 'A', total: 100 }, { date: '2026-01-02', name: 'B', total: 200 }],
      cols
    );
    const body = csv.replace(/^\ufeff[^\r\n]+\r\n/, '');
    expect(body).toBe('2026-01-01,A,100\r\n2026-01-02,B,200');
  });

  it('returns just BOM when columns is empty array', () => {
    expect(buildCSV([{ a: 1 }], [])).toBe('\ufeff');
  });

  it('returns header-only when rows is empty', () => {
    expect(buildCSV([], cols)).toBe('\ufeffวันที่,ลูกค้า,ยอด\r\n');
  });

  it('uses column.format(value, row) when provided', () => {
    const c2 = [
      { key: 'qty',   label: 'qty' },
      { key: 'price', label: 'subtotal', format: (_, row) => row.qty * row.price },
    ];
    const csv = buildCSV([{ qty: 3, price: 100 }], c2);
    expect(csv).toContain('3,300');
  });

  it('escapes cells with separators inside (commas/quotes/newlines)', () => {
    const csv = buildCSV(
      [{ date: '2026-01-01', name: 'foo, bar', total: 'a "quote"' }],
      cols
    );
    expect(csv).toContain('"foo, bar"');
    expect(csv).toContain('"a ""quote"""');
  });

  it('handles missing keys (renders empty cell, not "undefined")', () => {
    const csv = buildCSV([{ date: '2026-01-01' }], cols);
    expect(csv).toContain('2026-01-01,,');
  });

  it('coerces null/undefined cells without throwing', () => {
    expect(() => buildCSV([{ date: null, name: undefined, total: 0 }], cols)).not.toThrow();
  });

  it('returns BOM-only when both rows and columns missing', () => {
    expect(buildCSV(null, null)).toBe('\ufeff');
    expect(buildCSV(undefined, undefined)).toBe('\ufeff');
  });

  it('honors row order (does not sort)', () => {
    const csv = buildCSV(
      [{ date: 'z', name: '', total: 0 }, { date: 'a', name: '', total: 0 }],
      cols
    );
    const lines = csv.replace(/^\ufeff[^\r\n]+\r\n/, '').split('\r\n');
    expect(lines[0].startsWith('z')).toBe(true);
    expect(lines[1].startsWith('a')).toBe(true);
  });

  it('survives format() throwing — caller catches; here we just verify we do not eat exceptions', () => {
    const cBoom = [{ key: 'x', label: 'x', format: () => { throw new Error('boom'); } }];
    expect(() => buildCSV([{ x: 1 }], cBoom)).toThrow('boom');
  });
});
