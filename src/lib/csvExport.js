// ─── CSV Export — RFC-4180 with UTF-8 BOM for Thai Excel compatibility ──────
// Used by every Phase 10 report tab. Single source of truth so escape-quoting
// stays consistent.
//
// Why BOM: Excel on Windows opens UTF-8 CSV as Latin-1 unless a BOM (\ufeff)
// is present at the start, mangling Thai characters. Numbers/Sheets handle
// either, so the BOM is purely defensive for Excel users.

/**
 * Escape a single CSV cell per RFC-4180:
 *   - wrap in quotes if value contains comma, quote, newline, or carriage return
 *   - double any embedded quotes
 *   - null/undefined → empty string
 */
export function escapeCell(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Build CSV text from rows + columns spec.
 *
 * @param {Array<Object>} rows  — data rows
 * @param {Array<{ key: string, label: string, format?: (v: any, row: any) => any }>} columns
 * @returns {string} CSV text including header row, leading BOM, CRLF line breaks
 */
export function buildCSV(rows, columns) {
  if (!Array.isArray(columns) || columns.length === 0) return '\ufeff';
  const header = columns.map(c => escapeCell(c.label)).join(',');
  const body = (Array.isArray(rows) ? rows : []).map(row => {
    return columns.map(c => {
      const raw = row?.[c.key];
      const val = typeof c.format === 'function' ? c.format(raw, row) : raw;
      return escapeCell(val);
    }).join(',');
  }).join('\r\n');
  return `\ufeff${header}\r\n${body}`;
}

/**
 * Trigger a CSV download in the browser.
 * No-op in non-browser environments (tests).
 *
 * @param {string} filename — without extension; ".csv" appended automatically
 * @param {Array<Object>} rows
 * @param {Array<{ key, label, format? }>} columns
 */
export function downloadCSV(filename, rows, columns) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const csv = buildCSV(rows, columns);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
