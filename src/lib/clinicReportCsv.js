// ─── Clinic Report CSV exporter — Phase 16.2 ──────────────────────────────
//
// Produces a UTF-8 BOM-prefixed CSV string for Excel-compat Thai output.
// One section per widget. Sections separated by blank lines.

const BOM = '﻿';

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  // RFC 4180 — wrap in quotes if contains comma, quote, or newline
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(...cells) {
  return cells.map(csvEscape).join(',');
}

/**
 * Convert a ClinicReportSnapshot into a CSV string.
 * @param {object} snapshot
 * @returns {string}
 */
export function toCsv(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return BOM;
  const lines = [];
  const f = snapshot.meta?.filterApplied || {};
  const dateRange = `${f.from || '?'} → ${f.to || '?'}`;

  lines.push(row(`Clinic Report — ${dateRange} — branchScope: ${snapshot.meta?.branchScope ?? 'all'}`));
  lines.push('');

  // KPI Tiles
  lines.push(row('KPI Tiles'));
  lines.push(row('Metric', 'Value'));
  for (const [k, v] of Object.entries(snapshot.tiles || {})) {
    lines.push(row(k, v ?? ''));
  }
  lines.push('');

  // W1 — Revenue trend M-o-M
  lines.push(row('W1 — Revenue trend M-o-M'));
  lines.push(row('Month', 'Revenue (THB)'));
  for (const r of (snapshot.charts?.revenueTrend || [])) lines.push(row(r.label, r.value));
  lines.push('');

  // W2 — New customers M-o-M
  lines.push(row('W2 — New customers M-o-M'));
  lines.push(row('Month', 'Count'));
  for (const r of (snapshot.charts?.newCustomersTrend || [])) lines.push(row(r.label, r.value));
  lines.push('');

  // W3 — Retention cohort
  lines.push(row('W3 — Retention cohort'));
  lines.push(row('Cohort', 'CohortSize', 'Offset0', 'Offset1', 'Offset2', 'Offset3', 'Offset4', 'Offset5'));
  for (const r of (snapshot.charts?.retentionCohort?.rows || [])) {
    const cells = (r.cells || []).slice(0, 6);
    while (cells.length < 6) cells.push('');
    lines.push(row(r.cohort, r.cohortSize, ...cells));
  }
  lines.push(row('OverallRate', '', snapshot.charts?.retentionCohort?.overallRate ?? 0));
  lines.push('');

  // W4 — Top-10 services
  lines.push(row('W4 — Top-10 services'));
  lines.push(row('Rank', 'Name', 'Revenue (THB)', 'Count'));
  (snapshot.tables?.topServices || []).forEach((r, i) => lines.push(row(i + 1, r.name, r.revenue, r.count)));
  lines.push('');

  // W5 — Top-10 doctors
  lines.push(row('W5 — Top-10 doctors'));
  lines.push(row('Rank', 'Name', 'Total Sales (THB)'));
  (snapshot.tables?.topDoctors || []).forEach((r, i) => lines.push(row(i + 1, r.staffName || r.name, r.total ?? r.total_sales ?? 0)));
  lines.push('');

  // W6 — Top-10 products
  lines.push(row('W6 — Top-10 products'));
  lines.push(row('Rank', 'Name', 'Value (THB)', 'Qty'));
  (snapshot.tables?.topProducts || []).forEach((r, i) => lines.push(row(i + 1, r.name, r.value, r.qty)));
  lines.push('');

  // W7 — Branch comparison
  lines.push(row('W7 — Branch comparison'));
  lines.push(row('BranchID', 'BranchName', 'Revenue (THB)', 'Sale Count'));
  for (const r of (snapshot.charts?.branchComparison?.rows || [])) {
    lines.push(row(r.branchId, r.branchName, r.revenue, r.saleCount));
  }
  lines.push('');

  // W8 — Cash flow
  lines.push(row('W8 — Cash flow (revenue − expenses)'));
  lines.push(row('Month', 'Net (THB)'));
  for (const r of (snapshot.charts?.cashFlow || [])) lines.push(row(r.label, r.value));
  lines.push('');

  // W10 — Appt fill rate
  lines.push(row('W10 — Appt fill rate'));
  lines.push(row('Rate (%)', snapshot.charts?.apptFillRate ?? ''));
  lines.push('');

  // Meta
  lines.push(row('Meta'));
  lines.push(row('generatedAt', snapshot.meta?.generatedAt ?? ''));
  lines.push(row('branchScope', String(snapshot.meta?.branchScope ?? '')));
  const partialErrorsValue = snapshot.meta?.partialErrors;
  lines.push(row('partialErrors', partialErrorsValue ? JSON.stringify(partialErrorsValue) : ''));

  return BOM + lines.join('\n') + '\n';
}

/**
 * Trigger a browser download of the CSV with a sensible filename.
 */
export function downloadCsv(snapshot, filename = 'clinic-report.csv') {
  const csv = toCsv(snapshot);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
