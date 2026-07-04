// EDDetailModal — per-question answer detail with a side-by-side 2-round COMPARE.
// Opened by clicking an ED Score chip. Type tabs (ADAM/IIEF/MRS/PE) + swap + (1 or 2)
// round panels. The PRIMARY round is the one clicked (anchor); the COMPARE round is
// auto-derived (nearest other round measuring the active type) and re-pickable per panel.
// Rows whose answer changed between the two rounds are highlighted; both scores show
// side-by-side (no ดีขึ้น/แย่ลง trend — per user). Reuses buildEdAnswerRows / scoreForType
// (no re-impl). AV78: backdrop click does NOT close — only ✕ / ESC. Pure display.
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronDown, ArrowLeftRight } from 'lucide-react';
import { ED_TYPE_META, scoreForType, formatRoundDate } from '../../lib/edScoreDisplay.js';
import { buildEdAnswerRows } from '../../lib/edQuestions.js';
import { autoPickCompareRound, markChangedRows } from '../../lib/edCompare.js';
import { useLayoutPreference } from '../../hooks/useLayoutPreference.js';
import { useEscToClose } from '../../lib/useEscToClose.js';
import { thaiTodayISO } from '../../utils.js';

// accent per test — matches the box chips + AdminDashboard reference (no red on patient names; rule 04).
const TONE = {
  adam: { d: 'text-orange-400', l: 'text-orange-600', bD: 'bg-orange-900/10 border-orange-900/40', bL: 'bg-orange-50 border-orange-200', tabD: 'bg-orange-900/20 border-orange-900/50 text-orange-300', tabL: 'bg-orange-50 border-orange-300 text-orange-700' },
  iief: { d: 'text-red-400', l: 'text-red-600', bD: 'bg-red-900/10 border-red-900/40', bL: 'bg-red-50 border-red-200', tabD: 'bg-red-900/20 border-red-900/50 text-red-300', tabL: 'bg-red-50 border-red-300 text-red-700' },
  mrs: { d: 'text-pink-400', l: 'text-pink-600', bD: 'bg-pink-900/10 border-pink-900/40', bL: 'bg-pink-50 border-pink-200', tabD: 'bg-pink-900/20 border-pink-900/50 text-pink-300', tabL: 'bg-pink-50 border-pink-300 text-pink-700' },
  pe: { d: 'text-slate-300', l: 'text-slate-600', bD: 'bg-slate-800/30 border-slate-700/40', bL: 'bg-slate-100 border-slate-200', tabD: 'bg-slate-700/40 border-slate-600/50 text-slate-200', tabL: 'bg-slate-100 border-slate-300 text-slate-700' },
};
const ED_ORDER = ['adam', 'iief', 'mrs', 'pe'];

// flex:none + centered + nowrap → the label stays centered when the header is tight (no squeeze).
function Badge({ children, isDark, testid }) {
  return (
    <span data-testid={testid}
      className={`shrink-0 inline-flex items-center justify-center whitespace-nowrap rounded-full px-1.5 text-[9px] font-bold border ${
        isDark ? 'bg-orange-500/15 border-orange-500/40 text-orange-300' : 'bg-orange-100 border-orange-300 text-orange-700'}`}>
      {children}
    </span>
  );
}

function RoundPanel({ round, hero, isDark, activeType, pickRounds, rows, onPick, muted, testid }) {
  const tone = TONE[activeType] || TONE.pe;
  const accent = isDark ? tone.d : tone.l;
  const today = thaiTodayISO();
  const dateInfo = formatRoundDate(round.assessmentDate, today);
  const isHero = !!(hero && round.id === hero.id);
  const hasType = rows !== null;
  const s = hasType ? scoreForType(activeType, round.raw) : null;
  const bannerCls = muted
    ? (isDark ? 'bg-white/[0.05] border-white/[0.12]' : 'bg-black/[0.06] border-black/[0.12]')
    : (isDark ? tone.bD : tone.bL);
  const bannerText = muted ? 'text-[var(--tx-secondary)]' : accent;

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--bd)] rounded-xl p-2.5 min-w-0" data-testid={testid}>
      <div className="flex items-center justify-between gap-2">
        <span className="relative min-w-0 flex-1">
          <select
            value={round.id}
            onChange={(e) => onPick?.(e.target.value)}
            data-testid={`${testid}-pick`}
            aria-label="เลือกครั้งที่ประเมิน"
            className="w-full min-w-0 appearance-none truncate text-[11px] font-bold rounded-lg pl-2.5 pr-6 py-1 bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40">
            {pickRounds.map((r) => {
              const fd = formatRoundDate(r.assessmentDate, today);
              return (
                <option key={r.id} value={r.id}>
                  ครั้งที่ {r.round}{fd.text ? ` · ${fd.text}` : ''}{r.source === 'intake' ? ' · รับเข้า' : ''}
                </option>
              );
            })}
          </select>
          <ChevronDown size={13} className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--tx-muted)]" />
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {isHero && <Badge isDark={isDark} testid={`${testid}-badge-latest`}>ล่าสุด</Badge>}
          {dateInfo.isToday && <Badge isDark={isDark} testid={`${testid}-badge-today`}>วันนี้</Badge>}
        </span>
      </div>

      {!hasType ? (
        <div data-testid={`${testid}-empty`}
          className="mt-3 mb-1 px-3 py-5 rounded-xl border border-dashed border-[var(--bd)] text-center text-[11px] text-[var(--tx-muted)]">
          ครั้งนี้ไม่ได้ประเมิน {ED_TYPE_META[activeType].label}
          <br /><span className="text-[10px]">(ประเมิน {round.types.map((t) => ED_TYPE_META[t]?.label).filter(Boolean).join(' · ') || '—'})</span>
        </div>
      ) : (
        <>
          <div className={`mt-2.5 mb-1 px-3.5 py-2.5 rounded-xl border flex items-center justify-between gap-2 ${bannerCls}`}>
            {s?.boolean ? (
              <span className={`text-sm font-bold ${bannerText}`}>{s.text}</span>
            ) : (
              <>
                <span className={`text-[13px] font-bold min-w-0 truncate ${bannerText}`}>{s?.text}</span>
                <span className="shrink-0">
                  <span className={`text-2xl font-bold ${muted ? 'text-[var(--tx-secondary)]' : 'text-[var(--tx-heading)]'}`}>{s?.value}</span>
                  <span className="text-[var(--tx-muted)] text-[13px]"> / {s?.max}</span>
                </span>
              </>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            {rows.map((r) => (
              <div key={r.n} data-testid={`${testid}-row-${r.n}`}
                className={`flex items-start justify-between gap-3 rounded-lg px-3 py-2 border ${
                  r.changed
                    ? (isDark ? 'bg-sky-900/15 border-sky-800/40' : 'bg-sky-50 border-sky-200')
                    : (isDark ? 'bg-white/[0.02] border-white/[0.06]' : 'bg-black/[0.02] border-black/[0.05]')}`}>
                <span className="text-xs text-[var(--tx-secondary)] leading-relaxed">{r.n}. {r.question}</span>
                <span className={`shrink-0 text-xs font-bold whitespace-nowrap ${r.flagged ? accent : 'text-[var(--tx-muted)]'}`}>{r.answer}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// zClassName (2026-07-04, bug-hunt R1 #1): default z-[110] serves the original
// CustomerDetailView context; the staff-chat launcher passes z-[9600] so the
// modal stacks ABOVE the chat panel (z-9000) — below lightbox/pdf (9700).
export default function EDDetailModal({ type, round, rounds = [], hero, isDark, onClose, zClassName = 'z-[110]' }) {
  const [activeType, setActiveType] = useState(type);
  const [primaryId, setPrimaryId] = useState(round?.id);
  const [manualCompareId, setManualCompareId] = useState(null);

  // ESC via the shared stack (bug-hunt R1 #12) — when this modal is stacked
  // over another (chat-launched over CDV's), ONE ESC closes only the top.
  useEscToClose(onClose);

  // device-persistent panel position — same mechanism as the TFP split-screen.
  const { isPrimaryLeft, swap } = useLayoutPreference('ed-compare', 'left');

  // keep activeType valid if a cross-device delete removes every round measuring it.
  useEffect(() => {
    const valid = ED_ORDER.filter((t) => rounds.some((r) => r.types?.includes(t)));
    if (valid.length && !valid.includes(activeType)) setActiveType(valid[0]);
  }, [rounds, activeType]);

  const find = (id) => rounds.find((r) => r.id === id) || null;
  // primary anchors to a round that STILL EXISTS in `rounds` (a background delete must not
  // leave the picker showing a value with no matching option) → fall to the clicked round,
  // else the latest, else the (stale) prop.
  const primary = find(primaryId) || find(round?.id) || rounds[rounds.length - 1] || round;
  if (!primary || !ED_TYPE_META[activeType]) return null;

  // compare = a valid manual pick (still has the active type, not the primary), else auto-derived.
  const manual = manualCompareId && manualCompareId !== primary.id ? find(manualCompareId) : null;
  const compare = (manual && manual.types?.includes(activeType))
    ? manual
    : autoPickCompareRound(rounds, primary, activeType);
  const canCompare = !!compare;

  const tabs = ED_ORDER.filter((t) => rounds.some((r) => r.types?.includes(t)));

  const pHas = primary.types?.includes(activeType);
  let pRows = pHas ? buildEdAnswerRows(activeType, primary.raw) : null;
  let cRows = canCompare ? buildEdAnswerRows(activeType, compare.raw) : null;
  if (pRows && cRows) { const m = markChangedRows(pRows, cRows); pRows = m.primary; cRows = m.compare; }

  const pPanel = (
    <RoundPanel key="p" testid="ed-panel-primary" round={primary} hero={hero} isDark={isDark}
      activeType={activeType} pickRounds={rounds} rows={pRows} onPick={setPrimaryId} />
  );
  const cPanel = canCompare ? (
    <RoundPanel key="c" testid="ed-panel-compare" round={compare} hero={hero} isDark={isDark}
      activeType={activeType} pickRounds={rounds.filter((r) => r.id !== primary.id && r.types?.includes(activeType))}
      rows={cRows} onPick={setManualCompareId} muted />
  ) : null;
  const ordered = isPrimaryLeft ? [pPanel, cPanel] : [cPanel, pPanel];

  return createPortal(
    // AV98: portal to document.body — EDScoreBox renders this INSIDE its rounded-xl
    // glow card, and the V86 auto-glow's :hover transform makes that card the
    // containing block for this fixed overlay → confines it to the box. Portaling
    // escapes the transformed ancestor. (User chose "keep V86 lift" → portal modals.)
    // AV78: backdrop has NO onClick → clicking outside does NOT close (✕ / ESC only).
    <div className={`fixed inset-0 ${zClassName} bg-black/55 flex items-start justify-center p-4 overflow-y-auto`}
      data-testid="ed-detail-backdrop" role="dialog" aria-modal="true" aria-labelledby="ed-detail-title">
      <div className={`w-full ${canCompare ? 'max-w-3xl' : 'max-w-xl'} my-8 bg-[var(--bg-surface)] border border-[var(--bd)] rounded-2xl overflow-hidden shadow-2xl`}
        data-testid="ed-detail-modal">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[var(--bd)]">
          <div className="flex items-center gap-1.5 min-w-0 flex-wrap" role="tablist" aria-label="เลือกแบบประเมิน">
            <span id="ed-detail-title" className="sr-only">รายละเอียดคำตอบ ED เปรียบเทียบ</span>
            {tabs.map((t) => {
              const on = t === activeType;
              const tt = TONE[t] || TONE.pe;
              return (
                <button key={t} type="button" role="tab" aria-selected={on} data-testid={`ed-tab-${t}`}
                  onClick={() => setActiveType(t)}
                  className={`text-[11px] font-bold rounded-full px-2.5 py-0.5 border transition ${
                    on ? (isDark ? tt.tabD : tt.tabL)
                       : 'border-[var(--bd)] text-[var(--tx-muted)] hover:text-[var(--tx-secondary)]'}`}>
                  {ED_TYPE_META[t].label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {canCompare && (
              <button type="button" onClick={swap} data-testid="ed-swap" aria-label="สลับซ้ายขวา"
                className="inline-flex items-center gap-1 text-[11px] font-bold rounded-lg px-2 py-1 border border-[var(--bd)] text-[var(--tx-muted)] hover:text-[var(--tx-secondary)] hover:bg-[var(--bg-hover)]">
                <ArrowLeftRight size={13} /> สลับ
              </button>
            )}
            <button type="button" onClick={() => onClose?.()} data-testid="ed-detail-close" aria-label="ปิด"
              className="shrink-0 p-1.5 -m-1 rounded text-[var(--tx-muted)] hover:text-[var(--tx-heading)] hover:bg-[var(--bg-hover)]">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="p-4">
          {canCompare ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">{ordered}</div>
          ) : (
            <>
              {pPanel}
              <div className="mt-3 text-center text-[11px] text-[var(--tx-muted)]" data-testid="ed-compare-hint">
                ยังไม่มีครั้งอื่นให้เทียบ — ส่งแบบประเมินติดตามเพื่อดูการเปลี่ยนแปลง
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
