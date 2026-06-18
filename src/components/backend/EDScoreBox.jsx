// EDScoreBox — "สมรรถภาพ · ED Score" card for CustomerDetailView (right column,
// below the 4-tab course box). Latest round = hero; full history expandable; each
// follow-up round deletable (round# is derived → delete renumbers). Round 1 is a
// virtual record from be_customers.patientData → works for current customers, no
// migration. Card styling mirrors the real 4-tab box (CustomerDetailView.jsx:1187).
import React, { useState } from 'react';
import { HeartPulse, QrCode, Trash2, ChevronDown, ChevronRight, History, Eye, ArrowLeft } from 'lucide-react';
import { deriveRounds, latestPerType, nextRoundNumber } from '../../lib/assessmentRoundsCore.js';
import { ED_TYPE_META, scoreForType, formatRoundDate } from '../../lib/edScoreDisplay.js';
import { deleteAssessmentRound } from '../../lib/scopedDataLayer.js';
import { thaiTodayISO } from '../../utils.js';
import EDDetailModal from './EDDetailModal.jsx';

// Literal class strings (Tailwind JIT needs them spelled out — no dynamic interpolation).
const CHIP = {
  adam: { dark: 'bg-orange-900/10 border-orange-900/30', light: 'bg-orange-50 border-orange-200', labelD: 'text-orange-400', labelL: 'text-orange-700' },
  iief: { dark: 'bg-amber-900/10 border-amber-900/30', light: 'bg-amber-50 border-amber-200', labelD: 'text-amber-400', labelL: 'text-amber-700' },
  mrs: { dark: 'bg-pink-900/10 border-pink-900/30', light: 'bg-pink-50 border-pink-200', labelD: 'text-pink-400', labelL: 'text-pink-700' },
  pe: { dark: 'bg-slate-800/20 border-slate-700/40', light: 'bg-slate-100 border-slate-200', labelD: 'text-slate-400', labelL: 'text-slate-600' },
};
const ED_ORDER = ['adam', 'iief', 'mrs', 'pe'];

function roundSummary(round) {
  // compact one-line summary of the types measured in this round
  return round.types.map((t) => {
    const s = scoreForType(t, round.raw);
    if (!s) return null;
    if (s.boolean) return `${ED_TYPE_META[t].label} ${s.present ? 'มีอาการ' : '-'}`;
    return `${ED_TYPE_META[t].label} ${s.value}/${s.max}`;
  }).filter(Boolean).join(' · ');
}

export default function EDScoreBox({ customerId, intakePerf, assessments, isDark, onSend }) {
  const [expanded, setExpanded] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [selectedRoundId, setSelectedRoundId] = useState(null);
  const [detail, setDetail] = useState(null); // {type, round} → open EDDetailModal

  const rounds = deriveRounds(intakePerf, assessments);
  const hero = rounds.length ? rounds[rounds.length - 1] : null;
  const lpt = latestPerType(intakePerf, assessments);
  const nextN = nextRoundNumber(intakePerf, assessments);
  // R4 (2026-06-16) — readable date (dd/mm/yyyy พ.ศ.) + "วันนี้" badge, like the TFP note.
  const today = thaiTodayISO();
  const heroDate = hero ? formatRoundDate(hero.assessmentDate, today) : null;
  // Round-select (2026-06-18): click a history row → view that round's snapshot.
  // `selectedRound` also guards a stale id (round deleted via listener re-fire → null → merged default).
  const selectedRound = selectedRoundId ? (rounds.find((r) => r.id === selectedRoundId) || null) : null;
  const selDate = selectedRound ? formatRoundDate(selectedRound.assessmentDate, today) : null;
  // The "viewing a specific round" state (header "กำลังดู:" + snapshot chips + row
  // highlight + "← ไปที่ครั้งล่าสุด" button) applies ONLY to a PAST round. The hero IS
  // the latest = the default home view, so selecting it just stays default (no distinct
  // state, no back affordance). Derived (not the click) so it self-corrects when a
  // selected round becomes the new hero after the newer round is deleted (renumber).
  const viewingPast = !!(selectedRound && hero && selectedRound.id !== hero.id);
  const todayBadgeCls =`ml-1 inline-block align-middle rounded-full px-1.5 text-[9px] font-bold border ${isDark ? 'bg-orange-500/15 border-orange-500/40 text-orange-300' : 'bg-orange-100 border-orange-300 text-orange-700'}`;

  const handleDelete = async (roundId) => {
    if (!roundId || roundId === '__intake__') return;
    if (!window.confirm('ลบผลการประเมินครั้งนี้? (เลขครั้งจะนับใหม่)')) return;
    try {
      setBusyId(roundId);
      await deleteAssessmentRound(roundId);
      if (roundId === selectedRoundId) setSelectedRoundId(null); // was viewing the deleted round → back to default
    } catch (e) { window.alert('ลบไม่สำเร็จ: ' + (e?.message || e)); }
    finally { setBusyId(''); }
    // listenToAssessments (in CustomerDetailView) re-fires → box refreshes
  };

  const cardCls = 'bg-[var(--bg-surface)] border border-[var(--bd)] rounded-xl overflow-hidden';
  const sendLabel = `ส่งแบบประเมินติดตาม (ครั้งที่ ${nextN})`;

  return (
    <div className={cardCls} data-testid="ed-score-box">
      <div className="px-4 py-3 border-b border-[var(--bd)] flex items-center gap-2">
        <HeartPulse size={15} className="text-orange-500" />
        <h3 className="text-sm font-bold text-[var(--tx-heading)]">สมรรถภาพ · ED Score</h3>
      </div>

      {hero ? (
        <div className="p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            {viewingPast ? (
              <span className="text-[11px] text-[var(--tx-muted)] min-w-0 truncate">
                กำลังดู: <span className="text-[var(--tx-secondary)] font-bold">ครั้งที่ {selectedRound.round}</span>
                {selDate?.text ? <> · <span className="text-[var(--tx-secondary)]">{selDate.text}</span>{selDate.isToday && <span className={todayBadgeCls}>วันนี้</span>}</> : ''}
                {selectedRound.source === 'intake' ? ' · รับเข้า' : ''}
              </span>
            ) : (
              <span className="text-[11px] text-[var(--tx-muted)]">
                ครั้งล่าสุด: <span className="text-[var(--tx-secondary)] font-bold">ครั้งที่ {hero.round}</span>
                {heroDate?.text ? <> · <span className="text-[var(--tx-secondary)]">{heroDate.text}</span>{heroDate.isToday && <span className={todayBadgeCls}>วันนี้</span>}</> : ''}
                {hero.source === 'intake' ? ' · จาก PatientForm รับเข้า' : ''}
              </span>
            )}
            {viewingPast && (
              <button
                type="button"
                onClick={() => setSelectedRoundId(null)}
                data-testid="ed-back-to-latest"
                aria-label="ไปที่ครั้งล่าสุด"
                className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold border ${
                  isDark ? 'bg-orange-500/15 border-orange-500/40 text-orange-300 hover:bg-orange-500/25'
                         : 'bg-orange-100 border-orange-300 text-orange-700 hover:bg-orange-200'}`}
              >
                <ArrowLeft size={11} /> ไปที่ครั้งล่าสุด
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {ED_ORDER.map((t) => {
              // Default (no selection): latest value per type, merged across rounds.
              // Selected: ONLY the chosen round's measured types (others → "—").
              const measured = viewingPast ? (selectedRound.types.includes(t) ? selectedRound : null) : lpt[t];
              const meta = ED_TYPE_META[t];
              const c = CHIP[t];
              const cls = `rounded-lg p-2.5 border ${isDark ? c.dark : c.light}`;
              const labelCls = `text-[10px] ${isDark ? c.labelD : c.labelL}`;
              if (!measured) {
                return (
                  <div key={t} className={cls} data-testid={`ed-chip-${t}`}>
                    <div className={labelCls}>{meta.label}</div>
                    <div className="text-[var(--tx-muted)] text-sm mt-1">—</div>
                  </div>
                );
              }
              const s = scoreForType(t, measured.raw);
              // olderTag only in the merged default view (a selected round is a single round → no cross-round tag).
              const olderTag = (!viewingPast && measured.round !== hero.round) ? ` (ครั้งที่ ${measured.round})` : '';
              return (
                <div key={t} data-testid={`ed-chip-${t}`} role="button" tabIndex={0}
                  aria-label={`ดูคำตอบรายข้อ ${meta.label}`}
                  onClick={() => setDetail({ type: t, round: measured })}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetail({ type: t, round: measured }); } }}
                  className={`${cls} cursor-pointer text-left transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40`}>
                  <div className={labelCls}>{meta.label}<span className="text-[var(--tx-muted)]">{olderTag}</span></div>
                  {s.boolean ? (
                    <div className="text-sm font-bold text-[var(--tx-heading)] mt-1">{s.text}</div>
                  ) : (
                    <>
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl font-bold text-[var(--tx-heading)]">{s.value}</span>
                        <span className="text-[11px] text-[var(--tx-muted)]">/{s.max}</span>
                      </div>
                      <div className={`text-[10px] ${isDark ? c.labelD : c.labelL}`}>{s.text}</div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            data-testid="ed-history-toggle"
            className="mt-3 w-full flex items-center gap-1.5 text-[11px] text-[var(--tx-muted)] hover:text-[var(--tx-secondary)] border-t border-[var(--bd)] pt-2"
          >
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            <History size={12} /> ประวัติทุกครั้ง ({rounds.length})
          </button>

          {expanded && (
            <div className="mt-2 flex flex-col gap-1.5">
              {[...rounds].reverse().map((r) => {
                const fd = formatRoundDate(r.assessmentDate, today);
                const isSel = viewingPast && selectedRoundId === r.id;
                // role="button" (NOT <button>) — it nests the delete <button>; nested <button> = invalid HTML.
                const rowCls = `w-full text-left flex items-center justify-between gap-2 text-[11px] rounded-md px-2 py-1.5 cursor-pointer transition-colors ${
                  isSel ? (isDark ? 'bg-orange-900/15 border border-orange-900/50' : 'bg-orange-50 border border-orange-300')
                        : (isDark ? 'bg-white/[0.02] hover:bg-white/[0.06] border border-transparent' : 'bg-black/[0.02] hover:bg-black/[0.05] border border-transparent')}`;
                return (
                <div key={r.id} data-testid={`ed-history-${r.id}`} role="button" tabIndex={0}
                  aria-pressed={isSel} aria-label={`ดูผลการประเมิน ครั้งที่ ${r.round}`}
                  onClick={() => setSelectedRoundId(r.id)}
                  // target===currentTarget: Enter/Space on the nested delete <button> bubbles here —
                  // only act when the ROW itself is focused, else keyboard-delete would also select.
                  onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setSelectedRoundId(r.id); } }}
                  className={rowCls}>
                  <span className="text-[var(--tx-secondary)] min-w-0 truncate flex items-center gap-1">
                    {isSel && <Eye size={12} className="shrink-0 text-orange-400" />}
                    <span className="min-w-0 truncate">
                      <span className="font-bold">ครั้งที่ {r.round}</span>
                      {fd.text ? <> · {fd.text}{fd.isToday && <span className={todayBadgeCls}>วันนี้</span>}</> : ''} · {roundSummary(r) || '—'}
                    </span>
                  </span>
                  {r.deletable ? (
                    <button type="button" onClick={(e) => { e.stopPropagation(); handleDelete(r.id); }} disabled={busyId === r.id}
                      data-testid={`ed-delete-${r.id}`} title="ลบผลการประเมินครั้งนี้" aria-label={`ลบผลการประเมิน ครั้งที่ ${r.round}`}
                      className="shrink-0 p-1 -m-0.5 text-[var(--tx-muted)] hover:text-red-500 disabled:opacity-40">
                      <Trash2 size={13} />
                    </button>
                  ) : (
                    <span className="shrink-0 text-[10px] text-[var(--tx-muted)]">รับเข้า</span>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="px-4 py-5 text-center text-xs text-[var(--tx-muted)]" data-testid="ed-empty">
          ยังไม่มีการประเมิน ED<br />
          <span className="text-[11px]">กดปุ่มเพื่อส่งแบบประเมินครั้งแรก</span>
        </div>
      )}

      <div className="px-4 pb-4 pt-1">
        <button
          type="button"
          onClick={() => onSend?.(nextN)}
          data-testid="ed-send-btn"
          className={`w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-bold transition-colors ${
            isDark ? 'bg-orange-900/15 border border-orange-900/40 text-orange-400 hover:bg-orange-900/25'
                   : 'bg-orange-50 border border-orange-200 text-orange-700 hover:bg-orange-100'}`}
        >
          <QrCode size={15} /> {sendLabel}
        </button>
      </div>

      {detail && (
        <EDDetailModal type={detail.type} round={detail.round} rounds={rounds} hero={hero}
          isDark={isDark} onClose={() => setDetail(null)} />
      )}
    </div>
  );
}
