// EDDetailModal — per-question answer detail for one ED test + one round.
// Opened by clicking an ED Score chip. Mirrors the AdminDashboard intake-detail style
// (score header + per-question rows) but richer: full question text + the option label
// the customer chose. AV78: backdrop click does NOT close — only ✕ / ESC. Pure display.
import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { ED_TYPE_META, scoreForType, formatRoundDate } from '../../lib/edScoreDisplay.js';
import { buildEdAnswerRows } from '../../lib/edQuestions.js';
import { thaiTodayISO } from '../../utils.js';

// accent per test — matches the box chips + AdminDashboard reference (no red on patient names; rule 04).
const TONE = {
  adam: { d: 'text-orange-400', l: 'text-orange-600', bD: 'bg-orange-900/10 border-orange-900/40', bL: 'bg-orange-50 border-orange-200' },
  iief: { d: 'text-red-400', l: 'text-red-600', bD: 'bg-red-900/10 border-red-900/40', bL: 'bg-red-50 border-red-200' },
  mrs: { d: 'text-pink-400', l: 'text-pink-600', bD: 'bg-pink-900/10 border-pink-900/40', bL: 'bg-pink-50 border-pink-200' },
  pe: { d: 'text-slate-300', l: 'text-slate-600', bD: 'bg-slate-800/30 border-slate-700/40', bL: 'bg-slate-100 border-slate-200' },
};

export default function EDDetailModal({ type, round, isDark, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!round || !ED_TYPE_META[type]) return null;
  const meta = ED_TYPE_META[type];
  const tone = TONE[type] || TONE.pe;
  const accent = isDark ? tone.d : tone.l;
  const bannerCls = isDark ? tone.bD : tone.bL;
  const rows = buildEdAnswerRows(type, round.raw);
  const s = scoreForType(type, round.raw);
  const dateInfo = formatRoundDate(round.assessmentDate, thaiTodayISO());

  return (
    // AV78: backdrop has NO onClick → clicking outside does NOT close (✕ / ESC only).
    <div className="fixed inset-0 z-[110] bg-black/55 flex items-start justify-center p-4 overflow-y-auto"
      data-testid="ed-detail-backdrop" role="dialog" aria-modal="true" aria-labelledby="ed-detail-title">
      <div className="w-full max-w-xl my-8 bg-[var(--bg-surface)] border border-[var(--bd)] rounded-2xl overflow-hidden shadow-2xl"
        data-testid="ed-detail-modal">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[var(--bd)]">
          <div className="min-w-0">
            <div id="ed-detail-title" className={`text-sm font-bold ${accent}`}>{meta.label} · {meta.full}</div>
            <div className="text-[11px] text-[var(--tx-muted)]">
              ครั้งที่ {round.round}{dateInfo.text ? ` · ${dateInfo.text}` : ''}{round.source === 'intake' ? ' · รับเข้า' : ''}
            </div>
          </div>
          <button type="button" onClick={() => onClose?.()} data-testid="ed-detail-close" aria-label="ปิด"
            className="shrink-0 p-1.5 -m-1 rounded text-[var(--tx-muted)] hover:text-[var(--tx-heading)] hover:bg-[var(--bg-hover)]">
            <X size={18} />
          </button>
        </div>

        <div className={`mx-4 mt-3 mb-1 px-3.5 py-2.5 rounded-xl border flex items-center justify-between gap-2 ${bannerCls}`}>
          {s?.boolean ? (
            <span className={`text-sm font-bold ${accent}`}>{s.text}</span>
          ) : (
            <>
              <span className={`text-[13px] font-bold ${accent}`}>{s?.text}</span>
              <span className="shrink-0">
                <span className="text-2xl font-bold text-[var(--tx-heading)]">{s?.value}</span>
                <span className="text-[var(--tx-muted)] text-[13px]"> / {s?.max}</span>
              </span>
            </>
          )}
        </div>

        <div className="px-4 pt-1 pb-4 flex flex-col gap-1.5">
          {rows.map((r) => (
            <div key={r.n} data-testid={`ed-detail-row-${r.n}`}
              className={`flex items-start justify-between gap-3 rounded-lg px-3 py-2 border ${isDark ? 'bg-white/[0.02] border-white/[0.06]' : 'bg-black/[0.02] border-black/[0.05]'}`}>
              <span className="text-xs text-[var(--tx-secondary)] leading-relaxed">{r.n}. {r.question}</span>
              <span className={`shrink-0 text-xs font-bold whitespace-nowrap ${r.flagged ? accent : 'text-[var(--tx-muted)]'}`}>{r.answer}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
