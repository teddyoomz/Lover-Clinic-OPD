// src/components/backend/reports/widgets/ExpenseSectionTable.jsx
// Phase 16.7 (2026-04-29 session 33) — reusable table for ExpenseReportTab
// sections (Doctors / Staff / Categories / Products).
//
// Each section passes its own column definition + row data + total row.
// Column.format(value, row) lets caller customise rendering (number / Thai
// money / position-badge / etc.). Default = th-TH locale string.
//
// MetricExplanationPopover is rendered next to the section title when
// `metricSpec` prop is supplied — reuse from Phase 16.2-bis.

import MetricExplanationPopover from './MetricExplanationPopover.jsx';
import { fmtMoney } from '../../../../lib/financeUtils.js';

/**
 * @typedef {Object} ExpenseSectionColumn
 * @property {string} key                      — row field to read
 * @property {string} label                    — Thai header label
 * @property {string} [align='left']           — 'left' | 'right'
 * @property {(value:any, row:object)=>string} [format] — custom formatter (default = locale string)
 * @property {boolean} [isMoney]               — when true, format with fmtMoney + tabular-nums + emerald color
 * @property {string} [testId]                 — optional column test id
 */

/**
 * @param {object} p
 * @param {string} p.title                              — section header label
 * @param {Array<object>} p.rows                        — array of row objects
 * @param {Array<ExpenseSectionColumn>} p.columns       — column definitions
 * @param {object} [p.totals]                           — optional footer totals row (same keys as rows)
 * @param {string} [p.totalsLabel]                      — first-column label for totals row (default 'รวม')
 * @param {object} [p.metricSpec]                       — Phase 16.2-bis info popover spec
 * @param {string} [p.testId]
 * @param {string} [p.emptyMessage='ไม่มีข้อมูลในช่วงเวลานี้']
 * @param {string} [p.titleColor='emerald-300']         — Tailwind color class for header
 */
export default function ExpenseSectionTable({
  title,
  rows = [],
  columns = [],
  totals = null,
  totalsLabel = 'รวม',
  metricSpec,
  testId,
  emptyMessage = 'ไม่มีข้อมูลในช่วงเวลานี้',
  titleColor = 'text-emerald-300',
}) {
  const tid = testId || `expense-section-${metricSpec?.id || title}`;

  const renderCell = (col, row, idx) => {
    const v = row[col.key];
    if (col.format) return col.format(v, row);
    if (col.isMoney) return fmtMoney(v ?? 0);
    if (typeof v === 'number') return Number(v).toLocaleString('th-TH');
    return String(v ?? '');
  };

  return (
    <div
      className="rounded-lg border border-[var(--bd)] bg-[var(--bg-card)] p-3"
      data-testid={tid}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className={`text-xs font-bold uppercase tracking-wider ${titleColor} inline-flex items-center gap-1`}>
          <span>{title}</span>
          <MetricExplanationPopover spec={metricSpec} testId={tid} />
        </h3>
        <span className="text-[10px] text-[var(--tx-muted)]">{rows.length} รายการ</span>
      </div>

      {rows.length === 0 ? (
        <p className="text-[10px] text-[var(--tx-muted)] py-3 text-center">{emptyMessage}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]" data-testid={`${tid}-table`}>
            <thead>
              <tr className="border-b-2 border-[var(--bd)] text-[var(--tx-muted)]">
                {columns.map(c => (
                  <th
                    key={c.key}
                    className={`py-1.5 px-2 text-[10px] font-bold uppercase tracking-wider ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                    data-column-key={c.key}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.id || i}
                  className="border-b border-[var(--bd)] hover:bg-[var(--bg-hover)]"
                  data-row-id={r.id || i}
                >
                  {columns.map(c => (
                    <td
                      key={c.key}
                      className={`py-1.5 px-2 ${c.align === 'right' ? 'text-right tabular-nums' : ''} ${c.isMoney ? 'tabular-nums text-emerald-300 font-semibold' : ''}`}
                      data-cell-key={c.key}
                    >
                      {renderCell(c, r, i)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {totals && (
              <tfoot>
                <tr className="border-t-2 border-[var(--bd)] font-bold">
                  {columns.map((c, ci) => {
                    if (ci === 0) {
                      return (
                        <td key={c.key} className="py-2 px-2">{totalsLabel}</td>
                      );
                    }
                    const v = totals[c.key];
                    return (
                      <td
                        key={c.key}
                        className={`py-2 px-2 ${c.align === 'right' ? 'text-right tabular-nums' : ''} ${c.isMoney ? 'tabular-nums text-emerald-400' : ''}`}
                        data-totals-key={c.key}
                      >
                        {v == null ? '' : c.isMoney ? fmtMoney(v) : (typeof v === 'number' ? Number(v).toLocaleString('th-TH') : String(v))}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
