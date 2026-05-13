import React from 'react';
import { Stethoscope, Printer, Activity, Plus } from 'lucide-react';

/**
 * Phase 28 (2026-05-14) — header for treatment history card.
 *
 * Layout: icon tile + title + count badge | CTA cluster (2 ghost + 1 primary).
 * Primary "+ บันทึกการรักษา" = fire-red gradient + glow + hover lift.
 * Ghosts "พิมพ์เอกสาร" + "ดูไทม์ไลน์" = ghost-style with semantic-tinted hover.
 *
 * The Create button is gated by `onCreateTreatment` prop — when null/undefined,
 * the button is omitted entirely (preserves existing CDV gate behavior where
 * non-staff users see the history but cannot author new entries).
 */
export function TreatmentHistoryHeader({
  count,
  ac,
  acRgb,
  onPrintDoc,
  onShowTimeline,
  onCreateTreatment,
}) {
  return (
    <div className="px-[18px] py-3.5 bg-gradient-to-b from-red-500/[0.04] to-transparent
      border-b border-[var(--bd)] flex items-center gap-3 flex-wrap">
      {/* Header icon tile */}
      <div className="w-8 h-8 rounded-[9px] flex items-center justify-center
        bg-gradient-to-br from-red-500/15 to-red-500/5 border border-red-500/30 text-red-300">
        <Stethoscope size={14} aria-hidden="true" />
      </div>

      <h3 className="text-sm font-bold text-[var(--tx-heading)] tracking-tight">ประวัติการรักษา</h3>

      <span className="text-xs font-bold px-2 py-0.5 rounded-full font-mono
        bg-red-500/15 text-red-300 border border-red-500/30">
        {count}
      </span>

      {/* CTA cluster */}
      <div className="ml-auto flex gap-1.5 items-center">
        <button
          type="button"
          onClick={onPrintDoc}
          data-testid="print-document-btn"
          title="พิมพ์ใบรับรอง / ฉลากยา / เอกสารอื่นๆ"
          className="text-xs font-bold px-3.5 py-1.5 rounded-lg flex items-center gap-1.5
            bg-white/[0.02] text-[var(--tx-primary)] border border-[#333]
            hover:bg-violet-500/[0.05] hover:border-violet-400/50 hover:text-violet-300
            hover:-translate-y-px transition-all"
        >
          <Printer size={13} aria-hidden="true" /> พิมพ์เอกสาร
        </button>

        <button
          type="button"
          onClick={onShowTimeline}
          data-testid="show-timeline-btn"
          title="ดูไทม์ไลน์รวม (รูป Before/After/อื่นๆ)"
          className="text-xs font-bold px-3.5 py-1.5 rounded-lg flex items-center gap-1.5
            bg-white/[0.02] text-[var(--tx-primary)] border border-[#333]
            hover:bg-orange-500/[0.05] hover:border-orange-400/50 hover:text-orange-300
            hover:-translate-y-px transition-all"
        >
          <Activity size={13} aria-hidden="true" /> ดูไทม์ไลน์
        </button>

        {onCreateTreatment && (
          <button
            type="button"
            onClick={onCreateTreatment}
            data-testid="create-treatment-btn"
            title="สร้างใบบันทึกการรักษาใหม่"
            className="text-xs font-bold px-3.5 py-1.5 rounded-lg flex items-center gap-1.5
              bg-gradient-to-br from-red-500 to-red-700 text-white border border-white/10
              shadow-[0_0_0_1px_rgba(239,68,68,0.3),_0_2px_8px_rgba(239,68,68,0.4),inset_0_1px_0_rgba(255,255,255,0.15)]
              hover:from-red-400 hover:to-red-600
              hover:shadow-[0_0_0_1px_rgba(239,68,68,0.5),_0_6px_20px_rgba(239,68,68,0.55),inset_0_1px_0_rgba(255,255,255,0.2)]
              hover:-translate-y-px transition-all"
          >
            <Plus size={13} className="font-black" aria-hidden="true" /> บันทึกการรักษา
          </button>
        )}
      </div>
    </div>
  );
}
