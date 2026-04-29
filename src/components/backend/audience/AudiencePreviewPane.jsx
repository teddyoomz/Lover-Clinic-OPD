// ─── AudiencePreviewPane — Phase 16.1 (2026-04-30) ──────────────────────────
// Read-only preview panel: total count + 10-name sample + Export CSV button.
// Renders inert state while parent debounces evaluation.

import { Download, Users } from 'lucide-react';

export default function AudiencePreviewPane({ loading, total, sample, onExport, canExport }) {
  const sampleList = Array.isArray(sample) ? sample : [];
  return (
    <div
      className="bg-[var(--bg-card)] border border-[var(--bd)] rounded-lg p-4 flex flex-col gap-3"
      data-testid="audience-preview-pane"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Users className="w-5 h-5 text-emerald-500" aria-hidden />
        <span className="text-base font-semibold text-[var(--tx-heading)]">ตัวอย่างผลลัพธ์</span>
        <span className="text-xs text-[var(--tx-secondary)]" data-testid="audience-preview-total">
          {loading
            ? 'กำลังคำนวณ…'
            : `ตรงตามเงื่อนไข ${Number(total || 0).toLocaleString('th-TH')} ราย`}
        </span>
        <button
          type="button"
          onClick={onExport}
          disabled={!canExport}
          className="ml-auto px-3 py-1.5 text-xs rounded bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
          data-testid="audience-export-csv"
        >
          <Download className="w-3.5 h-3.5" aria-hidden />
          Export CSV
        </button>
      </div>
      {sampleList.length === 0 ? (
        <div className="text-xs text-[var(--tx-secondary)] py-4 text-center" data-testid="audience-preview-empty">
          {loading ? 'รอผล…' : 'ยังไม่มีลูกค้าตรงตามเงื่อนไข'}
        </div>
      ) : (
        <ul
          className="grid grid-cols-1 md:grid-cols-2 gap-1.5"
          data-testid="audience-preview-sample"
        >
          {sampleList.map((c) => {
            const display = `${c?.firstname || ''} ${c?.lastname || ''}`.trim() || '(ไม่ระบุชื่อ)';
            return (
              <li
                key={c?.id || display}
                className="flex items-center gap-2 px-2 py-1 rounded bg-[var(--bg-surface)] border border-[var(--bd)] text-xs"
              >
                <span className="text-[var(--tx-secondary)] shrink-0 font-mono">{c?.hn_no || '-'}</span>
                <span className="text-[var(--tx-primary)] truncate">{display}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
